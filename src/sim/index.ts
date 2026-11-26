// ============================================================================
// Krunked Cards — Pure Deterministic 60 Hz Simulation Core (src/sim/index.ts)
// 100% pure TypeScript simulation with zero browser, audio, or wall-clock deps.
// ============================================================================

export {
  pseudohash,
  pseudoseed,
  createRngState,
  nextRandom,
  nextRandomInt,
  shuffleDeterministic,
  pickRandom,
  weightedPick,
} from './prng.ts';

export { canonicalJson, fnv1a32Hex, hashSimState } from './hash.ts';

export {
  evaluatePokerHand,
  previewSelectedHand,
  isCardFace,
  isCardSuit,
} from './poker.ts';

export {
  getActiveBlind,
  getCardById,
  getEffectiveJokerSlots,
  getEffectiveConsumableSlots,
  getEffectiveHandSize,
  getProbabilityMultiplier,
  resolveCopiedJoker,
  calcSellValue,
  calcShopItemCost,
  rollEdition,
  rollRarity,
  rollStakeStickers,
  generateShop,
  generateShopOffers,
  openBoosterPack,
  computeCashoutBreakdown,
} from './shop.ts';

export {
  canUseConsumable,
  applyConsumable,
  getConsumableSelectRange,
} from './consumables.ts';

export { scorePlayedHand } from './scoring.ts';

export {
  createTitleState,
  startRun,
  dispatchSim,
  stepSimTick,
} from './engine.ts';
