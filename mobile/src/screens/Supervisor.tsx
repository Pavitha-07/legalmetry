import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  api,
  inspectionLabel,
  shortDate,
  type CorrectiveAction,
  type Dashboard,
  type Inspection,
  type InspectionStatus,
  type Session,
  type ViolationCase,
} from '../api';
import { r, sp, tintedShadow, useTheme } from '../theme';
import { Button, IconButton } from '../ui/Button';
import { Chip } from '../ui/Choice';
import { Disclosure, Field } from '../ui/Field';
import { GOV_MARQUEE_TEXT, GovHeaderBar } from '../ui/GovHeaderBar';
import { Icon, type IconName } from '../ui/Icon';
import { RankRow, Readout, ShareBar, TrendChart } from '../ui/Meter';
import { Pill, StatusPill } from '../ui/Pill';
import { Reveal } from '../ui/Reveal';
import { Screen, ThemeToggle } from '../ui/Screen';
import { Segmented } from '../ui/Segmented';
import { Sheet } from '../ui/Sheet';
import { SkeletonList } from '../ui/Skeleton';
import { DataRow, Empty, ErrorNote, Group, PressScale, Row, SectionHeader, T } from '../ui/primitives';
import { useToast } from '../ui/Toast';

const SEARCH_STATUSES: InspectionStatus[] = [
  'needs_review',
  'compliant',
  'violation',
  'processing',
  'capturing',
  'draft',
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Feed = 'recent' | 'violations';
type SectionKey = 'overview' | 'corrective' | 'improvement' | 'escalations' | 'requirements' | 'reports';

const SECTIONS: { key: SectionKey; label: string; icon: IconName }[] = [
  { key: 'overview', label: 'Overview', icon: 'bar-chart-2' },
  { key: 'corrective', label: 'Corrective actions', icon: 'shield' },
  { key: 'improvement', label: 'Improvement notices', icon: 'flag' },
  { key: 'escalations', label: 'Escalations', icon: 'alert-triangle' },
  { key: 'requirements', label: 'Failed requirements', icon: 'list' },
  { key: 'reports', label: 'Reports & search', icon: 'file-text' },
];

export function Supervisor({
  base,
  session,
  onOpen,
  onSignOut,
}: {
  base: string;
  session: Session;
  onOpen: (inspection: Inspection) => void;
  onSignOut: () => void;
}) {
  const { c } = useTheme();
  const toast = useToast();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [feed, setFeed] = useState<Feed>('recent');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [escalatingId, setEscalatingId] = useState<string | null>(null);
  const [openRectifyCase, setOpenRectifyCase] = useState<ViolationCase | null>(null);
  const [openFineCase, setOpenFineCase] = useState<ViolationCase | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchStatus, setSearchStatus] = useState<InspectionStatus | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<Inspection[] | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.dashboard(base, session.token));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the district review.');
    }
  }, [base, session.token]);

  useEffect(() => {
    load();
  }, [load]);

  const resolveAction = async (action: CorrectiveAction) => {
    if (resolvingId) return;
    try {
      setResolvingId(action.id);
      await api.resolveCorrectiveAction(base, session.token, action.id);
      toast.success('Marked as resolved.');
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not resolve this case.');
    } finally {
      setResolvingId(null);
    }
  };

  const escalateCase = async (violationCase: ViolationCase) => {
    if (escalatingId) return;
    try {
      setEscalatingId(violationCase.id);
      await api.escalateCase(base, session.token, violationCase.id);
      toast.success('Escalated — pending fine issuance.');
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not escalate this case.');
    } finally {
      setEscalatingId(null);
    }
  };

  const openActionInspection = async (action: CorrectiveAction) => {
    try {
      onOpen(await api.inspection(base, session.token, action.inspection.id));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not open this inspection.');
    }
  };

  const openCaseInspection = async (violationCase: ViolationCase) => {
    try {
      onOpen(await api.inspection(base, session.token, violationCase.inspection.id));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not open this inspection.');
    }
  };

  const runSearch = async () => {
    if (dateFrom && !DATE_RE.test(dateFrom)) {
      setSearchError('From date must be in YYYY-MM-DD format.');
      return;
    }
    if (dateTo && !DATE_RE.test(dateTo)) {
      setSearchError('To date must be in YYYY-MM-DD format.');
      return;
    }
    try {
      setSearching(true);
      setSearchError(null);
      const results = await api.searchInspections(base, session.token, {
        q: searchQuery.trim() || undefined,
        status: searchStatus ?? undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setSearchResults(results);
    } catch (caught) {
      setSearchError(caught instanceof Error ? caught.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchStatus(null);
    setDateFrom('');
    setDateTo('');
    setSearchResults(null);
    setSearchError(null);
  };

  const shares = useMemo(
    () =>
      data
        ? [
            { key: 'compliant', label: 'Compliant', value: data.compliant, color: c.pass },
            { key: 'review', label: 'Review', value: data.needs_review, color: c.review },
            { key: 'violation', label: 'Violation', value: data.violation, color: c.fail },
          ]
        : [],
    [data, c],
  );

  const list = data ? (feed === 'recent' ? data.recent_inspections : data.violation_reports) : [];
  const maxRule = data?.violation_by_rule[0]?.count ?? 0;

  const searchProps: ReportsSearchProps = {
    filtersOpen,
    setFiltersOpen,
    searchQuery,
    setSearchQuery,
    searchStatus,
    setSearchStatus,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    searching,
    searchError,
    searchResults,
    runSearch,
    clearSearch,
    onOpen,
  };

  const sheets = (
    <>
      {!!openRectifyCase && (
        <RectifySheet
          base={base}
          token={session.token}
          violationCase={openRectifyCase}
          onClose={() => setOpenRectifyCase(null)}
          onDone={async () => {
            setOpenRectifyCase(null);
            await load();
          }}
        />
      )}

      {!!openFineCase && (
        <IssueFineSheet
          base={base}
          token={session.token}
          violationCase={openFineCase}
          onClose={() => setOpenFineCase(null)}
          onDone={async () => {
            setOpenFineCase(null);
            await load();
          }}
        />
      )}
    </>
  );

  if (Platform.OS === 'web') {
    const badgeFor = (key: SectionKey): { count: number; urgent: boolean } | null => {
      if (!data) return null;
      if (key === 'corrective') return { count: data.open_corrective_actions, urgent: data.overdue_corrective_actions > 0 };
      if (key === 'improvement') return { count: data.open_violation_cases, urgent: data.overdue_violation_cases > 0 };
      if (key === 'escalations') return { count: data.pending_fine_recommendations, urgent: data.pending_fine_recommendations > 0 };
      return null;
    };

    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
      <GovHeaderBar marqueeText={GOV_MARQUEE_TEXT} />
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View
          style={{
            width: 260,
            borderRightWidth: 1,
            borderColor: c.line,
            backgroundColor: c.surface,
            paddingVertical: sp.lg,
            justifyContent: 'space-between',
          }}
        >
          <View>
            <View style={{ paddingHorizontal: sp.lg, marginBottom: sp.lg, gap: 2 }}>
              {!!data?.district_name && (
                <T v="micro" tone="accent" style={{ textTransform: 'uppercase' }}>
                  {data.district_name}
                </T>
              )}
              <T v="heading">District review</T>
              <T v="label" tone="dim">
                {session.fullName}
              </T>
            </View>
            <View style={{ gap: 2, paddingHorizontal: sp.sm }}>
              {SECTIONS.map((section) => (
                <SidebarItem
                  key={section.key}
                  icon={section.icon}
                  label={section.label}
                  active={activeSection === section.key}
                  badge={badgeFor(section.key)}
                  onPress={() => setActiveSection(section.key)}
                />
              ))}
            </View>
          </View>
          <View
            style={{
              paddingHorizontal: sp.lg,
              paddingTop: sp.lg,
              borderTopWidth: 1,
              borderColor: c.line,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <ThemeToggle />
            <IconButton name="log-out" label="Sign out" onPress={onSignOut} />
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: sp.xl }}>
          <View style={{ maxWidth: 880, width: '100%', alignSelf: 'center', gap: sp.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T v="display">{SECTIONS.find((s) => s.key === activeSection)?.label}</T>
              <Button
                label="Refresh"
                variant="ghost"
                size="md"
                icon="refresh-cw"
                loading={refreshing}
                onPress={async () => {
                  setRefreshing(true);
                  await load();
                  setRefreshing(false);
                }}
              />
            </View>

            {!!error && <ErrorNote message={error} onRetry={load} />}

            {!data && !error ? (
              <View style={{ gap: sp.lg }}>
                <SkeletonList rows={2} />
                <SkeletonList rows={4} />
              </View>
            ) : data ? (
              <>
                {activeSection === 'overview' && <OverviewSection data={data} shares={shares} />}
                {activeSection === 'corrective' && (
                  <CorrectiveActionsSection
                    data={data}
                    resolvingId={resolvingId}
                    onResolve={resolveAction}
                    onOpenInspection={openActionInspection}
                  />
                )}
                {activeSection === 'improvement' && (
                  <ImprovementNoticesSection
                    data={data}
                    onOpenInspection={openCaseInspection}
                    onRectify={setOpenRectifyCase}
                    onEscalate={escalateCase}
                    escalatingId={escalatingId}
                  />
                )}
                {activeSection === 'escalations' && (
                  <EscalationsSection
                    data={data}
                    onOpenInspection={openCaseInspection}
                    onIssueFine={setOpenFineCase}
                  />
                )}
                {activeSection === 'requirements' && <RequirementsSection data={data} maxRule={maxRule} />}
                {activeSection === 'reports' && (
                  <ReportsSection {...searchProps} feed={feed} setFeed={setFeed} list={list} data={data} />
                )}
              </>
            ) : null}
          </View>
        </ScrollView>
      </View>

      {sheets}
      </View>
    );
  }

  return (
    <>
      <Screen
        title="District review"
        eyebrow={data?.district_name}
        subtitle={`${session.fullName} · read only`}
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await load();
          setRefreshing(false);
        }}
        right={
          <>
            <ThemeToggle />
            <IconButton name="log-out" label="Sign out" onPress={onSignOut} />
          </>
        }
      >
        {!!error && <ErrorNote message={error} onRetry={load} />}

        {!data && !error ? (
          <View style={{ gap: sp.lg, marginTop: sp.lg }}>
            <SkeletonList rows={2} />
            <SkeletonList rows={4} />
          </View>
        ) : data ? (
          <>
            <OverviewSection data={data} shares={shares} />
            <CorrectiveActionsSection
              data={data}
              resolvingId={resolvingId}
              onResolve={resolveAction}
              onOpenInspection={openActionInspection}
            />
            <ImprovementNoticesSection
              data={data}
              onOpenInspection={openCaseInspection}
              onRectify={setOpenRectifyCase}
              onEscalate={escalateCase}
              escalatingId={escalatingId}
            />
            <EscalationsSection data={data} onOpenInspection={openCaseInspection} onIssueFine={setOpenFineCase} />
            <RequirementsSection data={data} maxRule={maxRule} />
            <ReportsSection {...searchProps} feed={feed} setFeed={setFeed} list={list} data={data} />

            <T v="label" tone="faint" style={{ marginTop: sp.xl }}>
              Corrective actions, improvement notices, and fine issuance are confirmed here.
              Evidence photos are captured by inspectors or attached directly when closing a case.
            </T>
          </>
        ) : null}
      </Screen>

      {/* Rendered as siblings of Screen, not inside it: Screen places its
          children inside a ScrollView (see ui/Screen.tsx), and a Sheet's
          position:absolute box sizes itself relative to whatever contains it —
          inside the scroll content, that's the full scrollable page height,
          not the viewport, so the backdrop dims wherever you're scrolled to
          while the actual panel renders far below, off-screen. */}
      {sheets}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sidebar (web only)
// ---------------------------------------------------------------------------

function SidebarItem({
  icon,
  label,
  active,
  badge,
  onPress,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  badge: { count: number; urgent: boolean } | null;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <PressScale
      subtle
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: sp.sm,
        paddingHorizontal: sp.md,
        paddingVertical: sp.sm,
        borderRadius: r.control,
        backgroundColor: active ? c.accentFill : 'transparent',
      }}
    >
      <Icon name={icon} size={16} tone={active ? 'accent' : 'dim'} />
      <T v="label" color={active ? c.accent : undefined} style={{ flex: 1 }}>
        {label}
      </T>
      {!!badge && badge.count > 0 && (
        <Pill label={String(badge.count)} tone={badge.urgent ? 'fail' : 'neutral'} />
      )}
    </PressScale>
  );
}

// ---------------------------------------------------------------------------
// Dashboard sections — shared between the web sidebar layout (one section
// visible at a time) and the native single-scroll layout (all stacked).
// ---------------------------------------------------------------------------

function OverviewSection({
  data,
  shares,
}: {
  data: Dashboard;
  shares: { key: string; label: string; value: number; color: string }[];
}) {
  const { c } = useTheme();
  return (
    <>
      <Reveal>
        <View
          style={{
            borderWidth: 1,
            borderColor: c.line,
            borderRadius: r.container,
            backgroundColor: c.surface,
            padding: sp.lg,
            gap: sp.lg,
            marginTop: sp.md,
            ...tintedShadow(c.accent, { alpha: 0.1, y: 6, blur: 16 }),
          }}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp.xl }}>
            <Readout large value={String(data.total_inspections)} label="Reports" />
            <Readout value={String(data.completed_reports)} label="Classified" tone={c.textDim} />
            <Readout
              value={String(data.processing + data.draft)}
              label="In progress"
              tone={data.processing + data.draft > 0 ? c.accent : c.textDim}
            />
          </View>
          <ShareBar shares={shares} />
        </View>
      </Reveal>

      {!!data.weekly_trend.length && (
        <>
          <SectionHeader>Eight-week trend</SectionHeader>
          <Reveal>
            <View
              style={{
                borderWidth: 1,
                borderColor: c.line,
                borderRadius: r.container,
                backgroundColor: c.surface,
                padding: sp.lg,
                ...tintedShadow(c.accent, { alpha: 0.1, y: 6, blur: 16 }),
              }}
            >
              <TrendChart points={data.weekly_trend} />
            </View>
          </Reveal>
        </>
      )}
    </>
  );
}

