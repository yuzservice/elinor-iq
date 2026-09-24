import { FormEvent, useState } from "react";
import { Badge, Button, Metric, MetricStrip, PageHeader, Panel, SectionHeader } from "../components/ui";
import { EmptyState, ErrorState, Skeleton, Table, TableRow } from "../components/Table";
import { useApi } from "../hooks/useApi";
import { formatDateTime, formatNumber } from "../lib/format";
import { smartDirectService } from "../services/smartDirect";
import type { SmartDirectDebug } from "../types";

const TODAY_METRICS = [
  { key: "sessions_processed", label: "مکالمات پردازش‌شده" },
  { key: "product_requests", label: "درخواست محصول" },
  { key: "links_sent", label: "لینک خرید ارسال‌شده" },
  { key: "admin_handoffs", label: "ارجاع به ادمین" },
] as const;

function statusTone(status: string): "accent" | "sage" | "warning" | "neutral" {
  if (status === "ACTIVE") return "accent";
  if (status === "LINK_SENT") return "sage";
  if (status === "ADMIN_HANDOFF") return "warning";
  return "neutral";
}

function roleLabel(role: string): string {
  if (role === "customer") return "مشتری";
  if (role === "admin") return "ادمین";
  return role || "—";
}

export function SmartDirectPage() {
  const [tick, setTick] = useState(0);
  const { data, loading, error } = useApi(() => smartDirectService.summary(), [tick]);
  const debug = useApi(() => smartDirectService.debug(), [tick]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-72" />
        <Skeleton className="h-28" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (error || !data) return <ErrorState />;

  const empty = data.recent_outcomes.length === 0;
  const instagram = data.instagram;
  const debugData = debug.data;

  return (
    <div>
      <PageHeader title="دایرکت هوشمند" description="دستیار فروش هوشمند دایرکت الینور" />

      <Panel className="mb-6">
        <SectionHeader title="وضعیت اتصال" hint="آزمایش عملیاتی — بدون آرشیو اینباکس" />
        <div className="divide-y divide-line text-sm">
          {data.connections.map((item) => (
            <StatusRow key={item.key} label={item.label} value={item.state_label} />
          ))}
          <StatusRow label="شناسه حساب" value={instagram.account_id || "—"} ltr={Boolean(instagram.account_id)} />
          <StatusRow label="نسخه API" value={instagram.api_version} ltr />
          <StatusRow label="وضعیت وب‌هوک" value={instagram.webhook.status_label} />
          <StatusRow
            label="آخرین وب‌هوک"
            value={instagram.webhook.last_received_at ? formatDateTime(instagram.webhook.last_received_at) : "—"}
          />
          <StatusRow
            label="آخرین ارسال"
            value={
              !instagram.last_send.at
                ? "هنوز ارسال نشده"
                : instagram.last_send.ok
                  ? "موفق"
                  : instagram.last_send.error || "ناموفق"
            }
          />
        </div>
      </Panel>

      <DebugPanel debug={debugData} onSent={() => setTick((value) => value + 1)} />

      <SectionHeader title="امروز" />
      <MetricStrip>
        {TODAY_METRICS.map((metric) => (
          <Metric key={metric.key} label={metric.label} value={formatNumber(data.today[metric.key])} />
        ))}
      </MetricStrip>

      <div className="mt-8">
        <SectionHeader title="نتایج اخیر" hint="فقط خلاصه نتیجه. متن مکالمه ذخیره نمی‌شود." />
        {empty ? (
          <EmptyState
            title="هنوز نتیجه‌ای ثبت نشده است."
            body="پس از اتصال اینستاگرام، نتایج مکالمات فروش در این بخش نمایش داده می‌شود."
          />
        ) : (
          <Table columns={["زمان", "خلاصه درخواست", "نتیجه", "محصول انتخاب‌شده", "وضعیت"]}>
            {data.recent_outcomes.map((row) => (
              <TableRow key={row.id}>
                <td className="px-3 py-3.5 text-muted">{formatDateTime(row.last_activity_at)}</td>
                <td className="px-3 py-3.5">{row.request_summary || "—"}</td>
                <td className="px-3 py-3.5">{row.outcome_label || "—"}</td>
                <td className="px-3 py-3.5 text-muted">{row.selected_product_label || "—"}</td>
                <td className="px-3 py-3.5">
                  <Badge tone={statusTone(row.status)}>{row.status_label}</Badge>
                </td>
              </TableRow>
            ))}
          </Table>
        )}
      </div>
    </div>
  );
}

function DebugPanel({
  debug,
  onSent,
}: {
  debug: SmartDirectDebug | null;
  onSent: () => void;
}) {
  const session = debug?.debug_session;
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session || !text.trim()) return;
    setPending(true);
    setMessage("");
    try {
      await smartDirectService.reply(session.id, text.trim());
      setText("");
      setMessage("پاسخ آزمایشی ارسال شد.");
      onSent();
    } catch {
      setMessage("ارسال پاسخ ناموفق بود.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel className="mb-8">
      <SectionHeader title="نمای موقت عملیاتی" hint="فقط برای آزمایش اتصال. آرشیو مکالمه نیست." />
      {!session ? (
        <p className="text-sm leading-7 text-muted">
          پس از دریافت اولین پیام مشتری، زمینه موقت و جعبه پاسخ آزمایشی اینجا نمایش داده می‌شود.
        </p>
      ) : (
        <div className="space-y-5">
          <p className="text-xs leading-6 text-faint">
            گفتگوی فعال {session.id} — این متن‌ها فقط تا {formatDateTime(session.expires_at)} نگه داشته می‌شوند.
          </p>
          <div className="space-y-1 text-sm leading-7">
            {(session.recent_messages || []).map((item, index) => (
              <div key={`${item.at || "msg"}-${index}`}>
                <span className="text-faint">{roleLabel(item.role)}: </span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
          <form onSubmit={onSubmit} className="space-y-3">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="پاسخ آزمایشی دستی"
              rows={3}
              disabled={!session.can_reply || pending}
              className="w-full rounded-xl border border-line bg-elevated px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent/40"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={!session.can_reply || pending || !text.trim()}>
                {pending ? "در حال ارسال..." : "ارسال پاسخ آزمایشی"}
              </Button>
              {message ? <span className="text-sm text-muted">{message}</span> : null}
            </div>
          </form>
        </div>
      )}
    </Panel>
  );
}

function StatusRow({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-muted">{label}</span>
      <span className={ltr ? "ltr-iso" : ""}>{value}</span>
    </div>
  );
}
