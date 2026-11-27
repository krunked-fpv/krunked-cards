// ============================================================================
// Krunked Cards — Score Choreographer
// Steps sequentially through SimState ScoreBeat[] scaled by settings.gameSpeed,
// triggers Moveable.juiceUp(), spawns crisp floating colored score pills,
// emits crisp pixel particles, triggers subtle impact flash & micro-shake on
// big XMult / Boss / Glass shatter beats, ramps roaring flame intensity
// (log5 spring), fires pitch-escalating SFX, and triggers FINISH_SCORING cleanly.
// ============================================================================

import {
  PALETTE,
  type GameSpeed,
  type IAudioEngine,
  type ScoreBeat,
  type SimState,
  type SoundKey,
} from '../contracts/index.ts';
import type { CardSceneManager } from './Moveable.ts';
import type { ParticleSystem } from './ParticleSystem.ts';

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
  // Optional impact polish telemetry for WebGL2Renderer
  screenFlash?: number;
  screenFlashColor?: [number, number, number];
  shakeX?: number;
  shakeY?: number;
}

export class ScoreChoreographer {
  private beats: ScoreBeat[] = [];
  private beatIndex = -1;
  private beatTimerMs = 0;
  private active = false;
  private finishedCallback: (() => void) | null = null;

  private displayChips = 0;
  private displayMult = 0;
  private targetChipsVal = 0;
  private targetMultVal = 0;
  private displayHandScore: number | null = null;
  private handName: string | null = null;
  private activeSourceId: string | null = null;

  private flameIntensity = 0;
  private targetFlameIntensity = 0;
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

  triggerImpactFlash(
    amount: number,
    color: [number, number, number] = [1, 1, 1],
    shake = 0
  ): void {
    if (this.reducedMotion) return;
    this.screenFlash = Math.min(1, Math.max(this.screenFlash, amount));
    this.screenFlashColor = color;
    if (shake > 0) {
      this.shakeMag = Math.min(10, Math.max(this.shakeMag, shake));
    }
  }

  isActive(): boolean {
    return this.active;
  }

  getFlameIntensity(): number {
    return this.flameIntensity;
  }

  getDisplay(): ChoreographerDisplay {
    return {
      active: this.active,
      displayChips: Math.round(this.displayChips),
      displayMult: Math.round(this.displayMult * 100) / 100,
      displayHandScore: this.displayHandScore,
      handName: this.handName,
      flameIntensity: this.flameIntensity,
      popups: this.popups,
      activeSourceId: this.activeSourceId,
      chipsPulse: this.chipsPulse,
      multPulse: this.multPulse,
      screenFlash: this.screenFlash,
      screenFlashColor: this.screenFlashColor,
      shakeX: this.shakeX,
      shakeY: this.shakeY,
    };
  }

