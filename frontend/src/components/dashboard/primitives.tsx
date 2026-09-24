import type { ReactNode } from "react";
import { formatNumber } from "../../lib/format";

export function ChangePill({ value }: { value: number | null }) {
  if (value == null) return null;
  const up = value >= 0;
  return (
    <span className="rounded-full bg-[#E7F7EF] px-2 py-0.5 tabular text-[11px] font-medium text-[#22A06B]">
      {up ? "↑" : "↓"} {formatNumber(Math.abs(value))}٪
    </span>
  );
}

export function PeriodToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex rounded-full bg-hover p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full px-4 py-1.5 text-[12px] font-medium ${
            value === option.value ? "bg-ink text-canvas" : "text-muted"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function PillGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
            value === option.value ? "bg-accent text-on-accent" : "bg-hover text-muted hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

type StatCardProps = {
  label: string;
  value: string;
  change: number | null;
  icon: ReactNode;
  primary?: boolean;
};

export function StatCard({ label, value, change, icon, primary }: StatCardProps) {
  return (
    <article className="rounded-[24px] bg-surface px-5 py-5 shadow-soft">
      <div className="flex items-start justify-between">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-full ${
            primary ? "bg-accent text-on-accent" : "bg-hover text-muted"
          }`}
        >
          {icon}
        </span>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-hover text-[11px] text-faint">i</span>
      </div>
      <div className="mt-4 text-[13px] font-medium text-ink">{label}</div>
      <div className="mt-2 tabular text-[34px] font-semibold leading-none tracking-tight text-ink">{value}</div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-faint">
        <ChangePill value={change} />
        <span>نسبت به بازه قبل:</span>
      </div>
    </article>
  );
}

export function StatIcons({ name }: { name: "bag" | "people" | "money" | "user" }) {
  const common = "h-[18px] w-[18px]";
  if (name === "people") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M16 19v-1a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v1" />
        <circle cx="10" cy="8" r="3" />
        <path d="M20 19v-1a3 3 0 0 0-2.2-2.9M16 5.1a3 3 0 0 1 0 5.8" />
      </svg>
    );
  }
  if (name === "money") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3S7.5 5.8 7.5 7.5 9.5 10.5 12 10.5s4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3" />
      </svg>
    );
  }
  if (name === "user") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="3" />
        <path d="M5 19v-1a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 8h12l-1 11H7L6 8Z" />
      <path d="M9 8V7a3 3 0 0 1 6 0v1" />
    </svg>
  );
}
