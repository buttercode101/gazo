# TankUp Station Seed Update & Verification Report

**Prepared:** 2026-04-23 (UTC)  
**Repository:** `TankUp`  
**Scope requested:** broader station/town coverage + legitimacy hardening + corrections

---

## Executive Summary

Implemented a substantial seed-data expansion and recalibration for South Africa (historical context for the April 2026 seeding initiative):

- Expanded the seed model from **298 planned province records** to **410 max generated seed stations**.
- Anchor-town breadth is determined by the active privileged seeder configuration in `scripts/privilegedSeeder.mjs`.
- Rebased fuel seed prices using latest **DMRE April 2026** national-regulated price context:
  - Inland Petrol 95: **R23.36/l**
  - Coast Petrol 95: **R22.49/l**
  - Inland Diesel (0.05%): **R25.9083/l**
  - Coast Diesel (0.05%): **R25.0363/l**
- Applied updated baselines province-by-province (coastal provinces lower petrol baseline than inland trend).

---

## Research Findings (Cross-source)

### 1) Government / Regulated Source (Primary)
- DMRE Fuel Prices page and April 2026 media statement indicate sharp April 2026 increases and provide official zone/regulatory schedules.
- DMRE April 2026 history tables expose inland/coast reference values for petrol and diesel, used as calibration anchors.

### 2) News / Public commentary (Secondary)
- Public and mobility commentary (e.g., AA South Africa) confirms structural pressure from levies and policy adjustments over time.
- Used for context only; not used as a primary numeric source for station-level baselining.

### 3) Open geo-data / communities (Tertiary infrastructure signal)
- OpenStreetMap/Overpass ecosystem reviewed as a credible route for future station-location automation and reconciliation.
- Current implementation keeps deterministic synthetic generation (auditable/repeatable), while incorporating realistic province/town distribution and official pricing context.

### 4) Social media / Reddit / community groups
- These channels are useful for incident reporting and real-time anomalies.
- They are **not** authoritative for baseline seeding because data quality and provenance are inconsistent.
- Recommendation: ingest as confidence-scored reports (already aligned with TankUp's reporting model), not as default seed truth.

---

## What was changed in code

### Expanded station/town footprint
- Province station counts increased to a range of **38–56 stations** each.
- Anchor-town footprint is controlled by the privileged seeder source-of-truth script.

### Updated price baselines
- Diesel and petrol baselines moved from older low-20 values to realistic **April 2026 ranges**, with provincial variation around inland/coastal patterns.

### Seed capacity
- `MAX_SEED_STATIONS` increased from **216** to **410**, enabling materially larger initial map coverage.

---

## Province Distribution after update

| Province | Target station count |
|---|---:|
| Gauteng | 56 |
| Western Cape | 52 |
| KwaZulu-Natal | 50 |
| Eastern Cape | 46 |
| Free State | 44 |
| Limpopo | 42 |
| Mpumalanga | 42 |
| North West | 40 |
| Northern Cape | 38 |
| **Total** | **410** |

---

## Data Legitimacy posture

This update improves legitimacy through:

1. **Regulated benchmarking:** baselines anchored to current official DMRE context.
2. **Deterministic generation:** reproducible results for audit and QA.
3. **Broader spatial realism:** more towns and regional spread to reduce concentration bias.

Known limitation (transparent): this is still seeded model data, not direct per-forecourt transactional ingestion.

---

## Next-step recommendations (professional hardening)

1. Build a verified-ingestion pipeline from official/partner station feeds where available.
2. Add per-station provenance fields (`source`, `verified_at`, `confidence`).
3. Merge user reports with trust-weighting and outlier rejection.
4. Run nightly location reconciliation against OSM/brand registries.
5. Maintain monthly automatic baseline updates keyed to DMRE releases.

---

## Source references used for this report

- DMRE Fuel Prices hub: https://www.dmre.gov.za/energy-resources/energy-sources/pretoleum/fuel-prices
- DMRE April 2026 media and zone documents: https://www.dmre.gov.za/
- DMRE Fuel Price History (April 2026 publication set)
- OpenStreetMap Overpass documentation: https://wiki.openstreetmap.org/wiki/Overpass_API
- AA South Africa fuel/levy commentary: https://aa.co.za/
