#!/usr/bin/env node
import process from 'node:process';

const PROVINCE_PROFILES = [
  ['Gauteng', 56, 25.91, 23.36, [['Johannesburg', -26.2041, 28.0473], ['Pretoria', -25.7479, 28.2293]]],
  ['Western Cape', 52, 25.04, 22.49, [['Cape Town', -33.9249, 18.4241], ['Stellenbosch', -33.9321, 18.8602]]],
  ['KwaZulu-Natal', 50, 25.18, 22.70, [['Durban', -29.8587, 31.0218], ['Pietermaritzburg', -29.6006, 30.3794]]],
  ['Eastern Cape', 46, 25.32, 22.84, [['Gqeberha', -33.9608, 25.6022], ['East London', -33.0153, 27.9116]]],
  ['Free State', 44, 25.72, 23.20, [['Bloemfontein', -29.1141, 26.2230], ['Welkom', -27.9774, 26.7351]]],
  ['Limpopo', 42, 25.89, 23.35, [['Polokwane', -23.9045, 29.4688], ['Tzaneen', -23.8332, 30.1635]]],
  ['Mpumalanga', 42, 25.96, 23.42, [['Mbombela', -25.4753, 30.9853], ['Middelburg', -25.7699, 29.4648]]],
  ['North West', 40, 25.80, 23.27, [['Mahikeng', -25.8572, 25.6422], ['Rustenburg', -25.6676, 27.2421]]],
  ['Northern Cape', 38, 25.66, 23.12, [['Kimberley', -28.7282, 24.7623], ['Upington', -28.4540, 21.2420]]]
];
const BRANDS = ['Engen', 'Sasol', 'Shell', 'BP', 'Astron Energy', 'TotalEnergies', 'Caltex'];
const SITE_TYPES = ['City Hub', 'Express', 'Forecourt', 'Plaza', 'One Stop', 'Fuel Centre'];

const hashCode = (text) => { let h = 0; for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0; return Math.abs(h); };
const jitter = (seed, spread) => ((seed % 1000) / 1000 - 0.5) * spread;
const normalize = (v) => v.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const stationSeedKey = (station) => `seed-${normalize(station.name).slice(0, 40) || 'station'}-${normalize(station.address).slice(0, 60) || hashCode(`${station.name}|${station.address}`).toString(36)}`;

function generateSeedStations(now = Date.now()) {
  const stations = [];
  for (const [province, count, dieselBase, petrolBase, anchors] of PROVINCE_PROFILES) {
    for (let i = 0; i < count; i++) {
      const [town, lat0, lng0] = anchors[i % anchors.length];
      const seed = hashCode(`${province}-${town}-${i}`);
      stations.push({
        province,
        town,
        name: `${BRANDS[i % BRANDS.length]} ${SITE_TYPES[i % SITE_TYPES.length]} ${town} ${i + 1}`,
        address: `${town} Regional Route ${100 + i}, ${province}, South Africa`,
        lat: lat0 + jitter(seed, 0.22),
        lng: lng0 + jitter(Math.floor(seed / 7), 0.22),
        diesel_price: Number((dieselBase + ((seed % 33) - 16) * 0.01).toFixed(2)),
        petrol_price: Number((petrolBase + ((seed % 39) - 19) * 0.01).toFixed(2)),
        last_updated: now - ((seed % 72) * 60 * 60 * 1000),
        reports_count: 20 + (seed % 170)
      });
    }
  }
  return stations.slice(0, 410);
}

const stations = generateSeedStations();
const ids = stations.map((station) => stationSeedKey(station));
const duplicateIds = ids.length - new Set(ids).size;
const duplicateNameAddress = stations.length - new Set(stations.map((station) => `${station.name}|${station.address}`)).size;
const provinceCounts = stations.reduce((acc, station) => {
  acc[station.province] = (acc[station.province] || 0) + 1;
  return acc;
}, {});
const expectedTotal = PROVINCE_PROFILES.reduce((sum, [, count]) => sum + count, 0);

const errors = [];
if (stations.length !== expectedTotal) errors.push(`Expected ${expectedTotal} stations, got ${stations.length}.`);
if (duplicateIds > 0) errors.push(`Found ${duplicateIds} duplicate station IDs.`);
if (duplicateNameAddress > 0) errors.push(`Found ${duplicateNameAddress} duplicate name+address pairs.`);
if (stations.some((station) => station.diesel_price < 20 || station.diesel_price > 29)) errors.push('Diesel prices out of [20,29] bounds.');
if (stations.some((station) => station.petrol_price < 20 || station.petrol_price > 29)) errors.push('Petrol prices out of [20,29] bounds.');
if (stations.some((station) => station.lat < -35.5 || station.lat > -21.5)) errors.push('Latitude out of South Africa bounding range.');
if (stations.some((station) => station.lng < 16 || station.lng > 33.5)) errors.push('Longitude out of South Africa bounding range.');

for (const [province, expectedCount] of PROVINCE_PROFILES.map(([province, count]) => [province, count])) {
  if ((provinceCounts[province] || 0) !== expectedCount) {
    errors.push(`Province ${province} expected ${expectedCount}, got ${provinceCounts[province] || 0}.`);
  }
}

if (errors.length > 0) {
  console.error('Seed data validation FAILED');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log('Seed data validation PASSED');
console.log(JSON.stringify({
  total: stations.length,
  provinceCounts,
  dieselRange: [Math.min(...stations.map((station) => station.diesel_price)), Math.max(...stations.map((station) => station.diesel_price))],
  petrolRange: [Math.min(...stations.map((station) => station.petrol_price)), Math.max(...stations.map((station) => station.petrol_price))],
  duplicateIds,
  duplicateNameAddress
}, null, 2));
