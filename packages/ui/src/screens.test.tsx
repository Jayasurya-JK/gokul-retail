import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LoginUser, SessionInfo } from "./api-types";
import { SelectList, matchesFilter, PinField } from "./controls";
import { resetKeymapsForTests } from "./keymap";
import { ChangePinScreen, LockScreen, LoginScreen, RecoveryCodeScreen, formatRecoveryCode } from "./screens";
import { appError, flush, mount, pageText, press, typeText, unmountAll } from "./testing";

afterEach(async () => {
  await unmountAll();
  resetKeymapsForTests();
  vi.useRealTimers();
});

const users: LoginUser[] = [
  { id: 1, name: "Ravi Kumar" },
  { id: 2, name: "Rajesh" },
  { id: 3, name: "Selvi" },
];

const session = (over: Partial<SessionInfo> = {}): SessionInfo => ({
  userId: 1,
  name: "Ravi Kumar",
  role: "cashier",
  mustChangePin: false,
  allowedScreens: [],
  ...over,
});

async function renderLogin(
  opts: {
    list?: LoginUser[];
    login?: (id: number, pin: string) => Promise<SessionInfo>;
    lastUserId?: number | null;
    loadUsers?: () => Promise<LoginUser[]>;
  } = {},
) {
  const login = opts.login ?? vi.fn(() => Promise.resolve(session()));
  const onSignedIn = vi.fn();
  const loadUsers = opts.loadUsers ?? vi.fn(() => Promise.resolve(opts.list ?? users));
  const m = await mount(
    <LoginScreen
      title="Gokul POS - Sign in"
      loadUsers={loadUsers}
      login={login}
      onSignedIn={onSignedIn}
      lastUserId={opts.lastUserId ?? null}
    />,
  );
  await flush();
  return { m, login, onSignedIn, loadUsers };
}

const pinInput = () => document.querySelector<HTMLInputElement>('input[name="pin"]');
const rows = () => Array.from(document.querySelectorAll('[role="option"]')).map((e) => e.textContent);

describe("matchesFilter", () => {
  it("matches the start of any word, case-insensitive, Tamil too", () => {
    expect(matchesFilter("Ravi Kumar", "ku")).toBe(true);
    expect(matchesFilter("Ravi Kumar", "RA")).toBe(true);
    expect(matchesFilter("Ravi Kumar", "av")).toBe(false);
    expect(matchesFilter("கடலை எண்ணெய் 1 லி", "எ")).toBe(true);
    expect(matchesFilter("நல்லெண்ணெய்", "நல")).toBe(true);
  });
});

describe("login, keyboard only (spec 30, tests 9 and 10)", () => {
  it("lists active users and focuses the list when several can sign in", async () => {
    await renderLogin();
    expect(rows()).toEqual(["Ravi Kumar", "Rajesh", "Selvi"]);
    expect(document.activeElement?.getAttribute("role")).toBe("listbox");
    expect(pageText()).toContain("Name not in the list? Ask the owner.");
  });

  it("type-to-filter, Backspace, Esc clears, no-match text", async () => {
    await renderLogin();
    await typeText("ra");
    expect(rows()).toEqual(["Ravi Kumar", "Rajesh"]);
    expect(pageText()).toContain("Filter: ra");
    await press("Backspace");
    expect(pageText()).toContain("Filter: r");
    await press("Escape");
    expect(pageText()).not.toContain("Filter:");
    expect(rows()).toHaveLength(3);
    await typeText("xyz");
    expect(pageText()).toContain("No name starts with 'xyz'. Press Backspace.");
  });

  it("matches the start of the second word too", async () => {
    await renderLogin();
    await typeText("ku");
    expect(rows()).toEqual(["Ravi Kumar"]);
  });

  it("digits typed in the list are ignored and explained", async () => {
    await renderLogin();
    await typeText("12");
    expect(rows()).toHaveLength(3);
    expect(pageText()).toContain("Choose your name first, then type your PIN.");
  });

  it("Up/Down move, Enter moves to the PIN of the chosen user", async () => {
    await renderLogin();
    await press("ArrowDown");
    expect(document.querySelector('[aria-selected="true"]')?.textContent).toBe("Rajesh");
    expect(pageText()).toContain("PIN for Rajesh");
    await press("Enter");
    expect(document.activeElement).toBe(pinInput());
  });

  it("signs in: masked PIN, Enter checks it, success is reported", async () => {
    const { login, onSignedIn } = await renderLogin({ list: [{ id: 7, name: "Selvi" }] });
    expect(document.activeElement).toBe(pinInput()); // single user: straight to PIN
    expect(pinInput()?.type).toBe("password");
    await typeText("2468");
    await press("Enter");
    await flush();
    expect(login).toHaveBeenCalledWith(7, "2468");
    expect(onSignedIn).toHaveBeenCalledTimes(1);
  });

  it("the last user on this PC is pre-chosen with focus on PIN; Esc goes back to the list", async () => {
    await renderLogin({ lastUserId: 2 });
    expect(pageText()).toContain("PIN for Rajesh");
    expect(document.activeElement).toBe(pinInput());
    await press("Escape");
    expect(document.activeElement?.getAttribute("role")).toBe("listbox");
  });

  it("PIN only accepts digits", async () => {
    await renderLogin({ list: [users[0] as LoginUser] });
    await typeText("12ab34");
    expect(pinInput()?.value).toBe("1234");
  });

  it("a short PIN is not sent", async () => {
    const { login } = await renderLogin({ list: [users[0] as LoginUser] });
    await typeText("12");
    await press("Enter");
    expect(login).not.toHaveBeenCalled();
    expect(pageText()).toContain("PIN must be 4 to 6 digits.");
  });
});

