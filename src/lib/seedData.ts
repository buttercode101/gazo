import { db } from './firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';
import { Station } from '../types';

export const triggerHaptic = () => {
  if (typeof window !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(50);
  }
};

export const triggerShare = async (title: string, text: string, url: string) => {
  triggerHaptic();
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return true;
    } catch (e) {
      console.log('Share dismissed or failed', e);
    }
  } else {
    navigator.clipboard.writeText(`${title} - ${text} ${url}`);
    return true;
  }
  return false;
};

type ProvinceStationProfile = {
  province: string;
  count: number;
  dieselBase: number;
  petrolBase: number;
  anchors: Array<{ town: string; lat: number; lng: number }>;
};

const PROVINCE_PROFILES: ProvinceStationProfile[] = [
  {
    province: 'Gauteng',
    count: 40,
    dieselBase: 22.05,
    petrolBase: 23.12,
    anchors: [
      { town: 'Johannesburg', lat: -26.2041, lng: 28.0473 },
      { town: 'Pretoria', lat: -25.7479, lng: 28.2293 },
      { town: 'Centurion', lat: -25.8602, lng: 28.1896 },
      { town: 'Randburg', lat: -26.0937, lng: 27.9826 }
    ]
  },
  {
    province: 'Western Cape',
    count: 38,
    dieselBase: 21.41,
    petrolBase: 22.43,
    anchors: [
      { town: 'Cape Town', lat: -33.9249, lng: 18.4241 },
      { town: 'Bellville', lat: -33.9010, lng: 18.6282 },
      { town: 'Stellenbosch', lat: -33.9321, lng: 18.8602 },
      { town: 'Paarl', lat: -33.7342, lng: 18.9626 }
    ]
  },
  {
    province: 'KwaZulu-Natal',
    count: 36,
    dieselBase: 21.55,
    petrolBase: 22.62,
    anchors: [
      { town: 'Durban', lat: -29.8587, lng: 31.0218 },
      { town: 'Pinetown', lat: -29.8167, lng: 30.8500 },
      { town: 'Pietermaritzburg', lat: -29.6006, lng: 30.3794 },
      { town: 'Ballito', lat: -29.5389, lng: 31.2146 }
    ]
  },
  {
    province: 'Eastern Cape',
    count: 33,
    dieselBase: 21.62,
    petrolBase: 22.71,
    anchors: [
      { town: 'Gqeberha', lat: -33.9608, lng: 25.6022 },
      { town: 'East London', lat: -33.0153, lng: 27.9116 },
      { town: 'Mthatha', lat: -31.5889, lng: 28.7844 },
      { town: 'Komani', lat: -31.8976, lng: 26.8753 }
    ]
  },
  {
    province: 'Free State',
    count: 31,
    dieselBase: 22.02,
    petrolBase: 23.04,
    anchors: [
      { town: 'Bloemfontein', lat: -29.1141, lng: 26.2230 },
      { town: 'Welkom', lat: -27.9774, lng: 26.7351 },
      { town: 'Sasolburg', lat: -26.8136, lng: 27.8169 },
      { town: 'Bethlehem', lat: -28.2308, lng: 28.3071 }
    ]
  },
  {
    province: 'Limpopo',
    count: 30,
    dieselBase: 22.17,
    petrolBase: 23.23,
    anchors: [
      { town: 'Polokwane', lat: -23.9045, lng: 29.4688 },
      { town: 'Tzaneen', lat: -23.8332, lng: 30.1635 },
      { town: 'Mokopane', lat: -24.1944, lng: 29.0097 },
      { town: 'Thohoyandou', lat: -22.9456, lng: 30.4849 }
    ]
  },
  {
    province: 'Mpumalanga',
    count: 30,
    dieselBase: 22.24,
    petrolBase: 23.31,
    anchors: [
      { town: 'Mbombela', lat: -25.4753, lng: 30.9853 },
      { town: 'Witbank', lat: -25.8713, lng: 29.2332 },
      { town: 'Middelburg', lat: -25.7699, lng: 29.4648 },
      { town: 'Secunda', lat: -26.5500, lng: 29.1700 }
    ]
  },
  {
    province: 'North West',
    count: 30,
    dieselBase: 22.09,
    petrolBase: 23.16,
    anchors: [
      { town: 'Mahikeng', lat: -25.8572, lng: 25.6422 },
      { town: 'Rustenburg', lat: -25.6676, lng: 27.2421 },
      { town: 'Klerksdorp', lat: -26.8521, lng: 26.6667 },
      { town: 'Potchefstroom', lat: -26.7145, lng: 27.0970 }
    ]
  },
  {
    province: 'Northern Cape',
    count: 30,
    dieselBase: 21.96,
    petrolBase: 23.01,
    anchors: [
      { town: 'Kimberley', lat: -28.7282, lng: 24.7623 },
      { town: 'Upington', lat: -28.4540, lng: 21.2420 },
      { town: 'Kuruman', lat: -27.4524, lng: 23.4325 },
      { town: 'Springbok', lat: -29.6644, lng: 17.8865 }
    ]
  }
];

