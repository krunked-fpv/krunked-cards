import { describe, expect, it } from 'vitest';
import {
  RANK_CHIPS,
  type CardInstance,
  type EditionId,
  type EnhancementId,
  type JokerInstance,
  type Rank,
  type SealId,
  type SimState,
  type Suit,
} from '../src/contracts/index.ts';
import { JOKER_MAP } from '../src/data/index.ts';
import {
  dispatchSim,
  evaluatePokerHand,
  isCardFace,
  isCardSuit,
  resolveCopiedJoker,
  scorePlayedHand,
  startRun,
} from '../src/sim/index.ts';

let uidSeq = 1;

function makeCard(
  rank: Rank,
  suit: Suit,
  opts?: {
    id?: string;
    enhancement?: EnhancementId;
    edition?: EditionId;
    seal?: SealId;
    permaBonus?: number;
    debuffed?: boolean;
  }
): CardInstance {
  return {
    id: opts?.id ?? `tcard_${uidSeq++}`,
    suit,
    rank,
    enhancement: opts?.enhancement ?? 'none',
    edition: opts?.edition ?? 'none',
    seal: opts?.seal ?? 'none',
    permaBonus: opts?.permaBonus ?? 0,
    debuffed: opts?.debuffed ?? false,
    faceDown: false,
    playedThisAnte: false,
  };
}

function makeJoker(
  key: string,
  opts?: {
    id?: string;
    edition?: EditionId;
    debuffed?: boolean;
    eternal?: boolean;
    state?: Record<string, number | string | boolean | null>;
  }
): JokerInstance {
  const def = JOKER_MAP[key];
  return {
    id: opts?.id ?? `tjoker_${uidSeq++}`,
    key,
    edition: opts?.edition ?? 'none',
    eternal: opts?.eternal ?? false,
    perishable: false,
    perishableTally: 0,
    rental: false,
    debuffed: opts?.debuffed ?? false,
    faceDown: false,
    cost: def?.cost ?? 4,
    sellValue: Math.max(1, Math.floor((def?.cost ?? 4) / 2)),
    extraSellValue: 0,
    state: { ...(def?.config ?? {}), ...(opts?.state ?? {}) },
  };
}

function createScoringState(opts?: {
  deckId?: string;
  seed?: string;
  jokers?: JokerInstance[];
  heldCards?: CardInstance[];
  playedCards?: CardInstance[];
  vouchers?: string[];
  handsLeft?: number;
  targetChips?: number;
  roundChips?: number;
}): SimState {
  const { state } = startRun(opts?.deckId ?? 'b_red', 1, opts?.seed ?? 'SCORE_TEST_1');
  const entered = dispatchSim(state, { type: 'SELECT_BLIND' }).state;

  const played = opts?.playedCards ?? [];
  const held = opts?.heldCards ?? [];
  const customDeck = [...played, ...held];
  if (customDeck.length > 0) {
    entered.fullDeck = [...customDeck];
    entered.playArea = played.map((c) => c.id);
    entered.hand = held.map((c) => c.id);
    entered.drawPile = [];
    entered.discardPile = [];
    entered.selectedCardIds = [];
  }

  entered.jokers = opts?.jokers ?? [];
  if (opts?.vouchers) {
    entered.vouchers = [...opts.vouchers];
  }
  if (opts?.handsLeft !== undefined) {
    entered.handsLeft = opts.handsLeft;
  }
  if (opts?.targetChips !== undefined) {
    entered.targetChips = opts.targetChips;
    entered.blinds[entered.activeBlindSlot].targetChips = opts.targetChips;
  }
  if (opts?.roundChips !== undefined) {
    entered.roundChips = opts.roundChips;
  }
  return entered;
}

