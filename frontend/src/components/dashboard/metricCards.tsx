import type { ReactNode } from "react";
import { formatNumber, formatToman } from "../../lib/format";
import type { HomeMetricCard } from "../../types";
import { ChangePill } from "./primitives";
import { CONTROL_FOCUS, channelColor, shortLineLabel } from "./tokens";

const KIND_WELL: Record<HomeMetricCard["kind"], string> = {
  money: "bg-accent/15 text-accent",
  units: "bg-[color-mix(in_srgb,var(--ch-sari)_16%,transparent)] text-[var(--ch-sari)]",
  snappay: "bg-[color-mix(in_srgb,var(--ch-gorgan)_16%,transparent)] text-[var(--ch-gorgan)]",
  digipay: "bg-[color-mix(in_srgb,var(--ch-capri)_16%,transparent)] text-[var(--ch-capri)]",
};

export function HomePeriodToggle({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: "day" | "week" | "month" | "quarter") => void;
}) {
  const options = [
    { value: "day" as const, label: "روز" },
    { value: "week" as const, label: "هفته" },
    { value: "month" as const, label: "ماه" },
    { value: "quarter" as const, label: "سه‌ماهه" },
  ];
  return (
    <div className="flex max-w-full flex-wrap rounded-full bg-hover p-1" role="group" aria-label="بازه زمانی">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`min-h-11 rounded-full px-4 text-[13px] font-medium ${CONTROL_FOCUS} ${
              selected ? "bg-ink text-canvas" : "text-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function MetricSquareCard({
  card,
  icon,
  featured = false,
}: {
  card: HomeMetricCard;
  icon: ReactNode;
  featured?: boolean;
}) {
  const formatValue = card.kind === "units" ? formatNumber : formatToman;
  const maxLine = Math.max(...card.lines.map((line) => line.value), 1);
  const lineTotal = card.lines.reduce((sum, line) => sum + Math.max(0, line.value), 0);

  return (
    <article
      className={`relative flex h-full flex-col overflow-hidden rounded-[24px] border border-line bg-surface p-5 shadow-soft ${
        featured ? "min-h-[240px]" : "min-h-[220px]"
      }`}
    >
      {featured ? (
        <>
          <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-20 h-52 w-52 rounded-full bg-accent/10 blur-3xl" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-16 right-0 h-40 w-40 rounded-full bg-[color-mix(in_srgb,var(--ch-capri)_22%,transparent)] blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[var(--ch-online)] via-[var(--ch-sari)] to-[var(--ch-capri)]"
          />
        </>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${KIND_WELL[card.kind]}`} aria-hidden="true">
          {icon}
        </span>
        <ChangePill value={card.change_pct} />
      </div>
      <div className="mt-4 text-sm font-medium text-ink">{card.label}</div>
      <div className="mt-2 tabular text-[32px] font-semibold leading-none tracking-tight text-ink">{formatValue(card.total)}</div>
      {featured && card.change_pct != null ? (
        <p className="mt-2 text-[13px] text-muted">نسبت به بازه قبل</p>
      ) : null}

      {featured && lineTotal > 0 ? (
        <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-[var(--chart-track)]" aria-hidden="true">
          {card.lines.map((line) => (
            <div
              key={line.key}
              style={{
                width: `${(Math.max(0, line.value) / lineTotal) * 100}%`,
                background: channelColor(line.key),
              }}
            />
          ))}
        </div>
      ) : null}

      <ul className={`${featured ? "mt-4 grid gap-3 sm:grid-cols-2" : "mt-5 space-y-3 border-t border-line pt-4"}`}>
        {card.lines.map((line) => {
          const share = lineTotal > 0 ? Math.round((Math.max(0, line.value) / lineTotal) * 100) : 0;
          return (
            <li key={line.key}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                <span className="flex min-w-0 items-center gap-2 text-muted">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: channelColor(line.key) }} aria-hidden="true" />
                  <span className="truncate">{shortLineLabel(line.label)}</span>
                </span>
                <span className="tabular shrink-0 font-medium text-ink">
                  {formatValue(line.value)}
                  {featured ? <span className="mr-2 font-normal text-muted">{formatNumber(share)}٪</span> : null}
                </span>
              </div>
              {featured ? null : (
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--chart-track)]" aria-hidden="true">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(line.value > 0 ? 4 : 0, (line.value / maxLine) * 100)}%`,
                      background: channelColor(line.key),
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}

export function MetricCardIcons({ name }: { name: HomeMetricCard["kind"] }) {
  const common = "h-5 w-5";
  if (name === "units") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M6 8h12l-1 11H7L6 8Z" />
        <path d="M9 8V7a3 3 0 0 1 6 0v1" />
      </svg>
    );
  }
  if (name === "snappay") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M4 7h16v10H4z" />
        <path d="M8 11h8" />
      </svg>
    );
  }
  if (name === "digipay") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="5" y="4" width="14" height="16" rx="2" />
        <path d="M9 8h6M9 12h6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3S7.5 5.8 7.5 7.5 9.5 10.5 12 10.5s4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3" />
    </svg>
  );
}
