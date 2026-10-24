import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui";
import { ErrorState, Skeleton } from "../../components/Table";
import { invalidateTiers } from "../../hooks/useTiers";
import { formatDateTime, formatNumber, formatToman } from "../../lib/format";
import { ApiError } from "../../services/api";
import { customersService } from "../../services/customers";
import type { TierCode, TierConditionKey, TierOperator, TierRulesPreview, TierRulesState } from "../../types";
import { tierStyle } from "./tierDisplay";
import {
  MAX_TIERS,
  type EditableTier,
  formatAmountInput,
  fromEditable,
  hasTierRuleErrors,
  moveTier,
  newTier,
  parseIntegerInput,
  rulesEqual,
  tierSummary,
  toEditable,
  validateTierRules,
} from "./tierRules";

const POLL_MS = 4000;
const NO_TIER = "بدون سطح";

type Step = "rules" | "preview" | "history";

const STEPS: { id: Step; label: string }[] = [
  { id: "rules", label: "قوانین" },
  { id: "preview", label: "پیش‌نمایش" },
  { id: "history", label: "تاریخچه" },
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError && error.message ? error.message : fallback;
}

export function TierRulesModal({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<TierRulesState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tiers, setTiers] = useState<EditableTier[]>([]);
  const [preview, setPreview] = useState<TierRulesPreview | null>(null);
  const [step, setStep] = useState<Step>("rules");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const applyState = useCallback((next: TierRulesState, resetRules = true) => {
    setState(next);
    const source = next.draft ?? next.active;
    if (resetRules && source) setTiers(toEditable(source.rules));
  }, []);

  const load = useCallback(() => {
    setLoadFailed(false);
    customersService
      .tierRules()
      .then((next) => {
        const source = next.draft ?? next.active;
        if (!Array.isArray(source?.rules?.tiers)) throw new Error("unexpected tier rules shape");
        applyState(next);
      })
      .catch(() => setLoadFailed(true));
  }, [applyState]);

  useEffect(load, [load]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const running = Boolean(state?.activation.running);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      customersService
        .tierRules()
        .then((next) => {
          if (next.activation.running) {
            setState(next);
            return;
          }
          applyState(next);
          setPreview(null);
          invalidateTiers();
          setMessage(
            next.activation.status === "succeeded"
              ? "قوانین جدید فعال شد و سطح همه مشتریان دوباره محاسبه شد."
              : "فعال‌سازی انجام نشد. قوانین قبلی همچنان فعال است.",
          );
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [running, applyState]);

  const rules = useMemo(() => fromEditable(tiers), [tiers]);
  const base = state ? (state.draft ?? state.active) : null;
  const dirty = Boolean(state) && !rulesEqual(rules, base?.rules);
  const errors = validateTierRules(rules.tiers);
  const invalid = hasTierRuleErrors(errors);
  const draft = state?.draft ?? null;
  const previewCurrent = Boolean(draft?.preview_current && !dirty && preview && preview.version === draft.version);
  const locked = running || Boolean(busy);

  const titles = useMemo(() => {
    const map = new Map<TierCode | null, string>([[null, NO_TIER]]);
    for (const version of [state?.active, state?.draft]) {
      version?.rules.tiers.forEach((tier) => tier.code && map.set(tier.code, tier.title));
    }
    preview?.tiers.forEach((row) => row.tier_code && row.label && map.set(row.tier_code, row.label));
    return map;
  }, [state, preview]);
  const tierTitle = (code: TierCode | null) => titles.get(code) ?? code ?? NO_TIER;

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm("تغییرات ذخیره‌نشده از بین می‌رود. بسته شود؟")) return;
    onClose();
  }, [dirty, onClose]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (confirming) setConfirming(false);
      else requestClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const updateTier = (index: number, patch: Partial<EditableTier>) =>
    setTiers((current) => current.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)));

  const updateCondition = (index: number, key: TierConditionKey, patch: { enabled?: boolean; value?: number | null; operator?: TierOperator }) =>
    setTiers((current) =>
      current.map((tier, i) =>
        i === index ? { ...tier, conditions: { ...tier.conditions, [key]: { ...tier.conditions[key], ...patch } } } : tier,
      ),
    );

  const run = async (label: string, action: () => Promise<void>, failure: string) => {
    setBusy(label);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(errorMessage(error, failure));
    } finally {
      setBusy("");
    }
  };

  const saveDraft = () =>
    run(
      "save",
      async () => {
        applyState(await customersService.saveTierRulesDraft({ rules }));
        setPreview(null);
        setMessage("پیش‌نویس ذخیره شد. برای فعال‌سازی ابتدا پیش‌نمایش بگیرید.");
      },
      "ذخیره پیش‌نویس انجام نشد.",
    );

  const runPreview = () =>
    run(
      "preview",
      async () => {
        if (dirty || !draft) applyState(await customersService.saveTierRulesDraft({ rules }));
        setPreview(await customersService.previewTierRulesDraft());
        applyState(await customersService.tierRules(), false);
        setStep("preview");
      },
      "پیش‌نمایش انجام نشد.",
    );

  const activate = () =>
    run(
      "activate",
      async () => {
        setConfirming(false);
        const result = await customersService.activateTierRulesDraft();
        setMessage(result.detail);
        applyState(await customersService.tierRules(), false);
      },
      "فعال‌سازی شروع نشد.",
    );

  const deleteDraft = () => {
    if (!window.confirm("پیش‌نویس حذف شود؟")) return;
    void run(
      "delete",
      async () => {
        applyState(await customersService.deleteTierRulesDraft());
        setPreview(null);
        setMessage("پیش‌نویس حذف شد.");
      },
      "حذف پیش‌نویس انجام نشد.",
    );
  };

  const restore = (version: number) => {
    if ((draft || dirty) && !window.confirm("پیش‌نویس فعلی با قوانین این نسخه جایگزین شود؟")) return;
    void run(
      "restore",
      async () => {
        applyState(await customersService.restoreTierRules(version));
        setPreview(null);
        setStep("rules");
        setMessage(`قوانین نسخه ${formatNumber(version)} در پیش‌نویس قرار گرفت.`);
      },
      "بازگردانی انجام نشد.",
    );
  };

  const statusChip = running ? (
    <Chip tone="accent">در حال فعال‌سازی…</Chip>
  ) : state?.activation.status === "failed" ? (
    <Chip tone="danger">خطا</Chip>
  ) : dirty ? (
    <Chip tone="warning">پیش‌نویس ذخیره‌نشده</Chip>
  ) : previewCurrent ? (
    <Chip tone="success">پیش‌نمایش به‌روز</Chip>
  ) : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 sm:items-center sm:p-4"
      onMouseDown={(event) => event.target === event.currentTarget && requestClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tier-rules-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative flex h-full w-full flex-col bg-surface text-ink shadow-2xl outline-none sm:h-auto sm:max-h-[90vh] sm:max-w-5xl sm:rounded-[24px]"
      >
        <header className="border-b border-line px-4 pb-3 pt-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="tier-rules-title" className="text-[15px] font-semibold text-ink">
                قوانین سطح‌بندی مشتریان
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span>
                  نسخه فعال: <strong className="text-ink">{formatNumber(state?.active?.version)}</strong>
                </span>
                <span>{formatDateTime(state?.active?.activated_at)}</span>
                <span>{state?.active?.activated_by || "—"}</span>
                {statusChip}
              </div>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="بستن"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 inline-flex rounded-2xl border border-line bg-elevated p-1 text-xs" role="tablist">
            {STEPS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={step === item.id}
                onClick={() => setStep(item.id)}
                className={`rounded-xl px-3.5 py-1.5 font-bold transition-colors ${
                  step === item.id ? "bg-surface text-ink shadow-xs border border-line/60" : "text-muted hover:text-ink"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {loadFailed ? (
            <ErrorState onRetry={load} />
          ) : !state ? (
            <Skeleton className="h-64" />
          ) : (
            <>
              {state.activation.status === "failed" && !running ? (
                <p className="mb-4 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
                  فعال‌سازی ناموفق بود؛ قوانین قبلی همچنان فعال است.
                  {state.activation.error ? <span className="mt-1 block text-xs ltr-iso">{state.activation.error}</span> : null}
                </p>
              ) : null}
              {running ? (
                <p className="mb-4 rounded-2xl bg-accent/10 px-4 py-3 text-sm text-accent">
                  فعال‌سازی در حال انجام است. تا پایان محاسبه، قوانین قبلی فعال می‌مانند.
                </p>
              ) : null}

              {step === "rules" ? (
                <RulesStep
                  tiers={tiers}
                  errors={errors}
                  disabled={locked}
                  onMove={(index, delta) => setTiers((current) => moveTier(current, index, delta))}
                  onUpdate={updateTier}
                  onCondition={updateCondition}
                  onDelete={(index) => {
                    if (window.confirm(`سطح «${tiers[index].title || "بدون عنوان"}» حذف شود؟`)) {
                      setTiers((current) => current.filter((_tier, i) => i !== index));
                    }
                  }}
                  onAdd={() => setTiers((current) => [...current, newTier(`سطح ${formatNumber(current.length + 1)}`)])}
                />
              ) : step === "preview" ? (
                preview && previewCurrent ? (
                  <PreviewStep preview={preview} tierTitle={tierTitle} />
                ) : (
                  <p className="py-10 text-center text-sm text-muted">
                    {dirty || !draft ? "ابتدا پیش‌نویس را ذخیره و پیش‌نمایش بگیرید." : "برای دیدن اثر پیش‌نویس، «پیش‌نمایش» را بزنید."}
                  </p>
                )
              ) : (
                <HistoryStep state={state} disabled={locked} onRestore={restore} />
              )}
            </>
          )}
        </div>

        <footer className="sticky bottom-0 border-t border-line bg-surface px-4 py-3 sm:rounded-b-[24px] sm:px-6">
          {message ? <p className="mb-2 text-xs text-muted">{message}</p> : null}
          {errors._ ? <p className="mb-2 text-xs text-rose-600 dark:text-rose-400">{errors._}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={saveDraft} disabled={!state || locked || invalid || (!dirty && Boolean(draft))}>
              {busy === "save" ? "در حال ذخیره..." : "ذخیره پیش‌نویس"}
            </Button>
            <Button type="button" variant="ghost" onClick={runPreview} disabled={!state || locked || invalid}>
              {busy === "preview" ? "در حال محاسبه..." : "پیش‌نمایش"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(true)} disabled={locked || !previewCurrent}>
              {busy === "activate" ? "در حال شروع..." : "فعال‌سازی"}
            </Button>
            {draft ? (
              <Button type="button" variant="quiet" onClick={deleteDraft} disabled={locked}>
                حذف پیش‌نویس
              </Button>
            ) : null}
          </div>
        </footer>

        {confirming && preview ? (
          <ConfirmActivation preview={preview} tierTitle={tierTitle} onCancel={() => setConfirming(false)} onConfirm={activate} />
        ) : null}
      </div>
    </div>
  );
}

function Chip({ tone, children }: { tone: "accent" | "danger" | "warning" | "success"; children: ReactNode }) {
  const tones = {
    accent: "bg-accent/10 text-accent",
    danger: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tones[tone]}`}>{children}</span>;
}

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-accent" : "bg-line"
      }`}
    >
      <span
        className={`absolute h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-0.5" : "right-0.5"}`}
      />
    </button>
  );
}

