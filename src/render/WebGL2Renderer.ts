// ============================================================================
// Krunked Cards — Multi-Pass WebGL2 Renderer (Visual Juice++)
// Pass 1A: Title Splash Vortex (splash.fs)
// Pass 1B: Gameplay Felt Swirl (background.fs + flame-reactive ambient heat)
// Pass 2:  Crisp NEAREST Card & Sprite Quads (drop shadow + prismatic edition
//          & trigger rim aura + base + face + 2-layer floating soulPos parallax
//          & hologram.fs + translucent Foil / Negative Shine / Booster Mylar /
//          Voucher Gold / Glass / Steel / Gold / Cosmic / 3D Laminated Gloss +
//          Holo / Polychrome / Debuff / Dissolve / GoldSeal + 3D skew & flips)
// Pass 3:  Dedicated Unobstructed HUD Flame Overlay Canvas (#kc-hud-flame-canvas)
//          at z-index 6 (behind Chips/Mult pills, in front of rail backdrop!)
//          rendering colossal multi-band flame.fs pillars + soaring HUD embers!
// Pass 3B: Crisp Instanced Table Particles (squares, diamonds, glass shards,
//          4-point holographic sparkle stars, flame wisps)
// Pass 3C: Impact / Entry Radial Pixel Flash (flash.fs)
// Pass 4:  Screen Vortex Warp + Luminous Specular Bloom + Tuned CRT Post-Pass
// ============================================================================

import {
  ATLAS_KEYS,
  ATLAS_SPECS,
  type AtlasKey,
  type EditionId,
  type GamePhase,
  type RenderSettings,
} from '../contracts/index.ts';
import type { AtlasImageSource, PackManager } from '../assets/PackManager.ts';
import type { CardShapeKind, RectPx, VisualCard } from './Moveable.ts';
import {
  MAX_PARTICLES,
  PARTICLE_FLOATS_PER_INSTANCE,
  type ParticleSystem,
} from './ParticleSystem.ts';
import {
  BACKGROUND_FRAG,
  BACKGROUND_VERT,
  compileProgram,
  CRT_FRAG,
  CRT_VERT,
  FLAME_FRAG,
  FLAME_VERT,
  FLASH_FRAG,
  FLASH_VERT,
  PARTICLE_FRAG,
  PARTICLE_VERT,
  SHADER_MODE,
  SPLASH_FRAG,
  SPLASH_VERT,
  SPRITE_FRAG,
  SPRITE_VERT,
  type ShaderMode,
} from './shaders.ts';

type Rgba = [number, number, number, number];

export interface FlameAnchor {
  chipsRect: RectPx;
  multRect: RectPx;
  intensity: number; // 0 = off, >0 = roaring log5 intensity
}

export interface RenderFrameInput {
  timeSec: number;
  dt: number;
  phase: GamePhase;
  bossColor: string | null;
  cards: readonly VisualCard[];
  mouseX: number;
  mouseY: number;
  settings: RenderSettings;
  flameAnchor: FlameAnchor | null;
  // Optional visual polish inputs (backwards-compatible)
  particles?: ParticleSystem | null;
  screenFlash?: number;
  screenFlashColor?: [number, number, number];
  shakeX?: number;
  shakeY?: number;
  activeSourceId?: string | null;
}

interface BgPaletteTarget {
  c1: Rgba;
  c2: Rgba;
  c3: Rgba;
  contrast: number;
  spinAmount: number;
}

interface UniformCache {
  splash: {
    res: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    vortSpeed: WebGLUniformLocation | null;
    c1: WebGLUniformLocation | null;
    c2: WebGLUniformLocation | null;
    midFlash: WebGLUniformLocation | null;
    vortOffset: WebGLUniformLocation | null;
  };
  bg: {
    res: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    spinTime: WebGLUniformLocation | null;
    c1: WebGLUniformLocation | null;
    c2: WebGLUniformLocation | null;
    c3: WebGLUniformLocation | null;
    contrast: WebGLUniformLocation | null;
    spinAmount: WebGLUniformLocation | null;
    flameHeat: WebGLUniformLocation | null;
  };
  sprite: {
    res: WebGLUniformLocation | null;
    center: WebGLUniformLocation | null;
    size: WebGLUniformLocation | null;
    rot: WebGLUniformLocation | null;
    uvRect: WebGLUniformLocation | null;
    tilt: WebGLUniformLocation | null;
    hovering: WebGLUniformLocation | null;
    mousePos: WebGLUniformLocation | null;
    shakeOffset: WebGLUniformLocation | null;
    tex: WebGLUniformLocation | null;
    mode: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    effect: WebGLUniformLocation | null;
    dissolve: WebGLUniformLocation | null;
    shadow: WebGLUniformLocation | null;
    tint: WebGLUniformLocation | null;
    cellPx: WebGLUniformLocation | null;
    burn1: WebGLUniformLocation | null;
    burn2: WebGLUniformLocation | null;
    triggerGlow: WebGLUniformLocation | null;
  };
  flame: {
    res: WebGLUniformLocation | null;
    rect: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    amount: WebGLUniformLocation | null;
    c1: WebGLUniformLocation | null;
    c2: WebGLUniformLocation | null;
    id: WebGLUniformLocation | null;
  };
  particle: {
    res: WebGLUniformLocation | null;
    shakeOffset: WebGLUniformLocation | null;
  };
  flash: {
    res: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    midFlash: WebGLUniformLocation | null;
    flashColor: WebGLUniformLocation | null;
  };
  crt: {
    sceneTex: WebGLUniformLocation | null;
    res: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    crtAmount: WebGLUniformLocation | null;
    vortexStrength: WebGLUniformLocation | null;
    vortexAmt: WebGLUniformLocation | null;
    glitchIntensity: WebGLUniformLocation | null;
    bloomBoost: WebGLUniformLocation | null;
  };
}

interface HudFlameGlState {
  gl: WebGL2RenderingContext;
  flameProg: WebGLProgram;
  particleProg: WebGLProgram;
  quadVao: WebGLVertexArrayObject;
  quadVbo: WebGLBuffer;
  particleVao: WebGLVertexArrayObject;
  particleVbo: WebGLBuffer;
  uFlame: {
    res: WebGLUniformLocation | null;
    rect: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    amount: WebGLUniformLocation | null;
    c1: WebGLUniformLocation | null;
    c2: WebGLUniformLocation | null;
    id: WebGLUniformLocation | null;
  };
  uParticle: {
    res: WebGLUniformLocation | null;
    shakeOffset: WebGLUniformLocation | null;
  };
}

function hexToRgba(hex: string, alpha = 1): Rgba {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  if (Number.isNaN(num)) return [0.24, 0.58, 0.44, alpha];
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255, alpha];
}

function darken(c: Rgba, factor: number): Rgba {
  return [c[0] * factor, c[1] * factor, c[2] * factor, c[3]];
}

function lerpRgba(a: Rgba, b: Rgba, k: number): Rgba {
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
    a[3] + (b[3] - a[3]) * k,
  ];
}

function getTargetBgPalette(phase: GamePhase, bossColor: string | null): BgPaletteTarget {
  if (phase === 'TITLE') {
    return {
      c1: hexToRgba('#de443b'),
      c2: hexToRgba('#006bb4'),
      c3: hexToRgba('#162325'),
      contrast: 3.5,
      spinAmount: 0.28,
    };
  }
  if (phase === 'SHOP') {
    return {
      c1: hexToRgba('#b83b54'),
      c2: hexToRgba('#344e63'),
      c3: hexToRgba('#1b242c'),
      contrast: 3.0,
      spinAmount: 0.18,
    };
  }
  if (phase === 'PACK_OPEN') {
    return {
      c1: hexToRgba('#6d46b8'),
      c2: hexToRgba('#2366a3'),
      c3: hexToRgba('#14192e'),
      contrast: 3.3,
      spinAmount: 0.25,
    };
  }
  if (phase === 'VICTORY') {
    return {
      c1: hexToRgba('#e6a82e'),
      c2: hexToRgba('#2f8564'),
      c3: hexToRgba('#1b2a26'),
      contrast: 3.1,
      spinAmount: 0.30,
    };
  }
  if (phase === 'GAME_OVER') {
    return {
      c1: hexToRgba('#8f2828'),
      c2: hexToRgba('#262c33'),
      c3: hexToRgba('#121519'),
      contrast: 2.7,
      spinAmount: 0.12,
    };
  }
  if (bossColor && (phase === 'PLAYING' || phase === 'SCORING' || phase === 'CASHOUT')) {
    const bc = hexToRgba(bossColor);
    return {
      c1: bc,
      c2: darken(bc, 0.56),
      c3: hexToRgba('#182328'),
      contrast: 3.1,
      spinAmount: 0.24,
    };
  }
  // Vibrant rich casino-green emerald felt swirl for Small/Big Blind & Blind Select
  return {
    c1: hexToRgba('#43a078'),
    c2: hexToRgba('#1e6b4f'),
    c3: hexToRgba('#152e29'),
    contrast: 3.0,
    spinAmount: 0.16,
  };
}

function getPrimaryCardMode(edition: EditionId, debuffed: boolean, nonScoring: boolean): ShaderMode {
  if (debuffed) return SHADER_MODE.DEBUFF;
  if (nonScoring) return SHADER_MODE.PLAYED;
  switch (edition) {
    case 'e_holo':
      return SHADER_MODE.HOLO;
    case 'e_polychrome':
      return SHADER_MODE.POLYCHROME;
    case 'e_negative':
      return SHADER_MODE.NEGATIVE;
    // e_foil renders crisp base first, followed by liquid-chrome foil.fs overlay pass!
    default:
      return SHADER_MODE.BASE;
  }
}

