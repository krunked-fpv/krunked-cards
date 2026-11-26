import {
  PALETTE,
  type JokerDef,
  type JokerEvalContext,
  type JokerEvalResult,
  type JokerHookFn,
  type JokerInstance,
  type SimState,
} from '../contracts/index.ts';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatNum(n: number): string {
  const r = round2(n);
  return Number.isInteger(r) ? String(r) : String(r);
}

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

function isFirstHandOfRound(ctx: JokerEvalContext): boolean {
  const totalHandLevelPlays = Object.values(ctx.state.handLevels ?? {}).reduce(
    (sum, h) => sum + (h?.playedThisRound ?? 0),
    0
  );
  if (totalHandLevelPlays > 0) {
    return totalHandLevelPlays === 1;
  }
  return ctx.state.tracking.handsPlayedThisRound === 0;
}

function resolveCopyTarget(
  state: SimState,
  startIndex: number
): { target: JokerInstance; targetIndex: number } | null {
  const visited = new Set<number>();
  let idx = startIndex;
  while (idx >= 0 && idx < state.jokers.length) {
    if (visited.has(idx)) return null;
    visited.add(idx);
    const cur = state.jokers[idx];
    if (!cur || cur.debuffed) return null;
    if (cur.key === 'j_blueprint') {
      idx = idx + 1;
      continue;
    }
    if (cur.key === 'j_brainstorm') {
      idx = 0;
      continue;
    }
    const def = JOKER_MAP[cur.key];
    if (!def || !def.blueprintCompat) return null;
    return { target: cur, targetIndex: idx };
  }
  return null;
}

function evaluateCopyJoker(
  ctx: JokerEvalContext,
  nextIndex: number
): JokerEvalResult | null {
  const visited = new Set<number>([ctx.jokerIndex]);
  let idx = nextIndex;
  while (idx >= 0 && idx < ctx.state.jokers.length) {
    if (visited.has(idx)) return null;
    visited.add(idx);
    const cur = ctx.state.jokers[idx];
    if (!cur || cur.debuffed) return null;
    if (cur.key === 'j_blueprint') {
      idx = idx + 1;
      continue;
    }
    if (cur.key === 'j_brainstorm') {
      idx = 0;
      continue;
    }
    const def = JOKER_MAP[cur.key];
    if (!def || !def.blueprintCompat) return null;
    const targetHook = JOKER_HOOKS[cur.key];
    if (!targetHook) return null;
    return targetHook({
      ...ctx,
      joker: cur,
      jokerIndex: idx,
      isBlueprint: true,
      blueprintSource: ctx.blueprintSource ?? ctx.joker,
    });
  }
  return null;
}

