import { useSearchParams } from "react-router-dom";
import { PageHeader, Tabs } from "../components/ui";
import { CustomerReportsPanel } from "../features/customers/CustomerReportsPanel";
import { CustomerListPanel } from "../features/customers/CustomerListPanel";

export function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "reports" ? "reports" : "list";
  const population = params.get("population") || "all";

  return (
    <div>
      <PageHeader
        title="مشتریان"
        description="لیست همه مشتریان ثبت‌شده؛ خریدار بودن جدا از ثبت‌نام است و مشتری بدون نام ساخته نمی‌شود."
      />
      <Tabs
        items={[
          { key: "list", label: "لیست مشتریان" },
          { key: "reports", label: "گزارش مشتریان" },
        ]}
        value={tab}
        onChange={(key) => {
          const next = new URLSearchParams(params);
          next.set("tab", key);
          setParams(next);
        }}
      />
      <div className="mt-8">
        {tab === "reports" ? (
          <CustomerReportsPanel />
        ) : (
          <CustomerListPanel population={population} />
        )}
      </div>
    </div>
  );
}
