export interface ProductForm {
  /** 商品ページ（またはアフィリエイトリンク）の URL */
  url: string;
  name: string;
  price: string;
  description: string;
  /** 自分の使用感・おすすめポイント（あれば体験談として書ける） */
  experience: string;
  /** 投稿に付けるアフィリエイトリンク */
  affiliateUrl: string;
  target: string;
}

export const emptyProduct: ProductForm = {
  url: '',
  name: '',
  price: '',
  description: '',
  experience: '',
  affiliateUrl: '',
  target: '',
};

export interface Template {
  id: string;
  name: string;
  instruction: string;
  /** 一覧で表示する絵文字 */
  emoji?: string;
  builtIn?: boolean;
}

export type LinkPlacement = 'body' | 'reply';
export type DisclosureStyle = 'prefix' | 'suffixPR' | 'suffixAd';

export interface Pattern {
  angle: string;
  body: string;
  reply: string;
  topic: string;
}

export interface Draft {
  text: string;
  reply: string;
  topic: string;
  link: string;
  productName: string;
  linkPlacement: LinkPlacement;
}

export interface HistoryItem extends Draft {
  id: string;
  at: number;
  favorite: boolean;
  /** Threads で投稿画面を開いたか（コピーのみなら false） */
  posted: boolean;
}

export interface AppSettings {
  disclosure: DisclosureStyle;
  linkPlacement: LinkPlacement;
  tone: string;
  templateId: string;
}

export const defaultSettings: AppSettings = {
  disclosure: 'prefix',
  linkPlacement: 'body',
  tone: 'カジュアル',
  templateId: 'review',
};
