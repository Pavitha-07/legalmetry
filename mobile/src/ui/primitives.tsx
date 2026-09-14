import React, { useEffect, useState } from 'react';
import {
  Pressable,
  View,
  Text as RNText,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  css,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { cssEase, dur, ease, r, sp, type, useTheme, type Palette } from '../theme';
import { Icon, type IconName } from './Icon';

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

type Variant = keyof typeof type;
type Tone = 'text' | 'dim' | 'faint' | 'accent' | 'onAccent';

const toneOf = (c: Palette, tone: Tone) =>
  ({ text: c.text, dim: c.textDim, faint: c.textFaint, accent: c.accent, onAccent: c.accentOn })[
    tone
  ];

/** Numeric/ID variants never word-animate: a figure that slides in is a figure the reader waits for. */
const MONO_VARIANTS = new Set<Variant>(['mono', 'monoDisplay', 'monoTitle', 'monoMicro']);
const WORD_STAGGER_MS = 30;
const WORD_DURATION_MS = 260;

/**
 * Every piece of text in the app renders through here, so this is the one
 * place that gives titles, labels, and body copy their per-word entrance —
 * matching the reference motion-primitives `TextEffect`, rebuilt on
 * react-native-reanimated (the library already used everywhere else in this
 * app) since the original is a web/DOM-only component and does not run on
 * iOS or Android.
 *
 * Excluded on purpose: the mono variants (numeric readouts, rule IDs,
 * hashes) stay instant — this codebase already treats those as data an
 * inspector reads at a glance, not decoration (see ShareBar). Pass
 * `animate={false}` to opt any single call out too, e.g. a list row that
 * re-mounts on every poll tick.
 */
export function T({
  v = 'body',
  tone = 'text',
  color,
  style,
  animate = true,
  children,
  ...rest
}: TextProps & { v?: Variant; tone?: Tone; color?: string; animate?: boolean }) {
  const { c } = useTheme();
  const resolvedStyle = [type[v] as TextStyle, { color: color ?? toneOf(c, tone) }, style];
  const eligible = animate && !MONO_VARIANTS.has(v) && typeof children === 'string' && children.length > 0;

  if (!eligible) {
    return (
      <RNText {...rest} style={resolvedStyle}>
        {children}
      </RNText>
    );
  }

  const words = (children as string).split(' ');
  return (
    <RNText {...rest} style={resolvedStyle}>
      {words.map((word, index) => (
        <AnimatedWord key={`${index}-${word}`} index={index} last={index === words.length - 1}>
          {word}
        </AnimatedWord>
      ))}
    </RNText>
  );
}

/** One word of a T's entrance. Animates once on mount, never again on re-render. */
function AnimatedWord({
  children,
  index,
  last,
}: {
  children: string;
  index: number;
  last: boolean;
}) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    progress.set(withDelay(index * WORD_STAGGER_MS, withTiming(1, { duration: WORD_DURATION_MS, easing: ease.out })));
    // Runs once per mount — re-animating on every prop change would fire on
    // every poll-driven refresh of the same on-screen row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * 6 }],
  }));

  return <Animated.Text style={animStyle}>{children}{last ? '' : ' '}</Animated.Text>;
}

/** Grouped-list section header. One per section, never used as decoration. */
export function SectionHeader({
  children,
  right,
  style,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          paddingHorizontal: sp.xs,
          marginBottom: sp.sm,
          marginTop: sp.lg,
          gap: sp.md,
        },
        style,
      ]}
    >
      <T v="micro" tone="dim" style={{ textTransform: 'uppercase' }}>
        {children}
      </T>
      {right}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Press feedback
// ---------------------------------------------------------------------------

/**
 * The style a pressable paints with goes onto an `Animated.View`, so it must
 * accept Reanimated's CSS transition properties as well as plain view styles.
 */
type AnimatedViewStyle = React.ComponentProps<typeof Animated.View>['style'];

const press = css.create({
  base: {
    transform: [{ scale: 1 }],
    transitionProperty: 'transform',
    transitionDuration: `${dur.press}ms`,
    transitionTimingFunction: cssEase.out,
  },
  down: { transform: [{ scale: 0.97 }] },
  downSubtle: { transform: [{ scale: 0.985 }] },
});

