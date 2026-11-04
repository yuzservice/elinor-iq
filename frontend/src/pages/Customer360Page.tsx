import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Pagination } from "../components/ui";
import { EmptyState, ErrorState, Skeleton } from "../components/Table";
import { amountText, compactAmount, daysAgo, phoneGroups, tierCompareText } from "../features/customers/customer360Display";
import { channelCell, daysSince, tierColors } from "../features/customers/customerListUrl";
import { InternalAccountBanner, InternalAccountMenu } from "../features/customers/InternalAccountPanel";
import { CustomerCallBadges, CustomerCallsTab, TagPill } from "../features/calls/CustomerCalls";
import { dueLabel } from "../features/calls/callForm";
import { Chip } from "../features/calls/ui";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../hooks/useAuth";
import { customerDisplayName } from "../lib/customerDisplay";
import { formatJalali, toFaDigits } from "../lib/dates";
import { formatDate, formatNumber, formatToman } from "../lib/format";
import { callsService } from "../services/calls";
import { customersService } from "../services/customers";
import type { Customer360, CustomerProductHistory, CustomerPurchase, TimelineEvent, TimelineKind } from "../types";

// Layout and copy: docs/design/customer-360-prototype.html. Rules: docs/business-rules/customer-360.md.

type TabKey = "activity" | "invoices" | "items" | "calls" | "profile";

const CARD = "rounded-[18px] border border-line bg-surface";
const MUT = "text-[12.5px] text-muted";
const GHOST = "inline-flex min-h-[38px] cursor-pointer items-center rounded-[10px] border border-slate-300 bg-transparent px-[13px] text-[12.5px] text-slate-600 dark:border-white/[0.14] dark:text-slate-300";
const UP = "text-[var(--delta-up)]";
const DOWN = "text-[var(--delta-down)]";
const WARN = "text-amber-700 dark:text-amber-400";
const INFO = "text-blue-600 dark:text-blue-300";

export function Customer360Page() {
  const { id } = useParams();
  return <Customer360View key={id} sourceId={Number(id)} />;
}

