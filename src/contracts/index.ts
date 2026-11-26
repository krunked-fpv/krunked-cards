// ============================================================================
// Krunked Cards — Single Source of Truth Contracts (src/contracts/index.ts)
// Pure TypeScript types, enums, constants, and interfaces shared by all modules.
// Zero DOM / WebGL / Audio / Node runtime side effects.
// ============================================================================

export const SIM_HZ = 60 as const;
export const SAVE_STORAGE_KEY = 'krunked_cards_save_v1' as const;
export const SAVE_SCHEMA_VERSION = 1 as const;

export const LAYOUT = {
  TILESIZE: 20,
  TILESCALE: 3.65,
  TILE_W: 20,
  TILE_H: 11.5,
  CARD_W: (2.4 * 35) / 41,
  CARD_H: (2.4 * 47) / 41,
  HIGHLIGHT_H: 0.2 * ((2.4 * 47) / 41),
  COLLISION_BUFFER: 0.05,
  ANIMATION_FPS: 10,
} as const;

export const PALETTE = {
  CHIPS: '#009dff',
  BLUE: '#009dff',
  MULT: '#FE5F55',
  RED: '#FE5F55',
  MONEY: '#f3b958',
  GOLD: '#eac058',
  GREEN: '#4BC292',
  ORANGE: '#fda200',
  PURPLE: '#8867a5',
  BLACK: '#374244',
  L_BLACK: '#4f6367',
  GREY: '#5f7377',
  JOKER_GREY: '#bfc7d5',
  VOUCHER: '#cb724c',
  BOOSTER: '#646eb7',
  ETERNAL: '#c75985',
  PERISHABLE: '#4f5da1',
  RENTAL: '#b18f43',
  WHITE: '#ffffff',
  RARITY: ['#009dff', '#4BC292', '#fe5f55', '#b26cbb'] as const,
  SUITS_DEFAULT: {
    Hearts: '#FE5F55',
    Diamonds: '#FE5F55',
    Spades: '#374649',
    Clubs: '#424e54',
  } as const,
  SUITS_HIGH_CONTRAST: {
    Hearts: '#f83b2f',
    Diamonds: '#e29000',
    Spades: '#4f31b9',
    Clubs: '#008ee6',
  } as const,
  HAND_LEVELS: [
    '#efefef',
    '#95acff',
    '#65efaf',
    '#fae37e',
    '#ffc052',
    '#f87d75',
    '#caa0ef',
  ] as const,
} as const;

export const SUITS = ['Hearts', 'Diamonds', 'Spades', 'Clubs'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10',
  'Jack', 'Queen', 'King', 'Ace',
] as const;
export type Rank = (typeof RANKS)[number];

export const RANK_VALUES: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  Jack: 11,
  Queen: 12,
  King: 13,
  Ace: 14,
};

export const RANK_CHIPS: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  Jack: 10,
  Queen: 10,
  King: 10,
  Ace: 11,
};

export const ENHANCEMENTS = [
  'none',
  'm_bonus',
  'm_mult',
  'm_wild',
  'm_glass',
  'm_steel',
  'm_stone',
  'm_gold',
  'm_lucky',
] as const;
export type EnhancementId = (typeof ENHANCEMENTS)[number];

export const EDITIONS = [
  'none',
  'e_foil',
  'e_holo',
  'e_polychrome',
  'e_negative',
] as const;
export type EditionId = (typeof EDITIONS)[number];

export const SEALS = ['none', 'Gold', 'Red', 'Blue', 'Purple'] as const;
export type SealId = (typeof SEALS)[number];

export type Rarity = 1 | 2 | 3 | 4;

export const POKER_HAND_IDS = [
  'Flush Five',
  'Flush House',
  'Five of a Kind',
  'Straight Flush',
  'Four of a Kind',
  'Full House',
  'Flush',
  'Straight',
  'Three of a Kind',
  'Two Pair',
  'Pair',
  'High Card',
] as const;
export type PokerHandId = (typeof POKER_HAND_IDS)[number];

export type ConsumableSet = 'Tarot' | 'Planet' | 'Spectral';
export type BoosterKind = 'Arcana' | 'Celestial' | 'Spectral' | 'Standard' | 'Buffoon';
export type BoosterSize = 'Normal' | 'Jumbo' | 'Mega';

