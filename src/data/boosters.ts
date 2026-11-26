import type { BoosterDef } from '../contracts/index.ts';

export const BOOSTERS: BoosterDef[] = [
  {
    key: 'p_arcana_normal_1',
    name: 'Arcana Pack',
    kind: 'Arcana',
    size: 'Normal',
    order: 1,
    cost: 4,
    weight: 1,
    extra: 3,
    choose: 1,
    pos: { x: 0, y: 0 },
    desc: 'Choose 1 of up to 3 Tarot cards to be used immediately',
  },
  {
    key: 'p_celestial_normal_1',
    name: 'Celestial Pack',
    kind: 'Celestial',
    size: 'Normal',
    order: 9,
    cost: 4,
    weight: 1,
    extra: 3,
    choose: 1,
    pos: { x: 0, y: 1 },
    desc: 'Choose 1 of up to 3 Planet cards to be used immediately',
  },
  {
    key: 'p_standard_normal_1',
    name: 'Standard Pack',
    kind: 'Standard',
    size: 'Normal',
    order: 17,
    cost: 4,
    weight: 1,
    extra: 3,
    choose: 1,
    pos: { x: 0, y: 6 },
    desc: 'Choose 1 of up to 3 Playing cards to add to your deck',
  },
  {
    key: 'p_buffoon_normal_1',
    name: 'Buffoon Pack',
    kind: 'Buffoon',
    size: 'Normal',
    order: 25,
    cost: 4,
    weight: 0.6,
    extra: 2,
    choose: 1,
    pos: { x: 0, y: 8 },
    desc: 'Choose 1 of up to 2 Joker cards',
  },
];

export const BOOSTER_MAP: Record<string, BoosterDef> = Object.fromEntries(
  BOOSTERS.map((b) => [b.key, b])
);
