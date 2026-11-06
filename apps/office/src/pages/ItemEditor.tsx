import { useNavigate } from 'react-router-dom';
import { PackagePlus } from 'lucide-react';
import { PageHeader } from '@gokul/ui';
import { ItemForm } from '../components/catalog/ItemForm';

/** Full-pane item editor at /items/new (also reachable from the dashboard). Editing an existing item uses the side sheet on Items. */
export function ItemEditor() {
  const nav = useNavigate();
  return (
    <>
      <PageHeader title="New item" subtitle="Barcodes, units, loose or packed, GST, MRP and prices" icon={<PackagePlus size={17} />} />
      <div className="flex min-h-0 flex-1 flex-col">
        <ItemForm layout="pane" onCancel={() => nav('/items')} onSaved={() => nav('/items')} />
      </div>
    </>
  );
}
