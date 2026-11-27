import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  PALETTE,
  SAVE_SCHEMA_VERSION,
  SAVE_STORAGE_KEY,
  type IAudioEngine,
  type LayoutMode,
  type MusicTrackId,
  type RenderSettings,
  type ScoreBeat,
  type SimAction,
  type SimState,
  type SoundKey,
} from '../src/contracts/index.ts';
import { MAX_RUN_HISTORY, SaveManager } from '../src/app/SaveManager.ts';
import { AudioEngine, createAudioEngine } from '../src/audio/AudioEngine.ts';
import { InputManager, type InputCallbacks } from '../src/input/InputManager.ts';
import {
  CardSceneManager,
  computeTableGeometry,
  readSafeAreaInsets,
  type RectPx,
  type SafeInsets,
  type TableGeometry,
  type VisualCard,
} from '../src/render/Moveable.ts';
import { ParticleSystem } from '../src/render/ParticleSystem.ts';
import { ScoreChoreographer } from '../src/render/ScoreChoreographer.ts';
import { dispatchSim, startRun } from '../src/sim/index.ts';

// ---------------------------------------------------------------------------
// Shared Geometry & Simulation Helpers
// ---------------------------------------------------------------------------

const ZERO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const NOTCH_LANDSCAPE_INSETS: SafeInsets = { top: 0, right: 44, bottom: 21, left: 44 };
const NOTCH_PORTRAIT_INSETS: SafeInsets = { top: 47, right: 0, bottom: 34, left: 0 };

const REQUIRED_RECT_KEYS = [
  'hudDock',
  'table',
  'jokerTray',
  'consumableTray',
  'playArea',
  'handTray',
  'deckPile',
  'actionBar',
  'shopControls',
  'shopOfferTray',
  'shopVoucherTray',
  'shopBoosterTray',
  'packTray',
] as const satisfies readonly (keyof TableGeometry)[];

function rectsOverlap(a: RectPx, b: RectPx): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function assertGeometryInvariants(
  geom: TableGeometry,
  expectedMode: LayoutMode,
  w: number,
  h: number,
  insets: SafeInsets
): void {
  expect(geom.mode).toBe(expectedMode);
  expect(geom.viewportW).toBe(w);
  expect(geom.viewportH).toBe(h);
  expect(geom.safeInsets).toEqual(insets);

  // Every rect must have positive finite dimensions and remain strictly within viewport & safe insets
  const minX = insets.left;
  const maxX = w - insets.right;
  const minY = insets.top;
  const maxY = h - insets.bottom;

  for (const key of REQUIRED_RECT_KEYS) {
    const r = geom[key];
    expect(Number.isFinite(r.x), `${key}.x finite`).toBe(true);
    expect(Number.isFinite(r.y), `${key}.y finite`).toBe(true);
    expect(Number.isFinite(r.w), `${key}.w finite`).toBe(true);
    expect(Number.isFinite(r.h), `${key}.h finite`).toBe(true);

    expect(r.w, `${key}.w > 0 (${w}x${h})`).toBeGreaterThan(0);
    expect(r.h, `${key}.h > 0 (${w}x${h})`).toBeGreaterThan(0);

    // Strictly within [0, viewportW] x [0, viewportH]
    expect(r.x, `${key}.x >= 0 (${w}x${h})`).toBeGreaterThanOrEqual(0);
    expect(r.y, `${key}.y >= 0 (${w}x${h})`).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w, `${key}.right <= viewportW (${w}x${h})`).toBeLessThanOrEqual(w);
    expect(r.y + r.h, `${key}.bottom <= viewportH (${w}x${h})`).toBeLessThanOrEqual(h);

    // Respects safe-area insets
    expect(r.x, `${key}.x >= safe.left (${w}x${h})`).toBeGreaterThanOrEqual(minX);
    expect(r.y, `${key}.y >= safe.top (${w}x${h})`).toBeGreaterThanOrEqual(minY);
    expect(r.x + r.w, `${key}.right <= viewportW - safe.right (${w}x${h})`).toBeLessThanOrEqual(maxX);
    expect(r.y + r.h, `${key}.bottom <= viewportH - safe.bottom (${w}x${h})`).toBeLessThanOrEqual(maxY);
  }

  // Zero overlap between non-overlapping regions
  const nonOverlappingPairs: Array<[keyof TableGeometry, keyof TableGeometry]> = [
    ['hudDock', 'table'],
    ['jokerTray', 'consumableTray'],
    ['jokerTray', 'playArea'],
    ['consumableTray', 'playArea'],
    ['jokerTray', 'handTray'],
    ['consumableTray', 'handTray'],
    ['playArea', 'handTray'],
    ['handTray', 'actionBar'],
    ['handTray', 'deckPile'],
    ['deckPile', 'actionBar'],
    ['jokerTray', 'shopControls'],
    ['jokerTray', 'shopOfferTray'],
    ['shopControls', 'shopOfferTray'],
    ['shopControls', 'shopVoucherTray'],
    ['shopControls', 'shopBoosterTray'],
    ['shopOfferTray', 'shopVoucherTray'],
    ['shopOfferTray', 'shopBoosterTray'],
    ['shopVoucherTray', 'shopBoosterTray'],
    ['jokerTray', 'packTray'],
    ['packTray', 'handTray'],
  ];

  for (const [kA, kB] of nonOverlappingPairs) {
    const rA = geom[kA] as RectPx;
    const rB = geom[kB] as RectPx;
    expect(
      rectsOverlap(rA, rB),
      `Expected zero overlap between ${kA} (${JSON.stringify(rA)}) and ${kB} (${JSON.stringify(rB)}) on ${w}x${h}`
    ).toBe(false);
  }

  // Exact 71:95 card aspect ratio within rounding tolerance (<= 2px)
  expect(geom.cardW).toBeGreaterThan(0);
  expect(geom.cardH).toBeGreaterThan(0);
  expect(Math.abs(geom.cardW - geom.cardH * (71 / 95))).toBeLessThanOrEqual(2);
  expect(geom.highlightLift).toBeGreaterThan(0);
  expect(geom.pixelScale).toBeGreaterThan(0);
}

function enterPlayingState(seed = 'MOBILE_POLISH_RUN', jokers: string[] = []): SimState {
  let state = startRun('b_red', 1, seed).state;
  for (const key of jokers) {
    state = dispatchSim(state, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key }).state;
  }
  state = dispatchSim(state, { type: 'SELECT_BLIND' }).state;
  return state;
}

function settleScene(
  scene: CardSceneManager,
  state: SimState,
  w = 1280,
  h = 720,
  frames = 25
): void {
  for (let i = 0; i < frames; i++) {
    scene.syncAndStep(state, w, h, false, true, 0.05, i * 0.05);
  }
}

interface RecordedSfxCall {
  key: SoundKey;
  pitch?: number;
  volume?: number;
}

function createMockAudioEngine(): {
  audio: IAudioEngine;
  sfxCalls: RecordedSfxCall[];
  fireIntensities: number[];
} {
  const sfxCalls: RecordedSfxCall[] = [];
  const fireIntensities: number[] = [];
  const audio: IAudioEngine = {
    unlock: async () => {},
    setSettings: (_settings: Pick<RenderSettings, 'masterVolume' | 'musicVolume' | 'sfxVolume'>) => {},
    setCustomPack: async (_sounds: Record<SoundKey, string> | null) => {},
    setMusicContext: (_track: MusicTrackId, _intensity?: number) => {},
    setFireIntensity: (intensity: number) => {
      fireIntensities.push(intensity);
    },
    playSfx: (key: SoundKey, opts?: { pitch?: number; volume?: number }) => {
      sfxCalls.push({ key, pitch: opts?.pitch, volume: opts?.volume });
    },
    update: (_dt: number) => {},
    getMode: () => 'builtin',
    dispose: () => {},
  };
  return { audio, sfxCalls, fireIntensities };
}

// ===========================================================================
// 1. 3-Mode Responsive Table Geometry (computeTableGeometry)
// ===========================================================================

