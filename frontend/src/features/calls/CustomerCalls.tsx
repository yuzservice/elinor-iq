import { useState } from "react";
import { Pagination } from "../../components/ui";
import { useApi } from "../../hooks/useApi";
import { callsService } from "../../services/calls";
import { CallHistoryRow } from "./CallHistory";
import { MUTED } from "./ui";

export function CustomerCallBadges({ sourceId }: { sourceId: number }) {
  const { data } = useApi(() => callsService.customerCalls(sourceId), [sourceId]);
  const status = data?.status;
  if (!status || (!status.do_not_call && !status.last_outcome_title)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {status.do_not_call ? <span className="rounded-full bg-[var(--delta-down-bg)] px-2.5 py-1 font-bold text-[var(--delta-down)]">تماس نگیرید</span> : null}
      {status.last_outcome_title ? <span className="rounded-full border border-line bg-elevated px-2.5 py-1 text-muted">آخرین نتیجه تماس: {status.last_outcome_title}</span> : null}
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
