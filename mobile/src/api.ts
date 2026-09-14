/**
 * Typed client for the LegalMetry FastAPI backend.
 *
 * Types mirror backend/app/schemas.py. Anything the UI renders is declared
 * here, so a screen never guesses at a field name.
 */
import { Platform } from 'react-native';

export type Role = 'inspector' | 'supervisor';
export type PanelName = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
export type ShotType = 'calibration' | 'ocr';
export type CaptureSource = 'camera' | 'gallery';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';
export type InspectionStatus =
  | 'draft'
  | 'capturing'
  | 'processing'
  | 'needs_review'
  | 'compliant'
  | 'violation';
export type FindingStatus = 'PASS' | 'FAIL' | 'NEEDS_REVIEW' | 'NOT_APPLICABLE';

export type Session = { token: string; role: Role; fullName: string; email: string };

export type Evidence = {
  id: string;
  shot_type: ShotType;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  created_at: string;
};

export type Panel = {
  id: string;
  panel_name: PanelName;
  capture_source: CaptureSource;
  uploads: Evidence[];
};

export type Finding = {
  id: string;
  rule_id: string;
  requirement: string;
  status: FindingStatus;
  legal_reference: string;
  detected_value: string | null;
  reason: string;
  recommendation: string | null;
};

export type Job = {
  id: string;
  job_type: string;
  status: JobStatus;
  detail: string | null;
  created_at: string;
  updated_at: string;
};

/** Written by the Celery worker; shape comes from app/worker.py. */
export type FontMeasurements = {
  status: 'calibrated' | 'needs_review' | 'not_requested';
  pixels_per_mm?: number;
  reference?: string;
  note?: string;
  pair_scale_check?: {
    dimensions_match: boolean;
    calibration_image?: { width: number | null; height: number | null };
    ocr_image?: { width: number; height: number } | null;
    note?: string;
  };
  measurements?: { text: string; confidence: number; height_px: number; height_mm: number }[];
};

export type ExtractedData = {
  raw_text?: string;
  ocr_confidence?: number;
  ocr_language?: string;
  ocr_regions?: { text: string; confidence: number; polygon: number[][] }[];
  font_measurements?: FontMeasurements;
  mrp?: { value: string; currency: string; raw?: string };
  net_quantity?: { value: string; unit: string };
  manufacture_date?: string;
  best_before?: string;
  lot_number?: string;
  consumer_care?: { phone: string | null; email: string | null };
  manufacturer?: { name: string; address: string | null };
  [key: string]: unknown;
};

/** Coin detector result, parsed out of the completed job's detail JSON. */
export type Calibration = {
  status: 'calibrated' | 'needs_review' | 'not_requested' | string;
  confidence: number;
  reason: string;
  pixels_per_mm?: number | null;
  tilt_ratio?: number | null;
  major_axis_px?: number | null;
  minor_axis_px?: number | null;
  image_width?: number | null;
  image_height?: number | null;
};

export type JobDetail = {
  overall_status?: string;
  calibration?: Calibration;
  ocr?: { language: string; confidence: number; regions: number };
};

export type Inspection = {
  id: string;
  reference: string;
  status: InspectionStatus;
  outlet_name: string | null;
  outlet_address: string | null;
  product_name: string | null;
  product_category: string | null;
  measure_font_size: boolean;
  measure_net_quantity: boolean;
  measured_net_quantity_value: number | null;
  measured_net_quantity_unit: string | null;
  measuring_instrument: string | null;
  declared_data: Record<string, unknown>;
  extracted_data: ExtractedData;
  created_at: string;
  updated_at: string;
  panels: Panel[];
  findings: Finding[];
  jobs: Job[];
};

/** The public, no-login retailer lookup. Deliberately minimal — see backend/app/main.py's public_manufacturer_lookup. */
export type PublicManufacturerCompliance = {
  id: string;
  name: string;
  address: string | null;
  unresolved_count: number;
  resolved_count: number;
  clean_inspection_count: number;
};

export type PublicComplianceLookup = {
  results: PublicManufacturerCompliance[];
  disclaimer: string;
};

export type ViolationByRule = { rule_id: string; requirement: string; count: number };
export type CategorySummary = { category: string; total_inspections: number; violations: number };
export type WeeklyTrendPoint = { week_start: string; total: number; violations: number };

export type CorrectiveActionStatus = 'open' | 'resolved';

