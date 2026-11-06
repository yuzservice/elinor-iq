import { useState } from "react";
import { pulseService } from "../../services/pulse";
import { clock, compact, fa, jalali, KIND_LABEL, percent, postTitle } from "./format";
import type { KpiCard, PostCard, PulseHome, PulseTask } from "./types";
import { CARD, CountUp, Cover, FAINT, ScoreBadge, SectionTitle, Spark, Thumb } from "./ui";

const KPI_LABEL: Record<KpiCard["key"], string> = {
  views: "بازدید",
  reach: "افراد دیده‌شده (Reach)",
  er: "نرخ تعامل (میانه)",
  skip: "رد شدن ریل (میانه)",
};

function kpiValue(card: KpiCard, value: number | null) {
  return card.key === "er" || card.key === "skip" ? percent(value, 1) : compact(value);
}

function Kpi({ card, index }: { card: KpiCard; index: number }) {
  const color = card.good === false ? "var(--delta-down)" : "var(--delta-up)";
  return (
    <div className={`${CARD} pulse-rise p-3.5`} style={{ animationDelay: `${index * 60}ms` }}>
      <div className="text-[11.5px] text-muted">{KPI_LABEL[card.key]}</div>
      <div className="mb-0.5 mt-1 text-[22px] font-extrabold tracking-tight">
        <CountUp value={card.value} format={(value) => kpiValue(card, value)} />
      </div>
      {card.change_pct != null ? (
        <span
          className="inline-flex items-center gap-0.5 rounded-full px-2 py-px text-[11px] font-bold"
          style={{ color, background: card.good === false ? "var(--delta-down-bg)" : "var(--delta-up-bg)" }}
        >
          {card.change_pct > 0 ? "▲" : "▼"} {percent(Math.abs(card.change_pct))}
        </span>
      ) : null}
      <div className={`mt-0.5 text-[10.5px] ${FAINT}`}>هفته‌ی قبل: {kpiValue(card, card.previous)}</div>
      <Spark values={card.spark} color={color} />
    </div>
  );
}

