import type { ReactNode } from "react";
import { ErrorState, Skeleton } from "../../components/Table";
import { formatCompactToman, formatNumber, formatPercent } from "../../lib/format";
import type { SalesKpiMetric, SalesOverviewKpisResponse } from "../../services/sales";

type SalesKpiSectionProps = {
  kpis: SalesOverviewKpisResponse["kpis"] | null | undefined;
  showCompare: boolean;
  loading?: boolean;
  error?: boolean;
};

function ChangeIndicator({ value }: { value: number | null | undefined }) {
  if (value == null) return <div className="h-4" aria-hidden="true" />;

  const positive = value > 0;
  const negative = value < 0;
  const tone = positive ? "text-[#22A06B]" : negative ? "text-[#DC2626]" : "text-muted";

  return (
    <div className={`flex items-center gap-1 text-xs font-semibold ${tone}`}>
      <span aria-hidden="true">{positive ? "↑" : negative ? "↓" : "•"}</span>
      <span>{formatNumber(Math.abs(value))}٪</span>
    </div>
  );
}

function KpiIcon({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/8 text-[13px] text-accent">
      {children}
    </span>
  );
}

function SalesKpiCard({
  label,
  icon,
  changeMetric,
  formattedValue,
  formattedCompare,
  unitHint,
  showCompare,
}: {
  label: string;
  icon: ReactNode;
  changeMetric: SalesKpiMetric;
  formattedValue: string;
  formattedCompare?: string;
  unitHint?: string;
  showCompare: boolean;
}) {
  return (
    <button
      type="button"
      className="group flex h-full w-full flex-col rounded-[18px] border border-line/80 bg-elevated px-4 py-3.5 text-right shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-line hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 sm:py-4"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-muted">{label}</div>
          {unitHint ? <div className="mt-0.5 text-[10px] text-faint">{unitHint}</div> : null}
        </div>
        <KpiIcon>{icon}</KpiIcon>
      </div>

      <div className="tabular text-[clamp(1.35rem,2.4vw,1.75rem)] font-semibold leading-none tracking-tight text-ink">
        {formattedValue}
      </div>

      <div className="mt-3 min-h-[2.75rem]">
        {showCompare ? (
          <>
            <ChangeIndicator value={changeMetric.change_pct} />
            {formattedCompare ? (
              <div className="mt-1 text-[11px] leading-5 text-faint">بازه مقایسه: {formattedCompare}</div>
            ) : null}
          </>
        ) : (
          <div className="h-4" aria-hidden="true" />
        )}
      </div>
    </button>
  );
}

export function SalesKpiSection({ kpis, showCompare, loading, error }: SalesKpiSectionProps) {
  if (loading && !kpis) {
    return (
      <section className="mt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-[132px] rounded-[18px]" />
          ))}
        </div>
      </section>
    );
  }

  if (error || !kpis) {
    return (
      <section className="mt-4">
        <ErrorState />
      </section>
    );
  }

  const cards = [
    {
      key: "net_sales",
      label: "فروش خالص",
      icon: "₮",
      changeMetric: kpis.net_sales,
      formattedValue: formatCompactToman(kpis.net_sales.value),
      formattedCompare:
        kpis.net_sales.compare_value == null
          ? undefined
          : formatCompactToman(kpis.net_sales.compare_value),
    },
    {
      key: "order_count",
      label: "تعداد سفارش",
      icon: "▣",
      changeMetric: kpis.order_count,
      formattedValue: formatNumber(kpis.order_count.value),
      formattedCompare:
        kpis.order_count.compare_value == null ? undefined : formatNumber(kpis.order_count.compare_value),
      unitHint: "سفارش",
    },
    {
      key: "items_sold",
      label: "تعداد آیتم فروخته‌شده",
      icon: "◫",
      changeMetric: kpis.items_sold,
      formattedValue: formatNumber(kpis.items_sold.value),
      formattedCompare:
        kpis.items_sold.compare_value == null ? undefined : formatNumber(kpis.items_sold.compare_value),
      unitHint: "عدد",
    },
    {
      key: "avg_order_amount",
      label: "میانگین مبلغ هر سفارش",
      icon: "≡",
      changeMetric: kpis.avg_order_amount,
      formattedValue: formatCompactToman(kpis.avg_order_amount.value),
      formattedCompare:
        kpis.avg_order_amount.compare_value == null
          ? undefined
          : formatCompactToman(kpis.avg_order_amount.compare_value),
    },
    {
      key: "avg_items_per_order",
      label: "میانگین تعداد آیتم در هر سفارش",
      icon: "⧉",
      changeMetric: kpis.avg_items_per_order,
      formattedValue: formatNumber(kpis.avg_items_per_order.value),
      formattedCompare:
        kpis.avg_items_per_order.compare_value == null
          ? undefined
          : formatNumber(kpis.avg_items_per_order.compare_value),
      unitHint: "آیتم",
    },
    {
      key: "refund",
      label: "مبلغ / نرخ مرجوعی",
      icon: "↺",
      changeMetric: kpis.refund_amount,
      formattedValue: `${formatCompactToman(kpis.refund_amount.value)} · ${formatPercent(kpis.refund_rate_pct.value)}`,
      formattedCompare:
        kpis.refund_amount.compare_value == null
          ? undefined
          : `${formatCompactToman(kpis.refund_amount.compare_value)} · ${formatPercent(
              kpis.refund_rate_pct.compare_value ?? 0,
            )}`,
      unitHint: "POS",
    },
  ];

  return (
    <section className="mt-4" aria-label="شاخص‌های اصلی فروش">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {cards.map((card) => (
          <SalesKpiCard
            key={card.key}
            label={card.label}
            icon={card.icon}
            changeMetric={card.changeMetric}
            formattedValue={card.formattedValue}
            formattedCompare={card.formattedCompare}
            unitHint={card.unitHint}
            showCompare={showCompare}
          />
        ))}
      </div>
    </section>
  );
}
