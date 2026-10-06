-- 利用者（端末ごとのランダムID。アカウント登録は不要。引き継ぎコードとして別端末に移せる）
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  credits INTEGER NOT NULL DEFAULT 0,
  free_credits INTEGER NOT NULL DEFAULT 0, -- 広告視聴で付与した無料回数
  last_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 購入履歴（Stripe Webhook の二重処理防止）
CREATE TABLE IF NOT EXISTS purchases (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  credits INTEGER NOT NULL,
  at INTEGER NOT NULL,
  email TEXT NOT NULL DEFAULT ''
);

-- 集計カウンタ（月間 API 費用、利用者ごとの日別の商品ページ取得回数）
CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

-- 自動投稿（予約投稿）用：利用者自身の Meta アプリで発行した Threads のアクセストークン（AES-GCM で暗号化して保存）
CREATE TABLE IF NOT EXISTS threads_accounts (
  user_id TEXT PRIMARY KEY,
  threads_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  token_enc TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  refreshed_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' -- active / reconnect（トークン失効などで再接続が必要）
);

-- 予約投稿。scheduled -> publishing -> published / failed / canceled
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  link_placement TEXT NOT NULL DEFAULT 'body',
  reply_text TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  text_hash TEXT NOT NULL,
  scheduled_at INTEGER NOT NULL, -- 利用者が指定した時刻
  run_at INTEGER NOT NULL,       -- 実際に投稿する時刻（指定時刻から数分ランダムに遅らせる）
  status TEXT NOT NULL DEFAULT 'scheduled',
  attempts INTEGER NOT NULL DEFAULT 0,
  threads_post_id TEXT,
  reply_post_id TEXT,
  error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sched_due ON scheduled_posts (status, run_at);
CREATE INDEX IF NOT EXISTS idx_sched_user ON scheduled_posts (user_id, scheduled_at);

-- リワード広告の視聴セッション（migrations/0002_ads.sql と同じ）
CREATE TABLE IF NOT EXISTS ad_sessions (
  nonce TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ad_sessions_started ON ad_sessions (started_at);


-- アフィポの Payment Link で支払われたが、端末IDが付いていなかった支払い（手作業で付与する）
CREATE TABLE IF NOT EXISTS unmatched_payments (
  session_id TEXT PRIMARY KEY,
  payment_link TEXT NOT NULL,
  credits INTEGER NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  client_reference_id TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL,
  resolved_user TEXT -- 手作業で付与した先の端末ID
);

-- 生成結果の一時保存（通信が切れても、同じ request_id で再試行すれば回数を使わずに結果を受け取れる）
CREATE TABLE IF NOT EXISTS generations (
  request_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '', -- 空 = 生成中
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_generations_created ON generations (created_at);
