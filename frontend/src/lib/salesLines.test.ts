import { afterEach, describe, expect, it } from "vitest";
import { visibleLines } from "../features/products/display";
import { visibleLenses } from "../features/customers/overviewDisplay";
import { isVisibleLine, joinFa, onlyVisible, setVisibleSalesLines, storeLinesText, visibleSalesLines, visibleStoreLines } from "./salesLines";

afterEach(() => setVisibleSalesLines(null));

describe("visible sales lines", () => {
  it("shows every line until /api/auth/me/ says otherwise", () => {
    setVisibleSalesLines(undefined);
    expect(visibleSalesLines()).toEqual(["ONLINE", "SARI", "GORGAN", "CAPRI"]);
    setVisibleSalesLines([]);
    expect(visibleSalesLines()).toEqual(["ONLINE", "SARI", "GORGAN", "CAPRI"]);
  });

  it("follows the backend list in canonical order and ignores unknown codes", () => {
    setVisibleSalesLines(["GORGAN", "ONLINE", "FOO", "SARI"]);
    expect(visibleSalesLines()).toEqual(["ONLINE", "SARI", "GORGAN"]);
    expect(visibleStoreLines()).toEqual(["SARI", "GORGAN"]);
    expect(isVisibleLine("CAPRI")).toBe(false);
    expect(isVisibleLine("sari")).toBe(true);
  });

  it("filters option lists, keeping items without a line", () => {
    setVisibleSalesLines(["ONLINE", "SARI", "GORGAN"]);
    const options = [{ value: "" }, { value: "SARI" }, { value: "CAPRI" }, { value: "ONLINE" }];
    expect(onlyVisible(options, (o) => o.value).map((o) => o.value)).toEqual(["", "SARI", "ONLINE"]);
    expect(visibleLines().map((l) => l.key)).toEqual(["ONLINE", "SARI", "GORGAN"]);
    expect(visibleLenses().map((l) => l.key)).not.toContain("capri");
    expect(visibleLenses().map((l) => l.key)).toContain("total");
  });

  it("builds branch-list text from the visible store lines", () => {
    const names = { SARI: "ساری", GORGAN: "گرگان", CAPRI: "کاپری" };
    setVisibleSalesLines(["ONLINE", "SARI", "GORGAN"]);
    expect(storeLinesText(names)).toBe("ساری و گرگان");
    setVisibleSalesLines(null);
    expect(storeLinesText(names)).toBe("ساری، گرگان و کاپری");
    expect(joinFa(["الف"])).toBe("الف");
  });
});
