import { describe, expect, it } from 'vitest';
import {
  RANKS,
  SUITS,
  type CardInstance,
  type EditionId,
  type EnhancementId,
  type JokerInstance,
  type Rank,
  type SealId,
  type SimState,
  type Suit,
} from '../src/contracts/index.ts';
import {
  JOKER_MAP,
  JOKERS,
  PLANETS,
  SPECTRALS,
  TAROTS,
  formatJokerDesc,
} from '../src/data/index.ts';
import {
  canUseConsumable,
  dispatchSim,
  getBossHandWarning,
  getConsumablePreview,
  getDeckBreakdown,
  getForcedCardId,
  getJokerLiveMeta,
  hashSimState,
  previewSelectedHand,
  scorePlayedHand,
  startRun,
} from '../src/sim/index.ts';

let seq = 1;

function makeCard(
  rank: Rank,
  suit: Suit,
  opts?: {
    id?: string;
    enhancement?: EnhancementId;
    edition?: EditionId;
    seal?: SealId;
    debuffed?: boolean;
    faceDown?: boolean;
    playedThisAnte?: boolean;
  }
): CardInstance {
  return {
    id: opts?.id ?? `tac_card_${seq++}`,
    suit,
    rank,
    enhancement: opts?.enhancement ?? 'none',
    edition: opts?.edition ?? 'none',
    seal: opts?.seal ?? 'none',
    permaBonus: 0,
    debuffed: opts?.debuffed ?? false,
    faceDown: opts?.faceDown ?? false,
    playedThisAnte: opts?.playedThisAnte ?? false,
  };
}

function makeJoker(
  key: string,
  opts?: {
    id?: string;
    edition?: EditionId;
    debuffed?: boolean;
    eternal?: boolean;
    sellValue?: number;
    state?: Record<string, number | string | boolean | null>;
  }
): JokerInstance {
  const def = JOKER_MAP[key];
  const cost = def?.cost ?? 4;
  return {
    id: opts?.id ?? `tac_joker_${seq++}`,
    key,
    edition: opts?.edition ?? 'none',
    eternal: opts?.eternal ?? false,
    perishable: false,
    perishableTally: 0,
    rental: false,
    debuffed: opts?.debuffed ?? false,
    faceDown: false,
    cost,
    sellValue: opts?.sellValue ?? Math.max(1, Math.floor(cost / 2)),
    extraSellValue: 0,
    state: { ...(def?.config ?? {}), ...(opts?.state ?? {}) },
  };
}

function enterBossPlaying(bossKey: string, ante = 2, seed = 'TAC_BOSS'): SimState {
  let state = startRun('b_red', 1, seed).state;
  state = dispatchSim(state, { type: 'DEBUG_MUTATE', op: 'WARP_ANTE', ante, key: bossKey }).state;
  state = dispatchSim(state, { type: 'SELECT_BLIND' }).state;
  return state;
}

function setHandAndSelection(
  state: SimState,
  handCards: CardInstance[],
  selectedIndices: number[]
): SimState {
  state.fullDeck = [...handCards];
  state.hand = handCards.map((c) => c.id);
  state.drawPile = [];
  state.playArea = [];
  state.discardPile = [];
  state.selectedCardIds = selectedIndices.map((idx) => handCards[idx].id);
  return state;
}

