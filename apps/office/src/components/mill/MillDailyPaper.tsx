import { formatRupees, type MillDaily, type MillDailyBarrel, type MillDay } from '@gokul/data';
import { fmtQty, longDay } from './millUtil';
import { activeOils, fmtNum, millPressingRows, rowLitresPer100, signed, sumBarrels, sumPressing, STATUS_LABEL } from './millDaily';

const th = 'border border-black px-1.5 py-1 text-left text-[10px] font-semibold';
const td = 'border border-black px-1.5 py-[3px] text-[11px]';
const num = 'text-right tabular-nums';
const h2 = 'mb-1 mt-4 text-[12px] font-bold uppercase tracking-wide';
const empty = (cols: number, text: string) => <tr><td className={`${td} text-neutral-600`} colSpan={cols}>{text}</td></tr>;

/**
 * The auto-filled mill day in the layout of the owner's paper form, black on white. Used only for printing;
 * every number on it was entered in Production, nothing is typed here.
 */
export function MillDailyPaper({ data, shop, info }: { data: MillDaily; shop: string; info?: MillDay | null }) {
  const counted = (info?.stock ?? []).filter((l) => l.physical !== null && l.group !== 'oil');
  const rows = millPressingRows(data);
  const press = sumPressing(rows);
  const pressPer100 = press.seedKg > press.cleaningKg ? (press.oilL * 100) / (press.seedKg - press.cleaningKg) : null;
  const oils = activeOils(data);
  const barrels = data.barrels;
  const bt = sumBarrels(barrels);
  const oilT = (k: 'openingL' | 'pressedL' | 'outsourcedL' | 'transferredL' | 'stickAdjustL' | 'closingL') => oils.reduce((a, o) => a + o[k], 0);
  const outL = data.outsourced.reduce((a, o) => a + o.litresL, 0);
  const outCost = data.outsourced.reduce((a, o) => a + o.cost, 0);
  const trL = data.transfers.reduce((a, t) => a + t.litresL, 0);
  const nothing = !data.batches.length && !barrels.length && !oils.length && !data.outsourced.length && !data.transfers.length;

  return (
    <div className="print-area mx-auto w-[794px] bg-white p-8 font-sans text-black">
      <div className="flex items-start justify-between border-b-2 border-black pb-2">
        <div>
          <div className="text-[18px] font-bold tracking-wide">{shop.toUpperCase()}</div>
          <div className="text-[12px]">Mill day sheet</div>
        </div>
        <div className="text-right text-[12px]">
          <div className="font-semibold">{longDay(data.day)}</div>
          <div className="text-[11px]">Filled from the Production entries{info?.supervisor ? ` - Supervisor: ${info.supervisor}` : ''}</div>
        </div>
      </div>

      {nothing && <div className="mt-6 text-[12px] text-neutral-600">No production, godown or transfer entries were recorded on this day.</div>}

      {!nothing && <>
        <h2 className={h2}>1. Seeds in the godown (kg)</h2>
        <table className="w-full border-collapse">
          <thead><tr><th className={th}>Seed</th><th className={`${th} ${num}`}>Opening</th><th className={`${th} ${num}`}>Received</th><th className={`${th} ${num}`}>Taken to press</th><th className={`${th} ${num}`}>Other</th><th className={`${th} ${num}`}>Closing</th></tr></thead>
          <tbody>
            {data.seeds.length === 0 && empty(6, 'No seed movement today.')}
            {data.seeds.map((s) => (
              <tr key={s.seed}>
                <td className={td}>{s.label}</td>
                <td className={`${td} ${num}`}>{fmtQty(s.opening)}</td><td className={`${td} ${num}`}>{fmtQty(s.bought)}</td>
                <td className={`${td} ${num}`}>{fmtQty(s.toPress)}</td><td className={`${td} ${num}`}>{s.other ? fmtQty(s.other) : '-'}</td>
                <td className={`${td} ${num} font-semibold`}>{fmtQty(s.closing)}</td>
              </tr>
            ))}
            {data.seeds.length > 0 && (
              <tr className="font-semibold">
                <td className={td}>Total</td>
                <td className={`${td} ${num}`}>{fmtQty(data.seeds.reduce((a, s) => a + s.opening, 0))}</td>
                <td className={`${td} ${num}`}>{fmtQty(data.seeds.reduce((a, s) => a + s.bought, 0))}</td>
                <td className={`${td} ${num}`}>{fmtQty(data.seeds.reduce((a, s) => a + s.toPress, 0))}</td>
                <td className={`${td} ${num}`}>{fmtQty(data.seeds.reduce((a, s) => a + s.other, 0))}</td>
                <td className={`${td} ${num}`}>{fmtQty(data.seeds.reduce((a, s) => a + s.closing, 0))}</td>
              </tr>
            )}
          </tbody>
        </table>

        <h2 className={h2}>2. Pressing</h2>
        <table className="w-full border-collapse">
          <thead><tr><th className={th}>Operator</th><th className={th}>Seed</th><th className={th}>Mach.</th><th className={`${th} ${num}`}>Batches</th><th className={`${th} ${num}`}>Seed in (kg)</th><th className={`${th} ${num}`}>Oil out (L)</th><th className={`${th} ${num}`}>Cake out (kg)</th><th className={`${th} ${num}`}>L / 100 kg</th></tr></thead>
          <tbody>
            {rows.length === 0 && empty(8, 'No pressings today.')}
            {rows.map((r) => {
              const l100 = rowLitresPer100(r);
              return (
                <tr key={r.key}>
                  <td className={td}>{r.operator}</td><td className={td}>{r.seedLabel}</td><td className={td}>{r.machine}</td>
                  <td className={`${td} ${num}`}>{r.batches}</td><td className={`${td} ${num}`}>{fmtQty(r.seedKg)}</td>
                  <td className={`${td} ${num}`}>{fmtQty(r.oilL)}</td><td className={`${td} ${num}`}>{fmtQty(r.cakeKg)}</td>
                  <td className={`${td} ${num}`}>{l100 === null ? '-' : l100.toFixed(1)}</td>
                </tr>
              );
            })}
            {rows.length > 0 && (
              <tr className="font-semibold">
                <td className={td} colSpan={3}>Total</td><td className={`${td} ${num}`}>{press.batches}</td>
                <td className={`${td} ${num}`}>{fmtQty(press.seedKg)}</td><td className={`${td} ${num}`}>{fmtQty(press.oilL)}</td>
                <td className={`${td} ${num}`}>{fmtQty(press.cakeKg)}</td>
                <td className={`${td} ${num}`}>{pressPer100 === null ? '-' : pressPer100.toFixed(1)}</td>
              </tr>
            )}
          </tbody>
        </table>
        {rows.length > 0 && (
          <div className="mt-1 text-[10px] text-neutral-600">
            Cleaning waste {fmtNum(data.totals.cleaningKg)} kg. Loss (moisture, foots) {fmtNum(data.totals.lossKg)} kg ({data.totals.lossPct.toFixed(1)}% of clean seed). {pressPer100 === null ? '' : `Yield ${pressPer100.toFixed(1)} L / 100 kg.`}
          </div>
        )}

        <h2 className={h2}>3. Godown barrels and stick readings</h2>
        <table className="mb-2 w-full border-collapse">
          <thead><tr><th className={th}>Oil</th><th className={`${th} ${num}`}>Opening (L)</th><th className={`${th} ${num}`}>Pressed (L)</th><th className={`${th} ${num}`}>Outsourced (L)</th><th className={`${th} ${num}`}>To store (L)</th><th className={`${th} ${num}`}>Stick adj. (L)</th><th className={`${th} ${num}`}>Closing (L)</th></tr></thead>
          <tbody>
            {oils.length === 0 && empty(7, 'No oil movement today.')}
            {oils.map((o) => (
              <tr key={o.oil}>
                <td className={td}>{o.label}</td>
                <td className={`${td} ${num}`}>{fmtQty(o.openingL)}</td><td className={`${td} ${num}`}>{fmtQty(o.pressedL)}</td>
                <td className={`${td} ${num}`}>{fmtQty(o.outsourcedL)}</td><td className={`${td} ${num}`}>{fmtQty(o.transferredL)}</td>
                <td className={`${td} ${num}`}>{o.stickAdjustL ? signed(o.stickAdjustL) : '-'}</td>
                <td className={`${td} ${num} font-semibold`}>{fmtQty(o.closingL)}</td>
              </tr>
            ))}
            {oils.length > 1 && (
              <tr className="font-semibold">
                <td className={td}>Total</td>
                <td className={`${td} ${num}`}>{fmtQty(oilT('openingL'))}</td><td className={`${td} ${num}`}>{fmtQty(oilT('pressedL'))}</td>
                <td className={`${td} ${num}`}>{fmtQty(oilT('outsourcedL'))}</td><td className={`${td} ${num}`}>{fmtQty(oilT('transferredL'))}</td>
                <td className={`${td} ${num}`}>{signed(oilT('stickAdjustL'))}</td><td className={`${td} ${num}`}>{fmtQty(oilT('closingL'))}</td>
              </tr>
            )}
          </tbody>
        </table>
        <table className="w-full border-collapse">
          <thead><tr><th className={th}>Barrel</th><th className={th}>Oil</th><th className={th}>Status</th><th className={`${th} ${num}`}>Opening (L)</th><th className={`${th} ${num}`}>Pressed (L)</th><th className={`${th} ${num}`}>Outsourced (L)</th><th className={`${th} ${num}`}>To store (L)</th><th className={`${th} ${num}`}>Stick adj. (L)</th><th className={`${th} ${num}`}>Closing (L)</th><th className={th}>Stick reading</th></tr></thead>
          <tbody>
            {barrels.length === 0 && empty(10, 'No barrels held oil today.')}
            {barrels.map((b) => (
              <BarrelRow key={b.id} b={b} oilLabel={data.oils.find((o) => o.oil === b.oil)?.label ?? b.oil} />
            ))}
            {barrels.length > 1 && (
              <tr className="font-semibold">
                <td className={td} colSpan={3}>Total</td>
                <td className={`${td} ${num}`}>{fmtQty(bt.openingL)}</td><td className={`${td} ${num}`}>{fmtQty(bt.pressedL)}</td>
                <td className={`${td} ${num}`}>{fmtQty(bt.outsourcedL)}</td><td className={`${td} ${num}`}>{fmtQty(bt.transferredL)}</td>
                <td className={`${td} ${num}`}>{bt.stickAdjustL ? signed(bt.stickAdjustL) : '-'}</td>
                <td className={`${td} ${num}`}>{fmtQty(bt.closingL)}</td>
                <td className={td} />
              </tr>
            )}
          </tbody>
        </table>

        <h2 className={h2}>4. Outsourced oil bought</h2>
        <table className="w-full border-collapse">
          <thead><tr><th className={th}>No.</th><th className={th}>Oil</th><th className={th}>Barrel</th><th className={th}>Supplier</th><th className={`${th} ${num}`}>Litres</th><th className={`${th} ${num}`}>Rate / L</th><th className={`${th} ${num}`}>Cost</th><th className={th}>Note</th></tr></thead>
          <tbody>
            {data.outsourced.length === 0 && empty(8, 'None today.')}
            {data.outsourced.map((o) => (
              <tr key={o.id}>
                <td className={td}>{o.number}</td><td className={td}>{o.oilName}</td><td className={td}>{o.barrelLabel}</td>
                <td className={td}>{o.supplierName}</td><td className={`${td} ${num}`}>{fmtQty(o.litresL)}</td>
                <td className={`${td} ${num}`}>{formatRupees(o.ratePerL)}</td><td className={`${td} ${num}`}>{formatRupees(o.cost)}</td>
                <td className={td}>{o.note || ''}</td>
              </tr>
            ))}
            {data.outsourced.length > 0 && (
              <tr className="font-semibold">
                <td className={td} colSpan={4}>Total</td><td className={`${td} ${num}`}>{fmtQty(outL)}</td>
                <td className={td} /><td className={`${td} ${num}`}>{formatRupees(outCost)}</td><td className={td} />
              </tr>
            )}
          </tbody>
        </table>

        <h2 className={h2}>5. Transfers to the store</h2>
        <table className="w-full border-collapse">
          <thead><tr><th className={th}>No.</th><th className={th}>Oil</th><th className={th}>Barrel</th><th className={th}>To store item</th><th className={`${th} ${num}`}>Litres</th><th className={th}>By</th><th className={th}>Note</th></tr></thead>
          <tbody>
            {data.transfers.length === 0 && empty(7, 'None today.')}
            {data.transfers.map((t) => (
              <tr key={t.id}>
                <td className={td}>{t.number}</td><td className={td}>{t.oilName}</td><td className={td}>{t.barrelLabel}</td>
                <td className={td}>{t.itemName}</td><td className={`${td} ${num}`}>{fmtQty(t.litresL)}</td>
                <td className={td}>{t.by ?? ''}</td><td className={td}>{t.note || ''}</td>
              </tr>
            ))}
            {data.transfers.length > 0 && (
              <tr className="font-semibold"><td className={td} colSpan={4}>Total</td><td className={`${td} ${num}`}>{fmtQty(trL)}</td><td className={td} colSpan={2} /></tr>
            )}
          </tbody>
        </table>

        <h2 className={h2}>6. Oil cake (punnaku), kg</h2>
        <table className="w-full border-collapse">
          <thead><tr><th className={th}>Cake</th><th className={`${th} ${num}`}>Opening</th><th className={`${th} ${num}`}>Made</th><th className={`${th} ${num}`}>Sold</th><th className={`${th} ${num}`}>Other</th><th className={`${th} ${num}`}>Closing</th></tr></thead>
          <tbody>
            {data.cake.length === 0 && empty(6, 'No oil cake movement today.')}
            {data.cake.map((c) => (
              <tr key={c.key}>
                <td className={td}>{c.label}</td><td className={`${td} ${num}`}>{fmtQty(c.opening)}</td><td className={`${td} ${num}`}>{c.made ? fmtQty(c.made) : '-'}</td>
                <td className={`${td} ${num}`}>{c.sold ? fmtQty(c.sold) : '-'}</td><td className={`${td} ${num}`}>{c.other ? fmtQty(c.other) : '-'}</td>
                <td className={`${td} ${num} font-semibold`}>{fmtQty(c.closing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>}

      {counted.length > 0 && (
        <>
          <h2 className={h2}>7. Evening count</h2>
          <table className="w-full border-collapse">
            <thead><tr><th className={th}>Stock</th><th className={`${th} ${num}`}>Books say</th><th className={`${th} ${num}`}>Counted</th><th className={`${th} ${num}`}>Difference</th></tr></thead>
            <tbody>
              {counted.map((l) => (
                <tr key={l.key}>
                  <td className={td}>{l.label} ({l.unit})</td><td className={`${td} ${num}`}>{fmtQty(l.computed)}</td><td className={`${td} ${num}`}>{fmtQty(l.physical)}</td>
                  <td className={`${td} ${num} font-semibold`}>{(l.variance ?? 0) === 0 ? 'matches' : signed(l.variance ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {info?.note && <div className="mt-3 text-[11px]">Note: {info.note}</div>}

      <div className="mt-10 flex justify-between text-[12px]">
        <div className="w-56 border-t border-black pt-1">Supervisor{info?.supervisor ? `: ${info.supervisor}` : ''}</div>
        <div className="w-56 border-t border-black pt-1">Owner / manager</div>
      </div>
    </div>
  );
}

function BarrelRow({ b, oilLabel }: { b: MillDailyBarrel; oilLabel: string }) {
  return (
    <tr>
      <td className={td}>{b.label}</td><td className={td}>{oilLabel}</td><td className={td}>{STATUS_LABEL[b.status]}</td>
      <td className={`${td} ${num}`}>{fmtQty(b.openingL)}</td><td className={`${td} ${num}`}>{b.pressedL ? fmtQty(b.pressedL) : '-'}</td>
      <td className={`${td} ${num}`}>{b.outsourcedL ? fmtQty(b.outsourcedL) : '-'}</td><td className={`${td} ${num}`}>{b.transferredL ? fmtQty(b.transferredL) : '-'}</td>
      <td className={`${td} ${num}`}>{b.stickAdjustL ? signed(b.stickAdjustL) : '-'}</td>
      <td className={`${td} ${num} font-semibold`}>{fmtQty(b.closingL)}</td>
      <td className={td}>{b.reading ? `${fmtQty(b.reading.measuredL)} L (${signed(b.reading.varianceL)})` : '-'}</td>
    </tr>
  );
}
