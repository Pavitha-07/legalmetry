import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { css, useReducedMotion } from 'react-native-reanimated';
// expo-file-system's SDK 54+ default export is a new File/Directory API that
// dropped cacheDirectory/writeAsStringAsync/EncodingType entirely — the old
// API this screen needs lives at the /legacy subpath now.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  api,
  failedJob,
  findingLabel,
  isSettled,
  latestJobDetail,
  type Finding,
  type Inspection,
  type Manufacturer,
  type Session,
} from '../api';
import { r, sp, toneColors, useTheme } from '../theme';
import { ActionBar, Button } from '../ui/Button';
import { Compare } from '../ui/Compare';
import { Disclosure, Field } from '../ui/Field';
import { Icon } from '../ui/Icon';
import { Readout } from '../ui/Meter';
import { FindingPill, StatusPill, findingTone } from '../ui/Pill';
import { Reveal } from '../ui/Reveal';
import { Screen } from '../ui/Screen';
import { Sheet } from '../ui/Sheet';
import { SkeletonList } from '../ui/Skeleton';
import { DataRow, Divider, Empty, ErrorNote, Group, Row, SectionHeader, T } from '../ui/primitives';
import { useToast } from '../ui/Toast';

const RANK: Record<Finding['status'], number> = {
  FAIL: 0,
  NEEDS_REVIEW: 1,
  PASS: 2,
  NOT_APPLICABLE: 3,
};

