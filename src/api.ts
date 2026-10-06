import { API_BASE } from './config';
import { getInstallId } from './storage';
import { LinkPlacement, Pattern, ProductForm } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public code = '',
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: { method?: string; body?: unknown; installId?: string }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        'x-install-id': init?.installId ?? (await getInstallId()),
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError('通信できませんでした。電波の良い場所でもう一度お試しください。', 'network');
  }
  const data = (await res.json().catch(() => null)) as any;
  if (!res.ok) throw new ApiError(data?.message ?? `エラーが発生しました（${res.status}）`, data?.error ?? String(res.status));
  return data as T;
}

export interface AdStatus {
  enabled: boolean;
  viewsPerCredit: number;
  /** 次の1回分までに見た本数 */
  viewsToward: number;
  grantsLeftToday: number;
}

export interface Balance {
  /** 購入した回数 */
  credits: number;
  /** 広告視聴で受け取った無料回数（文章の作成にだけ使える） */
  freeCredits: number;
  ad?: AdStatus;
}

export const fetchBalance = (installId?: string) => call<Balance>('/v1/me', { installId });

export const startAd = () => call<{ nonce: string }>('/v1/ads/start', { method: 'POST' });
export const completeAd = (nonce: string) =>
  call<{ granted: boolean; ad: AdStatus }>('/v1/ads/complete', { method: 'POST', body: { nonce } });

export const fetchProductInfo = (url: string) =>
  call<{ name: string; price: string; description: string; image: string; url: string }>('/v1/product', {
    method: 'POST',
    body: { url },
  });

export interface GenerateRequest {
  product: { name: string; price: string; description: string; experience: string };
  target: string;
  template: string;
  tone: string;
  linkPlacement: LinkPlacement;
}

export const buildGenerateRequest = (
  p: ProductForm,
  template: string,
  tone: string,
  linkPlacement: LinkPlacement,
): GenerateRequest => ({
  product: { name: p.name, price: p.price, description: p.description, experience: p.experience },
  target: p.target,
  template,
  tone,
  linkPlacement,
});

/**
 * 投稿文を作る。requestId は1回の作成ごとの番号で、通信が切れたときに同じ番号で送り直すと、
 * サーバーは回数を使わずに保存済みの結果を返す。
 */
export const generate = (req: GenerateRequest, requestId: string) =>
  call<{ patterns: Pattern[]; credits: number; freeCredits: number; recovered?: boolean }>('/v1/generate', {
    method: 'POST',
    body: { ...req, requestId },
  });

// ---- 自動投稿（予約投稿・上級者向け） ----

export interface ThreadsAccount {
  connected: boolean;
  username?: string;
  expiresAt?: number;
  /** active / reconnect（トークン失効などで再接続が必要） */
  status?: string;
}

export interface ScheduledPost {
  id: string;
  text: string;
  link: string;
  link_placement: string;
  reply_text: string;
  topic: string;
  scheduled_at: number;
  status: 'scheduled' | 'publishing' | 'published' | 'failed' | 'canceled';
  error: string;
  threads_post_id: string | null;
}

export const fetchThreadsAccount = () => call<ThreadsAccount>('/v1/threads/account');

export const connectThreads = (token: string, appSecret: string) =>
  call<ThreadsAccount>('/v1/threads/connect', { method: 'POST', body: { token, appSecret } });

export const disconnectThreads = () => call<{ connected: false; refunded: number }>('/v1/threads/disconnect', { method: 'POST' });

export const fetchSchedule = () => call<{ posts: ScheduledPost[] }>('/v1/schedule');

export const schedulePost = (p: {
  text: string;
  link: string;
  linkPlacement: LinkPlacement;
  reply: string;
  topic: string;
  scheduledAt: number;
}) => call<{ id: string; credits: number }>('/v1/schedule', { method: 'POST', body: p });

export const cancelScheduled = (id: string) => call<{ ok: true }>('/v1/schedule/cancel', { method: 'POST', body: { id } });
