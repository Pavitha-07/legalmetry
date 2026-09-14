import { View } from 'react-native';
import { sp, useTheme } from '../theme';
import { Icon } from './Icon';
import { Marquee } from './Marquee';
import { T } from './primitives';

/**
 * Government-portal identity strip: badge + department name + tricolour
 * stripe + a scrolling statutory-reference ticker. Deliberately a stylized
 * generic badge, not the actual State Emblem of India — that emblem is
 * legally restricted under the State Emblem of India (Prohibition of
 * Improper Use) Act, 2005.
 */
export function GovHeaderBar({ marqueeText }: { marqueeText: string }) {
  const { c } = useTheme();
  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: sp.md,
          paddingHorizontal: sp.xl,
          paddingVertical: sp.md,
          backgroundColor: c.surface,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: '#0B1F5C',
            borderWidth: 2,
            borderColor: '#D4AF37',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="shield" size={20} color="#D4AF37" />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <T v="micro" tone="faint" style={{ letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Government of India · भारत सरकार
          </T>
          <T v="heading">Department of Legal Metrology</T>
          <T v="label" tone="dim">
            Ministry of Consumer Affairs, Food &amp; Public Distribution
          </T>
        </View>
      </View>
      <View style={{ flexDirection: 'row', height: 3 }}>
        <View style={{ flex: 1, backgroundColor: '#FF9933' }} />
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
        <View style={{ flex: 1, backgroundColor: '#138808' }} />
      </View>
      <Marquee text={marqueeText} />
    </View>
  );
}

export const GOV_MARQUEE_TEXT =
  'LEGAL METROLOGY ACT, 2009    PACKAGED COMMODITIES RULES, 2011    RULE 6 DECLARATIONS    RULE 18 MRP    NATIONAL CONSUMER HELPLINE 1800-11-4000';
