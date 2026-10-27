import { describe, expect, it } from "vitest";
import type { LegacyTierRules, TierRule, TierRulesState } from "../../types";
import {
  MAX_TIERS,
  formatAmountInput,
  fromEditable,
  hasTierRuleErrors,
  moveTier,
  newTier,
  isChannelRules,
  channelDraftConfirmText,
  channelDraftPrompt,
  joinRules,
  normalizeRules,
  splitRules,
  parseIntegerInput,
  rulesEqual,
  tierSummary,
  toEditable,
  validateTierRules,
} from "./tierRules";

function tier(code: string, title: string, count: number | null, days: number | null, amount: number | null): TierRule {
  return {
    code,
    title,
    enabled: true,
    conditions: {
      purchase_count: { enabled: count != null, operator: "gte", value: count },
      days_since_last_min: { enabled: false, value: null },
      days_since_last: { enabled: days != null, value: days },
      lifetime_amount: { enabled: amount != null, operator: "gte", value: amount },
    },
  };
}

function versionOne(): TierRule[] {
  return [
    tier("VIP", "VIP", 4, 45, 10_000_000),
    tier("DIAMOND", "الماس", 3, 90, 5_000_000),
    tier("GOLD_1", "طلایی سطح ۱", 4, 365, 10_000_000),
    tier("GOLD_2", "طلایی سطح ۲", 2, 90, null),
    tier("BRONZE_1", "برنزی سطح ۱", 1, 29, null),
    tier("SILVER", "نقره‌ای", 1, 90, null),
    tier("BRONZE_2", "برنزی سطح ۲", null, 179, null),
    tier("BRONZE_3", "برنزی سطح ۳", 1, null, null),
  ];
}

describe("tierSummary", () => {
  it("matches the backend text", () => {
    expect(tierSummary(versionOne()[0])).toBe("۴+ خرید · حداکثر ۴۵ روز از آخرین خرید · +۱۰ میلیون");
    expect(tierSummary(versionOne()[6])).toBe("حداکثر ۱۷۹ روز از آخرین خرید");
    const lte = versionOne()[3];
    lte.conditions.lifetime_amount = { enabled: true, operator: "lte", value: 500_000 };
    expect(tierSummary(lte)).toBe("۲+ خرید · حداکثر ۹۰ روز از آخرین خرید · حداکثر ۵۰۰٬۰۰۰ تومان");
  });

  it("skips disabled conditions", () => {
    const vip = versionOne()[0];
    vip.conditions.lifetime_amount.enabled = false;
    expect(tierSummary(vip)).toBe("۴+ خرید · حداکثر ۴۵ روز از آخرین خرید");
  });
});

describe("validateTierRules", () => {
  it("accepts version 1", () => {
    expect(hasTierRuleErrors(validateTierRules(versionOne()))).toBe(false);
  });

  it("rejects empty, duplicate and long titles", () => {
    const tiers = versionOne();
    tiers[1].title = " vip ";
    tiers[2].title = "  ";
    tiers[3].title = "ط".repeat(41);
    const errors = validateTierRules(tiers).tiers;
    expect(errors[1]?.title).toBeTruthy();
    expect(errors[2]?.title).toBeTruthy();
    expect(errors[3]?.title).toBeTruthy();
  });

  it("requires a value for an enabled condition and rejects negatives", () => {
    const tiers = versionOne();
    tiers[0].conditions.purchase_count = { enabled: true, operator: "gte", value: null };
    tiers[1].conditions.lifetime_amount = { enabled: true, operator: "gte", value: -1 };
    const errors = validateTierRules(tiers).tiers;
    expect(errors[0]?.purchase_count).toBeTruthy();
    expect(errors[1]?.lifetime_amount).toBeTruthy();
  });

  it("requires an enabled condition per enabled tier and one enabled tier", () => {
    const tiers = versionOne();
    tiers[7].conditions.purchase_count.enabled = false;
    expect(validateTierRules(tiers).tiers[7]?._).toBeTruthy();
    tiers[7].enabled = false;
    expect(validateTierRules(tiers).tiers[7]).toBeUndefined();
    expect(validateTierRules(tiers.map((item) => ({ ...item, enabled: false })))._).toBeTruthy();
  });

  it("limits the number of tiers", () => {
    const tiers = [...versionOne()];
    while (tiers.length <= MAX_TIERS) tiers.push(tier(`X_${tiers.length}`, `سطح ${tiers.length}`, 1, null, null));
    expect(validateTierRules(tiers)._).toBeTruthy();
  });
});

