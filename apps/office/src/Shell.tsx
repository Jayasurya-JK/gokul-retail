import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppFrame,
  Banner,
  ComingSoon,
  Dialog,
  HelpOverlay,
  KeyLegend,
  LAYER,
  LockScreen,
  SideMenu,
  StatusBar,
  beep,
  isSessionGone,
  toAppError,
  useFocusGuard,
  useHeartbeat,
  useLatest,
  useIdleTimer,
  useKeymap,
  useScreenLock,
  useUnsavedGuardContext,
  type AppError,
  type Binding,
  type DialogButton,
  type MenuItem,
  type Screen,
  type SessionInfo,
  type StatusBarInfo,
} from "@gokul/ui";
import { useApi } from "./apiContext";
import { BACKUP_CONFIGURED, OFFICE_IDLE_MS } from "./constants";
import { S } from "./strings";
import { Settings } from "./Settings";
import { Users } from "./Users";

const IDLE_NOTICE = "Logged out after 10 minutes idle.";

const ALL_ITEMS: (MenuItem & { id: Screen })[] = [
  { id: "dashboard", label: "Dashboard", accessKey: "D" },
  { id: "items", label: "Items", accessKey: "I" },
  { id: "stock", label: "Stock", accessKey: "S" },
  { id: "production", label: "Production", accessKey: "P" },
  { id: "packing", label: "Packing", accessKey: "K" },
  { id: "purchases", label: "Purchases", accessKey: "C" },
  { id: "reports", label: "Reports", accessKey: "R" },
  { id: "users", label: "Users", accessKey: "U" },
  { id: "settings", label: "Settings", accessKey: "T" },
];

export interface ShellProps {
  session: SessionInfo;
  startupShopName: string | null;
  /** Show "Owner account created ... open Settings now?" (right after first run). */
  setupPrompt?: boolean;
  /** Switch user from the lock screen: back to the login screen. */
  onSwitchUser: () => void;
  /** Session ended (idle logout): back to login, screen state is dropped. */
  onSignedOut: (notice: string) => void;
  /** Rust says the PIN must be changed first. */
  onPinChangeRequired: () => void;
  /** Root asks the shell how to close the window (it may need the unsaved-changes dialog). */
  registerClose: (handler: (() => void) | null) => void;
}

