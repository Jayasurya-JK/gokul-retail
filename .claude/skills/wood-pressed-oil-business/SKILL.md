---
name: wood-pressed-oil-business
description: Domain knowledge of a Tamil Nadu wood-pressed (Marachekku / chekku) oil business like Gokul Oils - seeds, pressing batches, yield, settling, barrels, loose sales into customer containers, bottling, oil cake (punnakku), wastage, seasons, FSSAI and Legal Metrology rules. Use this whenever writing or reviewing a spec, screen, report, test data or default setting that touches production, stock, units, loose oil, packing, labels, pricing or anything an oil shop owner would judge - even if the task only says "stock" or "items".
---

# Wood-pressed oil business (Gokul Oils)

Think like an experienced chekku oil shop owner who also presses oil. The software must match how the shop really works, or staff will go back to the notebook.

**Facts marked (verify) are typical industry values, not Gokul Oils' own numbers.** Put them in Settings as editable defaults, never hard-code them, and ask the owner for the real figure.

## How the business runs
1. **Buy seed**: groundnut kernels (verkadalai), sesame (ellu / gingelly), copra (dried coconut), sometimes others. Bought by the kg/quintal from traders or farmers; price swings with harvest (groundnut harvest Oct-Dec and Mar-Apr (verify)). Seed is cleaned before pressing - stones, dust and bad seeds are a real loss (1-3% (verify)).
2. **Press in the chekku**: a wooden pestle (often vaagai wood) turns slowly in a mortar, low heat. One run = one batch of a fixed seed load (often 10-15 kg (verify)), about an hour. Sesame is traditionally pressed with palm jaggery (karupatti) added - that jaggery is a batch input with cost.
3. **Outputs**: raw oil + oil cake (punnakku). Rough wood-press norms (verify, measure per machine): about 2.5 kg groundnut per litre oil, 2.5-3 kg sesame per litre, about 1.6 kg copra per litre. Oil cake is roughly the rest of the seed weight and is sold as cattle feed.
4. **Settle and filter**: raw oil rests for days; sediment (kasadu / foots) settles and is removed. Clear oil quantity is less than raw - the software should record raw out, settle, then clear oil in, so the loss is visible.
5. **Store**: clear oil goes into 200 L barrels with a tap (Gokul Oils). One oil per barrel is normal.
6. **Sell**:
   - **Loose**: staff fill a measuring can (1 L, 1/2 L...) from the tap and pour into the customer's own container. Customers ask by litre or by money ("₹200 worth").
   - **Bottled**: filled from the barrel into bottles (e.g. 500 ml, 1 L) with cap and label, or bought pre-packed.
   - **Bulk**: hotels, sweet shops, resellers buy in tins (e.g. 15 L / 15 kg (verify)) and often on credit.
7. **By-products**: oil cake sold by the kg; sediment sometimes sold cheap or discarded.

## Units and conversions
- Oil is sold by volume at the counter, but packs must declare weight too. Densities (verify, ~30 °C): groundnut ~0.91, sesame ~0.92, coconut ~0.92 g/ml. Store as mg per ml per item.
- Coconut oil solidifies below about 24 °C - in cool mornings it pours slowly and loose measures can be short. Not a software rule, but explains winter "losses".
- Measuring cans used for trade must be Legal Metrology verified and stamped (periodic re-verification). Remind the owner; the software can store stamp due dates later.

## Where money leaks (design reports to catch these)
Seed cleaning loss, low yield from a machine or operator, sediment loss, over-pouring at loose sale, drips and spills at the tap, barrel residue, broken bottles, unrecorded own-use, credit not collected, selling at old price after a seed price rise. The barrel dip check (expected vs measured) and yield per batch are the two most valuable reports.

## Pricing
Price per litre moves with seed price. Pack prices follow price per litre plus packing cost. Loose price is usually per litre; wholesale tins have their own price. Never sell above the printed MRP on a pack.

## Seasons (plan stock and pressing ahead)
Deepavali - sesame oil for the oil bath (nallennai), big spike. Karthigai Deepam - lamp oil. Pongal, Aadi and wedding seasons - bulk buying. Summer - coconut oil demand. Use last year's sales by week to suggest pressing quantity.

## Labels and compliance (verify current rules with the owner's consultant)
- **FSSAI**: registration or licence by turnover; licence number and logo on packs and displayed in the shop.
- **Pack label** (packed oil): product name, veg mark, ingredients, nutrition info, net quantity (volume and weight for edible oil), MRP inclusive of taxes, batch/lot no, date of packing/manufacture, best before, packer name and address, FSSAI no, customer care. Shelf life of wood-pressed oil is shorter than refined (often 6-9 months (verify)).
- **Legal Metrology** also sets standard pack sizes for edible oils (recent advisory - verify which sizes apply) and requires stamped measures for loose sale.
- **GST** (verify with CA): edible oils generally 5% (groundnut HSN 1508, sesame 1515, coconut 1513). Oil cake (HSN 2305/2306) rate depends on use - confirm. Ask whether the shop is under the composition scheme (then it issues a "Bill of Supply", not a tax invoice).

## How to use this knowledge
When reviewing a spec or screen, ask: would the owner recognise this flow from their shop floor? Does it record the real steps (batch, settle, barrel, measure, bottle)? Does it show the leaks above? Are norms editable settings? Flag anything that forces staff to do extra typing during rush hours.
