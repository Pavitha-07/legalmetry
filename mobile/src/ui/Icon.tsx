/**
 * One icon family for the whole app: Feather, at a single stroke weight.
 * Mixing families is the fastest way to make an interface look assembled
 * rather than designed, so this is the only icon import in the project.
 */
import React from 'react';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../theme';

export type IconName = React.ComponentProps<typeof Feather>['name'];

export function Icon({
  name,
  size = 18,
  color,
  tone = 'text',
}: {
  name: IconName;
  size?: number;
  color?: string;
  tone?: 'text' | 'dim' | 'faint' | 'accent';
}) {
  const { c } = useTheme();
  const resolved =
    color ?? { text: c.text, dim: c.textDim, faint: c.textFaint, accent: c.accent }[tone];
  return <Feather name={name} size={size} color={resolved} />;
}
