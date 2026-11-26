// ============================================================================
// Krunked Cards — 4-Pass WebGL2 Renderer (with graceful Canvas2D fallback)
// Pass 1: Background Swirl (background.fs)
// Pass 2: Crisp NEAREST Card & Sprite Quads (drop shadow + base + face + seal
//         + stickers + Foil/Holo/Polychrome/Negative/Debuff/Dissolve/GoldSeal)
// Pass 3: Roaring Scoreboard Flames behind Chips & Mult boxes (flame.fs)
// Pass 4: Optional CRT Post-Pass from scene FBO (CRT.fs)
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
import type { RectPx, VisualCard } from './Moveable.ts';
import {
  BACKGROUND_FRAG,
  BACKGROUND_VERT,
  compileProgram,
  CRT_FRAG,
  CRT_VERT,
  FLAME_FRAG,
  FLAME_VERT,
  SHADER_MODE,
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
}

interface BgPaletteTarget {
  c1: Rgba;
  c2: Rgba;
  c3: Rgba;
  contrast: number;
  spinAmount: number;
}

function hexToRgba(hex: string, alpha = 1): Rgba {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  if (Number.isNaN(num)) return [0.18, 0.42, 0.32, alpha];
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
      c1: hexToRgba('#8f2d3f'),
      c2: hexToRgba('#293d47'),
      c3: hexToRgba('#1b2226'),
      contrast: 2.8,
      spinAmount: 0.16,
    };
  }
  if (phase === 'PACK_OPEN') {
    return {
      c1: hexToRgba('#573d8a'),
      c2: hexToRgba('#1f4e7a'),
      c3: hexToRgba('#141724'),
      contrast: 3.2,
      spinAmount: 0.24,
    };
  }
  if (phase === 'VICTORY') {
    return {
      c1: hexToRgba('#d99b26'),
      c2: hexToRgba('#2a6b52'),
      c3: hexToRgba('#1c2624'),
      contrast: 3.0,
      spinAmount: 0.3,
    };
  }
  if (phase === 'GAME_OVER') {
    return {
      c1: hexToRgba('#7a2222'),
      c2: hexToRgba('#22262b'),
      c3: hexToRgba('#111417'),
      contrast: 2.6,
      spinAmount: 0.12,
    };
  }
  if (bossColor && (phase === 'PLAYING' || phase === 'SCORING' || phase === 'CASHOUT')) {
    const bc = hexToRgba(bossColor);
    return {
      c1: bc,
      c2: darken(bc, 0.52),
      c3: hexToRgba('#192224'),
      contrast: 2.9,
      spinAmount: 0.22,
    };
  }
  // Iconic emerald felt swirl for Small/Big Blind & Blind Select
  return {
    c1: hexToRgba('#3a7d5e'),
    c2: hexToRgba('#1e523e'),
    c3: hexToRgba('#162325'),
    contrast: 2.7,
    spinAmount: 0.14,
  };
}

