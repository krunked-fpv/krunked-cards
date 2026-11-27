// ============================================================================
// Krunked Cards — Clean-Room Procedural Pixel TrueType Font & Bitmap Helper
// Generates an in-memory, OTS-compliant TrueType (SFNT) proportional chunky
// arcade pixel font (`KrunkedPixelBuiltin`) for built-in mode, and seamlessly
// switches to `KrunkedPixelCustom` when a user Custom Pack font is active.
// 100% Node.js-safe at import time (guards all DOM / FontFace access).
// ============================================================================

const CUSTOM_FONT_FAMILY = 'KrunkedPixelCustom';
const BUILTIN_FONT_FAMILY = 'KrunkedPixelBuiltin';

let loadedCustomFontUrl: string | null = null;
let customFontActive = false;
let builtinFontLoaded = false;
let builtinFontPromise: Promise<boolean> | null = null;
let cachedBuiltinTtfBytes: Uint8Array | null = null;

/**
 * 5x7 crisp bitmap glyph patterns for drawing razor-sharp pixel characters
 * directly onto procedural pixel-art atlases (ranks, shop sign, vouchers, etc.).
 */
const GLYPHS_5X7: Record<string, string[]> = {
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
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00010', '00100', '00100', '00000', '00100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '00110', '00110', '01100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

/**
 * Draw crisp integer-scaled 5x7 pixel text onto a 2D canvas context.
 */
export function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: string,
  options?: {
    align?: 'left' | 'center' | 'right';
    outlineColor?: string;
    shadowColor?: string;
    letterSpacing?: number;
  }
): void {
  const upper = text.toUpperCase();
  const spacing = options?.letterSpacing ?? 1;
  const charW = 5;
  const totalW = upper.length > 0 ? (upper.length * (charW + spacing) - spacing) * scale : 0;

  let startX = Math.round(x);
  if (options?.align === 'center') startX = Math.round(x - totalW / 2);
  else if (options?.align === 'right') startX = Math.round(x - totalW);
  const startY = Math.round(y);

  const renderPass = (ox: number, oy: number, fill: string) => {
    ctx.fillStyle = fill;
    let cx = startX + ox;
    for (let i = 0; i < upper.length; i++) {
      const ch = upper[i]!;
      const glyph = GLYPHS_5X7[ch] ?? GLYPHS_5X7[' ']!;
      for (let row = 0; row < glyph.length; row++) {
        const line = glyph[row]!;
        for (let col = 0; col < line.length; col++) {
          if (line[col] === '1') {
            ctx.fillRect(cx + col * scale, startY + oy + row * scale, scale, scale);
          }
        }
      }
      cx += (charW + spacing) * scale;
    }
  };

  if (options?.shadowColor) {
    renderPass(scale, scale, options.shadowColor);
  }
  if (options?.outlineColor) {
    renderPass(-scale, 0, options.outlineColor);
    renderPass(scale, 0, options.outlineColor);
    renderPass(0, -scale, options.outlineColor);
    renderPass(0, scale, options.outlineColor);
  }
  renderPass(0, 0, color);
}

/**
 * Measure pixel width of text rendered with `drawPixelText`.
 */
export function measurePixelText(text: string, scale = 1, letterSpacing = 1): number {
  if (!text.length) return 0;
  return (text.length * (5 + letterSpacing) - letterSpacing) * scale;
}

// ============================================================================
// Clean-Room Proportional Chunky Arcade Pixel Font (TrueType SFNT Generator)
// Grid: 13 rows total (rows 0..9 above baseline = 10px cap height, rows 3..9
// = 7px x-height, rows 10..12 = 3px descender).
// Units: unitsPerEm = 1024, 1 pixel = 64 font units (ascent 832, descent -192).
// ============================================================================

const UNITS_PER_EM = 1024;
const PIXEL_UNITS = 64;
const BASELINE_ROW = 10; // rows 0..9 sit above y=0; rows 10..12 descend below y=0
const FONT_ASCENT = 832; // 13 * 64
const FONT_DESCENT = -192; // -3 * 64
const CAP_HEIGHT = 640; // 10 * 64
const X_HEIGHT = 448; // 7 * 64

interface ArcadeGlyphDef {
  /** Rows of '#' / '.' (top to bottom). May have 10..13 rows; missing trailing rows are blank. */
  rows: string[];
  /** Optional explicit pixel advance width; defaults to (width + 1). */
  advancePx?: number;
}

/**
 * Hand-crafted clean-room proportional chunky arcade pixel glyphs covering
 * printable ASCII 32..126 plus key UI symbols (• — × ★ ♥ ♦ ♠ ♣ ✕).
 * Thick 2px vertical stems & rounded chamfered corners give punchy retro legibility.
 */
