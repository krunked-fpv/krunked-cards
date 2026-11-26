import {
  PALETTE,
  POKER_HAND_IDS,
  RANK_VALUES,
  RANKS,
  SUITS,
  type BlindSlotState,
  type BoosterDef,
  type BoosterKind,
  type BoosterSize,
  type CardInstance,
  type CashoutBreakdown,
  type CashoutRow,
  type ConsumableDef,
  type ConsumableInstance,
  type ConsumableSet,
  type EditionId,
  type EnhancementId,
  type JokerDef,
  type JokerInstance,
  type PackCardOffer,
  type PackState,
  type PokerHandId,
  type PokerHandState,
  type Rank,
  type Rarity,
  type SealId,
  type ShopBoosterOffer,
  type ShopOffer,
  type ShopState,
  type ShopVoucherOffer,
  type SimState,
  type SortMode,
  type Suit,
} from '../contracts/index.ts';
import {
  BOOSTERS,
  CONSUMABLE_MAP,
  DECK_MAP,
  EDITION_DEFS,
  JOKER_MAP,
  JOKERS,
  PLANETS,
  POKER_HANDS,
  SPECTRALS,
  TAROTS,
  VOUCHERS,
  evaluateJokerHook,
} from '../data/index.ts';
import { isCardFace, isCardSuit } from './poker.ts';
import { nextRandom, nextRandomInt, pickRandom, shuffleDeterministic, weightedPick } from './prng.ts';

// ============================================================================
// Pure Shared Runtime Helpers (used by shop, consumables, scoring, engine)
// ============================================================================

export function safeNum(val: number, fallback = 0): number {
  return Number.isFinite(val) ? val : fallback;
}

export function allocUid(state: SimState, prefix: string): string {
  const id = state.tracking.nextUid;
  state.tracking.nextUid += 1;
  return `${prefix}_${id}`;
}

export function getCardById(state: SimState, cardId: string): CardInstance | undefined {
  for (let i = 0; i < state.fullDeck.length; i++) {
    if (state.fullDeck[i].id === cardId) return state.fullDeck[i];
  }
  return undefined;
}

export function getActiveBlind(state: SimState): BlindSlotState {
  return state.blinds[state.activeBlindSlot];
}

export function countActiveJoker(state: SimState, key: string): number {
  let count = 0;
  for (let i = 0; i < state.jokers.length; i++) {
    if (state.jokers[i].key === key && !state.jokers[i].debuffed) count++;
  }
  return count;
}

export function getEffectiveJokerSlots(state: SimState): number {
  let neg = 0;
  for (let i = 0; i < state.jokers.length; i++) {
    if (state.jokers[i].edition === 'e_negative') neg++;
  }
  return Math.max(0, state.jokerSlots + neg);
}

export function getEffectiveConsumableSlots(state: SimState): number {
  let neg = 0;
  for (let i = 0; i < state.consumables.length; i++) {
    if (state.consumables[i].edition === 'e_negative') neg++;
  }
  return Math.max(0, state.consumableSlots + neg);
}

export function getEffectiveHandSize(state: SimState): number {
  let size = state.handSize + state.tracking.handSizeDeltaThisRound;
  for (let i = 0; i < state.jokers.length; i++) {
    const j = state.jokers[i];
    if (j.debuffed) continue;
    if (j.key === 'j_juggler') size += 1;
    else if (j.key === 'j_troubadour') size += 2;
    else if (j.key === 'j_stuntman') size -= 2;
    else if (j.key === 'j_merry_andy') size -= 1;
    else if (j.key === 'j_turtle_bean') size += Number(j.state.h_size ?? 5);
  }
  const blind = getActiveBlind(state);
  if (
    (state.phase === 'PLAYING' || state.phase === 'SCORING') &&
    blind.slot === 'Boss' &&
    blind.key === 'bl_manacle' &&
    !blind.disabled
  ) {
    size -= 1;
  }
  return Math.max(1, Math.floor(size));
}

export function getProbabilityMultiplier(jokers: readonly JokerInstance[]): number {
  let oopsCount = 0;
  for (let i = 0; i < jokers.length; i++) {
    if (jokers[i].key === 'j_oops' && !jokers[i].debuffed) oopsCount++;
  }
  return Math.pow(2, oopsCount);
}

/**
 * Cycle-safe resolution for Blueprint (copies right) and Brainstorm (copies leftmost).
 * Uses a visited index set to guarantee termination even on Blueprint <-> Brainstorm loops.
 */
export function resolveCopiedJoker(
  jokers: readonly JokerInstance[],
  startIndex: number
): { target: JokerInstance; targetIndex: number } | null {
  const visited = new Set<number>([startIndex]);
  let currIndex = startIndex;

  while (true) {
    const curr = jokers[currIndex];
    if (!curr || curr.debuffed) return null;

    let nextIndex = -1;
    if (curr.key === 'j_blueprint') {
      nextIndex = currIndex + 1;
    } else if (curr.key === 'j_brainstorm') {
      nextIndex = 0;
    } else {
      if (currIndex !== startIndex) {
        const def = JOKER_MAP[curr.key];
        if (def && def.blueprintCompat === false) return null;
      }
      return { target: curr, targetIndex: currIndex };
    }

    if (nextIndex < 0 || nextIndex >= jokers.length) return null;
    if (visited.has(nextIndex)) return null;
    visited.add(nextIndex);
    currIndex = nextIndex;
  }
}

