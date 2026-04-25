#!/usr/bin/env node

/**
 * Collects 100+ station-level fuel prices from Spain's official ministry feed
 * (publisher-reported prices, updated every ~30 minutes), then writes a seed file
 * compatible with this app's Station model.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCE_URL =
  'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';

const WELL_KNOWN_BRANDS = new Set([
  'REPSOL',
  'CEPSA',
  'SHELL',
  'BP',
  'GALP',
  'PLENOIL',
  'BALLENOIL',
  'PETRONOR',
  'AVIA',
  'Q8',
  'MOEVE'
]);

const parseEuroNumber = (value) => {
  if (!value || typeof value !== 'string') return null;
  const cleaned = value.replace(',', '.').trim();
  if (!cleaned) return null;
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
};

const parseCoord = (value) => {
  if (!value || typeof value !== 'string') return null;
  const num = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(num) ? num : null;
};

const parseDateMs = (value) => {
  if (!value || typeof value !== 'string') return Date.now();
  // Format is usually dd/mm/yyyy hh:mm:ss in local time
  const [datePart, timePart = '00:00:00'] = value.split(' ');
  const [dd, mm, yyyy] = (datePart || '').split('/').map(Number);
  const [hh, min, ss] = (timePart || '').split(':').map(Number);
  if (!dd || !mm || !yyyy) return Date.now();
  const ms = Date.UTC(yyyy, mm - 1, dd, hh || 0, min || 0, ss || 0);
  return Number.isFinite(ms) ? ms : Date.now();
};

const isWellKnownBrand = (label) => {
  if (!label) return false;
  const upper = String(label).toUpperCase();
  for (const brand of WELL_KNOWN_BRANDS) {
    if (upper.includes(brand)) return true;
  }
  return false;
};

const main = async () => {
  const limit = Number.parseInt(process.argv[2] || '150', 10);
  const response = await fetch(SOURCE_URL, {
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Source request failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const rows = payload?.ListaEESSPrecio;
  if (!Array.isArray(rows)) {
    throw new Error('Unexpected API payload: ListaEESSPrecio missing');
  }

  const filtered = rows
    .filter((row) => isWellKnownBrand(row['Rótulo']))
    .map((row) => {
      const diesel = parseEuroNumber(row['Precio Gasoleo A']);
      const petrol = parseEuroNumber(row['Precio Gasolina 95 E5'] || row['Precio Gasolina 95 E10']);
      const lat = parseCoord(row['Latitud']);
      const lng = parseCoord(row['Longitud (WGS84)']);

      if (diesel == null || petrol == null || lat == null || lng == null) {
        return null;
      }

      const name = `${row['Rótulo']} ${row['Dirección']}`.replace(/\s+/g, ' ').trim();
      const address = `${row['Dirección']}, ${row['Municipio']}, ${row['Provincia']}, Spain`;

      return {
        source_station_id: row['IDEESS'],
        name,
        address,
        lat,
        lng,
        diesel_price: diesel,
        petrol_price: petrol,
        last_updated: parseDateMs(row['Fecha']),
        reports_count: 1,
        source: 'MITECO Precios Carburantes REST',
        verified: true
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.last_updated - a.last_updated)
    .slice(0, Math.max(limit, 100));

  if (filtered.length < 100) {
    throw new Error(`Only ${filtered.length} verified well-known stations found (need at least 100).`);
  }

  const out = {
    generated_at: new Date().toISOString(),
    source_url: SOURCE_URL,
    count: filtered.length,
    stations: filtered
  };

  const outPath = path.resolve('data/verifiedStations.seed.json');
  await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');

  console.log(`Wrote ${filtered.length} verified stations to ${outPath}`);
};

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
