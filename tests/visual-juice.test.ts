import { describe, expect, it, vi } from 'vitest';
import type {
  IAudioEngine,
  ScoreBeat,
  SimState,
  SoundKey,
} from '../src/contracts/index.ts';
import { CardSceneManager, Moveable, type VisualCard } from '../src/render/Moveable.ts';
import {
  PARTICLE_FLOATS_PER_INSTANCE,
  ParticleSystem,
} from '../src/render/ParticleSystem.ts';
import { ScoreChoreographer } from '../src/render/ScoreChoreographer.ts';
import {
  BACKGROUND_FRAG,
  CRT_FRAG,
  FLAME_FRAG,
  PARTICLE_FRAG,
  PARTICLE_VERT,
  SHADER_MODE,
  SPLASH_FRAG,
  SPRITE_FRAG,
} from '../src/render/shaders.ts';
import { dispatchSim, startRun } from '../src/sim/index.ts';

function makeMockAudio(): IAudioEngine & {
  sfxCalls: Array<{ key: SoundKey; pitch?: number }>;
  fireIntensities: number[];
} {
  const sfxCalls: Array<{ key: SoundKey; pitch?: number }> = [];
  const fireIntensities: number[] = [];
  return {
    sfxCalls,
    fireIntensities,
    unlock: vi.fn(async () => {}),
    setSettings: vi.fn(),
    setCustomPack: vi.fn(async () => {}),
    getMode: () => 'builtin',
    update: vi.fn(),
    playSfx: (key, opts) => {
      sfxCalls.push({ key, pitch: opts?.pitch });
    },
    setMusicContext: vi.fn(),
    setFireIntensity: (intensity) => {
      fireIntensities.push(intensity);
    },
    dispose: vi.fn(),
  };
}

function makeMoveableAt(x: number, y: number, w = 96, h = 128): Moveable {
  const m = new Moveable();
  m.tx = x;
  m.ty = y;
  m.tw = w;
  m.th = h;
  m.snapToTarget();
  return m;
}

function makeVisualCard(overrides: Partial<VisualCard> = {}): VisualCard {
  return {
    id: 'vc_test',
    kind: 'joker',
    index: 0,
    baseAtlas: 'Joker',
    basePos: { x: 0, y: 0 },
    stickers: [],
    edition: 'e_polychrome',
    enhancement: 'none',
    seal: 'none',
    debuffed: false,
    faceDown: false,
    selected: false,
    draggable: true,
    moveable: makeMoveableAt(400, 200),
    zIndex: 10,
    ...overrides,
  };
}

describe('Visual Juice & Holographic Shader Contracts', () => {
  it('defines all 19 card/item shader modes with unique numeric ids', () => {
    const entries = Object.entries(SHADER_MODE);
    expect(entries.length).toBe(19);
    const values = new Set(entries.map(([, v]) => v));
    expect(values.size).toBe(19);
    expect(SHADER_MODE.CARD_GLOSS).toBe(13);
    expect(SHADER_MODE.GLASS_SHIMMER).toBe(14);
    expect(SHADER_MODE.STEEL_METALLIC).toBe(15);
    expect(SHADER_MODE.GOLD_FOIL).toBe(16);
    expect(SHADER_MODE.COSMIC_SHEEN).toBe(17);
    expect(SHADER_MODE.EDITION_AURA).toBe(18);
  });

  it('includes required visual-juice GLSL uniforms & helpers across all shader passes', () => {
    expect(BACKGROUND_FRAG).toContain('uniform float u_flameHeat;');
    expect(SPLASH_FRAG).toContain('centerGlow');

    expect(SPRITE_FRAG).toContain('uniform float u_triggerGlow;');
    expect(SPRITE_FRAG).toContain('float pixelSparkle(');
    expect(SPRITE_FRAG).toContain('float glossySweep(');
    for (const mode of [1, 2, 3, 4, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18]) {
      expect(SPRITE_FRAG, `SPRITE_FRAG handles mode ${mode}`).toContain(
        `u_shaderMode == ${mode}`
      );
    }

    expect(FLAME_FRAG).toContain('FLAME_PIXEL_FAC');
    expect(FLAME_FRAG).toContain('haloMask');
    expect(FLAME_FRAG).toContain('whiteCore');

    expect(PARTICLE_VERT).toContain('a_shape > 3.5');
    expect(PARTICLE_FRAG).toContain('v_shape > 3.5');
    expect(PARTICLE_FRAG).toContain('v_shape > 2.5');

    expect(CRT_FRAG).toContain('uniform float u_bloomBoost;');
  });
});

