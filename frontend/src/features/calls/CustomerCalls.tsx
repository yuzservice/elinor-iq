import { useState } from "react";
import { Pagination } from "../../components/ui";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../hooks/useAuth";
import { formatJalali, formatJalaliDateTime } from "../../lib/dates";
import { formatNumber } from "../../lib/format";
import { amountText, daysAgo } from "../customers/customer360Display";
import { daysSince } from "../customers/customerListUrl";
import { ApiError } from "../../services/api";
import { callsService } from "../../services/calls";
import { answerValue, dueLabel, rawAnswers } from "./callForm";
import type { CallCard, CustomerCalls } from "./types";
import { CARD, Ghost, INPUT, MUTED } from "./ui";

const CLEAR_CONFIRM =
  "این مشتری دوباره می‌تواند در برنامه‌های تماس بیاید. کارهای لغوشده برنمی‌گردند: برنامه‌های پویا در اجرای روزانه بعدی مشتری را برمی‌دارند، لیست‌های ثابت نه. ادامه می‌دهید؟";

/** «تماس نگیرید» badge and the manager clear action, inline in the Customer 360 header row. */
export function CustomerCallBadges({ sourceId, status, onChanged }: { sourceId: number; status: CustomerCalls["status"]; onChanged: () => void }) {
  const { user } = useAuth();
  const [clearing, setClearing] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  if (!status || (!status.do_not_call && !status.dnc_cleared_at)) return null;

  const clear = async () => {
    if (!window.confirm(CLEAR_CONFIRM)) return;
    setMessage("");
    try {
      await callsService.clearDnc(sourceId, reason.trim());
      setClearing(false);
      setReason("");
      onChanged();
    } catch (error) {
      setMessage(error instanceof ApiError && error.message ? error.message : "انجام نشد.");
    }
  };

  return (
    <>
      {status.do_not_call ? <span className="rounded-full bg-[var(--delta-down-bg)] px-2.5 py-[3px] text-xs font-bold text-[var(--delta-down)]">تماس نگیرید</span> : null}
      {status.do_not_call && user?.can_manage_calls && !clearing ? <Ghost className="min-h-[30px]" onClick={() => setClearing(true)}>برداشتن تماس نگیرید</Ghost> : null}
      {!status.do_not_call && status.dnc_cleared_at ? (
        <span className={MUTED}>
          «تماس نگیرید» را {status.dnc_cleared_by ?? "—"} در {formatJalaliDateTime(status.dnc_cleared_at)} برداشت: {status.dnc_clear_reason}
        </span>
      ) : null}
      {clearing ? (
        <div className="flex basis-full flex-wrap items-center gap-2 text-xs">
          <input className={`${INPUT} max-w-[320px]`} aria-label="دلیل برداشتن تماس نگیرید" placeholder="دلیل" value={reason} onChange={(event) => setReason(event.target.value)} />
          <Ghost disabled={!reason.trim()} onClick={clear}>ثبت</Ghost>
          <Ghost onClick={() => setClearing(false)}>انصراف</Ghost>
          {message ? <span className="text-rose-600 dark:text-rose-400">{message}</span> : null}
        </div>
      ) : null}
    </>
  );
}

const STAT_VALUE = "text-xl font-extrabold tabular";

export function CustomerCallsTab({ sourceId }: { sourceId: number }) {
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const { data, loading, error } = useApi(() => callsService.customerCalls(sourceId, page), [sourceId, page, reload]);
  if (loading && !data) return <p className={MUTED}>در حال دریافت اطلاعات...</p>;
  if (error || !data) return <p className={MUTED}>تماس‌ها بارگذاری نشد.</p>;
  if (!data.results.length) return <p className={MUTED}>تماسی ثبت نشده است.</p>;
  const { stats } = data;
  return (
    <section className="flex flex-col gap-3">
      <div className={`${CARD} grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-[18px] gap-y-3 px-[18px] py-3.5`}>
        <Stat label="تماس‌ها" value={formatNumber(stats.total)} />
        <Stat label="پاسخ‌داده" value={`${formatNumber(stats.connected)} از ${formatNumber(stats.total)}`} />
        <Stat label="خرید بعد از تماس" value={stats.purchase_amount ? amountText(stats.purchase_amount, false) : "—"} className="text-[var(--delta-up)]" />
        <Stat label="پیگیری بعدی" value={stats.next_followup_at ? formatJalali(stats.next_followup_at) : "—"} className="text-blue-600 dark:text-blue-300" />
      </div>
      {data.results.map((log) => (
        <CallCardView key={log.id} log={log} onChanged={() => setReload((value) => value + 1)} />
      ))}
      <Pagination page={page} total={data.total} perPage={data.per_page} onChange={setPage} />
    </section>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className={MUTED}>{label}</span>
      <span className={`${STAT_VALUE} ${className}`}>{value}</span>
    </div>
  );
}

