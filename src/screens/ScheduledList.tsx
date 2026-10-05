import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useApp } from '../AppContext';
import { ApiError, ScheduledPost, cancelScheduled, fetchSchedule } from '../api';
import { Button, Card, colors, formatDate, styles, Text, EmptyState } from '../ui';

const STATUS: Record<ScheduledPost['status'], { label: string; color: string }> = {
  scheduled: { label: '予約中', color: colors.highlight },
  publishing: { label: '投稿中', color: colors.highlight },
  published: { label: '投稿済み', color: colors.ok },
  failed: { label: '失敗', color: colors.danger },
  canceled: { label: '取り消し', color: colors.faint },
};

/** 履歴画面の「予約」：自動投稿の予約一覧（サーバーから取得） */
export default function ScheduledList() {
  const { refreshCredits, toast } = useApp();
  const [posts, setPosts] = useState<ScheduledPost[] | null>(null);

  const reload = useCallback(() => {
    fetchSchedule()
      .then((r) => setPosts(r.posts))
      .catch((e) => {
        setPosts([]);
        toast(e instanceof ApiError ? e.message : '予約を読み込めませんでした。');
      });
  }, [toast]);

  useEffect(reload, [reload]);

  const cancel = async (id: string) => {
    try {
      await cancelScheduled(id);
      await refreshCredits();
      toast('予約を取り消しました（回数を戻しました）。');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '取り消せませんでした。');
    }
    reload();
  };

  if (!posts) return <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />;
  if (!posts.length) {
    return (
      <EmptyState icon="calendar-outline" title="予約はありません" message="作成画面の「仕上げて投稿」から、日時を指定して予約できます。" />
    );
  }
  return (
    <View>
      <Button title="最新の状態に更新" small kind="secondary" onPress={reload} style={{ alignSelf: 'flex-start' }} />
      {posts.map((p) => (
        <Card key={p.id}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={{ fontWeight: '700', color: colors.text }}>{formatDate(p.scheduled_at)} 予定</Text>
            <Text style={{ fontWeight: '700', color: STATUS[p.status].color }}>{STATUS[p.status].label}</Text>
          </View>
          <Text style={{ marginTop: 8, color: colors.text, lineHeight: 21 }} numberOfLines={5}>
            {p.text}
          </Text>
          {p.link ? (
            <Text style={[styles.small, { marginTop: 4 }]} numberOfLines={1}>
              {p.link_placement === 'reply' ? 'リプにリンク: ' : 'リンク: '}
              {p.link}
            </Text>
          ) : null}
          {p.error ? <Text style={[styles.small, { marginTop: 6, color: p.status === 'failed' ? colors.danger : colors.warn }]}>{p.error}</Text> : null}
          {p.status === 'scheduled' && <Button title="予約を取り消す" small kind="secondary" onPress={() => cancel(p.id)} style={{ marginTop: 10, alignSelf: 'flex-start' }} />}
        </Card>
      ))}
    </View>
  );
}
