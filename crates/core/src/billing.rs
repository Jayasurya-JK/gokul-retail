//! Billing money maths — spec 03, step 1. Pure functions, no database access.
//!
//! Every amount is integer paise. Retail prices are GST-inclusive. GST and
//! discount percentages are in basis points (100 == 1%, 500 == 5%, 10000 == 100%).
//! Quantity × rate is computed by the units layer (spec 00); this module receives
//! the resulting inclusive line amounts and applies only the money rules.

use crate::error::{Error, Result};

/// GST rate in basis points: 500 == 5%, 1200 == 12%, 0 == exempt.
pub type GstBp = i64;

/// A discount: a percentage (basis points) or an absolute paise amount.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Discount {
    /// Percentage in basis points (500 == 5%).
    Percent(i64),
    /// Absolute paise.
    Amount(i64),
}

/// How the bill total is rounded. Shown as its own line on the bill.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoundOff {
    None,
    /// Round to the nearest 0.50 rupee (50 paise).
    HalfRupee,
    /// Round to the nearest rupee (100 paise).
    Rupee,
}

/// Per-line GST breakdown of one inclusive amount.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TaxSplit {
    pub taxable: i64,
    pub tax: i64,
    pub cgst: i64,
    pub sgst: i64,
}

/// One bill line as handed to the money layer (line discount already applied).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LineInput {
    pub item_id: i64,
    /// Inclusive paise for the line, quantity × rate, before bill discount.
    pub gross: i64,
    pub gst_bp: GstBp,
}

/// One bill line after money computation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ComputedLine {
    pub item_id: i64,
    /// Final inclusive paise (after line and bill discount).
    pub gross: i64,
    pub taxable: i64,
    pub cgst: i64,
    pub sgst: i64,
}

/// A complete bill total. `net` equals the sum of every line, plus `round_off`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BillTotals {
    pub subtotal: i64,
    pub taxable: i64,
    pub cgst: i64,
    pub sgst: i64,
    /// Signed paise added to reach `net` (the "Round off" line).
    pub round_off: i64,
    pub net: i64,
    pub lines: Vec<ComputedLine>,
}

/// Round `n / d` half-up for non-negative `n` and positive `d`. One documented
/// rule for every rounding in this module.
fn round_half_up(n: i64, d: i64) -> i64 {
    (2 * n + d) / (2 * d)
}

/// How much paise a discount removes from `base`, checked against the base.
fn discount_value(base: i64, d: Discount) -> Result<i64> {
    match d {
        Discount::Amount(a) => {
            if a < 0 {
                return Err(Error::Billing("discount cannot be negative".into()));
            }
            if a > base {
                return Err(Error::Billing("discount is more than the amount".into()));
            }
            Ok(a)
        }
        Discount::Percent(bp) => {
            if !(0..=10000).contains(&bp) {
                return Err(Error::Billing(
                    "discount percent must be between 0 and 100".into(),
                ));
            }
            Ok(round_half_up(base * bp, 10000))
        }
    }
}

/// Apply a line discount to an inclusive amount and return what is left.
pub fn apply_discount(base: i64, d: Discount) -> Result<i64> {
    if base < 0 {
        return Err(Error::Billing("amount cannot be negative".into()));
    }
    Ok(base - discount_value(base, d)?)
}

/// Split one GST-inclusive amount into taxable / CGST / SGST.
///
/// `taxable = round_half_up(amount × 10000 / (10000 + gst_bp))`; `tax = amount -
/// taxable`; CGST and SGST are equal, with the odd paisa going to CGST.
pub fn split_tax(amount_incl: i64, gst_bp: GstBp) -> Result<TaxSplit> {
    if amount_incl < 0 {
        return Err(Error::Billing("amount cannot be negative".into()));
    }
    if gst_bp < 0 {
        return Err(Error::Billing("GST rate cannot be negative".into()));
    }
    let taxable = round_half_up(amount_incl * 10000, 10000 + gst_bp);
    let tax = amount_incl - taxable;
    let cgst = (tax + 1) / 2; // odd paisa to CGST
    let sgst = tax - cgst;
    Ok(TaxSplit {
        taxable,
        tax,
        cgst,
        sgst,
    })
}

