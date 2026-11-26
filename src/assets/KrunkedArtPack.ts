// ============================================================================
// Krunked Cards — Clean-Room Built-In Pixel-Art Atlas Pack
// Generates all 15 crisp pixel-art atlases procedurally in the browser AND
// exposes a Node.js-safe manifest resolver for scripts/verify/verify-assets.ts.
// ============================================================================

import {
  ATLAS_KEYS,
  ATLAS_SPECS,
  PALETTE,
  RANKS,
  SOUND_KEYS,
  type AtlasKey,
  type PackManifest,
  type Rank,
  type SoundKey,
  type Suit,
} from '../contracts/index.ts';
import { drawPixelText } from './BitmapFont.ts';

// ---------------------------------------------------------------------------
// Node.js-safe Manifest Exports (ZERO DOM references at module top-level)
// ---------------------------------------------------------------------------

export function getBuiltinManifest(): PackManifest {
  const textures = {} as PackManifest['textures'];
  for (const key of ATLAS_KEYS) {
    const spec = ATLAS_SPECS[key];
    const width1x = spec.cols * spec.cellW;
    const height1x = spec.rows * spec.cellH;
    textures[key] = {
      url1x: `builtin://textures/1x/${key}`,
      url2x: `builtin://textures/2x/${key}`,
      width1x,
      height1x,
      cellW: spec.cellW,
      cellH: spec.cellH,
    };
  }

  const sounds = {} as Record<SoundKey, string>;
  for (const key of SOUND_KEYS) {
    sounds[key] = `builtin://sounds/${key}`;
  }

  return {
    version: 1,
    source: 'builtin',
    generatedAt: '2026-01-01T00:00:00.000Z',
    textures,
    sounds,
    shaders: [
      'builtin://shaders/background.fs',
      'builtin://shaders/foil.fs',
      'builtin://shaders/holo.fs',
      'builtin://shaders/polychrome.fs',
      'builtin://shaders/negative.fs',
      'builtin://shaders/dissolve.fs',
      'builtin://shaders/debuff.fs',
      'builtin://shaders/gold_seal.fs',
      'builtin://shaders/flame.fs',
      'builtin://shaders/CRT.fs',
    ],
  };
}

export const BUILTIN_MANIFEST: PackManifest = getBuiltinManifest();

export function hasAtlas(key: AtlasKey): boolean {
  return key in BUILTIN_MANIFEST.textures;
}

export function hasSound(key: SoundKey): boolean {
  return key in BUILTIN_MANIFEST.sounds;
}

// ---------------------------------------------------------------------------
// Deterministic Hash & Pixel Drawing Primitives (Browser Canvas)
// ---------------------------------------------------------------------------

function hash2i(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function createCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

const OUTLINE = '#22292d';
const CREAM = '#faf7f0';
const CREAM_SHADE = '#e6dfd0';

/**
 * Draw a crisp pixel-art rounded card base (71x95) with dark 2px outline and bevel.
 */
function drawCardBase(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  fill: string,
  shade: string,
  borderColor = OUTLINE,
  innerBorder?: string
): void {
  const w = 71;
  const h = 95;
  const x = ox + 1;
  const y = oy + 1;
  const cw = w - 2;
  const ch = h - 2;

  // Outer pixel silhouette (rounded corners radius 4px)
  ctx.fillStyle = borderColor;
  ctx.fillRect(x + 3, y, cw - 6, ch);
  ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
  ctx.fillRect(x, y + 3, cw, ch - 6);

  // Main fill
  ctx.fillStyle = fill;
  ctx.fillRect(x + 3, y + 2, cw - 6, ch - 4);
  ctx.fillRect(x + 2, y + 3, cw - 4, ch - 6);

  // Bottom/right subtle pixel bevel shadow
  ctx.fillStyle = shade;
  ctx.fillRect(x + 3, y + ch - 4, cw - 6, 2);
  ctx.fillRect(x + cw - 4, y + 4, 2, ch - 8);

  // Top/left crisp highlight pixel strip
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillRect(x + 4, y + 2, cw - 9, 1);
  ctx.fillRect(x + 2, y + 4, 1, ch - 9);

  if (innerBorder) {
    ctx.fillStyle = innerBorder;
    ctx.fillRect(x + 5, y + 5, cw - 10, 2);
    ctx.fillRect(x + 5, y + ch - 7, cw - 10, 2);
    ctx.fillRect(x + 5, y + 5, 2, ch - 10);
    ctx.fillRect(x + cw - 7, y + 5, 2, ch - 10);
  }
}

/**
 * Draw crisp pixel-art suit emblem centered at (cx, cy).
 * size: 'sm' (7x7) or 'md' (11x11) or 'lg' (19x19)
 */
function drawSuitIcon(
  ctx: CanvasRenderingContext2D,
  suit: Suit,
  cx: number,
  cy: number,
  size: 'sm' | 'md' | 'lg',
  color: string,
  highlight?: string
): void {
  const s = size === 'sm' ? 1 : size === 'md' ? 1 : 2;
  const patterns: Record<Suit, string[]> =
    size === 'sm'
      ? {
          Hearts: ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'],
          Diamonds: ['0001000', '0011100', '0111110', '1111111', '0111110', '0011100', '0001000'],
          Spades: ['0001000', '0011100', '0111110', '1111111', '1111111', '0001000', '0011100'],
          Clubs: ['0011100', '0011100', '1101011', '1111111', '1101011', '0001000', '0011100'],
        }
      : {
          Hearts: [
            '00111011100',
            '01111111110',
            '11111111111',
            '11111111111',
            '11111111111',
            '01111111110',
            '00111111100',
            '00011111000',
            '00001110000',
            '00000100000',
          ],
          Diamonds: [
            '00000100000',
            '00001110000',
            '00011111000',
            '00111111100',
            '01111111110',
            '11111111111',
            '01111111110',
            '00111111100',
            '00011111000',
            '00001110000',
            '00000100000',
          ],
          Spades: [
            '00000100000',
            '00001110000',
            '00011111000',
            '00111111100',
            '01111111110',
            '11111111111',
            '11111111111',
            '11110101111',
            '01100100110',
            '00001110000',
            '00011111000',
          ],
          Clubs: [
            '00001110000',
            '00011111000',
            '00011111000',
            '00001110000',
            '01100100110',
            '11111111111',
            '11111111111',
            '11110101111',
            '01100100110',
            '00001110000',
            '00011111000',
          ],
        };

  const pat = patterns[suit];
  const rows = pat.length;
  const cols = pat[0]!.length;
  const x0 = Math.round(cx - (cols * s) / 2);
  const y0 = Math.round(cy - (rows * s) / 2);

  ctx.fillStyle = color;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (pat[r]![c] === '1') {
        ctx.fillRect(x0 + c * s, y0 + r * s, s, s);
      }
    }
  }
  if (highlight) {
    ctx.fillStyle = highlight;
    const hr = Math.min(2, rows - 1);
    for (let c = 1; c < Math.min(4, cols); c++) {
      if (pat[hr]![c] === '1') {
        ctx.fillRect(x0 + c * s, y0 + hr * s, s, s);
      }
    }
  }
}

function drawPixelCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  fill: string,
  outline?: string
): void {
  const r2 = radius * radius;
  const ro2 = (radius + 1.2) * (radius + 1.2);
  const ri = Math.ceil(radius + 2);
  for (let dy = -ri; dy <= ri; dy++) {
    for (let dx = -ri; dx <= ri; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2) {
        ctx.fillStyle = fill;
        ctx.fillRect(Math.round(cx + dx), Math.round(cy + dy), 1, 1);
      } else if (outline && d2 <= ro2) {
        ctx.fillStyle = outline;
        ctx.fillRect(Math.round(cx + dx), Math.round(cy + dy), 1, 1);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 1. Playing Cards Atlas (`cards_1` and `cards_2` high-contrast)
// Row order matches custom pack: 0=Hearts, 1=Clubs, 2=Diamonds, 3=Spades
// Transparent background so `centers` (plain or enhancement) shows cleanly underneath!
// ---------------------------------------------------------------------------

const CARD_ROW_SUITS: Suit[] = ['Hearts', 'Clubs', 'Diamonds', 'Spades'];

const PIP_LAYOUTS: Record<string, Array<[number, number]>> = {
  '2': [
    [0.5, 0.28],
    [0.5, 0.72],
  ],
  '3': [
    [0.5, 0.26],
    [0.5, 0.5],
    [0.5, 0.74],
  ],
  '4': [
    [0.34, 0.28],
    [0.66, 0.28],
    [0.34, 0.72],
    [0.66, 0.72],
  ],
  '5': [
    [0.34, 0.28],
    [0.66, 0.28],
    [0.5, 0.5],
    [0.34, 0.72],
    [0.66, 0.72],
  ],
  '6': [
    [0.34, 0.26],
    [0.66, 0.26],
    [0.34, 0.5],
    [0.66, 0.5],
    [0.34, 0.74],
    [0.66, 0.74],
  ],
  '7': [
    [0.34, 0.25],
    [0.66, 0.25],
    [0.5, 0.37],
    [0.34, 0.5],
    [0.66, 0.5],
    [0.34, 0.75],
    [0.66, 0.75],
  ],
  '8': [
    [0.34, 0.25],
    [0.66, 0.25],
    [0.5, 0.37],
    [0.34, 0.5],
    [0.66, 0.5],
    [0.5, 0.63],
    [0.34, 0.75],
    [0.66, 0.75],
  ],
  '9': [
    [0.34, 0.24],
    [0.66, 0.24],
    [0.34, 0.41],
    [0.66, 0.41],
    [0.5, 0.5],
    [0.34, 0.59],
    [0.66, 0.59],
    [0.34, 0.76],
    [0.66, 0.76],
  ],
  '10': [
    [0.34, 0.23],
    [0.66, 0.23],
    [0.5, 0.33],
    [0.34, 0.42],
    [0.66, 0.42],
    [0.34, 0.58],
    [0.66, 0.58],
    [0.5, 0.67],
    [0.34, 0.77],
    [0.66, 0.77],
  ],
};

function drawRoyalPortrait(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  rank: Rank,
  suit: Suit,
  suitColor: string
): void {
  const accentGold = '#f5c542';
  const skin = '#f7d5b5';
  const royalBlue = suit === 'Hearts' || suit === 'Diamonds' ? '#c93b3b' : '#2f4568';
  const cape = suit === 'Hearts' || suit === 'Diamonds' ? '#e54e45' : '#3a688a';

  // Inner ornate portrait frame
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(ox + 15, oy + 16, 41, 63);
  ctx.fillStyle = '#f2ead8';
  ctx.fillRect(ox + 17, oy + 18, 37, 59);
  ctx.fillStyle = accentGold;
  ctx.fillRect(ox + 18, oy + 19, 35, 2);
  ctx.fillRect(ox + 18, oy + 74, 35, 2);

  // Royal robe / shoulders
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(ox + 21, oy + 52, 29, 22);
  ctx.fillStyle = cape;
  ctx.fillRect(ox + 23, oy + 54, 25, 19);
  ctx.fillStyle = royalBlue;
  ctx.fillRect(ox + 28, oy + 54, 15, 19);
  ctx.fillStyle = accentGold;
  ctx.fillRect(ox + 34, oy + 54, 3, 19);
  ctx.fillRect(ox + 23, oy + 54, 25, 3);

  // Face / Head
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(ox + 26, oy + 31, 19, 22);
  ctx.fillStyle = skin;
  ctx.fillRect(ox + 28, oy + 33, 15, 18);

  // Hair / Beard details per rank
  if (rank === 'King') {
    ctx.fillStyle = '#e8e4d8';
    ctx.fillRect(ox + 28, oy + 45, 15, 6);
    ctx.fillRect(ox + 30, oy + 50, 11, 3);
    ctx.fillStyle = '#b9b2a4';
    ctx.fillRect(ox + 31, oy + 46, 9, 2);
  } else if (rank === 'Queen') {
    ctx.fillStyle = '#d98a36';
    ctx.fillRect(ox + 25, oy + 34, 4, 20);
    ctx.fillRect(ox + 42, oy + 34, 4, 20);
    ctx.fillStyle = '#fe5f55';
    ctx.fillRect(ox + 33, oy + 47, 5, 2);
  } else {
    // Jack feathered cap / playful smirk
    ctx.fillStyle = '#5a3d2b';
    ctx.fillRect(ox + 28, oy + 33, 15, 4);
    ctx.fillStyle = '#22292d';
    ctx.fillRect(ox + 32, oy + 46, 7, 2);
  }

  // Expressive pixel eyes
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(ox + 31, oy + 39, 2, 3);
  ctx.fillRect(ox + 38, oy + 39, 2, 3);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ox + 31, oy + 39, 1, 1);
  ctx.fillRect(ox + 38, oy + 39, 1, 1);

  // Crown or Plumed Hat
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(ox + 24, oy + 22, 23, 11);
  if (rank === 'King') {
    ctx.fillStyle = accentGold;
    ctx.fillRect(ox + 26, oy + 26, 19, 6);
    ctx.fillRect(ox + 26, oy + 23, 4, 4);
    ctx.fillRect(ox + 33, oy + 22, 5, 5);
    ctx.fillRect(ox + 41, oy + 23, 4, 4);
    ctx.fillStyle = suitColor;
    ctx.fillRect(ox + 34, oy + 27, 3, 3);
  } else if (rank === 'Queen') {
    ctx.fillStyle = accentGold;
    ctx.fillRect(ox + 27, oy + 27, 17, 5);
    ctx.fillRect(ox + 28, oy + 24, 3, 4);
    ctx.fillRect(ox + 34, oy + 23, 3, 5);
    ctx.fillRect(ox + 40, oy + 24, 3, 4);
    ctx.fillStyle = '#009dff';
    ctx.fillRect(ox + 34, oy + 28, 3, 2);
  } else {
    // Jack beret + feather
    ctx.fillStyle = suitColor;
    ctx.fillRect(ox + 25, oy + 25, 21, 6);
    ctx.fillStyle = accentGold;
    ctx.fillRect(ox + 42, oy + 20, 4, 7);
    ctx.fillRect(ox + 44, oy + 19, 3, 4);
  }

  // Suit medallion on chest
  drawSuitIcon(ctx, suit, ox + 35, oy + 64, 'sm', suitColor);
}

function buildPlayingCardsAtlas(highContrast: boolean): HTMLCanvasElement {
  const spec = highContrast ? ATLAS_SPECS.cards_2 : ATLAS_SPECS.cards_1;
  const [canvas, ctx] = createCanvas(spec.cols * spec.cellW, spec.rows * spec.cellH);
  const suitPalette = highContrast ? PALETTE.SUITS_HIGH_CONTRAST : PALETTE.SUITS_DEFAULT;

  for (let row = 0; row < 4; row++) {
    const suit = CARD_ROW_SUITS[row]!;
    const color = suitPalette[suit];
    const hiColor =
      suit === 'Hearts' || suit === 'Diamonds'
        ? 'rgba(255,255,255,0.45)'
        : 'rgba(180,220,255,0.35)';

    for (let col = 0; col < 13; col++) {
      const rank = RANKS[col]!;
      const ox = col * spec.cellW;
      const oy = row * spec.cellH;

      const label =
        rank === 'Jack' ? 'J' : rank === 'Queen' ? 'Q' : rank === 'King' ? 'K' : rank === 'Ace' ? 'A' : rank;

      // Top-left rank & mini suit
      if (label === '10') {
        drawPixelText(ctx, '1', ox + 5, oy + 6, 1, color);
        drawPixelText(ctx, '0', ox + 9, oy + 6, 1, color);
      } else {
        drawPixelText(ctx, label, ox + 6, oy + 6, 1, color);
      }
      drawSuitIcon(ctx, suit, ox + 9, oy + 19, 'sm', color);

      // Bottom-right rank & mini suit
      if (label === '10') {
        drawPixelText(ctx, '1', ox + 55, oy + 82, 1, color);
        drawPixelText(ctx, '0', ox + 59, oy + 82, 1, color);
      } else {
        drawPixelText(ctx, label, ox + 59, oy + 82, 1, color);
      }
      drawSuitIcon(ctx, suit, ox + 62, oy + 75, 'sm', color);

      // Center artwork
      if (rank === 'Ace') {
        drawSuitIcon(ctx, suit, ox + 35, oy + 47, 'lg', color, hiColor);
        // Ornate corner sparkles on Ace
        ctx.fillStyle = color;
        ctx.fillRect(ox + 35, oy + 26, 2, 2);
        ctx.fillRect(ox + 35, oy + 67, 2, 2);
      } else if (rank === 'Jack' || rank === 'Queen' || rank === 'King') {
        drawRoyalPortrait(ctx, ox, oy, rank, suit, color);
      } else {
        const pips = PIP_LAYOUTS[rank] ?? [];
        for (const [px, py] of pips) {
          drawSuitIcon(
            ctx,
            suit,
            ox + Math.round(px * 71),
            oy + Math.round(py * 95),
            'md',
            color,
            hiColor
          );
        }
      }
    }
  }

  return canvas;
}

// ---------------------------------------------------------------------------
// 2. Centers Atlas (`centers`, 7x5 @ 71x95):
// Deck backs, plain card front, all 8 Enhancements, all 4 Wax Seals
// ---------------------------------------------------------------------------

function drawDeckBack(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  primary: string,
  secondary: string,
  emblemColor: string,
  motif: string
): void {
  drawCardBase(ctx, ox, oy, '#faf6ee', '#dbd3c2', OUTLINE);
  // Colored back panel
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(ox + 6, oy + 6, 59, 83);
  ctx.fillStyle = primary;
  ctx.fillRect(ox + 8, oy + 8, 55, 79);

  // Subtle checkerboard/diagonal pixel weave
  ctx.fillStyle = secondary;
  for (let y = 10; y < 85; y += 4) {
    for (let x = 10; x < 61; x += 4) {
      if (((x + y) >> 2) % 2 === 0) {
        ctx.fillRect(ox + x, oy + y, 2, 2);
      }
    }
  }

  // Ornate center crest
  drawPixelCircle(ctx, ox + 35, oy + 47, 17, secondary, OUTLINE);
  drawPixelCircle(ctx, ox + 35, oy + 47, 13, emblemColor, OUTLINE);
  drawPixelText(ctx, motif, ox + 35, oy + 44, 2, '#ffffff', {
    align: 'center',
    outlineColor: OUTLINE,
  });
}

function drawWaxSeal(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  fill: string,
  rim: string,
  ribbon: string,
  glyph: string
): void {
  const cx = ox + 55;
  const cy = oy + 72;
  // Ribbon tails
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(cx - 5, cy + 7, 11, 11);
  ctx.fillStyle = ribbon;
  ctx.fillRect(cx - 4, cy + 7, 3, 9);
  ctx.fillRect(cx + 2, cy + 7, 3, 9);
  // Scalloped wax disc
  drawPixelCircle(ctx, cx, cy, 10, rim, OUTLINE);
  drawPixelCircle(ctx, cx, cy, 7, fill);
  drawPixelText(ctx, glyph, cx, cy - 3, 1, '#ffffff', {
    align: 'center',
    shadowColor: OUTLINE,
  });
}

function buildCentersAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.centers;
  const [canvas, ctx] = createCanvas(spec.cols * spec.cellW, spec.rows * spec.cellH);
  const cell = (gx: number, gy: number) => ({ ox: gx * spec.cellW, oy: gy * spec.cellH });

  // Plain card front (1,0)
  {
    const { ox, oy } = cell(1, 0);
    drawCardBase(ctx, ox, oy, CREAM, CREAM_SHADE, OUTLINE);
  }

  // Deck Backs matching exact oracle.json coordinates
  const decks: Array<[number, number, string, string, string, string]> = [
    [0, 0, '#d9453c', '#a82d26', '#f5b841', 'R'], // Red Deck
    [0, 2, '#2d7dd2', '#1f5494', '#72c2ff', 'B'], // Blue Deck
    [1, 2, '#e8ae33', '#b87f1c', '#fff099', '$'], // Yellow Deck
    [2, 2, '#349e6a', '#216e49', '#8af2ba', 'G'], // Green Deck
    [3, 2, '#373e47', '#20252b', '#c75985', 'K'], // Black Deck
    [0, 3, '#7b4cb8', '#4e2c7d', '#f5c542', 'M'], // Magic Deck
    [3, 0, '#2a3770', '#19214a', '#a985ff', 'N'], // Nebula Deck
    [6, 2, '#5a6e82', '#3a4b5c', '#b0f0ff', 'O'], // Ghost Deck
    [3, 3, '#7d6c5a', '#52463a', '#d4c3b0', 'A'], // Abandoned Deck
    [1, 3, '#c73e3e', '#2f3542', '#ffffff', 'X'], // Checkered Deck
    [3, 4, '#4d3a7a', '#2d1f4f', '#ffd269', 'Z'], // Zodiac Deck
    [4, 3, '#e36f40', '#a34121', '#ffe082', 'P'], // Painted Deck
    [2, 4, '#219ebc', '#d62828', '#ffffff', '2'], // Anaglyph Deck
    [4, 2, '#8b46d9', '#3085ff', '#f0a6ff', 'E'], // Plasma Deck
    [2, 3, '#c74c8a', '#358f80', '#ffdf6b', '?'], // Erratic Deck
    [4, 0, '#445259', '#2b3438', '#f3b958', 'C'], // Challenge Deck
    [0, 1, '#31393d', '#22282b', '#8867a5', '!'], // Locked / Soul back
    [5, 2, '#2e363a', '#1d2326', '#7b8b91', '?'], // Locked Joker back
  ];
  for (const [gx, gy, c1, c2, c3, glyph] of decks) {
    const { ox, oy } = cell(gx, gy);
    drawDeckBack(ctx, ox, oy, c1, c2, c3, glyph);
  }

  // Enhancements (exact oracle.json coordinates):
  // Bonus Card (1,1) — crisp blue poker chip corner accents
  {
    const { ox, oy } = cell(1, 1);
    drawCardBase(ctx, ox, oy, '#ebf7ff', '#bfdcf2', '#174d7a', '#009dff');
    drawPixelCircle(ctx, ox + 12, oy + 82, 4, '#009dff', OUTLINE);
    drawPixelCircle(ctx, ox + 59, oy + 13, 4, '#009dff', OUTLINE);
    ctx.fillStyle = '#009dff';
    ctx.fillRect(ox + 26, oy + 4, 19, 3);
    ctx.fillRect(ox + 26, oy + 88, 19, 3);
  }
  // Mult Card (2,1) — crimson velvet trim & flame chevrons
  {
    const { ox, oy } = cell(2, 1);
    drawCardBase(ctx, ox, oy, '#fff0ef', '#f2c2be', '#7a1c19', '#fe5f55');
    ctx.fillStyle = '#fe5f55';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(ox + 18 + i * 8, oy + 3, 4, 4);
      ctx.fillRect(ox + 18 + i * 8, oy + 88, 4, 4);
    }
  }
  // Wild Card (3,1) — vibrant rainbow diamond border
  {
    const { ox, oy } = cell(3, 1);
    drawCardBase(ctx, ox, oy, '#fcfaf2', '#e8e0cf', OUTLINE);
    const rainbow = ['#fe5f55', '#fda200', '#4bc292', '#009dff', '#b26cbb'];
    for (let i = 0; i < 61; i += 4) {
      ctx.fillStyle = rainbow[(i >> 2) % rainbow.length]!;
      ctx.fillRect(ox + 5 + i, oy + 4, 4, 3);
      ctx.fillRect(ox + 5 + i, oy + 88, 4, 3);
    }
    for (let j = 0; j < 82; j += 4) {
      ctx.fillStyle = rainbow[(j >> 2) % rainbow.length]!;
      ctx.fillRect(ox + 4, oy + 7 + j, 3, 4);
      ctx.fillRect(ox + 64, oy + 7 + j, 3, 4);
    }
  }
  // Lucky Card (4,1) — emerald & gold four-leaf clover frame
  {
    const { ox, oy } = cell(4, 1);
    drawCardBase(ctx, ox, oy, '#f7fbe8', '#d5e6b5', '#2a5934', '#4bc292');
    ctx.fillStyle = '#f3b958';
    ctx.fillRect(ox + 8, oy + 8, 55, 2);
    ctx.fillRect(ox + 8, oy + 85, 55, 2);
    // Tiny clover marks
    for (const [cx, cy] of [
      [14, 80],
      [57, 15],
    ]) {
      ctx.fillStyle = '#2ea36b';
      ctx.fillRect(ox + cx - 2, oy + cy, 5, 2);
      ctx.fillRect(ox + cx, oy + cy - 2, 2, 5);
    }
  }
  // Glass Card (5,1) — translucent crystal sheen with diagonal glint
  {
    const { ox, oy } = cell(5, 1);
    drawCardBase(ctx, ox, oy, 'rgba(225,244,255,0.82)', 'rgba(165,212,240,0.85)', '#5c8ea8', '#ffffff');
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 52; i++) {
      ctx.fillRect(ox + 10 + i, oy + 62 - i, 6, 2);
      if (i < 34) ctx.fillRect(ox + 26 + i, oy + 78 - i, 3, 2);
    }
  }
  // Steel Card (6,1) — brushed riveted steel plate
  {
    const { ox, oy } = cell(6, 1);
    drawCardBase(ctx, ox, oy, '#bcc7d1', '#8897a6', '#2b3640', '#e3ebf2');
    // Brushed metal bands
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(ox + 7, oy + 18, 57, 8);
    ctx.fillRect(ox + 7, oy + 52, 57, 12);
    // 4 Corner rivets
    for (const [rx, ry] of [
      [9, 9],
      [61, 9],
      [9, 85],
      [61, 85],
    ]) {
      drawPixelCircle(ctx, ox + rx, oy + ry, 2, '#5c6b78', '#22292d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + rx - 1, oy + ry - 1, 1, 1);
    }
  }
  // Stone Card (5,0) — chiseled granite slab (no rank/suit)
  {
    const { ox, oy } = cell(5, 0);
    drawCardBase(ctx, ox, oy, '#8d9499', '#61686e', '#262b2e');
    // Chiseled cracks & stone speckles
    ctx.fillStyle = '#50575c';
    ctx.fillRect(ox + 14, oy + 22, 18, 2);
    ctx.fillRect(ox + 30, oy + 24, 3, 14);
    ctx.fillRect(ox + 33, oy + 36, 14, 2);
    ctx.fillRect(ox + 18, oy + 64, 26, 2);
    ctx.fillRect(ox + 42, oy + 54, 2, 12);
    for (let i = 0; i < 45; i++) {
      const px = 8 + Math.floor(hash2i(i, 1, 99) * 55);
      const py = 8 + Math.floor(hash2i(i, 2, 99) * 79);
      ctx.fillStyle = i % 2 === 0 ? '#aeb5ba' : '#6f767c';
      ctx.fillRect(ox + px, oy + py, 2, 2);
    }
    drawPixelText(ctx, '+50', ox + 35, oy + 44, 2, '#f0f4f8', {
      align: 'center',
      outlineColor: OUTLINE,
    });
  }
  // Gold Card (6,0) — gleaming gold bullion card
  {
    const { ox, oy } = cell(6, 0);
    drawCardBase(ctx, ox, oy, '#f7cf54', '#c98e1e', '#5e3c06', '#fff2a6');
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 44; i++) {
      ctx.fillRect(ox + 12 + i, oy + 56 - i, 4, 2);
    }
  }

  // Wax Seals (transparent card cell with crisp seal at bottom-right)
  {
    const g = cell(2, 0);
    drawWaxSeal(ctx, g.ox, g.oy, '#f5c23b', '#ffdf78', '#c48914', '$');
    const r = cell(5, 4);
    drawWaxSeal(ctx, r.ox, r.oy, '#e8433a', '#ff7b73', '#9e1f19', 'R');
    const b = cell(6, 4);
    drawWaxSeal(ctx, b.ox, b.oy, '#2188e6', '#69baff', '#155494', 'P');
    const p = cell(4, 4);
    drawWaxSeal(ctx, p.ox, p.oy, '#8b57c7', '#be92f5', '#572f8a', 'T');
  }

  return canvas;
}

