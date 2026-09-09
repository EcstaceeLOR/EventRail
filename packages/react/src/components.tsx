"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Button({
  className,
  variant = "primary",
  loading = false,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}) {
  return (
    <button
      className={classes("er-button", `er-button--${variant}`, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="er-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Card({
  className,
  elevated = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { elevated?: boolean }) {
  return <div className={classes("er-card", elevated && "er-card--elevated", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  return (
    <label className={classes("er-field", className)} htmlFor={inputId}>
      <span className="er-field__label">{label}</span>
      <input
        id={inputId}
        className="er-field__input"
        aria-invalid={Boolean(error)}
        aria-describedby={hint || error ? messageId : undefined}
        {...props}
      />
      {error || hint ? (
        <span id={messageId} className={classes("er-field__message", error && "er-field__message--error")}>
          {error ?? hint}
        </span>
      ) : null}
    </label>
  );
}

export function Tabs({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: ReadonlyArray<{ id: string; label: ReactNode; panel: ReactNode }>;
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}) {
  const selected = tabs.find((tab) => tab.id === value) ?? tabs[0];
  const move = (index: number, direction: number) => {
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    if (next) onChange(next.id);
  };
  return (
    <div className="er-tabs">
      <div className="er-tabs__list" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab, index) => (
          <button
            id={`${tab.id}-tab`}
            aria-controls={`${tab.id}-panel`}
            aria-selected={tab.id === selected?.id}
            className="er-tabs__tab"
            key={tab.id}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") move(index, 1);
              if (event.key === "ArrowLeft") move(index, -1);
            }}
            role="tab"
            tabIndex={tab.id === selected?.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      {selected ? (
        <div
          id={`${selected.id}-panel`}
          aria-labelledby={`${selected.id}-tab`}
          className="er-tabs__panel"
          role="tabpanel"
        >
          {selected.panel}
        </div>
      ) : null}
    </div>
  );
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="er-dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="er-dialog__surface">
        <div className="er-dialog__heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button className="er-icon-button" type="button" aria-label="Close dialog" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export type ToastInput = { title: string; message?: string; tone?: "info" | "success" | "warning" | "error" };
type ToastItem = ToastInput & { id: number };
const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const sequence = useRef(0);
  const push = useCallback((toast: ToastInput) => {
    const id = ++sequence.current;
    setToasts((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 5_000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="er-toasts" aria-live="polite" aria-label="Notifications">
        {toasts.map((toast) => (
          <div
            className={classes("er-toast", `er-toast--${toast.tone ?? "info"}`)}
            key={toast.id}
            role="status"
          >
            <div>
              <strong>{toast.title}</strong>
              {toast.message ? <p>{toast.message}</p> : null}
            </div>
            <button
              className="er-icon-button"
              aria-label="Dismiss notification"
              type="button"
              onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider.");
  return context;
}

export type DataTableColumn<Row> = { key: string; header: string; render: (row: Row) => ReactNode };
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  empty,
  caption,
}: {
  columns: ReadonlyArray<DataTableColumn<Row>>;
  rows: ReadonlyArray<Row>;
  rowKey: (row: Row) => string;
  empty: ReactNode;
  caption: string;
}) {
  if (rows.length === 0) return <div className="er-empty">{empty}</div>;
  return (
    <div className="er-table-wrap">
      <table className="er-table">
        <caption className="er-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Skeleton({
  width = "100%",
  height = "1rem",
  className,
}: {
  width?: string;
  height?: string;
  className?: string;
}) {
  return <span className={classes("er-skeleton", className)} style={{ width, height }} aria-hidden="true" />;
}

export function Sparkline({ values, label }: { values: ReadonlyArray<number>; label: string }) {
  const points = useMemo(() => {
    if (values.length < 2) return "0,20 100,20";
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values
      .map((value, index) => `${(index / (values.length - 1)) * 100},${38 - ((value - min) / range) * 36}`)
      .join(" ");
  }, [values]);
  return (
    <svg
      className="er-sparkline"
      role="img"
      aria-label={label}
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
    >
      <polyline points={points} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "live" | "success" | "warning" | "danger";
}) {
  return <span className={classes("er-status", `er-status--${tone}`)}>{children}</span>;
}
