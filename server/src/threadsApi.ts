/**
 * Threads 公式 API（graph.threads.net）の最小クライアントと、アクセストークンの暗号化。
 * 投稿は「コンテナ作成 → 公開」の2段階。公式ドキュメントの推奨に従い、作成から公開まで待ち時間を置く。
 */

export class ThreadsError extends Error {
  constructor(
    message: string,
    /** 再試行しても直らない（トークン失効・権限不足・アクセスブロック・内容の不備など） */
    public permanent: boolean,
    /** トークンが無効で、利用者の再接続が必要 */
    public reconnect = false,
  ) {
    super(message);
  }
}

// Graph API のエラーコード: 190 トークン無効, 10/200-299 権限不足・アクセスブロック
const RECONNECT_CODES = new Set([190]);
const PERMANENT_CODES = new Set([10, 190, ...Array.from({ length: 100 }, (_, i) => 200 + i)]);

export class ThreadsApi {
  constructor(
    private token: string,
    private base = 'https://graph.threads.net',
  ) {}

  private async call<T>(method: 'GET' | 'POST', path: string, params: Record<string, string>): Promise<T> {
    const body = new URLSearchParams({ ...params, access_token: this.token });
    let res: Response;
    try {
      res =
        method === 'GET'
          ? await fetch(`${this.base}${path}?${body}`)
          : await fetch(`${this.base}${path}`, { method, body });
    } catch {
      throw new ThreadsError('Threads に接続できませんでした', false);
    }
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || data?.error) {
      const code = Number(data?.error?.code);
      const msg = `${res.status} ${data?.error?.message ?? 'unknown error'}`;
      // 4xx でコードが不明なもの（内容の不備など）も再試行しない。5xx・429 は一時的なものとして再試行
      const permanent = PERMANENT_CODES.has(code) || (res.status >= 400 && res.status < 500 && res.status !== 429);
      throw new ThreadsError(msg, permanent, RECONNECT_CODES.has(code));
    }
    return data as T;
  }

  me() {
    return this.call<{ id: string; username: string }>('GET', '/v1.0/me', { fields: 'id,username' });
  }

  /** 短期トークンを60日間の長期トークンに交換する（利用者のアプリシークレットが必要。シークレットは保存しない） */
  exchange(appSecret: string) {
    return this.call<{ access_token: string; expires_in: number }>('GET', '/access_token', {
      grant_type: 'th_exchange_token',
      client_secret: appSecret,
    });
  }

  /** 長期トークンを更新する（発行から24時間以上・期限内のトークンのみ。シークレット不要） */
  refresh() {
    return this.call<{ access_token: string; expires_in: number }>('GET', '/refresh_access_token', {
      grant_type: 'th_refresh_token',
    });
  }

  createTextContainer(userId: string, p: { text: string; link?: string; topic?: string; replyTo?: string }) {
    const params: Record<string, string> = { media_type: 'TEXT', text: p.text };
    if (p.link) params.link_attachment = p.link;
    if (p.topic) params.topic_tag = p.topic;
    if (p.replyTo) params.reply_to_id = p.replyTo;
    return this.call<{ id: string }>('POST', `/v1.0/${userId}/threads`, params);
  }

  publish(userId: string, creationId: string) {
    return this.call<{ id: string }>('POST', `/v1.0/${userId}/threads_publish`, { creation_id: creationId });
  }
}

// ---- アクセストークンの暗号化（AES-GCM。鍵は Worker のシークレット TOKEN_ENC_KEY） ----

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function aesKey(secret: string) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptToken(secret: string, token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), new TextEncoder().encode(token));
  return `${b64(iv)}.${b64(enc)}`;
}

export async function decryptToken(secret: string, value: string) {
  const [iv, data] = value.split('.');
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(secret), unb64(data));
  return new TextDecoder().decode(dec);
}