// ---------------------------------------------------------------------------
// 3. Joker Atlas (`Joker`, 10x16 @ 71x95):
// Iconic hand-crafted portraits for key Jokers + vibrant deterministic portraits
// across all 160 cells so EVERY Joker in Wave 1 and Full Catalog looks distinct!
// ---------------------------------------------------------------------------

interface NamedJokerArt {
  gx: number;
  gy: number;
  bg: string;
  trim: string;
  kind:
    | 'jimbo'
    | 'lusty'
    | 'greedy'
    | 'wrathful'
    | 'glutton'
    | 'blueprint'
    | 'brainstorm'
    | 'baron'
    | 'mime'
    | 'vampire'
    | 'banana'
    | 'cavendish'
    | 'dagger'
    | 'dna'
    | 'space'
    | 'bus'
    | 'stuntman'
    | 'egg'
    | 'constellation'
    | 'hologram'
    | 'bones'
    | 'icecream'
    | 'blackboard'
    | 'steel'
    | 'half'
    | 'fibonacci'
    | 'scholar'
    | 'banner'
    | 'splash'
    | 'photograph'
    | 'bull'
    | 'cat'
    | 'legendary';
  accent: string;
}

const ICONIC_JOKERS: NamedJokerArt[] = [
  { gx: 0, gy: 0, bg: '#f2efe6', trim: '#fe5f55', kind: 'jimbo', accent: '#009dff' }, // Joker (Jimbo)
  { gx: 7, gy: 0, bg: '#f2efe6', trim: '#fe5f55', kind: 'half', accent: '#009dff' }, // Half Joker
  { gx: 6, gy: 1, bg: '#fff5e0', trim: '#e29000', kind: 'greedy', accent: '#fe5f55' }, // Greedy Joker
  { gx: 7, gy: 1, bg: '#ffe8ec', trim: '#fe5f55', kind: 'lusty', accent: '#e83b5c' }, // Lusty Joker
  { gx: 8, gy: 1, bg: '#e6e8f2', trim: '#374649', kind: 'wrathful', accent: '#4f31b9' }, // Wrathful Joker
  { gx: 9, gy: 1, bg: '#e4f5f0', trim: '#2c6e58', kind: 'glutton', accent: '#008ee6' }, // Gluttonous Joker
  { gx: 4, gy: 1, bg: '#2c3138', trim: '#ffffff', kind: 'mime', accent: '#fe5f55' }, // Mime
  { gx: 1, gy: 2, bg: '#214875', trim: '#f3b958', kind: 'banner', accent: '#009dff' }, // Banner
  { gx: 7, gy: 2, bg: '#97a6b5', trim: '#4f6367', kind: 'steel', accent: '#e3ebf2' }, // Steel Joker
  { gx: 0, gy: 3, bg: '#1854a8', trim: '#7cc6ff', kind: 'blueprint', accent: '#ffffff' }, // Blueprint
  { gx: 0, gy: 4, bg: '#304352', trim: '#f3b958', kind: 'scholar', accent: '#fe5f55' }, // Scholar
  { gx: 3, gy: 4, bg: '#24222a', trim: '#e6e1d3', kind: 'bones', accent: '#4bc292' }, // Mr. Bones
  { gx: 1, gy: 5, bg: '#f2e8d5', trim: '#d97b29', kind: 'fibonacci', accent: '#2b5973' }, // Fibonacci
  { gx: 3, gy: 5, bg: '#161b33', trim: '#6fd3ff', kind: 'space', accent: '#f3b958' }, // Space Joker
  { gx: 5, gy: 5, bg: '#3d1c28', trim: '#c7c2cc', kind: 'dagger', accent: '#fe5f55' }, // Ceremonial Dagger
  { gx: 1, gy: 6, bg: '#f7d559', trim: '#d9781e', kind: 'bus', accent: '#009dff' }, // Ride the Bus
  { gx: 7, gy: 6, bg: '#e6f5ff', trim: '#f5cc38', kind: 'banana', accent: '#4bc292' }, // Gros Michel
  { gx: 8, gy: 6, bg: '#233245', trim: '#fe5f55', kind: 'stuntman', accent: '#ffffff' }, // Stuntman
  { gx: 7, gy: 7, bg: '#faf4e6', trim: '#c94c38', kind: 'brainstorm', accent: '#2c5ba8' }, // Brainstorm
  { gx: 0, gy: 10, bg: '#e8f5e9', trim: '#f5d27a', kind: 'egg', accent: '#fff7d6' }, // Egg
  { gx: 2, gy: 10, bg: '#21382d', trim: '#9e7540', kind: 'blackboard', accent: '#ffffff' }, // Blackboard
  { gx: 4, gy: 10, bg: '#ffebf2', trim: '#ff7eb3', kind: 'icecream', accent: '#ffd166' }, // Ice Cream
  { gx: 5, gy: 10, bg: '#182b3b', trim: '#38e8c6', kind: 'dna', accent: '#fe5f55' }, // DNA
  { gx: 6, gy: 10, bg: '#c7f0ff', trim: '#009dff', kind: 'splash', accent: '#ffffff' }, // Splash
  { gx: 9, gy: 10, bg: '#121833', trim: '#70a9ff', kind: 'constellation', accent: '#ffe680' }, // Constellation
  { gx: 5, gy: 11, bg: '#fff3c4', trim: '#f5b82e', kind: 'cavendish', accent: '#4bc292' }, // Cavendish
  { gx: 2, gy: 12, bg: '#291522', trim: '#fe5f55', kind: 'vampire', accent: '#f2e9e4' }, // Vampire
  { gx: 4, gy: 12, bg: '#0c2336', trim: '#2ef2ff', kind: 'hologram', accent: '#8cffff' }, // Hologram
  { gx: 6, gy: 12, bg: '#38223d', trim: '#f5c23b', kind: 'baron', accent: '#fe5f55' }, // Baron
  { gx: 2, gy: 13, bg: '#f5f2eb', trim: '#4f6367', kind: 'photograph', accent: '#fe5f55' }, // Photograph
  { gx: 5, gy: 14, bg: '#fff4d6', trim: '#f5a623', kind: 'cat', accent: '#fe5f55' }, // Lucky Cat
  { gx: 7, gy: 14, bg: '#3d251e', trim: '#f3b958', kind: 'bull', accent: '#fe5f55' }, // Bull
  // Legendaries (row 8 cols 3..7)
  { gx: 3, gy: 8, bg: '#241a38', trim: '#f3b958', kind: 'legendary', accent: '#fe5f55' },
  { gx: 4, gy: 8, bg: '#1d2d4a', trim: '#f3b958', kind: 'legendary', accent: '#009dff' },
  { gx: 5, gy: 8, bg: '#2b1b2e', trim: '#f3b958', kind: 'legendary', accent: '#4bc292' },
  { gx: 6, gy: 8, bg: '#331d21', trim: '#f3b958', kind: 'legendary', accent: '#b26cbb' },
  { gx: 7, gy: 8, bg: '#1a332d', trim: '#f3b958', kind: 'legendary', accent: '#fda200' },
];

