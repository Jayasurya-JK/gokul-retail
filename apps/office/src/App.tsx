import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import { pinRuleProblem, windowController, type BackupStatus } from '@gokul/data';
import { OfficeLayout, PinChangeDialog, StatusDot, ToastProvider, TooltipProvider, WindowControlsProvider, useDesktopGuards, useToast } from '@gokul/ui';
import { nav } from './nav';
import { CloseGuardHost } from './unsaved';
import { api, useSession } from './store';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Items } from './pages/Items';
import { Categories } from './pages/Categories';
import { Labels } from './pages/Labels';
import { Stock } from './pages/Stock';
import { Purchases } from './pages/Purchases';
import { Suppliers } from './pages/Suppliers';
import { Production } from './pages/Production';
import { Insights } from './pages/Insights';
import { Sales } from './pages/Sales';
import { Customers } from './pages/Customers';
import { Collections } from './pages/Collections';
import { LoyaltyPoints } from './pages/LoyaltyPoints';
import { Reports } from './pages/Reports';
import { Users } from './pages/Users';
import { SettingsPage } from './pages/SettingsPage';
import { ItemEditor } from './pages/ItemEditor';
import { HsnHelper } from './pages/HsnHelper';
import { GstReturns } from './pages/GstReturns';
import { Expenses } from './pages/Expenses';
import { MillDailyPage } from './pages/MillDaily';

const fmtAgo = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const t = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const sameDay = d.toDateString() === new Date().toDateString();
  if (sameDay) return `today ${t}`;
  if (days <= 1 && new Date(Date.now() - 86_400_000).toDateString() === d.toDateString()) return `yesterday ${t}`;
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ${t}`;
};

/** The real last good backup (Rust reads the backup log). Amber warning when it is older than 24 hours or the last try failed. */
function BackupStatusText() {
  const loc = useLocation();
  const [st, setSt] = useState<BackupStatus | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => { api.backupStatus().then((s) => live && setSt(s)).catch(() => undefined); };
    load();
    const t = window.setInterval(load, 60_000);
    return () => { live = false; window.clearInterval(t); };
  }, [loc.pathname]);
  if (!st) return <span>Backup: checking...</span>;
  if (!st.lastAt) {
    return <span className="flex items-center gap-1.5 font-semibold text-warning" title={st.lastError ?? undefined}><TriangleAlert size={12} /> No backup yet{st.lastError ? ' - last try failed' : ''}. Open Settings, Backup.</span>;
  }
  if (st.stale || st.lastError) {
    const age = st.ageHours ?? 0;
    const ago = age >= 48 ? `${Math.floor(age / 24)} days ago` : `${Math.floor(age)} hours ago`;
    return <span className="flex items-center gap-1.5 font-semibold text-warning" title={st.lastError ?? undefined}><TriangleAlert size={12} /> Last backup {fmtAgo(st.lastAt)} ({ago}){st.lastError ? ' - the latest try failed' : ' - overdue'}</span>;
  }
  return <span>Last backup {fmtAgo(st.lastAt)}</span>;
}

function Shell() {
  const user = useSession((s) => s.user);
  const signOut = useSession((s) => s.signOut);
  const loc = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [pinOpen, setPinOpen] = useState(false);
  const [shop, setShop] = useState<{ shopName: string; counter: string } | null>(null);
  useEffect(() => { if (user) api.getSettings().then(setShop).catch(() => undefined); }, [user, loc.pathname]);
  if (!user) return <Navigate to="/login" replace />;
  return (
    <OfficeLayout
      nav={nav} activePath={loc.pathname} onNavigate={navigate}
      user={{ name: user.name, role: user.role, initials: user.initials }}
      onLogout={() => { signOut(); navigate('/login'); }}
      onChangePin={() => setPinOpen(true)}
      statusLeft={<><span className="flex items-center gap-1.5"><StatusDot tone="success" /> Database connected</span><BackupStatusText /></>}
      statusRight={<span>{shop ? `${shop.shopName} - ${shop.counter}` : ''}</span>}
    >
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/items" element={<Items />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/labels" element={<Labels />} />
        <Route path="/stock" element={<Stock />} />
        <Route path="/purchases" element={<Purchases />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/production" element={<Production />} />
        <Route path="/production-insights" element={<Insights />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/loyalty-points" element={<LoyaltyPoints />} />
        <Route path="/collections" element={<Collections />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/users" element={<Users />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/mill-daily" element={<MillDailyPage />} />
        <Route path="/mill" element={<Navigate to="/mill-daily" replace />} />
        <Route path="/items/new" element={<ItemEditor />} />
        <Route path="/items/hsn" element={<HsnHelper />} />
        <Route path="/gst" element={<GstReturns />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <PinChangeDialog
        open={pinOpen} title="Change my PIN" description={user.name} askOld rule={pinRuleProblem} onClose={() => setPinOpen(false)}
        onSubmit={async (oldPin, newPin) => {
          try { await api.changeMyPin(user.id, oldPin, newPin); } catch (e) { return e instanceof Error ? e.message : 'Could not change the PIN.'; }
          toast.show({ tone: 'success', title: 'Your PIN is changed', detail: 'Use the new PIN from the next sign-in.' });
          return null;
        }}
      />
      <CloseGuardHost />
    </OfficeLayout>
  );
}

export function App() {
  useDesktopGuards();
  return (
    <WindowControlsProvider controller={windowController}>
    <TooltipProvider>
      <ToastProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={<Shell />} />
          </Routes>
        </HashRouter>
      </ToastProvider>
    </TooltipProvider>
    </WindowControlsProvider>
  );
}
