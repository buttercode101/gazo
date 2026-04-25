import { useEffect, useRef, useState } from 'react';
import { db, auth, storage } from '../lib/firebase';
import { collection, onSnapshot, query, addDoc, doc, getDoc, getDocs, where, writeBatch, serverTimestamp, runTransaction, orderBy, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Station } from '../types';
import { calculateDistance } from '../lib/utils';
import { buildCanonicalStationKey, dedupeStations } from '../lib/stationIdentity';
import { toast } from 'sonner';

const STATION_MATCH_RADIUS_METERS = 120;
const STATION_STRICT_MATCH_RADIUS_METERS = 80;
const TRUSTED_REPORTER_MIN_REPORTS = 2;

type ScoredReport = {
  price?: number;
  image_url?: string | null;
  reporter_uid?: string;
  reporter_reliability?: number;
  timestamp?: number;
  outlier_rejected?: boolean;
  community_confirmed?: boolean;
  reporter_reputation?: number;
  queue_time_minutes?: number | null;
  amenities?: {
    shop?: boolean;
    card_pay?: boolean;
    safety_lights?: boolean;
  };
  fuel_type?: 'diesel' | 'petrol';
};

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const detectOutliers = (values: number[]) => {
  if (values.length < 4) return new Set<number>();
  const med = median(values);
  const absDeviations = values.map((v) => Math.abs(v - med));
  const mad = median(absDeviations) || 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance) || 0;

  const outliers = new Set<number>();
  values.forEach((value, idx) => {
    const modifiedZ = mad > 0 ? (0.6745 * (value - med)) / mad : 0;
    const z = stdDev > 0 ? (value - mean) / stdDev : 0;
    if (Math.abs(modifiedZ) > 3.5 || Math.abs(z) > 2.8) {
      outliers.add(idx);
    }
  });
  return outliers;
};

const weightedMean = (items: Array<{ price: number; weight: number }>) => {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return null;
  return items.reduce((sum, item) => sum + item.price * item.weight, 0) / totalWeight;
};

const computeVerificationConfidence = (reports: ScoredReport[]) => {
  if (reports.length === 0) {
    return {
      confidence: 0,
      breakdown: {
        report_consistency: 0,
        image_proof: 0,
        trusted_reporters: 0,
        recency_score: 0,
        report_volume: 0,
        community_confirmation: 0
      }
    };
  }

  const now = Date.now();
  const activeReports = reports.filter((report) => !report.outlier_rejected);
  const base = activeReports.length > 0 ? activeReports : reports;

  const prices = base
    .map((report) => report.price)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  const mean = prices.length > 0 ? prices.reduce((sum, value) => sum + value, 0) / prices.length : 0;
  const variance = prices.length > 0
    ? prices.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / prices.length
    : 0;
  const stdDev = Math.sqrt(variance);
  const normalizedSpread = mean > 0 ? stdDev / mean : 1;
  const reportConsistency = Math.max(0, Math.min(100, Math.round((1 - normalizedSpread * 10) * 100)));

  const reportsWithImages = base.filter((report) => Boolean(report.image_url)).length;
  const imageProof = Math.max(0, Math.min(100, Math.round((reportsWithImages / base.length) * 100)));

  const reporterCounts = base.reduce((acc, report) => {
    if (!report.reporter_uid) return acc;
    acc.set(report.reporter_uid, (acc.get(report.reporter_uid) || 0) + 1);
    return acc;
  }, new Map<string, number>());
  const trustedReporterCount = Array.from(reporterCounts.values()).filter((count) => count >= TRUSTED_REPORTER_MIN_REPORTS).length;
  const trustedReporters = reporterCounts.size > 0
    ? Math.max(0, Math.min(100, Math.round((trustedReporterCount / reporterCounts.size) * 100)))
    : 0;

  const recencyScore = Math.round(
    base.reduce((sum, report) => {
      const ageHours = typeof report.timestamp === 'number' ? Math.max(0, now - report.timestamp) / (1000 * 60 * 60) : 72;
      return sum + Math.max(0, 100 - ageHours * 2);
    }, 0) / base.length
  );

  const reportVolume = Math.max(0, Math.min(100, Math.round(Math.min(1, base.length / 12) * 100)));

  const communityConfirmation = Math.max(0, Math.min(100, Math.round(
    base.reduce((sum, report) => {
      const reliability = typeof report.reporter_reliability === 'number' ? report.reporter_reliability : 60;
      const reputation = typeof report.reporter_reputation === 'number' ? report.reporter_reputation : 35;
      const confirmBoost = report.community_confirmed ? 15 : 0;
      return sum + Math.min(100, reliability * 0.7 + reputation * 0.3 + confirmBoost);
    }, 0) / base.length
  )));

  const confidence = Math.round(
    reportConsistency * 0.3
    + imageProof * 0.15
    + trustedReporters * 0.2
    + recencyScore * 0.15
    + reportVolume * 0.08
    + communityConfirmation * 0.12
  );
  return {
    confidence: Math.max(0, Math.min(100, confidence)),
    breakdown: {
      report_consistency: reportConsistency,
      image_proof: imageProof,
      trusted_reporters: trustedReporters,
      recency_score: recencyScore,
      report_volume: reportVolume,
      community_confirmation: communityConfirmation
    }
  };
};