export const JOKERS: JokerDef[] = [
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
    formatDesc: (_inst, state) =>
      `${getProbMult(state)} in 4 chance to upgrade level of played poker hand`,
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
    key: 'j_dna',
    name: 'DNA',
    order: 51,
    rarity: 3,
    cost: 8,
    pos: { x: 5, y: 10 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: {},
    descTemplate:
      'If first hand of round has only 1 card, add a permanent copy to deck and draw it to hand',
    formatDesc: () =>
      'If first hand of round has only 1 card, add a permanent copy to deck and draw it to hand',
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
    key: 'j_constellation',
    name: 'Constellation',
    order: 55,
    rarity: 2,
    cost: 6,
    pos: { x: 9, y: 10 },
    blueprintCompat: true,
    perishableCompat: false,
    eternalCompat: true,
    config: { extra: 0.1, xMult: 1 },
    descTemplate:
      'This Joker gains X0.1 Mult every time a Planet card is used (Currently X1 Mult)',
    formatDesc: (inst) => {
      const xMult = getStateNum(inst.state, ['xMult', 'Xmult'], 1);
      return `This Joker gains X0.1 Mult every time a Planet card is used (Currently X${formatNum(xMult)} Mult)`;
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
    key: 'j_vampire',
    name: 'Vampire',
    order: 68,
    rarity: 2,
    cost: 7,
    pos: { x: 2, y: 12 },
    blueprintCompat: true,
    perishableCompat: false,
    eternalCompat: true,
    config: { extra: 0.1, xMult: 1 },
    descTemplate:
      'This Joker gains X0.1 Mult per scoring Enhanced card played, removes card Enhancement (Currently X1 Mult)',
    formatDesc: (inst) => {
      const xMult = getStateNum(inst.state, ['xMult', 'Xmult'], 1);
      return `This Joker gains X0.1 Mult per scoring Enhanced card played, removes card Enhancement (Currently X${formatNum(xMult)} Mult)`;
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
    config: { extra: 0.25, xMult: 1 },
    descTemplate:
      'This Joker gains X0.25 Mult every time a playing card is added to your deck (Currently X1 Mult)',
    formatDesc: (inst) => {
      const xMult = getStateNum(inst.state, ['xMult', 'Xmult'], 1);
      return `This Joker gains X0.25 Mult every time a playing card is added to your deck (Currently X${formatNum(xMult)} Mult)`;
    },
  },
  {
    key: 'j_baron',
    name: 'Baron',
    order: 72,
    rarity: 3,
    cost: 8,
    pos: { x: 6, y: 12 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 1.5 },
    descTemplate: 'Each King held in hand gives X1.5 Mult',
    formatDesc: () => 'Each King held in hand gives X1.5 Mult',
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
    key: 'j_blueprint',
    name: 'Blueprint',
    order: 123,
    rarity: 3,
    cost: 10,
    pos: { x: 0, y: 3 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: {},
    descTemplate: 'Copies ability of Joker to the right',
    formatDesc: (inst, state) => {
      const idx = state.jokers.findIndex((j) => j.id === inst.id);
      if (idx < 0) return 'Copies ability of Joker to the right';
      const resolved = resolveCopyTarget(state, idx + 1);
      const status = resolved
        ? `compatible: ${JOKER_MAP[resolved.target.key]?.name ?? resolved.target.key}`
        : 'incompatible';
      return `Copies ability of Joker to the right (${status})`;
    },
  },
  {
    key: 'j_stuntman',
    name: 'Stuntman',
    order: 136,
    rarity: 3,
    cost: 7,
    pos: { x: 8, y: 6 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { chip_mod: 250, h_size: 2 },
    descTemplate: '+250 Chips, -2 hand size',
    formatDesc: () => '+250 Chips, -2 hand size',
  },
  {
    key: 'j_brainstorm',
    name: 'Brainstorm',
    order: 138,
    rarity: 3,
    cost: 10,
    pos: { x: 7, y: 7 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: {},
    descTemplate: 'Copies the ability of leftmost Joker',
    formatDesc: (inst, state) => {
      const idx = state.jokers.findIndex((j) => j.id === inst.id);
      if (idx <= 0) return 'Copies the ability of leftmost Joker (incompatible)';
      const resolved = resolveCopyTarget(state, 0);
      const status = resolved
        ? `compatible: ${JOKER_MAP[resolved.target.key]?.name ?? resolved.target.key}`
        : 'incompatible';
      return `Copies the ability of leftmost Joker (${status})`;
    },
  },
];

export const JOKER_MAP: Record<string, JokerDef> = Object.fromEntries(
  JOKERS.map((j) => [j.key, j])
);

export const JOKER_HOOKS: Record<string, JokerHookFn> = {
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

  j_lusty_joker(ctx) {
    if (ctx.stage === 'individual_play' && ctx.card && !ctx.card.debuffed && ctx.isSuit(ctx.card, 'Hearts')) {
      return {
        mult: 3,
        message: '+3 Mult',
        color: PALETTE.MULT,
        sound: 'multhit1',
      };
    }
    return null;
  },

  j_jolly(ctx) {
    if (ctx.stage === 'joker_main' && ctx.handEval?.containedHands.includes('Pair')) {
      return {
        mult: 8,
        message: '+8 Mult',
        color: PALETTE.MULT,
        sound: 'multhit1',
      };
    }
    return null;
  },

  j_blueprint(ctx) {
    return evaluateCopyJoker(ctx, ctx.jokerIndex + 1);
  },

  j_brainstorm(ctx) {
    if (ctx.jokerIndex === 0) return null;
    return evaluateCopyJoker(ctx, 0);
  },

  j_baron(ctx) {
    if (
      ctx.stage === 'individual_hand' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.card.enhancement !== 'm_stone' &&
      ctx.card.rank === 'King'
    ) {
      return {
        xMult: 1.5,
        message: 'X1.5 Mult',
        color: PALETTE.MULT,
        sound: 'multhit2',
      };
    }
    return null;
  },

  j_mime(ctx) {
    if (ctx.stage === 'repetition_hand' && ctx.card && !ctx.card.debuffed) {
      return {
        repetitions: 1,
        message: 'Again!',
        color: PALETTE.ORANGE,
      };
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

  j_photograph(ctx) {
    if (ctx.stage === 'individual_play' && ctx.card && !ctx.card.debuffed && ctx.scoringHand) {
      const firstFace = ctx.scoringHand.find((c) => ctx.isFace(c));
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

  j_vampire(ctx) {
    if (ctx.stage === 'before' && !ctx.isBlueprint && ctx.scoringHand) {
      const enhanced = ctx.scoringHand.filter(
        (c) => !c.debuffed && c.enhancement !== 'none'
      );
      if (enhanced.length > 0) {
        for (const c of enhanced) {
          c.enhancement = 'none';
          const deckCard = ctx.state.fullDeck.find((dc) => dc.id === c.id);
          if (deckCard) deckCard.enhancement = 'none';
        }
        const cur = getStateNum(ctx.joker.state, ['xMult', 'Xmult'], 1);
        const next = round2(cur + 0.1 * enhanced.length);
        ctx.joker.state.xMult = next;
        return {
          message: `X${formatNum(next)} Mult`,
          color: PALETTE.MULT,
          sound: 'tarot1',
          setCardEnhancement: { cardId: enhanced[0].id, enhancement: 'none' },
        };
      }
    }
    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['xMult', 'Xmult'], 1);
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

  j_dna(ctx) {
    if (
      ctx.stage === 'before' &&
      ctx.fullHand &&
      ctx.fullHand.length === 1 &&
      isFirstHandOfRound(ctx)
    ) {
      return {
        cloneCardId: ctx.fullHand[0].id,
        message: 'Copied!',
        color: PALETTE.BLUE,
        sound: 'card1',
      };
    }
    return null;
  },

  j_space(ctx) {
    if (ctx.stage === 'before' && ctx.handEval) {
      if (ctx.rand('space') < ctx.probMultiplier / 4) {
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

  j_ride_the_bus(ctx) {
    if (ctx.stage === 'before' && !ctx.isBlueprint && ctx.scoringHand) {
      const hasScoringFace = ctx.scoringHand.some((c) => ctx.isFace(c));
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

  // Rule-modifier jokers (active passively in poker evaluator & card helpers)
  j_splash() {
    return null;
  },

  j_four_fingers() {
    return null;
  },

  j_shortcut() {
    return null;
  },

  j_pareidolia() {
    return null;
  },

  j_stuntman(ctx) {
    if (ctx.stage === 'joker_main') {
      return {
        chips: 250,
        message: '+250 Chips',
        color: PALETTE.CHIPS,
        sound: 'chips1',
      };
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

  j_constellation(ctx) {
    if (
      ctx.stage === 'using_consumeable' &&
      !ctx.isBlueprint &&
      ctx.consumable?.set === 'Planet'
    ) {
      const cur = getStateNum(ctx.joker.state, ['xMult', 'Xmult'], 1);
      const next = round2(cur + 0.1);
      ctx.joker.state.xMult = next;
      return {
        message: `X${formatNum(next)} Mult`,
        color: PALETTE.MULT,
        sound: 'tarot1',
      };
    }
    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['xMult', 'Xmult'], 1);
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

  j_hologram(ctx) {
    if (ctx.stage === 'card_added' && !ctx.isBlueprint) {
      const cur = getStateNum(ctx.joker.state, ['xMult', 'Xmult'], 1);
      const next = round2(cur + 0.25);
      ctx.joker.state.xMult = next;
      return {
        message: `X${formatNum(next)} Mult`,
        color: PALETTE.MULT,
        sound: 'tarot1',
      };
    }
    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['xMult', 'Xmult'], 1);
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
};
