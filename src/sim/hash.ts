import type { SimState } from '../contracts/index.ts';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Serialize any JSON-compatible value into canonical deterministic JSON with
 * lexicographically sorted object keys and normalized numbers.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  const t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') {
    const num = value as number;
    if (!Number.isFinite(num)) return 'null';
    if (Object.is(num, -0)) return '0';
    return String(num);
  }
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    let out = '[';
    for (let i = 0; i < value.length; i++) {
      if (i > 0) out += ',';
      out += canonicalJson(value[i]);
    }
    return out + ']';
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    let out = '{';
    let first = true;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = obj[k];
      if (v === undefined) continue;
      if (!first) out += ',';
      first = false;
      out += JSON.stringify(k) + ':' + canonicalJson(v);
    }
    return out + '}';
  }
  return 'null';
}

/**
 * Compute FNV-1a 32-bit hash over a UTF-16 string and return an 8-char
 * lowercase hexadecimal digest.
 */
export function fnv1a32Hex(input: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    hash ^= code & 0xff;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
    if (code > 0xff) {
      hash ^= (code >>> 8) & 0xff;
      hash = Math.imul(hash, FNV_PRIME) >>> 0;
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Deterministically hash all simulation-relevant fields of SimState into an
 * 8-character lowercase FNV-1a 32-bit hex digest.
 */
export function hashSimState(state: SimState): string {
  const payload = {
    tick: state.tick,
    rng: state.rng,
    phase: state.phase,
    deckId: state.deckId,
    stake: state.stake,
    challengeId: state.challengeId,
    seeded: state.seeded,
    ante: state.ante,
    round: state.round,
    winAnte: state.winAnte,
    endless: state.endless,
    dollars: state.dollars,
    bankruptAt: state.bankruptAt,
    interestCap: state.interestCap,
    interestAmount: state.interestAmount,
    anteScaling: state.anteScaling,
    handsPerRound: state.handsPerRound,
    discardsPerRound: state.discardsPerRound,
    handsLeft: state.handsLeft,
    discardsLeft: state.discardsLeft,
    handSize: state.handSize,
    maxSelectCards: state.maxSelectCards,
    jokerSlots: state.jokerSlots,
    consumableSlots: state.consumableSlots,
    shopSlots: state.shopSlots,
    voucherSlots: state.voucherSlots,
    boosterSlots: state.boosterSlots,
    baseRerollCost: state.baseRerollCost,
    rerollCost: state.rerollCost,
    freeRerolls: state.freeRerolls,
    discountPercent: state.discountPercent,
    jokerRate: state.jokerRate,
    tarotRate: state.tarotRate,
    planetRate: state.planetRate,
    spectralRate: state.spectralRate,
    playingCardRate: state.playingCardRate,
    editionRate: state.editionRate,
    blinds: state.blinds,
    activeBlindSlot: state.activeBlindSlot,
    bossHistory: state.bossHistory,
    bossRerolledThisAnte: state.bossRerolledThisAnte,
    roundChips: state.roundChips,
    targetChips: state.targetChips,
    currentHandChips: state.currentHandChips,
    currentHandMult: state.currentHandMult,
    lastHandScore: state.lastHandScore,
    lastHandName: state.lastHandName,
    lastHandBeats: state.lastHandBeats,
    scoringBeatIndex: state.scoringBeatIndex,
    fullDeck: state.fullDeck,
    drawPile: state.drawPile,
    hand: state.hand,
    playArea: state.playArea,
    discardPile: state.discardPile,
    selectedCardIds: state.selectedCardIds,
    sortMode: state.sortMode,
    jokers: state.jokers,
    consumables: state.consumables,
    vouchers: state.vouchers,
    tags: state.tags,
    handLevels: state.handLevels,
    shop: state.shop,
    pack: state.pack,
    cashout: state.cashout,
    tracking: state.tracking,
    stats: state.stats,
    lastError: state.lastError,
  };
  return fnv1a32Hex(canonicalJson(payload));
}
