import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { sp, useTheme } from '../theme';
import { T } from './primitives';

/** A continuously scrolling text ticker. Originally built for the landing
 * page, reused wherever an official-notice-style scroll is useful. */
export function Marquee({ text }: { text: string }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const [itemWidth, setItemWidth] = useState(0);
  const x = useSharedValue(0);

  useEffect(() => {
    if (reduced || !itemWidth) return;
    x.set(0);
    x.set(withRepeat(withTiming(-itemWidth, { duration: itemWidth * 22, easing: Easing.linear }), -1, false));
  }, [itemWidth, reduced]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  const item = (measure: boolean) => (
    <View
      style={{ flexDirection: 'row', alignItems: 'center' }}
      onLayout={measure ? (event) => setItemWidth(event.nativeEvent.layout.width) : undefined}
    >
      <T v="monoMicro" tone="faint" animate={false} style={{ letterSpacing: 1 }}>
        {text}
      </T>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent, marginHorizontal: sp.xl }} />
    </View>
  );

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: c.line,
        backgroundColor: c.surface,
        paddingVertical: sp.md,
        overflow: 'hidden',
      }}
    >
      {reduced || !itemWidth ? (
        item(true)
      ) : (
        <Animated.View style={[{ flexDirection: 'row' }, animStyle]}>
          {item(true)}
          {item(false)}
        </Animated.View>
      )}
    </View>
  );
}
