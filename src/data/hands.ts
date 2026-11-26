import type { PokerHandDef, PokerHandId } from '../contracts/index.ts';

export const POKER_HANDS: PokerHandDef[] = [
  {
    id: 'Flush Five',
    order: 1,
    baseChips: 160,
    baseMult: 16,
    lChips: 50,
    lMult: 3,
    visible: false,
    example: 'A♠ A♠ A♠ A♠ A♠',
    desc: '5 cards with the same rank and suit',
  },
  {
    id: 'Flush House',
    order: 2,
    baseChips: 140,
    baseMult: 14,
    lChips: 40,
    lMult: 4,
    visible: false,
    example: '7♦ 7♦ 7♦ 4♦ 4♦',
    desc: 'A Three of a Kind and a Pair with all cards sharing the same suit',
  },
  {
    id: 'Five of a Kind',
    order: 3,
    baseChips: 120,
    baseMult: 12,
    lChips: 35,
    lMult: 3,
    visible: false,
    example: 'A♠ A♥ A♥ A♣ A♦',
    desc: '5 cards with the same rank',
  },
  {
    id: 'Straight Flush',
    order: 4,
    baseChips: 100,
    baseMult: 8,
    lChips: 40,
    lMult: 4,
    visible: true,
    example: 'Q♠ J♠ 10♠ 9♠ 8♠',
    desc: '5 cards in a row (consecutive ranks) with all cards sharing the same suit',
  },
  {
    id: 'Four of a Kind',
    order: 5,
    baseChips: 60,
    baseMult: 7,
    lChips: 30,
    lMult: 3,
    visible: true,
    example: 'J♠ J♥ J♣ J♦ 3♣',
    desc: '4 cards with the same rank. They may be played with 1 other unscored card',
  },
  {
    id: 'Full House',
    order: 6,
    baseChips: 40,
    baseMult: 4,
    lChips: 25,
    lMult: 2,
    visible: true,
    example: 'K♥ K♣ K♦ 2♠ 2♦',
    desc: 'A Three of a Kind and a Pair',
  },
  {
    id: 'Flush',
    order: 7,
    baseChips: 35,
    baseMult: 4,
    lChips: 15,
    lMult: 2,
    visible: true,
    example: 'A♥ K♥ 10♥ 5♥ 4♥',
    desc: '5 cards that share the same suit',
  },
  {
    id: 'Straight',
    order: 8,
    baseChips: 30,
    baseMult: 4,
    lChips: 30,
    lMult: 3,
    visible: true,
    example: 'J♦ 10♣ 9♣ 8♠ 7♥',
    desc: '5 cards in a row (consecutive ranks)',
  },
  {
    id: 'Three of a Kind',
    order: 9,
    baseChips: 30,
    baseMult: 3,
    lChips: 20,
    lMult: 2,
    visible: true,
    example: '10♠ 10♣ 10♦ 6♥ 5♦',
    desc: '3 cards with the same rank. They may be played with up to 2 other unscored cards',
  },
  {
    id: 'Two Pair',
    order: 10,
    baseChips: 20,
    baseMult: 2,
    lChips: 20,
    lMult: 1,
    visible: true,
    example: 'A♥ A♦ Q♣ 4♥ 4♣',
    desc: '2 pairs of cards with different ranks, may be played with 1 other unscored card',
  },
  {
    id: 'Pair',
    order: 11,
    baseChips: 10,
    baseMult: 2,
    lChips: 15,
    lMult: 1,
    visible: true,
    example: 'K♠ 9♠ 9♦ 6♥ 3♦',
    desc: '2 cards that share the same rank. They may be played with up to 3 other unscored cards',
  },
  {
    id: 'High Card',
    order: 12,
    baseChips: 5,
    baseMult: 1,
    lChips: 10,
    lMult: 1,
    visible: true,
    example: 'A♠ Q♦ 9♦ 4♣ 3♦',
    desc: 'If the played hand is not any of the above hands, only the highest ranked card scores',
  },
];

export const POKER_HAND_MAP: Record<PokerHandId, PokerHandDef> = Object.fromEntries(
  POKER_HANDS.map((h) => [h.id, h])
) as Record<PokerHandId, PokerHandDef>;

export const BLIND_AMOUNTS = {
  scaling1: [300, 800, 2000, 5000, 11000, 20000, 35000, 50000],
  scaling2: [300, 900, 2600, 8000, 20000, 36000, 60000, 100000],
  scaling3: [300, 1000, 3200, 9000, 25000, 60000, 110000, 200000],
};

export function getBlindAmount(ante: number, scaling: 1 | 2 | 3 = 1): number {
  if (ante < 1) return 100;
  const arr =
    scaling === 3
      ? BLIND_AMOUNTS.scaling3
      : scaling === 2
        ? BLIND_AMOUNTS.scaling2
        : BLIND_AMOUNTS.scaling1;
  if (ante <= 8) return arr[ante - 1];
  const a = arr[7];
  const c = ante - 8;
  const d = 1 + 0.2 * c;
  const raw = Math.floor(a * Math.pow(1.6 + Math.pow(0.75 * c, d), c));
  if (!Number.isFinite(raw) || raw <= 0) return Number.MAX_SAFE_INTEGER;
  const pow10 = Math.pow(10, Math.floor(Math.log10(raw) - 1));
  if (!Number.isFinite(pow10) || pow10 <= 0) return raw;
  return raw - (raw % pow10);
}