export type BlindSlot = 'Small' | 'Big' | 'Boss';
export type BlindStatus = 'Select' | 'Current' | 'Defeated' | 'Skipped' | 'Upcoming';
export type StakeLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type SortMode = 'rank' | 'suit';
export type ArtPackMode = 'builtin' | 'custom';
export type GameSpeed = 0.5 | 1 | 2 | 4;
export type TargetFps = 30 | 60 | 120;

export type GamePhase =
  | 'TITLE'
  | 'BLIND_SELECT'
  | 'PLAYING'
  | 'SCORING'
  | 'CASHOUT'
  | 'SHOP'
  | 'PACK_OPEN'
  | 'VICTORY'
  | 'GAME_OVER';

export const ATLAS_KEYS = [
  'cards_1',
  'cards_2',
  'centers',
  'Joker',
  'Tarot',
  'Voucher',
  'Booster',
  'BlindChips',
  'tags',
  'stickers',
  'chips',
  'ui_1',
  'ui_2',
  'shop_sign',
  'icons',
] as const;
export type AtlasKey = (typeof ATLAS_KEYS)[number];

export interface AtlasPos {
  x: number;
  y: number;
}

export interface AtlasSpec {
  key: AtlasKey;
  cellW: number;
  cellH: number;
  cols: number;
  rows: number;
  file1x: string;
  file2x: string;
}

export const ATLAS_SPECS: Record<AtlasKey, AtlasSpec> = {
  cards_1: { key: 'cards_1', cellW: 71, cellH: 95, cols: 13, rows: 4, file1x: 'textures/1x/8BitDeck.png', file2x: 'textures/2x/8BitDeck.png' },
  cards_2: { key: 'cards_2', cellW: 71, cellH: 95, cols: 13, rows: 4, file1x: 'textures/1x/8BitDeck_opt2.png', file2x: 'textures/2x/8BitDeck_opt2.png' },
  centers: { key: 'centers', cellW: 71, cellH: 95, cols: 7, rows: 5, file1x: 'textures/1x/Enhancers.png', file2x: 'textures/2x/Enhancers.png' },
  Joker: { key: 'Joker', cellW: 71, cellH: 95, cols: 10, rows: 16, file1x: 'textures/1x/Jokers.png', file2x: 'textures/2x/Jokers.png' },
  Tarot: { key: 'Tarot', cellW: 71, cellH: 95, cols: 10, rows: 6, file1x: 'textures/1x/Tarots.png', file2x: 'textures/2x/Tarots.png' },
  Voucher: { key: 'Voucher', cellW: 71, cellH: 95, cols: 9, rows: 4, file1x: 'textures/1x/Vouchers.png', file2x: 'textures/2x/Vouchers.png' },
  Booster: { key: 'Booster', cellW: 71, cellH: 95, cols: 4, rows: 9, file1x: 'textures/1x/boosters.png', file2x: 'textures/2x/boosters.png' },
  BlindChips: { key: 'BlindChips', cellW: 34, cellH: 34, cols: 21, rows: 31, file1x: 'textures/1x/BlindChips.png', file2x: 'textures/2x/BlindChips.png' },
  tags: { key: 'tags', cellW: 34, cellH: 34, cols: 6, rows: 5, file1x: 'textures/1x/tags.png', file2x: 'textures/2x/tags.png' },
  stickers: { key: 'stickers', cellW: 71, cellH: 95, cols: 5, rows: 3, file1x: 'textures/1x/stickers.png', file2x: 'textures/2x/stickers.png' },
  chips: { key: 'chips', cellW: 29, cellH: 29, cols: 5, rows: 2, file1x: 'textures/1x/chips.png', file2x: 'textures/2x/chips.png' },
  ui_1: { key: 'ui_1', cellW: 18, cellH: 18, cols: 4, rows: 2, file1x: 'textures/1x/ui_assets.png', file2x: 'textures/2x/ui_assets.png' },
  ui_2: { key: 'ui_2', cellW: 18, cellH: 18, cols: 4, rows: 2, file1x: 'textures/1x/ui_assets_opt2.png', file2x: 'textures/2x/ui_assets_opt2.png' },
  shop_sign: { key: 'shop_sign', cellW: 113, cellH: 57, cols: 4, rows: 1, file1x: 'textures/1x/ShopSignAnimation.png', file2x: 'textures/2x/ShopSignAnimation.png' },
  icons: { key: 'icons', cellW: 66, cellH: 66, cols: 4, rows: 4, file1x: 'textures/1x/icons.png', file2x: 'textures/2x/icons.png' },
};

