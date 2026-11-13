# T05: Pressing into a godown barrel + Transfer to store

**Branch:** wip/r6. **Do not commit.** Spec: `tools/junior/reports/R6-gap.md`, items **B1**, **B2** and "Suggested task order" step 3. Follow `.claude/skills/gokul-desktop-ui/SKILL.md` and `.claude/skills/wood-pressed-oil-business/SKILL.md`. You built `GodownPane.tsx` and `GodownDialogs.tsx` in T03 and T04.

## Owner's real process
Seeds (kg) go into the chekku, and the oil (in litres) goes into a **godown barrel**. Several batches can go into the same barrel. The machine is either **W (wood-pressed / chekku)** or **R (rotary)**. After the barrel is **settled and marked ready**, the oil is moved to the shop: **Transfer to store**, which adds litres to the store's loose-oil item stock and reduces the godown barrel. Godown oil must never appear in store or POS stock.

## Build
1. `apps/office/src/components/purchasing/PressingForm.tsx`:
   - Add a **godown barrel picker** that shows only barrels of the matching oil type with status filling or empty, plus their current litres and free space.
   - Add a **machine selector, W / R**.
   - Send `godownBarrelId` and `machine` in the save call. Check the exact input type in `packages/data/src/areas/production.ts` / `purchasing.ts` and in the Rust `pressing` save, and match it exactly.
   - Warn if the batch's oil litres exceed the barrel's free space.
2. **Transfer to store dialog**, added to `GodownDialogs.tsx`: allowed only for barrels with status **ready**.
   - Pick the store loose-oil item. Filter to loose items of the matching oil; check how items expose loose/oil type.
   - Enter litres to transfer (default: all the barrel's litres; partial transfers allowed). Add a note.
   - Calls `api.transferToStore`.
   - Show a list of recent transfers in the barrel panel (use the existing Api, for example `listGodownTransfers` or what `getGodownBarrel` returns).
3. In `Production.tsx`, **retire the old `MoveToBarrelDialog` flow**, which the owner says is wrong. Remove its button, or reword it so it opens the godown flow instead. Don't delete backend functions.
4. After a save, reload the godown pane and the batches, and show a toast with the result.

## Rules
- Litres are milli-units and money is paise, both integers. Check the types.
- Never open `data/import/**`, `*.db`, or AppData.

## Done when (paste the final lines)
- `npm run typecheck` → 0 errors
- `npm run lint` → clean
- `npm run build` → succeeds
- `cargo test -p gokul-core` passes (`demo_seed_matches_the_mock_shop_and_is_fast` is a known timing flake; rerun it alone if it fails)

## Report
List the files changed, the Api calls with their exact input shapes, what happened to the old MoveToBarrel flow, and anything you were unsure about.
