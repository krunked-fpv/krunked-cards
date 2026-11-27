import {
  PALETTE,
  POKER_HAND_IDS,
  RANK_CHIPS,
  RANK_VALUES,
  type CardInstance,
  type JokerDef,
  type JokerEvalContext,
  type JokerEvalResult,
  type JokerHookFn,
  type PokerHandId,
  type Rank,
  type SimState,
  type Suit,
} from '../contracts/index.ts';

function getStateNum(
  state: Record<string, number | string | boolean | null>,
  keys: string[],
  fallback: number
): number {
  for (const k of keys) {
    const v = state[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return fallback;
}

function getProbMult(state: SimState): number {
  let mult = 1;
  for (const j of state.jokers) {
    if (!j.debuffed && j.key === 'j_oops') {
      mult *= 2;
    }
  }
  return mult;
}

function getEffectiveConsumableSlots(state: SimState): number {
  let neg = 0;
  for (const c of state.consumables) {
    if (c.edition === 'e_negative') neg += 1;
  }
  return Math.max(0, state.consumableSlots + neg);
}

function hasConsumableRoom(state: SimState): boolean {
  return state.consumables.length < getEffectiveConsumableSlots(state);
}

function makeSuitMultHook(suit: Suit, mult: number): JokerHookFn {
  return (ctx: JokerEvalContext): JokerEvalResult | null => {
    if (
      ctx.stage === 'individual_play' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.isSuit(ctx.card, suit)
    ) {
      return {
        mult,
        message: `+${mult} Mult`,
        color: PALETTE.MULT,
        sound: 'multhit1',
      };
    }
    return null;
  };
}

function makeHandTypeMultHook(handType: PokerHandId, mult: number): JokerHookFn {
  return (ctx: JokerEvalContext): JokerEvalResult | null => {
    if (ctx.stage === 'joker_main' && ctx.handEval?.containedHands.includes(handType)) {
      return {
        mult,
        message: `+${mult} Mult`,
        color: PALETTE.MULT,
        sound: 'multhit1',
      };
    }
    return null;
  };
}

function makeHandTypeChipsHook(handType: PokerHandId, chips: number): JokerHookFn {
  return (ctx: JokerEvalContext): JokerEvalResult | null => {
    if (ctx.stage === 'joker_main' && ctx.handEval?.containedHands.includes(handType)) {
      return {
        chips,
        message: `+${chips} Chips`,
        color: PALETTE.CHIPS,
        sound: 'chips1',
      };
    }
    return null;
  };
}

const EVEN_RANKS = new Set<Rank>(['2', '4', '6', '8', '10']);
const ODD_RANKS = new Set<Rank>(['Ace', '9', '7', '5', '3']);

export const COMMON_JOKERS: JokerDef[] = [
  {
    key: 'j_joker',
    name: 'Joker',
    order: 1,
    rarity: 1,
    cost: 2,
    pos: { x: 0, y: 0 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { mult: 4 },
    descTemplate: '+4 Mult',
    formatDesc: () => '+4 Mult',
  },
  {
    key: 'j_greedy_joker',
    name: 'Greedy Joker',
    order: 2,
    rarity: 1,
    cost: 5,
    pos: { x: 6, y: 1 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { s_mult: 3, suit: 'Diamonds' },
    descTemplate: 'Played cards with Diamonds suit give +3 Mult when scored',
    formatDesc: () => 'Played cards with Diamonds suit give +3 Mult when scored',
  },
  {
    key: 'j_lusty_joker',
    name: 'Lusty Joker',
    order: 3,
    rarity: 1,
    cost: 5,
    pos: { x: 7, y: 1 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { s_mult: 3, suit: 'Hearts' },
    descTemplate: 'Played cards with Hearts suit give +3 Mult when scored',
    formatDesc: () => 'Played cards with Hearts suit give +3 Mult when scored',
  },
  {
    key: 'j_wrathful_joker',
    name: 'Wrathful Joker',
    order: 4,
    rarity: 1,
    cost: 5,
    pos: { x: 8, y: 1 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { s_mult: 3, suit: 'Spades' },
    descTemplate: 'Played cards with Spades suit give +3 Mult when scored',
    formatDesc: () => 'Played cards with Spades suit give +3 Mult when scored',
  },
  {
    key: 'j_gluttenous_joker',
    name: 'Gluttonous Joker',
    order: 5,
    rarity: 1,
    cost: 5,
    pos: { x: 9, y: 1 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { s_mult: 3, suit: 'Clubs' },
    descTemplate: 'Played cards with Clubs suit give +3 Mult when scored',
    formatDesc: () => 'Played cards with Clubs suit give +3 Mult when scored',
  },
  {
    key: 'j_jolly',
    name: 'Jolly Joker',
    order: 6,
    rarity: 1,
    cost: 3,
    pos: { x: 2, y: 0 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { t_mult: 8, type: 'Pair' },
    descTemplate: '+8 Mult if played hand contains a Pair',
    formatDesc: () => '+8 Mult if played hand contains a Pair',
  },
  {
    key: 'j_zany',
    name: 'Zany Joker',
    order: 7,
    rarity: 1,
    cost: 4,
    pos: { x: 3, y: 0 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { t_mult: 12, type: 'Three of a Kind' },
    descTemplate: '+12 Mult if played hand contains a Three of a Kind',
    formatDesc: () => '+12 Mult if played hand contains a Three of a Kind',
  },
  {
    key: 'j_mad',
    name: 'Mad Joker',
    order: 8,
    rarity: 1,
    cost: 4,
    pos: { x: 4, y: 0 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { t_mult: 10, type: 'Two Pair' },
    descTemplate: '+10 Mult if played hand contains a Two Pair',
    formatDesc: () => '+10 Mult if played hand contains a Two Pair',
  },
  {
    key: 'j_crazy',
    name: 'Crazy Joker',
    order: 9,
    rarity: 1,
    cost: 4,
    pos: { x: 5, y: 0 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { t_mult: 12, type: 'Straight' },
    descTemplate: '+12 Mult if played hand contains a Straight',
    formatDesc: () => '+12 Mult if played hand contains a Straight',
  },
  {
    key: 'j_droll',
    name: 'Droll Joker',
    order: 10,
    rarity: 1,
    cost: 4,
    pos: { x: 6, y: 0 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { t_mult: 10, type: 'Flush' },
    descTemplate: '+10 Mult if played hand contains a Flush',
    formatDesc: () => '+10 Mult if played hand contains a Flush',
  },
  {
    key: 'j_sly',
    name: 'Sly Joker',
    order: 11,
    rarity: 1,
    cost: 3,
    pos: { x: 0, y: 14 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { t_chips: 50, type: 'Pair' },
    descTemplate: '+50 Chips if played hand contains a Pair',
    formatDesc: () => '+50 Chips if played hand contains a Pair',
  },
  {
    key: 'j_wily',
    name: 'Wily Joker',
    order: 12,
    rarity: 1,
    cost: 4,
    pos: { x: 1, y: 14 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { t_chips: 100, type: 'Three of a Kind' },
    descTemplate: '+100 Chips if played hand contains a Three of a Kind',
    formatDesc: () => '+100 Chips if played hand contains a Three of a Kind',
  },
  {
    key: 'j_clever',
    name: 'Clever Joker',
    order: 13,
    rarity: 1,
    cost: 4,
    pos: { x: 2, y: 14 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { t_chips: 80, type: 'Two Pair' },
    descTemplate: '+80 Chips if played hand contains a Two Pair',
    formatDesc: () => '+80 Chips if played hand contains a Two Pair',
  },
  {
    key: 'j_devious',
    name: 'Devious Joker',
    order: 14,
    rarity: 1,
    cost: 4,
    pos: { x: 3, y: 14 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { t_chips: 100, type: 'Straight' },
    descTemplate: '+100 Chips if played hand contains a Straight',
    formatDesc: () => '+100 Chips if played hand contains a Straight',
  },
  {
    key: 'j_crafty',
    name: 'Crafty Joker',
    order: 15,
    rarity: 1,
    cost: 4,
    pos: { x: 4, y: 14 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { t_chips: 80, type: 'Flush' },
    descTemplate: '+80 Chips if played hand contains a Flush',
    formatDesc: () => '+80 Chips if played hand contains a Flush',
  },
  {
    key: 'j_half',
    name: 'Half Joker',
    order: 16,
    rarity: 1,
    cost: 5,
    pos: { x: 7, y: 0 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { mult: 20, size: 3 },
    descTemplate: '+20 Mult if played hand contains 3 or fewer cards',
    formatDesc: () => '+20 Mult if played hand contains 3 or fewer cards',
  },
  {
    key: 'j_credit_card',
    name: 'Credit Card',
    order: 20,
    rarity: 1,
    cost: 1,
    pos: { x: 5, y: 1 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 20 },
    descTemplate: 'Go up to -$20 in debt',
    formatDesc: () => 'Go up to -$20 in debt',
  },
  {
    key: 'j_banner',
    name: 'Banner',
    order: 22,
    rarity: 1,
    cost: 5,
    pos: { x: 1, y: 2 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 30 },
    descTemplate: '+30 Chips for each remaining discard',
    formatDesc: (_inst, state) => {
      const chips = Math.max(0, state.discardsLeft) * 30;
      return `+30 Chips for each remaining discard (Currently +${chips} Chips)`;
    },
  },
  {
    key: 'j_mystic_summit',
    name: 'Mystic Summit',
    order: 23,
    rarity: 1,
    cost: 5,
    pos: { x: 2, y: 2 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { mult: 15, d_remaining: 0 },
    descTemplate: '+15 Mult when 0 discards remaining',
    formatDesc: (_inst, state) =>
      `+15 Mult when 0 discards remaining (${state.discardsLeft === 0 ? 'Active' : `${state.discardsLeft} left`})`,
  },
  {
    key: 'j_8_ball',
    name: '8 Ball',
    order: 26,
    rarity: 1,
    cost: 5,
    pos: { x: 0, y: 5 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 4 },
    descTemplate:
      '1 in 4 chance for each played 8 to create a Tarot card when scored (Must have room)',
    formatDesc: (_inst, state) =>
      `${getProbMult(state)} in 4 chance for each played 8 to create a Tarot card when scored (Must have room)`,
  },
  {
    key: 'j_misprint',
    name: 'Misprint',
    order: 27,
    rarity: 1,
    cost: 4,
    pos: { x: 6, y: 2 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { max: 23, min: 0 },
    descTemplate: '+0 to +23 Mult',
    formatDesc: () => '+0 to +23 Mult (random each hand)',
  },
  {
    key: 'j_raised_fist',
    name: 'Raised Fist',
    order: 29,
    rarity: 1,
    cost: 5,
    pos: { x: 8, y: 2 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: {},
    descTemplate: 'Adds double the rank of lowest ranked card held in hand to Mult',
    formatDesc: () => 'Adds double the rank of lowest ranked card held in hand to Mult',
  },
  {
    key: 'j_chaos',
    name: 'Chaos the Clown',
    order: 30,
    rarity: 1,
    cost: 4,
    pos: { x: 1, y: 0 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 1 },
    descTemplate: '1 free Reroll per shop',
    formatDesc: () => '1 free Reroll per shop',
  },
  {
    key: 'j_scary_face',
    name: 'Scary Face',
    order: 33,
    rarity: 1,
    cost: 4,
    pos: { x: 2, y: 3 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 30 },
    descTemplate: 'Played face cards give +30 Chips when scored',
    formatDesc: () => 'Played face cards give +30 Chips when scored',
  },
  {
    key: 'j_abstract',
    name: 'Abstract Joker',
    order: 34,
    rarity: 1,
    cost: 4,
    pos: { x: 3, y: 3 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 3 },
    descTemplate: '+3 Mult for each Joker card (Currently +0 Mult)',
    formatDesc: (_inst, state) =>
      `+3 Mult for each Joker card (Currently +${state.jokers.length * 3} Mult)`,
  },
  {
    key: 'j_delayed_grat',
    name: 'Delayed Gratification',
    order: 35,
    rarity: 1,
    cost: 4,
    pos: { x: 4, y: 3 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 2 },
    descTemplate: 'Earn $2 per discard if no discards are used by end of the round',
    formatDesc: (_inst, state) => {
      const active = state.tracking.discardsUsedThisRound === 0;
      const bonus = active ? Math.max(0, state.discardsLeft) * 2 : 0;
      return `Earn $2 per discard if no discards are used by end of the round (${active ? `Currently $${bonus}` : 'Inactive this round'})`;
    },
  },
  {
    key: 'j_gros_michel',
    name: 'Gros Michel',
    order: 38,
    rarity: 1,
    cost: 5,
    pos: { x: 7, y: 6 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: false,
    config: { mult: 15, odds: 6 },
    descTemplate: '+15 Mult. 1 in 6 chance this card is destroyed at end of round',
    formatDesc: (_inst, state) =>
      `+15 Mult. ${getProbMult(state)} in 6 chance this card is destroyed at end of round`,
  },
  {
    key: 'j_even_steven',
    name: 'Even Steven',
    order: 39,
    rarity: 1,
    cost: 4,
    pos: { x: 8, y: 3 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 4 },
    descTemplate: 'Played cards with even rank give +4 Mult when scored (10, 8, 6, 4, 2)',
    formatDesc: () => 'Played cards with even rank give +4 Mult when scored (10, 8, 6, 4, 2)',
  },
  {
    key: 'j_odd_todd',
    name: 'Odd Todd',
    order: 40,
    rarity: 1,
    cost: 4,
    pos: { x: 9, y: 3 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 31 },
    descTemplate: 'Played cards with odd rank give +31 Chips when scored (A, 9, 7, 5, 3)',
    formatDesc: () => 'Played cards with odd rank give +31 Chips when scored (A, 9, 7, 5, 3)',
  },
  {
    key: 'j_scholar',
    name: 'Scholar',
    order: 41,
    rarity: 1,
    cost: 4,
    pos: { x: 0, y: 4 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { mult: 4, chips: 20 },
    descTemplate: 'Played Aces give +20 Chips and +4 Mult when scored',
    formatDesc: () => 'Played Aces give +20 Chips and +4 Mult when scored',
  },
  {
    key: 'j_business',
    name: 'Business Card',
    order: 42,
    rarity: 1,
    cost: 4,
    pos: { x: 1, y: 4 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 2 },
    descTemplate: 'Played face cards have a 1 in 2 chance to give $2 when scored',
    formatDesc: (_inst, state) =>
      `Played face cards have a ${getProbMult(state)} in 2 chance to give $2 when scored`,
  },
  {
    key: 'j_supernova',
    name: 'Supernova',
    order: 43,
    rarity: 1,
    cost: 5,
    pos: { x: 2, y: 4 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 1 },
    descTemplate: 'Adds the number of times poker hand has been played this run to Mult',
    formatDesc: () => 'Adds the number of times poker hand has been played this run to Mult',
  },
  {
    key: 'j_ride_the_bus',
    name: 'Ride the Bus',
    order: 44,
    rarity: 1,
    cost: 6,
    pos: { x: 1, y: 6 },
    blueprintCompat: true,
    perishableCompat: false,
    eternalCompat: true,
    config: { extra: 1, mult: 0 },
    descTemplate:
      'This Joker gains +1 Mult per consecutive hand played without a scoring face card (Currently +0 Mult)',
    formatDesc: (inst) => {
      const mult = getStateNum(inst.state, ['mult'], 0);
      return `This Joker gains +1 Mult per consecutive hand played without a scoring face card (Currently +${mult} Mult)`;
    },
  },
  {
    key: 'j_egg',
    name: 'Egg',
    order: 46,
    rarity: 1,
    cost: 4,
    pos: { x: 0, y: 10 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 3 },
    descTemplate: 'Gains $3 of sell value at end of round',
    formatDesc: (inst) =>
      `Gains $3 of sell value at end of round (Sell value: $${inst.sellValue})`,
  },
  {
    key: 'j_runner',
    name: 'Runner',
    order: 49,
    rarity: 1,
    cost: 5,
    pos: { x: 3, y: 10 },
    blueprintCompat: true,
    perishableCompat: false,
    eternalCompat: true,
    config: { chips: 0, chip_mod: 15 },
    descTemplate: 'Gains +15 Chips if played hand contains a Straight (Currently +0 Chips)',
    formatDesc: (inst) => {
      const chips = getStateNum(inst.state, ['chips'], 0);
      return `Gains +15 Chips if played hand contains a Straight (Currently +${chips} Chips)`;
    },
  },
  {
    key: 'j_ice_cream',
    name: 'Ice Cream',
    order: 50,
    rarity: 1,
    cost: 5,
    pos: { x: 4, y: 10 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: false,
    config: { chips: 100, chip_mod: 5 },
    descTemplate: '+100 Chips, -5 Chips for every hand played',
    formatDesc: (inst) => {
      const chips = getStateNum(inst.state, ['chips'], 100);
      return `+${chips} Chips, -5 Chips for every hand played`;
    },
  },
  {
    key: 'j_splash',
    name: 'Splash',
    order: 52,
    rarity: 1,
    cost: 3,
    pos: { x: 6, y: 10 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: {},
    descTemplate: 'Every played card counts in scoring',
    formatDesc: () => 'Every played card counts in scoring',
  },
  {
    key: 'j_blue_joker',
    name: 'Blue Joker',
    order: 53,
    rarity: 1,
    cost: 5,
    pos: { x: 7, y: 10 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 2 },
    descTemplate: '+2 Chips for each remaining card in deck (Currently +0 Chips)',
    formatDesc: (_inst, state) =>
      `+2 Chips for each remaining card in deck (Currently +${state.drawPile.length * 2} Chips)`,
  },
  {
    key: 'j_faceless',
    name: 'Faceless Joker',
    order: 57,
    rarity: 1,
    cost: 4,
    pos: { x: 1, y: 11 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { dollars: 5, faces: 3 },
    descTemplate: 'Earn $5 if 3 or more face cards are discarded at the same time',
    formatDesc: () => 'Earn $5 if 3 or more face cards are discarded at the same time',
  },
  {
    key: 'j_green_joker',
    name: 'Green Joker',
    order: 58,
    rarity: 1,
    cost: 4,
    pos: { x: 2, y: 11 },
    blueprintCompat: true,
    perishableCompat: false,
    eternalCompat: true,
    config: { hand_add: 1, discard_sub: 1, mult: 0 },
    descTemplate: '+1 Mult per hand played, -1 Mult per discard (Currently +0 Mult)',
    formatDesc: (inst) => {
      const mult = getStateNum(inst.state, ['mult'], 0);
      return `+1 Mult per hand played, -1 Mult per discard (Currently +${mult} Mult)`;
    },
  },
  {
    key: 'j_superposition',
    name: 'Superposition',
    order: 59,
    rarity: 1,
    cost: 4,
    pos: { x: 3, y: 11 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: {},
    descTemplate: 'Create a Tarot card if poker hand contains an Ace and a Straight (Must have room)',
    formatDesc: () =>
      'Create a Tarot card if poker hand contains an Ace and a Straight (Must have room)',
  },
  {
    key: 'j_todo_list',
    name: 'To Do List',
    order: 60,
    rarity: 1,
    cost: 4,
    pos: { x: 4, y: 11 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { dollars: 4, poker_hand: 'High Card' },
    descTemplate: 'Earn $4 if poker hand is a High Card, poker hand changes at end of round',
    formatDesc: (inst) => {
      const target =
        typeof inst.state.poker_hand === 'string' && inst.state.poker_hand.length > 0
          ? inst.state.poker_hand
          : 'High Card';
      return `Earn $4 if poker hand is a ${target}, poker hand changes at end of round`;
    },
  },
  {
    key: 'j_cavendish',
    name: 'Cavendish',
    order: 61,
    rarity: 1,
    cost: 4,
    pos: { x: 5, y: 11 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: false,
    config: { xMult: 3, odds: 1000 },
    descTemplate: 'X3 Mult. 1 in 1000 chance this card is destroyed at end of round',
    formatDesc: (_inst, state) =>
      `X3 Mult. ${getProbMult(state)} in 1000 chance this card is destroyed at end of round`,
  },
  {
    key: 'j_red_card',
    name: 'Red Card',
    order: 63,
    rarity: 1,
    cost: 5,
    pos: { x: 7, y: 11 },
    blueprintCompat: true,
    perishableCompat: false,
    eternalCompat: true,
    config: { extra: 3, mult: 0 },
    descTemplate: 'This Joker gains +3 Mult when any Booster Pack is skipped (Currently +0 Mult)',
    formatDesc: (inst) => {
      const mult = getStateNum(inst.state, ['mult'], 0);
      return `This Joker gains +3 Mult when any Booster Pack is skipped (Currently +${mult} Mult)`;
    },
  },
  {
    key: 'j_square',
    name: 'Square Joker',
    order: 65,
    rarity: 1,
    cost: 4,
    pos: { x: 9, y: 11 },
    blueprintCompat: true,
    perishableCompat: false,
    eternalCompat: true,
    config: { chips: 0, chip_mod: 4 },
    descTemplate: 'This Joker gains +4 Chips if played hand has exactly 4 cards (Currently +0 Chips)',
    formatDesc: (inst) => {
      const chips = getStateNum(inst.state, ['chips'], 0);
      return `This Joker gains +4 Chips if played hand has exactly 4 cards (Currently +${chips} Chips)`;
    },
  },
  {
    key: 'j_riff_raff',
    name: 'Riff-Raff',
    order: 67,
    rarity: 1,
    cost: 6,
    pos: { x: 1, y: 12 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 2 },
    descTemplate: 'When Blind is selected, create 2 Common Jokers (Must have room)',
    formatDesc: () => 'When Blind is selected, create 2 Common Jokers (Must have room)',
  },
  {
    key: 'j_photograph',
    name: 'Photograph',
    order: 78,
    rarity: 1,
    cost: 5,
    pos: { x: 2, y: 13 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 2 },
    descTemplate: 'First played face card gives X2 Mult when scored',
    formatDesc: () => 'First played face card gives X2 Mult when scored',
  },
  {
    key: 'j_reserved_parking',
    name: 'Reserved Parking',
    order: 82,
    rarity: 1,
    cost: 6,
    pos: { x: 6, y: 13 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { odds: 2, dollars: 1 },
    descTemplate: 'Each face card held in hand has a 1 in 2 chance to give $1',
    formatDesc: (_inst, state) =>
      `Each face card held in hand has a ${getProbMult(state)} in 2 chance to give $1`,
  },
  {
    key: 'j_mail',
    name: 'Mail-In Rebate',
    order: 83,
    rarity: 1,
    cost: 4,
    pos: { x: 7, y: 13 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 5 },
    descTemplate: 'Earn $5 for each discarded Ace, rank changes every round',
    formatDesc: (_inst, state) =>
      `Earn $5 for each discarded ${state.tracking.mailRank}, rank changes every round`,
  },
  {
    key: 'j_hallucination',
    name: 'Hallucination',
    order: 85,
    rarity: 1,
    cost: 4,
    pos: { x: 9, y: 13 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 2 },
    descTemplate:
      '1 in 2 chance to create a Tarot card when any Booster Pack is opened (Must have room)',
    formatDesc: (_inst, state) =>
      `${getProbMult(state)} in 2 chance to create a Tarot card when any Booster Pack is opened (Must have room)`,
  },
  {
    key: 'j_fortune_teller',
    name: 'Fortune Teller',
    order: 86,
    rarity: 1,
    cost: 6,
    pos: { x: 7, y: 5 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 1 },
    descTemplate: '+1 Mult per Tarot card used this run (Currently +0 Mult)',
    formatDesc: (_inst, state) =>
      `+1 Mult per Tarot card used this run (Currently +${state.tracking.tarotsUsedTotal} Mult)`,
  },
  {
    key: 'j_juggler',
    name: 'Juggler',
    order: 87,
    rarity: 1,
    cost: 4,
    pos: { x: 0, y: 1 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: { h_size: 1 },
    descTemplate: '+1 hand size',
    formatDesc: () => '+1 hand size',
  },
  {
    key: 'j_drunkard',
    name: 'Drunkard',
    order: 88,
    rarity: 1,
    cost: 4,
    pos: { x: 1, y: 1 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: { d_size: 1 },
    descTemplate: '+1 discard each round',
    formatDesc: () => '+1 discard each round',
  },
  {
    key: 'j_golden',
    name: 'Golden Joker',
    order: 90,
    rarity: 1,
    cost: 6,
    pos: { x: 9, y: 2 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 4 },
    descTemplate: 'Earn $4 at end of round',
    formatDesc: () => 'Earn $4 at end of round',
  },
  {
    key: 'j_popcorn',
    name: 'Popcorn',
    order: 97,
    rarity: 1,
    cost: 5,
    pos: { x: 1, y: 15 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: false,
    config: { mult: 20, extra: 4 },
    descTemplate: '+20 Mult, -4 Mult per round played',
    formatDesc: (inst) => {
      const mult = getStateNum(inst.state, ['mult'], 20);
      return `+${mult} Mult, -4 Mult per round played`;
    },
  },
  {
    key: 'j_walkie_talkie',
    name: 'Walkie Talkie',
    order: 101,
    rarity: 1,
    cost: 4,
    pos: { x: 8, y: 15 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { chips: 10, mult: 4 },
    descTemplate: 'Each played 10 or 4 gives +10 Chips and +4 Mult when scored',
    formatDesc: () => 'Each played 10 or 4 gives +10 Chips and +4 Mult when scored',
  },
  {
    key: 'j_smiley',
    name: 'Smiley Face',
    order: 104,
    rarity: 1,
    cost: 4,
    pos: { x: 6, y: 15 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 5 },
    descTemplate: 'Played face cards give +5 Mult when scored',
    formatDesc: () => 'Played face cards give +5 Mult when scored',
  },
  {
    key: 'j_ticket',
    name: 'Golden Ticket',
    order: 106,
    rarity: 1,
    cost: 5,
    pos: { x: 5, y: 3 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 4 },
    descTemplate: 'Played Gold cards earn $4 when scored',
    formatDesc: () => 'Played Gold cards earn $4 when scored',
  },
  {
    key: 'j_swashbuckler',
    name: 'Swashbuckler',
    order: 110,
    rarity: 1,
    cost: 4,
    pos: { x: 9, y: 5 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { mult: 1 },
    descTemplate: 'Adds the sell value of all other owned Jokers to Mult (Currently +0 Mult)',
    formatDesc: (inst, state) => {
      let total = 0;
      for (const j of state.jokers) {
        if (j.id !== inst.id) total += j.sellValue;
      }
      return `Adds the sell value of all other owned Jokers to Mult (Currently +${total} Mult)`;
    },
  },
  {
    key: 'j_hanging_chad',
    name: 'Hanging Chad',
    order: 115,
    rarity: 1,
    cost: 4,
    pos: { x: 9, y: 6 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 2 },
    descTemplate: 'Retrigger first played card used in scoring 2 additional times',
    formatDesc: () => 'Retrigger first played card used in scoring 2 additional times',
  },
  {
    key: 'j_shoot_the_moon',
    name: 'Shoot the Moon',
    order: 140,
    rarity: 1,
    cost: 5,
    pos: { x: 2, y: 6 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 13 },
    descTemplate: 'Each Queen held in hand gives +13 Mult',
    formatDesc: () => 'Each Queen held in hand gives +13 Mult',
  },
];

export const COMMON_JOKER_HOOKS: Record<string, JokerHookFn> = {
  j_joker(ctx) {
    if (ctx.stage === 'joker_main') {
      return {
        mult: 4,
        message: '+4 Mult',
        color: PALETTE.MULT,
        sound: 'multhit1',
      };
    }
    return null;
  },

  j_greedy_joker: makeSuitMultHook('Diamonds', 3),
  j_lusty_joker: makeSuitMultHook('Hearts', 3),
  j_wrathful_joker: makeSuitMultHook('Spades', 3),
  j_gluttenous_joker: makeSuitMultHook('Clubs', 3),

  j_jolly: makeHandTypeMultHook('Pair', 8),
  j_zany: makeHandTypeMultHook('Three of a Kind', 12),
  j_mad: makeHandTypeMultHook('Two Pair', 10),
  j_crazy: makeHandTypeMultHook('Straight', 12),
  j_droll: makeHandTypeMultHook('Flush', 10),

  j_sly: makeHandTypeChipsHook('Pair', 50),
  j_wily: makeHandTypeChipsHook('Three of a Kind', 100),
  j_clever: makeHandTypeChipsHook('Two Pair', 80),
  j_devious: makeHandTypeChipsHook('Straight', 100),
  j_crafty: makeHandTypeChipsHook('Flush', 80),

  j_half(ctx) {
    if (ctx.stage === 'joker_main' && ctx.fullHand && ctx.fullHand.length <= 3) {
      return {
        mult: 20,
        message: '+20 Mult',
        color: PALETTE.MULT,
        sound: 'multhit1',
      };
    }
    return null;
  },

  // Passive: handled by syncBankruptAt (-$20 debt limit per copy)
  j_credit_card() {
    return null;
  },

  j_banner(ctx) {
    if (ctx.stage === 'joker_main') {
      const discards = Math.max(0, ctx.state.discardsLeft);
      if (discards > 0) {
        const chips = discards * 30;
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

  j_mystic_summit(ctx) {
    if (ctx.stage === 'joker_main' && ctx.state.discardsLeft === 0) {
      return {
        mult: 15,
        message: '+15 Mult',
        color: PALETTE.MULT,
        sound: 'multhit1',
      };
    }
    return null;
  },

  j_8_ball(ctx) {
    if (
      ctx.stage === 'individual_play' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.card.enhancement !== 'm_stone' &&
      ctx.card.rank === '8' &&
      hasConsumableRoom(ctx.state)
    ) {
      if (ctx.rand('8ball') < ctx.probMultiplier / 4) {
        return {
          createConsumable: { set: 'Tarot' },
          message: '+1 Tarot',
          color: PALETTE.PURPLE,
          sound: 'tarot1',
        };
      }
    }
    return null;
  },

  j_misprint(ctx) {
    if (ctx.stage === 'joker_main') {
      const min = getStateNum(ctx.joker.state, ['min'], 0);
      const max = getStateNum(ctx.joker.state, ['max'], 23);
      const span = Math.max(1, max - min + 1);
      const mult = min + ctx.randInt('misprint', span);
      return {
        mult,
        message: `+${mult} Mult`,
        color: PALETTE.MULT,
        sound: 'multhit1',
      };
    }
    return null;
  },

  j_raised_fist(ctx) {
    if (
      ctx.stage === 'individual_hand' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.heldCards &&
      ctx.heldCards.length > 0
    ) {
      // Pick rightmost lowest-ranked non-Stone card in hand (including debuffed cards in rank search)
      let lowestCard: CardInstance | null = null;
      let lowestVal = Infinity;
      for (const c of ctx.heldCards) {
        if (c.enhancement === 'm_stone') continue;
        const val = RANK_VALUES[c.rank];
        if (val <= lowestVal) {
          lowestVal = val;
          lowestCard = c;
        }
      }
      if (lowestCard && lowestCard.id === ctx.card.id) {
        const mult = RANK_CHIPS[lowestCard.rank] * 2;
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

  // Passive: handled by shop generation (+1 free reroll per shop)
  j_chaos() {
    return null;
  },

  j_scary_face(ctx) {
    if (
      ctx.stage === 'individual_play' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.isFace(ctx.card)
    ) {
      return {
        chips: 30,
        message: '+30 Chips',
        color: PALETTE.CHIPS,
        sound: 'chips1',
      };
    }
    return null;
  },

  j_abstract(ctx) {
    if (ctx.stage === 'joker_main') {
      const mult = ctx.state.jokers.length * 3;
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

  j_delayed_grat(ctx) {
    if (
      ctx.stage === 'calc_dollar_bonus' &&
      ctx.state.tracking.discardsUsedThisRound === 0 &&
      ctx.state.discardsLeft > 0
    ) {
      return {
        dollars: ctx.state.discardsLeft * 2,
      };
    }
    return null;
  },

  j_gros_michel(ctx) {
    if (ctx.stage === 'joker_main') {
      return {
        mult: 15,
        message: '+15 Mult',
        color: PALETTE.MULT,
        sound: 'multhit1',
      };
    }
    if (ctx.stage === 'end_of_round' && !ctx.isBlueprint) {
      if (ctx.rand('gros_michel') < ctx.probMultiplier / 6) {
        if (!ctx.state.tracking.bannedKeys.includes('j_gros_michel')) {
          ctx.state.tracking.bannedKeys.push('j_gros_michel');
        }
        if (!ctx.state.tracking.bannedOthers.includes('__extinct_gros_michel')) {
          ctx.state.tracking.bannedOthers.push('__extinct_gros_michel');
        }
        return {
          destroySelf: true,
          message: 'Extinct!',
          color: PALETTE.RED,
          sound: 'tarot1',
        };
      }
      return {
        message: 'Safe!',
        color: PALETTE.GREEN,
      };
    }
    return null;
  },

  j_even_steven(ctx) {
    if (
      ctx.stage === 'individual_play' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.card.enhancement !== 'm_stone' &&
      EVEN_RANKS.has(ctx.card.rank)
    ) {
      return {
        mult: 4,
        message: '+4 Mult',
        color: PALETTE.MULT,
        sound: 'multhit1',
      };
    }
    return null;
  },

  j_odd_todd(ctx) {
    if (
      ctx.stage === 'individual_play' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.card.enhancement !== 'm_stone' &&
      ODD_RANKS.has(ctx.card.rank)
    ) {
      return {
        chips: 31,
        message: '+31 Chips',
        color: PALETTE.CHIPS,
        sound: 'chips1',
      };
    }
    return null;
  },

  j_scholar(ctx) {
    if (
      ctx.stage === 'individual_play' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.card.enhancement !== 'm_stone' &&
      ctx.card.rank === 'Ace'
    ) {
      return {
        chips: 20,
        mult: 4,
        message: '+20 Chips +4 Mult',
        color: PALETTE.MULT,
        sound: 'multhit1',
      };
    }
    return null;
  },

  j_business(ctx) {
    if (
      ctx.stage === 'individual_play' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.isFace(ctx.card)
    ) {
      if (ctx.rand('business') < ctx.probMultiplier / 2) {
        return {
          dollars: 2,
          message: '+$2',
          color: PALETTE.MONEY,
          sound: 'coin1',
        };
      }
    }
    return null;
  },

  j_supernova(ctx) {
    if (ctx.stage === 'joker_main' && ctx.handEval) {
      const played = ctx.state.handLevels[ctx.handEval.handId]?.played ?? 0;
      if (played > 0) {
        return {
          mult: played,
          message: `+${played} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit1',
        };
      }
    }
    return null;
  },

  j_ride_the_bus(ctx) {
    if (ctx.stage === 'before' && !ctx.isBlueprint && ctx.scoringHand) {
      const hasScoringFace = ctx.scoringHand.some((c) => !c.debuffed && ctx.isFace(c));
      const cur = getStateNum(ctx.joker.state, ['mult'], 0);
      if (hasScoringFace) {
        ctx.joker.state.mult = 0;
        if (cur > 0) {
          return {
            message: 'Reset!',
            color: PALETTE.RED,
          };
        }
        return null;
      }
      const next = cur + 1;
      ctx.joker.state.mult = next;
      return {
        message: '+1 Mult',
        color: PALETTE.MULT,
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

  j_egg(ctx) {
    if (ctx.stage === 'end_of_round' && !ctx.isBlueprint) {
      return {
        addSellValue: 3,
        message: 'Value Up!',
        color: PALETTE.MONEY,
        sound: 'coin1',
      };
    }
    return null;
  },

  j_runner(ctx) {
    if (
      ctx.stage === 'before' &&
      !ctx.isBlueprint &&
      ctx.handEval?.containedHands.includes('Straight')
    ) {
      const cur = getStateNum(ctx.joker.state, ['chips'], 0);
      const gain = getStateNum(ctx.joker.state, ['chip_mod'], 15);
      ctx.joker.state.chips = cur + gain;
      return {
        message: `+${gain} Chips`,
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

  j_ice_cream(ctx) {
    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['chips'], 100);
      if (cur > 0) {
        return {
          chips: cur,
          message: `+${cur} Chips`,
          color: PALETTE.CHIPS,
          sound: 'chips1',
        };
      }
    }
    if (ctx.stage === 'after' && !ctx.isBlueprint) {
      const cur = getStateNum(ctx.joker.state, ['chips'], 100);
      const loss = getStateNum(ctx.joker.state, ['chip_mod'], 5);
      const next = cur - loss;
      if (next <= 0) {
        ctx.joker.state.chips = 0;
        return {
          destroySelf: true,
          message: 'Melted!',
          color: PALETTE.CHIPS,
          sound: 'tarot1',
        };
      }
      ctx.joker.state.chips = next;
      return {
        message: `-${loss} Chips`,
        color: PALETTE.CHIPS,
      };
    }
    return null;
  },

  // Passive: handled by poker hand evaluator (all played cards score)
  j_splash() {
    return null;
  },

  j_blue_joker(ctx) {
    if (ctx.stage === 'joker_main') {
      const remaining = ctx.state.drawPile.length;
      if (remaining > 0) {
        const chips = remaining * 2;
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

  j_faceless(ctx) {
    if (ctx.stage === 'discard' && ctx.fullHand && ctx.fullHand.length > 0) {
      // Engine dispatches `discard` per card; evaluate simultaneous discard once on final card
      if (ctx.card && ctx.card.id !== ctx.fullHand[ctx.fullHand.length - 1].id) {
        return null;
      }
      let faceCount = 0;
      for (const c of ctx.fullHand) {
        if (!c.debuffed && ctx.isFace(c)) faceCount += 1;
      }
      const required = getStateNum(ctx.joker.state, ['faces'], 3);
      if (faceCount >= required) {
        const dollars = getStateNum(ctx.joker.state, ['dollars'], 5);
        return {
          dollars,
          message: `+$${dollars}`,
          color: PALETTE.MONEY,
          sound: 'coin1',
        };
      }
    }
    return null;
  },

  j_green_joker(ctx) {
    if (ctx.stage === 'before' && !ctx.isBlueprint) {
      const cur = getStateNum(ctx.joker.state, ['mult'], 0);
      const add = getStateNum(ctx.joker.state, ['hand_add'], 1);
      ctx.joker.state.mult = cur + add;
      return {
        message: `+${add} Mult`,
        color: PALETTE.MULT,
      };
    }
    if (ctx.stage === 'discard' && !ctx.isBlueprint) {
      // Decrement once per discard action, not once per discarded card
      if (
        ctx.card &&
        ctx.fullHand &&
        ctx.fullHand.length > 0 &&
        ctx.card.id !== ctx.fullHand[ctx.fullHand.length - 1].id
      ) {
        return null;
      }
      const cur = getStateNum(ctx.joker.state, ['mult'], 0);
      if (cur > 0) {
        const sub = getStateNum(ctx.joker.state, ['discard_sub'], 1);
        ctx.joker.state.mult = Math.max(0, cur - sub);
        return {
          message: `-${sub} Mult`,
          color: PALETTE.MULT,
        };
      }
      return null;
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

  j_superposition(ctx) {
    if (
      ctx.stage === 'joker_main' &&
      ctx.handEval?.containedHands.includes('Straight') &&
      hasConsumableRoom(ctx.state)
    ) {
      const cardsToCheck = ctx.scoringHand ?? ctx.fullHand ?? [];
      const hasAce = cardsToCheck.some((c) => c.enhancement !== 'm_stone' && c.rank === 'Ace');
      if (hasAce) {
        return {
          createConsumable: { set: 'Tarot' },
          message: '+1 Tarot',
          color: PALETTE.PURPLE,
          sound: 'tarot1',
        };
      }
    }
    return null;
  },

  j_todo_list(ctx) {
    if (ctx.stage === 'before' && ctx.handEval) {
      const target =
        typeof ctx.joker.state.poker_hand === 'string' && ctx.joker.state.poker_hand.length > 0
          ? ctx.joker.state.poker_hand
          : 'High Card';
      if (ctx.handEval.handId === target) {
        const dollars = getStateNum(ctx.joker.state, ['dollars'], 4);
        return {
          dollars,
          message: `+$${dollars}`,
          color: PALETTE.MONEY,
          sound: 'coin1',
        };
      }
    }
    if (ctx.stage === 'end_of_round' && !ctx.isBlueprint) {
      const current =
        typeof ctx.joker.state.poker_hand === 'string' ? ctx.joker.state.poker_hand : 'High Card';
      const visibleOther = POKER_HAND_IDS.filter((id) => {
        if (id === current) return false;
        const hl = ctx.state.handLevels[id];
        return hl ? hl.visible : true;
      });
      const pool =
        visibleOther.length > 0 ? visibleOther : POKER_HAND_IDS.filter((id) => id !== current);
      if (pool.length > 0) {
        const idx = ctx.randInt('to_do', pool.length);
        ctx.joker.state.poker_hand = pool[idx] ?? pool[0];
      }
    }
    return null;
  },

  j_cavendish(ctx) {
    if (ctx.stage === 'joker_main') {
      return {
        xMult: 3,
        message: 'X3 Mult',
        color: PALETTE.MULT,
        sound: 'multhit2',
      };
    }
    if (ctx.stage === 'end_of_round' && !ctx.isBlueprint) {
      if (ctx.rand('cavendish') < ctx.probMultiplier / 1000) {
        return {
          destroySelf: true,
          message: 'Extinct!',
          color: PALETTE.RED,
          sound: 'tarot1',
        };
      }
      return {
        message: 'Safe!',
        color: PALETTE.GREEN,
      };
    }
    return null;
  },

  j_red_card(ctx) {
    if (ctx.stage === 'skipping_booster' && !ctx.isBlueprint) {
      const cur = getStateNum(ctx.joker.state, ['mult'], 0);
      const gain = getStateNum(ctx.joker.state, ['extra'], 3);
      ctx.joker.state.mult = cur + gain;
      return {
        message: `+${gain} Mult`,
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

  j_square(ctx) {
    if (ctx.stage === 'before' && !ctx.isBlueprint && ctx.fullHand && ctx.fullHand.length === 4) {
      const cur = getStateNum(ctx.joker.state, ['chips'], 0);
      const gain = getStateNum(ctx.joker.state, ['chip_mod'], 4);
      ctx.joker.state.chips = cur + gain;
      return {
        message: `+${gain} Chips`,
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

  // Engine-owned on SELECT_BLIND (spawns up to 2 Common Jokers respecting slots; returns null here to avoid double-trigger)
  j_riff_raff() {
    return null;
  },

  j_photograph(ctx) {
    if (ctx.stage === 'individual_play' && ctx.card && !ctx.card.debuffed && ctx.scoringHand) {
      const firstFace = ctx.scoringHand.find((c) => !c.debuffed && ctx.isFace(c));
      if (firstFace && firstFace.id === ctx.card.id) {
        return {
          xMult: 2,
          message: 'X2 Mult',
          color: PALETTE.MULT,
          sound: 'multhit2',
        };
      }
    }
    return null;
  },

  j_reserved_parking(ctx) {
    if (
      ctx.stage === 'individual_hand' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.isFace(ctx.card)
    ) {
      if (ctx.rand('parking') < ctx.probMultiplier / 2) {
        const dollars = getStateNum(ctx.joker.state, ['dollars'], 1);
        return {
          dollars,
          message: `+$${dollars}`,
          color: PALETTE.MONEY,
          sound: 'coin1',
        };
      }
    }
    return null;
  },

  j_mail(ctx) {
    if (
      ctx.stage === 'discard' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.card.enhancement !== 'm_stone' &&
      ctx.card.rank === ctx.state.tracking.mailRank
    ) {
      const dollars = getStateNum(ctx.joker.state, ['extra'], 5);
      return {
        dollars,
        message: `+$${dollars}`,
        color: PALETTE.MONEY,
        sound: 'coin1',
      };
    }
    return null;
  },

  j_hallucination(ctx) {
    if (ctx.stage === 'open_booster' && hasConsumableRoom(ctx.state)) {
      if (ctx.rand('halu') < ctx.probMultiplier / 2) {
        return {
          createConsumable: { set: 'Tarot' },
          message: '+1 Tarot',
          color: PALETTE.PURPLE,
          sound: 'tarot1',
        };
      }
    }
    return null;
  },

  j_fortune_teller(ctx) {
    if (ctx.stage === 'joker_main') {
      const mult = ctx.state.tracking.tarotsUsedTotal;
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

  // Passive: handled by getEffectiveHandSize (+1 hand size)
  j_juggler() {
    return null;
  },

  // Passive: handled by selectActiveBlindInternal (+1 discard per round)
  j_drunkard() {
    return null;
  },

  j_golden(ctx) {
    if (ctx.stage === 'calc_dollar_bonus') {
      return {
        dollars: getStateNum(ctx.joker.state, ['extra'], 4),
      };
    }
    return null;
  },

  j_popcorn(ctx) {
    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['mult'], 20);
      if (cur > 0) {
        return {
          mult: cur,
          message: `+${cur} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit1',
        };
      }
    }
    if (ctx.stage === 'end_of_round' && !ctx.isBlueprint) {
      const cur = getStateNum(ctx.joker.state, ['mult'], 20);
      const sub = getStateNum(ctx.joker.state, ['extra'], 4);
      const next = cur - sub;
      if (next <= 0) {
        ctx.joker.state.mult = 0;
        return {
          destroySelf: true,
          message: 'Eaten!',
          color: PALETTE.MULT,
          sound: 'tarot1',
        };
      }
      ctx.joker.state.mult = next;
      return {
        message: `-${sub} Mult`,
        color: PALETTE.MULT,
      };
    }
    return null;
  },

  j_walkie_talkie(ctx) {
    if (
      ctx.stage === 'individual_play' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.card.enhancement !== 'm_stone' &&
      (ctx.card.rank === '10' || ctx.card.rank === '4')
    ) {
      return {
        chips: 10,
        mult: 4,
        message: '+10 Chips +4 Mult',
        color: PALETTE.MULT,
        sound: 'multhit1',
      };
    }
    return null;
  },

  j_smiley(ctx) {
    if (
      ctx.stage === 'individual_play' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.isFace(ctx.card)
    ) {
      return {
        mult: 5,
        message: '+5 Mult',
        color: PALETTE.MULT,
        sound: 'multhit1',
      };
    }
    return null;
  },

  j_ticket(ctx) {
    if (
      ctx.stage === 'individual_play' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.card.enhancement === 'm_gold'
    ) {
      return {
        dollars: 4,
        message: '+$4',
        color: PALETTE.MONEY,
        sound: 'coin1',
      };
    }
    return null;
  },

  j_swashbuckler(ctx) {
    if (ctx.stage === 'joker_main') {
      let total = 0;
      for (const j of ctx.state.jokers) {
        if (j.id !== ctx.joker.id) {
          total += j.sellValue;
        }
      }
      if (total > 0) {
        return {
          mult: total,
          message: `+${total} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit1',
        };
      }
    }
    return null;
  },

  j_hanging_chad(ctx) {
    if (
      ctx.stage === 'repetition_play' &&
      ctx.card &&
      ctx.scoringHand &&
      ctx.scoringHand.length > 0 &&
      ctx.scoringHand[0].id === ctx.card.id
    ) {
      return {
        repetitions: 2,
        message: 'Again!',
        color: PALETTE.ORANGE,
      };
    }
    return null;
  },

  j_shoot_the_moon(ctx) {
    if (
      ctx.stage === 'individual_hand' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.card.enhancement !== 'm_stone' &&
      ctx.card.rank === 'Queen'
    ) {
      return {
        mult: 13,
        message: '+13 Mult',
        color: PALETTE.MULT,
        sound: 'multhit1',
      };
    }
    return null;
  },
};
