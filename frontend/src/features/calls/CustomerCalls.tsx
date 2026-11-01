import { useState } from "react";
import { Pagination } from "../../components/ui";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../hooks/useAuth";
import { formatJalaliDateTime } from "../../lib/dates";
import { ApiError } from "../../services/api";
import { callsService } from "../../services/calls";
import { CallHistoryRow } from "./CallHistory";
import { Ghost, INPUT, MUTED } from "./ui";

const CLEAR_CONFIRM =
  "این مشتری دوباره می‌تواند در برنامه‌های تماس بیاید. کارهای لغوشده برنمی‌گردند: برنامه‌های پویا در اجرای روزانه بعدی مشتری را برمی‌دارند، لیست‌های ثابت نه. ادامه می‌دهید؟";

export function CustomerCallBadges({ sourceId }: { sourceId: number }) {
  const { user } = useAuth();
  const [reload, setReload] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const { data } = useApi(() => callsService.customerCalls(sourceId), [sourceId, reload]);
  const status = data?.status;
  if (!status || (!status.do_not_call && !status.last_outcome_title)) return null;

  const clear = async () => {
    if (!window.confirm(CLEAR_CONFIRM)) return;
    setMessage("");
    try {
      await callsService.clearDnc(sourceId, reason.trim());
      setClearing(false);
      setReason("");
      setReload((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof ApiError && error.message ? error.message : "انجام نشد.");
    }
  };

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {status.do_not_call ? <span className="rounded-full bg-[var(--delta-down-bg)] px-2.5 py-1 font-bold text-[var(--delta-down)]">تماس نگیرید</span> : null}
        {status.last_outcome_title ? <span className="rounded-full border border-line bg-elevated px-2.5 py-1 text-muted">آخرین نتیجه تماس: {status.last_outcome_title}</span> : null}
        {status.do_not_call && user?.can_manage_calls && !clearing ? <Ghost onClick={() => setClearing(true)}>برداشتن تماس نگیرید</Ghost> : null}
        {!status.do_not_call && status.dnc_cleared_at ? (
          <span className="text-muted">
            «تماس نگیرید» را {status.dnc_cleared_by ?? "—"} در {formatJalaliDateTime(status.dnc_cleared_at)} برداشت: {status.dnc_clear_reason}
          </span>
        ) : null}
      </div>
      {clearing ? (
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${INPUT} max-w-[320px]`} aria-label="دلیل برداشتن تماس نگیرید" placeholder="دلیل" value={reason} onChange={(event) => setReason(event.target.value)} />
          <Ghost disabled={!reason.trim()} onClick={clear}>ثبت</Ghost>
          <Ghost onClick={() => setClearing(false)}>انصراف</Ghost>
          {message ? <span className="text-rose-600 dark:text-rose-400">{message}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function CustomerCallsTab({ sourceId }: { sourceId: number }) {
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const { data, loading, error } = useApi(() => callsService.customerCalls(sourceId, page), [sourceId, page, reload]);
  if (loading && !data) return <p className={MUTED}>در حال دریافت اطلاعات...</p>;
  if (error || !data) return <p className={MUTED}>تماس‌ها بارگذاری نشد.</p>;
  if (!data.results.length) return <p className={MUTED}>تماسی ثبت نشده است.</p>;
  return (
    <div className="flex flex-col gap-3">
      {data.results.map((log) => (
        <CallHistoryRow key={log.id} log={log} onChanged={() => setReload((value) => value + 1)} />
      ))}
      <Pagination page={page} total={data.total} perPage={data.per_page} onChange={setPage} />
    </div>
  );
}
