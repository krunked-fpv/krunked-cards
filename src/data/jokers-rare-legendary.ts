import {
  PALETTE,
  type JokerDef,
  type JokerEvalContext,
  type JokerHookFn,
  type JokerInstance,
  type PokerHandId,
  type SimState,
} from '../contracts/index.ts';

// ============================================================================
// Pure Helpers (Zero DOM / Zero Circular Data Dependencies)
// ============================================================================

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
  for (let i = 0; i < keys.length; i++) {
    const v = state[keys[i]];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return fallback;
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

function hasConsumableRoom(state: SimState): boolean {
  let neg = 0;
  for (let i = 0; i < state.consumables.length; i++) {
    if (state.consumables[i].edition === 'e_negative') neg++;
  }
  return state.consumables.length < Math.max(0, state.consumableSlots + neg);
}

/**
 * Scoring engine probes `end_of_round` hooks during a losing PLAYING hand to check
 * for Mr. Bones rescue before transitioning to GAME_OVER or FINISH_SCORING.
 * Regular end-of-round counters/resets must skip that probe so they only fire once
 * when a round actually finishes.
 */
function isMrBonesRescueProbe(state: SimState): boolean {
  return (
    state.phase === 'PLAYING' &&
    state.handsLeft <= 0 &&
    state.targetChips > 0 &&
    state.roundChips < state.targetChips
  );
}

/** Complete 64-key set of Uncommon (rarity === 2) Jokers for Baseball Card. */
const UNCOMMON_JOKER_KEYS: ReadonlySet<string> = new Set([
  'j_stencil',
  'j_four_fingers',
  'j_mime',
  'j_ceremonial',
  'j_marble',
  'j_loyalty_card',
  'j_dusk',
  'j_fibonacci',
  'j_steel_joker',
  'j_hack',
  'j_pareidolia',
  'j_space',
  'j_burglar',
  'j_blackboard',
  'j_sixth_sense',
  'j_constellation',
  'j_hiker',
  'j_card_sharp',
  'j_madness',
  'j_seance',
  'j_vampire',
  'j_shortcut',
  'j_hologram',
  'j_cloud_9',
  'j_rocket',
  'j_midas_mask',
  'j_luchador',
  'j_gift',
  'j_turtle_bean',
  'j_erosion',
  'j_to_the_moon',
  'j_stone',
  'j_lucky_cat',
  'j_bull',
  'j_diet_cola',
  'j_trading',
  'j_flash',
  'j_trousers',
  'j_ramen',
  'j_selzer',
  'j_castle',
  'j_mr_bones',
  'j_acrobat',
  'j_sock_and_buskin',
  'j_troubadour',
  'j_certificate',
  'j_smeared',
  'j_throwback',
  'j_rough_gem',
  'j_bloodstone',
  'j_arrowhead',
  'j_onyx_agate',
  'j_glass',
  'j_ring_master',
  'j_flower_pot',
  'j_merry_andy',
  'j_oops',
  'j_idol',
  'j_seeing_double',
  'j_matador',
  'j_satellite',
  'j_cartomancer',
  'j_astronomer',
  'j_bootstraps',
]);

/** Complete 29-key set of blueprint-incompatible Jokers for copycat tooltip status. */
const NON_BLUEPRINT_COMPAT_KEYS: ReadonlySet<string> = new Set([
  'j_four_fingers',
  'j_credit_card',
  'j_chaos',
  'j_delayed_grat',
  'j_pareidolia',
  'j_egg',
  'j_splash',
  'j_sixth_sense',
  'j_shortcut',
  'j_cloud_9',
  'j_rocket',
  'j_midas_mask',
  'j_gift',
  'j_turtle_bean',
  'j_to_the_moon',
  'j_juggler',
  'j_drunkard',
  'j_golden',
  'j_trading',
  'j_mr_bones',
  'j_troubadour',
  'j_smeared',
  'j_ring_master',
  'j_merry_andy',
  'j_oops',
  'j_invisible',
  'j_satellite',
  'j_astronomer',
  'j_chicot',
]);

function resolveCopyTargetForTooltip(
  state: SimState,
  selfIndex: number,
  startIndex: number
): JokerInstance | null {
  const visited = new Set<number>([selfIndex]);
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
    if (NON_BLUEPRINT_COMPAT_KEYS.has(cur.key)) return null;
    return cur;
  }
  return null;
}

