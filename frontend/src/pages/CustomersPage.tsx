import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { CustomerListPanel } from "../features/customers/CustomerListPanel";
import { RfmReportPanel } from "../features/customers/RfmReportPanel";
import { filtersFromSearch } from "../features/customers/customerListFilters";
import { clubRedirect } from "../features/customers/rfmDisplay";

type CustomersTab = "rfm" | "list";

export function CustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const redirect = clubRedirect(location.search);
  if (redirect) return <Navigate to={redirect} replace />;

  const currentTab: CustomersTab = searchParams.get("tab") === "list" ? "list" : "rfm";

  const handleTabChange = (tab: CustomersTab) => {
    setSearchParams(tab === "list" ? { tab: "list" } : {}, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
        <div className="flex items-center gap-1.5 rounded-2xl border border-line bg-elevated p-1 text-xs" role="tablist">
          {(
            [
              { id: "rfm", label: "گزارش RFM", icon: "🎯" },
              { id: "list", label: "لیست مشتریان", icon: "👥" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={currentTab === tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-1.5 font-bold transition-all ${
                currentTab === tab.id ? "border border-line/60 bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {currentTab === "list" ? (
        <CustomerListPanel key={location.search} initialFilters={filtersFromSearch(location.search)} />
      ) : (
        <RfmReportPanel />
      )}
    </div>
  );
}