describe("PIN messages and rules", () => {
  it("wrong PIN: count from the backend, PIN cleared, focus stays", async () => {
    const login = vi.fn(() => Promise.reject(appError("WRONG_PIN", "Wrong PIN.", { attemptsBeforeLock: 2 })));
    await renderLogin({ list: [users[0] as LoginUser], login });
    await typeText("1357");
    await press("Enter");
    await flush();
    expect(pageText()).toContain("! Wrong PIN. 2 tries left.");
    expect(pinInput()?.value).toBe("");
    expect(document.activeElement).toBe(pinInput());
  });

  it("double Enter while checking sends one check only (test 14)", async () => {
    let finish: (s: SessionInfo) => void = () => undefined;
    const login = vi.fn(() => new Promise<SessionInfo>((r) => (finish = r)));
    const { onSignedIn } = await renderLogin({ list: [users[0] as LoginUser], login });
    await typeText("1357");
    await press("Enter");
    expect(pageText()).toContain("Checking PIN...");
    expect(pinInput()?.readOnly).toBe(true);
    await press("Enter");
    await press("Enter");
    expect(login).toHaveBeenCalledTimes(1);
    await act(async () => finish(session()));
    await flush();
    expect(onSignedIn).toHaveBeenCalledTimes(1);
  });

  it("a barcode scan into the PIN box is not submitted and not a wrong try (test 13)", async () => {
    const { login } = await renderLogin({ list: [users[0] as LoginUser] });
    await typeText("8901234567890", { settle: false }); // 13 digits in zero time
    await press("Enter"); // the scanner's own Enter
    expect(pinInput()?.value).toBe("");
    expect(pageText()).toContain("That looked like a barcode scan. Type your PIN.");
    expect(login).not.toHaveBeenCalled();
    await typeText(""); // the person pauses, then types normally
    await typeText("1357");
    await press("Enter");
    await flush();
    expect(login).toHaveBeenCalledWith(1, "1357");
  });

  it("Num Lock off shows the plain hint", async () => {
    await renderLogin({ list: [users[0] as LoginUser] });
    await act(async () => {
      pinInput()?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", code: "Numpad1", bubbles: true, cancelable: true }),
      );
    });
    expect(pageText()).toContain("Num Lock is off - press Num Lock to type numbers.");
  });

  it("a failed check (database) is not a wrong try and keeps the PIN", async () => {
    const login = vi.fn(() => Promise.reject(appError("INTERNAL", "")));
    await renderLogin({ list: [users[0] as LoginUser], login });
    await typeText("1357");
    await press("Enter");
    await flush();
    expect(pageText()).toContain("Could not check the PIN. Nothing was changed. Press Enter to try again.");
    expect(pinInput()?.value).toBe("1357");
  });

  it("lock-out: shows the end time and a countdown, PIN hidden, another name can be chosen (test 11)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 5, 14, 32, 0));
    const login = vi.fn(() => Promise.reject(appError("LOCKED", "", { secondsLeft: 30 })));
    await renderLogin({ lastUserId: 1, login });
    await typeText("1357");
    await press("Enter");
    await flush();
    expect(pageText()).toContain("Too many wrong PINs. Ravi Kumar cannot sign in until 2:32 PM (30 s left).");
    expect(pageText()).toContain("Ask the owner to unlock, or choose another name.");
    expect(pinInput()).toBeNull();
    expect(document.activeElement?.getAttribute("role")).toBe("listbox");
    await press("ArrowDown"); // pick another user: PIN box is there for them
    expect(pinInput()).not.toBeNull();
    await press("ArrowUp");
    expect(pageText()).not.toContain("cannot sign in"); // notice is per user; backend decides again on next try
    // The countdown itself:
    await press("ArrowUp");
  });

  it("lock-out countdown ends and the PIN box returns", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 5, 14, 32, 0));
    const login = vi.fn(() => Promise.reject(appError("LOCKED", "", { secondsLeft: 3 })));
    await renderLogin({ list: [users[0] as LoginUser], login });
    await typeText("1357");
    await press("Enter");
    await flush();
    expect(pageText()).toContain("(3 s left)");
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(pageText()).toContain("(2 s left)");
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    expect(pinInput()).not.toBeNull();
    expect(pageText()).not.toContain("cannot sign in");
  });

  it("a user switched off after the list loaded: message and the list reloads (test 12)", async () => {
    const loadUsers = vi.fn(() => Promise.resolve(users));
    const login = vi.fn(() => Promise.reject(appError("NOT_FOUND", "")));
    await renderLogin({ lastUserId: 1, login, loadUsers });
    await typeText("1357");
    await press("Enter");
    await flush();
    expect(pageText()).toContain("Ravi Kumar has been switched off by the owner. Choose another name.");
    expect(loadUsers).toHaveBeenCalledTimes(2);
  });

  it("list load error: plain message, Enter tries again", async () => {
    const loadUsers = vi
      .fn<() => Promise<LoginUser[]>>()
      .mockRejectedValueOnce(new Error("db"))
      .mockResolvedValue(users);
    await renderLogin({ loadUsers });
    expect(pageText()).toContain("Could not read the user list. Press Enter to try again.");
    await press("Enter");
    await flush();
    expect(rows()).toHaveLength(3);
  });

  it("loading text appears only if loading is slow (no flicker)", async () => {
    vi.useFakeTimers();
    let done: (u: LoginUser[]) => void = () => undefined;
    const loadUsers = vi.fn(() => new Promise<LoginUser[]>((r) => (done = r)));
    await mount(<LoginScreen title="t" loadUsers={loadUsers} login={vi.fn()} onSignedIn={vi.fn()} />);
    expect(pageText()).not.toContain("Loading users...");
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(pageText()).toContain("Loading users...");
    await act(async () => done(users));
  });
});

