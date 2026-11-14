# 0011: Store map with racks, product placement and two new roles

Date: 2026-11-14. Status: implemented on `feature/store-map`, awaiting owner review. Rules: [[store-map]].

- The owner wants staff to find a product on the shop floor and to keep rack contents current. A new app `apps/store_map`
  holds one layout per store branch, starting with Sari; the super admin draws it in the app («طراحی نقشه»). No import, no seed.
- Two roles: `sales_staff` «کارمند فروش» (report menus like a manager, plus putting products on racks; no settings) and
  `store_staff` «کارمند فروشگاه حضوری» (the map only, read-only). `sales_agent` is relabelled «کارشناس تماس».
- Saving reliability is the owner's priority: the designer autosaves the whole layout in one transaction guarded by a version
  (409 on conflict, never a silent overwrite); product changes save per slot immediately with history.
- Racks and pieces soft-delete so history rows always keep their target. Products are referenced without a DB constraint so
  catalog sync is never blocked by the map.
- The prototype's «پشتیبان طرح» (JSON export/import) and browser storage are not built: the server and the database backup are
  the store of record.
- Short code = trailing title number, matching how staff already name products; product id as fallback.

## Rack templates (2026-11-14)
- Racks are now instances of templates, so the owner draws a rack shape once and places it many times; a template change applies
  to every rack built from it. Two kinds: line (the spine with full/half pieces) and hub (a post with stepped arms; each step
  is one product, e.g. a cross = 4 arms × 2 steps).
- Slots stay per rack (one per template element) so products and history did not move. Removing an element that still holds a
  product is refused (409 with a Persian message) instead of clearing it silently; a template in use cannot be deleted.
- Template saves share the layout version with the designer, so one 409 flow covers both.
- Existing racks were grouped by identical geometry into line templates (migration 0002); products and history kept.
- Codes must be readable without zooming: default 44 px per 50 cm (32 on phones); hub racks show one code list per arm.
