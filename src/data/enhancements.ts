import {
  PALETTE,
  type EditionDef,
  type EditionId,
  type EnhancementDef,
  type EnhancementId,
  type SealDef,
  type SealId,
} from '../contracts/index.ts';

export const ENHANCEMENT_DEFS: Record<EnhancementId, EnhancementDef> = {
  none: {
    id: 'none',
    name: 'Base Card',
    pos: { x: 1, y: 0 },
    desc: 'No enhancement',
  },
  m_bonus: {
    id: 'm_bonus',
    name: 'Bonus Card',
    pos: { x: 1, y: 1 },
    chips: 30,
    desc: '+30 extra chips',
  },
  m_mult: {
    id: 'm_mult',
    name: 'Mult Card',
    pos: { x: 2, y: 1 },
    mult: 4,
    desc: '+4 Mult',
  },
  m_wild: {
    id: 'm_wild',
    name: 'Wild Card',
    pos: { x: 3, y: 1 },
    anySuit: true,
    desc: 'Can be used as any suit',
  },
  m_glass: {
    id: 'm_glass',
    name: 'Glass Card',
    pos: { x: 5, y: 1 },
    xMult: 2,
    desc: 'X2 Mult. 1 in 4 chance to destroy card',
  },
  m_steel: {
    id: 'm_steel',
    name: 'Steel Card',
    pos: { x: 6, y: 1 },
    hXMult: 1.5,
    desc: 'X1.5 Mult while this card stays in hand',
  },
  m_stone: {
    id: 'm_stone',
    name: 'Stone Card',
    pos: { x: 5, y: 0 },
    chips: 50,
    noRank: true,
    alwaysScores: true,
    desc: '+50 Chips, no rank or suit',
  },
  m_gold: {
    id: 'm_gold',
    name: 'Gold Card',
    pos: { x: 6, y: 0 },
    hDollars: 3,
    desc: '$3 if this card is held in hand at end of round',
  },
  m_lucky: {
    id: 'm_lucky',
    name: 'Lucky Card',
    pos: { x: 4, y: 1 },
    mult: 20,
    desc: '1 in 5 chance for +20 Mult, 1 in 15 chance to win $20',
  },
};

export const EDITION_DEFS: Record<EditionId, EditionDef> = {
  none: {
    id: 'none',
    name: 'Base',
    costAdd: 0,
    desc: 'Standard edition',
  },
  e_foil: {
    id: 'e_foil',
    name: 'Foil',
    costAdd: 2,
    chips: 50,
    desc: '+50 chips',
  },
  e_holo: {
    id: 'e_holo',
    name: 'Holographic',
    costAdd: 3,
    mult: 10,
    desc: '+10 Mult',
  },
  e_polychrome: {
    id: 'e_polychrome',
    name: 'Polychrome',
    costAdd: 5,
    xMult: 1.5,
    desc: 'X1.5 Mult',
  },
  e_negative: {
    id: 'e_negative',
    name: 'Negative',
    costAdd: 5,
    extraSlots: 1,
    desc: '+1 Joker slot',
  },
};

export const SEAL_DEFS: Record<SealId, SealDef> = {
  none: {
    id: 'none',
    name: 'No Seal',
    pos: { x: 0, y: 0 },
    color: PALETTE.GREY,
    desc: 'No seal',
  },
  Gold: {
    id: 'Gold',
    name: 'Gold Seal',
    pos: { x: 2, y: 0 },
    color: PALETTE.GOLD,
    desc: 'Earn $3 when this card is played and scores',
  },
  Red: {
    id: 'Red',
    name: 'Red Seal',
    pos: { x: 5, y: 4 },
    color: PALETTE.RED,
    desc: 'Retrigger this card 1 time',
  },
  Blue: {
    id: 'Blue',
    name: 'Blue Seal',
    pos: { x: 6, y: 4 },
    color: PALETTE.BLUE,
    desc: 'Creates the Planet card for final played poker hand of round if held in hand (Must have room)',
  },
  Purple: {
    id: 'Purple',
    name: 'Purple Seal',
    pos: { x: 4, y: 4 },
    color: PALETTE.PURPLE,
    desc: 'Creates a Tarot card when discarded (Must have room)',
  },
};
