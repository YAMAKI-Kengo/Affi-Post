/**
 * 自動投稿（予約投稿）。上級者向け。
 *
 * - 利用者が確認・承認した投稿だけを、指定日時に Threads 公式 API で投稿する（AI が勝手に作って流すことはしない）
 * - 接続には利用者自身の Meta アプリで発行したアクセストークンを使う（販売者のアプリは使わない）
 * - スパム判定を避けるため、1日の件数・投稿間隔・同じ文面の再投稿を制限し、投稿時刻を数分ランダムに遅らせる
 * - 予約1件につき1回分を消費。取り消し・投稿失敗のときは戻す
 */
import { ThreadsApi, ThreadsError, decryptToken, encryptToken } from './threadsApi';

export interface AutopostEnv {
  DB: D1Database;
  TOKEN_ENC_KEY: string;
  /** テスト用に Threads API の接続先を差し替える（通常は未設定） */
  THREADS_API_BASE?: string;
  /** コンテナ作成から公開までの待ち時間（ミリ秒）。公式推奨は約30秒 */
  PUBLISH_WAIT_MS?: string;
}

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;
export const AUTOPOST_LIMITS = {
  perDay: 5,
  minGapMin: 60,
  minAheadMin: 5,
  maxAheadDays: 30,
  jitterMin: 15,
  maxAttempts: 3,
  duplicateDays: 14,
};

const DISCLOSURE_RE = /【PR】|#PR\b|#広告|\[PR\]|（PR）|\(PR\)|広告/i;

/** Threads の文字数（公式ドキュメント: 絵文字は UTF-8 のバイト数で数える） */
export function threadsLength(s: string) {
  let n = 0;
  for (const ch of s) n += /\p{Extended_Pictographic}/u.test(ch) ? new TextEncoder().encode(ch).length : 1;
  return n;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' },
  });
const fail = (status: number, code: string, message: string) => json({ error: code, message }, status);

const api = (env: AutopostEnv, token: string) => new ThreadsApi(token, env.THREADS_API_BASE ?? 'https://graph.threads.net');

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s.replace(/\s+/g, '')));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 日本時間の日の始まり（UTC ミリ秒） */
const jstDayStart = (t: number) => Math.floor((t + 9 * 3600 * 1000) / DAY) * DAY - 9 * 3600 * 1000;

const refund = (env: AutopostEnv, userId: string) =>
  env.DB.prepare('UPDATE users SET credits = credits + 1 WHERE id = ?').bind(userId);

// ---------------- 接続 ----------------

export async function handleAccount(env: AutopostEnv, userId: string) {
  const a = await env.DB.prepare('SELECT username, expires_at, status FROM threads_accounts WHERE user_id = ?')
    .bind(userId)
    .first<{ username: string; expires_at: number; status: string }>();
  return json(a ? { connected: true, username: a.username, expiresAt: a.expires_at, status: a.status } : { connected: false });
}

