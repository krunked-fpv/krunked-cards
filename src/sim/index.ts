import type {
  BlindSlotState,
  CardInstance,
  HandEvaluationResult,
  HandPreview,
  JokerInstance,
  RngState,
  SimAction,
  SimState,
  SimStepResult,
  StakeLevel,
  Suit,
} from '../contracts/index.ts';

// Skeleton barrel replaced exclusively by @simcore in Wave 1.
export function pseudohash(_str: string): number {
  return 0.5;
}

export function createRngState(seed = 'KRUNKED1'): RngState {
  return { seed, hashedSeed: 0.5, streams: {}, calls: 0 };
}

export function nextRandom(_rng: RngState, _key: string): number {
  return 0.5;
}

export function nextRandomInt(_rng: RngState, _key: string, max: number): number {
  return max > 0 ? 0 : 0;
}

export function hashSimState(_state: SimState): string {
  return '00000000';
}

export function evaluatePokerHand(
  _cards: CardInstance[],
  _jokers: JokerInstance[] = []
): HandEvaluationResult {
  return {
    handId: 'High Card',
    displayName: 'High Card',
    scoringCards: [],
    containedHands: ['High Card'],
  };
}

export function previewSelectedHand(_state: SimState): HandPreview | null {
  return null;
}

export function createTitleState(_seed?: string): SimState {
  throw new Error('SimCore skeleton not yet implemented');
}

export function startRun(
  _deckId: string,
  _stake: StakeLevel,
  _seed?: string,
  _challengeId?: string | null
): SimStepResult {
  throw new Error('SimCore skeleton not yet implemented');
}

export function dispatchSim(_state: SimState, _action: SimAction): SimStepResult {
  throw new Error('SimCore skeleton not yet implemented');
}

export function stepSimTick(state: SimState): SimState {
  return { ...state, tick: state.tick + 1 };
}

export function getEffectiveJokerSlots(state: SimState): number {
  return state.jokerSlots;
}

export function getEffectiveConsumableSlots(state: SimState): number {
  return state.consumableSlots;
}

export function isCardFace(_card: CardInstance, _jokers: JokerInstance[]): boolean {
  return false;
}

export function isCardSuit(_card: CardInstance, _suit: Suit, _jokers: JokerInstance[]): boolean {
  return false;
}

export function getActiveBlind(state: SimState): BlindSlotState {
  return state.blinds[state.activeBlindSlot];
}
