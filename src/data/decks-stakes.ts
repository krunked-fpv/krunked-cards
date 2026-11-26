import { PALETTE, type DeckDef, type StakeDef, type StakeLevel } from '../contracts/index.ts';

export const DECKS: DeckDef[] = [
  {
    key: 'b_red',
    name: 'Red Deck',
    order: 1,
    pos: { x: 0, y: 0 },
    desc: '+1 discard every round',
    config: {
      discards: 1,
    },
  },
  {
    key: 'b_blue',
    name: 'Blue Deck',
    order: 2,
    pos: { x: 0, y: 2 },
    desc: '+1 hand every round',
    config: {
      hands: 1,
    },
  },
  {
    key: 'b_yellow',
    name: 'Yellow Deck',
    order: 3,
    pos: { x: 1, y: 2 },
    desc: 'Start with extra $10',
    config: {
      dollars: 10,
    },
  },
  {
    key: 'b_green',
    name: 'Green Deck',
    order: 4,
    pos: { x: 2, y: 2 },
    desc: 'At end of each Round: $2 per remaining Hand, $1 per remaining Discard. Earn no Interest',
    config: {
      extraHandBonus: 2,
      extraDiscardBonus: 1,
      noInterest: true,
    },
  },
  {
    key: 'b_black',
    name: 'Black Deck',
    order: 5,
    pos: { x: 3, y: 2 },
    desc: '+1 Joker slot, -1 hand every round',
    config: {
      jokerSlots: 1,
      hands: -1,
    },
  },
  {
    key: 'b_magic',
    name: 'Magic Deck',
    order: 6,
    pos: { x: 0, y: 3 },
    desc: 'Start run with the Crystal Ball voucher and 2 copies of The Fool',
    config: {
      vouchers: ['v_crystal_ball'],
      consumables: ['c_fool', 'c_fool'],
    },
  },
  {
    key: 'b_nebula',
    name: 'Nebula Deck',
    order: 7,
    pos: { x: 3, y: 0 },
    desc: 'Start run with the Telescope voucher, -1 consumable slot',
    config: {
      vouchers: ['v_telescope'],
      consumableSlots: -1,
    },
  },
  {
    key: 'b_ghost',
    name: 'Ghost Deck',
    order: 8,
    pos: { x: 6, y: 2 },
    desc: 'Spectral cards may appear in the shop, start with a Hex card',
    config: {
      spectralRate: 2,
      consumables: ['c_hex'],
    },
  },
  {
    key: 'b_abandoned',
    name: 'Abandoned Deck',
    order: 9,
    pos: { x: 3, y: 3 },
    desc: 'Start run with no Face Cards in your deck',
    config: {
      removeFaces: true,
    },
  },
  {
    key: 'b_checkered',
    name: 'Checkered Deck',
    order: 10,
    pos: { x: 1, y: 3 },
    desc: 'Start run with 26 Spades and 26 Hearts in deck',
    config: {
      checkered: true,
    },
  },
  {
    key: 'b_zodiac',
    name: 'Zodiac Deck',
    order: 11,
    pos: { x: 3, y: 4 },
    desc: 'Start run with Tarot Merchant, Planet Merchant, and Overstock',
    config: {
      vouchers: ['v_tarot_merchant', 'v_planet_merchant', 'v_overstock_norm'],
    },
  },
  {
    key: 'b_painted',
    name: 'Painted Deck',
    order: 12,
    pos: { x: 4, y: 3 },
    desc: '+2 hand size, -1 Joker slot',
    config: {
      handSize: 2,
      jokerSlots: -1,
    },
  },
  {
    key: 'b_anaglyph',
    name: 'Anaglyph Deck',
    order: 13,
    pos: { x: 2, y: 4 },
    desc: 'After defeating each Boss Blind, gain a Double Tag',
    config: {
      anaglyph: true,
    },
  },
  {
    key: 'b_plasma',
    name: 'Plasma Deck',
    order: 14,
    pos: { x: 4, y: 2 },
    desc: 'Balance Chips and Mult when calculating score for played hand. X2 base Blind size',
    config: {
      anteScaling: 2,
      plasma: true,
    },
  },
  {
    key: 'b_erratic',
    name: 'Erratic Deck',
    order: 15,
    pos: { x: 2, y: 3 },
    desc: 'All Ranks and Suits in deck are randomized',
    config: {
      randomizeRankSuit: true,
    },
  },
];

export const DECK_MAP: Record<string, DeckDef> = Object.fromEntries(
  DECKS.map((d) => [d.key, d])
);

export const STAKES: StakeDef[] = [
  {
    level: 1,
    key: 'stake_white',
    name: 'White Stake',
    pos: { x: 0, y: 0 },
    color: '#efefef',
    scaling: 1,
    desc: 'Base Difficulty',
  },
  {
    level: 2,
    key: 'stake_red',
    name: 'Red Stake',
    pos: { x: 1, y: 0 },
    color: PALETTE.RED,
    scaling: 1,
    desc: 'Small Blind gives no reward money. Applies all previous Stakes',
  },
  {
    level: 3,
    key: 'stake_green',
    name: 'Green Stake',
    pos: { x: 2, y: 0 },
    color: PALETTE.GREEN,
    scaling: 2,
    desc: 'Required score scales faster for each Ante. Applies all previous Stakes',
  },
  {
    level: 4,
    key: 'stake_black',
    name: 'Black Stake',
    pos: { x: 4, y: 0 },
    color: PALETTE.BLACK,
    scaling: 2,
    desc: "Shop can have Eternal Jokers (Can't be sold or destroyed). Applies all previous Stakes",
  },
  {
    level: 5,
    key: 'stake_blue',
    name: 'Blue Stake',
    pos: { x: 3, y: 0 },
    color: PALETTE.BLUE,
    scaling: 2,
    desc: '-1 Discard. Applies all previous Stakes',
  },
  {
    level: 6,
    key: 'stake_purple',
    name: 'Purple Stake',
    pos: { x: 0, y: 1 },
    color: PALETTE.PURPLE,
    scaling: 3,
    desc: 'Required score scales faster for each Ante. Applies all previous Stakes',
  },
  {
    level: 7,
    key: 'stake_orange',
    name: 'Orange Stake',
    pos: { x: 1, y: 1 },
    color: PALETTE.ORANGE,
    scaling: 3,
    desc: 'Shop can have Perishable Jokers (Debuffed after 5 Rounds). Applies all previous Stakes',
  },
  {
    level: 8,
    key: 'stake_gold',
    name: 'Gold Stake',
    pos: { x: 2, y: 1 },
    color: PALETTE.GOLD,
    scaling: 3,
    desc: 'Shop can have Rental Jokers (Costs $3 per round). Applies all previous Stakes',
  },
];

export const STAKE_MAP: Record<StakeLevel, StakeDef> = Object.fromEntries(
  STAKES.map((s) => [s.level, s])
) as Record<StakeLevel, StakeDef>;
