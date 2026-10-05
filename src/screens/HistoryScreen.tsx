import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useApp } from '../AppContext';
import { loadHistory, removeHistory, upsertHistory } from '../storage';
import { HistoryItem } from '../types';
import { Button, Card, Chip, EmptyState, Icon, Pill, Text, colors, formatDate, styles } from '../ui';
import ScheduledList from './ScheduledList';
import { AdSlot } from '../ads';

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
            <Chip icon="❤️" label={`お気に入り（${items.filter((i) => i.favorite).length}）`} active={onlyFav} onPress={() => setMode('fav')} />
            {account?.connected && <Chip icon="⏰" label="予約" active={mode === 'scheduled'} onPress={() => setMode('scheduled')} />}
          </View>
          {mode === 'scheduled' && tab === 'history' && <ScheduledList />}
        </>
      }
      ListEmptyComponent={
        mode === 'scheduled' ? null : (
        onlyFav ? (
          <EmptyState icon="heart-outline" title="お気に入りはまだありません" message="気に入った投稿文は、作成画面の「お気に入り」で保存できます。" />
        ) : (
          <EmptyState icon="document-text-outline" title="まだ履歴はありません" message="Threads で開いたり、コピーしたりした投稿文がここに残ります。あとから編集して使い回せます。" />
        )
        )
      }
      renderItem={({ item, index }) => (
        <>
        <Card>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }} numberOfLines={1}>
              {item.productName || '（商品名なし）'}
            </Text>
            <Pressable onPress={() => toggleFav(item)} hitSlop={10} accessibilityLabel="お気に入り">
              <Icon name={item.favorite ? 'heart' : 'heart-outline'} size={22} color={item.favorite ? colors.accent : colors.faint} />
            </Pressable>
          </View>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            <Pill icon="calendar-outline" label={formatDate(item.at)} />
            <Pill icon={item.posted ? 'paper-plane' : 'copy-outline'} label={item.posted ? 'Threads で開いた' : 'コピーのみ'} tone={item.posted ? 'ok' : 'neutral'} />
          </View>
          <Text style={{ marginTop: 10, lineHeight: 22 }} numberOfLines={5}>
            {item.text}
          </Text>
          <View style={[styles.row, { gap: 8, marginTop: 10, flexWrap: 'wrap' }]}>
            <Button title="編集して使う" icon="create-outline" small onPress={() => openInEditor(item)} />
            <Button
              title="コピー"
              icon="copy-outline"
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
              <Button title="削除" icon="trash-outline" small kind="ghost" onPress={() => setConfirmId(item.id)} />
            )}
          </View>
        </Card>
        {index % 5 === 4 && <AdSlot tab="history" />}
        </>
      )}
    />
  );
}
