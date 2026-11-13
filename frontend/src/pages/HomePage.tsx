import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { JalaliRangePopover } from "../components/JalaliDatePicker";
import { TargetsSection, money } from "../features/home/TargetsSection";
import type { AttentionItem, HomeCompare, HomeData, HomePeriodKey } from "../features/home/types";
import { donutStops, rankBranches, sparkBars, toggleLine } from "../features/home/tiles";
import { LINES, delta, fa, jdate, pct } from "../features/products/display";
import { formatJalali, jalaliWeekday, toFaDigits } from "../lib/dates";
import { tehranTodayIso } from "../lib/format";
import { homeService } from "../services/home";

const CARD = "rounded-[18px] border border-line bg-surface";
const PERIODS: [HomePeriodKey, string][] = [["today", "امروز"], ["yesterday", "دیروز"], ["7", "۷ روز اخیر"], ["30", "۳۰ روز اخیر"], ["90", "۹۰ روز اخیر"], ["custom", "بازه دلخواه…"]];
const COMPARE_TODAY: [HomeCompare, string][] = [["prev", "همان روز هفته قبل"], ["yoy", "همان روز سال قبل"], ["none", "بدون مقایسه"]];
const COMPARE_RANGE: [HomeCompare, string][] = [["prev", "دوره قبل"], ["yoy", "همین بازه سال قبل"], ["none", "بدون مقایسه"]];
const BRANCHES: [string, string][] = [["all", "همه شعب"], ...LINES.map((l) => [l.key, l.label] as [string, string])];
const lineOf = (key: string | null) => LINES.find((line) => line.key === key);
/** «امروز» and «دیروز» are single days compared with the same weekday last week (or the same day last year). */
const isDay = (period: HomePeriodKey) => period === "today" || period === "yesterday";

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

/** A window that ends at midnight is whole; one that ends now stops «تا ساعت …». */
const wholeDay = (iso: string) => (Date.parse(iso) + 3.5 * 3_600_000) % 86_400_000 === 0;

/** «امروز ۱۴۰۵/۰۸/۲۰ تا ساعت ۱۵:۰۰  •  در برابر سه‌شنبه ۱۴۰۵/۰۸/۱۳ تا همین ساعت»;
 *  «دیروز سه‌شنبه ۱۴۰۵/۰۸/۱۹، کل روز  •  در برابر سه‌شنبه ۱۴۰۵/۰۸/۱۲، کل روز». */
