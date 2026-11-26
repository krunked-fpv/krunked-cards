import {
  PALETTE,
  POKER_HAND_IDS,
  RANK_CHIPS,
  type CardInstance,
  type JokerEvalResult,
  type JokerInstance,
  type PokerHandId,
  type ScoreBeat,
  type ScoreBeatKind,
  type SimEvent,
  type SimState,
  type SoundKey,
  type Suit,
} from '../contracts/index.ts';
import { CONSUMABLE_MAP, DECK_MAP, JOKER_MAP, evaluateJokerHook } from '../data/index.ts';
import { notifyJokersCardAdded, notifyJokersCardsDestroyed } from './consumables.ts';
import { evaluatePokerHand, isCardFace, isCardSuit } from './poker.ts';
import { nextRandom, nextRandomInt } from './prng.ts';
import {
  createCardInstance,
  createConsumableInstance,
  createJokerInstance,
  getActiveBlind,
  getCardById,
  getEffectiveConsumableSlots,
  getEffectiveJokerSlots,
  getProbabilityMultiplier,
  pickConsumableDefFromPool,
  pickJokerDefFromPool,
  recalcJokerSellValue,
  resolveCopiedJoker,
  safeNum,
} from './shop.ts';

const MAX_SAFE_SCORE = 1e300;

function clampFinite(val: number, fallback = 0): number {
  if (!Number.isFinite(val)) return fallback;
  if (val > MAX_SAFE_SCORE) return MAX_SAFE_SCORE;
  if (val < -MAX_SAFE_SCORE) return -MAX_SAFE_SCORE;
  return val;
}

function updateMostPlayedHand(state: SimState): void {
  let best: PokerHandId = state.tracking.mostPlayedHand;
  let bestCount = -1;
  for (let i = 0; i < POKER_HAND_IDS.length; i++) {
    const id = POKER_HAND_IDS[i];
    const played = state.handLevels[id]?.played ?? 0;
    if (played > bestCount) {
      bestCount = played;
      best = id;
    }
  }
  state.tracking.mostPlayedHand = best;
}

export interface ScoreHandOutput {
  beats: ScoreBeat[];
  events: SimEvent[];
  handScore: number;
  blindCleared: boolean;
  savedByMrBones: boolean;
}

/**
 * Exact 7-step deterministic scoring pipeline emitting ordered ScoreBeat[].
 * Mutates the cloned next-state cleanly with NaN/Infinity guards throughout.
 */
