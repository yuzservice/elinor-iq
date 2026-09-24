import { Fragment, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, CustomerNameCell, Pagination, Panel, StatusBadge, Tabs } from "../components/ui";
import { EmptyState, ErrorState, Skeleton, Table, TableRow } from "../components/Table";
import { joinFacts, profileValue, salesLineTone } from "../features/customers/customer360Display";
import { useApi } from "../hooks/useApi";
import { INCOMPLETE_LABEL, customerDisplayName } from "../lib/customerDisplay";
import { formatDate, formatDateLong, formatMobile, formatNumber, formatToman } from "../lib/format";
import { customersService } from "../services/customers";
import type { Customer360, CustomerPurchase, CustomerProductHistory } from "../types";

const TABS = [
  { key: "purchases", label: "سوابق خرید" },
  { key: "products", label: "محصولات خریداری‌شده" },
  { key: "profile", label: "اطلاعات مشتری" },
  { key: "addresses", label: "آدرس‌ها" },
  { key: "discounts", label: "تخفیف‌ها" },
];

export function Customer360Page() {
  const { id } = useParams();
  const [tab, setTab] = useState("purchases");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState<Customer360["purchases"] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [products, setProducts] = useState<CustomerProductHistory[] | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState(false);
  const [productRetry, setProductRetry] = useState(0);
  const { data, loading, error } = useApi(() => customersService.detail(Number(id)), [id]);

  useEffect(() => {
    setTab("purchases");
    setOpenKey(null);
    setHistoryPage(1);
    setHistory(null);
    setProducts(null);
    setProductsError(false);
    setProductRetry(0);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    if (historyPage === 1) {
      if (data?.purchases) setHistory(data.purchases);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    customersService
      .purchases(Number(id), historyPage)
      .then((payload) => {
        if (!cancelled) setHistory(payload);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, historyPage, data]);

  useEffect(() => {
    if (!id || tab !== "products") return;
    if (products && !productsError) return;
    let cancelled = false;
    setProductsLoading(true);
    setProductsError(false);
    customersService
      .products(Number(id))
      .then((payload) => {
        if (!cancelled) setProducts(payload.results);
      })
      .catch(() => {
        if (!cancelled) setProductsError(true);
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, tab, productRetry]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-44" />
        <Skeleton className="h-28" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (error || !data) return <ErrorState />;

  const display = customerDisplayName(data);
  const purchases = history || data.purchases;

  return (
    <div>
      <div className="mb-8 text-sm text-muted">
        <Link to="/customers?tab=list" className="hover:text-ink">
          مشتریان
        </Link>
        <span className="mx-2 text-faint">/</span>
        <span>{display.name}</span>
      </div>

      <section className="rounded-3xl border border-line bg-surface px-8 py-8 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div className="min-w-0 max-w-xl">
            <div className="text-[11px] tracking-brand text-accent">شناسنامه مشتری</div>
            <h1 className="mt-3 text-[32px] font-medium leading-tight tracking-tight text-ink">
              <CustomerNameCell name={display.name} fallback={display.fallback} sourceId={data.id} />
            </h1>
            <div className="mt-3 ltr-iso text-base text-muted">
              {data.mobile ? formatMobile(data.mobile) : INCOMPLETE_LABEL}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Badge tone={data.status_label === "فعال" ? "sage" : "neutral"}>
                {data.status_label || "وضعیت ثبت نشده"}
              </Badge>
              <Badge tone={data.is_purchasing ? "sage" : "neutral"}>{data.purchase_behavior_label}</Badge>
              {data.tier_label ? <Badge tone="accent">{data.tier_label}</Badge> : null}
              {data.channel !== "none" ? <Badge tone="accent">{data.channel_label}</Badge> : null}
              {data.incomplete ? <Badge tone="warning">{INCOMPLETE_LABEL}</Badge> : null}
            </div>
          </div>
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <IdentityFact label="شناسه مشتری" value={formatNumber(data.id)} ltr />
            <IdentityFact label="وضعیت" value={profileValue(data.status_label)} />
            <IdentityFact label="اولین خرید" value={data.first_purchase_at ? formatDateLong(data.first_purchase_at) : "ثبت نشده"} />
            <IdentityFact label="آخرین خرید" value={data.last_purchase_at ? formatDateLong(data.last_purchase_at) : "ثبت نشده"} />
          </div>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {data.sales_lines.map((line) => (
            <div key={line.key} className="rounded-2xl bg-hover/70 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <Badge tone={salesLineTone(line.key)}>{line.label}</Badge>
                <span className="tabular text-sm">{formatNumber(line.purchase_count)}</span>
              </div>
              <div className="mt-2 text-[11px] text-faint">{line.used ? "استفاده شده" : "بدون خرید"}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-soft lg:grid-cols-4">
        <Summary label="تعداد خرید" value={formatNumber(data.purchase_count)} />
        <Summary label="خرید آنلاین" value={formatNumber(data.online_count)} />
        <Summary label="خرید حضوری" value={formatNumber(data.pos_count)} />
        <Summary label="تعداد اقلام" value={formatNumber(data.items_sold)} />
        <Summary label="خطوط فروش استفاده‌شده" value={formatNumber(data.sales_line_count)} />
        <Summary label="اولین خرید" value={data.first_purchase_at ? formatDate(data.first_purchase_at) : "ثبت نشده"} />
        <Summary label="آخرین خرید" value={data.last_purchase_at ? formatDate(data.last_purchase_at) : "ثبت نشده"} />
      </div>
      <p className="mt-3 text-xs leading-6 text-faint">
        تعداد خرید با تعریف لیست مشتریان یکسان است. مبلغ یکپارچه آنلاین و حضوری ساخته نشده؛ فقط مبلغ ذخیره‌شده سفارش
        آنلاین در سوابق آمده است.
      </p>

      <div className="mt-10">
        <Tabs items={TABS} value={tab} onChange={setTab} />
      </div>

      <div className="mt-6">
        {tab === "purchases" ? (
          <PurchaseHistory
            purchases={purchases}
            loading={historyLoading}
            openKey={openKey}
            onToggle={setOpenKey}
            onPageChange={setHistoryPage}
          />
        ) : null}
        {tab === "products" ? (
          productsLoading || products === null ? (
            productsError ? (
              <ErrorState onRetry={() => setProductRetry((value) => value + 1)} />
            ) : (
              <Skeleton className="h-64" />
            )
          ) : (
            <ProductHistory products={products} />
          )
        ) : null}
        {tab === "profile" ? <ProfileTab data={data} displayName={display.name} /> : null}
        {tab === "addresses" ? <AddressTab addresses={data.addresses} /> : null}
        {tab === "discounts" ? <DiscountTab discounts={data.discounts} /> : null}
      </div>
    </div>
  );
}

function PurchaseHistory({
  purchases,
  loading,
  openKey,
  onToggle,
  onPageChange,
}: {
  purchases: Customer360["purchases"];
  loading: boolean;
  openKey: string | null;
  onToggle: (key: string | null) => void;
  onPageChange: (page: number) => void;
}) {
  if (!purchases.total) {
    return <EmptyState title="خریدی برای این مشتری ثبت نشده است." body="ثبت‌نام به‌معنای خرید نیست." />;
  }
  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm text-muted">
        <span className="tabular">{formatNumber(purchases.total)} سابقه</span>
        {loading ? <span className="text-xs text-faint">در حال به‌روزرسانی...</span> : null}
      </div>
      <Table
        compact
        columns={["تاریخ", "خط فروش", "شناسه", "نوع", "اقلام", "وضعیت", "مبلغ", "جزئیات"]}
      >
        {purchases.results.map((row) => {
          const open = openKey === row.key;
          return (
            <Fragment key={row.key}>
              <TableRow className="cursor-pointer" onClick={() => onToggle(open ? null : row.key)}>
                <td className="px-3 py-2.5 text-muted">{formatDate(row.created_at)}</td>
                <td className="px-3 py-2.5">
                  <Badge tone={salesLineTone(row.sales_line)}>{row.sales_line_label}</Badge>
                </td>
                <td className="ltr-iso px-3 py-2.5 tabular text-muted">{row.source_id}</td>
                <td className="px-3 py-2.5 text-muted">{row.type_label}</td>
                <td className="px-3 py-2.5 tabular">{formatNumber(row.item_count)}</td>
                <td className="px-3 py-2.5">
                  {row.kind === "online" ? (
                    <StatusBadge status={row.status} label={row.status_label} />
                  ) : (
                    <Badge tone={row.type === "refund" || row.is_cancelled ? "rose" : "sage"}>{row.status_label}</Badge>
                  )}
                </td>
                <td className="px-3 py-2.5 tabular">
                  {row.value_kind === "online_total" ? formatToman(row.value) : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    className="text-sm text-accent"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggle(open ? null : row.key);
                    }}
                  >
                    {open ? "بستن" : "مشاهده جزئیات"}
                  </button>
                </td>
              </TableRow>
              {open ? (
                <tr>
                  <td colSpan={8} className="bg-hover/60 px-5 py-4">
                    <PurchaseDetail purchase={row} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </Table>
      <Pagination page={purchases.page} total={purchases.total} perPage={purchases.per_page} onChange={onPageChange} />
    </div>
  );
}

function PurchaseDetail({ purchase }: { purchase: CustomerPurchase }) {
  if (!purchase.items.length) {
    return <div className="text-sm text-muted">اقلامی برای این سابقه ثبت نشده است.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-right text-[12px] text-faint">
            {["محصول", "تنوع", "تعداد", "رنگ", "سایز", "مبلغ قلم", "تخفیف قلم"].map((column) => (
              <th key={column} className="px-2 py-2 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {purchase.items.map((item) => (
            <tr key={item.id} className="border-t border-line/70">
              <td className="px-2 py-2">
                {item.product}
                {item.type_label ? <div className="mt-1 text-[11px] text-faint">{item.type_label}</div> : null}
              </td>
              <td className="px-2 py-2 text-muted">{item.variant || "—"}</td>
              <td className="px-2 py-2 tabular">{formatNumber(item.quantity)}</td>
              <td className="px-2 py-2 text-muted">{item.color || "—"}</td>
              <td className="px-2 py-2 text-muted">{item.size || "—"}</td>
              <td className="px-2 py-2 tabular">{formatToman(item.amount)}</td>
              <td className="px-2 py-2 tabular text-muted">
                {item.discount_amount ? formatToman(item.discount_amount) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductHistory({ products }: { products: CustomerProductHistory[] }) {
  if (!products.length) {
    return <EmptyState title="محصول خریداری‌شده‌ای برای این مشتری نیست." />;
  }
  return (
    <Table compact columns={["محصول", "تعداد", "دفعات خرید", "آخرین خرید", "رنگ‌ها", "سایزها"]}>
      {products.map((row) => (
        <TableRow key={`${row.product}-${row.last_purchase_at}`}>
          <td className="px-3 py-2.5">{row.product}</td>
          <td className="px-3 py-2.5 tabular">{formatNumber(row.total_quantity)}</td>
          <td className="px-3 py-2.5 tabular">{formatNumber(row.purchase_count)}</td>
          <td className="px-3 py-2.5 text-muted">{formatDate(row.last_purchase_at)}</td>
          <td className="px-3 py-2.5 text-muted">{joinFacts(row.colors)}</td>
          <td className="px-3 py-2.5 text-muted">{joinFacts(row.sizes)}</td>
        </TableRow>
      ))}
    </Table>
  );
}

function ProfileTab({ data, displayName }: { data: Customer360; displayName: string }) {
  const rows = [
    ["نام", displayName],
    ["موبایل", data.mobile ? formatMobile(data.mobile) : INCOMPLETE_LABEL],
    ["ایمیل", profileValue(data.email)],
    ["وضعیت حساب", profileValue(data.status_label)],
    ["جنسیت", profileValue(data.profile.gender_label || data.profile.gender)],
    ["کد ملی", profileValue(data.profile.national_code)],
    ["تاریخ تولد", data.profile.birth_date ? formatDate(data.profile.birth_date) : "ثبت نشده"],
    ["سطح باشگاه", profileValue(data.profile.club_level)],
    ["شماره کارت", profileValue(data.profile.card_number)],
    ["ایجاد در منبع", data.profile.created_at ? formatDate(data.profile.created_at) : "ثبت نشده"],
    ["به‌روزرسانی منبع", data.profile.updated_at ? formatDate(data.profile.updated_at) : "ثبت نشده"],
  ];
  return (
    <Panel className="max-w-2xl">
      {rows.map(([label, value]) => (
        <Row key={label} label={label} value={value} ltr={label === "موبایل" || label === "کد ملی" || label === "شماره کارت"} />
      ))}
    </Panel>
  );
}

function AddressTab({ addresses }: { addresses: Customer360["addresses"] }) {
  if (!addresses.length) {
    return <EmptyState title="آدرسی برای این مشتری ثبت نشده است." />;
  }
  return (
    <Table compact columns={["استان", "شهر", "آدرس", "کد پستی", "گیرنده", "موبایل گیرنده"]}>
      {addresses.map((address, index) => (
        <TableRow key={`${address.postal_code}-${index}`}>
          <td className="px-3 py-2.5">{profileValue(address.province)}</td>
          <td className="px-3 py-2.5">{profileValue(address.city)}</td>
          <td className="px-3 py-2.5">{profileValue(address.address)}</td>
          <td className="ltr-iso px-3 py-2.5 tabular text-muted">{profileValue(address.postal_code)}</td>
          <td className="px-3 py-2.5">{profileValue(address.recipient_name)}</td>
          <td className="ltr-iso px-3 py-2.5 tabular text-muted">{profileValue(address.recipient_mobile)}</td>
        </TableRow>
      ))}
    </Table>
  );
}

function DiscountTab({ discounts }: { discounts: Customer360["discounts"] }) {
  if (!discounts.length) {
    return <EmptyState title="تخفیف ثبت‌شده‌ای برای این مشتری نیست." />;
  }
  return (
    <Table compact columns={["تاریخ", "خط فروش", "شناسه", "وضعیت", "تخفیف"]}>
      {discounts.map((row) => (
        <TableRow key={`${row.kind}-${row.source_id}`}>
          <td className="px-3 py-2.5 text-muted">{formatDate(row.created_at)}</td>
          <td className="px-3 py-2.5">
            <Badge tone={salesLineTone(row.sales_line)}>{row.sales_line_label}</Badge>
          </td>
          <td className="ltr-iso px-3 py-2.5 tabular">{row.source_id}</td>
          <td className="px-3 py-2.5 text-muted">{row.status_label}</td>
          <td className="px-3 py-2.5 tabular">{formatToman(row.discount_amount)}</td>
        </TableRow>
      ))}
    </Table>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-l border-line px-6 py-5">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="mt-2 tabular text-[20px] font-medium tracking-tight text-ink md:text-[22px]">{value}</div>
    </div>
  );
}

function IdentityFact({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-faint">{label}</div>
      <div className={`mt-1 text-ink ${ltr ? "ltr-iso tabular" : ""}`}>{value}</div>
    </div>
  );
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-3.5 text-sm last:border-b-0">
      <span className="text-muted">{label}</span>
      <span className={ltr ? "ltr-iso tabular" : "text-left"}>{value}</span>
    </div>
  );
}
