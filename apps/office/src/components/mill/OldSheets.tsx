import { Dialog, Button } from '@gokul/ui';

/** The old manual mill sheets, read-only. (Filled in by the next step.) */
export function OldSheets({ open, onClose }: { open: boolean; onClose: () => void; onMoved: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} size="lg" title="Old sheets" footer={<Button onClick={onClose} kbd="Esc">Close window</Button>}>
      <p className="text-sm text-muted">The old manual sheets will be listed here.</p>
    </Dialog>
  );
}
