import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, ShieldCheck } from 'lucide-react';
import type { Role, RoleDef, UserAccount, UserInput } from '@gokul/data';
import { Badge, Button, DataTable, Dialog, Drawer, EmptyState, IconButton, Input, PageHeader, Select, Switch, Tabs, TabPanel, useToast, type ColumnDef, type Tone, useRefreshOnFocus } from '@gokul/ui';
import { api, useSession } from '../store';
import { RolesMatrix } from '../components/crm/RolesMatrix';
import { SaveBar } from '../components/crm/SaveBar';
import { Avatar, ago } from '../components/crm/common';

const roleTone: Record<Role, Tone> = { owner: 'primary', admin: 'primary', manager: 'info', staff: 'info', cashier: 'neutral' };
const roleName: Record<Role, string> = { owner: 'Owner', admin: 'Admin', manager: 'Manager', staff: 'Staff', cashier: 'Cashier' };

interface UserDraft { name: string; role: Role; phone: string; pin: string; active: boolean }

function UserSheet({ open, user, roles, onClose, onSave }: {
  open: boolean; user: UserAccount | null; roles: RoleDef[]; onClose: () => void; onSave: (i: UserInput) => Promise<void>;
}) {
  const [d, setD] = useState<UserDraft>({ name: '', role: 'cashier', phone: '', pin: '', active: true });
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) { setD(user ? { name: user.name, role: user.role, phone: user.phone, pin: '', active: user.active } : { name: '', role: 'cashier', phone: '', pin: '', active: true }); setTouched(false); }
  }, [open, user]);
  const e: Partial<Record<keyof UserDraft, string>> = {};
  if (!d.name.trim()) e.name = 'Enter the staff name';
  if (!user && !/^\d{4}$/.test(d.pin)) e.pin = 'PIN must be 4 digits';
  if (user && d.pin && !/^\d{4}$/.test(d.pin)) e.pin = 'PIN must be 4 digits';
  const role = roles.find((r) => r.id === d.role);
  const submit = async () => {
    setTouched(true);
    if (Object.keys(e).length) return;
    await onSave({ id: user?.id, name: d.name, role: d.role, phone: d.phone, active: d.active, pin: d.pin || undefined });
  };
  return (
    <Drawer
      open={open} onOpenChange={(o) => !o && onClose()} width={420} title={user ? 'Edit user' : 'New user'}
      description={user ? user.name : 'Staff sign in at the counter with a 4 digit PIN.'}
      footer={<><Button variant="ghost" onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" onClick={submit} kbd="Ctrl+S">Save user</Button></>}
    >
      <div className="flex flex-col gap-4" onKeyDown={(ev) => { if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); void submit(); } }}>
        <Input label="Full name" value={d.name} onChange={(ev) => setD({ ...d, name: ev.target.value })} error={touched ? e.name : undefined} data-autofocus autoFocus />
        <div>
          <Select
            label="Role" value={d.role} onChange={(ev) => setD({ ...d, role: ev.target.value as Role })}
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
          />
          {role && <p className="mt-1.5 text-xs text-muted">{role.description} {role.id !== 'owner' && role.id !== 'admin' && `Discount up to ${role.discountLimitPct}% without a PIN.`}</p>}
        </div>
        <Input label="Phone (optional)" value={d.phone} onChange={(ev) => setD({ ...d, phone: ev.target.value.replace(/[^\d ]/g, '').slice(0, 11) })} className="num" />
        <Input
          label={user ? 'New PIN' : 'PIN'} value={d.pin} inputMode="numeric" type="password" autoComplete="new-password"
          onChange={(ev) => setD({ ...d, pin: ev.target.value.replace(/\D/g, '').slice(0, 4) })} error={touched ? e.pin : undefined}
          hint={user ? 'Leave blank to keep the current PIN.' : 'Share it with the staff member in person. Use Reset PIN later if it is forgotten.'} className="num tracking-[0.4em]"
        />
        <div className="flex items-center justify-between rounded-card border border-line bg-surface-2 px-3 py-2.5">
          <div><div className="text-sm font-medium text-ink">Active</div><div className="text-xs text-muted">Inactive users cannot sign in. Their old bills stay.</div></div>
          <Switch checked={d.active} onCheckedChange={(v) => setD({ ...d, active: v })} />
        </div>
      </div>
    </Drawer>
  );
}