/// Spread a bill-level discount over inclusive line amounts pro-rata for GST,
/// remainder to the largest line. Each returned amount stays within `0..=gross`
/// and the returned amounts sum to `sum(grosses) - discount_value`.
pub fn spread_bill_discount(grosses: &[i64], d: Discount) -> Result<Vec<i64>> {
    let n = grosses.len();
    if n == 0 {
        return Ok(Vec::new());
    }
    let sum: i64 = grosses.iter().sum();
    if sum < 0 {
        return Err(Error::Billing("bill amount cannot be negative".into()));
    }
    if sum == 0 {
        return Ok(grosses.to_vec());
    }
    let total_off = discount_value(sum, d)?;

    // Round each line's share half-up, then reconcile the leftover (± a few paise)
    // one paisa at a time over the largest lines first.
    let mut offs: Vec<i64> = grosses
        .iter()
        .map(|&g| round_half_up(g * total_off, sum))
        .collect();
    let mut delta = total_off - offs.iter().sum::<i64>();
    if delta != 0 {
        let mut order: Vec<usize> = (0..n).collect();
        order.sort_unstable_by_key(|&i| std::cmp::Reverse(grosses[i]));
        let mut pass = 0;
        while delta != 0 && pass < 2 {
            for &idx in &order {
                if delta == 0 {
                    break;
                }
                if delta > 0 {
                    if offs[idx] < grosses[idx] {
                        offs[idx] += 1;
                        delta -= 1;
                    }
                } else if offs[idx] > 0 {
                    offs[idx] -= 1;
                    delta += 1;
                }
            }
            pass += 1;
        }
        debug_assert_eq!(delta, 0, "discount spread did not reconcile");
    }

    Ok(grosses.iter().zip(offs).map(|(&g, o)| g - o).collect())
}

/// Round a subtotal to the chosen increment. Returns `(net, round_off)` where
/// `round_off` is the signed amount added (the "Round off" line).
pub fn round_off_total(subtotal: i64, mode: RoundOff) -> (i64, i64) {
    let unit = match mode {
        RoundOff::None => return (subtotal, 0),
        RoundOff::HalfRupee => 50,
        RoundOff::Rupee => 100,
    };
    let rem = subtotal.rem_euclid(unit);
    let rounded = subtotal - rem + if rem * 2 >= unit { unit } else { 0 };
    (rounded, rounded - subtotal)
}

/// Enforce the MRP cap: a sale rate may never exceed the item's MRP.
pub fn check_rate_vs_mrp(rate: i64, mrp: Option<i64>) -> Result<()> {
    if rate < 0 {
        return Err(Error::Billing("rate cannot be negative".into()));
    }
    if let Some(mrp) = mrp {
        if mrp < 0 {
            return Err(Error::Billing("MRP cannot be negative".into()));
        }
        if rate > mrp {
            return Err(Error::Billing("sale rate cannot be more than MRP".into()));
        }
    }
    Ok(())
}

