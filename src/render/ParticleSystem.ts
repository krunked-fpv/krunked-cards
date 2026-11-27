// ============================================================================
// Krunked Cards — Crisp Pixel Particle System (Visual Juice++)
// Zero blurry circles: every particle renders as a razor-sharp pixel square,
// rotated pixel diamond, faceted glass ice-shard, 4-point holographic sparkle
// star, or rising pixel flame wisp in WebGL2 (1 instanced draw call per layer)
// with full Canvas2D fallback support.
// ============================================================================

import type { EditionId, GamePhase } from '../contracts/index.ts';
import type { RectPx, VisualCard } from './Moveable.ts';

// 0 = square, 1 = diamond, 2 = glass shard, 3 = 4-point sparkle star, 4 = flame wisp
export type ParticleShape = 0 | 1 | 2 | 3 | 4;
export type ParticleLayer = 'table' | 'hud';

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
  layer?: ParticleLayer;
}

export interface ParticleFlameAnchors {
  chipsRect: RectPx;
  multRect: RectPx;
  intensity: number;
}

export const MAX_PARTICLES = 960;
export const PARTICLE_FLOATS_PER_INSTANCE = 9; // x, y, size, rot, r, g, b, a, shape

type Rgb = readonly [number, number, number];

const CHIP_COLORS: readonly Rgb[] = [
  [0.0, 0.616, 1.0],
  [0.24, 0.84, 1.0],
  [0.72, 0.96, 1.0],
  [0.10, 0.48, 0.98],
  [1.0, 1.0, 1.0],
];

const MULT_COLORS: readonly Rgb[] = [
  [0.996, 0.373, 0.333],
  [1.0, 0.56, 0.22],
  [1.0, 0.84, 0.32],
  [1.0, 0.97, 0.85],
];

const XMULT_COLORS: readonly Rgb[] = [
  [1.0, 0.24, 0.32],
  [1.0, 0.70, 0.16],
  [1.0, 0.94, 0.44],
  [1.0, 1.0, 1.0],
];

const MONEY_COLORS: readonly Rgb[] = [
  [0.953, 0.725, 0.345],
  [1.0, 0.88, 0.40],
  [1.0, 0.97, 0.76],
  [0.94, 0.66, 0.16],
];

const GLASS_COLORS: readonly Rgb[] = [
  [0.78, 0.96, 1.0],
  [0.54, 0.88, 1.0],
  [0.94, 0.99, 1.0],
  [0.36, 0.74, 0.95],
];

const ORANGE_COLORS: readonly Rgb[] = [
  [0.992, 0.635, 0.0],
  [1.0, 0.80, 0.28],
  [1.0, 0.94, 0.68],
];

const PURPLE_COLORS: readonly Rgb[] = [
  [0.64, 0.44, 0.96],
  [0.86, 0.64, 1.0],
  [0.42, 0.88, 1.0],
  [1.0, 0.88, 0.52],
];

const FOIL_SPARKLE_COLORS: readonly Rgb[] = [
  [0.72, 0.92, 1.0],
  [0.42, 0.78, 1.0],
  [0.92, 0.98, 1.0],
  [1.0, 1.0, 1.0],
];

const HOLO_SPARKLE_COLORS: readonly Rgb[] = [
  [1.0, 0.38, 0.86],
  [0.28, 0.94, 1.0],
  [0.66, 0.48, 1.0],
  [1.0, 0.90, 0.44],
  [1.0, 1.0, 1.0],
];

const POLY_SPARKLE_COLORS: readonly Rgb[] = [
  [1.0, 0.30, 0.46],
  [1.0, 0.84, 0.24],
  [0.32, 0.98, 0.62],
  [0.26, 0.88, 1.0],
  [0.84, 0.42, 1.0],
  [1.0, 1.0, 1.0],
];

const NEGATIVE_SPARKLE_COLORS: readonly Rgb[] = [
  [0.64, 0.46, 1.0],
  [0.34, 0.92, 1.0],
  [1.0, 0.44, 0.92],
  [0.90, 0.94, 1.0],
];

