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

export const fetchBalance = (installId?: string) => call<{ credits: number }>('/v1/me', { installId });

export const fetchProductInfo = (url: string) =>
  call<{ name: string; price: string; description: string; image: string; url: string }>('/v1/product', {
    method: 'POST',
    body: { url },
  });

export const generate = (p: ProductForm, template: string, tone: string, linkPlacement: LinkPlacement) =>
  call<{ patterns: Pattern[]; credits: number }>('/v1/generate', {
    method: 'POST',
    body: {
      product: { name: p.name, price: p.price, description: p.description, experience: p.experience },
      target: p.target,
      template,
      tone,
      linkPlacement,
    },
  });
