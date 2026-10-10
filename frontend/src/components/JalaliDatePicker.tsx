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

/**
 * 2026 Interactive Persian Date Range Modal
 * Features embedded interactive calendar with dual start/end date selectors,
 * range highlighting, and instant presets.
 */
export function JalaliRangeModal({
  isOpen,
  onClose,
  initialFrom,
  initialTo,
  onApply,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialFrom: string;
  initialTo: string;
  onApply: (from: string, to: string) => void;
}) {
  const [from, setFrom] = useState(initialFrom || todayIso());
  const [to, setTo] = useState(initialTo || todayIso());

  // Which date field is currently active/being selected on the calendar: "from" (مبدا) or "to" (مقصد)
  const [activeTarget, setActiveTarget] = useState<"from" | "to">("from");

  // Calendar month/year navigation cursor
  const initialParts = toJalaliParts(initialFrom || todayIso()) || { jy: 1403, jm: 7, jd: 1 };
  const [cursor, setCursor] = useState({ jy: initialParts.jy, jm: initialParts.jm });

  useEffect(() => {
    if (isOpen) {
      const activeIso = initialFrom || todayIso();
      const parts = toJalaliParts(activeIso);
      if (parts) {
        setCursor({ jy: parts.jy, jm: parts.jm });
      }
      setFrom(initialFrom || todayIso());
      setTo(initialTo || todayIso());
      setActiveTarget("from");
    }
  }, [isOpen, initialFrom, initialTo]);

  if (!isOpen) return null;

  // Month navigation
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
    setCursor({ jy, jm });
  }

  // Handle clicking a day in the calendar
  function handleDayClick(iso: string) {
    if (activeTarget === "from") {
      setFrom(iso);
      // If the newly picked start date is after the existing end date, update end date too
      if (to && iso > to) {
        setTo(iso);
      }
      // Auto-switch to selecting destination/end date next
      setActiveTarget("to");
    } else {
      // Selecting destination date
      if (from && iso < from) {
        // If picked before start date, make it the new start date
        setFrom(iso);
      } else {
        setTo(iso);
      }
    }
  }

  const length = jalaliMonthLength(cursor.jy, cursor.jm);
  const firstIso = jalaliToIso(cursor.jy, cursor.jm, 1);
  const firstDate = new Date(`${firstIso}T12:00:00`);
  const offset = (firstDate.getDay() + 1) % 7;
  const days = Array.from({ length }, (_, index) => index + 1);

  const fromLabel = from ? formatJalali(from, "long") : "انتخاب نشده";
  const toLabel = to ? formatJalali(to, "long") : "انتخاب نشده";

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bento-card p-5 sm:p-6 glass-rim shadow-2xl space-y-4 animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-line">
          <div className="flex items-center gap-2">
            <span className="text-base">📅</span>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-ink">انتخاب بازه تاریخ شمسی</h3>
              <p className="text-[11px] text-muted">روی مبدا یا مقصد کلیک کرده و روز مورد نظر را انتخاب کنید</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-elevated hover:bg-hover flex items-center justify-center text-muted hover:text-ink text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Dual Interactive Date Target Selectors (مبدا و مقصد) */}
        <div className="grid grid-cols-2 gap-2.5 text-xs">
          
          {/* Start Date Button (مبدا) */}
          <button
            type="button"
            onClick={() => {
              setActiveTarget("from");
              const parts = toJalaliParts(from);
              if (parts) setCursor({ jy: parts.jy, jm: parts.jm });
            }}
            className={`p-3 rounded-2xl border text-right transition-all flex flex-col justify-between ${
              activeTarget === "from"
                ? "bg-accent/15 border-accent ring-2 ring-accent/30 shadow-md shadow-accent/15"
                : "bg-elevated border-line hover:border-accent/40"
            }`}
          >
            <div className="flex items-center justify-between text-[11px] text-muted mb-1">
              <span className="font-semibold">از تاریخ (مبدا):</span>
              {activeTarget === "from" && (
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-accent text-on-accent font-bold">
                  در حال انتخاب
                </span>
              )}
            </div>
            <div className="text-xs sm:text-sm font-black text-ink tabular">{fromLabel}</div>
            <div className="text-[10px] text-muted font-mono mt-0.5">{from ? formatJalali(from) : "—"}</div>
          </button>

          {/* End Date Button (مقصد) */}
          <button
            type="button"
            onClick={() => {
              setActiveTarget("to");
              const parts = toJalaliParts(to);
              if (parts) setCursor({ jy: parts.jy, jm: parts.jm });
            }}
            className={`p-3 rounded-2xl border text-right transition-all flex flex-col justify-between ${
              activeTarget === "to"
                ? "bg-accent/15 border-accent ring-2 ring-accent/30 shadow-md shadow-accent/15"
                : "bg-elevated border-line hover:border-accent/40"
            }`}
          >
            <div className="flex items-center justify-between text-[11px] text-muted mb-1">
              <span className="font-semibold">تا تاریخ (مقصد):</span>
              {activeTarget === "to" && (
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-accent text-on-accent font-bold">
                  در حال انتخاب
                </span>
              )}
            </div>
            <div className="text-xs sm:text-sm font-black text-ink tabular">{toLabel}</div>
            <div className="text-[10px] text-muted font-mono mt-0.5">{to ? formatJalali(to) : "—"}</div>
          </button>
        </div>

        {/* Embedded Jalali Calendar Grid */}
        <div className="p-3.5 rounded-2xl bg-elevated border border-line space-y-3">
          
          {/* Calendar Month Navigation Header */}
          <div className="flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="h-8 w-8 rounded-xl bg-surface border border-line text-ink hover:border-accent flex items-center justify-center text-sm font-bold transition-all"
              title="ماه بعد"
            >
              ‹
            </button>
            <div className="text-sm font-black text-ink flex items-center gap-1.5">
              <span>{jalaliMonthName(cursor.jm)}</span>
              <span className="tabular text-accent font-bold">{toFaDigits(cursor.jy)}</span>
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="h-8 w-8 rounded-xl bg-surface border border-line text-ink hover:border-accent flex items-center justify-center text-sm font-bold transition-all"
              title="ماه قبل"
            >
              ›
            </button>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 text-center text-[11px] text-muted font-semibold pb-1 border-b border-line/60">
            {WEEKDAYS.map((day) => (
              <div key={day} className="py-0.5">
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 text-center text-xs gap-1">
            {Array.from({ length: offset }).map((_, index) => (
              <div key={`offset-${index}`} className="h-8" />
            ))}

            {days.map((day) => {
              const iso = jalaliToIso(cursor.jy, cursor.jm, day);
              const isFrom = from && from.slice(0, 10) === iso;
              const isTo = to && to.slice(0, 10) === iso;
              const isInRange = from && to && iso > from && iso < to;

              let dayClasses = "text-ink hover:bg-hover";
              if (isFrom || isTo) {
                dayClasses = "bg-accent text-on-accent font-black shadow-md shadow-accent/30 scale-105";
              } else if (isInRange) {
                dayClasses = "bg-accent/15 text-accent font-bold";
              }

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleDayClick(iso)}
                  className={`h-8 w-full rounded-xl flex items-center justify-center transition-all tabular font-medium text-xs ${dayClasses}`}
                >
                  {toFaDigits(day)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Presets Strip */}
        <div className="space-y-1.5">
          <span className="text-[11px] text-muted font-semibold block">میانبرهای پرکاربرد:</span>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => {
                const today = todayIso();
                setFrom(today);
                setTo(today);
                const parts = toJalaliParts(today);
                if (parts) setCursor({ jy: parts.jy, jm: parts.jm });
              }}
              className="glass-pill px-3 py-1 text-muted hover:text-ink hover:border-accent transition-all"
            >
              امروز
            </button>

            <button
              type="button"
              onClick={() => {
                const today = todayIso();
                const d = new Date();
                d.setDate(d.getDate() - 7);
                const past = d.toISOString().slice(0, 10);
                setFrom(past);
                setTo(today);
                const parts = toJalaliParts(past);
                if (parts) setCursor({ jy: parts.jy, jm: parts.jm });
              }}
              className="glass-pill px-3 py-1 text-muted hover:text-ink hover:border-accent transition-all"
            >
              ۷ روز گذشته
            </button>

            <button
              type="button"
              onClick={() => {
                const today = todayIso();
                const d = new Date();
                d.setDate(d.getDate() - 30);
                const past = d.toISOString().slice(0, 10);
                setFrom(past);
                setTo(today);
                const parts = toJalaliParts(past);
                if (parts) setCursor({ jy: parts.jy, jm: parts.jm });
              }}
              className="glass-pill px-3 py-1 text-muted hover:text-ink hover:border-accent transition-all"
            >
              ۳۰ روز گذشته
            </button>

            <button
              type="button"
              onClick={() => {
                const today = todayIso();
                const todayParts = toJalaliParts(today);
                if (todayParts) {
                  const monthStart = jalaliToIso(todayParts.jy, todayParts.jm, 1);
                  setFrom(monthStart);
                  setTo(today);
                  setCursor({ jy: todayParts.jy, jm: todayParts.jm });
                }
              }}
              className="glass-pill px-3 py-1 text-muted hover:text-ink hover:border-accent transition-all"
            >
              ماه جاری
            </button>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-muted hover:text-ink hover:bg-hover transition-colors"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(from, to);
              onClose();
            }}
            className="px-5 py-2 rounded-xl bg-accent text-on-accent text-xs font-bold shadow-md shadow-accent/25 hover:opacity-95 transition-all"
          >
            اعمال بازه زمانی
          </button>
        </div>

      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : modalContent;
}
