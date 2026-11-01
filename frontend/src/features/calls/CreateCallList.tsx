import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatNumber } from "../../lib/format";
import { ApiError } from "../../services/api";
import { callsService } from "../../services/calls";
import { CARD, Chip, Ghost, H, INPUT, MUTED, Primary, SOFT } from "./ui";

const HELP = {
  fixed: "همین مشتری‌های الان. مناسب برنامه‌های یک‌باره.",
  dynamic: "هر روز مشتریان تازه‌ای که این فیلترها را دارند اضافه می‌شوند.",
};

/** Checked rows make a fixed manual list; otherwise the current filters make a fixed or dynamic list. */
export function CreateCallList({ selectedIds, filterParams, total, onClose }: {
  selectedIds: number[];
  filterParams: Record<string, unknown>;
  total: number;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"fixed" | "dynamic">("fixed");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const manual = selectedIds.length > 0;

  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      await callsService.createList(
        manual ? { name: name.trim(), customer_ids: selectedIds } : { name: name.trim(), kind, filter_params: filterParams },
      );
      navigate("/calls");
    } catch (error) {
      setMessage(error instanceof ApiError && error.message ? error.message : "ساخت لیست انجام نشد.");
      setBusy(false);
    }
  };

  return (
    <section className={`${CARD} flex flex-col gap-3 border-blue-400 p-4`}>
      <h2 className={`${H} text-[15px]`}>ساخت لیست تماس</h2>
      <span className={`text-[13px] ${SOFT}`}>
        {manual ? `${formatNumber(selectedIds.length)} مشتری انتخاب‌شده با تیک.` : `${formatNumber(total)} مشتری با فیلترهای فعلی.`}
      </span>
      <label className={`flex flex-col gap-1.5 text-[13px] ${SOFT}`}>
        نام لیست
        <input className={`${INPUT} max-w-[360px]`} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      {manual ? null : (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip on={kind === "fixed"} onClick={() => setKind("fixed")}>ثابت</Chip>
            <Chip on={kind === "dynamic"} onClick={() => setKind("dynamic")}>پویا</Chip>
          </div>
          <span className={MUTED}>{HELP[kind]}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <Primary disabled={!name.trim() || busy} onClick={save}>ذخیره لیست و رفتن به برنامه‌های تماس</Primary>
        <Ghost onClick={onClose}>انصراف</Ghost>
        {message ? <span className="text-[13px] text-rose-600 dark:text-rose-400">{message}</span> : null}
      </div>
    </section>
  );
}
