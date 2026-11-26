import {
  PALETTE,
  POKER_HAND_IDS,
  RANKS,
  SUITS,
  type BlindDef,
  type BlindSlot,
  type BlindSlotState,
  type BoosterKind,
  type BoosterSize,
  type CardInstance,
  type EditionId,
  type JokerEvalResult,
  type JokerInstance,
  type PokerHandId,
  type Rank,
  type ScoreBeat,
  type SealId,
  type SimAction,
  type SimEvent,
  type SimState,
  type SimStepResult,
  type StakeLevel,
  type Suit,
} from '../contracts/index.ts';
import {
  BLIND_MAP,
  BLINDS,
  CHALLENGE_MAP,
  CONSUMABLE_MAP,
  DECK_MAP,
  JOKER_MAP,
  PLANETS,
  STAKE_MAP,
  TAGS,
  VOUCHER_MAP,
  evaluateJokerHook,
  getBlindAmount,
} from '../data/index.ts';
import {
  applyConsumable,
  canUseConsumable,
  notifyJokersCardAdded,
  notifyJokersCardsDestroyed,
} from './consumables.ts';
import { evaluatePokerHand, isCardFace, isCardSuit } from './poker.ts';
import { createRngState, nextRandom, nextRandomInt, pickRandom, shuffleDeterministic } from './prng.ts';
import { scorePlayedHand } from './scoring.ts';
import {
  PLANET_HAND_FALLBACK,
  addSimFlag,
  addUnusedDiscards,
  buildDefaultHandLevels,
  computeCashoutBreakdown,
  countActiveJoker,
  createCardInstance,
  createConsumableInstance,
  createJokerInstance,
  drawCardsToHand,
  generateAdditionalShopOffer,
  generateShop,
  generateShopOffers,
  getActiveBlind,
  getCardById,
  getEffectiveConsumableSlots,
  getEffectiveHandSize,
  getEffectiveJokerSlots,
  getProbabilityMultiplier,
  getSimMetaNum,
  getSimMetaStr,
  getUnusedDiscardsTotal,
  hasChallengeRule,
  hasSimFlag,
  normalizeEdition,
  normalizeSeal,
  openBoosterPack,
  pickConsumableDefFromPool,
  pickJokerDefFromPool,
  recalcJokerSellValue,
  repriceCurrentShop,
  resolveCopiedJoker,
  safeNum,
  setSimMetaNum,
  setSimMetaStr,
  sortHandIds,
} from './shop.ts';

function cloneState(state: SimState): SimState {
  return JSON.parse(JSON.stringify(state)) as SimState;
}

function getStakeScaling(stake: StakeLevel): 1 | 2 | 3 {
  const def = STAKE_MAP[stake];
  if (def) return def.scaling;
  if (stake >= 6) return 3;
  if (stake >= 3) return 2;
  return 1;
}

function syncBankruptAt(state: SimState): void {
  const creditCards = countActiveJoker(state, 'j_credit_card');
  state.bankruptAt = creditCards > 0 ? -20 * creditCards : 0;
}

function pickSkipTag(state: SimState, streamKey: string): string | null {
  const banned = new Set(state.tracking.bannedTags);
  const effectiveAnte = Math.max(1, state.ante);
  const eligible = TAGS.filter((t) => t.minAnte <= effectiveAnte && !banned.has(t.key));
  if (eligible.length === 0) return null;
  return pickRandom(eligible, state.rng, streamKey)?.key ?? eligible[0].key;
}

function pickBossBlind(state: SimState, forcedBossKey?: string, excludeKey?: string): BlindDef {
  if (forcedBossKey && BLIND_MAP[forcedBossKey]) {
    return BLIND_MAP[forcedBossKey];
  }

  const bannedBlinds = new Set([...state.tracking.bannedOthers, ...state.tracking.bannedKeys]);
  const effectiveAnte = Math.max(1, state.ante);
  const isShowdownAnte = state.ante >= 8 && state.ante % 8 === 0;
  const allBosses = BLINDS.filter((b) => b.slot === 'Boss' && !bannedBlinds.has(b.key));
  const poolBase = isShowdownAnte
    ? allBosses.filter((b) => b.showdown)
    : allBosses.filter((b) => !b.showdown && b.minAnte <= effectiveAnte);
  const fallbackPool =
    poolBase.length > 0
      ? poolBase
      : allBosses.length > 0
        ? allBosses
        : BLINDS.filter((b) => b.slot === 'Boss');

  const historySet = new Set(state.bossHistory);
  let unused = fallbackPool.filter((b) => !historySet.has(b.key) && b.key !== excludeKey);
  if (unused.length === 0) {
    // Cycle completed — reset history for this category
    const categoryKeys = new Set(fallbackPool.map((b) => b.key));
    state.bossHistory = state.bossHistory.filter((k) => !categoryKeys.has(k));
    const withoutExcluded = fallbackPool.filter((b) => b.key !== excludeKey);
    unused = withoutExcluded.length > 0 ? withoutExcluded : fallbackPool;
  }

  const picked = pickRandom(unused, state.rng, `boss_ante_${state.ante}`);
  if (picked) {
    state.bossHistory.push(picked.key);
    return picked;
  }

  // Clean fallback when catalog is empty in isolated unit tests
  return {
    key: 'bl_hook',
    name: 'The Hook',
    order: 3,
    slot: 'Boss',
    showdown: false,
    minAnte: 1,
    mult: 2,
    dollars: 5,
    bossColor: '#a84024',
    pos: { x: 0, y: 7 },
    desc: 'Discards 2 random cards per hand played',
  };
}

function computeTargetChips(state: SimState, mult: number): number {
  const base = getBlindAmount(state.ante, getStakeScaling(state.stake));
  return Math.max(1, Math.round(base * mult * state.anteScaling));
}

function generateAnteBlinds(state: SimState, forcedBossKey?: string): Record<BlindSlot, BlindSlotState> {
  const smallDef = BLIND_MAP['bl_small'];
  const bigDef = BLIND_MAP['bl_big'];
  const bossDef = pickBossBlind(state, forcedBossKey);

  const smallMult = smallDef?.mult ?? 1;
  const bigMult = bigDef?.mult ?? 1.5;

  const smallDollars =
    state.stake >= 2 || state.tracking.noReward || hasSimFlag(state, 'rule:no_reward_Small')
      ? 0
      : (smallDef?.dollars ?? 3);
  const bigDollars =
    state.tracking.noReward || hasSimFlag(state, 'rule:no_reward_Big')
      ? 0
      : (bigDef?.dollars ?? 4);
  const bossDollars =
    state.tracking.noReward || hasSimFlag(state, 'rule:no_reward_Boss')
      ? 0
      : bossDef.dollars;

  return {
    Small: {
      slot: 'Small',
      key: 'bl_small',
      name: smallDef?.name ?? 'Small Blind',
      status: 'Select',
      mult: smallMult,
      targetChips: computeTargetChips(state, smallMult),
      dollars: smallDollars,
      tagKey: pickSkipTag(state, `tag_small_${state.ante}`),
      bossColor: smallDef?.bossColor ?? '#3a55ab',
      triggered: false,
      disabled: false,
    },
    Big: {
      slot: 'Big',
      key: 'bl_big',
      name: bigDef?.name ?? 'Big Blind',
      status: 'Upcoming',
      mult: bigMult,
      targetChips: computeTargetChips(state, bigMult),
      dollars: bigDollars,
      tagKey: pickSkipTag(state, `tag_big_${state.ante}`),
      bossColor: bigDef?.bossColor ?? '#e0a23a',
      triggered: false,
      disabled: false,
    },
    Boss: {
      slot: 'Boss',
      key: bossDef.key,
      name: bossDef.name,
      status: 'Upcoming',
      mult: bossDef.mult,
      targetChips: computeTargetChips(state, bossDef.mult),
      dollars: bossDollars,
      tagKey: null,
      bossColor: bossDef.bossColor,
      triggered: false,
      disabled: false,
    },
  };
}

function refreshCardDebuffs(state: SimState): void {
  const blind = getActiveBlind(state);
  const isBossActive =
    (state.phase === 'PLAYING' || state.phase === 'SCORING' || blind.status === 'Current') &&
    blind.slot === 'Boss' &&
    !blind.disabled;
  const blindDef = BLIND_MAP[blind.key];
  const debuffPlayedCards = hasChallengeRule(state, 'debuff_played_cards');

  for (let i = 0; i < state.fullDeck.length; i++) {
    const card = state.fullDeck[i];
    // Reset debuffed before evaluating isCardSuit so Wild cards never oscillate
    card.debuffed = false;
    let debuffed = debuffPlayedCards && card.playedThisAnte;
    if (!debuffed && isBossActive) {
      if (blind.key === 'bl_plant' || blindDef?.debuffFace) {
        debuffed = isCardFace(card, state.jokers);
      } else if (blind.key === 'bl_club' || blindDef?.debuffSuit === 'Clubs') {
        debuffed = isCardSuit(card, 'Clubs', state.jokers);
      } else if (blind.key === 'bl_goad' || blindDef?.debuffSuit === 'Spades') {
        debuffed = isCardSuit(card, 'Spades', state.jokers);
      } else if (blind.key === 'bl_window' || blindDef?.debuffSuit === 'Diamonds') {
        debuffed = isCardSuit(card, 'Diamonds', state.jokers);
      } else if (blind.key === 'bl_head' || blindDef?.debuffSuit === 'Hearts') {
        debuffed = isCardSuit(card, 'Hearts', state.jokers);
      } else if (blind.key === 'bl_pillar') {
        debuffed = card.playedThisAnte;
      } else if (blind.key === 'bl_final_leaf') {
        debuffed = !state.tracking.verdantLeafSold;
      }
    }
    card.debuffed = debuffed;
  }
}

function applyCrimsonHeartDebuff(state: SimState): void {
  const blind = getActiveBlind(state);
  // Restore previous Crimson Heart debuffed joker (unless perished!)
  if (state.tracking.crimsonHeartDisabledJokerId) {
    const prev = state.jokers.find((j) => j.id === state.tracking.crimsonHeartDisabledJokerId);
    if (prev && !(prev.perishable && prev.perishableTally <= 0)) {
      prev.debuffed = false;
    }
    state.tracking.crimsonHeartDisabledJokerId = null;
  }
  if (blind.slot === 'Boss' && blind.key === 'bl_final_heart' && !blind.disabled && state.jokers.length > 0) {
    const candidates = state.jokers.filter((j) => !j.debuffed);
    const chosen = pickRandom(candidates.length > 0 ? candidates : state.jokers, state.rng, 'crimson_heart');
    if (chosen) {
      chosen.debuffed = true;
      state.tracking.crimsonHeartDisabledJokerId = chosen.id;
      blind.triggered = true;
    }
  }
  syncBankruptAt(state);
  refreshCardDebuffs(state);
}

function disableActiveBossBlind(state: SimState): void {
  const blind = getActiveBlind(state);
  if (blind.slot !== 'Boss') return;
  const wasDisabled = blind.disabled;
  blind.disabled = true;

  // Restore any Crimson Heart disabled joker (unless perished)
  if (state.tracking.crimsonHeartDisabledJokerId) {
    const prev = state.jokers.find((j) => j.id === state.tracking.crimsonHeartDisabledJokerId);
    if (prev && !(prev.perishable && prev.perishableTally <= 0)) {
      prev.debuffed = false;
    }
    state.tracking.crimsonHeartDisabledJokerId = null;
  }

  // Flip all jokers & cards face-up (Amber Acorn, House, Fish, Mark, Wheel)
  for (let i = 0; i < state.jokers.length; i++) {
    state.jokers[i].faceDown = false;
  }
  for (let i = 0; i < state.fullDeck.length; i++) {
    state.fullDeck[i].faceDown = false;
  }

  // Clear Cerulean Bell forced card
  state.tracking.ceruleanBellForcedCardId = null;

  // Reduce oversized boss target chips (The Wall 4x -> 2x, Violet Vessel 6x -> 2x)
  if (!wasDisabled && (blind.key === 'bl_wall' || blind.key === 'bl_final_vessel')) {
    blind.targetChips = computeTargetChips(state, 2);
    state.targetChips = blind.targetChips;
  }

  // Mid-round restorations when disabling live Boss Blinds (e.g. selling Luchador)
  if (!wasDisabled && state.phase === 'PLAYING') {
    if (blind.key === 'bl_manacle') {
      drawCardsToHand(state, 1);
      sortHandIds(state, state.sortMode);
    } else if (blind.key === 'bl_water') {
      const lostDiscards = getSimMetaNum(state, 'water_lost_discards') ?? 0;
      if (lostDiscards > 0 && countActiveJoker(state, 'j_burglar') === 0) {
        state.discardsLeft += lostDiscards;
      }
      setSimMetaNum(state, 'water_lost_discards', 0);
    } else if (blind.key === 'bl_needle') {
      const lostHands = getSimMetaNum(state, 'needle_lost_hands') ?? 0;
      if (lostHands > 0) {
        state.handsLeft += lostHands;
      }
      setSimMetaNum(state, 'needle_lost_hands', 0);
    }
  }

  syncBankruptAt(state);
  refreshCardDebuffs(state);
}

