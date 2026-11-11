import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { JalaliRangePopover } from "../components/JalaliDatePicker";
import { CategoryTreeSelect } from "../features/categories/CategoryTreeSelect";
import { useCategoryTree } from "../features/categories/useCategoryTree";
import { MultiSelect } from "../features/customers/MultiSelect";
import { COLUMNS, FILTER_LABELS, FILTER_OPTIONS, LINES, STATUS, delta, fa, fa1, jdate, million, pct, sparkPoints } from "../features/products/display";
import {
  DEFAULT_STATE, apiParams, clearFilters, isFiltered, parseState, serializeState, toggleList, type Compare, type ListKey, type Period, type ProductsState,
} from "../features/products/productsUrl";
import type { BundlePairs, ProductReportRow, ProductsSummary, ProductsTable } from "../features/products/types";
import { tehranTodayIso } from "../lib/format";
import { productsService } from "../services/products";

const CARD = "rounded-[18px] border border-line bg-surface";
const GHOST = "min-h-9 cursor-pointer rounded-[10px] border border-line bg-transparent px-3 text-[12.5px] text-muted hover:text-ink";
const PERIODS: [Period, string][] = [["7", "۷ روز"], ["30", "۳۰ روز"], ["90", "۹۰ روز"], ["365", "۱۲ ماه"], ["custom", "دلخواه"]];
const COMPARES: [Compare, string][] = [["prev", "دوره قبل"], ["year", "سال قبل"], ["custom", "دلخواه"], ["none", "بدون مقایسه"]];
const COMPARE_LABEL: Record<string, string> = { prev: "نسبت به دوره قبل", year: "نسبت به سال قبل", custom: "نسبت به بازه مقایسه" };
const LISTS: ListKey[] = ["lines", "status", "age", "stock", "discount"];

function useLoad<T>(load: () => Promise<T>, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .then((result) => alive && (setData(result), setError(false)))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, loading, error };
}