export const MUSIC_TRACK_IDS = ['music1', 'music2', 'music3', 'music4', 'music5'] as const;
export type MusicTrackId = (typeof MUSIC_TRACK_IDS)[number];

export const SOUND_KEYS = [
  'ambientFire1', 'ambientFire2', 'ambientFire3', 'ambientOrgan1',
  'button', 'cancel',
  'card1', 'card3', 'cardFan2', 'cardSlide1', 'cardSlide2',
  'chips1', 'chips2',
  'coin1', 'coin2', 'coin3', 'coin4', 'coin5', 'coin6', 'coin7',
  'crumple1', 'crumple2', 'crumple3', 'crumple4', 'crumple5', 'crumpleLong1', 'crumpleLong2',
  'explosion1', 'explosion_buildup1', 'explosion_release1',
  'foil1', 'foil2', 'generic1',
  'glass1', 'glass2', 'glass3', 'glass4', 'glass5', 'glass6',
  'gold_seal', 'gong',
  'highlight1', 'highlight2', 'holo1', 'introPad1',
  'magic_crumple', 'magic_crumple2', 'magic_crumple3',
  'multhit1', 'multhit2',
  'music1', 'music2', 'music3', 'music4', 'music5',
  'negative', 'other1', 'paper1', 'polychrome1', 'slice1', 'splash_buildup',
  'tarot1', 'tarot2', 'timpani',
  'voice1', 'voice2', 'voice3', 'voice4', 'voice5', 'voice6', 'voice7', 'voice8', 'voice9', 'voice10', 'voice11',
  'whoosh', 'whoosh1', 'whoosh2', 'whoosh_long', 'win',
] as const;
export type SoundKey = (typeof SOUND_KEYS)[number];

// ============================================================================
// Runtime Entities (100% JSON-serializable for deterministic replay & saves)
// ============================================================================

export interface RngState {
  seed: string;
  hashedSeed: number;
  /** Per-key stream values matching keyed pseudoseed semantics */
  streams: Record<string, number>;
  /** Monotonic PRNG step counter */
  calls: number;
}

export interface CardInstance {
  id: string;
  suit: Suit;
  rank: Rank;
  enhancement: EnhancementId;
  edition: EditionId;
  seal: SealId;
  permaBonus: number;
  debuffed: boolean;
  faceDown: boolean;
  playedThisAnte: boolean;
}

export interface JokerInstance {
  id: string;
  key: string;
  edition: EditionId;
  eternal: boolean;
  perishable: boolean;
  perishableTally: number;
  rental: boolean;
  debuffed: boolean;
  faceDown: boolean;
  cost: number;
  sellValue: number;
  extraSellValue: number;
  state: Record<string, number | string | boolean | null>;
}

export interface ConsumableInstance {
  id: string;
  key: string;
  set: ConsumableSet;
  edition: EditionId;
  cost: number;
  sellValue: number;
}

export interface PokerHandState {
  id: PokerHandId;
  level: number;
  chips: number;
  mult: number;
  lChips: number;
  lMult: number;
  visible: boolean;
  played: number;
  playedThisRound: number;
}

export interface HandEvaluationResult {
  handId: PokerHandId;
  displayName: string; // e.g., "Royal Flush" when Straight Flush is 10-J-Q-K-A
  scoringCards: CardInstance[];
  containedHands: PokerHandId[];
}

export interface BlindSlotState {
  slot: BlindSlot;
  key: string;
  name: string;
  status: BlindStatus;
  mult: number;
  targetChips: number;
  dollars: number;
  tagKey: string | null; // Small and Big Blinds have skip tags
  bossColor: string;
  triggered: boolean;
  disabled: boolean; // Chicot / Luchador
}

