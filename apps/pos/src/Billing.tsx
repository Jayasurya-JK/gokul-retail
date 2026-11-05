// Gokul POS billing screen — faithful to the POSBean/GoFrugal dense grid
// (billing.png v2). Money rules mirror `crates/core/src/billing.rs` (the tested
// source of truth) for the browser preview only; real save + DB is the next card.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./billing.css";

// ---------- Preview dummy items (the real list comes from the DB later) ----------
const ITEMS = [
  { code: "1001", barcode: "8901001000016", name: "Groundnut Oil 1 L", tamil: "கடலை எண்ணெய் 1 லி", rate: 28500, mrp: 29500, gstBp: 500, unit: "Pcs" },
  { code: "1002", barcode: "8901001000023", name: "Gingelly Oil 500 ml", tamil: "நல்லெண்ணெய் 500 மி.லி", rate: 34000, mrp: 35500, gstBp: 500, unit: "Pcs" },
  { code: "1003", barcode: "8901001000030", name: "Coconut Oil 1 L", tamil: "தேங்காய் எண்ணெய் 1 லி", rate: 32000, mrp: 34000, gstBp: 500, unit: "L" },
  { code: "1004", barcode: "8901001000047", name: "Groundnut Oil Cake", tamil: "கடலை பிண்ணாக்கு", rate: 4800, mrp: 5500, gstBp: 500, unit: "kg" },
  { code: "1005", barcode: "8901001000054", name: "Palm Jaggery 1 kg", tamil: "பனங்கருப்பட்டி 1 கி.கி", rate: 36000, mrp: 38000, gstBp: 500, unit: "kg" },
  { code: "1006", barcode: "8901001000061", name: "Castor Oil 200 ml", tamil: "விளக்கெண்ணெய் 200 மி.லி", rate: 9450, mrp: 10500, gstBp: 500, unit: "Pcs" },
] as const;

type Item = (typeof ITEMS)[number];

interface Line {
  item: Item;
  qty: number;
  disc: number; // line discount, paise
}