function editionToShaderMode(edition: EditionId, debuffed: boolean): ShaderMode {
  if (debuffed) return SHADER_MODE.DEBUFF;
  switch (edition) {
    case 'e_foil':
      return SHADER_MODE.FOIL;
    case 'e_holo':
      return SHADER_MODE.HOLO;
    case 'e_polychrome':
      return SHADER_MODE.POLYCHROME;
    case 'e_negative':
      return SHADER_MODE.NEGATIVE;
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
  private bgProg: WebGLProgram | null = null;
  private spriteProg: WebGLProgram | null = null;
  private flameProg: WebGLProgram | null = null;
  private crtProg: WebGLProgram | null = null;

  private emptyVao: WebGLVertexArrayObject | null = null;
  private quadVao: WebGLVertexArrayObject | null = null;
  private quadVbo: WebGLBuffer | null = null;

  // Scene FBO for CRT post-pass
  private sceneFbo: WebGLFramebuffer | null = null;
  private sceneTex: WebGLTexture | null = null;
  private fboW = 0;
  private fboH = 0;

  // Cached GL textures per AtlasKey
  private textures = new Map<AtlasKey, WebGLTexture>();

  // Smooth animated background palette
  private bgCurrent: BgPaletteTarget = getTargetBgPalette('TITLE', null);
  private spinTime = 0;

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
      this.bgProg = compileProgram(gl, BACKGROUND_VERT, BACKGROUND_FRAG, 'background');
      this.spriteProg = compileProgram(gl, SPRITE_VERT, SPRITE_FRAG, 'sprite');
      this.flameProg = compileProgram(gl, FLAME_VERT, FLAME_FRAG, 'flame');
      this.crtProg = compileProgram(gl, CRT_VERT, CRT_FRAG, 'crt');

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
    const gl = this.gl;
    if (!gl) return;
    const all = this.packManager.getAllActiveAtlases();
    for (const key of ATLAS_KEYS) {
      this.uploadAtlas(key, all[key]);
    }
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
    const targetBg = getTargetBgPalette(frame.phase, frame.bossColor);
    const bgLerp = Math.min(1, frame.dt * 2.8);
    this.bgCurrent.c1 = lerpRgba(this.bgCurrent.c1, targetBg.c1, bgLerp);
    this.bgCurrent.c2 = lerpRgba(this.bgCurrent.c2, targetBg.c2, bgLerp);
    this.bgCurrent.c3 = lerpRgba(this.bgCurrent.c3, targetBg.c3, bgLerp);
    this.bgCurrent.contrast += (targetBg.contrast - this.bgCurrent.contrast) * bgLerp;
    this.bgCurrent.spinAmount += (targetBg.spinAmount - this.bgCurrent.spinAmount) * bgLerp;

    const motionScale = frame.settings.reducedMotion ? 0.15 : 1.0;
    this.spinTime += frame.dt * (1.0 + this.bgCurrent.spinAmount * 1.4) * motionScale;

    if (!this.gl) {
      this.renderCanvas2D(frame);
      return;
    }

    const gl = this.gl;
    const pw = this.canvas.width;
    const ph = this.canvas.height;
    const useCrt = frame.settings.crtAmount > 0.5 && this.sceneFbo !== null && this.sceneTex !== null;
    const activeShaderSet = new Set<string>(['background']);
    let drawCalls = 0;

    // Bind scene FBO if CRT pass enabled, else default backbuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, useCrt ? this.sceneFbo : null);
    gl.viewport(0, 0, pw, ph);

    // --- PASS 1: BACKGROUND SWIRL ---
    if (this.bgProg) {
      gl.disable(gl.BLEND);
      gl.useProgram(this.bgProg);
      gl.bindVertexArray(this.emptyVao);
      gl.uniform2f(gl.getUniformLocation(this.bgProg, 'u_resolution'), pw, ph);
      gl.uniform1f(gl.getUniformLocation(this.bgProg, 'u_time'), frame.timeSec * motionScale);
      gl.uniform1f(gl.getUniformLocation(this.bgProg, 'u_spinTime'), this.spinTime);
      gl.uniform4fv(gl.getUniformLocation(this.bgProg, 'u_colour1'), this.bgCurrent.c1);
      gl.uniform4fv(gl.getUniformLocation(this.bgProg, 'u_colour2'), this.bgCurrent.c2);
      gl.uniform4fv(gl.getUniformLocation(this.bgProg, 'u_colour3'), this.bgCurrent.c3);
      gl.uniform1f(gl.getUniformLocation(this.bgProg, 'u_contrast'), this.bgCurrent.contrast);
      gl.uniform1f(gl.getUniformLocation(this.bgProg, 'u_spinAmount'), this.bgCurrent.spinAmount);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      drawCalls++;
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // --- PASS 3 (placed behind left-rail UI boxes): ROARING FLAMES ---
    if (this.flameProg && frame.flameAnchor && frame.flameAnchor.intensity > 0.08) {
      activeShaderSet.add('flame');
      gl.useProgram(this.flameProg);
      gl.bindVertexArray(this.quadVao);
      const uRes = gl.getUniformLocation(this.flameProg, 'u_resolution');
      const uRect = gl.getUniformLocation(this.flameProg, 'u_rect');
      const uTime = gl.getUniformLocation(this.flameProg, 'u_time');
      const uAmount = gl.getUniformLocation(this.flameProg, 'u_amount');
      const uC1 = gl.getUniformLocation(this.flameProg, 'u_colour1');
      const uC2 = gl.getUniformLocation(this.flameProg, 'u_colour2');
      const uId = gl.getUniformLocation(this.flameProg, 'u_id');

      gl.uniform2f(uRes, this.cssW, this.cssH);
      gl.uniform1f(uTime, frame.timeSec);
      gl.uniform1f(uAmount, frame.flameAnchor.intensity);

      // Blue Chips Flame
      const cr = frame.flameAnchor.chipsRect;
      gl.uniform4f(uRect, cr.x, cr.y, cr.w, cr.h);
      gl.uniform4f(uC1, 0.0, 0.62, 1.0, 1.0);
      gl.uniform4f(uC2, 0.72, 0.94, 1.0, 1.0);
      gl.uniform1f(uId, 1.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      drawCalls++;

      // Crimson-Gold Mult Flame
      const mr = frame.flameAnchor.multRect;
      gl.uniform4f(uRect, mr.x, mr.y, mr.w, mr.h);
      gl.uniform4f(uC1, 0.996, 0.373, 0.333, 1.0);
      gl.uniform4f(uC2, 1.0, 0.85, 0.32, 1.0);
      gl.uniform1f(uId, 2.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      drawCalls++;
    }

    // --- PASS 2: CARD & SPRITE QUADS ---
    if (this.spriteProg && frame.cards.length > 0) {
      activeShaderSet.add('sprite');
      gl.useProgram(this.spriteProg);
      gl.bindVertexArray(this.quadVao);
      gl.activeTexture(gl.TEXTURE0);

      const uRes = gl.getUniformLocation(this.spriteProg, 'u_resolution');
      const uCenter = gl.getUniformLocation(this.spriteProg, 'u_center');
      const uSize = gl.getUniformLocation(this.spriteProg, 'u_size');
      const uRot = gl.getUniformLocation(this.spriteProg, 'u_rotation');
      const uUvRect = gl.getUniformLocation(this.spriteProg, 'u_uvRect');
      const uTilt = gl.getUniformLocation(this.spriteProg, 'u_tilt');
      const uHovering = gl.getUniformLocation(this.spriteProg, 'u_hovering');
      const uMousePos = gl.getUniformLocation(this.spriteProg, 'u_mousePos');
      const uTex = gl.getUniformLocation(this.spriteProg, 'u_tex');
      const uMode = gl.getUniformLocation(this.spriteProg, 'u_shaderMode');
      const uTime = gl.getUniformLocation(this.spriteProg, 'u_time');
      const uEffect = gl.getUniformLocation(this.spriteProg, 'u_effectVec');
      const uDissolve = gl.getUniformLocation(this.spriteProg, 'u_dissolve');
      const uShadow = gl.getUniformLocation(this.spriteProg, 'u_shadow');
      const uTint = gl.getUniformLocation(this.spriteProg, 'u_tint');
      const uCellPx = gl.getUniformLocation(this.spriteProg, 'u_cellPixels');
      const uBurn1 = gl.getUniformLocation(this.spriteProg, 'u_burnColour1');
      const uBurn2 = gl.getUniformLocation(this.spriteProg, 'u_burnColour2');

      gl.uniform2f(uRes, this.cssW, this.cssH);
      gl.uniform2f(uMousePos, frame.mouseX, frame.mouseY);
      gl.uniform1i(uTex, 0);
      gl.uniform1f(uTime, frame.timeSec);
      gl.uniform4f(uBurn1, 1.0, 0.65, 0.2, 1.0);
      gl.uniform4f(uBurn2, 0.996, 0.373, 0.333, 1.0);

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
        tint: Rgba
      ) => {
        if (!bindAtlas(atlas)) return;
        const spec = ATLAS_SPECS[atlas];
        const u0 = col / spec.cols;
        const v0 = row / spec.rows;
        const uW = 1 / spec.cols;
        const vH = 1 / spec.rows;

        gl.uniform2f(uCenter, cx, cy);
        gl.uniform2f(uSize, w, h);
        gl.uniform1f(uRot, rot);
        gl.uniform4f(uUvRect, u0, v0, uW, vH);
        gl.uniform2f(uTilt, tiltX, tiltY);
        gl.uniform1f(uHovering, hovering);
        gl.uniform1i(uMode, mode);
        gl.uniform2f(uEffect, effectX, effectY);
        gl.uniform1f(uDissolve, dissolve);
        gl.uniform1i(uShadow, isShadow ? 1 : 0);
        gl.uniform4fv(uTint, tint);
        gl.uniform2f(uCellPx, spec.cellW, spec.cellH);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        drawCalls++;
      };

      const white: Rgba = [1, 1, 1, 1];
      const glassTint: Rgba = [1, 1, 1, 0.92];

      for (const vc of frame.cards) {
        const m = vc.moveable;
        const w = m.vw * m.vScale;
        const h = m.vh * m.vScale;
        const hoverFac = m.dragging ? 1.3 : m.hovered ? 1.0 : 0.0;
        const shadowOff = m.dragging ? 16 : m.hovered ? 11 : vc.selected ? 9 : 6;
        const mode = editionToShaderMode(vc.edition, vc.debuffed);

        if (mode === SHADER_MODE.FOIL) activeShaderSet.add('foil');
        else if (mode === SHADER_MODE.HOLO) activeShaderSet.add('holo');
        else if (mode === SHADER_MODE.POLYCHROME) activeShaderSet.add('polychrome');
        else if (mode === SHADER_MODE.NEGATIVE) activeShaderSet.add('negative');
        else if (mode === SHADER_MODE.DEBUFF) activeShaderSet.add('debuff');
        if (m.dissolve > 0.01) activeShaderSet.add('dissolve');

        const effectX = m.vr * 2.5 + m.tiltX * 0.9 + frame.timeSec * 0.6 + vc.index * 0.45;
        const effectY = frame.timeSec * 0.45 + m.tiltY * 0.5 + vc.index * 0.7;

        // 1. Crisp drop shadow
        drawLayer(
          vc.baseAtlas,
          vc.basePos.x,
          vc.basePos.y,
          m.vx + shadowOff * 0.55 - m.tiltX * 4,
          m.vy + shadowOff,
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
          white
        );

        // 2. Base card / enhancement / Joker / Tarot / Voucher / Booster
        const baseTint = vc.enhancement === 'm_glass' && !vc.faceDown ? glassTint : white;
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
          mode,
          effectX,
          effectY,
          m.dissolve,
          false,
          baseTint
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
            mode,
            effectX,
            effectY,
            m.dissolve,
            false,
            white
          );
        }

        // 4. Wax Seal Overlay (Gold seal uses gold_seal.fs shimmer!)
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
            white
          );
        }

        // 5. Stickers (Eternal / Perishable / Rental)
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
            white
          );
        }
      }
    }

    // --- PASS 4: OPTIONAL CRT POST-PASS ---
    if (useCrt && this.crtProg && this.sceneTex) {
      activeShaderSet.add('CRT');
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, pw, ph);
      gl.disable(gl.BLEND);
      gl.useProgram(this.crtProg);
      gl.bindVertexArray(this.emptyVao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.uniform1i(gl.getUniformLocation(this.crtProg, 'u_sceneTex'), 0);
      gl.uniform2f(gl.getUniformLocation(this.crtProg, 'u_resolution'), pw, ph);
      gl.uniform1f(gl.getUniformLocation(this.crtProg, 'u_time'), frame.timeSec);
      gl.uniform1f(gl.getUniformLocation(this.crtProg, 'u_crtAmount'), frame.settings.crtAmount / 100);
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
      const w = m.vw * m.vScale;
      const h = m.vh * m.vScale;
      ctx.save();
      ctx.translate(m.vx, m.vy);
      ctx.rotate(m.vr);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(-w / 2 + 4, -h / 2 + 7, w, h);

      this.drawAtlasCell2D(ctx, vc.baseAtlas, vc.basePos.x, vc.basePos.y, -w / 2, -h / 2, w, h);
      draws++;
      if (vc.faceAtlas && vc.facePos) {
        this.drawAtlasCell2D(ctx, vc.faceAtlas, vc.facePos.x, vc.facePos.y, -w / 2, -h / 2, w, h);
        draws++;
      }
      if (vc.sealPos) {
        this.drawAtlasCell2D(ctx, 'centers', vc.sealPos.x, vc.sealPos.y, -w / 2, -h / 2, w, h);
        draws++;
      }
      ctx.restore();
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
    dh: number
  ): void {
    const img = this.packManager.getAtlas(atlas);
    const spec = ATLAS_SPECS[atlas];
    const sw = img.width / spec.cols;
    const sh = img.height / spec.rows;
    ctx.drawImage(img, col * sw, row * sh, sw, sh, dx, dy, dw, dh);
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl) return;
    for (const tex of this.textures.values()) gl.deleteTexture(tex);
    this.textures.clear();
    if (this.sceneTex) gl.deleteTexture(this.sceneTex);
    if (this.sceneFbo) gl.deleteFramebuffer(this.sceneFbo);
    if (this.quadVbo) gl.deleteBuffer(this.quadVbo);
    if (this.quadVao) gl.deleteVertexArray(this.quadVao);
    if (this.emptyVao) gl.deleteVertexArray(this.emptyVao);
    if (this.bgProg) gl.deleteProgram(this.bgProg);
    if (this.spriteProg) gl.deleteProgram(this.spriteProg);
    if (this.flameProg) gl.deleteProgram(this.flameProg);
    if (this.crtProg) gl.deleteProgram(this.crtProg);
  }
}
