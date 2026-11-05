import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { useLatest } from "./hooks";
import { isComposing } from "./keymap";

/* ------------------------------------------------------------------ Button */

export interface ButtonProps {
  label: string;
  /** Key shown in the label, e.g. "F10" -> "Save  (F10)". */
  keyHint?: string;
  variant?: "primary" | "secondary" | "danger";
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  buttonRef?: Ref<HTMLButtonElement>;
  /** Mouse/keyboard clicks only; used by dialogs so Tab cycles correctly. */
  tabIndex?: number;
}

export function Button({
  label,
  keyHint,
  variant = "secondary",
  onClick,
  disabled,
  type = "button",
  buttonRef,
  tabIndex,
}: ButtonProps) {
  return (
    <button
      type={type}
      ref={buttonRef}
      className={`gk-btn gk-btn-${variant}`}
      onClick={onClick}
      disabled={disabled}
      tabIndex={tabIndex}
    >
      {label}
      {keyHint ? <span className="gk-btn-key">{`  (${keyHint})`}</span> : null}
    </button>
  );
}

/* --------------------------------------------------------------- TextField */

export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Field name used for Enter-to-next-field and tests. */
  name: string;
  error?: string | undefined;
  hint?: ReactNode;
  /** Small text to the right of the input, e.g. "10/40". */
  meta?: ReactNode;
  required?: boolean;
  maxLength?: number;
  transform?: "upper" | "digits";
  readOnly?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  stacked?: boolean;
  inputMode?: "text" | "numeric" | "tel";
}

export function applyTransform(value: string, transform: TextFieldProps["transform"]): string {
  if (transform === "upper") return value.toUpperCase();
  if (transform === "digits") return value.replace(/\D+/g, "");
  return value;
}

