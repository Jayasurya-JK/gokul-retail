import type { MockStore } from './store';
import type { GstrFacts } from '../gstr';
import { mockGstrFacts } from './gstrmock';

/** GST return facts for a month ("2026-11"). Read only. The sections, Excel and JSON are built from them by ../gstr.ts. */
export interface GstrApi {
  getGstrFacts(month: string): Promise<GstrFacts>;
}

export function createGstrMock(store: MockStore): GstrApi {
  return { getGstrFacts: async (month) => mockGstrFacts(store, month) };
}
