import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { productsService } from "../../services/products";
import { LINES, fa, fa1, million, pct } from "./display";

const CARD = "rounded-[18px] border border-line bg-surface";
type Params = Record<string, string | number | undefined>;

function useData<T>(load: () => Promise<T>, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    load().then((d) => alive && setData(d)).catch(() => alive && setData(null)).finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, loading };
}

/** «سایز و رنگ پرفروش»: shares of net units sold in the page's scope; the toggle narrows it to one of the top categories. */
export function SizeColorSection({ params }: { params: Params }) {
  const [category, setCategory] = useState<number | null>(null);
  const query = { ...params, sc_cat: category ?? undefined };
  const { data, loading } = useData(() => productsService.sizeColor(query), JSON.stringify(query));
  const sizeMax = Math.max(0.0001, ...(data?.sizes ?? []).map((s) => s.share ?? 0));
  const toggles: [number | null, string][] = [[null, "همه"], ...(data?.categories ?? []).map((c) => [c.id, c.label] as [number, string])];
  const swatch = (hex: string | null) => hex || "var(--text-faint)";
  return (
    <section aria-label="سایز و رنگ پرفروش" className={`${CARD} flex flex-col gap-3.5 px-[18px] py-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-col gap-[3px]">
          <h2 className="m-0 text-[15px] font-semibold text-ink">سایز و رنگ پرفروش</h2>
          <span className="text-[12.5px] text-muted">سهم از تعداد فروخته‌شده در بازه؛ برای سفارش و تقسیم کالا بین شعب</span>
        </div>
        <div role="group" aria-label="دسته" className="flex flex-wrap gap-0.5 rounded-[11px] bg-elevated p-[3px]">
          {toggles.map(([id, label]) => (
            <button key={String(id)} type="button" aria-pressed={category === id} onClick={() => setCategory(id)}
              className={`min-h-8 cursor-pointer rounded-[9px] border-0 px-3 text-[12.5px] ${category === id ? "bg-accent font-semibold text-on-accent" : "bg-transparent text-muted hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className={`grid gap-[22px] [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))] ${loading ? "opacity-60" : ""}`}>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-muted">سایز</span>
          {data?.sizes.length ? data.sizes.map((s) => (
            <div key={s.label} title={`سایز ${s.label}: ${fa(s.units)} عدد، ${pct(s.share)} از فروش`} className="grid grid-cols-[56px_1fr_92px] items-center gap-2.5 text-[13px]">
              <b className="truncate text-ink">{s.label}</b>
              <span className="h-2.5 rounded-[5px] bg-[var(--chart-track)]"><span className="block h-2.5 rounded-[5px] bg-accent" style={{ width: `${((s.share ?? 0) / sizeMax) * 100}%` }} /></span>
              <span className="text-left text-[12.5px] text-muted">{fa(s.units)} عدد · {pct(s.share)}</span>
            </div>
          )) : <span className="text-[12.5px] text-muted">—</span>}
          {data?.no_size_share ? <span className="text-xs text-faint">{pct(data.no_size_share)} از اقلام سایز ثبت‌شده ندارند.</span> : null}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-muted">رنگ</span>
          {data?.colors.length ? (
            <>
              <div aria-hidden="true" className="flex h-3.5 overflow-hidden rounded-[7px] bg-[var(--chart-track)]">
                {data.colors.map((c) => <span key={c.label} title={`${c.label}: ${fa(c.units)} عدد، ${pct(c.share)}`} style={{ flex: `${c.share ?? 0} 1 0`, background: swatch(c.hex) }} />)}
              </div>
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(120px,1fr))]">
                {data.colors.map((c) => (
                  <div key={c.label} title={`${c.label}: ${fa(c.units)} عدد، ${pct(c.share)}`} className="flex items-center gap-2 rounded-[10px] bg-elevated px-2.5 py-2">
                    <span className="h-[18px] w-[18px] flex-none rounded-md border border-line" style={{ background: swatch(c.hex) }} />
                    <span className="flex min-w-0 flex-col gap-px">
                      <span className="truncate text-[12.5px] text-ink">{c.label}</span>
                      <span className="text-[11.5px] text-muted">{fa(c.units)} عدد · {pct(c.share)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : <span className="text-[12.5px] text-muted">—</span>}
        </div>
      </div>
    </section>
  );
}

/** «مرجوعی و تعویض شعب»: real in-store refunds and exchanges only; «—» where the scope has none. */
export function ReturnsSection({ params, compareOff, suffix }: { params: Params; compareOff: boolean; suffix: string }) {
  const { data, loading } = useData(() => productsService.returns(params), JSON.stringify(params));
  const t = data?.totals;
  const empty = !t || (!t.sold_units && !t.refund_invoices && !t.exchange_invoices);
  const rateMax = Math.max(0.0001, ...(data?.branches ?? []).map((b) => b.rate ?? 0));
  const points = t?.rate_points;
  const kpis = [
    {
      label: "نرخ مرجوعی", value: empty || t.rate == null ? "—" : fa1(t.rate * 100), unit: "٪ از اقلام فروخته‌شده", strong: true,
      note: compareOff || points == null || !data?.range.comparable ? "" : `${points <= 0 ? "▼" : "▲"} ${fa1(Math.abs(points))} واحد نسبت به مقایسه`,
      noteColor: points != null && points <= 0 ? "var(--delta-up)" : "var(--delta-down)", tip: "اقلام برگشتی تقسیم بر اقلام فروخته‌شده در شعب حضوری",
    },
    { label: "مرجوعی", value: empty ? "—" : fa(t.refund_invoices), unit: "فاکتور", note: empty ? "" : `${fa(t.refunded_units)} قلم کالا`, tip: "فاکتورهای برگشت از فروش" },
    { label: "تعویض", value: empty ? "—" : fa(t.exchange_invoices), unit: "فاکتور", note: empty ? "" : `${fa(t.replacement_units)} قلم جایگزین`, tip: "فاکتورهایی که کالا عوض شده" },
    {
      label: "مبلغ برگشتی", value: empty ? "—" : million(t.refunded_amount), unit: "میلیون تومان",
      note: empty || t.refunded_amount_share == null ? "" : `${fa1(t.refunded_amount_share * 100)}٪ از فروش حضوری`, tip: "جمع مبلغ ردیف‌های مرجوعی",
    },
  ];
  return (
    <section aria-label="مرجوعی و تعویض شعب" className={`${CARD} flex flex-col gap-3.5 px-[18px] py-4`}>
      <div className="flex flex-col gap-[3px]">
        <h2 className="m-0 text-[15px] font-semibold text-ink">مرجوعی و تعویض شعب</h2>
        <span className="text-[12.5px] text-muted">فقط فروش حضوری؛ مرجوعی سایت در داده‌های الینور ثبت نمی‌شود</span>
      </div>
      <div className={`grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))] ${loading ? "opacity-60" : ""}`}>
        {kpis.map((k) => (
          <div key={k.label} title={k.tip} className="flex flex-col gap-1 rounded-xl bg-elevated px-3.5 py-3">
            <span className="text-[12.5px] text-muted">{k.label}</span>
            <span className="flex items-baseline gap-1.5">
              <span className={`text-2xl font-extrabold ${k.strong && !empty ? "text-[var(--delta-down)]" : "text-ink"}`}>{k.value}</span>
              <span className="text-[12.5px] text-muted">{k.unit}</span>
            </span>
            <span className="text-xs" style={{ color: k.noteColor ?? "var(--text-secondary)" }}>{k.note}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-[22px] [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
        <div className="flex flex-col gap-0.5">
          <span className="mb-1 text-[13px] font-semibold text-muted">به تفکیک شعبه</span>
          <div className="grid grid-cols-[1fr_60px_60px_1.4fr] gap-2.5 py-1.5 text-xs text-faint"><span>شعبه</span><span>مرجوعی</span><span>تعویض</span><span>نرخ مرجوعی</span></div>
          {(data?.branches ?? []).map((b) => {
            const line = LINES.find((l) => l.key === b.line);
            return (
              <div key={b.line} title={`${line?.label}: نرخ مرجوعی ${b.rate == null ? "—" : `${fa1(b.rate * 100)}٪`}؛ ${fa(b.refunded_units)} قلم از ${fa(b.sold_units)} قلم فروخته‌شده`}
                className="grid min-h-[42px] grid-cols-[1fr_60px_60px_1.4fr] items-center gap-2.5 border-t border-line text-[13px]">
                <span className="flex items-center gap-[7px] font-semibold"><span className="h-2 w-2 rounded-[3px]" style={{ background: line?.color }} />{line?.label}</span>
                <span>{fa(b.refund_invoices)}</span>
                <span>{fa(b.exchange_invoices)}</span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 flex-1 rounded-[3px] bg-[var(--chart-track)]"><span className="block h-1.5 rounded-[3px]" style={{ background: line?.color, width: `${((b.rate ?? 0) / rateMax) * 100}%` }} /></span>
                  <b className="text-[13px] text-ink">{b.rate == null ? "—" : `${fa1(b.rate * 100)}٪`}</b>
                </span>
              </div>
            );
          })}
          {data && !data.branches.length ? <span className="text-[12.5px] text-muted">—</span> : null}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="mb-1 text-[13px] font-semibold text-muted">بیشترین مرجوعی (حداقل ۱۰ فروش)</span>
          {(data?.products ?? []).map((p) => (
            <Link key={p.id} to={`/products/${p.id}${suffix}`} title={`نرخ مرجوعی ${fa1(p.rate * 100)}٪؛ برای شناسنامه کالا بزنید`}
              className="grid min-h-[42px] grid-cols-[1fr_auto_auto] items-center gap-3 border-t border-line text-[13px] text-inherit no-underline hover:bg-hover">
              <span className="flex min-w-0 flex-col gap-px">
                <span className="truncate font-semibold text-ink">{p.title}</span>
                <span className="text-[11.5px] text-muted">{p.category || "—"} · {fa(p.units)} فروش</span>
              </span>
              <span className="text-[12.5px] text-muted">{fa(p.returned)} مرجوعی</span>
              <b className="text-[13px]" style={{ color: p.rate >= 0.08 ? "var(--delta-down)" : "var(--warning)" }}>{fa1(p.rate * 100)}٪</b>
            </Link>
          ))}
          {data && !data.products.length ? <span className="text-[12.5px] text-muted">—</span> : null}
        </div>
      </div>
    </section>
  );
}
