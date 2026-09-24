import { Button } from "../../components/ui";
import { JalaliDateField } from "../../components/JalaliDatePicker";
import type { ReactNode } from "react";
import type { TrendGroup } from "../../types";
import { FilterMultiSelect } from "./FilterMultiSelect";
import {
  describeSalesFilterSelections,
  hasActiveSalesFilters,
  isBranchFilterDisabled,
  type SalesFilterOptions,
  type SalesFilterValues,
} from "./salesPageFilters";

const TREND_GROUPS: { value: TrendGroup; label: string }[] = [
  { value: "daily", label: "روزانه" },
  { value: "weekly", label: "هفتگی" },
  { value: "monthly", label: "ماهانه" },
  { value: "weekday", label: "روزهای هفته" },
  { value: "hourly", label: "ساعت روز" },
];

const EMPTY_OPTIONS: SalesFilterOptions = {
  branches: [],
  channels: [],
  payment_methods: [],
};

type SalesFilterBarProps = {
  values: SalesFilterValues;
  options?: SalesFilterOptions;
  loading?: boolean;
  onChange: (next: Partial<SalesFilterValues>) => void;
  onReset: () => void;
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
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
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

function DateRangeBlock({
  active,
  children,
}: {
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex min-w-0 items-center rounded-full border px-2 py-1 ${
        active ? "border-accent/40 bg-accent/5" : "border-line/80 bg-elevated/70"
      }`}
    >
      {children}
    </div>
  );
}

export function SalesFilterBar({
  values,
  options = EMPTY_OPTIONS,
  loading = false,
  onChange,
  onReset,
  showTrendGroup = false,
  trendGroup = "daily",
  onTrendGroupChange,
}: SalesFilterBarProps) {
  const branchDisabled = isBranchFilterDisabled(values.channels);
  const hasActive = hasActiveSalesFilters(values);
  const activeChips = describeSalesFilterSelections(values, options);

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
      className="rounded-[20px] border border-line bg-surface px-3 py-2.5 shadow-soft sm:px-4 sm:py-3"
      aria-label="فیلترهای نمای کلی فروش"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-12 xl:items-center xl:gap-2">
        <div className="min-w-0 sm:col-span-2 xl:col-span-3">
          <DateRangeBlock active={Boolean(values.from || values.to)}>
            <DateRangeFields
              from={values.from}
              to={values.to}
              onFromChange={(from) => onChange({ from })}
              onToChange={(to) => onChange({ to })}
            />
          </DateRangeBlock>
        </div>

        <FilterMultiSelect
          label="فیلتر شعبه"
          allLabel="همه شعبه‌ها"
          options={options.branches}
          value={values.branches}
          disabled={branchDisabled || loading}
          className="sm:col-span-1 xl:col-span-2"
          onChange={(branches) => onChange({ branches })}
        />

        <FilterMultiSelect
          label="فیلتر کانال فروش"
          allLabel="همه کانال‌ها"
          options={options.channels}
          value={values.channels}
          disabled={loading}
          className="sm:col-span-1 xl:col-span-2"
          onChange={(channels) => {
            const onlineOnly =
              channels.length > 0 &&
              channels.every((key) => key !== "pos") &&
              channels.every((key) => ["website", "shopino", "digify"].includes(key));
            onChange({
              channels,
              branches: onlineOnly ? [] : values.branches,
            });
          }}
        />

        <FilterMultiSelect
          label="فیلتر روش پرداخت"
          allLabel="همه روش‌های پرداخت"
          options={options.payment_methods}
          value={values.payments}
          disabled={loading}
          className="sm:col-span-2 xl:col-span-2"
          onChange={(payments) => onChange({ payments })}
        />

        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:col-span-2 xl:col-span-3 xl:justify-end">
          {showTrendGroup && onTrendGroupChange ? (
            <select
              value={trendGroup}
              onChange={(event) => onTrendGroupChange(event.target.value as TrendGroup)}
              className="h-9 min-w-0 flex-1 rounded-full border border-line bg-elevated px-3 text-xs text-ink outline-none focus:border-accent/40 sm:flex-none sm:min-w-[7.5rem]"
              aria-label="گروه‌بندی روند"
            >
              {TREND_GROUPS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : null}

          {!values.compareEnabled ? (
            <Button type="button" variant="quiet" className="h-9 shrink-0 px-3 text-xs" onClick={enableCompare}>
              + مقایسه
            </Button>
          ) : null}

          <Button
            type="button"
            variant="quiet"
            className="h-9 shrink-0 px-3 text-xs"
            disabled={!hasActive}
            onClick={onReset}
          >
            بازنشانی
          </Button>
        </div>
      </div>

      {values.compareEnabled ? (
        <div className="mt-2 flex flex-col gap-2 border-t border-line/70 pt-2 sm:flex-row sm:flex-wrap sm:items-center">
          <span className="shrink-0 text-[11px] font-medium text-muted">مقایسه با:</span>
          <DateRangeBlock active={Boolean(values.compareFrom || values.compareTo)}>
            <DateRangeFields
              from={values.compareFrom}
              to={values.compareTo}
              allowEmpty
              onFromChange={(compareFrom) => onChange({ compareFrom })}
              onToChange={(compareTo) => onChange({ compareTo })}
            />
          </DateRangeBlock>
          <Button
            type="button"
            variant="quiet"
            className="h-9 w-full px-3 text-xs text-muted sm:w-auto"
            onClick={disableCompare}
          >
            × حذف مقایسه
          </Button>
        </div>
      ) : null}

      {activeChips.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line/50 pt-2">
          {activeChips.map((chip) => (
            <span
              key={chip}
              className="inline-flex max-w-full truncate rounded-full bg-accent/10 px-2.5 py-1 text-[11px] text-accent"
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
