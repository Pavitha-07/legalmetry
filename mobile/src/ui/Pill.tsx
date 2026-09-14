import React from 'react';
import { View } from 'react-native';
import Animated, { css, useReducedMotion } from 'react-native-reanimated';
import {
  findingLabel,
  inspectionLabel,
  type FindingStatus,
  type InspectionStatus,
} from '../api';
import { r, sp, toneColors, useTheme, type Tone } from '../theme';
import { T } from './primitives';

const breathe = css.keyframes({
  '0%': { opacity: 0.3 },
  '50%': { opacity: 1 },
  '100%': { opacity: 0.3 },
});

const live = css.create({
  dot: {
    animationName: breathe,
    animationDuration: '1500ms',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
});

export const inspectionTone = (status: InspectionStatus): Tone =>
  status === 'violation'
    ? 'fail'
    : status === 'compliant'
      ? 'pass'
      : status === 'needs_review'
        ? 'review'
        : status === 'processing'
          ? 'busy'
          : 'neutral';

export const findingTone = (status: FindingStatus): Tone =>
  status === 'FAIL'
    ? 'fail'
    : status === 'PASS'
      ? 'pass'
      : status === 'NEEDS_REVIEW'
        ? 'review'
        : 'neutral';

/**
 * The only place a coloured dot appears in the app, and only when it carries
 * real state: work is still running on the server. Decorative dots are the
 * fastest way to make every label look like a status.
 */
export function Pill({
  label,
  tone,
  pulsing = false,
}: {
  label: string;
  tone: Tone;
  pulsing?: boolean;
}) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const { fg, bg } = toneColors(c, tone);
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: r.pill,
        paddingHorizontal: sp.md,
        paddingVertical: 5,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {pulsing && (
        <Animated.View
          style={[
            { width: 6, height: 6, borderRadius: 3, backgroundColor: fg },
            !reduced && live.dot,
          ]}
        />
      )}
      <T v="micro" color={fg} style={{ textTransform: 'uppercase' }}>
        {label}
      </T>
    </View>
  );
}

export function StatusPill({ status }: { status: InspectionStatus }) {
  return (
    <Pill
      label={inspectionLabel[status]}
      tone={inspectionTone(status)}
      pulsing={status === 'processing' || status === 'capturing'}
    />
  );
}

export function FindingPill({ status }: { status: FindingStatus }) {
  return <Pill label={findingLabel[status]} tone={findingTone(status)} />;
}
