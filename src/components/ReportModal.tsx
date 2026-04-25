import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Station } from '../types';
import { useState, useEffect } from 'react';
import { MapPin, Camera, CheckCircle2 } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { toast } from 'sonner';
import Confetti from 'react-confetti';

interface ReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  station?: Station | null; 
  onReport: (stationData: Partial<Station> | null, fuelTypes: ('diesel' | 'petrol')[], prices: { diesel?: number; petrol?: number }, file?: File | null) => Promise<void>;
  userLocation: [number, number] | null;
  communityDrivers: number;
}

export function ReportModal({ open, onOpenChange, station, onReport, userLocation, communityDrivers }: ReportModalProps) {
  const [reportType, setReportType] = useState<'diesel' | 'petrol' | 'both'>('diesel');
  const [dieselPrice, setDieselPrice] = useState('');
  const [petrolPrice, setPetrolPrice] = useState('');
  const [newStationName, setNewStationName] = useState('');
  const [newStationAddress, setNewStationAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (open) {
      setDieselPrice('');
      setPetrolPrice('');
      setNewStationName('');
      setNewStationAddress('');
      setPhoto(null);
      setPhotoPreview(null);
      setShowConfetti(false);
      setReportType('diesel');
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const options = {
        maxSizeMB: 2,
        maxWidthOrHeight: 1280,
        useWebWorker: true,
      };
      const compressedFile = await imageCompression(file, options);
      setPhoto(compressedFile);
      setPhotoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(compressedFile);
      });
    } catch (error) {
      console.error(error);
      toast.error('Failed to process image');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const fuelTypes: ('diesel' | 'petrol')[] = [];
    const prices: { diesel?: number; petrol?: number } = {};

    if (reportType === 'diesel' || reportType === 'both') {
      if (!dieselPrice || isNaN(Number(dieselPrice))) return setLoading(false);
      fuelTypes.push('diesel');
      prices.diesel = Number(dieselPrice);
    }
    if (reportType === 'petrol' || reportType === 'both') {
      if (!petrolPrice || isNaN(Number(petrolPrice))) return setLoading(false);
      fuelTypes.push('petrol');
      prices.petrol = Number(petrolPrice);
    }
    
    let newStationData = null;
    if (!station) {
      newStationData = {
        name: newStationName.trim() || "Community Station",
        address: newStationAddress.trim() || "Detected nearby",
        lat: userLocation?.[0] || 0,
        lng: userLocation?.[1] || 0,
      };
    } else if (!station.id) {
      // Manual long-press addition uses existing placeholder station but uses new inputs
      newStationData = {
        name: newStationName.trim() || "New Station",
        address: newStationAddress.trim() || "Custom Location",
        lat: station.lat,
        lng: station.lng,
      };
    }

    try {
      await onReport(station?.id ? null : newStationData, fuelTypes, prices, photo);
      
      setShowConfetti(true);
      toast.success(`Thank you! You just helped ${communityDrivers.toLocaleString()} drivers`, { duration: 4000 });
      
      setTimeout(() => {
        onOpenChange(false);
      }, 3000);
    } catch (e: any) {
      toast.error(e.message || "Failed to submit report.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {showConfetti && <div className="fixed inset-0 z-[100] pointer-events-none fade-out-fast"><Confetti recycle={false} numberOfPieces={500} colors={['#FF6200', '#3B82F6', '#10B981', '#FFFFFF']} /></div>}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px] bg-[#121212] !rounded-3xl border border-white/5 text-foreground shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden">
          
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#FF6200] to-blue-600"></div>

          <DialogHeader className="pt-2">
            <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-2">
              Report Price
            </DialogTitle>
            <DialogDescription className="text-white/40 font-medium">
              {station ? (
                <span className="flex items-center mt-2 text-white/80 bg-white/5 px-3 py-1.5 rounded-full w-fit">
                  <MapPin className="w-4 h-4 mr-2 text-[#FF6200]" />
                  {station.name}
                </span>
              ) : (
                <span className="flex items-center mt-2 text-[#FF6200] bg-[#FF6200]/10 px-3 py-1.5 rounded-full w-fit animate-pulse">
                  <MapPin className="w-4 h-4 mr-2" />
                  Auto-detecting nearest station...
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {showConfetti ? (
            <div className="flex flex-col items-center justify-center py-12 animate-in zoom-in slide-in-from-bottom-4">
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <h3 className="text-xl font-bold">Report Confirmed!</h3>
              <p className="text-muted-foreground mt-2">The community thanks you.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6 pt-2">
              <Tabs value={reportType} onValueChange={(v) => setReportType(v as 'diesel' | 'petrol' | 'both')} className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-[#181818] p-1 rounded-xl border border-white/5 h-12">
                  <TabsTrigger value="diesel" className="rounded-lg font-bold data-[state=active]:bg-[#FF6200] data-[state=active]:text-white transition-all text-xs sm:text-sm">Diesel</TabsTrigger>
                  <TabsTrigger value="petrol" className="rounded-lg font-bold data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all text-xs sm:text-sm">Petrol</TabsTrigger>
                  <TabsTrigger value="both" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:text-[#0A0A0A] transition-all text-xs sm:text-sm">Both</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="space-y-4">
                {(!station || !station.id) && (
                  <div className="space-y-3 pb-2 border-b border-white/10 mb-4 animate-in slide-in-from-bottom-2 fade-in">
                    <Label className="text-sm font-bold text-white uppercase tracking-wider">New Station Details</Label>
                    <Input
                      required
                      placeholder="e.g. Sasol Sandton"
                      value={newStationName}
                      onChange={(e) => setNewStationName(e.target.value)}
                      className="bg-white/5 border-white/10"
                    />
                    <Input
                      required
                      placeholder="e.g. Cnr Rivonia Rd & West St"
                      value={newStationAddress}
                      onChange={(e) => setNewStationAddress(e.target.value)}
                      className="bg-white/5 border-white/10"
                    />
                  </div>
                )}

                {(reportType === 'diesel' || reportType === 'both') && (
                  <div className="space-y-2 animate-in slide-in-from-bottom-2 fade-in">
                    <Label className="text-sm font-bold text-[#FF6200] uppercase tracking-wider">Diesel Price (50ppm)</Label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <span className="text-white/40 font-black text-xl">R</span>
                      </div>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        required
                        className="pl-10 text-2xl font-black h-16 bg-white/5 border border-white/10 focus-visible:ring-[#FF6200] focus-visible:border-[#FF6200] rounded-2xl"
                        placeholder="22.50"
                        value={dieselPrice}
                        onChange={(e) => setDieselPrice(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {(reportType === 'petrol' || reportType === 'both') && (
                  <div className="space-y-2 animate-in slide-in-from-bottom-2 fade-in delay-75">
                    <Label className="text-sm font-bold text-blue-500 uppercase tracking-wider">Petrol Price (95)</Label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <span className="text-white/40 font-black text-xl">R</span>
                      </div>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        required
                        className="pl-10 text-2xl font-black h-16 bg-white/5 border border-white/10 focus-visible:ring-blue-500 focus-visible:border-blue-500 rounded-2xl"
                        placeholder="21.90"
                        value={petrolPrice}
                        onChange={(e) => setPetrolPrice(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Photo Upload area */}
              <div className="pt-2">
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment" 
                  id="photo-upload" 
                  className="hidden" 
                  onChange={handleFileChange}
                />
                <Label 
                  htmlFor="photo-upload" 
                  className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer hover:bg-white/5 transition-colors ${photoPreview ? 'bg-white/5 border-white/20' : ''}`}
                >
                  {photoPreview ? (
                    <div className="flex items-center gap-4 w-full px-4 overflow-hidden">
                       <img src={photoPreview} alt="Preview" className="h-16 w-16 object-cover rounded-xl" />
                       <div className="flex-1 text-left">
                         <p className="text-sm font-bold truncate">{photo?.name}</p>
                         <p className="text-xs text-white/40 font-medium">Click to change</p>
                       </div>
                       <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Camera className="w-6 h-6 text-white/40 mb-2" />
                      <p className="text-xs font-medium text-white/60">Optional: Add a photo of the price board</p>
                    </div>
                  )}
                </Label>
              </div>

              <Button 
                type="submit" 
                className="w-full h-16 text-lg font-black bg-white hover:bg-neutral-200 text-[#0A0A0A] rounded-2xl transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-95 shadow-[0_10px_30px_rgba(255,255,255,0.1)]"
                disabled={loading || (reportType === 'diesel' && !dieselPrice) || (reportType === 'petrol' && !petrolPrice) || (reportType === 'both' && (!dieselPrice || !petrolPrice))}
              >
                {loading ? "PROCESSING..." : "VERIFY & SUBMIT"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
