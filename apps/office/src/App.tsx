import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppFrame,
  Banner,
  BlockingScreen,
  Dialog,
  ChangePinScreen,
  HelpOverlay,
  KeyLegend,
  LAYER,
  LoginScreen,
  RecoveryCodeScreen,
  StatusBar,
  UnsavedGuardProvider,
  toAppError,
  useFocusGuard,
  useDelayedFlag,
  useKeymap,
  type Binding,
  type SessionInfo,
  type StartupStatus,
} from "@gokul/ui";
import * as realApi from "./api";
import { ApiContext, type Api } from "./apiContext";
import { FirstRun } from "./FirstRun";
import { Shell } from "./Shell";
import { Recover } from "./Recover";
import { S } from "./strings";

type BlockKind = "error" | "busy" | "newer";

type Phase =
  | { kind: "starting" }
  | { kind: "block"; block: BlockKind; detail: string }
  | { kind: "firstRun" }
  | { kind: "recoveryCode"; code: string; then: { kind: "main"; session: SessionInfo } | { kind: "login"; notice: string } }
  | { kind: "login"; notice?: string }
  | { kind: "recover" }
  | { kind: "changePin"; session: SessionInfo }
  | { kind: "main"; session: SessionInfo; setupPrompt: boolean };

export function App({ api = realApi }: { api?: Api }) {
  return (
    <ApiContext.Provider value={api}>
      <UnsavedGuardProvider>
        <Root api={api} />
      </UnsavedGuardProvider>
    </ApiContext.Provider>
  );
}

interface StartupResult {
  phase: Phase;
  shopName: string | null;
}

/** Start-up checks 2 to 7, in order. The first one that fails decides the screen. */
async function runStartup(api: Api): Promise<StartupResult> {
  let status: StartupStatus;
  try {
    status = await api.startupStatus();
  } catch (raw) {
    const err = toAppError(raw);
    const block: BlockKind = err.code === "DB_BUSY" ? "busy" : err.code === "DB_NEWER" ? "newer" : "error";
    return { phase: { kind: "block", block, detail: err.message }, shopName: null };
  }
  const shopName = status.shopName;
  if (status.db !== "ok") {
    const block: BlockKind = status.db === "busy" ? "busy" : status.db === "newer_than_app" ? "newer" : "error";
    return { phase: { kind: "block", block, detail: status.dbMessage ?? "" }, shopName };
  }
  if (!status.usersExist) return { phase: { kind: "firstRun" }, shopName };
  const session = await api.currentSession().catch(() => null);
  if (session) {
    return {
      phase: session.mustChangePin ? { kind: "changePin", session } : { kind: "main", session, setupPrompt: false },
      shopName,
    };
  }
  return { phase: { kind: "login" }, shopName };
}

