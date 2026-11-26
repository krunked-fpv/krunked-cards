import {
  PALETTE,
  SUITS,
  type CardInstance,
  type JokerDef,
  type JokerEvalContext,
  type JokerHookFn,
  type JokerInstance,
  type PokerHandId,
  type Rank,
  type SimState,
  type Suit,
} from '../contracts/index.ts';

// ============================================================================
// Pure Shared Helpers for Uncommon Jokers
// ============================================================================

const FIBONACCI_RANKS = new Set<Rank>(['Ace', '2', '3', '5', '8']);
const HACK_RANKS = new Set<Rank>(['2', '3', '4', '5']);
const OTHER_THAN_CLUBS: readonly Suit[] = ['Hearts', 'Diamonds', 'Spades'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatNum(n: number): string {
  const r = round2(n);
  return Number.isInteger(r) ? String(r) : String(r);
}

function getStateNum(
  state: Record<string, number | string | boolean | null>,
  keys: readonly string[],
  fallback: number
): number {
  for (let i = 0; i < keys.length; i++) {
    const v = state[keys[i]];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return fallback;
}

function setXMultState(
  state: Record<string, number | string | boolean | null>,
  value: number
): void {
  const r = round2(value);
  state.x_mult = r;
  state.xMult = r;
  state.Xmult = r;
}

function getProbMult(state: SimState): number {
  let mult = 1;
  for (let i = 0; i < state.jokers.length; i++) {
    if (!state.jokers[i].debuffed && state.jokers[i].key === 'j_oops') {
      mult *= 2;
    }
  }
  return mult;
}

function getEffectiveJokerSlots(state: SimState): number {
  let neg = 0;
  for (let i = 0; i < state.jokers.length; i++) {
    if (state.jokers[i].edition === 'e_negative') neg++;
  }
  return Math.max(0, state.jokerSlots + neg);
}

function getEffectiveConsumableSlots(state: SimState): number {
  let neg = 0;
  for (let i = 0; i < state.consumables.length; i++) {
    if (state.consumables[i].edition === 'e_negative') neg++;
  }
  return Math.max(0, state.consumableSlots + neg);
}

function hasConsumableRoom(state: SimState): boolean {
  return state.consumables.length < getEffectiveConsumableSlots(state);
}

function isFirstHandOfRound(ctx: JokerEvalContext): boolean {
  const levels = Object.values(ctx.state.handLevels ?? {});
  let totalHandLevelPlays = 0;
  for (let i = 0; i < levels.length; i++) {
    totalHandLevelPlays += levels[i]?.playedThisRound ?? 0;
  }
  if (totalHandLevelPlays > 0) {
    return totalHandLevelPlays === 1;
  }
  return ctx.state.tracking.handsPlayedThisRound <= 1;
}

/**
 * Distinguishes the loss-check probe for Mr. Bones in scoring.ts
 * (when handsLeft <= 0 and roundChips < targetChips before mr_bones_save)
 * from the real end-of-round transition after winning or being rescued.
 */
function isMrBonesCheckProbe(state: SimState): boolean {
  return (
    state.handsLeft <= 0 &&
    state.targetChips > 0 &&
    state.roundChips < state.targetChips &&
    !state.lastHandBeats.some((b) => b.kind === 'mr_bones_save')
  );
}

function calcStencilXMult(state: SimState): number {
  const effectiveSlots = getEffectiveJokerSlots(state);
  let nonStencilCount = 0;
  for (let i = 0; i < state.jokers.length; i++) {
    if (state.jokers[i].key !== 'j_stencil') nonStencilCount++;
  }
  return Math.max(1, effectiveSlots - nonStencilCount);
}

function getStartingDeckSize(state: SimState): number {
  return state.deckId === 'b_abandoned' ? 40 : 52;
}

function countFullDeckEnhancement(state: SimState, enhancement: CardInstance['enhancement']): number {
  let count = 0;
  for (let i = 0; i < state.fullDeck.length; i++) {
    if (state.fullDeck[i].enhancement === enhancement) count++;
  }
  return count;
}

function countFullDeckRank(state: SimState, rank: Rank): number {
  let count = 0;
  for (let i = 0; i < state.fullDeck.length; i++) {
    const c = state.fullDeck[i];
    if (c.enhancement !== 'm_stone' && c.rank === rank) count++;
  }
  return count;
}

function countUniquePlanetsUsed(inst: JokerInstance, state: SimState): number {
  const raw = typeof inst.state.seen_planets === 'string' ? inst.state.seen_planets : '';
  const seen = new Set(raw.split(',').filter(Boolean));
  if (seen.size > 0) {
    return seen.size;
  }
  if (state.tracking.planetsUsedTotal <= 0) {
    return 0;
  }
  // Fallback when Planets were used before acquiring Satellite
  let leveledHands = 0;
  const levels = Object.values(state.handLevels ?? {});
  for (let i = 0; i < levels.length; i++) {
    if ((levels[i]?.level ?? 1) > 1) leveledHands++;
  }
  return Math.min(state.tracking.planetsUsedTotal, leveledHands);
}

/**
 * Exact bipartite matching over the 4 suits for Flower Pot.
 * Requires 4 distinct non-debuffed, non-Stone scoring cards that can cover
 * Hearts, Diamonds, Spades, and Clubs (respecting Wild cards & Smeared Joker).
 */
function hasAllFourScoringSuits(ctx: JokerEvalContext): boolean {
  const scoring = ctx.scoringHand ?? [];
  const eligible: CardInstance[] = [];
  for (let i = 0; i < scoring.length; i++) {
    const c = scoring[i];
    if (!c.debuffed && c.enhancement !== 'm_stone') {
      eligible.push(c);
    }
  }
  if (eligible.length < 4) return false;

  const used = new Array<boolean>(eligible.length).fill(false);
  const assignSuit = (suitIdx: number): boolean => {
    if (suitIdx === SUITS.length) return true;
    const targetSuit = SUITS[suitIdx];
    for (let i = 0; i < eligible.length; i++) {
      if (used[i]) continue;
      if (ctx.isSuit(eligible[i], targetSuit)) {
        used[i] = true;
        if (assignSuit(suitIdx + 1)) return true;
        used[i] = false;
      }
    }
    return false;
  };
  return assignSuit(0);
}

/**
 * Exact 2-card distinct matching for Seeing Double:
 * requires one non-debuffed non-Stone scoring Club card and one DISTINCT
 * non-debuffed non-Stone scoring card of any other suit (respecting Wild & Smeared).
 */
function hasSeeingDoubleSuits(ctx: JokerEvalContext): boolean {
  const scoring = ctx.scoringHand ?? [];
  const eligible: CardInstance[] = [];
  for (let i = 0; i < scoring.length; i++) {
    const c = scoring[i];
    if (!c.debuffed && c.enhancement !== 'm_stone') {
      eligible.push(c);
    }
  }
  if (eligible.length < 2) return false;

  for (let i = 0; i < eligible.length; i++) {
    if (!ctx.isSuit(eligible[i], 'Clubs')) continue;
    for (let j = 0; j < eligible.length; j++) {
      if (i === j) continue;
      for (let s = 0; s < OTHER_THAN_CLUBS.length; s++) {
        if (ctx.isSuit(eligible[j], OTHER_THAN_CLUBS[s])) {
          return true;
        }
      }
    }
  }
  return false;
}

// ============================================================================
// All 64 Uncommon Jokers (rarity === 2, sorted by order, 1:1 ground truth)
// ============================================================================

export const UNCOMMON_JOKERS: JokerDef[] = [
  {
    key: 'j_stencil',
    name: 'Joker Stencil',
    order: 17,
    rarity: 2,
    cost: 8,
    pos: { x: 2, y: 5 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: {},
    descTemplate: 'X1 Mult for each empty Joker slot. Joker Stencil included (Currently X1 Mult)',
    formatDesc: (_inst, state) =>
      `X1 Mult for each empty Joker slot. Joker Stencil included (Currently X${calcStencilXMult(state)} Mult)`,
  },
  {
    key: 'j_four_fingers',
    name: 'Four Fingers',
    order: 18,
    rarity: 2,
    cost: 7,
    pos: { x: 6, y: 6 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: {},
    descTemplate: 'All Flushes and Straights can be made with 4 cards',
    formatDesc: () => 'All Flushes and Straights can be made with 4 cards',
  },
  {
    key: 'j_mime',
    name: 'Mime',
    order: 19,
    rarity: 2,
    cost: 5,
    pos: { x: 4, y: 1 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 1 },
    descTemplate: 'Retrigger all card held in hand abilities',
    formatDesc: () => 'Retrigger all card held in hand abilities',
  },
  {
    key: 'j_ceremonial',
    name: 'Ceremonial Dagger',
    order: 21,
    rarity: 2,
    cost: 6,
    pos: { x: 5, y: 5 },
    blueprintCompat: true,
    perishableCompat: false,
    eternalCompat: true,
    config: { mult: 0 },
    descTemplate:
      'When Blind is selected, destroy Joker to the right and permanently add double its sell value to this Mult (Currently +0 Mult)',
    formatDesc: (inst) => {
      const mult = getStateNum(inst.state, ['mult'], 0);
      return `When Blind is selected, destroy Joker to the right and permanently add double its sell value to this Mult (Currently +${mult} Mult)`;
    },
  },
  {
    key: 'j_marble',
    name: 'Marble Joker',
    order: 24,
    rarity: 2,
    cost: 6,
    pos: { x: 3, y: 2 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 1 },
    descTemplate: 'Adds one Stone card to deck when Blind is selected',
    formatDesc: () => 'Adds one Stone card to deck when Blind is selected',
  },
  {
    key: 'j_loyalty_card',
    name: 'Loyalty Card',
    order: 25,
    rarity: 2,
    cost: 5,
    pos: { x: 4, y: 2 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { Xmult: 4, every: 5, remaining: 5 },
    descTemplate: 'X4 Mult every 6 hands played (5 remaining)',
    formatDesc: (inst) => {
      const xMult = getStateNum(inst.state, ['Xmult', 'xMult'], 4);
      const every = getStateNum(inst.state, ['every'], 5);
      const rem = getStateNum(inst.state, ['remaining'], every);
      const status = rem <= 0 ? 'Active!' : `${rem} remaining`;
      return `X${formatNum(xMult)} Mult every ${every + 1} hands played (${status})`;
    },
  },
  {
    key: 'j_dusk',
    name: 'Dusk',
    order: 28,
    rarity: 2,
    cost: 5,
    pos: { x: 4, y: 7 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 1 },
    descTemplate: 'Retrigger all played cards in final hand of round',
    formatDesc: () => 'Retrigger all played cards in final hand of round',
  },
  {
    key: 'j_fibonacci',
    name: 'Fibonacci',
    order: 31,
    rarity: 2,
    cost: 8,
    pos: { x: 1, y: 5 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 8 },
    descTemplate: 'Each played Ace, 2, 3, 5, or 8 gives +8 Mult when scored',
    formatDesc: (inst) => {
      const mult = getStateNum(inst.state, ['extra'], 8);
      return `Each played Ace, 2, 3, 5, or 8 gives +${mult} Mult when scored`;
    },
  },
  {
    key: 'j_steel_joker',
    name: 'Steel Joker',
    order: 32,
    rarity: 2,
    cost: 7,
    pos: { x: 7, y: 2 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 0.2 },
    descTemplate: 'Gives X0.2 Mult for each Steel Card in your full deck (Currently X1 Mult)',
    formatDesc: (inst, state) => {
      const step = getStateNum(inst.state, ['extra'], 0.2);
      const xMult = round2(1 + step * countFullDeckEnhancement(state, 'm_steel'));
      return `Gives X${formatNum(step)} Mult for each Steel Card in your full deck (Currently X${formatNum(xMult)} Mult)`;
    },
  },
  {
    key: 'j_hack',
    name: 'Hack',
    order: 36,
    rarity: 2,
    cost: 6,
    pos: { x: 5, y: 2 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 1 },
    descTemplate: 'Retrigger each played 2, 3, 4, or 5',
    formatDesc: () => 'Retrigger each played 2, 3, 4, or 5',
  },
  {
    key: 'j_pareidolia',
    name: 'Pareidolia',
    order: 37,
    rarity: 2,
    cost: 5,
    pos: { x: 6, y: 3 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: {},
    descTemplate: 'All cards are considered face cards',
    formatDesc: () => 'All cards are considered face cards',
  },
  {
    key: 'j_space',
    name: 'Space Joker',
    order: 45,
    rarity: 2,
    cost: 5,
    pos: { x: 3, y: 5 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 4 },
    descTemplate: '1 in 4 chance to upgrade level of played poker hand',
    formatDesc: (inst, state) => {
      const odds = getStateNum(inst.state, ['extra'], 4);
      return `${getProbMult(state)} in ${odds} chance to upgrade level of played poker hand`;
    },
  },
  {
    key: 'j_burglar',
    name: 'Burglar',
    order: 47,
    rarity: 2,
    cost: 6,
    pos: { x: 1, y: 10 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 3 },
    descTemplate: 'When Blind is selected, gain +3 Hands and lose all discards',
    formatDesc: (inst) => {
      const hands = getStateNum(inst.state, ['extra'], 3);
      return `When Blind is selected, gain +${hands} Hands and lose all discards`;
    },
  },
  {
    key: 'j_blackboard',
    name: 'Blackboard',
    order: 48,
    rarity: 2,
    cost: 6,
    pos: { x: 2, y: 10 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 3 },
    descTemplate: 'X3 Mult if all cards held in hand are Spades or Clubs',
    formatDesc: (inst) => {
      const xMult = getStateNum(inst.state, ['extra'], 3);
      return `X${formatNum(xMult)} Mult if all cards held in hand are Spades or Clubs`;
    },
  },
  {
    key: 'j_sixth_sense',
    name: 'Sixth Sense',
    order: 54,
    rarity: 2,
    cost: 6,
    pos: { x: 8, y: 10 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: {},
    descTemplate:
      'If first hand of round is a single 6, destroy it and create a Spectral card (Must have room)',
    formatDesc: () =>
      'If first hand of round is a single 6, destroy it and create a Spectral card (Must have room)',
  },
  {
    key: 'j_constellation',
    name: 'Constellation',
    order: 55,
    rarity: 2,
    cost: 6,
    pos: { x: 9, y: 10 },
    blueprintCompat: true,
    perishableCompat: false,
    eternalCompat: true,
    config: { extra: 0.1, Xmult: 1 },
    descTemplate:
      'This Joker gains X0.1 Mult every time a Planet card is used (Currently X1 Mult)',
    formatDesc: (inst) => {
      const step = getStateNum(inst.state, ['extra'], 0.1);
      const xMult = getStateNum(inst.state, ['x_mult', 'xMult', 'Xmult'], 1);
      return `This Joker gains X${formatNum(step)} Mult every time a Planet card is used (Currently X${formatNum(xMult)} Mult)`;
    },
  },
  {
    key: 'j_hiker',
    name: 'Hiker',
    order: 56,
    rarity: 2,
    cost: 5,
    pos: { x: 0, y: 11 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 5 },
    descTemplate: 'Every played card permanently gains +5 Chips when scored',
    formatDesc: (inst) => {
      const chips = getStateNum(inst.state, ['extra'], 5);
      return `Every played card permanently gains +${chips} Chips when scored`;
    },
  },
  {
    key: 'j_card_sharp',
    name: 'Card Sharp',
    order: 62,
    rarity: 2,
    cost: 6,
    pos: { x: 6, y: 11 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { Xmult: 3 },
    descTemplate: 'X3 Mult if played poker hand has already been played this round',
    formatDesc: (inst) => {
      const xMult = getStateNum(inst.state, ['x_mult', 'xMult', 'Xmult'], 3);
      return `X${formatNum(xMult)} Mult if played poker hand has already been played this round`;
    },
  },
  {
    key: 'j_madness',
    name: 'Madness',
    order: 64,
    rarity: 2,
    cost: 7,
    pos: { x: 8, y: 11 },
    blueprintCompat: true,
    perishableCompat: false,
    eternalCompat: true,
    config: { extra: 0.5 },
    descTemplate:
      'When Small Blind or Big Blind is selected, gain X0.5 Mult and destroy a random Joker (Currently X1 Mult)',
    formatDesc: (inst) => {
      const step = getStateNum(inst.state, ['extra'], 0.5);
      const xMult = getStateNum(inst.state, ['x_mult', 'xMult', 'Xmult'], 1);
      return `When Small Blind or Big Blind is selected, gain X${formatNum(step)} Mult and destroy a random Joker (Currently X${formatNum(xMult)} Mult)`;
    },
  },
  {
    key: 'j_seance',
    name: 'Séance',
    order: 66,
    rarity: 2,
    cost: 6,
    pos: { x: 0, y: 12 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { poker_hand: 'Straight Flush' },
    descTemplate:
      'If poker hand is a Straight Flush, create a random Spectral card (Must have room)',
    formatDesc: (inst) => {
      const hand =
        typeof inst.state.poker_hand === 'string' && inst.state.poker_hand.length > 0
          ? inst.state.poker_hand
          : 'Straight Flush';
      return `If poker hand is a ${hand}, create a random Spectral card (Must have room)`;
    },
  },
  {
    key: 'j_vampire',
    name: 'Vampire',
    order: 68,
    rarity: 2,
    cost: 7,
    pos: { x: 2, y: 12 },
    blueprintCompat: true,
    perishableCompat: false,
    eternalCompat: true,
    config: { extra: 0.1, Xmult: 1 },
    descTemplate:
      'This Joker gains X0.1 Mult per scoring Enhanced card played, removes card Enhancement (Currently X1 Mult)',
    formatDesc: (inst) => {
      const step = getStateNum(inst.state, ['extra'], 0.1);
      const xMult = getStateNum(inst.state, ['x_mult', 'xMult', 'Xmult'], 1);
      return `This Joker gains X${formatNum(step)} Mult per scoring Enhanced card played, removes card Enhancement (Currently X${formatNum(xMult)} Mult)`;
    },
  },
  {
    key: 'j_shortcut',
    name: 'Shortcut',
    order: 69,
    rarity: 2,
    cost: 7,
    pos: { x: 3, y: 12 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: {},
    descTemplate: 'Allows Straights to be made with gaps of 1 rank (ex: 10 8 6 5 3)',
    formatDesc: () => 'Allows Straights to be made with gaps of 1 rank (ex: 10 8 6 5 3)',
  },
  {
    key: 'j_hologram',
    name: 'Hologram',
    order: 70,
    rarity: 2,
    cost: 7,
    pos: { x: 4, y: 12 },
    soulPos: { x: 2, y: 9 },
    blueprintCompat: true,
    perishableCompat: false,
    eternalCompat: true,
    config: { extra: 0.25, Xmult: 1 },
    descTemplate:
      'This Joker gains X0.25 Mult every time a playing card is added to your deck (Currently X1 Mult)',
    formatDesc: (inst) => {
      const step = getStateNum(inst.state, ['extra'], 0.25);
      const xMult = getStateNum(inst.state, ['x_mult', 'xMult', 'Xmult'], 1);
      return `This Joker gains X${formatNum(step)} Mult every time a playing card is added to your deck (Currently X${formatNum(xMult)} Mult)`;
    },
  },
  {
    key: 'j_cloud_9',
    name: 'Cloud 9',
    order: 73,
    rarity: 2,
    cost: 7,
    pos: { x: 7, y: 12 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 1 },
    descTemplate: 'Earn $1 for each 9 in your full deck at end of round (Currently $4)',
    formatDesc: (inst, state) => {
      const perNine = getStateNum(inst.state, ['extra'], 1);
      const payout = countFullDeckRank(state, '9') * perNine;
      return `Earn $${perNine} for each 9 in your full deck at end of round (Currently $${payout})`;
    },
  },
  {
    key: 'j_rocket',
    name: 'Rocket',
    order: 74,
    rarity: 2,
    cost: 6,
    pos: { x: 8, y: 12 },
    blueprintCompat: false,
    perishableCompat: false,
    eternalCompat: true,
    config: { dollars: 1, increase: 2 },
    descTemplate: 'Earn $1 at end of round. Payout increases by $2 when Boss Blind is defeated',
    formatDesc: (inst) => {
      const dollars = getStateNum(inst.state, ['dollars'], 1);
      const inc = getStateNum(inst.state, ['increase'], 2);
      return `Earn $${dollars} at end of round. Payout increases by $${inc} when Boss Blind is defeated`;
    },
  },
  {
    key: 'j_midas_mask',
    name: 'Midas Mask',
    order: 76,
    rarity: 2,
    cost: 7,
    pos: { x: 0, y: 13 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: {},
    descTemplate: 'All played face cards become Gold cards when scored',
    formatDesc: () => 'All played face cards become Gold cards when scored',
  },
  {
    key: 'j_luchador',
    name: 'Luchador',
    order: 77,
    rarity: 2,
    cost: 5,
    pos: { x: 1, y: 13 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: false,
    config: {},
    descTemplate: 'Sell this card to disable the current Boss Blind',
    formatDesc: () => 'Sell this card to disable the current Boss Blind',
  },
  {
    key: 'j_gift',
    name: 'Gift Card',
    order: 79,
    rarity: 2,
    cost: 6,
    pos: { x: 3, y: 13 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 1 },
    descTemplate: 'Add $1 of sell value to every Joker and Consumable card at end of round',
    formatDesc: (inst) => {
      const inc = getStateNum(inst.state, ['extra'], 1);
      return `Add $${inc} of sell value to every Joker and Consumable card at end of round`;
    },
  },
  {
    key: 'j_turtle_bean',
    name: 'Turtle Bean',
    order: 80,
    rarity: 2,
    cost: 6,
    pos: { x: 4, y: 13 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: false,
    config: { h_size: 5, h_mod: 1 },
    descTemplate: '+5 hand size, reduces by 1 every round',
    formatDesc: (inst) => {
      const hSize = getStateNum(inst.state, ['h_size'], 5);
      const hMod = getStateNum(inst.state, ['h_mod'], 1);
      return `+${hSize} hand size, reduces by ${hMod} every round`;
    },
  },
  {
    key: 'j_erosion',
    name: 'Erosion',
    order: 81,
    rarity: 2,
    cost: 6,
    pos: { x: 5, y: 13 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 4 },
    descTemplate: '+4 Mult for each card below 52 in your full deck (Currently +0 Mult)',
    formatDesc: (inst, state) => {
      const perCard = getStateNum(inst.state, ['extra'], 4);
      const startSize = getStartingDeckSize(state);
      const missing = Math.max(0, startSize - state.fullDeck.length);
      const mult = missing * perCard;
      return `+${perCard} Mult for each card below ${startSize} in your full deck (Currently +${mult} Mult)`;
    },
  },
  {
    key: 'j_to_the_moon',
    name: 'To the Moon',
    order: 84,
    rarity: 2,
    cost: 5,
    pos: { x: 8, y: 13 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 1 },
    descTemplate: 'Earn an extra $1 of interest for every $5 you have at end of round',
    formatDesc: (inst) => {
      const bonus = getStateNum(inst.state, ['extra'], 1);
      return `Earn an extra $${bonus} of interest for every $5 you have at end of round`;
    },
  },
  {
    key: 'j_stone',
    name: 'Stone Joker',
    order: 89,
    rarity: 2,
    cost: 6,
    pos: { x: 9, y: 0 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 25 },
    descTemplate: 'Gives +25 Chips for each Stone Card in your full deck (Currently +0 Chips)',
    formatDesc: (inst, state) => {
      const perStone = getStateNum(inst.state, ['extra'], 25);
      const chips = countFullDeckEnhancement(state, 'm_stone') * perStone;
      return `Gives +${perStone} Chips for each Stone Card in your full deck (Currently +${chips} Chips)`;
    },
  },
  {
    key: 'j_lucky_cat',
    name: 'Lucky Cat',
    order: 91,
    rarity: 2,
    cost: 6,
    pos: { x: 5, y: 14 },
    blueprintCompat: true,
    perishableCompat: false,
    eternalCompat: true,
    config: { Xmult: 1, extra: 0.25 },
    descTemplate:
      'This Joker gains X0.25 Mult every time a Lucky card successfully triggers (Currently X1 Mult)',
    formatDesc: (inst) => {
      const step = getStateNum(inst.state, ['extra'], 0.25);
      const xMult = getStateNum(inst.state, ['x_mult', 'xMult', 'Xmult'], 1);
      return `This Joker gains X${formatNum(step)} Mult every time a Lucky card successfully triggers (Currently X${formatNum(xMult)} Mult)`;
    },
  },
  {
    key: 'j_bull',
    name: 'Bull',
    order: 93,
    rarity: 2,
    cost: 6,
    pos: { x: 7, y: 14 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 2 },
    descTemplate: '+2 Chips for each $1 you have (Currently +0 Chips)',
    formatDesc: (inst, state) => {
      const perDollar = getStateNum(inst.state, ['extra'], 2);
      const chips = Math.max(0, Math.floor(state.dollars)) * perDollar;
      return `+${perDollar} Chips for each $1 you have (Currently +${chips} Chips)`;
    },
  },
  {
    key: 'j_diet_cola',
    name: 'Diet Cola',
    order: 94,
    rarity: 2,
    cost: 6,
    pos: { x: 8, y: 14 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: false,
    config: {},
    descTemplate: 'Sell this card to create a free Double Tag',
    formatDesc: () => 'Sell this card to create a free Double Tag',
  },
  {
    key: 'j_trading',
    name: 'Trading Card',
    order: 95,
    rarity: 2,
    cost: 6,
    pos: { x: 9, y: 14 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 3 },
    descTemplate: 'If first discard of round has only 1 card, destroy it and earn $3',
    formatDesc: (inst) => {
      const dollars = getStateNum(inst.state, ['extra'], 3);
      return `If first discard of round has only 1 card, destroy it and earn $${dollars}`;
    },
  },
  {
    key: 'j_flash',
    name: 'Flash Card',
    order: 96,
    rarity: 2,
    cost: 5,
    pos: { x: 0, y: 15 },
    blueprintCompat: true,
    perishableCompat: false,
    eternalCompat: true,
    config: { extra: 2, mult: 0 },
    descTemplate: 'This Joker gains +2 Mult per reroll in the shop (Currently +0 Mult)',
    formatDesc: (inst) => {
      const step = getStateNum(inst.state, ['extra'], 2);
      const mult = getStateNum(inst.state, ['mult'], 0);
      return `This Joker gains +${step} Mult per reroll in the shop (Currently +${mult} Mult)`;
    },
  },
  {
    key: 'j_trousers',
    name: 'Spare Trousers',
    order: 98,
    rarity: 2,
    cost: 6,
    pos: { x: 4, y: 15 },
    blueprintCompat: true,
    perishableCompat: false,
    eternalCompat: true,
    config: { extra: 2 },
    descTemplate: 'This Joker gains +2 Mult if played hand contains a Two Pair (Currently +0 Mult)',
    formatDesc: (inst) => {
      const step = getStateNum(inst.state, ['extra'], 2);
      const mult = getStateNum(inst.state, ['mult'], 0);
      return `This Joker gains +${step} Mult if played hand contains a Two Pair (Currently +${mult} Mult)`;
    },
  },
  {
    key: 'j_ramen',
    name: 'Ramen',
    order: 100,
    rarity: 2,
    cost: 6,
    pos: { x: 2, y: 15 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: false,
    config: { Xmult: 2, extra: 0.01 },
    descTemplate: 'X2 Mult, loses X0.01 Mult per card discarded',
    formatDesc: (inst) => {
      const xMult = getStateNum(inst.state, ['x_mult', 'xMult', 'Xmult'], 2);
      const loss = getStateNum(inst.state, ['extra'], 0.01);
      return `X${formatNum(xMult)} Mult, loses X${formatNum(loss)} Mult per card discarded`;
    },
  },
  {
    key: 'j_selzer',
    name: 'Seltzer',
    order: 102,
    rarity: 2,
    cost: 6,
    pos: { x: 3, y: 15 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: false,
    config: { extra: 10 },
    descTemplate: 'Retrigger all cards played for the next 10 hands',
    formatDesc: (inst) => {
      const rem = getStateNum(inst.state, ['extra'], 10);
      return `Retrigger all cards played for the next ${rem} hand${rem === 1 ? '' : 's'}`;
    },
  },
  {
    key: 'j_castle',
    name: 'Castle',
    order: 103,
    rarity: 2,
    cost: 6,
    pos: { x: 9, y: 15 },
    blueprintCompat: true,
    perishableCompat: false,
    eternalCompat: true,
    config: { chips: 0, chip_mod: 3 },
    descTemplate:
      'This Joker gains +3 Chips per discarded Spades card, suit changes every round (Currently +0 Chips)',
    formatDesc: (inst, state) => {
      const chips = getStateNum(inst.state, ['chips'], 0);
      const mod = getStateNum(inst.state, ['chip_mod'], 3);
      return `This Joker gains +${mod} Chips per discarded ${state.tracking.castleSuit} card, suit changes every round (Currently +${chips} Chips)`;
    },
  },
  {
    key: 'j_mr_bones',
    name: 'Mr. Bones',
    order: 107,
    rarity: 2,
    cost: 5,
    pos: { x: 3, y: 4 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: false,
    config: {},
    descTemplate:
      'Prevents Death if chips scored are at least 25% of required chips; self destructs',
    formatDesc: () =>
      'Prevents Death if chips scored are at least 25% of required chips; self destructs',
  },
  {
    key: 'j_acrobat',
    name: 'Acrobat',
    order: 108,
    rarity: 2,
    cost: 6,
    pos: { x: 2, y: 1 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 3 },
    descTemplate: 'X3 Mult on final hand of round',
    formatDesc: (inst) => {
      const xMult = getStateNum(inst.state, ['extra'], 3);
      return `X${formatNum(xMult)} Mult on final hand of round`;
    },
  },
  {
    key: 'j_sock_and_buskin',
    name: 'Sock and Buskin',
    order: 109,
    rarity: 2,
    cost: 6,
    pos: { x: 3, y: 1 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 1 },
    descTemplate: 'Retrigger all played face cards',
    formatDesc: () => 'Retrigger all played face cards',
  },
  {
    key: 'j_troubadour',
    name: 'Troubadour',
    order: 111,
    rarity: 2,
    cost: 6,
    pos: { x: 0, y: 2 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: { h_size: 2, h_plays: -1 },
    descTemplate: '+2 hand size, -1 hand each round',
    formatDesc: () => '+2 hand size, -1 hand each round',
  },
  {
    key: 'j_certificate',
    name: 'Certificate',
    order: 112,
    rarity: 2,
    cost: 6,
    pos: { x: 8, y: 8 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: {},
    descTemplate:
      'When round begins, add a random playing card with a random seal to your hand',
    formatDesc: () =>
      'When round begins, add a random playing card with a random seal to your hand',
  },
  {
    key: 'j_smeared',
    name: 'Smeared Joker',
    order: 113,
    rarity: 2,
    cost: 7,
    pos: { x: 4, y: 6 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: {},
    descTemplate:
      'Hearts and Diamonds count as the same suit, Spades and Clubs count as the same suit',
    formatDesc: () =>
      'Hearts and Diamonds count as the same suit, Spades and Clubs count as the same suit',
  },
  {
    key: 'j_throwback',
    name: 'Throwback',
    order: 114,
    rarity: 2,
    cost: 6,
    pos: { x: 5, y: 7 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 0.25 },
    descTemplate: 'X0.25 Mult for each Blind skipped this run (Currently X1 Mult)',
    formatDesc: (inst, state) => {
      const step = getStateNum(inst.state, ['extra'], 0.25);
      const xMult = round2(1 + step * state.tracking.skipsTotal);
      return `X${formatNum(step)} Mult for each Blind skipped this run (Currently X${formatNum(xMult)} Mult)`;
    },
  },
  {
    key: 'j_rough_gem',
    name: 'Rough Gem',
    order: 116,
    rarity: 2,
    cost: 7,
    pos: { x: 9, y: 7 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 1 },
    descTemplate: 'Played cards with Diamond suit earn $1 when scored',
    formatDesc: (inst) => {
      const dollars = getStateNum(inst.state, ['extra'], 1);
      return `Played cards with Diamond suit earn $${dollars} when scored`;
    },
  },
  {
    key: 'j_bloodstone',
    name: 'Bloodstone',
    order: 117,
    rarity: 2,
    cost: 7,
    pos: { x: 0, y: 8 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { odds: 2, Xmult: 1.5 },
    descTemplate:
      '1 in 2 chance for played cards with Heart suit to give X1.5 Mult when scored',
    formatDesc: (inst, state) => {
      const odds = getStateNum(inst.state, ['odds'], 2);
      const xMult = getStateNum(inst.state, ['x_mult', 'xMult', 'Xmult'], 1.5);
      return `${getProbMult(state)} in ${odds} chance for played cards with Heart suit to give X${formatNum(xMult)} Mult when scored`;
    },
  },
  {
    key: 'j_arrowhead',
    name: 'Arrowhead',
    order: 118,
    rarity: 2,
    cost: 7,
    pos: { x: 1, y: 8 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 50 },
    descTemplate: 'Played cards with Spade suit give +50 Chips when scored',
    formatDesc: (inst) => {
      const chips = getStateNum(inst.state, ['extra'], 50);
      return `Played cards with Spade suit give +${chips} Chips when scored`;
    },
  },
  {
    key: 'j_onyx_agate',
    name: 'Onyx Agate',
    order: 119,
    rarity: 2,
    cost: 7,
    pos: { x: 2, y: 8 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 7 },
    descTemplate: 'Played cards with Club suit give +7 Mult when scored',
    formatDesc: (inst) => {
      const mult = getStateNum(inst.state, ['extra'], 7);
      return `Played cards with Club suit give +${mult} Mult when scored`;
    },
  },
  {
    key: 'j_glass',
    name: 'Glass Joker',
    order: 120,
    rarity: 2,
    cost: 6,
    pos: { x: 1, y: 3 },
    blueprintCompat: true,
    perishableCompat: false,
    eternalCompat: true,
    config: { extra: 0.75, Xmult: 1 },
    descTemplate:
      'This Joker gains X0.75 Mult for every Glass Card that is destroyed (Currently X1 Mult)',
    formatDesc: (inst) => {
      const step = getStateNum(inst.state, ['extra'], 0.75);
      const xMult = getStateNum(inst.state, ['x_mult', 'xMult', 'Xmult'], 1);
      return `This Joker gains X${formatNum(step)} Mult for every Glass Card that is destroyed (Currently X${formatNum(xMult)} Mult)`;
    },
  },
  {
    key: 'j_ring_master',
    name: 'Showman',
    order: 121,
    rarity: 2,
    cost: 5,
    pos: { x: 6, y: 5 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: {},
    descTemplate: 'Joker, Tarot, Planet, and Spectral cards may appear multiple times',
    formatDesc: () => 'Joker, Tarot, Planet, and Spectral cards may appear multiple times',
  },
  {
    key: 'j_flower_pot',
    name: 'Flower Pot',
    order: 122,
    rarity: 2,
    cost: 6,
    pos: { x: 0, y: 6 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 3 },
    descTemplate:
      'X3 Mult if poker hand contains a Diamond card, Club card, Heart card, and Spade card',
    formatDesc: (inst) => {
      const xMult = getStateNum(inst.state, ['extra'], 3);
      return `X${formatNum(xMult)} Mult if poker hand contains a Diamond card, Club card, Heart card, and Spade card`;
    },
  },
  {
    key: 'j_merry_andy',
    name: 'Merry Andy',
    order: 125,
    rarity: 2,
    cost: 7,
    pos: { x: 8, y: 0 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: { d_size: 3, h_size: -1 },
    descTemplate: '+3 discards each round, -1 hand size',
    formatDesc: () => '+3 discards each round, -1 hand size',
  },
  {
    key: 'j_oops',
    name: 'Oops! All 6s',
    order: 126,
    rarity: 2,
    cost: 4,
    pos: { x: 5, y: 6 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: {},
    descTemplate: 'Doubles all listed probabilities (ex: 1 in 3 -> 2 in 3)',
    formatDesc: () => 'Doubles all listed probabilities (ex: 1 in 3 -> 2 in 3)',
  },
  {
    key: 'j_idol',
    name: 'The Idol',
    order: 127,
    rarity: 2,
    cost: 6,
    pos: { x: 6, y: 7 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 2 },
    descTemplate:
      'Each played Ace of Spades gives X2 Mult when scored (Card changes every round)',
    formatDesc: (inst, state) => {
      const xMult = getStateNum(inst.state, ['extra'], 2);
      return `Each played ${state.tracking.idolRank} of ${state.tracking.idolSuit} gives X${formatNum(xMult)} Mult when scored (Card changes every round)`;
    },
  },
  {
    key: 'j_seeing_double',
    name: 'Seeing Double',
    order: 128,
    rarity: 2,
    cost: 6,
    pos: { x: 4, y: 4 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 2 },
    descTemplate:
      'X2 Mult if played hand has a scoring Club card and a scoring card of any other suit',
    formatDesc: (inst) => {
      const xMult = getStateNum(inst.state, ['extra'], 2);
      return `X${formatNum(xMult)} Mult if played hand has a scoring Club card and a scoring card of any other suit`;
    },
  },
  {
    key: 'j_matador',
    name: 'Matador',
    order: 129,
    rarity: 2,
    cost: 7,
    pos: { x: 4, y: 5 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 8 },
    descTemplate: 'Earn $8 if played hand triggers the Boss Blind ability',
    formatDesc: (inst) => {
      const dollars = getStateNum(inst.state, ['extra'], 8);
      return `Earn $${dollars} if played hand triggers the Boss Blind ability`;
    },
  },
  {
    key: 'j_satellite',
    name: 'Satellite',
    order: 139,
    rarity: 2,
    cost: 6,
    pos: { x: 8, y: 7 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 1 },
    descTemplate:
      'Earn $1 at end of round per unique Planet card used this run (Currently $0)',
    formatDesc: (inst, state) => {
      const perPlanet = getStateNum(inst.state, ['extra'], 1);
      const payout = countUniquePlanetsUsed(inst, state) * perPlanet;
      return `Earn $${perPlanet} at end of round per unique Planet card used this run (Currently $${payout})`;
    },
  },
  {
    key: 'j_cartomancer',
    name: 'Cartomancer',
    order: 142,
    rarity: 2,
    cost: 6,
    pos: { x: 7, y: 3 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: {},
    descTemplate: 'Create a Tarot card when Blind is selected (Must have room)',
    formatDesc: () => 'Create a Tarot card when Blind is selected (Must have room)',
  },
  {
    key: 'j_astronomer',
    name: 'Astronomer',
    order: 143,
    rarity: 2,
    cost: 8,
    pos: { x: 2, y: 7 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: {},
    descTemplate: 'All Planet cards and Celestial Packs in the shop are free',
    formatDesc: () => 'All Planet cards and Celestial Packs in the shop are free',
  },
  {
    key: 'j_bootstraps',
    name: 'Bootstraps',
    order: 145,
    rarity: 2,
    cost: 7,
    pos: { x: 9, y: 8 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { mult: 2, dollars: 5 },
    descTemplate: '+2 Mult for every $5 you have (Currently +0 Mult)',
    formatDesc: (inst, state) => {
      const perStep = getStateNum(inst.state, ['mult'], 2);
      const stepDollars = Math.max(1, getStateNum(inst.state, ['dollars'], 5));
      const mult = Math.max(0, Math.floor(state.dollars / stepDollars)) * perStep;
      return `+${perStep} Mult for every $${stepDollars} you have (Currently +${mult} Mult)`;
    },
  },
];

// ============================================================================
// All 64 Uncommon Joker Hook Implementations
// ============================================================================

export const UNCOMMON_JOKER_HOOKS: Record<string, JokerHookFn> = {
  j_stencil(ctx) {
    if (ctx.stage === 'joker_main') {
      const xMult = calcStencilXMult(ctx.state);
      if (xMult > 1) {
        return {
          xMult,
          message: `X${xMult} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit2',
        };
      }
    }
    return null;
  },

  // Passive rule modifier handled in poker.ts
  j_four_fingers() {
    return null;
  },

  j_mime(ctx) {
    if (ctx.stage === 'repetition_hand' && ctx.card && !ctx.card.debuffed) {
      return {
        repetitions: getStateNum(ctx.joker.state, ['extra'], 1),
        message: 'Again!',
        color: PALETTE.ORANGE,
      };
    }
    return null;
  },

  j_ceremonial(ctx) {
    if (ctx.stage === 'setting_blind' && !ctx.isBlueprint) {
      const rightJoker = ctx.state.jokers[ctx.jokerIndex + 1];
      if (rightJoker && !rightJoker.eternal) {
        const gain = rightJoker.sellValue * 2;
        const cur = getStateNum(ctx.joker.state, ['mult'], 0);
        const next = cur + gain;
        ctx.joker.state.mult = next;
        return {
          destroyJokerId: rightJoker.id,
          message: `+${gain} Mult`,
          color: PALETTE.MULT,
          sound: 'slice1',
        };
      }
    }
    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['mult'], 0);
      if (cur > 0) {
        return {
          mult: cur,
          message: `+${cur} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit1',
        };
      }
    }
    return null;
  },

  // Engine-owned SELECT_BLIND lifecycle (adds 1 Stone card to deck)
  j_marble() {
    return null;
  },

  j_loyalty_card(ctx) {
    const every = getStateNum(ctx.joker.state, ['every'], 5);
    const xMult = getStateNum(ctx.joker.state, ['Xmult', 'xMult'], 4);
    if (ctx.stage === 'joker_main') {
      const rem = getStateNum(ctx.joker.state, ['remaining'], every);
      if (rem <= 0) {
        return {
          xMult,
          message: `X${formatNum(xMult)} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit2',
        };
      }
    }
    if (ctx.stage === 'after' && !ctx.isBlueprint) {
      const rem = getStateNum(ctx.joker.state, ['remaining'], every);
      if (rem <= 0) {
        ctx.joker.state.remaining = every;
      } else {
        const next = rem - 1;
        ctx.joker.state.remaining = next;
        if (next === 0) {
          return {
            message: 'Active!',
            color: PALETTE.ORANGE,
          };
        }
      }
    }
    return null;
  },

  j_dusk(ctx) {
    if (
      ctx.stage === 'repetition_play' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.state.handsLeft === 0
    ) {
      return {
        repetitions: getStateNum(ctx.joker.state, ['extra'], 1),
        message: 'Again!',
        color: PALETTE.ORANGE,
      };
    }
    return null;
  },

  j_fibonacci(ctx) {
    if (
      ctx.stage === 'individual_play' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.card.enhancement !== 'm_stone' &&
      FIBONACCI_RANKS.has(ctx.card.rank)
    ) {
      const mult = getStateNum(ctx.joker.state, ['extra'], 8);
      return {
        mult,
        message: `+${mult} Mult`,
        color: PALETTE.MULT,
        sound: 'multhit1',
      };
    }
    return null;
  },

  j_steel_joker(ctx) {
    if (ctx.stage === 'joker_main') {
      const step = getStateNum(ctx.joker.state, ['extra'], 0.2);
      const count = countFullDeckEnhancement(ctx.state, 'm_steel');
      const xMult = round2(1 + step * count);
      if (xMult > 1) {
        return {
          xMult,
          message: `X${formatNum(xMult)} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit2',
        };
      }
    }
    return null;
  },

  j_hack(ctx) {
    if (
      ctx.stage === 'repetition_play' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.card.enhancement !== 'm_stone' &&
      HACK_RANKS.has(ctx.card.rank)
    ) {
      return {
        repetitions: getStateNum(ctx.joker.state, ['extra'], 1),
        message: 'Again!',
        color: PALETTE.ORANGE,
      };
    }
    return null;
  },

  // Passive rule modifier handled in poker.ts
  j_pareidolia() {
    return null;
  },

  j_space(ctx) {
    if (ctx.stage === 'before' && ctx.handEval) {
      const odds = Math.max(1, getStateNum(ctx.joker.state, ['extra'], 4));
      if (ctx.rand('space') < ctx.probMultiplier / odds) {
        return {
          levelUpHand: ctx.handEval.handId,
          message: 'Level Up!',
          color: PALETTE.BLUE,
          sound: 'tarot1',
        };
      }
    }
    return null;
  },

  // Engine-owned SELECT_BLIND lifecycle (+3 hands, 0 discards)
  j_burglar() {
    return null;
  },

  j_blackboard(ctx) {
    if (ctx.stage === 'joker_main') {
      const held = ctx.heldCards ?? [];
      let allBlack = true;
      for (let i = 0; i < held.length; i++) {
        if (!ctx.isSuit(held[i], 'Spades') && !ctx.isSuit(held[i], 'Clubs')) {
          allBlack = false;
          break;
        }
      }
      if (allBlack) {
        const xMult = getStateNum(ctx.joker.state, ['extra'], 3);
        return {
          xMult,
          message: `X${formatNum(xMult)} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit2',
        };
      }
    }
    return null;
  },

  j_sixth_sense(ctx) {
    if (
      ctx.stage === 'joker_main' &&
      !ctx.isBlueprint &&
      ctx.fullHand &&
      ctx.fullHand.length === 1 &&
      ctx.fullHand[0].enhancement !== 'm_stone' &&
      ctx.fullHand[0].rank === '6' &&
      isFirstHandOfRound(ctx)
    ) {
      const hasRoom = hasConsumableRoom(ctx.state);
      return {
        destroyCardId: ctx.fullHand[0].id,
        createConsumable: hasRoom ? { set: 'Spectral' } : undefined,
        message: hasRoom ? '+1 Spectral' : 'Destroyed!',
        color: PALETTE.PURPLE,
        sound: 'tarot2',
      };
    }
    return null;
  },

  j_constellation(ctx) {
    if (
      ctx.stage === 'using_consumeable' &&
      !ctx.isBlueprint &&
      (ctx.consumable?.set === 'Planet' || ctx.itemKind === 'Planet')
    ) {
      const cur = getStateNum(ctx.joker.state, ['x_mult', 'xMult', 'Xmult'], 1);
      const step = getStateNum(ctx.joker.state, ['extra'], 0.1);
      const next = round2(cur + step);
      setXMultState(ctx.joker.state, next);
      return {
        message: `X${formatNum(next)} Mult`,
        color: PALETTE.MULT,
        sound: 'tarot1',
      };
    }
    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['x_mult', 'xMult', 'Xmult'], 1);
      if (cur > 1) {
        return {
          xMult: cur,
          message: `X${formatNum(cur)} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit2',
        };
      }
    }
    return null;
  },

  j_hiker(ctx) {
    if (ctx.stage === 'individual_play' && ctx.card && !ctx.card.debuffed) {
      const bonus = getStateNum(ctx.joker.state, ['extra'], 5);
      ctx.card.permaBonus = (ctx.card.permaBonus ?? 0) + bonus;
      const deckCard = ctx.state.fullDeck.find((dc) => dc.id === ctx.card!.id);
      if (deckCard && deckCard !== ctx.card) {
        deckCard.permaBonus = ctx.card.permaBonus;
      }
      return {
        message: 'Upgrade!',
        color: PALETTE.CHIPS,
        sound: 'chips1',
      };
    }
    return null;
  },

  j_card_sharp(ctx) {
    if (ctx.stage === 'joker_main' && ctx.handEval) {
      const hl = ctx.state.handLevels[ctx.handEval.handId];
      if (hl && hl.playedThisRound > 1) {
        const xMult = getStateNum(ctx.joker.state, ['x_mult', 'xMult', 'Xmult'], 3);
        return {
          xMult,
          message: `X${formatNum(xMult)} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit2',
        };
      }
    }
    return null;
  },

  // SELECT_BLIND scaling & destruction is engine-owned; hook applies accumulated XMult
  j_madness(ctx) {
    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['x_mult', 'xMult', 'Xmult'], 1);
      if (cur > 1) {
        return {
          xMult: cur,
          message: `X${formatNum(cur)} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit2',
        };
      }
    }
    return null;
  },

  j_seance(ctx) {
    const targetHand = (
      typeof ctx.joker.state.poker_hand === 'string' && ctx.joker.state.poker_hand.length > 0
        ? ctx.joker.state.poker_hand
        : 'Straight Flush'
    ) as PokerHandId;
    if (
      ctx.stage === 'joker_main' &&
      ctx.handEval &&
      ctx.handEval.handId === targetHand &&
      hasConsumableRoom(ctx.state)
    ) {
      return {
        createConsumable: { set: 'Spectral' },
        message: '+1 Spectral',
        color: PALETTE.PURPLE,
        sound: 'tarot2',
      };
    }
    return null;
  },

  j_vampire(ctx) {
    if (ctx.stage === 'before' && !ctx.isBlueprint && ctx.scoringHand) {
      const enhanced = ctx.scoringHand.filter((c) => !c.debuffed && c.enhancement !== 'none');
      if (enhanced.length > 0) {
        for (let i = 0; i < enhanced.length; i++) {
          enhanced[i].enhancement = 'none';
          const deckCard = ctx.state.fullDeck.find((dc) => dc.id === enhanced[i].id);
          if (deckCard) deckCard.enhancement = 'none';
        }
        const cur = getStateNum(ctx.joker.state, ['x_mult', 'xMult', 'Xmult'], 1);
        const step = getStateNum(ctx.joker.state, ['extra'], 0.1);
        const next = round2(cur + step * enhanced.length);
        setXMultState(ctx.joker.state, next);
        return {
          message: `X${formatNum(next)} Mult`,
          color: PALETTE.MULT,
          sound: 'tarot1',
          setCardEnhancement: { cardId: enhanced[0].id, enhancement: 'none' },
        };
      }
    }
    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['x_mult', 'xMult', 'Xmult'], 1);
      if (cur > 1) {
        return {
          xMult: cur,
          message: `X${formatNum(cur)} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit2',
        };
      }
    }
    return null;
  },

  // Passive rule modifier handled in poker.ts
  j_shortcut() {
    return null;
  },

  j_hologram(ctx) {
    if (ctx.stage === 'card_added' && !ctx.isBlueprint) {
      const cur = getStateNum(ctx.joker.state, ['x_mult', 'xMult', 'Xmult'], 1);
      const step = getStateNum(ctx.joker.state, ['extra'], 0.25);
      const next = round2(cur + step);
      setXMultState(ctx.joker.state, next);
      return {
        message: `X${formatNum(next)} Mult`,
        color: PALETTE.MULT,
        sound: 'tarot1',
      };
    }
    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['x_mult', 'xMult', 'Xmult'], 1);
      if (cur > 1) {
        return {
          xMult: cur,
          message: `X${formatNum(cur)} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit2',
        };
      }
    }
    return null;
  },

  j_cloud_9(ctx) {
    if (ctx.stage === 'calc_dollar_bonus' && !ctx.isBlueprint) {
      const perNine = getStateNum(ctx.joker.state, ['extra'], 1);
      const payout = countFullDeckRank(ctx.state, '9') * perNine;
      if (payout > 0) {
        return {
          dollars: payout,
          message: `+$${payout}`,
          color: PALETTE.GOLD,
          sound: 'coin1',
        };
      }
    }
    return null;
  },

  j_rocket(ctx) {
    if (
      ctx.stage === 'end_of_round' &&
      !ctx.isBlueprint &&
      !isMrBonesCheckProbe(ctx.state) &&
      ctx.state.activeBlindSlot === 'Boss'
    ) {
      const cur = getStateNum(ctx.joker.state, ['dollars'], 1);
      const inc = getStateNum(ctx.joker.state, ['increase'], 2);
      ctx.joker.state.dollars = cur + inc;
      return {
        message: 'Upgrade!',
        color: PALETTE.GOLD,
        sound: 'coin1',
      };
    }
    if (ctx.stage === 'calc_dollar_bonus' && !ctx.isBlueprint) {
      const payout = getStateNum(ctx.joker.state, ['dollars'], 1);
      if (payout > 0) {
        return {
          dollars: payout,
          message: `+$${payout}`,
          color: PALETTE.GOLD,
          sound: 'coin1',
        };
      }
    }
    return null;
  },

  j_midas_mask(ctx) {
    if (ctx.stage === 'before' && !ctx.isBlueprint && ctx.scoringHand) {
      const faces = ctx.scoringHand.filter((c) => !c.debuffed && ctx.isFace(c));
      if (faces.length > 0) {
        for (let i = 0; i < faces.length; i++) {
          faces[i].enhancement = 'm_gold';
          const deckCard = ctx.state.fullDeck.find((dc) => dc.id === faces[i].id);
          if (deckCard) deckCard.enhancement = 'm_gold';
        }
        return {
          message: 'Gold!',
          color: PALETTE.GOLD,
          sound: 'tarot1',
          setCardEnhancement: { cardId: faces[0].id, enhancement: 'm_gold' },
        };
      }
    }
    return null;
  },

  // Engine-owned SELL_JOKER lifecycle (disables current Boss Blind)
  j_luchador() {
    return null;
  },

  // Engine-owned end_of_round lifecycle (+$1 sell value to all Jokers & Consumables)
  j_gift() {
    return null;
  },

  // Passive hand size read from joker.state.h_size in shop.ts; shrinks & self-destructs here
  j_turtle_bean(ctx) {
    if (ctx.stage === 'end_of_round' && !ctx.isBlueprint && !isMrBonesCheckProbe(ctx.state)) {
      const cur = getStateNum(ctx.joker.state, ['h_size'], 5);
      const mod = getStateNum(ctx.joker.state, ['h_mod'], 1);
      const next = cur - mod;
      ctx.joker.state.h_size = Math.max(0, next);
      if (next <= 0) {
        return {
          destroySelf: true,
          message: 'Eaten!',
          color: PALETTE.RED,
          sound: 'tarot1',
        };
      }
      return {
        message: `-${mod} Hand Size`,
        color: PALETTE.RED,
      };
    }
    return null;
  },

  j_erosion(ctx) {
    if (ctx.stage === 'joker_main') {
      const perCard = getStateNum(ctx.joker.state, ['extra'], 4);
      const startSize = getStartingDeckSize(ctx.state);
      const missing = Math.max(0, startSize - ctx.state.fullDeck.length);
      const mult = missing * perCard;
      if (mult > 0) {
        return {
          mult,
          message: `+${mult} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit1',
        };
      }
    }
    return null;
  },

  // Passive interest bonus handled in shop.ts
  j_to_the_moon() {
    return null;
  },

  j_stone(ctx) {
    if (ctx.stage === 'joker_main') {
      const perStone = getStateNum(ctx.joker.state, ['extra'], 25);
      const chips = countFullDeckEnhancement(ctx.state, 'm_stone') * perStone;
      if (chips > 0) {
        return {
          chips,
          message: `+${chips} Chips`,
          color: PALETTE.CHIPS,
          sound: 'chips1',
        };
      }
    }
    return null;
  },

  // Lucky trigger scaling into joker.state.x_mult is engine-owned in scoring.ts
  j_lucky_cat(ctx) {
    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['x_mult', 'xMult', 'Xmult'], 1);
      if (cur > 1) {
        return {
          xMult: cur,
          message: `X${formatNum(cur)} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit2',
        };
      }
    }
    return null;
  },

  j_bull(ctx) {
    if (ctx.stage === 'joker_main') {
      const perDollar = getStateNum(ctx.joker.state, ['extra'], 2);
      const chips = Math.max(0, Math.floor(ctx.state.dollars)) * perDollar;
      if (chips > 0) {
        return {
          chips,
          message: `+${chips} Chips`,
          color: PALETTE.CHIPS,
          sound: 'chips1',
        };
      }
    }
    return null;
  },

  // Engine-owned SELL_JOKER lifecycle (grants Double Tag)
  j_diet_cola() {
    return null;
  },

  // Engine-owned DISCARD_HAND lifecycle (first 1-card discard destroys card & +$3)
  j_trading() {
    return null;
  },

  j_flash(ctx) {
    if (ctx.stage === 'reroll_shop' && !ctx.isBlueprint) {
      const cur = getStateNum(ctx.joker.state, ['mult'], 0);
      const step = getStateNum(ctx.joker.state, ['extra'], 2);
      const next = cur + step;
      ctx.joker.state.mult = next;
      return {
        message: `+${next} Mult`,
        color: PALETTE.MULT,
        sound: 'multhit1',
      };
    }
    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['mult'], 0);
      if (cur > 0) {
        return {
          mult: cur,
          message: `+${cur} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit1',
        };
      }
    }
    return null;
  },

  j_trousers(ctx) {
    if (
      ctx.stage === 'before' &&
      !ctx.isBlueprint &&
      ctx.handEval?.containedHands.includes('Two Pair')
    ) {
      const cur = getStateNum(ctx.joker.state, ['mult'], 0);
      const step = getStateNum(ctx.joker.state, ['extra'], 2);
      const next = cur + step;
      ctx.joker.state.mult = next;
      return {
        message: 'Upgrade!',
        color: PALETTE.MULT,
        sound: 'multhit1',
      };
    }
    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['mult'], 0);
      if (cur > 0) {
        return {
          mult: cur,
          message: `+${cur} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit1',
        };
      }
    }
    return null;
  },

  j_ramen(ctx) {
    if (ctx.stage === 'discard' && !ctx.isBlueprint) {
      const cur = getStateNum(ctx.joker.state, ['x_mult', 'xMult', 'Xmult'], 2);
      const loss = getStateNum(ctx.joker.state, ['extra'], 0.01);
      const next = round2(cur - loss);
      if (next <= 1) {
        setXMultState(ctx.joker.state, 1);
        return {
          destroySelf: true,
          message: 'Eaten!',
          color: PALETTE.RED,
          sound: 'tarot1',
        };
      }
      setXMultState(ctx.joker.state, next);
      return {
        message: `-X${formatNum(loss)} Mult`,
        color: PALETTE.RED,
      };
    }
    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['x_mult', 'xMult', 'Xmult'], 2);
      if (cur > 1) {
        return {
          xMult: cur,
          message: `X${formatNum(cur)} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit2',
        };
      }
    }
    return null;
  },

  j_selzer(ctx) {
    if (ctx.stage === 'repetition_play' && ctx.card && !ctx.card.debuffed) {
      const rem = getStateNum(ctx.joker.state, ['extra'], 10);
      if (rem > 0) {
        return {
          repetitions: 1,
          message: 'Again!',
          color: PALETTE.ORANGE,
        };
      }
    }
    if (ctx.stage === 'after' && !ctx.isBlueprint) {
      const rem = getStateNum(ctx.joker.state, ['extra'], 10);
      const next = rem - 1;
      ctx.joker.state.extra = Math.max(0, next);
      if (next <= 0) {
        return {
          destroySelf: true,
          message: 'Drank!',
          color: PALETTE.CHIPS,
          sound: 'tarot1',
        };
      }
      return {
        message: `${next} left`,
        color: PALETTE.CHIPS,
      };
    }
    return null;
  },

  j_castle(ctx) {
    if (
      ctx.stage === 'discard' &&
      !ctx.isBlueprint &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.isSuit(ctx.card, ctx.state.tracking.castleSuit)
    ) {
      const cur = getStateNum(ctx.joker.state, ['chips'], 0);
      const mod = getStateNum(ctx.joker.state, ['chip_mod'], 3);
      const next = cur + mod;
      ctx.joker.state.chips = next;
      return {
        message: `+${mod} Chips`,
        color: PALETTE.CHIPS,
        sound: 'chips1',
      };
    }
    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['chips'], 0);
      if (cur > 0) {
        return {
          chips: cur,
          message: `+${cur} Chips`,
          color: PALETTE.CHIPS,
          sound: 'chips1',
        };
      }
    }
    return null;
  },

  j_mr_bones(ctx) {
    if (
      ctx.stage === 'end_of_round' &&
      !ctx.isBlueprint &&
      ctx.state.handsLeft <= 0 &&
      ctx.state.targetChips > 0 &&
      ctx.state.roundChips < ctx.state.targetChips &&
      ctx.state.roundChips >= ctx.state.targetChips * 0.25
    ) {
      return {
        saveRun: true,
        destroySelf: true,
        message: 'Saved by Mr. Bones!',
        color: PALETTE.RED,
        sound: 'timpani',
      };
    }
    return null;
  },

  j_acrobat(ctx) {
    if (ctx.stage === 'joker_main' && ctx.state.handsLeft === 0) {
      const xMult = getStateNum(ctx.joker.state, ['extra'], 3);
      return {
        xMult,
        message: `X${formatNum(xMult)} Mult`,
        color: PALETTE.MULT,
        sound: 'multhit2',
      };
    }
    return null;
  },

  j_sock_and_buskin(ctx) {
    if (ctx.stage === 'repetition_play' && ctx.card && !ctx.card.debuffed && ctx.isFace(ctx.card)) {
      return {
        repetitions: getStateNum(ctx.joker.state, ['extra'], 1),
        message: 'Again!',
        color: PALETTE.ORANGE,
      };
    }
    return null;
  },

  // Passive hand size & hands per round modifier handled in shop.ts & engine.ts
  j_troubadour() {
    return null;
  },

  // Engine-owned SELECT_BLIND lifecycle (adds random sealed card to hand & deck)
  j_certificate() {
    return null;
  },

  // Passive suit-merging rule modifier handled in poker.ts
  j_smeared() {
    return null;
  },

  j_throwback(ctx) {
    const step = getStateNum(ctx.joker.state, ['extra'], 0.25);
    const xMult = round2(1 + step * ctx.state.tracking.skipsTotal);
    if (ctx.stage === 'skip_blind' && !ctx.isBlueprint) {
      return {
        message: `X${formatNum(xMult)} Mult`,
        color: PALETTE.MULT,
        sound: 'tarot1',
      };
    }
    if (ctx.stage === 'joker_main' && xMult > 1) {
      return {
        xMult,
        message: `X${formatNum(xMult)} Mult`,
        color: PALETTE.MULT,
        sound: 'multhit2',
      };
    }
    return null;
  },

  j_rough_gem(ctx) {
    if (
      ctx.stage === 'individual_play' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.isSuit(ctx.card, 'Diamonds')
    ) {
      const dollars = getStateNum(ctx.joker.state, ['extra'], 1);
      return {
        dollars,
        message: `+$${dollars}`,
        color: PALETTE.GOLD,
        sound: 'coin1',
      };
    }
    return null;
  },

  j_bloodstone(ctx) {
    if (
      ctx.stage === 'individual_play' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.isSuit(ctx.card, 'Hearts')
    ) {
      const odds = Math.max(1, getStateNum(ctx.joker.state, ['odds'], 2));
      const xMult = getStateNum(ctx.joker.state, ['x_mult', 'xMult', 'Xmult'], 1.5);
      if (ctx.rand('bloodstone') < ctx.probMultiplier / odds) {
        return {
          xMult,
          message: `X${formatNum(xMult)} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit2',
        };
      }
    }
    return null;
  },

  j_arrowhead(ctx) {
    if (
      ctx.stage === 'individual_play' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.isSuit(ctx.card, 'Spades')
    ) {
      const chips = getStateNum(ctx.joker.state, ['extra'], 50);
      return {
        chips,
        message: `+${chips} Chips`,
        color: PALETTE.CHIPS,
        sound: 'chips1',
      };
    }
    return null;
  },

  j_onyx_agate(ctx) {
    if (
      ctx.stage === 'individual_play' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.isSuit(ctx.card, 'Clubs')
    ) {
      const mult = getStateNum(ctx.joker.state, ['extra'], 7);
      return {
        mult,
        message: `+${mult} Mult`,
        color: PALETTE.MULT,
        sound: 'multhit1',
      };
    }
    return null;
  },

  j_glass(ctx) {
    if (ctx.stage === 'cards_destroyed' && !ctx.isBlueprint && ctx.removedCards) {
      let glassDestroyed = 0;
      for (let i = 0; i < ctx.removedCards.length; i++) {
        if (ctx.removedCards[i].enhancement === 'm_glass') glassDestroyed++;
      }
      if (glassDestroyed > 0) {
        const cur = getStateNum(ctx.joker.state, ['x_mult', 'xMult', 'Xmult'], 1);
        const step = getStateNum(ctx.joker.state, ['extra'], 0.75);
        const next = round2(cur + step * glassDestroyed);
        setXMultState(ctx.joker.state, next);
        return {
          message: `X${formatNum(next)} Mult`,
          color: PALETTE.MULT,
          sound: 'tarot1',
        };
      }
    }
    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['x_mult', 'xMult', 'Xmult'], 1);
      if (cur > 1) {
        return {
          xMult: cur,
          message: `X${formatNum(cur)} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit2',
        };
      }
    }
    return null;
  },

  // Passive shop/pack duplicate allowance handled in shop.ts
  j_ring_master() {
    return null;
  },

  j_flower_pot(ctx) {
    if (ctx.stage === 'joker_main' && hasAllFourScoringSuits(ctx)) {
      const xMult = getStateNum(ctx.joker.state, ['extra'], 3);
      return {
        xMult,
        message: `X${formatNum(xMult)} Mult`,
        color: PALETTE.MULT,
        sound: 'multhit2',
      };
    }
    return null;
  },

  // Passive discards & hand size modifier handled in engine.ts & shop.ts
  j_merry_andy() {
    return null;
  },

  // Passive probability multiplier handled in shop.ts
  j_oops() {
    return null;
  },

  j_idol(ctx) {
    if (
      ctx.stage === 'individual_play' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.card.enhancement !== 'm_stone' &&
      ctx.card.rank === ctx.state.tracking.idolRank &&
      ctx.isSuit(ctx.card, ctx.state.tracking.idolSuit)
    ) {
      const xMult = getStateNum(ctx.joker.state, ['extra'], 2);
      return {
        xMult,
        message: `X${formatNum(xMult)} Mult`,
        color: PALETTE.MULT,
        sound: 'multhit2',
      };
    }
    return null;
  },

  j_seeing_double(ctx) {
    if (ctx.stage === 'joker_main' && hasSeeingDoubleSuits(ctx)) {
      const xMult = getStateNum(ctx.joker.state, ['extra'], 2);
      return {
        xMult,
        message: `X${formatNum(xMult)} Mult`,
        color: PALETTE.MULT,
        sound: 'multhit2',
      };
    }
    return null;
  },

  // Engine-owned Boss trigger payout handled in scoring.ts
  j_matador() {
    return null;
  },

  j_satellite(ctx) {
    if (
      ctx.stage === 'using_consumeable' &&
      !ctx.isBlueprint &&
      (ctx.consumable?.set === 'Planet' || ctx.itemKind === 'Planet')
    ) {
      const pKey = ctx.consumable?.key ?? ctx.itemKey;
      if (pKey) {
        const raw = typeof ctx.joker.state.seen_planets === 'string' ? ctx.joker.state.seen_planets : '';
        const seen = new Set(raw.split(',').filter(Boolean));
        if (!seen.has(pKey)) {
          seen.add(pKey);
          ctx.joker.state.seen_planets = Array.from(seen).join(',');
        }
      }
      return null;
    }
    if (ctx.stage === 'calc_dollar_bonus' && !ctx.isBlueprint) {
      const perPlanet = getStateNum(ctx.joker.state, ['extra'], 1);
      const payout = countUniquePlanetsUsed(ctx.joker, ctx.state) * perPlanet;
      if (payout > 0) {
        return {
          dollars: payout,
          message: `+$${payout}`,
          color: PALETTE.GOLD,
          sound: 'coin1',
        };
      }
    }
    return null;
  },

  j_cartomancer(ctx) {
    if (ctx.stage === 'setting_blind' && hasConsumableRoom(ctx.state)) {
      return {
        createConsumable: { set: 'Tarot' },
        message: '+1 Tarot',
        color: PALETTE.PURPLE,
        sound: 'tarot1',
      };
    }
    return null;
  },

  // Passive free Planet & Celestial Pack pricing handled in shop.ts
  j_astronomer() {
    return null;
  },

  j_bootstraps(ctx) {
    if (ctx.stage === 'joker_main') {
      const perStep = getStateNum(ctx.joker.state, ['mult'], 2);
      const stepDollars = Math.max(1, getStateNum(ctx.joker.state, ['dollars'], 5));
      const mult = Math.max(0, Math.floor(ctx.state.dollars / stepDollars)) * perStep;
      if (mult > 0) {
        return {
          mult,
          message: `+${mult} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit1',
        };
      }
    }
    return null;
  },
};
