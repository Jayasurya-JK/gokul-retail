import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider, TooltipProvider, useDesktopGuards } from '@gokul/ui';
import { useSession } from './store';
import { Login } from './pages/Login';
import { Billing } from './pages/Billing';
import { DayOpen } from './pages/DayOpen';
import { History } from './pages/History';
import { Returns } from './pages/Returns';
import { CashInOut } from './pages/CashInOut';
import { DayClose } from './pages/DayClose';
import { Lock } from './pages/Lock';

function Guard({ children }: { children: JSX.Element }) {
  const user = useSession((s) => s.user);
  return user ? children : <Navigate to="/login" replace />;
}

export function App() {
  useDesktopGuards();
  return (
    <TooltipProvider>
      <ToastProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/billing" element={<Guard><Billing /></Guard>} />
            <Route path="/day-open" element={<Guard><DayOpen /></Guard>} />
            <Route path="/history" element={<Guard><History /></Guard>} />
            <Route path="/returns" element={<Guard><Returns /></Guard>} />
            <Route path="/cash" element={<Guard><CashInOut /></Guard>} />
            <Route path="/day-close" element={<Guard><DayClose /></Guard>} />
            <Route path="/lock" element={<Guard><Lock /></Guard>} />
            <Route path="*" element={<Navigate to="/billing" replace />} />
          </Routes>
        </HashRouter>
      </ToastProvider>
    </TooltipProvider>
  );
}