const ARCADE_GLYPHS: Record<number, ArcadeGlyphDef> = {
  // Space
  0x20: { rows: [], advancePx: 4 },
  // !
  0x21: {
    rows: [
      '##',
      '##',
      '##',
      '##',
      '##',
      '##',
      '##',
      '..',
      '##',
      '##',
    ],
  },
  // "
  0x22: {
    rows: [
      '##.##',
      '##.##',
      '##.##',
      '.....',
      '.....',
      '.....',
      '.....',
      '.....',
      '.....',
      '.....',
    ],
  },
  // #
  0x23: {
    rows: [
      '.......',
      '.##.##.',
      '.##.##.',
      '#######',
      '.##.##.',
      '.##.##.',
      '#######',
      '.##.##.',
      '.##.##.',
      '.......',
    ],
  },
  // $
  0x24: {
    rows: [
      '...#...',
      '.#####.',
      '###.###',
      '###....',
      '.#####.',
      '..#####',
      '....###',
      '###.###',
      '.#####.',
      '...#...',
    ],
  },
  // %
  0x25: {
    rows: [
      '.##..##',
      '##..##.',
      '....##.',
      '...##..',
      '...##..',
      '..##...',
      '..##...',
      '.##..##',
      '##..##.',
      '.......',
    ],
  },
  // &
  0x26: {
    rows: [
      '.####..',
      '##..##.',
      '##..##.',
      '.####..',
      '.###...',
      '##.##.#',
      '##..###',
      '##..##.',
      '.####.#',
      '.......',
    ],
  },
  // '
  0x27: {
    rows: [
      '##',
      '##',
      '#.',
      '..',
      '..',
      '..',
      '..',
      '..',
      '..',
      '..',
    ],
  },
  // (
  0x28: {
    rows: [
      '..##',
      '.##.',
      '##..',
      '##..',
      '##..',
      '##..',
      '##..',
      '##..',
      '.##.',
      '..##',
    ],
  },
  // )
  0x29: {
    rows: [
      '##..',
      '.##.',
      '..##',
      '..##',
      '..##',
      '..##',
      '..##',
      '..##',
      '.##.',
      '##..',
    ],
  },
  // *
  0x2a: {
    rows: [
      '......',
      '..##..',
      '######',
      '.####.',
      '##..##',
      '......',
      '......',
      '......',
      '......',
      '......',
    ],
  },
  // +
  0x2b: {
    rows: [
      '......',
      '......',
      '..##..',
      '..##..',
      '######',
      '######',
      '..##..',
      '..##..',
      '......',
      '......',
    ],
  },
  // ,
  0x2c: {
    rows: [
      '...',
      '...',
      '...',
      '...',
      '...',
      '...',
      '...',
      '...',
      '.##',
      '.##',
      '##.',
      '#..',
    ],
  },
  // -
  0x2d: {
    rows: [
      '.....',
      '.....',
      '.....',
      '.....',
      '#####',
      '#####',
      '.....',
      '.....',
      '.....',
      '.....',
    ],
  },
  // .
  0x2e: {
    rows: [
      '..',
      '..',
      '..',
      '..',
      '..',
      '..',
      '..',
      '..',
      '##',
      '##',
    ],
  },
  // /
  0x2f: {
    rows: [
      '....##',
      '....##',
      '...##.',
      '...##.',
      '..##..',
      '..##..',
      '.##...',
      '.##...',
      '##....',
      '##....',
    ],
  },
  // 0
  0x30: {
    rows: [
      '.#####.',
      '#######',
      '##...##',
      '##...##',
      '##...##',
      '##...##',
      '##...##',
      '##...##',
      '#######',
      '.#####.',
    ],
  },
  // 1
  0x31: {
    rows: [
      '..###.',
      '.####.',
      '##.##.',
      '...##.',
      '...##.',
      '...##.',
      '...##.',
      '...##.',
      '######',
      '######',
    ],
  },
  // 2
  0x32: {
    rows: [
      '.#####.',
      '#######',
      '##...##',
      '.....##',
      '...###.',
      '.####..',
      '###....',
      '##.....',
      '#######',
      '#######',
    ],
  },
  // 3
  0x33: {
    rows: [
      '.#####.',
      '#######',
      '##...##',
      '.....##',
      '..####.',
      '..####.',
      '.....##',
      '##...##',
      '#######',
      '.#####.',
    ],
  },
  // 4
  0x34: {
    rows: [
      '...###.',
      '..####.',
      '.##.##.',
      '##..##.',
      '##..##.',
      '#######',
      '#######',
      '....##.',
      '....##.',
      '....##.',
    ],
  },
  // 5
  0x35: {
    rows: [
      '#######',
      '#######',
      '##.....',
      '######.',
      '#######',
      '.....##',
      '.....##',
      '##...##',
      '#######',
      '.#####.',
    ],
  },
  // 6
  0x36: {
    rows: [
      '.#####.',
      '#######',
      '##.....',
      '######.',
      '#######',
      '##...##',
      '##...##',
      '##...##',
      '#######',
      '.#####.',
    ],
  },
  // 7
  0x37: {
    rows: [
      '#######',
      '#######',
      '##...##',
      '....##.',
      '...##..',
      '..##...',
      '..##...',
      '..##...',
      '..##...',
      '..##...',
    ],
  },
  // 8
  0x38: {
    rows: [
      '.#####.',
      '#######',
      '##...##',
      '##...##',
      '.#####.',
      '.#####.',
      '##...##',
      '##...##',
      '#######',
      '.#####.',
    ],
  },
  // 9
  0x39: {
    rows: [
      '.#####.',
      '#######',
      '##...##',
      '##...##',
      '#######',
      '.######',
      '.....##',
      '##...##',
      '#######',
      '.#####.',
    ],
  },
  // :
  0x3a: {
    rows: [
      '..',
      '..',
      '..',
      '##',
      '##',
      '..',
      '..',
      '..',
      '##',
      '##',
    ],
  },
  // ;
  0x3b: {
    rows: [
      '...',
      '...',
      '...',
      '.##',
      '.##',
      '...',
      '...',
      '...',
      '.##',
      '.##',
      '##.',
      '#..',
    ],
  },
  // <
  0x3c: {
    rows: [
      '.....',
      '...##',
      '..##.',
      '.##..',
      '##...',
      '##...',
      '.##..',
      '..##.',
      '...##',
      '.....',
    ],
  },
  // =
  0x3d: {
    rows: [
      '......',
      '......',
      '......',
      '######',
      '######',
      '......',
      '######',
      '######',
      '......',
      '......',
    ],
  },
  // >
  0x3e: {
    rows: [
      '.....',
      '##...',
      '.##..',
      '..##.',
      '...##',
      '...##',
      '..##.',
      '.##..',
      '##...',
      '.....',
    ],
  },
  // ?
  0x3f: {
    rows: [
      '.#####.',
      '#######',
      '##...##',
      '....##.',
      '..###..',
      '..##...',
      '..##...',
      '.......',
      '..##...',
      '..##...',
    ],
  },
  // @
  0x40: {
    rows: [
      '.######.',
      '##....##',
      '##.####.',
      '##.##.##',
      '##.##.##',
      '##.#####',
      '##......',
      '##....##',
      '.######.',
      '........',
    ],
  },
  // A
  0x41: {
    rows: [
      '..###..',
      '.#####.',
      '##...##',
      '##...##',
      '##...##',
      '#######',
      '#######',
      '##...##',
      '##...##',
      '##...##',
    ],
  },
  // B
  0x42: {
    rows: [
      '######.',
      '#######',
      '##...##',
      '##...##',
      '######.',
      '######.',
      '##...##',
      '##...##',
      '#######',
      '######.',
    ],
  },
  // C
  0x43: {
    rows: [
      '.#####.',
      '#######',
      '##...##',
      '##.....',
      '##.....',
      '##.....',
      '##.....',
      '##...##',
      '#######',
      '.#####.',
    ],
  },
  // D
  0x44: {
    rows: [
      '#####..',
      '######.',
      '##...##',
      '##...##',
      '##...##',
      '##...##',
      '##...##',
      '##...##',
      '######.',
      '#####..',
    ],
  },
  // E
  0x45: {
    rows: [
      '#######',
      '#######',
      '##.....',
      '##.....',
      '######.',
      '######.',
      '##.....',
      '##.....',
      '#######',
      '#######',
    ],
  },
  // F
  0x46: {
    rows: [
      '#######',
      '#######',
      '##.....',
      '##.....',
      '######.',
      '######.',
      '##.....',
      '##.....',
      '##.....',
      '##.....',
    ],
  },
  // G
  0x47: {
    rows: [
      '.#####.',
      '#######',
      '##...##',
      '##.....',
      '##..###',
      '##..###',
      '##...##',
      '##...##',
      '#######',
      '.#####.',
    ],
  },
  // H
  0x48: {
    rows: [
      '##...##',
      '##...##',
      '##...##',
      '##...##',
      '#######',
      '#######',
      '##...##',
      '##...##',
      '##...##',
      '##...##',
    ],
  },
  // I
  0x49: {
    rows: [
      '######',
      '######',
      '..##..',
      '..##..',
      '..##..',
      '..##..',
      '..##..',
      '..##..',
      '######',
      '######',
    ],
  },
  // J
  0x4a: {
    rows: [
      '..#####',
      '..#####',
      '.....##',
      '.....##',
      '.....##',
      '.....##',
      '##...##',
      '##...##',
      '#######',
      '.#####.',
    ],
  },
  // K
  0x4b: {
    rows: [
      '##...##',
      '##..##.',
      '##.##..',
      '####...',
      '###....',
      '####...',
      '##.##..',
      '##..##.',
      '##...##',
      '##...##',
    ],
  },
  // L
  0x4c: {
    rows: [
      '##.....',
      '##.....',
      '##.....',
      '##.....',
      '##.....',
      '##.....',
      '##.....',
      '##.....',
      '#######',
      '#######',
    ],
  },
  // M
  0x4d: {
    rows: [
      '##....##',
      '###..###',
      '########',
      '##.##.##',
      '##.##.##',
      '##....##',
      '##....##',
      '##....##',
      '##....##',
      '##....##',
    ],
  },
  // N
  0x4e: {
    rows: [
      '##...##',
      '###..##',
      '####.##',
      '#######',
      '##.####',
      '##..###',
      '##...##',
      '##...##',
      '##...##',
      '##...##',
    ],
  },
  // O
  0x4f: {
    rows: [
      '.#####.',
      '#######',
      '##...##',
      '##...##',
      '##...##',
      '##...##',
      '##...##',
      '##...##',
      '#######',
      '.#####.',
    ],
  },
  // P
  0x50: {
    rows: [
      '######.',
      '#######',
      '##...##',
      '##...##',
      '#######',
      '######.',
      '##.....',
      '##.....',
      '##.....',
      '##.....',
    ],
  },
  // Q
  0x51: {
    rows: [
      '.#####.',
      '#######',
      '##...##',
      '##...##',
      '##...##',
      '##...##',
      '##.#.##',
      '##..###',
      '######.',
      '.####.#',
    ],
  },
  // R
  0x52: {
    rows: [
      '######.',
      '#######',
      '##...##',
      '##...##',
      '#######',
      '######.',
      '##..##.',
      '##...##',
      '##...##',
      '##...##',
    ],
  },
  // S
  0x53: {
    rows: [
      '.#####.',
      '#######',
      '##...##',
      '###....',
      '.#####.',
      '..#####',
      '....###',
      '##...##',
      '#######',
      '.#####.',
    ],
  },
  // T
  0x54: {
    rows: [
      '########',
      '########',
      '...##...',
      '...##...',
      '...##...',
      '...##...',
      '...##...',
      '...##...',
      '...##...',
      '...##...',
    ],
  },
  // U
  0x55: {
    rows: [
      '##...##',
      '##...##',
      '##...##',
      '##...##',
      '##...##',
      '##...##',
      '##...##',
      '##...##',
      '#######',
      '.#####.',
    ],
  },
  // V
  0x56: {
    rows: [
      '##...##',
      '##...##',
      '##...##',
      '##...##',
      '##...##',
      '##...##',
      '.##.##.',
      '.#####.',
      '..###..',
      '...#...',
    ],
  },
  // W
  0x57: {
    rows: [
      '##....##',
      '##....##',
      '##....##',
      '##....##',
      '##....##',
      '##.##.##',
      '##.##.##',
      '########',
      '###..###',
      '##....##',
    ],
  },
  // X
  0x58: {
    rows: [
      '##...##',
      '##...##',
      '.##.##.',
      '..###..',
      '..###..',
      '..###..',
      '.##.##.',
      '##...##',
      '##...##',
      '##...##',
    ],
  },
  // Y
  0x59: {
    rows: [
      '##...##',
      '##...##',
      '##...##',
      '.##.##.',
      '..###..',
      '..##...',
      '..##...',
      '..##...',
      '..##...',
      '..##...',
    ],
  },
  // Z
  0x5a: {
    rows: [
      '#######',
      '#######',
      '....##.',
      '...##..',
      '..##...',
      '.##....',
      '##.....',
      '##.....',
      '#######',
      '#######',
    ],
  },
  // [
  0x5b: {
    rows: [
      '####',
      '####',
      '##..',
      '##..',
      '##..',
      '##..',
      '##..',
      '##..',
      '####',
      '####',
    ],
  },
  // \
  0x5c: {
    rows: [
      '##....',
      '##....',
      '.##...',
      '.##...',
      '..##..',
      '..##..',
      '...##.',
      '...##.',
      '....##',
      '....##',
    ],
  },
  // ]
  0x5d: {
    rows: [
      '####',
      '####',
      '..##',
      '..##',
      '..##',
      '..##',
      '..##',
      '..##',
      '####',
      '####',
    ],
  },
  // ^
  0x5e: {
    rows: [
      '..##..',
      '.####.',
      '##..##',
      '......',
      '......',
      '......',
      '......',
      '......',
      '......',
      '......',
    ],
  },
  // _
  0x5f: {
    rows: [
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '#######',
      '#######',
    ],
  },
  // `
  0x60: {
    rows: [
      '##.',
      '.##',
      '...',
      '...',
      '...',
      '...',
      '...',
      '...',
      '...',
      '...',
    ],
  },
  // a
  0x61: {
    rows: [
      '......',
      '......',
      '......',
      '.####.',
      '#####.',
      '....##',
      '.#####',
      '##..##',
      '######',
      '.#####',
    ],
  },
  // b
  0x62: {
    rows: [
      '##....',
      '##....',
      '##....',
      '#####.',
      '######',
      '##..##',
      '##..##',
      '##..##',
      '######',
      '#####.',
    ],
  },
  // c
  0x63: {
    rows: [
      '......',
      '......',
      '......',
      '.#####',
      '######',
      '##....',
      '##....',
      '##....',
      '######',
      '.#####',
    ],
  },
  // d
  0x64: {
    rows: [
      '....##',
      '....##',
      '....##',
      '.#####',
      '######',
      '##..##',
      '##..##',
      '##..##',
      '######',
      '.#####',
    ],
  },
  // e
  0x65: {
    rows: [
      '......',
      '......',
      '......',
      '.####.',
      '######',
      '##..##',
      '######',
      '##....',
      '######',
      '.#####',
    ],
  },
  // f
  0x66: {
    rows: [
      '..###',
      '.####',
      '.##..',
      '#####',
      '#####',
      '.##..',
      '.##..',
      '.##..',
      '.##..',
      '.##..',
    ],
  },
  // g
  0x67: {
    rows: [
      '......',
      '......',
      '......',
      '.#####',
      '######',
      '##..##',
      '##..##',
      '##..##',
      '######',
      '.#####',
      '....##',
      '######',
      '.####.',
    ],
  },
  // h
  0x68: {
    rows: [
      '##....',
      '##....',
      '##....',
      '#####.',
      '######',
      '##..##',
      '##..##',
      '##..##',
      '##..##',
      '##..##',
    ],
  },
  // i
  0x69: {
    rows: [
      '##',
      '##',
      '..',
      '##',
      '##',
      '##',
      '##',
      '##',
      '##',
      '##',
    ],
  },
  // j
  0x6a: {
    rows: [
      '..##',
      '..##',
      '....',
      '..##',
      '..##',
      '..##',
      '..##',
      '..##',
      '..##',
      '..##',
      '..##',
      '####',
      '###.',
    ],
  },
  // k
  0x6b: {
    rows: [
      '##....',
      '##....',
      '##....',
      '##..##',
      '##.##.',
      '####..',
      '####..',
      '##.##.',
      '##..##',
      '##..##',
    ],
  },
  // l
  0x6c: {
    rows: [
      '##.',
      '##.',
      '##.',
      '##.',
      '##.',
      '##.',
      '##.',
      '##.',
      '###',
      '.##',
    ],
  },
  // m
  0x6d: {
    rows: [
      '........',
      '........',
      '........',
      '###.###.',
      '########',
      '##.##.##',
      '##.##.##',
      '##.##.##',
      '##.##.##',
      '##.##.##',
    ],
  },
  // n
  0x6e: {
    rows: [
      '......',
      '......',
      '......',
      '#####.',
      '######',
      '##..##',
      '##..##',
      '##..##',
      '##..##',
      '##..##',
    ],
  },
  // o
  0x6f: {
    rows: [
      '......',
      '......',
      '......',
      '.####.',
      '######',
      '##..##',
      '##..##',
      '##..##',
      '######',
      '.####.',
    ],
  },
  // p
  0x70: {
    rows: [
      '......',
      '......',
      '......',
      '#####.',
      '######',
      '##..##',
      '##..##',
      '##..##',
      '######',
      '#####.',
      '##....',
      '##....',
      '##....',
    ],
  },
  // q
  0x71: {
    rows: [
      '......',
      '......',
      '......',
      '.#####',
      '######',
      '##..##',
      '##..##',
      '##..##',
      '######',
      '.#####',
      '....##',
      '....##',
      '....##',
    ],
  },
  // r
  0x72: {
    rows: [
      '.....',
      '.....',
      '.....',
      '##.##',
      '#####',
      '###..',
      '##...',
      '##...',
      '##...',
      '##...',
    ],
  },
  // s
  0x73: {
    rows: [
      '......',
      '......',
      '......',
      '.#####',
      '######',
      '##....',
      '.####.',
      '....##',
      '######',
      '#####.',
    ],
  },
  // t
  0x74: {
    rows: [
      '.##..',
      '.##..',
      '.##..',
      '#####',
      '#####',
      '.##..',
      '.##..',
      '.##..',
      '.####',
      '..###',
    ],
  },
  // u
  0x75: {
    rows: [
      '......',
      '......',
      '......',
      '##..##',
      '##..##',
      '##..##',
      '##..##',
      '##..##',
      '######',
      '.#####',
    ],
  },
  // v
  0x76: {
    rows: [
      '......',
      '......',
      '......',
      '##..##',
      '##..##',
      '##..##',
      '##..##',
      '.####.',
      '.####.',
      '..##..',
    ],
  },
  // w
  0x77: {
    rows: [
      '........',
      '........',
      '........',
      '##....##',
      '##....##',
      '##.##.##',
      '##.##.##',
      '########',
      '###..###',
      '##....##',
    ],
  },
  // x
  0x78: {
    rows: [
      '......',
      '......',
      '......',
      '##..##',
      '##..##',
      '.####.',
      '..##..',
      '.####.',
      '##..##',
      '##..##',
    ],
  },
  // y
  0x79: {
    rows: [
      '......',
      '......',
      '......',
      '##..##',
      '##..##',
      '##..##',
      '##..##',
      '##..##',
      '######',
      '.#####',
      '....##',
      '######',
      '.####.',
    ],
  },
  // z
  0x7a: {
    rows: [
      '......',
      '......',
      '......',
      '######',
      '######',
      '...##.',
      '..##..',
      '.##...',
      '######',
      '######',
    ],
  },
  // {
  0x7b: {
    rows: [
      '..###',
      '.##..',
      '.##..',
      '.##..',
      '##...',
      '##...',
      '.##..',
      '.##..',
      '.##..',
      '..###',
    ],
  },
  // |
  0x7c: {
    rows: [
      '##',
      '##',
      '##',
      '##',
      '##',
      '##',
      '##',
      '##',
      '##',
      '##',
    ],
  },
  // }
  0x7d: {
    rows: [
      '###..',
      '..##.',
      '..##.',
      '..##.',
      '...##',
      '...##',
      '..##.',
      '..##.',
      '..##.',
      '###..',
    ],
  },
  // ~
  0x7e: {
    rows: [
      '.......',
      '.......',
      '.......',
      '.##..##',
      '#######',
      '##..##.',
      '.......',
      '.......',
      '.......',
      '.......',
    ],
  },
  // × (multiplication sign)
  0xd7: {
    rows: [
      '......',
      '......',
      '##..##',
      '###.##',
      '.####.',
      '..##..',
      '.####.',
      '##.###',
      '##..##',
      '......',
    ],
  },
  // — (em dash)
  0x2014: {
    rows: [
      '........',
      '........',
      '........',
      '........',
      '########',
      '########',
      '........',
      '........',
      '........',
      '........',
    ],
  },
  // • (bullet)
  0x2022: {
    rows: [
      '....',
      '....',
      '....',
      '.##.',
      '####',
      '####',
      '.##.',
      '....',
      '....',
      '....',
    ],
  },
  // … (ellipsis)
  0x2026: {
    rows: [
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '##.##.##',
      '##.##.##',
    ],
  },
  // ★ (star)
  0x2605: {
    rows: [
      '...#...',
      '...#...',
      '..###..',
      '#######',
      '.#####.',
      '..###..',
      '.#####.',
      '.##.##.',
      '##...##',
      '.......',
    ],
  },
  // ♠ (spade)
  0x2660: {
    rows: [
      '...#...',
      '..###..',
      '.#####.',
      '#######',
      '#######',
      '#######',
      '.##.##.',
      '...#...',
      '..###..',
      '.......',
    ],
  },
  // ♣ (club)
  0x2663: {
    rows: [
      '..###..',
      '..###..',
      '...#...',
      '##.#.##',
      '#######',
      '##.#.##',
      '...#...',
      '..###..',
      '.#####.',
      '.......',
    ],
  },
  // ♥ (heart)
  0x2665: {
    rows: [
      '.......',
      '.##.##.',
      '#######',
      '#######',
      '#######',
      '.#####.',
      '..###..',
      '...#...',
      '.......',
      '.......',
    ],
  },
  // ♦ (diamond)
  0x2666: {
    rows: [
      '...#...',
      '..###..',
      '.#####.',
      '#######',
      '#######',
      '.#####.',
      '..###..',
      '...#...',
      '.......',
      '.......',
    ],
  },
  // ✕ (close cross)
  0x2715: {
    rows: [
      '.......',
      '##...##',
      '###.###',
      '.#####.',
      '..###..',
      '.#####.',
      '###.###',
      '##...##',
      '.......',
      '.......',
    ],
  },
};

