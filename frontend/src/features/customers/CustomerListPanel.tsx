import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, CustomerNameCell, Input, Pagination, SearchInput, Select } from "../../components/ui";
import { JalaliDateField } from "../../components/JalaliDatePicker";
import { EmptyState, ErrorState, LoadingState, Table, TableRow } from "../../components/Table";
import { useApi } from "../../hooks/useApi";
import { INCOMPLETE_LABEL, customerDisplayName } from "../../lib/customerDisplay";
import { formatDate, formatMobile, formatNumber, formatToman } from "../../lib/format";
import { customersService } from "../../services/customers";
import {
  buildCustomerListParams,
  describeCustomerFilters,
  EMPTY_CUSTOMER_FILTERS,
  hasActiveCustomerFilters,
  TIER_OPTIONS,
  type CustomerListFilters,
} from "./customerListFilters";
import { SalesLineMultiSelect } from "./SalesLineMultiSelect";

const COLUMNS = [
  "نام و نام خانوادگی",
  "موبایل",
  "سطح مشتری",
  "تعداد خرید",
  "کل مبلغ خرید",
  "اولین خرید",
  "آخرین خرید",
  "خرید آنلاین",
  "خرید حضوری",
  "خطوط فروش استفاده‌شده",
  "وضعیت",
  "مشاهده",
];

