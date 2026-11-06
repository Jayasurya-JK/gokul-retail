import { useState } from 'react';
import { Hammer } from 'lucide-react';
import { Button, EmptyState, PageHeader, Tabs } from '@gokul/ui';
import type { ScreenInfo } from '../nav';

export function Placeholder({ title, subtitle, tabs, action, hint }: ScreenInfo) {
  const [tab, setTab] = useState(tabs?.[0] ?? '');
  const body = <EmptyState icon={<Hammer size={22} />} title={`${title} is being designed`} hint={`${hint} This screen arrives in the next design wave.`} />;
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} actions={action ? <Button variant="primary" disabled>{action}</Button> : undefined} />
      {tabs ? (
        <Tabs value={tab} onValueChange={setTab} tabs={tabs.map((t) => ({ value: t, label: t }))} className="min-h-0 flex-1">
          <div className="min-h-0 flex-1 bg-surface">{body}</div>
        </Tabs>
      ) : (
        <div className="min-h-0 flex-1 bg-surface">{body}</div>
      )}
    </>
  );
}