function RulesStep({
  tiers,
  errors,
  disabled,
  onMove,
  onUpdate,
  onCondition,
  onDelete,
  onAdd,
}: {
  tiers: EditableTier[];
  errors: ReturnType<typeof validateTierRules>;
  disabled: boolean;
  onMove: (index: number, delta: number) => void;
  onUpdate: (index: number, patch: Partial<EditableTier>) => void;
  onCondition: (index: number, key: TierConditionKey, patch: { enabled?: boolean; value?: number | null; operator?: TierOperator }) => void;
  onDelete: (index: number) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-6 text-muted">
        ترتیب سطح‌ها اولویت را تعیین می‌کند: هر مشتری در اولین سطح فعالی قرار می‌گیرد که همه شرط‌های فعالش را داشته باشد.
      </p>
      {tiers.map((tier, index) => (
        <TierCard
          key={tier.key}
          tier={tier}
          index={index}
          count={tiers.length}
          errors={errors.tiers[index]}
          disabled={disabled}
          onMove={(delta) => onMove(index, delta)}
          onUpdate={(patch) => onUpdate(index, patch)}
          onCondition={(key, patch) => onCondition(index, key, patch)}
          onDelete={() => onDelete(index)}
        />
      ))}
      <Button type="button" variant="ghost" onClick={onAdd} disabled={disabled || tiers.length >= MAX_TIERS} className="w-full sm:w-auto">
        + افزودن سطح
      </Button>
      {tiers.length >= MAX_TIERS ? <p className="text-xs text-faint">حداکثر {formatNumber(MAX_TIERS)} سطح مجاز است.</p> : null}
    </div>
  );
}

