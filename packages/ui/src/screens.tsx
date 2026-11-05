import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LoginUser, SessionInfo } from "./api-types";
import { Banner, Button, PinField, SelectList, useEnterNext, type ListItem } from "./controls";
import { fieldMessage, plainMessage, toAppError } from "./errors";
import { formatTime } from "./format";
import { useCountdown, useDelayedFlag, useInitialFocus, useLatest } from "./hooks";
import { Dialog, type DialogButton } from "./overlays";
import { StatusBar, AppFrame, KeyLegend } from "./layout";
import { LAYER, beep, useKeymap, type Binding } from "./keymap";

/* ---------------------------------------------------------- BlockingScreen */

export interface BlockingScreenProps {
  title: string;
  /** What happened, in plain words. */
  children?: ReactNode;
  /** Numbered "What to do" list. */
  steps?: string[];
  /** Keys that work here (shown in the legend). Nothing else works. */
  keys?: Binding[];
  /** Small line for IT: code and log folder. */
  itLine?: string;
}

/** Full-content message for states where nothing else can be done. Focus sits on the screen. */
export function BlockingScreen({ title, children, steps, keys = [], itLine }: BlockingScreenProps) {
  const ref = useRef<HTMLDivElement>(null);
  useInitialFocus(() => ref.current);
  useKeymap(keys, { layer: LAYER.screen });
  return (
    <div ref={ref} className="gk-blocking" tabIndex={-1} role="alert">
      <h1 className="gk-blocking-title">{title}</h1>
      <div className="gk-tamil-safe">{children}</div>
      {steps && steps.length > 0 ? (
        <>
          <p className="gk-section-title">What to do:</p>
          <ol>
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </>
      ) : null}
      {itLine ? <p className="gk-it-line">{itLine}</p> : null}
    </div>
  );
}

/** A blocking screen inside a minimal frame: app name, clock, and the keys that work. */
export function BlockingFrame({ appName, ...rest }: BlockingScreenProps & { appName: string }) {
  return (
    <AppFrame statusBar={<StatusBar shopName={appName} />} legend={<KeyLegend mode="list" />}>
      <BlockingScreen {...rest} />
    </AppFrame>
  );
}

/* -------------------------------------------------------------- ComingSoon */