/** The signed-in Office window: status bar, menu, screens, lock screen. */
export function Shell({
  session,
  startupShopName,
  setupPrompt = false,
  onSwitchUser,
  onSignedOut,
  onPinChangeRequired,
  registerClose,
}: ShellProps) {
  const api = useApi();
  const { requestLeave, unsavedWhat } = useUnsavedGuardContext();
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [statusInfo, setStatusInfo] = useState<StatusBarInfo | null>(null);
  const [setupComplete, setSetupComplete] = useState(true);
  const [denied, setDenied] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [prompt, setPrompt] = useState(setupPrompt);
  const menuRef = useRef<HTMLUListElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);

  const allowed = session.allowedScreens;
  const isOwner = session.role === "owner";
  const menuItems = ALL_ITEMS.filter((i) => allowed.includes(i.id));

  const focusContent = useCallback((): HTMLElement | null => {
    return contentRef.current?.querySelector<HTMLElement>('input:not([readonly]), [role="listbox"], [tabindex="-1"]') ?? null;
  }, []);
  const focusMenu = useCallback(() => menuRef.current?.focus(), []);

  const lock = useScreenLock(api.lockSession, focusContent);
  useFocusGuard(focusContent);

  const lockRef = useRef(lock);
  useEffect(() => {
    lockRef.current = lock;
  });

  /** Returns true when the error means the session is gone (the lock screen takes over). */
  const onApiError = useCallback(
    (err: AppError): boolean => {
      if (isSessionGone(err)) {
        onSignedOut(IDLE_NOTICE);
        return true;
      }
      if (err.code === "PIN_CHANGE_REQUIRED") {
        onPinChangeRequired();
        return true;
      }
      return false;
    },
    [onSignedOut, onPinChangeRequired],
  );

  const refresh = useCallback(() => {
    Promise.all([api.startupStatus(), api.getStatusBar()]).then(
      ([status, bar]) => {
        setSetupComplete(status.setupComplete);
        setStatusInfo(bar);
      },
      (raw: unknown) => {
        onApiError(toAppError(raw));
      },
    );
  }, [api, onApiError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useHeartbeat(() => {
    if (lockRef.current.locked === null) api.heartbeat().catch((raw: unknown) => onApiError(toAppError(raw)));
  });
  useIdleTimer(OFFICE_IDLE_MS, () => onSignedOut(IDLE_NOTICE), true);

  // The owner-only / not-allowed message goes away on the next key press.
  useEffect(() => {
    if (denied === null) return;
    const clear = () => setDenied(null);
    window.addEventListener("keydown", clear, true);
    return () => window.removeEventListener("keydown", clear, true);
  }, [denied]);

  const deny = useCallback(
    (target: Screen) => {
      setDenied(target === "users" || target === "settings" ? S.ownerOnly : S.screenNotAllowed);
      beep();
      // Rust refuses and writes the permission_denied audit row.
      api.openScreen(target).catch((raw: unknown) => {
        onApiError(toAppError(raw));
      });
    },
    [api, onApiError],
  );

  const open = useCallback(
    async (target: Screen) => {
      try {
        await api.openScreen(target);
        setDenied(null);
        setScreen(target);
      } catch (raw) {
        const err = toAppError(raw);
        if (onApiError(err)) return;
        setDenied(err.code === "PERMISSION_DENIED" ? S.screenNotAllowed : err.message || S.screenNotAllowed);
        beep();
      }
    },
    [api, onApiError],
  );

  const go = useCallback(
    (target: Screen) => {
      if (!allowed.includes(target)) {
        deny(target);
        return;
      }
      if (target === screen) {
        focusContent()?.focus();
        return;
      }
      requestLeave(() => void open(target));
    },
    [allowed, screen, deny, open, requestLeave, focusContent],
  );

  // Alt+letter works from anywhere; Esc goes back one step.
  const goRef = useLatest(go);
  const bindings = useMemo<Binding[]>(() => {
    const list: Binding[] = [
      { keys: ["Up/Down"], label: "Move" },
      { keys: ["Enter"], label: "Open" },
      { keys: ["Alt+letter"], label: "Go to" },
      {
        keys: ["Esc"],
        label: "Back",
        run: () => {
          if (document.activeElement === menuRef.current) {
            if (screen !== "dashboard") go("dashboard");
          } else focusMenu();
        },
      },
      { keys: ["F1"], label: "Help", run: () => setHelp(true) },
      { keys: ["Ctrl+L"], label: "Lock", run: lock.lock },
    ];
    for (const item of ALL_ITEMS) {
      // The handler only reads the ref when the key is pressed, never during render.
      // eslint-disable-next-line react-hooks/refs
      list.push({ keys: [`Alt+${item.accessKey}`], label: item.label, silent: true, run: () => goRef.current(item.id) });
    }
    return list;
  }, [screen, go, focusMenu, lock.lock, goRef]);
  useKeymap(bindings, { layer: LAYER.app });

  // Alt+F4 / window X: unsaved-changes guard, otherwise close without asking.
  useEffect(() => {
    registerClose(() => {
      if (lockRef.current.locked !== null) void api.closeWindow();
      else requestLeave(() => void api.closeWindow());
    });
    return () => registerClose(null);
  }, [api, registerClose, requestLeave]);

  const closeHelp = useCallback(() => setHelp(false), []);

  const promptButtons: DialogButton[] = [
    {
      label: "Open Settings now",
      isDefault: true,
      onPress: () => {
        setPrompt(false);
        go("settings");
      },
    },
  ];

  const roleLabel = isOwner ? "Owner" : "Cashier";
  const content = (() => {
    if (!allowed.includes(screen)) return null; // a direct route to a hidden screen shows nothing
    switch (screen) {
      case "dashboard":
        return <Dashboard key="dashboard" isOwner={isOwner} setupComplete={setupComplete} />;
      case "settings":
        return <Settings key="settings" focusMenu={focusMenu} onSaved={refresh} onApiError={onApiError} />;
      case "users":
        return <Users key="users" focusMenu={focusMenu} onApiError={onApiError} />;
      default:
        return <ComingSoon key={screen} title={S.titles[screen]} />;
    }
  })();

  return (
    <>
      <div className="gk-fill" inert={lock.locked !== null}>
        <AppFrame
          statusBar={
            <StatusBar
              shopName={statusInfo?.shopName || startupShopName || S.appName}
              shopNotSet={!setupComplete}
              userLabel={`${session.name} (${roleLabel})`}
              backup={{ configured: BACKUP_CONFIGURED, lastBackupAt: statusInfo?.lastBackupAt ?? null }}
            />
          }
          legend={<KeyLegend mode="list" />}
          menu={
            <SideMenu
              items={menuItems}
              currentId={screen}
              menuRef={menuRef}
              onOpen={(id) => go(id as Screen)}
            />
          }
          contentRef={contentRef}
        >
          {denied ? <Banner kind="warn">{denied}</Banner> : null}
          {content}
        </AppFrame>
      </div>
      {lock.locked ? (
        <LockScreen
          shopName={statusInfo?.shopName || startupShopName || S.appName}
          userId={session.userId}
          userName={session.name}
          lockedAt={lock.locked.at}
          login={api.login}
          onUnlocked={() => {
            lock.release();
            refresh();
          }}
          onSwitchUser={onSwitchUser}
          onHelp={() => setHelp(true)}
          getUnsaved={() => (unsavedWhat() ? S.titles[screen] : null)}
        />
      ) : null}
      {help ? <HelpOverlay onClose={closeHelp} /> : null}
      {prompt ? (
        <Dialog title="Owner account created" buttons={promptButtons} onCancel={() => setPrompt(false)} cancelLabel="Later">
          <p>Next, enter your shop details (name, address, phone, GSTIN).</p>
          <p>Billing in Gokul POS stays blocked until this is done.</p>
        </Dialog>
      ) : null}
    </>
  );
}

function Dashboard({ isOwner, setupComplete }: { isOwner: boolean; setupComplete: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div ref={ref} tabIndex={-1}>
      <h1 className="gk-content-title">Dashboard</h1>
      {!setupComplete ? (
        isOwner ? (
          <Banner kind="warn">{S.shopNotSetOwner}</Banner>
        ) : (
          <Banner kind="info">{S.shopNotSetCashier}</Banner>
        )
      ) : null}
      <p>{S.comingSoon}</p>
    </div>
  );
}
