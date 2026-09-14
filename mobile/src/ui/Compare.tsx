import { useMemo, useState } from 'react';
import { Image, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { r, sp, spring, useTheme } from '../theme';
import { tapLight } from '../haptics';
import { Icon } from './Icon';
import { T } from './primitives';

const FRAME_H = 230;

/**
 * Paired framing check.
 *
 * The whole coin-calibration method assumes the two shots were taken at the
 * same distance and zoom: the pixels-per-mm comes from shot A and is applied
 * to text measured in shot B. The backend can only compare pixel dimensions.
 * Wiping between the two lets the inspector see misalignment directly, before
 * submitting evidence that cannot be re-taken later.
 *
 * The clip container animates `width`; the image inside is absolutely
 * positioned at the full frame width, so it is revealed rather than squeezed,
 * and nothing outside the container re-runs layout.
 */
export function Compare({
  calibrationUri,
  ocrUri,
}: {
  calibrationUri: string;
  ocrUri: string;
}) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  const start = useSharedValue(0);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // The axis has to be declared, or this steals the vertical scroll of
        // the screen it sits in and the page feels broken.
        .activeOffsetX([-6, 6])
        .onStart(() => {
          start.set(x.get());
        })
        .onUpdate((event) => {
          const next = start.get() + event.translationX;
          // A scrubber clamps: there is no more image to reveal past either end.
          x.set(Math.max(0, Math.min(width, next)));
        })
        .onEnd((event) => {
          x.set(
            withSpring(Math.max(0, Math.min(width, x.get())), {
              ...spring,
              velocity: event.velocityX,
            }),
          );
        }),
    [start, width, x],
  );

  // The comparison runs on the UI thread every frame; the haptic crosses to
  // the React Native runtime twice per wipe, not sixty times a second.
  useAnimatedReaction(
    () => width > 0 && (x.get() <= 1 || x.get() >= width - 1),
    (isEdge, wasEdge) => {
      if (isEdge && wasEdge === false) scheduleOnRN(tapLight);
    },
  );

  const clip = useAnimatedStyle(() => ({ width: x.get() }));
  const handle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View style={{ gap: sp.sm }}>
      <View
        onLayout={(event) => {
          const measured = event.nativeEvent.layout.width;
          if (measured > 0 && measured !== width) {
            setWidth(measured);
            x.set(measured / 2);
          }
        }}
        style={{
          height: FRAME_H,
          borderRadius: r.container,
          overflow: 'hidden',
          backgroundColor: c.fill,
          borderWidth: 1,
          borderColor: c.line,
        }}
      >
        <Image
          source={{ uri: ocrUri }}
          style={{ position: 'absolute', top: 0, left: 0, width, height: FRAME_H }}
          resizeMode="cover"
          accessibilityLabel="Reading photo, coin removed"
        />

        <GestureDetector gesture={pan}>
          <View style={{ flex: 1 }}>
            <Animated.View
              style={[
                { position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden' },
                clip,
              ]}
            >
              <Image
                source={{ uri: calibrationUri }}
                style={{ position: 'absolute', top: 0, left: 0, width, height: FRAME_H }}
                resizeMode="cover"
                accessibilityLabel="Calibration photo with the coin"
              />
            </Animated.View>

            <Animated.View
              style={[
                { position: 'absolute', top: 0, bottom: 0, left: -1, width: 2 },
                handle,
              ]}
              pointerEvents="none"
            >
              <View style={{ flex: 1, backgroundColor: '#FFFFFF', opacity: 0.9 }} />
              <View
                style={{
                  position: 'absolute',
                  top: FRAME_H / 2 - 16,
                  left: -15,
                  width: 32,
                  height: 32,
                  borderRadius: r.pill,
                  backgroundColor: '#FFFFFF',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                }}
              >
                <Icon name="chevron-left" size={14} color="#16181D" />
                <Icon name="chevron-right" size={14} color="#16181D" />
              </View>
            </Animated.View>
          </View>
        </GestureDetector>
      </View>

      {/* Captions sit below the frame, not on top of it, so neither photo is
          obscured at the moment the inspector is judging its framing. */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T v="monoMicro" tone="dim">
          WITH COIN
        </T>
        <T v="label" tone="faint">
          Drag to compare
        </T>
        <T v="monoMicro" tone="dim">
          NO COIN
        </T>
      </View>
    </View>
  );
}