describe("editing helpers", () => {
  it("moves tiers up and down within bounds", () => {
    expect(moveTier(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveTier(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveTier(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("round-trips rules and drops client keys and the days operator", () => {
    const editable = toEditable({ tiers: versionOne() });
    editable.push(newTier("سطح تازه"));
    editable[0].conditions.days_since_last = { enabled: true, value: 45, operator: "gte" };
    const rules = fromEditable(editable);
    expect(rules.tiers[0].conditions.days_since_last).toEqual({ enabled: true, value: 45 });
    expect(rules.tiers.at(-1)).toMatchObject({ code: null, title: "سطح تازه", enabled: true });
    expect(rules.tiers.some((item) => "key" in item)).toBe(false);
  });
});

describe("integer inputs", () => {
  it("parses Persian digits and thousand separators", () => {
    expect(parseIntegerInput("۱۰,۰۰۰,۰۰۰")).toBe(10_000_000);
    expect(parseIntegerInput("5٬000")).toBe(5000);
    expect(parseIntegerInput("")).toBeNull();
    expect(Number.isNaN(parseIntegerInput("12a") as number)).toBe(true);
  });

  it("formats amounts with separators", () => {
    expect(formatAmountInput(10_000_000)).toBe("10,000,000");
    expect(formatAmountInput(null)).toBe("");
  });
});

describe("rulesEqual", () => {
  it("ignores key order", () => {
    const a = { tiers: [tier("VIP", "VIP", 4, 45, null)] };
    const b = JSON.parse(JSON.stringify(a));
    b.tiers[0] = { conditions: b.tiers[0].conditions, enabled: true, title: "VIP", code: "VIP" };
    expect(rulesEqual(a, b)).toBe(true);
    b.tiers[0].title = "V";
    expect(rulesEqual(a, b)).toBe(false);
  });
});

describe("day range («از» / «تا»)", () => {
  it("summarises both bounds, either bound, and validates the order", () => {
    const silver = versionOne()[5];
    silver.conditions.days_since_last_min = { enabled: true, value: 60 };
    expect(tierSummary(silver)).toBe("۱+ خرید · ۶۰ تا ۹۰ روز از آخرین خرید");
    silver.conditions.days_since_last.enabled = false;
    expect(tierSummary(silver)).toBe("۱+ خرید · حداقل ۶۰ روز از آخرین خرید");

    const tiers = versionOne();
    tiers[5].conditions.days_since_last_min = { enabled: true, value: 100 };
    expect(validateTierRules(tiers).tiers[5]?.days_since_last).toBeTruthy();
  });

  it("fills the «از» bound for rules stored without it", () => {
    const stored = versionOne().map((item) => {
      const { days_since_last_min: _dropped, ...conditions } = item.conditions;
      return { ...item, conditions } as unknown as TierRule;
    });
    const normalized = normalizeRules({ tiers: stored }) as LegacyTierRules | null;
    expect(normalized?.tiers[0].conditions.days_since_last_min).toEqual({ enabled: false, value: null });
  });
});

describe("channel rules", () => {
  it("splits and joins channel lists without losing tiers", () => {
    const pos = versionOne();
    const online = versionOne().map((item) => ({ ...item, code: `ONLINE_${item.code}` }));
    const rules = { channels: { online: { tiers: online }, pos: { tiers: pos } } };
    const { mode, lists } = splitRules(rules);
    expect(mode).toBe("channels");
    expect(lists.online?.[0].code).toBe("ONLINE_VIP");
    expect(rulesEqual(joinRules(mode, lists), rules)).toBe(true);
    expect(isChannelRules(rules)).toBe(true);
    expect(splitRules({ tiers: pos }).mode).toBe("legacy");
  });
});

describe("channel draft banner", () => {
  const set = (rules: object, version: number) => ({ version, rules }) as unknown as TierRulesState["active"];
  const channels = { channels: { online: { tiers: [] }, pos: { tiers: [] } } };
  const state = (active: object, draft: object | null, draftVersion = 3) =>
    ({ active: set(active, 2), draft: draft ? set(draft, draftVersion) : null }) as unknown as TierRulesState;

  it("is shown for legacy rules without a channel draft, and asks to confirm only over a legacy draft", () => {
    expect(channelDraftPrompt(state({ tiers: [] }, null))).toEqual({ replaceVersion: null });
    expect(channelDraftPrompt(state({ tiers: [] }, { tiers: [] }))).toEqual({ replaceVersion: 3 });
  });

  it("is hidden once channels are active or a channel draft exists", () => {
    expect(channelDraftPrompt(state(channels, null))).toBeNull();
    expect(channelDraftPrompt(state({ tiers: [] }, channels))).toBeNull();
    expect(channelDraftPrompt(null)).toBeNull();
  });

  it("words the confirm with the draft version", () => {
    expect(channelDraftConfirmText(3)).toBe("پیش‌نویس فعلی (نسخه ۳) بایگانی می‌شود و در تاریخچه می‌ماند.");
  });
});
