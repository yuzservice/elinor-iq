import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { JalaliRangePopover } from "../components/JalaliDatePicker";
import { TargetsSection, money } from "../features/home/TargetsSection";
import type { AttentionItem, HomeData, HomePeriodKey } from "../features/home/types";
import { LINES, delta, fa, jdate, pct } from "../features/products/display";
import { toFaDigits } from "../lib/dates";
import { tehranTodayIso } from "../lib/format";
import { homeService } from "../services/home";

const CARD = "rounded-[18px] border border-line bg-surface";
const PERIODS: [HomePeriodKey, string][] = [["today", "امروز"], ["7", "۷ روز"], ["30", "۳۰ روز"], ["90", "۹۰ روز"], ["custom", "دلخواه"]];
const lineOf = (key: string | null) => LINES.find((line) => line.key === key);

function since(iso: string | null) {
  if (!iso) return "هنوز انجام نشده";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "همین حالا";
  if (minutes < 60) return `${fa(minutes)} دقیقه پیش`;
  if (minutes < 60 * 24) return `${fa(Math.floor(minutes / 60))} ساعت پیش`;
  return jdate(iso);
}

function clock(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";
}

function weekday(iso: string) {
  return new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", weekday: "long" }).format(new Date(`${iso}T12:00:00+03:30`));
}

function Delta({ change, suffix = "" }: { change: number | null | undefined; suffix?: string }) {
  const d = delta(change);
  return <span className="text-[12.5px] font-semibold" style={{ color: d.color }}>{d.text}{change != null && suffix ? ` ${suffix}` : ""}</span>;
}