const computeReporterReliability = async (uid: string) => {
  const historyQuery = query(
    collection(db, 'price_reports'),
    where('reporter_uid', '==', uid),
    orderBy('timestamp', 'desc'),
    limit(80)
  );
  const abuseQuery = query(
    collection(db, 'report_abuse_flags'),
    where('reporter_uid', '==', uid),
    limit(20)
  );

  const [historySnap, abuseSnap] = await Promise.all([getDocs(historyQuery), getDocs(abuseQuery)]);
  const history = historySnap.docs.map((entry) => entry.data() as ScoredReport);
  if (history.length === 0) return 60;

  const now = Date.now();
  const recencyScore = Math.round(
    history.reduce((sum, report) => {
      const ageHours = typeof report.timestamp === 'number' ? Math.max(0, now - report.timestamp) / (1000 * 60 * 60) : 120;
      const decay = Math.exp(-ageHours / (24 * 14));
      return sum + decay * 100;
    }, 0) / history.length
  );

  const confirmations = history.filter((report) => report.community_confirmed || !report.outlier_rejected).length;
  const crossConfirmation = Math.round((confirmations / history.length) * 100);

  const prices = history
    .map((report) => report.price)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const mean = prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : 0;
  const variance = prices.length
    ? prices.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / prices.length
    : 0;
  const varianceScore = Math.max(0, Math.min(100, Math.round((1 - Math.min(variance / 4, 1)) * 100)));

  const abuseCount = abuseSnap.docs.length;
  const abusePenalty = Math.min(90, abuseCount * 22);
  const abuseScore = Math.max(0, 100 - abusePenalty);

  return Math.max(
    0,
    Math.min(100, Math.round(recencyScore * 0.3 + crossConfirmation * 0.3 + varianceScore * 0.2 + abuseScore * 0.2))
  );
};

const computeReporterReputation = async (uid: string) => {
  const historyQuery = query(
    collection(db, 'price_reports'),
    where('reporter_uid', '==', uid),
    limit(200)
  );
  const historySnap = await getDocs(historyQuery);
  const totalReports = historySnap.docs.length;
  return Math.max(10, Math.min(100, Math.round(25 + Math.log10(Math.max(1, totalReports)) * 35)));
};

const normalizeStationText = (value: string | undefined) =>
  (value || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const bigramSimilarity = (a: string, b: string) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const aBigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const key = a.slice(i, i + 2);
    aBigrams.set(key, (aBigrams.get(key) || 0) + 1);
  }

  let overlap = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const key = b.slice(i, i + 2);
    const count = aBigrams.get(key) || 0;
    if (count > 0) {
      overlap += 1;
      aBigrams.set(key, count - 1);
    }
  }

  return (2 * overlap) / ((a.length - 1) + (b.length - 1));
};

