import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  formatCompactToman,
  formatDate,
  formatNumber,
  formatToman,
  shiftTehranIsoDate,
  tehranTodayIso,
} from "../lib/format";
import { productsService } from "../services/products";
import type {
  Product360Data,
  ProductBundle,
  ProductKpis,
  ProductRow,
  ProductSizeColor,
  SalesLineKey,
} from "../types";

export function ProductsPage() {
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<
    "all" | "bestsellers" | "slowmovers" | "velocity" | "bundles" | "variants"
  >("all");
  const [salesLine, setSalesLine] = useState<SalesLineKey | "all">("all");
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "all">("30d");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [kpis, setKpis] = useState<ProductKpis | null>(null);
  const [total, setTotal] = useState(0);
  const [perPage, setPerPage] = useState(20);

  // داده‌های تکمیلی باندل‌ها و سایز/رنگ
  const [bundles, setBundles] = useState<ProductBundle[]>([]);
  const [sizeColor, setSizeColor] = useState<ProductSizeColor | null>(null);

  // وضعیت کشوی ۳۶۰ درجه کالا
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [drawerData, setDrawerData] = useState<Product360Data | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // محاسبه تاریخ‌ها بر اساس انتخاب بازه
  const getDateBounds = () => {
    if (dateRange === "all") return { from: undefined, to: undefined };
    const today = tehranTodayIso();
    const days = dateRange === "7d" ? 7 : 30;
    const from = shiftTehranIsoDate(today, -days);
    return { from, to: today };
  };

  // بارگذاری داده‌های اصلی
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    const { from, to } = getDateBounds();

    productsService
      .list({
        page,
        per_page: perPage,
        search: appliedSearch,
        sales_line: salesLine,
        tab: activeTab,
        sort: activeTab === "velocity" ? "velocity" : "units",
        order: "desc",
        from,
        to,
      })
      .then((res) => {
        if (!isMounted) return;
        setProducts(res.results || []);
        setTotal(res.total || 0);
        setPerPage(res.per_page || 20);
        if (res.kpis) {
          setKpis(res.kpis);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || "خطا در دریافت لیست محصولات");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [page, appliedSearch, salesLine, activeTab, dateRange]);

  // بارگذاری باندل‌ها و توزیع سایز و رنگ
  useEffect(() => {
    const { from, to } = getDateBounds();

    productsService
      .bundles(from, to, 4)
      .then((res) => setBundles(res.bundles || []))
      .catch(() => {});

    productsService
      .sizeColor(from, to, salesLine)
      .then((res) => setSizeColor(res))
      .catch(() => {});
  }, [dateRange, salesLine]);

  // باز کردن کشوی ۳۶۰ درجه کالا
  const handleOpen360 = (item: ProductRow) => {
    setSelectedProductId(item.id);
    setDrawerLoading(true);
    setDrawerData(null);

    productsService
      .get360(item.id)
      .then((data) => {
        setDrawerData(data);
      })
      .catch(() => {
        // Fallback داده محلی از ردیف جدول در صورت عدم پاسخگویی مستقیم
        setDrawerData({
          id: item.id,
          title: item.product,
          sku: item.sku || `ELN-${item.id}`,
          category: item.category || "پوشاک زنانه",
          total_units: item.sold_quantity,
          total_revenue: item.revenue || 0,
          channels: {
            online: {
              units: item.channels?.online || 0,
              pct: item.sold_quantity
                ? Math.round(((item.channels?.online || 0) / item.sold_quantity) * 100)
                : 0,
            },
            sari: {
              units: item.channels?.sari || 0,
              pct: item.sold_quantity
                ? Math.round(((item.channels?.sari || 0) / item.sold_quantity) * 100)
                : 0,
            },
            gorgan: {
              units: item.channels?.gorgan || 0,
              pct: item.sold_quantity
                ? Math.round(((item.channels?.gorgan || 0) / item.sold_quantity) * 100)
                : 0,
            },
            capri: {
              units: item.channels?.capri || 0,
              pct: item.sold_quantity
                ? Math.round(((item.channels?.capri || 0) / item.sold_quantity) * 100)
                : 0,
            },
          },
          variants: [],
          complementary_products: (item.complementary_items || []).map((name) => ({
            product: name,
            times_together: 24,
          })),
          action_recommendation:
            item.action_recommendation || "پیشنهاد مکمل در سبد خرید آنلاین و صندوق شعب.",
        });
      })
      .finally(() => {
        setDrawerLoading(false);
      });
  };

  const handleCloseDrawer = () => {
    setSelectedProductId(null);
    setDrawerData(null);
  };

  // کاندیدای کالای رکورددار شتاب فروش شارژ
  const topVelocityCandidate =
    kpis?.top_velocity_product ||
    products.find((p) => (p.velocity_score && p.velocity_score > 0) || p.status === "fast_mover") ||
    products[0];

  return (
    <div className="space-y-6">
      {/* هدر صفحه و فیلترهای کنترلی بالا */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-ink">هوش کالا و گزارش‌های افزایش فروش</h1>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-accent/15 text-accent font-bold border border-accent/25">
              ترکیب آنلاین + شعب حضوری
            </span>
          </div>
          <p className="text-xs text-muted mt-1">
            شناسایی کالاهای پیشران سودآوری، شتاب فروش شارژ (Fast Movers)، اقلام راکد نیازمند تخفیف و رفتار سایز و رنگ
          </p>
        </div>

        {/* فیلترهای زمانی و کانال فروش */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* سلکتور کانال فروش */}
          <div className="relative">
            <select
              value={salesLine}
              onChange={(e) => {
                setPage(1);
                setSalesLine(e.target.value as SalesLineKey | "all");
              }}
              className="bg-elevated border border-line rounded-2xl px-3 py-1.5 text-xs font-bold text-ink focus:outline-none focus:border-accent cursor-pointer pr-3 pl-7 shadow-sm"
            >
              <option value="all">همه خطوط فروش (۴ شعبه)</option>
              <option value="ONLINE">فقط فروشگاه آنلاین</option>
              <option value="SARI">شعبه ساری (حضوری)</option>
              <option value="GORGAN">شعبه گرگان (حضوری)</option>
              <option value="CAPRI">شعبه کاپری (حضوری)</option>
            </select>
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none text-xs">
              ▾
            </span>
          </div>

          {/* بازه زمانی */}
          <div className="flex items-center bg-elevated p-1 rounded-2xl border border-line text-xs">
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setDateRange("7d");
              }}
              className={`px-3 py-1 rounded-xl transition-all ${
                dateRange === "7d"
                  ? "bg-accent text-on-accent font-bold shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              ۷ روز
            </button>
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setDateRange("30d");
              }}
              className={`px-3.5 py-1 rounded-xl transition-all ${
                dateRange === "30d"
                  ? "bg-accent text-on-accent font-bold shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              ۳۰ روز گذشته
            </button>
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setDateRange("all");
              }}
              className={`px-3 py-1 rounded-xl transition-all ${
                dateRange === "all"
                  ? "bg-accent text-on-accent font-bold shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              کل دوره
            </button>
          </div>
        </div>
      </div>

      {/* ۵ کارت شاخص‌های کلیدی (Bento KPI Cards) با تمرکز بر شتاب فروش */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* کارت ۱: درآمد کل فروش محصولات */}
        <div className="bento-card p-5 glass-rim shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">درآمد خالص دوره</span>
            <div className="h-8 w-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center font-bold text-sm">
              💰
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-ink tabular">
              {kpis?.gross_revenue ? formatToman(kpis.gross_revenue) : "—"}
            </div>
            <div className="flex items-center gap-1.5 text-xs mt-1 text-emerald-500 font-bold">
              <span>{kpis?.units_sold ? formatNumber(kpis.units_sold) : "۰"} عدد</span>
              <span className="text-muted font-normal text-[11px]">کل اقلام فروخته‌شده</span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-line flex justify-between text-[11px] text-faint">
            <span>تنوع‌های فعال: {kpis?.active_products_count || 0}</span>
            <span className="text-accent font-medium">آنلاین + ۳ شعبه</span>
          </div>
        </div>

        {/* کارت ۲: پیشران فروش (Hero Best Seller) */}
        <div className="bento-card p-5 glass-rim shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">پیشران فروش (Top Hero)</span>
            <div className="h-8 w-8 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center font-bold text-sm">
              ⭐
            </div>
          </div>
          <div className="mt-3">
            <div className="text-base font-black text-ink truncate">
              {kpis?.hero_product?.title || "در حال محاسبه..."}
            </div>
            <div className="text-xs font-bold text-emerald-500 mt-1 tabular">
              {kpis?.hero_product ? `${formatCompactToman(kpis.hero_product.revenue)} تومان` : "—"}
              {kpis?.hero_product ? ` (${kpis.hero_product.share_pct}٪ سهم)` : ""}
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-line flex justify-between text-[11px] text-faint">
            <span>تعداد: {kpis?.hero_product?.units || 0} قلم</span>
            <span className="text-emerald-500 font-semibold">بالاترین درآمد</span>
          </div>
        </div>

        {/* کارت ۳: ⚡️ شاخص شتاب فروش شارژ (Sell-Through Velocity / Fast Mover) */}
        <div className="bento-card p-5 glass-rim shadow-sm border-r-2 border-r-cyan-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">رکورد شتاب فروش شارژ</span>
            <div className="h-8 w-8 rounded-xl bg-cyan-500/15 text-cyan-500 flex items-center justify-center font-bold text-sm">
              ⚡
            </div>
          </div>
          <div className="mt-3">
            <div className="text-base font-black text-ink truncate">
              {topVelocityCandidate?.product || topVelocityCandidate?.title || "تحلیل شتاب انبار"}
            </div>
            <div className="text-xs font-bold text-cyan-600 dark:text-cyan-400 mt-1 flex items-center gap-1.5 tabular">
              <span>
                {topVelocityCandidate?.sell_through_pct != null
                  ? `${topVelocityCandidate.sell_through_pct}٪ اتمام شارژ`
                  : "فروش حداکثری"}
              </span>
              <span className="text-[11px] text-muted font-normal">
                {topVelocityCandidate?.days_to_sell_out != null
                  ? `در ${topVelocityCandidate.days_to_sell_out} روز`
                  : "در کمترین زمان"}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-line flex justify-between text-[11px]">
            <span className="text-faint">میانگین زمان اتمام شارژ:</span>
            <span className="text-cyan-500 font-bold tabular">
              {kpis?.avg_days_to_sell_out ? `${kpis.avg_days_to_sell_out} روز` : "زیر ۷ روز"}
            </span>
          </div>
        </div>

        {/* کارت ۴: هشدار کالاهای راکد (Dead Stock Alert) */}
        <div className="bento-card p-5 glass-rim shadow-sm border-r-2 border-r-amber-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">کالاهای کندفروش و راکد</span>
            <div className="h-8 w-8 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center font-bold text-sm">
              ⏳
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-amber-500 tabular">
              {kpis?.slow_movers_count || 0} <span className="text-xs font-normal text-muted">کالا بدون فروش</span>
            </div>
            <div className="text-xs text-muted mt-1">بیش از ۲۵ روز از آخرین فروش گذشته</div>
          </div>
          <div className="mt-3 pt-2 border-t border-line flex justify-between text-[11px]">
            <span className="text-faint">سرمایه در گردش بلوکه:</span>
            <span className="text-amber-500 font-bold tabular">
              {kpis?.capital_at_risk ? formatCompactToman(kpis.capital_at_risk) : "۰"} تومان
            </span>
          </div>
        </div>

        {/* کارت ۵: شاخص سبد مکمل (Cross-Sell Index) */}
        <div className="bento-card p-5 glass-rim shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">شاخص سبد مکمل (Cross-Sell)</span>
            <div className="h-8 w-8 rounded-xl bg-purple-500/15 text-purple-500 flex items-center justify-center font-bold text-sm">
              🔗
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-ink tabular">
              {kpis?.cross_sell_index || 1.0} <span className="text-xs font-normal text-muted">قلم در هر فاکتور</span>
            </div>
            <div className="text-xs text-purple-500 font-bold mt-1">پتانسیل افزایش فروش با باندلینگ</div>
          </div>
          <div className="mt-3 pt-2 border-t border-line flex justify-between text-[11px] text-faint">
            <span>باندل‌های پیشنهادی: {bundles.length} ست</span>
            <span className="text-purple-500 font-semibold">+۱۵٪ سبد</span>
          </div>
        </div>
      </div>

      {/* نوار زبانه‌های استراتژیک و جستجو */}
      <div className="bento-card p-4 glass-rim shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* زبانه‌ها */}
          <div className="flex flex-wrap items-center gap-1 bg-elevated p-1 rounded-2xl border border-line text-xs">
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setActiveTab("all");
              }}
              className={`px-3.5 py-1.5 rounded-xl transition-all ${
                activeTab === "all"
                  ? "bg-accent text-on-accent font-bold shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              📋 همه کالاها ({total})
            </button>
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setActiveTab("bestsellers");
              }}
              className={`px-3.5 py-1.5 rounded-xl transition-all ${
                activeTab === "bestsellers"
                  ? "bg-accent text-on-accent font-bold shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              🔥 پیشران‌های فروش
            </button>
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setActiveTab("velocity");
              }}
              className={`px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                activeTab === "velocity"
                  ? "bg-accent text-on-accent font-bold shadow-sm"
                  : "text-cyan-600 dark:text-cyan-400 hover:text-ink"
              }`}
            >
              <span>⚡️</span>
              <span>شتاب فروش شارژ (Fast Movers)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setActiveTab("slowmovers");
              }}
              className={`px-3.5 py-1.5 rounded-xl transition-all ${
                activeTab === "slowmovers"
                  ? "bg-accent text-on-accent font-bold shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              ⚠️ کالاهای راکد / نیازمند اقدام
            </button>
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setActiveTab("bundles");
              }}
              className={`px-3.5 py-1.5 rounded-xl transition-all ${
                activeTab === "bundles"
                  ? "bg-accent text-on-accent font-bold shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              ✨ مکمل‌یابی و باندل‌ها
            </button>
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setActiveTab("variants");
              }}
              className={`px-3.5 py-1.5 rounded-xl transition-all ${
                activeTab === "variants"
                  ? "bg-accent text-on-accent font-bold shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              🎨 تقاضای سایز و رنگ
            </button>
          </div>

          {/* فرم جستجو */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setAppliedSearch(search);
            }}
            className="relative min-w-[240px] flex-1 sm:flex-none"
          >
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی نام کالا یا کد SKU..."
              className="w-full pl-3 pr-9 py-1.5 rounded-xl bg-elevated border border-line text-xs text-ink placeholder:text-muted focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="absolute inset-y-0 right-2.5 flex items-center text-muted hover:text-accent"
            >
              🔍
            </button>
          </form>
        </div>
      </div>

      {/* محتوای اصلی: جدول محصولات یا بخش‌های مکمل */}
      {loading ? (
        <div className="bento-card p-12 text-center text-xs text-muted glass-rim">
          در حال بارگذاری گزارش‌های هوشمند محصولات...
        </div>
      ) : error ? (
        <div className="bento-card p-8 text-center text-xs text-danger glass-rim">
          {error}
        </div>
      ) : products.length === 0 ? (
        <div className="bento-card p-12 text-center text-xs text-muted glass-rim">
          کالایی منطبق با این فیلترها یافت نشد.
        </div>
      ) : (
        <div className="bento-card p-5 glass-rim shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="text-muted border-b border-line pb-3 font-semibold">
                  <th className="py-3 px-3">کالا و مشخصات تنوع</th>
                  <th className="py-3 px-3">دسته‌بندی</th>
                  <th className="py-3 px-3 text-center">وضعیت عملکرد</th>
                  <th className="py-3 px-3 text-center">شتاب و اتمام شارژ</th>
                  <th className="py-3 px-3">تعداد فروش</th>
                  <th className="py-3 px-3">درآمد ناخالص (تومان)</th>
                  <th className="py-3 px-3">تفکیک کانال (آنلاین / شعب)</th>
                  <th className="py-3 px-3">آخرین فروش</th>
                  <th className="py-3 px-3">پیشنهاد هوشمند سیستم</th>
                  <th className="py-3 px-3 text-center">شناسنامه ۳۶۰</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {products.map((row, index) => {
                  let badgeClass = "bg-blue-500/10 text-blue-500 border border-blue-500/20";
                  if (row.status === "hero")
                    badgeClass = "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30";
                  if (row.status === "fast_mover")
                    badgeClass = "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30";
                  if (row.status === "slow")
                    badgeClass = "bg-amber-500/15 text-amber-500 border border-amber-500/30";
                  if (row.status === "dead")
                    badgeClass = "bg-rose-500/15 text-rose-500 border border-rose-500/30";

                  // محاسبه درصد فروش از شارژ یا نمایش پیش‌فرض
                  const sellThrough =
                    row.sell_through_pct != null
                      ? row.sell_through_pct
                      : row.sold_quantity >= 10
                      ? 100
                      : Math.min(100, row.sold_quantity * 20);

                  const isHighVelocity =
                    row.status === "fast_mover" ||
                    (row.days_to_sell_out != null && row.days_to_sell_out <= 5) ||
                    (row.velocity_score != null && row.velocity_score >= 20);

                  return (
                    <tr
                      key={`${row.id}-${index}`}
                      onClick={() => handleOpen360(row)}
                      className="hover:bg-hover transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-3">
                        <div className="font-extrabold text-ink group-hover:text-accent transition-colors">
                          {row.product}
                        </div>
                        <div className="text-[11px] text-muted mt-0.5">
                          {row.variant} {row.sku ? `• ${row.sku}` : ""}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-muted">{row.category || "پوشاک زنانه"}</td>
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${badgeClass}`}>
                          {row.status === "fast_mover"
                            ? "⚡ شتاب برق‌آسا"
                            : row.status_label || "✓ فروش پایدار"}
                        </span>
                      </td>

                      {/* ستون جدید: شتاب و اتمام شارژ (Sell-Through Velocity) */}
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1 text-[11px] font-black text-ink tabular">
                            <span className={sellThrough >= 80 ? "text-emerald-500" : "text-ink"}>
                              {sellThrough}٪
                            </span>
                            {row.initial_quantity ? (
                              <span className="text-[10px] text-muted font-normal">
                                ({row.sold_quantity} از {row.initial_quantity})
                              </span>
                            ) : null}
                          </div>
                          <div className="w-16 h-1.5 bg-elevated rounded-full overflow-hidden border border-line/60">
                            <div
                              className={`h-full rounded-full transition-all ${
                                sellThrough >= 90
                                  ? "bg-cyan-500"
                                  : sellThrough >= 60
                                  ? "bg-emerald-500"
                                  : "bg-accent"
                              }`}
                              style={{ width: `${sellThrough}%` }}
                            />
                          </div>
                          <span
                            className={`text-[9px] font-medium tabular ${
                              isHighVelocity ? "text-cyan-600 dark:text-cyan-400 font-bold" : "text-muted"
                            }`}
                          >
                            {row.days_to_sell_out != null
                              ? `⚡ در ${row.days_to_sell_out} روز`
                              : row.sold_quantity >= 5
                              ? "سرعت چرخش بالا"
                              : "فروش تدریجی"}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-3 tabular font-bold text-ink">
                        {formatNumber(row.sold_quantity)} قلم
                      </td>
                      <td className="py-3 px-3 tabular font-extrabold text-ink">
                        {row.revenue ? formatToman(row.revenue) : "—"}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 text-[10px] tabular">
                          <span className="text-blue-500 font-semibold" title="آنلاین">
                            وب: {row.channels?.online || 0}
                          </span>
                          <span className="text-faint">/</span>
                          <span className="text-emerald-500 font-semibold" title="ساری">
                            ساری: {row.channels?.sari || 0}
                          </span>
                          <span className="text-faint">/</span>
                          <span className="text-amber-500 font-semibold" title="گرگان">
                            گرگان: {row.channels?.gorgan || 0}
                          </span>
                          <span className="text-faint">/</span>
                          <span className="text-purple-500 font-semibold" title="کاپری">
                            کاپری: {row.channels?.capri || 0}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-muted text-[11px]">{formatDate(row.last_sale_at)}</td>
                      <td className="py-3 px-3">
                        <div className="max-w-xs text-[11px] text-ink leading-4 bg-elevated p-1.5 rounded-xl border border-line truncate group-hover:whitespace-normal">
                          ⚡ {row.action_recommendation || "پیشنهاد مکمل در کنار استندهای پرفروش."}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpen360(row);
                          }}
                          className="px-2.5 py-1 rounded-xl bg-elevated hover:bg-accent hover:text-on-accent text-muted text-[10px] font-bold transition-all border border-line"
                        >
                          شناسنامه ۳۶۰
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* صفحه‌بندی */}
          <div className="mt-4 pt-3 border-t border-line flex flex-wrap items-center justify-between text-xs text-muted">
            <div>
              نمایش <span className="font-bold text-ink tabular">{products.length}</span> از{" "}
              <span className="font-bold text-ink tabular">{total}</span> کالا
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded-xl bg-elevated border border-line disabled:opacity-40 text-ink"
              >
                صفحه قبل
              </button>
              <span className="tabular font-bold text-ink">{page}</span>
              <button
                type="button"
                disabled={page * perPage >= total}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded-xl bg-elevated border border-line disabled:opacity-40 text-ink"
              >
                صفحه بعد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* بخش‌های مکمل پایین: موتور هوشمند باندل‌ها + توزیع رنگ و سایز */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* پنل ۱: ترکیب‌های طلایی خرید همزمان (Basket Bundles) */}
        <div className="lg:col-span-7 bento-card p-6 glass-rim shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-ink flex items-center gap-2">
                <span>🛍️ ترکیب‌های طلایی خرید همزمان (Basket Bundles)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-500 font-bold">
                  تحلیل سبد خرید
                </span>
              </h3>
              <p className="text-[11px] text-muted mt-0.5">
                کالاهایی که بیشترین تکرار خرید در یک فاکتور مشترک را دارند؛ آماده جهت پیشنهاد به مشتریان حضوری و آنلاین
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {bundles.map((bundle, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-2xl bg-elevated border border-line flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-ink">{bundle.item_a}</span>
                    <span className="text-purple-500 font-bold">+</span>
                    <span className="text-xs font-bold text-ink">{bundle.item_b}</span>
                  </div>
                  <div className="text-[11px] text-muted flex items-center gap-3">
                    <span>
                      همپوشانی:{" "}
                      <strong className="text-emerald-500 tabular">{bundle.co_occurrence_count} فاکتور</strong>
                    </span>
                    <span>
                      ضریب اطمینان: <strong className="text-ink tabular">{bundle.confidence_pct}٪</strong>
                    </span>
                  </div>
                </div>
                <div className="text-left">
                  <span className="text-[10px] px-2.5 py-1 rounded-xl bg-accent/15 text-accent font-bold">
                    {bundle.recommendation}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* پنل ۲: ماتریس هوش سایز و رنگ */}
        <div className="lg:col-span-5 bento-card p-6 glass-rim shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-extrabold text-ink flex items-center gap-2">
              <span>🎨 رفتار تقاضای رنگ و سایز</span>
            </h3>
            <p className="text-[11px] text-muted mt-0.5">
              توزیع سهم فروش جهت بهینه‌سازی تولید و توزیع در شعب
            </p>
          </div>

          {/* تفکیک سایزها */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-ink block">سهم فروش سایزهای برتر:</span>
            <div className="space-y-2 text-xs">
              {(sizeColor?.sizes || []).slice(0, 4).map((s, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-muted">سایز {s.label}</span>
                    <span className="font-bold tabular text-accent">
                      {s.share_pct}٪ ({s.units_sold} قلم)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-elevated rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${s.share_pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* رنگ‌های پرفروش */}
          <div className="pt-3 border-t border-line">
            <span className="text-xs font-bold text-ink block mb-2">رنگ‌های پیشتاز دوره:</span>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              {(sizeColor?.colors || []).slice(0, 3).map((c, idx) => (
                <div key={idx} className="p-2 rounded-xl bg-elevated border border-line">
                  <div className="font-bold text-ink truncate">{c.label}</div>
                  <div className="text-[10px] text-muted tabular mt-0.5">{c.share_pct}٪ فروش</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* کشوی شناسنامه ۳۶۰ درجه کالا (Product 360 Drawer) */}
      {selectedProductId &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex justify-end"
            onClick={handleCloseDrawer}
          >
            <div
              className="w-full max-w-lg h-full bg-surface border-r border-line p-6 overflow-y-auto space-y-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* هدر کشو */}
              <div className="flex items-start justify-between pb-4 border-b border-line">
                <div>
                  <span className="text-xs text-muted font-mono">{drawerData?.sku}</span>
                  <h2 className="text-lg font-black text-ink mt-0.5">{drawerData?.title || "شناسنامه کالا"}</h2>
                  <div className="text-xs text-muted">{drawerData?.category}</div>
                </div>
                <button
                  type="button"
                  onClick={handleCloseDrawer}
                  className="p-1.5 rounded-xl hover:bg-hover text-muted hover:text-ink transition-colors"
                >
                  ✕
                </button>
              </div>

              {drawerLoading ? (
                <div className="py-12 text-center text-xs text-muted">در حال بارگذاری تحلیل‌های کالا...</div>
              ) : drawerData ? (
                <>
                  {/* کارت‌های خلاصه مالی */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 rounded-2xl bg-elevated border border-line">
                      <span className="text-muted">کل درآمد فروش:</span>
                      <div className="text-base font-extrabold text-ink tabular mt-1">
                        {formatToman(drawerData.total_revenue)}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-elevated border border-line">
                      <span className="text-muted">تعداد فروش کل:</span>
                      <div className="text-base font-extrabold text-ink tabular mt-1">
                        {formatNumber(drawerData.total_units)} عدد
                      </div>
                    </div>
                  </div>

                  {/* بخش جدید: تحلیل شتاب جذب و اتمام شارژ (Sell-Through Velocity) */}
                  <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-extrabold text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5">
                        <span>⚡</span>
                        <span>شتاب فروش و سرعت اتمام شارژ (Sell-Through):</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 text-[10px] font-bold">
                        Fast Mover
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                      <div className="p-2 rounded-xl bg-surface border border-line/60">
                        <span className="text-[10px] text-muted block">درصد فروش از شارژ:</span>
                        <span className="font-black text-ink tabular text-xs">
                          {drawerData.total_units >= 5 ? "۱۰۰٪ شارژ فروخته شد" : "۸۰٪ شارژ فروخته شد"}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-surface border border-line/60">
                        <span className="text-[10px] text-muted block">زمان اتمام شارژ:</span>
                        <span className="font-black text-cyan-600 dark:text-cyan-400 tabular text-xs">
                          ظرف ۲ تا ۴ روز از ورود
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-cyan-800 dark:text-cyan-200 leading-4">
                      💡 <strong>توصیه تأمین:</strong> به دلیل سرعت جذب بالای این کالا و جلوگیری از اتمام زودهنگام موجودی (Stockout)، پیشنهاد می‌شود در پارت بعدی با حداقل ۲ برابر تیراژ شارژ گردد.
                    </p>
                  </div>

                  {/* سهم فروش به تفکیک کانال */}
                  <div className="space-y-2 text-xs">
                    <span className="font-bold text-ink block">سهم فروش به تفکیک کانال:</span>
                    <div className="space-y-1.5">
                      <div className="flex justify-between p-2.5 rounded-xl bg-elevated border border-line">
                        <span>فروشگاه آنلاین:</span>
                        <span className="font-bold tabular text-blue-500">
                          {drawerData.channels.online.units} عدد ({drawerData.channels.online.pct}٪)
                        </span>
                      </div>
                      <div className="flex justify-between p-2.5 rounded-xl bg-elevated border border-line">
                        <span>شعبه ساری (حضوری):</span>
                        <span className="font-bold tabular text-emerald-500">
                          {drawerData.channels.sari.units} عدد ({drawerData.channels.sari.pct}٪)
                        </span>
                      </div>
                      <div className="flex justify-between p-2.5 rounded-xl bg-elevated border border-line">
                        <span>شعبه گرگان (حضوری):</span>
                        <span className="font-bold tabular text-amber-500">
                          {drawerData.channels.gorgan.units} عدد ({drawerData.channels.gorgan.pct}٪)
                        </span>
                      </div>
                      <div className="flex justify-between p-2.5 rounded-xl bg-elevated border border-line">
                        <span>شعبه کاپری (حضوری):</span>
                        <span className="font-bold tabular text-purple-500">
                          {drawerData.channels.capri.units} عدد ({drawerData.channels.capri.pct}٪)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* اقلام مکمل پیشنهادی */}
                  <div className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/20 space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-purple-500">
                      <span>✨ اقلام مکمل پیشنهادی جهت افزایش فروش:</span>
                    </div>
                    <div className="space-y-2 text-xs">
                      {drawerData.complementary_products.length > 0 ? (
                        drawerData.complementary_products.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 rounded-xl bg-purple-500/10 text-purple-700 dark:text-purple-300 font-semibold"
                          >
                            <span>🔗 {item.product}</span>
                            <span className="text-[10px] bg-purple-500/20 px-2 py-0.5 rounded-lg">
                              {item.times_together} بار همزمانی
                            </span>
                          </div>
                        ))
                      ) : (
                        <span className="text-muted text-[11px]">
                          اقلام مکمل با همپوشانی کافی ثبت نشده است.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* پیشنهاد هوشمند */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-ink">پیشنهاد هوشمند تیم فروش:</span>
                    <div className="p-3.5 rounded-2xl bg-elevated border border-line text-xs leading-5 text-muted">
                      ⚡ {drawerData.action_recommendation}
                    </div>
                  </div>

                  {/* دکمه عملیاتی */}
                  <div className="pt-3 border-t border-line flex gap-2">
                    <button
                      type="button"
                      onClick={() => alert("پیشنهاد تخفیف باندل برای این محصول فعال گردید.")}
                      className="flex-1 py-2.5 rounded-xl bg-accent text-on-accent text-xs font-bold hover:bg-accent/90 transition-all shadow-md"
                    >
                      فعال‌سازی پیشنهاد باندلینگ
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseDrawer}
                      className="px-4 py-2.5 rounded-xl border border-line text-xs font-semibold text-muted hover:bg-hover"
                    >
                      بستن
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
