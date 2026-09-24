import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Badge,
  CustomerNameCell,
  Input,
  PageHeader,
  Pagination,
  Panel,
  SectionHeader,
  Select,
  StatusBadge,
  Tabs,
} from "../components/ui";
import { EmptyState, ErrorState, Skeleton, Table, TableRow } from "../components/Table";
import { RevenueChart } from "../components/dashboard";
import { SalesFilterBar } from "../features/sales/SalesFilterBar";
import { SalesKpiSection } from "../features/sales/SalesKpiSection";
import {
  buildSalesKpiParams,
  deriveSalesLineFilter,
  EMPTY_SALES_FILTERS,
  type SalesFilterValues,
} from "../features/sales/salesPageFilters";
import { useApi } from "../hooks/useApi";
import { customerDisplayName } from "../lib/customerDisplay";
import { formatDate, formatNumber, toInputDate } from "../lib/format";
import { salesService, type ProductSort, type SalesSection } from "../services/sales";
import type { SalesLineKey, TrendGroup } from "../types";

const PRODUCT_SORTS: { value: ProductSort; label: string }[] = [
  { value: "units", label: "واحد" },
  { value: "purchases", label: "خرید" },
  { value: "customers", label: "مشتری" },
  { value: "last_sale", label: "آخرین فروش" },
  { value: "title", label: "نام" },
];

function salesLineTone(key: SalesLineKey) {
  if (key === "ONLINE") return "accent";
  if (key === "SARI") return "sage";
  if (key === "GORGAN") return "neutral";
  return "rose";
}

const SALES_TABS: { key: string; label: string; section?: SalesSection }[] = [
  { key: "overview", label: "خلاصه", section: "overview" },
  { key: "trend", label: "روند", section: "trend" },
  { key: "details", label: "سایز و مرجوعی", section: "details" },
  { key: "products", label: "محصولات" },
  { key: "orders", label: "فروش‌های اخیر" },
];

