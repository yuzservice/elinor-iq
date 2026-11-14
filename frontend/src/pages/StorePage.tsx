/** «فروشگاه»: «نقشه فروشگاه» (every allowed role; products for edit roles) and «طراحی نقشه» (super admin, autosaved). */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { toEnDigits, toFaDigits } from "../lib/dates";
import { storeMapService } from "../services/storeMap";
import { Autosave, SAVE_TEXT, type SaveStatus } from "../features/store/autosave";
import { Board, doorEdge, type RackTool } from "../features/store/Board";
import { RackDialog } from "../features/store/RackDialog";
import { RackEditor } from "../features/store/RackEditor";
import {
  STORE_MAX, STORE_MIN, ZOOM, applyIds, clampRack, copyRack, findRacks, fitSlots, fromServer, newRack, overlapping, placed, toDoc,
} from "../features/store/geometry";
import type { Access, DoorSide, Layout, MapProduct, Rack } from "../features/store/types";

const BRANCH = "SARI";
const BRANCH_LABEL = "ساری";
const GHOST = "min-h-8 cursor-pointer rounded-[10px] border border-line bg-transparent px-3 text-[12.5px] text-muted hover:text-ink disabled:opacity-35";
const DOOR_SIDES: [DoorSide, string][] = [["right", "راست"], ["left", "چپ"], ["top", "بالا"], ["bottom", "پایین"]];

const initialZoom = () => (typeof window !== "undefined" && window.innerWidth < 700 ? ZOOM.mobile : ZOOM.desktop);