export function Analysis({
  base,
  session,
  inspection: initial,
  onBack,
  onViewReport,
}: {
  base: string;
  session: Session;
  inspection: Inspection;
  onBack: () => void;
  onViewReport: (inspection: Inspection) => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [report, setReport] = useState<Inspection>(initial);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [openFinding, setOpenFinding] = useState<Finding | null>(null);
  const [showAllHeights, setShowAllHeights] = useState(false);
  const [showNotApplicable, setShowNotApplicable] = useState(false);
  const [showExtractedText, setShowExtractedText] = useState(false);
  const [evidence, setEvidence] = useState<{ calibration: string; ocr: string } | null>(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);

  // Report generation state
  const [generatingProforma, setGeneratingProforma] = useState(false);
  const [generatingSeizure, setGeneratingSeizure] = useState(false);
  const [showPanchnamaSheet, setShowPanchnamaSheet] = useState(false);
  const [showComplianceSheet, setShowComplianceSheet] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await api.inspection(base, session.token, initial.id);
      setReport(next);
      setError(null);
      return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not refresh this report.');
      return null;
    }
  }, [base, session.token, initial.id]);

  const settled = isSettled(report.status);
  const isViolation = report.status === 'violation';
  const isCompliant = report.status === 'compliant';

  useEffect(() => {
    if (settled) return;
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [settled, refresh]);

  const detail = useMemo(() => latestJobDetail(report), [report]);
  const failure = useMemo(() => failedJob(report), [report]);
  const font = report.extracted_data?.font_measurements;
  const calibration = detail?.calibration;
  const confidence = report.extracted_data?.ocr_confidence;

  const findings = useMemo(
    () =>
      [...report.findings].sort(
        (a, b) => RANK[a.status] - RANK[b.status] || a.rule_id.localeCompare(b.rule_id),
      ),
    [report.findings],
  );
  const active = findings.filter((f) => f.status !== 'NOT_APPLICABLE');
  const inactive = findings.filter((f) => f.status === 'NOT_APPLICABLE');

  const heights = useMemo(
    () => [...(font?.measurements ?? [])].sort((a, b) => a.height_mm - b.height_mm),
    [font],
  );

  const uploads = report.panels.flatMap((panel) => panel.uploads);
  const stored = uploads.length;
  // Per-panel shots (1 or 2), scaled by however many panels this inspection
  // actually has — this inspection can have more than one panel, so the
  // shot count must account for all of them, not just the first pair.
  const requiredShots = (report.measure_font_size ? 2 : 1) * Math.max(1, report.panels.length);

  const openEvidence = async () => {
    const calibrationFile = uploads.find((file) => file.shot_type === 'calibration');
    const ocrFile = uploads.find((file) => file.shot_type === 'ocr');
    if (!calibrationFile || !ocrFile) {
      toast.error('Both stored shots are needed to compare framing.');
      return;
    }
    try {
      setLoadingEvidence(true);
      const [a, b] = await Promise.all([
        api.evidenceUrl(base, session.token, calibrationFile.id),
        api.evidenceUrl(base, session.token, ocrFile.id),
      ]);
      setEvidence({ calibration: a.url, ocr: b.url });
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not open the evidence.');
    } finally {
      setLoadingEvidence(false);
    }
  };

  const handleReviewed = useCallback(async () => {
    setOpenFinding(null);
    await refresh();
  }, [refresh]);

  // ---- Report download helpers -------------------------------------------

  const openPdf = async (dataUriOrObjectUrl: string, filename: string) => {
    if (Platform.OS === 'web') {
      // Web: object URL — open in new tab so browser PDF viewer shows it.
      const a = document.createElement('a');
      a.href = dataUriOrObjectUrl;
      a.target = '_blank';
      a.download = filename;
      a.click();
      return;
    }
    // Native: data-URI from FileReader — write to cache then share/open.
    try {
      const path = `${FileSystem.cacheDirectory}${filename}`;
      // data-URI format: "data:application/pdf;base64,<base64data>"
      const base64 = dataUriOrObjectUrl.split(',')[1];
      await FileSystem.writeAsStringAsync(path, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, {
          mimeType: 'application/pdf',
          dialogTitle: filename,
          UTI: 'com.adobe.pdf',
        });
      }
    } catch {
      toast.error('Could not open the PDF on this device.');
    }
  };

  const handleProforma = async () => {
    if (generatingProforma) return;
    try {
      setGeneratingProforma(true);
      const url = await api.downloadProforma(base, session.token, report.id);
      openPdf(url, `${report.reference}-proforma.pdf`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not generate the proforma.');
    } finally {
      setGeneratingProforma(false);
    }
  };

  const handleSeizureMemo = async () => {
    if (generatingSeizure) return;
    try {
      setGeneratingSeizure(true);
      const url = await api.downloadSeizureMemo(base, session.token, report.id);
      openPdf(url, `${report.reference}-seizure-memo.pdf`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not generate the seizure memo.');
    } finally {
      setGeneratingSeizure(false);
    }
  };

  return (
    <>
      <Screen
        title={report.product_name || 'Package panel'}
        eyebrow={report.reference}
        onBack={onBack}
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await refresh();
          setRefreshing(false);
        }}
        right={<StatusPill status={report.status} />}
        footer={
          <ActionBar inset={insets.bottom}>
            {settled && (
              <Button
                label="Download Proforma"
                icon="file-text"
                onPress={handleProforma}
                loading={generatingProforma}
                full
              />
            )}
            <Button label="Back to inspections" variant="secondary" onPress={onBack} full />
          </ActionBar>
        }
      >
        {!!error && <ErrorNote message={error} onRetry={refresh} />}
        {!!failure && (
          <View style={{ marginTop: sp.md }}>
            <ErrorNote
              message={`Analysis failed on the server. ${failure.detail ?? ''}`.trim()}
              onRetry={refresh}
            />
          </View>
        )}

        {/* Progress */}
        <SectionHeader>Pipeline</SectionHeader>
        <Group>
          <Step
            title="Evidence stored"
            note={`${stored} of ${requiredShots} shot${requiredShots === 1 ? '' : 's'} hashed and written to object storage`}
            state={stored >= requiredShots ? 'done' : 'active'}
          />
          <Step
            title={report.measure_font_size ? 'Coin scale and text reading' : 'Text reading'}
            note={
              calibration
                ? calibration.status === 'calibrated'
                  ? 'Coin found, millimetre scale derived'
                  : calibration.reason
                : report.measure_font_size
                  ? 'Ellipse fit on the coin outline, then OCR on the coin-free shot'
                  : 'OCR reads the label photo directly'
            }
            state={detail ? 'done' : stored >= requiredShots ? 'active' : 'pending'}
          />
          <Step
            title="Rules evaluated"
            note={
              report.findings.length
                ? `${report.findings.length} rules checked against the 2011 Packaged Commodities Rules`
                : 'Deterministic rule engine, no model judgement in this step'
            }
            state={report.findings.length ? 'done' : detail ? 'active' : 'pending'}
          />
        </Group>

        {/* Scale and confidence */}
        <SectionHeader>Scale and confidence</SectionHeader>
        {font?.status === 'not_requested' ? (
          <Reveal>
            <View
              style={{
                borderWidth: 1,
                borderColor: c.line,
                borderRadius: r.container,
                backgroundColor: c.surface,
                padding: sp.lg,
                gap: sp.lg,
              }}
            >
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp.xl }}>
                <Readout
                  large
                  value={confidence != null ? `${Math.round(confidence * 100)}` : 'n/a'}
                  unit="%"
                  label="OCR confidence"
                  tone={
                    confidence == null ? undefined : confidence >= 0.85 ? c.pass : c.review
                  }
                />
              </View>

              <Divider />

              <View style={{ gap: sp.sm }}>
                <T v="label" tone="dim">
                  Font-size measurement was not requested for this inspection, so no coin scale
                  was derived. The font-height requirement is marked not applicable.
                </T>
                {confidence != null && confidence < 0.85 && (
                  <T v="label" color={c.review}>
                    Below the 0.85 confidence gate, so failing declaration checks were routed for
                    human review instead of being called violations.
                  </T>
                )}
              </View>
            </View>
          </Reveal>
        ) : calibration || font ? (
          <Reveal>
            <View
              style={{
                borderWidth: 1,
                borderColor: c.line,
                borderRadius: r.container,
                backgroundColor: c.surface,
                padding: sp.lg,
                gap: sp.lg,
              }}
            >
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp.xl }}>
                <Readout
                  large
                  value={font?.pixels_per_mm ? font.pixels_per_mm.toFixed(2) : 'n/a'}
                  unit="px/mm"
                  label="Coin scale"
                  tone={font?.status === 'calibrated' ? c.accent : c.review}
                />
                <Readout
                  value={
                    calibration?.tilt_ratio != null ? calibration.tilt_ratio.toFixed(3) : 'n/a'
                  }
                  label="Tilt ratio"
                />
                <Readout
                  value={confidence != null ? `${Math.round(confidence * 100)}` : 'n/a'}
                  unit="%"
                  label="OCR confidence"
                  tone={
                    confidence == null ? undefined : confidence >= 0.85 ? c.pass : c.review
                  }
                />
              </View>

              <Divider />

              <View style={{ gap: sp.sm }}>
                {!!calibration && (
                  <T v="label" tone="dim">
                    {calibration.reason}
                  </T>
                )}
                {font?.pair_scale_check && (
                  <T
                    v="label"
                    color={font.pair_scale_check.dimensions_match ? c.textDim : c.review}
                  >
                    {font.pair_scale_check.dimensions_match
                      ? 'Both shots have matching pixel dimensions.'
                      : 'The two shots differ in pixel dimensions, so the scale may not transfer.'}
                  </T>
                )}
                {confidence != null && confidence < 0.85 && (
                  <T v="label" color={c.review}>
                    Below the 0.85 confidence gate, so failing declaration checks were routed for
                    human review instead of being called violations.
                  </T>
                )}
              </View>
            </View>
          </Reveal>
        ) : settled ? (
          <Empty icon="target" title="No scale was recorded" body="The calibration shot did not yield a usable coin outline." />
        ) : (
          <SkeletonList rows={2} />
        )}

        {!!heights.length && (
          <Reveal>
            <SectionHeader
              right={
                heights.length > 5 ? (
                  <Button
                    label={`All ${heights.length}`}
                    variant="ghost"
                    size="md"
                    onPress={() => setShowAllHeights(true)}
                  />
                ) : undefined
              }
            >
              Measured text height
            </SectionHeader>
            <Group>
              {heights.slice(0, 5).map((measurement, index) => (
                <HeightRow key={`${measurement.text}-${index}`} measurement={measurement} />
              ))}
            </Group>
            <T v="label" tone="faint" style={{ marginTop: sp.sm }}>
              {font?.note ??
                'Measurements are evidence for review. Legal minimum-height thresholds are not encoded yet.'}
            </T>
          </Reveal>
        )}

        {/* Findings */}
        <SectionHeader>Findings</SectionHeader>
        {active.length ? (
          <Group>
            {active.map((finding, index) => (
              <Reveal key={finding.id} index={index}>
                <FindingRow finding={finding} onPress={() => setOpenFinding(finding)} />
              </Reveal>
            ))}
          </Group>
        ) : settled ? (
          <Empty icon="clipboard" title="No findings were returned" body="The rule engine produced no results for this panel." />
        ) : (
          <SkeletonList rows={3} />
        )}

        {!!inactive.length && (
          <View style={{ marginTop: sp.md }}>
            <Disclosure
              label={`Not applicable (${inactive.length})`}
              open={showNotApplicable}
              onToggle={() => setShowNotApplicable((open) => !open)}
            >
              {inactive.map((finding) => (
                <View key={finding.id} style={{ gap: 2, paddingVertical: sp.xs }}>
                  <T v="labelStrong">{finding.requirement}</T>
                  <T v="label" tone="dim">
                    {finding.reason}
                  </T>
                </View>
              ))}
            </Disclosure>
          </View>
        )}

        {/* Extracted text — every OCR-detected text region, not just what
            the rule engine matched. Findings above only surface the
            handful of fields the rule engine checks against; this is the
            complete read (text -> confidence), row by row like Findings,
            so an inspector can see what OCR actually found rather than
            just the derived pass/fail. */}
        {!!report.extracted_data?.ocr_regions?.length && (
          <View style={{ marginTop: sp.md }}>
            <Disclosure
              label="Extracted text"
              detail={
                <T v="label" tone="dim">
                  {report.extracted_data.ocr_regions.length} region
                  {report.extracted_data.ocr_regions.length === 1 ? '' : 's'}
                </T>
              }
              open={showExtractedText}
              onToggle={() => setShowExtractedText((open) => !open)}
            >
              <Group style={{ borderWidth: 0 }}>
                {report.extracted_data.ocr_regions.map((region, index) => (
                  <DataRow
                    key={`${region.text}-${index}`}
                    label={region.text}
                    value={`${Math.round(region.confidence * 100)}%`}
                    tone={
                      toneColors(c, region.confidence >= 0.85 ? 'pass' : region.confidence >= 0.6 ? 'review' : 'fail')
                        .fg
                    }
                  />
                ))}
              </Group>
            </Disclosure>
          </View>
        )}

        {/* Evidence */}
        <SectionHeader
          right={
            report.measure_font_size && stored >= 2 ? (
              <Button
                label="Compare stored"
                variant="ghost"
                size="md"
                loading={loadingEvidence}
                onPress={openEvidence}
              />
            ) : undefined
          }
        >
          Evidence
        </SectionHeader>
        {uploads.length ? (
          <Group>
            {uploads.map((file) => (
              <DataRow
                key={file.id}
                label={
                  file.shot_type === 'calibration'
                    ? 'Shot A, with coin'
                    : report.measure_font_size
                      ? 'Shot B, no coin'
                      : 'Label photo'
                }
                value={`${file.sha256.slice(0, 12)}…`}
              />
            ))}
            <DataRow label="Integrity" value="SHA-256 per original" mono={false} />
          </Group>
        ) : (
          <Empty icon="image" title="No evidence attached" />
        )}

        {/* ---- Reports section ------------------------------------------ */}
        {settled && (
          <>
            <SectionHeader>Reports</SectionHeader>
            <Group>
              {/* View & edit — the same facts the PDFs below are built from */}
              <Row onPress={() => onViewReport(report)} accessibilityLabel="View report">
                <View
                  style={{
                    width: 34, height: 34, borderRadius: r.control,
                    backgroundColor: c.accentFill, alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Icon name="eye" size={16} tone="accent" />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="bodyStrong">View report</T>
                  <T v="label" tone="dim">
                    {session.role === 'inspector' ? 'View and edit the declared facts' : 'View the declared facts'}
                  </T>
                </View>
                <Icon name="chevron-right" size={16} tone="faint" />
              </Row>

              {/* Proforma — always available once settled */}
              <Row onPress={handleProforma} accessibilityLabel="Download Inspection Proforma">
                <View
                  style={{
                    width: 34, height: 34, borderRadius: r.control,
                    backgroundColor: c.accentFill, alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Icon name="file-text" size={16} tone="accent" />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="bodyStrong">Inspection Proforma</T>
                  <T v="label" tone="dim">Form IV-A · all inspections</T>
                </View>
                {generatingProforma
                  ? <T v="label" tone="dim">Generating…</T>
                  : <Icon name="download" size={16} tone="faint" />}
              </Row>

              {/* Seizure Memo — violation only */}
              {isViolation && (
                <Row onPress={handleSeizureMemo} accessibilityLabel="Download Seizure Memo">
                  <View
                    style={{
                      width: 34, height: 34, borderRadius: r.control,
                      backgroundColor: c.failFill, alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Icon name="alert-triangle" size={16} color={c.fail} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T v="bodyStrong">Seizure Memo</T>
                    <T v="label" tone="dim">Violation record with penalty provisions</T>
                  </View>
                  {generatingSeizure
                    ? <T v="label" tone="dim">Generating…</T>
                    : <Icon name="download" size={16} tone="faint" />}
                </Row>
              )}

              {/* Panchnama — violation only, requires witnesses */}
              {isViolation && (
                <Row
                  onPress={() => setShowPanchnamaSheet(true)}
                  accessibilityLabel="Generate Panchnama"
                >
                  <View
                    style={{
                      width: 34, height: 34, borderRadius: r.control,
                      backgroundColor: c.failFill, alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Icon name="users" size={16} color={c.fail} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T v="bodyStrong">Panchnama</T>
                    <T v="label" tone="dim">Witness record · requires two Panchas</T>
                  </View>
                  <Icon name="chevron-right" size={16} tone="faint" />
                </Row>
              )}

              {/* Compliance record — compliant only, supervisor-confirmed.
                  The positive counterpart to confirm-violation: without
                  this, a manufacturer whose products always pass never
                  shows up in the public lookup at all. */}
              {isCompliant && session.role === 'supervisor' && (
                <Row
                  onPress={() => setShowComplianceSheet(true)}
                  accessibilityLabel="Log clean inspection for manufacturer"
                >
                  <View
                    style={{
                      width: 34, height: 34, borderRadius: r.control,
                      backgroundColor: c.passFill, alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Icon name="check-circle" size={16} color={c.pass} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T v="bodyStrong">Log clean inspection</T>
                    <T v="label" tone="dim">Link this manufacturer for the public compliance lookup</T>
                  </View>
                  <Icon name="chevron-right" size={16} tone="faint" />
                </Row>
              )}
            </Group>
            <T v="label" tone="faint" style={{ marginTop: sp.sm }}>
              {isViolation
                ? 'All three documents are available. Panchnama requires witness details before generation.'
                : 'Seizure Memo and Panchnama are only produced when the outcome is a violation.'}
            </T>
          </>
        )}
      </Screen>

      {showComplianceSheet && (
        <ConfirmComplianceSheet
          inspectionId={report.id}
          base={base}
          token={session.token}
          onClose={() => setShowComplianceSheet(false)}
          onConfirmed={async () => {
            setShowComplianceSheet(false);
            await refresh();
          }}
        />
      )}

      {/* Finding detail sheet */}
      {!!openFinding && (
        <FindingSheet
          finding={openFinding}
          base={base}
          session={session}
          onClose={() => setOpenFinding(null)}
          onReviewed={handleReviewed}
        />
      )}

      {/* All text-height measurements sheet */}
      {showAllHeights && (
        <Sheet title="Measured text height" onClose={() => setShowAllHeights(false)}>
          <Group>
            {heights.map((measurement, index) => (
              <HeightRow key={`${measurement.text}-all-${index}`} measurement={measurement} />
            ))}
          </Group>
        </Sheet>
      )}

      {/* Stored evidence compare sheet */}
      {!!evidence && (
        <Sheet title="Stored evidence" onClose={() => setEvidence(null)} scroll={false}>
          <Compare calibrationUri={evidence.calibration} ocrUri={evidence.ocr} />
          <T v="label" tone="faint">
            Links are short-lived and signed. The object store itself is not public.
          </T>
        </Sheet>
      )}

      {/* Panchnama witness capture sheet */}
      {showPanchnamaSheet && (
        <PanchnamaSheet
          base={base}
          token={session.token}
          inspectionId={report.id}
          reference={report.reference}
          onClose={() => setShowPanchnamaSheet(false)}
          onGenerated={(url) => {
            setShowPanchnamaSheet(false);
            openPdf(url, `${report.reference}-panchnama.pdf`);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function Step({
  title,
  note,
  state,
}: {
  title: string;
  note: string;
  state: 'done' | 'active' | 'pending';
}) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const tint = state === 'done' ? c.pass : state === 'active' ? c.accent : c.textFaint;

  return (
    <Row>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: r.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: state === 'pending' ? c.fill : `${tint}22`,
        }}
      >
        {state === 'done' ? (
          <Icon name="check" size={14} color={tint} />
        ) : (
          <Animated.View
            style={[
              { width: 8, height: 8, borderRadius: 4, backgroundColor: tint },
              state === 'active' && !reduced && pulseDot.dot,
            ]}
          />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="labelStrong" tone={state === 'pending' ? 'faint' : 'text'}>
          {title}
        </T>
        <T v="label" tone={state === 'pending' ? 'faint' : 'dim'}>
          {note}
        </T>
      </View>
    </Row>
  );
}

const breathe = css.keyframes({
  '0%': { opacity: 0.3 },
  '50%': { opacity: 1 },
  '100%': { opacity: 0.3 },
});

const pulseDot = css.create({
  dot: {
    animationName: breathe,
    animationDuration: '1500ms',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
});

// ---------------------------------------------------------------------------
// Height row
// ---------------------------------------------------------------------------

function HeightRow({
  measurement,
}: {
  measurement: { text: string; confidence: number; height_px: number; height_mm: number };
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: sp.lg,
        paddingVertical: sp.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: sp.md,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bodyStrong" numberOfLines={1}>
          {measurement.text}
        </T>
        <T v="monoMicro" tone="faint">
          {measurement.height_px.toFixed(1)} px · {Math.round(measurement.confidence * 100)}% conf
        </T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <T v="monoTitle" color={c.text}>
          {measurement.height_mm.toFixed(2)}
        </T>
        <T v="monoMicro" tone="dim">
          mm
        </T>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Finding row
// ---------------------------------------------------------------------------

function FindingRow({ finding, onPress }: { finding: Finding; onPress: () => void }) {
  const { c } = useTheme();
  const { fg } = toneColors(c, findingTone(finding.status));
  return (
    <Row onPress={onPress} accessibilityLabel={`${finding.requirement}, ${findingLabel[finding.status]}`}>
      <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: fg }} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bodyStrong">{finding.requirement}</T>
        <T v="label" tone="dim" numberOfLines={2}>
          {finding.reason}
        </T>
      </View>
      <FindingPill status={finding.status} />
      <Icon name="chevron-right" size={16} tone="faint" />
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Finding detail + review sheet
// ---------------------------------------------------------------------------

function FindingSheet({
  finding,
  base,
  session,
  onClose,
  onReviewed,
}: {
  finding: Finding;
  base: string;
  session: Session;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const { c } = useTheme();
  const toast = useToast();
  const token = session.token;
  const [reviewing, setReviewing] = useState<'confirm' | 'reject' | null>(null);
  const [showConfirmViolation, setShowConfirmViolation] = useState(false);

  const review = async (action: 'confirm' | 'reject') => {
    if (reviewing) return;
    try {
      setReviewing(action);
      await api.reviewFinding(base, token, finding.id, action);
      toast.success(action === 'confirm' ? 'Marked as violation.' : 'Marked as pass.');
      onReviewed();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not save your review.');
    } finally {
      setReviewing(null);
    }
  };

  return (
    <Sheet title={finding.requirement} onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp.md }}>
        <FindingPill status={finding.status} />
        <T v="mono" tone="faint">
          {finding.rule_id}
        </T>
      </View>

      <Group>
        <DataRow
          label="Detected"
          value={finding.detected_value || 'Nothing detected'}
          tone={finding.detected_value ? undefined : c.textFaint}
        />
        <DataRow label="Legal reference" value={finding.legal_reference} mono={false} />
      </Group>

      <View style={{ gap: sp.sm }}>
        <T v="micro" tone="faint" style={{ textTransform: 'uppercase' }}>
          Reason
        </T>
        <T v="body">{finding.reason}</T>
      </View>

      {!!finding.recommendation && (
        <View
          style={{
            backgroundColor: c.accentFill,
            borderRadius: r.control,
            padding: sp.lg,
            gap: sp.sm,
          }}
        >
          <T v="micro" tone="accent" style={{ textTransform: 'uppercase' }}>
            Recommendation
          </T>
          <T v="body">{finding.recommendation}</T>
        </View>
      )}

      {finding.status === 'NEEDS_REVIEW' ? (
        <View style={{ gap: sp.md }}>
          <View style={{ backgroundColor: c.reviewFill, borderRadius: r.control, padding: sp.md }}>
            <T v="label" color={c.review} style={{ textAlign: 'center' }}>
              This finding needs your decision. It will not become a violation until you confirm it.
            </T>
          </View>
          <View style={{ flexDirection: 'row', gap: sp.md }}>
            <Button
              label="Reject — pass"
              icon="check"
              variant="secondary"
              loading={reviewing === 'reject'}
              disabled={reviewing === 'confirm'}
              onPress={() => review('reject')}
              style={{ flex: 1 }}
            />
            <Button
              label="Confirm violation"
              icon="alert-triangle"
              variant="danger"
              loading={reviewing === 'confirm'}
              disabled={reviewing === 'reject'}
              onPress={() => review('confirm')}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : finding.status === 'FAIL' && session.role === 'supervisor' ? (
        <View style={{ gap: sp.md }}>
          <T v="label" tone="dim">
            Escalate this to the manufacturer: open a correction window and start tracking repeat
            offences on this provision.
          </T>
          <Button
            label="Confirm as violation — open correction window"
            icon="flag"
            variant="danger"
            onPress={() => setShowConfirmViolation(true)}
          />
        </View>
      ) : (
        <T v="label" tone="faint">
          Findings routed for review are yours to confirm or reject. Nothing here becomes a
          violation on its own.
        </T>
      )}

      {showConfirmViolation && (
        <ConfirmViolationSheet
          finding={finding}
          base={base}
          token={token}
          onClose={() => setShowConfirmViolation(false)}
          onConfirmed={() => {
            setShowConfirmViolation(false);
            onReviewed();
          }}
        />
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Supervisor confirm-violation sheet: link/create a manufacturer, set the
// correction window, and open a ViolationCase. Distinct from the inspector's
// NEEDS_REVIEW confirm/reject above — this only appears for an already-FAIL
// finding and starts the escalation workflow, not a rule-engine decision.
// ---------------------------------------------------------------------------

function ConfirmViolationSheet({
  finding,
  base,
  token,
  onClose,
  onConfirmed,
}: {
  finding: Finding;
  base: string;
  token: string;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Manufacturer[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Manufacturer | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [days, setDays] = useState('15');
  const [submitting, setSubmitting] = useState(false);

  const search = async () => {
    if (searching) return;
    try {
      setSearching(true);
      setResults(await api.searchManufacturers(base, token, query.trim() || undefined));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not search manufacturers.');
    } finally {
      setSearching(false);
    }
  };

  const blocker =
    !selected && !creatingNew
      ? 'Select an existing manufacturer or create a new one.'
      : creatingNew && !newName.trim()
        ? 'Enter the manufacturer name.'
        : null;

  const confirm = async () => {
    if (blocker || submitting) return;
    try {
      setSubmitting(true);
      const correctionDays = Math.max(1, Math.min(180, parseInt(days, 10) || 15));
      const result = await api.confirmViolation(base, token, finding.id, {
        manufacturer_id: selected?.id,
        new_manufacturer: creatingNew ? { name: newName.trim(), address: newAddress.trim() || undefined } : undefined,
        correction_period_days: correctionDays,
      });
      // confirm-violation is idempotent per (inspection, provision) — if this
      // exact violation was already confirmed before, the backend returns
      // that existing case rather than opening a second window. When that
      // case has since moved past AWAITING_RECTIFICATION, nothing new
      // actually happened here, so say so instead of a blanket "opened."
      if (result.status === 'awaiting_rectification') {
        toast.success('Correction window open.');
      } else {
        const label =
          result.status === 'rectified_closed' ? 'already rectified and closed'
          : result.status === 'fine_issued' ? 'already fined'
          : result.status === 'escalated_pending_fine' ? 'already escalated, pending fine issuance'
          : result.status;
        toast.error(`This violation was already confirmed and is ${label} — no new window was opened.`);
      }
      onConfirmed();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not open the correction window.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet title="Confirm violation" onClose={onClose}>
      <View style={{ gap: sp.xs }}>
        <T v="labelStrong">{finding.requirement}</T>
        <T v="label" tone="dim">
          Link the manufacturer this violation belongs to. Offence counting for escalation is
          tracked per manufacturer, per provision.
        </T>
      </View>

      {!creatingNew ? (
        <View style={{ gap: sp.sm }}>
          <Field
            label="Search manufacturers"
            icon="search"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
            placeholder="Name"
          />
          <Button label="Search" variant="secondary" size="md" loading={searching} onPress={search} />
          {results.length > 0 && (
            <Group>
              {results.map((manufacturer) => (
                <Row
                  key={manufacturer.id}
                  onPress={() => setSelected(manufacturer)}
                  accessibilityLabel={manufacturer.name}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <T v="bodyStrong">{manufacturer.name}</T>
                    {!!manufacturer.address && (
                      <T v="label" tone="dim" numberOfLines={1}>
                        {manufacturer.address}
                      </T>
                    )}
                  </View>
                  {selected?.id === manufacturer.id && <Icon name="check" size={18} tone="accent" />}
                </Row>
              ))}
            </Group>
          )}
          <Button
            label="+ New manufacturer"
            variant="ghost"
            size="md"
            onPress={() => {
              setCreatingNew(true);
              setSelected(null);
            }}
          />
        </View>
      ) : (
        <View style={{ gap: sp.sm }}>
          <Field label="Manufacturer name *" icon="briefcase" value={newName} onChangeText={setNewName} />
          <Field label="Address" icon="map-pin" value={newAddress} onChangeText={setNewAddress} />
          <Button label="Search existing instead" variant="ghost" size="md" onPress={() => setCreatingNew(false)} />
        </View>
      )}

      <Field
        label="Correction period (days)"
        icon="clock"
        value={days}
        onChangeText={setDays}
        keyboardType="number-pad"
        placeholder="15"
      />

      <Button
        label="Open correction window"
        icon="flag"
        variant="danger"
        loading={submitting}
        disabled={!!blocker}
        onPress={confirm}
      />
      {!!blocker && (
        <T v="label" tone="dim" style={{ textAlign: 'center' }}>
          {blocker}
        </T>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Confirm-compliance sheet: the positive counterpart to
// ConfirmViolationSheet above — links a COMPLIANT inspection to a
// manufacturer so it counts toward "inspected, no violations" in the
// public lookup, rather than that manufacturer staying invisible there.
// ---------------------------------------------------------------------------

function ConfirmComplianceSheet({
  inspectionId,
  base,
  token,
  onClose,
  onConfirmed,
}: {
  inspectionId: string;
  base: string;
  token: string;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Manufacturer[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Manufacturer | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const search = async () => {
    if (searching) return;
    try {
      setSearching(true);
      setResults(await api.searchManufacturers(base, token, query.trim() || undefined));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not search manufacturers.');
    } finally {
      setSearching(false);
    }
  };

  const blocker =
    !selected && !creatingNew
      ? 'Select an existing manufacturer or create a new one.'
      : creatingNew && !newName.trim()
        ? 'Enter the manufacturer name.'
        : null;

  const confirm = async () => {
    if (blocker || submitting) return;
    try {
      setSubmitting(true);
      await api.confirmCompliance(base, token, inspectionId, {
        manufacturer_id: selected?.id,
        new_manufacturer: creatingNew ? { name: newName.trim(), address: newAddress.trim() || undefined } : undefined,
      });
      toast.success('Logged as a clean inspection for this manufacturer.');
      onConfirmed();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not log this inspection.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet title="Log clean inspection" onClose={onClose}>
      <View style={{ gap: sp.xs }}>
        <T v="label" tone="dim">
          Link the manufacturer this compliant product belongs to. This is what lets the public
          compliance lookup show "inspected, no violations" for them, instead of no record at all.
        </T>
      </View>

      {!creatingNew ? (
        <View style={{ gap: sp.sm }}>
          <Field
            label="Search manufacturers"
            icon="search"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
            placeholder="Name"
          />
          <Button label="Search" variant="secondary" size="md" loading={searching} onPress={search} />
          {results.length > 0 && (
            <Group>
              {results.map((manufacturer) => (
                <Row
                  key={manufacturer.id}
                  onPress={() => setSelected(manufacturer)}
                  accessibilityLabel={manufacturer.name}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <T v="bodyStrong">{manufacturer.name}</T>
                    {!!manufacturer.address && (
                      <T v="label" tone="dim" numberOfLines={1}>
                        {manufacturer.address}
                      </T>
                    )}
                  </View>
                  {selected?.id === manufacturer.id && <Icon name="check" size={18} tone="accent" />}
                </Row>
              ))}
            </Group>
          )}
          <Button
            label="+ New manufacturer"
            variant="ghost"
            size="md"
            onPress={() => {
              setCreatingNew(true);
              setSelected(null);
            }}
          />
        </View>
      ) : (
        <View style={{ gap: sp.sm }}>
          <Field label="Manufacturer name *" icon="briefcase" value={newName} onChangeText={setNewName} />
          <Field label="Address" icon="map-pin" value={newAddress} onChangeText={setNewAddress} />
          <Button label="Search existing instead" variant="ghost" size="md" onPress={() => setCreatingNew(false)} />
        </View>
      )}

      <Button
        label="Confirm clean inspection"
        icon="check"
        variant="primary"
        loading={submitting}
        disabled={!!blocker}
        onPress={confirm}
      />
      {!!blocker && (
        <T v="label" tone="dim" style={{ textAlign: 'center' }}>
          {blocker}
        </T>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Panchnama witness capture sheet
// ---------------------------------------------------------------------------

type WitnessForm = { name: string; designation: string; address: string };
const emptyWitness = (): WitnessForm => ({ name: '', designation: '', address: '' });

function PanchnamaSheet({
  base,
  token,
  inspectionId,
  reference,
  onClose,
  onGenerated,
}: {
  base: string;
  token: string;
  inspectionId: string;
  reference: string;
  onClose: () => void;
  onGenerated: (objectUrl: string) => void;
}) {
  const toast = useToast();
  const [w1, setW1] = useState<WitnessForm>(emptyWitness());
  const [w2, setW2] = useState<WitnessForm>(emptyWitness());
  const [place, setPlace] = useState('');
  const [designation, setDesignation] = useState('');
  const [days, setDays] = useState('30');
  const [generating, setGenerating] = useState(false);

  const blocker =
    !w1.name.trim() ? 'Enter the first witness name.' :
    !w2.name.trim() ? 'Enter the second witness name.' :
    !place.trim()   ? 'Enter the place of search.' :
    null;

  const generate = async () => {
    if (blocker || generating) return;
    try {
      setGenerating(true);
      const correctionDays = Math.max(1, Math.min(180, parseInt(days, 10) || 30));
      const url = await api.downloadPanchnama(base, token, inspectionId, {
        witness_one: { name: w1.name.trim(), designation: w1.designation.trim() || undefined, address: w1.address.trim() || undefined },
        witness_two: { name: w2.name.trim(), designation: w2.designation.trim() || undefined, address: w2.address.trim() || undefined },
        place_of_search: place.trim(),
        officer_designation: designation.trim() || undefined,
        correction_period_days: correctionDays,
      });
      onGenerated(url);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not generate the Panchnama.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Sheet title="Panchnama — Witness Details" onClose={onClose}>
      {/* Context note */}
      <View style={{ gap: sp.xs }}>
        <T v="labelStrong">Reference: {reference}</T>
        <T v="label" tone="dim">
          The Panchnama requires two independent witnesses (Panchas) who are present during the
          search and seizure. Their details are recorded and the document is signed by all parties.
        </T>
      </View>

      {/* Witness 1 */}
      <View style={{ gap: sp.sm }}>
        <T v="micro" tone="faint" style={{ textTransform: 'uppercase' }}>Witness 1 (Pancha One)</T>
        <Field label="Full name *" icon="user" value={w1.name}
          onChangeText={(v) => setW1((p) => ({ ...p, name: v }))}
          placeholder="As it appears on ID" />
        <Field label="Designation / Occupation" icon="briefcase" value={w1.designation}
          onChangeText={(v) => setW1((p) => ({ ...p, designation: v }))}
          placeholder="e.g. Shopkeeper, Govt. Employee" />
        <Field label="Address" icon="map-pin" value={w1.address}
          onChangeText={(v) => setW1((p) => ({ ...p, address: v }))}
          placeholder="Residential address" />
      </View>

      {/* Witness 2 */}
      <View style={{ gap: sp.sm }}>
        <T v="micro" tone="faint" style={{ textTransform: 'uppercase' }}>Witness 2 (Pancha Two)</T>
        <Field label="Full name *" icon="user" value={w2.name}
          onChangeText={(v) => setW2((p) => ({ ...p, name: v }))}
          placeholder="As it appears on ID" />
        <Field label="Designation / Occupation" icon="briefcase" value={w2.designation}
          onChangeText={(v) => setW2((p) => ({ ...p, designation: v }))}
          placeholder="e.g. Shopkeeper, Govt. Employee" />
        <Field label="Address" icon="map-pin" value={w2.address}
          onChangeText={(v) => setW2((p) => ({ ...p, address: v }))}
          placeholder="Residential address" />
      </View>

      {/* Inspection details */}
      <View style={{ gap: sp.sm }}>
        <T v="micro" tone="faint" style={{ textTransform: 'uppercase' }}>Inspection Details</T>
        <Field label="Place of search *" icon="map-pin" value={place}
          onChangeText={setPlace}
          placeholder="Full address of premises searched" />
        <Field label="Your designation" icon="shield" value={designation}
          onChangeText={setDesignation}
          placeholder="e.g. Legal Metrology Inspector" />
        <Field label="Correction period (days)" icon="clock" value={days}
          onChangeText={setDays}
          keyboardType="number-pad"
          placeholder="30" />
      </View>

      <Button
        label="Generate Panchnama PDF"
        icon="file-text"
        onPress={generate}
        loading={generating}
        disabled={!!blocker}
        full
      />
      {!!blocker && (
        <T v="label" tone="faint" style={{ textAlign: 'center' }}>
          {blocker}
        </T>
      )}
    </Sheet>
  );
}
