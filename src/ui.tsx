/**
 * デザインの共通部品。
 * 幅広い層に親しみやすいよう、あたたかいクリーム色の背景・コーラルの差し色・丸ゴシック（Web 版）・
 * 大きめの角丸とアイコンで、やさしい印象にそろえる。
 */
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text as RNText,
  TextInput,
  TextInputProps,
  TextProps,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const colors = {
  bg: '#FFF7F1',
  card: '#FFFFFF',
  text: '#33291F',
  sub: '#75685D',
  faint: '#A99D93',
  border: '#F1E2D6',
  // 差し色（コーラル）
  accent: '#FF6B4A',
  accentDark: '#E8553A',
  accentSoft: '#FFEDE6',
  // 互換用（以前の名前）
  highlight: '#FF6B4A',
  highlightBg: '#FFEDE6',
  ok: '#1E9E7A',
  okSoft: '#E2F5EE',
  warn: '#B86E00',
  warnBg: '#FFF4DE',
  danger: '#D93D3D',
  dangerSoft: '#FDECEC',
};

/** Web 版は丸ゴシック（index.html で Google Fonts を読み込む）。アプリ版は端末の標準フォント */
export const FONT = Platform.OS === 'web' ? '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", system-ui, sans-serif' : undefined;

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

/** フォントをそろえた Text */
export function Text(props: TextProps) {
  return <RNText {...props} style={[{ fontFamily: FONT, color: colors.text }, props.style]} />;
}

export function Label({ children, hint, optional }: { children: React.ReactNode; hint?: string; optional?: boolean }) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{children}</Text>
      {optional ? <Text style={styles.optional}>任意</Text> : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Field(props: TextInputProps) {
  const [focused, setFocused] = React.useState(false);
  return (
    <TextInput
      placeholderTextColor={colors.faint}
      autoCorrect={false}
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={[
        styles.input,
        props.multiline && { minHeight: 96, textAlignVertical: 'top' },
        focused && { borderColor: colors.accent, backgroundColor: '#FFFDFB' },
        props.style,
      ]}
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
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'highlight' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  icon?: IconName;
  style?: ViewStyle;
}) {
  const filled = kind === 'primary' || kind === 'highlight';
  const fg = filled ? '#fff' : kind === 'danger' ? colors.danger : kind === 'ghost' ? colors.accentDark : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        filled && { backgroundColor: pressed ? colors.accentDark : colors.accent },
        filled && !small && styles.btnShadow,
        kind === 'secondary' && { backgroundColor: pressed ? '#FFF3EC' : colors.card, borderWidth: 1.5, borderColor: colors.border },
        kind === 'danger' && { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.danger },
        kind === 'ghost' && { backgroundColor: pressed ? colors.accentSoft : 'transparent' },
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.btnInner}>
          {icon ? <Icon name={icon} size={small ? 16 : 20} color={fg} /> : null}
          <Text style={[styles.btnText, small && { fontSize: 14 }, { color: fg }, icon ? { marginLeft: 6 } : null]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active: boolean; onPress: () => void; icon?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && { color: colors.accentDark, fontWeight: '700' }]}>
        {icon ? `${icon} ` : ''}
        {label}
      </Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[] }) {
  return <View style={[styles.card, style as ViewStyle]}>{children}</View>;
}

/** 手順ごとのまとまり（番号・アイコン・見出し付きのカード） */
export function Section({
  step,
  icon,
  title,
  subtitle,
  children,
  onLayout,
}: {
  step?: number;
  icon: IconName;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onLayout?: (y: number) => void;
}) {
  return (
    <View style={styles.section} onLayout={onLayout ? (e) => onLayout(e.nativeEvent.layout.y) : undefined}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionIcon}>
          <Icon name={icon} size={18} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          {step ? <Text style={styles.stepLabel}>STEP {step}</Text> : null}
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
      </View>
      {subtitle ? <Text style={[styles.small, { marginTop: 2 }]}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

/** 小さな状態表示（広告表記あり・文字数など） */
export function Pill({ icon, label, tone = 'neutral' }: { icon?: IconName; label: string; tone?: 'neutral' | 'ok' | 'warn' | 'danger' }) {
  const c = {
    neutral: [colors.sub, '#F6EEE7'],
    ok: [colors.ok, colors.okSoft],
    warn: [colors.warn, colors.warnBg],
    danger: [colors.danger, colors.dangerSoft],
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: c[1] }]}>
      {icon ? <Icon name={icon} size={13} color={c[0]} /> : null}
      <Text style={[styles.pillText, { color: c[0] }, icon ? { marginLeft: 4 } : null]}>{label}</Text>
    </View>
  );
}

export function EmptyState({ icon, title, message }: { icon: IconName; title: string; message: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
      <View style={[styles.sectionIcon, { width: 64, height: 64, borderRadius: 32 }]}>
        <Icon name={icon} size={30} color={colors.accent} />
      </View>
      <Text style={{ fontSize: 16, fontWeight: '700', marginTop: 14 }}>{title}</Text>
      <Text style={[styles.small, { textAlign: 'center', marginTop: 6 }]}>{message}</Text>
    </View>
  );
}

/** 互換用：番号付きの見出し */
export function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <View style={[styles.row, { marginTop: 24 }]}>
      <Text style={styles.stepLabel}>STEP {n}</Text>
      <Text style={[styles.sectionTitle, { marginLeft: 8 }]}>{title}</Text>
    </View>
  );
}

export function formatDate(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const shadow = Platform.select({
  web: { boxShadow: '0 2px 10px rgba(120, 72, 40, 0.07)' } as object,
  default: { shadowColor: '#784828', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
});

export const styles = StyleSheet.create({
  screen: { padding: 16, paddingBottom: 56, maxWidth: 640, width: '100%', alignSelf: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 7, flexWrap: 'wrap' },
  label: { fontSize: 14, fontWeight: '700' },
  optional: {
    fontSize: 11,
    color: colors.sub,
    backgroundColor: '#F4ECE5',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 6,
    overflow: 'hidden',
  },
  hint: { fontSize: 12, color: colors.faint, marginLeft: 8 },
  input: {
    backgroundColor: '#FFFCFA',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    fontFamily: FONT,
  },
  btn: { borderRadius: 28, minHeight: 52, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  btnShadow: Platform.select({
    web: { boxShadow: '0 6px 16px rgba(255, 107, 74, 0.32)' } as object,
    default: { shadowColor: '#FF6B4A', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  }) as ViewStyle,
  btnSmall: { minHeight: 40, paddingHorizontal: 14, marginTop: 0, borderRadius: 20 },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 16, fontWeight: '700' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 16, marginTop: 12, ...(shadow as object) },
  section: { backgroundColor: colors.card, borderRadius: 24, padding: 18, marginTop: 16, ...(shadow as object) },
  sectionHead: { flexDirection: 'row', alignItems: 'center' },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepLabel: { fontSize: 11, fontWeight: '700', color: colors.accent, letterSpacing: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  pill: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, marginRight: 6, marginTop: 6 },
  pillText: { fontSize: 12, fontWeight: '700' },
  small: { fontSize: 13, color: colors.sub, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
