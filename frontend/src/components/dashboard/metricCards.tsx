import type { ReactNode } from "react";
import { formatNumber, formatToman } from "../../lib/format";
import type { HomeMetricCard } from "../../types";
import { ChangePill } from "./primitives";

const LINE_DOT: Record<string, string> = {
  ONLINE: "#2D7FF9",
  SARI: "#60A5FA",
  GORGAN: "#93C5FD",
  CAPRI: "#BFDBFE",
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
    <div className="flex rounded-full bg-hover p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full px-4 py-2 text-[12px] font-medium ${
            value === option.value ? "bg-ink text-canvas" : "text-muted"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function MetricSquareCard({ card, icon }: { card: HomeMetricCard; icon: ReactNode }) {
  const formatValue = card.kind === "units" ? formatNumber : formatToman;
  const maxLine = Math.max(...card.lines.map((line) => line.value), 1);
  return (
    <article className="flex min-h-[280px] flex-col rounded-[24px] bg-surface px-5 py-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-hover text-muted">{icon}</span>
        <ChangePill value={card.change_pct} />
      </div>
      <div className="mt-4 text-[13px] font-medium text-ink">{card.label}</div>
      <div className="mt-2 tabular text-[30px] font-semibold leading-none text-ink">{formatValue(card.total)}</div>
      <div className="mt-5 space-y-3 border-t border-line pt-4">
        {card.lines.map((line) => (
          <div key={line.key}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-[12px]">
              <span className="flex items-center gap-2 text-muted">
                <span className="h-2 w-2 rounded-full" style={{ background: LINE_DOT[line.key] || "#CBD5E1" }} />
                {line.label.replace("فروش ", "").replace("فروشگاه ", "")}
              </span>
              <span className="tabular font-medium text-ink">{formatValue(line.value)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-hover">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.max(4, (line.value / maxLine) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export function MetricCardIcons({ name }: { name: HomeMetricCard["kind"] }) {
  const common = "h-[18px] w-[18px]";
  if (name === "units") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 8h12l-1 11H7L6 8Z" />
        <path d="M9 8V7a3 3 0 0 1 6 0v1" />
      </svg>
    );
  }
  if (name === "snappay") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 7h16v10H4z" />
        <path d="M8 11h8" />
      </svg>
    );
  }
  if (name === "digipay") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="5" y="4" width="14" height="16" rx="2" />
        <path d="M9 8h6M9 12h6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3S7.5 5.8 7.5 7.5 9.5 10.5 12 10.5s4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3" />
    </svg>
  );
}