describe('Poker Hand Evaluator — All 12 Hands & Modifiers', () => {
  it('detects all 12 poker hands in strict hierarchy order and reports Royal Flush displayName', () => {
    // 1. Flush Five
    const flushFive = evaluatePokerHand([
      makeCard('Ace', 'Spades'),
      makeCard('Ace', 'Spades'),
      makeCard('Ace', 'Spades'),
      makeCard('Ace', 'Spades'),
      makeCard('Ace', 'Spades'),
    ]);
    expect(flushFive.handId).toBe('Flush Five');
    expect(flushFive.displayName).toBe('Flush Five');
    expect(flushFive.scoringCards).toHaveLength(5);
    expect(flushFive.containedHands).toEqual([
      'Flush Five',
      'Five of a Kind',
      'Four of a Kind',
      'Flush',
      'Three of a Kind',
      'Pair',
      'High Card',
    ]);

    // 2. Flush House
    const flushHouse = evaluatePokerHand([
      makeCard('King', 'Hearts'),
      makeCard('King', 'Hearts'),
      makeCard('King', 'Hearts'),
      makeCard('7', 'Hearts'),
      makeCard('7', 'Hearts'),
    ]);
    expect(flushHouse.handId).toBe('Flush House');
    expect(flushHouse.scoringCards).toHaveLength(5);
    expect(flushHouse.containedHands).toEqual([
      'Flush House',
      'Full House',
      'Flush',
      'Three of a Kind',
      'Two Pair',
      'Pair',
      'High Card',
    ]);

    // 3. Five of a Kind
    const fiveKind = evaluatePokerHand([
      makeCard('Queen', 'Spades'),
      makeCard('Queen', 'Hearts'),
      makeCard('Queen', 'Clubs'),
      makeCard('Queen', 'Diamonds'),
      makeCard('Queen', 'Spades'),
    ]);
    expect(fiveKind.handId).toBe('Five of a Kind');
    expect(fiveKind.scoringCards).toHaveLength(5);
    expect(fiveKind.containedHands).toContain('Four of a Kind');
    expect(fiveKind.containedHands).toContain('Three of a Kind');
    expect(fiveKind.containedHands).toContain('Pair');
    expect(fiveKind.containedHands).not.toContain('Flush');

    // 4a. Royal Flush (handId === 'Straight Flush', displayName === 'Royal Flush')
    const royalFlush = evaluatePokerHand([
      makeCard('10', 'Diamonds'),
      makeCard('Jack', 'Diamonds'),
      makeCard('Queen', 'Diamonds'),
      makeCard('King', 'Diamonds'),
      makeCard('Ace', 'Diamonds'),
    ]);
    expect(royalFlush.handId).toBe('Straight Flush');
    expect(royalFlush.displayName).toBe('Royal Flush');
    expect(royalFlush.scoringCards).toHaveLength(5);
    expect(royalFlush.containedHands).toEqual([
      'Straight Flush',
      'Flush',
      'Straight',
      'High Card',
    ]);

    // 4b. Non-Royal Straight Flush
    const straightFlush = evaluatePokerHand([
      makeCard('5', 'Clubs'),
      makeCard('6', 'Clubs'),
      makeCard('7', 'Clubs'),
      makeCard('8', 'Clubs'),
      makeCard('9', 'Clubs'),
    ]);
    expect(straightFlush.handId).toBe('Straight Flush');
    expect(straightFlush.displayName).toBe('Straight Flush');
    expect(straightFlush.scoringCards).toHaveLength(5);

    // 5. Four of a Kind (4 scoring, 1 kicker excluded)
    const kicker = makeCard('3', 'Clubs');
    const fourKind = evaluatePokerHand([
      makeCard('Jack', 'Spades'),
      makeCard('Jack', 'Hearts'),
      makeCard('Jack', 'Clubs'),
      makeCard('Jack', 'Diamonds'),
      kicker,
    ]);
    expect(fourKind.handId).toBe('Four of a Kind');
    expect(fourKind.scoringCards).toHaveLength(4);
    expect(fourKind.scoringCards.map((c) => c.id)).not.toContain(kicker.id);
    expect(fourKind.containedHands).toEqual([
      'Four of a Kind',
      'Three of a Kind',
      'Pair',
      'High Card',
    ]);

    // 6. Full House
    const fullHouse = evaluatePokerHand([
      makeCard('9', 'Spades'),
      makeCard('9', 'Hearts'),
      makeCard('9', 'Clubs'),
      makeCard('4', 'Diamonds'),
      makeCard('4', 'Spades'),
    ]);
    expect(fullHouse.handId).toBe('Full House');
    expect(fullHouse.scoringCards).toHaveLength(5);
    expect(fullHouse.containedHands).toEqual([
      'Full House',
      'Three of a Kind',
      'Two Pair',
      'Pair',
      'High Card',
    ]);

    // 7. Flush
    const flush = evaluatePokerHand([
      makeCard('2', 'Hearts'),
      makeCard('5', 'Hearts'),
      makeCard('8', 'Hearts'),
      makeCard('Jack', 'Hearts'),
      makeCard('Ace', 'Hearts'),
    ]);
    expect(flush.handId).toBe('Flush');
    expect(flush.scoringCards).toHaveLength(5);
    expect(flush.containedHands).toEqual(['Flush', 'High Card']);

    // 8a. Straight (high)
    const straight = evaluatePokerHand([
      makeCard('6', 'Spades'),
      makeCard('7', 'Hearts'),
      makeCard('8', 'Clubs'),
      makeCard('9', 'Diamonds'),
      makeCard('10', 'Spades'),
    ]);
    expect(straight.handId).toBe('Straight');
    expect(straight.scoringCards).toHaveLength(5);
    expect(straight.containedHands).toEqual(['Straight', 'High Card']);

    // 8b. Ace-low Straight (A-2-3-4-5 wrap)
    const wheel = evaluatePokerHand([
      makeCard('Ace', 'Spades'),
      makeCard('2', 'Hearts'),
      makeCard('3', 'Clubs'),
      makeCard('4', 'Diamonds'),
      makeCard('5', 'Spades'),
    ]);
    expect(wheel.handId).toBe('Straight');
    expect(wheel.scoringCards).toHaveLength(5);

    // 8c. Ace must NOT wrap around K-A-2-3-4
    const nonWrap = evaluatePokerHand([
      makeCard('Queen', 'Spades'),
      makeCard('King', 'Hearts'),
      makeCard('Ace', 'Clubs'),
      makeCard('2', 'Diamonds'),
      makeCard('3', 'Spades'),
    ]);
    expect(nonWrap.handId).toBe('High Card');

    // 9. Three of a Kind
    const trips = evaluatePokerHand([
      makeCard('8', 'Spades'),
      makeCard('8', 'Hearts'),
      makeCard('8', 'Diamonds'),
      makeCard('King', 'Clubs'),
      makeCard('2', 'Spades'),
    ]);
    expect(trips.handId).toBe('Three of a Kind');
    expect(trips.scoringCards).toHaveLength(3);
    expect(trips.containedHands).toEqual(['Three of a Kind', 'Pair', 'High Card']);

    // 10. Two Pair
    const twoPair = evaluatePokerHand([
      makeCard('Ace', 'Spades'),
      makeCard('Ace', 'Hearts'),
      makeCard('5', 'Clubs'),
      makeCard('5', 'Diamonds'),
      makeCard('9', 'Spades'),
    ]);
    expect(twoPair.handId).toBe('Two Pair');
    expect(twoPair.scoringCards).toHaveLength(4);
    expect(twoPair.containedHands).toEqual(['Two Pair', 'Pair', 'High Card']);

    // 11. Pair
    const pair = evaluatePokerHand([
      makeCard('10', 'Spades'),
      makeCard('10', 'Hearts'),
      makeCard('Ace', 'Clubs'),
      makeCard('4', 'Diamonds'),
      makeCard('2', 'Spades'),
    ]);
    expect(pair.handId).toBe('Pair');
    expect(pair.scoringCards).toHaveLength(2);
    expect(pair.containedHands).toEqual(['Pair', 'High Card']);

    // 12. High Card (only highest card scores)
    const ace = makeCard('Ace', 'Clubs');
    const highCard = evaluatePokerHand([
      makeCard('3', 'Spades'),
      ace,
      makeCard('7', 'Hearts'),
      makeCard('9', 'Diamonds'),
      makeCard('2', 'Spades'),
    ]);
    expect(highCard.handId).toBe('High Card');
    expect(highCard.scoringCards).toHaveLength(1);
    expect(highCard.scoringCards[0].id).toBe(ace.id);
    expect(highCard.containedHands).toEqual(['High Card']);
  });

  it('supports Four Fingers (4-card Flush, Straight, and Straight Flush)', () => {
    const ff = [makeJoker('j_four_fingers')];

    const flush4 = evaluatePokerHand(
      [
        makeCard('2', 'Hearts'),
        makeCard('6', 'Hearts'),
        makeCard('9', 'Hearts'),
        makeCard('King', 'Hearts'),
        makeCard('Ace', 'Spades'),
      ],
      ff
    );
    expect(flush4.handId).toBe('Flush');
    expect(flush4.scoringCards).toHaveLength(4);

    const straight4 = evaluatePokerHand(
      [
        makeCard('4', 'Spades'),
        makeCard('5', 'Hearts'),
        makeCard('6', 'Clubs'),
        makeCard('7', 'Diamonds'),
        makeCard('King', 'Spades'),
      ],
      ff
    );
    expect(straight4.handId).toBe('Straight');
    expect(straight4.scoringCards).toHaveLength(4);

    const sf4 = evaluatePokerHand(
      [
        makeCard('8', 'Spades'),
        makeCard('9', 'Spades'),
        makeCard('10', 'Spades'),
        makeCard('Jack', 'Spades'),
        makeCard('2', 'Hearts'),
      ],
      ff
    );
    expect(sf4.handId).toBe('Straight Flush');
    expect(sf4.scoringCards).toHaveLength(4);
    expect(sf4.containedHands).toContain('Flush');
    expect(sf4.containedHands).toContain('Straight');
  });

  it('supports Shortcut (1-rank gaps in Straights)', () => {
    const sc = [makeJoker('j_shortcut')];
    const gapped = evaluatePokerHand(
      [
        makeCard('2', 'Spades'),
        makeCard('4', 'Hearts'),
        makeCard('6', 'Clubs'),
        makeCard('8', 'Diamonds'),
        makeCard('10', 'Spades'),
      ],
      sc
    );
    expect(gapped.handId).toBe('Straight');
    expect(gapped.scoringCards).toHaveLength(5);

    // Without Shortcut, same hand is High Card
    const withoutSc = evaluatePokerHand(gapped.scoringCards, []);
    expect(withoutSc.handId).toBe('High Card');
  });

  it('supports Smeared Joker (Hearts == Diamonds, Spades == Clubs)', () => {
    const smeared = [makeJoker('j_smeared')];

    const redFlush = evaluatePokerHand(
      [
        makeCard('2', 'Hearts'),
        makeCard('5', 'Diamonds'),
        makeCard('8', 'Hearts'),
        makeCard('Jack', 'Diamonds'),
        makeCard('Ace', 'Hearts'),
      ],
      smeared
    );
    expect(redFlush.handId).toBe('Flush');

    const blackFlush = evaluatePokerHand(
      [
        makeCard('3', 'Spades'),
        makeCard('6', 'Clubs'),
        makeCard('9', 'Spades'),
        makeCard('Queen', 'Clubs'),
        makeCard('King', 'Spades'),
      ],
      smeared
    );
    expect(blackFlush.handId).toBe('Flush');

    expect(isCardSuit(makeCard('Ace', 'Hearts'), 'Diamonds', smeared)).toBe(true);
    expect(isCardSuit(makeCard('Ace', 'Spades'), 'Clubs', smeared)).toBe(true);
    expect(isCardSuit(makeCard('Ace', 'Hearts'), 'Spades', smeared)).toBe(false);
  });

  it('handles Stone Card (no rank/suit, never face, always scores), Wild Card, and Splash', () => {
    const stone = makeCard('King', 'Hearts', { enhancement: 'm_stone' });
    const pairCards = [
      makeCard('4', 'Spades'),
      makeCard('4', 'Clubs'),
      stone,
      makeCard('9', 'Diamonds'),
    ];
    // Stone card has no rank/suit and is NOT a face card even with Pareidolia
    expect(isCardFace(stone, [makeJoker('j_pareidolia')])).toBe(false);
    expect(isCardSuit(stone, 'Hearts', [])).toBe(false);

    // Stone card always scores alongside Pair
    const withStone = evaluatePokerHand(pairCards);
    expect(withStone.handId).toBe('Pair');
    expect(withStone.scoringCards).toHaveLength(3);
    expect(withStone.scoringCards.map((c) => c.id)).toContain(stone.id);

    // Five Stone cards cannot form Five of a Kind or Flush — they evaluate as High Card & all 5 score
    const fiveStones = Array.from({ length: 5 }, () =>
      makeCard('Ace', 'Spades', { enhancement: 'm_stone' })
    );
    const stonesEval = evaluatePokerHand(fiveStones);
    expect(stonesEval.handId).toBe('High Card');
    expect(stonesEval.scoringCards).toHaveLength(5);

    // Wild card matches all suits (when not debuffed)
    const wild = makeCard('7', 'Clubs', { enhancement: 'm_wild' });
    expect(isCardSuit(wild, 'Hearts', [])).toBe(true);
    expect(isCardSuit(wild, 'Spades', [])).toBe(true);
    const wildFlush = evaluatePokerHand([
      makeCard('2', 'Hearts'),
      makeCard('4', 'Hearts'),
      makeCard('9', 'Hearts'),
      makeCard('King', 'Hearts'),
      wild,
    ]);
    expect(wildFlush.handId).toBe('Flush');
    expect(wildFlush.scoringCards).toHaveLength(5);

    // Debuffed Wild card loses its wildcard suit property
    const debuffedWild = makeCard('7', 'Clubs', { enhancement: 'm_wild', debuffed: true });
    expect(isCardSuit(debuffedWild, 'Hearts', [])).toBe(false);

    // Splash makes EVERY played card score even on High Card
    const splashHand = [
      makeCard('2', 'Spades'),
      makeCard('5', 'Hearts'),
      makeCard('8', 'Clubs'),
      makeCard('Jack', 'Diamonds'),
      makeCard('Ace', 'Spades'),
    ];
    const withSplash = evaluatePokerHand(splashHand, [makeJoker('j_splash')]);
    expect(withSplash.handId).toBe('High Card');
    expect(withSplash.scoringCards).toHaveLength(5);
  });
});

