import {
  PALETTE,
  POKER_HAND_IDS,
  RANKS,
  SUITS,
  type BossWarningInfo,
  type CardInstance,
  type ConsumablePreviewInfo,
  type ConsumableSet,
  type DeckBreakdown,
  type DeckCellStats,
  type JokerInstance,
  type JokerLiveMeta,
  type PokerHandId,
  type Rank,
  type SimState,
  type Suit,
} from '../contracts/index.ts';
import { BLIND_MAP, CONSUMABLE_MAP, JOKER_MAP } from '../data/index.ts';
import { canUseConsumable, getConsumableSelectRange } from './consumables.ts';
import { evaluatePokerHand, isCardFace } from './poker.ts';
import {
  PLANET_HAND_FALLBACK,
  getActiveBlind,
  getEffectiveConsumableSlots,
  getEffectiveHandSize,
  getEffectiveJokerSlots,
  getProbabilityMultiplier,
  inferConsumableSet,
  resolveCopiedJoker,
} from './shop.ts';

// ============================================================================
// Pure Internal Helpers (Zero DOM, Zero RNG Mutation, Zero State Mutation)
// ============================================================================

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function getStateNum(
  stateObj: Record<string, number | string | boolean | null>,
  keys: readonly string[],
  fallback: number
): number {
  for (let i = 0; i < keys.length; i++) {
    const v = stateObj[keys[i]];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return fallback;
}

function buildDeckIndex(state: SimState): Map<string, CardInstance> {
  const byId = new Map<string, CardInstance>();
  for (let i = 0; i < state.fullDeck.length; i++) {
    byId.set(state.fullDeck[i].id, state.fullDeck[i]);
  }
  return byId;
}

function getOrderedSelectedCards(
  state: SimState,
  targetCardIds: readonly string[],
  deckById: Map<string, CardInstance>
): CardInstance[] {
  if (targetCardIds.length === 0) return [];
  const selectedSet = new Set(targetCardIds);
  const out: CardInstance[] = [];
  for (let i = 0; i < state.hand.length; i++) {
    const id = state.hand[i];
    if (selectedSet.has(id)) {
      const card = deckById.get(id);
      if (card) out.push(card);
    }
  }
  return out;
}

function formatCardShort(card: CardInstance): string {
  if (card.faceDown) return 'Face-down card';
  if (card.enhancement === 'm_stone') return 'Stone Card';
  return `${card.rank} of ${card.suit}`;
}

function stepRankUpLabel(rank: Rank): Rank {
  const idx = RANKS.indexOf(rank);
  if (idx < 0) return 'Ace';
  return RANKS[(idx + 1) % RANKS.length];
}

function getObeliskAvoidHands(state: SimState): { maxPlayed: number; avoidHands: PokerHandId[] } {
  let maxPlayed = 0;
  for (let i = 0; i < POKER_HAND_IDS.length; i++) {
    const hl = state.handLevels[POKER_HAND_IDS[i]];
    if (hl && hl.visible && hl.played > maxPlayed) {
      maxPlayed = hl.played;
    }
  }
  if (maxPlayed <= 0) {
    return { maxPlayed: 0, avoidHands: [] };
  }
  const avoidHands: PokerHandId[] = [];
  for (let i = 0; i < POKER_HAND_IDS.length; i++) {
    const id = POKER_HAND_IDS[i];
    const hl = state.handLevels[id];
    if (hl && hl.visible && hl.played === maxPlayed) {
      avoidHands.push(id);
    }
  }
  return { maxPlayed, avoidHands };
}

function calcStencilXMult(state: SimState): number {
  const effectiveSlots = getEffectiveJokerSlots(state);
  let nonStencilCount = 0;
  for (let i = 0; i < state.jokers.length; i++) {
    if (state.jokers[i].key !== 'j_stencil') nonStencilCount++;
  }
  return Math.max(1, effectiveSlots - nonStencilCount);
}

function inspectCopyChainFailure(
  jokers: readonly JokerInstance[],
  startIndex: number
): { copyingName: string; isNoTarget: boolean } {
  const visited = new Set<number>([startIndex]);
  let currIndex = startIndex;

  while (true) {
    const curr = jokers[currIndex];
    if (!curr) return { copyingName: 'No target', isNoTarget: true };
    if (curr.debuffed) {
      if (currIndex === startIndex) return { copyingName: 'No target', isNoTarget: true };
      return {
        copyingName: JOKER_MAP[curr.key]?.name ?? curr.key,
        isNoTarget: false,
      };
    }

    let nextIndex = -1;
    if (curr.key === 'j_blueprint') {
      nextIndex = currIndex + 1;
    } else if (curr.key === 'j_brainstorm') {
      nextIndex = 0;
    } else {
      return {
        copyingName: JOKER_MAP[curr.key]?.name ?? curr.key,
        isNoTarget: false,
      };
    }

    if (nextIndex < 0 || nextIndex >= jokers.length) {
      return { copyingName: 'No target', isNoTarget: true };
    }
    if (visited.has(nextIndex)) {
      return { copyingName: 'No target', isNoTarget: true };
    }
    visited.add(nextIndex);
    currIndex = nextIndex;
  }
}

const DEBUFF_BOSS_KEYS = new Set([
  'bl_plant',
  'bl_club',
  'bl_goad',
  'bl_head',
  'bl_window',
  'bl_pillar',
]);

// ============================================================================
// 1. Cerulean Bell Forced Card Query
// ============================================================================

/**
 * Returns the card ID forced into selection by Cerulean Bell when active in PLAYING,
 * or null otherwise. Pure read-only query with zero side effects.
 */
export function getForcedCardId(state: SimState): string | null {
  if (state.phase !== 'PLAYING') return null;
  const blind = getActiveBlind(state);
  if (!blind || blind.slot !== 'Boss' || blind.key !== 'bl_final_bell' || blind.disabled) {
    return null;
  }
  const forcedId = state.tracking.ceruleanBellForcedCardId;
  if (!forcedId || !state.hand.includes(forcedId)) return null;
  return forcedId;
}

// ============================================================================
// 2. Boss Blind Tactical Hand Warning Query
// ============================================================================

/**
 * Analyzes the currently active non-disabled Boss Blind against current card selection
 * and round state during PLAYING, returning a crisp block/warn/info banner or null.
 */
export function getBossHandWarning(state: SimState): BossWarningInfo | null {
  if (state.phase !== 'PLAYING') return null;
  const blind = getActiveBlind(state);
  if (!blind || blind.slot !== 'Boss' || blind.disabled) return null;

  const bossName = blind.name || BLIND_MAP[blind.key]?.name || blind.key;
  const deckById = buildDeckIndex(state);
  const selectedCards = getOrderedSelectedCards(state, state.selectedCardIds, deckById);
  const handEval =
    selectedCards.length > 0 ? evaluatePokerHand(selectedCards, state.jokers) : null;

  switch (blind.key) {
    // ---- BLOCKING BOSSES (Hand will score 0!) ----
    case 'bl_psychic': {
      if (selectedCards.length > 0 && selectedCards.length < 5) {
        return {
          severity: 'block',
          bossName,
          message: `Must play 5 cards (${selectedCards.length}/5 selected) — hand will not score!`,
        };
      }
      if (selectedCards.length === 0) {
        return {
          severity: 'info',
          bossName,
          message: 'Must play 5 cards for hand to score',
        };
      }
      return null;
    }

    case 'bl_eye': {
      if (handEval && state.tracking.playedHandTypesThisRound.includes(handEval.handId)) {
        return {
          severity: 'block',
          bossName,
          message: `${handEval.handId} already played this round — hand will not score!`,
        };
      }
      if (selectedCards.length === 0 && state.tracking.playedHandTypesThisRound.length > 0) {
        return {
          severity: 'info',
          bossName,
          message: `No repeat hands (played: ${state.tracking.playedHandTypesThisRound.join(', ')})`,
        };
      }
      return null;
    }

    case 'bl_mouth': {
      const lockedHand = state.tracking.firstHandTypeThisRound;
      if (handEval && lockedHand !== null && handEval.handId !== lockedHand) {
        return {
          severity: 'block',
          bossName,
          message: `Only ${lockedHand} allowed this round — hand will not score!`,
        };
      }
      if (lockedHand !== null && selectedCards.length === 0) {
        return {
          severity: 'info',
          bossName,
          message: `Only ${lockedHand} will score this round`,
        };
      }
      if (lockedHand === null && handEval) {
        return {
          severity: 'info',
          bossName,
          message: `Playing ${handEval.handId} locks this round to ${handEval.handId} only`,
        };
      }
      return null;
    }

    // ---- WARNING BOSSES (Severe penalty or debuff) ----
    case 'bl_final_leaf': {
      if (!state.tracking.verdantLeafSold) {
        return {
          severity: 'warn',
          bossName,
          message: 'All cards debuffed until 1 Joker is sold!',
        };
      }
      return null;
    }

    case 'bl_arm': {
      if (handEval) {
        const hl = state.handLevels[handEval.handId];
        if (hl && hl.level > 1) {
          return {
            severity: 'warn',
            bossName,
            message: `${handEval.handId} will be downgraded from Lv.${hl.level} to Lv.${hl.level - 1}`,
          };
        }
      }
      return null;
    }

    case 'bl_ox': {
      const targetHand = state.tracking.oxMostPlayedHand;
      if (handEval && handEval.handId === targetHand) {
        return {
          severity: 'warn',
          bossName,
          message: `Playing ${targetHand} sets money ($${state.dollars}) to $0!`,
        };
      }
      if (selectedCards.length === 0) {
        return {
          severity: 'info',
          bossName,
          message: `Playing ${targetHand} sets money to $0`,
        };
      }
      return null;
    }

    case 'bl_tooth': {
      if (selectedCards.length > 0) {
        return {
          severity: 'warn',
          bossName,
          message: `Lose -$${selectedCards.length} ($1 per card played)`,
        };
      }
      return {
        severity: 'info',
        bossName,
        message: 'Lose $1 per card played',
      };
    }

    case 'bl_hook': {
      if (selectedCards.length > 0) {
        const remainingHeld = Math.max(0, state.hand.length - selectedCards.length);
        const willDiscard = Math.min(2, remainingHeld);
        if (willDiscard > 0) {
          return {
            severity: 'warn',
            bossName,
            message: `Will discard ${willDiscard} random held card${willDiscard === 1 ? '' : 's'} before scoring`,
          };
        }
        return null;
      }
      if (state.hand.length > 0) {
        return {
          severity: 'warn',
          bossName,
          message: 'Discards 2 random held cards per hand played',
        };
      }
      return null;
    }

    case 'bl_flint': {
      if (handEval) {
        const hl = state.handLevels[handEval.handId];
        const baseC = hl ? hl.chips : 5;
        const baseM = hl ? hl.mult : 1;
        const halfC = Math.max(1, Math.floor(baseC * 0.5 + 0.5));
        const halfM = Math.max(1, Math.floor(baseM * 0.5 + 0.5));
        return {
          severity: 'warn',
          bossName,
          message: `Base Chips & Mult halved (${baseC}x${baseM} -> ${halfC}x${halfM})`,
        };
      }
      return {
        severity: 'warn',
        bossName,
        message: 'Base Chips and Mult are halved',
      };
    }

    // ---- INFO BOSSES ----
    case 'bl_final_bell': {
      const forcedId = getForcedCardId(state);
      if (forcedId) {
        const forcedCard = deckById.get(forcedId);
        const label = forcedCard ? formatCardShort(forcedCard) : '1 card';
        return {
          severity: 'info',
          bossName,
          message: `${label} is forced into selection`,
        };
      }
      return null;
    }

    case 'bl_final_heart': {
      if (state.tracking.crimsonHeartDisabledJokerId) {
        const disabled = state.jokers.find(
          (j) => j.id === state.tracking.crimsonHeartDisabledJokerId
        );
        const jName = disabled ? (JOKER_MAP[disabled.key]?.name ?? disabled.key) : '1 Joker';
        return {
          severity: 'info',
          bossName,
          message: `${jName} is disabled for this hand`,
        };
      }
      return null;
    }

    default: {
      // Suit / Face / Pillar debuff bosses (and any debuffed card warnings)
      if (DEBUFF_BOSS_KEYS.has(blind.key) && selectedCards.length > 0 && handEval) {
        const scoringCards = handEval.scoringCards;
        const debuffedScoring = scoringCards.filter((c) => c.debuffed).length;
        const debuffedSelected = selectedCards.filter((c) => c.debuffed).length;

        if (scoringCards.length > 0 && debuffedScoring === scoringCards.length) {
          return {
            severity: 'warn',
            bossName,
            message: `All ${debuffedScoring} scoring card${debuffedScoring === 1 ? '' : 's'} debuffed by ${bossName}!`,
          };
        }
        if (debuffedSelected > 0) {
          return {
            severity: 'info',
            bossName,
            message: `${debuffedSelected} selected card${debuffedSelected === 1 ? '' : 's'} debuffed by ${bossName}`,
          };
        }
      }
      return null;
    }
  }
}

// ============================================================================
// 3. Live Dynamic Consumable Preview (All 22 Tarots, 12 Planets, 18 Spectrals)
// ============================================================================

const SELECTION_ACTION_LABELS: Record<string, string> = {
  c_magician: 'Enhances selected to Lucky Cards',
  c_empress: 'Enhances selected to Mult Cards (+4 Mult)',
  c_heirophant: 'Enhances selected to Bonus Cards (+30 Chips)',
  c_hierophant: 'Enhances selected to Bonus Cards (+30 Chips)',
  c_lovers: 'Enhances selected to Wild Card (any suit)',
  c_chariot: 'Enhances selected to Steel Card (X1.5 held)',
  c_justice: 'Enhances selected to Glass Card (X2 Mult, 1/4 shatter)',
  c_hanged_man: 'Permanently destroys selected card(s)',
  c_devil: 'Enhances selected to Gold Card ($3 held at end of round)',
  c_tower: 'Enhances selected to Stone Card (+50 Chips, always scores)',
  c_star: 'Converts selected card(s) to Diamonds',
  c_moon: 'Converts selected card(s) to Clubs',
  c_sun: 'Converts selected card(s) to Hearts',
  c_world: 'Converts selected card(s) to Spades',
  c_talisman: 'Adds Gold Seal (+$3 when scored)',
  c_aura: 'Adds Foil, Holographic, or Polychrome edition',
  c_deja_vu: 'Adds Red Seal (retriggers 1 time)',
  c_trance: 'Adds Blue Seal (creates Planet if held at round end)',
  c_medium: 'Adds Purple Seal (creates Tarot when discarded)',
  c_cryptid: 'Creates 2 exact copies in hand and deck',
};

/**
 * Returns a live, dynamic tactical preview for any Tarot, Planet, or Spectral card.
 * Consistent with canUseConsumable and strictly read-only.
 */
export function getConsumablePreview(
  state: SimState,
  consumableKey: string,
  opts?: { fromInventory?: boolean; targetCardIds?: readonly string[] }
): ConsumablePreviewInfo {
  const def = CONSUMABLE_MAP[consumableKey];
  const set: ConsumableSet = def?.set ?? inferConsumableSet(consumableKey);
  const inOpenPack =
    state.phase === 'PACK_OPEN' &&
    Boolean(state.pack?.cards.some((c) => !c.taken && c.key === consumableKey));
  const heldInTray = state.consumables.some((c) => c.key === consumableKey);
  const freeingOneSlot = opts?.fromInventory ?? (heldInTray && !inOpenPack);
  const targetIds = opts?.targetCardIds ?? state.selectedCardIds;

  const validation = canUseConsumable(state, consumableKey, targetIds, freeingOneSlot);
  const effectiveConsSlots = getEffectiveConsumableSlots(state);
  const freeConsSlots = Math.max(
    0,
    effectiveConsSlots - state.consumables.length + (freeingOneSlot ? 1 : 0)
  );
  const effectiveJokerSlots = getEffectiveJokerSlots(state);
  const freeJokerSlots = Math.max(0, effectiveJokerSlots - state.jokers.length);
  const probMult = getProbabilityMultiplier(state.jokers);

  // ---- PLANETS (all 12) ----
  const planetHand: PokerHandId | undefined = def?.handType ?? PLANET_HAND_FALLBACK[consumableKey];
  if (set === 'Planet' && planetHand) {
    const hl = state.handLevels[planetHand];
    const curLv = hl ? hl.level : 1;
    const nextLv = curLv + 1;
    const lChips = hl ? hl.lChips : 10;
    const lMult = hl ? hl.lMult : 1;
    const nextChips = (hl ? hl.chips : 5) + lChips;
    const nextMult = (hl ? hl.mult : 1) + lMult;
    return {
      headline: `${planetHand}: Lv.${curLv} -> Lv.${nextLv}`,
      detail: `+${lChips} Chips, +${lMult} Mult (new base: ${nextChips} x ${nextMult})`,
      canUseNow: validation.ok,
      reason: validation.reason,
    };
  }

  // ---- SELECTION-TARGETED TAROTS & SPECTRALS ----
  const range = getConsumableSelectRange(consumableKey);
  if (range.min > 0) {
    const deckById = buildDeckIndex(state);
    const selectedCards = getOrderedSelectedCards(state, targetIds, deckById);
    const rangeLabel =
      range.min === range.max
        ? `Select ${range.min} card${range.min === 1 ? '' : 's'}`
        : `Select ${range.min}-${range.max} cards`;

    if (!validation.ok) {
      let detail = SELECTION_ACTION_LABELS[consumableKey] ?? def?.desc ?? 'Target cards in hand';
      if (consumableKey === 'c_death') {
        detail = `Converts left card into right card (${selectedCards.length}/2 selected)`;
      } else if (consumableKey === 'c_strength') {
        detail = `Increases rank of 1-2 selected cards by +1 (${selectedCards.length}/${range.max} selected)`;
      } else if (consumableKey === 'c_aura' && selectedCards.length === 1 && selectedCards[0].edition !== 'none') {
        detail = `${formatCardShort(selectedCards[0])} already has an edition`;
      } else if (state.hand.length === 0) {
        detail = 'Must have cards in hand to target';
      } else {
        detail = `${detail} (${selectedCards.length}/${range.max} selected)`;
      }
      return {
        headline: state.hand.length === 0 ? 'Requires cards in hand' : rangeLabel,
        detail,
        canUseNow: false,
        reason: validation.reason,
      };
    }

    // Valid selection ready!
    if (consumableKey === 'c_death' && selectedCards.length === 2) {
      return {
        headline: `Ready: ${formatCardShort(selectedCards[0])} -> ${formatCardShort(selectedCards[1])}`,
        detail: 'Left selected card becomes an exact copy of right selected card',
        canUseNow: true,
      };
    }
    if (consumableKey === 'c_strength') {
      const steps = selectedCards.map((c) =>
        c.enhancement === 'm_stone'
          ? 'Stone'
          : `${c.rank} -> ${stepRankUpLabel(c.rank)}`
      );
      return {
        headline: `Ready: ${selectedCards.length} card${selectedCards.length === 1 ? '' : 's'} selected`,
        detail: `Rank up: ${steps.join(', ')}`,
        canUseNow: true,
      };
    }

    return {
      headline: `Ready: ${selectedCards.length} card${selectedCards.length === 1 ? '' : 's'} selected`,
      detail: SELECTION_ACTION_LABELS[consumableKey] ?? def?.desc ?? 'Apply to selected cards',
      canUseNow: true,
    };
  }

  // ---- SPECIFIC DYNAMIC TAROTS & SPECTRALS ----
  switch (consumableKey) {
    case 'c_hermit': {
      const gain = Math.max(0, Math.min(20, Math.floor(state.dollars)));
      return {
        headline: `+$${gain}`,
        detail: `Doubles $${state.dollars}, max $20`,
        canUseNow: validation.ok,
        reason: validation.reason,
      };
    }

    case 'c_temperance': {
      let totalSell = 0;
      for (let i = 0; i < state.jokers.length; i++) {
        totalSell += Math.max(0, state.jokers[i].sellValue);
      }
      const gain = Math.min(50, totalSell);
      return {
        headline: `+$${gain}`,
        detail: `Total Joker sell value ($${totalSell} across ${state.jokers.length} Joker${state.jokers.length === 1 ? '' : 's'}, max $50)`,
        canUseNow: validation.ok,
        reason: validation.reason,
      };
    }

    case 'c_fool': {
      const lastKey = state.tracking.lastTarotPlanetKey;
      if (!lastKey || lastKey === 'c_fool') {
        return {
          headline: 'None played yet',
          detail: 'No previous Tarot or Planet card used this run',
          canUseNow: false,
          reason: validation.reason ?? 'No previous Tarot or Planet card to copy',
        };
      }
      const lastName = CONSUMABLE_MAP[lastKey]?.name ?? lastKey;
      return {
        headline: `Creates ${lastName}`,
        detail:
          freeConsSlots > 0
            ? `Copies last used Tarot/Planet (${freeConsSlots} slot${freeConsSlots === 1 ? '' : 's'} open)`
            : 'No free consumable slot',
        canUseNow: validation.ok,
        reason: validation.reason,
      };
    }

    case 'c_wheel_of_fortune': {
      const eligible = state.jokers.filter((j) => j.edition === 'none').length;
      return {
        headline: `${probMult} in 4 chance`,
        detail:
          eligible > 0
            ? `Adds Foil, Holo, or Polychrome to 1 of ${eligible} editionless Joker${eligible === 1 ? '' : 's'}`
            : 'No editionless Joker available',
        canUseNow: validation.ok,
        reason: validation.reason,
      };
    }

    case 'c_emperor': {
      const count = Math.min(2, freeConsSlots);
      return {
        headline:
          count > 0
            ? `Creates ${count} random Tarot${count === 1 ? '' : 's'}`
            : 'No free consumable slot',
        detail:
          count === 2
            ? `${freeConsSlots} consumable slots open (creates 2 Tarots)`
            : count === 1
              ? '1 consumable slot open (creates 1 of 2 Tarots)'
              : `Consumable tray full (${state.consumables.length}/${effectiveConsSlots})`,
        canUseNow: validation.ok,
        reason: validation.reason,
      };
    }

    case 'c_high_priestess': {
      const count = Math.min(2, freeConsSlots);
      return {
        headline:
          count > 0
            ? `Creates ${count} random Planet${count === 1 ? '' : 's'}`
            : 'No free consumable slot',
        detail:
          count === 2
            ? `${freeConsSlots} consumable slots open (creates 2 Planets)`
            : count === 1
              ? '1 consumable slot open (creates 1 of 2 Planets)'
              : `Consumable tray full (${state.consumables.length}/${effectiveConsSlots})`,
        canUseNow: validation.ok,
        reason: validation.reason,
      };
    }

    case 'c_judgement': {
      return {
        headline: freeJokerSlots > 0 ? 'Creates 1 random Joker' : 'No free Joker slot',
        detail:
          freeJokerSlots > 0
            ? `${freeJokerSlots} Joker slot${freeJokerSlots === 1 ? '' : 's'} open (${state.jokers.length}/${effectiveJokerSlots})`
            : `Joker tray full (${state.jokers.length}/${effectiveJokerSlots})`,
        canUseNow: validation.ok,
        reason: validation.reason,
      };
    }

    case 'c_wraith': {
      return {
        headline:
          freeJokerSlots > 0
            ? `Creates 1 Rare Joker ($${state.dollars} -> $0)`
            : 'No free Joker slot',
        detail:
          freeJokerSlots > 0
            ? `${freeJokerSlots} Joker slot${freeJokerSlots === 1 ? '' : 's'} open — sets money to $0!`
            : `Joker tray full (${state.jokers.length}/${effectiveJokerSlots})`,
        canUseNow: validation.ok,
        reason: validation.reason,
      };
    }

    case 'c_soul': {
      return {
        headline: freeJokerSlots > 0 ? 'Creates 1 Legendary Joker' : 'No free Joker slot',
        detail:
          freeJokerSlots > 0
            ? `${freeJokerSlots} Joker slot${freeJokerSlots === 1 ? '' : 's'} open (${state.jokers.length}/${effectiveJokerSlots})`
            : `Joker tray full (${state.jokers.length}/${effectiveJokerSlots})`,
        canUseNow: validation.ok,
        reason: validation.reason,
      };
    }

    case 'c_black_hole': {
      return {
        headline: 'All 12 Poker Hands +1 Lv',
        detail: 'Upgrades Chips & Mult for every poker hand simultaneously',
        canUseNow: validation.ok,
        reason: validation.reason,
      };
    }

    case 'c_familiar': {
      return {
        headline: 'Destroy 1, add 3 Enhanced Faces',
        detail:
          state.hand.length > 0
            ? `Destroys 1 random card from ${state.hand.length} in hand, adds 3 enhanced face cards`
            : 'Requires cards in hand',
        canUseNow: validation.ok,
        reason: validation.reason,
      };
    }

    case 'c_grim': {
      return {
        headline: 'Destroy 1, add 2 Enhanced Aces',
        detail:
          state.hand.length > 0
            ? `Destroys 1 random card from ${state.hand.length} in hand, adds 2 enhanced Aces`
            : 'Requires cards in hand',
        canUseNow: validation.ok,
        reason: validation.reason,
      };
    }

    case 'c_incantation': {
      return {
        headline: 'Destroy 1, add 4 Enhanced Numbers',
        detail:
          state.hand.length > 0
            ? `Destroys 1 random card from ${state.hand.length} in hand, adds 4 enhanced numbered cards`
            : 'Requires cards in hand',
        canUseNow: validation.ok,
        reason: validation.reason,
      };
    }

    case 'c_sigil': {
      return {
        headline: `Convert ${state.hand.length} cards to 1 random Suit`,
        detail:
          state.hand.length > 0
            ? `All ${state.hand.length} card${state.hand.length === 1 ? '' : 's'} in hand become one random suit`
            : 'Requires cards in hand',
        canUseNow: validation.ok,
        reason: validation.reason,
      };
    }

    case 'c_ouija': {
      const curHSize = getEffectiveHandSize(state);
      return {
        headline: `Convert ${state.hand.length} cards to 1 Rank (-1 Hand Size)`,
        detail:
          state.hand.length > 0
            ? `All cards in hand share 1 random rank; hand size ${curHSize} -> ${Math.max(1, curHSize - 1)}`
            : 'Requires cards in hand',
        canUseNow: validation.ok,
        reason: validation.reason,
      };
    }

    case 'c_ectoplasm': {
      const eligible = state.jokers.filter((j) => j.edition === 'none').length;
      const penalty = 1 + state.tracking.ectoplasmUses;
      const curHSize = getEffectiveHandSize(state);
      return {
        headline:
          eligible > 0 ? `Negative Joker (-${penalty} Hand Size)` : 'No editionless Joker',
        detail:
          eligible > 0
            ? `Makes 1 of ${eligible} eligible Joker${eligible === 1 ? '' : 's'} Negative (hand size ${curHSize} -> ${Math.max(1, curHSize - penalty)})`
            : 'No editionless Joker available',
        canUseNow: validation.ok,
        reason: validation.reason,
      };
    }

    case 'c_immolate': {
      const victims = Math.min(5, state.hand.length);
      return {
        headline: `Destroy ${victims} card${victims === 1 ? '' : 's'}, +$20`,
        detail:
          state.hand.length > 0
            ? `Destroys ${victims} random card${victims === 1 ? '' : 's'} from hand and awards +$20`
            : 'Requires cards in hand',
        canUseNow: validation.ok,
        reason: validation.reason,
      };
    }

    case 'c_ankh': {
      const nonEternal = state.jokers.filter((j) => !j.eternal).length;
      return {
        headline:
          state.jokers.length > 0
            ? `Copy 1 of ${state.jokers.length} Joker${state.jokers.length === 1 ? '' : 's'}`
            : 'No Joker to copy',
        detail: validation.ok
          ? `Clones 1 random Joker and destroys all other non-Eternal Jokers (${nonEternal} non-Eternal)`
          : (validation.reason ?? 'Cannot use Ankh'),
        canUseNow: validation.ok,
        reason: validation.reason,
      };
    }

    case 'c_hex': {
      const eligible = state.jokers.filter((j) => j.edition === 'none').length;
      return {
        headline:
          eligible > 0
            ? `Polychrome 1 of ${eligible} Joker${eligible === 1 ? '' : 's'}`
            : 'No editionless Joker',
        detail:
          eligible > 0
            ? 'Adds Polychrome (X1.5) to 1 random editionless Joker and destroys other non-Eternal Jokers'
            : 'No editionless Joker available',
        canUseNow: validation.ok,
        reason: validation.reason,
      };
    }

    default: {
      return {
        headline: def?.name ?? consumableKey,
        detail: def?.desc ?? 'Use consumable',
        canUseNow: validation.ok,
        reason: validation.reason,
      };
    }
  }
}

// ============================================================================
// 4. Live Joker Tactical Metadata (Blueprint/Brainstorm & Live Status Badges)
// ============================================================================

/**
 * Returns live Blueprint compatibility, active Blueprint/Brainstorm copy target,
 * and crisp status badges/colors for stateful, countdown, target, and odds Jokers.
 */
export function getJokerLiveMeta(state: SimState, joker: JokerInstance): JokerLiveMeta {
  const def = JOKER_MAP[joker.key];
  const blueprintCompat = def ? def.blueprintCompat : true;

  if (joker.debuffed) {
    const meta: JokerLiveMeta = {
      blueprintCompat,
      statusBadge: 'DEBUFFED',
      statusColor: PALETTE.RED,
    };
    if (joker.key === 'j_blueprint' || joker.key === 'j_brainstorm') {
      meta.copyingName = 'No target';
      meta.copyingCompatible = false;
    }
    return meta;
  }

  // ---- Blueprint & Brainstorm live copy resolution ----
  if (joker.key === 'j_blueprint' || joker.key === 'j_brainstorm') {
    const idx = state.jokers.findIndex((j) => j.id === joker.id);
    if (idx < 0) {
      return { blueprintCompat };
    }
    const resolved = resolveCopiedJoker(state.jokers, idx);
    if (resolved) {
      const targetName = JOKER_MAP[resolved.target.key]?.name ?? resolved.target.key;
      return {
        blueprintCompat,
        copyingName: targetName,
        copyingCompatible: true,
        statusBadge: `Copying ${targetName}`,
        statusColor: PALETTE.GREEN,
      };
    }
    const failure = inspectCopyChainFailure(state.jokers, idx);
    return {
      blueprintCompat,
      copyingName: failure.copyingName,
      copyingCompatible: false,
      statusBadge: failure.isNoTarget ? 'No target' : `Incompatible: ${failure.copyingName}`,
      statusColor: failure.isNoTarget ? PALETTE.GREY : PALETTE.RED,
    };
  }

  const probMult = getProbabilityMultiplier(state.jokers);
  const isPlaying = state.phase === 'PLAYING';
  const isFinalHand =
    (state.phase === 'PLAYING' && state.handsLeft === 1) ||
    (state.phase === 'SCORING' && state.handsLeft === 0);

  switch (joker.key) {
    case 'j_invisible': {
      const target = getStateNum(joker.state, ['extra'], 2);
      const cur = Math.min(target, getStateNum(joker.state, ['invis_rounds'], 0));
      return cur >= target
        ? { blueprintCompat, statusBadge: 'READY!', statusColor: PALETTE.GREEN }
        : { blueprintCompat, statusBadge: `${cur}/${target} Rounds`, statusColor: PALETTE.ORANGE };
    }

    case 'j_loyalty_card': {
      const every = getStateNum(joker.state, ['every'], 5);
      const rem = getStateNum(joker.state, ['remaining'], every);
      return rem <= 0
        ? { blueprintCompat, statusBadge: 'ACTIVE!', statusColor: PALETTE.GREEN }
        : { blueprintCompat, statusBadge: `${rem} Left`, statusColor: PALETTE.ORANGE };
    }

    case 'j_mail':
      return {
        blueprintCompat,
        statusBadge: `Discard ${state.tracking.mailRank}`,
        statusColor: PALETTE.GOLD,
      };

    case 'j_idol':
      return {
        blueprintCompat,
        statusBadge: `${state.tracking.idolRank} of ${state.tracking.idolSuit}`,
        statusColor: PALETTE.MULT,
      };

    case 'j_ancient':
      return {
        blueprintCompat,
        statusBadge: `${state.tracking.ancientSuit}`,
        statusColor: PALETTE.MULT,
      };

    case 'j_castle': {
      const chips = getStateNum(joker.state, ['chips'], 0);
      return {
        blueprintCompat,
        statusBadge:
          chips > 0 ? `${state.tracking.castleSuit} (+${chips})` : `${state.tracking.castleSuit}`,
        statusColor: PALETTE.CHIPS,
      };
    }

    case 'j_todo_list': {
      const target =
        typeof joker.state.poker_hand === 'string' && joker.state.poker_hand.length > 0
          ? joker.state.poker_hand
          : 'High Card';
      return {
        blueprintCompat,
        statusBadge: target,
        statusColor: PALETTE.GOLD,
      };
    }

    case 'j_obelisk': {
      const { avoidHands } = getObeliskAvoidHands(state);
      const xMult = getStateNum(joker.state, ['xMult', 'Xmult', 'x_mult'], 1);
      if (avoidHands.length === 1) {
        return {
          blueprintCompat,
          statusBadge: `Avoid ${avoidHands[0]}`,
          statusColor: PALETTE.RED,
        };
      }
      if (avoidHands.length > 1) {
        return {
          blueprintCompat,
          statusBadge: `Avoid ${avoidHands[0]} +${avoidHands.length - 1}`,
          statusColor: PALETTE.RED,
        };
      }
      return {
        blueprintCompat,
        statusBadge: `X${round2(xMult)} Mult`,
        statusColor: PALETTE.MULT,
      };
    }

    case 'j_burnt': {
      if (isPlaying) {
        return state.tracking.discardsUsedThisRound === 0 && state.discardsLeft > 0
          ? { blueprintCompat, statusBadge: '1st Discard Ready', statusColor: PALETTE.GREEN }
          : { blueprintCompat, statusBadge: 'Used This Round', statusColor: PALETTE.GREY };
      }
      return { blueprintCompat, statusBadge: '1st Discard', statusColor: PALETTE.ORANGE };
    }

    case 'j_dna': {
      if (isPlaying) {
        return state.tracking.handsPlayedThisRound === 0
          ? { blueprintCompat, statusBadge: '1st Hand Ready', statusColor: PALETTE.GREEN }
          : { blueprintCompat, statusBadge: 'Used This Round', statusColor: PALETTE.GREY };
      }
      return { blueprintCompat, statusBadge: '1st Hand', statusColor: PALETTE.CHIPS };
    }

    case 'j_sixth_sense': {
      if (isPlaying) {
        return state.tracking.handsPlayedThisRound === 0
          ? { blueprintCompat, statusBadge: '1st Hand Ready', statusColor: PALETTE.PURPLE }
          : { blueprintCompat, statusBadge: 'Used This Round', statusColor: PALETTE.GREY };
      }
      return { blueprintCompat, statusBadge: '1st Hand (Single 6)', statusColor: PALETTE.PURPLE };
    }

    case 'j_trading': {
      if (isPlaying) {
        return state.tracking.discardsUsedThisRound === 0 && state.discardsLeft > 0
          ? { blueprintCompat, statusBadge: '1st Discard Ready', statusColor: PALETTE.GOLD }
          : { blueprintCompat, statusBadge: 'Used This Round', statusColor: PALETTE.GREY };
      }
      return { blueprintCompat, statusBadge: '1st Discard', statusColor: PALETTE.GOLD };
    }

    case 'j_dusk':
      return isFinalHand
        ? { blueprintCompat, statusBadge: 'Final Hand!', statusColor: PALETTE.ORANGE }
        : { blueprintCompat };

    case 'j_acrobat':
      return isFinalHand
        ? { blueprintCompat, statusBadge: 'Final Hand!', statusColor: PALETTE.MULT }
        : { blueprintCompat };

    case 'j_gros_michel':
      return {
        blueprintCompat,
        statusBadge: `${probMult} in 6 Extinct`,
        statusColor: probMult >= 6 ? PALETTE.RED : PALETTE.GOLD,
      };

    case 'j_cavendish':
      return {
        blueprintCompat,
        statusBadge: `${probMult} in 1000 Extinct`,
        statusColor: PALETTE.GOLD,
      };

    case 'j_luchador': {
      const blind = getActiveBlind(state);
      const bossActive =
        blind &&
        blind.slot === 'Boss' &&
        !blind.disabled &&
        (state.phase === 'PLAYING' || state.phase === 'SCORING' || blind.status === 'Current');
      return bossActive
        ? { blueprintCompat, statusBadge: 'Sell to Disable Boss!', statusColor: PALETTE.GREEN }
        : { blueprintCompat };
    }

    case 'j_selzer': {
      const rem = getStateNum(joker.state, ['extra'], 10);
      return {
        blueprintCompat,
        statusBadge: `${rem} Hand${rem === 1 ? '' : 's'} Left`,
        statusColor: PALETTE.CHIPS,
      };
    }

    case 'j_ice_cream': {
      const chips = getStateNum(joker.state, ['chips'], 100);
      return { blueprintCompat, statusBadge: `+${chips} Chips`, statusColor: PALETTE.CHIPS };
    }

    case 'j_popcorn': {
      const mult = getStateNum(joker.state, ['mult'], 20);
      return { blueprintCompat, statusBadge: `+${mult} Mult`, statusColor: PALETTE.MULT };
    }

    case 'j_turtle_bean': {
      const hSize = getStateNum(joker.state, ['h_size'], 5);
      return { blueprintCompat, statusBadge: `+${hSize} Hand Size`, statusColor: PALETTE.GREEN };
    }

    case 'j_ramen': {
      const xMult = getStateNum(joker.state, ['x_mult', 'xMult', 'Xmult'], 2);
      return { blueprintCompat, statusBadge: `X${round2(xMult)} Mult`, statusColor: PALETTE.MULT };
    }

    case 'j_yorick': {
      const threshold = getStateNum(joker.state, ['discards'], 23);
      const rem = getStateNum(joker.state, ['yorick_discards'], threshold);
      return {
        blueprintCompat,
        statusBadge: `${rem} Discards Left`,
        statusColor: PALETTE.PURPLE,
      };
    }

    case 'j_drivers_license': {
      let enhanced = 0;
      for (let i = 0; i < state.fullDeck.length; i++) {
        if (state.fullDeck[i].enhancement !== 'none') enhanced++;
      }
      return enhanced >= 16
        ? { blueprintCompat, statusBadge: 'ACTIVE! (X3)', statusColor: PALETTE.GREEN }
        : { blueprintCompat, statusBadge: `${enhanced}/16 Enhanced`, statusColor: PALETTE.ORANGE };
    }

    case 'j_mystic_summit':
      return isPlaying && state.discardsLeft === 0
        ? { blueprintCompat, statusBadge: 'ACTIVE!', statusColor: PALETTE.GREEN }
        : { blueprintCompat };

    case 'j_vagabond': {
      const cap = getStateNum(joker.state, ['extra'], 4);
      return state.dollars <= cap
        ? { blueprintCompat, statusBadge: 'ACTIVE!', statusColor: PALETTE.PURPLE }
        : { blueprintCompat };
    }

    case 'j_mr_bones': {
      if (isPlaying && state.targetChips > 0) {
        const needed = Math.ceil(state.targetChips * 0.25);
        return state.roundChips >= needed
          ? { blueprintCompat, statusBadge: 'Rescue Ready!', statusColor: PALETTE.GREEN }
          : { blueprintCompat, statusBadge: `Needs ${needed.toLocaleString()}`, statusColor: PALETTE.ORANGE };
      }
      return { blueprintCompat };
    }

    case 'j_space': {
      const odds = getStateNum(joker.state, ['extra'], 4);
      return { blueprintCompat, statusBadge: `${probMult} in ${odds}`, statusColor: PALETTE.CHIPS };
    }

    case 'j_bloodstone': {
      const odds = getStateNum(joker.state, ['odds'], 2);
      return { blueprintCompat, statusBadge: `${probMult} in ${odds}`, statusColor: PALETTE.MULT };
    }

    case 'j_8_ball':
      return { blueprintCompat, statusBadge: `${probMult} in 4`, statusColor: PALETTE.PURPLE };

    case 'j_business':
    case 'j_reserved_parking':
      return { blueprintCompat, statusBadge: `${probMult} in 2`, statusColor: PALETTE.GOLD };

    case 'j_hallucination':
      return { blueprintCompat, statusBadge: `${probMult} in 2`, statusColor: PALETTE.PURPLE };

    case 'j_egg':
      return { blueprintCompat, statusBadge: `Sell $${joker.sellValue}`, statusColor: PALETTE.GOLD };

    case 'j_rocket': {
      const d = getStateNum(joker.state, ['dollars'], 1);
      return { blueprintCompat, statusBadge: `+$${d}/Round`, statusColor: PALETTE.GOLD };
    }

    case 'j_stencil':
      return {
        blueprintCompat,
        statusBadge: `X${calcStencilXMult(state)} Mult`,
        statusColor: PALETTE.MULT,
      };

    case 'j_ride_the_bus':
    case 'j_green_joker':
    case 'j_red_card':
    case 'j_ceremonial':
    case 'j_flash':
    case 'j_trousers': {
      const mult = getStateNum(joker.state, ['mult'], 0);
      return { blueprintCompat, statusBadge: `+${mult} Mult`, statusColor: PALETTE.MULT };
    }

    case 'j_runner':
    case 'j_square':
    case 'j_wee': {
      const chips = getStateNum(joker.state, ['chips'], 0);
      return { blueprintCompat, statusBadge: `+${chips} Chips`, statusColor: PALETTE.CHIPS };
    }

    case 'j_constellation':
    case 'j_madness':
    case 'j_vampire':
    case 'j_hologram':
    case 'j_lucky_cat':
    case 'j_glass':
    case 'j_campfire':
    case 'j_hit_the_road':
    case 'j_caino': {
      const xMult = getStateNum(joker.state, ['x_mult', 'xMult', 'Xmult'], 1);
      return { blueprintCompat, statusBadge: `X${round2(xMult)} Mult`, statusColor: PALETTE.MULT };
    }

    case 'j_throwback': {
      const step = getStateNum(joker.state, ['extra'], 0.25);
      const xMult = round2(1 + step * state.tracking.skipsTotal);
      return { blueprintCompat, statusBadge: `X${xMult} Mult`, statusColor: PALETTE.MULT };
    }

    case 'j_fortune_teller':
      return {
        blueprintCompat,
        statusBadge: `+${state.tracking.tarotsUsedTotal} Mult`,
        statusColor: PALETTE.MULT,
      };

    default:
      return { blueprintCompat };
  }
}

// ============================================================================
// 5. Full 4x13 Deck Breakdown Matrix (Exact Remaining, Enhancements, Seals, Stone)
// ============================================================================

/**
 * Computes an exact 4-suit x 13-rank deck matrix plus totals for remaining draw pile,
 * face cards, enhancements, editions, seals, and Stone cards. Pure & read-only.
 */
export function getDeckBreakdown(state: SimState): DeckBreakdown {
  const drawSet = new Set(state.drawPile);

  const suitTotals = {} as Record<Suit, number>;
  const suitRemaining = {} as Record<Suit, number>;
  const rankTotals = {} as Record<Rank, number>;
  const rankRemaining = {} as Record<Rank, number>;
  const matrix = {} as Record<Suit, Record<Rank, DeckCellStats>>;

  for (let r = 0; r < RANKS.length; r++) {
    rankTotals[RANKS[r]] = 0;
    rankRemaining[RANKS[r]] = 0;
  }

  for (let s = 0; s < SUITS.length; s++) {
    const suit = SUITS[s];
    suitTotals[suit] = 0;
    suitRemaining[suit] = 0;
    const row = {} as Record<Rank, DeckCellStats>;
    for (let r = 0; r < RANKS.length; r++) {
      row[RANKS[r]] = { total: 0, remaining: 0, enhanced: 0, editioned: 0, sealed: 0 };
    }
    matrix[suit] = row;
  }

  let total = 0;
  let remaining = 0;
  let faceTotal = 0;
  let faceRemaining = 0;
  let enhancedTotal = 0;
  let editionedTotal = 0;
  let sealedTotal = 0;
  let stoneTotal = 0;
  let stoneRemaining = 0;

  for (let i = 0; i < state.fullDeck.length; i++) {
    const card = state.fullDeck[i];
    const inDraw = drawSet.has(card.id);
    const isStone = card.enhancement === 'm_stone';
    const isEnhanced = card.enhancement !== 'none';
    const isEditioned = card.edition !== 'none';
    const isSealed = card.seal !== 'none';

    total += 1;
    if (inDraw) remaining += 1;
    if (isEnhanced) enhancedTotal += 1;
    if (isEditioned) editionedTotal += 1;
    if (isSealed) sealedTotal += 1;

    if (isCardFace(card, state.jokers)) {
      faceTotal += 1;
      if (inDraw) faceRemaining += 1;
    }

    if (isStone) {
      stoneTotal += 1;
      if (inDraw) stoneRemaining += 1;
    } else {
      suitTotals[card.suit] += 1;
      rankTotals[card.rank] += 1;
      const cell = matrix[card.suit][card.rank];
      cell.total += 1;
      if (inDraw) {
        suitRemaining[card.suit] += 1;
        rankRemaining[card.rank] += 1;
        cell.remaining += 1;
      }
      if (isEnhanced) cell.enhanced += 1;
      if (isEditioned) cell.editioned += 1;
      if (isSealed) cell.sealed += 1;
    }
  }

  return {
    total,
    remaining,
    suitTotals,
    suitRemaining,
    rankTotals,
    rankRemaining,
    matrix,
    faceRemaining,
    faceTotal,
    enhancedTotal,
    editionedTotal,
    sealedTotal,
    stoneTotal,
    stoneRemaining,
  };
}
