import { Station } from "../types";

export type ConfidenceTier = "high" | "medium" | "low";

export interface StationTrust {
  score: number;
  tier: ConfidenceTier;
  label: string;
}

export interface TrustSignal {
  label: string;
  value: number;
}

export interface TrustBreakdownItem {
  key: "recency" | "photos" | "report_count" | "community_confirmation";
  label: string;
  weight: number;
  value: number;
}

export interface FillRecommendation {
  action: "fill_now" | "verify_first" | "wait";
  title: string;
  detail: string;
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export const getTrustBreakdown = (station: Station): TrustBreakdownItem[] => {
  const now = Date.now();
  const ageMs = Math.max(0, now - station.last_updated);
  const ageHours = ageMs / (1000 * 60 * 60);

  const recency = clampPercent(100 - ageHours * 4.2);
  const reportCount = clampPercent(
    station.verification_breakdown?.report_volume
    ?? Math.min(1, (station.reports_count || 0) / 12) * 100
  );
  const communityConfirmation = clampPercent(
    station.verification_breakdown?.community_confirmation
    ?? station.verification_breakdown?.report_consistency
    ?? station.verification_confidence
    ?? 55
  );
  const photoVerification = clampPercent(station.verification_breakdown?.image_proof ?? (station.latest_image_url ? 100 : 20));
  const recencyScore = clampPercent(station.verification_breakdown?.recency_score ?? recency);

  return [
    { key: "recency", label: "Recency", weight: 0.3, value: recencyScore },
    { key: "photos", label: "Photo verification", weight: 0.2, value: photoVerification },
    { key: "report_count", label: "Report count", weight: 0.2, value: reportCount },
    { key: "community_confirmation", label: "Community confirmation", weight: 0.3, value: communityConfirmation },
  ];
};

export const getStationTrust = (station: Station) => {
  const pipelineScore = typeof station.verification_confidence === "number"
    ? Math.max(0, Math.min(100, Math.round(station.verification_confidence)))
    : null;

  if (pipelineScore !== null) {
    if (pipelineScore >= 75) return { score: pipelineScore, tier: "high", label: "High confidence" } satisfies StationTrust;
    if (pipelineScore >= 45) return { score: pipelineScore, tier: "medium", label: "Medium confidence" } satisfies StationTrust;
    return { score: pipelineScore, tier: "low", label: "Low confidence" } satisfies StationTrust;
  }

  const breakdown = getTrustBreakdown(station);
  const score = clampPercent(breakdown.reduce((sum, item) => sum + item.value * item.weight, 0));

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

export const getTrustSignals = (station: Station): TrustSignal[] => {
  if (station.verification_breakdown) {
    return [
      { label: "Consistency", value: station.verification_breakdown.report_consistency || 0 },
      { label: "Photo proof", value: station.verification_breakdown.image_proof || 0 },
      { label: "Reporter quality", value: station.verification_breakdown.trusted_reporters || 0 },
    ];
  }

  const now = Date.now();
  const ageMs = Math.max(0, now - station.last_updated);
  const ageHours = ageMs / (1000 * 60 * 60);
  const recencyScore = Math.max(0, Math.min(100, Math.round(100 - ageHours * 6)));
  const evidenceScore = station.latest_image_url ? 100 : 0;
  const activityScore = Math.max(0, Math.min(100, (station.reports_count || 0) * 10));

  return [
    { label: "Recency", value: recencyScore },
    { label: "Photo proof", value: evidenceScore },
    { label: "Activity", value: activityScore },
  ];
};