export function Users() {
  const toast = useToast();
  const me = useSession((s) => s.user);
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [saved, setSaved] = useState<RoleDef[]>([]);
  const [draft, setDraft] = useState<RoleDef[]>([]);
  const [sheet, setSheet] = useState<{ open: boolean; user: UserAccount | null }>({ open: false, user: null });
  const [reset, setReset] = useState<{ user: UserAccount; pin: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [u, r] = await Promise.all([api.listUserAccounts(), api.listRoles()]);
    setUsers(u); setSaved(r); setDraft(r);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useRefreshOnFocus(() => { void load(); });

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);
  const refreshUsers = async () => setUsers(await api.listUserAccounts());

  const saveRoles = useCallback(async () => {
    setBusy(true);
    try {
      const next = await api.saveRoles(draft);
      setSaved(next); setDraft(next);
      toast.show({ tone: 'success', title: 'Roles saved', detail: 'New limits apply from the next bill at every counter.' });
    } finally { setBusy(false); }
  }, [draft, toast]);

  const columns: ColumnDef<UserAccount>[] = useMemo(() => [
    {
      id: 'name', header: 'User', meta: { w: 'minmax(180px,1.2fr)' }, accessorFn: (r) => r.name,
      cell: (c) => {
        const r = c.row.original;
        return (
          <span className="flex items-center gap-2.5">
            <Avatar initials={r.initials} color={r.color} size={28} />
            <span className={r.active ? 'font-medium text-ink' : 'font-medium text-subtle'}>{r.name}{r.id === me?.id && <span className="ml-1.5 text-xs font-normal text-subtle">(you)</span>}</span>
          </span>
        );
      },
    },
    { id: 'role', header: 'Role', meta: { w: '100px' }, accessorFn: (r) => r.role, cell: (c) => <Badge tone={roleTone[c.row.original.role]}>{roleName[c.row.original.role]}</Badge> },
    { accessorKey: 'phone', header: 'Phone', meta: { w: '120px', num: true }, cell: (c) => c.getValue<string>() || <span className="text-subtle">-</span> },
    { accessorKey: 'lastLogin', header: 'Last sign-in', meta: { w: '140px' }, cell: (c) => <span className="text-muted">{c.getValue<string>()}</span> },
    { accessorKey: 'bills30d', header: 'Bills (30 d)', meta: { w: '100px', align: 'right', num: true } },
    { id: 'pin', header: 'PIN changed', meta: { w: '120px' }, accessorFn: (r) => r.pinChangedAt, cell: (c) => <span className="text-muted">{ago(c.getValue<string>())}</span> },
    {
      id: 'active', header: 'Active', meta: { w: '72px', align: 'center' }, accessorFn: (r) => r.active,
      cell: (c) => {
        const r = c.row.original;
        return (
          <span onClick={(e) => e.stopPropagation()} className={r.role === 'owner' ? 'pointer-events-none opacity-50' : ''}>
            <Switch
              checked={r.active}
              onCheckedChange={async (v) => {
                await api.saveUserAccount({ id: r.id, name: r.name, role: r.role, phone: r.phone, active: v });
                await refreshUsers();
                toast.show({ tone: v ? 'success' : 'info', title: v ? `${r.name} is active` : `${r.name} cannot sign in now` });
              }}
            />
          </span>
        );
      },
    },
    {
      id: 'actions', header: '', meta: { w: '150px', align: 'right' },
      cell: (c) => {
        const r = c.row.original;
        return (
          <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" icon={<KeyRound size={13} />} onClick={() => setReset({ user: r, pin: null })}>Reset PIN</Button>
            <IconButton size="sm" label="Edit user" onClick={() => setSheet({ open: true, user: r })}><Pencil size={14} /></IconButton>
          </span>
        );
      },
    },
  ], [me?.id, toast]);

  return (
    <>
      <PageHeader
        title="Users and roles" subtitle={`${users.filter((u) => u.active).length} active users · 3 roles`} icon={<ShieldCheck size={17} />}
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => { setTab('users'); setSheet({ open: true, user: null }); }}>New user</Button>}
      />
      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1" tabs={[{ value: 'users', label: 'Users', count: users.length }, { value: 'roles', label: 'Roles and permissions' }]}>
        <TabPanel value="users" className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden">
          <DataTable
            data={users} columns={columns} getRowId={(r) => r.id} rowHeight={48} onActivate={(r) => setSheet({ open: true, user: r })}
            empty={<EmptyState title="No users yet" />}
            footer={<><span>{users.length} users</span><span>Enter edits the selected user</span></>}
          />
        </TabPanel>
        <TabPanel value="roles" className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden">
          <div className="min-h-0 flex-1 overflow-auto bg-surface"><RolesMatrix roles={draft} onChange={setDraft} /></div>
          <SaveBar dirty={dirty} busy={busy} onSave={saveRoles} onDiscard={() => setDraft(saved)} message="Role changes are not saved yet" />
        </TabPanel>
      </Tabs>

      <UserSheet
        open={sheet.open} user={sheet.user} roles={saved} onClose={() => setSheet({ open: false, user: null })}
        onSave={async (i) => {
          const u = await api.saveUserAccount(i);
          setSheet({ open: false, user: null });
          await refreshUsers();
          toast.show({ tone: 'success', title: i.id ? 'User updated' : 'User added', detail: u.name });
        }}
      />

      <Dialog
        open={!!reset} onOpenChange={(o) => !o && setReset(null)} size="sm"
        title={reset?.pin ? 'New PIN created' : 'Reset PIN'}
        description={reset?.user.name}
        footer={reset?.pin ? <Button variant="primary" onClick={() => setReset(null)} kbd="Enter">Done</Button> : (
          <>
            <Button variant="ghost" onClick={() => setReset(null)} kbd="Esc">Cancel</Button>
            <Button variant="primary" data-autofocus onClick={async () => { const r = await api.resetUserPin(reset!.user.id); setReset({ user: reset!.user, pin: r.pin }); await refreshUsers(); }}>Create new PIN</Button>
          </>
        )}
      >
        {reset?.pin ? (
          <div className="text-center">
            <div className="text-sm text-muted">Tell {reset.user.name.split(' ')[0]} this PIN in person. It is shown only once.</div>
            <div className="mt-3 rounded-card bg-surface-2 py-4 text-3xl font-semibold tracking-[0.5em] text-ink num selectable">{reset.pin}</div>
          </div>
        ) : (
          <p className="text-sm text-muted">The old PIN stops working straight away. A new 4 digit PIN will be created and shown here once.</p>
        )}
      </Dialog>
    </>
  );
}
