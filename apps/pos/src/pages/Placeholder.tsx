import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Construction } from 'lucide-react';
import { EmptyState, PosLayout } from '@gokul/ui';
import { TopBar } from '../components/TopBar';

export function Placeholder({ title, hint }: { title: string; hint: string }) {
  const nav = useNavigate();
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') nav('/billing'); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [nav]);
  return (
    <PosLayout
      topBar={<TopBar />}
      keys={[{ key: 'Esc', label: 'Back to billing', onClick: () => nav('/billing') }]}
    >
      <div className="flex-1 bg-surface">
        <EmptyState icon={<Construction size={22} />} title={title} hint={`${hint} This screen is designed in the next wave.`} />
      </div>
    </PosLayout>
  );
}
