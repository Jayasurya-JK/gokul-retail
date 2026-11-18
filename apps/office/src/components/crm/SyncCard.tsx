import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CloudUpload, RefreshCw } from 'lucide-react';
import type { SyncStatus } from '@gokul/data';
import { Button, Card, Input, StatusDot, Switch, cn, useToast } from '@gokul/ui';
import { api } from '../../store';
import { fmtDateTime, fmtTime } from './common';

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line/70 py-2.5 last:border-b-0">
      <div className="min-w-0"><div className="text-sm font-medium text-ink">{title}</div>{hint && <div className="text-xs text-muted">{hint}</div>}</div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const sameDay = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The plain-words status line: "Last synced 10:42 · 0 waiting", or "Error: ... · 12 waiting". */
export function syncStatusLine(s: SyncStatus): { tone: 'success' | 'warning' | 'danger' | 'neutral'; text: string } {
  const waiting = `${s.pending.toLocaleString('en-IN')} ${s.pending === 1 ? 'change' : 'changes'} waiting`;
  if (!s.enabled) return { tone: 'neutral', text: `Off · ${waiting}` };
  if (s.lastError) return { tone: 'danger', text: `Error: ${s.lastError} · ${waiting}` };
  if (s.lastOkAt) {
    const when = sameDay(s.lastOkAt) ? fmtTime(s.lastOkAt) : fmtDateTime(s.lastOkAt);
    return { tone: s.pending === 0 ? 'success' : 'warning', text: `Last synced ${when} · ${waiting}` };
  }
  return { tone: 'warning', text: `Not synced yet · ${waiting}` };
}

/** Office > Settings > Backup: the cloud copy. Owner and admin only (the server checks it too). */
export function SyncCard() {
  const toast = useToast();
  const [st, setSt] = useState<SyncStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState<'save' | 'now' | 'all' | null>(null);

  const load = useCallback(async () => {
    const s = await api.syncStatus();
    setSt(s);
    setEnabled(s.enabled);
    setUrl(s.url);
  }, []);

  useEffect(() => { void load(); }, [load]);
  // The waiting count moves while the shop bills, so refresh the status line while this card is open.
  useEffect(() => {
    const t = window.setInterval(() => { api.syncStatus().then(setSt).catch(() => undefined); }, 5000);
    return () => window.clearInterval(t);
  }, []);

  const save = async () => {
    setBusy('save');
    try {
      const s = await api.syncSetConfig({ enabled, url, secret });
      setSt(s);
      setSecret('');
      toast.show({ tone: 'success', title: enabled ? 'Cloud sync is on' : 'Cloud sync is off', detail: enabled ? 'Changes are sent in the background every minute.' : 'Changes wait on this PC until sync is turned on.' });
    } catch (e) {
      toast.show({ tone: 'error', title: 'Sync settings not saved', detail: errText(e) });
    } finally { setBusy(null); }
  };

  const run = async (kind: 'now' | 'all') => {
    setBusy(kind);
    try {
      const s = kind === 'now' ? await api.syncNow() : await api.syncUploadEverything();
      setSt(s);
      toast.show({ tone: 'info', title: kind === 'now' ? 'Sync started' : 'Upload started', detail: 'Status updates here as it runs.' });
    } catch (e) {
      toast.show({ tone: 'error', title: 'Could not start', detail: errText(e) });
    } finally { setBusy(null); }
  };

  if (!st) return <Card title="Cloud backup & sync"><p className="text-sm text-muted">Loading…</p></Card>;
  const line = syncStatusLine(st);
  const canRun = st.enabled && busy === null;

  return (
    <Card
      title="Cloud backup & sync"
      className="col-span-2"
      actions={<span className="text-xs text-subtle">Runs in the background</span>}
    >
      <div className="grid grid-cols-2 gap-6">
        <div className="flex flex-col">
          <Row title="Send changes to the cloud" hint="Bills, stock, items and customers. Billing never waits for it.">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </Row>
          <div className="mt-3 flex flex-col gap-3">
            <Input label="Cloud address" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…supabase.co/functions/v1/sync" className="num" />
            <Input
              label="Sync secret" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)}
              placeholder={st.hasSecret ? 'Saved. Type a new one to replace it' : 'Paste the sync secret'}
              hint={st.hasSecret ? 'Saved on this PC. It is never shown again.' : 'Kept on this PC only. Ask the person who set up the cloud copy.'}
            />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button variant="primary" onClick={save} disabled={busy !== null}>{busy === 'save' ? 'Saving…' : 'Save connection'}</Button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className={cn('flex items-start gap-3 rounded-card px-3 py-3', line.tone === 'danger' ? 'bg-danger-soft' : line.tone === 'success' ? 'bg-success-soft' : 'bg-surface-3')}>
            <CloudUpload size={20} className={cn('mt-0.5 shrink-0', line.tone === 'danger' ? 'text-danger' : line.tone === 'success' ? 'text-success' : 'text-muted')} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <StatusDot tone={line.tone === 'neutral' ? 'neutral' : line.tone} />
                {st.enabled ? 'Cloud sync on' : 'Cloud sync off'}
              </div>
              <div className="mt-0.5 text-sm text-muted break-words">{line.text}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={<RefreshCw size={14} />} onClick={() => run('now')} disabled={!canRun}>{busy === 'now' ? 'Starting…' : 'Sync now'}</Button>
            <Button onClick={() => run('all')} disabled={!canRun} title="Queues every record in the shop, for the first upload or after a new cloud copy.">
              {busy === 'all' ? 'Starting…' : 'Upload everything'}
            </Button>
          </div>
          {!st.enabled && <p className="text-xs text-subtle">Turn sync on and save to enable these buttons.</p>}
        </div>
      </div>
    </Card>
  );
}
