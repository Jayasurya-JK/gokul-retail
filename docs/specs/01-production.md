# Spec 01 - Pressing / production

Status: DRAFT - needs owner answers below before build.

## User steps
1. **Seed purchase** (simple form until full purchases module): seed item, supplier name, kg, total price -> ledger +kg, records cost per kg.
2. **Start pressing batch**: machine, seed item, seed kg taken, operator. Seed stock goes down at start.
3. **Close batch**: oil litres out (into which bulk tank item), oil cake kg out, waste/foots kg. Stock goes up for oil and cake.
4. Optional costs on the batch: labour, electricity, other (entered or from default per-batch rates in Settings).

## Calculations (Rust core, unit tested)
- Yield % = oil ml out x density / seed g in (shown as oil kg per 100 kg seed, and litres per kg).
- Batch cost = seed cost (weighted average cost per kg at the time) + labour + power + other.
- Cost per litre of oil = batch cost minus oil cake value (at its sale price, setting on/off) divided by litres out.
- Mass check: oil kg + cake kg + waste kg should be within +-5% (setting) of seed kg; outside -> warning, owner can still approve with a note.

## Tables (migration 002)
`machines`, `suppliers` (minimal), `production_batches` (id, machine_id, seed_item_id, seed_g, oil_item_id, oil_ml, cake_item_id, cake_g, waste_g, labour_paise, power_paise, other_paise, cost_paise, status open|closed|cancelled, operator, started_at, closed_at, note). Stock movements via `post_stock` with ref_type `production`.

## Reports
Yield per batch, per machine, per seed, per day/month. Cost per litre trend.

## Edge cases to test
Batch left open overnight; cancel an open batch (seed returns); oil out = 0; seed stock not enough (block or allow per setting); two machines pressing the same seed at once; decimal kg entry (12.5 kg).

## Questions for owner
1. Do you press oil yourself? How many chekku machines?
2. Which seeds: groundnut, sesame (ellu), copra, others? Do you also buy ready oil to sell?
3. One batch = one machine run? Roughly how many kg per batch, how many batches a day?
4. Do you track labour and electricity per batch, or per day?
5. Do you sell oil cake (punnakku)? At what price per kg?
