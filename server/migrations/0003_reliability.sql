-- 購入時のメールアドレス（端末のデータが消えたときに、本人確認して回数を移すため）
ALTER TABLE purchases ADD COLUMN email TEXT NOT NULL DEFAULT '';

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
