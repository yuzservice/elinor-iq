import type { PublicTier, TierCode } from "../../types";

type TierStyle = { icon: string; badge: string };

const BRONZE: TierStyle = {
  icon: "🥉",
  badge: "text-amber-700 dark:text-amber-500 bg-amber-500/10 border border-amber-500/20",
};

/** Look of the eight original tiers. Tiers added later use NEUTRAL_TIER_STYLE. */
const TIER_STYLES: Record<string, TierStyle> = {
  VIP: { icon: "👑", badge: "badge-vip shadow-sm" },
  DIAMOND: { icon: "💎", badge: "badge-diamond shadow-sm" },
  GOLD_1: { icon: "⭐️", badge: "badge-gold shadow-sm" },
  GOLD_2: { icon: "⭐️", badge: "badge-gold shadow-sm" },
  SILVER: { icon: "🥈", badge: "badge-silver shadow-sm" },
  BRONZE_1: BRONZE,
  BRONZE_2: BRONZE,
  BRONZE_3: BRONZE,
};

export const NEUTRAL_TIER_STYLE: TierStyle = { icon: "🏷️", badge: "bg-hover text-muted border border-line" };

export function tierStyle(code: TierCode | null | undefined): TierStyle {
  return (code && TIER_STYLES[code]) || NEUTRAL_TIER_STYLE;
}

export function TierBadge({ code, label, className = "" }: { code: TierCode; label?: string | null; className?: string }) {
  const style = tierStyle(code);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-[11px] font-extrabold ${style.badge} ${className}`}
    >
      {style.icon} {label || code}
    </span>
  );
}

export type TierOption = { value: TierCode; label: string; shortLabel: string; icon: string; desc: string };

export function tierOptions(tiers: PublicTier[]): TierOption[] {
  return tiers.map((tier) => ({
    value: tier.code,
    label: tier.title,
    shortLabel: tier.title,
    icon: tierStyle(tier.code).icon,
    desc: tier.summary,
  }));
}
