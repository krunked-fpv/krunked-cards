// ============================================================================
// Krunked Cards — Clean-Room Built-In Pixel-Art Atlas Pack
// Generates all 15 crisp pixel-art atlases procedurally in the browser AND
// exposes a Node.js-safe manifest resolver for scripts/verify/verify-assets.ts.
// Full Wave 2 catalog coverage:
//   - All 150 Jokers (149 unique grid cells + Wee sharing 0,0) on light ivory frames
//   - All 22 Tarots, 12 Planets, and 18 Spectrals on the Tarot atlas
//   - All 32 Vouchers (16 Tier-1 / Tier-2 upgraded pairs) on the Voucher atlas
//   - All 32 Boosters across 5 kinds & Normal/Jumbo/Mega sizes on the Booster atlas
//   - All 30 Blinds (21-frame spinning chips with exact bossColor & unique icons)
//   - All 24 Skip Tags with distinct heraldic shields & icons
//   - All 15 Deck Backs, 8 Enhancements, and 4 Wax Seals on the centers atlas
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
const IVORY = '#f7f3ea';
const IVORY_SHADE = '#dad2c2';
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
 * Draw iconic light ivory outer card frame (#f7f3ea) with inner art window (59x83)
 * and 2px trim border so Negative shader ALWAYS inverts to dark obsidian/indigo.
 */
function drawIvoryArtWindow(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  bg: string,
  trim: string,
  pattern: 'none' | 'checker' | 'stripes' | 'rays' | 'stars' | 'grid' | 'dots' = 'none',
  patternColor = 'rgba(255,255,255,0.12)'
): void {
  drawCardBase(ctx, ox, oy, IVORY, IVORY_SHADE, OUTLINE);

  // Inner art window
  const wx = ox + 6;
  const wy = oy + 6;
  const ww = 59;
  const wh = 83;
  ctx.fillStyle = bg;
  ctx.fillRect(wx, wy, ww, wh);

  // Subtle backdrop texture inside art window
  if (pattern !== 'none') {
    ctx.fillStyle = patternColor;
    if (pattern === 'checker') {
      for (let y = 2; y < wh - 2; y += 6) {
        for (let x = 2; x < ww - 2; x += 6) {
          if (((x + y) / 6) % 2 === 0) ctx.fillRect(wx + x, wy + y, 3, 3);
        }
      }
    } else if (pattern === 'stripes') {
      for (let y = 4; y < wh - 3; y += 6) {
        ctx.fillRect(wx + 2, wy + y, ww - 4, 2);
      }
    } else if (pattern === 'rays') {
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(wx + 4 + i * 9, wy + 2, 4, wh - 4);
      }
    } else if (pattern === 'grid') {
      for (let x = 5; x < ww - 2; x += 6) ctx.fillRect(wx + x, wy + 2, 1, wh - 4);
      for (let y = 5; y < wh - 2; y += 6) ctx.fillRect(wx + 2, wy + y, ww - 4, 1);
    } else if (pattern === 'dots') {
      for (let y = 5; y < wh - 4; y += 8) {
        for (let x = 5; x < ww - 4; x += 8) {
          ctx.fillRect(wx + x + ((y >> 3) % 2) * 3, wy + y, 2, 2);
        }
      }
    } else if (pattern === 'stars') {
      for (let s = 0; s < 14; s++) {
        const sx = 4 + Math.floor(hash2i(ox + s, oy, 17) * (ww - 8));
        const sy = 4 + Math.floor(hash2i(ox + s, oy, 31) * (wh - 8));
        ctx.fillRect(wx + sx, wy + sy, s % 4 === 0 ? 2 : 1, s % 4 === 0 ? 2 : 1);
      }
    }
  }

  // Crisp 2px inner window trim
  ctx.fillStyle = trim;
  ctx.fillRect(wx, wy, ww, 2);
  ctx.fillRect(wx, wy + wh - 2, ww, 2);
  ctx.fillRect(wx, wy, 2, wh);
  ctx.fillRect(wx + ww - 2, wy, 2, wh);
}

/**
 * Draw crisp pixel-art sprite from an ASCII bitmap grid with optional auto-outline.
 * '.' or ' ' = transparent. Any other key looks up in palette.
 */
function drawSprite(
  ctx: CanvasRenderingContext2D,
  grid: readonly string[],
  palette: Record<string, string>,
  cx: number,
  cy: number,
  scale = 2,
  outlineColor?: string
): void {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const x0 = Math.round(cx - (cols * scale) / 2);
  const y0 = Math.round(cy - (rows * scale) / 2);

  if (outlineColor) {
    ctx.fillStyle = outlineColor;
    for (let r = 0; r < rows; r++) {
      const line = grid[r]!;
      for (let c = 0; c < cols; c++) {
        const ch = line[c]!;
        if (ch === '.' || ch === ' ') continue;
        const px = x0 + c * scale;
        const py = y0 + r * scale;
        ctx.fillRect(px - scale, py, scale, scale);
        ctx.fillRect(px + scale, py, scale, scale);
        ctx.fillRect(px, py - scale, scale, scale);
        ctx.fillRect(px, py + scale, scale, scale);
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
      ctx.fillStyle = col;
      ctx.fillRect(x0 + c * scale, y0 + r * scale, scale, scale);
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

function drawPixelLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  thickness = 1
): void {
  ctx.fillStyle = color;
  let ix0 = Math.round(x0);
  let iy0 = Math.round(y0);
  const ix1 = Math.round(x1);
  const iy1 = Math.round(y1);
  const dx = Math.abs(ix1 - ix0);
  const dy = Math.abs(iy1 - iy0);
  const sx = ix0 < ix1 ? 1 : -1;
  const sy = iy0 < iy1 ? 1 : -1;
  let err = dx - dy;
  for (let guard = 0; guard < 200; guard++) {
    ctx.fillRect(ix0, iy0, thickness, thickness);
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

function drawSparkle(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, arm = 3): void {
  ctx.fillStyle = color;
  ctx.fillRect(cx - arm, cy, arm * 2 + 1, 1);
  ctx.fillRect(cx, cy - arm, 1, arm * 2 + 1);
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
  const s = size === 'lg' ? 2 : 1;
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

// ---------------------------------------------------------------------------
// Bespoke Pixel Sprite Icon Library (shared by Jokers, Tarots, Vouchers, Blinds, Tags)
// ---------------------------------------------------------------------------

const ICON_SPRITES = {
  crown: [
    'a.....a.....a',
    'aa...aaa...aa',
    'aaa.aaaaa.aaa',
    'aaaaaaaaaaaaa',
    'aabaaacaaabaa',
    'aaaaaaaaaaaaa',
    'ddddddddddddd',
  ],
  skull: [
    '...aaaaaaa...',
    '..aaaaaaaaa..',
    '.aaaaaaaaaaa.',
    '.aa..aaa..aa.',
    '.aa..aaa..aa.',
    '.aaaaa.aaaaa.',
    '..aaaaaaaaa..',
    '...aa.a.aa...',
    '...aa.a.aa...',
  ],
  dagger: [
    '......a......',
    '.....aab.....',
    '.....aab.....',
    '.....aab.....',
    '.....aab.....',
    '.....aab.....',
    '....aaab.....',
    '..ccccccccc..',
    '.....ddd.....',
    '.....dcd.....',
    '.....ddd.....',
    '.....ccc.....',
  ],
  banana: [
    '........dd...',
    '.......dd....',
    '......aaa....',
    '.....aaab....',
    '....aaabb....',
    '...aaabb.....',
    '...aabb......',
    '..aaab.......',
    '..aab........',
    '.aaab........',
    '.aabb........',
    'ddbb.........',
  ],
  popcorn: [
    '..aa.bb.aa...',
    '.aabbaabbaa..',
    'aabbaabbaabb.',
    '.ccwwccwwcc..',
    '.ccwwccwwcc..',
    '..cwwccwwc...',
    '..cwwccwwc...',
    '..cwwccwwc...',
    '...wwccww....',
    '...cccccc....',
  ],
  ramen: [
    '....a..a..a..',
    '...a..a..a...',
    '.....ddddd...',
    '..bbbbbbbbb..',
    '.bbbwwccwbbb.',
    '.bbbbbbbbbbb.',
    'eeeeeeeeeeeee',
    '.eeeeeeeeeee.',
    '..eefffffee..',
    '...eeeeeee...',
    '....eeeee....',
  ],
  icecream: [
    '.....cc......',
    '...bbbbbb....',
    '..bbbbbbbb...',
    '..aaaaaaaa...',
    '.aaaaaaaaaa..',
    '..dddddddd...',
    '...ddeddd....',
    '...dddddd....',
    '....dddd.....',
    '....dddd.....',
    '.....dd......',
  ],
  seltzer: [
    '.......cc....',
    '......ccc....',
    '..aaaaaaaaa..',
    '..abbbbbbba..',
    '..abbwbbbba..',
    '..abbbbwbaa..',
    '..abwbbbbba..',
    '..abbbbbwba..',
    '..abbbbbbba..',
    '...aaaaaaa...',
    '...aaaaaaa...',
  ],
  egg: [
    '....aaaaa....',
    '...aaaaaab...',
    '..aaaaaaaab..',
    '..aawwaaaab..',
    '.aaawwaaaaab.',
    '.aaaaaaaaaab.',
    '.aaaaaaaaabb.',
    '.aaaaaaaaabb.',
    '..aaaaaaabb..',
    '...bbbbbbb...',
  ],
  bean: [
    '....aaaaa....',
    '..aaaaaaaaa..',
    '.aaabbbbaaaa.',
    '.aaabbbbaaaa.',
    'aaaawaaawaaaa',
    'aaaaaaaaaaaaa',
    '.aaaaacaaaaa.',
    '..aaaaaaaaa..',
    '...aaaaaaa...',
  ],
  cola: [
    '..bbbbbbbbb..',
    '.aaaaaaaaaaa.',
    '.aawwwwwwwaa.',
    '.aaawwwwwaaa.',
    '.aaacccccaaa.',
    '.aaaacccaaaa.',
    '.aaaaaaaaaaa.',
    '.aaaaaaaaaaa.',
    '.aaaaaaaaaaa.',
    '..bbbbbbbbb..',
  ],
  cat: [
    '.aa.......aa.',
    '.aba.....aba.',
    '.aaaaaaaaaaa.',
    '.aaaaaaaaaaa.',
    'aaa.aaaaa.aaa',
    'aaaaaacaaaaaa',
    '.aaaaaaaaaaa.',
    '..ccccccccc..',
    '..a.ddddd.a..',
    '..aa.ddd.aa..',
  ],
  bull: [
    'ww.........ww',
    'wwa.......aww',
    '.waaaaaaaaaw.',
    '..aaaaaaaaa..',
    '..aa.aaa.aa..',
    '..aaaaaaaaa..',
    '...bbbbbbb...',
    '...b..c..b...',
    '....ccccc....',
  ],
  flower: [
    '....aa.......',
    '..aa..bb.....',
    '....yybb.....',
    '..ccyy.......',
    '....ggdd.....',
    '....gg.......',
    '..gggggg.....',
    '.eeeeeeee....',
    '..eeeeee.....',
    '...eeee......',
  ],
  gem: [
    '....aaaaa....',
    '..aabbbbbaa..',
    '.aabbbbbbbaa.',
    'aaabwwbbbbaaa',
    '.aaabbbbbaaa.',
    '..aaabbbbaa..',
    '...aaabbaa...',
    '....aaaaa....',
    '.....aaa.....',
  ],
  rocket: [
    '.....aaa.....',
    '....aaaaa....',
    '...aabbbaa...',
    '...abwwwba...',
    '...abwwwba...',
    '...aabbbaa...',
    '..caaaaaaac..',
    '.ccaaaaaaacc.',
    'cc..aaaaa..cc',
    '....ddddd....',
    '....d.e.d....',
    '......e......',
  ],
  campfire: [
    '.....aa......',
    '....aaaa.....',
    '...aaabaa....',
    '..aaabbbaa...',
    '..aabbbbaa...',
    '...abbbba....',
    '.cc..bb..cc..',
    'ccccddddcccc.',
    '..cccccccc...',
  ],
  castle: [
    'aa..aaa..aa..',
    'aa..aaa..aa..',
    'aaaaaaaaaaa..',
    'aaaaaaaaaaa..',
    '.aa.aaa.aa...',
    '.aaaaaaaaa...',
    '.aaa...aaa...',
    '.aaa...aaa...',
    'aaaaaaaaaaa..',
  ],
  trousers: [
    '.bbbbbbbbbb..',
    '.ccccddcccc..',
    '.aaaaaaaaaa..',
    '.aaaaaaaaaa..',
    '.aaaa..aaaa..',
    '.aaaa..aaaa..',
    '.aaaa..aaaa..',
    '.aaaa..aaaa..',
    '.aaaa..aaaa..',
    '.aaaa..aaaa..',
  ],
  ticket: [
    '.aaaaaaaaaaa.',
    'aabbbbbbbbbaa',
    'abbb..c..bbba',
    '.bbb.ccc.bbb.',
    'abbb..c..bbba',
    'aabbbbbbbbbaa',
    '.aaaaaaaaaaa.',
  ],
  gift: [
    '..bb....bb...',
    '...bbbbbb....',
    '.aaabbbbaaa..',
    '.aaabbbbaaa..',
    '..aabbbbaa...',
    '..aabbbbaa...',
    '..aabbbbaa...',
    '..aaaaaaaa...',
  ],
  eye: [
    '....aaaaa....',
    '..aabbbbbaa..',
    '.abbwwwwwbba.',
    'abwwcccccwwba',
    'abwwccdccwwba',
    'abwwcccccwwba',
    '.abbwwwwwbba.',
    '..aabbbbbaa..',
    '....aaaaa....',
  ],
  hourglass: [
    'aaaaaaaaaaaaa',
    '.bbbbbbbbbbb.',
    '..bbcccccbb..',
    '...bbcccbb...',
    '....bbbbb....',
    '....bbbbb....',
    '...bb.c.bb...',
    '..bbcccccbb..',
    '.bbcccccccbb.',
    'aaaaaaaaaaaaa',
  ],
  die6: [
    '.aaaaaaaaaaa.',
    'aaaaaaaaaaaaa',
    'aawwaaaaawwaa',
    'aawwaaaaawwaa',
    'aaaaaaaaaaaaa',
    'aawwaaaaawwaa',
    'aawwaaaaawwaa',
    'aaaaaaaaaaaaa',
    'aawwaaaaawwaa',
    'aawwaaaaawwaa',
    '.aaaaaaaaaaa.',
  ],
  hand4: [
    '.aa.aa.aa.aa.',
    '.aa.aa.aa.aa.',
    '.aa.aa.aa.aa.',
    '.aa.aa.aa.aa.',
    '.aaaaaaaaaaa.',
    '.aaaaaaaaaaa.',
    '..aaaaaaaaa..',
    '...aaaaaaa...',
    '...bbbbbbb...',
  ],
  sword: [
    '......a......',
    '.....aaa.....',
    '.....aba.....',
    '.....aba.....',
    '.....aba.....',
    '.....aba.....',
    '.....aba.....',
    '..ccccccccc..',
    '.....ddd.....',
    '.....ddd.....',
    '....ccccc....',
  ],
  bell: [
    '.....aaa.....',
    '....aaaaa....',
    '...aaabaaa...',
    '...aaabaaa...',
    '..aaaabaaaa..',
    '..aaaaaaaaa..',
    '.aaaaaaaaaaa.',
    'aaaaaaaaaaaaa',
    '.....ccc.....',
  ],
  acorn: [
    '.....aaa.....',
    '..bbbbbbbbb..',
    '.bbbbbbbbbbb.',
    '..aaaaaaaaa..',
    '..aaabaaaaa..',
    '..aaaaaaaaa..',
    '...aaaaaaa...',
    '....aaaaa....',
    '.....aaa.....',
  ],
  leaf: [
    '........aaa..',
    '......aaaaa..',
    '....aaaaabaa.',
    '...aaaabaaa..',
    '..aaaabaaa...',
    '..aaabaaa....',
    '..aabaaa.....',
    '.aaabaa......',
    'aa.aaa.......',
  ],
  chalice: [
    '.aaaaaaaaaaa.',
    '.aabbbbbbbba.',
    '..aaaaaaaaa..',
    '...aaaaaaa...',
    '....aaaaa....',
    '.....aaa.....',
    '.....aaa.....',
    '...aaaaaaa...',
    '..aaaaaaaaa..',
  ],
  fish: [
    '....aaaaa....',
    '..aaaaaaaaa.a',
    '.aa.aaaaaaaaa',
    'aaaaaaaaaaaa.',
    '.aaaaaaaaaaaa',
    '..aaaaaaaaa.a',
    '....aaaaa....',
  ],
  hook: [
    '......aa.....',
    '......aa.....',
    '......aa.....',
    '......aa.....',
    '..aa..aa.....',
    '.aaa..aa.....',
    '..aa..aa.....',
    '...aaaa......',
  ],
  house: [
    '.....aaa.....',
    '....aaaaa....',
    '...aaaaaaa...',
    '..aaaaaaaaa..',
    '.aaaaaaaaaaa.',
    '..bbbbbbbbb..',
    '..bb..b..bb..',
    '..bb..b..bb..',
    '..bbbbbbbbb..',
  ],
  serpent: [
    '..aaaaaaa....',
    '.aa..aaaaa...',
    '.aa.....aa...',
    '..aaaaaa.....',
    '....aaaaaa...',
    '........aa...',
    '..aaaaaaa....',
    '.aaa.........',
  ],
  tooth: [
    '.aaaa...aaaa.',
    'aaaaaaaaaaaaa',
    'aaaaaaaaaaaaa',
    'aaaaaaaaaaaaa',
    '.aaaaaaaaaaa.',
    '.aaaa...aaaa.',
    '..aaa...aaa..',
    '..aa.....aa..',
  ],
  mouth: [
    '..aaa...aaa..',
    '.aaaaaaaaaaa.',
    'aawwwwwwwwwaa',
    'aaw.w.w.w.waa',
    'aawwwwwwwwwaa',
    '.aaaaaaaaaaa.',
    '..aaaaaaaaa..',
  ],
  pillar: [
    'aaaaaaaaaaaaa',
    '.bbbbbbbbbbb.',
    '..aa.aaa.aa..',
    '..aa.aaa.aa..',
    '..aa.aaa.aa..',
    '..aa.aaa.aa..',
    '.bbbbbbbbbbb.',
    'aaaaaaaaaaaaa',
  ],
  ox: [
    'a...........a',
    'aa.........aa',
    '.aaaaaaaaaaa.',
    '..aa.aaa.aa..',
    '..aaaaaaaaa..',
    '...aaaaaaa...',
    '....a...a....',
  ],
  manacle: [
    '..aaa...aaa..',
    '.a...a.a...a.',
    '.a...aaa...a.',
    '..aaa...aaa..',
    '....a...a....',
    '....aaaaa....',
  ],
  wheel: [
    '...aaaaaaa...',
    '.aa...a...aa.',
    'a..a..a..a..a',
    'a...aaaaa...a',
    'a..a..a..a..a',
    '.aa...a...aa.',
    '...aaaaaaa...',
  ],
  bolt: [
    '.....aaaa....',
    '....aaaa.....',
    '...aaaa......',
    '..aaaaaaaa...',
    '.....aaaa....',
    '....aaaa.....',
    '...aaaa......',
    '..aaa........',
  ],
  comet: [
    '.......aaaa..',
    '.....aaaaaa..',
    '....aaaaaaa..',
    '...aa..aaaa..',
    '..aa...aa....',
    '.aa..........',
    'a............',
  ],
  ankh: [
    '....aaaaa....',
    '...aa...aa...',
    '...aa...aa...',
    '....aaaaa....',
    '..aaaaaaaaa..',
    '.....aaa.....',
    '.....aaa.....',
    '.....aaa.....',
    '.....aaa.....',
  ],
  scales: [
    '.....aaa.....',
    '.aaaaaaaaaaa.',
    '..a...a...a..',
    '.aaa..a..aaa.',
    'aaaaa.a.aaaaa',
    '......a......',
    '....aaaaa....',
    '...aaaaaaa...',
  ],
  lantern: [
    '.....aaa.....',
    '....aaaaa....',
    '...aabbbaa...',
    '..aabwwwbaa..',
    '..aabwwwbaa..',
    '...aabbbaa...',
    '....aaaaa....',
    '.....aaa.....',
  ],
  tower: [
    '..a..aaa..a..',
    '..aaaaaaaaa..',
    '...aaaaaaa...',
    '...aa.a.aa...',
    '...aaaaaaa...',
    '..aaaaaaaaa..',
    '..aa..a..aa..',
    '.aaaaaaaaaaa.',
  ],
  crescent: [
    '.....aaaaa...',
    '...aaaaaa....',
    '..aaaaa......',
    '.aaaaa.......',
    '.aaaaa.......',
    '..aaaaa......',
    '...aaaaaa....',
    '.....aaaaa...',
  ],
  sun: [
    '.....a.....',
    '.a..aaa..a.',
    '..aaaaaaa..',
    '.aaaaaaaaa.',
    'aaaaabaaaaa',
    '.aaaaaaaaa.',
    '..aaaaaaa..',
    '.a..aaa..a.',
    '.....a.....',
  ],
  star8: [
    '.....a.....',
    '....aaa....',
    '.a..aaa..a.',
    '..aaaaaaa..',
    'aaaabbbbaaa',
    '..aaaaaaa..',
    '.a..aaa..a.',
    '....aaa....',
    '.....a.....',
  ],
  bag: [
    '....aaaaa....',
    '.....aaa.....',
    '...bbbbbbb...',
    '..aaaaaaaaa..',
    '.aaaabbbaaaa.',
    '.aaaabbbaaaa.',
    '.aaaaaaaaaaa.',
    '..aaaaaaaaa..',
  ],
  tree: [
    '....aaaaa....',
    '..aaabbbbaa..',
    '.aabaaaaabaa.',
    '.aaabaaaaaaa.',
    '..aaaaaaaaa..',
    '.....ccc.....',
    '.....ccc.....',
    '...ccccccc...',
  ],
  telescope: [
    '.........aaa.',
    '.......aaaaa.',
    '.....aaaaa...',
    '...aaaaa.....',
    '..aaaa.......',
    '.....bb......',
    '....b..b.....',
    '...b....b....',
  ],
  tophat: [
    '...aaaaaaa...',
    '...aaaaaaa...',
    '...aaaaaaa...',
    '...aaaaaaa...',
    '...bbbbbbb...',
    '.aaaaaaaaaaa.',
    '.aaaaaaaaaaa.',
  ],
  brush: [
    '........aaa..',
    '.......aaaa..',
    '......aaaa...',
    '.....bbbb....',
    '....cccc.....',
    '...cccc......',
    '..ccc........',
  ],
  palette: [
    '...aaaaaaa...',
    '.aabbaaaccba.',
    'aabbaaaaaccba',
    'aaaddaaaaaaa.',
    'aaaddaa..aaa.',
    '.aaaaaaaaaa..',
    '..aaaaaaaa...',
  ],
  clapper: [
    '.abwabwabwa..',
    '.aaaaaaaaaa..',
    '.bbbbbbbbbb..',
    '.bbwwwwwwbb..',
    '.bbbbbbbbbb..',
    '.bbwwwwwwbb..',
    '.bbbbbbbbbb..',
  ],
  tongs: [
    '..aa.....aa..',
    '...aa...aa...',
    '....aa.aa....',
    '.....aaa.....',
    '....aa.aa....',
    '...aa...aa...',
    '..bbb...bbb..',
    '..bbb...bbb..',
  ],
  recycle: [
    '....aaaaa....',
    '...aa...aa...',
    '..aa.....aa..',
    '....a...a....',
    '..aa.....aa..',
    '...aaaaaaa...',
    '....aaaaa....',
  ],
  miniJester: [
    'a..aaa..a',
    'aa.aaa.aa',
    '.bbbbbbb.',
    '.b.bbb.b.',
    '.bbbbbbb.',
    '..ccccc..',
  ],
  boots: [
    '..aaa...aaa..',
    '..aaa...aaa..',
    '..aaa...aaa..',
    '..aaaa..aaaa.',
    '..aaaa..aaaa.',
    '.bbbbb..bbbbb',
  ],
  sneaker: [
    '.....aaa.....',
    '....aaaaa....',
    '...aaaaaaa...',
    '.aaaaaaaaaaa.',
    'aawwwwwwwwwaa',
    'bbbbbbbbbbbbb',
  ],
  crystalBall: [
    '....aaaaa....',
    '..aabbbbbaa..',
    '.abwwbbbbbaa.',
    '.abwbbbbbbba.',
    '.abbbbbbbbba.',
    '..aabbbbbaa..',
    '...ccccccc...',
    '..ccccccccc..',
  ],
  bus: [
    '.aaaaaaaaaaa.',
    'aaaaaaaaaaaaa',
    'aabbbbbbbbbaa',
    'aabbbbbbbbbaa',
    'aaaaaaaaaaaaa',
    'aawwaaaaawwaa',
    'aaaaaaaaaaaaa',
    '.cc.......cc.',
  ],
  lute: [
    '.........aa..',
    '........aa...',
    '.......aa....',
    '....aaaa.....',
    '...aabbaa....',
    '..aabbbbaa...',
    '..aabbbbaa...',
    '...aaaaaa....',
  ],
  megaphone: [
    '......aaa....',
    '.....aaaa....',
    '...aaaaaa....',
    '.aaaaaaaa....',
    '.aaaaaaaa....',
    '...aaaaaa....',
    '.....aaaa....',
    '....bb.......',
    '....bb.......',
  ],
  trash: [
    '...aaaaaaa...',
    '.bbbbbbbbbbb.',
    '..aaaaaaaaa..',
    '..a.a.a.a.a..',
    '..a.a.a.a.a..',
    '..a.a.a.a.a..',
    '..aaaaaaaaa..',
  ],
  satellite: [
    'aaa..bbb..aaa',
    'aaa..bbb..aaa',
    'aaabbbbbbbbaa',
    'aaa..bbb..aaa',
    'aaa..bbb..aaa',
    '......c......',
    '.....ccc.....',
  ],
  envelope: [
    'aaaaaaaaaaaaa',
    'abbbbbbbbbbba',
    'ab.bbbbbbb.ba',
    'abb.bbbbb.bba',
    'abbb.bbb.bbba',
    'abbbb...bbbba',
    'abbbbbbbbbbba',
    'aaaaaaaaaaaaa',
  ],
  luchador: [
    '...aaaaaaa...',
    '..aabbbbbaa..',
    '.abbbbbbbbba.',
    '.abwwbbbwwba.',
    '.abbbbbbbbba.',
    '.abbbcccbbba.',
    '..aabbbbbaa..',
    '...aaaaaaa...',
  ],
  mask: [
    '..aaaaaaaaa..',
    '.aabbbbbbbaa.',
    '.ab..bbb..ba.',
    '.abbbbbbbbba.',
    '..abbcccbb...',
    '...abbbbba...',
    '....aaaaa....',
  ],
  ghost: [
    '....aaaaa....',
    '..aaaaaaaaa..',
    '.aaaaaaaaaaa.',
    '.aa..aaa..aa.',
    '.aaaaaaaaaaa.',
    '.aaaaaaaaaaa.',
    '.aa.aa.aa.aa.',
  ],
  shield: [
    'aaaaaaaaaaaaa',
    'abbbbbbbbbbba',
    'abbbcccccbbba',
    'abbbcccccbbba',
    '.abbbcccbbba.',
    '..abbbbbbba..',
    '....aaaaa....',
  ],
  walkie: [
    '.........aa..',
    '.........aa..',
    '...aaaaaaa...',
    '...abbbbba...',
    '...abcccba...',
    '...abbbbba...',
    '...ab.b.ba...',
    '...ab.b.ba...',
    '...aaaaaaa...',
  ],
  planetRing: [
    '....aaaaa....',
    '...aaaaaaa...',
    '.ccaaaaaaa...',
    'ccaaaaaaaaacc',
    '...aaaaaaacc.',
    '...aaaaaaa...',
    '....aaaaa....',
  ],
  drop: [
    '.....a.....',
    '....aaa....',
    '...aaaaa...',
    '..aaabaaa..',
    '..aabaaaa..',
    '..aaaaaaa..',
    '...aaaaa...',
  ],
  needle: [
    '.........aa',
    '........a.a',
    '.......aaa.',
    '......aa...',
    '.....aa....',
    '....aa.....',
    '...aa......',
    '..a........',
  ],
} as const;

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
    ctx.fillStyle = suitColor;
    ctx.fillRect(ox + 25, oy + 25, 21, 6);
    ctx.fillStyle = accentGold;
    ctx.fillRect(ox + 42, oy + 20, 4, 7);
    ctx.fillRect(ox + 44, oy + 19, 3, 4);
  }

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

      if (label === '10') {
        drawPixelText(ctx, '1', ox + 5, oy + 6, 1, color);
        drawPixelText(ctx, '0', ox + 9, oy + 6, 1, color);
      } else {
        drawPixelText(ctx, label, ox + 6, oy + 6, 1, color);
      }
      drawSuitIcon(ctx, suit, ox + 9, oy + 19, 'sm', color);

      if (label === '10') {
        drawPixelText(ctx, '1', ox + 55, oy + 82, 1, color);
        drawPixelText(ctx, '0', ox + 59, oy + 82, 1, color);
      } else {
        drawPixelText(ctx, label, ox + 59, oy + 82, 1, color);
      }
      drawSuitIcon(ctx, suit, ox + 62, oy + 75, 'sm', color);

      if (rank === 'Ace') {
        drawSuitIcon(ctx, suit, ox + 35, oy + 47, 'lg', color, hiColor);
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
// All 15 bespoke Deck Backs + Challenge/Locked, Plain front, 8 Enhancements, 4 Wax Seals
// ---------------------------------------------------------------------------

type DeckBackStyle =
  | 'red'
  | 'blue'
  | 'yellow'
  | 'green'
  | 'black'
  | 'magic'
  | 'nebula'
  | 'ghost'
  | 'abandoned'
  | 'checkered'
  | 'zodiac'
  | 'painted'
  | 'anaglyph'
  | 'plasma'
  | 'erratic'
  | 'challenge'
  | 'locked_soul'
  | 'locked_joker';

function drawBespokeDeckBack(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  style: DeckBackStyle
): void {
  drawCardBase(ctx, ox, oy, IVORY, IVORY_SHADE, OUTLINE);
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(ox + 6, oy + 6, 59, 83);

  const px = ox + 8;
  const py = oy + 8;
  const pw = 55;
  const ph = 79;

  const fillWeave = (c1: string, c2: string) => {
    ctx.fillStyle = c1;
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = c2;
    for (let y = 2; y < ph - 2; y += 4) {
      for (let x = 2; x < pw - 2; x += 4) {
        if (((x + y) >> 2) % 2 === 0) ctx.fillRect(px + x, py + y, 2, 2);
      }
    }
  };

  switch (style) {
    case 'red':
      fillWeave('#d9453c', '#a82d26');
      drawPixelCircle(ctx, ox + 35, oy + 47, 18, '#a82d26', '#f5c542');
      drawPixelCircle(ctx, ox + 35, oy + 47, 13, '#f5b841', OUTLINE);
      drawSuitIcon(ctx, 'Hearts', ox + 35, oy + 47, 'md', '#d9453c', '#ff9b94');
      break;
    case 'blue':
      fillWeave('#2b78cc', '#1c4f8f');
      drawPixelCircle(ctx, ox + 35, oy + 47, 18, '#1c4f8f', '#80d0ff');
      drawPixelCircle(ctx, ox + 35, oy + 47, 13, '#72c2ff', OUTLINE);
      drawSuitIcon(ctx, 'Spades', ox + 35, oy + 47, 'md', '#1a3560', '#a6d8ff');
      break;
    case 'yellow':
      fillWeave('#e6a92e', '#b57b18');
      drawPixelCircle(ctx, ox + 35, oy + 47, 18, '#b57b18', '#fff2a6');
      drawPixelCircle(ctx, ox + 35, oy + 47, 13, '#ffdf6b', OUTLINE);
      drawPixelText(ctx, '$', ox + 35, oy + 40, 2, '#995c0c', { align: 'center' });
      break;
    case 'green':
      fillWeave('#2f9462', '#1c6340');
      drawPixelCircle(ctx, ox + 35, oy + 47, 18, '#1c6340', '#99f2c4');
      drawPixelCircle(ctx, ox + 35, oy + 47, 13, '#6fe6a8', OUTLINE);
      drawSuitIcon(ctx, 'Clubs', ox + 35, oy + 47, 'md', '#185437');
      break;
    case 'black':
      fillWeave('#2b323b', '#191e24');
      drawPixelCircle(ctx, ox + 35, oy + 47, 18, '#191e24', '#c75985');
      drawSprite(
        ctx,
        ICON_SPRITES.crown,
        { a: '#f3b958', b: '#fe5f55', c: '#c75985', d: '#b57e22' },
        ox + 35,
        oy + 47,
        2,
        OUTLINE
      );
      break;
    case 'magic':
      fillWeave('#6d3fa8', '#422070');
      drawSparkle(ctx, ox + 17, oy + 20, '#ffe082', 3);
      drawSparkle(ctx, ox + 53, oy + 74, '#ffe082', 3);
      drawSprite(
        ctx,
        ICON_SPRITES.crystalBall,
        { a: '#c8a6ff', b: '#7a45d6', w: '#ffffff', c: '#f3b958' },
        ox + 35,
        oy + 47,
        2,
        OUTLINE
      );
      break;
    case 'nebula':
      ctx.fillStyle = '#141d42';
      ctx.fillRect(px, py, pw, ph);
      for (let i = 0; i < 20; i++) {
        const sx = px + 3 + Math.floor(hash2i(i, 4, 81) * (pw - 6));
        const sy = py + 3 + Math.floor(hash2i(i, 9, 81) * (ph - 6));
        ctx.fillStyle = i % 3 === 0 ? '#ffe680' : '#a8c8ff';
        ctx.fillRect(sx, sy, 1, 1);
      }
      drawPixelCircle(ctx, ox + 35, oy + 47, 19, 'rgba(138,113,225,0.45)');
      drawSprite(
        ctx,
        ICON_SPRITES.planetRing,
        { a: '#70a9ff', c: '#ffe082' },
        ox + 35,
        oy + 47,
        2,
        OUTLINE
      );
      break;
    case 'ghost':
      fillWeave('#4e6275', '#31404f');
      drawPixelCircle(ctx, ox + 35, oy + 47, 18, 'rgba(160,240,255,0.22)');
      drawSprite(ctx, ICON_SPRITES.ghost, { a: '#dff9ff' }, ox + 35, oy + 47, 2, OUTLINE);
      break;
    case 'abandoned':
      fillWeave('#786755', '#544639');
      // Weathered diagonal slash & broken crown
      drawPixelLine(ctx, ox + 14, oy + 22, ox + 56, oy + 72, '#3b2e23', 3);
      drawPixelLine(ctx, ox + 56, oy + 22, ox + 14, oy + 72, '#3b2e23', 3);
      drawSprite(
        ctx,
        ICON_SPRITES.skull,
        { a: '#e6dccb' },
        ox + 35,
        oy + 47,
        2,
        OUTLINE
      );
      break;
    case 'checkered':
      for (let y = 0; y < ph; y += 8) {
        for (let x = 0; x < pw; x += 8) {
          ctx.fillStyle = ((x >> 3) + (y >> 3)) % 2 === 0 ? '#cc3b3b' : '#262b33';
          ctx.fillRect(px + x, py + y, Math.min(8, pw - x), Math.min(8, ph - y));
        }
      }
      drawPixelCircle(ctx, ox + 35, oy + 47, 16, '#faf6ee', OUTLINE);
      drawSuitIcon(ctx, 'Hearts', ox + 29, oy + 43, 'sm', '#fe5f55');
      drawSuitIcon(ctx, 'Spades', ox + 41, oy + 51, 'sm', '#262b33');
      break;
    case 'zodiac':
      fillWeave('#3d2c6b', '#241845');
      drawPixelCircle(ctx, ox + 35, oy + 47, 19, '#241845', '#f3b958');
      drawPixelCircle(ctx, ox + 35, oy + 47, 13, '#4c3685', '#ffe082');
      drawSprite(ctx, ICON_SPRITES.star8, { a: '#f3b958', b: '#fff4c2' }, ox + 35, oy + 47, 2, OUTLINE);
      break;
    case 'painted': {
      const bands = ['#fe5f55', '#fda200', '#f5d742', '#4bc292', '#009dff', '#8867a5'];
      for (let i = 0; i < bands.length; i++) {
        ctx.fillStyle = bands[i]!;
        ctx.fillRect(px, py + i * 13, pw, 14);
      }
      drawSprite(
        ctx,
        ICON_SPRITES.palette,
        { a: '#e8c494', b: '#fe5f55', c: '#009dff', d: '#4bc292' },
        ox + 35,
        oy + 47,
        2,
        OUTLINE
      );
      break;
    }
    case 'anaglyph':
      fillWeave('#252a36', '#181c24');
      // 3D stereoscopic red/cyan offset circles & jester mark
      drawPixelCircle(ctx, ox + 31, oy + 47, 15, 'rgba(254,95,85,0.85)');
      drawPixelCircle(ctx, ox + 39, oy + 47, 15, 'rgba(0,210,255,0.85)');
      drawPixelCircle(ctx, ox + 35, oy + 47, 11, '#ffffff', OUTLINE);
      drawPixelText(ctx, '3D', ox + 35, oy + 44, 1, OUTLINE, { align: 'center' });
      break;
    case 'plasma':
      fillWeave('#482485', '#241354');
      drawPixelCircle(ctx, ox + 35, oy + 47, 21, '#6f3be0', '#38d9ff');
      drawPixelCircle(ctx, ox + 35, oy + 47, 14, '#c77dff', '#ffffff');
      drawPixelCircle(ctx, ox + 35, oy + 47, 7, '#e8f9ff');
      drawSparkle(ctx, ox + 18, oy + 24, '#70f3ff', 4);
      drawSparkle(ctx, ox + 52, oy + 70, '#ff8ce6', 4);
      break;
    case 'erratic': {
      const swatches = ['#fe5f55', '#009dff', '#4bc292', '#f3b958', '#b26cbb', '#2f3542'];
      for (let y = 0; y < ph; y += 7) {
        for (let x = 0; x < pw; x += 7) {
          const h = Math.floor(hash2i(x, y, 303) * swatches.length);
          ctx.fillStyle = swatches[h]!;
          ctx.fillRect(px + x, py + y, Math.min(7, pw - x), Math.min(7, ph - y));
        }
      }
      drawPixelCircle(ctx, ox + 35, oy + 47, 15, '#22292d', '#ffe066');
      drawPixelText(ctx, '?', ox + 35, oy + 40, 2, '#ffe066', { align: 'center' });
      break;
    }
    case 'challenge':
      fillWeave('#3c4b52', '#263136');
      drawSprite(
        ctx,
        ICON_SPRITES.sword,
        { a: '#dbe6f0', b: '#ffffff', c: '#f3b958', d: '#fe5f55' },
        ox + 35,
        oy + 47,
        2,
        OUTLINE
      );
      break;
    case 'locked_soul':
      fillWeave('#2b2f38', '#1d2026');
      drawPixelCircle(ctx, ox + 35, oy + 47, 14, '#8867a5', OUTLINE);
      drawPixelText(ctx, '!', ox + 35, oy + 40, 2, '#ffe082', { align: 'center' });
      break;
    case 'locked_joker':
      fillWeave('#2b3338', '#1c2226');
      drawPixelCircle(ctx, ox + 35, oy + 47, 14, '#4f6367', OUTLINE);
      drawPixelText(ctx, '?', ox + 35, oy + 40, 2, '#ffffff', { align: 'center' });
      break;
  }

  // Ornate ivory corner pips inside colored back
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(px + 3, py + 3, 4, 2);
  ctx.fillRect(px + pw - 7, py + 3, 4, 2);
  ctx.fillRect(px + 3, py + ph - 5, 4, 2);
  ctx.fillRect(px + pw - 7, py + ph - 5, 4, 2);
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
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(cx - 5, cy + 7, 11, 11);
  ctx.fillStyle = ribbon;
  ctx.fillRect(cx - 4, cy + 7, 3, 9);
  ctx.fillRect(cx + 2, cy + 7, 3, 9);
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

  // All 15 Deck Backs + Challenge & Locked backs at exact oracle.json coordinates
  const deckCells: Array<[number, number, DeckBackStyle]> = [
    [0, 0, 'red'],
    [0, 2, 'blue'],
    [1, 2, 'yellow'],
    [2, 2, 'green'],
    [3, 2, 'black'],
    [0, 3, 'magic'],
    [3, 0, 'nebula'],
    [6, 2, 'ghost'],
    [3, 3, 'abandoned'],
    [1, 3, 'checkered'],
    [3, 4, 'zodiac'],
    [4, 3, 'painted'],
    [2, 4, 'anaglyph'],
    [4, 2, 'plasma'],
    [2, 3, 'erratic'],
    [4, 0, 'challenge'],
    [0, 1, 'locked_soul'],
    [5, 2, 'locked_joker'],
  ];
  for (const [gx, gy, style] of deckCells) {
    const { ox, oy } = cell(gx, gy);
    drawBespokeDeckBack(ctx, ox, oy, style);
  }

  // Enhancements (exact oracle.json coordinates):
  // Bonus Card (1,1)
  {
    const { ox, oy } = cell(1, 1);
    drawCardBase(ctx, ox, oy, '#ebf7ff', '#bfdcf2', '#174d7a', '#009dff');
    drawPixelCircle(ctx, ox + 12, oy + 82, 4, '#009dff', OUTLINE);
    drawPixelCircle(ctx, ox + 59, oy + 13, 4, '#009dff', OUTLINE);
    ctx.fillStyle = '#009dff';
    ctx.fillRect(ox + 26, oy + 4, 19, 3);
    ctx.fillRect(ox + 26, oy + 88, 19, 3);
  }
  // Mult Card (2,1)
  {
    const { ox, oy } = cell(2, 1);
    drawCardBase(ctx, ox, oy, '#fff0ef', '#f2c2be', '#7a1c19', '#fe5f55');
    ctx.fillStyle = '#fe5f55';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(ox + 18 + i * 8, oy + 3, 4, 4);
      ctx.fillRect(ox + 18 + i * 8, oy + 88, 4, 4);
    }
  }
  // Wild Card (3,1)
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
  // Lucky Card (4,1)
  {
    const { ox, oy } = cell(4, 1);
    drawCardBase(ctx, ox, oy, '#f7fbe8', '#d5e6b5', '#2a5934', '#4bc292');
    ctx.fillStyle = '#f3b958';
    ctx.fillRect(ox + 8, oy + 8, 55, 2);
    ctx.fillRect(ox + 8, oy + 85, 55, 2);
    for (const [cx, cy] of [
      [14, 80],
      [57, 15],
    ]) {
      ctx.fillStyle = '#2ea36b';
      ctx.fillRect(ox + cx - 2, oy + cy, 5, 2);
      ctx.fillRect(ox + cx, oy + cy - 2, 2, 5);
    }
  }
  // Glass Card (5,1)
  {
    const { ox, oy } = cell(5, 1);
    drawCardBase(ctx, ox, oy, 'rgba(225,244,255,0.82)', 'rgba(165,212,240,0.85)', '#5c8ea8', '#ffffff');
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 52; i++) {
      ctx.fillRect(ox + 10 + i, oy + 62 - i, 6, 2);
      if (i < 34) ctx.fillRect(ox + 26 + i, oy + 78 - i, 3, 2);
    }
  }
  // Steel Card (6,1)
  {
    const { ox, oy } = cell(6, 1);
    drawCardBase(ctx, ox, oy, '#bcc7d1', '#8897a6', '#2b3640', '#e3ebf2');
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(ox + 7, oy + 18, 57, 8);
    ctx.fillRect(ox + 7, oy + 52, 57, 12);
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
  // Stone Card (5,0)
  {
    const { ox, oy } = cell(5, 0);
    drawCardBase(ctx, ox, oy, '#8d9499', '#61686e', '#262b2e');
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
  // Gold Card (6,0)
  {
    const { ox, oy } = cell(6, 0);
    drawCardBase(ctx, ox, oy, '#f7cf54', '#c98e1e', '#5e3c06', '#fff2a6');
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 44; i++) {
      ctx.fillRect(ox + 12 + i, oy + 56 - i, 4, 2);
    }
  }

  // Wax Seals
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
// 3. Full 150-Joker Atlas (`Joker`, 10x16 @ 71x95)
// EVERY cell uses an iconic light ivory outer frame (#f7f3ea) + inner art window
// so Negative edition ALWAYS inverts cleanly to dark obsidian/indigo!
// Every single one of the 149 unique Joker cells (+ Wee sharing 0,0) has bespoke art!
// ---------------------------------------------------------------------------

interface JesterOpts {
  hatLeft: string;
  hatRight: string;
  face?: string;
  collar?: string;
  smile?: string;
  expression?: 'grin' | 'laugh' | 'mad' | 'crazy' | 'droll' | 'wink' | 'sly' | 'blank' | 'scary';
  beard?: string;
  glasses?: boolean;
  suitBadge?: { suit: Suit; color: string };
  afro?: boolean;
  label?: string;
  labelColor?: string;
  cracks?: boolean;
  smear?: boolean;
  burnt?: boolean;
}

function drawJesterPortrait(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  opts: JesterOpts
): void {
  const face = opts.face ?? '#fffaf2';
  const collar = opts.collar ?? '#f3b958';
  const smile = opts.smile ?? '#fe5f55';
  const expr = opts.expression ?? 'grin';

  // Jester collar
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(ox + 16, oy + 62, 39, 18);
  ctx.fillStyle = collar;
  ctx.fillRect(ox + 18, oy + 64, 35, 14);
  ctx.fillStyle = opts.hatLeft;
  ctx.fillRect(ox + 21, oy + 66, 7, 9);
  ctx.fillStyle = opts.hatRight;
  ctx.fillRect(ox + 43, oy + 66, 7, 9);

  // Head
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(ox + 22, oy + 32, 27, 30);
  ctx.fillStyle = face;
  ctx.fillRect(ox + 24, oy + 34, 23, 26);

  // Hat or Clown Afro
  if (opts.afro) {
    drawPixelCircle(ctx, ox + 20, oy + 28, 10, opts.hatLeft, OUTLINE);
    drawPixelCircle(ctx, ox + 51, oy + 28, 10, opts.hatRight, OUTLINE);
    drawPixelCircle(ctx, ox + 35, oy + 22, 11, '#f5c542', OUTLINE);
  } else {
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 13, oy + 16, 45, 18);
    ctx.fillStyle = opts.hatLeft;
    ctx.fillRect(ox + 15, oy + 18, 20, 14);
    ctx.fillRect(ox + 11, oy + 24, 8, 9);
    ctx.fillStyle = opts.hatRight;
    ctx.fillRect(ox + 35, oy + 18, 21, 14);
    ctx.fillRect(ox + 52, oy + 24, 8, 9);
    drawPixelCircle(ctx, ox + 12, oy + 34, 3, '#f5c542', OUTLINE);
    drawPixelCircle(ctx, ox + 59, oy + 34, 3, '#f5c542', OUTLINE);
  }

  // Facial features
  if (expr !== 'blank') {
    if (expr === 'crazy') {
      drawPixelCircle(ctx, ox + 30, oy + 43, 4, '#ffffff', OUTLINE);
      drawPixelCircle(ctx, ox + 41, oy + 42, 5, '#ffffff', OUTLINE);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 29, oy + 42, 2, 2);
      ctx.fillRect(ox + 41, oy + 43, 2, 2);
    } else if (expr === 'wink') {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 28, oy + 41, 4, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + 29, oy + 42, 2, 2);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 38, oy + 43, 6, 2);
    } else if (expr === 'scary') {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 27, oy + 40, 6, 6);
      ctx.fillRect(ox + 38, oy + 40, 6, 6);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(ox + 29, oy + 42, 2, 2);
      ctx.fillRect(ox + 40, oy + 42, 2, 2);
    } else {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 28, oy + 41, 4, 5);
      ctx.fillRect(ox + 39, oy + 41, 4, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + 29, oy + 42, 2, 2);
      ctx.fillRect(ox + 40, oy + 42, 2, 2);
    }

    if (expr === 'mad') {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 27, oy + 38, 6, 2);
      ctx.fillRect(ox + 38, oy + 38, 6, 2);
      ctx.fillRect(ox + 32, oy + 40, 7, 2);
    } else if (expr === 'droll' || expr === 'sly') {
      ctx.fillStyle = face;
      ctx.fillRect(ox + 28, oy + 41, 4, 2);
      ctx.fillRect(ox + 39, oy + 41, 4, 2);
    }

    if (opts.afro) {
      drawPixelCircle(ctx, ox + 35, oy + 48, 3, '#fe5f55', OUTLINE);
    }

    if (opts.glasses) {
      ctx.fillStyle = '#f3b958';
      ctx.fillRect(ox + 26, oy + 40, 8, 7);
      ctx.fillRect(ox + 37, oy + 40, 8, 7);
      ctx.fillRect(ox + 34, oy + 42, 3, 2);
      ctx.fillStyle = '#b8ebff';
      ctx.fillRect(ox + 27, oy + 41, 6, 5);
      ctx.fillRect(ox + 38, oy + 41, 6, 5);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 29, oy + 42, 2, 3);
      ctx.fillRect(ox + 40, oy + 42, 2, 3);
    }

    if (opts.beard) {
      ctx.fillStyle = opts.beard;
      ctx.fillRect(ox + 24, oy + 52, 23, 8);
      ctx.fillRect(ox + 27, oy + 59, 17, 4);
    }

    // Mouth / smile
    if (expr === 'mad') {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 28, oy + 52, 15, 5);
      ctx.fillStyle = '#ffffff';
      for (let t = 0; t < 4; t++) ctx.fillRect(ox + 29 + t * 4, oy + 53, 2, 3);
    } else if (expr === 'droll') {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 30, oy + 53, 12, 2);
    } else if (expr === 'laugh') {
      ctx.fillStyle = smile;
      ctx.fillRect(ox + 27, oy + 51, 17, 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + 29, oy + 52, 13, 2);
    } else if (expr === 'scary') {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 26, oy + 51, 19, 6);
      ctx.fillStyle = '#ffffff';
      for (let t = 0; t < 5; t++) ctx.fillRect(ox + 27 + t * 4, oy + 52, 2, 4);
    } else {
      ctx.fillStyle = smile;
      ctx.fillRect(ox + 28, oy + 52, 15, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + 30, oy + 53, 11, 2);
    }
  }

  if (opts.cracks) {
    ctx.fillStyle = '#474e54';
    ctx.fillRect(ox + 26, oy + 36, 7, 1);
    ctx.fillRect(ox + 32, oy + 37, 1, 7);
    ctx.fillRect(ox + 41, oy + 49, 5, 1);
  }
  if (opts.smear) {
    ctx.fillStyle = '#fe5f55';
    ctx.fillRect(ox + 22, oy + 46, 3, 20);
    ctx.fillRect(ox + 34, oy + 55, 3, 18);
    ctx.fillStyle = '#24292e';
    ctx.fillRect(ox + 44, oy + 43, 3, 22);
  }
  if (opts.burnt) {
    ctx.fillStyle = '#ff7b29';
    ctx.fillRect(ox + 27, oy + 48, 5, 2);
    ctx.fillRect(ox + 37, oy + 36, 6, 2);
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(ox + 29, oy + 48, 2, 1);
    ctx.fillRect(ox + 39, oy + 36, 2, 1);
  }
  if (opts.suitBadge) {
    drawSuitIcon(ctx, opts.suitBadge.suit, ox + 35, oy + 71, 'sm', opts.suitBadge.color);
  }
  if (opts.label) {
    drawPixelText(ctx, opts.label, ox + 35, oy + 78, 1, opts.labelColor ?? '#ffffff', {
      align: 'center',
      outlineColor: OUTLINE,
    });
  }
}

