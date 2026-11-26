import {
  POKER_HAND_IDS,
  RANKS,
  SUITS,
  type CardInstance,
  type ConsumableSet,
  type EditionId,
  type EnhancementId,
  type PokerHandId,
  type Rank,
  type SimEvent,
  type SimState,
  type Suit,
} from '../contracts/index.ts';
import { CONSUMABLE_MAP, JOKER_MAP, evaluateJokerHook } from '../data/index.ts';
import { isCardFace, isCardSuit } from './poker.ts';
import { nextRandom, nextRandomInt, pickRandom, shuffleDeterministic } from './prng.ts';
import {
  PLANET_HAND_FALLBACK,
  createCardInstance,
  createConsumableInstance,
  createJokerInstance,
  getCardById,
  getEffectiveConsumableSlots,
  getEffectiveHandSize,
  getEffectiveJokerSlots,
  getProbabilityMultiplier,
  inferConsumableSet,
  pickConsumableDefFromPool,
  pickJokerDefFromPool,
  safeNum,
  sortHandIds,
} from './shop.ts';

const CARD_TARGET_CONSUMABLES: Record<string, { min: number; max: number }> = {
  c_magician: { min: 1, max: 2 },
  c_empress: { min: 1, max: 2 },
  c_heirophant: { min: 1, max: 2 },
  c_hierophant: { min: 1, max: 2 },
  c_lovers: { min: 1, max: 1 },
  c_chariot: { min: 1, max: 1 },
  c_justice: { min: 1, max: 1 },
  c_strength: { min: 1, max: 2 },
  c_hanged_man: { min: 1, max: 2 },
  c_death: { min: 2, max: 2 },
  c_devil: { min: 1, max: 1 },
  c_tower: { min: 1, max: 1 },
  c_star: { min: 1, max: 3 },
  c_moon: { min: 1, max: 3 },
  c_sun: { min: 1, max: 3 },
  c_world: { min: 1, max: 3 },
  c_talisman: { min: 1, max: 1 },
  c_aura: { min: 1, max: 1 },
  c_deja_vu: { min: 1, max: 1 },
  c_trance: { min: 1, max: 1 },
  c_medium: { min: 1, max: 1 },
  c_cryptid: { min: 1, max: 1 },
};

const HAND_REQUIRED_SPECTRALS = new Set([
  'c_familiar',
  'c_grim',
  'c_incantation',
  'c_sigil',
  'c_ouija',
  'c_immolate',
]);

const ENHANCEMENT_CHOICES: EnhancementId[] = [
  'm_bonus',
  'm_mult',
  'm_wild',
  'm_glass',
  'm_steel',
  'm_gold',
  'm_lucky',
];

const FACE_RANKS: Rank[] = ['Jack', 'Queen', 'King'];
const NUMBER_RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10'];

export interface ConsumableValidation {
  ok: boolean;
  reason?: string;
}

export function getConsumableSelectRange(key: string): { min: number; max: number } {
  const def = CONSUMABLE_MAP[key];
  if (def) return { min: def.minSelect, max: def.maxSelect };
  return CARD_TARGET_CONSUMABLES[key] ?? { min: 0, max: 0 };
}

