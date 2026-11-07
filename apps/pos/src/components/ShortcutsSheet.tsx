import { useLocation } from 'react-router-dom';
import { Dialog, Kbd, Switch, useKeyBar } from '@gokul/ui';
import { useCurrentScreenKeys } from './screenKeys';

const GROUPS: { title: string; rows: [string, string[]][] }[] = [
  {
    title: 'Go to',
    rows: [
      ['Point of Sale', ['Alt+1']], ['POS1 (second bill)', ['Alt+2']], ['POS2 (third bill)', ['Alt+3']], ['Bills (reprint, cancel)', ['Alt+4']],
      ['Sales Report', ['Alt+5']], ['Paymode Report', ['Alt+6']], ['Stock', ['Alt+7']], ['Customer Profile', ['Alt+8']],
      ['Returns and exchange', ['F10']], ['Expenses and cash', ['F9']], ['Day close', ['Ctrl+E']], ['User menu', ['Alt+U']],
      ['Lock the counter', ['Ctrl+L']], ['This sheet', ['F1']], ['Back to billing (from any other screen)', ['Esc']],
    ],
  },
  {
    title: 'Adding items',
    rows: [
      ['Add scanned or typed code', ['Enter']], ['Add 5 of item 101', ['5*101']], ['Search items by name', ['Ctrl+F']],
      ['Choose customer', ['F11']], ['Move between rows', ['Up', 'Down']], ['Quantity up or down', ['+', '-']],
      ['Remove the row', ['Del']], ['Undo the removed row', ['Ctrl+Z']],
    ],
  },
  {
    title: 'Editing a row',
    rows: [
      ['Edit quantity', ['F4']], ['Line discount (amount or 5%)', ['Ctrl+D']], ['Discount on the whole bill', ['Shift+F5']],
      ['Cash discount (percent, on top)', ['Ctrl+K']], ['Wholesale prices on or off', ['Alt+W']],
      ['Next field while editing', ['Tab']], ['Clear typed code, or cancel the bill', ['Esc']],
    ],
  },
  {
    title: 'Finishing',
    rows: [
      ['Pay mode: take payment', ['F3', 'F12', 'End']], ['Home delivery', ['F2']], ['Refresh', ['F5']],
      ['Hold this bill', ['F6']], ['Bring back a held bill', ['Shift+F6']], ['Staff for this bill', ['F7']],
      ['Recent bills (reprint)', ['F8']], ['Reprint the last bill', ['Ctrl+P']],
    ],
  },
];

export function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [showBar, setShowBar] = useKeyBar();
  const { pathname } = useLocation();
  const screen = useCurrentScreenKeys();
  const onBilling = pathname === '/billing' || pathname === '/pos1' || pathname === '/pos2';
  // This screen's own keys come first, then the keys that work everywhere.
  const go = GROUPS[0];
  const groups = onBilling
    ? [...GROUPS.slice(1), go]
    : [...(screen ? [{ title: `On this screen: ${screen.title}`, rows: screen.rows }] : []), go];
  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="xl" title="Keyboard shortcuts"
      description="Everything at the counter works without the mouse."
      footer={
        <>
          <div className="mr-auto"><Switch checked={showBar} onCheckedChange={setShowBar} label="Show key bar at the bottom of the screen (for staff in training)" /></div>
          <Kbd>Esc</Kbd><span className="text-sm text-muted">to close</span>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-x-10 gap-y-6">
        {groups.map((g) => (
          <section key={g.title}>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">{g.title}</h3>
            <div>
              {g.rows.map(([label, keys]) => (
                <div key={label} className="flex items-center justify-between gap-3 border-b border-line/60 py-1.5 text-sm">
                  <span className="text-ink">{label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {keys.map((k, i) => <span key={k} className="flex items-center gap-1">{i > 0 && <span className="text-[11px] text-subtle">or</span>}<Kbd>{k}</Kbd></span>)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
