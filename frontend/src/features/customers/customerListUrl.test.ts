import { describe, expect, it } from "vitest";
import {
  activeChips,
  ariaSort,
  basketBar,
  buildCategories,
  categoryCount,
  channelCell,
  compareNote,
  currentPage,
  clearCategory,
  currentSort,
  dateRows,
  dependentOptions,
  filterOptions,
  filterParams,
  hasFilters,
  listQuery,
  millionText,
  nextSort,
  PRESETS,
  recencyColor,
  replaceFilters,
  selectionLabel,
  switchDateType,
  tierColors,
  withChanges,
} from "./customerListUrl";

const categories = buildCategories({
  tiers: [{ value: "VIP", label: "VIP" }, { value: "GOLD_1", label: "طلایی ۱" }],
  callResults: [{ value: "علاقه‌مند", label: "علاقه‌مند" }],
  callTags: [{ value: "1", label: "فرصت فروش" }],
  provinces: [{ value: "1", label: "مازندران", count: 5 }, { value: "2", label: "گلستان", count: 3 }],
  citiesById: [{ value: "10", label: "ساری", group: "1" }, { value: "11", label: "بابل", group: "1" }, { value: "20", label: "گرگان", group: "2" }],
  products: [{ value: "7", label: "کفش چرم" }],
  fillRates: { birth_month: 0.7, gender: 0.9, joined: 99.6, tier_change: 72.9 },
  categories: ["مانتو"],
  sizes: ["M"],
});
const url = (query: string) => new URLSearchParams(query);

describe("customer list URL", () => {
  it("keeps only API filters, not page state or other page params", () => {
    expect(filterParams(url("tier=VIP&page=3&sort=name&dir=asc&tab=x&tierRules=1&edit_list=5&search="))).toEqual({ tier: "VIP" });
    expect(hasFilters(url("page=2&sort=name"))).toBe(false);
    expect(hasFilters(url("search=سارا"))).toBe(true);
  });

  it("changes a filter, returns to page 1 and removes empty values", () => {
    const next = withChanges(url("page=4&tier=VIP"), { tier: null, city_ids: "10" });
    expect(next.toString()).toBe(new URLSearchParams("city_ids=10").toString());
  });

  it("replaces filters but keeps the tab and sort", () => {
    const next = replaceFilters(url("tab=x&sort=name&dir=asc&tier=VIP&page=3"), { min_invoices: "1", page: 9, empty: "" });
    expect(Object.fromEntries(next)).toEqual({ tab: "x", sort: "name", dir: "asc", min_invoices: "1" });
  });

  it("builds chips with labels, and removal covers all of a field's params", () => {
    const params = url("tier=VIP,GOLD_1&min_total=2000000&last_days=gt90&search=سارا");
    const chips = activeChips(categories, params);
    expect(chips.map((chip) => chip.label)).toEqual(["سطح: VIP، طلایی ۱", "مجموع خرید: از ۲", "آخرین خرید: بیش از ۹۰ روز"]);
    expect(chips[1].remove).toEqual({ min_total: null, max_total: null });
    expect(chips[2].remove).toEqual({ last_after: null, last_before: null, last_days: null });
  });

  it("keeps old saved parameters visible and removable", () => {
    const chips = activeChips(categories, url("population=purchasing"));
    expect(chips).toEqual([{ key: "population", label: "جمعیت: purchasing", aria: "حذف فیلتر جمعیت", remove: { population: null } }]);
  });

  it("counts active fields per category", () => {
    const params = url("tier=VIP&profile_state=complete&min_invoices=2");
    expect(categoryCount(categories[0], params)).toBe(2);
    expect(categoryCount(categories[1], params)).toBe(1);
    expect(categoryCount(categories[1], url("last_after=2026-03-21&first_before=2025-03-20"))).toBe(1);
    expect(categoryCount(categories[2], params)).toBe(0);
  });
});