export function calcSellValue(cost: number, extraSellValue = 0, rental = false): number {
  const base = rental ? 1 : Math.max(1, Math.floor(safeNum(cost, 1) / 2));
  return Math.max(1, base + safeNum(extraSellValue, 0));
}

export function recalcJokerSellValue(joker: JokerInstance): void {
  joker.sellValue = calcSellValue(joker.cost, joker.extraSellValue, joker.rental);
}

const EDITION_COST_ADD_FALLBACK: Record<EditionId, number> = {
  none: 0,
  e_foil: 2,
  e_holo: 3,
  e_polychrome: 5,
  e_negative: 5,
};

export function calcShopItemCost(
  baseCost: number,
  edition: EditionId,
  state: SimState,
  opts?: { rental?: boolean; isPlanetOrCelestial?: boolean; isCouponEligible?: boolean }
): number {
  if (opts?.isCouponEligible && state.tracking.pendingCoupon) return 0;
  if (opts?.isPlanetOrCelestial && countActiveJoker(state, 'j_astronomer') > 0) return 0;
  if (opts?.rental) return 1;

  const editionAdd = EDITION_DEFS[edition]?.costAdd ?? EDITION_COST_ADD_FALLBACK[edition] ?? 0;
  const raw = Math.max(1, safeNum(baseCost, 1) + editionAdd);
  const discounted = Math.max(1, Math.floor((raw * (100 - state.discountPercent)) / 100));
  return Math.max(1, discounted + state.tracking.inflationCostBump);
}

export function createCardInstance(
  state: SimState,
  suit: Suit,
  rank: Rank,
  opts?: {
    enhancement?: EnhancementId;
    edition?: EditionId;
    seal?: SealId;
    permaBonus?: number;
  }
): CardInstance {
  return {
    id: allocUid(state, 'card'),
    suit,
    rank,
    enhancement: opts?.enhancement ?? 'none',
    edition: opts?.edition ?? 'none',
    seal: opts?.seal ?? 'none',
    permaBonus: opts?.permaBonus ?? 0,
    debuffed: false,
    faceDown: false,
    playedThisAnte: false,
  };
}

export function createJokerInstance(
  state: SimState,
  key: string,
  opts?: {
    edition?: EditionId;
    eternal?: boolean;
    perishable?: boolean;
    rental?: boolean;
    cost?: number;
  }
): JokerInstance {
  const def = JOKER_MAP[key];
  const edition = opts?.edition ?? 'none';
  const rental = Boolean(opts?.rental);
  const cost =
    opts?.cost !== undefined
      ? opts.cost
      : calcShopItemCost(def?.cost ?? 4, edition, state, { rental });
  const initialState: Record<string, number | string | boolean | null> = {};
  if (def?.config) {
    const cfgKeys = Object.keys(def.config);
    for (let i = 0; i < cfgKeys.length; i++) {
      initialState[cfgKeys[i]] = def.config[cfgKeys[i]];
    }
  }
  return {
    id: allocUid(state, 'joker'),
    key,
    edition,
    eternal: Boolean(opts?.eternal),
    perishable: Boolean(opts?.perishable),
    perishableTally: opts?.perishable ? 5 : 0,
    rental,
    debuffed: false,
    faceDown: false,
    cost,
    sellValue: calcSellValue(cost, 0, rental),
    extraSellValue: 0,
    state: initialState,
  };
}

export const PLANET_HAND_FALLBACK: Record<string, PokerHandId> = {
  c_pluto: 'High Card',
  c_mercury: 'Pair',
  c_uranus: 'Two Pair',
  c_venus: 'Three of a Kind',
  c_saturn: 'Straight',
  c_jupiter: 'Flush',
  c_earth: 'Full House',
  c_mars: 'Four of a Kind',
  c_neptune: 'Straight Flush',
  c_planet_x: 'Five of a Kind',
  c_ceres: 'Flush House',
  c_eris: 'Flush Five',
};

export function inferConsumableSet(key: string): ConsumableSet {
  const def = CONSUMABLE_MAP[key];
  if (def) return def.set;
  if (PLANET_HAND_FALLBACK[key]) return 'Planet';
  const spectralKeys = new Set([
    'c_familiar', 'c_grim', 'c_incantation', 'c_talisman', 'c_aura', 'c_wraith',
    'c_sigil', 'c_ouija', 'c_ectoplasm', 'c_immolate', 'c_ankh', 'c_deja_vu',
    'c_hex', 'c_trance', 'c_medium', 'c_cryptid', 'c_soul', 'c_black_hole',
  ]);
  if (spectralKeys.has(key)) return 'Spectral';
  return 'Tarot';
}

export function createConsumableInstance(
  state: SimState,
  key: string,
  opts?: { edition?: EditionId; cost?: number }
): ConsumableInstance {
  const def = CONSUMABLE_MAP[key];
  const set = inferConsumableSet(key);
  const edition = opts?.edition ?? 'none';
  const cost =
    opts?.cost !== undefined
      ? opts.cost
      : calcShopItemCost(def?.cost ?? (set === 'Spectral' ? 4 : 3), edition, state, {
          isPlanetOrCelestial: set === 'Planet',
        });
  return {
    id: allocUid(state, 'cons'),
    key,
    set,
    edition,
    cost,
    sellValue: calcSellValue(cost, 0, false),
  };
}

const SUIT_SORT_ORDER: Record<Suit, number> = {
  Spades: 0,
  Hearts: 1,
  Clubs: 2,
  Diamonds: 3,
};

