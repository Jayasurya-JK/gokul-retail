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
    <section className="flex min-h-0 flex-1 basis-0 flex-col border-b border-line-strong last:border-b-0">
      <header className="shrink-0 border-b border-forest-200 bg-forest-100/70 px-3 pb-2.5 pt-2.5">
        <div className="flex h-7 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control bg-primary text-primary-fg">{icon}</span>
          <div className="text-base font-semibold text-ink">{title}</div>
          <span className="rounded-full bg-surface px-2 py-px text-xs font-semibold text-primary ring-1 ring-forest-200 num">{rows.length}</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <Input
              size="sm" placeholder={`Add ${noun}`} value={draft} error={addError || undefined}
              onChange={(e) => { setDraft(e.target.value); setAddError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }}
            />
          </div>
          <IconButton label={`Add ${noun}`} size="sm" disabled={!draft.trim()} onClick={() => void add()} className="border border-line-strong bg-surface"><Plus size={14} /></IconButton>
        </div>
      </header>

      <div
        ref={listRef} tabIndex={0} onKeyDown={onKey} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} role="listbox" aria-label={title}
        className="min-h-0 flex-1 overflow-auto bg-forest-50 py-1 outline-none"
      >
        {rows.length === 0 && <EmptyState title={`No ${noun} yet`} hint={`Add your first ${noun} above.`} />}
        {rows.map((r) => {
          const active = r.id === selectedId;
          const editing = r.id === editId;
          const isCur = focused && (r.id === curId || (!curId && active));
          // On the solid green selected row the action icons turn white (the `!` forces the token colour over IconButton's default).
          const onSel = active ? '!text-primary-fg hover:!bg-primary-fg/20 hover:!text-primary-fg' : undefined;
          return (
            <div
              key={r.id} data-row={r.id} role="option" aria-selected={active}
              onClick={() => { setCurId(r.id); onSelect(active ? null : r.id); }} onDoubleClick={() => startEdit(r)}
              className={cn(
                'group relative mx-1 flex h-9 cursor-default items-center gap-2 rounded-control pl-3 pr-2 text-base',
                active ? 'bg-primary font-semibold text-primary-fg' : 'text-ink hover:bg-forest-100',
                isCur && (active ? 'ring-2 ring-inset ring-primary-fg' : 'ring-2 ring-inset ring-primary/70'),
              )}
            >
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
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className="flex shrink-0 items-center justify-end">
                    <span className={cn(
                      'min-w-[32px] rounded-full px-2 py-0.5 text-center text-xs font-semibold num',
                      active ? 'bg-primary-fg/20 text-primary-fg' : 'bg-surface-3 text-muted',
                      isCur ? 'invisible' : 'group-hover:invisible',
                    )}>{r.items}</span>
                  </span>
                  <span className={cn(
                    'absolute right-2 top-1/2 flex -translate-y-1/2 items-center rounded-control shadow-sm',
                    active ? 'bg-forest-700 ring-1 ring-primary-fg/30' : 'bg-surface ring-1 ring-line',
                    isCur ? 'visible' : 'invisible group-hover:visible',
                  )}>
                    <IconButton label="Rename" kbd="F2" size="sm" className={onSel} onClick={(e) => { e.stopPropagation(); startEdit(r); }}><Pencil size={13} /></IconButton>
                    <IconButton label="Move up" kbd="Alt+Up" size="sm" className={onSel} disabled={rows[0]?.id === r.id} onClick={(e) => { e.stopPropagation(); void onMove(r.id, -1); }}><ArrowUp size={13} /></IconButton>
                    <IconButton label="Move down" kbd="Alt+Down" size="sm" className={onSel} disabled={rows[rows.length - 1]?.id === r.id} onClick={(e) => { e.stopPropagation(); void onMove(r.id, 1); }}><ArrowDown size={13} /></IconButton>
                    <IconButton label="Delete" kbd="Del" size="sm" className={onSel} onClick={(e) => { e.stopPropagation(); askDelete(r); }}><Trash2 size={13} /></IconButton>
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
