/**
 * リワード広告（広告を見たら無料で1回分）。
 *
 * ウェブのリワード広告（Google Ad Manager）には、視聴をサーバー側で検証する仕組みがない。
 * そのため不正な完了報告で無料回数を取られても赤字にならないよう、次の上限で守る:
 *   - 視聴の開始から AD_MIN_WATCH_SEC 秒以上たった完了報告だけを数える（1回きりの nonce）
 *   - AD_VIEWS_PER_CREDIT 本で1回分。1端末1日 AD_DAILY_GRANTS_PER_USER 回、1IP1日 AD_DAILY_GRANTS_PER_IP 回まで
 *   - 無料回数による生成の原価が FREE_MONTHLY_BUDGET_USD に達したら、その月は付与も無料回数での生成も止める
 */

export interface AdsEnv {
  DB: D1Database;
  /** "1" でリワード広告による無料回数を有効にする（Ad Manager の審査が通るまでは "0"） */
  AD_REWARD_ENABLED?: string;
  AD_VIEWS_PER_CREDIT?: string;
  AD_DAILY_GRANTS_PER_USER?: string;
  AD_DAILY_GRANTS_PER_IP?: string;
  AD_MIN_WATCH_SEC?: string;
  FREE_MONTHLY_BUDGET_USD?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
const fail = (status: number, code: string, message: string) => json({ error: code, message }, status);

const today = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // 日本時間の日付
export const freeCostKey = () => `freecost:${new Date().toISOString().slice(0, 7)}`;

function cfg(env: AdsEnv) {
  return {
    enabled: env.AD_REWARD_ENABLED === '1',
    viewsPerCredit: Math.max(1, Number(env.AD_VIEWS_PER_CREDIT) || 2),
    perUser: Number(env.AD_DAILY_GRANTS_PER_USER) || 1,
    perIp: Number(env.AD_DAILY_GRANTS_PER_IP) || 3,
    minWatchMs: (Number(env.AD_MIN_WATCH_SEC) || 10) * 1000,
    freeBudget: Math.round((Number(env.FREE_MONTHLY_BUDGET_USD) || 0) * 1_000_000),
  };
}

async function counter(env: AdsEnv, key: string) {
  const row = await env.DB.prepare('SELECT value FROM counters WHERE key = ?').bind(key).first<{ value: number }>();
  return row?.value ?? 0;
}

const addCounter = (env: AdsEnv, key: string, n: number) =>
  env.DB.prepare('INSERT INTO counters (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = value + excluded.value').bind(
    key,
    n,
  );

async function ipHash(req: Request) {
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`affipo:${ip}`));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 無料分の月間予算がまだ残っているか（無料回数での生成と、新たな付与の両方の判定に使う） */
export async function freeBudgetLeft(env: AdsEnv, reserveMicroUsd: number) {
  const c = cfg(env);
  // 予算ちょうどまで使い切った状態も「残りなし」とみなす
  return c.freeBudget > 0 && (await counter(env, freeCostKey())) + Math.max(reserveMicroUsd, 1) <= c.freeBudget;
}

/** /v1/me に含める広告の状態 */
export async function adStatus(env: AdsEnv, userId: string) {
  const c = cfg(env);
  const d = today();
  const views = await counter(env, `adview:${d}:${userId}`);
  const grants = await counter(env, `adgrant:${d}:${userId}`);
  return {
    enabled: c.enabled && (await freeBudgetLeft(env, 0)),
    viewsPerCredit: c.viewsPerCredit,
    viewsToward: views % c.viewsPerCredit,
    grantsLeftToday: Math.max(0, c.perUser - grants),
  };
}

