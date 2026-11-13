import type { MockStore } from './store';
import type { Milli, Paise } from '../types';
import type { PressingBatch, SeedType } from './purchasing';

// Area: godown barrels (production stock), transfers to the store, outsourced oil and the Mill daily report.
//
// The owner's real process: seeds in kg, OIL IN LITRES. Pressed oil goes into a 200 L godown barrel (several batches
// share one barrel); the end-of-day stick reading is the truth; a full barrel SETTLES; after settling, oil is TRANSFERRED
// to the store loose-oil item. Godown oil is never store stock and never reaches the POS. Oil bought from an outside
// manufacturer goes into a godown barrel too. All quantities are milli-units (litres x 1000, kg x 1000).

export type GodownStatus = 'empty' | 'filling' | 'settling' | 'ready';

export interface GodownReading { at: string; measuredL: Milli; systemL: Milli; varianceL: Milli; note?: string; by?: string }

export interface GodownBarrel {
  id: string;
  label: string;
  oil: SeedType;
  oilName: string;
  capacityL: Milli;
  levelL: Milli;
  /** What people see: empty at 0 L, and a settling barrel turns ready by itself after its settling days */
  status: GodownStatus;
  filledOn: string | null;
  settleStartedOn: string | null;
  readyOn: string | null;
  active: boolean;
  settleDays: number;
  lastReading: GodownReading | null;
}

export interface GodownMove { at: string; kind: 'press' | 'outsourced' | 'stick' | 'transfer'; qtyL: Milli; note: string; by: string }
export interface GodownDetail { barrel: GodownBarrel; ledger: GodownMove[]; readings: GodownReading[] }

export interface OutsourcedOil {
  id: string; number: string; date: string; oil: SeedType; oilName: string; barrelId: string; barrelLabel: string;
  supplierId?: string | null; supplierName: string; litresL: Milli; cost: Paise; ratePerL: Paise; note: string; by?: string;
}
export interface OutsourcedInput { barrelId: string; supplierId?: string; supplierName?: string; litresL: Milli; cost: Paise; note?: string }

export interface GodownTransfer {
  id: string; number: string; date: string; oil: SeedType; oilName: string; barrelId: string; barrelLabel: string;
  itemId: string; itemName: string; litresL: Milli; storeBarrelId?: string | null; note: string; by?: string;
}
export interface TransferInput { barrelId: string; itemId: string; litresL: Milli; storeBarrelId?: string; note?: string }

export interface AddBarrelsInput { oil: SeedType; count: number; capacityL?: Milli }
export interface EditBarrelInput { id: string; label: string; capacityL: Milli; active: boolean }
export interface StatusInput { barrelId: string; action: 'settle' | 'ready' | 'reopen' }
export interface StickInput { barrelId: string; measuredL: Milli; note?: string }

/* ---- Mill daily report ---- */
export interface MillDailySeed { seed: SeedType; label: string; opening: Milli; bought: Milli; toPress: Milli; other: Milli; closing: Milli }
export interface MillDailyBarrel {
  id: string; label: string; oil: SeedType; status: GodownStatus; capacityL: Milli;
  openingL: Milli; pressedL: Milli; outsourcedL: Milli; transferredL: Milli; stickAdjustL: Milli; closingL: Milli;
  reading: { at: string; measuredL: Milli; varianceL: Milli } | null;
}
export interface MillDailyOil { oil: SeedType; label: string; openingL: Milli; pressedL: Milli; outsourcedL: Milli; transferredL: Milli; stickAdjustL: Milli; closingL: Milli }
export interface MillDailyCake { key: string; label: string; opening: Milli; made: Milli; sold: Milli; other: Milli; closing: Milli }
export interface MillDaily {
  day: string;
  seeds: MillDailySeed[];
  oils: MillDailyOil[];
  barrels: MillDailyBarrel[];
  cake: MillDailyCake[];
  batches: PressingBatch[];
  transfers: GodownTransfer[];
  outsourced: OutsourcedOil[];
  totals: { batches: number; seedInKg: number; cleaningKg: number; oilL: number; oilKg: number; cakeKg: number; lossKg: number; lossPct: number; kgSeedPerL: number };
}

