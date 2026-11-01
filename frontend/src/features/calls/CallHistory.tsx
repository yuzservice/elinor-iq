import { useState } from "react";
import { formatJalaliDateTime } from "../../lib/dates";
import { ApiError } from "../../services/api";
import { callsService } from "../../services/calls";
import { answerSummary, rawAnswers } from "./callForm";
import type { CallLogRow } from "./types";
import { Ghost, INPUT, MUTED } from "./ui";

export function CallHistoryRow({ log, onChanged }: { log: CallLogRow; onChanged?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(log.note);
  const [message, setMessage] = useState("");
  const summary = answerSummary(log.answers);
  const detail = [summary, log.note].filter(Boolean).join("؛ ");

  const save = async () => {
    setMessage("");
    try {
      await callsService.editLog(log.id, { answers: rawAnswers(log.answers), note });
      setEditing(false);
      onChanged?.();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "ثبت نشد.");
    }
  };

  return (
    <div className="flex flex-col text-[12.5px] leading-[1.8]">
      <span className="text-slate-700 dark:text-slate-200">
        {formatJalaliDateTime(log.created_at)}، {log.agent}، {log.outcome_title} ({log.program})
      </span>
      {detail ? <span className={MUTED}>{detail}</span> : null}
      {log.editable && !editing ? (
        <Ghost className="mt-1 min-h-[30px] self-start" onClick={() => setEditing(true)}>
          ویرایش یادداشت
        </Ghost>
      ) : null}
      {editing ? (
        <div className="mt-1 flex flex-col gap-1.5">
          <textarea className={`${INPUT} pt-2`} rows={2} aria-label="ویرایش یادداشت" value={note} onChange={(event) => setNote(event.target.value)} />
          <div className="flex gap-1.5">
            <Ghost onClick={save}>ذخیره</Ghost>
            <Ghost onClick={() => setEditing(false)}>انصراف</Ghost>
          </div>
          {message ? <span className="text-rose-600 dark:text-rose-400">{message}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