function Tabs({ design }: { design: boolean }) {
  const tab = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-[34px] items-center rounded-[10px] px-3.5 text-[13px] no-underline ${isActive ? "bg-accent/15 font-semibold text-ink" : "text-muted hover:text-ink"}`;
  return (
    <nav aria-label="فروشگاه" className="flex gap-1 rounded-[14px] border border-line bg-surface p-1.5">
      <NavLink to="/store" end className={tab}>نقشه فروشگاه</NavLink>
      {design ? (
        <NavLink to="/store/design" className={tab}>
          طراحی نقشه<span className="ms-1.5 rounded-full bg-warning/15 px-[7px] py-px text-[10.5px] text-warning">فقط مدیر</span>
        </NavLink>
      ) : null}
    </nav>
  );
}

function Zoom({ zoom, setZoom }: { zoom: number; setZoom: (z: number) => void }) {
  const icon = "h-[30px] w-[30px] cursor-pointer rounded-lg border border-line bg-transparent p-0 text-[13px] text-muted hover:text-ink";
  return (
    <>
      <button type="button" className={icon} aria-label="کوچک‌نمایی" onClick={() => setZoom(Math.max(ZOOM.min, zoom - ZOOM.step))}>−</button>
      <button type="button" className={icon} aria-label="بزرگ‌نمایی" onClick={() => setZoom(Math.min(ZOOM.max, zoom + ZOOM.step))}>+</button>
    </>
  );
}

function CodesToggle({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={() => set(!on)} className={`${GHOST} ${on ? "!border-accent/50 bg-accent/15 !text-ink" : ""}`}>کد کالا روی رگال</button>
  );
}

const meters = (cm: number) => toFaDigits(String(cm / 100).replace(".", "٫"));

export function StorePage() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const access = (user?.store_map ?? null) as Access | null;
  const designing = pathname.startsWith("/store/design") && access === "design";
  const [layout, setLayout] = useState<Layout | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [zoom, setZoom] = useState(initialZoom);
  const [codesOn, setCodesOn] = useState(true);
  const [find, setFind] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<{ status: SaveStatus; message?: string }>({ status: "idle" });
  const layoutRef = useRef<Layout | null>(null);
  const autosaveRef = useRef<Autosave<ReturnType<typeof toDoc>> | null>(null);

  const apply = useCallback((next: Layout | null) => {
    layoutRef.current = next;
    setLayout(next);
  }, []);

  useEffect(() => {
    let alive = true;
    storeMapService.layout(BRANCH)
      .then((data) => {
        if (!alive) return;
        const loaded = fromServer(data.layout);
        apply(loaded);
        setSelected(loaded?.racks[0]?.key ?? null);
      })
      .catch((err) => alive && setLoadError((err as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [apply]);

  // One autosave per page visit; it builds the document from the latest layout when a save starts.
  if (!autosaveRef.current && layout && access === "design") {
    autosaveRef.current = new Autosave({
      build: () => toDoc(layoutRef.current!),
      save: (doc, version, leaving) => storeMapService.save(BRANCH, { ...doc, version }, leaving),
      onSaved: (result) => apply(applyIds(layoutRef.current!, result.ids, result.version)),
      onStatus: (next, message) => setStatus({ status: next, message }),
      version: layout.version,
    });
  }

  useEffect(() => {
    const saver = () => autosaveRef.current;
    const hide = () => {
      if (document.visibilityState === "hidden") void saver()?.flush(true);
    };
    const pagehide = () => void saver()?.flush(true);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (!saver()?.unsaved) return;
      void saver()?.flush(true);
      e.preventDefault();
      e.returnValue = "";
    };
    // In-app links: save first; ask only when the last save failed (leaving would lose the change).
    const click = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest?.("a[href]");
      const autosave = saver();
      if (!link || !autosave?.unsaved || link.getAttribute("href")?.startsWith("/store")) return;
      if ((autosave.status === "error" || autosave.status === "conflict") && !window.confirm("آخرین تغییرهای نقشه ذخیره نشده است. صفحه را ترک می‌کنید؟")) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      void autosave.flush(true);
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
      void saver()?.flush(true);
      saver()?.dispose();
    };
  }, []);

  const change = useCallback((next: Layout) => {
    apply(next);
    autosaveRef.current?.change();
  }, [apply]);

  /** Product on a slot: optimistic, rolled back if the server refuses. */
  const assign = useCallback(async (rackKey: string, slotKey: string, product: MapProduct | null) => {
    const current = layoutRef.current;
    const slot = current?.racks.find((r) => r.key === rackKey)?.slots.find((s) => s.key === slotKey);
    if (!current || !slot || slot.id === null) return;
    const before = slot.product;
    const put = (p: MapProduct | null) => {
      const now = layoutRef.current!;
      apply({ ...now, racks: now.racks.map((r) => (r.key !== rackKey ? r : { ...r, slots: r.slots.map((s) => (s.key === slotKey ? { ...s, product: p } : s)) })) });
    };
    put(product);
    try {
      const saved = await storeMapService.setSlot(slot.id, product?.id ?? null);
      put(saved.product);
    } catch (err) {
      put(before);
      throw err;
    }
  }, [apply]);

  const hits = useMemo(() => (layout && !designing ? findRacks(layout.racks, find) : null), [layout, find, designing]);
  const overlap = useMemo(() => (layout && designing ? overlapping(layout.racks) : new Set<string>()), [layout, designing]);

  if (!access) return null;
  const openRack = layout?.racks.find((r) => r.key === open) ?? null;
  const selectedRack = layout?.racks.find((r) => r.key === selected) ?? null;
  const all = (layout?.racks ?? []).reduce((acc, r) => [acc[0] + placed(r)[0], acc[1] + placed(r)[1]], [0, 0]);

  const updateRack = (rack: Rack) => {
    const cur = layoutRef.current!;
    change({ ...cur, racks: cur.racks.map((r) => (r.key === rack.key ? clampRack(fitSlots(rack), cur) : r)) });
  };
  const tool = (action: RackTool, key: string) => {
    const cur = layoutRef.current!;
    const rack = cur.racks.find((r) => r.key === key);
    if (!rack) return;
    if (action === "goods") setOpen(key);
    if (action === "rotate") updateRack({ ...rack, rotation: rack.rotation ? 0 : 90 });
    if (action === "copy") {
      const copy = copyRack(rack, cur.racks, cur);
      change({ ...cur, racks: [...cur.racks, copy] });
      setSelected(copy.key);
    }
    if (action === "delete") {
      const filled = placed(rack)[1];
      const note = filled ? ` ${toFaDigits(filled)} کالای روی آن هم برداشته می‌شود.` : "";
      if (!window.confirm(`رگال ${rack.code} حذف شود؟${note}`)) return;
      const racks = cur.racks.filter((r) => r.key !== key);
      change({ ...cur, racks });
      setSelected(racks[racks.length - 1]?.key ?? null);
    }
  };
  const addRack = () => {
    const cur = layoutRef.current!;
    const rack = newRack(cur.racks, cur);
    change({ ...cur, racks: [...cur.racks, rack] });
    setSelected(rack.key);
  };

  const title = `${designing ? "طراحی نقشه" : "نقشه"} فروشگاه ${BRANCH_LABEL}`;
  const summary = layout
    ? `${toFaDigits(layout.racks.length)} رگال · ${toFaDigits(all[1])} از ${toFaDigits(all[0])} جایگاه کالا دارد${designing && overlap.size ? ` · ${toFaDigits(overlap.size)} رگال روی هم` : ""}`
    : "";
  const statusColor = { saved: "text-sage", saving: "text-muted", dirty: "text-muted", error: "text-warning", conflict: "text-rose", idle: "text-muted" }[status.status];

  return (
    <div className="flex flex-col gap-3.5">
      <Tabs design={access === "design"} />
      <div className="flex flex-wrap items-end justify-between gap-2.5">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl font-extrabold text-ink">{title}</h1>
          <span className="text-[12.5px] text-muted">
            {designing ? "ساخت و چیدمان رگال‌ها با دو المان ثابت: رگال کامل و نیم‌رگال." : access === "view" ? "روی هر رگال بزنید تا کالاهایش را ببینید." : "روی هر رگال بزنید تا کالاهایش را ببینید یا کالا اضافه کنید."}
          </span>
        </div>
        <span className="text-[12.5px] text-muted">{summary}</span>
      </div>

      {loading ? <div className="p-8 text-sm text-muted">در حال دریافت اطلاعات...</div> : null}
      {loadError ? <div role="alert" className="rounded-xl border border-line bg-surface p-4 text-sm text-rose">{loadError}</div> : null}

      {!loading && !loadError && !layout ? (
        designing ? <EmptyDesigner onCreate={async (w, h) => {
          const created: Layout = { branch: BRANCH, width_cm: w, height_cm: h, door_side: "left", door_offset_cm: Math.max(0, Math.round(h / 200) * 100 - 100), door_width_cm: 150, version: null, racks: [] };
          const result = await storeMapService.save(BRANCH, toDoc(created));
          apply({ ...created, version: result.version });
        }} /> : (
          <div className="rounded-[18px] border border-line bg-surface p-6 text-sm text-muted">
            هنوز نقشه‌ای برای فروشگاه {BRANCH_LABEL} ساخته نشده است.{access === "design" ? <> از «<NavLink to="/store/design" className="text-accent">طراحی نقشه</NavLink>» شروع کنید.</> : null}
          </div>
        )
      ) : null}

      {layout ? (
        <section aria-label="نقشه کف" className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-surface px-4 py-3.5 max-sm:px-2.5">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-elevated px-2.5 py-2">
            {designing ? (
              <>
                <button type="button" className={GHOST} onClick={addRack}>+ رگال جدید</button>
                <span role="status" className={`text-[11.5px] ${statusColor}`}>{SAVE_TEXT[status.status]}</span>
                {status.status === "error" ? <button type="button" className={GHOST} onClick={() => void autosaveRef.current?.flush()}>تلاش دوباره</button> : null}
                {status.status === "conflict" ? (
                  <>
                    <span className="text-[11.5px] text-rose">{status.message}</span>
                    <button type="button" className={GHOST} onClick={() => window.location.reload()}>بارگیری دوباره</button>
                  </>
                ) : null}
                <DoorPicker layout={layout} onChange={change} />
                <span className="ms-1.5 text-[11.5px] text-muted max-md:hidden">رگال را بکشید · لبه‌ها و گوشه آبی اندازه · لبه راست و پایین نقشه اندازه فروشگاه</span>
              </>
            ) : (
              <>
                <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="این کالا کجاست؟ نام یا کد، مثلاً ۷۵۵۶" aria-label="پیدا کردن کالا روی نقشه"
                  className="min-h-9 max-w-[320px] flex-[1_1_220px] rounded-[10px] border border-line bg-surface px-3 text-[13px] text-ink outline-none focus:border-accent" />
                {hits ? <span className="text-xs text-muted">{hits.size ? `${toFaDigits(hits.size)} رگال پیدا شد` : "روی هیچ رگالی نیست"}</span> : null}
              </>
            )}
            <span className="flex-1" />
            <CodesToggle on={codesOn} set={setCodesOn} />
            <span className="text-xs text-muted">{meters(layout.width_cm)} × {meters(layout.height_cm)} متر</span>
            <Zoom zoom={zoom} setZoom={setZoom} />
          </div>
          <Board
            layout={layout}
            zoom={zoom}
            codesOn={codesOn}
            hits={hits}
            onOpen={setOpen}
            design={designing ? { selected, overlap, canDelete: true, onSelect: setSelected, onChange: change, onTool: tool } : undefined}
          />
          {!designing ? <span className="text-[11.5px] text-muted">روی هر رگال بزنید تا کالاهایش را ببینید{access === "view" ? "" : " یا کالا اضافه کنید"}.</span> : null}
          {designing && !layout.racks.length ? <span className="text-[12.5px] text-muted">نقشه خالی است؛ با «+ رگال جدید» اولین رگال را اضافه کنید.</span> : null}
        </section>
      ) : null}

      {designing && selectedRack ? (
        <RackEditor key={selectedRack.key} rack={selectedRack} canDelete onChange={updateRack} onGoods={() => setOpen(selectedRack.key)}
          onCopy={() => tool("copy", selectedRack.key)} onDelete={() => tool("delete", selectedRack.key)} />
      ) : null}

      {openRack ? (
        <RackDialog rack={openRack} readOnly={access === "view"} onClose={() => setOpen(null)} onAssign={(slotKey, product) => assign(openRack.key, slotKey, product)} />
      ) : null}
    </div>
  );
}

function DoorPicker({ layout, onChange }: { layout: Layout; onChange: (next: Layout) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted">
      ورودی
      <select value={layout.door_side} aria-label="دیوار ورودی"
        onChange={(e) => {
          const next = { ...layout, door_side: e.target.value as DoorSide };
          onChange({ ...next, door_offset_cm: Math.min(next.door_offset_cm, doorEdge(next) - next.door_width_cm) });
        }}
        className="min-h-8 rounded-lg border border-line bg-surface px-2 text-xs text-ink">
        {DOOR_SIDES.map(([side, label]) => <option key={side} value={side}>{label}</option>)}
      </select>
    </label>
  );
}

function EmptyDesigner({ onCreate }: { onCreate: (widthCm: number, heightCm: number) => Promise<void> }) {
  const [width, setWidth] = useState("18");
  const [height, setHeight] = useState("14");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const parse = (v: string) => Math.round(Number(toEnDigits(v).replace("٫", ".")) * 2) * 50;
  const w = parse(width), h = parse(height);
  const valid = w >= STORE_MIN.w && w <= STORE_MAX.w && h >= STORE_MIN.h && h <= STORE_MAX.h;
  const input = "min-h-9 w-24 rounded-[10px] border border-line bg-elevated px-3 text-[13px] text-ink outline-none focus:border-accent";
  return (
    <section className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-5">
      <h2 className="m-0 text-[15px] font-semibold text-ink">هنوز نقشه‌ای ساخته نشده است</h2>
      <p className="m-0 text-[12.5px] text-muted">اول اندازه فروشگاه را وارد کنید؛ بعد اولین رگال را اضافه کنید. اندازه را بعداً با کشیدن لبه نقشه هم می‌شود عوض کرد.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">عرض (متر)<input className={input} inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-xs text-muted">طول (متر)<input className={input} inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} /></label>
        <button type="button" disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onCreate(w, h);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="min-h-9 cursor-pointer rounded-[10px] border-0 bg-accent px-4 text-[13px] font-semibold text-on-accent disabled:opacity-40">
          ساخت نقشه
        </button>
      </div>
      <span className="text-[11.5px] text-faint">بین {toFaDigits(STORE_MIN.w / 100)}×{toFaDigits(STORE_MIN.h / 100)} و {toFaDigits(STORE_MAX.w / 100)}×{toFaDigits(STORE_MAX.h / 100)} متر.</span>
      {error ? <span role="alert" className="text-[12.5px] text-rose">{error}</span> : null}
    </section>
  );
}
