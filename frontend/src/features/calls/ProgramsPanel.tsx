import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi";
import { formatNumber } from "../../lib/format";
import { ApiError } from "../../services/api";
import { callsService } from "../../services/calls";
import type { CallListRow, ProgramRow } from "./types";
import { CARD, Chip, Ghost, H, INPUT, MUTED, Primary, SOFT, UnderlineTab } from "./ui";

const FormBuilder = lazy(() => import("./FormBuilder").then((module) => ({ default: module.FormBuilder })));

const STATUS_LABEL: Record<ProgramRow["status"], string> = { draft: "پیش‌نویس", active: "فعال", paused: "متوقف", ended: "پایان‌یافته" };
const KIND_LABEL = { fixed: "ثابت", dynamic: "پویا" };

export function ProgramsPanel() {
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const programs = useApi(() => callsService.programs(), [reload]);
  const lists = useApi(() => callsService.lists(), [reload]);
  const refresh = () => setReload((value) => value + 1);

  const rows = programs.data?.results ?? [];
  const current = rows.find((row) => row.id === editing);
  if (current) {
    return <ProgramEditor program={current} programs={rows} lists={lists.data?.results ?? []} onBack={() => setEditing(null)} onChanged={refresh} />;
  }

  const create = async () => {
    try {
      const row = await callsService.createProgram(name.trim());
      setName("");
      refresh();
      setEditing(row.id);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "ساخت برنامه انجام نشد.");
    }
  };
  const setStatus = async (row: ProgramRow, action: "pause" | "resume" | "end") => {
    await callsService.programStatus(row.id, action);
    refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <section key={row.id} className={`${CARD} flex flex-wrap items-center justify-between gap-x-[22px] gap-y-2.5 px-[18px] py-3.5`}>
          <div className="flex flex-[1_1_280px] flex-col gap-[3px]">
            <h2 className={H}>{row.name}</h2>
            <span className={MUTED}>
              لیست: {row.list?.name ?? "انتخاب نشده"}. کارمندان: {row.agents.map((agent) => agent.username).join("، ") || "—"}
            </span>
          </div>
          <span className={MUTED}>{row.form_summary ? `${formatNumber(row.form_summary.outcomes)} نتیجه، ${formatNumber(row.form_summary.fields)} فیلد` : "فرم ندارد"}</span>
          <span className={MUTED}>{STATUS_LABEL[row.status]}</span>
          <Ghost onClick={() => setEditing(row.id)}>ویرایش برنامه و فرم</Ghost>
          {row.status === "active" ? <Ghost onClick={() => setStatus(row, "pause")}>توقف</Ghost> : null}
          {row.status === "paused" ? <Ghost onClick={() => setStatus(row, "resume")}>ادامه</Ghost> : null}
          {row.status === "active" || row.status === "paused" ? <Ghost onClick={() => window.confirm("برنامه پایان یابد و کارهای باز لغو شوند؟") && setStatus(row, "end")}>پایان</Ghost> : null}
        </section>
      ))}
      {message ? <p className="m-0 rounded-xl bg-blue-500/[0.14] px-3.5 py-2.5 text-[13px] text-ink">{message}</p> : null}
      <section className="flex flex-wrap items-center gap-2">
        <input className={`${INPUT} max-w-[320px]`} aria-label="نام برنامه جدید" placeholder="نام برنامه جدید" value={name} onChange={(event) => setName(event.target.value)} />
        <Primary disabled={!name.trim()} onClick={create}>ساخت برنامه تماس</Primary>
      </section>
      <section className="mt-2 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={`${H} text-[15px]`}>لیست‌های مشتری</h2>
          <Link to="/customers" className={`inline-flex min-h-[38px] items-center rounded-[10px] border border-slate-300 px-[13px] text-[12.5px] dark:border-white/[0.16] ${SOFT}`}>
            ساخت لیست از صفحه مشتریان
          </Link>
        </div>
        {(lists.data?.results ?? []).map((row) => (
          <div key={row.id} className={`${CARD} flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-3.5 py-2.5`}>
            <span className="text-[13.5px] font-semibold text-ink">{row.name}</span>
            <span className={`${MUTED} flex-[1_1_200px]`}>{row.source === "excel" ? "فایل اکسل" : row.source === "manual" ? "انتخاب دستی" : "فیلترهای مشتریان"}</span>
            <span className={MUTED}>{KIND_LABEL[row.kind]}</span>
            <span className="text-[13px] font-semibold text-ink">{row.job_status === "running" ? "در حال ساخت..." : formatNumber(row.customer_count)}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

function ProgramEditor({ program, programs, lists, onBack, onChanged }: { program: ProgramRow; programs: ProgramRow[]; lists: CallListRow[]; onBack: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<"audience" | "form">("audience");
  const [name, setName] = useState(program.name);
  const settings = useApi(() => callsService.settings(), []);

  const saveName = () => {
    if (name.trim() && name.trim() !== program.name) callsService.updateProgram(program.id, { name: name.trim() }).then(onChanged);
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <Ghost onClick={onBack}>بازگشت به برنامه‌ها</Ghost>
          <input className={`${INPUT} w-[280px] max-w-full font-semibold`} aria-label="نام برنامه" value={name} onChange={(event) => setName(event.target.value)} onBlur={saveName} />
        </div>
        <span className={MUTED}>هر تغییر برای تماس‌های بعدی اعمال می‌شود. تماس‌های قبلی با فرم زمان خودشان می‌مانند.</span>
      </div>
      <div className="flex flex-wrap items-center gap-[22px] border-b border-line">
        <UnderlineTab on={tab === "audience"} onClick={() => setTab("audience")}>مشتریان و کارمندان</UnderlineTab>
        <UnderlineTab on={tab === "form"} onClick={() => setTab("form")}>فرم تماس</UnderlineTab>
      </div>
      {tab === "audience" ? (
        <Audience program={program} lists={lists} onChanged={onChanged} />
      ) : (
        <Suspense fallback={<p className={MUTED}>در حال دریافت اطلاعات...</p>}>
          <FormBuilder program={program} others={programs.filter((row) => row.id !== program.id)} gapDefault={settings.data?.default_gap_days ?? 30} onPublished={onChanged} />
        </Suspense>
      )}
    </div>
  );
}

function Audience({ program, lists, onChanged }: { program: ProgramRow; lists: CallListRow[]; onChanged: () => void }) {
  const agents = useApi(() => callsService.agents(), []);
  const preview = useApi(() => callsService.preview(program.id), [program.id, program.list?.id], Boolean(program.list));
  const [message, setMessage] = useState("");
  const [upload, setUpload] = useState<{ file: File; matched: number; unknown: number } | null>(null);
  const [uploadName, setUploadName] = useState("");

  // Task creation runs in the background; poll while it is running.
  useEffect(() => {
    if (program.job.status !== "running") return;
    const timer = window.setInterval(onChanged, 3000);
    return () => window.clearInterval(timer);
  }, [program.job.status, onChanged]);

  const update = (body: Record<string, unknown>) => callsService.updateProgram(program.id, body).then(onChanged);
  const selectedIds = program.agents.map((agent) => agent.user_id);
  const toggleAgent = (userId: number) => {
    const next = selectedIds.includes(userId)
      ? program.agents.filter((agent) => agent.user_id !== userId)
      : [...program.agents, { user_id: userId, username: "", share_percent: 0 }];
    return update({ agents: next.map((agent) => ({ user_id: agent.user_id, share_percent: agent.share_percent })) });
  };
  const setShare = (userId: number, percent: number) =>
    update({ agents: program.agents.map((agent) => ({ user_id: agent.user_id, share_percent: agent.user_id === userId ? percent : agent.share_percent })) });

  const activate = async () => {
    setMessage("");
    try {
      await callsService.activate(program.id);
      setMessage("ساخت کارها در پس‌زمینه شروع شد.");
      onChanged();
    } catch (error) {
      setMessage(error instanceof ApiError && error.message ? error.message : "فعال‌سازی انجام نشد.");
    }
  };
  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setMessage("");
    try {
      const summary = await callsService.excelDryRun(file);
      setUpload({ file, matched: summary.matched, unknown: summary.unknown });
    } catch (error) {
      setMessage(error instanceof ApiError && error.message ? error.message : "فایل خوانده نشد.");
    }
  };
  const saveUpload = async () => {
    if (!upload) return;
    try {
      const saved = await callsService.excelCreate(upload.file, uploadName.trim());
      setUpload(null);
      setUploadName("");
      await update({ list_id: saved.list.id });
    } catch (error) {
      setMessage(error instanceof ApiError && error.message ? error.message : "ساخت لیست انجام نشد.");
    }
  };

  const counts = preview.data;
  return (
    <div className="flex flex-col gap-3.5">
      <section className={`${CARD} flex flex-col gap-3 p-[18px]`}>
        <h2 className={`${H} text-[15px]`}>لیست مشتریان</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {lists.map((row) => (
            <Chip key={row.id} on={program.list?.id === row.id} onClick={() => update({ list_id: row.id })}>{row.name}</Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link to="/customers" className={`inline-flex min-h-[38px] items-center rounded-[10px] border border-slate-300 px-[13px] text-[12.5px] dark:border-white/[0.16] ${SOFT}`}>
            ساخت لیست از صفحه مشتریان
          </Link>
          <label className={`inline-flex min-h-[38px] cursor-pointer items-center rounded-[10px] border border-slate-300 px-[13px] text-[12.5px] dark:border-white/[0.16] ${SOFT}`}>
            بارگذاری فایل اکسل شماره‌ها
            <input type="file" accept=".xlsx,.csv" className="sr-only" onChange={(event) => pickFile(event.target.files?.[0])} />
          </label>
        </div>
        {upload ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-blue-500/[0.14] p-3">
            <span className="text-[13px] text-ink">از فایل: {formatNumber(upload.matched)} شماره، {formatNumber(upload.unknown)} شماره ناشناس کنار گذاشته شد</span>
            <input className={`${INPUT} max-w-[240px]`} aria-label="نام لیست" placeholder="نام لیست" value={uploadName} onChange={(event) => setUploadName(event.target.value)} />
            <Ghost disabled={!uploadName.trim() || !upload.matched} onClick={saveUpload}>ذخیره لیست</Ghost>
            <Ghost onClick={() => setUpload(null)}>انصراف</Ghost>
          </div>
        ) : null}
        <p className={`m-0 text-[13.5px] leading-[1.8] ${SOFT}`}>
          {!program.list
            ? "یک لیست انتخاب کنید."
            : counts
              ? `${formatNumber(counts.total)} مشتری در لیست، ${formatNumber(counts.excluded)} نفر حذف شدند (${formatNumber(counts.do_not_call)} تماس نگیرید، ${formatNumber(counts.recent)} تماس اخیر، ${formatNumber(counts.open_task)} کار فعال در برنامه دیگر، ${formatNumber(counts.internal)} حساب داخلی). ${formatNumber(counts.eligible)} کار ساخته می‌شود.`
              : "در حال شمارش..."}
        </p>
      </section>
      <section className={`${CARD} flex flex-col gap-3 p-[18px]`}>
        <h2 className={`${H} text-[15px]`}>کارمندان و تقسیم مشتریان</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {(agents.data?.results ?? []).map((row) => (
            <Chip key={row.id} on={selectedIds.includes(row.id)} onClick={() => toggleAgent(row.id)}>{row.username}</Chip>
          ))}
          {agents.data && !agents.data.results.length ? <span className={MUTED}>کارمند تماسی ساخته نشده است (تنظیمات پلتفرم).</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={MUTED}>تقسیم</span>
          <Chip on={program.share_mode === "equal"} onClick={() => update({ share_mode: "equal" })}>مساوی</Chip>
          <Chip on={program.share_mode === "custom"} onClick={() => update({ share_mode: "custom" })}>سهم دلخواه</Chip>
        </div>
        {program.agents.map((agent) => (
          <div key={agent.user_id} className="flex flex-wrap items-center gap-3">
            <span className="min-w-[60px] text-[13.5px] text-ink">{agent.username}</span>
            {program.share_mode === "custom" ? (
              <label className={`flex items-center gap-1.5 ${MUTED}`}>
                <input
                  className={`${INPUT} w-[84px]`}
                  type="number"
                  min={0}
                  max={100}
                  aria-label={`سهم ${agent.username}`}
                  defaultValue={agent.share_percent}
                  onBlur={(event) => setShare(agent.user_id, Number(event.target.value))}
                />
                درصد
              </label>
            ) : null}
            {counts ? (
              <span className={MUTED}>
                {formatNumber(Math.round(program.share_mode === "custom" ? (counts.eligible * agent.share_percent) / 100 : counts.eligible / program.agents.length))} مشتری
              </span>
            ) : null}
          </div>
        ))}
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <Primary disabled={program.job.status === "running" || program.status === "ended"} onClick={activate}>
          {program.status === "active" ? "افزودن مشتریان جدید لیست" : "فعال‌سازی برنامه"}
        </Primary>
        {program.job.status === "running" ? <span className={MUTED}>در حال ساخت کارها: {formatNumber(program.job.done)} از {formatNumber(program.job.total)}</span> : null}
        {program.job.status === "failed" ? <span className="text-[13px] text-rose-600 dark:text-rose-400">ساخت کارها ناموفق بود.</span> : null}
        {message ? <span className={MUTED}>{message}</span> : null}
      </div>
    </div>
  );
}
