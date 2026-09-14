import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, shortDate, type ExtractedData, type Inspection, type Session } from '../api';
import { sp, useTheme } from '../theme';
import { ActionBar, Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Reveal } from '../ui/Reveal';
import { Screen } from '../ui/Screen';
import { StatusPill } from '../ui/Pill';
import { DataRow, Group, SectionHeader, T } from '../ui/primitives';
import { useToast } from '../ui/Toast';

type EditableFields = {
  outletName: string;
  outletAddress: string;
  productName: string;
  productCategory: string;
  mrpValue: string;
  mrpCurrency: string;
  netQtyValue: string;
  netQtyUnit: string;
  manufactureDate: string;
  bestBefore: string;
  lotNumber: string;
  consumerCarePhone: string;
  consumerCareEmail: string;
  manufacturerName: string;
  manufacturerAddress: string;
};

function toFields(inspection: Inspection): EditableFields {
  const ed = inspection.extracted_data || {};
  return {
    outletName: inspection.outlet_name || '',
    outletAddress: inspection.outlet_address || '',
    productName: inspection.product_name || '',
    productCategory: inspection.product_category || '',
    mrpValue: ed.mrp?.value || '',
    mrpCurrency: ed.mrp?.currency || 'INR',
    netQtyValue: ed.net_quantity?.value || '',
    netQtyUnit: ed.net_quantity?.unit || '',
    manufactureDate: ed.manufacture_date || '',
    bestBefore: ed.best_before || '',
    lotNumber: ed.lot_number || '',
    consumerCarePhone: ed.consumer_care?.phone || '',
    consumerCareEmail: ed.consumer_care?.email || '',
    manufacturerName: ed.manufacturer?.name || '',
    manufacturerAddress: ed.manufacturer?.address || '',
  };
}

/**
 * Read view of the same facts the Inspection Proforma PDF is built from,
 * with an inspector-only edit mode. Editing calls the two endpoints that
 * already existed on the backend with no mobile UI of their own —
 * PATCH /inspections/{id} for outlet/product, PUT .../extracted-data for
 * the declared-on-label facts (which re-runs the rule engine server-side,
 * so saving can change the findings and overall status).
 *
 * Both backend calls replace their payload wholesale rather than patching
 * sparse fields, so every save sends the complete current object with only
 * the edited values changed — never just the touched fields.
 */
