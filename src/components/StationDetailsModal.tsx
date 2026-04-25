import React, { useState, useEffect } from 'react';
import { Station, PriceReport, Review } from '../types';
import { X, Star, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { collection, query, where, orderBy, limit, getDocs, addDoc, FirestoreError } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { format } from 'date-fns';
import { Button } from './ui/button';
import { triggerHaptic } from '../lib/seedData';
import { toast } from 'sonner';
import { getStationTrust, getTrustBreakdown } from '../lib/trust';
import { getPricePrediction } from '../lib/prediction';

interface StationDetailsModalProps {
  station: Station | null;
  open: boolean;
  onClose: () => void;
  activeFuelType: 'diesel' | 'petrol';
}

export function StationDetailsModal({ station, open, onClose, activeFuelType }: StationDetailsModalProps) {
  const [history, setHistory] = useState<PriceReport[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyIndexError, setHistoryIndexError] = useState(false);
  const [reviewsIndexError, setReviewsIndexError] = useState(false);
  const [targetPrice, setTargetPrice] = useState<string>('');
  const [hasAlert, setHasAlert] = useState(false);
  
  const [newReviewText, setNewReviewText] = useState('');
  const [newRating, setNewRating] = useState(5);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Simulated alert state (reads from local storage)
  useEffect(() => {
    if (station && open) {
      const savedAlerts = JSON.parse(localStorage.getItem('tankup_alerts') || '{}');
      setHasAlert(!!savedAlerts[station.id!]);
      fetchData();
    }
  }, [station, open, activeFuelType]);

  const fetchData = async () => {
    if (!station?.id) return;
    setLoading(true);
    setHistoryIndexError(false);
    setReviewsIndexError(false);
    try {
      // Fetch Reports
      const qReports = query(
        collection(db, 'price_reports'),
        where('station_id', '==', station.id),
        where('fuel_type', '==', activeFuelType),
        orderBy('timestamp', 'asc'),
        limit(30)
      );
      const repSnap = await getDocs(qReports);
      const reps = repSnap.docs.map(d => ({ id: d.id, ...d.data() } as PriceReport));
      
      // Only render real historical data. If history is sparse, the UI will show an explicit empty-state message.
      setHistory(reps);

      // Fetch Reviews
      const qReviews = query(
        collection(db, 'reviews'),
        where('station_id', '==', station.id),
        orderBy('timestamp', 'desc'),
        limit(10)
      );
      const revSnap = await getDocs(qReviews);
      setReviews(revSnap.docs.map(d => ({ id: d.id, ...d.data() } as Review)));
    } catch (e) {
      const error = e as FirestoreError;
      const isMissingIndex = error.code === 'failed-precondition' && /index/i.test(error.message);
      if (isMissingIndex) {
        // Friendly fallback when composite index isn't ready yet.
        setHistoryIndexError(true);
        setReviewsIndexError(true);
      }
      console.error(e);
    }
    setLoading(false);
  };

  const handleSetAlert = () => {
    if (!station?.id) return;
    triggerHaptic();
    const savedAlerts = JSON.parse(localStorage.getItem('tankup_alerts') || '{}');
    if (hasAlert) {
      delete savedAlerts[station.id];
      toast.info("Price alert removed");
      setHasAlert(false);
    } else {
      if (!targetPrice || isNaN(Number(targetPrice))) {
         toast.error("Enter a valid target price");
         return;
      }
      savedAlerts[station.id] = { fuel: activeFuelType, target: Number(targetPrice) };
      toast.success(`Alert set for R${targetPrice}`);
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
      setHasAlert(true);
      setTargetPrice('');
    }
    localStorage.setItem('tankup_alerts', JSON.stringify(savedAlerts));
  };

  const handleSubmitReview = async () => {
    if (!station?.id || !auth.currentUser) {
      toast.error("You must be logged in to leave a review.");
      return;
    }
    if (!newReviewText.trim()) {
      toast.error("Please enter a review.");
      return;
    }

    setIsSubmittingReview(true);
    try {
      const newRef = await addDoc(collection(db, 'reviews'), {
        station_id: station.id,
        user_id: auth.currentUser.uid,
        user_name: auth.currentUser.displayName || 'Anonymous',
        rating: newRating,
        text: newReviewText.trim(),
        timestamp: Date.now()
      });
      toast.success("Review posted!");
      setNewReviewText('');
      setReviews([{ 
        id: newRef.id, 
        station_id: station.id,
        user_id: auth.currentUser.uid,
        user_name: auth.currentUser.displayName || 'Anonymous',
        rating: newRating,
        text: newReviewText.trim(),
        timestamp: Date.now()
      }, ...reviews]);
    } catch (e: any) {
      toast.error("Error posting review");
      console.error(e);
    }
    setIsSubmittingReview(false);
  };

  if (!open || !station) return null;

  const currentPrice = activeFuelType === 'diesel' ? station.diesel_price : station.petrol_price;
  const trust = getStationTrust(station);
  const trustBreakdown = getTrustBreakdown(station);
  const pricePrediction = getPricePrediction(history);
  const qualityAmenities = station.amenities || {};
  const amenityList = [
    { key: 'shop', label: 'Shop', active: Boolean(qualityAmenities.shop) },
    { key: 'card_pay', label: 'Card Pay', active: Boolean(qualityAmenities.card_pay) },
    { key: 'safety_lights', label: 'Safety Lights', active: Boolean(qualityAmenities.safety_lights) },
  ];

  // Formatting chart data
  const chartData = history.map(h => ({
    time: format(new Date(h.timestamp), 'dd MMM'),
    price: h.price
  }));

  const minPrice = chartData.length > 0 ? Math.min(...chartData.map(d => d.price)) : 0;
  const maxPrice = chartData.length > 0 ? Math.max(...chartData.map(d => d.price)) : 0;

  return (
    <div className="fixed inset-0 z-[150] flex flex-col justify-end pointer-events-none">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto transition-opacity" onClick={onClose} />
      
      <div className="bg-[#121212] w-full max-h-[90vh] rounded-t-3xl border-t border-white/10 flex flex-col pointer-events-auto relative shadow-2xl overflow-hidden animate-in slide-in-from-bottom" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/5 flex items-start justify-between bg-white/5">
          <div>
            <h2 className="text-xl font-bold">{station.name}</h2>
            <p className="text-xs text-white/50">{station.address}</p>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 hide-scrollbar">
          
          <div className="flex justify-between items-end mb-6">
            <div>
              <p className="text-[10px] text-white/50 uppercase tracking-widest font-bold mb-1">Current {activeFuelType}</p>
              <p className={`text-4xl font-black ${activeFuelType === 'diesel' ? 'text-[#FF6200]' : 'text-blue-500'}`}>R{currentPrice?.toFixed(2) || '--'}</p>
              <p className={`text-[10px] uppercase tracking-widest font-bold mt-1 ${trust.tier === 'high' ? 'text-emerald-400' : trust.tier === 'medium' ? 'text-amber-400' : 'text-red-400'}`}>
                {trust.label} · {trust.score}
              </p>
              <div className="group mt-2 rounded-xl border border-white/10 bg-white/5 p-2 relative">
                <p className="text-[10px] uppercase tracking-widest text-white/45 font-bold">Trust breakdown ⓘ</p>
                <div className="mt-1.5 space-y-1">
                  {trustBreakdown.map((item) => (
                    <p key={item.key} className="text-[11px] text-white/70">{item.label}: {item.value}</p>
                  ))}
                </div>
                <div className="pointer-events-none absolute left-2 top-full z-20 mt-2 hidden w-56 rounded-lg border border-white/10 bg-[#0C111C] p-2 text-[10px] text-white/70 shadow-xl group-hover:block">
                  Weighted trust model: recency + photo verification + report depth + community consistency.
                </div>
              </div>
              <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-2">
                <p className="text-[10px] uppercase tracking-widest text-white/45 font-bold">Forecourt quality index</p>
                <p className="text-sm font-black mt-1 text-cyan-300">{station.quality_index ?? 0}/100</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {amenityList.map((item) => (
                    <span key={item.key} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/45'}`}>{item.label}</span>
                  ))}
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70">
                    Queue {typeof station.queue_time_minutes === 'number' ? `${station.queue_time_minutes}m` : 'n/a'}
                  </span>
                </div>
              </div>
              <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-2">
                <p className="text-[10px] uppercase tracking-widest text-white/45 font-bold">24-72h price outlook</p>
                {pricePrediction ? (
                  <>
                    <p className="text-[11px] text-white/80 mt-1">{pricePrediction.summary}</p>
                    <p className={`text-[10px] mt-1 font-bold uppercase tracking-wider ${pricePrediction.direction === 'rise' ? 'text-red-300' : pricePrediction.direction === 'drop' ? 'text-emerald-300' : 'text-amber-300'}`}>
                      Market outlook: {pricePrediction.direction === 'rise' ? 'Rising' : pricePrediction.direction === 'drop' ? 'Cooling' : 'Stable'}
                    </p>
                    <p className="text-[10px] text-white/60 mt-1">
                      24h: {pricePrediction.change24h >= 0 ? '+' : ''}{pricePrediction.change24h.toFixed(2)} ·
                      72h: {pricePrediction.change72h >= 0 ? '+' : ''}{pricePrediction.change72h.toFixed(2)} ·
                      confidence {pricePrediction.confidence}%
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] text-white/60 mt-1">Not enough history yet to project direction.</p>
                )}
              </div>
            </div>
            {/* Alert Toggle */}
            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 items-center">
               <input 
                 type="number"
                 placeholder="Target Price"
                 value={targetPrice}
                 onChange={e => setTargetPrice(e.target.value)}
                 className="w-24 bg-transparent outline-none text-xs text-center font-bold"
                 disabled={hasAlert}
               />
               <button 
                 onClick={handleSetAlert}
                 className={`p-2 rounded-lg transition-colors ${hasAlert ? 'bg-emerald-500/20 text-emerald-500' : 'bg-[#FF6200] text-white hover:bg-[#E65800]'}`}
               >
                 <AlertCircle className="w-4 h-4" />
               </button>
            </div>
          </div>

          <p className="text-xs uppercase tracking-widest text-white/40 font-bold mb-2">7-Day Trend</p>
          <div className="h-40 w-full mb-8 bg-white/5 rounded-2xl p-4 border border-white/5 relative">
            {!station.id ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white/40 text-center px-4">
                Price history available after first community report.
              </div>
            ) : historyIndexError ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white/40 text-center px-4">
                Trend data is temporarily unavailable while indexes finish syncing. Please try again soon.
              </div>
            ) : loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white/40">Loading history...</div>
            ) : chartData.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white/40 text-center px-4">
                No price history yet for this fuel type.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[minPrice - (minPrice * 0.02), maxPrice + (maxPrice * 0.02)]} hide />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}
                    itemStyle={{ color: '#FF6200' }}
                    labelStyle={{ color: 'rgba(255,255,255,0.5)' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="price" 
                    stroke={activeFuelType === 'diesel' ? '#FF6200' : '#3B82F6'} 
                    strokeWidth={4}
                    dot={{ r: 4, fill: '#121212', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: activeFuelType === 'diesel' ? '#FF6200' : '#3B82F6' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <p className="text-xs uppercase tracking-widest text-white/40 font-bold mb-4">Reviews & Notes</p>
          <div className="flex flex-col gap-3 mb-8">
            {reviewsIndexError ? (
               <div className="text-center py-6 bg-white/5 rounded-2xl border border-white/5">
                 <p className="text-sm font-bold text-white/50">Reviews are temporarily unavailable</p>
                 <p className="text-[10px] text-white/30 uppercase mt-1">Index setup in progress. Please try again shortly.</p>
               </div>
            ) : reviews.length === 0 ? (
               <div className="text-center py-6 bg-white/5 rounded-2xl border border-white/5">
                 <p className="text-sm font-bold text-white/50">No reviews yet</p>
                 <p className="text-[10px] text-white/30 uppercase mt-1">Be the first to review</p>
               </div>
            ) : (
              reviews.map((r) => (
                 <div key={r.id} className="bg-white/5 p-4 rounded-2xl border border-white/10">
                   <div className="flex justify-between items-start mb-2">
                     <span className="text-xs font-bold">{r.user_name}</span>
                     <div className="flex gap-0.5">
                       {[...Array(5)].map((_, i) => (
                         <Star key={i} className={`w-3 h-3 ${i < r.rating ? 'text-yellow-500 fill-yellow-500' : 'text-white/20'}`} />
                       ))}
                     </div>
                   </div>
                   <p className="text-sm text-white/70 italic">"{r.text}"</p>
                   <p className="text-[10px] text-white/30 mt-2 text-right">{format(new Date(r.timestamp), 'dd MMM yyyy')}</p>
                 </div>
               ))
            )}

            {/* Leave a Review Form */}
            <div className="mt-4 p-4 bg-[#181818] rounded-2xl border border-white/10">
               <p className="text-xs font-bold mb-3">Leave a Review</p>
               <div className="flex gap-2 mb-3">
                 {[1, 2, 3, 4, 5].map((star) => (
                   <button key={star} onClick={() => { triggerHaptic(); setNewRating(star) }} className="hover:scale-110 transition-transform">
                     <Star className={`w-6 h-6 ${star <= newRating ? 'text-yellow-500 fill-yellow-500' : 'text-white/20 fill-white/5'}`} />
                   </button>
                 ))}
               </div>
               <textarea 
                 value={newReviewText}
                 onChange={e => setNewReviewText(e.target.value)}
                 placeholder="Share your experience (queue time, shop availability, card machines working?)..."
                 className="w-full h-24 bg-white/5 rounded-xl border border-white/10 p-3 text-sm text-white focus:outline-none focus:border-[#FF6200] resize-none mb-3"
               />
               <Button onClick={() => { triggerHaptic(); handleSubmitReview(); }} disabled={isSubmittingReview || !newReviewText.trim()} className="w-full bg-[#FF6200] hover:bg-[#E65800] text-white font-bold rounded-xl h-10">
                 {isSubmittingReview ? 'Posting...' : 'Post Review'}
               </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