function enforceCeruleanBellSelection(state: SimState): void {
  const blind = getActiveBlind(state);
  if (blind.slot !== 'Boss' || blind.key !== 'bl_final_bell' || blind.disabled) {
    state.tracking.ceruleanBellForcedCardId = null;
    return;
  }
  if (state.hand.length === 0) {
    state.tracking.ceruleanBellForcedCardId = null;
    return;
  }
  const current = state.tracking.ceruleanBellForcedCardId;
  if (!current || !state.hand.includes(current)) {
    const forced = pickRandom(state.hand, state.rng, 'cerulean_bell') ?? state.hand[0];
    state.tracking.ceruleanBellForcedCardId = forced;
    blind.triggered = true;
  }
  const forcedId = state.tracking.ceruleanBellForcedCardId;
  if (forcedId && !state.selectedCardIds.includes(forcedId)) {
    if (state.selectedCardIds.length >= state.maxSelectCards) {
      state.selectedCardIds.pop();
    }
    state.selectedCardIds.unshift(forcedId);
  }
}

function rotateRoundJokerTargets(state: SimState): void {
  if (state.fullDeck.length > 0) {
    const nonStone = state.fullDeck.filter((c) => c.enhancement !== 'm_stone');
    const pool = nonStone.length > 0 ? nonStone : state.fullDeck;
    const idolCard = pickRandom(pool, state.rng, `idol_${state.round}`);
    if (idolCard) {
      state.tracking.idolSuit = idolCard.suit;
      state.tracking.idolRank = idolCard.rank;
    }
    const mailCard = pickRandom(pool, state.rng, `mail_${state.round}`);
    if (mailCard) {
      state.tracking.mailRank = mailCard.rank;
    }
    const castleCard = pickRandom(pool, state.rng, `castle_${state.round}`);
    if (castleCard) {
      state.tracking.castleSuit = castleCard.suit;
    } else {
      state.tracking.castleSuit = pickRandom(SUITS, state.rng, `castle_${state.round}`) ?? 'Spades';
    }
  } else {
    state.tracking.castleSuit = pickRandom(SUITS, state.rng, `castle_${state.round}`) ?? 'Spades';
  }
  const ancientChoices = SUITS.filter((s) => s !== state.tracking.ancientSuit);
  state.tracking.ancientSuit =
    pickRandom(ancientChoices, state.rng, `ancient_${state.round}`) ?? 'Hearts';
}

function recomputePendingBlindTargets(state: SimState): void {
  const slots: BlindSlot[] = ['Small', 'Big', 'Boss'];
  for (let i = 0; i < slots.length; i++) {
    const b = state.blinds[slots[i]];
    if (!b) continue;
    if (b.status === 'Select' || b.status === 'Upcoming') {
      b.targetChips = computeTargetChips(state, b.mult);
    }
  }
  const active = getActiveBlind(state);
  if (active && (active.status === 'Select' || active.status === 'Upcoming')) {
    state.targetChips = active.targetChips;
  }
}

function applyVoucherEffect(state: SimState, key: string): void {
  switch (key) {
    case 'v_overstock_norm':
    case 'v_overstock_plus':
      state.shopSlots += 1;
      if (state.shop) {
        state.shop.offers.push(generateAdditionalShopOffer(state));
      }
      break;
    case 'v_clearance_sale':
      state.discountPercent = Math.max(state.discountPercent, 25);
      if (state.shop) repriceCurrentShop(state);
      break;
    case 'v_liquidation':
      state.discountPercent = Math.max(state.discountPercent, 50);
      if (state.shop) repriceCurrentShop(state);
      break;
    case 'v_hone':
      state.editionRate = Math.max(state.editionRate, 2);
      break;
    case 'v_glow_up':
      state.editionRate = Math.max(state.editionRate, 4);
      break;
    case 'v_reroll_surplus':
    case 'v_reroll_glut':
      state.baseRerollCost = Math.max(1, state.baseRerollCost - 2);
      state.rerollCost = state.rerollCost === 0 ? 0 : Math.max(1, state.rerollCost - 2);
      break;
    case 'v_crystal_ball':
      state.consumableSlots += 1;
      break;
    case 'v_omen_globe':
    case 'v_telescope':
    case 'v_observatory':
    case 'v_blank':
    case 'v_directors_cut':
    case 'v_retcon':
      // Passive / queried at pack open, scoring, or boss reroll time
      break;
    case 'v_grabber':
    case 'v_nacho_tong':
      state.handsPerRound += 1;
      if (state.phase === 'PLAYING') state.handsLeft += 1;
      break;
    case 'v_wasteful':
    case 'v_recyclomancy':
      state.discardsPerRound += 1;
      if (state.phase === 'PLAYING') state.discardsLeft += 1;
      break;
    case 'v_tarot_merchant':
      state.tarotRate = Math.max(state.tarotRate, 9.6);
      break;
    case 'v_tarot_tycoon':
      state.tarotRate = Math.max(state.tarotRate, 32);
      break;
    case 'v_planet_merchant':
      state.planetRate = Math.max(state.planetRate, 9.6);
      break;
    case 'v_planet_tycoon':
      state.planetRate = Math.max(state.planetRate, 32);
      break;
    case 'v_seed_money':
      state.interestCap = Math.max(state.interestCap, 50);
      break;
    case 'v_money_tree':
      state.interestCap = Math.max(state.interestCap, 100);
      break;
    case 'v_antimatter':
      state.jokerSlots += 1;
      break;
    case 'v_magic_trick':
    case 'v_illusion':
      state.playingCardRate = Math.max(state.playingCardRate, 4);
      break;
    case 'v_hieroglyph':
      state.ante = Math.max(0, state.ante - 1);
      state.handsPerRound = Math.max(1, state.handsPerRound - 1);
      recomputePendingBlindTargets(state);
      break;
    case 'v_petroglyph':
      state.ante = Math.max(0, state.ante - 1);
      state.discardsPerRound = Math.max(0, state.discardsPerRound - 1);
      recomputePendingBlindTargets(state);
      break;
    case 'v_paint_brush':
    case 'v_palette':
      state.handSize += 1;
      break;
    default:
      break;
  }
}

const PACK_TAG_SPECS: Record<
  string,
  { boosterKey: string; kind: BoosterKind; size: BoosterSize; extra: number; choose: number }
> = {
  tag_charm: { boosterKey: 'p_arcana_mega_1', kind: 'Arcana', size: 'Mega', extra: 5, choose: 2 },
  tag_meteor: { boosterKey: 'p_celestial_mega_1', kind: 'Celestial', size: 'Mega', extra: 5, choose: 2 },
  tag_standard: { boosterKey: 'p_standard_mega_1', kind: 'Standard', size: 'Mega', extra: 5, choose: 2 },
  tag_buffoon: { boosterKey: 'p_buffoon_mega_1', kind: 'Buffoon', size: 'Mega', extra: 4, choose: 2 },
  tag_ethereal: { boosterKey: 'p_spectral_normal_1', kind: 'Spectral', size: 'Normal', extra: 2, choose: 1 },
};

function openPackForTag(state: SimState, tagKey: string, events: SimEvent[]): void {
  const spec = PACK_TAG_SPECS[tagKey];
  if (!spec) return;
  if (state.pack !== null) {
    // Queue additional free packs (e.g. from Double Tag) cleanly until the active pack closes
    state.tags.push(tagKey);
    return;
  }
  openBoosterPack(state, spec.boosterKey, spec.kind, spec.size, spec.extra, spec.choose);
  runNonScoringHooks(state, 'open_booster', events, { itemKey: spec.boosterKey, itemKind: 'booster' });
  events.push({
    type: 'PACK_OPENED',
    message: `Opened free ${spec.size} ${spec.kind} Pack`,
    sound: 'magic_crumple',
    payload: { boosterKey: spec.boosterKey, tagKey },
  });
}

function applySingleTag(state: SimState, tagKey: string, events: SimEvent[]): void {
  events.push({
    type: 'TAG_TRIGGERED',
    message: `Tag: ${tagKey}`,
    sound: 'generic1',
    payload: { tagKey },
  });

  switch (tagKey) {
    case 'tag_uncommon':
    case 'tag_rare':
    case 'tag_foil':
    case 'tag_holo':
    case 'tag_polychrome':
    case 'tag_negative':
      state.tracking.pendingShopTags.push(tagKey);
      state.tags.push(tagKey);
      break;
    case 'tag_coupon':
      state.tracking.pendingCoupon = true;
      state.tags.push(tagKey);
      break;
    case 'tag_investment':
    case 'tag_voucher':
    case 'tag_d_six':
      state.tags.push(tagKey);
      break;
    case 'tag_juggle':
      state.tracking.handSizeDeltaThisRound += 3;
      state.tags.push(tagKey);
      break;
    case 'tag_economy': {
      const gain = Math.max(0, Math.min(40, Math.floor(state.dollars)));
      state.dollars = safeNum(state.dollars + gain, state.dollars);
      break;
    }
    case 'tag_skip': {
      state.dollars = safeNum(state.dollars + 5 * state.tracking.skipsTotal, state.dollars);
      break;
    }
    case 'tag_handy': {
      state.dollars = safeNum(state.dollars + state.tracking.handsPlayedTotal, state.dollars);
      break;
    }
    case 'tag_garbage': {
      state.dollars = safeNum(state.dollars + getUnusedDiscardsTotal(state), state.dollars);
      break;
    }
    case 'tag_orbital': {
      const visibleHands = POKER_HAND_IDS.filter((id) => state.handLevels[id]?.visible);
      const chosen = pickRandom(visibleHands.length > 0 ? visibleHands : POKER_HAND_IDS, state.rng, 'orbital_hand') ?? 'Pair';
      const hl = state.handLevels[chosen];
      if (hl) {
        hl.level += 3;
        hl.chips += hl.lChips * 3;
        hl.mult += hl.lMult * 3;
      }
      break;
    }
    case 'tag_top_up': {
      for (let i = 0; i < 2; i++) {
        if (state.jokers.length >= getEffectiveJokerSlots(state)) break;
        const def = pickJokerDefFromPool(state, `topup_${i}`, { forcedRarity: 1 });
        if (def) {
          state.jokers.push(
            createJokerInstance(state, def.key, {
              eternal: state.tracking.allEternal && def.eternalCompat,
            })
          );
        }
      }
      syncBankruptAt(state);
      break;
    }
    case 'tag_boss': {
      const newBoss = pickBossBlind(state, undefined, state.blinds.Boss?.key);
      const bossDollars =
        state.tracking.noReward || hasSimFlag(state, 'rule:no_reward_Boss')
          ? 0
          : newBoss.dollars;
      state.blinds.Boss = {
        slot: 'Boss',
        key: newBoss.key,
        name: newBoss.name,
        status: state.blinds.Boss.status,
        mult: newBoss.mult,
        targetChips: computeTargetChips(state, newBoss.mult),
        dollars: bossDollars,
        tagKey: null,
        bossColor: newBoss.bossColor,
        triggered: false,
        disabled: false,
      };
      if (state.activeBlindSlot === 'Boss') {
        state.targetChips = state.blinds.Boss.targetChips;
      }
      break;
    }
    case 'tag_charm':
    case 'tag_meteor':
    case 'tag_standard':
    case 'tag_buffoon':
    case 'tag_ethereal':
      openPackForTag(state, tagKey, events);
      break;
    default:
      state.tags.push(tagKey);
      break;
  }
}

function grantTag(state: SimState, tagKey: string, events: SimEvent[]): void {
  if (tagKey === 'tag_double') {
    state.tags.push('tag_double');
    events.push({ type: 'TAG_TRIGGERED', message: 'Gained Double Tag', sound: 'generic1', payload: { tagKey } });
    return;
  }

  let doubleCount = 0;
  state.tags = state.tags.filter((t) => {
    if (t === 'tag_double') {
      doubleCount += 1;
      return false;
    }
    return true;
  });

  const times = 1 + doubleCount;
  for (let i = 0; i < times; i++) {
    applySingleTag(state, tagKey, events);
  }
}

function applyLifecycleHookResult(
  state: SimState,
  joker: JokerInstance,
  res: JokerEvalResult,
  events: SimEvent[],
  destroyedJokerIds: Set<string>,
  destroyedCardIds: Set<string>
): void {
  if (res.dollars && Number.isFinite(res.dollars)) {
    state.dollars = safeNum(state.dollars + res.dollars, state.dollars);
  }
  if (res.addSellValue && Number.isFinite(res.addSellValue)) {
    joker.extraSellValue += res.addSellValue;
    recalcJokerSellValue(joker);
  }
  if (res.levelUpHand) {
    const hl = state.handLevels[res.levelUpHand];
    if (hl) {
      hl.level += 1;
      hl.chips += hl.lChips;
      hl.mult += hl.lMult;
      hl.visible = true;
    }
  }
  if (res.disableBoss) {
    disableActiveBossBlind(state);
  }
  if (res.addStoneCard) {
    const suit = pickRandom(SUITS, state.rng, `stone_s_${state.round}`) ?? 'Spades';
    const rank = pickRandom(RANKS, state.rng, `stone_r_${state.round}`) ?? '2';
    const stone = createCardInstance(state, suit, rank, { enhancement: 'm_stone' });
    state.fullDeck.push(stone);
    state.drawPile.push(stone.id);
    notifyJokersCardAdded(state, stone, events);
  }
  if (res.createConsumable) {
    const ed = res.createConsumable.edition ?? 'none';
    if (ed === 'e_negative' || state.consumables.length < getEffectiveConsumableSlots(state)) {
      const key =
        res.createConsumable.key ??
        pickConsumableDefFromPool(state, res.createConsumable.set, `hook_cons_${joker.key}`)?.key;
      if (key) {
        state.consumables.push(createConsumableInstance(state, key, { edition: ed }));
      }
    }
  }
  if (res.createJoker) {
    const ed = res.createJoker.edition ?? 'none';
    if (ed === 'e_negative' || state.jokers.length < getEffectiveJokerSlots(state)) {
      const picked = res.createJoker.key
        ? JOKER_MAP[res.createJoker.key]
        : pickJokerDefFromPool(state, `hook_joker_${joker.key}`, {
            forcedRarity: res.createJoker.rarity,
          });
      const key = res.createJoker.key ?? picked?.key;
      if (key) {
        state.jokers.push(
          createJokerInstance(state, key, {
            edition: ed,
            eternal: state.tracking.allEternal && (picked?.eternalCompat ?? true),
          })
        );
      }
    }
  }
  if (res.destroyJokerId) {
    const target = state.jokers.find((j) => j.id === res.destroyJokerId);
    if (target && !target.eternal) {
      destroyedJokerIds.add(target.id);
    }
  }
  if (res.destroySelf && !joker.eternal) {
    destroyedJokerIds.add(joker.id);
    if (joker.key === 'j_gros_michel') {
      if (!state.tracking.bannedKeys.includes('j_gros_michel')) {
        state.tracking.bannedKeys.push('j_gros_michel');
      }
      if (!state.tracking.bannedOthers.includes('__extinct_gros_michel')) {
        state.tracking.bannedOthers.push('__extinct_gros_michel');
      }
    }
  }
  if (res.destroyCardId) {
    destroyedCardIds.add(res.destroyCardId);
  }
}

