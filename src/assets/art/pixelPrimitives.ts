// ============================================================================
// Krunked Cards — Clean-Room Procedural Pixel-Art Primitives Engine
// 100% Node-safe at module top-level (DOM canvas created only in toCanvas()).
// Operates on raw RGBA Uint8ClampedArray pixel buffers for crisp 1px art,
// 4x4 Bayer ordered dithering, scanline polygons, 3D spheres, and fast blits.
// ============================================================================

import type { Rank, Suit } from '../../contracts/index.ts';

export type RGBA = readonly [number, number, number, number];

// ---------------------------------------------------------------------------
// Color Parsing, Mixing & Bayer 4x4 Ordered Dithering
// ---------------------------------------------------------------------------

const HEX_CACHE = new Map<string, RGBA>();

export function rgb(r: number, g: number, b: number, a = 255): RGBA {
  return [
    Math.max(0, Math.min(255, Math.round(r))),
    Math.max(0, Math.min(255, Math.round(g))),
    Math.max(0, Math.min(255, Math.round(b))),
    Math.max(0, Math.min(255, Math.round(a))),
  ];
}

export function hex(color: string, alpha = 255): RGBA {
  const key = alpha === 255 ? color : `${color}@${alpha}`;
  const cached = HEX_CACHE.get(key);
  if (cached) return cached;
  const clean = color.charCodeAt(0) === 35 ? color.slice(1) : color;
  let r = 255;
  let g = 255;
  let b = 255;
  let a = alpha;
  if (clean.length === 3) {
    r = parseInt(clean[0]! + clean[0]!, 16);
    g = parseInt(clean[1]! + clean[1]!, 16);
    b = parseInt(clean[2]! + clean[2]!, 16);
  } else if (clean.length === 6) {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  } else if (clean.length === 8) {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
    a = Math.round((parseInt(clean.slice(6, 8), 16) * alpha) / 255);
  }
  const out: RGBA = [r, g, b, a];
  HEX_CACHE.set(key, out);
  return out;
}

export function mixRgba(a: RGBA, b: RGBA, t: number): RGBA {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
    Math.round(a[3] + (b[3] - a[3]) * k),
  ];
}

export function shadeRgba(c: RGBA, factor: number): RGBA {
  if (factor >= 1) {
    const k = Math.min(1, factor - 1);
    return [
      Math.round(c[0] + (255 - c[0]) * k),
      Math.round(c[1] + (255 - c[1]) * k),
      Math.round(c[2] + (255 - c[2]) * k),
      c[3],
    ];
  }
  const k = Math.max(0, factor);
  return [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k), c[3]];
}

export const BAYER_4X4: readonly number[] = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

export function bayerThreshold(x: number, y: number): number {
  const idx = ((y & 3) << 2) | (x & 3);
  return (BAYER_4X4[idx]! + 0.5) / 16;
}

/**
 * Pick from an ordered multi-tone ramp using 4x4 Bayer ordered dithering.
 * t in [0, 1] maps smoothly from ramp[0] to ramp[ramp.length - 1].
 */
export function ditherRamp(x: number, y: number, t: number, ramp: readonly RGBA[]): RGBA {
  const n = ramp.length;
  if (n <= 1) return ramp[0] ?? [0, 0, 0, 255];
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (n - 1);
  const lo = Math.min(n - 2, Math.floor(scaled));
  const frac = scaled - lo;
  return frac > bayerThreshold(x, y) ? ramp[lo + 1]! : ramp[lo]!;
}

// ---------------------------------------------------------------------------
// Deterministic Hash, 2D Value Noise, FBM & Swirling Marble Field
// ---------------------------------------------------------------------------

