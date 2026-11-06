import { useApi } from "../../hooks/useApi";
import { pulseService } from "../../services/pulse";
import { clock, code, compact, fa, GROUP_LABEL, jalali, KIND_LABEL, percent, postTitle } from "./format";
import { PostGrid } from "./PostsTab";
import { ProductImage } from "./ProductsTab";
import type { PostDetail } from "./types";
import { CARD, Cover, FAINT, ScoreBadge, SectionTitle } from "./ui";

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-2.5">
      <div className={`text-[10.5px] ${FAINT}`}>{label}</div>
      <div className="mt-0.5 text-base font-extrabold">{value}</div>
      {note ? <div className="text-[10px] text-muted">{note}</div> : null}
    </div>
  );
}

function Growth({ post }: { post: PostDetail }) {
  const values = post.growth.filter((point) => point.views != null);
  // No chart without the first days: say from when growth is recorded (date from the data).
  if (!post.growth_complete || values.length < 2) {
    return (
      <div className="rounded-xl border border-line bg-elevated px-3 py-2.5 text-[11.5px] leading-7 text-muted">
        {post.tracking_since
          ? `نمودار رشد از ${jalali(`${post.tracking_since}T12:00:00+03:30`, { day: "numeric", month: "long" })} ثبت می‌شود.`
          : "نمودار رشد با اولین اسنپ‌شات روزانه ثبت می‌شود."}
      </div>
    );
  }
  const max = Math.max(...values.map((point) => point.views ?? 0)) || 1;
  return (
    <div className={`${CARD} flex h-32 items-end gap-1 px-3 pb-2 pt-3`}>
      {values.map((point) => (
        <div key={point.date} className="flex flex-1 flex-col items-center gap-1" title={`روز ${fa(point.day + 1)}: ${compact(point.views)}`}>
          <i className="block w-full rounded-t bg-[var(--pulse)]" style={{ height: `${((point.views ?? 0) / max) * 90}px` }} />
          <span className={`text-[9px] ${FAINT}`}>{fa(point.day + 1)}</span>
        </div>
      ))}
    </div>
  );
}

