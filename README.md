# アフィポ（Threads 向け商品紹介ポスト作成）

商品 URL を入れると、Threads 向けの商品紹介投稿を AI（Claude）が3パターン作成し、編集して Threads の投稿画面を開くまでをスマホだけで行う Web アプリ（PWA）。

## 構成

| 部分 | 技術 | 場所 |
|---|---|---|
| アプリ | Expo（React Native + TypeScript）。今は Web 書き出し（PWA）で配布。同じコードで将来 iOS / Android アプリにできる | ルート |
| サーバー | Cloudflare Workers + D1。アプリの配信、Claude API の呼び出し、回数管理、Stripe Webhook | `server/` |

- Claude API キーは Worker のシークレットにだけ置く。アプリには含めない
- 1回の作成（3パターン）で1回分を消費。無料枠なし。失敗時は回数を戻す
- 月間の API 費用が `MONTHLY_BUDGET_USD` に達したら生成を止める（赤字防止の最終ガード）
- Threads への通常の投稿は公式の Web インテント（`threads.com/intent/post`）で投稿画面を開くだけ
- 上級者向けの自動投稿（予約投稿、`server/src/autopost.ts`）は、利用者自身の Meta アプリで発行したトークンで Threads 公式 API から投稿する
  - 利用者が確認した投稿だけを予約できる（AI が生成して自動で流すことはしない）
  - 1日5件まで・前後60分以上あける・同じ文章は14日間不可・投稿時刻を0〜15分ランダムに遅らせる
  - 予約1件 = 1回分。取り消し・投稿失敗のときは戻す。「API access blocked」などの恒久エラーは再試行しない
  - トークンは AES-GCM で暗号化して D1 に保存し、Cron（5分ごと）で予約の実行と7日ごとのトークン延長を行う
- 広告（Web 版のみ、`src/ads.tsx` / `server/src/ads.ts`）
  - バナー: Google AdSense。作成画面以外の下と、生成結果の下に表示
  - リワード: Google Ad Manager。広告2本で無料1回分（文章作成のみ・予約投稿には使えない）、1端末1日1回・1IP1日3回まで
  - 無料回数で生成した原価が `FREE_MONTHLY_BUDGET_USD`（既定 $7 ≈ 1,000円）に達したら、その月は無料分を止める
  - 広告の ID（`EXPO_PUBLIC_ADSENSE_*` / `EXPO_PUBLIC_GAM_REWARDED_UNIT`）が未設定、またはサーバーの `AD_REWARD_ENABLED=0` なら何も表示しない
  - 本番 D1 には `migrations/0002_ads.sql` を一度だけ適用する（`npx wrangler d1 execute affi-post --remote --file=migrations/0002_ads.sql`）
- 履歴・テンプレート・下書きは端末内（localStorage）にのみ保存

## ローカル開発

```
npm install
cd server && npm install && npm run db:init:local && cd ..
```

`server/.dev.vars`（git 管理外）:
```
DEV_MODE=1        # 開発用の回数付与ボタンを有効化
MOCK_AI=1         # Claude を呼ばず固定文を返す（実際に試すときは消して ANTHROPIC_API_KEY を入れる）
ANTHROPIC_API_KEY=
STRIPE_WEBHOOK_SECRET=whsec_localtest
TOKEN_ENC_KEY=local-dev-key-0123456789
PUBLISH_WAIT_MS=0                         # 本番は未設定（公式推奨の30秒待つ）
THREADS_API_BASE=http://127.0.0.1:8799    # 自動投稿をテスト用の偽 API に向ける（本物で試すときは消す）
```
予約の実行は本番では Cron。ローカルでは `POST /v1/dev/cron`（DEV_MODE=1 のときだけ有効）で手動実行できる。

2つのターミナルで:
```
cd server && npx wrangler dev --port 8787
npx expo start --web --port 8081
```
`.env.development` の `EXPO_PUBLIC_API_BASE=http://localhost:8787` でアプリが Worker に接続する。

## 本番デプロイ（Cloudflare）

1. D1 を作成し、表示された `database_id` を `server/wrangler.toml` に記入
   ```
   cd server
   npx wrangler d1 create affi-post
   npm run db:init
   ```
2. シークレットを設定
   ```
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   npx wrangler secret put TOKEN_ENC_KEY      # 長いランダム文字列。変えると全員が Threads の再接続になる
   ```
3. Stripe で Payment Link を3つ作成（お試し10回 160円 / 定番50回 480円 / たっぷり120回 980円）
   - 支払い後は Stripe の確認ページのまま（iPhone ではホーム画面のアプリと Safari でデータが別なので、アプリへリダイレクトしない）
   - `server/wrangler.toml` の `STRIPE_LINKS` に各リンクの ID（`plink_...`）と回数を書く。Stripe アカウントは他アプリと共用のため、ID の一致しない決済は無視する
   - Webhook: イベント `checkout.session.completed`、送信先 `https://<デプロイ先>/v1/stripe`
