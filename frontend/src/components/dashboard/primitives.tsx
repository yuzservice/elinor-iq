import type { ReactNode } from "react";
import { formatNumber } from "../../lib/format";
import { CONTROL_FOCUS } from "./tokens";

function DeltaMark({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
      <path d={up ? "M6 2.2 10 8.2H2L6 2.2Z" : "M6 9.8 2 3.8h8L6 9.8Z"} fill="currentColor" />
    </svg>
  );
}

export function ChangePill({ value }: { value: number | null }) {
  if (value == null) return null;
  const up = value >= 0;
  return (
    <span
      className="inline-flex min-h-7 items-center gap-1 rounded-full px-2.5 tabular text-[13px] font-medium"
      style={{
        background: up ? "var(--delta-up-bg)" : "var(--delta-down-bg)",
        color: up ? "var(--delta-up)" : "var(--delta-down)",
      }}
    >
      <DeltaMark up={up} />
      <span className="sr-only">{up ? "افزایش" : "کاهش"}</span>
      {formatNumber(Math.abs(value))}٪
    </span>
  );
}

export function PeriodToggle<T extends string>({
  value,
  onChange,
  options,
  label = "گروه‌بندی",
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label?: string;
}) {
  return (
    <div className="flex flex-wrap rounded-full bg-hover p-1" role="group" aria-label={label}>
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

export function PillGroup<T extends string>({
  value,
  onChange,
  options,
  label = "گزینه‌ها",
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`min-h-11 rounded-full px-4 text-[13px] font-medium ${CONTROL_FOCUS} ${
              selected ? "bg-accent text-on-accent" : "bg-hover text-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
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
