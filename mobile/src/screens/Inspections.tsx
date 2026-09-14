import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  api,
  shortDate,
  type Inspection,
  type InspectionStatus,
  type Session,
} from '../api';
import { sp, useTheme } from '../theme';
import { ActionBar, Button, IconButton } from '../ui/Button';
import { Empty, ErrorNote, Group, Row, SectionHeader, T } from '../ui/primitives';
import { Reveal } from '../ui/Reveal';
import { Screen, ThemeToggle } from '../ui/Screen';
import { Segmented } from '../ui/Segmented';
import { SkeletonList } from '../ui/Skeleton';
import { StatusPill } from '../ui/Pill';
import { Icon } from '../ui/Icon';

type Filter = 'all' | 'review' | 'violation';

const matches = (filter: Filter, status: InspectionStatus) =>
  filter === 'all' ||
  (filter === 'review' && status === 'needs_review') ||
  (filter === 'violation' && status === 'violation');

export function Inspections({
  base,
  session,
  onNew,
  onOpen,
  onSignOut,
}: {
  base: string;
  session: Session;
  onNew: () => void;
  onOpen: (inspection: Inspection) => void;
  onSignOut: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Inspection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') setRefreshing(true);
      try {
        const result = await api.inspections(base, session.token);
        setItems(Array.isArray(result) ? result : []);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not load inspections.');
      } finally {
        setRefreshing(false);
      }
    },
    [base, session.token],
  );

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const list = items ?? [];
    return {
      all: list.length,
      review: list.filter((item) => item.status === 'needs_review').length,
      violation: list.filter((item) => item.status === 'violation').length,
    };
  }, [items]);

  const visible = useMemo(
    () => (items ?? []).filter((item) => matches(filter, item.status)),
    [items, filter],
  );

  return (
    <Screen
      title="Inspections"
      subtitle={session.fullName}
      refreshing={refreshing}
      onRefresh={() => load('refresh')}
      right={
        <>
          <ThemeToggle />
          <IconButton name="log-out" label="Sign out" onPress={onSignOut} />
        </>
      }
      footer={
        <ActionBar inset={insets.bottom}>
          <Button label="New inspection" icon="plus" onPress={onNew} full />
        </ActionBar>
      }
    >
      <View style={{ gap: sp.md, marginTop: sp.md }}>
        <Segmented
          value={filter}
          onChange={setFilter}
          segments={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'review', label: 'Review', count: counts.review },
            { value: 'violation', label: 'Violation', count: counts.violation },
          ]}
        />

        {!!error && <ErrorNote message={error} onRetry={() => load()} />}

        {items === null && !error ? (
          <SkeletonList rows={4} />
        ) : visible.length ? (
          <Group>
            {visible.map((item) => (
              <InspectionRow key={item.id} item={item} onPress={() => onOpen(item)} />
            ))}
          </Group>
        ) : (
          <Reveal>
            <Empty
              icon={filter === 'all' ? 'camera' : 'filter'}
              title={filter === 'all' ? 'No inspections yet' : 'Nothing in this filter'}
              body={
                filter === 'all'
                  ? 'Start one to capture a package panel and run the declaration checks.'
                  : 'Reports move here once the rule engine has classified them.'
              }
              action={
                filter === 'all' ? (
                  <Button label="New inspection" size="md" icon="plus" onPress={onNew} />
                ) : (
                  <Button
                    label="Show all"
                    size="md"
                    variant="secondary"
                    onPress={() => setFilter('all')}
                  />
                )
              }
            />
          </Reveal>
        )}
      </View>

      {/* The two-shot method is the thing inspectors get wrong first, so it is
          stated on the screen they start from rather than buried in a manual. */}
      <SectionHeader>How a panel is captured</SectionHeader>
      <Group>
        <Method
          icon="disc"
          title="Shot A, with the coin"
          body="A ten rupee coin beside the label gives a known 27 mm reference, so text height can be reported in millimetres."
        />
        <Method
          icon="type"
          title="Shot B, coin removed"
          body="Same distance and zoom. The coin never covers a declaration, so nothing is read through it."
        />
      </Group>
    </Screen>
  );
}

function InspectionRow({ item, onPress }: { item: Inspection; onPress: () => void }) {
  const { c } = useTheme();
  const panels = item.panels.length;
  const failures = item.findings.filter((finding) => finding.status === 'FAIL').length;

  const meta = [
    item.outlet_name || 'Outlet not recorded',
    `${panels} panel${panels === 1 ? '' : 's'}`,
    failures ? `${failures} failed` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <Row onPress={onPress} accessibilityLabel={`${item.product_name ?? 'Unnamed product'}, ${item.status}`}>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp.sm }}>
          <T v="monoMicro" tone="faint">
            {item.reference}
          </T>
          <T v="monoMicro" tone="faint">
            {shortDate(item.created_at)}
          </T>
        </View>
        <T v="bodyStrong" numberOfLines={1}>
          {item.product_name || 'Unnamed product'}
        </T>
        <T v="label" tone="dim" numberOfLines={1}>
          {meta}
        </T>
      </View>
      <StatusPill status={item.status} />
      <Icon name="chevron-right" size={16} color={c.textFaint} />
    </Row>
  );
}

function Method({
  icon,
  title,
  body,
}: {
  icon: 'disc' | 'type';
  title: string;
  body: string;
}) {
  const { c } = useTheme();
  return (
    <Row>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          backgroundColor: c.fill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={17} tone="dim" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="labelStrong">{title}</T>
        <T v="label" tone="dim">
          {body}
        </T>
      </View>
    </Row>
  );
}