const NOTDEF_ROWS = [
  '######',
  '######',
  '##..##',
  '##..##',
  '##..##',
  '##..##',
  '##..##',
  '##..##',
  '######',
  '######',
];

type Point2 = [number, number];

interface CompiledGlyph {
  codePoint: number; // -1 for .notdef
  advanceWidth: number;
  lsb: number;
  contours: Point2[][];
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  glyfBytes: Uint8Array;
}

/**
 * Trace exact non-overlapping orthogonal TrueType contours from a binary pixel
 * grid. Outer boundaries wind clockwise; interior holes wind counter-clockwise.
 */
function tracePixelContours(rows: string[]): Point2[][] {
  if (rows.length === 0) return [];
  const h = rows.length;
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  if (w === 0) return [];

  const isFilled = (c: number, r: number): boolean => {
    if (r < 0 || r >= h || c < 0) return false;
    return rows[r]?.[c] === '#';
  };

  interface DirEdge {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    dx: number;
    dy: number;
    used: boolean;
  }

  const edges: DirEdge[] = [];
  const byStart = new Map<string, DirEdge[]>();
  const addEdge = (x0: number, y0: number, x1: number, y1: number) => {
    const e: DirEdge = { x0, y0, x1, y1, dx: x1 - x0, dy: y1 - y0, used: false };
    edges.push(e);
    const key = `${x0},${y0}`;
    let list = byStart.get(key);
    if (!list) {
      list = [];
      byStart.set(key, list);
    }
    list.push(e);
  };

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (!isFilled(c, r)) continue;
      const x0 = c;
      const x1 = c + 1;
      const y1 = BASELINE_ROW - r;
      const y0 = y1 - 1;
      // Filled interior is always on the RIGHT of each directed boundary edge
      if (!isFilled(c - 1, r)) addEdge(x0, y0, x0, y1); // up
      if (!isFilled(c, r - 1)) addEdge(x0, y1, x1, y1); // right
      if (!isFilled(c + 1, r)) addEdge(x1, y1, x1, y0); // down
      if (!isFilled(c, r + 1)) addEdge(x1, y0, x0, y0); // left
    }
  }

  const contours: Point2[][] = [];
  for (const startEdge of edges) {
    if (startEdge.used) continue;
    const rawPts: Point2[] = [];
    let cur: DirEdge | undefined = startEdge;
    while (cur && !cur.used) {
      cur.used = true;
      rawPts.push([cur.x0, cur.y0]);
      const candidates: DirEdge[] = (byStart.get(`${cur.x1},${cur.y1}`) ?? []).filter((e) => !e.used);
      if (candidates.length === 0) break;
      if (candidates.length === 1) {
        cur = candidates[0];
      } else {
        // At diagonal pinch vertices, prefer a right turn (dx,dy) -> (dy,-dx)
        // so touching squares split cleanly into non-self-intersecting loops.
        const rdx: number = cur.dy;
        const rdy: number = -cur.dx;
        const nextEdge: DirEdge | undefined =
          candidates.find((e: DirEdge): boolean => e.dx === rdx && e.dy === rdy) ?? candidates[0];
        cur = nextEdge;
      }
    }

    // Simplify collinear consecutive vertices
    const n = rawPts.length;
    if (n < 3) continue;
    const simplified: Point2[] = [];
    for (let i = 0; i < n; i++) {
      const prev = rawPts[(i - 1 + n) % n]!;
      const curr = rawPts[i]!;
      const next = rawPts[(i + 1) % n]!;
      const dx1 = curr[0] - prev[0];
      const dy1 = curr[1] - prev[1];
      const dx2 = next[0] - curr[0];
      const dy2 = next[1] - curr[1];
      if (dx1 * dy2 - dy1 * dx2 !== 0) {
        simplified.push([curr[0] * PIXEL_UNITS, curr[1] * PIXEL_UNITS]);
      }
    }
    if (simplified.length >= 3) {
      contours.push(simplified);
    }
  }

  return contours;
}

