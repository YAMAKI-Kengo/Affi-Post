import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useApp } from '../AppContext';
import { loadHistory, removeHistory, upsertHistory } from '../storage';
import { HistoryItem } from '../types';
import { Button, Card, Chip, colors, formatDate, styles } from '../ui';
import ScheduledList from './ScheduledList';

export default function HistoryScreen() {
  const { tab, openInEditor, toast, account } = useApp();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [mode, setMode] = useState<'all' | 'fav' | 'scheduled'>('all');
  const onlyFav = mode === 'fav';
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const reload = useCallback(() => loadHistory().then(setItems), []);
  useEffect(() => {
    if (tab === 'history') reload();
  }, [tab, reload]);

  const shown = mode === 'scheduled' ? [] : onlyFav ? items.filter((i) => i.favorite) : items;

  const toggleFav = async (item: HistoryItem) => setItems(await upsertHistory({ ...item, favorite: !item.favorite }));

  return (
    <FlatList
      contentContainerStyle={styles.screen}
      data={shown}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={
        <>
          <View style={styles.chips}>
            <Chip label={`すべて（${items.length}）`} active={mode === 'all'} onPress={() => setMode('all')} />
            <Chip label={`★ お気に入り（${items.filter((i) => i.favorite).length}）`} active={onlyFav} onPress={() => setMode('fav')} />
            {account?.connected && <Chip label="⏰ 予約" active={mode === 'scheduled'} onPress={() => setMode('scheduled')} />}
          </View>
          {mode === 'scheduled' && tab === 'history' && <ScheduledList />}
        </>
      }
      ListEmptyComponent={
        mode === 'scheduled' ? null : (
        <Text style={[styles.small, { textAlign: 'center', marginTop: 40 }]}>
          {onlyFav ? 'お気に入りはまだありません。' : 'Threads で開いた・コピーした投稿がここに残ります。'}
        </Text>
        )
      }
      renderItem={({ item }) => (
        <Card>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }} numberOfLines={1}>
              {item.productName || '（商品名なし）'}
            </Text>
            <Pressable onPress={() => toggleFav(item)} hitSlop={10} accessibilityLabel="お気に入り">
              <Text style={{ fontSize: 20, color: item.favorite ? colors.highlight : colors.faint }}>{item.favorite ? '★' : '☆'}</Text>
            </Pressable>
          </View>
          <Text style={[styles.small, { marginTop: 2 }]}>
            {formatDate(item.at)}　{item.posted ? 'Threads で開いた' : 'コピーのみ'}
          </Text>
          <Text style={{ marginTop: 8, color: colors.text, lineHeight: 21 }} numberOfLines={5}>
            {item.text}
          </Text>
          <View style={[styles.row, { gap: 8, marginTop: 10, flexWrap: 'wrap' }]}>
            <Button title="編集して使う" small onPress={() => openInEditor(item)} />
            <Button
              title="コピー"
              small
              kind="secondary"
              onPress={async () => {
                await Clipboard.setStringAsync(item.text);
                toast('本文をコピーしました。');
              }}
            />
            {confirmId === item.id ? (
              <Button
                title="本当に削除"
                small
                kind="danger"
                onPress={async () => {
                  setItems(await removeHistory(item.id));
                  setConfirmId(null);
                }}
              />
            ) : (
              <Button title="削除" small kind="secondary" onPress={() => setConfirmId(item.id)} />
            )}
          </View>
        </Card>
      )}
    />
  );
}
