# Store map («فروشگاه»)

Source: `backend/apps/store_map/` (`models.py`, `layout.py`, `codes.py`, `views.py`), `backend/apps/accounts/permissions.py`
(`store_map_access`), `backend/apps/accounts/middleware.py`, `frontend/src/pages/StorePage.tsx`, `frontend/src/features/store/`.
Prototype: `docs/design/store-map-prototype.html`. Decision: [[0011-store-map]].

## Access (checked on every endpoint; `me.store_map` drives the menu)
| Role | Menus | Map | Products on racks | Designer «طراحی نقشه» |
|---|---|---|---|---|
| `super_admin` | all | yes | yes | yes |
| `admin`, `manager` | as before | yes | yes | no |
| `sales_staff` «کارمند فروش» | فروش، مشتریان، محصولات، فروشگاه; no settings, no calls, no Pulse | yes | yes | no |
| `analyst`, `staff` | as before | read-only | no | no |
| `store_staff` «کارمند فروشگاه حضوری» | فروشگاه only | read-only | no | no |
| `sales_agent`, `content` | as before | no | no | no |

- `store_staff` reaches only `/api/auth/`, `/api/health/` and `GET /api/store-map/layout/` (middleware); every other API is 403.
- `sales_staff` never reaches `/api/system/` or `/admin/` (middleware), so no settings or user management.
- `sales_agent` is now labelled «کارشناس تماس» so that «کارمند فروش» means `sales_staff`.

## Layout
- One layout per store branch (`store_layouts.branch`, unique). Only visible store lines (not ONLINE, not `HIDDEN_SALES_LINES`);
  the page shows SARI («ساری»). Built from scratch by the super admin: no import, no seed.
- Units are cm. The floor grid is 50 cm a cell; racks snap to it. Store size 8×6 m to 45×35 m in the designer (API: 4–60 m).
- A rack has a code (unique among live racks of the layout), position (top-left, cm), rotation 0/90, length, arm (depth of
  one side). Its footprint is the length and arm × sides, each rounded up to whole cells; a rack with pieces on one side only
  is a wall rack (one side deep).
- Pieces (`store_rack_slots`): side a/b, kind full (with a length ≥ 30 cm) or half (a point), offset from the rack's right end.
  Pieces always stay inside the rack.
- Door: one wall (left/right/top/bottom), offset along it, 150 cm wide.

## Saving
- Designer: autosave about 1 s after the last change and on page hide or leave; one save in flight; the body is the whole
  layout. Status «ذخیره شد ✓» / «در حال ذخیره…» / «ذخیره نشد — تلاش دوباره» (with a retry button).
- Each save runs in one transaction with `SELECT … FOR UPDATE` on the layout and checks `version`; a stale version returns
  409 («نقشه در این فاصله در جای دیگری ذخیره شده است …») and the page offers «بارگیری دوباره». Nothing is overwritten silently.
  Autosave stops after a 409.
- New racks and pieces get ids in the save response (`ids`, by client key); the next save always carries them.
- Leaving with an unsaved change: the page saves first; if the last save failed it asks before leaving.
- Products on racks are saved per slot at once (`PATCH /api/store-map/slots/<id>/`), shown optimistically and rolled back on error.
- Nothing is hard-deleted. A removed rack or piece gets `deleted_at`; its product is cleared with a `slot_removed` history row.
  `store_slot_product_history` (slot, old/new product, user, time, reason assign/clear/slot_removed) is never cascaded.
- The whole-database `pg_dump` in `docs/runbooks/backup.md` already holds the five `store_*` tables.

## Products
- One product (product level, not variant) per piece. Search: active local products (every status except `draft`), title or
  number with Persian or Latin digits, 20 a page; with no query, the 200 most recently sold. No Elinor API calls.
- Short code = the number at the end of the title before «|» («وست جین زنانه ۷۵۵۶ | الینور» → 7556); the product id when there is
  none. The full title (before «|») shows on hover and in the popup.
- Colour: the first variant's colour; for variants with only a colour name, the colour table matched by that name. Status from
  `product_metrics`. Both may be empty.

## Map display
- Racks are a spine plus pieces, no frame. Short codes show on pieces when «کد کالا روی رگال» is on, zoom ≥ 12 px a cell, and a
  full piece is at least 26 × 9 px (half pieces always). Rack codes sit above the rack when codes are on, centred otherwise.
- «این کالا کجاست؟» matches title or short code (either digits); matching racks are outlined, the rest dimmed.
- Rack popup: drawing, slots in reading order (side a then b, from the right end), product search; after a pick the next empty
  slot is selected. Read-only for view roles. A bottom sheet on phones.
