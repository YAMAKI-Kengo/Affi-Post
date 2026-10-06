/**
 * アフィポ API（Cloudflare Workers）
 *
 * - 販売者の Claude API キーはこのサーバーのシークレットにのみ保存し、アプリには一切渡さない
 * - 利用者は端末ごとのランダムIDで識別し、1回の生成（3パターン）で1回分を消費する
 * - 無料で使えるのは、リワード広告の視聴で付与した無料回数だけ（ads.ts。無料分の月間予算で上限）
 * - 生成に失敗した場合は回数を戻す。月間の API 費用が上限（MONTHLY_BUDGET_USD）に達したら生成を止める
 * - 上級者向けの予約投稿（autopost.ts）は、利用者自身の Threads アクセストークンで公式 API から投稿する
 */
import { GenerateError, GenerateInput, generatePosts, worstCaseCost } from './generate';
import { fetchProduct } from './product';
import {
  AutopostEnv,
  handleAccount,
  handleCancel,
  handleConnect,
  handleDisconnect,
  handleList,
  handleSchedule,
  runAutopost,
} from './autopost';
import { AdsEnv, adStatus, cleanupAds, freeBudgetLeft, freeCostKey, handleAdComplete, handleAdStart } from './ads';

export interface Env extends AutopostEnv, AdsEnv {
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  MODEL: string;
  MAX_OUTPUT_TOKENS: string;
  MONTHLY_BUDGET_USD: string;
  /** Payment Link ID = 付与回数（例: "plink_xxx:10,plink_yyy:50"）。ここにない決済は無視する */
  STRIPE_LINKS?: string;
  /** Stripe Webhook の署名シークレット（whsec_...） */
  STRIPE_WEBHOOK_SECRET?: string;
  /** ローカル開発専用（.dev.vars に書く）。"1" で回数付与 API と、Claude を呼ばない固定応答を有効にする */
  DEV_MODE?: string;
  MOCK_AI?: string;
}

const MIN_INTERVAL_MS = 3000;
const PRODUCT_DAILY_CAP = 60;
const LIMITS = { name: 200, price: 50, description: 2000, experience: 1000, target: 100, template: 600, tone: 30 };

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-install-id',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS } });

const fail = (status: number, code: string, message: string) => json({ error: code, message }, status);

const monthKey = () => `cost:${new Date().toISOString().slice(0, 7)}`;
const productDayKey = (id: string) => `product:${new Date().toISOString().slice(0, 10)}:${id}`;

async function counter(env: Env, key: string) {
  const row = await env.DB.prepare('SELECT value FROM counters WHERE key = ?').bind(key).first<{ value: number }>();
  return row?.value ?? 0;
}

function addCounter(env: Env, key: string, n: number) {
  return env.DB.prepare(
    'INSERT INTO counters (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = value + excluded.value',
  ).bind(key, n);
}

async function getUser(env: Env, id: string) {
  await env.DB.prepare('INSERT OR IGNORE INTO users (id, created_at) VALUES (?, ?)').bind(id, Date.now()).run();
  return (await env.DB.prepare('SELECT credits, free_credits, last_at FROM users WHERE id = ?')
    .bind(id)
    .first<{ credits: number; free_credits: number; last_at: number }>())!;
}

