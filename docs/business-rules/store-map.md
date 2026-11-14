# Store map («فروشگاه»)

Source: `backend/apps/store_map/` (`models.py`, `templates.py` (every template rule), `layout.py`, `codes.py`, `views.py`), `backend/apps/accounts/permissions.py`
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
- Every rack is an instance of a **rack template** (`store_rack_templates`, per layout). A template change applies to all its
  racks. A rack has a code (unique among live racks of the layout), position (top-left, cm), rotation and its template; the
  template never changes on an existing rack (place a new rack instead).
- **Line template**: a spine, length 50–1200 cm and arm 20–150 cm (depth of one side), with pieces (`store_template_pieces`):
  side a/b, kind full (with a length ≥ 30 cm) or half (a point), offset from the right end, always inside the template; at
  least one piece. Footprint: length and arm × sides, each rounded up to whole cells (at least 2 × 1); one-sided = wall rack.
  Rotation 0/90.
- **Hub template**: a centre post (6 cm radius) with 1–8 arms (`store_template_arms`): angle 0–315 in 45° steps (0 = right,
  counter-clockwise; one arm per direction), length 20–90 cm, 1–5 steps; each step is one product slot (step 1 next to the
  post). A cross rack = 4 arms × 2 steps = 8 products. Footprint: the bounding box of the rotated arms plus the post, rounded
  up to whole cells (at least 1 × 1). Rotation 0/90/180/270.
- Slots stay per rack (`store_rack_slots`): one live slot per template element (`template_piece`, or `template_arm` +
  `step_index`), so products and history are per rack. Copying a rack copies its template and rotation; the copy's slots start
  empty.
- Saving a template (super admin, under the layout version, one transaction) syncs every rack built from it: new pieces/steps
  get slots, removed ones are soft-deleted. Removing a piece, an arm or a step that holds a product on any rack is refused with
  409 «blocked» and a message naming it and the racks, e.g. «پله ۲ این بازو روی رگال‌های نقشه کالا دارد (رگال X-2). اول کالا را
  بردارید.»; nothing changes. A template used by any rack cannot be deleted.
- Migration `store_map.0002` turned the racks drawn before templates into line templates: one per distinct geometry (length,
  arm, pieces), named «رگال وسط دوطرفه / رگال کامل و نیم / رگال دیواری {طول} متری»; racks and their live slots were linked,
  products and history untouched. The old rack/slot geometry columns are kept but no longer read. Reversible only while no rack
  was added after 0002 (later racks have no length/arm); otherwise one-way.
- Door: one wall (left/right/top/bottom), offset along it, 150 cm wide.

## Saving
- Designer: autosave about 1 s after the last change and on page hide or leave; one save in flight; the body is the whole
  layout. Status «ذخیره شد ✓» / «در حال ذخیره…» / «ذخیره نشد — تلاش دوباره» (with a retry button).
- Each save runs in one transaction with `SELECT … FOR UPDATE` on the layout and checks `version`; a stale version returns
  409 («نقشه در این فاصله در جای دیگری ذخیره شده است …») and the page offers «بارگیری دوباره». Nothing is overwritten silently.
  Autosave stops after a 409.
- New racks come back with their ids and slots (`created`, by client key); new pieces/arms with their ids (`ids`). The next
  save always carries them. Designer and template autosave share the layout version and one save queue.
- A refused template change («blocked») is reported in the template page's message bar and the saved template is put back.
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
- Readable without zooming: 44 px per 50 cm on desktop, 32 on mobile (zoom 14–64); the board grows and scrolls.
- Line racks: a spine plus pieces, no frame; short codes on pieces at 9–14 px when «کد کالا روی رگال» is on and a full piece is
  at least 24 × 10 px (half pieces always).
- Hub racks: the arms with a coloured dot per step; one label per arm just outside its tip listing that arm's step codes top to
  bottom in step order («—» for an empty step); the rack code at the top-right corner.
- «این کالا کجاست؟» matches title or short code (either digits); matching racks are outlined, the rest dimmed.
- Rack popup: the drawing (line: spine and pieces; hub: a 260 px top view that never shrinks, a button per step with its code or
  «+» on its own arm, arm numbers at the tips), the slots in reading order («طرف الف · رگال کامل», «بازوی ۱ (راست) · پله ۲»),
  product search; after a pick the next empty slot is selected. Read-only for view roles. A bottom sheet on phones. Codes on
  product colours use dark or white text by the colour's luminance.

## Pages
- «نقشه فروشگاه» (every allowed role), «طراحی نقشه» and «قالب رگال‌ها» (super admin, badge «فقط مدیر»).
- Designer: «+ رگال» opens a template picker; rack tools کالاها، قالب (opens its template)، کپی، چرخش، حذف; racks are dragged,
  their size comes from the template; the store's right and bottom edges and the door are dragged.
- «قالب رگال‌ها»: library with mini drawings and the number of racks using each template; «+ قالب جدید» with starters
  (صلیبی ۴ بازو، سه بازو، دو بازو روبه‌رو، بازوی دیواری، رگال خطی); copy and delete; the line editor (pieces, length and depth
  handles) or the hub editor (drag an arm tip: 45° snap and length; − / + steps; copy/delete arm; side view of the stepped arm);
  message bar «تغییر این قالب روی همه‌ی N رگال … اعمال … می‌شود» and the blocking errors.
