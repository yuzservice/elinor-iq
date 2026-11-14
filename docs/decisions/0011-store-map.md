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