function CorrectiveActionsSection({
  data,
  resolvingId,
  onResolve,
  onOpenInspection,
}: {
  data: Dashboard;
  resolvingId: string | null;
  onResolve: (action: CorrectiveAction) => void;
  onOpenInspection: (action: CorrectiveAction) => void;
}) {
  return (
    <>
      <SectionHeader
        right={
          data.overdue_corrective_actions > 0 ? (
            <Pill label={`${data.overdue_corrective_actions} overdue`} tone="fail" />
          ) : undefined
        }
      >
        Corrective actions
      </SectionHeader>
      {data.corrective_actions.length ? (
        <Group>
          {data.corrective_actions.map((action, index) => (
            <Reveal key={action.id} index={index}>
              <CorrectiveActionRow
                action={action}
                resolving={resolvingId === action.id}
                onResolve={() => onResolve(action)}
                onOpenInspection={() => onOpenInspection(action)}
              />
            </Reveal>
          ))}
        </Group>
      ) : (
        <Empty
          icon="check-circle"
          title="No open corrective actions"
          body="A case opens automatically the first time a Panchnama is generated for a violation."
        />
      )}
    </>
  );
}

function ImprovementNoticesSection({
  data,
  onOpenInspection,
  onRectify,
  onEscalate,
  escalatingId,
}: {
  data: Dashboard;
  onOpenInspection: (violationCase: ViolationCase) => void;
  onRectify: (violationCase: ViolationCase) => void;
  onEscalate: (violationCase: ViolationCase) => void;
  escalatingId: string | null;
}) {
  return (
    <>
      <SectionHeader
        right={
          data.overdue_violation_cases > 0 ? (
            <Pill label={`${data.overdue_violation_cases} overdue`} tone="fail" />
          ) : undefined
        }
      >
        Improvement notices
      </SectionHeader>
      {data.violation_cases.length ? (
        <Group>
          {data.violation_cases.map((violationCase, index) => (
            <Reveal key={violationCase.id} index={index}>
              <ViolationCaseRow
                violationCase={violationCase}
                onOpenInspection={() => onOpenInspection(violationCase)}
                onRectify={() => onRectify(violationCase)}
                onEscalate={() => onEscalate(violationCase)}
                escalating={escalatingId === violationCase.id}
              />
            </Reveal>
          ))}
        </Group>
      ) : (
        <Empty
          icon="check-circle"
          title="No open improvement notices"
          body="A correction window opens when a FAIL finding is confirmed as a violation and linked to a manufacturer."
        />
      )}
    </>
  );
}