export function sortHandIds(state: SimState, mode: SortMode = state.sortMode): void {
  const byId = new Map<string, CardInstance>();
  for (let i = 0; i < state.fullDeck.length; i++) {
    byId.set(state.fullDeck[i].id, state.fullDeck[i]);
  }
  state.hand.sort((aId, bId) => {
    const a = byId.get(aId);
    const b = byId.get(bId);
    if (!a || !b) return 0;
    const aStone = a.enhancement === 'm_stone' ? 1 : 0;
    const bStone = b.enhancement === 'm_stone' ? 1 : 0;
    if (aStone !== bStone) return aStone - bStone;

    if (mode === 'suit') {
      const sDiff = SUIT_SORT_ORDER[a.suit] - SUIT_SORT_ORDER[b.suit];
      if (sDiff !== 0) return sDiff;
      return RANK_VALUES[b.rank] - RANK_VALUES[a.rank];
    }
    const rDiff = RANK_VALUES[b.rank] - RANK_VALUES[a.rank];
    if (rDiff !== 0) return rDiff;
    return SUIT_SORT_ORDER[a.suit] - SUIT_SORT_ORDER[b.suit];
  });
}

export function drawCardsToHand(
  state: SimState,
  count: number,
  opts?: { isInitialDraw?: boolean; afterHandPlayed?: boolean }
): CardInstance[] {
  const drawn: CardInstance[] = [];
  const blind = getActiveBlind(state);
  const isBossActive = blind.slot === 'Boss' && !blind.disabled;
  const probMult = getProbabilityMultiplier(state.jokers);

  for (let i = 0; i < count; i++) {
    if (state.drawPile.length === 0) break;
    const cardId = state.drawPile.pop()!;
    const card = getCardById(state, cardId);
    if (!card) continue;

    // Face-down blind / challenge rules
    card.faceDown = false;
    if (isBossActive) {
      if (blind.key === 'bl_house' && opts?.isInitialDraw) {
        card.faceDown = true;
      } else if (blind.key === 'bl_fish' && opts?.afterHandPlayed) {
        card.faceDown = true;
      } else if (blind.key === 'bl_mark' && isCardFace(card, state.jokers)) {
        card.faceDown = true;
      } else if (blind.key === 'bl_wheel' && nextRandom(state.rng, 'wheel_flip') < (1 * probMult) / 7) {
        card.faceDown = true;
      }
    }
    if (!card.faceDown && state.tracking.flippedCardsChance > 0) {
      if (nextRandom(state.rng, 'xray_flip') < 1 / state.tracking.flippedCardsChance) {
        card.faceDown = true;
      }
    }

    state.hand.push(cardId);
    drawn.push(card);
  }
  return drawn;
}

const DEFAULT_POKER_HAND_SPECS: Record<
  PokerHandId,
  { chips: number; mult: number; lChips: number; lMult: number; visible: boolean }
> = {
  'Flush Five': { chips: 160, mult: 16, lChips: 50, lMult: 3, visible: false },
  'Flush House': { chips: 140, mult: 14, lChips: 40, lMult: 4, visible: false },
  'Five of a Kind': { chips: 120, mult: 12, lChips: 35, lMult: 3, visible: false },
  'Straight Flush': { chips: 100, mult: 8, lChips: 40, lMult: 4, visible: true },
  'Four of a Kind': { chips: 60, mult: 7, lChips: 30, lMult: 3, visible: true },
  'Full House': { chips: 40, mult: 4, lChips: 25, lMult: 2, visible: true },
  Flush: { chips: 35, mult: 4, lChips: 15, lMult: 2, visible: true },
  Straight: { chips: 30, mult: 4, lChips: 30, lMult: 3, visible: true },
  'Three of a Kind': { chips: 30, mult: 3, lChips: 20, lMult: 2, visible: true },
  'Two Pair': { chips: 20, mult: 2, lChips: 20, lMult: 1, visible: true },
  Pair: { chips: 10, mult: 2, lChips: 15, lMult: 1, visible: true },
  'High Card': { chips: 5, mult: 1, lChips: 10, lMult: 1, visible: true },
};

export function buildDefaultHandLevels(): Record<PokerHandId, PokerHandState> {
  const byId = new Map<PokerHandId, { baseChips: number; baseMult: number; lChips: number; lMult: number; visible: boolean }>();
  for (let i = 0; i < POKER_HANDS.length; i++) {
    const h = POKER_HANDS[i];
    byId.set(h.id, h);
  }
  const out = {} as Record<PokerHandId, PokerHandState>;
  for (let i = 0; i < POKER_HAND_IDS.length; i++) {
    const id = POKER_HAND_IDS[i];
    const fromData = byId.get(id);
    const fb = DEFAULT_POKER_HAND_SPECS[id];
    out[id] = {
      id,
      level: 1,
      chips: fromData ? fromData.baseChips : fb.chips,
      mult: fromData ? fromData.baseMult : fb.mult,
      lChips: fromData ? fromData.lChips : fb.lChips,
      lMult: fromData ? fromData.lMult : fb.lMult,
      visible: fromData ? fromData.visible : fb.visible,
      played: 0,
      playedThisRound: 0,
    };
  }
  return out;
}

// ============================================================================
// Edition, Pool & Stake Sticker Rollers
// ============================================================================

export function rollEdition(
  state: SimState,
  key: string,
  mod = 1,
  allowNegative = true
): EditionId {
  const r = nextRandom(state.rng, key);
  const rate = Math.max(1, state.editionRate);
  if (allowNegative && r > 1 - 0.003 * mod) return 'e_negative';
  if (r > 1 - 0.006 * rate * mod) return 'e_polychrome';
  if (r > 1 - 0.02 * rate * mod) return 'e_holo';
  if (r > 1 - 0.04 * rate * mod) return 'e_foil';
  return 'none';
}