export function ComingSoon({ title }: { title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useInitialFocus(() => ref.current);
  return (
    <div ref={ref} tabIndex={-1}>
      <h1 className="gk-content-title">{title}</h1>
      <p>Coming soon. This screen will be added in a later update.</p>
    </div>
  );
}

/* --------------------------------------------------------------- PinPrompt */

interface Message {
  kind: "error" | "info";
  text: string;
}

export interface PinPromptProps {
  userName: string;
  /** Resolve = signed in (the caller moves on). Reject with the AppError from the backend. */
  check: (pin: string) => Promise<void>;
  onEscape?: () => void;
  /** Told when the user becomes locked out (true) or the lock ends (false). */
  onLockedChange?: (locked: boolean) => void;
  /** The backend says this user no longer exists or was switched off. */
  onUserGone?: () => void;
  pinRef?: (el: HTMLInputElement | null) => void;
}

/** "Too many wrong PINs. Ravi cannot sign in for 30 more seconds." Ticks every second, ends at 0. */
export function LockedNotice({
  userName,
  seconds,
  onDone,
  what = "PINs",
  advice = "Ask the owner to unlock, or choose another name.",
}: {
  userName: string;
  seconds: number;
  onDone: () => void;
  what?: string;
  advice?: string;
}) {
  const left = useCountdown(seconds);
  const [until] = useState(() => new Date(Date.now() + seconds * 1000));
  useEffect(() => {
    if (left <= 0) onDone();
  }, [left, onDone]);
  const long = left >= 120;
  const amount = long ? `${Math.ceil(left / 60)} more minutes` : `${left} more ${left === 1 ? "second" : "seconds"}`;
  return (
    <div role="alert" className="gk-banner gk-banner-error">
      {`Too many wrong ${what}. ${userName} cannot sign in for ${amount}${long ? ` (until ${formatTime(until)})` : ""}. ${advice}`}
    </div>
  );
}

/**
 * PIN entry with all the shared rules: masked digits, Enter checks once, wrong-PIN count,
 * lock-out notice, scanner burst, Num Lock. It only shows what the backend decided.
 */
export function PinPrompt({ userName, check, onEscape, onLockedChange, onUserGone, pinRef }: PinPromptProps) {
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [checking, setChecking] = useState(false);
  const [lock, setLock] = useState<number | null>(null);
  const busy = useRef(false);
  const lockRef = useLatest(onLockedChange);
  const inputEl = useRef<HTMLInputElement | null>(null);
  const wasLocked = useRef(false);
  const setInput = (el: HTMLInputElement | null) => {
    inputEl.current = el;
    pinRef?.(el);
  };
  useEffect(() => {
    // The lock ended: the PIN box is back, put the cursor in it.
    if (lock === null && wasLocked.current) {
      wasLocked.current = false;
      inputEl.current?.focus();
    }
    if (lock !== null) wasLocked.current = true;
  }, [lock]);

  const submit = async () => {
    if (busy.current) return; // double Enter while checking sends one check only
    if (pin.length < 4 || pin.length > 6) {
      setMessage({ kind: "error", text: "PIN must be 4 to 6 digits." });
      return;
    }
    busy.current = true;
    setChecking(true);
    setMessage({ kind: "info", text: "Checking PIN..." });
    try {
      await check(pin);
      setMessage(null);
    } catch (raw) {
      const err = toAppError(raw);
      if (err.code === "LOCKED") {
        setPin("");
        setMessage(null);
        setLock(err.secondsLeft ?? 30);
        lockRef.current?.(true);
        beep();
      } else if (err.code === "NOT_FOUND") {
        setPin("");
        setMessage(null);
        onUserGone?.();
      } else if (err.code === "WRONG_PIN") {
        setPin("");
        setMessage({ kind: "error", text: plainMessage(err) });
        beep();
      } else if (err.code === "PIN_INVALID" || err.code === "VALIDATION") {
        setPin("");
        setMessage({ kind: "error", text: fieldMessage(err, "pin") ?? plainMessage(err) });
      } else {
        // keep what was typed; this is not a wrong try
        setMessage({
          kind: "error",
          text: "Could not check the PIN. Nothing was changed. Press Enter to try again.",
        });
      }
    } finally {
      busy.current = false;
      setChecking(false);
    }
  };

  if (lock !== null) {
    return (
      <div>
        <LockedNotice
          key={lock}
          userName={userName}
          seconds={lock}
          onDone={() => {
            setLock(null);
            lockRef.current?.(false);
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <PinField
        label={`PIN for ${userName}`}
        value={pin}
        onChange={(v) => {
          setPin(v);
          if (v !== "" && message?.kind === "error") setMessage(null);
        }}
        onSubmit={() => void submit()}
        onEscape={onEscape}
        onScan={() => setMessage({ kind: "error", text: "That looked like a barcode scan. Type your PIN." })}
        onNumLockOff={() => setMessage({ kind: "error", text: "Num Lock is off - press Num Lock to type numbers." })}
        readOnly={checking}
        inputRef={setInput}
      />
      <div
        className={message?.kind === "error" ? "gk-message gk-message-error" : "gk-message"}
        role={message?.kind === "error" ? "alert" : "status"}
      >
        {message ? (message.kind === "error" ? `! ${message.text}` : message.text) : ""}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- LoginScreen */

export interface LoginScreenProps {
  title: string;
  loadUsers: () => Promise<LoginUser[]>;
  login: (userId: number, pin: string) => Promise<SessionInfo>;
  onSignedIn: (session: SessionInfo) => void;
  /** POS: the user who last signed in on this PC is pre-chosen. */
  lastUserId?: number | null;
  /** Shown above the form (e.g. "PIN changed. Sign in with your new PIN."). */
  notice?: ReactNode;
  /** Extra keys for this app (Office: forgot owner PIN). */
  extraKeys?: Binding[];
  /** A key only the owner can use (Office: forgot PIN). Shown in the legend only while an owner is chosen. */
  ownerKey?: { keys: string[]; label: string; run: () => void };
}

type UsersState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; users: LoginUser[] };

export function LoginScreen({ title, loadUsers, login, onSignedIn, lastUserId, notice, extraKeys = [], ownerKey }: LoginScreenProps) {
  const [state, setState] = useState<UsersState>({ kind: "loading" });
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [ownerOnly, setOwnerOnly] = useState(false);
  const [gone, setGone] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const pinRef = useRef<HTMLInputElement | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ to: "list" | "pin"; n: number } | null>(null);
  const firstLoad = useRef(true);
  const lastIdRef = useRef(lastUserId);

  useEffect(() => {
    let cancelled = false;
    loadUsers().then(
      (users) => {
        if (cancelled) return;
        setState({ kind: "ready", users });
        setSelectedId((cur) => {
          if (cur !== null && users.some((u) => u.id === cur)) return cur;
          const only = users.length === 1 ? users[0] : undefined;
          const last = users.find((u) => u.id === lastIdRef.current);
          return (only ?? last ?? users[0])?.id ?? null;
        });
        if (firstLoad.current) {
          firstLoad.current = false;
          const preChosen = users.length === 1 || users.some((u) => u.id === lastIdRef.current);
          setFocusTarget({ to: preChosen ? "pin" : "list", n: 0 });
        } else {
          setFocusTarget({ to: "list", n: 0 });
        }
      },
      () => {
        if (!cancelled) setState({ kind: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loadUsers, reload]);

  useEffect(() => {
    if (focusTarget === null) return;
    (focusTarget.to === "pin" ? pinRef.current : listRef.current)?.focus();
  }, [focusTarget, state]);

  const slow = useDelayedFlag(state.kind === "loading");

  const retryBindings = useMemo<Binding[]>(
    () => [
      {
        keys: ["Enter"],
        label: "Try again",
        run: () => {
          setState({ kind: "loading" });
          setReload((n) => n + 1);
        },
        when: () => state.kind === "error",
      },
    ],
    [state.kind],
  );
  const hints = useMemo<Binding[]>(
    () => [
      { keys: ["Up/Down"], label: "Choose" },
      { keys: ["Type"], label: "Filter" },
      { keys: ["Enter"], label: "Next" },
      { keys: ["Esc"], label: "Back to list" },
    ],
    [],
  );
  useKeymap(retryBindings, { layer: LAYER.screen });
  useKeymap(hints, { layer: LAYER.app });
  useKeymap(extraKeys, { layer: LAYER.screen });


  const users = state.kind === "ready" ? state.users : [];
  const items: ListItem[] = users.map((u) => ({ id: u.id, label: u.name, right: u.role === "owner" ? "Owner" : "Cashier" }));
  const selected = users.find((u) => u.id === selectedId);
  useEffect(() => {
    selectedRef.current = selected;
  });
  const ownerChosen = selected?.role === "owner";
  const selectedRef = useRef<LoginUser | undefined>(undefined);
  const ownerBindings = useMemo<Binding[]>(
    () =>
      ownerKey
        ? [
            {
              keys: ownerKey.keys,
              label: ownerKey.label,
              showInLegend: () => ownerChosen,
              run: () => {
                if (selectedRef.current?.role === "owner") ownerKey.run();
                else {
                  beep();
                  setOwnerOnly(true);
                }
              },
            },
          ]
        : [],
    [ownerKey, ownerChosen],
  );
  // Registered on the app layer before the app's own F1, so the legend shows it after F1.
  useKeymap(ownerBindings, { layer: LAYER.app });

  return (
    <div className="gk-center">
      <h1 className="gk-content-title">{title}</h1>
      {notice}
      {state.kind === "loading" && slow ? <p>Loading users...</p> : null}
      {state.kind === "error" ? <Banner kind="error">Could not read the user list. Press Enter to try again.</Banner> : null}
      {gone ? <Banner kind="warn">{gone}</Banner> : null}
      {state.kind === "ready" ? (
        <div className="gk-split">
          <div>
            <p className="gk-section-title">Who are you?</p>
            <SelectList
              items={items}
              selectedId={selectedId}
              ariaLabel="Users"
              listRef={(el) => {
                listRef.current = el;
              }}
              onSelect={(id) => {
                setSelectedId(Number(id));
                setHint(null);
                setOwnerOnly(false);
              }}
              onChoose={(id) => {
                setSelectedId(Number(id));
                setGone(null);
                // focus the PIN box once the prompt for this user has rendered
                setFocusTarget((t) => ({ to: "pin", n: (t?.n ?? 0) + 1 }));
              }}
              onDigit={() => setHint("Choose your name first, then type your PIN.")}
              emptyText={(f) => (users.length === 0 ? "No users." : `No name starts with '${f}'. Press Backspace.`)}
            />
            <p className="gk-hint">Name not in the list? Ask the owner.</p>
            {hint ? <p className="gk-warn-text">{hint}</p> : null}
          </div>
          {selected ? (
            <div>
            <PinPrompt
              key={selected.id}
              userName={selected.name}
              pinRef={(el) => {
                pinRef.current = el;
              }}
              check={async (pin) => {
                const session = await login(selected.id, pin);
                onSignedIn(session);
              }}
              onEscape={() => listRef.current?.focus()}
              onLockedChange={(locked) => {
                if (locked) listRef.current?.focus();
                else pinRef.current?.focus();
              }}
              onUserGone={() => {
                setGone(`${selected.name} has been switched off by the owner. Choose another name.`);
                setSelectedId(null);
                setReload((n) => n + 1);
              }}
            />
            {ownerOnly ? (
              <div className="gk-message gk-message-error" role="alert">
                ! Only the owner uses a recovery code. Ask the owner to reset your PIN.
              </div>
            ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- LockScreen */

export interface LockScreenProps {
  shopName: string;
  userId: number;
  userName: string;
  lockedAt: Date;
  login: (userId: number, pin: string) => Promise<SessionInfo>;
  onUnlocked: (session: SessionInfo) => void;
  onSwitchUser: () => void;
  onHelp: () => void;
  /** Name of the screen with unsaved changes (e.g. "Settings"), or null. Asked only when switching user. */
  getUnsaved: () => string | null;
}

/** Opaque overlay. The screen underneath stays mounted (state kept) but hidden and inert. */
export function LockScreen({
  shopName,
  userId,
  userName,
  lockedAt,
  login,
  onUnlocked,
  onSwitchUser,
  onHelp,
  getUnsaved,
}: LockScreenProps) {
  const pinRef = useRef<HTMLInputElement | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const switchUser = () => {
    const unsaved = getUnsaved();
    if (unsaved) setConfirming(unsaved);
    else onSwitchUser();
  };

  const bindings = useMemo<Binding[]>(
    () => [
      { keys: ["F1"], label: "Help", run: onHelp },
      { keys: ["Esc"], label: "Switch user", run: switchUser },
      { keys: ["Enter"], label: "Unlock" },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onHelp, getUnsaved, onSwitchUser],
  );
  useKeymap(bindings, { layer: LAYER.lock, modal: true, enabled: confirming === null });
  useInitialFocus(() => pinRef.current);

  const buttons: DialogButton[] = [
    { label: "Discard and switch", keys: ["D"], variant: "danger", onPress: onSwitchUser },
  ];

  return (
    <div className="gk-lock" role="dialog" aria-modal="true" aria-label="Locked">
      <div className="gk-frame">
        <StatusBar shopName={shopName} />
        <div className="gk-content gk-lock-body">
          <h1 className="gk-content-title">Locked</h1>
          <div className="gk-lock-name">{userName}</div>
          <p className="gk-muted">{`Locked at ${formatTime(lockedAt)}`}</p>
          <PinPrompt
            userName={userName}
            pinRef={(el) => {
                pinRef.current = el;
              }}
            check={async (pin) => {
              const session = await login(userId, pin);
              onUnlocked(session);
            }}
            onEscape={switchUser}
            onLockedChange={(locked) => {
              if (!locked) pinRef.current?.focus();
            }}
            onUserGone={onSwitchUser}
          />
        </div>
        <KeyLegend mode="list" />
      </div>
      {confirming !== null ? (
        <Dialog
          title="Switch user?"
          buttons={buttons}
          onCancel={() => setConfirming(null)}
          cancelLabel="Stay locked"
        >
          <p>{`${userName} has unsaved changes in ${confirming}. Switching user will throw them away.`}</p>
        </Dialog>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------- ChangePinScreen */

export interface ChangePinScreenProps {
  changePin: (oldPin: string, newPin: string) => Promise<SessionInfo>;
  onDone: (session: SessionInfo) => void;
  /** Esc: sign out and go back to the login screen. */
  onCancel: () => void;
  reason?: string;
}

export function ChangePinScreen({ changePin, onDone, onCancel, reason }: ChangePinScreenProps) {
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ pin?: string; newPin?: string; confirm?: string; general?: string }>({});
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const oldRef = useRef<HTMLInputElement | null>(null);
  const nextRef = useRef<HTMLInputElement | null>(null);
  const confirmRef = useRef<HTMLInputElement | null>(null);
  useInitialFocus(() => oldRef.current);

  const submit = async () => {
    if (busy.current) return;
    if (newPin !== confirm) {
      setErrors({ confirm: "The two PINs do not match. Type them again." });
      setNewPin("");
      setConfirm("");
      nextRef.current?.focus();
      return;
    }
    busy.current = true;
    setSaving(true);
    setErrors({});
    try {
      const session = await changePin(oldPin, newPin);
      onDone(session);
    } catch (raw) {
      const err = toAppError(raw);
      const next: typeof errors = {};
      const pinMsg = fieldMessage(err, "pin");
      const newMsg = fieldMessage(err, "newPin");
      if (err.code === "WRONG_PIN") {
        next.pin = plainMessage(err);
        setOldPin("");
        beep();
      } else if (pinMsg || newMsg) {
        if (pinMsg) next.pin = pinMsg;
        if (newMsg) next.newPin = newMsg;
      } else {
        next.general = plainMessage(err);
      }
      setErrors(next);
      if (next.pin) oldRef.current?.focus();
      else if (next.newPin) {
        setNewPin("");
        setConfirm("");
        nextRef.current?.focus();
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const onKeyDown = useEnterNext(() => void submit());
  const keys = useMemo<Binding[]>(
    () => [
      { keys: ["Enter"], label: "Next / Change PIN" },
      { keys: ["Esc"], label: "Sign out", run: onCancel },
    ],
    [onCancel],
  );
  useKeymap(keys, { layer: LAYER.screen });

  return (
    <div className="gk-center" onKeyDown={onKeyDown}>
      <h1 className="gk-content-title">Change your PIN</h1>
      <p>{reason ?? "You must choose a new PIN before you continue."}</p>
      {errors.general ? <Banner kind="error">{errors.general}</Banner> : null}
      <PinField label="Current PIN" name="oldPin" value={oldPin} onChange={setOldPin} readOnly={saving} error={errors.pin} inputRef={oldRef} />
      <PinField label="New PIN" name="newPin" value={newPin} onChange={setNewPin} readOnly={saving} error={errors.newPin} inputRef={nextRef} />
      <PinField label="Confirm new PIN" name="confirmPin" value={confirm} onChange={setConfirm} readOnly={saving} error={errors.confirm} inputRef={confirmRef} />
      <div className="gk-actions">
        <Button label={saving ? "Saving..." : "Change PIN"} keyHint="Enter" variant="primary" onClick={() => void submit()} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------ RecoveryCodeScreen */

/** "ABCD1234EFGH5678" -> "ABCD-1234-EFGH-5678". Display only. */
export function formatRecoveryCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, "").replace(/(.{4})(?=.)/g, "$1-");
}

export interface RecoveryCodeScreenProps {
  code: string;
  title?: string;
  onConfirmed: () => void;
}

/** Shown once. The user must tick "I have written it down" before going on. */
export function RecoveryCodeScreen({ code, title = "Write down your recovery code", onConfirmed }: RecoveryCodeScreenProps) {
  const [checked, setChecked] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const boxRef = useRef<HTMLInputElement>(null);
  useInitialFocus(() => boxRef.current);

  const go = () => {
    if (!checked) {
      setMessage("Tick 'I have written it down' first (press Space).");
      beep();
      return;
    }
    onConfirmed();
  };

  return (
    <div
      className="gk-center"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          go();
        }
      }}
    >
      <h1 className="gk-content-title">{title}</h1>
      <p>This code is the only way to get back in if the owner PIN is forgotten.</p>
      <p>
        <strong>It is shown only once.</strong> Write it on paper and keep the paper in a safe place. Do not take a photo.
      </p>
      <div className="gk-recovery-code" data-testid="recovery-code">
        {formatRecoveryCode(code)}
      </div>
      <label className="gk-checkbox">
        <input
          ref={boxRef}
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            setChecked(e.target.checked);
            setMessage(null);
          }}
        />
        I have written it down
      </label>
      {message ? <div className="gk-message gk-message-error" role="alert">{`! ${message}`}</div> : null}
      <div className="gk-actions">
        <Button label="Continue" keyHint="Enter" variant="primary" onClick={go} />
      </div>
    </div>
  );
}