export type CorrectiveAction = {
  id: string;
  status: CorrectiveActionStatus;
  correction_period_days: number;
  issued_at: string;
  due_at: string;
  resolved_at: string | null;
  is_overdue: boolean;
  inspection: {
    id: string;
    reference: string;
    product_name: string | null;
    outlet_name: string | null;
  };
};

export type Manufacturer = {
  id: string;
  name: string;
  address: string | null;
  notes: string | null;
  created_at: string;
};

export type ManufacturerComplianceRecord = {
  id: string;
  inspection_id: string;
  manufacturer: Manufacturer;
  confirmed_at: string;
};

export type ViolationCaseStatus =
  | 'awaiting_rectification'
  | 'rectified_closed'
  | 'escalated_pending_fine'
  | 'fine_issued';

export type RectificationEvidence = {
  id: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  note: string | null;
  created_at: string;
};

export type ViolationCase = {
  id: string;
  inspection_id: string;
  rule_id: string;
  requirement: string;
  legal_reference: string;
  detected_value: string | null;
  reason: string;
  manufacturer: Manufacturer;
  status: ViolationCaseStatus;
  offence_number: number;
  confirmed_at: string;
  correction_period_days: number;
  window_due_at: string;
  is_overdue: boolean;
  rectified_at: string | null;
  escalated_at: string | null;
  fine_amount: string | null;
  fine_notes: string | null;
  fine_issued_at: string | null;
  evidence: RectificationEvidence[];
  inspection: {
    id: string;
    reference: string;
    product_name: string | null;
    outlet_name: string | null;
  };
};

export type Dashboard = {
  district_name: string;
  total_inspections: number;
  draft: number;
  processing: number;
  needs_review: number;
  compliant: number;
  violation: number;
  completed_reports: number;
  violation_by_rule: ViolationByRule[];
  inspections_by_category: CategorySummary[];
  violation_reports: Inspection[];
  recent_inspections: Inspection[];
  weekly_trend: WeeklyTrendPoint[];
  corrective_actions: CorrectiveAction[];
  open_corrective_actions: number;
  overdue_corrective_actions: number;
  violation_cases: ViolationCase[];
  escalation_queue: ViolationCase[];
  open_violation_cases: number;
  overdue_violation_cases: number;
  pending_fine_recommendations: number;
};

/**
 * API base URL for the LegalMetry backend.
 *
 * Set EXPO_PUBLIC_API_URL in your .env (or EAS build profile) to the
 * deployed backend URL before building for production, e.g.:
 *   EXPO_PUBLIC_API_URL=https://api.legalmetry.example.gov.in
 *
 * - Web default falls back to localhost (dev server on the same machine).
 * - Native default falls back to localhost:8000 as a safe placeholder that
 *   makes the "cannot connect" error obvious rather than silently hitting an
 *   old LAN IP that no longer exists.
 */
export const defaultBaseUrl: string =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === 'web' ? 'http://localhost:8000' : 'http://localhost:8000');

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  base: string,
  path: string,
  token?: string,
  options: RequestInit = {},
  timeoutMs = 15000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = (body as { detail?: unknown } | null)?.detail;
      throw new ApiError(
        typeof detail === 'string' ? detail : 'The server rejected that request.',
        response.status,
      );
    }
    // A 2xx response with an unparseable body is a real problem — surface it
    // rather than returning null which silently crashes destructuring callers.
    if (body === null) {
      throw new ApiError('The server returned an unreadable response.', 0);
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('The server did not respond in time.', 0);
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new ApiError(`Network error: ${msg}`, 0);
  } finally {
    clearTimeout(timer);
  }
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * Fetch a PDF endpoint and return a value the caller can open or share.
 *
 * - Web: returns an object URL string (assign to window.open or <a href>).
 * - Native: returns a base64 data-URI string that expo-file-system can write
 *   to the cache directory and expo-sharing can open.
 *
 * GET is used for proforma and seizure memo; POST (with JSON body) is used
 * for panchnama (which requires witness data). A missing `postBody` means GET.
 */