describe('3-Mode Responsive Table Geometry (computeTableGeometry)', () => {
  const desktopViewports: ReadonlyArray<{ label: string; w: number; h: number }> = [
    { label: 'HD 1280x720', w: 1280, h: 720 },
    { label: 'FHD 1920x1080', w: 1920, h: 1080 },
    { label: 'Laptop 1440x900', w: 1440, h: 900 },
    { label: 'Min Desktop 960x540', w: 960, h: 540 },
  ];

  const mobileLandscapeViewports: ReadonlyArray<{ label: string; w: number; h: number }> = [
    { label: 'Phone 14 Landscape 844x390', w: 844, h: 390 },
    { label: 'Phone SE Landscape 667x375', w: 667, h: 375 },
    { label: 'Pixel 7 Landscape 915x412', w: 915, h: 412 },
    { label: 'Compact Android Landscape 740x360', w: 740, h: 360 },
    { label: 'Phone X Landscape 812x375', w: 812, h: 375 },
    { label: 'Phone XR Landscape 896x414', w: 896, h: 414 },
  ];

  const mobilePortraitViewports: ReadonlyArray<{ label: string; w: number; h: number }> = [
    { label: 'Phone 14 Portrait 390x844', w: 390, h: 844 },
    { label: 'Phone SE Portrait 375x667', w: 375, h: 667 },
    { label: 'Pixel 7 Portrait 412x915', w: 412, h: 915 },
    { label: 'Compact Android Portrait 360x780', w: 360, h: 780 },
    { label: 'Tablet Portrait 768x1024', w: 768, h: 1024 },
  ];

  it('classifies desktop viewports and enforces bounds, non-overlap, and 71:95 aspect ratio', () => {
    for (const vp of desktopViewports) {
      const geom = computeTableGeometry(vp.w, vp.h, ZERO_INSETS);
      assertGeometryInvariants(geom, 'desktop', vp.w, vp.h, ZERO_INSETS);
      // Desktop left rail aligns with hudDock on the left of table
      expect(geom.hudDock).toEqual(geom.leftRail);
      expect(geom.hudDock.x + geom.hudDock.w).toBeLessThan(geom.table.x);
    }
  });

  it('classifies mobile-landscape viewports cleanly with zero insets and notched safe insets', () => {
    for (const vp of mobileLandscapeViewports) {
      for (const insets of [ZERO_INSETS, NOTCH_LANDSCAPE_INSETS]) {
        const geom = computeTableGeometry(vp.w, vp.h, insets);
        assertGeometryInvariants(geom, 'mobile-landscape', vp.w, vp.h, insets);
        expect(geom.compact).toBe(true);
        // Slim left HUD dock sits to the left of the felt table
        expect(geom.hudDock.x + geom.hudDock.w).toBeLessThan(geom.table.x);
      }
    }
  });

  it('classifies mobile-portrait viewports cleanly with zero insets and notched safe insets', () => {
    for (const vp of mobilePortraitViewports) {
      for (const insets of [ZERO_INSETS, NOTCH_PORTRAIT_INSETS]) {
        const geom = computeTableGeometry(vp.w, vp.h, insets);
        assertGeometryInvariants(geom, 'mobile-portrait', vp.w, vp.h, insets);
        expect(geom.compact).toBe(true);
        // Portrait top HUD dock spans above the felt table
        expect(geom.hudDock.y + geom.hudDock.h).toBeLessThan(geom.table.y);
      }
    }
  });

  it('handles mode boundary transitions and invalid/negative safe insets safely', () => {
    expect(computeTableGeometry(960, 540).mode).toBe('desktop');
    expect(computeTableGeometry(959, 540).mode).toBe('mobile-landscape');
    expect(computeTableGeometry(960, 539).mode).toBe('mobile-landscape');
    expect(computeTableGeometry(540, 540).mode).toBe('mobile-portrait');
    expect(computeTableGeometry(540, 960).mode).toBe('mobile-portrait');

    // Negative / NaN / fractional safe insets are sanitized cleanly
    const cleaned = computeTableGeometry(844, 390, {
      top: -12,
      right: 43.6,
      bottom: Number.NaN,
      left: 44.2,
    });
    expect(cleaned.safeInsets).toEqual({ top: 0, right: 44, bottom: 0, left: 44 });
    assertGeometryInvariants(cleaned, 'mobile-landscape', 844, 390, {
      top: 0,
      right: 44,
      bottom: 0,
      left: 44,
    });

    // Headless Node readSafeAreaInsets returns zero insets safely
    expect(readSafeAreaInsets()).toEqual(ZERO_INSETS);
  });
});

// ===========================================================================
// 2. Live Drag-Reorder Sibling Parting & Deck Thickness (CardSceneManager)
// ===========================================================================

