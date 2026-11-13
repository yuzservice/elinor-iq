import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  formatJalali,
  isoToJalali,
  jalaliMonthLength,
  jalaliMonthName,
  jalaliToIso,
  toFaDigits,
  toJalaliParts,
  todayIso,
} from "../lib/dates";
import { IconButton } from "./ui";

const WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

export function JalaliDateRange({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2 shadow-soft">
      <span className="text-xs text-muted">از</span>
      <JalaliDateField value={from} onChange={(value) => onChange({ from: value, to })} />
      <span className="text-xs text-muted">تا</span>
      <JalaliDateField value={to} onChange={(value) => onChange({ from, to: value })} />
    </div>
  );
}

/**
 * Standalone Jalali Date Field with Portal-based dropdown (immune to overflow/backdrop-filter clipping)
 */
export function JalaliDateField({
  value,
  onChange,
  allowEmpty = false,
  emptyLabel = "تاریخ",
  compact = false,
}: {
  value: string;
  onChange: (iso: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [popupStyle, setPopupStyle] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const root = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const selected = isoToJalali(value) || toJalaliParts(todayIso());
  const [cursor, setCursor] = useState(selected || { jy: 1403, jm: 1, jd: 1 });

  useEffect(() => {
    if (selected) setCursor(selected);
  }, [value]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (root.current?.contains(target) || popupRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onPointerDown);
      return () => document.removeEventListener("mousedown", onPointerDown);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !root.current) return;

    function updatePosition() {
      if (!root.current) return;
      const rect = root.current.getBoundingClientRect();
      const width = 288;
      const height = 310;
      const margin = 12;

      let left = rect.left;
      if (left + width > window.innerWidth - margin) {
        left = window.innerWidth - margin - width;
      }
      if (left < margin) {
        left = margin;
      }

      let top = rect.bottom + 8;
      if (top + height > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - height - 8);
      }

      setPopupStyle({ top, left });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const length = jalaliMonthLength(cursor.jy, cursor.jm);
  const firstIso = jalaliToIso(cursor.jy, cursor.jm, 1);
  const firstDate = new Date(`${firstIso}T12:00:00`);
  const offset = (firstDate.getDay() + 1) % 7;
  const days = Array.from({ length }, (_, index) => index + 1);

  function shiftMonth(delta: number) {
    let { jy, jm } = cursor;
    jm += delta;
    if (jm < 1) {
      jm = 12;
      jy -= 1;
    }
    if (jm > 12) {
      jm = 1;
      jy += 1;
    }
    setCursor({ jy, jm, jd: 1 });
  }

  const dropdown = open && typeof document !== "undefined" ? (
    createPortal(
      <div
        ref={popupRef}
        className="fixed z-[9999] w-72 rounded-2xl border border-line bg-surface p-3.5 shadow-2xl backdrop-blur-xl animate-fade-in"
        style={{ top: popupStyle.top, left: popupStyle.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <IconButton type="button" onClick={() => shiftMonth(1)} aria-label="ماه بعد">
            ‹
          </IconButton>
          <div className="text-sm font-bold text-ink">
            {jalaliMonthName(cursor.jm)} {toFaDigits(cursor.jy)}
          </div>
          <IconButton type="button" onClick={() => shiftMonth(-1)} aria-label="ماه قبل">
            ›
          </IconButton>
        </div>
        <div className="mb-2 grid grid-cols-7 text-center text-[11px] text-faint font-semibold">
          {WEEKDAYS.map((day) => (
            <div key={day} className="py-1">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 text-center text-xs gap-1">
          {Array.from({ length: offset }).map((_, index) => (
            <div key={`empty-${index}`} />
          ))}
          {days.map((day) => {
            const iso = jalaliToIso(cursor.jy, cursor.jm, day);
            const active = value.slice(0, 10) === iso;
            return (
              <button
                key={day}
                type="button"
                className={`mx-auto flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
                  active
                    ? "bg-accent text-on-accent font-black shadow-md shadow-accent/30"
                    : "text-ink hover:bg-hover font-semibold"
                }`}
                onClick={() => {
                  onChange(iso);
                  setOpen(false);
                }}
              >
                {toFaDigits(day)}
              </button>
            );
          })}
        </div>
      </div>,
      document.body,
    )
  ) : null;

  return (
    <div className="relative inline-block" ref={root}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`rounded-xl border border-line bg-elevated px-3 tabular text-ink flex items-center justify-between gap-2 hover:border-accent/40 transition-colors ${
          compact ? "h-9 w-[7.5rem] whitespace-nowrap text-xs" : "h-10 min-w-[8.5rem] whitespace-nowrap text-sm"
        }`}
        aria-label="انتخاب تاریخ شمسی"
      >
        <span className="truncate">
          {value ? formatJalali(value) : allowEmpty ? emptyLabel : formatJalali(todayIso())}
        </span>
        <span className="text-muted text-[10px]">📅</span>
      </button>
      {dropdown}
    </div>
  );
}

/** Compact range calendar for report bars: pick a start day, then an end day, then «تأیید». Days after `max` are disabled. */
export function JalaliRangePopover({ from, to, max, onApply, onClose }: {
  from: string;
  to: string;
  max: string;
  onApply: (from: string, to: string) => void;
  onClose: () => void;
}) {
  const [pick, setPick] = useState<string[]>(from && to ? [from, to] : []);
  const start = toJalaliParts(from || max) || { jy: 1405, jm: 1, jd: 1 };
  const [cursor, setCursor] = useState({ jy: start.jy, jm: start.jm });
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (event: MouseEvent) => root.current && !root.current.contains(event.target as Node) && onClose();
    const onKey = (event: globalThis.KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const shift = (delta: number) =>
    setCursor(({ jy, jm }) => {
      const m = jm + delta;
      return m < 1 ? { jy: jy - 1, jm: 12 } : m > 12 ? { jy: jy + 1, jm: 1 } : { jy, jm: m };
    });
  const choose = (iso: string) => setPick((current) => (current.length === 1 ? [current[0], iso].sort() : [iso]));
  const length = jalaliMonthLength(cursor.jy, cursor.jm);
  const offset = (new Date(`${jalaliToIso(cursor.jy, cursor.jm, 1)}T12:00:00`).getDay() + 1) % 7;
  const [a, b] = pick;
  const hint = pick.length === 1 ? "روز پایان را انتخاب کنید" : pick.length === 2 ? `${formatJalali(a)} تا ${formatJalali(b)}` : "روز شروع را انتخاب کنید";

  return (
    <div ref={root} role="dialog" aria-label="انتخاب بازه تاریخ" className="absolute right-0 top-[calc(100%+8px)] z-40 flex w-[292px] flex-col gap-2.5 rounded-2xl border border-line bg-elevated p-3.5 shadow-2xl">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} aria-label="ماه قبل" className="h-8 w-8 cursor-pointer rounded-[9px] border-0 bg-transparent text-base text-muted hover:bg-hover">›</button>
        <span className="text-sm font-semibold text-ink">{jalaliMonthName(cursor.jm)} {toFaDigits(cursor.jy)}</span>
        <button type="button" onClick={() => shift(1)} aria-label="ماه بعد" className="h-8 w-8 cursor-pointer rounded-[9px] border-0 bg-transparent text-base text-muted hover:bg-hover">‹</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((day) => <span key={day} className="py-1 text-[11.5px] text-faint">{day}</span>)}
        {Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}
        {Array.from({ length }, (_, i) => {
          const iso = jalaliToIso(cursor.jy, cursor.jm, i + 1);
          const edge = iso === a || iso === b;
          const inside = a && b && iso > a && iso < b;
          const future = iso > max;
          return (
            <button
              key={iso}
              type="button"
              disabled={future}
              aria-label={formatJalali(iso)}
              aria-pressed={edge}
              onClick={() => choose(iso)}
              className={`h-[34px] border-0 text-[12.5px] ${edge ? "rounded-[9px] bg-accent font-semibold text-on-accent" : inside ? "bg-accent/20 text-ink" : "rounded-[9px] bg-transparent text-ink hover:bg-hover"} ${future ? "cursor-default text-faint opacity-50" : "cursor-pointer"}`}
            >
              {toFaDigits(i + 1)}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-line pt-2">
        <span className="text-[12.5px] text-muted">{hint}</span>
        <button
          type="button"
          disabled={pick.length !== 2}
          onClick={() => onApply(a, b)}
          className="min-h-[34px] cursor-pointer rounded-[9px] border-0 bg-accent px-4 text-[12.5px] font-semibold text-on-accent disabled:cursor-not-allowed disabled:bg-hover disabled:text-faint"
        >
          تأیید
        </button>
      </div>
    </div>
  );
}
