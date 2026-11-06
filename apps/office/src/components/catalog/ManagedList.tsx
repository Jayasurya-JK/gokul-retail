import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import type { NameResult } from '@gokul/data';
import { Button, Dialog, EmptyState, IconButton, Input, Kbd, cn } from '@gokul/ui';

export interface ListRow { id: string; name: string; items: number }

/** A list with inline add, rename, reorder and delete. Used for both categories and brands. */
export function ManagedList({ title, noun, icon, rows, onAdd, onRename, onDelete, onMove }: {
  title: string; noun: string; icon: ReactNode; rows: ListRow[];
  onAdd: (name: string) => Promise<NameResult>;
  onRename: (id: string, name: string) => Promise<NameResult>;
  onDelete: (id: string) => Promise<NameResult>;
  onMove: (id: string, delta: -1 | 1) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [addError, setAddError] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editError, setEditError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const addRef = useRef<HTMLInputElement>(null);
  const total = rows.reduce((s, r) => s + r.items, 0);
  const maxItems = Math.max(1, ...rows.map((r) => r.items));
  const sel = rows.find((r) => r.id === selId);
  const confirm = rows.find((r) => r.id === confirmId);

  useEffect(() => { if (!selId && rows.length) setSelId(rows[0].id); }, [rows, selId]);

  const add = async () => {
    const res = await onAdd(draft);
    if (!res.ok) { setAddError(res.message); return; }
    setDraft(''); setAddError('');
  };
  const startEdit = (r: ListRow) => { setEditId(r.id); setEditText(r.name); setEditError(''); };
  const commitEdit = async () => {
    if (!editId) return;
    const cur = rows.find((r) => r.id === editId);
    if (cur && editText.trim() === cur.name) { setEditId(null); return; }
    const res = await onRename(editId, editText);
    if (!res.ok) { setEditError(res.message); return; }
    setEditId(null); setEditError('');
  };
  const askDelete = (r: ListRow) => { setConfirmId(r.id); setDeleteError(''); };
  const doDelete = async () => {
    if (!confirmId) return;
    const res = await onDelete(confirmId);
    if (!res.ok) { setDeleteError(res.message); return; }
    setConfirmId(null);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (editId) return;
    const i = rows.findIndex((r) => r.id === selId);
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); if (selId) void onMove(selId, e.key === 'ArrowUp' ? -1 : 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSelId(rows[Math.min(rows.length - 1, i + 1)]?.id ?? null); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelId(rows[Math.max(0, i - 1)]?.id ?? null); }
    else if ((e.key === 'F2' || e.key === 'Enter') && sel) { e.preventDefault(); startEdit(sel); }
    else if (e.key === 'Delete' && sel) { e.preventDefault(); askDelete(sel); }
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-col rounded-card border border-line bg-surface">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary-soft text-primary">{icon}</span>
          {title}
          <span className="rounded-full bg-surface-3 px-1.5 text-[11px] font-medium text-muted">{rows.length}</span>
        </div>
        <span className="text-xs text-subtle num">{total} items</span>
      </header>

      <div className="shrink-0 border-b border-line bg-surface-2 p-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              ref={addRef} icon={<Plus size={15} />} placeholder={`Add a ${noun} and press Enter`} value={draft} error={addError || undefined}
              onChange={(e) => { setDraft(e.target.value); setAddError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }}
            />
          </div>
          <Button variant="primary" onClick={() => void add()} disabled={!draft.trim()}>Add</Button>
        </div>
      </div>

      <div tabIndex={0} onKeyDown={onKey} className="min-h-0 flex-1 overflow-auto outline-none">
        {rows.length === 0 && <EmptyState title={`No ${noun} yet`} hint={`Add your first ${noun} above.`} />}
        <ul>
          {rows.map((r, i) => {
            const active = r.id === selId;
            const editing = r.id === editId;
            return (
              <li
                key={r.id} onClick={() => setSelId(r.id)} onDoubleClick={() => startEdit(r)}
                className={cn('group relative flex h-10 items-center gap-3 border-b border-line/70 px-4 text-sm', active ? 'bg-primary-soft' : 'hover:bg-surface-2')}
              >
                <span className="w-5 shrink-0 text-right text-xs text-subtle num">{i + 1}</span>
                {editing ? (
                  <div className="flex-1">
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
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{r.name}</span>
                )}
                {!editing && (
                  <>
                    <span className={cn('flex items-center gap-1', active ? 'visible' : 'invisible group-hover:visible')}>
                      <IconButton label="Rename" kbd="F2" size="sm" onClick={(e) => { e.stopPropagation(); startEdit(r); }}><Pencil size={14} /></IconButton>
                      <IconButton label="Move up" kbd="Alt+Up" size="sm" disabled={i === 0} onClick={(e) => { e.stopPropagation(); void onMove(r.id, -1); }}><ArrowUp size={14} /></IconButton>
                      <IconButton label="Move down" kbd="Alt+Down" size="sm" disabled={i === rows.length - 1} onClick={(e) => { e.stopPropagation(); void onMove(r.id, 1); }}><ArrowDown size={14} /></IconButton>
                      <IconButton label="Delete" kbd="Del" size="sm" onClick={(e) => { e.stopPropagation(); askDelete(r); }}><Trash2 size={14} /></IconButton>
                    </span>
                    <div className="flex w-[92px] shrink-0 flex-col items-end gap-0.5">
                      <span className="text-xs font-medium text-muted num">{r.items} {r.items === 1 ? 'item' : 'items'}</span>
                      <span className="h-1 w-full overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-primary/60" style={{ width: `${(r.items / maxItems) * 100}%` }} /></span>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-line bg-surface-2 px-4 text-xs text-muted">
        <span className="flex items-center gap-1"><Kbd>F2</Kbd> rename</span>
        <span className="flex items-center gap-1"><Kbd>Alt</Kbd><Kbd>Up</Kbd> reorder</span>
        <span className="flex items-center gap-1"><Kbd>Del</Kbd> delete</span>
      </footer>

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