function drawJesterPortrait(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  hatLeft: string,
  hatRight: string,
  face: string,
  collar: string,
  smileColor = '#fe5f55'
): void {
  // Jester collar
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(ox + 16, oy + 62, 39, 18);
  ctx.fillStyle = collar;
  ctx.fillRect(ox + 18, oy + 64, 35, 14);
  ctx.fillStyle = hatLeft;
  ctx.fillRect(ox + 21, oy + 66, 7, 9);
  ctx.fillStyle = hatRight;
  ctx.fillRect(ox + 43, oy + 66, 7, 9);

  // Head
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(ox + 22, oy + 32, 27, 30);
  ctx.fillStyle = face;
  ctx.fillRect(ox + 24, oy + 34, 23, 26);

  // Jester twin-horned hat
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(ox + 13, oy + 16, 45, 18);
  ctx.fillStyle = hatLeft;
  ctx.fillRect(ox + 15, oy + 18, 20, 14);
  ctx.fillRect(ox + 11, oy + 24, 8, 9);
  ctx.fillStyle = hatRight;
  ctx.fillRect(ox + 35, oy + 18, 21, 14);
  ctx.fillRect(ox + 52, oy + 24, 8, 9);
  // Gold jester bells
  drawPixelCircle(ctx, ox + 12, oy + 34, 3, '#f5c542', OUTLINE);
  drawPixelCircle(ctx, ox + 59, oy + 34, 3, '#f5c542', OUTLINE);

  // Cheek blush & eyes
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(ox + 28, oy + 41, 4, 5);
  ctx.fillRect(ox + 39, oy + 41, 4, 5);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ox + 29, oy + 42, 2, 2);
  ctx.fillRect(ox + 40, oy + 42, 2, 2);

  // Grin
  ctx.fillStyle = smileColor;
  ctx.fillRect(ox + 28, oy + 52, 15, 4);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ox + 30, oy + 53, 11, 2);
}