function EscalationsSection({
  data,
  onOpenInspection,
  onIssueFine,
}: {
  data: Dashboard;
  onOpenInspection: (violationCase: ViolationCase) => void;
  onIssueFine: (violationCase: ViolationCase) => void;
}) {
  return (
    <>
      <SectionHeader
        right={
          data.pending_fine_recommendations > 0 ? (
            <Pill label={`${data.pending_fine_recommendations} pending`} tone="fail" />
          ) : undefined
        }
      >
        Escalated — pending fine issuance
      </SectionHeader>
      {data.escalation_queue.length ? (
        <Group>
          {data.escalation_queue.map((violationCase, index) => (
            <Reveal key={violationCase.id} index={index}>
              <EscalationRow
                violationCase={violationCase}
                onOpenInspection={() => onOpenInspection(violationCase)}
                onIssueFine={() => onIssueFine(violationCase)}
              />
            </Reveal>
          ))}
        </Group>
      ) : (
        <Empty
          icon="check-circle"
          title="Nothing pending fine issuance"
          body="A case lands here automatically when its correction window lapses without being rectified."
        />
      )}
    </>
  );
}

function RequirementsSection({ data, maxRule }: { data: Dashboard; maxRule: number }) {
  const { c } = useTheme();
  return (
    <>
      <SectionHeader>Most failed requirements</SectionHeader>
      {data.violation_by_rule.length ? (
        <Group>
          {data.violation_by_rule.slice(0, 6).map((rule, index) => (
            <Reveal key={rule.rule_id} index={index}>
              <RankRow title={rule.requirement} meta={rule.rule_id} count={rule.count} max={maxRule} />
            </Reveal>
          ))}
        </Group>
      ) : (
        <Empty
          icon="check-circle"
          title="No failed checks yet"
          body="Requirements appear here once the rule engine records a failure."
        />
      )}

      {!!data.inspections_by_category.length && (
        <>
          <SectionHeader>By commodity category</SectionHeader>
          <Group>
            {data.inspections_by_category.slice(0, 6).map((row) => (
              <DataRow
                key={row.category}
                label={row.category[0].toUpperCase() + row.category.slice(1)}
                value={`${row.violations} / ${row.total_inspections}`}
                tone={row.violations > 0 ? c.fail : undefined}
              />
            ))}
            <DataRow label="Read as" value="violations / reports" mono={false} />
          </Group>
        </>
      )}
    </>
  );
}

