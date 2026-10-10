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
  const selected = isoToJalali(value) || toJalaliParts(todayIso());
  const [cursor, setCursor] = useState(selected || { jy: 1405, jm: 1, jd: 1 });

  useEffect(() => {
    if (selected) setCursor(selected);
  }, [value]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!open || !root.current) return;

    function updatePosition() {
      if (!root.current) return;
      const rect = root.current.getBoundingClientRect();
      const width = 288;
      const height = 320;
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

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`rounded-xl border border-line bg-elevated px-3 tabular text-ink ${
          compact ? "h-9 w-[7.5rem] whitespace-nowrap text-xs" : "h-10 min-w-[8.5rem] whitespace-nowrap text-sm"
        }`}
        aria-label="انتخاب تاریخ شمسی"
      >
        {value ? formatJalali(value) : allowEmpty ? emptyLabel : formatJalali(todayIso())}
      </button>
      {open ? (
        <div
          className="fixed z-50 w-72 rounded-2xl border border-line bg-elevated p-3 shadow-soft"
          style={{ top: popupStyle.top, left: popupStyle.left }}
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
          <div className="mb-2 grid grid-cols-7 text-center text-[11px] text-faint">
            {WEEKDAYS.map((day) => (
              <div key={day} className="py-1">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 text-center text-sm">
            {Array.from({ length: offset }).map((_, index) => (
              <div key={`e-${index}`} />
            ))}
            {days.map((day) => {
              const iso = jalaliToIso(cursor.jy, cursor.jm, day);
              const active = value.slice(0, 10) === iso;
              return (
                <button
                  key={day}
                  type="button"
                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full ${
                    active ? "bg-accent text-on-accent font-bold shadow-md" : "text-ink hover:bg-hover"
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
        </div>
      ) : null}
    </div>
  );
}

// 2026 Interactive Persian Date Range Modal
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
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  useEffect(() => {
    setFrom(initialFrom);
    setTo(initialTo);
  }, [initialFrom, initialTo, isOpen]);

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md bento-card p-6 glass-rim shadow-2xl space-y-5 animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-line">
          <div className="flex items-center gap-2">
            <span className="text-base">📅</span>
            <h3 className="text-base font-extrabold text-ink">انتخاب بازه تاریخ شمسی</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-elevated hover:bg-hover flex items-center justify-center text-muted hover:text-ink text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Date fields */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-muted font-semibold mb-1.5">از تاریخ:</label>
            <JalaliDateField value={from} onChange={setFrom} />
          </div>
          <div>
            <label className="block text-muted font-semibold mb-1.5">تا تاریخ:</label>
            <JalaliDateField value={to} onChange={setTo} />
          </div>
        </div>

        {/* Quick Presets */}
        <div className="space-y-1.5">
          <span className="text-[11px] text-faint font-semibold">بازه­‌های پیشنهادی:</span>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => {
                const today = todayIso();
                setFrom(today);
                setTo(today);
              }}
              className="glass-pill px-2.5 py-1 text-muted hover:text-ink hover:border-accent"
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
              }}
              className="glass-pill px-2.5 py-1 text-muted hover:text-ink hover:border-accent"
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
              }}
              className="glass-pill px-2.5 py-1 text-muted hover:text-ink hover:border-accent"
            >
              ۳۰ روز گذشته
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-line">
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
            className="px-5 py-2 rounded-xl bg-accent text-on-accent text-xs font-bold shadow-md hover:opacity-95 transition-all"
          >
            اعمال بازه زمانی
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : modalContent;
}
