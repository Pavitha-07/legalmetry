/**
 * Design tokens for LegalMetry.
 *
 * One theme for the whole app, following the system appearance with a manual
 * override. Every colour a component draws comes from here, so there is no
 * per-screen palette drift.
 *
 * Shape rule (applied everywhere, no exceptions):
 *   r.control   12  buttons, inputs, chips, tiles
 *   r.container 16  cards, sheets, photo frames
 *   r.pill     999  status pills only
 *
 * Numbers rule: anything measured, counted, or referenced by ID is set in the
 * mono face with tabular figures, so a value that updates does not reflow the
 * line it sits on.
 */
import React, { createContext, useContext, useMemo, useState } from 'react';
import { Platform, useColorScheme, type TextStyle } from 'react-native';
import { Easing, cubicBezier } from 'react-native-reanimated';

export const MONO = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
}) as string;

/**
 * Editorial serif for display/title/heading text only. Stands in for the
 * licensed "Foriene" typeface referenced during design review — swap the
 * family name here once the licensed font files are bundled via expo-font.
 * Body text, labels, and all mono/numeric values stay on the system sans so
 * dense data screens (Inspections, Analysis) keep their legibility.
 */
export const SERIF = 'PlayfairDisplay_700Bold';
export const SERIF_ITALIC = 'PlayfairDisplay_700Bold_Italic';

/**
 * Brand palette: 3D52A0 (deep indigo), 7091E6 (periwinkle), 8697C4 (muted
 * blue-grey), ADBBDA (light lavender-blue), EDE8F5 (near-white lavender).
 *
 * Both themes are built from these same five colours, redistributed by role,
 * so light and dark read as one brand rather than two different palettes —
 * light mode leans on the dark end (indigo accent on a lavender-white
 * ground), dark mode leans on the light end (periwinkle accent on a deep
 * indigo ground, and the near-white EDE8F5 becomes the dark-mode text
 * colour). PASS/REVIEW/FAIL are deliberately left as plain green/amber/red
 * in both themes — those are statutory compliance signals an inspector
 * scans for at a glance, not brand surface, so they stay outside the
 * palette unification.
 */
const dark = {
  bg: '#0E1224',
  surface: '#161B2E',
  surfaceHi: '#1D2338',
  fill: '#232A42',
  line: '#2B3350',
  lineStrong: '#3B4568',
  text: '#EDE8F5',
  textDim: '#ADBBDA',
  textFaint: '#8697C4',
  accent: '#7091E6',
  accentOn: '#0E1224',
  accentFill: 'rgba(112,145,230,0.16)',
  pass: '#2ED573',
  passFill: 'rgba(46,213,115,0.16)',
  review: '#FFB020',
  reviewFill: 'rgba(255,176,32,0.16)',
  fail: '#FF5C5C',
  failFill: 'rgba(255,92,92,0.16)',
  scrim: 'rgba(4,6,14,0.62)',
  shimmer: 'rgba(237,232,245,0.06)',
};

const light: typeof dark = {
  bg: '#EDE8F5',
  surface: '#FFFFFF',
  surfaceHi: '#F5F2FA',
  fill: '#E7E1F2',
  line: '#DBD5EA',
  lineStrong: '#ADBBDA',
  text: '#1B1D2E',
  textDim: '#5B6584',
  textFaint: '#8697C4',
  accent: '#3D52A0',
  accentOn: '#FFFFFF',
  accentFill: 'rgba(61,82,160,0.10)',
  pass: '#0E7C48',
  passFill: 'rgba(14,124,72,0.10)',
  review: '#A66300',
  reviewFill: 'rgba(166,99,0,0.10)',
  fail: '#C42B21',
  failFill: 'rgba(196,43,33,0.10)',
  scrim: 'rgba(27,29,46,0.45)',
  shimmer: 'rgba(27,29,46,0.05)',
};

export type Palette = typeof dark;

