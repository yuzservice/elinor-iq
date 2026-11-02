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
  currentSort,
  filterParams,
  hasFilters,
  listQuery,
  millionText,
  nextSort,
  recencyColor,
  replaceFilters,
  tierColors,
  toggleInList,
  withChanges,
} from "./customerListUrl";

const categories = buildCategories({
  tiers: [{ value: "VIP", label: "VIP" }, { value: "GOLD_1", label: "طلایی ۱" }],
  callResults: [{ value: "علاقه‌مند", label: "علاقه‌مند" }],
  callTags: [{ value: "1", label: "فرصت فروش" }],
});
const url = (query: string) => new URLSearchParams(query);

describe("customer list URL", () => {
  it("keeps only API filters, not page state or other page params", () => {
    expect(filterParams(url("tier=VIP&page=3&sort=name&dir=asc&tab=x&tierRules=1&edit_list=5&search="))).toEqual({ tier: "VIP" });
    expect(hasFilters(url("page=2&sort=name"))).toBe(false);
    expect(hasFilters(url("search=سارا"))).toBe(true);
  });

  it("changes a filter, returns to page 1 and removes empty values", () => {
    const next = withChanges(url("page=4&tier=VIP"), { tier: null, city: "ساری" });
    expect(next.toString()).toBe(new URLSearchParams("city=ساری").toString());
  });

  it("matches any branch when several are selected", () => {
    expect(withChanges(url(""), { sales_lines: "SARI,ONLINE" }).get("sales_lines_mode")).toBe("any");
    expect(withChanges(url("sales_lines=SARI,ONLINE&sales_lines_mode=any"), { sales_lines: "SARI" }).get("sales_lines_mode")).toBeNull();
  });

  it("toggles a value in a comma list", () => {
    expect(toggleInList("VIP", "GOLD_1")).toBe("VIP,GOLD_1");
    expect(toggleInList("VIP,GOLD_1", "VIP")).toBe("GOLD_1");
    expect(toggleInList(null, "VIP")).toBe("VIP");
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
    expect(chips[2].remove).toEqual({ last_days: null, last_after: null, last_before: null });
  });

  it("keeps old saved parameters visible and removable", () => {
    const chips = activeChips(categories, url("population=purchasing"));
    expect(chips).toEqual([{ key: "population", label: "جمعیت: purchasing", aria: "حذف فیلتر جمعیت", remove: { population: null } }]);
  });

  it("counts active fields per category", () => {
    const params = url("tier=VIP&profile_state=complete&min_invoices=2");
    expect(categoryCount(categories[0], params)).toBe(2);
    expect(categoryCount(categories[1], params)).toBe(1);
    expect(categoryCount(categories[2], params)).toBe(0);
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
