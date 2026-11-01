import { useEffect, useRef, useState } from "react";
import { Pagination } from "../../components/ui";
import { useApi } from "../../hooks/useApi";
import { formatNumber, formatMobile, formatCompactToman } from "../../lib/format";
import { toFaDigits } from "../../lib/dates";
import { ApiError } from "../../services/api";
import { callsService } from "../../services/calls";
import { CallField } from "./CallFormFields";
import { CallHistoryRow } from "./CallHistory";
import { DNC_CONFIRM, dueLabel, isOneClick, needsDncConfirm, saveCheck } from "./callForm";
import type { Answers, FormOutcome, TaskRow } from "./types";
import { CARD, Chip, Ghost, H, INPUT, MUTED, Primary, UnderlineTab } from "./ui";

const TABS = [
  { key: "open", label: "همه باز" },
  { key: "overdue", label: "عقب‌افتاده" },
  { key: "today", label: "امروز" },
  { key: "future", label: "آینده" },
  { key: "done", label: "انجام‌شده" },
] as const;
const SORTS = [
  { key: "due", label: "موعد" },
  { key: "value", label: "ارزش مشتری" },
  { key: "priority", label: "اولویت" },
];
const PER_PAGE = 20;

function resultMessage(title: string, effect: { result: string; due_at: string | null; followup_at: string | null }) {
  const parts = [`${title} ثبت شد.`];
  if (effect.result === "retry" && effect.due_at) parts.push(`تلاش بعدی: ${dueLabel(effect.due_at).text}.`);
  if (effect.result === "unreachable") parts.push("تلاش‌ها تمام شد و کار با وضعیت «در دسترس نبود» بسته شد.");
  if (effect.result === "dnc") parts.push("مشتری از همه صف‌ها خارج شد.");
  if (effect.followup_at) parts.push("کار پیگیری ساخته شد.");
  return parts.join(" ");
}

