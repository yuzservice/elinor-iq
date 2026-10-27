import type { ChannelTierRules, TierChannel, TierCondition, TierConditionKey, TierRule, TierRules } from "../../types";

export const MAX_TIERS = 12;
export const MAX_TITLE_LENGTH = 40;
export const CONDITION_KEYS: TierConditionKey[] = ["purchase_count", "days_since_last_min", "days_since_last", "lifetime_amount"];

/** Day bounds have no operator: days_since_last_min is «از» (>=), days_since_last is «تا» (<=). */
export const FIXED_OPERATOR_KEYS: TierConditionKey[] = ["days_since_last_min", "days_since_last"];

const EMPTY_CONDITION: TierCondition = { enabled: false, value: null };

/** Rules stored before a condition existed lack its key; fill it as disabled. */
function withAllConditions(tier: TierRule): TierRule {
  const conditions = { ...tier.conditions };
  for (const key of CONDITION_KEYS) {
    if (!conditions[key]) {
      conditions[key] = FIXED_OPERATOR_KEYS.includes(key) ? { ...EMPTY_CONDITION } : { ...EMPTY_CONDITION, operator: "gte" };
    }
  }
  return { ...tier, conditions };
}

/** Rules in the exact shape the server stores after validation. */
export function normalizeRules(rules: TierRules | null | undefined): TierRules | null {
  if (!rules) return null;
  const { mode, lists } = splitRules(rules);
  return joinRules(mode, lists);
}

export const TIER_CHANNELS: { id: TierChannel; label: string }[] = [
  { id: "online", label: "اینترنتی" },
  { id: "pos", label: "حضوری" },
];

/** Editing key of a list: a channel, or "_" for the legacy general list. */
export type ListKey = TierChannel | "_";

export function isChannelRules(rules: TierRules | null | undefined): rules is ChannelTierRules {
  return Boolean(rules && "channels" in rules);
}

/** Editable lists per channel (or one "_" list for the legacy shape). */
export function splitRules(rules: TierRules): { mode: "channels" | "legacy"; lists: Partial<Record<ListKey, EditableTier[]>> } {
  if (isChannelRules(rules)) {
    return {
      mode: "channels",
      lists: {
        online: toEditable({ tiers: rules.channels.online?.tiers ?? [] }),
        pos: toEditable({ tiers: rules.channels.pos?.tiers ?? [] }),
      },
    };
  }
  return { mode: "legacy", lists: { _: toEditable(rules) } };
}

export function joinRules(mode: "channels" | "legacy", lists: Partial<Record<ListKey, EditableTier[]>>): TierRules {
  if (mode === "channels") {
    return {
      channels: {
        online: fromEditable(lists.online ?? []) as { tiers: TierRule[] },
        pos: fromEditable(lists.pos ?? []) as { tiers: TierRule[] },
      },
    };
  }
  return fromEditable(lists._ ?? []);
}

export type TierRuleErrors = {
  _?: string;
  tiers: Record<number, Partial<Record<TierConditionKey | "title" | "_", string>>>;
};

/** A tier being edited. `key` is a client-only id so new (code-less) tiers keep their identity. */
export type EditableTier = TierRule & { key: string };

let nextKey = 0;

export function toEditable(rules: { tiers: TierRule[] }): EditableTier[] {
  return rules.tiers.map((tier) => ({ ...withAllConditions(structuredClone(tier)), key: tier.code ?? `new-${nextKey++}` }));
}

export function fromEditable(tiers: EditableTier[]): { tiers: TierRule[] } {
  return {
    tiers: tiers.map(({ key: _key, ...tier }) => {
      const conditions = Object.fromEntries(
        CONDITION_KEYS.map((condition) => {
          const { enabled, value, operator } = tier.conditions[condition];
          return [
            condition,
            FIXED_OPERATOR_KEYS.includes(condition) ? { enabled, value } : { enabled, value, operator: operator ?? "gte" },
          ];
        }),
      ) as Record<TierConditionKey, TierCondition>;
      return { ...tier, title: tier.title.trim(), conditions };
    }),
  };
}

export function newTier(title: string): EditableTier {
  return {
    key: `new-${nextKey++}`,
    code: null,
    title,
    enabled: true,
    conditions: {
      purchase_count: { enabled: true, operator: "gte", value: 1 },
      days_since_last_min: { enabled: false, value: null },
      days_since_last: { enabled: false, value: null },
      lifetime_amount: { enabled: false, operator: "gte", value: null },
    },
  };
}

export function moveTier<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