function runNonScoringHooks(
  state: SimState,
  stage:
    | 'setting_blind'
    | 'first_hand_drawn'
    | 'end_of_round'
    | 'skip_blind'
    | 'skipping_booster'
    | 'buying_card'
    | 'selling_card'
    | 'reroll_shop'
    | 'open_booster',
  events: SimEvent[],
  extra?: { itemKey?: string; itemKind?: string; allowBlueprint?: boolean }
): void {
  const probMultiplier = getProbabilityMultiplier(state.jokers);
  const rand = (k: string) => nextRandom(state.rng, k);
  const randInt = (k: string, max: number) => nextRandomInt(state.rng, k, max);
  const isFace = (c: CardInstance) => isCardFace(c, state.jokers);
  const isSuit = (c: CardInstance, s: Suit) => isCardSuit(c, s, state.jokers);

  const destroyedJokerIds = new Set<string>();
  const destroyedCardIds = new Set<string>();

  const snapshotLength = state.jokers.length;
  for (let i = 0; i < snapshotLength; i++) {
    const sourceJoker = state.jokers[i];
    if (!sourceJoker || sourceJoker.debuffed || destroyedJokerIds.has(sourceJoker.id)) continue;

    let targetJoker = sourceJoker;
    let targetIndex = i;
    let isBlueprint = false;

    if (extra?.allowBlueprint) {
      const resolved = resolveCopiedJoker(state.jokers, i);
      if (!resolved) continue;
      targetJoker = resolved.target;
      targetIndex = resolved.targetIndex;
      isBlueprint = targetIndex !== i;
    }

    if (
      (stage === 'first_hand_drawn' && targetJoker.key === 'j_certificate') ||
      (stage === 'end_of_round' && targetJoker.key === 'j_gift')
    ) {
      continue;
    }

    const res = evaluateJokerHook(targetJoker.key, {
      stage,
      state,
      joker: targetJoker,
      jokerIndex: targetIndex,
      isBlueprint,
      blueprintSource: isBlueprint ? sourceJoker : undefined,
      itemKey: extra?.itemKey,
      itemKind: extra?.itemKind,
      probMultiplier,
      rand,
      randInt,
      isFace,
      isSuit,
    });
    if (res) {
      applyLifecycleHookResult(state, sourceJoker, res, events, destroyedJokerIds, destroyedCardIds);
    }
  }

  if (destroyedJokerIds.size > 0) {
    for (let i = 0; i < state.jokers.length; i++) {
      const j = state.jokers[i];
      if (destroyedJokerIds.has(j.id)) {
        events.push({
          type: 'JOKER_DESTROYED',
          message: `${JOKER_MAP[j.key]?.name ?? j.key} destroyed`,
          sound: 'slice1',
          payload: { jokerId: j.id, key: j.key },
        });
      }
    }
    state.jokers = state.jokers.filter((j) => !destroyedJokerIds.has(j.id));
    syncBankruptAt(state);
  }

  if (destroyedCardIds.size > 0) {
    const removed = state.fullDeck.filter((c) => destroyedCardIds.has(c.id));
    state.fullDeck = state.fullDeck.filter((c) => !destroyedCardIds.has(c.id));
    state.hand = state.hand.filter((id) => !destroyedCardIds.has(id));
    state.drawPile = state.drawPile.filter((id) => !destroyedCardIds.has(id));
    state.discardPile = state.discardPile.filter((id) => !destroyedCardIds.has(id));
    state.tracking.cardsDestroyedTotal += removed.length;
    notifyJokersCardsDestroyed(state, removed, events);
  }
}

function handleRoundVictoryTransition(state: SimState, events: SimEvent[]): void {
  const blind = getActiveBlind(state);
  blind.status = 'Defeated';

  // 1. Blue Seal: held cards with Blue Seal create the Planet for the final played hand (Mime retriggers)
  const lastHand = state.tracking.lastPlayedHandId;
  if (lastHand) {
    const planetDef = PLANETS.find((p) => p.handType === lastHand);
    const planetKey =
      planetDef?.key ??
      Object.entries(PLANET_HAND_FALLBACK).find(([, h]) => h === lastHand)?.[0] ??
      null;
    if (planetKey) {
      const probMultiplier = getProbabilityMultiplier(state.jokers);
      const rand = (k: string) => nextRandom(state.rng, k);
      const randInt = (k: string, max: number) => nextRandomInt(state.rng, k, max);
      const isFace = (c: CardInstance) => isCardFace(c, state.jokers);
      const isSuit = (c: CardInstance, s: Suit) => isCardSuit(c, s, state.jokers);
      const heldCards = state.hand
        .map((id) => getCardById(state, id))
        .filter((c): c is CardInstance => Boolean(c));

      for (let i = 0; i < heldCards.length; i++) {
        const card = heldCards[i];
        if (card.debuffed || card.seal !== 'Blue') continue;
        let triggers = 1;
        for (let j = 0; j < state.jokers.length; j++) {
          const resolved = resolveCopiedJoker(state.jokers, j);
          if (!resolved) continue;
          const rep = evaluateJokerHook(resolved.target.key, {
            stage: 'repetition_hand',
            state,
            joker: resolved.target,
            jokerIndex: resolved.targetIndex,
            isBlueprint: resolved.targetIndex !== j,
            blueprintSource: resolved.targetIndex !== j ? state.jokers[j] : undefined,
            card,
            heldCards,
            probMultiplier,
            rand,
            randInt,
            isFace,
            isSuit,
          });
          if (rep?.repetitions && rep.repetitions > 0) {
            triggers += Math.floor(rep.repetitions);
          }
        }
        for (let t = 0; t < triggers; t++) {
          if (state.consumables.length < getEffectiveConsumableSlots(state)) {
            state.consumables.push(createConsumableInstance(state, planetKey));
          }
        }
      }
    }
  }

  // 2. Engine-owned j_gift (+1 sell value to ALL Jokers and Consumables at end of round)
  let totalGiftBonus = 0;
  for (let i = 0; i < state.jokers.length; i++) {
    const j = state.jokers[i];
    if (!j.debuffed && j.key === 'j_gift') {
      totalGiftBonus += Math.max(1, safeNum(Number(j.state.extra ?? 1), 1));
    }
  }
  if (totalGiftBonus > 0) {
    for (let i = 0; i < state.jokers.length; i++) {
      state.jokers[i].extraSellValue += totalGiftBonus;
      recalcJokerSellValue(state.jokers[i]);
    }
    for (let i = 0; i < state.consumables.length; i++) {
      state.consumables[i].sellValue = Math.max(
        1,
        safeNum(state.consumables[i].sellValue, 1) + totalGiftBonus
      );
    }
  }

  // 3. End-of-round Joker hooks (Egg, Gros Michel, Cavendish, Invisible invis_rounds++, Rocket boss scale, Turtle Bean, Popcorn, Campfire, etc.)
  runNonScoringHooks(state, 'end_of_round', events);

  // 4. Record unused discards for Garbage Tag (+$1 per unused discard this run)
  addUnusedDiscards(state, state.discardsLeft);

  // 5. Compute Cashout Breakdown BEFORE Perishable final-round expiry & BEFORE clearing round debuffs
  state.cashout = computeCashoutBreakdown(state);

  // 6. Perishable Joker tally decrement (5 rounds -> debuffed permanently)
  for (let i = 0; i < state.jokers.length; i++) {
    const j = state.jokers[i];
    if (j.perishable && !j.debuffed) {
      j.perishableTally = Math.max(0, j.perishableTally - 1);
      if (j.perishableTally === 0) {
        j.debuffed = true;
      }
    }
  }
  syncBankruptAt(state);

  // 7. Clear temporary boss states (faceDown, Crimson Heart, Cerulean Bell, temp handSize)
  if (state.tracking.crimsonHeartDisabledJokerId) {
    const j = state.jokers.find((x) => x.id === state.tracking.crimsonHeartDisabledJokerId);
    if (j && !(j.perishable && j.perishableTally <= 0)) j.debuffed = false;
    state.tracking.crimsonHeartDisabledJokerId = null;
  }
  for (let i = 0; i < state.jokers.length; i++) state.jokers[i].faceDown = false;
  for (let i = 0; i < state.fullDeck.length; i++) {
    state.fullDeck[i].faceDown = false;
    state.fullDeck[i].debuffed = false;
  }
  // Keep permanent debuffs for Double or Nothing challenge
  refreshCardDebuffs(state);
  state.tracking.ceruleanBellForcedCardId = null;
  state.tracking.handSizeDeltaThisRound = 0;
  setSimMetaNum(state, 'water_lost_discards', 0);
  setSimMetaNum(state, 'needle_lost_hands', 0);
  // Consume visual Juggle tag if present
  state.tags = state.tags.filter((t) => t !== 'tag_juggle');

  // 8. Rotate round targets at end of round (Idol, Ancient, Castle, Mail-In Rebate)
  rotateRoundJokerTargets(state);

  // 9. Anaglyph Deck Boss bonus (gain Double Tag after defeating each Boss Blind)
  if (
    blind.slot === 'Boss' &&
    !state.challengeId &&
    (state.deckId === 'b_anaglyph' || Boolean(DECK_MAP[state.deckId]?.config.anaglyph))
  ) {
    grantTag(state, 'tag_double', events);
  }

  // 10. Typecast challenge Ante-4 Boss trigger (all Jokers become Eternal; Joker slots set to 0)
  if (blind.slot === 'Boss') {
    const setEternalAnte = getSimMetaNum(state, 'rule:set_eternal_ante');
    if (
      setEternalAnte !== null &&
      state.ante >= setEternalAnte &&
      !hasSimFlag(state, 'rule:typecast_eternal_done')
    ) {
      for (let i = 0; i < state.jokers.length; i++) {
        state.jokers[i].eternal = true;
      }
      addSimFlag(state, 'rule:typecast_eternal_done');
    }
    const setSlotsAnte = getSimMetaNum(state, 'rule:set_joker_slots_ante');
    if (
      setSlotsAnte !== null &&
      state.ante >= setSlotsAnte &&
      !hasSimFlag(state, 'rule:typecast_slots_done')
    ) {
      state.jokerSlots = 0;
      addSimFlag(state, 'rule:typecast_slots_done');
    }
  }

  // 11. Ante 8 Boss Victory vs Standard Cashout
  if (blind.slot === 'Boss' && state.ante === state.winAnte && !state.endless) {
    state.phase = 'VICTORY';
    events.push({
      type: 'VICTORY',
      message: 'You Win!',
      sound: 'win',
      payload: { ante: state.ante, round: state.round },
    });
  } else {
    state.phase = 'CASHOUT';
    events.push({
      type: 'ROUND_WON',
      message: `${blind.name} Defeated!`,
      sound: 'win',
      payload: { blindKey: blind.key, cashoutTotal: state.cashout.total },
    });
  }
}

function closeOpenPack(state: SimState, events: SimEvent[]): void {
  if (state.pack?.needsHand) {
    // Return dealt hand cards cleanly to draw pile
    state.drawPile = state.fullDeck.map((c) => c.id);
    state.hand = [];
    state.playArea = [];
    state.discardPile = [];
    state.selectedCardIds = [];
  }
  state.pack = null;

  // Auto-open any queued free pack tags (e.g. from Double Tag + Charm/Meteor/Standard/Buffoon/Ethereal)
  const queuedIdx = state.tags.findIndex((t) => Boolean(PACK_TAG_SPECS[t]));
  if (queuedIdx >= 0) {
    const nextPackTag = state.tags.splice(queuedIdx, 1)[0];
    openPackForTag(state, nextPackTag, events);
    return;
  }

  state.phase = state.shop !== null ? 'SHOP' : 'BLIND_SELECT';
}

