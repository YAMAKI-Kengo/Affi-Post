/**
 * 広告（Web 版のみ）。
 * - BannerAd: Google AdSense のバナー
 * - showRewarded: Google Ad Manager（GPT）のリワード広告。利用者がボタンを押して同意したときだけ表示する
 * ID が未設定のビルドや Web 以外では何もしない。
 */
import React, { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import { ADSENSE_BANNER_SLOT, ADSENSE_CLIENT, GAM_REWARDED_UNIT } from './config';

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

/** AdSense のバナー（レスポンシブ）。設定がなければ何も表示しない */
export function BannerAd() {
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
    ins.setAttribute('data-ad-format', 'horizontal');
    ins.setAttribute('data-full-width-responsive', 'true');
    el.appendChild(ins);
    loadScript(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`, { crossorigin: 'anonymous' })
      .then(() => ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({}))
      .catch(() => {});
  }, []);
  if (!bannerAvailable()) return null;
  return <View ref={host} style={{ width: '100%', minHeight: 50, alignItems: 'center' }} />;
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