export function AgentPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("open");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [program, setProgram] = useState("");
  const [last, setLast] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("due");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [taskId, setTaskId] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const [reload, setReload] = useState(0);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const counts = useApi(() => callsService.counts(), [reload]);
  const tags = useApi(() => callsService.tags(), []);
  const list = useApi(
    () => callsService.tasks({ tab, q: query, program, last, tag, sort, page, per_page: PER_PAGE }),
    [tab, query, program, last, tag, sort, page, reload],
  );

  const refresh = () => setReload((value) => value + 1);
  const pick = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
    setSelected([]);
  };

  const bulk = async (action: "postpone" | "priority", ids: number[], options: { days?: number; value?: boolean }) => {
    await callsService.bulk({ ids, action, ...options });
    setSelected([]);
    refresh();
  };

  const stats = counts.data?.stats;
  const rows = list.data?.results ?? [];

  const openTask = (id: number) => {
    setTaskId(id);
    setToast("");
    window.setTimeout(() => panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5">
        <h1 className="m-0 text-[22px] font-extrabold text-ink">کارهای من</h1>
        {stats ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className={MUTED}>تماس امروز: <b className="text-sm text-ink">{formatNumber(stats.today_calls)} از {formatNumber(stats.today_target)}</b></span>
            <span className={MUTED}>پاسخ‌دهی این ماه: <b className="text-sm text-ink">{formatNumber(stats.month_calls ? Math.round((stats.month_connected / stats.month_calls) * 100) : 0)}٪</b></span>
            <span className={MUTED}>خرید از تماس‌های من: <b className="text-sm text-ink">{formatCompactToman(stats.month_sales)}</b></span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line">
        {TABS.map((item) => (
          <UnderlineTab key={item.key} on={tab === item.key} onClick={() => pick(setTab)(item.key)}>
            {item.label} ({formatNumber(counts.data?.[item.key] ?? 0)})
          </UnderlineTab>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <input className={`${INPUT} max-w-[260px]`} type="search" aria-label="جستجوی مشتری" placeholder="جستجوی نام یا شماره" value={search} onChange={(event) => setSearch(event.target.value)} />
        <span className={MUTED}>برنامه</span>
        <Chip on={!program} onClick={() => pick(setProgram)("")}>همه</Chip>
        {counts.data?.programs.map((row) => (
          <Chip key={row.id} on={program === String(row.id)} onClick={() => pick(setProgram)(String(row.id))}>{row.name}</Chip>
        ))}
        <span className={`${MUTED} ms-2`}>مرتب‌سازی</span>
        {SORTS.map((row) => (
          <Chip key={row.key} on={sort === row.key} onClick={() => pick(setSort)(row.key)}>{row.label}</Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={MUTED}>آخرین نتیجه</span>
        <Chip on={!last} onClick={() => pick(setLast)("")}>همه</Chip>
        {counts.data?.results.map((row) => (
          <Chip key={row} on={last === row} onClick={() => pick(setLast)(row)}>{row}</Chip>
        ))}
        <span className={`${MUTED} ms-2`}>برچسب</span>
        <Chip on={!tag} onClick={() => pick(setTag)("")}>همه</Chip>
        {tags.data?.results.filter((row) => row.is_active).map((row) => (
          <Chip key={row.id} on={tag === String(row.id)} onClick={() => pick(setTag)(String(row.id))}>{row.title}</Chip>
        ))}
      </div>

      {selected.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-blue-500/[0.14] px-3.5 py-2">
          <span className="text-[13px] font-semibold text-ink">{formatNumber(selected.length)} مورد انتخاب شد</span>
          <Ghost onClick={() => bulk("postpone", selected, { days: 1 })}>موکول به فردا</Ghost>
          <Ghost onClick={() => bulk("postpone", selected, { days: 7 })}>موکول به هفته بعد</Ghost>
          <Ghost onClick={() => bulk("priority", selected, { value: true })}>اولویت بالا</Ghost>
          <Ghost onClick={() => setSelected([])}>لغو انتخاب</Ghost>
        </div>
      ) : null}

      {toast ? (
        <div role="status" className="rounded-xl border border-slate-300/70 bg-elevated px-3.5 py-[9px] text-[13px] text-ink dark:border-white/[0.12]">{toast}</div>
      ) : null}

      <div className="flex flex-wrap items-start gap-3.5">
        <section className={`${CARD} min-w-0 flex-[3_1_560px] px-2 py-1`}>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[660px] border-collapse text-[13px]">
              <thead>
                <tr className="text-right text-muted [&>th]:whitespace-nowrap [&>th]:px-2 [&>th]:py-[9px] [&>th]:font-medium">
                  <th scope="col"><span className="sr-only">انتخاب</span></th>
                  <th scope="col">مشتری</th>
                  <th scope="col">سطح</th>
                  <th scope="col">برنامه</th>
                  <th scope="col">موعد</th>
                  <th scope="col">تلاش</th>
                  <th scope="col">آخرین نتیجه</th>
                  <th scope="col">ارزش</th>
                  <th scope="col"><span className="sr-only">اولویت</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Row
                    key={row.id}
                    row={row}
                    active={taskId === row.id}
                    selected={selected.includes(row.id)}
                    onSelect={(on) => setSelected((prev) => (on ? [...prev, row.id] : prev.filter((id) => id !== row.id)))}
                    onOpen={() => openTask(row.id)}
                    onStar={() => bulk("priority", [row.id], { value: !row.is_priority })}
                    closed={tab === "done"}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {!list.loading && !rows.length ? <p className={`${MUTED} m-0 p-7 text-center`}>موردی با این فیلترها نیست.</p> : null}
          {list.error ? <p className={`${MUTED} m-0 p-7 text-center`}>فهرست بارگذاری نشد.</p> : null}
          <div className="px-2 pb-2">
            <Pagination page={page} total={list.data?.total ?? 0} perPage={PER_PAGE} onChange={setPage} />
          </div>
        </section>

        <section ref={panelRef} className={`${CARD} flex min-w-0 flex-[2_1_400px] flex-col gap-4 p-[18px]`}>
          {taskId == null ? (
            <h2 className={`${H} py-6`}>مشتری را از فهرست انتخاب کنید</h2>
          ) : (
            <TaskPanel
              key={taskId}
              taskId={taskId}
              onSaved={(message) => {
                setTaskId(null);
                setToast(message);
                refresh();
              }}
              onPostponed={() => {
                setTaskId(null);
                refresh();
              }}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function Row({ row, active, selected, onSelect, onOpen, onStar, closed }: {
  row: TaskRow;
  active: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onOpen: () => void;
  onStar: () => void;
  closed: boolean;
}) {
  const due = dueLabel(row.due_at);
  return (
    <tr className={`border-t border-black/[0.06] dark:border-white/[0.06] [&>td]:whitespace-nowrap [&>td]:px-2 [&>td]:py-[9px] ${active ? "bg-blue-500/10" : ""}`}>
      <td>{closed ? null : <input type="checkbox" aria-label={`انتخاب ${row.customer.name}`} checked={selected} onChange={(event) => onSelect(event.target.checked)} />}</td>
      <td>
        {closed ? (
          <span className="text-[13.5px] font-semibold text-ink">{row.customer.name}</span>
        ) : (
          <button type="button" onClick={onOpen} className="min-h-[34px] cursor-pointer border-0 bg-transparent p-0 text-[13.5px] font-semibold text-blue-600 dark:text-blue-300">
            {row.customer.name}
          </button>
        )}
      </td>
      <td className={MUTED}>{row.customer.tier ?? "—"}</td>
      <td className={MUTED}>{row.program}</td>
      <td className={closed ? MUTED : due.overdue ? "font-semibold text-[var(--delta-down)]" : "text-ink"}>{closed ? "انجام شد" : due.text}</td>
      <td className={MUTED}>{formatNumber(row.attempt)}</td>
      <td className={MUTED}>{row.last_outcome_title || "—"}</td>
      <td className="text-ink">{formatCompactToman(row.customer_value)}</td>
      <td>
        {closed ? null : (
          <button
            type="button"
            onClick={onStar}
            aria-label={row.is_priority ? "حذف اولویت" : "اولویت بالا"}
            aria-pressed={row.is_priority}
            className={`min-h-[34px] min-w-[34px] cursor-pointer border-0 bg-transparent text-base ${row.is_priority ? "text-amber-500" : "text-faint"}`}
          >
            ★
          </button>
        )}
      </td>
    </tr>
  );
}

function daysAgo(iso: string | null) {
  if (!iso) return "بدون خرید";
  const days = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));
  return `آخرین خرید ${formatNumber(days)} روز پیش`;
}

function TaskPanel({ taskId, onSaved, onPostponed }: { taskId: number; onSaved: (message: string) => void; onPostponed: () => void }) {
  const [reload, setReload] = useState(0);
  const { data, loading, error } = useApi(() => callsService.task(taskId), [taskId, reload]);
  const [outcome, setOutcome] = useState<FormOutcome | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (loading && !data) return <p className={MUTED}>در حال دریافت اطلاعات...</p>;
  if (error || !data) return <p className={MUTED}>این کار بارگذاری نشد.</p>;

  const outcomes = (data.form?.schema.outcomes ?? []).filter((row) => row.is_active !== false);
  const check = saveCheck(outcome, answers, note, data.note_min_chars);

  const save = async (chosen: FormOutcome, values: Answers, text: string) => {
    if (needsDncConfirm(chosen) && !window.confirm(DNC_CONFIRM)) return false;
    setBusy(true);
    setMessage("");
    try {
      const effect = await callsService.saveLog(taskId, { outcome_id: chosen.id, answers: values, note: text });
      onSaved(resultMessage(chosen.title, effect));
    } catch (caught) {
      setMessage(caught instanceof ApiError && caught.message ? caught.message : "ثبت نشد.");
      setBusy(false);
    }
  };

  const pickOutcome = (row: FormOutcome) => {
    setMessage("");
    setOutcome(row);
    setAnswers({});
    // Cancelling a one-click dnc confirmation leaves no outcome selected.
    if (isOneClick(row)) void save(row, {}, "").then((saved) => saved === false && setOutcome(null));
  };

  const postpone = async (days: number) => {
    await callsService.bulk({ ids: [taskId], action: "postpone", days });
    onPostponed();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-col gap-[3px]">
          <h2 className="m-0 text-[17px] font-bold text-ink">{data.customer.name}</h2>
          <span className={MUTED}>{data.customer.tier ?? "بدون سطح"}، {daysAgo(data.customer.last_order_at)}</span>
          <span className="text-[12.5px] text-blue-600 dark:text-blue-300">برنامه: {data.program.name}، تلاش {toFaDigits(data.attempt)}</span>
        </div>
        <a
          href={`tel:${data.customer.mobile}`}
          dir="ltr"
          className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-[14.5px] font-semibold text-on-accent no-underline"
        >
          {formatMobile(data.customer.mobile)}
        </a>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className={H}>نتیجه تماس</h3>
        {!outcomes.length ? <p className={`${MUTED} m-0`}>مدیر هنوز فرم این برنامه را نساخته است.</p> : null}
        <div className="flex flex-wrap items-center gap-1.5">
          {outcomes.map((row) => (
            <Chip key={row.id} on={outcome?.id === row.id} disabled={busy} onClick={() => pickOutcome(row)}>
              {row.title}
            </Chip>
          ))}
        </div>
      </div>

      {outcome && !isOneClick(outcome) ? (
        <>
          {outcome.fields.map((field) => (
            <CallField key={field.id} field={field} answers={answers} onChange={(id, value) => setAnswers((prev) => ({ ...prev, [id]: value }))} />
          ))}
          <label className="flex flex-col gap-1.5 text-[13px] text-slate-600 dark:text-slate-300">
            {outcome.connected ? "یادداشت (اجباری)" : "یادداشت (اختیاری)"}
            <textarea className={`${INPUT} pt-2`} rows={3} placeholder="خلاصه گفتگو" value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <div className="flex flex-wrap items-center gap-2.5">
            <Primary disabled={!check.ok || busy} onClick={() => save(outcome, answers, note)}>ثبت تماس</Primary>
            <span className={MUTED}>{check.hint}</span>
          </div>
        </>
      ) : null}
      {message ? (
        <div className="flex items-center gap-2 text-[13px] text-rose-600 dark:text-rose-400" role="alert">
          <span>{message}</span>
          <Ghost onClick={() => setReload((value) => value + 1)}>به‌روزرسانی</Ghost>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 border-t border-black/[0.07] pt-2.5 dark:border-white/[0.07]">
        <span className={MUTED}>موکول کردن:</span>
        <Ghost onClick={() => postpone(1)}>فردا</Ghost>
        <Ghost onClick={() => postpone(7)}>هفته بعد</Ghost>
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className={H}>تماس‌های قبلی</h3>
        {!data.history.length ? <span className={MUTED}>تماسی ثبت نشده است.</span> : null}
        {data.history.map((log) => (
          <CallHistoryRow key={log.id} log={log} onChanged={() => setReload((value) => value + 1)} />
        ))}
      </div>
    </div>
  );
}
