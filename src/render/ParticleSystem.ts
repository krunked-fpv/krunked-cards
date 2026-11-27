// ============================================================================
// Krunked Cards — Crisp Pixel-Square / Pixel-Diamond Particle System
// Zero blurry radial circles: every particle renders as a razor-sharp pixel
// square, rotated pixel diamond, or faceted glass ice-shard in WebGL2 (1 draw
// call via instancing) with full Canvas2D fallback support.
// ============================================================================

import type { GamePhase } from '../contracts/index.ts';
import type { RectPx } from './Moveable.ts';

export type ParticleShape = 0 | 1 | 2; // 0 = square, 1 = diamond, 2 = glass shard

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  size: number;
  endSize: number;
  rotation: number;
  vRot: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
  age: number;
  lifetime: number;
  shape: ParticleShape;
}

export interface ParticleFlameAnchors {
  chipsRect: RectPx;
  multRect: RectPx;
  intensity: number;
}

const MAX_PARTICLES = 512;
export const PARTICLE_FLOATS_PER_INSTANCE = 9; // x, y, size, rot, r, g, b, a, shape

type Rgb = readonly [number, number, number];

const CHIP_COLORS: readonly Rgb[] = [
  [0.0, 0.616, 1.0],
  [0.36, 0.80, 1.0],
  [0.82, 0.96, 1.0],
  [0.10, 0.45, 0.95],
];

const MULT_COLORS: readonly Rgb[] = [
  [0.996, 0.373, 0.333],
  [1.0, 0.56, 0.28],
  [1.0, 0.82, 0.36],
  [1.0, 0.96, 0.88],
];

const XMULT_COLORS: readonly Rgb[] = [
  [1.0, 0.25, 0.32],
  [1.0, 0.72, 0.20],
  [1.0, 0.94, 0.52],
  [1.0, 1.0, 1.0],
];

const MONEY_COLORS: readonly Rgb[] = [
  [0.953, 0.725, 0.345],
  [1.0, 0.87, 0.44],
  [1.0, 0.96, 0.76],
  [0.88, 0.60, 0.16],
];

const GLASS_COLORS: readonly Rgb[] = [
  [0.78, 0.96, 1.0],
  [0.54, 0.88, 1.0],
  [0.94, 0.99, 1.0],
  [0.36, 0.74, 0.95],
];

const ORANGE_COLORS: readonly Rgb[] = [
  [0.992, 0.635, 0.0],
  [1.0, 0.78, 0.28],
  [1.0, 0.92, 0.68],
];

const PURPLE_COLORS: readonly Rgb[] = [
  [0.58, 0.42, 0.86],
  [0.80, 0.62, 1.0],
  [0.45, 0.82, 1.0],
  [1.0, 0.86, 0.52],
];

const TITLE_MOTE_COLORS: readonly Rgb[] = [
  [0.96, 0.42, 0.38],
  [0.26, 0.68, 0.98],
  [1.0, 0.93, 0.78],
];

const PACK_MOTE_COLORS: readonly Rgb[] = [
  [0.74, 0.56, 1.0],
  [0.36, 0.84, 1.0],
  [1.0, 0.84, 0.44],
];

