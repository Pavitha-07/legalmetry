import React, { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import Animated, { css } from 'react-native-reanimated';
import { cssEase, r, sp, tintedShadow, type, useTheme } from '../theme';
import { PressScale, T } from './primitives';
import { Icon, type IconName } from './Icon';

const ring = css.create({
  base: {
    borderWidth: 1,
    borderRadius: r.control,
    transitionProperty: ['borderColor', 'backgroundColor'],
    transitionDuration: '160ms',
    transitionTimingFunction: cssEase.out,
  },
});

/**
 * Label above, helper in the markup whether or not it is filled, error below.
 * Placeholders are examples, never labels: an officer who has started typing
 * must still be able to see what the field is.
 */
export function Field({
  label,
  helper,
  error,
  icon,
  style,
  ...input
}: TextInputProps & {
  label: string;
  helper?: string;
  error?: string | null;
  icon?: IconName;
}) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? c.fail : focused ? c.accent : c.line;

  return (
    <View style={{ gap: sp.sm }}>
      <T v="label" tone="dim">
        {label}
      </T>

      <Animated.View
        style={[
          ring.base,
          {
            borderColor,
            backgroundColor: focused ? c.surface : c.fill,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: sp.md,
            gap: sp.sm,
          },
        ]}
      >
        {!!icon && <Icon name={icon} size={16} tone={focused ? 'accent' : 'faint'} />}
        <TextInput
          {...input}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          placeholderTextColor={c.textFaint}
          selectionColor={c.accent}
          style={[
            type.body,
            {
              flex: 1,
              minHeight: 50,
              color: c.text,
              // Web keeps a UA focus outline that would double up on the ring.
              outlineStyle: 'none',
            } as never,
            style,
          ]}
        />
      </Animated.View>

      {!!error && (
        <T v="label" color={c.fail}>
          {error}
        </T>
      )}
      {!error && !!helper && (
        <T v="label" tone="faint">
          {helper}
        </T>
      )}
    </View>
  );
}

/**
 * Collapsible block. Used for connection settings, which matter on a dev
 * network but should not be the first thing an inspector reads.
 *
 * The body mounts and unmounts; the reveal is a layout animation on the
 * parent, so no height is animated by hand.
 */
export function Disclosure({
  label,
  detail,
  open,
  onToggle,
  children,
}: {
  label: string;
  detail?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { c } = useTheme();
  return (
    // The shadow lives on this outer view: overflow:hidden below (needed to
    // clip the press ripple and inner divider to the rounded corners) would
    // otherwise clip the shadow itself on native.
    <View style={{ borderRadius: r.container, ...tintedShadow(c.accent, { alpha: 0.1, y: 4, blur: 12 }) }}>
      <View
        style={{
          borderWidth: 1,
          borderColor: c.line,
          borderRadius: r.container,
          backgroundColor: c.surface,
          overflow: 'hidden',
        }}
      >
        <PressScale
          subtle
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={label}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: sp.md,
            paddingHorizontal: sp.lg,
            minHeight: 52,
          }}
        >
          <T v="labelStrong" style={{ flex: 1 }}>
            {label}
          </T>
          {detail}
          <Chevron open={open} />
        </PressScale>

        {open && (
          <View
            style={{
              paddingHorizontal: sp.lg,
              paddingBottom: sp.lg,
              paddingTop: sp.xs,
              gap: sp.md,
              borderTopWidth: 1,
              borderTopColor: c.line,
            }}
          >
            {children}
          </View>
        )}
      </View>
    </View>
  );
}

const chevron = css.create({
  base: {
    transform: [{ rotate: '0deg' }],
    transitionProperty: 'transform',
    transitionDuration: '200ms',
    transitionTimingFunction: cssEase.inOut,
  },
  open: { transform: [{ rotate: '180deg' }] },
});

/** Rotates rather than swapping glyphs, so the affordance stays one object. */
export function Chevron({ open }: { open: boolean }) {
  return (
    <Animated.View style={[chevron.base, open && chevron.open]}>
      <Icon name="chevron-down" size={18} tone="faint" />
    </Animated.View>
  );
}
