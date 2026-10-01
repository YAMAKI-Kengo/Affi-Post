import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { AppSettings, HistoryItem, ProductForm, Template, defaultSettings, emptyProduct } from './types';

// 端末内（Web 版はブラウザの localStorage）にだけ保存する。サーバーには送らない
const K_INSTALL_ID = 'install_id';
const K_SETTINGS = 'settings_v1';
const K_HISTORY = 'history_v1';
const K_TEMPLATES = 'templates_v1';
const K_PRODUCT = 'product_draft_v1';
const MAX_HISTORY = 300;

export const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const writeJson = (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value));

let installIdPromise: Promise<string> | null = null;

/**
 * 端末ごとのランダムID。購入した回数はこのIDに紐づく（アカウント登録の代わり）。
 * 起動直後に複数の画面から同時に呼ばれても別々のIDを発行しないよう、1つの Promise を共有する。
 */
export function getInstallId(): Promise<string> {
  installIdPromise ??= (async () => {
    const existing = await AsyncStorage.getItem(K_INSTALL_ID);
    if (existing && ID_RE.test(existing)) return existing;
    const id = Crypto.randomUUID();
    await AsyncStorage.setItem(K_INSTALL_ID, id);
    return id;
  })();
  return installIdPromise;
}

/** 引き継ぎコード（別の端末の ID）を設定する */
export async function setInstallId(id: string) {
  const code = id.trim().toLowerCase();
  await AsyncStorage.setItem(K_INSTALL_ID, code);
  installIdPromise = Promise.resolve(code);
}

export const loadSettings = async (): Promise<AppSettings> => ({ ...defaultSettings, ...(await readJson(K_SETTINGS, {})) });
export const saveSettings = (s: AppSettings) => writeJson(K_SETTINGS, s);

export const loadProductDraft = async (): Promise<ProductForm> => ({ ...emptyProduct, ...(await readJson(K_PRODUCT, {})) });
export const saveProductDraft = (p: ProductForm) => writeJson(K_PRODUCT, p);

export const loadHistory = () => readJson<HistoryItem[]>(K_HISTORY, []);

export async function upsertHistory(item: HistoryItem) {
  const list = await loadHistory();
  const next = [item, ...list.filter((h) => h.id !== item.id)].slice(0, MAX_HISTORY);
  await writeJson(K_HISTORY, next);
  return next;
}

export async function removeHistory(id: string) {
  const next = (await loadHistory()).filter((h) => h.id !== id);
  await writeJson(K_HISTORY, next);
  return next;
}

export const BUILT_IN_TEMPLATES: Template[] = [
  {
    id: 'review',
    name: '体験レビュー',
    instruction: '使ってみた感想を中心に、良かった点と、人によっては気になる点も正直に書く',
    builtIn: true,
  },
  {
    id: 'problem',
    name: '悩み解決',
    instruction: '読者がよく抱える悩みから書き出し、この商品でどう楽になるかを具体的に書く',
    builtIn: true,
  },
  {
    id: 'howto',
    name: '使い方提案',
    instruction: '具体的な使用シーンや、意外な活用法を紹介する',
    builtIn: true,
  },
  {
    id: 'deal',
    name: 'お得情報',
    instruction: '価格やお得さに触れて紹介する。セール期間や割引率は入力された情報だけを使い、急がせる煽り文句は使わない',
    builtIn: true,
  },
  {
    id: 'compare',
    name: '選び方・比較',
    instruction: '同じジャンルの商品を選ぶときのポイントを示し、この商品がどんな人に合うかを書く',
    builtIn: true,
  },
];

export const loadCustomTemplates = () => readJson<Template[]>(K_TEMPLATES, []);
export const saveCustomTemplates = (list: Template[]) => writeJson(K_TEMPLATES, list);