function Segmented<T extends string>({ label, items, value, onPick }: { label: string; items: [T, string][]; value: T; onPick: (value: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-0.5 rounded-[11px] bg-elevated p-[3px]">
      {items.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onPick(key)}
          className={`min-h-8 cursor-pointer rounded-[9px] border-0 px-3 text-[12.5px] ${value === key ? "bg-accent font-semibold text-on-accent" : "bg-transparent text-muted hover:text-ink"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function RangeButton({ open, from, to, onClick }: { open: boolean; from: string; to: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onClick}
      className={`inline-flex min-h-[34px] cursor-pointer items-center gap-2 rounded-[10px] border bg-elevated px-3 text-[13px] text-ink ${open ? "border-accent" : "border-line"}`}
    >
      {jdate(from)} تا {jdate(to)}
      <span aria-hidden="true" className="text-[10px] text-faint">▾</span>
    </button>
  );
}

function ReportBar({ state, update, summary, count, stockOn }: {
  state: ProductsState; update: (next: ProductsState) => void; summary: ProductsSummary | null; count: number; stockOn: boolean;
}) {
  const nodes = useCategoryTree();
  const [calendar, setCalendar] = useState<"cur" | "cmp" | null>(null);
  const [q, setQ] = useState(state.q);
  useEffect(() => setQ(state.q), [state.q]);
  useEffect(() => {
    if (q === state.q) return;
    const timer = window.setTimeout(() => update({ ...state, q, page: 1 }), 350);
    return () => window.clearTimeout(timer);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = tehranTodayIso();
  const range = summary?.range;
  const filtered = isFiltered(state);
  const pickPeriod = (period: Period) => {
    if (period === "custom") {
      update({ ...state, period, from: state.from || range?.from || today, to: state.to || range?.to || today, page: 1 });
      setCalendar("cur");
    } else update({ ...state, period, page: 1 });
  };
  const pickCompare = (compare: Compare) => {
    if (compare === "custom") {
      update({ ...state, compare, cfrom: state.cfrom || range?.compare_from || today, cto: state.cto || range?.compare_to || today });
      setCalendar("cmp");
    } else update({ ...state, compare });
  };
  const compareText = !range || state.compare === "none" || !range.compare_from
    ? "بدون مقایسه"
    : `مقایسه با: ${jdate(range.compare_from)} تا ${jdate(range.compare_to)}${state.compare === "prev" ? " (بازه هم‌اندازه قبلی)" : state.compare === "year" ? " (همین بازه سال قبل)" : ""}${
        range.comparable ? "" : "؛ سابقه فروش حضوری از ۱۴۰۴/۰۳/۱۰ است، پس تغییرها «—» نمایش داده می‌شوند"
      }`;

  return (
    <section aria-label="تنظیمات گزارش" className={`${CARD} z-20 flex flex-col gap-2.5 bg-surface/95 px-3.5 py-3 backdrop-blur sm:sticky sm:top-2`}>
      <div className="relative flex flex-wrap items-center gap-x-[18px] gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-semibold text-muted">بازه</span>
          <Segmented label="بازه زمانی" items={PERIODS} value={state.period} onPick={pickPeriod} />
          {state.period === "custom" ? <RangeButton open={calendar === "cur"} from={state.from} to={state.to} onClick={() => setCalendar(calendar === "cur" ? null : "cur")} /> : null}
        </div>
        <span aria-hidden="true" className="hidden h-[22px] w-px bg-[var(--border)] sm:block" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-semibold text-muted">مقایسه با</span>
          <Segmented label="بازه مقایسه" items={COMPARES} value={state.compare} onPick={pickCompare} />
          {state.compare === "custom" ? <RangeButton open={calendar === "cmp"} from={state.cfrom} to={state.cto} onClick={() => setCalendar(calendar === "cmp" ? null : "cmp")} /> : null}
        </div>
        {calendar ? (
          <JalaliRangePopover
            key={calendar}
            from={calendar === "cur" ? state.from : state.cfrom}
            to={calendar === "cur" ? state.to : state.cto}
            max={today}
            onClose={() => setCalendar(null)}
            onApply={(from, to) => {
              update(calendar === "cur" ? { ...state, from, to, page: 1 } : { ...state, cfrom: from, cto: to });
              setCalendar(null);
            }}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
        <input
          type="search"
          aria-label="جستجوی کالا"
          placeholder="جستجوی نام یا کد کالا"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          className="min-h-[38px] min-w-0 flex-[1_1_200px] rounded-[10px] border border-line bg-elevated px-3 text-[13px] text-ink outline-none focus:border-accent sm:max-w-[260px]"
        />
        <CategoryTreeSelect overlay label="دسته" nodes={nodes} selected={state.category_ids} onChange={(ids) => update({ ...state, category_ids: ids, page: 1 })} />
        {LISTS.filter((key) => stockOn || key !== "stock").map((key) => (
          <MultiSelect key={key} overlay label={FILTER_LABELS[key]} options={FILTER_OPTIONS[key]} selected={state[key]} onChange={(values) => update({ ...state, [key]: values, page: 1 })} />
        ))}
        {filtered ? (
          <button type="button" onClick={() => update(clearFilters(state))} className="min-h-[34px] cursor-pointer border-0 bg-transparent text-[12.5px] text-blue-600 dark:text-blue-300">
            پاک کردن همه
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12.5px]">
        <span className="text-ink">{filtered ? `کل صفحه برای ${fa(count)} کالای فیلترشده ساخته شده است.` : "کل صفحه برای همه کالاها ساخته شده است."}</span>
        {range ? <span className="text-muted">بازه فعلی: {jdate(range.from)} تا {jdate(range.to)}</span> : null}
        <span className="text-muted">{compareText}</span>
      </div>
    </section>
  );
}

function Kpi({ label, value, unit, items, note, noteColor, pressed, onPick, accent }: {
  label: string; value: string; unit: string; items: { a: string; b: string; to?: string }[]; note: string; noteColor: string;
  pressed?: boolean; onPick?: () => void; accent?: string;
}) {
  const body = (
    <>
      <span className="text-[13px] text-muted">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-[26px] font-extrabold tracking-tight text-ink">{value}</span>
        <span className="text-[12.5px] text-muted">{unit}</span>
      </span>
      {items.map((item, index) => (
        <span key={index} className="flex w-full justify-between gap-2 text-[12.5px]">
          <span className="truncate text-ink">{item.a}</span>
          <span className="flex-none text-muted">{item.b}</span>
        </span>
      ))}
      <span className="mt-auto text-xs" style={{ color: noteColor }}>{note}</span>
    </>
  );
  if (!onPick) return <div className={`${CARD} flex flex-col gap-1.5 px-[18px] py-3.5`}>{body}</div>;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPick}
      className={`${CARD} flex cursor-pointer flex-col items-stretch gap-1.5 px-[18px] py-3.5 text-right`}
      style={pressed ? { borderColor: accent } : undefined}
    >
      {body}
    </button>
  );
}

function Cards({ summary, state, update }: { summary: ProductsSummary; state: ProductsState; update: (next: ProductsState) => void }) {
  const { sales, range } = summary;
  const showDelta = state.compare !== "none";
  const rev = delta(sales.revenue_change);
  const units = delta(sales.units_change);
  const card = (key: ListKey, values: string[], color: string, hint: string) => {
    const on = state[key].join(",") === values.join(",");
    return { pressed: on, accent: color, noteColor: color, note: on ? "در جدول فیلتر شده؛ برای برداشتن دوباره بزنید" : hint, onPick: () => update(toggleList(state, key, values)) };
  };
  const days = (row: ProductReportRow) => Math.max(0, Math.round((Date.parse(range.to) - Date.parse(row.last_sale_date)) / 86_400_000));
  return (
    <section aria-label="شاخص‌ها" className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
      <Kpi
        label="فروش"
        value={million(sales.revenue)}
        unit="میلیون تومان"
        items={[
          { a: "تعداد فروش خالص", b: `${fa(sales.net_units)} عدد` },
          { a: "میانگین قیمت فروش", b: sales.avg_price == null ? "—" : `${fa(sales.avg_price / 1000)} هزار تومان` },
        ]}
        note={!showDelta ? "در بازه انتخابی" : sales.revenue_change == null ? "مقایسه برای این بازه در دسترس نیست" : `${rev.text} مبلغ و ${units.text} تعداد ${COMPARE_LABEL[state.compare]}`}
        noteColor={showDelta && sales.revenue_change != null ? rev.color : "var(--text-secondary)"}
      />
      <Kpi
        label="پیشران‌های فروش"
        value={fa(summary.drivers.count)}
        unit="کالا"
        items={summary.drivers.top.map((row) => ({ a: row.title, b: `${fa1(row.ratio)}× دسته` }))}
        {...card("status", ["driver"], "var(--delta-up)", "همه پیشران‌ها را در جدول ببینید")}
      />
      {summary.charge ? (
        <Kpi
          label="نیاز به شارژ فوری"
          value={fa(summary.charge.count)}
          unit="کالا"
          items={summary.charge.top.map((row) => ({ a: row.title, b: row.central_stock === 0 ? "موجودی مرکزی صفر" : "موجودی مرکزی کم" }))}
          {...card("stock", ["charge"], "var(--delta-down)", "سریع می‌فروشند و موجودی مرکزی کم است")}
        />
      ) : (
        <Kpi
          label="رو به رشد"
          value={fa(summary.growth?.count)}
          unit="کالا"
          items={(summary.growth?.top ?? []).map((row) => ({ a: row.title, b: delta(row.trend).text }))}
          {...card("status", ["growth"], "var(--accent)", "فروش ۱۴ روز اخیر بیشتر از ۱۴ روز قبل")}
        />
      )}
      <Kpi
        label="کندفروش و راکد"
        value={fa(summary.slow.count)}
        unit="کالا"
        items={summary.slow.top.map((row) => ({ a: row.title, b: row.status === "stale" ? `${fa(days(row))} روز بدون فروش` : "کند" }))}
        {...card("status", ["slow", "stale"], "var(--warning)", "برای تخفیف یا جابه‌جایی بررسی کنید")}
      />
    </section>
  );
}

function BranchStrip({ summary, state, update }: { summary: ProductsSummary; state: ProductsState; update: (next: ProductsState) => void }) {
  const max = Math.max(1, ...summary.branches.map((b) => b.revenue));
  return (
    <section aria-label="فروش به تفکیک شعبه" className={`${CARD} flex flex-col gap-2.5 px-[18px] py-3.5`}>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <h2 className="m-0 text-sm font-semibold text-ink">فروش به تفکیک شعبه</h2>
        <span className="text-[12.5px] text-muted">روی هر شعبه بزنید تا کل صفحه برای همان شعبه فیلتر شود</span>
      </div>
      <div className="grid gap-x-[22px] gap-y-2 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {LINES.map((line) => {
          const row = summary.branches.find((b) => b.line === line.key);
          const on = state.lines.length === 1 && state.lines[0] === line.key;
          const d = delta(row?.change);
          return (
            <button
              key={line.key}
              type="button"
              aria-pressed={on}
              onClick={() => update(toggleList(state, "lines", [line.key]))}
              className={`flex cursor-pointer flex-col items-start gap-1.5 rounded-xl border px-2.5 py-2 text-right ${on ? "bg-hover" : "border-transparent bg-transparent"}`}
              style={on ? { borderColor: line.color } : undefined}
            >
              <span className="flex w-full items-center justify-between">
                <span className="flex items-center gap-[7px]">
                  <span className="h-2 w-2 rounded-full" style={{ background: line.color }} />
                  <span className="text-[13.5px] font-semibold text-ink">{line.label}</span>
                </span>
                {state.compare !== "none" ? <span className="text-xs font-semibold" style={{ color: d.color }}>{d.text}</span> : null}
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className="text-[19px] font-extrabold text-ink">{million(row?.revenue)}</span>
                <span className="text-[12.5px] text-muted">میلیون تومان، {pct(row?.share)} سهم</span>
              </span>
              <span className="h-[5px] w-full rounded-[3px] bg-[var(--chart-track)]">
                <span className="block h-[5px] rounded-[3px]" style={{ background: line.color, width: `${Math.round(((row?.revenue ?? 0) / max) * 100)}%` }} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

const PRESETS: [string, Partial<ProductsState>, string, "asc" | "desc"][] = [
  ["کالاهای تازه (تا ۹۰ روز)", { age: ["30", "90"] }, "first14", "desc"],
  ["رو به رشد", { status: ["growth"] }, "change", "desc"],
  ["کند شده", { status: ["slow"] }, "change", "asc"],
  ["احتمالاً تمام شده", { stock: ["out"] }, "speed", "desc"],
];

function Badge({ color, children, title }: { color: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} className="rounded-full px-2.5 py-0.5 text-xs" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      {children}
    </span>
  );
}

function Row({ row, showDelta, suffix }: { row: ProductReportRow; showDelta: boolean; suffix: string }) {
  const d = delta(showDelta ? row.change : null);
  const ratioColor = row.ratio == null ? "var(--text-faint)" : row.ratio >= 2 ? "var(--delta-up)" : row.ratio < 0.7 ? "var(--warning)" : "var(--text-secondary)";
  const status = STATUS[row.status];
  return (
    <tr className="border-t border-line hover:bg-hover">
      <td className="px-2.5 py-[9px]">
        <Link to={`/products/${row.id}${suffix}`} className="flex flex-col items-start gap-px text-inherit no-underline">
          <span className="text-[13.5px] font-semibold text-ink">{row.title}</span>
          <span dir="ltr" className="text-[11.5px] text-muted">{row.code}</span>
        </Link>
      </td>
      <td className="px-2.5 py-[9px] text-muted">{row.category || "—"}</td>
      <td className="px-2.5 py-[9px] font-semibold">{fa(row.units)}</td>
      <td className="px-2.5 py-[9px]">{million(row.revenue)} م</td>
      <td className="px-2.5 py-[9px]">
        <span className="flex items-center gap-2">
          <span>{fa1(row.speed)} خالص در هفته</span>
          <svg width="64" height="20" viewBox="0 0 64 20" aria-hidden="true">
            <polyline points={sparkPoints(row.spark ?? [])} fill="none" stroke={(row.change ?? 0) >= 0 ? "var(--delta-up)" : "var(--delta-down)"} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </span>
      </td>
      <td className="px-2.5 py-[9px]">{fa(row.first14)} عدد</td>
      <td className="px-2.5 py-[9px] font-semibold" style={{ color: ratioColor }}>{row.ratio == null ? "—" : `${fa1(row.ratio)}×`}</td>
      <td className="px-2.5 py-[9px] text-[12.5px] font-semibold" style={{ color: d.color }}>{showDelta ? d.text : "ــ"}</td>
      <td className="px-2.5 py-[9px] text-muted">{fa(row.age)} روز</td>
      <td className="px-2.5 py-[9px]" title={LINES.map((line) => `${line.label} ${fa(row.lines[line.key])} عدد`).join("، ")}>
        <span className="flex gap-1">
          {LINES.map((line) => (
            <span key={line.key} className="inline-flex min-w-[34px] items-center gap-1 rounded-[7px] bg-elevated px-1.5 py-px text-xs text-ink">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: line.color }} />
              {fa(row.lines[line.key])}
            </span>
          ))}
        </span>
      </td>
      <td className="px-2.5 py-[9px]" style={{ color: (row.discount_share ?? 0) >= 0.4 ? "var(--warning)" : undefined }}>{pct(row.discount_share)}</td>
      <td className="px-2.5 py-[9px]" style={{ color: (row.return_rate ?? 0) >= 0.08 ? "var(--delta-down)" : undefined }}>{pct(row.return_rate)}</td>
      <td className="px-2.5 py-[9px]">
        <span className="flex gap-1.5">
          <Badge color={status.color}>{status.label}</Badge>
          {row.stock_flag === "charge" ? <Badge color="var(--delta-down)" title="سریع می‌فروشد و موجودی مرکزی کم یا صفر است">شارژ فوری</Badge> : null}
          {row.stock_flag === "out" ? <Badge color="var(--delta-down)" title="فروش افت کرده و موجودی مرکزی صفر است">احتمالاً تمام شده</Badge> : null}
        </span>
      </td>
    </tr>
  );
}

/** The page's range and comparison, carried into Product 360. */
function rangeSuffix(state: ProductsState) {
  const { period, from, to, compare, cfrom, cto } = state;
  const query = serializeState({ ...DEFAULT_STATE, period, from, to, compare, cfrom, cto });
  return query ? `?${query}` : "";
}

function exportCsv(rows: ProductReportRow[], stockOn: boolean) {
  const head = ["کالا", "کد", "دسته", "تعداد فروش", "مبلغ فروش (تومان)", "فروش خالص هفتگی", "فروش ۱۴ روز اول", "نسبت به دسته", "تغییر ٪", "عمر کالا (روز)",
    ...LINES.map((line) => `فروش ${line.label}`), "فروش با تخفیف ٪", "مرجوعی ٪", "وضعیت", ...(stockOn ? ["موجودی مرکزی"] : [])];
  const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const round = (value: number | null) => (value == null ? "" : Math.round(value * 10) / 10);
  const lines = rows.map((r) => [r.title, r.code, r.category, r.units, r.revenue, round(r.speed), r.first14, round(r.ratio), round(r.change), r.age,
    ...LINES.map((line) => r.lines[line.key]), round(r.discount_share == null ? null : r.discount_share * 100), round(r.return_rate == null ? null : r.return_rate * 100),
    STATUS[r.status].label, ...(stockOn ? [r.central_stock ?? ""] : [])].map(cell).join(","));
  const blob = new Blob(["﻿" + [head.map(cell).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "products.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function ProductTable({ table, loading, state, update, stockOn }: {
  table: ProductsTable | null; loading: boolean; state: ProductsState; update: (next: ProductsState) => void; stockOn: boolean;
}) {
  const [help, setHelp] = useState(false);
  const [exporting, setExporting] = useState(false);
  const full = table?.full ?? false;
  const filtered = isFiltered(state);
  const periodLabel = state.period === "custom" ? "بازه انتخابی" : `${PERIODS.find(([key]) => key === state.period)?.[1]} اخیر`;
  const total = table?.total ?? 0;
  const first = (state.page - 1) * (table?.page_size ?? 20) + 1;
  const sortBy = (key: string) =>
    update(state.sort === key ? { ...state, dir: state.dir === "asc" ? "desc" : "asc" } : { ...state, sort: key, dir: key === "age" || key === "title" ? "asc" : "desc", page: 1 });
  const doExport = async () => {
    setExporting(true);
    try {
      exportCsv((await productsService.table({ ...apiParams(state), all: "1", export: "1" })).results, stockOn);
    } finally {
      setExporting(false);
    }
  };
  return (
    <section className={`${CARD} flex flex-col px-2 pb-2.5 pt-3`}>
      <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2.5">
        <span className="text-[12.5px] text-muted">میان‌بر</span>
        {PRESETS.filter(([, filter]) => stockOn || !("stock" in filter)).map(([label, filter, sort, dir]) => {
          const [key, values] = Object.entries(filter)[0] as [ListKey, string[]];
          const on = state[key].join(",") === values.join(",");
          return (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              onClick={() => update(on ? clearFilters(state) : { ...clearFilters(state), ...filter, sort, dir })}
              className={`min-h-8 cursor-pointer rounded-full border px-3 text-[12.5px] ${on ? "border-blue-400 bg-accent/20 text-ink" : "border-line bg-transparent text-muted"}`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-ink">{full ? `${fa(total)} کالا` : `۱۰ کالای پرفروش ${periodLabel}`}</span>
          <span className="text-[12.5px] text-muted">
            {full ? (filtered ? "بر اساس فیلترهای بالای صفحه" : "همه کالاهای دارای فروش در این بازه") : "بر اساس مبلغ فروش. برای دیدن همه کالاها یا فیلتر کردن، از بالای صفحه استفاده کنید."}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {!full ? (
            <button type="button" onClick={() => update({ ...state, all: true, page: 1 })} className="min-h-9 cursor-pointer rounded-[10px] border-0 bg-accent px-3.5 text-[12.5px] font-semibold text-on-accent">
              نمایش همه کالاها
            </button>
          ) : null}
          <button type="button" aria-expanded={help} onClick={() => setHelp(!help)} className={GHOST}>راهنمای ستون‌ها</button>
          <button type="button" disabled={exporting || !total} onClick={doExport} className={`${GHOST} disabled:opacity-50`}>{exporting ? "در حال آماده‌سازی…" : "خروجی اکسل"}</button>
        </div>
      </div>
      {help ? (
        <div className="mx-2 mb-3 grid gap-x-[22px] gap-y-2 rounded-xl bg-elevated px-3.5 py-3 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
          {COLUMNS.map(([, label, text]) => (
            <div key={label} className="flex flex-col gap-px">
              <span className="text-[12.5px] font-semibold text-ink">{label}</span>
              <span className="text-[12.5px] leading-[1.7] text-muted">{text}</span>
            </div>
          ))}
          <div className="col-span-full flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-line pt-2 text-xs text-muted">
            <span>رنگ شعب:</span>
            {LINES.map((line) => (
              <span key={line.key} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: line.color }} />{line.label}</span>
            ))}
          </div>
        </div>
      ) : null}
      <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
        <table className="w-full min-w-[900px] border-collapse text-[13px]">
          <thead>
            <tr>
              {COLUMNS.map(([key, label, text]) => {
                const on = key != null && state.sort === key;
                return (
                  <th key={label} scope="col" title={text} aria-sort={on ? (state.dir === "asc" ? "ascending" : "descending") : "none"} className="whitespace-nowrap px-2.5 py-1.5 text-right font-medium text-muted">
                    {key ? (
                      <button type="button" onClick={() => sortBy(key)} className={`min-h-[34px] cursor-pointer border-0 bg-transparent p-0 text-[12.5px] ${on ? "font-semibold text-ink" : "text-muted"}`}>
                        {label} <span className={`text-[10px] ${on ? "text-accent" : "text-faint"}`}>{on ? (state.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                      </button>
                    ) : (
                      <span>{label}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="whitespace-nowrap">
            {(table?.results ?? []).map((row) => <Row key={row.id} row={row} showDelta={state.compare !== "none"} suffix={rangeSuffix(state)} />)}
          </tbody>
        </table>
      </div>
      {table && !table.results.length ? <p className="m-0 p-7 text-center text-[12.5px] text-muted">کالایی با این فیلترها پیدا نشد. یکی از فیلترها را بردارید.</p> : null}
      {full && total ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-0.5 pt-3">
          <span className="text-[12.5px] text-muted">نمایش {fa(first)} تا {fa(Math.min(first + (table?.page_size ?? 20) - 1, total))} از {fa(total)}</span>
          <div className="flex gap-1.5">
            <button type="button" className={`${GHOST} disabled:opacity-40`} disabled={state.page <= 1} onClick={() => update({ ...state, page: state.page - 1 })}>قبلی</button>
            <button type="button" className={`${GHOST} disabled:opacity-40`} disabled={first + (table?.page_size ?? 20) > total} onClick={() => update({ ...state, page: state.page + 1 })}>بعدی</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function pairAction(lift: number, channel: string) {
  if (lift < 1.5) return "ارتباط ضعیف؛ اقدام لازم نیست";
  if (channel === "online") return "در سبد خرید آنلاین پیشنهاد شود";
  if (channel === "store") return "در فروشگاه کنار هم چیده شود";
  return "کنار هم بچینید و در سبد آنلاین پیشنهاد دهید";
}

export function PairsTable({ pairs, showDelta, linkProducts }: { pairs: BundlePairs | null; showDelta: boolean; linkProducts: boolean }) {
  const name = (id: number, text: string) =>
    linkProducts ? <Link to={`/products/${id}`} className="font-semibold text-ink no-underline hover:underline">{text}</Link> : <span className="font-semibold text-ink">{text}</span>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-[13px]">
        <thead>
          <tr className="text-muted">
            {[
              ["جفت", "دو کالا یا دو دسته که با هم در یک فاکتور خریده شده‌اند. «سیگنال اولیه» یعنی سبد هنوز کم است ولی ارتباط قوی است."],
              ["سبد مشترک", "در چند فاکتور هر دو با هم بوده‌اند."],
              ["اگر اولی خریده شود", "از کسانی که اولی را خریدند، چند درصد دومی را هم در همان فاکتور خریدند."],
              ["قدرت ارتباط", "چند برابر حالت تصادفی با هم خریده شده‌اند. بالای ۲× یعنی ارتباط واقعی."],
              ["روند", "تعداد سبد مشترک نسبت به بازه مقایسه بیشتر شده یا کمتر."],
              ["پیشنهاد", "کار پیشنهادی: کنار هم چیدن در فروشگاه یا پیشنهاد در سبد خرید آنلاین."],
            ].map(([label, text]) => <th key={label} scope="col" title={text} className="whitespace-nowrap px-2.5 py-1.5 text-right font-medium">{label}</th>)}
          </tr>
        </thead>
        <tbody className="whitespace-nowrap">
          {(pairs?.results ?? []).map((pair) => {
            const d = delta(showDelta ? pair.trend : null);
            return (
              <tr key={`${pair.a}-${pair.b}`} className="border-t border-line hover:bg-hover">
                <td className="px-2.5 py-[9px]">
                  <span className="flex items-center gap-1.5">
                    {name(pair.a, pair.a_name)}<span className="text-muted">+</span>{name(pair.b, pair.b_name)}
                    {pair.early ? <span title="تعداد سبد هنوز کم است ولی ارتباط قوی است" className="rounded-full bg-accent/15 px-2 py-px text-[11px] text-blue-600 dark:text-blue-300">سیگنال اولیه</span> : null}
                  </span>
                </td>
                <td className="px-2.5 py-[9px]">{fa(pair.baskets)}</td>
                <td className="px-2.5 py-[9px]">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-[5px] w-[60px] rounded-[3px] bg-[var(--chart-track)]">
                      <span className="block h-[5px] rounded-[3px] bg-accent" style={{ width: `${Math.min(100, pair.confidence * 250)}%` }} />
                    </span>
                    {pct(pair.confidence)}
                  </span>
                </td>
                <td className="px-2.5 py-[9px] font-semibold" style={{ color: pair.lift >= 2 ? "var(--delta-up)" : "var(--text-secondary)" }}>{fa1(pair.lift)}×</td>
                <td className="px-2.5 py-[9px] text-[12.5px] font-semibold" style={{ color: pair.new && showDelta && pairs?.comparable ? "var(--accent)" : d.color }}>
                  {!showDelta ? "ــ" : pair.new && pairs?.comparable ? "تازه" : d.text}
                </td>
                <td className="px-2.5 py-[9px] text-[12.5px] text-muted">{pairAction(pair.lift, pairs?.channel ?? "all")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {pairs && !pairs.results.length ? <p className="m-0 p-6 text-center text-[12.5px] text-muted">جفتی با دست‌کم ۵ سبد مشترک در این بازه پیدا نشد.</p> : null}
    </div>
  );
}

function Bundles({ state, update }: { state: ProductsState; update: (next: ProductsState) => void }) {
  const params = { ...apiParams(state), channel: state.bch, level: state.blev, fresh: state.bnew ? "1" : undefined };
  const { data, loading } = useLoad(() => productsService.pairs(params), JSON.stringify(params));
  return (
    <section aria-label="خرید همزمان" className={`${CARD} flex flex-col gap-3 px-[18px] py-4`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-col gap-[3px]">
          <h2 className="m-0 text-[15px] font-semibold text-ink">خرید همزمان (باندل)</h2>
          <span className="text-[12.5px] text-muted">کالاهایی که با هم در یک فاکتور خریده می‌شوند؛ برای چیدمان فروشگاه و پیشنهاد سبد خرید آنلاین</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="کانال" items={[["all", "همه"], ["store", "حضوری"], ["online", "آنلاین"]]} value={state.bch} onPick={(bch) => update({ ...state, bch })} />
          <Segmented label="سطح" items={[["product", "کالا"], ["category", "دسته"]]} value={state.blev} onPick={(blev) => update({ ...state, blev })} />
          <label className="inline-flex items-center gap-[7px] text-[12.5px] text-muted">
            <input type="checkbox" checked={state.bnew} onChange={(event) => update({ ...state, bnew: event.target.checked })} />
            فقط سیگنال‌های تازه
          </label>
        </div>
      </div>
      <div className={loading ? "opacity-60" : ""}>
        <PairsTable pairs={data} showDelta={state.compare !== "none"} linkProducts={state.blev === "product"} />
      </div>
      <p className="m-0 text-[12.5px] leading-[1.8] text-muted">
        «اگر اولی خریده شود» یعنی در چند درصد سبدهای کالای اول، کالای دوم هم بوده. «قدرت ارتباط» یعنی این جفت چند برابر حالت تصادفی با هم خریده شده‌اند؛ بالای ۲ برابر یعنی ارتباط واقعی. جفت‌های با کمتر از ۵ سبد مشترک نمایش داده نمی‌شوند.
      </p>
    </section>
  );
}

export function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.toString();
  const [stockOn, setStockOn] = useState(false);
  const parsed = useMemo(() => parseState(search), [search]);
  // Stock is off by owner decision (2026-11-11): old stock params in URLs and saved views are ignored silently.
  const state = useMemo(() => (stockOn ? parsed : { ...parsed, stock: [] }), [parsed, stockOn]);
  const update = (next: ProductsState) => setSearchParams(serializeState(next));
  const scopeParams = apiParams({ ...state, sort: "revenue", dir: "desc", page: 1 });
  const summary = useLoad(() => productsService.summary(scopeParams), JSON.stringify(scopeParams));
  useEffect(() => {
    if (summary.data) setStockOn(summary.data.stock_enabled === true);
  }, [summary.data]);
  const tableParams = apiParams(state);
  const table = useLoad(() => productsService.table(tableParams), JSON.stringify(tableParams));
  const asOf = summary.data?.range.as_of;

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-3.5 pb-14">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-extrabold text-ink">محصولات</h1>
        <span className="text-[12.5px] text-muted">
          {stockOn ? "موجودی فقط انبار مرکزی است (از سایت)؛ موجودی شعب در سیستم نیست. " : "همه‌چیز بر اساس سرعت فروش است. "}
          وضعیت‌ها در هر دسته جداگانه سنجیده می‌شوند{asOf ? `؛ محاسبه ${jdate(asOf)}` : ""}.
        </span>
      </div>
      <ReportBar state={state} update={update} summary={summary.data} count={table.data?.total ?? 0} stockOn={stockOn} />
      {summary.error || table.error ? <p className={`${CARD} m-0 p-4 text-[13px] text-[var(--delta-down)]`}>گزارش بارگیری نشد. دوباره تلاش کنید.</p> : null}
      {summary.data ? (
        <div className={`flex flex-col gap-3.5 ${summary.loading ? "opacity-60" : ""}`}>
          <Cards summary={summary.data} state={state} update={update} />
          <BranchStrip summary={summary.data} state={state} update={update} />
        </div>
      ) : (
        <div className={`${CARD} h-[220px] animate-pulse`} />
      )}
      <ProductTable table={table.data} loading={table.loading} state={state} update={update} stockOn={stockOn} />
      <Bundles state={state} update={update} />
    </div>
  );
}