const isPlaceholderText = (value: string | undefined) => {
  const normalized = normalizeStationText(value);
  return !normalized || normalized === 'community station' || normalized === 'new station' || normalized === 'detected nearby' || normalized === 'custom location';
};

const findExistingStationMatch = async (newStationData: Partial<Station>) => {
  if (!Number.isFinite(newStationData.lat) || !Number.isFinite(newStationData.lng)) {
    return null;
  }

  const lat = Number(newStationData.lat);
  const lng = Number(newStationData.lng);
  const latDelta = STATION_MATCH_RADIUS_METERS / 111_000;

  const candidateQuery = query(
    collection(db, 'stations'),
    where('lat', '>=', lat - latDelta),
    where('lat', '<=', lat + latDelta)
  );

  const snapshot = await getDocs(candidateQuery);
  if (snapshot.empty) return null;

  const normalizedName = normalizeStationText(newStationData.name);
  const normalizedAddress = normalizeStationText(newStationData.address);

  let bestMatch: { id: string; score: number } | null = null;
  snapshot.docs.forEach((candidateDoc) => {
    const candidate = candidateDoc.data() as Station;
    if (candidate.merged_into) return;
    if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) return;

    const distanceMeters = calculateDistance(lat, lng, candidate.lat, candidate.lng) * 1000;
    if (distanceMeters > STATION_MATCH_RADIUS_METERS) return;

    const candidateName = normalizeStationText(candidate.name);
    const candidateAddress = normalizeStationText(candidate.address);

    const hasMeaningfulName = !isPlaceholderText(newStationData.name);
    const hasMeaningfulAddress = !isPlaceholderText(newStationData.address);

    const nameScore = hasMeaningfulName ? bigramSimilarity(normalizedName, candidateName) : 0;
    const addressScore = hasMeaningfulAddress ? bigramSimilarity(normalizedAddress, candidateAddress) : 0;
    const geoScore = Math.max(0, 1 - distanceMeters / STATION_MATCH_RADIUS_METERS);
    const weightedScore = geoScore * 0.45 + nameScore * 0.35 + addressScore * 0.2;

    const highConfidence =
      (distanceMeters <= STATION_STRICT_MATCH_RADIUS_METERS && (nameScore >= 0.82 || addressScore >= 0.8))
      || weightedScore >= 0.84
      || (distanceMeters <= 35 && (nameScore >= 0.6 || addressScore >= 0.6));

    if (!highConfidence) return;
    if (!bestMatch || weightedScore > bestMatch.score) {
      bestMatch = { id: candidateDoc.id, score: weightedScore };
    }
  });

  return bestMatch?.id || null;
};

const resolveActiveStationId = async (stationId: string) => {
  let currentId = stationId;
  const visited = new Set<string>();

  while (!visited.has(currentId)) {
    visited.add(currentId);
    const currentDoc = await getDoc(doc(db, 'stations', currentId));
    if (!currentDoc.exists()) return stationId;

    const mergedInto = currentDoc.data()?.merged_into;
    if (typeof mergedInto !== 'string' || !mergedInto) return currentId;
    currentId = mergedInto;
  }

  return stationId;
};


