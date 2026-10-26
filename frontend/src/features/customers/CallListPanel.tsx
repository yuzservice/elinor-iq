import { useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, ErrorState, Skeleton } from "../../components/Table";
import { useApi } from "../../hooks/useApi";
import { formatCompactToman, formatMobile, formatNumber } from "../../lib/format";
import { customersService } from "../../services/customers";
import { SALES_LINE_OPTIONS } from "./customerListFilters";
import { RFM_SEGMENTS, rfmSegment } from "./rfmDisplay";

const PER_PAGE = 20;
const PAYMENT_OPTIONS = [
  { value: "", label: "همه کانال‌های پرداخت" },
  { value: "snappay", label: "اسنپ‌پی" },
  { value: "digipay", label: "دیجی‌پی" },
  { value: "other", label: "سایر" },
];
const SELECT = "rounded-xl border border-line bg-elevated px-3 py-1.5 text-xs text-ink focus:border-accent focus:outline-none";

export function CallListPanel() {
  const [segment, setSegment] = useState("");
  const [salesLine, setSalesLine] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const params = {
    segment: segment || undefined,
    sales_line: salesLine || undefined,
    payment_method: paymentMethod || undefined,
  };
  const { data, loading, error } = useApi(
    () => customersService.callList({ ...params, page, per_page: PER_PAGE }),
    [segment, salesLine, paymentMethod, page],
  );
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : 1;

  const change = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const exportCsv = async () => {
    setExporting(true);
    setExportError("");
    try {
      await customersService.exportCallList(params);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "خروجی با خطا مواجه شد.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black tracking-tight text-ink sm:text-xl">لیست تماس</h2>
          <p className="mt-1 text-xs leading-5 text-muted">مشتریانی که از فاصله‌ی معمول خریدشان گذشته‌اند؛ به ترتیب ارزش.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="سگمنت" value={segment} onChange={(event) => change(setSegment)(event.target.value)} className={SELECT}>
            <option value="">همه سگمنت‌ها</option>
            {RFM_SEGMENTS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
          <select aria-label="شعبه" value={salesLine} onChange={(event) => change(setSalesLine)(event.target.value)} className={SELECT}>
            <option value="">همه شعب و آنلاین</option>
            {SALES_LINE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select aria-label="کانال پرداخت" value={paymentMethod} onChange={(event) => change(setPaymentMethod)(event.target.value)} className={SELECT}>
            {PAYMENT_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting || !data?.total}
            className="rounded-xl border border-line bg-elevated px-3 py-1.5 text-xs font-bold text-muted hover:text-ink disabled:opacity-40"
          >
            {exporting ? "در حال استخراج..." : "خروجی CSV"}
          </button>
        </div>
      </div>
      {exportError ? <p className="text-xs text-rose-600 dark:text-rose-400">{exportError}</p> : null}

      {loading && !data ? (
        <Skeleton className="h-64" />
      ) : error && !data ? (
        <ErrorState />
      ) : !data || !data.results.length ? (
        <EmptyState title="مشتری‌ای در لیست تماس نیست." body="با این فیلترها کسی از فاصله‌ی معمول خریدش عقب نیفتاده است." />
      ) : (
        <section className={`bento-card glass-rim p-4 shadow-soft sm:p-5 ${loading ? "opacity-60" : ""}`}>
          <p className="mb-3 text-[11px] text-muted">{formatNumber(data.total)} مشتری</p>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="px-2 py-2 font-semibold">مشتری</th>
                  <th className="px-2 py-2 font-semibold">سگمنت</th>
                  <th className="px-2 py-2 font-semibold">روز از آخرین خرید</th>
                  <th className="px-2 py-2 font-semibold">فاصله معمول</th>
                  <th className="px-2 py-2 font-semibold">روز تأخیر</th>
                  <th className="px-2 py-2 font-semibold">تعداد خرید</th>
                  <th className="px-2 py-2 font-semibold">خرید خالص</th>
                  <th className="px-2 py-2 font-semibold">آخرین خرید از</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((row) => (
                  <tr key={row.source_id} className="hover:bg-hover">
                    <td className="px-2 py-2.5">
                      <Link to={`/customers/${row.source_id}`} className="font-bold text-ink hover:text-accent">
                        {row.name || `#EL-${row.source_id}`}
                      </Link>
                      <div className="text-[10px] text-muted ltr-iso">{formatMobile(row.mobile)}</div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5">
                      <span className={`ml-1.5 inline-block h-2 w-2 rounded-full ${rfmSegment(row.segment)?.dot ?? "bg-line"}`} />
                      {row.segment_label}
                    </td>
                    <td className="px-2 py-2.5 tabular">{formatNumber(row.days_since_last_purchase)}</td>
                    <td className="px-2 py-2.5 tabular">{formatNumber(row.avg_interval_days)}</td>
                    <td className="px-2 py-2.5 font-bold text-rose-600 tabular dark:text-rose-400">{formatNumber(row.days_late)}</td>
                    <td className="px-2 py-2.5 tabular">{formatNumber(row.purchase_count)}</td>
                    <td className="px-2 py-2.5">{formatCompactToman(row.lifetime_amount)}</td>
                    <td className="px-2 py-2.5 text-muted">{row.last_sales_line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2.5 md:hidden">
            {data.results.map((row) => (
              <Link key={row.source_id} to={`/customers/${row.source_id}`} className="block space-y-1.5 rounded-2xl border border-line bg-elevated p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-ink">{row.name || `#EL-${row.source_id}`}</span>
                  <span className="text-[11px] text-muted">{row.segment_label}</span>
                </div>
                <div className="text-[11px] text-muted ltr-iso">{formatMobile(row.mobile)}</div>
                <div className="grid grid-cols-3 gap-2 text-[11px] text-muted">
                  <span>آخرین خرید: <b className="text-ink tabular">{formatNumber(row.days_since_last_purchase)}</b> روز</span>
                  <span>تأخیر: <b className="text-rose-600 tabular dark:text-rose-400">{formatNumber(row.days_late)}</b> روز</span>
                  <span>{formatCompactToman(row.lifetime_amount)}</span>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
            <span>
              صفحه {formatNumber(page)} از {formatNumber(totalPages)}
            </span>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} className="rounded-xl border border-line px-3 py-1.5 disabled:opacity-40">
                قبلی
              </button>
              <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages} className="rounded-xl border border-line px-3 py-1.5 disabled:opacity-40">
                بعدی
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
