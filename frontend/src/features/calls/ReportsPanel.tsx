import { useState } from "react";
import { Pagination } from "../../components/ui";
import { useApi } from "../../hooks/useApi";
import { formatNumber, formatToman } from "../../lib/format";
import { callsService } from "../../services/calls";
import { CallHistoryRow } from "./CallHistory";
import { CARD, Chip, Ghost, H, MUTED, SOFT } from "./ui";

type SalesReport = {
  buy_window_days: number;
  kpis: { sales: number; buyers: number; connected_calls: number; tasks_total: number; tasks_open: number };
  cards: { key: string; title: string; color: string | null; count: number; rows: { name: string; source_id: number; days: number; agent?: string }[] }[];
  outcomes: { program: string; title: string; calls: number; buyers: number }[];
};
type Escalation = { id: number; customer: string; source_id: number; outcome: string; note: string; agent: string };
type CustomerResults = {
  total: number;
  page: number;
  per_page: number;
  results: { source_id: number; name: string; tier: string | null; result: string; agent: string | null; do_not_call: boolean }[];
};
type Widget = { id: string; type: string; title: string; outcome: string; count: number; avg: number | null; yes?: number; bars: { label: string; value: number }[]; texts: string[] };
type TeamRow = { agent: string; calls: number; reached: number; buyers: number; sales: number; overdue: number };

const TABS = [
  { key: "sales", label: "فروش" },
  { key: "answers", label: "پاسخ‌های فرم" },
  { key: "team", label: "تیم" },
] as const;
const TH = "[&>th]:whitespace-nowrap [&>th]:px-2 [&>th]:py-[9px] [&>th]:text-right [&>th]:font-medium [&>th]:text-muted";
const TD = "border-t border-black/[0.06] dark:border-white/[0.06] [&>td]:whitespace-nowrap [&>td]:px-2 [&>td]:py-[9px]";
const rate = (part: number, whole: number) => (whole ? `${formatNumber(Math.round((part / whole) * 100))}٪` : "—");

