import { useEffect, useState } from 'react';
import { Boxes, SlidersHorizontal } from 'lucide-react';
import { Button, PageHeader, Tabs } from '@gokul/ui';
import { StockLevels } from '../components/catalog/StockLevels';
import { StockAdjustments } from '../components/catalog/StockAdjustments';
import { StockTake } from '../components/catalog/StockTake';
import { AdjustmentDialog } from '../components/catalog/AdjustmentDialog';

export function Stock() {
  const [tab, setTab] = useState('levels');
  const [adjusting, setAdjusting] = useState(false);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); setAdjusting(true); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <>
      <PageHeader
        title="Stock" subtitle="Levels, adjustments and stock take" icon={<Boxes size={17} />}
        actions={<Button variant="primary" icon={<SlidersHorizontal size={15} />} onClick={() => setAdjusting(true)} kbd="Ctrl+N">New adjustment</Button>}
      />
      <Tabs
        value={tab} onValueChange={setTab} className="min-h-0 flex-1 bg-surface"
        tabs={[{ value: 'levels', label: 'Levels' }, { value: 'adjustments', label: 'Adjustments' }, { value: 'take', label: 'Stock take' }]}
      >
        {tab === 'levels' && <StockLevels version={version} />}
        {tab === 'adjustments' && <StockAdjustments version={version} onNew={() => setAdjusting(true)} />}
        {tab === 'take' && <StockTake onPosted={() => { bump(); setTab('adjustments'); }} />}
      </Tabs>
      <AdjustmentDialog open={adjusting} onOpenChange={setAdjusting} onDone={bump} />
    </>
  );
}
