import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, hit, radius, tint, type } from './theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Button. `primary` (default) = accent fill, `secondary` = surface, `ghost` = text only, `danger` = brick.
 * `size` l = 56 pt (pinned primary actions), m = 48 pt (default, ≥ 44 pt hit target).
 */
export function Button({ title, onPress, secondary, ghost, disabled, danger, size = 'm', icon, style }: {
  title: string; onPress: () => void; secondary?: boolean; ghost?: boolean; disabled?: boolean; danger?: boolean;
  size?: 'm' | 'l'; icon?: IconName; style?: StyleProp<ViewStyle>;
}) {
  const fg = ghost ? colors.accent : secondary ? colors.ink : colors.onAccent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        size === 'l' && styles.btnL,
        secondary && styles.btnSecondary,
        ghost && styles.btnGhost,
        danger && styles.btnDanger,
        disabled && { opacity: 0.4 },
        pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={size === 'l' ? 24 : 20} color={fg} /> : null}
      <Text style={[styles.btnText, size === 'l' && styles.btnTextL, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

/** Round icon button (top bars, player controls). `size` is the diameter; min 44. */
export function IconButton({ icon, onPress, onLongPress, size = hit.min, primary, color, disabled, style, label }: {
  icon: IconName; onPress: () => void; onLongPress?: () => void; size?: number; primary?: boolean; color?: string; disabled?: boolean;
  style?: StyleProp<ViewStyle>; /** small text under the icon (e.g. "+15 s") */ label?: string;
}) {
  const fg = color ?? (primary ? colors.onAccent : colors.ink);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      hitSlop={size < hit.min ? (hit.min - size) / 2 : 6}
      style={({ pressed }) => [
        styles.iconBtn,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: primary ? colors.accentDeep : colors.surfaceAlt },
        disabled && { opacity: 0.35 },
        pressed && { opacity: 0.85, transform: [{ scale: 0.92 }] },
        style,
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * (label ? 0.34 : 0.44))} color={fg} />
      {label ? <Text style={[styles.iconLabel, { color: fg }]}>{label}</Text> : null}
    </Pressable>
  );
}

/** Toggle chip. Off = quiet surface + soft text; on = solid `color` (default accent). Colour means "chosen". */
export function Chip({ label, on, onPress, color = colors.accent, icon }: { label: string; on: boolean; onPress: () => void; color?: string; icon?: IconName }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.chip, on ? { backgroundColor: color, borderColor: color } : { backgroundColor: colors.surfaceAlt, borderColor: colors.line }, pressed && { transform: [{ scale: 0.95 }] }]}
    >
      {icon ? <Ionicons name={icon} size={14} color={on ? colors.bg : colors.inkSoft} /> : null}
      <Text style={[styles.chipText, { color: on ? colors.bg : colors.inkSoft }]}>{label}</Text>
    </Pressable>
  );
}

/** Small non-interactive tag pill (one per row at most). */
export function Tag({ label, color = colors.muted }: { label: string; color?: string }) {
  return <Text style={[styles.tag, { backgroundColor: tint(color, 0.18), color }]}>{label}</Text>;
}

/** Row of chips with consistent gaps. */
export function ChipRow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.chipRow, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  btn: { minHeight: 48, flexDirection: 'row', gap: 8, backgroundColor: colors.accentDeep, paddingVertical: 12, paddingHorizontal: 18, borderRadius: radius.m, alignItems: 'center', justifyContent: 'center' },
  btnL: { minHeight: 56, borderRadius: radius.l, paddingHorizontal: 24 },
  btnSecondary: { backgroundColor: colors.surfaceAlt },
  btnGhost: { backgroundColor: 'transparent' },
  btnDanger: { backgroundColor: colors.danger },
  btnText: { ...type.bodyStrong, color: colors.onAccent },
  btnTextL: { fontSize: 18, lineHeight: 24 },
  iconBtn: { alignItems: 'center', justifyContent: 'center', gap: 1 },
  iconLabel: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  chip: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { ...type.caption, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
});
