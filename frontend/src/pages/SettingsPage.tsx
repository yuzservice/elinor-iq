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
  const { data, loading, error, setData } = useApi(() => systemService.status(), []);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [posFrom, setPosFrom] = useState("2026-09-12");
  const [posTo, setPosTo] = useState(todayIso);
  const [branches, setBranches] = useState<string[]>(STORE_BRANCHES.map((branch) => branch.id));
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
      systemService.status().then(setData).catch(() => undefined);
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

  async function syncPosRange() {
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
      const result = await systemService.syncPosRange({ from: posFrom, to: posTo, branches });
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
  if (error || !data) return <ErrorState />;

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
        <div className="mt-5 grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
          <Count label="سفارش" value={data.counts.orders} />
          <Count label="همه مشتریان" value={data.counts.customers} />
          <Count label="مشتریان خریدار" value={data.counts.purchasing_customers} />
          <Count label="آیتم" value={data.counts.items} />
          <Count label="کالا" value={data.counts.products} />
          <Count label="تنوع" value={data.counts.variants} />
        </div>
        <SyncJob job={data.sync.job} running={data.sync.running} stopping={syncing} onStop={stopSync} />
        <div className="mt-6 space-y-3">
          <div className="text-sm text-muted">بازه و شعبه فروشگاه</div>
          <div className="flex flex-wrap items-center gap-3">
            <JalaliDateField value={posFrom} onChange={setPosFrom} compact />
            <span className="text-xs text-faint">تا</span>
            <JalaliDateField value={posTo} onChange={setPosTo} compact />
          </div>
          <div className="flex flex-wrap gap-2">
            {STORE_BRANCHES.map((branch) => {
              const active = branches.includes(branch.id);
              return (
                <button
                  key={branch.id}
                  type="button"
                  className={`rounded-full border px-3 py-1 text-sm ${active ? "border-ink bg-ink text-canvas" : "border-line text-muted"}`}
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
            <Button onClick={syncPosRange} disabled={syncing || data.sync.running || !posFrom || !posTo}>
              {data.sync.running || syncing ? "در حال همگام‌سازی..." : "همگام‌سازی این بازه"}
            </Button>
            <Button onClick={syncNow} disabled={syncing || data.sync.running}>
              همگام‌سازی اکنون
            </Button>
            {message ? <span className="text-sm text-muted">{message}</span> : null}
          </div>
          <p className="text-xs leading-6 text-faint">
            وضعیت هر چند ثانیه تازه می‌شود. اگر «متوقف شد» یا «ناموفق» دیدید، متن زیر وضعیت دلیلش است. برای ادامه، همان بازه را دوباره بزنید.
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

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-faint">{label}</div>
      <div className="mt-1 tabular text-lg">{formatNumber(value)}</div>
    </div>
  );
}
