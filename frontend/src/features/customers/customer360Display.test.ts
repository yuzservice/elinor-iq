import { describe, expect, it } from "vitest";
import { formatDate } from "../../lib/format";
import { PROFILE_EMPTY, joinFacts, profileValue, salesLineTone } from "./customer360Display";

describe("customer 360 display", () => {
  it("uses a clear empty state instead of fabricated profile values", () => {
    expect(profileValue("")).toBe(PROFILE_EMPTY);
    expect(profileValue(null)).toBe(PROFILE_EMPTY);
    expect(profileValue("gold")).toBe("gold");
  });

  it("keeps sales-line labels distinct and jalali dates for purchase history", () => {
    expect(salesLineTone("ONLINE")).toBe("accent");
    expect(salesLineTone("SARI")).toBe("sage");
    expect(salesLineTone("GORGAN")).toBe("warning");
    expect(salesLineTone("CAPRI")).toBe("neutral");
    expect(joinFacts(["مشکی", "کرم"])).toBe("مشکی، کرم");
    expect(joinFacts([])).toBe(PROFILE_EMPTY);
    expect(formatDate("2026-09-17T12:30:00+03:30")).toBe("۱۴۰۵/۰۶/۲۶");
  });
});
