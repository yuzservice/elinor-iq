import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { programUrl } from "../features/calls/callsUrl";
import { LINES, STATUS, delta, fa, fa1, jdate, million, pct } from "../features/products/display";
import type { BranchRow, ProductDetail, ProductTip } from "../features/products/types";
import { ApiError } from "../services/api";
import { productsService } from "../services/products";
import { pairAction } from "./ProductsPage";

const CARD = "rounded-[18px] border border-line bg-surface";
const GHOST = "inline-flex min-h-9 cursor-pointer items-center rounded-[10px] border border-line bg-transparent px-3 text-[12.5px] text-muted no-underline hover:text-ink";
const TABS = [["sales", "فروش و سایز"], ["branches", "شعب"], ["bundle", "خرید همزمان"], ["buyers", "خریداران"]] as const;
type Tab = (typeof TABS)[number][0];
const COMPARE_LABEL: Record<string, string> = { prev: "نسبت به دوره قبل", year: "نسبت به سال قبل", custom: "نسبت به بازه مقایسه" };
const lineLabel = (key: string) => LINES.find((line) => line.key === key)?.label ?? key;
const lineColor = (key: string) => LINES.find((line) => line.key === key)?.color ?? "var(--accent)";

function daysAgo(day: string | null, to: string) {
  if (!day) return "—";
  const n = Math.round((Date.parse(to) - Date.parse(day)) / 86_400_000);
  return n <= 0 ? "امروز" : n === 1 ? "دیروز" : `${fa(n)} روز پیش`;
}

function tipCopy(tip: ProductTip, d: ProductDetail): { color: string; title: string; why: string; action?: string; tab?: Tab } {
  const cat = d.category.title || "این دسته";
  switch (tip.kind) {
    case "charge": {
      const needs = tip.needs.map((n) => [n.size ? `سایز ${n.size}` : "", n.color].filter(Boolean).join(" ")).filter(Boolean);
      return {
        color: "var(--delta-down)",
        title: `برای شارژ اقدام کنید: حدود ${fa(tip.need)} عدد برای ${fa(tip.lead)} روز آینده`,
        why: `سرعت فعلی ${fa1(tip.per_day)} عدد در روز است و موجودی انبار مرکزی ${tip.central ? `${fa(tip.central)} عدد` : "صفر"} است.${
          tip.dropped ? " فروش در ۷ روز اخیر افت کرده که با تمام شدن موجودی جور است، نه با کم شدن تقاضا." : ""
        }${needs.length ? ` بیشترین نیاز: ${needs.join("، ")}.` : ""}`,
        action: "جزئیات سایز",
        tab: "sales",
      };
    }
    case "branch": {
      const best = lineLabel(tip.best.line);
      const worst = tip.worst ? ` در ${lineLabel(tip.worst.line)} ${fa1(tip.worst.index)} است${tip.worst.last_sale ? ` و آخرین فروش ${daysAgo(tip.worst.last_sale, d.range.to)} بوده` : ""}.` : "";
      return {
        color: "var(--success)",
        title: `${best} بهترین شعبه این کالاست`,
        why: `شاخص ${best} ${fa1(tip.best.index)} است؛ یعنی این کالا در ${best} ${fa(((tip.best.index ?? 1) - 1) * 100)}٪ بیشتر از یک ${cat} معمولی می‌فروشد.${worst}`,
        action: "تفکیک شعب",
        tab: "branches",
      };
    }
    case "bundle": {
      const trend = tip.pair.trend;
      return {
        color: "var(--accent)",
        title: `${tip.pair.b_name} را کنار این کالا بچینید و در سبد آنلاین پیشنهاد دهید`,
        why: `در ${pct(tip.pair.confidence)} فاکتورهای این کالا ${tip.pair.b_name} هم بوده؛ ${fa1(tip.pair.lift)} برابر حالت تصادفی.${
          trend != null ? ` این ارتباط نسبت به بازه مقایسه ${fa(Math.abs(trend))}٪ ${trend >= 0 ? "قوی‌تر" : "ضعیف‌تر"} شده.` : ""
        }`,
        action: "خرید همزمان",
        tab: "bundle",
      };
    }
    case "no_discount":
      return {
        color: "var(--warning)",
        title: "تخفیف لازم نیست",
        why: `فقط ${pct(tip.share)} فروش با تخفیف بوده و سرعت با قیمت کامل بالاست. تخفیف دادن روی این کالا احتمالاً حاشیه سود را کم می‌کند بدون اینکه فروش زیاد شود.`,
      };
    case "try_discount":
      return {
        color: "var(--warning)",
        title: "تخفیف محدود را امتحان کنید",
        why: `فروش این کالا کند است و فقط ${pct(tip.share)} آن با تخفیف بوده؛ یک تخفیف محدود می‌تواند فروش را جابه‌جا کند.`,
      };
    case "prospects":
      return {
        color: "#a78bfa",
        title: `${fa(tip.count)} مشتری مستعد برای کمپین`,
        why: `این مشتریان در ${fa(tip.days)} روز اخیر ${cat} خریده‌اند ولی این کالا را نه.`,
        action: "ساخت لیست",
      };
  }
}