4. `.env.production` の `EXPO_PUBLIC_WEB_PACKS` に Payment Link の URL を記入
5. ビルドしてデプロイ
   ```
   npx expo export -p web --clear   # --clear が無いと古い .env の値がキャッシュから使われることがある
   cd server && npm run deploy
   ```
6. `public/tokushoho.html`・`terms.html`・`privacy.html`・`guide.html` の【要記入】を埋めて、5 をやり直す
7. Anthropic Console の Limits で月間の利用上限も設定する（サーバーの予算上限との二重の安全策）

### 料金の目安（Claude Sonnet 5.5: 入力 $2 / 出力 $10 per 1M tokens）
- 1回の作成: 約 $0.01〜0.02（約2〜3円）。上限 `MAX_OUTPUT_TOKENS=3000` の最悪ケースでも約 $0.04（約6円）
- 販売単価: 160円/10回 = 16円、480円/50回 = 9.6円、980円/120回 = 8.2円。Stripe 手数料 3.6% を引いても1回あたり原価（約1.5円）を大きく上回る

## 将来ストアアプリにする場合
- `npx eas-cli build` で iOS / Android をビルドできる（`EXPO_PUBLIC_API_BASE` に Worker の URL を設定）
- ストア配信版でデジタルの回数を売るには App Store / Google Play のアプリ内課金が必須（手数料 15〜30%）。価格の見直しと、`x-search-app` と同じ RevenueCat 連携が必要

## 問い合わせ対応（購入した回数が反映されない・端末が変わった）
本番 D1 を直接操作する（`server` フォルダで実行）。

1. 購入を探す（メールアドレスで照合）
   ```
   npx wrangler d1 execute affi-post --remote --command "SELECT event_id, user_id, credits, datetime(at/1000,'unixepoch','+9 hours') AS jst FROM purchases WHERE email = 'メールアドレス'"
   npx wrangler d1 execute affi-post --remote --command "SELECT session_id, credits, datetime(at/1000,'unixepoch','+9 hours') AS jst, resolved_user FROM unmatched_payments WHERE email = 'メールアドレス'"
   ```
2. 端末IDのない支払い（unmatched_payments）を、利用者の今の引き継ぎコードに付与する
   ```
   npx wrangler d1 execute affi-post --remote --command "INSERT OR IGNORE INTO users (id, created_at) VALUES ('引き継ぎコード', 0); UPDATE users SET credits = credits + (SELECT credits FROM unmatched_payments WHERE session_id = 'cs_...' AND resolved_user IS NULL) WHERE id = '引き継ぎコード'; UPDATE unmatched_payments SET resolved_user = '引き継ぎコード' WHERE session_id = 'cs_...' AND resolved_user IS NULL"
   ```
3. 端末のデータが消えて元のコードが分からない場合は、1 で見つけた user_id の残り回数を新しいコードへ移す（本人のメールアドレスからの問い合わせであることを確認してから）
   ```
   npx wrangler d1 execute affi-post --remote --command "INSERT OR IGNORE INTO users (id, created_at) VALUES ('新しいコード', 0); UPDATE users SET credits = credits + (SELECT credits FROM users WHERE id = '古いコード') WHERE id = '新しいコード'; UPDATE users SET credits = 0 WHERE id = '古いコード'"
   ```

## 信頼性・悪用への対策（まとめ）
- 回数の付与は Stripe → サーバーの Webhook で行う。購入者が支払い後にオフラインになっても付与される。失敗時は Stripe が最大3日間再送し、同じ購入は二重に付与しない
- 生成は requestId ごとに結果を2日間保存。通信が切れても同じ requestId で再試行すれば回数を使わずに同じ結果を返す
- AI の出力は1回3,000トークンまで（無限に出力させられない）。入力欄は文字数上限あり。1回ごとに回数を消費、3秒の連続実行制限、月間 API 予算の上限
- 入力欄の内容は「素材」として扱い、ルール（誇張表現の禁止・事実を作らない等）を上書きさせない指示を AI に与えている
- 残り回数の確認だけではユーザー行を作らない。広告視聴の開始は1端末1日20回まで、Threads 接続の試行は1端末1日10回まで
- API をブラウザから呼べるのは ALLOWED_ORIGINS（https://affipo.kurashiapp.com）だけ。ローカル開発では .dev.vars に ALLOWED_ORIGINS=http://localhost:8081
- 全ページに安全用ヘッダー（public/_headers：埋め込み禁止・nosniff・HSTS など）。API の応答は no-store
- 商品ページの取得は IP 直指定・内部向けの名前・標準外ポート・自ドメインを拒否し、転送先も毎回確認する
- Stripe の署名は一定時間で比較する
- 無料分（広告）は1端末1日1回。ブラウザのデータを消すと別の端末扱いになるため、同じ IP アドレスからは1日3回までに制限