const TITLE_MOTE_COLORS: readonly Rgb[] = [
  [1.0, 0.42, 0.38],
  [0.24, 0.76, 1.0],
  [1.0, 0.90, 0.54],
  [1.0, 1.0, 1.0],
];

const PACK_MOTE_COLORS: readonly Rgb[] = [
  [0.78, 0.54, 1.0],
  [0.34, 0.90, 1.0],
  [1.0, 0.86, 0.42],
  [1.0, 1.0, 1.0],
];

function pickColor(palette: readonly Rgb[]): Rgb {
  return palette[Math.floor(Math.random() * palette.length)] ?? palette[0]!;
}

function parseHexColor(colorHex?: string): Rgb | null {
  if (!colorHex || typeof colorHex !== 'string') return null;
  const trimmed = colorHex.trim();
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const r = parseInt(hex[0]! + hex[0]!, 16) / 255;
    const g = parseInt(hex[1]! + hex[1]!, 16) / 255;
    const b = parseInt(hex[2]! + hex[2]!, 16) / 255;
    return [r, g, b];
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return [r, g, b];
  }
  return null;
}

function buildStarPalette(colorHex?: string): readonly Rgb[] {
  const base = parseHexColor(colorHex) ?? ([1.0, 0.85, 0.34] as const);
  const bright: Rgb = [
    base[0] + (1 - base[0]) * 0.55,
    base[1] + (1 - base[1]) * 0.55,
    base[2] + (1 - base[2]) * 0.55,
  ];
  const deep: Rgb = [base[0] * 0.82, base[1] * 0.82, base[2] * 0.82];
  return [base, bright, deep, [1.0, 1.0, 1.0]];
}

