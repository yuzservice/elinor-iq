import { SALES_LINE_OPTIONS, type SalesLineValue } from "./customerListFilters";

type SalesLineMultiSelectProps = {
  value: SalesLineValue[];
  onChange: (value: SalesLineValue[]) => void;
};

export function SalesLineMultiSelect({ value, onChange }: SalesLineMultiSelectProps) {
  function toggle(line: SalesLineValue) {
    if (value.includes(line)) {
      onChange(value.filter((current) => current !== line));
      return;
    }
    onChange([...value, line]);
  }

  return (
    <div className="flex h-11 items-center gap-1 rounded-xl border border-line bg-elevated px-1.5">
      <span className="px-2 text-xs text-muted">خط فروش</span>
      <div className="flex items-center gap-1" role="group" aria-label="خط فروش">
        {SALES_LINE_OPTIONS.map((option) => {
          const selected = value.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => toggle(option.value)}
              className={`h-8 rounded-lg px-3 text-xs transition-colors ${
                selected
                  ? "bg-accent text-on-accent"
                  : "text-muted hover:bg-hover hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
