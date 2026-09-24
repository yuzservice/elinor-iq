import { useState } from "react";
import { PageHeader, Pagination, Panel, SearchInput } from "../components/ui";
import { EmptyState, ErrorState, Skeleton, Table, TableRow } from "../components/Table";
import { useApi } from "../hooks/useApi";
import { formatDate, formatNumber } from "../lib/format";
import { productsService } from "../services/products";

export function ProductsPage() {
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading, error } = useApi(() => productsService.list(page, applied), [page, applied]);

  return (
    <div>
      <PageHeader
        title="محصولات"
        description="کالاهایی که در فروش همگام‌سازی‌شده ظاهر شده‌اند. موجودی انبار در این نسخه نمایش داده نمی‌شود."
      />
      <form
        className="mb-6 max-w-sm"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setApplied(search);
        }}
      >
        <SearchInput
          value={search}
          placeholder="جستجوی محصول"
          onChange={(event) => setSearch(event.target.value)}
        />
      </form>
      {loading ? (
        <Skeleton className="h-80 rounded-[24px]" />
      ) : error || !data ? (
        <ErrorState />
      ) : data.results.length === 0 ? (
        <EmptyState
          title="اطلاعاتی برای این بازه پیدا نشد."
          body="پس از همگام‌سازی سفارش‌ها، کالاهای فروخته‌شده اینجا دیده می‌شوند."
        />
      ) : (
        <Panel>
          <Table columns={["محصول", "تنوع", "تعداد فروش", "تعداد سفارش", "آخرین فروش"]}>
            {data.results.map((row, index) => (
              <TableRow key={`${row.id}-${index}`}>
                <td className="px-3 py-3.5">{row.product}</td>
                <td className="px-3 py-3.5 text-muted">{row.variant}</td>
                <td className="px-3 py-3.5 tabular">{formatNumber(row.sold_quantity)}</td>
                <td className="px-3 py-3.5 tabular">{formatNumber(row.order_count)}</td>
                <td className="px-3 py-3.5 text-muted">{formatDate(row.last_sale_at)}</td>
              </TableRow>
            ))}
          </Table>
          <Pagination page={data.page} total={data.total} perPage={data.per_page} onChange={setPage} />
        </Panel>
      )}
    </div>
  );
}
