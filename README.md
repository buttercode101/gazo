# TankUp

TankUp is a community-driven fuel-price app focused on South Africa. Drivers can discover nearby stations, compare diesel/petrol prices, submit verified updates, and track price trends.

## Tech stack

- React + TypeScript + Vite
- PWA via `vite-plugin-pwa` + Workbox runtime caching
- Firebase (Auth, Firestore, Storage)
- Leaflet (map + clustering)
- Tailwind-based UI components

## Local development

**Prerequisites**

- Node.js 20+
- Firebase project config in `firebase-applet-config.json`

**Setup**

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start development server:
   ```bash
   npm run dev
   ```
3. Open:
   `http://localhost:3000`

### Environment variables

App/runtime variables:
- `VITE_PRIVILEGED_SEEDER_URL` (optional, defaults to `/api/ops/seed-stations`)
- `VITE_SYSTEM_OPS_EMAILS` (comma-separated emails allowed to trigger seeding in-app)
- `DISABLE_HMR` (optional local/dev toggle for Vite server)

## Quality checks

```bash
npm run lint
npm run build
```

## PWA behavior

- Install prompt:
  - Android/desktop Chromium receives `beforeinstallprompt`.
  - iOS Safari gets an in-app helper prompt ("Share → Add to Home Screen").
- Update UX:
  - Service worker updates are discovered in the background.
  - The app shows an in-app "Refresh now" banner when a new version is ready.
- Offline behavior:
  - App shell and recent pages remain accessible.
  - OpenStreetMap tiles are cached for repeat map usage.
  - Firebase API requests use network-first with bounded fallback caching.
  - `/offline.html` is used as a navigation fallback when no cached page is available.

## Firebase notes

- Firestore rules are defined in `firestore.rules`.
- App bootstraps anonymous auth for fast reporting and supports optional Google sign-in.
- Station report photos are uploaded to Firebase Storage.

## Privileged station seeding

Station seeding runs through a privileged endpoint/job so only privileged credentials can write seed metadata under `_meta/seed_runs`.

- Front-end trigger expects `VITE_PRIVILEGED_SEEDER_URL` (defaults to `/api/ops/seed-stations`).
- Run one-off seeding job: `npm run seed:privileged -- south-africa-v3`
- Run endpoint mode: `npm run seed:privileged:serve`
- Validate deterministic seed dataset integrity locally: `npm run seed:validate`
  - Required privileged writer auth: `PRIVILEGED_SEEDER_CUSTOM_TOKEN` (Firebase custom token used by `signInWithCustomToken`).
  - Required operator allowlist: `PRIVILEGED_SEEDER_ALLOWED_EMAILS` (falls back to `VITE_SYSTEM_OPS_EMAILS` when omitted).
  - Optional emergency bearer gate: `PRIVILEGED_SEEDER_TOKEN` (if the request bearer token exactly matches this value, seeding is allowed for automation use-cases).


Security behavior for `/api/ops/seed-stations`:
- Requires `Authorization: Bearer <token>`.
- If bearer equals `PRIVILEGED_SEEDER_TOKEN`, request is accepted as trusted automation.
- Otherwise bearer must be a valid Firebase ID token and email must be allowlisted.
- If allowlist is empty, endpoint returns a configuration error and refuses to seed.

The privileged seeder persists lock/version/run artifacts at:
- `_meta/seed_runs` (global lock and latest run pointers)
- `_meta/seed_runs/versions/{version}` (version status + resume cursor)
- `_meta/seed_runs/runs/{runId}` (batch progress + completion artifacts)
