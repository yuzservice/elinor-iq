import { useState } from "react";
import { useApi } from "../../hooks/useApi";
import { pulseService } from "../../services/pulse";
import { code, compact, fa } from "./format";
import type { ProductRow } from "./types";
import { CARD, FAINT, ScoreBadge, SectionTitle } from "./ui";

const PAGE = 40;

export function ProductImage({ src, className = "h-[70px] w-14" }: { src: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className={`rounded-xl bg-elevated object-cover ${className}`} />
  ) : (
    <div className={`rounded-xl bg-elevated ${className}`} />
  );
}

function Row({ row, onOpen }: { row: ProductRow; onOpen: (code: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen(row.code)} className="grid w-full cursor-pointer grid-cols-[56px_1fr_auto] items-center gap-3 border-t border-line py-3 text-right first:border-t-0">
      <ProductImage src={row.thumb} />
      <div className="min-w-0">
        <div className="text-[13.5px] font-bold leading-6">{row.title}</div>
        <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-muted">
          <span>کد {code(row.code)}</span>
          {row.price ? <span>{fa(row.price)} ت</span> : null}
          <span>
            {fa(row.posts)} پست{row.primary_posts ? ` (${fa(row.primary_posts)} اصلی)` : ""}
          </span>
          {row.dupes && row.dupes > 1 ? <span className="rounded-md border border-line bg-elevated px-1.5 text-[10px]">{fa(row.dupes)} ردیف در سایت</span> : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <span>{fa(row.weighted_saves)} سیو</span>
          {row.best ? (
            <span>
              بهترین: <ScoreBadge score={row.best.score} />
            </span>
          ) : null}
        </div>
      </div>
      <div className="text-left text-[15px] font-extrabold">
        {compact(row.weighted_views)}
        <small className={`block text-[10px] font-normal ${FAINT}`}>بازدید سهم‌دار</small>
      </div>
    </button>
  );
}

export function ProductsTab({ onOpenProduct }: { onOpenProduct: (code: string) => void }) {
  const { data, loading, error } = useApi(() => pulseService.products(), []);
  const [shown, setShown] = useState(PAGE);
  if (error) return <div className="py-8 text-center text-[13px] text-muted">محصولات بارگذاری نشد.</div>;
  if (loading || !data) return <div className="h-64 animate-pulse rounded-[18px] bg-elevated" />;
  return (
    <div>
      <div className="rounded-xl border border-line bg-elevated px-3 py-2.5 text-[11.5px] leading-7 text-muted">
        بازدید سهم‌دار: در پست چندمحصولی، محصول اول ۲ سهم و بقیه هر کدام ۱ سهم می‌گیرند (قاعده‌ی موقت). موجودی نمایش داده نمی‌شود.
      </div>
      <SectionTitle note="مرتب بر اساس بازدید سهم‌دار">
        {fa(data.matched.length)} محصول در {fa(data.posts_with_codes)} پست
      </SectionTitle>
      <div className={`${CARD} px-3.5 py-1`}>
        {data.matched.slice(0, shown).map((row) => (
          <Row key={row.code} row={row} onOpen={onOpenProduct} />
        ))}
      </div>
      {data.matched.length > shown ? (
        <button type="button" onClick={() => setShown(shown + PAGE)} className="mt-2 w-full rounded-xl border border-line bg-surface py-2 text-xs text-muted">
          {fa(data.matched.length - shown)} محصول دیگر
        </button>
      ) : null}
      {data.unmatched.length ? (
        <>
          <SectionTitle note="بعد از هر سینک دوباره چک می‌شود">تطبیق‌نخورده</SectionTitle>
          <div className={`${CARD} px-3.5 py-1`}>
            {data.unmatched.map((row) => (
              <button key={row.code} type="button" onClick={() => onOpenProduct(row.code)} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 border-t border-line py-3 text-right first:border-t-0">
                <div>
                  <div className="text-[13.5px] font-bold leading-6">{row.line || `کد ${code(row.code)}`}</div>
                  <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-muted">
                    <span>کد {code(row.code)}</span>
                    <span>{fa(row.posts)} پست</span>
                    <span className="rounded-md border border-amber-500/40 px-1.5 text-[10px] text-[var(--warning)]">هنوز در Elinor IQ نیست</span>
                  </div>
                </div>
                <div className="text-left text-[15px] font-extrabold">{compact(row.weighted_views)}</div>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
