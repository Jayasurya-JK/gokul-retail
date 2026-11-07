import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings } from 'lucide-react';
import type { SettingsBundle } from '@gokul/data';
import { PageHeader, Tabs, TabPanel, useToast } from '@gokul/ui';
import { api } from '../store';
import { SaveBar } from '../components/crm/SaveBar';
import { BackupTab, BillFormatTab, ExpensesTab, LoyaltyTab, MillTab, PrintersTab, SecurityTab, ShopTab, TaxTab } from '../components/crm/SettingsTabs';

type Section = keyof SettingsBundle;
const LABELS: { value: Section; label: string }[] = [
  { value: 'shop', label: 'Shop' }, { value: 'tax', label: 'Tax' }, { value: 'billFormat', label: 'Bill format' },
  { value: 'printers', label: 'Printers' }, { value: 'backup', label: 'Backup' },
  { value: 'loyalty', label: 'Loyalty' }, { value: 'expenses', label: 'Expenses' }, { value: 'mill', label: 'Mill' }, { value: 'security', label: 'Security' },
];

export function SettingsPage() {
  const toast = useToast();
  const [saved, setSaved] = useState<SettingsBundle | null>(null);
  const [draft, setDraft] = useState<SettingsBundle | null>(null);
  const [params] = useSearchParams();
  const want = params.get('tab') as Section | null;
  const [tab, setTab] = useState<Section>(want && LABELS.some((l) => l.value === want) ? want : 'shop');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.getSettingsBundle().then((b) => { setSaved(b); setDraft(b); }); }, []);

  const dirtySections = useMemo(() => {
    if (!saved || !draft) return new Set<Section>();
    const dirty = new Set(LABELS.map((l) => l.value).filter((k) => JSON.stringify(saved[k]) !== JSON.stringify(draft[k])));
    if (JSON.stringify(saved.hardware) !== JSON.stringify(draft.hardware)) dirty.add('printers');
    return dirty;
  }, [saved, draft]);

  const save = useCallback(async () => {
    if (!draft) return;
    const bad = draft.shop.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(draft.shop.gstin);
    if (bad) { setTab('shop'); toast.show({ tone: 'error', title: 'Check the GSTIN', detail: 'It must be 15 characters, like 33AAKFG4821M1ZQ.' }); return; }
    setBusy(true);
    try {
      const next = await api.saveSettingsBundle(draft);
      setSaved(next); setDraft(next);
      toast.show({ tone: 'success', title: 'Settings saved', detail: 'New bills use these settings straight away.' });
    } finally { setBusy(false); }
  }, [draft, toast]);

  if (!draft || !saved) return <PageHeader title="Settings" icon={<Settings size={17} />} />;
  const patch = <K extends Section>(k: K, v: SettingsBundle[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <>
      <PageHeader title="Settings" subtitle={draft.shop.name + ' · ' + draft.shop.city} icon={<Settings size={17} />} />
      <Tabs
        value={tab} onValueChange={(v) => setTab(v as Section)} className="min-h-0 flex-1"
        tabs={LABELS.map((l) => ({ value: l.value, label: <span className="flex items-center gap-1.5">{l.label}{dirtySections.has(l.value) && <span className="h-1.5 w-1.5 rounded-full bg-warning" title="Unsaved changes" />}</span> }))}
      >
        <div className="min-h-0 flex-1 overflow-auto bg-bg p-5">
          <TabPanel value="shop" className="outline-none"><ShopTab v={draft.shop} set={(n) => patch('shop', n)} /></TabPanel>
          <TabPanel value="tax" className="outline-none"><TaxTab v={draft.tax} set={(n) => patch('tax', n)} /></TabPanel>
          <TabPanel value="billFormat" className="outline-none"><BillFormatTab v={draft.billFormat} shop={draft.shop} set={(n) => patch('billFormat', n)} /></TabPanel>
          <TabPanel value="printers" className="outline-none"><PrintersTab v={draft.printers} hardware={draft.hardware} setHardware={(n) => patch('hardware', n)} paper={draft.billFormat.paper} set={(n) => patch('printers', n)} /></TabPanel>
          <TabPanel value="loyalty" className="outline-none"><LoyaltyTab v={draft.loyalty} set={(n) => patch('loyalty', n)} /></TabPanel>
          <TabPanel value="expenses" className="outline-none"><ExpensesTab v={draft.expenses} set={(n) => patch('expenses', n)} /></TabPanel>
          <TabPanel value="mill" className="outline-none"><MillTab v={draft.mill} set={(n) => patch('mill', n)} /></TabPanel>
          <TabPanel value="security" className="outline-none"><SecurityTab v={draft.security} set={(n) => patch('security', n)} /></TabPanel>
          <TabPanel value="backup" className="outline-none">
            <BackupTab
              v={draft.backup} set={(n) => patch('backup', n)}
              onChanged={(b) => { setSaved((s) => (s ? { ...s, backup: { ...s.backup, history: b.history } } : s)); setDraft((d) => (d ? { ...d, backup: { ...d.backup, history: b.history } } : d)); }}
            />
          </TabPanel>
        </div>
      </Tabs>
      <SaveBar dirty={dirtySections.size > 0} busy={busy} onSave={save} onDiscard={() => setDraft(saved)} message={`Unsaved changes in ${[...dirtySections].map((s) => LABELS.find((l) => l.value === s)!.label).join(', ')}`} />
    </>
  );
}
