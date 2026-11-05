import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { Dialog } from "./overlays";
import { KeyLegend, StatusBar } from "./layout";
import { useHeartbeat, useIdleTimer, useFocusGuard, useMinuteClock } from "./hooks";
import {
  LAYER,
  canonCombo,
  comboOf,
  installBrowserKeyBlock,
  resetKeymapsForTests,
  useKeymap,
  type Binding,
} from "./keymap";
import { flush, mount, press, unmountAll } from "./testing";

afterEach(async () => {
  await unmountAll();
  resetKeymapsForTests();
  vi.useRealTimers();
});

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
}

describe("key names", () => {
  it("makes one canonical name per combination", () => {
    expect(canonCombo("ctrl+s")).toBe("Ctrl+S");
    expect(canonCombo("Escape")).toBe("Esc");
    expect(comboOf(keydown({ key: "s", code: "KeyS", ctrlKey: true }))).toBe("Ctrl+S");
    expect(comboOf(keydown({ key: "t", code: "KeyT", altKey: true }))).toBe("Alt+T");
    expect(comboOf(keydown({ key: "F10" }))).toBe("F10");
    expect(comboOf(keydown({ key: "Escape" }))).toBe("Esc");
    // Alt+letter still works if the layout changes the character
    expect(comboOf(keydown({ key: "†", code: "KeyT", altKey: true }))).toBe("Alt+T");
  });
});