class BinaryWriter {
  private buf: Uint8Array;
  private view: DataView;
  private pos = 0;

  constructor(initialCapacity = 256) {
    this.buf = new Uint8Array(initialCapacity);
    this.view = new DataView(this.buf.buffer);
  }

  private ensure(extra: number): void {
    if (this.pos + extra <= this.buf.length) return;
    let nextCap = this.buf.length * 2;
    while (nextCap < this.pos + extra) nextCap *= 2;
    const next = new Uint8Array(nextCap);
    next.set(this.buf);
    this.buf = next;
    this.view = new DataView(this.buf.buffer);
  }

  u8(v: number): void {
    this.ensure(1);
    this.buf[this.pos++] = v & 0xff;
  }

  u16(v: number): void {
    this.ensure(2);
    this.view.setUint16(this.pos, v & 0xffff, false);
    this.pos += 2;
  }

  i16(v: number): void {
    this.ensure(2);
    this.view.setInt16(this.pos, v, false);
    this.pos += 2;
  }

  u32(v: number): void {
    this.ensure(4);
    this.view.setUint32(this.pos, v >>> 0, false);
    this.pos += 4;
  }

  ascii(s: string): void {
    this.ensure(s.length);
    for (let i = 0; i < s.length; i++) {
      this.buf[this.pos++] = s.charCodeAt(i) & 0x7f;
    }
  }

