import { useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref } from "react";
import { formatBackup, formatDateTime } from "./format";
import { useMinuteClock } from "./hooks";
import { canonCombo, pressKey, useActiveBindings } from "./keymap";

/* --------------------------------------------------------------- StatusBar */

export interface StatusBarProps {
  /** Shown bold on the left: the saved shop name, or the app name when the shop is not set up. */
  shopName: string;
  /** Office only: show "Shop not set up" in warning colour. */
  shopNotSet?: boolean;
  /** "Ravi Kumar (Cashier)". Leave out on login, lock, first-run and blocking screens. */
  userLabel?: string | undefined;
  /** Leave out to hide the backup segment. */
  backup?: { configured: boolean; lastBackupAt: string | null } | undefined;
}

export function StatusBar({ shopName, shopNotSet, userLabel, backup }: StatusBarProps) {
  const now = useMinuteClock();
  const b = backup ? formatBackup(backup.configured, backup.lastBackupAt, now) : null;
  return (
    <header className="gk-statusbar" role="banner">
      <span className="gk-statusbar-shop gk-tamil-safe" title={shopName}>
        {shopName}
      </span>
      {shopNotSet ? <span className="gk-bar-warn">Shop not set up</span> : null}
      {userLabel ? (
        <span className="gk-statusbar-user gk-tamil-safe" title={userLabel}>
          {userLabel}
        </span>
      ) : null}
      <time dateTime={now.toISOString()}>{formatDateTime(now)}</time>
      {b ? (
        <span className={b.level === "warn" ? "gk-bar-warn" : b.level === "danger" ? "gk-bar-danger" : undefined}>
          {b.text}
        </span>
      ) : null}
    </header>
  );
}

/* --------------------------------------------------------------- KeyLegend */

function KeyCap({ children }: { children: ReactNode }) {
  return <span className="gk-keycap">{children}</span>;
}

/**
 * Bottom bar of key hints from the live keymap. Clickable with the mouse (same as the key),
 * but not in the Tab order.
 */
export function KeyLegend({ mode }: { mode: "slots" | "list" }) {
  const bindings = useActiveBindings().filter((b) => b.legend);
  if (mode === "list") {
    return (
      <footer className="gk-legend" aria-label="Keys">
        {bindings.map((b) => (
          <span
            key={b.keys.join("|") + b.label}
            className="gk-legend-item"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => b.keys[0] && pressKey(b.keys[0])}
          >
            <KeyCap>{b.keys[0]}</KeyCap>
            {b.label}
          </span>
        ))}
      </footer>
    );
  }
  const slots = Array.from({ length: 12 }, (_, i) => `F${i + 1}`);
  const others = bindings.filter((b) => !slots.includes(canonCombo(b.keys[0] ?? "")));
  return (
    <footer className="gk-legend" aria-label="Keys">
      {slots.map((k) => {
        const b = bindings.find((x) => canonCombo(x.keys[0] ?? "") === k);
        return (
          <span
            key={k}
            className={b ? "gk-legend-slot gk-legend-item" : "gk-legend-slot gk-legend-slot-empty"}
            data-slot={k}
            onMouseDown={(e) => e.preventDefault()}
            onClick={b ? () => pressKey(k) : undefined}
          >
            <KeyCap>{k}</KeyCap>
            {b ? b.label : null}
          </span>
        );
      })}
      <span className="gk-legend-spacer" />
      {others.map((b) => (
        <span
          key={b.keys.join("|") + b.label}
          className="gk-legend-item"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => b.keys[0] && pressKey(b.keys[0])}
        >
          <KeyCap>{b.keys[0]}</KeyCap>
          {b.label}
        </span>
      ))}
    </footer>
  );
}

/* ---------------------------------------------------------------- SideMenu */

export interface MenuItem {
  id: string;
  label: string;
  /** Underlined access letter (Alt+letter). */
  accessKey: string;
}

function LabelWithAccess({ label, accessKey }: { label: string; accessKey: string }) {
  const i = label.toLowerCase().indexOf(accessKey.toLowerCase());
  if (i < 0) return <>{label}</>;
  return (
    <>
      {label.slice(0, i)}
      <u>{label.slice(i, i + 1)}</u>
      {label.slice(i + 1)}
    </>
  );
}

export function SideMenu({
  items,
  currentId,
  onOpen,
  menuRef,
}: {
  items: MenuItem[];
  currentId: string;
  onOpen: (id: string) => void;
  menuRef?: Ref<HTMLUListElement>;
}) {
  const [cursor, setCursor] = useState(currentId);
  const index = Math.max(
    0,
    items.findIndex((i) => i.id === cursor),
  );

  const onKeyDown = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    const move = (to: number) => {
      e.preventDefault();
      e.stopPropagation();
      const item = items[Math.max(0, Math.min(items.length - 1, to))];
      if (item) setCursor(item.id);
    };
    if (e.key === "ArrowDown") move(index + 1);
    else if (e.key === "ArrowUp") move(index - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(items.length - 1);
    else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const item = items[index];
      if (item) onOpen(item.id);
    }
  };

  return (
    <ul
      ref={menuRef}
      className="gk-menu"
      role="menu"
      tabIndex={0}
      aria-label="Menu"
      aria-activedescendant={`gk-menu-${items[index]?.id ?? ""}`}
      onFocus={(e) => {
        if (e.target === e.currentTarget) setCursor(currentId);
      }}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => (
        <li
          key={item.id}
          id={`gk-menu-${item.id}`}
          role="menuitem"
          className="gk-menu-item"
          aria-current={item.id === currentId ? "page" : undefined}
          data-cursor={item.id === items[index]?.id}
          onClick={() => onOpen(item.id)}
        >
          <LabelWithAccess label={item.label} accessKey={item.accessKey} />
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- AppFrame */

/** StatusBar on top, content in the middle (the only part that scrolls), KeyLegend at the bottom. */
export function AppFrame({
  statusBar,
  legend,
  menu,
  children,
  contentRef,
}: {
  statusBar: ReactNode;
  legend: ReactNode;
  menu?: ReactNode;
  children: ReactNode;
  contentRef?: Ref<HTMLElement>;
}) {
  return (
    <div className="gk-frame">
      {statusBar}
      <div className="gk-frame-main">
        {menu}
        <main ref={contentRef} className="gk-content">
          {children}
        </main>
      </div>
      {legend}
    </div>
  );
}
