import type {
  JokerEvalContext,
  JokerEvalResult,
  JokerInstance,
  SimState,
} from '../contracts/index.ts';

import { BLINDS, BLIND_MAP } from './blinds.ts';
import { BOOSTERS, BOOSTER_MAP } from './boosters.ts';
import { CHALLENGES, CHALLENGE_MAP } from './challenges.ts';
import { CONSUMABLE_MAP, PLANETS, SPECTRALS, TAROTS } from './consumables.ts';
import { DECKS, DECK_MAP, STAKES, STAKE_MAP } from './decks-stakes.ts';
import { EDITION_DEFS, ENHANCEMENT_DEFS, SEAL_DEFS } from './enhancements.ts';
import { BLIND_AMOUNTS, POKER_HANDS, POKER_HAND_MAP, getBlindAmount } from './hands.ts';
import { JOKERS, JOKER_HOOKS, JOKER_MAP } from './jokers.ts';
import { TAGS, TAG_MAP } from './tags.ts';
import { VOUCHERS, VOUCHER_MAP } from './vouchers.ts';

export const CATALOG_STAGE: 'wave1' | 'full' = 'wave1';

export {
  POKER_HANDS,
  POKER_HAND_MAP,
  BLIND_AMOUNTS,
  getBlindAmount,
  ENHANCEMENT_DEFS,
  EDITION_DEFS,
  SEAL_DEFS,
  JOKERS,
  JOKER_MAP,
  JOKER_HOOKS,
  TAROTS,
  PLANETS,
  SPECTRALS,
  CONSUMABLE_MAP,
  VOUCHERS,
  VOUCHER_MAP,
  BOOSTERS,
  BOOSTER_MAP,
  BLINDS,
  BLIND_MAP,
  TAGS,
  TAG_MAP,
  DECKS,
  DECK_MAP,
  STAKES,
  STAKE_MAP,
  CHALLENGES,
  CHALLENGE_MAP,
};

export function getCatalogSummary(): Record<string, number> {
  return {
    pokerHands: POKER_HANDS.length,
    jokers: JOKERS.length,
    tarots: TAROTS.length,
    planets: PLANETS.length,
    spectrals: SPECTRALS.length,
    vouchers: VOUCHERS.length,
    boosters: BOOSTERS.length,
    blinds: BLINDS.length,
    tags: TAGS.length,
    decks: DECKS.length,
    stakes: STAKES.length,
    challenges: CHALLENGES.length,
  };
}

export function formatJokerDesc(joker: JokerInstance, state: SimState): string {
  const def = JOKER_MAP[joker.key];
  if (!def) return '';
  return def.formatDesc ? def.formatDesc(joker, state) : def.descTemplate;
}

export function evaluateJokerHook(
  jokerKey: string,
  ctx: JokerEvalContext
): JokerEvalResult | null {
  const fn = JOKER_HOOKS[jokerKey];
  return fn ? fn(ctx) : null;
}