export interface ShopOffer {
  id: string;
  kind: 'joker' | 'tarot' | 'planet' | 'spectral' | 'playing_card';
  key: string;
  cost: number;
  sold: boolean;
  edition: EditionId;
  enhancement?: EnhancementId;
  seal?: SealId;
  suit?: Suit;
  rank?: Rank;
  eternal?: boolean;
  perishable?: boolean;
  rental?: boolean;
}

export interface ShopVoucherOffer {
  id: string;
  key: string;
  cost: number;
  redeemed: boolean;
}

export interface ShopBoosterOffer {
  id: string;
  key: string;
  kind: BoosterKind;
  size: BoosterSize;
  cost: number;
  opened: boolean;
  extra: number;
  choose: number;
}

export interface ShopState {
  offers: ShopOffer[];
  vouchers: ShopVoucherOffer[];
  boosters: ShopBoosterOffer[];
  rerollsUsed: number;
}

export interface PackCardOffer {
  id: string;
  kind: 'joker' | 'tarot' | 'planet' | 'spectral' | 'playing_card';
  key: string;
  edition: EditionId;
  enhancement?: EnhancementId;
  seal?: SealId;
  suit?: Suit;
  rank?: Rank;
  eternal?: boolean;
  perishable?: boolean;
  rental?: boolean;
  taken: boolean;
}

export interface PackState {
  boosterKey: string;
  kind: BoosterKind;
  size: BoosterSize;
  cards: PackCardOffer[];
  chooseRemaining: number;
  needsHand: boolean;
}

export interface CashoutRow {
  label: string;
  detail?: string;
  dollars: number;
  color?: string;
}

export interface CashoutBreakdown {
  rows: CashoutRow[];
  total: number;
  blindKey: string;
}

export type ScoreBeatKind =
  | 'hand_announce'
  | 'boss_modify'
  | 'boss_debuff'
  | 'card_score'
  | 'card_held'
  | 'joker_trigger'
  | 'consumable_trigger'
  | 'edition_trigger'
  | 'seal_trigger'
  | 'retrigger'
  | 'card_shatter'
  | 'card_modify'
  | 'plasma_balance'
  | 'hand_total'
  | 'blind_clear'
  | 'mr_bones_save';

export interface ScoreBeat {
  id: number;
  kind: ScoreBeatKind;
  sourceType: 'card' | 'held_card' | 'joker' | 'consumable' | 'blind' | 'deck' | 'system';
  sourceId?: string;
  chipsDelta?: number;
  multDelta?: number;
  xMult?: number;
  dollarsDelta?: number;
  chipsAfter: number;
  multAfter: number;
  message?: string;
  color?: string;
  sound?: SoundKey;
  pitchStep?: number;
  durationMs: number;
}

export interface SimEvent {
  type:
    | 'RUN_STARTED'
    | 'BLIND_SELECTED'
    | 'BLIND_SKIPPED'
    | 'TAG_TRIGGERED'
    | 'CARDS_DRAWN'
    | 'CARDS_DISCARDED'
    | 'HAND_PLAYED'
    | 'HAND_SCORED'
    | 'ROUND_WON'
    | 'CASHOUT_COMPLETE'
    | 'SHOP_ENTERED'
    | 'SHOP_REROLLED'
    | 'ITEM_BOUGHT'
    | 'ITEM_SOLD'
    | 'VOUCHER_REDEEMED'
    | 'PACK_OPENED'
    | 'CONSUMABLE_USED'
    | 'JOKER_DESTROYED'
    | 'CARD_DESTROYED'
    | 'CARD_CREATED'
    | 'VICTORY'
    | 'GAME_OVER'
    | 'ERROR';
  message?: string;
  sound?: SoundKey;
  payload?: Record<string, unknown>;
}