export function rollStakeStickers(
  state: SimState,
  def: JokerDef | undefined,
  key: string
): { eternal: boolean; perishable: boolean; rental: boolean } {
  const eternalCompat = def ? def.eternalCompat : true;
  const perishableCompat = def ? def.perishableCompat : true;

  let eternal = state.tracking.allEternal && eternalCompat;
  let perishable = false;
  if (!eternal && state.stake >= 4) {
    const stickerRoll = nextRandom(state.rng, `${key}_sticker`);
    if (stickerRoll > 0.7 && eternalCompat) {
      eternal = true;
    } else if (state.stake >= 7 && stickerRoll > 0.4 && stickerRoll <= 0.7 && perishableCompat) {
      perishable = true;
    }
  }
  const rental = state.stake >= 8 && nextRandom(state.rng, `${key}_rental`) > 0.7;
  return { eternal, perishable, rental };
}

export function rollRarity(state: SimState, key: string): Rarity {
  const r = nextRandom(state.rng, key);
  if (r <= 0.7) return 1;
  if (r <= 0.95) return 2;
  return 3;
}

export function pickJokerDefFromPool(
  state: SimState,
  key: string,
  opts?: { forcedRarity?: Rarity; excludeKeys?: Set<string> }
): JokerDef | null {
  if (JOKERS.length === 0) return null;
  const allowDuplicates = countActiveJoker(state, 'j_ring_master') > 0;
  const banned = new Set(state.tracking.bannedKeys);
  const owned = new Set(state.jokers.map((j) => j.key));
  const grosMichelExtinct = banned.has('j_gros_michel');
  const rarity = opts?.forcedRarity ?? rollRarity(state, `${key}_rarity`);

  const filterPool = (targetRarity: Rarity | null, enforceUniqueness: boolean): JokerDef[] =>
    JOKERS.filter((j) => {
      if (targetRarity !== null && j.rarity !== targetRarity) return false;
      if (targetRarity === null && j.rarity === 4) return false;
      if (banned.has(j.key)) return false;
      if (j.key === 'j_cavendish' && JOKER_MAP['j_gros_michel'] && !grosMichelExtinct) {
        return false;
      }
      if (enforceUniqueness && !allowDuplicates) {
        if (owned.has(j.key)) return false;
        if (opts?.excludeKeys?.has(j.key)) return false;
      }
      return true;
    });

  let pool = filterPool(rarity, true);
  if (pool.length === 0) pool = filterPool(null, true);
  if (pool.length === 0) pool = filterPool(rarity, false);
  if (pool.length === 0) pool = filterPool(null, false);
  if (pool.length === 0) pool = JOKERS;

  return pickRandom(pool, state.rng, `${key}_pick`) ?? pool[0] ?? null;
}

export function pickConsumableDefFromPool(
  state: SimState,
  set: ConsumableSet,
  key: string,
  excludeKeys?: Set<string>
): ConsumableDef | null {
  const source = set === 'Tarot' ? TAROTS : set === 'Planet' ? PLANETS : SPECTRALS;
  if (source.length === 0) return null;
  const allowDuplicates = countActiveJoker(state, 'j_ring_master') > 0;
  const banned = new Set(state.tracking.bannedKeys);
  const owned = new Set(state.consumables.map((c) => c.key));

  const filterPool = (enforceUniqueness: boolean): ConsumableDef[] =>
    source.filter((c) => {
      if (banned.has(c.key)) return false;
      if (c.hidden) {
        if (set === 'Planet' && c.handType && state.handLevels[c.handType]?.visible) {
          // Secret planets unlock once the secret hand has been played/discovered
        } else {
          return false;
        }
      }
      if (enforceUniqueness && !allowDuplicates) {
        if (owned.has(c.key)) return false;
        if (excludeKeys?.has(c.key)) return false;
      }
      return true;
    });

  let pool = filterPool(true);
  if (pool.length === 0) pool = filterPool(false);
  if (pool.length === 0) pool = source;
  return pickRandom(pool, state.rng, key) ?? pool[0] ?? null;
}

const ENHANCEMENT_POOL: EnhancementId[] = [
  'm_bonus',
  'm_mult',
  'm_wild',
  'm_glass',
  'm_steel',
  'm_stone',
  'm_gold',
  'm_lucky',
];

const SEAL_POOL: SealId[] = ['Gold', 'Red', 'Blue', 'Purple'];

// ============================================================================
// Shop Generation
// ============================================================================

function buildJokerOffer(
  state: SimState,
  key: string,
  opts?: {
    forcedRarity?: Rarity;
    forcedEdition?: EditionId;
    free?: boolean;
    excludeKeys?: Set<string>;
  }
): ShopOffer {
  const def = pickJokerDefFromPool(state, key, {
    forcedRarity: opts?.forcedRarity,
    excludeKeys: opts?.excludeKeys,
  });
  const jokerKey = def?.key ?? 'j_joker';
  if (opts?.excludeKeys) opts.excludeKeys.add(jokerKey);
  const edition = opts?.forcedEdition ?? rollEdition(state, `${key}_ed`, 1, true);
  const stickers = rollStakeStickers(state, def ?? undefined, key);
  const cost = opts?.free
    ? 0
    : calcShopItemCost(def?.cost ?? 4, edition, state, {
        rental: stickers.rental,
        isCouponEligible: true,
      });

  return {
    id: allocUid(state, 'offer'),
    kind: 'joker',
    key: jokerKey,
    cost,
    sold: false,
    edition,
    eternal: stickers.eternal,
    perishable: stickers.perishable,
    rental: stickers.rental,
  };
}