function CallCardView({ log, onChanged }: { log: CallCard; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(log.note);
  const [message, setMessage] = useState("");
  const answers = Object.entries(log.answers);
  const footer: { text: string; className: string }[] = [];
  if (log.followup_at) footer.push({ text: `پیگیری باز: ${dueLabel(log.followup_at).text}`, className: "text-blue-600 dark:text-blue-300" });
  if (log.purchase) {
    footer.push({
      text: `خرید بعد از تماس: ${amountText(log.purchase.amount)}، ${log.purchase.days_after ? `${formatNumber(log.purchase.days_after)} روز بعد` : "همان روز"}`,
      className: "font-semibold text-[var(--delta-up)]",
    });
  } else if (log.connected) {
    footer.push({ text: "هنوز خریدی بعد از این تماس ثبت نشده", className: "text-muted" });
  }
  if (log.attempt) footer.push({ text: `تلاش ${formatNumber(log.attempt.n)} از ${formatNumber(log.attempt.of)}`, className: "text-muted" });

  const save = async () => {
    setMessage("");
    try {
      await callsService.editLog(log.id, { answers: rawAnswers(log.answers), note });
      setEditing(false);
      onChanged();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "ثبت نشد.");
    }
  };

  return (
    <article className={`${CARD} flex flex-col gap-3 rounded-[18px] px-[18px] py-3.5`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3.5 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-[11px] py-[3px] text-[12.5px] font-semibold ${
              log.connected ? "bg-[var(--delta-up-bg)] text-[var(--delta-up)]" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
            }`}
          >
            {log.outcome_title}
          </span>
          {log.tags.map((tag) => (
            <TagPill key={tag.title} tag={tag} small />
          ))}
        </div>
        <span className={MUTED}>
          {log.agent}، {log.program}، {daysAgo(daysSince(log.created_at))}
        </span>
      </div>
      {log.connected && answers.length ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-x-[18px] gap-y-2.5">
          {answers.map(([id, entry]) => (
            <div key={id} className="flex flex-col gap-0.5">
              <span className={MUTED}>{entry.title}</span>
              <span className="text-[13.5px] font-semibold">{answerValue(entry)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {log.connected && log.note && !editing ? <p className="m-0 rounded-[10px] bg-elevated px-3 py-[9px] text-[13px] leading-[1.8] text-slate-600 dark:text-slate-300">{log.note}</p> : null}
      {editing ? (
        <div className="flex flex-col gap-1.5">
          <textarea className={`${INPUT} pt-2`} rows={2} aria-label="ویرایش یادداشت" value={note} onChange={(event) => setNote(event.target.value)} />
          <div className="flex gap-1.5">
            <Ghost onClick={save}>ذخیره</Ghost>
            <Ghost onClick={() => setEditing(false)}>انصراف</Ghost>
          </div>
          {message ? <span className="text-xs text-rose-600 dark:text-rose-400">{message}</span> : null}
        </div>
      ) : null}
      {footer.length || (log.editable && !editing) ? (
        <div className="flex flex-wrap items-center gap-x-[18px] gap-y-1.5 border-t border-line pt-2.5 text-[12.5px]">
          {footer.map((item) => (
            <span key={item.text} className={item.className}>
              {item.text}
            </span>
          ))}
          {log.editable && !editing ? (
            <Ghost className="min-h-[30px] ms-auto" onClick={() => setEditing(true)}>
              ویرایش یادداشت
            </Ghost>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/** Call tag pill in the tag's own color. */
export function TagPill({ tag, small = false }: { tag: { title: string; color: string }; small?: boolean }) {
  const color = tag.color || "#34d399";
  return (
    <span
      className={`whitespace-nowrap rounded-full border ${small ? "px-[9px] py-0.5 text-[11.5px]" : "px-2.5 py-[3px] text-xs"}`}
      style={{ borderColor: `${color}80`, color }}
    >
      {tag.title}
    </span>
  );
}