// ---------- Preview money mirrors of crates/core/src/billing.rs ----------
function roundHalfUp(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d));
}
function splitTax(amount: number, gstBp: number) {
  const taxable = roundHalfUp(amount * 10000, 10000 + gstBp);
  const tax = amount - taxable;
  const cgst = Math.floor((tax + 1) / 2); // odd paisa to CGST
  return { taxable, cgst, sgst: tax - cgst };
}
function roundOffRupee(subtotal: number) {
  const rem = ((subtotal % 100) + 100) % 100;
  const net = subtotal - rem + (rem >= 50 ? 100 : 0);
  return { net, roundOff: net - subtotal };
}
function money(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function moneyNoRs(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function qty3(q: number): string {
  return q.toFixed(3);
}

function lineCalc(l: Line) {
  const gross = Math.round(l.item.rate * l.qty);
  const disc = l.disc;
  const net = gross - disc;
  const s = splitTax(net, l.item.gstBp);
  return { gross, disc, taxable: s.taxable, gstAmt: net - s.taxable, net };
}

const today = new Date();
const DATE_STR = today.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
const TIME_STR = today.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

export function Billing() {
  const [lines, setLines] = useState<Line[]>(() => [
    { item: ITEMS[0], qty: 2, disc: 0 },
    { item: ITEMS[1], qty: 1, disc: 0 },
    { item: ITEMS[2], qty: 0.75, disc: 0 },
    { item: ITEMS[3], qty: 2, disc: 0 },
    { item: ITEMS[4], qty: 0.5, disc: 0 },
    { item: ITEMS[5], qty: 1, disc: 0 },
  ]);
  const [scan, setScan] = useState("");
  const [qty, setQty] = useState("1");
  const [received, setReceived] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [sel, setSel] = useState<number>(0);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  const matched = useMemo(() => {
    const q = scan.trim();
    if (!q) return null;
    return (
      ITEMS.find((i) => i.barcode === q || i.code === q) ??
      ITEMS.find((i) => i.name.toLowerCase().startsWith(q.toLowerCase()) || i.tamil.startsWith(q)) ??
      null
    );
  }, [scan]);

  const qtyNum = parseFloat(qty) || 0;
  const entryAmount = matched ? Math.round(matched.rate * qtyNum) : 0;

  const add = useCallback(() => {
    if (!matched) {
      setMessage(`Not found: ${scan.trim()}. Press F2 to search.`);
      setScan("");
      return;
    }
    const q = qtyNum > 0 ? qtyNum : 1;
    setLines((prev) => {
      if (prev.some((l) => l.item.code === matched.code)) {
        return prev.map((l) => (l.item.code === matched.code ? { ...l, qty: l.qty + q } : l));
      }
      return [...prev, { item: matched, qty: q, disc: 0 }];
    });
    setMessage(null);
    setSaved(false);
    setScan("");
    setQty("1");
  }, [matched, qtyNum, scan]);

  const rows = useMemo(() => lines.map(lineCalc), [lines]);

  const totals = useMemo(() => {
    let gross = 0;
    let disc = 0;
    let taxable = 0;
    let gstAmt = 0;
    let qty = 0;
    for (const r of rows) {
      gross += r.gross;
      disc += r.disc;
      taxable += r.taxable;
      gstAmt += r.gstAmt;
    }
    for (const l of lines) qty += l.qty;
    const subtotal = gross - disc;
    const cgst = Math.floor((gstAmt + 1) / 2);
    const sgst = gstAmt - cgst;
    const { net, roundOff } = roundOffRupee(subtotal);
    return { gross, disc, taxable, gstAmt, cgst, sgst, roundOff, net, qty, items: lines.length };
  }, [rows, lines]);

  const receivedPaise = Math.round((parseFloat(received) || 0) * 100);
  const balance = receivedPaise - totals.net;
  const canPay = lines.length > 0 && balance >= 0;

  const pay = useCallback(() => {
    if (!canPay) return;
    setSaved(true);
    setLines([]);
    setReceived("");
    setScan("");
    setMessage(null);
  }, [canPay]);

  const onScanKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") add();
    else if (e.key === "F10") {
      e.preventDefault();
      pay();
    } else if (e.key === "Escape") {
      setScan("");
      setMessage(null);
    }
  };

  return (
    <div className="posb">
      <header className="posb-topbar">
        <b>Gokul POS - Sales Billing</b>
        <span>Gokul Oils, Salem&nbsp; | &nbsp;Counter 1&nbsp; | &nbsp;Cashier: Ravi Kumar&nbsp; | &nbsp;Fri {DATE_STR} {TIME_STR}</span>
      </header>

      <div className="posb-fields">
        <div className="posb-fields-grid">
          <div className="posb-flabel">Bill No</div>
          <div className="posb-finput ro">GK/25-26/000124</div>
          <div className="posb-flabel">Date</div>
          <div className="posb-finput">{DATE_STR}</div>
          <div className="posb-flabel">Bill Type</div>
          <div className="posb-finput">Cash</div>
          <div className="posb-flabel">Price List</div>
          <div className="posb-finput">Retail</div>

          <div className="posb-flabel">Customer Mobile</div>
          <div className="posb-finput">9876543210</div>
          <div className="posb-flabel">Customer Name</div>
          <div className="posb-finput">Murugan S</div>
          <div className="posb-flabel">Salesman</div>
          <div className="posb-finput">Ravi</div>
          <div className="posb-flabel">Points</div>
          <div className="posb-finput ro" style={{ textAlign: "right" }}>120</div>
        </div>
        <div className="posb-fstatus">
          <div><span className="l">Mode</span><span className="mode">Sale - new bill</span></div>
          <div><span className="l">Next step</span><span>Scan or type code, then Enter</span></div>
        </div>
      </div>

      <div className="posb-entry">
        <div className="posb-e posb-e-scan">
          <div className="posb-e-label" style={{ color: "#0B5CAD", fontWeight: 600 }}>Barcode / Item code</div>
          <input
            ref={scanRef}
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={onScanKey}
            placeholder="8901..."
            autoComplete="off"
            spellCheck={false}
            aria-label="Barcode or item code"
          />
        </div>
        <div className="posb-e posb-e-name">
          <div className="posb-e-label">Item name (lookup <b>F2</b>)</div>
          <input readOnly value={matched ? `${matched.name}  ${matched.tamil}` : ""} />
        </div>
        <div className="posb-e posb-e-num">
          <div className="posb-e-label right">Qty</div>
          <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" />
        </div>
        <div className="posb-e posb-e-uom">
          <div className="posb-e-label">UOM</div>
          <input readOnly value={matched?.unit ?? ""} />
        </div>
        <div className="posb-e posb-e-num">
          <div className="posb-e-label right">MRP</div>
          <input readOnly value={matched ? moneyNoRs(matched.mrp) : ""} />
        </div>
        <div className="posb-e posb-e-num">
          <div className="posb-e-label right">Rate</div>
          <input readOnly value={matched ? moneyNoRs(matched.rate) : ""} />
        </div>
        <div className="posb-e posb-e-gst">
          <div className="posb-e-label right">Disc%</div>
          <input readOnly value="0" />
        </div>
        <div className="posb-e posb-e-gst">
          <div className="posb-e-label right">GST%</div>
          <input readOnly value={matched ? Math.round(matched.gstBp / 100) : ""} />
        </div>
        <div className="posb-e posb-e-amt">
          <div className="posb-e-label right">Amount</div>
          <input readOnly value={matched ? moneyNoRs(entryAmount) : ""} />
        </div>
        <button type="button" className="posb-e-add" onClick={add}>
          Add <kbd>Enter</kbd>
        </button>
      </div>

      {message ? (
        <div className="posb-msg posb-msg-err" role="alert">! {message}</div>
      ) : null}
      {saved ? (
        <div className="posb-msg posb-msg-ok" role="status">Bill GK/25-26/000124 saved · Receipt sent to the printer</div>
      ) : null}

      <div className="posb-body">
        <div className="posb-gridwrap">
          <div className="posb-gridscroll">
            <table className="posb-grid">
              <colgroup>
                <col style={{ width: 38 }} /><col style={{ width: 62 }} /><col /><col style={{ width: 150 }} />
                <col style={{ width: 62 }} /><col style={{ width: 44 }} /><col style={{ width: 68 }} />
                <col style={{ width: 68 }} /><col style={{ width: 56 }} /><col style={{ width: 80 }} />
                <col style={{ width: 46 }} /><col style={{ width: 68 }} /><col style={{ width: 86 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="c">S.No</th><th>Code</th><th>Item Name</th><th>தமிழ் பெயர்</th>
                  <th className="r">Qty</th><th>UOM</th><th className="r">MRP</th><th className="r">Rate</th>
                  <th className="r">Disc</th><th className="r">Taxable</th><th className="r">GST%</th>
                  <th className="r">GST Amt</th><th className="r">Net Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const r = lineCalc(l);
                  return (
                    <tr key={l.item.code} className={sel === i ? "sel" : ""} onClick={() => setSel(i)}>
                      <td className="c no">{i + 1}</td>
                      <td>{l.item.code}</td>
                      <td>{l.item.name}</td>
                      <td className="tamil">{l.item.tamil}</td>
                      <td className="r">{qty3(l.qty)}</td>
                      <td>{l.item.unit}</td>
                      <td className="r">{moneyNoRs(l.item.mrp)}</td>
                      <td className="r">{moneyNoRs(l.item.rate)}</td>
                      <td className="r">{moneyNoRs(r.disc)}</td>
                      <td className="r">{moneyNoRs(r.taxable)}</td>
                      <td className="r">{Math.round(l.item.gstBp / 100)}</td>
                      <td className="r">{moneyNoRs(r.gstAmt)}</td>
                      <td className="r net">{moneyNoRs(r.net)}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 ? (
                  <tr><td colSpan={13} className="posb-empty">Scan a barcode or type a name and press Enter to start the bill.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <table className="posb-totals">
            <colgroup>
              <col style={{ width: 38 }} /><col style={{ width: 62 }} /><col /><col style={{ width: 150 }} />
              <col style={{ width: 62 }} /><col style={{ width: 44 }} /><col style={{ width: 68 }} />
              <col style={{ width: 68 }} /><col style={{ width: 56 }} /><col style={{ width: 80 }} />
              <col style={{ width: 46 }} /><col style={{ width: 68 }} /><col style={{ width: 86 }} />
            </colgroup>
            <tr>
              <td colSpan={4}>Total&nbsp; <span style={{ fontWeight: 400, color: "#4A5560", fontSize: 12 }}>{totals.items} items</span></td>
              <td className="r">{qty3(totals.qty)}</td>
              <td colSpan={3}></td>
              <td className="r">{moneyNoRs(totals.disc)}</td>
              <td className="r">{moneyNoRs(totals.taxable)}</td>
              <td></td>
              <td className="r">{moneyNoRs(totals.gstAmt)}</td>
              <td className="r">{moneyNoRs(totals.net - totals.roundOff)}</td>
            </tr>
          </table>
        </div>

        <aside className="posb-right">
          <div className="posb-summary">
            <div className="posb-summary-head">Bill summary</div>
            <div className="posb-sv"><span>Items</span><b>{totals.items}</b></div>
            <div className="posb-sv"><span>Total Qty</span><b>{qty3(totals.qty)}</b></div>
            <div className="posb-sv"><span>Gross</span><b>{moneyNoRs(totals.gross)}</b></div>
            <div className="posb-sv"><span>Discount</span><b>- {moneyNoRs(totals.disc)}</b></div>
            <div className="posb-sv"><span>Taxable value</span><b>{moneyNoRs(totals.taxable)}</b></div>
            <div className="posb-sv"><span>CGST 2.5%</span><b>{moneyNoRs(totals.cgst)}</b></div>
            <div className="posb-sv"><span>SGST 2.5%</span><b>{moneyNoRs(totals.sgst)}</b></div>
            <div className="posb-sv"><span>Round off</span><b>{totals.roundOff >= 0 ? "+ " : "- "}{moneyNoRs(Math.abs(totals.roundOff))}</b></div>
          </div>

          <div className="posb-net">
            <div className="posb-net-label"><span>Net amount</span><span>{totals.items} items</span></div>
            <div className="posb-net-amt">{money(totals.net)}</div>
          </div>

          <div className="posb-received">
            <div className="posb-recv-row">
              <span>Received</span>
              <input value={received} onChange={(e) => setReceived(e.target.value)} inputMode="decimal" placeholder="0.00" />
            </div>
            <div className="posb-recv-row">
              <span>Balance to return</span>
              <div className={"posb-recv-val" + (balance >= 0 ? " green" : "")}>{moneyNoRs(Math.abs(balance))}</div>
            </div>
            <button type="button" className="posb-pay" disabled={!canPay} onClick={pay}>
              Pay / Save <kbd>F10</kbd>
            </button>
          </div>

          <div className="posb-lastbill"><span>Last bill: <b style={{ color: "#1F2933" }}>GK/25-26/000123</b></span><b>₹ 760.00</b></div>
        </aside>
      </div>
    </div>
  );
}
