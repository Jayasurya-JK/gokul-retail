import { useEffect, useState } from 'react';
import { receiptConfigFrom, type ReceiptConfig } from '@gokul/data';
import { api } from './store';

let cached: ReceiptConfig | null = null;

/** Shop details for the bill preview (Tamil line, WhatsApp, headings), read once from Settings. */
export function useReceiptConfig(): ReceiptConfig | undefined {
  const [cfg, setCfg] = useState<ReceiptConfig | null>(cached);
  useEffect(() => {
    let alive = true;
    api.getSettingsBundle().then((b) => { cached = receiptConfigFrom(b); if (alive) setCfg(cached); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return cfg ?? undefined;
}
