import React from 'react';
import { RefreshControl, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { r, sp, tintedShadow, useTheme } from '../theme';
import { IconButton } from './Button';
import { T } from './primitives';

const HEADER_H = 52;
const HANDOFF = 46; // where the large title has scrolled far enough to hand over

/**
 * The large-title pattern: the display title lives in the scroll content and
 * scrolls away, while a compact title crossfades into the fixed header bar.
 *
 * The header's height is constant. Collapsing it by animating `height` would
 * re-run layout for the header and everything below it on every scroll frame,
 * competing with the scroll itself, which is the one animation guaranteed to
 * stutter on a mid-range Android.
 */
export function Screen({
  title,
  eyebrow,
  subtitle,
  onBack,
  right,
  footer,
  refreshing,
  onRefresh,
  children,
  contentStyle,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  footer?: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });

  // Extrapolation.CLAMP is not optional: without it, scrolling far down keeps
  // driving opacity past 1 and back, and the title flickers at the bottom of a
  // long list.
  const compact = useAnimatedStyle(() => {
    const t = interpolate(scrollY.get(), [HANDOFF, HANDOFF + 28], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: t,
      transform: reduced ? [] : [{ translateY: interpolate(t, [0, 1], [8, 0]) }],
    };
  });

  const hairline = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [0, 12], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <View
        style={{
          height: HEADER_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: sp.sm,
          gap: sp.xs,
          overflow: 'hidden',
        }}
      >
        {onBack ? (
          <IconButton name="chevron-left" onPress={onBack} label="Back" />
        ) : (
          <View style={{ width: sp.sm }} />
        )}
        <Animated.View style={[{ flex: 1 }, compact]} pointerEvents="none">
          <T v="heading" numberOfLines={1}>
            {title}
          </T>
        </Animated.View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp.xs }}>{right}</View>
      </View>
      <Animated.View
        style={[{ height: 1, backgroundColor: c.line }, hairline]}
        pointerEvents="none"
      />

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          { paddingHorizontal: sp.lg, paddingBottom: footer ? sp.xxl : insets.bottom + sp.xxl },
          contentStyle,
        ]}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={c.textDim}
              colors={[c.accent]}
              progressBackgroundColor={c.surface}
            />
          ) : undefined
        }
      >
        <View
          style={{
            marginTop: sp.md,
            marginBottom: sp.lg,
            borderRadius: r.container,
            backgroundColor: c.accentFill,
            paddingHorizontal: sp.lg,
            paddingVertical: sp.lg,
            gap: 2,
            ...tintedShadow(c.accent, { alpha: isDark ? 0.3 : 0.14, y: 8, blur: 18 }),
          }}
        >
          {!!eyebrow && (
            <T v="micro" tone="accent" style={{ textTransform: 'uppercase' }}>
              {eyebrow}
            </T>
          )}
          <T v="display">{title}</T>
          {!!subtitle && (
            <T v="label" tone="dim" style={{ marginTop: sp.xs }}>
              {subtitle}
            </T>
          )}
        </View>
        {children}
      </Animated.ScrollView>

      {footer}
    </View>
  );
}

/** Full-bleed screen with no scroll: the camera and the permission gate. */
export function Bleed({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: '#000' }}>{children}</View>;
}

export function ThemeToggle() {
  const { setScheme, isDark } = useTheme();
  return (
    <IconButton
      name={isDark ? 'sun' : 'moon'}
      label={isDark ? 'Switch to light appearance' : 'Switch to dark appearance'}
      onPress={() => setScheme(isDark ? 'light' : 'dark')}
    />
  );
}

/** Card used where elevation carries real hierarchy, not as a default wrapper. */
export function Card({
  children,
  style,
  tone,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: string;
}) {
  const { c } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: r.container,
          borderWidth: 1,
          borderColor: tone ?? c.line,
          padding: sp.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
