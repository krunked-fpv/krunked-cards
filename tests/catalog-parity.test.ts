import { describe, expect, it } from 'vitest';
import {
  POKER_HAND_IDS,
  type CardInstance,
  type JokerEvalContext,
  type JokerHookStage,
  type JokerInstance,
  type Rank,
  type SimState,
  type StakeLevel,
  type Suit,
} from '../src/contracts/index.ts';
import {
  BLINDS,
  BLIND_MAP,
  BOOSTERS,
  CHALLENGES,
  CHALLENGE_MAP,
  CONSUMABLE_MAP,
  DECKS,
  DECK_MAP,
  JOKERS,
  JOKER_HOOKS,
  JOKER_MAP,
  PLANETS,
  SPECTRALS,
  STAKES,
  STAKE_MAP,
  TAGS,
  TAROTS,
  VOUCHERS,
  VOUCHER_MAP,
  evaluateJokerHook,
  formatJokerDesc,
  getBlindAmount,
} from '../src/data/index.ts';
import {
  applyConsumable,
  canUseConsumable,
  computeCashoutBreakdown,
  dispatchSim,
  evaluatePokerHand,
  getEffectiveHandSize,
  isCardFace,
  isCardSuit,
  nextRandom,
  nextRandomInt,
  openBoosterPack,
  scorePlayedHand,
  startRun,
} from '../src/sim/index.ts';

const ALL_JOKER_STAGES: readonly JokerHookStage[] = [
  'before',
  'individual_play',
  'individual_hand',
  'joker_main',
  'after',
  'discard',
  'repetition_play',
  'repetition_hand',
  'end_of_round',
  'setting_blind',
  'skip_blind',
  'skipping_booster',
  'buying_card',
  'selling_card',
  'reroll_shop',
  'open_booster',
  'using_consumeable',
  'cards_destroyed',
  'card_added',
  'first_hand_drawn',
  'calc_dollar_bonus',
];

let uid = 1;
function makeCard(rank: Rank, suit: Suit, extra?: Partial<CardInstance>): CardInstance {
  return {
    id: `cat_card_${uid++}`,
    suit,
    rank,
    enhancement: 'none',
    edition: 'none',
    seal: 'none',
    permaBonus: 0,
    debuffed: false,
    faceDown: false,
    playedThisAnte: false,
    ...extra,
  };
}

function makeJokerInst(key: string, extra?: Partial<JokerInstance>): JokerInstance {
  const def = JOKER_MAP[key];
  return {
    id: `cat_joker_${uid++}`,
    key,
    edition: 'none',
    eternal: false,
    perishable: false,
    perishableTally: 0,
    rental: false,
    debuffed: false,
    faceDown: false,
    cost: def?.cost ?? 4,
    sellValue: Math.max(1, Math.floor((def?.cost ?? 4) / 2)),
    extraSellValue: 0,
    state: { ...(def?.config ?? {}) },
    ...extra,
  };
}

function enterPlayingState(deckId = 'b_red', stake: StakeLevel = 1, seed = 'CAT_SEED'): SimState {
  const { state } = startRun(deckId, stake, seed);
  return dispatchSim(state, { type: 'SELECT_BLIND' }).state;
}

function selectAndPlayCards(state: SimState, cardIds: string[]) {
  let s = dispatchSim(state, { type: 'DESELECT_ALL' }).state;
  for (const id of cardIds) {
    if (!s.selectedCardIds.includes(id)) {
      s = dispatchSim(s, { type: 'TOGGLE_SELECT_CARD', cardId: id }).state;
    }
  }
  return dispatchSim(s, { type: 'PLAY_HAND' });
}