export function TextField({
  label,
  value,
  onChange,
  onBlur,
  name,
  error,
  hint,
  meta,
  required,
  maxLength,
  transform,
  readOnly,
  inputRef,
  stacked,
  inputMode,
}: TextFieldProps) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={stacked ? "gk-field gk-field-stack" : "gk-field"}>
      <label className="gk-label" htmlFor={id}>
        {label}
        {required ? <span className="gk-required"> *</span> : null}
      </label>
      <div>
        <div className="gk-field-meta">
          <input
            id={id}
            ref={inputRef}
            className="gk-input"
            data-gk-field={name}
            name={name}
            type="text"
            autoComplete="off"
            spellCheck={false}
            inputMode={inputMode}
            value={value}
            readOnly={readOnly}
            maxLength={maxLength}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(applyTransform(e.target.value, transform))}
            onBlur={onBlur}
          />
          {meta ? <span className="gk-muted">{meta}</span> : null}
        </div>
        {error ? (
          <div id={errId} className="gk-error-text">
            {`! ${error}`}
          </div>
        ) : null}
        {hint ? (
          <div id={hintId} className="gk-hint">
            {hint}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Enter moves to the next field (marked data-gk-field); on the last field `onLast` runs.
 * Put the returned handler on the form container.
 */
export function useEnterNext(onLast: () => void) {
  const onLastRef = useLatest(onLast);
  return useCallback((e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== "Enter" || isComposing(e)) return;
    const target = e.target;
    if (!(target instanceof HTMLInputElement) || target.dataset.gkField === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    const fields = Array.from(e.currentTarget.querySelectorAll<HTMLInputElement>("input[data-gk-field]")).filter(
      (f) => !f.readOnly && !f.disabled,
    );
    const i = fields.indexOf(target);
    const next = fields[i + 1];
    if (next) next.focus();
    else onLastRef.current();
  }, [onLastRef]);
}

/* --------------------------------------------------------------- PinField */

/** More than this many characters arriving faster than BURST_MS apart = a barcode scan. */
export const BURST_CHARS = 6;
export const BURST_MS = 30;

export interface PinFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  onEscape?: () => void;
  /** Called when a barcode-scanner burst was typed into the PIN box (the box has been cleared). */
  onScan?: () => void;
  onNumLockOff?: () => void;
  readOnly?: boolean;
  error?: string | undefined;
  name?: string;
  inputRef?: Ref<HTMLInputElement>;
  stacked?: boolean;
  maxDigits?: number;
}

export function PinField({
  label,
  value,
  onChange,
  onSubmit,
  onEscape,
  onScan,
  onNumLockOff,
  readOnly,
  error,
  name = "pin",
  inputRef,
  stacked = true,
  maxDigits = 6,
}: PinFieldProps) {
  const id = useId();
  const errId = `${id}-err`;
  // A scanner types its whole code (and Enter) in a few milliseconds. Once a burst is seen, the rest of
  // that burst, including its Enter, is swallowed so it can never count as a wrong PIN.
  const burst = useRef({ count: 0, last: 0, scanning: false });

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digits = raw.replace(/\D+/g, "");
    const added = digits.length - value.length;
    if (added > 0) {
      const now = performance.now();
      const b = burst.current;
      const fast = now - b.last < BURST_MS;
      b.last = now;
      if (!fast) {
        b.count = added;
        b.scanning = false;
      } else {
        b.count += added;
      }
      if (b.scanning) {
        onChange("");
        return;
      }
      if (b.count > BURST_CHARS) {
        b.scanning = true;
        onChange("");
        onScan?.();
        return;
      }
    }
    onChange(digits.slice(0, maxDigits));
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (isComposing(e)) return;
    if (/^Numpad/.test(e.code) && !/^\d$/.test(e.key) && !e.getModifierState("NumLock")) {
      onNumLockOff?.();
    }
    if (e.key === "Enter" && onSubmit) {
      e.preventDefault();
      e.stopPropagation();
      const b = burst.current;
      if (b.scanning && performance.now() - b.last < BURST_MS * 3) {
        b.scanning = false; // the Enter that ends a scan: not a PIN
        return;
      }
      if (!readOnly) onSubmit();
    } else if (e.key === "Escape" && onEscape) {
      e.preventDefault();
      e.stopPropagation();
      onEscape();
    } else if (e.key.length === 1 && !/\d/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault(); // digits only
    }
  };

  return (
    <div className={stacked ? "gk-field gk-field-stack" : "gk-field"}>
      <label className="gk-label" htmlFor={id}>
        {label}
      </label>
      <div>
        <input
          id={id}
          ref={inputRef}
          className="gk-input gk-input-pin"
          data-gk-field={name}
          name={name}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          readOnly={readOnly}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        {error ? (
          <div id={errId} className="gk-error-text">
            {`! ${error}`}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- SelectList */

export interface ListItem {
  id: number | string;
  /** Text used for type-to-filter and shown on the left. */
  label: string;
  /** Shown on the right (e.g. role). */
  right?: string;
}

export interface SelectListProps {
  items: ListItem[];
  selectedId: number | string | null;
  onSelect: (id: number | string) => void;
  onChoose: (id: number | string) => void;
  /** Esc with no filter to clear. */
  onEscape?: () => void;
  /** Digit typed in the list (a PIN typed too early must not filter). */
  onDigit?: () => void;
  filterable?: boolean;
  emptyText?: (filter: string) => string;
  filterLabel?: string;
  ariaLabel: string;
  listRef?: (el: HTMLDivElement | null) => void;
  /** Replace the default row (label left, right text on the right). */
  renderRow?: (item: ListItem) => ReactNode;
}

/** Match at the start of any word, case-insensitive. Tamil works because it is plain string compare. */
export function matchesFilter(label: string, filter: string): boolean {
  if (filter === "") return true;
  const f = filter.toLocaleLowerCase();
  return label
    .toLocaleLowerCase()
    .split(/\s+/)
    .some((w) => w.startsWith(f)) || label.toLocaleLowerCase().startsWith(f);
}

export function SelectList({
  items,
  selectedId,
  onSelect,
  onChoose,
  onEscape,
  onDigit,
  filterable = true,
  emptyText,
  filterLabel = "Filter",
  ariaLabel,
  listRef,
  renderRow,
}: SelectListProps) {
  const [filter, setFilter] = useState("");
  const baseId = useId();
  const visible = items.filter((i) => matchesFilter(i.label, filter));
  const selectedIndex = visible.findIndex((i) => i.id === selectedId);
  const innerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = innerRef.current?.querySelector('[aria-selected="true"]');
    if (el && "scrollIntoView" in el) (el as HTMLElement).scrollIntoView({ block: "nearest" });
  }, [selectedId, filter]);

  const move = (index: number) => {
    const item = visible[Math.max(0, Math.min(visible.length - 1, index))];
    if (item) onSelect(item.id);
  };

  const applyFilter = (next: string) => {
    setFilter(next);
    const vis = items.filter((i) => matchesFilter(i.label, next));
    if (!vis.some((i) => i.id === selectedId) && vis[0]) onSelect(vis[0].id);
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isComposing(e)) return;
    const used = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    switch (e.key) {
      case "ArrowDown":
        used();
        move(selectedIndex < 0 ? 0 : selectedIndex + 1);
        return;
      case "ArrowUp":
        used();
        move(selectedIndex < 0 ? 0 : selectedIndex - 1);
        return;
      case "Home":
        used();
        move(0);
        return;
      case "End":
        used();
        move(visible.length - 1);
        return;
      case "PageDown":
        used();
        move(selectedIndex + 8);
        return;
      case "PageUp":
        used();
        move(selectedIndex - 8);
        return;
      case "Enter": {
        used();
        const item = visible[selectedIndex];
        if (item) onChoose(item.id);
        return;
      }
      case "Backspace":
        if (filterable && filter !== "") {
          used();
          applyFilter(filter.slice(0, -1));
        }
        return;
      case "Escape":
        if (filterable && filter !== "") {
          used();
          applyFilter("");
        } else if (onEscape) {
          used();
          onEscape();
        }
        return;
      default:
        break;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (/\d/.test(e.key) && onDigit) {
        used();
        onDigit();
        return;
      }
      if (filterable && (e.key !== " " || filter !== "")) {
        used();
        applyFilter(filter + e.key);
      }
    }
  };

  const setRefs = (el: HTMLDivElement | null) => {
    innerRef.current = el;
    listRef?.(el);
  };

  return (
    <div>
      {filterable ? (
        <div className="gk-filter-line">{filter !== "" ? `${filterLabel}: ${filter}` : ""}</div>
      ) : null}
      <div
        ref={setRefs}
        className="gk-list"
        role="listbox"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-activedescendant={selectedIndex >= 0 ? `${baseId}-${String(visible[selectedIndex]?.id)}` : undefined}
        onKeyDown={handleKeyDown}
      >
        {visible.length === 0 ? (
          <div className="gk-list-empty">{emptyText ? emptyText(filter) : "Nothing to show."}</div>
        ) : (
          visible.map((item) => (
            <div
              key={item.id}
              id={`${baseId}-${String(item.id)}`}
              role="option"
              aria-selected={item.id === selectedId}
              className="gk-list-row gk-tamil-safe"
              onClick={() => {
                onSelect(item.id);
                onChoose(item.id);
              }}
            >
              {renderRow ? (
                renderRow(item)
              ) : (
                <>
                  <span>{item.label}</span>
                  {item.right ? <span className="gk-muted">{item.right}</span> : null}
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Banner */

export function Banner({
  kind,
  children,
  bannerRef,
}: {
  kind: "info" | "warn" | "error" | "ok";
  children: ReactNode;
  bannerRef?: Ref<HTMLDivElement>;
}) {
  const prefix = kind === "warn" ? "Warning: " : kind === "error" ? "Error: " : "";
  return (
    <div ref={bannerRef} className={`gk-banner gk-banner-${kind}`} role={kind === "error" ? "alert" : "status"}>
      {prefix}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------- Toast */

/** One short message, gone after 4 s or on the next key press. A new toast replaces the old one. */
export function useToast(): { toast: ReactNode; show: (message: string) => void } {
  const [state, setState] = useState<{ text: string; n: number } | null>(null);
  const n = useRef(0);
  useEffect(() => {
    if (state === null) return;
    const timer = setTimeout(() => setState(null), 4000);
    const onKey = () => setState(null);
    window.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [state]);
  const show = useCallback((message: string) => {
    n.current += 1;
    setState({ text: message, n: n.current });
  }, []);
  const toast = state ? (
    <div className="gk-toast" role="status" key={state.n}>
      {state.text}
    </div>
  ) : null;
  return { toast, show };
}

/* ---------------------------------------------------------------- FormGrid */

/** Two-column label/field layout. Enter moves to the next field; on the last field `onLast` runs. */
export function FormGrid({ onLast, children }: { onLast: () => void; children: ReactNode }) {
  const onKeyDown = useEnterNext(onLast);
  return (
    <div className="gk-form" onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}
