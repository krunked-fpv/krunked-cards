import type { SoundKey } from '../contracts/index.ts';

// ============================================================================
// Krunked Cards — Procedural SFX Synthesizer Bank (src/audio/SynthBank.ts)
// Exhaustive Web Audio synthesis covering all 80 SoundKey identifiers.
// ============================================================================

export interface ActiveVoice {
  id: number;
  key: SoundKey;
  startedAt: number;
  endsAt: number;
  stop: (fadeOutSec?: number) => void;
}

export interface NoiseLibrary {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
  crackle: AudioBuffer;
  impulse: AudioBuffer;
}

export interface SynthPlayContext {
  ctx: AudioContext;
  destination: AudioNode;
  noise: NoiseLibrary;
  now: number;
  pitch: number;
  volume: number;
  voiceId: number;
  key: SoundKey;
}

export type SynthHandler = (sc: SynthPlayContext) => ActiveVoice;

// Deterministic PRNG for noise & stereo impulse buffers so generation is fast & consistent
function createSeededRand(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

export function createNoiseLibrary(ctx: AudioContext): NoiseLibrary {
  const sr = ctx.sampleRate || 44100;
  const rand = createSeededRand(0x5a7f31c9);

  // 1. White noise (2.0s)
  const whiteLen = Math.floor(sr * 2.0);
  const white = ctx.createBuffer(1, whiteLen, sr);
  const wData = white.getChannelData(0);
  for (let i = 0; i < whiteLen; i++) {
    wData[i] = rand() * 2 - 1;
  }

  // 2. Pink noise (3.0s, Paul Kellet 7-pole approximation)
  const pinkLen = Math.floor(sr * 3.0);
  const pink = ctx.createBuffer(1, pinkLen, sr);
  const pData = pink.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < pinkLen; i++) {
    const u = rand() * 2 - 1;
    b0 = 0.99886 * b0 + u * 0.0555179;
    b1 = 0.99332 * b1 + u * 0.0750759;
    b2 = 0.96900 * b2 + u * 0.1538520;
    b3 = 0.86650 * b3 + u * 0.3104856;
    b4 = 0.55000 * b4 + u * 0.5329522;
    b5 = -0.7616 * b5 - u * 0.0168980;
    const out = b0 + b1 + b2 + b3 + b4 + b5 + b6 + u * 0.5362;
    b6 = u * 0.115926;
    pData[i] = Math.max(-1, Math.min(1, out * 0.11));
  }
  // Smooth crossfade loop seam over last 256 samples
  const seam = Math.min(256, Math.floor(pinkLen / 8));
  for (let i = 0; i < seam; i++) {
    const t = i / seam;
    pData[pinkLen - seam + i] = pData[pinkLen - seam + i] * (1 - t) + pData[i] * t;
  }

  // 3. Brown noise (3.0s, leaky integrator for warm sub roar)
  const brownLen = Math.floor(sr * 3.0);
  const brown = ctx.createBuffer(1, brownLen, sr);
  const brData = brown.getChannelData(0);
  let last = 0;
  for (let i = 0; i < brownLen; i++) {
    const u = rand() * 2 - 1;
    last = (last + 0.024 * u) / 1.024;
    brData[i] = Math.max(-1, Math.min(1, last * 3.4));
  }
  for (let i = 0; i < seam; i++) {
    const t = i / seam;
    brData[brownLen - seam + i] = brData[brownLen - seam + i] * (1 - t) + brData[i] * t;
  }

  // 4. Hearth fire crackle (3.0s, warm ember snaps over soft pink bed)
  const crackleLen = Math.floor(sr * 3.0);
  const crackle = ctx.createBuffer(1, crackleLen, sr);
  const crData = crackle.getChannelData(0);
  let popEnv = 0;
  let popDecay = 0.92;
  for (let i = 0; i < crackleLen; i++) {
    if (rand() < 0.0016) {
      popEnv = 0.45 + rand() * 0.55;
      popDecay = 0.86 + rand() * 0.11;
    }
    const base = pData[i % pinkLen] * 0.28;
    const snap = (rand() * 2 - 1) * popEnv;
    popEnv *= popDecay;
    crData[i] = Math.max(-1, Math.min(1, base + snap));
  }

  // 5. Stereo dark lounge room impulse (0.55s) for music & shimmer ambience
  const impLen = Math.floor(sr * 0.55);
  const impulse = ctx.createBuffer(2, impLen, sr);
  for (let ch = 0; ch < 2; ch++) {
    const chData = impulse.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < impLen; i++) {
      const t = i / impLen;
      const env = Math.pow(1 - t, 2.8) * (i < 120 ? i / 120 : 1);
      const n = rand() * 2 - 1;
      lp = lp * 0.62 + n * 0.38;
      chData[i] = lp * env * 0.55;
    }
  }

  return { white, pink, brown, crackle, impulse };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function safeFreq(freq: number, ctx: AudioContext): number {
  const maxFreq = Math.min(14000, (ctx.sampleRate || 44100) * 0.44);
  return clamp(freq, 28, maxFreq);
}

/**
 * Lightweight voice builder that wraps every scheduled node under a single gain bus
 * for click-free voice stealing and automatic node graph disconnection.
 */
class VoiceBuilder {
  readonly ctx: AudioContext;
  readonly bus: GainNode;
  readonly now: number;
  readonly pitch: number;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private maxEnd: number;
  private stopped = false;

  constructor(private readonly sc: SynthPlayContext) {
    this.ctx = sc.ctx;
    this.now = sc.now;
    this.pitch = clamp(Number.isFinite(sc.pitch) ? sc.pitch : 1, 0.25, 3.5);
    this.maxEnd = sc.now + 0.02;

    this.bus = sc.ctx.createGain();
    const vol = clamp(Number.isFinite(sc.volume) ? sc.volume : 1, 0.0001, 2.0);
    this.bus.gain.setValueAtTime(vol, sc.now);
    this.bus.connect(sc.destination);
    this.nodes.push(this.bus);
  }

  trackNode<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  trackSource<T extends AudioScheduledSourceNode>(src: T, endTime: number): T {
    this.sources.push(src);
    this.nodes.push(src);
    if (endTime > this.maxEnd) this.maxEnd = endTime;
    return src;
  }

