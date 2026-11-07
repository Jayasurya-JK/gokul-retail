import { useCallback, useEffect, useState } from 'react';
import { LayoutGrid, Tag, Tags } from 'lucide-react';
import type { CountedBrand, CountedCategory, NameResult } from '@gokul/data';
import { Kbd, PageHeader, cn } from '@gokul/ui';
import { api, useSession } from '../store';
import { ManagedList } from '../components/catalog/ManagedList';
import { CatalogItemsPane } from '../components/catalog/CatalogItemsPane';

/** Master-detail: categories and brands on the left pick what the products table on the right shows. */
export function Categories() {
  const [cats, setCats] = useState<CountedCategory[]>([]);
  const [brands, setBrands] = useState<CountedBrand[]>([]);
  const [catId, setCatId] = useState<string | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);
  const role = useSession((s) => s.user?.role);

  const refresh = useCallback(async () => {
    const [c, b] = await Promise.all([api.listCategoriesWithCounts(), api.listBrands()]);
    setCats(c); setBrands(b);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  // A renamed-away or deleted selection must not stay applied.
  useEffect(() => { if (catId && cats.length && !cats.some((c) => c.id === catId)) setCatId(null); }, [cats, catId]);
  useEffect(() => { if (brandId && brands.length && !brands.some((b) => b.id === brandId)) setBrandId(null); }, [brands, brandId]);

  const then = <A extends unknown[], R>(fn: (...a: A) => Promise<R>) => async (...a: A) => { const r = await fn(...a); await refresh(); return r; };
  const ok = async (p: Promise<NameResult>) => p;

  const category = cats.find((c) => c.id === catId) ?? null;
  const brand = brands.find((b) => b.id === brandId) ?? null;
  const total = cats.reduce((s, c) => s + c.items, 0);
  const all = !category && !brand;

  return (
    <>
      <PageHeader title="Categories and brands" subtitle="Pick a brand or category to see its products. Order here is the order on the billing screen." icon={<Tags size={17} />} />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[320px] shrink-0 flex-col border-r border-line-strong bg-forest-50">
          <button
            type="button" onClick={() => { setCatId(null); setBrandId(null); }}
            className={cn(
              'mx-1 mt-1 flex h-9 shrink-0 items-center gap-2.5 rounded-control px-3 text-base font-semibold',
              all ? 'bg-primary text-primary-fg' : 'text-ink hover:bg-forest-100',
            )}
          >
            <LayoutGrid size={16} className={all ? 'text-primary-fg' : 'text-primary'} />
            <span className="flex-1 text-left">All items</span>
            <span className={cn('rounded-full px-2 py-0.5 text-xs num', all ? 'bg-primary-fg/20 text-primary-fg' : 'bg-surface text-muted ring-1 ring-line')}>{total}</span>
          </button>
          <div className="mx-3 mb-1 mt-2 h-px shrink-0 bg-line-strong" />
          <ManagedList
            title="Brands" noun="brand" icon={<Tag size={14} />} rows={brands} selectedId={brandId} onSelect={setBrandId}
            onAdd={then((n: string) => ok(api.addBrand(n)))} onRename={then((id: string, n: string) => ok(api.renameBrand(id, n)))}
            onDelete={then((id: string) => ok(api.deleteBrand(id)))} onMove={then((id: string, d: -1 | 1) => api.moveBrand(id, d))}
          />
          <ManagedList
            title="Categories" noun="category" icon={<Tags size={14} />} rows={cats} selectedId={catId} onSelect={setCatId}
            onAdd={then((n: string) => ok(api.addCategory(n)))} onRename={then((id: string, n: string) => ok(api.renameCategory(id, n)))}
            onDelete={then((id: string) => ok(api.deleteCategory(id)))} onMove={then((id: string, d: -1 | 1) => api.moveCategory(id, d))}
          />
          <footer className="flex h-7 shrink-0 items-center gap-2.5 border-t border-line bg-surface-2 px-3 text-[11px] text-muted">
            <span className="flex items-center gap-1"><Kbd>Enter</Kbd> pick</span>
            <span className="flex items-center gap-1"><Kbd>F2</Kbd> rename</span>
            <span className="flex items-center gap-1"><Kbd>Alt</Kbd><Kbd>Up</Kbd> move</span>
            <span className="flex items-center gap-1"><Kbd>Del</Kbd></span>
          </footer>
        </aside>
        <CatalogItemsPane
          category={category} brand={brand} cats={cats} brands={brands} canEdit={role === 'owner' || role === 'manager'}
          onClearCategory={() => setCatId(null)} onClearBrand={() => setBrandId(null)} onChanged={() => void refresh()}
        />
      </div>
    </>
  );
}