describe("PinField", () => {
  it("does not auto-submit at 4 digits", async () => {
    const onSubmit = vi.fn();
    function F() {
      const [v, setV] = useState("");
      return <PinField label="PIN" value={v} onChange={setV} onSubmit={onSubmit} />;
    }
    await mount(<F />);
    document.querySelector("input")?.focus();
    await typeText("1234");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("SelectList", () => {
  it("Tamil names filter and are not clipped by a fixed height", async () => {
    function L() {
      const [sel, setSel] = useState<number | string | null>(1);
      return (
        <SelectList
          ariaLabel="Names"
          items={[
            { id: 1, label: "கடலை எண்ணெய் 1 லி" },
            { id: 2, label: "நல்லெண்ணெய்" },
          ]}
          selectedId={sel}
          onSelect={setSel}
          onChoose={() => undefined}
        />
      );
    }
    await mount(<L />);
    document.querySelector<HTMLElement>('[role="listbox"]')?.focus();
    await typeText("நல");
    expect(rows()).toEqual(["நல்லெண்ணெய்"]);
    expect(document.querySelector('[role="option"]')?.className).toContain("gk-tamil-safe");
  });

  it("Home, End, PageUp and PageDown move the selection", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: i, label: `Name ${i}` }));
    function L() {
      const [sel, setSel] = useState<number | string | null>(0);
      return <SelectList ariaLabel="n" items={many} selectedId={sel} onSelect={setSel} onChoose={() => undefined} />;
    }
    await mount(<L />);
    document.querySelector<HTMLElement>('[role="listbox"]')?.focus();
    await press("End");
    expect(document.querySelector('[aria-selected="true"]')?.textContent).toBe("Name 29");
    await press("PageUp");
    expect(document.querySelector('[aria-selected="true"]')?.textContent).toBe("Name 21");
    await press("Home");
    expect(document.querySelector('[aria-selected="true"]')?.textContent).toBe("Name 0");
    await press("PageDown");
    expect(document.querySelector('[aria-selected="true"]')?.textContent).toBe("Name 8");
  });
});

