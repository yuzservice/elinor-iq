import { Button, Select } from "../../components/ui";
import { JalaliDateField } from "../../components/JalaliDatePicker";
import type { TrendGroup } from "../../types";
import {
  SALES_BRANCH_OPTIONS,
  SALES_CHANNEL_OPTIONS,
  isBranchFilterDisabled,
  type SalesFilterValues,
} from "./salesPageFilters";

const TREND_GROUPS: { value: TrendGroup; label: string }[] = [
  { value: "daily", label: "روزانه" },
  { value: "weekly", label: "هفتگی" },
  { value: "monthly", label: "ماهانه" },
  { value: "weekday", label: "روزهای هفته" },
  { value: "hourly", label: "ساعت روز" },
];

type SalesFilterBarProps = {
  values: SalesFilterValues;
  onChange: (next: Partial<SalesFilterValues>) => void;
  showTrendGroup?: boolean;
  trendGroup?: TrendGroup;
  onTrendGroupChange?: (group: TrendGroup) => void;
};

function DateRangeFields({
  from,
  to,
  onFromChange,
  onToChange,
  allowEmpty = false,
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 text-[11px] text-muted">از</span>
      <JalaliDateField
        value={from}
        allowEmpty={allowEmpty}
        emptyLabel="انتخاب"
        compact
        onChange={onFromChange}
      />
      <span className="shrink-0 text-[11px] text-muted">تا</span>
      <JalaliDateField
        value={to}
        allowEmpty={allowEmpty}
        emptyLabel="انتخاب"
        compact
        onChange={onToChange}
      />
    </div>
  );
}

export function SalesFilterBar({
  values,
  onChange,
  showTrendGroup = false,
  trendGroup = "daily",
  onTrendGroupChange,
}: SalesFilterBarProps) {
  const branchDisabled = isBranchFilterDisabled(values.channel);

  function enableCompare() {
    onChange({
      compareEnabled: true,
      compareFrom: "",
      compareTo: "",
    });
  }

  function disableCompare() {
    onChange({
      compareEnabled: false,
      compareFrom: "",
      compareTo: "",
    });
  }

  return (
    <section
      className="rounded-[20px] border border-line bg-surface px-3 py-2.5 shadow-soft"
      aria-label="فیلترهای نمای کلی فروش"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-full border border-line/80 bg-elevated/70 px-2 py-1">
          <DateRangeFields
            from={values.from}
            to={values.to}
            onFromChange={(from) => onChange({ from })}
            onToChange={(to) => onChange({ to })}
          />
        </div>

        <Select
          value={values.branch}
          disabled={branchDisabled}
          onChange={(event) => onChange({ branch: event.target.value as SalesFilterValues["branch"] })}
          className={`min-w-[8.5rem] ${branchDisabled ? "opacity-50" : ""}`}
          aria-label="فیلتر شعبه"
        >
          {SALES_BRANCH_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          value={values.channel}
          onChange={(event) => {
            const channel = event.target.value as SalesFilterValues["channel"];
            onChange({
              channel,
              branch: channel === "ONLINE" ? "all" : values.branch,
            });
          }}
          className="min-w-[8.5rem]"
          aria-label="فیلتر کانال فروش"
        >
          {SALES_CHANNEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        {showTrendGroup && onTrendGroupChange ? (
          <Select
            value={trendGroup}
            onChange={(event) => onTrendGroupChange(event.target.value as TrendGroup)}
            className="min-w-[7.5rem]"
            aria-label="گروه‌بندی روند"
          >
            {TREND_GROUPS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        ) : null}

        {!values.compareEnabled ? (
          <Button type="button" variant="quiet" className="h-9 px-3 text-xs" onClick={enableCompare}>
            + مقایسه
          </Button>
        ) : null}
      </div>

      {values.compareEnabled ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line/70 pt-2">
          <span className="shrink-0 text-[11px] font-medium text-muted">مقایسه با:</span>
          <div className="flex items-center rounded-full border border-line/80 bg-elevated/70 px-2 py-1">
            <DateRangeFields
              from={values.compareFrom}
              to={values.compareTo}
              allowEmpty
              onFromChange={(compareFrom) => onChange({ compareFrom })}
              onToChange={(compareTo) => onChange({ compareTo })}
            />
          </div>
          <Button type="button" variant="quiet" className="h-9 px-3 text-xs text-muted" onClick={disableCompare}>
            × حذف مقایسه
          </Button>
        </div>
      ) : null}
    </section>
  );
}