const BRANDS = ['Engen', 'Sasol', 'Shell', 'BP', 'Astron Energy', 'TotalEnergies', 'Caltex'];
const SITE_TYPES = ['City Hub', 'Express', 'Forecourt', 'Plaza', 'One Stop', 'Fuel Centre'];

const jitter = (seed: number, spread: number) => ((seed % 1000) / 1000 - 0.5) * spread;

const hashCode = (text: string) => {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
};

/**
 * Deterministic 9-province seed with verified-style metadata and prices.
 * Count per province: 30-50 stations.
 */
export const generateSeedStations = (): Station[] => {
  const stations: Station[] = [];
  const now = Date.now();
  const MAX_SEED_STATIONS = 216;
  let sequence = 0;

  for (const profile of PROVINCE_PROFILES) {
    for (let i = 0; i < profile.count; i++) {
      const anchor = profile.anchors[i % profile.anchors.length];
      const brand = BRANDS[i % BRANDS.length];
      const siteType = SITE_TYPES[i % SITE_TYPES.length];
      const seed = hashCode(`${profile.province}-${anchor.town}-${i}`);

      const lat = anchor.lat + jitter(seed, 0.22);
      const lng = anchor.lng + jitter(Math.floor(seed / 7), 0.22);

      const diesel = Number((profile.dieselBase + ((seed % 33) - 16) * 0.01).toFixed(2));
      const petrol = Number((profile.petrolBase + ((seed % 39) - 19) * 0.01).toFixed(2));

      stations.push({
        name: `${brand} ${siteType} ${anchor.town} ${i + 1}`,
        address: `${anchor.town} Regional Route ${100 + i}, ${profile.province}, South Africa`,
        lat,
        lng,
        diesel_price: diesel,
        petrol_price: petrol,
        last_updated: now - ((seed % 72) * 60 * 60 * 1000),
        reports_count: 20 + (seed % 170)
      });

      sequence++;
      if (sequence >= MAX_SEED_STATIONS) {
        return stations;
      }
    }
  }

  return stations;
};

export const getProvinceStationSummary = () => {
  return PROVINCE_PROFILES.map((profile) => ({
    province: profile.province,
    station_count: profile.count,
    diesel_base: profile.dieselBase,
    petrol_base: profile.petrolBase
  }));
};

export const seedDatabase = async () => {
  try {
    const stations = generateSeedStations();

    const BATCH_SIZE = 400;
    for (let i = 0; i < stations.length; i += BATCH_SIZE) {
      const chunk = stations.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((st) => {
        const docRef = doc(collection(db, 'stations'));
        batch.set(docRef, st);
      });
      await batch.commit();
    }
    localStorage.setItem('tankup_seeded', 'true');
    return true;
  } catch (err) {
    console.error('Seeding failed', err);
    return false;
  }
};
