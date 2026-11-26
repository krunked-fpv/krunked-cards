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