export function Report({
  base,
  session,
  inspection: initial,
  onBack,
}: {
  base: string;
  session: Session;
  inspection: Inspection;
  onBack: (inspection: Inspection) => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const canEdit = session.role === 'inspector';

  const [report, setReport] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<EditableFields>(() => toFields(initial));
  const [saving, setSaving] = useState(false);

  const set = (key: keyof EditableFields) => (value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  const startEdit = () => {
    setFields(toFields(report));
    setEditing(true);
  };

  const save = async () => {
    try {
      setSaving(true);
      await api.updateInspection(base, session.token, report.id, {
        outlet_name: fields.outletName.trim() || undefined,
        outlet_address: fields.outletAddress.trim() || undefined,
        product_name: fields.productName.trim() || undefined,
        product_category: fields.productCategory.trim() || undefined,
        measure_font_size: report.measure_font_size,
        measure_net_quantity: report.measure_net_quantity,
        measured_net_quantity_value: report.measured_net_quantity_value ?? undefined,
        measured_net_quantity_unit: report.measured_net_quantity_unit ?? undefined,
        measuring_instrument: report.measuring_instrument ?? undefined,
        declared_data: report.declared_data,
      });
      const nextExtracted: ExtractedData = {
        ...report.extracted_data,
        mrp: fields.mrpValue.trim()
          ? { value: fields.mrpValue.trim(), currency: fields.mrpCurrency.trim() || 'INR', raw: report.extracted_data.mrp?.raw }
          : undefined,
        net_quantity: fields.netQtyValue.trim()
          ? { value: fields.netQtyValue.trim(), unit: fields.netQtyUnit.trim() }
          : undefined,
        manufacture_date: fields.manufactureDate.trim() || undefined,
        best_before: fields.bestBefore.trim() || undefined,
        lot_number: fields.lotNumber.trim() || undefined,
        consumer_care:
          fields.consumerCarePhone.trim() || fields.consumerCareEmail.trim()
            ? { phone: fields.consumerCarePhone.trim() || null, email: fields.consumerCareEmail.trim() || null }
            : undefined,
        manufacturer: fields.manufacturerName.trim()
          ? { name: fields.manufacturerName.trim(), address: fields.manufacturerAddress.trim() || null }
          : undefined,
      };
      const updated = await api.saveExtractedData(base, session.token, report.id, nextExtracted);
      setReport(updated);
      setEditing(false);
      toast.success('Report updated.');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title="Report"
      eyebrow={report.reference}
      onBack={editing ? undefined : () => onBack(report)}
      right={<StatusPill status={report.status} />}
      footer={
        canEdit ? (
          <ActionBar inset={insets.bottom}>
            {editing ? (
              <View style={{ flexDirection: 'row', gap: sp.md }}>
                <Button label="Cancel" variant="secondary" onPress={() => setEditing(false)} style={{ flex: 1 }} disabled={saving} />
                <Button label="Save" icon="check" onPress={save} loading={saving} style={{ flex: 1 }} />
              </View>
            ) : (
              <Button label="Edit report" icon="edit-2" variant="secondary" onPress={startEdit} full />
            )}
          </ActionBar>
        ) : undefined
      }
    >
      <Reveal>
        <SectionHeader>Inspection details</SectionHeader>
        <Group>
          <DataRow label="Reference" value={report.reference} />
          <DataRow label="Date" value={shortDate(report.created_at)} mono={false} />
        </Group>
      </Reveal>

      <SectionHeader>Retail outlet</SectionHeader>
      {editing ? (
        <View style={{ gap: sp.md }}>
          <Field label="Outlet name" icon="map-pin" value={fields.outletName} onChangeText={set('outletName')} />
          <Field label="Outlet address" icon="home" value={fields.outletAddress} onChangeText={set('outletAddress')} multiline />
        </View>
      ) : (
        <Group>
          <DataRow label="Name" value={report.outlet_name || '-'} mono={false} />
          <DataRow label="Address" value={report.outlet_address || '-'} mono={false} />
        </Group>
      )}

      <SectionHeader>Packaged commodity</SectionHeader>
      {editing ? (
        <View style={{ gap: sp.md }}>
          <Field label="Product name" icon="package" value={fields.productName} onChangeText={set('productName')} />
          <Field label="Category" icon="tag" value={fields.productCategory} onChangeText={set('productCategory')} autoCapitalize="none" />
        </View>
      ) : (
        <Group>
          <DataRow label="Product" value={report.product_name || '-'} mono={false} />
          <DataRow label="Category" value={report.product_category || '-'} mono={false} />
        </Group>
      )}

      <SectionHeader>Declared on label</SectionHeader>
      {editing ? (
        <View style={{ gap: sp.md }}>
          <View style={{ flexDirection: 'row', gap: sp.md }}>
            <Field label="MRP" icon="dollar-sign" value={fields.mrpValue} onChangeText={set('mrpValue')} keyboardType="decimal-pad" style={{ flex: 2 }} />
            <Field label="Currency" value={fields.mrpCurrency} onChangeText={set('mrpCurrency')} autoCapitalize="characters" style={{ flex: 1 }} />
          </View>
          <View style={{ flexDirection: 'row', gap: sp.md }}>
            <Field label="Net quantity" icon="box" value={fields.netQtyValue} onChangeText={set('netQtyValue')} keyboardType="decimal-pad" style={{ flex: 2 }} />
            <Field label="Unit" value={fields.netQtyUnit} onChangeText={set('netQtyUnit')} autoCapitalize="none" style={{ flex: 1 }} />
          </View>
          <Field label="Manufacture / pack date" icon="calendar" value={fields.manufactureDate} onChangeText={set('manufactureDate')} placeholder="MM/YYYY" />
          <Field label="Best before" icon="calendar" value={fields.bestBefore} onChangeText={set('bestBefore')} placeholder="MM/YYYY" />
          <Field label="Lot / batch number" icon="hash" value={fields.lotNumber} onChangeText={set('lotNumber')} autoCapitalize="characters" />
          <Field label="Manufacturer name" icon="briefcase" value={fields.manufacturerName} onChangeText={set('manufacturerName')} />
          <Field label="Manufacturer address" icon="home" value={fields.manufacturerAddress} onChangeText={set('manufacturerAddress')} multiline />
          <View style={{ flexDirection: 'row', gap: sp.md }}>
            <Field label="Consumer care phone" icon="phone" value={fields.consumerCarePhone} onChangeText={set('consumerCarePhone')} keyboardType="phone-pad" style={{ flex: 1 }} />
          </View>
          <Field label="Consumer care email" icon="mail" value={fields.consumerCareEmail} onChangeText={set('consumerCareEmail')} autoCapitalize="none" keyboardType="email-address" />
          <T v="label" tone="faint">
            Saving re-runs the rule engine, so findings and the overall status may change to match
            the corrected values.
          </T>
        </View>
      ) : (
        <Group>
          <DataRow
            label="MRP"
            value={report.extracted_data.mrp ? `${report.extracted_data.mrp.currency} ${report.extracted_data.mrp.value}` : '-'}
          />
          <DataRow
            label="Net quantity"
            value={
              report.extracted_data.net_quantity
                ? `${report.extracted_data.net_quantity.value} ${report.extracted_data.net_quantity.unit}`
                : '-'
            }
          />
          <DataRow label="Mfg / pack date" value={report.extracted_data.manufacture_date || '-'} mono={false} />
          <DataRow label="Best before" value={report.extracted_data.best_before || '-'} mono={false} />
          <DataRow label="Lot / batch no." value={report.extracted_data.lot_number || '-'} />
          <DataRow label="Manufacturer" value={report.extracted_data.manufacturer?.name || '-'} mono={false} />
          <DataRow label="Manufacturer address" value={report.extracted_data.manufacturer?.address || '-'} mono={false} />
          <DataRow label="Consumer care phone" value={report.extracted_data.consumer_care?.phone || '-'} />
          <DataRow label="Consumer care email" value={report.extracted_data.consumer_care?.email || '-'} mono={false} />
        </Group>
      )}

      <SectionHeader>Statutory findings</SectionHeader>
      {report.findings.length ? (
        <Group>
          {report.findings.map((finding) => (
            <DataRow
              key={finding.id}
              label={finding.requirement}
              value={finding.status.replace('_', ' ')}
              tone={
                finding.status === 'FAIL'
                  ? c.fail
                  : finding.status === 'NEEDS_REVIEW'
                    ? c.review
                    : finding.status === 'PASS'
                      ? c.pass
                      : undefined
              }
            />
          ))}
        </Group>
      ) : (
        <T v="label" tone="dim">
          No findings recorded yet.
        </T>
      )}
    </Screen>
  );
}
