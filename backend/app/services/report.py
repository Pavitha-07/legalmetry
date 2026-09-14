"""PDF report generation for the Legal Metrology inspection system.

Three report types, all produced server-side using fpdf2:

1. Inspection Proforma  - generated for every settled inspection.
2. Seizure Memo         - generated only when the outcome is VIOLATION.
3. Panchnama            - generated only when the outcome is VIOLATION;
                          requires witness details supplied at request time.

Each generator receives the SQLAlchemy Inspection object (with all
relationships eagerly loaded) plus any extra caller-supplied data.
Images are fetched from MinIO using get_bytes() and embedded directly -
no presigned URL round-trip, no temp files on disk.
"""

from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import Optional

import cv2
import numpy as np
from fpdf import FPDF, XPos, YPos
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import EvidenceFile, Inspection, PanelCapture, ShotType
from app.services.storage import get_bytes

# Evidence photos are stored (and re-served to the app) at full camera
# resolution, but a report only ever displays them at 50-80mm wide. Embedding
# the original bytes directly made every PDF several MB per panel - big
# enough that fetching + base64-round-tripping it on a phone (React Native's
# fetch().blob() -> FileReader.readAsDataURL() path) could silently corrupt
# or truncate the file. Downscaling to print resolution before embedding
# fixes both the size and the corruption risk.
_PDF_IMAGE_MAX_DIM = 1400
_PDF_IMAGE_JPEG_QUALITY = 78


def _downscale_for_pdf(raw: bytes) -> bytes:
    """Re-encode an evidence photo at print resolution for PDF embedding.

    Falls back to the original bytes if decoding fails, so a malformed or
    unusual image never breaks report generation - it just embeds larger.
    """
    array = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        return raw

    height, width = image.shape[:2]
    longest = max(height, width)
    if longest > _PDF_IMAGE_MAX_DIM:
        scale = _PDF_IMAGE_MAX_DIM / longest
        image = cv2.resize(
            image, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA
        )

    ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, _PDF_IMAGE_JPEG_QUALITY])
    return encoded.tobytes() if ok else raw


# ---------------------------------------------------------------------------
# Palette / design tokens  (match the app's primary/surface colours loosely)
# ---------------------------------------------------------------------------
NAVY   = (0,   30,  64)   # primary dark blue
SAFFRON = (255, 153, 51)   # accent / violation highlight
PASS_G = (14,  124, 72)   # pass green
FAIL_R = (196, 43,  33)   # fail red
REVIEW = (166, 99,  0)    # review amber
GRAY1  = (245, 245, 245)  # table alt-row fill
GRAY2  = (200, 200, 200)  # border lines
WHITE  = (255, 255, 255)
BLACK  = (0,   0,   0)

STATUS_COLOUR = {
    "PASS":           PASS_G,
    "FAIL":           FAIL_R,
    "NEEDS_REVIEW":   REVIEW,
    "NOT_APPLICABLE": (150, 150, 150),
}

def _safe(text: str) -> str:
    """Strip non-Latin-1 characters so fpdf2's built-in Helvetica doesn't crash.

    Extracted data (OCR text, worker-written strings like the coin reference)
    can contain Unicode characters such as the rupee sign that fall outside
    the cp1252/latin-1 range supported by the built-in font.  We replace known
    problematic characters and then drop anything else outside 0x00-0xFF.
    """
    text = str(text)
    replacements = {
        "\u20b9": "Rs.", "\u20a8": "Rs.",   # rupee signs
        "\u2014": "-",   "\u2013": "-",     # em/en dash
        "\u2026": "...",                     # ellipsis
        "\u2022": "*",                       # bullet
        "\u00b7": ".",                       # middle dot
        "\u2019": "'",   "\u2018": "'",     # curly quotes
        "\u201c": '"',   "\u201d": '"',
    }
    for ch, rep in replacements.items():
        text = text.replace(ch, rep)
    # Drop anything still outside Latin-1
    return text.encode("latin-1", errors="replace").decode("latin-1")


MARGIN = 14   # mm left/right margin
LINE_H = 6    # standard line height mm
TH     = 7    # table row height mm


# ---------------------------------------------------------------------------
# Base PDF class with shared helpers
# ---------------------------------------------------------------------------

