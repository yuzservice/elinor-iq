import { describe, expect, it } from "vitest";
import {
  applyIds, clampRack, copyRack, findRacks, firstEmpty, fitSlots, footprint, freeSpot, minStore, newRack, nextCode, nextEmpty, overlapping,
  showsCode, sides, slotOrder, toDoc,
} from "./geometry";
import type { Layout, MapProduct, Rack, Slot } from "./types";

const product = (id: number, title: string, code: string): MapProduct => ({ id, title, short_code: code, color: "#123456", status: "normal" });
const slot = (key: string, side: Slot["side"], kind: Slot["kind"], offset: number, length: number | null, p: MapProduct | null = null): Slot =>
  ({ id: null, key, side, kind, offset_cm: offset, length_cm: length, product: p });
const rack = (key: string, x = 0, y = 0, slots: Slot[] = [slot(`${key}a`, "a", "full", 0, 150), slot(`${key}b`, "b", "full", 0, 150)]): Rack =>
  ({ id: null, key, code: key.toUpperCase(), x_cm: x, y_cm: y, rotation: 0, length_cm: 150, arm_cm: 50, slots });
const store = { width_cm: 1000, height_cm: 600 };

describe("footprint and placement", () => {
  it("rounds the footprint up to 50 cm cells and swaps it when rotated", () => {
    expect(footprint(rack("r"))).toEqual([150, 100]);
    expect(footprint({ ...rack("r"), length_cm: 160 })).toEqual([200, 100]);
    expect(footprint({ ...rack("r"), rotation: 90 })).toEqual([100, 150]);
    const wall = rack("w", 0, 0, [slot("x", "a", "full", 0, 150)]);
    expect(sides(wall)).toBe(1);
    expect(footprint(wall)).toEqual([150, 50]);
    expect(sides(rack("e", 0, 0, []))).toBe(2);
  });

  it("keeps racks inside the store on the 50 cm grid", () => {
    expect(clampRack({ ...rack("r"), x_cm: 990, y_cm: -30 }, store)).toMatchObject({ x_cm: 850, y_cm: 0 });
    expect(clampRack({ ...rack("r"), x_cm: 124, y_cm: 76 }, store)).toMatchObject({ x_cm: 100, y_cm: 100 });
  });

  it("keeps pieces inside the rack, full pieces at least 30 cm", () => {
    const fitted = fitSlots({ ...rack("r"), length_cm: 100, slots: [slot("a", "a", "full", 80, 10), slot("b", "b", "half", 140, null)] });
    expect(fitted.slots.map((s) => [s.offset_cm, s.length_cm])).toEqual([[70, 30], [100, null]]);
  });

  it("flags overlapping racks and finds a free spot", () => {
    const racks = [rack("a", 0, 0), rack("b", 100, 50), rack("c", 500, 300)];
    expect(overlapping(racks)).toEqual(new Set(["a", "b"]));
    const spot = freeSpot(rack("n"), racks, store);
    expect(overlapping([...racks, { ...rack("n"), x_cm: spot[0], y_cm: spot[1] }]).has("n")).toBe(false);
  });

  it("never lets the store shrink below its racks", () => {
    expect(minStore([rack("a", 900, 550)])).toEqual({ w: 1050, h: 650 });
    expect(minStore([])).toEqual({ w: 800, h: 600 });
  });

  it("names, adds and copies racks without copying products or ids", () => {
    const filled = { ...rack("a", 0, 0), id: 7, slots: [{ ...slot("s", "a", "full", 0, 150, product(1, "x", "1")), id: 9 }] };
    expect(nextCode([{ ...rack("x"), code: "R-01" }, { ...rack("y"), code: "R-03" }])).toBe("R-02");
    const added = newRack([filled], store);
    expect(added.code).toBe("R-01");
    expect(overlapping([filled, added]).size).toBe(0);
    const copy = copyRack(filled, [filled], store);
    expect(copy).toMatchObject({ id: null, x_cm: 200, y_cm: 0 });
    expect(copy.slots[0]).toMatchObject({ id: null, product: null });
    expect(copy.key).not.toBe(filled.key);
  });
});

describe("slots and search", () => {
  const p1 = product(1, "وست جین زنانه ۷۵۵۶", "7556");
  const r = rack("r", 0, 0, [slot("b1", "b", "full", 0, 70, p1), slot("a2", "a", "half", 90, null), slot("a1", "a", "full", 0, 80), slot("b2", "b", "half", 100, null)]);

  it("reads side a then side b, each from the right end, and picks the next empty slot", () => {
    expect(slotOrder(r).map((i) => r.slots[i].key)).toEqual(["a1", "a2", "b1", "b2"]);
    expect(r.slots[firstEmpty(r)!].key).toBe("a1");
    expect(r.slots[nextEmpty(r, 1)].key).toBe("b2");
    const full = { ...r, slots: r.slots.map((s) => ({ ...s, product: p1 })) };
    expect(nextEmpty(full, 2)).toBe(2);
  });

  it("finds racks by title or code with Persian or Latin digits", () => {
    const racks = [r, rack("o")];
    expect(findRacks(racks, "")).toBeNull();
    expect(findRacks(racks, "۷۵۵۶")).toEqual(new Set(["r"]));
    expect(findRacks(racks, "7556")).toEqual(new Set(["r"]));
    expect(findRacks(racks, "وست")).toEqual(new Set(["r"]));
    expect(findRacks(racks, "1234")).toEqual(new Set());
  });

  it("hides codes that would clutter the map", () => {
    const withProduct = { kind: "full" as const, product: p1 };
    expect(showsCode(withProduct, 40, 12, 20, true)).toBe(true);
    expect(showsCode(withProduct, 40, 12, 20, false)).toBe(false); // toggle off
    expect(showsCode(withProduct, 20, 12, 20, true)).toBe(false); // piece too short
    expect(showsCode(withProduct, 40, 8, 20, true)).toBe(false); // piece too thin
    expect(showsCode(withProduct, 40, 12, 10, true)).toBe(false); // zoomed out
    expect(showsCode({ kind: "half", product: p1 }, 0, 0, 12, true)).toBe(true);
    expect(showsCode({ kind: "full", product: null }, 40, 12, 20, true)).toBe(false);
  });
});

describe("saving", () => {
  it("sends layout fields only and maps returned ids back by key", () => {
    const layout: Layout = { branch: "SARI", ...store, door_side: "left", door_offset_cm: 0, door_width_cm: 150, version: 3,
      racks: [rack("k1", 0, 0, [slot("s1", "a", "full", 0, 150, product(1, "x", "1"))])] };
    const doc = toDoc(layout);
    expect(doc.version).toBe(3);
    expect(doc.racks[0].slots[0]).toEqual({ id: null, key: "s1", side: "a", kind: "full", offset_cm: 0, length_cm: 150 });
    const saved = applyIds(layout, { k1: 11, s1: 21 }, 4);
    expect([saved.version, saved.racks[0].id, saved.racks[0].slots[0].id]).toEqual([4, 11, 21]);
    expect(saved.racks[0].slots[0].product?.id).toBe(1);
  });
});
