import { describe, expect, it } from "vitest";
import { INCOMPLETE_LABEL, UNNAMED_CUSTOMER, customerDisplayName } from "./customerDisplay";

describe("customer fallback display", () => {
  it("uses unnamed customer instead of fabricated source id names", () => {
    expect(customerDisplayName({ name: "", name_is_fallback: true, id: 254843 }).name).toBe(UNNAMED_CUSTOMER);
    expect(customerDisplayName({ name: "مشتری 254843", id: 254843 }).name).toBe(UNNAMED_CUSTOMER);
    expect(customerDisplayName({ name: "آوا رضایی" }).fallback).toBe(false);
  });

  it("keeps unnamed fallback and incomplete label stable", () => {
    expect(customerDisplayName({ name: "", name_is_fallback: true, id: 254843 })).toEqual({
      name: UNNAMED_CUSTOMER,
      fallback: true,
    });
    expect(INCOMPLETE_LABEL).toBe("اطلاعات ناقص");
  });
});
