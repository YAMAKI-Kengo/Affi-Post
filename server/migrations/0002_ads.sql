-- 広告視聴で付与する無料回数（購入した回数とは別に管理し、無料分の月間予算で上限をかける）
ALTER TABLE users ADD COLUMN free_credits INTEGER NOT NULL DEFAULT 0;

-- リワード広告の視聴セッション（開始から一定時間たってからの完了報告だけを有効にする）
CREATE TABLE IF NOT EXISTS ad_sessions (
  nonce TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ad_sessions_started ON ad_sessions (started_at);
