import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppFrame,
  Dialog,
  HelpOverlay,
  KeyLegend,
  LAYER,
  LockScreen,
  StatusBar,
  isSessionGone,
  toAppError,
  useFocusGuard,
  useHeartbeat,
  useInitialFocus,
  useKeymap,
  useLatest,
  useScreenLock,
  type AppError,
  type Binding,
  type DialogButton,
  type SessionInfo,
  type StatusBarInfo,
} from "@gokul/ui";
import { useApi } from "./apiContext";
import { BACKUP_CONFIGURED } from "./constants";
import { S } from "./strings";

export interface ShellProps {
  session: SessionInfo;
  startupShopName: string | null;
  onSwitchUser: () => void;
  /** Rust says the PIN must be changed first. */
  onPinChangeRequired: () => void;
  registerClose: (handler: (() => void) | null) => void;
}

/** F2-F12 belong to billing (spec 03). In this step they do nothing, without a beep. */
const RESERVED = ["F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"];

export function Shell({ session, startupShopName, onSwitchUser, onPinChangeRequired, registerClose }: ShellProps) {
  const api = useApi();
  const [statusInfo, setStatusInfo] = useState<StatusBarInfo | null>(null);
  const [help, setHelp] = useState(false);
  const [closing, setClosing] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const focusContent = useCallback(() => contentRef.current, []);
  const lock = useScreenLock(api.lockSession, focusContent);
  const lockRef = useLatest(lock);
  useFocusGuard(focusContent);
  useInitialFocus(focusContent);

  const onApiError = useCallback(
    (err: AppError): boolean => {
      if (isSessionGone(err)) {
        lockRef.current.lock(); // POS never auto-locks, but a dead session still needs the PIN screen
        return true;
      }
      if (err.code === "PIN_CHANGE_REQUIRED") {
        onPinChangeRequired();
        return true;
      }
      return false;
    },
    [lockRef, onPinChangeRequired],
  );

  const refresh = useCallback(() => {
    api.getStatusBar().then(setStatusInfo, (raw: unknown) => {
      onApiError(toAppError(raw));
    });
  }, [api, onApiError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useHeartbeat(() => {
    if (lockRef.current.locked === null) api.heartbeat().catch((raw: unknown) => onApiError(toAppError(raw)));
  });

  useEffect(() => {
    registerClose(() => {
      if (lockRef.current.locked !== null) void api.closeWindow();
      else setClosing(true);
    });
    return () => registerClose(null);
  }, [api, registerClose, lockRef]);

  const bindings = useMemo<Binding[]>(
    () => [
      { keys: ["F1"], label: "Help", run: () => setHelp(true) },
      { keys: ["Ctrl+L"], label: "Lock", run: lock.lock },
      ...RESERVED.map((k): Binding => ({ keys: [k], label: "", silent: true, run: () => undefined })),
    ],
    [lock.lock],
  );
  useKeymap(bindings, { layer: LAYER.app });

  const closeButtons: DialogButton[] = [
    { label: "Close", isDefault: true, onPress: () => void api.closeWindow() },
  ];
  const closeHelp = useCallback(() => setHelp(false), []);
  const shopName = statusInfo?.shopName || startupShopName || S.appName;

  return (
    <>
      <div className="gk-fill" inert={lock.locked !== null}>
        <AppFrame
          statusBar={
            <StatusBar
              shopName={shopName}
              userLabel={`${session.name} (${session.role === "owner" ? "Owner" : "Cashier"})`}
              backup={{ configured: BACKUP_CONFIGURED, lastBackupAt: statusInfo?.lastBackupAt ?? null }}
            />
          }
          legend={<KeyLegend mode="slots" />}
        >
          <div ref={contentRef} tabIndex={-1} className="gk-tamil-safe">
            <h1 className="gk-content-title">Billing</h1>
            <p>{S.billingSoon}</p>
            <p>{S.counterReady}</p>
          </div>
        </AppFrame>
      </div>
      {lock.locked ? (
        <LockScreen
          shopName={shopName}
          userId={session.userId}
          userName={session.name}
          lockedAt={lock.locked.at}
          login={api.login}
          onUnlocked={() => {
            lock.release();
            refresh();
          }}
          onSwitchUser={() => {
            // Rust cleared the session at lock; this is best effort so a logout is still recorded if it can be.
            api.logout().catch(() => undefined);
            onSwitchUser();
          }}
          onHelp={() => setHelp(true)}
          getUnsaved={() => null}
        />
      ) : null}
      {help ? <HelpOverlay onClose={closeHelp} /> : null}
      {closing ? (
        <Dialog title="Close Gokul POS?" buttons={closeButtons} onCancel={() => setClosing(false)} cancelLabel="Stay">
          <p>The counter will close. Nothing is open.</p>
        </Dialog>
      ) : null}
    </>
  );
}