export interface RunTrackingState {
  lastTarotPlanetKey: string | null;
  lastTarotPlanetSet: 'Tarot' | 'Planet' | null;
  handsPlayedThisRound: number;
  handsPlayedTotal: number;
  discardsUsedThisRound: number;
  discardsUsedTotal: number;
  playedHandTypesThisRound: PokerHandId[];
  firstHandTypeThisRound: PokerHandId | null;
  mostPlayedHand: PokerHandId;
  skipsTotal: number;
  cardsDestroyedTotal: number;
  tarotsUsedTotal: number;
  planetsUsedTotal: number;
  spectralsUsedTotal: number;
  vouchersRedeemedTotal: number;
  rerollsThisRun: number;
  nextUid: number;
  idolSuit: Suit;
  idolRank: Rank;
  ancientSuit: Suit;
  castleSuit: Suit;
  mailRank: Rank;
  firstShopSeen: boolean;
  ectoplasmUses: number;
  handSizeDeltaThisRound: number; // Juggle tag / Turtle Bean / Troubadour temp deltas
  handsDeltaNextRound: number;
  discardsDeltaNextRound: number;
  pendingCoupon: boolean;
  pendingFreeShopReroll: boolean;
  pendingShopTags: string[]; // Uncommon/Rare/Foil/Holo/Poly/Negative tags waiting for next shop
  bannedKeys: string[];
  bannedTags: string[];
  bannedOthers: string[];
  noInterest: boolean;
  noReward: boolean;
  noExtraHandMoney: boolean;
  allEternal: boolean;
  flippedCardsChance: number; // X-ray Vision 1-in-4
  inflationRerollBump: number;
  inflationCostBump: number;
  crimsonHeartDisabledJokerId: string | null;
  ceruleanBellForcedCardId: string | null;
  verdantLeafSold: boolean;
  oxMostPlayedHand: PokerHandId;
  lastPlayedHandId: PokerHandId | null;
}

export interface RunStats {
  bestHand: number;
  cardsPlayed: number;
  cardsDiscarded: number;
  cardsPurchased: number;
  timesRerolled: number;
  highestAnte: number;
  highestRound: number;
  defeatedBy: string | null;
}

export interface SimState {
  tick: number;
  rng: RngState;
  phase: GamePhase;
  deckId: string;
  stake: StakeLevel;
  challengeId: string | null;
  seeded: boolean;

  ante: number;
  round: number;
  winAnte: number;
  endless: boolean;

  dollars: number;
  bankruptAt: number;
  interestCap: number;
  interestAmount: number;
  anteScaling: number;

  handsPerRound: number;
  discardsPerRound: number;
  handsLeft: number;
  discardsLeft: number;
  handSize: number;
  maxSelectCards: number;

  jokerSlots: number;
  consumableSlots: number;
  shopSlots: number;
  voucherSlots: number;
  boosterSlots: number;

  baseRerollCost: number;
  rerollCost: number;
  freeRerolls: number;
  discountPercent: number;

  jokerRate: number;
  tarotRate: number;
  planetRate: number;
  spectralRate: number;
  playingCardRate: number;
  editionRate: number;

  blinds: Record<BlindSlot, BlindSlotState>;
  activeBlindSlot: BlindSlot;
  bossHistory: string[];
  bossRerolledThisAnte: boolean;

  roundChips: number;
  targetChips: number;
  currentHandChips: number;
  currentHandMult: number;
  lastHandScore: number;
  lastHandName: string | null;
  lastHandBeats: ScoreBeat[];
  scoringBeatIndex: number;

  fullDeck: CardInstance[];
  drawPile: string[];
  hand: string[];
  playArea: string[];
  discardPile: string[];
  selectedCardIds: string[];
  sortMode: SortMode;

  jokers: JokerInstance[];
  consumables: ConsumableInstance[];
  vouchers: string[];
  tags: string[];

  handLevels: Record<PokerHandId, PokerHandState>;
  shop: ShopState | null;
  pack: PackState | null;
  cashout: CashoutBreakdown | null;

  tracking: RunTrackingState;
  stats: RunStats;
  events: SimEvent[];
  lastError: string | null;
}

// ============================================================================
// Declarative Content Catalog Definitions (src/data/*)
// ============================================================================

export interface PokerHandDef {
  id: PokerHandId;
  order: number;
  baseChips: number;
  baseMult: number;
  lChips: number;
  lMult: number;
  visible: boolean;
  example: string;
  desc: string;
}

export interface EnhancementDef {
  id: EnhancementId;
  name: string;
  pos: AtlasPos;
  desc: string;
  chips?: number;
  mult?: number;
  xMult?: number;
  hXMult?: number;
  hDollars?: number;
  noRank?: boolean;
  anySuit?: boolean;
  alwaysScores?: boolean;
}

