// ============================================================================
// Krunked Cards — Score Choreographer (Visual Juice++)
// Steps sequentially through SimState ScoreBeat[] scaled by settings.gameSpeed,
// triggers Moveable.juiceUp() & radiant triggerGlow flashes, spawns crisp
// floating colored score pills, emits chromatic sparkle stars & particles,
// triggers explosive roaring scoreboard flame ignitions & XMult flame surges,
// fires pitch-escalating SFX, and triggers FINISH_SCORING cleanly.
// ============================================================================

import {
  PALETTE,
  type EditionId,
  type GameSpeed,
  type IAudioEngine,
  type ScoreBeat,
  type SimState,
  type SoundKey,
} from '../contracts/index.ts';
import type { CardSceneManager } from './Moveable.ts';
import type { ParticleFlameAnchors, ParticleSystem } from './ParticleSystem.ts';

export interface FloatingPopup {
  id: number;
  text: string;
  subtext?: string;
  x: number;
  y: number;
  vy: number;
  bgColor: string;
  textColor: string;
  age: number;
  lifetime: number;
  scale: number;
  rotation: number;
}

export interface ChoreographerDisplay {
  active: boolean;
  displayChips: number;
  displayMult: number;
  displayHandScore: number | null;
  handName: string | null;
  flameIntensity: number;
  popups: readonly FloatingPopup[];
  activeSourceId: string | null;
  chipsPulse: number;
  multPulse: number;
  // Optional impact & choreography telemetry (backwards-compatible)
  fastForward?: boolean;
  progressRatio?: number;
  screenFlash?: number;
  screenFlashColor?: [number, number, number];
  shakeX?: number;
  shakeY?: number;
  flameFlare?: number;
}

const FAST_FORWARD_MULTIPLIER = 2.6;
const MAX_EFFECTIVE_SPEED = 8.5;

export class ScoreChoreographer {
  private beats: ScoreBeat[] = [];
  private beatIndex = -1;
  private beatTimerMs = 0;
  private active = false;
  private finishedCallback: (() => void) | null = null;

  private fastForward = false;
  private fastForwardMul = 1;

  private displayChips = 0;
  private displayMult = 0;
  private targetChipsVal = 0;
  private targetMultVal = 0;
  private displayHandScore: number | null = null;
  private handName: string | null = null;
  private activeSourceId: string | null = null;

  private flameIntensity = 0;
  private targetFlameIntensity = 0;
  private flameFlare = 0;
  private flameIgnitedThisHand = false;
  private lastFlameAnchor: ParticleFlameAnchors | null = null;
  private chipsPulse = 0;
  private multPulse = 0;

  // Impact flash (flash.fs) & micro-shake impulses
  private screenFlash = 0;
  private screenFlashColor: [number, number, number] = [1, 1, 1];
  private shakeMag = 0;
  private shakePhase = 0;
  private shakeX = 0;
  private shakeY = 0;
  private reducedMotion = false;

  // Cached viewport dimensions for mobile-safe popup clamping & compact staggering
  private lastViewportW = 1280;
  private lastViewportH = 720;

  private particles: ParticleSystem | null = null;
  private onGlitchImpulse: ((intensity: number) => void) | null = null;

  private popups: FloatingPopup[] = [];
  private nextPopupId = 1;
  private lastPlayedBeatKey = '';

  setParticleSystem(particles: ParticleSystem | null): void {
    this.particles = particles;
  }

  setGlitchCallback(cb: ((intensity: number) => void) | null): void {
    this.onGlitchImpulse = cb;
  }

  setFlameAnchor(anchor: ParticleFlameAnchors | null): void {
    this.lastFlameAnchor = anchor;
  }

  setFastForward(active: boolean): void {
    this.fastForward = Boolean(active);
  }

  isFastForwarding(): boolean {
    return this.fastForward;
  }

  triggerImpactFlash(
    amount: number,
    color: [number, number, number] = [1, 1, 1],
    shake = 0
  ): void {
    if (this.reducedMotion) return;
    this.screenFlash = Math.min(1, Math.max(this.screenFlash, amount));
    this.screenFlashColor = color;
    if (shake > 0) {
      this.shakeMag = Math.min(12, Math.max(this.shakeMag, shake));
    }
  }