export function PostSheetBody({ id, onOpenProduct }: { id: number; onOpenProduct: (code: string) => void }) {
  const { data: post, loading, error } = useApi(() => pulseService.post(id), [id]);
  if (error) return <div className="py-8 text-center text-[13px] text-muted">جزئیات پست بارگذاری نشد.</div>;
  if (loading || !post) return <div className="h-72 animate-pulse rounded-[18px] bg-elevated" />;
  const reel = post.group === "reel";
  const skipColor = post.skip_rate == null ? "" : post.skip_rate < post.skip_target ? "var(--s-great)" : post.skip_rate < 80 ? "var(--s-mid)" : "var(--s-bad)";
  return (
    <div>
      <div className="grid grid-cols-[110px_1fr] items-start gap-3.5">
        <Cover post={post} caption={false} />
        <div>
          <div className="text-[15px] font-extrabold leading-7">{postTitle(post.caption, 90)}</div>
          <div className="my-1 text-xs text-muted">
            {KIND_LABEL[post.kind]} · {jalali(post.published_at, { weekday: "long", day: "numeric", month: "long" })} · {clock(post)}
          </div>
          <div>
            <ScoreBadge score={post.score} />{" "}
            <span className={`text-[11px] ${FAINT}`}>
              برابر میانه‌ی {GROUP_LABEL[post.group]} ({compact(post.group_median)})
            </span>
          </div>
          {post.fresh ? (
            <div className="mt-1.5 inline-block rounded-md border border-amber-500/40 px-1.5 text-[10px] text-[var(--warning)]">کمتر از ۴۸ ساعت؛ عددها هنوز بالا می‌روند</div>
          ) : null}
          <div className="mt-2">
            <a className="text-xs font-bold text-[var(--pulse)] no-underline" href={post.url} target="_blank" rel="noopener noreferrer">
              دیدن در اینستاگرام ↗
            </a>
          </div>
        </div>
      </div>

      <SectionTitle>کالبدشکافی</SectionTitle>
      <div className={`${CARD} p-3.5`} style={{ background: "linear-gradient(160deg,var(--pulse-soft),transparent 70%),var(--surface)" }}>
        <p className="m-0 text-[13.5px] leading-8">{post.autopsy || "برای این پست نکته‌ی خاصی پیدا نشد."}</p>
      </div>

      {reel && post.skip_rate != null ? (
        <>
          <SectionTitle>رد شدن در ثانیه‌ی اول</SectionTitle>
          <div className="relative mb-1 mt-2 h-3 rounded-full bg-[var(--chart-track)]">
            <i className="absolute inset-y-0 start-0 rounded-full" style={{ width: `${post.skip_rate}%`, background: skipColor }} />
            <u className="absolute -bottom-1 -top-1 w-0.5 bg-[var(--text)]" style={{ insetInlineStart: `${post.skip_target}%` }} />
          </div>
          <div className={`flex justify-between text-[11px] ${FAINT}`}>
            <span>{percent(post.skip_rate)} رد کردند</span>
            <span>هدف: زیر {percent(post.skip_target)}</span>
          </div>
        </>
      ) : null}

      <SectionTitle>شاخص‌ها</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        <Metric label="بازدید" value={compact(post.views)} />
        <Metric label="Reach" value={compact(post.reach)} />
        <Metric label="نرخ تعامل" value={percent(post.er, 2)} />
        <Metric label="لایک" value={fa(post.likes)} />
        <Metric label="کامنت" value={fa(post.comments)} note={`میانه‌ی پیج ${fa(post.page_medians.comments)}`} />
        <Metric label="ارسال" value={fa(post.shares)} note={`میانه‌ی پیج ${fa(post.page_medians.shares)}`} />
        <Metric label="سیو" value={fa(post.saves)} note={`میانه‌ی پیج ${fa(post.page_medians.saves)}`} />
        <Metric label="فالوی جدید" value={fa(post.follows)} />
        <Metric label="بازدید پروفایل" value={fa(post.profile_views)} />
        {reel && post.avg_watch_ms ? <Metric label="میانگین تماشا" value={`${fa(post.avg_watch_ms / 1000, 1)} ثانیه`} /> : null}
        {post.duration_s ? <Metric label="طول ویدیو" value={`${fa(post.duration_s)} ثانیه`} /> : null}
      </div>

      <SectionTitle>رشد بازدید در روزهای اول</SectionTitle>
      <Growth post={post} />

      {post.products.length ? (
        <>
          <SectionTitle note="سهم بازدید: اولی ۲، بقیه ۱">محصولات این پست</SectionTitle>
          <div className={`${CARD} px-3.5 py-1`}>
            {post.products.map((product) => (
              <button
                key={product.position}
                type="button"
                onClick={() => onOpenProduct(product.code)}
                className="grid w-full cursor-pointer grid-cols-[56px_1fr_auto] items-center gap-3 border-t border-line py-3 text-right first:border-t-0"
              >
                <ProductImage src={product.thumb} />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-bold leading-6">
                    {product.matched ? product.title : product.line || `کد ${code(product.code)}`}
                    {!product.matched ? <span className="ms-1 rounded-md border border-amber-500/40 px-1.5 text-[10px] text-[var(--warning)]">تطبیق‌نخورده</span> : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-muted">
                    <span>کد {code(product.code)}</span>
                    {product.position === 0 ? <span className="rounded-md border border-line bg-elevated px-1.5 text-[10px]">محصول اصلی</span> : null}
                    {product.price ? <span>{fa(product.price)} تومان</span> : null}
                  </div>
                </div>
                <div className="text-left text-[15px] font-extrabold">
                  {compact(product.weighted_views)}
                  <small className={`block text-[10px] font-normal ${FAINT}`}>سهم {percent(product.share * 100)}</small>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function ProductSheetBody({ productCode, onOpenPost }: { productCode: string; onOpenPost: (id: number) => void }) {
  const { data, loading, error } = useApi(() => pulseService.product(productCode), [productCode]);
  if (error) return <div className="py-8 text-center text-[13px] text-muted">محصول بارگذاری نشد.</div>;
  if (loading || !data) return <div className="h-72 animate-pulse rounded-[18px] bg-elevated" />;
  return (
    <div>
      <div className="grid grid-cols-[80px_1fr] items-center gap-3.5">
        <ProductImage src={data.thumb} className="h-[100px] w-20" />
        <div>
          <div className="text-[15px] font-extrabold">{data.title ?? data.line}</div>
          <div className="mt-1 text-xs text-muted">
            کد {code(data.code)}
            {data.price ? ` · ${fa(data.price)} تومان` : ""}
            {!data.matched ? " · هنوز در Elinor IQ نیست" : ""}
          </div>
          <div className="mt-1.5 text-xs">
            {fa(data.posts)} پست · {compact(data.weighted_views)} بازدید سهم‌دار · {fa(data.weighted_saves)} سیو
          </div>
        </div>
      </div>
      <SectionTitle>پست‌های این محصول</SectionTitle>
      <PostGrid posts={data.post_cards} onOpen={onOpenPost} label={(post) => (post.primary ? "اصلی" : "همراه")} />
    </div>
  );
}
