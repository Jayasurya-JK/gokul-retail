# Gokul colour standard (POS, Office, app.gokuloils.in)

Decided by the tech lead with the owner, 26 Nov 2026. Applies to every screen in every Gokul app.
The dark brand green (top bar, primary buttons) is the shop's brand and is NOT a data colour.
The rules below are for NUMBERS and STATUSES only.

## Meaning colours (never use them for anything else)
| Colour | Meaning | Examples |
|---|---|---|
| Green | Good money / healthy: profit, margin, gain, paid, settled, a good change (sales up) | Profit column, "Paid", ▲ sales |
| Red | Money owed (to us OR by us), loss, problems | Customer credit/outstanding, supplier dues, below-cost sale, cash short, cancelled bill, errors |
| Amber | Needs a look, not wrong yet | Low stock, held bill, total mismatch, near expiry, unverified |
| Grey | Neutral / nothing | Zero, empty "–", plain counts, quiet labels |

A change is coloured by whether it is good FOR THAT NUMBER: sales up = green, spend/outstanding up = red.
Always pair colour with a word, sign or arrow (colour-blind safe); never colour alone.

## Payment modes (categorical; never green, never amber)
| Mode | Colour |
|---|---|
| Cash | Indigo |
| UPI / BharatQR | Sky blue |
| Card | Purple |
| Points | Pink |
| Credit (on account) | Red (it is money owed) |
| Store credit / wallet (if re-enabled) | Slate |

## How to use
- Tints: column/cell background at ~5% (rows) and ~10-12% (totals); text in the darker ink of the same hue.
- Contrast: every text >= 4.5:1 on its background in normal, totals, selected and hover states.
- Tokens: define once (`--money-good`, `--money-owed`, `--attention`, `--neutral`, `--mode-cash` ... with `-ink` and `-tint`)
  in the shared design tokens of each app; components use tokens, never raw hex.
- Do not invent new meaning colours; extend this file first.
