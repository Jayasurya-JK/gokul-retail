# Spec 02 - Loose oil and packing

Status: DRAFT - needs owner answers below before build.

## Concepts
- **Bulk oil item** (e.g. "Groundnut oil - tank"): stock in ml. Filled by production (spec 01) or purchase.
- **Packed item** (e.g. "Groundnut oil 500 ml bottle"): stock in pcs, linked to its bulk oil + fill ml + packing materials (bottle, cap, label).
- **Loose item**: sold straight from the bulk item by ml.
- **Packing material**: bottles, caps, tins, labels, cartons in pcs.

## User steps
1. **Packing run**: pick packed item, number of pieces -> bulk oil down by pieces x fill ml (+ optional spill allowance), packing materials down, packed stock up. One transaction.
2. **Unpack / repack** (rare): broken bottle back to bulk or to wastage.
3. **Loose sale entry** (used by billing later): enter quantity ("1.5 L", "750 ml", "2 kg") or amount ("Rs 200"); system converts using price per litre and density. Customer's own can = no packing material used.
4. **Leakage / spill entry**: ml lost with reason.
5. **Tank dip check**: enter actual measured tank quantity -> difference shown -> owner approves adjustment (this is how leakage is found).

## Calculations (Rust core, unit tested)
- Amount -> quantity: ml = floor(amount_paise x 1000 / price_per_litre_paise); show the rounding rule clearly, tested.
- kg -> ml via density (mg per ml). All integer maths.
- Cost per packed piece = fill ml x bulk cost per ml + packing material costs.
- Monthly loss % = (spill + dip adjustments) / bulk ml sold.

## Tables (migration 003)
`pack_recipes` (packed_item_id, bulk_item_id, fill_ml, spill_ml), `pack_recipe_materials` (packed_item_id, material_item_id, qty_pcs), `packing_runs` (id, packed_item_id, pieces, bulk_ml_used, user_id, created_at, note), `dip_checks`. Stock via `post_stock` with ref_type `packing` / `loss` / `dip`.

## Edge cases to test
Not enough bulk oil or bottles for the run; amount that gives fractional ml; packing run cancelled; same bottle type used by two oils; tank dip higher than system stock.

## Questions for owner
1. Which pack sizes per oil (200 ml, 500 ml, 1 L, 5 L tin, 15 kg tin)? Bottles or pouches?
2. Do you sell loose oil by litre, by kg, or both? Do customers bring their own cans?
3. How do you measure loose oil today - measuring jug, weighing scale, or pump meter?
4. Do you keep stock of empty bottles, caps and labels, or buy as needed?