export async function handleConnect(req: Request, env: AutopostEnv, userId: string) {
  if (!env.TOKEN_ENC_KEY) return fail(503, 'disabled', '自動投稿は現在利用できません。');
  const body = (await req.json().catch(() => null)) as any;
  let token = String(body?.token ?? '').trim();
  const appSecret = String(body?.appSecret ?? '').trim();
  if (!/^[A-Za-z0-9_\-|.]{20,1000}$/.test(token)) return fail(400, 'bad_token', 'アクセストークンの形式が正しくありません。');

  let expiresAt = Date.now() + 60 * DAY;
  if (appSecret) {
    // 短期トークン（1時間）なら長期トークン（60日）に交換する。既に長期トークンならそのまま使う
    try {
      const ex = await api(env, token).exchange(appSecret);
      token = ex.access_token;
      expiresAt = Date.now() + ex.expires_in * 1000;
    } catch {
      // 交換できない場合（すでに長期トークン等）は、そのトークンで接続を試す
    }
  }

  let me: { id: string; username: string };
  try {
    me = await api(env, token).me();
  } catch (e) {
    return fail(400, 'invalid_token', `Threads に接続できませんでした。トークンを確認してください（${(e as Error).message}）`);
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO threads_accounts (user_id, threads_user_id, username, token_enc, expires_at, refreshed_at, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')
     ON CONFLICT(user_id) DO UPDATE SET threads_user_id = excluded.threads_user_id, username = excluded.username,
       token_enc = excluded.token_enc, expires_at = excluded.expires_at, refreshed_at = excluded.refreshed_at, status = 'active'`,
  )
    .bind(userId, me.id, me.username, await encryptToken(env.TOKEN_ENC_KEY, token), expiresAt, now)
    .run();
  return json({ connected: true, username: me.username, expiresAt, status: 'active' });
}

export async function handleDisconnect(env: AutopostEnv, userId: string) {
  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM scheduled_posts WHERE user_id = ? AND status = 'scheduled'")
    .bind(userId)
    .first<{ n: number }>();
  await env.DB.batch([
    env.DB.prepare("UPDATE scheduled_posts SET status = 'canceled', updated_at = ? WHERE user_id = ? AND status = 'scheduled'").bind(
      Date.now(),
      userId,
    ),
    env.DB.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').bind(pending?.n ?? 0, userId),
    env.DB.prepare('DELETE FROM threads_accounts WHERE user_id = ?').bind(userId),
  ]);
  return json({ connected: false, refunded: pending?.n ?? 0 });
}

// ---------------- 予約 ----------------

export async function handleList(env: AutopostEnv, userId: string) {
  const rows = await env.DB.prepare(
    `SELECT id, text, link, link_placement, reply_text, topic, scheduled_at, status, error, threads_post_id
     FROM scheduled_posts WHERE user_id = ? AND (status IN ('scheduled', 'publishing') OR scheduled_at > ?)
     ORDER BY scheduled_at DESC LIMIT 50`,
  )
    .bind(userId, Date.now() - 14 * DAY)
    .all();
  return json({ posts: rows.results, limits: AUTOPOST_LIMITS });
}

export async function handleSchedule(req: Request, env: AutopostEnv, userId: string) {
  const body = (await req.json().catch(() => null)) as any;
  const text = String(body?.text ?? '').trim();
  const link = String(body?.link ?? '').trim();
  const linkPlacement = body?.linkPlacement === 'reply' ? 'reply' : 'body';
  const replyText = String(body?.reply ?? '').trim().slice(0, 200);
  const topic = String(body?.topic ?? '').replace(/[\s.&#]/g, '').slice(0, 50);
  const scheduledAt = Number(body?.scheduledAt);
  const now = Date.now();
  const L = AUTOPOST_LIMITS;

  const account = await env.DB.prepare('SELECT status FROM threads_accounts WHERE user_id = ?').bind(userId).first<{ status: string }>();
  if (!account) return fail(400, 'not_connected', '先に「設定」で Threads と接続してください。');
  if (account.status !== 'active') return fail(400, 'reconnect', 'Threads との接続が切れています。「設定」から接続し直してください。');

  if (!text) return fail(400, 'bad_input', '本文が空です。');
  if (threadsLength(text) > 500) return fail(400, 'too_long', '本文が Threads の上限（500文字）を超えています。');
  if (!DISCLOSURE_RE.test(text)) return fail(400, 'no_disclosure', '広告であることの表記（【PR】など）を入れてください。');
  if (link && !/^https?:\/\/\S+$/i.test(link)) return fail(400, 'bad_link', 'リンクの形式が正しくありません。');
  if (!Number.isFinite(scheduledAt) || scheduledAt < now + L.minAheadMin * MIN || scheduledAt > now + L.maxAheadDays * DAY) {
    return fail(400, 'bad_time', `日時は${L.minAheadMin}分後〜${L.maxAheadDays}日後の間で指定してください。`);
  }

  // スパム判定を避けるための制限
  const dayStart = jstDayStart(scheduledAt);
  const sameDay = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM scheduled_posts WHERE user_id = ? AND status IN ('scheduled','publishing','published') AND scheduled_at >= ? AND scheduled_at < ?",
  )
    .bind(userId, dayStart, dayStart + DAY)
    .first<{ n: number }>();
  if ((sameDay?.n ?? 0) >= L.perDay) return fail(400, 'day_cap', `自動投稿は1日${L.perDay}件までです。別の日を指定してください。`);

  const near = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM scheduled_posts WHERE user_id = ? AND status IN ('scheduled','publishing','published') AND scheduled_at > ? AND scheduled_at < ?",
  )
    .bind(userId, scheduledAt - L.minGapMin * MIN, scheduledAt + L.minGapMin * MIN)
    .first<{ n: number }>();
  if ((near?.n ?? 0) > 0) return fail(400, 'too_close', `ほかの予約と${L.minGapMin}分以上あけてください。`);

  const hash = await sha256(text);
  const dup = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM scheduled_posts WHERE user_id = ? AND text_hash = ? AND status IN ('scheduled','publishing','published') AND created_at > ?",
  )
    .bind(userId, hash, now - L.duplicateDays * DAY)
    .first<{ n: number }>();
  if ((dup?.n ?? 0) > 0) return fail(400, 'duplicate', `同じ文章が${L.duplicateDays}日以内に予約・投稿されています。文章を変えてください。`);

  const r = await env.DB.prepare('UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0').bind(userId).run();
  if (!r.meta.changes) return fail(402, 'no_credits', '残り回数がありません。「回数を追加」から購入してください。');

  const id = crypto.randomUUID();
  const runAt = scheduledAt + Math.floor(Math.random() * L.jitterMin * MIN);
  await env.DB.prepare(
    `INSERT INTO scheduled_posts (id, user_id, text, link, link_placement, reply_text, topic, text_hash, scheduled_at, run_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, userId, text, link, linkPlacement, replyText, topic, hash, scheduledAt, runAt, now, now)
    .run();
  const credits = await env.DB.prepare('SELECT credits FROM users WHERE id = ?').bind(userId).first<{ credits: number }>();
  return json({ id, credits: credits?.credits ?? 0 });
}

export async function handleCancel(req: Request, env: AutopostEnv, userId: string) {
  const body = (await req.json().catch(() => null)) as any;
  const r = await env.DB.prepare(
    "UPDATE scheduled_posts SET status = 'canceled', updated_at = ? WHERE id = ? AND user_id = ? AND status = 'scheduled'",
  )
    .bind(Date.now(), String(body?.id ?? ''), userId)
    .run();
  if (!r.meta.changes) return fail(409, 'not_cancelable', 'この予約は取り消せません（投稿中・投稿済みの可能性があります）。');
  await refund(env, userId).run();
  return json({ ok: true });
}

// ---------------- 定期実行（Cron） ----------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface PostRow {
  id: string;
  user_id: string;
  text: string;
  link: string;
  link_placement: string;
  reply_text: string;
  topic: string;
  attempts: number;
}

async function publishOne(env: AutopostEnv, post: PostRow) {
  const now = Date.now();
  const claimed = await env.DB.prepare(
    "UPDATE scheduled_posts SET status = 'publishing', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'scheduled'",
  )
    .bind(now, post.id)
    .run();
  if (!claimed.meta.changes) return;
  const attempts = post.attempts + 1;
  const wait = Number(env.PUBLISH_WAIT_MS ?? 30000);

  const finishFailed = (msg: string) =>
    env.DB.batch([
      env.DB.prepare("UPDATE scheduled_posts SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").bind(msg, Date.now(), post.id),
      refund(env, post.user_id),
    ]);

  const account = await env.DB.prepare('SELECT threads_user_id, token_enc, status FROM threads_accounts WHERE user_id = ?')
    .bind(post.user_id)
    .first<{ threads_user_id: string; token_enc: string; status: string }>();
  if (!account || account.status !== 'active') {
    await finishFailed('Threads との接続が切れていたため投稿できませんでした（回数は戻しました）');
    return;
  }

  const client = api(env, await decryptToken(env.TOKEN_ENC_KEY, account.token_enc));
  let mainId: string;
  try {
    const c = await client.createTextContainer(account.threads_user_id, {
      text: post.text,
      link: post.link_placement === 'body' ? post.link || undefined : undefined,
      topic: post.topic || undefined,
    });
    await sleep(wait);
    mainId = (await client.publish(account.threads_user_id, c.id)).id;
  } catch (e) {
    const err = e instanceof ThreadsError ? e : new ThreadsError(String(e), false);
    if (err.reconnect) {
      await env.DB.prepare("UPDATE threads_accounts SET status = 'reconnect' WHERE user_id = ?").bind(post.user_id).run();
    }
    if (err.permanent || attempts >= AUTOPOST_LIMITS.maxAttempts) {
      await finishFailed(`投稿できませんでした（回数は戻しました）: ${err.message}`);
    } else {
      await env.DB.prepare("UPDATE scheduled_posts SET status = 'scheduled', run_at = ?, error = ?, updated_at = ? WHERE id = ?")
        .bind(Date.now() + 10 * MIN * attempts, `再試行します: ${err.message}`, Date.now(), post.id)
        .run();
    }
    return;
  }

  // 1件目は投稿済み。以降の失敗で再試行すると二重投稿になるので、ここで ID を記録する
  await env.DB.prepare("UPDATE scheduled_posts SET threads_post_id = ?, updated_at = ? WHERE id = ?").bind(mainId, Date.now(), post.id).run();

  let replyId: string | null = null;
  let note = '';
  if (post.link_placement === 'reply' && post.link) {
    try {
      const c = await client.createTextContainer(account.threads_user_id, {
        text: post.reply_text || '詳しくはこちら👇',
        link: post.link,
        replyTo: mainId,
      });
      await sleep(wait);
      replyId = (await client.publish(account.threads_user_id, c.id)).id;
    } catch (e) {
      note = `本文は投稿しましたが、リンク付きのリプを投稿できませんでした。手動でリプしてください: ${(e as Error).message}`;
    }
  }
  await env.DB.prepare("UPDATE scheduled_posts SET status = 'published', reply_post_id = ?, error = ?, updated_at = ? WHERE id = ?")
    .bind(replyId, note, Date.now(), post.id)
    .run();
}

async function refreshTokens(env: AutopostEnv) {
  const now = Date.now();
  const rows = await env.DB.prepare(
    "SELECT user_id, token_enc FROM threads_accounts WHERE status = 'active' AND refreshed_at < ? AND expires_at > ? LIMIT 50",
  )
    .bind(now - 7 * DAY, now)
    .all<{ user_id: string; token_enc: string }>();
  for (const a of rows.results) {
    try {
      const r = await api(env, await decryptToken(env.TOKEN_ENC_KEY, a.token_enc)).refresh();
      await env.DB.prepare('UPDATE threads_accounts SET token_enc = ?, expires_at = ?, refreshed_at = ? WHERE user_id = ?')
        .bind(await encryptToken(env.TOKEN_ENC_KEY, r.access_token), now + r.expires_in * 1000, now, a.user_id)
        .run();
    } catch (e) {
      if (e instanceof ThreadsError && e.reconnect) {
        await env.DB.prepare("UPDATE threads_accounts SET status = 'reconnect' WHERE user_id = ?").bind(a.user_id).run();
      }
      // それ以外（発行から24時間未満など）は次回に再挑戦
    }
  }
  // 期限切れのトークンは再接続待ちにする
  await env.DB.prepare("UPDATE threads_accounts SET status = 'reconnect' WHERE status = 'active' AND expires_at <= ?").bind(now).run();
}

export async function runAutopost(env: AutopostEnv) {
  if (!env.TOKEN_ENC_KEY) return;
  const now = Date.now();
  // 処理途中で止まった投稿は、二重投稿を避けるため再試行せず失敗扱いにする
  const stuck = await env.DB.prepare(
    "SELECT id, user_id, threads_post_id FROM scheduled_posts WHERE status = 'publishing' AND updated_at < ?",
  )
    .bind(now - 15 * MIN)
    .all<{ id: string; user_id: string; threads_post_id: string | null }>();
  for (const s of stuck.results) {
    if (s.threads_post_id) {
      await env.DB.prepare("UPDATE scheduled_posts SET status = 'published', updated_at = ? WHERE id = ?").bind(now, s.id).run();
    } else {
      await env.DB.batch([
        env.DB.prepare("UPDATE scheduled_posts SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").bind(
          '投稿処理が中断しました。Threads で投稿されているか確認してください（回数は戻しました）',
          now,
          s.id,
        ),
        refund(env, s.user_id),
      ]);
    }
  }

  const due = await env.DB.prepare(
    "SELECT id, user_id, text, link, link_placement, reply_text, topic, attempts FROM scheduled_posts WHERE status = 'scheduled' AND run_at <= ? ORDER BY run_at LIMIT 20",
  )
    .bind(now)
    .all<PostRow>();
  await Promise.allSettled(due.results.map((p) => publishOne(env, p)));

  await refreshTokens(env);
}
