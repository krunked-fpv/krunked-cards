// ============================================================================
// Krunked Cards — Multi-Pass WebGL2 Renderer (with graceful Canvas2D fallback)
// Pass 1A: Title Splash Vortex (splash.fs)
// Pass 1B: Gameplay Felt Swirl (background.fs)
// Pass 2:  Crisp NEAREST Card & Sprite Quads (drop shadow + base + face +
//          2-layer floating soulPos parallax & hologram.fs + translucent Foil /
//          Negative Shine / Booster / Voucher overlays + Played dimming +
//          Holo / Polychrome / Debuff / Dissolve / GoldSeal + 3D skew & flips)
// Pass 3:  Roaring Scoreboard Flames behind Chips & Mult boxes (flame.fs)
// Pass 3B: Crisp Instanced Pixel-Square / Pixel-Diamond Particles
// Pass 3C: Impact / Entry Radial Pixel Flash (flash.fs)
// Pass 4:  Screen Vortex Warp (vortex.fs) + Tuned CRT Post-Pass (CRT.fs)
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
    // e_foil renders crisp base first, followed by exact translucent foil.fs overlay pass!
    default:
      return SHADER_MODE.BASE;
  }
}

export class WebGL2Renderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private packManager: PackManager;

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

  // Scene FBO for Vortex + CRT post-pass
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

  constructor(canvas: HTMLCanvasElement, packManager: PackManager) {
    this.canvas = canvas;
    this.packManager = packManager;
    this.initContext();
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
    this.titleMidFlash = 0.28;
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
      gl.bufferData(gl.ARRAY_BUFFER, 512 * stride, gl.DYNAMIC_DRAW);
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
    if (!this.gl) return;
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
        // If artwork spans near the full cell height (e.g. built-in full card), keep 1.0 so nothing clips
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
    if (!gl) return;
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
    this.cssW = Math.max(320, Math.floor(cssWidth));
    this.cssH = Math.max(240, Math.floor(cssHeight));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.floor(this.cssW * this.dpr);
    const ph = Math.floor(this.cssH * this.dpr);

    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }

    if (this.gl && (this.fboW !== pw || this.fboH !== ph)) {
      this.rebuildSceneFbo(pw, ph);
    }
  }

  private rebuildSceneFbo(pw: number, ph: number): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.sceneTex) gl.deleteTexture(this.sceneTex);
    if (this.sceneFbo) gl.deleteFramebuffer(this.sceneFbo);

    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) return;

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pw, ph, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.sceneTex = tex;
    this.sceneFbo = fbo;
    this.fboW = pw;
    this.fboH = ph;
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

    this.spinTime += safeDt * (1.0 + this.bgCurrent.spinAmount * 1.45) * motionScale;
    this.splashElapsed += safeDt * motionScale;
    this.titleMidFlash = Math.max(0, this.titleMidFlash - Math.max(safeDt, frame.dt) * 0.9);

    // Step background vortex swirl pulse (vortex.fs energy applied to Pass 1 so cards stay aligned with DOM buttons!)
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

    if (!this.gl || !this.uniforms) {
      this.renderCanvas2D(frame);
      return;
    }

    const gl = this.gl;
    const u = this.uniforms;
    const pw = this.canvas.width;
    const ph = this.canvas.height;
    const useCrt = frame.settings.crtAmount > 0.5;
    const usePostFbo =
      (useCrt || vortexStrength > 0.001 || this.glitchIntensity > 0.005) &&
      this.sceneFbo !== null &&
      this.sceneTex !== null;
    const activeShaderSet = new Set<string>();
    let drawCalls = 0;

    const shakeX = frame.settings.reducedMotion ? 0 : (frame.shakeX ?? 0);
    const shakeY = frame.settings.reducedMotion ? 0 : (frame.shakeY ?? 0);

    // Bind scene FBO if CRT or Vortex post-pass is active, else default backbuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, usePostFbo ? this.sceneFbo : null);
    gl.viewport(0, 0, pw, ph);

    // --- PASS 1: TITLE SPLASH VORTEX (splash.fs) OR GAMEPLAY SWIRL (background.fs) ---
    if (frame.phase === 'TITLE' && this.splashProg) {
      activeShaderSet.add('splash');
      gl.disable(gl.BLEND);
      gl.useProgram(this.splashProg);
      gl.bindVertexArray(this.emptyVao);
      gl.uniform2f(u.splash.res, pw, ph);
      // Steady-state splash.fs vortex time (>= 11.7s brings out vivid crimson + cerulean + core glow)
      gl.uniform1f(u.splash.time, 12.4 + this.splashElapsed);
      gl.uniform1f(u.splash.vortSpeed, 0.42);
      gl.uniform4f(u.splash.c1, 0.871, 0.267, 0.231, 1.0); // #de443b iconic crimson
      gl.uniform4f(u.splash.c2, 0.0, 0.420, 0.706, 1.0);   // #006bb4 iconic cerulean
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
      gl.uniform1f(u.bg.contrast, this.bgCurrent.contrast + vortexStrength * 0.55);
      gl.uniform1f(u.bg.spinAmount, this.bgCurrent.spinAmount + vortexStrength * 0.45);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      drawCalls++;
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // --- PASS 3 (placed behind left-rail UI boxes): ROARING FLAMES (flame.fs) ---
    if (this.flameProg && frame.flameAnchor && frame.flameAnchor.intensity > 0.08) {
      activeShaderSet.add('flame');
      const intensity = frame.flameAnchor.intensity;
      const hotShift = Math.max(0, Math.min(1, (intensity - 4.0) / 5.5));

      gl.useProgram(this.flameProg);
      gl.bindVertexArray(this.quadVao);
      gl.uniform2f(u.flame.res, this.cssW, this.cssH);
      gl.uniform1f(u.flame.time, frame.timeSec * (1 + hotShift * 0.35));
      gl.uniform1f(u.flame.amount, intensity);

      // Roaring Blue Chips Flame (shifts toward electric cyan / white-hot at huge scores)
      const cr = frame.flameAnchor.chipsRect;
      const extraH = Math.round(Math.min(44, intensity * 5.2));
      gl.uniform4f(u.flame.rect, cr.x - 4, cr.y - extraH, cr.w + 8, cr.h + extraH);
      gl.uniform4f(
        u.flame.c1,
        0.0 + hotShift * 0.24,
        0.62 + hotShift * 0.28,
        1.0,
        1.0
      );
      gl.uniform4f(
        u.flame.c2,
        0.68 + hotShift * 0.32,
        0.95 + hotShift * 0.05,
        1.0,
        1.0
      );
      gl.uniform1f(u.flame.id, 1.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      drawCalls++;

      // Roaring Crimson-Gold Mult Flame (shifts toward blazing gold / white-hot at huge scores)
      const mr = frame.flameAnchor.multRect;
      gl.uniform4f(u.flame.rect, mr.x - 4, mr.y - extraH, mr.w + 8, mr.h + extraH);
      gl.uniform4f(
        u.flame.c1,
        1.0,
        0.37 + hotShift * 0.30,
        0.33 + hotShift * 0.12,
        1.0
      );
      gl.uniform4f(
        u.flame.c2,
        1.0,
        0.85 + hotShift * 0.14,
        0.32 + hotShift * 0.56,
        1.0
      );
      gl.uniform1f(u.flame.id, 2.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      drawCalls++;
    }

    // --- PASS 2: CARD & SPRITE QUADS ---
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
        uvCropH = 1.0
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
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        drawCalls++;
      };

      const white: Rgba = [1, 1, 1, 1];
      const glassTint: Rgba = [1, 1, 1, 0.90];
      const soulShadowTint: Rgba = [1, 1, 1, 0.82];
      const blackHoleTint: Rgba = [0.92, 0.86, 1.0, 1.0];

      for (const vc of frame.cards) {
        const m = vc.moveable;
        const flipX = vc.flipScaleX ?? 1;
        const w = m.vw * m.vScale * flipX;
        const h = m.vh * m.vScale;
        const cropH = this.getUvCropH(vc);
        const hoverFac = m.dragging
          ? 1.35
          : m.hovered
            ? 1.0
            : vc.kind === 'title_showcase'
              ? 0.55
              : 0.0;
        const shadowOff = m.dragging
          ? 19
          : vc.kind === 'title_showcase'
            ? 18
            : m.hovered
              ? 13
              : vc.selected
                ? 10
                : 5.5;

        const nonScoring = Boolean(vc.nonScoring);
        const primaryMode = getPrimaryCardMode(vc.edition, vc.debuffed, nonScoring);
        const hasFoilOverlay = !vc.debuffed && !nonScoring && !vc.faceDown && vc.edition === 'e_foil';
        const hasNegativeShine = !vc.debuffed && !nonScoring && !vc.faceDown && vc.edition === 'e_negative';

        if (primaryMode === SHADER_MODE.HOLO) activeShaderSet.add('holo');
        else if (primaryMode === SHADER_MODE.POLYCHROME) activeShaderSet.add('polychrome');
        else if (primaryMode === SHADER_MODE.NEGATIVE) activeShaderSet.add('negative');
        else if (primaryMode === SHADER_MODE.DEBUFF) activeShaderSet.add('debuff');
        else if (primaryMode === SHADER_MODE.PLAYED) activeShaderSet.add('played');
        if (hasFoilOverlay) activeShaderSet.add('foil');
        if (hasNegativeShine) activeShaderSet.add('negative_shine');
        if (m.dissolve > 0.01) activeShaderSet.add('dissolve');

        const seed = vc.index * 0.61 + (vc.id.charCodeAt(vc.id.length - 1) || 0) * 0.13;
        const effectX = m.vr * 2.5 + m.tiltX * 1.9 + frame.timeSec * 0.58 + seed;
        const effectY = frame.timeSec * 0.52 + m.tiltY * 1.2 + seed * 1.3;

        // 1. Crisp drop shadow proportional to elevation
        drawLayer(
          vc.baseAtlas,
          vc.basePos.x,
          vc.basePos.y,
          m.vx + shadowOff * 0.52 - m.tiltX * 5.5,
          m.vy + shadowOff - m.tiltY * 3.0,
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
          cropH
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
            1.0
          );
        }

        // 3B. True 2-Layer Floating soulPos Parallax (Legendaries, j_hologram, c_soul)
        if (!vc.faceDown && vc.soulAtlas && vc.soulPos) {
          const t = frame.timeSec * motionScale;
          const isHoloJoker = vc.soulShader === 'hologram';
          const isSoulGem = vc.soulShader === 'soul_gem';
          const breath = frame.settings.reducedMotion
            ? 1.04
            : 1.04 + 0.03 * Math.sin(t * 2.1 + seed);
          const soulW = w * breath;
          const soulH = h * breath;
          const soulRot =
            m.vr +
            (frame.settings.reducedMotion ? 0 : -0.045 * Math.cos(t * 1.45 + seed));
          const orbitX = frame.settings.reducedMotion ? 0 : Math.sin(t * 1.3 + seed) * 1.8;
          const orbitY = frame.settings.reducedMotion ? 0 : Math.cos(t * 1.7 + seed) * 2.4;
          const soulX = m.vx + orbitX - m.tiltX * 5.0;
          const soulY = m.vy + orbitY - 2.0 - m.tiltY * 4.5;

          // Floating soul shadow slightly offset below/right of the hovering portrait
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

          // Floating soul sprite itself
          const soulMode: ShaderMode = isHoloJoker
            ? SHADER_MODE.HOLOGRAM
            : isSoulGem && primaryMode === SHADER_MODE.BASE
              ? SHADER_MODE.POLYCHROME
              : primaryMode;

          if (isHoloJoker) activeShaderSet.add('hologram');
          else if (soulMode === SHADER_MODE.POLYCHROME) activeShaderSet.add('polychrome');

          const soulEffX = isHoloJoker ? m.vr * 2.0 + m.tiltX * 1.5 + seed : effectX;
          const soulEffY = isHoloJoker ? frame.timeSec * 1.65 + seed : effectY;

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
            1.0
          );

          // Apply Foil or Negative Shine overlays to Legendary floating busts too!
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

        // 4A. Translucent Foil Overlay Pass (exact foil.fs over base + face)
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

        // 4B. Translucent Negative Shine Overlay Pass (exact negative_shine.fs)
        if (hasNegativeShine) {
          const nsX = m.vr * 1.4 + m.tiltX * 0.8 + frame.timeSec * 0.28 + seed;
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

        // 4C. Booster Pack Glossy Foil Sheen (booster.fs) & Voucher Sheen (voucher.fs)
        if (!vc.faceDown && vc.overlayEffect === 'booster') {
          activeShaderSet.add('booster');
          const br = m.vr * 1.5 + m.tiltX * 0.55 + frame.timeSec * 0.22 + seed;
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
        } else if (!vc.faceDown && vc.overlayEffect === 'voucher') {
          activeShaderSet.add('voucher');
          const vr = m.vr * 1.5 + m.tiltX * 0.55 + frame.timeSec * 0.24 + seed;
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
        } else if (!vc.faceDown && vc.floatingGlow === 'black_hole') {
          // Subtle cosmic sheen over Black Hole spectral
          const br = m.vr * 1.4 + m.tiltX * 0.6 + frame.timeSec * 0.34 + seed;
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
            [0.85, 0.72, 1.0, 0.85],
            1.0
          );
        }

        // 5. Wax Seal Overlay (Gold seal uses gold_seal.fs shimmer!)
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
            1.0
          );
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

    // --- PASS 3B: CRISP PIXEL-SQUARE / PIXEL-DIAMOND PARTICLES (1 Instanced Draw Call) ---
    if (this.particleProg && this.particleVao && this.particleInstanceVbo && frame.particles) {
      const { data, count } = frame.particles.packInstanceData();
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

    // --- PASS 3C: SUBTLE IMPACT RADIAL PIXEL FLASH (flash.fs) ---
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

    // --- PASS 4: SCREEN VORTEX WARP (vortex.fs) + TUNED CRT POST-PASS (CRT.fs) ---
    if (usePostFbo && this.crtProg && this.sceneTex) {
      if (useCrt) activeShaderSet.add('CRT');
      if (vortexStrength > 0.001) activeShaderSet.add('vortex');

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
      // Keep full-screen Pass 4 un-twisted so WebGL2 cards stay 100% locked onto DOM buttons
      gl.uniform1f(u.crt.vortexStrength, 0.0);
      gl.uniform1f(u.crt.vortexAmt, 0.0);
      gl.uniform1f(u.crt.glitchIntensity, this.glitchIntensity);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      drawCalls++;
    }

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

    // Crisp pixel particles fallback
    if (frame.particles) {
      for (const p of frame.particles.getParticles()) {
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
    const gl = this.gl;
    if (!gl) return;
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
  }
}
