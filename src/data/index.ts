import type {
  JokerDef,
  JokerEvalContext,
  JokerEvalResult,
  JokerHookFn,
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
import { COMMON_JOKERS, COMMON_JOKER_HOOKS } from './jokers-common.ts';
import { RARE_LEGENDARY_JOKERS, RARE_LEGENDARY_JOKER_HOOKS } from './jokers-rare-legendary.ts';
import { UNCOMMON_JOKERS, UNCOMMON_JOKER_HOOKS } from './jokers-uncommon.ts';
import { TAGS, TAG_MAP } from './tags.ts';
import { VOUCHERS, VOUCHER_MAP } from './vouchers.ts';

export const CATALOG_STAGE: 'wave1' | 'full' = 'full';

export const JOKERS: JokerDef[] = [
  ...COMMON_JOKERS,
  ...UNCOMMON_JOKERS,
  ...RARE_LEGENDARY_JOKERS,
].sort((a, b) => a.order - b.order);

export const JOKER_MAP: Record<string, JokerDef> = Object.fromEntries(
  JOKERS.map((j) => [j.key, j])
);

export const JOKER_HOOKS: Record<string, JokerHookFn> = {
  ...COMMON_JOKER_HOOKS,
  ...UNCOMMON_JOKER_HOOKS,
  ...RARE_LEGENDARY_JOKER_HOOKS,
};

export {
  POKER_HANDS,
  POKER_HAND_MAP,
  BLIND_AMOUNTS,
  getBlindAmount,
  ENHANCEMENT_DEFS,
  EDITION_DEFS,
  SEAL_DEFS,
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