describe("lock screen (test 16)", () => {
  function Shell({
    onSwitch,
    login,
  }: {
    onSwitch: () => void;
    login: (id: number, pin: string) => Promise<SessionInfo>;
  }) {
    const [locked, setLocked] = useState(false);
    const [text, setText] = useState("");
    return (
      <>
        <div inert={locked}>
          <input id="work" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <button id="lock" onClick={() => setLocked(true)}>
          lock
        </button>
        {locked ? (
          <LockScreen
            shopName="Gokul Oils"
            userId={1}
            userName="Ravi Kumar"
            lockedAt={new Date(2026, 10, 5, 14, 32)}
            login={login}
            onUnlocked={() => setLocked(false)}
            onSwitchUser={onSwitch}
            onHelp={() => undefined}
            getUnsaved={() => (text !== "" ? "Settings" : null)}
          />
        ) : null}
      </>
    );
  }

  it("hides the screen, keeps the typed value, unlocks with the PIN", async () => {
    const login = vi.fn(() => Promise.resolve(session()));
    await mount(<Shell onSwitch={vi.fn()} login={login} />);
    document.getElementById("work")?.focus();
    await typeText("abc");
    await act(async () => document.getElementById("lock")?.click());
    expect(pageText()).toContain("Locked");
    expect(pageText()).toContain("Locked at 2:32 PM");
    expect(document.querySelector(".gk-lock")).not.toBeNull();
    expect(document.querySelector("[inert]")).not.toBeNull();
    expect(document.activeElement).toBe(pinInput());
    await typeText("1357");
    await press("Enter");
    await flush();
    expect(login).toHaveBeenCalledWith(1, "1357");
    expect(document.querySelector(".gk-lock")).toBeNull();
    expect((document.getElementById("work") as HTMLInputElement).value).toBe("abc");
  });

  it("wrong PIN on the lock screen uses the same message", async () => {
    const login = vi.fn(() => Promise.reject(appError("WRONG_PIN", "", { attemptsBeforeLock: 3 })));
    await mount(<Shell onSwitch={vi.fn()} login={login} />);
    await act(async () => document.getElementById("lock")?.click());
    await typeText("1357");
    await press("Enter");
    await flush();
    expect(pageText()).toContain("Wrong PIN. 3 tries left.");
    expect(document.querySelector(".gk-lock")).not.toBeNull();
  });

  it("Esc switches user straight away when nothing is unsaved", async () => {
    const onSwitch = vi.fn();
    await mount(<Shell onSwitch={onSwitch} login={vi.fn()} />);
    await act(async () => document.getElementById("lock")?.click());
    await press("Escape");
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });

  it("Esc asks first when there are unsaved changes: Esc stays locked, D discards", async () => {
    const onSwitch = vi.fn();
    await mount(<Shell onSwitch={onSwitch} login={vi.fn()} />);
    document.getElementById("work")?.focus();
    await typeText("x");
    await act(async () => document.getElementById("lock")?.click());
    await press("Escape");
    expect(pageText()).toContain("Ravi Kumar has unsaved changes in Settings. Switching user will throw them away.");
    expect(onSwitch).not.toHaveBeenCalled();
    await press("Escape");
    expect(pageText()).not.toContain("Switching user will throw them away");
    expect(document.querySelector(".gk-lock")).not.toBeNull();
    await press("Escape");
    await press("d");
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });
});

describe("recovery code screen", () => {
  it("formats the code in groups of four", () => {
    expect(formatRecoveryCode("ABCD1234EFGH5678")).toBe("ABCD-1234-EFGH-5678");
  });

  it("must be confirmed with 'I have written it down' before going on", async () => {
    const onConfirmed = vi.fn();
    await mount(<RecoveryCodeScreen code="ABCD1234EFGH5678" onConfirmed={onConfirmed} />);
    expect(pageText()).toContain("ABCD-1234-EFGH-5678");
    expect(pageText()).toContain("shown only once");
    await press("Enter");
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(pageText()).toContain("Tick 'I have written it down' first");
    const box = document.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(document.activeElement).toBe(box);
    await act(async () => box?.click());
    await press("Enter");
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });
});

describe("change PIN screen", () => {
  it("checks the two new PINs match, then calls the backend once", async () => {
    const changePin = vi.fn(() => Promise.resolve(session()));
    const onDone = vi.fn();
    await mount(<ChangePinScreen changePin={changePin} onDone={onDone} onCancel={vi.fn()} />);
    await typeText("1357");
    await press("Enter");
    await typeText("2468");
    await press("Enter");
    await typeText("2469");
    await press("Enter");
    expect(pageText()).toContain("The two PINs do not match. Type them again.");
    expect(changePin).not.toHaveBeenCalled();
    expect(document.activeElement?.getAttribute("name")).toBe("newPin");
    await typeText("2468");
    await press("Enter");
    await typeText("2468");
    await press("Enter");
    await flush();
    expect(changePin).toHaveBeenCalledWith("1357", "2468");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("shows the backend's reason for a refused new PIN under the field", async () => {
    const changePin = vi.fn(() =>
      Promise.reject(
        appError("PIN_INVALID", "", { fields: [{ field: "newPin", message: "This PIN is too easy to guess. Choose another." }] }),
      ),
    );
    await mount(<ChangePinScreen changePin={changePin} onDone={vi.fn()} onCancel={vi.fn()} />);
    await typeText("1357");
    await press("Enter");
    await typeText("1234");
    await press("Enter");
    await typeText("1234");
    await press("Enter");
    await flush();
    expect(pageText()).toContain("! This PIN is too easy to guess. Choose another.");
  });
});
