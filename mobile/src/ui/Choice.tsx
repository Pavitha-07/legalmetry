import { View } from 'react-native';
import Animated, { css } from 'react-native-reanimated';
import { cssEase, r, sp, useTheme } from '../theme';
import { tapSelection } from '../haptics';
import { PressScale, T } from './primitives';

/**
 * Selection is a colour change, not a movement: these are tapped dozens of
 * times during a capture, and 160ms of fill is all the feedback the choice
 * needs on top of the press scale it already gets.
 */
const swatch = css.create({
  base: {
    transitionProperty: ['backgroundColor', 'borderColor'],
    transitionDuration: '160ms',
    transitionTimingFunction: cssEase.out,
  },
});

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={() => {
        tapSelection();
        onPress();
      }}
      style={[
        swatch.base,
        {
          minHeight: 38,
          justifyContent: 'center',
          paddingHorizontal: sp.lg,
          borderRadius: r.control,
          borderWidth: 1,
          backgroundColor: selected ? c.accentFill : c.fill,
          borderColor: selected ? c.accent : 'transparent',
        },
      ]}
    >
      <T v="labelStrong" tone={selected ? 'accent' : 'dim'}>
        {label}
      </T>
    </PressScale>
  );
}

/** Panel tiles. Three across, so all six sides fit without a scroll. */
export function TileGrid({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp.sm }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <PressScale
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.label} panel`}
            onPress={() => {
              if (selected) return;
              tapSelection();
              onChange(option.value);
            }}
            containerStyle={{ flexBasis: '31%', flexGrow: 1 }}
            style={[
              swatch.base,
              {
                minHeight: 52,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: r.control,
                borderWidth: 1,
                backgroundColor: selected ? c.accentFill : c.fill,
                borderColor: selected ? c.accent : 'transparent',
              },
            ]}
          >
            <T v="micro" tone={selected ? 'accent' : 'dim'} style={{ textTransform: 'uppercase' }}>
              {option.label}
            </T>
          </PressScale>
        );
      })}
    </View>
  );
}