function makeBaseState(seed = 'KRUNKED1', seeded = false): SimState {
  const rng = createRngState(seed);
  const handLevels = buildDefaultHandLevels();

  const state: SimState = {
    tick: 0,
    rng,
    phase: 'TITLE',
    deckId: 'b_red',
    stake: 1,
    challengeId: null,
    seeded,

    ante: 1,
    round: 0,
    winAnte: 8,
    endless: false,

    dollars: 4,
    bankruptAt: 0,
    interestCap: 25,
    interestAmount: 1,
    anteScaling: 1,

    handsPerRound: 4,
    discardsPerRound: 3,
    handsLeft: 4,
    discardsLeft: 3,
    handSize: 8,
    maxSelectCards: 5,

    jokerSlots: 5,
    consumableSlots: 2,
    shopSlots: 2,
    voucherSlots: 1,
    boosterSlots: 2,

    baseRerollCost: 5,
    rerollCost: 5,
    freeRerolls: 0,
    discountPercent: 0,

    jokerRate: 20,
    tarotRate: 4,
    planetRate: 4,
    spectralRate: 0,
    playingCardRate: 0,
    editionRate: 1,

    blinds: {} as Record<BlindSlot, BlindSlotState>,
    activeBlindSlot: 'Small',
    bossHistory: [],
    bossRerolledThisAnte: false,

    roundChips: 0,
    targetChips: 300,
    currentHandChips: 0,
    currentHandMult: 0,
    lastHandScore: 0,
    lastHandName: null,
    lastHandBeats: [],
    scoringBeatIndex: 0,

    fullDeck: [],
    drawPile: [],
    hand: [],
    playArea: [],
    discardPile: [],
    selectedCardIds: [],
    sortMode: 'rank',

    jokers: [],
    consumables: [],
    vouchers: [],
    tags: [],

    handLevels,
    shop: null,
    pack: null,
    cashout: null,

    tracking: {
      lastTarotPlanetKey: null,
      lastTarotPlanetSet: null,
      handsPlayedThisRound: 0,
      handsPlayedTotal: 0,
      discardsUsedThisRound: 0,
      discardsUsedTotal: 0,
      playedHandTypesThisRound: [],
      firstHandTypeThisRound: null,
      mostPlayedHand: 'High Card',
      skipsTotal: 0,
      cardsDestroyedTotal: 0,
      tarotsUsedTotal: 0,
      planetsUsedTotal: 0,
      spectralsUsedTotal: 0,
      vouchersRedeemedTotal: 0,
      rerollsThisRun: 0,
      nextUid: 1,
      idolSuit: 'Spades',
      idolRank: 'Ace',
      ancientSuit: 'Hearts',
      castleSuit: 'Clubs',
      mailRank: 'Ace',
      firstShopSeen: false,
      ectoplasmUses: 0,
      handSizeDeltaThisRound: 0,
      handsDeltaNextRound: 0,
      discardsDeltaNextRound: 0,
      pendingCoupon: false,
      pendingFreeShopReroll: false,
      pendingShopTags: [],
      bannedKeys: [],
      bannedTags: [],
      bannedOthers: [],
      noInterest: false,
      noReward: false,
      noExtraHandMoney: false,
      allEternal: false,
      flippedCardsChance: 0,
      inflationRerollBump: 0,
      inflationCostBump: 0,
      crimsonHeartDisabledJokerId: null,
      ceruleanBellForcedCardId: null,
      verdantLeafSold: false,
      oxMostPlayedHand: 'High Card',
      lastPlayedHandId: null,
    },
    stats: {
      bestHand: 0,
      cardsPlayed: 0,
      cardsDiscarded: 0,
      cardsPurchased: 0,
      timesRerolled: 0,
      highestAnte: 1,
      highestRound: 0,
      defeatedBy: null,
    },
    events: [],
    lastError: null,
  };

  state.blinds = generateAnteBlinds(state);
  state.targetChips = state.blinds.Small.targetChips;
  return state;
}

/**
 * Create a clean TITLE screen state without mutating any globals or reading wall clocks.
 */
export function createTitleState(seed?: string): SimState {
  return makeBaseState(seed ?? 'KRUNKED1', Boolean(seed));
}

const SHORT_SUIT_MAP: Record<'H' | 'D' | 'S' | 'C', Suit> = {
  H: 'Hearts',
  D: 'Diamonds',
  S: 'Spades',
  C: 'Clubs',
};

const SHORT_RANK_MAP: Record<string, Rank> = {
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  T: '10',
  J: 'Jack',
  Q: 'Queen',
  K: 'King',
  A: 'Ace',
  Jack: 'Jack',
  Queen: 'Queen',
  King: 'King',
  Ace: 'Ace',
};

/**
 * Start a fresh deterministic run for the specified deck, stake, seed, and optional challenge.
 */
export function startRun(
  deckId: string,
  stake: StakeLevel,
  seed?: string,
  challengeId: string | null = null
): SimStepResult {
  const cleanSeed = seed && seed.trim().length > 0 ? seed.trim() : 'KRUNKED1';
  const state = makeBaseState(cleanSeed, Boolean(seed && seed.trim().length > 0));
  const events: SimEvent[] = [];

  state.deckId = deckId || 'b_red';
  state.stake = stake;
  state.challengeId = challengeId ?? null;
  state.phase = 'BLIND_SELECT';

  const challenge = challengeId ? CHALLENGE_MAP[challengeId] : undefined;

  // Stake 5 (Blue Stake): -1 Discard (challenges always play on neutral Challenge Deck / White Stake)
  if (!challenge && state.stake >= 5) {
    state.discardsPerRound = Math.max(0, state.discardsPerRound - 1);
  }

  // Apply Deck Config (all 15 decks supported both via catalog config and clean fallback)
  const deckDef = DECK_MAP[state.deckId];
  const cfg = challenge ? undefined : deckDef?.config;
  const grantStartingVoucher = (vk: string): void => {
    if (!state.vouchers.includes(vk)) {
      state.vouchers.push(vk);
      applyVoucherEffect(state, vk);
    }
  };
  if (!challenge) {
    if (cfg) {
      if (cfg.hands) state.handsPerRound = Math.max(1, state.handsPerRound + cfg.hands);
      if (cfg.discards) state.discardsPerRound = Math.max(0, state.discardsPerRound + cfg.discards);
      if (cfg.dollars) state.dollars += cfg.dollars;
      if (cfg.jokerSlots) state.jokerSlots = Math.max(0, state.jokerSlots + cfg.jokerSlots);
      if (cfg.consumableSlots) state.consumableSlots = Math.max(0, state.consumableSlots + cfg.consumableSlots);
      if (cfg.handSize) state.handSize = Math.max(1, state.handSize + cfg.handSize);
      if (cfg.anteScaling) state.anteScaling *= cfg.anteScaling;
      if (cfg.spectralRate !== undefined) state.spectralRate = cfg.spectralRate;
      if (cfg.noInterest) state.tracking.noInterest = true;
      if (cfg.vouchers) {
        for (let i = 0; i < cfg.vouchers.length; i++) {
          grantStartingVoucher(cfg.vouchers[i]);
        }
      }
      if (cfg.consumables) {
        for (let i = 0; i < cfg.consumables.length; i++) {
          state.consumables.push(createConsumableInstance(state, cfg.consumables[i]));
        }
      }
    } else {
      switch (state.deckId) {
        case 'b_red':
          state.discardsPerRound += 1;
          break;
        case 'b_blue':
          state.handsPerRound += 1;
          break;
        case 'b_yellow':
          state.dollars += 10;
          break;
        case 'b_green':
          state.tracking.noInterest = true;
          break;
        case 'b_black':
          state.jokerSlots += 1;
          state.handsPerRound = Math.max(1, state.handsPerRound - 1);
          break;
        case 'b_magic':
          grantStartingVoucher('v_crystal_ball');
          state.consumables.push(createConsumableInstance(state, 'c_fool'));
          state.consumables.push(createConsumableInstance(state, 'c_fool'));
          break;
        case 'b_nebula':
          grantStartingVoucher('v_telescope');
          state.consumableSlots = Math.max(0, state.consumableSlots - 1);
          break;
        case 'b_ghost':
          state.spectralRate = 2;
          state.consumables.push(createConsumableInstance(state, 'c_hex'));
          break;
        case 'b_zodiac':
          grantStartingVoucher('v_tarot_merchant');
          grantStartingVoucher('v_planet_merchant');
          grantStartingVoucher('v_overstock_norm');
          break;
        case 'b_painted':
          state.handSize += 2;
          state.jokerSlots = Math.max(0, state.jokerSlots - 1);
          break;
        case 'b_plasma':
          state.anteScaling *= 2;
          break;
        default:
          break;
      }
    }
  }

  // Build Playing Card Deck
  if (challenge?.deck?.cards && challenge.deck.cards.length > 0) {
    for (let i = 0; i < challenge.deck.cards.length; i++) {
      const spec = challenge.deck.cards[i];
      const suit = SHORT_SUIT_MAP[spec.s] ?? 'Spades';
      const rank = SHORT_RANK_MAP[spec.r] ?? 'Ace';
      state.fullDeck.push(
        createCardInstance(state, suit, rank, {
          enhancement: spec.e ?? challenge.deck.enhancement ?? 'none',
          edition: normalizeEdition(spec.d),
          seal: normalizeSeal(spec.g),
        })
      );
    }
  } else if (!challenge && (cfg?.checkered || state.deckId === 'b_checkered')) {
    const checkeredSuits: Suit[] = ['Spades', 'Spades', 'Hearts', 'Hearts'];
    for (let s = 0; s < checkeredSuits.length; s++) {
      for (let r = 0; r < RANKS.length; r++) {
        state.fullDeck.push(createCardInstance(state, checkeredSuits[s], RANKS[r]));
      }
    }
  } else if (!challenge && (cfg?.randomizeRankSuit || state.deckId === 'b_erratic')) {
    for (let i = 0; i < 52; i++) {
      const suit = pickRandom(SUITS, state.rng, `erratic_s_${i}`) ?? 'Spades';
      const rank = pickRandom(RANKS, state.rng, `erratic_r_${i}`) ?? 'Ace';
      state.fullDeck.push(createCardInstance(state, suit, rank));
    }
  } else {
    const noRanks = new Set<Rank>(challenge?.deck?.noRanks ?? []);
    if (!challenge && (cfg?.removeFaces || state.deckId === 'b_abandoned')) {
      noRanks.add('Jack');
      noRanks.add('Queen');
      noRanks.add('King');
    }
    const noSuits = new Set<Suit>(challenge?.deck?.noSuits ?? []);
    for (let s = 0; s < SUITS.length; s++) {
      if (noSuits.has(SUITS[s])) continue;
      for (let r = 0; r < RANKS.length; r++) {
        if (noRanks.has(RANKS[r])) continue;
        state.fullDeck.push(
          createCardInstance(state, SUITS[s], RANKS[r], {
            enhancement: challenge?.deck?.enhancement ?? 'none',
          })
        );
      }
    }
  }

  // Apply Challenge Rules, Starting Entities & Restrictions
  if (challenge) {
    if (challenge.rules.modifiers) {
      for (let i = 0; i < challenge.rules.modifiers.length; i++) {
        const m = challenge.rules.modifiers[i];
        if (m.id === 'dollars') state.dollars = m.value;
        else if (m.id === 'discards') state.discardsPerRound = Math.max(0, m.value);
        else if (m.id === 'hands') state.handsPerRound = Math.max(1, m.value);
        else if (m.id === 'reroll_cost') {
          state.baseRerollCost = Math.max(0, m.value);
          state.rerollCost = Math.max(0, m.value);
        } else if (m.id === 'joker_slots') state.jokerSlots = Math.max(0, m.value);
        else if (m.id === 'consumable_slots') state.consumableSlots = Math.max(0, m.value);
        else if (m.id === 'hand_size') state.handSize = Math.max(1, m.value);
      }
    }
    if (challenge.rules.custom) {
      for (let i = 0; i < challenge.rules.custom.length; i++) {
        const rule = challenge.rules.custom[i];
        if (rule.id === 'no_reward') state.tracking.noReward = true;
        else if (rule.id === 'no_reward_specific' && rule.value) {
          addSimFlag(state, `rule:no_reward_${String(rule.value)}`);
        } else if (rule.id === 'no_extra_hand_money') state.tracking.noExtraHandMoney = true;
        else if (rule.id === 'no_interest') state.tracking.noInterest = true;
        else if (rule.id === 'all_eternal') state.tracking.allEternal = true;
        else if (rule.id === 'flipped_cards') {
          state.tracking.flippedCardsChance = Math.max(1, Number(rule.value ?? 4));
        } else if (rule.id === 'inflation') {
          addSimFlag(state, 'rule:inflation');
        } else if (rule.id === 'no_shop_jokers') {
          addSimFlag(state, 'rule:no_shop_jokers');
          state.jokerRate = 0;
        } else if (rule.id === 'chips_dollar_cap') {
          addSimFlag(state, 'rule:chips_dollar_cap');
        } else if (rule.id === 'minus_hand_size_per_X_dollar') {
          setSimMetaNum(state, 'rule:minus_hand_size_per_X_dollar', Math.max(1, Number(rule.value ?? 5)));
        } else if (rule.id === 'discard_cost') {
          setSimMetaNum(state, 'rule:discard_cost', Math.max(1, Number(rule.value ?? 1)));
        } else if (rule.id === 'debuff_played_cards') {
          addSimFlag(state, 'rule:debuff_played_cards');
        } else if (rule.id === 'set_eternal_ante') {
          setSimMetaNum(state, 'rule:set_eternal_ante', Number(rule.value ?? 4));
        } else if (rule.id === 'set_joker_slots_ante') {
          setSimMetaNum(state, 'rule:set_joker_slots_ante', Number(rule.value ?? 4));
        }
      }
    }
    if (challenge.restrictions.bannedCards) {
      state.tracking.bannedKeys.push(...challenge.restrictions.bannedCards);
    }
    if (challenge.restrictions.bannedTags) {
      state.tracking.bannedTags.push(...challenge.restrictions.bannedTags);
    }
    if (challenge.restrictions.bannedOther) {
      state.tracking.bannedOthers.push(...challenge.restrictions.bannedOther);
    }
    for (let i = 0; i < challenge.vouchers.length; i++) {
      grantStartingVoucher(challenge.vouchers[i].id);
    }
    for (let i = 0; i < challenge.jokers.length; i++) {
      const js = challenge.jokers[i];
      const inst = createJokerInstance(state, js.id, {
        eternal: Boolean(js.eternal),
        edition: normalizeEdition(js.edition),
      });
      state.jokers.push(inst);
      if (js.pinned) {
        setSimMetaStr(state, 'rule:pinned_joker_id', inst.id);
      }
    }
    for (let i = 0; i < challenge.consumables.length; i++) {
      state.consumables.push(createConsumableInstance(state, challenge.consumables[i].id));
    }
  }

  state.handsLeft = state.handsPerRound;
  state.discardsLeft = state.discardsPerRound;
  state.drawPile = state.fullDeck.map((c) => c.id);
  rotateRoundJokerTargets(state);
  syncBankruptAt(state);

  // Re-generate Ante 1 Blinds now that deck anteScaling, stake, and challenge bans are finalized
  state.bossHistory = [];
  state.blinds = generateAnteBlinds(state);
  state.activeBlindSlot = 'Small';
  state.targetChips = state.blinds.Small.targetChips;

  events.push({
    type: 'RUN_STARTED',
    message: `Started run on ${deckDef?.name ?? state.deckId} (Stake ${state.stake})`,
    sound: 'cardFan2',
    payload: { deckId: state.deckId, stake: state.stake, seed: cleanSeed, challengeId: state.challengeId },
  });
  state.events = events;

  return { state, beats: [], events };
}