export interface EditionDef {
  id: EditionId;
  name: string;
  costAdd: number;
  chips?: number;
  mult?: number;
  xMult?: number;
  extraSlots?: number;
  desc: string;
}

export interface SealDef {
  id: SealId;
  name: string;
  pos: AtlasPos;
  color: string;
  desc: string;
}

export interface JokerDef {
  key: string;
  name: string;
  order: number;
  rarity: Rarity;
  cost: number;
  pos: AtlasPos;
  soulPos?: AtlasPos;
  blueprintCompat: boolean;
  perishableCompat: boolean;
  eternalCompat: boolean;
  config: Record<string, number | string | boolean | null>;
  descTemplate: string;
  /** Optional dynamic tooltip formatter given live instance state */
  formatDesc?: (inst: JokerInstance, state: SimState) => string;
}

export interface ConsumableDef {
  key: string;
  name: string;
  set: ConsumableSet;
  order: number;
  cost: number;
  pos: AtlasPos;
  minSelect: number;
  maxSelect: number;
  handType?: PokerHandId; // Planet cards
  hidden?: boolean; // Soul / Black Hole / secret Planets
  desc: string;
}

export interface VoucherDef {
  key: string;
  name: string;
  order: number;
  tier: 1 | 2;
  requires?: string;
  cost: number;
  pos: AtlasPos;
  desc: string;
}

export interface BoosterDef {
  key: string;
  name: string;
  kind: BoosterKind;
  size: BoosterSize;
  order: number;
  cost: number;
  weight: number;
  extra: number;
  choose: number;
  pos: AtlasPos;
  desc: string;
}

export interface BlindDef {
  key: string;
  name: string;
  order: number;
  slot: BlindSlot;
  showdown: boolean;
  minAnte: number;
  mult: number;
  dollars: number;
  bossColor: string;
  pos: AtlasPos;
  debuffSuit?: Suit;
  debuffFace?: boolean;
  desc: string;
}

export interface TagDef {
  key: string;
  name: string;
  order: number;
  minAnte: number;
  pos: AtlasPos;
  desc: string;
}

export interface DeckDef {
  key: string;
  name: string;
  order: number;
  pos: AtlasPos;
  desc: string;
  config: {
    hands?: number;
    discards?: number;
    dollars?: number;
    jokerSlots?: number;
    consumableSlots?: number;
    handSize?: number;
    anteScaling?: number;
    spectralRate?: number;
    extraHandBonus?: number;
    extraDiscardBonus?: number;
    noInterest?: boolean;
    vouchers?: string[];
    consumables?: string[];
    removeFaces?: boolean;
    checkered?: boolean;
    randomizeRankSuit?: boolean;
    plasma?: boolean;
    anaglyph?: boolean;
  };
}

export interface StakeDef {
  level: StakeLevel;
  key: string;
  name: string;
  pos: AtlasPos;
  color: string;
  scaling: 1 | 2 | 3;
  desc: string;
}

export interface ChallengeDef {
  key: string;
  name: string;
  order: number;
  desc: string;
  rules: {
    custom?: Array<{ id: string; value?: number | string | boolean }>;
    modifiers?: Array<{ id: string; value: number }>;
  };
  jokers: Array<{ id: string; eternal?: boolean; edition?: EditionId; pinned?: boolean }>;
  consumables: Array<{ id: string }>;
  vouchers: Array<{ id: string }>;
  deck?: {
    type?: string;
    enhancement?: EnhancementId;
    noRanks?: Rank[];
    noSuits?: Suit[];
    cards?: Array<{ s: 'H' | 'D' | 'S' | 'C'; r: string; e?: EnhancementId; d?: EditionId; g?: SealId }>;
  };
  restrictions: {
    bannedCards?: string[];
    bannedTags?: string[];
    bannedOther?: string[];
  };
}

// ============================================================================
// Simulation Actions & Input Contract
// ============================================================================