function describe(range: HomeData["range"]) {
  const today = range.period === "today";
  const yesterday = range.period === "yesterday";
  const oneDay = range.period === "custom" && jdate(range.from) === jdate(lastDay(range.to));
  const current = today
    ? `امروز ${jdate(range.from)} تا ساعت ${clock(range.to)}`
    : yesterday
      ? `دیروز ${weekday(range.from)} ${jdate(range.from)}، کل روز`
      : oneDay
        ? `${weekday(range.from)} ${jdate(range.from)}${wholeDay(range.to) ? "، کل روز" : ` تا ساعت ${clock(range.to)}`}`
        : `${jdate(range.from)} تا ${jdate(lastDay(range.to))}`;
  if (range.compare === "none" || !range.compare_from || !range.compare_to) return { current, compare: null as string | null };
  const named = `${range.compare === "prev" ? `${weekday(range.compare_from)} ` : ""}${jdate(range.compare_from)}`;
  const compare = today
    ? `${named} تا همین ساعت`
    : yesterday
      ? `${named}، کل روز`
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
  const compares = isDay(period) ? COMPARE_TODAY : COMPARE_RANGE;
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
    if (key !== "custom") setCalendar(false);
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
        suffix={data.range.period === "today" ? "نسبت به همان ساعت" : data.range.period === "yesterday" ? "نسبت به همان روز" : "نسبت به مقایسه"}
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

/** Rank, sales, change, a sparkline from trend[].lines, a bar with the comparison marker; click toggles «شعبه». */
function BranchTile({ row, data, selected, onPick }: {
  row: ReturnType<typeof rankBranches>[number]; data: HomeData; selected: string | null; onPick: () => void;
}) {
  const line = lineOf(row.line);
  const color = line?.color ?? "var(--accent)";
  const on = selected === row.line;
  const dim = selected != null && !on;
  const none = data.range.compare === "none";
  const ok = data.range.comparable && !none && row.compare_sales != null;
  const day = isDay(data.range.period);
  const bars = sparkBars(data.trend, row.line);
  const sparkMax = Math.max(1, ...bars.map((v) => v ?? 0));
  const lastShown = bars.reduce<number>((last, v, i) => (v == null ? last : i), -1);
  const scale = Math.max(row.sales, ok ? row.compare_sales ?? 0 : 0) * 1.08 || 1;
  const [value, ...unit] = money(row.sales).split(" ");
  const share = row.share == null ? "—" : pct(row.share);
  const tip = `${line?.label}: ${money(row.sales)} تومان، ${fa(row.invoices)} فاکتور، ${fa(row.items)} کالا، سهم ${share}`
    + (none ? "" : ok ? `؛ ${day ? "همان زمان مقایسه" : "دوره مقایسه"}: ${money(row.compare_sales)} تومان` : "؛ مقایسه ممکن نیست");
  return (
    <button type="button" onClick={onPick} title={tip} aria-pressed={on} aria-label={`${line?.label}، فروش ${money(row.sales)} تومان؛ برای فیلتر کلیک کنید`}
      className="flex min-w-0 flex-[1_1_190px] cursor-pointer flex-col gap-[9px] rounded-[18px] border px-4 py-3.5 text-start text-inherit transition-[opacity,border-color] duration-150"
      style={{
        background: `linear-gradient(180deg, color-mix(in srgb, ${color} 8%, transparent), transparent 55%), var(--surface)`,
        borderColor: on ? color : "var(--border)",
        boxShadow: on ? `0 0 0 3px color-mix(in srgb, ${color} 20%, transparent)` : "none",
        opacity: dim ? 0.45 : 1,
      }}>
      <span className="flex items-center justify-between">
        <span className="flex items-center gap-[7px] text-[13.5px] font-semibold text-ink"><span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: color }} />{line?.label}</span>
        <span className={`rounded-full px-[7px] py-0.5 text-[11px] font-bold ${row.rank === 1 ? "bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-[var(--warning)]" : "bg-hover text-muted"}`}>#{toFaDigits(row.rank)}</span>
      </span>
      <span className="flex items-baseline gap-[5px]">
        <span className="text-2xl font-extrabold text-ink">{value}</span>
        <span className="text-[12.5px] text-muted">{unit.join(" ")}</span>
        {none ? null : <span className="ms-auto"><Delta change={row.change} ok={ok} /></span>}
      </span>
      <span aria-hidden="true" className="flex h-[38px] items-end gap-0.5">
        {bars.map((v, i) => (
          <span key={i} className="min-w-[2px] flex-1"
            style={v == null
              ? { height: "10%", borderRadius: 2, background: "var(--chart-track)" }
              : { height: `${Math.max(4, (v / sparkMax) * 80)}%`, borderRadius: "2px 2px 0 0", background: color, opacity: i === lastShown ? 1 : 0.55 }} />
        ))}
      </span>
      <span aria-hidden="true" className="relative h-1.5 rounded-[3px] bg-[var(--chart-track)]">
        <span className="absolute inset-y-0 right-0 rounded-[3px]" style={{ background: color, width: `${(row.sales / scale) * 100}%` }} />
        {ok ? <span className="absolute -inset-y-[3px] w-0.5 rounded-[1px] bg-[var(--text)]" style={{ right: `${((row.compare_sales ?? 0) / scale) * 100}%` }} /> : null}
      </span>
      <span className="flex justify-between gap-2 text-[11.5px] text-muted">
        <span>{fa(row.invoices)} فاکتور · سبد {row.basket == null ? "—" : money(row.basket)}</span>
        <span>{ok ? `مقایسه ${money(row.compare_sales)}` : `سهم ${share}`}</span>
      </span>
    </button>
  );
}

/** «کل الینور» with a donut of branch shares, then one tile per branch; above the four cards. `all` is the unfiltered
 *  payload of the same range (so every branch stays visible while one is selected), `data` until it arrives. */