async function _fetchPdf(url: string, token: string, postBody?: unknown): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(url, {
      method: postBody !== undefined ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(postBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: postBody !== undefined ? JSON.stringify(postBody) : undefined,
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail = 'Could not generate report.';
      try {
        const err = await response.json() as { detail?: string };
        if (err.detail) detail = err.detail;
      } catch { /* ignore */ }
      throw new ApiError(detail, response.status);
    }
    const blob = await response.blob();
    if (Platform.OS === 'web') {
      // Web: object URL the caller assigns to an anchor or window.open.
      return URL.createObjectURL(blob);
    }
    // Native: convert blob → base64 data-URI so expo-file-system can write it.
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new ApiError('Could not read PDF data.', 0));
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError('Report generation timed out.', 0);
    }
    throw new ApiError('Could not reach the server. Check the API address.', 0);
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  health: (base: string) => request<{ status: string }>(base, '/health', undefined, {}, 4000),

  login: async (base: string, email: string, password: string): Promise<Session> => {
    const auth = await request<{ access_token: string }>(
      base,
      '/auth/login',
      undefined,
      json({ email, password }),
    );
    const me = await request<{ role: Role; full_name: string; email: string }>(
      base,
      '/auth/me',
      auth.access_token,
    );
    return { token: auth.access_token, role: me.role, fullName: me.full_name, email: me.email };
  },

  register: (base: string, body: { email: string; full_name: string; password: string }) =>
    request<{ id: string; email: string; full_name: string; role: Role; is_active: boolean }>(
      base,
      '/auth/register',
      undefined,
      json(body),
    ),

  inspections: (base: string, token: string) =>
    request<Inspection[]>(base, '/inspections', token),

  searchInspections: (
    base: string,
    token: string,
    filters: { q?: string; status?: InspectionStatus; date_from?: string; date_to?: string },
  ) => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.status) params.set('status', filters.status);
    if (filters.date_from) params.set('date_from', filters.date_from);
    if (filters.date_to) params.set('date_to', filters.date_to);
    const qs = params.toString();
    return request<Inspection[]>(base, `/inspections${qs ? `?${qs}` : ''}`, token);
  },

  inspection: (base: string, token: string, id: string) =>
    request<Inspection>(base, `/inspections/${id}`, token),

  /**
   * The backend's PATCH replaces the whole InspectionUpdate payload (it is
   * not a sparse patch) — any field left out reverts to its schema default.
   * Callers must always send the inspection's current values for fields
   * they are not intentionally changing.
   */
  updateInspection: (
    base: string,
    token: string,
    id: string,
    body: {
      outlet_name?: string;
      outlet_address?: string;
      product_name?: string;
      product_category?: string;
      measure_font_size?: boolean;
      measure_net_quantity?: boolean;
      measured_net_quantity_value?: number;
      measured_net_quantity_unit?: string;
      measuring_instrument?: string;
      declared_data?: Record<string, unknown>;
    },
  ) =>
    request<Inspection>(base, `/inspections/${id}`, token, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  /** Replaces extracted_data wholesale and re-runs the rule engine server-side. */
  saveExtractedData: (base: string, token: string, id: string, extractedData: ExtractedData) =>
    request<Inspection>(base, `/inspections/${id}/extracted-data`, token, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extracted_data: extractedData }),
    }),

  createInspection: (
    base: string,
    token: string,
    body: {
      outlet_name?: string;
      outlet_address?: string;
      product_name?: string;
      product_category?: string;
      measure_font_size?: boolean;
      measure_net_quantity?: boolean;
      measured_net_quantity_value?: number;
      measured_net_quantity_unit?: string;
      measuring_instrument?: string;
    },
  ) => request<Inspection>(base, '/inspections', token, json(body)),

  createPanel: (
    base: string,
    token: string,
    inspectionId: string,
    body: { panel_name: PanelName; capture_source: CaptureSource },
  ) => request<Panel>(base, `/inspections/${inspectionId}/panels`, token, json(body)),

  uploadShot: async (
    base: string,
    token: string,
    panelId: string,
    shot: ShotType,
    asset: { uri: string; fileName?: string | null; mimeType?: string | null },
  ) => {
    const name = asset.fileName || `${shot}.jpg`;
    const mimeType = asset.mimeType || 'image/jpeg';
    const url = `${base.replace(/\/$/, '')}/panels/${panelId}/uploads?shot_type=${shot}`;

    if (Platform.OS === 'web') {
      // Web: fetch the blob from the object URL then multipart-post it.
      const form = new FormData();
      const blob = await (await fetch(asset.uri)).blob();
      form.append('file', blob, name);
      return request<Panel>(base, `/panels/${panelId}/uploads?shot_type=${shot}`, token, {
        method: 'POST',
        body: form,
      }, 60000);
    }

    // Native: use expo-file-system/legacy which is stable in SDK 57, then
    // upload via XHR. We avoid atob() which is unreliable in Hermes —
    // instead write the base64 to a temp file and let XHR read it directly
    // using the file:// URI, which React Native's XHR handles natively.
    const form = new FormData();
    // React Native's FormData accepts a file descriptor object for native uploads.
    // This is the correct pattern for RN — no atob/Blob conversion needed.
    form.append('file', {
      uri: asset.uri,
      name,
      type: mimeType,
    } as unknown as Blob);

    return new Promise<Panel>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.timeout = 120000;
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText) as Panel); }
          catch { reject(new ApiError('Unexpected server response.', xhr.status)); }
        } else {
          try {
            const body = JSON.parse(xhr.responseText) as { detail?: string };
            reject(new ApiError(body.detail || 'Upload rejected by server.', xhr.status));
          } catch {
            reject(new ApiError(`Upload failed: HTTP ${xhr.status}`, xhr.status));
          }
        }
      };
      xhr.onerror = () => reject(new ApiError('Upload failed. Check your network connection.', 0));
      xhr.ontimeout = () => reject(new ApiError('Upload timed out. Try a smaller image.', 0));
      xhr.send(form);
    });
  },

  evidenceUrl: (base: string, token: string, evidenceId: string) =>
    request<{ url: string; expires_in_seconds: number }>(
      base,
      `/evidence/${evidenceId}/download-url`,
      token,
    ),

  dashboard: (base: string, token: string) =>
    request<Dashboard>(base, '/supervisor/dashboard', token),

  resolveCorrectiveAction: (base: string, token: string, actionId: string) =>
    request<CorrectiveAction>(base, `/corrective-actions/${actionId}/resolve`, token, {
      method: 'PATCH',
    }),

  searchManufacturers: (base: string, token: string, q?: string) =>
    request<Manufacturer[]>(base, `/manufacturers${q ? `?q=${encodeURIComponent(q)}` : ''}`, token),

  /** No login required — this is the public retailer due-diligence lookup. */
  publicManufacturerLookup: (base: string, q: string) =>
    request<PublicComplianceLookup>(base, `/public/manufacturers?q=${encodeURIComponent(q)}`),

  createManufacturer: (
    base: string,
    token: string,
    body: { name: string; address?: string; notes?: string },
  ) => request<Manufacturer>(base, '/manufacturers', token, json(body)),

  /**
   * The supervisor's confirmation that a FAIL finding is a genuine
   * violation — distinct from reviewFinding above, which is the inspector's
   * NEEDS_REVIEW -> FAIL/PASS decision. Exactly one of manufacturerId /
   * newManufacturer must be provided, mirroring the backend's XOR check.
   */
  confirmViolation: (
    base: string,
    token: string,
    findingId: string,
    body: {
      manufacturer_id?: string;
      new_manufacturer?: { name: string; address?: string; notes?: string };
      correction_period_days?: number;
    },
  ) => request<ViolationCase>(base, `/findings/${findingId}/confirm-violation`, token, json(body)),

  /**
   * The positive counterpart to confirmViolation: links a COMPLIANT
   * inspection to a manufacturer so the public lookup can report
   * "inspected, no violations" instead of staying silent on that name.
   */
  confirmCompliance: (
    base: string,
    token: string,
    inspectionId: string,
    body: {
      manufacturer_id?: string;
      new_manufacturer?: { name: string; address?: string; notes?: string };
    },
  ) =>
    request<ManufacturerComplianceRecord>(
      base,
      `/inspections/${inspectionId}/confirm-compliance`,
      token,
      json(body),
    ),

  violationCases: (base: string, token: string, statusFilter?: ViolationCaseStatus) =>
    request<ViolationCase[]>(
      base,
      `/violation-cases${statusFilter ? `?status=${statusFilter}` : ''}`,
      token,
    ),

  uploadRectificationEvidence: async (
    base: string,
    token: string,
    caseId: string,
    asset: { uri: string; fileName?: string | null; mimeType?: string | null },
    note?: string,
  ) => {
    const name = asset.fileName || 'evidence.jpg';
    const mimeType = asset.mimeType || 'image/jpeg';
    const qs = note ? `?note=${encodeURIComponent(note)}` : '';
    const url = `${base.replace(/\/$/, '')}/violation-cases/${caseId}/evidence${qs}`;

    if (Platform.OS === 'web') {
      const form = new FormData();
      const blob = await (await fetch(asset.uri)).blob();
      form.append('file', blob, name);
      return request<ViolationCase>(base, `/violation-cases/${caseId}/evidence${qs}`, token, {
        method: 'POST',
        body: form,
      }, 60000);
    }

    const form = new FormData();
    form.append('file', { uri: asset.uri, name, type: mimeType } as unknown as Blob);
    return new Promise<ViolationCase>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.timeout = 120000;
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText) as ViolationCase); }
          catch { reject(new ApiError('Unexpected server response.', xhr.status)); }
        } else {
          try {
            const errorBody = JSON.parse(xhr.responseText) as { detail?: string };
            reject(new ApiError(errorBody.detail || 'Upload rejected by server.', xhr.status));
          } catch {
            reject(new ApiError(`Upload failed: HTTP ${xhr.status}`, xhr.status));
          }
        }
      };
      xhr.onerror = () => reject(new ApiError('Upload failed. Check your network connection.', 0));
      xhr.ontimeout = () => reject(new ApiError('Upload timed out. Try a smaller image.', 0));
      xhr.send(form);
    });
  },

  rectifyCase: (base: string, token: string, caseId: string, note?: string) =>
    request<ViolationCase>(base, `/violation-cases/${caseId}/rectify`, token, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    }),

  escalateCase: (base: string, token: string, caseId: string) =>
    request<ViolationCase>(base, `/violation-cases/${caseId}/escalate`, token, { method: 'PATCH' }),

  issueFine: (
    base: string,
    token: string,
    caseId: string,
    body: { fine_amount: string; fine_notes?: string },
  ) =>
    request<ViolationCase>(base, `/violation-cases/${caseId}/issue-fine`, token, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  reviewFinding: (
    base: string,
    token: string,
    findingId: string,
    action: 'confirm' | 'reject',
    note?: string,
  ) =>
    request<Inspection>(base, `/findings/${findingId}/review`, token, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...(note ? { note } : {}) }),
    }),

  /**
   * Binary PDF downloads. The shared `request<T>` helper always calls
   * .json(), so these use raw fetch instead. The caller receives a Blob
   * (native) or an object URL string (web) ready to open or share.
   */
  downloadProforma: (base: string, token: string, inspectionId: string) =>
    _fetchPdf(`${base}/inspections/${inspectionId}/report/proforma`, token),

  downloadSeizureMemo: (base: string, token: string, inspectionId: string) =>
    _fetchPdf(`${base}/inspections/${inspectionId}/report/seizure-memo`, token),

  downloadPanchnama: (
    base: string,
    token: string,
    inspectionId: string,
    body: {
      witness_one: { name: string; designation?: string; address?: string };
      witness_two: { name: string; designation?: string; address?: string };
      place_of_search: string;
      officer_designation?: string;
      correction_period_days?: number;
    },
  ) =>
    _fetchPdf(`${base}/inspections/${inspectionId}/report/panchnama`, token, body),
};

