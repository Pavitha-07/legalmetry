import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, defaultBaseUrl, type PublicManufacturerCompliance } from '../api';
import { r, sp, useTheme } from '../theme';
import { Button, IconButton } from '../ui/Button';
import { Field } from '../ui/Field';
import { Icon } from '../ui/Icon';
import { Pill } from '../ui/Pill';
import { Reveal } from '../ui/Reveal';
import { Empty, ErrorNote, Group, T } from '../ui/primitives';

/**
 * Public, no-login retailer due-diligence lookup — reachable from the
 * landing page's "Check a manufacturer" button. Read-only, unauthenticated:
 * this screen must never accept a session or call an endpoint that requires
 * one. See backend/app/main.py's public_manufacturer_lookup for what data
 * this deliberately does and does not expose.
 */
export function ComplianceLookup({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicManufacturerCompliance[] | null>(null);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || searching) return;
    try {
      setSearching(true);
      setError(null);
      const response = await api.publicManufacturerLookup(defaultBaseUrl, trimmed);
      setResults(response.results);
      setDisclaimer(response.disclaimer);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not complete the search.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: sp.md,
          paddingTop: insets.top + sp.sm,
          paddingBottom: sp.sm,
          paddingHorizontal: sp.lg,
          borderBottomWidth: 1,
          borderBottomColor: c.line,
        }}
      >
        <IconButton name="chevron-left" label="Back" onPress={onBack} />
        <T v="heading">Manufacturer compliance lookup</T>
      </View>

      <ScrollView contentContainerStyle={{ padding: sp.xl, paddingBottom: insets.bottom + sp.xxl }}>
        <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center', gap: sp.lg }}>
          <T v="label" tone="dim">
            For retailers, e-commerce platforms, and quick-commerce apps checking a manufacturer
            before stocking their product. No account needed.
          </T>

          <View style={{ flexDirection: 'row', gap: sp.md, alignItems: 'flex-end' }}>
            <Field
              label="Manufacturer name"
              icon="search"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={search}
              placeholder="e.g. registered business name"
              autoCapitalize="none"
              style={{ flex: 1 }}
            />
            <Button label="Search" icon="search" loading={searching} disabled={query.trim().length < 2} onPress={search} />
          </View>

          {!!error && <ErrorNote message={error} onRetry={search} />}

          {!!disclaimer && (
            <View
              style={{
                backgroundColor: c.accentFill,
                borderRadius: r.container,
                padding: sp.lg,
              }}
            >
              <T v="label" tone="accent">
                {disclaimer}
              </T>
            </View>
          )}

          {results !== null && (
            results.length ? (
              <Group>
                {results.map((manufacturer, index) => (
                  <Reveal key={manufacturer.id} index={index}>
                    <ComplianceRow manufacturer={manufacturer} />
                  </Reveal>
                ))}
              </Group>
            ) : (
              <Empty
                icon="search"
                title="No record found"
                body="This office has no confirmed violation, and no logged clean inspection, on file for this name. See the note above — this is not a compliance guarantee."
              />
            )
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function ComplianceRow({ manufacturer }: { manufacturer: PublicManufacturerCompliance }) {
  const { c } = useTheme();
  const hasUnresolved = manufacturer.unresolved_count > 0;
  const status = hasUnresolved
    ? `${manufacturer.unresolved_count} unresolved violation${manufacturer.unresolved_count === 1 ? '' : 's'}`
    : manufacturer.resolved_count > 0
      ? 'No unresolved violations on record'
      : manufacturer.clean_inspection_count > 0
        ? 'Inspected — no violations found'
        : 'No violations on record';

  return (
    <View style={{ padding: sp.lg, gap: sp.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: sp.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="bodyStrong">{manufacturer.name}</T>
          {!!manufacturer.address && (
            <T v="label" tone="dim">
              {manufacturer.address}
            </T>
          )}
        </View>
        <Pill label={hasUnresolved ? 'Unresolved' : 'Clear'} tone={hasUnresolved ? 'fail' : 'pass'} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp.xs }}>
        <Icon name={hasUnresolved ? 'alert-triangle' : 'check-circle'} size={14} color={hasUnresolved ? c.fail : c.pass} />
        <T v="label" color={hasUnresolved ? c.fail : c.pass}>
          {status}
        </T>
      </View>
      {manufacturer.resolved_count > 0 && (
        <T v="label" tone="faint">
          {manufacturer.resolved_count} historical violation{manufacturer.resolved_count === 1 ? '' : 's'} on record,
          resolved.
        </T>
      )}
      {manufacturer.clean_inspection_count > 0 && (
        <T v="label" tone="faint">
          {manufacturer.clean_inspection_count} inspection{manufacturer.clean_inspection_count === 1 ? '' : 's'}{' '}
          confirmed compliant by this office.
        </T>
      )}
    </View>
  );
}
