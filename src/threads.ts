import { Linking } from 'react-native';

/**
 * Threads 公式の Web インテント（https://www.threads.com/intent/post）で投稿画面を開く。
 * 文章とリンクが入力された状態で開くだけで、投稿ボタンは利用者自身が押す（自動投稿はしない）。
 * API 連携やログイン情報の受け渡しは不要。
 */
export function threadsIntentUrl(text: string, link?: string, topic?: string) {
  const params = new URLSearchParams({ text });
  if (link) params.set('url', link);
  if (topic) params.set('tag', topic.slice(0, 50));
  return `https://www.threads.com/intent/post?${params.toString()}`;
}

export const openThreads = (text: string, link?: string, topic?: string) =>
  Linking.openURL(threadsIntentUrl(text, link, topic));
