import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Banner,
  Button,
  FormGrid,
  LAYER,
  TextField,
  beep,
  plainMessage,
  toAppError,
  useDelayedFlag,
  useInitialFocus,
  useKeymap,
  useToast,
  useUnsavedGuard,
  useUnsavedGuardContext,
  type AppError,
  type Binding,
  type ShopSettings,
} from "@gokul/ui";
import { useApi } from "./apiContext";
import { FIELDS, gstinStateHint, groupPhone, hintFor, type SettingsKey } from "./settingsHints";

type FormValues = Record<SettingsKey, string>;
type Errors = Partial<Record<SettingsKey, string>>;

function toForm(s: ShopSettings): FormValues {
  return { ...s, phone: groupPhone(s.phone) };
}

export interface SettingsProps {
  /** Esc: move focus to the menu. */
  focusMenu: () => void;
  /** After a valid save (the shell refreshes the status bar and the "shop not set up" banner). */
  onSaved: () => void;
  /** Return true if the error was handled (session gone -> lock screen). */
  onApiError: (err: AppError) => boolean;
}

export function Settings({ focusMenu, onSaved, onApiError }: SettingsProps) {
  const api = useApi();
  const { requestLeave } = useUnsavedGuardContext();
  const [load, setLoad] = useState<"loading" | "error" | "ready">("loading");
  const [reload, setReload] = useState(0);
  const [baseline, setBaseline] = useState<FormValues | null>(null);
  const [form, setForm] = useState<FormValues | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  const saveBtn = useRef<HTMLButtonElement | null>(null);
  const { toast, show } = useToast();
  const slow = useDelayedFlag(load === "loading");

  useEffect(() => {
    let cancelled = false;
    api.getShopSettings().then(
      (s) => {
        if (cancelled) return;
        const f = toForm(s);
        setBaseline(f);
        setForm(f);
        setLoad("ready");
      },
      (raw: unknown) => {
        if (cancelled) return;
        const err = toAppError(raw);
        if (!onApiError(err)) setLoad("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, reload, onApiError]);

  const field = useCallback(
    (key: SettingsKey) => wrap.current?.querySelector<HTMLInputElement>(`input[data-gk-field="${key}"]`) ?? null,
    [],
  );
  useInitialFocus(() => field("shopName"), [load]);

  const dirty = form !== null && baseline !== null && FIELDS.some((f) => form[f.key] !== baseline[f.key]);

  const save = useCallback(async (): Promise<boolean> => {
    if (busy.current || form === null) return false; // extra F10 while saving is ignored
    busy.current = true;
    setSaving(true);
    setBanner(null);
    try {
      const saved = await api.saveShopSettings({ ...form, phone: form.phone });
      const f = toForm(saved);
      setBaseline(f);
      setForm(f);
      setErrors({});
      show("Shop details saved.");
      onSaved();
      return true;
    } catch (raw) {
      const err = toAppError(raw);
      if (onApiError(err)) return false;
      if (err.code === "VALIDATION" && err.fields && err.fields.length > 0) {
        const next: Errors = {};
        for (const fe of err.fields) {
          if (FIELDS.some((f) => f.key === fe.field)) next[fe.field as SettingsKey] = fe.message;
        }
        setErrors(next);
        const wrong = FIELDS.filter((f) => next[f.key] !== undefined);
        if (wrong.length > 0) {
          setBanner(`${wrong.length} ${wrong.length === 1 ? "field needs" : "fields need"} fixing.`);
          const first = wrong[0];
          if (first) setTimeout(() => field(first.key)?.focus(), 0);
        } else {
          setBanner(plainMessage(err));
        }
        beep();
      } else {
        setBanner("Could not save. Your changes are still on screen. Press F10 to try again.");
      }
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, [api, form, field, onApiError, onSaved, show]);

  useUnsavedGuard(
    form !== null
      ? {
          dirty,
          what: "the shop details",
          discard: () => {
            setForm(baseline);
            setErrors({});
            setBanner(null);
          },
          save,
        }
      : null,
  );

  const bindings = useMemo<Binding[]>(
    () => [
      { keys: ["Enter"], label: "Next field" },
      { keys: ["F10"], label: "Save", run: () => void save() },
      { keys: ["Ctrl+S"], label: "Save", run: () => void save() },
      { keys: ["Esc"], label: "Back", run: () => requestLeave(focusMenu) },
    ],
    [save, requestLeave, focusMenu],
  );
  useKeymap(bindings, { layer: LAYER.screen });
  const retry = useMemo<Binding[]>(
    () => [
      {
        keys: ["Enter"],
        label: "Try again",
        run: () => {
          setLoad("loading");
          setReload((n) => n + 1);
        },
        when: () => load === "error",
      },
    ],
    [load],
  );
  useKeymap(retry, { layer: LAYER.screen });

  if (load === "loading") return <div>{slow ? "Loading settings..." : null}</div>;
  if (load === "error" || form === null) {
    return (
      <div>
        <h1 className="gk-content-title">Settings - Shop details</h1>
        <Banner kind="error">Could not read the settings. Press Enter to try again.</Banner>
      </div>
    );
  }

  const set = (key: SettingsKey, value: string) => {
    setForm({ ...form, [key]: value });
    if (errors[key] !== undefined) setErrors({ ...errors, [key]: undefined });
  };
  const blur = (key: SettingsKey) => {
    const hint = hintFor(key, form[key]);
    if (hint !== errors[key]) setErrors({ ...errors, [key]: hint });
  };

  return (
    <div ref={wrap} className="gk-form">
      <h1 className="gk-content-title">
        Settings - Shop details <span className="gk-muted">(* required)</span>
      </h1>
      {banner ? <Banner kind="error">{banner}</Banner> : null}
      <FormGrid onLast={() => saveBtn.current?.focus()}>
        {FIELDS.map((f) => (
          <TextField
            key={f.key}
            name={f.key}
            label={f.label}
            required={f.required}
            maxLength={f.maxLength}
            transform={f.transform}
            value={form[f.key]}
            onChange={(v) => set(f.key, v)}
            onBlur={() => blur(f.key)}
            error={errors[f.key]}
            readOnly={saving}
            meta={
              f.key === "shopName"
                ? `${form.shopName.length}/40`
                : f.key === "gstin"
                  ? gstinStateHint(form.gstin)
                  : undefined
            }
            hint={
              f.key === "billFooter" ? "Tamil text will print only if the bill printer supports it (to be confirmed)." : undefined
            }
          />
        ))}
      </FormGrid>
      <div className="gk-actions">
        <Button
          label="Save"
          keyHint="F10 / Ctrl+S"
          variant="primary"
          buttonRef={saveBtn}
          onClick={() => void save()}
        />
        {saving ? <span>Saving...</span> : dirty ? <span className="gk-warn-text">Unsaved changes</span> : null}
      </div>
      {toast}
    </div>
  );
}
