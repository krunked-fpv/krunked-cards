import type { TagDef } from '../contracts/index.ts';

export const TAGS: TagDef[] = [
  {
    key: 'tag_uncommon',
    name: 'Uncommon Tag',
    order: 1,
    minAnte: 1,
    pos: { x: 0, y: 0 },
    desc: 'Shop has a free Uncommon Joker',
  },
  {
    key: 'tag_rare',
    name: 'Rare Tag',
    order: 2,
    minAnte: 1,
    pos: { x: 1, y: 0 },
    desc: 'Shop has a free Rare Joker',
  },
  {
    key: 'tag_foil',
    name: 'Foil Tag',
    order: 4,
    minAnte: 1,
    pos: { x: 3, y: 0 },
    desc: 'Next base edition shop Joker is free and becomes Foil',
  },
  {
    key: 'tag_investment',
    name: 'Investment Tag',
    order: 7,
    minAnte: 1,
    pos: { x: 2, y: 1 },
    desc: 'After defeating the Boss Blind, gain $25',
  },
  {
    key: 'tag_coupon',
    name: 'Coupon Tag',
    order: 17,
    minAnte: 1,
    pos: { x: 4, y: 0 },
    desc: 'Initial cards and booster packs in next shop are free',
  },
  {
    key: 'tag_double',
    name: 'Double Tag',
    order: 18,
    minAnte: 1,
    pos: { x: 5, y: 0 },
    desc: 'Gives a copy of the next selected Tag (Double Tag excluded)',
  },
];

export const TAG_MAP: Record<string, TagDef> = Object.fromEntries(
  TAGS.map((t) => [t.key, t])
);
