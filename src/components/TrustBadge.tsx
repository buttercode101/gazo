import { StationTrust } from "../lib/trust";

interface TrustBadgeProps {
  trust: StationTrust;
  compact?: boolean;
}

export function TrustBadge({ trust, compact = false }: TrustBadgeProps) {
  const colorClass =
    trust.tier === "high"
      ? "bg-emerald-500/20 text-emerald-400"
      : trust.tier === "medium"
        ? "bg-amber-500/20 text-amber-400"
        : "bg-red-500/20 text-red-400";

  return (
    <span
      className={`inline-flex items-center rounded-full font-bold uppercase tracking-wider ${colorClass} ${
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[10px]"
      }`}
    >
      {compact ? `Trust ${trust.score}` : `${trust.label} · ${trust.score}`}
    </span>
  );
}