/**
 * Draw 5 distinct regal Legendary portraits (Canio, Triboulet, Yorick, Chicot, Perkeo)
 */
function drawLegendaryPortrait(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  who: 'canio' | 'triboulet' | 'yorick' | 'chicot' | 'perkeo'
): void {
  const palettes: Record<
    typeof who,
    { bg: string; glow: string; coat: string; hat1: string; hat2: string; face: string; badge: string }
  > = {
    canio: {
      bg: '#231636',
      glow: 'rgba(243,185,88,0.28)',
      coat: '#1e1b26',
      hat1: '#2d293b',
      hat2: '#c9384e',
      face: '#faf7f2',
      badge: 'C',
    },
    triboulet: {
      bg: '#16274a',
      glow: 'rgba(112,185,255,0.28)',
      coat: '#2659b8',
      hat1: '#009dff',
      hat2: '#f5c542',
      face: '#f7d8b8',
      badge: 'T',
    },
    yorick: {
      bg: '#1c2b26',
      glow: 'rgba(75,194,146,0.28)',
      coat: '#2d6e55',
      hat1: '#4bc292',
      hat2: '#f3b958',
      face: '#ede6d8',
      badge: 'Y',
    },
    chicot: {
      bg: '#381822',
      glow: 'rgba(254,95,85,0.28)',
      coat: '#8f2438',
      hat1: '#c73a4e',
      hat2: '#9a5bc4',
      face: '#f5cfb0',
      badge: 'H',
    },
    perkeo: {
      bg: '#1a3033',
      glow: 'rgba(253,162,0,0.28)',
      coat: '#2d7a72',
      hat1: '#fda200',
      hat2: '#4bc292',
      face: '#ffd9b8',
      badge: 'P',
    },
  };
  const p = palettes[who];
  drawIvoryArtWindow(ctx, ox, oy, p.bg, '#f3b958', 'stars', 'rgba(255,230,128,0.55)');

  // Ornate golden corner filigree
  ctx.fillStyle = '#ffe082';
  ctx.fillRect(ox + 9, oy + 9, 5, 2);
  ctx.fillRect(ox + 9, oy + 9, 2, 5);
  ctx.fillRect(ox + 57, oy + 9, 5, 2);
  ctx.fillRect(ox + 60, oy + 9, 2, 5);
  ctx.fillRect(ox + 9, oy + 84, 5, 2);
  ctx.fillRect(ox + 9, oy + 81, 2, 5);
  ctx.fillRect(ox + 57, oy + 84, 5, 2);
  ctx.fillRect(ox + 60, oy + 81, 2, 5);

  // Radiant halo
  drawPixelCircle(ctx, ox + 35, oy + 45, 23, p.glow);
  drawPixelCircle(ctx, ox + 35, oy + 45, 19, 'rgba(255,235,160,0.16)');

  // Royal shoulders & ruffled collar
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(ox + 16, oy + 58, 39, 24);
  ctx.fillStyle = p.coat;
  ctx.fillRect(ox + 18, oy + 60, 35, 20);
  ctx.fillStyle = '#f3b958';
  ctx.fillRect(ox + 33, oy + 60, 5, 20);
  // White ruff collar
  ctx.fillStyle = '#ffffff';
  for (let x = 20; x <= 48; x += 4) {
    ctx.fillRect(ox + x, oy + 57, 3, 5);
  }

  // Head
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(ox + 23, oy + 31, 25, 26);
  ctx.fillStyle = p.face;
  ctx.fillRect(ox + 25, oy + 33, 21, 22);

  // Crowned royal jester headwear
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(ox + 16, oy + 17, 39, 16);
  ctx.fillStyle = p.hat1;
  ctx.fillRect(ox + 18, oy + 19, 17, 12);
  ctx.fillStyle = p.hat2;
  ctx.fillRect(ox + 35, oy + 19, 18, 12);
  // Golden Legendary Crown perched atop hat
  ctx.fillStyle = '#f3b958';
  ctx.fillRect(ox + 25, oy + 14, 21, 6);
  ctx.fillRect(ox + 25, oy + 10, 4, 5);
  ctx.fillRect(ox + 33, oy + 9, 5, 6);
  ctx.fillRect(ox + 42, oy + 10, 4, 5);
  ctx.fillStyle = '#fe5f55';
  ctx.fillRect(ox + 34, oy + 15, 3, 3);

  // Eyes & unique Legendary facial details
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(ox + 29, oy + 40, 3, 4);
  ctx.fillRect(ox + 39, oy + 40, 3, 4);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ox + 29, oy + 40, 1, 1);
  ctx.fillRect(ox + 39, oy + 40, 1, 1);

  if (who === 'canio') {
    // Iconic opera tear drop & crimson diamond under eye
    ctx.fillStyle = '#6ec5ff';
    ctx.fillRect(ox + 30, oy + 45, 2, 4);
    ctx.fillStyle = '#fe5f55';
    ctx.fillRect(ox + 39, oy + 45, 3, 3);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 31, oy + 51, 9, 2);
  } else if (who === 'triboulet') {
    // Regal mustache & bright royal smile
    ctx.fillStyle = '#6b4728';
    ctx.fillRect(ox + 28, oy + 48, 15, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox + 32, oy + 51, 7, 2);
  } else if (who === 'yorick') {
    // Theatrical skull medallion on chest + pensive gaze
    ctx.fillStyle = '#6e4c36';
    ctx.fillRect(ox + 30, oy + 50, 11, 2);
    drawPixelCircle(ctx, ox + 35, oy + 71, 5, '#faf6ee', OUTLINE);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 33, oy + 70, 2, 2);
    ctx.fillRect(ox + 36, oy + 70, 2, 2);
  } else if (who === 'chicot') {
    // Sharp aristocratic goatee & cunning grin
    ctx.fillStyle = '#33242b';
    ctx.fillRect(ox + 28, oy + 48, 15, 2);
    ctx.fillRect(ox + 33, oy + 51, 5, 5);
    ctx.fillStyle = '#fe5f55';
    ctx.fillRect(ox + 31, oy + 49, 9, 2);
  } else {
    // Perkeo rosy cheeks + gleaming golden goblet on side
    ctx.fillStyle = '#ff8a80';
    ctx.fillRect(ox + 26, oy + 45, 3, 2);
    ctx.fillRect(ox + 42, oy + 45, 3, 2);
    ctx.fillStyle = '#fe5f55';
    ctx.fillRect(ox + 30, oy + 49, 11, 3);
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(ox + 47, oy + 63, 7, 8);
    ctx.fillRect(ox + 49, oy + 71, 3, 6);
    ctx.fillRect(ox + 47, oy + 77, 7, 2);
  }

  // Tiny gold corner crest
  drawPixelText(ctx, p.badge, ox + 13, oy + 12, 1, '#ffe082', { shadowColor: OUTLINE });
}