export function stepSimTick(state: SimState): SimState {
  return { ...state, tick: state.tick + 1 };
}

const CERTIFICATE_SEALS: SealId[] = ['Gold', 'Red', 'Blue', 'Purple'];

function runSettingBlindJokers(state: SimState, events: SimEvent[]): void {
  const blind = getActiveBlind(state);
  const probMultiplier = getProbabilityMultiplier(state.jokers);
  const rand = (k: string) => nextRandom(state.rng, k);
  const randInt = (k: string, max: number) => nextRandomInt(state.rng, k, max);
  const isFace = (c: CardInstance) => isCardFace(c, state.jokers);
  const isSuit = (c: CardInstance, s: Suit) => isCardSuit(c, s, state.jokers);

  const initialIds = state.jokers.map((j) => j.id);
  const destroyedCardIds = new Set<string>();

  for (let sIdx = 0; sIdx < initialIds.length; sIdx++) {
    const sourceIdx = state.jokers.findIndex((j) => j.id === initialIds[sIdx]);
    if (sourceIdx < 0) continue;
    const sourceJoker = state.jokers[sourceIdx];
    if (sourceJoker.debuffed) continue;

    const resolved = resolveCopiedJoker(state.jokers, sourceIdx);
    if (!resolved) continue;
    const targetJoker = resolved.target;
    const targetIndex = resolved.targetIndex;
    const isBlueprint = targetIndex !== sourceIdx;

    if (targetJoker.key === 'j_burglar' || targetJoker.key === 'j_certificate') {
      // Handled in dedicated Burglar / Certificate steps to guarantee zero double-triggers
      continue;
    }

    if (targetJoker.key === 'j_marble') {
      const suit = pickRandom(SUITS, state.rng, `marble_s_${state.round}_${sIdx}`) ?? 'Spades';
      const rank = pickRandom(RANKS, state.rng, `marble_r_${state.round}_${sIdx}`) ?? '2';
      const stone = createCardInstance(state, suit, rank, { enhancement: 'm_stone' });
      state.fullDeck.push(stone);
      events.push({
        type: 'CARD_CREATED',
        message: 'Marble Joker added a Stone Card',
        sound: 'card1',
        payload: { cardId: stone.id },
      });
      notifyJokersCardAdded(state, stone, events);
      continue;
    }

    if (targetJoker.key === 'j_riff_raff') {
      const spawnCount = Math.max(1, Math.floor(safeNum(Number(targetJoker.state.extra ?? 2), 2)));
      for (let k = 0; k < spawnCount; k++) {
        if (state.jokers.length >= getEffectiveJokerSlots(state)) break;
        const def = pickJokerDefFromPool(state, `riff_raff_${state.round}_${sIdx}_${k}`, {
          forcedRarity: 1,
        });
        if (def) {
          const spawned = createJokerInstance(state, def.key, {
            eternal: state.tracking.allEternal && def.eternalCompat,
          });
          state.jokers.push(spawned);
          events.push({
            type: 'CARD_CREATED',
            message: `Riff-Raff created ${def.name}`,
            sound: 'card1',
            payload: { jokerId: spawned.id, key: spawned.key },
          });
        }
      }
      syncBankruptAt(state);
      continue;
    }

    if (targetJoker.key === 'j_madness') {
      if (!isBlueprint && (blind.slot === 'Small' || blind.slot === 'Big')) {
        const curX = safeNum(Number(targetJoker.state.x_mult ?? targetJoker.state.Xmult ?? 1), 1);
        const step = safeNum(Number(targetJoker.state.extra ?? 0.5), 0.5);
        targetJoker.state.x_mult = Math.round((curX + step) * 100) / 100;
        const victims = state.jokers.filter((j) => j.id !== targetJoker.id && !j.eternal);
        const victim = pickRandom(victims, state.rng, `madness_${state.round}_${sIdx}`);
        if (victim) {
          state.jokers = state.jokers.filter((j) => j.id !== victim.id);
          events.push({
            type: 'JOKER_DESTROYED',
            message: `Madness destroyed ${JOKER_MAP[victim.key]?.name ?? victim.key}`,
            sound: 'slice1',
            payload: { jokerId: victim.id, key: victim.key },
          });
          syncBankruptAt(state);
        }
      }
      continue;
    }

    const stepDestroyedJokers = new Set<string>();
    const res = evaluateJokerHook(targetJoker.key, {
      stage: 'setting_blind',
      state,
      joker: targetJoker,
      jokerIndex: targetIndex,
      isBlueprint,
      blueprintSource: isBlueprint ? sourceJoker : undefined,
      probMultiplier,
      rand,
      randInt,
      isFace,
      isSuit,
    });
    if (res) {
      applyLifecycleHookResult(state, sourceJoker, res, events, stepDestroyedJokers, destroyedCardIds);
    }
    if (stepDestroyedJokers.size > 0) {
      for (let i = 0; i < state.jokers.length; i++) {
        const j = state.jokers[i];
        if (stepDestroyedJokers.has(j.id)) {
          events.push({
            type: 'JOKER_DESTROYED',
            message: `${JOKER_MAP[j.key]?.name ?? j.key} destroyed`,
            sound: 'slice1',
            payload: { jokerId: j.id, key: j.key },
          });
        }
      }
      state.jokers = state.jokers.filter((j) => !stepDestroyedJokers.has(j.id));
      syncBankruptAt(state);
    }
  }

  if (destroyedCardIds.size > 0) {
    const removed = state.fullDeck.filter((c) => destroyedCardIds.has(c.id));
    state.fullDeck = state.fullDeck.filter((c) => !destroyedCardIds.has(c.id));
    state.tracking.cardsDestroyedTotal += removed.length;
    notifyJokersCardsDestroyed(state, removed, events);
  }
}

function selectActiveBlindInternal(state: SimState, events: SimEvent[]): void {
  const blind = getActiveBlind(state);
  blind.status = 'Current';
  blind.triggered = false;
  state.round += 1;
  state.stats.highestRound = Math.max(state.stats.highestRound, state.round);
  state.roundChips = 0;
  state.targetChips = blind.targetChips;
  state.currentHandChips = 0;
  state.currentHandMult = 0;
  state.lastHandScore = 0;
  state.lastHandName = null;
  state.lastHandBeats = [];
  state.scoringBeatIndex = 0;

  // Reset per-round tracking
  state.tracking.handsPlayedThisRound = 0;
  state.tracking.discardsUsedThisRound = 0;
  state.tracking.playedHandTypesThisRound = [];
  state.tracking.firstHandTypeThisRound = null;
  state.tracking.verdantLeafSold = false;
  state.tracking.ceruleanBellForcedCardId = null;
  state.tracking.oxMostPlayedHand = state.tracking.mostPlayedHand;
  setSimMetaNum(state, 'water_lost_discards', 0);
  setSimMetaNum(state, 'needle_lost_hands', 0);
  for (let i = 0; i < POKER_HAND_IDS.length; i++) {
    state.handLevels[POKER_HAND_IDS[i]].playedThisRound = 0;
  }

  // Chicot disables Boss Blind automatically (incl. Wall 4x->2x, Violet Vessel 6x->2x)
  if (blind.slot === 'Boss' && countActiveJoker(state, 'j_chicot') > 0) {
    disableActiveBossBlind(state);
  }

  // Compute base hands & discards before boss/Burglar overrides
  const troubadourCount = countActiveJoker(state, 'j_troubadour');
  const drunkardCount = countActiveJoker(state, 'j_drunkard');
  const merryAndyCount = countActiveJoker(state, 'j_merry_andy');

  let baseHands = Math.max(
    1,
    state.handsPerRound + state.tracking.handsDeltaNextRound - troubadourCount
  );
  let baseDiscards = Math.max(
    0,
    state.discardsPerRound + state.tracking.discardsDeltaNextRound + drunkardCount + merryAndyCount * 3
  );
  state.tracking.handsDeltaNextRound = 0;
  state.tracking.discardsDeltaNextRound = 0;

  // Boss Blind start-of-round effects
  if (blind.slot === 'Boss' && !blind.disabled) {
    if (blind.key === 'bl_water') {
      setSimMetaNum(state, 'water_lost_discards', baseDiscards);
      baseDiscards = 0;
      blind.triggered = true;
    } else if (blind.key === 'bl_needle') {
      setSimMetaNum(state, 'needle_lost_hands', Math.max(0, baseHands - 1));
      baseHands = 1;
      blind.triggered = true;
    } else if (blind.key === 'bl_final_acorn' && state.jokers.length > 0) {
      for (let i = 0; i < state.jokers.length; i++) state.jokers[i].faceDown = true;
      state.jokers = shuffleDeterministic(state.jokers, state.rng, `acorn_${state.round}`);
      blind.triggered = true;
    }
    applyCrimsonHeartDebuff(state);
  }

  // Engine-owned j_burglar (runs AFTER Needle/Water & Crimson Heart; Blueprint/Brainstorm compatible!)
  let burglarBonusHands = 0;
  let hasBurglar = false;
  for (let i = 0; i < state.jokers.length; i++) {
    const resolved = resolveCopiedJoker(state.jokers, i);
    if (resolved && resolved.target.key === 'j_burglar') {
      hasBurglar = true;
      burglarBonusHands += Math.max(1, safeNum(Number(resolved.target.state.extra ?? 3), 3));
    }
  }
  state.handsLeft = Math.max(1, baseHands + burglarBonusHands);
  state.discardsLeft = hasBurglar ? 0 : baseDiscards;

  // Trigger `setting_blind` Jokers left-to-right (Marble, Riff-Raff, Madness, Ceremonial Dagger, Cartomancer, etc.)
  runSettingBlindJokers(state, events);

  // Refresh card debuffs & bankrupt threshold after setting_blind
  syncBankruptAt(state);
  state.phase = 'PLAYING';
  refreshCardDebuffs(state);

  // Shuffle entire fullDeck into drawPile and deal initial hand
  state.drawPile = shuffleDeterministic(
    state.fullDeck.map((c) => c.id),
    state.rng,
    `deck_shuffle_${state.ante}_${state.round}`
  );
  state.hand = [];
  state.playArea = [];
  state.discardPile = [];
  state.selectedCardIds = [];

  const drawn = drawCardsToHand(state, getEffectiveHandSize(state), { isInitialDraw: true });

  // Engine-owned j_certificate (Blueprint/Brainstorm compatible: add random sealed card directly to hand & deck)
  for (let i = 0; i < state.jokers.length; i++) {
    const resolved = resolveCopiedJoker(state.jokers, i);
    if (!resolved || resolved.target.key !== 'j_certificate') continue;
    const suit = pickRandom(SUITS, state.rng, `cert_s_${state.round}_${i}`) ?? 'Spades';
    const rank = pickRandom(RANKS, state.rng, `cert_r_${state.round}_${i}`) ?? 'Ace';
    const seal = pickRandom(CERTIFICATE_SEALS, state.rng, `cert_seal_${state.round}_${i}`) ?? 'Gold';
    const certCard = createCardInstance(state, suit, rank, { seal });
    state.fullDeck.push(certCard);
    state.hand.push(certCard.id);
    events.push({
      type: 'CARD_CREATED',
      message: `Certificate added ${rank} of ${suit} (${seal} Seal)`,
      sound: 'card1',
      payload: { cardId: certCard.id, seal },
    });
    notifyJokersCardAdded(state, certCard, events);
  }
  refreshCardDebuffs(state);
  sortHandIds(state, state.sortMode);

  // Trigger `first_hand_drawn` Joker hooks (excluding engine-owned j_certificate)
  runNonScoringHooks(state, 'first_hand_drawn', events, { allowBlueprint: true });

  // Enforce Cerulean Bell forced card
  enforceCeruleanBellSelection(state);

  events.push({
    type: 'BLIND_SELECTED',
    message: `Entered ${blind.name}`,
    sound: 'cardFan2',
    payload: { blindKey: blind.key, targetChips: blind.targetChips },
  });
  events.push({
    type: 'CARDS_DRAWN',
    message: `Drew ${drawn.length} cards`,
    sound: 'card1',
    payload: { count: drawn.length },
  });
}

