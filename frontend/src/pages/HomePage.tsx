import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { JalaliRangePopover } from "../components/JalaliDatePicker";
import { TargetsSection, money } from "../features/home/TargetsSection";
import type { AttentionItem, HomeCompare, HomeData, HomePeriodKey } from "../features/home/types";
import { LINES, delta, fa, jdate, pct } from "../features/products/display";
import { formatJalali, jalaliWeekday, toFaDigits } from "../lib/dates";
import { tehranTodayIso } from "../lib/format";
import { homeService } from "../services/home";

const CARD = "rounded-[18px] border border-line bg-surface";
const PERIODS: [HomePeriodKey, string][] = [["today", "امروز"], ["7", "۷ روز اخیر"], ["30", "۳۰ روز اخیر"], ["90", "۹۰ روز اخیر"], ["custom", "بازه دلخواه…"]];
const COMPARE_TODAY: [HomeCompare, string][] = [["prev", "همان روز هفته قبل"], ["yoy", "همان روز سال قبل"], ["none", "بدون مقایسه"]];
const COMPARE_RANGE: [HomeCompare, string][] = [["prev", "دوره قبل"], ["yoy", "همین بازه سال قبل"], ["none", "بدون مقایسه"]];
const BRANCHES: [string, string][] = [["all", "همه شعب"], ...LINES.map((l) => [l.key, l.label] as [string, string])];
const lineOf = (key: string | null) => LINES.find((line) => line.key === key);
const ROW_GRID = "grid grid-cols-[minmax(90px,1.2fr)_minmax(120px,2fr)_repeat(3,minmax(70px,0.8fr))_minmax(60px,0.6fr)] items-center gap-2.5";

function since(iso: string | null) {
  if (!iso) return "هنوز انجام نشده";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "همین حالا";
  if (minutes < 60) return `${fa(minutes)} دقیقه پیش`;
  if (minutes < 60 * 24) return `${fa(Math.floor(minutes / 60))} ساعت پیش`;
  return jdate(iso);
}

const clock = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";
const weekday = jalaliWeekday;
/** Last day of a window whose end is exclusive. */
const lastDay = (iso: string) => new Date(Date.parse(iso) - 1).toISOString();

/** «امروز ۱۴۰۵/۰۸/۲۰ تا ساعت ۱۵:۰۰  •  در برابر سه‌شنبه ۱۴۰۵/۰۸/۱۳ تا همین ساعت» */
function describe(range: HomeData["range"]) {
  const today = range.period === "today";
  const current = today ? `امروز ${jdate(range.from)} تا ساعت ${clock(range.to)}` : `${jdate(range.from)} تا ${jdate(lastDay(range.to))}`;
  if (range.compare === "none" || !range.compare_from || !range.compare_to) return { current, compare: null as string | null };
  const compare = today
    ? `${range.compare === "prev" ? `${weekday(range.compare_from)} ` : ""}${jdate(range.compare_from)} تا همین ساعت`
    : `${jdate(range.compare_from)} تا ${jdate(lastDay(range.compare_to))}${range.compare === "prev" ? " (بازه هم‌اندازه قبلی)" : " (همین بازه سال قبل)"}`;
  return { current, compare };
}

