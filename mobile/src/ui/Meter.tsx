import { View } from 'react-native';
import { shortDate } from '../api';
import { r, sp, useTheme } from '../theme';
import { T } from './primitives';

export type Share = { key: string; label: string; value: number; color: string };

/**
 * Part-to-whole for the district's outcomes. One bar, because the three
 * numbers only mean something relative to each other; three separate gauges
 * would hide exactly the comparison the supervisor is looking for.
 *
 * Deliberately not animated. This is legal caseload data, and a number that
 * counts up is a number the reader has to wait for.
 */
export function ShareBar({ shares }: { shares: Share[] }) {
  const { c } = useTheme();
  const total = shares.reduce((sum, s) => sum + s.value, 0);

  return (
    <View style={{ gap: sp.md }}>
      <View
        style={{
          height: 8,
          borderRadius: r.pill,
          overflow: 'hidden',
          flexDirection: 'row',
          backgroundColor: c.fill,
          gap: total > 0 ? 2 : 0,
        }}
        accessibilityRole="progressbar"
        accessibilityLabel={shares.map((s) => `${s.label} ${s.value}`).join(', ')}
      >
        {total > 0 &&
          shares
            .filter((s) => s.value > 0)
            .map((s) => (
              <View key={s.key} style={{ flex: s.value, backgroundColor: s.color }} />
            ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp.lg }}>
        {shares.map((s) => (
          <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View
              style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.color }}
            />
            <T v="mono" color={s.color}>
              {s.value}
            </T>
            <T v="label" tone="dim">
              {s.label}
            </T>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * A ranked count. The bar carries no background track: the row above it is
 * already the reference length, so a filled track would only add a second
 * rectangle to read.
 */
export function RankRow({
  title,
  meta,
  count,
  max,
  color,
}: {
  title: string;
  meta?: string;
  count: number;
  max: number;
  color?: string;
}) {
  const { c } = useTheme();
  const tint = color ?? c.fail;
  const fraction = max > 0 ? Math.max(count / max, 0.04) : 0;

  return (
    <View style={{ paddingHorizontal: sp.lg, paddingVertical: sp.md, gap: sp.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: sp.md }}>
        <T v="bodyStrong" style={{ flex: 1 }} numberOfLines={2}>
          {title}
        </T>
        <T v="monoTitle" color={tint}>
          {count}
        </T>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.fill, overflow: 'hidden' }}>
        <View
          style={{
            height: '100%',
            borderRadius: 3,
            backgroundColor: tint,
            width: `${fraction * 100}%`,
          }}
        />
      </View>
      {!!meta && (
        <T v="monoMicro" tone="faint">
          {meta}
        </T>
      )}
    </View>
  );
}

export type TrendPoint = { week_start: string; total: number; violations: number };

const BAR_HEIGHT = 84;

/**
 * Eight-week inspection volume, with the violation share stacked in red at
 * the top of each bar. The backend zero-fills every week in the window, so
 * the axis is always eight consecutive weeks, never a gap for a quiet week.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const { c } = useTheme();
  const max = Math.max(1, ...points.map((p) => p.total));

  return (
    <View style={{ gap: sp.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: sp.sm, height: BAR_HEIGHT }}>
        {points.map((p) => {
          const totalHeight = p.total > 0 ? Math.max(6, (p.total / max) * BAR_HEIGHT) : 2;
          const violationHeight = p.total > 0 ? (p.violations / p.total) * totalHeight : 0;
          return (
            <View
              key={p.week_start}
              accessibilityLabel={`Week of ${p.week_start}: ${p.total} inspections, ${p.violations} violations`}
              style={{
                flex: 1,
                height: totalHeight,
                borderRadius: 4,
                overflow: 'hidden',
                backgroundColor: p.total > 0 ? c.passFill : c.fill,
              }}
            >
              {violationHeight > 0 && (
                <View style={{ height: violationHeight, backgroundColor: c.fail }} />
              )}
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: sp.sm }}>
        {points.map((p) => (
          <View key={p.week_start} style={{ flex: 1, alignItems: 'center' }}>
            <T v="monoMicro" tone="faint">
              {shortDate(p.week_start)}
            </T>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: sp.lg, marginTop: sp.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: c.passFill, borderWidth: 1, borderColor: c.pass }} />
          <T v="label" tone="dim">
            Inspections
          </T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: c.fail }} />
          <T v="label" tone="dim">
            Violations
          </T>
        </View>
      </View>
    </View>
  );
}

/**
 * A single measured figure. Mono with tabular figures, so the unit stays put
 * when the value changes length.
 */
export function Readout({
  value,
  unit,
  label,
  tone,
  large = false,
}: {
  value: string;
  unit?: string;
  label: string;
  tone?: string;
  large?: boolean;
}) {
  return (
    <View style={{ gap: 2, minWidth: 96 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <T v={large ? 'monoDisplay' : 'monoTitle'} color={tone}>
          {value}
        </T>
        {!!unit && (
          <T v={large ? 'label' : 'monoMicro'} tone="dim">
            {unit}
          </T>
        )}
      </View>
      <T v="micro" tone="faint" style={{ textTransform: 'uppercase' }}>
        {label}
      </T>
    </View>
  );
}