describe('Pure Tactical Query API — Zero-Mutation & Determinism Guarantee', () => {
  it('never mutates SimState or RNG across all tactical helpers and catalog sweeps', () => {
    let state = enterBossPlaying('bl_final_bell', 8, 'PURE_CHECK');
    state = dispatchSim(state, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_blueprint' }).state;
    state = dispatchSim(state, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_cavendish' }).state;

    const hashBefore = hashSimState(state);
    const rngCallsBefore = state.rng.calls;

    getForcedCardId(state);
    getBossHandWarning(state);
    getDeckBreakdown(state);
    previewSelectedHand(state);

    for (const c of [...TAROTS, ...PLANETS, ...SPECTRALS]) {
      getConsumablePreview(state, c.key);
    }
    for (const j of state.jokers) {
      getJokerLiveMeta(state, j);
      formatJokerDesc(j, state);
    }

    expect(state.rng.calls).toBe(rngCallsBefore);
    expect(hashSimState(state)).toBe(hashBefore);
  });
});

describe('getBossHandWarning & getForcedCardId — All Boss Warning Severities', () => {
  it('returns null outside PLAYING, on Small/Big Blinds, and when Boss Blind is disabled', () => {
    const blindSelect = startRun('b_red', 1, 'BOSS_NULL_1').state;
    expect(getBossHandWarning(blindSelect)).toBeNull();
    expect(getForcedCardId(blindSelect)).toBeNull();

    const smallPlaying = dispatchSim(blindSelect, { type: 'SELECT_BLIND' }).state;
    expect(getBossHandWarning(smallPlaying)).toBeNull();

    // Disabled Boss via Chicot returns null
    let chicot = startRun('b_red', 1, 'BOSS_CHICOT').state;
    chicot = dispatchSim(chicot, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_chicot' }).state;
    chicot = dispatchSim(chicot, { type: 'DEBUG_MUTATE', op: 'WARP_ANTE', ante: 2, key: 'bl_psychic' }).state;
    chicot = dispatchSim(chicot, { type: 'SELECT_BLIND' }).state;
    chicot = dispatchSim(chicot, { type: 'TOGGLE_SELECT_CARD', cardId: chicot.hand[0] }).state;
    expect(getBossHandWarning(chicot)).toBeNull();
  });

  it('emits block warnings for The Psychic (<5 cards), The Eye (repeat hand), and The Mouth (different hand)', () => {
    // 1. The Psychic
    let psychic = enterBossPlaying('bl_psychic', 1, 'WARN_PSYCHIC');
    expect(getBossHandWarning(psychic)?.severity).toBe('info');
    psychic = dispatchSim(psychic, { type: 'TOGGLE_SELECT_CARD', cardId: psychic.hand[0] }).state;
    psychic = dispatchSim(psychic, { type: 'TOGGLE_SELECT_CARD', cardId: psychic.hand[1] }).state;
    const psychBlock = getBossHandWarning(psychic);
    expect(psychBlock?.severity).toBe('block');
    expect(psychBlock?.bossName).toBe('The Psychic');
    expect(psychBlock?.message).toContain('2/5');

    // Selecting 5 cards clears The Psychic block
    for (let i = 2; i < 5; i++) {
      psychic = dispatchSim(psychic, { type: 'TOGGLE_SELECT_CARD', cardId: psychic.hand[i] }).state;
    }
    expect(getBossHandWarning(psychic)).toBeNull();

    // 2. The Eye
    const eye = enterBossPlaying('bl_eye', 3, 'WARN_EYE');
    const c1 = makeCard('King', 'Spades');
    const c2 = makeCard('King', 'Hearts');
    const c3 = makeCard('4', 'Clubs');
    setHandAndSelection(eye, [c1, c2, c3], [0, 1]); // Pair
    expect(getBossHandWarning(eye)).toBeNull();

    eye.tracking.playedHandTypesThisRound = ['Pair'];
    const eyeBlock = getBossHandWarning(eye);
    expect(eyeBlock?.severity).toBe('block');
    expect(eyeBlock?.message).toContain('Pair');

    // Different hand (High Card) clears block
    eye.selectedCardIds = [c3.id];
    expect(getBossHandWarning(eye)).toBeNull();

    // 3. The Mouth
    const mouth = enterBossPlaying('bl_mouth', 2, 'WARN_MOUTH');
    const m1 = makeCard('9', 'Spades');
    const m2 = makeCard('9', 'Diamonds');
    const m3 = makeCard('Ace', 'Clubs');
    setHandAndSelection(mouth, [m1, m2, m3], [0, 1]);
    // Before first hand played -> info that playing locks the hand type
    expect(getBossHandWarning(mouth)?.severity).toBe('info');

    // Lock to Pair -> selecting High Card triggers block
    mouth.tracking.firstHandTypeThisRound = 'Pair';
    mouth.selectedCardIds = [m3.id];
    const mouthBlock = getBossHandWarning(mouth);
    expect(mouthBlock?.severity).toBe('block');
    expect(mouthBlock?.message).toContain('Pair');

    // Matching Pair clears warning
    mouth.selectedCardIds = [m1.id, m2.id];
    expect(getBossHandWarning(mouth)).toBeNull();
  });

  it('emits warn alerts for The Arm, The Ox, The Tooth, The Hook, Verdant Leaf, The Flint, and debuff bosses', () => {
    // 1. The Arm: Lv.1 -> null, Lv.3 -> warn
    const arm = enterBossPlaying('bl_arm', 2, 'WARN_ARM');
    const a1 = makeCard('Ace', 'Spades');
    const a2 = makeCard('Ace', 'Hearts');
    setHandAndSelection(arm, [a1, a2], [0, 1]);
    expect(getBossHandWarning(arm)).toBeNull();
    arm.handLevels['Pair'].level = 3;
    const armWarn = getBossHandWarning(arm);
    expect(armWarn?.severity).toBe('warn');
    expect(armWarn?.message).toContain('Lv.3');
    expect(armWarn?.message).toContain('Lv.2');

    // 2. The Ox: matches oxMostPlayedHand -> warn; non-matching -> null
    const ox = enterBossPlaying('bl_ox', 6, 'WARN_OX');
    ox.dollars = 27;
    ox.tracking.oxMostPlayedHand = 'Pair';
    const o1 = makeCard('Queen', 'Hearts');
    const o2 = makeCard('Queen', 'Spades');
    const o3 = makeCard('3', 'Clubs');
    setHandAndSelection(ox, [o1, o2, o3], [0, 1]);
    const oxWarn = getBossHandWarning(ox);
    expect(oxWarn?.severity).toBe('warn');
    expect(oxWarn?.message).toContain('$0');
    ox.selectedCardIds = [o3.id];
    expect(getBossHandWarning(ox)).toBeNull();

    // 3. The Tooth: -$N for N cards selected
    let tooth = enterBossPlaying('bl_tooth', 3, 'WARN_TOOTH');
    expect(getBossHandWarning(tooth)?.severity).toBe('info');
    tooth = dispatchSim(tooth, { type: 'TOGGLE_SELECT_CARD', cardId: tooth.hand[0] }).state;
    tooth = dispatchSim(tooth, { type: 'TOGGLE_SELECT_CARD', cardId: tooth.hand[1] }).state;
    tooth = dispatchSim(tooth, { type: 'TOGGLE_SELECT_CARD', cardId: tooth.hand[2] }).state;
    const toothWarn = getBossHandWarning(tooth);
    expect(toothWarn?.severity).toBe('warn');
    expect(toothWarn?.message).toContain('-$3');

    // 4. The Hook: warns about 2 random held cards (or 1 if only 1 remains, null if 0 remain)
    const hook = enterBossPlaying('bl_hook', 1, 'WARN_HOOK');
    const hCards = [
      makeCard('2', 'Spades'),
      makeCard('5', 'Hearts'),
      makeCard('8', 'Clubs'),
      makeCard('Jack', 'Diamonds'),
    ];
    setHandAndSelection(hook, hCards, [0]);
    expect(getBossHandWarning(hook)?.severity).toBe('warn');
    expect(getBossHandWarning(hook)?.message).toContain('2 random held cards');
    hook.selectedCardIds = [hCards[0].id, hCards[1].id, hCards[2].id];
    expect(getBossHandWarning(hook)?.message).toContain('1 random held card');
    hook.selectedCardIds = hCards.map((c) => c.id);
    expect(getBossHandWarning(hook)).toBeNull();

    // 5. Verdant Leaf: warn until 1 Joker sold, then null
    let leaf = startRun('b_red', 1, 'WARN_LEAF').state;
    leaf = dispatchSim(leaf, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_joker' }).state;
    leaf = dispatchSim(leaf, { type: 'DEBUG_MUTATE', op: 'WARP_ANTE', ante: 8, key: 'bl_final_leaf' }).state;
    leaf = dispatchSim(leaf, { type: 'SELECT_BLIND' }).state;
    expect(getBossHandWarning(leaf)?.severity).toBe('warn');
    expect(getBossHandWarning(leaf)?.message).toContain('Joker');
    leaf = dispatchSim(leaf, { type: 'SELL_JOKER', jokerId: leaf.jokers[0].id }).state;
    expect(getBossHandWarning(leaf)).toBeNull();

    // 6. The Flint: base Chips & Mult halved
    const flint = enterBossPlaying('bl_flint', 2, 'WARN_FLINT');
    expect(getBossHandWarning(flint)?.severity).toBe('warn');
    const fCards = [
      makeCard('2', 'Hearts'),
      makeCard('5', 'Hearts'),
      makeCard('8', 'Hearts'),
      makeCard('Jack', 'Hearts'),
      makeCard('Ace', 'Hearts'),
    ];
    setHandAndSelection(flint, fCards, [0, 1, 2, 3, 4]); // Flush Lv.1: 35x4 -> 18x2
    const flintWarn = getBossHandWarning(flint);
    expect(flintWarn?.severity).toBe('warn');
    expect(flintWarn?.message).toContain('35x4 -> 18x2');

    // 7. Debuff bosses (The Plant): all scoring debuffed -> warn; partial selected debuffed -> info; none -> null
    const plant = enterBossPlaying('bl_plant', 4, 'WARN_PLANT');
    const face1 = makeCard('King', 'Spades', { debuffed: true });
    const face2 = makeCard('King', 'Hearts', { debuffed: true });
    const numAce = makeCard('Ace', 'Clubs', { debuffed: false });
    const num5 = makeCard('5', 'Diamonds', { debuffed: false });
    setHandAndSelection(plant, [face1, face2, numAce, num5], [0, 1]); // Pair of Kings (all scoring debuffed)
    const plantWarn = getBossHandWarning(plant);
    expect(plantWarn?.severity).toBe('warn');
    expect(plantWarn?.message).toContain('The Plant');

    // Select 1 debuffed King + 1 clean Ace (High Card scores Ace, 1 selected debuffed -> info)
    plant.selectedCardIds = [face1.id, numAce.id];
    const plantInfo = getBossHandWarning(plant);
    expect(plantInfo?.severity).toBe('info');
    expect(plantInfo?.message).toContain('1 selected card debuffed by The Plant');

    // Select only clean cards -> null
    plant.selectedCardIds = [numAce.id, num5.id];
    expect(getBossHandWarning(plant)).toBeNull();
  });

  it('tracks Cerulean Bell forced card ID and Crimson Heart disabled Joker info', () => {
    const bell = enterBossPlaying('bl_final_bell', 8, 'WARN_BELL');
    const forcedId = getForcedCardId(bell);
    expect(forcedId).toBeTruthy();
    expect(forcedId).toBe(bell.tracking.ceruleanBellForcedCardId);
    const bellInfo = getBossHandWarning(bell);
    expect(bellInfo?.severity).toBe('info');
    expect(bellInfo?.bossName).toBe('Cerulean Bell');

    // Disabling Cerulean Bell clears forced card ID
    bell.blinds.Boss.disabled = true;
    expect(getForcedCardId(bell)).toBeNull();
    expect(getBossHandWarning(bell)).toBeNull();

    // Crimson Heart info names disabled Joker
    let heart = startRun('b_red', 1, 'WARN_HEART').state;
    heart = dispatchSim(heart, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_cavendish' }).state;
    heart = dispatchSim(heart, { type: 'DEBUG_MUTATE', op: 'WARP_ANTE', ante: 8, key: 'bl_final_heart' }).state;
    heart = dispatchSim(heart, { type: 'SELECT_BLIND' }).state;
    const heartInfo = getBossHandWarning(heart);
    expect(heartInfo?.severity).toBe('info');
    expect(heartInfo?.message).toContain('Cavendish');
  });
});

describe('getConsumablePreview — Live Previews for All 52 Consumables', () => {
  it('validates all 22 Tarots, 12 Planets, and 18 Spectrals have crisp non-empty previews matching canUseConsumable', () => {
    let state = startRun('b_red', 1, 'CONS_SWEEP').state;
    state = dispatchSim(state, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_joker' }).state;
    state = dispatchSim(state, { type: 'SELECT_BLIND' }).state;
    state = dispatchSim(state, { type: 'TOGGLE_SELECT_CARD', cardId: state.hand[0] }).state;

    for (const def of [...TAROTS, ...PLANETS, ...SPECTRALS]) {
      const preview = getConsumablePreview(state, def.key, { fromInventory: false });
      const check = canUseConsumable(state, def.key, state.selectedCardIds, false);
      expect(preview.headline.length, `Empty headline for ${def.key}`).toBeGreaterThan(0);
      expect(preview.detail.length, `Empty detail for ${def.key}`).toBeGreaterThan(0);
      expect(preview.headline).not.toContain('NaN');
      expect(preview.detail).not.toContain('undefined');
      expect(preview.canUseNow, `canUseNow mismatch for ${def.key}`).toBe(check.ok);
    }
  });

  it('previews Planets, Hermit, Temperance, Fool, and Wheel of Fortune dynamically', () => {
    let state = startRun('b_red', 1, 'CONS_DYN').state;
    state = dispatchSim(state, { type: 'SELECT_BLIND' }).state;

    // Planets: Jupiter upgrades Flush Lv.1 -> Lv.2 (+15 Chips, +2 Mult)
    const jup1 = getConsumablePreview(state, 'c_jupiter');
    expect(jup1.headline).toBe('Flush: Lv.1 -> Lv.2');
    expect(jup1.detail).toContain('+15 Chips');
    expect(jup1.detail).toContain('+2 Mult');
    expect(jup1.canUseNow).toBe(true);

    state.handLevels['Flush'].level = 4;
    state.handLevels['Flush'].chips = 80;
    state.handLevels['Flush'].mult = 10;
    const jup4 = getConsumablePreview(state, 'c_jupiter');
    expect(jup4.headline).toBe('Flush: Lv.4 -> Lv.5');
    expect(jup4.detail).toContain('95 x 12');

    // Hermit: doubles dollars capped at $20, floor at $0 when in debt
    state.dollars = 13;
    expect(getConsumablePreview(state, 'c_hermit').headline).toBe('+$13');
    state.dollars = 45;
    expect(getConsumablePreview(state, 'c_hermit').headline).toBe('+$20');
    state.dollars = -8;
    expect(getConsumablePreview(state, 'c_hermit').headline).toBe('+$0');

    // Temperance: exact sum of Joker sell values capped at $50
    state.jokers = [
      makeJoker('j_egg', { sellValue: 18 }),
      makeJoker('j_joker', { sellValue: 6 }),
    ];
    expect(getConsumablePreview(state, 'c_temperance').headline).toBe('+$24');
    state.jokers.push(makeJoker('j_egg', { sellValue: 40 }));
    expect(getConsumablePreview(state, 'c_temperance').headline).toBe('+$50');

    // Fool: None played yet -> canUseNow false; after lastTarotPlanetKey -> names exact card
    const foolEmpty = getConsumablePreview(state, 'c_fool');
    expect(foolEmpty.canUseNow).toBe(false);
    expect(foolEmpty.headline).toContain('None played yet');

    state.tracking.lastTarotPlanetKey = 'c_hermit';
    state.tracking.lastTarotPlanetSet = 'Tarot';
    const foolReady = getConsumablePreview(state, 'c_fool');
    expect(foolReady.canUseNow).toBe(true);
    expect(foolReady.headline).toContain('The Hermit');

    // Wheel of Fortune: adjusted probability with Oops! All 6s & editionless check
    state.jokers = [makeJoker('j_joker')];
    const w1 = getConsumablePreview(state, 'c_wheel_of_fortune');
    expect(w1.headline).toContain('1 in 4');
    expect(w1.canUseNow).toBe(true);

    state.jokers = [makeJoker('j_joker'), makeJoker('j_oops')];
    const w2 = getConsumablePreview(state, 'c_wheel_of_fortune');
    expect(w2.headline).toContain('2 in 4');
    expect(w2.canUseNow).toBe(true);

    state.jokers = [makeJoker('j_joker', { edition: 'e_foil' })];
    const wNone = getConsumablePreview(state, 'c_wheel_of_fortune');
    expect(wNone.canUseNow).toBe(false);
    expect(wNone.reason).toContain('editionless');
  });

  it('previews selection-targeted cards (Magician, Death, Strength, Aura) and slot-checking creators (Emperor, High Priestess, Judgement, Wraith, Soul)', () => {
    let state = startRun('b_red', 1, 'CONS_SEL_SLOTS').state;
    state = dispatchSim(state, { type: 'SELECT_BLIND' }).state;

    const cLeft = makeCard('King', 'Spades');
    const cRight = makeCard('Ace', 'Hearts', { edition: 'e_holo' });
    const cThird = makeCard('7', 'Clubs');
    setHandAndSelection(state, [cLeft, cRight, cThird], []);

    // Selection-targeted: Magician needs 1-2 cards
    const mag0 = getConsumablePreview(state, 'c_magician');
    expect(mag0.canUseNow).toBe(false);
    expect(mag0.headline).toBe('Select 1-2 cards');

    state.selectedCardIds = [cLeft.id, cRight.id];
    const mag2 = getConsumablePreview(state, 'c_magician');
    expect(mag2.canUseNow).toBe(true);
    expect(mag2.headline).toContain('Ready: 2 cards selected');

    // Death shows exact left -> right conversion when 2 cards selected
    const death2 = getConsumablePreview(state, 'c_death');
    expect(death2.canUseNow).toBe(true);
    expect(death2.headline).toContain('King of Spades -> Ace of Hearts');

    // Strength shows exact rank increases
    const str2 = getConsumablePreview(state, 'c_strength');
    expect(str2.canUseNow).toBe(true);
    expect(str2.detail).toContain('King -> Ace');
    expect(str2.detail).toContain('Ace -> 2');

    // Aura rejects already-editioned card, accepts editionless card
    state.selectedCardIds = [cRight.id];
    expect(getConsumablePreview(state, 'c_aura').canUseNow).toBe(false);
    state.selectedCardIds = [cLeft.id];
    expect(getConsumablePreview(state, 'c_aura').canUseNow).toBe(true);

    // Emperor & High Priestess check open consumable slots
    state.consumables = [];
    state.consumableSlots = 2;
    expect(getConsumablePreview(state, 'c_emperor', { fromInventory: false }).headline).toContain(
      'Creates 2 random Tarots'
    );
    expect(
      getConsumablePreview(state, 'c_high_priestess', { fromInventory: false }).headline
    ).toContain('Creates 2 random Planets');

    // 1 slot open
    state = dispatchSim(state, { type: 'DEBUG_MUTATE', op: 'GRANT_CONSUMABLE', key: 'c_pluto' }).state;
    expect(getConsumablePreview(state, 'c_emperor', { fromInventory: false }).headline).toContain(
      'Creates 1 random Tarot'
    );

    // 0 slots open (e.g. inspecting in pack/shop)
    state = dispatchSim(state, { type: 'DEBUG_MUTATE', op: 'GRANT_CONSUMABLE', key: 'c_mars' }).state;
    const empFull = getConsumablePreview(state, 'c_emperor', { fromInventory: false });
    expect(empFull.canUseNow).toBe(false);
    expect(empFull.reason).toContain('slot');
    const hpFull = getConsumablePreview(state, 'c_high_priestess', { fromInventory: false });
    expect(hpFull.canUseNow).toBe(false);

    // Judgement / Wraith / Soul check Joker slots
    state.jokerSlots = 1;
    state.jokers = [];
    state.dollars = 22;
    expect(getConsumablePreview(state, 'c_judgement').canUseNow).toBe(true);
    const wraithOk = getConsumablePreview(state, 'c_wraith');
    expect(wraithOk.canUseNow).toBe(true);
    expect(wraithOk.headline).toContain('$22 -> $0');
    expect(getConsumablePreview(state, 'c_soul').canUseNow).toBe(true);

    state.jokers = [makeJoker('j_joker')];
    expect(getConsumablePreview(state, 'c_judgement').canUseNow).toBe(false);
    expect(getConsumablePreview(state, 'c_wraith').canUseNow).toBe(false);
    expect(getConsumablePreview(state, 'c_soul').canUseNow).toBe(false);

    // Ectoplasm tracks escalating hand-size penalty
    state.tracking.ectoplasmUses = 2;
    const ecto = getConsumablePreview(state, 'c_ectoplasm');
    expect(ecto.canUseNow).toBe(true);
    expect(ecto.headline).toContain('-3 Hand Size');
  });
});

describe('getJokerLiveMeta & formatJokerDesc — Blueprint/Brainstorm, Badges & All 150 Jokers', () => {
  it('resolves Blueprint & Brainstorm copy targets, chains, cycles, rightmost/self, and incompatibilities', () => {
    const state = startRun('b_red', 1, 'JOKER_COPY_META').state;

    // 1. Valid direct + chained copy: [Cavendish, Brainstorm, Blueprint, Joker]
    const cav = makeJoker('j_cavendish');
    const bs = makeJoker('j_brainstorm');
    const bp = makeJoker('j_blueprint');
    const jok = makeJoker('j_joker');
    state.jokers = [cav, bs, bp, jok];

    const bsMeta = getJokerLiveMeta(state, bs);
    expect(bsMeta.blueprintCompat).toBe(true);
    expect(bsMeta.copyingName).toBe('Cavendish');
    expect(bsMeta.copyingCompatible).toBe(true);
    expect(formatJokerDesc(bs, state)).toContain('Cavendish');

    const bpMeta = getJokerLiveMeta(state, bp);
    expect(bpMeta.copyingName).toBe('Joker');
    expect(bpMeta.copyingCompatible).toBe(true);
    expect(formatJokerDesc(bp, state)).toContain('Joker');

    // 2. Rightmost Blueprint & leftmost Brainstorm -> "No target", copyingCompatible: false
    const loneBp = makeJoker('j_blueprint');
    const loneBs = makeJoker('j_brainstorm');
    state.jokers = [loneBs, loneBp];
    // Brainstorm at 0 copies self -> No target; Blueprint at end -> No target
    expect(getJokerLiveMeta(state, loneBs)).toMatchObject({
      blueprintCompat: true,
      copyingName: 'No target',
      copyingCompatible: false,
    });
    expect(getJokerLiveMeta(state, loneBp)).toMatchObject({
      blueprintCompat: true,
      copyingName: 'No target',
      copyingCompatible: false,
    });

    // 3. Mutual cycle [Blueprint, Brainstorm] -> No target, no infinite loop
    const cycBp = makeJoker('j_blueprint');
    const cycBs = makeJoker('j_brainstorm');
    state.jokers = [cycBp, cycBs];
    expect(getJokerLiveMeta(state, cycBp)).toMatchObject({
      copyingName: 'No target',
      copyingCompatible: false,
    });
    expect(getJokerLiveMeta(state, cycBs)).toMatchObject({
      copyingName: 'No target',
      copyingCompatible: false,
    });

    // 4. Incompatible neighbor [Blueprint, Egg] -> copyingName: 'Egg', copyingCompatible: false
    const incBp = makeJoker('j_blueprint');
    const egg = makeJoker('j_egg');
    state.jokers = [incBp, egg];
    expect(getJokerLiveMeta(state, incBp)).toMatchObject({
      blueprintCompat: true,
      copyingName: 'Egg',
      copyingCompatible: false,
    });
    expect(getJokerLiveMeta(state, egg).blueprintCompat).toBe(false);
    expect(formatJokerDesc(incBp, state)).toContain('Egg');
    expect(formatJokerDesc(incBp, state)).toContain('incompatible');
  });

  it('produces crisp live status badges for countdown, target, conditional, odds, and boss-reactive Jokers', () => {
    let state = startRun('b_red', 1, 'JOKER_BADGES').state;
    state = dispatchSim(state, { type: 'SELECT_BLIND' }).state;

    // Invisible Joker: 1/2 Rounds -> READY!
    const invis = makeJoker('j_invisible', { state: { extra: 2, invis_rounds: 1 } });
    expect(getJokerLiveMeta(state, invis).statusBadge).toBe('1/2 Rounds');
    invis.state.invis_rounds = 2;
    expect(getJokerLiveMeta(state, invis).statusBadge).toBe('READY!');
    expect(formatJokerDesc(invis, state)).toContain('Ready!');

    // Loyalty Card: 3 Left -> ACTIVE!
    const loyalty = makeJoker('j_loyalty_card', { state: { Xmult: 4, every: 5, remaining: 3 } });
    expect(getJokerLiveMeta(state, loyalty).statusBadge).toBe('3 Left');
    loyalty.state.remaining = 0;
    expect(getJokerLiveMeta(state, loyalty).statusBadge).toBe('ACTIVE!');

    // Rotating target Jokers
    state.tracking.mailRank = 'Queen';
    state.tracking.idolRank = 'Ace';
    state.tracking.idolSuit = 'Hearts';
    state.tracking.ancientSuit = 'Diamonds';
    state.tracking.castleSuit = 'Spades';
    expect(getJokerLiveMeta(state, makeJoker('j_mail')).statusBadge).toContain('Queen');
    expect(getJokerLiveMeta(state, makeJoker('j_idol')).statusBadge).toBe('Ace of Hearts');
    expect(getJokerLiveMeta(state, makeJoker('j_ancient')).statusBadge).toBe('Diamonds');
    expect(getJokerLiveMeta(state, makeJoker('j_castle', { state: { chips: 18, chip_mod: 3 } })).statusBadge).toContain('Spades');
    expect(getJokerLiveMeta(state, makeJoker('j_castle', { state: { chips: 18, chip_mod: 3 } })).statusBadge).toContain('+18');

    // To Do List
    const todo = makeJoker('j_todo_list', { state: { dollars: 4, poker_hand: 'Flush' } });
    expect(getJokerLiveMeta(state, todo).statusBadge).toBe('Flush');

    // Obelisk avoid hand (single & tied)
    state.handLevels['Pair'].played = 5;
    state.handLevels['High Card'].played = 3;
    const obelisk = makeJoker('j_obelisk', { state: { extra: 0.2, xMult: 1.6 } });
    expect(getJokerLiveMeta(state, obelisk).statusBadge).toBe('Avoid Pair');
    expect(formatJokerDesc(obelisk, state)).toContain('avoid Pair');
    state.handLevels['High Card'].played = 5;
    expect(getJokerLiveMeta(state, obelisk).statusBadge).toContain('+1');

    // First-hand / First-discard ready badges
    state.tracking.handsPlayedThisRound = 0;
    state.tracking.discardsUsedThisRound = 0;
    state.discardsLeft = 3;
    expect(getJokerLiveMeta(state, makeJoker('j_burnt')).statusBadge).toBe('1st Discard Ready');
    expect(getJokerLiveMeta(state, makeJoker('j_trading')).statusBadge).toBe('1st Discard Ready');
    expect(getJokerLiveMeta(state, makeJoker('j_dna')).statusBadge).toBe('1st Hand Ready');
    expect(getJokerLiveMeta(state, makeJoker('j_sixth_sense')).statusBadge).toBe('1st Hand Ready');

    state.tracking.handsPlayedThisRound = 1;
    state.tracking.discardsUsedThisRound = 1;
    expect(getJokerLiveMeta(state, makeJoker('j_burnt')).statusBadge).toBe('Used This Round');
    expect(getJokerLiveMeta(state, makeJoker('j_dna')).statusBadge).toBe('Used This Round');

    // Dusk & Acrobat: active on final hand (handsLeft === 1 during PLAYING)
    state.handsLeft = 2;
    expect(getJokerLiveMeta(state, makeJoker('j_dusk')).statusBadge).toBeUndefined();
    expect(getJokerLiveMeta(state, makeJoker('j_acrobat')).statusBadge).toBeUndefined();
    state.handsLeft = 1;
    expect(getJokerLiveMeta(state, makeJoker('j_dusk')).statusBadge).toBe('Final Hand!');
    expect(getJokerLiveMeta(state, makeJoker('j_acrobat')).statusBadge).toBe('Final Hand!');

    // Gros Michel & Cavendish adjusted odds with Oops! All 6s
    state.jokers = [makeJoker('j_oops')];
    expect(getJokerLiveMeta(state, makeJoker('j_gros_michel')).statusBadge).toContain('2 in 6');
    expect(getJokerLiveMeta(state, makeJoker('j_cavendish')).statusBadge).toContain('2 in 1000');

    // Luchador: active Boss Blind -> Sell to Disable Boss!; Small Blind -> no badge
    const luchador = makeJoker('j_luchador');
    expect(getJokerLiveMeta(state, luchador).statusBadge).toBeUndefined();
    const bossState = enterBossPlaying('bl_hook', 1, 'LUCH_BADGE');
    expect(getJokerLiveMeta(bossState, luchador).statusBadge).toBe('Sell to Disable Boss!');
    bossState.blinds.Boss.disabled = true;
    expect(getJokerLiveMeta(bossState, luchador).statusBadge).toBeUndefined();

    // Debuffed Joker reports DEBUFFED
    expect(getJokerLiveMeta(state, makeJoker('j_joker', { debuffed: true })).statusBadge).toBe(
      'DEBUFFED'
    );
  });

  it('audits formatJokerDesc & getJokerLiveMeta across ALL 150 Jokers for zero stale placeholders or NaN', () => {
    const state = dispatchSim(startRun('b_red', 1, 'ALL_150_META').state, {
      type: 'SELECT_BLIND',
    }).state;

    expect(JOKERS).toHaveLength(150);
    for (const def of JOKERS) {
      const inst = makeJoker(def.key);
      state.jokers = [inst];
      const desc = formatJokerDesc(inst, state);
      const meta = getJokerLiveMeta(state, inst);

      expect(desc.length, `empty desc for ${def.key}`).toBeGreaterThan(0);
      expect(desc, `placeholder leaked in ${def.key}`).not.toMatch(/#\d+#/);
      expect(desc, `NaN in ${def.key}`).not.toContain('NaN');
      expect(desc, `undefined in ${def.key}`).not.toContain('undefined');
      expect(meta.blueprintCompat).toBe(def.blueprintCompat);
      if (meta.statusBadge) {
        expect(meta.statusBadge).not.toContain('NaN');
        expect(meta.statusBadge).not.toContain('undefined');
      }
    }
  });
});

describe('getDeckBreakdown — Exact 4x13 Matrix & Modifiers Accounting', () => {
  it('computes exact standard, Checkered, Abandoned, Medusa, and Pareidolia breakdowns', () => {
    // 1. Standard 52-card deck before and after drawing 8 cards
    const init = startRun('b_red', 1, 'DECK_STD').state;
    const bInit = getDeckBreakdown(init);
    expect(bInit.total).toBe(52);
    expect(bInit.remaining).toBe(52);
    expect(bInit.faceTotal).toBe(12);
    expect(bInit.faceRemaining).toBe(12);
    expect(bInit.stoneTotal).toBe(0);
    expect(bInit.stoneRemaining).toBe(0);
    for (const s of SUITS) {
      expect(bInit.suitTotals[s]).toBe(13);
      expect(bInit.suitRemaining[s]).toBe(13);
      for (const r of RANKS) {
        expect(bInit.matrix[s][r]).toEqual({
          total: 1,
          remaining: 1,
          enhanced: 0,
          editioned: 0,
          sealed: 0,
        });
      }
    }

    const playing = dispatchSim(init, { type: 'SELECT_BLIND' }).state;
    const bPlay = getDeckBreakdown(playing);
    expect(bPlay.total).toBe(52);
    expect(bPlay.remaining).toBe(44);
    expect(
      SUITS.reduce((sum, s) => sum + bPlay.suitRemaining[s], 0) + bPlay.stoneRemaining
    ).toBe(44);
    expect(
      RANKS.reduce((sum, r) => sum + bPlay.rankRemaining[r], 0) + bPlay.stoneRemaining
    ).toBe(44);

    // 2. Checkered Deck: 26 Spades + 26 Hearts, 0 Clubs/Diamonds
    const checkered = startRun('b_checkered', 1, 'DECK_CHECK').state;
    const bCheck = getDeckBreakdown(checkered);
    expect(bCheck.suitTotals.Spades).toBe(26);
    expect(bCheck.suitTotals.Hearts).toBe(26);
    expect(bCheck.suitTotals.Clubs).toBe(0);
    expect(bCheck.suitTotals.Diamonds).toBe(0);

    // 3. Abandoned Deck: 40 total, 0 face cards
    const abandoned = startRun('b_abandoned', 1, 'DECK_ABAND').state;
    const bAband = getDeckBreakdown(abandoned);
    expect(bAband.total).toBe(40);
    expect(bAband.faceTotal).toBe(0);

    // 4. Medusa Challenge: 12 Stone cards (no rank/suit, never face), 40 ranked cards
    const medusa = startRun('b_red', 1, 'DECK_MEDUSA', 'c_medusa_1').state;
    const bMed = getDeckBreakdown(medusa);
    expect(bMed.total).toBe(52);
    expect(bMed.stoneTotal).toBe(12);
    expect(bMed.stoneRemaining).toBe(12);
    expect(bMed.enhancedTotal).toBe(12);
    expect(bMed.faceTotal).toBe(0);
    expect(bMed.rankTotals.King).toBe(0);
    expect(SUITS.reduce((sum, s) => sum + bMed.suitTotals[s], 0) + bMed.stoneTotal).toBe(52);

    // 5. Pareidolia counts all non-Stone cards as face cards (still excludes Stone)
    medusa.jokers = [makeJoker('j_pareidolia')];
    const bMedPar = getDeckBreakdown(medusa);
    expect(bMedPar.faceTotal).toBe(40);
    expect(bMedPar.stoneTotal).toBe(12);
  });

  it('tracks enhanced, editioned, sealed, and Stone cards accurately per cell and globally', () => {
    const state = startRun('b_red', 1, 'DECK_MODS').state;
    const c1 = makeCard('Ace', 'Spades', { enhancement: 'm_glass', edition: 'e_polychrome', seal: 'Red' });
    const c2 = makeCard('Ace', 'Spades', { enhancement: 'm_steel' });
    const c3 = makeCard('King', 'Hearts', { edition: 'e_foil', seal: 'Gold' });
    const stoneInDraw = makeCard('7', 'Clubs', { enhancement: 'm_stone', edition: 'e_holo' });
    const stoneInHand = makeCard('2', 'Diamonds', { enhancement: 'm_stone', seal: 'Blue' });

    state.fullDeck = [c1, c2, c3, stoneInDraw, stoneInHand];
    state.drawPile = [c1.id, c3.id, stoneInDraw.id];
    state.hand = [c2.id, stoneInHand.id];

    const bd = getDeckBreakdown(state);
    expect(bd.total).toBe(5);
    expect(bd.remaining).toBe(3);
    expect(bd.enhancedTotal).toBe(4); // glass, steel, 2 stones
    expect(bd.editionedTotal).toBe(3); // poly, foil, holo
    expect(bd.sealedTotal).toBe(3); // Red, Gold, Blue
    expect(bd.stoneTotal).toBe(2);
    expect(bd.stoneRemaining).toBe(1);
    expect(bd.faceTotal).toBe(1); // King of Hearts only
    expect(bd.faceRemaining).toBe(1);

    expect(bd.matrix.Spades.Ace).toEqual({
      total: 2,
      remaining: 1,
      enhanced: 2,
      editioned: 1,
      sealed: 1,
    });
    expect(bd.matrix.Hearts.King).toEqual({
      total: 1,
      remaining: 1,
      enhanced: 0,
      editioned: 1,
      sealed: 1,
    });
    // Stone cards do NOT pollute Clubs/7 or Diamonds/2
    expect(bd.matrix.Clubs['7'].total).toBe(0);
    expect(bd.matrix.Diamonds['2'].total).toBe(0);
  });
});

describe('previewSelectedHand & Sim Edge-Case Audit', () => {
  it('returns exact scoringCardIds for Stone, Splash, Four Fingers, Shortcut, and Smeared Joker', () => {
    const base = dispatchSim(startRun('b_red', 1, 'PREVIEW_MODS').state, {
      type: 'SELECT_BLIND',
    }).state;

    // 1. Stone card alwaysScores alongside a Pair (while non-scoring kicker is excluded)
    const p1 = makeCard('6', 'Spades');
    const p2 = makeCard('6', 'Hearts');
    const stone = makeCard('King', 'Clubs', { enhancement: 'm_stone' });
    const kicker = makeCard('3', 'Diamonds');
    setHandAndSelection(base, [p1, p2, stone, kicker], [0, 1, 2, 3]);
    const prevStone = previewSelectedHand(base)!;
    expect(prevStone.handId).toBe('Pair');
    expect(prevStone.scoringCardIds).toEqual([p1.id, p2.id, stone.id]);

    // 2. Splash makes kicker score too (unless Splash is debuffed!)
    base.jokers = [makeJoker('j_splash')];
    expect(previewSelectedHand(base)!.scoringCardIds).toEqual([p1.id, p2.id, stone.id, kicker.id]);
    base.jokers = [makeJoker('j_splash', { debuffed: true })];
    expect(previewSelectedHand(base)!.scoringCardIds).toEqual([p1.id, p2.id, stone.id]);

    // 3. Four Fingers: 4-card Flush excludes off-suit kicker
    const h1 = makeCard('2', 'Hearts');
    const h2 = makeCard('5', 'Hearts');
    const h3 = makeCard('9', 'Hearts');
    const h4 = makeCard('Queen', 'Hearts');
    const offSuit = makeCard('Ace', 'Spades');
    base.jokers = [makeJoker('j_four_fingers')];
    setHandAndSelection(base, [h1, h2, h3, h4, offSuit], [0, 1, 2, 3, 4]);
    const prevFF = previewSelectedHand(base)!;
    expect(prevFF.handId).toBe('Flush');
    expect(prevFF.scoringCardIds).toEqual([h1.id, h2.id, h3.id, h4.id]);

    // 4. Shortcut + Four Fingers: 4-card gapped straight
    const g1 = makeCard('Ace', 'Spades');
    const g2 = makeCard('3', 'Hearts');
    const g3 = makeCard('5', 'Clubs');
    const g4 = makeCard('7', 'Diamonds');
    const gKicker = makeCard('King', 'Spades');
    base.jokers = [makeJoker('j_shortcut'), makeJoker('j_four_fingers')];
    setHandAndSelection(base, [g1, g2, g3, g4, gKicker], [0, 1, 2, 3, 4]);
    const prevSC = previewSelectedHand(base)!;
    expect(prevSC.handId).toBe('Straight');
    expect(prevSC.scoringCardIds).toEqual([g1.id, g2.id, g3.id, g4.id]);

    // 5. Smeared Joker: mixed Hearts/Diamonds form Flush
    const r1 = makeCard('2', 'Hearts');
    const r2 = makeCard('4', 'Diamonds');
    const r3 = makeCard('7', 'Hearts');
    const r4 = makeCard('10', 'Diamonds');
    const r5 = makeCard('Ace', 'Hearts');
    base.jokers = [makeJoker('j_smeared')];
    setHandAndSelection(base, [r1, r2, r3, r4, r5], [0, 1, 2, 3, 4]);
    const prevSmeared = previewSelectedHand(base)!;
    expect(prevSmeared.handId).toBe('Flush');
    expect(prevSmeared.scoringCardIds).toEqual([r1.id, r2.id, r3.id, r4.id, r5.id]);
  });

  it('preserves boss debuff when DNA clones a debuffed Steel King under The Plant (but not under The Pillar)', () => {
    // Under The Plant, DNA cloning a debuffed Steel King creates a debuffed clone (no free Steel X1.5!)
    const plant = enterBossPlaying('bl_plant', 4, 'DNA_PLANT_EDGE');
    const debuffedSteelKing = makeCard('King', 'Spades', {
      enhancement: 'm_steel',
      debuffed: true,
    });
    plant.fullDeck = [debuffedSteelKing];
    plant.hand = [];
    plant.playArea = [debuffedSteelKing.id];
    plant.jokers = [makeJoker('j_dna')];
    const plantOut = scorePlayedHand(plant, [debuffedSteelKing]);
    expect(plant.fullDeck).toHaveLength(2);
    const clonedPlant = plant.fullDeck[1];
    expect(clonedPlant.debuffed).toBe(true);
    expect(plantOut.beats.some((b) => b.kind === 'card_held')).toBe(false);

    // Under The Pillar, a fresh clone was NOT played previously this Ante, so it is NOT debuffed!
    const pillar = enterBossPlaying('bl_pillar', 1, 'DNA_PILLAR_EDGE');
    const playedSteelKing = makeCard('King', 'Spades', {
      enhancement: 'm_steel',
      debuffed: true,
      playedThisAnte: true,
    });
    pillar.fullDeck = [playedSteelKing];
    pillar.hand = [];
    pillar.playArea = [playedSteelKing.id];
    pillar.jokers = [makeJoker('j_dna')];
    const pillarOut = scorePlayedHand(pillar, [playedSteelKing]);
    expect(pillar.fullDeck).toHaveLength(2);
    const clonedPillar = pillar.fullDeck[1];
    expect(clonedPillar.debuffed).toBe(false);
    expect(pillarOut.beats.some((b) => b.kind === 'card_held' && b.xMult === 1.5)).toBe(true);
  });
});