type ReportsSearchProps = {
  filtersOpen: boolean;
  setFiltersOpen: (updater: (open: boolean) => boolean) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  searchStatus: InspectionStatus | null;
  setSearchStatus: (value: InspectionStatus | null) => void;
  dateFrom: string;
  setDateFrom: (value: string) => void;
  dateTo: string;
  setDateTo: (value: string) => void;
  searching: boolean;
  searchError: string | null;
  searchResults: Inspection[] | null;
  runSearch: () => void;
  clearSearch: () => void;
  onOpen: (inspection: Inspection) => void;
};

function ReportsSection({
  data,
  feed,
  setFeed,
  list,
  filtersOpen,
  setFiltersOpen,
  searchQuery,
  setSearchQuery,
  searchStatus,
  setSearchStatus,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  searching,
  searchError,
  searchResults,
  runSearch,
  clearSearch,
  onOpen,
}: ReportsSearchProps & { data: Dashboard; feed: Feed; setFeed: (feed: Feed) => void; list: Inspection[] }) {
  const { c } = useTheme();
  return (
    <>
      <SectionHeader>Search inspections</SectionHeader>
      <Disclosure
        label="Search & filter"
        open={filtersOpen}
        onToggle={() => setFiltersOpen((open) => !open)}
        detail={
          searchResults ? (
            <T v="label" tone="dim">
              {searchResults.length} match{searchResults.length === 1 ? '' : 'es'}
            </T>
          ) : undefined
        }
      >
        <Field
          label="Search"
          icon="search"
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Product, manufacturer, or outlet"
          autoCapitalize="none"
        />
        <View style={{ gap: sp.sm }}>
          <T v="label" tone="dim">
            Status
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp.sm }}>
            {SEARCH_STATUSES.map((status) => (
              <Chip
                key={status}
                label={inspectionLabel[status]}
                selected={searchStatus === status}
                onPress={() => setSearchStatus(searchStatus === status ? null : status)}
              />
            ))}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: sp.md }}>
          <Field
            label="From"
            icon="calendar"
            value={dateFrom}
            onChangeText={setDateFrom}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            style={{ flex: 1 }}
          />
          <Field
            label="To"
            icon="calendar"
            value={dateTo}
            onChangeText={setDateTo}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            style={{ flex: 1 }}
          />
        </View>
        {!!searchError && (
          <T v="label" color={c.fail}>
            {searchError}
          </T>
        )}
        <View style={{ flexDirection: 'row', gap: sp.md }}>
          <Button label="Search" icon="search" onPress={runSearch} loading={searching} style={{ flex: 1 }} />
          <Button label="Clear" variant="secondary" onPress={clearSearch} />
        </View>
      </Disclosure>

      {searchResults !== null && (
        <View style={{ marginTop: sp.md }}>
          {searchResults.length ? (
            <Group>
              {searchResults.map((item) => (
                <ReportRow key={item.id} item={item} onPress={() => onOpen(item)} />
              ))}
            </Group>
          ) : (
            <Empty icon="search" title="No matches" body="Try a different search term, status, or date range." />
          )}
        </View>
      )}

      <SectionHeader>Reports</SectionHeader>
      <View style={{ gap: sp.md }}>
        <Segmented
          value={feed}
          onChange={setFeed}
          segments={[
            { value: 'recent', label: 'Recent', count: data.recent_inspections.length },
            { value: 'violations', label: 'Violations', count: data.violation_reports.length },
          ]}
        />
        {list.length ? (
          <Group>
            {list.map((item) => (
              <ReportRow key={item.id} item={item} onPress={() => onOpen(item)} />
            ))}
          </Group>
        ) : (
          <Empty
            icon={feed === 'recent' ? 'file-text' : 'shield'}
            title={feed === 'recent' ? 'No reports submitted' : 'No violations recorded'}
            body="Inspectors capture panels in the field; submitted reports land here."
          />
        )}
      </View>
    </>
  );
}