describe("blocked browser keys (test 21)", () => {
  let off: () => void;
  beforeEach(() => {
    off = installBrowserKeyBlock({ dev: false });
  });
  afterEach(() => off());

  const blocked: [string, KeyboardEventInit][] = [
    ["F5", { key: "F5" }],
    ["Ctrl+R", { key: "r", code: "KeyR", ctrlKey: true }],
    ["Ctrl+Shift+R", { key: "R", code: "KeyR", ctrlKey: true, shiftKey: true }],
    ["F3", { key: "F3" }],
    ["Ctrl+F", { key: "f", code: "KeyF", ctrlKey: true }],
    ["Ctrl+G", { key: "g", code: "KeyG", ctrlKey: true }],
    ["Ctrl+P", { key: "p", code: "KeyP", ctrlKey: true }],
    ["Ctrl+J", { key: "j", code: "KeyJ", ctrlKey: true }],
    ["Ctrl+U", { key: "u", code: "KeyU", ctrlKey: true }],
    ["Ctrl+H", { key: "h", code: "KeyH", ctrlKey: true }],
    ["Ctrl+Shift+I", { key: "I", code: "KeyI", ctrlKey: true, shiftKey: true }],
    ["F12", { key: "F12" }],
    ["F7", { key: "F7" }],
    ["Alt+Left", { key: "ArrowLeft", altKey: true }],
    ["Alt+Right", { key: "ArrowRight", altKey: true }],
    ["BrowserBack", { key: "BrowserBack" }],
    ["BrowserForward", { key: "BrowserForward" }],
    ["Ctrl+Plus", { key: "+", ctrlKey: true, shiftKey: true }],
    ["Ctrl+Minus", { key: "-", ctrlKey: true }],
    ["Ctrl+0", { key: "0", ctrlKey: true }],
  ];

  it.each(blocked)("%s does nothing", (_name, init) => {
    const ev = keydown(init);
    document.body.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("lets normal keys through", () => {
    for (const init of [{ key: "a" }, { key: "Enter" }, { key: "F10" }, { key: "s", code: "KeyS", ctrlKey: true }]) {
      const ev = keydown(init);
      document.body.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
    }
  });

  it("blocks Ctrl+mouse wheel zoom and the right-click menu", () => {
    const wheel = new WheelEvent("wheel", { ctrlKey: true, cancelable: true, bubbles: true });
    document.body.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    const menu = new MouseEvent("contextmenu", { cancelable: true, bubbles: true });
    document.body.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });

  it("leaves F12 for devtools in dev", () => {
    off();
    off = installBrowserKeyBlock({ dev: true });
    const ev = keydown({ key: "F12" });
    document.body.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});

function Probe({ log, layer = LAYER.screen, modal = false }: { log: string[]; layer?: 0 | 1 | 2 | 3; modal?: boolean }) {
  const bindings: Binding[] = [
    { keys: ["F10", "Ctrl+S"], label: "Save", run: () => log.push(`save-${layer}`) },
    { keys: ["Alt+S"], label: "Stock", run: () => log.push(`stock-${layer}`) },
    { keys: ["Esc"], label: "Back", run: () => log.push(`esc-${layer}`) },
  ];
  useKeymap(bindings, { layer, modal });
  return null;
}

describe("keymap stack", () => {
  it("F10 and Ctrl+S both save, and Ctrl+S never opens Stock (Alt+S)", async () => {
    const log: string[] = [];
    await mount(<Probe log={log} />);
    await press("F10");
    await press("s", { ctrl: true });
    await press("s", { alt: true });
    expect(log).toEqual(["save-1", "save-1", "stock-1"]);
  });

  it("the top layer wins and a modal layer blocks the ones below", async () => {
    const log: string[] = [];
    await mount(
      <>
        <Probe log={log} layer={LAYER.screen} />
        <Probe log={log} layer={LAYER.dialog} modal />
      </>,
    );
    await press("Esc");
    expect(log).toEqual(["esc-2"]);
  });

  it("a field that uses a key stops it reaching the keymap", async () => {
    const log: string[] = [];
    function Field() {
      return <input onKeyDown={(e) => e.key === "Escape" && e.stopPropagation()} />;
    }
    await mount(
      <>
        <Probe log={log} />
        <Field />
      </>,
    );
    document.querySelector("input")?.focus();
    await press("Escape");
    expect(log).toEqual([]);
    await press("F10");
    expect(log).toEqual(["save-1"]);
  });

  it("ignores keys while an IME is composing", async () => {
    const log: string[] = [];
    await mount(<Probe log={log} />);
    await act(async () => {
      window.dispatchEvent(keydown({ key: "Escape", isComposing: true }));
      window.dispatchEvent(keydown({ key: "Escape", keyCode: 229 }));
    });
    expect(log).toEqual([]);
  });

  it("legend and keymap come from the same list; clicking a hint presses the key", async () => {
    const log: string[] = [];
    const m = await mount(
      <>
        <Probe log={log} />
        <KeyLegend mode="list" />
      </>,
    );
    const hint = Array.from(m.host.querySelectorAll(".gk-legend-item")).find((e) => e.textContent?.includes("Save"));
    expect(hint?.textContent).toBe("F10Save");
    await act(async () => {
      (hint as HTMLElement).click();
    });
    expect(log).toEqual(["save-1"]);
  });

  it("slot legend shows F1-F12 in fixed places and Ctrl keys at the right (test 20)", async () => {
    function Pos() {
      useKeymap([
        { keys: ["F1"], label: "Help", run: () => undefined },
        { keys: ["Ctrl+L"], label: "Lock", run: () => undefined },
        { keys: ["F5"], label: "", silent: true, run: () => undefined },
      ]);
      return null;
    }
    const m = await mount(
      <>
        <Pos />
        <KeyLegend mode="slots" />
      </>,
    );
    const slots = Array.from(m.host.querySelectorAll("[data-slot]")).map((e) => e.getAttribute("data-slot"));
    expect(slots).toEqual(["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"]);
    expect(m.host.querySelector('[data-slot="F1"]')?.textContent).toBe("F1Help");
    expect(m.host.querySelector('[data-slot="F5"]')?.textContent).toBe("F5");
    expect(m.host.querySelector(".gk-legend")?.textContent).toContain("Ctrl+LLock");
  });
});

describe("dialog", () => {
  function Host({ log }: { log: string[] }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button id="opener" onClick={() => setOpen(true)}>
          open
        </button>
        {open ? (
          <Dialog
            title="Save changes?"
            buttons={[
              { label: "Save and leave", isDefault: true, onPress: () => log.push("save") },
              { label: "Discard changes", keys: ["D"], onPress: () => log.push("discard") },
            ]}
            onCancel={() => setOpen(false)}
            cancelLabel="Stay"
          />
        ) : null}
      </>
    );
  }

  it("Enter is the safe default, letter keys work, Esc closes and focus returns", async () => {
    const log: string[] = [];
    const m = await mount(<Host log={log} />);
    const opener = m.host.querySelector<HTMLButtonElement>("#opener");
    opener?.focus();
    await act(async () => opener?.click());
    expect(document.activeElement?.textContent).toContain("Save and leave");
    await press("Enter");
    await press("d");
    expect(log).toEqual(["save", "discard"]);
    await press("Escape");
    expect(m.host.querySelector("[role=dialog]")).toBeNull();
    expect(document.activeElement?.id).toBe("opener");
  });

  it("Tab stays inside the dialog", async () => {
    const m = await mount(<Host log={[]} />);
    const opener = m.host.querySelector<HTMLButtonElement>("#opener");
    opener?.focus();
    await act(async () => opener?.click());
    const buttons = Array.from(m.host.querySelectorAll<HTMLButtonElement>(".gk-dialog button"));
    const last = buttons[buttons.length - 1];
    last?.focus();
    await press("Tab");
    expect(document.activeElement).toBe(buttons[0]);
    await press("Tab", { shift: true });
    expect(document.activeElement).toBe(last);
  });
});

describe("status bar clock (test 28)", () => {
  it("re-renders once per minute at the boundary, never in between", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 5, 14, 32, 40));
    const onRender = vi.fn();
    function Clock() {
      const now = useMinuteClock();
      onRender();
      return <span id="t">{now.getMinutes()}</span>;
    }
    await mount(<Clock />);
    const first = onRender.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(19_000); // 14:32:59
    });
    expect(onRender.mock.calls.length).toBe(first);
    await act(async () => {
      vi.advanceTimersByTime(2_000); // 14:33:01
    });
    expect(onRender.mock.calls.length).toBe(first + 1);
    expect(document.getElementById("t")?.textContent).toBe("33");
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onRender.mock.calls.length).toBe(first + 1);
  });

  it("shows shop name, user and backup, and the warning words", async () => {
    const m = await mount(
      <StatusBar
        shopName="Gokul Oils"
        shopNotSet
        userLabel="Ravi Kumar (Cashier)"
        backup={{ configured: true, lastBackupAt: null }}
      />,
    );
    const text = m.host.textContent ?? "";
    expect(text).toContain("Gokul Oils");
    expect(text).toContain("Shop not set up");
    expect(text).toContain("Ravi Kumar (Cashier)");
    expect(text).toContain("Backup: never");
    expect(m.host.querySelector(".gk-bar-danger")?.textContent).toBe("Backup: never");
  });

  it("keeps Tamil names whole (no clipping markup) and gives the full text in a tooltip", async () => {
    const m = await mount(<StatusBar shopName="கடலை எண்ணெய் கடை" userLabel="நல்லெண்ணெய் (Cashier)" />);
    const shop = m.host.querySelector(".gk-statusbar-shop");
    expect(shop?.textContent).toBe("கடலை எண்ணெய் கடை");
    expect(shop?.getAttribute("title")).toBe("கடலை எண்ணெய் கடை");
    expect(shop?.className).toContain("gk-tamil-safe");
  });
});

