import React from 'react';
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppProvider, Tab, useApp } from './src/AppContext';
import { Icon, IconName, Text, colors } from './src/ui';
import CreateScreen from './src/screens/CreateScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import TemplatesScreen from './src/screens/TemplatesScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const TABS: { key: Tab; label: string; icon: IconName; iconOn: IconName; title: string }[] = [
  { key: 'create', label: 'つくる', icon: 'create-outline', iconOn: 'create', title: 'アフィポ' },
  { key: 'history', label: '履歴', icon: 'time-outline', iconOn: 'time', title: '履歴・お気に入り' },
  { key: 'templates', label: 'テンプレ', icon: 'albums-outline', iconOn: 'albums', title: 'テンプレート' },
  { key: 'settings', label: '回数・設定', icon: 'settings-outline', iconOn: 'settings', title: '回数・設定' },
];

function Shell() {
  const { tab, setTab, credits } = useApp();
  const current = TABS.find((t) => t.key === tab)!;
  return (
    <SafeAreaView style={st.root} edges={['top', 'bottom']}>
      <View style={st.header}>
        <View style={st.brand}>
          {tab === 'create' ? <Image source={require('./assets/icon.png')} style={st.logo} /> : null}
          <Text style={st.headerTitle}>{current.title}</Text>
        </View>
        <Pressable onPress={() => setTab('settings')} style={st.badge} accessibilityRole="button" accessibilityLabel="残り回数">
          <Icon name="ticket" size={15} color={colors.accent} />
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
      <View style={st.tabBar}>
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <Pressable
              key={t.key}
              style={st.tabItem}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <View style={[st.tabIconWrap, on && { backgroundColor: colors.accentSoft }]}>
                <Icon name={on ? t.iconOn : t.icon} size={22} color={on ? colors.accent : colors.faint} />
              </View>
              <Text style={[st.tabLabel, on && { color: colors.accentDark, fontWeight: '700' }]}>{t.label}</Text>
            </Pressable>
          );
        })}
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
    height: 58,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
  },
  brand: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 30, height: 30, borderRadius: 9, marginRight: 8 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1.5,
    borderColor: colors.accentSoft,
  },
  badgeText: { color: colors.accentDark, fontWeight: '700', fontSize: 13, marginLeft: 5 },
  page: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  hidden: { display: 'none' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    paddingTop: 6,
    paddingBottom: 6,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 -2px 12px rgba(120, 72, 40, 0.06)' } as object) : { elevation: 8 }),
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  tabIconWrap: { width: 44, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 11, color: colors.faint, marginTop: 2 },
});