type JokerDrawer = (ctx: CanvasRenderingContext2D, ox: number, oy: number) => void;

function buildJokerRegistry(): Map<string, JokerDrawer> {
  const m = new Map<string, JokerDrawer>();
  const reg = (gx: number, gy: number, fn: JokerDrawer) => m.set(`${gx},${gy}`, fn);

  // --- ROW 0: Core Jesters, Emotion Jesters, Half, Merry Andy, Stone ---
  reg(0, 0, (ctx, ox, oy) => {
    // j_joker (Jimbo) & j_wee (Wee Joker)
    drawIvoryArtWindow(ctx, ox, oy, '#f2efe6', '#fe5f55', 'dots', 'rgba(0,157,255,0.12)');
    drawJesterPortrait(ctx, ox, oy, { hatLeft: '#fe5f55', hatRight: '#009dff', collar: '#f3b958' });
  });
  reg(1, 0, (ctx, ox, oy) => {
    // j_chaos (Chaos the Clown)
    drawIvoryArtWindow(ctx, ox, oy, '#241c38', '#4bc292', 'dots', 'rgba(255,107,181,0.22)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#4bc292',
      hatRight: '#e84393',
      collar: '#009dff',
      smile: '#fe5f55',
      expression: 'crazy',
      afro: true,
    });
  });
  reg(2, 0, (ctx, ox, oy) => {
    // j_jolly (Jolly Joker — Pair Mult)
    drawIvoryArtWindow(ctx, ox, oy, '#fff2eb', '#fe5f55', 'dots', 'rgba(254,95,85,0.16)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#fe5f55',
      hatRight: '#f3b958',
      collar: '#ff8a80',
      expression: 'laugh',
      label: '2X',
      labelColor: '#fe5f55',
    });
  });
  reg(3, 0, (ctx, ox, oy) => {
    // j_zany (Zany Joker — Trips Mult)
    drawIvoryArtWindow(ctx, ox, oy, '#fff6e0', '#fda200', 'checker', 'rgba(253,162,0,0.14)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#fda200',
      hatRight: '#2ec4b6',
      collar: '#fe5f55',
      expression: 'crazy',
      label: '3K',
      labelColor: '#fda200',
    });
  });
  reg(4, 0, (ctx, ox, oy) => {
    // j_mad (Mad Joker — Two Pair Mult)
    drawIvoryArtWindow(ctx, ox, oy, '#381c20', '#fe5f55', 'rays', 'rgba(254,95,85,0.18)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#d93829',
      hatRight: '#8f1b1b',
      collar: '#fda200',
      expression: 'mad',
      label: '2P',
      labelColor: '#ff9b94',
    });
  });
  reg(5, 0, (ctx, ox, oy) => {
    // j_crazy (Crazy Joker — Straight Mult)
    drawIvoryArtWindow(ctx, ox, oy, '#241b3d', '#b26cbb', 'stripes', 'rgba(75,194,146,0.16)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#b26cbb',
      hatRight: '#4bc292',
      collar: '#fe5f55',
      expression: 'crazy',
      label: 'ST',
      labelColor: '#8af2ba',
    });
  });
  reg(6, 0, (ctx, ox, oy) => {
    // j_droll (Droll Joker — Flush Mult)
    drawIvoryArtWindow(ctx, ox, oy, '#e8f4f8', '#3c6eb8', 'stripes', 'rgba(60,110,184,0.12)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#3c6eb8',
      hatRight: '#4f6367',
      collar: '#80d0ff',
      expression: 'droll',
      label: 'FL',
      labelColor: '#3c6eb8',
    });
  });
  reg(7, 0, (ctx, ox, oy) => {
    // j_half (Half Joker — torn top half of ivory card)
    drawCardBase(ctx, ox, oy, IVORY, IVORY_SHADE, OUTLINE);
    ctx.fillStyle = '#f2efe6';
    ctx.fillRect(ox + 6, oy + 6, 59, 48);
    ctx.fillStyle = '#fe5f55';
    ctx.fillRect(ox + 6, oy + 6, 59, 2);
    ctx.fillRect(ox + 6, oy + 6, 2, 48);
    ctx.fillRect(ox + 63, oy + 6, 2, 48);
    drawJesterPortrait(ctx, ox, oy - 6, { hatLeft: '#fe5f55', hatRight: '#009dff', collar: '#f3b958' });
    ctx.clearRect(ox, oy + 54, 71, 41);
    ctx.fillStyle = OUTLINE;
    for (let x = 2; x < 68; x += 6) {
      ctx.fillRect(ox + x, oy + 51 + (x % 12 === 2 ? 2 : 0), 6, 3);
    }
  });
  reg(8, 0, (ctx, ox, oy) => {
    // j_merry_andy (Merry Andy)
    drawIvoryArtWindow(ctx, ox, oy, '#eaf5ea', '#2ea36b', 'checker', 'rgba(46,163,107,0.12)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#fe5f55',
      hatRight: '#2ea36b',
      collar: '#f3b958',
      expression: 'laugh',
      beard: '#8c5a32',
    });
  });
  reg(9, 0, (ctx, ox, oy) => {
    // j_stone (Stone Joker)
    drawIvoryArtWindow(ctx, ox, oy, '#6e767d', '#42494f', 'dots', 'rgba(255,255,255,0.14)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#9aa2a8',
      hatRight: '#788087',
      face: '#b8c0c7',
      collar: '#60686e',
      smile: '#474e54',
      expression: 'droll',
      cracks: true,
    });
  });

  // --- ROW 1: Performers, Card/Finance, and the 4 Suit-Sin Jesters ---
  reg(0, 1, (ctx, ox, oy) => {
    // j_juggler (Juggler)
    drawIvoryArtWindow(ctx, ox, oy, '#edf6ff', '#009dff', 'dots', 'rgba(0,157,255,0.12)');
    drawJesterPortrait(ctx, ox, oy + 7, { hatLeft: '#009dff', hatRight: '#fda200', collar: '#4bc292' });
    drawPixelCircle(ctx, ox + 17, oy + 19, 5, '#fe5f55', OUTLINE);
    drawPixelCircle(ctx, ox + 35, oy + 13, 5, '#f5c542', OUTLINE);
    drawPixelCircle(ctx, ox + 53, oy + 19, 5, '#4bc292', OUTLINE);
  });
  reg(1, 1, (ctx, ox, oy) => {
    // j_drunkard (Drunkard)
    drawIvoryArtWindow(ctx, ox, oy, '#f7ecd8', '#b86b35', 'stripes', 'rgba(184,107,53,0.12)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#8f4726',
      hatRight: '#d98a36',
      face: '#ffe0cc',
      collar: '#4bc292',
      expression: 'wink',
    });
    // Rosy nose & floating hiccup bubbles
    drawPixelCircle(ctx, ox + 35, oy + 47, 3, '#fe5f55');
    drawPixelCircle(ctx, ox + 52, oy + 20, 3, '#a8e6ff', OUTLINE);
    drawPixelCircle(ctx, ox + 56, oy + 13, 2, '#d6f5ff', OUTLINE);
  });
  reg(2, 1, (ctx, ox, oy) => {
    // j_acrobat (Acrobat)
    drawIvoryArtWindow(ctx, ox, oy, '#241a38', '#fe5f55', 'rays', 'rgba(255,224,102,0.12)');
    // Trapeze bar
    ctx.fillStyle = '#f3b958';
    ctx.fillRect(ox + 16, oy + 10, 2, 14);
    ctx.fillRect(ox + 53, oy + 10, 2, 14);
    ctx.fillRect(ox + 15, oy + 23, 41, 3);
    // Agile leaping figure
    drawPixelCircle(ctx, ox + 35, oy + 41, 8, '#ffdfba', OUTLINE);
    ctx.fillStyle = '#fe5f55';
    ctx.fillRect(ox + 26, oy + 49, 19, 18);
    ctx.fillStyle = '#f3b958';
    ctx.fillRect(ox + 33, oy + 49, 5, 18);
    ctx.fillRect(ox + 20, oy + 25, 4, 24);
    ctx.fillRect(ox + 47, oy + 25, 4, 24);
    drawPixelText(ctx, 'X3', ox + 35, oy + 76, 1, '#ffe066', { align: 'center', outlineColor: OUTLINE });
  });
  reg(3, 1, (ctx, ox, oy) => {
    // j_sock_and_buskin (Comedy & Tragedy Masks)
    drawIvoryArtWindow(ctx, ox, oy, '#2b1826', '#f3b958', 'checker', 'rgba(243,185,88,0.12)');
    drawSprite(ctx, ICON_SPRITES.mask, { a: '#f3b958', b: '#faf6ee', c: '#fe5f55' }, ox + 26, oy + 38, 2, OUTLINE);
    drawSprite(ctx, ICON_SPRITES.mask, { a: '#9aa8b8', b: '#384659', c: '#6ec5ff' }, ox + 45, oy + 58, 2, OUTLINE);
  });
  reg(4, 1, (ctx, ox, oy) => {
    // j_mime (Mime)
    drawIvoryArtWindow(ctx, ox, oy, '#252a30', '#ffffff', 'stripes', 'rgba(255,255,255,0.08)');
    for (let y = 58; y < 84; y += 6) {
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
  });
  reg(5, 1, (ctx, ox, oy) => {
    // j_credit_card (Credit Card)
    drawIvoryArtWindow(ctx, ox, oy, '#dcecff', '#2b5ea8', 'dots', 'rgba(43,94,168,0.12)');
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 11, oy + 24, 49, 44);
    ctx.fillStyle = '#1f5ec4';
    ctx.fillRect(ox + 13, oy + 26, 45, 40);
    ctx.fillStyle = '#143b80';
    ctx.fillRect(ox + 13, oy + 32, 45, 7);
    ctx.fillStyle = '#f5c542';
    ctx.fillRect(ox + 17, oy + 44, 10, 8);
    drawPixelText(ctx, '-$20', ox + 36, oy + 56, 1, '#ffffff', { align: 'center' });
  });
  reg(6, 1, (ctx, ox, oy) => {
    // j_greedy_joker (Diamonds)
    drawIvoryArtWindow(ctx, ox, oy, '#fff5dc', '#e29000', 'dots', 'rgba(226,144,0,0.15)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#f3b958',
      hatRight: '#e29000',
      face: '#fff8e6',
      collar: '#fe5f55',
      suitBadge: { suit: 'Diamonds', color: '#e29000' },
    });
  });
  reg(7, 1, (ctx, ox, oy) => {
    // j_lusty_joker (Hearts)
    drawIvoryArtWindow(ctx, ox, oy, '#ffe8ec', '#fe5f55', 'dots', 'rgba(254,95,85,0.15)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#fe5f55',
      hatRight: '#e83b5c',
      face: '#fff0f2',
      collar: '#ff9eb5',
      suitBadge: { suit: 'Hearts', color: '#fe5f55' },
    });
  });
  reg(8, 1, (ctx, ox, oy) => {
    // j_wrathful_joker (Spades)
    drawIvoryArtWindow(ctx, ox, oy, '#e6e8f2', '#374649', 'dots', 'rgba(79,49,185,0.14)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#374649',
      hatRight: '#4f31b9',
      face: '#ebeef5',
      collar: '#7c62d6',
      expression: 'mad',
      suitBadge: { suit: 'Spades', color: '#374649' },
    });
  });
  reg(9, 1, (ctx, ox, oy) => {
    // j_gluttenous_joker (Clubs)
    drawIvoryArtWindow(ctx, ox, oy, '#e4f5f0', '#2c6e58', 'dots', 'rgba(46,163,107,0.15)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#2ea36b',
      hatRight: '#008ee6',
      face: '#ebf7f2',
      collar: '#4bc292',
      expression: 'laugh',
      suitBadge: { suit: 'Clubs', color: '#2c6e58' },
    });
  });

  // --- ROW 2: Troubadour, Banner, Summit, Marble, Loyalty, Hack, Misprint, Steel, Fist, Golden ---
  reg(0, 2, (ctx, ox, oy) => {
    // j_troubadour (Lute & music notes)
    drawIvoryArtWindow(ctx, ox, oy, '#382540', '#f3b958', 'stars', 'rgba(255,224,130,0.35)');
    drawSprite(ctx, ICON_SPRITES.lute, { a: '#d98a36', b: '#78421b' }, ox + 35, oy + 51, 3, OUTLINE);
    ctx.fillStyle = '#ffe082';
    ctx.fillRect(ox + 16, oy + 20, 3, 9);
    ctx.fillRect(ox + 14, oy + 27, 5, 4);
    ctx.fillRect(ox + 49, oy + 16, 3, 9);
    ctx.fillRect(ox + 47, oy + 23, 5, 4);
  });
  reg(1, 2, (ctx, ox, oy) => {
    // j_banner (Heraldic Banner)
    drawIvoryArtWindow(ctx, ox, oy, '#1f3f69', '#f3b958', 'stripes', 'rgba(255,255,255,0.08)');
    ctx.fillStyle = '#f3b958';
    ctx.fillRect(ox + 14, oy + 14, 43, 4);
    ctx.fillRect(ox + 19, oy + 18, 33, 50);
    ctx.fillStyle = '#009dff';
    ctx.fillRect(ox + 22, oy + 21, 27, 42);
    ctx.fillStyle = '#1f3f69';
    ctx.fillRect(ox + 30, oy + 62, 11, 8);
    drawPixelText(ctx, '+30', ox + 35, oy + 38, 1, '#ffffff', { align: 'center', outlineColor: OUTLINE });
  });
  reg(2, 2, (ctx, ox, oy) => {
    // j_mystic_summit (Snow-capped Violet Peak)
    drawIvoryArtWindow(ctx, ox, oy, '#281f47', '#f3b958', 'stars', 'rgba(255,235,160,0.45)');
    drawPixelCircle(ctx, ox + 35, oy + 32, 11, '#ffd166', '#ff9e42');
    // Mountain triangle
    for (let r = 0; r < 34; r++) {
      const w = 4 + r * 2;
      ctx.fillStyle = r < 11 ? '#f5f7fa' : '#584b8a';
      ctx.fillRect(ox + 35 - Math.floor(w / 2), oy + 46 + r, Math.min(w, 55), 1);
    }
    ctx.fillStyle = '#382d63';
    for (let r = 11; r < 34; r++) {
      ctx.fillRect(ox + 36, oy + 46 + r, Math.min(r, 24), 1);
    }
  });
  reg(3, 2, (ctx, ox, oy) => {
    // j_marble (Marble Statue Bust)
    drawIvoryArtWindow(ctx, ox, oy, '#2c4257', '#e6edf2', 'stripes', 'rgba(255,255,255,0.08)');
    drawJesterPortrait(ctx, ox, oy - 3, {
      hatLeft: '#edf2f7',
      hatRight: '#cfd9e3',
      face: '#ffffff',
      collar: '#d7e0e8',
      smile: '#8f9fad',
      expression: 'droll',
    });
    ctx.fillStyle = '#cfd9e3';
    ctx.fillRect(ox + 22, oy + 76, 27, 8);
  });
  reg(4, 2, (ctx, ox, oy) => {
    // j_loyalty_card (Cafe Punch Card)
    drawIvoryArtWindow(ctx, ox, oy, '#f7ecd5', '#8c5a32', 'none');
    drawPixelText(ctx, 'X4', ox + 35, oy + 16, 2, '#c94c38', { align: 'center' });
    for (let i = 0; i < 6; i++) {
      const cx = ox + 21 + (i % 3) * 14;
      const cy = oy + 44 + Math.floor(i / 3) * 16;
      drawPixelCircle(ctx, cx, cy, 5, i < 5 ? '#4bc292' : '#d6c7ad', OUTLINE);
    }
    drawPixelText(ctx, 'LOYAL', ox + 35, oy + 75, 1, '#5c3c20', { align: 'center' });
  });
  reg(5, 2, (ctx, ox, oy) => {
    // j_hack (Brick Wall Comedy Mic)
    drawIvoryArtWindow(ctx, ox, oy, '#782b24', '#f3b958', 'none');
    // Brick pattern
    ctx.fillStyle = '#571c17';
    for (let y = 10; y < 86; y += 8) {
      ctx.fillRect(ox + 8, oy + y, 55, 1);
      for (let x = 10 + ((y >> 3) % 2) * 6; x < 60; x += 12) {
        ctx.fillRect(ox + x, oy + y, 1, 8);
      }
    }
    // Chrome mic on stand
    drawPixelCircle(ctx, ox + 35, oy + 32, 9, '#d7e2eb', OUTLINE);
    ctx.fillStyle = '#6e7f8f';
    ctx.fillRect(ox + 29, oy + 30, 13, 2);
    ctx.fillRect(ox + 29, oy + 34, 13, 2);
    ctx.fillStyle = '#22292d';
    ctx.fillRect(ox + 33, oy + 42, 5, 36);
    ctx.fillRect(ox + 24, oy + 76, 23, 5);
  });
  reg(6, 2, (ctx, ox, oy) => {
    // j_misprint (CMYK Glitch Double-Print Jester)
    drawIvoryArtWindow(ctx, ox, oy, '#f2ede4', '#e84393', 'stripes', 'rgba(0,200,255,0.18)');
    drawJesterPortrait(ctx, ox - 4, oy - 2, {
      hatLeft: '#00d2ff',
      hatRight: '#00d2ff',
      face: '#d6f8ff',
      collar: '#00d2ff',
      smile: '#009dff',
    });
    drawJesterPortrait(ctx, ox + 3, oy + 2, {
      hatLeft: '#fe5f55',
      hatRight: '#e84393',
      face: '#fff5f8',
      collar: '#ffe066',
      expression: 'crazy',
      label: '?M',
      labelColor: '#ffe066',
    });
  });
  reg(7, 2, (ctx, ox, oy) => {
    // j_steel_joker (Riveted Steel Jester)
    drawIvoryArtWindow(ctx, ox, oy, '#8d9dab', '#4f6367', 'stripes', 'rgba(255,255,255,0.2)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#647585',
      hatRight: '#b0bec9',
      face: '#dce4eb',
      collar: '#52606d',
      smile: '#22292d',
    });
  });
  reg(8, 2, (ctx, ox, oy) => {
    // j_raised_fist (Bold Raised Fist)
    drawIvoryArtWindow(ctx, ox, oy, '#ffdf85', '#d9483b', 'rays', 'rgba(254,95,85,0.22)');
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 21, oy + 24, 29, 26);
    ctx.fillRect(ox + 26, oy + 50, 19, 26);
    ctx.fillStyle = '#c94c38';
    ctx.fillRect(ox + 23, oy + 26, 25, 22);
    ctx.fillRect(ox + 28, oy + 50, 15, 24);
    ctx.fillStyle = OUTLINE;
    for (let f = 0; f < 4; f++) ctx.fillRect(ox + 24 + f * 6, oy + 26, 2, 12);
    ctx.fillStyle = '#f5c542';
    ctx.fillRect(ox + 26, oy + 38, 19, 4);
  });
  reg(9, 2, (ctx, ox, oy) => {
    // j_golden (24k Gold Jester)
    drawIvoryArtWindow(ctx, ox, oy, '#f7cf54', '#b87f1c', 'rays', 'rgba(255,250,190,0.45)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#ffd84d',
      hatRight: '#d9981e',
      face: '#fff2a6',
      collar: '#b87f1c',
      smile: '#8f590a',
      label: '+$4',
      labelColor: '#fff5bf',
    });
  });

  // --- ROW 3: Blueprint, Glass, Scary, Abstract, Delayed Grat, Ticket, Pareidolia, Cartomancer, Even/Odd ---
  reg(0, 3, (ctx, ox, oy) => {
    // j_blueprint (Architectural Blueprint)
    drawIvoryArtWindow(ctx, ox, oy, '#1652a6', '#7cc6ff', 'grid', 'rgba(140,215,255,0.3)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#3a86e8',
      hatRight: '#296cc4',
      face: '#63b0ff',
      collar: '#1c4f99',
      smile: '#ffffff',
      label: 'BP',
      labelColor: '#ffffff',
    });
  });
  reg(1, 3, (ctx, ox, oy) => {
    // j_glass (Crystalline Glass Jester)
    drawIvoryArtWindow(ctx, ox, oy, '#d6f2ff', '#5c9ec2', 'rays', 'rgba(255,255,255,0.55)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#99dcff',
      hatRight: '#d9f6ff',
      face: '#eefaff',
      collar: '#72b8de',
      smile: '#3d7da1',
    });
    drawSparkle(ctx, ox + 17, oy + 20, '#ffffff', 4);
    drawSparkle(ctx, ox + 53, oy + 68, '#ffffff', 3);
  });
  reg(2, 3, (ctx, ox, oy) => {
    // j_scary_face (Spooky Phantom Face)
    drawIvoryArtWindow(ctx, ox, oy, '#1b1726', '#8867a5', 'dots', 'rgba(136,103,165,0.18)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#372b4f',
      hatRight: '#221b33',
      face: '#cfd4e0',
      collar: '#4d3a70',
      expression: 'scary',
    });
  });
  reg(3, 3, (ctx, ox, oy) => {
    // j_abstract (Cubist / Mondrian Jester)
    drawIvoryArtWindow(ctx, ox, oy, '#faf6ee', OUTLINE, 'none');
    ctx.fillStyle = '#fe5f55';
    ctx.fillRect(ox + 10, oy + 12, 24, 30);
    ctx.fillStyle = '#009dff';
    ctx.fillRect(ox + 36, oy + 12, 25, 22);
    ctx.fillStyle = '#f5c542';
    ctx.fillRect(ox + 10, oy + 44, 18, 40);
    ctx.fillStyle = '#4bc292';
    ctx.fillRect(ox + 30, oy + 36, 31, 26);
    ctx.fillStyle = '#b26cbb';
    ctx.fillRect(ox + 30, oy + 64, 31, 20);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 34, oy + 10, 3, 76);
    ctx.fillRect(ox + 10, oy + 42, 51, 3);
    drawPixelCircle(ctx, ox + 22, oy + 27, 4, '#ffffff', OUTLINE);
    drawPixelCircle(ctx, ox + 48, oy + 48, 5, '#ffe066', OUTLINE);
  });
  reg(4, 3, (ctx, ox, oy) => {
    // j_delayed_grat (Golden Hourglass)
    drawIvoryArtWindow(ctx, ox, oy, '#243040', '#f3b958', 'dots', 'rgba(243,185,88,0.16)');
    drawSprite(
      ctx,
      ICON_SPRITES.hourglass,
      { a: '#f3b958', b: '#d6f2ff', c: '#ffcf40' },
      ox + 35,
      oy + 45,
      3,
      OUTLINE
    );
    drawPixelText(ctx, '+$2', ox + 35, oy + 76, 1, '#ffe066', { align: 'center', outlineColor: OUTLINE });
  });
  reg(5, 3, (ctx, ox, oy) => {
    // j_ticket (Golden Ticket)
    drawIvoryArtWindow(ctx, ox, oy, '#5c3c0c', '#ffd866', 'rays', 'rgba(255,224,102,0.2)');
    drawSprite(
      ctx,
      ICON_SPRITES.ticket,
      { a: '#c98818', b: '#ffe066', c: '#fe5f55' },
      ox + 35,
      oy + 44,
      3,
      OUTLINE
    );
    drawPixelText(ctx, '$4', ox + 35, oy + 74, 1, '#ffe066', { align: 'center', outlineColor: OUTLINE });
  });
  reg(6, 3, (ctx, ox, oy) => {
    // j_pareidolia (Hidden Face in Everyday Objects)
    drawIvoryArtWindow(ctx, ox, oy, '#dce8e0', '#4f6367', 'checker', 'rgba(79,99,103,0.1)');
    // Retro cream wall-socket face!
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 17, oy + 19, 37, 56);
    ctx.fillStyle = '#faf5e8';
    ctx.fillRect(ox + 19, oy + 21, 33, 52);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 26, oy + 33, 4, 10);
    ctx.fillRect(ox + 41, oy + 33, 4, 10);
    drawPixelCircle(ctx, ox + 35, oy + 57, 6, OUTLINE);
    ctx.fillStyle = '#fe5f55';
    ctx.fillRect(ox + 22, oy + 46, 4, 2);
    ctx.fillRect(ox + 45, oy + 46, 4, 2);
  });
  reg(7, 3, (ctx, ox, oy) => {
    // j_cartomancer (Mystic Hooded Tarot Seer)
    drawIvoryArtWindow(ctx, ox, oy, '#2d1c47', '#b26cbb', 'stars', 'rgba(255,224,130,0.4)');
    // Hooded cloak
    ctx.fillStyle = '#5e388a';
    ctx.fillRect(ox + 21, oy + 20, 29, 32);
    ctx.fillStyle = '#1d1230';
    ctx.fillRect(ox + 26, oy + 26, 19, 20);
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(ox + 30, oy + 34, 3, 3);
    ctx.fillRect(ox + 38, oy + 34, 3, 3);
    // 3 Fanned Tarot mini-cards
    for (let i = -1; i <= 1; i++) {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 28 + i * 12, oy + 53 + Math.abs(i) * 3, 14, 22);
      ctx.fillStyle = '#ede0c8';
      ctx.fillRect(ox + 29 + i * 12, oy + 54 + Math.abs(i) * 3, 12, 20);
      ctx.fillStyle = '#8867a5';
      ctx.fillRect(ox + 31 + i * 12, oy + 57 + Math.abs(i) * 3, 8, 14);
    }
  });
  reg(8, 3, (ctx, ox, oy) => {
    // j_even_steven (Even Steven)
    drawIvoryArtWindow(ctx, ox, oy, '#e3f4ff', '#009dff', 'dots', 'rgba(0,157,255,0.14)');
    drawJesterPortrait(ctx, ox, oy - 3, { hatLeft: '#009dff', hatRight: '#4bc292', collar: '#f3b958' });
    drawPixelText(ctx, '2468', ox + 35, oy + 77, 1, '#007acc', { align: 'center' });
  });
  reg(9, 3, (ctx, ox, oy) => {
    // j_odd_todd (Odd Todd)
    drawIvoryArtWindow(ctx, ox, oy, '#fff0e6', '#fda200', 'dots', 'rgba(253,162,0,0.14)');
    drawJesterPortrait(ctx, ox, oy - 3, { hatLeft: '#fda200', hatRight: '#fe5f55', collar: '#009dff' });
    drawPixelText(ctx, '3579', ox + 35, oy + 77, 1, '#c94c38', { align: 'center' });
  });

  // --- ROW 4: Scholar, Business, Supernova, Mr. Bones, Seeing Double, Duo/Trio/Family/Order/Tribe ---
  reg(0, 4, (ctx, ox, oy) => {
    // j_scholar (Scholar)
    drawIvoryArtWindow(ctx, ox, oy, '#2c4052', '#f3b958', 'stripes', 'rgba(255,255,255,0.08)');
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 15, oy + 24, 41, 10);
    ctx.fillStyle = '#22292d';
    ctx.fillRect(ox + 17, oy + 26, 37, 6);
    ctx.fillRect(ox + 24, oy + 34, 23, 10);
    ctx.fillStyle = '#f3b958';
    ctx.fillRect(ox + 51, oy + 28, 3, 20);
    drawPixelText(ctx, 'A+', ox + 35, oy + 56, 2, '#fe5f55', { align: 'center', outlineColor: OUTLINE });
  });
  reg(1, 4, (ctx, ox, oy) => {
    // j_business (Business Card)
    drawIvoryArtWindow(ctx, ox, oy, '#faf6ee', '#374649', 'none');
    // Executive red necktie & crisp typography lines
    ctx.fillStyle = '#fe5f55';
    ctx.fillRect(ox + 16, oy + 20, 6, 4);
    ctx.fillRect(ox + 17, oy + 24, 4, 16);
    ctx.fillRect(ox + 18, oy + 40, 2, 3);
    ctx.fillStyle = '#374649';
    ctx.fillRect(ox + 28, oy + 22, 28, 4);
    ctx.fillStyle = '#8b99a6';
    ctx.fillRect(ox + 28, oy + 31, 24, 3);
    ctx.fillRect(ox + 28, oy + 38, 20, 3);
    drawPixelText(ctx, 'CEO $', ox + 35, oy + 62, 1, '#c98e1e', { align: 'center' });
  });
  reg(2, 4, (ctx, ox, oy) => {
    // j_supernova (Supernova)
    drawIvoryArtWindow(ctx, ox, oy, '#160f2b', '#ff8c42', 'stars', 'rgba(255,230,128,0.55)');
    drawPixelCircle(ctx, ox + 35, oy + 47, 22, 'rgba(254,95,85,0.4)');
    drawSprite(ctx, ICON_SPRITES.star8, { a: '#ff7b29', b: '#fff4a6' }, ox + 35, oy + 47, 3, '#c7388a');
    drawPixelCircle(ctx, ox + 35, oy + 47, 6, '#ffffff');
  });
  reg(3, 4, (ctx, ox, oy) => {
    // j_mr_bones (Mr. Bones)
    drawIvoryArtWindow(ctx, ox, oy, '#211e29', '#e6e1d3', 'dots', 'rgba(75,194,146,0.16)');
    drawSprite(ctx, ICON_SPRITES.skull, { a: '#f5f2eb' }, ox + 35, oy + 40, 3, OUTLINE);
    ctx.fillStyle = '#fe5f55';
    ctx.fillRect(ox + 25, oy + 67, 21, 7);
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(ox + 33, oy + 68, 5, 5);
  });
  reg(4, 4, (ctx, ox, oy) => {
    // j_seeing_double (Seeing Double)
    drawIvoryArtWindow(ctx, ox, oy, '#1f2336', '#6ec5ff', 'checker', 'rgba(255,255,255,0.06)');
    drawPixelCircle(ctx, ox + 27, oy + 45, 14, 'rgba(0,157,255,0.75)', OUTLINE);
    drawPixelCircle(ctx, ox + 43, oy + 45, 14, 'rgba(254,95,85,0.75)', OUTLINE);
    drawSuitIcon(ctx, 'Clubs', ox + 26, oy + 45, 'md', '#ffffff');
    drawSuitIcon(ctx, 'Hearts', ox + 44, oy + 45, 'md', '#ffffff');
    drawPixelText(ctx, 'X2', ox + 35, oy + 74, 1, '#ffe066', { align: 'center', outlineColor: OUTLINE });
  });
  reg(5, 4, (ctx, ox, oy) => {
    // j_duo (The Duo — Pair X2)
    drawIvoryArtWindow(ctx, ox, oy, '#381e24', '#fe5f55', 'dots', 'rgba(254,95,85,0.18)');
    drawPixelCircle(ctx, ox + 27, oy + 44, 12, '#fe5f55', OUTLINE);
    drawPixelCircle(ctx, ox + 43, oy + 44, 12, '#f5c542', OUTLINE);
    drawPixelCircle(ctx, ox + 27, oy + 44, 6, '#381e24');
    drawPixelCircle(ctx, ox + 43, oy + 44, 6, '#381e24');
    drawPixelText(ctx, 'X2', ox + 35, oy + 72, 2, '#ffffff', { align: 'center', outlineColor: OUTLINE });
  });
  reg(6, 4, (ctx, ox, oy) => {
    // j_trio (The Trio — Trips X3)
    drawIvoryArtWindow(ctx, ox, oy, '#1a332b', '#4bc292', 'dots', 'rgba(75,194,146,0.18)');
    drawPixelCircle(ctx, ox + 35, oy + 31, 10, '#4bc292', OUTLINE);
    drawPixelCircle(ctx, ox + 24, oy + 51, 10, '#f3b958', OUTLINE);
    drawPixelCircle(ctx, ox + 46, oy + 51, 10, '#009dff', OUTLINE);
    drawPixelText(ctx, 'X3', ox + 35, oy + 72, 2, '#ffffff', { align: 'center', outlineColor: OUTLINE });
  });
  reg(7, 4, (ctx, ox, oy) => {
    // j_family (The Family — 4OAK X4)
    drawIvoryArtWindow(ctx, ox, oy, '#1c2a47', '#009dff', 'grid', 'rgba(0,157,255,0.18)');
    const cols = ['#fe5f55', '#009dff', '#4bc292', '#f3b958'];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 18 + (i % 2) * 19, oy + 20 + Math.floor(i / 2) * 20, 16, 16);
      ctx.fillStyle = cols[i]!;
      ctx.fillRect(ox + 20 + (i % 2) * 19, oy + 22 + Math.floor(i / 2) * 20, 12, 12);
    }
    drawPixelText(ctx, 'X4', ox + 35, oy + 71, 2, '#ffe066', { align: 'center', outlineColor: OUTLINE });
  });
  reg(8, 4, (ctx, ox, oy) => {
    // j_order (The Order — Straight X3)
    drawIvoryArtWindow(ctx, ox, oy, '#2d243b', '#f3b958', 'stripes', 'rgba(243,185,88,0.12)');
    const steps = ['#fe5f55', '#fda200', '#f5d742', '#4bc292', '#009dff'];
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = steps[i]!;
      ctx.fillRect(ox + 13 + i * 9, oy + 58 - i * 8, 8, 12 + i * 8);
    }
    drawPixelText(ctx, 'X3', ox + 35, oy + 75, 1, '#ffffff', { align: 'center', outlineColor: OUTLINE });
  });
  reg(9, 4, (ctx, ox, oy) => {
    // j_tribe (The Tribe — Flush X2)
    drawIvoryArtWindow(ctx, ox, oy, '#243836', '#fe5f55', 'checker', 'rgba(75,194,146,0.14)');
    drawSprite(ctx, ICON_SPRITES.shield, { a: '#f3b958', b: '#fe5f55', c: '#4bc292' }, ox + 35, oy + 42, 3, OUTLINE);
    drawPixelText(ctx, 'X2', ox + 35, oy + 73, 2, '#ffe066', { align: 'center', outlineColor: OUTLINE });
  });

  // --- ROW 5: 8 Ball, Fibonacci, Stencil, Space, Matador, Dagger, Showman, Fortune Teller, Road, Swashbuckler ---
  reg(0, 5, (ctx, ox, oy) => {
    // j_8_ball (8 Ball)
    drawIvoryArtWindow(ctx, ox, oy, '#1c4f38', '#4bc292', 'dots', 'rgba(255,255,255,0.08)');
    drawPixelCircle(ctx, ox + 35, oy + 47, 20, '#181c22', OUTLINE);
    drawPixelCircle(ctx, ox + 28, oy + 38, 4, 'rgba(255,255,255,0.4)');
    drawPixelCircle(ctx, ox + 35, oy + 48, 10, '#ffffff', OUTLINE);
    drawPixelText(ctx, '8', ox + 35, oy + 42, 2, '#181c22', { align: 'center' });
  });
  reg(1, 5, (ctx, ox, oy) => {
    // j_fibonacci (Fibonacci Golden Spiral)
    drawIvoryArtWindow(ctx, ox, oy, '#f2e8d5', '#d97b29', 'grid', 'rgba(217,123,41,0.18)');
    // Golden spiral boxes
    ctx.fillStyle = '#d97b29';
    ctx.fillRect(ox + 14, oy + 16, 42, 2);
    ctx.fillRect(ox + 14, oy + 16, 2, 42);
    ctx.fillRect(ox + 54, oy + 16, 2, 30);
    ctx.fillRect(ox + 32, oy + 44, 24, 2);
    drawPixelText(ctx, '1 1 2', ox + 35, oy + 24, 1, '#d97b29', { align: 'center' });
    drawPixelText(ctx, '3 5 8', ox + 35, oy + 56, 2, '#2b5973', { align: 'center' });
  });
  reg(2, 5, (ctx, ox, oy) => {
    // j_stencil (Joker Stencil Cutout)
    drawIvoryArtWindow(ctx, ox, oy, '#ebe4d5', '#5f7377', 'checker', 'rgba(95,115,119,0.14)');
    // Punched dark void silhouette of a Jester
    ctx.fillStyle = '#1b2429';
    ctx.fillRect(ox + 15, oy + 18, 41, 14);
    ctx.fillRect(ox + 23, oy + 32, 25, 28);
    ctx.fillRect(ox + 17, oy + 62, 37, 16);
    drawPixelText(ctx, 'X?', ox + 35, oy + 42, 2, '#70f3ff', { align: 'center' });
  });
  reg(3, 5, (ctx, ox, oy) => {
    // j_space (Space Joker)
    drawIvoryArtWindow(ctx, ox, oy, '#141a33', '#6fd3ff', 'stars', 'rgba(255,235,160,0.6)');
    drawPixelCircle(ctx, ox + 35, oy + 47, 19, '#edf2f7', OUTLINE);
    drawPixelCircle(ctx, ox + 35, oy + 47, 13, '#1f2b4d', OUTLINE);
    ctx.fillStyle = '#6fd3ff';
    ctx.fillRect(ox + 27, oy + 40, 6, 4);
    drawSparkle(ctx, ox + 40, oy + 49, '#ffe680', 2);
  });
  reg(4, 5, (ctx, ox, oy) => {
    // j_matador (Matador)
    drawIvoryArtWindow(ctx, ox, oy, '#f7e5c6', '#c93838', 'rays', 'rgba(201,56,56,0.14)');
    // Montera hat + gold-trimmed crimson cape
    ctx.fillStyle = '#1c1f24';
    ctx.fillRect(ox + 17, oy + 18, 37, 12);
    ctx.fillRect(ox + 23, oy + 14, 25, 6);
    ctx.fillStyle = '#d93829';
    ctx.fillRect(ox + 14, oy + 36, 43, 40);
    ctx.fillStyle = '#f3b958';
    ctx.fillRect(ox + 16, oy + 38, 39, 4);
    ctx.fillRect(ox + 16, oy + 70, 39, 4);
    drawPixelText(ctx, 'OLE', ox + 35, oy + 52, 1, '#ffe066', { align: 'center', outlineColor: OUTLINE });
  });
  reg(5, 5, (ctx, ox, oy) => {
    // j_ceremonial (Ceremonial Dagger)
    drawIvoryArtWindow(ctx, ox, oy, '#381824', '#fe5f55', 'rays', 'rgba(254,95,85,0.16)');
    drawSprite(
      ctx,
      ICON_SPRITES.dagger,
      { a: '#cfd8e3', b: '#ffffff', c: '#f3b958', d: '#b8293d' },
      ox + 35,
      oy + 47,
      3,
      OUTLINE
    );
  });
  reg(6, 5, (ctx, ox, oy) => {
    // j_ring_master (Showman Top Hat & Spotlight)
    drawIvoryArtWindow(ctx, ox, oy, '#361926', '#f3b958', 'rays', 'rgba(255,224,102,0.18)');
    drawSprite(ctx, ICON_SPRITES.tophat, { a: '#22292d', b: '#fe5f55' }, ox + 35, oy + 42, 3, OUTLINE);
    drawSparkle(ctx, ox + 20, oy + 24, '#ffe066', 4);
    drawSparkle(ctx, ox + 52, oy + 66, '#ffe066', 4);
    drawPixelText(ctx, 'SHOW', ox + 35, oy + 72, 1, '#ffe066', { align: 'center', outlineColor: OUTLINE });
  });
  reg(7, 5, (ctx, ox, oy) => {
    // j_fortune_teller (Crystal Ball)
    drawIvoryArtWindow(ctx, ox, oy, '#24183d', '#b26cbb', 'stars', 'rgba(200,166,255,0.5)');
    drawSprite(
      ctx,
      ICON_SPRITES.crystalBall,
      { a: '#cfaef0', b: '#7848bd', w: '#ffffff', c: '#f3b958' },
      ox + 35,
      oy + 47,
      3,
      OUTLINE
    );
  });
  reg(8, 5, (ctx, ox, oy) => {
    // j_hit_the_road (Desert Highway & Jack Sign)
    drawIvoryArtWindow(ctx, ox, oy, '#f59f5b', '#d94c38', 'none');
    // Sunset sky + receding asphalt highway
    ctx.fillStyle = '#ffe082';
    ctx.fillRect(ox + 8, oy + 32, 55, 12);
    ctx.fillStyle = '#c46a33';
    ctx.fillRect(ox + 8, oy + 44, 55, 43);
    for (let r = 0; r < 43; r++) {
      const rw = 8 + Math.floor(r * 0.9);
      ctx.fillStyle = '#374244';
      ctx.fillRect(ox + 35 - Math.floor(rw / 2), oy + 44 + r, rw, 1);
    }
    ctx.fillStyle = '#ffe066';
    for (let y = 48; y < 84; y += 9) ctx.fillRect(ox + 34, oy + y, 3, 5);
    drawPixelText(ctx, 'J', ox + 35, oy + 16, 2, '#ffffff', { align: 'center', outlineColor: OUTLINE });
  });
  reg(9, 5, (ctx, ox, oy) => {
    // j_swashbuckler (Pirate Cutlass & Skull)
    drawIvoryArtWindow(ctx, ox, oy, '#1b364a', '#f3b958', 'stripes', 'rgba(255,255,255,0.08)');
    // Tricorn pirate hat + skull
    ctx.fillStyle = '#22292d';
    ctx.fillRect(ox + 14, oy + 20, 43, 18);
    ctx.fillRect(ox + 22, oy + 14, 27, 8);
    drawSprite(ctx, ICON_SPRITES.skull, { a: '#ffffff' }, ox + 35, oy + 28, 1, OUTLINE);
    drawSprite(
      ctx,
      ICON_SPRITES.sword,
      { a: '#dce6f0', b: '#ffffff', c: '#f3b958', d: '#8f2438' },
      ox + 35,
      oy + 61,
      2,
      OUTLINE
    );
  });

  // --- ROW 6: Flower Pot, Ride the Bus, Shoot the Moon, Smeared, Oops All 6s, Four Fingers, Gros Michel, Stuntman, Hanging Chad ---
  reg(0, 6, (ctx, ox, oy) => {
    // j_flower_pot (4-Suit Flower Pot)
    drawIvoryArtWindow(ctx, ox, oy, '#e6f7ea', '#4bc292', 'dots', 'rgba(75,194,146,0.14)');
    drawSprite(
      ctx,
      ICON_SPRITES.flower,
      { a: '#fe5f55', b: '#e29000', c: '#374649', d: '#009dff', y: '#ffe066', g: '#4bc292', e: '#cb724c' },
      ox + 35,
      oy + 48,
      3,
      OUTLINE
    );
  });
  reg(1, 6, (ctx, ox, oy) => {
    // j_ride_the_bus (Retro Yellow Bus)
    drawIvoryArtWindow(ctx, ox, oy, '#e8f5ff', '#d9781e', 'stripes', 'rgba(245,184,46,0.14)');
    drawSprite(
      ctx,
      ICON_SPRITES.bus,
      { a: '#f5b82e', b: '#7cd4ff', w: '#ffffff', c: '#22292d' },
      ox + 35,
      oy + 47,
      3,
      OUTLINE
    );
  });
  reg(2, 6, (ctx, ox, oy) => {
    // j_shoot_the_moon (Crescent Moon & Queen)
    drawIvoryArtWindow(ctx, ox, oy, '#151c3b', '#ffe082', 'stars', 'rgba(255,255,255,0.6)');
    drawSprite(ctx, ICON_SPRITES.crescent, { a: '#ffe066' }, ox + 36, oy + 44, 3, OUTLINE);
    drawPixelLine(ctx, ox + 14, oy + 68, ox + 55, oy + 26, '#fe5f55', 2);
    drawPixelText(ctx, 'Q', ox + 22, oy + 70, 2, '#ffffff', { align: 'center', outlineColor: OUTLINE });
  });
  reg(4, 6, (ctx, ox, oy) => {
    // j_smeared (Dripping Paint-Smeared Jester)
    drawIvoryArtWindow(ctx, ox, oy, '#f7e6e8', '#fe5f55', 'stripes', 'rgba(254,95,85,0.15)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#fe5f55',
      hatRight: '#24292e',
      collar: '#fe5f55',
      smear: true,
    });
  });
  reg(5, 6, (ctx, ox, oy) => {
    // j_oops (Oops! All 6s Emerald Die)
    drawIvoryArtWindow(ctx, ox, oy, '#1b3d2f', '#4bc292', 'dots', 'rgba(138,242,186,0.2)');
    drawSprite(ctx, ICON_SPRITES.die6, { a: '#2ea36b', w: '#ffffff' }, ox + 35, oy + 46, 3, OUTLINE);
    drawPixelText(ctx, 'ALL 6', ox + 35, oy + 76, 1, '#8af2ba', { align: 'center', outlineColor: OUTLINE });
  });
  reg(6, 6, (ctx, ox, oy) => {
    // j_four_fingers (Gloved Four-Finger Hand)
    drawIvoryArtWindow(ctx, ox, oy, '#2c3d59', '#f3b958', 'dots', 'rgba(255,255,255,0.1)');
    drawSprite(ctx, ICON_SPRITES.hand4, { a: '#ffffff', b: '#fe5f55' }, ox + 35, oy + 45, 3, OUTLINE);
    drawPixelText(ctx, '4', ox + 35, oy + 74, 2, '#ffe066', { align: 'center', outlineColor: OUTLINE });
  });
  reg(7, 6, (ctx, ox, oy) => {
    // j_gros_michel (Gros Michel Banana)
    drawIvoryArtWindow(ctx, ox, oy, '#e3f5ff', '#f5cc38', 'dots', 'rgba(255,255,255,0.55)');
    drawSprite(
      ctx,
      ICON_SPRITES.banana,
      { a: '#f5d742', b: '#fff4a6', d: '#63441b' },
      ox + 35,
      oy + 48,
      3,
      OUTLINE
    );
  });
  reg(8, 6, (ctx, ox, oy) => {
    // j_stuntman (Daredevil Helmet)
    drawIvoryArtWindow(ctx, ox, oy, '#1e2c40', '#fe5f55', 'rays', 'rgba(255,255,255,0.1)');
    drawPixelCircle(ctx, ox + 35, oy + 47, 19, '#ffffff', OUTLINE);
    ctx.fillStyle = '#fe5f55';
    ctx.fillRect(ox + 32, oy + 28, 7, 38);
    ctx.fillStyle = '#1b2638';
    ctx.fillRect(ox + 20, oy + 42, 31, 11);
    ctx.fillStyle = '#69baff';
    ctx.fillRect(ox + 23, oy + 44, 10, 4);
  });
  reg(9, 6, (ctx, ox, oy) => {
    // j_hanging_chad (Punch Ballot Card with Dangling Chad)
    drawIvoryArtWindow(ctx, ox, oy, '#2f455c', '#f3b958', 'none');
    ctx.fillStyle = '#faf4e6';
    ctx.fillRect(ox + 16, oy + 16, 39, 60);
    ctx.fillStyle = '#374649';
    ctx.fillRect(ox + 20, oy + 22, 31, 3);
    ctx.fillRect(ox + 20, oy + 30, 24, 3);
    // Punched hole & hanging flap
    ctx.fillStyle = '#1b2938';
    ctx.fillRect(ox + 29, oy + 42, 13, 14);
    ctx.fillStyle = '#e0d5be';
    ctx.fillRect(ox + 33, oy + 53, 12, 12);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 33, oy + 53, 12, 1);
  });

  // --- ROW 7: Driver's License, Invisible, Astronomer, Burnt, Dusk, Throwback, Idol, Brainstorm, Satellite, Rough Gem ---
  reg(0, 7, (ctx, ox, oy) => {
    // j_drivers_license (Driver's License)
    drawIvoryArtWindow(ctx, ox, oy, '#e6f0fa', '#2b5ea8', 'none');
    ctx.fillStyle = '#2b5ea8';
    ctx.fillRect(ox + 11, oy + 20, 49, 10);
    drawPixelText(ctx, 'DRIVER', ox + 35, oy + 22, 1, '#ffffff', { align: 'center' });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox + 11, oy + 30, 49, 40);
    // Tiny portrait photo + data lines
    ctx.fillStyle = '#a8d5ff';
    ctx.fillRect(ox + 14, oy + 34, 15, 20);
    drawPixelCircle(ctx, ox + 21, oy + 42, 4, '#f7d5b5', OUTLINE);
    ctx.fillStyle = '#4f6367';
    ctx.fillRect(ox + 33, oy + 36, 22, 3);
    ctx.fillRect(ox + 33, oy + 43, 18, 3);
    ctx.fillRect(ox + 33, oy + 50, 20, 3);
    drawPixelText(ctx, 'X3', ox + 44, oy + 58, 1, '#fe5f55', { align: 'center' });
  });
  reg(1, 7, (ctx, ox, oy) => {
    // j_invisible (Dashed Ghostly Outline)
    drawIvoryArtWindow(ctx, ox, oy, '#e6f0f5', '#95abb8', 'grid', 'rgba(149,171,184,0.28)');
    ctx.fillStyle = '#5f7377';
    for (let x = 20; x <= 48; x += 6) {
      ctx.fillRect(ox + x, oy + 24, 3, 2);
      ctx.fillRect(ox + x, oy + 68, 3, 2);
    }
    for (let y = 24; y <= 66; y += 6) {
      ctx.fillRect(ox + 20, oy + y, 2, 3);
      ctx.fillRect(ox + 49, oy + y, 2, 3);
    }
    drawPixelText(ctx, '???', ox + 35, oy + 43, 1, '#5f7377', { align: 'center' });
  });
  reg(2, 7, (ctx, ox, oy) => {
    // j_astronomer (Brass Telescope)
    drawIvoryArtWindow(ctx, ox, oy, '#151c3b', '#6fd3ff', 'stars', 'rgba(255,235,160,0.65)');
    drawSprite(ctx, ICON_SPRITES.telescope, { a: '#f3b958', b: '#8c5a32' }, ox + 35, oy + 51, 3, OUTLINE);
    drawSparkle(ctx, ox + 50, oy + 20, '#70f3ff', 4);
  });
  reg(3, 7, (ctx, ox, oy) => {
    // j_burnt (Charred Glowing Ember Jester)
    drawIvoryArtWindow(ctx, ox, oy, '#241b1a', '#ff7b29', 'dots', 'rgba(255,123,41,0.22)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#2e2626',
      hatRight: '#1a1515',
      face: '#383030',
      collar: '#4d3a33',
      smile: '#ff7b29',
      burnt: true,
    });
  });
  reg(4, 7, (ctx, ox, oy) => {
    // j_dusk (Twilight Sunset & Silhouettes)
    drawIvoryArtWindow(ctx, ox, oy, '#2d1e4f', '#ff7b54', 'none');
    ctx.fillStyle = '#6b2d6c';
    ctx.fillRect(ox + 8, oy + 22, 55, 16);
    ctx.fillStyle = '#d94c57';
    ctx.fillRect(ox + 8, oy + 38, 55, 14);
    ctx.fillStyle = '#ffaa4c';
    ctx.fillRect(ox + 8, oy + 52, 55, 12);
    drawPixelCircle(ctx, ox + 35, oy + 56, 11, '#ffe885');
    ctx.fillStyle = '#181326';
    ctx.fillRect(ox + 8, oy + 62, 55, 25);
  });
  reg(5, 7, (ctx, ox, oy) => {
    // j_throwback (80s Neon Synthwave)
    drawIvoryArtWindow(ctx, ox, oy, '#1a1038', '#ff47a3', 'grid', 'rgba(0,229,255,0.32)');
    drawPixelCircle(ctx, ox + 35, oy + 39, 16, '#ff47a3', '#ffe066');
    ctx.fillStyle = '#1a1038';
    ctx.fillRect(ox + 18, oy + 42, 35, 2);
    ctx.fillRect(ox + 18, oy + 47, 35, 3);
    drawPixelText(ctx, '80S', ox + 35, oy + 68, 2, '#00e5ff', { align: 'center', outlineColor: OUTLINE });
  });
  reg(6, 7, (ctx, ox, oy) => {
    // j_idol (Golden Ancient Idol Statue)
    drawIvoryArtWindow(ctx, ox, oy, '#292218', '#f3b958', 'rays', 'rgba(243,185,88,0.18)');
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 20, oy + 16, 31, 62);
    ctx.fillStyle = '#e5a928';
    ctx.fillRect(ox + 22, oy + 18, 27, 58);
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(ox + 24, oy + 20, 6, 52);
    // Emerald gem eyes & tribal mouth
    ctx.fillStyle = '#4bc292';
    ctx.fillRect(ox + 26, oy + 32, 6, 6);
    ctx.fillRect(ox + 39, oy + 32, 6, 6);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 26, oy + 52, 19, 8);
    ctx.fillStyle = '#ffe066';
    for (let x = 28; x <= 40; x += 4) ctx.fillRect(ox + x, oy + 54, 2, 4);
  });
  reg(7, 7, (ctx, ox, oy) => {
    // j_brainstorm (Napkin Sketch Lightbulb)
    drawIvoryArtWindow(ctx, ox, oy, '#faf4e6', '#c94c38', 'stripes', 'rgba(80,120,200,0.18)');
    drawPixelCircle(ctx, ox + 35, oy + 38, 12, '#ffe066', '#2c5ba8');
    ctx.fillStyle = '#c94c38';
    ctx.fillRect(ox + 31, oy + 50, 9, 6);
    ctx.fillRect(ox + 16, oy + 22, 8, 2);
    ctx.fillRect(ox + 48, oy + 22, 8, 2);
    ctx.fillRect(ox + 35, oy + 14, 2, 7);
    drawPixelText(ctx, 'IDEA!', ox + 35, oy + 68, 1, '#c94c38', { align: 'center' });
  });
  reg(8, 7, (ctx, ox, oy) => {
    // j_satellite (Orbiting Space Satellite)
    drawIvoryArtWindow(ctx, ox, oy, '#101a33', '#70a9ff', 'stars', 'rgba(255,255,255,0.65)');
    drawSprite(
      ctx,
      ICON_SPRITES.satellite,
      { a: '#009dff', b: '#d9e3eb', c: '#ffe066' },
      ox + 35,
      oy + 44,
      3,
      OUTLINE
    );
    drawPixelText(ctx, '+$', ox + 35, oy + 74, 1, '#ffe066', { align: 'center' });
  });
  reg(9, 7, (ctx, ox, oy) => {
    // j_rough_gem (Uncut Amber Diamond Gem)
    drawIvoryArtWindow(ctx, ox, oy, '#382914', '#f5c542', 'rays', 'rgba(255,224,102,0.18)');
    drawSprite(
      ctx,
      ICON_SPRITES.gem,
      { a: '#d98218', b: '#ffd24c', w: '#ffffff' },
      ox + 35,
      oy + 47,
      3,
      OUTLINE
    );
  });

  // --- ROW 8: Bloodstone, Arrowhead, Onyx Agate, 5 LEGENDARIES, Certificate, Bootstraps ---
  reg(0, 8, (ctx, ox, oy) => {
    // j_bloodstone (Crimson Ruby Gemstone)
    drawIvoryArtWindow(ctx, ox, oy, '#33141c', '#fe5f55', 'rays', 'rgba(254,95,85,0.18)');
    drawSprite(
      ctx,
      ICON_SPRITES.gem,
      { a: '#9e192d', b: '#fe5f55', w: '#ffc2cc' },
      ox + 35,
      oy + 47,
      3,
      OUTLINE
    );
  });
  reg(1, 8, (ctx, ox, oy) => {
    // j_arrowhead (Obsidian Spade Arrowhead)
    drawIvoryArtWindow(ctx, ox, oy, '#1e2436', '#7a8ea8', 'dots', 'rgba(160,190,220,0.18)');
    drawSuitIcon(ctx, 'Spades', ox + 35, oy + 47, 'lg', '#3a4966', '#9ab4d6');
    drawPixelLine(ctx, ox + 35, oy + 26, ox + 35, oy + 62, '#c8d9eb', 2);
  });
  reg(2, 8, (ctx, ox, oy) => {
    // j_onyx_agate (Banded Obsidian & Emerald Agate)
    drawIvoryArtWindow(ctx, ox, oy, '#1b2b27', '#4bc292', 'dots', 'rgba(75,194,146,0.18)');
    drawPixelCircle(ctx, ox + 35, oy + 47, 20, '#22292d', OUTLINE);
    drawPixelCircle(ctx, ox + 35, oy + 47, 14, '#2ea36b', '#8af2ba');
    drawPixelCircle(ctx, ox + 35, oy + 47, 8, '#1a2422', '#4bc292');
    drawSuitIcon(ctx, 'Clubs', ox + 35, oy + 47, 'sm', '#8af2ba');
  });
  reg(3, 8, (ctx, ox, oy) => drawLegendaryPortrait(ctx, ox, oy, 'canio'));
  reg(4, 8, (ctx, ox, oy) => drawLegendaryPortrait(ctx, ox, oy, 'triboulet'));
  reg(5, 8, (ctx, ox, oy) => drawLegendaryPortrait(ctx, ox, oy, 'yorick'));
  reg(6, 8, (ctx, ox, oy) => drawLegendaryPortrait(ctx, ox, oy, 'chicot'));
  reg(7, 8, (ctx, ox, oy) => drawLegendaryPortrait(ctx, ox, oy, 'perkeo'));
  reg(8, 8, (ctx, ox, oy) => {
    // j_certificate (Diploma Scroll + Wax Seal)
    drawIvoryArtWindow(ctx, ox, oy, '#29384a', '#f3b958', 'none');
    ctx.fillStyle = '#faf0d7';
    ctx.fillRect(ox + 15, oy + 18, 41, 58);
    ctx.fillStyle = '#c9a675';
    ctx.fillRect(ox + 19, oy + 26, 33, 3);
    ctx.fillRect(ox + 19, oy + 34, 27, 3);
    ctx.fillRect(ox + 19, oy + 42, 31, 3);
    drawPixelCircle(ctx, ox + 45, oy + 62, 7, '#fe5f55', '#f3b958');
  });
  reg(9, 8, (ctx, ox, oy) => {
    // j_bootstraps (Sturdy Boots + Gold Loops)
    drawIvoryArtWindow(ctx, ox, oy, '#382a20', '#f3b958', 'stripes', 'rgba(243,185,88,0.14)');
    drawSprite(ctx, ICON_SPRITES.boots, { a: '#8c5a32', b: '#472c18' }, ox + 35, oy + 51, 3, OUTLINE);
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(ox + 22, oy + 26, 5, 10);
    ctx.fillRect(ox + 44, oy + 26, 5, 10);
  });

  // --- ROW 9: Soul Overlay / Bonus Portraits (all ivory-framed!) ---
  reg(2, 9, (ctx, ox, oy) => {
    drawIvoryArtWindow(ctx, ox, oy, '#0c2336', '#2ef2ff', 'stripes', 'rgba(46,242,255,0.35)');
    drawJesterPortrait(ctx, ox, oy, { hatLeft: '#00e5ff', hatRight: '#70ffff', face: '#b8ffff', collar: '#00aacc' });
  });
  reg(3, 9, (ctx, ox, oy) => drawLegendaryPortrait(ctx, ox, oy, 'canio'));
  reg(4, 9, (ctx, ox, oy) => drawLegendaryPortrait(ctx, ox, oy, 'triboulet'));
  reg(5, 9, (ctx, ox, oy) => drawLegendaryPortrait(ctx, ox, oy, 'yorick'));
  reg(6, 9, (ctx, ox, oy) => drawLegendaryPortrait(ctx, ox, oy, 'chicot'));
  reg(7, 9, (ctx, ox, oy) => drawLegendaryPortrait(ctx, ox, oy, 'perkeo'));

  // --- ROW 10: Egg, Burglar, Blackboard, Runner, Ice Cream, DNA, Splash, Blue, Sixth Sense, Constellation ---
  reg(0, 10, (ctx, ox, oy) => {
    // j_egg (Cozy Speckled Egg)
    drawIvoryArtWindow(ctx, ox, oy, '#e8f5e9', '#f5d27a', 'dots', 'rgba(75,194,146,0.16)');
    drawSprite(
      ctx,
      ICON_SPRITES.egg,
      { a: '#fff8e1', b: '#e8d2a0', w: '#ffffff' },
      ox + 35,
      oy + 47,
      3,
      OUTLINE
    );
  });
  reg(1, 10, (ctx, ox, oy) => {
    // j_burglar (Bandit Mask & Striped Sweater)
    drawIvoryArtWindow(ctx, ox, oy, '#242936', '#fe5f55', 'stripes', 'rgba(255,255,255,0.08)');
    // Knit beanie + domino mask
    ctx.fillStyle = '#181c22';
    ctx.fillRect(ox + 21, oy + 18, 29, 14);
    ctx.fillStyle = '#f7d5b5';
    ctx.fillRect(ox + 23, oy + 32, 25, 24);
    ctx.fillStyle = '#181c22';
    ctx.fillRect(ox + 22, oy + 36, 27, 9);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox + 27, oy + 39, 4, 3);
    ctx.fillRect(ox + 40, oy + 39, 4, 3);
    for (let y = 58; y < 82; y += 6) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + 18, oy + y, 35, 3);
    }
  });
  reg(2, 10, (ctx, ox, oy) => {
    // j_blackboard (Blackboard X3)
    drawIvoryArtWindow(ctx, ox, oy, '#8c6239', '#5e3d1e', 'none');
    ctx.fillStyle = '#1a3026';
    ctx.fillRect(ox + 11, oy + 12, 49, 71);
    drawPixelText(ctx, 'X3', ox + 35, oy + 24, 2, '#ffffff', { align: 'center' });
    drawSuitIcon(ctx, 'Spades', ox + 26, oy + 58, 'md', '#ffffff');
    drawSuitIcon(ctx, 'Clubs', ox + 45, oy + 58, 'md', '#ffffff');
  });
  reg(3, 10, (ctx, ox, oy) => {
    // j_runner (Speed Sneaker)
    drawIvoryArtWindow(ctx, ox, oy, '#e6f2ff', '#fe5f55', 'stripes', 'rgba(0,157,255,0.14)');
    drawSprite(
      ctx,
      ICON_SPRITES.sneaker,
      { a: '#fe5f55', w: '#ffffff', b: '#22292d' },
      ox + 37,
      oy + 48,
      3,
      OUTLINE
    );
    ctx.fillStyle = '#009dff';
    ctx.fillRect(ox + 11, oy + 36, 12, 2);
    ctx.fillRect(ox + 13, oy + 44, 9, 2);
  });
  reg(4, 10, (ctx, ox, oy) => {
    // j_ice_cream (Ice Cream Cone)
    drawIvoryArtWindow(ctx, ox, oy, '#ffebf2', '#ff7eb3', 'dots', 'rgba(255,126,179,0.2)');
    drawSprite(
      ctx,
      ICON_SPRITES.icecream,
      { a: '#ff85b3', b: '#fff3b0', c: '#fe5f55', d: '#d9984a', e: '#a86b28' },
      ox + 35,
      oy + 48,
      3,
      OUTLINE
    );
  });
  reg(5, 10, (ctx, ox, oy) => {
    // j_dna (Double Helix DNA)
    drawIvoryArtWindow(ctx, ox, oy, '#142636', '#38e8c6', 'grid', 'rgba(56,232,198,0.14)');
    for (let i = 0; i < 12; i++) {
      const y = oy + 16 + i * 5;
      const dx = Math.round(Math.sin(i * 0.7) * 14);
      ctx.fillStyle = '#567891';
      ctx.fillRect(ox + 35 - Math.abs(dx), y + 1, Math.abs(dx) * 2, 2);
      drawPixelCircle(ctx, ox + 35 + dx, y + 1, 3, '#38e8c6', OUTLINE);
      drawPixelCircle(ctx, ox + 35 - dx, y + 1, 3, '#fe5f55', OUTLINE);
    }
  });
  reg(6, 10, (ctx, ox, oy) => {
    // j_splash (Water Splash)
    drawIvoryArtWindow(ctx, ox, oy, '#d6f4ff', '#009dff', 'dots', 'rgba(255,255,255,0.65)');
    drawPixelCircle(ctx, ox + 35, oy + 50, 16, '#009dff', OUTLINE);
    drawPixelCircle(ctx, ox + 22, oy + 31, 6, '#69c9ff', OUTLINE);
    drawPixelCircle(ctx, ox + 50, oy + 35, 6, '#69c9ff', OUTLINE);
    drawPixelCircle(ctx, ox + 46, oy + 70, 4, '#ffffff', OUTLINE);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox + 28, oy + 44, 5, 5);
  });
  reg(7, 10, (ctx, ox, oy) => {
    // j_blue_joker (Blue Joker)
    drawIvoryArtWindow(ctx, ox, oy, '#1d5eb8', '#80d0ff', 'checker', 'rgba(128,208,255,0.18)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#009dff',
      hatRight: '#4da6ff',
      face: '#d6f0ff',
      collar: '#163f80',
      smile: '#163f80',
    });
  });
  reg(8, 10, (ctx, ox, oy) => {
    // j_sixth_sense (All-Seeing Mystic Eye + 6)
    drawIvoryArtWindow(ctx, ox, oy, '#24183d', '#b26cbb', 'stars', 'rgba(180,140,255,0.45)');
    drawSprite(
      ctx,
      ICON_SPRITES.eye,
      { a: '#8867a5', b: '#d6c2ff', w: '#ffffff', c: '#00e5ff', d: '#18102b' },
      ox + 35,
      oy + 41,
      3,
      OUTLINE
    );
    drawPixelText(ctx, '6', ox + 35, oy + 70, 2, '#ffe066', { align: 'center', outlineColor: OUTLINE });
  });
  reg(9, 10, (ctx, ox, oy) => {
    // j_constellation (Star Constellation)
    drawIvoryArtWindow(ctx, ox, oy, '#121833', '#70a9ff', 'stars', 'rgba(255,255,255,0.35)');
    const pts: Array<[number, number]> = [
      [18, 28],
      [35, 22],
      [51, 36],
      [38, 54],
      [20, 62],
      [50, 70],
    ];
    for (let i = 0; i < pts.length - 1; i++) {
      drawPixelLine(ctx, ox + pts[i]![0], oy + pts[i]![1], ox + pts[i + 1]![0], oy + pts[i + 1]![1], '#70a9ff', 1);
    }
    for (const [sx, sy] of pts) {
      drawPixelCircle(ctx, ox + sx, oy + sy, 3, '#ffe680', '#ffffff');
    }
  });

  // --- ROW 11: Hiker, Faceless, Green, Superposition, To-Do List, Cavendish, Card Sharp, Red Card, Madness, Square ---
  reg(0, 11, (ctx, ox, oy) => {
    // j_hiker (Trail Backpacker & Pine Peaks)
    drawIvoryArtWindow(ctx, ox, oy, '#dff2e1', '#2ea36b', 'none');
    // Rolling green hills & hiker hat
    ctx.fillStyle = '#4bc292';
    ctx.fillRect(ox + 8, oy + 58, 55, 29);
    ctx.fillStyle = '#2c7a56';
    ctx.fillRect(ox + 14, oy + 46, 22, 16);
    ctx.fillRect(ox + 36, oy + 50, 22, 14);
    ctx.fillStyle = '#8c5a32';
    ctx.fillRect(ox + 16, oy + 28, 39, 6);
    ctx.fillRect(ox + 23, oy + 19, 25, 10);
    ctx.fillStyle = '#fe5f55';
    ctx.fillRect(ox + 23, oy + 26, 25, 3);
    drawPixelText(ctx, '+5', ox + 35, oy + 68, 2, '#ffffff', { align: 'center', outlineColor: OUTLINE });
  });
  reg(1, 11, (ctx, ox, oy) => {
    // j_faceless (Blank Faceless Jester)
    drawIvoryArtWindow(ctx, ox, oy, '#e8e4dc', '#5f7377', 'dots', 'rgba(95,115,119,0.14)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#7a8a94',
      hatRight: '#4f6367',
      face: '#faf6ee',
      collar: '#95a5ad',
      expression: 'blank',
    });
  });
  reg(2, 11, (ctx, ox, oy) => {
    // j_green_joker (Green Joker)
    drawIvoryArtWindow(ctx, ox, oy, '#e3f7eb', '#2ea36b', 'checker', 'rgba(46,163,107,0.15)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#2ea36b',
      hatRight: '#4bc292',
      face: '#edfff4',
      collar: '#1f6e48',
      smile: '#1f6e48',
    });
  });
  reg(3, 11, (ctx, ox, oy) => {
    // j_superposition (Quantum Orbital Rings + Ace)
    drawIvoryArtWindow(ctx, ox, oy, '#1a2040', '#70f3ff', 'stars', 'rgba(112,243,255,0.35)');
    drawPixelCircle(ctx, ox + 35, oy + 46, 19, '#1a2040', '#70f3ff');
    drawPixelCircle(ctx, ox + 35, oy + 46, 12, '#2d2459', '#ff70d9');
    drawPixelText(ctx, 'A', ox + 35, oy + 40, 2, '#ffe066', { align: 'center', outlineColor: OUTLINE });
  });
  reg(4, 11, (ctx, ox, oy) => {
    // j_todo_list (Checklist Clipboard)
    drawIvoryArtWindow(ctx, ox, oy, '#5c4226', '#f3b958', 'none');
    ctx.fillStyle = '#faf6ee';
    ctx.fillRect(ox + 15, oy + 18, 41, 62);
    ctx.fillStyle = '#8b99a6';
    ctx.fillRect(ox + 26, oy + 12, 19, 9);
    for (let r = 0; r < 4; r++) {
      ctx.fillStyle = '#4bc292';
      ctx.fillRect(ox + 19, oy + 28 + r * 12, 6, 6);
      ctx.fillStyle = '#374649';
      ctx.fillRect(ox + 29, oy + 30 + r * 12, 22, 3);
    }
  });
  reg(5, 11, (ctx, ox, oy) => {
    // j_cavendish (Radiant Golden Cavendish Banana)
    drawIvoryArtWindow(ctx, ox, oy, '#fff2b8', '#e6a017', 'rays', 'rgba(255,212,71,0.5)');
    drawSprite(
      ctx,
      ICON_SPRITES.banana,
      { a: '#ffcf26', b: '#ffffff', d: '#63441b' },
      ox + 35,
      oy + 47,
      3,
      OUTLINE
    );
    drawSparkle(ctx, ox + 17, oy + 22, '#ffffff', 4);
    drawSparkle(ctx, ox + 53, oy + 68, '#ffffff', 4);
  });
  reg(6, 11, (ctx, ox, oy) => {
    // j_card_sharp (Shady Dealer Visor & Fanned Aces)
    drawIvoryArtWindow(ctx, ox, oy, '#1a382c', '#fe5f55', 'checker', 'rgba(0,0,0,0.16)');
    // Green dealer visor
    ctx.fillStyle = '#2ea36b';
    ctx.fillRect(ox + 16, oy + 22, 39, 10);
    ctx.fillStyle = '#141c24';
    ctx.fillRect(ox + 21, oy + 32, 29, 12);
    ctx.fillStyle = '#fe5f55';
    ctx.fillRect(ox + 27, oy + 36, 4, 3);
    ctx.fillRect(ox + 40, oy + 36, 4, 3);
    // Two mini cards
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox + 18, oy + 50, 15, 22);
    ctx.fillRect(ox + 38, oy + 50, 15, 22);
    drawPixelText(ctx, 'X3', ox + 35, oy + 76, 1, '#ffe066', { align: 'center', outlineColor: OUTLINE });
  });
  reg(7, 11, (ctx, ox, oy) => {
    // j_red_card (Referee Crimson Penalty Card)
    drawIvoryArtWindow(ctx, ox, oy, '#2c7a4b', '#ffffff', 'stripes', 'rgba(255,255,255,0.12)');
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 19, oy + 16, 33, 48);
    ctx.fillStyle = '#fe443b';
    ctx.fillRect(ox + 21, oy + 18, 29, 44);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(ox + 23, oy + 20, 4, 38);
    drawPixelText(ctx, '+3', ox + 35, oy + 71, 2, '#ffffff', { align: 'center', outlineColor: OUTLINE });
  });
  reg(8, 11, (ctx, ox, oy) => {
    // j_madness (Hypnotic Swirl Madness)
    drawIvoryArtWindow(ctx, ox, oy, '#2b1224', '#fe5f55', 'rays', 'rgba(178,108,187,0.22)');
    drawPixelCircle(ctx, ox + 25, oy + 38, 9, '#ffffff', OUTLINE);
    drawPixelCircle(ctx, ox + 45, oy + 38, 9, '#ffffff', OUTLINE);
    drawPixelCircle(ctx, ox + 25, oy + 38, 5, '#b26cbb', OUTLINE);
    drawPixelCircle(ctx, ox + 45, oy + 38, 5, '#fe5f55', OUTLINE);
    drawPixelCircle(ctx, ox + 25, oy + 38, 2, '#ffe066');
    drawPixelCircle(ctx, ox + 45, oy + 38, 2, '#ffe066');
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 18, oy + 56, 35, 14);
    ctx.fillStyle = '#ffffff';
    for (let x = 20; x <= 48; x += 5) ctx.fillRect(ox + x, oy + 58, 3, 10);
  });
  reg(9, 11, (ctx, ox, oy) => {
    // j_square (Square Joker — boxy square frame inside ivory card!)
    drawIvoryArtWindow(ctx, ox, oy, '#dcebf7', '#009dff', 'grid', 'rgba(0,157,255,0.18)');
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 13, oy + 24, 45, 45);
    ctx.fillStyle = '#f5c542';
    ctx.fillRect(ox + 15, oy + 26, 41, 41);
    ctx.fillStyle = '#fe5f55';
    ctx.fillRect(ox + 21, oy + 32, 29, 29);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox + 26, oy + 38, 5, 5);
    ctx.fillRect(ox + 40, oy + 38, 5, 5);
    ctx.fillRect(ox + 27, oy + 51, 17, 4);
  });

  // --- ROW 12: Seance, Riff-Raff, Vampire, Shortcut, Hologram, Vagabond, Baron, Cloud 9, Rocket, Obelisk ---
  reg(0, 12, (ctx, ox, oy) => {
    // j_seance (Candlelit Spirit Ring)
    drawIvoryArtWindow(ctx, ox, oy, '#1b1636', '#70f3ff', 'stars', 'rgba(112,243,255,0.35)');
    drawPixelCircle(ctx, ox + 35, oy + 50, 18, '#281e52', '#70f3ff');
    // Three flickering candles
    for (const [cx, cy] of [
      [21, 56],
      [35, 42],
      [49, 56],
    ]) {
      ctx.fillStyle = '#faf4e6';
      ctx.fillRect(ox + cx - 3, oy + cy, 6, 16);
      drawPixelCircle(ctx, ox + cx, oy + cy - 4, 3, '#ffe066', '#ff8c42');
    }
  });
  reg(1, 12, (ctx, ox, oy) => {
    // j_riff_raff (Scrappy Twin Street Jesters)
    drawIvoryArtWindow(ctx, ox, oy, '#ede4d5', '#cb724c', 'checker', 'rgba(203,114,76,0.12)');
    drawSprite(ctx, ICON_SPRITES.miniJester, { a: '#fe5f55', b: '#fff8eb', c: '#009dff' }, ox + 25, oy + 42, 2, OUTLINE);
    drawSprite(ctx, ICON_SPRITES.miniJester, { a: '#4bc292', b: '#fff8eb', c: '#f3b958' }, ox + 46, oy + 56, 2, OUTLINE);
  });
  reg(2, 12, (ctx, ox, oy) => {
    // j_vampire (Vampire)
    drawIvoryArtWindow(ctx, ox, oy, '#291522', '#fe5f55', 'rays', 'rgba(181,29,49,0.2)');
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
  });
  reg(3, 12, (ctx, ox, oy) => {
    // j_shortcut (Yellow Diamond Road Sign)
    drawIvoryArtWindow(ctx, ox, oy, '#2c4257', '#f5c542', 'none');
    // Diamond sign
    for (let r = 0; r < 21; r++) {
      const w = 1 + r * 2;
      ctx.fillStyle = '#f5c542';
      ctx.fillRect(ox + 35 - r, oy + 24 + r, w, 1);
      ctx.fillRect(ox + 35 - r, oy + 66 - r, w, 1);
    }
    // Winding shortcut arrow
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 26, oy + 48, 8, 12);
    ctx.fillRect(ox + 26, oy + 43, 18, 6);
    ctx.fillRect(ox + 39, oy + 32, 6, 14);
    ctx.fillRect(ox + 36, oy + 34, 12, 4);
  });
  reg(4, 12, (ctx, ox, oy) => {
    // j_hologram (Neon Scanline Hologram)
    drawIvoryArtWindow(ctx, ox, oy, '#0c2336', '#2ef2ff', 'stripes', 'rgba(46,242,255,0.28)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#00e5ff',
      hatRight: '#70ffff',
      face: '#b8ffff',
      collar: '#00aacc',
      smile: '#ffffff',
    });
  });
  reg(5, 12, (ctx, ox, oy) => {
    // j_vagabond (Red Polka-Dot Bindle on Stick)
    drawIvoryArtWindow(ctx, ox, oy, '#383047', '#f3b958', 'stars', 'rgba(255,224,130,0.35)');
    drawPixelLine(ctx, ox + 14, oy + 66, ox + 55, oy + 26, '#b87b42', 4);
    drawPixelCircle(ctx, ox + 46, oy + 47, 13, '#d9453c', OUTLINE);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox + 41, oy + 42, 3, 3);
    ctx.fillRect(ox + 49, oy + 46, 3, 3);
    ctx.fillRect(ox + 43, oy + 52, 3, 3);
  });
  reg(6, 12, (ctx, ox, oy) => {
    // j_baron (Crowned Baron with Monocle)
    drawIvoryArtWindow(ctx, ox, oy, '#f4ece0', '#b8293d', 'stripes', 'rgba(184,41,61,0.08)');
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
    ctx.fillStyle = '#f5c542';
    ctx.fillRect(ox + 21, oy + 22, 29, 10);
    ctx.fillRect(ox + 21, oy + 16, 6, 7);
    ctx.fillRect(ox + 32, oy + 14, 7, 9);
    ctx.fillRect(ox + 44, oy + 16, 6, 7);
    drawPixelCircle(ctx, ox + 40, oy + 41, 4, '#a8e6ff', '#f5c542');
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 29, oy + 40, 3, 3);
  });
  reg(7, 12, (ctx, ox, oy) => {
    // j_cloud_9 (Fluffy Sky Cloud + Golden 9)
    drawIvoryArtWindow(ctx, ox, oy, '#6bc5ff', '#ffffff', 'dots', 'rgba(255,255,255,0.28)');
    drawPixelCircle(ctx, ox + 24, oy + 52, 11, '#ffffff', OUTLINE);
    drawPixelCircle(ctx, ox + 47, oy + 52, 11, '#ffffff', OUTLINE);
    drawPixelCircle(ctx, ox + 35, oy + 44, 14, '#ffffff', OUTLINE);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox + 22, oy + 46, 27, 14);
    drawPixelText(ctx, '9', ox + 35, oy + 42, 2, '#f5a623', { align: 'center', outlineColor: OUTLINE });
  });
  reg(8, 12, (ctx, ox, oy) => {
    // j_rocket (Blasting Retro Rocket)
    drawIvoryArtWindow(ctx, ox, oy, '#151c38', '#fe5f55', 'stars', 'rgba(255,255,255,0.65)');
    drawSprite(
      ctx,
      ICON_SPRITES.rocket,
      { a: '#f5f2eb', b: '#009dff', w: '#ffffff', c: '#fe5f55', d: '#fda200', e: '#ffe066' },
      ox + 35,
      oy + 47,
      3,
      OUTLINE
    );
  });
  reg(9, 12, (ctx, ox, oy) => {
    // j_obelisk (Ancient Mystic Monolith)
    drawIvoryArtWindow(ctx, ox, oy, '#241b38', '#8867a5', 'rays', 'rgba(138,113,225,0.22)');
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 25, oy + 20, 21, 58);
    ctx.fillStyle = '#4c5463';
    ctx.fillRect(ox + 27, oy + 22, 17, 54);
    ctx.fillStyle = '#6f7c91';
    ctx.fillRect(ox + 27, oy + 22, 7, 54);
    // Pointed pyramidion cap
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(ox + 29, oy + 16, 13, 6);
    ctx.fillRect(ox + 32, oy + 12, 7, 4);
    // Glowing runes
    ctx.fillStyle = '#b892ff';
    ctx.fillRect(ox + 33, oy + 32, 5, 5);
    ctx.fillRect(ox + 33, oy + 44, 5, 5);
    ctx.fillRect(ox + 33, oy + 56, 5, 5);
  });

  // --- ROW 13: Midas Mask, Luchador, Photograph, Gift Card, Turtle Bean, Erosion, Parking, Mail, To the Moon, Hallucination ---
  reg(0, 13, (ctx, ox, oy) => {
    // j_midas_mask (Hammered Gold Mask)
    drawIvoryArtWindow(ctx, ox, oy, '#2e1f14', '#ffd866', 'rays', 'rgba(255,216,102,0.22)');
    drawSprite(
      ctx,
      ICON_SPRITES.mask,
      { a: '#c98a18', b: '#ffd84d', c: '#fff5b8' },
      ox + 35,
      oy + 47,
      3,
      OUTLINE
    );
    drawSparkle(ctx, ox + 17, oy + 21, '#ffffff', 3);
    drawSparkle(ctx, ox + 53, oy + 71, '#ffe066', 3);
  });
  reg(1, 13, (ctx, ox, oy) => {
    // j_luchador (Wrestling Mask)
    drawIvoryArtWindow(ctx, ox, oy, '#1f3b4d', '#fe5f55', 'rays', 'rgba(255,224,102,0.16)');
    drawSprite(
      ctx,
      ICON_SPRITES.luchador,
      { a: '#fe5f55', b: '#f3b958', w: '#ffffff', c: '#2ec4b6' },
      ox + 35,
      oy + 47,
      3,
      OUTLINE
    );
  });
  reg(2, 13, (ctx, ox, oy) => {
    // j_photograph (Polaroid Snapshot)
    drawIvoryArtWindow(ctx, ox, oy, '#dfe6eb', '#4f6367', 'none');
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 12, oy + 13, 47, 68);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox + 14, oy + 15, 43, 64);
    ctx.fillStyle = '#374244';
    ctx.fillRect(ox + 18, oy + 19, 35, 40);
    drawPixelCircle(ctx, ox + 35, oy + 38, 11, '#f7d5b5', OUTLINE);
    ctx.fillStyle = '#fe5f55';
    ctx.fillRect(ox + 31, oy + 43, 9, 3);
    drawPixelText(ctx, 'X2', ox + 35, oy + 65, 1, '#22292d', { align: 'center' });
  });
  reg(3, 13, (ctx, ox, oy) => {
    // j_gift (Festive Wrapped Present)
    drawIvoryArtWindow(ctx, ox, oy, '#fff2eb', '#fe5f55', 'dots', 'rgba(75,194,146,0.2)');
    drawSprite(
      ctx,
      ICON_SPRITES.gift,
      { a: '#4bc292', b: '#fe5f55' },
      ox + 35,
      oy + 47,
      3,
      OUTLINE
    );
  });
  reg(4, 13, (ctx, ox, oy) => {
    // j_turtle_bean (Cute Turtle Bean)
    drawIvoryArtWindow(ctx, ox, oy, '#e8f5e9', '#4bc292', 'dots', 'rgba(75,194,146,0.18)');
    drawSprite(
      ctx,
      ICON_SPRITES.bean,
      { a: '#3d3352', b: '#4bc292', w: '#ffffff', c: '#ff9eb5' },
      ox + 35,
      oy + 47,
      3,
      OUTLINE
    );
  });
  reg(5, 13, (ctx, ox, oy) => {
    // j_erosion (Desert Sandstone Arch)
    drawIvoryArtWindow(ctx, ox, oy, '#99d5ff', '#cb724c', 'none');
    // Desert canyon sky & carved red-rock arch
    ctx.fillStyle = '#d96b3b';
    ctx.fillRect(ox + 11, oy + 34, 49, 51);
    ctx.fillStyle = '#b54c24';
    ctx.fillRect(ox + 11, oy + 52, 49, 10);
    ctx.fillStyle = '#e8985a';
    ctx.fillRect(ox + 11, oy + 34, 49, 8);
    // Arch cutout showing sky
    drawPixelCircle(ctx, ox + 35, oy + 66, 13, '#99d5ff');
    ctx.fillStyle = '#99d5ff';
    ctx.fillRect(ox + 22, oy + 66, 27, 19);
    ctx.fillStyle = '#e8c48a';
    ctx.fillRect(ox + 8, oy + 79, 55, 8);
  });
  reg(6, 13, (ctx, ox, oy) => {
    // j_reserved_parking (Reserved Parking Sign)
    drawIvoryArtWindow(ctx, ox, oy, '#e8f2fc', '#1f5ec4', 'none');
    ctx.fillStyle = '#1f5ec4';
    ctx.fillRect(ox + 15, oy + 18, 41, 56);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox + 18, oy + 21, 35, 50);
    ctx.fillStyle = '#1f5ec4';
    ctx.fillRect(ox + 20, oy + 23, 31, 46);
    drawPixelText(ctx, 'P', ox + 35, oy + 31, 3, '#ffffff', { align: 'center' });
    drawPixelText(ctx, 'VIP', ox + 35, oy + 58, 1, '#ffe066', { align: 'center' });
  });
  reg(7, 13, (ctx, ox, oy) => {
    // j_mail (Airmail Rebate Envelope)
    drawIvoryArtWindow(ctx, ox, oy, '#dbeeff', '#fe5f55', 'stripes', 'rgba(0,157,255,0.14)');
    drawSprite(
      ctx,
      ICON_SPRITES.envelope,
      { a: '#fe5f55', b: '#faf6ee' },
      ox + 35,
      oy + 45,
      3,
      OUTLINE
    );
    drawPixelText(ctx, '+$5', ox + 35, oy + 72, 1, '#2ea36b', { align: 'center', outlineColor: OUTLINE });
  });
  reg(8, 13, (ctx, ox, oy) => {
    // j_to_the_moon (Stock Chart Shooting to Crescent Moon)
    drawIvoryArtWindow(ctx, ox, oy, '#131d36', '#4bc292', 'grid', 'rgba(75,194,146,0.18)');
    drawSprite(ctx, ICON_SPRITES.crescent, { a: '#ffe066' }, ox + 48, oy + 24, 2, OUTLINE);
    // Rising green candle bars
    for (let i = 0; i < 5; i++) {
      const bh = 8 + i * 9;
      ctx.fillStyle = '#4bc292';
      ctx.fillRect(ox + 13 + i * 9, oy + 76 - bh, 6, bh);
    }
    drawPixelLine(ctx, ox + 15, oy + 68, ox + 50, oy + 32, '#ffe066', 2);
  });
  reg(9, 13, (ctx, ox, oy) => {
    // j_hallucination (Psychedelic Rainbow Swirl Eye)
    drawIvoryArtWindow(ctx, ox, oy, '#241438', '#ff6bc1', 'none');
    const bands = ['#fe5f55', '#fda200', '#ffe066', '#4bc292', '#009dff', '#b26cbb'];
    for (let i = 0; i < bands.length; i++) {
      drawPixelCircle(ctx, ox + 35, oy + 47, 25 - i * 4, bands[i]!);
    }
    drawPixelCircle(ctx, ox + 35, oy + 47, 6, '#181026', '#ffffff');
  });

  // --- ROW 14: 5 Chip Jesters (Sly/Wily/Clever/Devious/Crafty) + Cat, Baseball, Bull, Diet Cola, Trading ---
  reg(0, 14, (ctx, ox, oy) => {
    // j_sly (Pair Chips)
    drawIvoryArtWindow(ctx, ox, oy, '#e3f3ff', '#009dff', 'dots', 'rgba(0,157,255,0.16)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#009dff',
      hatRight: '#1f5ec4',
      collar: '#80d0ff',
      expression: 'wink',
      label: '2X',
      labelColor: '#009dff',
    });
  });
  reg(1, 14, (ctx, ox, oy) => {
    // j_wily (Trips Chips)
    drawIvoryArtWindow(ctx, ox, oy, '#e6eeff', '#3a68e8', 'checker', 'rgba(58,104,232,0.14)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#3a68e8',
      hatRight: '#00c2ff',
      collar: '#f3b958',
      expression: 'sly',
      label: '3K',
      labelColor: '#3a68e8',
    });
  });
  reg(2, 14, (ctx, ox, oy) => {
    // j_clever (Two Pair Chips)
    drawIvoryArtWindow(ctx, ox, oy, '#e8f7fa', '#008ee6', 'grid', 'rgba(0,142,230,0.15)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#008ee6',
      hatRight: '#2ec4b6',
      collar: '#f5c542',
      glasses: true,
      label: '2P',
      labelColor: '#008ee6',
    });
  });
  reg(3, 14, (ctx, ox, oy) => {
    // j_devious (Straight Chips)
    drawIvoryArtWindow(ctx, ox, oy, '#1b2640', '#009dff', 'stripes', 'rgba(0,157,255,0.16)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#1b4f9c',
      hatRight: '#5a4fcf',
      collar: '#009dff',
      expression: 'mad',
      label: 'ST',
      labelColor: '#70c8ff',
    });
  });
  reg(4, 14, (ctx, ox, oy) => {
    // j_crafty (Flush Chips)
    drawIvoryArtWindow(ctx, ox, oy, '#e3f5f8', '#2c6eb8', 'dots', 'rgba(46,196,182,0.16)');
    drawJesterPortrait(ctx, ox, oy, {
      hatLeft: '#2c6eb8',
      hatRight: '#2ec4b6',
      collar: '#80d0ff',
      expression: 'droll',
      label: 'FL',
      labelColor: '#2c6eb8',
    });
  });
  reg(5, 14, (ctx, ox, oy) => {
    // j_lucky_cat (Maneki-neko Lucky Cat)
    drawIvoryArtWindow(ctx, ox, oy, '#fff4d6', '#f5a623', 'dots', 'rgba(254,95,85,0.16)');
    drawSprite(
      ctx,
      ICON_SPRITES.cat,
      { a: '#ffffff', b: '#ff9eb5', c: '#fe5f55', d: '#f3b958' },
      ox + 35,
      oy + 47,
      3,
      OUTLINE
    );
  });
  reg(6, 14, (ctx, ox, oy) => {
    // j_baseball (Baseball Card)
    drawIvoryArtWindow(ctx, ox, oy, '#f7ebd2', '#c93838', 'stripes', 'rgba(43,94,168,0.12)');
    drawPixelLine(ctx, ox + 16, oy + 68, ox + 54, oy + 26, '#b87b42', 4);
    drawPixelLine(ctx, ox + 54, oy + 68, ox + 16, oy + 26, '#b87b42', 4);
    drawPixelCircle(ctx, ox + 35, oy + 46, 13, '#ffffff', OUTLINE);
    // Red stitching
    ctx.fillStyle = '#fe5f55';
    ctx.fillRect(ox + 26, oy + 40, 2, 12);
    ctx.fillRect(ox + 42, oy + 40, 2, 12);
  });
  reg(7, 14, (ctx, ox, oy) => {
    // j_bull (Charging Bull + Gold Nose Ring)
    drawIvoryArtWindow(ctx, ox, oy, '#38221b', '#f3b958', 'rays', 'rgba(254,95,85,0.16)');
    drawSprite(
      ctx,
      ICON_SPRITES.bull,
      { a: '#8c4b32', b: '#5c2e1c', c: '#f3b958', w: '#faf2dc' },
      ox + 35,
      oy + 47,
      3,
      OUTLINE
    );
  });
  reg(8, 14, (ctx, ox, oy) => {
    // j_diet_cola (Retro Fizzy Diet Cola Can)
    drawIvoryArtWindow(ctx, ox, oy, '#e3eef7', '#fe5f55', 'dots', 'rgba(254,95,85,0.14)');
    drawSprite(
      ctx,
      ICON_SPRITES.cola,
      { a: '#d6dee6', b: '#8b99a6', c: '#fe5f55', w: '#ffffff' },
      ox + 35,
      oy + 48,
      3,
      OUTLINE
    );
  });
  reg(9, 14, (ctx, ox, oy) => {
    // j_trading (Collector Trading Card)
    drawIvoryArtWindow(ctx, ox, oy, '#214875', '#f3b958', 'rays', 'rgba(255,224,102,0.18)');
    drawSprite(ctx, ICON_SPRITES.star8, { a: '#f3b958', b: '#ffffff' }, ox + 35, oy + 40, 3, OUTLINE);
    drawPixelText(ctx, '1ST', ox + 35, oy + 71, 2, '#ffe066', { align: 'center', outlineColor: OUTLINE });
  });

  // --- ROW 15: Flash Card, Popcorn, Ramen, Seltzer, Trousers, Campfire, Smiley, Ancient, Walkie Talkie, Castle ---
  reg(0, 15, (ctx, ox, oy) => {
    // j_flash (Classroom Alphabet Flash Card)
    drawIvoryArtWindow(ctx, ox, oy, '#fffaf0', '#fe5f55', 'none');
    ctx.fillStyle = '#fe5f55';
    ctx.fillRect(ox + 10, oy + 14, 51, 4);
    ctx.fillRect(ox + 10, oy + 76, 51, 4);
    drawPixelText(ctx, 'A', ox + 35, oy + 26, 4, '#fe5f55', { align: 'center', outlineColor: OUTLINE });
    drawPixelText(ctx, 'FLASH', ox + 35, oy + 64, 1, '#374649', { align: 'center' });
  });
  reg(1, 15, (ctx, ox, oy) => {
    // j_popcorn (Cinema Popcorn Bucket)
    drawIvoryArtWindow(ctx, ox, oy, '#261b33', '#fe5f55', 'dots', 'rgba(255,224,102,0.2)');
    drawSprite(
      ctx,
      ICON_SPRITES.popcorn,
      { a: '#fff0a6', b: '#f5c542', c: '#fe5f55', w: '#ffffff' },
      ox + 35,
      oy + 48,
      3,
      OUTLINE
    );
  });
  reg(2, 15, (ctx, ox, oy) => {
    // j_ramen (Steaming Ramen Bowl)
    drawIvoryArtWindow(ctx, ox, oy, '#fff3e0', '#d9483b', 'stripes', 'rgba(217,72,59,0.1)');
    drawSprite(
      ctx,
      ICON_SPRITES.ramen,
      { a: '#ffffff', b: '#f5c542', c: '#ff7eb3', w: '#ffffff', d: '#4bc292', e: '#1f5ec4', f: '#ffe066' },
      ox + 35,
      oy + 48,
      3,
      OUTLINE
    );
  });
  reg(3, 15, (ctx, ox, oy) => {
    // j_selzer (Sparkling Lime Seltzer Glass)
    drawIvoryArtWindow(ctx, ox, oy, '#e3fafc', '#2ec4b6', 'dots', 'rgba(46,196,182,0.2)');
    drawSprite(
      ctx,
      ICON_SPRITES.seltzer,
      { a: '#99e9f2', b: '#4dd0e1', w: '#ffffff', c: '#4bc292' },
      ox + 35,
      oy + 48,
      3,
      OUTLINE
    );
  });
  reg(4, 15, (ctx, ox, oy) => {
    // j_trousers (Spare Trousers)
    drawIvoryArtWindow(ctx, ox, oy, '#f7ecd8', '#3c6eb8', 'checker', 'rgba(60,110,184,0.12)');
    drawSprite(
      ctx,
      ICON_SPRITES.trousers,
      { a: '#3a68a8', b: '#264778', c: '#6e4726', d: '#f3b958' },
      ox + 35,
      oy + 48,
      3,
      OUTLINE
    );
  });
  reg(5, 15, (ctx, ox, oy) => {
    // j_campfire (Blazing Campfire)
    drawIvoryArtWindow(ctx, ox, oy, '#1a1d30', '#ff8c42', 'stars', 'rgba(255,224,130,0.5)');
    drawSprite(
      ctx,
      ICON_SPRITES.campfire,
      { a: '#fe5f55', b: '#ffe066', c: '#8c5228', d: '#5c3416' },
      ox + 35,
      oy + 50,
      3,
      OUTLINE
    );
  });
  reg(6, 15, (ctx, ox, oy) => {
    // j_smiley (Cheerful Smiley Face)
    drawIvoryArtWindow(ctx, ox, oy, '#fff9db', '#fda200', 'dots', 'rgba(253,162,0,0.18)');
    drawPixelCircle(ctx, ox + 35, oy + 47, 20, '#ffd84d', OUTLINE);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 26, oy + 38, 4, 6);
    ctx.fillRect(ox + 41, oy + 38, 4, 6);
    ctx.fillStyle = '#fe5f55';
    ctx.fillRect(ox + 21, oy + 46, 4, 3);
    ctx.fillRect(ox + 46, oy + 46, 4, 3);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 25, oy + 53, 21, 3);
    ctx.fillRect(ox + 28, oy + 56, 15, 3);
  });
  reg(7, 15, (ctx, ox, oy) => {
    // j_ancient (Carved Emerald-Gold Ancient Sun Medallion)
    drawIvoryArtWindow(ctx, ox, oy, '#243830', '#d9a441', 'checker', 'rgba(217,164,65,0.16)');
    drawPixelCircle(ctx, ox + 35, oy + 47, 20, '#c99334', OUTLINE);
    drawPixelCircle(ctx, ox + 35, oy + 47, 14, '#2ea36b', OUTLINE);
    drawPixelCircle(ctx, ox + 35, oy + 47, 7, '#f5c542', OUTLINE);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 32, oy + 45, 2, 2);
    ctx.fillRect(ox + 37, oy + 45, 2, 2);
    ctx.fillRect(ox + 32, oy + 49, 7, 2);
  });
  reg(8, 15, (ctx, ox, oy) => {
    // j_walkie_talkie (Retro Radio Handset)
    drawIvoryArtWindow(ctx, ox, oy, '#2a3842', '#4bc292', 'grid', 'rgba(75,194,146,0.16)');
    drawSprite(
      ctx,
      ICON_SPRITES.walkie,
      { a: '#4f6367', b: '#22292d', c: '#4bc292' },
      ox + 35,
      oy + 45,
      3,
      OUTLINE
    );
    drawPixelText(ctx, '10-4', ox + 35, oy + 76, 1, '#8af2ba', { align: 'center', outlineColor: OUTLINE });
  });
  reg(9, 15, (ctx, ox, oy) => {
    // j_castle (Stone Fortress Tower)
    drawIvoryArtWindow(ctx, ox, oy, '#d6ebff', '#4f6367', 'none');
    drawSprite(ctx, ICON_SPRITES.castle, { a: '#95a3ad' }, ox + 35, oy + 52, 3, OUTLINE);
    // Tiny fluttering red pennant atop tower
    ctx.fillStyle = '#fe5f55';
    ctx.fillRect(ox + 35, oy + 20, 10, 6);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 34, oy + 20, 2, 16);
  });

  return m;
}

function buildJokersAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.Joker;
  const [canvas, ctx] = createCanvas(spec.cols * spec.cellW, spec.rows * spec.cellH);
  const registry = buildJokerRegistry();

  const spareBgs = ['#f2efe6', '#e8f3ff', '#ffeceb', '#eaf7ee', '#f3ebff', '#fff5dc'];
  const spareAccents = ['#fe5f55', '#009dff', '#4bc292', '#f3b958', '#b26cbb', '#fda200'];

  for (let gy = 0; gy < spec.rows; gy++) {
    for (let gx = 0; gx < spec.cols; gx++) {
      const ox = gx * spec.cellW;
      const oy = gy * spec.cellH;
      const drawer = registry.get(`${gx},${gy}`);
      if (drawer) {
        drawer(ctx, ox, oy);
        continue;
      }
      // Unused spare grid cells (e.g. 3,6 and spare slots in row 9) STILL get clean ivory frames + charming crest
      const idx = (gx + gy * 3) % spareBgs.length;
      drawIvoryArtWindow(ctx, ox, oy, spareBgs[idx]!, spareAccents[idx]!, 'dots', 'rgba(0,0,0,0.08)');
      drawJesterPortrait(ctx, ox, oy, {
        hatLeft: spareAccents[idx]!,
        hatRight: spareAccents[(idx + 2) % spareAccents.length]!,
        collar: '#f3b958',
      });
    }
  }

  return canvas;
}