function fail(state: SimState, message: string): SimStepResult {
  state.lastError = message;
  const errEvent: SimEvent = { type: 'ERROR', message, sound: 'cancel' };
  state.events = [errEvent];
  return { state, beats: [], events: [errEvent] };
}

/**
 * Pure deterministic reducer for every SimAction. Never mutates the caller's SimState.
 */
export function dispatchSim(prevState: SimState, action: SimAction): SimStepResult {
  if (action.type === 'START_RUN') {
    return startRun(action.deckId, action.stake, action.seed, action.challengeId ?? null);
  }
  if (action.type === 'RETURN_TO_TITLE') {
    const title = createTitleState(prevState.rng.seed);
    return { state: title, beats: [], events: [] };
  }

  const state = cloneState(prevState);
  state.events = [];
  state.lastError = null;
  const events: SimEvent[] = [];
  let beats: ScoreBeat[] = [];

  switch (action.type) {
    case 'SELECT_BLIND': {
      if (state.phase !== 'BLIND_SELECT') {
        return fail(state, 'Can only select a blind during BLIND_SELECT');
      }
      selectActiveBlindInternal(state, events);
      break;
    }

    case 'SKIP_BLIND': {
      if (state.phase !== 'BLIND_SELECT') {
        return fail(state, 'Can only skip a blind during BLIND_SELECT');
      }
      if (state.activeBlindSlot === 'Boss') {
        return fail(state, 'Cannot skip the Boss Blind');
      }
      const skipped = getActiveBlind(state);
      skipped.status = 'Skipped';
      state.tracking.skipsTotal += 1;

      runNonScoringHooks(state, 'skip_blind', events);

      // Advance to next blind slot
      state.activeBlindSlot = state.activeBlindSlot === 'Small' ? 'Big' : 'Boss';
      state.blinds[state.activeBlindSlot].status = 'Select';
      state.targetChips = state.blinds[state.activeBlindSlot].targetChips;

      events.push({
        type: 'BLIND_SKIPPED',
        message: `Skipped ${skipped.name}`,
        sound: 'whoosh1',
        payload: { skippedKey: skipped.key, tagKey: skipped.tagKey },
      });

      if (skipped.tagKey) {
        grantTag(state, skipped.tagKey, events);
      }
      break;
    }

    case 'TOGGLE_SELECT_CARD': {
      const canSelect = state.phase === 'PLAYING' || (state.phase === 'PACK_OPEN' && Boolean(state.pack?.needsHand));
      if (!canSelect) {
        return fail(state, 'Cannot select cards in current phase');
      }
      if (!state.hand.includes(action.cardId)) {
        return fail(state, 'Card not in hand');
      }
      const idx = state.selectedCardIds.indexOf(action.cardId);
      if (idx >= 0) {
        // Cerulean Bell prevents deselecting its forced card during PLAYING
        if (
          state.phase === 'PLAYING' &&
          state.tracking.ceruleanBellForcedCardId === action.cardId &&
          getActiveBlind(state).key === 'bl_final_bell' &&
          !getActiveBlind(state).disabled
        ) {
          return fail(state, 'Cerulean Bell forces this card to remain selected');
        }
        state.selectedCardIds.splice(idx, 1);
      } else {
        if (state.selectedCardIds.length >= state.maxSelectCards) {
          return fail(state, `Cannot select more than ${state.maxSelectCards} cards`);
        }
        state.selectedCardIds.push(action.cardId);
      }
      break;
    }

    case 'DESELECT_ALL': {
      if (
        state.phase === 'PLAYING' &&
        state.tracking.ceruleanBellForcedCardId &&
        state.hand.includes(state.tracking.ceruleanBellForcedCardId) &&
        getActiveBlind(state).key === 'bl_final_bell' &&
        !getActiveBlind(state).disabled
      ) {
        state.selectedCardIds = [state.tracking.ceruleanBellForcedCardId];
      } else {
        state.selectedCardIds = [];
      }
      break;
    }

    case 'REORDER_HAND': {
      const { fromIndex, toIndex } = action;
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= state.hand.length ||
        toIndex >= state.hand.length
      ) {
        return fail(state, 'Invalid hand reorder indices');
      }
      const [moved] = state.hand.splice(fromIndex, 1);
      state.hand.splice(toIndex, 0, moved);
      break;
    }

    case 'REORDER_JOKERS': {
      const { fromIndex, toIndex } = action;
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= state.jokers.length ||
        toIndex >= state.jokers.length
      ) {
        return fail(state, 'Invalid joker reorder indices');
      }
      const pinnedId = getSimMetaStr(state, 'rule:pinned_joker_id');
      if (pinnedId && state.jokers[0]?.id === pinnedId && (fromIndex === 0 || toIndex === 0)) {
        return fail(state, 'Pinned Joker must remain in the leftmost slot');
      }
      const [moved] = state.jokers.splice(fromIndex, 1);
      state.jokers.splice(toIndex, 0, moved);
      break;
    }

    case 'SORT_HAND': {
      state.sortMode = action.mode;
      sortHandIds(state, action.mode);
      break;
    }

    case 'PLAY_HAND': {
      if (state.phase !== 'PLAYING') {
        return fail(state, 'Can only play a hand during PLAYING');
      }
      if (state.handsLeft <= 0) {
        return fail(state, 'No hands remaining');
      }
      if (state.selectedCardIds.length < 1 || state.selectedCardIds.length > state.maxSelectCards) {
        return fail(state, `Select 1 to ${state.maxSelectCards} cards to play`);
      }

      // Preserve left-to-right hand ordering for played cards
      const selectedSet = new Set(state.selectedCardIds);
      const playedIds = state.hand.filter((id) => selectedSet.has(id));
      if (playedIds.length === 0) {
        return fail(state, 'Selected cards not found in hand');
      }

      state.handsLeft -= 1;
      state.hand = state.hand.filter((id) => !selectedSet.has(id));
      state.playArea = playedIds;
      state.selectedCardIds = [];

      const playedCards = playedIds
        .map((id) => getCardById(state, id))
        .filter((c): c is CardInstance => Boolean(c));
      // Reveal any face-down played cards
      for (let i = 0; i < playedCards.length; i++) playedCards[i].faceDown = false;

      // The Hook: discard up to 2 random remaining cards from hand before scoring
      const preBeats: Array<Omit<ScoreBeat, 'id' | 'chipsAfter' | 'multAfter'>> = [];
      const activeBlind = getActiveBlind(state);
      activeBlind.triggered = false;
      if (
        activeBlind.slot === 'Boss' &&
        activeBlind.key === 'bl_hook' &&
        !activeBlind.disabled &&
        state.hand.length > 0
      ) {
        const shuffledHand = shuffleDeterministic(state.hand, state.rng, `hook_${state.round}_${state.tracking.handsPlayedThisRound}`);
        const hookVictims = shuffledHand.slice(0, Math.min(2, shuffledHand.length));
        const hookSet = new Set(hookVictims);
        state.hand = state.hand.filter((id) => !hookSet.has(id));
        for (let hi = 0; hi < hookVictims.length; hi++) {
          const hCard = getCardById(state, hookVictims[hi]);
          if (hCard) {
            hCard.faceDown = false;
            if (!hCard.debuffed && hCard.seal === 'Purple' && state.consumables.length < getEffectiveConsumableSlots(state)) {
              const tarot = pickConsumableDefFromPool(state, 'Tarot', `purple_hook_${state.round}_${hi}`);
              if (tarot) state.consumables.push(createConsumableInstance(state, tarot.key));
            }
          }
          state.discardPile.push(hookVictims[hi]);
        }
        activeBlind.triggered = true;
        preBeats.push({
          kind: 'boss_modify',
          sourceType: 'blind',
          sourceId: activeBlind.key,
          message: `The Hook discarded ${hookVictims.length} card${hookVictims.length > 1 ? 's' : ''}!`,
          color: PALETTE.RED,
          sound: 'cardSlide1',
          durationMs: 360,
        });
      }

      events.push({
        type: 'HAND_PLAYED',
        message: `Played ${playedCards.length} card${playedCards.length > 1 ? 's' : ''}`,
        sound: 'cardSlide1',
        payload: { cardIds: playedIds },
      });

      const scoreRes = scorePlayedHand(state, playedCards, preBeats);
      beats = scoreRes.beats;
      events.push(...scoreRes.events);
      state.phase = 'SCORING';
      break;
    }

    case 'FINISH_SCORING': {
      if (state.phase !== 'SCORING') {
        return fail(state, 'Not currently in SCORING phase');
      }

      // Move surviving playArea cards to discardPile
      const deckIdSet = new Set(state.fullDeck.map((c) => c.id));
      for (let i = 0; i < state.playArea.length; i++) {
        if (deckIdSet.has(state.playArea[i])) {
          state.discardPile.push(state.playArea[i]);
        }
      }
      state.playArea = [];
      state.scoringBeatIndex = state.lastHandBeats.length;
      syncBankruptAt(state);
      refreshCardDebuffs(state);

      const savedByMrBones = state.lastHandBeats.some((b) => b.kind === 'mr_bones_save');
      const blindWon = state.roundChips >= state.targetChips || savedByMrBones;

      if (blindWon) {
        handleRoundVictoryTransition(state, events);
      } else if (state.handsLeft <= 0) {
        state.phase = 'GAME_OVER';
        state.stats.defeatedBy = getActiveBlind(state).key;
        events.push({
          type: 'GAME_OVER',
          message: `Defeated by ${getActiveBlind(state).name}`,
          sound: 'cancel',
          payload: { blindKey: getActiveBlind(state).key },
        });
      } else {
        // Draw replacement cards for next hand
        const blind = getActiveBlind(state);
        const isSerpent = blind.slot === 'Boss' && blind.key === 'bl_serpent' && !blind.disabled;
        const need = isSerpent ? 3 : Math.max(0, getEffectiveHandSize(state) - state.hand.length);
        if (isSerpent) blind.triggered = true;
        const drawn = drawCardsToHand(state, need, { afterHandPlayed: true });
        sortHandIds(state, state.sortMode);

        // Rotate Crimson Heart & enforce Cerulean Bell
        applyCrimsonHeartDebuff(state);
        enforceCeruleanBellSelection(state);

        if (state.hand.length === 0) {
          state.phase = 'GAME_OVER';
          state.stats.defeatedBy = blind.key;
          events.push({
            type: 'GAME_OVER',
            message: 'Out of cards in deck!',
            sound: 'cancel',
            payload: { blindKey: blind.key },
          });
        } else {
          state.phase = 'PLAYING';
          if (drawn.length > 0) {
            events.push({
              type: 'CARDS_DRAWN',
              message: `Drew ${drawn.length} cards`,
              sound: 'card1',
              payload: { count: drawn.length },
            });
          }
        }
      }
      break;
    }

    case 'DISCARD_HAND': {
      if (state.phase !== 'PLAYING') {
        return fail(state, 'Can only discard during PLAYING');
      }
      if (state.discardsLeft <= 0) {
        return fail(state, 'No discards remaining');
      }
      if (state.selectedCardIds.length < 1 || state.selectedCardIds.length > state.maxSelectCards) {
        return fail(state, `Select 1 to ${state.maxSelectCards} cards to discard`);
      }

      // Golden Needle challenge: discards cost $X
      const discardCost = getSimMetaNum(state, 'rule:discard_cost') ?? 0;
      if (discardCost > 0) {
        if (state.dollars - discardCost < state.bankruptAt) {
          return fail(state, `Need $${discardCost} to discard`);
        }
        state.dollars = safeNum(state.dollars - discardCost, state.dollars);
      }

      const selectedSet = new Set(state.selectedCardIds);
      const discardedIds = state.hand.filter((id) => selectedSet.has(id));
      const discardedCards = discardedIds
        .map((id) => getCardById(state, id))
        .filter((c): c is CardInstance => Boolean(c));

      state.discardsLeft -= 1;
      state.tracking.discardsUsedThisRound += 1;
      state.tracking.discardsUsedTotal += 1;
      state.stats.cardsDiscarded += discardedCards.length;

      const destroyedCardIds = new Set<string>();
      const destroyedJokerIds = new Set<string>();

      // Engine-owned j_burnt (first discard of round: upgrade level of discarded poker hand; Blueprint compatible!)
      if (state.tracking.discardsUsedThisRound === 1 && discardedCards.length > 0) {
        const discEval = evaluatePokerHand(discardedCards, state.jokers);
        for (let j = 0; j < state.jokers.length; j++) {
          const resolved = resolveCopiedJoker(state.jokers, j);
          if (!resolved || resolved.target.key !== 'j_burnt') continue;
          const hl = state.handLevels[discEval.handId];
          if (hl) {
            hl.level += 1;
            hl.chips += hl.lChips;
            hl.mult += hl.lMult;
            hl.visible = true;
            events.push({
              type: 'CONSUMABLE_USED',
              message: `Burnt Joker: ${discEval.handId} Lv.${hl.level}!`,
              sound: 'tarot1',
              payload: { handId: discEval.handId, level: hl.level },
            });
          }
        }
      }

      // Engine-owned j_trading (first discard of round with 1 card: destroy card & earn +$3 per active Trading Card)
      if (state.tracking.discardsUsedThisRound === 1 && discardedCards.length === 1) {
        const tradingCount = countActiveJoker(state, 'j_trading');
        if (tradingCount > 0) {
          destroyedCardIds.add(discardedCards[0].id);
          const payout = 3 * tradingCount;
          state.dollars = safeNum(state.dollars + payout, state.dollars);
          events.push({
            type: 'CARD_DESTROYED',
            message: `Trading Card: +$${payout}`,
            sound: 'coin1',
            payload: { cardId: discardedCards[0].id, dollars: payout },
          });
        }
      }

      // Trigger `discard` Joker hooks left-to-right for each discarded card
      const probMultiplier = getProbabilityMultiplier(state.jokers);
      const rand = (k: string) => nextRandom(state.rng, k);
      const randInt = (k: string, max: number) => nextRandomInt(state.rng, k, max);
      const isFace = (c: CardInstance) => isCardFace(c, state.jokers);
      const isSuit = (c: CardInstance, s: Suit) => isCardSuit(c, s, state.jokers);

      for (let cIdx = 0; cIdx < discardedCards.length; cIdx++) {
        const card = discardedCards[cIdx];
        card.faceDown = false;
        for (let j = 0; j < state.jokers.length; j++) {
          const sourceJoker = state.jokers[j];
          if (sourceJoker.debuffed || destroyedJokerIds.has(sourceJoker.id)) continue;
          const resolved = resolveCopiedJoker(state.jokers, j);
          if (!resolved) continue;
          if (resolved.target.key === 'j_burnt' || resolved.target.key === 'j_trading') continue;
          const res = evaluateJokerHook(resolved.target.key, {
            stage: 'discard',
            state,
            joker: resolved.target,
            jokerIndex: resolved.targetIndex,
            isBlueprint: resolved.targetIndex !== j,
            blueprintSource: resolved.targetIndex !== j ? sourceJoker : undefined,
            fullHand: discardedCards,
            card,
            probMultiplier,
            rand,
            randInt,
            isFace,
            isSuit,
          });
          if (res) {
            applyLifecycleHookResult(state, sourceJoker, res, events, destroyedJokerIds, destroyedCardIds);
          }
        }

        // Purple Seal: create 1 random Tarot if consumable slot available
        if (!card.debuffed && card.seal === 'Purple' && state.consumables.length < getEffectiveConsumableSlots(state)) {
          const tarot = pickConsumableDefFromPool(state, 'Tarot', `purple_seal_${state.round}_${cIdx}`);
          if (tarot) {
            state.consumables.push(createConsumableInstance(state, tarot.key));
          }
        }
      }

      // Remove discarded cards from hand (destroyed ones removed from fullDeck, survivors to discardPile)
      state.hand = state.hand.filter((id) => !selectedSet.has(id));
      state.selectedCardIds = [];
      for (let i = 0; i < discardedIds.length; i++) {
        if (!destroyedCardIds.has(discardedIds[i])) {
          state.discardPile.push(discardedIds[i]);
        }
      }
      if (destroyedCardIds.size > 0) {
        const removed = state.fullDeck.filter((c) => destroyedCardIds.has(c.id));
        state.fullDeck = state.fullDeck.filter((c) => !destroyedCardIds.has(c.id));
        state.tracking.cardsDestroyedTotal += removed.length;
        notifyJokersCardsDestroyed(state, removed, events);
      }
      if (destroyedJokerIds.size > 0) {
        state.jokers = state.jokers.filter((j) => !destroyedJokerIds.has(j.id));
        syncBankruptAt(state);
      }

      events.push({
        type: 'CARDS_DISCARDED',
        message: `Discarded ${discardedCards.length} card${discardedCards.length > 1 ? 's' : ''}`,
        sound: 'cardSlide2',
        payload: { cardIds: discardedIds },
      });

      // Draw replacement cards (The Serpent draws 3)
      const blind = getActiveBlind(state);
      const isSerpent = blind.slot === 'Boss' && blind.key === 'bl_serpent' && !blind.disabled;
      const need = isSerpent ? 3 : Math.max(0, getEffectiveHandSize(state) - state.hand.length);
      if (isSerpent) blind.triggered = true;
      const drawn = drawCardsToHand(state, need);
      sortHandIds(state, state.sortMode);
      enforceCeruleanBellSelection(state);

      if (drawn.length > 0) {
        events.push({
          type: 'CARDS_DRAWN',
          message: `Drew ${drawn.length} cards`,
          sound: 'card1',
          payload: { count: drawn.length },
        });
      }
      break;
    }

    case 'FINISH_CASHOUT': {
      if (state.phase !== 'CASHOUT') {
        return fail(state, 'Not currently in CASHOUT phase');
      }
      const payout = state.cashout?.total ?? 0;
      state.dollars = safeNum(state.dollars + payout, state.dollars);
      state.cashout = null;

      // Consume Investment Tags if Boss Blind
      if (state.activeBlindSlot === 'Boss') {
        state.tags = state.tags.filter((t) => t !== 'tag_investment');
      }

      // Return all cards cleanly to drawPile before entering Shop
      state.drawPile = state.fullDeck.map((c) => c.id);
      state.hand = [];
      state.playArea = [];
      state.discardPile = [];
      state.selectedCardIds = [];

      state.shop = generateShop(state);
      state.phase = 'SHOP';

      events.push({
        type: 'CASHOUT_COMPLETE',
        message: `Cashed out $${payout}`,
        sound: 'coin1',
        payload: { payout },
      });
      events.push({
        type: 'SHOP_ENTERED',
        message: 'Entered Shop',
        sound: 'cardFan2',
      });
      break;
    }

    case 'SHOP_REROLL': {
      if (state.phase !== 'SHOP' || !state.shop) {
        return fail(state, 'Not in SHOP phase');
      }
      const cost = state.freeRerolls > 0 ? 0 : state.rerollCost;
      if (state.dollars - cost < state.bankruptAt) {
        return fail(state, 'Not enough money to reroll');
      }
      state.dollars = safeNum(state.dollars - cost, state.dollars);
      if (state.freeRerolls > 0) {
        state.freeRerolls -= 1;
      } else {
        state.rerollCost += 1 + state.tracking.inflationRerollBump;
      }
      state.shop.rerollsUsed += 1;
      state.tracking.rerollsThisRun += 1;
      state.stats.timesRerolled += 1;
      state.shop.offers = generateShopOffers(state, true);

      runNonScoringHooks(state, 'reroll_shop', events);

      events.push({
        type: 'SHOP_REROLLED',
        message: cost === 0 ? 'Free Reroll!' : `Rerolled for $${cost}`,
        sound: 'coin2',
        payload: { cost },
      });
      break;
    }

    case 'SHOP_BUY_OFFER': {
      if (state.phase !== 'SHOP' || !state.shop) {
        return fail(state, 'Not in SHOP phase');
      }
      const offer = state.shop.offers.find((o) => o.id === action.offerId && !o.sold);
      if (!offer) {
        return fail(state, 'Offer not available');
      }
      if (state.dollars - offer.cost < state.bankruptAt) {
        return fail(state, 'Not enough money');
      }

      if (offer.kind === 'joker') {
        const hasRoom = offer.edition === 'e_negative' || state.jokers.length < getEffectiveJokerSlots(state);
        if (!hasRoom) return fail(state, 'No free Joker slot');
        state.dollars = safeNum(state.dollars - offer.cost, state.dollars);
        offer.sold = true;
        const joker = createJokerInstance(state, offer.key, {
          edition: offer.edition,
          eternal: offer.eternal,
          perishable: offer.perishable,
          rental: offer.rental,
          cost: offer.cost,
        });
        state.jokers.push(joker);
        if (joker.key === 'j_chaos') {
          state.freeRerolls += 1;
        }
        if (joker.key === 'j_astronomer') {
          repriceCurrentShop(state);
        }
        syncBankruptAt(state);
      } else if (offer.kind === 'playing_card') {
        state.dollars = safeNum(state.dollars - offer.cost, state.dollars);
        offer.sold = true;
        const card = createCardInstance(state, offer.suit ?? 'Spades', offer.rank ?? 'Ace', {
          enhancement: offer.enhancement ?? 'none',
          edition: offer.edition,
          seal: offer.seal ?? 'none',
        });
        state.fullDeck.push(card);
        state.drawPile.push(card.id);
        notifyJokersCardAdded(state, card, events);
      } else {
        // Consumable (tarot / planet / spectral)
        if (action.useImmediately) {
          const check = canUseConsumable(state, offer.key, [], false);
          if (!check.ok) return fail(state, check.reason ?? 'Cannot use consumable immediately');
          state.dollars = safeNum(state.dollars - offer.cost, state.dollars);
          offer.sold = true;
          const res = applyConsumable(state, offer.key, [], { edition: offer.edition });
          events.push(...res.events);
          syncBankruptAt(state);
          refreshCardDebuffs(state);
        } else {
          const hasRoom =
            offer.edition === 'e_negative' ||
            state.consumables.length < getEffectiveConsumableSlots(state);
          if (!hasRoom) return fail(state, 'No free consumable slot');
          state.dollars = safeNum(state.dollars - offer.cost, state.dollars);
          offer.sold = true;
          state.consumables.push(
            createConsumableInstance(state, offer.key, { edition: offer.edition, cost: offer.cost })
          );
        }
      }

      if (hasChallengeRule(state, 'inflation')) {
        state.tracking.inflationCostBump += 1;
        repriceCurrentShop(state);
      }
      state.stats.cardsPurchased += 1;
      runNonScoringHooks(state, 'buying_card', events, { itemKey: offer.key, itemKind: offer.kind });
      events.push({
        type: 'ITEM_BOUGHT',
        message: `Bought ${offer.key}`,
        sound: 'coin1',
        payload: { offerId: offer.id, key: offer.key, cost: offer.cost },
      });
      break;
    }

    case 'SHOP_BUY_VOUCHER': {
      if (state.phase !== 'SHOP' || !state.shop) {
        return fail(state, 'Not in SHOP phase');
      }
      const vOffer = state.shop.vouchers.find((v) => v.id === action.voucherOfferId && !v.redeemed);
      if (!vOffer) {
        return fail(state, 'Voucher not available');
      }
      if (state.dollars - vOffer.cost < state.bankruptAt) {
        return fail(state, 'Not enough money for Voucher');
      }

      state.dollars = safeNum(state.dollars - vOffer.cost, state.dollars);
      vOffer.redeemed = true;
      if (!state.vouchers.includes(vOffer.key)) {
        state.vouchers.push(vOffer.key);
        state.tracking.vouchersRedeemedTotal += 1;
        applyVoucherEffect(state, vOffer.key);
      }
      if (hasChallengeRule(state, 'inflation')) {
        state.tracking.inflationCostBump += 1;
        repriceCurrentShop(state);
      }

      events.push({
        type: 'VOUCHER_REDEEMED',
        message: `Redeemed ${VOUCHER_MAP[vOffer.key]?.name ?? vOffer.key}`,
        sound: 'timpani',
        payload: { key: vOffer.key },
      });
      break;
    }

    case 'SHOP_BUY_BOOSTER': {
      if (state.phase !== 'SHOP' || !state.shop) {
        return fail(state, 'Not in SHOP phase');
      }
      const bOffer = state.shop.boosters.find((b) => b.id === action.boosterOfferId && !b.opened);
      if (!bOffer) {
        return fail(state, 'Booster Pack not available');
      }
      if (state.dollars - bOffer.cost < state.bankruptAt) {
        return fail(state, 'Not enough money for Booster Pack');
      }

      state.dollars = safeNum(state.dollars - bOffer.cost, state.dollars);
      bOffer.opened = true;
      if (hasChallengeRule(state, 'inflation')) {
        state.tracking.inflationCostBump += 1;
        repriceCurrentShop(state);
      }
      openBoosterPack(state, bOffer.key, bOffer.kind, bOffer.size, bOffer.extra, bOffer.choose);
      runNonScoringHooks(state, 'open_booster', events, { itemKey: bOffer.key, itemKind: 'booster' });

      events.push({
        type: 'PACK_OPENED',
        message: `Opened ${bOffer.size} ${bOffer.kind} Pack`,
        sound: 'magic_crumple',
        payload: { boosterKey: bOffer.key },
      });
      break;
    }

    case 'PACK_PICK': {
      if (state.phase !== 'PACK_OPEN' || !state.pack) {
        return fail(state, 'No Booster Pack currently open');
      }
      const pCard = state.pack.cards.find((c) => c.id === action.packCardId && !c.taken);
      if (!pCard) {
        return fail(state, 'Pack card not available');
      }

      if (pCard.kind === 'joker') {
        const hasRoom = pCard.edition === 'e_negative' || state.jokers.length < getEffectiveJokerSlots(state);
        if (!hasRoom) return fail(state, 'No free Joker slot');
        const joker = createJokerInstance(state, pCard.key, {
          edition: pCard.edition,
          eternal: pCard.eternal,
          perishable: pCard.perishable,
          rental: pCard.rental,
        });
        state.jokers.push(joker);
        if (state.shop && joker.key === 'j_chaos') {
          state.freeRerolls += 1;
        }
        if (state.shop && joker.key === 'j_astronomer') {
          repriceCurrentShop(state);
        }
        syncBankruptAt(state);
        pCard.taken = true;
        events.push({
          type: 'ITEM_BOUGHT',
          message: `Picked ${JOKER_MAP[pCard.key]?.name ?? pCard.key}`,
          sound: 'card1',
          payload: { key: pCard.key },
        });
      } else if (pCard.kind === 'playing_card') {
        const card = createCardInstance(state, pCard.suit ?? 'Spades', pCard.rank ?? 'Ace', {
          enhancement: pCard.enhancement ?? 'none',
          edition: pCard.edition,
          seal: pCard.seal ?? 'none',
        });
        state.fullDeck.push(card);
        state.drawPile.push(card.id);
        notifyJokersCardAdded(state, card, events);
        pCard.taken = true;
        events.push({
          type: 'CARD_CREATED',
          message: `Added ${card.rank} of ${card.suit} to deck`,
          sound: 'card1',
          payload: { cardId: card.id },
        });
      } else {
        const targets = action.targetCardIds ?? state.selectedCardIds;
        const check = canUseConsumable(state, pCard.key, targets, false);
        if (!check.ok) {
          return fail(state, check.reason ?? 'Cannot use pack consumable');
        }
        const res = applyConsumable(state, pCard.key, targets, { edition: pCard.edition });
        events.push(...res.events);
        syncBankruptAt(state);
        refreshCardDebuffs(state);
        pCard.taken = true;
        state.selectedCardIds = [];
      }

      state.pack.chooseRemaining -= 1;
      if (state.pack.chooseRemaining <= 0) {
        closeOpenPack(state, events);
      }
      break;
    }

    case 'PACK_SKIP': {
      if (state.phase !== 'PACK_OPEN' || !state.pack) {
        return fail(state, 'No Booster Pack currently open');
      }
      runNonScoringHooks(state, 'skipping_booster', events);
      closeOpenPack(state, events);
      break;
    }

    case 'SHOP_NEXT_ROUND': {
      if (state.phase !== 'SHOP') {
        return fail(state, 'Can only advance round from SHOP');
      }

      // Engine-owned j_perkeo (Blueprint/Brainstorm compatible): create Negative copy of 1 random held consumable at end of shop
      for (let i = 0; i < state.jokers.length; i++) {
        const resolved = resolveCopiedJoker(state.jokers, i);
        if (!resolved || resolved.target.key !== 'j_perkeo') continue;
        if (state.consumables.length === 0) break;
        const src = pickRandom(state.consumables, state.rng, `perkeo_${state.round}_${i}`);
        if (src) {
          const negCopy = createConsumableInstance(state, src.key, {
            edition: 'e_negative',
            cost: src.cost,
          });
          state.consumables.push(negCopy);
          events.push({
            type: 'CARD_CREATED',
            message: `Perkeo copied ${CONSUMABLE_MAP[src.key]?.name ?? src.key}`,
            sound: 'negative',
            payload: { key: src.key, edition: 'e_negative' },
          });
        }
      }

      state.shop = null;

      if (state.activeBlindSlot === 'Small') {
        state.activeBlindSlot = 'Big';
        state.blinds.Big.status = 'Select';
      } else if (state.activeBlindSlot === 'Big') {
        state.activeBlindSlot = 'Boss';
        state.blinds.Boss.status = 'Select';
      } else {
        // Advance to next Ante
        state.ante += 1;
        state.stats.highestAnte = Math.max(state.stats.highestAnte, state.ante);
        state.bossRerolledThisAnte = false;
        if (!hasChallengeRule(state, 'debuff_played_cards')) {
          for (let i = 0; i < state.fullDeck.length; i++) {
            state.fullDeck[i].playedThisAnte = false;
          }
        }
        state.blinds = generateAnteBlinds(state);
        state.activeBlindSlot = 'Small';
      }

      state.targetChips = state.blinds[state.activeBlindSlot].targetChips;
      state.phase = 'BLIND_SELECT';
      break;
    }

    case 'SELL_JOKER': {
      const idx = state.jokers.findIndex((j) => j.id === action.jokerId);
      if (idx < 0) return fail(state, 'Joker not found');
      const joker = state.jokers[idx];
      if (joker.eternal) return fail(state, 'Cannot sell Eternal Joker');

      state.jokers.splice(idx, 1);
      state.dollars = safeNum(state.dollars + joker.sellValue, state.dollars);

      // Engine-owned j_luchador: disables active Boss Blind & restores flipped/debuffed cards
      if (joker.key === 'j_luchador' && !joker.debuffed) {
        const blind = getActiveBlind(state);
        if (
          blind.slot === 'Boss' &&
          (state.phase === 'PLAYING' || state.phase === 'SCORING' || blind.status === 'Current')
        ) {
          disableActiveBossBlind(state);
        }
      }
      // Engine-owned j_diet_cola: grants a Double Tag on sell
      if (joker.key === 'j_diet_cola' && !joker.debuffed) {
        grantTag(state, 'tag_double', events);
      }
      // Engine-owned j_invisible: after 2 rounds, selling duplicates 1 random other Joker (removing Negative)
      if (joker.key === 'j_invisible' && !joker.debuffed) {
        const rounds = safeNum(Number(joker.state.invis_rounds ?? 0), 0);
        const needed = safeNum(Number(joker.state.extra ?? 2), 2);
        if (rounds >= needed && state.jokers.length > 0) {
          const chosen = pickRandom(state.jokers, state.rng, `invisible_dup_${state.round}`) ?? state.jokers[0];
          const clone = createJokerInstance(state, chosen.key, {
            edition: chosen.edition === 'e_negative' ? 'none' : chosen.edition,
            eternal: chosen.eternal,
            perishable: chosen.perishable,
            rental: chosen.rental,
            cost: chosen.cost,
          });
          clone.perishableTally = chosen.perishableTally;
          clone.extraSellValue = chosen.extraSellValue;
          clone.sellValue = chosen.sellValue;
          clone.state = { ...chosen.state };
          state.jokers.push(clone);
          events.push({
            type: 'CARD_CREATED',
            message: `Invisible Joker duplicated ${JOKER_MAP[chosen.key]?.name ?? chosen.key}`,
            sound: 'tarot1',
            payload: { jokerId: clone.id, key: clone.key },
          });
        }
      }
      // Verdant Leaf undebuffs cards when any Joker is sold
      const activeBlind = getActiveBlind(state);
      if (activeBlind.slot === 'Boss' && activeBlind.key === 'bl_final_leaf') {
        state.tracking.verdantLeafSold = true;
      }

      syncBankruptAt(state);
      refreshCardDebuffs(state);
      runNonScoringHooks(state, 'selling_card', events, { itemKey: joker.key, itemKind: 'joker' });

      events.push({
        type: 'ITEM_SOLD',
        message: `Sold ${JOKER_MAP[joker.key]?.name ?? joker.key} for $${joker.sellValue}`,
        sound: 'coin2',
        payload: { jokerId: joker.id, key: joker.key, sellValue: joker.sellValue },
      });
      break;
    }

    case 'SELL_CONSUMABLE': {
      const idx = state.consumables.findIndex((c) => c.id === action.consumableId);
      if (idx < 0) return fail(state, 'Consumable not found');
      const cons = state.consumables[idx];
      state.consumables.splice(idx, 1);
      state.dollars = safeNum(state.dollars + cons.sellValue, state.dollars);

      runNonScoringHooks(state, 'selling_card', events, { itemKey: cons.key, itemKind: cons.set });
      events.push({
        type: 'ITEM_SOLD',
        message: `Sold ${CONSUMABLE_MAP[cons.key]?.name ?? cons.key} for $${cons.sellValue}`,
        sound: 'coin2',
        payload: { consumableId: cons.id, key: cons.key, sellValue: cons.sellValue },
      });
      break;
    }

    case 'USE_CONSUMABLE': {
      const idx = state.consumables.findIndex((c) => c.id === action.consumableId);
      if (idx < 0) return fail(state, 'Consumable not found');
      const cons = state.consumables[idx];
      const targets = action.targetCardIds ?? state.selectedCardIds;

      const check = canUseConsumable(state, cons.key, targets, true);
      if (!check.ok) {
        return fail(state, check.reason ?? 'Cannot use consumable');
      }

      // Remove before applying so slot-creating Tarots like Fool/Emperor can reuse the freed slot
      state.consumables.splice(idx, 1);
      const res = applyConsumable(state, cons.key, targets, {
        set: cons.set,
        edition: cons.edition,
      });
      events.push(...res.events);
      syncBankruptAt(state);
      refreshCardDebuffs(state);
      state.selectedCardIds = [];
      enforceCeruleanBellSelection(state);
      break;
    }

    case 'REROLL_BOSS': {
      if (state.phase !== 'BLIND_SELECT') {
        return fail(state, 'Can only reroll Boss Blind during BLIND_SELECT');
      }
      const hasRetcon = state.vouchers.includes('v_retcon');
      const hasDirector = state.vouchers.includes('v_directors_cut');
      if (!hasRetcon && !hasDirector) {
        return fail(state, "Requires Director's Cut or Retcon voucher");
      }
      if (!hasRetcon && state.bossRerolledThisAnte) {
        return fail(state, "Director's Cut allows only 1 reroll per Ante");
      }
      if (state.dollars - 10 < state.bankruptAt) {
        return fail(state, 'Need $10 to reroll Boss Blind');
      }

      state.dollars = safeNum(state.dollars - 10, state.dollars);
      state.bossRerolledThisAnte = true;
      const newBoss = pickBossBlind(state, undefined, state.blinds.Boss.key);
      const bossDollars =
        state.tracking.noReward || hasSimFlag(state, 'rule:no_reward_Boss')
          ? 0
          : newBoss.dollars;
      state.blinds.Boss = {
        slot: 'Boss',
        key: newBoss.key,
        name: newBoss.name,
        status: state.blinds.Boss.status,
        mult: newBoss.mult,
        targetChips: computeTargetChips(state, newBoss.mult),
        dollars: bossDollars,
        tagKey: null,
        bossColor: newBoss.bossColor,
        triggered: false,
        disabled: false,
      };
      if (state.activeBlindSlot === 'Boss') {
        state.targetChips = state.blinds.Boss.targetChips;
      }
      events.push({
        type: 'SHOP_REROLLED',
        message: `Boss rerolled to ${newBoss.name}`,
        sound: 'coin2',
        payload: { bossKey: newBoss.key },
      });
      break;
    }

    case 'CONTINUE_ENDLESS': {
      if (state.phase !== 'VICTORY') {
        return fail(state, 'Can only continue endless from VICTORY');
      }
      state.endless = true;
      if (!state.cashout) {
        state.cashout = computeCashoutBreakdown(state);
      }
      state.phase = 'CASHOUT';
      break;
    }

    case 'DEBUG_MUTATE': {
      switch (action.op) {
        case 'WARP_ANTE': {
          const targetAnte = Math.max(1, Math.floor(action.ante ?? state.ante));
          state.ante = targetAnte;
          state.stats.highestAnte = Math.max(state.stats.highestAnte, targetAnte);
          state.bossRerolledThisAnte = false;
          state.shop = null;
          state.pack = null;
          state.cashout = null;
          state.blinds = generateAnteBlinds(state, action.key);
          state.activeBlindSlot = action.key ? 'Boss' : 'Small';
          if (action.key) {
            state.blinds.Small.status = 'Defeated';
            state.blinds.Big.status = 'Defeated';
            state.blinds.Boss.status = 'Select';
          }
          state.targetChips = state.blinds[state.activeBlindSlot].targetChips;
          state.phase = 'BLIND_SELECT';
          break;
        }
        case 'GRANT_JOKER': {
          const key = action.key ?? 'j_joker';
          const ed: EditionId = action.edition ?? 'none';
          const joker = createJokerInstance(state, key, { edition: ed });
          state.jokers.push(joker);
          syncBankruptAt(state);
          refreshCardDebuffs(state);
          break;
        }
        case 'GRANT_CONSUMABLE': {
          const key = action.key ?? 'c_pluto';
          const ed: EditionId = action.edition ?? 'none';
          state.consumables.push(createConsumableInstance(state, key, { edition: ed }));
          break;
        }
        case 'GRANT_VOUCHER': {
          const key = action.key;
          if (key && !state.vouchers.includes(key)) {
            state.vouchers.push(key);
            state.tracking.vouchersRedeemedTotal += 1;
            applyVoucherEffect(state, key);
          }
          break;
        }
        case 'GRANT_TAG': {
          if (action.key) {
            grantTag(state, action.key, events);
          }
          break;
        }
        case 'SET_DOLLARS': {
          state.dollars = safeNum(Math.floor(action.amount ?? 0), 0);
          break;
        }
        case 'WIN_BLIND': {
          if (state.phase === 'BLIND_SELECT') {
            selectActiveBlindInternal(state, events);
          }
          state.roundChips = Math.max(state.roundChips, state.targetChips);
          handleRoundVictoryTransition(state, events);
          break;
        }
        case 'LOSE_BLIND': {
          state.handsLeft = 0;
          state.roundChips = 0;
          state.phase = 'GAME_OVER';
          state.stats.defeatedBy = getActiveBlind(state).key;
          events.push({
            type: 'GAME_OVER',
            message: 'Blind Lost (Debug)',
            sound: 'cancel',
          });
          break;
        }
      }
      break;
    }
  }

  state.events = events;
  return { state, beats, events };
}