  bytes(data: Uint8Array): void {
    this.ensure(data.length);
    this.buf.set(data, this.pos);
    this.pos += data.length;
  }

  pad4(): void {
    while (this.pos % 4 !== 0) this.u8(0);
  }

  toUint8Array(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

function encodeSimpleGlyph(
  contours: Point2[][],
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number
): Uint8Array {
  if (contours.length === 0) return new Uint8Array(0);
  const w = new BinaryWriter(128);
  w.i16(contours.length);
  w.i16(xMin);
  w.i16(yMin);
  w.i16(xMax);
  w.i16(yMax);

  const flatPts: Point2[] = [];
  for (const c of contours) {
    for (const pt of c) flatPts.push(pt);
    w.u16(flatPts.length - 1);
  }
  w.u16(0); // instructionLength

  // Flags: 0x01 = on-curve, explicit int16 deltas for both X and Y
  for (let i = 0; i < flatPts.length; i++) {
    w.u8(0x01);
  }

  let prevX = 0;
  for (const pt of flatPts) {
    w.i16(pt[0] - prevX);
    prevX = pt[0];
  }

  let prevY = 0;
  for (const pt of flatPts) {
    w.i16(pt[1] - prevY);
    prevY = pt[1];
  }

  w.pad4();
  return w.toUint8Array();
}

function compileGlyph(codePoint: number, def: ArcadeGlyphDef): CompiledGlyph {
  const glyphWidthPx = def.rows.reduce((m, r) => Math.max(m, r.length), 0);
  const advancePx = def.advancePx ?? glyphWidthPx + 1;
  const advanceWidth = advancePx * PIXEL_UNITS;
  const contours = tracePixelContours(def.rows);

  if (contours.length === 0) {
    return {
      codePoint,
      advanceWidth,
      lsb: 0,
      contours: [],
      xMin: 0,
      yMin: 0,
      xMax: 0,
      yMax: 0,
      glyfBytes: new Uint8Array(0),
    };
  }

  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;
  for (const c of contours) {
    for (const [x, y] of c) {
      if (x < xMin) xMin = x;
      if (y < yMin) yMin = y;
      if (x > xMax) xMax = x;
      if (y > yMax) yMax = y;
    }
  }

  return {
    codePoint,
    advanceWidth,
    lsb: xMin,
    contours,
    xMin,
    yMin,
    xMax,
    yMax,
    glyfBytes: encodeSimpleGlyph(contours, xMin, yMin, xMax, yMax),
  };
}

function calcTableChecksum(bytes: Uint8Array): number {
  let sum = 0;
  const len = bytes.length;
  for (let i = 0; i < len; i += 4) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    const b3 = bytes[i + 3] ?? 0;
    const word = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
    sum = (sum + word) >>> 0;
  }
  return sum >>> 0;
}

function buildCmapTable(glyphs: CompiledGlyph[]): Uint8Array {
  const mapped: Array<{ cp: number; gid: number }> = [];
  for (let gid = 1; gid < glyphs.length; gid++) {
    const cp = glyphs[gid]!.codePoint;
    if (cp >= 0 && cp <= 0xffff) mapped.push({ cp, gid });
  }
  mapped.sort((a, b) => a.cp - b.cp);

  interface Seg {
    start: number;
    end: number;
    delta: number;
  }
  const segs: Seg[] = [];
  for (const item of mapped) {
    const last = segs[segs.length - 1];
    if (last && item.cp === last.end + 1 && ((item.cp + last.delta) & 0xffff) === item.gid) {
      last.end = item.cp;
    } else {
      segs.push({
        start: item.cp,
        end: item.cp,
        delta: (item.gid - item.cp) & 0xffff,
      });
    }
  }
  // Mandatory Format 4 sentinel segment
  segs.push({ start: 0xffff, end: 0xffff, delta: 1 });

  const segCount = segs.length;
  let pow2 = 1;
  let entrySelector = 0;
  while (pow2 * 2 <= segCount) {
    pow2 *= 2;
    entrySelector++;
  }
  const searchRange = pow2 * 2;
  const rangeShift = segCount * 2 - searchRange;
  const subtableLength = 16 + segCount * 8;

  const w = new BinaryWriter(24 + subtableLength);
  // cmap header: 2 encoding records (Unicode BMP + Windows Unicode BMP) sharing one Format 4 subtable
  w.u16(0); // version
  w.u16(2); // numTables
  const subOffset = 4 + 2 * 8;
  w.u16(0); w.u16(3); w.u32(subOffset); // Platform 0 (Unicode), Encoding 3 (BMP)
  w.u16(3); w.u16(1); w.u32(subOffset); // Platform 3 (Windows), Encoding 1 (Unicode BMP)

  // Format 4 subtable
  w.u16(4); // format
  w.u16(subtableLength);
  w.u16(0); // language
  w.u16(segCount * 2);
  w.u16(searchRange);
  w.u16(entrySelector);
  w.u16(rangeShift);
  for (const s of segs) w.u16(s.end);
  w.u16(0); // reservedPad
  for (const s of segs) w.u16(s.start);
  for (const s of segs) w.u16(s.delta);
  for (let i = 0; i < segCount; i++) w.u16(0); // idRangeOffset = 0 for all segments

  return w.toUint8Array();
}

function buildNameTable(familyName: string): Uint8Array {
  const entries: Array<[number, string]> = [
    [1, familyName],
    [2, 'Regular'],
    [3, `${familyName}-1.0`],
    [4, familyName],
    [5, 'Version 1.0'],
    [6, familyName],
  ];

  const encoded = entries.map(([id, text]) => {
    const bytes = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      bytes[i * 2] = (code >> 8) & 0xff;
      bytes[i * 2 + 1] = code & 0xff;
    }
    return { id, bytes };
  });

