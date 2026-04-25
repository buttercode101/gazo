# Verified Station Seeding (100+ stations)

This repository now includes a data-collection script intended for **official, documented, station-level prices**.

## Source
- Spain Ministry/MITECO REST feed (publisher-reported prices):
  - `https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/`
- Update cadence from source notice: approximately every 30 minutes.

## What the script enforces
- Pulls live station records.
- Keeps only **well-known brands** (`REPSOL`, `CEPSA`, `SHELL`, `BP`, `GALP`, `PLENOIL`, `BALLENOIL`, `PETRONOR`, `AVIA`, `Q8`, `MOEVE`).
- Requires:
  - valid diesel price,
  - valid petrol 95 price,
  - valid WGS84 coordinates,
  - valid station ID.
- Sorts by freshest update and outputs at least 100 entries.

## Run
```bash
node scripts/collect_verified_stations.mjs 150
```

Output file:
- `data/verifiedStations.seed.json`

Use this output as the seed payload for your Firestore station seeding workflow.