export function useStations(
  userLocation: [number, number] | null,
  tankSize: number = 50,
  scope: 'nearby' | 'south_africa' = 'nearby'
) {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingWrites, setPendingWrites] = useState(false);
  const [communityStats, setCommunityStats] = useState({ reports24h: 0, savedRand: 0 });
  const [queryLocation, setQueryLocation] = useState<[number, number] | null>(null);
  const lastLocationRef = useRef<[number, number] | null>(null);
  const lastAlertRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!userLocation) return;
    if (lastLocationRef.current) {
      const moved = calculateDistance(
        lastLocationRef.current[0],
        lastLocationRef.current[1],
        userLocation[0],
        userLocation[1]
      );
      if (moved < 0.5) return; // < 500m: skip query resubscribe
    }
    lastLocationRef.current = userLocation;
    setQueryLocation(userLocation);
  }, [userLocation]);

  // Realtime listener for stations within 100km approx box
  useEffect(() => {
    if (scope === 'nearby' && !queryLocation) {
      setStations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let didReceiveSnapshot = false;

    // Query scope can be local (nearby) or whole South Africa.
    let baseQuery = query(collection(db, 'stations'));
    
    if (scope === 'south_africa') {
      baseQuery = query(
        collection(db, 'stations'),
        where('lat', '>=', -35.5),
        where('lat', '<=', -21.5)
      );
    } else if (queryLocation) {
      const [lat] = queryLocation;
      // 1 deg latitude is ~111km. So roughly +/- 0.9 deg
      const latRange = 0.9;
      // Firestore only allows range filter on ONE field.
      baseQuery = query(
        collection(db, 'stations'),
        where('lat', '>=', lat - latRange),
        where('lat', '<=', lat + latRange)
      );
    }

    const fallbackTimeout = window.setTimeout(() => {
      if (didReceiveSnapshot) return;
      setLoading(false);
      console.warn('stations_snapshot_fallback_engaged', {
        scope,
        query_location: queryLocation,
        user_location: userLocation,
        triggered_at: new Date().toISOString()
      });
    }, 1400);

    const unsubscribe = onSnapshot(baseQuery, (snapshot) => {
      didReceiveSnapshot = true;
      window.clearTimeout(fallbackTimeout);
      let data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Station[];
      data = data.filter(station => !station.merged_into);
      
      // Client-side exact filtering for 100km radius in nearby mode only
      if (scope === 'nearby' && userLocation) {
        data = data.filter(st => {
           const dist = calculateDistance(userLocation[0], userLocation[1], st.lat, st.lng);
           return dist <= 100;
        });
      }
      
      setStations(dedupeStations(data));
      setPendingWrites(snapshot.metadata.hasPendingWrites);
      setLoading(false);
    }, (error) => {
      didReceiveSnapshot = true;
      window.clearTimeout(fallbackTimeout);
      console.error('stations_snapshot_failed', {
        scope,
        query_location: queryLocation,
        user_location: userLocation,
        code: (error as { code?: string })?.code || null,
        name: error?.name || 'unknown',
        message: error?.message || String(error),
        occurred_at: new Date().toISOString()
      });
      setPendingWrites(false);
      setLoading(false);
      toast.error("Unable to load stations right now. Showing limited data.");
    });

    return () => {
      window.clearTimeout(fallbackTimeout);
      unsubscribe();
    };
  }, [queryLocation, userLocation, scope]);

  // Realtime 24h reports counter
  useEffect(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const q = query(
      collection(db, 'price_reports'), 
      where('timestamp', '>=', oneDayAgo)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reportCount = snapshot.docs.length;
      const reports = snapshot.docs
        .map((doc) => doc.data())
        .filter((report) => typeof report.price === 'number' && report.price > 0);

      const sortedPrices = reports.map((report) => report.price as number).sort((a, b) => a - b);
      const midpoint = Math.floor(sortedPrices.length / 2);
      const medianPrice = sortedPrices.length === 0
        ? 0
        : sortedPrices.length % 2 === 0
          ? (sortedPrices[midpoint - 1] + sortedPrices[midpoint]) / 2
          : sortedPrices[midpoint];

      // Conservative estimate: savings relative to 24h median only (prevents inflated outlier comparisons)
      const cappedTankSize = Math.max(1, Math.min(80, tankSize));
      const estimatedSavings = reports.reduce((sum, report) => {
        if (medianPrice <= 0) return sum;
        const delta = medianPrice - (report.price as number);
        if (delta <= 0) return sum;
        return sum + delta * cappedTankSize;
      }, 0);

      setCommunityStats({
        reports24h: reportCount,
        savedRand: Math.round(estimatedSavings)
      });
    });
    return () => unsubscribe();
  }, [tankSize]);

  // Check local price alerts against latest station prices
  useEffect(() => {
    if (stations.length === 0) return;
    let savedAlerts: Record<string, { fuel: 'diesel' | 'petrol'; target: number }> = {};
    try {
      savedAlerts = JSON.parse(localStorage.getItem('tankup_alerts') || '{}');
    } catch {
      return;
    }

    stations.forEach((station) => {
      if (!station.id) return;
      const alert = savedAlerts[station.id];
      if (!alert) return;
      const price = alert.fuel === 'diesel' ? station.diesel_price : station.petrol_price;
      if (!price || price > alert.target) return;

      const last = lastAlertRef.current[station.id] || 0;
      if (Date.now() - last < 60 * 60 * 1000) return; // 1h cooldown per station

      lastAlertRef.current[station.id] = Date.now();
      toast.success(`🔔 ${station.name} hit your ${alert.fuel} target: R${price.toFixed(2)}`);
    });
  }, [stations]);

  const reportPrice = async (
    stationId: string | undefined, 
    newStationData: Partial<Station> | null,
    fuelTypes: ('diesel' | 'petrol')[], 
    prices: { diesel?: number; petrol?: number },
    photoFile?: File | null,
    extras?: {
      queue_time_minutes?: number | null;
      amenities?: { shop?: boolean; card_pay?: boolean; safety_lights?: boolean };
    }
  ) => {
    if (!auth.currentUser) throw new Error("You must be signed in.");
    const [reporterReliability, reporterReputation] = await Promise.all([
      computeReporterReliability(auth.currentUser.uid),
      computeReporterReputation(auth.currentUser.uid)
    ]);
    
    let targetStationId = stationId ? await resolveActiveStationId(stationId) : stationId;

    // Create station if not exists
    if (!targetStationId && newStationData) {
      if (
        !Number.isFinite(newStationData.lat) ||
        !Number.isFinite(newStationData.lng)
      ) {
        throw new Error("New station requires valid coordinates.");
      }
      const matchedStationId = await findExistingStationMatch(newStationData);
      if (matchedStationId) {
        targetStationId = matchedStationId;
      } else {
        const docRef = await addDoc(collection(db, 'stations'), {
          ...newStationData,
          reports_count: 0,
          diesel_price: null,
          petrol_price: null,
          last_updated: Date.now(),
          canonical_key: buildCanonicalStationKey({
            name: newStationData.name || '',
            address: newStationData.address || '',
            lat: Number(newStationData.lat),
            lng: Number(newStationData.lng),
          }),
          merged_into: null,
        });
        targetStationId = docRef.id;
      }
    }

    if (!targetStationId) throw new Error("Station information missing.");

    const rateLimitRef = doc(db, 'report_rate_limits', auth.currentUser.uid);
    await runTransaction(db, async (tx) => {
      const limitDoc = await tx.get(rateLimitRef);
      const now = Date.now();
      const cooldownMs = 5 * 60 * 1000;

      if (limitDoc.exists()) {
        const lastAt = limitDoc.data()?.last_report_at;
        const lastMs = typeof lastAt?.toMillis === 'function' ? lastAt.toMillis() : 0;
        if (lastMs > 0 && now - lastMs < cooldownMs) {
          throw new Error('You can only report once every 5 minutes.');
        }
      }

      tx.set(
        rateLimitRef,
        {
          last_report_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        },
        { merge: true }
      );
    });

    // Photo Upload
    let imageUrl = null;
    if (photoFile) {
      try {
        const fileRef = ref(storage, `reports/${targetStationId}/${Date.now()}.jpg`);
        await uploadBytes(fileRef, photoFile);
        imageUrl = await getDownloadURL(fileRef);
      } catch (err) {
        console.error("Photo upload failed, continuing without photo.", err);
      }
    }

    // Submit reports based on selected types
    const stationRef = doc(db, 'stations', targetStationId);
    const stationDoc = await getDoc(stationRef);
    
    // Prevent Math Troll Submissions
    const MIN_PRICE = 20;
    const MAX_PRICE = 29;
    for (const type of fuelTypes) {
      const p = prices[type];
      if (typeof p === 'number') {
        if (p < MIN_PRICE || p > MAX_PRICE) {
          throw new Error(`Price R${p} is outside expected range (R${MIN_PRICE}–R${MAX_PRICE}).`);
        }
        if (!Number.isFinite(p) || Math.round(p * 100) !== p * 100) {
          throw new Error('Please report price with at most 2 decimal places.');
        }
      }
    }

    let updateData: any = {
      last_updated: Date.now(),
      last_reporter_uid: auth.currentUser.uid,
      reports_count: (stationDoc.data()?.reports_count || 0) + fuelTypes.length
    };
    if (typeof extras?.queue_time_minutes === 'number' && Number.isFinite(extras.queue_time_minutes)) {
      updateData.queue_time_minutes = Math.max(0, Math.min(90, Math.round(extras.queue_time_minutes)));
    }
    if (extras?.amenities) {
      updateData.amenities = {
        shop: Boolean(extras.amenities.shop),
        card_pay: Boolean(extras.amenities.card_pay),
        safety_lights: Boolean(extras.amenities.safety_lights)
      };
    }

    if (imageUrl) {
      updateData.latest_image_url = imageUrl;
    }

    const batch = writeBatch(db);

    for (const type of fuelTypes) {
      const p = prices[type];
      if (p) {
        if (type === 'diesel') updateData.diesel_price = p;
        if (type === 'petrol') updateData.petrol_price = p;

        const reportRef = doc(collection(db, 'price_reports'));
        batch.set(reportRef, {
          station_id: targetStationId,
          fuel_type: type,
          price: p,
          timestamp: Date.now(),
          reporter_uid: auth.currentUser.uid,
          reporter_reliability: reporterReliability,
          reporter_reputation: reporterReputation,
          community_confirmed: reporterReliability >= 70,
          outlier_rejected: false,
          image_url: imageUrl || null,
          queue_time_minutes: typeof extras?.queue_time_minutes === 'number' ? extras.queue_time_minutes : null,
          amenities: extras?.amenities || null
        });
      }
    }

    const stationReportsQuery = query(
      collection(db, 'price_reports'),
      where('station_id', '==', targetStationId),
      orderBy('timestamp', 'desc'),
      limit(10)
    );
    const stationReportsSnapshot = await getDocs(stationReportsQuery);
    const stationReports = stationReportsSnapshot.docs.map((entry) => entry.data() as ScoredReport);

    (['diesel', 'petrol'] as const).forEach((fuelType) => {
      const fuelReports = stationReports
        .filter((report) => report.fuel_type === fuelType && typeof report.price === 'number')
        .slice(0, 10);
      const pricesForFuel = fuelReports.map((report) => report.price as number);
      const outlierIndexes = detectOutliers(pricesForFuel);
      const accepted = fuelReports
        .map((report, index) => ({ report, isOutlier: outlierIndexes.has(index) }))
        .filter(({ isOutlier }) => !isOutlier)
        .map(({ report }) => {
          const ageHours = typeof report.timestamp === 'number' ? Math.max(0, Date.now() - report.timestamp) / (1000 * 60 * 60) : 24;
          const recencyWeight = Math.exp(-ageHours / 48);
          const reporterWeight = Math.max(0.25, (report.reporter_reliability ?? 60) / 100);
          const reputationWeight = Math.max(0.2, (report.reporter_reputation ?? 35) / 100);
          return {
            price: report.price as number,
            weight: recencyWeight * reporterWeight * reputationWeight,
          };
        });
      const weighted = weightedMean(accepted);
      if (typeof weighted === 'number') {
        updateData[`${fuelType}_price`] = Number(weighted.toFixed(2));
      }
    });

    const verification = computeVerificationConfidence(stationReports);
    updateData.verification_confidence = verification.confidence;
    updateData.verification_breakdown = verification.breakdown;
    const amenityCount = ['shop', 'card_pay', 'safety_lights'].reduce((sum, key) => {
      return sum + (updateData.amenities?.[key] ? 1 : 0);
    }, 0);
    const queueScore = typeof updateData.queue_time_minutes === 'number'
      ? Math.max(0, 100 - Math.min(60, updateData.queue_time_minutes) * 1.6)
      : 55;
    updateData.quality_index = Math.round((amenityCount / 3) * 60 + queueScore * 0.4);

    batch.update(stationRef, updateData);

    await batch.commit();
    return targetStationId;
  };

  return { stations, loading, pendingWrites, communityStats, reportPrice };
}
