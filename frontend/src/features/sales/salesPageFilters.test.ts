import { describe, expect, it } from "vitest";
import { deriveSalesLineFilter, isBranchFilterDisabled } from "./salesPageFilters";

describe("deriveSalesLineFilter", () => {
  it("returns all when both filters are all", () => {
    expect(deriveSalesLineFilter("all", "all")).toBe("all");
  });

  it("returns ONLINE when channel is online", () => {
    expect(deriveSalesLineFilter("SARI", "ONLINE")).toBe("ONLINE");
  });

  it("returns branch when a branch is selected", () => {
    expect(deriveSalesLineFilter("GORGAN", "all")).toBe("GORGAN");
    expect(deriveSalesLineFilter("CAPRI", "PHYSICAL")).toBe("CAPRI");
  });
});

describe("isBranchFilterDisabled", () => {
  it("disables branch filter for online channel", () => {
    expect(isBranchFilterDisabled("ONLINE")).toBe(true);
    expect(isBranchFilterDisabled("all")).toBe(false);
    expect(isBranchFilterDisabled("PHYSICAL")).toBe(false);
  });
});
