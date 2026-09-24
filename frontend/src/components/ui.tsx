import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { DATA_COVERAGE_MESSAGE } from "../lib/nav";
import { useTheme } from "../theme/ThemeProvider";
import type { ThemePreference } from "../lib/theme";

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "quiet" }) {
  const styles = {
    primary: "bg-accent text-on-accent hover:opacity-90 disabled:opacity-50",
    ghost: "border border-line text-ink hover:bg-hover disabled:opacity-50",
    quiet: "text-muted hover:text-ink hover:bg-hover disabled:opacity-50",
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm transition-colors duration-200 ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-hover hover:text-ink ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-10 w-full rounded-full border border-line bg-elevated px-4 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent/40 ${className}`}
      {...props}
    />
  );
}

export function SearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <Input type="search" {...props} />;
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`h-10 rounded-full border border-line bg-elevated px-4 text-sm text-ink outline-none focus:border-accent/40 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "sage" | "rose" | "accent" | "warning";
}) {
  const tones = {
    neutral: "text-muted bg-hover",
    sage: "text-[#22A06B] bg-[#E7F7EF]",
    rose: "text-[#DC2626] bg-[#FEE2E2]",
    accent: "text-accent bg-accent/10",
    warning: "text-[#E56910] bg-[#FFF4E5]",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status, label }: { status?: string; label: string }) {
  const tone =
    status === "delivered"
      ? "sage"
      : status === "canceled" || status === "failed" || status === "canceled_by_user"
        ? "rose"
        : status === "wait_for_payment"
          ? "warning"
          : status === "new" || status === "in_progress"
            ? "accent"
            : "neutral";
  return <Badge tone={tone}>{label}</Badge>;
}

export function Metric({
  label,
  value,
  suffix,
  size = "lg",
}: {
  label: string;
  value: ReactNode;
  suffix?: string;
  size?: "lg" | "md";
}) {
  return (
    <div className="rounded-[24px] bg-surface px-5 py-5 shadow-soft">
      <div className="text-[13px] font-medium text-muted">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div
          className={`tabular font-semibold tracking-tight text-ink ${
            size === "lg" ? "text-[32px]" : "text-[24px]"
          }`}
        >
          {value}
        </div>
        {suffix ? <div className="text-xs text-faint">{suffix}</div> : null}
      </div>
    </div>
  );
}

export function MetricStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{children}</div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[24px] bg-surface p-6 shadow-soft ${className}`}>
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-[13px] leading-7 text-muted">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      {hint ? <p className="text-xs text-faint">{hint}</p> : null}
    </div>
  );
}

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap gap-1.5 rounded-full bg-hover p-1">
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className={`rounded-full px-4 py-2 text-[12px] font-medium transition-colors ${
            value === item.key ? "bg-accent text-on-accent" : "text-muted hover:text-ink"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  total,
  perPage,
  onChange,
}: {
  page: number;
  total: number;
  perPage: number;
  onChange: (page: number) => void;
}) {
  const last = Math.max(1, Math.ceil(total / perPage));
  if (total === 0) return null;
  return (
    <div className="mt-5 flex items-center justify-between text-sm text-muted">
      <span className="tabular">{total.toLocaleString("fa-IR")} مورد</span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          قبلی
        </Button>
        <span className="tabular px-2">
          {page.toLocaleString("fa-IR")} / {last.toLocaleString("fa-IR")}
        </span>
        <Button variant="ghost" disabled={page >= last} onClick={() => onChange(page + 1)}>
          بعدی
        </Button>
      </div>
    </div>
  );
}

export function CoverageNotice({ message = DATA_COVERAGE_MESSAGE }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      className="mb-6 inline-flex max-w-full rounded-full border border-line bg-hover px-3 py-1.5 text-[11px] text-muted"
      data-testid="data-coverage"
    >
      {message}
    </div>
  );
}

export function ThemeSwitch() {
  const { preference, setPreference } = useTheme();
  const options: { key: ThemePreference; label: string }[] = [
    { key: "light", label: "روشن" },
    { key: "dark", label: "تیره" },
    { key: "system", label: "سیستم" },
  ];
  return (
    <div className="inline-flex rounded-full border border-line bg-elevated p-1" data-testid="theme-switch">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => setPreference(option.key)}
          className={`rounded-full px-3 py-1.5 text-[11px] transition-colors ${
            preference === option.key ? "bg-accent text-on-accent" : "text-muted hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function CustomerNameCell({
  name,
  fallback,
  sourceId,
}: {
  name: string;
  fallback?: boolean;
  sourceId?: number;
}) {
  return (
    <div>
      <div>{name}</div>
      {fallback && sourceId ? <div className="mt-0.5 text-[11px] text-faint">شناسه {sourceId}</div> : null}
    </div>
  );
}
