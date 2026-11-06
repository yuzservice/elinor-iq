import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { bandColor, compact, coverGradient, fa, KIND_LABEL, postTitle, scoreBand, scoreText } from "./format";
import type { PostCard } from "./types";

export const CARD = "rounded-[18px] border border-line bg-surface p-4 shadow-[var(--shadow)]";
export const FAINT = "text-[var(--text-faint)]";

export function ScoreBadge({ score }: { score: number | null }) {
  const color = bandColor(scoreBand(score));
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-extrabold tabular-nums"
      style={{ color, background: `color-mix(in srgb, ${color} 20%, transparent)` }}
    >
      {scoreText(score)}
    </span>
  );
}

export function ScoreBar({ score }: { score: number | null }) {
  return (
    <div className="h-[5px] overflow-hidden rounded-full bg-[var(--chart-track)]">
      <i className="block h-full rounded-full" style={{ width: `${Math.min(100, ((score ?? 0) / 3) * 100)}%`, background: bandColor(scoreBand(score)) }} />
    </div>
  );
}

export function SectionTitle({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <h2 className="mb-2.5 mt-6 flex items-center gap-2 text-sm font-bold text-ink">
      {children}
      {note ? <small className={`ms-auto text-[11px] font-normal ${FAINT}`}>{note}</small> : null}
    </h2>
  );
}

/** Post cover: stored cover or first product image, over a warm gradient placeholder. */
export function Cover({ post, caption = true, className = "" }: { post: PostCard; caption?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  const style = { background: coverGradient(post) } as CSSProperties;
  return (
    <div className={`relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-[14px] p-2.5 text-white ${className}`} style={style}>
      {post.thumb && !failed ? (
        <img src={post.thumb} alt="" loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-35% to-black/75" />
      <span className="absolute start-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] backdrop-blur">
        {KIND_LABEL[post.kind]}
        {post.kind === "reel" && post.duration_s ? ` · ${fa(post.duration_s)}ث` : ""}
        {post.brand ? " · برند" : ""}
      </span>
      {post.fresh ? (
        <span className="absolute end-2 top-2 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold text-neutral-900">در حال جمع شدن</span>
      ) : null}
      {caption ? (
        <div className="relative line-clamp-2 text-xs font-bold leading-relaxed [text-shadow:0_1px_4px_rgba(0,0,0,.5)]">{postTitle(post.caption)}</div>
      ) : null}
      <div className="relative mt-0.5 text-[15px] font-extrabold">{compact(post.views)}</div>
    </div>
  );
}

/** Small cover for list rows. */
export function Thumb({ post, className = "w-12" }: { post: PostCard; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`relative aspect-[4/5] overflow-hidden rounded-[10px] ${className}`} style={{ background: coverGradient(post) }}>
      {post.thumb && !failed ? <img src={post.thumb} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" /> : null}
    </div>
  );
}

export function Spark({ values, color }: { values: (number | null)[]; color: string }) {
  const points = values.map((value, index) => [index, value] as const).filter((point): point is readonly [number, number] => point[1] != null);
  if (points.length < 2) return <div className="mt-2 h-[34px]" />;
  const ys = points.map(([, y]) => y);
  const min = Math.min(...ys);
  const range = Math.max(...ys) - min || 1;
  const width = 140;
  const height = 34;
  // RTL: the newest day sits on the left.
  const path = points
    .map(([i, y], k) => `${k ? "L" : "M"}${(width - (i / (values.length - 1)) * width).toFixed(1)},${(height - 3 - ((y - min) / range) * (height - 8)).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" className="mt-2 block h-[34px] w-full">
      <rect x="0" y="0" width={width / 2} height={height} fill={color} opacity=".06" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Counts up to `value` once (700 ms, ease-out); shows the final value at once under reduced motion. */
export function CountUp({ value, format }: { value: number | null; format: (value: number | null) => string }) {
  const [shown, setShown] = useState(reducedMotion() ? value : 0);
  const frame = useRef(0);
  useEffect(() => {
    if (value == null || reducedMotion()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 700);
      setShown(value * (1 - Math.pow(1 - k, 3)));
      if (k < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [value]);
  return <>{format(shown)}</>;
}

/** Bottom sheet on phones, side drawer on desktop. Escape and the scrim close it. */
export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/55" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="fixed inset-x-0 bottom-0 z-[61] mx-auto max-h-[90vh] max-w-[560px] overflow-y-auto rounded-t-3xl border border-line bg-canvas px-4 pb-8 pt-2 lg:inset-y-0 lg:left-0 lg:right-auto lg:mx-0 lg:max-h-none lg:w-[480px] lg:rounded-none lg:rounded-r-3xl"
      >
        <div className="mx-auto mb-3 mt-1.5 h-1 w-10 rounded-full bg-[var(--text-faint)] opacity-50 lg:hidden" />
        <button type="button" onClick={onClose} className={`absolute end-3 top-3 hidden h-8 w-8 rounded-full bg-elevated text-sm lg:block ${FAINT}`} aria-label="بستن">
          ✕
        </button>
        {children}
      </aside>
    </>
  );
}

export function Chip({ on, children, onClick }: { on: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex-none cursor-pointer rounded-full border px-3 py-1.5 text-xs ${
        on ? "border-[var(--pulse)] bg-[var(--pulse-soft)] font-bold text-[var(--pulse)]" : "border-line bg-surface text-muted"
      }`}
    >
      {children}
    </button>
  );
}
