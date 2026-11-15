import { useEffect, useState } from 'react';
import { DEFAULT_GST_RATES, enabledRates } from '@gokul/data';
import { api } from './store';

/** The owner's enabled GST rates (Settings, Tax), for item forms, filters and bulk edits. Falls back to the defaults while loading. */
export function useGstRates(): number[] {
  const [rates, setRates] = useState<number[]>([...DEFAULT_GST_RATES]);
  useEffect(() => {
    let alive = true;
    api.getSettingsBundle().then((b) => { if (alive) setRates(enabledRates(b.tax.rates)); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return rates;
}