/**
 * Every pressable surface in the app. 120ms / 3% is the ceiling for something
 * touched this often, and the scale carries the label and icons with it, which
 * is what makes it read as physical rather than as a colour flash.
 *
 * `hitSlop` brings small controls to the 44pt target without growing them;
 * `pressRetentionOffset` stops a slight finger drift from cancelling the press.
 */
export function PressScale({
  children,
  style,
  containerStyle,
  subtle,
  disabled,
  ...rest
}: PressableProps & {
  style?: AnimatedViewStyle;
  /**
   * Applied to the Pressable itself rather than the scaling view. Layout that
   * the parent depends on (flex, alignSelf) belongs here; anything painted
   * (background, border, radius) belongs in `style` so it scales with the press.
   */
  containerStyle?: StyleProp<ViewStyle>;
  subtle?: boolean;
}) {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={10}
      pressRetentionOffset={20}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      style={containerStyle}
      {...rest}
    >
      <Animated.View
        style={[
          press.base,
          down && !disabled && (subtle ? press.downSubtle : press.down),
          style,
        ]}
      >
        {children as React.ReactNode}
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

export function Divider({ inset = 0 }: { inset?: number }) {
  const { c } = useTheme();
  return (
    <View
      style={{ height: 1, marginLeft: inset, backgroundColor: c.line }}
      pointerEvents="none"
    />
  );
}

/**
 * A grouped list. Cards are used only where elevation carries real hierarchy;
 * inside a group, rows are separated by a hairline instead of by another box.
 */
export function Group({
  children,
  style,
  inset = sp.lg,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  inset?: number;
}) {
  const { c } = useTheme();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: r.container,
          borderWidth: 1,
          borderColor: c.line,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Divider inset={inset} />}
          {child}
        </React.Fragment>
      ))}
    </View>
  );
}

export function Row({
  children,
  onPress,
  style,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const body = (
    <View
      style={[
        {
          minHeight: 56,
          paddingHorizontal: sp.lg,
          paddingVertical: sp.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: sp.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressScale subtle onPress={onPress} accessibilityLabel={accessibilityLabel}>
      {body}
    </PressScale>
  );
}

/** A key/value line. Values are mono so a column of them stays aligned. */
export function DataRow({
  label,
  value,
  mono = true,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  tone?: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: sp.lg,
        paddingHorizontal: sp.lg,
        paddingVertical: sp.md,
      }}
    >
      <T v="label" tone="dim" style={{ flexShrink: 1 }}>
        {label}
      </T>
      {typeof value === 'string' || typeof value === 'number' ? (
        <T v={mono ? 'mono' : 'labelStrong'} color={tone} style={{ textAlign: 'right' }}>
          {value}
        </T>
      ) : (
        value
      )}
    </View>
  );
}

export function Empty({
  title,
  body,
  action,
  icon = 'inbox',
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  icon?: IconName;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        borderRadius: r.container,
        borderWidth: 1,
        borderColor: c.line,
        borderStyle: 'dashed',
        paddingVertical: sp.xxxl,
        paddingHorizontal: sp.xl,
        alignItems: 'center',
        gap: sp.md,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: r.pill,
          backgroundColor: c.accentFill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={24} tone="accent" />
      </View>
      <T v="bodyStrong">{title}</T>
      {!!body && (
        <T v="label" tone="dim" style={{ textAlign: 'center', maxWidth: 280 }}>
          {body}
        </T>
      )}
      {!!action && <View style={{ marginTop: sp.sm }}>{action}</View>}
    </View>
  );
}

/** Inline, retryable failure. Never a modal alert. */
export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        backgroundColor: c.failFill,
        borderRadius: r.control,
        paddingVertical: sp.md,
        paddingHorizontal: sp.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: sp.md,
      }}
    >
      <T v="label" color={c.fail} style={{ flex: 1 }}>
        {message}
      </T>
      {!!onRetry && (
        <PressScale onPress={onRetry} accessibilityLabel="Retry">
          <T v="labelStrong" color={c.fail}>
            Retry
          </T>
        </PressScale>
      )}
    </View>
  );
}
