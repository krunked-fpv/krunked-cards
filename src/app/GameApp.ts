// ============================================================================
// Krunked Cards — Main Application Shell (Fixed 60 Hz Sim + Decoupled FPS Render)
// Orchestrates PackManager, AudioEngine, WebGL2Renderer, CardSceneManager,
// ParticleSystem, ScoreChoreographer, InputManager, UiOverlay, DebugDrawer,
// SaveManager, and mounts window.__KRUNKED_DEBUG__ (DebugBridge).
// ============================================================================

import {
  SAVE_STORAGE_KEY,
  SIM_HZ,
  type ArtPackMode,
  type CardInstance,
  type DebugBridge,
  type EditionId,
  type IAudioEngine,
  type MusicTrackId,
  type PerfTelemetry,
  type RenderSettings,
  type SimAction,
  type SimEvent,
  type SimState,
  type SoundKey,
} from '../contracts/index.ts';
import { getCatalogSummary } from '../data/index.ts';
import {
  createRngState,
  createTitleState,
  dispatchSim,
  evaluatePokerHand,
  getActiveBlind,
  hashSimState,
  startRun,
  stepSimTick,
} from '../sim/index.ts';
import { createAudioEngine } from '../audio/index.ts';
import { PackManager } from '../assets/PackManager.ts';
import { CardSceneManager, type VisualCard } from '../render/Moveable.ts';
import { ParticleSystem } from '../render/ParticleSystem.ts';
import { ScoreChoreographer } from '../render/ScoreChoreographer.ts';
import { WebGL2Renderer } from '../render/WebGL2Renderer.ts';
import { InputManager } from '../input/InputManager.ts';
import { UiOverlay } from '../ui/UiOverlay.ts';
import { DebugDrawer } from '../ui/DebugDrawer.ts';
import { SaveManager } from './SaveManager.ts';

const SIM_DT = 1 / SIM_HZ;