function TierCard({
  tier,
  index,
  count,
  errors,
  disabled,
  onMove,
  onUpdate,
  onCondition,
  onDelete,
}: {
  tier: EditableTier;
  index: number;
  count: number;
  errors?: Partial<Record<TierConditionKey | "title" | "_", string>>;
  disabled: boolean;
  onMove: (delta: number) => void;
  onUpdate: (patch: Partial<EditableTier>) => void;
  onCondition: (key: TierConditionKey, patch: { enabled?: boolean; value?: number | null; operator?: TierOperator }) => void;
  onDelete: () => void;
}) {
  const [editingTitle, setEditingTitle] = useState(!tier.code);
  const style = tierStyle(tier.code);
  return (
    <div className={`rounded-2xl border border-line bg-elevated p-3 sm:p-4 transition-opacity ${tier.enabled ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-xs font-extrabold ${style.badge}`}>
          {formatNumber(index + 1)}
        </span>
        <div className="flex items-center">
          <IconAction label="بالاتر" disabled={disabled || index === 0} onClick={() => onMove(-1)}>
            ▲
          </IconAction>
          <IconAction label="پایین‌تر" disabled={disabled || index === count - 1} onClick={() => onMove(1)}>
            ▼
          </IconAction>
        </div>
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <input
              value={tier.title}
              maxLength={60}
              disabled={disabled}
              autoFocus={!tier.code}
              onChange={(event) => onUpdate({ title: event.target.value })}
              onBlur={() => tier.title.trim() && setEditingTitle(false)}
              onKeyDown={(event) => event.key === "Enter" && tier.title.trim() && setEditingTitle(false)}
              aria-label="عنوان سطح"
              className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-sm font-semibold text-ink outline-none focus:border-accent/40"
            />
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setEditingTitle(true)}
              className="inline-flex max-w-full items-center gap-1.5 truncate text-sm font-semibold text-ink hover:text-accent"
              aria-label={`ویرایش عنوان ${tier.title}`}
            >
              <span className="truncate">{style.icon} {tier.title}</span>
              <span aria-hidden className="text-xs text-muted">✎</span>
            </button>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <Switch checked={tier.enabled} disabled={disabled} label="فعال بودن سطح" onChange={(enabled) => onUpdate({ enabled })} />
          <span>{tier.enabled ? "فعال" : "غیرفعال"}</span>
        </label>
        <IconAction label="حذف سطح" disabled={disabled} onClick={onDelete} danger>
          🗑
        </IconAction>
      </div>

      <div className="mt-2">
        <span className="inline-flex rounded-full bg-hover px-2.5 py-1 text-[11px] text-muted">{tierSummary(tier)}</span>
      </div>
      {errors?.title ? <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{errors.title}</p> : null}
      {errors?._ ? <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{errors._}</p> : null}

      <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-3">
        <ConditionRow
          label="تعداد خرید"
          condition={tier.conditions.purchase_count}
          error={errors?.purchase_count}
          disabled={disabled}
          onChange={(patch) => onCondition("purchase_count", patch)}
        />
        <ConditionRow
          label="روز از آخرین خرید"
          fixedPrefix="تا"
          suffix="روز"
          condition={tier.conditions.days_since_last}
          error={errors?.days_since_last}
          disabled={disabled}
          onChange={(patch) => onCondition("days_since_last", patch)}
        />
        <ConditionRow
          label="مبلغ کل خرید (تومان)"
          amount
          condition={tier.conditions.lifetime_amount}
          error={errors?.lifetime_amount}
          disabled={disabled}
          onChange={(patch) => onCondition("lifetime_amount", patch)}
        />
      </div>
    </div>
  );
}