// ---------------------------------------------------------------------------
// Presentation helpers. Kept next to the types so labels cannot drift per screen.
// ---------------------------------------------------------------------------

export const inspectionLabel: Record<InspectionStatus, string> = {
  draft: 'Draft',
  capturing: 'Capturing',
  processing: 'Analysing',
  needs_review: 'Needs review',
  compliant: 'Compliant',
  violation: 'Violation',
};

export const findingLabel: Record<FindingStatus, string> = {
  PASS: 'Pass',
  FAIL: 'Fail',
  NEEDS_REVIEW: 'Review',
  NOT_APPLICABLE: 'N/A',
};

export const isSettled = (status: InspectionStatus) =>
  status === 'compliant' || status === 'violation' || status === 'needs_review';

/** Categories the rule engine actually branches on, plus a general fallback. */
export const categories = [
  'food',
  'beverage',
  'cosmetic',
  'pharmaceutical',
  'confectionery',
  'household',
  'apparel',
  'other',
] as const;

export const panelNames: PanelName[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

export function latestJobDetail(inspection: Inspection): JobDetail | null {
  const completed = inspection.jobs
    .filter((job) => job.status === 'completed' && job.detail)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  if (!completed?.detail) return null;
  try {
    return JSON.parse(completed.detail) as JobDetail;
  } catch {
    return null;
  }
}

export function failedJob(inspection: Inspection): Job | null {
  return inspection.jobs.find((job) => job.status === 'failed') ?? null;
}

export function shortDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}
