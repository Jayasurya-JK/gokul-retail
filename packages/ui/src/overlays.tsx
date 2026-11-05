import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Button } from "./controls";
import { useLatest } from "./hooks";
import { LAYER, useActiveBindings, useKeymap, type Binding } from "./keymap";

/* ------------------------------------------------------------------ Dialog */

export interface DialogButton {
  label: string;
  /** Key combos that press this button, e.g. ["D"]. */
  keys?: string[];
  /** Pressed by Enter. Make it the data-safe choice. */
  isDefault?: boolean;
  variant?: "primary" | "secondary" | "danger";
  onPress: () => void;
}

export interface DialogProps {
  title: string;
  children?: ReactNode;
  buttons: DialogButton[];
  /** Esc. Leave out to make Esc do nothing. */
  onCancel?: () => void;
  /** Label for the Esc hint, e.g. "Stay". */
  cancelLabel?: string;
  /** Focus this element first (a form field). Default: the default button. */
  initialFocus?: () => HTMLElement | null;
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function Dialog({ title, children, buttons, onCancel, cancelLabel, initialFocus }: DialogProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const defaultRef = useRef<HTMLButtonElement>(null);
  const initialRef = useLatest(initialFocus);

  const bindings = useMemo<Binding[]>(() => {
    const list: Binding[] = [];
    for (const b of buttons) {
      const keys = [...(b.isDefault ? ["Enter"] : []), ...(b.keys ?? [])];
      if (keys.length > 0) list.push({ keys, label: b.label, run: b.onPress });
    }
    if (onCancel) list.push({ keys: ["Esc"], label: cancelLabel ?? "Cancel", run: onCancel });
    return list;
  }, [buttons, onCancel, cancelLabel]);
  useKeymap(bindings, { layer: LAYER.dialog, modal: true });

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = initialRef.current?.() ?? defaultRef.current ?? boxRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
    return () => {
      if (opener && opener.isConnected && opener !== document.body) opener.focus();
    };
  }, [initialRef]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !boxRef.current) return;
    const items = Array.from(boxRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="gk-backdrop">
      <div
        ref={boxRef}
        className="gk-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={onKeyDown}
      >
        <div className="gk-dialog-title">{title}</div>
        <div className="gk-tamil-safe">{children}</div>
        <div className="gk-dialog-buttons">
          {buttons.map((b) => {
            const hint = b.isDefault ? "Enter" : b.keys?.[0];
            return (
              <Button
                key={b.label}
                label={b.label}
                keyHint={hint}
                variant={b.variant ?? (b.isDefault ? "primary" : "secondary")}
                onClick={b.onPress}
                buttonRef={b.isDefault ? defaultRef : undefined}
              />
            );
          })}
          {onCancel ? <Button label={cancelLabel ?? "Cancel"} keyHint="Esc" onClick={onCancel} /> : null}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- HelpOverlay */

/** F1: every key that works on this screen, from the live keymap. */
export function HelpOverlay({ onClose }: { onClose: () => void }) {
  const bindings = useActiveBindings();
  const keymap = useMemo<Binding[]>(
    () => [{ keys: ["Esc", "F1"], label: "Close help", run: onClose, silent: true }],
    [onClose],
  );
  useKeymap(keymap, { layer: LAYER.lock, modal: true });
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    boxRef.current?.focus();
    return () => {
      if (opener && opener.isConnected && opener !== document.body) opener.focus();
    };
  }, []);
  return (
    <div className="gk-backdrop">
      <div ref={boxRef} className="gk-dialog" role="dialog" aria-modal="true" aria-label="Keys" tabIndex={-1}>
        <div className="gk-dialog-title">Keys on this screen</div>
        <ul className="gk-help">
          {bindings.map((b) => (
            <li key={b.keys.join("|") + b.label}>
              <span className="gk-keycap">{b.keys.join(" or ")}</span>
              <span>{b.label}</span>
            </li>
          ))}
        </ul>
        <div className="gk-hint">Esc closes this list.</div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- Unsaved guard */

export interface UnsavedGuard {
  dirty: boolean;
  /** "the shop details" -> "You changed the shop details and have not saved them." */
  what: string;
  /** Put the screen back to what is saved (Discard). */
  discard: () => void;
  /** Returns true when saved; false when validation failed (the screen then shows its errors). */
  save: () => Promise<boolean>;
}

interface GuardContextValue {
  setGuard: (g: UnsavedGuard | null) => void;
  /** Runs `proceed` now, or after the user chose Save/Discard in the dialog. */
  requestLeave: (proceed: () => void) => void;
  /** Description of unsaved work, or null. */
  unsavedWhat: () => string | null;
}

const GuardContext = createContext<GuardContextValue | null>(null);

export function UnsavedGuardProvider({ children }: { children: ReactNode }) {
  const guardRef = useRef<UnsavedGuard | null>(null);
  const [pending, setPending] = useState<{ proceed: () => void; what: string } | null>(null);

  const setGuard = useCallback((g: UnsavedGuard | null) => {
    guardRef.current = g;
  }, []);
  const unsavedWhat = useCallback(() => (guardRef.current?.dirty ? guardRef.current.what : null), []);
  const requestLeave = useCallback((proceed: () => void) => {
    const g = guardRef.current;
    if (g?.dirty) setPending({ proceed, what: g.what });
    else proceed();
  }, []);
  const value = useMemo(() => ({ setGuard, requestLeave, unsavedWhat }), [setGuard, requestLeave, unsavedWhat]);

  const close = useCallback(() => setPending(null), []);
  const buttons = useMemo<DialogButton[]>(
    () => [
      {
        label: "Save and leave",
        isDefault: true,
        onPress: () => {
          const proceed = pending?.proceed;
          const guard = guardRef.current;
          setPending(null);
          if (!guard || !proceed) return;
          void guard.save().then((ok) => {
            if (ok) proceed();
          });
        },
      },
      {
        label: "Discard changes",
        keys: ["D"],
        variant: "danger",
        onPress: () => {
          const proceed = pending?.proceed;
          setPending(null);
          guardRef.current?.discard();
          guardRef.current = null;
          proceed?.();
        },
      },
    ],
    [pending],
  );

  return (
    <GuardContext.Provider value={value}>
      {children}
      {pending ? (
        <Dialog title="Save changes?" buttons={buttons} onCancel={close} cancelLabel="Stay">
          <p>{`You changed ${pending.what} and have not saved them.`}</p>
        </Dialog>
      ) : null}
    </GuardContext.Provider>
  );
}

export function useUnsavedGuardContext(): GuardContextValue {
  const ctx = useContext(GuardContext);
  if (!ctx) throw new Error("UnsavedGuardProvider is missing");
  return ctx;
}

/** A screen with editable data publishes its dirty state here. Pass null when there is nothing to guard. */
export function useUnsavedGuard(guard: UnsavedGuard | null): void {
  const { setGuard } = useUnsavedGuardContext();
  useEffect(() => {
    setGuard(guard);
  });
  useEffect(() => () => setGuard(null), [setGuard]);
}