function Tasks({ tasks }: { tasks: PulseTask[] }) {
  const [items, setItems] = useState(tasks);
  const toggle = async (task: PulseTask) => {
    setItems((current) => current.map((item) => (item.id === task.id ? { ...item, done: !item.done } : item)));
    try {
      const result = await pulseService.toggleTask(task.id);
      setItems((current) => current.map((item) => (item.id === task.id ? { ...item, done: result.done } : item)));
    } catch {
      setItems((current) => current.map((item) => (item.id === task.id ? { ...item, done: task.done } : item)));
    }
  };
  if (!items.length) return <div className={`${CARD} text-center text-[13px] text-muted`}>امروز کار ویژه‌ای پیشنهاد نشده است.</div>;
  return (
    <>
      <SectionTitle note={`${fa(items.filter((task) => task.done).length)} از ${fa(items.length)}`}>{fa(items.length)} کار امروز</SectionTitle>
      <div className={CARD}>
        {items.map((task, index) => (
          <div
            key={task.id}
            role="checkbox"
            aria-checked={task.done}
            tabIndex={0}
            onClick={() => toggle(task)}
            onKeyDown={(event) => (event.key === " " || event.key === "Enter") && (event.preventDefault(), toggle(task))}
            className={`flex cursor-pointer items-start gap-3 py-3 ${index ? "border-t border-line" : "pt-1"}`}
          >
            <span
              className={`mt-0.5 grid h-[22px] w-[22px] flex-none place-items-center rounded-[7px] border-2 text-[13px] font-extrabold text-white ${
                task.done ? "border-[var(--success)] bg-[var(--success)]" : "border-[var(--text-faint)]"
              }`}
            >
              {task.done ? "✓" : ""}
            </span>
            <div>
              <div className={`text-sm font-semibold leading-7 ${task.done ? `line-through ${FAINT}` : ""}`}>{task.title}</div>
              <div className="text-xs leading-6 text-muted">{task.reason}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function PostRow({ post, onOpen }: { post: PostCard; onOpen: (id: number) => void }) {
  return (
    <button type="button" onClick={() => onOpen(post.id)} className="grid w-full cursor-pointer grid-cols-[48px_1fr_auto] items-center gap-3 border-t border-line py-3 text-right first:border-t-0">
      <Thumb post={post} />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-bold leading-6">{postTitle(post.caption)}</div>
        <div className="flex flex-wrap gap-2 text-[11px] text-muted">
          <span>
            {KIND_LABEL[post.kind]} · {clock(post)}
          </span>
          {post.skip_rate != null ? <span>رد شدن {percent(post.skip_rate)}</span> : null}
        </div>
      </div>
      <div className="text-left text-[15px] font-extrabold">
        {compact(post.views)}
        <small className="block">
          <ScoreBadge score={post.score} />
        </small>
      </div>
    </button>
  );
}

export function HomeTab({ data, onOpenPost }: { data: PulseHome; onOpenPost: (id: number) => void }) {
  const star = data.star;
  return (
    <div>
      <div className="pulse-rise mt-2 text-[22px] font-extrabold">صبح بخیر ☀️</div>
      <div className={`text-xs ${FAINT}`}>{jalali(`${data.date}T12:00:00+03:30`, { weekday: "long", day: "numeric", month: "long" })}</div>

      <SectionTitle>خلاصه‌ی دیروز</SectionTitle>
      <div className={`${CARD} pulse-rise relative overflow-hidden`} style={{ background: "linear-gradient(160deg,var(--pulse-soft),transparent 70%),var(--surface)" }}>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-[var(--pulse)] text-[13px] text-[var(--pulse-ink)]">✦</span>
          پالس · بر اساس قاعده
        </div>
        <p className="mb-0 mt-2 text-[14.5px] leading-8">{data.brief?.text ?? "خلاصه‌ی امروز هنوز ساخته نشده است. بعد از ساعت ۸ صبح آماده می‌شود."}</p>
      </div>

      <SectionTitle note={`در برابر ۷ روز قبل · ${fa(data.kpis.posts)} پست`}>۷ روز اخیر</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5">
        {data.kpis.cards.map((card, index) => (
          <Kpi key={card.key} card={card} index={index} />
        ))}
      </div>
      <div className={`mt-1.5 text-[10.5px] ${FAINT}`}>بازدید و Reach = جمع پست‌های منتشرشده در همان روزها. برای رد شدن، کمتر بهتر است.</div>

      <Tasks tasks={data.tasks} />

      {star ? (
        <>
          <SectionTitle>ستاره‌ی دیروز</SectionTitle>
          <button type="button" onClick={() => onOpenPost(star.id)} className={`${CARD} pulse-rise grid w-full cursor-pointer grid-cols-[120px_1fr] items-center gap-3.5 text-right`}>
            <Cover post={star} caption={false} />
            <div className="flex flex-col gap-1.5">
              <div className="text-[13px] font-bold leading-7">{postTitle(star.caption)}</div>
              {star.fresh ? (
                <div className="text-[11px] text-[var(--warning)]">پربازدیدترین پست دیروز؛ عددها هنوز بالا می‌روند</div>
              ) : (
                <div>
                  <ScoreBadge score={star.score} /> <span className={`text-[11px] ${FAINT}`}>برابر میانه‌ی {star.group === "reel" ? "ریل" : "اسلاید"}</span>
                </div>
              )}
              <div className="text-xs text-muted">
                {jalali(star.published_at, { weekday: "long" })} {clock(star)} · {compact(star.views)} بازدید · {fa(star.saves)} سیو · {fa(star.shares)} ارسال
              </div>
              <span className="text-xs font-bold text-[var(--pulse)]">جزئیات و کالبدشکافی ←</span>
            </div>
          </button>
        </>
      ) : null}

      <SectionTitle note={`${fa(data.yesterday.length)} پست`}>همه‌ی پست‌های دیروز</SectionTitle>
      <div className={CARD}>
        {data.yesterday.length ? data.yesterday.map((post) => <PostRow key={post.id} post={post} onOpen={onOpenPost} />) : <div className="py-4 text-center text-[13px] text-muted">دیروز پستی منتشر نشد.</div>}
      </div>
    </div>
  );
}