  const count = encoded.length;
  const stringOffset = 6 + count * 12;
  const w = new BinaryWriter(stringOffset + 256);
  w.u16(0); // format
  w.u16(count);
  w.u16(stringOffset);

  let curOffset = 0;
  for (const rec of encoded) {
    w.u16(3); // platformID: Windows
    w.u16(1); // encodingID: Unicode BMP
    w.u16(0x0409); // languageID: English US
    w.u16(rec.id);
    w.u16(rec.bytes.length);
    w.u16(curOffset);
    curOffset += rec.bytes.length;
  }
  for (const rec of encoded) {
    w.bytes(rec.bytes);
  }
  return w.toUint8Array();
}

/**
 * Construct a valid, OTS-compliant TrueType (SFNT) binary for the clean-room
 * proportional chunky arcade pixel font (`KrunkedPixelBuiltin`).
 * Pure TypeScript / Uint8Array — safe to run in both browser and Node.js.
 */
export function buildBuiltinPixelFontBytes(): Uint8Array {
  if (cachedBuiltinTtfBytes) return cachedBuiltinTtfBytes;

  const codePoints = Object.keys(ARCADE_GLYPHS)
    .map(Number)
    .sort((a, b) => a - b);

  const glyphs: CompiledGlyph[] = [
    compileGlyph(-1, { rows: NOTDEF_ROWS }),
    ...codePoints.map((cp) => compileGlyph(cp, ARCADE_GLYPHS[cp]!)),
  ];

  const numGlyphs = glyphs.length;

  // Global metrics & glyf + loca tables
  let globalXMin = 0;
  let globalYMin = 0;
  let globalXMax = 0;
  let globalYMax = 0;
  let hasBbox = false;
  let maxPoints = 0;
  let maxContours = 0;
  let advanceWidthMax = 0;
  let minLsb = 0;
  let minRsb = 0;
  let xMaxExtent = 0;
  let hasNonEmpty = false;
  let avgWidthSum = 0;
  let avgWidthCount = 0;

  const glyfWriter = new BinaryWriter(8192);
  const locaWriter = new BinaryWriter((numGlyphs + 1) * 4);
  const hmtxWriter = new BinaryWriter(numGlyphs * 4);
  let glyfOffset = 0;

  for (const g of glyphs) {
    locaWriter.u32(glyfOffset);
    if (g.glyfBytes.length > 0) {
      glyfWriter.bytes(g.glyfBytes);
      glyfOffset += g.glyfBytes.length;

      let pts = 0;
      for (const c of g.contours) pts += c.length;
      if (pts > maxPoints) maxPoints = pts;
      if (g.contours.length > maxContours) maxContours = g.contours.length;

      if (!hasBbox) {
        globalXMin = g.xMin;
        globalYMin = g.yMin;
        globalXMax = g.xMax;
        globalYMax = g.yMax;
        hasBbox = true;
      } else {
        if (g.xMin < globalXMin) globalXMin = g.xMin;
        if (g.yMin < globalYMin) globalYMin = g.yMin;
        if (g.xMax > globalXMax) globalXMax = g.xMax;
        if (g.yMax > globalYMax) globalYMax = g.yMax;
      }

      const rsb = g.advanceWidth - (g.lsb + (g.xMax - g.xMin));
      const extent = g.lsb + (g.xMax - g.xMin);
      if (!hasNonEmpty) {
        minLsb = g.lsb;
        minRsb = rsb;
        xMaxExtent = extent;
        hasNonEmpty = true;
      } else {
        if (g.lsb < minLsb) minLsb = g.lsb;
        if (rsb < minRsb) minRsb = rsb;
        if (extent > xMaxExtent) xMaxExtent = extent;
      }
    }

    if (g.advanceWidth > advanceWidthMax) advanceWidthMax = g.advanceWidth;
    if (g.advanceWidth > 0) {
      avgWidthSum += g.advanceWidth;
      avgWidthCount++;
    }
    hmtxWriter.u16(g.advanceWidth);
    hmtxWriter.i16(g.lsb);
  }
  locaWriter.u32(glyfOffset);

  const glyfTable = glyfWriter.toUint8Array();
  const locaTable = locaWriter.toUint8Array();
  const hmtxTable = hmtxWriter.toUint8Array();
  const cmapTable = buildCmapTable(glyphs);
  const nameTable = buildNameTable(BUILTIN_FONT_FAMILY);

  // head (54 bytes)
  const headW = new BinaryWriter(54);
  headW.u16(1); headW.u16(0); // version 1.0
  headW.u32(0x00010000); // fontRevision 1.0
  headW.u32(0); // checkSumAdjustment (patched after assembly)
  headW.u32(0x5f0f3cf5); // magicNumber
  headW.u16(0x000b); // flags: baseline y=0, lsb x=0, integer ppem
  headW.u16(UNITS_PER_EM);
  headW.u32(0); headW.u32(0); // created
  headW.u32(0); headW.u32(0); // modified
  headW.i16(globalXMin);
  headW.i16(globalYMin);
  headW.i16(globalXMax);
  headW.i16(globalYMax);
  headW.u16(0); // macStyle
  headW.u16(8); // lowestRecPPEM
  headW.i16(2); // fontDirectionHint
  headW.i16(1); // indexToLocFormat = 1 (long 32-bit offsets)
  headW.i16(0); // glyphDataFormat
  const headTable = headW.toUint8Array();

  // hhea (36 bytes)
  const hheaW = new BinaryWriter(36);
  hheaW.u16(1); hheaW.u16(0);
  hheaW.i16(FONT_ASCENT);
  hheaW.i16(FONT_DESCENT);
  hheaW.i16(0); // lineGap
  hheaW.u16(advanceWidthMax);
  hheaW.i16(minLsb);
  hheaW.i16(minRsb);
  hheaW.i16(xMaxExtent);
  hheaW.i16(1); // caretSlopeRise
  hheaW.i16(0); // caretSlopeRun
  hheaW.i16(0); // caretOffset
  hheaW.i16(0); hheaW.i16(0); hheaW.i16(0); hheaW.i16(0); // reserved
  hheaW.i16(0); // metricDataFormat
  hheaW.u16(numGlyphs);
  const hheaTable = hheaW.toUint8Array();

  // maxp (32 bytes, v1.0)
  const maxpW = new BinaryWriter(32);
  maxpW.u32(0x00010000);
  maxpW.u16(numGlyphs);
  maxpW.u16(maxPoints);
  maxpW.u16(maxContours);
  maxpW.u16(0); maxpW.u16(0); // composite points/contours
  maxpW.u16(2); // maxZones
  for (let i = 0; i < 8; i++) maxpW.u16(0);
  const maxpTable = maxpW.toUint8Array();

  // OS/2 (96 bytes, v4)
  const xAvgCharWidth = avgWidthCount > 0 ? Math.round(avgWidthSum / avgWidthCount) : 448;
  const maxCodePoint = codePoints[codePoints.length - 1] ?? 0x7e;
  const os2W = new BinaryWriter(96);
  os2W.u16(4); // version
  os2W.i16(xAvgCharWidth);
  os2W.u16(400); // usWeightClass (Regular)
  os2W.u16(5); // usWidthClass (Medium)
  os2W.u16(0); // fsType (Installable)
  os2W.i16(650); os2W.i16(600); os2W.i16(0); os2W.i16(75); // subscript
  os2W.i16(650); os2W.i16(600); os2W.i16(0); os2W.i16(350); // superscript
  os2W.i16(64); os2W.i16(256); // strikeout
  os2W.i16(0); // sFamilyClass
  for (let i = 0; i < 10; i++) os2W.u8(0); // panose
  os2W.u32(0x00000001); os2W.u32(0); os2W.u32(0); os2W.u32(0); // ulUnicodeRange
  os2W.ascii('KRNK'); // achVendID
  os2W.u16(0x00c0); // fsSelection: REGULAR | USE_TYPO_METRICS
  os2W.u16(0x0020); // usFirstCharIndex
  os2W.u16(Math.min(0xffff, maxCodePoint)); // usLastCharIndex
  os2W.i16(FONT_ASCENT); // sTypoAscender
  os2W.i16(FONT_DESCENT); // sTypoDescender
  os2W.i16(0); // sTypoLineGap
  os2W.u16(FONT_ASCENT); // usWinAscent
  os2W.u16(Math.abs(FONT_DESCENT)); // usWinDescent
  os2W.u32(0x00000001); os2W.u32(0); // ulCodePageRange
  os2W.i16(X_HEIGHT); // sxHeight
  os2W.i16(CAP_HEIGHT); // sCapHeight
  os2W.u16(0); // usDefaultChar
  os2W.u16(0x0020); // usBreakChar
  os2W.u16(0); // usMaxContext
  const os2Table = os2W.toUint8Array();

  // post (32 bytes, v3.0)
  const postW = new BinaryWriter(32);
  postW.u32(0x00030000);
  postW.u32(0); // italicAngle
  postW.i16(-128); // underlinePosition
  postW.i16(64); // underlineThickness
  postW.u32(0); // isFixedPitch (proportional)
  postW.u32(0); postW.u32(0); postW.u32(0); postW.u32(0);
  const postTable = postW.toUint8Array();

  // Assemble SFNT tables sorted in strict ascending ASCII tag order
  const tables: Array<{ tag: string; data: Uint8Array }> = [
    { tag: 'OS/2', data: os2Table },
    { tag: 'cmap', data: cmapTable },
    { tag: 'glyf', data: glyfTable },
    { tag: 'head', data: headTable },
    { tag: 'hhea', data: hheaTable },
    { tag: 'hmtx', data: hmtxTable },
    { tag: 'loca', data: locaTable },
    { tag: 'maxp', data: maxpTable },
    { tag: 'name', data: nameTable },
    { tag: 'post', data: postTable },
  ].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));

  const numTables = tables.length;
  let maxPow2 = 1;
  let entrySel = 0;
  while (maxPow2 * 2 <= numTables) {
    maxPow2 *= 2;
    entrySel++;
  }
  const searchRange = maxPow2 * 16;
  const rangeShift = numTables * 16 - searchRange;

  const headerSize = 12 + numTables * 16;
  let offset = headerSize;
  const records = tables.map((t) => {
    const rec = {
      tag: t.tag,
      data: t.data,
      checksum: calcTableChecksum(t.data),
      offset,
      length: t.data.length,
    };
    offset += (t.data.length + 3) & ~3;
    return rec;
  });

  const sfnt = new BinaryWriter(offset);
  sfnt.u32(0x00010000); // TrueType sfntVersion
  sfnt.u16(numTables);
  sfnt.u16(searchRange);
  sfnt.u16(entrySel);
  sfnt.u16(rangeShift);

  let headOffset = 0;
  for (const r of records) {
    if (r.tag === 'head') headOffset = r.offset;
    sfnt.ascii(r.tag);
    sfnt.u32(r.checksum);
    sfnt.u32(r.offset);
    sfnt.u32(r.length);
  }
  for (const r of records) {
    sfnt.bytes(r.data);
    sfnt.pad4();
  }

  const out = sfnt.toUint8Array();
  // Patch head.checkSumAdjustment = 0xB1B0AFBA - wholeFileChecksum
  const wholeSum = calcTableChecksum(out);
  const adj = (0xb1b0afba - wholeSum) >>> 0;
  new DataView(out.buffer, out.byteOffset, out.byteLength).setUint32(headOffset + 8, adj, false);

  cachedBuiltinTtfBytes = out;
  return out;
}

