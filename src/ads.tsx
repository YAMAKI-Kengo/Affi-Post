/**
 * 広告（Web 版のみ）。
 * - BannerAd: Google AdSense のバナー
 * - showRewarded: Google Ad Manager（GPT）のリワード広告。利用者がボタンを押して同意したときだけ表示する
 * ID が未設定のビルドや Web 以外では何もしない。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View, ViewStyle } from 'react-native';
import { ADSENSE_BANNER_SLOT, ADSENSE_CLIENT, GAM_REWARDED_UNIT } from './config';
import { Tab, useApp } from './AppContext';
import { Text, colors } from './ui';

const isWeb = Platform.OS === 'web' && typeof document !== 'undefined';
const scripts = new Map<string, Promise<void>>();

function loadScript(src: string, attrs: Record<string, string> = {}) {
  if (!scripts.has(src)) {
    scripts.set(
      src,
      new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.async = true;
        el.src = src;
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        el.onload = () => resolve();
        el.onerror = () => {
          scripts.delete(src);
          reject(new Error('script load failed'));
        };
        document.head.appendChild(el);
      }),
    );
  }
  return scripts.get(src)!;
}

export const bannerAvailable = () => isWeb && !!ADSENSE_CLIENT && !!ADSENSE_BANNER_SLOT;
export const rewardedAvailable = () => isWeb && !!GAM_REWARDED_UNIT;

/**
 * AdSense の広告（レスポンシブ）。設定がなければ何も表示しない。
 * AdSense の管理画面で「自動広告 → アンカー広告」を有効にすると、画面下に固定される広告も
 * このスクリプト経由で表示される（タブバー付近に独自の固定バナーを置くと誤クリックを招くため、自前では置かない）。
 */
export function BannerAd({ onUnfilled }: { onUnfilled?: () => void } = {}) {
  const host = useRef<View>(null);
  useEffect(() => {
    if (!bannerAvailable()) return;
    const el = host.current as unknown as HTMLElement | null;
    if (!el || el.childElementCount) return;
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', ADSENSE_CLIENT);
    ins.setAttribute('data-ad-slot', ADSENSE_BANNER_SLOT);
    ins.setAttribute('data-ad-format', 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');
    // 開発中は AdSense のテストモード（収益・クリックの計測対象外）
    if (__DEV__) ins.setAttribute('data-adtest', 'on');
    el.appendChild(ins);
    // 配信する広告がなかったとき（data-ad-status="unfilled"）は、呼び出し元に知らせて枠ごと隠す
    const obs = new MutationObserver(() => {
      if (ins.getAttribute('data-ad-status') === 'unfilled') onUnfilled?.();
    });
    obs.observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });
    loadScript(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`, { crossorigin: 'anonymous' })
      .then(() => ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({}))
      .catch(() => onUnfilled?.());
    return () => obs.disconnect();
  }, [onUnfilled]);
  if (!bannerAvailable()) return null;
  return <View ref={host} style={{ width: '100%', alignItems: 'center' }} />;
}

/**
 * リワード広告を表示する。
 * 'granted' = 最後まで見て報酬条件を満たした / 'closed' = 途中で閉じた / 'unavailable' = 表示できる広告がない
 */
export function showRewarded(): Promise<'granted' | 'closed' | 'unavailable'> {
  if (!rewardedAvailable()) return Promise.resolve('unavailable');
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: 'granted' | 'closed' | 'unavailable', cleanup?: () => void) => {
      if (done) return;
      done = true;
      cleanup?.();
      resolve(r);
    };
    const w = window as any;
    w.googletag = w.googletag || { cmd: [] };
    loadScript('https://securepubads.g.doubleclick.net/tag/js/gpt.js').catch(() => finish('unavailable'));
    w.googletag.cmd.push(() => {
      const g = w.googletag;
      const slot = g.defineOutOfPageSlot(GAM_REWARDED_UNIT, g.enums.OutOfPageFormat.REWARDED);
      if (!slot) return finish('unavailable'); // この端末・ページではリワード広告に非対応
      slot.addService(g.pubads());
      let granted = false;
      const pub = g.pubads();
      // 広告が用意できないまま時間がたったら諦める（表示が始まったら解除し、閉じられるまで待つ）
      const timer = setTimeout(() => finish('unavailable', cleanup), 20000);
      const onReady = (e: any) => {
        if (e.slot !== slot) return;
        clearTimeout(timer);
        e.makeRewardedVisible();
      };
      const onGranted = (e: any) => e.slot === slot && (granted = true);
      const onClosed = (e: any) => e.slot === slot && finish(granted ? 'granted' : 'closed', cleanup);
      const onRendered = (e: any) => e.slot === slot && e.isEmpty && finish('unavailable', cleanup);
      const cleanup = () => {
        clearTimeout(timer);
        // 広告が付けた URL 末尾の #goog_rewarded を消しておく
        if (location.hash === '#goog_rewarded') history.replaceState(null, '', location.pathname + location.search);
        pub.removeEventListener('rewardedSlotReady', onReady);
        pub.removeEventListener('rewardedSlotGranted', onGranted);
        pub.removeEventListener('rewardedSlotClosed', onClosed);
        pub.removeEventListener('slotRenderEnded', onRendered);
        g.destroySlots([slot]);
      };
      pub.addEventListener('rewardedSlotReady', onReady);
      pub.addEventListener('rewardedSlotGranted', onGranted);
      pub.addEventListener('rewardedSlotClosed', onClosed);
      pub.addEventListener('slotRenderEnded', onRendered);
      g.enableServices();
      g.display(slot);
    });
  });
}

/**
 * 「広告」の表示付きの広告枠。コンテンツの区切りに置く。
 * 画面はすべてマウントしたまま表示を切り替えているので、非表示の画面（幅0）で広告を読み込まないよう、
 * 指定した画面が初めて表示されたときに読み込む。
 */
export function AdSlot({ tab, style }: { tab: Tab; style?: ViewStyle }) {
  const app = useApp();
  const [armed, setArmed] = useState(false);
  const [unfilled, setUnfilled] = useState(false);
  const hide = useCallback(() => setUnfilled(true), []);
  useEffect(() => {
    if (app.tab === tab) setArmed(true);
  }, [app.tab, tab]);
  if (!bannerAvailable() || !armed || unfilled) return null;
  return (
    <View style={[{ marginTop: 16, marginBottom: 4 }, style]}>
      <Text style={{ fontSize: 11, color: colors.faint, marginBottom: 4, marginLeft: 4 }}>広告</Text>
      <View style={{ backgroundColor: '#FFFDFB', borderRadius: 16, overflow: 'hidden' }}>
        <BannerAd onUnfilled={hide} />
      </View>
    </View>
  );
}
