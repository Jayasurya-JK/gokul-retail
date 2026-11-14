import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PosStatusContext, ToastProvider, TooltipProvider, WindowControlsProvider, useDesktopGuards } from '@gokul/ui';
import { windowController } from '@gokul/data';
import { useSession } from './store';
import { Login } from './pages/Login';
import { Billing } from './pages/Billing';
import { DayOpen } from './pages/DayOpen';
import { Sales } from './pages/Sales';
import { Customers } from './pages/Customers';
import { Returns } from './pages/Returns';
import { Expenses } from './pages/Expenses';
import { DayClose } from './pages/DayClose';
import { Lock } from './pages/Lock';
import { ScanRouter } from './scanner';
import { PaymodeReportPage, SalesReportPage, StaffReportPage, StockPage } from './pages/Reports';
import { StatusBar } from './components/StatusBar';

function Guard({ children }: { children: JSX.Element }) {
  const user = useSession((s) => s.user);
  return user ? children : <Navigate to="/login" replace />;
}

export function App() {
  useDesktopGuards();
  return (
    <WindowControlsProvider controller={windowController}>
    <TooltipProvider>
      <ToastProvider>
        <PosStatusContext.Provider value={<StatusBar />}>
        <HashRouter>
          <ScanRouter />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/billing" element={<Guard><Billing slot="pos" /></Guard>} />
            <Route path="/pos1" element={<Guard><Billing slot="pos1" /></Guard>} />
            <Route path="/reports/sales" element={<Guard><SalesReportPage /></Guard>} />
            <Route path="/reports/paymode" element={<Guard><PaymodeReportPage /></Guard>} />
            <Route path="/reports/stock" element={<Guard><StockPage /></Guard>} />
            <Route path="/reports/staff" element={<Guard><StaffReportPage /></Guard>} />
            <Route path="/day-open" element={<Guard><DayOpen /></Guard>} />
            <Route path="/sales" element={<Guard><Sales /></Guard>} />
            <Route path="/customers" element={<Guard><Customers /></Guard>} />
            <Route path="/history" element={<Navigate to="/sales" replace />} />
            <Route path="/returns" element={<Guard><Returns /></Guard>} />
            <Route path="/cash" element={<Guard><Expenses /></Guard>} />
            <Route path="/day-close" element={<Guard><DayClose /></Guard>} />
            <Route path="/lock" element={<Guard><Lock /></Guard>} />
            <Route path="*" element={<Navigate to="/billing" replace />} />
          </Routes>
        </HashRouter>
        </PosStatusContext.Provider>
      </ToastProvider>
    </TooltipProvider>
    </WindowControlsProvider>
  );
}
