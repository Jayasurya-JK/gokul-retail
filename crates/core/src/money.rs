//! Port of packages/data/src/money.ts. Same integer maths, same rounding as JavaScript's `Math.round`
//! (half toward +infinity). The shared fixtures in tests/fixtures/money_cases.json prove both agree.

use crate::types::{BillLine, BillTotals, GstSlab, ReturnPick};
use std::collections::BTreeMap;

/// `Math.round(n / d)` for d > 0, exactly, in integers.
pub fn round_div(n: i128, d: i128) -> i128 {
    (2 * n + d).div_euclid(2 * d)
}

/// `Math.floor(n / d)` for d > 0.
pub fn floor_div(n: i128, d: i128) -> i128 {
    n.div_euclid(d)
}

/// gross amount for rate (paise per unit) x qty (milli-units)
pub fn line_gross(rate: i64, qty: i64) -> i64 {
    round_div(rate as i128 * qty as i128, 1000) as i64
}

/// Re-derive a line's discount and amount from rate, qty and the requested discount.
pub fn recalc_line(l: &BillLine) -> BillLine {
    let gross = line_gross(l.rate, l.qty);
    let d = l.discount.min(gross);
    BillLine { discount: d, amount: gross - d, ..l.clone() }
}

/// A percent rate (5, 0.25, 12.5) as hundredths of a percent (500, 25, 1250), the integer all tax maths uses.
pub fn rate_bp(r: f64) -> i64 {
    (r * 100.0).round() as i64
}

/// The tax split of one bill line, in paise. `taxable + cgst + sgst + igst + cess` is the line's final amount.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LineTax {
    pub taxable: i64,
    pub cgst: i64,
    pub sgst: i64,
    pub igst: i64,
    pub cess: i64,
}

/// Split GST-inclusive line amounts into taxable value, GST and cess, and add them up per GST rate.
/// `lines` = (gst rate %, cess rate %, final amount after every discount). Prices include GST and cess, so
/// taxable = amount x 10000 / (10000 + rate bp + cess bp), cess = taxable x cess bp / 10000, and the GST is what is left:
/// the three always add back to the amount, to the paisa. Intra-state: CGST = SGST = half (the odd paisa goes to SGST).
/// Inter-state: IGST = the whole GST. The odd-paisa split is done on the running total of each rate, so the lines of one
/// rate add up to exactly the slab's CGST and SGST.
pub fn split_taxes(lines: &[(f64, f64, i64)], inter: bool) -> (Vec<LineTax>, Vec<GstSlab>) {
    let mut cum: BTreeMap<i64, i64> = BTreeMap::new(); // rate bp -> running GST
    let mut slab_map: BTreeMap<i64, GstSlab> = BTreeMap::new();
    let mut out = Vec::with_capacity(lines.len());
    for &(rate, cess_rate, fin) in lines {
        let (rb, cb) = (rate_bp(rate), rate_bp(cess_rate));
        let taxable = round_div(fin as i128 * 10000, 10000 + rb as i128 + cb as i128) as i64;
        let cess = if cb == 0 { 0 } else { round_div(taxable as i128 * cb as i128, 10000) as i64 };
        let gst = fin - taxable - cess;
        let before = *cum.get(&rb).unwrap_or(&0);
        let after = before + gst;
        cum.insert(rb, after);
        let (cgst, sgst, igst) = if inter {
            (0, 0, gst)
        } else {
            let c = floor_div(after as i128, 2) as i64 - floor_div(before as i128, 2) as i64;
            (c, gst - c, 0)
        };
        let slab = slab_map.entry(rb).or_insert(GstSlab { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 });
        slab.taxable += taxable;
        slab.cgst += cgst;
        slab.sgst += sgst;
        slab.igst += igst;
        slab.cess += cess;
        out.push(LineTax { taxable, cgst, sgst, igst, cess });
    }
    (out, slab_map.into_values().collect())
}

/// A home-delivery charge on a bill: amount in paise (GST inclusive) and its GST / cess percent.
#[derive(Debug, Clone, Copy)]
pub struct Delivery {
    pub amount: i64,
    pub gst_rate: f64,
    pub cess_rate: f64,
}