export function generateShopOffers(state: SimState, isReroll: boolean): ShopOffer[] {
  const offers: ShopOffer[] = [];
  const usedKeys = new Set<string>();

  // Apply queued shop tags (Uncommon/Rare/Foil/Holo/Polychrome/Negative) on shop entry
  if (!isReroll && state.tracking.pendingShopTags.length > 0) {
    const remainingTags: string[] = [];
    for (let i = 0; i < state.tracking.pendingShopTags.length; i++) {
      const tag = state.tracking.pendingShopTags[i];
      if (offers.length >= state.shopSlots) {
        remainingTags.push(tag);
        continue;
      }
      if (tag === 'tag_uncommon') {
        offers.push(buildJokerOffer(state, `shop_tag_${i}`, { forcedRarity: 2, free: true, excludeKeys: usedKeys }));
      } else if (tag === 'tag_rare') {
        offers.push(buildJokerOffer(state, `shop_tag_${i}`, { forcedRarity: 3, free: true, excludeKeys: usedKeys }));
      } else if (tag === 'tag_foil') {
        offers.push(buildJokerOffer(state, `shop_tag_${i}`, { forcedEdition: 'e_foil', free: true, excludeKeys: usedKeys }));
      } else if (tag === 'tag_holo') {
        offers.push(buildJokerOffer(state, `shop_tag_${i}`, { forcedEdition: 'e_holo', free: true, excludeKeys: usedKeys }));
      } else if (tag === 'tag_polychrome') {
        offers.push(buildJokerOffer(state, `shop_tag_${i}`, { forcedEdition: 'e_polychrome', free: true, excludeKeys: usedKeys }));
      } else if (tag === 'tag_negative') {
        offers.push(buildJokerOffer(state, `shop_tag_${i}`, { forcedEdition: 'e_negative', free: true, excludeKeys: usedKeys }));
      }
      // Remove corresponding visual tag from state.tags
      const idx = state.tags.indexOf(tag);
      if (idx >= 0) state.tags.splice(idx, 1);
    }
    state.tracking.pendingShopTags = remainingTags;
  }

  const kindWeights: Array<{ item: ShopOffer['kind']; weight: number }> = [
    { item: 'joker', weight: Math.max(0, state.jokerRate) },
    { item: 'tarot', weight: TAROTS.length > 0 ? Math.max(0, state.tarotRate) : 0 },
    { item: 'planet', weight: PLANETS.length > 0 ? Math.max(0, state.planetRate) : 0 },
    { item: 'spectral', weight: SPECTRALS.length > 0 ? Math.max(0, state.spectralRate) : 0 },
    { item: 'playing_card', weight: Math.max(0, state.playingCardRate) },
  ];

  while (offers.length < state.shopSlots) {
    const slotKey = `shop_slot_${state.ante}_${state.round}_${offers.length}`;
    const chosenKind = weightedPick(kindWeights, state.rng, `${slotKey}_kind`) ?? 'joker';

    if (chosenKind === 'joker') {
      offers.push(buildJokerOffer(state, slotKey, { excludeKeys: usedKeys }));
    } else if (chosenKind === 'tarot' || chosenKind === 'planet' || chosenKind === 'spectral') {
      const set: ConsumableSet =
        chosenKind === 'tarot' ? 'Tarot' : chosenKind === 'planet' ? 'Planet' : 'Spectral';
      const def = pickConsumableDefFromPool(state, set, `${slotKey}_cons`, usedKeys);
      if (!def) {
        offers.push(buildJokerOffer(state, slotKey, { excludeKeys: usedKeys }));
      } else {
        usedKeys.add(def.key);
        const cost = calcShopItemCost(def.cost, 'none', state, {
          isPlanetOrCelestial: set === 'Planet',
          isCouponEligible: !isReroll,
        });
        offers.push({
          id: allocUid(state, 'offer'),
          kind: chosenKind,
          key: def.key,
          cost,
          sold: false,
          edition: 'none',
        });
      }
    } else {
      // Playing card (Magic Trick / Illusion)
      const suit = pickRandom(SUITS, state.rng, `${slotKey}_suit`) ?? 'Spades';
      const rank = pickRandom(RANKS, state.rng, `${slotKey}_rank`) ?? 'Ace';
      const hasIllusion = state.vouchers.includes('v_illusion');
      const enhancement: EnhancementId =
        hasIllusion && nextRandom(state.rng, `${slotKey}_enh_roll`) < 0.4
          ? (pickRandom(ENHANCEMENT_POOL, state.rng, `${slotKey}_enh`) ?? 'm_bonus')
          : 'none';
      const edition: EditionId =
        hasIllusion && nextRandom(state.rng, `${slotKey}_ed_roll`) < 0.2
          ? rollEdition(state, `${slotKey}_ed`, 1, false)
          : 'none';
      const cost = calcShopItemCost(1, edition, state, { isCouponEligible: !isReroll });
      offers.push({
        id: allocUid(state, 'offer'),
        kind: 'playing_card',
        key: `${suit}_${rank}`,
        cost,
        sold: false,
        edition,
        enhancement,
        seal: 'none',
        suit,
        rank,
      });
    }
  }

  return offers;
}

