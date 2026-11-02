import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { JalaliDateField } from "../../components/JalaliDatePicker";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../hooks/useAuth";
import { useTiers } from "../../hooks/useTiers";
import { formatMobile, formatNumber } from "../../lib/format";
import { ApiError } from "../../services/api";
import { callsService } from "../../services/calls";
import { customersService } from "../../services/customers";
import type { CustomerListSummary, CustomerRow } from "../../types";
import { CreateCallList } from "../calls/CreateCallList";
import { CustomerOverview } from "./CustomerOverview";
import {
  DAY_OPTIONS,
  PRESETS,
  activeChips,
  ariaSort,
  basketBar,
  buildCategories,
  categoryCount,
  channelCell,
  columnsKey,
  compareNote,
  currentPage,
  currentSort,
  daysAgoText,
  daysSince,
  filterParams,
  hasFilters,
  listQuery,
  millionText,
  nextSort,
  readColumns,
  recencyColor,
  replaceFilters,
  splitList,
  tierColors,
  toggleInList,
  withChanges,
  writeColumns,
  type Category,
  type Field,
  type OptionalColumns,
  type SortKey,
} from "./customerListUrl";

const PER_PAGE = 20;
const DEBOUNCE_MS = 300;
const CARD = "rounded-[18px] border border-line bg-surface";
const MUTED = "text-[12.5px] text-muted";
const SOFT = "text-slate-600 dark:text-slate-300";
const LABEL = `text-[13px] font-semibold ${SOFT}`;
const INPUT = "min-h-10 rounded-[11px] border border-slate-300/70 px-3 text-[13px] text-ink outline-none focus:border-accent dark:border-white/[0.12]";
const GHOST = `min-h-[38px] cursor-pointer rounded-[10px] border border-slate-300 bg-transparent px-[13px] text-[12.5px] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.14] ${SOFT}`;
const PRIMARY = "min-h-[38px] cursor-pointer rounded-[10px] border-0 bg-accent px-3.5 text-[12.5px] font-semibold text-on-accent";

type Props = { canManage: boolean; onEditTierRules: () => void };