function Kpi({ label, value, unit, note, color = "var(--text-secondary)", help }: { label: string; value: string; unit: string; note: string; color?: string; help: string }) {
  return (
    <div title={help} className={`${CARD} flex flex-col gap-1.5 px-[18px] py-3.5`}>
      <span className="text-[13px] text-muted">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-[25px] font-extrabold tracking-tight text-ink">{value}</span>
        <span className="text-[12.5px] text-muted">{unit}</span>
      </span>
      <span className="text-[12.5px]" style={{ color }}>{note}</span>
    </div>
  );
}

function Badge({ color, children }: { color: string; children: ReactNode }) {
  return <span className="rounded-full px-[11px] py-[3px] text-[12.5px] font-semibold" style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}>{children}</span>;
}

function SalesTab({ d }: { d: ProductDetail }) {
  const max = Math.max(1, ...d.daily.map((p) => p.units), d.category_day ?? 0);
  const fromStart = d.first_sale_date && d.daily[0]?.day === d.first_sale_date;
  const sizes = [...new Set(d.sizes.map((s) => s.size))].sort();
  const colors = [...new Set(d.sizes.map((s) => s.color))];
  const cellMax = Math.max(1, ...d.sizes.map((s) => s.units));
  const bySize = sizes.map((size) => ({ size, perDay: d.sizes.filter((s) => s.size === size).reduce((sum, s) => sum + s.units, 0) / d.size_days }));
  const speedMax = Math.max(0.0001, ...bySize.map((s) => s.perDay));
  const recent = d.daily.length - 7;
  return (
    <div className="flex flex-wrap items-stretch gap-3">
      <section className={`${CARD} flex min-w-0 flex-[2_1_480px] flex-col gap-2.5 px-[18px] py-4`}>
        <div className="flex flex-wrap items-center justify-between gap-1">
          <h2 className="m-0 text-sm font-semibold text-ink">{fromStart ? "فروش روزانه از روز اول" : "فروش روزانه (۱۸۰ روز اخیر)"}</h2>
          {d.category_day != null ? <span className="text-[12.5px] text-muted">خط نقطه‌چین: میانگین یک کالای معمولی همین دسته</span> : null}
        </div>
        <div role="img" aria-label="نمودار فروش روزانه" className="relative flex h-[150px] items-end gap-[3px] border-b border-line">
          {d.category_day != null ? (
            <span className="absolute inset-x-0 border-t border-dashed border-amber-400/70" style={{ bottom: `${(d.category_day / max) * 100}%` }} />
          ) : null}
          {d.daily.map((point, i) => (
            <span
              key={point.day}
              title={`${jdate(point.day)}: ${fa(point.units)} عدد`}
              className="min-w-0 flex-1 rounded-t-sm"
              style={{ height: `${Math.max(2, (point.units / max) * 100)}%`, background: d.stock_flag === "out" && i >= recent ? "var(--delta-down)" : "var(--accent)" }}
            />
          ))}
        </div>
        <div className="flex justify-between text-[12.5px] text-muted">
          <span>{fromStart ? "روز ۱" : jdate(d.daily[0]?.day)}</span>
          <span>{fromStart ? `امروز (روز ${fa(d.daily.length)})` : "امروز"}</span>
        </div>
      </section>
      <section className={`${CARD} flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 px-[18px] py-4`}>
        <h2 className="m-0 text-sm font-semibold text-ink">سایز و رنگ</h2>
        {d.sizes.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-[3px] text-[12.5px]">
                <thead>
                  <tr><th scope="col" />{sizes.map((size) => <th key={size} scope="col" className="px-1.5 py-0.5 text-center font-medium text-muted">{size}</th>)}</tr>
                </thead>
                <tbody>
                  {colors.map((color) => (
                    <tr key={color}>
                      <th scope="row" className="whitespace-nowrap px-1.5 py-0.5 text-right font-medium text-muted">{color}</th>
                      {sizes.map((size) => {
                        const units = d.sizes.find((s) => s.color === color && s.size === size)?.units ?? 0;
                        return (
                          <td key={size} title={`${color}، سایز ${size}: ${fa(units)} عدد`} className="min-w-[42px] rounded-md px-2 py-1.5 text-center text-ink"
                            style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(8 + (units / cellMax) * 60)}%, transparent)` }}>
                            {fa(units)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <span className="text-[12.5px] text-muted">سرعت هر سایز (عدد در روز)</span>
            {bySize.map((s) => (
              <div key={s.size} className="grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-2.5 text-[12.5px]">
                <span>{s.size}</span>
                <span className="h-1.5 rounded-[3px] bg-[var(--chart-track)]"><span className="block h-1.5 rounded-[3px] bg-accent" style={{ width: `${(s.perDay / speedMax) * 100}%` }} /></span>
                <span className="text-left font-semibold">{fa1(s.perDay)}</span>
              </div>
            ))}
          </>
        ) : (
          <p className="m-0 text-[12.5px] text-muted">در این بازه فروشی ثبت نشده است.</p>
        )}
      </section>
    </div>
  );
}

function branchTip(row: BranchRow) {
  if (row.index == null) return "—";
  if (row.index >= 1.2) return "بهتر از معمول؛ سهم بیشتری از شارژ بعدی بفرستید";
  if (row.index < 0.8) return "ضعیف؛ سهم کمتری از شارژ بعدی بفرستید";
  return "عادی";
}

function BranchesTab({ d }: { d: ProductDetail }) {
  return (
    <section className={`${CARD} overflow-x-auto px-3 py-1`}>
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="text-muted">
            <th scope="col" className="px-2.5 py-1.5 text-right font-medium">شعبه</th>
            <th scope="col" title="تعداد فروش این کالا در این شعبه در بازه." className="px-2.5 py-1.5 text-right font-medium">تعداد فروش</th>
            <th scope="col" title="سهم این شعبه از فروش این کالا." className="px-2.5 py-1.5 text-right font-medium">سهم</th>
            <th scope="col" title="سهم شعبه از این کالا تقسیم بر سهم شعبه از کل دسته. بالای ۱ یعنی این کالا در این شعبه بهتر از معمول می‌فروشد." className="px-2.5 py-1.5 text-right font-medium">شاخص شعبه</th>
            <th scope="col" title="آخرین روزی که در این شعبه فروش داشته است." className="px-2.5 py-1.5 text-right font-medium">آخرین فروش</th>
            <th scope="col" className="px-2.5 py-1.5 text-right font-medium">پیشنهاد</th>
          </tr>
        </thead>
        <tbody className="whitespace-nowrap">
          {d.branches.map((b) => (
            <tr key={b.line} className="border-t border-line">
              <td className="px-2.5 py-[9px]"><span className="flex items-center gap-[7px]"><span className="h-2 w-2 rounded-full" style={{ background: lineColor(b.line) }} /><span className="font-semibold">{lineLabel(b.line)}</span></span></td>
              <td className="px-2.5 py-[9px] font-semibold">{fa(b.units)} عدد</td>
              <td className="px-2.5 py-[9px]">{pct(b.share)}</td>
              <td className="px-2.5 py-[9px] font-semibold" style={{ color: b.index == null ? "var(--text-faint)" : b.index >= 1.2 ? "var(--delta-up)" : b.index < 0.8 ? "var(--warning)" : undefined }}>{fa1(b.index)}</td>
              <td className="px-2.5 py-[9px] text-muted">{daysAgo(b.last_sale, d.range.to)}</td>
              <td className="px-2.5 py-[9px] text-muted">{branchTip(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function BundleTab({ d }: { d: ProductDetail }) {
  if (!d.pairs.results.length) return <section className={`${CARD} p-6 text-center text-[12.5px] text-muted`}>جفتی با دست‌کم ۵ سبد مشترک در این بازه پیدا نشد.</section>;
  return (
    <section className={`${CARD} overflow-x-auto px-3 py-1`}>
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="text-muted">
            <th scope="col" className="px-2.5 py-1.5 text-right font-medium">کالای همراه</th>
            <th scope="col" title="در چند فاکتور با این کالا بوده است." className="px-2.5 py-1.5 text-right font-medium">سبد مشترک</th>
            <th scope="col" title="از خریداران این کالا، چند درصد آن را هم در همان فاکتور خریدند." className="px-2.5 py-1.5 text-right font-medium">همراه این کالا</th>
            <th scope="col" title="چند برابر حالت تصادفی با هم خریده شده‌اند. بالای ۲× یعنی ارتباط واقعی." className="px-2.5 py-1.5 text-right font-medium">قدرت ارتباط</th>
            <th scope="col" className="px-2.5 py-1.5 text-right font-medium">پیشنهاد</th>
          </tr>
        </thead>
        <tbody className="whitespace-nowrap">
          {d.pairs.results.map((p) => (
            <tr key={p.b} className="border-t border-line">
              <td className="px-2.5 py-[9px] font-semibold"><Link to={`/products/${p.b}`} className="text-ink no-underline hover:underline">{p.b_name}</Link></td>
              <td className="px-2.5 py-[9px]">{fa(p.baskets)}</td>
              <td className="px-2.5 py-[9px]">{pct(p.confidence)}</td>
              <td className="px-2.5 py-[9px] font-semibold" style={{ color: p.lift >= 2 ? "var(--delta-up)" : "var(--text-secondary)" }}>{fa1(p.lift)}×</td>
              <td className="px-2.5 py-[9px] text-muted">{pairAction(p.lift, "all")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function BuyersTab({ d }: { d: ProductDetail }) {
  const b = d.buyers;
  if (!b) return <section className={`${CARD} p-6 text-center text-[12.5px] text-muted`}>خریدار شناخته‌شده‌ای برای این کالا ثبت نشده است.</section>;
  const max = Math.max(1, ...b.tiers.map((t) => t.count));
  const stats = [
    ["خریداران", fa(b.buyers), "نفر، از اولین فروش", "تعداد مشتری متمایز که این کالا را خریده‌اند (اکانت‌های داخلی حساب نمی‌شوند)."],
    ["مشتری تازه", pct(b.new_share), "اولین خریدشان از الینور بوده", "سهم خریدارانی که این کالا در اولین خریدشان بوده."],
    ["خرید دوباره", pct(b.repeat_share), "بیش از یک عدد یا دوباره خریده‌اند", "سهم خریدارانی که این کالا را بیش از یک عدد یا در بیش از یک فاکتور خریده‌اند."],
    ["میانگین سبد همراه", million(b.avg_basket), "میلیون تومان", "میانگین جمع ردیف‌های فاکتورهایی که این کالا در آن‌ها بوده."],
  ];
  return (
    <div className="flex flex-col gap-3">
      <section className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {stats.map(([a, value, c, help]) => (
          <div key={a} title={help} className={`${CARD} flex flex-col gap-1 px-[18px] py-3.5`}>
            <span className="text-[12.5px] text-muted">{a}</span>
            <span className="text-[22px] font-extrabold text-ink">{value}</span>
            <span className="text-[12.5px] text-muted">{c}</span>
          </div>
        ))}
      </section>
      {b.tiers.length ? (
        <section className={`${CARD} flex flex-col gap-2 px-[18px] py-4`}>
          <h2 className="m-0 text-sm font-semibold text-ink">خریداران به تفکیک سطح</h2>
          {b.tiers.map((t) => (
            <div key={t.code} className="grid grid-cols-[96px_minmax(0,1fr)_44px] items-center gap-2.5 text-[13px]">
              <span className="truncate">{t.label}</span>
              <span className="h-[7px] rounded bg-[var(--chart-track)]"><span className="block h-[7px] rounded bg-[#a78bfa]" style={{ width: `${(t.count / max) * 100}%` }} /></span>
              <span className="text-left font-semibold">{fa(t.count)}</span>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

export function Product360Page() {
  const { id } = useParams();
  const productId = Number(id);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState<ProductDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const tab = (TABS.find(([key]) => key === searchParams.get("tab"))?.[0] ?? "sales") as Tab;
  const rangeParams = { period: searchParams.get("period") ?? undefined, from: searchParams.get("from") ?? undefined, to: searchParams.get("to") ?? undefined,
    compare: searchParams.get("compare") ?? undefined, cfrom: searchParams.get("cfrom") ?? undefined, cto: searchParams.get("cto") ?? undefined };
  const rangeKey = JSON.stringify(rangeParams);

  useEffect(() => {
    let alive = true;
    setError("");
    productsService.detail(productId, rangeParams).then((d) => alive && setData(d)).catch(() => alive && setError("اطلاعات این کالا بارگیری نشد."));
    return () => {
      alive = false;
    };
  }, [productId, rangeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "sales") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  const makeList = async (kind: "buyers" | "prospects") => {
    setBusy(true);
    setMessage("");
    try {
      const created = await productsService.callList(productId, kind);
      navigate(programUrl(created.program_id, "form"));
    } catch (err) {
      setMessage(err instanceof ApiError && err.message ? err.message : "ساخت لیست انجام نشد.");
      setBusy(false);
    }
  };
  const back = () => (location.key !== "default" ? navigate(-1) : navigate("/products"));

  if (error) return <p className={`${CARD} m-0 p-4 text-[13px] text-[var(--delta-down)]`}>{error}</p>;
  if (!data || data.id !== productId) return <div className={`${CARD} mx-auto h-[320px] w-full max-w-[1280px] animate-pulse`} />;
  const d = data;
  const k = d.kpis;
  const status = d.status ? STATUS[d.status] : null;
  const showDelta = d.range.compare !== "none";
  const change = delta(k.revenue_change);
  const ratioColor = k.ratio == null ? undefined : k.ratio >= 1.2 ? "var(--delta-up)" : k.ratio < 0.8 ? "var(--warning)" : undefined;
  const meta = [
    d.category.path || null,
    d.first_sale_date ? `اولین فروش ${fa(d.age)} روز پیش (${jdate(d.first_sale_date)})` : null,
    d.price ? `قیمت ${fa1(d.price / 1_000_000)} میلیون تومان` : null,
    d.central_stock != null ? `موجودی انبار مرکزی ${fa(d.central_stock)} عدد` : null,
  ].filter(Boolean).join("؛ ");

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-3.5 pb-14">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={back} className={GHOST}>بازگشت به محصولات</button>
        <span className="text-[12.5px] text-muted">
          بازه: {jdate(d.range.from)} تا {jdate(d.range.to)}
          {showDelta && d.range.compare_from ? ` در برابر ${jdate(d.range.compare_from)} تا ${jdate(d.range.compare_to)}` : ""}
        </span>
      </div>

      <section className={`${CARD} flex flex-wrap items-center justify-between gap-x-6 gap-y-3.5 px-5 py-[18px]`}>
        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-[7px]">
          <span dir="ltr" className="text-right text-[12.5px] text-muted">{d.code}</span>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="m-0 text-[22px] font-extrabold text-ink">{d.title}</h1>
            {status ? <Badge color={status.color}>{status.label}</Badge> : null}
            {d.stock_flag === "charge" ? <Badge color="var(--delta-down)">نیاز به شارژ فوری</Badge> : null}
            {d.stock_flag === "out" ? <Badge color="var(--delta-down)">احتمالاً تمام شده</Badge> : null}
          </div>
          <span className="text-[12.5px] text-muted">{meta}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || !d.buyers} onClick={() => makeList("buyers")}
            className="min-h-[42px] cursor-pointer rounded-[11px] border-0 bg-accent px-4 text-[13px] font-semibold text-on-accent disabled:opacity-50">
            ساخت لیست تماس از خریداران
          </button>
          <button type="button" disabled={busy || !d.prospects} onClick={() => makeList("prospects")} className={`${GHOST} min-h-[42px] disabled:opacity-50`}>
            لیست مشتریان مستعد
          </button>
        </div>
      </section>
      {message ? <p role="status" className="m-0 rounded-xl bg-accent/15 px-3.5 py-2 text-[13px]">{message}</p> : null}

      <section aria-label="شاخص‌های کالا" className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <Kpi
          label="فروش" value={million(k.revenue)} unit="میلیون تومان" help="مبلغ و تعداد فروش در بازه."
          note={`${fa(k.units)} عدد${showDelta ? `؛ ${k.revenue_change == null ? "مقایسه در دسترس نیست" : `${change.text} ${COMPARE_LABEL[d.range.compare]}`}` : ""}`}
          color={showDelta && k.revenue_change != null ? change.color : undefined}
        />
        <Kpi
          label="فروش هفتگی" value={fa1(k.speed)} unit="عدد خالص" help="میانگین فروش هفتگی بعد از کم کردن مرجوعی، و مقایسه با یک کالای معمولی همان دسته."
          note={k.ratio == null ? "مقایسه با دسته در دسترس نیست" : `${fa1(k.ratio)}× یک ${d.category.title || "کالای"} معمولی`} color={ratioColor}
        />
        <Kpi
          label="فروش ۱۴ روز اول" value={fa(k.first14)} unit="عدد" help="تعداد فروش در دو هفته اول. نشان می‌دهد کالا چقدر خوب شروع کرده."
          note={k.first14_rank ? `رتبه ${fa(k.first14_rank)} در ${d.category.title} (کالاهای یک سال اخیر)` : "کالای یک سال اخیر نیست"}
        />
        <Kpi label="مرجوعی و تخفیف" value={pct(k.return_rate)} unit="مرجوعی" help="درصد برگشتی و درصد فروشی که با تخفیف بوده." note={`${pct(k.discount_share)} فروش با تخفیف`} />
      </section>

      <section aria-label="پیشنهادهای هوشمند" className={`${CARD} flex flex-col gap-1 px-[18px] py-4`}>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1">
          <h2 className="m-0 text-[15px] font-semibold text-ink">پیشنهادها برای این کالا</h2>
          <span className="text-[12.5px] text-muted">هر پیشنهاد دلیلش را از داده می‌گوید</span>
        </div>
        {d.tips.length ? (
          d.tips.map((tip) => {
            const copy = tipCopy(tip, d);
            const act = tip.kind === "prospects" ? () => makeList("prospects") : copy.tab ? () => setTab(copy.tab!) : undefined;
            return (
              <div key={tip.kind} className="grid grid-cols-[6px_minmax(0,1fr)_auto] items-start gap-3 border-t border-line py-3">
                <span className="h-full min-h-[34px] w-1.5 rounded-[3px]" style={{ background: copy.color }} />
                <div className="flex min-w-0 flex-col gap-[3px]">
                  <span className="text-[13.5px] font-semibold text-ink">{copy.title}</span>
                  <span className="text-[12.5px] leading-[1.8] text-muted">{copy.why}</span>
                </div>
                {copy.action && act ? <button type="button" disabled={busy} onClick={act} className={GHOST}>{copy.action}</button> : null}
              </div>
            );
          })
        ) : (
          <p className="m-0 border-t border-line pt-3 text-[12.5px] text-muted">برای این کالا در این بازه پیشنهادی از داده به دست نیامد.</p>
        )}
      </section>

      <nav aria-label="بخش‌های کالا" className="mt-1 flex gap-[22px] overflow-x-auto border-b border-line">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}
            className={`-mb-px min-h-11 flex-none cursor-pointer border-0 border-b-2 bg-transparent px-0.5 text-sm ${tab === key ? "border-accent font-semibold text-ink" : "border-transparent text-muted"}`}>
            {label}
          </button>
        ))}
      </nav>
      {tab === "sales" ? <SalesTab d={d} /> : null}
      {tab === "branches" ? <BranchesTab d={d} /> : null}
      {tab === "bundle" ? <BundleTab d={d} /> : null}
      {tab === "buyers" ? <BuyersTab d={d} /> : null}
    </div>
  );
}