describe('CardSceneManager — Live Drag-Reorder Sibling Parting & Deck Thickness', () => {
  it('parts hand siblings smoothly during drag, returns exact reorder indices, and resets on cancelDrag', () => {
    const state = enterPlayingState('HAND_DRAG_PARTING');
    expect(state.hand.length).toBe(8);

    const scene = new CardSceneManager();
    settleScene(scene, state, 1280, 720);

    const baseTx = state.hand.map((id) => scene.getVisualCardById(id)!.moveable.tx);
    for (let i = 1; i < baseTx.length; i++) {
      expect(baseTx[i]).toBeGreaterThan(baseTx[i - 1]!);
    }

    // --- Case A: Drag left-to-right (index 0 -> index 4) ---
    const firstId = state.hand[0]!;
    const firstCard = scene.getVisualCardById(firstId)!;
    scene.startDrag(firstId, firstCard.moveable.vx, firstCard.moveable.vy);
    expect(scene.getDraggingCard()?.id).toBe(firstId);
    expect(scene.getDragKind()).toBe('hand');
    expect(scene.getDragPreviewIndex()).toBe(0);
    expect(firstCard.moveable.dragging).toBe(true);

    scene.updateDrag(baseTx[4]!, firstCard.moveable.vy);
    expect(scene.getDragPreviewIndex()).toBe(4);

    // Step scene so sibling parting targets are computed
    scene.syncAndStep(state, 1280, 720, false, true, 1 / 60, 1);

    // Siblings 1..4 shift LEFT to make room; siblings 5..7 nudge RIGHT past the gap
    for (let i = 1; i <= 4; i++) {
      const sibling = scene.getVisualCardById(state.hand[i]!)!;
      expect(sibling.moveable.tx, `hand[${i}] should part left`).toBeLessThan(baseTx[i]!);
    }
    for (let i = 5; i < state.hand.length; i++) {
      const sibling = scene.getVisualCardById(state.hand[i]!)!;
      expect(sibling.moveable.tx, `hand[${i}] should nudge right`).toBeGreaterThan(baseTx[i]!);
    }
    const draggedVisual = scene.getVisualCardById(firstId)!;
    expect(draggedVisual.zIndex).toBe(200);
    expect(draggedVisual.moveable.tx).toBeCloseTo(baseTx[4]!, 3);

    const reorderRight = scene.endDrag();
    expect(reorderRight).toEqual({ kind: 'hand', fromIndex: 0, toIndex: 4 });
    expect(scene.getDraggingCard()).toBeNull();
    expect(scene.getDragKind()).toBeNull();
    expect(scene.getDragPreviewIndex()).toBeNull();
    expect(draggedVisual.moveable.dragging).toBe(false);

    // --- Case B: Drag right-to-left (index 6 -> index 1) ---
    settleScene(scene, state, 1280, 720, 10);
    const sixthId = state.hand[6]!;
    const sixthCard = scene.getVisualCardById(sixthId)!;
    scene.startDrag(sixthId, sixthCard.moveable.vx, sixthCard.moveable.vy);
    scene.updateDrag(baseTx[1]!, sixthCard.moveable.vy);
    expect(scene.getDragPreviewIndex()).toBe(1);
    scene.syncAndStep(state, 1280, 720, false, true, 1 / 60, 2);

    // Sibling 0 nudges left; siblings 1..5 shift RIGHT
    expect(scene.getVisualCardById(state.hand[0]!)!.moveable.tx).toBeLessThan(baseTx[0]!);
    for (let i = 1; i <= 5; i++) {
      expect(
        scene.getVisualCardById(state.hand[i]!)!.moveable.tx,
        `hand[${i}] should part right`
      ).toBeGreaterThan(baseTx[i]!);
    }
    expect(scene.endDrag()).toEqual({ kind: 'hand', fromIndex: 6, toIndex: 1 });

    // --- Case C: Dropping in original slot returns null ---
    settleScene(scene, state, 1280, 720, 10);
    const midId = state.hand[3]!;
    const midCard = scene.getVisualCardById(midId)!;
    scene.startDrag(midId, midCard.moveable.vx, midCard.moveable.vy);
    scene.updateDrag(baseTx[3]!, midCard.moveable.vy);
    expect(scene.endDrag()).toBeNull();

    // --- Case D: cancelDrag() resets drag state and restores sibling baseline targets ---
    scene.startDrag(firstId, firstCard.moveable.vx, firstCard.moveable.vy);
    scene.updateDrag(baseTx[5]!, firstCard.moveable.vy);
    scene.syncAndStep(state, 1280, 720, false, true, 1 / 60, 3);
    expect(scene.getDragPreviewIndex()).toBe(5);
    expect(scene.getVisualCardById(state.hand[2]!)!.moveable.tx).toBeLessThan(baseTx[2]!);

    scene.cancelDrag();
    expect(scene.getDraggingCard()).toBeNull();
    expect(scene.getDragKind()).toBeNull();
    expect(scene.getDragPreviewIndex()).toBeNull();
    expect(scene.getVisualCardById(firstId)!.moveable.dragging).toBe(false);

    scene.syncAndStep(state, 1280, 720, false, true, 1 / 60, 4);
    for (let i = 0; i < state.hand.length; i++) {
      expect(scene.getVisualCardById(state.hand[i]!)!.moveable.tx).toBeCloseTo(baseTx[i]!, 3);
    }
  });

  it('parts joker siblings cleanly during drag, returns exact reorder indices, and resets on cancelDrag', () => {
    const state = enterPlayingState('JOKER_DRAG_PARTING', [
      'j_joker',
      'j_blueprint',
      'j_greedy_joker',
      'j_lusty_joker',
    ]);
    expect(state.jokers.length).toBe(4);

    const scene = new CardSceneManager();
    settleScene(scene, state, 390, 844);

    const baseTx = state.jokers.map((j) => scene.getVisualCardById(j.id)!.moveable.tx);
    for (let i = 1; i < baseTx.length; i++) {
      expect(baseTx[i]).toBeGreaterThan(baseTx[i - 1]!);
    }

    // Drag leftmost joker (index 0) to rightmost slot (index 3)
    const j0 = state.jokers[0]!;
    const j0Vis = scene.getVisualCardById(j0.id)!;
    scene.startDrag(j0.id, j0Vis.moveable.vx, j0Vis.moveable.vy);
    expect(scene.getDragKind()).toBe('joker');
    expect(scene.getDragPreviewIndex()).toBe(0);

    scene.updateDrag(baseTx[3]!, j0Vis.moveable.vy);
    expect(scene.getDragPreviewIndex()).toBe(3);
    scene.syncAndStep(state, 390, 844, false, true, 1 / 60, 1);

    for (let i = 1; i <= 3; i++) {
      expect(scene.getVisualCardById(state.jokers[i]!.id)!.moveable.tx).toBeLessThan(baseTx[i]!);
    }
    expect(scene.endDrag()).toEqual({ kind: 'joker', fromIndex: 0, toIndex: 3 });

    // Drag rightmost joker (index 3) to index 1 then cancelDrag
    settleScene(scene, state, 390, 844, 10);
    const j3 = state.jokers[3]!;
    const j3Vis = scene.getVisualCardById(j3.id)!;
    scene.startDrag(j3.id, j3Vis.moveable.vx, j3Vis.moveable.vy);
    scene.updateDrag(baseTx[1]!, j3Vis.moveable.vy);
    scene.syncAndStep(state, 390, 844, false, true, 1 / 60, 2);

    expect(scene.getDragPreviewIndex()).toBe(1);
    expect(scene.getVisualCardById(state.jokers[1]!.id)!.moveable.tx).toBeGreaterThan(baseTx[1]!);
    expect(scene.getVisualCardById(state.jokers[2]!.id)!.moveable.tx).toBeGreaterThan(baseTx[2]!);

    scene.cancelDrag();
    expect(scene.getDraggingCard()).toBeNull();
    expect(scene.getDragPreviewIndex()).toBeNull();
    expect(j3Vis.moveable.dragging).toBe(false);

    scene.syncAndStep(state, 390, 844, false, true, 1 / 60, 3);
    for (let i = 0; i < state.jokers.length; i++) {
      expect(scene.getVisualCardById(state.jokers[i]!.id)!.moveable.tx).toBeCloseTo(baseTx[i]!, 3);
    }

    // Non-draggable entities (e.g. deck_pile) cannot be dragged
    const deckLayer = scene.getVisualCards().find((c) => c.kind === 'deck_pile');
    expect(deckLayer).toBeDefined();
    scene.startDrag(deckLayer!.id, deckLayer!.moveable.vx, deckLayer!.moveable.vy);
    expect(scene.getDraggingCard()).toBeNull();
    expect(scene.endDrag()).toBeNull();
  });

  it('scales deck pile visual stack thickness smoothly with remaining drawPile.length (0..4)', () => {
    const baseState = enterPlayingState('DECK_THICKNESS');
    expect(baseState.fullDeck.length).toBe(52);
    const allIds = baseState.fullDeck.map((c) => c.id);

    const cases: ReadonlyArray<{ remaining: number; expectedStack: number }> = [
      { remaining: 0, expectedStack: 0 },
      { remaining: 1, expectedStack: 1 },
      { remaining: 13, expectedStack: 1 },
      { remaining: 14, expectedStack: 2 },
      { remaining: 26, expectedStack: 2 },
      { remaining: 27, expectedStack: 3 },
      { remaining: 39, expectedStack: 3 },
      { remaining: 40, expectedStack: 4 },
      { remaining: 52, expectedStack: 4 },
    ];

    for (const [vw, vh] of [
      [1280, 720],
      [390, 844],
    ] as const) {
      const scene = new CardSceneManager();
      for (const tc of cases) {
        const state: SimState = {
          ...baseState,
          drawPile: allIds.slice(0, tc.remaining),
        };
        scene.syncAndStep(state, vw, vh, false, true, 1 / 60, 0);
        const layers = scene.getVisualCards().filter((v) => v.kind === 'deck_pile');
        expect(layers.length, `drawPile=${tc.remaining} on ${vw}x${vh}`).toBe(tc.expectedStack);

        for (let i = 0; i < layers.length; i++) {
          expect(layers[i]!.faceDown).toBe(true);
          expect(layers[i]!.draggable).toBe(false);
          if (i > 0) {
            expect(layers[i]!.zIndex).toBeGreaterThan(layers[i - 1]!.zIndex);
            // Stepped thickness offset creates visible 3D card stack
            expect(layers[i]!.moveable.tx).toBeGreaterThan(layers[i - 1]!.moveable.tx);
            expect(layers[i]!.moveable.ty).toBeLessThan(layers[i - 1]!.moveable.ty);
          }
        }
      }
    }
  });

  it('supports forgiving touch hit-padding on updateHover while preserving exact-hit priority', () => {
    const state = enterPlayingState('TOUCH_HIT_PAD', ['j_joker']);
    const scene = new CardSceneManager();
    settleScene(scene, state, 390, 844);

    const joker = scene.getVisualCardById(state.jokers[0]!.id)!;
    const m = joker.moveable;
    const justOutsideX = m.vx + m.vw * m.vScale * 0.5 + 5;
    const centerY = m.vy;

    // Exact mouse hit (0px pad) misses 5px outside the right edge
    expect(scene.updateHover(justOutsideX, centerY, 0)).toBeNull();
    // Touch hit-padding (10px) catches the same card cleanly
    expect(scene.updateHover(justOutsideX, centerY, 10)?.id).toBe(joker.id);
    // Way outside (20px) still misses even with 10px pad
    expect(scene.updateHover(m.vx + m.vw * m.vScale * 0.5 + 20, centerY, 10)).toBeNull();
  });
});

// ===========================================================================
// 3. InputManager — Mobile Touch Gestures & Scoring Fast-Forward
// ===========================================================================

