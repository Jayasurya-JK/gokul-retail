import { useCallback, useEffect, useState } from 'react';
import { Tag, Tags } from 'lucide-react';
import type { CountedBrand, CountedCategory, NameResult } from '@gokul/data';
import { PageHeader } from '@gokul/ui';
import { api } from '../store';
import { ManagedList } from '../components/catalog/ManagedList';

export function Categories() {
  const [cats, setCats] = useState<CountedCategory[]>([]);
  const [brands, setBrands] = useState<CountedBrand[]>([]);
  const refresh = useCallback(async () => {
    const [c, b] = await Promise.all([api.listCategoriesWithCounts(), api.listBrands()]);
    setCats(c); setBrands(b);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const then = <A extends unknown[], R>(fn: (...a: A) => Promise<R>) => async (...a: A) => { const r = await fn(...a); await refresh(); return r; };
  const ok = async (p: Promise<NameResult>) => p;

  return (
    <>
      <PageHeader title="Categories and brands" subtitle="Group items for billing and reports. Order here is the order on the billing screen." icon={<Tags size={17} />} />
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 p-4">
        <ManagedList
          title="Categories" noun="category" icon={<Tags size={14} />} rows={cats}
          onAdd={then((n: string) => ok(api.addCategory(n)))} onRename={then((id: string, n: string) => ok(api.renameCategory(id, n)))}
          onDelete={then((id: string) => ok(api.deleteCategory(id)))} onMove={then((id: string, d: -1 | 1) => api.moveCategory(id, d))}
        />
        <ManagedList
          title="Brands" noun="brand" icon={<Tag size={14} />} rows={brands}
          onAdd={then((n: string) => ok(api.addBrand(n)))} onRename={then((id: string, n: string) => ok(api.renameBrand(id, n)))}
          onDelete={then((id: string) => ok(api.deleteBrand(id)))} onMove={then((id: string, d: -1 | 1) => api.moveBrand(id, d))}
        />
      </div>
    </>
  );
}