export function hash2i(x: number, y: number, salt = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise2D(x: number, y: number, salt = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2i(ix, iy, salt);
  const b = hash2i(ix + 1, iy, salt);
  const c = hash2i(ix, iy + 1, salt);
  const d = hash2i(ix + 1, iy + 1, salt);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function fbm2D(x: number, y: number, octaves = 3, salt = 0): number {
  let total = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    total += valueNoise2D(x * freq, y * freq, salt + i * 31) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.02;
  }
  return norm > 0 ? total / norm : 0;
}

export function swirlMarble(nx: number, ny: number, twist = 3.2, freq = 3.8, salt = 0): number {
  const w1 = fbm2D(nx * freq + 1.7, ny * freq + 4.3, 3, salt);
  const w2 = fbm2D(nx * freq + w1 * twist + 8.1, ny * freq - w1 * twist + 2.4, 3, salt + 19);
  const band = Math.sin((nx * 3.1 + ny * 2.2 + w2 * 5.6) * Math.PI);
  return 0.5 + 0.5 * band;
}

// ---------------------------------------------------------------------------
// Micro 3x5 & Crisp 5x7 Pixel Fonts (plus Dedicated Playing Card Rank Glyphs)
// ---------------------------------------------------------------------------

const FONT_3X5: Record<string, readonly string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '011', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['110', '101', '101', '101', '101'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '111', '011'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
  '+': ['000', '010', '111', '010', '000'],
  '-': ['000', '000', '111', '000', '000'],
  '$': ['011', '110', '010', '011', '110'],
  '?': ['110', '001', '010', '000', '010'],
  '!': ['010', '010', '010', '000', '010'],
  '.': ['000', '000', '000', '000', '010'],
  ' ': ['000', '000', '000', '000', '000'],
};

const FONT_5X7: Record<string, readonly string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['01110', '10000', '11110', '10001', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '01010', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '$': ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
  '?': ['01110', '10001', '00010', '00100', '00100', '00000', '00100'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

/**
 * Bold, chunky, authentic playing-card corner rank glyphs (9px tall, 6-9px wide).
 */
const CARD_RANK_GLYPHS: Record<Rank, readonly string[]> = {
  '2': [
    '.1111.',
    '11..11',
    '....11',
    '...11.',
    '..11..',
    '.11...',
    '11....',
    '111111',
    '111111',
  ],
  '3': [
    '.1111.',
    '11..11',
    '....11',
    '..111.',
    '....11',
    '....11',
    '11..11',
    '.1111.',
    '......',
  ],
  '4': [
    '...11.',
    '..111.',
    '.1111.',
    '11.11.',
    '111111',
    '111111',
    '...11.',
    '...11.',
    '...11.',
  ],
  '5': [
    '111111',
    '11....',
    '11111.',
    '....11',
    '....11',
    '....11',
    '11..11',
    '.1111.',
    '......',
  ],
  '6': [
    '.1111.',
    '11..11',
    '11....',
    '11111.',
    '11..11',
    '11..11',
    '11..11',
    '.1111.',
    '......',
  ],
  '7': [
    '111111',
    '11..11',
    '....11',
    '...11.',
    '..11..',
    '..11..',
    '..11..',
    '..11..',
    '......',
  ],
  '8': [
    '.1111.',
    '11..11',
    '11..11',
    '.1111.',
    '11..11',
    '11..11',
    '11..11',
    '.1111.',
    '......',
  ],
  '9': [
    '.1111.',
    '11..11',
    '11..11',
    '.11111',
    '....11',
    '....11',
    '11..11',
    '.1111.',
    '......',
  ],
  '10': [
    '.11..111.',
    '111.11.11',
    '.11.11.11',
    '.11.11.11',
    '.11.11.11',
    '.11.11.11',
    '.11.11.11',
    '1111.111.',
    '.........',
  ],
  Jack: [
    '..1111',
    '....11',
    '....11',
    '....11',
    '....11',
    '11..11',
    '11..11',
    '.1111.',
    '......',
  ],
  Queen: [
    '.1111.',
    '11..11',
    '11..11',
    '11..11',
    '11..11',
    '111.11',
    '11.111',
    '.1111.',
    '....11',
  ],
  King: [
    '11..11',
    '11..11',
    '11.11.',
    '1111..',
    '11.11.',
    '11..11',
    '11..11',
    '11..11',
    '......',
  ],
  Ace: [
    '..11..',
    '.1111.',
    '11..11',
    '11..11',
    '111111',
    '11..11',
    '11..11',
    '11..11',
    '......',
  ],
};

// ---------------------------------------------------------------------------
// Sculpted Multi-Size Suit Pip Bitmaps (sm 7x7, md 11x11, lg 15x15, xl 25x27)
// ---------------------------------------------------------------------------

const SUIT_SM: Record<Suit, readonly string[]> = {
  Hearts: [
    '.11.11.',
    '1111111',
    '1111111',
    '.11111.',
    '..111..',
    '...1...',
  ],
  Diamonds: [
    '...1...',
    '..111..',
    '.11111.',
    '1111111',
    '.11111.',
    '..111..',
    '...1...',
  ],
  Spades: [
    '...1...',
    '..111..',
    '.11111.',
    '1111111',
    '1111111',
    '..1.1..',
    '..111..',
  ],
  Clubs: [
    '..111..',
    '..111..',
    '11.1.11',
    '1111111',
    '11.1.11',
    '...1...',
    '..111..',
  ],
};

const SUIT_MD: Record<Suit, readonly string[]> = {
  Hearts: [
    '.111...111.',
    '11111.11111',
    '11111111111',
    '11111111111',
    '11111111111',
    '.111111111.',
    '..1111111..',
    '...11111...',
    '....111....',
    '.....1.....',
  ],
  Diamonds: [
    '.....1.....',
    '....111....',
    '...11111...',
    '..1111111..',
    '.111111111.',
    '11111111111',
    '.111111111.',
    '..1111111..',
    '...11111...',
    '....111....',
    '.....1.....',
  ],
  Spades: [
    '.....1.....',
    '....111....',
    '...11111...',
    '..1111111..',
    '.111111111.',
    '11111111111',
    '11111111111',
    '1111.1.1111',
    '.11..1..11.',
    '....111....',
    '...11111...',
  ],
  Clubs: [
    '....111....',
    '...11111...',
    '...11111...',
    '....111....',
    '.11..1..11.',
    '11111111111',
    '11111111111',
    '1111.1.1111',
    '.11..1..11.',
    '....111....',
    '...11111...',
  ],
};

const SUIT_LG: Record<Suit, readonly string[]> = {
  Hearts: [
    '..1111...1111..',
    '.111111.111111.',
    '111111111111111',
    '111111111111111',
    '111111111111111',
    '111111111111111',
    '.1111111111111.',
    '..11111111111..',
    '...111111111...',
    '....1111111....',
    '.....11111.....',
    '......111......',
    '.......1.......',
  ],
  Diamonds: [
    '.......1.......',
    '......111......',
    '.....11111.....',
    '....1111111....',
    '...111111111...',
    '..11111111111..',
    '.1111111111111.',
    '111111111111111',
    '.1111111111111.',
    '..11111111111..',
    '...111111111...',
    '....1111111....',
    '.....11111.....',
    '......111......',
    '.......1.......',
  ],
  Spades: [
    '.......1.......',
    '......111......',
    '.....11111.....',
    '....1111111....',
    '...111111111...',
    '..11111111111..',
    '.1111111111111.',
    '111111111111111',
    '111111111111111',
    '111111111111111',
    '.11111.1.11111.',
    '..111..1..111..',
    '......111......',
    '.....11111.....',
    '....1111111....',
  ],
  Clubs: [
    '.....11111.....',
    '....1111111....',
    '....1111111....',
    '....1111111....',
    '.....11111.....',
    '.111...1...111.',
    '11111.111.11111',
    '111111111111111',
    '111111111111111',
    '111111111111111',
    '.11111.1.11111.',
    '..111..1..111..',
    '......111......',
    '.....11111.....',
    '....1111111....',
  ],
};

// ---------------------------------------------------------------------------
// PixelSurface — Fast RGBA Buffer Drawing Class
// ---------------------------------------------------------------------------

export class PixelSurface {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  clear(): void {
    this.data.fill(0);
  }

  rawPx(x: number, y: number, r: number, g: number, b: number, a: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return;
    const o = (iy * this.width + ix) * 4;
    this.data[o] = r;
    this.data[o + 1] = g;
    this.data[o + 2] = b;
    this.data[o + 3] = a;
  }

  px(x: number, y: number, c: RGBA): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return;
    const a = c[3];
    if (a <= 0) return;
    const o = (iy * this.width + ix) * 4;
    if (a >= 255 || this.data[o + 3]! === 0) {
      this.data[o] = c[0];
      this.data[o + 1] = c[1];
      this.data[o + 2] = c[2];
      this.data[o + 3] = a;
      return;
    }
    const sa = a / 255;
    const da = this.data[o + 3]! / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 0) return;
    this.data[o] = Math.round((c[0] * sa + this.data[o]! * da * (1 - sa)) / outA);
    this.data[o + 1] = Math.round((c[1] * sa + this.data[o + 1]! * da * (1 - sa)) / outA);
    this.data[o + 2] = Math.round((c[2] * sa + this.data[o + 2]! * da * (1 - sa)) / outA);
    this.data[o + 3] = Math.round(outA * 255);
  }

  getA(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.data[(y * this.width + x) * 4 + 3]!;
  }

  getPx(x: number, y: number): RGBA {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return [0, 0, 0, 0];
    const o = (y * this.width + x) * 4;
    return [this.data[o]!, this.data[o + 1]!, this.data[o + 2]!, this.data[o + 3]!];
  }

  rect(x: number, y: number, w: number, h: number, c: RGBA): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.width, Math.round(x + w));
    const y1 = Math.min(this.height, Math.round(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        this.px(px, py, c);
      }
    }
  }

  eraseRect(x: number, y: number, w: number, h: number): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.width, Math.round(x + w));
    const y1 = Math.min(this.height, Math.round(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const o = (py * this.width + px) * 4;
        this.data[o] = 0;
        this.data[o + 1] = 0;
        this.data[o + 2] = 0;
        this.data[o + 3] = 0;
      }
    }
  }

  rectOutline(x: number, y: number, w: number, h: number, c: RGBA, t = 1): void {
    this.rect(x, y, w, t, c);
    this.rect(x, y + h - t, w, t, c);
    this.rect(x, y, t, h, c);
    this.rect(x + w - t, y, t, h, c);
  }

  /**
   * Crisp pixel-art rounded rectangle with exact integer corner cutoffs.
   */
  roundedRect(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill: RGBA,
    border?: RGBA
  ): void {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const rw = Math.round(w);
    const rh = Math.round(h);
    const rad = Math.max(0, Math.min(r, Math.floor(Math.min(rw, rh) / 2)));

    const inside = (lx: number, ly: number): boolean => {
      if (lx < 0 || ly < 0 || lx >= rw || ly >= rh) return false;
      let dx = 0;
      let dy = 0;
      if (lx < rad) dx = rad - lx;
      else if (lx >= rw - rad) dx = lx - (rw - rad - 1);
      if (ly < rad) dy = rad - ly;
      else if (ly >= rh - rad) dy = ly - (rh - rad - 1);
      if (dx === 0 || dy === 0) return true;
      return dx * dx + dy * dy <= rad * rad + rad * 0.5;
    };

    for (let ly = 0; ly < rh; ly++) {
      for (let lx = 0; lx < rw; lx++) {
        if (!inside(lx, ly)) continue;
        if (border) {
          const isEdge =
            !inside(lx - 1, ly) ||
            !inside(lx + 1, ly) ||
            !inside(lx, ly - 1) ||
            !inside(lx, ly + 1);
          this.px(x0 + lx, y0 + ly, isEdge ? border : fill);
        } else {
          this.px(x0 + lx, y0 + ly, fill);
        }
      }
    }
  }

  circle(cx: number, cy: number, r: number, fill: RGBA, outline?: RGBA): void {
    const r2 = (r + 0.15) * (r + 0.15);
    const ro2 = (r + 1.15) * (r + 1.15);
    const span = Math.ceil(r + 2);
    for (let dy = -span; dy <= span; dy++) {
      for (let dx = -span; dx <= span; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2) {
          this.px(cx + dx, cy + dy, fill);
        } else if (outline && d2 <= ro2) {
          this.px(cx + dx, cy + dy, outline);
        }
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, fill: RGBA, outline?: RGBA): void {
    const sx = Math.ceil(rx + 2);
    const sy = Math.ceil(ry + 2);
    const rx2 = (rx + 0.2) * (rx + 0.2);
    const ry2 = (ry + 0.2) * (ry + 0.2);
    const rox2 = (rx + 1.2) * (rx + 1.2);
    const roy2 = (ry + 1.2) * (ry + 1.2);
    for (let dy = -sy; dy <= sy; dy++) {
      for (let dx = -sx; dx <= sx; dx++) {
        const v = (dx * dx) / rx2 + (dy * dy) / ry2;
        if (v <= 1) {
          this.px(cx + dx, cy + dy, fill);
        } else if (outline && (dx * dx) / rox2 + (dy * dy) / roy2 <= 1) {
          this.px(cx + dx, cy + dy, outline);
        }
      }
    }
  }

  ring(cx: number, cy: number, rOuter: number, rInner: number, col: RGBA): void {
    const ro2 = (rOuter + 0.2) * (rOuter + 0.2);
    const ri2 = Math.max(0, rInner - 0.1) * Math.max(0, rInner - 0.1);
    const span = Math.ceil(rOuter + 1);
    for (let dy = -span; dy <= span; dy++) {
      for (let dx = -span; dx <= span; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 <= ro2 && d2 >= ri2) {
          this.px(cx + dx, cy + dy, col);
        }
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, col: RGBA, thickness = 1): void {
    let ix0 = Math.round(x0);
    let iy0 = Math.round(y0);
    const ix1 = Math.round(x1);
    const iy1 = Math.round(y1);
    const dx = Math.abs(ix1 - ix0);
    const dy = Math.abs(iy1 - iy0);
    const sx = ix0 < ix1 ? 1 : -1;
    const sy = iy0 < iy1 ? 1 : -1;
    let err = dx - dy;
    const half = Math.floor(thickness / 2);
    for (let guard = 0; guard < 512; guard++) {
      if (thickness <= 1) {
        this.px(ix0, iy0, col);
      } else {
        this.rect(ix0 - half, iy0 - half, thickness, thickness, col);
      }
      if (ix0 === ix1 && iy0 === iy1) break;
      const e2 = err * 2;
      if (e2 > -dy) {
        err -= dy;
        ix0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        iy0 += sy;
      }
    }
  }

  /**
   * Scanline-filled crisp integer polygon with optional pixel outline.
   */
  poly(points: ReadonlyArray<readonly [number, number]>, fill: RGBA, outline?: RGBA): void {
    if (points.length < 3) return;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, py] of points) {
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    const yStart = Math.max(0, Math.floor(minY));
    const yEnd = Math.min(this.height - 1, Math.ceil(maxY));

    for (let y = yStart; y <= yEnd; y++) {
      const scanY = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i]!;
        const [x2, y2] = points[(i + 1) % points.length]!;
        if ((y1 <= scanY && y2 > scanY) || (y2 <= scanY && y1 > scanY)) {
          const t = (scanY - y1) / (y2 - y1);
          xs.push(x1 + t * (x2 - x1));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const xStart = Math.max(0, Math.ceil(xs[i]! - 0.5));
        const xEnd = Math.min(this.width - 1, Math.floor(xs[i + 1]! + 0.5));
        for (let x = xStart; x <= xEnd; x++) {
          this.px(x, y, fill);
        }
      }
    }

    if (outline) {
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i]!;
        const [x2, y2] = points[(i + 1) % points.length]!;
        this.line(x1, y1, x2, y2, outline, 1);
      }
    }
  }

  /**
   * Fill a region with a Bayer 4x4 ordered-dithered gradient ramp.
   */
  ditherGradRect(
    x: number,
    y: number,
    w: number,
    h: number,
    ramp: readonly RGBA[],
    dir: 'v' | 'h' | 'diag' | 'radial' = 'v'
  ): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.width, Math.round(x + w));
    const y1 = Math.min(this.height, Math.round(y + h));
    const cx = x + w * 0.5;
    const cy = y + h * 0.5;
    const maxR = Math.hypot(w * 0.5, h * 0.5) || 1;

    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        let t = 0;
        if (dir === 'v') t = (py - y) / Math.max(1, h - 1);
        else if (dir === 'h') t = (px - x) / Math.max(1, w - 1);
        else if (dir === 'diag') t = ((px - x) / Math.max(1, w) + (py - y) / Math.max(1, h)) * 0.5;
        else t = Math.hypot(px - cx, py - cy) / maxR;
        this.px(px, py, ditherRamp(px, py, t, ramp));
      }
    }
  }

  /**
   * Render a 3D Bayer-dithered pixel sphere with top-left illumination,
   * optional surface shader callback, and crisp 1px pixel outline.
   */
  shadedSphere(
    cx: number,
    cy: number,
    r: number,
    ramp: readonly RGBA[],
    opts?: {
      outline?: RGBA;
      lightDir?: readonly [number, number, number];
      surfaceMod?: (nx: number, ny: number, nz: number, baseLight: number, px: number, py: number) => RGBA | null;
      specular?: RGBA;
    }
  ): void {
    const lx = opts?.lightDir?.[0] ?? -0.45;
    const ly = opts?.lightDir?.[1] ?? -0.48;
    const lz = opts?.lightDir?.[2] ?? 0.75;
    const lLen = Math.hypot(lx, ly, lz) || 1;
    const nLx = lx / lLen;
    const nLy = ly / lLen;
    const nLz = lz / lLen;

    const r2 = (r + 0.15) * (r + 0.15);
    const ro2 = (r + 1.2) * (r + 1.2);
    const span = Math.ceil(r + 2);

    for (let dy = -span; dy <= span; dy++) {
      for (let dx = -span; dx <= span; dx++) {
        const d2 = dx * dx + dy * dy;
        const px = Math.round(cx + dx);
        const py = Math.round(cy + dy);
        if (d2 <= r2) {
          const nx = dx / r;
          const ny = dy / r;
          const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          const dot = Math.max(0, nx * nLx + ny * nLy + nz * nLz);
          const light = Math.min(1, 0.12 + dot * 0.92);
          if (opts?.surfaceMod) {
            const custom = opts.surfaceMod(nx, ny, nz, light, px, py);
            if (custom) {
              this.px(px, py, custom);
              continue;
            }
          }
          if (opts?.specular && dot > 0.93) {
            this.px(px, py, opts.specular);
          } else {
            this.px(px, py, ditherRamp(px, py, light, ramp));
          }
        } else if (opts?.outline && d2 <= ro2) {
          this.px(px, py, opts.outline);
        }
      }
    }
  }

  /**
   * Draw an ASCII bitmap sprite centered at (cx, cy) with optional auto-outline & flips.
   */
  sprite(
    grid: readonly string[],
    palette: Record<string, RGBA>,
    cx: number,
    cy: number,
    scale = 1,
    opts?: { outline?: RGBA; flipX?: boolean; flipY?: boolean; rot180?: boolean }
  ): void {
    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;
    const x0 = Math.round(cx - (cols * scale) / 2);
    const y0 = Math.round(cy - (rows * scale) / 2);
    const fx = Boolean(opts?.flipX) !== Boolean(opts?.rot180);
    const fy = Boolean(opts?.flipY) !== Boolean(opts?.rot180);

    const drawAt = (r: number, c: number, col: RGBA, dx = 0, dy = 0) => {
      const rr = fy ? rows - 1 - r : r;
      const cc = fx ? cols - 1 - c : c;
      this.rect(x0 + cc * scale + dx, y0 + rr * scale + dy, scale, scale, col);
    };

    if (opts?.outline) {
      for (let r = 0; r < rows; r++) {
        const line = grid[r]!;
        for (let c = 0; c < cols; c++) {
          const ch = line[c]!;
          if (ch === '.' || ch === ' ') continue;
          drawAt(r, c, opts.outline, -scale, 0);
          drawAt(r, c, opts.outline, scale, 0);
          drawAt(r, c, opts.outline, 0, -scale);
          drawAt(r, c, opts.outline, 0, scale);
        }
      }
    }

    for (let r = 0; r < rows; r++) {
      const line = grid[r]!;
      for (let c = 0; c < cols; c++) {
        const ch = line[c]!;
        if (ch === '.' || ch === ' ') continue;
        const col = palette[ch];
        if (!col) continue;
        drawAt(r, c, col);
      }
    }
  }

  /**
   * Add a crisp 1px 4-connected outline around opaque pixels within a bounding box.
   */
  addOutline(outlineCol: RGBA, x0 = 0, y0 = 0, w = this.width, h = this.height): void {
    const sx = Math.max(0, x0);
    const sy = Math.max(0, y0);
    const ex = Math.min(this.width, x0 + w);
    const ey = Math.min(this.height, y0 + h);
    const toPlot: Array<[number, number]> = [];

    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        if (this.getA(x, y) > 20) continue;
        if (
          (x > sx && this.getA(x - 1, y) > 20) ||
          (x + 1 < ex && this.getA(x + 1, y) > 20) ||
          (y > sy && this.getA(x, y - 1) > 20) ||
          (y + 1 < ey && this.getA(x, y + 1) > 20)
        ) {
          toPlot.push([x, y]);
        }
      }
    }
    for (const [x, y] of toPlot) {
      this.px(x, y, outlineCol);
    }
  }

  /**
   * Blit another PixelSurface onto this surface at (dx, dy).
   */
  blit(
    src: PixelSurface,
    dx: number,
    dy: number,
    opts?: { flipX?: boolean; flipY?: boolean; rot180?: boolean }
  ): void {
    const fx = Boolean(opts?.flipX) !== Boolean(opts?.rot180);
    const fy = Boolean(opts?.flipY) !== Boolean(opts?.rot180);
    const sw = src.width;
    const sh = src.height;
    for (let y = 0; y < sh; y++) {
      const sy = fy ? sh - 1 - y : y;
      for (let x = 0; x < sw; x++) {
        const sx = fx ? sw - 1 - x : x;
        const o = (sy * sw + sx) * 4;
        const a = src.data[o + 3]!;
        if (a === 0) continue;
        this.px(dx + x, dy + y, [src.data[o]!, src.data[o + 1]!, src.data[o + 2]!, a]);
      }
    }
  }

  sparkle(cx: number, cy: number, col: RGBA, arm = 3, coreCol?: RGBA): void {
    this.rect(cx - arm, cy, arm * 2 + 1, 1, col);
    this.rect(cx, cy - arm, 1, arm * 2 + 1, col);
    if (coreCol) this.px(cx, cy, coreCol);
  }

  /**
   * Crisp micro 3x5 pixel text (fits cleanly inside 71px card nameplates!).
   */
  text3x5(
    text: string,
    x: number,
    y: number,
    col: RGBA,
    opts?: { align?: 'left' | 'center' | 'right'; outline?: RGBA; shadow?: RGBA; spacing?: number; scale?: number }
  ): void {
    const upper = text.toUpperCase();
    const sc = opts?.scale ?? 1;
    const sp = opts?.spacing ?? 1;
    const totalW = upper.length > 0 ? (upper.length * (3 + sp) - sp) * sc : 0;
    let sx = Math.round(x);
    if (opts?.align === 'center') sx = Math.round(x - totalW / 2);
    else if (opts?.align === 'right') sx = Math.round(x - totalW);
    const sy = Math.round(y);

    const pass = (ox: number, oy: number, c: RGBA) => {
      let cx = sx + ox;
      for (let i = 0; i < upper.length; i++) {
        const g = FONT_3X5[upper[i]!] ?? FONT_3X5[' ']!;
        for (let r = 0; r < 5; r++) {
          const line = g[r]!;
          for (let k = 0; k < 3; k++) {
            if (line[k] === '1') this.rect(cx + k * sc, sy + oy + r * sc, sc, sc, c);
          }
        }
        cx += (3 + sp) * sc;
      }
    };

    if (opts?.shadow) pass(sc, sc, opts.shadow);
    if (opts?.outline) {
      pass(-sc, 0, opts.outline);
      pass(sc, 0, opts.outline);
      pass(0, -sc, opts.outline);
      pass(0, sc, opts.outline);
    }
    pass(0, 0, col);
  }

  /**
   * Crisp 5x7 pixel text.
   */
  text5x7(
    text: string,
    x: number,
    y: number,
    col: RGBA,
    scale = 1,
    opts?: { align?: 'left' | 'center' | 'right'; outline?: RGBA; shadow?: RGBA; spacing?: number }
  ): void {
    const upper = text.toUpperCase();
    const sp = opts?.spacing ?? 1;
    const totalW = upper.length > 0 ? (upper.length * (5 + sp) - sp) * scale : 0;
    let sx = Math.round(x);
    if (opts?.align === 'center') sx = Math.round(x - totalW / 2);
    else if (opts?.align === 'right') sx = Math.round(x - totalW);
    const sy = Math.round(y);

    const pass = (ox: number, oy: number, c: RGBA) => {
      let cx = sx + ox;
      for (let i = 0; i < upper.length; i++) {
        const g = FONT_5X7[upper[i]!] ?? FONT_5X7[' ']!;
        for (let r = 0; r < 7; r++) {
          const line = g[r]!;
          for (let k = 0; k < 5; k++) {
            if (line[k] === '1') this.rect(cx + k * scale, sy + oy + r * scale, scale, scale, c);
          }
        }
        cx += (5 + sp) * scale;
      }
    };

    if (opts?.shadow) pass(scale, scale, opts.shadow);
    if (opts?.outline) {
      pass(-scale, 0, opts.outline);
      pass(scale, 0, opts.outline);
      pass(0, -scale, opts.outline);
      pass(0, scale, opts.outline);
    }
    pass(0, 0, col);
  }

  /**
   * Draw bold crisp playing-card rank index (supports 180-degree rotation for bottom-right corner).
   */
  cardRank(rank: Rank, cx: number, cy: number, col: RGBA, rot180 = false): void {
    const grid = CARD_RANK_GLYPHS[rank];
    this.sprite(grid, { '1': col }, cx, cy, 1, { rot180 });
  }

  /**
   * Draw sculpted playing-card suit pip at sm (7x7), md (11x11), lg (15x15), or xl (25x27 Ace).
   */
  suitPip(
    suit: Suit,
    cx: number,
    cy: number,
    size: 'sm' | 'md' | 'lg' | 'xl',
    col: RGBA,
    opts?: { inv?: boolean; outline?: RGBA; highlight?: RGBA }
  ): void {
    if (size === 'xl') {
      // Sculpted smooth 25x27 Ace centerpiece emblem!
      const tmp = new PixelSurface(31, 33);
      const tx = 15;
      const ty = 16;
      if (suit === 'Hearts') {
        tmp.circle(tx - 5, ty - 4, 6.2, col);
        tmp.circle(tx + 5, ty - 4, 6.2, col);
        tmp.poly(
          [
            [tx - 11, ty - 2],
            [tx + 11, ty - 2],
            [tx, ty + 11],
          ],
          col
        );
        tmp.rect(tx - 4, ty - 7, 9, 6, col);
      } else if (suit === 'Diamonds') {
        tmp.poly(
          [
            [tx, ty - 12],
            [tx + 11, ty],
            [tx, ty + 12],
            [tx - 11, ty],
          ],
          col
        );
      } else if (suit === 'Spades') {
        tmp.poly(
          [
            [tx, ty - 12],
            [tx + 11, ty + 1],
            [tx - 11, ty + 1],
          ],
          col
        );
        tmp.circle(tx - 5, ty + 2, 5.8, col);
        tmp.circle(tx + 5, ty + 2, 5.8, col);
        tmp.rect(tx - 2, ty + 4, 5, 6, col);
        tmp.poly(
          [
            [tx, ty + 5],
            [tx + 6, ty + 12],
            [tx - 6, ty + 12],
          ],
          col
        );
      } else {
        // Clubs
        tmp.circle(tx, ty - 6, 5.8, col);
        tmp.circle(tx - 6, ty + 2, 5.8, col);
        tmp.circle(tx + 6, ty + 2, 5.8, col);
        tmp.rect(tx - 2, ty - 1, 5, 10, col);
        tmp.poly(
          [
            [tx, ty + 5],
            [tx + 6, ty + 12],
            [tx - 6, ty + 12],
          ],
          col
        );
      }
      if (opts?.outline) tmp.addOutline(opts.outline);
      this.blit(tmp, Math.round(cx - tx), Math.round(cy - ty), { flipY: opts?.inv });
      return;
    }

    const table = size === 'sm' ? SUIT_SM : size === 'md' ? SUIT_MD : SUIT_LG;
    const grid = table[suit];
    this.sprite(grid, { '1': col }, cx, cy, 1, { flipY: opts?.inv, outline: opts?.outline });
    if (opts?.highlight && size !== 'sm') {
      const rows = grid.length;
      const cols = grid[0]!.length;
      const x0 = Math.round(cx - cols / 2);
      const y0 = Math.round(cy - rows / 2);
      const hr = opts.inv ? rows - 3 : 2;
      if (grid[hr]?.[2] === '1') this.px(x0 + 2, y0 + hr, opts.highlight);
      if (grid[hr]?.[3] === '1') this.px(x0 + 3, y0 + hr, opts.highlight);
    }
  }

  /**
   * Convert this pixel buffer to a crisp HTMLCanvasElement (browser-only call site).
   */
  toCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const img = ctx.createImageData(this.width, this.height);
    img.data.set(this.data);
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
}