describe('InputManager — Mobile Touch Gestures, Drag-Reorder & Scoring Fast-Forward', () => {
  type Listener = (e: unknown) => void;

  class FakeTarget {
    private listeners = new Map<string, Set<Listener>>();
    style = { cursor: 'default' };

    addEventListener(type: string, fn: Listener): void {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type)!.add(fn);
    }

    removeEventListener(type: string, fn: Listener): void {
      this.listeners.get(type)?.delete(fn);
    }

    dispatch(type: string, event: Record<string, unknown>): void {
      for (const fn of this.listeners.get(type) ?? []) {
        fn(event);
      }
    }

    getBoundingClientRect(): { left: number; top: number } {
      return { left: 0, top: 0 };
    }

    setPointerCapture(_id: number): void {}
    releasePointerCapture(_id: number): void {}
  }

  let prevWindow: unknown;

  beforeEach(() => {
    prevWindow = (globalThis as Record<string, unknown>).window;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (prevWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        value: prevWindow,
        configurable: true,
        writable: true,
      });
    }
  });

  function setupTouchHarness(state: SimState, vw = 390, vh = 844) {
    const win = new FakeTarget();
    const canvas = new FakeTarget();
    Object.defineProperty(globalThis, 'window', {
      value: win,
      configurable: true,
      writable: true,
    });

    const scene = new CardSceneManager();
    settleScene(scene, state, vw, vh);

    const dispatched: SimAction[] = [];
    const clicked: VisualCard[] = [];
    const longPressed: VisualCard[] = [];
    const dragSlotChanges: Array<{ kind: 'hand' | 'joker'; idx: number }> = [];
    const fastForwardStates: boolean[] = [];
    let swipeDeselectCount = 0;
    let tapDuringScoringCount = 0;

    let currentState = state;
    const cb: InputCallbacks = {
      getState: () => currentState,
      getKeybinds: () => DEFAULT_SETTINGS.keybinds,
      isModalOpen: () => false,
      isRebindingKey: () => false,
      onCaptureRebindKey: () => {},
      onDispatch: (action) => dispatched.push(action),
      onToggleRunInfo: () => {},
      onTogglePause: () => {},
      onToggleDebugDrawer: () => {},
      onCardClick: (card) => clicked.push(card),
      onHoverChange: () => {},
      onAudioUnlock: () => {},
      onLongPressCard: (card) => longPressed.push(card),
      onSwipeDeselect: () => {
        swipeDeselectCount++;
      },
      onDragSlotChange: (kind, idx) => dragSlotChanges.push({ kind, idx }),
      onTapDuringScoring: () => {
        tapDuringScoringCount++;
      },
      onScoringFastForward: (active) => fastForwardStates.push(active),
    };

    const input = new InputManager(canvas as unknown as HTMLCanvasElement, scene, cb);
    return {
      win,
      canvas,
      scene,
      input,
      setState: (next: SimState) => {
        currentState = next;
      },
      dispatched,
      clicked,
      longPressed,
      dragSlotChanges,
      fastForwardStates,
      getSwipeDeselectCount: () => swipeDeselectCount,
      getTapDuringScoringCount: () => tapDuringScoringCount,
    };
  }

  it('handles touch tap, long-press inspect, swipe-down deselect, drag-reorder, pointercancel, and scoring hold', () => {
    const state = enterPlayingState('TOUCH_GESTURES');
    const h = setupTouchHarness(state);

    // Rightmost hand card has the highest Z-index and is unobstructed on narrow portrait mobile
    const lastIdx = state.hand.length - 1;
    const cardLast = h.scene.getVisualCardById(state.hand[lastIdx]!)!;
    const cardTarget = h.scene.getVisualCardById(state.hand[2]!)!;

    // 1. Short touch tap -> onCardClick (not drag)
    h.canvas.dispatch('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: cardLast.moveable.vx,
      clientY: cardLast.moveable.vy,
    });
    h.win.dispatch('pointerup', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: cardLast.moveable.vx + 4,
      clientY: cardLast.moveable.vy + 2,
    });
    expect(h.clicked.map((c) => c.id)).toEqual([cardLast.id]);

    // 2. Touch long-press (320ms) -> onLongPressCard and suppresses click on release
    h.canvas.dispatch('pointerdown', {
      pointerId: 2,
      pointerType: 'touch',
      isPrimary: true,
      clientX: cardLast.moveable.vx,
      clientY: cardLast.moveable.vy,
    });
    vi.advanceTimersByTime(330);
    expect(h.longPressed.map((c) => c.id)).toEqual([cardLast.id]);
    h.win.dispatch('pointerup', {
      pointerId: 2,
      pointerType: 'touch',
      clientX: cardLast.moveable.vx,
      clientY: cardLast.moveable.vy,
    });
    expect(h.clicked).toHaveLength(1);

    // 3. Touch drag-reorder across slots -> fires onDragSlotChange & dispatches REORDER_HAND
    h.canvas.dispatch('pointerdown', {
      pointerId: 3,
      pointerType: 'touch',
      isPrimary: true,
      clientX: cardLast.moveable.vx,
      clientY: cardLast.moveable.vy,
    });
    // Secondary simultaneous touch is safely ignored
    h.canvas.dispatch('pointerdown', {
      pointerId: 99,
      pointerType: 'touch',
      isPrimary: false,
      clientX: cardTarget.moveable.vx,
      clientY: cardTarget.moveable.vy,
    });
    h.win.dispatch('pointermove', {
      pointerId: 3,
      pointerType: 'touch',
      clientX: cardTarget.moveable.vx,
      clientY: cardLast.moveable.vy,
    });
    expect(h.dragSlotChanges.length).toBeGreaterThan(0);
    expect(h.dragSlotChanges[h.dragSlotChanges.length - 1]).toEqual({ kind: 'hand', idx: 2 });

    h.win.dispatch('pointerup', {
      pointerId: 3,
      pointerType: 'touch',
      clientX: cardTarget.moveable.vx,
      clientY: cardLast.moveable.vy,
    });
    expect(h.dispatched).toContainEqual({ type: 'REORDER_HAND', fromIndex: lastIdx, toIndex: 2 });

    // 4. pointercancel during drag cancels cleanly without dispatching reorder
    const prevDispatches = h.dispatched.length;
    h.canvas.dispatch('pointerdown', {
      pointerId: 4,
      pointerType: 'touch',
      isPrimary: true,
      clientX: cardLast.moveable.vx,
      clientY: cardLast.moveable.vy,
    });
    h.win.dispatch('pointermove', {
      pointerId: 4,
      pointerType: 'touch',
      clientX: cardTarget.moveable.vx,
      clientY: cardLast.moveable.vy,
    });
    expect(h.scene.getDraggingCard()?.id).toBe(cardLast.id);
    h.win.dispatch('pointercancel', { pointerId: 4, pointerType: 'touch' });
    expect(h.scene.getDraggingCard()).toBeNull();
    expect(h.dispatched.length).toBe(prevDispatches);

    // 5. Downward swipe (>48px) with selected cards -> triggers swipe deselect
    const selectedState = dispatchSim(state, {
      type: 'TOGGLE_SELECT_CARD',
      cardId: cardLast.id,
    }).state;
    h.setState(selectedState);
    h.canvas.dispatch('pointerdown', {
      pointerId: 5,
      pointerType: 'touch',
      isPrimary: true,
      clientX: cardLast.moveable.vx,
      clientY: cardLast.moveable.vy,
    });
    h.win.dispatch('pointermove', {
      pointerId: 5,
      pointerType: 'touch',
      clientX: cardLast.moveable.vx + 4,
      clientY: cardLast.moveable.vy + 60,
    });
    h.win.dispatch('pointerup', {
      pointerId: 5,
      pointerType: 'touch',
      clientX: cardLast.moveable.vx + 4,
      clientY: cardLast.moveable.vy + 60,
    });
    expect(h.getSwipeDeselectCount()).toBe(1);

    // 6. Touch hold during SCORING toggles fast-forward on down/up and fires tap callback
    const scoringState: SimState = { ...selectedState, phase: 'SCORING' };
    h.setState(scoringState);
    h.canvas.dispatch('pointerdown', {
      pointerId: 6,
      pointerType: 'touch',
      isPrimary: true,
      clientX: 180,
      clientY: 420,
    });
    expect(h.fastForwardStates).toEqual([true]);
    h.win.dispatch('pointerup', {
      pointerId: 6,
      pointerType: 'touch',
      clientX: 182,
      clientY: 421,
    });
    expect(h.fastForwardStates).toEqual([true, false]);
    expect(h.getTapDuringScoringCount()).toBe(1);

    h.input.dispose();
  });
});

// ===========================================================================
// 4. ScoreChoreographer — Fast-Forward, Mobile Popup Clamping & Celebrations
// ===========================================================================