function drawIconicJokerCell(ctx: CanvasRenderingContext2D, ox: number, oy: number, art: NamedJokerArt): void {
  if (art.kind === 'half') {
    // Torn top half of a Joker card!
    drawCardBase(ctx, ox, oy, art.bg, '#dbd4c5', OUTLINE);
    ctx.clearRect(ox, oy + 54, 71, 41);
    // Jagged torn paper edge
    ctx.fillStyle = OUTLINE;
    for (let x = 3; x < 68; x += 6) {
      ctx.fillRect(ox + x, oy + 51 + (x % 12 === 3 ? 2 : 0), 6, 3);
    }
    drawJesterPortrait(ctx, ox, oy - 6, '#fe5f55', '#009dff', '#ffffff', '#f5c542');
    ctx.clearRect(ox, oy + 55, 71, 40);
    return;
  }

  drawCardBase(ctx, ox, oy, art.bg, 'rgba(0,0,0,0.14)', OUTLINE, art.trim);

  switch (art.kind) {
    case 'jimbo':
      drawJesterPortrait(ctx, ox, oy, '#fe5f55', '#009dff', '#fffaf2', '#f3b958');
      break;
    case 'lusty':
      drawJesterPortrait(ctx, ox, oy, '#fe5f55', '#e83b5c', '#fff0f2', '#ff9eb5');
      drawSuitIcon(ctx, 'Hearts', ox + 35, oy + 72, 'sm', '#fe5f55');
      break;
    case 'greedy':
      drawJesterPortrait(ctx, ox, oy, '#f3b958', '#e29000', '#fff8e6', '#fe5f55');
      drawSuitIcon(ctx, 'Diamonds', ox + 35, oy + 72, 'sm', '#e29000');
      break;
    case 'wrathful':
      drawJesterPortrait(ctx, ox, oy, '#374649', '#4f31b9', '#ebeef5', '#7c62d6');
      drawSuitIcon(ctx, 'Spades', ox + 35, oy + 72, 'sm', '#374649');
      break;
    case 'glutton':
      drawJesterPortrait(ctx, ox, oy, '#2ea36b', '#008ee6', '#ebf7f2', '#4bc292');
      drawSuitIcon(ctx, 'Clubs', ox + 35, oy + 72, 'sm', '#2c6e58');
      break;
    case 'blueprint':
      // Architectural blueprint grid + sketched white jester
      ctx.fillStyle = 'rgba(140,210,255,0.28)';
      for (let x = 10; x < 62; x += 6) ctx.fillRect(ox + x, oy + 10, 1, 75);
      for (let y = 10; y < 86; y += 6) ctx.fillRect(ox + 10, oy + y, 52, 1);
      drawJesterPortrait(ctx, ox, oy, '#3a86e8', '#296cc4', '#56a3ff', '#1c4f99', '#ffffff');
      drawPixelText(ctx, 'BP', ox + 35, oy + 80, 1, '#ffffff', { align: 'center' });
      break;
    case 'brainstorm':
      // Napkin sketch brainstorm with red/blue ink arrows & lightbulb
      ctx.fillStyle = 'rgba(80,120,200,0.2)';
      for (let y = 16; y < 82; y += 8) ctx.fillRect(ox + 10, oy + y, 51, 1);
      drawPixelCircle(ctx, ox + 35, oy + 38, 12, '#ffe066', '#2c5ba8');
      ctx.fillStyle = '#c94c38';
      ctx.fillRect(ox + 31, oy + 50, 9, 6);
      ctx.fillRect(ox + 16, oy + 22, 8, 2);
      ctx.fillRect(ox + 48, oy + 22, 8, 2);
      ctx.fillRect(ox + 35, oy + 14, 2, 7);
      drawPixelText(ctx, 'IDEA!', ox + 35, oy + 68, 1, '#c94c38', { align: 'center' });
      break;
    case 'baron':
      // Golden Crowned Baron with monocle
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 18, oy + 54, 35, 26);
      ctx.fillStyle = '#9e2638';
      ctx.fillRect(ox + 20, oy + 56, 31, 22);
      ctx.fillStyle = '#f5c542';
      ctx.fillRect(ox + 32, oy + 56, 7, 22);
      ctx.fillStyle = '#f5d2b3';
      ctx.fillRect(ox + 24, oy + 32, 23, 24);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + 24, oy + 48, 23, 8);
      // Tall gold crown
      ctx.fillStyle = '#f5c542';
      ctx.fillRect(ox + 21, oy + 22, 29, 10);
      ctx.fillRect(ox + 21, oy + 16, 6, 7);
      ctx.fillRect(ox + 32, oy + 14, 7, 9);
      ctx.fillRect(ox + 44, oy + 16, 6, 7);
      // Monocle
      drawPixelCircle(ctx, ox + 40, oy + 41, 4, '#a8e6ff', '#f5c542');
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 29, oy + 40, 3, 3);
      break;
    case 'mime':
      // Black & white striped mime shirt + white mask
      for (let y = 56; y < 82; y += 6) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ox + 18, oy + y, 35, 3);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + 23, oy + 26, 25, 28);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 19, oy + 18, 33, 10);
      ctx.fillRect(ox + 28, oy + 36, 4, 4);
      ctx.fillRect(ox + 39, oy + 36, 4, 4);
      ctx.fillStyle = '#fe5f55';
      ctx.fillRect(ox + 32, oy + 46, 7, 3);
      break;
    case 'vampire':
      // High collar cape, pale face, crimson eyes, white fangs
      ctx.fillStyle = '#181018';
      ctx.fillRect(ox + 14, oy + 40, 43, 40);
      ctx.fillStyle = '#b51d31';
      ctx.fillRect(ox + 18, oy + 44, 35, 34);
      ctx.fillStyle = '#e8e4eb';
      ctx.fillRect(ox + 25, oy + 28, 21, 26);
      ctx.fillStyle = '#181018';
      ctx.fillRect(ox + 25, oy + 24, 21, 7);
      ctx.fillRect(ox + 33, oy + 30, 5, 4);
      ctx.fillStyle = '#fe5f55';
      ctx.fillRect(ox + 29, oy + 38, 3, 3);
      ctx.fillRect(ox + 39, oy + 38, 3, 3);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 29, oy + 46, 13, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + 31, oy + 47, 2, 3);
      ctx.fillRect(ox + 38, oy + 47, 2, 3);
      break;
    case 'banana':
    case 'cavendish': {
      // Iconic curved pixel banana!
      const isCav = art.kind === 'cavendish';
      if (isCav) {
        // Golden aura rays behind Cavendish
        ctx.fillStyle = '#ffe57f';
        for (let i = 0; i < 6; i++) {
          ctx.fillRect(ox + 14 + i * 8, oy + 14, 3, 66);
        }
      }
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 24, oy + 20, 24, 52);
      ctx.fillStyle = isCav ? '#ffcf26' : '#f5d742';
      ctx.fillRect(ox + 26, oy + 26, 16, 40);
      ctx.fillRect(ox + 34, oy + 22, 12, 14);
      ctx.fillRect(ox + 22, oy + 52, 14, 16);
      ctx.fillStyle = '#fff5a8';
      ctx.fillRect(ox + 28, oy + 30, 5, 24);
      ctx.fillStyle = '#5c4218';
      ctx.fillRect(ox + 41, oy + 18, 6, 7);
      ctx.fillRect(ox + 22, oy + 68, 5, 4);
      break;
    }
    case 'dagger':
      // Ornate curved ritual blade
      ctx.fillStyle = '#cfd8e3';
      ctx.fillRect(ox + 32, oy + 16, 7, 42);
      ctx.fillRect(ox + 34, oy + 12, 3, 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + 33, oy + 18, 2, 36);
      ctx.fillStyle = '#f3b958';
      ctx.fillRect(ox + 22, oy + 56, 27, 6);
      ctx.fillStyle = '#8f2438';
      ctx.fillRect(ox + 32, oy + 62, 7, 16);
      drawPixelCircle(ctx, ox + 35, oy + 79, 4, '#f3b958', OUTLINE);
      break;
    case 'dna':
      for (let i = 0; i < 12; i++) {
        const y = oy + 16 + i * 5;
        const dx = Math.round(Math.sin(i * 0.7) * 14);
        ctx.fillStyle = '#567891';
        ctx.fillRect(ox + 35 - Math.abs(dx), y + 1, Math.abs(dx) * 2, 2);
        drawPixelCircle(ctx, ox + 35 + dx, y + 1, 3, '#38e8c6', OUTLINE);
        drawPixelCircle(ctx, ox + 35 - dx, y + 1, 3, '#fe5f55', OUTLINE);
      }
      break;
    case 'space':
      // Astronaut helmet with starry visor
      drawPixelCircle(ctx, ox + 35, oy + 46, 18, '#edf2f7', OUTLINE);
      drawPixelCircle(ctx, ox + 35, oy + 46, 12, '#1f2b4d', OUTLINE);
      ctx.fillStyle = '#6fd3ff';
      ctx.fillRect(ox + 28, oy + 39, 5, 4);
      ctx.fillStyle = '#ffe680';
      ctx.fillRect(ox + 38, oy + 43, 2, 2);
      ctx.fillRect(ox + 33, oy + 50, 2, 2);
      break;
    case 'bus':
      // Retro yellow bus front
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 15, oy + 22, 41, 52);
      ctx.fillStyle = '#f5b82e';
      ctx.fillRect(ox + 17, oy + 24, 37, 46);
      ctx.fillStyle = '#7cd4ff';
      ctx.fillRect(ox + 21, oy + 30, 29, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + 21, oy + 55, 6, 6);
      ctx.fillRect(ox + 44, oy + 55, 6, 6);
      ctx.fillStyle = '#374244';
      ctx.fillRect(ox + 29, oy + 55, 13, 6);
      ctx.fillRect(ox + 19, oy + 72, 7, 6);
      ctx.fillRect(ox + 45, oy + 72, 7, 6);
      break;
    case 'stuntman':
      // Racing stunt helmet with red stripe & star
      drawPixelCircle(ctx, ox + 35, oy + 47, 18, '#ffffff', OUTLINE);
      ctx.fillStyle = '#fe5f55';
      ctx.fillRect(ox + 32, oy + 29, 7, 36);
      ctx.fillStyle = '#1b2638';
      ctx.fillRect(ox + 21, oy + 42, 29, 11);
      ctx.fillStyle = '#69baff';
      ctx.fillRect(ox + 23, oy + 44, 9, 4);
      break;
    case 'egg':
      drawPixelCircle(ctx, ox + 35, oy + 52, 16, '#fff8e1', OUTLINE);
      drawPixelCircle(ctx, ox + 35, oy + 42, 13, '#fff8e1', OUTLINE);
      drawPixelCircle(ctx, ox + 35, oy + 50, 14, '#fff8e1');
      ctx.fillStyle = '#f5d27a';
      ctx.fillRect(ox + 38, oy + 44, 6, 14);
      break;
    case 'constellation':
      ctx.fillStyle = '#70a9ff';
      ctx.fillRect(ox + 20, oy + 30, 16, 1);
      ctx.fillRect(ox + 36, oy + 30, 1, 22);
      ctx.fillRect(ox + 36, oy + 52, 15, 1);
      ctx.fillRect(ox + 22, oy + 62, 15, 1);
      for (const [sx, sy] of [
        [20, 30],
        [36, 30],
        [36, 52],
        [51, 52],
        [22, 62],
        [48, 24],
      ]) {
        drawPixelCircle(ctx, ox + sx, oy + sy, 3, '#ffe680', '#ffffff');
      }
      break;
    case 'hologram':
      for (let y = 14; y < 82; y += 3) {
        ctx.fillStyle = y % 6 === 0 ? 'rgba(46,242,255,0.45)' : 'rgba(46,242,255,0.18)';
        ctx.fillRect(ox + 12, oy + y, 47, 1);
      }
      drawJesterPortrait(ctx, ox, oy, '#00e5ff', '#70ffff', '#b8ffff', '#00aacc', '#ffffff');
      break;
    case 'bones':
      // Friendly pixel skull in tuxedo
      drawPixelCircle(ctx, ox + 35, oy + 40, 14, '#f5f2eb', OUTLINE);
      ctx.fillStyle = '#f5f2eb';
      ctx.fillRect(ox + 27, oy + 48, 17, 10);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 27, oy + 37, 6, 6);
      ctx.fillRect(ox + 38, oy + 37, 6, 6);
      ctx.fillRect(ox + 34, oy + 45, 3, 4);
      for (let t = 0; t < 4; t++) ctx.fillRect(ox + 28 + t * 4, oy + 53, 2, 5);
      // Bow tie
      ctx.fillStyle = '#fe5f55';
      ctx.fillRect(ox + 26, oy + 64, 19, 6);
      break;
    case 'icecream':
      // Waffle cone + pastel scoops
      ctx.fillStyle = '#d9984a';
      ctx.fillRect(ox + 26, oy + 54, 19, 10);
      ctx.fillRect(ox + 29, oy + 64, 13, 10);
      ctx.fillRect(ox + 32, oy + 74, 7, 8);
      drawPixelCircle(ctx, ox + 35, oy + 45, 13, '#ff85b3', OUTLINE);
      drawPixelCircle(ctx, ox + 35, oy + 31, 11, '#fff3b0', OUTLINE);
      drawPixelCircle(ctx, ox + 35, oy + 20, 4, '#fe5f55', OUTLINE);
      break;
    case 'blackboard':
      ctx.fillStyle = '#182b22';
      ctx.fillRect(ox + 11, oy + 15, 49, 65);
      drawPixelText(ctx, 'X3', ox + 35, oy + 30, 2, '#ffffff', { align: 'center' });
      drawSuitIcon(ctx, 'Spades', ox + 26, oy + 60, 'md', '#ffffff');
      drawSuitIcon(ctx, 'Clubs', ox + 45, oy + 60, 'md', '#ffffff');
      break;
    case 'steel':
      drawJesterPortrait(ctx, ox, oy, '#6c7c8c', '#b0bec9', '#dce4eb', '#52606d', '#22292d');
      break;
    case 'fibonacci':
      drawPixelText(ctx, '1,1', ox + 35, oy + 22, 2, '#d97b29', { align: 'center' });
      drawPixelText(ctx, '2,3', ox + 35, oy + 42, 2, '#2b5973', { align: 'center' });
      drawPixelText(ctx, '5,8', ox + 35, oy + 62, 2, '#fe5f55', { align: 'center' });
      break;
    case 'scholar':
      // Graduation cap + Ace scroll
      ctx.fillStyle = '#22292d';
      ctx.fillRect(ox + 16, oy + 28, 39, 8);
      ctx.fillRect(ox + 24, oy + 36, 23, 10);
      ctx.fillStyle = '#f3b958';
      ctx.fillRect(ox + 51, oy + 32, 3, 18);
      drawPixelText(ctx, 'A+', ox + 35, oy + 58, 2, '#fe5f55', { align: 'center', outlineColor: OUTLINE });
      break;
    case 'banner':
      ctx.fillStyle = '#f3b958';
      ctx.fillRect(ox + 18, oy + 16, 35, 52);
      ctx.fillStyle = '#009dff';
      ctx.fillRect(ox + 22, oy + 20, 27, 42);
      drawPixelText(ctx, '+30', ox + 35, oy + 36, 1, '#ffffff', { align: 'center', outlineColor: OUTLINE });
      break;
    case 'splash':
      drawPixelCircle(ctx, ox + 35, oy + 48, 16, '#009dff', OUTLINE);
      drawPixelCircle(ctx, ox + 22, oy + 32, 5, '#69c9ff', OUTLINE);
      drawPixelCircle(ctx, ox + 50, oy + 36, 6, '#69c9ff', OUTLINE);
      drawPixelCircle(ctx, ox + 46, oy + 68, 4, '#ffffff', OUTLINE);
      break;
    case 'photograph':
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + 13, oy + 14, 45, 66);
      ctx.fillStyle = '#374244';
      ctx.fillRect(ox + 17, oy + 18, 37, 42);
      drawPixelCircle(ctx, ox + 35, oy + 38, 11, '#f7d5b5', OUTLINE);
      ctx.fillStyle = '#fe5f55';
      ctx.fillRect(ox + 31, oy + 43, 9, 3);
      drawPixelText(ctx, 'X2', ox + 35, oy + 66, 1, '#22292d', { align: 'center' });
      break;
    case 'bull':
      drawPixelCircle(ctx, ox + 35, oy + 52, 16, '#7a442d', OUTLINE);
      ctx.fillStyle = '#f5eedc';
      ctx.fillRect(ox + 13, oy + 28, 9, 10);
      ctx.fillRect(ox + 49, oy + 28, 9, 10);
      drawPixelCircle(ctx, ox + 35, oy + 62, 5, '#f3b958', OUTLINE);
      break;
    case 'cat':
      drawPixelCircle(ctx, ox + 35, oy + 50, 16, '#ffffff', OUTLINE);
      ctx.fillStyle = '#fe5f55';
      ctx.fillRect(ox + 21, oy + 28, 7, 10);
      ctx.fillRect(ox + 43, oy + 28, 7, 10);
      drawPixelCircle(ctx, ox + 35, oy + 67, 6, '#f3b958', OUTLINE);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 29, oy + 46, 3, 4);
      ctx.fillRect(ox + 39, oy + 46, 3, 4);
      break;
    case 'legendary':
      // Majestic golden-framed Legendary Jester with crown halo
      drawPixelCircle(ctx, ox + 35, oy + 44, 24, 'rgba(243,185,88,0.28)');
      drawJesterPortrait(ctx, ox, oy, art.accent, '#f3b958', '#fff8eb', '#b26cbb', '#fe5f55');
      ctx.fillStyle = '#ffe680';
      ctx.fillRect(ox + 29, oy + 11, 13, 5);
      break;
  }
}

function buildJokersAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.Joker;
  const [canvas, ctx] = createCanvas(spec.cols * spec.cellW, spec.rows * spec.cellH);

  const iconicMap = new Map<string, NamedJokerArt>();
  for (const item of ICONIC_JOKERS) {
    iconicMap.set(`${item.gx},${item.gy}`, item);
  }

  const bgPalette = [
    '#f4efe4', '#e8f3ff', '#ffeceb', '#eaf7ee', '#f3ebff',
    '#fff5dc', '#242c38', '#2c1f36', '#1e3832', '#382226',
  ];
  const primaryPalette = [
    '#fe5f55', '#009dff', '#4bc292', '#f3b958', '#b26cbb',
    '#fda200', '#3a86e8', '#e84393', '#2ec4b6', '#ff6b6b',
  ];

  for (let gy = 0; gy < spec.rows; gy++) {
    for (let gx = 0; gx < spec.cols; gx++) {
      const ox = gx * spec.cellW;
      const oy = gy * spec.cellH;
      const iconic = iconicMap.get(`${gx},${gy}`);
      if (iconic) {
        drawIconicJokerCell(ctx, ox, oy, iconic);
        continue;
      }

      // Rich deterministic pixel-art portrait for every other slot in the 10x16 grid
      const h1 = hash2i(gx, gy, 11);
      const h2 = hash2i(gx, gy, 29);
      const h3 = hash2i(gx, gy, 47);
      const bg = bgPalette[Math.floor(h1 * bgPalette.length)]!;
      const c1 = primaryPalette[Math.floor(h2 * primaryPalette.length)]!;
      const c2 = primaryPalette[Math.floor(h3 * primaryPalette.length)]!;
      const style = Math.floor(hash2i(gx, gy, 71) * 4);

      drawCardBase(ctx, ox, oy, bg, 'rgba(0,0,0,0.14)', OUTLINE, c1);

      if (style === 0) {
        // Expressive Jester character variant
        drawJesterPortrait(ctx, ox, oy, c1, c2, '#fff9ee', c2, c1);
      } else if (style === 1) {
        // Heraldic Joker Crest + Crown + Suit
        drawPixelCircle(ctx, ox + 35, oy + 46, 18, c1, OUTLINE);
        drawPixelCircle(ctx, ox + 35, oy + 46, 12, '#faf6ee', OUTLINE);
        const suit = CARD_ROW_SUITS[(gx + gy) % 4]!;
        drawSuitIcon(ctx, suit, ox + 35, oy + 46, 'md', c2);
        ctx.fillStyle = '#f3b958';
        ctx.fillRect(ox + 26, oy + 19, 19, 6);
        ctx.fillRect(ox + 26, oy + 15, 4, 4);
        ctx.fillRect(ox + 33, oy + 14, 5, 5);
        ctx.fillRect(ox + 41, oy + 15, 4, 4);
      } else if (style === 2) {
        // Geometric Arcane Token / Relic
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(ox + 18, oy + 22, 35, 48);
        ctx.fillStyle = c1;
        ctx.fillRect(ox + 20, oy + 24, 31, 44);
        ctx.fillStyle = c2;
        ctx.fillRect(ox + 26, oy + 30, 19, 32);
        drawPixelCircle(ctx, ox + 35, oy + 46, 8, '#ffffff', OUTLINE);
        drawPixelCircle(ctx, ox + 35, oy + 46, 4, c1);
      } else {
        // Quirky Pixel Mask / Totem
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(ox + 19, oy + 23, 33, 46);
        ctx.fillStyle = c2;
        ctx.fillRect(ox + 21, oy + 25, 29, 42);
        ctx.fillStyle = c1;
        ctx.fillRect(ox + 21, oy + 25, 29, 14);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ox + 26, oy + 40, 6, 6);
        ctx.fillRect(ox + 39, oy + 40, 6, 6);
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(ox + 28, oy + 42, 3, 3);
        ctx.fillRect(ox + 41, oy + 42, 3, 3);
        ctx.fillRect(ox + 27, oy + 54, 17, 4);
      }

      // Crisp corner sparkle
      ctx.fillStyle = '#f3b958';
      ctx.fillRect(ox + 10, oy + 10, 3, 3);
      ctx.fillRect(ox + 58, oy + 82, 3, 3);
    }
  }

  return canvas;
}

// ---------------------------------------------------------------------------
// 4. Tarot / Planet / Spectral Atlas (`Tarot`, 10x6 @ 71x95)
// ---------------------------------------------------------------------------

function buildTarotsAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.Tarot;
  const [canvas, ctx] = createCanvas(spec.cols * spec.cellW, spec.rows * spec.cellH);

  const planetColors = [
    ['#a89f91', '#d6cfc2'], // Mercury
    ['#e8b86d', '#fff0b3'], // Venus
    ['#2e86de', '#4bc292'], // Earth
    ['#e0563c', '#ff997a'], // Mars
    ['#d99352', '#f7d6a8'], // Jupiter
    ['#e6c36e', '#fff2ba'], // Saturn
    ['#6fd3eb', '#c7f5ff'], // Uranus
    ['#3867d6', '#70a1ff'], // Neptune
    ['#8d7b91', '#d2c4d6'], // Pluto
    ['#4f31b9', '#b89eff'], // Black Hole / Secret
  ];

  for (let gy = 0; gy < spec.rows; gy++) {
    for (let gx = 0; gx < spec.cols; gx++) {
      const ox = gx * spec.cellW;
      const oy = gy * spec.cellH;

      const isPlanet =
        (gy === 3 && gx <= 8) || (gy === 2 && (gx === 3 || gx === 8 || gx === 9));
      const isSpectral = gy >= 4 || (gy === 2 && gx === 2) || (gy === 3 && gx === 9);

      if (isPlanet) {
        // Cosmic deep-space Planet card
        drawCardBase(ctx, ox, oy, '#142038', '#0a1224', '#080e1a', '#5ac8fa');
        // Starfield
        for (let s = 0; s < 14; s++) {
          const sx = 10 + Math.floor(hash2i(gx * 10 + s, gy, 3) * 51);
          const sy = 10 + Math.floor(hash2i(gx * 10 + s, gy, 7) * 75);
          ctx.fillStyle = s % 3 === 0 ? '#ffe680' : '#ffffff';
          ctx.fillRect(ox + sx, oy + sy, 1, 1);
        }
        const [p1, p2] = planetColors[gx % planetColors.length]!;
        drawPixelCircle(ctx, ox + 35, oy + 47, 17, p1, OUTLINE);
        // Atmosphere bands
        ctx.fillStyle = p2;
        ctx.fillRect(ox + 22, oy + 40, 26, 4);
        ctx.fillRect(ox + 24, oy + 50, 22, 3);
        // Rings on Saturn / Uranus / Planet X
        if (gx === 5 || gx === 6 || gy === 2) {
          ctx.fillStyle = '#ffe8a3';
          ctx.fillRect(ox + 10, oy + 46, 51, 3);
          ctx.fillStyle = p1;
          ctx.fillRect(ox + 21, oy + 46, 29, 3);
        }
        drawPixelText(ctx, 'LVL+', ox + 35, oy + 76, 1, '#7ce3ff', { align: 'center' });
      } else if (isSpectral) {
        // Ethereal Spectral card
        drawCardBase(ctx, ox, oy, '#1d1c42', '#100f29', '#09091c', '#4fa8ff');
        // Glowing mystic aura
        drawPixelCircle(ctx, ox + 35, oy + 46, 20, 'rgba(79,168,255,0.22)');
        drawPixelCircle(ctx, ox + 35, oy + 46, 13, '#63c5ff', '#ffffff');
        drawPixelCircle(ctx, ox + 35, oy + 46, 7, '#1d1c42');
        // Ghostly flames
        ctx.fillStyle = '#b5e8ff';
        ctx.fillRect(ox + 33, oy + 19, 5, 11);
        ctx.fillRect(ox + 21, oy + 44, 7, 4);
        ctx.fillRect(ox + 43, oy + 44, 7, 4);
        if (gy === 2 && gx === 2) {
          // The Soul gem!
          drawPixelCircle(ctx, ox + 35, oy + 46, 14, '#b26cbb', '#ffe680');
          drawPixelCircle(ctx, ox + 35, oy + 46, 8, '#ffe680', '#ffffff');
        } else if (gy === 3 && gx === 9) {
          // Black Hole
          drawPixelCircle(ctx, ox + 35, oy + 46, 16, '#ff8c42', '#ffe066');
          drawPixelCircle(ctx, ox + 35, oy + 46, 11, '#090912', '#c864ff');
        }
      } else {
        // Warm occult Parchment Tarot card
        drawCardBase(ctx, ox, oy, '#ede0c8', '#cfbda0', '#3b2b20', '#9e6b43');
        const accent =
          ['#8867a5', '#c75985', '#4bc292', '#009dff', '#fe5f55', '#e29000'][(gx + gy * 3) % 6]!;
        ctx.fillStyle = '#3b2b20';
        ctx.fillRect(ox + 15, oy + 16, 41, 56);
        ctx.fillStyle = accent;
        ctx.fillRect(ox + 17, oy + 18, 37, 52);
        // Occult diamond / sun / moon motif
        drawPixelCircle(ctx, ox + 35, oy + 44, 12, '#f5d782', '#3b2b20');
        drawPixelCircle(ctx, ox + 35, oy + 44, 6, '#faf2dc');
        ctx.fillStyle = '#3b2b20';
        ctx.fillRect(ox + 34, oy + 22, 3, 8);
        ctx.fillRect(ox + 34, oy + 58, 3, 8);
        // Roman numeral bar
        const romans = [
          '0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX',
          'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX',
          'XX', 'XXI',
        ];
        const idx = gy * 10 + gx;
        drawPixelText(ctx, romans[idx] ?? 'X', ox + 35, oy + 78, 1, '#3b2b20', { align: 'center' });
      }
    }
  }

  return canvas;
}