export function SalesPage() {
  const [params, setParams] = useSearchParams();
  const tab = SALES_TABS.some((item) => item.key === params.get("tab")) ? params.get("tab")! : "overview";
  const [filters, setFilters] = useState<SalesFilterValues>(EMPTY_SALES_FILTERS);
  const [page, setPage] = useState(1);
  const [productPage, setProductPage] = useState(1);
  const [trendGroup, setTrendGroup] = useState<TrendGroup>("daily");
  const [productSearch, setProductSearch] = useState("");
  const [productSort, setProductSort] = useState<ProductSort>("units");
  const [productOrder, setProductOrder] = useState<"asc" | "desc">("desc");

  const salesLine = useMemo(
    () => deriveSalesLineFilter(filters.branches),
    [filters.branches],
  );

  const filterOptions = useApi(() => salesService.filterOptions(), []);

  const kpiQuery = useMemo(() => buildSalesKpiParams(filters), [filters]);
  const showKpiCompare = Boolean(
    filters.compareEnabled && filters.compareFrom && filters.compareTo,
  );

  function updateFilters(next: Partial<SalesFilterValues>) {
    setFilters((current) => ({ ...current, ...next }));
    if (
      "from" in next ||
      "to" in next ||
      "branches" in next ||
      "payments" in next
    ) {
      setPage(1);
      setProductPage(1);
    }
  }

  function resetFilters() {
    setFilters(EMPTY_SALES_FILTERS);
    setPage(1);
    setProductPage(1);
  }

  const trend = useApi(
    () => salesService.summary(filters.from, filters.to, salesLine, trendGroup, "trend"),
    [filters.from, filters.to, salesLine, trendGroup],
    tab === "trend",
  );
  const details = useApi(
    () => salesService.summary(filters.from, filters.to, salesLine, trendGroup, "details"),
    [filters.from, filters.to, salesLine],
    tab === "details",
  );
  const orders = useApi(
    () => salesService.orders(filters.from, filters.to, page, salesLine),
    [filters.from, filters.to, page, salesLine],
    tab === "orders",
  );
  const products = useApi(
    () =>
      salesService.products(
        filters.from,
        filters.to,
        salesLine,
        productPage,
        productSearch,
        productSort,
        productOrder,
      ),
    [filters.from, filters.to, salesLine, productPage, productSearch, productSort, productOrder],
    tab === "products",
  );

  const overviewKpis = useApi(
    () => salesService.overviewKpis(kpiQuery),
    [
      kpiQuery.from,
      kpiQuery.to,
      kpiQuery.branches,
      kpiQuery.payments,
      kpiQuery.compare_from,
      kpiQuery.compare_to,
    ],
    tab === "overview",
  );

  const activeWindow =
    overviewKpis.data?.window || trend.data?.window || details.data?.window;
  const displayFilters = useMemo(() => {
    if (!activeWindow) return filters;
    return {
      ...filters,
      from: filters.from || activeWindow.from || toInputDate(activeWindow.start),
      to: filters.to || activeWindow.to || toInputDate(activeWindow.end),
    };
  }, [activeWindow, filters]);

  return (
    <div>
      <PageHeader title="تحلیل فروش" description={activeWindow?.label} />

      <SalesFilterBar
        values={displayFilters}
        options={filterOptions.data ?? undefined}
        loading={filterOptions.loading && !filterOptions.data}
        onChange={updateFilters}
        onReset={resetFilters}
        showTrendGroup={tab === "trend"}
        trendGroup={trendGroup}
        onTrendGroupChange={setTrendGroup}
      />

      {tab === "overview" ? (
        <SalesKpiSection
          kpis={overviewKpis.data?.kpis}
          showCompare={showKpiCompare}
          loading={overviewKpis.loading}
          error={overviewKpis.error}
        />
      ) : null}

      <div className="mt-6">
        <Tabs
          items={SALES_TABS.map(({ key, label }) => ({ key, label }))}
          value={tab}
          onChange={(key) => {
            const next = new URLSearchParams(params);
            next.set("tab", key);
            setParams(next);
          }}
        />
      </div>

      {tab === "trend" ? (
        trend.loading && !trend.data ? (
          <Skeleton className="mt-6 h-80" />
        ) : trend.error || !trend.data?.trend ? (
          <div className="mt-6">
            <ErrorState />
          </div>
        ) : (
          <Panel className="mt-6">
            <SectionHeader title="روند فروش" hint="تعداد خریدهای معتبر — بر اساس نمایش انتخاب‌شده" />
            <RevenueChart points={trend.data.trend.points.slice(-12)} />
          </Panel>
        )
      ) : null}

      {tab === "details" ? (
        details.loading && !details.data ? (
          <Skeleton className="mt-6 h-80" />
        ) : details.error || !details.data?.size_color || !details.data.physical_returns || !details.data.returns_canceled ? (
          <div className="mt-6">
            <ErrorState />
          </div>
        ) : (
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel>
          <SectionHeader title="سایز و رنگ" hint="پرفروش‌ترین‌ها در بازه فعلی" />
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-3 text-xs font-medium text-muted">سایز</h3>
              {details.data.size_color.sizes.length ? (
                <div className="space-y-2">
                  {details.data.size_color.sizes.map((row) => (
                    <div key={row.label} className="flex justify-between gap-3 text-sm">
                      <span>{row.label}</span>
                      <span className="tabular text-muted">{formatNumber(row.units_sold)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="داده‌ای نیست." />
              )}
            </div>
            <div>
              <h3 className="mb-3 text-xs font-medium text-muted">رنگ</h3>
              {details.data.size_color.colors.length ? (
                <div className="space-y-2">
                  {details.data.size_color.colors.map((row) => (
                    <div key={row.label} className="flex justify-between gap-3 text-sm">
                      <span>{row.label}</span>
                      <span className="tabular text-muted">{formatNumber(row.units_sold)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="داده‌ای نیست." />
              )}
            </div>
          </div>
        </Panel>

        <Panel>
          <SectionHeader title="مرجوعی و تعویض حضوری" hint="فقط POS — لغو آنلاین جداست" />
          {details.data.physical_returns.branches.length ? (
            <Table
              columns={["شعبه", "مرجوعی", "تعویض", "آیتم مرجوعی", "آیتم جایگزین"]}
            >
              {details.data.physical_returns.branches.map((branch) => (
                <TableRow key={branch.key}>
                  <td className="px-3 py-3.5">{branch.label}</td>
                  <td className="px-3 py-3.5 tabular">{formatNumber(branch.refund_count)}</td>
                  <td className="px-3 py-3.5 tabular">{formatNumber(branch.exchange_count)}</td>
                  <td className="px-3 py-3.5 tabular">{formatNumber(branch.refunded_item_units)}</td>
                  <td className="px-3 py-3.5 tabular">{formatNumber(branch.replacement_item_units)}</td>
                </TableRow>
              ))}
            </Table>
          ) : (
            <EmptyState title="برای فیلتر آنلاین، مرجوعی حضوری نمایش داده نمی‌شود." />
          )}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-hover px-3 py-2">
              <dt className="text-muted">آنلاین — لغو</dt>
              <dd className="tabular">{formatNumber(details.data.returns_canceled.online_canceled)}</dd>
            </div>
            <div className="rounded-xl bg-hover px-3 py-2">
              <dt className="text-muted">آنلاین — ناموفق</dt>
              <dd className="tabular">{formatNumber(details.data.returns_canceled.online_failed)}</dd>
            </div>
          </dl>
        </Panel>
      </div>
        )
      ) : null}

      {tab === "products" ? (
      <Panel className="mt-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <SectionHeader title="فروش محصول" hint="جستجو، مرتب‌سازی و صفحه‌بندی سمت سرور" />
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="search"
              placeholder="جستجوی محصول…"
              value={productSearch}
              onChange={(event) => {
                setProductSearch(event.target.value);
                setProductPage(1);
              }}
              className="min-w-[12rem]"
            />
            <Select
              value={productSort}
              onChange={(event) => {
                setProductSort(event.target.value as ProductSort);
                setProductPage(1);
              }}
            >
              {PRODUCT_SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              value={productOrder}
              onChange={(event) => {
                setProductOrder(event.target.value as "asc" | "desc");
                setProductPage(1);
              }}
            >
              <option value="desc">نزولی</option>
              <option value="asc">صعودی</option>
            </Select>
          </div>
        </div>
        {products.loading ? (
          <Skeleton className="h-64" />
        ) : products.error || !products.data ? (
          <ErrorState />
        ) : products.data.results.length === 0 ? (
          <EmptyState title="محصولی در این بازه پیدا نشد." />
        ) : (
          <>
            <Table
              columns={[
                "محصول",
                "واحد",
                "خرید",
                "مشتری",
                "آخرین فروش",
                "آنلاین",
                "ساری",
                "گرگان",
                "کاپری",
              ]}
            >
              {products.data.results.map((row) => (
                <TableRow key={row.product}>
                  <td className="px-3 py-3.5">{row.product}</td>
                  <td className="px-3 py-3.5 tabular">{formatNumber(row.units_sold)}</td>
                  <td className="px-3 py-3.5 tabular">{formatNumber(row.purchase_count)}</td>
                  <td className="px-3 py-3.5 tabular">{formatNumber(row.customer_count)}</td>
                  <td className="px-3 py-3.5 text-muted">{formatDate(row.last_sale_at)}</td>
                  <td className="px-3 py-3.5 tabular">{formatNumber(row.online_units)}</td>
                  <td className="px-3 py-3.5 tabular">{formatNumber(row.sari_units)}</td>
                  <td className="px-3 py-3.5 tabular">{formatNumber(row.gorgan_units)}</td>
                  <td className="px-3 py-3.5 tabular">{formatNumber(row.capri_units)}</td>
                </TableRow>
              ))}
            </Table>
            <Pagination
              page={products.data.page}
              total={products.data.total}
              perPage={products.data.per_page}
              onChange={setProductPage}
            />
          </>
        )}
      </Panel>
      ) : null}

      {tab === "orders" ? (
      <Panel className="mt-6">
        <SectionHeader title="فروش‌های اخیر" />
        {orders.loading ? (
          <Skeleton className="h-64" />
        ) : orders.error || !orders.data ? (
          <ErrorState />
        ) : orders.data.results.length === 0 ? (
          <EmptyState title="اطلاعاتی برای این بازه پیدا نشد." />
        ) : (
          <>
            <Table columns={["تاریخ", "خط فروش", "شناسه", "مشتری", "نوع / وضعیت", "تعداد اقلام"]}>
              {orders.data.results.map((order) => {
                const display = customerDisplayName(order);
                return (
                  <TableRow key={`${order.kind}-${order.id}`}>
                    <td className="px-3 py-3.5 text-muted">{formatDate(order.created_at)}</td>
                    <td className="px-3 py-3.5">
                      <Badge tone={salesLineTone(order.sales_line)}>{order.sales_line_label}</Badge>
                    </td>
                    <td className="ltr-iso px-3 py-3.5 tabular">{order.id}</td>
                    <td className="px-3 py-3.5">
                      {order.customer_id ? (
                        <Link to={`/customers/${order.customer_id}`} className="hover:text-accent">
                          <CustomerNameCell
                            name={display.name}
                            fallback={display.fallback}
                            sourceId={order.customer_id}
                          />
                        </Link>
                      ) : (
                        <CustomerNameCell name={display.name} fallback={display.fallback} />
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      <StatusBadge status={order.status} label={order.status_label} />
                    </td>
                    <td className="px-3 py-3.5 tabular">{formatNumber(order.item_count)}</td>
                  </TableRow>
                );
              })}
            </Table>
            <Pagination
              page={orders.data.page}
              total={orders.data.total}
              perPage={orders.data.per_page}
              onChange={setPage}
            />
          </>
        )}
      </Panel>
      ) : null}
    </div>
  );
}