describe('ScoreChoreographer — Fast-Forward, Mobile Popup Clamping & Celebrations', () => {
  function buildScoringScenario(): { state: SimState; beats: ScoreBeat[]; sourceIds: string[] } {
    let state = enterPlayingState('CHOREO_TEST', ['j_joker', 'j_photograph']);
    const playCards = state.hand.slice(0, 3);
    state = {
      ...state,
      phase: 'SCORING',
      playArea: playCards,
      hand: state.hand.slice(3),
      lastHandName: 'Three of a Kind',
      targetChips: 300,
    };

    const j0 = state.jokers[0]!.id;
    const j1 = state.jokers[1]!.id;
    const c0 = playCards[0]!;
    const c1 = playCards[1]!;
    const c2 = playCards[2]!;

    const beats: ScoreBeat[] = [
      {
        id: 1,
        kind: 'hand_announce',
        sourceType: 'system',
        chipsAfter: 30,
        multAfter: 3,
        message: 'Three of a Kind',
        durationMs: 220,
      },
      {
        id: 2,
        kind: 'card_score',
        sourceType: 'card',
        sourceId: c0,
        chipsDelta: 10,
        chipsAfter: 40,
        multAfter: 3,
        pitchStep: 5,
        durationMs: 260,
      },
      {
        id: 3,
        kind: 'card_score',
        sourceType: 'card',
        sourceId: c1,
        chipsDelta: 10,
        chipsAfter: 50,
        multAfter: 3,
        pitchStep: 6,
        durationMs: 260,
      },
      {
        id: 4,
        kind: 'retrigger',
        sourceType: 'card',
        sourceId: c1,
        chipsAfter: 50,
        multAfter: 3,
        message: 'Again!',
        pitchStep: 7,
        durationMs: 220,
      },
      {
        id: 5,
        kind: 'card_score',
        sourceType: 'card',
        sourceId: c2,
        chipsDelta: 11,
        chipsAfter: 61,
        multAfter: 3,
        pitchStep: 8,
        durationMs: 260,
      },
      {
        id: 6,
        kind: 'joker_trigger',
        sourceType: 'joker',
        sourceId: j0,
        multDelta: 4,
        chipsAfter: 61,
        multAfter: 7,
        pitchStep: 9,
        durationMs: 280,
      },
      {
        id: 7,
        kind: 'joker_trigger',
        sourceType: 'joker',
        sourceId: j1,
        xMult: 2,
        chipsAfter: 61,
        multAfter: 14,
        pitchStep: 10,
        durationMs: 300,
      },
      {
        id: 8,
        kind: 'edition_trigger',
        sourceType: 'card',
        sourceId: c0,
        chipsDelta: 50,
        chipsAfter: 111,
        multAfter: 14,
        pitchStep: 11,
        durationMs: 240,
      },
      {
        id: 9,
        kind: 'hand_total',
        sourceType: 'system',
        chipsAfter: 111,
        multAfter: 14,
        pitchStep: 12,
        durationMs: 260,
      },
      {
        id: 10,
        kind: 'blind_clear',
        sourceType: 'system',
        chipsAfter: 111,
        multAfter: 14,
        message: 'BLIND CLEARED!',
        pitchStep: 13,
        durationMs: 240,
      },
    ];

    return { state, beats, sourceIds: [c0, c1, c1, c2, j0, j1, c0] };
  }

  function runChoreoPlayback(fastForward: boolean) {
    const { state, beats } = buildScoringScenario();
    const scene = new CardSceneManager();
    settleScene(scene, state, 1280, 720);

    const particles = new ParticleSystem();
    const choreo = new ScoreChoreographer();
    choreo.setParticleSystem(particles);
    choreo.setFastForward(fastForward);

    const { audio, sfxCalls } = createMockAudioEngine();

    // Spy on every source card's juiceUp and on spawnPopup
    const juicedIds: string[] = [];
    for (const vc of scene.getVisualCards()) {
      const origJuice = vc.moveable.juiceUp.bind(vc.moveable);
      vi.spyOn(vc.moveable, 'juiceUp').mockImplementation((amount, rot, now) => {
        juicedIds.push(vc.id);
        return origJuice(amount, rot, now);
      });
    }

    const spawnedPopups: string[] = [];
    const origSpawn = choreo.spawnPopup.bind(choreo);
    vi.spyOn(choreo, 'spawnPopup').mockImplementation((text, x, y, bg, fg, life, opts) => {
      spawnedPopups.push(text);
      return origSpawn(text, x, y, bg, fg, life, opts);
    });

    let completedCount = 0;
    choreo.start(state, beats, scene, audio, () => {
      completedCount++;
    });

    expect(choreo.isFastForwarding()).toBe(fastForward);
    expect(choreo.getDisplay().fastForward).toBe(fastForward);

    const dt = 1 / 60;
    let frames = 0;
    const maxFrames = 600;
    while (choreo.isActive() && frames < maxFrames) {
      choreo.update(dt, state, 1, scene, audio, false);
      frames++;
    }

    return {
      choreo,
      frames,
      completedCount,
      sfxCalls,
      juicedIds,
      spawnedPopups,
      display: choreo.getDisplay(),
      particleCount: particles.getActiveCount(),
    };
  }

  it('accelerates scoring smoothly with setFastForward(true) while firing EVERY beat audio, juice, and popup cleanly', () => {
    const { sourceIds } = buildScoringScenario();
    const normal = runChoreoPlayback(false);
    const fast = runChoreoPlayback(true);

    expect(normal.completedCount).toBe(1);
    expect(fast.completedCount).toBe(1);
    expect(normal.choreo.isActive()).toBe(false);
    expect(fast.choreo.isActive()).toBe(false);

    // Fast-forward completes substantially faster than 1x normal speed (~2.6x ramp)
    expect(fast.frames).toBeLessThan(Math.floor(normal.frames * 0.55));
    expect(fast.frames).toBeGreaterThan(0);

    // Zero skipped audio beats: identical ordered sound keys & pitches!
    expect(fast.sfxCalls.length).toBe(normal.sfxCalls.length);
    expect(fast.sfxCalls.length).toBeGreaterThanOrEqual(9);
    expect(fast.sfxCalls.map((c) => c.key)).toEqual(normal.sfxCalls.map((c) => c.key));
    expect(fast.sfxCalls.map((c) => c.pitch)).toEqual(normal.sfxCalls.map((c) => c.pitch));

    // Zero skipped juice triggers: every beat's source entity juiced in exact order!
    expect(normal.juicedIds).toEqual(sourceIds);
    expect(fast.juicedIds).toEqual(normal.juicedIds);

    // Zero skipped popups: identical popup sequence!
    expect(fast.spawnedPopups).toEqual(normal.spawnedPopups);
    expect(fast.spawnedPopups).toContain('Again!');
    expect(fast.spawnedPopups).toContain('+4 Mult');
    expect(fast.spawnedPopups).toContain('X2 Mult');
    expect(fast.spawnedPopups).toContain('BLIND CLEARED!');

    // Final displayed hand score matches 111 * 14 = 1554
    expect(normal.display.displayHandScore).toBe(1554);
    expect(fast.display.displayHandScore).toBe(1554);
    expect(fast.particleCount).toBeGreaterThan(0);

    // reset() cleanly disables fast-forward and clears popups
    fast.choreo.reset();
    expect(fast.choreo.isFastForwarding()).toBe(false);
    expect(fast.choreo.getDisplay().popups).toHaveLength(0);
  });

  it('clamps all floating popups strictly inside viewport bounds on narrow portrait (375x667) and short landscape (667x360)', () => {
    const compactViewports: ReadonlyArray<{ label: string; w: number; h: number }> = [
      { label: 'Narrow Portrait 375x667', w: 375, h: 667 },
      { label: 'Short Landscape 667x360', w: 667, h: 360 },
    ];

    for (const vp of compactViewports) {
      const { state, beats } = buildScoringScenario();
      const scene = new CardSceneManager();
      settleScene(scene, state, vp.w, vp.h);

      const choreo = new ScoreChoreographer();
      const particles = new ParticleSystem();
      choreo.setParticleSystem(particles);
      const { audio } = createMockAudioEngine();

      // Start scoring so viewport is synced and top-row Joker / overlapping beat popups spawn
      choreo.start(state, beats, scene, audio, () => {});

      // Inject extreme out-of-bounds and invalid coordinates directly
      choreo.spawnPopup('LEFT_OOB', -500, -300, PALETTE.CHIPS);
      choreo.spawnPopup('TOP_LEFT', 0, 0, PALETTE.MULT);
      choreo.spawnPopup('BOTTOM_RIGHT', vp.w + 400, vp.h + 400, PALETTE.MONEY);
      choreo.spawnPopup('EDGE_NEAR', vp.w - 2, vp.h - 2, PALETTE.ORANGE);
      choreo.spawnPopup('NAN_POS', Number.NaN, Number.POSITIVE_INFINITY, PALETTE.PURPLE);

      const assertAllClamped = (frame: number) => {
        for (const p of choreo.getDisplay().popups) {
          expect(Number.isFinite(p.x), `${vp.label} frame ${frame} x finite`).toBe(true);
          expect(Number.isFinite(p.y), `${vp.label} frame ${frame} y finite`).toBe(true);
          expect(p.x, `${vp.label} frame ${frame} popup "${p.text}" x >= 48`).toBeGreaterThanOrEqual(48);
          expect(p.x, `${vp.label} frame ${frame} popup "${p.text}" x <= w-48`).toBeLessThanOrEqual(vp.w - 48);
          expect(p.y, `${vp.label} frame ${frame} popup "${p.text}" y >= 26`).toBeGreaterThanOrEqual(26);
          expect(p.y, `${vp.label} frame ${frame} popup "${p.text}" y <= h-36`).toBeLessThanOrEqual(vp.h - 36);
        }
      };

      assertAllClamped(0);

      // Step through entire beat sequence & popup upward drift
      for (let f = 1; f <= 180; f++) {
        choreo.update(1 / 60, state, 2, scene, audio, false);
        assertAllClamped(f);
      }

      // Compact viewport caps active popup count to <= 14 to keep mobile screens uncluttered
      for (let i = 0; i < 25; i++) {
        choreo.spawnPopup(`P${i}`, vp.w * 0.5, vp.h * 0.5, PALETTE.CHIPS, '#ffffff', 2.0);
      }
      expect(choreo.getDisplay().popups.length).toBeLessThanOrEqual(14);
      assertAllClamped(999);
    }
  });

  it('executes triggerLevelUpCelebration and triggerRoundClearBurst safely with popups, particles, and flash', () => {
    const state = enterPlayingState('CELEBRATIONS');
    const scene = new CardSceneManager();
    settleScene(scene, state, 375, 667);

    const particles = new ParticleSystem();
    const choreo = new ScoreChoreographer();
    choreo.setParticleSystem(particles);
    const { audio, sfxCalls } = createMockAudioEngine();

    // Sync compact viewport into choreographer
    choreo.update(1 / 60, state, 1, scene, audio, false);

    // 1. Level-up celebration with label, audio, and extreme off-screen coords
    expect(() =>
      choreo.triggerLevelUpCelebration(-120, -40, 'Flush Lv.3', audio)
    ).not.toThrow();

    const afterLevelUp = choreo.getDisplay();
    expect(afterLevelUp.popups.some((p) => p.text === 'LEVEL UP!')).toBe(true);
    expect(afterLevelUp.popups.some((p) => p.text === 'Flush Lv.3')).toBe(true);
    for (const p of afterLevelUp.popups) {
      expect(p.x).toBeGreaterThanOrEqual(48);
      expect(p.x).toBeLessThanOrEqual(375 - 48);
      expect(p.y).toBeGreaterThanOrEqual(26);
      expect(p.y).toBeLessThanOrEqual(667 - 36);
    }
    expect(particles.getActiveCount()).toBeGreaterThan(0);
    expect(afterLevelUp.screenFlash).toBeGreaterThan(0);
    expect(sfxCalls.map((c) => c.key)).toEqual(['polychrome1', 'tarot1']);

    // 2. Round-clear burst emits starburst + celebrate particles and triggers golden flash
    particles.clear();
    expect(() => choreo.triggerRoundClearBurst(900, 900)).not.toThrow();
    expect(particles.getActiveCount()).toBeGreaterThan(0);
    expect(choreo.getDisplay().screenFlash).toBeGreaterThan(0);

    // 3. Safe without audio, without label, without ParticleSystem, and under reducedMotion
    choreo.setParticleSystem(null);
    choreo.update(1 / 60, state, 1, scene, audio, true); // enable reducedMotion
    expect(() => choreo.triggerLevelUpCelebration(180, 300, '')).not.toThrow();
    expect(() => choreo.triggerRoundClearBurst(180, 300)).not.toThrow();
  });
});

