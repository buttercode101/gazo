import { Station } from "../types";

export type ConfidenceTier = "high" | "medium" | "low";

export interface StationTrust {
  score: number;
  tier: ConfidenceTier;
  label: string;
}

export interface FillRecommendation {
  action: "fill_now" | "verify_first" | "wait";
  title: string;
  detail: string;
}

export const getStationTrust = (station: Station) => {
  const now = Date.now();
  const ageMs = Math.max(0, now - station.last_updated);
  const ageHours = ageMs / (1000 * 60 * 60);

  const recencyScore = Math.max(0, 55 - ageHours * 3.4); // 0..55
  const photoScore = station.latest_image_url ? 20 : 0;
  const reportScore = Math.min(20, Math.max(0, station.reports_count || 0) * 2);
  const completenessScore = station.address?.trim() ? 5 : 0;

  const rawScore = recencyScore + photoScore + reportScore + completenessScore;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  if (score >= 75) return { score, tier: "high", label: "High confidence" } satisfies StationTrust;
  if (score >= 45) return { score, tier: "medium", label: "Medium confidence" } satisfies StationTrust;
  return { score, tier: "low", label: "Low confidence" } satisfies StationTrust;
};

export const getFillRecommendation = (
  station: Station | null | undefined,
  marketAveragePrice: number,
  activeFuelPrice: number | null,
  tankSize: number
): FillRecommendation => {
  if (!station || !activeFuelPrice || marketAveragePrice <= 0) {
    return {
      action: "verify_first",
      title: "Need more data",
      detail: "Not enough price signal yet. Check nearby verified stations first.",
    };
  }

  const trust = getStationTrust(station);
  const savings = (marketAveragePrice - activeFuelPrice) * Math.max(1, tankSize);

  if (trust.tier === "high" && savings > 40) {
    return {
      action: "fill_now",
      title: "Fill now",
      detail: `Estimated saving is ~R${savings.toFixed(0)} on your tank size.`,
    };
  }

  if (trust.tier === "low") {
    return {
      action: "verify_first",
      title: "Verify before fueling",
      detail: "This price has lower confidence. Check photo evidence or a second station.",
    };
  }

  return {
    action: "wait",
    title: "Monitor for next update",
    detail: "Current pricing is close to market average. Waiting may improve value.",
  };
};
