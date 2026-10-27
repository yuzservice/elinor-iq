import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../hooks/useAuth";
import { formatNumber } from "../../lib/format";
import { customersService } from "../../services/customers";
import type { CustomerOverviewData, OverviewCompare, OverviewLens, OverviewMetric, OverviewPeriod } from "../../types";
import {
  LENSES,
  METRICS,
  PERIODS,
  barWidth,
  collapsedKey,
  insightTexts,
  lensName,
  metricDelta,
  metricValue,
  readCollapsed,
  sparkSegments,
  tierNetText,
  writeCollapsed,
  type LensMeta,
} from "./overviewDisplay";

const TIER_SHADES = {
  pos: ["#065f46", "#047857", "#059669", "#10b981", "#34d399", "#6ee7b7", "#a7f3d0", "#d1fae5"],
  online: ["#1e3a8a", "#1d4ed8", "#3b82f6", "#60a5fa", "#bfdbfe"],
};

const PANEL = "flex flex-col rounded-[18px] border border-line bg-surface px-[18px] py-4";
const SOFT_TEXT = "text-slate-700 dark:text-slate-200";
const CARD_TEXT = "text-slate-600 dark:text-slate-300";
const OUTLINE = "border border-slate-300/70 dark:border-white/[0.12]";

type Props = {
  canManage: boolean;
  onEditTierRules: () => void;
  onRefreshTiers: () => void;
  refreshingTiers: boolean;
};

function DeltaChip({ text, up, title }: { text: string; up: boolean | null; title: string }) {
  const tone =
    up == null
      ? "bg-slate-400/[0.12] text-muted"
      : up
        ? "bg-[var(--delta-up-bg)] text-[var(--delta-up)]"
        : "bg-[var(--delta-down-bg)] text-[var(--delta-down)]";
  return (
    <span title={title || undefined} className={`self-start whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${tone}`}>
      {text}
    </span>
  );
}

function deltaColor(up: boolean | null) {
  return up == null ? "text-muted" : up ? "text-[var(--delta-up)]" : "text-[var(--delta-down)]";
}