// ===========================================================================
// 5. SaveManager — Run History Persistence, Deduplication & Sanitization
// ===========================================================================

describe('SaveManager — Run History Persistence, Deduplication & Sanitization', () => {
  let store: Map<string, string>;
  let prevLocalStorage: Storage | undefined;

  beforeEach(() => {
    store = new Map<string, string>();
    prevLocalStorage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    const mockStorage: Storage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      removeItem: (k: string) => {
        store.delete(k);
      },
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    if (prevLocalStorage === undefined) {
      delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
    } else {
      Object.defineProperty(globalThis, 'localStorage', {
        value: prevLocalStorage,
        configurable: true,
        writable: true,
      });
    }
  });

  function makeFinishedState(opts: {
    seed: string;
    deckId?: string;
    stake?: SimState['stake'];
    ante?: number;
    round?: number;
    tick?: number;
    bestHand?: number;
    jokers?: string[];
    defeatedBy?: string | null;
    challengeId?: string | null;
  }): SimState {
    let state = startRun(opts.deckId ?? 'b_red', opts.stake ?? 1, opts.seed).state;
    for (const key of opts.jokers ?? []) {
      state = dispatchSim(state, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key }).state;
    }
    state = dispatchSim(state, { type: 'SELECT_BLIND' }).state;
    return {
      ...state,
      ante: opts.ante ?? state.ante,
      round: opts.round ?? state.round,
      tick: opts.tick ?? state.tick,
      challengeId: opts.challengeId ?? null,
      stats: {
        ...state.stats,
        bestHand: opts.bestHand ?? 1250,
        defeatedBy: opts.defeatedBy !== undefined ? opts.defeatedBy : null,
      },
    };
  }

  it('persists wins and losses newest-first, deduplicates identical runs, and survives save/reload round-trip', () => {
    const mgr = new SaveManager();

    const lossWithExplicitBoss = makeFinishedState({
      seed: 'HIST_LOSS_1',
      deckId: 'b_red',
      stake: 2,
      ante: 3,
      round: 8,
      tick: 42,
      bestHand: 4200,
      jokers: ['j_joker', 'j_greedy_joker'],
      defeatedBy: 'The Plant',
    });

    const lossFallbackBlind = makeFinishedState({
      seed: 'HIST_LOSS_2',
      deckId: 'b_blue',
      stake: 1,
      ante: 1,
      round: 1,
      tick: 15,
      bestHand: 220,
      jokers: ['j_half'],
      defeatedBy: null, // Should fall back to active blind name ("Small Blind")
    });

    const winRun = makeFinishedState({
      seed: 'HIST_WIN_1',
      deckId: 'b_plasma',
      stake: 4,
      ante: 8,
      round: 24,
      tick: 310,
      bestHand: 185000,
      jokers: ['j_blueprint', 'j_brainstorm'],
      defeatedBy: 'Ignored On Win',
      challengeId: 'c_omelette_1',
    });

    mgr.recordRunFinished(lossWithExplicitBoss, false);
    // Duplicate loss recording should be ignored
    mgr.recordRunFinished(lossWithExplicitBoss, false);

    mgr.recordRunFinished(lossFallbackBlind, false);

    // Recording win via recordRunWon + recordRunFinished must deduplicate to a single entry
    mgr.recordRunWon(winRun);
    mgr.recordRunFinished(winRun, true);

    const history = mgr.getRunHistory();
    expect(history).toHaveLength(3);
    expect(mgr.getProfile().runHistory).toHaveLength(3);

    // Newest first ordering: [winRun, lossFallbackBlind, lossWithExplicitBoss]
    expect(history[0]!.won).toBe(true);
    expect(history[0]!.seed).toBe('HIST_WIN_1');
    expect(history[0]!.deckId).toBe('b_plasma');
    expect(history[0]!.stake).toBe(4);
    expect(history[0]!.challengeId).toBe('c_omelette_1');
    expect(history[0]!.ante).toBe(8);
    expect(history[0]!.round).toBe(24);
    expect(history[0]!.bestHand).toBe(185000);
    expect(history[0]!.jokerKeys).toEqual(['j_blueprint', 'j_brainstorm']);
    expect(history[0]!.defeatedBy).toBeNull();

    expect(history[1]!.won).toBe(false);
    expect(history[1]!.seed).toBe('HIST_LOSS_2');
    expect(history[1]!.defeatedBy).toBe('Small Blind');

    expect(history[2]!.won).toBe(false);
    expect(history[2]!.seed).toBe('HIST_LOSS_1');
    expect(history[2]!.defeatedBy).toBe('The Plant');
    expect(history[2]!.jokerKeys).toEqual(['j_joker', 'j_greedy_joker']);

    // getRunHistory returns defensive copies so external mutation never corrupts internal save
    history[0]!.jokerKeys.push('j_mutated');
    expect(mgr.getProfile().runHistory![0]!.jokerKeys).toEqual(['j_blueprint', 'j_brainstorm']);

    // Reload into a brand-new SaveManager instance and verify full round-trip + post-reload dedup
    const reloaded = new SaveManager();
    expect(reloaded.getRunHistory()).toEqual(mgr.getRunHistory());

    reloaded.recordRunFinished(winRun, true);
    reloaded.recordRunFinished(lossWithExplicitBoss, false);
    expect(reloaded.getRunHistory()).toHaveLength(3);
  });

  it('caps profile.runHistory strictly at MAX_RUN_HISTORY (15) keeping the newest runs across reloads', () => {
    expect(MAX_RUN_HISTORY).toBe(15);
    const mgr = new SaveManager();

    for (let i = 1; i <= 20; i++) {
      const won = i % 3 === 0;
      const s = makeFinishedState({
        seed: `CAP_RUN_${i}`,
        ante: won ? 8 : ((i - 1) % 7) + 1,
        round: i,
        tick: i * 10,
        bestHand: i * 1000,
        jokers: ['j_joker'],
        defeatedBy: won ? null : 'The Hook',
      });
      mgr.recordRunFinished(s, won);
    }

    const history = mgr.getRunHistory();
    expect(history).toHaveLength(15);
    expect(history[0]!.seed).toBe('CAP_RUN_20');
    expect(history[14]!.seed).toBe('CAP_RUN_6');
    expect(history.some((e) => e.seed === 'CAP_RUN_5')).toBe(false);

    const reloaded = new SaveManager();
    expect(reloaded.getRunHistory()).toHaveLength(15);
    expect(reloaded.getRunHistory().map((e) => e.seed)).toEqual(history.map((e) => e.seed));
  });

  it('sanitizes corrupt runHistory payloads cleanly without breaking legacy saves', () => {
    // 1. Legacy save with NO runHistory property at all
    store.set(
      SAVE_STORAGE_KEY,
      JSON.stringify({
        version: SAVE_SCHEMA_VERSION,
        savedAt: '2026-01-01T00:00:00.000Z',
        settings: { ...DEFAULT_SETTINGS, gameSpeed: 2, crtAmount: 40 },
        profile: {
          discoveredJokers: ['j_joker', 'j_blueprint'],
          discoveredConsumables: ['c_hermit'],
          discoveredVouchers: [],
          discoveredBlinds: [],
          discoveredTags: [],
          deckMaxStake: { b_red: 3 },
          challengesCompleted: [],
          bestHandScore: 99999,
          runsPlayed: 12,
          runsWon: 4,
        },
        activeRun: null,
      })
    );

    const legacyMgr = new SaveManager();
    expect(legacyMgr.getSettings().gameSpeed).toBe(2);
    expect(legacyMgr.getSettings().crtAmount).toBe(40);
    expect(legacyMgr.getProfile().runsPlayed).toBe(12);
    expect(legacyMgr.getProfile().runsWon).toBe(4);
    expect(legacyMgr.getProfile().deckMaxStake['b_red']).toBe(3);
    expect(legacyMgr.getProfile().discoveredJokers).toEqual(['j_joker', 'j_blueprint']);
    expect(legacyMgr.getRunHistory()).toEqual([]);

    // 2. Non-array corrupt runHistory preserves valid profile & settings
    store.set(
      SAVE_STORAGE_KEY,
      JSON.stringify({
        version: SAVE_SCHEMA_VERSION,
        settings: { ...DEFAULT_SETTINGS, gameSpeed: 4 },
        profile: {
          discoveredJokers: ['j_cavendish'],
          runsPlayed: 7,
          runsWon: 2,
          runHistory: { corrupt: true },
        },
        activeRun: null,
      })
    );
    const nonArrayMgr = new SaveManager();
    expect(nonArrayMgr.getSettings().gameSpeed).toBe(4);
    expect(nonArrayMgr.getProfile().runsPlayed).toBe(7);
    expect(nonArrayMgr.getProfile().discoveredJokers).toEqual(['j_cavendish']);
    expect(nonArrayMgr.getRunHistory()).toEqual([]);

    // 3. Mixed valid, dirty, duplicate, and >15 entries in raw runHistory
    const manyValid = Array.from({ length: 18 }, (_, i) => ({
      id: `bulk_${i}`,
      finishedAt: '2026-02-01T00:00:00.000Z',
      won: i % 2 === 0,
      deckId: 'b_blue',
      stake: 2,
      seed: `BULK_${i}`,
      ante: 4,
      round: i + 1,
      bestHand: 5000 + i,
      jokerKeys: ['j_joker'],
      defeatedBy: i % 2 === 0 ? 'ShouldBeCleared' : 'The Wall',
    }));

    store.set(
      SAVE_STORAGE_KEY,
      JSON.stringify({
        version: SAVE_SCHEMA_VERSION,
        settings: { ...DEFAULT_SETTINGS, highContrastSuits: true },
        profile: {
          runsPlayed: 25,
          runsWon: 9,
          runHistory: [
            null,
            42,
            'not-an-object',
            {}, // missing deckId
            { deckId: '   ' }, // blank deckId
            {
              id: 'dirty_1',
              won: true,
              deckId: '  b_red  ',
              stake: 99, // invalid -> 1
              ante: -5, // clamped -> 0
              round: Number.NaN, // fallback -> 0
              bestHand: -100, // clamped -> 0
              jokerKeys: ['j_joker', 123, '', null, ...Array.from({ length: 30 }, (_, n) => `j_k_${n}`)],
              defeatedBy: 'The Plant', // must be null when won === true
            },
            {
              id: 'dirty_1', // duplicate id -> skipped
              won: false,
              deckId: 'b_red',
              stake: 1,
            },
            {
              // legacy entry without id / finishedAt
              deckId: 'b_green',
              stake: 3.9, // floored -> 3
              won: false,
              seed: 'LEGACY_NO_ID',
              ante: 5,
              round: 14,
              bestHand: 12345.9,
              jokerKeys: 'bad_type',
              defeatedBy: 'The Needle',
            },
            ...manyValid,
          ],
        },
        activeRun: null,
      })
    );

    const sanitizedMgr = new SaveManager();
    expect(sanitizedMgr.getSettings().highContrastSuits).toBe(true);
    expect(sanitizedMgr.getProfile().runsPlayed).toBe(25);
    expect(sanitizedMgr.getProfile().runsWon).toBe(9);

    const clean = sanitizedMgr.getRunHistory();
    expect(clean).toHaveLength(MAX_RUN_HISTORY);

    // Entry 0: sanitized dirty_1
    expect(clean[0]!.id).toBe('dirty_1');
    expect(clean[0]!.deckId).toBe('b_red');
    expect(clean[0]!.won).toBe(true);
    expect(clean[0]!.stake).toBe(1);
    expect(clean[0]!.ante).toBe(0);
    expect(clean[0]!.round).toBe(0);
    expect(clean[0]!.bestHand).toBe(0);
    expect(clean[0]!.defeatedBy).toBeNull();
    expect(clean[0]!.jokerKeys).toHaveLength(24);
    expect(clean[0]!.jokerKeys[0]).toBe('j_joker');
    expect(clean[0]!.finishedAt.length).toBeGreaterThan(0);

    // Entry 1: legacy entry without id got synthesized id & valid defaults
    expect(clean[1]!.id.startsWith('legacy:')).toBe(true);
    expect(clean[1]!.deckId).toBe('b_green');
    expect(clean[1]!.stake).toBe(3);
    expect(clean[1]!.bestHand).toBe(12345);
    expect(clean[1]!.jokerKeys).toEqual([]);
    expect(clean[1]!.defeatedBy).toBe('The Needle');

    // Remaining 13 entries from bulk list with defeatedBy cleared on wins
    expect(clean[2]!.id).toBe('bulk_0');
    expect(clean[2]!.won).toBe(true);
    expect(clean[2]!.defeatedBy).toBeNull();
    expect(clean[3]!.id).toBe('bulk_1');
    expect(clean[3]!.won).toBe(false);
    expect(clean[3]!.defeatedBy).toBe('The Wall');
  });
});

