/**
 * Feature switches for the POS. One place, so a switched-off feature can be brought back by changing one word.
 * Nothing is deleted: the code stays, it is only guarded by these flags. Saved bills that hold these pay modes
 * still open and print as before (data stays compatible).
 */
export const FEATURES = {
  /** disabled 26 Nov 2026 by owner; re-enable by setting FEATURES.sodexo=true */
  sodexo: false,
  /** disabled 26 Nov 2026 by owner; re-enable by setting FEATURES.wallet=true (store credit / credit-note pay mode) */
  wallet: false,
};