function ReportRow({ item, onPress }: { item: Inspection; onPress: () => void }) {
  const failures = item.findings.filter((finding) => finding.status === 'FAIL').length;
  return (
    <Row onPress={onPress} accessibilityLabel={`${item.product_name ?? 'Unnamed product'}, ${item.status}`}>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', gap: sp.sm }}>
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
          {[item.outlet_name || 'Outlet not recorded', failures ? `${failures} failed` : null]
            .filter(Boolean)
            .join('  ·  ')}
        </T>
      </View>
      <StatusPill status={item.status} />
      <Icon name="chevron-right" size={16} tone="faint" />
    </Row>
  );
}

function CorrectiveActionRow({
  action,
  resolving,
  onResolve,
  onOpenInspection,
}: {
  action: CorrectiveAction;
  resolving: boolean;
  onResolve: () => void;
  onOpenInspection: () => void;
}) {
  const daysLabel = dueDateLabel(action.due_at, action.is_overdue);

  return (
    <View style={{ paddingHorizontal: sp.lg, paddingVertical: sp.md, gap: sp.md }}>
      <Row
        onPress={onOpenInspection}
        style={{ paddingHorizontal: 0, paddingVertical: 0, minHeight: 0 }}
        accessibilityLabel={`${action.inspection.product_name ?? 'Unnamed product'}, ${daysLabel}`}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <T v="monoMicro" tone="faint">
            {action.inspection.reference}
          </T>
          <T v="bodyStrong" numberOfLines={1}>
            {action.inspection.product_name || 'Unnamed product'}
          </T>
          <T v="label" tone="dim" numberOfLines={1}>
            {action.inspection.outlet_name || 'Outlet not recorded'}
          </T>
        </View>
        <Pill label={daysLabel} tone={action.is_overdue ? 'fail' : 'review'} />
        <Icon name="chevron-right" size={16} tone="faint" />
      </Row>
      <Button
        label="Mark resolved"
        variant="secondary"
        size="md"
        icon="check"
        loading={resolving}
        onPress={onResolve}
      />
    </View>
  );
}