function generateShopVouchers(state: SimState): ShopVoucherOffer[] {
  let extraVoucherSlots = 0;
  while (state.tags.includes('tag_voucher')) {
    extraVoucherSlots += 1;
    state.tags.splice(state.tags.indexOf('tag_voucher'), 1);
  }
  const totalSlots = Math.max(1, state.voucherSlots + extraVoucherSlots);
  const owned = new Set(state.vouchers);
  const banned = new Set(state.tracking.bannedKeys);

  const eligible = VOUCHERS.filter((v) => {
    if (owned.has(v.key)) return false;
    if (banned.has(v.key)) return false;
    if (v.requires && !owned.has(v.requires)) return false;
    return true;
  });

  const shuffled = shuffleDeterministic(eligible, state.rng, `voucher_${state.ante}_${state.round}`);
  const out: ShopVoucherOffer[] = [];
  for (let i = 0; i < Math.min(totalSlots, shuffled.length); i++) {
    const v = shuffled[i];
    out.push({
      id: allocUid(state, 'vouch'),
      key: v.key,
      cost: calcShopItemCost(v.cost, 'none', state),
      redeemed: false,
    });
  }
  return out;
}

function generateShopBoosters(state: SimState): ShopBoosterOffer[] {
  const out: ShopBoosterOffer[] = [];
  const banned = new Set([...state.tracking.bannedKeys, ...state.tracking.bannedOthers]);
  const eligible = BOOSTERS.filter((b) => !banned.has(b.key));
  if (eligible.length === 0) return out;

  const toOffer = (b: BoosterDef): ShopBoosterOffer => ({
    id: allocUid(state, 'boost'),
    key: b.key,
    kind: b.kind,
    size: b.size,
    cost: calcShopItemCost(b.cost, 'none', state, {
      isPlanetOrCelestial: b.kind === 'Celestial',
      isCouponEligible: true,
    }),
    opened: false,
    extra: b.extra,
    choose: b.choose,
  });

  // First shop always guarantees Normal Buffoon Pack in booster slot 1 (unless banned)
  if (!state.tracking.firstShopSeen) {
    state.tracking.firstShopSeen = true;
    const buffoonNormal = eligible.find((b) => b.kind === 'Buffoon' && b.size === 'Normal');
    if (buffoonNormal) {
      out.push(toOffer(buffoonNormal));
    }
  }

  const weighted = eligible.map((b) => ({ item: b, weight: Math.max(0.01, b.weight) }));
  while (out.length < state.boosterSlots) {
    const pick =
      weightedPick(weighted, state.rng, `shop_pack_${state.ante}_${state.round}_${out.length}`) ??
      eligible[0];
    out.push(toOffer(pick));
  }

  return out;
}

export function generateShop(state: SimState): ShopState {
  // Handle D6 Tag free rerolls
  const hasD6 = state.tags.includes('tag_d_six');
  if (hasD6) {
    state.tags.splice(state.tags.indexOf('tag_d_six'), 1);
  }
  state.rerollCost = hasD6 ? 0 : Math.max(0, state.baseRerollCost + state.tracking.inflationRerollBump);
  state.freeRerolls =
    countActiveJoker(state, 'j_chaos') + (state.tracking.pendingFreeShopReroll ? 1 : 0);
  state.tracking.pendingFreeShopReroll = false;

  const offers = generateShopOffers(state, false);
  const vouchers = generateShopVouchers(state);
  const boosters = generateShopBoosters(state);

  // Consume Coupon Tag after generating initial shop items & boosters
  if (state.tracking.pendingCoupon) {
    state.tracking.pendingCoupon = false;
    const idx = state.tags.indexOf('tag_coupon');
    if (idx >= 0) state.tags.splice(idx, 1);
  }

  return {
    offers,
    vouchers,
    boosters,
    rerollsUsed: 0,
  };
}

// ============================================================================
// Booster Pack Generation & Opening
// ============================================================================

