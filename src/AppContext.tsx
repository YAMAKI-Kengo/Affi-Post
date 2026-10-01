import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { fetchBalance } from './api';
import { loadSettings, saveSettings } from './storage';
import { AppSettings, HistoryItem, defaultSettings } from './types';

export type Tab = 'create' | 'history' | 'templates' | 'settings';

interface Ctx {
  tab: Tab;
  setTab: (t: Tab) => void;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  credits: number | null;
  setCredits: (n: number) => void;
  refreshCredits: () => Promise<number | null>;
  /** 履歴から「作成」画面の編集欄に読み込む投稿 */
  reopen: HistoryItem | null;
  openInEditor: (item: HistoryItem | null) => void;
  toast: (message: string) => void;
}

const AppCtx = createContext<Ctx>(null as never);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>('create');
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [credits, setCredits] = useState<number | null>(null);
  const [reopen, setReopen] = useState<HistoryItem | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const refreshCredits = useCallback(async () => {
    try {
      const b = await fetchBalance();
      setCredits(b.credits);
      return b.credits;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    refreshCredits();
  }, [refreshCredits]);

  const toast = useCallback(
    (message: string) => {
      setToastMsg(message);
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: false }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: false }).start();
      }, 2600);
    },
    [opacity],
  );

  const openInEditor = useCallback((item: HistoryItem | null) => {
    setReopen(item);
    if (item) setTab('create');
  }, []);

  return (
    <AppCtx.Provider
      value={{ tab, setTab, settings, updateSettings, credits, setCredits, refreshCredits, reopen, openInEditor, toast }}
    >
      {children}
      <Animated.View pointerEvents="none" style={[st.toast, { opacity }]}>
        <Text style={st.toastText}>{toastMsg}</Text>
      </Animated.View>
    </AppCtx.Provider>
  );
}


const st = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 96,
    backgroundColor: 'rgba(22,22,26,0.94)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignSelf: 'center',
    maxWidth: 560,
  },
  toastText: { color: '#fff', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
