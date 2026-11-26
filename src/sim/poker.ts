import {
  RANK_VALUES,
  SUITS,
  type CardInstance,
  type HandEvaluationResult,
  type HandPreview,
  type JokerInstance,
  type PokerHandId,
  type Rank,
  type SimState,
  type Suit,
} from '../contracts/index.ts';

function hasActiveJoker(jokers: readonly JokerInstance[], key: string): boolean {
  for (let i = 0; i < jokers.length; i++) {
    if (jokers[i].key === key && !jokers[i].debuffed) return true;
  }
  return false;
}

/**
 * Returns true if card counts as a face card under current Jokers.
 * Stone cards NEVER count as face cards (even with Pareidolia).
 */
export function isCardFace(card: CardInstance, jokers: JokerInstance[]): boolean {
  if (card.enhancement === 'm_stone') return false;
  if (hasActiveJoker(jokers, 'j_pareidolia')) return true;
  return card.rank === 'Jack' || card.rank === 'Queen' || card.rank === 'King';
}

/**
 * Returns true if card matches the target suit under current Jokers.
 * Respects Stone (no suit), Wild (any suit when not debuffed), and Smeared Joker.
 */
export function isCardSuit(card: CardInstance, suit: Suit, jokers: JokerInstance[]): boolean {
  if (card.enhancement === 'm_stone') return false;
  if (card.enhancement === 'm_wild' && !card.debuffed) return true;
  if (card.suit === suit) return true;
  if (hasActiveJoker(jokers, 'j_smeared')) {
    const isRedCard = card.suit === 'Hearts' || card.suit === 'Diamonds';
    const isRedTarget = suit === 'Hearts' || suit === 'Diamonds';
    return isRedCard === isRedTarget;
  }
  return false;
}

function getFlushCards(
  rankedCards: readonly CardInstance[],
  jokers: JokerInstance[],
  needed: number
): CardInstance[] | null {
  if (rankedCards.length < needed) return null;
  let best: CardInstance[] | null = null;
  for (let s = 0; s < SUITS.length; s++) {
    const suit = SUITS[s];
    const matches: CardInstance[] = [];
    for (let i = 0; i < rankedCards.length; i++) {
      if (isCardSuit(rankedCards[i], suit, jokers)) {
        matches.push(rankedCards[i]);
      }
    }
    if (matches.length >= needed) {
      if (!best || matches.length > best.length) {
        best = matches;
      }
    }
  }
  return best;
}

interface StraightResult {
  cards: CardInstance[];
  isRoyal: boolean;
}

function getStraightCards(
  rankedCards: readonly CardInstance[],
  needed: number,
  allowGap: boolean
): StraightResult | null {
  if (rankedCards.length < needed) return null;
  const maxStep = allowGap ? 2 : 1;

  // Bucket cards by numeric rank value (2..14), plus Ace mirrored at 1 for A-2-3-4-5 wraparound
  const byVal = new Map<number, CardInstance[]>();
  for (let i = 0; i < rankedCards.length; i++) {
    const card = rankedCards[i];
    const v = RANK_VALUES[card.rank];
    let list = byVal.get(v);
    if (!list) {
      list = [];
      byVal.set(v, list);
    }
    list.push(card);
    if (v === 14) {
      let lowList = byVal.get(1);
      if (!lowList) {
        lowList = [];
        byVal.set(1, lowList);
      }
      lowList.push(card);
    }
  }

  let bestVals: number[] | null = null;

  for (let start = 14; start >= 1; start--) {
    if (!byVal.has(start)) continue;
    const run: number[] = [start];
    let curr = start;
    const usedHighAce = start === 14;

    while (curr > 1) {
      let nextVal = -1;
      for (let step = 1; step <= maxStep; step++) {
        const candidate = curr - step;
        if (candidate < 1) break;
        // Never allow the same Ace rank as both 14 and 1 in the same straight
        if (candidate === 1 && usedHighAce) continue;
        if (byVal.has(candidate)) {
          nextVal = candidate;
          break;
        }
      }
      if (nextVal === -1) break;
      run.push(nextVal);
      curr = nextVal;
    }

    if (run.length >= needed) {
      if (!bestVals || run.length > bestVals.length || (run.length === bestVals.length && run[0] > bestVals[0])) {
        bestVals = run;
      }
    }
  }

  if (!bestVals) return null;

  const idSet = new Set<string>();
  for (let i = 0; i < bestVals.length; i++) {
    const bucket = byVal.get(bestVals[i]);
    if (!bucket) continue;
    for (let j = 0; j < bucket.length; j++) {
      idSet.add(bucket[j].id);
    }
  }

  const straightCards = rankedCards.filter((c) => idSet.has(c.id));
  const isRoyal = bestVals.every((v) => v >= 10);
  return { cards: straightCards, isRoyal };
}