function Customer360View({ sourceId }: { sourceId: number }) {
  const { user } = useAuth();
  const canManage = Boolean(user?.can_manage_platform);
  const isAgent = user?.role === "sales_agent";
  const [tab, setTab] = useState<TabKey>("activity");
  const [opened, setOpened] = useState<Set<TabKey>>(() => new Set(["activity"]));
  const [productCount, setProductCount] = useState<number | null>(null);
  const [callsReload, setCallsReload] = useState(0);
  const { data, loading, error, setData } = useApi(() => customersService.detail(sourceId), [sourceId]);
  const { data: calls } = useApi(() => callsService.customerCalls(sourceId), [sourceId, callsReload]);
  const reloadDetail = () => {
    customersService.detail(sourceId).then(setData).catch(() => undefined);
  };
  const pick = (key: TabKey) => {
    setTab(key);
    setOpened((current) => new Set(current).add(key));
  };

  if (loading) {
    return (
      <div className="space-y-3.5">
        <Skeleton className="h-10 w-52 rounded-xl" />
        <Skeleton className="h-32 w-full rounded-[18px]" />
        <Skeleton className="h-28 w-full rounded-[18px]" />
        <Skeleton className="h-80 w-full rounded-[18px]" />
      </div>
    );
  }
  if (error || !data) return <ErrorState />;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "activity", label: "فعالیت‌ها" },
    { key: "invoices", label: `فاکتورها (${formatNumber(data.purchases.total)})` },
    { key: "items", label: productCount === null ? "کالاها" : `کالاها (${formatNumber(productCount)})` },
    { key: "calls", label: calls?.stats ? `تماس‌ها (${formatNumber(calls.stats.total)})` : "تماس‌ها" },
    { key: "profile", label: "مشخصات" },
  ];
  // Mounted on first open and kept, so switching back does not refetch.
  const panel = (key: TabKey, node: ReactNode) => (opened.has(key) ? <div hidden={tab !== key}>{node}</div> : null);

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <Link to="/customers?tab=list" className={GHOST}>
          بازگشت به لیست مشتریان
        </Link>
        {canManage ? <InternalAccountMenu data={data} onChanged={reloadDetail} /> : null}
      </div>
      {canManage ? <InternalAccountBanner data={data} onChanged={reloadDetail} /> : null}

      <Header data={data} calls={calls} onCallsChanged={() => setCallsReload((value) => value + 1)} />
      <ValueCards data={data} />
      <TasteRow data={data} />

      <nav aria-label="بخش‌های صفحه مشتری" className="mt-1.5 flex flex-wrap items-center gap-x-[22px] border-b border-line">
        {tabs.map((item) => {
          const on = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={on}
              onClick={() => pick(item.key)}
              className={`-mb-px min-h-[44px] cursor-pointer border-b-2 bg-transparent px-0.5 text-sm ${
                on ? "border-blue-500 font-semibold text-ink dark:border-blue-400" : "border-transparent text-muted"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {panel("activity", <ActivityTab sourceId={sourceId} />)}
      {panel("invoices", <InvoicesTab sourceId={sourceId} first={data.purchases} />)}
      {panel("items", <ItemsTab sourceId={sourceId} onCount={setProductCount} />)}
      {panel("calls", <CustomerCallsTab sourceId={sourceId} />)}
      {panel("profile", <ProfileTab data={data} isAgent={isAgent} />)}
    </div>
  );
}

// --- Header ----------------------------------------------------------------------------------

function TierBadge({ data }: { data: Customer360 }) {
  if (data.is_operator) {
    return <span className="rounded-full bg-amber-500/15 px-[11px] py-[3px] text-[12.5px] text-amber-700 dark:text-amber-400">{data.operator_label || "اپراتور"}</span>;
  }
  if (!data.tier_code) return null;
  const [dark, light] = tierColors(data.tier_code);
  const style = { "--tier-dark": dark, "--tier-light": light, "--tier-dark-bg": `${dark}26`, "--tier-light-bg": `${light}1a` } as CSSProperties;
  return (
    <span style={style} className="rounded-full bg-[var(--tier-light-bg)] px-[11px] py-[3px] text-[12.5px] text-[var(--tier-light)] dark:bg-[var(--tier-dark-bg)] dark:text-[var(--tier-dark)]">
      {data.tier_label}
      {data.tier_channel_label ? ` (${data.tier_channel_label})` : ""}
    </span>
  );
}

function Header({ data, calls, onCallsChanged }: { data: Customer360; calls: Awaited<ReturnType<typeof callsService.customerCalls>> | null; onCallsChanged: () => void }) {
  const [copied, setCopied] = useState(false);
  const display = customerDisplayName(data);
  const channel = channelCell(data.channel, []);
  const { tags, followup_at, last_call } = data.calls_header;
  const copy = () => {
    navigator.clipboard?.writeText(data.mobile).then(() => setCopied(true), () => undefined);
  };
  const hasBadges = tags.length > 0 || followup_at || calls?.status?.do_not_call || calls?.status?.dnc_cleared_at;
  return (
    <section className={`${CARD} flex flex-wrap items-center justify-between gap-x-6 gap-y-3.5 px-5 py-[18px]`}>
      <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="m-0 text-[22px] font-extrabold text-ink">{display.name}</h1>
          <TierBadge data={data} />
          {channel.color ? (
            <span className="rounded-full px-[11px] py-[3px] text-[12.5px]" style={{ background: `color-mix(in srgb, ${channel.color} 16%, transparent)`, color: channel.color }}>
              {channel.text}
            </span>
          ) : null}
        </div>
        {hasBadges ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <TagPill key={tag.id} tag={tag} />
            ))}
            {followup_at ? <span className={`rounded-full border border-blue-500/50 px-2.5 py-[3px] text-xs ${INFO}`}>پیگیری باز: {dueLabel(followup_at).text}</span> : null}
            <CustomerCallBadges sourceId={data.id} status={calls?.status ?? null} onChanged={onCallsChanged} />
          </div>
        ) : null}
        {last_call ? (
          <span className={MUT}>
            آخرین تماس: {last_call.outcome_title}، {daysAgo(daysSince(last_call.at))}، {last_call.agent}
          </span>
        ) : null}
      </div>
      {data.mobile ? (
        <div className="flex flex-wrap items-center gap-2">
          <a href={`tel:${data.mobile}`} dir="ltr" className="inline-flex min-h-[46px] items-center rounded-xl bg-blue-500 px-[18px] text-[15px] font-semibold text-white no-underline">
            {phoneGroups(data.mobile)}
          </a>
          <button type="button" className={`${GHOST} min-h-[46px]`} onClick={copy}>
            {copied ? "کپی شد" : "کپی شماره"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

// --- Value cards and taste ---------------------------------------------------------------------

function Kpi({ label, amount, unit, note, noteClass = "text-muted" }: { label: string; amount: string; unit: string; note?: string | null; noteClass?: string }) {
  return (
    <div className={`${CARD} flex flex-col gap-[5px] px-[18px] py-[15px]`}>
      <span className="text-[13px] text-slate-600 dark:text-slate-300">{label}</span>
      <span className="flex items-baseline gap-[5px]">
        <span className="text-[26px] font-extrabold tracking-[-0.5px] tabular">{amount}</span>
        {unit ? <span className={MUT}>{unit}</span> : null}
      </span>
      {note ? <span className={`text-[12.5px] ${noteClass}`}>{note}</span> : null}
    </div>
  );
}

const SIGN_CLASS = (sign: number) => (sign > 0 ? UP : sign < 0 ? DOWN : "text-muted");

function ValueCards({ data }: { data: Customer360 }) {
  const value = data.value;
  const total = compactAmount(value.total_amount);
  const basket = compactAmount(value.avg_basket);
  const tier = value.comparison?.tier_label ?? "";
  const totalNote = value.comparison ? tierCompareText(value.comparison.total_percent, tier) : null;
  const basketNote = value.comparison ? tierCompareText(value.comparison.basket_percent, tier) : null;
  return (
    <section aria-label="ارزش مشتری" className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
      <Kpi label="مجموع خرید" amount={total.value} unit={total.unit ? `${total.unit} تومان` : "تومان"} note={totalNote?.text} noteClass={SIGN_CLASS(totalNote?.sign ?? 0)} />
      <Kpi label="میانگین سبد خرید" amount={basket.value} unit={basket.value === "—" ? "" : basket.unit ? `${basket.unit} تومان` : "تومان"} note={basketNote?.text} noteClass={SIGN_CLASS(basketNote?.sign ?? 0)} />
      <Kpi label="تعداد فاکتور" amount={formatNumber(value.invoice_count)} unit="فاکتور" note={`${formatNumber(value.pos_count)} حضوری، ${formatNumber(value.online_count)} آنلاین`} />
      <Kpi
        label="آخرین خرید"
        amount={value.days_since_last == null ? "—" : formatNumber(value.days_since_last)}
        unit={value.days_since_last == null ? "" : "روز پیش"}
        note={value.usual_gap_days == null ? null : `معمولاً هر ${formatNumber(value.usual_gap_days)} روز خرید می‌کند`}
        noteClass={value.overdue ? WARN : "text-muted"}
      />
    </section>
  );
}

function TasteRow({ data }: { data: Customer360 }) {
  const taste = data.taste;
  const items: [string, string | null][] = [
    ["دسته محبوب", taste.category],
    ["سایز", taste.size],
    ["رنگ", taste.color],
    ["شعبه", taste.branch],
    ["پرداخت", taste.payment],
    ["خرید با تخفیف", taste.discount_percent == null ? null : `${formatNumber(taste.discount_percent)}٪`],
  ];
  return (
    <section aria-label="سلیقه مشتری" className={`${CARD} grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-x-[18px] gap-y-3 px-[18px] py-3.5`}>
      {items.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-[3px]">
          <span className={MUT}>{label}</span>
          <span className="text-sm font-semibold">{value || "—"}</span>
        </div>
      ))}
    </section>
  );
}

// --- Activity --------------------------------------------------------------------------------

const DOTS = { invoice: "#34d399", call: "#60a5fa", tier: "#fbbf24", discount: "#c084fc" } as const;
const FILTERS: [TimelineKind, string][] = [
  ["all", "همه"],
  ["invoice", "فاکتور"],
  ["call", "تماس"],
  ["tier", "سطح"],
  ["discount", "تخفیف"],
];
const TIER_REASONS: Record<string, string> = {
  daily: "به‌روزرسانی روزانه",
  activation: "فعال‌سازی قوانین جدید",
  manual: "تغییر دستی",
  sync: "همگام‌سازی",
  baseline: "سطح‌بندی اولیه",
};

type ActivityRow = { key: string; dot: keyof typeof DOTS; title: string; detail: string; at: string };

function invoicePlace(event: Extract<TimelineEvent, { type: "invoice" }>) {
  return event.channel === "online" ? "آنلاین" : `فروشگاه ${event.branch}`;
}

/** One timeline event as rows; an invoice with a discount also gets its own discount row. */
export function activityRows(event: TimelineEvent, kind: TimelineKind): ActivityRow[] {
  if (event.type === "call") {
    const call = event.call;
    return [{ key: `call-${call.id}`, dot: "call", title: `تماس: ${call.outcome_title}`, detail: [call.agent, call.connected ? call.note : ""].filter(Boolean).join(". "), at: event.at }];
  }
  if (event.type === "tier") {
    const title = event.to ? `تغییر سطح به ${event.to}` : `خروج از سطح ${event.from ?? ""}`;
    const reason = TIER_REASONS[event.reason] ?? event.reason;
    const detail = [event.from && event.to ? `از ${event.from}` : "", reason ? `با ${reason}` : ""].filter(Boolean).join(" ");
    return [{ key: `tier-${event.at}`, dot: "tier", title, detail: detail ? `${detail}.` : "", at: event.at }];
  }
  const key = `${event.channel}-${event.source_id}`;
  const place = invoicePlace(event);
  const rows: ActivityRow[] = [];
  if (kind !== "discount") {
    const status = event.status === "refund" ? " (مرجوعی)" : event.qualifying ? "" : " (لغوشده)";
    const products = [...new Set(event.products)];
    const lines = event.products.length ? `${formatNumber(event.products.length)} قلم: ${products.join("، ")}.` : "";
    const payment = event.payment ? `پرداخت با ${event.payment}.` : "";
    rows.push({ key, dot: "invoice", title: `فاکتور ${place}، ${amountText(event.amount)}${status}`, detail: [lines, payment].filter(Boolean).join(" "), at: event.at });
  }
  if (event.discount_amount > 0 && kind !== "invoice") {
    rows.push({ key: `${key}-discount`, dot: "discount", title: `استفاده از تخفیف ${amountText(event.discount_amount)}`, detail: `روی فاکتور ${place} ${amountText(event.amount)}ی.`, at: event.at });
  }
  return rows;
}

function ActivityTab({ sourceId }: { sourceId: number }) {
  const [kind, setKind] = useState<TimelineKind>("all");
  const [page, setPage] = useState(1);
  const { data, loading, error } = useApi(() => customersService.timeline(sourceId, kind, page), [sourceId, kind, page]);
  const rows = data ? data.results.flatMap((event) => activityRows(event, kind)) : [];
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map(([key, label]) => (
          <Chip
            key={key}
            on={kind === key}
            onClick={() => {
              setKind(key);
              setPage(1);
            }}
          >
            {label}
          </Chip>
        ))}
      </div>
      {error ? (
        <ErrorState />
      ) : loading && !data ? (
        <Skeleton className="h-64 rounded-[18px]" />
      ) : !rows.length ? (
        <p className={MUT}>رویدادی ثبت نشده است.</p>
      ) : (
        <div className={`${CARD} flex flex-col px-[18px] py-2`}>
          {rows.map((row) => (
            <div key={row.key} className="grid grid-cols-[14px_minmax(0,1fr)_auto] gap-3 border-b border-black/[0.06] py-3 last:border-b-0 dark:border-white/[0.05]">
              <span className="mt-1.5 h-[9px] w-[9px] rounded-full" style={{ background: DOTS[row.dot] }} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13.5px] font-semibold">{row.title}</span>
                {row.detail ? <span className={`${MUT} leading-[1.7]`}>{row.detail}</span> : null}
              </div>
              <span className={`${MUT} whitespace-nowrap`}>{daysAgo(daysSince(row.at))}</span>
            </div>
          ))}
        </div>
      )}
      {data ? <Pagination page={page} total={data.total} perPage={data.per_page} onChange={setPage} /> : null}
    </section>
  );
}

// --- Invoices --------------------------------------------------------------------------------

function InvoicesTab({ sourceId, first }: { sourceId: number; first: Customer360["purchases"] }) {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const { data, loading } = useApi(() => (page === 1 ? Promise.resolve(first) : customersService.purchases(sourceId, page)), [sourceId, page, first]);
  const purchases = data ?? first;
  if (!purchases.total) return <EmptyState title="خریدی برای این مشتری ثبت نشده است." body="ثبت‌نام به‌معنای خرید نیست." />;
  return (
    <section className="flex flex-col">
      <div className={`${CARD} overflow-x-auto px-2.5 py-1`}>
        <table className={`w-full min-w-[640px] border-collapse text-[13px] ${loading ? "opacity-60" : ""}`}>
          <thead>
            <tr>
              {["شماره", "تاریخ", "کانال", "پرداخت", "اقلام", "مبلغ", "وضعیت"].map((column) => (
                <th key={column} scope="col" className="whitespace-nowrap px-2.5 py-2 text-right font-medium text-muted">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {purchases.results.map((row) => {
              const expanded = open === row.key;
              const warn = row.is_cancelled || (row.kind === "pos" && row.type !== "sell");
              return (
                <Fragment key={row.key}>
                  <tr className="cursor-pointer border-t border-black/[0.06] hover:bg-hover dark:border-white/[0.06]" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : row.key)}>
                    <td className="whitespace-nowrap p-2.5 font-semibold" dir="ltr" style={{ textAlign: "right" }}>
                      {toFaDigits(`${row.kind === "pos" ? "P" : "O"}-${row.source_id}`)}
                    </td>
                    <td className="whitespace-nowrap p-2.5">{formatDate(row.created_at)}</td>
                    <td className="whitespace-nowrap p-2.5">{row.kind === "online" ? "آنلاین" : `فروشگاه ${row.sales_line_label}`}</td>
                    <td className={`whitespace-nowrap p-2.5 ${MUT}`}>{row.payment ?? "—"}</td>
                    <td className="whitespace-nowrap p-2.5">{formatNumber(row.item_count)}</td>
                    <td className="whitespace-nowrap p-2.5 font-semibold">{amountText(row.amount, false)}</td>
                    <td className={`whitespace-nowrap p-2.5 ${warn ? WARN : UP}`}>{row.status_label}</td>
                  </tr>
                  {expanded ? (
                    <tr>
                      <td colSpan={7} className="px-2.5 pb-3">
                        <PurchaseDetail purchase={row} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={purchases.page} total={purchases.total} perPage={purchases.per_page} onChange={setPage} />
    </section>
  );
}

function PurchaseDetail({ purchase }: { purchase: CustomerPurchase }) {
  if (!purchase.items.length) return <div className={MUT}>اقلامی برای این سابقه ثبت نشده است.</div>;
  return (
    <div className="rounded-xl border border-line bg-elevated p-3">
      {purchase.discount_amount > 0 ? <div className={`mb-2 text-xs ${UP}`}>تخفیف فاکتور: {formatToman(purchase.discount_amount)}</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] text-xs">
          <thead>
            <tr className="border-b border-line text-right text-[11px] text-muted">
              {["محصول", "تنوع", "تعداد", "رنگ", "سایز", "مبلغ قلم", "تخفیف قلم"].map((column) => (
                <th key={column} className="px-2 py-2 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.06] dark:divide-white/[0.06]">
            {purchase.items.map((item) => (
              <tr key={item.id}>
                <td className="px-2 py-2 font-semibold text-ink">
                  {item.product}
                  {item.type_label ? <div className="mt-0.5 text-[10px] text-muted">{item.type_label}</div> : null}
                </td>
                <td className="px-2 py-2 text-muted">{item.variant || "—"}</td>
                <td className="px-2 py-2 tabular">{formatNumber(item.quantity)}</td>
                <td className="px-2 py-2 text-muted">{item.color || "—"}</td>
                <td className="px-2 py-2 text-muted">{item.size || "—"}</td>
                <td className="px-2 py-2 tabular">{formatToman(item.amount)}</td>
                <td className="px-2 py-2 tabular text-muted">{item.discount_amount ? formatToman(item.discount_amount) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Items -----------------------------------------------------------------------------------

function ItemsTab({ sourceId, onCount }: { sourceId: number; onCount: (count: number) => void }) {
  const [retry, setRetry] = useState(0);
  const { data, loading, error } = useApi(() => customersService.products(sourceId), [sourceId, retry]);
  useEffect(() => {
    if (data) onCount(data.results.length);
  }, [data, onCount]);
  if (error) return <ErrorState onRetry={() => setRetry((value) => value + 1)} />;
  if (loading || !data) return <Skeleton className="h-48 rounded-[18px]" />;
  if (!data.results.length) return <EmptyState title="محصول خریداری‌شده‌ای برای این مشتری نیست." />;
  return (
    <section className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5">
      {data.results.map((row: CustomerProductHistory) => {
        const facts = [row.sizes.length ? `سایز ${row.sizes.join("، ")}` : "", row.colors.join("، ")].filter(Boolean).join("، ");
        return (
          <div key={`${row.product}-${row.last_purchase_at}`} className={`${CARD} flex flex-col gap-1 px-[15px] py-[13px]`}>
            <span className="text-[13.5px] font-semibold">{row.product}</span>
            <span className={MUT}>{facts || "—"}</span>
            <span className={MUT}>
              {formatNumber(row.purchase_count)} بار خرید، آخرین: {daysAgo(daysSince(row.last_purchase_at))}
            </span>
          </div>
        );
      })}
    </section>
  );
}

// --- Profile ---------------------------------------------------------------------------------

function ProfileCard({ title, rows }: { title: string; rows: [string, string, boolean?][] }) {
  return (
    <div className={`${CARD} flex flex-col gap-[9px] px-[18px] py-4`}>
      <h2 className="m-0 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h2>
      {rows.map(([label, value, ltr]) => (
        <div key={label} className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
          <span className={MUT}>{label}</span>
          <span dir={ltr ? "ltr" : undefined}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function ProfileTab({ data, isAgent }: { data: Customer360; isAgent: boolean }) {
  const display = customerDisplayName(data);
  const identity: [string, string, boolean?][] = [
    ["نام", display.name],
    ["موبایل", data.mobile ? phoneGroups(data.mobile) : "—", true],
    ["زادروز", data.profile.birth_date ? formatJalali(data.profile.birth_date) : "—"],
    ["جنسیت", data.profile.gender_label || "—"],
  ];
  if (!isAgent) {
    identity.push(["ایمیل", data.email || "—", true], ["کد ملی", data.profile.national_code ? toFaDigits(data.profile.national_code) : "—", true]);
  }
  const city = data.addresses.find((row) => row.city)?.city;
  const addresses: [string, string][] = isAgent
    ? [
        ["شهر", city || "—"],
        ["نشانی کامل", "فقط برای مدیر"],
      ]
    : data.addresses.map((row, index) => [row.city || row.province || `نشانی ${formatNumber(index + 1)}`, row.address || "—"]);
  const last = data.discounts[0];
  const discounts: [string, string][] = [
    ["خرید با تخفیف", data.taste.discount_percent == null ? "—" : `${formatNumber(data.taste.discount_percent)}٪ از فاکتورها`],
    ["آخرین تخفیف", last ? `${amountText(last.discount_amount)}، ${daysAgo(daysSince(last.created_at))}` : "—"],
    ["مجموع تخفیف", amountText(data.discounts.reduce((sum, row) => sum + (row.discount_amount || 0), 0))],
  ];
  return (
    <section className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3">
      <ProfileCard title="هویت" rows={identity} />
      <ProfileCard title={isAgent ? "نشانی‌ها" : `نشانی‌ها (${formatNumber(data.addresses.length)})`} rows={addresses.length ? addresses : [["نشانی", "—"]]} />
      <ProfileCard title={`تخفیف‌ها (${formatNumber(data.discounts.length)})`} rows={discounts} />
    </section>
  );
}
