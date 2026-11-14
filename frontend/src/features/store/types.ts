import type { ProductStatus } from "../products/types";

export type Side = "a" | "b";
export type Kind = "full" | "half";
export type Access = "design" | "edit" | "view";

export type MapProduct = { id: number; title: string; short_code: string; color: string | null; status: ProductStatus | null };

/** `key` is stable on the client (server rows get `s<id>` / `r<id>`); `id` is null until the first save. */
export type Slot = { id: number | null; key: string; side: Side; kind: Kind; offset_cm: number; length_cm: number | null; product: MapProduct | null };

export type Rack = {
  id: number | null;
  key: string;
  code: string;
  x_cm: number;
  y_cm: number;
  rotation: 0 | 90;
  length_cm: number;
  arm_cm: number;
  slots: Slot[];
};

export type DoorSide = "left" | "right" | "top" | "bottom";

export type Layout = {
  branch: string;
  width_cm: number;
  height_cm: number;
  door_side: DoorSide;
  door_offset_cm: number;
  door_width_cm: number;
  version: number | null;
  updated_at?: string;
  updated_by?: string | null;
  racks: Rack[];
};

type ServerSlot = Omit<Slot, "key" | "id"> & { id: number };
type ServerRack = Omit<Rack, "key" | "id" | "slots"> & { id: number; slots: ServerSlot[] };

export type LayoutResponse = {
  branch: string;
  access: Access | null;
  layout: (Omit<Layout, "racks" | "version"> & { version: number; racks: ServerRack[] }) | null;
};

export type ProductPage = { results: MapProduct[]; page: number; pages: number; count: number };