export function canUseConsumable(
  state: SimState,
  key: string,
  targetCardIds: readonly string[],
  freeingOneSlot = false
): ConsumableValidation {
  const allowedPhases = new Set(['PLAYING', 'SHOP', 'BLIND_SELECT', 'PACK_OPEN']);
  if (!allowedPhases.has(state.phase)) {
    return { ok: false, reason: 'Cannot use consumable in current phase' };
  }

  const range = getConsumableSelectRange(key);
  if (range.min > 0) {
    if (state.hand.length === 0) {
      return { ok: false, reason: 'Requires cards in hand to target' };
    }
    if (targetCardIds.length < range.min || targetCardIds.length > range.max) {
      return {
        ok: false,
        reason:
          range.min === range.max
            ? `Select exactly ${range.min} card${range.min === 1 ? '' : 's'}`
            : `Select ${range.min} to ${range.max} cards`,
      };
    }
    const handSet = new Set(state.hand);
    for (let i = 0; i < targetCardIds.length; i++) {
      if (!handSet.has(targetCardIds[i]) || !getCardById(state, targetCardIds[i])) {
        return { ok: false, reason: 'Selected target card is not in hand' };
      }
    }
  }

  if (HAND_REQUIRED_SPECTRALS.has(key) && state.hand.length === 0) {
    return { ok: false, reason: 'Requires cards in hand' };
  }

  const freeConsSlots =
    getEffectiveConsumableSlots(state) - state.consumables.length + (freeingOneSlot ? 1 : 0);

  switch (key) {
    case 'c_fool': {
      const last = state.tracking.lastTarotPlanetKey;
      if (!last || last === 'c_fool') {
        return { ok: false, reason: 'No previous Tarot or Planet card to copy' };
      }
      if (freeConsSlots <= 0) {
        return { ok: false, reason: 'No free consumable slot' };
      }
      return { ok: true };
    }
    case 'c_wheel_of_fortune': {
      if (!state.jokers.some((j) => j.edition === 'none')) {
        return { ok: false, reason: 'No editionless Joker available' };
      }
      return { ok: true };
    }
    case 'c_judgement':
    case 'c_wraith':
    case 'c_soul': {
      if (state.jokers.length >= getEffectiveJokerSlots(state)) {
        return { ok: false, reason: 'No free Joker slot' };
      }
      return { ok: true };
    }
    case 'c_aura': {
      const card = getCardById(state, targetCardIds[0]);
      if (!card || card.edition !== 'none') {
        return { ok: false, reason: 'Target card already has an edition' };
      }
      return { ok: true };
    }
    case 'c_ectoplasm': {
      if (!state.jokers.some((j) => j.edition === 'none')) {
        return { ok: false, reason: 'No editionless Joker available' };
      }
      if (getEffectiveHandSize(state) <= 1) {
        return { ok: false, reason: 'Hand size too low' };
      }
      return { ok: true };
    }
    case 'c_hex': {
      if (!state.jokers.some((j) => j.edition === 'none')) {
        return { ok: false, reason: 'No editionless Joker available' };
      }
      return { ok: true };
    }
    case 'c_ankh': {
      if (state.jokers.length === 0) {
        return { ok: false, reason: 'No Joker to copy' };
      }
      const eternalCount = state.jokers.filter((j) => j.eternal).length;
      if (eternalCount >= getEffectiveJokerSlots(state)) {
        return { ok: false, reason: 'No free Joker slot for copy' };
      }
      return { ok: true };
    }
    default:
      return { ok: true };
  }
}

export function notifyJokersCardsDestroyed(
  state: SimState,
  removedCards: CardInstance[],
  events: SimEvent[]
): void {
  if (removedCards.length === 0) return;
  const probMultiplier = getProbabilityMultiplier(state.jokers);
  const rand = (k: string) => nextRandom(state.rng, k);
  const randInt = (k: string, max: number) => nextRandomInt(state.rng, k, max);
  const isFace = (c: CardInstance) => isCardFace(c, state.jokers);
  const isSuit = (c: CardInstance, s: Suit) => isCardSuit(c, s, state.jokers);

  for (let i = 0; i < state.jokers.length; i++) {
    const joker = state.jokers[i];
    if (joker.debuffed) continue;
    const res = evaluateJokerHook(joker.key, {
      stage: 'cards_destroyed',
      state,
      joker,
      jokerIndex: i,
      removedCards,
      probMultiplier,
      rand,
      randInt,
      isFace,
      isSuit,
    });
    if (res?.dollars) {
      state.dollars = safeNum(state.dollars + res.dollars, state.dollars);
    }
    if (res?.message) {
      events.push({ type: 'CONSUMABLE_USED', message: res.message, sound: res.sound });
    }
  }
}

export function notifyJokersCardAdded(
  state: SimState,
  addedCard: CardInstance,
  events: SimEvent[]
): void {
  const probMultiplier = getProbabilityMultiplier(state.jokers);
  const rand = (k: string) => nextRandom(state.rng, k);
  const randInt = (k: string, max: number) => nextRandomInt(state.rng, k, max);
  const isFace = (c: CardInstance) => isCardFace(c, state.jokers);
  const isSuit = (c: CardInstance, s: Suit) => isCardSuit(c, s, state.jokers);

  for (let i = 0; i < state.jokers.length; i++) {
    const joker = state.jokers[i];
    if (joker.debuffed) continue;
    const res = evaluateJokerHook(joker.key, {
      stage: 'card_added',
      state,
      joker,
      jokerIndex: i,
      card: addedCard,
      probMultiplier,
      rand,
      randInt,
      isFace,
      isSuit,
    });
    if (res?.dollars) {
      state.dollars = safeNum(state.dollars + res.dollars, state.dollars);
    }
    if (res?.message) {
      events.push({ type: 'CARD_CREATED', message: res.message, sound: res.sound });
    }
  }
}

