import { useSearchParams } from "react-router-dom";
import { IconSettings } from "../components/Icons";
import { TierRulesModal } from "../features/customers/TierRulesModal";
import { useAuth } from "../hooks/useAuth";
import { CustomerListPanel } from "../features/customers/CustomerListPanel";
import { CustomerCampaignsPanel } from "../features/customers/CustomerCampaignsPanel";

export function CustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") === "campaigns" ? "campaigns" : "list";
  const { user } = useAuth();
  const canManage = Boolean(user?.can_manage_platform);
  const tierRulesOpen = canManage && searchParams.get("tierRules") === "1";

  const setTierRulesOpen = (open: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (open) next.set("tierRules", "1");
    else next.delete("tierRules");
    setSearchParams(next, { replace: true });
  };

  const handleTabChange = (tab: "list" | "campaigns") => {
    const next = new URLSearchParams(searchParams);
    if (tab === "list") {
      next.delete("tab");
    } else {
      next.set("tab", tab);
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      {/* Top Segmented Tab Switcher */}
      <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
        <div className="flex items-center gap-1.5 bg-elevated p-1 rounded-2xl border border-line text-xs">
          <button
            type="button"
            onClick={() => handleTabChange("list")}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              currentTab === "list"
                ? "bg-surface text-ink shadow-xs border border-line/60"
                : "text-muted hover:text-ink"
            }`}
          >
            <span>👥</span>
            <span>باشگاه و لیست مشتریان</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("campaigns")}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              currentTab === "campaigns"
                ? "bg-accent text-on-accent shadow-xs"
                : "text-muted hover:text-ink"
            }`}
          >
            <span>🎁</span>
            <span>کمپین‌ها و هدایای کیف پول</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                currentTab === "campaigns"
                  ? "bg-white/20 text-white"
                  : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              }`}
            >
              جدید
            </span>
          </button>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setTierRulesOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-line bg-elevated px-3 py-1.5 text-xs font-bold text-muted transition-colors hover:text-ink"
          >
            <IconSettings />
            <span>قوانین سطح‌بندی</span>
          </button>
        ) : null}
      </div>

      {tierRulesOpen ? <TierRulesModal onClose={() => setTierRulesOpen(false)} /> : null}

      {/* Render Active Panel */}
      {currentTab === "campaigns" ? <CustomerCampaignsPanel /> : <CustomerListPanel />}
    </div>
  );
}