describe("heartbeat and idle timer", () => {
  it("heartbeat is sent at most every 30 s and only while keys are pressed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const send = vi.fn();
    function H() {
      useHeartbeat(send);
      return null;
    }
    await mount(<H />);
    await act(async () => {
      vi.advanceTimersByTime(10 * 60_000); // ten idle minutes: nothing sent
    });
    expect(send).toHaveBeenCalledTimes(0);
    for (let i = 0; i < 20; i++) window.dispatchEvent(keydown({ key: "a" }));
    expect(send).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 29_000);
    window.dispatchEvent(keydown({ key: "a" }));
    expect(send).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 2_000);
    window.dispatchEvent(keydown({ key: "a" }));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("idle timer fires after the idle time without keys, and keys push it back", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const onIdle = vi.fn();
    function T({ ms }: { ms: number }) {
      useIdleTimer(ms, onIdle);
      return null;
    }
    await mount(<T ms={600_000} />);
    await act(async () => {
      vi.advanceTimersByTime(500_000);
    });
    window.dispatchEvent(keydown({ key: "a" }));
    await act(async () => {
      vi.advanceTimersByTime(200_000); // 700 s since start, 200 s since the key
    });
    expect(onIdle).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(401_000);
    });
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("idle time 0 switches it off (POS never auto-locks)", async () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    function T() {
      useIdleTimer(0, onIdle);
      return null;
    }
    await mount(<T />);
    await act(async () => {
      vi.advanceTimersByTime(3 * 3_600_000);
    });
    expect(onIdle).not.toHaveBeenCalled();
  });
});

describe("focus never lands on body (test 22)", () => {
  function G() {
    useFocusGuard(() => document.getElementById("fallback"));
    return (
      <>
        <input id="a" />
        <input id="b" />
        <input id="fallback" />
      </>
    );
  }

  it("returns to the last focused field after a click on blank area", async () => {
    await mount(<G />);
    document.getElementById("b")?.focus();
    await act(async () => {
      (document.activeElement as HTMLElement).blur();
    });
    await flush(1);
    expect(document.activeElement?.id).toBe("b");
  });

  it("returns to the last focused field when the window comes back after Alt+Tab", async () => {
    await mount(<G />);
    document.getElementById("a")?.focus();
    (document.activeElement as HTMLElement).blur(); // window lost focus
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await flush(1);
    expect(document.activeElement?.id).toBe("a");
  });

  it("falls back to the screen's initial target if the field was removed", async () => {
    function G2({ hide }: { hide: boolean }) {
      useFocusGuard(() => document.getElementById("fallback"));
      return (
        <>
          {hide ? null : <input id="b" />}
          <input id="fallback" />
        </>
      );
    }
    const m = await mount(<G2 hide={false} />);
    document.getElementById("b")?.focus();
    await act(async () => {
      m.root.render(<G2 hide />);
    });
    await act(async () => {
      document.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    await flush(1);
    expect(document.activeElement?.id).toBe("fallback");
  });
});
