#!/usr/bin/env node
import http from 'node:http';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, runTransaction, writeBatch, serverTimestamp, setDoc, deleteField, Timestamp } from 'firebase/firestore';

const SEED_VERSION_DEFAULT = 'south-africa-v3';
const LOCK_TTL_MS = 15 * 60 * 1000;
const BATCH_SIZE = 350;

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

const parseCsv = (value) =>
  (value || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

const allowedSeederEmails = () => {
  const direct = parseCsv(process.env.PRIVILEGED_SEEDER_ALLOWED_EMAILS);
  if (direct.length > 0) return direct;
  return parseCsv(process.env.VITE_SYSTEM_OPS_EMAILS);
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function ensurePrivilegedAuth() {
  const customToken = process.env.PRIVILEGED_SEEDER_CUSTOM_TOKEN;
  if (!customToken) throw new Error('Missing PRIVILEGED_SEEDER_CUSTOM_TOKEN');
  await signInWithCustomToken(auth, customToken);
}

function generateSeedStations() {
  const now = Date.now();
  const stations = [];
  for (const [province, count, dieselBase, petrolBase, anchors] of PROVINCE_PROFILES) {
    for (let i = 0; i < count; i++) {
      const [town, lat0, lng0] = anchors[i % anchors.length];
      const seed = hashCode(`${province}-${town}-${i}`);
      stations.push({
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

async function runPrivilegedSeed({ requestedBy = null, version = SEED_VERSION_DEFAULT } = {}) {
  const rootRef = doc(db, '_meta', 'seed_runs');
  const versionRef = doc(db, '_meta', 'seed_runs', 'versions', version);
  const totalStations = generateSeedStations().length;
  const now = Date.now();

  const lockState = await runTransaction(db, async (tx) => {
    const [rootSnap, versionSnap] = await Promise.all([tx.get(rootRef), tx.get(versionRef)]);
    const root = rootSnap.data() || {};
    const versionDoc = versionSnap.data() || {};

    if (versionDoc.status === 'completed') return { status: 'already-seeded' };

    const activeLock = root.activeLock;
    if (activeLock?.expiresAt?.toMillis && activeLock.expiresAt.toMillis() > now && versionDoc.runId && activeLock.runId !== versionDoc.runId) {
      return { status: 'locked', runId: activeLock.runId };
    }

    const runId = versionDoc.status === 'running' && versionDoc.runId ? versionDoc.runId : `${version}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const runRef = doc(db, '_meta', 'seed_runs', 'runs', runId);

    tx.set(rootRef, {
      activeLock: {
        runId,
        version,
        owner: requestedBy,
        acquiredAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + LOCK_TTL_MS)
      },
      updatedAt: serverTimestamp()
    }, { merge: true });

    tx.set(versionRef, { version, status: 'running', runId, totalStations, updatedAt: serverTimestamp() }, { merge: true });
    tx.set(runRef, { runId, version, status: 'running', requestedBy, startedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });

    return { status: 'running', runId, cursor: versionDoc.cursor || 0 };
  });

  if (lockState.status !== 'running') return lockState;

  const stations = generateSeedStations().map((station) => ({ id: stationSeedKey(station), station }));
  let cursor = lockState.cursor || 0;
  let batchesCompleted = 0;

  while (cursor < stations.length) {
    const chunk = stations.slice(cursor, cursor + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const { id, station } of chunk) {
      batch.set(doc(db, 'stations', id), station, { merge: true });
    }
    await batch.commit();
    cursor += chunk.length;
    batchesCompleted += 1;

    const runRef = doc(db, '_meta', 'seed_runs', 'runs', lockState.runId);
    await setDoc(rootRef, {
      activeLock: {
        runId: lockState.runId,
        version,
        owner: requestedBy,
        acquiredAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + LOCK_TTL_MS)
      },
      updatedAt: serverTimestamp()
    }, { merge: true });
    await setDoc(versionRef, { cursor, status: 'running', updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(runRef, { cursor, batchesCompleted, status: 'running', updatedAt: serverTimestamp() }, { merge: true });
  }

  const runRef = doc(db, '_meta', 'seed_runs', 'runs', lockState.runId);
  await setDoc(rootRef, { activeLock: deleteField(), lastCompletedRunId: lockState.runId, updatedAt: serverTimestamp() }, { merge: true });
  await setDoc(versionRef, {
    status: 'completed', cursor, completedAt: serverTimestamp(), runId: lockState.runId, deterministicIds: true, stationCount: stations.length, updatedAt: serverTimestamp()
  }, { merge: true });
  await setDoc(runRef, {
    status: 'completed', cursor, stationCount: stations.length, completedAt: serverTimestamp(), updatedAt: serverTimestamp()
  }, { merge: true });

  return { status: 'seeded', runId: lockState.runId, stationCount: stations.length };
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function isSafeVersion(version) {
  return typeof version === 'string' && version.length > 0 && version.length <= 80 && /^[a-zA-Z0-9._-]+$/.test(version);
}

async function verifyFirebaseIdToken(idToken) {
  const apiKey = firebaseConfig?.apiKey;
  if (!apiKey) return null;

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });

  if (!response.ok) return null;
  const payload = await response.json();
  if (!Array.isArray(payload.users) || payload.users.length === 0) return null;

  const user = payload.users[0];
  return {
    uid: user.localId || null,
    email: (user.email || '').toLowerCase(),
    emailVerified: Boolean(user.emailVerified)
  };
}

async function authenticateOperator(req) {
  const idToken = getBearerToken(req);
  if (!idToken) return { ok: false, code: 401, payload: { status: 'unauthorized', reason: 'missing-bearer-token' } };

  const sharedToken = process.env.PRIVILEGED_SEEDER_TOKEN;
  if (sharedToken && idToken === sharedToken) {
    return { ok: true, actor: { source: 'shared-token' } };
  }

  const allowlist = allowedSeederEmails();
  if (allowlist.length === 0) {
    return { ok: false, code: 500, payload: { status: 'failed', reason: 'seeder-allowlist-misconfigured' } };
  }

  const tokenInfo = await verifyFirebaseIdToken(idToken);
  if (!tokenInfo) {
    return { ok: false, code: 401, payload: { status: 'unauthorized', reason: 'invalid-id-token' } };
  }

  if (!tokenInfo.email || !allowlist.includes(tokenInfo.email) || !tokenInfo.emailVerified) {
    return { ok: false, code: 403, payload: { status: 'forbidden', reason: 'not-allowlisted-or-unverified-email' } };
  }

  return {
    ok: true,
    actor: {
      source: 'firebase-id-token',
      uid: tokenInfo.uid,
      email: tokenInfo.email
    }
  };
}

async function startServer() {
  const port = Number(process.env.PORT || 8787);
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/ops/seed-stations') return res.writeHead(404).end('Not Found');

    const authResult = await authenticateOperator(req);
    if (!authResult.ok) {
      return res
        .writeHead(authResult.code, { 'content-type': 'application/json' })
        .end(JSON.stringify(authResult.payload));
    }

    const raw = await new Promise((resolve) => { let d=''; req.on('data', (c) => d += c); req.on('end', () => resolve(d)); });
    let payload = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }

    const version = payload.version || SEED_VERSION_DEFAULT;
    if (!isSafeVersion(version)) {
      return res
        .writeHead(400, { 'content-type': 'application/json' })
        .end(JSON.stringify({ status: 'failed', reason: 'invalid-version' }));
    }

    try {
      const result = await runPrivilegedSeed({ version, requestedBy: authResult.actor });
      res.writeHead(result.status === 'locked' ? 409 : 200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) }));
    }
  });
  server.listen(port, () => console.log(`Privileged seeder listening on :${port}`));
}

async function main() {
  await ensurePrivilegedAuth();
  const cmd = process.argv[2] || 'run';
  if (cmd === 'serve') return startServer();
  const result = await runPrivilegedSeed({ version: process.argv[3] || SEED_VERSION_DEFAULT, requestedBy: { source: 'cli' } });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