function getEditionPalette(edition: EditionId | 'gold' | 'glass' | 'voucher' | 'booster'): readonly Rgb[] {
  switch (edition) {
    case 'e_foil':
      return FOIL_SPARKLE_COLORS;
    case 'e_holo':
      return HOLO_SPARKLE_COLORS;
    case 'e_polychrome':
      return POLY_SPARKLE_COLORS;
    case 'e_negative':
      return NEGATIVE_SPARKLE_COLORS;
    case 'gold':
    case 'voucher':
      return MONEY_COLORS;
    case 'glass':
      return GLASS_COLORS;
    case 'booster':
      return PACK_MOTE_COLORS;
    default:
      return FOIL_SPARKLE_COLORS;
  }
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private tableBuffer = new Float32Array(MAX_PARTICLES * PARTICLE_FLOATS_PER_INSTANCE);
  private hudBuffer = new Float32Array(MAX_PARTICLES * PARTICLE_FLOATS_PER_INSTANCE);
  private emberAccum = 0;
  private ambientAccum = 0;
  private cardGlintAccum = 0;
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
    const count = this.reducedMotion ? 4 : Math.min(26, Math.round(12 + intensity * 5));
    for (let i = 0; i < count; i++) {
      const ang = -Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI * 1.5;
      const spd = 85 + Math.random() * 175 * (0.78 + intensity * 0.25);
      const col = pickColor(CHIP_COLORS);
      const isStar = i % 4 === 0;
      const sz = (isStar ? 6.2 : 4.2) + Math.random() * 4.8;
      this.push({
        x: x + (Math.random() - 0.5) * 26,
        y: y + (Math.random() - 0.5) * 18,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 42,
        gravity: isStar ? 160 : 250,
        drag: 2.1,
        size: sz,
        endSize: 1.4,
        rotation: isStar ? 0 : Math.random() * Math.PI,
        vRot: isStar ? (Math.random() - 0.5) * 3.5 : (Math.random() - 0.5) * 8,
        r: col[0],
        g: col[1],
        b: col[2],
        alpha: 1,
        age: 0,
        lifetime: 0.44 + Math.random() * 0.30,
        shape: isStar ? 3 : Math.random() > 0.42 ? 1 : 0,
        layer: 'table',
      });
    }
  }

  emitMultBurst(x: number, y: number, isXMult = false, intensity = 1): void {
    const base = isXMult ? 20 : 12;
    const count = this.reducedMotion ? 5 : Math.min(34, Math.round(base + intensity * 6));
    const palette = isXMult ? XMULT_COLORS : MULT_COLORS;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = (isXMult ? 125 : 86) + Math.random() * (isXMult ? 235 : 155);
      const col = pickColor(palette);
      const isStar = isXMult ? i % 3 === 0 : i % 4 === 0;
      const sz = (isStar ? 7.0 : isXMult ? 5.8 : 4.5) + Math.random() * 5.2;
      this.push({
        x: x + (Math.random() - 0.5) * 28,
        y: y + (Math.random() - 0.5) * 20,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - (isXMult ? 62 : 38),
        gravity: isStar ? 130 : isXMult ? 210 : 245,
        drag: 1.95,
        size: sz,
        endSize: 1.2,
        rotation: isStar ? 0 : Math.random() * Math.PI,
        vRot: isStar ? (Math.random() - 0.5) * 4 : (Math.random() - 0.5) * 10,
        r: col[0],
        g: col[1],
        b: col[2],
        alpha: 1,
        age: 0,
        lifetime: (isXMult ? 0.56 : 0.46) + Math.random() * 0.32,
        shape: isStar ? 3 : 1,
        layer: 'table',
      });
    }
  }

  emitMoneyBurst(x: number, y: number, countScale = 1): void {
    const count = this.reducedMotion ? 4 : Math.min(26, Math.round(13 * countScale));
    for (let i = 0; i < count; i++) {
      const ang = -Math.PI * 0.5 + (Math.random() - 0.5) * 1.7;
      const spd = 72 + Math.random() * 155;
      const col = pickColor(MONEY_COLORS);
      const isStar = i % 3 === 0;
      const sz = (isStar ? 6.5 : 4.6) + Math.random() * 4.4;
      this.push({
        x: x + (Math.random() - 0.5) * 34,
        y: y + (Math.random() - 0.5) * 16,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 45,
        gravity: isStar ? 150 : 225,
        drag: 1.8,
        size: sz,
        endSize: 1.6,
        rotation: isStar ? 0 : Math.random() * Math.PI,
        vRot: isStar ? (Math.random() - 0.5) * 3 : (Math.random() - 0.5) * 7,
        r: col[0],
        g: col[1],
        b: col[2],
        alpha: 1,
        age: 0,
        lifetime: 0.50 + Math.random() * 0.34,
        shape: isStar ? 3 : i % 2 === 0 ? 1 : 0,
        layer: 'table',
      });
    }
  }

  emitGlassShatter(x: number, y: number): void {
    const count = this.reducedMotion ? 8 : 30;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 105 + Math.random() * 255;
      const col = pickColor(GLASS_COLORS);
      const isGlint = i % 5 === 0;
      const sz = (isGlint ? 7.2 : 6.2) + Math.random() * 7.8;
      this.push({
        x: x + (Math.random() - 0.5) * 38,
        y: y + (Math.random() - 0.5) * 46,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 78,
        gravity: isGlint ? 140 : 440,
        drag: 1.1,
        size: sz,
        endSize: sz * 0.4,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 16,
        r: col[0],
        g: col[1],
        b: col[2],
        alpha: 0.96,
        age: 0,
        lifetime: 0.56 + Math.random() * 0.40,
        shape: isGlint ? 3 : 2,
        layer: 'table',
      });
    }
  }

  emitAccentBurst(x: number, y: number, kind: 'orange' | 'purple' | 'celebrate'): void {
    const palette =
      kind === 'orange'
        ? ORANGE_COLORS
        : kind === 'purple'
          ? PURPLE_COLORS
          : [...CHIP_COLORS, ...MULT_COLORS, ...MONEY_COLORS, ...POLY_SPARKLE_COLORS];
    const count = this.reducedMotion ? 5 : kind === 'celebrate' ? 38 : 15;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = (kind === 'celebrate' ? 130 : 82) + Math.random() * (kind === 'celebrate' ? 255 : 155);
      const col = pickColor(palette);
      const isStar = i % 3 === 0;
      const sz = (isStar ? 6.8 : 4.6) + Math.random() * 5.2;
      this.push({
        x: x + (Math.random() - 0.5) * 32,
        y: y + (Math.random() - 0.5) * 22,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - (kind === 'celebrate' ? 105 : 44),
        gravity: isStar ? 135 : kind === 'celebrate' ? 250 : 185,
        drag: 1.85,
        size: sz,
        endSize: 1.4,
        rotation: isStar ? 0 : Math.random() * Math.PI,
        vRot: isStar ? (Math.random() - 0.5) * 4 : (Math.random() - 0.5) * 9,
        r: col[0],
        g: col[1],
        b: col[2],
        alpha: 1,
        age: 0,
        lifetime: (kind === 'celebrate' ? 0.76 : 0.48) + Math.random() * 0.35,
        shape: isStar ? 3 : i % 2 === 0 ? 1 : 0,
        layer: 'table',
      });
    }
  }

  /**
   * Dazzling chromatic 4-point holographic sparkle star burst for Foil,
   * Holographic, Polychrome, Negative, Gold, Glass, Voucher & Booster shine!
   */
  emitHoloSparkle(
    x: number,
    y: number,
    theme: EditionId | 'gold' | 'glass' | 'voucher' | 'booster' = 'e_holo',
    intensity = 1
  ): void {
    const safeIntensity = Math.min(3, Math.max(0.35, Number.isFinite(intensity) ? intensity : 1));
    const palette = getEditionPalette(theme);
    const count = this.reducedMotion ? 5 : Math.min(34, Math.round(12 + safeIntensity * 8));
    const baseAngle = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const ang = baseAngle + (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.34;
      const spd = (68 + Math.random() * 175) * (0.72 + safeIntensity * 0.28);
      const col = i % 3 === 0 ? ([1.0, 1.0, 1.0] as const) : pickColor(palette);
      const sz = 5.4 + Math.random() * (4.4 + safeIntensity * 1.4);
      this.push({
        x: x + (Math.random() - 0.5) * 34,
        y: y + (Math.random() - 0.5) * 42,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 28,
        gravity: 95,
        drag: 2.5,
        size: sz,
        endSize: 1.0,
        rotation: (Math.random() - 0.5) * 0.5,
        vRot: (Math.random() - 0.5) * 3.8,
        r: col[0],
        g: col[1],
        b: col[2],
        alpha: 1,
        age: 0,
        lifetime: 0.46 + Math.random() * 0.32,
        shape: i % 4 === 3 ? 1 : 3,
        layer: 'table',
      });
    }
  }

  /**
   * Dramatic twin fire eruption bursting from Chips & Mult boxes on flame
   * ignition or huge XMult flare-ups! Renders on the 'hud' overlay layer so
   * embers and rising pixel flame wisps blaze visibly up the entire rail!
   */
  emitFlameIgnitionBurst(chipsRect: RectPx, multRect: RectPx, intensity = 3): void {
    const safeInt = Math.min(10, Math.max(1, Number.isFinite(intensity) ? intensity : 3));
    const perBox = this.reducedMotion ? 5 : Math.min(24, Math.round(10 + safeInt * 1.8));
    const emitBox = (rect: RectPx, isChips: boolean) => {
      const palette = isChips ? CHIP_COLORS : MULT_COLORS;
      const baseY = rect.y + rect.h * 0.72;
      for (let i = 0; i < perBox; i++) {
        const col = pickColor(palette);
        const isStar = i % 4 === 0;
        const isWisp = !isStar && i % 2 === 0;
        const sz = (isWisp ? 7.5 : isStar ? 6.0 : 4.6) + Math.random() * (3.5 + safeInt * 0.38);
        this.push({
          x: rect.x + rect.w * (0.08 + Math.random() * 0.84),
          y: baseY - Math.random() * Math.min(28, rect.h * 0.28),
          vx: (Math.random() - 0.5) * (88 + safeInt * 14),
          vy: -(95 + Math.random() * (145 + safeInt * 22)),
          gravity: -48,
          drag: 1.05,
          size: sz,
          endSize: 1.2,
          rotation: isWisp ? (Math.random() - 0.5) * 0.28 : Math.random() * Math.PI,
          vRot: isWisp ? (Math.random() - 0.5) * 1.5 : (Math.random() - 0.5) * 7,
          r: col[0],
          g: col[1],
          b: col[2],
          alpha: 0.98,
          age: 0,
          lifetime: 0.52 + Math.random() * 0.48,
          shape: isWisp ? 4 : isStar ? 3 : 1,
          layer: 'hud',
        });
      }
    };
    emitBox(chipsRect, true);
    emitBox(multRect, false);
  }

  /**
   * Crisp radial starburst of pixel diamonds, squares & 4-point stars for
   * victories, voucher redemptions, level-ups, and huge XMult hits.
   */
  emitStarBurst(x: number, y: number, colorHex?: string, intensity = 1): void {
    const safeIntensity = Math.min(3, Math.max(0.35, Number.isFinite(intensity) ? intensity : 1));
    const palette = buildStarPalette(colorHex);
    const count = this.reducedMotion ? 6 : Math.min(40, Math.round(16 + safeIntensity * 9));
    const angleOffset = Math.random() * Math.PI * 2;

    for (let i = 0; i < count; i++) {
      const isOuterRay = i % 2 === 0;
      const isSparkleStar = i % 3 === 0;
      const spokeAngle = angleOffset + (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.22;
      const baseSpd = isOuterRay ? 142 : 74;
      const spd = (baseSpd + Math.random() * (isOuterRay ? 175 : 95)) * (0.74 + safeIntensity * 0.28);
      const col = isOuterRay && i % 4 === 0 ? palette[3]! : pickColor(palette);
      const sz = (isSparkleStar ? 6.4 : isOuterRay ? 5.4 : 3.8) + Math.random() * (3.4 + safeIntensity * 1.2);
      this.push({
        x: x + Math.cos(spokeAngle) * (isOuterRay ? 6 : 2),
        y: y + Math.sin(spokeAngle) * (isOuterRay ? 6 : 2),
        vx: Math.cos(spokeAngle) * spd,
        vy: Math.sin(spokeAngle) * spd - 34,
        gravity: isSparkleStar ? 105 : isOuterRay ? 140 : 185,
        drag: isOuterRay ? 2.35 : 2.85,
        size: sz,
        endSize: 1.0,
        rotation: isSparkleStar ? 0 : spokeAngle + Math.PI * 0.25,
        vRot: isSparkleStar ? (Math.random() - 0.5) * 4 : (Math.random() - 0.5) * 11,
        r: col[0],
        g: col[1],
        b: col[2],
        alpha: 1,
        age: 0,
        lifetime: (isOuterRay ? 0.58 : 0.46) + Math.random() * 0.30,
        shape: isSparkleStar ? 3 : isOuterRay ? 1 : 0,
        layer: 'table',
      });
    }
  }

  /**
   * Festive multi-layered round-clear / victory celebration burst.
   */
  triggerRoundClearBurst(x: number, y: number): void {
    this.emitStarBurst(x, y, '#ffd859', 1.5);
    this.emitAccentBurst(x, y, 'celebrate');
    if (!this.reducedMotion) {
      this.emitStarBurst(x - 60, y - 16, '#00d4ff', 0.88);
      this.emitStarBurst(x + 60, y - 16, '#fe5f55', 0.88);
      this.emitHoloSparkle(x, y - 24, 'e_polychrome', 1.2);
    }
  }

  private emitFlameEmber(rect: RectPx, isChips: boolean, intensity: number): void {
    const col = isChips ? pickColor(CHIP_COLORS) : pickColor(MULT_COLORS);
    const roll = Math.random();
    const shape: ParticleShape = roll > 0.62 ? 4 : roll > 0.32 ? 3 : 1;
    const sz = (shape === 4 ? 5.6 : shape === 3 ? 4.8 : 3.4) + Math.random() * (3.2 + Math.min(3.8, intensity * 0.38));
    // Spawn near the pill anchor at bottom 30% of the expanded flame rect and shoot HIGH up!
    const spawnY = rect.y + rect.h * (0.64 + Math.random() * 0.26);
    this.push({
      x: rect.x + rect.w * (0.12 + Math.random() * 0.76),
      y: spawnY,
      vx: (Math.random() - 0.5) * (46 + intensity * 6),
      vy: -(68 + Math.random() * (88 + intensity * 20)),
      gravity: -38,
      drag: 0.65,
      size: sz,
      endSize: 1.0,
      rotation: shape === 4 ? (Math.random() - 0.5) * 0.2 : Math.random() * Math.PI,
      vRot: shape === 4 ? (Math.random() - 0.5) * 1.4 : (Math.random() - 0.5) * 6,
      r: col[0],
      g: col[1],
      b: col[2],
      alpha: 0.96,
      age: 0,
      lifetime: 0.62 + Math.random() * 0.54,
      shape,
      layer: 'hud',
    });
  }

  private emitAmbientMote(viewportW: number, viewportH: number, phase: GamePhase): void {
    const isTitle = phase === 'TITLE';
    const col = pickColor(isTitle ? TITLE_MOTE_COLORS : PACK_MOTE_COLORS);
    const isStar = Math.random() > 0.52;
    const sz = (isStar ? 4.4 : 2.8) + Math.random() * 3.4;
    this.push({
      x: Math.random() * viewportW,
      y: viewportH + 8 - Math.random() * viewportH * 0.28,
      vx: (Math.random() - 0.5) * 28,
      vy: -(18 + Math.random() * 32),
      gravity: 0,
      drag: 0.14,
      size: sz,
      endSize: sz * 0.42,
      rotation: isStar ? 0 : Math.random() * Math.PI,
      vRot: isStar ? (Math.random() - 0.5) * 1.6 : (Math.random() - 0.5) * 2.2,
      r: col[0],
      g: col[1],
      b: col[2],
      alpha: isTitle ? 0.72 : 0.80,
      age: 0,
      lifetime: 2.6 + Math.random() * 2.4,
      shape: isStar ? 3 : Math.random() > 0.4 ? 1 : 0,
      layer: 'table',
    });
  }

  /**
   * Emits crisp twinkling holographic / metallic glint stars directly around
   * visible Foil, Holographic, Polychrome, Negative, Gold, Glass, Voucher,
   * Booster, Soul, Black Hole, and Title Showcase cards so the table feels
   * alive and unmistakably shiny!
   */
  private emitCardAmbientSparkles(dt: number, cards: readonly VisualCard[]): void {
    const shinyCards: Array<{
      vc: VisualCard;
      theme: EditionId | 'gold' | 'glass' | 'voucher' | 'booster';
      weight: number;
    }> = [];

    for (const vc of cards) {
      if (vc.faceDown || vc.debuffed || vc.nonScoring) continue;
      if (vc.edition !== 'none') {
        shinyCards.push({
          vc,
          theme: vc.edition,
          weight: vc.edition === 'e_polychrome' || vc.edition === 'e_holo' ? 1.5 : 1.2,
        });
      } else if (vc.soulShader === 'hologram' || vc.soulShader === 'soul_gem') {
        shinyCards.push({ vc, theme: 'e_polychrome', weight: 1.3 });
      } else if (vc.floatingGlow === 'black_hole') {
        shinyCards.push({ vc, theme: 'e_negative', weight: 1.1 });
      } else if (vc.overlayEffect === 'voucher') {
        shinyCards.push({ vc, theme: 'voucher', weight: 1.0 });
      } else if (vc.overlayEffect === 'booster') {
        shinyCards.push({ vc, theme: 'booster', weight: 0.95 });
      } else if (vc.enhancement === 'm_gold' || vc.seal === 'Gold') {
        shinyCards.push({ vc, theme: 'gold', weight: 0.9 });
      } else if (vc.enhancement === 'm_glass') {
        shinyCards.push({ vc, theme: 'glass', weight: 0.85 });
      } else if (vc.kind === 'title_showcase') {
        shinyCards.push({ vc, theme: 'e_holo', weight: 1.15 });
      }
    }

    if (shinyCards.length === 0) return;

    const rate = Math.min(26, 4.5 + shinyCards.length * 2.6);
    this.cardGlintAccum += dt * rate;
    while (this.cardGlintAccum >= 1) {
      this.cardGlintAccum -= 1;
      const pick = shinyCards[Math.floor(Math.random() * shinyCards.length)]!;
      const m = pick.vc.moveable;
      const hw = m.vw * m.vScale * 0.46;
      const hh = m.vh * m.vScale * 0.46;
      const col = pickColor(getEditionPalette(pick.theme));
      const sz = 4.6 + Math.random() * 4.2 * Math.min(1.3, pick.weight);
      this.push({
        x: m.vx + (Math.random() * 2 - 1) * hw,
        y: m.vy + (Math.random() * 2 - 1) * hh,
        vx: (Math.random() - 0.5) * 14,
        vy: -(8 + Math.random() * 18),
        gravity: -4,
        drag: 1.6,
        size: sz,
        endSize: 0.6,
        rotation: (Math.random() - 0.5) * 0.35,
        vRot: (Math.random() - 0.5) * 2.6,
        r: col[0],
        g: col[1],
        b: col[2],
        alpha: 0.95,
        age: 0,
        lifetime: 0.42 + Math.random() * 0.36,
        shape: 3,
        layer: 'table',
      });
    }
  }

  update(
    dt: number,
    viewportW: number,
    viewportH: number,
    phase: GamePhase,
    flameAnchor: ParticleFlameAnchors | null,
    reducedMotion: boolean,
    cards?: readonly VisualCard[]
  ): void {
    this.reducedMotion = reducedMotion;
    const safeDt = Math.min(0.05, Math.max(0.001, dt));

    // Soaring pixel embers & flame wisps from roaring scoreboard flames (HUD overlay layer!)
    if (!reducedMotion && flameAnchor && flameAnchor.intensity > 0.18) {
      const rate = Math.min(62, 12 + flameAnchor.intensity * 5.8);
      this.emberAccum += safeDt * rate;
      while (this.emberAccum >= 1) {
        this.emberAccum -= 1;
        this.emitFlameEmber(flameAnchor.chipsRect, true, flameAnchor.intensity);
        this.emitFlameEmber(flameAnchor.multRect, false, flameAnchor.intensity);
      }
    }

    // Ambient pixel dust / starlight motes on Title & Pack Open screens
    if (!reducedMotion && (phase === 'TITLE' || phase === 'PACK_OPEN')) {
      const rate = phase === 'PACK_OPEN' ? 12 : 9;
      this.ambientAccum += safeDt * rate;
      while (this.ambientAccum >= 1) {
        this.ambientAccum -= 1;
        this.emitAmbientMote(viewportW, viewportH, phase);
      }
    }

    // Ambient holographic & metallic glint stars on shiny cards!
    if (!reducedMotion && cards && cards.length > 0) {
      this.emitCardAmbientSparkles(safeDt, cards);
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
   * When `layer` is omitted, packs all active particles; when `'table'` or `'hud'`, packs only that layer.
   */
  packInstanceData(layer?: ParticleLayer): { data: Float32Array; count: number } {
    const out = layer === 'hud' ? this.hudBuffer : this.tableBuffer;
    let count = 0;
    for (let i = 0; i < this.particles.length && count < MAX_PARTICLES; i++) {
      const p = this.particles[i]!;
      const pLayer: ParticleLayer = p.layer ?? 'table';
      if (layer && pLayer !== layer) continue;
      const t = Math.min(1, p.age / Math.max(0.001, p.lifetime));
      // Sparkle stars twinkle cleanly (pop in fast -> peak -> crisp shrink out)
      const fadeIn = p.shape === 3 ? Math.min(1, t / 0.16) : Math.min(1, t / 0.08);
      const fadeOut = t > 0.62 ? Math.max(0, 1 - (t - 0.62) / 0.38) : 1;
      const curSize =
        p.shape === 3
          ? p.size * Math.sin(Math.min(1, t) * Math.PI) * 1.15 + p.endSize * (1 - t)
          : p.size + (p.endSize - p.size) * t;
      const off = count * PARTICLE_FLOATS_PER_INSTANCE;
      out[off] = p.x;
      out[off + 1] = p.y;
      out[off + 2] = Math.max(0.5, curSize);
      out[off + 3] = p.rotation;
      out[off + 4] = p.r;
      out[off + 5] = p.g;
      out[off + 6] = p.b;
      out[off + 7] = p.alpha * fadeIn * fadeOut;
      out[off + 8] = p.shape;
      count++;
    }
    return { data: out, count };
  }
}
