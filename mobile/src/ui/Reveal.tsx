import { useMemo } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';
import { withTiming } from 'react-native-reanimated';
import { dur, ease } from '../theme';

/** Reflow when a row is added or removed. Module scope: builders are not rebuilt per render. */
export const REFLOW = LinearTransition.duration(220).easing(ease.out);

export const SCREEN_IN = FadeIn.duration(dur.enter);
export const SCREEN_OUT = FadeOut.duration(dur.exit);

/**
 * Staggered entrance for content the user asked for and is waiting on:
 * findings arriving from the rule engine, a dashboard resolving.
 *
 * On web, Reanimated's `entering` prop positions the animated view as
 * `position: absolute` for the first animation frame, which collapses scroll
 * layout and causes sections to overlap. On web we skip the entering
 * animation entirely and render a plain View — the content still appears, it
 * just doesn't slide in. Screen-level transitions (SCREEN_IN / SCREEN_OUT)
 * are unaffected because they sit on absolutely-positioned full-screen views.
 *
 * On native, stagger is preserved and respects reduced-motion.
 */
export function Reveal({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();

  // Web: skip entering animation to avoid scroll layout collapse.
  if (Platform.OS === 'web') {
    return <View style={style}>{children}</View>;
  }

  const entering = reduced
    ? FadeIn.duration(180)
    : FadeInDown.duration(260)
        .easing(ease.out)
        .delay(Math.min(index, 8) * 45)
        .withInitialValues({ transform: [{ translateY: 10 }] });

  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}

/**
 * A captured photo landing in its slot.
 *
 * Starts at 0.94 rather than 0: nothing in the real world appears from
 * nothing, and a photo that pops out of a zero-size point reads as a glitch
 * rather than as the shot arriving. Reanimated's `ZoomIn` preset starts at
 * scale 0 and does not touch opacity, so this is written out by hand.
 */
export function photoEnter() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.94 }] },
    animations: {
      opacity: withTiming(1, { duration: 200, easing: ease.out }),
      transform: [{ scale: withTiming(1, { duration: 280, easing: ease.out }) }],
    },
  };
}

export function usePhotoEnter() {
  const reduced = useReducedMotion();
  // On web, also skip the entering animation for the same layout reason.
  if (Platform.OS === 'web') return FadeIn.duration(180);
  return reduced ? FadeIn.duration(180) : photoEnter;
}
