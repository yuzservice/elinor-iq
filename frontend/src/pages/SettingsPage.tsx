import { useEffect, useState } from "react";
import { JalaliDateField } from "../components/JalaliDatePicker";
import { Button, Input, PageHeader, Panel, SectionHeader, ThemeSwitch } from "../components/ui";
import { ErrorState, Skeleton } from "../components/Table";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../hooks/useAuth";
import { formatDate, formatDateTime, formatNumber } from "../lib/format";
import { ApiError } from "../services/api";
import { systemService, type PanelAdmin } from "../services/system";
import type { SystemStatus } from "../types";

const STORE_BRANCHES = [
  { id: "online", label: "اینترنتی" },
  { id: "sari", label: "ساری" },
  { id: "gorgan", label: "گرگان" },
  { id: "capri", label: "کاپری" },
];

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function accountRoleLabel(role?: string) {
  if (role === "super_admin") return "سوپر ادمین";
  if (role === "admin") return "ادمین";
  return role || "—";
}

export function SettingsPage() {
  const { user } = useAuth();
  const canManage = Boolean(user?.can_manage_platform);
  const { data, loading, error, setData, setError } = useApi(() => systemService.status(), []);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [posFrom, setPosFrom] = useState("2026-09-12");
  const [posTo, setPosTo] = useState(todayIso);
  const [branches, setBranches] = useState<string[]>(STORE_BRANCHES.map((branch) => branch.id));
  const [coverage, setCoverage] = useState<SystemStatus["sync"]["week"] | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState("");
  const [apiBase, setApiBase] = useState("https://api.elinorboutique.com/v1");
  const [apiUsername, setApiUsername] = useState("");
  const [apiPassword, setApiPassword] = useState("");
  const [apiMessage, setApiMessage] = useState("");
  const [savingApi, setSavingApi] = useState(false);
  const [admins, setAdmins] = useState<PanelAdmin[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [savingAdmin, setSavingAdmin] = useState(false);

  useEffect(() => {
    if (!data || !canManage) return;
    if (data.api.base_url) setApiBase(data.api.base_url);
    if (data.api.username) setApiUsername(data.api.username);
  }, [canManage, data]);

  useEffect(() => {
    if (!canManage) return;
    systemService.admins().then((payload) => setAdmins(payload.results)).catch(() => setAdmins([]));
  }, [canManage]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      systemService
        .status()
        .then((next) => {
          setData(next);
          setError(false);
        })
        .catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [setData]);

  async function stopSync() {
    setSyncing(true);
    setMessage("");
    try {
      const result = await systemService.stopSync();
      setMessage(result.message || "همگام‌سازی متوقف شد.");
      setData(await systemService.status());
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "توقف همگام‌سازی انجام نشد.");
    } finally {
      setSyncing(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setMessage("");
    try {
      const result = await systemService.syncNow();
      setMessage(result.message || "همگام‌سازی آغاز شد. این کار ممکن است چند دقیقه طول بکشد.");
      const next = await systemService.status();
      setData(next);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "دریافت اطلاعات با خطا مواجه شد.");
    } finally {
      setSyncing(false);
    }
  }

  async function showRangeStatus() {
    if (!posFrom || !posTo) {
      setCoverageError("تاریخ شروع و پایان را انتخاب کنید.");
      return;
    }
    setCoverageLoading(true);
    setCoverageError("");
    try {
      setCoverage(await systemService.syncCoverage(posFrom, posTo));
    } catch (error) {
      setCoverageError(error instanceof ApiError ? error.message : "وضعیت این بازه دریافت نشد.");
    } finally {
      setCoverageLoading(false);
    }
  }

  async function syncPosRange(force = false) {
    if (!posFrom || !posTo) {
      setMessage("تاریخ شروع و پایان را انتخاب کنید.");
      return;
    }
    if (!branches.length) {
      setMessage("حداقل یک شعبه را انتخاب کنید.");
      return;
    }
    setSyncing(true);
    setMessage("");
    try {
      const result = await systemService.syncPosRange({ from: posFrom, to: posTo, branches, force });
      setMessage(result.message || "همگام‌سازی فروشگاه‌ها برای این بازه آغاز شد. اگر متوقف شد، همین بازه را دوباره بزنید.");
      const next = await systemService.status();
      setData(next);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "همگام‌سازی این بازه انجام نشد.");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <Skeleton className="h-96" />;
  if (error || !data) {
    return (
      <ErrorState
        onRetry={() => {
          setError(false);
          systemService.status().then(setData).catch(() => setError(true));
        }}
      />
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="تنظیمات" description="حساب داخلی، ظاهر، اتصال API و وضعیت همگام‌سازی." />

      <Panel>
        <SectionHeader title="ظاهر" />
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm">زمینه رنگی</div>
            <div className="mt-1 text-xs text-faint">روشن، تیره یا پیروی از سیستم</div>
          </div>
          <ThemeSwitch />
        </div>
      </Panel>

      <Panel>
        <SectionHeader title="حساب کاربری" />
        <Field label="نام کاربری" value={user?.username || "—"} />
        <Field label="نقش" value={accountRoleLabel(user?.role)} />
      </Panel>

      <Panel>
        <SectionHeader title="اتصال API الینور" />
        <Field label="وضعیت" value={data.api.configured ? "پیکربندی شده" : "تنظیم نشده"} />
        {canManage ? (
          <form
            className="mt-4 space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setSavingApi(true);
              setApiMessage("");
              try {
                await systemService.saveApi({
                  base_url: apiBase.trim(),
                  username: apiUsername.trim(),
                  password: apiPassword,
                });
                setApiPassword("");
                setApiMessage("اتصال API ذخیره شد.");
                setData(await systemService.status());
              } catch {
                setApiMessage("ذخیره اتصال API انجام نشد.");
              } finally {
                setSavingApi(false);
              }
            }}
          >
            <Input className="ltr-iso" value={apiBase} onChange={(event) => setApiBase(event.target.value)} placeholder="آدرس API" />
            <Input className="ltr-iso" value={apiUsername} onChange={(event) => setApiUsername(event.target.value)} placeholder="نام کاربری API" />
            <Input
              type="password"
              value={apiPassword}
              onChange={(event) => setApiPassword(event.target.value)}
              placeholder={data.api.password_set ? "رمز جدید؛ خالی یعنی رمز فعلی بماند" : "رمز API"}
            />
            <div className="flex items-center gap-4">
              <Button type="submit" disabled={savingApi}>
                {savingApi ? "در حال ذخیره..." : "ذخیره اتصال"}
              </Button>
              {apiMessage ? <span className="text-sm text-muted">{apiMessage}</span> : null}
            </div>
            <p className="text-xs text-faint">رمز API بعد از ذخیره نمایش داده نمی‌شود.</p>
          </form>
        ) : (
          <p className="mt-3 text-xs text-faint">تنظیم اتصال API فقط برای سوپر ادمین است.</p>
        )}
      </Panel>

      {canManage ? (
        <Panel>
          <SectionHeader title="ادمین‌ها" />
          <p className="text-sm leading-7 text-muted">
            ادمین لایه ۲ به فروش، مشتریان، محصولات و همگام‌سازی دسترسی دارد. ساخت ادمین و تنظیم API فقط برای سوپر ادمین است.
          </p>
          <div className="mt-3 divide-y divide-line">
            {admins.map((admin) => (
              <div key={admin.id} className="flex items-center justify-between py-2 text-sm">
                <span className="ltr-iso">{admin.username}</span>
                <span className="text-muted">{accountRoleLabel(admin.role)}</span>
              </div>
            ))}
          </div>
          <form
            className="mt-4 space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setSavingAdmin(true);
              setAdminMessage("");
              try {
                await systemService.createAdmin({ username: newUsername.trim(), password: newPassword });
                setNewUsername("");
                setNewPassword("");
                setAdminMessage("ادمین لایه ۲ ساخته شد.");
                const payload = await systemService.admins();
                setAdmins(payload.results);
              } catch {
                setAdminMessage("ساخت ادمین انجام نشد. نام کاربری تکراری یا رمز کوتاه است.");
              } finally {
                setSavingAdmin(false);
              }
            }}
          >
            <Input value={newUsername} onChange={(event) => setNewUsername(event.target.value)} placeholder="نام کاربری ادمین لایه ۲" />
            <Input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="رمز عبور، حداقل ۸ حرف"
            />
            <div className="flex items-center gap-4">
              <Button type="submit" disabled={savingAdmin}>
                {savingAdmin ? "در حال ساخت..." : "ساخت ادمین لایه ۲"}
              </Button>
              {adminMessage ? <span className="text-sm text-muted">{adminMessage}</span> : null}
            </div>
          </form>
        </Panel>
      ) : null}

      <Panel>
        <SectionHeader title="همگام‌سازی" />
        <Field label="آخرین همگام‌سازی موفق" value={formatDateTime(data.sync.last_success_at)} />
        <Field
          label="بازه همگام‌سازی"
          value={
            data.sync.window_start
              ? `${formatDate(data.sync.window_start)} تا ${formatDate(data.sync.window_end)}`
              : "—"
          }
        />
        <SyncJob job={data.sync.job} running={data.sync.running} stopping={syncing} onStop={stopSync} />
        <div className="mt-6 space-y-3">
          <div className="text-sm text-muted">بازه و شعبه؛ اینترنتی، ساری، گرگان و کاپری</div>
          <div className="flex flex-wrap items-center gap-3">
            <JalaliDateField value={posFrom} onChange={setPosFrom} compact />
            <span className="text-xs text-faint">تا</span>
            <JalaliDateField value={posTo} onChange={setPosTo} compact />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="شعبه‌های همگام‌سازی">
            {STORE_BRANCHES.map((branch) => {
              const active = branches.includes(branch.id);
              return (
                <button
                  key={branch.id}
                  type="button"
                  aria-pressed={active}
                  className={`min-h-11 rounded-full border px-3 py-1 text-sm ${active ? "border-ink bg-ink text-canvas" : "border-line text-muted"}`}
                  onClick={() =>
                    setBranches((current) =>
                      current.includes(branch.id) ? current.filter((id) => id !== branch.id) : [...current, branch.id],
                    )
                  }
                >
                  {branch.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="ghost" onClick={showRangeStatus} disabled={coverageLoading || !posFrom || !posTo}>
              {coverageLoading ? "در حال خواندن وضعیت..." : "نمایش وضعیت این بازه"}
            </Button>
            {coverage ? (
              <Button variant="quiet" onClick={() => { setCoverage(null); setCoverageError(""); }}>
                هفت روز اخیر
              </Button>
            ) : null}
            <Button onClick={() => syncPosRange(false)} disabled={syncing || data.sync.running || !posFrom || !posTo}>
              {data.sync.running || syncing ? "در حال همگام‌سازی..." : "همگام‌سازی این بازه"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => syncPosRange(true)}
              disabled={syncing || data.sync.running || !posFrom || !posTo}
            >
              اجرای دوباره این بازه
            </Button>
            <Button onClick={syncNow} disabled={syncing || data.sync.running}>
              همگام‌سازی اکنون
            </Button>
            {message ? <span className="text-sm text-muted">{message}</span> : null}
          </div>
          {coverageError ? <p className="text-sm leading-6 text-rose">{coverageError}</p> : null}
          <CoverageTable report={coverage ?? data.sync.week} custom={Boolean(coverage)} />
          <p className="text-[13px] leading-6 text-muted">
            تأیید شده یعنی تعداد ذخیره‌شده با تعداد سفارش‌هایی که API برای همان روز و شعبه برگردانده برابر است. صفرِ تأیید شده یعنی API آن روز را خالی داده و دیتابیس هم خالی است. تأیید نشده یعنی فروش هست و دریافت کامل هنوز ثبت نشده. خوانده نشده یعنی آن روز هنوز از API خوانده نشده. اختلاف یعنی دو عدد با هم فرق دارند. امروز و دیروز بعد از هر دریافتِ برابر، تأیید شده می‌شوند و همچنان برای سفارش جدید دوباره خوانده می‌شوند.
          </p>
        </div>
      </Panel>

      <Panel>
        <SectionHeader title="پشتیبان‌گیری" />
        <p className="text-sm leading-7 text-muted">{data.backup.note}</p>
      </Panel>

      <Panel>
        <SectionHeader title="سیستم" />
        <Field label="محصول" value="ELINOR IQ v2" />
        <Field label="پایگاه داده" value="PostgreSQL 16" />
      </Panel>
    </div>
  );
}

function SyncJob({
  job,
  running,
  stopping,
  onStop,
}: {
  job: SystemStatus["sync"]["job"];
  running: boolean;
  stopping: boolean;
  onStop: () => void;
}) {
  if (!job) return null;
  const branchLabel = job.branches.length
    ? job.branches
        .map((id) => STORE_BRANCHES.find((branch) => branch.id === id)?.label || id)
        .join("، ")
    : "همه شعبه‌ها";
  const problem = job.stalled || job.status === "failed" || job.status === "paused";
  return (
    <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${problem ? "border-rose/40" : "border-line"}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted">وضعیت</span>
        <span className={`flex items-center gap-3 ${problem ? "text-rose" : ""}`}>
          {job.kind_label ? <span className="text-faint">{job.kind_label}</span> : null}
          {job.status_label}
          {running ? (
            <Button onClick={onStop} disabled={stopping}>
              {stopping ? "در حال توقف..." : "توقف"}
            </Button>
          ) : null}
        </span>
      </div>
      <Field label="شعبه" value={branchLabel} />
      <Field
        label="روز جاری"
        value={job.current_day ? formatDate(job.current_day) : "—"}
      />
      <Field label="فروش ذخیره‌شده" value={formatNumber(job.pos_sales_upserted)} />
      <Field label="درخواست API" value={formatNumber(job.requests_made)} />
      {job.days_skipped != null ? <Field label="روزهای رد شده" value={formatNumber(job.days_skipped)} /> : null}
      {job.days_fetched != null ? <Field label="روزهای دریافت‌شده" value={formatNumber(job.days_fetched)} /> : null}
      {job.failures ? <Field label="خطای جزئیات" value={formatNumber(job.failures)} /> : null}
      {job.error ? <p className="pt-3 text-sm leading-6 text-rose">{job.error}</p> : null}
      {job.stalled ? (
        <p className="pt-3 text-sm leading-6 text-rose">چند دقیقه پیشرفتی ثبت نشده. اگر این حالت ماند، همان بازه را دوباره بزنید.</p>
      ) : null}
    </div>
  );
}

function Field({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className={ltr ? "ltr-iso" : ""}>{value}</span>
    </div>
  );
}

type CoverageReport = SystemStatus["sync"]["week"];
type CoverageBranch = CoverageReport["days"][number]["branches"][number];

const COVERAGE_TONE: Record<string, string> = {
  complete: "var(--delta-up)",
  mismatch: "var(--delta-down)",
  unconfirmed: "var(--warning)",
  partial: "var(--warning)",
  open: "var(--accent)",
};

function coverageCount(branch: CoverageBranch) {
  if (branch.state === "unread") return "—";
  if (branch.api_count != null && branch.sales !== branch.api_count) {
    return `${formatNumber(branch.sales)} از ${formatNumber(branch.api_count)}`;
  }
  return formatNumber(branch.sales);
}

function coverageSummary(days: CoverageReport["days"]) {
  const cells = days.flatMap((day) => day.branches);
  const count = (state: string) => cells.filter((cell) => cell.state === state).length;
  return [
    count("complete") ? `${formatNumber(count("complete"))} تأیید شده` : "",
    count("mismatch") ? `${formatNumber(count("mismatch"))} اختلاف` : "",
    count("unconfirmed") ? `${formatNumber(count("unconfirmed"))} تأیید نشده` : "",
    count("partial") ? `${formatNumber(count("partial"))} نیمه‌کاره` : "",
    count("read") ? `${formatNumber(count("read"))} خوانده‌شده` : "",
    count("unread") ? `${formatNumber(count("unread"))} خوانده نشده` : "",
    count("open") ? `${formatNumber(count("open"))} باز` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function CoverageTable({ report, custom }: { report?: CoverageReport; custom: boolean }) {
  const days = report?.days || [];
  const columns = days[0]?.branches || [];
  if (!days.length) return null;
  const summary = coverageSummary(days);
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-ink">
          {custom && report ? `وضعیت ${formatDate(report.from)} تا ${formatDate(report.to)}` : "هفت روز اخیر"}
        </h3>
        {summary ? <p className="text-[13px] text-muted">{summary}</p> : null}
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <caption className="sr-only">وضعیت دریافت سفارش هر شعبه در هر روز</caption>
          <thead>
            <tr className="text-right text-[12px] text-faint">
              <th scope="col" className="border-b border-line px-2 py-2 font-medium">
                تاریخ
              </th>
              {columns.map((branch) => (
                <th key={branch.key} scope="col" className="border-b border-line px-2 py-2 font-medium">
                  {branch.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date} className="border-b border-line/80 odd:bg-transparent even:bg-stripe">
                <th scope="row" className="px-2 py-2.5 text-right text-[13px] font-medium text-ink">
                  {formatDate(day.date)}
                </th>
                {day.branches.map((branch) => (
                  <td key={branch.key} className="px-2 py-2.5 align-top">
                    <div className="tabular text-[13px] text-ink">{coverageCount(branch)}</div>
                    <div className="text-[12px]" style={{ color: COVERAGE_TONE[branch.state] || "var(--text-secondary)" }}>
                      {branch.state_label}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
