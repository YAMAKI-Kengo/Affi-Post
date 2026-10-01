/**
 * 商品ページの URL から、ページが公開しているメタデータ（OGP・構造化データ）だけを読み取る。
 * SNS のリンクプレビューと同じ範囲の取得で、ログインが必要なページや本文の解析は行わない。
 * 取得できないサイト（ボット対策のある通販サイト等）は、利用者が手入力する。
 */

export interface ProductInfo {
  name: string;
  price: string;
  description: string;
  image: string;
  url: string;
}

const MAX_BYTES = 1_500_000;
// 楽天市場の商品ページは応答まで10秒前後かかることがある
const TIMEOUT_MS = 15000;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', yen: '¥' };

function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

const clean = (s: unknown, max: number) =>
  typeof s === 'string' ? decodeEntities(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

function meta(html: string, key: string) {
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${key}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return tag?.match(/content=["']([^"']*)["']/i)?.[1] ?? '';
}

function findProductLd(html: string): any {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      const nodes = (Array.isArray(data) ? data : [data]).flatMap((n: any) => (n?.['@graph'] ? n['@graph'] : [n]));
      const product = nodes.find((n: any) => [].concat(n?.['@type']).includes('Product' as never));
      if (product) return product;
    } catch {
      // 壊れた JSON-LD は無視する
    }
  }
  return null;
}

function formatPrice(amount: unknown, currency: unknown) {
  const n = Number(String(amount ?? '').replace(/[^\d.]/g, ''));
  if (!n) return '';
  return currency === 'JPY' || !currency ? `${Math.round(n).toLocaleString('ja-JP')}円` : `${n} ${currency}`;
}

async function readText(res: Response) {
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  const buf = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    buf.set(c.subarray(0, Math.min(c.length, size - off)), off);
    off += c.length;
  }
  const head = new TextDecoder('latin1').decode(buf.subarray(0, 4096));
  const charset = (
    res.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] ??
    head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
    'utf-8'
  ).toLowerCase();
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

export async function fetchProduct(rawUrl: string): Promise<ProductInfo | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; AffiPostLinkPreview/1.0)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'ja,en;q=0.5',
      },
    });
  } catch {
    return null;
  }
  if (!res.ok || !res.body || !(res.headers.get('content-type') ?? '').includes('html')) return null;
  const html = await readText(res);

  const ld = findProductLd(html);
  const offer = [].concat(ld?.offers ?? [])[0] as any;
  const name = clean(ld?.name, 200) || clean(meta(html, 'og:title'), 200) || clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 200);
  const description = clean(ld?.description, 1500) || clean(meta(html, 'og:description'), 1500) || clean(meta(html, 'description'), 1500);
  const price =
    formatPrice(offer?.price ?? offer?.lowPrice, offer?.priceCurrency) ||
    formatPrice(
      meta(html, 'product:price:amount') || meta(html, 'og:price:amount') || meta(html, 'price'),
      meta(html, 'product:price:currency') || meta(html, 'priceCurrency') || 'JPY',
    );
  const image: unknown = ([] as unknown[]).concat(ld?.image ?? [])[0] || meta(html, 'og:image');

  if (!name) return null;
  return {
    // 「【楽天市場】商品名：ショップ名」のようなサイト名の飾りを外す
    name: name.replace(/^【[^】]{1,12}】/, '').replace(/[：|｜]s*[^：|｜]{1,30}$/, '').trim() || name,
    price,
    description,
    image: typeof image === 'string' && image.startsWith('http') ? image : '',
    url: res.url || url.toString(),
  };
}