function Picker({ label, value, options, current, onPick }: {
  label: string; value: string; options: [string, string][]; current: string; onPick: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => root.current && !root.current.contains(event.target as Node) && setOpen(false);
    const esc = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span ref={root} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(!open)}
        className="inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-[11px] border border-line bg-elevated px-3 text-[13px] text-ink">
        <span className="text-[12.5px] text-muted">{label}</span>
        <b className="font-semibold">{value}</b>
        <span aria-hidden="true" className="text-[10px] text-faint">▾</span>
      </button>
      {open ? (
        <div role="listbox" aria-label={label} className="absolute right-0 top-[calc(100%+6px)] z-40 flex min-w-[190px] flex-col gap-0.5 rounded-xl border border-line bg-elevated p-1.5 shadow-2xl">
          {options.map(([key, text]) => (
            <button key={key} type="button" role="option" aria-selected={current === key} onClick={() => (onPick(key), setOpen(false))}
              className={`flex min-h-[34px] cursor-pointer items-center justify-between gap-3 rounded-lg border-0 px-2.5 text-right text-[13px] ${current === key ? "bg-accent/15 text-ink" : "bg-transparent text-muted hover:bg-hover"}`}>
              {text}
              <span className={`text-xs text-accent ${current === key ? "visible" : "invisible"}`}>✓</span>
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}

function Filters({ data, params, setParams }: { data: HomeData | null; params: URLSearchParams; setParams: (p: URLSearchParams) => void }) {
  const [calendar, setCalendar] = useState(false);
  const period = (PERIODS.find(([key]) => key === params.get("period"))?.[0] ?? "today") as HomePeriodKey;
  const compares = period === "today" ? COMPARE_TODAY : COMPARE_RANGE;
  const compare = (compares.find(([key]) => key === params.get("compare"))?.[0] ?? "prev") as HomeCompare;
  const line = params.get("line") ?? "all";
  const today = tehranTodayIso();
  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => (value == null ? next.delete(key) : next.set(key, value)));
    setParams(next);
  };
  const pickPeriod = (key: string) => {
    if (key === "custom") {
      set({ period: "custom", from: params.get("from") || data?.range.from.slice(0, 10) || today, to: params.get("to") || today });
      setCalendar(true);
    } else set({ period: key === "today" ? null : key, from: null, to: null });
  };
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const periodValue = period === "custom" && from && to ? `${formatJalali(from)} تا ${formatJalali(to)}` : PERIODS.find(([k]) => k === period)?.[1] ?? "";
  const text = data ? describe(data.range) : null;
  return (
    <section aria-label="تنظیمات صفحه" className={`${CARD} relative z-20 flex flex-wrap items-center justify-between gap-2 px-3 py-2.5`}>
      <div className="flex flex-wrap items-center gap-2">
        <Picker label="بازه" value={periodValue} options={PERIODS} current={period} onPick={pickPeriod} />
        <Picker label="مقایسه" value={compares.find(([k]) => k === compare)?.[1] ?? ""} options={compares} current={compare}
          onPick={(key) => set({ compare: key === "prev" ? null : key })} />
        <Picker label="شعبه" value={BRANCHES.find(([k]) => k === line)?.[1] ?? "همه شعب"} options={BRANCHES} current={line}
          onPick={(key) => set({ line: key === "all" ? null : key })} />
      </div>
      <span className="text-[12.5px] text-muted">{text ? `${text.current}${text.compare ? `  •  در برابر ${text.compare}` : ""}` : ""}</span>
      {calendar ? (
        <div className="absolute right-3 top-full z-40 w-[292px]">
          <JalaliRangePopover
            from={from}
            to={to}
            max={today}
            onClose={() => setCalendar(false)}
            onApply={(a, b) => {
              set({ period: "custom", from: a, to: b });
              setCalendar(false);
            }}
          />
        </div>
      ) : null}
    </section>
  );
}

function Delta({ change, ok, suffix = "" }: { change: number | null; ok: boolean; suffix?: string }) {
  if (!ok) return <span className="text-[12.5px] text-faint">—</span>;
  const d = delta(change);
  return <span className="text-[12.5px] font-semibold" style={{ color: d.color }}>{d.text}{change != null && suffix ? ` ${suffix}` : ""}</span>;
}

function Kpi({ to, label, link, value, unit, change, ok, compareNone, suffix, note, help, cmpTip }: {
  to: string; label: string; link: string; value: string; unit: string; change: number | null; ok: boolean; compareNone: boolean;
  suffix?: string; note: string; help: string; cmpTip: string;
}) {
  return (
    <Link to={to} title={help} className={`${CARD} flex flex-col gap-1.5 px-[18px] py-[15px] text-inherit no-underline hover:border-accent`}>
      <span className="flex justify-between"><span className="text-[13px] text-muted">{label}</span><span className="text-[12.5px] text-muted">{link} ‹</span></span>
      <span className="flex items-baseline gap-1.5"><span className="text-[26px] font-extrabold text-ink">{value}</span><span className="whitespace-nowrap text-[12.5px] text-muted">{unit}</span></span>
      <span title={cmpTip}>{compareNone ? <span className="text-[12.5px] text-faint">بدون مقایسه</span> : <Delta change={change} ok={ok} suffix={suffix} />}</span>
      <span className="text-[12.5px] text-muted">{note}</span>
    </Link>
  );
}

function Cards({ data }: { data: HomeData }) {
  const { sales, invoices, basket, buyers } = data.cards;
  const ok = data.range.comparable;
  const none = data.range.compare === "none";
  const named = describe(data.range).compare;
  const tip = (value: string, change: number | null) =>
    none ? "مقایسه خاموش است" : !ok ? "مقایسه ممکن نیست: سابقه فروش حضوری از ۱۴۰۴/۰۳/۱۰" : `این بازه: ${value}؛ مقایسه: ${named} (${delta(change).text})`;
  const [salesValue, ...salesUnit] = money(sales.value).split(" ");
  const [basketValue, ...basketUnit] = money(basket.value).split(" ");
  return (
    <section aria-label="شاخص‌ها" className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
      <Kpi to="/sales" label="فروش" link="فروش" value={salesValue} unit={`${salesUnit.join(" ")} تومان`} change={sales.change} ok={ok} compareNone={none}
        suffix={data.range.period === "today" ? "نسبت به همان ساعت" : "نسبت به مقایسه"}
        note={sales.online_share == null ? (data.range.lines.length === 1 ? lineOf(data.range.lines[0])?.label ?? "" : "—") : `آنلاین ${pct(sales.online_share)}، حضوری ${pct(1 - sales.online_share)}`}
        help="فروش خالص: ارزش سفارش‌های آنلاین + ردیف‌های فروش فروشگاه‌ها." cmpTip={tip(`${money(sales.value)} تومان`, sales.change)} />
      <Kpi to="/sales" label="تعداد فاکتور" link="فروش" value={fa(invoices.value)} unit="فاکتور" change={invoices.change} ok={ok} compareNone={none}
        note={`${fa(invoices.items)} کالا فروخته شد`} help="سفارش‌های آنلاین معتبر + فاکتورهای فروش فروشگاه‌ها." cmpTip={tip(fa(invoices.value), invoices.change)} />
      <Kpi to="/sales" label="میانگین سبد خرید" link="فروش" value={basketValue} unit={`${basketUnit.join(" ")} تومان`} change={basket.change} ok={ok} compareNone={none}
        note="فروش تقسیم بر فاکتور" help="فروش تقسیم بر تعداد فاکتور." cmpTip={tip(`${money(basket.value)} تومان`, basket.change)} />
      <Kpi to="/customers" label="خریداران" link="مشتریان" value={fa(buyers.value)} unit="نفر" change={buyers.change} ok={ok} compareNone={none}
        note={buyers.new_share == null ? "—" : `${pct(buyers.new_share)} مشتری جدید`} help="مشتریانی که در این بازه خرید کرده‌اند، بدون اکانت‌های داخلی." cmpTip={tip(fa(buyers.value), buyers.change)} />
    </section>
  );
}

function Branches({ data, compareText }: { data: HomeData; compareText: string | null }) {
  const today = data.range.period === "today";
  const ok = data.range.comparable;
  const max = Math.max(1, ...data.branches.map((b) => b.sales));
  const totalSales = data.total?.sales ?? data.branches.reduce((sum, b) => sum + b.sales, 0);
  const rowTip = (row: { sales: number; compare_sales: number | null }, whole = false) => {
    const share = whole ? "جمع همه شعب" : `سهم از فروش: ${totalSales ? pct(row.sales / totalSales) : "—"}`;
    if (data.range.compare === "none") return share;
    if (!ok || row.compare_sales == null) return `${share}؛ مقایسه ممکن نیست`;
    return `${share}؛ ${today ? "همان زمان مقایسه" : "دوره مقایسه"}: ${money(row.compare_sales)} تومان`;
  };
  const cell = (row: HomeData["branches"][number] | NonNullable<HomeData["total"]>) => (
    <>
      <span className="flex flex-col gap-1">
        <span><b>{money(row.sales)}</b></span>
        {"line" in row ? (
          <span className="h-1 rounded-sm bg-[var(--chart-track)]"><span className="block h-1 rounded-sm" style={{ background: lineOf(row.line)?.color, width: `${(row.sales / max) * 100}%` }} /></span>
        ) : null}
      </span>
      <span>{fa(row.invoices)}</span>
      <span>{fa(row.items)}</span>
      <span>{row.basket == null ? "—" : money(row.basket)}</span>
      {data.range.compare === "none" ? <span className="text-faint">—</span> : <Delta change={row.change} ok={ok} />}
    </>
  );
  return (
    <section aria-label="فروش شعب" className={`${CARD} flex flex-col gap-1 px-[18px] py-4`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
        <span className="flex items-center gap-2">
          {today ? <span className="h-[9px] w-[9px] rounded-full bg-[var(--delta-up)] shadow-[0_0_0_4px_var(--delta-up-bg)]" /> : null}
          <h2 className="m-0 text-[15px] font-semibold text-ink">{today ? "امروز تا این لحظه، به تفکیک شعبه" : "فروش شعب"}</h2>
        </span>
        <span className="text-[12.5px] text-muted">
          {today ? (compareText ? `در برابر ${compareText}؛ تا آخرین همگام‌سازی، ساعت ${clock(data.sync.last_success_at)}` : `تا آخرین همگام‌سازی، ساعت ${clock(data.sync.last_success_at)}`) : describe(data.range).current}
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className={`${ROW_GRID} py-1.5 text-xs text-faint`}><span>شعبه</span><span>فروش</span><span>فاکتور</span><span>کالا</span><span>سبد</span><span>تغییر</span></div>
          {data.total ? <div title={rowTip(data.total, true)} className={`${ROW_GRID} min-h-[46px] border-t border-line py-1.5 text-[13.5px] font-semibold`}><span>کل الینور</span>{cell(data.total)}</div> : null}
          {data.branches.map((b) => (
            <div key={b.line} title={rowTip(b)} className={`${ROW_GRID} min-h-[46px] border-t border-line py-1.5 text-[13.5px]`}>
              <span className="flex items-center gap-[7px] font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: lineOf(b.line)?.color }} />{lineOf(b.line)?.label}</span>
              {cell(b)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const CARD_WIDTH = 220;

function Trend({ data }: { data: HomeData }) {
  const hourly = data.range.bucket === "hour";
  const points = data.trend;
  const hasCompare = data.range.compare !== "none" && data.range.comparable;
  const allBranches = data.range.lines.length > 1;
  const max = Math.max(1, ...points.map((p) => Math.max(p.sales ?? 0, p.compare ?? 0))) * 1.1;
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const chart = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const measure = () => setWidth(chart.current?.clientWidth ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const hourLabel = (h: number) => `${toFaDigits(String(h).padStart(2, "0"))}:۰۰`;
  const title = (key: string | number) =>
    hourly ? `ساعت ${hourLabel(Number(key))} تا ${hourLabel(Number(key) + 1)}` : `${weekday(String(key))} ${jdate(String(key))}`;
  const axis = (key: string | number, index: number) =>
    hourly ? (index % 3 === 0 ? toFaDigits(key) : "") : index % Math.max(1, Math.ceil(points.length / 6)) === 0 ? formatJalali(String(key)).slice(5) : "";
  const compareLegend = data.range.compare === "none"
    ? null
    : !data.range.comparable
      ? "مقایسه ندارد (سابقه حضوری از ۱۴۰۴/۰۳/۱۰)"
      : hourly
        ? data.range.compare === "yoy" ? "همان روز سال قبل" : `${weekday(data.range.compare_from ?? data.range.from)} هفته قبل`
        : data.range.compare === "yoy" ? "همین بازه سال قبل" : "بازه هم‌اندازه قبلی";
  const compareLabel = hourly
    ? data.range.compare === "yoy" ? "همان ساعت سال قبل" : "همان ساعت هفته قبل"
    : data.range.compare === "yoy" ? "همان روز سال قبل" : "روز متناظر دوره قبل";
  const open = (index: number) => !points[index].future && setHover(index);
  const onKey = (event: ReactKeyboardEvent) => event.key === "Escape" && setHover(null);

  const point = hover != null ? points[hover] : null;
  // The card sits beside the hovered bar on the side with more room and never leaves the chart (RTL: bar 0 is on the right).
  let left = 0;
  if (point && width) {
    const center = width - ((hover as number) + 0.5) * (width / points.length);
    const cardWidth = Math.min(CARD_WIDTH, width);
    left = center > width / 2 ? center - 14 - cardWidth : center + 14;
    left = Math.max(0, Math.min(left, width - cardWidth));
  }
  const change = point && point.compare ? ((point.sales ?? 0) - point.compare) * 100 / point.compare : null;

  return (
    <section aria-label="روند فروش" className={`${CARD} flex flex-col gap-2.5 px-[18px] py-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[15px] font-semibold text-ink">روند فروش</h2>
        <span className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-[5px]"><span className="h-2.5 w-2.5 rounded-sm bg-accent" />{hourly ? "امروز، ساعتی" : "این بازه، روزانه"}</span>
          {compareLegend ? (
            <span className="flex items-center gap-[5px]">{hasCompare ? <span className="w-3.5 border-t-2 border-dashed border-ink" /> : null}{compareLegend}</span>
          ) : null}
        </span>
      </div>
      <div ref={chart} className="relative" onMouseLeave={() => setHover(null)} onKeyDown={onKey}>
        <div aria-label="نمودار روند فروش؛ برای جزئیات روی هر ستون بروید" className="flex h-[190px] items-end gap-[3px] border-b border-line">
          {points.map((p, index) => (
            <button
              key={String(p.key)}
              type="button"
              disabled={p.future}
              aria-label={p.future ? `${title(p.key)}، هنوز نرسیده` : `${title(p.key)}، فروش ${money(p.sales)} تومان`}
              onMouseEnter={() => open(index)}
              onFocus={() => open(index)}
              onClick={() => open(index)}
              className="relative flex h-full min-w-0 flex-1 cursor-pointer items-end border-0 bg-transparent p-0 disabled:cursor-default"
            >
              <span className={`w-full rounded-t-[3px] ${p.future ? "bg-[var(--chart-track)] opacity-50" : hover === index ? "bg-blue-400" : "bg-accent"}`}
                style={{ height: p.future ? "100%" : `${Math.max(1, ((p.sales ?? 0) / max) * 100)}%` }} />
              {hasCompare && !p.future && p.compare != null ? (
                <span className="absolute inset-x-0 border-t-2 border-dashed border-ink/75" style={{ bottom: `${(p.compare / max) * 100}%` }} />
              ) : null}
            </button>
          ))}
        </div>
        {point ? (
          <div role="status" className="absolute top-2 z-10 flex flex-col gap-1.5 rounded-xl border border-line bg-elevated px-3.5 py-3 text-[13px] shadow-2xl"
            style={{ left, width: Math.min(CARD_WIDTH, width || CARD_WIDTH) }}>
            <span className="text-[12.5px] font-bold text-ink">{hourly ? `امروز، ${title(point.key)}` : title(point.key)}</span>
            <div className="flex justify-between gap-3.5"><span className="text-[12.5px] text-muted">فروش</span><b className="text-[15px] text-ink">{money(point.sales)} تومان</b></div>
            {hasCompare && point.compare != null ? (
              <div className="flex justify-between gap-3.5">
                <span className="text-[12.5px] text-muted">{compareLabel}</span>
                <span>{money(point.compare)} <span className="text-xs font-semibold" style={{ color: delta(change).color }}>{delta(change).text}</span></span>
              </div>
            ) : null}
            <div className="flex justify-between gap-3.5"><span className="text-[12.5px] text-muted">فاکتور / کالا</span><span>{fa(point.invoices)} / {fa(point.items)}</span></div>
            {allBranches && point.lines ? (
              <div className="flex flex-col gap-[3px] border-t border-line pt-1.5">
                {LINES.filter((l) => point.lines?.[l.key] != null).map((l) => (
                  <div key={l.key} className="flex justify-between gap-3.5 text-xs">
                    <span className="flex items-center gap-1.5"><span className="h-[7px] w-[7px] rounded-full" style={{ background: l.color }} />{l.label}</span>
                    <span>{money(point.lines?.[l.key])}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex gap-[3px]">
        {points.map((p, i) => <span key={String(p.key)} className="min-w-0 flex-1 whitespace-nowrap text-center text-[10.5px] text-faint">{axis(p.key, i)}</span>)}
      </div>
    </section>
  );
}

function attentionCopy(item: AttentionItem): { color: string; title: string; detail: string; link: string } {
  switch (item.kind) {
    case "target": {
      const names = item.lines.map((key) => lineOf(key)?.label).join("، ");
      return {
        color: "var(--delta-down)",
        title: item.lines.length === 1 ? `${names} ${toFaDigits(Math.round(Math.abs(item.worst.gap)))}٪ از تارگت ماه عقب است` : `${names} از تارگت ماه عقب‌اند`,
        detail: item.required_daily == null ? "ماه به پایان رسیده است."
          : `برای جبران، ${lineOf(item.worst.line)?.label} روزی ${money(item.required_daily)} تومان فروش لازم دارد؛ میانگین فعلی ${money(item.avg_daily)}.`,
        link: "تارگت",
      };
    }
    case "drivers":
      return { color: "var(--delta-up)", title: `${fa(item.count)} کالای پیشران تازه در این هفته`, detail: item.names.join("، "), link: "محصولات" };
    case "calls":
      return {
        color: "var(--warning)",
        title: item.overdue ? `${fa(item.overdue)} کار عقب‌افتاده در مرکز تماس` : `${fa(item.escalations)} ارجاع باز در مرکز تماس`,
        detail: item.overdue && item.escalations ? `${fa(item.escalations)} مورد هم به مدیر ارجاع شده و منتظر بررسی است.` : "برای پیگیری به مرکز تماس بروید.",
        link: "مرکز تماس",
      };
    case "tier_drop": {
      const names = item.titles.length > 1 ? `${item.titles.slice(0, -1).join("، ")} و ${item.titles[item.titles.length - 1]}` : item.titles[0];
      return { color: "var(--accent)", title: `${fa(item.count)} مشتری از سطوح ${names} پایین آمدند`, detail: "در ۳۰ روز اخیر؛ برای برنامه تماس مناسب‌اند.", link: "مشتریان" };
    }
    case "sync_failed":
      return { color: "var(--delta-down)", title: "آخرین همگام‌سازی ناموفق بود", detail: `${jdate(item.at)} ساعت ${clock(item.at)}؛ وضعیت را در تنظیمات ببینید.`, link: "تنظیمات" };
  }
}

function Attention({ items }: { items: AttentionItem[] }) {
  if (!items.length) return null;
  return (
    <section aria-label="نیاز به توجه" className={`${CARD} flex flex-col gap-1 px-[18px] py-4`}>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1">
        <h2 className="m-0 text-[15px] font-semibold text-ink">نیاز به توجه</h2>
        <span className="text-[12.5px] text-muted">فقط چیزهایی که اقدام می‌خواهند</span>
      </div>
      {items.map((item) => {
        const copy = attentionCopy(item);
        return (
          <Link key={item.kind} to={item.link} className="grid grid-cols-[6px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line py-[11px] text-inherit no-underline">
            <span className="h-[34px] w-1.5 rounded-[3px]" style={{ background: copy.color }} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13.5px] font-semibold text-ink">{copy.title}</span>
              <span className="text-[12.5px] text-muted">{copy.detail}</span>
            </span>
            <span className="whitespace-nowrap text-[12.5px] text-blue-600 dark:text-blue-300">{copy.link} ‹</span>
          </Link>
        );
      })}
    </section>
  );
}

export function HomePage() {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => {
    const out: Record<string, string> = {};
    ["period", "from", "to", "compare", "line"].forEach((key) => params.get(key) && (out[key] = params.get(key) as string));
    if (out.period !== "custom") (delete out.from, delete out.to);
    return out;
  }, [params]);
  const key = JSON.stringify(query);
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    homeService.summary(query)
      .then((d) => alive && (setData(d), setError(false)))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const line = params.get("line") ?? undefined;
  const text = data ? describe(data.range) : null;

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-3.5 pb-14">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl font-extrabold text-ink">خانه</h1>
          <span className="text-[12.5px] text-muted">ارقام از داده همگام‌شده با سایت و فروشگاه‌هاست، نه لحظه‌ای.</span>
        </div>
        <span className="flex items-center gap-[7px] rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: data?.sync.failed ? "var(--delta-down)" : "var(--delta-up)" }} />
          آخرین همگام‌سازی: {since(data?.sync.last_success_at ?? null)}
        </span>
      </div>
      <Filters data={data} params={params} setParams={setParams} />
      {error ? <p className={`${CARD} m-0 p-4 text-[13px] text-[var(--delta-down)]`}>صفحه خانه بارگیری نشد. دوباره تلاش کنید.</p> : null}
      {data ? (
        <div className={`flex flex-col gap-3.5 ${loading ? "opacity-60" : ""}`}>
          <Cards data={data} />
          <Branches data={data} compareText={text?.compare ?? null} />
          <Trend data={data} />
          <TargetsSection line={line && line !== "all" ? line : undefined} />
          <Attention items={data.attention} />
        </div>
      ) : (
        <div className={`${CARD} h-[420px] animate-pulse`} />
      )}
    </div>
  );
}
