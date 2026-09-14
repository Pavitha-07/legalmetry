import { View, type DimensionValue } from 'react-native';
import Animated, { css, useReducedMotion } from 'react-native-reanimated';
import { r, sp, useTheme } from '../theme';
import { Divider } from './primitives';

const pulse = css.keyframes({
  '0%': { opacity: 0.45 },
  '50%': { opacity: 1 },
  '100%': { opacity: 0.45 },
});

const shimmer = css.create({
  on: {
    animationName: pulse,
    animationDuration: '1300ms',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
});

export function Bone({
  w,
  h = 12,
  radius = 6,
  delay = 0,
}: {
  w: DimensionValue;
  h?: number;
  radius?: number;
  delay?: number;
}) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  return (
    <Animated.View
      style={[
        { width: w, height: h, borderRadius: radius, backgroundColor: c.fill },
        !reduced && shimmer.on,
        !reduced && { animationDelay: `${delay}ms` },
      ]}
    />
  );
}

/**
 * Skeletons mirror the shape of the row they stand in for, so the list does
 * not reflow when real data lands. A centred spinner would tell the user less
 * and move more.
 */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        backgroundColor: c.surface,
        borderRadius: r.container,
        borderWidth: 1,
        borderColor: c.line,
        overflow: 'hidden',
      }}
      accessibilityLabel="Loading inspections"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i}>
          {i > 0 && <Divider inset={sp.lg} />}
          <View
            style={{
              minHeight: 72,
              paddingHorizontal: sp.lg,
              paddingVertical: sp.lg,
              flexDirection: 'row',
              alignItems: 'center',
              gap: sp.md,
            }}
          >
            <View style={{ flex: 1, gap: sp.sm }}>
              <Bone w="58%" h={14} delay={i * 110} />
              <Bone w="34%" h={10} delay={i * 110 + 60} />
            </View>
            <Bone w={62} h={22} radius={r.pill} delay={i * 110 + 120} />
          </View>
        </View>
      ))}
    </View>
  );
}