/**
 * `Math.ceil` on a small negative fraction (overdue by a few hours) rounds
 * toward zero, so "3 hours overdue" was displaying as "0 days overdue" —
 * a direct contradiction next to the OVERDUE badge. Falls through to hours,
 * then to a bare "Overdue"/"Due soon" once even hours would round to 0.
 */
function dueDateLabel(dueAtIso: string, isOverdue: boolean): string {
  const diffMs = Math.abs(new Date(dueAtIso).getTime() - Date.now());
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor(diffMs / (60 * 60 * 1000));

  if (isOverdue) {
    if (days >= 1) return `${days} day${days === 1 ? '' : 's'} overdue`;
    if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'} overdue`;
    return 'Overdue';
  }
  if (days >= 1) return `Due in ${days} day${days === 1 ? '' : 's'}`;
  if (hours >= 1) return `Due in ${hours} hour${hours === 1 ? '' : 's'}`;
  return 'Due soon';
}

function offenceLabel(n: number) {
  if (n === 1) return '1st offence';
  if (n === 2) return '2nd offence';
  if (n === 3) return '3rd offence';
  return `${n}th offence`;
}

function ViolationCaseRow({
  violationCase,
  onOpenInspection,
  onRectify,
  onEscalate,
  escalating,
}: {
  violationCase: ViolationCase;
  onOpenInspection: () => void;
  onRectify: () => void;
  onEscalate: () => void;
  escalating: boolean;
}) {
  const daysLabel = dueDateLabel(violationCase.window_due_at, violationCase.is_overdue);

  return (
    <View style={{ paddingHorizontal: sp.lg, paddingVertical: sp.md, gap: sp.md }}>
      <Row
        onPress={onOpenInspection}
        style={{ paddingHorizontal: 0, paddingVertical: 0, minHeight: 0 }}
        accessibilityLabel={`${violationCase.manufacturer.name}, ${violationCase.requirement}, ${daysLabel}`}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <T v="monoMicro" tone="faint">
            {violationCase.rule_id} · {offenceLabel(violationCase.offence_number)}
          </T>
          <T v="bodyStrong" numberOfLines={1}>
            {violationCase.manufacturer.name}
          </T>
          <T v="label" tone="dim" numberOfLines={1}>
            {violationCase.requirement}
          </T>
        </View>
        <Pill label={daysLabel} tone={violationCase.is_overdue ? 'fail' : 'review'} />
        <Icon name="chevron-right" size={16} tone="faint" />
      </Row>
      <View style={{ flexDirection: 'row', gap: sp.sm }}>
        <Button label="Rectify" variant="secondary" size="md" icon="check" onPress={onRectify} style={{ flex: 1 }} />
        {violationCase.is_overdue && (
          <Button
            label="Escalate now"
            variant="danger"
            size="md"
            icon="arrow-up-circle"
            onPress={onEscalate}
            loading={escalating}
            style={{ flex: 1 }}
          />
        )}
      </View>
    </View>
  );
}

