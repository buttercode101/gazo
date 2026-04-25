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
