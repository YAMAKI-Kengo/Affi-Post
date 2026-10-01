import { DisclosureStyle } from './types';

/** Threads の文字数（公式ドキュメント: 絵文字は UTF-8 のバイト数で数える。それ以外は1文字1） */
export function charCount(s: string) {
  let n = 0;
  for (const ch of s) n += /\p{Extended_Pictographic}/u.test(ch) ? new TextEncoder().encode(ch).length : 1;
  return n;
}

export const DISCLOSURE_LABEL: Record<DisclosureStyle, string> = {
  prefix: '先頭に【PR】',
  suffixPR: '末尾に #PR',
  suffixAd: '末尾に #広告',
};

/** 広告であることの表記（ステルスマーケティング規制への対応）を本文に付ける */
export function withDisclosure(body: string, style: DisclosureStyle) {
  const text = body.trim();
  if (style === 'prefix') return `【PR】${text}`;
  return `${text}\n\n${style === 'suffixPR' ? '#PR' : '#広告'}`;
}

export const hasDisclosure = (text: string) => /【PR】|#PR\b|#広告|\[PR\]|（PR）|\(PR\)|広告/i.test(text);

/**
 * 景品表示法・医薬品医療機器等法で問題になりやすい表現。
 * 機械的な目安なので、該当しても必ず違反というわけではない（根拠がある場合など）。
 */
const RISKY: { re: RegExp; reason: string }[] = [
  { re: /絶対|必ず|確実に|100\s*[%％]/, reason: '断定的な表現（根拠がなければ避ける）' },
  { re: /最安|日本一|世界一|業界一|No\.?\s*1|ナンバーワン|一番売れ/i, reason: '最上級表現（客観的な根拠が必要）' },
  { re: /誰でも|全員|みんな(が)?(痩せ|治|成功)/, reason: '誰にでも効果があるような表現' },
  { re: /治る|治った|完治|改善する|効く|効果がある/, reason: '効果効能の表現（医薬品等でない商品は不可）' },
  { re: /痩せる|やせる|脂肪(が|を)?燃焼|若返|シミが消え|しわが消え/, reason: '身体への効果をうたう表現' },
  { re: /稼げる|儲かる|不労所得|放置で/, reason: '収益を約束するような表現' },
  { re: /今だけ|本日限り|残りわずか|急いで/, reason: '急がせる表現（事実でなければ不可）' },
];

export function checkExpressions(text: string) {
  const hits: { word: string; reason: string }[] = [];
  for (const r of RISKY) {
    const m = text.match(r.re);
    if (m) hits.push({ word: m[0], reason: r.reason });
  }
  return hits;
}

const AFFILIATE_HOSTS = [
  'hb.afl.rakuten.co.jp',
  'a.r10.to',
  'amzn.to',
  'px.a8.net',
  'af.moshimo.com',
  'ck.jp.ap.valuecommerce.com',
  'click.linksynergy.com',
  'h.accesstrade.net',
];

/** URL がアフィリエイトリンクらしいか（そのまま投稿用リンクとして使えるか） */
export function looksLikeAffiliate(url: string) {
  try {
    const u = new URL(url);
    return AFFILIATE_HOSTS.includes(u.hostname) || (u.hostname.includes('amazon.') && u.searchParams.has('tag'));
  } catch {
    return false;
  }
}

export const isHttpUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());