export function openBoosterPack(
  state: SimState,
  boosterKey: string,
  kind: BoosterKind,
  size: BoosterSize,
  extra: number,
  choose: number
): PackState {
  const needsHand = kind === 'Arcana' || kind === 'Spectral';
  if (needsHand) {
    // Reassemble clean shuffled draw pile from fullDeck and deal hand for targeting
    state.drawPile = shuffleDeterministic(
      state.fullDeck.map((c) => c.id),
      state.rng,
      `pack_shuffle_${state.ante}_${state.round}`
    );
    state.hand = [];
    state.playArea = [];
    state.discardPile = [];
    state.selectedCardIds = [];
    drawCardsToHand(state, getEffectiveHandSize(state));
    sortHandIds(state, state.sortMode);
  }

  const cards: PackCardOffer[] = [];
  const usedKeys = new Set<string>();
  const hasOmenGlobe = state.vouchers.includes('v_omen_globe');
  const hasTelescope = state.vouchers.includes('v_telescope');

  for (let i = 0; i < extra; i++) {
    const slotKey = `pack_${boosterKey}_${state.ante}_${state.round}_${i}`;

    if (kind === 'Arcana') {
      // 0.3% chance for The Soul
      if (
        CONSUMABLE_MAP['c_soul'] &&
        !usedKeys.has('c_soul') &&
        nextRandom(state.rng, `${slotKey}_soul`) < 0.003
      ) {
        usedKeys.add('c_soul');
        cards.push({ id: allocUid(state, 'pcard'), kind: 'spectral', key: 'c_soul', edition: 'none', taken: false });
        continue;
      }
      // Omen Globe: 20% chance for a Spectral inside Arcana Pack
      if (hasOmenGlobe && SPECTRALS.length > 0 && nextRandom(state.rng, `${slotKey}_omen`) < 0.2) {
        const spec = pickConsumableDefFromPool(state, 'Spectral', `${slotKey}_spec`, usedKeys);
        if (spec) {
          usedKeys.add(spec.key);
          cards.push({ id: allocUid(state, 'pcard'), kind: 'spectral', key: spec.key, edition: 'none', taken: false });
          continue;
        }
      }
      const tarot = pickConsumableDefFromPool(state, 'Tarot', `${slotKey}_tarot`, usedKeys);
      const tKey = tarot?.key ?? 'c_empress';
      usedKeys.add(tKey);
      cards.push({ id: allocUid(state, 'pcard'), kind: 'tarot', key: tKey, edition: 'none', taken: false });
    } else if (kind === 'Spectral') {
      if (
        CONSUMABLE_MAP['c_soul'] &&
        !usedKeys.has('c_soul') &&
        nextRandom(state.rng, `${slotKey}_soul`) < 0.003
      ) {
        usedKeys.add('c_soul');
        cards.push({ id: allocUid(state, 'pcard'), kind: 'spectral', key: 'c_soul', edition: 'none', taken: false });
        continue;
      }
      if (
        CONSUMABLE_MAP['c_black_hole'] &&
        !usedKeys.has('c_black_hole') &&
        nextRandom(state.rng, `${slotKey}_bh`) < 0.003
      ) {
        usedKeys.add('c_black_hole');
        cards.push({ id: allocUid(state, 'pcard'), kind: 'spectral', key: 'c_black_hole', edition: 'none', taken: false });
        continue;
      }
      const spec = pickConsumableDefFromPool(state, 'Spectral', `${slotKey}_spec`, usedKeys);
      const sKey = spec?.key ?? 'c_aura';
      usedKeys.add(sKey);
      cards.push({ id: allocUid(state, 'pcard'), kind: 'spectral', key: sKey, edition: 'none', taken: false });
    } else if (kind === 'Celestial') {
      if (
        CONSUMABLE_MAP['c_black_hole'] &&
        !usedKeys.has('c_black_hole') &&
        nextRandom(state.rng, `${slotKey}_bh`) < 0.003
      ) {
        usedKeys.add('c_black_hole');
        cards.push({ id: allocUid(state, 'pcard'), kind: 'spectral', key: 'c_black_hole', edition: 'none', taken: false });
        continue;
      }
      if (i === 0 && hasTelescope) {
        const favPlanet = PLANETS.find((p) => p.handType === state.tracking.mostPlayedHand);
        if (favPlanet) {
          usedKeys.add(favPlanet.key);
          cards.push({ id: allocUid(state, 'pcard'), kind: 'planet', key: favPlanet.key, edition: 'none', taken: false });
          continue;
        }
      }
      const planet = pickConsumableDefFromPool(state, 'Planet', `${slotKey}_planet`, usedKeys);
      const pKey = planet?.key ?? 'c_pluto';
      usedKeys.add(pKey);
      cards.push({ id: allocUid(state, 'pcard'), kind: 'planet', key: pKey, edition: 'none', taken: false });
    } else if (kind === 'Buffoon') {
      const def = pickJokerDefFromPool(state, slotKey, { excludeKeys: usedKeys });
      const jKey = def?.key ?? 'j_joker';
      usedKeys.add(jKey);
      const edition = rollEdition(state, `${slotKey}_ed`, 1, true);
      const stickers = rollStakeStickers(state, def ?? undefined, slotKey);
      cards.push({
        id: allocUid(state, 'pcard'),
        kind: 'joker',
        key: jKey,
        edition,
        eternal: stickers.eternal,
        perishable: stickers.perishable,
        rental: stickers.rental,
        taken: false,
      });
    } else {
      // Standard Pack: playing cards with possible enhancement, edition, seal
      const suit = pickRandom(SUITS, state.rng, `${slotKey}_suit`) ?? 'Spades';
      const rank = pickRandom(RANKS, state.rng, `${slotKey}_rank`) ?? 'Ace';
      const enhancement: EnhancementId =
        nextRandom(state.rng, `${slotKey}_enh_roll`) < 0.4
          ? (pickRandom(ENHANCEMENT_POOL, state.rng, `${slotKey}_enh`) ?? 'm_bonus')
          : 'none';
      const edition: EditionId =
        nextRandom(state.rng, `${slotKey}_ed_roll`) < 0.2
          ? rollEdition(state, `${slotKey}_ed`, 1, false)
          : 'none';
      const seal: SealId =
        nextRandom(state.rng, `${slotKey}_seal_roll`) < 0.2
          ? (pickRandom(SEAL_POOL, state.rng, `${slotKey}_seal`) ?? 'Gold')
          : 'none';
      cards.push({
        id: allocUid(state, 'pcard'),
        kind: 'playing_card',
        key: `${suit}_${rank}`,
        edition,
        enhancement,
        seal,
        suit,
        rank,
        taken: false,
      });
    }
  }

  const pack: PackState = {
    boosterKey,
    kind,
    size,
    cards,
    chooseRemaining: Math.max(1, choose),
    needsHand,
  };
  state.pack = pack;
  state.phase = 'PACK_OPEN';
  return pack;
}

// ============================================================================
// Exact Cashout Breakdown
// ============================================================================