  /**
   * Celebratory hand level-up burst: cyan/purple sparkle stars,
   * crisp `LEVEL UP!` popup (clamped mobile-safe), and optional shimmer SFX.
   */
  triggerLevelUpCelebration(
    x: number,
    y: number,
    handLabel: string,
    audio?: IAudioEngine
  ): void {
    const pos = this.clampPopupPos(x, y);
    const compact = this.isCompactViewport();

    this.particles?.emitStarBurst(pos.x, pos.y, '#4ce6ff', 1.35);
    this.particles?.emitHoloSparkle(pos.x, pos.y, 'e_holo', 1.25);
    this.particles?.emitAccentBurst(pos.x, pos.y, 'purple');
    this.triggerImpactFlash(0.28, [0.46, 0.86, 1.0], 2.5);

    const cleanLabel = typeof handLabel === 'string' ? handLabel.trim() : '';
    this.spawnPopup('LEVEL UP!', pos.x, pos.y, PALETTE.PURPLE, '#ffffff', 1.25, {
      subtext: cleanLabel || undefined,
      scale: compact ? 0.92 : 1.08,
      vy: compact ? -28 : -38,
    });
    if (cleanLabel) {
      const subOffsetY = compact ? 22 : 28;
      this.spawnPopup(cleanLabel, pos.x, pos.y + subOffsetY, PALETTE.CHIPS, '#ffffff', 1.15, {
        scale: compact ? 0.8 : 0.92,
        vy: compact ? -24 : -32,
      });
    }

    if (audio) {
      audio.playSfx('polychrome1', { pitch: 1.06, volume: 0.85 });
      audio.playSfx('tarot1', { pitch: 1.14, volume: 0.72 });
    }
  }

  /**
   * Celebratory round-clear / victory starburst with golden flash.
   */
  triggerRoundClearBurst(x: number, y: number): void {
    const pos = this.clampPopupPos(x, y);
    this.particles?.triggerRoundClearBurst(pos.x, pos.y);
    this.triggerImpactFlash(0.36, [1.0, 0.92, 0.54], 3.8);
  }

  isActive(): boolean {
    return this.active;
  }

  getFlameIntensity(): number {
    return Math.min(10, this.flameIntensity + this.flameFlare);
  }

  getDisplay(): ChoreographerDisplay {
    const progressRatio =
      this.active && this.beats.length > 0
        ? Math.min(1, Math.max(0, (this.beatIndex + 1) / this.beats.length))
        : 0;
    const effectiveFlame = Math.min(10, this.flameIntensity + this.flameFlare);
    return {
      active: this.active,
      displayChips: Math.round(this.displayChips),
      displayMult: Math.round(this.displayMult * 100) / 100,
      displayHandScore: this.displayHandScore,
      handName: this.handName,
      flameIntensity: effectiveFlame,
      popups: this.popups,
      activeSourceId: this.activeSourceId,
      chipsPulse: this.chipsPulse,
      multPulse: this.multPulse,
      fastForward: this.fastForward,
      progressRatio,
      screenFlash: this.screenFlash,
      screenFlashColor: this.screenFlashColor,
      shakeX: this.shakeX,
      shakeY: this.shakeY,
      flameFlare: this.flameFlare,
    };
  }

  start(
    state: SimState,
    beats: ScoreBeat[],
    scene: CardSceneManager,
    audio: IAudioEngine,
    onComplete: () => void
  ): void {
    const geom = scene.getGeometry();
    this.syncViewport(geom.viewportW, geom.viewportH);

    const key = `${state.tick}:${state.round}:${state.handsLeft}:${beats.length}`;
    if (this.active && this.lastPlayedBeatKey === key) return;
    this.lastPlayedBeatKey = key;

    this.beats = beats.slice();
    this.beatIndex = -1;
    this.beatTimerMs = 0;
    this.active = true;
    this.finishedCallback = onComplete;
    this.handName = state.lastHandName;
    this.displayHandScore = null;
    this.activeSourceId = null;
    this.flameIgnitedThisHand = false;
    this.flameFlare = 0;

    const first = beats[0];
    this.displayChips = first ? first.chipsAfter : state.currentHandChips;
    this.displayMult = first ? first.multAfter : state.currentHandMult;
    this.targetChipsVal = this.displayChips;
    this.targetMultVal = this.displayMult;

    if (this.beats.length === 0) {
      this.completeNow();
      return;
    }

    // Trigger first beat immediately for snappy zero-latency feedback
    this.advanceBeat(state, scene, audio);
  }