  start(
    state: SimState,
    beats: ScoreBeat[],
    scene: CardSceneManager,
    audio: IAudioEngine,
    onComplete: () => void
  ): void {
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

  reset(): void {
    this.beats = [];
    this.beatIndex = -1;
    this.beatTimerMs = 0;
    this.active = false;
    this.finishedCallback = null;
    this.displayHandScore = null;
    this.activeSourceId = null;
    this.targetFlameIntensity = 0;
    this.lastPlayedBeatKey = '';
  }

  spawnPopup(
    text: string,
    x: number,
    y: number,
    bgColor: string,
    textColor = '#ffffff',
    lifetime = 0.85
  ): void {
    this.popups.push({
      id: this.nextPopupId++,
      text,
      x,
      y,
      vy: -42,
      bgColor,
      textColor,
      age: 0,
      lifetime,
      scale: 1,
      rotation: (Math.random() - 0.5) * 0.12,
    });
    if (this.popups.length > 24) {
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

    // Smooth numeric easing for display counters
    const kNum = 1 - Math.exp(-18 * safeDt);
    this.displayChips += (this.targetChipsVal - this.displayChips) * kNum;
    this.displayMult += (this.targetMultVal - this.displayMult) * kNum;
    this.chipsPulse = Math.max(0, this.chipsPulse - safeDt * 3.8);
    this.multPulse = Math.max(0, this.multPulse - safeDt * 3.8);

    // Decay impact flash & damped micro-shake
    this.screenFlash = Math.max(0, this.screenFlash - safeDt * 3.6);
    if (this.shakeMag > 0.05 && !reducedMotion) {
      this.shakePhase += safeDt * 58;
      this.shakeX = Math.sin(this.shakePhase) * this.shakeMag;
      this.shakeY = Math.cos(this.shakePhase * 1.37) * this.shakeMag * 0.72;
      this.shakeMag *= Math.exp(-14 * safeDt);
    } else {
      this.shakeMag = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }

    // Update flame roar intensity (`log5` scale whenever hand score beats target!)
    const earned = this.active
      ? Math.floor(this.targetChipsVal * this.targetMultVal)
      : state.currentHandChips * state.currentHandMult;
    const req = state.targetChips;

    if (
      (this.active || state.phase === 'SCORING') &&
      req > 0 &&
      earned >= req
    ) {
      // Exact log5 intensity ramp matching scoreboard roar
      const ratio = earned / Math.max(1, req);
      this.targetFlameIntensity = Math.min(
        10,
        Math.max(1.2, (Math.log(1 + ratio * 4) / Math.log(5)) * 2.2)
      );
    } else {
      this.targetFlameIntensity = 0;
    }

    const flameLerp = 1 - Math.exp(-5.5 * safeDt);
    this.flameIntensity += (this.targetFlameIntensity - this.flameIntensity) * flameLerp;
    if (this.flameIntensity < 0.02 && this.targetFlameIntensity === 0) {
      this.flameIntensity = 0;
    }
    audio.setFireIntensity(Math.min(1, this.flameIntensity / 6));

    // Step floating popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i]!;
      p.age += safeDt * Math.max(1, gameSpeed * 0.65);
      p.y += p.vy * safeDt;
      p.vy *= Math.exp(-3.2 * safeDt);
      if (p.age >= p.lifetime) {
        this.popups.splice(i, 1);
      }
    }

    // Advance beat queue if scoring is active
    if (!this.active) return;

    this.beatTimerMs -= safeDt * 1000 * gameSpeed;
    if (this.beatTimerMs <= 0) {
      this.advanceBeat(state, scene, audio);
    }
  }

  private advanceBeat(
    _state: SimState,
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

    if (beat.chipsDelta && beat.chipsDelta !== 0) this.chipsPulse = 1;
    if ((beat.multDelta && beat.multDelta !== 0) || (beat.xMult && beat.xMult !== 1)) {
      this.multPulse = 1;
    }

    if (beat.kind === 'hand_total' || beat.kind === 'blind_clear') {
      this.displayHandScore = Math.floor(beat.chipsAfter * beat.multAfter);
    }

    // Juice the source card / joker / consumable
    const nowSec = performance.now() / 1000;
    const geom = scene.getGeometry();
    let emitX = geom.playArea.x + geom.playArea.w * 0.5;
    let emitY = geom.playArea.y + geom.playArea.h * 0.46;
    let popupX = emitX;
    let popupY = geom.playArea.y + geom.playArea.h * 0.36;

    if (beat.sourceId) {
      const vc = scene.getVisualCardById(beat.sourceId);
      if (vc) {
        const juiceAmt =
          beat.kind === 'retrigger'
            ? 0.52
            : beat.xMult && beat.xMult >= 2
              ? 0.50
              : 0.42;
        vc.moveable.juiceUp(juiceAmt, undefined, nowSec);
        if (beat.kind === 'card_shatter') {
          vc.moveable.dissolve = 0.85;
        }
        emitX = vc.moveable.vx;
        emitY = vc.moveable.vy;
        popupX = vc.moveable.vx;
        popupY = vc.moveable.vy - vc.moveable.vh * 0.48;
      }
    }

    // Emit crisp pixel particles & subtle impact flash / micro-shake
    if (beat.kind === 'card_shatter') {
      this.particles?.emitGlassShatter(emitX, emitY);
      this.triggerImpactFlash(0.45, [0.76, 0.96, 1.0], 6.5);
      this.onGlitchImpulse?.(0.65);
    } else if (beat.kind === 'boss_debuff' || beat.kind === 'boss_modify') {
      this.particles?.emitMultBurst(emitX, emitY, false, 1.1);
      this.triggerImpactFlash(0.35, [0.95, 0.25, 0.28], 5.0);
      this.onGlitchImpulse?.(0.55);
    } else if (beat.kind === 'retrigger') {
      this.particles?.emitAccentBurst(emitX, emitY, 'orange');
    } else if (beat.kind === 'plasma_balance') {
      this.particles?.emitAccentBurst(emitX, emitY, 'purple');
      this.triggerImpactFlash(0.32, [0.72, 0.55, 1.0], 3.5);
    } else if (beat.kind === 'blind_clear') {
      this.particles?.emitAccentBurst(emitX, emitY, 'celebrate');
      this.triggerImpactFlash(0.28, [1.0, 0.92, 0.62], 3.0);
    } else {
      if (beat.xMult && beat.xMult !== 1) {
        const multWeight = Math.min(2.5, Math.max(1, beat.xMult * 0.65));
        this.particles?.emitMultBurst(emitX, emitY, true, multWeight);
        if (beat.xMult >= 1.5) {
          this.triggerImpactFlash(
            Math.min(0.48, 0.18 + beat.xMult * 0.08),
            [1.0, 0.42, 0.34],
            Math.min(7, 2.5 + beat.xMult * 1.1)
          );
        }
      } else if (beat.multDelta && beat.multDelta !== 0) {
        this.particles?.emitMultBurst(emitX, emitY, false, 1);
      }
      if (beat.chipsDelta && beat.chipsDelta !== 0) {
        this.particles?.emitChipsBurst(emitX, emitY, beat.chipsDelta >= 30 ? 1.5 : 1);
      }
      if (beat.dollarsDelta && beat.dollarsDelta > 0) {
        this.particles?.emitMoneyBurst(emitX, emitY, Math.min(2, 0.8 + beat.dollarsDelta * 0.15));
      }
    }

    // Spawn crisp colored floating pill matching the beat deltas / message
    const pill = formatBeatPill(beat);
    if (pill) {
      this.spawnPopup(pill.text, popupX, popupY, pill.bgColor, '#ffffff', 0.92);
    }

    // Play pitch-escalating SFX (`pitch = 0.3 + 0.08 * pitchStep`)
    const soundKey = pickBeatSound(beat);
    if (soundKey) {
      const step = beat.pitchStep ?? Math.min(18, this.beatIndex + 5);
      const pitch = Math.max(0.35, Math.min(2.4, 0.3 + 0.08 * step));
      audio.playSfx(soundKey, { pitch, volume: 0.95 });
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