function installId(req: Request) {
  const id = req.headers.get('x-install-id') ?? '';
  return ID_RE.test(id) ? id.toLowerCase() : null;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function handleMe(req: Request, env: Env) {
  const id = installId(req);
  if (!id) return fail(400, 'bad_install_id', '端末IDが不正です。');
  const u = await getUser(env, id);
  return json({ credits: u.credits, freeCredits: u.free_credits, ad: await adStatus(env, id) });
}

async function handleProduct(req: Request, env: Env) {
  const id = installId(req);
  if (!id) return fail(400, 'bad_install_id', '端末IDが不正です。');
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const url = str(body?.url, 2000);
  if (!/^https?:\/\//i.test(url)) return fail(400, 'bad_url', 'URL は http(s):// から入力してください。');

  // 商品ページの取得は回数を消費しないが、購入者のみ・1日の上限ありとする（踏み台としての悪用防止）
  const user = await getUser(env, id);
  if (user.credits + user.free_credits <= 0) return fail(402, 'no_credits', '商品情報の自動取得は、残り回数がある方のみ使えます。');
  if ((await counter(env, productDayKey(id))) >= PRODUCT_DAILY_CAP) {
    return fail(429, 'product_cap', '本日の自動取得の上限に達しました。商品情報を手入力してください。');
  }
  await addCounter(env, productDayKey(id), 1).run();

  const info = await fetchProduct(url);
  if (!info) return fail(422, 'not_found', 'このページからは商品情報を読み取れませんでした。お手数ですが手入力してください。');
  return json(info);
}

const MOCK_PATTERNS = (name: string, reply: boolean) =>
  ['共感', '使い方', '比較'].map((angle, i) => ({
    angle,
    body: `【テスト応答${i + 1}】${name}が気になってる。\n\nこれは開発用の固定文です。\n実際の生成ではここに紹介文が入ります。`,
    reply: reply ? '気になった人はここから見られるよ👇' : '',
    topic: 'おすすめ',
  }));

async function handleGenerate(req: Request, env: Env) {
  const id = installId(req);
  if (!id) return fail(400, 'bad_install_id', '端末IDが不正です。');

  const body = (await req.json().catch(() => null)) as any;
  const input: GenerateInput = {
    product: {
      name: str(body?.product?.name, LIMITS.name),
      price: str(body?.product?.price, LIMITS.price),
      description: str(body?.product?.description, LIMITS.description),
      experience: str(body?.product?.experience, LIMITS.experience),
    },
    target: str(body?.target, LIMITS.target),
    template: str(body?.template, LIMITS.template) || '商品の魅力が伝わる自然な紹介文',
    tone: str(body?.tone, LIMITS.tone) || 'カジュアル',
    linkPlacement: body?.linkPlacement === 'reply' ? 'reply' : 'body',
  };
  if (!input.product.name) return fail(400, 'bad_input', '商品名を入力してください。');

  const user = await getUser(env, id);
  const now = Date.now();
  if (now - user.last_at < MIN_INTERVAL_MS) return fail(429, 'too_fast', '少し時間をおいてからお試しください。');

  const maxTokens = Number(env.MAX_OUTPUT_TOKENS) || 3000;
  const budget = Math.round(Number(env.MONTHLY_BUDGET_USD) * 1_000_000);
  if ((await counter(env, monthKey())) + worstCaseCost(maxTokens) > budget) {
    return fail(503, 'budget_exceeded', '今月のサービス提供上限に達しました。ご迷惑をおかけしますが、来月までお待ちください（回数は減りません）。');
  }

  // 先に1回分を確保し、失敗したら戻す（同時リクエストでも残り回数を超えて使えない）。
  // 無料回数があり、無料分の月間予算が残っていれば無料回数から使う
  let col: 'free_credits' | 'credits' = 'credits';
  if (user.free_credits > 0 && (await freeBudgetLeft(env, worstCaseCost(maxTokens)))) {
    const f = await env.DB.prepare('UPDATE users SET free_credits = free_credits - 1, last_at = ? WHERE id = ? AND free_credits > 0')
      .bind(now, id)
      .run();
    if (f.meta.changes) col = 'free_credits';
  }
  if (col === 'credits') {
    const r = await env.DB.prepare('UPDATE users SET credits = credits - 1, last_at = ? WHERE id = ? AND credits > 0').bind(now, id).run();
    if (!r.meta.changes) {
      const msg = user.free_credits > 0
        ? '今月の無料分の提供上限に達しました。購入した回数でご利用ください。'
        : '残り回数がありません。「回数を追加」から購入するか、広告を見て無料分を受け取ってください。';
      return fail(402, 'no_credits', msg);
    }
  }
  const refund = () => env.DB.prepare(`UPDATE users SET ${col} = ${col} + 1 WHERE id = ?`).bind(id).run();
  const balance = async () => {
    const u = await getUser(env, id);
    return { credits: u.credits, freeCredits: u.free_credits };
  };
  const addCost = (cost: number) =>
    col === 'free_credits'
      ? env.DB.batch([addCounter(env, monthKey(), cost), addCounter(env, freeCostKey(), cost)])
      : addCounter(env, monthKey(), cost).run();

  if (env.MOCK_AI === '1') {
    return json({ patterns: MOCK_PATTERNS(input.product.name, input.linkPlacement === 'reply'), ...(await balance()) });
  }

  try {
    const { patterns, costMicroUsd } = await generatePosts(env.ANTHROPIC_API_KEY, env.MODEL, maxTokens, input);
    await addCost(costMicroUsd);
    return json({ patterns, ...(await balance()) });
  } catch (e) {
    await refund();
    const cost = (e as { costMicroUsd?: number }).costMicroUsd;
    if (cost) await addCost(cost);
    if (e instanceof GenerateError) return fail(e.status, e.code, e.message);
    throw e;
  }
}

const parseMap = (s = '') =>
  new Map(
    s
      .split(',')
      .filter(Boolean)
      .map((p) => {
        const [k, v] = p.split(':');
        return [k.trim(), Number(v)] as const;
      }),
  );

/** 購入イベントごとに1回だけ回数を付与する */
async function grantCredits(env: Env, eventId: string, userId: string, productId: string, credits: number) {
  await env.DB.prepare('INSERT OR IGNORE INTO users (id, created_at) VALUES (?, ?)').bind(userId, Date.now()).run();
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO purchases (event_id, user_id, product_id, credits, at) VALUES (?, ?, ?, ?, ?)')
    .bind(eventId, userId, productId, credits, Date.now())
    .run();
  if (ins.meta.changes) {
    await env.DB.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').bind(credits, userId).run();
  }
}

async function hmacHex(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Stripe Webhook：Payment Link での購入で回数を付与する。
 * アプリは Payment Link に client_reference_id=端末ID を付けて開くので、決済完了で自動的に反映される。
 */
async function handleStripe(req: Request, env: Env) {
  if (!env.STRIPE_WEBHOOK_SECRET) return fail(404, 'not_found', 'not found');
  const raw = await req.text();
  const header = req.headers.get('stripe-signature') ?? '';
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const t = Number(parts.t);
  const v1 = header
    .split(',')
    .filter((kv) => kv.startsWith('v1='))
    .map((kv) => kv.slice(3));
  if (!t || Math.abs(Date.now() / 1000 - t) > 300 || !v1.includes(await hmacHex(env.STRIPE_WEBHOOK_SECRET, `${t}.${raw}`))) {
    return fail(400, 'bad_signature', 'bad signature');
  }

  const ev = JSON.parse(raw);
  if (ev.type !== 'checkout.session.completed') return json({ ok: true, ignored: true });
  const session = ev.data?.object ?? {};
  const links = parseMap(env.STRIPE_LINKS);
  // 金額では判定しない（他のアプリの同じ金額の商品で回数が付与されるのを防ぐ）
  const credits = links.get(session.payment_link);
  const userId = String(session.client_reference_id ?? '').toLowerCase();
  if (session.payment_status !== 'paid' || !credits || !ID_RE.test(userId)) {
    console.error('stripe: not granted', session.id, session.payment_link, session.payment_status);
    return json({ ok: true, ignored: true });
  }
  await grantCredits(env, session.id, userId, session.payment_link ?? '', credits);
  return json({ ok: true });
}

/** 端末IDが必要な自動投稿系 API の共通処理 */
async function withUser(req: Request, env: Env, fn: (id: string) => Promise<Response>) {
  const id = installId(req);
  if (!id) return fail(400, 'bad_install_id', '端末IDが不正です。');
  await getUser(env, id);
  return fn(id);
}

/** ローカル開発専用：回数を付与する */
async function handleDevGrant(req: Request, env: Env) {
  const id = installId(req);
  if (env.DEV_MODE !== '1' || !id) return fail(404, 'not_found', 'not found');
  await grantCredits(env, `dev-${crypto.randomUUID()}`, id, 'dev', 10);
  return handleMe(req, env);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      if (req.method === 'GET' && pathname === '/v1/me') return await handleMe(req, env);
      if (req.method === 'POST' && pathname === '/v1/product') return await handleProduct(req, env);
      if (req.method === 'POST' && pathname === '/v1/generate') return await handleGenerate(req, env);
      if (req.method === 'POST' && pathname === '/v1/stripe') return await handleStripe(req, env);
      if (req.method === 'GET' && pathname === '/v1/threads/account') return await withUser(req, env, (id) => handleAccount(env, id));
      if (req.method === 'POST' && pathname === '/v1/threads/connect') return await withUser(req, env, (id) => handleConnect(req, env, id));
      if (req.method === 'POST' && pathname === '/v1/threads/disconnect') return await withUser(req, env, (id) => handleDisconnect(env, id));
      if (req.method === 'GET' && pathname === '/v1/schedule') return await withUser(req, env, (id) => handleList(env, id));
      if (req.method === 'POST' && pathname === '/v1/schedule') return await withUser(req, env, (id) => handleSchedule(req, env, id));
      if (req.method === 'POST' && pathname === '/v1/schedule/cancel') return await withUser(req, env, (id) => handleCancel(req, env, id));
      if (req.method === 'POST' && pathname === '/v1/ads/start') return await withUser(req, env, (id) => handleAdStart(req, env, id));
      if (req.method === 'POST' && pathname === '/v1/ads/complete') return await withUser(req, env, (id) => handleAdComplete(req, env, id));
      if (req.method === 'POST' && pathname === '/v1/dev/grant') return await handleDevGrant(req, env);
      if (req.method === 'POST' && pathname === '/v1/dev/cron' && env.DEV_MODE === '1') {
        await runAutopost(env);
        return json({ ok: true });
      }
      return fail(404, 'not_found', 'not found');
    } catch (e) {
      console.error(e);
      return fail(500, 'internal', 'サーバーエラーが発生しました。');
    }
  },

  // 予約投稿の実行とトークン更新（5分ごと）
  async scheduled(_: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runAutopost(env));
    if (new Date().getUTCHours() === 18 && new Date().getUTCMinutes() < 5) ctx.waitUntil(cleanupAds(env)); // 日本時間3時ごろ
  },
};