  /**
   * Soft transition when leaving SCORING into CASHOUT / PLAYING: lets roaring
   * flames fade out gracefully over ~0.45s instead of snapping off abruptly.
   */
  endScoringSoft(): void {
    this.beats = [];
    this.beatIndex = -1;
    this.beatTimerMs = 0;
    this.active = false;
    this.fastForward = false;
    this.fastForwardMul = 1;
    this.finishedCallback = null;
    this.activeSourceId = null;
    this.targetFlameIntensity = 0;
    this.lastPlayedBeatKey = '';
  }

  reset(): void {
    this.beats = [];
    this.beatIndex = -1;
    this.beatTimerMs = 0;
    this.active = false;
    this.fastForward = false;
    this.fastForwardMul = 1;
    this.finishedCallback = null;
    this.displayHandScore = null;
    this.activeSourceId = null;
    this.flameIntensity = 0;
    this.targetFlameIntensity = 0;
    this.flameFlare = 0;
    this.flameIgnitedThisHand = false;
    this.screenFlash = 0;
    this.shakeMag = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.popups = [];
    this.lastPlayedBeatKey = '';
  }

  spawnPopup(
    text: string,
    x: number,
    y: number,
    bgColor: string,
    textColor = '#ffffff',
    lifetime = 0.85,
    opts?: { subtext?: string; scale?: number; vy?: number }
  ): void {
    const compact = this.isCompactViewport();
    const pos = this.clampPopupPos(x, y);
    const maxPopups = compact ? 14 : 24;
    this.popups.push({
      id: this.nextPopupId++,
      text,
      subtext: opts?.subtext,
      x: pos.x,
      y: pos.y,
      vy: opts?.vy ?? (compact ? -30 : -44),
      bgColor,
      textColor,
      age: 0,
      lifetime,
      scale: opts?.scale ?? (compact ? 0.84 : 1),
      rotation: (Math.random() - 0.5) * (compact ? 0.08 : 0.14),
    });
    while (this.popups.length > maxPopups) {
      this.popups.shift();
    }
  }

