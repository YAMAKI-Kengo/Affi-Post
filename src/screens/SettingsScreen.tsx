import React, { useEffect, useState } from 'react';
import { AppState, Linking, ScrollView, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useApp } from '../AppContext';
import { fetchBalance } from '../api';
import { API_BASE, LEGAL_PAGES, WEB_PACKS } from '../config';
import { DISCLOSURE_LABEL } from '../compliance';
import { ID_RE, getInstallId, setInstallId } from '../storage';
import { DisclosureStyle } from '../types';
import { Button, Card, Chip, Field, Label, colors, styles } from '../ui';
import AutopostSettings from './AutopostSettings';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function SettingsScreen() {
  const { credits, refreshCredits, settings, updateSettings, toast } = useApp();
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
      <Card style={{ marginTop: 0 }}>
        <Text style={styles.small}>残り回数</Text>
        <Text style={{ fontSize: 32, fontWeight: '800', color: colors.text }}>{credits ?? '—'} 回</Text>
        <Text style={[styles.small, { marginTop: 4 }]}>
          1回の作成で投稿文を3パターン作れます。作成に失敗したときは消費されません。購入した回数に有効期限はありません。
        </Text>
      </Card>

      <Label>回数を追加</Label>
      {WEB_PACKS.length ? (
        <>
          {WEB_PACKS.map((p) => (
            <Button key={p.url} title={p.label} kind="highlight" onPress={() => buy(p.url)} />
          ))}
          <Text style={[styles.small, { marginTop: 8 }]}>
            決済ページ（Stripe）が開きます。お支払い完了後にこの画面へ戻ると、回数が反映されます。
          </Text>
        </>
      ) : (
        <Text style={styles.small}>現在、購入の受付を停止しています。</Text>
      )}
      {__DEV__ && <Button title="（開発用）10回付与" kind="secondary" onPress={devGrant} />}

      <Label>広告表記</Label>
      <View style={styles.chips}>
        {(Object.keys(DISCLOSURE_LABEL) as DisclosureStyle[]).map((k) => (
          <Chip key={k} label={DISCLOSURE_LABEL[k]} active={settings.disclosure === k} onPress={() => updateSettings({ disclosure: k })} />
        ))}
      </View>
      <Text style={styles.small}>
        アフィリエイトの紹介投稿には、広告であることが分かる表記が必要です（ステルスマーケティング規制）。分かりやすい先頭の【PR】がおすすめです。
      </Text>

      <AutopostSettings />

      <Label hint="機種変更やブラウザを変えるときに使います">引き継ぎコード</Label>
      <Card style={{ marginTop: 0 }}>
        <Text selectable style={{ fontFamily: 'monospace', color: colors.text, fontSize: 13 }}>
          {installId}
        </Text>
        <Text style={[styles.small, { marginTop: 6 }]}>
          購入した回数はこのコードに記録されています。人に教えないでください。スクリーンショットなどで控えておくと、別の端末でも使えます。
        </Text>
        <View style={[styles.row, { gap: 8, marginTop: 10 }]}>
          <Button
            title="コピー"
            small
            kind="secondary"
            onPress={async () => {
              await Clipboard.setStringAsync(installId);
              toast('引き継ぎコードをコピーしました。');
            }}
          />
          <Button title="別の端末から引き継ぐ" small kind="secondary" onPress={() => setShowRestore(!showRestore)} />
        </View>
        {showRestore && (
          <>
            <Field
              style={{ marginTop: 10 }}
              value={restore}
              onChangeText={setRestore}
              placeholder="以前の端末の引き継ぎコード"
              autoCapitalize="none"
            />
            <Text style={[styles.small, { marginTop: 6 }]}>
              引き継ぐと、この端末の今のコード（残り {credits ?? 0} 回）は使えなくなります。必要なら先に控えてください。
            </Text>
            <Button title="引き継ぐ" onPress={applyRestore} />
          </>
        )}
      </Card>

      <Label>このアプリについて</Label>
      <View style={styles.chips}>
        {LEGAL_PAGES.map((p) => (
          <Chip key={p.path} label={p.label} active={false} onPress={() => Linking.openURL(`${API_BASE}${p.path}`)} />
        ))}
      </View>
      <Text style={[styles.small, { marginTop: 8 }]}>
        作成した文章や商品情報、履歴はこの端末の中にだけ保存されます。通常の投稿は Threads の公式の投稿画面から、ご自身で行います。
      </Text>
    </ScrollView>
  );
}