// ---------------------------------------------------------------------------
// Shared Card Frame & Ornament Primitives (71x95 standard cell size)
// ---------------------------------------------------------------------------

export const CARD_W = 71;
export const CARD_H = 95;

export const COL_INK = hex('#232b30');
export const COL_WHITE = hex('#ffffff');
export const COL_BORDER_SOFT = hex('#c5cfd9');
export const COL_SHADOW_SOFT = hex('#adb8c4');

/**
 * Crisp white playing-card front matching the bright clean silhouette of Enhancers (1,0).
 */
export function drawCleanWhiteCard(s: PixelSurface, ox: number, oy: number): void {
  const cell = new PixelSurface(CARD_W, CARD_H);
  cell.roundedRect(1, 1, 69, 93, 4, COL_WHITE, COL_BORDER_SOFT);
  // Subtle crisp 1px bottom bevel shadow inside the border
  cell.rect(4, 92, 63, 1, COL_SHADOW_SOFT);
  s.blit(cell, ox, oy);
}

/**
 * Draw an intricate 4-way symmetrical woven filigree playing-card back (like classic Bicycle backs).
 * Supports solid colors, vertical gradients (e.g. rose-to-blue), or distressed edges (Abandoned).
 */
export function drawOrnateFiligreeBack(
  s: PixelSurface,
  ox: number,
  oy: number,
  baseTop: RGBA,
  baseBot: RGBA,
  inkWhite: RGBA = COL_WHITE,
  opts?: { distressed?: boolean; borderTint?: RGBA }
): void {
  const cell = new PixelSurface(CARD_W, CARD_H);
  // Crisp outer white playing-card frame with delicate rounded edge
  cell.roundedRect(1, 1, 69, 93, 4, opts?.borderTint ?? COL_WHITE, hex('#b7c2cc'));

  // Colored inner field (63x87, rounded r=3)
  const fx = 4;
  const fy = 4;
  const fw = 63;
  const fh = 87;
  for (let y = 0; y < fh; y++) {
    const t = y / (fh - 1);
    const rowCol = mixRgba(baseTop, baseBot, t);
    const inset = y === 0 || y === fh - 1 ? 2 : y === 1 || y === fh - 2 ? 1 : 0;
    for (let x = inset; x < fw - inset; x++) {
      cell.px(fx + x, fy + y, rowCol);
    }
  }

  // Paint a single top-left quadrant (31x43) of intricate ornamental filigree,
  // then mirror 4-way (X, Y, XY) for razor-sharp symmetrical playing-card craft!
  const q = new PixelSurface(31, 43);
  const w = inkWhite;

  // Outer dotted frame + double ruled border
  for (let x = 2; x < 31; x += 2) q.px(x, 2, w);
  for (let y = 2; y < 43; y += 2) q.px(2, y, w);
  q.rect(4, 4, 27, 1, w);
  q.rect(4, 4, 1, 39, w);
  q.rect(6, 6, 25, 1, w);
  q.rect(6, 6, 1, 37, w);

  // Corner rosette / acanthus scroll
  q.rect(8, 8, 5, 5, w);
  q.eraseRect(9, 9, 3, 3);
  q.px(10, 10, w);
  q.line(13, 8, 18, 13, w);
  q.line(8, 13, 13, 18, w);
  q.line(15, 7, 22, 14, w);
  q.line(7, 15, 14, 22, w);

  // Sweeping symmetrical lattice curves towards center
  for (let i = 0; i < 20; i++) {
    const t = i / 19;
    const ax = Math.round(9 + t * 20);
    const ay = Math.round(25 - Math.sin(t * Math.PI * 0.85) * 14);
    q.px(ax, ay, w);
    q.px(ax, ay + 2, w);
    const bx = Math.round(8 + Math.sin(t * Math.PI * 0.9) * 12);
    const by = Math.round(18 + t * 23);
    q.px(bx, by, w);
    if (i % 2 === 0) q.px(bx + 2, by, w);
  }

  // Ornate central diamond-oval medallion (top-left quarter at bottom-right of q)
  for (let dy = 0; dy <= 16; dy++) {
    for (let dx = 0; dx <= 14; dx++) {
      const d = (dx * dx) / 196 + (dy * dy) / 256;
      if ((d >= 0.78 && d <= 1.0) || (d >= 0.36 && d <= 0.48)) {
        q.px(30 - dx, 42 - dy, w);
      }
      if (dx + dy === 11 || dx + dy === 6) {
        q.px(30 - dx, 42 - dy, w);
      }
    }
  }
  // Tiny diamond pips in spandrels
  for (const [dx, dy] of [
    [22, 9],
    [27, 12],
    [13, 27],
    [10, 35],
    [18, 22],
    [25, 29],
  ] as const) {
    q.px(dx, dy - 1, w);
    q.px(dx - 1, dy, w);
    q.px(dx + 1, dy, w);
    q.px(dx, dy + 1, w);
  }
  // Central emblem heart/crest core
  q.rect(26, 37, 5, 6, w);
  q.eraseRect(27, 38, 3, 4);
  q.px(28, 39, w);
  q.px(29, 41, w);

  // Blit all 4 symmetrical quadrants
  cell.blit(q, fx + 1, fy + 1);
  cell.blit(q, fx + fw - 1 - q.width, fy + 1, { flipX: true });
  cell.blit(q, fx + 1, fy + fh - 1 - q.height, { flipY: true });
  cell.blit(q, fx + fw - 1 - q.width, fy + fh - 1 - q.height, { rot180: true });

  // Center spine stitch accents
  const midX = 35;
  const midY = 47;
  cell.px(midX, 8, w);
  cell.px(midX, 86, w);
  cell.px(midX, 14, w);
  cell.px(midX, 80, w);
  cell.rect(midX - 1, midY - 1, 3, 3, w);

  if (opts?.distressed) {
    // Weathered frayed paper nicks & warm age flecks along edges (Abandoned Deck)
    const tearCol = hex('#f5ebd9');
    for (let i = 0; i < 26; i++) {
      const side = i % 4;
      const p = hash2i(i, 7, 404);
      if (side === 0) cell.rect(5 + Math.floor(p * 60), 1, 2, 2 + (i % 2), tearCol);
      else if (side === 1) cell.rect(5 + Math.floor(p * 60), 91, 2, 2 + (i % 2), tearCol);
      else if (side === 2) cell.rect(1, 5 + Math.floor(p * 84), 2 + (i % 2), 2, tearCol);
      else cell.rect(67, 5 + Math.floor(p * 84), 2 + (i % 2), 2, tearCol);
    }
    // Subtle dark crease line across card
    cell.line(8, 31, 61, 44, hex('#6b4b38', 75), 1);
    cell.line(11, 67, 58, 56, hex('#6b4b38', 65), 1);
  }

  s.blit(cell, ox, oy);
}