describe("purchase date rows", () => {
  it("shows a row per date type in the URL, plus rows just added", () => {
    expect(dateRows(url(""))).toEqual([]);
    expect(dateRows(url("first_after=2025-03-21"))).toEqual(["first"]);
    expect(dateRows(url("last_before=2026-03-21&first_after=2025-03-21"))).toEqual(["last", "first"]);
    expect(dateRows(url("last_days=gt90"))).toEqual(["last"]); // old relative param
    expect(dateRows(url(""), ["first"])).toEqual(["first"]);
  });

  it("gives one chip per type with Jalali bounds, each removing only its own params", () => {
    const chips = activeChips(categories, url("last_after=2026-03-21&last_before=2026-09-22&first_before=2026-03-21"));
    expect(chips.map((chip) => chip.label)).toEqual(["آخرین خرید: از ۱۴۰۵/۰۱/۰۱ تا ۱۴۰۵/۰۶/۳۱", "اولین خرید: تا ۱۴۰۵/۰۱/۰۱"]);
    expect(chips[0].remove).toEqual({ last_after: null, last_before: null, last_days: null });
    expect(chips[1].remove).toEqual({ first_after: null, first_before: null, first_days: null });
  });

  it("keeps old relative params as removable chips", () => {
    const chips = activeChips(categories, url("first_days=30&last_days=gt180"));
    expect(chips.map((chip) => chip.label)).toEqual(["آخرین خرید: بیش از ۱۸۰ روز", "اولین خرید: تا ۳۰ روز پیش"]);
  });

  it("moves a row to the other type with its dates", () => {
    expect(switchDateType(url("last_after=2026-01-01&last_days=30"), "last", "first")).toEqual({
      first_after: "2026-01-01",
      first_before: null,
      first_days: "30",
      last_after: null,
      last_before: null,
      last_days: null,
    });
  });

  it("keeps presets relative", () => {
    expect(PRESETS.find((preset) => preset.label === "غیرفعال ۹۰ روز")?.filters).toEqual({ last_days: "gt90" });
  });
});

describe("dropdowns", () => {
  const options = [{ value: "VIP", label: "VIP" }, { value: "GOLD_1", label: "طلایی ۱" }, { value: "SILVER", label: "نقره‌ای" }];
  it("labels the closed dropdown", () => {
    expect(selectionLabel([], options)).toBe("همه");
    expect(selectionLabel(["GOLD_1"], options)).toBe("طلایی ۱");
    expect(selectionLabel(["VIP", "GOLD_1", "SILVER"], options)).toBe("۳ مورد");
  });

  it("filters long lists by label or value", () => {
    expect(filterOptions(options, "طلا").map((option) => option.value)).toEqual(["GOLD_1"]);
    expect(filterOptions(options, "silver").map((option) => option.value)).toEqual(["SILVER"]);
    expect(filterOptions(options, " ")).toHaveLength(3);
  });

});

describe("filter v2 fields", () => {
  const fields = categories.flatMap((category) => category.fields);
  const field = (key: string) => fields.find((item) => item.key === key)!;

  it("hides filters whose data is filled for under 5% of customers", () => {
    expect(fields.map((item) => item.key)).not.toContain("birth");
    expect(fields.map((item) => item.key)).not.toContain("gender");
    expect(fields.map((item) => item.key)).toEqual(expect.arrayContaining(["joined", "tierChange", "province", "city", "products"]));
    const before = buildCategories({ tiers: [], callResults: [], callTags: [], categories: [], sizes: [] });
    expect(before.flatMap((category) => category.fields).map((item) => item.key)).not.toContain("joined"); // rates not loaded yet
  });

  it("lists only the cities of the selected provinces", () => {
    expect(dependentOptions(field("city"), url("provinces=2")).map((option) => option.label)).toEqual(["گرگان"]);
    expect(dependentOptions(field("city"), url("provinces=1,2"))).toHaveLength(3);
    expect(dependentOptions(field("city"), url(""))).toHaveLength(3);
  });

  it("builds chips for the new filters and keeps the old city-name param", () => {
    const labels = activeChips(categories, url("provinces=1&city_ids=10&products=7&tier_change=up&tier_change_after=2026-03-21&joined_before=2026-03-21&cities=ساری")).map((chip) => chip.label);
    expect(labels).toEqual([
      "استان: مازندران",
      "شهر: ساری",
      "تاریخ عضویت: تا ۱۴۰۵/۰۱/۰۱",
      "تغییر سطح اخیر: ارتقا از ۱۴۰۵/۰۱/۰۱",
      "خرید کالای مشخص: کفش چرم",
      "شهر: ساری",
    ]);
  });

  it("clears a whole category", () => {
    const cleared = clearCategory(categories[0]);
    expect(Object.keys(cleared)).toEqual(expect.arrayContaining(["tier", "provinces", "city_ids", "joined_after", "tier_change", "tier_change_before"]));
    expect(Object.values(cleared).every((value) => value === null)).toBe(true);
  });
});

