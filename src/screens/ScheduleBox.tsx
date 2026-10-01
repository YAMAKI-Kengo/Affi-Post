import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useApp } from '../AppContext';
import { ApiError, schedulePost } from '../api';
import { THREADS_MAX_CHARS } from '../config';
import { charCount, hasDisclosure } from '../compliance';
import { Draft } from '../types';
import { Button, Card, Chip, Field, Label, colors, styles } from '../ui';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

function days() {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  return Array.from({ length: 8 }, (_, i) => {
    const d = new Date(base.getTime() + i * 86400000);
    const label = i === 0 ? '今日' : i === 1 ? '明日' : `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})`;
    return { label, date: d };
  });
}

function defaultTime() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:00`;
}

/** 編集中の投稿を、指定日時に自動投稿として予約する（上級者向け） */
export default function ScheduleBox({ draft, onScheduled }: { draft: Draft; onScheduled: () => void }) {
  const { account, setCredits, setTab, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [dayIndex, setDayIndex] = useState(0);
  const [time, setTime] = useState(defaultTime);
  const [busy, setBusy] = useState(false);
  const options = useMemo(days, [open]);

  if (!account?.connected || account.status !== 'active') return null;

  const submit = async () => {
    const m = time.trim().match(/^(\d{1,2})[:：](\d{2})$/);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return toast('時刻は 21:30 のように入力してください。');
    if (charCount(draft.text) > THREADS_MAX_CHARS) return toast(`Threads は1投稿 ${THREADS_MAX_CHARS} 文字までです。`);
    if (!hasDisclosure(draft.text)) return toast('広告であることの表記（【PR】など）を入れてください。');
    const at = new Date(options[dayIndex].date);
    at.setHours(Number(m[1]), Number(m[2]), 0, 0);
    setBusy(true);
    try {
      const r = await schedulePost({
        text: draft.text,
        link: draft.link,
        linkPlacement: draft.linkPlacement,
        reply: draft.reply,
        topic: draft.topic,
        scheduledAt: at.getTime(),
      });
      setCredits(r.credits);
      setOpen(false);
      onScheduled();
      toast(`${options[dayIndex].label} ${time} に予約しました。「履歴」の予約から確認・取り消しできます。`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '予約できませんでした。');
      if (e instanceof ApiError && e.code === 'no_credits') setTab('settings');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Text style={{ fontWeight: '800', color: colors.text }}>自動投稿（@{account.username}）</Text>
      <Text style={[styles.small, { marginTop: 2 }]}>
        指定した日時に、この内容のまま投稿します{draft.linkPlacement === 'reply' && draft.link ? '（リンクは自分の投稿へのリプとして自動で付けます）' : ''}。
      </Text>
      {open ? (
        <>
          <Label>日付</Label>
          <View style={styles.chips}>
            {options.map((o, i) => (
              <Chip key={o.label} label={o.label} active={dayIndex === i} onPress={() => setDayIndex(i)} />
            ))}
          </View>
          <Label hint="24時間表記">時刻</Label>
          <Field value={time} onChangeText={setTime} placeholder="21:30" keyboardType="numbers-and-punctuation" maxLength={5} />
          <Button title="この日時で予約する（1回分）" kind="highlight" onPress={submit} loading={busy} />
          <Text style={[styles.small, { marginTop: 6 }]}>
            投稿時刻は指定から最大15分ずれます。予約は投稿前ならいつでも取り消せ、取り消すと回数は戻ります。
          </Text>
        </>
      ) : (
        <Button title="日時を指定して自動投稿" kind="secondary" onPress={() => setOpen(true)} />
      )}
    </Card>
  );
}