  osc(
    type: OscillatorType,
    startFreq: number,
    endFreq: number | null,
    startOffset: number,
    duration: number,
    peakGain: number,
    opts?: {
      attack?: number;
      target?: AudioNode;
      detune?: number;
      expFreq?: boolean;
      usePitch?: boolean;
      pitchPower?: number;
    },
  ): OscillatorNode {
    const t0 = this.now + Math.max(0, startOffset);
    const dur = Math.max(0.012, duration);
    const t1 = t0 + dur;
    const attack = Math.min(dur * 0.85, opts?.attack ?? 0.005);
    const pMul = opts?.usePitch === false ? 1 : Math.pow(this.pitch, opts?.pitchPower ?? 1);

    const osc = this.ctx.createOscillator();
    osc.type = type;
    const f0 = safeFreq(startFreq * pMul, this.ctx);
    osc.frequency.setValueAtTime(f0, t0);
    if (endFreq !== null) {
      const f1 = safeFreq(endFreq * pMul, this.ctx);
      if (opts?.expFreq !== false && f0 > 0 && f1 > 0) {
        osc.frequency.exponentialRampToValueAtTime(f1, t1);
      } else {
        osc.frequency.linearRampToValueAtTime(f1, t1);
      }
    }
    if (opts?.detune) {
      osc.detune.setValueAtTime(opts.detune, t0);
    }

    const g = this.ctx.createGain();
    const peak = Math.max(0.0005, peakGain);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + Math.max(0.002, attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(g);
    g.connect(opts?.target ?? this.bus);

    osc.start(t0);
    osc.stop(t1 + 0.01);

    this.sources.push(osc);
    this.nodes.push(osc, g);
    if (t1 + 0.015 > this.maxEnd) this.maxEnd = t1 + 0.015;
    return osc;
  }

  noiseBurst(
    kind: 'white' | 'pink' | 'brown' | 'crackle',
    filterType: BiquadFilterType,
    startFreq: number,
    endFreq: number | null,
    q: number,
    startOffset: number,
    duration: number,
    peakGain: number,
    opts?: {
      attack?: number;
      target?: AudioNode;
      bufferOffset?: number;
      usePitch?: boolean;
      pitchPower?: number;
    },
  ): AudioBufferSourceNode {
    const t0 = this.now + Math.max(0, startOffset);
    const dur = Math.max(0.012, duration);
    const t1 = t0 + dur;
    const attack = Math.min(dur * 0.85, opts?.attack ?? 0.004);
    const pMul = opts?.usePitch === false ? 1 : Math.pow(this.pitch, opts?.pitchPower ?? 0.4);

    const buf = this.sc.noise[kind];
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    const f0 = safeFreq(startFreq * pMul, this.ctx);
    filter.frequency.setValueAtTime(f0, t0);
    filter.Q.setValueAtTime(clamp(q, 0.2, 24), t0);
    if (endFreq !== null) {
      const f1 = safeFreq(endFreq * pMul, this.ctx);
      filter.frequency.exponentialRampToValueAtTime(f1, t1);
    }

    const g = this.ctx.createGain();
    const peak = Math.max(0.0005, peakGain);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + Math.max(0.002, attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t1);

    src.connect(filter);
    filter.connect(g);
    g.connect(opts?.target ?? this.bus);

    const offset = opts?.bufferOffset ?? ((this.sc.voiceId * 0.371) % Math.max(0.2, buf.duration - 0.1));
    src.start(t0, offset, dur + 0.02);

    this.sources.push(src);
    this.nodes.push(src, filter, g);
    if (t1 + 0.02 > this.maxEnd) this.maxEnd = t1 + 0.02;
    return src;
  }

  fmBell(
    carrierFreq: number,
    modRatio: number,
    modDepth: number,
    startOffset: number,
    duration: number,
    peakGain: number,
    opts?: {
      attack?: number;
      target?: AudioNode;
      pitchPower?: number;
      carrierEndFreq?: number;
    },
  ): void {
    const t0 = this.now + Math.max(0, startOffset);
    const dur = Math.max(0.02, duration);
    const t1 = t0 + dur;
    const attack = Math.min(dur * 0.35, opts?.attack ?? 0.004);
    const pMul = Math.pow(this.pitch, opts?.pitchPower ?? 0.85);

    const cFreq = safeFreq(carrierFreq * pMul, this.ctx);
    const mFreq = safeFreq(cFreq * modRatio, this.ctx);

    const carrier = this.ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(cFreq, t0);
    if (opts?.carrierEndFreq !== undefined) {
      carrier.frequency.exponentialRampToValueAtTime(safeFreq(opts.carrierEndFreq * pMul, this.ctx), t1);
    }

    const mod = this.ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.setValueAtTime(mFreq, t0);

    const modGain = this.ctx.createGain();
    modGain.gain.setValueAtTime(Math.max(1, modDepth * pMul), t0);
    modGain.gain.exponentialRampToValueAtTime(0.5, t1);

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.linearRampToValueAtTime(Math.max(0.0005, peakGain), t0 + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t1);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(amp);
    amp.connect(opts?.target ?? this.bus);

    carrier.start(t0);
    mod.start(t0);
    carrier.stop(t1 + 0.015);
    mod.stop(t1 + 0.015);

    this.sources.push(carrier, mod);
    this.nodes.push(carrier, mod, modGain, amp);
    if (t1 + 0.02 > this.maxEnd) this.maxEnd = t1 + 0.02;
  }

  finish(): ActiveVoice {
    const cleanup = () => {
      for (const n of this.nodes) {
        try {
          n.disconnect();
        } catch {
          // ignore already-disconnected nodes
        }
      }
    };

    // Disconnect automatically when the last scheduled source completes
    const lastSrc = this.sources[this.sources.length - 1];
    if (lastSrc) {
      lastSrc.onended = () => {
        if (!this.stopped) {
          this.stopped = true;
          cleanup();
        }
      };
    }

    return {
      id: this.sc.voiceId,
      key: this.sc.key,
      startedAt: this.now,
      endsAt: this.maxEnd,
      stop: (fadeOutSec = 0.015) => {
        if (this.stopped) return;
        this.stopped = true;
        const t = this.ctx.currentTime;
        const fade = Math.max(0.004, fadeOutSec);
        try {
          this.bus.gain.cancelScheduledValues(t);
          this.bus.gain.setValueAtTime(Math.max(0.0001, this.bus.gain.value), t);
          this.bus.gain.linearRampToValueAtTime(0.0001, t + fade);
        } catch {
          // ignore scheduling errors on closing contexts
        }
        for (const s of this.sources) {
          try {
            s.stop(t + fade + 0.005);
          } catch {
            // ignore already-stopped sources
          }
        }
        // Schedule disconnect shortly after fade
        const last = this.sources[this.sources.length - 1];
        if (last) {
          last.onended = cleanup;
        } else {
          cleanup();
        }
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Reusable Family Builders (each key gets distinct pitch, timbre & contour)
// ---------------------------------------------------------------------------

function buildCoin(sc: SynthPlayContext, baseHz: number, bounceDelay: number, shimmerHz: number): ActiveVoice {
  const vb = new VoiceBuilder(sc);
  // Primary crisp metallic coin strike
  vb.fmBell(baseHz, 2.756, baseHz * 1.15, 0, 0.24, 0.26, { attack: 0.002, pitchPower: 0.85 });
  vb.osc('sine', baseHz * 2.01, baseHz * 1.99, 0, 0.16, 0.12, { attack: 0.002, pitchPower: 0.85 });
  vb.noiseBurst('white', 'bandpass', 5800, 3200, 3.5, 0, 0.018, 0.16, { attack: 0.001 });
  // Subtle secondary metallic bounce
  vb.fmBell(shimmerHz, 2.756, shimmerHz * 0.75, bounceDelay, 0.2, 0.14, { attack: 0.002, pitchPower: 0.85 });
  return vb.finish();
}

function buildCrumple(
  sc: SynthPlayContext,
  centerHz: number,
  duration: number,
  bursts: number,
  magicChord?: number[],
): ActiveVoice {
  const vb = new VoiceBuilder(sc);
  const step = duration / bursts;
  for (let i = 0; i < bursts; i++) {
    const offset = i * step * 0.72;
    const fStart = centerHz * (0.82 + ((i * 37) % 10) * 0.06);
    const fEnd = fStart * (i % 2 === 0 ? 1.45 : 0.72);
    vb.noiseBurst('pink', 'bandpass', fStart, fEnd, 2.4 + (i % 3) * 0.7, offset, step * 1.15, 0.22 - i * 0.015, {
      attack: 0.004,
      bufferOffset: (i * 0.29 + centerHz * 0.001) % 2.2,
    });
    vb.noiseBurst('white', 'highpass', 3200 + i * 260, 4800, 1.0, offset + 0.005, step * 0.55, 0.08, {
      attack: 0.002,
      bufferOffset: (i * 0.19) % 1.6,
    });
  }
  if (magicChord) {
    magicChord.forEach((hz, idx) => {
      vb.fmBell(hz, 2.0, hz * 0.45, 0.02 + idx * 0.032, 0.34, 0.11, { attack: 0.006, pitchPower: 0.8 });
    });
  }
  return vb.finish();
}

function buildGlass(sc: SynthPlayContext, seedIdx: number): ActiveVoice {
  const vb = new VoiceBuilder(sc);
  // Crisp impact fracture transient
  vb.noiseBurst('white', 'highpass', 3400 + seedIdx * 240, 6200, 1.2, 0, 0.055, 0.28, { attack: 0.001 });
  vb.noiseBurst('pink', 'bandpass', 2100 + seedIdx * 180, 1100, 3.2, 0.004, 0.12, 0.18, { attack: 0.002 });
  // Cascading crystalline glass shards
  const shardBase = 2150 + seedIdx * 290;
  const ratios = [1.0, 1.37, 1.79, 2.23, 2.71, 3.19];
  for (let i = 0; i < ratios.length; i++) {
    const delay = i === 0 ? 0 : 0.012 + ((seedIdx * 7 + i * 13) % 11) * 0.016;
    const freq = shardBase * ratios[i] * (0.94 + ((seedIdx + i) % 4) * 0.04);
    const dur = 0.07 + ((i * 5 + seedIdx) % 4) * 0.045;
    vb.osc('sine', freq, freq * 0.985, delay, dur, 0.11 / (1 + i * 0.18), {
      attack: 0.0015,
      pitchPower: 0.65,
    });
  }
  return vb.finish();
}

function buildVoiceBlip(
  sc: SynthPlayContext,
  baseHz: number,
  endHz: number,
  f1: number,
  f2: number,
  dur: number,
  wave: OscillatorType,
): ActiveVoice {
  const vb = new VoiceBuilder(sc);
  const pMul = Math.pow(vb.pitch, 0.8);
  const t0 = vb.now;
  const t1 = t0 + dur;

  const osc = vb.ctx.createOscillator();
  osc.type = wave;
  osc.frequency.setValueAtTime(safeFreq(baseHz * pMul, vb.ctx), t0);
  osc.frequency.exponentialRampToValueAtTime(safeFreq(endHz * pMul, vb.ctx), t1);

  // Subtle vibrato warmth
  const vib = vb.ctx.createOscillator();
  vib.type = 'sine';
  vib.frequency.setValueAtTime(14, t0);
  const vibGain = vb.ctx.createGain();
  vibGain.gain.setValueAtTime(baseHz * 0.03, t0);
  vib.connect(vibGain);
  vibGain.connect(osc.frequency);

  // Dual parallel vowel formant bandpass filters
  const flt1 = vb.ctx.createBiquadFilter();
  flt1.type = 'bandpass';
  flt1.frequency.setValueAtTime(safeFreq(f1 * Math.pow(vb.pitch, 0.35), vb.ctx), t0);
  flt1.Q.setValueAtTime(5.2, t0);

  const flt2 = vb.ctx.createBiquadFilter();
  flt2.type = 'bandpass';
  flt2.frequency.setValueAtTime(safeFreq(f2 * Math.pow(vb.pitch, 0.35), vb.ctx), t0);
  flt2.Q.setValueAtTime(6.5, t0);

  const env = vb.ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(0.32, t0 + Math.min(0.014, dur * 0.2));
  env.gain.setValueAtTime(0.26, t0 + dur * 0.65);
  env.gain.exponentialRampToValueAtTime(0.0001, t1);

  osc.connect(flt1);
  osc.connect(flt2);
  flt1.connect(env);
  flt2.connect(env);
  env.connect(vb.bus);

  osc.start(t0);
  vib.start(t0);
  osc.stop(t1 + 0.01);
  vib.stop(t1 + 0.01);

  vb.trackSource(osc, t1 + 0.015);
  vb.trackSource(vib, t1 + 0.015);
  vb.trackNode(vibGain);
  vb.trackNode(flt1);
  vb.trackNode(flt2);
  vb.trackNode(env);

  // Light breathy consonant attack
  vb.noiseBurst('pink', 'bandpass', f2, f1, 2.5, 0, 0.025, 0.07, { attack: 0.002 });
  return vb.finish();
}

function buildFilteredChordStab(
  sc: SynthPlayContext,
  freqs: number[],
  wave: OscillatorType,
  cutStart: number,
  cutEnd: number,
  dur: number,
  gain: number,
  attack = 0.012,
): ActiveVoice {
  const vb = new VoiceBuilder(sc);
  const t0 = vb.now;
  const t1 = t0 + dur;

  const filter = vb.trackNode(vb.ctx.createBiquadFilter());
  filter.type = 'lowpass';
  filter.Q.setValueAtTime(2.2, t0);
  filter.frequency.setValueAtTime(safeFreq(cutStart * Math.pow(vb.pitch, 0.5), vb.ctx), t0);
  filter.frequency.exponentialRampToValueAtTime(safeFreq(cutEnd * Math.pow(vb.pitch, 0.5), vb.ctx), t1);
  filter.connect(vb.bus);

  const perNoteGain = gain / Math.max(1, Math.sqrt(freqs.length));
  for (let i = 0; i < freqs.length; i++) {
    vb.osc(wave, freqs[i], null, 0, dur, perNoteGain, {
      attack,
      target: filter,
      detune: (i % 2 === 0 ? 1 : -1) * 5,
      pitchPower: 0.85,
    });
  }
  return vb.finish();
}

// ---------------------------------------------------------------------------
// Exhaustive 80-Key Procedural Synthesis Table
// ---------------------------------------------------------------------------

export const SYNTH_HANDLERS: Record<SoundKey, SynthHandler> = {
  // === Ambient One-Shots (4) ===
  ambientFire1: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.noiseBurst('brown', 'lowpass', 240, 120, 1.6, 0, 0.85, 0.34, { attack: 0.12 });
    vb.noiseBurst('crackle', 'bandpass', 1500, 1900, 1.4, 0.05, 0.72, 0.14, { attack: 0.08 });
    return vb.finish();
  },
  ambientFire2: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.noiseBurst('crackle', 'bandpass', 1900, 2900, 1.5, 0, 0.88, 0.24, { attack: 0.08 });
    vb.noiseBurst('pink', 'lowpass', 420, 260, 1.2, 0, 0.85, 0.22, { attack: 0.1 });
    return vb.finish();
  },
  ambientFire3: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.noiseBurst('brown', 'lowpass', 460, 180, 2.2, 0, 1.05, 0.42, { attack: 0.12 });
    vb.noiseBurst('crackle', 'highpass', 1200, 2600, 1.1, 0, 0.98, 0.26, { attack: 0.06 });
    vb.osc('sine', 78, 54, 0, 0.75, 0.14, { attack: 0.1 });
    return vb.finish();
  },
  ambientOrgan1: (sc) => {
    const vb = new VoiceBuilder(sc);
    const filter = vb.trackNode(vb.ctx.createBiquadFilter());
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(980, vb.now);
    filter.Q.setValueAtTime(1.4, vb.now);
    filter.connect(vb.bus);
    const notes = [146.83, 220.0, 261.63, 349.23, 440.0]; // Dm7 warm drawbars
    notes.forEach((hz, i) => {
      vb.osc(i % 2 === 0 ? 'triangle' : 'sine', hz, null, 0, 1.25, 0.11, {
        attack: 0.18,
        target: filter,
        detune: (i - 2) * 3,
        pitchPower: 0.85,
      });
    });
    return vb.finish();
  },

  // === UI Controls (4) ===
  button: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.osc('triangle', 540, 195, 0, 0.042, 0.28, { attack: 0.002, pitchPower: 0.7 });
    vb.osc('sine', 1080, 760, 0, 0.025, 0.12, { attack: 0.001, pitchPower: 0.7 });
    vb.noiseBurst('white', 'bandpass', 3200, 1800, 2.8, 0, 0.016, 0.18, { attack: 0.001 });
    return vb.finish();
  },
  cancel: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.osc('triangle', 340, 210, 0, 0.055, 0.25, { attack: 0.003, pitchPower: 0.75 });
    vb.osc('sine', 235, 145, 0.032, 0.075, 0.2, { attack: 0.003, pitchPower: 0.75 });
    vb.noiseBurst('pink', 'bandpass', 1400, 700, 1.8, 0, 0.03, 0.1, { attack: 0.002 });
    return vb.finish();
  },
  highlight1: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.osc('sine', 1180, 980, 0, 0.028, 0.16, { attack: 0.0015, pitchPower: 0.75 });
    vb.noiseBurst('white', 'highpass', 4400, 5200, 1.2, 0, 0.012, 0.07, { attack: 0.001 });
    return vb.finish();
  },
  highlight2: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.osc('sine', 1420, 1260, 0, 0.032, 0.15, { attack: 0.0015, pitchPower: 0.75 });
    vb.osc('triangle', 2130, 1920, 0.004, 0.024, 0.08, { attack: 0.0015, pitchPower: 0.75 });
    return vb.finish();
  },

  // === Card Handling & Paper (6) ===
  card1: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.noiseBurst('pink', 'bandpass', 1900, 3600, 2.1, 0, 0.058, 0.3, { attack: 0.002 });
    vb.noiseBurst('white', 'highpass', 3800, 2400, 1.2, 0, 0.022, 0.14, { attack: 0.001 });
    vb.osc('triangle', 245, 115, 0, 0.036, 0.2, { attack: 0.002, pitchPower: 0.6 });
    return vb.finish();
  },
  card3: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.noiseBurst('pink', 'bandpass', 1500, 2700, 1.8, 0, 0.072, 0.28, { attack: 0.003 });
    vb.osc('sine', 180, 82, 0, 0.052, 0.24, { attack: 0.002, pitchPower: 0.55 });
    return vb.finish();
  },
  cardFan2: (sc) => {
    const vb = new VoiceBuilder(sc);
    for (let i = 0; i < 6; i++) {
      const t = i * 0.022;
      const cf = 1450 + i * 310;
      vb.noiseBurst('pink', 'bandpass', cf, cf * 1.35, 2.4, t, 0.042, 0.22 - i * 0.015, {
        attack: 0.002,
        bufferOffset: (i * 0.21) % 2.0,
      });
      vb.osc('triangle', 220 + i * 35, 120 + i * 18, t, 0.024, 0.09, { attack: 0.002, pitchPower: 0.6 });
    }
    return vb.finish();
  },
  cardSlide1: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.noiseBurst('pink', 'bandpass', 720, 2350, 2.0, 0, 0.135, 0.26, { attack: 0.016 });
    vb.noiseBurst('white', 'bandpass', 3400, 1800, 2.8, 0.02, 0.085, 0.09, { attack: 0.01 });
    return vb.finish();
  },
  cardSlide2: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.noiseBurst('pink', 'bandpass', 2400, 780, 2.1, 0, 0.115, 0.26, { attack: 0.01 });
    vb.osc('sine', 290, 160, 0.01, 0.045, 0.09, { attack: 0.004, pitchPower: 0.6 });
    return vb.finish();
  },
  paper1: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.noiseBurst('pink', 'bandpass', 1450, 2600, 2.2, 0, 0.14, 0.22, { attack: 0.012 });
    vb.noiseBurst('white', 'bandpass', 3900, 2700, 2.6, 0.025, 0.11, 0.11, { attack: 0.008 });
    return vb.finish();
  },

  // === Scoring Signatures — Chips & Mult (4) ===
  chips1: (sc) => {
    const vb = new VoiceBuilder(sc);
    // Crisp clay casino chip clack transient
    vb.noiseBurst('white', 'bandpass', 3100, 4600, 4.2, 0, 0.018, 0.24, { attack: 0.001, pitchPower: 0.45 });
    vb.noiseBurst('pink', 'bandpass', 1850, 1300, 3.0, 0, 0.026, 0.16, { attack: 0.001, pitchPower: 0.45 });
    // Signature pitched woody marimba ping (scales cleanly across low-to-high combo pitches!)
    const base = 760;
    vb.osc('sine', base, base * 0.992, 0, 0.115, 0.34, { attack: 0.002, pitchPower: 0.95 });
    vb.osc('triangle', base * 2.0, base * 1.98, 0, 0.06, 0.13, { attack: 0.0015, pitchPower: 0.95 });
    vb.osc('sine', base * 3.96, base * 3.9, 0, 0.028, 0.07, { attack: 0.001, pitchPower: 0.85 });
    return vb.finish();
  },
  chips2: (sc) => {
    const vb = new VoiceBuilder(sc);
    // Bright double-clack casino chip stack + high marimba sparkle
    vb.noiseBurst('white', 'bandpass', 3600, 5200, 4.5, 0, 0.016, 0.22, { attack: 0.001, pitchPower: 0.45 });
    vb.noiseBurst('white', 'bandpass', 4100, 5600, 4.8, 0.022, 0.016, 0.16, { attack: 0.001, pitchPower: 0.45 });
    const base = 920;
    vb.osc('sine', base, base * 0.995, 0, 0.12, 0.32, { attack: 0.002, pitchPower: 0.95 });
    vb.osc('triangle', base * 1.5, base * 1.49, 0.02, 0.095, 0.16, { attack: 0.002, pitchPower: 0.95 });
    return vb.finish();
  },
  multhit1: (sc) => {
    const vb = new VoiceBuilder(sc);
    // Punchy +Mult: warm tight bass kick + snappy saturated chord hit
    const subPitch = Math.max(0.65, Math.pow(vb.pitch, 0.5));
    vb.osc('sine', 165 * subPitch, 62 * subPitch, 0, 0.14, 0.36, { attack: 0.002, usePitch: false });
    vb.noiseBurst('white', 'bandpass', 2400, 1200, 2.2, 0, 0.024, 0.18, { attack: 0.001 });

    const flt = vb.trackNode(vb.ctx.createBiquadFilter());
    flt.type = 'lowpass';
    flt.Q.setValueAtTime(2.6, vb.now);
    flt.frequency.setValueAtTime(safeFreq(3400 * Math.pow(vb.pitch, 0.5), vb.ctx), vb.now);
    flt.frequency.exponentialRampToValueAtTime(safeFreq(520 * Math.pow(vb.pitch, 0.4), vb.ctx), vb.now + 0.18);
    flt.connect(vb.bus);

    // Warm power triad (D4, A4, F#5)
    const chord = [293.66, 440.0, 587.33];
    chord.forEach((hz, i) => {
      vb.osc(i === 0 ? 'sawtooth' : 'triangle', hz, null, 0, 0.19, 0.18, {
        attack: 0.003,
        target: flt,
        detune: (i - 1) * 7,
        pitchPower: 0.85,
      });
    });
    return vb.finish();
  },
  multhit2: (sc) => {
    const vb = new VoiceBuilder(sc);
    // Dramatic XMult impact: deep resonant sub drop + triumphant FM brass-bell chord + shimmer
    const subPitch = Math.max(0.65, Math.pow(vb.pitch, 0.45));
    vb.osc('sine', 148 * subPitch, 44 * subPitch, 0, 0.34, 0.44, { attack: 0.003, usePitch: false });
    vb.osc('triangle', 98 * subPitch, 52 * subPitch, 0, 0.28, 0.22, { attack: 0.004, usePitch: false });
    vb.noiseBurst('pink', 'bandpass', 2800, 900, 1.8, 0, 0.045, 0.24, { attack: 0.001 });

    const flt = vb.trackNode(vb.ctx.createBiquadFilter());
    flt.type = 'lowpass';
    flt.Q.setValueAtTime(3.2, vb.now);
    flt.frequency.setValueAtTime(safeFreq(4600 * Math.pow(vb.pitch, 0.45), vb.ctx), vb.now);
    flt.frequency.exponentialRampToValueAtTime(safeFreq(680 * Math.pow(vb.pitch, 0.35), vb.ctx), vb.now + 0.38);
    flt.connect(vb.bus);

    // Rich resonant 9th power chord
    const chord = [220.0, 329.63, 440.0, 554.37, 659.25];
    chord.forEach((hz, i) => {
      vb.osc('sawtooth', hz, null, 0, 0.38, 0.13, {
        attack: 0.005,
        target: flt,
        detune: (i - 2) * 8,
        pitchPower: 0.82,
      });
    });
    // Crystalline resonance ring on top
    vb.fmBell(880, 2.0, 420, 0.008, 0.42, 0.15, { attack: 0.004, pitchPower: 0.82 });
    return vb.finish();
  },

  // === Coins (7 unique metallic intervals) ===
  coin1: (sc) => buildCoin(sc, 1318.5, 0.042, 1975.5), // E6 -> B6
  coin2: (sc) => buildCoin(sc, 1480.0, 0.04, 2217.5),  // F#6 -> C#7
  coin3: (sc) => buildCoin(sc, 1568.0, 0.045, 2349.3), // G6 -> D7
  coin4: (sc) => buildCoin(sc, 1760.0, 0.038, 2637.0), // A6 -> E7
  coin5: (sc) => buildCoin(sc, 1975.5, 0.044, 2960.0), // B6 -> F#7
  coin6: (sc) => buildCoin(sc, 2093.0, 0.036, 3136.0), // C7 -> G7
  coin7: (sc) => buildCoin(sc, 2349.3, 0.048, 3520.0), // D7 -> A7

  // === Crumples (7) ===
  crumple1: (sc) => buildCrumple(sc, 1350, 0.14, 3),
  crumple2: (sc) => buildCrumple(sc, 1680, 0.16, 4),
  crumple3: (sc) => buildCrumple(sc, 1180, 0.15, 3),
  crumple4: (sc) => buildCrumple(sc, 1950, 0.13, 4),
  crumple5: (sc) => buildCrumple(sc, 1520, 0.18, 5),
  crumpleLong1: (sc) => buildCrumple(sc, 1420, 0.38, 8),
  crumpleLong2: (sc) => buildCrumple(sc, 1760, 0.44, 9),

  // === Magic Crumples (3) ===
  magic_crumple: (sc) => buildCrumple(sc, 1650, 0.24, 5, [587.33, 880.0, 1046.5, 1318.5]),
  magic_crumple2: (sc) => buildCrumple(sc, 1850, 0.26, 5, [659.25, 987.77, 1174.66, 1568.0]),
  magic_crumple3: (sc) => buildCrumple(sc, 1500, 0.28, 6, [523.25, 783.99, 987.77, 1318.5]),

  // === Editions & Seals (6) ===
  foil1: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.fmBell(1046.5, 2.41, 950, 0, 0.34, 0.24, { attack: 0.003, pitchPower: 0.85 });
    vb.fmBell(1568.0, 3.12, 720, 0.018, 0.32, 0.15, { attack: 0.003, pitchPower: 0.85 });
    vb.noiseBurst('white', 'highpass', 4800, 7200, 1.5, 0, 0.08, 0.12, { attack: 0.004 });
    return vb.finish();
  },
  foil2: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.fmBell(1318.5, 2.41, 1100, 0, 0.32, 0.22, { attack: 0.003, pitchPower: 0.85 });
    vb.fmBell(1760.0, 2.85, 860, 0.032, 0.36, 0.18, { attack: 0.003, pitchPower: 0.85 });
    vb.noiseBurst('white', 'highpass', 5400, 7800, 1.6, 0.01, 0.09, 0.1, { attack: 0.004 });
    return vb.finish();
  },
  holo1: (sc) => {
    const vb = new VoiceBuilder(sc);
    // Chorused glassy chime dyad + ethereal shimmer
    const tones = [587.33, 880.0, 1108.73, 1318.51];
    tones.forEach((hz, idx) => {
      const delay = idx * 0.022;
      vb.osc('sine', hz, null, delay, 0.46, 0.13, { attack: 0.012, detune: -9, pitchPower: 0.85 });
      vb.osc('triangle', hz, null, delay, 0.44, 0.11, { attack: 0.014, detune: 9, pitchPower: 0.85 });
    });
    vb.noiseBurst('pink', 'bandpass', 3600, 6200, 3.8, 0, 0.24, 0.09, { attack: 0.03 });
    return vb.finish();
  },
  polychrome1: (sc) => {
    const vb = new VoiceBuilder(sc);
    // Ascending iridescent triad arpeggio with prism shimmer
    const notes = [523.25, 659.25, 783.99, 987.77, 1318.51, 1567.98];
    notes.forEach((hz, idx) => {
      const t = idx * 0.028;
      vb.fmBell(hz, 2.0, hz * 0.65, t, 0.38, 0.13, { attack: 0.005, pitchPower: 0.85 });
      vb.osc('triangle', hz * 1.005, null, t, 0.32, 0.08, { attack: 0.008, detune: 11, pitchPower: 0.85 });
    });
    vb.noiseBurst('white', 'bandpass', 2400, 7400, 4.5, 0, 0.34, 0.1, { attack: 0.04 });
    return vb.finish();
  },
  negative: (sc) => {
    const vb = new VoiceBuilder(sc);
    // Inverted sub-swell + eerie minor-2nd phase-flipping snap
    const t0 = vb.now;
    const swellDur = 0.36;
    const sub = vb.trackSource(vb.ctx.createOscillator(), t0 + swellDur + 0.11);
    sub.type = 'sine';
    sub.frequency.setValueAtTime(safeFreq(125 * Math.pow(vb.pitch, 0.5), vb.ctx), t0);
    sub.frequency.exponentialRampToValueAtTime(safeFreq(54 * Math.pow(vb.pitch, 0.5), vb.ctx), t0 + swellDur);

    const subGain = vb.trackNode(vb.ctx.createGain());
    subGain.gain.setValueAtTime(0.001, t0);
    subGain.gain.exponentialRampToValueAtTime(0.36, t0 + swellDur * 0.82);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t0 + swellDur + 0.08);
    sub.connect(subGain);
    subGain.connect(vb.bus);
    sub.start(t0);
    sub.stop(t0 + swellDur + 0.1);

    // Inverted shimmering tension tones peaking at the snap
    vb.osc('triangle', 466.16, 440.0, 0.02, 0.4, 0.14, { attack: 0.24, pitchPower: 0.8 });
    vb.osc('sine', 493.88, 523.25, 0.02, 0.4, 0.14, { attack: 0.24, pitchPower: 0.8 });
    vb.noiseBurst('pink', 'bandpass', 600, 3400, 3.2, 0, 0.36, 0.16, { attack: 0.26 });
    return vb.finish();
  },
  gold_seal: (sc) => {
    const vb = new VoiceBuilder(sc);
    // Golden harp glissando + shimmering coin-gold bell
    const notes = [587.33, 739.99, 880.0, 1174.66, 1479.98, 1760.0];
    notes.forEach((hz, i) => {
      const t = i * 0.028;
      vb.fmBell(hz, 2.5, hz * 0.55, t, 0.36, 0.14, { attack: 0.003, pitchPower: 0.85 });
      vb.osc('sine', hz * 2, null, t, 0.2, 0.06, { attack: 0.002, pitchPower: 0.85 });
    });
    return vb.finish();
  },

  // === Glass Shatter (6) ===
  glass1: (sc) => buildGlass(sc, 0),
  glass2: (sc) => buildGlass(sc, 1),
  glass3: (sc) => buildGlass(sc, 2),
  glass4: (sc) => buildGlass(sc, 3),
  glass5: (sc) => buildGlass(sc, 4),
  glass6: (sc) => buildGlass(sc, 5),

  // === Tarot, Intro, Drama, Explosions & Win (11) ===
  tarot1: (sc) => {
    const vb = new VoiceBuilder(sc);
    const notes = [440.0, 523.25, 659.25, 880.0];
    notes.forEach((hz, i) => {
      vb.fmBell(hz, 2.0, hz * 0.4, i * 0.038, 0.45, 0.15, { attack: 0.008, pitchPower: 0.85 });
    });
    vb.noiseBurst('pink', 'bandpass', 1800, 4200, 3.4, 0, 0.32, 0.11, { attack: 0.05 });
    return vb.finish();
  },
  tarot2: (sc) => {
    const vb = new VoiceBuilder(sc);
    const flt = vb.trackNode(vb.ctx.createBiquadFilter());
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(520, vb.now);
    flt.frequency.exponentialRampToValueAtTime(2800, vb.now + 0.22);
    flt.frequency.exponentialRampToValueAtTime(680, vb.now + 0.56);
    flt.Q.setValueAtTime(2.6, vb.now);
    flt.connect(vb.bus);
    [293.66, 440.0, 523.25, 698.46].forEach((hz, i) => {
      vb.osc('triangle', hz, null, i * 0.025, 0.52, 0.14, { attack: 0.03, target: flt, pitchPower: 0.85 });
    });
    vb.fmBell(1174.66, 2.5, 420, 0.09, 0.42, 0.12, { attack: 0.01, pitchPower: 0.85 });
    return vb.finish();
  },
  introPad1: (sc) => {
    const vb = new VoiceBuilder(sc);
    const flt = vb.trackNode(vb.ctx.createBiquadFilter());
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(280, vb.now);
    flt.frequency.exponentialRampToValueAtTime(1900, vb.now + 0.9);
    flt.frequency.exponentialRampToValueAtTime(720, vb.now + 1.55);
    flt.Q.setValueAtTime(2.0, vb.now);
    flt.connect(vb.bus);
    [146.83, 220.0, 261.63, 329.63, 349.23, 523.25].forEach((hz, i) => {
      vb.osc(i < 2 ? 'sawtooth' : 'triangle', hz, null, 0, 1.55, 0.1, {
        attack: 0.28,
        target: flt,
        detune: (i - 2.5) * 6,
        pitchPower: 0.85,
      });
    });
    return vb.finish();
  },
  splash_buildup: (sc) => {
    const vb = new VoiceBuilder(sc);
    const flt = vb.trackNode(vb.ctx.createBiquadFilter());
    flt.type = 'bandpass';
    flt.Q.setValueAtTime(3.0, vb.now);
    flt.frequency.setValueAtTime(220, vb.now);
    flt.frequency.exponentialRampToValueAtTime(2600, vb.now + 0.56);
    flt.connect(vb.bus);
    vb.osc('sawtooth', 146.83, 293.66, 0, 0.58, 0.18, { attack: 0.24, target: flt, pitchPower: 0.8 });
    vb.osc('sawtooth', 220.0, 440.0, 0, 0.58, 0.16, { attack: 0.24, target: flt, detune: 8, pitchPower: 0.8 });
    vb.noiseBurst('pink', 'bandpass', 400, 3800, 2.2, 0, 0.56, 0.18, { attack: 0.3 });
    return vb.finish();
  },
  explosion1: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.osc('sine', 140, 32, 0, 0.42, 0.45, { attack: 0.003, pitchPower: 0.45 });
    vb.osc('sawtooth', 95, 28, 0, 0.28, 0.18, { attack: 0.004, pitchPower: 0.45 });
    vb.noiseBurst('brown', 'lowpass', 1400, 140, 1.4, 0, 0.52, 0.44, { attack: 0.004 });
    vb.noiseBurst('crackle', 'bandpass', 2200, 650, 1.2, 0.015, 0.45, 0.22, { attack: 0.006 });
    return vb.finish();
  },
  explosion_buildup1: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.osc('sawtooth', 110, 680, 0, 0.62, 0.16, { attack: 0.32, pitchPower: 0.7 });
    vb.osc('sine', 55, 220, 0, 0.62, 0.22, { attack: 0.28, pitchPower: 0.6 });
    vb.noiseBurst('pink', 'bandpass', 320, 3400, 2.8, 0, 0.62, 0.24, { attack: 0.36 });
    return vb.finish();
  },
  explosion_release1: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.osc('sine', 165, 30, 0, 0.58, 0.48, { attack: 0.002, pitchPower: 0.45 });
    vb.noiseBurst('brown', 'lowpass', 2200, 120, 1.5, 0, 0.66, 0.46, { attack: 0.003 });
    vb.fmBell(293.66, 1.73, 420, 0.01, 0.54, 0.18, { attack: 0.004, pitchPower: 0.75 });
    return vb.finish();
  },
  gong: (sc) => {
    const vb = new VoiceBuilder(sc);
    // Ceremonial bronze gong with rich inharmonic FM shimmer
    vb.fmBell(138.6, 1.47, 290, 0, 1.25, 0.3, { attack: 0.008, pitchPower: 0.75 });
    vb.fmBell(211.4, 2.13, 360, 0.01, 1.15, 0.2, { attack: 0.012, pitchPower: 0.75 });
    vb.osc('sine', 92.5, 89.0, 0, 1.3, 0.24, { attack: 0.015, pitchPower: 0.75 });
    vb.noiseBurst('pink', 'bandpass', 900, 420, 1.8, 0, 0.25, 0.16, { attack: 0.005 });
    return vb.finish();
  },
  timpani: (sc) => {
    const vb = new VoiceBuilder(sc);
    // Orchestral kettledrum pitch bend + felt mallet strike
    vb.osc('sine', 158, 92, 0, 0.46, 0.42, { attack: 0.003, pitchPower: 0.7 });
    vb.osc('triangle', 238, 138, 0, 0.28, 0.18, { attack: 0.003, pitchPower: 0.7 });
    vb.noiseBurst('brown', 'lowpass', 520, 180, 1.5, 0, 0.09, 0.26, { attack: 0.002 });
    return vb.finish();
  },
  slice1: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.noiseBurst('white', 'bandpass', 6400, 1500, 3.6, 0, 0.13, 0.3, { attack: 0.003 });
    vb.osc('sawtooth', 3200, 1650, 0, 0.09, 0.11, { attack: 0.002, pitchPower: 0.7 });
    vb.fmBell(2200, 1.9, 900, 0.01, 0.14, 0.12, { attack: 0.002, carrierEndFreq: 1480, pitchPower: 0.7 });
    return vb.finish();
  },
  win: (sc) => {
    const vb = new VoiceBuilder(sc);
    // Triumphant warm casino-jazz victory fanfare (Dm9 -> G13 -> Cmaj9 flourish)
    const arpeggio = [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98];
    arpeggio.forEach((hz, i) => {
      const t = i * 0.055;
      vb.fmBell(hz, 2.0, hz * 0.55, t, 0.52, 0.15, { attack: 0.006, pitchPower: 0.85 });
      vb.osc('triangle', hz, null, t, 0.46, 0.1, { attack: 0.008, detune: 5, pitchPower: 0.85 });
    });
    // Warm grounding bass foundation
    vb.osc('triangle', 130.81, null, 0, 0.85, 0.24, { attack: 0.02, pitchPower: 0.85 });
    vb.osc('sine', 261.63, null, 0.16, 0.75, 0.18, { attack: 0.02, pitchPower: 0.85 });
    return vb.finish();
  },

  // === Whooshes (4) ===
  whoosh: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.noiseBurst('pink', 'bandpass', 280, 1850, 2.0, 0, 0.13, 0.26, { attack: 0.04 });
    vb.noiseBurst('pink', 'bandpass', 1850, 320, 1.8, 0.09, 0.16, 0.24, { attack: 0.02 });
    return vb.finish();
  },
  whoosh1: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.noiseBurst('pink', 'bandpass', 380, 2700, 2.2, 0, 0.18, 0.28, { attack: 0.022 });
    vb.noiseBurst('white', 'highpass', 2800, 4800, 1.2, 0.02, 0.11, 0.09, { attack: 0.015 });
    return vb.finish();
  },
  whoosh2: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.noiseBurst('pink', 'bandpass', 1450, 240, 1.9, 0, 0.24, 0.3, { attack: 0.018 });
    vb.noiseBurst('brown', 'lowpass', 480, 140, 1.3, 0.02, 0.2, 0.16, { attack: 0.02 });
    return vb.finish();
  },
  whoosh_long: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.noiseBurst('pink', 'bandpass', 200, 2400, 2.1, 0, 0.28, 0.26, { attack: 0.1 });
    vb.noiseBurst('pink', 'bandpass', 2400, 240, 1.9, 0.22, 0.32, 0.26, { attack: 0.04 });
    return vb.finish();
  },

  // === Generic & Misc Utility (2) ===
  generic1: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.osc('triangle', 460, 280, 0, 0.075, 0.24, { attack: 0.003, pitchPower: 0.75 });
    vb.osc('sine', 690, 480, 0, 0.045, 0.12, { attack: 0.002, pitchPower: 0.75 });
    return vb.finish();
  },
  other1: (sc) => {
    const vb = new VoiceBuilder(sc);
    vb.osc('triangle', 523.25, 587.33, 0, 0.055, 0.2, { attack: 0.003, pitchPower: 0.8 });
    vb.osc('sine', 659.25, 783.99, 0.04, 0.075, 0.18, { attack: 0.003, pitchPower: 0.8 });
    return vb.finish();
  },

  // === Mascot / Character Expressive Formant Voices (11) ===
  voice1: (sc) => buildVoiceBlip(sc, 210, 265, 680, 1180, 0.095, 'sawtooth'),  // bright "ah" up
  voice2: (sc) => buildVoiceBlip(sc, 245, 215, 520, 1850, 0.088, 'sawtooth'),  // playful "eh" dip
  voice3: (sc) => buildVoiceBlip(sc, 185, 230, 440, 920, 0.105, 'sawtooth'),   // warm "oh" rise
  voice4: (sc) => buildVoiceBlip(sc, 275, 330, 320, 2250, 0.082, 'triangle'),  // cheeky "ee" chirp
  voice5: (sc) => buildVoiceBlip(sc, 195, 165, 360, 820, 0.11, 'sawtooth'),    // gravelly "oo" fall
  voice6: (sc) => buildVoiceBlip(sc, 260, 290, 620, 1520, 0.09, 'sawtooth'),   // crisp "uh" bounce
  voice7: (sc) => buildVoiceBlip(sc, 230, 285, 720, 1280, 0.085, 'square'),    // nasal "aa" quip
  voice8: (sc) => buildVoiceBlip(sc, 305, 255, 480, 2050, 0.092, 'sawtooth'),  // perky "ih" drop
  voice9: (sc) => buildVoiceBlip(sc, 172, 205, 540, 1040, 0.115, 'sawtooth'),  // deep "aw" chuckle
  voice10: (sc) => buildVoiceBlip(sc, 290, 355, 420, 1920, 0.085, 'triangle'), // excited "ey" lift
  voice11: (sc) => buildVoiceBlip(sc, 225, 190, 600, 1360, 0.105, 'sawtooth'), // wry "eh" cadence

  // === Music Track One-Shot Stings (5 — completes exhaustive 80/80 coverage) ===
  music1: (sc) => buildFilteredChordStab(sc, [146.83, 220.0, 261.63, 329.63, 349.23], 'triangle', 1800, 520, 0.72, 0.24, 0.02),
  music2: (sc) => {
    const vb = new VoiceBuilder(sc);
    [293.66, 349.23, 440.0, 523.25, 659.25].forEach((hz, i) => {
      vb.fmBell(hz, 2.0, hz * 0.35, i * 0.055, 0.55, 0.13, { attack: 0.008, pitchPower: 0.85 });
    });
    return vb.finish();
  },
  music3: (sc) => buildFilteredChordStab(sc, [293.66, 440.0, 659.25, 880.0], 'sine', 2400, 900, 0.9, 0.22, 0.14),
  music4: (sc) => buildFilteredChordStab(sc, [146.83, 293.66, 349.23, 440.0, 523.25], 'sawtooth', 2600, 640, 0.36, 0.2, 0.006),
  music5: (sc) => buildFilteredChordStab(sc, [110.0, 146.83, 220.0, 277.18, 329.63], 'sawtooth', 2200, 420, 0.52, 0.26, 0.008),
};

export class SynthBank {
  readonly noise: NoiseLibrary;
  private nextVoiceId = 1;

  constructor(private readonly ctx: AudioContext, noise?: NoiseLibrary) {
    this.noise = noise ?? createNoiseLibrary(ctx);
  }

  getNoise(): NoiseLibrary {
    return this.noise;
  }

  play(
    key: SoundKey,
    destination: AudioNode,
    opts?: { pitch?: number; volume?: number },
    voiceId?: number,
  ): ActiveVoice {
    const id = voiceId ?? this.nextVoiceId++;
    const handler = SYNTH_HANDLERS[key];
    return handler({
      ctx: this.ctx,
      destination,
      noise: this.noise,
      now: this.ctx.currentTime,
      pitch: opts?.pitch ?? 1,
      volume: opts?.volume ?? 1,
      voiceId: id,
      key,
    });
  }
}