export class WebGL2Renderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private packManager: PackManager;

  // Dedicated high-Z HUD Flame Overlay Canvas (blazes IN FRONT of rail backdrop, BEHIND Chips/Mult pills!)
  private hudCanvas: HTMLCanvasElement | null = null;
  private hudGl: HudFlameGlState | null = null;
  private hudCtx2d: CanvasRenderingContext2D | null = null;
  private hudContextLost = false;
  private hudDirty = false;
  private boundHudContextLost: ((e: Event) => void) | null = null;
  private boundHudContextRestored: (() => void) | null = null;

  // WebGL2 programs & buffers
  private splashProg: WebGLProgram | null = null;
  private bgProg: WebGLProgram | null = null;
  private spriteProg: WebGLProgram | null = null;
  private flameProg: WebGLProgram | null = null;
  private particleProg: WebGLProgram | null = null;
  private flashProg: WebGLProgram | null = null;
  private crtProg: WebGLProgram | null = null;
  private uniforms: UniformCache | null = null;

  private emptyVao: WebGLVertexArrayObject | null = null;
  private quadVao: WebGLVertexArrayObject | null = null;
  private quadVbo: WebGLBuffer | null = null;
  private particleVao: WebGLVertexArrayObject | null = null;
  private particleInstanceVbo: WebGLBuffer | null = null;

  // Scene FBO for Vortex + Luminous Bloom + CRT post-pass
  private sceneFbo: WebGLFramebuffer | null = null;
  private sceneTex: WebGLTexture | null = null;
  private fboW = 0;
  private fboH = 0;

  // Cached GL textures per AtlasKey
  private textures = new Map<AtlasKey, WebGLTexture>();

  // Auto-measured tight UV height crop ratios for non-standard Joker sprites
  private jokerCropMap: Record<Exclude<CardShapeKind, 'wee'>, number> = {
    half: 0.66,
    square: 0.76,
    photo: 0.85,
  };

  // Smooth animated background palette & transition effects
  private bgCurrent: BgPaletteTarget = getTargetBgPalette('TITLE', null);
  private spinTime = 0;
  private splashElapsed = 0;
  private titleMidFlash = 0.28;
  private lastPhase: GamePhase | null = null;

  // Screen vortex warp pulse (vortex.fs) & brief CRT glitch impulse
  private vortexElapsed = 99;
  private vortexDuration = 0.68;
  private vortexPeakAmt = 4.5;
  private glitchIntensity = 0;

  // Telemetry
  private lastDrawCalls = 0;
  private lastActiveShaders: string[] = [];
  private cssW = 1280;
  private cssH = 720;
  private dpr = 1;
  private contextLost = false;
  private boundContextLost: (e: Event) => void;
  private boundContextRestored: () => void;

  constructor(canvas: HTMLCanvasElement, packManager: PackManager) {
    this.canvas = canvas;
    this.packManager = packManager;
    this.boundContextLost = this.handleContextLost.bind(this);
    this.boundContextRestored = this.handleContextRestored.bind(this);
    this.canvas.addEventListener('webglcontextlost', this.boundContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.boundContextRestored, false);
    this.initContext();
  }

  /**
   * Attaches the transparent HUD Flame Overlay canvas (positioned inside #ui-root
   * at z-index 6 so roaring pixel flames blaze over the dark rail backdrop and
   * directly behind #kc-chips-box / #kc-mult-box on Desktop, Portrait & Landscape!).
   */
  attachHudFlameCanvas(canvas: HTMLCanvasElement): void {
    this.detachHudFlameCanvas();
    this.hudCanvas = canvas;
    this.boundHudContextLost = (e: Event) => {
      e.preventDefault();
      this.hudContextLost = true;
      this.hudGl = null;
    };
    this.boundHudContextRestored = () => {
      this.hudContextLost = false;
      this.initHudFlameContext();
      this.syncHudCanvasSize();
    };
    canvas.addEventListener('webglcontextlost', this.boundHudContextLost, false);
    canvas.addEventListener('webglcontextrestored', this.boundHudContextRestored, false);
    this.initHudFlameContext();
    this.syncHudCanvasSize();
  }

  private detachHudFlameCanvas(): void {
    if (this.hudCanvas && this.boundHudContextLost) {
      this.hudCanvas.removeEventListener('webglcontextlost', this.boundHudContextLost, false);
    }
    if (this.hudCanvas && this.boundHudContextRestored) {
      this.hudCanvas.removeEventListener('webglcontextrestored', this.boundHudContextRestored, false);
    }
    if (this.hudGl && !this.hudContextLost) {
      const hgl = this.hudGl.gl;
      if (!hgl.isContextLost()) {
        hgl.deleteBuffer(this.hudGl.quadVbo);
        hgl.deleteVertexArray(this.hudGl.quadVao);
        hgl.deleteBuffer(this.hudGl.particleVbo);
        hgl.deleteVertexArray(this.hudGl.particleVao);
        hgl.deleteProgram(this.hudGl.flameProg);
        hgl.deleteProgram(this.hudGl.particleProg);
      }
    }
    this.hudGl = null;
    this.hudCtx2d = null;
    this.hudCanvas = null;
    this.boundHudContextLost = null;
    this.boundHudContextRestored = null;
  }

  private initHudFlameContext(): void {
    if (!this.hudCanvas) return;
    const gl = this.hudCanvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      this.hudCtx2d = this.hudCanvas.getContext('2d');
      return;
    }
    try {
      const flameProg = compileProgram(gl, FLAME_VERT, FLAME_FRAG, 'hud-flame');
      const particleProg = compileProgram(gl, PARTICLE_VERT, PARTICLE_FRAG, 'hud-particle');

      const quadVao = gl.createVertexArray();
      const quadVbo = gl.createBuffer();
      const particleVao = gl.createVertexArray();
      const particleVbo = gl.createBuffer();
      if (!quadVao || !quadVbo || !particleVao || !particleVbo) {
        throw new Error('Failed to create HUD flame VAOs/VBOs');
      }

      gl.bindVertexArray(quadVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);

      const stride = PARTICLE_FLOATS_PER_INSTANCE * 4;
      gl.bindVertexArray(particleVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, particleVbo);
      gl.bufferData(gl.ARRAY_BUFFER, MAX_PARTICLES * stride, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
      gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
      gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 32);
      gl.vertexAttribDivisor(3, 1);
      gl.bindVertexArray(null);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      this.hudGl = {
        gl,
        flameProg,
        particleProg,
        quadVao,
        quadVbo,
        particleVao,
        particleVbo,
        uFlame: {
          res: gl.getUniformLocation(flameProg, 'u_resolution'),
          rect: gl.getUniformLocation(flameProg, 'u_rect'),
          time: gl.getUniformLocation(flameProg, 'u_time'),
          amount: gl.getUniformLocation(flameProg, 'u_amount'),
          c1: gl.getUniformLocation(flameProg, 'u_colour1'),
          c2: gl.getUniformLocation(flameProg, 'u_colour2'),
          id: gl.getUniformLocation(flameProg, 'u_id'),
        },
        uParticle: {
          res: gl.getUniformLocation(particleProg, 'u_resolution'),
          shakeOffset: gl.getUniformLocation(particleProg, 'u_shakeOffset'),
        },
      };
    } catch {
      this.hudGl = null;
      this.hudCtx2d = this.hudCanvas.getContext('2d');
    }
  }

  private syncHudCanvasSize(): void {
    if (!this.hudCanvas) return;
    const pw = Math.max(1, Math.round(this.cssW * this.dpr));
    const ph = Math.max(1, Math.round(this.cssH * this.dpr));
    if (this.hudCanvas.width !== pw || this.hudCanvas.height !== ph) {
      this.hudCanvas.width = pw;
      this.hudCanvas.height = ph;
    }
  }

  private clearGlResourceRefs(): void {
    this.textures.clear();
    this.sceneTex = null;
    this.sceneFbo = null;
    this.fboW = 0;
    this.fboH = 0;
    this.particleInstanceVbo = null;
    this.particleVao = null;
    this.quadVbo = null;
    this.quadVao = null;
    this.emptyVao = null;
    this.splashProg = null;
    this.bgProg = null;
    this.spriteProg = null;
    this.flameProg = null;
    this.particleProg = null;
    this.flashProg = null;
    this.crtProg = null;
    this.uniforms = null;
  }

  private handleContextLost(e: Event): void {
    e.preventDefault();
    this.contextLost = true;
    this.clearGlResourceRefs();
  }

  private handleContextRestored(): void {
    this.contextLost = false;
    this.clearGlResourceRefs();
    this.initContext();
    if (this.gl && !this.gl.isContextLost()) {
      const pw = Math.max(1, Math.round(this.cssW * this.dpr));
      const ph = Math.max(1, Math.round(this.cssH * this.dpr));
      this.canvas.width = pw;
      this.canvas.height = ph;
      this.rebuildSceneFbo(pw, ph);
      this.uploadAllAtlases();
    }
  }

  isWebGL2(): boolean {
    return this.gl !== null;
  }

  getDrawCalls(): number {
    return this.lastDrawCalls;
  }

  getActiveShaders(): string[] {
    return this.lastActiveShaders;
  }

  triggerTitleEntryFlash(): void {
    this.titleMidFlash = 0.30;
    this.splashElapsed = 0;
  }

  triggerVortexPulse(durationSec = 0.68, peakAmt = 4.5): void {
    this.vortexElapsed = 0;
    this.vortexDuration = Math.max(0.25, durationSec);
    this.vortexPeakAmt = peakAmt;
  }

  triggerGlitchPulse(intensity = 0.65): void {
    this.glitchIntensity = Math.min(1.2, Math.max(this.glitchIntensity, intensity));
  }

  private initContext(): void {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      this.ctx2d = this.canvas.getContext('2d');
      return;
    }

    try {
      this.gl = gl;
      this.splashProg = compileProgram(gl, SPLASH_VERT, SPLASH_FRAG, 'splash');
      this.bgProg = compileProgram(gl, BACKGROUND_VERT, BACKGROUND_FRAG, 'background');
      this.spriteProg = compileProgram(gl, SPRITE_VERT, SPRITE_FRAG, 'sprite');
      this.flameProg = compileProgram(gl, FLAME_VERT, FLAME_FRAG, 'flame');
      this.particleProg = compileProgram(gl, PARTICLE_VERT, PARTICLE_FRAG, 'particle');
      this.flashProg = compileProgram(gl, FLASH_VERT, FLASH_FRAG, 'flash');
      this.crtProg = compileProgram(gl, CRT_VERT, CRT_FRAG, 'crt');

      this.uniforms = {
        splash: {
          res: gl.getUniformLocation(this.splashProg, 'u_resolution'),
          time: gl.getUniformLocation(this.splashProg, 'u_time'),
          vortSpeed: gl.getUniformLocation(this.splashProg, 'u_vortSpeed'),
          c1: gl.getUniformLocation(this.splashProg, 'u_colour1'),
          c2: gl.getUniformLocation(this.splashProg, 'u_colour2'),
          midFlash: gl.getUniformLocation(this.splashProg, 'u_midFlash'),
          vortOffset: gl.getUniformLocation(this.splashProg, 'u_vortOffset'),
        },
        bg: {
          res: gl.getUniformLocation(this.bgProg, 'u_resolution'),
          time: gl.getUniformLocation(this.bgProg, 'u_time'),
          spinTime: gl.getUniformLocation(this.bgProg, 'u_spinTime'),
          c1: gl.getUniformLocation(this.bgProg, 'u_colour1'),
          c2: gl.getUniformLocation(this.bgProg, 'u_colour2'),
          c3: gl.getUniformLocation(this.bgProg, 'u_colour3'),
          contrast: gl.getUniformLocation(this.bgProg, 'u_contrast'),
          spinAmount: gl.getUniformLocation(this.bgProg, 'u_spinAmount'),
          flameHeat: gl.getUniformLocation(this.bgProg, 'u_flameHeat'),
        },
        sprite: {
          res: gl.getUniformLocation(this.spriteProg, 'u_resolution'),
          center: gl.getUniformLocation(this.spriteProg, 'u_center'),
          size: gl.getUniformLocation(this.spriteProg, 'u_size'),
          rot: gl.getUniformLocation(this.spriteProg, 'u_rotation'),
          uvRect: gl.getUniformLocation(this.spriteProg, 'u_uvRect'),
          tilt: gl.getUniformLocation(this.spriteProg, 'u_tilt'),
          hovering: gl.getUniformLocation(this.spriteProg, 'u_hovering'),
          mousePos: gl.getUniformLocation(this.spriteProg, 'u_mousePos'),
          shakeOffset: gl.getUniformLocation(this.spriteProg, 'u_shakeOffset'),
          tex: gl.getUniformLocation(this.spriteProg, 'u_tex'),
          mode: gl.getUniformLocation(this.spriteProg, 'u_shaderMode'),
          time: gl.getUniformLocation(this.spriteProg, 'u_time'),
          effect: gl.getUniformLocation(this.spriteProg, 'u_effectVec'),
          dissolve: gl.getUniformLocation(this.spriteProg, 'u_dissolve'),
          shadow: gl.getUniformLocation(this.spriteProg, 'u_shadow'),
          tint: gl.getUniformLocation(this.spriteProg, 'u_tint'),
          cellPx: gl.getUniformLocation(this.spriteProg, 'u_cellPixels'),
          burn1: gl.getUniformLocation(this.spriteProg, 'u_burnColour1'),
          burn2: gl.getUniformLocation(this.spriteProg, 'u_burnColour2'),
          triggerGlow: gl.getUniformLocation(this.spriteProg, 'u_triggerGlow'),
        },
        flame: {
          res: gl.getUniformLocation(this.flameProg, 'u_resolution'),
          rect: gl.getUniformLocation(this.flameProg, 'u_rect'),
          time: gl.getUniformLocation(this.flameProg, 'u_time'),
          amount: gl.getUniformLocation(this.flameProg, 'u_amount'),
          c1: gl.getUniformLocation(this.flameProg, 'u_colour1'),
          c2: gl.getUniformLocation(this.flameProg, 'u_colour2'),
          id: gl.getUniformLocation(this.flameProg, 'u_id'),
        },
        particle: {
          res: gl.getUniformLocation(this.particleProg, 'u_resolution'),
          shakeOffset: gl.getUniformLocation(this.particleProg, 'u_shakeOffset'),
        },
        flash: {
          res: gl.getUniformLocation(this.flashProg, 'u_resolution'),
          time: gl.getUniformLocation(this.flashProg, 'u_time'),
          midFlash: gl.getUniformLocation(this.flashProg, 'u_midFlash'),
          flashColor: gl.getUniformLocation(this.flashProg, 'u_flashColor'),
        },
        crt: {
          sceneTex: gl.getUniformLocation(this.crtProg, 'u_sceneTex'),
          res: gl.getUniformLocation(this.crtProg, 'u_resolution'),
          time: gl.getUniformLocation(this.crtProg, 'u_time'),
          crtAmount: gl.getUniformLocation(this.crtProg, 'u_crtAmount'),
          vortexStrength: gl.getUniformLocation(this.crtProg, 'u_vortexStrength'),
          vortexAmt: gl.getUniformLocation(this.crtProg, 'u_vortexAmt'),
          glitchIntensity: gl.getUniformLocation(this.crtProg, 'u_glitchIntensity'),
          bloomBoost: gl.getUniformLocation(this.crtProg, 'u_bloomBoost'),
        },
      };

      this.emptyVao = gl.createVertexArray();
      this.quadVao = gl.createVertexArray();
      this.quadVbo = gl.createBuffer();

      gl.bindVertexArray(this.quadVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
      const quadVerts = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
      gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);

      // Instanced Particle VAO (shares unit quad VBO + dynamic instance attribute VBO)
      this.particleVao = gl.createVertexArray();
      this.particleInstanceVbo = gl.createBuffer();
      const stride = PARTICLE_FLOATS_PER_INSTANCE * 4;
      gl.bindVertexArray(this.particleVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleInstanceVbo);
      gl.bufferData(gl.ARRAY_BUFFER, MAX_PARTICLES * stride, gl.DYNAMIC_DRAW);
      // location 1: vec4 a_geom (x, y, size, rot)
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
      gl.vertexAttribDivisor(1, 1);
      // location 2: vec4 a_color (r, g, b, a)
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
      gl.vertexAttribDivisor(2, 1);
      // location 3: float a_shape
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 32);
      gl.vertexAttribDivisor(3, 1);
      gl.bindVertexArray(null);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    } catch (err) {
      console.error('[WebGL2Renderer] Falling back to Canvas2D:', err);
      this.gl = null;
      this.ctx2d = this.canvas.getContext('2d');
    }
  }

  uploadAllAtlases(): void {
    const all = this.packManager.getAllActiveAtlases();
    this.measureSpecialJokerCrops(all.Joker);
    if (!this.gl || this.contextLost || this.gl.isContextLost()) return;
    for (const key of ATLAS_KEYS) {
      this.uploadAtlas(key, all[key]);
    }
  }

  private measureSpecialJokerCrops(source: AtlasImageSource): void {
    try {
      const spec = ATLAS_SPECS.Joker;
      const cellW = Math.floor(source.width / spec.cols);
      const cellH = Math.floor(source.height / spec.rows);
      if (cellW <= 0 || cellH <= 0 || typeof document === 'undefined') return;
      const probe = document.createElement('canvas');
      probe.width = cellW;
      probe.height = cellH;
      const ctx = probe.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const measureCell = (col: number, row: number, fallback: number): number => {
        ctx.clearRect(0, 0, cellW, cellH);
        ctx.drawImage(source, col * cellW, row * cellH, cellW, cellH, 0, 0, cellW, cellH);
        const data = ctx.getImageData(0, 0, cellW, cellH).data;
        let maxOpaqueY = 0;
        for (let y = cellH - 1; y >= 0; y--) {
          let rowHasPixel = false;
          const rowOff = y * cellW * 4;
          for (let x = 0; x < cellW; x++) {
            if (data[rowOff + x * 4 + 3]! > 16) {
              rowHasPixel = true;
              break;
            }
          }
          if (rowHasPixel) {
            maxOpaqueY = y + 1;
            break;
          }
        }
        if (maxOpaqueY <= 0) return fallback;
        const ratio = (maxOpaqueY + Math.max(1, Math.round(cellH * 0.015))) / cellH;
        return ratio >= 0.94 ? 1.0 : Math.max(0.55, Math.min(1.0, ratio));
      };

      this.jokerCropMap.half = measureCell(7, 0, 0.66);
      this.jokerCropMap.square = measureCell(9, 11, 0.76);
      this.jokerCropMap.photo = measureCell(2, 13, 0.85);
    } catch {
      // Keep safe defaults if canvas readback is unavailable
    }
  }

  private getUvCropH(vc: VisualCard): number {
    if (!vc.cardShape || vc.cardShape === 'wee' || vc.faceDown) return 1.0;
    return this.jokerCropMap[vc.cardShape] ?? 1.0;
  }

  private uploadAtlas(key: AtlasKey, source: AtlasImageSource): void {
    const gl = this.gl;
    if (!gl || this.contextLost || gl.isContextLost()) return;
    let tex = this.textures.get(key);
    if (!tex) {
      const created = gl.createTexture();
      if (!created) return;
      tex = created;
      this.textures.set(key, tex);
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  resize(cssWidth: number, cssHeight: number): void {
    const safeCssW = Math.max(1, Math.round(Number.isFinite(cssWidth) ? cssWidth : 1));
    const safeCssH = Math.max(1, Math.round(Number.isFinite(cssHeight) ? cssHeight : 1));
    this.cssW = safeCssW;
    this.cssH = safeCssH;
    const rawDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.dpr = Math.max(1, Math.min(2, Number.isFinite(rawDpr) ? rawDpr : 1));
    const pw = Math.max(1, Math.round(this.cssW * this.dpr));
    const ph = Math.max(1, Math.round(this.cssH * this.dpr));

    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }

    this.syncHudCanvasSize();

    if (this.gl && !this.contextLost && !this.gl.isContextLost() && (this.fboW !== pw || this.fboH !== ph)) {
      this.rebuildSceneFbo(pw, ph);
    }
  }

  private rebuildSceneFbo(pw: number, ph: number): void {
    const gl = this.gl;
    if (!gl || this.contextLost || gl.isContextLost()) return;
    const safeW = Math.max(1, Math.round(pw));
    const safeH = Math.max(1, Math.round(ph));

    if (this.sceneTex) gl.deleteTexture(this.sceneTex);
    if (this.sceneFbo) gl.deleteFramebuffer(this.sceneFbo);
    this.sceneTex = null;
    this.sceneFbo = null;

    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) {
      if (tex) gl.deleteTexture(tex);
      if (fbo) gl.deleteFramebuffer(fbo);
      return;
    }

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, safeW, safeH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteTexture(tex);
      gl.deleteFramebuffer(fbo);
      this.fboW = 0;
      this.fboH = 0;
      return;
    }

    this.sceneTex = tex;
    this.sceneFbo = fbo;
    this.fboW = safeW;
    this.fboH = safeH;
  }

  private drawFlamePlumes(
    gl: WebGL2RenderingContext,
    prog: WebGLProgram,
    quadVao: WebGLVertexArrayObject,
    uf: UniformCache['flame'],
    anchor: FlameAnchor,
    timeSec: number,
    reducedMotion: boolean
  ): number {
    let calls = 0;
    const intensity = Math.min(10, anchor.intensity);
    const hotShift = Math.max(0, Math.min(1, (intensity - 3.0) / 5.5));
    const animTime = reducedMotion ? timeSec * 0.25 : timeSec * (1.0 + hotShift * 0.48);

    gl.useProgram(prog);
    gl.bindVertexArray(quadVao);
    gl.uniform2f(uf.res, this.cssW, this.cssH);
    gl.uniform1f(uf.time, animTime);
    gl.uniform1f(uf.amount, intensity);

    // 1. Roaring Electric Cobalt -> Blazing Cyan -> Ice-White Chips Flame
    const cr = anchor.chipsRect;
    gl.uniform4f(uf.rect, cr.x, cr.y, cr.w, cr.h);
    gl.uniform4f(
      uf.c1,
      0.0 + hotShift * 0.22,
      0.54 + hotShift * 0.34,
      1.0,
      1.0
    );
    gl.uniform4f(
      uf.c2,
      0.48 + hotShift * 0.50,
      0.94 + hotShift * 0.06,
      1.0,
      1.0
    );
    gl.uniform1f(uf.id, 1.0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    calls++;

    // 2. Roaring Scarlet-Crimson -> Molten Gold -> Solar White Mult Flame
    const mr = anchor.multRect;
    gl.uniform4f(uf.rect, mr.x, mr.y, mr.w, mr.h);
    gl.uniform4f(
      uf.c1,
      1.0,
      0.26 + hotShift * 0.34,
      0.16 + hotShift * 0.14,
      1.0
    );
    gl.uniform4f(
      uf.c2,
      1.0,
      0.86 + hotShift * 0.13,
      0.20 + hotShift * 0.62,
      1.0
    );
    gl.uniform1f(uf.id, 2.0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    calls++;

    // 3. Twin Superheated Inner Plasma Tongues at massive overkill scores (>= 4.8)!
    if (intensity >= 4.8) {
      const superAmt = Math.min(10, (intensity - 3.6) * 1.15);
      const insetX = Math.round(cr.w * 0.14);
      const extraLift = Math.round(Math.min(26, (intensity - 4.5) * 4.8));
      gl.uniform1f(uf.time, animTime * 1.24);
      gl.uniform1f(uf.amount, superAmt);

      // Chips super-core tongue
      gl.uniform4f(uf.rect, cr.x + insetX, Math.max(0, cr.y - extraLift), cr.w - insetX * 2, cr.h + extraLift);
      gl.uniform4f(uf.c1, 0.34, 0.90, 1.0, 1.0);
      gl.uniform4f(uf.c2, 0.94, 0.99, 1.0, 1.0);
      gl.uniform1f(uf.id, 5.7);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      calls++;

      // Mult super-core tongue
      const insetMX = Math.round(mr.w * 0.14);
      gl.uniform4f(uf.rect, mr.x + insetMX, Math.max(0, mr.y - extraLift), mr.w - insetMX * 2, mr.h + extraLift);
      gl.uniform4f(uf.c1, 1.0, 0.64, 0.12, 1.0);
      gl.uniform4f(uf.c2, 1.0, 0.99, 0.86, 1.0);
      gl.uniform1f(uf.id, 7.3);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      calls++;
    }

    return calls;
  }

  private renderHudFlameOverlay(
    frame: RenderFrameInput,
    shakeX: number,
    shakeY: number,
    activeShaderSet: Set<string>
  ): number {
    if (!this.hudCanvas) return 0;
    const hasFlames = Boolean(frame.flameAnchor && frame.flameAnchor.intensity > 0.08);
    const hudPacked = frame.particles ? frame.particles.packInstanceData('hud') : { data: new Float32Array(0), count: 0 };
    const hasHudParticles = hudPacked.count > 0;

    if (!hasFlames && !hasHudParticles) {
      if (this.hudDirty) {
        this.hudDirty = false;
        if (this.hudGl && !this.hudContextLost && !this.hudGl.gl.isContextLost()) {
          const hgl = this.hudGl.gl;
          hgl.viewport(0, 0, this.hudCanvas.width, this.hudCanvas.height);
          hgl.clearColor(0, 0, 0, 0);
          hgl.clear(hgl.COLOR_BUFFER_BIT);
        } else if (this.hudCtx2d) {
          this.hudCtx2d.clearRect(0, 0, this.hudCanvas.width, this.hudCanvas.height);
        }
      }
      return 0;
    }

    this.hudDirty = true;
    let calls = 0;

    if (this.hudGl && !this.hudContextLost && !this.hudGl.gl.isContextLost()) {
      const hgl = this.hudGl.gl;
      hgl.viewport(0, 0, this.hudCanvas.width, this.hudCanvas.height);
      hgl.clearColor(0, 0, 0, 0);
      hgl.clear(hgl.COLOR_BUFFER_BIT);
      hgl.enable(hgl.BLEND);
      hgl.blendFunc(hgl.SRC_ALPHA, hgl.ONE_MINUS_SRC_ALPHA);

      if (hasFlames && frame.flameAnchor) {
        activeShaderSet.add('flame');
        calls += this.drawFlamePlumes(
          hgl,
          this.hudGl.flameProg,
          this.hudGl.quadVao,
          this.hudGl.uFlame,
          frame.flameAnchor,
          frame.timeSec,
          frame.settings.reducedMotion
        );
      }

      if (hasHudParticles) {
        activeShaderSet.add('particles');
        hgl.useProgram(this.hudGl.particleProg);
        hgl.bindVertexArray(this.hudGl.particleVao);
        hgl.uniform2f(this.hudGl.uParticle.res, this.cssW, this.cssH);
        hgl.uniform2f(this.hudGl.uParticle.shakeOffset, shakeX * 0.5, shakeY * 0.5);
        hgl.bindBuffer(hgl.ARRAY_BUFFER, this.hudGl.particleVbo);
        hgl.bufferSubData(
          hgl.ARRAY_BUFFER,
          0,
          hudPacked.data.subarray(0, hudPacked.count * PARTICLE_FLOATS_PER_INSTANCE)
        );
        hgl.drawArraysInstanced(hgl.TRIANGLE_STRIP, 0, 4, hudPacked.count);
        calls++;
      }
      return calls;
    }

    // Crisp Canvas2D fallback for HUD flames & embers
    if (this.hudCtx2d) {
      const ctx = this.hudCtx2d;
      ctx.save();
      ctx.clearRect(0, 0, this.hudCanvas.width, this.hudCanvas.height);
      ctx.scale(this.dpr, this.dpr);
      ctx.imageSmoothingEnabled = false;
      if (hasFlames && frame.flameAnchor) {
        activeShaderSet.add('flame');
        const drawBoxFlame2D = (rect: RectPx, c1: string, c2: string) => {
          const g = ctx.createLinearGradient(0, rect.y + rect.h, 0, rect.y);
          g.addColorStop(0, c2);
          g.addColorStop(0.5, c1);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
          calls++;
        };
        drawBoxFlame2D(frame.flameAnchor.chipsRect, '#009dff', '#7ef4ff');
        drawBoxFlame2D(frame.flameAnchor.multRect, '#fe5f55', '#ffd94a');
      }
      if (hasHudParticles && frame.particles) {
        for (const p of frame.particles.getParticles()) {
          if (p.layer !== 'hud') continue;
          const t = Math.min(1, p.age / Math.max(0.001, p.lifetime));
          const a = p.alpha * (t > 0.65 ? Math.max(0, 1 - (t - 0.65) / 0.35) : 1);
          const sz = p.size + (p.endSize - p.size) * t;
          ctx.fillStyle = `rgba(${Math.round(p.r * 255)},${Math.round(p.g * 255)},${Math.round(p.b * 255)},${a.toFixed(2)})`;
          ctx.fillRect(p.x - sz * 0.5, p.y - sz * 0.5, sz, sz);
          calls++;
        }
      }
      ctx.restore();
    }
    return calls;
  }

  render(frame: RenderFrameInput): void {
    const safeDt = Math.min(0.05, Math.max(0.001, frame.dt));
    const motionScale = frame.settings.reducedMotion ? 0.15 : 1.0;

    if (frame.phase === 'TITLE' && this.lastPhase !== 'TITLE') {
      this.triggerTitleEntryFlash();
    }
    this.lastPhase = frame.phase;

    const targetBg = getTargetBgPalette(frame.phase, frame.bossColor);
    const bgLerp = Math.min(1, safeDt * 2.8);
    this.bgCurrent.c1 = lerpRgba(this.bgCurrent.c1, targetBg.c1, bgLerp);
    this.bgCurrent.c2 = lerpRgba(this.bgCurrent.c2, targetBg.c2, bgLerp);
    this.bgCurrent.c3 = lerpRgba(this.bgCurrent.c3, targetBg.c3, bgLerp);
    this.bgCurrent.contrast += (targetBg.contrast - this.bgCurrent.contrast) * bgLerp;
    this.bgCurrent.spinAmount += (targetBg.spinAmount - this.bgCurrent.spinAmount) * bgLerp;

    const flameHeat = frame.flameAnchor
      ? Math.min(1, Math.max(0, frame.flameAnchor.intensity / 6.5))
      : 0;
    this.spinTime += safeDt * (1.0 + this.bgCurrent.spinAmount * 1.45 + flameHeat * 1.85) * motionScale;
    this.splashElapsed += safeDt * motionScale;
    this.titleMidFlash = Math.max(0, this.titleMidFlash - Math.max(safeDt, frame.dt) * 0.9);

    let vortexStrength = 0;
    let vortexAmt = 0;
    if (!frame.settings.reducedMotion && this.vortexElapsed < this.vortexDuration) {
      this.vortexElapsed += Math.max(safeDt, Math.min(0.25, frame.dt));
      const p = Math.min(1, this.vortexElapsed / this.vortexDuration);
      vortexStrength = Math.sin(p * Math.PI);
      vortexAmt = this.vortexPeakAmt * vortexStrength;
    }
    this.glitchIntensity = frame.settings.reducedMotion
      ? 0
      : Math.max(0, this.glitchIntensity - safeDt * 2.4);

    if (this.contextLost) {
      return;
    }

    if (!this.gl || !this.uniforms) {
      this.renderCanvas2D(frame);
      const hudSet = new Set<string>(this.lastActiveShaders);
      this.lastDrawCalls += this.renderHudFlameOverlay(frame, 0, 0, hudSet);
      this.lastActiveShaders = Array.from(hudSet);
      return;
    }

    const gl = this.gl;
    if (gl.isContextLost()) {
      this.contextLost = true;
      return;
    }
    const u = this.uniforms;
    const pw = Math.max(1, this.canvas.width);
    const ph = Math.max(1, this.canvas.height);
    const useCrt = frame.settings.crtAmount > 0.5;
    // Always run Pass 4 when FBO is ready so holographic speculars & sparkles get crisp bloom even at 0% CRT!
    const usePostFbo = this.sceneFbo !== null && this.sceneTex !== null;
    const activeShaderSet = new Set<string>();
    let drawCalls = 0;

    const shakeX = frame.settings.reducedMotion ? 0 : (frame.shakeX ?? 0);
    const shakeY = frame.settings.reducedMotion ? 0 : (frame.shakeY ?? 0);

    // Bind scene FBO for post-pass bloom/CRT/vortex
    gl.bindFramebuffer(gl.FRAMEBUFFER, usePostFbo ? this.sceneFbo : null);
    gl.viewport(0, 0, pw, ph);

    // --- PASS 1: TITLE SPLASH VORTEX (splash.fs) OR GAMEPLAY SWIRL (background.fs) ---
    if (frame.phase === 'TITLE' && this.splashProg) {
      activeShaderSet.add('splash');
      gl.disable(gl.BLEND);
      gl.useProgram(this.splashProg);
      gl.bindVertexArray(this.emptyVao);
      gl.uniform2f(u.splash.res, pw, ph);
      gl.uniform1f(u.splash.time, 12.4 + this.splashElapsed);
      gl.uniform1f(u.splash.vortSpeed, 0.42);
      gl.uniform4f(u.splash.c1, 0.871, 0.267, 0.231, 1.0);
      gl.uniform4f(u.splash.c2, 0.0, 0.420, 0.706, 1.0);
      gl.uniform1f(u.splash.midFlash, frame.settings.reducedMotion ? 0.0 : this.titleMidFlash);
      gl.uniform1f(u.splash.vortOffset, 0.45);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      drawCalls++;
    } else if (this.bgProg) {
      activeShaderSet.add('background');
      if (vortexStrength > 0.001) activeShaderSet.add('vortex');
      gl.disable(gl.BLEND);
      gl.useProgram(this.bgProg);
      gl.bindVertexArray(this.emptyVao);
      gl.uniform2f(u.bg.res, pw, ph);
      gl.uniform1f(u.bg.time, frame.timeSec * motionScale);
      gl.uniform1f(u.bg.spinTime, this.spinTime + vortexAmt * 0.85);
      gl.uniform4fv(u.bg.c1, this.bgCurrent.c1);
      gl.uniform4fv(u.bg.c2, this.bgCurrent.c2);
      gl.uniform4fv(u.bg.c3, this.bgCurrent.c3);
      gl.uniform1f(u.bg.contrast, this.bgCurrent.contrast + vortexStrength * 0.55 + flameHeat * 0.42);
      gl.uniform1f(u.bg.spinAmount, this.bgCurrent.spinAmount + vortexStrength * 0.45 + flameHeat * 0.24);
      gl.uniform1f(u.bg.flameHeat, frame.settings.reducedMotion ? flameHeat * 0.4 : flameHeat);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      drawCalls++;
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Fallback flame draw on main canvas ONLY if no dedicated HUD overlay canvas is attached
    if (!this.hudCanvas && this.flameProg && frame.flameAnchor && frame.flameAnchor.intensity > 0.08) {
      activeShaderSet.add('flame');
      drawCalls += this.drawFlamePlumes(
        gl,
        this.flameProg,
        this.quadVao!,
        u.flame,
        frame.flameAnchor,
        frame.timeSec,
        frame.settings.reducedMotion
      );
    }

    // --- PASS 2: CARD & SPRITE QUADS (with Holographic, Foil, Prismatic, Enhancement & Gloss passes!) ---
    let shinyCardsCount = 0;
    if (this.spriteProg && frame.cards.length > 0) {
      activeShaderSet.add('sprite');
      gl.useProgram(this.spriteProg);
      gl.bindVertexArray(this.quadVao);
      gl.activeTexture(gl.TEXTURE0);

      gl.uniform2f(u.sprite.res, this.cssW, this.cssH);
      gl.uniform2f(u.sprite.mousePos, frame.mouseX, frame.mouseY);
      gl.uniform2f(u.sprite.shakeOffset, shakeX, shakeY);
      gl.uniform1i(u.sprite.tex, 0);
      gl.uniform1f(u.sprite.time, frame.timeSec);
      gl.uniform4f(u.sprite.burn1, 1.0, 0.65, 0.2, 1.0);
      gl.uniform4f(u.sprite.burn2, 0.996, 0.373, 0.333, 1.0);

      let boundAtlas: AtlasKey | null = null;
      const bindAtlas = (key: AtlasKey): boolean => {
        const tex = this.textures.get(key);
        if (!tex) return false;
        if (boundAtlas !== key) {
          gl.bindTexture(gl.TEXTURE_2D, tex);
          boundAtlas = key;
        }
        return true;
      };

      const drawLayer = (
        atlas: AtlasKey,
        col: number,
        row: number,
        cx: number,
        cy: number,
        w: number,
        h: number,
        rot: number,
        tiltX: number,
        tiltY: number,
        hovering: number,
        mode: ShaderMode,
        effectX: number,
        effectY: number,
        dissolve: number,
        isShadow: boolean,
        tint: Rgba,
        uvCropH = 1.0,
        triggerGlow = 0.0
      ) => {
        if (!bindAtlas(atlas)) return;
        const spec = ATLAS_SPECS[atlas];
        const u0 = col / spec.cols;
        const v0 = row / spec.rows;
        const uW = 1 / spec.cols;
        const vH = (1 / spec.rows) * uvCropH;

        gl.uniform2f(u.sprite.center, cx, cy);
        gl.uniform2f(u.sprite.size, w, h);
        gl.uniform1f(u.sprite.rot, rot);
        gl.uniform4f(u.sprite.uvRect, u0, v0, uW, vH);
        gl.uniform2f(u.sprite.tilt, tiltX, tiltY);
        gl.uniform1f(u.sprite.hovering, hovering);
        gl.uniform1i(u.sprite.mode, mode);
        gl.uniform2f(u.sprite.effect, effectX, effectY);
        gl.uniform1f(u.sprite.dissolve, dissolve);
        gl.uniform1i(u.sprite.shadow, isShadow ? 1 : 0);
        gl.uniform4fv(u.sprite.tint, tint);
        gl.uniform2f(u.sprite.cellPx, spec.cellW, spec.cellH * uvCropH);
        gl.uniform1f(u.sprite.triggerGlow, triggerGlow);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        drawCalls++;
      };

      const white: Rgba = [1, 1, 1, 1];
      const glassTint: Rgba = [0.95, 0.99, 1.0, 0.90];
      const soulShadowTint: Rgba = [1, 1, 1, 0.82];
      const blackHoleTint: Rgba = [0.92, 0.86, 1.0, 1.0];

      for (const vc of frame.cards) {
        const m = vc.moveable;
        const flipX = vc.flipScaleX ?? 1;
        const w = m.vw * m.vScale * flipX;
        const h = m.vh * m.vScale;
        const cropH = this.getUvCropH(vc);
        const isActiveSource = Boolean(frame.activeSourceId && frame.activeSourceId === vc.id);
        const trigGlow = Math.max(m.triggerGlow, isActiveSource ? 0.55 : 0);
        const hoverFac = m.dragging
          ? 1.4
          : m.hovered
            ? 1.15
            : vc.kind === 'title_showcase'
              ? 0.65
              : 0.0;
        const shadowOff = m.dragging
          ? 20
          : vc.kind === 'title_showcase'
            ? 20
            : m.hovered
              ? 14
              : vc.forced
                ? 13
                : vc.scoringPreview
                  ? 12
                  : vc.selected
                    ? 10
                    : 5.5;

        const nonScoring = Boolean(vc.nonScoring);
        const primaryMode = getPrimaryCardMode(vc.edition, vc.debuffed, nonScoring);
        const hasFoilOverlay = !vc.debuffed && !nonScoring && !vc.faceDown && vc.edition === 'e_foil';
        const hasNegativeShine = !vc.debuffed && !nonScoring && !vc.faceDown && vc.edition === 'e_negative';
        const hasEdition = !vc.debuffed && !nonScoring && !vc.faceDown && vc.edition !== 'none';

        if (hasEdition || vc.overlayEffect || vc.soulPos || vc.floatingGlow) shinyCardsCount++;

        if (primaryMode === SHADER_MODE.HOLO) activeShaderSet.add('holo');
        else if (primaryMode === SHADER_MODE.POLYCHROME) activeShaderSet.add('polychrome');
        else if (primaryMode === SHADER_MODE.NEGATIVE) activeShaderSet.add('negative');
        else if (primaryMode === SHADER_MODE.DEBUFF) activeShaderSet.add('debuff');
        else if (primaryMode === SHADER_MODE.PLAYED) activeShaderSet.add('played');
        if (hasFoilOverlay) activeShaderSet.add('foil');
        if (hasNegativeShine) activeShaderSet.add('negative_shine');
        if (m.dissolve > 0.01) activeShaderSet.add('dissolve');

        const seed = vc.index * 0.61 + (vc.id.charCodeAt(vc.id.length - 1) || 0) * 0.13;
        const motionTime = frame.timeSec * motionScale;
        const effectX = m.vr * 2.8 + m.tiltX * 2.35 + motionTime * 0.68 + seed;
        const effectY = motionTime * 0.58 + m.tiltY * 1.45 + seed * 1.3;

        // 1. Crisp drop shadow proportional to elevation
        drawLayer(
          vc.baseAtlas,
          vc.basePos.x,
          vc.basePos.y,
          m.vx + shadowOff * 0.52 - m.tiltX * 6.0,
          m.vy + shadowOff - m.tiltY * 3.5,
          w,
          h,
          m.vr,
          m.tiltX,
          m.tiltY,
          hoverFac,
          SHADER_MODE.BASE,
          effectX,
          effectY,
          m.dissolve,
          true,
          white,
          cropH
        );

        // 1B. Prismatic Edition Aura / Radiant Trigger Spotlight / Forced / Scoring Preview Rim
        if (trigGlow > 0.05) {
          const pad = 7 + trigGlow * 8;
          drawLayer(
            vc.baseAtlas,
            vc.basePos.x,
            vc.basePos.y,
            m.vx,
            m.vy,
            w + pad,
            h + pad,
            m.vr,
            m.tiltX,
            m.tiltY,
            hoverFac,
            SHADER_MODE.EDITION_AURA,
            effectX,
            hasEdition ? 1.0 : 0.0,
            m.dissolve,
            false,
            [1.0, 0.90, 0.48, Math.min(0.95, 0.45 + trigGlow * 0.5)],
            cropH
          );
        } else if (vc.forced) {
          const pulse = frame.settings.reducedMotion
            ? 0.88
            : 0.78 + 0.18 * Math.sin(frame.timeSec * 5.4);
          const rimPad = frame.settings.reducedMotion
            ? 6
            : 6 + 1.5 * Math.sin(frame.timeSec * 5.4);
          drawLayer(
            vc.baseAtlas,
            vc.basePos.x,
            vc.basePos.y,
            m.vx,
            m.vy,
            w + rimPad,
            h + rimPad,
            m.vr,
            m.tiltX,
            m.tiltY,
            hoverFac,
            SHADER_MODE.BASE,
            effectX,
            effectY,
            m.dissolve,
            false,
            [1.0, 0.78, 0.22, pulse],
            cropH
          );
        } else if (vc.scoringPreview && !vc.debuffed) {
          const previewAlpha = frame.settings.reducedMotion
            ? 0.56
            : 0.52 + 0.14 * Math.sin(frame.timeSec * 3.8 + seed);
          drawLayer(
            vc.baseAtlas,
            vc.basePos.x,
            vc.basePos.y,
            m.vx,
            m.vy,
            w + 5.5,
            h + 5.5,
            m.vr,
            m.tiltX,
            m.tiltY,
            hoverFac,
            SHADER_MODE.BASE,
            effectX,
            effectY,
            m.dissolve,
            false,
            [0.32, 0.88, 1.0, previewAlpha],
            cropH
          );
        } else if (hasEdition || vc.soulShader === 'soul_gem' || vc.floatingGlow === 'black_hole' || vc.kind === 'title_showcase') {
          let auraCol: Rgba = [0.55, 0.88, 1.0, 0.46];
          let rainbowFlag = 0.0;
          let pad = m.hovered ? 8.5 : 5.5;
          if (vc.edition === 'e_foil') {
            auraCol = [0.45, 0.86, 1.0, m.hovered ? 0.72 : 0.48];
          } else if (vc.edition === 'e_holo') {
            auraCol = [1.0, 0.42, 0.90, m.hovered ? 0.78 : 0.54];
            rainbowFlag = 1.0;
          } else if (vc.edition === 'e_polychrome' || vc.soulShader === 'soul_gem') {
            auraCol = [1.0, 0.84, 0.36, m.hovered ? 0.84 : 0.60];
            rainbowFlag = 1.0;
            pad = m.hovered ? 9.5 : 6.5;
          } else if (vc.edition === 'e_negative' || vc.floatingGlow === 'black_hole') {
            auraCol = [0.56, 0.38, 1.0, m.hovered ? 0.78 : 0.52];
          } else if (vc.kind === 'title_showcase') {
            auraCol = [0.46, 0.88, 1.0, 0.68];
            rainbowFlag = 1.0;
            pad = 13;
          }
          drawLayer(
            vc.baseAtlas,
            vc.basePos.x,
            vc.basePos.y,
            m.vx,
            m.vy,
            w + pad,
            h + pad,
            m.vr,
            m.tiltX,
            m.tiltY,
            hoverFac,
            SHADER_MODE.EDITION_AURA,
            effectX,
            rainbowFlag,
            m.dissolve,
            false,
            auraCol,
            cropH
          );
        }

        // 2. Base card / enhancement / Joker / Tarot / Voucher / Booster
        const baseTint =
          vc.enhancement === 'm_glass' && !vc.faceDown
            ? glassTint
            : vc.floatingGlow === 'black_hole'
              ? blackHoleTint
              : white;

        drawLayer(
          vc.baseAtlas,
          vc.basePos.x,
          vc.basePos.y,
          m.vx,
          m.vy,
          w,
          h,
          m.vr,
          m.tiltX,
          m.tiltY,
          hoverFac,
          primaryMode,
          effectX,
          effectY,
          m.dissolve,
          false,
          baseTint,
          cropH,
          trigGlow
        );

        // 3. Playing Card Rank & Suit Face Layer
        if (vc.faceAtlas && vc.facePos) {
          drawLayer(
            vc.faceAtlas,
            vc.facePos.x,
            vc.facePos.y,
            m.vx,
            m.vy,
            w,
            h,
            m.vr,
            m.tiltX,
            m.tiltY,
            hoverFac,
            primaryMode,
            effectX,
            effectY,
            m.dissolve,
            false,
            white,
            1.0,
            trigGlow
          );
        }

        // 3B. True 2-Layer Floating soulPos Parallax (Legendaries, j_hologram, c_soul)
        if (!vc.faceDown && vc.soulAtlas && vc.soulPos) {
          const t = motionTime;
          const isHoloJoker = vc.soulShader === 'hologram';
          const isSoulGem = vc.soulShader === 'soul_gem';
          const breath = frame.settings.reducedMotion
            ? 1.04
            : 1.05 + 0.032 * Math.sin(t * 2.1 + seed);
          const soulW = w * breath;
          const soulH = h * breath;
          const soulRot =
            m.vr +
            (frame.settings.reducedMotion ? 0 : -0.048 * Math.cos(t * 1.45 + seed));
          const orbitX = frame.settings.reducedMotion ? 0 : Math.sin(t * 1.3 + seed) * 2.0;
          const orbitY = frame.settings.reducedMotion ? 0 : Math.cos(t * 1.7 + seed) * 2.6;
          const soulX = m.vx + orbitX - m.tiltX * 5.5;
          const soulY = m.vy + orbitY - 2.0 - m.tiltY * 5.0;

          drawLayer(
            vc.soulAtlas,
            vc.soulPos.x,
            vc.soulPos.y,
            soulX + 4.5 - m.tiltX * 2.0,
            soulY + 6.5 - m.tiltY * 1.5,
            soulW,
            soulH,
            soulRot,
            m.tiltX,
            m.tiltY,
            hoverFac,
            SHADER_MODE.BASE,
            effectX,
            effectY,
            m.dissolve,
            true,
            soulShadowTint,
            1.0
          );

          const soulMode: ShaderMode = isHoloJoker
            ? SHADER_MODE.HOLOGRAM
            : isSoulGem && primaryMode === SHADER_MODE.BASE
              ? SHADER_MODE.POLYCHROME
              : primaryMode;

          if (isHoloJoker) activeShaderSet.add('hologram');
          else if (soulMode === SHADER_MODE.POLYCHROME) activeShaderSet.add('polychrome');

          const soulEffX = isHoloJoker ? m.vr * 2.0 + m.tiltX * 1.5 + seed : effectX;
          const soulEffY = isHoloJoker ? frame.timeSec * 1.75 + seed : effectY;

          drawLayer(
            vc.soulAtlas,
            vc.soulPos.x,
            vc.soulPos.y,
            soulX,
            soulY,
            soulW,
            soulH,
            soulRot,
            m.tiltX,
            m.tiltY,
            hoverFac,
            soulMode,
            soulEffX,
            soulEffY,
            m.dissolve,
            false,
            white,
            1.0,
            trigGlow
          );

          if (!isHoloJoker && !isSoulGem && hasFoilOverlay) {
            drawLayer(
              vc.soulAtlas,
              vc.soulPos.x,
              vc.soulPos.y,
              soulX,
              soulY,
              soulW,
              soulH,
              soulRot,
              m.tiltX,
              m.tiltY,
              hoverFac,
              SHADER_MODE.FOIL,
              effectX,
              effectY,
              m.dissolve,
              false,
              white,
              1.0
            );
          } else if (!isHoloJoker && !isSoulGem && hasNegativeShine) {
            drawLayer(
              vc.soulAtlas,
              vc.soulPos.x,
              vc.soulPos.y,
              soulX,
              soulY,
              soulW,
              soulH,
              soulRot,
              m.tiltX,
              m.tiltY,
              hoverFac,
              SHADER_MODE.NEGATIVE_SHINE,
              effectX * 0.45,
              effectY,
              m.dissolve,
              false,
              white,
              1.0
            );
          }
        }

        // 4A. Translucent Liquid-Chrome Foil Overlay Pass (over base + face)
        if (hasFoilOverlay) {
          drawLayer(
            vc.baseAtlas,
            vc.basePos.x,
            vc.basePos.y,
            m.vx,
            m.vy,
            w,
            h,
            m.vr,
            m.tiltX,
            m.tiltY,
            hoverFac,
            SHADER_MODE.FOIL,
            effectX,
            effectY,
            m.dissolve,
            false,
            white,
            cropH
          );
          if (vc.faceAtlas && vc.facePos) {
            drawLayer(
              vc.faceAtlas,
              vc.facePos.x,
              vc.facePos.y,
              m.vx,
              m.vy,
              w,
              h,
              m.vr,
              m.tiltX,
              m.tiltY,
              hoverFac,
              SHADER_MODE.FOIL,
              effectX,
              effectY,
              m.dissolve,
              false,
              white,
              1.0
            );
          }
        }

        // 4B. Translucent Electric Neon Negative Shine Overlay Pass
        if (hasNegativeShine) {
          const nsX = m.vr * 1.6 + m.tiltX * 1.1 + motionTime * 0.38 + seed;
          drawLayer(
            vc.baseAtlas,
            vc.basePos.x,
            vc.basePos.y,
            m.vx,
            m.vy,
            w,
            h,
            m.vr,
            m.tiltX,
            m.tiltY,
            hoverFac,
            SHADER_MODE.NEGATIVE_SHINE,
            nsX,
            effectY,
            m.dissolve,
            false,
            white,
            cropH
          );
          if (vc.faceAtlas && vc.facePos) {
            drawLayer(
              vc.faceAtlas,
              vc.facePos.x,
              vc.facePos.y,
              m.vx,
              m.vy,
              w,
              h,
              m.vr,
              m.tiltX,
              m.tiltY,
              hoverFac,
              SHADER_MODE.NEGATIVE_SHINE,
              nsX,
              effectY,
              m.dissolve,
              false,
              white,
              1.0
            );
          }
        }

        // 4C. Booster Mylar Sheen, Voucher Gold-Foil Sheen, Black Hole Aura,
        //     Enhancement Material Sheens (Glass/Steel/Gold/Wild/Lucky/Bonus/Mult),
        //     Consumable Set Shimmers (Planet/Spectral/Tarot), & 3D Laminated Card Gloss!
        if (!vc.faceDown && !vc.debuffed && !nonScoring) {
          if (vc.overlayEffect === 'booster') {
            activeShaderSet.add('booster');
            const br = m.vr * 1.6 + m.tiltX * 0.85 + motionTime * 0.36 + seed;
            drawLayer(
              vc.baseAtlas,
              vc.basePos.x,
              vc.basePos.y,
              m.vx,
              m.vy,
              w,
              h,
              m.vr,
              m.tiltX,
              m.tiltY,
              hoverFac,
              SHADER_MODE.BOOSTER,
              br,
              effectY,
              m.dissolve,
              false,
              white,
              1.0
            );
          } else if (vc.overlayEffect === 'voucher') {
            activeShaderSet.add('voucher');
            const vr = m.vr * 1.6 + m.tiltX * 0.85 + motionTime * 0.36 + seed;
            drawLayer(
              vc.baseAtlas,
              vc.basePos.x,
              vc.basePos.y,
              m.vx,
              m.vy,
              w,
              h,
              m.vr,
              m.tiltX,
              m.tiltY,
              hoverFac,
              SHADER_MODE.VOUCHER,
              vr,
              effectY,
              m.dissolve,
              false,
              white,
              1.0
            );
          } else if (vc.floatingGlow === 'black_hole') {
            const br = m.vr * 1.5 + m.tiltX * 0.8 + motionTime * 0.42 + seed;
            drawLayer(
              vc.baseAtlas,
              vc.basePos.x,
              vc.basePos.y,
              m.vx,
              m.vy,
              w,
              h,
              m.vr,
              m.tiltX,
              m.tiltY,
              hoverFac,
              SHADER_MODE.NEGATIVE_SHINE,
              br,
              effectY,
              m.dissolve,
              false,
              [0.88, 0.72, 1.0, 0.92],
              1.0
            );
          } else if (vc.enhancement === 'm_glass') {
            activeShaderSet.add('glass_shimmer');
            drawLayer(
              vc.baseAtlas,
              vc.basePos.x,
              vc.basePos.y,
              m.vx,
              m.vy,
              w,
              h,
              m.vr,
              m.tiltX,
              m.tiltY,
              hoverFac,
              SHADER_MODE.GLASS_SHIMMER,
              effectX,
              effectY,
              m.dissolve,
              false,
              white,
              1.0
            );
          } else if (vc.enhancement === 'm_steel') {
            activeShaderSet.add('steel_metallic');
            drawLayer(
              vc.baseAtlas,
              vc.basePos.x,
              vc.basePos.y,
              m.vx,
              m.vy,
              w,
              h,
              m.vr,
              m.tiltX,
              m.tiltY,
              hoverFac,
              SHADER_MODE.STEEL_METALLIC,
              effectX,
              effectY,
              m.dissolve,
              false,
              white,
              1.0
            );
          } else if (vc.enhancement === 'm_gold') {
            activeShaderSet.add('gold_foil');
            drawLayer(
              vc.baseAtlas,
              vc.basePos.x,
              vc.basePos.y,
              m.vx,
              m.vy,
              w,
              h,
              m.vr,
              m.tiltX,
              m.tiltY,
              hoverFac,
              SHADER_MODE.GOLD_FOIL,
              effectX,
              effectY,
              m.dissolve,
              false,
              white,
              1.0
            );
          } else if (vc.enhancement === 'm_wild') {
            drawLayer(
              vc.baseAtlas,
              vc.basePos.x,
              vc.basePos.y,
              m.vx,
              m.vy,
              w,
              h,
              m.vr,
              m.tiltX,
              m.tiltY,
              hoverFac,
              SHADER_MODE.COSMIC_SHEEN,
              effectX,
              1.0, // prismatic rainbow flag
              m.dissolve,
              false,
              [1.0, 1.0, 1.0, 0.72],
              1.0
            );
          } else if (vc.enhancement === 'm_lucky') {
            drawLayer(
              vc.baseAtlas,
              vc.basePos.x,
              vc.basePos.y,
              m.vx,
              m.vy,
              w,
              h,
              m.vr,
              m.tiltX,
              m.tiltY,
              hoverFac,
              SHADER_MODE.COSMIC_SHEEN,
              effectX,
              0.0,
              m.dissolve,
              false,
              [0.42, 1.0, 0.62, 0.72],
              1.0
            );
          } else if (vc.enhancement === 'm_bonus') {
            drawLayer(
              vc.baseAtlas,
              vc.basePos.x,
              vc.basePos.y,
              m.vx,
              m.vy,
              w,
              h,
              m.vr,
              m.tiltX,
              m.tiltY,
              hoverFac,
              SHADER_MODE.COSMIC_SHEEN,
              effectX,
              0.0,
              m.dissolve,
              false,
              [0.28, 0.80, 1.0, 0.56],
              1.0
            );
          } else if (vc.enhancement === 'm_mult') {
            drawLayer(
              vc.baseAtlas,
              vc.basePos.x,
              vc.basePos.y,
              m.vx,
              m.vy,
              w,
              h,
              m.vr,
              m.tiltX,
              m.tiltY,
              hoverFac,
              SHADER_MODE.COSMIC_SHEEN,
              effectX,
              0.0,
              m.dissolve,
              false,
              [1.0, 0.44, 0.36, 0.56],
              1.0
            );
          } else if (vc.consumableSet && vc.edition === 'none' && !vc.soulPos) {
            const setTint: Rgba =
              vc.consumableSet === 'Planet'
                ? [0.36, 0.88, 1.0, 0.80]
                : vc.consumableSet === 'Spectral'
                  ? [0.56, 0.72, 1.0, 0.90]
                  : [0.96, 0.76, 1.0, 0.66];
            drawLayer(
              vc.baseAtlas,
              vc.basePos.x,
              vc.basePos.y,
              m.vx,
              m.vy,
              w,
              h,
              m.vr,
              m.tiltX,
              m.tiltY,
              hoverFac,
              SHADER_MODE.COSMIC_SHEEN,
              effectX,
              vc.consumableSet === 'Spectral' ? 1.0 : 0.0,
              m.dissolve,
              false,
              setTint,
              1.0
            );
          } else if (vc.edition === 'none') {
            // Subtle tilt-reactive laminated card-stock gloss on ALL normal cards & royal holo-glint on Title Ace!
            const isTitleAce = vc.kind === 'title_showcase';
            const glossAlpha = isTitleAce
              ? 0.84
              : m.dragging
                ? 0.58
                : m.hovered
                  ? 0.52
                  : vc.selected
                    ? 0.30
                    : vc.kind === 'joker' || vc.kind === 'shop_offer' || vc.kind === 'pack_card'
                      ? 0.25
                      : 0.15;
            const holoHint = isTitleAce ? 0.78 : vc.kind === 'joker' ? 0.18 : 0.0;
            if (glossAlpha > 0.05) {
              drawLayer(
                vc.baseAtlas,
                vc.basePos.x,
                vc.basePos.y,
                m.vx,
                m.vy,
                w,
                h,
                m.vr,
                m.tiltX,
                m.tiltY,
                hoverFac,
                SHADER_MODE.CARD_GLOSS,
                effectX,
                holoHint,
                m.dissolve,
                false,
                [1, 1, 1, glossAlpha],
                cropH
              );
            }
          }
        }

        // 5. Wax Seal Overlay (Gold seal blazes with molten gold_seal.fs; other seals get crisp gleam!)
        if (vc.sealPos) {
          const sealMode = vc.seal === 'Gold' ? SHADER_MODE.GOLD_SEAL : SHADER_MODE.BASE;
          if (sealMode === SHADER_MODE.GOLD_SEAL) activeShaderSet.add('gold_seal');
          drawLayer(
            'centers',
            vc.sealPos.x,
            vc.sealPos.y,
            m.vx,
            m.vy,
            w,
            h,
            m.vr,
            m.tiltX,
            m.tiltY,
            hoverFac,
            sealMode,
            effectX,
            effectY,
            m.dissolve,
            false,
            white,
            1.0,
            trigGlow
          );
          if (vc.seal && vc.seal !== 'Gold' && !vc.faceDown) {
            drawLayer(
              'centers',
              vc.sealPos.x,
              vc.sealPos.y,
              m.vx,
              m.vy,
              w,
              h,
              m.vr,
              m.tiltX,
              m.tiltY,
              hoverFac,
              SHADER_MODE.CARD_GLOSS,
              effectX * 1.2,
              0.2,
              m.dissolve,
              false,
              [1, 1, 1, 0.55],
              1.0
            );
          }
        }

        // 6. Stickers (Eternal / Perishable / Rental)
        for (const st of vc.stickers) {
          drawLayer(
            'stickers',
            st.x,
            st.y,
            m.vx,
            m.vy,
            w,
            h,
            m.vr,
            m.tiltX,
            m.tiltY,
            hoverFac,
            SHADER_MODE.BASE,
            effectX,
            effectY,
            m.dissolve,
            false,
            white,
            1.0
          );
        }
      }
    }

    // --- PASS 3B: CRISP TABLE PIXEL PARTICLES (1 Instanced Draw Call) ---
    if (this.particleProg && this.particleVao && this.particleInstanceVbo && frame.particles) {
      const { data, count } = frame.particles.packInstanceData(this.hudCanvas ? 'table' : undefined);
      if (count > 0) {
        activeShaderSet.add('particles');
        gl.useProgram(this.particleProg);
        gl.bindVertexArray(this.particleVao);
        gl.uniform2f(u.particle.res, this.cssW, this.cssH);
        gl.uniform2f(u.particle.shakeOffset, shakeX, shakeY);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.particleInstanceVbo);
        gl.bufferSubData(
          gl.ARRAY_BUFFER,
          0,
          data.subarray(0, count * PARTICLE_FLOATS_PER_INSTANCE)
        );
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
        drawCalls++;
      }
    }

    // --- PASS 3C: IMPACT RADIAL PIXEL FLASH (flash.fs) ---
    const impactFlash = frame.settings.reducedMotion ? 0 : (frame.screenFlash ?? 0);
    if (this.flashProg && impactFlash > 0.005) {
      activeShaderSet.add('flash');
      const fc = frame.screenFlashColor ?? [1, 1, 1];
      gl.useProgram(this.flashProg);
      gl.bindVertexArray(this.emptyVao);
      gl.uniform2f(u.flash.res, pw, ph);
      gl.uniform1f(u.flash.time, frame.timeSec);
      gl.uniform1f(u.flash.midFlash, impactFlash);
      gl.uniform3f(u.flash.flashColor, fc[0], fc[1], fc[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      drawCalls++;
    }

    // --- PASS 4: LUMINOUS SPECULAR BLOOM + TUNED CRT POST-PASS ---
    if (usePostFbo && this.crtProg && this.sceneTex) {
      if (useCrt) activeShaderSet.add('CRT');
      if (vortexStrength > 0.001) activeShaderSet.add('vortex');

      const bloomBoost = Math.min(
        1.0,
        flameHeat * 0.65 + (shinyCardsCount > 0 ? 0.35 : 0.15) + impactFlash * 0.5
      );

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, pw, ph);
      gl.disable(gl.BLEND);
      gl.useProgram(this.crtProg);
      gl.bindVertexArray(this.emptyVao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.uniform1i(u.crt.sceneTex, 0);
      gl.uniform2f(u.crt.res, pw, ph);
      gl.uniform1f(u.crt.time, frame.timeSec);
      gl.uniform1f(u.crt.crtAmount, useCrt ? frame.settings.crtAmount / 100 : 0);
      gl.uniform1f(u.crt.vortexStrength, 0.0);
      gl.uniform1f(u.crt.vortexAmt, 0.0);
      gl.uniform1f(u.crt.glitchIntensity, this.glitchIntensity);
      gl.uniform1f(u.crt.bloomBoost, bloomBoost);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      drawCalls++;
    }

    // --- PASS 3 (HIGH-Z OVERLAY): UNOBSTRUCTED ROARING HUD FLAMES + RISING HUD EMBERS ---
    drawCalls += this.renderHudFlameOverlay(frame, shakeX, shakeY, activeShaderSet);

    this.lastDrawCalls = drawCalls;
    this.lastActiveShaders = Array.from(activeShaderSet);
  }

  private renderCanvas2D(frame: RenderFrameInput): void {
    const ctx = this.ctx2d;
    if (!ctx) return;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.imageSmoothingEnabled = false;

    const [r, g, b] = this.bgCurrent.c2;
    ctx.fillStyle = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    let draws = 1;
    for (const vc of frame.cards) {
      const m = vc.moveable;
      const flipX = vc.flipScaleX ?? 1;
      const w = m.vw * m.vScale * flipX;
      const h = m.vh * m.vScale;
      const cropH = this.getUvCropH(vc);
      ctx.save();
      ctx.translate(m.vx, m.vy);
      ctx.rotate(m.vr);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(-w / 2 + 4, -h / 2 + 7, w, h);

      if (vc.forced) {
        ctx.strokeStyle = 'rgba(255, 198, 56, 0.92)';
        ctx.lineWidth = 3;
        ctx.strokeRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4);
      } else if (vc.scoringPreview && !vc.debuffed) {
        ctx.strokeStyle = 'rgba(82, 214, 255, 0.72)';
        ctx.lineWidth = 2;
        ctx.strokeRect(-w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 3);
      }

      this.drawAtlasCell2D(ctx, vc.baseAtlas, vc.basePos.x, vc.basePos.y, -w / 2, -h / 2, w, h, cropH);
      draws++;
      if (vc.faceAtlas && vc.facePos) {
        this.drawAtlasCell2D(ctx, vc.faceAtlas, vc.facePos.x, vc.facePos.y, -w / 2, -h / 2, w, h, 1.0);
        draws++;
      }
      if (!vc.faceDown && vc.soulAtlas && vc.soulPos) {
        this.drawAtlasCell2D(
          ctx,
          vc.soulAtlas,
          vc.soulPos.x,
          vc.soulPos.y,
          -w * 0.52,
          -h * 0.52 - 2,
          w * 1.04,
          h * 1.04,
          1.0
        );
        draws++;
      }
      if (vc.sealPos) {
        this.drawAtlasCell2D(ctx, 'centers', vc.sealPos.x, vc.sealPos.y, -w / 2, -h / 2, w, h, 1.0);
        draws++;
      }
      ctx.restore();
    }

    if (frame.particles) {
      for (const p of frame.particles.getParticles()) {
        if (this.hudCanvas && p.layer === 'hud') continue;
        const t = Math.min(1, p.age / Math.max(0.001, p.lifetime));
        const a = p.alpha * (t > 0.65 ? Math.max(0, 1 - (t - 0.65) / 0.35) : 1);
        const sz = p.size + (p.endSize - p.size) * t;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = `rgba(${Math.round(p.r * 255)},${Math.round(p.g * 255)},${Math.round(p.b * 255)},${a.toFixed(2)})`;
        ctx.fillRect(-sz * 0.5, -sz * 0.5, sz, sz);
        ctx.restore();
        draws++;
      }
    }

    ctx.restore();
    this.lastDrawCalls = draws;
    this.lastActiveShaders = ['canvas2d_fallback'];
  }

  private drawAtlasCell2D(
    ctx: CanvasRenderingContext2D,
    atlas: AtlasKey,
    col: number,
    row: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    cropH: number
  ): void {
    const img = this.packManager.getAtlas(atlas);
    const spec = ATLAS_SPECS[atlas];
    const sw = img.width / spec.cols;
    const sh = img.height / spec.rows;
    ctx.drawImage(img, col * sw, row * sh, sw, sh * cropH, dx, dy, dw, dh);
  }

  dispose(): void {
    this.detachHudFlameCanvas();
    this.canvas.removeEventListener('webglcontextlost', this.boundContextLost, false);
    this.canvas.removeEventListener('webglcontextrestored', this.boundContextRestored, false);
    const gl = this.gl;
    if (!gl || this.contextLost || gl.isContextLost()) {
      this.clearGlResourceRefs();
      return;
    }
    for (const tex of this.textures.values()) gl.deleteTexture(tex);
    this.textures.clear();
    if (this.sceneTex) gl.deleteTexture(this.sceneTex);
    if (this.sceneFbo) gl.deleteFramebuffer(this.sceneFbo);
    if (this.particleInstanceVbo) gl.deleteBuffer(this.particleInstanceVbo);
    if (this.particleVao) gl.deleteVertexArray(this.particleVao);
    if (this.quadVbo) gl.deleteBuffer(this.quadVbo);
    if (this.quadVao) gl.deleteVertexArray(this.quadVao);
    if (this.emptyVao) gl.deleteVertexArray(this.emptyVao);
    if (this.splashProg) gl.deleteProgram(this.splashProg);
    if (this.bgProg) gl.deleteProgram(this.bgProg);
    if (this.spriteProg) gl.deleteProgram(this.spriteProg);
    if (this.flameProg) gl.deleteProgram(this.flameProg);
    if (this.particleProg) gl.deleteProgram(this.particleProg);
    if (this.flashProg) gl.deleteProgram(this.flashProg);
    if (this.crtProg) gl.deleteProgram(this.crtProg);
    this.clearGlResourceRefs();
  }
}