// ---------------------------------------------------------------------------
// 4. Tarot / Planet / Spectral Atlas (`Tarot`, 10x6 @ 71x95)
// Bespoke pixel art for ALL 22 Tarots, ALL 12 Planets, and ALL 18 Spectrals!
// ---------------------------------------------------------------------------

function drawTarotCard(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  tarotIndex: number
): void {
  const roman = [
    '0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX',
    'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX',
    'XX', 'XXI',
  ][tarotIndex] ?? 'X';

  const frameColors = [
    '#5e4b8a', '#b83b5e', '#2d4b7a', '#2e7d5b', '#a82c2c', '#8c5e2a',
    '#c73a62', '#2c5b8c', '#4b6b8a', '#242b47', '#6d3fa8', '#c96b26',
    '#3d5c6e', '#242029', '#2b7a8c', '#6e1b26', '#3d243b', '#1d3c73',
    '#242654', '#c97d1c', '#6b428a', '#266e54',
  ];
  const innerBg = frameColors[tarotIndex % frameColors.length]!;

  // Warm vintage parchment Tarot frame
  drawCardBase(ctx, ox, oy, '#efe2c8', '#cfbc9c', '#3a291e', '#9c6b3f');
  ctx.fillStyle = '#3a291e';
  ctx.fillRect(ox + 12, oy + 12, 47, 61);
  ctx.fillStyle = innerBg;
  ctx.fillRect(ox + 14, oy + 14, 43, 57);
  // Subtle golden corner brackets inside frame
  ctx.fillStyle = '#f3d27a';
  ctx.fillRect(ox + 15, oy + 15, 5, 1);
  ctx.fillRect(ox + 51, oy + 15, 5, 1);
  ctx.fillRect(ox + 15, oy + 69, 5, 1);
  ctx.fillRect(ox + 51, oy + 69, 5, 1);

  const cx = ox + 35;
  const cy = oy + 42;

  switch (tarotIndex) {
    case 0: // 0 The Fool — jester hat + golden sun
      drawPixelCircle(ctx, ox + 48, oy + 24, 5, '#ffe066');
      drawSprite(ctx, ICON_SPRITES.miniJester, { a: '#fe5f55', b: '#fff8eb', c: '#f3b958' }, cx, cy + 5, 3, OUTLINE);
      break;
    case 1: // I The Magician — glowing wand & sparkles
      drawPixelLine(ctx, ox + 20, oy + 60, ox + 50, oy + 26, '#f5c542', 3);
      drawSparkle(ctx, ox + 49, oy + 26, '#ffffff', 5);
      drawSparkle(ctx, ox + 24, oy + 28, '#ffe066', 3);
      drawSparkle(ctx, ox + 48, oy + 55, '#70f3ff', 3);
      break;
    case 2: // II The High Priestess — twin pillars & silver crescent
      ctx.fillStyle = '#181a24';
      ctx.fillRect(ox + 17, oy + 22, 7, 44);
      ctx.fillStyle = '#faf6ee';
      ctx.fillRect(ox + 47, oy + 22, 7, 44);
      drawSprite(ctx, ICON_SPRITES.crescent, { a: '#dceeff' }, cx, cy, 2, OUTLINE);
      break;
    case 3: // III The Empress — golden crown & glowing heart
      drawSprite(ctx, ICON_SPRITES.crown, { a: '#f5c542', b: '#4bc292', c: '#fe5f55', d: '#b87f1c' }, cx, cy - 11, 2, OUTLINE);
      drawSuitIcon(ctx, 'Hearts', cx, cy + 10, 'md', '#fe5f55', '#ffadb8');
      break;
    case 4: // IV The Emperor — tall royal crown & orb
      drawSprite(ctx, ICON_SPRITES.crown, { a: '#ffd84d', b: '#fe5f55', c: '#ffffff', d: '#b87f1c' }, cx, cy - 2, 3, OUTLINE);
      break;
    case 5: // V The Hierophant — crossed golden keys
      drawPixelLine(ctx, ox + 20, oy + 24, ox + 50, oy + 60, '#f5c542', 3);
      drawPixelLine(ctx, ox + 50, oy + 24, ox + 20, oy + 60, '#f5c542', 3);
      drawPixelCircle(ctx, ox + 22, oy + 26, 5, '#ffe066', OUTLINE);
      drawPixelCircle(ctx, ox + 48, oy + 26, 5, '#ffe066', OUTLINE);
      break;
    case 6: // VI The Lovers — twin hearts under sun
      drawPixelCircle(ctx, cx, oy + 24, 6, '#ffe066');
      drawSuitIcon(ctx, 'Hearts', ox + 27, oy + 48, 'md', '#fe5f55', '#ffc2cc');
      drawSuitIcon(ctx, 'Hearts', ox + 44, oy + 48, 'md', '#ff7eb3', '#ffffff');
      break;
    case 7: // VII The Chariot — armored wheel & star
      drawSprite(ctx, ICON_SPRITES.wheel, { a: '#f3b958' }, cx, cy + 5, 3, OUTLINE);
      drawSparkle(ctx, cx, oy + 21, '#ffe066', 4);
      break;
    case 8: // VIII Justice — golden balance scales
      drawSprite(ctx, ICON_SPRITES.scales, { a: '#ffd84d' }, cx, cy, 3, OUTLINE);
      break;
    case 9: // IX The Hermit — glowing star lantern
      drawSprite(ctx, ICON_SPRITES.lantern, { a: '#8c6239', b: '#ffd84d', w: '#ffffff' }, cx, cy, 3, OUTLINE);
      break;
    case 10: // X The Wheel of Fortune — bright golden fortune wheel
      drawPixelCircle(ctx, cx, cy, 17, '#f3b958', OUTLINE);
      drawSprite(ctx, ICON_SPRITES.wheel, { a: '#fff0a6' }, cx, cy, 2, '#5e388a');
      break;
    case 11: // XI Strength — radiant golden lion sun-crest
      drawPixelCircle(ctx, cx, cy + 2, 16, '#e68a2e', OUTLINE);
      drawPixelCircle(ctx, cx, cy + 2, 11, '#ffd84d', OUTLINE);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(cx - 5, cy - 1, 3, 3);
      ctx.fillRect(cx + 3, cy - 1, 3, 3);
      ctx.fillRect(cx - 2, cy + 4, 5, 3);
      break;
    case 12: // XII The Hanged Man — inverted golden figure on T-beam
      ctx.fillStyle = '#c98842';
      ctx.fillRect(ox + 18, oy + 20, 35, 4);
      ctx.fillRect(ox + 34, oy + 20, 3, 18);
      drawPixelCircle(ctx, cx, oy + 54, 8, '#ffe066', OUTLINE);
      ctx.fillStyle = '#009dff';
      ctx.fillRect(ox + 28, oy + 35, 15, 14);
      break;
    case 13: // XIII Death — pale skull & silver scythe
      drawSprite(ctx, ICON_SPRITES.skull, { a: '#f5f2eb' }, cx - 2, cy + 2, 2, OUTLINE);
      drawPixelLine(ctx, ox + 49, oy + 20, ox + 49, oy + 64, '#cfd8e3', 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + 30, oy + 19, 20, 4);
      break;
    case 14: // XIV Temperance — twin chalices pouring water
      drawSprite(ctx, ICON_SPRITES.chalice, { a: '#f5c542', b: '#70f3ff' }, ox + 25, oy + 30, 1, OUTLINE);
      drawSprite(ctx, ICON_SPRITES.chalice, { a: '#f5c542', b: '#70f3ff' }, ox + 45, oy + 54, 1, OUTLINE);
      drawPixelLine(ctx, ox + 28, oy + 34, ox + 43, oy + 50, '#70f3ff', 3);
      break;
    case 15: // XV The Devil — crimson horned sigil & chain
      drawSprite(ctx, ICON_SPRITES.ox, { a: '#fe5f55' }, cx, cy - 4, 3, OUTLINE);
      drawSprite(ctx, ICON_SPRITES.manacle, { a: '#c7cfd6' }, cx, cy + 16, 2, OUTLINE);
      break;
    case 16: // XVI The Tower — lightning striking stone spire
      drawSprite(ctx, ICON_SPRITES.tower, { a: '#9aa4ad' }, cx - 3, cy + 8, 2, OUTLINE);
      drawSprite(ctx, ICON_SPRITES.bolt, { a: '#ffe066' }, cx + 8, cy - 10, 2, OUTLINE);
      break;
    case 17: // XVII The Star — eight-point golden star & sparkles
      drawSprite(ctx, ICON_SPRITES.star8, { a: '#ffe066', b: '#ffffff' }, cx, cy, 3, OUTLINE);
      drawSparkle(ctx, ox + 20, oy + 22, '#a6d8ff', 2);
      drawSparkle(ctx, ox + 50, oy + 22, '#a6d8ff', 2);
      drawSparkle(ctx, ox + 20, oy + 60, '#a6d8ff', 2);
      drawSparkle(ctx, ox + 50, oy + 60, '#a6d8ff', 2);
      break;
    case 18: // XVIII The Moon — luminous crescent & twin towers
      drawSprite(ctx, ICON_SPRITES.crescent, { a: '#ffe885' }, cx, cy - 6, 3, OUTLINE);
      ctx.fillStyle = '#4f5a8a';
      ctx.fillRect(ox + 18, oy + 52, 9, 17);
      ctx.fillRect(ox + 44, oy + 52, 9, 17);
      break;
    case 19: // XIX The Sun — blazing golden sun
      drawSprite(ctx, ICON_SPRITES.sun, { a: '#ffd84d', b: '#ffffff' }, cx, cy, 3, '#c94c26');
      break;
    case 20: // XX Judgement — golden horn & rising wings
      drawSprite(ctx, ICON_SPRITES.megaphone, { a: '#f5c542', b: '#ffe082' }, cx, cy - 2, 3, OUTLINE);
      drawSparkle(ctx, ox + 49, oy + 26, '#ffffff', 3);
      drawSparkle(ctx, ox + 22, oy + 56, '#ffe066', 3);
      break;
    case 21: // XXI The World — emerald wreath & blue globe
      drawPixelCircle(ctx, cx, cy, 17, '#4bc292', OUTLINE);
      drawPixelCircle(ctx, cx, cy, 12, '#009dff', OUTLINE);
      ctx.fillStyle = '#4bc292';
      ctx.fillRect(cx - 7, cy - 6, 6, 5);
      ctx.fillRect(cx + 1, cy - 1, 7, 6);
      ctx.fillRect(cx - 4, cy + 4, 5, 4);
      break;
  }

  drawPixelText(ctx, roman, ox + 35, oy + 78, 1, '#3a291e', { align: 'center' });
}