// ---------------------------------------------------------------------------
// 5. Voucher Atlas (`Voucher`, 9x4 @ 71x95)
// ---------------------------------------------------------------------------

function buildVouchersAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.Voucher;
  const [canvas, ctx] = createCanvas(spec.cols * spec.cellW, spec.rows * spec.cellH);
  const colors = ['#cb724c', '#7b5ca8', '#3c8c78', '#3c6eb8', '#b84c65', '#c99334', '#4f7a42', '#70584a', '#99476b'];

  for (let gy = 0; gy < spec.rows; gy++) {
    for (let gx = 0; gx < spec.cols; gx++) {
      const ox = gx * spec.cellW;
      const oy = gy * spec.cellH;
      const isTier2 = gy % 2 === 1;
      const baseColor = colors[gx % colors.length]!;
      const trim = isTier2 ? '#ffd866' : '#f2e8d5';

      drawCardBase(ctx, ox, oy, baseColor, 'rgba(0,0,0,0.2)', OUTLINE, trim);
      // Ticket notches on left and right edges
      ctx.clearRect(ox, oy + 42, 5, 11);
      ctx.clearRect(ox + 66, oy + 42, 5, 11);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 5, oy + 42, 2, 11);
      ctx.fillRect(ox + 64, oy + 42, 2, 11);

      // Emblem medallion
      drawPixelCircle(ctx, ox + 35, oy + 40, 15, trim, OUTLINE);
      drawPixelCircle(ctx, ox + 35, oy + 40, 10, isTier2 ? '#22292d' : '#ffffff');
      drawPixelText(ctx, isTier2 ? 'II' : 'I', ox + 35, oy + 37, 2, isTier2 ? '#ffd866' : baseColor, {
        align: 'center',
      });
      drawPixelText(ctx, 'VOUCHER', ox + 35, oy + 72, 1, '#ffffff', {
        align: 'center',
        shadowColor: OUTLINE,
      });
    }
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// 6. Booster Pack Atlas (`Booster`, 4x9 @ 71x95)
// ---------------------------------------------------------------------------

function buildBoostersAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.Booster;
  const [canvas, ctx] = createCanvas(spec.cols * spec.cellW, spec.rows * spec.cellH);

  // Row theme matches oracle.json booster positions
  const rowThemes: Array<{ bg: string; stripe: string; label: string; badge: string }> = [
    { bg: '#6e4c9e', stripe: '#b892ff', label: 'ARCANA', badge: 'T' }, // row 0: Arcana Normal
    { bg: '#1e589e', stripe: '#6fd3ff', label: 'PLANET', badge: 'P' }, // row 1: Celestial Normal
    { bg: '#5a368a', stripe: '#ffd166', label: 'ARCANA', badge: '+' }, // row 2: Arcana Jumbo/Mega
    { bg: '#153d7a', stripe: '#ffd166', label: 'PLANET', badge: '+' }, // row 3: Celestial Jumbo/Mega
    { bg: '#262b63', stripe: '#70f3ff', label: 'SPECTRA', badge: 'S' }, // row 4: Spectral
    { bg: '#3e5c76', stripe: '#a3cef1', label: 'PACK', badge: '*' }, // row 5: Spare
    { bg: '#b83b3b', stripe: '#ff9b85', label: 'DECK', badge: 'A' }, // row 6: Standard Normal
    { bg: '#942626', stripe: '#ffd166', label: 'DECK', badge: '+' }, // row 7: Standard Jumbo/Mega
    { bg: '#d97b29', stripe: '#ffe066', label: 'BUFFOON', badge: 'J' }, // row 8: Buffoon
  ];

  for (let gy = 0; gy < spec.rows; gy++) {
    const theme = rowThemes[gy]!;
    for (let gx = 0; gx < spec.cols; gx++) {
      const ox = gx * spec.cellW;
      const oy = gy * spec.cellH;

      // Metallic foil wrapper with crimped top & bottom seals
      drawCardBase(ctx, ox, oy, theme.bg, 'rgba(0,0,0,0.22)', OUTLINE);
      ctx.fillStyle = '#d9e0e6';
      ctx.fillRect(ox + 4, oy + 4, 63, 7);
      ctx.fillRect(ox + 4, oy + 84, 63, 7);
      ctx.fillStyle = '#8b99a6';
      for (let x = 6; x < 65; x += 4) {
        ctx.fillRect(ox + x, oy + 4, 2, 7);
        ctx.fillRect(ox + x, oy + 84, 2, 7);
      }

      // Diagonal foil gloss band
      ctx.fillStyle = theme.stripe;
      ctx.fillRect(ox + 6, oy + 20, 59, 6);
      ctx.fillRect(ox + 6, oy + 69, 59, 5);

      // Center crest
      drawPixelCircle(ctx, ox + 35, oy + 46, 17, '#ffffff', OUTLINE);
      drawPixelCircle(ctx, ox + 35, oy + 46, 13, theme.bg);
      drawPixelText(ctx, theme.badge, ox + 35, oy + 39, 2, '#ffe066', {
        align: 'center',
        outlineColor: OUTLINE,
      });
      drawPixelText(ctx, theme.label, ox + 35, oy + 71, 1, '#ffffff', {
        align: 'center',
        outlineColor: OUTLINE,
      });
    }
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// 7. Blind Chips Atlas (`BlindChips`, 21x31 @ 34x34)
// 21-frame smooth spinning animated poker chip for every Blind!
// ---------------------------------------------------------------------------

function buildBlindChipsAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.BlindChips;
  const [canvas, ctx] = createCanvas(spec.cols * spec.cellW, spec.rows * spec.cellH);

  // Row colors matching oracle.json blinds
  const rowColors = [
    '#3c6eb8', // 0 Small Blind
    '#e0952b', // 1 Big Blind
    '#b95b08', // 2 The Ox
    '#5186a8', // 3 The House
    '#b9cb92', // 4 The Club
    '#3e85bd', // 5 The Fish
    '#a9a295', // 6 The Window
    '#a84024', // 7 The Hook
    '#575757', // 8 The Manacle
    '#8a59a5', // 9 The Wall
    '#50bf7c', // 10 The Wheel
    '#6865f3', // 11 The Arm
    '#efc03c', // 12 The Psychic
    '#b95c96', // 13 The Goad
    '#82b8d9', // 14 The Water
    '#439a4f', // 15 The Serpent
    '#7e6752', // 16 The Pillar
    '#4b71e4', // 17 The Eye
    '#ae718e', // 18 The Mouth
    '#709284', // 19 The Plant
    '#5c6e31', // 20 The Needle
    '#ac9db4', // 21 The Head
    '#b52d2d', // 22 The Tooth
    '#6a3847', // 23 The Mark
    '#e56a2f', // 24 The Flint
    '#ac3232', // 25 Crimson Heart
    '#009cfd', // 26 Cerulean Bell
    '#fda200', // 27 Amber Acorn
    '#56a786', // 28 Verdant Leaf
    '#8a71e1', // 29 Violet Vessel
    '#4f6367', // 30 Extra
  ];

  const glyphs = [
    'S', 'B', 'O', 'H', 'C', 'F', 'W', 'K', 'M', 'W',
    '%', 'A', 'P', 'G', '~', 'S', 'I', 'E', 'U', 'L',
    '1', 'H', '$', '?', 'X', 'H', 'B', 'A', 'L', 'V', '*',
  ];

  for (let gy = 0; gy < spec.rows; gy++) {
    const color = rowColors[gy % rowColors.length]!;
    const glyph = glyphs[gy % glyphs.length]!;
    for (let gx = 0; gx < spec.cols; gx++) {
      const ox = gx * spec.cellW;
      const oy = gy * spec.cellH;
      const cx = ox + 17;
      const cy = oy + 17;
      const angle = (gx / spec.cols) * Math.PI * 2;

      // Outer chip disc
      drawPixelCircle(ctx, cx, cy, 14, color, OUTLINE);
      // 6 rotating white edge notches around the rim
      ctx.fillStyle = '#ffffff';
      for (let k = 0; k < 6; k++) {
        const a = angle + (k * Math.PI) / 3;
        const nx = Math.round(cx + Math.cos(a) * 11.5);
        const ny = Math.round(cy + Math.sin(a) * 11.5);
        ctx.fillRect(nx - 1, ny - 1, 3, 3);
      }
      // Inner medallion
      drawPixelCircle(ctx, cx, cy, 9, '#faf6ee', OUTLINE);
      drawPixelCircle(ctx, cx, cy, 7, color);
      drawPixelText(ctx, glyph, cx, cy - 3, 1, '#ffffff', {
        align: 'center',
        shadowColor: OUTLINE,
      });
    }
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// 8. Tags Atlas (`tags`, 6x5 @ 34x34)
// ---------------------------------------------------------------------------

function buildTagsAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.tags;
  const [canvas, ctx] = createCanvas(spec.cols * spec.cellW, spec.rows * spec.cellH);
  const colors = ['#4bc292', '#fe5f55', '#374244', '#009dff', '#f3b958', '#b26cbb'];
  const icons = ['U', 'R', 'N', 'F', '$', '2', 'H', 'P', '$', 'V', '+', 'J', 'B', 'S', 'C', 'M', 'J', 'O', '>', 'H', 'G', 'E', '$', '6'];

  for (let gy = 0; gy < spec.rows; gy++) {
    for (let gx = 0; gx < spec.cols; gx++) {
      const ox = gx * spec.cellW;
      const oy = gy * spec.cellH;
      const color = colors[(gx + gy * 2) % colors.length]!;
      const idx = gy * spec.cols + gx;

      // Heraldic badge shield
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 4, oy + 4, 26, 20);
      ctx.fillRect(ox + 7, oy + 24, 20, 4);
      ctx.fillRect(ox + 11, oy + 28, 12, 3);

      ctx.fillStyle = color;
      ctx.fillRect(ox + 6, oy + 6, 22, 18);
      ctx.fillRect(ox + 9, oy + 24, 16, 3);
      ctx.fillRect(ox + 13, oy + 27, 8, 2);

      // White inner rim
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + 8, oy + 8, 18, 2);
      drawPixelText(ctx, icons[idx % icons.length]!, ox + 17, oy + 13, 1, '#ffffff', {
        align: 'center',
        outlineColor: OUTLINE,
      });
    }
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// 9. Stickers Atlas (`stickers`, 5x3 @ 71x95)
// Eternal (0,0), Perishable (0,2), Rental (1,2), plus stake badges
// ---------------------------------------------------------------------------

function buildStickersAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.stickers;
  const [canvas, ctx] = createCanvas(spec.cols * spec.cellW, spec.rows * spec.cellH);

  const drawStickerBadge = (
    gx: number,
    gy: number,
    bg: string,
    rim: string,
    glyph: string,
    bx = 16,
    by = 17
  ) => {
    const ox = gx * spec.cellW;
    const oy = gy * spec.cellH;
    drawPixelCircle(ctx, ox + bx, oy + by, 10, rim, OUTLINE);
    drawPixelCircle(ctx, ox + bx, oy + by, 8, bg);
    drawPixelText(ctx, glyph, ox + bx, oy + by - 3, 1, '#ffffff', {
      align: 'center',
      outlineColor: OUTLINE,
    });
  };

  // Eternal (0,0) - magenta infinity badge
  drawStickerBadge(0, 0, PALETTE.ETERNAL, '#f29bc0', 'E', 15, 16);
  // Stake win stickers across row 0/1
  drawStickerBadge(1, 0, '#e8e8e8', '#ffffff', '1', 56, 16);
  drawStickerBadge(2, 0, '#fe5f55', '#ff9b94', '2', 56, 16);
  drawStickerBadge(3, 0, '#4bc292', '#8cf2c8', '3', 56, 16);
  drawStickerBadge(4, 0, '#374244', '#7f9399', '4', 56, 16);
  drawStickerBadge(0, 1, '#009dff', '#80d0ff', '5', 56, 16);
  drawStickerBadge(1, 1, '#8867a5', '#c8a6e8', '6', 56, 16);
  drawStickerBadge(2, 1, '#fda200', '#ffd27a', '7', 56, 16);
  drawStickerBadge(3, 1, '#f3b958', '#fff0a6', '8', 56, 16);

  // Perishable (0,2) - cobalt hourglass badge
  drawStickerBadge(0, 2, PALETTE.PERISHABLE, '#95acff', 'P', 15, 39);
  // Rental (1,2) - gold dollar tag badge
  drawStickerBadge(1, 2, PALETTE.RENTAL, '#ffe28a', '$', 15, 62);

  return canvas;
}

