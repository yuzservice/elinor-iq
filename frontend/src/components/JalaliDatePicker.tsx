import { useEffect, useRef, useState } from "react";
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
}: {
  value: string;
  onChange: (iso: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
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
        className="h-10 min-w-[8.5rem] rounded-xl border border-line bg-elevated px-3 text-sm tabular text-ink"
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
            <div className="text-sm">
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
                    active ? "bg-accent text-on-accent" : "hover:bg-hover"
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
