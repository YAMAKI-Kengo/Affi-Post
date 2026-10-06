/**
 * API サーバーの URL。Web 版（PWA）は同じドメインの Worker が配信するので空でよい。
 * ローカル開発やネイティブ版では EXPO_PUBLIC_API_BASE に Worker の URL を設定する。
 */
export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE ?? '').replace(/\/$/, '');

/**
 * 回数パック（Stripe Payment Link）
 * 形式: "プラン名 回数 価格|URL" をカンマ区切り  例: "定番 50回 480円|https://buy.stripe.com/xxx"
 */
export const WEB_PACKS: { label: string; url: string }[] = String(process.env.EXPO_PUBLIC_WEB_PACKS ?? '')
  .split(',')
  .map((s: string) => s.split('|').map((x) => x.trim()))
  .filter(([label, url]) => label && url?.startsWith('https://'))
  .map(([label, url]) => ({ label, url }));

/** 特定商取引法に基づく表記・利用規約・プライバシーポリシー（public/ 配下の静的ページ） */
export const LEGAL_PAGES = [
  { label: '使い方', path: '/guide.html' },
  { label: '利用規約', path: '/terms.html' },
  { label: 'プライバシーポリシー', path: '/privacy.html' },
  { label: '特定商取引法に基づく表記', path: '/tokushoho.html' },
];

/** Threads の1投稿あたりの最大文字数 */
export const THREADS_MAX_CHARS = 500;

/**
 * 広告（Web 版のみ）。未設定なら広告は一切表示しない
 * - ADSENSE_CLIENT / ADSENSE_BANNER_SLOT: Google AdSense のパブリッシャー ID（ca-pub-...）とバナーの広告ユニット ID
 * - GAM_REWARDED_UNIT: Google Ad Manager のリワード広告ユニットのパス（例: /12345678/affipo_rewarded）
 */
export const ADSENSE_CLIENT = process.env.EXPO_PUBLIC_ADSENSE_CLIENT ?? '';
export const ADSENSE_BANNER_SLOT = process.env.EXPO_PUBLIC_ADSENSE_BANNER_SLOT ?? '';
export const GAM_REWARDED_UNIT = process.env.EXPO_PUBLIC_GAM_REWARDED_UNIT ?? '';