export function ReportsPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("sales");
  const [program, setProgram] = useState("");
  const programs = useApi(() => callsService.programs(), []);
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {TABS.map((item) => (
            <Chip key={item.key} on={tab === item.key} onClick={() => setTab(item.key)}>{item.label}</Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={MUTED}>برنامه</span>
          <Chip on={!program} onClick={() => setProgram("")}>همه</Chip>
          {programs.data?.results.map((row) => (
            <Chip key={row.id} on={program === String(row.id)} onClick={() => setProgram(String(row.id))}>{row.name}</Chip>
          ))}
        </div>
      </div>
      <p className={`${MUTED} m-0`}>خرید بعد از تماس لزوماً نتیجه تماس نیست.</p>
      {tab === "sales" ? <SalesTab program={program} /> : null}
      {tab === "answers" ? <AnswersTab program={program} /> : null}
      {tab === "team" ? <TeamTab program={program} /> : null}
    </div>
  );
}

function Failed() {
  return <p className={MUTED}>گزارش بارگذاری نشد.</p>;
}

function SalesTab({ program }: { program: string }) {
  const { data, error } = useApi(() => callsService.report<SalesReport>("sales", { program }), [program]);
  if (error) return <Failed />;
  if (!data) return <p className={MUTED}>در حال دریافت اطلاعات...</p>;
  const { kpis } = data;
  const kpiRows = [
    { label: "فروش پس از تماس", value: formatToman(kpis.sales), note: `تا ${formatNumber(data.buy_window_days)} روز بعد از تماس` },
    { label: "مشتریان خریدار", value: formatNumber(kpis.buyers), note: `از ${formatNumber(kpis.connected_calls)} تماس انجام‌شده` },
    { label: "نرخ تبدیل", value: rate(kpis.buyers, kpis.connected_calls), note: "خریدار به تماس" },
    { label: "پیشرفت", value: rate(kpis.tasks_total - kpis.tasks_open, kpis.tasks_total), note: `${formatNumber(kpis.tasks_total)} مخاطبان برنامه` },
  ];
  return (
    <div className="flex flex-col gap-5">
      <section className={`${CARD} grid gap-4 p-[18px]`} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        {kpiRows.map((row) => (
          <div key={row.label} className="flex flex-col gap-1">
            <span className={`text-[13px] ${SOFT}`}>{row.label}</span>
            <span className="text-[25px] font-extrabold text-ink">{row.value}</span>
            <span className={MUTED}>{row.note}</span>
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-2.5">
        <h2 className={`${H} text-[15px]`}>فرصت‌هایی که منتظر اقدام‌اند</h2>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(270px, 100%), 1fr))" }}>
          {data.cards.map((card) => (
            <div key={card.key} className={`${CARD} flex flex-col gap-[7px] px-4 py-3.5`}>
              <div className="flex items-center justify-between text-[13.5px]">
                <span className="font-semibold text-ink">{card.title}</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">{formatNumber(card.count)}</span>
              </div>
              {card.rows.map((row) => (
                <div key={row.source_id} className={`${MUTED} flex items-center justify-between`}>
                  <span className="text-slate-700 dark:text-slate-200">{row.name}</span>
                  <span>{row.agent ? `${row.agent}، ` : ""}{formatNumber(row.days)} روز</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
      <Escalations program={program} />
      <section className="flex flex-col gap-2">
        <h2 className={`${H} text-[15px]`}>هر نتیجه چقدر به خرید رسید؟</h2>
        <div className={`${CARD} overflow-x-auto px-3 py-1`}>
          <table className="w-full min-w-[480px] border-collapse text-[13px]">
            <thead><tr className={TH}><th scope="col">نتیجه</th><th scope="col">برنامه</th><th scope="col">تماس</th><th scope="col">خریدار</th><th scope="col">نرخ خرید</th></tr></thead>
            <tbody>
              {data.outcomes.map((row) => (
                <tr key={`${row.program}-${row.title}`} className={TD}>
                  <td className="font-semibold text-ink">{row.title}</td>
                  <td className={MUTED}>{row.program}</td>
                  <td className="text-ink">{formatNumber(row.calls)}</td>
                  <td className="text-ink">{formatNumber(row.buyers)}</td>
                  <td className="text-ink">{rate(row.buyers, row.calls)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <CustomerResultsList program={program} />
    </div>
  );
}

function Escalations({ program }: { program: string }) {
  const [reload, setReload] = useState(0);
  const { data } = useApi(() => callsService.report<{ results: Escalation[] }>("escalations", { program }), [program, reload]);
  const rows = data?.results ?? [];
  return (
    <section className="flex flex-col gap-2">
      <h2 className={`${H} text-[15px]`}>ارجاع‌شده به مدیر</h2>
      {data && !rows.length ? <p className={`${MUTED} m-0`}>موردی باز نیست.</p> : null}
      {rows.map((row) => (
        <div key={row.id} className={`${CARD} flex flex-wrap items-center justify-between gap-2 px-3.5 py-2`}>
          <span className="text-[13.5px] font-semibold text-ink">{row.customer}</span>
          <span className={`${MUTED} me-auto`}>{row.agent}، {row.outcome}{row.note ? `: ${row.note}` : ""}</span>
          <Ghost onClick={() => callsService.closeEscalation(row.id).then(() => setReload((value) => value + 1))}>بستن</Ghost>
        </div>
      ))}
    </section>
  );
}

function CustomerResultsList({ program }: { program: string }) {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const { data } = useApi(() => callsService.report<CustomerResults>("customers", { program, page }), [program, page]);
  return (
    <section className="flex flex-col gap-0.5">
      <h2 className={`${H} mb-2 text-[15px]`}>نتیجه تماس با هر مشتری</h2>
      {data?.results.map((row) => (
        <div key={row.source_id} className="border-t border-black/[0.07] dark:border-white/[0.07]">
          <button
            type="button"
            aria-expanded={open === row.source_id}
            onClick={() => setOpen(open === row.source_id ? null : row.source_id)}
            className="grid min-h-[46px] w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-1 py-1.5 text-right text-[13px]"
            style={{ gridTemplateColumns: "minmax(90px, 1fr) minmax(60px, .6fr) minmax(90px, 1.2fr) minmax(60px, .8fr)" }}
          >
            <span className="font-semibold text-ink">{row.name}</span>
            <span className={MUTED}>{row.tier ?? "—"}</span>
            <span className={row.do_not_call ? "text-[var(--delta-down)]" : SOFT}>{row.result}</span>
            <span className={MUTED}>{row.agent ?? "—"}</span>
          </button>
          {open === row.source_id ? <CustomerHistory sourceId={row.source_id} /> : null}
        </div>
      ))}
      {data ? <Pagination page={page} total={data.total} perPage={data.per_page} onChange={setPage} /> : null}
    </section>
  );
}

function CustomerHistory({ sourceId }: { sourceId: number }) {
  const { data } = useApi(() => callsService.customerCalls(sourceId), [sourceId]);
  return (
    <div className="flex flex-col gap-2 px-1 pb-3.5 pt-0.5">
      {data?.results.map((log) => <CallHistoryRow key={log.id} log={log} />)}
    </div>
  );
}

function AnswersTab({ program }: { program: string }) {
  const { data, error } = useApi(() => callsService.report<{ widgets: Widget[] }>("answers", { program }), [program], Boolean(program));
  if (!program) return <p className={`${MUTED} m-0`}>هر برنامه فرم خودش را دارد. برای دیدن پاسخ‌ها یک برنامه را انتخاب کنید.</p>;
  if (error) return <Failed />;
  if (!data) return <p className={MUTED}>در حال دریافت اطلاعات...</p>;
  if (!data.widgets.length) return <p className={`${MUTED} m-0`}>هنوز پاسخی ثبت نشده است.</p>;
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))" }}>
      {data.widgets.map((widget) => {
        const max = Math.max(1, ...widget.bars.map((bar) => bar.value));
        const summary =
          widget.type === "toggle"
            ? `${formatNumber(widget.yes ?? 0)} بله از ${formatNumber(widget.count)}`
            : widget.avg != null
              ? `میانگین ${formatNumber(widget.avg)}${widget.type === "rating" ? " از ۵" : ""}`
              : widget.type === "text" || widget.type === "long_text"
                ? `${formatNumber(widget.count)} پاسخ جدید`
                : `${formatNumber(widget.count)} پاسخ`;
        return (
          <section key={widget.id} className={`${CARD} flex flex-col gap-[9px] p-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={H}>{widget.title}</h2>
              <span className={MUTED}>{summary}</span>
            </div>
            <span className={MUTED}>{widget.outcome}</span>
            {widget.bars.map((bar) => (
              <div key={bar.label} className="grid items-center gap-2.5 text-[12.5px]" style={{ gridTemplateColumns: "minmax(80px, 130px) minmax(0, 1fr) 34px" }}>
                <span className="text-ink">{bar.label}</span>
                <div className="h-2 rounded bg-black/5 dark:bg-white/[0.06]">
                  <div className="h-2 rounded bg-accent" style={{ width: `${Math.round((bar.value / max) * 100)}%` }} />
                </div>
                <span className="text-left font-semibold text-ink">{formatNumber(bar.value)}</span>
              </div>
            ))}
            {widget.texts.map((text, index) => (
              <p key={index} className={`${MUTED} m-0 leading-[1.8]`}>{text}</p>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function TeamTab({ program }: { program: string }) {
  const { data, error } = useApi(() => callsService.report<{ results: TeamRow[] }>("team", { program }), [program]);
  if (error) return <Failed />;
  return (
    <div className={`${CARD} overflow-x-auto px-3 py-1`}>
      <table className="w-full min-w-[560px] border-collapse text-[13px]">
        <thead><tr className={TH}><th scope="col">کارمند</th><th scope="col">تماس</th><th scope="col">پاسخ‌داده</th><th scope="col">خریدار</th><th scope="col">فروش</th><th scope="col">کار عقب‌افتاده</th></tr></thead>
        <tbody>
          {data?.results.map((row) => (
            <tr key={row.agent} className={TD}>
              <td className="font-semibold text-ink">{row.agent}</td>
              <td className="text-ink">{formatNumber(row.calls)}</td>
              <td className="text-ink">{formatNumber(row.reached)}</td>
              <td className="text-ink">{formatNumber(row.buyers)}</td>
              <td className="text-ink">{formatToman(row.sales)}</td>
              <td className="text-amber-600 dark:text-amber-400">{formatNumber(row.overdue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