class _LMBase(FPDF):
    """Shared header / footer / table helpers for all three report types."""

    def __init__(self, report_title: str, reference: str, district: str):
        super().__init__(orientation="P", unit="mm", format="A4")
        self._report_title = report_title
        self._reference    = reference
        self._district     = district
        self.set_margins(MARGIN, 14, MARGIN)
        self.set_auto_page_break(auto=True, margin=18)
        self.add_page()

    # ---------- page header / footer (called automatically by fpdf2) -------

    def header(self):
        # Top rule
        self.set_draw_color(*NAVY)
        self.set_line_width(0.8)
        self.line(MARGIN, 10, self.w - MARGIN, 10)
        self.ln(3)

        self.set_font("Helvetica", "B", 11)
        self.set_text_color(*NAVY)
        self.cell(0, 6, "LEGAL METROLOGY DEPARTMENT", align="C",
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        self.set_font("Helvetica", "", 8)
        self.set_text_color(80, 80, 80)
        self.cell(0, 5, f"{self._district}  .  Legal Metrology (Packaged Commodities) Rules, 2011",
                  align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*NAVY)
        self.cell(0, 6, self._report_title.upper(), align="C",
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(1)

        # Divider
        self.set_draw_color(*NAVY)
        self.set_line_width(0.5)
        self.line(MARGIN, self.get_y(), self.w - MARGIN, self.get_y())
        self.ln(3)

    def footer(self):
        self.set_y(-14)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(130, 130, 130)
        ts = datetime.now(timezone.utc).strftime("%d %b %Y %H:%M UTC")
        self.cell(0, 4, f"Ref: {self._reference}  .  Generated: {ts}  .  Page {self.page_no()}/{{nb}}",
                  align="C")

    # ---------- section heading --------------------------------------------

    def section(self, title: str):
        """Bold navy section label with a thin rule underneath."""
        self.ln(3)
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*NAVY)
        self.cell(0, 6, title.upper(), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_draw_color(*NAVY)
        self.set_line_width(0.3)
        self.line(MARGIN, self.get_y(), self.w - MARGIN, self.get_y())
        self.ln(2)

    # ---------- two-column key/value row -----------------------------------

    def kv_row(self, key: str, value: str, key_w: float = 48):
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(80, 80, 80)
        self.cell(key_w, LINE_H, key + ":", new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*BLACK)
        self.multi_cell(0, LINE_H, _safe(str(value) if value else "-"),
                        new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    # ---------- findings table ---------------------------------------------

    def findings_table(self, findings: list):
        """Render all findings grouped: FAIL first, NEEDS_REVIEW, PASS, N/A."""
        if not findings:
            return

        cw_rule  = 20
        cw_req   = 70
        cw_val   = 48
        cw_stat  = 22
        usable   = self.w - 2 * MARGIN

        # Header row
        self.set_fill_color(*NAVY)
        self.set_text_color(*WHITE)
        self.set_font("Helvetica", "B", 7)
        self.set_draw_color(*GRAY2)
        self.set_line_width(0.2)

        self.cell(cw_rule, TH, "Rule ID",      border=1, fill=True, new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.cell(cw_req,  TH, "Requirement",  border=1, fill=True, new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.cell(cw_val,  TH, "Detected",     border=1, fill=True, new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.cell(cw_stat, TH, "Status",       border=1, fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        order = {"FAIL": 0, "NEEDS_REVIEW": 1, "PASS": 2, "NOT_APPLICABLE": 3}
        sorted_findings = sorted(findings, key=lambda f: order.get(f.status, 9))

        for i, f in enumerate(sorted_findings):
            fill_col = GRAY1 if i % 2 == 0 else WHITE
            stat_col = STATUS_COLOUR.get(f.status, BLACK)

            self.set_fill_color(*fill_col)
            self.set_text_color(*BLACK)
            self.set_font("Helvetica", "", 7)

            # Calculate row height based on longest text (multi_cell needs height pre-calculated)
            # Use a fixed height; long text clips rather than overflows - acceptable for legal tables.
            self.cell(cw_rule, TH, f.rule_id, border=1, fill=True, new_x=XPos.RIGHT, new_y=YPos.TOP)

            req_text = _safe(f.requirement[:58] + "..." if len(f.requirement) > 58 else f.requirement)
            self.cell(cw_req, TH, req_text, border=1, fill=True, new_x=XPos.RIGHT, new_y=YPos.TOP)

            val_text = _safe((f.detected_value or "-")[:38])
            self.cell(cw_val, TH, val_text, border=1, fill=True, new_x=XPos.RIGHT, new_y=YPos.TOP)

            self.set_text_color(*stat_col)
            self.set_font("Helvetica", "B", 7)
            self.cell(cw_stat, TH, f.status.replace("_", " "), border=1, fill=True,
                      new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        self.set_text_color(*BLACK)

    # ---------- measurements table -----------------------------------------

    def measurements_table(self, measurements: list[dict]):
        """Font-height measurement rows: text / height_px / height_mm / confidence."""
        if not measurements:
            return

        cw_text  = 90
        cw_px    = 22
        cw_mm    = 22
        cw_conf  = 22

        self.set_fill_color(*NAVY)
        self.set_text_color(*WHITE)
        self.set_font("Helvetica", "B", 7)
        self.set_draw_color(*GRAY2)
        self.set_line_width(0.2)

        self.cell(cw_text, TH, "Declaration Text",    border=1, fill=True, new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.cell(cw_px,   TH, "Height (px)",         border=1, fill=True, new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.cell(cw_mm,   TH, "Height (mm)",         border=1, fill=True, new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.cell(cw_conf, TH, "Confidence",          border=1, fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        for i, m in enumerate(measurements[:30]):   # cap at 30 rows
            fill_col = GRAY1 if i % 2 == 0 else WHITE
            self.set_fill_color(*fill_col)
            self.set_text_color(*BLACK)
            self.set_font("Helvetica", "", 7)

            text = _safe(str(m.get("text", ""))[:70])
            self.cell(cw_text, TH, text,                                 border=1, fill=True, new_x=XPos.RIGHT, new_y=YPos.TOP)
            self.cell(cw_px,   TH, f"{m.get('height_px', 0):.1f}",      border=1, fill=True, new_x=XPos.RIGHT, new_y=YPos.TOP)
            self.cell(cw_mm,   TH, f"{m.get('height_mm', 0):.3f}",      border=1, fill=True, new_x=XPos.RIGHT, new_y=YPos.TOP)
            self.cell(cw_conf, TH, f"{m.get('confidence', 0)*100:.0f}%", border=1, fill=True,
                      new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    # ---------- evidence images --------------------------------------------

    def embed_evidence_images(self, inspection: Inspection, db: Session):
        """Fetch and embed OCR (coin-free) shots for each panel.

        Calibration shot (Shot A, with coin) is included at smaller size for
        scale-reference documentation; OCR shot (Shot B) is shown larger as the
        primary label evidence.
        """
        panels = inspection.panels
        if not panels:
            return

        for panel in panels:
            uploads = panel.uploads
            cal_file  = next((u for u in uploads if u.shot_type == ShotType.CALIBRATION), None)
            ocr_file  = next((u for u in uploads if u.shot_type == ShotType.OCR), None)

            label = f"Panel: {panel.panel_name.value.upper()}"
            self.section(label)

            img_w_main = 80   # mm - OCR shot
            img_w_cal  = 50   # mm - calibration shot (smaller, for reference)
            gap        = 6

            x_start = MARGIN
            y_start = self.get_y()

            # Check if both images fit on current page; if not, add a page.
            page_h_remaining = self.h - self.b_margin - y_start
            if page_h_remaining < 65:
                self.add_page()
                y_start = self.get_y()

            if ocr_file:
                try:
                    raw = _downscale_for_pdf(get_bytes(ocr_file.object_key))
                    img_io = io.BytesIO(raw)
                    self.image(img_io, x=x_start, y=y_start, w=img_w_main,
                               keep_aspect_ratio=True, type="JPEG")
                    self.set_xy(x_start, y_start + 3)
                    self.set_font("Helvetica", "B", 7)
                    self.set_text_color(*NAVY)
                    self.cell(img_w_main, 5, "Shot B - label (no coin)", align="C",
                              new_x=XPos.LMARGIN, new_y=YPos.NEXT)
                except Exception:
                    self.set_font("Helvetica", "I", 8)
                    self.set_text_color(*FAIL_R)
                    self.cell(0, LINE_H, "[OCR image unavailable]",
                              new_x=XPos.LMARGIN, new_y=YPos.NEXT)

            if cal_file:
                try:
                    raw = _downscale_for_pdf(get_bytes(cal_file.object_key))
                    img_io = io.BytesIO(raw)
                    self.image(img_io, x=x_start + img_w_main + gap,
                               y=y_start, w=img_w_cal,
                               keep_aspect_ratio=True, type="JPEG")
                    self.set_xy(x_start + img_w_main + gap, y_start + 3)
                    self.set_font("Helvetica", "B", 7)
                    self.set_text_color(*NAVY)
                    self.cell(img_w_cal, 5, "Shot A - with Rs.10 coin", align="C",
                              new_x=XPos.LMARGIN, new_y=YPos.NEXT)
                except Exception:
                    pass

            # Move cursor below the images (approx 60 mm tall + label)
            self.set_y(y_start + 66)
            self.set_text_color(*BLACK)

            # SHA-256 hashes under each image for chain-of-custody record
            if ocr_file:
                self.set_font("Helvetica", "I", 6.5)
                self.set_text_color(100, 100, 100)
                self.cell(0, 4,
                          f"OCR shot SHA-256: {ocr_file.sha256[:32]}...   "
                          f"Cal shot SHA-256: {cal_file.sha256[:32] + '...' if cal_file else '-'}",
                          new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            self.set_text_color(*BLACK)

    # ---------- signature block --------------------------------------------

    def signature_block(self, inspector_name: str, designation: str = "Legal Metrology Inspector"):
        self.ln(10)
        self.set_draw_color(*GRAY2)
        self.set_line_width(0.3)

        usable = self.w - 2 * MARGIN
        col    = usable / 3

        y = self.get_y()
        self.line(MARGIN,          y, MARGIN + col - 6,       y)
        self.line(MARGIN + col,    y, MARGIN + 2 * col - 6,   y)
        self.line(MARGIN + 2*col,  y, MARGIN + 3 * col - 2,   y)

        self.ln(2)
        self.set_font("Helvetica", "", 7)
        self.set_text_color(80, 80, 80)

        self.cell(col, 4, inspector_name,      new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.cell(col, 4, "Authorised Officer",new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.cell(col, 4, "Date & Seal",       new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        self.set_font("Helvetica", "I", 6.5)
        self.cell(col, 4, designation,         new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.cell(col, 4, "",                  new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.cell(col, 4, "",                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_text_color(*BLACK)

    # ---------- disclaimer -------------------------------------------------

    def disclaimer(self):
        self.ln(4)
        self.set_font("Helvetica", "I", 6.5)
        self.set_text_color(130, 130, 130)
        self.multi_cell(0, 4,
            "This document is generated by the LegalMetry inspection assistance system. "
            "It is a computer-aided record; the Inspector is responsible for verifying all "
            "findings before submission. Results must be validated against the current "
            "Legal Metrology (Packaged Commodities) Rules, 2011 and any applicable amendments.",
            new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_text_color(*BLACK)


# ---------------------------------------------------------------------------
# Helper - pull inspector details
# ---------------------------------------------------------------------------

def _inspector_line(inspection: Inspection) -> tuple[str, str]:
    insp = inspection.inspector
    return (
        insp.full_name if insp else "Inspector",
        insp.email    if insp else "",
    )


def _fmt_date(dt: datetime | None) -> str:
    if dt is None:
        return "-"
    return dt.strftime("%d %b %Y, %H:%M UTC")


def _status_label(status: str) -> str:
    return {
        "compliant":    "COMPLIANT",
        "violation":    "VIOLATION",
        "needs_review": "NEEDS HUMAN REVIEW",
    }.get(status, status.upper())


# ---------------------------------------------------------------------------
# 1. Inspection Proforma
# ---------------------------------------------------------------------------

def generate_inspection_proforma(inspection: Inspection, db: Session) -> bytes:
    """Form IV-A style Inspection Proforma.

    Produced for every settled inspection regardless of outcome.
    Contains: inspection metadata, declared vs extracted fields, findings
    table, font-measurement table, evidence images, chain-of-custody hashes,
    signature block.
    """
    settings    = get_settings()
    insp_name, insp_email = _inspector_line(inspection)

    outcome     = inspection.status.value
    outcome_col = FAIL_R if outcome == "violation" else (REVIEW if outcome == "needs_review" else PASS_G)

    pdf = _LMBase(
        report_title="Inspection Proforma (Form IV-A)",
        reference=inspection.reference,
        district=settings.single_district_name,
    )

    # ---- Inspection identity -------------------------------------------------
    pdf.section("Inspection Details")
    pdf.kv_row("Reference No.",    inspection.reference)
    pdf.kv_row("Date of Inspection", _fmt_date(inspection.created_at))
    pdf.kv_row("Inspector",        f"{insp_name} ({insp_email})")

    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*outcome_col)
    pdf.cell(48, LINE_H, "Outcome:", new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(0, LINE_H, _status_label(outcome), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(*BLACK)

    # ---- Retail outlet -------------------------------------------------------
    pdf.section("Retail Outlet / Premises")
    pdf.kv_row("Outlet Name",    inspection.outlet_name or "-")
    pdf.kv_row("Address",        inspection.outlet_address or "-")

    # ---- Package details -----------------------------------------------------
    pdf.section("Packaged Commodity")
    pdf.kv_row("Product Name",   inspection.product_name or "-")
    pdf.kv_row("Category",       (inspection.product_category or "-").title())

    ed = inspection.extracted_data or {}
    pdf.kv_row("MRP (Detected)",
               f"Rs.{ed['mrp']['value']}" if ed.get("mrp") else "-")
    nq = ed.get("net_quantity")
    pdf.kv_row("Net Quantity (Detected)",
               f"{nq['value']} {nq['unit']}" if nq else "-")
    pdf.kv_row("Mfg / Pack Date",  str(ed.get("manufacture_date") or "-"))
    pdf.kv_row("Best Before",      str(ed.get("best_before") or "-"))
    pdf.kv_row("Lot / Batch No.",  str(ed.get("lot_number") or "-"))
    cc = ed.get("consumer_care")
    if cc:
        pdf.kv_row("Consumer Care",
                   f"Phone: {cc.get('phone') or '-'}   Email: {cc.get('email') or '-'}")
    mfr = ed.get("manufacturer")
    if mfr:
        pdf.kv_row("Manufacturer",
                   f"{mfr.get('name', '-')}  {mfr.get('address') or ''}")

    # ---- OCR / calibration summary ------------------------------------------
    pdf.section("Computer Vision Summary")
    font_meas = ed.get("font_measurements") or {}
    pdf.kv_row("Coin Scale",
               f"{font_meas.get('pixels_per_mm', 'N/A')} px/mm  "
               f"({font_meas.get('reference', '-')})")
    pdf.kv_row("OCR Confidence",
               f"{round((ed.get('ocr_confidence') or 0) * 100, 1)}%")

    # ---- Measurements table -------------------------------------------------
    measurements = font_meas.get("measurements") or []
    if measurements:
        pdf.section("Declaration Font-Height Measurements")
        pdf.set_font("Helvetica", "I", 7.5)
        pdf.set_text_color(80, 80, 80)
        pdf.cell(0, 5,
                 "Measured from OCR bounding-box heights, calibrated via Rs.10 coin (27 mm diameter).",
                 new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_text_color(*BLACK)
        pdf.measurements_table(measurements)

    # ---- Findings table -----------------------------------------------------
    pdf.section("Statutory Findings")
    pdf.set_font("Helvetica", "I", 7.5)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 5,
             "Evaluated against Legal Metrology (Packaged Commodities) Rules, 2011.",
             new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(*BLACK)
    pdf.findings_table(inspection.findings)

    # Summary counts
    counts = {"PASS": 0, "FAIL": 0, "NEEDS_REVIEW": 0, "NOT_APPLICABLE": 0}
    for f in inspection.findings:
        counts[f.status] = counts.get(f.status, 0) + 1
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 7.5)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 5,
             f"Summary: {counts['PASS']} Pass  .  {counts['FAIL']} Fail  .  "
             f"{counts['NEEDS_REVIEW']} Review  .  {counts['NOT_APPLICABLE']} N/A",
             new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(*BLACK)

    # ---- Evidence images ----------------------------------------------------
    pdf.section("Evidence Images")
    pdf.embed_evidence_images(inspection, db)

    # ---- Signature / disclaimer ---------------------------------------------
    pdf.signature_block(insp_name)
    pdf.disclaimer()

    pdf.alias_nb_pages()
    return bytes(pdf.output())


# ---------------------------------------------------------------------------
# 2. Seizure Memo
# ---------------------------------------------------------------------------

def generate_seizure_memo(inspection: Inspection, db: Session) -> bytes:
    """Seizure Memo / Receipt.

    Generated only when outcome == VIOLATION.  Contains everything in the
    Proforma plus an explicit seizure section listing what was seized, the
    declared vs detected discrepancies, and applicable penalty provisions.
    """
    settings = get_settings()
    insp_name, insp_email = _inspector_line(inspection)

    pdf = _LMBase(
        report_title="Seizure Memo / Receipt",
        reference=inspection.reference,
        district=settings.single_district_name,
    )

    # ---- Identity -----------------------------------------------------------
    pdf.section("Seizure Details")
    pdf.kv_row("Reference No.",     inspection.reference)
    pdf.kv_row("Date of Seizure",   _fmt_date(inspection.updated_at))
    pdf.kv_row("Seizing Officer",   f"{insp_name} ({insp_email})")
    pdf.kv_row("Premises Visited",  inspection.outlet_name or "-")
    pdf.kv_row("Premises Address",  inspection.outlet_address or "-")

    # ---- Commodity description ---------------------------------------------
    pdf.section("Seized Commodity")
    ed = inspection.extracted_data or {}
    pdf.kv_row("Product Name",      inspection.product_name or "-")
    pdf.kv_row("Category",          (inspection.product_category or "-").title())
    nq = ed.get("net_quantity")
    pdf.kv_row("Declared Net Qty",  f"{nq['value']} {nq['unit']}" if nq else "-")
    pdf.kv_row("MRP on Label",      f"Rs.{ed['mrp']['value']}" if ed.get("mrp") else "-")
    pdf.kv_row("Lot / Batch",       str(ed.get("lot_number") or "-"))
    mfr = ed.get("manufacturer")
    if mfr:
        pdf.kv_row("Manufacturer / Packer", f"{mfr.get('name', '-')}, {mfr.get('address') or '-'}")

    # ---- Grounds for seizure -----------------------------------------------
    pdf.section("Grounds for Seizure - Failed Checks")
    pdf.set_font("Helvetica", "I", 7.5)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 5,
             "The following mandatory declarations were found non-compliant with "
             "Legal Metrology (Packaged Commodities) Rules, 2011:",
             new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(*BLACK)

    fail_findings = [f for f in inspection.findings if f.status == "FAIL"]
    pdf.findings_table(fail_findings)

    # ---- Full findings table for completeness ------------------------------
    pdf.section("Complete Findings (All Rules)")
    pdf.findings_table(inspection.findings)

    # ---- Measurements -------------------------------------------------------
    measurements = (ed.get("font_measurements") or {}).get("measurements") or []
    if measurements:
        pdf.section("Font-Height Measurements")
        pdf.measurements_table(measurements)

    # ---- Penalty provisions ------------------------------------------------
    pdf.section("Applicable Penalty Provisions")
    pdf.set_font("Helvetica", "", 8)
    provisions = [
        "Section 36(1), Legal Metrology Act, 2009 - Penalty for short weight or measure.",
        "Section 18, Legal Metrology Act, 2009 - Mandatory declaration requirements.",
        "Rule 6, Legal Metrology (Packaged Commodities) Rules, 2011 - Declarations on packages.",
        "Rule 18, Legal Metrology (Packaged Commodities) Rules, 2011 - MRP declaration.",
        "The seized goods may be produced before the Judicial Magistrate as per Section 47.",
    ]
    for p in provisions:
        pdf.set_text_color(60, 60, 60)
        pdf.cell(4, LINE_H, "*", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.multi_cell(0, LINE_H, p, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(*BLACK)

    # ---- Acknowledgement box -----------------------------------------------
    pdf.section("Acknowledgement of Receipt")
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(60, 60, 60)
    pdf.multi_cell(0, LINE_H,
        "I, the undersigned, acknowledge receipt of the above-mentioned seized goods / "
        "documents and understand that they will be produced before the competent authority "
        "in accordance with the Legal Metrology Act, 2009.",
        new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(6)
    pdf.set_text_color(*BLACK)

    # ---- Evidence images ---------------------------------------------------
    pdf.section("Evidence Images")
    pdf.embed_evidence_images(inspection, db)

    # ---- Signature blocks --------------------------------------------------
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 6, "Signatures", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    usable = pdf.w - 2 * MARGIN
    col = usable / 2
    y = pdf.get_y() + 14
    pdf.set_draw_color(*GRAY2)
    pdf.set_line_width(0.3)
    pdf.line(MARGIN,          y, MARGIN + col - 8, y)
    pdf.line(MARGIN + col + 8, y, MARGIN + 2*col,  y)
    pdf.set_y(y + 2)
    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(col, 4, f"{insp_name}  (Seizing Officer)", new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.cell(col, 4, "Recipient / Representative", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(*BLACK)

    pdf.disclaimer()
    pdf.alias_nb_pages()
    return bytes(pdf.output())


# ---------------------------------------------------------------------------
# 3. Panchnama
# ---------------------------------------------------------------------------

def generate_panchnama(
    inspection: Inspection,
    db: Session,
    witness_one: dict,
    witness_two: dict,
    place_of_search: str,
    officer_designation: str = "Legal Metrology Inspector",
    correction_period_days: int = 30,
) -> bytes:
    """Panchnama.

    The most legally weighty document.  Requires two independent witnesses
    (Panchas).  Drawn for violations; a NIL Panchnama is drawn when nothing
    incriminating is found - but this generator is only reachable when the
    inspection status is VIOLATION.

    Covers:
    - Witness identification and attestation
    - Full search/seizure narrative
    - Declared vs detected findings
    - Statutory violation citations
    - Font-height evidence
    - Evidence images with chain-of-custody hashes
    - Multi-party signature block (Inspector + both Panchas)
    - Correction-period notice
    """
    settings = get_settings()
    insp_name, insp_email = _inspector_line(inspection)

    pdf = _LMBase(
        report_title="Panchnama (Witness Record of Search / Seizure)",
        reference=inspection.reference,
        district=settings.single_district_name,
    )

    now_str = _fmt_date(datetime.now(timezone.utc))

    # ---- Preamble narrative ------------------------------------------------
    pdf.section("Preamble")
    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_text_color(40, 40, 40)
    preamble = _safe(
        f"This Panchnama is drawn on {now_str} at {place_of_search} in the presence of the "
        f"undersigned independent witnesses (Panchas) who are not related to any party and have "
        f"no interest in the matter.  The proceedings were conducted by {insp_name}, "
        f"{officer_designation}, Legal Metrology Department, {settings.single_district_name}, "
        f"in exercise of powers conferred under Section 16 read with Section 19 of the "
        f"Legal Metrology Act, 2009, and Rule 6 of the Legal Metrology (Packaged "
        f"Commodities) Rules, 2011."
    )
    pdf.multi_cell(0, 5.5, preamble, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(*BLACK)

    # ---- Witnesses (Panchas) -----------------------------------------------
    pdf.section("Independent Witnesses (Panchas)")

    def _witness_block(pdf: _LMBase, label: str, w: dict):
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(*NAVY)
        pdf.cell(0, LINE_H, label, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_text_color(*BLACK)
        pdf.kv_row("Name",        w.get("name", "-"))
        pdf.kv_row("Designation", w.get("designation") or "-")
        pdf.kv_row("Address",     w.get("address") or "-")
        pdf.ln(1)

    _witness_block(pdf, "Witness 1 (Pancha One):", witness_one)
    _witness_block(pdf, "Witness 2 (Pancha Two):", witness_two)

    # ---- Premises & Product ------------------------------------------------
    pdf.section("Premises and Commodity Inspected")
    pdf.kv_row("Place of Search",   place_of_search)
    pdf.kv_row("Premises Name",     inspection.outlet_name or "-")
    pdf.kv_row("Premises Address",  inspection.outlet_address or "-")
    pdf.kv_row("Product Name",      inspection.product_name or "-")
    pdf.kv_row("Category",          (inspection.product_category or "-").title())
    pdf.kv_row("Reference No.",     inspection.reference)
    pdf.kv_row("Date of Inspection", _fmt_date(inspection.created_at))

    ed = inspection.extracted_data or {}
    nq  = ed.get("net_quantity")
    mfr = ed.get("manufacturer")
    pdf.kv_row("Detected Net Qty",  f"{nq['value']} {nq['unit']}" if nq else "-")
    pdf.kv_row("Detected MRP",      f"Rs.{ed['mrp']['value']}" if ed.get("mrp") else "-")
    if mfr:
        pdf.kv_row("Manufacturer",  f"{mfr.get('name', '-')}, {mfr.get('address') or '-'}")

    # ---- Findings narrative ------------------------------------------------
    pdf.section("Findings of Search and Inspection")

    fail_findings = [f for f in inspection.findings if f.status == "FAIL"]
    review_findings = [f for f in inspection.findings if f.status == "NEEDS_REVIEW"]

    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_text_color(40, 40, 40)
    if fail_findings:
        narrative = (
            f"During the course of inspection of the above-mentioned packaged commodity, "
            f"the following {len(fail_findings)} statutory violation(s) were detected by the "
            f"computer-assisted inspection system and confirmed:"
        )
    else:
        narrative = (
            "During the course of inspection, no outright violations were confirmed; however "
            "certain findings have been flagged for human review as detailed below."
        )
    pdf.multi_cell(0, 5.5, narrative, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(*BLACK)
    pdf.ln(2)

    # Full findings table
    pdf.findings_table(inspection.findings)

    # Narrative for each FAIL finding
    if fail_findings:
        pdf.ln(2)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(*FAIL_R)
        pdf.cell(0, LINE_H, "Violation Details:", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_text_color(*BLACK)
        for idx, f in enumerate(fail_findings, 1):
            pdf.set_font("Helvetica", "B", 8)
            pdf.set_text_color(*NAVY)
            pdf.cell(0, LINE_H, f"{idx}. {_safe(f.requirement)}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(40, 40, 40)
            pdf.multi_cell(0, 5, f"   {_safe(f.reason)}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.set_font("Helvetica", "", 7.5)
            pdf.set_text_color(80, 80, 80)
            pdf.cell(0, 4.5, f"   Legal Ref: {_safe(f.legal_reference)}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            if f.recommendation:
                pdf.cell(0, 4.5, f"   Recommendation: {_safe(f.recommendation)}",
                         new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.set_text_color(*BLACK)
            pdf.ln(1)

    # ---- Measurements -------------------------------------------------------
    measurements = (ed.get("font_measurements") or {}).get("measurements") or []
    if measurements:
        pdf.section("Font-Height Measurement Evidence")
        pdf.set_font("Helvetica", "I", 7.5)
        pdf.set_text_color(80, 80, 80)
        pdf.cell(0, 5,
                 "Scale derived from Rs.10 coin (27 mm) in Shot A; measurements taken from Shot B.",
                 new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_text_color(*BLACK)
        pdf.measurements_table(measurements)

    # ---- Correction-period notice ------------------------------------------
    pdf.section("Notice of Correction Period")
    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_text_color(40, 40, 40)
    notice = (
        f"The manufacturer / packer / importer is hereby directed to rectify the above "
        f"violations within {correction_period_days} days from the date of this Panchnama.  "
        f"Failure to comply may result in prosecution under the Legal Metrology Act, 2009.  "
        f"A copy of this Panchnama is furnished to the party whose goods have been inspected / seized."
    )
    pdf.multi_cell(0, 5.5, notice, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(*BLACK)

    # ---- Statutory citations -----------------------------------------------
    pdf.section("Statutory Authority")
    citations = [
        "Section 16, Legal Metrology Act, 2009 - Inspection of weights, measures and commodities.",
        "Section 19, Legal Metrology Act, 2009 - Search and seizure.",
        "Section 25, Legal Metrology Act, 2009 - Penalty for non-standard packages.",
        "Section 36(1), Legal Metrology Act, 2009 - Penalty for short weight or measure.",
        "Rule 6, PCR 2011 - Mandatory declarations on pre-packaged commodities.",
        "Rule 18, PCR 2011 - Maximum Retail Price declaration.",
    ]
    pdf.set_font("Helvetica", "", 7.5)
    for c in citations:
        pdf.set_text_color(60, 60, 60)
        pdf.cell(4, LINE_H, "*", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.multi_cell(0, LINE_H, c, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(*BLACK)

    # ---- Evidence images ---------------------------------------------------
    pdf.section("Evidence Images (Chain of Custody)")
    pdf.embed_evidence_images(inspection, db)

    # ---- Multi-party signature block ---------------------------------------
    pdf.ln(6)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 6, "Signatures of Inspector and Panchas", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(*BLACK)

    usable = pdf.w - 2 * MARGIN
    col = usable / 3
    y_sig = pdf.get_y() + 14
    if y_sig > pdf.h - pdf.b_margin - 30:
        pdf.add_page()
        y_sig = pdf.get_y() + 14

    pdf.set_draw_color(*GRAY2)
    pdf.set_line_width(0.3)
    for k in range(3):
        x_line = MARGIN + k * col
        pdf.line(x_line + 2, y_sig, x_line + col - 4, y_sig)

    pdf.set_y(y_sig + 2)
    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(80, 80, 80)

    w1_name = witness_one.get("name", "Witness 1")
    w2_name = witness_two.get("name", "Witness 2")
    pdf.cell(col, 4, insp_name, new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.cell(col, 4, w1_name,   new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.cell(col, 4, w2_name,   new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_font("Helvetica", "I", 6.5)
    pdf.cell(col, 4, officer_designation,                  new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.cell(col, 4, witness_one.get("designation") or "Pancha 1", new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.cell(col, 4, witness_two.get("designation") or "Pancha 2", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(*BLACK)

    pdf.disclaimer()
    pdf.alias_nb_pages()
    return bytes(pdf.output())
