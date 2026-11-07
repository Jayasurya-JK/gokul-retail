import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import type { NameResult } from '@gokul/data';
import { Button, Dialog, EmptyState, IconButton, Input, cn } from '@gokul/ui';

export interface ListRow { id: string; name: string; items: number }

/**
 * A compact list with inline add, rename, reorder and delete, used for categories and brands in the left pane.
 * `selectedId` is the filter the owner picked (click or Enter, click again to clear); the focus ring is the keyboard cursor.
 */
export function ManagedList({ title, noun, icon, rows, selectedId, onSelect, onAdd, onRename, onDelete, onMove }: {
  title: string; noun: string; icon: ReactNode; rows: ListRow[];
  selectedId: string | null; onSelect: (id: string | null) => void;
  onAdd: (name: string) => Promise<NameResult>;
  onRename: (id: string, name: string) => Promise<NameResult>;
  onDelete: (id: string) => Promise<NameResult>;
  onMove: (id: string, delta: -1 | 1) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [addError, setAddError] = useState('');
  const [curId, setCurId] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editError, setEditError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const maxItems = Math.max(1, ...rows.map((r) => r.items));
  const cur = rows.find((r) => r.id === curId);
  const confirm = rows.find((r) => r.id === confirmId);

  useEffect(() => { if (curId && !rows.some((r) => r.id === curId)) setCurId(null); }, [rows, curId]);
  useEffect(() => {
    if (curId) listRef.current?.querySelector(`[data-row="${CSS.escape(curId)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [curId]);

  const add = async () => {
    const res = await onAdd(draft);
    if (!res.ok) { setAddError(res.message); return; }
    setDraft(''); setAddError('');
  };
  const startEdit = (r: ListRow) => { setCurId(r.id); setEditId(r.id); setEditText(r.name); setEditError(''); };
  const commitEdit = async () => {
    if (!editId) return;
    const c = rows.find((r) => r.id === editId);
    if (c && editText.trim() === c.name) { setEditId(null); return; }
    const res = await onRename(editId, editText);
    if (!res.ok) { setEditError(res.message); return; }
    setEditId(null); setEditError('');
  };
  const askDelete = (r: ListRow) => { setConfirmId(r.id); setDeleteError(''); };
  const doDelete = async () => {
    if (!confirmId) return;
    const res = await onDelete(confirmId);
    if (!res.ok) { setDeleteError(res.message); return; }
    if (confirmId === selectedId) onSelect(null);
    setConfirmId(null);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (editId) return;
    const target = cur ?? rows.find((r) => r.id === selectedId) ?? null;
    const i = rows.findIndex((r) => r.id === target?.id);
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); if (target) void onMove(target.id, e.key === 'ArrowUp' ? -1 : 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCurId(rows[Math.min(rows.length - 1, i + 1)]?.id ?? null); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCurId(rows[Math.max(0, i - 1)]?.id ?? null); }
    else if (e.key === 'Home') { e.preventDefault(); setCurId(rows[0]?.id ?? null); }
    else if (e.key === 'End') { e.preventDefault(); setCurId(rows[rows.length - 1]?.id ?? null); }
    else if (e.key === 'Enter' && target) { e.preventDefault(); onSelect(target.id === selectedId ? null : target.id); }
    else if (e.key === 'F2' && target) { e.preventDefault(); startEdit(target); }
    else if (e.key === 'Delete' && target) { e.preventDefault(); askDelete(target); }
  };

  return (
    <section className="flex min-h-0 flex-1 basis-0 flex-col border-b border-line last:border-b-0">
      <header className="flex shrink-0 items-start gap-2 px-3 pb-2 pt-2">
        <div className="flex h-7 shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <span className="text-primary">{icon}</span>
          {title}
          <span className="rounded-full bg-surface-3 px-1.5 text-[11px] font-medium normal-case tracking-normal text-muted num">{rows.length}</span>
        </div>
        <div className="min-w-0 flex-1">
          <Input
            size="sm" placeholder={`Add ${noun}`} value={draft} error={addError || undefined}
            onChange={(e) => { setDraft(e.target.value); setAddError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }}
          />
        </div>
        <IconButton label={`Add ${noun}`} size="sm" disabled={!draft.trim()} onClick={() => void add()} className="mt-0 border border-line-strong"><Plus size={14} /></IconButton>
      </header>

      <div
        ref={listRef} tabIndex={0} onKeyDown={onKey} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} role="listbox" aria-label={title}
        className="min-h-0 flex-1 overflow-auto border-t border-line/70 outline-none"
      >
        {rows.length === 0 && <EmptyState title={`No ${noun} yet`} hint={`Add your first ${noun} above.`} />}
        {rows.map((r) => {
          const active = r.id === selectedId;
          const editing = r.id === editId;
          const isCur = focused && (r.id === curId || (!curId && active));
          return (
            <div
              key={r.id} data-row={r.id} role="option" aria-selected={active}
              onClick={() => { setCurId(r.id); onSelect(active ? null : r.id); }} onDoubleClick={() => startEdit(r)}
              className={cn(
                'group relative flex h-8 cursor-default items-center gap-2 border-b border-line/60 pl-3 pr-3 text-sm',
                active ? 'bg-primary-soft' : 'hover:bg-surface-2', isCur && 'ring-1 ring-inset ring-primary/60',
              )}
            >
              {active && <span className="absolute inset-y-1 left-0 w-[3px] rounded-r bg-primary" />}
              {editing ? (
                <div className="flex-1" onClick={(e) => e.stopPropagation()}>
                  <Input
                    size="sm" autoFocus value={editText} error={editError || undefined}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => { setEditText(e.target.value); setEditError(''); }}
                    onBlur={() => { if (!editError) void commitEdit(); }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') { e.preventDefault(); void commitEdit(); }
                      else if (e.key === 'Escape') { setEditId(null); setEditError(''); }
                    }}
                  />
                </div>
              ) : (
                <>
                  <span className={cn('min-w-0 flex-1 truncate', active ? 'font-semibold text-primary' : 'font-medium text-ink')}>{r.name}</span>
                  <span className="relative flex shrink-0 items-center justify-end">
                    <span className={cn('flex w-[52px] flex-col items-end gap-0.5', (active || isCur) ? '' : 'group-hover:invisible')}>
                      <span className={cn('text-xs font-medium num', active ? 'text-primary' : 'text-muted')}>{r.items}</span>
                      <span className="h-[3px] w-full overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-primary/60" style={{ width: `${(r.items / maxItems) * 100}%` }} /></span>
                    </span>
                  </span>
                  <span className={cn('absolute right-2 top-1/2 flex -translate-y-1/2 items-center rounded-control bg-surface shadow-sm ring-1 ring-line', 'invisible group-hover:visible')}>
                    <IconButton label="Rename" kbd="F2" size="sm" onClick={(e) => { e.stopPropagation(); startEdit(r); }}><Pencil size={13} /></IconButton>
                    <IconButton label="Move up" kbd="Alt+Up" size="sm" disabled={rows[0]?.id === r.id} onClick={(e) => { e.stopPropagation(); void onMove(r.id, -1); }}><ArrowUp size={13} /></IconButton>
                    <IconButton label="Move down" kbd="Alt+Down" size="sm" disabled={rows[rows.length - 1]?.id === r.id} onClick={(e) => { e.stopPropagation(); void onMove(r.id, 1); }}><ArrowDown size={13} /></IconButton>
                    <IconButton label="Delete" kbd="Del" size="sm" onClick={(e) => { e.stopPropagation(); askDelete(r); }}><Trash2 size={13} /></IconButton>
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
      <Dialog
        open={!!confirm} onOpenChange={(o) => !o && setConfirmId(null)} title={`Delete ${noun}?`} size="sm"
        footer={<><Button onClick={() => setConfirmId(null)} kbd="Esc">Keep</Button><Button variant="danger" onClick={() => void doDelete()}>Delete {noun}</Button></>}
      >
        <p className="text-sm text-ink">
          Delete <span className="font-semibold">{confirm?.name}</span>? This cannot be undone.
        </p>
        {deleteError && <div className="mt-3 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{deleteError}</div>}
      </Dialog>
    </section>
  );
}