/** '#RRGGBB' -> 'rgba(r,g,b,alpha)', for building boxShadow strings from theme hex colours. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Shorthand for a soft, theme-tinted elevation shadow (boxShadow + Android elevation). */
export function tintedShadow(hex: string, opts: { alpha: number; y: number; blur: number }) {
  return {
    boxShadow: `0px ${opts.y}px ${opts.blur}px ${withAlpha(hex, opts.alpha)}`,
    elevation: Math.max(2, Math.round(opts.y / 2)),
  } as const;
}

/** 4pt base. Nothing in the app uses a spacing value that is not on this scale. */
export const sp = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 40 } as const;

export const r = { control: 12, container: 16, pill: 999 } as const;

export const type = {
  display: { fontFamily: SERIF, fontSize: 34, lineHeight: 40, letterSpacing: -0.3 },
  title: { fontFamily: SERIF, fontSize: 23, lineHeight: 29, letterSpacing: -0.2 },
  heading: { fontFamily: SERIF, fontSize: 18, lineHeight: 23, letterSpacing: -0.1 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  labelStrong: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  /** Grouped-list section headers. Rationed: one per list section, never decorative. */
  micro: { fontSize: 11, lineHeight: 15, fontWeight: '600', letterSpacing: 0.6 },
  monoDisplay: { fontFamily: MONO, fontSize: 30, lineHeight: 34, letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  monoTitle: { fontFamily: MONO, fontSize: 19, lineHeight: 24, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  mono: { fontFamily: MONO, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  monoMicro: { fontFamily: MONO, fontSize: 11, lineHeight: 15, fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

/**
 * Motion constants. Two forms of the same three curves, because Reanimated's
 * timing functions and its CSS timing functions are separate types.
 */
export const ease = {
  out: Easing.bezier(0.23, 1, 0.32, 1),
  inOut: Easing.bezier(0.77, 0, 0.175, 1),
  sheet: Easing.bezier(0.32, 0.72, 0, 1),
};

export const cssEase = {
  out: cubicBezier(0.23, 1, 0.32, 1),
  inOut: cubicBezier(0.77, 0, 0.175, 1),
};

export const dur = {
  press: 120,
  control: 180,
  enter: 240,
  exit: 190,
} as const;

/** Sheets and anything a finger let go of. Velocity is passed in at the call site. */
export const spring = { duration: 320, dampingRatio: 0.82 } as const;
export const springFirm = { duration: 300, dampingRatio: 1, overshootClamping: true } as const;

export type Scheme = 'system' | 'light' | 'dark';

type Ctx = { c: Palette; scheme: Scheme; setScheme: (s: Scheme) => void; isDark: boolean };
const ThemeCtx = createContext<Ctx>({ c: dark, scheme: 'system', setScheme: () => {}, isDark: true });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [scheme, setScheme] = useState<Scheme>('system');
  const isDark = scheme === 'system' ? system !== 'light' : scheme === 'dark';
  const value = useMemo<Ctx>(
    () => ({ c: isDark ? dark : light, scheme, setScheme, isDark }),
    [isDark, scheme],
  );
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);

/**
 * StyleSheet.create cannot close over theme values, so styles are built by a
 * factory and memoised per palette. Same cost as a static sheet after first
 * render, and the sheet is rebuilt only when the palette actually flips.
 */
export function useStyles<T>(factory: (c: Palette) => T): T {
  const { c } = useTheme();
  return useMemo(() => factory(c), [c, factory]);
}

/** Status vocabulary. The API speaks two of these; both land on one tone set. */
export type Tone = 'pass' | 'review' | 'fail' | 'neutral' | 'busy';

export function toneColors(c: Palette, tone: Tone) {
  switch (tone) {
    case 'pass':
      return { fg: c.pass, bg: c.passFill };
    case 'review':
      return { fg: c.review, bg: c.reviewFill };
    case 'fail':
      return { fg: c.fail, bg: c.failFill };
    case 'busy':
      return { fg: c.accent, bg: c.accentFill };
    default:
      return { fg: c.textDim, bg: c.fill };
  }
}