/**
 * Exact 12-hand poker evaluator supporting Stone, Wild, Smeared Joker,
 * Four Fingers, Shortcut, and Splash, with accurate containedHands reporting.
 */
export function evaluatePokerHand(
  cards: CardInstance[],
  jokers: JokerInstance[] = []
): HandEvaluationResult {
  if (cards.length === 0) {
    return {
      handId: 'High Card',
      displayName: 'High Card',
      scoringCards: [],
      containedHands: ['High Card'],
    };
  }

  const fourFingers = hasActiveJoker(jokers, 'j_four_fingers');
  const shortcut = hasActiveJoker(jokers, 'j_shortcut');
  const splash = hasActiveJoker(jokers, 'j_splash');
  const neededForRun = fourFingers ? 4 : 5;

  const stoneCards: CardInstance[] = [];
  const rankedCards: CardInstance[] = [];
  for (let i = 0; i < cards.length; i++) {
    if (cards[i].enhancement === 'm_stone') {
      stoneCards.push(cards[i]);
    } else {
      rankedCards.push(cards[i]);
    }
  }

  // Group ranked cards by rank
  const rankMap = new Map<Rank, CardInstance[]>();
  for (let i = 0; i < rankedCards.length; i++) {
    const c = rankedCards[i];
    let list = rankMap.get(c.rank);
    if (!list) {
      list = [];
      rankMap.set(c.rank, list);
    }
    list.push(c);
  }

  const groups = Array.from(rankMap.entries())
    .map(([rank, groupCards]) => ({ rank, value: RANK_VALUES[rank], cards: groupCards }))
    .sort((a, b) => {
      if (b.cards.length !== a.cards.length) return b.cards.length - a.cards.length;
      return b.value - a.value;
    });

  const fiveOfAKind = groups.length > 0 && groups[0].cards.length >= 5 ? groups[0].cards : null;
  const fourOfAKind = groups.length > 0 && groups[0].cards.length >= 4 ? groups[0].cards : null;
  const threeOfAKind = groups.length > 0 && groups[0].cards.length >= 3 ? groups[0].cards : null;
  const pair = groups.length > 0 && groups[0].cards.length >= 2 ? groups[0].cards : null;
  const twoPair =
    groups.length >= 2 && groups[0].cards.length >= 2 && groups[1].cards.length >= 2
      ? [...groups[0].cards, ...groups[1].cards]
      : null;
  const fullHouse =
    groups.length >= 2 && groups[0].cards.length >= 3 && groups[1].cards.length >= 2
      ? [...groups[0].cards, ...groups[1].cards]
      : null;

  let highestCard: CardInstance | null = null;
  for (let i = 0; i < rankedCards.length; i++) {
    const c = rankedCards[i];
    if (!highestCard || RANK_VALUES[c.rank] > RANK_VALUES[highestCard.rank]) {
      highestCard = c;
    }
  }

  const flushCards = getFlushCards(rankedCards, jokers, neededForRun);
  const straightResult = getStraightCards(rankedCards, neededForRun, shortcut);
  const straightCards = straightResult ? straightResult.cards : null;

  const isFlushFive = fiveOfAKind !== null && flushCards !== null;
  const isFlushHouse = fullHouse !== null && flushCards !== null;
  const isStraightFlush = straightCards !== null && flushCards !== null;

  // Build exact containedHands list in hierarchy order
  const containedHands: PokerHandId[] = [];
  if (isFlushFive) containedHands.push('Flush Five');
  if (isFlushHouse) containedHands.push('Flush House');
  if (fiveOfAKind) containedHands.push('Five of a Kind');
  if (isStraightFlush) containedHands.push('Straight Flush');
  if (fourOfAKind) containedHands.push('Four of a Kind');
  if (fullHouse) containedHands.push('Full House');
  if (flushCards) containedHands.push('Flush');
  if (straightCards) containedHands.push('Straight');
  if (threeOfAKind) containedHands.push('Three of a Kind');
  if (twoPair) containedHands.push('Two Pair');
  if (pair) containedHands.push('Pair');
  containedHands.push('High Card');

  let handId: PokerHandId = 'High Card';
  let displayName = 'High Card';
  let baseScoring: CardInstance[] = highestCard ? [highestCard] : [];

  if (isFlushFive) {
    handId = 'Flush Five';
    displayName = 'Flush Five';
    baseScoring = [...fiveOfAKind, ...flushCards];
  } else if (isFlushHouse) {
    handId = 'Flush House';
    displayName = 'Flush House';
    baseScoring = [...fullHouse, ...flushCards];
  } else if (fiveOfAKind) {
    handId = 'Five of a Kind';
    displayName = 'Five of a Kind';
    baseScoring = fiveOfAKind;
  } else if (isStraightFlush) {
    handId = 'Straight Flush';
    displayName = straightResult?.isRoyal ? 'Royal Flush' : 'Straight Flush';
    baseScoring = [...straightCards, ...flushCards];
  } else if (fourOfAKind) {
    handId = 'Four of a Kind';
    displayName = 'Four of a Kind';
    baseScoring = fourOfAKind;
  } else if (fullHouse) {
    handId = 'Full House';
    displayName = 'Full House';
    baseScoring = fullHouse;
  } else if (flushCards) {
    handId = 'Flush';
    displayName = 'Flush';
    baseScoring = flushCards;
  } else if (straightCards) {
    handId = 'Straight';
    displayName = 'Straight';
    baseScoring = straightCards;
  } else if (threeOfAKind) {
    handId = 'Three of a Kind';
    displayName = 'Three of a Kind';
    baseScoring = threeOfAKind;
  } else if (twoPair) {
    handId = 'Two Pair';
    displayName = 'Two Pair';
    baseScoring = twoPair;
  } else if (pair) {
    handId = 'Pair';
    displayName = 'Pair';
    baseScoring = pair;
  }

  const scoringIds = new Set<string>();
  for (let i = 0; i < baseScoring.length; i++) {
    scoringIds.add(baseScoring[i].id);
  }
  // Stone cards always count in scoring
  for (let i = 0; i < stoneCards.length; i++) {
    scoringIds.add(stoneCards[i].id);
  }
  // Splash makes every played card count in scoring
  if (splash) {
    for (let i = 0; i < cards.length; i++) {
      scoringIds.add(cards[i].id);
    }
  }

  // Preserve left-to-right played card order
  const scoringCards = cards.filter((c) => scoringIds.has(c.id));

  return {
    handId,
    displayName,
    scoringCards,
    containedHands,
  };
}

/**
 * Preview poker hand for currently selected hand cards without mutating state.
 */
export function previewSelectedHand(state: SimState): HandPreview | null {
  if (state.selectedCardIds.length === 0) return null;
  const selectedSet = new Set(state.selectedCardIds);
  const deckById = new Map<string, CardInstance>();
  for (let i = 0; i < state.fullDeck.length; i++) {
    deckById.set(state.fullDeck[i].id, state.fullDeck[i]);
  }

  // Order selected cards according to their left-to-right position in hand
  const selectedCards: CardInstance[] = [];
  for (let i = 0; i < state.hand.length; i++) {
    const id = state.hand[i];
    if (selectedSet.has(id)) {
      const card = deckById.get(id);
      if (card) selectedCards.push(card);
    }
  }

  if (selectedCards.length === 0) return null;

  const evalRes = evaluatePokerHand(selectedCards, state.jokers);
  const hl = state.handLevels[evalRes.handId];
  return {
    handId: evalRes.handId,
    displayName: evalRes.displayName,
    baseChips: hl ? hl.chips : 5,
    baseMult: hl ? hl.mult : 1,
    level: hl ? hl.level : 1,
    scoringCardIds: evalRes.scoringCards.map((c) => c.id),
  };
}