  update(
    dt: number,
    state: SimState,
    gameSpeed: GameSpeed,
    scene: CardSceneManager,
    audio: IAudioEngine,
    reducedMotion = false
  ): void {
    this.reducedMotion = reducedMotion;
    const safeDt = Math.min(0.05, Math.max(0.001, dt));
    const geom = scene.getGeometry();
    this.syncViewport(geom.viewportW, geom.viewportH);

    // Smooth hold-to-accelerate ramp (1.0x <-> 2.6x)
    const targetFfMul = this.fastForward ? FAST_FORWARD_MULTIPLIER : 1;
    const ffLerp = 1 - Math.exp(-16 * safeDt);
    this.fastForwardMul += (targetFfMul - this.fastForwardMul) * ffLerp;
    if (Math.abs(targetFfMul - this.fastForwardMul) < 0.01) {
      this.fastForwardMul = targetFfMul;
    }

    // Smooth numeric easing for display counters (tracks faster during fast-forward)
    const kNum = 1 - Math.exp(-18 * Math.min(FAST_FORWARD_MULTIPLIER, this.fastForwardMul) * safeDt);
    this.displayChips += (this.targetChipsVal - this.displayChips) * kNum;
    this.displayMult += (this.targetMultVal - this.displayMult) * kNum;
    if (Math.abs(this.targetChipsVal - this.displayChips) < 0.35) {
      this.displayChips = this.targetChipsVal;
    }
    if (Math.abs(this.targetMultVal - this.displayMult) < 0.005) {
      this.displayMult = this.targetMultVal;
    }
    this.chipsPulse = Math.max(0, this.chipsPulse - safeDt * 3.6);
    this.multPulse = Math.max(0, this.multPulse - safeDt * 3.6);

    // Decay impact flash, flame surge flare & damped micro-shake
    this.screenFlash = Math.max(0, this.screenFlash - safeDt * 3.4);
    this.flameFlare *= Math.exp(-4.0 * safeDt);
    if (this.flameFlare < 0.02) this.flameFlare = 0;

    if (this.shakeMag > 0.05 && !reducedMotion) {
      this.shakePhase += safeDt * 62;
      this.shakeX = Math.sin(this.shakePhase) * this.shakeMag;
      this.shakeY = Math.cos(this.shakePhase * 1.37) * this.shakeMag * 0.72;
      this.shakeMag *= Math.exp(-13.5 * safeDt);
    } else {
      this.shakeMag = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }

    // Update roaring flame intensity whenever hand beats target (or finishes off blind!)
    // Note: SimEngine adds state.lastHandScore into state.roundChips synchronously at PLAY_HAND,
    // so compute preHandRoundChips to prevent false flame ignition on beat 0 before cards score!
    const earned = this.active
      ? Math.floor(this.targetChipsVal * this.targetMultVal)
      : state.currentHandChips * state.currentHandMult;
    const req = state.targetChips;
    const preHandRoundChips = this.active
      ? Math.max(0, state.roundChips - (state.lastHandScore || 0))
      : state.roundChips;
    const inScoring = this.active || state.phase === 'SCORING';

    if (inScoring && req > 0 && earned >= req) {
      // Dramatic log5 intensity curve: 1x target immediately blazes (~3.0),
      // 3x+ roars high (~5.5), 10x+ turns into a towering solar/plasma inferno (8..10)!
      const ratio = earned / Math.max(1, req);
      this.targetFlameIntensity = Math.min(
        10,
        Math.max(2.6, 1.9 + (Math.log(1 + ratio * 5) / Math.log(5)) * 2.45)
      );
      if (!this.flameIgnitedThisHand) {
        this.flameIgnitedThisHand = true;
        this.triggerFlameIgnitionJuice(this.targetFlameIntensity);
      }
    } else if (
      inScoring &&
      req > 0 &&
      preHandRoundChips > 0 &&
      preHandRoundChips + earned >= req
    ) {
      // Finishing hand that defeats the blind: victorious warm roar!
      const over = (preHandRoundChips + earned - req) / Math.max(1, req);
      this.targetFlameIntensity = Math.min(4.2, 2.0 + Math.min(2.2, over * 2.0));
      if (!this.flameIgnitedThisHand) {
        this.flameIgnitedThisHand = true;
        this.triggerFlameIgnitionJuice(this.targetFlameIntensity);
      }
    } else {
      this.targetFlameIntensity = 0;
    }

    // Fast explosive rise on ignition, smooth cinematic cool-down on fadeout
    const flameRate = this.targetFlameIntensity > this.flameIntensity ? 11.5 : 3.8;
    const flameLerp = 1 - Math.exp(-flameRate * safeDt);
    this.flameIntensity += (this.targetFlameIntensity - this.flameIntensity) * flameLerp;
    if (this.flameIntensity < 0.02 && this.targetFlameIntensity === 0) {
      this.flameIntensity = 0;
    }
    const effectiveFlame = Math.min(10, this.flameIntensity + this.flameFlare);
    audio.setFireIntensity(Math.min(1, effectiveFlame / 5.2));

    // Step floating popups & enforce mobile-safe viewport clamping continuously
    const effectiveSpeed = Math.min(MAX_EFFECTIVE_SPEED, Math.max(0.25, gameSpeed) * this.fastForwardMul);
    const popupAgeScale = Math.max(1, effectiveSpeed * 0.6);
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i]!;
      p.age += safeDt * popupAgeScale;
      p.y += p.vy * safeDt;
      p.vy *= Math.exp(-3.2 * safeDt);
      const clamped = this.clampPopupPos(p.x, p.y, geom.viewportW, geom.viewportH);
      p.x = clamped.x;
      p.y = clamped.y;
      if (p.age >= p.lifetime) {
        this.popups.splice(i, 1);
      }
    }

    // Advance beat queue if scoring is active (capped so every beat fires cleanly)
    if (!this.active) return;

    this.beatTimerMs -= safeDt * 1000 * effectiveSpeed;
    if (this.beatTimerMs <= 0) {
      this.advanceBeat(state, scene, audio);
    }
  }

  private triggerFlameIgnitionJuice(intensity: number): void {
    this.flameFlare = Math.min(3.0, Math.max(this.flameFlare, 1.8 + intensity * 0.16));
    this.chipsPulse = Math.max(this.chipsPulse, 1.25);
    this.multPulse = Math.max(this.multPulse, 1.25);
    this.triggerImpactFlash(
      Math.min(0.42, 0.22 + intensity * 0.025),
      [1.0, 0.56, 0.20],
      Math.min(6.5, 3.0 + intensity * 0.45)
    );
    if (this.lastFlameAnchor) {
      this.particles?.emitFlameIgnitionBurst(
        this.lastFlameAnchor.chipsRect,
        this.lastFlameAnchor.multRect,
        intensity
      );
    }
  }

  private syncViewport(viewportW: number, viewportH: number): void {
    if (Number.isFinite(viewportW) && viewportW > 0) this.lastViewportW = viewportW;
    if (Number.isFinite(viewportH) && viewportH > 0) this.lastViewportH = viewportH;
  }

  private isCompactViewport(vw = this.lastViewportW, vh = this.lastViewportH): boolean {
    return vw < 760 || vh < 480;
  }

  private clampPopupPos(
    x: number,
    y: number,
    vw = this.lastViewportW,
    vh = this.lastViewportH
  ): { x: number; y: number } {
    const safeW = Number.isFinite(vw) && vw > 0 ? vw : 1280;
    const safeH = Number.isFinite(vh) && vh > 0 ? vh : 720;
    const minX = 48;
    const maxX = Math.max(96, safeW - 48);
    const minY = 26;
    const maxY = Math.max(64, safeH - 36);
    return {
      x: Math.min(maxX, Math.max(minX, Number.isFinite(x) ? x : minX)),
      y: Math.min(maxY, Math.max(minY, Number.isFinite(y) ? y : minY)),
    };
  }

  private advanceBeat(
    state: SimState,
    scene: CardSceneManager,
    audio: IAudioEngine
  ): void {
    this.beatIndex++;
    if (this.beatIndex >= this.beats.length) {
      this.completeNow();
      return;
    }

    const beat = this.beats[this.beatIndex]!;
    this.beatTimerMs = Math.max(110, beat.durationMs || 280);
    this.targetChipsVal = beat.chipsAfter;
    this.targetMultVal = beat.multAfter;
    this.activeSourceId = beat.sourceId ?? null;

    if (beat.chipsDelta && beat.chipsDelta !== 0) {
      this.chipsPulse = beat.chipsDelta >= 50 ? 1.25 : 1.0;
    }
    if ((beat.multDelta && beat.multDelta !== 0) || (beat.xMult && beat.xMult !== 1)) {
      this.multPulse = beat.xMult && beat.xMult >= 2 ? 1.35 : 1.05;
    }

    if (beat.kind === 'hand_total' || beat.kind === 'blind_clear') {
      this.displayHandScore = Math.floor(beat.chipsAfter * beat.multAfter);
    }

    // Check immediate flame ignition / surge right on the beat so flames erupt on-beat!
    const beatEarned = Math.floor(beat.chipsAfter * beat.multAfter);
    const req = state.targetChips;
    const preHandRoundChips = Math.max(0, state.roundChips - (state.lastHandScore || 0));
    const beatsTarget =
      req > 0 &&
      (beatEarned >= req || (preHandRoundChips > 0 && preHandRoundChips + beatEarned >= req));
    if (beatsTarget) {
      if (!this.flameIgnitedThisHand) {
        this.flameIgnitedThisHand = true;
        const ratio = beatEarned / Math.max(1, req);
        const estInt = beatEarned >= req
          ? Math.min(10, Math.max(2.6, 1.9 + (Math.log(1 + ratio * 5) / Math.log(5)) * 2.45))
          : 2.2;
        this.triggerFlameIgnitionJuice(estInt);
      } else if (beat.xMult && beat.xMult >= 1.5) {
        // Every XMult hit while on fire sends a dramatic surge up the flames!
        this.flameFlare = Math.min(3.2, this.flameFlare + Math.min(2.0, 0.7 + beat.xMult * 0.32));
        if (this.lastFlameAnchor) {
          this.particles?.emitFlameIgnitionBurst(
            this.lastFlameAnchor.chipsRect,
            this.lastFlameAnchor.multRect,
            Math.min(10, this.flameIntensity + this.flameFlare)
          );
        }
      }
    }

    // Juice the source card / joker / consumable + radiant trigger glow flash
    const nowSec = performance.now() / 1000;
    const geom = scene.getGeometry();
    this.syncViewport(geom.viewportW, geom.viewportH);
    const compact = this.isCompactViewport(geom.viewportW, geom.viewportH);
    const topRowThreshold = compact ? Math.min(135, geom.viewportH * 0.34) : 185;

    let emitX = geom.playArea.x + geom.playArea.w * 0.5;
    let emitY = geom.playArea.y + geom.playArea.h * 0.46;
    let popupX = emitX;
    let popupY = geom.playArea.y + geom.playArea.h * 0.36;
    let spawnBelow = false;
    let sourceEdition: EditionId = 'none';

    if (beat.sourceId) {
      const vc = scene.getVisualCardById(beat.sourceId);
      if (vc) {
        sourceEdition = vc.edition;
        const juiceAmt =
          beat.kind === 'retrigger'
            ? 0.56
            : beat.xMult && beat.xMult >= 2
              ? 0.58
              : beat.kind === 'edition_trigger'
                ? 0.52
                : 0.44;
        vc.moveable.juiceUp(juiceAmt, undefined, nowSec);
        vc.moveable.flashTrigger(beat.xMult && beat.xMult >= 2 ? 1.0 : 0.85);
        if (beat.kind === 'card_shatter') {
          vc.moveable.dissolve = 0.85;
        }
        emitX = vc.moveable.vx;
        emitY = vc.moveable.vy;
        popupX = vc.moveable.vx;
        // For top-row Jokers/Consumables, spawn popups slightly below card center so they never clip y < 26
        if (vc.moveable.vy < topRowThreshold) {
          spawnBelow = true;
          popupY = vc.moveable.vy + vc.moveable.vh * (compact ? 0.28 : 0.36);
        } else {
          popupY = vc.moveable.vy - vc.moveable.vh * (compact ? 0.36 : 0.48);
        }
      }
    } else if (popupY < topRowThreshold) {
      spawnBelow = true;
    }

    // Stagger overlapping popups cleanly with compact mobile spacing
    const overlapDx = compact ? 44 : 56;
    const overlapDy = compact ? 24 : 34;
    let overlaps = 0;
    for (const existing of this.popups) {
      if (Math.abs(existing.x - popupX) < overlapDx && Math.abs(existing.y - popupY) < overlapDy) {
        overlaps++;
      }
    }
    if (overlaps > 0) {
      const stepY = compact ? 20 : 28;
      const stepX = compact ? 14 : 18;
      const clampedStep = Math.min(overlaps, 3);
      popupY += (spawnBelow ? stepY : -stepY) * clampedStep;
      popupX += (overlaps % 2 === 1 ? 1 : -1) * stepX * Math.min(Math.ceil(overlaps / 2), 2);
    }

    const clampedPopup = this.clampPopupPos(popupX, popupY, geom.viewportW, geom.viewportH);
    popupX = clampedPopup.x;
    popupY = clampedPopup.y;

    // Emit crisp pixel particles, chromatic holo sparkles & impact flash / micro-shake
    if (beat.kind === 'card_shatter') {
      this.particles?.emitGlassShatter(emitX, emitY);
      this.triggerImpactFlash(0.48, [0.76, 0.96, 1.0], 7.0);
      this.onGlitchImpulse?.(0.68);
    } else if (beat.kind === 'boss_debuff' || beat.kind === 'boss_modify') {
      this.particles?.emitMultBurst(emitX, emitY, false, 1.15);
      this.triggerImpactFlash(0.36, [0.95, 0.25, 0.28], 5.2);
      this.onGlitchImpulse?.(0.55);
    } else if (beat.kind === 'retrigger') {
      this.particles?.emitAccentBurst(emitX, emitY, 'orange');
      this.particles?.emitStarBurst(emitX, emitY, PALETTE.ORANGE, 0.85);
    } else if (beat.kind === 'plasma_balance') {
      this.particles?.emitAccentBurst(emitX, emitY, 'purple');
      this.particles?.emitHoloSparkle(emitX, emitY, 'e_holo', 1.3);
      this.triggerImpactFlash(0.36, [0.72, 0.55, 1.0], 4.0);
    } else if (beat.kind === 'blind_clear') {
      this.triggerRoundClearBurst(emitX, emitY);
    } else if (beat.kind === 'mr_bones_save') {
      this.particles?.emitStarBurst(emitX, emitY, PALETTE.GOLD, 1.4);
      this.triggerImpactFlash(0.38, [1.0, 0.88, 0.48], 3.8);
    } else if (beat.kind === 'edition_trigger') {
      const edTheme: EditionId =
        sourceEdition !== 'none'
          ? sourceEdition
          : beat.xMult
            ? 'e_polychrome'
            : beat.multDelta
              ? 'e_holo'
              : 'e_foil';
      this.particles?.emitHoloSparkle(emitX, emitY, edTheme, beat.xMult ? 1.6 : 1.25);
      if (beat.xMult && beat.xMult !== 1) {
        this.particles?.emitMultBurst(emitX, emitY, true, 1.4);
        this.triggerImpactFlash(0.30, [0.95, 0.56, 1.0], 4.2);
      } else if (beat.multDelta && beat.multDelta !== 0) {
        this.particles?.emitMultBurst(emitX, emitY, false, 1.2);
        this.triggerImpactFlash(0.22, [0.98, 0.42, 0.86], 2.6);
      } else if (beat.chipsDelta && beat.chipsDelta !== 0) {
        this.particles?.emitChipsBurst(emitX, emitY, 1.4);
        this.triggerImpactFlash(0.20, [0.46, 0.84, 1.0], 2.4);
      }
    } else {
      if (beat.xMult && beat.xMult !== 1) {
        const multWeight = Math.min(2.8, Math.max(1.1, beat.xMult * 0.72));
        this.particles?.emitMultBurst(emitX, emitY, true, multWeight);
        if (beat.xMult >= 1.5) {
          this.particles?.emitStarBurst(
            emitX,
            emitY,
            beat.xMult >= 3 ? '#ffd859' : PALETTE.MULT,
            Math.min(1.85, 0.85 + beat.xMult * 0.24)
          );
          if (sourceEdition !== 'none') {
            this.particles?.emitHoloSparkle(emitX, emitY, sourceEdition, 1.2);
          }
          this.triggerImpactFlash(
            Math.min(0.50, 0.20 + beat.xMult * 0.085),
            beat.xMult >= 3 ? [1.0, 0.78, 0.32] : [1.0, 0.42, 0.34],
            Math.min(8.0, 2.8 + beat.xMult * 1.2)
          );
        }
      } else if (beat.multDelta && beat.multDelta !== 0) {
        this.particles?.emitMultBurst(emitX, emitY, false, beat.multDelta >= 15 ? 1.4 : 1);
      }
      if (beat.chipsDelta && beat.chipsDelta !== 0) {
        this.particles?.emitChipsBurst(emitX, emitY, beat.chipsDelta >= 30 ? 1.6 : 1);
      }
      if (beat.dollarsDelta && beat.dollarsDelta > 0) {
        this.particles?.emitMoneyBurst(emitX, emitY, Math.min(2.2, 0.9 + beat.dollarsDelta * 0.16));
      }
      if (beat.kind === 'seal_trigger') {
        this.particles?.emitHoloSparkle(emitX, emitY, 'gold', 1.15);
      }
    }

    // Spawn crisp colored floating pill matching the beat deltas / message
    const pill = formatBeatPill(beat);
    if (pill) {
      this.spawnPopup(pill.text, popupX, popupY, pill.bgColor, '#ffffff', compact ? 0.82 : 0.92);
    }

    // Play pitch-escalating SFX (`pitch = 0.3 + 0.08 * pitchStep`)
    const soundKey = pickBeatSound(beat);
    if (soundKey) {
      const step = beat.pitchStep ?? Math.min(18, this.beatIndex + 5);
      const pitch = Math.max(0.35, Math.min(2.4, 0.3 + 0.08 * step));
      audio.playSfx(soundKey, { pitch, volume: this.fastForward ? 0.84 : 0.95 });
    }
  }

  private completeNow(): void {
    this.active = false;
    this.activeSourceId = null;
    const cb = this.finishedCallback;
    this.finishedCallback = null;
    if (cb) cb();
  }
}