export interface ProductionApi {
  listGodownBarrels(): Promise<GodownBarrel[]>;
  getGodownBarrel(id: string): Promise<GodownDetail>;
  addGodownBarrels(input: AddBarrelsInput): Promise<GodownBarrel[]>;
  editGodownBarrel(input: EditBarrelInput): Promise<GodownBarrel>;
  /** settle = stop filling and start settling; ready = settled early; reopen = back to filling */
  setGodownStatus(input: StatusInput): Promise<GodownBarrel>;
  /** The end-of-day measuring-stick reading: the stick is the truth, the difference to the entries is the variance */
  recordStickReading(input: StickInput): Promise<GodownBarrel>;
  recordOutsourcedOil(input: OutsourcedInput): Promise<OutsourcedOil>;
  listOutsourcedOil(limit?: number): Promise<OutsourcedOil[]>;
  /** Settled oil from a godown barrel to a store loose-oil item (adds to its stock) */
  transferToStore(input: TransferInput): Promise<GodownTransfer>;
  listGodownTransfers(limit?: number): Promise<GodownTransfer[]>;
  /** The Mill daily sheet: a report filled from the day's production entries */
  getMillDaily(day: string): Promise<MillDaily>;
}

/* ====================================================================== */
/* Mock (browser preview)                                                  */
/* ====================================================================== */

/** State the production mock shares with the purchasing mock (a pressing batch fills a godown barrel). */
export interface GodownMockState {
  barrels: GodownBarrel[];
  moves: (GodownMove & { barrelId: string; ref?: string })[];
  readings: (GodownReading & { barrelId: string })[];
  outsourced: OutsourcedOil[];
  transfers: GodownTransfer[];
  /** The stored status of each barrel (a settling barrel is shown as ready on its own, see godownStatus) */
  stored: Map<string, GodownStatus>;
}

const OIL_BASE: Record<SeedType, { short: string; oilName: string; settleDays: number }> = {
  groundnut: { short: 'Groundnut', oilName: 'Groundnut Oil', settleDays: 4 },
  sesame: { short: 'Sesame', oilName: 'Gingelly Oil', settleDays: 5 },
  copra: { short: 'Coconut', oilName: 'Coconut Oil', settleDays: 3 },
};
const DAY = 86400000;
const ymd = (d: Date | string) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const lit = (milli: number) => (Math.round(milli / 100) / 10).toString();

/** The status a person sees (mirrors the Rust side). */
export function godownStatus(b: Pick<GodownBarrel, 'levelL' | 'settleStartedOn' | 'settleDays'> & { stored: GodownStatus }): GodownStatus {
  if (b.levelL === 0) return 'empty';
  if (b.stored === 'settling') {
    const t = b.settleStartedOn ? new Date(b.settleStartedOn).getTime() + b.settleDays * DAY : 0;
    return t <= Date.now() ? 'ready' : 'settling';
  }
  return b.stored === 'ready' ? 'ready' : 'filling';
}

