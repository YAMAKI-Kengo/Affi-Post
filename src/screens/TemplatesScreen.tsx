import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useApp } from '../AppContext';
import { BUILT_IN_TEMPLATES, loadCustomTemplates, saveCustomTemplates } from '../storage';
import { Template } from '../types';
import { AdSlot } from '../ads';
import { Button, Card, Field, Label, colors, styles, Text, Pill } from '../ui';

const MAX_TEMPLATES = 20;

export default function TemplatesScreen() {
  const { settings, updateSettings, setTab, toast } = useApp();
  const [custom, setCustom] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);

  useEffect(() => {
    loadCustomTemplates().then(setCustom);
  }, []);

  const persist = (list: Template[]) => {
    setCustom(list);
    saveCustomTemplates(list);
  };

  const submit = () => {
    if (!editing) return;
    const name = editing.name.trim();
    const instruction = editing.instruction.trim();
    if (!name || !instruction) return toast('名前と書き方の指示を入力してください。');
    const exists = custom.some((t) => t.id === editing.id);
    persist(exists ? custom.map((t) => (t.id === editing.id ? { ...editing, name, instruction } : t)) : [...custom, { ...editing, name, instruction }]);
    setEditing(null);
    toast('テンプレートを保存しました。');
  };

  const use = (t: Template) => {
    updateSettings({ templateId: t.id });
    setTab('create');
  };

  const row = (t: Template) => (
    <Card key={t.id} style={t.id === settings.templateId ? { borderColor: colors.highlight, borderWidth: 2 } : undefined}>
      <View style={styles.row}>
        <Text style={{ fontSize: 22, marginRight: 8 }}>{t.emoji ?? '✏️'}</Text>
        <Text style={{ fontWeight: '700', fontSize: 16, flex: 1 }}>{t.name}</Text>
        {t.id === settings.templateId ? <Pill icon="checkmark-circle" label="選択中" tone="ok" /> : null}
      </View>
      <Text style={[styles.small, { marginTop: 6 }]}>{t.instruction}</Text>
      <View style={[styles.row, { gap: 8, marginTop: 10 }]}>
        <Button title="これで作る" icon="sparkles" small onPress={() => use(t)} />
        {!t.builtIn && (
          <>
            <Button title="編集" small kind="secondary" onPress={() => setEditing(t)} />
            <Button
              title="削除"
              small
              kind="secondary"
              onPress={() => {
                persist(custom.filter((x) => x.id !== t.id));
                if (settings.templateId === t.id) updateSettings({ templateId: BUILT_IN_TEMPLATES[0].id });
              }}
            />
          </>
        )}
      </View>
    </Card>
  );

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={styles.small}>
        よく使う書き方を保存しておけます。「作成」画面のテンプレートから選ぶと、その指示に沿って投稿文が作られます。
      </Text>

      {editing ? (
        <Card>
          <Label>名前</Label>
          <Field value={editing.name} onChangeText={(name) => setEditing({ ...editing, name })} placeholder="例: 朝の時短ネタ" maxLength={20} />
          <Label hint="AI への指示">書き方</Label>
          <Field
            multiline
            value={editing.instruction}
            onChangeText={(instruction) => setEditing({ ...editing, instruction })}
            placeholder="例: 朝の忙しい時間に役立つ場面から書き始め、最後に一言でまとめる"
            maxLength={300}
          />
          <View style={[styles.row, { gap: 8 }]}>
            <Button title="保存" style={{ flex: 1 }} onPress={submit} />
            <Button title="やめる" kind="secondary" style={{ flex: 1 }} onPress={() => setEditing(null)} />
          </View>
        </Card>
      ) : (
        <Button
          title="テンプレートを追加"
          icon="add-circle-outline"
          kind="secondary"
          disabled={custom.length >= MAX_TEMPLATES}
          onPress={() => setEditing({ id: `c${Date.now()}`, name: '', instruction: '' })}
        />
      )}

      {custom.length > 0 && <Label>あなたのテンプレート</Label>}
      {custom.map(row)}
      <Label>標準テンプレート</Label>
      {BUILT_IN_TEMPLATES.map(row)}
      <AdSlot tab="templates" />
    </ScrollView>
  );
}