function formatBeatPill(beat: ScoreBeat): { text: string; bgColor: string } | null {
  if (beat.kind === 'card_shatter') {
    return { text: beat.message || 'SHATTERED!', bgColor: PALETTE.RED };
  }
  if (beat.kind === 'retrigger') {
    return { text: beat.message || 'Again!', bgColor: PALETTE.ORANGE };
  }
  if (beat.kind === 'plasma_balance') {
    return { text: beat.message || 'Balanced!', bgColor: PALETTE.PURPLE };
  }
  if (beat.kind === 'mr_bones_save') {
    return { text: beat.message || 'SAVED BY MR. BONES!', bgColor: PALETTE.GOLD };
  }
  if (beat.kind === 'boss_debuff') {
    return { text: beat.message || 'Debuffed!', bgColor: PALETTE.RED };
  }
  if (beat.xMult && beat.xMult !== 1) {
    return { text: `X${roundShort(beat.xMult)} Mult`, bgColor: PALETTE.MULT };
  }
  if (beat.multDelta && beat.multDelta !== 0) {
    const sign = beat.multDelta > 0 ? '+' : '';
    return { text: `${sign}${roundShort(beat.multDelta)} Mult`, bgColor: PALETTE.MULT };
  }
  if (beat.chipsDelta && beat.chipsDelta !== 0) {
    const sign = beat.chipsDelta > 0 ? '+' : '';
    return { text: `${sign}${roundShort(beat.chipsDelta)}`, bgColor: PALETTE.CHIPS };
  }
  if (beat.dollarsDelta && beat.dollarsDelta !== 0) {
    const sign = beat.dollarsDelta > 0 ? '+$' : '-$';
    return { text: `${sign}${Math.abs(beat.dollarsDelta)}`, bgColor: PALETTE.MONEY };
  }
  if (beat.message && beat.kind !== 'hand_announce') {
    return { text: beat.message, bgColor: beat.color || PALETTE.ORANGE };
  }
  return null;
}

function pickBeatSound(beat: ScoreBeat): SoundKey | null {
  if (beat.sound) return beat.sound;
  switch (beat.kind) {
    case 'card_score':
      return beat.xMult ? 'multhit2' : beat.multDelta ? 'multhit1' : 'chips1';
    case 'card_held':
      return beat.xMult ? 'multhit2' : beat.dollarsDelta ? 'coin1' : 'multhit1';
    case 'joker_trigger':
      return beat.xMult ? 'multhit2' : beat.multDelta ? 'multhit1' : beat.dollarsDelta ? 'coin2' : 'chips1';
    case 'edition_trigger':
      return beat.xMult ? 'polychrome1' : beat.multDelta ? 'holo1' : 'foil1';
    case 'seal_trigger':
      return beat.dollarsDelta ? 'gold_seal' : 'chips2';
    case 'retrigger':
      return 'card1';
    case 'card_shatter':
      return 'glass1';
    case 'plasma_balance':
      return 'gong';
    case 'hand_total':
      return 'chips2';
    case 'blind_clear':
      return 'win';
    case 'boss_debuff':
      return 'cancel';
    default:
      return null;
  }
}

function roundShort(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
}
