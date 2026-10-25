import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { ApiError } from "../../services/api";
import { customersService } from "../../services/customers";
import type { Customer360, InternalAccountKind } from "../../types";

const KIND_OPTIONS: { value: InternalAccountKind; label: string }[] = [
  { value: "staff", label: "کارمند" },
  { value: "desk", label: "اکانت دفتر" },
];

type Props = { data: Customer360; onChanged: () => void };

/** Super-admin banner for internal-account signals or a confirmed internal account. */
export function InternalAccountBanner({ data, onChanged }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const account = data.internal_account;
  const signals = data.internal_account_signals;

  const restore = async () => {
    if (!account || !window.confirm("این حساب به گزارش‌های مشتری برگردد؟")) return;
    setBusy(true);
    setMessage("");
    try {
      await customersService.updateInternalAccount(account.id, { is_active: false });
      onChanged();
    } catch (error) {
      setMessage(error instanceof ApiError && error.message ? error.message : "بازگرداندن انجام نشد.");
    } finally {
      setBusy(false);
    }
  };

  if (account?.is_active) {
    return (
      <div className="rounded-2xl border border-line bg-elevated px-4 py-3 text-sm" role="status">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="font-bold text-ink">حساب داخلی — از گزارش‌های مشتری خارج است · سفارش‌ها در فروش می‌ماند</p>
            <p className="text-xs text-muted">
              نوع: {account.kind_label}
              {account.note ? ` · ${account.note}` : ""}
            </p>
            <p className="text-[11px] text-faint">
              ثبت: {account.updated_by || account.created_by || "—"} · {formatDateTime(account.updated_at || account.created_at)}
            </p>
          </div>
          <Button type="button" variant="ghost" onClick={restore} disabled={busy}>
            {busy ? "در حال ثبت..." : "بازگرداندن به گزارش‌ها"}
          </Button>
        </div>
        {message ? <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{message}</p> : null}
      </div>
    );
  }

  if (!signals?.suspected) return null;
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm" role="status">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold text-amber-800 dark:text-amber-300">این حساب نشانه‌های حساب داخلی دارد:</p>
          <ul className="mt-1 flex flex-wrap gap-1.5 text-xs text-amber-800 dark:text-amber-300">
            {signals.signals.map((signal) => (
              <li key={signal.key} className="rounded-lg bg-amber-500/15 px-2 py-0.5">
                {signal.text}
              </li>
            ))}
          </ul>
        </div>
        <Button type="button" onClick={() => setDialogOpen(true)}>
          علامت‌گذاری به‌عنوان حساب داخلی
        </Button>
      </div>
      {dialogOpen ? <MarkInternalDialog data={data} onClose={() => setDialogOpen(false)} onDone={onChanged} /> : null}
    </div>
  );
}

/** Header menu with the internal-account action, available for every customer (super admin). */
export function InternalAccountMenu({ data, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const active = Boolean(data.internal_account?.is_active);
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="عملیات بیشتر"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-elevated text-muted hover:text-ink"
      >
        ⋯
      </button>
      {open ? (
        <div role="menu" className="absolute left-0 top-9 z-20 w-60 rounded-2xl border border-line bg-surface p-1.5 text-xs shadow-soft">
          <button
            type="button"
            role="menuitem"
            disabled={active}
            onClick={() => {
              setOpen(false);
              setDialogOpen(true);
            }}
            className="w-full rounded-xl px-3 py-2 text-right text-ink hover:bg-hover disabled:opacity-50"
          >
            {active ? "این حساب داخلی است" : "علامت‌گذاری به‌عنوان حساب داخلی"}
          </button>
        </div>
      ) : null}
      {dialogOpen ? <MarkInternalDialog data={data} onClose={() => setDialogOpen(false)} onDone={onChanged} /> : null}
    </div>
  );
}

function MarkInternalDialog({ data, onClose, onDone }: { data: Customer360; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<InternalAccountKind>(data.internal_account?.kind ?? "staff");
  const [note, setNote] = useState(data.internal_account?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const submit = async () => {
    setBusy(true);
    setMessage("");
    try {
      await customersService.markInternalAccount({ customer_source_id: data.id, kind, note: note.trim() });
      onClose();
      onDone();
    } catch (error) {
      setMessage(error instanceof ApiError && error.message ? error.message : "ثبت انجام نشد.");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="internal-account-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="w-full max-w-md space-y-4 rounded-[24px] bg-surface p-6 text-sm shadow-2xl outline-none"
      >
        <h3 id="internal-account-title" className="text-[15px] font-semibold text-ink">
          علامت‌گذاری به‌عنوان حساب داخلی
        </h3>
        <p className="text-xs leading-6 text-muted">
          این حساب از سطح‌بندی، RFM، رتبه‌بندی و شمارش مشتریان خارج می‌شود. سفارش‌هایش در فروش می‌ماند. هر زمان می‌توانید آن را
          برگردانید.
        </p>
        <fieldset className="space-y-2">
          <legend className="text-xs font-bold text-muted">نوع حساب</legend>
          <div className="flex gap-2">
            {KIND_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${
                  kind === option.value ? "border-accent bg-accent/10 text-accent" : "border-line text-muted"
                }`}
              >
                <input
                  type="radio"
                  name="internal-kind"
                  value={option.value}
                  checked={kind === option.value}
                  onChange={() => setKind(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-muted">یادداشت</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder="مثلاً: کارمند شعبه ساری، برای مشتری‌ها سفارش ثبت می‌کند"
            className="w-full rounded-xl border border-line bg-elevated px-3 py-2 text-xs text-ink outline-none focus:border-accent/40"
          />
        </label>
        {message ? <p className="text-xs text-rose-600 dark:text-rose-400">{message}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button type="button" onClick={submit} disabled={busy}>
            {busy ? "در حال ثبت..." : "تأیید"}
          </Button>
        </div>
      </div>
    </div>
  );
}