function IconAction({
  label,
  disabled,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs transition-colors disabled:opacity-30 ${
        danger ? "text-muted hover:bg-rose-500/10 hover:text-rose-600" : "text-muted hover:bg-hover hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function ConditionRow({
  label,
  condition,
  error,
  disabled,
  amount = false,
  fixedPrefix,
  suffix,
  onChange,
}: {
  label: string;
  condition: { enabled: boolean; value: number | null; operator?: TierOperator };
  error?: string;
  disabled: boolean;
  amount?: boolean;
  fixedPrefix?: string;
  suffix?: string;
  onChange: (patch: { enabled?: boolean; value?: number | null; operator?: TierOperator }) => void;
}) {
  const shown = amount ? formatAmountInput(condition.value) : condition.value == null ? "" : String(condition.value);
  const off = !condition.enabled;
  return (
    <div className="rounded-xl border border-line/70 bg-surface p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-semibold ${off ? "text-faint" : "text-ink"}`}>{label}</span>
        <Switch checked={condition.enabled} disabled={disabled} label={`فعال بودن شرط ${label}`} onChange={(enabled) => onChange({ enabled })} />
      </div>
      <div className={`mt-2 flex items-center gap-2 ${off ? "opacity-50" : ""}`}>
        {fixedPrefix ? (
          <span className="shrink-0 text-xs text-muted">{fixedPrefix}</span>
        ) : (
          <div className="inline-flex shrink-0 rounded-lg border border-line bg-elevated p-0.5 text-[11px]" role="radiogroup" aria-label="نوع مقایسه">
            {(["gte", "lte"] as TierOperator[]).map((operator) => (
              <button
                key={operator}
                type="button"
                role="radio"
                aria-checked={condition.operator === operator}
                title={operator === "gte" ? "بیشتر یا مساوی" : "کمتر یا مساوی"}
                disabled={disabled || off}
                onClick={() => onChange({ operator })}
                className={`rounded-md px-2 py-0.5 font-bold ${
                  condition.operator === operator ? "bg-surface text-ink shadow-xs" : "text-muted"
                }`}
              >
                {operator === "gte" ? "≥" : "≤"}
              </button>
            ))}
          </div>
        )}
        <input
          className="h-8 w-full min-w-0 rounded-lg border border-line bg-elevated px-2 text-left text-sm text-ink outline-none tabular focus:border-accent/40"
          dir="ltr"
          inputMode="numeric"
          value={shown}
          disabled={disabled || off}
          aria-label={label}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            const parsed = parseIntegerInput(event.target.value);
            if (parsed == null || !Number.isNaN(parsed)) onChange({ value: parsed });
          }}
        />
        {suffix ? <span className="shrink-0 text-xs text-muted">{suffix}</span> : null}
      </div>
      {error ? <p className="mt-1 text-[11px] leading-5 text-rose-600 dark:text-rose-400">{error}</p> : null}
    </div>
  );
}

