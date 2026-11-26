import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Button, Dialog } from '@gokul/ui';

/**
 * Closing Gokul Office. The Rust side (apps/office/src-tauri/src/main.rs) owns the window: every close (cross, Alt+F4,
 * Windows asking us to close) goes through it and the process always ends. The only thing Rust asks of the screens is
 * "is anything unsaved?", answered here from the forms that register themselves with `useUnsavedChanges`.
 */
const open = new Set<symbol>();

function tell() {
  if (!isTauri()) return;
  void invoke('set_unsaved', { dirty: open.size > 0 }).catch(() => undefined);
}

/** Call from any form with unsaved edits. While `dirty` is true, closing the window asks "Discard changes?" once. */
export function useUnsavedChanges(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return undefined;
    const id = Symbol('unsaved');
    open.add(id); tell();
    return () => { open.delete(id); tell(); };
  }, [dirty]);
}

/** Shows the one "Discard changes?" question when Rust says a close was asked while something is unsaved. */
export function CloseGuardHost() {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!isTauri()) return undefined;
    let off: (() => void) | undefined;
    let gone = false;
    void listen('gokul-confirm-close', () => setAsking(true)).then((u) => { if (gone) u(); else off = u; }).catch(() => undefined);
    return () => { gone = true; off?.(); };
  }, []);
  const keep = () => { setAsking(false); tell(); }; // tell() also re-arms the question for the next close
  return (
    <Dialog
      open={asking} onOpenChange={(o) => { if (!o) keep(); }} size="sm" title="Discard changes?"
      description="Some changes on this screen are not saved yet."
      footer={(
        <>
          <Button variant="ghost" onClick={keep} kbd="Esc">Keep editing</Button>
          <Button variant="danger" data-autofocus onClick={() => void invoke('quit_app').catch(() => undefined)}>Discard and close</Button>
        </>
      )}
    >
      <p className="text-sm text-muted">If you close now, what you typed since the last save is lost.</p>
    </Dialog>
  );
}
