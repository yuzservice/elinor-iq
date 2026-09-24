import type { ReactNode } from "react";

export function Table({
  columns,
  children,
  align,
  compact = false,
  sticky = true,
}: {
  columns: string[];
  children: ReactNode;
  align?: Array<"right" | "left" | "center">;
  compact?: boolean;
  sticky?: boolean;
}) {
  const cellPad = compact ? "px-3 py-2" : "px-3 py-3";
  return (
    <div className={`overflow-auto ${compact ? "max-h-[min(70vh,46rem)]" : ""}`}>
      <table className={`w-full border-collapse text-sm ${compact ? "min-w-[1080px]" : "min-w-[720px]"}`}>
        <thead className={`${sticky ? "sticky top-0 z-10 bg-surface" : ""}`}>
          <tr className="text-right text-[12px] text-faint">
            {columns.map((column, index) => (
              <th
                key={column}
                className={`border-b border-line font-medium ${cellPad} ${
                  align?.[index] === "left" ? "text-left" : ""
                }`}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function TableRow({
  children,
  className = "",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-line/80 odd:bg-transparent even:bg-stripe hover:bg-hover ${className}`}
    >
      {children}
    </tr>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-hover/40 px-6 py-16 text-center">
      <div className="text-sm text-ink">{title}</div>
      {body ? <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted">{body}</p> : null}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-6 py-16 text-center">
      <div className="text-sm text-ink">دریافت اطلاعات با خطا مواجه شد.</div>
      {onRetry ? (
        <button onClick={onRetry} className="mt-4 text-sm text-accent">
          تلاش دوباره
        </button>
      ) : null}
    </div>
  );
}

export function LoadingState({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-xl bg-hover" />
      ))}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-hover ${className}`} />;
}
