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
3. Stripe で Payment Link を2つ作成（30回 300円 / 100回 800円）
   - 支払い完了後の動作:「自分のウェブサイトにリダイレクト」→ デプロイ先の URL（例 `https://affi-post.<subdomain>.workers.dev/`）
   - `server/wrangler.toml` の `STRIPE_LINKS`（`jpy300:30,jpy800:100`）と金額を一致させる
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
- 販売単価: 300円/30回 = 10円/回、800円/100回 = 8円/回。Stripe 手数料 3.6% を引いても1回あたり原価を上回る

## 将来ストアアプリにする場合
- `npx eas-cli build` で iOS / Android をビルドできる（`EXPO_PUBLIC_API_BASE` に Worker の URL を設定）
- ストア配信版でデジタルの回数を売るには App Store / Google Play のアプリ内課金が必須（手数料 15〜30%）。価格の見直しと、`x-search-app` と同じ RevenueCat 連携が必要