interface PlanetDef {
  gx: number;
  gy: number;
  base: string;
  band1: string;
  band2: string;
  radius: number;
  ring?: string;
  ringTilt?: boolean;
  spot?: string;
  moon?: boolean;
  label: string;
}

const PLANET_SPECS: PlanetDef[] = [
  { gx: 0, gy: 3, base: '#a69c8e', band1: '#cfc5b8', band2: '#7a7166', radius: 13, label: 'MERC' },
  { gx: 1, gy: 3, base: '#e8b45a', band1: '#fff0b3', band2: '#c98834', radius: 16, label: 'VENU' },
  { gx: 2, gy: 3, base: '#2176d9', band1: '#4bc292', band2: '#ffffff', radius: 16, moon: true, label: 'EART' },
  { gx: 3, gy: 3, base: '#d95338', band1: '#ff9675', band2: '#9c2d1b', radius: 15, label: 'MARS' },
  { gx: 4, gy: 3, base: '#d69454', band1: '#f7d9b0', band2: '#a85a2b', radius: 19, spot: '#fe5f55', label: 'JUPI' },
  { gx: 5, gy: 3, base: '#e6c26b', band1: '#fff2ba', band2: '#b88f3b', radius: 15, ring: '#ffe49e', label: 'SATU' },
  { gx: 6, gy: 3, base: '#6fd8eb', band1: '#c7f7ff', band2: '#3aa6bf', radius: 16, ring: '#d6f8ff', ringTilt: true, label: 'URAN' },
  { gx: 7, gy: 3, base: '#2b5cd6', band1: '#6ea8ff', band2: '#1a388c', radius: 16, label: 'NEPT' },
  { gx: 8, gy: 3, base: '#96879c', band1: '#e0d6e6', band2: '#64566b', radius: 12, label: 'PLUT' },
  { gx: 9, gy: 2, base: '#4c2c9e', band1: '#c47dff', band2: '#231252', radius: 16, ring: '#ff70d9', label: 'PL-X' },
  { gx: 8, gy: 2, base: '#8a8279', band1: '#c4bcb3', band2: '#5c554e', radius: 13, spot: '#ffffff', label: 'CERE' },
  { gx: 3, gy: 2, base: '#c9a6d6', band1: '#f5e8ff', band2: '#8a629e', radius: 14, moon: true, label: 'ERIS' },
];