export async function handleAdStart(req: Request, env: AdsEnv, userId: string) {
  const c = cfg(env);
  if (!c.enabled) return fail(404, 'disabled', '現在、広告での追加は行っていません。');
  if (!(await freeBudgetLeft(env, 0))) return fail(503, 'free_budget', '今月の無料分の提供は終了しました。来月またお試しください。');
  const d = today();
  if ((await counter(env, `adgrant:${d}:${userId}`)) >= c.perUser) {
    return fail(429, 'daily_cap', '今日の無料分は受け取り済みです。また明日お試しください。');
  }
  const ip = await ipHash(req);
  if ((await counter(env, `adgrant_ip:${d}:${ip}`)) >= c.perIp) {
    return fail(429, 'daily_cap', '今日の無料分は終了しました。また明日お試しください。');
  }
  // 視聴開始だけを大量に呼ばれて記録が溜まらないよう、1端末1日の回数に上限を設ける
  if ((await counter(env, `adstart:${d}:${userId}`)) >= 20) {
    return fail(429, 'daily_cap', '今日はこれ以上広告を表示できません。また明日お試しください。');
  }
  await addCounter(env, `adstart:${d}:${userId}`, 1).run();
  const nonce = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO ad_sessions (nonce, user_id, ip_hash, started_at) VALUES (?, ?, ?, ?)')
    .bind(nonce, userId, ip, Date.now())
    .run();
  return json({ nonce });
}

export async function handleAdComplete(req: Request, env: AdsEnv, userId: string) {
  const c = cfg(env);
  if (!c.enabled) return fail(404, 'disabled', '現在、広告での追加は行っていません。');
  const body = (await req.json().catch(() => null)) as any;
  const nonce = String(body?.nonce ?? '');
  const s = await env.DB.prepare('SELECT user_id, ip_hash, started_at, used FROM ad_sessions WHERE nonce = ?')
    .bind(nonce)
    .first<{ user_id: string; ip_hash: string; started_at: number; used: number }>();
  const elapsed = Date.now() - (s?.started_at ?? 0);
  if (!s || s.user_id !== userId || s.used || elapsed < c.minWatchMs || elapsed > 15 * 60 * 1000) {
    return fail(400, 'invalid', '広告の視聴を確認できませんでした。');
  }
  const mark = await env.DB.prepare('UPDATE ad_sessions SET used = 1 WHERE nonce = ? AND used = 0').bind(nonce).run();
  if (!mark.meta.changes) return fail(400, 'invalid', '広告の視聴を確認できませんでした。');

  const d = today();
  await addCounter(env, `adview:${d}:${userId}`, 1).run();
  const views = await counter(env, `adview:${d}:${userId}`);
  let granted = false;
  if (
    views % c.viewsPerCredit === 0 &&
    (await counter(env, `adgrant:${d}:${userId}`)) < c.perUser &&
    (await counter(env, `adgrant_ip:${d}:${s.ip_hash}`)) < c.perIp &&
    (await freeBudgetLeft(env, 0))
  ) {
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO users (id, created_at) VALUES (?, ?)').bind(userId, Date.now()),
      env.DB.prepare('UPDATE users SET free_credits = free_credits + 1 WHERE id = ?').bind(userId),
      addCounter(env, `adgrant:${d}:${userId}`, 1),
      addCounter(env, `adgrant_ip:${d}:${s.ip_hash}`, 1),
    ]);
    granted = true;
  }
  return json({ granted, ad: await adStatus(env, userId) });
}

/** 古い視聴セッションと日別カウンタの掃除（Cron から呼ぶ） */
export async function cleanupAds(env: AdsEnv) {
  const old = new Date(Date.now() - 3 * 24 * 3600 * 1000 + 9 * 3600 * 1000).toISOString().slice(0, 10);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM ad_sessions WHERE started_at < ?').bind(Date.now() - 24 * 3600 * 1000),
    env.DB.prepare(
      "DELETE FROM counters WHERE (key LIKE 'adview:%' OR key LIKE 'adgrant:%' OR key LIKE 'adgrant_ip:%' OR key LIKE 'adstart:%' OR key LIKE 'connect:%' OR key LIKE 'product:%') AND substr(key, instr(key, ':') + 1, 10) < ?",
    ).bind(old),
    // 生成結果の一時保存は2日で消す
    env.DB.prepare('DELETE FROM generations WHERE created_at < ?').bind(Date.now() - 2 * 24 * 3600 * 1000),
  ]);
}
