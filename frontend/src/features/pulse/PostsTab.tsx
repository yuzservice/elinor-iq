import { useState } from "react";
import { Pagination } from "../../components/ui";
import { useApi } from "../../hooks/useApi";
import { pulseService } from "../../services/pulse";
import { code as codeText, compact, fa, jalali } from "./format";
import type { PostCard } from "./types";
import { Chip, Cover, FAINT, ScoreBadge, ScoreBar } from "./ui";

const KINDS = [
  ["all", "همه"],
  ["reel", "ریل"],
  ["slide", "اسلاید و عکس"],
  ["brand", "محتوای برند"],
] as const;
const SORTS = [
  ["new", "جدیدترین"],
  ["score", "امتیاز"],
  ["saves", "سیو"],
  ["shares", "ارسال"],
] as const;

export function PostGrid({ posts, onOpen, label }: { posts: PostCard[]; onOpen: (id: number) => void; label?: (post: PostCard) => string }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 min-[401px]:grid-cols-3">
      {posts.map((post) => (
        <button key={post.id} type="button" onClick={() => onOpen(post.id)} className="cursor-pointer text-right">
          <Cover post={post} />
          <div className="mt-1.5">
            <ScoreBar score={post.score} />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px]">
            <span className={FAINT}>{label ? label(post) : jalali(post.published_at, { day: "numeric", month: "short" })}</span>
            <ScoreBadge score={post.score} />
          </div>
        </button>
      ))}
    </div>
  );
}

export function PostsTab({ onOpenPost, code, onClearCode }: { onOpenPost: (id: number) => void; code?: string; onClearCode?: () => void }) {
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState("new");
  const [hour, setHour] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading, error } = useApi(() => pulseService.posts({ kind, sort, page, hour, code }), [kind, sort, page, hour, code]);
  const pick = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };
  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label="نوع پست">
        {KINDS.map(([key, label]) => (
          <Chip key={key} on={kind === key} onClick={() => pick(setKind)(key)}>
            {label} {data ? fa(data.counts[key]) : ""}
          </Chip>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
        <span className={FAINT}>مرتب‌سازی</span>
        <select value={sort} onChange={(event) => pick(setSort)(event.target.value)} className="rounded-[10px] border border-line bg-surface px-2 py-1.5 text-xs text-ink">
          {SORTS.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select value={hour} onChange={(event) => pick(setHour)(event.target.value)} aria-label="ساعت انتشار" className="rounded-[10px] border border-line bg-surface px-2 py-1.5 text-xs text-ink">
          <option value="">همه‌ی ساعت‌ها</option>
          {Array.from({ length: 24 }, (_, value) => (
            <option key={value} value={value}>
              ساعت {fa(value)}
            </option>
          ))}
        </select>
        {code ? (
          <button type="button" onClick={onClearCode} className="rounded-full border border-[var(--pulse)] px-2.5 py-1 text-[var(--pulse)]">
            محصول {codeText(code)} ✕
          </button>
        ) : null}
        {data ? (
          <span className={`ms-auto text-[10.5px] ${FAINT}`}>
            میانه: ریل {compact(data.medians.reel)} · اسلاید {compact(data.medians.slide)}
          </span>
        ) : null}
      </div>
      {error ? <div className="py-8 text-center text-[13px] text-muted">پست‌ها بارگذاری نشد.</div> : null}
      {loading && !data ? <div className="mt-3 grid grid-cols-2 gap-2 min-[401px]:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-[14px] bg-elevated" />)}</div> : null}
      {data ? (
        data.results.length ? (
          <>
            <PostGrid posts={data.results} onOpen={onOpenPost} />
            <Pagination page={data.page} total={data.total} perPage={data.per_page} onChange={setPage} />
          </>
        ) : (
          <div className="py-8 text-center text-[13px] text-muted">پستی با این فیلتر نیست.</div>
        )
      ) : null}
    </div>
  );
}