function makeHandTypeXMultHook(handType: PokerHandId, defaultXMult: number): JokerHookFn {
  return (ctx) => {
    if (ctx.stage === 'joker_main' && ctx.handEval?.containedHands.includes(handType)) {
      const xMult = getStateNum(ctx.joker.state, ['Xmult', 'xMult'], defaultXMult);
      return {
        xMult,
        message: `X${formatNum(xMult)} Mult`,
        color: PALETTE.MULT,
        sound: 'multhit2',
      };
    }
    return null;
  };
}

// ============================================================================
// ALL 20 Rare (rarity === 3) + ALL 5 Legendary (rarity === 4) Jokers
// Sorted strictly by `order`
// ============================================================================

export const RARE_LEGENDARY_JOKERS: JokerDef[] = [
  // ---- RARE (20) ----
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
    key: 'j_vagabond',
    name: 'Vagabond',
    order: 71,
    rarity: 3,
    cost: 8,
    pos: { x: 5, y: 12 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 4 },
    descTemplate: 'Create a Tarot card if hand is played with $4 or less',
    formatDesc: (inst) => {
      const cap = getStateNum(inst.state, ['extra'], 4);
      return `Create a Tarot card if hand is played with $${cap} or less`;
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
    formatDesc: (inst) => {
      const xMult = getStateNum(inst.state, ['extra'], 1.5);
      return `Each King held in hand gives X${formatNum(xMult)} Mult`;
    },
  },
  {
    key: 'j_obelisk',
    name: 'Obelisk',
    order: 75,
    rarity: 3,
    cost: 8,
    pos: { x: 9, y: 12 },
    blueprintCompat: true,
    perishableCompat: false,
    eternalCompat: true,
    config: { extra: 0.2, Xmult: 1 },
    descTemplate:
      'This Joker gains X0.2 Mult per consecutive hand played without playing your most played poker hand (Currently X1 Mult)',
    formatDesc: (inst) => {
      const step = getStateNum(inst.state, ['extra'], 0.2);
      const xMult = getStateNum(inst.state, ['xMult', 'Xmult', 'x_mult'], 1);
      return `This Joker gains X${formatNum(step)} Mult per consecutive hand played without playing your most played poker hand (Currently X${formatNum(xMult)} Mult)`;
    },
  },
  {
    key: 'j_baseball',
    name: 'Baseball Card',
    order: 92,
    rarity: 3,
    cost: 8,
    pos: { x: 6, y: 14 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 1.5 },
    descTemplate: 'Uncommon Jokers each give X1.5 Mult',
    formatDesc: (inst) => {
      const xMult = getStateNum(inst.state, ['extra'], 1.5);
      return `Uncommon Jokers each give X${formatNum(xMult)} Mult`;
    },
  },
  {
    key: 'j_ancient',
    name: 'Ancient Joker',
    order: 99,
    rarity: 3,
    cost: 8,
    pos: { x: 7, y: 15 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 1.5 },
    descTemplate:
      'Each played card with Hearts suit gives X1.5 Mult when scored, suit changes at end of round',
    formatDesc: (inst, state) => {
      const xMult = getStateNum(inst.state, ['extra'], 1.5);
      return `Each played card with ${state.tracking.ancientSuit} suit gives X${formatNum(xMult)} Mult when scored, suit changes at end of round`;
    },
  },
  {
    key: 'j_campfire',
    name: 'Campfire',
    order: 105,
    rarity: 3,
    cost: 9,
    pos: { x: 5, y: 15 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 0.25 },
    descTemplate:
      'This Joker gains X0.25 Mult for each card sold, resets when Boss Blind is defeated (Currently X1 Mult)',
    formatDesc: (inst) => {
      const step = getStateNum(inst.state, ['extra'], 0.25);
      const xMult = getStateNum(inst.state, ['xMult', 'Xmult', 'x_mult'], 1);
      return `This Joker gains X${formatNum(step)} Mult for each card sold, resets when Boss Blind is defeated (Currently X${formatNum(xMult)} Mult)`;
    },
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
      const target = resolveCopyTargetForTooltip(state, idx, idx + 1);
      return `Copies ability of Joker to the right (${target ? 'compatible' : 'incompatible'})`;
    },
  },
  {
    key: 'j_wee',
    name: 'Wee Joker',
    order: 124,
    rarity: 3,
    cost: 8,
    pos: { x: 0, y: 0 },
    blueprintCompat: true,
    perishableCompat: false,
    eternalCompat: true,
    config: { chips: 0, chip_mod: 8 },
    descTemplate:
      'This Joker gains +8 Chips when each played 2 is scored (Currently +0 Chips)',
    formatDesc: (inst) => {
      const chips = getStateNum(inst.state, ['chips'], 0);
      const mod = getStateNum(inst.state, ['chip_mod'], 8);
      return `This Joker gains +${mod} Chips when each played 2 is scored (Currently +${chips} Chips)`;
    },
  },
  {
    key: 'j_hit_the_road',
    name: 'Hit the Road',
    order: 130,
    rarity: 3,
    cost: 8,
    pos: { x: 8, y: 5 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 0.5 },
    descTemplate:
      'This Joker gains X0.5 Mult for every Jack discarded this round (Currently X1 Mult)',
    formatDesc: (inst) => {
      const step = getStateNum(inst.state, ['extra'], 0.5);
      const xMult = getStateNum(inst.state, ['xMult', 'Xmult', 'x_mult'], 1);
      return `This Joker gains X${formatNum(step)} Mult for every Jack discarded this round (Currently X${formatNum(xMult)} Mult)`;
    },
  },
  {
    key: 'j_duo',
    name: 'The Duo',
    order: 131,
    rarity: 3,
    cost: 8,
    pos: { x: 5, y: 4 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { Xmult: 2, type: 'Pair' },
    descTemplate: 'X2 Mult if played hand contains a Pair',
    formatDesc: (inst) => {
      const xMult = getStateNum(inst.state, ['Xmult', 'xMult'], 2);
      return `X${formatNum(xMult)} Mult if played hand contains a Pair`;
    },
  },
  {
    key: 'j_trio',
    name: 'The Trio',
    order: 132,
    rarity: 3,
    cost: 8,
    pos: { x: 6, y: 4 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { Xmult: 3, type: 'Three of a Kind' },
    descTemplate: 'X3 Mult if played hand contains a Three of a Kind',
    formatDesc: (inst) => {
      const xMult = getStateNum(inst.state, ['Xmult', 'xMult'], 3);
      return `X${formatNum(xMult)} Mult if played hand contains a Three of a Kind`;
    },
  },
  {
    key: 'j_family',
    name: 'The Family',
    order: 133,
    rarity: 3,
    cost: 8,
    pos: { x: 7, y: 4 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { Xmult: 4, type: 'Four of a Kind' },
    descTemplate: 'X4 Mult if played hand contains a Four of a Kind',
    formatDesc: (inst) => {
      const xMult = getStateNum(inst.state, ['Xmult', 'xMult'], 4);
      return `X${formatNum(xMult)} Mult if played hand contains a Four of a Kind`;
    },
  },
  {
    key: 'j_order',
    name: 'The Order',
    order: 134,
    rarity: 3,
    cost: 8,
    pos: { x: 8, y: 4 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { Xmult: 3, type: 'Straight' },
    descTemplate: 'X3 Mult if played hand contains a Straight',
    formatDesc: (inst) => {
      const xMult = getStateNum(inst.state, ['Xmult', 'xMult'], 3);
      return `X${formatNum(xMult)} Mult if played hand contains a Straight`;
    },
  },
  {
    key: 'j_tribe',
    name: 'The Tribe',
    order: 135,
    rarity: 3,
    cost: 8,
    pos: { x: 9, y: 4 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { Xmult: 2, type: 'Flush' },
    descTemplate: 'X2 Mult if played hand contains a Flush',
    formatDesc: (inst) => {
      const xMult = getStateNum(inst.state, ['Xmult', 'xMult'], 2);
      return `X${formatNum(xMult)} Mult if played hand contains a Flush`;
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
    formatDesc: (inst) => {
      const chips = getStateNum(inst.state, ['chip_mod'], 250);
      const hSize = getStateNum(inst.state, ['h_size'], 2);
      return `+${chips} Chips, -${hSize} hand size`;
    },
  },
  {
    key: 'j_invisible',
    name: 'Invisible Joker',
    order: 137,
    rarity: 3,
    cost: 8,
    pos: { x: 1, y: 7 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: false,
    config: { extra: 2 },
    descTemplate:
      'After 2 rounds, sell this card to Duplicate a random Joker (Currently 0/2)',
    formatDesc: (inst) => {
      const target = getStateNum(inst.state, ['extra'], 2);
      const cur = Math.min(target, getStateNum(inst.state, ['invis_rounds'], 0));
      return `After ${target} rounds, sell this card to Duplicate a random Joker (Currently ${cur}/${target})`;
    },
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
      if (idx < 0) return 'Copies the ability of leftmost Joker';
      if (idx === 0) return 'Copies the ability of leftmost Joker (incompatible)';
      const target = resolveCopyTargetForTooltip(state, idx, 0);
      return `Copies the ability of leftmost Joker (${target ? 'compatible' : 'incompatible'})`;
    },
  },
  {
    key: 'j_drivers_license',
    name: "Driver's License",
    order: 141,
    rarity: 3,
    cost: 7,
    pos: { x: 0, y: 7 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 3 },
    descTemplate:
      'X3 Mult if you have at least 16 Enhanced cards in your full deck (Currently 0)',
    formatDesc: (inst, state) => {
      const xMult = getStateNum(inst.state, ['extra'], 3);
      let enhancedCount = 0;
      for (let i = 0; i < state.fullDeck.length; i++) {
        if (state.fullDeck[i].enhancement !== 'none') enhancedCount++;
      }
      return `X${formatNum(xMult)} Mult if you have at least 16 Enhanced cards in your full deck (Currently ${enhancedCount})`;
    },
  },
  {
    key: 'j_burnt',
    name: 'Burnt Joker',
    order: 144,
    rarity: 3,
    cost: 8,
    pos: { x: 3, y: 7 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { h_size: 0, extra: 4 },
    descTemplate: 'Upgrade the level of the first discarded poker hand each round',
    formatDesc: () => 'Upgrade the level of the first discarded poker hand each round',
  },

  // ---- LEGENDARY (5) ----
  {
    key: 'j_caino',
    name: 'Canio',
    order: 146,
    rarity: 4,
    cost: 20,
    pos: { x: 3, y: 8 },
    soulPos: { x: 3, y: 9 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 1 },
    descTemplate:
      'This Joker gains X1 Mult when a face card is destroyed (Currently X1 Mult)',
    formatDesc: (inst) => {
      const step = getStateNum(inst.state, ['extra'], 1);
      const xMult = getStateNum(inst.state, ['xMult', 'Xmult', 'x_mult'], 1);
      return `This Joker gains X${formatNum(step)} Mult when a face card is destroyed (Currently X${formatNum(xMult)} Mult)`;
    },
  },
  {
    key: 'j_triboulet',
    name: 'Triboulet',
    order: 147,
    rarity: 4,
    cost: 20,
    pos: { x: 4, y: 8 },
    soulPos: { x: 4, y: 9 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { extra: 2 },
    descTemplate: 'Played Kings and Queens each give X2 Mult when scored',
    formatDesc: (inst) => {
      const xMult = getStateNum(inst.state, ['extra'], 2);
      return `Played Kings and Queens each give X${formatNum(xMult)} Mult when scored`;
    },
  },
  {
    key: 'j_yorick',
    name: 'Yorick',
    order: 148,
    rarity: 4,
    cost: 20,
    pos: { x: 5, y: 8 },
    soulPos: { x: 5, y: 9 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: { xmult: 1, discards: 23 },
    descTemplate:
      'This Joker gains X1 Mult every 23 [23] cards discarded (Currently X1 Mult)',
    formatDesc: (inst) => {
      const step = getStateNum(inst.state, ['xmult'], 1);
      const threshold = getStateNum(inst.state, ['discards'], 23);
      const remaining = getStateNum(inst.state, ['yorick_discards'], threshold);
      const xMult = getStateNum(inst.state, ['xMult', 'Xmult', 'x_mult'], 1);
      return `This Joker gains X${formatNum(step)} Mult every ${threshold} [${remaining}] cards discarded (Currently X${formatNum(xMult)} Mult)`;
    },
  },
  {
    key: 'j_chicot',
    name: 'Chicot',
    order: 149,
    rarity: 4,
    cost: 20,
    pos: { x: 6, y: 8 },
    soulPos: { x: 6, y: 9 },
    blueprintCompat: false,
    perishableCompat: true,
    eternalCompat: true,
    config: {},
    descTemplate: 'Disables effect of every Boss Blind',
    formatDesc: () => 'Disables effect of every Boss Blind',
  },
  {
    key: 'j_perkeo',
    name: 'Perkeo',
    order: 150,
    rarity: 4,
    cost: 20,
    pos: { x: 7, y: 8 },
    soulPos: { x: 7, y: 9 },
    blueprintCompat: true,
    perishableCompat: true,
    eternalCompat: true,
    config: {},
    descTemplate:
      'Creates a Negative copy of 1 random consumable card in your possession at the end of the shop',
    formatDesc: () =>
      'Creates a Negative copy of 1 random consumable card in your possession at the end of the shop',
  },
];

// ============================================================================
// ALL 25 Rare & Legendary Joker Runtime Hooks (Zero Stubs)
// ============================================================================

export const RARE_LEGENDARY_JOKER_HOOKS: Record<string, JokerHookFn> = {
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

  j_vagabond(ctx) {
    if (ctx.stage === 'joker_main') {
      const cap = getStateNum(ctx.joker.state, ['extra'], 4);
      if (ctx.state.dollars <= cap && hasConsumableRoom(ctx.state)) {
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

  j_baron(ctx) {
    if (
      ctx.stage === 'individual_hand' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.card.enhancement !== 'm_stone' &&
      ctx.card.rank === 'King'
    ) {
      const xMult = getStateNum(ctx.joker.state, ['extra'], 1.5);
      return {
        xMult,
        message: `X${formatNum(xMult)} Mult`,
        color: PALETTE.MULT,
        sound: 'multhit2',
      };
    }
    return null;
  },

  j_obelisk(ctx) {
    if (ctx.stage === 'before' && !ctx.isBlueprint && ctx.handEval) {
      const playedId = ctx.handEval.handId;
      const currentPlayed = ctx.state.handLevels[playedId]?.played ?? 0;
      // scoring.ts increments handLevels[playedId].played by 1 before Step 2 (`before`).
      // Before this hand, playedId had (currentPlayed - 1) plays, so it was NOT tied for
      // most played iff some other visible poker hand has played >= Math.max(1, currentPlayed).
      const threshold = Math.max(1, currentPlayed);
      let isMostPlayedOrTied = true;
      const entries = Object.values(ctx.state.handLevels);
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (entry && entry.id !== playedId && entry.visible && entry.played >= threshold) {
          isMostPlayedOrTied = false;
          break;
        }
      }

      const cur = getStateNum(ctx.joker.state, ['xMult', 'Xmult', 'x_mult'], 1);
      if (isMostPlayedOrTied) {
        ctx.joker.state.xMult = 1;
        ctx.joker.state.Xmult = 1;
        if (cur > 1) {
          return {
            message: 'Reset!',
            color: PALETTE.RED,
          };
        }
        return null;
      }

      const step = getStateNum(ctx.joker.state, ['extra'], 0.2);
      const next = round2(cur + step);
      ctx.joker.state.xMult = next;
      ctx.joker.state.Xmult = next;
      return {
        message: `X${formatNum(next)} Mult`,
        color: PALETTE.MULT,
      };
    }

    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['xMult', 'Xmult', 'x_mult'], 1);
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

  j_baseball(ctx) {
    if (ctx.stage === 'joker_main') {
      let uncommonCount = 0;
      for (let i = 0; i < ctx.state.jokers.length; i++) {
        const j = ctx.state.jokers[i];
        if (!j.debuffed && UNCOMMON_JOKER_KEYS.has(j.key)) {
          uncommonCount++;
        }
      }
      if (uncommonCount > 0) {
        const factor = getStateNum(ctx.joker.state, ['extra'], 1.5);
        const totalXMult = Math.pow(factor, uncommonCount);
        return {
          xMult: totalXMult,
          message:
            uncommonCount === 1
              ? `X${formatNum(factor)} Mult`
              : `X${Number(totalXMult.toFixed(4))} Mult`,
          color: PALETTE.MULT,
          sound: 'multhit2',
        };
      }
    }
    return null;
  },

  j_ancient(ctx) {
    if (
      ctx.stage === 'individual_play' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.isSuit(ctx.card, ctx.state.tracking.ancientSuit)
    ) {
      const xMult = getStateNum(ctx.joker.state, ['extra'], 1.5);
      return {
        xMult,
        message: `X${formatNum(xMult)} Mult`,
        color: PALETTE.MULT,
        sound: 'multhit2',
      };
    }
    return null;
  },

  j_campfire(ctx) {
    if (ctx.stage === 'selling_card' && !ctx.isBlueprint) {
      const step = getStateNum(ctx.joker.state, ['extra'], 0.25);
      const cur = getStateNum(ctx.joker.state, ['xMult', 'Xmult', 'x_mult'], 1);
      const next = round2(cur + step);
      ctx.joker.state.xMult = next;
      ctx.joker.state.Xmult = next;
      return {
        message: `X${formatNum(next)} Mult`,
        color: PALETTE.MULT,
        sound: 'tarot1',
      };
    }

    if (
      ctx.stage === 'end_of_round' &&
      !ctx.isBlueprint &&
      !isMrBonesRescueProbe(ctx.state) &&
      ctx.state.activeBlindSlot === 'Boss'
    ) {
      const cur = getStateNum(ctx.joker.state, ['xMult', 'Xmult', 'x_mult'], 1);
      ctx.joker.state.xMult = 1;
      ctx.joker.state.Xmult = 1;
      if (cur > 1) {
        return {
          message: 'Reset!',
          color: PALETTE.RED,
        };
      }
      return null;
    }

    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['xMult', 'Xmult', 'x_mult'], 1);
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

  // Passive copycat: cycle-safely resolved by sim engine (resolveCopiedJoker)
  j_blueprint() {
    return null;
  },

  j_wee(ctx) {
    if (
      ctx.stage === 'individual_play' &&
      !ctx.isBlueprint &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.card.enhancement !== 'm_stone' &&
      ctx.card.rank === '2'
    ) {
      const mod = getStateNum(ctx.joker.state, ['chip_mod'], 8);
      const cur = getStateNum(ctx.joker.state, ['chips'], 0);
      const next = cur + mod;
      ctx.joker.state.chips = next;
      return {
        message: 'Upgrade!',
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

  j_hit_the_road(ctx) {
    if (
      ctx.stage === 'discard' &&
      !ctx.isBlueprint &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.card.enhancement !== 'm_stone' &&
      ctx.card.rank === 'Jack'
    ) {
      const step = getStateNum(ctx.joker.state, ['extra'], 0.5);
      const cur = getStateNum(ctx.joker.state, ['xMult', 'Xmult', 'x_mult'], 1);
      const next = round2(cur + step);
      ctx.joker.state.xMult = next;
      ctx.joker.state.Xmult = next;
      return {
        message: `X${formatNum(next)} Mult`,
        color: PALETTE.MULT,
        sound: 'tarot1',
      };
    }

    if (ctx.stage === 'end_of_round' && !ctx.isBlueprint && !isMrBonesRescueProbe(ctx.state)) {
      const cur = getStateNum(ctx.joker.state, ['xMult', 'Xmult', 'x_mult'], 1);
      ctx.joker.state.xMult = 1;
      ctx.joker.state.Xmult = 1;
      if (cur > 1) {
        return {
          message: 'Reset!',
          color: PALETTE.RED,
        };
      }
      return null;
    }

    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['xMult', 'Xmult', 'x_mult'], 1);
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

  j_duo: makeHandTypeXMultHook('Pair', 2),
  j_trio: makeHandTypeXMultHook('Three of a Kind', 3),
  j_family: makeHandTypeXMultHook('Four of a Kind', 4),
  j_order: makeHandTypeXMultHook('Straight', 3),
  j_tribe: makeHandTypeXMultHook('Flush', 2),

  j_stuntman(ctx) {
    if (ctx.stage === 'joker_main') {
      const chips = getStateNum(ctx.joker.state, ['chip_mod'], 250);
      return {
        chips,
        message: `+${chips} Chips`,
        color: PALETTE.CHIPS,
        sound: 'chips1',
      };
    }
    return null;
  },

  // Sell duplication is engine-owned on SELL_JOKER when state.invis_rounds >= 2;
  // this hook tracks the round counter cleanly on end_of_round with zero double-triggers.
  j_invisible(ctx) {
    if (ctx.stage === 'end_of_round' && !ctx.isBlueprint && !isMrBonesRescueProbe(ctx.state)) {
      const target = getStateNum(ctx.joker.state, ['extra'], 2);
      const cur = getStateNum(ctx.joker.state, ['invis_rounds'], 0);
      const next = cur + 1;
      ctx.joker.state.invis_rounds = next;
      return {
        message: next >= target ? 'Active!' : `${next}/${target}`,
        color: next >= target ? PALETTE.GREEN : PALETTE.ORANGE,
      };
    }
    return null;
  },

  // Passive copycat: cycle-safely resolved by sim engine (resolveCopiedJoker)
  j_brainstorm() {
    return null;
  },

  j_drivers_license(ctx) {
    if (ctx.stage === 'joker_main') {
      let enhancedCount = 0;
      for (let i = 0; i < ctx.state.fullDeck.length; i++) {
        if (ctx.state.fullDeck[i].enhancement !== 'none') enhancedCount++;
      }
      if (enhancedCount >= 16) {
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

  // Engine-owned on first DISCARD_HAND of round (prevents double-leveling with engine).
  j_burnt() {
    return null;
  },

  j_caino(ctx) {
    if (ctx.stage === 'cards_destroyed' && !ctx.isBlueprint) {
      const removed = ctx.removedCards ?? (ctx.card ? [ctx.card] : []);
      let faceCount = 0;
      for (let i = 0; i < removed.length; i++) {
        if (ctx.isFace(removed[i])) faceCount++;
      }
      if (faceCount > 0) {
        const step = getStateNum(ctx.joker.state, ['extra'], 1);
        const cur = getStateNum(ctx.joker.state, ['xMult', 'Xmult', 'x_mult'], 1);
        const next = round2(cur + step * faceCount);
        ctx.joker.state.xMult = next;
        ctx.joker.state.Xmult = next;
        return {
          message: `X${formatNum(next)} Mult`,
          color: PALETTE.MULT,
          sound: 'tarot1',
        };
      }
    }

    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['xMult', 'Xmult', 'x_mult'], 1);
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

  j_triboulet(ctx) {
    if (
      ctx.stage === 'individual_play' &&
      ctx.card &&
      !ctx.card.debuffed &&
      ctx.card.enhancement !== 'm_stone' &&
      (ctx.card.rank === 'King' || ctx.card.rank === 'Queen')
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

  j_yorick(ctx) {
    if (ctx.stage === 'discard' && !ctx.isBlueprint) {
      const threshold = Math.max(1, Math.floor(getStateNum(ctx.joker.state, ['discards'], 23)));
      const step = getStateNum(ctx.joker.state, ['xmult'], 1);
      const count = ctx.card ? 1 : (ctx.fullHand?.length ?? 1);
      if (count <= 0) return null;

      let remaining = getStateNum(ctx.joker.state, ['yorick_discards'], threshold);
      let cur = getStateNum(ctx.joker.state, ['xMult', 'Xmult', 'x_mult'], 1);
      let upgraded = false;

      remaining -= count;
      while (remaining <= 0) {
        remaining += threshold;
        cur = round2(cur + step);
        upgraded = true;
      }

      ctx.joker.state.yorick_discards = remaining;
      ctx.joker.state.xMult = cur;
      ctx.joker.state.Xmult = cur;

      if (upgraded) {
        return {
          message: `X${formatNum(cur)} Mult`,
          color: PALETTE.MULT,
          sound: 'tarot1',
        };
      }
      return null;
    }

    if (ctx.stage === 'joker_main') {
      const cur = getStateNum(ctx.joker.state, ['xMult', 'Xmult', 'x_mult'], 1);
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

  j_chicot(ctx) {
    if (
      ctx.stage === 'setting_blind' &&
      !ctx.isBlueprint &&
      ctx.state.activeBlindSlot === 'Boss'
    ) {
      return {
        disableBoss: true,
        message: 'Boss Disabled!',
        color: PALETTE.PURPLE,
        sound: 'timpani',
      };
    }
    return null;
  },

  // Engine-owned on SHOP_NEXT_ROUND (creates a Negative copy of 1 random held consumable).
  j_perkeo() {
    return null;
  },
};
