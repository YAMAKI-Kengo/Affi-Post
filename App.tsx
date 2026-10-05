import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppProvider, Tab, useApp } from './src/AppContext';
import { colors } from './src/ui';
import CreateScreen from './src/screens/CreateScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import TemplatesScreen from './src/screens/TemplatesScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { BannerAd } from './src/ads';

const TABS: { key: Tab; label: string; icon: string; title: string }[] = [
  { key: 'create', label: '作成', icon: '✎', title: 'アフィポ' },
  { key: 'history', label: '履歴', icon: '↺', title: '履歴・お気に入り' },
  { key: 'templates', label: 'テンプレ', icon: '▤', title: 'テンプレート' },
  { key: 'settings', label: '設定', icon: '⚙', title: '回数・設定' },
];

function Shell() {
  const { tab, setTab, credits } = useApp();
  const current = TABS.find((t) => t.key === tab)!;
  return (
    <SafeAreaView style={st.root} edges={['top', 'bottom']}>
      <View style={st.header}>
        <Text style={st.headerTitle}>{current.title}</Text>
        <Pressable onPress={() => setTab('settings')} style={st.badge} accessibilityRole="button">
          <Text style={st.badgeText}>残り {credits ?? '—'} 回</Text>
        </Pressable>
      </View>
      {/* 画面を切り替えても入力途中の内容が消えないよう、全画面をマウントしたまま表示だけ切り替える */}
      <View style={{ flex: 1 }}>
        <View style={[st.page, tab !== 'create' && st.hidden]}>
          <CreateScreen />
        </View>
        <View style={[st.page, tab !== 'history' && st.hidden]}>
          <HistoryScreen />
        </View>
        <View style={[st.page, tab !== 'templates' && st.hidden]}>
          <TemplatesScreen />
        </View>
        <View style={[st.page, tab !== 'settings' && st.hidden]}>
          <SettingsScreen />
        </View>
      </View>
      {/* バナー広告は入力の邪魔にならないよう、作成画面以外の下にだけ出す（広告の設定がなければ何も出ない） */}
      {tab !== 'create' && <BannerAd key={tab} />}
      <View style={st.tabBar}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            style={st.tabItem}
            onPress={() => setTab(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.key }}
          >
            <Text style={[st.tabIcon, tab === t.key && { color: colors.text }]}>{t.icon}</Text>
            <Text style={[st.tabLabel, tab === t.key && { color: colors.text, fontWeight: '700' }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Shell />
      </AppProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    height: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  badge: { backgroundColor: colors.highlightBg, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  badgeText: { color: colors.highlight, fontWeight: '700', fontSize: 13 },
  page: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  hidden: { display: 'none' },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    paddingTop: 6,
    paddingBottom: 4,
  },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 2, minHeight: 48, justifyContent: 'center' },
  tabIcon: { fontSize: 20, color: colors.faint },
  tabLabel: { fontSize: 11, color: colors.faint, marginTop: 2 },
});
