import React from 'react';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { css } from 'react-native-reanimated';
import { cssEase, r, sp, tintedShadow, useTheme } from '../theme';
import { Icon, type IconName } from './Icon';
import { PressScale, T } from './primitives';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * The label and the spinner are stacked, not swapped, so submitting never
 * changes the button's width. Both crossfade on the same 180ms curve; the
 * label stays in the layout at zero opacity to hold the size.
 */
const swap = css.create({
  layer: {
    transitionProperty: 'opacity',
    transitionDuration: '180ms',
    transitionTimingFunction: cssEase.out,
  },
  hidden: { opacity: 0 },
  shown: { opacity: 1 },
});

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  full = false,
  size = 'lg',
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  size?: 'lg' | 'md';
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const inert = disabled || loading;

  const skin: Record<Variant, { bg: string; fg: string; border: string }> = {
    primary: { bg: c.accent, fg: c.accentOn, border: c.accent },
    secondary: { bg: 'transparent', fg: c.text, border: c.lineStrong },
    ghost: { bg: 'transparent', fg: c.accent, border: 'transparent' },
    danger: { bg: c.failFill, fg: c.fail, border: 'transparent' },
  };
  const { bg, fg, border } = skin[variant];

  return (
    <PressScale
      onPress={onPress}
      disabled={inert}
      accessibilityLabel={label}
      accessibilityState={{ disabled: inert, busy: loading }}
      style={[
        {
          minHeight: size === 'lg' ? 52 : 44,
          borderRadius: r.control,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: border,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: sp.xl,
          alignSelf: full ? 'stretch' : 'flex-start',
          opacity: disabled ? 0.42 : 1,
          ...(variant === 'primary' && !inert
            ? tintedShadow(c.accent, { alpha: 0.32, y: 5, blur: 12 })
            : null),
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          swap.layer,
          loading ? swap.hidden : swap.shown,
          { flexDirection: 'row', alignItems: 'center', gap: sp.sm },
        ]}
      >
        {!!icon && <Icon name={icon} size={16} color={fg} />}
        <T v={size === 'lg' ? 'bodyStrong' : 'labelStrong'} color={fg}>
          {label}
        </T>
      </Animated.View>

      <Animated.View
        style={[
          swap.layer,
          loading ? swap.shown : swap.hidden,
          { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
        ]}
        pointerEvents="none"
      >
        <ActivityIndicator color={fg} />
      </Animated.View>
    </PressScale>
  );
}

/** Square icon-only control. 40pt visual, 44pt+ target via PressScale hitSlop. */
export function IconButton({
  name,
  onPress,
  label,
  tint,
  filled = false,
}: {
  name: IconName;
  onPress?: () => void;
  label: string;
  tint?: string;
  filled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <PressScale
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        width: 40,
        height: 40,
        borderRadius: r.control,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? c.fill : 'transparent',
      }}
    >
      <Icon name={name} size={19} color={tint ?? c.text} />
    </PressScale>
  );
}

/**
 * Bottom action bar. Field use is one-handed, so the primary action lives in
 * the thumb zone rather than at the end of a scroll.
 */
export function ActionBar({
  children,
  note,
  inset,
}: {
  children: React.ReactNode;
  note?: string;
  inset: number;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: c.line,
        backgroundColor: c.bg,
        paddingHorizontal: sp.lg,
        paddingTop: sp.md,
        paddingBottom: Math.max(inset, sp.md),
        gap: sp.sm,
      }}
    >
      {!!note && (
        <T v="label" tone="dim" style={{ textAlign: 'center' }}>
          {note}
        </T>
      )}
      {children}
    </View>
  );
}
