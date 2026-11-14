/** «فروشگاه»: «نقشه فروشگاه» (every allowed role; products for edit roles), «طراحی نقشه» and «قالب رگال‌ها» (super admin).
 * The designer and the template editor autosave through one queue and share the layout version (one 409 flow). */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { toEnDigits, toFaDigits } from "../lib/dates";
import { storeMapService } from "../services/storeMap";
import { Autosave, SAVE_TEXT, createSerial, type SaveStatus, type VersionRef } from "../features/store/autosave";
import { Board, doorEdge, type RackTool } from "../features/store/Board";
import { RackDialog } from "../features/store/RackDialog";
import { TemplateMini, TemplatesPanel, templateMeta } from "../features/store/TemplatesPanel";
import {
  STORE_MAX, STORE_MIN, ZOOM, applyCreated, applyTemplateResult, byId, clampRack, copyRack, findRacks, fromServer, newRack, nextRotation, overlapping,
  placed, templateFromServer, toDoc, toTemplateDoc,
} from "../features/store/geometry";
import type { Access, DoorSide, Layout, MapProduct, Template } from "../features/store/types";

const BRANCH = "SARI";
const BRANCH_LABEL = "ساری";
const GHOST = "min-h-8 cursor-pointer rounded-[10px] border border-line bg-transparent px-3 text-[12.5px] text-muted hover:text-ink disabled:opacity-35";
const DOOR_SIDES: [DoorSide, string][] = [["right", "راست"], ["left", "چپ"], ["top", "بالا"], ["bottom", "پایین"]];
const STATUS_COLOR: Record<SaveStatus, string> = { saved: "text-sage", saving: "text-muted", dirty: "text-muted", error: "text-warning", conflict: "text-rose", idle: "text-muted" };

type Saver = Pick<Autosave<never>, "change" | "flush" | "unsaved" | "status" | "dispose">;

const initialZoom = () => (typeof window !== "undefined" && window.innerWidth < 700 ? ZOOM.mobile : ZOOM.desktop);
const meters = (cm: number) => toFaDigits(String(cm / 100).replace(".", "٫"));

