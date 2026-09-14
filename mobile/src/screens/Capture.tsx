import { useState } from 'react';
import { Image, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Animated from 'react-native-reanimated';
import {
  api,
  categories,
  panelNames,
  type Inspection,
  type PanelName,
  type Session,
  type ShotType,
} from '../api';
import { r, sp, useTheme } from '../theme';
import { ActionBar, Button } from '../ui/Button';
import { Chip, TileGrid } from '../ui/Choice';
import { Compare } from '../ui/Compare';
import { Field } from '../ui/Field';
import { Icon } from '../ui/Icon';
import { Reveal, usePhotoEnter } from '../ui/Reveal';
import { Screen } from '../ui/Screen';
import { Segmented } from '../ui/Segmented';
import { Group, Row, SectionHeader, T } from '../ui/primitives';
import { useToast } from '../ui/Toast';

export type Asset = { uri: string; fileName?: string | null; mimeType?: string | null };

type Stage = null | 'creating' | 'calibration' | 'ocr';

const stageNote: Record<Exclude<Stage, null>, string> = {
  creating: 'Creating the report',
  calibration: 'Uploading calibration photo',
  ocr: 'Uploading label photo',
};

/**
 * Capture screen.
 *
 * First submit: creates the inspection + first panel, then shows a "panel
 * done" state that lets the inspector add more panels or proceed to analysis.
 *
 * Subsequent submits: re-use the same inspection (no new createInspection
 * call), just createPanel + two uploads. The report details fields (product,
 * outlet, category) become read-only once the inspection exists.
 *
 * The shots state lives in App.tsx and is passed in so the camera overlay
 * (which layers over this screen) can write back to the same state without
 * unmounting this form.
 */
export function Capture({
  base,
  session,
  onCancel,
  onSubmitted,
  onOpenCamera,
  shots,
  setShot,
}: {
  base: string;
  session: Session;
  onCancel: () => void;
  onSubmitted: (inspection: Inspection) => void;
  onOpenCamera: (target: ShotType) => void;
  shots: Record<ShotType, Asset | null>;
  setShot: (target: ShotType, asset: Asset | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const toast = useToast();

  // Report-level fields — locked once the inspection is created.
  const [outlet, setOutlet] = useState('');
  const [product, setProduct] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [measureFontSize, setMeasureFontSize] = useState(true);
  const [measureNetQuantity, setMeasureNetQuantity] = useState(false);
  const [measuredValue, setMeasuredValue] = useState('');
  const [measuredUnit, setMeasuredUnit] = useState('g');
  const [instrument, setInstrument] = useState('');

  // Panel-level fields — reset between panels.
  const [panel, setPanel] = useState<PanelName>('back');
  const [stage, setStage] = useState<Stage>(null);

  // Once the first panel pair is uploaded, this holds the created inspection.
  // Subsequent uploads add panels to this inspection rather than creating a new one.
  const [activeInspection, setActiveInspection] = useState<Inspection | null>(null);
  // Track which panel names have already been captured in this session.
  const [capturedPanels, setCapturedPanels] = useState<PanelName[]>([]);
  // Whether the "panel done" interstitial is showing.
  const [panelDone, setPanelDone] = useState(false);

  // Locked to the value the inspection was created with, once it exists.
  const effectiveMeasureFontSize = activeInspection
    ? activeInspection.measure_font_size
    : measureFontSize;

  const pickFromLibrary = async (target: ShotType) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error('Photo library access is needed to attach an existing photo.');
      return;
    }
    const choice = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (choice.canceled) return;
    const asset = choice.assets[0];
    setShot(target, {
      uri: asset.uri,
      fileName: asset.fileName ?? `${target}.jpg`,
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
  };

  const blocker = !product.trim()
    ? 'Add the product name to continue.'
    : !activeInspection && measureNetQuantity && !measuredValue.trim()
      ? 'Enter the measured weight/volume, or turn off net-quantity measurement.'
      : effectiveMeasureFontSize && !shots.calibration
        ? 'Shot A, with the coin, is still missing.'
        : !shots.ocr
          ? effectiveMeasureFontSize
            ? 'Shot B, without the coin, is still missing.'
            : 'The label photo is still missing.'
          : null;

  const submit = async () => {
    if (blocker || (effectiveMeasureFontSize && !shots.calibration) || !shots.ocr) return;
    try {
      let inspection = activeInspection;

      if (!inspection) {
        // First panel: create the inspection.
        setStage('creating');
        inspection = await api.createInspection(base, session.token, {
          outlet_name: outlet.trim() || undefined,
          product_name: product.trim(),
          product_category: category ?? undefined,
          measure_font_size: measureFontSize,
          measure_net_quantity: measureNetQuantity,
          measured_net_quantity_value: measureNetQuantity ? parseFloat(measuredValue) : undefined,
          measured_net_quantity_unit: measureNetQuantity ? measuredUnit : undefined,
          measuring_instrument: measureNetQuantity ? instrument.trim() || undefined : undefined,
        });
        setActiveInspection(inspection);
      }

      const created = await api.createPanel(base, session.token, inspection.id, {
        panel_name: panel,
        capture_source: 'camera',
      });
      if (effectiveMeasureFontSize && shots.calibration) {
        setStage('calibration');
        await api.uploadShot(base, session.token, created.id, 'calibration', shots.calibration);
      }
      setStage('ocr');
      await api.uploadShot(base, session.token, created.id, 'ocr', shots.ocr!);

      setCapturedPanels((prev) => [...prev, panel]);
      setPanelDone(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setStage(null);
    }
  };

  // After a panel is done, inspector chooses to add another or go to analysis.
  const addAnotherPanel = () => {
    setShot('calibration', null);
    setShot('ocr', null);
    // Default to a panel that hasn't been captured yet, or back as fallback.
    const remaining = panelNames.filter((n) => !capturedPanels.includes(n));
    setPanel(remaining[0] ?? 'back');
    setPanelDone(false);
  };

  const goToAnalysis = () => {
    if (activeInspection) onSubmitted(activeInspection);
  };

  // "Panel done" interstitial — shown after each successful pair upload.
  if (panelDone && activeInspection) {
    return (
      <PanelDoneScreen
        inspection={activeInspection}
        capturedPanels={capturedPanels}
        insets={insets.bottom}
        onAddAnother={addAnotherPanel}
        onViewAnalysis={goToAnalysis}
      />
    );
  }

  const paired = shots.calibration && shots.ocr;
  const isAdding = !!activeInspection;

  return (
    <Screen
      title={isAdding ? 'Add panel' : 'New inspection'}
      onBack={isAdding ? goToAnalysis : onCancel}
      subtitle={
        isAdding
          ? `${activeInspection.reference} · ${capturedPanels.length} panel${capturedPanels.length === 1 ? '' : 's'} captured`
          : 'Enter what the package should declare, then capture the panel.'
      }
      footer={
        <ActionBar
          inset={insets.bottom}
          note={
            stage
              ? stageNote[stage]
              : (blocker ?? (effectiveMeasureFontSize ? 'Both shots ready.' : 'Photo ready.'))
          }
        >
          <Button
            label={
              isAdding ? 'Upload panel' : effectiveMeasureFontSize ? 'Submit paired panel' : 'Submit panel'
            }
            icon="upload-cloud"
            onPress={submit}
            loading={!!stage}
            disabled={!!blocker}
            full
          />
        </ActionBar>
      }
    >
      {/* Report details — locked after first submit */}
      {!isAdding && (
        <>
          <SectionHeader>Report details</SectionHeader>
          <View style={{ gap: sp.lg }}>
            <Field
              label="Product"
              icon="package"
              value={product}
              onChangeText={setProduct}
              placeholder="As printed on the package"
              helper="Entered by you, so the OCR result has something to be checked against."
            />
            <Field
              label="Retail outlet"
              icon="map-pin"
              value={outlet}
              onChangeText={setOutlet}
              placeholder="Shop or premises name"
            />
            <View style={{ gap: sp.sm }}>
              <T v="label" tone="dim">
                Commodity category
              </T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp.sm }}>
                {categories.map((item) => (
                  <Chip
                    key={item}
                    label={item[0].toUpperCase() + item.slice(1)}
                    selected={category === item}
                    onPress={() => setCategory(category === item ? null : item)}
                  />
                ))}
              </View>
              <T v="label" tone="faint">
                {category
                  ? 'Selects which extra rules apply to this commodity.'
                  : 'Without a category, best-before and unit-price checks can only be routed for review.'}
              </T>
            </View>
            <View style={{ gap: sp.sm }}>
              <T v="label" tone="dim">
                Font-size measurement
              </T>
              <Segmented
                value={measureFontSize ? 'yes' : 'no'}
                onChange={(value) => setMeasureFontSize(value === 'yes')}
                segments={[
                  { value: 'yes', label: 'Measure with coin' },
                  { value: 'no', label: 'Skip, one shot only' },
                ]}
              />
              <T v="label" tone="faint">
                {measureFontSize
                  ? 'Each panel needs two photos: one with a ten rupee coin for scale, one without.'
                  : 'Each panel needs one photo. Font-height findings will be marked not applicable.'}
              </T>
            </View>
            <View style={{ gap: sp.sm }}>
              <T v="label" tone="dim">
                Net-quantity verification
              </T>
              <Segmented
                value={measureNetQuantity ? 'yes' : 'no'}
                onChange={(value) => setMeasureNetQuantity(value === 'yes')}
                segments={[
                  { value: 'yes', label: 'Weigh on a scale' },
                  { value: 'no', label: 'Skip' },
                ]}
              />
              {measureNetQuantity ? (
                <>
                  <View style={{ flexDirection: 'row', gap: sp.md }}>
                    <Field
                      label="Measured value *"
                      icon="package"
                      value={measuredValue}
                      onChangeText={setMeasuredValue}
                      placeholder="e.g. 245"
                      keyboardType="decimal-pad"
                      style={{ flex: 1 }}
                    />
                    <View style={{ gap: sp.sm }}>
                      <T v="label" tone="dim">
                        Unit
                      </T>
                      <View style={{ flexDirection: 'row', gap: sp.xs }}>
                        {['g', 'kg', 'ml', 'l'].map((unit) => (
                          <Chip
                            key={unit}
                            label={unit}
                            selected={measuredUnit === unit}
                            onPress={() => setMeasuredUnit(unit)}
                          />
                        ))}
                      </View>
                    </View>
                  </View>
                  <Field
                    label="Measuring instrument"
                    icon="tool"
                    value={instrument}
                    onChangeText={setInstrument}
                    placeholder="e.g. Scale #4, calibrated Jan 2026"
                  />
                  <T v="label" tone="faint">
                    A camera can't verify the actual contents — this is compared against the
                    declared quantity using the First Schedule's permissible-error tables.
                  </T>
                </>
              ) : (
                <T v="label" tone="faint">
                  The net-quantity-tolerance finding will be marked not applicable.
                </T>
              )}
            </View>
          </View>
        </>
      )}

      <SectionHeader>Package panel</SectionHeader>
      <TileGrid
        value={panel}
        onChange={(value) => setPanel(value as PanelName)}
        options={panelNames.map((name) => ({
          value: name,
          label: capturedPanels.includes(name as PanelName) ? `${name} ✓` : name,
        }))}
      />
      {panel !== 'back' && !capturedPanels.includes('back') && (
        <T v="label" tone="faint" style={{ marginTop: sp.sm }}>
          The back panel usually carries the statutory declarations. Capturing another side is
          allowed, not blocked.
        </T>
      )}

      <SectionHeader>{effectiveMeasureFontSize ? 'Photo pair' : 'Photo'}</SectionHeader>
      <View style={{ gap: sp.md }}>
        {effectiveMeasureFontSize && (
          <PhotoSlot
            shot="A"
            title="With the coin"
            note="Place a ten rupee coin flat beside the declarations, fully visible and not overlapping any text."
            asset={shots.calibration}
            onCamera={() => onOpenCamera('calibration')}
            onLibrary={() => pickFromLibrary('calibration')}
            onClear={() => setShot('calibration', null)}
          />
        )}
        <PhotoSlot
          shot="B"
          title={effectiveMeasureFontSize ? 'Coin removed' : 'Label photo'}
          note={
            effectiveMeasureFontSize
              ? 'Do not move. Same distance and zoom, coin out of frame. This is the photo the text is read from.'
              : 'A clear photo of the panel declarations. Font-size measurement was skipped for this inspection.'
          }
          asset={shots.ocr}
          onCamera={() => onOpenCamera('ocr')}
          onLibrary={() => pickFromLibrary('ocr')}
          onClear={() => setShot('ocr', null)}
        />
      </View>

      {paired && (
        <Reveal>
          <SectionHeader>Framing check</SectionHeader>
          <Compare calibrationUri={shots.calibration!.uri} ocrUri={shots.ocr!.uri} />
          <T v="label" tone="faint" style={{ marginTop: sp.sm }}>
            The millimetre scale from shot A is applied to text measured in shot B, so the two
            frames have to line up. If the label jumps as you wipe across, retake shot B.
          </T>
        </Reveal>
      )}
    </Screen>
  );
}

/**
 * Shown after each successful pair upload.
 *
 * Keeps the inspector oriented — they know which panel they just did and how
 * many total — and gives the two forward paths without a modal or alert.
 */
function PanelDoneScreen({
  inspection,
  capturedPanels,
  insets,
  onAddAnother,
  onViewAnalysis,
}: {
  inspection: Inspection;
  capturedPanels: PanelName[];
  insets: number;
  onAddAnother: () => void;
  onViewAnalysis: () => void;
}) {
  const { c } = useTheme();
  const count = capturedPanels.length;
  const last = capturedPanels[count - 1];
  const remaining = panelNames.filter((n) => !capturedPanels.includes(n));

  return (
    <Screen
      title="Panel captured"
      eyebrow={inspection.reference}
      subtitle={inspection.product_name ?? undefined}
      footer={
        <ActionBar inset={insets}>
          <View style={{ gap: sp.md }}>
            <Button
              label="Add another panel"
              icon="plus"
              onPress={onAddAnother}
              full
            />
            <Button
              label="View analysis"
              icon="bar-chart-2"
              variant="secondary"
              onPress={onViewAnalysis}
              full
            />
          </View>
        </ActionBar>
      }
    >
      <Reveal>
        <View
          style={{
            backgroundColor: c.passFill,
            borderRadius: r.container,
            borderWidth: 1,
            borderColor: c.pass,
            padding: sp.lg,
            gap: sp.md,
            alignItems: 'center',
            marginTop: sp.lg,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: r.pill,
              backgroundColor: c.pass,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="check" size={24} color={c.bg} />
          </View>
          <T v="heading" style={{ textAlign: 'center' }}>
            {last
              ? `${last.charAt(0).toUpperCase()}${last.slice(1)} panel uploaded`
              : 'Panel uploaded'}
          </T>
          <T v="label" tone="dim" style={{ textAlign: 'center' }}>
            {count === 1
              ? `First panel${inspection.measure_font_size ? ' pair' : ''} is on its way to the analysis pipeline.`
              : `${count} panel${inspection.measure_font_size ? ' pairs' : 's'} uploaded to this inspection.`}
          </T>
        </View>
      </Reveal>

      <SectionHeader>Captured so far</SectionHeader>
      <Group>
        {capturedPanels.map((name, i) => (
          <Row key={`${name}-${i}`}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: r.pill,
                backgroundColor: c.passFill,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="check" size={14} color={c.pass} />
            </View>
            <T v="bodyStrong" style={{ flex: 1, textTransform: 'capitalize' }}>
              {name} panel
            </T>
            <T v="monoMicro" tone="faint">
              Pair {i + 1}
            </T>
          </Row>
        ))}
      </Group>

      {remaining.length > 0 && (
        <>
          <SectionHeader>Remaining panels</SectionHeader>
          <Group>
            {remaining.map((name) => (
              <Row key={name}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: r.pill,
                    backgroundColor: c.fill,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="circle" size={14} tone="faint" />
                </View>
                <T v="body" tone="dim" style={{ flex: 1, textTransform: 'capitalize' }}>
                  {name} panel
                </T>
                <T v="label" tone="faint">
                  Optional
                </T>
              </Row>
            ))}
          </Group>
        </>
      )}

      <T v="label" tone="faint" style={{ marginTop: sp.xl }}>
        {inspection.measure_font_size
          ? 'The analysis pipeline starts as soon as both shots in a pair are uploaded. You can keep adding panels — the report updates each time.'
          : 'The analysis pipeline starts as soon as the photo is uploaded. You can keep adding panels — the report updates each time.'}
      </T>
    </Screen>
  );
}

function PhotoSlot({
  shot,
  title,
  note,
  asset,
  onCamera,
  onLibrary,
  onClear,
}: {
  shot: 'A' | 'B';
  title: string;
  note: string;
  asset: Asset | null;
  onCamera: () => void;
  onLibrary: () => void;
  onClear: () => void;
}) {
  const { c } = useTheme();
  const entering = usePhotoEnter();

  return (
    <View
      style={{
        borderRadius: r.container,
        borderWidth: 1,
        borderColor: asset ? c.line : c.lineStrong,
        borderStyle: asset ? 'solid' : 'dashed',
        backgroundColor: asset ? c.surface : 'transparent',
        overflow: 'hidden',
      }}
    >
      {!!asset && (
        <Animated.View key={asset.uri} entering={entering}>
          <Image
            source={{ uri: asset.uri }}
            style={{ width: '100%', height: 190 }}
            resizeMode="cover"
            accessibilityLabel={`Shot ${shot}`}
          />
        </Animated.View>
      )}

      <View style={{ padding: sp.lg, gap: sp.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp.sm }}>
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: r.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: asset ? c.passFill : c.fill,
            }}
          >
            {asset ? (
              <Icon name="check" size={13} color={c.pass} />
            ) : (
              <T v="monoMicro" tone="faint">
                {shot}
              </T>
            )}
          </View>
          <T v="heading" style={{ flex: 1 }}>
            {title}
          </T>
        </View>

        <T v="label" tone="dim">
          {note}
        </T>

        <View style={{ flexDirection: 'row', gap: sp.sm }}>
          <Button
            label={asset ? 'Retake' : 'Camera'}
            icon="camera"
            size="md"
            variant={asset ? 'secondary' : 'primary'}
            onPress={onCamera}
          />
          <Button label="Gallery" icon="image" size="md" variant="secondary" onPress={onLibrary} />
          {!!asset && (
            <Button label="Remove" icon="trash-2" size="md" variant="ghost" onPress={onClear} />
          )}
        </View>
      </View>
    </View>
  );
}