/** Debounced, and a newer request aborts the previous one. */
function useLiveQuery<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: boolean }>({ data: null, loading: true, error: false });
  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => ({ ...prev, loading: true, error: false }));
    const timer = window.setTimeout(() => {
      load(controller.signal)
        .then((data) => setState({ data, loading: false, error: false }))
        .catch((error) => {
          if (error?.name !== "AbortError") setState((prev) => ({ ...prev, loading: false, error: true }));
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-[34px] cursor-pointer rounded-full border px-3 text-[12.5px] ${
        on ? "border-blue-400 bg-blue-500/20 text-ink" : "border-black/10 bg-transparent text-muted dark:border-white/[0.12]"
      }`}
    >
      {children}
    </button>
  );
}

export function CustomerListPanel({ canManage, onEditTierRules }: Props) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tiers } = useTiers();
  const canManageCalls = Boolean(user?.can_manage_calls);

  const options = useApi(() => customersService.listOptions(), []);
  const categories = useMemo(
    () =>
      buildCategories({
        tiers: tiers.map((tier) => ({ value: tier.code, label: tier.title })),
        callResults: (options.data?.call_results ?? []).map((value) => ({ value, label: value })),
        callTags: (options.data?.call_tags ?? []).map((tag) => ({ value: String(tag.id), label: tag.title })),
      }),
    [tiers, options.data],
  );

  const [panel, setPanel] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [retry, setRetry] = useState(0);
  const [message, setMessage] = useState("");
  const [callListOpen, setCallListOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const storageKey = columnsKey(user?.id);
  const [columns, setColumns] = useState<OptionalColumns>(() => readColumns(storageKey));
  const [refreshingTiers, setRefreshingTiers] = useState(false);
  const toolbarRef = useRef<HTMLElement>(null);

  const change = (changes: Record<string, string | null>) => {
    setMessage("");
    setParams(withChanges(params, changes), { replace: true });
  };
  const applyFilters = (filters: Record<string, unknown>) => {
    setMessage("");
    setPanel(null);
    setParams(replaceFilters(params, filters), { replace: true });
  };

  const query = listQuery(params, PER_PAGE);
  const summaryQuery = useMemo(() => {
    const scoped = new URLSearchParams(query);
    ["page", "per_page", "sort", "dir"].forEach((key) => scoped.delete(key));
    return scoped.toString();
  }, [query]);
  const list = useLiveQuery(`${query}|${retry}`, (signal) => customersService.rows(query, signal));
  const summary = useLiveQuery(`${summaryQuery}|${retry}`, (signal) => customersService.listSummary(summaryQuery, signal));

  // Editing a call list: its saved filters become the URL once, then the banner saves what is on screen.
  const editListId = canManageCalls ? Number(params.get("edit_list")) || null : null;
  const editingList = useApi(() => callsService.list(editListId as number), [editListId], editListId != null);
  useEffect(() => {
    if (editingList.data) setParams(replaceFilters(params, editingList.data.filter_params), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingList.data]);
  const saveListFilters = async () => {
    if (!editListId) return;
    try {
      await callsService.updateList(editListId, { filter_params: filterParams(params) });
      navigate("/calls?section=programs", { state: { message: "تغییرات لیست ذخیره شد" } });
    } catch (error) {
      setMessage(error instanceof ApiError && error.message ? error.message : "ذخیره تغییرات انجام نشد.");
    }
  };

  useEffect(() => {
    if (!panel) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setPanel(null);
    const onDown = (event: globalThis.MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) setPanel(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [panel]);

  const handleExport = async () => {
    setExporting(true);
    setMessage("");
    try {
      await customersService.exportRows(listQuery(params, PER_PAGE, selected));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خروجی اکسل با خطا مواجه شد.");
    } finally {
      setExporting(false);
    }
  };

  const handleRefreshTiers = async () => {
    setRefreshingTiers(true);
    setMessage("");
    try {
      const started = await customersService.refreshTiers();
      setMessage(started.detail);
      const deadline = Date.now() + 10 * 60 * 1000;
      let running = true;
      while (running && Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        running = (await customersService.tierRefreshStatus()).running;
      }
      setMessage(running ? "به‌روزرسانی هنوز ادامه دارد. کمی بعد لیست را دوباره باز کنید." : "سطح‌ها به‌روز شد.");
      if (!running) setRetry((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "به‌روزرسانی سطح‌ها با خطا مواجه شد.");
    } finally {
      setRefreshingTiers(false);
    }
  };

  const toggleColumn = (key: keyof OptionalColumns, on: boolean) => {
    const next = { ...columns, [key]: on };
    setColumns(next);
    writeColumns(storageKey, next);
  };

  const chips = activeChips(categories, params);
  const total = list.data?.total ?? 0;
  const page = currentPage(params);
  const rows = list.data?.results ?? [];
  const pageMax = Math.max(0, ...rows.map((row) => row.avg_basket ?? 0));
  const lastPage = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="flex flex-col gap-3.5">
      {editListId != null ? (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-accent bg-blue-500/10 px-3.5 py-2.5 text-[13px] text-ink">
          <span className="me-auto font-semibold">در حال ویرایش لیست {editingList.data?.name ?? "..."}</span>
          <button type="button" onClick={saveListFilters} disabled={!editingList.data} className={`${PRIMARY} disabled:opacity-50`}>ذخیره تغییرات</button>
          <button type="button" onClick={() => navigate("/calls?section=programs")} className={GHOST}>انصراف</button>
        </div>
      ) : null}

      <CustomerOverview canManage={canManage} onEditTierRules={onEditTierRules} onRefreshTiers={handleRefreshTiers} refreshingTiers={refreshingTiers} />

      <section ref={toolbarRef} className={`${CARD} relative z-[5] flex flex-col gap-2.5 px-3.5 py-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="relative flex max-w-[320px] flex-[1_1_220px]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="absolute right-3 top-3 text-faint">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.5" y2="16.5" />
            </svg>
            <input
              className={`${INPUT} w-full bg-elevated pr-9`}
              type="search"
              aria-label="جستجوی مشتری"
              placeholder="جستجوی نام یا شماره"
              value={params.get("search") ?? ""}
              onChange={(event) => change({ search: event.target.value })}
            />
          </span>
          {categories.map((category) => (
            <CategoryButton key={category.key} label={category.label} count={categoryCount(category, params)} open={panel === category.key} onClick={() => setPanel(panel === category.key ? null : category.key)} />
          ))}
          <CategoryButton label="میان‌برها و نماها" count={0} open={panel === "views"} quiet onClick={() => setPanel(panel === "views" ? null : "views")} />
        </div>

        {panel ? (
          <div className="absolute inset-x-0 top-[calc(100%+6px)] z-20 flex max-h-[72vh] flex-col gap-3.5 overflow-y-auto rounded-2xl border border-slate-300/70 bg-elevated p-[18px] shadow-2xl dark:border-white/[0.14]">
            {panel === "views" ? (
              <ViewsPanel params={params} onApply={applyFilters} />
            ) : (
              <FieldsPanel category={categories.find((item) => item.key === panel) as Category} params={params} change={change} />
            )}
            <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-line pt-3">
              <span className={MUTED}>{list.loading ? "در حال شمارش..." : `${formatNumber(total)} مشتری با این فیلترها`}</span>
              <button type="button" onClick={() => setPanel(null)} className="min-h-[38px] cursor-pointer rounded-[10px] border-0 bg-accent px-[18px] text-[13px] font-semibold text-on-accent">
                نمایش نتیجه
              </button>
            </div>
          </div>
        ) : null}

        {chips.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                aria-label={chip.aria}
                onClick={() => change(chip.remove)}
                className="min-h-8 cursor-pointer rounded-full border border-blue-400/40 bg-blue-500/[0.16] px-[11px] text-[12.5px] text-blue-800 dark:text-blue-100"
              >
                {chip.label} ✕
              </button>
            ))}
            <button type="button" onClick={() => applyFilters({})} className="min-h-8 cursor-pointer border-0 bg-transparent px-2 text-[12.5px] text-blue-600 dark:text-blue-300">
              پاک کردن همه
            </button>
          </div>
        ) : null}
      </section>

      <SummaryCards summary={summary.data} failed={summary.error} active={hasFilters(params)} />

      {callListOpen ? <CreateCallList selectedIds={selected} filterParams={filterParams(params)} total={total} onClose={() => setCallListOpen(false)} /> : null}

      <section className={`${CARD} flex flex-col px-2 pb-2.5 pt-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">{selected.length ? `${formatNumber(selected.length)} مشتری انتخاب شد` : `${formatNumber(total)} مشتری`}</span>
            {selected.length ? (
              <button type="button" onClick={() => setSelected([])} className="min-h-[30px] cursor-pointer border-0 bg-transparent text-[12.5px] text-blue-600 dark:text-blue-300">لغو انتخاب</button>
            ) : null}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" aria-expanded={colsOpen} onClick={() => setColsOpen(!colsOpen)} className={GHOST}>ستون‌ها</button>
            <button type="button" disabled={exporting} onClick={handleExport} className={GHOST}>{exporting ? "در حال استخراج..." : "خروجی اکسل"}</button>
            {canManageCalls && editListId == null ? (
              <button type="button" onClick={() => setCallListOpen(true)} className={PRIMARY}>
                {selected.length ? `ساخت لیست تماس (${formatNumber(selected.length)})` : "ساخت لیست تماس"}
              </button>
            ) : null}
          </div>
        </div>
        {colsOpen ? (
          <div className="mx-2 mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-elevated px-3 py-2">
            {(
              [
                ["total", "مجموع خرید"],
                ["first", "اولین خرید"],
                ["city", "شهر"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className={`inline-flex min-h-[34px] items-center gap-[7px] text-[13px] ${SOFT}`}>
                <input type="checkbox" checked={columns[key]} onChange={(event) => toggleColumn(key, event.target.checked)} />
                {label}
              </label>
            ))}
          </div>
        ) : null}
        {message ? <p role="status" className="mx-2 mb-2.5 mt-0 rounded-[10px] bg-blue-500/[0.14] px-3 py-2 text-[13px] text-ink">{message}</p> : null}

        <CustomerTable
          rows={rows}
          loading={list.loading}
          hasData={Boolean(list.data)}
          params={params}
          columns={columns}
          pageMax={pageMax}
          selected={selected}
          onSort={(column) => setParams(nextSort(params, column), { replace: true })}
          onToggle={(id) => setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))}
          onOpen={(id) => navigate(`/customers/${id}`)}
        />

        {list.error ? (
          <p className={`${MUTED} m-0 p-[30px] text-center`} role="alert">
            لیست بارگذاری نشد.{" "}
            <button type="button" onClick={() => setRetry((value) => value + 1)} className="cursor-pointer border-0 bg-transparent text-blue-600 dark:text-blue-300">تلاش دوباره</button>
          </p>
        ) : !list.loading && !rows.length ? (
          <p className={`${MUTED} m-0 p-[30px] text-center`}>مشتری‌ای با این فیلترها پیدا نشد. یکی از فیلترها را بردارید.</p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-1.5 px-2 pb-0.5 pt-3">
          <span className={MUTED}>
            {total ? `نمایش ${formatNumber((page - 1) * PER_PAGE + 1)} تا ${formatNumber(Math.min(page * PER_PAGE, total))} از ${formatNumber(total)}` : ""}
          </span>
          <div className="flex items-center gap-1.5">
            <button type="button" className={GHOST} disabled={page <= 1} onClick={() => goToPage(setParams, params, page - 1)}>قبلی</button>
            <button type="button" className={GHOST} disabled={page >= lastPage} onClick={() => goToPage(setParams, params, page + 1)}>بعدی</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function goToPage(setParams: ReturnType<typeof useSearchParams>[1], params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  setParams(next);
}

function CategoryButton({ label, count, open, quiet, onClick }: { label: string; count: number; open: boolean; quiet?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onClick}
      className={`inline-flex min-h-10 cursor-pointer items-center gap-[7px] rounded-[11px] border px-3.5 text-[13px] ${
        open ? "border-blue-400 bg-blue-500/[0.18] text-ink" : `${count ? "border-blue-400/45 text-ink" : `border-slate-300/70 dark:border-white/[0.12] ${SOFT}`} ${quiet ? "bg-transparent" : "bg-elevated"}`
      }`}
    >
      {label}
      {count ? <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent text-[11px] text-on-accent">{formatNumber(count)}</span> : null}
      <span aria-hidden="true" className="text-[10px] text-faint">▾</span>
    </button>
  );
}

function FieldsPanel({ category, params, change }: { category: Category; params: URLSearchParams; change: (changes: Record<string, string | null>) => void }) {
  return (
    <div className="grid gap-x-7 gap-y-[18px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))" }}>
      {category.fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-2">
          <span className={LABEL}>{field.label}</span>
          <FieldInput field={field} params={params} change={change} />
        </div>
      ))}
    </div>
  );
}

function FieldInput({ field, params, change }: { field: Field; params: URLSearchParams; change: (changes: Record<string, string | null>) => void }) {
  if (field.kind === "range") {
    const shown = (param: string) => (params.get(param) ? String(Number(params.get(param)) / field.scale) : "");
    const set = (param: string, value: string) => change({ [param]: value === "" ? null : String(Math.round(Number(value) * field.scale)) });
    return (
      <div className="flex flex-nowrap items-center gap-1.5">
        <input className={`${INPUT} w-[88px] bg-surface`} type="number" min="0" step="any" aria-label={`${field.label} از`} placeholder="از" value={shown(field.min)} onChange={(event) => set(field.min, event.target.value)} />
        <input className={`${INPUT} w-[88px] bg-surface`} type="number" min="0" step="any" aria-label={`${field.label} تا`} placeholder="تا" value={shown(field.max)} onChange={(event) => set(field.max, event.target.value)} />
        <span className={MUTED}>{field.unit}</span>
      </div>
    );
  }
  if (field.kind === "days") {
    const dayParam = `${field.prefix}_days`;
    const clearDates = { [`${field.prefix}_after`]: null, [`${field.prefix}_before`]: null };
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {DAY_OPTIONS.map((option) => (
            <Chip key={option.value} on={params.get(dayParam) === option.value} onClick={() => change({ [dayParam]: params.get(dayParam) === option.value ? null : option.value, ...clearDates })}>
              {option.label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <JalaliDateField compact allowEmpty emptyLabel="از تاریخ" value={params.get(`${field.prefix}_after`) ?? ""} onChange={(iso) => change({ [`${field.prefix}_after`]: iso, [dayParam]: null })} />
          <JalaliDateField compact allowEmpty emptyLabel="تا تاریخ" value={params.get(`${field.prefix}_before`) ?? ""} onChange={(iso) => change({ [`${field.prefix}_before`]: iso, [dayParam]: null })} />
        </div>
      </div>
    );
  }
  const selected = splitList(params.get(field.param));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {field.options.map((option) => (
        <Chip
          key={option.value}
          on={selected.includes(option.value)}
          onClick={() =>
            change({
              [field.param]: field.kind === "single" ? (selected.includes(option.value) ? null : option.value) : toggleInList(params.get(field.param), option.value),
            })
          }
        >
          {option.label}
        </Chip>
      ))}
    </div>
  );
}

function ViewsPanel({ params, onApply }: { params: URLSearchParams; onApply: (filters: Record<string, unknown>) => void }) {
  const [reload, setReload] = useState(0);
  const views = useApi(() => customersService.listViews(), [reload]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");

  const save = async () => {
    setMessage("");
    try {
      await customersService.createListView(name.trim(), filterParams(params));
      setMessage(`نمای «${name.trim()}» ذخیره شد.`);
      setName("");
      setReload((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof ApiError && error.message ? error.message : "ذخیره نما انجام نشد.");
    }
  };
  const remove = async (id: number) => {
    await customersService.deleteListView(id);
    setReload((value) => value + 1);
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-2">
        <span className={LABEL}>میان‌برها</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((preset) => (
            <Chip key={preset.label} on={false} onClick={() => onApply(preset.filters)}>{preset.label}</Chip>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className={LABEL}>نماهای من</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {views.data?.results.map((view) => (
            <span key={view.id} className="inline-flex items-center">
              <Chip on={false} onClick={() => onApply(view.filters)}>{view.name}</Chip>
              <button type="button" aria-label={`حذف نمای ${view.name}`} onClick={() => remove(view.id)} className="min-h-[34px] min-w-[34px] cursor-pointer border-0 bg-transparent text-faint">✕</button>
            </span>
          ))}
          {views.data && !views.data.results.length ? <span className={MUTED}>هنوز نمایی ذخیره نشده است.</span> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <input className={`${INPUT} w-[200px] bg-surface`} aria-label="نام نما" placeholder="نام نمای جدید" value={name} onChange={(event) => setName(event.target.value)} />
        <button type="button" className={GHOST} disabled={!name.trim()} onClick={save}>ذخیره فیلترهای فعلی</button>
        {message ? <span className={MUTED}>{message}</span> : null}
      </div>
    </div>
  );
}

function SummaryCards({ summary, failed, active }: { summary: CustomerListSummary | null; failed: boolean; active: boolean }) {
  const fa1 = (value: number | null | undefined, scale = 1) =>
    value == null ? "—" : new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(Math.round((value / scale) * 10) / 10);
  if (!summary) {
    return (
      <section aria-label="خلاصه نتیجه فیلتر" className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        {[0, 1, 2, 3].map((index) =>
          failed ? (
            <div key={index} className={`${CARD} flex h-[106px] items-center justify-center ${MUTED}`}>خلاصه بارگذاری نشد</div>
          ) : (
            <div key={index} className={`${CARD} h-[106px] animate-pulse`} />
          ),
        )}
      </section>
    );
  }
  const basket = compareNote(summary.avg_basket, summary.baseline.avg_basket);
  const frequency = compareNote(summary.avg_invoice_count, summary.baseline.avg_invoice_count);
  const tone = (sign: number) => (sign > 0 ? "text-[var(--delta-up)]" : sign < 0 ? "text-[var(--delta-down)]" : "text-muted");
  const cards = [
    { label: "مشتریان این نتیجه", value: formatNumber(summary.count), unit: "نفر", note: `${fa1(summary.share)}٪ از کل مشتریان`, noteClass: "text-muted" },
    { label: "مجموع خرید", value: fa1(summary.total_amount, 1_000_000_000), unit: "میلیارد تومان", note: "از ابتدا تا امروز", noteClass: "text-muted" },
    {
      label: "میانگین سبد خرید",
      value: fa1(summary.avg_basket, 1_000_000),
      unit: "میلیون تومان",
      note: active ? basket.text : "مبلغ تقسیم بر فاکتور",
      noteClass: active ? tone(basket.sign) : "text-muted",
    },
    {
      label: "میانگین تعداد خرید",
      value: fa1(summary.avg_invoice_count),
      unit: "فاکتور",
      note: active ? frequency.text : "برای هر مشتری",
      noteClass: active ? tone(frequency.sign) : "text-muted",
    },
  ];
  return (
    <section aria-label="خلاصه نتیجه فیلتر" className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
      {cards.map((card) => (
        <div key={card.label} className={`${CARD} flex flex-col gap-[5px] px-[18px] py-3.5`}>
          <span className={`text-[13px] ${SOFT}`}>{card.label}</span>
          <span className="flex items-baseline gap-[5px]">
            <span className="text-[26px] font-extrabold tracking-[-0.5px] text-ink">{card.value}</span>
            <span className={MUTED}>{card.unit}</span>
          </span>
          <span className={`text-[12.5px] ${card.noteClass}`}>{card.note}</span>
        </div>
      ))}
    </section>
  );
}

function Dot({ color }: { color: string | null }) {
  return color ? <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: color }} /> : null;
}

function TierPill({ row }: { row: CustomerRow }) {
  if (row.is_operator) return <span className="whitespace-nowrap rounded-full bg-amber-500/15 px-2.5 py-[3px] text-xs text-amber-700 dark:text-amber-400">{row.operator_label ?? "اپراتور"}</span>;
  if (!row.tier_code) return <span className="text-muted">—</span>;
  const [dark, light] = tierColors(row.tier_code);
  const style = { "--tier-dark": dark, "--tier-light": light, "--tier-dark-bg": `${dark}22`, "--tier-light-bg": `${light}1a` } as CSSProperties;
  return (
    <span style={style} className="whitespace-nowrap rounded-full bg-[var(--tier-light-bg)] px-2.5 py-[3px] text-xs text-[var(--tier-light)] dark:bg-[var(--tier-dark-bg)] dark:text-[var(--tier-dark)]">
      {row.tier_label}
    </span>
  );
}

const HEADER: { key: string; label: string; sort?: SortKey; optional?: keyof OptionalColumns }[] = [
  { key: "name", label: "مشتری", sort: "name" },
  { key: "tier", label: "سطح", sort: "tier" },
  { key: "avg", label: "میانگین سبد خرید", sort: "avg_basket" },
  { key: "count", label: "تعداد فاکتور", sort: "invoice_count" },
  { key: "total", label: "مجموع خرید", sort: "total_amount", optional: "total" },
  { key: "last", label: "آخرین خرید", sort: "last_purchase" },
  { key: "first", label: "اولین خرید", sort: "first_purchase", optional: "first" },
  { key: "channel", label: "کانال" },
  { key: "city", label: "شهر", optional: "city" },
];

function CustomerTable({ rows, loading, hasData, params, columns, pageMax, selected, onSort, onToggle, onOpen }: {
  rows: CustomerRow[];
  loading: boolean;
  hasData: boolean;
  params: URLSearchParams;
  columns: OptionalColumns;
  pageMax: number;
  selected: number[];
  onSort: (column: SortKey) => void;
  onToggle: (id: number) => void;
  onOpen: (id: number) => void;
}) {
  const visible = HEADER.filter((column) => !column.optional || columns[column.optional]);
  const { sort } = currentSort(params);
  const onRowClick = (event: MouseEvent, id: number) => {
    // Checkboxes, links and buttons inside the row keep their own behavior.
    if (!(event.target as HTMLElement).closest("a, button, input, label")) onOpen(id);
  };
  const cellClass = (column?: SortKey) => (column && column === sort ? "font-semibold text-ink" : SOFT);
  const TH = "whitespace-nowrap px-2.5 py-1.5 text-right font-medium text-muted";
  const TD = "whitespace-nowrap px-2.5 py-[9px]";

  return (
    <div className={`relative overflow-x-auto transition-opacity ${loading && hasData ? "opacity-60" : ""}`} aria-busy={loading}>
      <table className="w-full min-w-[760px] border-collapse text-[13px]">
        <thead>
          <tr>
            <th scope="col" className={TH}><span className="sr-only">انتخاب</span></th>
            {visible.map((column) => {
              const aria = column.sort ? ariaSort(params, column.sort) : undefined;
              const on = column.sort === sort;
              return (
                <th key={column.key} scope="col" aria-sort={aria} className={TH}>
                  {column.sort ? (
                    <button type="button" onClick={() => onSort(column.sort as SortKey)} className={`min-h-9 cursor-pointer border-0 bg-transparent p-0 text-[12.5px] ${on ? "font-semibold text-ink" : "text-muted"}`}>
                      {column.label} <span className={`text-[10px] ${on ? "text-blue-500" : "text-faint"}`}>{on ? (aria === "ascending" ? "▲" : "▼") : "↕"}</span>
                    </button>
                  ) : (
                    <span>{column.label}</span>
                  )}
                </th>
              );
            })}
            <th scope="col" className={TH}><span className="sr-only">پروفایل</span></th>
          </tr>
        </thead>
        <tbody>
          {!hasData && loading
            ? Array.from({ length: 10 }, (_, index) => (
                <tr key={index} className="border-t border-black/[0.06] dark:border-white/[0.06]">
                  <td colSpan={visible.length + 2} className="px-2.5 py-[9px]"><div className="h-[34px] animate-pulse rounded-lg bg-elevated" /></td>
                </tr>
              ))
            : rows.map((row) => {
                const last = daysSince(row.last_invoice_at);
                const channel = channelCell(row.channel, row.sales_lines);
                const name = row.name;
                return (
                  <tr key={row.id} onClick={(event) => onRowClick(event, row.id)} className="cursor-pointer border-t border-black/[0.06] hover:bg-hover dark:border-white/[0.06]">
                    <td className={TD}>
                      <input type="checkbox" aria-label={`انتخاب ${name}`} checked={selected.includes(row.id)} onChange={() => onToggle(row.id)} />
                    </td>
                    {visible.map((column) => {
                      if (column.key === "name") {
                        return (
                          <td key={column.key} className={TD}>
                            <Link to={`/customers/${row.id}`} className="flex flex-col items-start gap-px">
                              <span className="text-[13.5px] font-semibold text-slate-800 dark:text-slate-200">{name}</span>
                              <span dir="ltr" className="text-xs text-muted">{row.mobile ? formatMobile(row.mobile) : "—"}</span>
                            </Link>
                          </td>
                        );
                      }
                      if (column.key === "tier") return <td key={column.key} className={TD}><TierPill row={row} /></td>;
                      if (column.key === "avg") {
                        return (
                          <td key={column.key} className={`${TD} ${cellClass("avg_basket")}`}>
                            <span className="flex min-w-[90px] flex-col gap-1">
                              <span>{millionText(row.avg_basket)}</span>
                              <span className="h-[3px] rounded-sm bg-black/[0.07] dark:bg-white/[0.07]">
                                <span className="block h-[3px] rounded-sm bg-accent" style={{ width: `${basketBar(row.avg_basket, pageMax)}%` }} />
                              </span>
                            </span>
                          </td>
                        );
                      }
                      if (column.key === "count") return <td key={column.key} className={`${TD} ${cellClass("invoice_count")}`}>{formatNumber(row.invoice_count)}</td>;
                      if (column.key === "total") return <td key={column.key} className={`${TD} ${cellClass("total_amount")}`}>{millionText(row.total_amount)}</td>;
                      if (column.key === "last") {
                        return (
                          <td key={column.key} className={`${TD} ${cellClass("last_purchase")}`}>
                            <span className="inline-flex items-center gap-[7px]"><Dot color={recencyColor(last)} />{daysAgoText(last)}</span>
                          </td>
                        );
                      }
                      if (column.key === "first") return <td key={column.key} className={`${TD} ${cellClass("first_purchase")}`}>{daysAgoText(daysSince(row.first_invoice_at))}</td>;
                      if (column.key === "channel") {
                        return (
                          <td key={column.key} className={`${TD} ${SOFT}`}>
                            <span className="inline-flex items-center gap-[7px]"><Dot color={channel.color} />{channel.text}</span>
                          </td>
                        );
                      }
                      return <td key={column.key} className={`${TD} ${SOFT}`}>{row.city || "—"}</td>;
                    })}
                    <td className={TD}>
                      <Link to={`/customers/${row.id}`} aria-label={`باز کردن پروفایل ${name}`} className="inline-flex h-8 w-8 items-center justify-center rounded-[9px] text-base text-faint">‹</Link>
                    </td>
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}