export type SimAction =
  | { type: 'START_RUN'; deckId: string; stake: StakeLevel; seed?: string; challengeId?: string | null }
  | { type: 'SELECT_BLIND' }
  | { type: 'SKIP_BLIND' }
  | { type: 'TOGGLE_SELECT_CARD'; cardId: string }
  | { type: 'DESELECT_ALL' }
  | { type: 'REORDER_HAND'; fromIndex: number; toIndex: number }
  | { type: 'REORDER_JOKERS'; fromIndex: number; toIndex: number }
  | { type: 'SORT_HAND'; mode: SortMode }
  | { type: 'PLAY_HAND' }
  | { type: 'DISCARD_HAND' }
  | { type: 'FINISH_SCORING' }
  | { type: 'FINISH_CASHOUT' }
  | { type: 'SHOP_REROLL' }
  | { type: 'SHOP_BUY_OFFER'; offerId: string; useImmediately?: boolean }
  | { type: 'SHOP_BUY_VOUCHER'; voucherOfferId: string }
  | { type: 'SHOP_BUY_BOOSTER'; boosterOfferId: string }
  | { type: 'SHOP_NEXT_ROUND' }
  | { type: 'SELL_JOKER'; jokerId: string }
  | { type: 'SELL_CONSUMABLE'; consumableId: string }
  | { type: 'USE_CONSUMABLE'; consumableId: string; targetCardIds?: string[] }
  | { type: 'PACK_PICK'; packCardId: string; targetCardIds?: string[] }
  | { type: 'PACK_SKIP' }
  | { type: 'REROLL_BOSS' }
  | { type: 'CONTINUE_ENDLESS' }
  | { type: 'RETURN_TO_TITLE' }
  | {
      type: 'DEBUG_MUTATE';
      op:
        | 'WARP_ANTE'
        | 'GRANT_JOKER'
        | 'GRANT_CONSUMABLE'
        | 'GRANT_VOUCHER'
        | 'GRANT_TAG'
        | 'SET_DOLLARS'
        | 'WIN_BLIND'
        | 'LOSE_BLIND';
      ante?: number;
      key?: string;
      edition?: EditionId;
      amount?: number;
    };

export interface InputFrame {
  tick: number;
  actions: SimAction[];
}

// ============================================================================
// Settings, Save Schema, Pack Manifest & Debug Bridge
// ============================================================================

export interface KeybindConfig {
  playHand: string;
  discardHand: string;
  sortRank: string;
  sortSuit: string;
  runInfo: string;
  pause: string;
  debugDrawer: string;
}

export interface RenderSettings {
  targetFps: TargetFps;
  gameSpeed: GameSpeed;
  crtAmount: number; // 0..100 (default 35)
  highContrastSuits: boolean;
  reducedMotion: boolean;
  masterVolume: number; // 0..1
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  artPackMode: ArtPackMode;
  keybinds: KeybindConfig;
}

export const DEFAULT_SETTINGS: RenderSettings = {
  targetFps: 120,
  gameSpeed: 1,
  crtAmount: 35,
  highContrastSuits: false,
  reducedMotion: false,
  masterVolume: 0.8,
  musicVolume: 0.65,
  sfxVolume: 0.85,
  artPackMode: 'builtin',
  keybinds: {
    playHand: 'Space',
    discardHand: 'KeyD',
    sortRank: 'KeyR',
    sortSuit: 'KeyS',
    runInfo: 'KeyI',
    pause: 'Escape',
    debugDrawer: 'F9',
  },
};

export interface ProfileProgress {
  discoveredJokers: string[];
  discoveredConsumables: string[];
  discoveredVouchers: string[];
  discoveredBlinds: string[];
  discoveredTags: string[];
  deckMaxStake: Record<string, StakeLevel>;
  challengesCompleted: string[];
  bestHandScore: number;
  runsPlayed: number;
  runsWon: number;
}

export interface SaveData {
  version: typeof SAVE_SCHEMA_VERSION;
  savedAt: string;
  settings: RenderSettings;
  profile: ProfileProgress;
  activeRun: SimState | null;
}

export interface PackManifest {
  version: number;
  source: 'builtin' | 'local-dev' | 'indexeddb';
  generatedAt: string;
  textures: Record<AtlasKey, { url1x: string; url2x: string; width1x: number; height1x: number; cellW: number; cellH: number }>;
  fontUrl?: string;
  sounds: Record<SoundKey, string>;
  shaders?: string[];
}

export interface PerfTelemetry {
  fps: number;
  targetFps: TargetFps;
  simHz: number;
  drawCalls: number;
  activeShaders: string[];
  artPackMode: ArtPackMode;
  customPackLoaded: boolean;
  audioMode: 'builtin' | 'custom';
}

