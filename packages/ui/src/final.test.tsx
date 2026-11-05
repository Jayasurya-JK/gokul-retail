import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LoginUser, SessionInfo } from "./api-types";
import { SelectList } from "./controls";
import { KeyLegend } from "./layout";
import { LAYER, resetKeymapsForTests, useKeymap } from "./keymap";
import { HelpOverlay } from "./overlays";
import { ChangePinScreen, LoginScreen } from "./screens";
import { appError, flush, mount, pageText, press, typeText, unmountAll } from "./testing";

afterEach(async () => {
  await unmountAll();
  resetKeymapsForTests();
  vi.useRealTimers();
});

const session: SessionInfo = { userId: 1, name: "x", role: "cashier", mustChangePin: false, allowedScreens: [] };
const users: LoginUser[] = [
  { id: 1, name: "Ravi Kumar", role: "cashier" },
  { id: 3, name: "Gokul", role: "owner" },
];

describe("selected row is readable (UX Must 1)", () => {
  it("every cell of a selected row sits inside the row with no inline colour or opacity", async () => {
    function L() {
      const [sel, setSel] = useState<number | string | null>(1);
      return (
        <SelectList
          ariaLabel="u"
          filterable={false}
          items={[
            { id: 1, label: "Ravi", right: "Locked (30 s left)" },
            { id: 2, label: "Meena", right: "Active" },
          ]}
          selectedId={sel}
          onSelect={setSel}
          onChoose={() => undefined}
        />
      );
    }
    await mount(<L />);
    document.querySelector<HTMLElement>('[role="listbox"]')?.focus();
    for (const id of ["Ravi", "Meena"]) {
      const row = document.querySelector('[aria-selected="true"]');
      expect(row?.textContent).toContain(id);
      for (const cell of Array.from(row?.querySelectorAll("span") ?? [])) {
        expect(cell.getAttribute("style")).toBeNull();
      }
      await press("ArrowDown");
    }
  });
});

describe("F1 help lists the keys (UX Must 2)", () => {
  function Screen({ extra }: { extra?: boolean }) {
    const [help, setHelp] = useState(false);
    useKeymap(
      [
        { keys: ["F1"], label: "Help", run: () => setHelp(true) },
        { keys: ["F10", "Ctrl+S"], label: "Save", run: () => undefined },
        { keys: ["Up/Down"], label: "Choose" },
        { keys: ["F5"], label: "", silent: true, run: () => undefined },
      ],
      { layer: LAYER.screen },
    );
    return (
      <>
        <KeyLegend mode="list" />
        {help ? <HelpOverlay onClose={() => setHelp(false)} extra={extra ? [{ keys: "F2 to F12", label: "Used by billing, not active yet" }] : []} /> : null}
      </>
    );
  }

  it("shows a Key | What it does table with every legend key, the extra lines and Esc Close", async () => {
    await mount(<Screen extra />);
    const legend = Array.from(document.querySelectorAll(".gk-legend-item")).map((e) => e.textContent ?? "");
    await press("F1");
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Keys on this screen");
    expect(Array.from(dialog?.querySelectorAll("th") ?? []).map((e) => e.textContent)).toEqual(["Key", "What it does"]);
    const rows = Array.from(dialog?.querySelectorAll("tbody tr") ?? []).map((r) => r.textContent ?? "");
    for (const item of Array.from(document.querySelectorAll(".gk-legend-item"))) {
      const key = item.querySelector(".gk-keycap")?.textContent ?? "";
      const label = (item.textContent ?? "").slice(key.length);
      expect(rows.some((r) => r.includes(key) && r.endsWith(label)), `${key} ${label}`).toBe(true);
    }
    expect(legend.length).toBeGreaterThan(1);
    expect(rows.join("|")).toContain("F10 or Ctrl+SSave");
    expect(rows.join("|")).toContain("F2 to F12Used by billing, not active yet");
    expect(dialog?.textContent).not.toContain("F5"); // silent keys stay hidden
    expect(dialog?.textContent).toContain("Esc Close");
    await press("Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe("login role column and owner-only F4 (UX 6, 15)", () => {
  function Root({ run }: { run: () => void }) {
    // Like the real app: the root owns F1, the login screen is its child.
    useKeymap([{ keys: ["F1"], label: "Help", run: () => undefined }], { layer: LAYER.app });
    return (
      <>
        <LoginScreen
          title="Sign in"
          loadUsers={() => Promise.resolve(users)}
          login={() => Promise.resolve(session)}
          onSignedIn={() => undefined}
          ownerKey={{ keys: ["F4"], label: "Forgot owner PIN", run }}
        />
        <KeyLegend mode="list" />
      </>
    );
  }
  const legendText = () => Array.from(document.querySelectorAll(".gk-legend-item")).map((e) => e.textContent);

  it("shows Owner or Cashier at the right of each row", async () => {
    await mount(<Root run={vi.fn()} />);
    await flush();
    const roles = Array.from(document.querySelectorAll('[role="option"]')).map((e) => e.lastElementChild?.textContent);
    expect(roles).toEqual(["Cashier", "Owner"]);
  });

  it("F4 is in the legend, after F1, only while an owner is chosen; it runs only for the owner", async () => {
    const run = vi.fn();
    await mount(<Root run={run} />);
    await flush();
    // first row = cashier
    expect(legendText().some((t) => t?.includes("Forgot owner PIN"))).toBe(false);
    await press("F4");
    expect(run).not.toHaveBeenCalled();
    expect(pageText()).toContain("Only the owner uses a recovery code. Ask the owner to reset your PIN.");
    await press("ArrowDown"); // owner
    expect(pageText()).not.toContain("Only the owner uses a recovery code");
    const items = legendText();
    const f1 = items.findIndex((t) => t?.startsWith("F1"));
    const f4 = items.findIndex((t) => t?.startsWith("F4"));
    expect(f1).toBeGreaterThanOrEqual(0);
    expect(f4).toBeGreaterThan(f1);
    await press("F4");
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("change PIN (item 7)", () => {
  it("a bad old-PIN format error appears under the Current PIN box", async () => {
    const changePin = vi.fn(() =>
      Promise.reject(appError("PIN_INVALID", "", { fields: [{ field: "pin", message: "PIN can have digits only." }] })),
    );
    await mount(<ChangePinScreen changePin={changePin} onDone={vi.fn()} onCancel={vi.fn()} />);
    await typeText("1357");
    await press("Enter");
    await typeText("2468");
    await press("Enter");
    await typeText("2468");
    await press("Enter");
    await flush(3);
    const current = document.querySelector('input[name="oldPin"]');
    const error = current?.parentElement?.querySelector(".gk-error-text");
    expect(error?.textContent).toBe("! PIN can have digits only.");
    expect(document.activeElement).toBe(current);
  });
});

describe("lock-out countdown ticks each second for a long lock", () => {
  it("shows minutes and the clock time for 2 minutes or more, seconds below", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 5, 14, 32, 0));
    const login = vi.fn(() => Promise.reject(appError("LOCKED", "", { secondsLeft: 300 })));
    await mount(<LoginScreen title="t" loadUsers={() => Promise.resolve([users[0] as LoginUser])} login={login} onSignedIn={vi.fn()} />);
    await flush();
    await typeText("1357");
    await press("Enter");
    await flush();
    expect(pageText()).toContain("cannot sign in for 5 more minutes (until 2:37 PM).");
    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });
    expect(pageText()).toContain("for 4 more minutes");
    await act(async () => {
      vi.advanceTimersByTime(130_000);
    });
    expect(pageText()).toContain("for 109 more seconds");
    expect(pageText()).not.toContain("until");
  });
});
