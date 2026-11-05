import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Banner,
  Dialog,
  FormGrid,
  LAYER,
  PinField,
  SelectList,
  TextField,
  beep,
  fieldMessage,
  formatTime,
  plainMessage,
  toAppError,
  useDelayedFlag,
  useInitialFocus,
  useKeymap,
  useToast,
  type AppError,
  type Binding,
  type DialogButton,
  type ListItem,
  type UserRow,
} from "@gokul/ui";
import { useApi } from "./apiContext";

type Modal =
  | { kind: "add" }
  | { kind: "reset"; user: UserRow }
  | { kind: "deactivate"; user: UserRow }
  | null;

function statusText(u: UserRow): string {
  if (!u.active) return "Switched off";
  if (u.lockedSecondsLeft > 0) {
    const m = Math.ceil(u.lockedSecondsLeft / 60);
    return `Locked (about ${m} min)`;
  }
  return u.mustChangePin ? "Must change PIN" : "Active";
}

function lastLogin(u: UserRow): string {
  if (!u.lastLoginAt) return "Never signed in";
  const d = new Date(u.lastLoginAt);
  return Number.isNaN(d.getTime()) ? "" : `Last sign-in ${d.getDate()}/${d.getMonth() + 1} ${formatTime(d)}`;
}

export interface UsersProps {
  focusMenu: () => void;
  onApiError: (err: AppError) => boolean;
}