/**
 * Draw a 3D embossed glossy wax seal (Gold / Purple / Red / Blue) at (cx, cy) inside a 71x95 cell.
 */
export function drawEmbossedWaxSeal(
  s: PixelSurface,
  ox: number,
  oy: number,
  hi: RGBA,
  mid: RGBA,
  dark: RGBA,
  deep: RGBA
): void {
  const cx = ox + 24;
  const cy = oy + 27;

  // Scalloped 12-lobe organic wax outer edge
  for (let dy = -14; dy <= 14; dy++) {
    for (let dx = -14; dx <= 14; dx++) {
      const dist = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const rimR = 11.4 + Math.cos(ang * 10) * 0.75;
      if (dist <= rimR + 1.0 && dist > rimR) {
        s.px(cx + dx, cy + dy, deep);
      } else if (dist <= rimR) {
        // Beveled 3D rim shading (top-left lit, bottom-right deep)
        const light = (-dx * 0.55 - dy * 0.65) / rimR;
        if (dist > 8.4) {
          s.px(cx + dx, cy + dy, light > 0.25 ? hi : light < -0.25 ? dark : mid);
        } else if (dist > 7.1) {
          // Recessed inner groove ring
          s.px(cx + dx, cy + dy, light > 0.1 ? dark : hi);
        } else {
          // Glossy inner dome
          const dome = Math.max(0, Math.min(1, 0.55 + light * 0.55));
          s.px(cx + dx, cy + dy, ditherRamp(cx + dx, cy + dy, dome, [dark, mid, hi]));
        }
      }
    }
  }

  // Miniature embossed jester-crest silhouette inside the wax seal!
  const crest: readonly string[] = [
    '..h..h..',
    '.hh.hhh.',
    'hh.hhh.h',
    '..hhhhh.',
    '.dhhhhhd',
    '..hhhhh.',
    '.hh.h.hh',
    'h..hhh..',
  ];
  s.sprite(crest, { h: hi, d: dark }, cx, cy, 1);
  // Crisp specular glint on top-left rim
  s.px(cx - 7, cy - 6, COL_WHITE);
  s.px(cx - 6, cy - 7, COL_WHITE);
}
