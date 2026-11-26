import { MUSIC_TRACK_IDS, type MusicTrackId } from '../contracts/index.ts';
import type { NoiseLibrary } from './SynthBank.ts';

// ============================================================================
// Krunked Cards — Procedural 5-Track Crossfade Music & Ambient Fire Engine
// Hypnotic 7/4 neo-lounge groove in Dm9 with 5 phase-locked stems + fire loop.
// ============================================================================

const BPM = 104;
const EIGHTH_SEC = 60 / BPM / 2; // ~0.28846s per eighth-note step
const STEPS_PER_BAR = 14; // 7/4 meter (4+3 / 3+2+2 hypnotic lounge feel)
const BARS_PER_CYCLE = 4;
const TOTAL_STEPS = STEPS_PER_BAR * BARS_PER_CYCLE; // 56 steps (~16.15s phrase)
const LOOKAHEAD_SEC = 0.16;

// Shared 4-bar chord progression in D minor / D Dorian so all 5 stems crossfade seamlessly:
// Bar 0: Dm9   | Bar 1: G13   | Bar 2: Bbmaj9 | Bar 3: A7(b9/sus4) turnaround
interface BarHarmony {
  bassRoot: number;
  bassFifth: number;
  bassWalk: number;
  rhodes: number[]; // warm electric-piano voicing
  harp: number[];   // arpeggio notes for Arcana/Pack
  fifths: number[]; // shimmering open fifths for Celestial
  clav: number[];   // funky upper-register triad for Shop
  bossBass: number[]; // pulsing tension bass notes
  bossStab: number[]; // syncopated brass/organ chord
}

