# LegalMetry backend

The backend stores inspection records in PostgreSQL, package images in MinIO, and background jobs in Redis/Celery. PostgreSQL is the authoritative source for both inspector and supervisor data.

## Start locally

1. Copy `backend/.env.example` to `backend/.env` and replace the example secrets.
2. Run `docker compose up --build` from the repository root.
3. Open `http://localhost:8000/docs` for the API. MinIO Console is at `http://localhost:9001`.

An initial supervisor is seeded from `INITIAL_SUPERVISOR_EMAIL` and `INITIAL_SUPERVISOR_PASSWORD`. `POST /auth/register` deliberately creates inspectors only; supervisor accounts are not self-service.

For the current demo, every inspection belongs to `SINGLE_DISTRICT_NAME`; no inspector district selection is exposed. `GET /supervisor/dashboard` is a read-only district overview with report totals, violation-by-rule counts, category summaries, recent reports, and violation reports.

## Capture workflow

Create an inspection, create a panel with a `capture_source` of `camera` or `gallery`, then upload exactly one `calibration` photo and one `ocr` photo to that panel. The backend hashes each original upload before storing it and queues a `panel_pair_ready` job when the pair is complete.

Evidence remains private in MinIO. An authorized inspector or supervisor can request a ten-minute evidence URL through `GET /evidence/{evidence_id}/download-url`; the object bucket itself is not public.

The worker automatically analyses each calibration shot for a ₹10 coin and records its confidence, circle geometry, and pixels-per-mm result on the queued job. Ambiguous, cropped, blurry, or non-coin circular candidates are retained as `needs_review`, not treated as calibration. It also runs English PaddleOCR against the paired OCR image, saves recognized text, confidence and bounding polygons in `extracted_data`, extracts selected declarations conservatively, and invokes the deterministic rule engine. When OCR confidence is below 0.85, otherwise-failing declaration checks are routed to human review.
