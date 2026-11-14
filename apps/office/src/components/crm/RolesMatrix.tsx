import { Lock } from 'lucide-react';
import { managerPinActions, permissionDefs, type ManagerPinAction, type PermissionKey, type RoleDef } from '@gokul/data';
import { Badge, Checkbox, NumberInput, Switch } from '@gokul/ui';
import { cn } from '@gokul/ui';

const COLS = 'grid grid-cols-[minmax(240px,1fr)_repeat(5,128px)] items-center';

function HeaderRow({ roles }: { roles: RoleDef[] }) {
  return (
    <div className={cn(COLS, 'sticky top-0 z-[1] border-b border-line bg-surface-2 px-5 py-2.5')}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">Permission</div>
      {roles.map((r) => (
        <div key={r.id} className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">{r.name}{r.locked && <Lock size={12} className="text-subtle" />}</div>
          <div className="text-[11px] text-subtle">{r.id === 'owner' ? 'Always full access' : r.id === 'admin' ? 'Same as owner' : r.id === 'manager' ? 'Floor lead' : r.id === 'staff' ? 'Entry only' : 'Counter'}</div>
        </div>
      ))}
    </div>
  );
}

function GroupTitle({ children, hint }: { children: string; hint?: string }) {
  return (
    <div className="border-b border-line bg-surface-3/60 px-5 py-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{children}</span>
      {hint && <span className="ml-2 text-xs text-subtle">{hint}</span>}
    </div>
  );
}

function Label({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="pr-4">
      <div className="text-sm font-medium text-ink">{title}</div>
      <div className="text-xs text-muted">{hint}</div>
    </div>
  );
}

/** Permission matrix: roles as columns, permissions as rows. Owner column is locked. */
export function RolesMatrix({ roles, onChange }: { roles: RoleDef[]; onChange: (next: RoleDef[]) => void }) {
  const patch = (id: string, fn: (r: RoleDef) => RoleDef) => onChange(roles.map((r) => (r.id === id ? fn(r) : r)));
  const setPerm = (id: string, k: PermissionKey, v: boolean) => patch(id, (r) => ({ ...r, perms: { ...r.perms, [k]: v } }));
  const setPin = (id: string, k: ManagerPinAction, v: boolean) =>
    patch(id, (r) => ({ ...r, pinFor: v ? [...r.pinFor, k] : r.pinFor.filter((x) => x !== k) }));

  const groups: ('Counter' | 'Back office')[] = ['Counter', 'Back office'];
  return (
    <div className="min-w-[760px]">
      <HeaderRow roles={roles} />

      <GroupTitle hint="Highest discount a role can give on its own">Discount</GroupTitle>
      <div className={cn(COLS, 'border-b border-line/70 px-5 py-2.5')}>
        <Label title="Discount limit" hint="Percent of the bill. Above this the counter asks for a manager PIN." />
        {roles.map((r) => (
          <div key={r.id} className="flex justify-center">
            {r.locked ? <Badge tone="neutral">No limit</Badge> : (
              <div className="w-24">
                <NumberInput value={String(r.discountLimitPct)} decimals={0} size="sm" prefix="%" onValueChange={(v) => patch(r.id, (x) => ({ ...x, discountLimitPct: Math.min(100, Number(v || 0)) }))} aria-label={`${r.name} discount limit`} />
              </div>
            )}
          </div>
        ))}
      </div>

      {groups.map((g) => (
        <div key={g}>
          <GroupTitle>{g === 'Counter' ? 'At the counter' : 'In the back office'}</GroupTitle>
          {permissionDefs.filter((p) => p.group === g).map((p) => (
            <div key={p.key} className={cn(COLS, 'border-b border-line/70 px-5 py-2.5 hover:bg-surface-2')}>
              <Label title={p.label} hint={p.hint} />
              {roles.map((r) => (
                <div key={r.id} className="flex justify-center">
                  <span className={cn(r.locked && 'pointer-events-none opacity-60')}>
                    <Switch checked={r.perms[p.key]} onCheckedChange={(v) => setPerm(r.id, p.key, v)} />
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      <GroupTitle hint="Even if the role is allowed, a manager or owner must enter their PIN first">Manager PIN needed for</GroupTitle>
      {managerPinActions.map((a) => (
        <div key={a.key} className={cn(COLS, 'border-b border-line/70 px-5 py-2.5 hover:bg-surface-2')}>
          <Label title={a.label} hint={a.hint} />
          {roles.map((r) => (
            <div key={r.id} className="flex justify-center">
              {r.locked ? <span className="text-xs text-subtle">Never</span> : <Checkbox checked={r.pinFor.includes(a.key)} onCheckedChange={(v) => setPin(r.id, a.key, v)} />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
