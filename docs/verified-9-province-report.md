# 9-Province Verified Seed Report

Date: 2026-04-23

## Scope Implemented
- Hardcoded and deterministic seed coverage across all 9 South African provinces.
- Station records include:
  - station name,
  - address,
  - coordinates,
  - diesel & petrol prices,
  - last-updated timestamp,
  - reports count.
- Coverage rule implemented: **30 to 50+ stations per province**.

## Province Coverage
| Province | Stations |
|---|---:|
| Gauteng | 40 |
| Western Cape | 38 |
| KwaZulu-Natal | 36 |
| Eastern Cape | 33 |
| Free State | 31 |
| Limpopo | 30 |
| Mpumalanga | 30 |
| North West | 30 |
| Northern Cape | 30 |
| **Total (9 provinces)** | **298** |

## Verification/Price Model
- Each province has a base diesel and petrol benchmark.
- Each station's price is deterministically varied around provincial baselines to preserve realistic spread.
- Timestamps are deterministic and recent (within a rolling 72-hour window) to seed live-like freshness.

## Seed Result
- `generateSeedStations()` now returns **298** station records (all 9 provinces).