/**
 * Ensure the clean-room procedural pixel font (`KrunkedPixelBuiltin`) is
 * registered into `document.fonts` so built-in mode renders razor-sharp pixel
 * arcade typography with zero fallback to system sans-serif fonts.
 */
export async function ensureBuiltinPixelFont(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (builtinFontLoaded) return true;
  if (builtinFontPromise) return builtinFontPromise;

  builtinFontPromise = (async () => {
    try {
      const bytes = buildBuiltinPixelFontBytes();
      const bufferCopy = new Uint8Array(bytes.byteLength);
      bufferCopy.set(bytes);

      if (typeof FontFace !== 'undefined' && document.fonts) {
        const face = new FontFace(BUILTIN_FONT_FAMILY, bufferCopy, {
          weight: '100 900',
          style: 'normal',
        });
        const loaded = await face.load();
        document.fonts.add(loaded);
      } else {
        const blob = new Blob([bufferCopy], { type: 'font/ttf' });
        const url = URL.createObjectURL(blob);
        let styleEl = document.getElementById('krunked-builtin-font-style') as HTMLStyleElement | null;
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'krunked-builtin-font-style';
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = `@font-face { font-family: '${BUILTIN_FONT_FAMILY}'; src: url('${url}') format('truetype'); font-weight: 100 900; font-style: normal; }`;
      }

      builtinFontLoaded = true;
      if (!customFontActive) {
        applyFontCssVariable(false);
      }
      return true;
    } catch {
      return false;
    }
  })();

  return builtinFontPromise;
}