// ===========================================================================
// 6. AudioEngine — Mobile Lifecycle & Headless Node Safety
// ===========================================================================

describe('AudioEngine — Mobile Lifecycle & Headless Node Safety', () => {
  it('makes suspend(), resume(), and dispose() completely safe and idempotent in headless Node', async () => {
    const created = createAudioEngine();
    expect(created).toBeInstanceOf(AudioEngine);
    const engine = created as AudioEngine;

    // Pre-unlock suspend/resume calls are safe and idempotent
    expect(() => engine.suspend()).not.toThrow();
    expect(() => engine.suspend()).not.toThrow();
    expect(() => engine.resume()).not.toThrow();
    expect(() => engine.resume()).not.toThrow();

    await expect(engine.unlock()).resolves.toBeUndefined();
    expect(() => engine.suspend()).not.toThrow();
    expect(() => engine.playSfx('chips1')).not.toThrow();
    expect(() => engine.update(1 / 60)).not.toThrow();
    expect(() => engine.resume()).not.toThrow();
    expect(() => engine.resume()).not.toThrow();
    expect(() => engine.suspend()).not.toThrow();

    // Multiple dispose() calls are strictly idempotent
    expect(() => engine.dispose()).not.toThrow();
    expect(() => engine.dispose()).not.toThrow();
    expect(() => engine.dispose()).not.toThrow();

    // All lifecycle & playback calls after dispose() remain safe no-ops
    expect(() => engine.suspend()).not.toThrow();
    expect(() => engine.resume()).not.toThrow();
    await expect(engine.unlock()).resolves.toBeUndefined();
    expect(() => engine.playSfx('button')).not.toThrow();
    expect(() => engine.update(1 / 60)).not.toThrow();
    expect(() => engine.setMusicContext('music2', 0.8)).not.toThrow();
    expect(() => engine.setFireIntensity(0.5)).not.toThrow();
    await expect(engine.setCustomPack(null)).resolves.toBeUndefined();
  });

  describe('with mocked Web AudioContext & document visibilitychange', () => {
    let prevAudioContext: unknown;
    let prevDocument: unknown;

    beforeEach(() => {
      prevAudioContext = (globalThis as Record<string, unknown>).AudioContext;
      prevDocument = (globalThis as Record<string, unknown>).document;
    });

    afterEach(() => {
      if (prevAudioContext === undefined) {
        delete (globalThis as Record<string, unknown>).AudioContext;
      } else {
        Object.defineProperty(globalThis, 'AudioContext', {
          value: prevAudioContext,
          configurable: true,
          writable: true,
        });
      }
      if (prevDocument === undefined) {
        delete (globalThis as Record<string, unknown>).document;
      } else {
        Object.defineProperty(globalThis, 'document', {
          value: prevDocument,
          configurable: true,
          writable: true,
        });
      }
    });

    it('suspends/resumes on mobile tab backgrounding, respects manual suspend, and cleans up on dispose', async () => {
      const makeParam = (initial = 0) => ({
        value: initial,
        cancelScheduledValues: () => {},
        setTargetAtTime: () => {},
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      });

      const makeNode = () => ({
        connect: () => {},
        disconnect: () => {},
      });

      let suspendCalls = 0;
      let resumeCalls = 0;
      let closeCalls = 0;
      let ctxState: 'suspended' | 'running' | 'closed' = 'suspended';

      class MockAudioContext {
        sampleRate = 8000;
        currentTime = 0;
        destination = makeNode();
        get state() {
          return ctxState;
        }
        createDynamicsCompressor() {
          return {
            ...makeNode(),
            threshold: makeParam(-6),
            knee: makeParam(10),
            ratio: makeParam(12),
            attack: makeParam(0.002),
            release: makeParam(0.1),
          };
        }
        createGain() {
          return { ...makeNode(), gain: makeParam(1) };
        }
        createConvolver() {
          return { ...makeNode(), buffer: null };
        }
        createBiquadFilter() {
          return {
            ...makeNode(),
            type: 'lowpass',
            frequency: makeParam(440),
            Q: makeParam(1),
            gain: makeParam(0),
          };
        }
        createOscillator() {
          return {
            ...makeNode(),
            type: 'sine',
            frequency: makeParam(440),
            detune: makeParam(0),
            start: () => {},
            stop: () => {},
          };
        }
        createBufferSource() {
          return {
            ...makeNode(),
            buffer: null,
            loop: false,
            playbackRate: makeParam(1),
            onended: null,
            start: () => {},
            stop: () => {},
          };
        }
        createBuffer(channels: number, length: number) {
          const arrays = Array.from({ length: channels }, () => new Float32Array(length));
          return {
            duration: length / 8000,
            getChannelData: (ch: number) => arrays[ch]!,
          };
        }
        async resume() {
          resumeCalls++;
          if (ctxState !== 'closed') ctxState = 'running';
        }
        async suspend() {
          suspendCalls++;
          if (ctxState === 'running') ctxState = 'suspended';
        }
        async close() {
          closeCalls++;
          ctxState = 'closed';
        }
      }

      const visibilityListeners = new Set<() => void>();
      const fakeDoc = {
        hidden: false,
        visibilityState: 'visible' as 'visible' | 'hidden',
        addEventListener: (ev: string, fn: () => void) => {
          if (ev === 'visibilitychange') visibilityListeners.add(fn);
        },
        removeEventListener: (ev: string, fn: () => void) => {
          if (ev === 'visibilitychange') visibilityListeners.delete(fn);
        },
      };

      Object.defineProperty(globalThis, 'AudioContext', {
        value: MockAudioContext,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis, 'document', {
        value: fakeDoc,
        configurable: true,
        writable: true,
      });

      const engine = new AudioEngine();
      expect(visibilityListeners.size).toBe(1);

      // Unlock moves context to running
      await engine.unlock();
      expect(ctxState).toBe('running');
      expect(resumeCalls).toBe(1);

      // Tab backgrounded -> auto-suspends cleanly
      fakeDoc.hidden = true;
      fakeDoc.visibilityState = 'hidden';
      for (const fn of visibilityListeners) fn();
      expect(ctxState).toBe('suspended');
      expect(suspendCalls).toBe(1);

      // Tab foregrounded -> auto-resumes cleanly
      fakeDoc.hidden = false;
      fakeDoc.visibilityState = 'visible';
      for (const fn of visibilityListeners) fn();
      await Promise.resolve();
      expect(ctxState).toBe('running');
      expect(resumeCalls).toBe(2);

      // Manual suspend is idempotent and is NOT overridden by tab visibility return
      engine.suspend();
      engine.suspend();
      expect(ctxState).toBe('suspended');
      expect(suspendCalls).toBe(2);

      fakeDoc.hidden = true;
      fakeDoc.visibilityState = 'hidden';
      for (const fn of visibilityListeners) fn();
      fakeDoc.hidden = false;
      fakeDoc.visibilityState = 'visible';
      for (const fn of visibilityListeners) fn();
      expect(ctxState).toBe('suspended');
      expect(resumeCalls).toBe(2);

      // Manual resume restores running state cleanly and is idempotent
      engine.resume();
      await Promise.resolve();
      expect(ctxState).toBe('running');
      expect(resumeCalls).toBe(3);
      engine.resume();
      expect(resumeCalls).toBe(3);

      // Dispose detaches visibility listener and closes AudioContext exactly once
      engine.dispose();
      engine.dispose();
      expect(visibilityListeners.size).toBe(0);
      expect(closeCalls).toBe(1);
      expect(ctxState).toBe('closed');

      // Post-dispose suspend/resume are no-ops
      engine.suspend();
      engine.resume();
      expect(suspendCalls).toBe(2);
      expect(resumeCalls).toBe(3);
    });
  });
});
