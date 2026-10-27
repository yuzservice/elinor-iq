import { Link, useSearchParams } from "react-router-dom";
import { IconSettings } from "../components/Icons";
import { EmptyState, Skeleton } from "../components/Table";
import { CustomerCampaignsPanel } from "../features/customers/CustomerCampaignsPanel";
import { TierRulesModal } from "../features/customers/TierRulesModal";
import { TierBadge } from "../features/customers/tierDisplay";
import { useAuth } from "../hooks/useAuth";
import { useTiers } from "../hooks/useTiers";
import { formatNumber } from "../lib/format";

type ClubTab = "tiers" | "campaigns";

export function ClubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab: ClubTab = searchParams.get("tab") === "campaigns" ? "campaigns" : "tiers";
  const { user } = useAuth();
  const canManage = Boolean(user?.can_manage_platform);
  const tierRulesOpen = canManage && searchParams.get("tierRules") === "1";

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
        <div className="flex items-center gap-1.5 rounded-2xl border border-line bg-elevated p-1 text-xs" role="tablist">
          {(
            [
              { id: "tiers", label: "سطح‌ها", icon: "🏅" },
              { id: "campaigns", label: "کمپین‌ها", icon: "🎁" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={currentTab === tab.id}
              onClick={() => setParam("tab", tab.id === "tiers" ? null : tab.id)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-1.5 font-bold transition-all ${
                currentTab === tab.id ? "border border-line/60 bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setParam("tierRules", "1")}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-line bg-elevated px-3 py-1.5 text-xs font-bold text-muted transition-colors hover:text-ink"
          >
            <IconSettings />
            <span>قوانین سطح‌بندی</span>
          </button>
        ) : null}
      </div>

      {tierRulesOpen ? <TierRulesModal onClose={() => setParam("tierRules", null)} /> : null}

      {currentTab === "campaigns" ? <CustomerCampaignsPanel /> : <TierPopulation />}
    </div>
  );
}

function TierPopulation() {
  const { tiers, groups, loading } = useTiers();
  if (loading) return <Skeleton className="h-48" />;
  if (!tiers.length) return <EmptyState title="سطح فعالی تعریف نشده است." />;
  const total = tiers.reduce((sum, tier) => sum + tier.customers, 0);
  return (
    <div className="bento-card glass-rim space-y-3 p-4 shadow-soft sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">جمعیت سطح‌های وفاداری</h2>
        <p className="text-xs text-faint">سطح ذخیره‌شده هر مشتری؛ با به‌روزرسانی روزانه سطح‌ها تغییر می‌کند.</p>
      </div>
      {groups.map((group) => (
        <div key={group.channel ?? "general"} className="space-y-1">
          {group.channel_label ? (
            <h3 className="pt-2 text-xs font-bold text-muted">
              {group.channel_label} · {formatNumber(group.tiers.reduce((sum, tier) => sum + tier.customers, 0))} مشتری
            </h3>
          ) : null}
          <ul className="divide-y divide-line">
            {group.tiers.map((tier) => (
              <li key={tier.code} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="w-6 text-center text-xs text-muted tabular">{formatNumber(tier.priority)}</span>
                <TierBadge code={tier.code} label={tier.title} channelLabel={group.channel_label} />
                <span className="min-w-0 flex-1 text-xs text-muted">{tier.summary}</span>
                <div className="flex w-full items-center gap-2 sm:w-56">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hover">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${total ? (tier.customers / total) * 100 : 0}%` }} />
                  </div>
                  <span className="w-16 text-left text-xs font-bold text-ink tabular">{formatNumber(tier.customers)}</span>
                </div>
                <Link
                  to={`/customers?tab=list&tier=${encodeURIComponent(tier.code)}`}
                  className="rounded-xl bg-accent/10 px-2.5 py-1 text-[11px] font-bold text-accent transition-colors hover:bg-accent hover:text-on-accent"
                >
                  مشاهده مشتریان
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