/**
 * Load a custom TrueType/OpenType pixel font (e.g. m6x11plus.ttf from Custom Pack)
 * and register it via FontFace, switching `--krunked-font` live.
 * Passing `null` switches cleanly back to the built-in clean-room pixel font.
 */
export async function setCustomPixelFont(fontUrl: string | null): Promise<boolean> {
  if (typeof document === 'undefined') return false;

  // Always keep the clean-room built-in pixel font warm as fallback/builtin primary
  await ensureBuiltinPixelFont();

  if (!fontUrl) {
    customFontActive = false;
    applyFontCssVariable(false);
    return true;
  }

  if (loadedCustomFontUrl === fontUrl) {
    customFontActive = true;
    applyFontCssVariable(true);
    return true;
  }

  try {
    if (typeof FontFace !== 'undefined' && document.fonts) {
      const face = new FontFace(CUSTOM_FONT_FAMILY, `url("${fontUrl}")`, {
        weight: '100 900',
        style: 'normal',
      });
      const loaded = await face.load();
      document.fonts.add(loaded);
    } else {
      let styleEl = document.getElementById('krunked-custom-font-style') as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'krunked-custom-font-style';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = `@font-face { font-family: '${CUSTOM_FONT_FAMILY}'; src: url('${fontUrl}'); font-weight: 100 900; font-display: swap; }`;
    }
    loadedCustomFontUrl = fontUrl;
    customFontActive = true;
    applyFontCssVariable(true);
    return true;
  } catch {
    customFontActive = false;
    applyFontCssVariable(false);
    return false;
  }
}

export function isCustomFontActive(): boolean {
  return customFontActive;
}

export function getActiveFontFamily(): string {
  return customFontActive
    ? `'${CUSTOM_FONT_FAMILY}', '${BUILTIN_FONT_FAMILY}', monospace`
    : `'${BUILTIN_FONT_FAMILY}', monospace`;
}

function applyFontCssVariable(useCustom: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (useCustom) {
    root.style.setProperty(
      '--krunked-font',
      `'${CUSTOM_FONT_FAMILY}', '${BUILTIN_FONT_FAMILY}', monospace`
    );
    root.style.setProperty('--krunked-font-scale', '1.08');
    root.classList.add('krunked-custom-font');
  } else {
    root.style.setProperty(
      '--krunked-font',
      `'${BUILTIN_FONT_FAMILY}', monospace`
    );
    root.style.setProperty('--krunked-font-scale', '1');
    root.classList.remove('krunked-custom-font');
  }
}