/// The whole bill: totals plus the tax split of every line (the item lines in order, then the delivery charge when there is one).
/// Bill-level discount is spread pro-rata over the item lines (remainder to the last) so GST slabs stay exact.
/// Round-off to a whole rupee when `round_to_rupee`. `inter` = inter-state supply (IGST instead of CGST + SGST).
pub fn compute_bill(lines: &[BillLine], bill_discount: i64, round_to_rupee: bool, inter: bool, delivery: Option<Delivery>) -> (BillTotals, Vec<LineTax>) {
    let gross_all: i64 = lines.iter().map(|l| line_gross(l.rate, l.qty)).sum();
    let line_net: Vec<i64> = lines.iter().map(|l| l.amount).collect();
    let net_sum: i64 = line_net.iter().sum();
    let bd = bill_discount.min(net_sum);
    let mut allocated: i64 = 0;
    let n = line_net.len();
    let finals: Vec<i64> = line_net
        .iter()
        .enumerate()
        .map(|(i, &net)| {
            let mut share = if net_sum == 0 { 0 } else { floor_div(bd as i128 * net as i128, net_sum as i128) as i64 };
            if i == n - 1 {
                share = bd - allocated;
            }
            allocated += share;
            net - share
        })
        .collect();

    let mut inputs: Vec<(f64, f64, i64)> = lines.iter().zip(finals.iter()).map(|(l, &f)| (l.gst_rate, l.cess_rate, f)).collect();
    let delivery = delivery.filter(|d| d.amount > 0);
    if let Some(d) = delivery {
        inputs.push((d.gst_rate, d.cess_rate, d.amount));
    }
    let (taxes, slabs) = split_taxes(&inputs, inter);

    let delivery_amt = delivery.map(|d| d.amount).unwrap_or(0);
    let before_round: i64 = finals.iter().sum::<i64>() + delivery_amt;
    let grand = if round_to_rupee { round_div(before_round as i128, 100) as i64 * 100 } else { before_round };
    let line_disc: i64 = lines.iter().map(|l| l.discount).sum();
    let totals = BillTotals {
        item_count: lines.len() as i64,
        qty_count: lines.iter().map(|l| l.qty).sum(),
        gross: gross_all + delivery_amt,
        discount: line_disc + bd,
        taxable: slabs.iter().map(|s| s.taxable).sum(),
        gst: slabs.iter().map(|s| s.cgst + s.sgst + s.igst).sum(),
        cess: slabs.iter().map(|s| s.cess).sum(),
        slabs,
        before_round,
        round_off: grand - before_round,
        grand,
    };
    (totals, taxes)
}

/// Intra-state bill totals without delivery (see `compute_bill`).
pub fn compute_totals(lines: &[BillLine], bill_discount: i64, round_to_rupee: bool) -> BillTotals {
    compute_bill(lines, bill_discount, round_to_rupee, false, None).0
}

/// Cash discount in paise: `bps` (percent x 100) of the net of the item lines (after item discounts), rounded to the paisa.
pub fn cash_discount(lines: &[BillLine], bps: i64) -> i64 {
    if bps <= 0 {
        return 0;
    }
    let net: i64 = lines.iter().map(|l| l.amount).sum();
    round_div(net as i128 * bps as i128, 10000) as i64
}

/// Totals for item lines plus an optional home-delivery charge (a separate taxable amount at `delivery_gst` percent; 0 = no GST).
/// With no delivery charge this is exactly `compute_totals`. Intra-state.
pub fn compute_totals_with_delivery(lines: &[BillLine], bill_discount: i64, round_to_rupee: bool, delivery: i64, delivery_gst: f64) -> BillTotals {
    let d = Delivery { amount: delivery, gst_rate: delivery_gst, cess_rate: 0.0 };
    compute_bill(lines, bill_discount, round_to_rupee, false, Some(d)).0
}

/// Port of `quoteReturn` (billops.ts): each returned line refunds its own (discounted) amount pro-rata,
/// plus its share of any bill-level discount, then GST is reversed with the same slab rules as a bill.
pub fn quote_return(
    bill_lines: &[BillLine],
    bill_discount_total: i64,
    picks: &[ReturnPick],
    round_to_rupee: bool,
    inter: bool,
) -> (Vec<BillLine>, BillTotals, Vec<LineTax>) {
    let mut lines: Vec<BillLine> = Vec::new();
    for p in picks {
        let Some(l) = usize::try_from(p.line_index).ok().and_then(|i| bill_lines.get(i)) else { continue };
        if p.qty <= 0 || l.qty <= 0 {
            continue;
        }
        let qty = p.qty.min(l.qty);
        let amount = if qty == l.qty { l.amount } else { round_div(l.amount as i128 * qty as i128, l.qty as i128) as i64 };
        let mut nl = l.clone();
        nl.qty = qty;
        nl.amount = amount;
        nl.discount = (line_gross(l.rate, qty) - amount).max(0);
        lines.push(nl);
    }
    let line_disc: i64 = bill_lines.iter().map(|l| l.discount).sum();
    let bill_disc = (bill_discount_total - line_disc).max(0);
    let bill_net: i64 = bill_lines.iter().map(|l| l.amount).sum();
    let ret_net: i64 = lines.iter().map(|l| l.amount).sum();
    let share = if bill_net > 0 { round_div(bill_disc as i128 * ret_net as i128, bill_net as i128) as i64 } else { 0 };
    let (totals, taxes) = if lines.is_empty() {
        // The TS version would index an empty array; an empty quote is simply all zero.
        (BillTotals::default(), vec![])
    } else {
        compute_bill(&lines, share, round_to_rupee, inter, None)
    };
    (lines, totals, taxes)
}
