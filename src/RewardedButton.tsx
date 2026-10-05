import React, { useState } from 'react';
import { Text } from 'react-native';
import { useApp } from './AppContext';
import { ApiError, completeAd, startAd } from './api';
import { rewardedAvailable, showRewarded } from './ads';
import { Button, styles } from './ui';

/** 「広告を見て無料で1回分」ボタン。広告が使えない・今日の分を受け取り済みのときは案内だけ出す */
export default function RewardedButton() {
  const { ad, setBalance, refreshCredits, toast } = useApp();
  const [busy, setBusy] = useState(false);
  if (!rewardedAvailable() || !ad?.enabled) return null;

  if (ad.grantsLeftToday <= 0) {
    return <Text style={[styles.small, { marginTop: 8 }]}>今日の無料分は受け取り済みです。広告での追加は1日1回までです。</Text>;
  }

  const remaining = ad.viewsPerCredit - ad.viewsToward;
  const watch = async () => {
    setBusy(true);
    try {
      const { nonce } = await startAd();
      const result = await showRewarded();
      if (result === 'unavailable') return toast('今は表示できる広告がありません。時間をおいてお試しください。');
      if (result === 'closed') return toast('最後まで見ると無料分に数えられます。');
      const r = await completeAd(nonce);
      setBalance({ ad: r.ad });
      if (r.granted) {
        await refreshCredits();
        toast('無料で1回分を追加しました。');
      } else {
        toast(`あと${r.ad.viewsPerCredit - r.ad.viewsToward}本で無料の1回分になります。`);
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '広告を表示できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button title={`広告を見て無料で1回分（あと${remaining}本）`} kind="secondary" onPress={watch} loading={busy} />
      <Text style={[styles.small, { marginTop: 6 }]}>
        広告{ad.viewsPerCredit}本で、文章の作成1回分を無料で受け取れます（1日1回まで）。無料分は予約投稿には使えません。
      </Text>
    </>
  );
}
