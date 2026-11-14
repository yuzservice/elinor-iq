import type { ProductStatus } from "../products/types";

export type Side = "a" | "b";
export type Kind = "full" | "half";
export type Access = "design" | "edit" | "view";
export type TemplateKind = "line" | "hub";
export type Rotation = 0 | 90 | 180 | 270;

export type MapProduct = { id: number; title: string; short_code: string; color: string | null; status: ProductStatus | null };

/** Line template element. `key` is stable on the client; `id` is null until the template is saved. */
export type TemplatePiece = { id: number | null; key: string; side: Side; kind: Kind; offset_cm: number; length_cm: number | null };
/** Hub template element: an arm at `angle_deg` (0 = right, counter-clockwise), stepped; step 0 is next to the post. */
export type TemplateArm = { id: number | null; key: string; angle_deg: number; length_cm: number; steps: number };

export type Template = {
  id: number;
  name: string;
  kind: TemplateKind;
  length_cm: number | null;
  arm_cm: number | null;
  pieces: TemplatePiece[];
  arms: TemplateArm[];
  /** Racks on the map built from this template. */
  racks: number;
};

/** A rack's slot: one per template element (a piece, or one step of an arm). */
export type Slot = { id: number; piece_id: number | null; arm_id: number | null; step: number | null; product: MapProduct | null };

export type Rack = {
  id: number | null;
  key: string;
  code: string;
  x_cm: number;
  y_cm: number;
  rotation: Rotation;
  template_id: number;
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
  templates: Template[];
  racks: Rack[];
};

type ServerTemplate = Omit<Template, "pieces" | "arms"> & {
  pieces: Omit<TemplatePiece, "key">[];
  arms: Omit<TemplateArm, "key">[];
};
export type ServerRack = Omit<Rack, "key" | "id"> & { id: number; footprint_cm: [number, number] | null };

export type LayoutResponse = {
  branch: string;
  access: Access | null;
  layout: (Omit<Layout, "racks" | "version" | "templates"> & { version: number; templates: ServerTemplate[]; racks: ServerRack[] }) | null;
};

export type TemplateResult = { version: number; ids: Record<string, number>; template: ServerTemplate; racks: { id: number; slots: Slot[] }[] };

export type ProductPage = { results: MapProduct[]; page: number; pages: number; count: number };
