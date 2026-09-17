# LegalMetry

A computer-vision and rule-engine platform for Legal Metrology enforcement officers. It reads a packaged commodity's mandatory declarations, measures font height against a physical ₹10-coin reference, checks every field against the exact Legal Metrology (Packaged Commodities) Rules, 2011 provision that applies, and generates an evidence-backed report — with the officer confirming every uncertain finding before it becomes a violation.

See `TECHNICAL_APPROACH.md` for the full technical write-up (architecture, tech stack, design decisions).

---

## Prerequisites

- **Docker Desktop** (running) — the entire backend (API, worker, scheduler, database, object storage, cache) runs as containers; you don't need Python installed locally.
- **Node.js 18+** and **npm** — for the mobile/web frontend.
- A phone with the **Expo Go** app, if you want to test on a real device (optional — the app also runs in a browser).

---

## 1. Backend — one-time setup

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and fill in real values:

- `JWT_SECRET` — any long random string.
- `MINIO_ROOT_PASSWORD` — any password.
- `INITIAL_SUPERVISOR_EMAIL` / `INITIAL_SUPERVISOR_PASSWORD` — the one seeded supervisor account (supervisor accounts aren't self-service; `POST /auth/register` always creates an inspector).
- `GROQ_API_KEY` / `GEMINI_API_KEY` — **optional**. Without them, the app still works, just falls back straight to the slower PaddleOCR-only pipeline for every scan instead of using the fast vision-model read (Groq primary, Gemini as a fallback specifically when Groq is rate-limited).

## 2. Start the backend

From the **repository root** (not `backend/`):

```bash
docker compose up -d --build
```

This starts six containers:

| Service | What it is | Port |
|---|---|---|
| `postgres` | Database | 5432 |
| `redis` | Celery broker | 6379 |
| `minio` | Evidence photo / PDF storage | 9000 (API), 9001 (console) |
| `api` | FastAPI app | 8000 |
| `worker` | Celery worker — runs the actual OCR/vision/rule-engine pipeline per job | — |
| `beat` | Celery scheduler — fires the nightly overdue-violation escalation job | — |

Check it's up:

```bash
curl http://localhost:8000/docs   # interactive API docs should load
```

To stop everything later (data is preserved): `docker compose stop`. To also wipe all data: `docker compose down -v`.

## 3. Start the mobile/web app

```bash
cd mobile
npm install
npm run web
```

This opens the Expo dev server at `http://localhost:8081` and launches the web build in your browser automatically.

### Testing on web (browser)

The web build has its own government-portal-style landing page and works out of the box against `http://localhost:8000` — no extra config needed on the same machine.

### Testing on a real phone (Expo Go)

1. Your phone must be on the **same Wi-Fi network** as this machine.
2. `npm run web` starts the dev server in web mode and may not print a QR code. If it doesn't, run `npx expo start` in a separate terminal instead (same dev server, shows the QR code) — scan it with Expo Go, or open `exp://<your-computer's-LAN-IP>:8081` manually in the app.
3. On the Sign In screen, open **Connection** and set the API address to `http://<your-computer's-LAN-IP>:8000` (not `localhost` — a phone can't reach your laptop through `localhost`). Tap **Test connection** and confirm it says "Reachable" before signing in.
   - Find your LAN IP: `ipconfig` on Windows (look for the "Wireless LAN adapter Wi-Fi" IPv4 address) or `ifconfig`/`ip addr` on macOS/Linux.

## 4. Signing in

- **Supervisor**: the email/password you set as `INITIAL_SUPERVISOR_EMAIL` / `INITIAL_SUPERVISOR_PASSWORD` in `backend/.env`.
- **Inspector**: tap **Create account** on the sign-in screen to self-register (any email/password, 12+ characters).

---

## Project structure

```
backend/        FastAPI app, Celery worker/beat, PDF report generation, MinIO/DB access
rule-engine/    Standalone deterministic rule-evaluation package (one module per Legal Metrology provision)
mobile/         Expo/React Native app — inspector & supervisor UI, public landing + compliance lookup
coin-detector/  One-off YOLOv8 training pipeline that produced backend/app/ml_models/coin_detector.onnx
docker-compose.yml   Full local stack definition
```

## Troubleshooting

- **`docker compose up` hangs or fails** — make sure Docker Desktop is actually running (not just installed) before running the command.
- **API container keeps restarting** — check `docker compose logs api`; almost always a missing/invalid value in `backend/.env`.
- **Phone can't reach the API** — double-check the Connection address is your LAN IP (not `localhost`), and that both devices are on the same network. Some public/guest Wi-Fi networks block device-to-device traffic entirely.
- **PaddleOCR is slow on first run** — its models download on first use and are cached in a Docker volume afterward; the first scan after a fresh `docker compose up` will be noticeably slower than subsequent ones.


## Login Credentials

| Role       | E-mail                     | Password                         |
|------------|----------------------------|----------------------------------|
| Supervisor | supervisor@example.gov.in  | ChangeThisSupervisorPassword123! |
| Inspector  | khan@gmail.com             | 123456789012                     |

**Note:**

- **Supervisor**: Use the provided credentials to log in. **Creating a new supervisor account is not supported.**
- **Inspector**: Inspectors can either log in using the provided credentials or create a new account through the **Sign Up** option.