function hasSavedUserPreference(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(SAVE_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export class GameApp {
  private canvas: HTMLCanvasElement;
  private uiRoot: HTMLElement;

  private hadExistingSaveOnBoot: boolean;
  private saveManager: SaveManager;
  private packManager: PackManager;
  private audio: IAudioEngine;
  private renderer: WebGL2Renderer;
  private scene: CardSceneManager;
  private particles: ParticleSystem;
  private choreographer: ScoreChoreographer;
  private ui: UiOverlay;
  private input: InputManager;
  private debugDrawer: DebugDrawer;

  private state: SimState;
  private scoringCardIds: Set<string> | null = null;
  private rafId = 0;
  private lastRafMs = 0;
  private simAccumSec = 0;
  private renderAccumSec = 0;
  private elapsedSec = 0;

  // Live FPS estimator
  private fpsSamples = 0;
  private fpsWindowStart = 0;
  private measuredFps = 60;

  private resizeHandler: () => void;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;

    // Detect before SaveManager initializes whether user already saved explicit prefs
    this.hadExistingSaveOnBoot = hasSavedUserPreference();
    this.saveManager = new SaveManager();
    this.packManager = new PackManager();
    this.audio = createAudioEngine();
    this.audio.setSettings(this.saveManager.getSettings());

    this.state = this.createInitialTitleState();
    this.scene = new CardSceneManager();
    this.particles = new ParticleSystem();
    this.choreographer = new ScoreChoreographer();
    this.renderer = new WebGL2Renderer(this.canvas, this.packManager);

    this.choreographer.setParticleSystem(this.particles);
    this.choreographer.setGlitchCallback((intensity) => {
      this.renderer.triggerGlitchPulse(intensity);
    });

    this.ui = new UiOverlay(this.uiRoot, this.packManager, {
      onDispatch: (action) => this.dispatch(action),
      onContinueRun: () => this.continueSavedRun(),
      onUpdateSettings: (partial) => this.updateSettings(partial),
      onSetArtPackMode: (mode) => this.setArtPackMode(mode),
      onLoadCustomPackFiles: (files) => this.loadCustomPackFiles(files),
      onClearCustomPack: () => this.clearCustomPack(),
      onPlayButtonSfx: () => this.audio.playSfx('button'),
      hasSavedRun: () => this.saveManager.getActiveRun() !== null,
      getProfile: () => this.saveManager.getProfile(),
    });

    this.input = new InputManager(this.canvas, this.scene, {
      getState: () => this.state,
      getKeybinds: () => this.saveManager.getSettings().keybinds,
      isModalOpen: () => this.ui.isModalOpen(),
      isRebindingKey: () => this.ui.isRebindingKey(),
      onCaptureRebindKey: (code) => this.ui.captureRebindKey(code),
      onDispatch: (action) => this.dispatch(action),
      onToggleRunInfo: () => this.ui.toggleRunInfo(),
      onTogglePause: () => this.ui.togglePause(this.state.phase),
      onToggleDebugDrawer: () => this.debugDrawer.toggle(),
      onCardClick: (card) => this.handleCardClick(card),
      onHoverChange: (card, x, y) => this.ui.setHoveredCard(card, x, y, this.state),
      onAudioUnlock: () => {
        void this.audio.unlock();
      },
    });

    const bridge = this.createDebugBridge();
    window.__KRUNKED_DEBUG__ = bridge;
    this.debugDrawer = new DebugDrawer(this.uiRoot, bridge);

    this.resizeHandler = () => {
      this.renderer.resize(window.innerWidth, window.innerHeight);
      this.ui.invalidateAll();
    };
    window.addEventListener('resize', this.resizeHandler);
  }

  async start(): Promise<void> {
    this.renderer.resize(window.innerWidth, window.innerHeight);

    // Smart local dev pack auto-detection when no explicit save exists yet;
    // preserves DEFAULT_SETTINGS.artPackMode = 'builtin' for clean-room & tests!
    await this.packManager.init(
      this.saveManager.getSettings().artPackMode,
      !this.hadExistingSaveOnBoot
    );
    this.renderer.uploadAllAtlases();
    await this.audio.setCustomPack(this.packManager.getCustomSoundUrls());

    this.packManager.onChange(() => {
      this.renderer.uploadAllAtlases();
      void this.audio.setCustomPack(this.packManager.getCustomSoundUrls());
      this.ui.invalidateAll();
    });

    this.syncMusicForPhase();
    this.lastRafMs = performance.now();
    this.fpsWindowStart = this.lastRafMs;
    this.rafId = requestAnimationFrame((now) => this.loop(now));
  }

  private createInitialTitleState(): SimState {
    try {
      return createTitleState();
    } catch {
      // Safe fallback only if SimCore skeleton is still linked in isolated worktree
      return {
        tick: 0,
        rng: createRngState('KRUNKED1'),
        phase: 'TITLE',
        deckId: 'b_red',
        stake: 1,
        challengeId: null,
        seeded: false,
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
        blinds: {
          Small: { slot: 'Small', key: 'bl_small', name: 'Small Blind', status: 'Select', mult: 1, targetChips: 300, dollars: 3, tagKey: null, bossColor: '#2e659e', triggered: false, disabled: false },
          Big: { slot: 'Big', key: 'bl_big', name: 'Big Blind', status: 'Upcoming', mult: 1.5, targetChips: 450, dollars: 4, tagKey: null, bossColor: '#c77f1e', triggered: false, disabled: false },
          Boss: { slot: 'Boss', key: 'bl_hook', name: 'The Hook', status: 'Upcoming', mult: 2, targetChips: 600, dollars: 5, tagKey: null, bossColor: '#a84024', triggered: false, disabled: false },
        },
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
        handLevels: {} as SimState['handLevels'],
        shop: null,
        pack: null,
        cashout: null,
        tracking: {} as SimState['tracking'],
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
    }
  }

  private continueSavedRun(): void {
    const saved = this.saveManager.getActiveRun();
    if (!saved) return;
    this.choreographer.reset();
    this.scoringCardIds = null;
    this.state = saved;
    this.ui.setSelectedOwned(null);
    this.ui.invalidateAll();
    this.syncMusicForPhase();
  }

  private computeScoringCardIds(state: SimState): Set<string> {
    const ids = new Set<string>();
    const byId = new Map<string, CardInstance>();
    for (const c of state.fullDeck) byId.set(c.id, c);

    const played: CardInstance[] = [];
    for (const cid of state.playArea) {
      const c = byId.get(cid);
      if (c) played.push(c);
    }

    if (played.length > 0) {
      try {
        const evalRes = evaluatePokerHand(played, state.jokers);
        for (const sc of evalRes.scoringCards) ids.add(sc.id);
      } catch {
        // Fall back to beat inspection below
      }
    }

    for (const beat of state.lastHandBeats) {
      if (beat.sourceType === 'card' && beat.sourceId) {
        ids.add(beat.sourceId);
      }
    }
    return ids;
  }

  dispatch(action: SimAction): SimState {
    try {
      const prevPhase = this.state.phase;
      const result =
        action.type === 'START_RUN'
          ? startRun(action.deckId, action.stake, action.seed, action.challengeId ?? null)
          : dispatchSim(this.state, action);

      this.state = result.state;
      this.handleSimEvents(result.events);

      if (action.type === 'START_RUN') {
        this.saveManager.recordRunStarted();
        this.choreographer.reset();
        this.scoringCardIds = null;
        this.ui.setSelectedOwned(null);
      }

      if (this.state.lastError) {
        this.ui.showToast(this.state.lastError, 2400);
        this.audio.playSfx('cancel');
      }

      // Trigger sequential beat choreography whenever entering SCORING
      if (this.state.phase === 'SCORING') {
        const beats = result.beats.length > 0 ? result.beats : this.state.lastHandBeats;
        this.scoringCardIds = this.computeScoringCardIds(this.state);
        this.choreographer.start(this.state, beats, this.scene, this.audio, () => {
          if (this.state.phase === 'SCORING') {
            this.dispatch({ type: 'FINISH_SCORING' });
          }
        });
      } else if (prevPhase === 'SCORING') {
        this.choreographer.reset();
        this.scoringCardIds = null;
      }

      // Phase transition vortex warps & celebratory effects
      if (this.state.phase !== prevPhase) {
        if (this.state.phase === 'PACK_OPEN') {
          this.renderer.triggerVortexPulse(0.65, 4.8);
          const g = this.scene.getGeometry();
          this.particles.emitAccentBurst(
            g.packTray.x + g.packTray.w * 0.5,
            g.packTray.y + g.packTray.h * 0.45,
            'purple'
          );
        } else if (
          this.state.phase === 'PLAYING' &&
          prevPhase === 'BLIND_SELECT' &&
          getActiveBlind(this.state)?.slot === 'Boss'
        ) {
          this.renderer.triggerVortexPulse(0.72, 5.4);
          this.renderer.triggerGlitchPulse(0.55);
          this.choreographer.triggerImpactFlash(0.30, [0.95, 0.34, 0.28], 4.0);
        } else if (this.state.phase === 'TITLE') {
          this.renderer.triggerTitleEntryFlash();
        }
        this.syncMusicForPhase();
        this.ui.setSelectedOwned(null);
      }

      if (this.state.phase === 'VICTORY' && prevPhase !== 'VICTORY') {
        this.saveManager.recordRunWon(this.state);
        this.audio.playSfx('win');
        const g = this.scene.getGeometry();
        this.particles.emitAccentBurst(g.viewportW * 0.55, g.viewportH * 0.45, 'celebrate');
      }

      if (this.state.phase !== 'TITLE') {
        this.saveManager.saveRun(this.state);
      }
      this.ui.invalidateAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.ui.showToast(msg, 2800);
    }
    return this.state;
  }

  private handleSimEvents(events: SimEvent[]): void {
    const geom = this.scene.getGeometry();
    const cx = geom.table.x + geom.table.w * 0.5;
    const cy = geom.table.y + geom.table.h * 0.48;

    for (const ev of events) {
      if (ev.sound) {
        this.audio.playSfx(ev.sound);
      } else {
        const mapped = mapEventToSfx(ev.type);
        if (mapped) this.audio.playSfx(mapped);
      }

      if (ev.type === 'ITEM_BOUGHT' || ev.type === 'ITEM_SOLD' || ev.type === 'CASHOUT_COMPLETE') {
        this.particles.emitMoneyBurst(cx, cy, 1.1);
      } else if (ev.type === 'VOUCHER_REDEEMED') {
        this.particles.emitMoneyBurst(
          geom.shopVoucherTray.x + geom.shopVoucherTray.w * 0.5,
          geom.shopVoucherTray.y + geom.shopVoucherTray.h * 0.45,
          1.4
        );
      } else if (ev.type === 'CONSUMABLE_USED') {
        this.particles.emitAccentBurst(cx, cy, 'purple');
      }
    }
  }

  private handleCardClick(card: VisualCard): void {
    const nowSec = performance.now() / 1000;
    if (card.kind === 'hand') {
      if (this.state.phase === 'PLAYING' || this.state.phase === 'PACK_OPEN') {
        card.moveable.juiceUp(0.28, undefined, nowSec);
        this.audio.playSfx(card.selected ? 'cardSlide2' : 'cardSlide1', {
          pitch: card.selected ? 0.92 : 1.08,
        });
        this.dispatch({ type: 'TOGGLE_SELECT_CARD', cardId: card.id });
      }
    } else if (card.kind === 'joker' || card.kind === 'consumable') {
      card.moveable.juiceUp(0.32, undefined, nowSec);
      this.audio.playSfx('highlight1');
      this.ui.setSelectedOwned(card.id);
    } else if (card.kind === 'deck_pile') {
      card.moveable.juiceUp(0.25, undefined, nowSec);
      this.audio.playSfx('cardFan2');
      this.ui.toggleRunInfo();
    } else if (card.kind === 'title_showcase') {
      card.moveable.juiceUp(0.45, undefined, nowSec);
      this.particles.emitChipsBurst(card.moveable.vx, card.moveable.vy, 0.9);
      this.particles.emitMultBurst(card.moveable.vx, card.moveable.vy, false, 0.8);
      this.audio.playSfx('card1');
    }
  }

  private syncMusicForPhase(): void {
    let track: MusicTrackId = 'music1';
    if (this.state.phase === 'SHOP') {
      track = 'music4';
    } else if (this.state.phase === 'PACK_OPEN') {
      track = this.state.pack?.kind === 'Celestial' ? 'music3' : 'music2';
    } else if (
      (this.state.phase === 'PLAYING' || this.state.phase === 'SCORING') &&
      getActiveBlind(this.state)?.slot === 'Boss'
    ) {
      track = 'music5';
    }
    this.audio.setMusicContext(track, this.choreographer.getFlameIntensity());
  }

  private updateSettings(partial: Partial<RenderSettings>): void {
    const next = this.saveManager.updateSettings(partial);
    this.audio.setSettings(next);
    if (partial.artPackMode && partial.artPackMode !== this.packManager.getMode()) {
      void this.setArtPackMode(partial.artPackMode);
    }
    this.ui.invalidateAll();
  }

  private async setArtPackMode(mode: ArtPackMode): Promise<void> {
    const ok = await this.packManager.setMode(mode);
    const actualMode = this.packManager.getMode();
    this.saveManager.updateSettings({ artPackMode: actualMode });
    if (!ok && mode === 'custom') {
      this.ui.showToast('No local custom pack found. Load one via folder or .exe/.zip archive.', 3200);
    } else {
      this.ui.showToast(this.packManager.getStatusMessage(), 2000);
    }
  }

  private async loadCustomPackFiles(files: FileList | File[]): Promise<{ ok: boolean; message: string }> {
    const res = await this.packManager.loadFromUserFiles(files);
    if (res.ok) {
      this.saveManager.updateSettings({ artPackMode: 'custom' });
    }
    return res;
  }

  private async clearCustomPack(): Promise<void> {
    await this.packManager.clearSavedCustomPack();
    this.saveManager.updateSettings({ artPackMode: this.packManager.getMode() });
  }

  // =========================================================================
  // Fixed 60 Hz Simulation Accumulator + Decoupled Target FPS Render Loop
  // =========================================================================

  private loop(nowMs: number): void {
    this.rafId = requestAnimationFrame((t) => this.loop(t));

    const frameDt = Math.min(0.1, Math.max(0.001, (nowMs - this.lastRafMs) / 1000));
    this.lastRafMs = nowMs;
    this.elapsedSec += frameDt;

    // 1. Fixed 60 Hz deterministic simulation ticks
    this.simAccumSec += frameDt;
    let simSteps = 0;
    while (this.simAccumSec >= SIM_DT && simSteps < 5) {
      this.state = stepSimTick(this.state);
      this.simAccumSec -= SIM_DT;
      simSteps++;
    }

    // 2. Gamepad & Audio smooth updates
    this.input.pollGamepad(frameDt);
    this.audio.update(frameDt);

    // 3. Target FPS frame-pacing gate (30 / 60 / 120)
    const settings = this.saveManager.getSettings();
    const minRenderInterval = settings.targetFps >= 120 ? 0 : 1 / settings.targetFps;
    this.renderAccumSec += frameDt;
    if (minRenderInterval > 0 && this.renderAccumSec + 0.0015 < minRenderInterval) {
      return;
    }
    const renderDt = this.renderAccumSec;
    this.renderAccumSec = 0;

    // Update smoothed FPS telemetry
    this.fpsSamples++;
    if (nowMs - this.fpsWindowStart >= 500) {
      this.measuredFps = Math.round((this.fpsSamples * 1000) / (nowMs - this.fpsWindowStart));
      this.fpsSamples = 0;
      this.fpsWindowStart = nowMs;
    }

    // 4. Step springs & choreographer
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.scene.syncAndStep(
      this.state,
      vw,
      vh,
      settings.highContrastSuits,
      settings.reducedMotion,
      renderDt,
      this.elapsedSec,
      this.scoringCardIds
    );
    this.choreographer.update(
      renderDt,
      this.state,
      settings.gameSpeed,
      this.scene,
      this.audio,
      settings.reducedMotion
    );

    const choreoDisplay = this.choreographer.getDisplay();
    const geom = this.scene.getGeometry();
    const cards = this.scene.getVisualCards();

    // 5. Render UI Overlay first so flame anchor bounding boxes are up to date
    this.ui.render(this.state, geom, cards, settings, choreoDisplay, this.elapsedSec);
    this.debugDrawer.update(nowMs);

    // 6. Step crisp pixel particles & render multi-pass WebGL2 frame
    const activeBlind = getActiveBlind(this.state);
    const bossColor = activeBlind?.slot === 'Boss' ? activeBlind.bossColor : null;
    const flameAnchor = this.ui.getFlameAnchor(choreoDisplay.flameIntensity);

    this.particles.update(
      renderDt,
      vw,
      vh,
      this.state.phase,
      flameAnchor,
      settings.reducedMotion
    );

    this.renderer.render({
      timeSec: this.elapsedSec,
      dt: renderDt,
      phase: this.state.phase,
      bossColor,
      cards,
      mouseX: this.input.mouseX,
      mouseY: this.input.mouseY,
      settings,
      flameAnchor,
      particles: this.particles,
      screenFlash: choreoDisplay.screenFlash,
      screenFlashColor: choreoDisplay.screenFlashColor,
      shakeX: choreoDisplay.shakeX,
      shakeY: choreoDisplay.shakeY,
    });
  }

  // =========================================================================
  // window.__KRUNKED_DEBUG__ (Full DebugBridge Contract)
  // =========================================================================

  private createDebugBridge(): DebugBridge {
    return {
      getState: () => this.state,
      getStateHash: () => hashSimState(this.state),
      dispatch: (action) => this.dispatch(action),
      stepTicks: (n: number) => {
        const count = Math.max(0, Math.floor(n));
        for (let i = 0; i < count; i++) {
          this.state = stepSimTick(this.state);
        }
      },
      getPerf: (): PerfTelemetry => ({
        fps: this.measuredFps,
        targetFps: this.saveManager.getSettings().targetFps,
        simHz: SIM_HZ,
        drawCalls: this.renderer.getDrawCalls(),
        activeShaders: this.renderer.getActiveShaders(),
        artPackMode: this.packManager.getMode(),
        customPackLoaded: this.packManager.hasCustomPackAvailable(),
        audioMode: this.audio.getMode(),
      }),
      getCatalogSummary: () => getCatalogSummary(),
      warpAnte: (ante: number, bossKey?: string) =>
        this.dispatch({ type: 'DEBUG_MUTATE', op: 'WARP_ANTE', ante, key: bossKey }),
      grantJoker: (key: string, edition?: EditionId) =>
        this.dispatch({ type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key, edition }),
      grantConsumable: (key: string, edition?: EditionId) =>
        this.dispatch({ type: 'DEBUG_MUTATE', op: 'GRANT_CONSUMABLE', key, edition }),
      grantVoucher: (key: string) =>
        this.dispatch({ type: 'DEBUG_MUTATE', op: 'GRANT_VOUCHER', key }),
      grantTag: (key: string) =>
        this.dispatch({ type: 'DEBUG_MUTATE', op: 'GRANT_TAG', key }),
      setDollars: (amount: number) =>
        this.dispatch({ type: 'DEBUG_MUTATE', op: 'SET_DOLLARS', amount }),
      winCurrentBlind: () =>
        this.dispatch({ type: 'DEBUG_MUTATE', op: 'WIN_BLIND' }),
      setArtPackMode: (mode: ArtPackMode) => this.setArtPackMode(mode),
      setSettings: (partial: Partial<RenderSettings>) => this.updateSettings(partial),
      resetSave: () => {
        this.saveManager.resetAll();
        this.choreographer.reset();
        this.scoringCardIds = null;
        this.state = this.createInitialTitleState();
        this.ui.invalidateAll();
      },
    };
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.resizeHandler);
    this.input.dispose();
    this.renderer.dispose();
    this.audio.dispose();
  }
}

function mapEventToSfx(type: SimEvent['type']): SoundKey | null {
  switch (type) {
    case 'RUN_STARTED':
      return 'cardFan2';
    case 'BLIND_SELECTED':
      return 'timpani';
    case 'BLIND_SKIPPED':
      return 'whoosh1';
    case 'TAG_TRIGGERED':
      return 'generic1';
    case 'CARDS_DRAWN':
      return 'cardSlide1';
    case 'CARDS_DISCARDED':
      return 'cardSlide2';
    case 'HAND_PLAYED':
      return 'card1';
    case 'ROUND_WON':
      return 'gong';
    case 'CASHOUT_COMPLETE':
      return 'coin5';
    case 'SHOP_ENTERED':
      return 'whoosh2';
    case 'SHOP_REROLLED':
      return 'coin3';
    case 'ITEM_BOUGHT':
      return 'coin1';
    case 'ITEM_SOLD':
      return 'coin4';
    case 'VOUCHER_REDEEMED':
      return 'tarot1';
    case 'PACK_OPENED':
      return 'paper1';
    case 'CONSUMABLE_USED':
      return 'tarot2';
    case 'JOKER_DESTROYED':
    case 'CARD_DESTROYED':
      return 'crumple1';
    case 'VICTORY':
      return 'win';
    case 'GAME_OVER':
      return 'cancel';
    default:
      return null;
  }
}