export function scorePlayedHand(
  state: SimState,
  playedCards: CardInstance[],
  preBeats: Array<Omit<ScoreBeat, 'id' | 'chipsAfter' | 'multAfter'>> = []
): ScoreHandOutput {
  const beats: ScoreBeat[] = [];
  const events: SimEvent[] = [];
  let nextBeatId = 1;
  let pitchStep = 0;

  let chips = 0;
  let mult = 0;

  const pushBeat = (spec: {
    kind: ScoreBeatKind;
    sourceType: ScoreBeat['sourceType'];
    sourceId?: string;
    chipsDelta?: number;
    multDelta?: number;
    xMult?: number;
    dollarsDelta?: number;
    message?: string;
    color?: string;
    sound?: SoundKey;
    escalatePitch?: boolean;
    durationMs: number;
  }): void => {
    let step: number | undefined;
    if (spec.escalatePitch) {
      pitchStep += 1;
      step = pitchStep;
    }
    beats.push({
      id: nextBeatId++,
      kind: spec.kind,
      sourceType: spec.sourceType,
      sourceId: spec.sourceId,
      chipsDelta: spec.chipsDelta,
      multDelta: spec.multDelta,
      xMult: spec.xMult,
      dollarsDelta: spec.dollarsDelta,
      chipsAfter: clampFinite(chips, 0),
      multAfter: clampFinite(mult, 0),
      message: spec.message,
      color: spec.color,
      sound: spec.sound,
      pitchStep: step,
      durationMs: spec.durationMs,
    });
  };

  const rand = (k: string) => nextRandom(state.rng, k);
  const randInt = (k: string, max: number) => nextRandomInt(state.rng, k, max);
  const isFace = (c: CardInstance) => isCardFace(c, state.jokers);
  const isSuit = (c: CardInstance, s: Suit) => isCardSuit(c, s, state.jokers);
  const probMultiplier = getProbabilityMultiplier(state.jokers);

  // ==========================================================================
  // STEP 1: Evaluate Hand, Reveal Secret Hand, Track Stats, Boss Blind Checks
  // ==========================================================================
  const handEval = evaluatePokerHand(playedCards, state.jokers);
  const hl = state.handLevels[handEval.handId];
  hl.visible = true;
  hl.played += 1;
  hl.playedThisRound += 1;

  state.tracking.handsPlayedThisRound += 1;
  state.tracking.handsPlayedTotal += 1;
  state.tracking.lastPlayedHandId = handEval.handId;
  state.stats.cardsPlayed += playedCards.length;
  updateMostPlayedHand(state);

  for (let i = 0; i < playedCards.length; i++) {
    playedCards[i].playedThisAnte = true;
  }

  chips = clampFinite(hl.chips, 5);
  mult = clampFinite(hl.mult, 1);

  pushBeat({
    kind: 'hand_announce',
    sourceType: 'system',
    message: `${handEval.displayName} Lv.${hl.level}`,
    color: PALETTE.WHITE,
    sound: 'card1',
    durationMs: 360,
  });

  // Include any pre-scoring boss beats (e.g., The Hook discarding 2 cards)
  for (let i = 0; i < preBeats.length; i++) {
    const pb = preBeats[i];
    pushBeat({
      kind: pb.kind,
      sourceType: pb.sourceType,
      sourceId: pb.sourceId,
      chipsDelta: pb.chipsDelta,
      multDelta: pb.multDelta,
      xMult: pb.xMult,
      dollarsDelta: pb.dollarsDelta,
      message: pb.message,
      color: pb.color,
      sound: pb.sound,
      durationMs: pb.durationMs,
    });
  }

  const activeBlind = getActiveBlind(state);
  const isBossActive = activeBlind.slot === 'Boss' && !activeBlind.disabled;
  let handDebuffed = false;

  if (isBossActive) {
    // Boss Blind debuff_hand checks
    if (activeBlind.key === 'bl_psychic' && playedCards.length < 5) {
      handDebuffed = true;
      activeBlind.triggered = true;
      chips = 0;
      mult = 0;
      pushBeat({
        kind: 'boss_debuff',
        sourceType: 'blind',
        sourceId: activeBlind.key,
        message: 'Must play 5 cards!',
        color: PALETTE.RED,
        sound: 'cancel',
        durationMs: 480,
      });
    } else if (
      activeBlind.key === 'bl_eye' &&
      state.tracking.playedHandTypesThisRound.includes(handEval.handId)
    ) {
      handDebuffed = true;
      activeBlind.triggered = true;
      chips = 0;
      mult = 0;
      pushBeat({
        kind: 'boss_debuff',
        sourceType: 'blind',
        sourceId: activeBlind.key,
        message: 'No repeat hand types!',
        color: PALETTE.RED,
        sound: 'cancel',
        durationMs: 480,
      });
    } else if (
      activeBlind.key === 'bl_mouth' &&
      state.tracking.firstHandTypeThisRound !== null &&
      state.tracking.firstHandTypeThisRound !== handEval.handId
    ) {
      handDebuffed = true;
      activeBlind.triggered = true;
      chips = 0;
      mult = 0;
      pushBeat({
        kind: 'boss_debuff',
        sourceType: 'blind',
        sourceId: activeBlind.key,
        message: 'Only 1 hand type allowed!',
        color: PALETTE.RED,
        sound: 'cancel',
        durationMs: 480,
      });
    }

    // Boss Blind modify_hand checks (only if hand was not debuffed)
    if (!handDebuffed) {
      if (activeBlind.key === 'bl_arm' && hl.level > 1) {
        hl.level -= 1;
        hl.chips = Math.max(1, hl.chips - hl.lChips);
        hl.mult = Math.max(1, hl.mult - hl.lMult);
        chips = hl.chips;
        mult = hl.mult;
        activeBlind.triggered = true;
        pushBeat({
          kind: 'boss_modify',
          sourceType: 'blind',
          sourceId: activeBlind.key,
          message: `The Arm: ${handEval.handId} Lv.${hl.level}`,
          color: PALETTE.RED,
          sound: 'cancel',
          durationMs: 420,
        });
      } else if (activeBlind.key === 'bl_flint') {
        chips = Math.max(1, Math.floor(chips * 0.5 + 0.5));
        mult = Math.max(1, Math.floor(mult * 0.5 + 0.5));
        activeBlind.triggered = true;
        pushBeat({
          kind: 'boss_modify',
          sourceType: 'blind',
          sourceId: activeBlind.key,
          message: 'Base Chips & Mult Halved!',
          color: PALETTE.ORANGE,
          sound: 'cancel',
          durationMs: 420,
        });
      } else if (activeBlind.key === 'bl_ox' && handEval.handId === state.tracking.oxMostPlayedHand) {
        const lost = state.dollars;
        state.dollars = 0;
        activeBlind.triggered = true;
        pushBeat({
          kind: 'boss_modify',
          sourceType: 'blind',
          sourceId: activeBlind.key,
          dollarsDelta: -lost,
          message: 'Money set to $0!',
          color: PALETTE.RED,
          sound: 'coin1',
          durationMs: 420,
        });
      } else if (activeBlind.key === 'bl_tooth') {
        const penalty = playedCards.length;
        state.dollars = safeNum(state.dollars - penalty, state.dollars);
        activeBlind.triggered = true;
        pushBeat({
          kind: 'boss_modify',
          sourceType: 'blind',
          sourceId: activeBlind.key,
          dollarsDelta: -penalty,
          message: `-$${penalty}`,
          color: PALETTE.RED,
          sound: 'coin1',
          durationMs: 380,
        });
      }
    }
  }

  if (!handDebuffed) {
    if (state.tracking.firstHandTypeThisRound === null) {
      state.tracking.firstHandTypeThisRound = handEval.handId;
    }
    if (!state.tracking.playedHandTypesThisRound.includes(handEval.handId)) {
      state.tracking.playedHandTypesThisRound.push(handEval.handId);
    }
  }

  const destroyedCardIds = new Set<string>();
  const destroyedCardsList: CardInstance[] = [];
  const destroyedJokerIds = new Set<string>();

  const applyJokerNumericEffects = (
    res: JokerEvalResult,
    sourceJoker: JokerInstance,
    stage: 'before' | 'individual_play' | 'individual_hand' | 'joker_main' | 'after'
  ): boolean => {
    let emitted = false;
    const cDelta = res.chips && Number.isFinite(res.chips) ? res.chips : 0;
    const mDelta = res.mult && Number.isFinite(res.mult) ? res.mult : 0;
    const xm = res.xMult && Number.isFinite(res.xMult) && res.xMult !== 1 ? res.xMult : 0;
    const dDelta = res.dollars && Number.isFinite(res.dollars) ? res.dollars : 0;

    if (cDelta !== 0) chips = clampFinite(chips + cDelta, chips);
    if (mDelta !== 0) mult = clampFinite(mult + mDelta, mult);
    if (xm !== 0) mult = clampFinite(mult * xm, mult);
    if (dDelta !== 0) state.dollars = safeNum(state.dollars + dDelta, state.dollars);

    if (res.addSellValue && Number.isFinite(res.addSellValue)) {
      sourceJoker.extraSellValue += res.addSellValue;
      recalcJokerSellValue(sourceJoker);
    }

    if (res.setCardEnhancement) {
      const targetCard = getCardById(state, res.setCardEnhancement.cardId);
      if (targetCard) {
        targetCard.enhancement = res.setCardEnhancement.enhancement;
        pushBeat({
          kind: 'card_modify',
          sourceType: 'card',
          sourceId: targetCard.id,
          message:
            res.setCardEnhancement.enhancement === 'none'
              ? 'Enhancement Removed'
              : `Enhanced (${res.setCardEnhancement.enhancement})`,
          color: PALETTE.PURPLE,
          sound: 'tarot1',
          durationMs: 260,
        });
      }
    }

    if (res.cloneCardId) {
      const src = getCardById(state, res.cloneCardId);
      if (src) {
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
          message: `Cloned ${src.rank} of ${src.suit}`,
          sound: 'card1',
          payload: { cardId: copy.id },
        });
        notifyJokersCardAdded(state, copy, events);
        pushBeat({
          kind: 'card_modify',
          sourceType: 'joker',
          sourceId: sourceJoker.id,
          message: res.message ?? 'Copied!',
          color: res.color ?? PALETTE.CHIPS,
          sound: res.sound ?? 'card1',
          durationMs: 300,
        });
        emitted = true;
      }
    }

    if (res.levelUpHand) {
      const targetHl = state.handLevels[res.levelUpHand];
      if (targetHl) {
        targetHl.level += 1;
        targetHl.chips += targetHl.lChips;
        targetHl.mult += targetHl.lMult;
        targetHl.visible = true;
        if (stage === 'before' && res.levelUpHand === handEval.handId) {
          chips = clampFinite(chips + targetHl.lChips, chips);
          mult = clampFinite(mult + targetHl.lMult, mult);
        }
        pushBeat({
          kind: 'joker_trigger',
          sourceType: 'joker',
          sourceId: sourceJoker.id,
          message: res.message ?? `Level Up! (${targetHl.level})`,
          color: res.color ?? PALETTE.GREEN,
          sound: res.sound ?? 'tarot1',
          escalatePitch: true,
          durationMs: 320,
        });
        emitted = true;
      }
    }

    if (res.destroyCardId && !destroyedCardIds.has(res.destroyCardId)) {
      const victim = getCardById(state, res.destroyCardId);
      if (victim) {
        destroyedCardIds.add(victim.id);
        destroyedCardsList.push(victim);
        pushBeat({
          kind: 'card_shatter',
          sourceType: 'card',
          sourceId: victim.id,
          message: 'Destroyed!',
          color: PALETTE.RED,
          sound: 'slice1',
          durationMs: 280,
        });
      }
    }

    if (res.createConsumable) {
      const ed = res.createConsumable.edition ?? 'none';
      if (ed === 'e_negative' || state.consumables.length < getEffectiveConsumableSlots(state)) {
        const key =
          res.createConsumable.key ??
          pickConsumableDefFromPool(state, res.createConsumable.set, `joker_cons_${sourceJoker.key}`)?.key;
        if (key) {
          state.consumables.push(createConsumableInstance(state, key, { edition: ed }));
        }
      }
    }

    if (res.createJoker) {
      const ed = res.createJoker.edition ?? 'none';
      if (ed === 'e_negative' || state.jokers.length < getEffectiveJokerSlots(state)) {
        const key =
          res.createJoker.key ??
          pickJokerDefFromPool(state, `joker_spawn_${sourceJoker.key}`, {
            forcedRarity: res.createJoker.rarity,
          })?.key;
        if (key) {
          state.jokers.push(createJokerInstance(state, key, { edition: ed }));
        }
      }
    }

    if (res.addStoneCard) {
      const stone = createCardInstance(state, 'Spades', '2', { enhancement: 'm_stone' });
      state.fullDeck.push(stone);
      state.drawPile.push(stone.id);
      notifyJokersCardAdded(state, stone, events);
    }

    if (res.destroySelf && !sourceJoker.eternal) {
      destroyedJokerIds.add(sourceJoker.id);
    }
    if (res.destroyJokerId) {
      const targetJ = state.jokers.find((j) => j.id === res.destroyJokerId);
      if (targetJ && !targetJ.eternal) destroyedJokerIds.add(targetJ.id);
    }

    const hasNumeric = cDelta !== 0 || mDelta !== 0 || xm !== 0 || dDelta !== 0;
    if (hasNumeric || (!emitted && res.message)) {
      const parts: string[] = [];
      if (cDelta !== 0) parts.push(`${cDelta > 0 ? '+' : ''}${cDelta} Chips`);
      if (mDelta !== 0) parts.push(`${mDelta > 0 ? '+' : ''}${mDelta} Mult`);
      if (xm !== 0) parts.push(`X${xm} Mult`);
      if (dDelta !== 0) parts.push(`${dDelta > 0 ? '+' : '-'}$${Math.abs(dDelta)}`);
      const defaultColor =
        xm !== 0 || mDelta !== 0
          ? PALETTE.MULT
          : cDelta !== 0
            ? PALETTE.CHIPS
            : dDelta !== 0
              ? PALETTE.GOLD
              : PALETTE.ORANGE;
      const defaultSound: SoundKey =
        xm !== 0
          ? 'multhit2'
          : mDelta !== 0
            ? 'multhit1'
            : cDelta !== 0
              ? 'chips1'
              : dDelta !== 0
                ? 'coin1'
                : 'generic1';

      pushBeat({
        kind: 'joker_trigger',
        sourceType: 'joker',
        sourceId: sourceJoker.id,
        chipsDelta: cDelta || undefined,
        multDelta: mDelta || undefined,
        xMult: xm || undefined,
        dollarsDelta: dDelta || undefined,
        message: res.message ?? parts.join(' '),
        color: res.color ?? defaultColor,
        sound: res.sound ?? defaultSound,
        escalatePitch: hasNumeric,
        durationMs: 290,
      });
      emitted = true;
    }

    return emitted;
  };

  const getHeldCards = (): CardInstance[] =>
    state.hand
      .map((id) => getCardById(state, id))
      .filter((c): c is CardInstance => c !== undefined && !destroyedCardIds.has(c.id));

  if (!handDebuffed) {
    // ========================================================================
    // STEP 2: `before` Joker Hooks Left-to-Right (cycle-safe Blueprint/Brainstorm)
    // ========================================================================
    const heldAtBefore = getHeldCards();
    for (let i = 0; i < state.jokers.length; i++) {
      const sourceJoker = state.jokers[i];
      if (destroyedJokerIds.has(sourceJoker.id)) continue;
      const resolved = resolveCopiedJoker(state.jokers, i);
      if (!resolved) continue;
      const res = evaluateJokerHook(resolved.target.key, {
        stage: 'before',
        state,
        joker: resolved.target,
        jokerIndex: resolved.targetIndex,
        isBlueprint: resolved.targetIndex !== i,
        blueprintSource: resolved.targetIndex !== i ? sourceJoker : undefined,
        handEval,
        fullHand: playedCards,
        scoringHand: handEval.scoringCards,
        heldCards: heldAtBefore,
        probMultiplier,
        rand,
        randInt,
        isFace,
        isSuit,
      });
      if (res) {
        applyJokerNumericEffects(res, sourceJoker, 'before');
      }
    }

    // ========================================================================
    // STEP 3: Scored Played Cards Left-to-Right
    // ========================================================================
    const heldForPlay = getHeldCards();
    for (let cIdx = 0; cIdx < handEval.scoringCards.length; cIdx++) {
      const card = handEval.scoringCards[cIdx];
      if (destroyedCardIds.has(card.id)) continue;

      if (card.debuffed) {
        pushBeat({
          kind: 'boss_debuff',
          sourceType: 'card',
          sourceId: card.id,
          message: 'Debuffed!',
          color: PALETTE.RED,
          sound: 'cancel',
          durationMs: 260,
        });
        continue;
      }

      // Compute total trigger count = 1 + Red Seal + repetition_play hooks
      let totalTriggers = 1 + (card.seal === 'Red' ? 1 : 0);
      for (let j = 0; j < state.jokers.length; j++) {
        const sourceJoker = state.jokers[j];
        if (destroyedJokerIds.has(sourceJoker.id)) continue;
        const resolved = resolveCopiedJoker(state.jokers, j);
        if (!resolved) continue;
        const rep = evaluateJokerHook(resolved.target.key, {
          stage: 'repetition_play',
          state,
          joker: resolved.target,
          jokerIndex: resolved.targetIndex,
          isBlueprint: resolved.targetIndex !== j,
          blueprintSource: resolved.targetIndex !== j ? sourceJoker : undefined,
          handEval,
          fullHand: playedCards,
          scoringHand: handEval.scoringCards,
          heldCards: heldForPlay,
          card,
          probMultiplier,
          rand,
          randInt,
          isFace,
          isSuit,
        });
        if (rep?.repetitions && rep.repetitions > 0) {
          totalTriggers += Math.floor(rep.repetitions);
        }
      }

      for (let t = 0; t < totalTriggers; t++) {
        if (t > 0) {
          pushBeat({
            kind: 'retrigger',
            sourceType: 'card',
            sourceId: card.id,
            message: 'Again!',
            color: PALETTE.ORANGE,
            sound: 'other1',
            durationMs: 200,
          });
        }

        // 3a. Base Rank Chips + permaBonus + Enhancement
        const isStone = card.enhancement === 'm_stone';
        let cardChips = (isStone ? 50 : RANK_CHIPS[card.rank]) + safeNum(card.permaBonus, 0);
        let cardMult = 0;
        let cardXMult = 1;
        let cardDollars = 0;

        if (card.enhancement === 'm_bonus') {
          cardChips += 30;
        } else if (card.enhancement === 'm_mult') {
          cardMult += 4;
        } else if (card.enhancement === 'm_glass') {
          cardXMult *= 2;
        } else if (card.enhancement === 'm_lucky') {
          if (rand('lucky_mult') < (1 * probMultiplier) / 5) {
            cardMult += 20;
          }
          if (rand('lucky_money') < (1 * probMultiplier) / 15) {
            cardDollars += 20;
          }
        }

        if (cardChips !== 0) {
          chips = clampFinite(chips + cardChips, chips);
          pushBeat({
            kind: 'card_score',
            sourceType: 'card',
            sourceId: card.id,
            chipsDelta: cardChips,
            message: `+${cardChips}`,
            color: PALETTE.CHIPS,
            sound: 'chips1',
            escalatePitch: true,
            durationMs: 260,
          });
        }

        if (cardMult !== 0) {
          mult = clampFinite(mult + cardMult, mult);
          pushBeat({
            kind: 'card_score',
            sourceType: 'card',
            sourceId: card.id,
            multDelta: cardMult,
            message: `+${cardMult} Mult`,
            color: PALETTE.MULT,
            sound: 'multhit1',
            escalatePitch: true,
            durationMs: 260,
          });
        }

        if (cardXMult !== 1) {
          mult = clampFinite(mult * cardXMult, mult);
          pushBeat({
            kind: 'card_score',
            sourceType: 'card',
            sourceId: card.id,
            xMult: cardXMult,
            message: `X${cardXMult} Mult`,
            color: PALETTE.MULT,
            sound: 'multhit2',
            escalatePitch: true,
            durationMs: 280,
          });
        }

        if (cardDollars !== 0) {
          state.dollars = safeNum(state.dollars + cardDollars, state.dollars);
          pushBeat({
            kind: 'card_score',
            sourceType: 'card',
            sourceId: card.id,
            dollarsDelta: cardDollars,
            message: `+$${cardDollars}`,
            color: PALETTE.GOLD,
            sound: 'coin1',
            escalatePitch: true,
            durationMs: 260,
          });
        }

        // 3b. Card Edition
        if (card.edition === 'e_foil') {
          chips = clampFinite(chips + 50, chips);
          pushBeat({
            kind: 'edition_trigger',
            sourceType: 'card',
            sourceId: card.id,
            chipsDelta: 50,
            message: '+50 Chips',
            color: PALETTE.CHIPS,
            sound: 'foil1',
            escalatePitch: true,
            durationMs: 240,
          });
        } else if (card.edition === 'e_holo') {
          mult = clampFinite(mult + 10, mult);
          pushBeat({
            kind: 'edition_trigger',
            sourceType: 'card',
            sourceId: card.id,
            multDelta: 10,
            message: '+10 Mult',
            color: PALETTE.MULT,
            sound: 'holo1',
            escalatePitch: true,
            durationMs: 240,
          });
        } else if (card.edition === 'e_polychrome') {
          mult = clampFinite(mult * 1.5, mult);
          pushBeat({
            kind: 'edition_trigger',
            sourceType: 'card',
            sourceId: card.id,
            xMult: 1.5,
            message: 'X1.5 Mult',
            color: PALETTE.MULT,
            sound: 'polychrome1',
            escalatePitch: true,
            durationMs: 260,
          });
        }

        // 3c. Gold Seal (+$3)
        if (card.seal === 'Gold') {
          state.dollars = safeNum(state.dollars + 3, state.dollars);
          pushBeat({
            kind: 'seal_trigger',
            sourceType: 'card',
            sourceId: card.id,
            dollarsDelta: 3,
            message: '+$3',
            color: PALETTE.GOLD,
            sound: 'gold_seal',
            escalatePitch: true,
            durationMs: 240,
          });
        }

        // 3d. individual_play Jokers Left-to-Right
        for (let j = 0; j < state.jokers.length; j++) {
          const sourceJoker = state.jokers[j];
          if (destroyedJokerIds.has(sourceJoker.id)) continue;
          const resolved = resolveCopiedJoker(state.jokers, j);
          if (!resolved) continue;
          const res = evaluateJokerHook(resolved.target.key, {
            stage: 'individual_play',
            state,
            joker: resolved.target,
            jokerIndex: resolved.targetIndex,
            isBlueprint: resolved.targetIndex !== j,
            blueprintSource: resolved.targetIndex !== j ? sourceJoker : undefined,
            handEval,
            fullHand: playedCards,
            scoringHand: handEval.scoringCards,
            heldCards: heldForPlay,
            card,
            probMultiplier,
            rand,
            randInt,
            isFace,
            isSuit,
          });
          if (res) {
            applyJokerNumericEffects(res, sourceJoker, 'individual_play');
          }
        }
      }
    }

    // ========================================================================
    // STEP 4: Held-in-Hand Cards Left-to-Right (non-debuffed)
    // ========================================================================
    const heldCards = getHeldCards();
    for (let hIdx = 0; hIdx < heldCards.length; hIdx++) {
      const card = heldCards[hIdx];
      if (card.debuffed) continue;

      let totalTriggers = 1 + (card.seal === 'Red' ? 1 : 0);
      for (let j = 0; j < state.jokers.length; j++) {
        const sourceJoker = state.jokers[j];
        if (destroyedJokerIds.has(sourceJoker.id)) continue;
        const resolved = resolveCopiedJoker(state.jokers, j);
        if (!resolved) continue;
        const rep = evaluateJokerHook(resolved.target.key, {
          stage: 'repetition_hand',
          state,
          joker: resolved.target,
          jokerIndex: resolved.targetIndex,
          isBlueprint: resolved.targetIndex !== j,
          blueprintSource: resolved.targetIndex !== j ? sourceJoker : undefined,
          handEval,
          fullHand: playedCards,
          scoringHand: handEval.scoringCards,
          heldCards,
          card,
          probMultiplier,
          rand,
          randInt,
          isFace,
          isSuit,
        });
        if (rep?.repetitions && rep.repetitions > 0) {
          totalTriggers += Math.floor(rep.repetitions);
        }
      }

      for (let t = 0; t < totalTriggers; t++) {
        let emittedRetriggerBanner = false;
        const ensureRetriggerBanner = () => {
          if (t > 0 && !emittedRetriggerBanner) {
            emittedRetriggerBanner = true;
            pushBeat({
              kind: 'retrigger',
              sourceType: 'held_card',
              sourceId: card.id,
              message: 'Again!',
              color: PALETTE.ORANGE,
              sound: 'other1',
              durationMs: 200,
            });
          }
        };

        // 4a. Steel Card (x1.5 Mult)
        if (card.enhancement === 'm_steel') {
          ensureRetriggerBanner();
          mult = clampFinite(mult * 1.5, mult);
          pushBeat({
            kind: 'card_held',
            sourceType: 'held_card',
            sourceId: card.id,
            xMult: 1.5,
            message: 'X1.5 Mult',
            color: PALETTE.MULT,
            sound: 'multhit2',
            escalatePitch: true,
            durationMs: 260,
          });
        }

        // 4b. individual_hand Jokers Left-to-Right (Baron, Shoot the Moon, Raised Fist, Reserved Parking...)
        for (let j = 0; j < state.jokers.length; j++) {
          const sourceJoker = state.jokers[j];
          if (destroyedJokerIds.has(sourceJoker.id)) continue;
          const resolved = resolveCopiedJoker(state.jokers, j);
          if (!resolved) continue;
          const res = evaluateJokerHook(resolved.target.key, {
            stage: 'individual_hand',
            state,
            joker: resolved.target,
            jokerIndex: resolved.targetIndex,
            isBlueprint: resolved.targetIndex !== j,
            blueprintSource: resolved.targetIndex !== j ? sourceJoker : undefined,
            handEval,
            fullHand: playedCards,
            scoringHand: handEval.scoringCards,
            heldCards,
            card,
            probMultiplier,
            rand,
            randInt,
            isFace,
            isSuit,
          });
          if (res) {
            ensureRetriggerBanner();
            applyJokerNumericEffects(res, sourceJoker, 'individual_hand');
          }
        }
      }
    }

    // ========================================================================
    // STEP 5: Jokers & Consumables Left-to-Right
    // ========================================================================
    for (let i = 0; i < state.jokers.length; i++) {
      const sourceJoker = state.jokers[i];
      if (sourceJoker.debuffed || destroyedJokerIds.has(sourceJoker.id)) continue;

      // 5a. Joker Foil / Holo Edition
      if (sourceJoker.edition === 'e_foil') {
        chips = clampFinite(chips + 50, chips);
        pushBeat({
          kind: 'edition_trigger',
          sourceType: 'joker',
          sourceId: sourceJoker.id,
          chipsDelta: 50,
          message: '+50 Chips',
          color: PALETTE.CHIPS,
          sound: 'foil1',
          escalatePitch: true,
          durationMs: 240,
        });
      } else if (sourceJoker.edition === 'e_holo') {
        mult = clampFinite(mult + 10, mult);
        pushBeat({
          kind: 'edition_trigger',
          sourceType: 'joker',
          sourceId: sourceJoker.id,
          multDelta: 10,
          message: '+10 Mult',
          color: PALETTE.MULT,
          sound: 'holo1',
          escalatePitch: true,
          durationMs: 240,
        });
      }

      // 5b. joker_main hook (with cycle-safe Blueprint/Brainstorm copying)
      const resolved = resolveCopiedJoker(state.jokers, i);
      if (resolved) {
        const res = evaluateJokerHook(resolved.target.key, {
          stage: 'joker_main',
          state,
          joker: resolved.target,
          jokerIndex: resolved.targetIndex,
          isBlueprint: resolved.targetIndex !== i,
          blueprintSource: resolved.targetIndex !== i ? sourceJoker : undefined,
          handEval,
          fullHand: playedCards,
          scoringHand: handEval.scoringCards,
          heldCards,
          probMultiplier,
          rand,
          randInt,
          isFace,
          isSuit,
        });
        if (res) {
          applyJokerNumericEffects(res, sourceJoker, 'joker_main');
        }
      }

      // 5c. Joker Polychrome Edition
      if (sourceJoker.edition === 'e_polychrome') {
        mult = clampFinite(mult * 1.5, mult);
        pushBeat({
          kind: 'edition_trigger',
          sourceType: 'joker',
          sourceId: sourceJoker.id,
          xMult: 1.5,
          message: 'X1.5 Mult',
          color: PALETTE.MULT,
          sound: 'polychrome1',
          escalatePitch: true,
          durationMs: 260,
        });
      }
    }

    // 5d. Observatory Voucher: held Planet cards matching played hand give x1.5 Mult
    if (state.vouchers.includes('v_observatory')) {
      for (let i = 0; i < state.consumables.length; i++) {
        const cons = state.consumables[i];
        if (cons.set !== 'Planet') continue;
        const cDef = CONSUMABLE_MAP[cons.key];
        if (cDef?.handType === handEval.handId) {
          mult = clampFinite(mult * 1.5, mult);
          pushBeat({
            kind: 'consumable_trigger',
            sourceType: 'consumable',
            sourceId: cons.id,
            xMult: 1.5,
            message: 'Observatory X1.5 Mult',
            color: PALETTE.MULT,
            sound: 'multhit2',
            escalatePitch: true,
            durationMs: 280,
          });
        }
      }
    }

    // ========================================================================
    // STEP 6: Plasma Deck Balance
    // ========================================================================
    const isPlasma = state.deckId === 'b_plasma' || Boolean(DECK_MAP[state.deckId]?.config.plasma);
    if (isPlasma) {
      const avg = Math.floor(clampFinite((chips + mult) / 2, 0));
      chips = avg;
      mult = avg;
      pushBeat({
        kind: 'plasma_balance',
        sourceType: 'deck',
        sourceId: state.deckId,
        message: 'Balanced!',
        color: PALETTE.PURPLE,
        sound: 'gong',
        durationMs: 460,
      });
    }
  }

  // ==========================================================================
  // STEP 7: Post-Hand (Glass Shatter, `after` Hooks, Total, Blind Clear / Mr. Bones)
  // ==========================================================================
  // 7a. Glass Card 1/4 * probMult shatter check
  if (!handDebuffed) {
    for (let i = 0; i < handEval.scoringCards.length; i++) {
      const card = handEval.scoringCards[i];
      if (card.debuffed || destroyedCardIds.has(card.id)) continue;
      if (card.enhancement === 'm_glass') {
        if (rand('glass') < (1 * probMultiplier) / 4) {
          destroyedCardIds.add(card.id);
          destroyedCardsList.push(card);
          pushBeat({
            kind: 'card_shatter',
            sourceType: 'card',
            sourceId: card.id,
            message: 'Shattered!',
            color: PALETTE.RED,
            sound: 'glass1',
            durationMs: 320,
          });
        }
      }
    }
  }

  // Remove any cards destroyed during scoring (before hooks / Glass shatter)
  if (destroyedCardIds.size > 0) {
    state.fullDeck = state.fullDeck.filter((c) => !destroyedCardIds.has(c.id));
    state.playArea = state.playArea.filter((id) => !destroyedCardIds.has(id));
    state.hand = state.hand.filter((id) => !destroyedCardIds.has(id));
    state.discardPile = state.discardPile.filter((id) => !destroyedCardIds.has(id));
    state.tracking.cardsDestroyedTotal += destroyedCardsList.length;
    for (let i = 0; i < destroyedCardsList.length; i++) {
      events.push({
        type: 'CARD_DESTROYED',
        message: `${destroyedCardsList[i].rank} of ${destroyedCardsList[i].suit} shattered!`,
        sound: 'glass1',
        payload: { cardId: destroyedCardsList[i].id },
      });
    }
    notifyJokersCardsDestroyed(state, destroyedCardsList, events);
  }

  // 7b. `after` Joker hooks left-to-right
  if (!handDebuffed) {
    const heldAfter = getHeldCards();
    for (let i = 0; i < state.jokers.length; i++) {
      const sourceJoker = state.jokers[i];
      if (sourceJoker.debuffed || destroyedJokerIds.has(sourceJoker.id)) continue;
      const res = evaluateJokerHook(sourceJoker.key, {
        stage: 'after',
        state,
        joker: sourceJoker,
        jokerIndex: i,
        handEval,
        fullHand: playedCards,
        scoringHand: handEval.scoringCards,
        heldCards: heldAfter,
        probMultiplier,
        rand,
        randInt,
        isFace,
        isSuit,
      });
      if (res) {
        applyJokerNumericEffects(res, sourceJoker, 'after');
      }
    }
  }

  // Remove any jokers destroyed during scoring
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
  }

  // 7c. Final hand score & round total
  chips = Math.max(0, clampFinite(chips, 0));
  mult = Math.max(0, clampFinite(mult, 0));
  const handScore = Math.max(0, Math.floor(clampFinite(chips * mult, 0)));

  state.currentHandChips = chips;
  state.currentHandMult = mult;
  state.lastHandScore = handScore;
  state.lastHandName = handEval.displayName;
  state.roundChips = clampFinite(state.roundChips + handScore, state.roundChips);
  if (handScore > state.stats.bestHand) {
    state.stats.bestHand = handScore;
  }

  pushBeat({
    kind: 'hand_total',
    sourceType: 'system',
    message: `${handScore.toLocaleString()}`,
    color: PALETTE.ORANGE,
    sound: 'chips2',
    durationMs: 480,
  });

  // 7d. Blind Cleared / Mr. Bones Rescue Check
  let blindCleared = state.roundChips >= state.targetChips;
  let savedByMrBones = false;

  if (blindCleared) {
    pushBeat({
      kind: 'blind_clear',
      sourceType: 'system',
      message: 'Blind Cleared!',
      color: PALETTE.GREEN,
      sound: 'win',
      durationMs: 560,
    });
  } else if (state.handsLeft <= 0) {
    // Check Mr. Bones rescue (non-debuffed, roundChips >= 25% of targetChips)
    for (let i = 0; i < state.jokers.length; i++) {
      const joker = state.jokers[i];
      if (joker.debuffed) continue;
      const hookRes = evaluateJokerHook(joker.key, {
        stage: 'end_of_round',
        state,
        joker,
        jokerIndex: i,
        probMultiplier,
        rand,
        randInt,
        isFace,
        isSuit,
      });
      const canSave =
        Boolean(hookRes?.saveRun) ||
        (joker.key === 'j_mr_bones' && state.roundChips >= state.targetChips * 0.25);
      if (canSave) {
        savedByMrBones = true;
        blindCleared = true;
        state.jokers.splice(i, 1);
        events.push({
          type: 'JOKER_DESTROYED',
          message: 'Saved by Mr. Bones!',
          sound: 'tarot1',
          payload: { jokerId: joker.id, key: joker.key },
        });
        pushBeat({
          kind: 'mr_bones_save',
          sourceType: 'joker',
          sourceId: joker.id,
          message: 'Saved by Mr. Bones!',
          color: PALETTE.GOLD,
          sound: 'tarot1',
          durationMs: 620,
        });
        pushBeat({
          kind: 'blind_clear',
          sourceType: 'system',
          message: 'Blind Cleared!',
          color: PALETTE.GREEN,
          sound: 'win',
          durationMs: 500,
        });
        break;
      }
    }
  }

  state.lastHandBeats = beats;
  state.scoringBeatIndex = 0;

  events.push({
    type: 'HAND_SCORED',
    message: `${handEval.displayName}: ${handScore}`,
    sound: 'chips2',
    payload: {
      handId: handEval.handId,
      displayName: handEval.displayName,
      chips,
      mult,
      handScore,
      roundChips: state.roundChips,
      blindCleared,
      savedByMrBones,
    },
  });

  return {
    beats,
    events,
    handScore,
    blindCleared,
    savedByMrBones,
  };
}