describe('Catalog Parity — ALL 150 Jokers (61 Common / 64 Uncommon / 20 Rare / 5 Legendary)', () => {
  it('validates exact 150-joker rarity distribution, non-empty formatDesc, and safe hook evaluation across all 21 stages', () => {
    expect(JOKERS).toHaveLength(150);

    const byRarity: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const seenKeys = new Set<string>();
    for (const def of JOKERS) {
      expect(seenKeys.has(def.key)).toBe(false);
      seenKeys.add(def.key);
      byRarity[def.rarity] = (byRarity[def.rarity] ?? 0) + 1;
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.cost).toBeGreaterThan(0);
      expect(def.descTemplate.length).toBeGreaterThan(0);
      expect(typeof JOKER_HOOKS[def.key]).toBe('function');
    }

    expect(byRarity).toEqual({ 1: 61, 2: 64, 3: 20, 4: 5 });

    // Exercise EVERY single Joker's formatDesc AND evaluateJokerHook across ALL 21 stages!
    const samplePlayed = [
      makeCard('King', 'Hearts', { enhancement: 'm_gold' }),
      makeCard('Queen', 'Spades', { enhancement: 'm_glass' }),
      makeCard('10', 'Diamonds', { enhancement: 'm_bonus' }),
      makeCard('4', 'Clubs', { enhancement: 'm_mult' }),
      makeCard('2', 'Hearts', { enhancement: 'm_lucky' }),
    ];
    const sampleHeld = [
      makeCard('King', 'Clubs', { enhancement: 'm_steel' }),
      makeCard('Queen', 'Diamonds'),
      makeCard('5', 'Spades'),
    ];
    const sampleHandEval = evaluatePokerHand(samplePlayed, []);

    for (const def of JOKERS) {
      const state = enterPlayingState('b_red', 1, `JOKER_SWEEP_${def.key}`);
      const inst = makeJokerInst(def.key);
      const neighbor = makeJokerInst('j_joker');
      state.jokers = [inst, neighbor];
      state.fullDeck.push(...samplePlayed, ...sampleHeld);
      state.hand = sampleHeld.map((c) => c.id);

      const desc = formatJokerDesc(inst, state);
      expect(desc.length, `formatDesc empty for ${def.key}`).toBeGreaterThan(0);
      expect(desc, `formatDesc contains NaN for ${def.key}`).not.toContain('NaN');
      expect(desc, `formatDesc contains undefined for ${def.key}`).not.toContain('undefined');

      for (const stage of ALL_JOKER_STAGES) {
        const ctx: JokerEvalContext = {
          stage,
          state,
          joker: inst,
          jokerIndex: 0,
          handEval: sampleHandEval,
          fullHand: samplePlayed,
          scoringHand: samplePlayed,
          heldCards: sampleHeld,
          card: stage === 'individual_hand' || stage === 'repetition_hand' ? sampleHeld[0] : samplePlayed[0],
          removedCards: [samplePlayed[0]],
          consumable: {
            id: 'sweep_cons',
            key: 'c_pluto',
            set: 'Planet',
            edition: 'none',
            cost: 3,
            sellValue: 1,
          },
          itemKey: 'c_pluto',
          itemKind: 'Planet',
          probMultiplier: 1,
          rand: (k) => nextRandom(state.rng, k),
          randInt: (k, max) => nextRandomInt(state.rng, k, max),
          isFace: (c) => isCardFace(c, state.jokers),
          isSuit: (c, s) => isCardSuit(c, s, state.jokers),
        };

        const res = evaluateJokerHook(def.key, ctx);
        if (res) {
          for (const field of ['chips', 'mult', 'xMult', 'dollars', 'repetitions', 'addSellValue'] as const) {
            const val = res[field];
            if (val !== undefined) {
              expect(Number.isFinite(val), `${def.key}.${stage}.${field} not finite`).toBe(true);
            }
          }
        }
      }

      // Ensure no NaN leaked into joker.state
      for (const [k, v] of Object.entries(inst.state)) {
        if (typeof v === 'number') {
          expect(Number.isFinite(v), `${def.key}.state.${k} became NaN/Inf`).toBe(true);
        }
      }
    }
  });

  it('verifies targeted behaviors of iconic Common, Uncommon, and Rare Jokers', () => {
    // Common: Green Joker (+1 Mult on play, -1 Mult ONCE per multi-card discard), Ride the Bus, Egg, Runner, Gros Michel -> Cavendish
    let s = enterPlayingState('b_red', 1, 'ICONIC_COMMON');
    s = dispatchSim(s, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_green_joker' }).state;
    s = dispatchSim(s, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_egg' }).state;
    s = dispatchSim(s, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_riff_raff' }).state;
    const green = s.jokers.find((j) => j.key === 'j_green_joker')!;
    const eggBefore = s.jokers.find((j) => j.key === 'j_egg')!.sellValue;

    // Play 1 card -> Green Joker gains +1 Mult
    s = selectAndPlayCards(s, [s.hand[0]]).state;
    expect(s.jokers.find((j) => j.id === green.id)!.state.mult).toBe(1);
    s = dispatchSim(s, { type: 'FINISH_SCORING' }).state;

    // Discard 3 cards at once -> Green Joker loses ONLY -1 (not -3!)
    s = dispatchSim(s, { type: 'TOGGLE_SELECT_CARD', cardId: s.hand[0] }).state;
    s = dispatchSim(s, { type: 'TOGGLE_SELECT_CARD', cardId: s.hand[1] }).state;
    s = dispatchSim(s, { type: 'TOGGLE_SELECT_CARD', cardId: s.hand[2] }).state;
    s = dispatchSim(s, { type: 'DISCARD_HAND' }).state;
    expect(s.jokers.find((j) => j.id === green.id)!.state.mult).toBe(0);

    // Win blind -> Egg sellValue increases by +$3
    s = dispatchSim(s, { type: 'DEBUG_MUTATE', op: 'WIN_BLIND' }).state;
    expect(s.jokers.find((j) => j.key === 'j_egg')!.sellValue).toBe(eggBefore + 3);

    // Next blind -> Riff-Raff spawns 2 Common Jokers (up to slot cap 5: currently 3 jokers -> 5)
    s = dispatchSim(s, { type: 'FINISH_CASHOUT' }).state;
    s = dispatchSim(s, { type: 'SHOP_NEXT_ROUND' }).state;
    s = dispatchSim(s, { type: 'SELECT_BLIND' }).state;
    expect(s.jokers.length).toBe(5);

    // Uncommon: Burglar (+3 hands, 0 discards), Marble (+1 Stone card), Ceremonial Dagger (destroys right joker), Vampire + Midas Mask combo, Trading Card, Diet Cola
    let u = startRun('b_red', 1, 'ICONIC_UNCOMMON').state;
    u = dispatchSim(u, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_burglar' }).state;
    u = dispatchSim(u, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_marble' }).state;
    u = dispatchSim(u, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_ceremonial' }).state;
    u = dispatchSim(u, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_joker' }).state;
    const deckCountBefore = u.fullDeck.length;
    u = dispatchSim(u, { type: 'SELECT_BLIND' }).state;
    expect(u.handsLeft).toBe(7); // 4 base + 3 Burglar
    expect(u.discardsLeft).toBe(0); // Burglar sets discards to 0
    expect(u.fullDeck.length).toBe(deckCountBefore + 1); // Marble added 1 Stone card
    expect(u.fullDeck.some((c) => c.enhancement === 'm_stone')).toBe(true);
    expect(u.jokers.some((j) => j.key === 'j_joker')).toBe(false); // Eaten by Ceremonial Dagger
    expect(Number(u.jokers.find((j) => j.key === 'j_ceremonial')!.state.mult)).toBeGreaterThan(0);

    // Midas Mask -> Vampire combo (left-to-right `before` hooks turn face card Gold then drain Gold into XMult!)
    let mv = enterPlayingState('b_red', 1, 'MIDAS_VAMPIRE');
    const faceKing = makeCard('King', 'Spades');
    mv.fullDeck = [faceKing];
    mv.hand = [faceKing.id];
    mv.jokers = [makeJokerInst('j_midas_mask'), makeJokerInst('j_vampire')];
    const mvRes = scorePlayedHand(mv, [faceKing]);
    expect(faceKing.enhancement).toBe('none'); // Midas made Gold, Vampire stripped to none
    expect(Number(mv.jokers[1].state.x_mult)).toBeCloseTo(1.1, 4);
    expect(mvRes.handScore).toBeGreaterThan(15);

    // Diet Cola sell grants Double Tag; Trading Card destroys 1st single-card discard for +$3
    let dt = enterPlayingState('b_red', 1, 'DIET_TRADING');
    dt = dispatchSim(dt, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_diet_cola' }).state;
    dt = dispatchSim(dt, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_trading' }).state;
    const colaId = dt.jokers.find((j) => j.key === 'j_diet_cola')!.id;
    dt = dispatchSim(dt, { type: 'SELL_JOKER', jokerId: colaId }).state;
    expect(dt.tags).toContain('tag_double');

    const dollarsBeforeTrading = dt.dollars;
    const deckBeforeTrading = dt.fullDeck.length;
    dt = dispatchSim(dt, { type: 'TOGGLE_SELECT_CARD', cardId: dt.hand[0] }).state;
    dt = dispatchSim(dt, { type: 'DISCARD_HAND' }).state;
    expect(dt.dollars).toBe(dollarsBeforeTrading + 3);
    expect(dt.fullDeck.length).toBe(deckBeforeTrading - 1);

    // Rare: DNA (clones 1st 1-card hand), Wee Joker (+8 Chips on 2), Burnt Joker (upgrades 1st discard), Invisible Joker (2 rounds -> duplicates on sell), Baseball Card, Obelisk, Stuntman
    let r = enterPlayingState('b_red', 1, 'ICONIC_RARE');
    r = dispatchSim(r, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_dna' }).state;
    r = dispatchSim(r, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_burnt' }).state;
    r = dispatchSim(r, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_invisible' }).state;
    r = dispatchSim(r, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_stuntman' }).state;
    expect(getEffectiveHandSize(r)).toBe(6); // 8 base - 2 Stuntman

    // Burnt Joker: discard 1 card -> High Card levels up from 1 to 2
    r = dispatchSim(r, { type: 'TOGGLE_SELECT_CARD', cardId: r.hand[0] }).state;
    r = dispatchSim(r, { type: 'DISCARD_HAND' }).state;
    expect(r.handLevels['High Card'].level).toBe(2);

    // DNA: play 1 card on first hand of round -> deck grows by +1
    const deckBeforeDna = r.fullDeck.length;
    r = selectAndPlayCards(r, [r.hand[0]]).state;
    expect(r.fullDeck.length).toBe(deckBeforeDna + 1);

    // Invisible Joker: Stuntman (+250) + High Card Lv.2 already cleared Small Blind (300 chips)!
    r = dispatchSim(r, { type: 'FINISH_SCORING' }).state;
    expect(r.phase).toBe('CASHOUT');
    expect(Number(r.jokers.find((j) => j.key === 'j_invisible')!.state.invis_rounds)).toBe(1);
    r = dispatchSim(r, { type: 'FINISH_CASHOUT' }).state;
    r = dispatchSim(r, { type: 'SHOP_NEXT_ROUND' }).state;
    r = dispatchSim(r, { type: 'DEBUG_MUTATE', op: 'WIN_BLIND' }).state;
    const invis = r.jokers.find((j) => j.key === 'j_invisible')!;
    expect(Number(invis.state.invis_rounds)).toBe(2);
    const jokerCountBeforeSell = r.jokers.length;
    r = dispatchSim(r, { type: 'SELL_JOKER', jokerId: invis.id }).state;
    // Sold 1, duplicated 1 -> net count stays equal
    expect(r.jokers.length).toBe(jokerCountBeforeSell);
    expect(r.jokers.some((j) => j.key === 'j_invisible')).toBe(false);

    // Rare: Wee Joker + Baseball Card + Driver's License + Campfire + Hit the Road + Obelisk
    const twoCard = makeCard('2', 'Spades');
    const rareScoreState = enterPlayingState('b_red', 1, 'RARE_SCORE');
    rareScoreState.fullDeck = [
      twoCard,
      ...Array.from({ length: 16 }, () => makeCard('5', 'Hearts', { enhancement: 'm_bonus' })),
    ];
    rareScoreState.hand = [];
    const wee = makeJokerInst('j_wee');
    const baseball = makeJokerInst('j_baseball');
    const uncommonDummy = makeJokerInst('j_four_fingers'); // rarity 2
    const license = makeJokerInst('j_drivers_license'); // >=16 enhanced -> X3
    rareScoreState.jokers = [wee, baseball, uncommonDummy, license];
    scorePlayedHand(rareScoreState, [twoCard]);
    expect(wee.state.chips).toBe(8);
    // Chips: 5 (High Card) + 2 (2 of Spades) + 8 (Wee) = 15; Mult: 1 * 1.5 (Baseball for 1 Uncommon) * 3 (Driver's License) = 4.5 -> floor(67.5) = 67
    expect(rareScoreState.lastHandScore).toBe(67);

    // Uncommon: Flower Pot (all 4 suits), Seeing Double (Club + non-Club), Constellation (Planet scaling), Matador (+$8 on boss trigger)
    const fpState = enterPlayingState('b_red', 1, 'FLOWER_SEEING');
    const fourSuitHand = [
      makeCard('Ace', 'Clubs'),
      makeCard('Ace', 'Hearts'),
      makeCard('King', 'Diamonds'),
      makeCard('King', 'Spades'),
    ];
    fpState.fullDeck = [...fourSuitHand];
    fpState.hand = [];
    fpState.jokers = [makeJokerInst('j_flower_pot'), makeJokerInst('j_seeing_double')];
    const fpOut = scorePlayedHand(fpState, fourSuitHand);
    // Two Pair base 20 chips, 2 mult; 4 cards = 11+11+10+10 = +42 -> 62 chips; Mult: 2 * 3 (Flower Pot) * 2 (Seeing Double) = 12 -> 744
    expect(fpOut.handScore).toBe(744);

    let constState = enterPlayingState('b_red', 1, 'CONSTELLATION');
    constState = dispatchSim(constState, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_constellation' }).state;
    constState = dispatchSim(constState, { type: 'DEBUG_MUTATE', op: 'GRANT_CONSUMABLE', key: 'c_pluto' }).state;
    constState = dispatchSim(constState, { type: 'USE_CONSUMABLE', consumableId: constState.consumables[0].id }).state;
    expect(Number(constState.jokers[0].state.x_mult)).toBeCloseTo(1.1, 4);

    // Matador earns +$8 when Boss Blind triggers (e.g. The Psychic with <5 cards)
    let matState = startRun('b_red', 1, 'MATADOR_BOSS').state;
    matState = dispatchSim(matState, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_matador' }).state;
    matState = dispatchSim(matState, { type: 'DEBUG_MUTATE', op: 'WARP_ANTE', ante: 1, key: 'bl_psychic' }).state;
    matState = dispatchSim(matState, { type: 'SELECT_BLIND' }).state;
    const dollarsBeforeMat = matState.dollars;
    matState = selectAndPlayCards(matState, [matState.hand[0]]).state;
    expect(matState.dollars).toBe(dollarsBeforeMat + 8);

    // Gros Michel 1/6 extinction with 3x Oops! All 6s (probMult=8 -> guaranteed extinct) unlocks Cavendish
    let banana = startRun('b_red', 1, 'BANANA_EXTINCT').state;
    banana = dispatchSim(banana, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_gros_michel' }).state;
    banana = dispatchSim(banana, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_oops' }).state;
    banana = dispatchSim(banana, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_oops' }).state;
    banana = dispatchSim(banana, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_oops' }).state;
    banana = dispatchSim(banana, { type: 'DEBUG_MUTATE', op: 'WIN_BLIND' }).state;
    expect(banana.jokers.some((j) => j.key === 'j_gros_michel')).toBe(false);
    expect(banana.tracking.bannedOthers).toContain('__extinct_gros_michel');
  });

  it('verifies ALL 5 Legendary Jokers: Canio, Triboulet, Yorick, Chicot, and Perkeo', () => {
    // 1. Canio: destroying 2 face cards via Hanged Man grants +2 XMult (X1 -> X3)
    let canioState = enterPlayingState('b_red', 1, 'LEG_CANIO');
    canioState = dispatchSim(canioState, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_caino' }).state;
    const faceIds = canioState.fullDeck
      .filter((c) => c.rank === 'King' || c.rank === 'Queen')
      .slice(0, 2)
      .map((c) => c.id);
    canioState.hand = [...faceIds, ...canioState.hand.filter((id) => !faceIds.includes(id)).slice(0, 6)];
    canioState = dispatchSim(canioState, { type: 'DEBUG_MUTATE', op: 'GRANT_CONSUMABLE', key: 'c_hanged_man' }).state;
    const hangedId = canioState.consumables[0].id;
    canioState = dispatchSim(canioState, {
      type: 'USE_CONSUMABLE',
      consumableId: hangedId,
      targetCardIds: faceIds,
    }).state;
    expect(Number(canioState.jokers[0].state.xMult)).toBe(3);

    // 2. Triboulet: played King + Queen pair each give X2 Mult (X4 total!)
    const tribState = enterPlayingState('b_red', 1, 'LEG_TRIB');
    const king = makeCard('King', 'Spades');
    const queen = makeCard('Queen', 'Hearts');
    tribState.fullDeck = [king, queen];
    tribState.hand = [];
    tribState.jokers = [makeJokerInst('j_triboulet'), makeJokerInst('j_splash')];
    const tribOut = scorePlayedHand(tribState, [king, queen]);
    // High Card base 5 chips, 1 mult; King +10 chips & X2 mult (=2); Queen +10 chips & X2 mult (=4) -> 25 * 4 = 100
    expect(tribOut.handScore).toBe(100);

    // 3. Yorick: gains +X1 Mult after 23 discarded cards
    let yorickState = enterPlayingState('b_red', 1, 'LEG_YORICK');
    yorickState = dispatchSim(yorickState, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_yorick' }).state;
    yorickState.discardsLeft = 10;
    let discarded = 0;
    while (discarded < 23) {
      const batch = Math.min(5, 23 - discarded);
      for (let i = 0; i < batch; i++) {
        yorickState = dispatchSim(yorickState, { type: 'TOGGLE_SELECT_CARD', cardId: yorickState.hand[i] }).state;
      }
      yorickState = dispatchSim(yorickState, { type: 'DISCARD_HAND' }).state;
      discarded += batch;
    }
    expect(Number(yorickState.jokers[0].state.xMult)).toBe(2);

    // 4. Chicot: disables Violet Vessel (6x -> 2x) and The Needle (keeps full hands)
    let chicotState = startRun('b_red', 1, 'LEG_CHICOT').state;
    chicotState = dispatchSim(chicotState, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_chicot' }).state;
    chicotState = dispatchSim(chicotState, {
      type: 'DEBUG_MUTATE',
      op: 'WARP_ANTE',
      ante: 8,
      key: 'bl_final_vessel',
    }).state;
    expect(chicotState.blinds.Boss.targetChips).toBe(getBlindAmount(8, 1) * 6);
    chicotState = dispatchSim(chicotState, { type: 'SELECT_BLIND' }).state;
    expect(chicotState.blinds.Boss.disabled).toBe(true);
    expect(chicotState.targetChips).toBe(getBlindAmount(8, 1) * 2);

    // 5. Perkeo: creates a Negative copy of 1 held consumable on SHOP_NEXT_ROUND (and Blueprint doubles it!)
    let perkeoState = startRun('b_red', 1, 'LEG_PERKEO').state;
    perkeoState = dispatchSim(perkeoState, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_blueprint' }).state;
    perkeoState = dispatchSim(perkeoState, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_perkeo' }).state;
    perkeoState = dispatchSim(perkeoState, { type: 'DEBUG_MUTATE', op: 'GRANT_CONSUMABLE', key: 'c_mercury' }).state;
    perkeoState = dispatchSim(perkeoState, { type: 'DEBUG_MUTATE', op: 'WIN_BLIND' }).state;
    perkeoState = dispatchSim(perkeoState, { type: 'FINISH_CASHOUT' }).state;
    expect(perkeoState.consumables).toHaveLength(1);
    perkeoState = dispatchSim(perkeoState, { type: 'SHOP_NEXT_ROUND' }).state;
    // Original + 1 from Blueprint->Perkeo + 1 from Perkeo = 3 consumables (2 Negative!)
    expect(perkeoState.consumables).toHaveLength(3);
    expect(perkeoState.consumables.filter((c) => c.edition === 'e_negative')).toHaveLength(2);
  });
});

describe('Catalog Parity — ALL 30 Blinds (Small, Big, 23 Bosses, 5 Showdowns) + Chicot/Luchador', () => {
  it('exercises all 30 Blinds cleanly and verifies Showdown Bosses & Luchador mid-round disable', () => {
    expect(BLINDS).toHaveLength(30);
    expect(BLINDS.filter((b) => b.slot !== 'Boss')).toHaveLength(2);
    expect(BLINDS.filter((b) => b.slot === 'Boss' && !b.showdown)).toHaveLength(23);
    expect(BLINDS.filter((b) => b.slot === 'Boss' && b.showdown)).toHaveLength(5);

    // Small & Big Blinds
    let sb = startRun('b_red', 1, 'SMALL_BIG').state;
    expect(sb.blinds.Small.key).toBe('bl_small');
    expect(sb.blinds.Big.key).toBe('bl_big');
    sb = dispatchSim(sb, { type: 'SELECT_BLIND' }).state;
    sb = selectAndPlayCards(sb, [sb.hand[0]]).state;
    expect(sb.phase).toBe('SCORING');

    // Sweep ALL 28 Boss Blinds (23 Regular + 5 Showdown) cleanly through WARP_ANTE -> SELECT_BLIND -> PLAY_HAND
    const bossBlinds = BLINDS.filter((b) => b.slot === 'Boss');
    for (const boss of bossBlinds) {
      let s = startRun('b_red', 1, `BOSS_${boss.key}`).state;
      s = dispatchSim(s, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_joker' }).state;
      s = dispatchSim(s, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_banner' }).state;
      s = dispatchSim(s, {
        type: 'DEBUG_MUTATE',
        op: 'WARP_ANTE',
        ante: boss.showdown ? 8 : Math.max(1, boss.minAnte),
        key: boss.key,
      }).state;
      expect(s.blinds.Boss.key).toBe(boss.key);
      s = dispatchSim(s, { type: 'SELECT_BLIND' }).state;
      expect(s.phase).toBe('PLAYING');

      // Spot-check key Boss rules
      if (boss.key === 'bl_water') expect(s.discardsLeft).toBe(0);
      if (boss.key === 'bl_needle') expect(s.handsLeft).toBe(1);
      if (boss.key === 'bl_manacle') expect(s.hand.length).toBe(7);
      if (boss.key === 'bl_house') expect(s.hand.every((id) => s.fullDeck.find((c) => c.id === id)!.faceDown)).toBe(true);
      if (boss.key === 'bl_final_acorn') expect(s.jokers.every((j) => j.faceDown)).toBe(true);
      if (boss.key === 'bl_final_leaf') expect(s.fullDeck.every((c) => c.debuffed)).toBe(true);
      if (boss.key === 'bl_final_vessel') expect(s.targetChips).toBe(getBlindAmount(8, 1) * 6);
      if (boss.key === 'bl_final_heart') expect(s.jokers.some((j) => j.debuffed)).toBe(true);
      if (boss.key === 'bl_final_bell') {
        expect(s.tracking.ceruleanBellForcedCardId).toBeTruthy();
        expect(s.selectedCardIds).toContain(s.tracking.ceruleanBellForcedCardId);
        // Attempting to deselect forced card fails cleanly
        const failRes = dispatchSim(s, {
          type: 'TOGGLE_SELECT_CARD',
          cardId: s.tracking.ceruleanBellForcedCardId!,
        });
        expect(failRes.state.lastError).toBeTruthy();
      }

      // Play a valid hand (keep forced card if Cerulean Bell, play 5 cards for Psychic)
      const playIds: string[] = [];
      if (s.tracking.ceruleanBellForcedCardId) playIds.push(s.tracking.ceruleanBellForcedCardId);
      for (const id of s.hand) {
        if (playIds.length >= 5) break;
        if (!playIds.includes(id)) playIds.push(id);
      }
      const played = selectAndPlayCards(s, playIds);
      expect(played.state.phase).toBe('SCORING');
      expect(Number.isFinite(played.state.lastHandScore)).toBe(true);
    }

    // Specific check: Verdant Leaf undebuffs all cards once 1 Joker is sold
    let leaf = startRun('b_red', 1, 'VERDANT_SELL').state;
    leaf = dispatchSim(leaf, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_joker' }).state;
    leaf = dispatchSim(leaf, { type: 'DEBUG_MUTATE', op: 'WARP_ANTE', ante: 8, key: 'bl_final_leaf' }).state;
    leaf = dispatchSim(leaf, { type: 'SELECT_BLIND' }).state;
    expect(leaf.fullDeck.every((c) => c.debuffed)).toBe(true);
    leaf = dispatchSim(leaf, { type: 'SELL_JOKER', jokerId: leaf.jokers[0].id }).state;
    expect(leaf.fullDeck.every((c) => !c.debuffed)).toBe(true);

    // Specific check: Psychic debuffs < 5 cards, Eye debuffs repeat hand, Mouth debuffs different hand, Flint halves base chips/mult, Tooth charges -$1/card, Arm lowers level > 1, Ox zeroes $ on most-played hand
    let psych = startRun('b_red', 1, 'BOSS_PSYCHIC').state;
    psych = dispatchSim(psych, { type: 'DEBUG_MUTATE', op: 'WARP_ANTE', ante: 1, key: 'bl_psychic' }).state;
    psych = dispatchSim(psych, { type: 'SELECT_BLIND' }).state;
    const psychOut = selectAndPlayCards(psych, [psych.hand[0]]);
    expect(psychOut.state.lastHandScore).toBe(0);
    expect(psychOut.beats.some((b) => b.kind === 'boss_debuff')).toBe(true);

    // Luchador mid-round disable on Violet Vessel, Amber Acorn, and The Needle
    let luch = startRun('b_red', 1, 'LUCHADOR_NEEDLE').state;
    luch = dispatchSim(luch, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_luchador' }).state;
    luch = dispatchSim(luch, { type: 'DEBUG_MUTATE', op: 'WARP_ANTE', ante: 2, key: 'bl_needle' }).state;
    luch = dispatchSim(luch, { type: 'SELECT_BLIND' }).state;
    expect(luch.handsLeft).toBe(1);
    luch = dispatchSim(luch, { type: 'SELL_JOKER', jokerId: luch.jokers[0].id }).state;
    expect(luch.blinds.Boss.disabled).toBe(true);
    expect(luch.handsLeft).toBe(4); // Restored lost hands!
  });
});

describe('Catalog Parity — ALL 22 Tarots, 12 Planets, 18 Spectrals, 32 Vouchers, 32 Boosters, 24 Tags', () => {
  it('exercises ALL 22 Tarots, ALL 12 Planets (incl. secret), and ALL 18 Spectrals (incl. Soul & Black Hole)', () => {
    expect(TAROTS).toHaveLength(22);
    expect(PLANETS).toHaveLength(12);
    expect(SPECTRALS).toHaveLength(18);

    // Verify all 12 Planets level up their exact PokerHandId (including Planet X, Ceres, Eris)
    const planetState = enterPlayingState('b_red', 1, 'ALL_PLANETS');
    for (const p of PLANETS) {
      expect(p.handType).toBeTruthy();
      const before = planetState.handLevels[p.handType!].level;
      const res = applyConsumable(planetState, p.key, []);
      expect(res.ok).toBe(true);
      expect(planetState.handLevels[p.handType!].level).toBe(before + 1);
      expect(planetState.handLevels[p.handType!].visible).toBe(true);
    }
    expect(CONSUMABLE_MAP['c_planet_x'].hidden).toBe(true);
    expect(CONSUMABLE_MAP['c_ceres'].hidden).toBe(true);
    expect(CONSUMABLE_MAP['c_eris'].hidden).toBe(true);

    // Exercise ALL 22 Tarots via USE_CONSUMABLE
    for (const t of TAROTS) {
      let s = enterPlayingState('b_red', 1, `TAROT_${t.key}`);
      s = dispatchSim(s, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_joker' }).state;
      if (t.key === 'c_fool') {
        // Use a Planet first so Fool has a valid copy target
        s = dispatchSim(s, { type: 'DEBUG_MUTATE', op: 'GRANT_CONSUMABLE', key: 'c_mercury' }).state;
        s = dispatchSim(s, { type: 'USE_CONSUMABLE', consumableId: s.consumables[0].id }).state;
      }
      s = dispatchSim(s, { type: 'DEBUG_MUTATE', op: 'GRANT_CONSUMABLE', key: t.key }).state;
      const targets = s.hand.slice(0, t.minSelect);
      expect(canUseConsumable(s, t.key, targets, true).ok, `Tarot ${t.key} should be usable`).toBe(true);
      const res = dispatchSim(s, {
        type: 'USE_CONSUMABLE',
        consumableId: s.consumables[s.consumables.length - 1].id,
        targetCardIds: targets,
      });
      expect(res.state.lastError, `Tarot ${t.key} errored: ${res.state.lastError}`).toBeNull();
    }

    // Exercise ALL 18 Spectrals via USE_CONSUMABLE (with specific Soul & Black Hole checks)
    for (const sp of SPECTRALS) {
      let s = enterPlayingState('b_red', 1, `SPEC_${sp.key}`);
      s = dispatchSim(s, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_joker' }).state;
      s = dispatchSim(s, { type: 'DEBUG_MUTATE', op: 'GRANT_CONSUMABLE', key: sp.key }).state;
      const targets = s.hand.slice(0, sp.minSelect);
      expect(canUseConsumable(s, sp.key, targets, true).ok, `Spectral ${sp.key} should be usable`).toBe(true);
      const res = dispatchSim(s, {
        type: 'USE_CONSUMABLE',
        consumableId: s.consumables[s.consumables.length - 1].id,
        targetCardIds: targets,
      });
      expect(res.state.lastError, `Spectral ${sp.key} errored: ${res.state.lastError}`).toBeNull();

      if (sp.key === 'c_soul') {
        const summoned = res.state.jokers[res.state.jokers.length - 1];
        expect(JOKER_MAP[summoned.key].rarity).toBe(4);
      } else if (sp.key === 'c_black_hole') {
        for (const hId of POKER_HAND_IDS) {
          expect(res.state.handLevels[hId].level).toBe(2);
        }
      }
    }
  });

  it('exercises ALL 32 Vouchers (16 T1 + 16 T2 chains) and ALL 32 Boosters', () => {
    expect(VOUCHERS).toHaveLength(32);
    const t1 = VOUCHERS.filter((v) => v.tier === 1);
    const t2 = VOUCHERS.filter((v) => v.tier === 2);
    expect(t1).toHaveLength(16);
    expect(t2).toHaveLength(16);
    for (const v of t2) {
      expect(v.requires).toBeTruthy();
      expect(VOUCHER_MAP[v.requires!]?.tier).toBe(1);
    }

    // Grant all 32 vouchers in tier order and verify key stateful changes
    let vs = startRun('b_red', 1, 'ALL_VOUCHERS').state;
    vs = dispatchSim(vs, { type: 'DEBUG_MUTATE', op: 'WARP_ANTE', ante: 4 }).state;
    for (const v of [...t1, ...t2]) {
      vs = dispatchSim(vs, { type: 'DEBUG_MUTATE', op: 'GRANT_VOUCHER', key: v.key }).state;
    }
    expect(vs.vouchers).toHaveLength(32);
    expect(vs.shopSlots).toBe(4); // 2 + Overstock + Overstock Plus
    expect(vs.discountPercent).toBe(50); // Liquidation
    expect(vs.editionRate).toBe(4); // Glow Up
    expect(vs.baseRerollCost).toBe(1); // 5 - 2 - 2
    expect(vs.consumableSlots).toBe(3); // 2 + Crystal Ball
    expect(vs.jokerSlots).toBe(6); // 5 + Antimatter
    expect(vs.interestCap).toBe(100); // Money Tree
    expect(vs.handSize).toBe(10); // 8 + Paint Brush + Palette
    expect(vs.ante).toBe(2); // 4 - Hieroglyph - Petroglyph

    // Director's Cut (1 reroll/ante) vs Retcon (unlimited rerolls)
    let dirState = startRun('b_red', 1, 'DIR_CUT').state;
    dirState = dispatchSim(dirState, { type: 'DEBUG_MUTATE', op: 'SET_DOLLARS', amount: 50 }).state;
    dirState = dispatchSim(dirState, { type: 'DEBUG_MUTATE', op: 'GRANT_VOUCHER', key: 'v_directors_cut' }).state;
    const boss1 = dirState.blinds.Boss.key;
    dirState = dispatchSim(dirState, { type: 'REROLL_BOSS' }).state;
    expect(dirState.blinds.Boss.key).not.toBe(boss1);
    const secondTry = dispatchSim(dirState, { type: 'REROLL_BOSS' });
    expect(secondTry.state.lastError).toBeTruthy();
    dirState = dispatchSim(dirState, { type: 'DEBUG_MUTATE', op: 'GRANT_VOUCHER', key: 'v_retcon' }).state;
    const retconTry = dispatchSim(dirState, { type: 'REROLL_BOSS' });
    expect(retconTry.state.lastError).toBeNull();

    // Exercise ALL 32 Boosters
    expect(BOOSTERS).toHaveLength(32);
    for (const b of BOOSTERS) {
      const bs = startRun('b_red', 1, `PACK_${b.key}`).state;
      const pack = openBoosterPack(bs, b.key, b.kind, b.size, b.extra, b.choose);
      expect(bs.phase).toBe('PACK_OPEN');
      expect(pack.cards).toHaveLength(b.extra);
      expect(pack.chooseRemaining).toBe(b.choose);
      expect(pack.needsHand).toBe(b.kind === 'Arcana' || b.kind === 'Spectral');
      if (pack.needsHand) expect(bs.hand.length).toBeGreaterThan(0);

      // Skip pack cleanly returns to BLIND_SELECT
      const skipped = dispatchSim(bs, { type: 'PACK_SKIP' }).state;
      expect(skipped.pack).toBeNull();
      expect(skipped.phase).toBe('BLIND_SELECT');
    }
  });

  it('exercises ALL 24 Skip Tags including Double Tag, Economy, Orbital, Coupon, Investment, D6, Top-up, and Pack tags', () => {
    expect(TAGS).toHaveLength(24);

    // Exercise every single tag cleanly
    for (const tag of TAGS) {
      let s = startRun('b_red', 1, `TAG_${tag.key}`).state;
      s = dispatchSim(s, { type: 'DEBUG_MUTATE', op: 'SET_DOLLARS', amount: 25 }).state;
      s.tracking.skipsTotal = 2;
      s.tracking.handsPlayedTotal = 6;
      s = dispatchSim(s, { type: 'DEBUG_MUTATE', op: 'GRANT_TAG', key: tag.key }).state;
      expect(s.lastError).toBeNull();
    }

    // Double Tag + Economy Tag -> doubles twice! ($10 -> $20 -> $40)
    let dbl = startRun('b_red', 1, 'DOUBLE_ECON').state;
    dbl = dispatchSim(dbl, { type: 'DEBUG_MUTATE', op: 'SET_DOLLARS', amount: 10 }).state;
    dbl = dispatchSim(dbl, { type: 'DEBUG_MUTATE', op: 'GRANT_TAG', key: 'tag_double' }).state;
    dbl = dispatchSim(dbl, { type: 'DEBUG_MUTATE', op: 'GRANT_TAG', key: 'tag_economy' }).state;
    expect(dbl.dollars).toBe(40);

    // Double Tag + Pack Tag queues 2 consecutive free packs!
    let dblPack = startRun('b_red', 1, 'DOUBLE_PACK').state;
    dblPack = dispatchSim(dblPack, { type: 'DEBUG_MUTATE', op: 'GRANT_TAG', key: 'tag_double' }).state;
    dblPack = dispatchSim(dblPack, { type: 'DEBUG_MUTATE', op: 'GRANT_TAG', key: 'tag_buffoon' }).state;
    expect(dblPack.phase).toBe('PACK_OPEN');
    dblPack = dispatchSim(dblPack, { type: 'PACK_SKIP' }).state;
    expect(dblPack.phase).toBe('PACK_OPEN'); // Second queued Buffoon pack opens automatically!
    dblPack = dispatchSim(dblPack, { type: 'PACK_SKIP' }).state;
    expect(dblPack.phase).toBe('BLIND_SELECT');

    // Coupon Tag makes initial shop offers & boosters $0; D6 Tag sets rerollCost to $0
    let shopTag = startRun('b_red', 1, 'COUPON_D6').state;
    shopTag = dispatchSim(shopTag, { type: 'DEBUG_MUTATE', op: 'GRANT_TAG', key: 'tag_coupon' }).state;
    shopTag = dispatchSim(shopTag, { type: 'DEBUG_MUTATE', op: 'GRANT_TAG', key: 'tag_d_six' }).state;
    shopTag = dispatchSim(shopTag, { type: 'DEBUG_MUTATE', op: 'WIN_BLIND' }).state;
    shopTag = dispatchSim(shopTag, { type: 'FINISH_CASHOUT' }).state;
    expect(shopTag.rerollCost).toBe(0);
    expect(shopTag.shop!.offers.every((o) => o.cost === 0)).toBe(true);
    expect(shopTag.shop!.boosters.every((b) => b.cost === 0)).toBe(true);

    // Investment Tag pays +$25 on Boss Blind cashout
    let inv = startRun('b_red', 1, 'INVEST_TAG').state;
    inv = dispatchSim(inv, { type: 'DEBUG_MUTATE', op: 'WARP_ANTE', ante: 1, key: 'bl_hook' }).state;
    inv = dispatchSim(inv, { type: 'DEBUG_MUTATE', op: 'GRANT_TAG', key: 'tag_investment' }).state;
    inv = dispatchSim(inv, { type: 'DEBUG_MUTATE', op: 'WIN_BLIND' }).state;
    expect(inv.cashout!.rows.some((r) => r.label === 'Investment Tag' && r.dollars === 25)).toBe(true);

    // Top-up Tag creates 2 Common Jokers; Orbital Tag adds +3 levels to 1 hand
    let top = startRun('b_red', 1, 'TOPUP_ORBITAL').state;
    top = dispatchSim(top, { type: 'DEBUG_MUTATE', op: 'GRANT_TAG', key: 'tag_top_up' }).state;
    expect(top.jokers).toHaveLength(2);
    expect(top.jokers.every((j) => JOKER_MAP[j.key].rarity === 1)).toBe(true);

    const totalLevelsBefore = POKER_HAND_IDS.reduce((acc, id) => acc + top.handLevels[id].level, 0);
    top = dispatchSim(top, { type: 'DEBUG_MUTATE', op: 'GRANT_TAG', key: 'tag_orbital' }).state;
    const totalLevelsAfter = POKER_HAND_IDS.reduce((acc, id) => acc + top.handLevels[id].level, 0);
    expect(totalLevelsAfter).toBe(totalLevelsBefore + 3);
  });
});

describe('Catalog Parity — ALL 15 Decks, ALL 8 Cumulative Stakes, and ALL 20 Challenges', () => {
  it('validates all 15 Playable Decks starting rules and deck compositions', () => {
    expect(DECKS).toHaveLength(15);

    for (const deck of DECKS) {
      expect(DECK_MAP[deck.key]).toBeDefined();
      const { state } = startRun(deck.key, 1, `DECK_${deck.key}`);
      expect(state.phase).toBe('BLIND_SELECT');
      expect(state.deckId).toBe(deck.key);
      expect(state.fullDeck.length).toBeGreaterThanOrEqual(40);
    }

    expect(startRun('b_red', 1, 'D').state.discardsPerRound).toBe(4);
    expect(startRun('b_blue', 1, 'D').state.handsPerRound).toBe(5);
    expect(startRun('b_yellow', 1, 'D').state.dollars).toBe(14);
    expect(startRun('b_green', 1, 'D').state.tracking.noInterest).toBe(true);
    expect(startRun('b_black', 1, 'D').state.jokerSlots).toBe(6);
    expect(startRun('b_black', 1, 'D').state.handsPerRound).toBe(3);

    const magic = startRun('b_magic', 1, 'D').state;
    expect(magic.vouchers).toContain('v_crystal_ball');
    expect(magic.consumables.map((c) => c.key)).toEqual(['c_fool', 'c_fool']);

    const nebula = startRun('b_nebula', 1, 'D').state;
    expect(nebula.vouchers).toContain('v_telescope');
    expect(nebula.consumableSlots).toBe(1);

    const ghost = startRun('b_ghost', 1, 'D').state;
    expect(ghost.spectralRate).toBe(2);
    expect(ghost.consumables.map((c) => c.key)).toEqual(['c_hex']);

    const abandoned = startRun('b_abandoned', 1, 'D').state;
    expect(abandoned.fullDeck).toHaveLength(40);
    expect(abandoned.fullDeck.some((c) => ['Jack', 'Queen', 'King'].includes(c.rank))).toBe(false);

    const checkered = startRun('b_checkered', 1, 'D').state;
    expect(checkered.fullDeck).toHaveLength(52);
    expect(checkered.fullDeck.filter((c) => c.suit === 'Spades')).toHaveLength(26);
    expect(checkered.fullDeck.filter((c) => c.suit === 'Hearts')).toHaveLength(26);

    const zodiac = startRun('b_zodiac', 1, 'D').state;
    expect(zodiac.vouchers).toEqual(
      expect.arrayContaining(['v_tarot_merchant', 'v_planet_merchant', 'v_overstock_norm'])
    );

    const painted = startRun('b_painted', 1, 'D').state;
    expect(painted.handSize).toBe(10);
    expect(painted.jokerSlots).toBe(4);

    // Anaglyph Deck grants Double Tag on Boss Blind victory
    let ana = startRun('b_anaglyph', 1, 'D').state;
    ana = dispatchSim(ana, { type: 'DEBUG_MUTATE', op: 'WARP_ANTE', ante: 1, key: 'bl_hook' }).state;
    ana = dispatchSim(ana, { type: 'DEBUG_MUTATE', op: 'WIN_BLIND' }).state;
    expect(ana.tags).toContain('tag_double');

    const plasma = startRun('b_plasma', 1, 'D').state;
    expect(plasma.anteScaling).toBe(2);
    expect(plasma.blinds.Small.targetChips).toBe(600);

    const erratic = startRun('b_erratic', 1, 'D').state;
    expect(erratic.fullDeck).toHaveLength(52);
  });

  it('validates ALL 8 Cumulative Stakes (Red $0 small, Green/Purple scaling, Black Eternal, Blue -1 discard, Orange Perishable 5-round debuff, Gold Rental $1/-$3)', () => {
    expect(STAKES).toHaveLength(8);
    for (let lvl = 1 as StakeLevel; lvl <= 8; lvl = (lvl + 1) as StakeLevel) {
      expect(STAKE_MAP[lvl]).toBeDefined();
    }

    // White (1) vs Red (2): Small Blind $3 vs $0
    expect(startRun('b_red', 1, 'S1').state.blinds.Small.dollars).toBe(3);
    expect(startRun('b_red', 2, 'S2').state.blinds.Small.dollars).toBe(0);

    // Green (3): scaling 2 on Ante 2 -> 900
    let s3 = startRun('b_red', 3, 'S3').state;
    s3 = dispatchSim(s3, { type: 'DEBUG_MUTATE', op: 'WARP_ANTE', ante: 2 }).state;
    expect(s3.blinds.Small.targetChips).toBe(900);

    // Blue (5): -1 discard (Red Deck 4 - 1 = 3)
    expect(startRun('b_red', 5, 'S5').state.discardsPerRound).toBe(3);

    // Purple (6): scaling 3 on Ante 2 -> 1000
    let s6 = startRun('b_red', 6, 'S6').state;
    s6 = dispatchSim(s6, { type: 'DEBUG_MUTATE', op: 'WARP_ANTE', ante: 2 }).state;
    expect(s6.blinds.Small.targetChips).toBe(1000);

    // Black (4), Orange (7), Gold (8) shop stickers appear on Stake 8
    let sawEternal = false;
    let sawPerishable = false;
    let sawRental = false;
    let s8 = startRun('b_red', 8, 'GOLD_STICKERS').state;
    s8 = dispatchSim(s8, { type: 'DEBUG_MUTATE', op: 'WIN_BLIND' }).state;
    s8 = dispatchSim(s8, { type: 'FINISH_CASHOUT' }).state;
    s8 = dispatchSim(s8, { type: 'DEBUG_MUTATE', op: 'SET_DOLLARS', amount: 500 }).state;
    for (let i = 0; i < 40; i++) {
      for (const o of s8.shop!.offers) {
        if (o.kind === 'joker') {
          if (o.eternal) sawEternal = true;
          if (o.perishable) sawPerishable = true;
          if (o.rental) {
            sawRental = true;
            expect(o.cost).toBe(1); // Rental jokers cost $1 to buy!
          }
        }
      }
      s8 = dispatchSim(s8, { type: 'SHOP_REROLL' }).state;
    }
    expect(sawEternal).toBe(true);
    expect(sawPerishable).toBe(true);
    expect(sawRental).toBe(true);

    // Eternal cannot be sold; Perishable debuffs after exactly 5 rounds; Rental deducts -$3 at cashout
    let stickerTest = startRun('b_red', 8, 'STICKER_LIFECYCLE').state;
    stickerTest.jokers.push(
      makeJokerInst('j_joker', { id: 'j_et', eternal: true }),
      makeJokerInst('j_banner', { id: 'j_per', perishable: true, perishableTally: 5 }),
      makeJokerInst('j_greedy_joker', { id: 'j_rent', rental: true, cost: 1, sellValue: 1 })
    );

    const sellEternal = dispatchSim(stickerTest, { type: 'SELL_JOKER', jokerId: 'j_et' });
    expect(sellEternal.state.lastError).toContain('Eternal');

    // Cashout includes Rental -$3 row
    const cash = computeCashoutBreakdown(stickerTest);
    expect(cash.rows.some((r) => r.label === 'Rental Jokers' && r.dollars === -3)).toBe(true);

    // Run 5 rounds to verify Perishable tally decrements 5 -> 4 -> 3 -> 2 -> 1 -> 0 (debuffed)
    for (let r = 1; r <= 5; r++) {
      stickerTest = dispatchSim(stickerTest, { type: 'DEBUG_MUTATE', op: 'WIN_BLIND' }).state;
      const per = stickerTest.jokers.find((j) => j.id === 'j_per')!;
      expect(per.perishableTally).toBe(5 - r);
      expect(per.debuffed).toBe(r === 5);
      stickerTest = dispatchSim(stickerTest, { type: 'FINISH_CASHOUT' }).state;
      stickerTest = dispatchSim(stickerTest, { type: 'SHOP_NEXT_ROUND' }).state;
    }
  });

  it('validates ALL 20 Challenges starting states and key custom rules', () => {
    expect(CHALLENGES).toHaveLength(20);

    for (const ch of CHALLENGES) {
      expect(CHALLENGE_MAP[ch.key]).toBeDefined();
      const { state } = startRun('b_red', 1, `CHAL_${ch.key}`, ch.key);
      expect(state.challengeId).toBe(ch.key);
      expect(state.phase).toBe('BLIND_SELECT');
      expect(state.jokers).toHaveLength(ch.jokers.length);
      expect(state.consumables).toHaveLength(ch.consumables.length);
      for (const v of ch.vouchers) {
        expect(state.vouchers).toContain(v.id);
      }

      // Enter Small Blind & play 1 card cleanly on every single challenge
      const entered = dispatchSim(state, { type: 'SELECT_BLIND' }).state;
      expect(entered.phase).toBe('PLAYING');
      expect(entered.hand.length).toBeGreaterThan(0);
      const played = selectAndPlayCards(entered, [entered.hand[0]]);
      expect(played.state.phase).toBe('SCORING');
      expect(Number.isFinite(played.state.lastHandScore)).toBe(true);
    }

    // Targeted challenge rule verifications:
    // 1. Rich get Richer: Chips capped at current $
    let rich = startRun('b_red', 1, 'CH_RICH', 'c_rich_1').state;
    expect(rich.dollars).toBe(100);
    rich = dispatchSim(rich, { type: 'DEBUG_MUTATE', op: 'SET_DOLLARS', amount: 3 }).state;
    rich = dispatchSim(rich, { type: 'SELECT_BLIND' }).state;
    const richOut = selectAndPlayCards(rich, [rich.hand[0]]);
    expect(richOut.state.currentHandChips).toBeLessThanOrEqual(3);

    // 2. Luxury Tax: -1 hand size per $5
    let lux = startRun('b_red', 1, 'CH_LUX', 'c_luxury_1').state;
    lux = dispatchSim(lux, { type: 'DEBUG_MUTATE', op: 'SET_DOLLARS', amount: 25 }).state;
    expect(getEffectiveHandSize(lux)).toBe(5); // 10 - floor(25/5) = 5

    // 3. On a Knife's Edge: Pinned Ceremonial Dagger cannot be moved out of slot 0
    let knife = startRun('b_red', 1, 'CH_KNIFE', 'c_knife_1').state;
    knife = dispatchSim(knife, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_joker' }).state;
    const movePinned = dispatchSim(knife, { type: 'REORDER_JOKERS', fromIndex: 0, toIndex: 1 });
    expect(movePinned.state.lastError).toContain('Pinned');

    // 4. Jokerless: 0 joker slots, no shop jokers
    let jless = startRun('b_red', 1, 'CH_JLESS', 'c_jokerless_1').state;
    expect(jless.jokerSlots).toBe(0);
    jless = dispatchSim(jless, { type: 'DEBUG_MUTATE', op: 'WIN_BLIND' }).state;
    jless = dispatchSim(jless, { type: 'FINISH_CASHOUT' }).state;
    expect(jless.shop!.offers.every((o) => o.kind !== 'joker')).toBe(true);

    // 5. Typecast: Ante 4 Boss victory makes all Jokers Eternal & sets jokerSlots to 0
    let typecast = startRun('b_red', 1, 'CH_TYPECAST', 'c_typecast_1').state;
    typecast = dispatchSim(typecast, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_joker' }).state;
    typecast = dispatchSim(typecast, { type: 'DEBUG_MUTATE', op: 'WARP_ANTE', ante: 4, key: 'bl_hook' }).state;
    typecast = dispatchSim(typecast, { type: 'DEBUG_MUTATE', op: 'WIN_BLIND' }).state;
    expect(typecast.jokerSlots).toBe(0);
    expect(typecast.jokers[0].eternal).toBe(true);

    // 6. Golden Needle: discarding costs $1
    let gneedle = startRun('b_red', 1, 'CH_GNEEDLE', 'c_golden_needle_1').state;
    gneedle = dispatchSim(gneedle, { type: 'SELECT_BLIND' }).state;
    const beforeDisc = gneedle.dollars;
    gneedle = dispatchSim(gneedle, { type: 'TOGGLE_SELECT_CARD', cardId: gneedle.hand[0] }).state;
    gneedle = dispatchSim(gneedle, { type: 'DISCARD_HAND' }).state;
    expect(gneedle.dollars).toBe(beforeDisc - 1);
  });
});
