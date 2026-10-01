-- 利用者（端末ごとのランダムID。アカウント登録は不要。引き継ぎコードとして別端末に移せる）
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  credits INTEGER NOT NULL DEFAULT 0,
  last_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 購入履歴（Stripe Webhook の二重処理防止）
CREATE TABLE IF NOT EXISTS purchases (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  credits INTEGER NOT NULL,
  at INTEGER NOT NULL
);

-- 集計カウンタ（月間 API 費用、利用者ごとの日別の商品ページ取得回数）
CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