function destroyCardsFromState(
  state: SimState,
  cardIds: readonly string[],
  events: SimEvent[]
): CardInstance[] {
  const idSet = new Set(cardIds);
  const removed: CardInstance[] = [];
  state.fullDeck = state.fullDeck.filter((c) => {
    if (idSet.has(c.id)) {
      removed.push(c);
      return false;
    }
    return true;
  });
  state.hand = state.hand.filter((id) => !idSet.has(id));
  state.drawPile = state.drawPile.filter((id) => !idSet.has(id));
  state.playArea = state.playArea.filter((id) => !idSet.has(id));
  state.discardPile = state.discardPile.filter((id) => !idSet.has(id));
  state.selectedCardIds = state.selectedCardIds.filter((id) => !idSet.has(id));

  if (removed.length > 0) {
    state.tracking.cardsDestroyedTotal += removed.length;
    for (let i = 0; i < removed.length; i++) {
      events.push({
        type: 'CARD_DESTROYED',
        message: `Destroyed ${removed[i].rank} of ${removed[i].suit}`,
        sound: 'slice1',
        payload: { cardId: removed[i].id },
      });
    }
    notifyJokersCardsDestroyed(state, removed, events);
  }
  return removed;
}

function levelUpPokerHand(state: SimState, handId: PokerHandId, levels = 1): void {
  const hl = state.handLevels[handId];
  if (!hl) return;
  hl.level += levels;
  hl.chips += hl.lChips * levels;
  hl.mult += hl.lMult * levels;
  hl.visible = true;
}

function rollWheelEdition(state: SimState, streamKey: string): EditionId {
  const r = nextRandom(state.rng, streamKey);
  if (r < 0.5) return 'e_foil';
  if (r < 0.85) return 'e_holo';
  return 'e_polychrome';
}

function stepRankUp(rank: Rank): Rank {
  const idx = RANKS.indexOf(rank);
  if (idx < 0) return 'Ace';
  return RANKS[(idx + 1) % RANKS.length];
}

export interface ApplyConsumableResult {
  ok: boolean;
  error?: string;
  events: SimEvent[];
}