/// Compute every line and the totals for a bill: bill discount spread, per-line
/// GST split, sums, then round-off.
pub fn compute_bill(
    lines: &[LineInput],
    bill_discount: Option<Discount>,
    round: RoundOff,
) -> Result<BillTotals> {
    let grosses: Vec<i64> = lines.iter().map(|l| l.gross).collect();
    let final_grosses = match bill_discount {
        Some(d) => spread_bill_discount(&grosses, d)?,
        None => grosses.clone(),
    };

    let mut subtotal = 0i64;
    let mut taxable = 0i64;
    let mut cgst = 0i64;
    let mut sgst = 0i64;
    let mut computed = Vec::with_capacity(lines.len());
    for (line, &fg) in lines.iter().zip(&final_grosses) {
        let split = split_tax(fg, line.gst_bp)?;
        subtotal += fg;
        taxable += split.taxable;
        cgst += split.cgst;
        sgst += split.sgst;
        computed.push(ComputedLine {
            item_id: line.item_id,
            gross: fg,
            taxable: split.taxable,
            cgst: split.cgst,
            sgst: split.sgst,
        });
    }

    let (net, round_off) = round_off_total(subtotal, round);
    Ok(BillTotals {
        subtotal,
        taxable,
        cgst,
        sgst,
        round_off,
        net,
        lines: computed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // Deterministic PRNG for property checks (no extra dependency).
    fn xorshift(state: &mut u64) -> u64 {
        let mut x = *state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        *state = x;
        x
    }

    fn amount(state: &mut u64) -> i64 {
        (xorshift(state) % 2_000_000) as i64 // up to ₹20,000
    }

    fn gst(state: &mut u64) -> GstBp {
        const RATES: [i64; 5] = [0, 500, 1200, 1800, 2800];
        RATES[(xorshift(state) as usize) % RATES.len()]
    }

    #[test]
    fn five_percent_on_one_hundred_rupees() {
        let s = split_tax(10000, 500).unwrap();
        assert_eq!(s.taxable, 9524);
        assert_eq!(s.tax, 476);
        assert_eq!(s.cgst, 238);
        assert_eq!(s.sgst, 238);
        assert_eq!(s.taxable + s.tax, 10000);
    }

    #[test]
    fn eighteen_percent_splits_with_odd_paisa_to_cgst() {
        let s = split_tax(10000, 1800).unwrap();
        assert_eq!(s.taxable, 8475);
        assert_eq!(s.tax, 1525);
        assert_eq!(s.cgst, 763);
        assert_eq!(s.sgst, 762);
        assert_eq!(s.cgst + s.sgst, s.tax);
    }

    #[test]
    fn exempt_item_has_no_tax() {
        let s = split_tax(9999, 0).unwrap();
        assert_eq!(s.taxable, 9999);
        assert_eq!(s.tax, 0);
        assert_eq!(s.cgst, 0);
        assert_eq!(s.sgst, 0);
    }

    #[test]
    fn property_invariants_hold_for_random_amounts_and_rates() {
        let mut state = 0x2545F4914F6CDD1Du64;
        for _ in 0..10_000 {
            let a = amount(&mut state);
            let g = gst(&mut state);
            let s = split_tax(a, g).unwrap();
            assert_eq!(s.taxable + s.tax, a, "taxable + tax must equal the amount");
            assert_eq!(s.cgst + s.sgst, s.tax, "cgst + sgst must equal the tax");
            assert!(
                s.cgst == s.sgst || s.cgst == s.sgst + 1,
                "the odd paisa must go to CGST"
            );
            assert!(s.taxable >= 0 && s.cgst >= 0 && s.sgst >= 0);
        }
    }

    #[test]
    fn line_discount_percent_and_amount() {
        assert_eq!(
            apply_discount(10000, Discount::Percent(1000)).unwrap(),
            9000
        ); // 10%
        assert_eq!(apply_discount(10000, Discount::Amount(250)).unwrap(), 9750);
        assert_eq!(apply_discount(10000, Discount::Amount(10000)).unwrap(), 0);
    }

    #[test]
    fn invalid_discounts_are_rejected() {
        assert!(apply_discount(10000, Discount::Percent(10001)).is_err());
        assert!(apply_discount(10000, Discount::Percent(-1)).is_err());
        assert!(apply_discount(10000, Discount::Amount(-1)).is_err());
        assert!(apply_discount(10000, Discount::Amount(10001)).is_err());
        assert!(apply_discount(-5, Discount::Amount(0)).is_err());
    }

    #[test]
    fn bill_discount_spreads_pro_rata() {
        // 10% off ₹100 split evenly between two ₹50 lines.
        let out = spread_bill_discount(&[5000, 5000], Discount::Percent(1000)).unwrap();
        assert_eq!(out, vec![4500, 4500]);

        // ₹10 off ₹70/₹30 goes 7/3.
        let out = spread_bill_discount(&[7000, 3000], Discount::Amount(1000)).unwrap();
        assert_eq!(out, vec![6300, 2700]);
    }

    #[test]
    fn bill_discount_remainder_goes_to_largest_line() {
        // ₹0.01 off three equal ₹1 lines: 0, 0, then the leftover to the largest.
        let out = spread_bill_discount(&[100, 100, 100], Discount::Amount(1)).unwrap();
        assert_eq!(out.iter().sum::<i64>(), 299);
        assert_eq!(out.iter().filter(|&&g| g == 99).count(), 1);
    }

    #[test]
    fn bill_discount_never_goes_negative_and_sums_exactly() {
        let mut state = 0xDEADBEEFCAFEF00Du64;
        for _ in 0..2_000 {
            let a = amount(&mut state);
            let b = amount(&mut state);
            let c = amount(&mut state);
            let grosses = vec![a, b, c];
            let sum: i64 = grosses.iter().sum();
            let out = spread_bill_discount(&grosses, Discount::Percent(1500)).unwrap();
            assert!(out.iter().all(|&g| g >= 0));
            assert_eq!(
                out.iter().sum::<i64>() + round_half_up(sum * 1500, 10000),
                sum
            );
        }
    }

    #[test]
    fn round_off_modes() {
        assert_eq!(round_off_total(152050, RoundOff::None), (152050, 0));
        assert_eq!(round_off_total(152050, RoundOff::Rupee), (152100, 50));
        assert_eq!(round_off_total(152024, RoundOff::Rupee), (152000, -24));
        assert_eq!(round_off_total(152025, RoundOff::HalfRupee), (152050, 25));
        assert_eq!(round_off_total(152000, RoundOff::HalfRupee), (152000, 0));
    }

    #[test]
    fn mrp_cap_is_enforced() {
        assert!(check_rate_vs_mrp(28500, Some(28500)).is_ok());
        assert!(check_rate_vs_mrp(28501, Some(28500)).is_err());
        assert!(check_rate_vs_mrp(28500, None).is_ok());
        assert!(check_rate_vs_mrp(-1, None).is_err());
    }

    #[test]
    fn full_bill_totals_match_a_hand_calculation() {
        // Groundnut oil 1 L × 2 @ ₹285 = 570.00, Gingelly 500 ml @ ₹340 = 340.00.
        let lines = vec![
            LineInput {
                item_id: 1,
                gross: 57000,
                gst_bp: 500,
            },
            LineInput {
                item_id: 2,
                gross: 34000,
                gst_bp: 500,
            },
        ];
        let t = compute_bill(&lines, None, RoundOff::Rupee).unwrap();
        assert_eq!(t.subtotal, 91000);
        assert_eq!(t.taxable, 86667); // 57000*10000/10500=54286, 34000*...=32381
        assert_eq!(t.cgst, 2167);
        assert_eq!(t.sgst, 2166);
        assert_eq!(t.net, 91000);
        assert_eq!(t.round_off, 0);
        assert_eq!(t.lines.len(), 2);
        // Every line still reconciles.
        for (line, split) in lines.iter().zip(&t.lines) {
            let s = split_tax(split.gross, line.gst_bp).unwrap();
            assert_eq!(
                s,
                TaxSplit {
                    taxable: split.taxable,
                    tax: split.cgst + split.sgst,
                    cgst: split.cgst,
                    sgst: split.sgst,
                }
            );
        }
    }

    #[test]
    fn full_bill_applies_bill_discount_before_rounding() {
        let lines = vec![
            LineInput {
                item_id: 1,
                gross: 70000,
                gst_bp: 500,
            },
            LineInput {
                item_id: 2,
                gross: 30000,
                gst_bp: 500,
            },
        ];
        // ₹10 off the ₹1000 bill (₹700 + ₹300), then round to the rupee.
        let t = compute_bill(&lines, Some(Discount::Amount(1000)), RoundOff::Rupee).unwrap();
        assert_eq!(t.subtotal, 99000);
        assert_eq!(t.net, 99000);
        assert_eq!(t.round_off, 0);
    }
}
