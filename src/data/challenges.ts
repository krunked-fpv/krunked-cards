import type { ChallengeDef, EditionId, EnhancementId, SealId } from '../contracts/index.ts';

type ShortSuit = 'H' | 'D' | 'S' | 'C';
type ChallengeCardSpec = {
  s: ShortSuit;
  r: string;
  e?: EnhancementId;
  d?: EditionId;
  g?: SealId;
};

const CHALLENGE_SUIT_ORDER: readonly ShortSuit[] = ['D', 'C', 'H', 'S'];
const FULL_RANKS: readonly string[] = [
  '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A',
];
const FACE_SHORT_RANKS = new Set(['J', 'Q', 'K']);

function buildChallengeCards(
  ranks: readonly string[],
  decorate?: (suit: ShortSuit, rank: string) => Partial<Pick<ChallengeCardSpec, 'e' | 'd' | 'g'>>
): ChallengeCardSpec[] {
  const out: ChallengeCardSpec[] = [];
  for (let s = 0; s < CHALLENGE_SUIT_ORDER.length; s++) {
    const suit = CHALLENGE_SUIT_ORDER[s];
    for (let r = 0; r < ranks.length; r++) {
      const rank = ranks[r];
      const extra = decorate ? decorate(suit, rank) : undefined;
      const entry: ChallengeCardSpec = { s: suit, r: rank };
      if (extra?.e) entry.e = extra.e;
      if (extra?.d) entry.d = extra.d;
      if (extra?.g) entry.g = extra.g;
      out.push(entry);
    }
  }
  return out;
}

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
  {
    key: 'c_city_1',
    name: '15 Minute City',
    order: 2,
    desc: 'Start with Eternal Ride the Bus and Eternal Shortcut. Deck has no Aces, 2s, or 3s, and double face cards.',
    rules: {
      custom: [],
      modifiers: [],
    },
    jokers: [
      { id: 'j_ride_the_bus', eternal: true },
      { id: 'j_shortcut', eternal: true },
    ],
    consumables: [],
    vouchers: [],
    deck: {
      type: 'Challenge Deck',
      cards: buildChallengeCards([
        '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'J', 'Q', 'K',
      ]),
    },
    restrictions: {
      bannedCards: [],
      bannedTags: [],
      bannedOther: [],
    },
  },
  {
    key: 'c_rich_1',
    name: 'Rich get Richer',
    order: 3,
    desc: 'Start with $100, Seed Money, and Money Tree. Chips cannot exceed current $.',
    rules: {
      custom: [{ id: 'chips_dollar_cap' }],
      modifiers: [{ id: 'dollars', value: 100 }],
    },
    jokers: [],
    consumables: [],
    vouchers: [{ id: 'v_seed_money' }, { id: 'v_money_tree' }],
    deck: {
      type: 'Challenge Deck',
    },
    restrictions: {
      bannedCards: [],
      bannedTags: [],
      bannedOther: [],
    },
  },
  {
    key: 'c_knife_1',
    name: "On a Knife's Edge",
    order: 4,
    desc: 'Start with an Eternal, Pinned Ceremonial Dagger.',
    rules: {
      custom: [],
      modifiers: [],
    },
    jokers: [{ id: 'j_ceremonial', eternal: true, pinned: true }],
    consumables: [],
    vouchers: [],
    deck: {
      type: 'Challenge Deck',
    },
    restrictions: {
      bannedCards: [],
      bannedTags: [],
      bannedOther: [],
    },
  },
  {
    key: 'c_xray_1',
    name: 'X-ray Vision',
    order: 5,
    desc: '1 in 4 cards are drawn face down.',
    rules: {
      custom: [{ id: 'flipped_cards', value: 4 }],
      modifiers: [],
    },
    jokers: [],
    consumables: [],
    vouchers: [],
    deck: {
      type: 'Challenge Deck',
    },
    restrictions: {
      bannedCards: [],
      bannedTags: [],
      bannedOther: [],
    },
  },
  {
    key: 'c_mad_world_1',
    name: 'Mad World',
    order: 6,
    desc: 'Start with Eternal Negative Pareidolia and Eternal Business Card. Deck contains only 2 through 9. No extra hand money and no interest.',
    rules: {
      custom: [{ id: 'no_extra_hand_money' }, { id: 'no_interest' }],
      modifiers: [],
    },
    jokers: [
      { id: 'j_pareidolia', edition: 'e_negative', eternal: true },
      { id: 'j_business', eternal: true },
    ],
    consumables: [],
    vouchers: [],
    deck: {
      type: 'Challenge Deck',
      cards: buildChallengeCards(['2', '3', '4', '5', '6', '7', '8', '9']),
    },
    restrictions: {
      bannedCards: [],
      bannedTags: [],
      bannedOther: ['bl_plant'],
    },
  },
  {
    key: 'c_luxury_1',
    name: 'Luxury Tax',
    order: 7,
    desc: 'Start with 10 hand size. -1 hand size for every $5 you have.',
    rules: {
      custom: [{ id: 'minus_hand_size_per_X_dollar', value: 5 }],
      modifiers: [{ id: 'hand_size', value: 10 }],
    },
    jokers: [],
    consumables: [],
    vouchers: [],
    deck: {
      type: 'Challenge Deck',
    },
    restrictions: {
      bannedCards: [],
      bannedTags: [],
      bannedOther: [],
    },
  },
  {
    key: 'c_non_perishable_1',
    name: 'Non-Perishable',
    order: 8,
    desc: 'All Jokers are Eternal. Food, self-destroying, and sell-triggered Jokers plus Verdant Leaf are banned.',
    rules: {
      custom: [{ id: 'all_eternal' }],
      modifiers: [],
    },
    jokers: [],
    consumables: [],
    vouchers: [],
    deck: {
      type: 'Challenge Deck',
    },
    restrictions: {
      bannedCards: [
        'j_gros_michel',
        'j_ice_cream',
        'j_cavendish',
        'j_turtle_bean',
        'j_ramen',
        'j_diet_cola',
        'j_selzer',
        'j_popcorn',
        'j_mr_bones',
        'j_invisible',
        'j_luchador',
      ],
      bannedTags: [],
      bannedOther: ['bl_final_leaf'],
    },
  },
  {
    key: 'c_medusa_1',
    name: 'Medusa',
    order: 9,
    desc: 'Start with Eternal Marble Joker. All face cards in starting deck are Stone Cards.',
    rules: {
      custom: [],
      modifiers: [],
    },
    jokers: [{ id: 'j_marble', eternal: true }],
    consumables: [],
    vouchers: [],
    deck: {
      type: 'Challenge Deck',
      cards: buildChallengeCards(FULL_RANKS, (_s, r) =>
        FACE_SHORT_RANKS.has(r) ? { e: 'm_stone' } : {}
      ),
    },
    restrictions: {
      bannedCards: [],
      bannedTags: [],
      bannedOther: [],
    },
  },
  {
    key: 'c_double_nothing_1',
    name: 'Double or Nothing',
    order: 10,
    desc: 'All cards in starting deck have a Red Seal. Played cards become debuffed for the rest of the run.',
    rules: {
      custom: [{ id: 'debuff_played_cards' }],
      modifiers: [],
    },
    jokers: [],
    consumables: [],
    vouchers: [],
    deck: {
      type: 'Challenge Deck',
      cards: buildChallengeCards(FULL_RANKS, () => ({ g: 'Red' })),
    },
    restrictions: {
      bannedCards: [],
      bannedTags: [],
      bannedOther: [],
    },
  },
  {
    key: 'c_typecast_1',
    name: 'Typecast',
    order: 11,
    desc: 'When Ante 4 Boss Blind is defeated, all Jokers become Eternal and Joker slots are set to 0.',
    rules: {
      custom: [
        { id: 'set_eternal_ante', value: 4 },
        { id: 'set_joker_slots_ante', value: 4 },
      ],
      modifiers: [],
    },
    jokers: [],
    consumables: [],
    vouchers: [],
    deck: {
      type: 'Challenge Deck',
    },
    restrictions: {
      bannedCards: [],
      bannedTags: [],
      bannedOther: ['bl_final_leaf'],
    },
  },
  {
    key: 'c_inflation_1',
    name: 'Inflation',
    order: 12,
    desc: 'Start with Credit Card. Permanently increase prices by $1 on every purchase.',
    rules: {
      custom: [{ id: 'inflation' }],
      modifiers: [],
    },
    jokers: [{ id: 'j_credit_card' }],
    consumables: [],
    vouchers: [],
    deck: {
      type: 'Challenge Deck',
    },
    restrictions: {
      bannedCards: ['v_clearance_sale', 'v_liquidation'],
      bannedTags: [],
      bannedOther: [],
    },
  },
  {
    key: 'c_bram_poker_1',
    name: 'Bram Poker',
    order: 13,
    desc: 'Start with Eternal Vampire, The Empress, The Emperor, Magic Trick, and Illusion. No Jokers appear in the shop.',
    rules: {
      custom: [{ id: 'no_shop_jokers' }],
      modifiers: [],
    },
    jokers: [{ id: 'j_vampire', eternal: true }],
    consumables: [{ id: 'c_empress' }, { id: 'c_emperor' }],
    vouchers: [{ id: 'v_magic_trick' }, { id: 'v_illusion' }],
    deck: {
      type: 'Challenge Deck',
    },
    restrictions: {
      bannedCards: [],
      bannedTags: [],
      bannedOther: [],
    },
  },
  {
    key: 'c_fragile_1',
    name: 'Fragile',
    order: 14,
    desc: 'Start with 2 Eternal Negative Oops! All 6s. Every card in your starting deck is a Glass Card.',
    rules: {
      custom: [],
      modifiers: [],
    },
    jokers: [
      { id: 'j_oops', eternal: true, edition: 'e_negative' },
      { id: 'j_oops', eternal: true, edition: 'e_negative' },
    ],
    consumables: [],
    vouchers: [],
    deck: {
      type: 'Challenge Deck',
      enhancement: 'm_glass',
      cards: buildChallengeCards(FULL_RANKS, () => ({ e: 'm_glass' })),
    },
    restrictions: {
      bannedCards: [
        'c_magician',
        'c_empress',
        'c_heirophant',
        'c_chariot',
        'c_devil',
        'c_tower',
        'c_lovers',
        'c_incantation',
        'c_grim',
        'c_familiar',
        'p_standard_normal_1',
        'p_standard_normal_2',
        'p_standard_normal_3',
        'p_standard_normal_4',
        'p_standard_jumbo_1',
        'p_standard_jumbo_2',
        'p_standard_mega_1',
        'p_standard_mega_2',
        'j_marble',
        'j_vampire',
        'j_midas_mask',
        'j_certificate',
        'v_magic_trick',
        'v_illusion',
      ],
      bannedTags: ['tag_standard'],
      bannedOther: [],
    },
  },
  {
    key: 'c_monolith_1',
    name: 'Monolith',
    order: 15,
    desc: 'Start with Eternal Obelisk and Eternal Negative Marble Joker.',
    rules: {
      custom: [],
      modifiers: [],
    },
    jokers: [
      { id: 'j_obelisk', eternal: true },
      { id: 'j_marble', eternal: true, edition: 'e_negative' },
    ],
    consumables: [],
    vouchers: [],
    deck: {
      type: 'Challenge Deck',
    },
    restrictions: {
      bannedCards: [],
      bannedTags: [],
      bannedOther: [],
    },
  },
  {
    key: 'c_blast_off_1',
    name: 'Blast Off',
    order: 16,
    desc: 'Start with Eternal Constellation, Eternal Rocket, Planet Merchant, and Planet Tycoon. 2 hands, 2 discards, and 4 Joker slots.',
    rules: {
      custom: [],
      modifiers: [
        { id: 'hands', value: 2 },
        { id: 'discards', value: 2 },
        { id: 'joker_slots', value: 4 },
      ],
    },
    jokers: [
      { id: 'j_constellation', eternal: true },
      { id: 'j_rocket', eternal: true },
    ],
    consumables: [],
    vouchers: [{ id: 'v_planet_merchant' }, { id: 'v_planet_tycoon' }],
    deck: {
      type: 'Challenge Deck',
    },
    restrictions: {
      bannedCards: ['v_grabber', 'v_nacho_tong', 'j_burglar'],
      bannedTags: [],
      bannedOther: [],
    },
  },
  {
    key: 'c_five_card_1',
    name: 'Five-Card Draw',
    order: 17,
    desc: 'Start with Card Sharp and Joker. 5 hand size, 6 discards, and 7 Joker slots.',
    rules: {
      custom: [],
      modifiers: [
        { id: 'hand_size', value: 5 },
        { id: 'joker_slots', value: 7 },
        { id: 'discards', value: 6 },
      ],
    },
    jokers: [{ id: 'j_card_sharp' }, { id: 'j_joker' }],
    consumables: [],
    vouchers: [],
    deck: {
      type: 'Challenge Deck',
    },
    restrictions: {
      bannedCards: ['j_juggler', 'j_troubadour', 'j_turtle_bean'],
      bannedTags: [],
      bannedOther: [],
    },
  },
  {
    key: 'c_golden_needle_1',
    name: 'Golden Needle',
    order: 18,
    desc: 'Start with Credit Card and $10. 1 hand, 6 discards, and discards each cost $1.',
    rules: {
      custom: [{ id: 'discard_cost', value: 1 }],
      modifiers: [
        { id: 'hands', value: 1 },
        { id: 'discards', value: 6 },
        { id: 'dollars', value: 10 },
      ],
    },
    jokers: [{ id: 'j_credit_card' }],
    consumables: [],
    vouchers: [],
    deck: {
      type: 'Challenge Deck',
    },
    restrictions: {
      bannedCards: ['v_grabber', 'v_nacho_tong', 'j_burglar'],
      bannedTags: [],
      bannedOther: [],
    },
  },
  {
    key: 'c_cruelty_1',
    name: 'Cruelty',
    order: 19,
    desc: 'Small and Big Blinds give no reward money. 3 Joker slots.',
    rules: {
      custom: [
        { id: 'no_reward_specific', value: 'Small' },
        { id: 'no_reward_specific', value: 'Big' },
      ],
      modifiers: [{ id: 'joker_slots', value: 3 }],
    },
    jokers: [],
    consumables: [],
    vouchers: [],
    deck: {
      type: 'Challenge Deck',
    },
    restrictions: {
      bannedCards: [],
      bannedTags: [],
      bannedOther: [],
    },
  },
  {
    key: 'c_jokerless_1',
    name: 'Jokerless',
    order: 20,
    desc: '0 Joker slots. No Jokers appear in the shop, packs, or tags.',
    rules: {
      custom: [{ id: 'no_shop_jokers' }],
      modifiers: [{ id: 'joker_slots', value: 0 }],
    },
    jokers: [],
    consumables: [],
    vouchers: [],
    deck: {
      type: 'Challenge Deck',
    },
    restrictions: {
      bannedCards: [
        'c_judgement',
        'c_wraith',
        'c_soul',
        'v_antimatter',
        'p_buffoon_normal_1',
        'p_buffoon_normal_2',
        'p_buffoon_jumbo_1',
        'p_buffoon_mega_1',
      ],
      bannedTags: [
        'tag_rare',
        'tag_uncommon',
        'tag_holo',
        'tag_polychrome',
        'tag_negative',
        'tag_foil',
        'tag_buffoon',
        'tag_top_up',
      ],
      bannedOther: ['bl_final_acorn', 'bl_final_heart', 'bl_final_leaf'],
    },
  },
];

export const CHALLENGE_MAP: Record<string, ChallengeDef> = Object.fromEntries(
  CHALLENGES.map((c) => [c.key, c])
);