// ---------------------------------------------------------------------------
// 10. Stake Chips (`chips`, 5x2 @ 29x29)
// ---------------------------------------------------------------------------

function buildChipsAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.chips;
  const [canvas, ctx] = createCanvas(spec.cols * spec.cellW, spec.rows * spec.cellH);
  const stakes = [
    { gx: 0, gy: 0, fill: '#f0f0f0', rim: '#c4cdd4', label: '1' }, // White
    { gx: 1, gy: 0, fill: '#fe5f55', rim: '#ffaba6', label: '2' }, // Red
    { gx: 2, gy: 0, fill: '#4bc292', rim: '#99f0cc', label: '3' }, // Green
    { gx: 4, gy: 0, fill: '#374244', rim: '#8fa3a8', label: '4' }, // Black
    { gx: 3, gy: 0, fill: '#009dff', rim: '#80d0ff', label: '5' }, // Blue
    { gx: 0, gy: 1, fill: '#8867a5', rim: '#cfaef0', label: '6' }, // Purple
    { gx: 1, gy: 1, fill: '#fda200', rim: '#ffd580', label: '7' }, // Orange
    { gx: 2, gy: 1, fill: '#f3b958', rim: '#fff2a6', label: '8' }, // Gold
  ];
  for (const st of stakes) {
    const cx = st.gx * spec.cellW + 14;
    const cy = st.gy * spec.cellH + 14;
    drawPixelCircle(ctx, cx, cy, 12, st.fill, OUTLINE);
    drawPixelCircle(ctx, cx, cy, 7, st.rim, OUTLINE);
    drawPixelText(ctx, st.label, cx, cy - 3, 1, st.label === '1' ? OUTLINE : '#ffffff', {
      align: 'center',
    });
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// 11. Animated Neon Shop Sign (`shop_sign`, 4x1 @ 113x57)
// ---------------------------------------------------------------------------

function buildShopSignAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.shop_sign;
  const [canvas, ctx] = createCanvas(spec.cols * spec.cellW, spec.rows * spec.cellH);

  for (let frame = 0; frame < 4; frame++) {
    const ox = frame * spec.cellW;
    // Beveled marquee backing
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 2, 2, 109, 53);
    ctx.fillStyle = '#381e2b';
    ctx.fillRect(ox + 5, 5, 103, 47);

    // Chasing neon border bulbs
    for (let i = 0; i < 16; i++) {
      const lit = (i + frame) % 2 === 0;
      const bulbCol = lit ? '#ffdf6b' : '#7a4d2b';
      const bx = ox + 7 + i * 6;
      ctx.fillStyle = bulbCol;
      ctx.fillRect(bx, 7, 3, 3);
      ctx.fillRect(bx, 47, 3, 3);
    }

    // Glowing "SHOP" pixel letters
    const glowColor = frame % 2 === 0 ? '#fe5f55' : '#ff8c66';
    drawPixelText(ctx, 'SHOP', ox + 56, 17, 3, glowColor, {
      align: 'center',
      outlineColor: '#ffe082',
      shadowColor: '#1a0c14',
      letterSpacing: 2,
    });
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// 12. UI Assets (`ui_1`, `ui_2`, 4x2 @ 18x18) & Icons (`icons`, 4x4 @ 66x66)
// ---------------------------------------------------------------------------

function buildUiAtlas(highContrast: boolean): HTMLCanvasElement {
  const spec = highContrast ? ATLAS_SPECS.ui_2 : ATLAS_SPECS.ui_1;
  const [canvas, ctx] = createCanvas(spec.cols * spec.cellW, spec.rows * spec.cellH);
  const suits = highContrast ? PALETTE.SUITS_HIGH_CONTRAST : PALETTE.SUITS_DEFAULT;
  const order: Suit[] = ['Hearts', 'Clubs', 'Diamonds', 'Spades'];
  for (let i = 0; i < 4; i++) {
    drawSuitIcon(ctx, order[i]!, i * 18 + 9, 9, 'md', suits[order[i]!]);
  }
  // Row 1: coin, chip, star, lock
  drawPixelCircle(ctx, 9, 27, 6, '#f3b958', OUTLINE);
  drawPixelCircle(ctx, 27, 27, 6, '#009dff', OUTLINE);
  drawPixelCircle(ctx, 45, 27, 6, '#fe5f55', OUTLINE);
  drawPixelCircle(ctx, 63, 27, 6, '#4bc292', OUTLINE);
  return canvas;
}

function buildIconsAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.icons;
  const [canvas, ctx] = createCanvas(spec.cols * spec.cellW, spec.rows * spec.cellH);
  const palette = ['#fe5f55', '#009dff', '#f3b958', '#4bc292'];
  for (let gy = 0; gy < spec.rows; gy++) {
    for (let gx = 0; gx < spec.cols; gx++) {
      const cx = gx * spec.cellW + 33;
      const cy = gy * spec.cellH + 33;
      drawPixelCircle(ctx, cx, cy, 24, palette[(gx + gy) % 4]!, OUTLINE);
      drawPixelCircle(ctx, cx, cy, 16, '#faf6ee', OUTLINE);
      drawSuitIcon(ctx, CARD_ROW_SUITS[(gx + gy) % 4]!, cx, cy, 'lg', palette[(gx + gy) % 4]!);
    }
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// Public Browser Generator (cached per session)
// ---------------------------------------------------------------------------

let cachedAtlases: Record<AtlasKey, HTMLCanvasElement> | null = null;

export function generateBuiltinAtlases(): Record<AtlasKey, HTMLCanvasElement> {
  if (cachedAtlases) return cachedAtlases;
  if (typeof document === 'undefined') {
    throw new Error('generateBuiltinAtlases() can only run in a browser environment.');
  }

  cachedAtlases = {
    cards_1: buildPlayingCardsAtlas(false),
    cards_2: buildPlayingCardsAtlas(true),
    centers: buildCentersAtlas(),
    Joker: buildJokersAtlas(),
    Tarot: buildTarotsAtlas(),
    Voucher: buildVouchersAtlas(),
    Booster: buildBoostersAtlas(),
    BlindChips: buildBlindChipsAtlas(),
    tags: buildTagsAtlas(),
    stickers: buildStickersAtlas(),
    chips: buildChipsAtlas(),
    ui_1: buildUiAtlas(false),
    ui_2: buildUiAtlas(true),
    shop_sign: buildShopSignAtlas(),
    icons: buildIconsAtlas(),
  };

  return cachedAtlases;
}

export default BUILTIN_MANIFEST;