export function CustomerOverview({ canManage, onEditTierRules, onRefreshTiers, refreshingTiers }: Props) {
  const { user } = useAuth();
  const storageKey = collapsedKey(user?.id);
  const [period, setPeriod] = useState<OverviewPeriod>("30");
  const [compare, setCompare] = useState<OverviewCompare>("prev");
  const [lens, setLens] = useState<OverviewLens>("total");
  const [focus, setFocus] = useState<OverviewMetric>("active");
  const [collapsed, setCollapsed] = useState(() => readCollapsed(storageKey));
  const [retry, setRetry] = useState(0);
  const { data, loading, error } = useApi(() => customersService.overview(period, compare), [period, compare, retry]);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      writeCollapsed(storageKey, !value);
      return !value;
    });
  };

  return (
    <section className="flex flex-col gap-3.5" aria-label="خلاصه مشتریان">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div role="group" aria-label="بازه زمانی" className="flex gap-0.5 rounded-xl border border-line bg-surface p-[3px]">
          {PERIODS.map((option) => {
            const on = period === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={on}
                onClick={() => setPeriod(option.value)}
                className={`min-h-8 cursor-pointer rounded-[9px] px-3 text-[12.5px] ${on ? "bg-accent font-semibold text-on-accent" : "text-muted"}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <span>مقایسه با</span>
          <select
            value={compare}
            onChange={(event) => setCompare(event.target.value as OverviewCompare)}
            className={`min-h-[38px] rounded-[10px] bg-surface px-2.5 text-[12.5px] ${SOFT_TEXT} ${OUTLINE}`}
          >
            <option value="prev">دوره قبل</option>
            <option value="yoy">همین بازه سال قبل</option>
          </select>
        </label>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          className={`min-h-[38px] cursor-pointer rounded-[10px] bg-transparent px-3 text-[12.5px] text-muted ${OUTLINE}`}
        >
          {collapsed ? "باز کردن خلاصه" : "جمع کردن"}
        </button>
      </div>

      {error && !data ? (
        <div className="flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3 text-[13px] text-muted" role="alert">
          <span>خلاصه بارگذاری نشد</span>
          <button type="button" onClick={() => setRetry((value) => value + 1)} className="cursor-pointer text-blue-600 dark:text-blue-300">
            تلاش دوباره
          </button>
        </div>
      ) : !data ? (
        <OverviewSkeleton collapsed={collapsed} />
      ) : (
        <div className={`flex flex-col gap-3.5 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          {collapsed ? (
            <CollapsedStrip data={data} lens={lens} />
          ) : (
            <Expanded
              data={data}
              lens={lens}
              setLens={setLens}
              focus={focus}
              setFocus={setFocus}
              canManage={canManage}
              onEditTierRules={onEditTierRules}
              onRefreshTiers={onRefreshTiers}
              refreshingTiers={refreshingTiers}
            />
          )}
        </div>
      )}
    </section>
  );
}

function CollapsedStrip({ data, lens }: { data: CustomerOverviewData; lens: OverviewLens }) {
  const row = data.lenses[lens];
  return (
    <div className="flex flex-wrap items-center gap-x-[22px] gap-y-1.5 rounded-[14px] border border-line bg-surface px-4 py-3 text-[13px]">
      {METRICS.map((metric) => (
        <span key={metric.key} className="inline-flex items-center gap-1.5">
          <span className="text-muted">{metric.title}</span>
          <span className="font-bold text-ink">{metricValue(metric.key, row[metric.key].value)}</span>
          <DeltaChip {...metricDelta(metric.key, row)} />
        </span>
      ))}
    </div>
  );
}

type ExpandedProps = Props & {
  data: CustomerOverviewData;
  lens: OverviewLens;
  setLens: (lens: OverviewLens) => void;
  focus: OverviewMetric;
  setFocus: (metric: OverviewMetric) => void;
};

function Expanded({ data, lens, setLens, focus, setFocus, canManage, onEditTierRules, onRefreshTiers, refreshingTiers }: ExpandedProps) {
  const row = data.lenses[lens];
  const lensButton = (meta: LensMeta) => {
    const on = lens === meta.key;
    return (
      <button
        key={meta.key}
        type="button"
        aria-pressed={on}
        onClick={() => setLens(meta.key)}
        className={`inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12.5px] ${
          on
            ? `border-blue-500/50 bg-blue-500/10 dark:border-blue-300/60 dark:bg-blue-500/[0.18] ${SOFT_TEXT}`
            : "border-black/10 bg-transparent text-muted dark:border-white/10"
        }`}
      >
        {meta.group === "all" ? null : (
          <span
            className="h-2 w-2 shrink-0"
            style={{ background: meta.color, borderRadius: meta.group === "pay" ? "50%" : 3 }}
          />
        )}
        {meta.name}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="me-1 text-xs text-faint">نمایش برای</span>
        {LENSES.filter((meta) => meta.group !== "pay").map(lensButton)}
        <span className="mx-1 h-[22px] w-px bg-black/[0.12] dark:bg-white/[0.12]" />
        {LENSES.filter((meta) => meta.group === "pay").map(lensButton)}
        <span className="ms-auto text-[11.5px] text-faint">
          {toFaDate(data.window.start_jalali)} تا {toFaDate(data.window.end_jalali)}
          {data.compare === "yoy" ? " · در برابر سال قبل" : " · در برابر دوره قبل"}
        </span>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
        {METRICS.map((metric) => {
          const on = focus === metric.key;
          return (
            <button
              key={metric.key}
              type="button"
              aria-pressed={on}
              title={metric.def}
              onClick={() => setFocus(metric.key)}
              className={`flex cursor-pointer flex-col items-start rounded-[18px] border px-[18px] py-4 text-right ${
                on ? "bg-slate-50 dark:bg-[#101722]" : "border-line bg-surface"
              }`}
              style={on ? { borderColor: metric.color } : undefined}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className={`text-[13px] ${CARD_TEXT}`}>{metric.title}</span>
                <span className="text-[11px] text-faint">{lensName(lens)}</span>
              </span>
              <span className="mt-2.5 flex w-full items-end justify-between gap-2.5">
                <span className="flex flex-col gap-1.5">
                  <span className="flex items-baseline gap-[5px]">
                    <span className="text-[27px] font-extrabold tracking-[-0.5px] text-ink">{metricValue(metric.key, row[metric.key].value)}</span>
                    <span className="text-[11.5px] text-muted">{metric.unit}</span>
                  </span>
                  <DeltaChip {...metricDelta(metric.key, row)} />
                </span>
                <svg width="96" height="34" viewBox="0 0 96 34" aria-hidden="true" className="flex-none">
                  {sparkSegments(row.spark[metric.key]).map((points) => (
                    <polyline
                      key={points}
                      points={points}
                      fill="none"
                      stroke={metric.color}
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ))}
                </svg>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))" }}>
        <ComparisonPanel data={data} lens={lens} setLens={setLens} focus={focus} />
        <TierPanel data={data} canManage={canManage} onEditTierRules={onEditTierRules} onRefreshTiers={onRefreshTiers} refreshingTiers={refreshingTiers} />
      </div>

      <div className="flex flex-wrap gap-2">
        {insightTexts(data).map((insight) => (
          <span
            key={insight.text}
            className={`rounded-[10px] px-3 py-1.5 text-xs ${
              insight.tone === "up"
                ? "bg-emerald-500/[0.12] text-emerald-700 dark:text-emerald-300"
                : insight.tone === "down"
                  ? "bg-rose-500/[0.12] text-rose-700 dark:text-rose-300"
                  : `bg-slate-400/[0.12] ${CARD_TEXT}`
            }`}
          >
            {insight.text}
          </span>
        ))}
      </div>
    </div>
  );
}

const toFaDate = (jalali: string) => jalali.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);

function ComparisonPanel({
  data,
  lens,
  setLens,
  focus,
}: {
  data: CustomerOverviewData;
  lens: OverviewLens;
  setLens: (lens: OverviewLens) => void;
  focus: OverviewMetric;
}) {
  const metric = METRICS.find((item) => item.key === focus)!;
  const rows = LENSES.filter((meta) => meta.group !== "all");
  const max = Math.max(0, ...rows.map((meta) => data.lenses[meta.key][focus].value ?? 0));
  return (
    <section className={`${PANEL} gap-3`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-sm font-semibold text-ink">مقایسه کانال‌ها: {metric.title}</h2>
        <span className="text-[11.5px] text-faint">روی هر ردیف بزنید تا کارت‌ها برای آن نمایش داده شوند</span>
      </div>
      {rows.map((meta) => {
        const on = lens === meta.key;
        const lensData = data.lenses[meta.key];
        const delta = metricDelta(focus, lensData);
        const bar: CSSProperties = {
          background: meta.color,
          opacity: on || lens === "total" ? 0.9 : 0.35,
          width: `${barWidth(lensData[focus].value, max)}%`,
        };
        return (
          <div key={meta.key} className="contents">
            {meta.key === "shopino" ? (
              <div className="border-t border-black/[0.06] pt-1 text-[11px] text-faint dark:border-white/[0.06]">روش پرداخت</div>
            ) : null}
            <button
              type="button"
              aria-pressed={on}
              onClick={() => setLens(on ? "total" : meta.key)}
              className={`grid min-h-8 cursor-pointer items-center gap-2.5 rounded-lg border-0 px-1.5 ${on ? "bg-blue-500/[0.12]" : "bg-transparent"}`}
              style={{ gridTemplateColumns: "64px minmax(0, 1fr) 76px 70px" }}
            >
              <span className={`text-right text-[12.5px] ${SOFT_TEXT}`}>{meta.name}</span>
              <span className="h-2.5 rounded-[5px] bg-black/5 dark:bg-white/5">
                <span className="block h-2.5 rounded-[5px]" style={bar} />
              </span>
              <span className="ltr-iso text-left text-[12.5px] font-semibold text-ink">{metricValue(focus, lensData[focus].value)}</span>
              <span title={delta.title || undefined} className={`whitespace-nowrap text-left text-[11.5px] font-semibold ${deltaColor(delta.up)}`}>
                {delta.text}
              </span>
            </button>
          </div>
        );
      })}
    </section>
  );
}

function TierPanel({
  data,
  canManage,
  onEditTierRules,
  onRefreshTiers,
  refreshingTiers,
}: Props & { data: CustomerOverviewData }) {
  return (
    <section className={`${PANEL} gap-3.5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-sm font-semibold text-ink">سطح‌بندی مشتریان</h2>
        {canManage ? (
          <span className="flex items-baseline gap-3 text-[12.5px]">
            <button
              type="button"
              onClick={onRefreshTiers}
              disabled={refreshingTiers}
              className="cursor-pointer text-muted hover:text-ink disabled:opacity-60"
            >
              {refreshingTiers ? "در حال محاسبه..." : "به‌روزرسانی سطوح"}
            </button>
            <button type="button" onClick={onEditTierRules} className="cursor-pointer text-blue-600 hover:text-blue-500 dark:text-blue-300 dark:hover:text-blue-200">
              ویرایش قوانین
            </button>
          </span>
        ) : null}
      </div>
      {data.tiers.panels.map((panel) => {
        const shades = panel.channel === "online" ? TIER_SHADES.online : TIER_SHADES.pos;
        const sum = panel.tiers.reduce((total, tier) => total + tier.count, 0);
        const color = (index: number) => shades[Math.min(index, shades.length - 1)];
        return (
          <div key={panel.title} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between text-[12.5px]">
              <span className={`font-semibold ${SOFT_TEXT}`}>{panel.title}</span>
              <span className="text-muted">{formatNumber(sum)} مشتری</span>
            </div>
            <div
              className="flex h-3.5 gap-0.5 overflow-hidden rounded-[7px]"
              role="img"
              aria-label={`${panel.title}: ${panel.tiers.map((tier) => `${tier.title} ${formatNumber(tier.count)}`).join("، ")}`}
            >
              {panel.tiers.map((tier, index) => (
                <span
                  key={tier.code}
                  title={`${tier.title}: ${formatNumber(tier.count)}`}
                  className="block h-3.5"
                  style={{ background: color(index), flex: `${Math.max(0.8, sum ? (tier.count / sum) * 100 : 0).toFixed(2)} 1 0` }}
                />
              ))}
            </div>
            <div className="grid gap-x-3.5 gap-y-0.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
              {panel.tiers.map((tier, index) => (
                <Link
                  key={tier.code}
                  to={{ search: `?tier=${encodeURIComponent(tier.code)}` }}
                  title="نمایش این سطح در لیست مشتریان"
                  className={`flex min-h-[30px] items-center gap-1.5 text-xs ${CARD_TEXT}`}
                >
                  <span className="h-2 w-2 flex-none rounded-sm" style={{ background: color(index) }} />
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{tier.title}</span>
                  <span className="font-semibold text-ink">{formatNumber(tier.count)}</span>
                  <span className={`ltr-iso text-[11px] font-semibold ${deltaColor(tier.net >= 0)}`}>{tierNetText(tier.net)}</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
      {data.tiers.rules_changed ? <p className="m-0 text-[11.5px] text-faint">قوانین سطح در این بازه تغییر کرده است.</p> : null}
    </section>
  );
}

function OverviewSkeleton({ collapsed }: { collapsed: boolean }) {
  const block = "animate-pulse rounded-[18px] border border-line bg-surface";
  if (collapsed) return <div className={`${block} h-[46px] rounded-[14px]`} />;
  return (
    <div className="flex flex-col gap-3.5" aria-busy="true">
      <div className="h-[34px] animate-pulse rounded-full bg-elevated" />
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
        {METRICS.map((metric) => (
          <div key={metric.key} className={`${block} h-[118px]`} />
        ))}
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))" }}>
        <div className={`${block} h-[340px]`} />
        <div className={`${block} h-[340px]`} />
      </div>
    </div>
  );
}
