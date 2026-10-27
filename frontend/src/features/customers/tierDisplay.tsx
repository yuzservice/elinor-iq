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

/** Look of a code; online twins (ONLINE_VIP) share the look of their base code. */
function baseCode(code: TierCode | null | undefined) {
  return code?.startsWith("ONLINE_") ? code.slice("ONLINE_".length) : code;
}

/** «طلایی سطح ۱ · حضوری» when the tier comes from a channel list. */
export function tierBadgeText(label: string | null | undefined, code: TierCode, channelLabel?: string | null) {
  return channelLabel ? `${label || code} · ${channelLabel}` : label || code;
}

export function TierBadge({
  code,
  label,
  channelLabel,
  className = "",
}: {
  code: TierCode;
  label?: string | null;
  channelLabel?: string | null;
  className?: string;
}) {
  const style = tierStyle(baseCode(code));
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-[11px] font-extrabold ${style.badge} ${className}`}
    >
      {style.icon} {tierBadgeText(label, code, channelLabel)}
    </span>
  );
}

export type TierOption = {
  value: TierCode;
  label: string;
  shortLabel: string;
  icon: string;
  desc: string;
  channel: string | null;
  channelLabel: string | null;
};

export function tierOptions(tiers: PublicTier[]): TierOption[] {
  return tiers.map((tier) => ({
    value: tier.code,
    label: tierBadgeText(tier.title, tier.code, tier.channel_label),
    shortLabel: tier.title,
    icon: tierStyle(baseCode(tier.code)).icon,
    desc: tier.summary,
    channel: tier.channel,
    channelLabel: tier.channel_label,
  }));
}

/** Options grouped by channel for the list filter: [{channel, channelLabel, options}]. */
export function groupTierOptions(options: TierOption[]) {
  const groups: { channel: string | null; channelLabel: string | null; options: TierOption[] }[] = [];
  for (const option of options) {
    let group = groups.find((item) => item.channel === option.channel);
    if (!group) {
      group = { channel: option.channel, channelLabel: option.channelLabel, options: [] };
      groups.push(group);
    }
    group.options.push(option);
  }
  return groups;
}