function EscalationRow({
  violationCase,
  onOpenInspection,
  onIssueFine,
}: {
  violationCase: ViolationCase;
  onOpenInspection: () => void;
  onIssueFine: () => void;
}) {
  return (
    <View style={{ paddingHorizontal: sp.lg, paddingVertical: sp.md, gap: sp.md }}>
      <Row
        onPress={onOpenInspection}
        style={{ paddingHorizontal: 0, paddingVertical: 0, minHeight: 0 }}
        accessibilityLabel={`${violationCase.manufacturer.name}, ${violationCase.requirement}`}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <T v="monoMicro" tone="faint">
            {violationCase.rule_id} · {offenceLabel(violationCase.offence_number)}
          </T>
          <T v="bodyStrong" numberOfLines={1}>
            {violationCase.manufacturer.name}
          </T>
          <T v="label" tone="dim" numberOfLines={1}>
            Notice {shortDate(violationCase.confirmed_at)} · Window expired {shortDate(violationCase.window_due_at)}
          </T>
        </View>
        <Pill label="Pending fine" tone="fail" />
        <Icon name="chevron-right" size={16} tone="faint" />
      </Row>
      <Button label="Issue fine" variant="danger" size="md" icon="alert-triangle" onPress={onIssueFine} />
    </View>
  );
}

