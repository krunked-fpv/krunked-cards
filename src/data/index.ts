import type {
  BlindDef,
  BoosterDef,
  ChallengeDef,
  ConsumableDef,
  DeckDef,
  EditionDef,
  EditionId,
  EnhancementDef,
  EnhancementId,
  JokerDef,
  JokerEvalContext,
  JokerEvalResult,
  JokerHookFn,
  JokerInstance,
  PokerHandDef,
  PokerHandId,
  SealDef,
  SealId,
  SimState,
  StakeDef,
  StakeLevel,
  TagDef,
  VoucherDef,
} from '../contracts/index.ts';

// Skeleton barrel replaced exclusively by @catalog in Wave 1 & Wave 2.
export const CATALOG_STAGE: 'wave1' | 'full' = 'wave1';

export const POKER_HANDS: PokerHandDef[] = [];
export const POKER_HAND_MAP: Record<PokerHandId, PokerHandDef> = {} as Record<PokerHandId, PokerHandDef>;
export const ENHANCEMENT_DEFS: Record<EnhancementId, EnhancementDef> = {} as Record<EnhancementId, EnhancementDef>;
export const EDITION_DEFS: Record<EditionId, EditionDef> = {} as Record<EditionId, EditionDef>;
export const SEAL_DEFS: Record<SealId, SealDef> = {} as Record<SealId, SealDef>;

export const JOKERS: JokerDef[] = [];
export const JOKER_MAP: Record<string, JokerDef> = {};
export const JOKER_HOOKS: Record<string, JokerHookFn> = {};

export const TAROTS: ConsumableDef[] = [];
export const PLANETS: ConsumableDef[] = [];
export const SPECTRALS: ConsumableDef[] = [];
export const CONSUMABLE_MAP: Record<string, ConsumableDef> = {};

export const VOUCHERS: VoucherDef[] = [];
export const VOUCHER_MAP: Record<string, VoucherDef> = {};

export const BOOSTERS: BoosterDef[] = [];
export const BOOSTER_MAP: Record<string, BoosterDef> = {};

export const BLINDS: BlindDef[] = [];
export const BLIND_MAP: Record<string, BlindDef> = {};

export const TAGS: TagDef[] = [];
export const TAG_MAP: Record<string, TagDef> = {};

export const DECKS: DeckDef[] = [];
export const DECK_MAP: Record<string, DeckDef> = {};

export const STAKES: StakeDef[] = [];
export const STAKE_MAP: Record<StakeLevel, StakeDef> = {} as Record<StakeLevel, StakeDef>;

export const CHALLENGES: ChallengeDef[] = [];
export const CHALLENGE_MAP: Record<string, ChallengeDef> = {};

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
  const pow10 = Math.pow(10, Math.floor(Math.log10(raw) - 1));
  return raw - (raw % pow10);
}

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

export function evaluateJokerHook(jokerKey: string, ctx: JokerEvalContext): JokerEvalResult | null {
  const fn = JOKER_HOOKS[jokerKey];
  return fn ? fn(ctx) : null;
}