describe("sort", () => {
  it("defaults to the most recent purchase", () => {
    expect(currentSort(url(""))).toEqual({ sort: "last_purchase", dir: "desc" });
    expect(currentSort(url("sort=old_value"))).toEqual({ sort: "last_purchase", dir: "desc" });
  });

  it("first click uses the column default, second click reverses, page resets", () => {
    const first = nextSort(url("page=5"), "avg_basket");
    expect(Object.fromEntries(first)).toEqual({ sort: "avg_basket", dir: "desc" });
    expect(nextSort(first, "avg_basket").get("dir")).toBe("asc");
    expect(nextSort(url(""), "name").get("dir")).toBe("asc");
  });

  it("sets aria-sort; date columns read as days ago", () => {
    expect(ariaSort(url(""), "last_purchase")).toBe("ascending");
    expect(ariaSort(url("sort=last_purchase&dir=asc"), "last_purchase")).toBe("descending");
    expect(ariaSort(url("sort=name&dir=asc"), "name")).toBe("ascending");
    expect(ariaSort(url("sort=name&dir=asc"), "tier")).toBe("none");
  });

  it("always sends sort and dir to the API, with selected ids for export", () => {
    const query = new URLSearchParams(listQuery(url("tier=VIP&page=2"), 20, [5, 6]));
    expect(Object.fromEntries(query)).toEqual({ tier: "VIP", sort: "last_purchase", dir: "desc", page: "2", per_page: "20", ids: "5,6" });
    expect(currentPage(url("page=abc"))).toBe(1);
  });
});

describe("cells", () => {
  it("colors recency at 90 and 180 days", () => {
    expect([recencyColor(90), recencyColor(91), recencyColor(180), recencyColor(181), recencyColor(null)]).toEqual(["#34d399", "#fbbf24", "#fbbf24", "#fb7185", null]);
  });

  it("formats millions and handles a missing basket", () => {
    expect(millionText(3_850_000)).toBe("۳٫۹ میلیون");
    expect(millionText(null)).toBe("—");
  });

  it("scales the basket bar to the page maximum", () => {
    expect(basketBar(500, 1000)).toBe(50);
    expect(basketBar(null, 1000)).toBe(0);
    expect(basketBar(500, 0)).toBe(0);
  });

  it("describes the channel with its branches", () => {
    expect(channelCell("physical", ["SARI"]).text).toBe("حضوری، ساری");
    expect(channelCell("none", []).text).toBe("—");
  });

  it("compares with the overall average", () => {
    expect(compareNote(120, 100)).toEqual({ text: "۲۰٪ بیشتر از میانگین کل", sign: 1 });
    expect(compareNote(80, 100)).toEqual({ text: "۲۰٪ کمتر از میانگین کل", sign: -1 });
    expect(compareNote(100, 100).text).toBe("برابر میانگین کل");
    expect(compareNote(null, 100).text).toBe("—");
  });

  it("keeps tier colors stable and shared with channel variants", () => {
    expect(tierColors("ONLINE_VIP")).toEqual(tierColors("VIP"));
    expect(tierColors("CUSTOM_7")).toEqual(tierColors("CUSTOM_7"));
  });
});
