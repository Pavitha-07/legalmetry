import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ease, r, sp, spring, springFirm, tintedShadow, useTheme } from '../theme';
import { Icon } from './Icon';
import { PressScale, T } from './primitives';

/** Where the finger would come to rest if it kept decelerating. */
function project(velocity: number) {
  'worklet';
  const decelerationRate = 0.998;
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** The further past the edge, the less the sheet follows. */
function rubberband(overshoot: number, dimension: number) {
  'worklet';
  const constant = 0.55;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

const OFFSCREEN = 1200;

/**
 * Bottom sheet for a short interruption: a picker, a finding's full detail.
 *
 * Its own height drives the animation, so the travel distance is exact rather
 * than a guess at the window size, and the backdrop derives from the same
 * shared value, so it can never drift out of sync with the panel.
 */
export function Sheet({
  title,
  onClose,
  children,
  scroll = true,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  scroll?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  const [height, setHeight] = useState(0);
  const opened = useRef(false);

  // Starts well below the fold, so the frame between mount and measurement is
  // never visible as a sheet sitting at rest.
  const y = useSharedValue(OFFSCREEN);
  const start = useSharedValue(0);

  const close = useCallback(() => {
    const travel = height || windowHeight;
    y.set(
      withTiming(travel, { duration: 220, easing: ease.sheet }, (finished) => {
        if (finished) scheduleOnRN(onClose);
      }),
    );
  }, [height, onClose, windowHeight, y]);

  const onLayout = (measured: number) => {
    if (measured <= 0) return;
    setHeight(measured);
    if (opened.current) return;
    opened.current = true;
    if (reduced) {
      y.set(0);
      return;
    }
    y.set(measured);
    y.set(withSpring(0, spring));
  };

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-10, 10])
        .onStart(() => {
          // Grab mid-animation continues from where the eye last saw the sheet.
          start.set(y.get());
        })
        .onUpdate((event) => {
          const next = start.get() + event.translationY;
          y.set(next >= 0 ? next : rubberband(next, height || 400));
        })
        .onEnd((event) => {
          const travel = height || windowHeight;
          const projected = y.get() + project(event.velocityY);
          if (projected > travel * 0.4) {
            y.set(
              withSpring(
                travel,
                { ...springFirm, velocity: event.velocityY },
                (finished) => {
                  if (finished) scheduleOnRN(onClose);
                },
              ),
            );
          } else {
            // Velocity handed to the spring, so there is no seam between the
            // finger releasing and the sheet continuing.
            y.set(withSpring(0, { ...spring, velocity: event.velocityY }));
          }
        }),
    [height, onClose, start, windowHeight, y],
  );

  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  const backdrop = useAnimatedStyle(() => ({
    opacity: interpolate(y.get(), [0, height || windowHeight], [1, 0], Extrapolation.CLAMP),
  }));

  const body = (
    <View style={{ gap: sp.md, paddingBottom: sp.sm }}>{children}</View>
  );

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
      <Animated.View style={[{ flex: 1, backgroundColor: c.scrim }, backdrop]}>
        <Pressable
          accessibilityLabel="Close"
          onPress={close}
          style={{ flex: 1 }}
        />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          onLayout={(event) => onLayout(event.nativeEvent.layout.height)}
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: windowHeight * 0.88,
              backgroundColor: c.surface,
              borderTopLeftRadius: r.container + 6,
              borderTopRightRadius: r.container + 6,
              borderTopWidth: 1,
              borderColor: c.line,
              paddingBottom: Math.max(insets.bottom, sp.lg),
              ...tintedShadow(c.accent, { alpha: 0.18, y: -8, blur: 24 }),
            },
            panel,
          ]}
        >
          <View style={{ alignItems: 'center', paddingTop: sp.md }}>
            <View
              style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: c.lineStrong }}
            />
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: sp.md,
              paddingHorizontal: sp.lg,
              paddingTop: sp.md,
              paddingBottom: sp.md,
            }}
          >
            <T v="heading" style={{ flex: 1 }}>
              {title}
            </T>
            <PressScale onPress={close} accessibilityLabel="Close" style={{ padding: sp.xs }}>
              <Icon name="x" size={18} tone="faint" />
            </PressScale>
          </View>

          {scroll ? (
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: sp.lg }}
              showsVerticalScrollIndicator={false}
            >
              {body}
            </ScrollView>
          ) : (
            <View style={{ paddingHorizontal: sp.lg }}>{body}</View>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
