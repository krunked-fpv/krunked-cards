import type { ChallengeDef } from '../contracts/index.ts';

export const CHALLENGES: ChallengeDef[] = [
  {
    key: 'c_omelette_1',
    name: 'The Omelette',
    order: 1,
    desc: 'Start with 5 Eggs. Earn no Blind reward money, no extra hand money, and no interest.',
    rules: {
      custom: [
        { id: 'no_reward' },
        { id: 'no_extra_hand_money' },
        { id: 'no_interest' },
      ],
      modifiers: [],
    },
    jokers: [
      { id: 'j_egg' },
      { id: 'j_egg' },
      { id: 'j_egg' },
      { id: 'j_egg' },
      { id: 'j_egg' },
    ],
    consumables: [],
    vouchers: [],
    deck: {
      type: 'Challenge Deck',
    },
    restrictions: {
      bannedCards: [
        'v_seed_money',
        'v_money_tree',
        'j_to_the_moon',
        'j_rocket',
        'j_golden',
        'j_satellite',
      ],
      bannedTags: [],
      bannedOther: [],
    },
  },
];

export const CHALLENGE_MAP: Record<string, ChallengeDef> = Object.fromEntries(
  CHALLENGES.map((c) => [c.key, c])
);