function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <span className="w-[90px]" />;
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  // RTL: the newest point is on the left.
  const points = values.map((v, i) => `${(88 - (i * 86) / (values.length - 1)).toFixed(1)},${(28 - ((v - min) / range) * 26).toFixed(1)}`).join(" ");
  return (
    <svg width="90" height="30" viewBox="0 0 90 30" aria-hidden="true" className="flex-none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Header({ data, params, setParams }: { data: HomeData | null; params: URLSearchParams; setParams: (p: URLSearchParams) => void }) {
  const [calendar, setCalendar] = useState(false);
  const period = (PERIODS.find(([key]) => key === params.get("period"))?.[0] ?? "30") as HomePeriodKey;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const today = tehranTodayIso();
  const pick = (key: HomePeriodKey) => {
    const next = new URLSearchParams();
    if (key !== "30") next.set("period", key);
    if (key === "custom") {
      next.set("from", from || data?.range.from.slice(0, 10) || today);
      next.set("to", to || today);
      setCalendar(true);
    }
    setParams(next);
  };
  const failed = Boolean(data?.sync.failed);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-extrabold text-ink">خانه</h1>
        <span className="text-[12.5px] text-muted">ارقام از داده همگام‌شده با سایت و فروشگاه‌هاست، نه لحظه‌ای.</span>
      </div>
      <div className="relative flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-[7px] rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: failed ? "var(--delta-down)" : "var(--delta-up)" }} />
          آخرین همگام‌سازی: {since(data?.sync.last_success_at ?? null)}
        </span>
        <div role="group" aria-label="بازه" className="flex flex-wrap gap-0.5 rounded-[11px] bg-elevated p-[3px]">
          {PERIODS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={period === key} onClick={() => pick(key)}
              className={`min-h-8 cursor-pointer rounded-[9px] border-0 px-3 text-[12.5px] ${period === key ? "bg-accent font-semibold text-on-accent" : "bg-transparent text-muted hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </div>
        {period === "custom" ? (
          <button type="button" aria-expanded={calendar} onClick={() => setCalendar(!calendar)}
            className={`inline-flex min-h-[34px] cursor-pointer items-center gap-2 rounded-[10px] border bg-elevated px-3 text-[13px] text-ink ${calendar ? "border-accent" : "border-line"}`}>
            {jdate(from)} تا {jdate(to)}
            <span aria-hidden="true" className="text-[10px] text-faint">▾</span>
          </button>
        ) : null}
        {calendar ? (
          <div className="absolute left-0 top-full z-40 w-[292px]">
            <JalaliRangePopover
              from={from}
              to={to}
              max={today}
              onClose={() => setCalendar(false)}
              onApply={(a, b) => {
                setParams(new URLSearchParams({ period: "custom", from: a, to: b }));
                setCalendar(false);
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Today({ data }: { data: HomeData }) {
  const t = data.today;
  const day = weekday(t.compare_day);
  const items: [string, string, ReactNode][] = [
    ["فروش", money(t.sales), <Delta key="s" change={t.sales_change} suffix={`نسبت به ${day} قبل`} />],
    ["فاکتور", fa(t.invoices), <Delta key="i" change={t.invoices_change} />],
    ["خریدار", fa(t.buyers), <Delta key="b" change={t.buyers_change} />],
    ["یک ساعت اخیر", money(t.last_hour_sales), null],
  ];
  return (
    <section aria-label="امروز" className={`${CARD} flex flex-wrap items-center justify-between gap-x-7 gap-y-3 px-5 py-3.5`}>
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-2 text-[15px] font-bold text-ink">
          <span className="h-[9px] w-[9px] rounded-full bg-[var(--delta-up)] shadow-[0_0_0_4px_var(--delta-up-bg)]" />
          امروز تا این لحظه
        </span>
        <span className="text-[11.5px] text-faint">تا آخرین همگام‌سازی، ساعت {clock(data.sync.last_success_at)}</span>
      </span>
      {items.map(([label, value, change]) => (
        <span key={label} className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-[12.5px] text-muted">{label}</span>
          <b className="text-base text-ink">{value}</b>
          {change}
        </span>
      ))}
    </section>
  );
}

function Trend({ data }: { data: HomeData }) {
  const cur = data.trend.current;
  const cmp = data.trend.compare;
  const max = Math.max(1, ...cur.map((p) => p.sales), ...cmp);
  const hourly = data.range.bucket === "hour";
  const label = (iso: string) => (hourly ? clock(iso) : jdate(iso));
  const n = Math.max(cur.length, 1);
  const line = cmp.length
    ? cmp.slice(0, n).map((v, i) => `${(300 - ((i + 0.5) * 300) / n).toFixed(1)},${(100 - (v / max) * 100).toFixed(1)}`).join(" ")
    : "";
  return (
    <section aria-label="روند فروش" className={`${CARD} flex min-w-0 flex-[2_1_520px] flex-col gap-2.5 px-[18px] py-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[15px] font-semibold text-ink">{hourly ? "روند فروش امروز (ساعتی)" : "روند فروش روزانه"}</h2>
        <span className="flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-[5px]"><span className="h-2.5 w-2.5 rounded-sm bg-accent" />این بازه</span>
          <span className="flex items-center gap-[5px]"><span className="w-3.5 border-t-2 border-dashed border-[var(--text-secondary)]" />{cmp.length ? "بازه مقایسه" : "مقایسه ندارد"}</span>
        </span>
      </div>
      <div className="relative h-[180px]">
        <div role="img" aria-label="نمودار فروش" className="absolute inset-0 flex items-end gap-[3px] border-b border-line">
          {cur.map((p, i) => (
            <span key={p.at} title={`${label(p.at)}: ${money(p.sales)} تومان`} className="min-w-0 flex-1 rounded-t-[3px] bg-accent"
              style={{ height: `${Math.max(1, (p.sales / max) * 100)}%`, opacity: i === cur.length - 1 ? 1 : 0.75 }} />
          ))}
        </div>
        {line ? (
          <svg viewBox="0 0 300 100" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
            <polyline points={line} fill="none" stroke="var(--text-secondary)" strokeWidth="1.2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : null}
      </div>
      <div className="flex justify-between text-[12.5px] text-muted">
        <span>{cur[0] ? label(cur[0].at) : ""}</span>
        <span>{cur.length ? label(cur[cur.length - 1].at) : ""}</span>
      </div>
    </section>
  );
}

function Branches({ data }: { data: HomeData }) {
  const max = Math.max(1, ...data.branches.map((b) => b.sales));
  return (
    <section aria-label="شعب" className={`${CARD} flex min-w-0 flex-[1_1_300px] flex-col gap-3 px-[18px] py-4`}>
      <h2 className="m-0 text-[15px] font-semibold text-ink">فروش شعب</h2>
      {data.branches.map((b) => {
        const line = lineOf(b.line);
        return (
          <div key={b.line} className="flex flex-col gap-[5px]">
            <div className="flex justify-between text-[13px]">
              <span className="flex items-center gap-[7px]"><span className="h-2 w-2 rounded-full" style={{ background: line?.color }} />{line?.label}</span>
              <span className="flex items-center gap-2"><b>{money(b.sales)}</b><Delta change={b.change} /></span>
            </div>
            <div className="h-1.5 rounded-[3px] bg-[var(--chart-track)]">
              <div className="h-1.5 rounded-[3px]" style={{ background: line?.color, width: `${(b.sales / max) * 100}%` }} />
            </div>
            <span className="text-[12.5px] text-muted">{fa(b.invoices)} فاکتور</span>
          </div>
        );
      })}
    </section>
  );
}

function Kpi({ to, label, link, value, unit, change, note, spark, color, help }: {
  to: string; label: string; link: string; value: string; unit: string; change: number | null; note: string; spark: number[]; color: string; help: string;
}) {
  return (
    <Link to={to} title={help} className={`${CARD} flex flex-col gap-1.5 px-[18px] py-[15px] text-inherit no-underline hover:border-accent`}>
      <span className="flex justify-between"><span className="text-[13px] text-muted">{label}</span><span className="text-[12.5px] text-muted">{link} ‹</span></span>
      <span className="flex items-end justify-between gap-2.5">
        <span className="flex flex-col gap-1">
          <span className="flex items-baseline gap-1.5"><span className="text-[26px] font-extrabold text-ink">{value}</span><span className="whitespace-nowrap text-[12.5px] text-muted">{unit}</span></span>
          <Delta change={change} suffix="نسبت به دوره قبل" />
        </span>
        <Spark values={spark} color={color} />
      </span>
      <span className="text-[12.5px] text-muted">{note}</span>
    </Link>
  );
}

function Cards({ data }: { data: HomeData }) {
  const { sales, invoices, basket, buyers } = data.cards;
  const split = (n: number | null) => (n == null ? "—" : pct(n));
  const [salesValue, salesUnit] = (money(sales.value) || "—").split(" ");
  const [basketValue, basketUnit] = (money(basket.value) || "—").split(" ");
  const best = lineOf(basket.best_line);
  return (
    <section aria-label="شاخص‌ها" className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
      <Kpi to="/sales" label="فروش" link="فروش" value={salesValue} unit={`${salesUnit ?? ""} تومان`} change={sales.change} spark={sales.spark} color="var(--accent)"
        note={sales.online_share == null ? "فروشی ثبت نشده" : `آنلاین ${split(sales.online_share)}، حضوری ${split(1 - sales.online_share)}`} help="فروش خالص بازه: ارزش سفارش‌های آنلاین + ردیف‌های فروش فروشگاه‌ها." />
      <Kpi to="/sales" label="تعداد فاکتور" link="فروش" value={fa(invoices.value)} unit="فاکتور" change={invoices.change} spark={invoices.spark} color="var(--delta-up)"
        note={`آنلاین ${fa(invoices.online)}، حضوری ${fa(invoices.in_store)}`} help="سفارش‌های آنلاین معتبر + فاکتورهای فروش فروشگاه‌ها." />
      <Kpi to="/sales" label="میانگین سبد خرید" link="فروش" value={basketValue} unit={`${basketUnit ?? ""} تومان`} change={basket.change} spark={basket.spark} color="#a78bfa"
        note={best ? `بیشترین: ${best.label} ${money(basket.best_value)}` : "—"} help="فروش تقسیم بر تعداد فاکتور." />
      <Kpi to="/customers" label="خریداران فعال" link="مشتریان" value={fa(buyers.value)} unit="نفر" change={buyers.change} spark={buyers.spark} color="var(--warning)"
        note={buyers.new_share == null ? "—" : `${pct(buyers.new_share)} مشتری جدید`} help="مشتریانی که در این بازه خرید کرده‌اند، بدون اکانت‌های داخلی. مشتری جدید: اولین خریدش در همین بازه بوده." />
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
        <span className="text-[12.5px] text-muted">از همه بخش‌ها، فقط چیزهایی که اقدام می‌خواهند</span>
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
    const period = params.get("period") ?? "30";
    return period === "custom" ? { period, from: params.get("from") ?? "", to: params.get("to") ?? "" } : { period };
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

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-3.5 pb-14">
      <Header data={data} params={params} setParams={setParams} />
      {error ? <p className={`${CARD} m-0 p-4 text-[13px] text-[var(--delta-down)]`}>صفحه خانه بارگیری نشد. دوباره تلاش کنید.</p> : null}
      {data ? (
        <div className={`flex flex-col gap-3.5 ${loading ? "opacity-60" : ""}`}>
          <Today data={data} />
          <div className="flex flex-wrap items-stretch gap-3">
            <Trend data={data} />
            <Branches data={data} />
          </div>
          <TargetsSection />
          <Cards data={data} />
          <Attention items={data.attention} />
        </div>
      ) : (
        <div className={`${CARD} h-[420px] animate-pulse`} />
      )}
    </div>
  );
}