function Tabs({ design }: { design: boolean }) {
  const tab = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-[34px] items-center whitespace-nowrap rounded-[10px] px-3.5 text-[13px] no-underline ${isActive ? "bg-accent/15 font-semibold text-ink" : "text-muted hover:text-ink"}`;
  const badge = <span className="ms-1.5 rounded-full bg-warning/15 px-[7px] py-px text-[10.5px] text-warning">فقط مدیر</span>;
  return (
    <nav aria-label="فروشگاه" className="flex gap-1 overflow-x-auto rounded-[14px] border border-line bg-surface p-1.5">
      <NavLink to="/store" end className={tab}>نقشه فروشگاه</NavLink>
      {design ? <NavLink to="/store/design" className={tab}>طراحی نقشه{badge}</NavLink> : null}
      {design ? <NavLink to="/store/templates" className={tab}>قالب رگال‌ها{badge}</NavLink> : null}
    </nav>
  );
}

function SaveState({ status, onRetry }: { status: { status: SaveStatus; message?: string }; onRetry: () => void }) {
  return (
    <>
      <span role="status" className={`text-[11.5px] ${STATUS_COLOR[status.status]}`}>{SAVE_TEXT[status.status]}</span>
      {status.status === "error" ? <button type="button" className={GHOST} onClick={onRetry}>تلاش دوباره</button> : null}
      {status.status === "conflict" ? (
        <>
          <span className="text-[11.5px] text-rose">{status.message}</span>
          <button type="button" className={GHOST} onClick={() => window.location.reload()}>بارگیری دوباره</button>
        </>
      ) : null}
    </>
  );
}

export function StorePage() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const access = (user?.store_map ?? null) as Access | null;
  const view = access === "design" && pathname.startsWith("/store/design") ? "design" : access === "design" && pathname.startsWith("/store/templates") ? "templates" : "map";
  const [layout, setLayout] = useState<Layout | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [zoom, setZoom] = useState(initialZoom);
  const [codesOn, setCodesOn] = useState(true);
  const [find, setFind] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [layoutStatus, setLayoutStatus] = useState<{ status: SaveStatus; message?: string }>({ status: "idle" });
  const [templateStatus, setTemplateStatus] = useState<{ status: SaveStatus; message?: string }>({ status: "idle" });
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const version = useRef<VersionRef>({ current: null }).current;
  const serial = useRef(createSerial()).current;
  const dirtyTemplates = useRef(new Set<number>());
  const saversRef = useRef<{ layout: Saver; templates: Saver } | null>(null);

  const apply = useCallback((next: Layout | null) => {
    layoutRef.current = next;
    setLayout(next);
  }, []);

  const load = useCallback(async () => {
    const data = await storeMapService.layout(BRANCH);
    const loaded = fromServer(data.layout);
    version.current = loaded?.version ?? null;
    apply(loaded);
    return loaded;
  }, [apply, version]);

  useEffect(() => {
    let alive = true;
    load()
      .then((loaded) => alive && setSelected(loaded?.racks[0]?.key ?? null))
      .catch((err) => alive && setLoadError((err as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [load]);

  if (!saversRef.current && access === "design") {
    saversRef.current = {
      layout: new Autosave({
        build: () => toDoc(layoutRef.current!),
        save: (doc, v, leaving) => storeMapService.save(BRANCH, { ...doc, version: v }, leaving),
        onSaved: (result) => apply(applyCreated(layoutRef.current!, result.created, result.version)),
        onStatus: (status, text) => setLayoutStatus({ status, message: text }),
        version, serial,
      }),
      templates: new Autosave({
        build: () => [...dirtyTemplates.current],
        // One request per changed template, each document built from the latest state and the latest version.
        save: async (ids, v, leaving) => {
          let current = v;
          for (const id of ids) {
            const t = layoutRef.current?.templates.find((x) => x.id === id);
            if (!t) {
              dirtyTemplates.current.delete(id);
              continue;
            }
            const result = await storeMapService.saveTemplate(BRANCH, id, toTemplateDoc(t, current), leaving);
            current = result.version;
            version.current = current;
            dirtyTemplates.current.delete(id);
            apply(applyTemplateResult(layoutRef.current!, result));
          }
          return { version: current ?? 0 };
        },
        onSaved: () => undefined,
        onStatus: (status, text) => setTemplateStatus({ status, message: text }),
        // A refused removal: show why and put the saved template back.
        onBlocked: (text) => {
          dirtyTemplates.current.clear();
          setMessage({ text, bad: true });
          void load();
        },
        version, serial,
      }),
    };
  }

  useEffect(() => {
    const savers = () => (saversRef.current ? [saversRef.current.layout, saversRef.current.templates] : []);
    const unsaved = () => savers().some((s) => s.unsaved);
    const flushAll = () => savers().forEach((s) => void s.flush(true));
    const hide = () => document.visibilityState === "hidden" && flushAll();
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (!unsaved()) return;
      flushAll();
      e.preventDefault();
      e.returnValue = "";
    };
    // In-app links: save first; ask only when the last save failed (leaving would lose the change).
    const click = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest?.("a[href]");
      if (!link || !unsaved()) return;
      if (savers().some((s) => s.unsaved && (s.status === "error" || s.status === "conflict")) && !window.confirm("آخرین تغییرهای نقشه ذخیره نشده است. صفحه را ترک می‌کنید؟")) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      flushAll();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", flushAll);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", flushAll);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
      flushAll();
      savers().forEach((s) => s.dispose());
    };
  }, []);

  const change = useCallback((next: Layout) => {
    apply(next);
    saversRef.current?.layout.change();
  }, [apply]);

  /** A template edit: autosaved; racks built from it are kept inside the store if the template grew. */
  const changeTemplate = useCallback((t: Template) => {
    const cur = layoutRef.current!;
    const templates = cur.templates.map((x) => (x.id === t.id ? t : x));
    const map = byId(templates);
    const racks = cur.racks.map((r) => (r.template_id === t.id ? clampRack(r, map, cur) : r));
    const moved = racks.some((r, i) => r !== cur.racks[i] && (r.x_cm !== cur.racks[i].x_cm || r.y_cm !== cur.racks[i].y_cm));
    apply({ ...cur, templates, racks });
    setMessage(null);
    dirtyTemplates.current.add(t.id);
    saversRef.current?.templates.change();
    if (moved) saversRef.current?.layout.change();
  }, [apply]);

  /** Product on a slot: optimistic, rolled back if the server refuses. */
  const assign = useCallback(async (rackKey: string, slotId: number, product: MapProduct | null) => {
    const current = layoutRef.current;
    const before = current?.racks.find((r) => r.key === rackKey)?.slots.find((s) => s.id === slotId)?.product ?? null;
    const put = (p: MapProduct | null) => {
      const now = layoutRef.current!;
      apply({ ...now, racks: now.racks.map((r) => (r.key !== rackKey ? r : { ...r, slots: r.slots.map((s) => (s.id === slotId ? { ...s, product: p } : s)) })) });
    };
    put(product);
    try {
      const saved = await storeMapService.setSlot(slotId, product?.id ?? null);
      put(saved.product);
    } catch (err) {
      put(before);
      throw err;
    }
  }, [apply]);

  const templates = useMemo(() => byId(layout?.templates ?? []), [layout?.templates]);
  const hits = useMemo(() => (layout && view === "map" ? findRacks(layout.racks, find) : null), [layout, find, view]);
  const overlap = useMemo(() => (layout && view === "design" ? overlapping(layout.racks, templates) : new Set<string>()), [layout, view, templates]);

  if (!access) return null;
  const openRack = layout?.racks.find((r) => r.key === open) ?? null;
  const openTemplate = openRack ? templates.get(openRack.template_id) : undefined;
  const all = (layout?.racks ?? []).reduce((acc, r) => {
    const [total, filled] = placed(r, templates.get(r.template_id));
    return [acc[0] + total, acc[1] + filled];
  }, [0, 0]);

  const tool = (action: RackTool, key: string) => {
    const cur = layoutRef.current!;
    const rack = cur.racks.find((r) => r.key === key);
    if (!rack) return;
    const t = templates.get(rack.template_id);
    if (action === "goods") setOpen(key);
    if (action === "template") navigate(`/store/templates?t=${rack.template_id}`);
    if (action === "rotate" && t) change({ ...cur, racks: cur.racks.map((r) => (r.key === key ? clampRack({ ...r, rotation: nextRotation(t, r.rotation) }, templates, cur) : r)) });
    if (action === "copy") {
      const copy = copyRack(rack, cur.racks, templates, cur);
      change({ ...cur, racks: [...cur.racks, copy] });
      setSelected(copy.key);
    }
    if (action === "delete") {
      const filled = placed(rack, t)[1];
      const note = filled ? ` ${toFaDigits(filled)} کالای روی آن هم برداشته می‌شود.` : "";
      if (!window.confirm(`رگال ${rack.code} حذف شود؟${note}`)) return;
      const racks = cur.racks.filter((r) => r.key !== key);
      change({ ...cur, racks });
      setSelected(racks[racks.length - 1]?.key ?? null);
    }
  };
  const addRack = (t: Template) => {
    const cur = layoutRef.current!;
    const rack = newRack(t, cur.racks, templates, cur);
    change({ ...cur, racks: [...cur.racks, rack] });
    setSelected(rack.key);
    setAdding(false);
  };
  const createTemplate = async (name: string, shape: Pick<Template, "kind" | "length_cm" | "arm_cm" | "pieces" | "arms">) => {
    await saversRef.current?.templates.flush();
    const draft: Template = { id: 0, name, racks: 0, ...shape };
    const result = await serial(() => storeMapService.createTemplate(BRANCH, toTemplateDoc(draft, version.current)));
    version.current = result.version;
    const cur = layoutRef.current!;
    apply({ ...cur, version: result.version, templates: [...cur.templates, templateFromServer(result.template)] });
    setParams({ t: String(result.template.id) });
    setMessage({ text: "قالب ساخته شد. شکلش را با کشیدن تنظیم کنید؛ بعد در «طراحی نقشه» از «+ رگال» آن را روی نقشه بگذارید.", bad: false });
  };
  const deleteTemplate = async (t: Template) => {
    if (!window.confirm(`قالب «${t.name}» حذف شود؟`)) return;
    try {
      await saversRef.current?.templates.flush();
      dirtyTemplates.current.delete(t.id);
      const result = await serial(() => storeMapService.deleteTemplate(BRANCH, t.id, version.current));
      version.current = result.version;
      const cur = layoutRef.current!;
      apply({ ...cur, version: result.version, templates: cur.templates.filter((x) => x.id !== t.id) });
      setParams({});
      setMessage(null);
    } catch (err) {
      setMessage({ text: (err as Error).message, bad: true });
    }
  };

  const titles = {
    map: [`نقشه فروشگاه ${BRANCH_LABEL}`, access === "view" ? "روی هر رگال بزنید تا کالاهایش را ببینید." : "روی هر رگال بزنید تا کالاهایش را ببینید یا کالا اضافه کنید."],
    design: [`طراحی نقشه فروشگاه ${BRANCH_LABEL}`, "رگال‌ها را از قالب‌ها روی نقشه بچینید. شکل هر رگال در «قالب رگال‌ها» ساخته می‌شود."],
    templates: ["قالب رگال‌ها", "هر قالب یک بار ساخته می‌شود و هر چند بار روی نقشه می‌نشیند؛ تغییر قالب روی همه‌ی رگال‌های آن اعمال می‌شود."],
  }[view];
  const summary = !layout ? "" : view === "templates" ? `${toFaDigits(layout.templates.length)} قالب`
    : `${toFaDigits(layout.racks.length)} رگال · ${toFaDigits(all[1])} از ${toFaDigits(all[0])} جایگاه کالا دارد${view === "design" && overlap.size ? ` · ${toFaDigits(overlap.size)} رگال روی هم` : ""}`;
  const selectedTemplate = Number(params.get("t")) || null;

  return (
    <div className="flex flex-col gap-3.5">
      <Tabs design={access === "design"} />
      <div className="flex flex-wrap items-end justify-between gap-2.5">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl font-extrabold text-ink">{titles[0]}</h1>
          <span className="text-[12.5px] text-muted">{titles[1]}</span>
        </div>
        <span className="flex items-center gap-2 text-[12.5px] text-muted">
          {view === "templates" ? <SaveState status={templateStatus} onRetry={() => void saversRef.current?.templates.flush()} /> : null}
          {summary}
        </span>
      </div>

      {loading ? <div className="p-8 text-sm text-muted">در حال دریافت اطلاعات...</div> : null}
      {loadError ? <div role="alert" className="rounded-xl border border-line bg-surface p-4 text-sm text-rose">{loadError}</div> : null}

      {!loading && !loadError && !layout ? (
        view !== "map" ? <EmptyDesigner onCreate={async (w, h) => {
          const created: Layout = { branch: BRANCH, width_cm: w, height_cm: h, door_side: "left", door_offset_cm: Math.max(0, Math.round(h / 200) * 100 - 100), door_width_cm: 150, version: null, templates: [], racks: [] };
          const result = await serial(() => storeMapService.save(BRANCH, toDoc(created)));
          version.current = result.version;
          apply({ ...created, version: result.version });
        }} /> : (
          <div className="rounded-[18px] border border-line bg-surface p-6 text-sm text-muted">
            هنوز نقشه‌ای برای فروشگاه {BRANCH_LABEL} ساخته نشده است.{access === "design" ? <> از «<NavLink to="/store/design" className="text-accent">طراحی نقشه</NavLink>» شروع کنید.</> : null}
          </div>
        )
      ) : null}

      {layout && view === "templates" ? (
        <TemplatesPanel templates={layout.templates} racks={layout.racks} selectedId={selectedTemplate}
          onSelect={(id) => (setParams({ t: String(id) }), setMessage(null))} onCreate={createTemplate} onChange={changeTemplate} onDelete={deleteTemplate}
          message={message} onMessage={(text, bad) => setMessage({ text, bad })} />
      ) : null}

      {layout && view !== "templates" ? (
        <section aria-label="نقشه کف" className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-surface px-4 py-3.5 max-sm:px-2.5">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-elevated px-2.5 py-2">
            {view === "design" ? (
              <>
                <span className="relative">
                  <button type="button" aria-expanded={adding} onClick={() => setAdding(!adding)}
                    className="min-h-8 cursor-pointer rounded-[10px] border-0 bg-accent px-3.5 text-[13px] font-semibold text-on-accent">+ رگال</button>
                  {adding ? (
                    <div className="absolute right-0 top-[calc(100%+6px)] z-20 flex w-[270px] flex-col gap-1 rounded-[14px] border border-accent/35 bg-surface p-2 shadow-soft">
                      <span className="px-1 py-0.5 text-[11.5px] text-muted">از کدام قالب؟</span>
                      {layout.templates.map((t) => (
                        <button key={t.id} type="button" onClick={() => addRack(t)}
                          className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-transparent bg-elevated px-2 py-[7px] text-start font-[inherit] text-[12.5px] text-ink hover:border-accent/40">
                          <TemplateMini t={t} size={40} />
                          <span className="flex flex-col gap-px"><b className="font-semibold">{t.name}</b><span className="text-[11px] text-muted">{templateMeta(t)}</span></span>
                        </button>
                      ))}
                      <button type="button" className={`${GHOST} mt-0.5`} onClick={() => navigate("/store/templates")}>قالب تازه بسازید ←</button>
                    </div>
                  ) : null}
                </span>
                <SaveState status={layoutStatus} onRetry={() => void saversRef.current?.layout.flush()} />
                <DoorPicker layout={layout} onChange={change} />
                <span className="text-[11.5px] text-muted max-md:hidden">رگال را بکشید · لبه راست و پایین نقشه اندازه فروشگاه</span>
              </>
            ) : (
              <>
                <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="این کالا کجاست؟ نام یا کد، مثلاً ۷۵۵۶" aria-label="پیدا کردن کالا روی نقشه"
                  className="min-h-9 max-w-[320px] flex-[1_1_220px] rounded-[10px] border border-line bg-surface px-3 text-[13px] text-ink outline-none focus:border-accent" />
                {hits ? <span className="text-xs text-muted">{hits.size ? `${toFaDigits(hits.size)} رگال پیدا شد` : "روی هیچ رگالی نیست"}</span> : null}
              </>
            )}
            <span className="flex-1" />
            <button type="button" aria-pressed={codesOn} onClick={() => setCodesOn(!codesOn)} className={`${GHOST} ${codesOn ? "!border-accent/50 bg-accent/15 !text-ink" : ""}`}>کد کالا روی رگال</button>
            <span className="text-xs text-muted">{meters(layout.width_cm)} × {meters(layout.height_cm)} متر</span>
            <button type="button" aria-label="کوچک‌نمایی" onClick={() => setZoom(Math.max(ZOOM.min, zoom - ZOOM.step))} className="h-[30px] w-[30px] cursor-pointer rounded-lg border border-line bg-transparent p-0 text-sm text-muted hover:text-ink">−</button>
            <button type="button" aria-label="بزرگ‌نمایی" onClick={() => setZoom(Math.min(ZOOM.max, zoom + ZOOM.step))} className="h-[30px] w-[30px] cursor-pointer rounded-lg border border-line bg-transparent p-0 text-sm text-muted hover:text-ink">+</button>
          </div>
          <Board layout={layout} templates={templates} zoom={zoom} codesOn={codesOn} hits={hits} onOpen={setOpen}
            design={view === "design" ? { selected, overlap, onSelect: setSelected, onChange: change, onTool: tool } : undefined} />
          <span className="text-[11.5px] text-muted">
            {view === "design" ? "روی رگال بزنید تا ابزارهایش بیاید: کالاها، قالب، کپی، چرخش، حذف." : "کد هر کالا روی جایگاهش نوشته شده؛ روی رگال بزنید تا نام کامل کالاها را ببینید" + (access === "view" ? "." : " یا کالا اضافه کنید.")}
          </span>
          {view === "design" && !layout.racks.length ? <span className="text-[12.5px] text-muted">نقشه خالی است؛ با «+ رگال» اولین رگال را از یک قالب بگذارید.</span> : null}
        </section>
      ) : null}

      {openRack && openTemplate ? (
        <RackDialog rack={openRack} template={openTemplate} readOnly={access === "view"} onClose={() => setOpen(null)}
          onAssign={(slotId, product) => assign(openRack.key, slotId, product)} />
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
      <p className="m-0 text-[12.5px] text-muted">اول اندازه فروشگاه را وارد کنید؛ بعد در «قالب رگال‌ها» قالب بسازید و در «طراحی نقشه» رگال بگذارید.</p>
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
