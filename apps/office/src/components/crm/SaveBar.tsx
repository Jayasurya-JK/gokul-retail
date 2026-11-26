import { useEffect } from 'react';
import { Button } from '@gokul/ui';
import { useUnsavedChanges } from '../../unsaved';

/** Bottom bar shown while a form has unsaved changes. Ctrl+S saves, Esc-free discard keeps keyboard flow simple. */
export function SaveBar({ dirty, busy, onSave, onDiscard, message }: { dirty: boolean; busy?: boolean; onSave: () => void; onDiscard: () => void; message?: string }) {
  useUnsavedChanges(dirty);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); onSave(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [dirty, onSave]);
  return (
    <div className={`flex h-12 shrink-0 items-center justify-between gap-3 border-t px-5 transition-colors ${dirty ? 'border-warning/40 bg-warning-soft' : 'border-line bg-surface-2'}`}>
      <div className="flex items-center gap-2 text-sm">
        <span className={`h-2 w-2 rounded-full ${dirty ? 'bg-warning' : 'bg-success'}`} />
        <span className={dirty ? 'font-medium text-warning' : 'text-muted'}>{dirty ? (message ?? 'You have unsaved changes') : 'All changes saved'}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" disabled={!dirty || busy} onClick={onDiscard}>Discard</Button>
        <Button variant="primary" disabled={!dirty || busy} onClick={onSave} kbd="Ctrl+S">Save changes</Button>
      </div>
    </div>
  );
}