function drawPlanetCard(ctx: CanvasRenderingContext2D, ox: number, oy: number, p: PlanetDef): void {
  drawCardBase(ctx, ox, oy, '#121c36', '#090f21', '#070b17', '#56c2f5');
  // Starfield
  for (let s = 0; s < 16; s++) {
    const sx = 9 + Math.floor(hash2i(p.gx * 19 + s, p.gy, 5) * 53);
    const sy = 9 + Math.floor(hash2i(p.gx * 19 + s, p.gy, 13) * 75);
    ctx.fillStyle = s % 4 === 0 ? '#ffe680' : '#cce8ff';
    ctx.fillRect(ox + sx, oy + sy, s % 7 === 0 ? 2 : 1, s % 7 === 0 ? 2 : 1);
  }

  const cx = ox + 35;
  const cy = oy + 44;

  // Back half of ring
  if (p.ring && !p.ringTilt) {
    ctx.fillStyle = p.ring;
    ctx.fillRect(ox + 9, cy - 2, 53, 4);
  }
  if (p.ring && p.ringTilt) {
    drawPixelLine(ctx, ox + 17, oy + 63, ox + 53, oy + 25, p.ring, 3);
  }

  // Planet body
  drawPixelCircle(ctx, cx, cy, p.radius, p.base, OUTLINE);

  // Surface bands / continents clipped roughly inside radius
  const bw = Math.round(p.radius * 1.45);
  ctx.fillStyle = p.band1;
  ctx.fillRect(cx - Math.floor(bw / 2), cy - Math.floor(p.radius * 0.42), bw, 4);
  ctx.fillStyle = p.band2;
  ctx.fillRect(cx - Math.floor(bw * 0.42), cy + Math.floor(p.radius * 0.2), Math.floor(bw * 0.85), 3);

  // Specular sunlit crescent highlight
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(cx - Math.floor(p.radius * 0.55), cy - Math.floor(p.radius * 0.55), 4, 4);

  if (p.spot) {
    drawPixelCircle(ctx, cx + 5, cy + 3, 4, p.spot, OUTLINE);
  }
  if (p.ring && !p.ringTilt) {
    // Front arc of ring overlapping planet center
    ctx.fillStyle = p.ring;
    ctx.fillRect(ox + 11, cy + 2, 49, 3);
  }
  if (p.moon) {
    drawPixelCircle(ctx, ox + 55, oy + 24, 4, '#e6eef5', OUTLINE);
  }

  drawPixelText(ctx, p.label, cx, oy + 76, 1, '#8ce6ff', { align: 'center', outlineColor: '#070b17' });
}

type SpectralKind =
  | 'familiar'
  | 'grim'
  | 'incantation'
  | 'talisman'
  | 'aura'
  | 'wraith'
  | 'sigil'
  | 'ouija'
  | 'ectoplasm'
  | 'immolate'
  | 'ankh'
  | 'deja_vu'
  | 'hex'
  | 'trance'
  | 'medium'
  | 'cryptid'
  | 'soul'
  | 'black_hole';

const SPECTRAL_CELLS: Array<{ gx: number; gy: number; kind: SpectralKind }> = [
  { gx: 0, gy: 4, kind: 'familiar' },
  { gx: 1, gy: 4, kind: 'grim' },
  { gx: 2, gy: 4, kind: 'incantation' },
  { gx: 3, gy: 4, kind: 'talisman' },
  { gx: 4, gy: 4, kind: 'aura' },
  { gx: 5, gy: 4, kind: 'wraith' },
  { gx: 6, gy: 4, kind: 'sigil' },
  { gx: 7, gy: 4, kind: 'ouija' },
  { gx: 8, gy: 4, kind: 'ectoplasm' },
  { gx: 9, gy: 4, kind: 'immolate' },
  { gx: 0, gy: 5, kind: 'ankh' },
  { gx: 1, gy: 5, kind: 'deja_vu' },
  { gx: 2, gy: 5, kind: 'hex' },
  { gx: 3, gy: 5, kind: 'trance' },
  { gx: 4, gy: 5, kind: 'medium' },
  { gx: 5, gy: 5, kind: 'cryptid' },
  { gx: 2, gy: 2, kind: 'soul' },
  { gx: 9, gy: 3, kind: 'black_hole' },
];

function drawSpectralCard(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  kind: SpectralKind
): void {
  const isSoul = kind === 'soul';
  const isBlackHole = kind === 'black_hole';
  drawCardBase(
    ctx,
    ox,
    oy,
    isBlackHole ? '#0b0a1a' : isSoul ? '#26143d' : '#181840',
    '#0d0c24',
    '#070717',
    isSoul ? '#ffe066' : isBlackHole ? '#ff9248' : '#5cb8ff'
  );

  const cx = ox + 35;
  const cy = oy + 46;

  // Ethereal glow backdrop
  drawPixelCircle(
    ctx,
    cx,
    cy,
    22,
    isSoul ? 'rgba(255,224,102,0.22)' : isBlackHole ? 'rgba(255,140,66,0.28)' : 'rgba(92,184,255,0.2)'
  );
  drawSparkle(ctx, ox + 16, oy + 19, '#9ce8ff', 2);
  drawSparkle(ctx, ox + 55, oy + 74, '#c89eff', 2);

  switch (kind) {
    case 'familiar':
      drawSprite(ctx, ICON_SPRITES.cat, { a: '#6fd8ff', b: '#ffffff', c: '#b892ff', d: '#ffe066' }, cx, cy, 3, '#0b0d24');
      break;
    case 'grim':
      drawSprite(ctx, ICON_SPRITES.skull, { a: '#b8f2ff' }, cx - 3, cy + 4, 2, '#0b0d24');
      drawPixelLine(ctx, ox + 49, oy + 18, ox + 49, oy + 72, '#70f3ff', 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + 26, oy + 18, 24, 4);
      break;
    case 'incantation':
      // Open glowing spellbook
      ctx.fillStyle = '#38467a';
      ctx.fillRect(ox + 15, oy + 32, 41, 30);
      ctx.fillStyle = '#d6f5ff';
      ctx.fillRect(ox + 18, oy + 34, 16, 25);
      ctx.fillRect(ox + 37, oy + 34, 16, 25);
      drawSparkle(ctx, cx, oy + 22, '#ffe066', 5);
      break;
    case 'talisman':
      drawPixelCircle(ctx, cx, cy, 15, '#ffdf78', OUTLINE);
      drawPixelCircle(ctx, cx, cy, 10, '#f3b958');
      drawPixelText(ctx, '$', cx, cy - 6, 2, '#ffffff', { align: 'center', outlineColor: OUTLINE });
      break;
    case 'aura':
      drawSprite(ctx, ICON_SPRITES.gem, { a: '#b26cbb', b: '#70f3ff', w: '#ffffff' }, cx, cy, 3, '#0b0d24');
      drawSparkle(ctx, ox + 20, oy + 26, '#ffe066', 4);
      drawSparkle(ctx, ox + 52, oy + 62, '#ff7eb3', 4);
      break;
    case 'wraith':
      drawSprite(ctx, ICON_SPRITES.ghost, { a: '#aef2ff' }, cx, cy, 3, '#0b0d24');
      break;
    case 'sigil':
      drawPixelCircle(ctx, cx, cy, 17, '#1d1c42', '#70f3ff');
      drawSprite(ctx, ICON_SPRITES.star8, { a: '#63c5ff', b: '#ffffff' }, cx, cy, 2, '#1d1c42');
      break;
    case 'ouija':
      // Planchette pointer
      ctx.fillStyle = '#70f3ff';
      ctx.fillRect(ox + 25, oy + 26, 21, 34);
      ctx.fillRect(ox + 29, oy + 20, 13, 8);
      drawPixelCircle(ctx, cx, cy + 2, 6, '#181840', '#ffffff');
      drawPixelText(ctx, 'YES', cx, oy + 70, 1, '#b8f2ff', { align: 'center' });
      break;
    case 'ectoplasm':
      drawPixelCircle(ctx, cx, cy - 2, 16, '#4bc292', '#8af2ba');
      ctx.fillStyle = '#4bc292';
      ctx.fillRect(ox + 23, oy + 54, 6, 14);
      ctx.fillRect(ox + 35, oy + 56, 6, 17);
      ctx.fillRect(ox + 45, oy + 52, 5, 11);
      drawPixelCircle(ctx, cx, cy - 2, 7, '#1a1836', '#ffffff');
      break;
    case 'immolate':
      drawSprite(ctx, ICON_SPRITES.campfire, { a: '#70f3ff', b: '#ffffff', c: '#f3b958', d: '#fe5f55' }, cx, cy, 3, '#0b0d24');
      break;
    case 'ankh':
      drawSprite(ctx, ICON_SPRITES.ankh, { a: '#ffe066' }, cx, cy, 3, '#0b0d24');
      break;
    case 'deja_vu':
      drawPixelCircle(ctx, cx, cy, 15, '#ff7b73', OUTLINE);
      drawPixelCircle(ctx, cx, cy, 10, '#fe443b');
      drawPixelText(ctx, 'R', cx, cy - 6, 2, '#ffffff', { align: 'center', outlineColor: OUTLINE });
      break;
    case 'hex':
      drawSprite(ctx, ICON_SPRITES.bolt, { a: '#ff70d9' }, cx, cy, 3, '#ffffff');
      break;
    case 'trance':
      drawPixelCircle(ctx, cx, cy, 15, '#69baff', OUTLINE);
      drawPixelCircle(ctx, cx, cy, 10, '#1d82e6');
      drawPixelText(ctx, 'P', cx, cy - 6, 2, '#ffffff', { align: 'center', outlineColor: OUTLINE });
      break;
    case 'medium':
      drawPixelCircle(ctx, cx, cy, 15, '#be92f5', OUTLINE);
      drawPixelCircle(ctx, cx, cy, 10, '#8852c7');
      drawPixelText(ctx, 'T', cx, cy - 6, 2, '#ffffff', { align: 'center', outlineColor: OUTLINE });
      break;
    case 'cryptid':
      // Twin eerie glowing forest eyes & mirrored cards
      ctx.fillStyle = '#09091c';
      ctx.fillRect(ox + 15, oy + 26, 41, 22);
      ctx.fillStyle = '#fe5f55';
      ctx.fillRect(ox + 22, oy + 34, 8, 5);
      ctx.fillRect(ox + 41, oy + 34, 8, 5);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(ox + 25, oy + 35, 3, 3);
      ctx.fillRect(ox + 44, oy + 35, 3, 3);
      drawPixelText(ctx, '+2', cx, oy + 58, 2, '#70f3ff', { align: 'center', outlineColor: '#0b0d24' });
      break;
    case 'soul':
      // Iconic Legendary Soul Gem!
      drawSparkle(ctx, cx, cy, '#ffe066', 24);
      drawSprite(ctx, ICON_SPRITES.gem, { a: '#8a46c7', b: '#e08cff', w: '#fff5b8' }, cx, cy, 3, '#ffe066');
      break;
    case 'black_hole':
      // Swirling accretion disk & pitch-black singularity!
      drawPixelCircle(ctx, cx, cy, 20, '#ff8c42', '#ffe066');
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(ox + 8, cy - 2, 55, 5);
      drawPixelCircle(ctx, cx, cy, 12, '#05050a', '#b864ff');
      ctx.fillStyle = '#ff9248';
      ctx.fillRect(ox + 10, cy + 1, 51, 2);
      break;
  }
}

function buildTarotsAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.Tarot;
  const [canvas, ctx] = createCanvas(spec.cols * spec.cellW, spec.rows * spec.cellH);

  const planetMap = new Map<string, PlanetDef>();
  for (const p of PLANET_SPECS) planetMap.set(`${p.gx},${p.gy}`, p);

  const spectralMap = new Map<string, SpectralKind>();
  for (const s of SPECTRAL_CELLS) spectralMap.set(`${s.gx},${s.gy}`, s.kind);

  for (let gy = 0; gy < spec.rows; gy++) {
    for (let gx = 0; gx < spec.cols; gx++) {
      const ox = gx * spec.cellW;
      const oy = gy * spec.cellH;
      const key = `${gx},${gy}`;

      const planet = planetMap.get(key);
      if (planet) {
        drawPlanetCard(ctx, ox, oy, planet);
        continue;
      }
      const spectral = spectralMap.get(key);
      if (spectral) {
        drawSpectralCard(ctx, ox, oy, spectral);
        continue;
      }
      const tarotIdx = gy * 10 + gx;
      if (tarotIdx < 22) {
        drawTarotCard(ctx, ox, oy, tarotIdx);
      } else {
        // Remaining 8 unused cells in 10x6 grid get clean arcane spectral back
        drawSpectralCard(ctx, ox, oy, 'sigil');
      }
    }
  }

  return canvas;
}

// ---------------------------------------------------------------------------
// 5. Voucher Atlas (`Voucher`, 9x4 @ 71x95)
// All 32 Vouchers (16 Tier-1 parchment/crimson & Tier-2 gilded/emerald pairs)
// ---------------------------------------------------------------------------

type VoucherEmblem =
  | 'overstock'
  | 'tarot'
  | 'planet'
  | 'clearance'
  | 'hone'
  | 'grabber'
  | 'wasteful'
  | 'blank'
  | 'reroll'
  | 'seed'
  | 'crystal'
  | 'telescope'
  | 'magic'
  | 'hieroglyph'
  | 'director'
  | 'brush';

const VOUCHER_PAIRS: Array<{ gx: number; rowPair: 0 | 2; emblem: VoucherEmblem; t1Tag: string; t2Tag: string }> = [
  { gx: 0, rowPair: 0, emblem: 'overstock', t1Tag: 'STOCK', t2Tag: 'PLUS' },
  { gx: 1, rowPair: 0, emblem: 'tarot', t1Tag: 'TAROT', t2Tag: 'TYCON' },
  { gx: 2, rowPair: 0, emblem: 'planet', t1Tag: 'ORBIT', t2Tag: 'COSMO' },
  { gx: 3, rowPair: 0, emblem: 'clearance', t1Tag: '-25%', t2Tag: '-50%' },
  { gx: 4, rowPair: 0, emblem: 'hone', t1Tag: 'HONE', t2Tag: 'GLOW' },
  { gx: 5, rowPair: 0, emblem: 'grabber', t1Tag: '+HAND', t2Tag: 'TONGS' },
  { gx: 6, rowPair: 0, emblem: 'wasteful', t1Tag: '+DISC', t2Tag: 'RECYC' },
  { gx: 7, rowPair: 0, emblem: 'blank', t1Tag: 'BLANK', t2Tag: 'ANTI' },
  { gx: 0, rowPair: 2, emblem: 'reroll', t1Tag: '-$2', t2Tag: '-$4' },
  { gx: 1, rowPair: 2, emblem: 'seed', t1Tag: 'SEED', t2Tag: 'TREE' },
  { gx: 2, rowPair: 2, emblem: 'crystal', t1Tag: 'ORB', t2Tag: 'OMEN' },
  { gx: 3, rowPair: 2, emblem: 'telescope', t1Tag: 'SCOPE', t2Tag: 'OBSV' },
  { gx: 4, rowPair: 2, emblem: 'magic', t1Tag: 'MAGIC', t2Tag: 'ILLUS' },
  { gx: 5, rowPair: 2, emblem: 'hieroglyph', t1Tag: 'GLYPH', t2Tag: 'PETRO' },
  { gx: 6, rowPair: 2, emblem: 'director', t1Tag: 'CUT', t2Tag: 'RETCO' },
  { gx: 7, rowPair: 2, emblem: 'brush', t1Tag: 'BRUSH', t2Tag: 'PALET' },
];

function drawVoucherEmblem(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  emblem: VoucherEmblem,
  tier2: boolean
): void {
  const cx = ox + 35;
  const cy = oy + 42;
  const primary = tier2 ? '#ffd84d' : '#c94538';
  const secondary = tier2 ? '#4bc292' : '#f3b958';

  switch (emblem) {
    case 'overstock':
      // Shop awning / extra slot shelves
      ctx.fillStyle = primary;
      ctx.fillRect(ox + 18, oy + 28, 35, 10);
      ctx.fillStyle = '#ffffff';
      for (let x = 20; x < 50; x += 8) ctx.fillRect(ox + x, oy + 28, 4, 10);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 21, oy + 40, 29, 18);
      ctx.fillStyle = secondary;
      ctx.fillRect(ox + 23, oy + 42, 11, 14);
      ctx.fillRect(ox + 37, oy + 42, 11, 14);
      break;
    case 'tarot':
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 22, oy + 28, 16, 26);
      ctx.fillRect(ox + 33, oy + 32, 16, 26);
      ctx.fillStyle = '#8867a5';
      ctx.fillRect(ox + 24, oy + 30, 12, 22);
      ctx.fillStyle = tier2 ? '#ffd84d' : '#efe2c8';
      ctx.fillRect(ox + 35, oy + 34, 12, 22);
      break;
    case 'planet':
      drawSprite(ctx, ICON_SPRITES.planetRing, { a: '#009dff', c: tier2 ? '#ffd84d' : '#70f3ff' }, cx, cy, 2, OUTLINE);
      break;
    case 'clearance':
      drawSprite(ctx, ICON_SPRITES.ticket, { a: primary, b: '#fff4c2', c: '#fe5f55' }, cx, cy, 2, OUTLINE);
      break;
    case 'hone':
      drawSprite(ctx, ICON_SPRITES.gem, { a: tier2 ? '#4bc292' : '#009dff', b: '#ffd866', w: '#ffffff' }, cx, cy, 2, OUTLINE);
      break;
    case 'grabber':
      if (tier2) {
        drawSprite(ctx, ICON_SPRITES.tongs, { a: '#ffd84d', b: '#fe5f55' }, cx, cy, 2, OUTLINE);
      } else {
        drawSprite(ctx, ICON_SPRITES.hand4, { a: '#ffffff', b: '#fe5f55' }, cx, cy, 2, OUTLINE);
      }
      break;
    case 'wasteful':
      if (tier2) {
        drawSprite(ctx, ICON_SPRITES.recycle, { a: '#4bc292' }, cx, cy, 2, OUTLINE);
      } else {
        drawSprite(ctx, ICON_SPRITES.trash, { a: '#95a3ad', b: '#c94538' }, cx, cy, 2, OUTLINE);
      }
      break;
    case 'blank':
      if (tier2) {
        // Antimatter glowing void orb!
        drawPixelCircle(ctx, cx, cy, 13, '#0b0a1c', '#70f3ff');
        drawPixelCircle(ctx, cx, cy, 7, '#b26cbb', '#ffffff');
      } else {
        drawPixelCircle(ctx, cx, cy, 10, '#f7f3ea', '#c7bfb0');
      }
      break;
    case 'reroll':
      drawSprite(ctx, ICON_SPRITES.die6, { a: tier2 ? '#4bc292' : '#2ea36b', w: '#ffffff' }, cx, cy, 2, OUTLINE);
      break;
    case 'seed':
      if (tier2) {
        drawSprite(ctx, ICON_SPRITES.tree, { a: '#4bc292', b: '#ffd84d', c: '#8c5a32' }, cx, cy, 2, OUTLINE);
      } else {
        drawSprite(ctx, ICON_SPRITES.leaf, { a: '#4bc292', b: '#ffe066' }, cx, cy, 2, OUTLINE);
      }
      break;
    case 'crystal':
      drawSprite(
        ctx,
        ICON_SPRITES.crystalBall,
        { a: tier2 ? '#70f3ff' : '#c8a6ff', b: tier2 ? '#4f46b8' : '#7848bd', w: '#ffffff', c: '#f3b958' },
        cx,
        cy,
        2,
        OUTLINE
      );
      break;
    case 'telescope':
      drawSprite(ctx, ICON_SPRITES.telescope, { a: tier2 ? '#ffd84d' : '#c98842', b: '#374649' }, cx, cy, 2, OUTLINE);
      break;
    case 'magic':
      drawSprite(ctx, ICON_SPRITES.tophat, { a: '#22292d', b: tier2 ? '#ffd84d' : '#fe5f55' }, cx, cy, 2, OUTLINE);
      break;
    case 'hieroglyph':
      drawSprite(
        ctx,
        ICON_SPRITES.eye,
        { a: '#8c6239', b: '#f5d782', w: '#ffffff', c: tier2 ? '#4bc292' : '#009dff', d: OUTLINE },
        cx,
        cy,
        2,
        OUTLINE
      );
      break;
    case 'director':
      drawSprite(ctx, ICON_SPRITES.clapper, { a: '#22292d', b: tier2 ? '#ffd84d' : '#c94538', w: '#ffffff' }, cx, cy, 2, OUTLINE);
      break;
    case 'brush':
      if (tier2) {
        drawSprite(ctx, ICON_SPRITES.palette, { a: '#e8c494', b: '#fe5f55', c: '#009dff', d: '#4bc292' }, cx, cy, 2, OUTLINE);
      } else {
        drawSprite(ctx, ICON_SPRITES.brush, { a: '#fe5f55', b: '#d6dee6', c: '#8c5a32' }, cx, cy, 2, OUTLINE);
      }
      break;
  }
}

function buildVouchersAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.Voucher;
  const [canvas, ctx] = createCanvas(spec.cols * spec.cellW, spec.rows * spec.cellH);

  const pairMap = new Map<string, { emblem: VoucherEmblem; tier2: boolean; tag: string }>();
  for (const p of VOUCHER_PAIRS) {
    pairMap.set(`${p.gx},${p.rowPair}`, { emblem: p.emblem, tier2: false, tag: p.t1Tag });
    pairMap.set(`${p.gx},${p.rowPair + 1}`, { emblem: p.emblem, tier2: true, tag: p.t2Tag });
  }

  for (let gy = 0; gy < spec.rows; gy++) {
    for (let gx = 0; gx < spec.cols; gx++) {
      const ox = gx * spec.cellW;
      const oy = gy * spec.cellH;
      const entry = pairMap.get(`${gx},${gy}`);
      const isTier2 = entry ? entry.tier2 : gy % 2 === 1;
      const isBlank = entry?.emblem === 'blank' && !isTier2;
      const isAntimatter = entry?.emblem === 'blank' && isTier2;

      // Tier-1: vintage parchment & crimson ticket | Tier-2: gilded gold & emerald upgraded ticket
      const bg = isAntimatter
        ? '#14122b'
        : isBlank
          ? '#faf6ee'
          : isTier2
            ? '#1d5e48'
            : '#b53b38';
      const innerPanel = isAntimatter
        ? '#1f1b40'
        : isBlank
          ? '#f2ede2'
          : isTier2
            ? '#154736'
            : '#f2e4cc';
      const trim = isAntimatter ? '#70f3ff' : isTier2 ? '#ffd84d' : '#f3c57a';

      drawCardBase(ctx, ox, oy, bg, 'rgba(0,0,0,0.22)', OUTLINE, trim);

      // Inner ticket parchment/emerald panel
      ctx.fillStyle = innerPanel;
      ctx.fillRect(ox + 9, oy + 9, 53, 77);
      // Perforated ticket line
      ctx.fillStyle = trim;
      for (let x = 11; x < 60; x += 5) ctx.fillRect(ox + x, oy + 65, 3, 1);

      // Classic ticket side notches
      ctx.clearRect(ox, oy + 42, 5, 11);
      ctx.clearRect(ox + 66, oy + 42, 5, 11);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 5, oy + 42, 2, 11);
      ctx.fillRect(ox + 64, oy + 42, 2, 11);

      // Tier header ribbon
      drawPixelText(
        ctx,
        isTier2 ? 'TIER II' : 'TIER I',
        ox + 35,
        oy + 13,
        1,
        isBlank ? '#8c8375' : isTier2 ? '#ffe066' : '#9c2c28',
        { align: 'center' }
      );

      if (entry) {
        drawVoucherEmblem(ctx, ox, oy, entry.emblem, isTier2);
        drawPixelText(
          ctx,
          entry.tag,
          ox + 35,
          oy + 73,
          1,
          isBlank ? '#8c8375' : isTier2 ? '#ffe066' : '#3a291e',
          { align: 'center' }
        );
      } else {
        drawSprite(ctx, ICON_SPRITES.crown, { a: '#ffd84d', b: '#fe5f55', c: '#4bc292', d: '#b87f1c' }, ox + 35, oy + 42, 2, OUTLINE);
        drawPixelText(ctx, 'VIP', ox + 35, oy + 73, 1, isTier2 ? '#ffe066' : '#3a291e', { align: 'center' });
      }
    }
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// 6. Booster Pack Atlas (`Booster`, 4x9 @ 71x95)
// Distinct foil pack art for Arcana, Celestial, Spectral, Standard, Buffoon across Normal/Jumbo/Mega!
// ---------------------------------------------------------------------------

interface BoosterCellSpec {
  kind: 'Arcana' | 'Celestial' | 'Spectral' | 'Standard' | 'Buffoon' | 'Spare';
  size: 'Normal' | 'Jumbo' | 'Mega';
  variant: number;
}

function getBoosterCellSpec(gx: number, gy: number): BoosterCellSpec {
  switch (gy) {
    case 0:
      return { kind: 'Arcana', size: 'Normal', variant: gx };
    case 1:
      return { kind: 'Celestial', size: 'Normal', variant: gx };
    case 2:
      return { kind: 'Arcana', size: gx < 2 ? 'Jumbo' : 'Mega', variant: gx % 2 };
    case 3:
      return { kind: 'Celestial', size: gx < 2 ? 'Jumbo' : 'Mega', variant: gx % 2 };
    case 4:
      return { kind: 'Spectral', size: gx < 2 ? 'Normal' : gx === 2 ? 'Jumbo' : 'Mega', variant: gx };
    case 6:
      return { kind: 'Standard', size: 'Normal', variant: gx };
    case 7:
      return { kind: 'Standard', size: gx < 2 ? 'Jumbo' : 'Mega', variant: gx % 2 };
    case 8:
      return { kind: 'Buffoon', size: gx < 2 ? 'Normal' : gx === 2 ? 'Jumbo' : 'Mega', variant: gx };
    default:
      return { kind: 'Spare', size: 'Normal', variant: gx };
  }
}

function buildBoostersAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.Booster;
  const [canvas, ctx] = createCanvas(spec.cols * spec.cellW, spec.rows * spec.cellH);

  const kindPalette: Record<
    BoosterCellSpec['kind'],
    { bg: string; shade: string; stripe: string; glow: string; label: string }
  > = {
    Arcana: { bg: '#653e96', shade: '#3c2161', stripe: '#c79eff', glow: '#ffe066', label: 'ARCANA' },
    Celestial: { bg: '#183f7d', shade: '#0e244d', stripe: '#6fd8ff', glow: '#ffe082', label: 'PLANET' },
    Spectral: { bg: '#1c2459', shade: '#101438', stripe: '#56f0ff', glow: '#b892ff', label: 'SPECTRA' },
    Standard: { bg: '#b83232', shade: '#7a1c1c', stripe: '#ffd166', glow: '#ffffff', label: 'DECK' },
    Buffoon: { bg: '#d9731e', shade: '#96470c', stripe: '#ffe066', glow: '#fe5f55', label: 'BUFFOON' },
    Spare: { bg: '#38586e', shade: '#223747', stripe: '#99d5ff', glow: '#ffe066', label: 'PACK' },
  };

  for (let gy = 0; gy < spec.rows; gy++) {
    for (let gx = 0; gx < spec.cols; gx++) {
      const ox = gx * spec.cellW;
      const oy = gy * spec.cellH;
      const cell = getBoosterCellSpec(gx, gy);
      const pal = kindPalette[cell.kind];
      const isMega = cell.size === 'Mega';
      const isJumbo = cell.size === 'Jumbo';

      // Metallic foil wrapper
      drawCardBase(ctx, ox, oy, pal.bg, pal.shade, OUTLINE);

      // Crimped metallic silver/gold top & bottom foil seals
      const crimpBg = isMega ? '#ffe066' : isJumbo ? '#e8eef5' : '#cfd8e3';
      const crimpLine = isMega ? '#b88314' : '#7b8a99';
      ctx.fillStyle = crimpBg;
      ctx.fillRect(ox + 4, oy + 4, 63, 7);
      ctx.fillRect(ox + 4, oy + 84, 63, 7);
      ctx.fillStyle = crimpLine;
      for (let x = 6; x < 65; x += 4) {
        ctx.fillRect(ox + x, oy + 4, 2, 7);
        ctx.fillRect(ox + x, oy + 84, 2, 7);
      }

      // Foil gloss highlight diagonal sheen
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      for (let i = 0; i < 42; i++) {
        ctx.fillRect(ox + 10 + i, oy + 62 - i, 5, 2);
      }

      // Header & footer ribbon bands
      ctx.fillStyle = isMega ? '#ffd84d' : pal.stripe;
      ctx.fillRect(ox + 5, oy + 14, 61, 9);
      ctx.fillRect(ox + 5, oy + 71, 61, 10);

      // Size banner at top
      const sizeText = isMega ? 'MEGA' : isJumbo ? 'JUMBO' : 'PACK';
      drawPixelText(ctx, sizeText, ox + 35, oy + 15, 1, OUTLINE, { align: 'center' });

      // Central foil medallion & bespoke icon per kind + variant
      const cx = ox + 35;
      const cy = oy + 47;
      drawPixelCircle(ctx, cx, cy, isMega ? 20 : 18, isMega ? '#ffe066' : '#ffffff', OUTLINE);
      drawPixelCircle(ctx, cx, cy, isMega ? 16 : 14, pal.shade);

      if (cell.kind === 'Arcana') {
        const arcIcons = [ICON_SPRITES.eye, ICON_SPRITES.crescent, ICON_SPRITES.star8, ICON_SPRITES.sun];
        drawSprite(
          ctx,
          arcIcons[cell.variant % arcIcons.length]!,
          { a: '#ffe066', b: '#c79eff', w: '#ffffff', c: '#fe5f55', d: '#241438' },
          cx,
          cy,
          2,
          OUTLINE
        );
      } else if (cell.kind === 'Celestial') {
        const celSprites = [
          ICON_SPRITES.planetRing,
          ICON_SPRITES.comet,
          ICON_SPRITES.crescent,
          ICON_SPRITES.star8,
        ];
        const celColors = [
          { a: '#6fd8ff', c: '#ffe066', b: '#ffffff' },
          { a: '#ffe066', c: '#ff8c42', b: '#ffffff' },
          { a: '#c7d8ff', c: '#ffe066', b: '#ffffff' },
          { a: '#70f3ff', c: '#ffe066', b: '#ffffff' },
        ];
        const vIdx = cell.variant % 4;
        drawSprite(ctx, celSprites[vIdx]!, celColors[vIdx]!, cx, cy, 2, OUTLINE);
      } else if (cell.kind === 'Spectral') {
        const spIcons = [ICON_SPRITES.ghost, ICON_SPRITES.ankh, ICON_SPRITES.gem, ICON_SPRITES.star8];
        drawSprite(
          ctx,
          spIcons[cell.variant % spIcons.length]!,
          { a: '#70f3ff', b: '#e08cff', w: '#ffffff' },
          cx,
          cy,
          2,
          '#09091c'
        );
      } else if (cell.kind === 'Standard') {
        const suits: Suit[] = ['Hearts', 'Spades', 'Diamonds', 'Clubs'];
        const s = suits[cell.variant % 4]!;
        drawSuitIcon(ctx, s, cx, cy, 'md', s === 'Hearts' || s === 'Diamonds' ? '#fe5f55' : '#eef5ff');
      } else if (cell.kind === 'Buffoon') {
        drawSprite(
          ctx,
          ICON_SPRITES.miniJester,
          { a: cell.variant % 2 === 0 ? '#fe5f55' : '#009dff', b: '#fff8eb', c: '#ffe066' },
          cx,
          cy,
          2,
          OUTLINE
        );
      } else {
        drawSprite(ctx, ICON_SPRITES.star8, { a: '#ffe066', b: '#ffffff' }, cx, cy, 2, OUTLINE);
      }

      if (isMega) {
        drawSparkle(ctx, ox + 13, oy + 31, '#ffffff', 3);
        drawSparkle(ctx, ox + 57, oy + 62, '#ffffff', 3);
      }

      drawPixelText(ctx, pal.label, ox + 35, oy + 73, 1, '#ffffff', {
        align: 'center',
        outlineColor: OUTLINE,
      });
    }
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// 7. Blind Chips Atlas (`BlindChips`, 21x31 @ 34x34)
// Exact oracle.json bossColor & bespoke pixel icons for all 30 Blinds!
// ---------------------------------------------------------------------------

interface BlindRowSpec {
  color: string;
  showdown?: boolean;
  icon:
    | 'small'
    | 'big'
    | 'ox'
    | 'house'
    | 'club'
    | 'fish'
    | 'window'
    | 'hook'
    | 'manacle'
    | 'wall'
    | 'wheel'
    | 'arm'
    | 'psychic'
    | 'goad'
    | 'water'
    | 'serpent'
    | 'pillar'
    | 'eye'
    | 'mouth'
    | 'plant'
    | 'needle'
    | 'head'
    | 'tooth'
    | 'mark'
    | 'flint'
    | 'heart'
    | 'bell'
    | 'acorn'
    | 'leaf'
    | 'vessel'
    | 'spare';
}

const BLIND_ROWS: BlindRowSpec[] = [
  { color: '#3c6eb8', icon: 'small' },     // 0 Small Blind
  { color: '#e0952b', icon: 'big' },       // 1 Big Blind
  { color: '#b95b08', icon: 'ox' },        // 2 The Ox
  { color: '#5186a8', icon: 'house' },     // 3 The House
  { color: '#b9cb92', icon: 'club' },      // 4 The Club
  { color: '#3e85bd', icon: 'fish' },      // 5 The Fish
  { color: '#a9a295', icon: 'window' },    // 6 The Window
  { color: '#a84024', icon: 'hook' },      // 7 The Hook
  { color: '#575757', icon: 'manacle' },   // 8 The Manacle
  { color: '#8a59a5', icon: 'wall' },      // 9 The Wall
  { color: '#50bf7c', icon: 'wheel' },     // 10 The Wheel
  { color: '#6865f3', icon: 'arm' },       // 11 The Arm
  { color: '#efc03c', icon: 'psychic' },   // 12 The Psychic
  { color: '#b95c96', icon: 'goad' },      // 13 The Goad
  { color: '#c6e0eb', icon: 'water' },     // 14 The Water (exact oracle.json bossColor)
  { color: '#439a4f', icon: 'serpent' },   // 15 The Serpent
  { color: '#7e6752', icon: 'pillar' },    // 16 The Pillar
  { color: '#4b71e4', icon: 'eye' },       // 17 The Eye
  { color: '#ae718e', icon: 'mouth' },     // 18 The Mouth
  { color: '#709284', icon: 'plant' },     // 19 The Plant
  { color: '#5c6e31', icon: 'needle' },    // 20 The Needle
  { color: '#ac9db4', icon: 'head' },      // 21 The Head
  { color: '#b52d2d', icon: 'tooth' },     // 22 The Tooth
  { color: '#6a3847', icon: 'mark' },      // 23 The Mark
  { color: '#e56a2f', icon: 'flint' },     // 24 The Flint
  { color: '#ac3232', icon: 'heart', showdown: true },  // 25 Crimson Heart
  { color: '#009cfd', icon: 'bell', showdown: true },   // 26 Cerulean Bell
  { color: '#fda200', icon: 'acorn', showdown: true },  // 27 Amber Acorn
  { color: '#56a786', icon: 'leaf', showdown: true },   // 28 Verdant Leaf
  { color: '#8a71e1', icon: 'vessel', showdown: true }, // 29 Violet Vessel
  { color: '#4f6367', icon: 'spare' },     // 30 Spare
];

function drawBlindCenterIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  icon: BlindRowSpec['icon'],
  bg: string
): void {
  const lightChip = bg === '#c6e0eb' || bg === '#b9cb92' || bg === '#efc03c' || bg === '#a9a295';
  const fg = lightChip ? '#1d2429' : '#ffffff';
  const outline = lightChip ? undefined : OUTLINE;

  switch (icon) {
    case 'small':
      drawPixelText(ctx, 'S', cx, cy - 3, 1, fg, { align: 'center', shadowColor: outline });
      break;
    case 'big':
      drawPixelText(ctx, 'B', cx, cy - 3, 1, fg, { align: 'center', shadowColor: outline });
      break;
    case 'ox':
      drawSprite(ctx, ICON_SPRITES.ox, { a: fg }, cx, cy, 1, outline);
      break;
    case 'house':
      drawSprite(ctx, ICON_SPRITES.house, { a: fg, b: '#f5d782' }, cx, cy, 1, outline);
      break;
    case 'club':
      drawSuitIcon(ctx, 'Clubs', cx, cy, 'sm', fg);
      break;
    case 'fish':
      drawSprite(ctx, ICON_SPRITES.fish, { a: fg }, cx, cy, 1, outline);
      break;
    case 'window':
      drawSuitIcon(ctx, 'Diamonds', cx, cy, 'sm', fg);
      break;
    case 'hook':
      drawSprite(ctx, ICON_SPRITES.hook, { a: fg }, cx, cy, 1, outline);
      break;
    case 'manacle':
      drawSprite(ctx, ICON_SPRITES.manacle, { a: fg }, cx, cy, 1, outline);
      break;
    case 'wall':
      ctx.fillStyle = fg;
      ctx.fillRect(cx - 5, cy - 4, 4, 3);
      ctx.fillRect(cx + 1, cy - 4, 4, 3);
      ctx.fillRect(cx - 3, cy, 6, 3);
      ctx.fillRect(cx - 5, cy + 4, 4, 2);
      ctx.fillRect(cx + 1, cy + 4, 4, 2);
      break;
    case 'wheel':
      drawSprite(ctx, ICON_SPRITES.wheel, { a: fg }, cx, cy, 1, outline);
      break;
    case 'arm':
      ctx.fillStyle = fg;
      ctx.fillRect(cx - 4, cy - 3, 8, 5);
      ctx.fillRect(cx - 2, cy + 2, 4, 4);
      break;
    case 'psychic':
      drawPixelCircle(ctx, cx, cy, 5, '#ffffff', OUTLINE);
      drawPixelCircle(ctx, cx, cy, 2, '#6865f3');
      break;
    case 'goad':
      drawSuitIcon(ctx, 'Spades', cx, cy, 'sm', fg);
      break;
    case 'water':
      drawSprite(ctx, ICON_SPRITES.drop, { a: '#1e6ec4', b: '#ffffff' }, cx, cy, 1);
      break;
    case 'serpent':
      drawSprite(ctx, ICON_SPRITES.serpent, { a: fg }, cx, cy, 1, outline);
      break;
    case 'pillar':
      drawSprite(ctx, ICON_SPRITES.pillar, { a: fg, b: '#ffe082' }, cx, cy, 1, outline);
      break;
    case 'eye':
      drawSprite(ctx, ICON_SPRITES.eye, { a: '#ffffff', b: '#ffffff', w: '#ffffff', c: '#1b2640', d: '#ffe066' }, cx, cy, 1);
      break;
    case 'mouth':
      drawSprite(ctx, ICON_SPRITES.mouth, { a: '#fe5f55', w: '#ffffff' }, cx, cy, 1);
      break;
    case 'plant':
      drawSprite(ctx, ICON_SPRITES.leaf, { a: '#c4ffba', b: '#ffffff' }, cx, cy, 1, outline);
      break;
    case 'needle':
      drawSprite(ctx, ICON_SPRITES.needle, { a: fg }, cx, cy, 1, outline);
      break;
    case 'head':
      drawSuitIcon(ctx, 'Hearts', cx, cy, 'sm', fg);
      break;
    case 'tooth':
      drawSprite(ctx, ICON_SPRITES.tooth, { a: '#ffffff' }, cx, cy, 1, OUTLINE);
      break;
    case 'mark':
      drawPixelText(ctx, 'X', cx, cy - 3, 1, fg, { align: 'center', shadowColor: outline });
      break;
    case 'flint':
      drawSprite(ctx, ICON_SPRITES.bolt, { a: '#ffe066' }, cx, cy, 1, OUTLINE);
      break;
    case 'heart':
      drawSuitIcon(ctx, 'Hearts', cx, cy, 'md', '#ffe066');
      drawSuitIcon(ctx, 'Hearts', cx, cy, 'sm', '#ffffff');
      break;
    case 'bell':
      drawSprite(ctx, ICON_SPRITES.bell, { a: '#ffe066', b: '#ffffff', c: '#f3b958' }, cx, cy, 1, OUTLINE);
      break;
    case 'acorn':
      drawSprite(ctx, ICON_SPRITES.acorn, { a: '#fff0b3', b: '#6e3f16' }, cx, cy, 1, OUTLINE);
      break;
    case 'leaf':
      drawSprite(ctx, ICON_SPRITES.leaf, { a: '#d6ffdb', b: '#ffe066' }, cx, cy, 1, OUTLINE);
      break;
    case 'vessel':
      drawSprite(ctx, ICON_SPRITES.chalice, { a: '#ffe066', b: '#ffffff' }, cx, cy, 1, OUTLINE);
      break;
    case 'spare':
      drawSprite(ctx, ICON_SPRITES.star8, { a: '#ffe066', b: '#ffffff' }, cx, cy, 1);
      break;
  }
}

function buildBlindChipsAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.BlindChips;
  const [canvas, ctx] = createCanvas(spec.cols * spec.cellW, spec.rows * spec.cellH);

  for (let gy = 0; gy < spec.rows; gy++) {
    const row = BLIND_ROWS[gy % BLIND_ROWS.length]!;
    for (let gx = 0; gx < spec.cols; gx++) {
      const ox = gx * spec.cellW;
      const oy = gy * spec.cellH;
      const cx = ox + 17;
      const cy = oy + 17;
      const angle = (gx / spec.cols) * Math.PI * 2;

      // Outer chip disc
      drawPixelCircle(ctx, cx, cy, 14, row.color, row.showdown ? '#ffe066' : OUTLINE);
      // 6 rotating rim notches (golden on Ante-8 Showdown Bosses, crisp ivory on others)
      ctx.fillStyle = row.showdown ? '#ffe066' : '#ffffff';
      for (let k = 0; k < 6; k++) {
        const a = angle + (k * Math.PI) / 3;
        const nx = Math.round(cx + Math.cos(a) * 11.5);
        const ny = Math.round(cy + Math.sin(a) * 11.5);
        ctx.fillRect(nx - 1, ny - 1, 3, 3);
      }
      // Inner medallion
      drawPixelCircle(ctx, cx, cy, 9, row.showdown ? '#ffe066' : '#faf6ee', OUTLINE);
      drawPixelCircle(ctx, cx, cy, 7, row.color);
      drawBlindCenterIcon(ctx, cx, cy, row.icon, row.color);
    }
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// 8. Tags Atlas (`tags`, 6x5 @ 34x34)
// Exact oracle.json coordinates for all 24 Skip Tags with distinct colors & icons!
// ---------------------------------------------------------------------------

interface TagSpec {
  gx: number;
  gy: number;
  bg: string;
  rim: string;
  draw: (ctx: CanvasRenderingContext2D, ox: number, oy: number) => void;
}

const TAG_SPECS: TagSpec[] = [
  {
    gx: 0, gy: 0, bg: '#2ea36b', rim: '#8af2ba', // tag_uncommon
    draw: (ctx, ox, oy) => drawSprite(ctx, ICON_SPRITES.miniJester, { a: '#8af2ba', b: '#ffffff', c: '#ffe066' }, ox + 17, oy + 16, 1, OUTLINE),
  },
  {
    gx: 1, gy: 0, bg: '#d93829', rim: '#ff9b94', // tag_rare
    draw: (ctx, ox, oy) => drawSprite(ctx, ICON_SPRITES.crown, { a: '#ffe066', b: '#ffffff', c: '#fe5f55', d: '#b87f1c' }, ox + 17, oy + 16, 1, OUTLINE),
  },
  {
    gx: 2, gy: 0, bg: '#18162e', rim: '#70f3ff', // tag_negative
    draw: (ctx, ox, oy) => {
      drawPixelCircle(ctx, ox + 17, oy + 16, 6, '#2b2459', '#70f3ff');
      drawPixelText(ctx, '-1', ox + 17, oy + 13, 1, '#ffffff', { align: 'center' });
    },
  },
  {
    gx: 3, gy: 0, bg: '#3c8fd9', rim: '#c7ecff', // tag_foil
    draw: (ctx, ox, oy) => drawSprite(ctx, ICON_SPRITES.gem, { a: '#99d5ff', b: '#ffffff', w: '#ffe066' }, ox + 17, oy + 16, 1, OUTLINE),
  },
  {
    gx: 4, gy: 0, bg: '#e6a017', rim: '#fff2a6', // tag_coupon
    draw: (ctx, ox, oy) => drawPixelText(ctx, '$0', ox + 17, oy + 13, 1, '#ffffff', { align: 'center', outlineColor: OUTLINE }),
  },
  {
    gx: 5, gy: 0, bg: '#4b6be0', rim: '#a8c2ff', // tag_double
    draw: (ctx, ox, oy) => drawPixelText(ctx, 'X2', ox + 17, oy + 13, 1, '#ffe066', { align: 'center', outlineColor: OUTLINE }),
  },
  {
    gx: 0, gy: 1, bg: '#cc3b82', rim: '#ffa6d2', // tag_holo
    draw: (ctx, ox, oy) => drawSprite(ctx, ICON_SPRITES.star8, { a: '#ff99cc', b: '#ffffff' }, ox + 17, oy + 16, 1, OUTLINE),
  },
  {
    gx: 1, gy: 1, bg: '#5a368a', rim: '#ffe066', // tag_polychrome
    draw: (ctx, ox, oy) => {
      const rb = ['#fe5f55', '#fda200', '#4bc292', '#009dff', '#b26cbb'];
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = rb[i]!;
        ctx.fillRect(ox + 9 + i * 3, oy + 11, 3, 10);
      }
      drawSparkle(ctx, ox + 17, oy + 16, '#ffffff', 4);
    },
  },
  {
    gx: 2, gy: 1, bg: '#c98818', rim: '#ffe885', // tag_investment
    draw: (ctx, ox, oy) => drawSprite(ctx, ICON_SPRITES.bag, { a: '#ffe066', b: '#2ea36b' }, ox + 17, oy + 16, 1, OUTLINE),
  },
  {
    gx: 3, gy: 1, bg: '#b5523b', rim: '#ffd2a6', // tag_voucher
    draw: (ctx, ox, oy) => drawSprite(ctx, ICON_SPRITES.ticket, { a: '#ffe066', b: '#faf6ee', c: '#fe5f55' }, ox + 17, oy + 16, 1, OUTLINE),
  },
  {
    gx: 4, gy: 1, bg: '#1f7acc', rim: '#8ce0ff', // tag_top_up
    draw: (ctx, ox, oy) => drawPixelText(ctx, '+2', ox + 17, oy + 13, 1, '#ffffff', { align: 'center', outlineColor: OUTLINE }),
  },
  {
    gx: 5, gy: 1, bg: '#219e8f', rim: '#99f5e8', // tag_juggle
    draw: (ctx, ox, oy) => {
      drawPixelCircle(ctx, ox + 12, oy + 18, 3, '#fe5f55', OUTLINE);
      drawPixelCircle(ctx, ox + 17, oy + 12, 3, '#ffe066', OUTLINE);
      drawPixelCircle(ctx, ox + 22, oy + 18, 3, '#009dff', OUTLINE);
    },
  },
  {
    gx: 0, gy: 2, bg: '#8f2438', rim: '#ff8a9e', // tag_boss
    draw: (ctx, ox, oy) => drawSprite(ctx, ICON_SPRITES.skull, { a: '#ffffff' }, ox + 17, oy + 16, 1, OUTLINE),
  },
  {
    gx: 1, gy: 2, bg: '#c93838', rim: '#ffe082', // tag_standard
    draw: (ctx, ox, oy) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + 12, oy + 10, 10, 13);
      drawSuitIcon(ctx, 'Hearts', ox + 17, oy + 16, 'sm', '#fe5f55');
    },
  },
  {
    gx: 2, gy: 2, bg: '#7348a8', rim: '#d9b8ff', // tag_charm
    draw: (ctx, ox, oy) => drawSprite(ctx, ICON_SPRITES.crescent, { a: '#ffe066' }, ox + 17, oy + 16, 1, OUTLINE),
  },
  {
    gx: 3, gy: 2, bg: '#1e589e', rim: '#8ce0ff', // tag_meteor
    draw: (ctx, ox, oy) => drawSprite(ctx, ICON_SPRITES.comet, { a: '#ffe066' }, ox + 17, oy + 16, 1, OUTLINE),
  },
  {
    gx: 4, gy: 2, bg: '#d9731e', rim: '#ffe066', // tag_buffoon
    draw: (ctx, ox, oy) => drawSprite(ctx, ICON_SPRITES.miniJester, { a: '#fe5f55', b: '#fff8eb', c: '#ffe066' }, ox + 17, oy + 16, 1, OUTLINE),
  },
  {
    gx: 5, gy: 2, bg: '#3e389e', rim: '#a8a6ff', // tag_orbital
    draw: (ctx, ox, oy) => drawSprite(ctx, ICON_SPRITES.planetRing, { a: '#70f3ff', c: '#ffe066' }, ox + 17, oy + 16, 1, OUTLINE),
  },
  {
    gx: 0, gy: 3, bg: '#d99b1e', rim: '#fff4a6', // tag_skip (Speed Tag)
    draw: (ctx, ox, oy) => drawSprite(ctx, ICON_SPRITES.bolt, { a: '#ffffff' }, ox + 17, oy + 16, 1, OUTLINE),
  },
  {
    gx: 1, gy: 3, bg: '#266ec4', rim: '#8cc8ff', // tag_handy
    draw: (ctx, ox, oy) => drawSprite(ctx, ICON_SPRITES.hand4, { a: '#ffffff', b: '#ffe066' }, ox + 17, oy + 16, 1, OUTLINE),
  },
  {
    gx: 2, gy: 3, bg: '#4f6e52', rim: '#a8d6ad', // tag_garbage
    draw: (ctx, ox, oy) => drawSprite(ctx, ICON_SPRITES.trash, { a: '#dce6eb', b: '#ffe066' }, ox + 17, oy + 16, 1, OUTLINE),
  },
  {
    gx: 3, gy: 3, bg: '#2b479e', rim: '#8ceeff', // tag_ethereal
    draw: (ctx, ox, oy) => drawSprite(ctx, ICON_SPRITES.ghost, { a: '#b8f5ff' }, ox + 17, oy + 16, 1, OUTLINE),
  },
  {
    gx: 4, gy: 3, bg: '#2c8c58', rim: '#ffe066', // tag_economy
    draw: (ctx, ox, oy) => drawPixelText(ctx, '$$', ox + 17, oy + 13, 1, '#ffe066', { align: 'center', outlineColor: OUTLINE }),
  },
  {
    gx: 5, gy: 3, bg: '#b83238', rim: '#ffffff', // tag_d_six
    draw: (ctx, ox, oy) => drawSprite(ctx, ICON_SPRITES.die6, { a: '#ffffff', w: OUTLINE }, ox + 17, oy + 16, 1, OUTLINE),
  },
];

function buildTagsAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.tags;
  const [canvas, ctx] = createCanvas(spec.cols * spec.cellW, spec.rows * spec.cellH);
  const tagMap = new Map<string, TagSpec>();
  for (const t of TAG_SPECS) tagMap.set(`${t.gx},${t.gy}`, t);

  for (let gy = 0; gy < spec.rows; gy++) {
    for (let gx = 0; gx < spec.cols; gx++) {
      const ox = gx * spec.cellW;
      const oy = gy * spec.cellH;
      const tag = tagMap.get(`${gx},${gy}`);
      const bg = tag?.bg ?? '#4f6367';
      const rim = tag?.rim ?? '#ffffff';

      // Heraldic tag shield with pointed base
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ox + 4, oy + 3, 26, 21);
      ctx.fillRect(ox + 7, oy + 24, 20, 4);
      ctx.fillRect(ox + 11, oy + 28, 12, 3);

      ctx.fillStyle = bg;
      ctx.fillRect(ox + 6, oy + 5, 22, 19);
      ctx.fillRect(ox + 9, oy + 24, 16, 3);
      ctx.fillRect(ox + 13, oy + 27, 8, 2);

      // Crisp highlight rim bar + eyelet
      ctx.fillStyle = rim;
      ctx.fillRect(ox + 7, oy + 6, 20, 2);
      ctx.fillRect(ox + 15, oy + 4, 4, 2);

      if (tag) {
        tag.draw(ctx, ox, oy);
      } else {
        drawSprite(ctx, ICON_SPRITES.star8, { a: '#ffe066', b: '#ffffff' }, ox + 17, oy + 16, 1, OUTLINE);
      }
    }
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// 9. Stickers Atlas (`stickers`, 5x3 @ 71x95)
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

  drawStickerBadge(0, 0, PALETTE.ETERNAL, '#f29bc0', 'E', 15, 16);
  drawStickerBadge(1, 0, '#e8e8e8', '#ffffff', '1', 56, 16);
  drawStickerBadge(2, 0, '#fe5f55', '#ff9b94', '2', 56, 16);
  drawStickerBadge(3, 0, '#4bc292', '#8cf2c8', '3', 56, 16);
  drawStickerBadge(4, 0, '#374244', '#7f9399', '4', 56, 16);
  drawStickerBadge(0, 1, '#009dff', '#80d0ff', '5', 56, 16);
  drawStickerBadge(1, 1, '#8867a5', '#c8a6e8', '6', 56, 16);
  drawStickerBadge(2, 1, '#fda200', '#ffd27a', '7', 56, 16);
  drawStickerBadge(3, 1, '#f3b958', '#fff0a6', '8', 56, 16);
  drawStickerBadge(0, 2, PALETTE.PERISHABLE, '#95acff', 'P', 15, 39);
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
    { gx: 0, gy: 0, fill: '#f0f0f0', rim: '#c4cdd4', label: '1' },
    { gx: 1, gy: 0, fill: '#fe5f55', rim: '#ffaba6', label: '2' },
    { gx: 2, gy: 0, fill: '#4bc292', rim: '#99f0cc', label: '3' },
    { gx: 4, gy: 0, fill: '#374244', rim: '#8fa3a8', label: '4' },
    { gx: 3, gy: 0, fill: '#009dff', rim: '#80d0ff', label: '5' },
    { gx: 0, gy: 1, fill: '#8867a5', rim: '#cfaef0', label: '6' },
    { gx: 1, gy: 1, fill: '#fda200', rim: '#ffd580', label: '7' },
    { gx: 2, gy: 1, fill: '#f3b958', rim: '#fff2a6', label: '8' },
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
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(ox + 2, 2, 109, 53);
    ctx.fillStyle = '#381e2b';
    ctx.fillRect(ox + 5, 5, 103, 47);

    for (let i = 0; i < 16; i++) {
      const lit = (i + frame) % 2 === 0;
      ctx.fillStyle = lit ? '#ffdf6b' : '#7a4d2b';
      const bx = ox + 7 + i * 6;
      ctx.fillRect(bx, 7, 3, 3);
      ctx.fillRect(bx, 47, 3, 3);
    }

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