describe('7-Step Scoring Pipeline — Exact Ordering & Mechanics', () => {
  it('enforces exact phase order: played cards -> held cards -> Jokers (Foil/Holo -> main -> Poly) -> Observatory -> Plasma', () => {
    const playedAce = makeCard('Ace', 'Spades');
    const heldSteelKing = makeCard('King', 'Hearts', { enhancement: 'm_steel' });
    const holoXMultJoker = makeJoker('j_cavendish', { edition: 'e_holo' }); // +10 Mult -> X3 Mult
    const polyPlusJoker = makeJoker('j_joker', { edition: 'e_polychrome' }); // +4 Mult -> X1.5 Mult
    const foilJoker = makeJoker('j_joker', { edition: 'e_foil' }); // +50 Chips -> +4 Mult

    const state = createScoringState({
      deckId: 'b_plasma',
      playedCards: [playedAce],
      heldCards: [heldSteelKing],
      jokers: [holoXMultJoker, polyPlusJoker, foilJoker],
      vouchers: ['v_observatory'],
    });
    // Add Pluto (High Card Planet) for Observatory X1.5 Mult
    state.consumables.push({
      id: 'cons_pluto',
      key: 'c_pluto',
      set: 'Planet',
      edition: 'none',
      cost: 3,
      sellValue: 1,
    });

    const out = scorePlayedHand(state, [playedAce]);

    // Step-by-step exact hand math:
    // 1. Base High Card Lv.1: 5 chips, 1 mult
    // 3. Played Ace of Spades: +11 chips -> 16 chips, 1 mult
    // 4. Held Steel King: X1.5 mult -> 16 chips, 1.5 mult
    // 5a. Joker 0 (Holo Cavendish): +10 mult -> 11.5; main X3 -> 34.5
    // 5b. Joker 1 (Poly Joker): main +4 -> 38.5; Poly X1.5 -> 57.75
    // 5c. Joker 2 (Foil Joker): Foil +50 chips -> 66; main +4 -> 61.75
    // 5d. Observatory (Pluto matches High Card): X1.5 -> 92.625
    // 6. Plasma Deck balance: floor((66 + 92.625) / 2) = floor(79.3125) = 79 -> 79 * 79 = 6241
    expect(state.currentHandChips).toBe(79);
    expect(state.currentHandMult).toBe(79);
    expect(out.handScore).toBe(6241);

    // Verify exact ScoreBeat ordering across pipeline stages
    const idxAnnounce = out.beats.findIndex((b) => b.kind === 'hand_announce');
    const idxPlayed = out.beats.findIndex((b) => b.kind === 'card_score');
    const idxHeld = out.beats.findIndex((b) => b.kind === 'card_held');
    const idxFirstJokerEdition = out.beats.findIndex(
      (b) => b.kind === 'edition_trigger' && b.sourceId === holoXMultJoker.id
    );
    const idxFirstJokerMain = out.beats.findIndex(
      (b) => b.kind === 'joker_trigger' && b.sourceId === holoXMultJoker.id
    );
    const idxSecondJokerMain = out.beats.findIndex(
      (b) => b.kind === 'joker_trigger' && b.sourceId === polyPlusJoker.id
    );
    const idxSecondJokerPoly = out.beats.findIndex(
      (b) => b.kind === 'edition_trigger' && b.sourceId === polyPlusJoker.id
    );
    const idxObservatory = out.beats.findIndex((b) => b.kind === 'consumable_trigger');
    const idxPlasma = out.beats.findIndex((b) => b.kind === 'plasma_balance');
    const idxTotal = out.beats.findIndex((b) => b.kind === 'hand_total');

    expect(idxAnnounce).toBe(0);
    expect(idxPlayed).toBeGreaterThan(idxAnnounce);
    expect(idxHeld).toBeGreaterThan(idxPlayed);
    expect(idxFirstJokerEdition).toBeGreaterThan(idxHeld);
    expect(idxFirstJokerMain).toBeGreaterThan(idxFirstJokerEdition);
    expect(idxSecondJokerMain).toBeGreaterThan(idxFirstJokerMain);
    expect(idxSecondJokerPoly).toBeGreaterThan(idxSecondJokerMain);
    expect(idxObservatory).toBeGreaterThan(idxSecondJokerPoly);
    expect(idxPlasma).toBeGreaterThan(idxObservatory);
    expect(idxTotal).toBeGreaterThan(idxPlasma);
  });

  it('orders Jokers left-to-right (+Mult before XMult yields higher score than XMult before +Mult)', () => {
    const cardA = makeCard('10', 'Clubs');
    const stateAddFirst = createScoringState({
      playedCards: [cardA],
      jokers: [makeJoker('j_joker'), makeJoker('j_cavendish')],
    });
    const outAddFirst = scorePlayedHand(stateAddFirst, [cardA]);
    // Base 5+10=15 chips; Mult: (1 + 4) * 3 = 15 -> 225
    expect(outAddFirst.handScore).toBe(225);

    const cardB = makeCard('10', 'Clubs');
    const stateMulFirst = createScoringState({
      playedCards: [cardB],
      jokers: [makeJoker('j_cavendish'), makeJoker('j_joker')],
    });
    const outMulFirst = scorePlayedHand(stateMulFirst, [cardB]);
    // Base 15 chips; Mult: (1 * 3) + 4 = 7 -> 105
    expect(outMulFirst.handScore).toBe(105);
    expect(outAddFirst.handScore).toBeGreaterThan(outMulFirst.handScore);
  });

  it('triggers played-card retriggers: Red Seal, Hanging Chad, Sock & Buskin, Hack, Dusk, and Seltzer', () => {
    // 1. Red Seal (+1) + Hanging Chad (+2 on first scoring card) + Sock & Buskin (+1 on face)
    const king = makeCard('King', 'Spades', { seal: 'Red' });
    const s1 = createScoringState({
      playedCards: [king],
      jokers: [makeJoker('j_hanging_chad'), makeJoker('j_sock_and_buskin')],
    });
    const out1 = scorePlayedHand(s1, [king]);
    // Total triggers = 1 base + 1 Red Seal + 2 Hanging Chad + 1 Sock & Buskin = 5 triggers * 10 chips = +50 chips
    // High Card base 5 chips + 50 = 55 chips, Mult = 1 -> 55
    const scoreBeats1 = out1.beats.filter((b) => b.kind === 'card_score' && b.sourceId === king.id);
    expect(scoreBeats1).toHaveLength(5);
    expect(out1.handScore).toBe(55);

    // 2. Hack (+1 on 2/3/4/5) + Dusk (+1 on final hand, handsLeft === 0) + Seltzer (+1 on all cards, decrements)
    const four = makeCard('4', 'Hearts');
    const seltzer = makeJoker('j_selzer', { state: { extra: 1 } });
    const s2 = createScoringState({
      playedCards: [four],
      jokers: [makeJoker('j_hack'), makeJoker('j_dusk'), seltzer],
      handsLeft: 0,
    });
    const out2 = scorePlayedHand(s2, [four]);
    // Total triggers = 1 base + 1 Hack + 1 Dusk + 1 Seltzer = 4 triggers * 4 chips = +16 chips
    // Base 5 + 16 = 21 chips, Mult = 1 -> 21
    const scoreBeats2 = out2.beats.filter((b) => b.kind === 'card_score' && b.sourceId === four.id);
    expect(scoreBeats2).toHaveLength(4);
    expect(out2.handScore).toBe(21);
    // Seltzer had 1 remaining -> self-destructs during `after` step!
    expect(s2.jokers.some((j) => j.key === 'j_selzer')).toBe(false);
  });

  it('evaluates held-in-hand cards with Steel, Baron, Shoot the Moon, Raised Fist, and Mime retriggers', () => {
    const played = makeCard('Ace', 'Clubs');
    const heldKingSteel = makeCard('King', 'Spades', { enhancement: 'm_steel' });
    const heldQueen = makeCard('Queen', 'Hearts');
    const heldLowLeft = makeCard('5', 'Diamonds');
    const heldLowRight = makeCard('5', 'Clubs'); // Tied lowest rank -> rightmost triggers Raised Fist (+10 Mult)

    const state = createScoringState({
      playedCards: [played],
      heldCards: [heldKingSteel, heldQueen, heldLowLeft, heldLowRight],
      jokers: [
        makeJoker('j_baron'),
        makeJoker('j_shoot_the_moon'),
        makeJoker('j_raised_fist'),
        makeJoker('j_mime'),
      ],
    });

    const out = scorePlayedHand(state, [played]);

    // Step-by-step exact held-card math with Mime (2 triggers per held card):
    // Base High Card: 5 chips, 1 mult. Played Ace: +11 -> 16 chips, 1 mult.
    // 1) heldKingSteel (2 triggers): each trigger does Steel (x1.5) then Baron (x1.5) -> * 2.25 per trigger -> * 5.0625 total!
    //    mult = 1 * 1.5 * 1.5 * 1.5 * 1.5 = 5.0625
    // 2) heldQueen (2 triggers): Shoot the Moon +13 twice -> 5.0625 + 26 = 31.0625
    // 3) heldLowLeft (rank 5): NOT rightmost lowest -> 0
    // 4) heldLowRight (rank 5, rightmost lowest, 2 triggers): Raised Fist +(2 * RANK_CHIPS['5']) = +10 twice -> 51.0625
    // Total score = floor(16 * 51.0625) = 817
    expect(RANK_CHIPS['5'] * 2).toBe(10);
    expect(state.currentHandChips).toBe(16);
    expect(state.currentHandMult).toBeCloseTo(51.0625, 6);
    expect(out.handScore).toBe(817);
  });

  it('guards Blueprint and Brainstorm cycles cleanly while supporting valid chains', () => {
    // 1. Direct cycle: [Blueprint, Brainstorm] (Blueprint -> index 1 Brainstorm -> index 0 Blueprint)
    const bp = makeJoker('j_blueprint');
    const bs = makeJoker('j_brainstorm');
    expect(resolveCopiedJoker([bp, bs], 0)).toBeNull();
    expect(resolveCopiedJoker([bp, bs], 1)).toBeNull();

    // Self-loop: Brainstorm in leftmost slot 0
    expect(resolveCopiedJoker([bs], 0)).toBeNull();

    // Scoring with mutual cycle never loops infinitely and scores cleanly
    const played = makeCard('Ace', 'Spades');
    const cycleState = createScoringState({
      playedCards: [played],
      jokers: [bp, bs],
    });
    const cycleOut = scorePlayedHand(cycleState, [played]);
    expect(cycleOut.handScore).toBe(16); // Just High Card (5) + Ace (11)

    // 2. Valid chain: [Joker (+4), Blueprint -> Cav (X3), Cavendish (X3), Brainstorm -> Joker (+4)]
    const j1 = makeJoker('j_joker');
    const bp2 = makeJoker('j_blueprint');
    const cav = makeJoker('j_cavendish');
    const bs2 = makeJoker('j_brainstorm');
    expect(resolveCopiedJoker([j1, bp2, cav, bs2], 1)?.target.id).toBe(cav.id);
    expect(resolveCopiedJoker([j1, bp2, cav, bs2], 3)?.target.id).toBe(j1.id);

    const card2 = makeCard('10', 'Hearts');
    const chainState = createScoringState({
      playedCards: [card2],
      jokers: [j1, bp2, cav, bs2],
    });
    const chainOut = scorePlayedHand(chainState, [card2]);
    // Chips: 5 + 10 = 15
    // Mult: 1 -> j1 (+4 = 5) -> bp2 copies cav (X3 = 15) -> cav (X3 = 45) -> bs2 copies j1 (+4 = 49)
    expect(chainOut.handScore).toBe(15 * 49);
  });

  it('handles Glass Card X2 Mult and 1/4 shatter scaled by Oops! All 6s', () => {
    // With 2 copies of Oops! All 6s, probability multiplier = 2^2 = 4 -> 4/4 = 100% deterministic shatter!
    const glassCard = makeCard('Queen', 'Diamonds', { enhancement: 'm_glass' });
    const sGuaranteed = createScoringState({
      playedCards: [glassCard],
      jokers: [makeJoker('j_oops'), makeJoker('j_oops')],
    });
    const out = scorePlayedHand(sGuaranteed, [glassCard]);

    // Base High Card 5 + Queen 10 = 15 chips; Mult 1 * 2 (Glass) = 2 -> 30
    expect(out.handScore).toBe(30);
    expect(out.beats.some((b) => b.kind === 'card_shatter' && b.sourceId === glassCard.id)).toBe(true);
    expect(sGuaranteed.fullDeck.some((c) => c.id === glassCard.id)).toBe(false);
    expect(sGuaranteed.tracking.cardsDestroyedTotal).toBe(1);
    expect(out.events.some((e) => e.type === 'CARD_DESTROYED')).toBe(true);

    // Without Oops! All 6s, empirical shatter rate across 200 seeds stays close to 1/4 (25%)
    let shatters = 0;
    for (let i = 0; i < 200; i++) {
      const g = makeCard('King', 'Clubs', { enhancement: 'm_glass' });
      const st = createScoringState({ seed: `GLASS_RATE_${i}`, playedCards: [g] });
      scorePlayedHand(st, [g]);
      if (st.tracking.cardsDestroyedTotal > 0) shatters++;
    }
    expect(shatters).toBeGreaterThan(25);
    expect(shatters).toBeLessThan(80);
  });

  it('rescues on Mr. Bones when score >= 25% of target on final hand and fails when < 25%', () => {
    // Rescue case: target = 400, roundChips already 85 + Ace High Card (16) = 101 >= 100 (25%)
    const ace = makeCard('Ace', 'Spades');
    const rescueState = createScoringState({
      playedCards: [ace],
      jokers: [makeJoker('j_mr_bones')],
      handsLeft: 0,
      targetChips: 400,
      roundChips: 85,
    });
    const rescueOut = scorePlayedHand(rescueState, [ace]);
    expect(rescueState.roundChips).toBe(101);
    expect(rescueOut.savedByMrBones).toBe(true);
    expect(rescueOut.blindCleared).toBe(true);
    expect(rescueOut.beats.some((b) => b.kind === 'mr_bones_save')).toBe(true);
    expect(rescueState.jokers.some((j) => j.key === 'j_mr_bones')).toBe(false);

    // Transition through FINISH_SCORING -> CASHOUT
    rescueState.phase = 'SCORING';
    const afterRescue = dispatchSim(rescueState, { type: 'FINISH_SCORING' }).state;
    expect(afterRescue.phase).toBe('CASHOUT');

    // Failure case: target = 400, roundChips 80 + Ace High Card (16) = 96 < 100 (25%)
    const ace2 = makeCard('Ace', 'Spades');
    const failState = createScoringState({
      playedCards: [ace2],
      jokers: [makeJoker('j_mr_bones')],
      handsLeft: 0,
      targetChips: 400,
      roundChips: 80,
    });
    const failOut = scorePlayedHand(failState, [ace2]);
    expect(failState.roundChips).toBe(96);
    expect(failOut.savedByMrBones).toBe(false);
    expect(failOut.blindCleared).toBe(false);
    expect(failState.jokers.some((j) => j.key === 'j_mr_bones')).toBe(true);

    failState.phase = 'SCORING';
    const afterFail = dispatchSim(failState, { type: 'FINISH_SCORING' }).state;
    expect(afterFail.phase).toBe('GAME_OVER');
  });
});