const PROGRESSION: readonly BarHarmony[] = [
  // Bar 0: Dm9
  {
    bassRoot: 73.42,   // D2
    bassFifth: 110.0,  // A2
    bassWalk: 98.0,    // G2
    rhodes: [220.0, 261.63, 329.63, 349.23], // A3, C4, E4, F4
    harp: [293.66, 349.23, 440.0, 523.25, 659.25, 523.25, 440.0],
    fifths: [293.66, 440.0, 659.25, 880.0],
    clav: [293.66, 349.23, 440.0, 523.25],
    bossBass: [73.42, 73.42, 87.31, 73.42, 110.0, 98.0, 87.31],
    bossStab: [146.83, 220.0, 261.63, 349.23],
  },
  // Bar 1: G13 (warm Dorian lift)
  {
    bassRoot: 98.0,    // G2
    bassFifth: 73.42,  // D2
    bassWalk: 110.0,   // A2
    rhodes: [246.94, 293.66, 329.63, 349.23], // B3, D4, E4, F4
    harp: [329.63, 392.0, 493.88, 587.33, 659.25, 587.33, 493.88],
    fifths: [329.63, 493.88, 739.99, 987.77],
    clav: [293.66, 349.23, 493.88, 587.33],
    bossBass: [98.0, 98.0, 110.0, 98.0, 87.31, 82.41, 73.42],
    bossStab: [196.0, 246.94, 349.23, 440.0],
  },
  // Bar 2: Bbmaj9
  {
    bassRoot: 116.54,  // Bb2
    bassFifth: 87.31,  // F2
    bassWalk: 110.0,   // A2
    rhodes: [220.0, 261.63, 293.66, 349.23], // A3, C4, D4, F4
    harp: [233.08, 293.66, 349.23, 440.0, 587.33, 440.0, 349.23],
    fifths: [233.08, 349.23, 523.25, 698.46],
    clav: [293.66, 349.23, 440.0, 587.33],
    bossBass: [116.54, 116.54, 110.0, 98.0, 87.31, 87.31, 82.41],
    bossStab: [174.61, 233.08, 293.66, 440.0],
  },
  // Bar 3: A7(alt/sus4) turnaround back to Dm9
  {
    bassRoot: 110.0,   // A2
    bassFifth: 82.41,  // E2
    bassWalk: 77.78,   // Eb2 chromatic lead-in to D2
    rhodes: [220.0, 261.63, 311.13, 392.0], // A3, C4, Eb4, G4 (smoky jazz tension)
    harp: [220.0, 277.18, 329.63, 392.0, 523.25, 440.0, 329.63],
    fifths: [220.0, 329.63, 493.88, 659.25],
    clav: [277.18, 329.63, 392.0, 493.88],
    bossBass: [110.0, 110.0, 116.54, 110.0, 103.83, 98.0, 77.78],
    bossStab: [164.81, 220.0, 277.18, 392.0],
  },
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class MusicSequencer {
  private activeTrack: MusicTrackId = 'music1';
  private intensity = 0.5;
  private started = false;
  private disposed = false;

  // Master procedural crossfade mix (allows smooth handoff when custom pack buffers load)
  private musicMixTarget = 1;
  private musicMixCurrent = 1;
  private fireMixTarget = 1;
  private fireMixCurrent = 1;

  // 5-stem gains + smooth targets
  private readonly stemGains: Record<MusicTrackId, GainNode>;
  private readonly stemLevels: Record<MusicTrackId, number> = {
    music1: 1,
    music2: 0,
    music3: 0,
    music4: 0,
    music5: 0,
  };

  private readonly musicBus: GainNode;
  private readonly dryBus: GainNode;
  private readonly reverbSend: GainNode;
  private readonly convolver: ConvolverNode | null;

  // Continuous subtle vinyl warmth for music1 + LFO pad filter for music3
  private vinylSource: AudioBufferSourceNode | null = null;
  private celestialPadOscs: OscillatorNode[] = [];
  private celestialLfo: OscillatorNode | null = null;
  private celestialFilter: BiquadFilterNode | null = null;
  private arcanaPadOscs: OscillatorNode[] = [];
  private readonly persistentNodes: AudioNode[] = [];

  // Ambient fire loop nodes
  private readonly fireMasterGain: GainNode;
  private readonly fireRoarFilter: BiquadFilterNode;
  private readonly fireRoarGain: GainNode;
  private readonly fireCrackleFilter: BiquadFilterNode;
  private readonly fireCrackleGain: GainNode;
  private fireRoarSource: AudioBufferSourceNode | null = null;
  private fireCrackleSource: AudioBufferSourceNode | null = null;
  private targetFireIntensity = 0;
  private currentFireIntensity = 0;

  // Lookahead step clock
  private stepIndex = 0;
  private nextStepTime = 0;

  constructor(
    private readonly ctx: AudioContext,
    musicDestination: AudioNode,
    fireDestination: AudioNode,
    private readonly noise: NoiseLibrary,
  ) {
    // Master procedural music bus
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 1;
    this.musicBus.connect(musicDestination);

    this.dryBus = ctx.createGain();
    this.dryBus.gain.value = 0.88;
    this.dryBus.connect(this.musicBus);

    // Subtle dark lounge reverb send for Rhodes, harp & celestial shimmer
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.24;
    let conv: ConvolverNode | null = null;
    try {
      conv = ctx.createConvolver();
      conv.buffer = noise.impulse;
      this.reverbSend.connect(conv);
      conv.connect(this.musicBus);
    } catch {
      conv = null;
    }
    this.convolver = conv;

    // 5 independent stem buses
    const gains = {} as Record<MusicTrackId, GainNode>;
    for (const id of MUSIC_TRACK_IDS) {
      const g = ctx.createGain();
      g.gain.value = id === this.activeTrack ? 1 : 0;
      g.connect(this.dryBus);
      if (this.convolver) {
        g.connect(this.reverbSend);
      }
      gains[id] = g;
    }
    this.stemGains = gains;

    // Ambient Fire Loop Graph (routed to fireDestination / sfxGain)
    this.fireMasterGain = ctx.createGain();
    this.fireMasterGain.gain.value = 0;
    this.fireMasterGain.connect(fireDestination);

    this.fireRoarFilter = ctx.createBiquadFilter();
    this.fireRoarFilter.type = 'lowpass';
    this.fireRoarFilter.frequency.value = 140;
    this.fireRoarFilter.Q.value = 1.8;

    this.fireRoarGain = ctx.createGain();
    this.fireRoarGain.gain.value = 0.65;
    this.fireRoarFilter.connect(this.fireRoarGain);
    this.fireRoarGain.connect(this.fireMasterGain);

    this.fireCrackleFilter = ctx.createBiquadFilter();
    this.fireCrackleFilter.type = 'bandpass';
    this.fireCrackleFilter.frequency.value = 1750;
    this.fireCrackleFilter.Q.value = 1.1;

    this.fireCrackleGain = ctx.createGain();
    this.fireCrackleGain.gain.value = 0.35;
    this.fireCrackleFilter.connect(this.fireCrackleGain);
    this.fireCrackleGain.connect(this.fireMasterGain);
  }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    const now = this.ctx.currentTime;
    this.nextStepTime = now + 0.04;

    this.startContinuousBeds(now);
    this.startFireLoops(now);
  }

  private startContinuousBeds(now: number): void {
    // 1. Subtle brushed vinyl texture inside music1 stem
    try {
      const vinylSrc = this.ctx.createBufferSource();
      vinylSrc.buffer = this.noise.crackle;
      vinylSrc.loop = true;

      const vFilter = this.ctx.createBiquadFilter();
      vFilter.type = 'bandpass';
      vFilter.frequency.setValueAtTime(2400, now);
      vFilter.Q.setValueAtTime(1.4, now);

      const vGain = this.ctx.createGain();
      vGain.gain.setValueAtTime(0.022, now);

      vinylSrc.connect(vFilter);
      vFilter.connect(vGain);
      vGain.connect(this.stemGains.music1);
      vinylSrc.start(now);
      this.vinylSource = vinylSrc;
      this.persistentNodes.push(vFilter, vGain);
    } catch {
      // ignore if audio context cannot start source
    }

    // 2. Velvet low-pass pad bed inside music2 (Arcana/Pack)
    try {
      const padFlt = this.ctx.createBiquadFilter();
      padFlt.type = 'lowpass';
      padFlt.frequency.setValueAtTime(520, now);
      padFlt.Q.setValueAtTime(1.6, now);

      const padGain = this.ctx.createGain();
      padGain.gain.setValueAtTime(0.065, now);
      padFlt.connect(padGain);
      padGain.connect(this.stemGains.music2);
      this.persistentNodes.push(padFlt, padGain);

      // Soft warm D-minor drone root + 5th + 7th
      const arcanaFreqs = [146.83, 220.0, 261.63];
      for (let i = 0; i < arcanaFreqs.length; i++) {
        const o = this.ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(arcanaFreqs[i], now);
        o.detune.setValueAtTime((i - 1) * 5, now);
        o.connect(padFlt);
        o.start(now);
        this.arcanaPadOscs.push(o);
      }
    } catch {
      // ignore
    }

    // 3. Cosmic resonant LFO synth pad inside music3 (Celestial Pack)
    try {
      const cFlt = this.ctx.createBiquadFilter();
      cFlt.type = 'lowpass';
      cFlt.frequency.setValueAtTime(860, now);
      cFlt.Q.setValueAtTime(4.2, now);

      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.14, now);
      const lfoDepth = this.ctx.createGain();
      lfoDepth.gain.setValueAtTime(460, now);
      lfo.connect(lfoDepth);
      lfoDepth.connect(cFlt.frequency);
      lfo.start(now);

      const cGain = this.ctx.createGain();
      cGain.gain.setValueAtTime(0.065, now);
      cFlt.connect(cGain);
      cGain.connect(this.stemGains.music3);
      this.persistentNodes.push(lfoDepth, cGain);

      // Stacked open fifths (D3, A3, E4)
      const cosmicFreqs = [146.83, 220.0, 329.63];
      for (let i = 0; i < cosmicFreqs.length; i++) {
        const o = this.ctx.createOscillator();
        o.type = i === 2 ? 'sine' : 'sawtooth';
        o.frequency.setValueAtTime(cosmicFreqs[i], now);
        o.detune.setValueAtTime((i - 1) * 7, now);
        o.connect(cFlt);
        o.start(now);
        this.celestialPadOscs.push(o);
      }
      this.celestialLfo = lfo;
      this.celestialFilter = cFlt;
    } catch {
      // ignore
    }
  }

  private startFireLoops(now: number): void {
    try {
      const roar = this.ctx.createBufferSource();
      roar.buffer = this.noise.brown;
      roar.loop = true;
      roar.connect(this.fireRoarFilter);
      roar.start(now);
      this.fireRoarSource = roar;

      const crack = this.ctx.createBufferSource();
      crack.buffer = this.noise.crackle;
      crack.loop = true;
      crack.connect(this.fireCrackleFilter);
      crack.start(now);
      this.fireCrackleSource = crack;
    } catch {
      // ignore
    }
  }

  setActiveTrack(track: MusicTrackId, intensity?: number): void {
    this.activeTrack = track;
    if (intensity !== undefined && Number.isFinite(intensity)) {
      this.intensity = clamp(intensity, 0, 1);
    }
  }

  setMusicMix(mix: number): void {
    this.musicMixTarget = clamp(Number.isFinite(mix) ? mix : 1, 0, 1);
  }

  setFireIntensity(intensity: number): void {
    this.targetFireIntensity = clamp(Number.isFinite(intensity) ? intensity : 0, 0, 1);
  }

  setFireMix(mix: number): void {
    this.fireMixTarget = clamp(Number.isFinite(mix) ? mix : 1, 0, 1);
  }

  getStemGain(track: MusicTrackId): number {
    return this.stemLevels[track];
  }

  update(dt: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(dt) || dt <= 0) return;
    const safeDt = Math.min(dt, 0.1);
    const now = this.ctx.currentTime;

    // 1. Smooth 5-track stem crossfade: exact lerp = Math.min(1, 3 * dt)
    const lerp = Math.min(1, 3 * safeDt);
    for (const id of MUSIC_TRACK_IDS) {
      const target = id === this.activeTrack ? 1 : 0;
      const next = this.stemLevels[id] + (target - this.stemLevels[id]) * lerp;
      const snapped = Math.abs(target - next) < 0.0005 ? target : next;
      this.stemLevels[id] = snapped;
      this.stemGains[id].gain.setTargetAtTime(snapped, now, 0.018);
    }

    // Smooth procedural-vs-custom music/fire bus crossfade
    this.musicMixCurrent += (this.musicMixTarget - this.musicMixCurrent) * lerp;
    this.musicBus.gain.setTargetAtTime(this.musicMixCurrent, now, 0.025);

    this.fireMixCurrent += (this.fireMixTarget - this.fireMixCurrent) * lerp;

    // 2. Smooth ambient fire intensity & dynamic tone shaping
    const fireRate = this.targetFireIntensity > this.currentFireIntensity ? 5.0 : 2.6;
    const fireLerp = Math.min(1, fireRate * safeDt);
    this.currentFireIntensity += (this.targetFireIntensity - this.currentFireIntensity) * fireLerp;
    if (this.currentFireIntensity < 0.001 && this.targetFireIntensity === 0) {
      this.currentFireIntensity = 0;
    }

    const fInt = this.currentFireIntensity;
    const effectiveFireGain = fInt <= 0.0005 ? 0 : Math.pow(fInt, 0.85) * 0.58 * this.fireMixCurrent;
    this.fireMasterGain.gain.setTargetAtTime(effectiveFireGain, now, 0.025);
    // Low roar deepens & opens up as flames grow taller
    this.fireRoarFilter.frequency.setTargetAtTime(125 + fInt * 320, now, 0.04);
    this.fireCrackleFilter.frequency.setTargetAtTime(1500 + fInt * 1450, now, 0.04);
    this.fireCrackleGain.gain.setTargetAtTime(0.22 + fInt * 0.52, now, 0.04);

    // 3. Lookahead step scheduler (runs only while audio context is running & procedural music is audible)
    if (!this.started || this.ctx.state !== 'running') return;

    // Resync gracefully if tab was backgrounded
    if (this.nextStepTime < now - 0.25) {
      this.nextStepTime = now + 0.04;
    }

    while (this.nextStepTime < now + LOOKAHEAD_SEC) {
      if (this.musicMixCurrent > 0.005 || this.musicMixTarget > 0.005) {
        this.scheduleStep(this.stepIndex, this.nextStepTime);
      }
      this.nextStepTime += EIGHTH_SEC;
      this.stepIndex = (this.stepIndex + 1) % TOTAL_STEPS;
    }
  }

  private scheduleStep(globalStep: number, time: number): void {
    const barIdx = Math.floor(globalStep / STEPS_PER_BAR) % BARS_PER_CYCLE;
    const step = globalStep % STEPS_PER_BAR; // 0..13 in 7/4 meter
    const harm = PROGRESSION[barIdx];

    // Only synthesize voices for stems that are currently audible or fading in
    if (this.stemLevels.music1 > 0.003 || this.activeTrack === 'music1') {
      this.scheduleMainLounge(step, barIdx, harm, time);
    }
    if (this.stemLevels.music2 > 0.003 || this.activeTrack === 'music2') {
      this.scheduleArcanaPack(step, harm, time);
    }
    if (this.stemLevels.music3 > 0.003 || this.activeTrack === 'music3') {
      this.scheduleCelestialPack(step, harm, time);
    }
    if (this.stemLevels.music4 > 0.003 || this.activeTrack === 'music4') {
      this.scheduleShopFunk(step, harm, time);
    }
    if (this.stemLevels.music5 > 0.003 || this.activeTrack === 'music5') {
      this.scheduleBossTension(step, barIdx, harm, time);
    }
  }

  // -------------------------------------------------------------------------
  // Stem 1: Main / Blind — Hypnotic 7/4 Rhodes electric piano & brushed vinyl
  // -------------------------------------------------------------------------
  private scheduleMainLounge(step: number, barIdx: number, h: BarHarmony, t: number): void {
    const dest = this.stemGains.music1;

    // Warm Rhodes chord hits in 7/4 (beats 1, 3.5, 5, 6.5 -> steps 0, 5, 8, 12)
    if (step === 0 || step === 8) {
      const dur = step === 0 ? EIGHTH_SEC * 4.6 : EIGHTH_SEC * 3.8;
      const gain = step === 0 ? 0.13 : 0.1;
      this.playRhodesChord(dest, h.rhodes, t, dur, gain);
    } else if (step === 5 || (step === 12 && barIdx % 2 === 1)) {
      // Gentle syncopated Rhodes upper-voice answer
      this.playRhodesChord(dest, h.rhodes.slice(1), t, EIGHTH_SEC * 2.2, 0.072);
    }

    // Hypnotic electric-piano top melody motif (sparse, non-fatiguing, breathing space)
    const melodyMap: Record<number, number> = {
      2: h.rhodes[3] * 2,
      6: h.rhodes[2] * 2,
      10: h.rhodes[1] * 2,
      13: h.rhodes[0] * 2,
    };
    const melHz = melodyMap[step];
    if (melHz && (barIdx !== 2 || step !== 13)) {
      this.playRhodesNote(dest, melHz, t, EIGHTH_SEC * 2.1, 0.068);
    }

    // Upright lounge bassline (steps 0, 4, 8, 11)
    if (step === 0) {
      this.playWarmBass(dest, h.bassRoot, t, EIGHTH_SEC * 3.4, 0.24);
    } else if (step === 4) {
      this.playWarmBass(dest, h.bassFifth, t, EIGHTH_SEC * 3.0, 0.17);
    } else if (step === 8) {
      this.playWarmBass(dest, h.bassRoot * 1.5 > 165 ? h.bassRoot : h.bassRoot * 1.5, t, EIGHTH_SEC * 2.6, 0.19);
    } else if (step === 11) {
      this.playWarmBass(dest, h.bassWalk, t, EIGHTH_SEC * 2.4, 0.18);
    }

    // Brushed jazz kit: soft felt kick on 0 and 8, gentle brush sweep on 2, 6, 10, 12
    if (step === 0 || step === 8) {
      this.playSoftKick(dest, t, step === 0 ? 0.19 : 0.13);
    }
    if (step === 2 || step === 6 || step === 10 || step === 12) {
      this.playBrushHat(dest, t, step === 6 ? 0.055 : 0.036, step === 6 ? 0.11 : 0.055);
    }
  }

  // -------------------------------------------------------------------------
  // Stem 2: Arcana / Spectral / Buffoon Pack — Mysterious harp/bell arpeggios
  // -------------------------------------------------------------------------
  private scheduleArcanaPack(step: number, h: BarHarmony, t: number): void {
    const dest = this.stemGains.music2;

    // Gentle cascading minor-7th harp notes every other eighth + occasional bell echo
    if (step % 2 === 0) {
      const idx = (step / 2) % h.harp.length;
      const hz = h.harp[idx];
      this.playHarpPluck(dest, hz, t, EIGHTH_SEC * 3.4, 0.115);
    }
    // Shimmering high celesta bell accent on steps 3 and 9
    if (step === 3 || step === 9) {
      const hz = h.harp[step === 3 ? 4 : 2] * 2;
      this.playBellShimmer(dest, hz, t, EIGHTH_SEC * 4.0, 0.055);
    }
    // Deep mysterious pedal root on beat 1
    if (step === 0) {
      this.playWarmBass(dest, h.bassRoot, t, EIGHTH_SEC * 6.5, 0.16);
    }
  }

  // -------------------------------------------------------------------------
  // Stem 3: Celestial Pack — Cosmic shimmer fifths + resonant LFO synth pad
  // -------------------------------------------------------------------------
  private scheduleCelestialPack(step: number, h: BarHarmony, t: number): void {
    const dest = this.stemGains.music3;

    // Shimmering wide open-fifth chord swell on step 0 and gentle upper sparkle on step 7
    if (step === 0) {
      this.playCosmicSwell(dest, h.fifths, t, EIGHTH_SEC * 7.5, 0.11);
    } else if (step === 7) {
      this.playCosmicSwell(dest, [h.fifths[1] * 2, h.fifths[2] * 2], t, EIGHTH_SEC * 6.5, 0.068);
    }
    // Starlight crystalline fifth pings on steps 4 and 11
    if (step === 4 || step === 11) {
      const hz = step === 4 ? h.fifths[2] * 2 : h.fifths[3] * 2;
      this.playBellShimmer(dest, hz, t, EIGHTH_SEC * 4.2, 0.048);
    }
  }

  // -------------------------------------------------------------------------
  // Stem 4: Shop — Funky upbeat muted clavinet/rhodes bassline + crisp snare tick
  // -------------------------------------------------------------------------
  private scheduleShopFunk(step: number, h: BarHarmony, t: number): void {
    const dest = this.stemGains.music4;

    // Syncopated funky muted clavinet stabs
    if (step === 0 || step === 3 || step === 6 || step === 8 || step === 11 || step === 13) {
      const accent = step === 0 || step === 8 ? 0.12 : 0.085;
      const chord = step === 3 || step === 11 ? h.clav.slice(1) : h.clav;
      this.playClavStab(dest, chord, t, EIGHTH_SEC * 0.72, accent);
    }

    // Bouncy octave funk bassline
    if (step === 0 || step === 5 || step === 8) {
      this.playFunkBass(dest, h.bassRoot, t, EIGHTH_SEC * 1.1, 0.24);
    } else if (step === 2 || step === 10) {
      this.playFunkBass(dest, h.bassRoot * 2, t, EIGHTH_SEC * 0.75, 0.18);
    } else if (step === 6 || step === 12) {
      this.playFunkBass(dest, h.bassFifth, t, EIGHTH_SEC * 0.9, 0.2);
    } else if (step === 13) {
      this.playFunkBass(dest, h.bassWalk, t, EIGHTH_SEC * 0.7, 0.17);
    }

    // Crisp upbeat drum pocket: punchy kick + snappy rim/snare tick + closed hat
    if (step === 0 || step === 5 || step === 8) {
      this.playSoftKick(dest, t, 0.22);
    }
    if (step === 4 || step === 10 || step === 12) {
      this.playCrispSnareTick(dest, t, step === 12 ? 0.08 : 0.13);
    }
    this.playBrushHat(dest, t, step % 2 === 0 ? 0.048 : 0.024, 0.032);
  }

  // -------------------------------------------------------------------------
  // Stem 5: Boss Blind — Tense pulsing bass ostinato + syncopated brass/organ stabs
  // -------------------------------------------------------------------------
  private scheduleBossTension(step: number, barIdx: number, h: BarHarmony, t: number): void {
    const dest = this.stemGains.music5;
    const drive = 0.8 + this.intensity * 0.4;

    // Relentless pulsing 8th-note bass ostinato
    const bNote = h.bossBass[step % h.bossBass.length];
    const isAccent = step === 0 || step === 4 || step === 8 || step === 11;
    this.playBossOstinato(dest, bNote, t, EIGHTH_SEC * 0.85, (isAccent ? 0.24 : 0.15) * drive, isAccent);

    // Syncopated dark brass/organ stabs
    if (step === 0 || step === 6 || step === 11 || (barIdx === 3 && step === 13)) {
      this.playBrassOrganStab(dest, h.bossStab, t, EIGHTH_SEC * 1.45, 0.145 * drive);
    }

    // Tense heartbeat kick + tight metallic percussion tick
    if (step === 0 || step === 3 || step === 8) {
      this.playSoftKick(dest, t, 0.26);
    }
    if (step === 4 || step === 10) {
      this.playCrispSnareTick(dest, t, 0.11);
    }
    if (step % 2 === 1) {
      this.playBrushHat(dest, t, 0.038, 0.025);
    }
  }

  // -------------------------------------------------------------------------
  // Lightweight Instrument Voice Primitives (self-cleaning Web Audio nodes)
  // -------------------------------------------------------------------------

  private playRhodesChord(dest: AudioNode, freqs: number[], t: number, dur: number, gain: number): void {
    const per = gain / Math.sqrt(freqs.length);
    for (let i = 0; i < freqs.length; i++) {
      // Slight subtle strum (7ms) for human electric-piano feel
      this.playRhodesNote(dest, freqs[i], t + i * 0.007, dur, per);
    }
  }

  private playRhodesNote(dest: AudioNode, freq: number, t: number, dur: number, gain: number): void {
    const body = this.ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(freq, t);

    // Gentle Rhodes tine harmonic overtone (decays rapidly)
    const tine = this.ctx.createOscillator();
    tine.type = 'triangle';
    tine.frequency.setValueAtTime(freq * 3.0, t);

    const tineGain = this.ctx.createGain();
    tineGain.gain.setValueAtTime(gain * 0.24, t);
    tineGain.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(0.14, dur * 0.4));

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + 0.012);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * 0.28), t + dur * 0.55);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    body.connect(amp);
    tine.connect(tineGain);
    tineGain.connect(amp);
    amp.connect(dest);

    body.start(t);
    tine.start(t);
    body.stop(t + dur + 0.02);
    tine.stop(t + Math.min(0.16, dur) + 0.02);
  }

  private playWarmBass(dest: AudioNode, freq: number, t: number, dur: number, gain: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);

    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(340, t);
    flt.frequency.exponentialRampToValueAtTime(160, t + dur);

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + 0.014);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(flt);
    flt.connect(amp);
    amp.connect(dest);

    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private playFunkBass(dest: AudioNode, freq: number, t: number, dur: number, gain: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);

    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.Q.setValueAtTime(3.2, t);
    flt.frequency.setValueAtTime(980, t);
    flt.frequency.exponentialRampToValueAtTime(210, t + Math.min(0.16, dur));

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(flt);
    flt.connect(amp);
    amp.connect(dest);

    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private playClavStab(dest: AudioNode, freqs: number[], t: number, dur: number, gain: number): void {
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.Q.setValueAtTime(2.4, t);
    flt.frequency.setValueAtTime(2400, t);
    flt.frequency.exponentialRampToValueAtTime(740, t + dur);

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    flt.connect(amp);
    amp.connect(dest);

    for (const hz of freqs) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(hz, t);
      o.connect(flt);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }

  private playHarpPluck(dest: AudioNode, freq: number, t: number, dur: number, gain: number): void {
    const o1 = this.ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.setValueAtTime(freq, t);

    const o2 = this.ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(freq * 2, t);

    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(freq * 4.5, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(320, freq * 1.1), t + dur * 0.7);

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + 0.007);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o1.connect(flt);
    o2.connect(flt);
    flt.connect(amp);
    amp.connect(dest);

    o1.start(t);
    o2.start(t);
    o1.stop(t + dur + 0.02);
    o2.stop(t + dur + 0.02);
  }

  private playBellShimmer(dest: AudioNode, freq: number, t: number, dur: number, gain: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);

    const overtone = this.ctx.createOscillator();
    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(freq * 2.003, t);

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o.connect(amp);
    overtone.connect(amp);
    amp.connect(dest);

    o.start(t);
    overtone.start(t);
    o.stop(t + dur + 0.02);
    overtone.stop(t + dur + 0.02);
  }

  private playCosmicSwell(dest: AudioNode, freqs: number[], t: number, dur: number, gain: number): void {
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.Q.setValueAtTime(2.8, t);
    flt.frequency.setValueAtTime(420, t);
    flt.frequency.exponentialRampToValueAtTime(2200, t + dur * 0.45);
    flt.frequency.exponentialRampToValueAtTime(580, t + dur);

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + dur * 0.35);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    flt.connect(amp);
    amp.connect(dest);

    freqs.forEach((hz, i) => {
      const o = this.ctx.createOscillator();
      o.type = i % 2 === 0 ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(hz, t);
      o.detune.setValueAtTime((i - 1.5) * 6, t);
      o.connect(flt);
      o.start(t);
      o.stop(t + dur + 0.03);
    });
  }

  private playBossOstinato(
    dest: AudioNode,
    freq: number,
    t: number,
    dur: number,
    gain: number,
    accent: boolean,
  ): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);

    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(freq, t);

    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.Q.setValueAtTime(accent ? 4.8 : 2.6, t);
    flt.frequency.setValueAtTime(accent ? 760 : 380, t);
    flt.frequency.exponentialRampToValueAtTime(140, t + dur);

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(flt);
    sub.connect(flt);
    flt.connect(amp);
    amp.connect(dest);

    osc.start(t);
    sub.start(t);
    osc.stop(t + dur + 0.02);
    sub.stop(t + dur + 0.02);
  }

  private playBrassOrganStab(dest: AudioNode, freqs: number[], t: number, dur: number, gain: number): void {
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.Q.setValueAtTime(2.5, t);
    flt.frequency.setValueAtTime(480, t);
    flt.frequency.exponentialRampToValueAtTime(2100, t + 0.045);
    flt.frequency.exponentialRampToValueAtTime(520, t + dur);

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    flt.connect(amp);
    amp.connect(dest);

    freqs.forEach((hz, i) => {
      const o = this.ctx.createOscillator();
      o.type = i % 2 === 0 ? 'sawtooth' : 'square';
      o.frequency.setValueAtTime(hz, t);
      o.detune.setValueAtTime((i - 1.5) * 7, t);
      o.connect(flt);
      o.start(t);
      o.stop(t + dur + 0.02);
    });
  }

  private playSoftKick(dest: AudioNode, t: number, gain: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(118, t);
    osc.frequency.exponentialRampToValueAtTime(44, t + 0.09);

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + 0.003);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);

    osc.connect(amp);
    amp.connect(dest);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  private playBrushHat(dest: AudioNode, t: number, gain: number, dur: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise.pink;
    src.loop = true;

    const flt = this.ctx.createBiquadFilter();
    flt.type = 'highpass';
    flt.frequency.setValueAtTime(5400, t);

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(flt);
    flt.connect(amp);
    amp.connect(dest);
    src.start(t, (t * 0.73) % 1.8, dur + 0.02);
  }

  private playCrispSnareTick(dest: AudioNode, t: number, gain: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise.white;
    src.loop = true;

    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(2800, t);
    flt.Q.setValueAtTime(1.8, t);

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + 0.002);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.068);

    src.connect(flt);
    flt.connect(amp);
    amp.connect(dest);
    src.start(t, (t * 0.41) % 1.4, 0.08);

    // Subtle woody rim tone
    const body = this.ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(340, t);
    body.frequency.exponentialRampToValueAtTime(190, t + 0.04);
    const bAmp = this.ctx.createGain();
    bAmp.gain.setValueAtTime(gain * 0.65, t);
    bAmp.gain.exponentialRampToValueAtTime(0.0001, t + 0.042);
    body.connect(bAmp);
    bAmp.connect(dest);
    body.start(t);
    body.stop(t + 0.05);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    const stopNode = (n: AudioScheduledSourceNode | null) => {
      if (!n) return;
      try {
        n.stop();
      } catch {
        // ignore
      }
      try {
        n.disconnect();
      } catch {
        // ignore
      }
    };

    stopNode(this.vinylSource);
    stopNode(this.celestialLfo);
    stopNode(this.fireRoarSource);
    stopNode(this.fireCrackleSource);
    for (const o of this.celestialPadOscs) stopNode(o);
    for (const o of this.arcanaPadOscs) stopNode(o);

    this.celestialPadOscs = [];
    this.arcanaPadOscs = [];
    this.vinylSource = null;
    this.celestialLfo = null;
    this.fireRoarSource = null;
    this.fireCrackleSource = null;

    const disconnectNode = (n: AudioNode | null) => {
      if (!n) return;
      try {
        n.disconnect();
      } catch {
        // ignore
      }
    };

    for (const id of MUSIC_TRACK_IDS) disconnectNode(this.stemGains[id]);
    for (const n of this.persistentNodes) disconnectNode(n);
    this.persistentNodes.length = 0;
    disconnectNode(this.dryBus);
    disconnectNode(this.reverbSend);
    disconnectNode(this.convolver);
    disconnectNode(this.musicBus);
    disconnectNode(this.celestialFilter);
    disconnectNode(this.fireRoarFilter);
    disconnectNode(this.fireRoarGain);
    disconnectNode(this.fireCrackleFilter);
    disconnectNode(this.fireCrackleGain);
    disconnectNode(this.fireMasterGain);
  }
}