function BranchTiles({ data, all, selected, compareText, onPick }: {
  data: HomeData; all: HomeData; selected: string | null; compareText: string | null; onPick: (line: HomeData["branches"][number]["line"]) => void;
}) {
  const period = data.range.period;
  const ranked = rankBranches(all.branches);
  const total = all.total ?? all.branches[0];
  const none = all.range.compare === "none";
  const ok = all.range.comparable && !none;
  const [value, ...unit] = money(total?.sales ?? 0).split(" ");
  const top = ranked[0];
  const stops = donutStops(LINES.filter((l) => all.branches.some((b) => b.line === l.key))
    .map((l) => ({ color: l.color, value: all.branches.find((b) => b.line === l.key)?.sales ?? 0 })));
  const title = period === "today" ? "امروز تا این لحظه، به تفکیک شعبه" : period === "yesterday" ? "دیروز، به تفکیک شعبه" : "فروش شعب";
  const sub = period === "today"
    ? (compareText ? `در برابر ${compareText}؛ تا آخرین همگام‌سازی، ساعت ${clock(data.sync.last_success_at)}` : `تا آخرین همگام‌سازی، ساعت ${clock(data.sync.last_success_at)}`)
    : period === "yesterday" && compareText ? `در برابر ${compareText}` : describe(data.range).current;
  return (
    <section aria-label="فروش شعب" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="flex items-center gap-2">
          {period === "today" ? <span className="h-[9px] w-[9px] rounded-full bg-[var(--delta-up)] shadow-[0_0_0_4px_var(--delta-up-bg)]" /> : null}
          <h2 className="m-0 text-[15px] font-semibold text-ink">{title}</h2>
        </span>
        <span className="text-[12.5px] text-muted">{sub}</span>
      </div>
      <div className="flex flex-wrap gap-3">
        <div title={`جمع همه شعب: ${money(total?.sales ?? 0)} تومان، ${fa(total?.invoices ?? 0)} فاکتور`}
          className={`${CARD} flex min-w-0 flex-[1.5_1_300px] items-center gap-[18px] px-[18px] py-4`}
          style={{ background: "radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 60%), var(--surface)" }}>
          <div aria-hidden="true" className="relative h-[116px] w-[116px] flex-none rounded-full" style={{ background: `conic-gradient(${stops})` }}>
            <div className="absolute inset-[14px] flex flex-col items-center justify-center gap-px rounded-full bg-surface">
              <span className="text-[11px] text-muted">سهم شعب</span>
              <b className="text-[15px] text-ink">{top && top.share != null ? `${lineOf(top.line)?.label} ${pct(top.share)}` : "—"}</b>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-[13px] text-muted">کل الینور</span>
            <span className="flex items-baseline gap-[5px]"><span className="text-[30px] font-extrabold tracking-[-.5px] text-ink">{value}</span><span className="text-[12.5px] text-muted">{unit.join(" ")} تومان</span></span>
            {none ? <span className="text-[12.5px] text-faint">بدون مقایسه</span>
              : <Delta change={total?.change ?? null} ok={ok} suffix={period === "today" ? "نسبت به همان ساعت" : "نسبت به مقایسه"} />}
            <div className="mt-1 flex flex-col gap-[3px]">
              {ranked.map((b) => (
                <span key={b.line} className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: lineOf(b.line)?.color }} />{lineOf(b.line)?.label}
                  <span className="ms-auto text-xs text-faint">{b.share == null ? "—" : pct(b.share)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
        {ranked.map((row) => <BranchTile key={row.line} row={row} data={all} selected={selected} onPick={() => onPick(row.line)} />)}
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
  const period = data.range.period;
  const day = isDay(period); // «امروز» / «دیروز»: keys are the hour 0..23
  const multi = hourly && !day && points.length > 24; // custom 2–3 days, keys "2026-11-12T14:00"
  const yoy = data.range.compare === "yoy";
  const hourLabel = (h: number) => `${toFaDigits(String(h).padStart(2, "0"))}:۰۰`;
  const hourOf = (key: string | number) => (typeof key === "number" ? key : Number(String(key).slice(11, 13)));
  const dateOf = (key: string | number) => String(key).slice(0, 10);
  const hours = (key: string | number) => `ساعت ${hourLabel(hourOf(key))} تا ${hourLabel(hourOf(key) + 1)}`;
  const title = (key: string | number) =>
    !hourly ? `${weekday(String(key))} ${jdate(String(key))}`
      : day ? hours(key) : `${weekday(dateOf(key))} ${jdate(dateOf(key))}، ${hours(key)}`;
  const cardTitle = (key: string | number) => (period === "today" ? `امروز، ${title(key)}` : period === "yesterday" ? `دیروز، ${title(key)}` : title(key));
  const axis = (key: string | number, index: number) =>
    multi ? (hourOf(key) === 0 ? formatJalali(dateOf(key)).slice(5) : hourOf(key) === 12 ? "۱۲" : "")
      : hourly ? (index % 3 === 0 ? toFaDigits(hourOf(key)) : "")
        : index % Math.max(1, Math.ceil(points.length / 10)) === 0 ? formatJalali(String(key)).slice(5) : "";
  const gap = points.length > 40 ? "gap-px" : "gap-[3px]";
  const legend = period === "today" ? "امروز، ساعتی" : period === "yesterday" ? "دیروز، ساعتی" : hourly ? "این بازه، ساعتی" : "این بازه، روزانه";
  const compareLegend = data.range.compare === "none"
    ? null
    : !data.range.comparable
      ? "مقایسه ندارد (سابقه حضوری از ۱۴۰۴/۰۳/۱۰)"
      : day
        ? yoy ? "همان روز سال قبل" : `${weekday(data.range.compare_from ?? data.range.from)} هفته قبل`
        : yoy ? "همین بازه سال قبل" : "بازه هم‌اندازه قبلی";
  const compareLabel = day
    ? yoy ? "همان ساعت سال قبل" : "همان ساعت هفته قبل"
    : hourly
      ? yoy ? "همان ساعت سال قبل" : "همان ساعت دوره قبل"
      : yoy ? "همان روز سال قبل" : "روز متناظر دوره قبل";
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
          <span className="flex items-center gap-[5px]"><span className="h-2.5 w-2.5 rounded-sm bg-accent" />{legend}</span>
          {compareLegend ? (
            <span className="flex items-center gap-[5px]">{hasCompare ? <span className="w-3.5 border-t-2 border-dashed border-ink" /> : null}{compareLegend}</span>
          ) : null}
        </span>
      </div>
      <div ref={chart} className="relative" onMouseLeave={() => setHover(null)} onKeyDown={onKey}>
        <div aria-label="نمودار روند فروش؛ برای جزئیات روی هر ستون بروید" className={`flex h-[190px] items-end ${gap} border-b border-line`}>
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
              {multi && index > 0 && hourOf(p.key) === 0 ? (
                <span aria-hidden="true" className="pointer-events-none absolute -right-px -top-1.5 bottom-0 border-r border-dashed border-faint/50" />
              ) : null}
            </button>
          ))}
        </div>
        {point ? (
          <div role="status" className="absolute top-2 z-10 flex flex-col gap-1.5 rounded-xl border border-line bg-elevated px-3.5 py-3 text-[13px] shadow-2xl"
            style={{ left, width: Math.min(CARD_WIDTH, width || CARD_WIDTH) }}>
            <span className="text-[12.5px] font-bold text-ink">{cardTitle(point.key)}</span>
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
      <div className={`flex ${gap}`}>
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
  // Branch tiles keep every branch visible while one is selected: the same range without «شعبه» (cached server-side).
  const allQuery = useMemo(() => {
    const out = { ...query };
    delete out.line;
    return out;
  }, [query]);
  const allKey = JSON.stringify(allQuery);
  const [all, setAll] = useState<{ key: string; data: HomeData } | null>(null);
  useEffect(() => {
    if (!query.line) return;
    let alive = true;
    homeService.summary(allQuery).then((d) => alive && setAll({ key: allKey, data: d })).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [allKey, query.line]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (data && !query.line && JSON.stringify(query) === key) setAll({ key, data });
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const tilesData = all && all.key === allKey ? all.data : data;

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
          <BranchTiles data={data} all={tilesData ?? data} selected={line && line !== "all" ? line : null} compareText={text?.compare ?? null}
            onPick={(picked) => setParams(toggleLine(params, picked))} />
          <Cards data={data} />
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
