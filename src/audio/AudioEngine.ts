import {
  DEFAULT_SETTINGS,
  MUSIC_TRACK_IDS,
  type IAudioEngine,
  type MusicTrackId,
  type RenderSettings,
  type SoundKey,
} from '../contracts/index.ts';
import { MusicSequencer } from './MusicSequencer.ts';
import { createNoiseLibrary, SynthBank, type ActiveVoice, type NoiseLibrary } from './SynthBank.ts';

// ============================================================================
// Krunked Cards — Dual-Mode Web Audio Engine (src/audio/AudioEngine.ts)
// Supports Built-In Procedural DSP and Lazy-Decoded Custom Pack Mode with
// sample-locked 5-track crossfade, ambient fire loop, 16-voice polyphony cap,
// and master limiter.
// ============================================================================

export const MAX_SFX_VOICES = 16 as const;

const PRELOAD_CORE_SFX: readonly SoundKey[] = [
  'button',
  'card1',
  'chips1',
  'chips2',
  'multhit1',
  'multhit2',
  'coin1',
  'highlight1',
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function getAudioContextCtor(): (new () => AudioContext) | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as unknown as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

interface CustomStemChannel {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

interface CustomFireChannel {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class AudioEngine implements IAudioEngine {
  private ctx: AudioContext | null = null;
  private noise: NoiseLibrary | null = null;
  private synth: SynthBank | null = null;
  private sequencer: MusicSequencer | null = null;

  // Master mixer graph
  private limiter: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Settings & logical state (works cleanly even before AudioContext unlock / in headless tests)
  private masterVolume = DEFAULT_SETTINGS.masterVolume;
  private musicVolume = DEFAULT_SETTINGS.musicVolume;
  private sfxVolume = DEFAULT_SETTINGS.sfxVolume;
  private activeTrack: MusicTrackId = 'music1';
  private musicIntensity = 0.5;
  private targetFireIntensity = 0;
  private currentFireIntensity = 0;
  private mode: 'builtin' | 'custom' = 'builtin';
  private disposed = false;
  private unlockInFlight = false;
  private suspendedManually = false;
  private autoSuspended = false;
  private hasUnlockedOnce = false;
  private visibilityHandler: (() => void) | null = null;

  // Polyphony tracker (unified across procedural & custom SFX voices)
  private readonly activeVoices: ActiveVoice[] = [];
  private nextVoiceId = 1;

  // Custom Pack state
  private customUrls: Record<SoundKey, string> | null = null;
  private packGeneration = 0;
  private readonly bufferCache = new Map<string, AudioBuffer>();
  private readonly inFlightLoads = new Map<string, Promise<AudioBuffer | null>>();
  private readonly failedUrls = new Set<string>();

  // Custom sample-locked 5-stem music playback
  private customMusicBus: GainNode | null = null;
  private customMusicLevels: Record<MusicTrackId, number> = {
    music1: 1,
    music2: 0,
    music3: 0,
    music4: 0,
    music5: 0,
  };
  private customStems: Partial<Record<MusicTrackId, CustomStemChannel>> = {};
  private customMusicActive = false;

  // Custom looping ambientFire1 / ambientFire2
  private customFire1: CustomFireChannel | null = null;
  private customFire2: CustomFireChannel | null = null;
  private customFireActive = false;

  constructor() {
    // Mobile Safari / Chrome lifecycle: safely pause when backgrounded & resume on return
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      this.visibilityHandler = () => this.handleVisibilityChange();
      try {
        document.addEventListener('visibilitychange', this.visibilityHandler);
      } catch {
        this.visibilityHandler = null;
      }
    }
  }

  private ensureGraph(): boolean {
    if (this.disposed) return false;
    if (this.ctx) return true;

    const Ctor = getAudioContextCtor();
    if (!Ctor) return false;

    try {
      const ctx = new Ctor();
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 10;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.1;
      limiter.connect(ctx.destination);

      const masterGain = ctx.createGain();
      masterGain.gain.value = clamp(this.masterVolume, 0, 1);
      masterGain.connect(limiter);

      const musicGain = ctx.createGain();
      musicGain.gain.value = clamp(this.musicVolume, 0, 1) * 0.48;
      musicGain.connect(masterGain);

      const sfxGain = ctx.createGain();
      sfxGain.gain.value = clamp(this.sfxVolume, 0, 1) * 0.85;
      sfxGain.connect(masterGain);

      const customMusicBus = ctx.createGain();
      customMusicBus.gain.value = 0;
      customMusicBus.connect(musicGain);

      const noise = createNoiseLibrary(ctx);
      const synth = new SynthBank(ctx, noise);
      const sequencer = new MusicSequencer(ctx, musicGain, sfxGain, noise);
      sequencer.setActiveTrack(this.activeTrack, this.musicIntensity);
      sequencer.setFireIntensity(this.targetFireIntensity);

      this.ctx = ctx;
      this.limiter = limiter;
      this.masterGain = masterGain;
      this.musicGain = musicGain;
      this.sfxGain = sfxGain;
      this.customMusicBus = customMusicBus;
      this.noise = noise;
      this.synth = synth;
      this.sequencer = sequencer;
      return true;
    } catch {
      return false;
    }
  }

  async unlock(): Promise<void> {
    if (this.disposed) return;
    if (!this.ensureGraph() || !this.ctx) return;

    this.suspendedManually = false;
    this.autoSuspended = false;
    this.unlockInFlight = true;
    try {
      const state = this.ctx.state as string;
      if (state !== 'running' && state !== 'closed') {
        await this.ctx.resume();
      }
    } catch {
      // Autoplay policies may still block outside user gesture; never throw.
    } finally {
      this.unlockInFlight = false;
    }

    if (this.disposed || !this.ctx) return;

    if (this.ctx.state === 'running') {
      this.hasUnlockedOnce = true;
      this.applyMasterFadeIn(false);
      this.sequencer?.resyncClock();
      this.sequencer?.start();
      if (this.mode === 'custom' && this.customUrls && !this.customMusicActive) {
        void this.bootstrapCustomLoops(this.packGeneration);
      }
    }
  }

  suspend(): void {
    if (this.disposed) return;
    this.suspendedManually = true;
    this.autoSuspended = false;
    this.stopActiveSfxVoices(0.01);
    this.suspendContextSafely();
  }

  resume(): void {
    if (this.disposed) return;
    this.suspendedManually = false;
    this.autoSuspended = false;
    if (!this.ctx) return;
    this.resumeContextSafely(true);
  }

  private handleVisibilityChange(): void {
    if (this.disposed || typeof document === 'undefined') return;
    const isHidden = Boolean(document.hidden || document.visibilityState === 'hidden');
    if (isHidden) {
      if (this.ctx && this.ctx.state === 'running') {
        this.autoSuspended = true;
        this.stopActiveSfxVoices(0.008);
        this.suspendContextSafely();
      }
      return;
    }

    if (
      !this.suspendedManually &&
      this.ctx &&
      (this.autoSuspended || (this.hasUnlockedOnce && this.ctx.state !== 'running'))
    ) {
      this.autoSuspended = false;
      this.resumeContextSafely(true);
    }
  }

  private suspendContextSafely(): void {
    if (!this.ctx) return;
    try {
      if (this.ctx.state === 'running') {
        if (this.masterGain) {
          const now = this.ctx.currentTime;
          try {
            this.masterGain.gain.cancelScheduledValues(now);
            this.masterGain.gain.setTargetAtTime(0.0001, now, 0.008);
          } catch {
            // ignore gain scheduling errors
          }
        }
        const maybePromise = this.ctx.suspend();
        if (maybePromise && typeof maybePromise.catch === 'function') {
          void maybePromise.catch(() => {});
        }
      }
    } catch {
      // Never throw on restricted/mock audio contexts
    }
  }

  private resumeContextSafely(fadeIn: boolean): void {
    if (this.disposed || !this.ctx) return;
    const state = this.ctx.state as string;
    if (state === 'closed') return;

    const onRunning = () => {
      if (this.disposed || !this.ctx || this.suspendedManually) return;
      if (this.ctx.state !== 'running') return;
      this.hasUnlockedOnce = true;
      this.applyMasterFadeIn(fadeIn);
      this.sequencer?.resyncClock();
      this.sequencer?.start();
      if (this.mode === 'custom' && this.customUrls && !this.customMusicActive) {
        void this.bootstrapCustomLoops(this.packGeneration);
      }
    };

    if (state === 'running') {
      onRunning();
      return;
    }

    try {
      const maybePromise = this.ctx.resume();
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(onRunning).catch(() => {});
      } else {
        onRunning();
      }
    } catch {
      // Mobile browsers may require the next touch gesture to resume; ignore safely
    }
  }

  private applyMasterFadeIn(fadeIn: boolean): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const target = clamp(this.masterVolume, 0, 1);
    try {
      this.masterGain.gain.cancelScheduledValues(now);
      if (fadeIn && target > 0.001 && this.ctx.state === 'running') {
        this.masterGain.gain.setValueAtTime(0.0001, now);
        this.masterGain.gain.linearRampToValueAtTime(target, now + 0.035);
      } else if (this.ctx.state === 'running') {
        this.masterGain.gain.setTargetAtTime(target, now, 0.015);
      } else {
        this.masterGain.gain.value = target;
      }
    } catch {
      this.masterGain.gain.value = target;
    }
  }

  private stopActiveSfxVoices(fadeOutSec: number): void {
    for (const v of this.activeVoices) {
      try {
        v.stop(fadeOutSec);
      } catch {
        // ignore
      }
    }
    this.activeVoices.length = 0;
  }

  setSettings(settings: Pick<RenderSettings, 'masterVolume' | 'musicVolume' | 'sfxVolume'>): void {
    this.masterVolume = clamp(Number.isFinite(settings.masterVolume) ? settings.masterVolume : 0.8, 0, 1);
    this.musicVolume = clamp(Number.isFinite(settings.musicVolume) ? settings.musicVolume : 0.65, 0, 1);
    this.sfxVolume = clamp(Number.isFinite(settings.sfxVolume) ? settings.sfxVolume : 0.85, 0, 1);

    if (!this.ctx || !this.masterGain || !this.musicGain || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const apply = (node: GainNode, target: number) => {
      try {
        if (this.ctx && this.ctx.state === 'running') {
          node.gain.setTargetAtTime(target, now, 0.015);
        } else {
          node.gain.value = target;
        }
      } catch {
        node.gain.value = target;
      }
    };
    apply(this.masterGain, this.masterVolume);
    apply(this.musicGain, this.musicVolume * 0.48);
    apply(this.sfxGain, this.sfxVolume * 0.85);
  }

  async setCustomPack(sounds: Record<SoundKey, string> | null): Promise<void> {
    if (this.disposed) return;
    this.packGeneration++;
    const gen = this.packGeneration;

    if (!sounds) {
      this.mode = 'builtin';
      this.customUrls = null;
      this.stopCustomLoops();
      this.sequencer?.setMusicMix(1);
      this.sequencer?.setFireMix(1);
      return;
    }

    this.mode = 'custom';
    this.customUrls = { ...sounds };
    this.failedUrls.clear();
    this.stopCustomLoops();
    // Keep procedural music & fire seamlessly playing until custom stems finish decoding
    this.sequencer?.setMusicMix(1);
    this.sequencer?.setFireMix(1);

    if (this.ctx && this.ctx.state === 'running') {
      void this.bootstrapCustomLoops(gen);
    }
  }

  setMusicContext(track: MusicTrackId, intensity?: number): void {
    this.activeTrack = track;
    if (intensity !== undefined && Number.isFinite(intensity)) {
      this.musicIntensity = clamp(intensity, 0, 1);
    }
    this.sequencer?.setActiveTrack(track, this.musicIntensity);
    if (this.customMusicActive) {
      this.sequencer?.setMusicMix(this.customStems[track] ? 0 : 1);
    }
  }

  setFireIntensity(intensity: number): void {
    this.targetFireIntensity = clamp(Number.isFinite(intensity) ? intensity : 0, 0, 1);
    this.sequencer?.setFireIntensity(this.targetFireIntensity);
  }

  playSfx(key: SoundKey, opts?: { pitch?: number; volume?: number }): void {
    if (this.disposed) return;

    // Never queue dead voices into a suspended or unavailable AudioContext
    if (!this.ctx || !this.sfxGain || !this.synth) return;
    if (this.ctx.state !== 'running') {
      // If unlock() is currently resuming from this very gesture, attempt non-throwing resume once
      if (this.unlockInFlight) {
        const requestedAt = Date.now();
        this.ctx.resume().then(() => {
          if (!this.disposed && this.ctx?.state === 'running' && Date.now() - requestedAt < 160) {
            this.playSfx(key, opts);
          }
        }).catch(() => {});
      }
      return;
    }

    const pitch = clamp(Number.isFinite(opts?.pitch) ? (opts?.pitch as number) : 1, 0.25, 3.5);
    const volume = clamp(Number.isFinite(opts?.volume) ? (opts?.volume as number) : 1, 0, 2);
    if (volume <= 0.0005) return;

    this.enforcePolyphonyCap();

    // Polyphony-aware headroom scaling so rapid 16-voice cascades remain crisp with zero clipping
    const activeCount = this.activeVoices.length;
    const polyScale = activeCount <= 4 ? 1 : 1 / Math.sqrt(1 + (activeCount - 4) * 0.22);
    const effectiveVolume = volume * polyScale;

    // Custom Pack Mode: use cached decoded AudioBuffer if ready, otherwise lazily fetch & fall back to SynthBank
    if (this.mode === 'custom' && this.customUrls) {
      const url = this.customUrls[key];
      if (url && !this.failedUrls.has(url)) {
        const cached = this.bufferCache.get(url);
        if (cached) {
          const voice = this.playDecodedBuffer(key, cached, pitch, effectiveVolume);
          if (voice) {
            this.registerVoice(voice);
            return;
          }
        } else {
          // Lazily kick off fetch/decode for subsequent plays; use SynthBank immediately so no beat is silent
          void this.loadCustomBuffer(url, this.packGeneration);
        }
      }
    }

    // Procedural fallback / Built-In Mode
    try {
      const voiceId = this.nextVoiceId++;
      const voice = this.synth.play(key, this.sfxGain, { pitch, volume: effectiveVolume }, voiceId);
      this.registerVoice(voice);
    } catch {
      // Defensive guard so audio can never break game simulation/rendering
    }
  }

  update(dt: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(dt) || dt <= 0) return;
    const safeDt = Math.min(dt, 0.1);

    // Update procedural music sequencer & procedural fire loop
    this.sequencer?.update(safeDt);

    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    // Crossfade custom 5-stem music loops at exact 3 * dt rate
    const musicLerp = Math.min(1, 3 * safeDt);
    if (this.customMusicActive) {
      for (const id of MUSIC_TRACK_IDS) {
        const target = id === this.activeTrack ? 1 : 0;
        const next = this.customMusicLevels[id] + (target - this.customMusicLevels[id]) * musicLerp;
        const snapped = Math.abs(target - next) < 0.0005 ? target : next;
        this.customMusicLevels[id] = snapped;
        const ch = this.customStems[id];
        if (ch) {
          ch.gain.gain.setTargetAtTime(snapped, now, 0.018);
        }
      }
    }

    // Smooth fire intensity tracking for custom ambientFire1 / ambientFire2 loops
    const fireRate = this.targetFireIntensity > this.currentFireIntensity ? 5.0 : 2.6;
    const fireLerp = Math.min(1, fireRate * safeDt);
    this.currentFireIntensity += (this.targetFireIntensity - this.currentFireIntensity) * fireLerp;
    if (this.currentFireIntensity < 0.001 && this.targetFireIntensity === 0) {
      this.currentFireIntensity = 0;
    }

    if (this.customFireActive) {
      const f = this.currentFireIntensity;
      if (this.customFire1) {
        const g1 = f <= 0.0005 ? 0 : Math.pow(f, 0.85) * 0.52;
        this.customFire1.gain.gain.setTargetAtTime(g1, now, 0.025);
        this.customFire1.source.playbackRate.setTargetAtTime(0.95 + f * 0.14, now, 0.05);
      }
      if (this.customFire2) {
        const high = Math.max(0, (f - 0.22) / 0.78);
        const g2 = high <= 0.0005 ? 0 : high * 0.62;
        this.customFire2.gain.gain.setTargetAtTime(g2, now, 0.025);
        this.customFire2.source.playbackRate.setTargetAtTime(0.96 + high * 0.18, now, 0.05);
      }
    }
  }

  getMode(): 'builtin' | 'custom' {
    return this.mode;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.packGeneration++;

    if (
      this.visibilityHandler &&
      typeof document !== 'undefined' &&
      typeof document.removeEventListener === 'function'
    ) {
      try {
        document.removeEventListener('visibilitychange', this.visibilityHandler);
      } catch {
        // ignore
      }
      this.visibilityHandler = null;
    }

    this.stopActiveSfxVoices(0.005);

    this.stopCustomLoops();
    this.sequencer?.dispose();
    this.sequencer = null;
    this.synth = null;
    this.noise = null;

    const disconnect = (n: AudioNode | null) => {
      if (!n) return;
      try {
        n.disconnect();
      } catch {
        // ignore
      }
    };
    disconnect(this.customMusicBus);
    disconnect(this.musicGain);
    disconnect(this.sfxGain);
    disconnect(this.masterGain);
    disconnect(this.limiter);

    const ctx = this.ctx;
    this.ctx = null;
    this.customMusicBus = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.masterGain = null;
    this.limiter = null;

    if (ctx) {
      try {
        void ctx.close();
      } catch {
        // ignore
      }
    }
  }

  // -------------------------------------------------------------------------
  // Polyphony & Buffer Playback Helpers
  // -------------------------------------------------------------------------

  private enforcePolyphonyCap(): void {
    const now = this.ctx?.currentTime ?? 0;
    // Prune naturally finished voices
    for (let i = this.activeVoices.length - 1; i >= 0; i--) {
      if (this.activeVoices[i].endsAt <= now) {
        this.activeVoices.splice(i, 1);
      }
    }
    // Steal oldest voices cleanly with short fade-out so cascades never clip
    while (this.activeVoices.length >= MAX_SFX_VOICES) {
      const oldest = this.activeVoices.shift();
      if (oldest) {
        oldest.stop(0.014);
      }
    }
  }

  private registerVoice(voice: ActiveVoice): void {
    this.activeVoices.push(voice);
  }

  private playDecodedBuffer(
    key: SoundKey,
    buffer: AudioBuffer,
    pitch: number,
    volume: number,
  ): ActiveVoice | null {
    if (!this.ctx || !this.sfxGain) return null;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const id = this.nextVoiceId++;

    try {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.setValueAtTime(pitch, now);

      const g = ctx.createGain();
      g.gain.setValueAtTime(volume, now);

      src.connect(g);
      g.connect(this.sfxGain);

      const estDuration = buffer.duration / Math.max(0.25, pitch);
      let stopped = false;

      const cleanup = () => {
        try {
          src.disconnect();
        } catch {
          // ignore
        }
        try {
          g.disconnect();
        } catch {
          // ignore
        }
        const idx = this.activeVoices.findIndex((v) => v.id === id);
        if (idx >= 0) this.activeVoices.splice(idx, 1);
      };

      src.onended = () => {
        if (!stopped) {
          stopped = true;
          cleanup();
        }
      };

      src.start(now);

      return {
        id,
        key,
        startedAt: now,
        endsAt: now + estDuration + 0.03,
        stop: (fadeOutSec = 0.014) => {
          if (stopped) return;
          stopped = true;
          const t = ctx.currentTime;
          const fade = Math.max(0.004, fadeOutSec);
          try {
            g.gain.cancelScheduledValues(t);
            g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
            g.gain.linearRampToValueAtTime(0.0001, t + fade);
            src.stop(t + fade + 0.005);
          } catch {
            cleanup();
          }
          src.onended = cleanup;
        },
      };
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Custom Pack Lazy Loading & Sample-Locked Loop Orchestration
  // -------------------------------------------------------------------------

  private loadCustomBuffer(url: string, gen: number): Promise<AudioBuffer | null> {
    if (this.disposed || !this.ctx || !url || this.failedUrls.has(url)) {
      return Promise.resolve(null);
    }
    const cached = this.bufferCache.get(url);
    if (cached) return Promise.resolve(cached);

    const existing = this.inFlightLoads.get(url);
    if (existing) return existing;

    if (typeof fetch !== 'function') {
      this.failedUrls.add(url);
      return Promise.resolve(null);
    }

    const ctx = this.ctx;
    const promise = (async (): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          this.failedUrls.add(url);
          return null;
        }
        const raw = await res.arrayBuffer();
        if (this.disposed || this.ctx !== ctx) return null;
        const decoded = await ctx.decodeAudioData(raw.slice(0));
        this.bufferCache.set(url, decoded);
        return gen === this.packGeneration ? decoded : decoded;
      } catch {
        this.failedUrls.add(url);
        return null;
      } finally {
        this.inFlightLoads.delete(url);
      }
    })();

    this.inFlightLoads.set(url, promise);
    return promise;
  }

  private async bootstrapCustomLoops(gen: number): Promise<void> {
    if (this.disposed || gen !== this.packGeneration || this.mode !== 'custom' || !this.customUrls || !this.ctx) {
      return;
    }
    const urls = this.customUrls;

    // 1. Decode all 5 custom music stems in parallel so they can launch in exact sample-locked sync
    const musicResults = await Promise.all(
      MUSIC_TRACK_IDS.map(async (id) => {
        const url = urls[id];
        const buf = url ? await this.loadCustomBuffer(url, gen) : null;
        return { id, buf };
      }),
    );

    if (this.disposed || gen !== this.packGeneration || this.mode !== 'custom' || !this.ctx) return;

    const validStems = musicResults.filter(
      (entry): entry is { id: MusicTrackId; buf: AudioBuffer } => entry.buf !== null,
    );

    if (validStems.length > 0 && this.customMusicBus) {
      this.startCustomMusicStems(validStems);
    }

    // 2. Decode custom ambient fire loops (ambientFire1 & ambientFire2)
    const [fire1Buf, fire2Buf] = await Promise.all([
      urls.ambientFire1 ? this.loadCustomBuffer(urls.ambientFire1, gen) : Promise.resolve(null),
      urls.ambientFire2 ? this.loadCustomBuffer(urls.ambientFire2, gen) : Promise.resolve(null),
    ]);

    if (this.disposed || gen !== this.packGeneration || this.mode !== 'custom' || !this.ctx) return;

    if (fire1Buf || fire2Buf) {
      this.startCustomFireLoops(fire1Buf, fire2Buf);
    }

    // 3. Gently warm high-frequency UI/scoring SFX in background (non-blocking)
    for (const key of PRELOAD_CORE_SFX) {
      if (this.disposed || gen !== this.packGeneration) break;
      const u = urls[key];
      if (u && !this.bufferCache.has(u) && !this.failedUrls.has(u)) {
        void this.loadCustomBuffer(u, gen);
      }
    }
  }

  private startCustomMusicStems(stems: Array<{ id: MusicTrackId; buf: AudioBuffer }>): void {
    if (!this.ctx || !this.customMusicBus) return;
    this.stopCustomMusicStems();

    const now = this.ctx.currentTime;
    const syncStart = now + 0.06;

    // Initialize custom stem gains to match activeTrack immediately
    for (const id of MUSIC_TRACK_IDS) {
      this.customMusicLevels[id] = id === this.activeTrack ? 1 : 0;
    }

    for (const { id, buf } of stems) {
      try {
        const source = this.ctx.createBufferSource();
        source.buffer = buf;
        source.loop = true;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(this.customMusicLevels[id], now);

        source.connect(gain);
        gain.connect(this.customMusicBus);
        // Every stem starts on the exact same hardware timestamp -> sample-locked multi-track sync!
        source.start(syncStart);

        this.customStems[id] = { source, gain };
      } catch {
        // ignore individual stem failure
      }
    }

    this.customMusicActive = Object.keys(this.customStems).length > 0;
    if (this.customMusicActive) {
      this.customMusicBus.gain.setTargetAtTime(1, now, 0.08);
      this.sequencer?.setMusicMix(this.customStems[this.activeTrack] ? 0 : 1);
    }
  }

  private startCustomFireLoops(fire1Buf: AudioBuffer | null, fire2Buf: AudioBuffer | null): void {
    if (!this.ctx || !this.sfxGain) return;
    this.stopCustomFireLoops();

    const now = this.ctx.currentTime;
    const syncStart = now + 0.04;

    if (fire1Buf) {
      try {
        const source = this.ctx.createBufferSource();
        source.buffer = fire1Buf;
        source.loop = true;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        source.connect(gain);
        gain.connect(this.sfxGain);
        source.start(syncStart);
        this.customFire1 = { source, gain };
      } catch {
        // ignore
      }
    }

    if (fire2Buf) {
      try {
        const source = this.ctx.createBufferSource();
        source.buffer = fire2Buf;
        source.loop = true;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        source.connect(gain);
        gain.connect(this.sfxGain);
        source.start(syncStart);
        this.customFire2 = { source, gain };
      } catch {
        // ignore
      }
    }

    this.customFireActive = Boolean(this.customFire1 || this.customFire2);
    if (this.customFireActive) {
      this.sequencer?.setFireMix(0);
    }
  }

  private stopCustomMusicStems(): void {
    for (const id of MUSIC_TRACK_IDS) {
      const ch = this.customStems[id];
      if (!ch) continue;
      try {
        ch.source.stop();
      } catch {
        // ignore
      }
      try {
        ch.source.disconnect();
        ch.gain.disconnect();
      } catch {
        // ignore
      }
      delete this.customStems[id];
    }
    this.customMusicActive = false;
    if (this.customMusicBus && this.ctx) {
      try {
        this.customMusicBus.gain.setValueAtTime(0, this.ctx.currentTime);
      } catch {
        this.customMusicBus.gain.value = 0;
      }
    }
  }

  private stopCustomFireLoops(): void {
    const teardown = (ch: CustomFireChannel | null) => {
      if (!ch) return;
      try {
        ch.source.stop();
      } catch {
        // ignore
      }
      try {
        ch.source.disconnect();
        ch.gain.disconnect();
      } catch {
        // ignore
      }
    };
    teardown(this.customFire1);
    teardown(this.customFire2);
    this.customFire1 = null;
    this.customFire2 = null;
    this.customFireActive = false;
  }

  private stopCustomLoops(): void {
    this.stopCustomMusicStems();
    this.stopCustomFireLoops();
  }
}

export function createAudioEngine(): IAudioEngine {
  return new AudioEngine();
}