function RectifySheet({
  base,
  token,
  violationCase,
  onClose,
  onDone,
}: {
  base: string;
  token: string;
  violationCase: ViolationCase;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [current, setCurrent] = useState(violationCase);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState('');
  const [rectifying, setRectifying] = useState(false);

  const attachEvidence = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error('Photo library access is needed to attach evidence.');
      return;
    }
    const choice = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (choice.canceled) return;
    const asset = choice.assets[0];
    try {
      setUploading(true);
      const updated = await api.uploadRectificationEvidence(
        base,
        token,
        current.id,
        { uri: asset.uri, fileName: asset.fileName ?? 'evidence.jpg', mimeType: asset.mimeType ?? 'image/jpeg' },
        note.trim() || undefined,
      );
      setCurrent(updated);
      toast.success('Evidence attached.');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not attach evidence.');
    } finally {
      setUploading(false);
    }
  };

  const rectify = async () => {
    if (rectifying || current.evidence.length === 0) return;
    try {
      setRectifying(true);
      await api.rectifyCase(base, token, current.id, note.trim() || undefined);
      toast.success('Case closed as rectified.');
      onDone();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not close this case.');
    } finally {
      setRectifying(false);
    }
  };

  return (
    <Sheet title="Rectify case" onClose={onClose}>
      <View style={{ gap: sp.xs }}>
        <T v="labelStrong">{current.manufacturer.name}</T>
        <T v="label" tone="dim">
          {current.requirement} — evidence of correction (corrected artwork photo, re-inspection
          record) is required before this case can be closed.
        </T>
      </View>

      <Group>
        {current.evidence.length ? (
          current.evidence.map((file) => (
            <DataRow key={file.id} label={file.original_filename} value={`${Math.round(file.size_bytes / 1024)} KB`} />
          ))
        ) : (
          <View style={{ padding: sp.lg }}>
            <T v="label" tone="dim">
              No evidence attached yet.
            </T>
          </View>
        )}
      </Group>

      <Button
        label="Attach evidence photo"
        variant="secondary"
        icon="image"
        loading={uploading}
        onPress={attachEvidence}
      />

      <Field
        label="Note (optional)"
        icon="edit"
        value={note}
        onChangeText={setNote}
        placeholder="e.g. Re-inspected on-site, label corrected"
      />

      <Button
        label="Confirm rectified — close case"
        icon="check"
        variant="primary"
        loading={rectifying}
        disabled={current.evidence.length === 0}
        onPress={rectify}
      />
      {current.evidence.length === 0 && (
        <T v="label" tone="dim" style={{ textAlign: 'center' }}>
          Attach at least one evidence file to close this case.
        </T>
      )}
    </Sheet>
  );
}

function IssueFineSheet({
  base,
  token,
  violationCase,
  onClose,
  onDone,
}: {
  base: string;
  token: string;
  violationCase: ViolationCase;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const issue = async () => {
    if (submitting || !amount.trim()) return;
    try {
      setSubmitting(true);
      await api.issueFine(base, token, violationCase.id, {
        fine_amount: amount.trim(),
        fine_notes: notes.trim() || undefined,
      });
      toast.success('Fine issued.');
      onDone();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not issue the fine.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet title="Issue fine" onClose={onClose}>
      <View style={{ gap: sp.xs }}>
        <T v="labelStrong">{violationCase.manufacturer.name}</T>
        <T v="label" tone="dim">
          {violationCase.requirement} — {offenceLabel(violationCase.offence_number)} on this
          provision.
        </T>
      </View>

      <Group>
        <DataRow label="Legal reference" value={violationCase.legal_reference} mono={false} />
        <DataRow label="Notice issued" value={shortDate(violationCase.confirmed_at)} />
        <DataRow label="Window expired" value={shortDate(violationCase.window_due_at)} />
      </Group>

      <T v="label" tone="dim">
        No statutory amount is calculated automatically — enter the fine amount you are issuing.
      </T>
      <Field label="Fine amount *" icon="dollar-sign" value={amount} onChangeText={setAmount} keyboardType="numeric" />
      <Field label="Notes (optional)" icon="edit" value={notes} onChangeText={setNotes} />

      <Button
        label="Confirm issuance"
        icon="check"
        variant="danger"
        loading={submitting}
        disabled={!amount.trim()}
        onPress={issue}
      />
    </Sheet>
  );
}
