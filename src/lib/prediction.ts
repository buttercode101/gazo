import { PriceReport } from "../types";

export interface PricePrediction {
  direction: "rise" | "drop" | "stable";
  confidence: number;
  change24h: number;
  change72h: number;
  summary: string;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const getPricePrediction = (history: PriceReport[]): PricePrediction | null => {
  const valid = history
    .filter((report) => typeof report.price === "number" && Number.isFinite(report.price))
    .slice(-20);

  if (valid.length < 4) return null;

  const points = valid.map((report) => ({
    x: report.timestamp,
    y: report.price,
  }));

  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;
  const numerator = points.reduce((sum, p) => sum + (p.x - meanX) * (p.y - meanY), 0);
  const denominator = points.reduce((sum, p) => sum + Math.pow(p.x - meanX, 2), 0);
  const slopePerMs = denominator > 0 ? numerator / denominator : 0;

  const residuals = points.map((p) => p.y - (meanY + slopePerMs * (p.x - meanX)));
  const rmse = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / n);
  const avgPrice = meanY > 0 ? meanY : 1;
  const noiseRatio = rmse / avgPrice;

  const hours24 = 24 * 60 * 60 * 1000;
  const hours72 = 72 * 60 * 60 * 1000;
  const change24h = Number((slopePerMs * hours24).toFixed(2));
  const change72h = Number((slopePerMs * hours72).toFixed(2));

  const momentum = Math.abs(change72h);
  const direction: PricePrediction["direction"] =
    change72h > 0.12 ? "rise" : change72h < -0.12 ? "drop" : "stable";
  const confidence = Math.round(clamp((1 - noiseRatio * 6) * 100, 10, 95));

  const summary = direction === "rise"
    ? `Likely rising in the next 24–72h (+R${Math.abs(change72h).toFixed(2)} est.).`
    : direction === "drop"
      ? `Likely dropping in the next 24–72h (-R${Math.abs(change72h).toFixed(2)} est.).`
      : `Likely stable over the next 24–72h (±R${momentum.toFixed(2)}).`;

  return {
    direction,
    confidence,
    change24h,
    change72h,
    summary,
  };
};