export function applyConsumable(
  state: SimState,
  key: string,
  targetCardIds: readonly string[],
  opts?: { set?: ConsumableSet; edition?: EditionId }
): ApplyConsumableResult {
  const events: SimEvent[] = [];
  const def = CONSUMABLE_MAP[key];
  const set: ConsumableSet = opts?.set ?? def?.set ?? inferConsumableSet(key);

  // Order target cards in left-to-right hand order (critical for Death!)
  const targetSet = new Set(targetCardIds);
  const orderedTargetIds = state.hand.filter((id) => targetSet.has(id));
  const targetCards = orderedTargetIds
    .map((id) => getCardById(state, id))
    .filter((c): c is CardInstance => Boolean(c));

  const probMultiplier = getProbabilityMultiplier(state.jokers);

  // Planets (all 12)
  const planetHand: PokerHandId | undefined = def?.handType ?? PLANET_HAND_FALLBACK[key];
  if (set === 'Planet' && planetHand) {
    levelUpPokerHand(state, planetHand, 1);
    events.push({
      type: 'CONSUMABLE_USED',
      message: `${planetHand} Level ${state.handLevels[planetHand].level}!`,
      sound: 'tarot1',
      payload: { key, set, handId: planetHand },
    });
  } else {
    switch (key) {
      // ---- TAROTS ----
      case 'c_fool': {
        const lastKey = state.tracking.lastTarotPlanetKey;
        if (lastKey && lastKey !== 'c_fool' && state.consumables.length < getEffectiveConsumableSlots(state)) {
          const copy = createConsumableInstance(state, lastKey);
          state.consumables.push(copy);
          events.push({
            type: 'CONSUMABLE_USED',
            message: `Created ${CONSUMABLE_MAP[lastKey]?.name ?? lastKey}`,
            sound: 'tarot1',
            payload: { key, createdKey: lastKey },
          });
        }
        break;
      }
      case 'c_magician': {
        for (let i = 0; i < targetCards.length; i++) targetCards[i].enhancement = 'm_lucky';
        events.push({ type: 'CONSUMABLE_USED', message: 'Enhanced to Lucky', sound: 'tarot1' });
        break;
      }
      case 'c_high_priestess': {
        let created = 0;
        for (let i = 0; i < 2; i++) {
          if (state.consumables.length >= getEffectiveConsumableSlots(state)) break;
          const p = pickConsumableDefFromPool(state, 'Planet', `priestess_${state.round}_${i}`);
          const pKey = p?.key ?? 'c_pluto';
          state.consumables.push(createConsumableInstance(state, pKey));
          created++;
        }
        events.push({
          type: 'CONSUMABLE_USED',
          message: created > 0 ? `Created ${created} Planet${created > 1 ? 's' : ''}` : 'No slot available',
          sound: 'tarot1',
        });
        break;
      }
      case 'c_empress': {
        for (let i = 0; i < targetCards.length; i++) targetCards[i].enhancement = 'm_mult';
        events.push({ type: 'CONSUMABLE_USED', message: 'Enhanced to Mult', sound: 'tarot1' });
        break;
      }
      case 'c_emperor': {
        let created = 0;
        for (let i = 0; i < 2; i++) {
          if (state.consumables.length >= getEffectiveConsumableSlots(state)) break;
          const t = pickConsumableDefFromPool(state, 'Tarot', `emperor_${state.round}_${i}`);
          const tKey = t?.key ?? 'c_empress';
          state.consumables.push(createConsumableInstance(state, tKey));
          created++;
        }
        events.push({
          type: 'CONSUMABLE_USED',
          message: created > 0 ? `Created ${created} Tarot${created > 1 ? 's' : ''}` : 'No slot available',
          sound: 'tarot1',
        });
        break;
      }
      case 'c_heirophant':
      case 'c_hierophant': {
        for (let i = 0; i < targetCards.length; i++) targetCards[i].enhancement = 'm_bonus';
        events.push({ type: 'CONSUMABLE_USED', message: 'Enhanced to Bonus', sound: 'tarot1' });
        break;
      }
      case 'c_lovers': {
        for (let i = 0; i < targetCards.length; i++) targetCards[i].enhancement = 'm_wild';
        events.push({ type: 'CONSUMABLE_USED', message: 'Enhanced to Wild', sound: 'tarot1' });
        break;
      }
      case 'c_chariot': {
        for (let i = 0; i < targetCards.length; i++) targetCards[i].enhancement = 'm_steel';
        events.push({ type: 'CONSUMABLE_USED', message: 'Enhanced to Steel', sound: 'tarot1' });
        break;
      }
      case 'c_justice': {
        for (let i = 0; i < targetCards.length; i++) targetCards[i].enhancement = 'm_glass';
        events.push({ type: 'CONSUMABLE_USED', message: 'Enhanced to Glass', sound: 'tarot1' });
        break;
      }
      case 'c_hermit': {
        const gain = Math.max(0, Math.min(20, Math.floor(state.dollars)));
        state.dollars = safeNum(state.dollars + gain, state.dollars);
        events.push({ type: 'CONSUMABLE_USED', message: `+$${gain}`, sound: 'coin1' });
        break;
      }
      case 'c_wheel_of_fortune': {
        const eligible = state.jokers.filter((j) => j.edition === 'none');
        if (eligible.length > 0 && nextRandom(state.rng, 'wheel_of_fortune') < (1 * probMultiplier) / 4) {
          const picked = pickRandom(eligible, state.rng, 'wheel_target') ?? eligible[0];
          const ed = rollWheelEdition(state, 'wheel_edition');
          picked.edition = ed;
          const sound = ed === 'e_foil' ? 'foil1' : ed === 'e_holo' ? 'holo1' : 'polychrome1';
          events.push({
            type: 'CONSUMABLE_USED',
            message: `${JOKER_MAP[picked.key]?.name ?? picked.key} gained ${ed}!`,
            sound,
          });
        } else {
          events.push({ type: 'CONSUMABLE_USED', message: 'Nope!', sound: 'cancel' });
        }
        break;
      }
      case 'c_strength': {
        for (let i = 0; i < targetCards.length; i++) {
          targetCards[i].rank = stepRankUp(targetCards[i].rank);
        }
        sortHandIds(state, state.sortMode);
        events.push({ type: 'CONSUMABLE_USED', message: 'Rank Increased!', sound: 'tarot1' });
        break;
      }
      case 'c_hanged_man': {
        destroyCardsFromState(state, orderedTargetIds, events);
        events.push({ type: 'CONSUMABLE_USED', message: 'Cards Destroyed', sound: 'tarot1' });
        break;
      }
      case 'c_death': {
        if (targetCards.length >= 2) {
          const left = targetCards[0];
          const right = targetCards[1];
          left.suit = right.suit;
          left.rank = right.rank;
          left.enhancement = right.enhancement;
          left.edition = right.edition;
          left.seal = right.seal;
          left.permaBonus = right.permaBonus;
          sortHandIds(state, state.sortMode);
          events.push({
            type: 'CONSUMABLE_USED',
            message: `Converted to ${right.rank} of ${right.suit}`,
            sound: 'tarot1',
          });
        }
        break;
      }
      case 'c_temperance': {
        let sum = 0;
        for (let i = 0; i < state.jokers.length; i++) {
          sum += Math.max(0, state.jokers[i].sellValue);
        }
        const gain = Math.min(50, sum);
        state.dollars = safeNum(state.dollars + gain, state.dollars);
        events.push({ type: 'CONSUMABLE_USED', message: `+$${gain}`, sound: 'coin1' });
        break;
      }
      case 'c_devil': {
        for (let i = 0; i < targetCards.length; i++) targetCards[i].enhancement = 'm_gold';
        events.push({ type: 'CONSUMABLE_USED', message: 'Enhanced to Gold', sound: 'tarot1' });
        break;
      }
      case 'c_tower': {
        for (let i = 0; i < targetCards.length; i++) targetCards[i].enhancement = 'm_stone';
        events.push({ type: 'CONSUMABLE_USED', message: 'Enhanced to Stone', sound: 'tarot1' });
        break;
      }
      case 'c_star': {
        for (let i = 0; i < targetCards.length; i++) targetCards[i].suit = 'Diamonds';
        sortHandIds(state, state.sortMode);
        events.push({ type: 'CONSUMABLE_USED', message: 'Converted to Diamonds', sound: 'tarot1' });
        break;
      }
      case 'c_moon': {
        for (let i = 0; i < targetCards.length; i++) targetCards[i].suit = 'Clubs';
        sortHandIds(state, state.sortMode);
        events.push({ type: 'CONSUMABLE_USED', message: 'Converted to Clubs', sound: 'tarot1' });
        break;
      }
      case 'c_sun': {
        for (let i = 0; i < targetCards.length; i++) targetCards[i].suit = 'Hearts';
        sortHandIds(state, state.sortMode);
        events.push({ type: 'CONSUMABLE_USED', message: 'Converted to Hearts', sound: 'tarot1' });
        break;
      }
      case 'c_world': {
        for (let i = 0; i < targetCards.length; i++) targetCards[i].suit = 'Spades';
        sortHandIds(state, state.sortMode);
        events.push({ type: 'CONSUMABLE_USED', message: 'Converted to Spades', sound: 'tarot1' });
        break;
      }
      case 'c_judgement': {
        if (state.jokers.length < getEffectiveJokerSlots(state)) {
          const jDef = pickJokerDefFromPool(state, `judgement_${state.round}`);
          const inst = createJokerInstance(state, jDef?.key ?? 'j_joker', {
            eternal: state.tracking.allEternal && (jDef?.eternalCompat ?? true),
          });
          state.jokers.push(inst);
          events.push({
            type: 'CONSUMABLE_USED',
            message: `Created ${JOKER_MAP[inst.key]?.name ?? inst.key}`,
            sound: 'tarot1',
          });
        }
        break;
      }

      // ---- SPECTRALS ----
      case 'c_familiar': {
        if (state.hand.length > 0) {
          const victimId = pickRandom(state.hand, state.rng, 'familiar_destroy');
          if (victimId) destroyCardsFromState(state, [victimId], events);
          for (let i = 0; i < 3; i++) {
            const suit = pickRandom(SUITS, state.rng, `familiar_s_${i}`) ?? 'Spades';
            const rank = pickRandom(FACE_RANKS, state.rng, `familiar_r_${i}`) ?? 'King';
            const enh = pickRandom(ENHANCEMENT_CHOICES, state.rng, `familiar_e_${i}`) ?? 'm_bonus';
            const card = createCardInstance(state, suit, rank, { enhancement: enh });
            state.fullDeck.push(card);
            state.hand.push(card.id);
            events.push({ type: 'CARD_CREATED', message: `Added ${rank} of ${suit}`, sound: 'card1' });
            notifyJokersCardAdded(state, card, events);
          }
          sortHandIds(state, state.sortMode);
        }
        events.push({ type: 'CONSUMABLE_USED', message: 'Familiar cast!', sound: 'tarot2' });
        break;
      }
      case 'c_grim': {
        if (state.hand.length > 0) {
          const victimId = pickRandom(state.hand, state.rng, 'grim_destroy');
          if (victimId) destroyCardsFromState(state, [victimId], events);
          for (let i = 0; i < 2; i++) {
            const suit = pickRandom(SUITS, state.rng, `grim_s_${i}`) ?? 'Spades';
            const enh = pickRandom(ENHANCEMENT_CHOICES, state.rng, `grim_e_${i}`) ?? 'm_bonus';
            const card = createCardInstance(state, suit, 'Ace', { enhancement: enh });
            state.fullDeck.push(card);
            state.hand.push(card.id);
            events.push({ type: 'CARD_CREATED', message: `Added Ace of ${suit}`, sound: 'card1' });
            notifyJokersCardAdded(state, card, events);
          }
          sortHandIds(state, state.sortMode);
        }
        events.push({ type: 'CONSUMABLE_USED', message: 'Grim cast!', sound: 'tarot2' });
        break;
      }
      case 'c_incantation': {
        if (state.hand.length > 0) {
          const victimId = pickRandom(state.hand, state.rng, 'incant_destroy');
          if (victimId) destroyCardsFromState(state, [victimId], events);
          for (let i = 0; i < 4; i++) {
            const suit = pickRandom(SUITS, state.rng, `incant_s_${i}`) ?? 'Hearts';
            const rank = pickRandom(NUMBER_RANKS, state.rng, `incant_r_${i}`) ?? '7';
            const enh = pickRandom(ENHANCEMENT_CHOICES, state.rng, `incant_e_${i}`) ?? 'm_bonus';
            const card = createCardInstance(state, suit, rank, { enhancement: enh });
            state.fullDeck.push(card);
            state.hand.push(card.id);
            events.push({ type: 'CARD_CREATED', message: `Added ${rank} of ${suit}`, sound: 'card1' });
            notifyJokersCardAdded(state, card, events);
          }
          sortHandIds(state, state.sortMode);
        }
        events.push({ type: 'CONSUMABLE_USED', message: 'Incantation cast!', sound: 'tarot2' });
        break;
      }
      case 'c_talisman': {
        for (let i = 0; i < targetCards.length; i++) targetCards[i].seal = 'Gold';
        events.push({ type: 'CONSUMABLE_USED', message: 'Added Gold Seal', sound: 'gold_seal' });
        break;
      }
      case 'c_aura': {
        if (targetCards[0]) {
          const ed = rollWheelEdition(state, 'aura_edition');
          targetCards[0].edition = ed;
          const sound = ed === 'e_foil' ? 'foil1' : ed === 'e_holo' ? 'holo1' : 'polychrome1';
          events.push({ type: 'CONSUMABLE_USED', message: `Applied ${ed}!`, sound });
        }
        break;
      }
      case 'c_wraith': {
        if (state.jokers.length < getEffectiveJokerSlots(state)) {
          const jDef = pickJokerDefFromPool(state, `wraith_${state.round}`, { forcedRarity: 3 });
          const inst = createJokerInstance(state, jDef?.key ?? 'j_joker', {
            eternal: state.tracking.allEternal && (jDef?.eternalCompat ?? true),
          });
          state.jokers.push(inst);
          state.dollars = 0;
          events.push({
            type: 'CONSUMABLE_USED',
            message: `Created Rare ${JOKER_MAP[inst.key]?.name ?? inst.key}; $0!`,
            sound: 'tarot2',
          });
        }
        break;
      }
      case 'c_sigil': {
        const chosenSuit = pickRandom(SUITS, state.rng, 'sigil_suit') ?? 'Spades';
        for (let i = 0; i < state.hand.length; i++) {
          const c = getCardById(state, state.hand[i]);
          if (c) c.suit = chosenSuit;
        }
        sortHandIds(state, state.sortMode);
        events.push({ type: 'CONSUMABLE_USED', message: `Hand converted to ${chosenSuit}`, sound: 'tarot2' });
        break;
      }
      case 'c_ouija': {
        const chosenRank = pickRandom(RANKS, state.rng, 'ouija_rank') ?? 'Ace';
        for (let i = 0; i < state.hand.length; i++) {
          const c = getCardById(state, state.hand[i]);
          if (c) c.rank = chosenRank;
        }
        state.handSize = Math.max(1, state.handSize - 1);
        sortHandIds(state, state.sortMode);
        events.push({
          type: 'CONSUMABLE_USED',
          message: `Hand converted to ${chosenRank} (-1 Hand Size)`,
          sound: 'tarot2',
        });
        break;
      }
      case 'c_ectoplasm': {
        const eligible = state.jokers.filter((j) => j.edition === 'none');
        if (eligible.length > 0) {
          const target = pickRandom(eligible, state.rng, 'ectoplasm_target') ?? eligible[0];
          target.edition = 'e_negative';
          const penalty = 1 + state.tracking.ectoplasmUses;
          state.tracking.ectoplasmUses += 1;
          state.handSize = Math.max(1, state.handSize - penalty);
          events.push({
            type: 'CONSUMABLE_USED',
            message: `${JOKER_MAP[target.key]?.name ?? target.key} is now Negative (-${penalty} Hand Size)`,
            sound: 'negative',
          });
        }
        break;
      }
      case 'c_immolate': {
        const shuffled = shuffleDeterministic(state.hand, state.rng, 'immolate_pick');
        const victims = shuffled.slice(0, Math.min(5, shuffled.length));
        destroyCardsFromState(state, victims, events);
        state.dollars = safeNum(state.dollars + 20, state.dollars);
        events.push({ type: 'CONSUMABLE_USED', message: 'Destroyed 5 cards, +$20', sound: 'explosion1' });
        break;
      }
      case 'c_ankh': {
        if (state.jokers.length > 0) {
          const chosen = pickRandom(state.jokers, state.rng, 'ankh_pick') ?? state.jokers[0];
          const survivors = state.jokers.filter((j) => j.id === chosen.id || j.eternal);
          const destroyed = state.jokers.filter((j) => j.id !== chosen.id && !j.eternal);
          state.jokers = survivors;
          for (let i = 0; i < destroyed.length; i++) {
            events.push({
              type: 'JOKER_DESTROYED',
              message: `Destroyed ${JOKER_MAP[destroyed[i].key]?.name ?? destroyed[i].key}`,
              sound: 'slice1',
            });
          }
          if (state.jokers.length < getEffectiveJokerSlots(state)) {
            const clone = createJokerInstance(state, chosen.key, {
              edition: chosen.edition === 'e_negative' ? 'none' : chosen.edition,
              eternal: chosen.eternal,
              perishable: chosen.perishable,
              rental: chosen.rental,
              cost: chosen.cost,
            });
            clone.extraSellValue = chosen.extraSellValue;
            clone.sellValue = chosen.sellValue;
            clone.state = { ...chosen.state };
            state.jokers.push(clone);
          }
          events.push({
            type: 'CONSUMABLE_USED',
            message: `Copied ${JOKER_MAP[chosen.key]?.name ?? chosen.key}`,
            sound: 'tarot2',
          });
        }
        break;
      }
      case 'c_deja_vu': {
        for (let i = 0; i < targetCards.length; i++) targetCards[i].seal = 'Red';
        events.push({ type: 'CONSUMABLE_USED', message: 'Added Red Seal', sound: 'tarot2' });
        break;
      }
      case 'c_hex': {
        const eligible = state.jokers.filter((j) => j.edition === 'none');
        if (eligible.length > 0) {
          const chosen = pickRandom(eligible, state.rng, 'hex_pick') ?? eligible[0];
          chosen.edition = 'e_polychrome';
          const destroyed = state.jokers.filter((j) => j.id !== chosen.id && !j.eternal);
          state.jokers = state.jokers.filter((j) => j.id === chosen.id || j.eternal);
          for (let i = 0; i < destroyed.length; i++) {
            events.push({
              type: 'JOKER_DESTROYED',
              message: `Destroyed ${JOKER_MAP[destroyed[i].key]?.name ?? destroyed[i].key}`,
              sound: 'slice1',
            });
          }
          events.push({
            type: 'CONSUMABLE_USED',
            message: `${JOKER_MAP[chosen.key]?.name ?? chosen.key} is Polychrome!`,
            sound: 'polychrome1',
          });
        }
        break;
      }
      case 'c_trance': {
        for (let i = 0; i < targetCards.length; i++) targetCards[i].seal = 'Blue';
        events.push({ type: 'CONSUMABLE_USED', message: 'Added Blue Seal', sound: 'tarot2' });
        break;
      }
      case 'c_medium': {
        for (let i = 0; i < targetCards.length; i++) targetCards[i].seal = 'Purple';
        events.push({ type: 'CONSUMABLE_USED', message: 'Added Purple Seal', sound: 'tarot2' });
        break;
      }
      case 'c_cryptid': {
        const src = targetCards[0];
        if (src) {
          for (let i = 0; i < 2; i++) {
            const copy = createCardInstance(state, src.suit, src.rank, {
              enhancement: src.enhancement,
              edition: src.edition,
              seal: src.seal,
              permaBonus: src.permaBonus,
            });
            state.fullDeck.push(copy);
            state.hand.push(copy.id);
            events.push({
              type: 'CARD_CREATED',
              message: `Copied ${src.rank} of ${src.suit}`,
              sound: 'card1',
            });
            notifyJokersCardAdded(state, copy, events);
          }
          sortHandIds(state, state.sortMode);
          events.push({ type: 'CONSUMABLE_USED', message: 'Created 2 copies!', sound: 'tarot2' });
        }
        break;
      }
      case 'c_soul': {
        if (state.jokers.length < getEffectiveJokerSlots(state)) {
          const legDef =
            pickJokerDefFromPool(state, `soul_${state.round}`, { forcedRarity: 4 }) ??
            pickJokerDefFromPool(state, `soul_fb_${state.round}`, { forcedRarity: 3 });
          const inst = createJokerInstance(state, legDef?.key ?? 'j_joker', {
            eternal: state.tracking.allEternal && (legDef?.eternalCompat ?? true),
          });
          state.jokers.push(inst);
          events.push({
            type: 'CONSUMABLE_USED',
            message: `Summoned ${JOKER_MAP[inst.key]?.name ?? inst.key}!`,
            sound: 'timpani',
          });
        }
        break;
      }
      case 'c_black_hole': {
        for (let i = 0; i < POKER_HAND_IDS.length; i++) {
          const hl = state.handLevels[POKER_HAND_IDS[i]];
          if (hl) {
            hl.level += 1;
            hl.chips += hl.lChips;
            hl.mult += hl.lMult;
          }
        }
        events.push({
          type: 'CONSUMABLE_USED',
          message: 'All Poker Hands leveled up!',
          sound: 'timpani',
        });
        break;
      }
      default: {
        events.push({ type: 'CONSUMABLE_USED', message: `Used ${key}`, sound: 'tarot1' });
        break;
      }
    }
  }

  // Update usage counters & Fool history
  if (set === 'Tarot') {
    state.tracking.tarotsUsedTotal += 1;
    if (key !== 'c_fool') {
      state.tracking.lastTarotPlanetKey = key;
      state.tracking.lastTarotPlanetSet = 'Tarot';
    }
  } else if (set === 'Planet') {
    state.tracking.planetsUsedTotal += 1;
    state.tracking.lastTarotPlanetKey = key;
    state.tracking.lastTarotPlanetSet = 'Planet';
  } else {
    state.tracking.spectralsUsedTotal += 1;
  }

  // Notify Jokers listening to 'using_consumeable' (e.g. Constellation, Fortune Teller)
  const syntheticConsumable = {
    id: `used_${key}`,
    key,
    set,
    edition: opts?.edition ?? 'none',
    cost: def?.cost ?? 3,
    sellValue: 1,
  };
  const rand = (k: string) => nextRandom(state.rng, k);
  const randInt = (k: string, max: number) => nextRandomInt(state.rng, k, max);
  const isFace = (c: CardInstance) => isCardFace(c, state.jokers);
  const isSuit = (c: CardInstance, s: Suit) => isCardSuit(c, s, state.jokers);

  for (let i = 0; i < state.jokers.length; i++) {
    const joker = state.jokers[i];
    if (joker.debuffed) continue;
    const res = evaluateJokerHook(joker.key, {
      stage: 'using_consumeable',
      state,
      joker,
      jokerIndex: i,
      consumable: syntheticConsumable,
      itemKey: key,
      itemKind: set,
      probMultiplier,
      rand,
      randInt,
      isFace,
      isSuit,
    });
    if (res?.dollars) {
      state.dollars = safeNum(state.dollars + res.dollars, state.dollars);
    }
    if (res?.message) {
      events.push({ type: 'CONSUMABLE_USED', message: res.message, sound: res.sound });
    }
  }

  return { ok: true, events };
}
