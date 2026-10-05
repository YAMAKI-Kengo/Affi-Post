import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { useApp } from '../AppContext';
import { ApiError, connectThreads, disconnectThreads } from '../api';
import { API_BASE } from '../config';
import { Button, Field, Label, Pill, Section, colors, styles, Text } from '../ui';

/** 設定画面の「自動投稿（上級者向け）」：利用者自身の Meta アプリのトークンで Threads と接続する */
export default function AutopostSettings() {
  const { account, setAccount, refreshCredits, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const connect = async () => {
    if (!token.trim()) return toast('アクセストークンを貼り付けてください。');
    setBusy(true);
    try {
      const a = await connectThreads(token.trim(), secret.trim());
      setAccount(a);
      setToken('');
      setSecret('');
      setOpen(false);
      toast(`@${a.username} と接続しました。`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '接続できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    try {
      const r = await disconnectThreads();
      setAccount({ connected: false });
      setConfirm(false);
      await refreshCredits();
      toast(r.refunded ? `接続を解除しました（未投稿の予約 ${r.refunded} 件を取り消し、回数を戻しました）。` : '接続を解除しました。');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '解除できませんでした。');
    }
  };

  const expires = account?.expiresAt ? new Date(account.expiresAt) : null;

  return (
    <>
      <Section icon="time" title="自動投稿（予約投稿）">
        <View style={{ flexDirection: 'row', marginBottom: 4 }}>
          <Pill icon="rocket-outline" label="上級者向け" tone="warn" />
        </View>
        {account?.connected ? (
          <>
            <Text style={{ fontWeight: '800', color: colors.text }}>
              @{account.username}　{account.status === 'active' ? '接続中' : '再接続が必要です'}
            </Text>
            {account.status !== 'active' && (
              <Text style={[styles.small, { color: colors.danger, marginTop: 4 }]}>
                トークンの期限切れなどで接続が切れました。新しいアクセストークンで接続し直してください。
              </Text>
            )}
            {expires && account.status === 'active' && (
              <Text style={[styles.small, { marginTop: 4 }]}>
                トークンの期限: {expires.getFullYear()}/{expires.getMonth() + 1}/{expires.getDate()}（自動で延長されます）
              </Text>
            )}
          </>
        ) : (
          <Text style={styles.small}>
            確認済みの投稿を、指定した日時に自動で投稿できます（1件につき1回分）。ご自身で作成した Meta
            アプリのアクセストークンが必要です。
          </Text>
        )}

        <View style={[styles.row, { gap: 8, marginTop: 10, flexWrap: 'wrap' }]}>
          <Button title="設定方法を見る" small kind="secondary" onPress={() => Linking.openURL(`${API_BASE}/autopost-guide.html`)} />
          <Button
            title={account?.connected ? '接続し直す' : 'Threads と接続する'}
            small
            kind={account?.connected ? 'secondary' : 'primary'}
            onPress={() => setOpen(!open)}
          />
          {account?.connected &&
            (confirm ? (
              <Button title="本当に解除" small kind="danger" onPress={disconnect} />
            ) : (
              <Button title="接続を解除" small kind="secondary" onPress={() => setConfirm(true)} />
            ))}
        </View>

        {open && (
          <>
            <Label>アクセストークン</Label>
            <Field value={token} onChangeText={setToken} placeholder="THAA..." autoCapitalize="none" secureTextEntry />
            <Label hint="任意。短期トークンを60日間有効にするのに使い、保存しません">アプリシークレット</Label>
            <Field value={secret} onChangeText={setSecret} placeholder="Threads アプリシークレット" autoCapitalize="none" secureTextEntry />
            <Button title="接続する" onPress={connect} loading={busy} />
            <Text style={[styles.small, { marginTop: 8 }]}>
              アクセストークンは暗号化してサーバーに保存し、予約投稿とトークンの延長にだけ使います。接続を解除すると削除されます。
            </Text>
          </>
        )}
      {account?.connected && (
        <Text style={[styles.small, { marginTop: 6 }]}>
          スパム判定を避けるため、自動投稿は1日5件まで・前後の予約と60分以上あける・同じ文章は14日間使えない、という制限があります。投稿時刻は指定から最大15分ずれます。
        </Text>
      )}
      </Section>
    </>
  );
}
