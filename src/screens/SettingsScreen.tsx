import React, { useEffect, useState } from 'react';
import { AppState, Linking, ScrollView, View, Pressable, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useApp } from '../AppContext';
import { fetchBalance } from '../api';
import { API_BASE, LEGAL_PAGES, WEB_PACKS } from '../config';
import { DISCLOSURE_LABEL } from '../compliance';
import { ID_RE, getInstallId, setInstallId } from '../storage';
import { DisclosureStyle } from '../types';
import { Button, Chip, Field, colors, styles, Text, Icon, Section } from '../ui';
import AutopostSettings from './AutopostSettings';
import RewardedButton from '../RewardedButton';
import { AdSlot } from '../ads';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function SettingsScreen() {
  const { credits, paidCredits, freeCredits, refreshCredits, settings, updateSettings, toast } = useApp();
  const [installId, setId] = useState('');
  const [restore, setRestore] = useState('');
  const [showRestore, setShowRestore] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    getInstallId().then(setId);
  }, []);

  // 決済ページから戻ってきたら残り回数を更新する（反映まで数秒かかることがある）
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (st) => {
      if (st !== 'active' || !waiting) return;
      const before = credits ?? 0;
      for (let i = 0; i < 8; i++) {
        const n = await refreshCredits();
        if (n !== null && n > before) {
          toast(`${n - before} 回分を追加しました。`);
          break;
        }
        await wait(1500);
      }
      setWaiting(false);
    });
    return () => sub.remove();
  }, [waiting, credits, refreshCredits, toast]);

  const buy = async (url: string) => {
    setWaiting(true);
    // 端末IDを付けて決済ページを開く。決済が完了するとサーバーがこのIDに回数を付与する
    await Linking.openURL(`${url}${url.includes('?') ? '&' : '?'}client_reference_id=${installId}`);
  };

  const applyRestore = async () => {
    const code = restore.trim().toLowerCase();
    if (!ID_RE.test(code)) return toast('引き継ぎコードの形式が正しくありません。');
    try {
      const b = await fetchBalance(code);
      await setInstallId(code);
      setId(code);
      setRestore('');
      setShowRestore(false);
      await refreshCredits();
      toast(`引き継ぎました（残り ${b.credits} 回）。`);
    } catch {
      toast('引き継ぎできませんでした。通信状況を確認してください。');
    }
  };

  const devGrant = async () => {
    await fetch(`${API_BASE}/v1/dev/grant`, { method: 'POST', headers: { 'x-install-id': installId } });
    await refreshCredits();
  };

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={ss.hero}>
        <View style={styles.row}>
          <Icon name="ticket" size={18} color="#fff" />
          <Text style={ss.heroLabel}>残り回数</Text>
        </View>
        <Text style={ss.heroNum}>
          {credits ?? '—'}
          <Text style={ss.heroUnit}> 回</Text>
        </Text>
        {freeCredits > 0 && (
          <Text style={ss.heroSub}>
            購入分 {paidCredits ?? 0} 回 ／ 無料分 {freeCredits} 回
          </Text>
        )}
        <Text style={ss.heroSub}>1回で投稿文が3パターンできます。失敗したときは減りません。</Text>
      </View>

      <Section icon="cart" title="回数を追加" subtitle="購入した回数に有効期限はありません。月額料金もかかりません。">
        {WEB_PACKS.length ? (
          <>
            <View style={ss.packs}>
              {WEB_PACKS.map((p, i) => {
                // "プラン名 回数 価格"（プラン名は省略可）
                const parts = p.label.split(/\s+/);
                const [name, count, price] = parts.length >= 3 ? parts : ['', parts[0], parts[1]];
                const n = Number((count ?? '').replace(/\D/g, ''));
                const yen = Number((price ?? '').replace(/\D/g, ''));
                // 3プランなら真ん中を「人気」、最後を「おトク」にする
                const popular = WEB_PACKS.length >= 3 && i === 1;
                const deal = WEB_PACKS.length >= 2 && i === WEB_PACKS.length - 1;
                return (
                  <Pressable key={p.url} onPress={() => buy(p.url)} style={[ss.pack, popular && ss.packBest]} accessibilityRole="button">
                    {popular ? <Text style={ss.badge}>人気</Text> : null}
                    <View style={{ flex: 1 }}>
                      <View style={styles.row}>
                        {name ? <Text style={ss.packName}>{name}</Text> : null}
                        {deal ? <Text style={ss.dealTag}>おトク</Text> : null}
                      </View>
                      <Text style={ss.packCount}>{count}</Text>
                      {n && yen ? <Text style={[styles.small, { fontSize: 12 }]}>1回あたり {Math.round((yen / n) * 10) / 10}円</Text> : null}
                    </View>
                    <View style={[ss.packBtn, !popular && { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.accent }]}>
                      <Text style={{ color: popular ? '#fff' : colors.accentDark, fontWeight: '700', fontSize: 16 }}>{price}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.small, { marginTop: 10, fontSize: 12 }]}>
              決済ページ（Stripe）が開きます。お支払い後にこの画面へ戻ると、回数が反映されます。
            </Text>
          </>
        ) : (
          <Text style={[styles.small, { marginTop: 8 }]}>現在、購入の受付を停止しています。</Text>
        )}
        <RewardedButton />
        {__DEV__ && <Button title="（開発用）10回付与" kind="ghost" small onPress={devGrant} style={{ marginTop: 8 }} />}
      </Section>

      <Section icon="megaphone" title="広告表記" subtitle="アフィリエイトの紹介投稿には、広告だと分かる表記が必要です（ステマ規制）。">
        <View style={[styles.chips, { marginTop: 12 }]}>
          {(Object.keys(DISCLOSURE_LABEL) as DisclosureStyle[]).map((k) => (
            <Chip key={k} label={DISCLOSURE_LABEL[k]} active={settings.disclosure === k} onPress={() => updateSettings({ disclosure: k })} />
          ))}
        </View>
        <Text style={[styles.small, { fontSize: 12 }]}>分かりやすい「先頭に【PR】」がおすすめです。</Text>
      </Section>

      <AutopostSettings />

      <Section icon="key" title="引き継ぎコード" subtitle="機種変更やブラウザを変えるときに使います。購入した回数はこのコードに記録されています。">
        <View style={ss.code}>
          <Text selectable style={{ fontSize: 13, letterSpacing: 0.3 }}>
            {installId}
          </Text>
        </View>
        <Text style={[styles.small, { fontSize: 12 }]}>人に教えないでください。スクリーンショットなどで控えておくと安心です。</Text>
        <View style={[styles.row, { gap: 8, marginTop: 10, flexWrap: 'wrap' }]}>
          <Button
            title="コピー"
            icon="copy-outline"
            small
            kind="secondary"
            onPress={async () => {
              await Clipboard.setStringAsync(installId);
              toast('引き継ぎコードをコピーしました。');
            }}
          />
          <Button title="別の端末から引き継ぐ" icon="swap-horizontal" small kind="secondary" onPress={() => setShowRestore(!showRestore)} />
        </View>
        {showRestore && (
          <>
            <Field
              style={{ marginTop: 12 }}
              value={restore}
              onChangeText={setRestore}
              placeholder="以前の端末の引き継ぎコード"
              autoCapitalize="none"
            />
            <Text style={[styles.small, { marginTop: 6, fontSize: 12 }]}>
              引き継ぐと、この端末の今のコード（残り {credits ?? 0} 回）は使えなくなります。必要なら先に控えてください。
            </Text>
            <Button title="引き継ぐ" onPress={applyRestore} />
          </>
        )}
      </Section>

      <Section icon="information-circle" title="このアプリについて">
        <View style={{ marginTop: 8 }}>
          {LEGAL_PAGES.map((p, i) => (
            <Pressable
              key={p.path}
              onPress={() => Linking.openURL(`${API_BASE}${p.path}`)}
              style={[ss.linkRow, i === LEGAL_PAGES.length - 1 && { borderBottomWidth: 0 }]}
              accessibilityRole="link"
            >
              <Text style={{ fontSize: 15 }}>{p.label}</Text>
              <Icon name="chevron-forward" size={18} color={colors.faint} />
            </Pressable>
          ))}
        </View>
        <Text style={[styles.small, { marginTop: 8, fontSize: 12 }]}>
          作成した文章・商品情報・履歴はこの端末の中にだけ保存されます。
        </Text>
      </Section>
      <AdSlot tab="settings" />
    </ScrollView>
  );
}

