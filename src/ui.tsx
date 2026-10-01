import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';

export const colors = {
  bg: '#f6f6f4',
  card: '#ffffff',
  text: '#16161a',
  sub: '#5f6368',
  faint: '#9aa0a6',
  border: '#e2e2de',
  accent: '#16161a',
  highlight: '#6d4aff',
  highlightBg: '#f0ecff',
  ok: '#1e8e3e',
  warn: '#b06000',
  warnBg: '#fff4e5',
  danger: '#d93025',
};

export function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{children}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Field(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.faint}
      autoCorrect={false}
      {...props}
      style={[styles.input, props.multiline && { minHeight: 88, textAlignVertical: 'top' }, props.style]}
    />
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  loading,
  small,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'highlight' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: ViewStyle;
}) {
  const fg = kind === 'secondary' ? colors.text : kind === 'danger' ? colors.danger : '#fff';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        kind === 'primary' && { backgroundColor: colors.accent },
        kind === 'highlight' && { backgroundColor: colors.highlight },
        (kind === 'secondary' || kind === 'danger') && {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: kind === 'danger' ? colors.danger : colors.border,
        },
        (pressed || disabled) && { opacity: 0.55 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.btnText, small && { fontSize: 14 }, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <View style={styles.stepRow}>
      <Text style={styles.stepNum}>{n}</Text>
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
  );
}

export function formatDate(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const styles = StyleSheet.create({
  screen: { padding: 16, paddingBottom: 48, maxWidth: 640, width: '100%', alignSelf: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 14, marginBottom: 6, flexWrap: 'wrap' },
  label: { fontSize: 13, color: colors.text, fontWeight: '700' },
  hint: { fontSize: 12, color: colors.faint, marginLeft: 8 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    color: colors.text,
  },
  btn: { borderRadius: 24, minHeight: 48, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  btnSmall: { minHeight: 38, paddingHorizontal: 14, marginTop: 0, borderRadius: 19 },
  btnText: { fontSize: 16, fontWeight: '700' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 14, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginTop: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginTop: 24 },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 13,
    fontWeight: '700',
    marginRight: 8,
    overflow: 'hidden',
  },
  stepTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  small: { fontSize: 12, color: colors.sub, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