/** Minimal owner-only user admin: list, add cashier, reset PIN, unlock, deactivate. */
export function Users({ focusMenu, onApiError }: UsersProps) {
  const api = useApi();
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const { toast, show } = useToast();
  const slow = useDelayedFlag(rows === null && !loadError);

  useEffect(() => {
    let cancelled = false;
    api.listUsers().then(
      (list) => {
        if (cancelled) return;
        setRows(list);
        setLoadError(false);
        setSelectedId((cur) => (cur !== null && list.some((u) => u.id === cur) ? cur : (list[0]?.id ?? null)));
      },
      (raw: unknown) => {
        if (cancelled) return;
        if (!onApiError(toAppError(raw))) setLoadError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, reload, onApiError]);

  useInitialFocus(() => listRef.current, [rows !== null]);

  const selected = rows?.find((u) => u.id === selectedId) ?? null;

  const replaceRow = useCallback((updated: UserRow) => {
    setRows((cur) => {
      if (!cur) return [updated];
      return cur.some((u) => u.id === updated.id) ? cur.map((u) => (u.id === updated.id ? updated : u)) : [...cur, updated];
    });
    setSelectedId(updated.id);
  }, []);

  const run = useCallback(
    async (action: () => Promise<UserRow>, done: (u: UserRow) => string) => {
      setBanner(null);
      try {
        const updated = await action();
        replaceRow(updated);
        show(done(updated));
      } catch (raw) {
        const err = toAppError(raw);
        if (onApiError(err)) return;
        setBanner(plainMessage(err));
        beep();
      }
    },
    [onApiError, replaceRow, show],
  );

  const needSelection = () => {
    if (selected) return selected;
    setBanner("Choose a user first.");
    return null;
  };

  const bindings = useMemo<Binding[]>(
    () => [
      { keys: ["Up/Down"], label: "Choose" },
      { keys: ["F2"], label: "Add cashier", run: () => setModal({ kind: "add" }) },
      {
        keys: ["F6"],
        label: "Reset PIN",
        run: () => {
          const u = needSelection();
          if (u) setModal({ kind: "reset", user: u });
        },
      },
      {
        keys: ["F8"],
        label: "Unlock",
        run: () => {
          const u = needSelection();
          if (u) void run(() => api.unlockUser(u.id), (x) => `${x.name} can sign in now.`);
        },
      },
      {
        keys: ["F9"],
        label: "Switch off",
        run: () => {
          const u = needSelection();
          if (u) setModal({ kind: "deactivate", user: u });
        },
      },
      { keys: ["Esc"], label: "Back", run: focusMenu },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, api, run, focusMenu],
  );
  useKeymap(bindings, { layer: LAYER.screen });
  const retry = useMemo<Binding[]>(
    () => [
      {
        keys: ["Enter"],
        label: "Try again",
        run: () => {
          setLoadError(false);
          setReload((n) => n + 1);
        },
        when: () => loadError,
      },
    ],
    [loadError],
  );
  useKeymap(retry, { layer: LAYER.screen });

  const items: ListItem[] = (rows ?? []).map((u) => ({
    id: u.id,
    label: u.name,
    right: `${u.role === "owner" ? "Owner" : "Cashier"}  -  ${statusText(u)}`,
  }));

  const closeModal = () => setModal(null);

  return (
    <div>
      <h1 className="gk-content-title">Users</h1>
      {banner ? <Banner kind="error">{banner}</Banner> : null}
      {loadError ? <Banner kind="error">Could not read the users. Press Enter to try again.</Banner> : null}
      {rows === null && !loadError ? <p>{slow ? "Loading users..." : ""}</p> : null}
      {rows !== null ? (
        <SelectList
          items={items}
          selectedId={selectedId}
          filterable={false}
          ariaLabel="Users"
          listRef={(el) => {
            listRef.current = el;
          }}
          onSelect={setSelectedId}
          onChoose={setSelectedId}
          emptyText={() => "No users yet."}
          renderRow={(item) => {
            const u = rows.find((x) => x.id === item.id);
            return (
              <>
                <span>{item.label}</span>
                <span className="gk-muted">{item.right}</span>
                <span className="gk-muted">{u ? lastLogin(u) : ""}</span>
              </>
            );
          }}
        />
      ) : null}
      <p className="gk-hint">Cashiers choose a new PIN the first time they sign in after you add them or reset their PIN.</p>
      {modal?.kind === "add" ? (
        <PinFormDialog
          title="Add cashier"
          saveLabel="Add cashier"
          withName
          onCancel={closeModal}
          onApiError={onApiError}
          submit={async (name, pin) => {
            const created = await api.createUser(name, pin);
            replaceRow(created);
            show(`${created.name} added. They will choose a new PIN at first sign-in.`);
            closeModal();
          }}
        />
      ) : null}
      {modal?.kind === "reset" ? (
        <PinFormDialog
          title={`Reset PIN for ${modal.user.name}`}
          saveLabel="Reset PIN"
          onCancel={closeModal}
          onApiError={onApiError}
          submit={async (_name, pin) => {
            const updated = await api.resetPin(modal.user.id, pin);
            replaceRow(updated);
            show(`PIN reset for ${updated.name}. They must choose a new PIN at next sign-in.`);
            closeModal();
          }}
        />
      ) : null}
      {modal?.kind === "deactivate" ? (
        <ConfirmSwitchOff
          user={modal.user}
          onCancel={closeModal}
          onConfirm={() => {
            const u = modal.user;
            closeModal();
            void run(() => api.deactivateUser(u.id), (x) => `${x.name} has been switched off.`);
          }}
        />
      ) : null}
      {toast}
    </div>
  );
}

function ConfirmSwitchOff({ user, onCancel, onConfirm }: { user: UserRow; onCancel: () => void; onConfirm: () => void }) {
  const buttons: DialogButton[] = [
    { label: "Keep user", isDefault: true, onPress: onCancel },
    { label: "Switch off", keys: ["S"], variant: "danger", onPress: onConfirm },
  ];
  return (
    <Dialog title={`Switch off ${user.name}?`} buttons={buttons} onCancel={onCancel} cancelLabel="Cancel">
      <p>{`${user.name} will not be able to sign in. Their old bills stay as they are.`}</p>
    </Dialog>
  );
}

interface PinFormDialogProps {
  title: string;
  saveLabel: string;
  withName?: boolean;
  onCancel: () => void;
  onApiError: (err: AppError) => boolean;
  submit: (name: string, pin: string) => Promise<void>;
}

function PinFormDialog({ title, saveLabel, withName, onCancel, onApiError, submit }: PinFormDialogProps) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ name?: string; pin?: string; confirm?: string; general?: string }>({});
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const pinRef = useRef<HTMLInputElement | null>(null);

  const go = async () => {
    if (busy.current) return;
    if (pin !== confirm) {
      setErrors({ confirm: "The two PINs do not match. Type them again." });
      setPin("");
      setConfirm("");
      beep();
      pinRef.current?.focus();
      return;
    }
    busy.current = true;
    setSaving(true);
    setErrors({});
    try {
      await submit(name, pin);
    } catch (raw) {
      const err = toAppError(raw);
      if (onApiError(err)) return;
      const nameMsg = fieldMessage(err, "name");
      const pinMsg = fieldMessage(err, "pin") ?? fieldMessage(err, "newPin");
      if (nameMsg || pinMsg) {
        setErrors({ ...(nameMsg ? { name: nameMsg } : {}), ...(pinMsg ? { pin: pinMsg } : {}) });
        if (pinMsg) {
          setPin("");
          setConfirm("");
        }
        (nameMsg ? nameRef.current : pinRef.current)?.focus();
      } else {
        setErrors({ general: plainMessage(err) });
      }
      beep();
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const buttons: DialogButton[] = [
    { label: saveLabel, keys: ["F10", "Ctrl+S"], variant: "primary", onPress: () => void go() },
  ];

  return (
    <Dialog
      title={title}
      buttons={buttons}
      onCancel={onCancel}
      cancelLabel="Cancel"
      initialFocus={() => (withName ? nameRef.current : pinRef.current)}
    >
      {errors.general ? <Banner kind="error">{errors.general}</Banner> : null}
      <FormGrid onLast={() => void go()}>
        {withName ? (
          <TextField
            label="Name"
            name="name"
            stacked
            value={name}
            onChange={setName}
            error={errors.name}
            readOnly={saving}
            inputRef={nameRef}
            maxLength={40}
          />
        ) : null}
        <PinField label="PIN (4 to 6 digits)" name="pin" value={pin} onChange={setPin} error={errors.pin} readOnly={saving} inputRef={pinRef} />
        <PinField label="Confirm PIN" name="confirmPin" value={confirm} onChange={setConfirm} error={errors.confirm} readOnly={saving} />
      </FormGrid>
    </Dialog>
  );
}