export function computeCashoutBreakdown(state: SimState): CashoutBreakdown {
  const rows: CashoutRow[] = [];
  const blind = getActiveBlind(state);
  const deckCfg = DECK_MAP[state.deckId]?.config;

  // 1. Blind Reward ($0 for Small Blind on Red Stake+ or noReward challenge)
  const blindDollars = state.tracking.noReward
    ? 0
    : blind.slot === 'Small' && state.stake >= 2
      ? 0
      : blind.dollars;
  if (blindDollars > 0) {
    rows.push({
      label: blind.name,
      dollars: blindDollars,
      color: PALETTE.GOLD,
    });
  }

  // 2. Remaining Hands Bonus (Green Deck: $2/hand; standard: $1/hand)
  if (!state.tracking.noExtraHandMoney) {
    const handBonus = deckCfg?.extraHandBonus ?? 1;
    if (state.handsLeft > 0 && handBonus > 0) {
      rows.push({
        label: 'Remaining Hands',
        detail: `${state.handsLeft} x $${handBonus}`,
        dollars: state.handsLeft * handBonus,
        color: PALETTE.CHIPS,
      });
    }
  }

  // 3. Remaining Discards Bonus (Green Deck: $1/discard)
  const discardBonus = deckCfg?.extraDiscardBonus ?? 0;
  if (state.discardsLeft > 0 && discardBonus > 0) {
    rows.push({
      label: 'Remaining Discards',
      detail: `${state.discardsLeft} x $${discardBonus}`,
      dollars: state.discardsLeft * discardBonus,
      color: PALETTE.MULT,
    });
  }

  // 4. Interest ($1 per $5 up to interestCap, boosted by To the Moon, disabled if noInterest)
  if (!state.tracking.noInterest && state.dollars >= 5) {
    const perFive = state.interestAmount + countActiveJoker(state, 'j_to_the_moon');
    const capped = Math.min(state.dollars, state.interestCap);
    const steps = Math.floor(capped / 5);
    const interest = steps * perFive;
    if (interest > 0) {
      rows.push({
        label: 'Interest',
        detail: `$${perFive} per $5`,
        dollars: interest,
        color: PALETTE.MONEY,
      });
    }
  }

  // 5. Gold Cards held in hand (+$3 each, retriggered by Red Seal & Mime)
  const heldCards = state.hand
    .map((id) => getCardById(state, id))
    .filter((c): c is CardInstance => Boolean(c));
  const probMultiplier = getProbabilityMultiplier(state.jokers);
  const rand = (k: string) => nextRandom(state.rng, k);
  const randInt = (k: string, max: number) => nextRandomInt(state.rng, k, max);
  const isFace = (c: CardInstance) => isCardFace(c, state.jokers);
  const isSuit = (c: CardInstance, s: Suit) => isCardSuit(c, s, state.jokers);

  let goldCardDollars = 0;
  for (let i = 0; i < heldCards.length; i++) {
    const card = heldCards[i];
    if (card.debuffed || card.enhancement !== 'm_gold') continue;
    let triggers = 1 + (card.seal === 'Red' ? 1 : 0);
    for (let j = 0; j < state.jokers.length; j++) {
      const resolved = resolveCopiedJoker(state.jokers, j);
      if (!resolved) continue;
      const rep = evaluateJokerHook(resolved.target.key, {
        stage: 'repetition_hand',
        state,
        joker: resolved.target,
        jokerIndex: resolved.targetIndex,
        isBlueprint: resolved.targetIndex !== j,
        blueprintSource: resolved.targetIndex !== j ? state.jokers[j] : undefined,
        card,
        heldCards,
        probMultiplier,
        rand,
        randInt,
        isFace,
        isSuit,
      });
      if (rep?.repetitions && rep.repetitions > 0) {
        triggers += rep.repetitions;
      }
    }
    goldCardDollars += 3 * triggers;
  }
  if (goldCardDollars > 0) {
    rows.push({
      label: 'Gold Cards',
      dollars: goldCardDollars,
      color: PALETTE.GOLD,
    });
  }

  // 6. Joker calc_dollar_bonus hooks
  for (let i = 0; i < state.jokers.length; i++) {
    const joker = state.jokers[i];
    if (joker.debuffed) continue;
    const res = evaluateJokerHook(joker.key, {
      stage: 'calc_dollar_bonus',
      state,
      joker,
      jokerIndex: i,
      heldCards,
      probMultiplier,
      rand,
      randInt,
      isFace,
      isSuit,
    });
    if (res?.dollars && res.dollars > 0) {
      rows.push({
        label: JOKER_MAP[joker.key]?.name ?? joker.key,
        dollars: Math.floor(res.dollars),
        color: PALETTE.GOLD,
      });
    }
  }

  // 7. Investment Tag on Boss Blind clear (+$25 each)
  if (blind.slot === 'Boss') {
    let investCount = 0;
    for (let i = 0; i < state.tags.length; i++) {
      if (state.tags[i] === 'tag_investment') investCount++;
    }
    if (investCount > 0) {
      rows.push({
        label: 'Investment Tag',
        detail: investCount > 1 ? `${investCount} x $25` : undefined,
        dollars: 25 * investCount,
        color: PALETTE.GOLD,
      });
    }
  }

  // 8. Rental Jokers (-$3 each)
  let rentalCount = 0;
  for (let i = 0; i < state.jokers.length; i++) {
    if (state.jokers[i].rental) rentalCount++;
  }
  if (rentalCount > 0) {
    rows.push({
      label: 'Rental Jokers',
      detail: `${rentalCount} x -$3`,
      dollars: -3 * rentalCount,
      color: PALETTE.RENTAL,
    });
  }

  const total = rows.reduce((acc, row) => acc + safeNum(row.dollars, 0), 0);
  return {
    rows,
    total,
    blindKey: blind.key,
  };
}
