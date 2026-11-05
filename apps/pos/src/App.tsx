import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppFrame,
  BlockingScreen,
  ChangePinScreen,
  HelpOverlay,
  KeyLegend,
  LAYER,
  LoginScreen,
  StatusBar,
  UnsavedGuardProvider,
  formatTime,
  toAppError,
  useDelayedFlag,
  useFocusGuard,
  useKeymap,
  type Binding,
  type SessionInfo,
  type StartupStatus,
} from "@gokul/ui";
import * as realApi from "./api";
import { ApiContext, type Api } from "./apiContext";
import { Shell } from "./Shell";
import { S } from "./strings";

type BlockKind = "error" | "busy" | "newer";

type Phase =
  | { kind: "starting" }
  | { kind: "block"; block: BlockKind; detail: string }
  | { kind: "notSetUp"; checkedAt: Date | null }
  | { kind: "login" }
  | { kind: "changePin"; session: SessionInfo }
  | { kind: "main"; session: SessionInfo };

interface StartupResult {
  phase: Phase;
  shopName: string | null;
}

/** Start-up checks 2 to 7, in order. The first one that fails decides the screen. */
async function runStartup(api: Api, recheck: boolean): Promise<StartupResult> {
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
  if (!status.usersExist || !status.setupComplete) {
    return { phase: { kind: "notSetUp", checkedAt: recheck ? new Date() : null }, shopName };
  }
  const session = await api.currentSession().catch(() => null);
  if (session) {
    return { phase: session.mustChangePin ? { kind: "changePin", session } : { kind: "main", session }, shopName };
  }
  return { phase: { kind: "login" }, shopName };
}

export function App({ api = realApi }: { api?: Api }) {
  return (
    <ApiContext.Provider value={api}>
      <UnsavedGuardProvider>
        <Root api={api} />
      </UnsavedGuardProvider>
    </ApiContext.Provider>
  );
}

function Root({ api }: { api: Api }) {
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const [shopName, setShopName] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
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
    void runStartup(api, false).then((r) => {
      if (!cancelled) applyStartup(r);
    });
    return () => {
      cancelled = true;
    };
  }, [api, applyStartup]);

  /** Enter on a blocking screen: run the checks again (no automatic polling). */
  const recheck = useCallback(() => {
    setPhase((p) => (p.kind === "notSetUp" ? p : { kind: "starting" }));
    void runStartup(api, true).then(applyStartup);
  }, [api, applyStartup]);

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

  const inMain = phase.kind === "main";
  const helpKeys = useMemo<Binding[]>(() => [{ keys: ["F1"], label: "Help", run: () => setHelp(true) }], []);
  useKeymap(helpKeys, { layer: LAYER.app, enabled: !inMain });
  useFocusGuard(() => document.querySelector<HTMLElement>("[tabindex], input, button"));

  const signedIn = (session: SessionInfo) => {
    api.saveLastUserId(session.userId);
    setPhase(session.mustChangePin ? { kind: "changePin", session } : { kind: "main", session });
  };

  if (phase.kind === "main") {
    return (
      <Shell
        session={phase.session}
        startupShopName={shopName}
        onSwitchUser={() => setPhase({ kind: "login" })}
        onPinChangeRequired={() => setPhase({ kind: "changePin", session: phase.session })}
        registerClose={registerClose}
      />
    );
  }

  const retry: Binding[] = [{ keys: ["Enter"], label: "Try again", run: recheck }];
  const check: Binding[] = [{ keys: ["Enter"], label: "Check again", run: recheck }];

  let body: React.ReactNode = null;
  switch (phase.kind) {
    case "starting":
      body = <Starting />;
      break;
    case "block":
      body =
        phase.block === "error" ? (
          <BlockingScreen
            title="Gokul POS cannot open the shop data"
            steps={[
              "Press Enter to try again.",
              "If it still fails, restart the computer and open Gokul POS again.",
              "Still failing? Call IT and read out the code below.",
            ]}
            keys={retry}
            itLine={`For IT: DB-OPEN  ${phase.detail}  Log folder: %APPDATA%\\GokulRetail\\logs`}
          >
            <p>Nothing has been deleted.</p>
          </BlockingScreen>
        ) : phase.block === "busy" ? (
          <BlockingScreen title="The shop data is busy" keys={retry} itLine="For IT: DB-BUSY">
            <p>Gokul Office is updating the data. Wait one minute, then press Enter.</p>
          </BlockingScreen>
        ) : (
          <BlockingScreen title="This Gokul POS is older than the shop data" itLine={`For IT: DB-NEWER  ${phase.detail}`}>
            <p>
              {phase.detail ? `${phase.detail} ` : ""}Your data is safe and has not been changed. Install the newer Gokul
              POS from IT, then open it again.
            </p>
          </BlockingScreen>
        );
      break;
    case "notSetUp":
      body = (
        <BlockingScreen
          title="The shop is not set up yet"
          steps={[
            "Ask the owner to open Gokul Office on this computer.",
            "The owner signs in and fills Settings (shop name, address, phone).",
            "Come back here and press Enter.",
          ]}
          keys={check}
          itLine="For IT: SHOP-NOT-SET-UP"
        >
          <p>Billing cannot start until the owner enters the shop details.</p>
          {phase.checkedAt ? <p role="status">{`Still not set up (checked at ${formatTime(phase.checkedAt)}).`}</p> : null}
        </BlockingScreen>
      );
      break;
    case "login":
      body = (
        <LoginScreen
          title="Gokul POS - Sign in"
          loadUsers={api.listLoginUsers}
          login={async (id, pin) => {
            try {
              return await api.login(id, pin);
            } catch (raw) {
              // Office set-up was undone or never finished: show the "shop not set up" screen.
              if (toAppError(raw).code === "SHOP_NOT_SET_UP") recheck();
              throw raw;
            }
          }}
          onSignedIn={signedIn}
          lastUserId={api.readLastUserId()}
        />
      );
      break;
    case "changePin":
      body = (
        <ChangePinScreen
          changePin={api.changePin}
          onDone={(session) => setPhase({ kind: "main", session })}
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
      <AppFrame statusBar={<StatusBar shopName={shopName || S.appName} />} legend={<KeyLegend mode="list" />}>
        {body}
      </AppFrame>
      {help ? <HelpOverlay onClose={() => setHelp(false)} /> : null}
    </>
  );
}

/** "Starting..." only if start-up takes more than 300 ms, so fast starts do not flicker. */
function Starting() {
  const slow = useDelayedFlag(true);
  return slow ? <p className="gk-starting">Starting Gokul POS...</p> : null;
}
