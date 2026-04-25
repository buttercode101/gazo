# Verified Station Seeding (South Africa)

This project seeds South African stations with deterministic, auditable records designed to reflect realistic April 2026 regulated pricing context.

## Source hierarchy used

1. **Primary (numeric baseline):** South Africa DMRE fuel price publications (April 2026 cycle).
2. **Secondary (context):** AA/public reporting commentary for macro validation only.
3. **Tertiary (future location automation):** OpenStreetMap/Overpass ecosystem.

## What the current privileged seed model enforces

- National 9-province coverage.
- Deterministic anchor towns configured in `scripts/privilegedSeeder.mjs` (currently 2 anchors per province).
- 38–56 stations per province (410 total target).
- Deterministic jittered coordinates around town anchors.
- Diesel/Petrol price generation around province baselines calibrated to April 2026 official context.
- Deterministic recent `last_updated` timestamps (rolling 72h window).

## Integrity notes

- Seed data is synthetic but controlled and reproducible.
- Social/reddit/community data should be consumed as report signals, not baseline truth.
- For production-grade truth, integrate direct partner/official station feeds with provenance metadata.