const ss = StyleSheet.create({
  hero: { backgroundColor: colors.accent, borderRadius: 24, padding: 20 },
  heroLabel: { color: '#fff', fontWeight: '700', marginLeft: 6 },
  heroNum: { color: '#fff', fontSize: 44, fontWeight: '700', marginTop: 4 },
  heroUnit: { color: '#fff', fontSize: 18, fontWeight: '700' },
  heroSub: { color: 'rgba(255,255,255,0.92)', fontSize: 13, marginTop: 4, lineHeight: 19 },
  packs: { gap: 12, marginTop: 16 },
  pack: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFFCFA',
  },
  packBest: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  badge: {
    position: 'absolute',
    top: -10,
    left: 14,
    backgroundColor: colors.accent,
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  packName: { fontSize: 13, fontWeight: '700', color: colors.sub },
  dealTag: { fontSize: 11, fontWeight: '700', color: colors.ok, backgroundColor: colors.okSoft, borderRadius: 8, paddingHorizontal: 6, marginLeft: 6, overflow: 'hidden' },
  packCount: { fontSize: 22, fontWeight: '700', marginTop: 2 },
  packBtn: { backgroundColor: colors.accent, borderRadius: 22, paddingVertical: 10, paddingHorizontal: 18, minWidth: 92, alignItems: 'center' },
  code: { backgroundColor: '#FAF4EF', borderRadius: 12, padding: 12, marginTop: 12, marginBottom: 6 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