export interface DebugBridge {
  getState(): SimState;
  getStateHash(): string;
  dispatch(action: SimAction): SimState;
  stepTicks(n: number): void;
  getPerf(): PerfTelemetry;
  getCatalogSummary(): Record<string, number>;
  warpAnte(ante: number, bossKey?: string): SimState;
  grantJoker(key: string, edition?: EditionId): SimState;
  grantConsumable(key: string, edition?: EditionId): SimState;
  grantVoucher(key: string): SimState;
  grantTag(key: string): SimState;
  setDollars(amount: number): SimState;
  winCurrentBlind(): SimState;
  setArtPackMode(mode: ArtPackMode): Promise<void>;
  setSettings(partial: Partial<RenderSettings>): void;
  resetSave(): void;
}

// ============================================================================
// Cross-Module Runtime Contracts (Data <-> Sim <-> Audio <-> Render)
// ============================================================================

export type JokerHookStage =
  | 'before'
  | 'individual_play'
  | 'individual_hand'
  | 'joker_main'
  | 'after'
  | 'discard'
  | 'repetition_play'
  | 'repetition_hand'
  | 'end_of_round'
  | 'setting_blind'
  | 'skip_blind'
  | 'skipping_booster'
  | 'buying_card'
  | 'selling_card'
  | 'reroll_shop'
  | 'open_booster'
  | 'using_consumeable'
  | 'cards_destroyed'
  | 'card_added'
  | 'first_hand_drawn'
  | 'calc_dollar_bonus';

export interface JokerEvalContext {
  stage: JokerHookStage;
  state: SimState;
  joker: JokerInstance;
  jokerIndex: number;
  isBlueprint?: boolean;
  blueprintSource?: JokerInstance;
  handEval?: HandEvaluationResult;
  fullHand?: CardInstance[];
  scoringHand?: CardInstance[];
  heldCards?: CardInstance[];
  card?: CardInstance;
  removedCards?: CardInstance[];
  consumable?: ConsumableInstance;
  itemKey?: string;
  itemKind?: string;
  probMultiplier: number;
  rand: (key: string) => number;
  randInt: (key: string, max: number) => number;
  isFace: (card: CardInstance) => boolean;
  isSuit: (card: CardInstance, suit: Suit) => boolean;
}

export interface JokerEvalResult {
  chips?: number;
  mult?: number;
  xMult?: number;
  dollars?: number;
  repetitions?: number;
  message?: string;
  color?: string;
  sound?: SoundKey;
  levelUpHand?: PokerHandId;
  createConsumable?: { set: ConsumableSet; key?: string; edition?: EditionId };
  createJoker?: { key?: string; rarity?: Rarity; edition?: EditionId };
  destroySelf?: boolean;
  destroyCardId?: string;
  destroyJokerId?: string;
  cloneCardId?: string;
  addStoneCard?: boolean;
  addSellValue?: number;
  disableBoss?: boolean;
  saveRun?: boolean;
  setCardEnhancement?: { cardId: string; enhancement: EnhancementId };
}

export type JokerHookFn = (ctx: JokerEvalContext) => JokerEvalResult | null;

export interface SimStepResult {
  state: SimState;
  beats: ScoreBeat[];
  events: SimEvent[];
}

export interface HandPreview {
  handId: PokerHandId;
  displayName: string;
  baseChips: number;
  baseMult: number;
  level: number;
  scoringCardIds: string[];
}

export interface IAudioEngine {
  unlock(): Promise<void>;
  setSettings(settings: Pick<RenderSettings, 'masterVolume' | 'musicVolume' | 'sfxVolume'>): void;
  setCustomPack(sounds: Record<SoundKey, string> | null): Promise<void>;
  setMusicContext(track: MusicTrackId, intensity?: number): void;
  setFireIntensity(intensity: number): void;
  playSfx(key: SoundKey, opts?: { pitch?: number; volume?: number }): void;
  update(dt: number): void;
  getMode(): 'builtin' | 'custom';
  dispose(): void;
}

declare global {
  interface Window {
    __KRUNKED_DEBUG__?: DebugBridge;
  }
}