function pickColor(palette: readonly Rgb[]): Rgb {
  return palette[Math.floor(Math.random() * palette.length)] ?? palette[0]!;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private instanceBuffer = new Float32Array(MAX_PARTICLES * PARTICLE_FLOATS_PER_INSTANCE);
  private emberAccum = 0;
  private ambientAccum = 0;
  private reducedMotion = false;

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  getActiveCount(): number {
    return this.particles.length;
  }

  getParticles(): readonly Particle[] {
    return this.particles;
  }

  clear(): void {
    this.particles.length = 0;
  }

  private push(p: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) {
      this.particles.shift();
    }
    this.particles.push(p);
  }

  emitChipsBurst(x: number, y: number, intensity = 1): void {
    const count = this.reducedMotion ? 4 : Math.min(20, Math.round(9 + intensity * 4));
    for (let i = 0; i < count; i++) {
      const ang = -Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI * 1.45;
      const spd = 75 + Math.random() * 160 * (0.75 + intensity * 0.25);
      const col = pickColor(CHIP_COLORS);
      const sz = 4 + Math.random() * 4.5;
      this.push({
        x: x + (Math.random() - 0.5) * 24,
        y: y + (Math.random() - 0.5) * 16,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 35,
        gravity: 260,
        drag: 2.2,
        size: sz,
        endSize: 1.5,
        rotation: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 8,
        r: col[0],
        g: col[1],
        b: col[2],
        alpha: 1,
        age: 0,
        lifetime: 0.42 + Math.random() * 0.28,
        shape: Math.random() > 0.45 ? 1 : 0,
      });
    }
  }

  emitMultBurst(x: number, y: number, isXMult = false, intensity = 1): void {
    const base = isXMult ? 16 : 10;
    const count = this.reducedMotion ? 5 : Math.min(28, Math.round(base + intensity * 5));
    const palette = isXMult ? XMULT_COLORS : MULT_COLORS;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = (isXMult ? 110 : 80) + Math.random() * (isXMult ? 210 : 145);
      const col = pickColor(palette);
      const sz = (isXMult ? 5.5 : 4.2) + Math.random() * 5.0;
      this.push({
        x: x + (Math.random() - 0.5) * 28,
        y: y + (Math.random() - 0.5) * 18,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - (isXMult ? 55 : 35),
        gravity: isXMult ? 220 : 250,
        drag: 2.0,
        size: sz,
        endSize: 1.2,
        rotation: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 10,
        r: col[0],
        g: col[1],
        b: col[2],
        alpha: 1,
        age: 0,
        lifetime: (isXMult ? 0.52 : 0.44) + Math.random() * 0.30,
        shape: 1,
      });
    }
  }

  emitMoneyBurst(x: number, y: number, countScale = 1): void {
    const count = this.reducedMotion ? 4 : Math.min(22, Math.round(10 * countScale));
    for (let i = 0; i < count; i++) {
      const ang = -Math.PI * 0.5 + (Math.random() - 0.5) * 1.6;
      const spd = 65 + Math.random() * 140;
      const col = pickColor(MONEY_COLORS);
      const sz = 4.5 + Math.random() * 4.0;
      this.push({
        x: x + (Math.random() - 0.5) * 32,
        y: y + (Math.random() - 0.5) * 14,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 40,
        gravity: 230,
        drag: 1.8,
        size: sz,
        endSize: 1.8,
        rotation: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 7,
        r: col[0],
        g: col[1],
        b: col[2],
        alpha: 1,
        age: 0,
        lifetime: 0.48 + Math.random() * 0.32,
        shape: i % 2 === 0 ? 1 : 0,
      });
    }
  }

  emitGlassShatter(x: number, y: number): void {
    const count = this.reducedMotion ? 8 : 26;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 95 + Math.random() * 240;
      const col = pickColor(GLASS_COLORS);
      const sz = 6 + Math.random() * 7.5;
      this.push({
        x: x + (Math.random() - 0.5) * 36,
        y: y + (Math.random() - 0.5) * 44,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 70,
        gravity: 440,
        drag: 1.1,
        size: sz,
        endSize: sz * 0.45,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 16,
        r: col[0],
        g: col[1],
        b: col[2],
        alpha: 0.92,
        age: 0,
        lifetime: 0.55 + Math.random() * 0.38,
        shape: 2,
      });
    }
  }

  emitAccentBurst(x: number, y: number, kind: 'orange' | 'purple' | 'celebrate'): void {
    const palette =
      kind === 'orange' ? ORANGE_COLORS : kind === 'purple' ? PURPLE_COLORS : [...CHIP_COLORS, ...MULT_COLORS, ...MONEY_COLORS];
    const count = this.reducedMotion ? 5 : kind === 'celebrate' ? 32 : 12;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = (kind === 'celebrate' ? 120 : 75) + Math.random() * (kind === 'celebrate' ? 240 : 140);
      const col = pickColor(palette);
      const sz = 4.5 + Math.random() * 5.0;
      this.push({
        x: x + (Math.random() - 0.5) * 30,
        y: y + (Math.random() - 0.5) * 20,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - (kind === 'celebrate' ? 95 : 40),
        gravity: kind === 'celebrate' ? 260 : 190,
        drag: 1.9,
        size: sz,
        endSize: 1.5,
        rotation: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 9,
        r: col[0],
        g: col[1],
        b: col[2],
        alpha: 1,
        age: 0,
        lifetime: (kind === 'celebrate' ? 0.72 : 0.45) + Math.random() * 0.35,
        shape: i % 2 === 0 ? 1 : 0,
      });
    }
  }

  private emitFlameEmber(rect: RectPx, isChips: boolean, intensity: number): void {
    const col = isChips ? pickColor(CHIP_COLORS) : pickColor(MULT_COLORS);
    const sz = 3.0 + Math.random() * (2.6 + Math.min(2.5, intensity * 0.25));
    this.push({
      x: rect.x + rect.w * (0.14 + Math.random() * 0.72),
      y: rect.y + rect.h * (0.35 + Math.random() * 0.45),
      vx: (Math.random() - 0.5) * 38,
      vy: -(48 + Math.random() * (55 + intensity * 12)),
      gravity: -22,
      drag: 0.7,
      size: sz,
      endSize: 1.0,
      rotation: Math.random() * Math.PI,
      vRot: (Math.random() - 0.5) * 6,
      r: col[0],
      g: col[1],
      b: col[2],
      alpha: 0.92,
      age: 0,
      lifetime: 0.55 + Math.random() * 0.45,
      shape: Math.random() > 0.5 ? 0 : 1,
    });
  }

  private emitAmbientMote(viewportW: number, viewportH: number, phase: GamePhase): void {
    const isTitle = phase === 'TITLE';
    const col = pickColor(isTitle ? TITLE_MOTE_COLORS : PACK_MOTE_COLORS);
    const sz = 2.5 + Math.random() * 3.0;
    this.push({
      x: Math.random() * viewportW,
      y: viewportH + 8 - Math.random() * viewportH * 0.25,
      vx: (Math.random() - 0.5) * 26,
      vy: -(16 + Math.random() * 28),
      gravity: 0,
      drag: 0.15,
      size: sz,
      endSize: sz * 0.5,
      rotation: Math.random() * Math.PI,
      vRot: (Math.random() - 0.5) * 2.2,
      r: col[0],
      g: col[1],
      b: col[2],
      alpha: isTitle ? 0.58 : 0.68,
      age: 0,
      lifetime: 2.8 + Math.random() * 2.4,
      shape: Math.random() > 0.4 ? 1 : 0,
    });
  }

  update(
    dt: number,
    viewportW: number,
    viewportH: number,
    phase: GamePhase,
    flameAnchor: ParticleFlameAnchors | null,
    reducedMotion: boolean
  ): void {
    this.reducedMotion = reducedMotion;
    const safeDt = Math.min(0.05, Math.max(0.001, dt));

    // Rising pixel embers from roaring scoreboard flames
    if (!reducedMotion && flameAnchor && flameAnchor.intensity > 0.25) {
      const rate = Math.min(34, 6 + flameAnchor.intensity * 3.2);
      this.emberAccum += safeDt * rate;
      while (this.emberAccum >= 1) {
        this.emberAccum -= 1;
        this.emitFlameEmber(flameAnchor.chipsRect, true, flameAnchor.intensity);
        this.emitFlameEmber(flameAnchor.multRect, false, flameAnchor.intensity);
      }
    }

    // Ambient pixel dust / starlight motes on Title & Pack Open screens
    if (!reducedMotion && (phase === 'TITLE' || phase === 'PACK_OPEN')) {
      const rate = phase === 'PACK_OPEN' ? 9 : 6;
      this.ambientAccum += safeDt * rate;
      while (this.ambientAccum >= 1) {
        this.ambientAccum -= 1;
        this.emitAmbientMote(viewportW, viewportH, phase);
      }
    }

    // Step existing particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.age += safeDt;
      if (p.age >= p.lifetime) {
        this.particles.splice(i, 1);
        continue;
      }
      const dragFac = Math.exp(-p.drag * safeDt);
      p.vx *= dragFac;
      p.vy = p.vy * dragFac + p.gravity * safeDt;
      p.x += p.vx * safeDt;
      p.y += p.vy * safeDt;
      p.rotation += p.vRot * safeDt;
    }
  }

  /**
   * Pack active particles into tightly-strided Float32Array for single-call WebGL2 instancing.
   */
  packInstanceData(): { data: Float32Array; count: number } {
    const count = Math.min(MAX_PARTICLES, this.particles.length);
    const out = this.instanceBuffer;
    for (let i = 0; i < count; i++) {
      const p = this.particles[i]!;
      const t = Math.min(1, p.age / Math.max(0.001, p.lifetime));
      // Smooth fade-in at start (first 8%) and crisp fade-out over final 35%
      const fadeIn = Math.min(1, t / 0.08);
      const fadeOut = t > 0.65 ? Math.max(0, 1 - (t - 0.65) / 0.35) : 1;
      const curSize = p.size + (p.endSize - p.size) * t;
      const off = i * PARTICLE_FLOATS_PER_INSTANCE;
      out[off] = p.x;
      out[off + 1] = p.y;
      out[off + 2] = curSize;
      out[off + 3] = p.rotation;
      out[off + 4] = p.r;
      out[off + 5] = p.g;
      out[off + 6] = p.b;
      out[off + 7] = p.alpha * fadeIn * fadeOut;
      out[off + 8] = p.shape;
    }
    return { data: out, count };
  }
}