export function CustomerListPanel({ population = "all" }: { population?: string }) {
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [filters, setFilters] = useState<CustomerListFilters>({
    ...EMPTY_CUSTOMER_FILTERS,
    population: population || "all",
  });
  const listParams = useMemo(() => buildCustomerListParams(filters, applied, { page }), [applied, filters, page]);
  const { data, loading, error } = useApi(
    () => customersService.list(listParams),
    [listParams, retry],
  );

  const activeFilterChips = useMemo(() => describeCustomerFilters(filters, applied), [applied, filters]);
  const hasFilters = useMemo(() => hasActiveCustomerFilters(filters, applied), [applied, filters]);
  const showTierScopeHint = Boolean(filters.tier);

  function updateFilter<K extends keyof CustomerListFilters>(key: K, value: CustomerListFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function resetFilters() {
    setSearch("");
    setApplied("");
    setFilters({ ...EMPTY_CUSTOMER_FILTERS });
    setAdvancedOpen(false);
    setPage(1);
    setExportError(null);
  }

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      await customersService.exportList(buildCustomerListParams(filters, applied));
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "خروجی اکسل با خطا مواجه شد.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <form
        className="mb-4 flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setApplied(search.trim());
        }}
      >
        <div className="min-w-[260px] flex-1">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="جستجو نام یا موبایل"
          />
        </div>
        <Button type="submit" variant="ghost">
          جستجو
        </Button>
        <Button type="button" variant="quiet" onClick={resetFilters} disabled={!hasFilters && !search}>
          بازنشانی فیلترها
        </Button>
      </form>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select value={filters.population} onChange={(event) => updateFilter("population", event.target.value)}>
          <option value="all">همه مشتریان</option>
          <option value="purchasing">مشتریان خریدار</option>
          <option value="registered">ثبت‌شده بدون خرید</option>
        </Select>
        <Select value={filters.tier} onChange={(event) => updateFilter("tier", event.target.value)}>
          <option value="">سطح مشتری</option>
          {TIER_OPTIONS.map((tier) => (
            <option key={tier.value} value={tier.value}>
              {tier.label}
            </option>
          ))}
        </Select>
        <SalesLineMultiSelect
          value={filters.salesLines}
          onChange={(salesLines) => updateFilter("salesLines", salesLines)}
        />
        <Button type="button" variant="quiet" onClick={() => setAdvancedOpen((open) => !open)}>
          {advancedOpen ? "فیلتر کمتر ▴" : "فیلتر بیشتر ▾"}
        </Button>
      </div>

      {advancedOpen ? (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="w-28">
            <Input
              inputMode="numeric"
              placeholder="حداقل خرید"
              value={filters.minPurchases}
              onChange={(event) => updateFilter("minPurchases", event.target.value.replace(/[^\d]/g, ""))}
            />
          </div>
          <div className="w-28">
            <Input
              inputMode="numeric"
              placeholder="حداکثر خرید"
              value={filters.maxPurchases}
              onChange={(event) => updateFilter("maxPurchases", event.target.value.replace(/[^\d]/g, ""))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2">
            <span className="text-xs text-muted">آخرین خرید</span>
            <JalaliDateField
              value={filters.lastFrom}
              allowEmpty
              emptyLabel="از"
              onChange={(value) => updateFilter("lastFrom", value)}
            />
            <JalaliDateField
              value={filters.lastTo}
              allowEmpty
              emptyLabel="تا"
              onChange={(value) => updateFilter("lastTo", value)}
            />
          </div>
        </div>
      ) : null}

      {showTierScopeHint ? (
        <p className="mb-4 text-xs text-muted">
          سطح مشتری بر اساس کل خریدها محاسبه می‌شود. خط فروش فقط مشتریانی را نشان می‌دهد که در آن خط خرید داشته‌اند.
        </p>
      ) : null}

      {activeFilterChips.length ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {activeFilterChips.map((chip) => (
            <Badge key={chip} tone="accent">
              {chip}
            </Badge>
          ))}
        </div>
      ) : null}

      {loading && !data ? (
        <LoadingState rows={8} />
      ) : error && !data ? (
        <ErrorState onRetry={() => setRetry((value) => value + 1)} />
      ) : !data || data.results.length === 0 ? (
        <EmptyState
          title="مشتری‌ای با این شرایط پیدا نشد."
          body={hasFilters ? "جستجو یا فیلتر دیگری را امتحان کنید." : "هنوز مشتری‌ای در سامانه ثبت نشده است."}
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
            <span className="tabular">{formatNumber(data.total)} مشتری</span>
            <div className="flex flex-wrap items-center gap-2">
              {loading ? <span className="text-xs text-faint">در حال به‌روزرسانی...</span> : null}
              <Button type="button" variant="quiet" onClick={handleExport} disabled={exporting || data.total === 0}>
                {exporting ? "در حال خروجی..." : "خروجی اکسل"}
              </Button>
            </div>
          </div>
          {exportError ? <p className="mb-3 text-sm text-warning">{exportError}</p> : null}
          <Table columns={COLUMNS} compact>
            {data.results.map((customer) => {
              const display = customerDisplayName(customer);
              return (
                <TableRow key={customer.id}>
                  <td className="px-3 py-2">
                    <CustomerNameCell name={display.name} fallback={display.fallback} sourceId={customer.id} />
                  </td>
                  <td className="ltr-iso px-3 py-2 tabular text-muted">
                    {customer.mobile ? formatMobile(customer.mobile) : INCOMPLETE_LABEL}
                  </td>
                  <td className="px-3 py-2">
                    {customer.tier_label ? <Badge tone="accent">{customer.tier_label}</Badge> : <span className="text-faint">—</span>}
                  </td>
                  <td className="px-3 py-2 tabular">{formatNumber(customer.order_count)}</td>
                  <td className="px-3 py-2 tabular">{formatToman(customer.lifetime_purchase_amount)}</td>
                  <td className="px-3 py-2 text-muted">{formatDate(customer.first_purchase_at)}</td>
                  <td className="px-3 py-2 text-muted">{formatDate(customer.last_purchase_at)}</td>
                  <td className="px-3 py-2 tabular">{formatNumber(customer.online_count)}</td>
                  <td className="px-3 py-2 tabular">{formatNumber(customer.pos_count)}</td>
                  <td className="px-3 py-2">
                    {customer.sales_line_labels.length ? (
                      <div className="flex flex-wrap gap-1">
                        {customer.sales_line_labels.map((label) => (
                          <Badge key={label}>{label}</Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {customer.status_label && customer.status_label !== "—" ? (
                        <Badge tone={customer.status_label === "فعال" ? "sage" : "neutral"}>
                          {customer.status_label}
                        </Badge>
                      ) : null}
                      {customer.incomplete ? <Badge tone="warning">{INCOMPLETE_LABEL}</Badge> : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Link to={`/customers/${customer.id}`} className="text-sm text-accent">
                      مشاهده
                    </Link>
                  </td>
                </TableRow>
              );
            })}
          </Table>
          <Pagination page={data.page} total={data.total} perPage={data.per_page} onChange={setPage} />
        </>
      )}
    </div>
  );
}
