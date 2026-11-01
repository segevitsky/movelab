import React from 'react';
import { I18nManager, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ImageSourcePropType, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { colors, motion, radius, space, type } from './theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Screen: dark background, optional pinned footer (above the home indicator). `scroll` wraps the body in a
 * ScrollView with gutter padding; otherwise the body fills the screen (lists manage their own padding).
 */
export function Screen({ children, footer, scroll, style, contentStyle }: {
  children: React.ReactNode; footer?: React.ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const footerPad = footer ? 96 : 0;
  return (
    <View style={[styles.screen, style]}>
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.scrollBody, { paddingBottom: space.xl + footerPad + insets.bottom }, contentStyle]} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        children
      )}
      {footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.m) }]}>{footer}</View> : null}
    </View>
  );
}

/** Screen title row (h1 at the start, optional trailing element), under the status bar. */
export function TitleBar({ title, eyebrow, icon, iconSize = 34, trailing, style }: {
  iconSize?: number;
  title: string; /** small label above the title (e.g. the app name, or the date) */ eyebrow?: string;
  /** image at the start of the title (the app icon on the home tab) */ icon?: ImageSourcePropType;
  trailing?: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.titleBar, { paddingTop: insets.top + space.s }, style]}>
      <View style={styles.titleBlock}>
        {eyebrow ? <Text style={styles.eyebrow} numberOfLines={1}>{eyebrow}</Text> : null}
        <View style={styles.titleRow}>
          {icon ? <Image source={icon} style={[styles.titleIcon, { width: iconSize, height: iconSize, borderRadius: Math.round(iconSize * 0.24) }]} /> : null}
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>
      </View>
      {trailing}
    </View>
  );
}

/** Surface card (radius 16, inner padding 12). No shadow on dark: the surface step is the elevation. */
export function Card({ children, style, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return <View style={[styles.card, padded && { padding: space.m }, style]}>{children}</View>;
}

/** UPPERCASE section eyebrow with an optional trailing element (count, picker). */
export function SectionHeader({ title, trailing, style }: { title: string; trailing?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <Text style={styles.sectionTitle} numberOfLines={1}>{title}</Text>
      {trailing}
    </View>
  );
}

/** Hairline divider. */
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

/** Icon that means a direction (chevrons, skip): mirrored under RTL. */
export function DirectionalIcon({ name, size = 24, color = colors.ink, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <Ionicons name={name} size={size} color={color} style={[I18nManager.isRTL && { transform: [{ scaleX: -1 }] }, style]} />;
}

/**
 * Bottom sheet (Modal): backdrop + surface panel with radius 24. Content is given; keep it short (pickers,
 * inputs). `title` draws a header with a close button.
 */
export function Sheet({ visible, onClose, title, children, scroll = true }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  const body = (
    <>
      {title ? (
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle} numberOfLines={1}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.sheetClose}><Ionicons name="close" size={22} color={colors.ink} /></Pressable>
        </View>
      ) : (
        <View style={styles.grabber} />
      )}
      {children}
    </>
  );
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(motion.standard)} exiting={FadeOut.duration(motion.micro)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View entering={SlideInDown.duration(motion.screen)} exiting={SlideOutDown.duration(motion.standard)} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.l) }]}>
          {scroll ? <ScrollView bounces={false} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">{body}</ScrollView> : <View style={styles.sheetBody}>{body}</View>}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

/** One tappable option row inside a Sheet (check mark when selected). */
export function OptionRow({ label, selected, onPress, color, icon, caption }: { label: string; selected?: boolean; onPress: () => void; color?: string; icon?: IconName; caption?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.surfaceAlt }]}>
      {color ? <View style={[styles.swatch, { backgroundColor: color }]} /> : icon ? <Ionicons name={icon} size={20} color={colors.inkSoft} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionText, selected && { color: colors.ink }]}>{label}</Text>
        {caption ? <Text style={styles.optionCaption}>{caption}</Text> : null}
      </View>
      {selected ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
    </Pressable>
  );
}

/** Text prompt in a sheet (Alert.prompt is iOS-only). */
export function PromptSheet({ visible, title, placeholder, initial = '', confirm = 'Save', onConfirm, onClose }: {
  visible: boolean; title: string; placeholder?: string; initial?: string; confirm?: string; onConfirm: (text: string) => void; onClose: () => void;
}) {
  const [text, setText] = React.useState(initial);
  React.useEffect(() => { if (visible) setText(initial); }, [visible, initial]);
  return (
    <Sheet visible={visible} onClose={onClose} title={title} scroll={false}>
      <TextInput value={text} onChangeText={setText} placeholder={placeholder} placeholderTextColor={colors.muted} autoFocus style={styles.promptInput} returnKeyType="done" onSubmitEditing={() => text.trim() && onConfirm(text.trim())} />
      <Pressable onPress={() => text.trim() && onConfirm(text.trim())} disabled={!text.trim()} style={({ pressed }) => [styles.promptBtn, !text.trim() && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}>
        <Text style={styles.promptBtnText}>{confirm}</Text>
      </Pressable>
    </Sheet>
  );
}

/** Empty state: icon + one sentence. */
export function Empty({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={36} color={colors.muted} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollBody: { padding: space.l, gap: space.l },
  footer: { position: 'absolute', start: 0, end: 0, bottom: 0, paddingHorizontal: space.l, paddingTop: space.m, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  titleBar: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.m, paddingHorizontal: space.l, paddingBottom: space.m },
  titleBlock: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  titleIcon: { width: 34, height: 34, borderRadius: 8 },
  eyebrow: { ...type.label, color: colors.muted },
  title: { ...type.h1, color: colors.ink, flexShrink: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.l, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s, minHeight: 28 },
  sectionTitle: { ...type.label, color: colors.muted, flexShrink: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopStartRadius: radius.xl, borderTopEndRadius: radius.xl, maxHeight: '85%' },
  sheetBody: { paddingHorizontal: space.l, paddingTop: space.s, gap: space.s },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.s },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, gap: space.s },
  sheetTitle: { ...type.h3, color: colors.ink, flex: 1 },
  sheetClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 48, paddingHorizontal: space.s, borderRadius: radius.m },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  optionText: { ...type.body, color: colors.inkSoft },
  optionCaption: { ...type.caption, color: colors.muted },
  promptInput: { ...type.body, color: colors.ink, backgroundColor: colors.surfaceAlt, borderRadius: radius.m, paddingHorizontal: space.m, minHeight: 48 },
  promptBtn: { minHeight: 48, borderRadius: radius.m, backgroundColor: colors.accentDeep, alignItems: 'center', justifyContent: 'center', marginTop: space.xs },
  promptBtnText: { ...type.bodyStrong, color: colors.onAccent },
  empty: { padding: space.xxl, alignItems: 'center', gap: space.s },
  emptyText: { ...type.body, color: colors.muted, textAlign: 'center' },
});