function PreviewStep({ preview, tierTitle }: { preview: TierRulesPreview; tierTitle: (code: TierCode | null) => string }) {
  const max = Math.max(1, ...preview.tiers.flatMap((row) => [row.current, row.draft]));
  return (
    <div className="space-y-5">
      {preview.warnings.length ? (
        <ul className="space-y-1 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          {preview.warnings.map((warning, index) => (
            <li key={`${warning.kind}-${warning.tier_code ?? "none"}-${index}`}>
              {warning.label ? `${warning.label}: ` : ""}
              {warning.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-2">
        {preview.tiers.map((row) => (
          <div key={row.tier_code ?? "none"} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_auto]">
            <span className={`truncate ${row.enabled || row.tier_code === null ? "text-ink" : "text-faint line-through"}`}>
              {row.tier_code ? row.label || tierTitle(row.tier_code) : NO_TIER}
            </span>
            <div className="space-y-1">
              <Bar value={row.current} max={max} tone="bg-line" label={`فعلی ${formatNumber(row.current)}`} />
              <Bar value={row.draft} max={max} tone="bg-accent" label={`جدید ${formatNumber(row.draft)}`} />
            </div>
            <span
              dir="ltr"
              className={`tabular text-xs ${row.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : row.delta < 0 ? "text-rose-600 dark:text-rose-400" : "text-muted"}`}
            >
              {row.delta > 0 ? "+" : ""}
              {formatNumber(row.delta)}
            </span>
          </div>
        ))}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">جابه‌جایی‌ها ({formatNumber(preview.moved)} مشتری)</h3>
        {preview.transitions.length ? (
          <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {preview.transitions.map((item) => (
              <li key={`${item.from}-${item.to}`} className="text-muted">
                {tierTitle(item.from)} ← {tierTitle(item.to)} · <span className="tabular text-ink">{formatNumber(item.count)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">با این قوانین سطح هیچ مشتری‌ای تغییر نمی‌کند.</p>
        )}
      </div>

      {preview.samples.length ? (
        <div className="overflow-x-auto">
          <h3 className="mb-2 text-sm font-semibold text-ink">نمونه مشتریان جابه‌جاشده</h3>
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-right text-xs text-muted">
                <th className="px-2 py-2 font-normal">مشتری</th>
                <th className="px-2 py-2 font-normal">موبایل</th>
                <th className="px-2 py-2 font-normal">تعداد خرید</th>
                <th className="px-2 py-2 font-normal">روز از آخرین خرید</th>
                <th className="px-2 py-2 font-normal">مبلغ کل خرید</th>
                <th className="px-2 py-2 font-normal">از</th>
                <th className="px-2 py-2 font-normal">به</th>
              </tr>
            </thead>
            <tbody>
              {preview.samples.map((sample) => (
                <tr key={`${sample.source_id}-${sample.from}-${sample.to}`} className="border-b border-line/60">
                  <td className="px-2 py-2">
                    <Link to={`/customers/${sample.source_id}`} className="text-accent hover:underline">
                      {sample.full_name || formatNumber(sample.source_id)}
                    </Link>
                  </td>
                  <td className="px-2 py-2 ltr-iso">{sample.mobile || "—"}</td>
                  <td className="px-2 py-2 tabular">{formatNumber(sample.purchase_count)}</td>
                  <td className="px-2 py-2 tabular">{formatNumber(sample.days_since_last_purchase)}</td>
                  <td className="px-2 py-2 tabular">{formatToman(sample.lifetime_purchase_amount)}</td>
                  <td className="px-2 py-2">{tierTitle(sample.from)}</td>
                  <td className="px-2 py-2">{tierTitle(sample.to)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function Bar({ value, max, tone, label }: { value: number; max: number; tone: string; label: string }) {
  return (
    <div className="flex items-center gap-2" title={label}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hover">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="w-20 shrink-0 text-[11px] text-muted tabular">{label}</span>
    </div>
  );
}

function HistoryStep({ state, disabled, onRestore }: { state: TierRulesState; disabled: boolean; onRestore: (version: number) => void }) {
  return (
    <div className="divide-y divide-line">
      {state.versions.map((item) => (
        <div key={item.version} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-ink">نسخه {formatNumber(item.version)}</span>
            <Chip tone={item.status === "active" ? "success" : "accent"}>{item.status === "active" ? "فعال" : "بایگانی"}</Chip>
            <span className="text-muted">{formatDateTime(item.activated_at)}</span>
            <span className="text-muted">{item.activated_by || "—"}</span>
            {item.note ? <span className="text-faint">{item.note}</span> : null}
          </div>
          <Button type="button" variant="quiet" onClick={() => onRestore(item.version)} disabled={disabled}>
            بازگردانی به پیش‌نویس
          </Button>
        </div>
      ))}
    </div>
  );
}

function ConfirmActivation({
  preview,
  tierTitle,
  onCancel,
  onConfirm,
}: {
  preview: TierRulesPreview;
  tierTitle: (code: TierCode | null) => string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-black/40 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="tier-activation-title" className="w-full max-w-md rounded-[24px] bg-surface p-6 shadow-soft">
        <h3 id="tier-activation-title" className="text-[15px] font-semibold text-ink">
          فعال‌سازی نسخه {formatNumber(preview.version)}
        </h3>
        <p className="mt-3 text-sm leading-7 text-muted">
          سطح {formatNumber(preview.moved)} مشتری تغییر می‌کند. محاسبه در پس‌زمینه انجام می‌شود و تا پایان آن قوانین فعلی فعال
          می‌مانند.
        </p>
        {preview.transitions.length ? (
          <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm text-muted">
            {preview.transitions.slice(0, 8).map((item) => (
              <li key={`${item.from}-${item.to}`}>
                {tierTitle(item.from)} ← {tierTitle(item.to)} · <span className="tabular text-ink">{formatNumber(item.count)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-5 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onCancel} autoFocus>
            انصراف
          </Button>
          <Button type="button" onClick={onConfirm}>
            تأیید و فعال‌سازی
          </Button>
        </div>
      </div>
    </div>
  );
}
