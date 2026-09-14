import { useEffect, useState } from 'react';
import { View, type LayoutRectangle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { dur, ease, r, sp, useTheme } from '../theme';
import { tapSelection } from '../haptics';
import { PressScale, T } from './primitives';

export type Segment<V extends string> = { value: V; label: string; count?: number };

/**
 * Segmented control with a sliding indicator.
 *
 * The pill is absolutely positioned and has no children, which is the one case
 * where animating `width` is correct: nothing else re-runs layout, and the
 * corner radius survives, where a `scaleX` would smear it into an oval.
 *
 * `ease-in-out`, because the pill is travelling across the screen rather than
 * entering or leaving it. The haptic fires on the press, not when the pill
 * lands, so the feedback is on the same frame as the cause.
 */
export function Segmented<V extends string>({
  segments,
  value,
  onChange,
}: {
  segments: Segment<V>[];
  value: V;
  onChange: (value: V) => void;
}) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const [layouts, setLayouts] = useState<Record<string, LayoutRectangle>>({});
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const ready = useSharedValue(0);

  useEffect(() => {
    const box = layouts[value];
    if (!box) return;
    const options = { duration: reduced ? 0 : 250, easing: ease.inOut };
    if (ready.get() === 0) {
      // First measurement: place the pill, do not slide it in from zero.
      x.set(box.x);
      w.set(box.width);
      ready.set(withTiming(1, { duration: dur.control, easing: ease.out }));
    } else {
      x.set(withTiming(box.x, options));
      w.set(withTiming(box.width, options));
    }
  }, [value, layouts, reduced, x, w, ready]);

  const pill = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }],
    width: w.get(),
    opacity: ready.get(),
  }));

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: c.fill,
        borderRadius: r.control,
        padding: 3,
      }}
      accessibilityRole="tablist"
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 3,
            bottom: 3,
            left: 0,
            marginLeft: 3,
            borderRadius: r.control - 3,
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.line,
          },
          pill,
        ]}
      />
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <PressScale
            key={segment.value}
            subtle
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={segment.label}
            onPress={() => {
              if (active) return;
              tapSelection();
              onChange(segment.value);
            }}
            onLayout={(event) => {
              if (!event?.nativeEvent?.layout) return;
              const layout = event.nativeEvent.layout;
              setLayouts((prev) => ({ ...prev, [segment.value]: layout }));
            }}
            containerStyle={{ flex: 1 }}
            style={{
              minHeight: 38,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 5,
              paddingHorizontal: sp.sm,
            }}
          >
            <T v="labelStrong" tone={active ? 'text' : 'dim'} numberOfLines={1}>
              {segment.label}
            </T>
            {segment.count !== undefined && (
              <T v="monoMicro" tone={active ? 'dim' : 'faint'}>
                {segment.count}
              </T>
            )}
          </PressScale>
        );
      })}
    </View>
  );
}