function Root({ api }: { api: Api }) {
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const [shopName, setShopName] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [closeAsk, setCloseAsk] = useState(false);
  const closeRef = useRef<(() => void) | null>(null);
  const registerClose = useCallback((fn: (() => void) | null) => {
    closeRef.current = fn;
  }, []);

  const applyStartup = useCallback((r: StartupResult) => {
    setShopName(r.shopName);
    setPhase(r.phase);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void runStartup(api).then((r) => {
      if (!cancelled) applyStartup(r);
    });
    return () => {
      cancelled = true;
    };
  }, [api, applyStartup]);

  const restart = useCallback(() => {
    setPhase({ kind: "starting" });
    void runStartup(api).then(applyStartup);
  }, [api, applyStartup]);

  // Window close (Alt+F4 / X) goes through Main's unsaved-changes guard when it is open.
  useEffect(() => {
    let off: (() => void) | undefined;
    let gone = false;
    void api
      .onCloseRequested(() => {
        if (closeRef.current) closeRef.current();
        else void api.closeWindow();
      })
      .then((fn) => {
        if (gone) fn();
        else off = fn;
      });
    return () => {
      gone = true;
      off?.();
    };
  }, [api]);

  // Closing while the recovery code is on screen would lose it for ever: ask first.
  const showingCode = phase.kind === "recoveryCode";
  useEffect(() => {
    if (!showingCode) return;
    registerClose(() => setCloseAsk(true));
    return () => registerClose(null);
  }, [showingCode, registerClose]);

  const inMain = phase.kind === "main";
  const helpKeys = useMemo<Binding[]>(() => [{ keys: ["F1"], label: "Help", run: () => setHelp(true) }], []);
  useKeymap(helpKeys, { layer: LAYER.app, enabled: !inMain });
  useFocusGuard(() => document.querySelector<HTMLElement>("[tabindex], input, button"));

  const signedIn = (session: SessionInfo) => {
    setPhase(session.mustChangePin ? { kind: "changePin", session } : { kind: "main", session, setupPrompt: false });
  };

  if (phase.kind === "main") {
    return (
      <Shell
        session={phase.session}
        startupShopName={shopName}
        setupPrompt={phase.setupPrompt}
        onSwitchUser={() => setPhase({ kind: "login" })}
        onSignedOut={(notice) => setPhase({ kind: "login", notice })}
        onPinChangeRequired={() => setPhase({ kind: "changePin", session: phase.session })}
        registerClose={registerClose}
      />
    );
  }

  const retry: Binding[] = [{ keys: ["Enter"], label: "Try again", run: restart }];

  let body: React.ReactNode = null;
  switch (phase.kind) {
    case "starting":
      body = <Starting />;
      break;
    case "block":
      body =
        phase.block === "error" ? (
          <BlockingScreen
            title="Gokul Office cannot open the shop data"
            steps={[
              "Press Enter to try again.",
              "If it still fails, restart the computer and open Gokul Office again.",
              "Still failing? Call IT and read out the code below.",
            ]}
            keys={retry}
            itLine={`For IT: DB-OPEN  ${phase.detail}  Log folder: %APPDATA%\\GokulRetail\\logs`}
          >
            <p>Nothing has been deleted.</p>
          </BlockingScreen>
        ) : phase.block === "busy" ? (
          <BlockingScreen title="The shop data is busy" keys={retry} itLine="For IT: DB-BUSY">
            <p>Gokul POS is updating the data. Wait one minute, then press Enter.</p>
          </BlockingScreen>
        ) : (
          <BlockingScreen
            title="This Gokul Office is older than the shop data"
            itLine={`For IT: DB-NEWER  ${phase.detail}`}
          >
            <p>
              {phase.detail ? `${phase.detail} ` : ""}Your data is safe and has not been changed. Install the newer Gokul
              Office from IT, then open it again.
            </p>
          </BlockingScreen>
        );
      break;
    case "firstRun":
      body = (
        <FirstRun
          onAlreadySetup={restart}
          onCreated={({ recoveryCode, session }) =>
            setPhase({ kind: "recoveryCode", code: recoveryCode, then: { kind: "main", session } })
          }
        />
      );
      break;
    case "recoveryCode": {
      const then = phase.then;
      body = (
        <RecoveryCodeScreen
          code={phase.code}
          onConfirmed={() =>
            setPhase(then.kind === "main" ? { kind: "main", session: then.session, setupPrompt: true } : { kind: "login", notice: then.notice })
          }
        />
      );
      break;
    }
    case "login":
      body = (
        <LoginScreen
          title="Gokul Office - Sign in"
          loadUsers={api.listLoginUsers}
          login={api.login}
          onSignedIn={signedIn}
          notice={phase.notice ? <Banner kind="ok">{phase.notice}</Banner> : null}
          extraKeys={[{ keys: ["F4"], label: "Forgot owner PIN", run: () => setPhase({ kind: "recover" }) }]}
        />
      );
      break;
    case "recover":
      body = (
        <Recover
          onBack={() => setPhase({ kind: "login" })}
          onRecovered={(code) =>
            setPhase({
              kind: "recoveryCode",
              code,
              then: { kind: "login", notice: "Owner PIN changed. Sign in with your new PIN." },
            })
          }
        />
      );
      break;
    case "changePin":
      body = (
        <ChangePinScreen
          changePin={api.changePin}
          onDone={(session) => setPhase({ kind: "main", session, setupPrompt: false })}
          onCancel={() => {
            api.logout().catch(() => undefined);
            setPhase({ kind: "login" });
          }}
        />
      );
      break;
  }

  return (
    <>
      <AppFrame
        statusBar={<StatusBar shopName={shopName || S.appName} />}
        legend={<KeyLegend mode="list" />}
      >
        {body}
      </AppFrame>
      {help ? <HelpOverlay onClose={() => setHelp(false)} /> : null}
      {closeAsk ? (
        <Dialog
          title="Close without the recovery code?"
          buttons={[
            { label: "Stay", isDefault: true, onPress: () => setCloseAsk(false) },
            { label: "Close anyway", keys: ["C"], variant: "danger", onPress: () => void api.closeWindow() },
          ]}
          onCancel={() => setCloseAsk(false)}
          cancelLabel="Stay"
        >
          <p>You have not confirmed you wrote down the recovery code. Close anyway?</p>
        </Dialog>
      ) : null}
    </>
  );
}

/** "Starting..." only if start-up takes more than 300 ms, so fast starts do not flicker. */
function Starting() {
  const slow = useDelayedFlag(true);
  return slow ? <p className="gk-starting">Starting Gokul Office...</p> : null;
}