export function createProductionMock(store: MockStore): ProductionApi {
  const ago = (days: number, hour = 17) => { const d = new Date(); d.setDate(d.getDate() - days); d.setHours(hour, 10, 0, 0); return d.toISOString(); };
  const stored = new Map<string, GodownStatus>();
  const mk = (id: string, label: string, oil: SeedType, level: number, status: GodownStatus, filledDays: number | null, settleDays: number | null): GodownBarrel => {
    stored.set(id, status);
    return {
      id, label, oil, oilName: OIL_BASE[oil].oilName, capacityL: 200000, levelL: level, status, filledOn: filledDays === null ? null : ago(filledDays),
      settleStartedOn: settleDays === null ? null : ago(settleDays), readyOn: null, active: true, settleDays: OIL_BASE[oil].settleDays, lastReading: null,
    };
  };
  const state: GodownMockState = {
    barrels: [
      mk('GB-001', 'Groundnut 1', 'groundnut', 142500, 'filling', 3, null),
      mk('GB-002', 'Groundnut 2', 'groundnut', 196000, 'settling', 8, 2),
      mk('GB-003', 'Groundnut 3', 'groundnut', 198500, 'ready', 14, 6),
      mk('GB-004', 'Sesame 1', 'sesame', 88000, 'filling', 2, null),
      mk('GB-005', 'Sesame 2', 'sesame', 0, 'empty', null, null),
      mk('GB-006', 'Coconut 1', 'copra', 191000, 'ready', 11, 5),
      mk('GB-007', 'Coconut 2', 'copra', 0, 'empty', null, null),
    ],
    moves: [], readings: [], outsourced: [], transfers: [], stored,
  };
  store.godown = state;

  const refresh = (b: GodownBarrel): GodownBarrel => {
    const st = stored.get(b.id) ?? 'empty';
    b.status = godownStatus({ levelL: b.levelL, settleStartedOn: b.settleStartedOn, settleDays: b.settleDays, stored: st });
    b.readyOn = b.settleStartedOn ? new Date(new Date(b.settleStartedOn).getTime() + b.settleDays * DAY).toISOString() : null;
    b.lastReading = [...state.readings].reverse().find((r) => r.barrelId === b.id) ?? null;
    return b;
  };
  const byId = (id: string) => state.barrels.find((b) => b.id === id);
  const need = (id: string) => { const b = byId(id); if (!b) throw new Error('Barrel not found.'); return b; };
  const post = (b: GodownBarrel, kind: GodownMove['kind'], qty: number, note: string, ref?: string, at = new Date().toISOString()) => {
    b.levelL += qty;
    state.moves.push({ at, kind, qtyL: qty, note, by: 'Suresh Kumar', barrelId: b.id, ref });
  };

  // a believable history for the preview
  const seedMoves = () => {
    const add = (id: string, entries: [number, GodownMove['kind'], number, string][]) => {
      const b = need(id);
      const back = entries.reduce((a, e) => a + e[2], 0);
      b.levelL -= back;
      for (const [days, kind, qty, note] of entries) post(b, kind, qty, note, undefined, ago(days, 16));
    };
    add('GB-001', [[3, 'press', 38000, 'Oil from PB-0412'], [2, 'press', 41500, 'Oil from PB-0411'], [1, 'press', 36500, 'Oil from PB-0410'], [1, 'stick', -1500, 'Stick 142.5 L, entries 144 L'], [0, 'press', 27500, 'Oil from PB-0413']]);
    add('GB-002', [[8, 'press', 98000, 'Oil from PB-0405'], [7, 'press', 99500, 'Oil from PB-0404'], [6, 'stick', -1500, 'Stick 196 L, entries 197.5 L']]);
    add('GB-003', [[14, 'press', 100000, 'Oil from PB-0399'], [13, 'press', 99000, 'Oil from PB-0398'], [12, 'stick', -500, 'Stick 198.5 L, entries 199 L']]);
    add('GB-004', [[2, 'press', 44000, 'Oil from PB-0409'], [1, 'press', 44500, 'Oil from PB-0408'], [0, 'stick', -500, 'Stick 88 L, entries 88.5 L']]);
    add('GB-006', [[11, 'outsourced', 100000, 'Outsourced oil GP-26-000001 from Kerala Coconut Oil Mills'], [10, 'press', 92000, 'Oil from PB-0395'], [9, 'stick', -1000, 'Stick 191 L, entries 192 L']]);
    state.readings.push(
      { barrelId: 'GB-001', at: ago(1, 18), measuredL: 142500, systemL: 144000, varianceL: -1500, note: 'end of day' },
      { barrelId: 'GB-004', at: ago(0, 8), measuredL: 88000, systemL: 88500, varianceL: -500, note: '' },
    );
    state.outsourced.push({
      id: 'gp1', number: 'GP-26-000001', date: ago(11, 11), oil: 'copra', oilName: 'Coconut Oil', barrelId: 'GB-006', barrelLabel: 'Coconut 1', supplierName: 'Kerala Coconut Oil Mills',
      litresL: 100000, cost: 3_200_000, ratePerL: 32000, note: 'copra short this week', by: 'Suresh Kumar',
    });
    const l = store.items.find((i) => i.name === 'Groundnut Oil (Loose)');
    state.transfers.push({
      id: 'gt1', number: 'GT-26-000003', date: ago(4, 12), oil: 'groundnut', oilName: 'Groundnut Oil', barrelId: 'GB-003', barrelLabel: 'Groundnut 3', itemId: l?.id ?? 'i-gn-loose',
      itemName: l?.name ?? 'Groundnut Oil (Loose)', litresL: 150000, storeBarrelId: null, note: 'barrel 3 settled', by: 'Suresh Kumar',
    });
  };
  seedMoves();
  state.barrels.forEach(refresh);

  let gtSeq = 3; let gpSeq = 1;
  const findLoose = (id: string) => store.items.find((i) => i.id === id);

  return {
    listGodownBarrels: async () => state.barrels.map((b) => ({ ...refresh(b) })),
    getGodownBarrel: async (id) => {
      const b = refresh(need(id));
      return {
        barrel: { ...b },
        ledger: state.moves.filter((m) => m.barrelId === id).sort((a, c) => c.at.localeCompare(a.at)).map(({ barrelId: _b, ref: _r, ...m }) => m),
        readings: state.readings.filter((r) => r.barrelId === id).sort((a, c) => c.at.localeCompare(a.at)).map(({ barrelId: _b, ...r }) => r),
      };
    },
    addGodownBarrels: async (d) => {
      if (d.count < 1 || d.count > 30) throw new Error('Add between 1 and 30 barrels at a time.');
      const cap = d.capacityL ?? 200000;
      for (let i = 0; i < d.count; i++) {
        const n = Math.max(0, ...state.barrels.map((b) => Number(b.id.slice(3)))) + 1;
        let k = state.barrels.filter((b) => b.oil === d.oil).length + 1;
        while (state.barrels.some((b) => b.label === `${OIL_BASE[d.oil].short} ${k}`)) k += 1;
        const b = mk(`GB-${String(n).padStart(3, '0')}`, `${OIL_BASE[d.oil].short} ${k}`, d.oil, 0, 'empty', null, null);
        b.capacityL = cap;
        state.barrels.push(b);
      }
      return state.barrels.map((b) => ({ ...refresh(b) }));
    },
    editGodownBarrel: async (d) => {
      const b = need(d.id);
      if (!d.label.trim()) throw new Error('Give the barrel a name.');
      if (d.capacityL < b.levelL || d.capacityL <= 0) throw new Error(`The barrel holds ${lit(b.levelL)} L now, so its size cannot be less than that.`);
      if (!d.active && b.levelL > 0) throw new Error('Empty the barrel before taking it out of use.');
      if (state.barrels.some((x) => x.id !== d.id && x.label.toLowerCase() === d.label.trim().toLowerCase())) throw new Error('Another barrel already has that name.');
      b.label = d.label.trim(); b.capacityL = d.capacityL; b.active = d.active;
      return { ...refresh(b) };
    },
    setGodownStatus: async (d) => {
      const b = refresh(need(d.barrelId));
      if (d.action === 'settle') {
        if (b.status !== 'filling') throw new Error(`${b.label} is ${b.status}. Only a barrel that is being filled can be left to settle.`);
        stored.set(b.id, 'settling'); b.settleStartedOn = new Date().toISOString();
      } else if (d.action === 'ready') {
        if (b.status !== 'settling') throw new Error(`${b.label} is ${b.status}. Only a settling barrel can be marked ready.`);
        stored.set(b.id, 'ready');
      } else {
        if (b.status !== 'settling' && b.status !== 'ready') throw new Error(`${b.label} is ${b.status}.`);
        stored.set(b.id, 'filling'); b.settleStartedOn = null;
      }
      return { ...refresh(b) };
    },
    recordStickReading: async (d) => {
      const b = need(d.barrelId);
      if (d.measuredL < 0) throw new Error('The reading cannot be negative.');
      if (d.measuredL > b.capacityL) throw new Error(`${b.label} holds ${lit(b.capacityL)} L at most. Check the reading.`);
      const variance = d.measuredL - b.levelL;
      state.readings.push({ barrelId: b.id, at: new Date().toISOString(), measuredL: d.measuredL, systemL: b.levelL, varianceL: variance, note: d.note ?? '' });
      if (variance !== 0) post(b, 'stick', variance, `Stick ${lit(d.measuredL)} L, entries ${lit(b.levelL - variance)} L`);
      if (b.levelL === 0) { stored.set(b.id, 'empty'); b.filledOn = null; b.settleStartedOn = null; } else if (stored.get(b.id) === 'empty') stored.set(b.id, 'filling');
      return { ...refresh(b) };
    },
    recordOutsourcedOil: async (d) => {
      const b = refresh(need(d.barrelId));
      if (d.litresL <= 0) throw new Error('Enter the litres bought.');
      const supplier = d.supplierId ? store.suppliers.find((s) => s.id === d.supplierId)?.name : d.supplierName?.trim();
      if (!supplier) throw new Error('Enter the manufacturer or supplier you bought the oil from.');
      if (b.status === 'settling' || b.status === 'ready') throw new Error(`${b.label} is ${b.status} and cannot take fresh oil. Pick a barrel that is filling or empty.`);
      if (b.levelL + d.litresL > b.capacityL) throw new Error(`${b.label} has room for only ${lit(b.capacityL - b.levelL)} L.`);
      gpSeq += 1;
      const rec: OutsourcedOil = {
        id: `gp${gpSeq}`, number: `GP-26-${String(gpSeq).padStart(6, '0')}`, date: new Date().toISOString(), oil: b.oil, oilName: b.oilName, barrelId: b.id, barrelLabel: b.label,
        supplierId: d.supplierId ?? null, supplierName: supplier, litresL: d.litresL, cost: d.cost, ratePerL: Math.round((d.cost * 1000) / d.litresL), note: d.note ?? '', by: 'Suresh Kumar',
      };
      state.outsourced.push(rec);
      post(b, 'outsourced', d.litresL, `Outsourced oil ${rec.number} from ${supplier}`);
      stored.set(b.id, 'filling'); b.filledOn = b.filledOn ?? new Date().toISOString(); b.settleStartedOn = null;
      return rec;
    },
    listOutsourcedOil: async () => [...state.outsourced].sort((a, c) => c.date.localeCompare(a.date)),
    transferToStore: async (d) => {
      const b = refresh(need(d.barrelId));
      if (d.litresL <= 0) throw new Error('Enter the litres to move to the store.');
      if (b.status !== 'ready') throw new Error(`${b.label} is ${b.status}. Oil can go to the store only after it has settled (mark the barrel ready first).`);
      if (d.litresL > b.levelL) throw new Error(`${b.label} holds only ${lit(b.levelL)} L.`);
      const item = findLoose(d.itemId);
      if (!item || !item.loose) throw new Error('The oil can only go to a loose-oil item (sold by the litre at the counter).');
      gtSeq += 1;
      const rec: GodownTransfer = {
        id: `gt${gtSeq}`, number: `GT-26-${String(gtSeq).padStart(6, '0')}`, date: new Date().toISOString(), oil: b.oil, oilName: b.oilName, barrelId: b.id, barrelLabel: b.label,
        itemId: item.id, itemName: item.name, litresL: d.litresL, storeBarrelId: d.storeBarrelId ?? null, note: d.note ?? '', by: 'Suresh Kumar',
      };
      state.transfers.push(rec);
      post(b, 'transfer', -d.litresL, `${rec.number} to store: ${item.name}`);
      item.stock += d.litresL;
      if (b.levelL === 0) { stored.set(b.id, 'empty'); b.filledOn = null; b.settleStartedOn = null; } else stored.set(b.id, 'ready');
      return rec;
    },
    listGodownTransfers: async () => [...state.transfers].sort((a, c) => c.date.localeCompare(a.date)),
    getMillDaily: async (day) => {
      const inDay = (iso: string) => ymd(iso) === day;
      const before = (iso: string) => ymd(iso) < day;
      const barrels: MillDailyBarrel[] = [];
      for (const b of state.barrels) {
        const mv = state.moves.filter((m) => m.barrelId === b.id);
        const sum = (f: (m: GodownMove) => boolean) => mv.filter(f).reduce((a, m) => a + m.qtyL, 0);
        const opening = sum((m) => before(m.at));
        const day_ = (k: GodownMove['kind']) => sum((m) => inDay(m.at) && m.kind === k);
        const closing = sum((m) => before(m.at) || inDay(m.at));
        const reading = [...state.readings].reverse().find((r) => r.barrelId === b.id && inDay(r.at));
        if (!opening && !closing && !mv.some((m) => inDay(m.at))) continue;
        barrels.push({
          id: b.id, label: b.label, oil: b.oil, status: refresh(b).status, capacityL: b.capacityL, openingL: opening, pressedL: day_('press'),
          outsourcedL: day_('outsourced'), transferredL: -day_('transfer'), stickAdjustL: day_('stick'), closingL: closing,
          reading: reading ? { at: reading.at, measuredL: reading.measuredL, varianceL: reading.varianceL } : null,
        });
      }
      const oils: MillDailyOil[] = (Object.keys(OIL_BASE) as SeedType[]).map((oil) => {
        const of = (k: keyof MillDailyBarrel) => barrels.filter((b) => b.oil === oil).reduce((a, b) => a + (b[k] as number), 0);
        return { oil, label: OIL_BASE[oil].oilName, openingL: of('openingL'), pressedL: of('pressedL'), outsourcedL: of('outsourcedL'), transferredL: of('transferredL'), stickAdjustL: of('stickAdjustL'), closingL: of('closingL') };
      });
      const batches = (store.pressing?.() ?? []).filter((b) => ymd(b.date) === day);
      const sumM = (k: 'seedInKg' | 'cleaningKg' | 'oilKg' | 'cakeKg' | 'lossKg') => batches.reduce((a, b) => a + b.metrics[k], 0);
      const net = sumM('seedInKg') - sumM('cleaningKg');
      const oilL = batches.reduce((a, b) => a + b.oilRawL / 1000, 0);
      const seedLabels: Record<SeedType, string> = { groundnut: 'Groundnut', sesame: 'Sesame (Ellu)', copra: 'Copra' };
      const seeds: MillDailySeed[] = (Object.keys(seedLabels) as SeedType[]).map((seed) => {
        const toPress = batches.filter((b) => b.seed === seed).reduce((a, b) => a + b.seedKg, 0);
        const stockNow = store.items.find((i) => i.id === ({ groundnut: 'rm-gn', sesame: 'rm-sesame', copra: 'rm-copra' } as const)[seed])?.stock ?? 0;
        const bought = seed === 'groundnut' ? 400000 : 0;
        return { seed, label: seedLabels[seed], opening: stockNow + toPress - bought, bought, toPress, other: 0, closing: stockNow };
      }).filter((s) => s.toPress > 0 || s.bought > 0);
      const cakeBy = (seed: SeedType) => batches.filter((b) => b.seed === seed).reduce((a, b) => a + b.cakeKg, 0);
      const cake: MillDailyCake[] = ([['kadalai_w', 'Groundnut cake W', 'groundnut'], ['ellu_w', 'Sesame cake W', 'sesame'], ['coco', 'Coconut cake', 'copra']] as const)
        .map(([key, label, seed]) => ({ key, label, opening: 310000, made: cakeBy(seed), sold: 0, other: 0, closing: 310000 + cakeBy(seed) }))
        .filter((c) => c.made > 0);
      return {
        day, seeds, oils, barrels, cake, batches,
        transfers: state.transfers.filter((t) => inDay(t.date)), outsourced: state.outsourced.filter((o) => inDay(o.date)),
        totals: {
          batches: batches.length, seedInKg: sumM('seedInKg'), cleaningKg: sumM('cleaningKg'), oilL, oilKg: sumM('oilKg'), cakeKg: sumM('cakeKg'), lossKg: sumM('lossKg'),
          lossPct: net > 0 ? (sumM('lossKg') / net) * 100 : 0, kgSeedPerL: oilL > 0 ? net / oilL : 0,
        },
      };
    },
  };
}