describe('Moveable Trigger Flash & Punchy Juice', () => {
  it('flashes triggerGlow on scoring hit and decays smoothly to zero', () => {
    const m = makeMoveableAt(300, 200);
    expect(m.triggerGlow).toBe(0);

    m.flashTrigger(1.0);
    expect(m.triggerGlow).toBe(1.0);

    // Non-destructive max behavior
    m.flashTrigger(0.4);
    expect(m.triggerGlow).toBe(1.0);

    for (let i = 0; i < 40; i++) {
      m.step(1 / 60, i / 60, false, 1);
    }
    expect(m.triggerGlow).toBeLessThan(0.1);
  });

  it('decays triggerGlow smoothly to zero under reducedMotion without motion bounce', () => {
    const m = makeMoveableAt(300, 200);
    m.flashTrigger(0.95);
    m.step(1 / 60, 0.1, true, 1);
    expect(m.triggerGlow).toBeLessThan(0.95);
    for (let i = 0; i < 30; i++) {
      m.step(1 / 60, 0.1 + i / 60, true, 1);
    }
    expect(m.triggerGlow).toBe(0);
  });
});

describe('ParticleSystem Layers, Sparkle Stars & HUD Flame Embers', () => {
  it('separates table sparkles from hud flame embers via packInstanceData(layer)', () => {
    const ps = new ParticleSystem();
    ps.emitHoloSparkle(500, 200, 'e_polychrome', 1.2);
    ps.emitFlameIgnitionBurst(
      { x: 20, y: 180, w: 96, h: 140 },
      { x: 130, y: 180, w: 96, h: 140 },
      6.5
    );

    const all = ps.packInstanceData();
    const tableOnly = ps.packInstanceData('table');
    const hudOnly = ps.packInstanceData('hud');

    expect(tableOnly.count).toBeGreaterThan(0);
    expect(hudOnly.count).toBeGreaterThan(0);
    expect(tableOnly.count + hudOnly.count).toBe(all.count);

    // Verify new shapes (3 = 4-point sparkle star, 4 = rising flame wisp) are packed cleanly
    const hudShapes = new Set<number>();
    for (let i = 0; i < hudOnly.count; i++) {
      hudShapes.add(hudOnly.data[i * PARTICLE_FLOATS_PER_INSTANCE + 8]!);
    }
    expect(hudShapes.has(3) || hudShapes.has(4)).toBe(true);
  });

  it('emits ambient card glints on shiny cards and respects reducedMotion', () => {
    const ps = new ParticleSystem();
    const shinyCards: VisualCard[] = [
      makeVisualCard({ id: 'j1', edition: 'e_holo' }),
      makeVisualCard({ id: 'j2', edition: 'e_polychrome' }),
      makeVisualCard({ id: 'v1', edition: 'none', overlayEffect: 'voucher' }),
    ];

    for (let i = 0; i < 30; i++) {
      ps.update(1 / 60, 1280, 720, 'PLAYING', null, false, shinyCards);
    }
    expect(ps.getActiveCount()).toBeGreaterThan(0);

    // Under reducedMotion, no new ambient sparkles or flame embers spawn
    ps.clear();
    const anchor = {
      chipsRect: { x: 20, y: 150, w: 100, h: 180 },
      multRect: { x: 130, y: 150, w: 100, h: 180 },
      intensity: 8,
    };
    for (let i = 0; i < 30; i++) {
      ps.update(1 / 60, 1280, 720, 'SCORING', anchor, true, shinyCards);
    }
    expect(ps.getActiveCount()).toBe(0);
  });
});

