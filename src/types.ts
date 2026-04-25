export interface Station {
  id?: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  diesel_price: number | null;
  petrol_price: number | null;
  last_updated: number;
  reports_count: number;
  last_reporter_uid?: string;
  distance?: number; // Calculated on client
  latest_image_url?: string | null;
  rating?: number;
  reviews_count?: number;
}

export interface PriceReport {
  id?: string;
  station_id: string;
  fuel_type: 'diesel' | 'petrol';
  price: number;
  timestamp: number;
  reporter_uid: string;
}

export interface Review {
  id?: string;
  station_id: string;
  user_id: string;
  user_name: string;
  rating: number; // 1-5
  text: string;
  timestamp: number;
}

export interface LocalAlert {
  station_id: string;
  station_name: string;
  fuel_type: 'diesel' | 'petrol';
  target_price: number;
  active: boolean;
}
