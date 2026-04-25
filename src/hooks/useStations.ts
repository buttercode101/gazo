import { useEffect, useRef, useState } from 'react';
import { db, auth, storage } from '../lib/firebase';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, getDoc, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Station } from '../types';
import { calculateDistance } from '../lib/utils';
import { toast } from 'sonner';

export function useStations(
  userLocation: [number, number] | null,
  tankSize: number = 50,
  scope: 'nearby' | 'south_africa' = 'nearby'
) {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingWrites, setPendingWrites] = useState(false);
  const [communityStats, setCommunityStats] = useState({ drivers: 0, savedRand: 0 });
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

    const unsubscribe = onSnapshot(baseQuery, (snapshot) => {
      let data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Station[];
      
      // Client-side exact filtering for 100km radius in nearby mode only
      if (scope === 'nearby' && userLocation) {
        data = data.filter(st => {
           const dist = calculateDistance(userLocation[0], userLocation[1], st.lat, st.lng);
           return dist <= 100;
        });
      }
      
      setStations(data);
      setPendingWrites(snapshot.metadata.hasPendingWrites);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching stations:", error);
    });

    return () => unsubscribe();
  }, [queryLocation, userLocation, scope]);

  // Realtime 24h reports counter
  useEffect(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const q = query(
      collection(db, 'price_reports'), 
      where('timestamp', '>=', oneDayAgo)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Real data calculation based entirely on actual documented reports
      const reportCount = snapshot.docs.length;
      
      // Calculate average price of all reports to find variance
      let totalPrice = 0;
      let validPrices = 0;
      let highestPrice = 0;
      
      const reports = snapshot.docs.map(doc => doc.data());
      reports.forEach(r => {
        if (r.price > 0) {
          totalPrice += r.price;
          validPrices += 1;
          if (r.price > highestPrice) highestPrice = r.price;
        }
      });
      
      // Strict real savings calculation: comparing what users paid vs highest prevailing price in 24h window
      let strictlyCalculatedSavings = 0;
      if (highestPrice > 0 && validPrices > 1) {
        reports.forEach(r => {
          if (r.price > 0 && r.price < highestPrice) {
             strictlyCalculatedSavings += (highestPrice - r.price) * Math.max(1, tankSize);
          }
        });
      }

      setCommunityStats({
        drivers: reportCount,
        savedRand: strictlyCalculatedSavings
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
    photoFile?: File | null
  ) => {
    if (!auth.currentUser) throw new Error("You must be signed in.");
    
    // Prevent duplicate spam check (local state throttle)
    const lastReport = localStorage.getItem('last_report_time');
    if (lastReport && Date.now() - Number(lastReport) < 5 * 60 * 1000) {
      throw new Error("You can only report once every 5 minutes to prevent spam.");
    }

    let targetStationId = stationId;

    // Create station if not exists
    if (!targetStationId && newStationData) {
      const docRef = await addDoc(collection(db, 'stations'), {
        ...newStationData,
        reports_count: 0,
        diesel_price: null,
        petrol_price: null,
        last_updated: Date.now(),
      });
      targetStationId = docRef.id;
    }

    if (!targetStationId) throw new Error("Station information missing.");

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

    if (imageUrl) {
      updateData.latest_image_url = imageUrl;
    }

    for (const type of fuelTypes) {
      const p = prices[type];
      if (p) {
        if (type === 'diesel') updateData.diesel_price = p;
        if (type === 'petrol') updateData.petrol_price = p;

        await addDoc(collection(db, 'price_reports'), {
          station_id: targetStationId,
          fuel_type: type,
          price: p,
          timestamp: Date.now(),
          reporter_uid: auth.currentUser.uid,
          image_url: imageUrl || null
        });
      }
    }

    await updateDoc(stationRef, updateData);
    localStorage.setItem('last_report_time', Date.now().toString());
    return targetStationId;
  };

  return { stations, loading, pendingWrites, communityStats, reportPrice };
}