/** Mirrors backend validate_rules so the user sees errors before saving. */
export function validateTierRules(tiers: TierRule[]): TierRuleErrors {
  const errors: TierRuleErrors = { tiers: {} };
  if (!tiers.length) errors._ = "دست‌کم یک سطح لازم است.";
  if (tiers.length > MAX_TIERS) errors._ = `حداکثر ${MAX_TIERS} سطح مجاز است.`;
  if (tiers.length && !tiers.some((tier) => tier.enabled)) errors._ = "دست‌کم یک سطح باید فعال باشد.";

  const titles = new Set<string>();
  tiers.forEach((tier, index) => {
    const messages: Partial<Record<TierConditionKey | "title" | "_", string>> = {};
    const title = tier.title.trim();
    if (!title) messages.title = "عنوان سطح را وارد کنید.";
    else if (title.length > MAX_TITLE_LENGTH) messages.title = `عنوان سطح حداکثر ${MAX_TITLE_LENGTH} نویسه است.`;
    else if (titles.has(title.toLocaleLowerCase())) messages.title = "عنوان سطح تکراری است.";
    titles.add(title.toLocaleLowerCase());

    for (const key of CONDITION_KEYS) {
      const condition = tier.conditions[key];
      if (!condition?.enabled) continue;
      if (condition.value == null || Number.isNaN(condition.value)) {
        messages[key] = "برای شرط فعال، مقدار را وارد کنید.";
      } else if (!Number.isInteger(condition.value)) {
        messages[key] = "مقدار باید عدد صحیح باشد.";
      } else if (condition.value < 0) {
        messages[key] = "مقدار نمی‌تواند منفی باشد.";
      } else if (!FIXED_OPERATOR_KEYS.includes(key) && condition.operator !== "gte" && condition.operator !== "lte") {
        messages[key] = "عملگر باید «بیشتر یا مساوی» یا «کمتر یا مساوی» باشد.";
      }
    }
    const low = tier.conditions.days_since_last_min;
    const high = tier.conditions.days_since_last;
    if (low?.enabled && high?.enabled && low.value != null && high.value != null && low.value > high.value && !messages.days_since_last) {
      messages.days_since_last = "«تا» روز باید بزرگ‌تر یا مساوی «از» باشد.";
    }
    if (tier.enabled && !CONDITION_KEYS.some((key) => tier.conditions[key]?.enabled)) {
      messages._ = "دست‌کم یک شرط باید فعال باشد؛ وگرنه همه خریداران در این سطح قرار می‌گیرند.";
    }
    if (Object.keys(messages).length) errors.tiers[index] = messages;
  });
  return errors;
}

export function hasTierRuleErrors(errors: TierRuleErrors): boolean {
  return Boolean(errors._) || Object.keys(errors.tiers).length > 0;
}

const faNumber = new Intl.NumberFormat("fa-IR");
const faDecimal = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 });

function amountText(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${faDecimal.format(value / 1_000_000)} میلیون`;
  return `${faNumber.format(value)} تومان`;
}

/** Same text as the backend tier_summary, e.g. «۴+ خرید · حداکثر ۴۵ روز از آخرین خرید · +۱۰ میلیون». */
export function tierSummary(tier: TierRule): string {
  const parts: string[] = [];
  const { purchase_count: count, days_since_last_min: low, days_since_last: high, lifetime_amount: amount } = tier.conditions;
  if (count?.enabled && count.value != null) {
    const value = faNumber.format(count.value);
    parts.push(count.operator === "lte" ? `حداکثر ${value} خرید` : `${value}+ خرید`);
  }
  const lowOn = Boolean(low?.enabled && low.value != null);
  const highOn = Boolean(high?.enabled && high.value != null);
  if (lowOn && highOn) {
    parts.push(`${faNumber.format(low!.value!)} تا ${faNumber.format(high!.value!)} روز از آخرین خرید`);
  } else if (lowOn) {
    parts.push(`حداقل ${faNumber.format(low!.value!)} روز از آخرین خرید`);
  } else if (highOn) {
    parts.push(`حداکثر ${faNumber.format(high!.value!)} روز از آخرین خرید`);
  }
  if (amount?.enabled && amount.value != null) {
    const value = amountText(amount.value);
    parts.push(amount.operator === "lte" ? `حداکثر ${value}` : `+${value}`);
  }
  return parts.length ? parts.join(" · ") : "بدون شرط";
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Parse a user-typed integer: Persian/Arabic digits and thousand separators allowed. Empty → null. */
export function parseIntegerInput(raw: string): number | null {
  const latin = raw
    .split("")
    .map((ch) => {
      const persian = PERSIAN_DIGITS.indexOf(ch);
      if (persian >= 0) return String(persian);
      const arabic = ARABIC_DIGITS.indexOf(ch);
      if (arabic >= 0) return String(arabic);
      return ch;
    })
    .join("")
    .replace(/[,،٬\s]/g, "");
  if (latin === "") return null;
  if (!/^-?\d+$/.test(latin)) return Number.NaN;
  return Number(latin);
}

/** Thousand separators for the amount input, Latin digits so it stays editable. */
export function formatAmountInput(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "";
  return new Intl.NumberFormat("en-US").format(value);
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** Key-order independent: rules come back from a jsonb column with reordered keys. */
export function rulesEqual(a: TierRules | null | undefined, b: TierRules | null | undefined): boolean {
  return JSON.stringify(canonical(a ?? null)) === JSON.stringify(canonical(b ?? null));
}