describe('ScoreChoreographer Roaring Flames & Ignition Timing', () => {
  it('does NOT falsely ignite flames on beat 0 before accumulated score beats blind target', () => {
    let state: SimState = startRun('b_red', 1, 'FLAME_TIMING').state;
    state = dispatchSim(state, { type: 'SELECT_BLIND' }).state;

    // Simulate SimEngine state during SCORING where roundChips ALREADY includes lastHandScore (5000)
    // while beat 0 is still only 10 x 2 = 20 (< target 300).
    const scoringState: SimState = {
      ...state,
      phase: 'SCORING',
      targetChips: 300,
      roundChips: 5000,
      lastHandScore: 5000,
      lastHandName: 'Pair',
    };

    const beats: ScoreBeat[] = [
      {
        id: 1,
        kind: 'hand_announce',
        sourceType: 'system',
        chipsAfter: 10,
        multAfter: 2,
        durationMs: 300,
      },
      {
        id: 2,
        kind: 'joker_trigger',
        sourceType: 'joker',
        xMult: 5,
        chipsAfter: 100,
        multAfter: 50,
        message: 'X5 Mult',
        durationMs: 300,
      },
      {
        id: 3,
        kind: 'hand_total',
        sourceType: 'system',
        chipsAfter: 100,
        multAfter: 50,
        durationMs: 300,
      },
    ];

    const scene = new CardSceneManager();
    scene.syncAndStep(scoringState, 1280, 720, false, true, 0.05, 0);
    const audio = makeMockAudio();
    const ps = new ParticleSystem();
    const choreo = new ScoreChoreographer();
    choreo.setParticleSystem(ps);
    choreo.setFlameAnchor({
      chipsRect: { x: 20, y: 150, w: 100, h: 180 },
      multRect: { x: 130, y: 150, w: 100, h: 180 },
      intensity: 0,
    });

    choreo.start(scoringState, beats, scene, audio, () => {});
    // Step 1 frame while still on beat 0 (10 x 2 = 20 < 300)
    choreo.update(1 / 60, scoringState, 1, scene, audio, false);
    expect(choreo.getFlameIntensity()).toBe(0);

    // Advance past beat 0 into beat 1 (100 x 50 = 5000 >> 300): flames MUST erupt boldly!
    for (let i = 0; i < 30; i++) {
      choreo.update(1 / 60, scoringState, 1, scene, audio, false);
    }
    expect(choreo.getFlameIntensity()).toBeGreaterThan(5.0);
    expect(ps.packInstanceData('hud').count).toBeGreaterThan(0);

    // Soft fadeout when exiting SCORING decays smoothly instead of snapping to 0 immediately
    const peakFlame = choreo.getFlameIntensity();
    choreo.endScoringSoft();
    expect(choreo.isActive()).toBe(false);
    expect(choreo.getFlameIntensity()).toBeCloseTo(peakFlame, 1);

    const idleState: SimState = { ...scoringState, phase: 'CASHOUT' };
    for (let i = 0; i < 120; i++) {
      choreo.update(1 / 60, idleState, 1, scene, audio, false);
    }
    expect(choreo.getFlameIntensity()).toBe(0);
  });

  it('ignites victorious finishing-hand flames when pre-hand roundChips + beat score defeats blind', () => {
    let state: SimState = startRun('b_red', 1, 'FINISH_FLAME').state;
    state = dispatchSim(state, { type: 'SELECT_BLIND' }).state;

    // Pre-hand roundChips = 220, this hand earns 120 -> total 340 >= 300!
    const scoringState: SimState = {
      ...state,
      phase: 'SCORING',
      targetChips: 300,
      roundChips: 340,
      lastHandScore: 120,
      lastHandName: 'Pair',
    };

    const beats: ScoreBeat[] = [
      {
        id: 1,
        kind: 'card_score',
        sourceType: 'card',
        chipsAfter: 60,
        multAfter: 2,
        durationMs: 300,
      },
    ];

    const scene = new CardSceneManager();
    scene.syncAndStep(scoringState, 1280, 720, false, true, 0.05, 0);
    const audio = makeMockAudio();
    const choreo = new ScoreChoreographer();

    choreo.start(scoringState, beats, scene, audio, () => {});
    for (let i = 0; i < 10; i++) {
      choreo.update(1 / 60, scoringState, 1, scene, audio, false);
    }
    expect(choreo.getFlameIntensity()).toBeGreaterThan(1.5);
  });
});
