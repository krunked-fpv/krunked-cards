// ============================================================================
// Krunked Cards — High-Craft Built-In 150-Joker & Soul-Layer Pixel-Art Atlas
// Generates a crisp 710x1520 (10 cols x 16 rows @ 71x95) HTMLCanvasElement
// using 100% original TypeScript Canvas2D/ImageData pixel-art algorithms.
// Fully Node.js-safe at module top level (touches DOM only inside factory).
// ============================================================================

const CELL_W = 71;
const CELL_H = 95;
const GRID_COLS = 10;
const GRID_ROWS = 16;

// ---------------------------------------------------------------------------
// Color Helpers & Bayer 4x4 Ordered Dithering
// ---------------------------------------------------------------------------

type RGBA = readonly [number, number, number, number];

const COLOR_CACHE = new Map<string, RGBA>();

function hex(code: string, alpha = 255): RGBA {
  const key = alpha === 255 ? code : `${code}:${alpha}`;
  const cached = COLOR_CACHE.get(key);
  if (cached) return cached;
  const c = code.charCodeAt(0) === 35 ? code.slice(1) : code;
  let r = 0;
  let g = 0;
  let b = 0;
  if (c.length === 3) {
    r = parseInt(c[0]! + c[0]!, 16);
    g = parseInt(c[1]! + c[1]!, 16);
    b = parseInt(c[2]! + c[2]!, 16);
  } else {
    r = parseInt(c.slice(0, 2), 16);
    g = parseInt(c.slice(2, 4), 16);
    b = parseInt(c.slice(4, 6), 16);
  }
  const res: RGBA = [r, g, b, alpha];
  COLOR_CACHE.set(key, res);
  return res;
}

function rgba(r: number, g: number, b: number, a = 255): RGBA {
  return [
    Math.max(0, Math.min(255, Math.round(r))),
    Math.max(0, Math.min(255, Math.round(g))),
    Math.max(0, Math.min(255, Math.round(b))),
    Math.max(0, Math.min(255, Math.round(a))),
  ];
}

function mixCol(a: RGBA, b: RGBA, t: number): RGBA {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
    Math.round(a[3] + (b[3] - a[3]) * k),
  ];
}

function shadeCol(c: RGBA, factor: number): RGBA {
  if (factor >= 1) {
    const t = Math.min(1, factor - 1);
    return [
      Math.round(c[0] + (255 - c[0]) * t),
      Math.round(c[1] + (255 - c[1]) * t),
      Math.round(c[2] + (255 - c[2]) * t),
      c[3],
    ];
  }
  return [
    Math.round(c[0] * factor),
    Math.round(c[1] * factor),
    Math.round(c[2] * factor),
    c[3],
  ];
}

const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

function bayerT(x: number, y: number): number {
  const bx = ((x | 0) & 3);
  const by = ((y | 0) & 3);
  return (BAYER4[by * 4 + bx]! + 0.5) / 16;
}

function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Common Signature Palette
const C_WHITE = hex('#ffffff');
const C_CARD_BORDER = hex('#bfc7d5');
const C_CARD_LIP = hex('#dce2ec');
const C_INK = hex('#374244');
const C_INK_DARK = hex('#252d30');
const C_INK_SOFT = hex('#526268');
const C_SKIN = hex('#ffffff');
const C_SKIN_SHADE = hex('#dde4ee');
const C_SKIN_WARM = hex('#fce6d2');
const C_SKIN_WARM_SH = hex('#e2bfa2');
const C_RED = hex('#fe5f55');
const C_RED_DARK = hex('#c93832');
const C_RED_HI = hex('#ff958e');
const C_BLUE = hex('#009dff');
const C_BLUE_DARK = hex('#0c66b8');
const C_BLUE_HI = hex('#75d0ff');
const C_GOLD = hex('#f5b838');
const C_GOLD_DARK = hex('#c78316');
const C_GOLD_HI = hex('#ffe680');
const C_GREEN = hex('#4bc292');
const C_GREEN_DARK = hex('#27825e');
const C_PURPLE = hex('#8867a5');
const C_PURPLE_DARK = hex('#563c73');
const C_SLATE = hex('#4f6367');
const C_CREAM = hex('#faf6ec');

// ---------------------------------------------------------------------------
// Crisp 71x95 Pixel-Art Rasterizer Buffer
// ---------------------------------------------------------------------------

class PixelCell {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8ClampedArray;
  mask: Uint8Array | null = null;

  constructor(w = CELL_W, h = CELL_H) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  clear(): void {
    this.data.fill(0);
    this.mask = null;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  getA(x: number, y: number): number {
    const ix = x | 0;
    const iy = y | 0;
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return 0;
    return this.data[(iy * this.w + ix) * 4 + 3]!;
  }

  getPx(x: number, y: number): RGBA {
    const ix = x | 0;
    const iy = y | 0;
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return [0, 0, 0, 0];
    const i = (iy * this.w + ix) * 4;
    return [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!, this.data[i + 3]!];
  }

  setPx(x: number, y: number, c: RGBA): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
    if (this.mask && !this.mask[iy * this.w + ix]) return;
    const i = (iy * this.w + ix) * 4;
    const sa = c[3];
    if (sa === 0) return;
    if (sa === 255 || this.data[i + 3] === 0) {
      this.data[i] = c[0];
      this.data[i + 1] = c[1];
      this.data[i + 2] = c[2];
      this.data[i + 3] = sa;
    } else {
      const a = sa / 255;
      const da = this.data[i + 3]! / 255;
      const outA = a + da * (1 - a);
      if (outA > 0) {
        this.data[i] = Math.round((c[0] * a + this.data[i]! * da * (1 - a)) / outA);
        this.data[i + 1] = Math.round((c[1] * a + this.data[i + 1]! * da * (1 - a)) / outA);
        this.data[i + 2] = Math.round((c[2] * a + this.data[i + 2]! * da * (1 - a)) / outA);
        this.data[i + 3] = Math.round(outA * 255);
      }
    }
  }

  clearPx(x: number, y: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
    const i = (iy * this.w + ix) * 4;
    this.data[i] = 0;
    this.data[i + 1] = 0;
    this.data[i + 2] = 0;
    this.data[i + 3] = 0;
  }

  fillRect(x: number, y: number, w: number, h: number, c: RGBA): void {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const x1 = x0 + Math.round(w);
    const y1 = y0 + Math.round(h);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        this.setPx(px, py, c);
      }
    }
  }

  strokeRect(x: number, y: number, w: number, h: number, c: RGBA, t = 1): void {
    this.fillRect(x, y, w, t, c);
    this.fillRect(x, y + h - t, w, t, c);
    this.fillRect(x, y, t, h, c);
    this.fillRect(x + w - t, y, t, h, c);
  }

  ditherPx(x: number, y: number, c1: RGBA, c2: RGBA, t: number): void {
    this.setPx(x, y, t > bayerT(x, y) ? c2 : c1);
  }

  fillDitherGradV(x: number, y: number, w: number, h: number, top: RGBA, bot: RGBA): void {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const hh = Math.max(1, Math.round(h));
    const ww = Math.round(w);
    for (let dy = 0; dy < hh; dy++) {
      const t = dy / Math.max(1, hh - 1);
      for (let dx = 0; dx < ww; dx++) {
        this.ditherPx(x0 + dx, y0 + dy, top, bot, t);
      }
    }
  }

  fillDitherStopsV(x: number, y: number, w: number, h: number, stops: RGBA[]): void {
    if (stops.length < 2) {
      if (stops[0]) this.fillRect(x, y, w, h, stops[0]);
      return;
    }
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const hh = Math.max(1, Math.round(h));
    const ww = Math.round(w);
    const segs = stops.length - 1;
    for (let dy = 0; dy < hh; dy++) {
      const u = (dy / Math.max(1, hh - 1)) * segs;
      const idx = Math.min(segs - 1, Math.floor(u));
      const frac = u - idx;
      const cA = stops[idx]!;
      const cB = stops[idx + 1]!;
      for (let dx = 0; dx < ww; dx++) {
        this.ditherPx(x0 + dx, y0 + dy, cA, cB, frac);
      }
    }
  }

  fillCircle(cx: number, cy: number, r: number, c: RGBA): void {
    const r2 = r * r;
    const minX = Math.floor(cx - r);
    const maxX = Math.ceil(cx + r);
    const minY = Math.floor(cy - r);
    const maxY = Math.ceil(cy + r);
    for (let py = minY; py <= maxY; py++) {
      const dy = py - cy;
      for (let px = minX; px <= maxX; px++) {
        const dx = px - cx;
        if (dx * dx + dy * dy <= r2) this.setPx(px, py, c);
      }
    }
  }

  fillShadedCircle(cx: number, cy: number, r: number, hi: RGBA, mid: RGBA, dark: RGBA): void {
    const r2 = r * r;
    const minX = Math.floor(cx - r);
    const maxX = Math.ceil(cx + r);
    const minY = Math.floor(cy - r);
    const maxY = Math.ceil(cy + r);
    for (let py = minY; py <= maxY; py++) {
      const dy = (py - cy) / Math.max(0.5, r);
      for (let px = minX; px <= maxX; px++) {
        const dx = (px - cx) / Math.max(0.5, r);
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        // Directional top-left light
        const z = Math.sqrt(Math.max(0, 1 - d2));
        const lit = -dx * 0.45 - dy * 0.55 + z * 0.7;
        if (lit > 0.72) this.ditherPx(px, py, mid, hi, (lit - 0.72) / 0.25);
        else if (lit < 0.28) this.ditherPx(px, py, dark, mid, Math.max(0, lit / 0.28));
        else this.setPx(px, py, mid);
      }
    }
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGBA): void {
    if (rx <= 0 || ry <= 0) return;
    const minX = Math.floor(cx - rx);
    const maxX = Math.ceil(cx + rx);
    const minY = Math.floor(cy - ry);
    const maxY = Math.ceil(cy + ry);
    for (let py = minY; py <= maxY; py++) {
      const ny = (py - cy) / ry;
      for (let px = minX; px <= maxX; px++) {
        const nx = (px - cx) / rx;
        if (nx * nx + ny * ny <= 1.0) this.setPx(px, py, c);
      }
    }
  }

  fillShadedEllipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    hi: RGBA,
    mid: RGBA,
    dark: RGBA,
    lightDx = -0.4,
    lightDy = -0.55
  ): void {
    if (rx <= 0 || ry <= 0) return;
    const minX = Math.floor(cx - rx);
    const maxX = Math.ceil(cx + rx);
    const minY = Math.floor(cy - ry);
    const maxY = Math.ceil(cy + ry);
    for (let py = minY; py <= maxY; py++) {
      const ny = (py - cy) / ry;
      for (let px = minX; px <= maxX; px++) {
        const nx = (px - cx) / rx;
        const d2 = nx * nx + ny * ny;
        if (d2 > 1) continue;
        const z = Math.sqrt(Math.max(0, 1 - d2));
        const lit = nx * lightDx + ny * lightDy + z * 0.72;
        if (lit > 0.72) this.ditherPx(px, py, mid, hi, (lit - 0.72) / 0.28);
        else if (lit < 0.25) this.ditherPx(px, py, dark, mid, Math.max(0, lit / 0.25));
        else this.setPx(px, py, mid);
      }
    }
  }

  drawLine(x0: number, y0: number, x1: number, y1: number, c: RGBA, radius = 0): void {
    let ix0 = Math.round(x0);
    let iy0 = Math.round(y0);
    const ix1 = Math.round(x1);
    const iy1 = Math.round(y1);
    const dx = Math.abs(ix1 - ix0);
    const dy = Math.abs(iy1 - iy0);
    const sx = ix0 < ix1 ? 1 : -1;
    const sy = iy0 < iy1 ? 1 : -1;
    let err = dx - dy;
    for (let step = 0; step < 300; step++) {
      if (radius <= 0) this.setPx(ix0, iy0, c);
      else this.fillCircle(ix0, iy0, radius, c);
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

  drawQuadBezier(
    x0: number,
    y0: number,
    cx: number,
    cy: number,
    x1: number,
    y1: number,
    c: RGBA,
    r0 = 0,
    r1 = r0
  ): void {
    const steps = Math.max(12, Math.ceil((Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy)) * 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const px = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
      const py = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
      const r = r0 + (r1 - r0) * t;
      if (r <= 0.4) this.setPx(px, py, c);
      else this.fillCircle(px, py, r, c);
    }
  }

  fillPolygon(pts: ReadonlyArray<readonly [number, number]>, c: RGBA): void {
    if (pts.length < 3) return;
    let minY = this.h;
    let maxY = 0;
    for (const [, y] of pts) {
      if (y < minY) minY = Math.floor(y);
      if (y > maxY) maxY = Math.ceil(y);
    }
    minY = Math.max(0, minY);
    maxY = Math.min(this.h - 1, maxY);
    const n = pts.length;
    const xs: number[] = [];
    for (let py = minY; py <= maxY; py++) {
      xs.length = 0;
      const sy = py + 0.5;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const [xi, yi] = pts[i]!;
        const [xj, yj] = pts[j]!;
        if ((yi > sy) !== (yj > sy)) {
          xs.push(xi + ((sy - yi) * (xj - xi)) / (yj - yi));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xStart = Math.max(0, Math.ceil(xs[k]! - 0.5));
        const xEnd = Math.min(this.w - 1, Math.floor(xs[k + 1]! - 0.5));
        for (let px = xStart; px <= xEnd; px++) {
          this.setPx(px, py, c);
        }
      }
    }
  }

  /**
   * Draw an ASCII bitmap sprite centered at (cx, cy) with optional crisp 1px outline.
   */
  drawSprite(
    grid: readonly string[],
    pal: Record<string, RGBA>,
    cx: number,
    cy: number,
    scale = 1,
    outline?: RGBA
  ): void {
    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;
    const x0 = Math.round(cx - (cols * scale) / 2);
    const y0 = Math.round(cy - (rows * scale) / 2);
    if (outline) {
      for (let r = 0; r < rows; r++) {
        const line = grid[r]!;
        for (let col = 0; col < cols; col++) {
          const ch = line[col]!;
          if (ch === '.' || ch === ' ') continue;
          const px = x0 + col * scale;
          const py = y0 + r * scale;
          this.fillRect(px - 1, py, scale + 2, scale, outline);
          this.fillRect(px, py - 1, scale, scale + 2, outline);
        }
      }
    }
    for (let r = 0; r < rows; r++) {
      const line = grid[r]!;
      for (let col = 0; col < cols; col++) {
        const ch = line[col]!;
        if (ch === '.' || ch === ' ') continue;
        const color = pal[ch];
        if (!color) continue;
        this.fillRect(x0 + col * scale, y0 + r * scale, scale, scale, color);
      }
    }
  }

  /**
   * Composite a layer onto this cell with optional 1px auto-outline and drop shadow.
   */
  blitLayer(
    src: PixelCell,
    ox = 0,
    oy = 0,
    outline?: RGBA | 'auto',
    shadow?: { dx: number; dy: number; color: RGBA }
  ): void {
    if (shadow) {
      for (let y = 0; y < src.h; y++) {
        for (let x = 0; x < src.w; x++) {
          if (src.getA(x, y) > 40) {
            this.setPx(x + ox + shadow.dx, y + oy + shadow.dy, shadow.color);
          }
        }
      }
    }
    if (outline) {
      for (let y = 0; y < src.h; y++) {
        for (let x = 0; x < src.w; x++) {
          if (src.getA(x, y) > 40) continue;
          const n1 = src.getA(x - 1, y) > 40;
          const n2 = src.getA(x + 1, y) > 40;
          const n3 = src.getA(x, y - 1) > 40;
          const n4 = src.getA(x, y + 1) > 40;
          if (n1 || n2 || n3 || n4) {
            if (outline === 'auto') {
              const ref = n1
                ? src.getPx(x - 1, y)
                : n2
                  ? src.getPx(x + 1, y)
                  : n3
                    ? src.getPx(x, y - 1)
                    : src.getPx(x, y + 1);
              this.setPx(x + ox, y + oy, shadeCol(ref, 0.42));
            } else {
              this.setPx(x + ox, y + oy, outline);
            }
          }
        }
      }
    }
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const a = src.getA(x, y);
        if (a > 0) {
          this.setPx(x + ox, y + oy, src.getPx(x, y));
        }
      }
    }
  }

  /**
   * Copy this 71x95 cell directly into the master 710x1520 RGBA atlas array.
   */
  copyToAtlas(atlas: Uint8ClampedArray, atlasW: number, gx: number, gy: number): void {
    const destX = gx * CELL_W;
    const destY = gy * CELL_H;
    for (let y = 0; y < CELL_H; y++) {
      const srcRow = y * CELL_W * 4;
      const dstRow = ((destY + y) * atlasW + destX) * 4;
      atlas.set(this.data.subarray(srcRow, srcRow + CELL_W * 4), dstRow);
    }
  }
}

// ---------------------------------------------------------------------------
// Crisp Pixel Typography (5x6 Serif-Card Margin Letters + 3x5 Micro Font)
// ---------------------------------------------------------------------------

const MARGIN_GLYPHS: Record<string, string[]> = {
  J: ['00111', '00010', '00010', '10010', '10010', '01100'],
  O: ['01110', '10001', '10001', '10001', '10001', '01110'],
  K: ['10001', '10010', '11100', '10100', '10010', '10001'],
  E: ['11111', '10000', '11110', '10000', '10000', '11111'],
  R: ['11110', '10001', '11110', '10100', '10010', '10001'],
};

const MICRO_3X5: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  J: ['011', '001', '001', '101', '010'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['110', '101', '101', '101', '101'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '011', '001'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['110', '001', '010', '100', '111'],
  '3': ['110', '001', '010', '001', '110'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '110', '001', '110'],
  '6': ['011', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '110'],
  '+': ['000', '010', '111', '010', '000'],
  '-': ['000', '000', '111', '000', '000'],
  ':': ['000', '010', '000', '010', '000'],
  '.': ['000', '000', '000', '000', '010'],
  '/': ['001', '001', '010', '100', '100'],
  '#': ['101', '111', '101', '111', '101'],
  ' ': ['000', '000', '000', '000', '000'],
};

function drawMicroText(
  cell: PixelCell,
  text: string,
  x: number,
  y: number,
  c: RGBA,
  opts?: { align?: 'left' | 'center' | 'right'; scale?: number; spacing?: number; shadow?: RGBA }
): void {
  const s = opts?.scale ?? 1;
  const sp = opts?.spacing ?? 1;
  const up = text.toUpperCase();
  const totalW = up.length > 0 ? (up.length * (3 + sp) - sp) * s : 0;
  let sx = Math.round(x);
  if (opts?.align === 'center') sx = Math.round(x - totalW / 2);
  else if (opts?.align === 'right') sx = Math.round(x - totalW);
  const sy = Math.round(y);
  const pass = (ox: number, oy: number, col: RGBA) => {
    let cx = sx + ox;
    for (let i = 0; i < up.length; i++) {
      const g = MICRO_3X5[up[i]!] ?? MICRO_3X5[' ']!;
      for (let r = 0; r < 5; r++) {
        for (let k = 0; k < 3; k++) {
          if (g[r]![k] === '1') cell.fillRect(cx + k * s, sy + oy + r * s, s, s, col);
        }
      }
      cx += (3 + sp) * s;
    }
  };
  if (opts?.shadow) pass(s, s, opts.shadow);
  pass(0, 0, c);
}

/**
 * Draw sideways rotated 90 deg clockwise micro text (top-to-bottom reading).
 */
function drawSidewaysText(
  cell: PixelCell,
  text: string,
  x: number,
  y: number,
  c: RGBA,
  dir: 'cw' | 'ccw' = 'cw',
  scale = 1
): void {
  const up = text.toUpperCase();
  let curY = Math.round(y);
  const step = 4 * scale;
  for (let i = 0; i < up.length; i++) {
    const g = MICRO_3X5[up[i]!] ?? MICRO_3X5[' ']!;
    for (let r = 0; r < 5; r++) {
      for (let k = 0; k < 3; k++) {
        if (g[r]![k] !== '1') continue;
        if (dir === 'cw') {
          cell.fillRect(x + (4 - r) * scale, curY + k * scale, scale, scale, c);
        } else {
          cell.fillRect(x + r * scale, curY - k * scale, scale, scale, c);
        }
      }
    }
    curY += dir === 'cw' ? step : -step;
  }
}

/**
 * Signature playing-card vertical "J O K E R" down top-left and upside-down up bottom-right.
 */
function drawJokerMargins(
  cell: PixelCell,
  color: RGBA = C_INK,
  opts?: { left?: boolean; right?: boolean; shadow?: RGBA; yTop?: number; yBot?: number }
): void {
  const showL = opts?.left ?? true;
  const showR = opts?.right ?? true;
  const letters = ['J', 'O', 'K', 'E', 'R'];
  const yTop = opts?.yTop ?? 5;
  const yBot = opts?.yBot ?? 88;

  const paintGlyph = (ch: string, gx: number, gy: number, flip180: boolean, col: RGBA) => {
    const g = MARGIN_GLYPHS[ch]!;
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 5; c++) {
        if (g[r]![c] !== '1') continue;
        const px = flip180 ? gx + (4 - c) : gx + c;
        const py = flip180 ? gy + (5 - r) : gy + r;
        cell.setPx(px, py, col);
      }
    }
  };

  if (showL) {
    for (let i = 0; i < 5; i++) {
      const ly = yTop + i * 7;
      if (opts?.shadow) paintGlyph(letters[i]!, 5, ly + 1, false, opts.shadow);
      paintGlyph(letters[i]!, 4, ly, false, color);
    }
  }
  if (showR) {
    for (let i = 0; i < 5; i++) {
      const ly = yBot - 5 - i * 7;
      if (opts?.shadow) paintGlyph(letters[i]!, 63, ly + 1, true, opts.shadow);
      paintGlyph(letters[i]!, 62, ly, true, color);
    }
  }
}

// ---------------------------------------------------------------------------
// Authentic Playing-Card Silhouettes & Masks
// ---------------------------------------------------------------------------

function makeRoundedRectMask(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius = 3
): Uint8Array {
  const m = new Uint8Array(CELL_W * CELL_H);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dxL = x - x0;
      const dxR = x1 - x;
      const dyT = y - y0;
      const dyB = y1 - y;
      const dx = Math.min(dxL, dxR);
      const dy = Math.min(dyT, dyB);
      if (dx < radius && dy < radius) {
        const cx = radius - dx - 0.5;
        const cy = radius - dy - 0.5;
        if (cx * cx + cy * cy > radius * radius) continue;
      }
      if (x >= 0 && y >= 0 && x < CELL_W && y < CELL_H) {
        m[y * CELL_W + x] = 1;
      }
    }
  }
  return m;
}

const STANDARD_CARD_MASK = makeRoundedRectMask(1, 1, 69, 93, 3);
const STANDARD_INNER_MASK = makeRoundedRectMask(2, 2, 68, 92, 2);

/**
 * Draw crisp rounded playing-card silhouette matching exact 71x95 bounds (1px padding).
 * Sets interior mask automatically if requested.
 */
function initCard(
  cell: PixelCell,
  bg: RGBA = C_WHITE,
  border: RGBA = C_CARD_BORDER,
  lip?: RGBA
): void {
  cell.clear();
  for (let y = 1; y <= 93; y++) {
    for (let x = 1; x <= 69; x++) {
      const idx = y * CELL_W + x;
      if (!STANDARD_CARD_MASK[idx]) continue;
      if (STANDARD_INNER_MASK[idx]) {
        cell.setPx(x, y, bg);
      } else {
        cell.setPx(x, y, border);
      }
    }
  }
  if (lip) {
    for (let x = 4; x <= 66; x++) {
      cell.setPx(x, 92, lip);
    }
  }
  cell.mask = STANDARD_INNER_MASK;
}

/**
 * Fill inner rounded art panel inside white playing-card frame (x=3..67, y=3..91).
 */
function fillFramedBg(cell: PixelCell, paintFn: (c: PixelCell) => void): void {
  const prev = cell.mask;
  cell.mask = makeRoundedRectMask(3, 3, 67, 91, 2);
  paintFn(cell);
  cell.mask = prev;
}

/**
 * Generate lush multi-tone organic marbling/swirl waves (used by Legendaries, gems, 8 Ball, etc.).
 */
function drawMarbleSwirl(
  cell: PixelCell,
  c1: RGBA,
  c2: RGBA,
  c3: RGBA,
  seed: number,
  freq = 0.14,
  warp = 2.6,
  angle = 0.65
): void {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  for (let y = 1; y < CELL_H - 1; y++) {
    for (let x = 1; x < CELL_W - 1; x++) {
      if (cell.mask && !cell.mask[y * CELL_W + x]) continue;
      const rx = (x * ca - y * sa) * freq;
      const ry = (x * sa + y * ca) * freq;
      const w1 = Math.sin(rx * 1.1 + seed) * Math.cos(ry * 0.9 - seed * 0.7);
      const w2 = Math.sin(rx * 0.6 - ry * 1.3 + w1 * warp + seed * 1.4);
      const band = Math.sin(ry * 1.55 + w2 * 2.1 + w1 * 1.3);
      const v = (band + 1) * 0.5;
      if (v < 0.36) {
        cell.ditherPx(x, y, c1, c2, v / 0.36);
      } else if (v < 0.74) {
        cell.ditherPx(x, y, c2, c3, (v - 0.36) / 0.38);
      } else {
        cell.setPx(x, y, c3);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Suit Icons & Repeating Suit Wallpaper
// ---------------------------------------------------------------------------

type SuitKind = 'Hearts' | 'Diamonds' | 'Spades' | 'Clubs';

const SUIT_9X9: Record<SuitKind, string[]> = {
  Hearts: [
    '.aa...aa.',
    'aaaa.aaaa',
    'aaaaaaaaa',
    'aaaaaaaaa',
    '.aaaaaaa.',
    '..aaaaa..',
    '...aaa...',
    '....a....',
  ],
  Diamonds: [
    '....a....',
    '...aaa...',
    '..aaaaa..',
    '.aaaaaaa.',
    'aaaaaaaaa',
    '.aaaaaaa.',
    '..aaaaa..',
    '...aaa...',
    '....a....',
  ],
  Spades: [
    '....a....',
    '...aaa...',
    '..aaaaa..',
    '.aaaaaaa.',
    'aaaaaaaaa',
    'aaaaaaaaa',
    '.aa.a.aa.',
    '...aaa...',
    '..aaaaa..',
  ],
  Clubs: [
    '...aaa...',
    '..aaaaa..',
    '...aaa...',
    '.aa.a.aa.',
    'aaaaaaaaa',
    'aaaaaaaaa',
    '.aa.a.aa.',
    '...aaa...',
    '..aaaaa..',
  ],
};

function drawSuitTileBg(cell: PixelCell, suit: SuitKind, base: RGBA, tileCol: RGBA): void {
  cell.fillRect(2, 2, 67, 91, base);
  const pat = SUIT_9X9[suit];
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 7; col++) {
      const cx = 5 + col * 11 + (row % 2) * 5;
      const cy = 6 + row * 10;
      cell.drawSprite(pat, { a: tileCol }, cx, cy, 1);
    }
  }
}

function drawMiniCard(
  cell: PixelCell,
  cx: number,
  cy: number,
  opts?: { backCol?: RGBA; pipCol?: RGBA; pips?: number }
): void {
  const x0 = Math.round(cx - 4);
  const y0 = Math.round(cy - 6);
  cell.fillRect(x0, y0, 8, 11, C_CARD_BORDER);
  cell.fillRect(x0 + 1, y0 + 1, 6, 9, opts?.backCol ?? C_WHITE);
  if (opts?.backCol) {
    cell.strokeRect(x0 + 2, y0 + 2, 4, 7, C_WHITE);
  } else if (opts?.pipCol) {
    const n = opts.pips ?? 1;
    if (n === 1) cell.fillRect(x0 + 3, y0 + 5, 2, 2, opts.pipCol);
    else if (n === 2) {
      cell.setPx(x0 + 2, y0 + 3, opts.pipCol);
      cell.setPx(x0 + 5, y0 + 7, opts.pipCol);
    } else {
      cell.setPx(x0 + 2, y0 + 3, opts.pipCol);
      cell.setPx(x0 + 4, y0 + 5, opts.pipCol);
      cell.setPx(x0 + 5, y0 + 7, opts.pipCol);
    }
  }
}

function drawMiniCardFan(
  cell: PixelCell,
  count: 2 | 3 | 4 | 5,
  mode: 'white' | 'flushRed' | 'flushBlue' | 'straight',
  cy = 81
): void {
  const offsets: Record<number, Array<[number, number]>> = {
    2: [[-5, 0], [5, 0]],
    3: [[-8, 1], [0, -1], [8, 1]],
    4: [[-11, 2], [-4, 0], [4, 0], [11, 2]],
    5: [[-14, 3], [-7, 1], [0, -1], [7, 1], [14, 3]],
  };
  const pts = offsets[count]!;
  for (let i = 0; i < pts.length; i++) {
    const [dx, dy] = pts[i]!;
    if (mode === 'flushRed') {
      drawMiniCard(cell, 35 + dx, cy + dy, { backCol: i % 2 === 0 ? C_RED : C_INK });
    } else if (mode === 'flushBlue') {
      drawMiniCard(cell, 35 + dx, cy + dy, { backCol: C_BLUE_DARK });
    } else if (mode === 'straight') {
      drawMiniCard(cell, 35 + dx, cy + dy, {
        pipCol: i % 2 === 0 ? C_RED : C_INK,
        pips: (i % 3) + 1,
      });
    } else {
      drawMiniCard(cell, 35 + dx, cy + dy, {
        pipCol: i % 2 === 0 ? C_RED : C_BLUE_DARK,
        pips: 1,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// High-Craft Parametric Curved Jester Portrait Engine
// Renders smooth 3-pronged arched jester hoods, sculpted rounded faces,
// expressive eyes/smiles, and 5-lobe scalloped ruffled collars with crisp 1px outline!
// ---------------------------------------------------------------------------

interface JesterConfig {
  cx?: number;
  cy?: number;
  hatCenter: RGBA;
  hatSide: RGBA;
  hatSideR?: RGBA;
  bell?: RGBA;
  collar: RGBA;
  collarAlt?: RGBA;
  collarStyle?: 'scalloped' | 'striped' | 'pleated' | 'cape' | 'sweater' | 'tux' | 'royal' | 'minimal';
  hatStyle?: 'classic' | 'twin' | 'cone' | 'tall' | 'clown' | 'harlequin' | 'crown' | 'none';
  face?: RGBA;
  faceShade?: RGBA;
  cheek?: RGBA;
  eyeCol?: RGBA;
  browCol?: RGBA;
  smileCol?: RGBA;
  expr?:
    | 'jimbo'
    | 'jolly'
    | 'zany'
    | 'mad'
    | 'crazy'
    | 'droll'
    | 'sly'
    | 'sad'
    | 'blank'
    | 'skull'
    | 'manic'
    | 'smirk';
  outline?: RGBA | 'auto';
  redNose?: boolean;
  eyepatch?: boolean;
  tear?: RGBA;
  fangs?: boolean;
  beard?: RGBA;
  mustache?: RGBA;
  sunglasses?: boolean;
  visor?: RGBA;
  thirdEye?: boolean;
  noFace?: boolean;
  outlineAlpha?: boolean;
  shadow?: boolean;
}

function drawCurvedProng(
  layer: PixelCell,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  rStart: number,
  rEnd: number,
  base: RGBA
): void {
  const hi = shadeCol(base, 1.32);
  const dark = shadeCol(base, 0.7);
  const steps = 28;
  // Shadow underside pass
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const px = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
    const py = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
    const r = rStart + (rEnd - rStart) * t;
    layer.fillCircle(px, py + 0.7, r, dark);
  }
  // Main midtone body
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const px = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
    const py = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
    const r = Math.max(0.8, (rStart + (rEnd - rStart) * t) * 0.88);
    layer.fillCircle(px, py - 0.3, r, base);
  }
  // Top highlight ridge
  for (let i = 2; i <= steps - 3; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const px = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
    const py = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
    const r = Math.max(0.5, (rStart + (rEnd - rStart) * t) * 0.35);
    layer.fillCircle(px - 0.8, py - rStart * 0.25 * (1 - t * 0.5) - 0.8, r, hi);
  }
}

function drawJester(target: PixelCell, cfg: JesterConfig): void {
  const layer = new PixelCell(CELL_W, CELL_H);
  const cx = cfg.cx ?? 35;
  const cy = cfg.cy ?? 47;
  const faceCol = cfg.face ?? C_SKIN;
  const faceShade = cfg.faceShade ?? C_SKIN_SHADE;
  const eyeCol = cfg.eyeCol ?? C_INK_DARK;
  const browCol = cfg.browCol ?? cfg.hatSide;
  const smileCol = cfg.smileCol ?? C_RED;
  const bellCol = cfg.bell ?? C_GOLD;
  const hatStyle = cfg.hatStyle ?? 'classic';
  const collarStyle = cfg.collarStyle ?? 'scalloped';
  const expr = cfg.expr ?? 'jimbo';
  const hatR = cfg.hatSideR ?? cfg.hatSide;

  // 1. COLLAR / SHOULDERS
  const colY = cy + 13;
  const cMid = cfg.collar;
  const cHi = shadeCol(cMid, 1.3);
  const cDk = shadeCol(cMid, 0.68);
  const cAlt = cfg.collarAlt ?? cDk;

  if (collarStyle === 'scalloped' || collarStyle === 'striped') {
    // Broad curved base + 5 graceful hanging petals
    const petals = [
      { dx: -16, dy: 5, rx: 5.5, ry: 6.5 },
      { dx: -8, dy: 9, rx: 5.8, ry: 7.5 },
      { dx: 0, dy: 7, rx: 6.2, ry: 7.0 },
      { dx: 8, dy: 9, rx: 5.8, ry: 7.5 },
      { dx: 16, dy: 5, rx: 5.5, ry: 6.5 },
    ];
    // Back ruff fullness
    layer.fillShadedEllipse(cx, colY + 2, 19, 8.5, cHi, cMid, cDk);
    for (let i = 0; i < petals.length; i++) {
      const p = petals[i]!;
      const pCol = collarStyle === 'striped' && i % 2 === 1 ? cAlt : cMid;
      layer.fillShadedEllipse(
        cx + p.dx,
        colY + p.dy,
        p.rx,
        p.ry,
        shadeCol(pCol, 1.28),
        pCol,
        shadeCol(pCol, 0.66)
      );
      // Tiny dark crease between lobes
      if (i > 0) {
        layer.drawLine(cx + p.dx - 4, colY + 1, cx + p.dx - 4, colY + 6, shadeCol(cMid, 0.55));
      }
      // Small decorative tip dot / bell
      if (i === 0 || i === 4) {
        layer.fillCircle(cx + p.dx * 1.05, colY + p.dy + 5.5, 1.7, bellCol);
      }
    }
    if (collarStyle === 'striped') {
      // Crisp horizontal alternating stripes across scalloped collar (Sly/Wily/Clever/Devious/Crafty!)
      for (let py = colY - 5; py <= colY + 16; py++) {
        const stripe = ((py - colY + 20) >> 1) % 2 === 0;
        if (!stripe) continue;
        for (let px = cx - 22; px <= cx + 22; px++) {
          if (layer.getA(px, py) > 0) {
            const cur = layer.getPx(px, py);
            layer.setPx(px, py, mixCol(cur, cAlt, 0.55));
          }
        }
      }
    }
    // Crisp neckline shadow right under chin
    layer.fillEllipse(cx, colY - 3, 11, 4, shadeCol(cMid, 0.6));
  } else if (collarStyle === 'pleated') {
    // Elizabethan snowy ruffled collar (Merry Andy / Canio / Mime-inspired)
    for (let i = -4; i <= 4; i++) {
      const px = cx + i * 4.5;
      const py = colY + 4 + Math.cos(i * 0.42) * 3;
      layer.fillShadedEllipse(px, py, 3.8, 7.2, cHi, cMid, cDk);
      if (cfg.collarAlt) {
        layer.fillCircle(px, py + 6, 1.6, cAlt);
      }
    }
    layer.fillEllipse(cx, colY + 1, 16, 4.5, cHi);
  } else if (collarStyle === 'royal') {
    // Royal velvet shoulders with white spotted ermine collar & gold clasp
    layer.fillShadedEllipse(cx, colY + 10, 18, 12, cHi, cMid, cDk);
    layer.fillShadedEllipse(cx, colY + 1, 15, 5.5, C_WHITE, hex('#eef2f6'), hex('#cbd5e0'));
    for (let i = -3; i <= 3; i++) {
      layer.fillRect(cx + i * 4 - 1, colY + 1 + (i % 2), 2, 2, C_INK_DARK);
    }
    layer.fillCircle(cx, colY + 5, 2.5, C_GOLD);
    layer.setPx(cx - 1, colY + 4, C_GOLD_HI);
  } else if (collarStyle === 'cape') {
    // High dramatic gothic cloak collar (Vampire)
    layer.fillPolygon(
      [
        [cx - 21, colY - 6],
        [cx - 12, colY - 12],
        [cx - 6, colY + 2],
        [cx + 6, colY + 2],
        [cx + 12, colY - 12],
        [cx + 21, colY - 6],
        [cx + 18, colY + 14],
        [cx, colY + 20],
        [cx - 18, colY + 14],
      ],
      cDk
    );
    layer.fillPolygon(
      [
        [cx - 17, colY - 4],
        [cx - 11, colY - 8],
        [cx, colY + 4],
        [cx + 11, colY - 8],
        [cx + 17, colY - 4],
        [cx + 14, colY + 12],
        [cx, colY + 17],
        [cx - 14, colY + 12],
      ],
      cAlt
    );
    layer.fillShadedEllipse(cx, colY + 11, 12, 8, cHi, cMid, cDk);
  } else if (collarStyle === 'sweater') {
    layer.fillShadedEllipse(cx, colY + 8, 17, 10, cHi, cMid, cDk);
  } else if (collarStyle === 'tux') {
    layer.fillPolygon(
      [
        [cx - 14, colY - 1],
        [cx + 14, colY - 1],
        [cx + 11, colY + 14],
        [cx, colY + 18],
        [cx - 11, colY + 14],
      ],
      cMid
    );
    layer.fillPolygon(
      [
        [cx - 7, colY - 1],
        [cx + 7, colY - 1],
        [cx, colY + 13],
      ],
      C_WHITE
    );
    // Bowtie
    layer.fillPolygon([[cx - 6, colY + 1], [cx, colY + 3], [cx - 6, colY + 6]], cAlt);
    layer.fillPolygon([[cx + 6, colY + 1], [cx, colY + 3], [cx + 6, colY + 6]], cAlt);
    layer.fillCircle(cx, colY + 3.5, 1.8, shadeCol(cAlt, 1.25));
  } else if (collarStyle === 'minimal') {
    layer.fillShadedEllipse(cx, colY + 5, 13, 6, cHi, cMid, cDk);
  }

  // 2. FACE / HEAD (skipped if Invisible Joker)
  const headY = cy - 2;
  if (!cfg.noFace) {
    // Slightly pear-shaped friendly face with 3D spherical shading
    layer.fillShadedEllipse(cx, headY + 1, 11.2, 11.8, faceCol, faceCol, faceShade, -0.3, -0.5);
    layer.fillShadedEllipse(cx, headY + 4, 10.6, 8.8, faceCol, faceCol, faceShade, -0.25, -0.55);
    if (cfg.cheek) {
      layer.fillCircle(cx - 7, headY + 3, 2.2, cfg.cheek);
      layer.fillCircle(cx + 7, headY + 3, 2.2, cfg.cheek);
    }
  }

  // 3. CURVED 3-PRONGED JESTER HAT / HEADWEAR
  const hatY = headY - 11;
  if (hatStyle === 'classic') {
    // Left floppy curved prong + bell
    drawCurvedProng(layer, cx - 7, hatY + 3, cx - 18, hatY - 7, cx - 19, hatY + 7, 5.2, 2.0, cfg.hatSide);
    layer.fillShadedCircle(cx - 19, hatY + 8, 2.3, shadeCol(bellCol, 1.3), bellCol, shadeCol(bellCol, 0.65));
    // Right floppy curved prong + bell
    drawCurvedProng(layer, cx + 7, hatY + 3, cx + 18, hatY - 7, cx + 19, hatY + 7, 5.2, 2.0, hatR);
    layer.fillShadedCircle(cx + 19, hatY + 8, 2.3, shadeCol(bellCol, 1.3), bellCol, shadeCol(bellCol, 0.65));
    // Tall graceful central arching peak
    drawCurvedProng(layer, cx, hatY + 4, cx - 2, hatY - 12, cx + 5, hatY - 16, 7.2, 2.2, cfg.hatCenter);
    layer.fillShadedCircle(cx + 6, hatY - 15, 2.1, shadeCol(bellCol, 1.3), bellCol, shadeCol(bellCol, 0.65));
    // Snug curved brow band framing the forehead
    layer.drawQuadBezier(cx - 11, hatY + 5, cx, hatY - 1, cx + 11, hatY + 5, shadeCol(cfg.hatCenter, 0.72), 2.3, 2.3);
    layer.drawQuadBezier(cx - 10, hatY + 4, cx, hatY - 2, cx + 10, hatY + 4, cfg.hatCenter, 1.9, 1.9);
  } else if (hatStyle === 'twin') {
    // Symmetrical 2-horned jester hood (Even Steven)
    drawCurvedProng(layer, cx - 3, hatY + 4, cx - 15, hatY - 11, cx - 19, hatY + 4, 6.2, 2.1, cfg.hatSide);
    drawCurvedProng(layer, cx + 3, hatY + 4, cx + 15, hatY - 11, cx + 19, hatY + 4, 6.2, 2.1, hatR);
    layer.fillShadedCircle(cx - 19, hatY + 5, 2.2, shadeCol(bellCol, 1.3), bellCol, shadeCol(bellCol, 0.65));
    layer.fillShadedCircle(cx + 19, hatY + 5, 2.2, shadeCol(bellCol, 1.3), bellCol, shadeCol(bellCol, 0.65));
    layer.fillShadedEllipse(cx, hatY + 3, 10, 4.2, shadeCol(cfg.hatCenter, 1.25), cfg.hatCenter, shadeCol(cfg.hatCenter, 0.7));
  } else if (hatStyle === 'cone') {
    // Tall single curving wizard/jester cone (Odd Todd)
    drawCurvedProng(layer, cx, hatY + 5, cx - 3, hatY - 13, cx + 4, hatY - 21, 9.5, 2.0, cfg.hatCenter);
    layer.fillShadedCircle(cx + 5, hatY - 20, 2.0, shadeCol(bellCol, 1.3), bellCol, shadeCol(bellCol, 0.65));
  } else if (hatStyle === 'tall') {
    // Dramatic tall floppy hood with sweeping ears (Sly/Wily/etc. or Bone/Stone)
    drawCurvedProng(layer, cx - 6, hatY + 4, cx - 19, hatY - 9, cx - 17, hatY + 9, 5.6, 2.1, cfg.hatSide);
    drawCurvedProng(layer, cx + 6, hatY + 4, cx + 19, hatY - 9, cx + 17, hatY + 9, 5.6, 2.1, hatR);
    drawCurvedProng(layer, cx, hatY + 3, cx + 3, hatY - 15, cx - 3, hatY - 18, 6.5, 2.0, cfg.hatCenter);
    layer.fillShadedCircle(cx - 17, hatY + 10, 2.1, shadeCol(bellCol, 1.3), bellCol, shadeCol(bellCol, 0.65));
    layer.fillShadedCircle(cx + 17, hatY + 10, 2.1, shadeCol(bellCol, 1.3), bellCol, shadeCol(bellCol, 0.65));
  } else if (hatStyle === 'clown') {
    // Fluffy triple-tuft clown hair (Chaos the Clown)
    layer.fillShadedCircle(cx - 12, hatY + 6, 5.8, shadeCol(cfg.hatSide, 1.25), cfg.hatSide, shadeCol(cfg.hatSide, 0.68));
    layer.fillShadedCircle(cx + 12, hatY + 6, 5.8, shadeCol(hatR, 1.25), hatR, shadeCol(hatR, 0.68));
    layer.fillShadedCircle(cx, hatY - 5, 7.2, shadeCol(cfg.hatCenter, 1.25), cfg.hatCenter, shadeCol(cfg.hatCenter, 0.68));
    layer.fillShadedCircle(cx - 5, hatY - 1, 5.2, shadeCol(cfg.hatCenter, 1.25), cfg.hatCenter, shadeCol(cfg.hatCenter, 0.68));
    layer.fillShadedCircle(cx + 5, hatY - 1, 5.2, shadeCol(cfg.hatCenter, 1.25), cfg.hatCenter, shadeCol(cfg.hatCenter, 0.68));
  } else if (hatStyle === 'harlequin') {
    // 4-prong colorful carnival hat (Merry Andy)
    drawCurvedProng(layer, cx - 8, hatY + 5, cx - 21, hatY - 2, cx - 19, hatY + 12, 4.8, 1.9, cfg.hatSide);
    drawCurvedProng(layer, cx + 8, hatY + 5, cx + 21, hatY - 2, cx + 19, hatY + 12, 4.8, 1.9, hatR);
    drawCurvedProng(layer, cx - 4, hatY + 3, cx - 12, hatY - 14, cx - 1, hatY - 15, 5.5, 1.9, cfg.hatCenter);
    drawCurvedProng(layer, cx + 4, hatY + 3, cx + 13, hatY - 13, cx + 14, hatY - 3, 5.2, 1.9, C_BLUE);
    layer.fillCircle(cx - 19, hatY + 12, 2.0, bellCol);
    layer.fillCircle(cx + 19, hatY + 12, 2.0, bellCol);
    layer.fillCircle(cx - 1, hatY - 15, 2.0, bellCol);
  } else if (hatStyle === 'crown') {
    // Tall royal golden jeweled crown (Baron)
    layer.fillPolygon(
      [
        [cx - 12, hatY + 5],
        [cx - 14, hatY - 10],
        [cx - 6, hatY - 3],
        [cx, hatY - 14],
        [cx + 6, hatY - 3],
        [cx + 14, hatY - 10],
        [cx + 12, hatY + 5],
      ],
      C_GOLD
    );
    // Velvet crown cap inside
    layer.fillEllipse(cx, hatY - 3, 9, 6, C_PURPLE);
    layer.fillPolygon(
      [
        [cx - 11, hatY + 5],
        [cx - 13, hatY - 8],
        [cx - 6, hatY - 2],
        [cx, hatY - 12],
        [cx + 6, hatY - 2],
        [cx + 13, hatY - 8],
        [cx + 11, hatY + 5],
      ],
      C_GOLD
    );
    layer.fillRect(cx - 11, hatY + 1, 22, 4, C_GOLD_DARK);
    layer.fillRect(cx - 11, hatY + 1, 22, 2, C_GOLD_HI);
    // Crown gems
    layer.fillCircle(cx, hatY + 2, 1.8, C_RED);
    layer.fillCircle(cx - 6, hatY + 2, 1.4, C_BLUE);
    layer.fillCircle(cx + 6, hatY + 2, 1.4, C_BLUE);
    layer.fillCircle(cx, hatY - 13, 1.6, C_GOLD_HI);
    layer.fillCircle(cx - 13, hatY - 9, 1.4, C_GOLD_HI);
    layer.fillCircle(cx + 13, hatY - 9, 1.4, C_GOLD_HI);
  }

  // 4. EXPRESSIVE FACIAL FEATURES
  if (!cfg.noFace && expr !== 'blank') {
    const ey = headY - 1;
    const my = headY + 6;

    if (expr === 'skull') {
      // Hollow sockets, nasal triangle, skeletal teeth
      layer.fillEllipse(cx - 4.5, ey, 3.0, 3.3, C_INK_DARK);
      layer.fillEllipse(cx + 4.5, ey, 3.0, 3.3, C_INK_DARK);
      layer.setPx(cx - 5, ey - 1, hex('#9aa8b5'));
      layer.setPx(cx + 4, ey - 1, hex('#9aa8b5'));
      layer.fillPolygon([[cx, ey + 2], [cx - 2, ey + 5], [cx + 2, ey + 5]], C_INK_DARK);
      layer.fillRect(cx - 6, my + 1, 13, 4, C_INK_DARK);
      for (let tx = -5; tx <= 5; tx += 3) {
        layer.fillRect(cx + tx, my + 1, 2, 4, faceCol);
      }
    } else {
      // Eyes
      if (cfg.sunglasses) {
        layer.fillRect(cx - 10, ey - 2, 9, 6, C_INK_DARK);
        layer.fillRect(cx + 1, ey - 2, 9, 6, C_INK_DARK);
        layer.fillRect(cx - 1, ey - 1, 3, 2, C_INK_DARK);
        layer.drawLine(cx - 8, ey - 1, cx - 5, ey + 2, C_WHITE);
        layer.drawLine(cx + 3, ey - 1, cx + 6, ey + 2, C_WHITE);
      } else if (cfg.visor) {
        layer.fillRect(cx - 11, ey - 3, 23, 6, cfg.visor);
        layer.fillRect(cx - 10, ey - 2, 21, 2, shadeCol(cfg.visor, 1.45));
        layer.drawLine(cx - 7, ey - 2, cx - 3, ey + 2, C_WHITE);
        layer.drawLine(cx + 3, ey - 2, cx + 7, ey + 2, C_WHITE);
      } else if (expr === 'crazy') {
        layer.fillCircle(cx - 5, ey, 3.6, C_WHITE);
        layer.fillCircle(cx + 5, ey - 1, 4.2, C_WHITE);
        layer.fillCircle(cx - 6, ey + 1, 1.5, eyeCol);
        layer.fillCircle(cx + 6, ey - 2, 1.5, eyeCol);
      } else if (expr === 'manic') {
        layer.fillCircle(cx - 4.8, ey, 3.2, C_GOLD_HI);
        layer.fillCircle(cx + 4.8, ey, 3.2, C_GOLD_HI);
        layer.fillCircle(cx - 4.8, ey, 1.5, C_RED_DARK);
        layer.fillCircle(cx + 4.8, ey, 1.5, C_RED_DARK);
      } else if (expr === 'jolly') {
        // Joyful crescent laughing eyes
        layer.drawQuadBezier(cx - 7, ey + 1, cx - 4.5, ey - 3, cx - 2, ey + 1, eyeCol, 0.8, 0.8);
        layer.drawQuadBezier(cx + 2, ey + 1, cx + 4.5, ey - 3, cx + 7, ey + 1, eyeCol, 0.8, 0.8);
      } else {
        // Expressive almond/oval eyes with white highlight glint
        layer.fillEllipse(cx - 4.5, ey, 2.3, 2.6, eyeCol);
        layer.fillEllipse(cx + 4.5, ey, 2.3, 2.6, eyeCol);
        layer.setPx(cx - 5, ey - 1, C_WHITE);
        layer.setPx(cx + 4, ey - 1, C_WHITE);
        // Half-lidded eyelids for droll/sly
        if (expr === 'droll' || expr === 'sly') {
          layer.fillRect(cx - 7, ey - 3, 6, 3, faceCol);
          layer.fillRect(cx + 2, ey - 3, 6, 3, faceCol);
          layer.fillRect(cx - 7, ey - 1, 6, 1, eyeCol);
          layer.fillRect(cx + 2, ey - 1, 6, 1, eyeCol);
        }
      }

      // Eyebrows / arched jester makeup
      if (!cfg.sunglasses && !cfg.visor) {
        if (expr === 'mad') {
          layer.drawLine(cx - 8, ey - 4, cx - 2, ey - 2, browCol, 0.8);
          layer.drawLine(cx + 8, ey - 4, cx + 2, ey - 2, browCol, 0.8);
        } else if (expr === 'zany') {
          layer.drawQuadBezier(cx - 8, ey - 2, cx - 5, ey - 6, cx - 2, ey - 3, browCol, 0.7, 0.7);
          layer.drawLine(cx + 2, ey - 3, cx + 8, ey - 2, browCol, 0.7);
        } else if (expr === 'sad') {
          layer.drawLine(cx - 8, ey - 2, cx - 2, ey - 4, browCol, 0.7);
          layer.drawLine(cx + 8, ey - 2, cx + 2, ey - 4, browCol, 0.7);
        } else {
          layer.drawQuadBezier(cx - 7, ey - 2, cx - 4.5, ey - 5, cx - 2, ey - 2, browCol, 0.7, 0.7);
          layer.drawQuadBezier(cx + 2, ey - 2, cx + 4.5, ey - 5, cx + 7, ey - 2, browCol, 0.7, 0.7);
        }
      }

      if (cfg.eyepatch) {
        layer.fillCircle(cx + 4.5, ey, 3.5, C_INK_DARK);
        layer.drawLine(cx - 10, ey - 4, cx + 10, ey + 2, C_INK_DARK);
      }

      if (cfg.thirdEye) {
        layer.fillEllipse(cx, ey - 5, 3.2, 2.0, C_WHITE);
        layer.fillCircle(cx, ey - 5, 1.3, C_PURPLE_DARK);
        layer.setPx(cx, ey - 5, hex('#f0b0ff'));
      }

      if (cfg.tear) {
        layer.fillRect(cx - 5, ey + 3, 2, 3, cfg.tear);
        layer.setPx(cx - 5, ey + 6, cfg.tear);
      }

      if (cfg.redNose) {
        layer.fillShadedCircle(cx, ey + 3.5, 2.5, C_RED_HI, C_RED, C_RED_DARK);
      }

      if (cfg.beard) {
        layer.fillShadedEllipse(cx, my + 2, 10.5, 7.5, shadeCol(cfg.beard, 1.2), cfg.beard, shadeCol(cfg.beard, 0.68));
      }

      if (cfg.mustache) {
        layer.drawQuadBezier(cx, my - 2, cx - 5, my - 4, cx - 9, my - 1, cfg.mustache, 1.4, 0.9);
        layer.drawQuadBezier(cx, my - 2, cx + 5, my - 4, cx + 9, my - 1, cfg.mustache, 1.4, 0.9);
      }

      // Mouth / Iconic Curved Jester Grin
      if (expr === 'sad') {
        layer.drawQuadBezier(cx - 5, my + 2, cx, my - 2, cx + 5, my + 2, smileCol, 1.2, 1.2);
      } else if (expr === 'mad') {
        layer.drawQuadBezier(cx - 6, my + 1, cx, my - 2, cx + 6, my + 1, smileCol, 1.4, 1.4);
        layer.fillRect(cx - 4, my, 9, 2, C_WHITE);
      } else if (expr === 'droll') {
        layer.drawLine(cx - 5, my, cx + 5, my, smileCol, 0.9);
      } else if (expr === 'smirk') {
        layer.drawQuadBezier(cx - 4, my + 1, cx + 2, my + 2, cx + 6, my - 1, smileCol, 1.1, 1.1);
      } else {
        // Wide joyful upturned jester smile with gleaming white teeth!
        layer.drawQuadBezier(cx - 7, my - 1, cx, my + 6, cx + 7, my - 1, smileCol, 1.9, 1.9);
        layer.drawQuadBezier(cx - 5, my - 1, cx, my + 3.5, cx + 5, my - 1, C_WHITE, 1.0, 1.0);
        if (cfg.fangs) {
          layer.fillRect(cx - 4, my, 2, 4, C_WHITE);
          layer.fillRect(cx + 3, my, 2, 4, C_WHITE);
          layer.setPx(cx - 4, my + 4, C_RED);
          layer.setPx(cx + 4, my + 4, C_RED);
        }
      }
    }
  }

  target.blitLayer(
    layer,
    0,
    0,
    cfg.outline ?? C_INK,
    cfg.shadow ? { dx: 1, dy: 2, color: rgba(30, 40, 48, 55) } : undefined
  );
}

/**
 * Draw ornate double-ended court-card body (used by Juggler, Drunkard, Troubadour, Shoot the Moon).
 */
function drawCourtPortrait(
  cell: PixelCell,
  cfg: {
    robe1: RGBA;
    robe2: RGBA;
    trim: RGBA;
    hat: RGBA;
    prop: 'pins' | 'bottles' | 'lute' | 'scepter';
  }
): void {
  const layer = new PixelCell(CELL_W, CELL_H);
  const cx = 35;
  // Upper half royal jester figure
  layer.fillPolygon(
    [
      [cx - 14, 48],
      [cx - 12, 26],
      [cx + 12, 26],
      [cx + 14, 48],
    ],
    cfg.robe1
  );
  // Diagonal sash
  layer.drawLine(cx - 11, 28, cx + 11, 46, cfg.robe2, 2.5);
  layer.drawLine(cx - 10, 29, cx + 10, 45, cfg.trim, 0.9);
  // Lower mirrored court half (classic playing-card symmetry!)
  layer.fillPolygon(
    [
      [cx - 14, 48],
      [cx - 12, 70],
      [cx + 12, 70],
      [cx + 14, 48],
    ],
    cfg.robe2
  );
  layer.drawLine(cx - 11, 68, cx + 11, 50, cfg.robe1, 2.5);
  layer.drawLine(cx - 10, 67, cx + 10, 51, cfg.trim, 0.9);

  // Belt divider
  layer.fillRect(cx - 14, 46, 29, 4, cfg.trim);
  layer.fillRect(cx - 14, 47, 29, 2, shadeCol(cfg.trim, 1.3));

  // Upper & lower mirrored heads + hats
  for (const dir of [-1, 1]) {
    const hy = 48 + dir * 27;
    layer.fillShadedEllipse(cx, hy, 7, 7.5, C_WHITE, C_WHITE, C_SKIN_SHADE);
    // Simple regal face
    layer.setPx(cx - 2, hy + dir * 1, C_INK_DARK);
    layer.setPx(cx + 2, hy + dir * 1, C_INK_DARK);
    layer.fillRect(cx - 2, hy - dir * 2, 5, 2, C_RED);
    // Crown/jester cap
    drawCurvedProng(layer, cx - 5, hy + dir * 5, cx - 14, hy + dir * 10, cx - 12, hy + dir * 14, 3.2, 1.4, cfg.hat);
    drawCurvedProng(layer, cx + 5, hy + dir * 5, cx + 14, hy + dir * 10, cx + 12, hy + dir * 14, 3.2, 1.4, cfg.robe2);
    drawCurvedProng(layer, cx, hy + dir * 6, cx, hy + dir * 14, cx + 4, hy + dir * 16, 4.2, 1.4, cfg.trim);
  }

  // Signature held props
  if (cfg.prop === 'pins') {
    // Juggling pins & balls arcing along left & right
    layer.fillShadedCircle(cx - 18, 30, 3, C_RED_HI, C_RED, C_RED_DARK);
    layer.fillShadedCircle(cx + 18, 22, 3, C_GOLD_HI, C_GOLD, C_GOLD_DARK);
    layer.fillShadedCircle(cx - 18, 66, 3, C_BLUE_HI, C_BLUE, C_BLUE_DARK);
    layer.fillShadedCircle(cx + 18, 56, 3, C_RED_HI, C_RED, C_RED_DARK);
    layer.drawLine(cx + 18, 25, cx + 18, 38, C_GOLD, 1.2);
    layer.drawLine(cx - 18, 53, cx - 18, 63, C_BLUE, 1.2);
  } else if (cfg.prop === 'bottles') {
    // Tipping amber bottles
    for (const [bx, by, tilt] of [
      [cx + 16, 28, 1],
      [cx - 16, 65, -1],
    ] as const) {
      layer.drawLine(bx, by, bx + tilt * 6, by - tilt * 10, C_GOLD_DARK, 2.4);
      layer.drawLine(bx + tilt * 5, by - tilt * 9, bx + tilt * 8, by - tilt * 14, C_GOLD, 1.1);
      layer.setPx(bx + tilt * 8, by - tilt * 15, C_GREEN);
    }
  } else if (cfg.prop === 'lute') {
    // Diagonal wooden lute across torso
    layer.fillShadedEllipse(cx - 8, 54, 7.5, 9, hex('#d9a05b'), hex('#a86b32'), hex('#6e4119'));
    layer.fillCircle(cx - 8, 53, 2.6, hex('#42260d'));
    layer.drawLine(cx - 2, 48, cx + 17, 30, hex('#8c5523'), 1.8);
    layer.drawLine(cx - 7, 53, cx + 16, 31, hex('#f7e4b5'), 0.4);
  } else if (cfg.prop === 'scepter') {
    // Golden crescent-moon scepter
    layer.drawLine(cx + 16, 20, cx + 16, 76, C_GOLD_DARK, 1.4);
    layer.drawLine(cx + 15, 20, cx + 15, 76, C_GOLD_HI, 0.7);
    layer.fillCircle(cx + 16, 22, 5.5, C_GOLD);
    layer.fillCircle(cx + 19, 21, 4.2, C_WHITE);
    layer.fillCircle(cx + 16, 74, 3.2, C_BLUE);
  }

  cell.blitLayer(layer, 0, 0, C_INK);
}

// ---------------------------------------------------------------------------
// Per-Cell Registry for All 150 Jokers + Row 9 Soul/System Layers
// ---------------------------------------------------------------------------

type CellPainter = (cell: PixelCell) => void;
const JOKER_PAINTERS = new Map<string, CellPainter>();

function reg(gx: number, gy: number, fn: CellPainter): void {
  JOKER_PAINTERS.set(`${gx},${gy}`, fn);
}

// ============================================================================
// ROW 0 (y = 0): Jimbo/Wee, Chaos, Jolly, Zany, Mad, Crazy, Droll, Half, Merry Andy, Stone
// ============================================================================

// (0,0) Joker (Jimbo) & Wee Joker
reg(0, 0, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    hatCenter: C_RED,
    hatSide: C_GOLD,
    hatSideR: C_GOLD,
    bell: C_GOLD_HI,
    collar: C_BLUE,
    browCol: C_GOLD_DARK,
    smileCol: C_RED,
    eyeCol: C_INK_DARK,
    expr: 'jimbo',
  });
});

// (1,0) Chaos the Clown
reg(1, 0, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  // Orange-gold striped clown puffer collar + blue polka-dot bow tie
  const layer = new PixelCell();
  layer.fillShadedEllipse(35, 65, 19, 10, hex('#ffb732'), hex('#ee8d15'), hex('#b86008'));
  for (let x = 19; x <= 51; x += 5) {
    layer.drawLine(x, 56, x, 74, hex('#c4680a'));
  }
  layer.fillRect(32, 57, 7, 17, hex('#fff2cc'));
  layer.fillCircle(35, 63, 1.5, C_RED);
  layer.fillCircle(35, 69, 1.5, C_BLUE);
  // Blue polka-dot bowtie
  layer.fillPolygon([[23, 56], [35, 61], [23, 66]], C_BLUE);
  layer.fillPolygon([[47, 56], [35, 61], [47, 66]], C_BLUE);
  layer.fillCircle(35, 61, 2.2, C_BLUE_DARK);
  for (const [dx, dy] of [[-8, -1], [-5, 2], [6, -1], [8, 2]] as const) {
    layer.setPx(35 + dx, 61 + dy, C_GOLD_HI);
  }
  cell.blitLayer(layer, 0, 0, C_INK);

  drawJester(cell, {
    cy: 44,
    hatStyle: 'clown',
    collarStyle: 'minimal',
    hatCenter: hex('#3b9e6c'),
    hatSide: hex('#3b9e6c'),
    collar: rgba(0, 0, 0, 0),
    browCol: hex('#2d8056'),
    smileCol: C_RED,
    eyeCol: C_INK_DARK,
    redNose: true,
    expr: 'jolly',
  });
});

// (2,0) Jolly Joker (Pair Mult)
reg(2, 0, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    cy: 43,
    hatCenter: hex('#4f6b85'),
    hatSide: hex('#69a8d6'),
    collar: hex('#7dbce8'),
    browCol: hex('#4f6b85'),
    smileCol: C_RED,
    expr: 'jolly',
  });
  drawMiniCardFan(cell, 2, 'white', 82);
});

// (3,0) Zany Joker (3oaK Mult)
reg(3, 0, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    cy: 43,
    hatCenter: hex('#4c7c66'),
    hatSide: hex('#a6bd52'),
    collar: hex('#7eb59d'),
    browCol: hex('#3b6350'),
    smileCol: C_RED,
    expr: 'zany',
  });
  drawMiniCardFan(cell, 3, 'white', 82);
});

// (4,0) Mad Joker (Two Pair Mult)
reg(4, 0, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    cy: 43,
    hatCenter: hex('#d97d6c'),
    hatSide: hex('#cf5b6e'),
    collar: hex('#de6c7c'),
    browCol: hex('#9e3344'),
    smileCol: C_RED_DARK,
    expr: 'mad',
  });
  drawMiniCardFan(cell, 4, 'white', 82);
});

// (5,0) Crazy Joker (Straight Mult)
reg(5, 0, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    cy: 43,
    hatCenter: hex('#e86a4a'),
    hatSide: hex('#4db8d9'),
    collar: hex('#f2d672'),
    browCol: hex('#c74d2e'),
    smileCol: C_RED,
    expr: 'crazy',
  });
  drawMiniCardFan(cell, 5, 'straight', 82);
});

// (6,0) Droll Joker (Flush Mult)
reg(6, 0, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    cy: 43,
    hatCenter: hex('#e04c4c'),
    hatSide: hex('#434d54'),
    collar: hex('#dce2e6'),
    browCol: hex('#374244'),
    smileCol: C_RED_DARK,
    expr: 'droll',
  });
  drawMiniCardFan(cell, 5, 'flushRed', 82);
});

// (7,0) Half Joker — Torn top half of Jimbo card, bottom transparent!
reg(7, 0, (cell) => {
  // First render full classic Jimbo
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK, { right: false });
  drawJester(cell, {
    cy: 46,
    hatCenter: C_RED,
    hatSide: C_GOLD,
    collar: C_BLUE,
    browCol: C_GOLD_DARK,
    smileCol: C_RED,
    expr: 'jimbo',
  });
  // Tear off lower portion along a crisp organic jagged paper rip line (~y = 55..61)
  cell.mask = null;
  for (let x = 0; x < CELL_W; x++) {
    const rip =
      57 +
      Math.round(
        Math.sin(x * 0.42) * 2.2 +
          Math.cos(x * 1.15) * 1.4 +
          (hash2(x, 7, 13) - 0.5) * 2.2
      );
    // Subtle torn-paper fibrous shadow on the rip edge
    if (x >= 2 && x <= 68 && rip - 1 >= 0) {
      cell.setPx(x, rip - 1, C_CARD_LIP);
      cell.setPx(x, rip, C_CARD_BORDER);
    }
    for (let y = rip + 1; y < CELL_H; y++) {
      cell.clearPx(x, y);
    }
  }
});

// (8,0) Merry Andy
reg(8, 0, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    cy: 47,
    hatStyle: 'harlequin',
    collarStyle: 'pleated',
    hatCenter: C_RED,
    hatSide: C_GOLD,
    hatSideR: C_GOLD,
    collar: C_WHITE,
    collarAlt: C_GOLD_DARK,
    cheek: hex('#ffb5ad'),
    redNose: true,
    browCol: C_BLUE_DARK,
    smileCol: C_RED,
    expr: 'jolly',
  });
  // Colorful festive ribbon band on collar
  cell.drawQuadBezier(20, 62, 35, 69, 50, 62, C_BLUE, 1.3, 1.3);
  cell.drawQuadBezier(21, 60, 35, 67, 49, 60, C_RED, 0.9, 0.9);
});

// (9,0) Stone Joker — Weathered cracked granite tablet over faded Jimbo relief
reg(9, 0, (cell) => {
  initCard(cell, hex('#c4ccd4'), hex('#79848e'));
  // Stone speckled surface
  for (let y = 2; y <= 92; y++) {
    for (let x = 2; x <= 68; x++) {
      const h = hash2(x, y, 90);
      const col =
        h < 0.18
          ? hex('#aeb7c0')
          : h > 0.85
            ? hex('#dce2e8')
            : hex('#c4ccd4');
      cell.setPx(x, y, col);
    }
  }
  // Relief Jimbo carved faintly into granite
  drawJester(cell, {
    hatCenter: hex('#d47f78'),
    hatSide: hex('#d6ba78'),
    collar: hex('#73a8cc'),
    face: hex('#d5dce2'),
    faceShade: hex('#b5bfc8'),
    browCol: hex('#8c96a0'),
    smileCol: hex('#c96b64'),
    outline: hex('#78838c'),
  });
  // Bold chiseled stone cracks crisscrossing across the card
  const cracks: Array<[number, number, number, number]> = [
    [3, 18, 24, 29],
    [24, 29, 38, 22],
    [38, 22, 66, 36],
    [24, 29, 17, 52],
    [17, 52, 4, 58],
    [17, 52, 46, 62],
    [46, 62, 67, 56],
    [46, 62, 55, 89],
    [28, 72, 12, 91],
  ];
  for (const [x0, y0, x1, y1] of cracks) {
    cell.drawLine(x0, y0 + 1, x1, y1 + 1, hex('#eef2f6'));
    cell.drawLine(x0, y0, x1, y1, hex('#6c7680'), 0.6);
  }
  // Chipped edge notches
  cell.mask = null;
  cell.clearPx(1, 22);
  cell.clearPx(2, 22);
  cell.clearPx(69, 55);
  cell.clearPx(68, 56);
});

// ============================================================================
// ROW 1 (y = 1): Juggler, Drunkard, Acrobat, Sock & Buskin, Mime, Credit Card, 4 Suit Sin Jokers
// ============================================================================

// (0,1) Juggler
reg(0, 1, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawCourtPortrait(cell, {
    robe1: C_BLUE,
    robe2: C_RED,
    trim: C_GOLD,
    hat: C_GOLD,
    prop: 'pins',
  });
});

// (1,1) Drunkard
reg(1, 1, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawCourtPortrait(cell, {
    robe1: hex('#2e8555'),
    robe2: C_RED_DARK,
    trim: hex('#e6c25c'),
    hat: C_RED,
    prop: 'bottles',
  });
});

// (2,1) Acrobat — Trapeze ropes, leaping blue acrobat, upside-down red acrobat + golden hoop
reg(2, 1, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  // Twin vertical trapeze ropes
  cell.fillRect(24, 3, 2, 88, C_INK_SOFT);
  cell.fillRect(46, 3, 2, 88, C_INK_SOFT);
  const layer = new PixelCell();
  // Top blue acrobat leaping gracefully across ropes
  layer.fillCircle(35, 19, 3.2, C_BLUE);
  layer.drawLine(35, 22, 34, 31, C_BLUE, 2.2); // torso
  layer.drawLine(34, 24, 24, 20, C_BLUE, 1.4); // left arm gripping rope
  layer.drawLine(35, 24, 45, 18, C_BLUE, 1.4); // right arm reaching
  layer.drawLine(34, 30, 22, 36, C_BLUE, 1.6); // left extended leg
  layer.drawLine(34, 30, 48, 37, C_BLUE, 1.6); // right extended leg
  // Mid red acrobat hanging inverted holding golden aerial hoop!
  layer.drawLine(25, 48, 45, 48, C_RED, 1.6); // extended horizontal legs across ropes
  layer.drawLine(35, 48, 35, 57, C_RED, 2.2); // inverted torso
  layer.fillCircle(32, 57, 3.0, C_RED); // inverted head
  layer.drawLine(36, 56, 36, 62, C_RED, 1.4); // reaching hand to hoop
  // Golden aerial hoop below
  for (let a = 0; a < 40; a++) {
    const ang = (a / 40) * Math.PI * 2;
    layer.fillCircle(36 + Math.cos(ang) * 9, 71 + Math.sin(ang) * 9, 1.5, C_GOLD);
  }
  for (let a = 0; a < 28; a++) {
    const ang = (a / 28) * Math.PI * 2;
    layer.setPx(36 + Math.cos(ang) * 8.5, 70.5 + Math.sin(ang) * 8.5, C_GOLD_HI);
  }
  cell.blitLayer(layer, 0, 0);
});

// (3,1) Sock and Buskin — Iconic B&W split comedy/tragedy theatrical profiles!
reg(3, 1, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    // Organic sculpted Comedy/Tragedy silhouette divider down center!
    for (let y = 3; y <= 91; y++) {
      let splitX = 37;
      if (y >= 16 && y <= 38) {
        // Upper dark Tragedy profile forehead/nose/brow jutting left
        splitX = 35 - Math.round(Math.sin(((y - 16) / 22) * Math.PI) * 5);
        if (y >= 26 && y <= 31) splitX -= 3; // sculpted nose bridge
      } else if (y > 38 && y <= 74) {
        // Lower white Comedy face smiling right into dark half
        splitX = 38 + Math.round(Math.sin(((y - 38) / 36) * Math.PI) * 5);
        if (y >= 52 && y <= 57) splitX += 3; // smiling cheek
      }
      for (let x = splitX; x <= 67; x++) {
        c.setPx(x, y, C_SLATE);
      }
    }
    // Right dark-slate Tragedy mask face (crisp white frowning theatre features)
    c.drawQuadBezier(36, 23, 41, 20, 46, 24, C_WHITE, 0.9, 0.9);
    c.fillEllipse(41, 27, 3.2, 1.7, C_WHITE);
    c.fillCircle(40, 27, 1.1, C_SLATE);
    c.drawQuadBezier(34, 37, 41, 33, 47, 38, C_WHITE, 1.4, 1.4);
    // Left bright-white Comedy mask face (crisp dark laughing theatre features)
    c.drawQuadBezier(21, 53, 26, 49, 32, 53, C_SLATE, 0.9, 0.9);
    c.drawQuadBezier(22, 57, 26, 54, 31, 57, C_SLATE, 1.0, 1.0);
    c.drawQuadBezier(19, 63, 28, 72, 37, 62, C_SLATE, 1.8, 1.8);
    c.drawQuadBezier(22, 64, 28, 68, 34, 63, C_WHITE, 0.9, 0.9);
  });
  drawJokerMargins(cell, C_INK, { right: false });
  drawJokerMargins(cell, C_WHITE, { left: false });
});

// (4,1) Mime — Expressive monochrome beret mime with red neckerchief
reg(4, 1, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  const layer = new PixelCell();
  // Red knotted neckerchief
  layer.drawQuadBezier(22, 67, 35, 76, 48, 66, C_RED, 2.5, 2.5);
  layer.drawQuadBezier(22, 67, 18, 72, 16, 76, C_RED_DARK, 2.2, 1.4);
  layer.fillCircle(23, 67, 2.8, C_RED_HI);
  // Sculpted pale oval mime head
  layer.fillShadedEllipse(36, 47, 13, 16, C_WHITE, hex('#f7f9fc'), hex('#d3dce6'), -0.35, -0.45);
  // Dark slanted French beret
  layer.fillShadedEllipse(34, 29, 16, 7.5, hex('#58656e'), hex('#374244'), hex('#222a2e'));
  layer.fillEllipse(24, 33, 6, 4, hex('#374244'));
  layer.drawLine(34, 21, 36, 24, hex('#222a2e'), 1.2);
  // Iconic mime diamond tear makeup around eyes
  layer.fillPolygon([[29, 39], [31, 44], [29, 50], [27, 44]], C_INK);
  layer.fillPolygon([[43, 39], [45, 44], [43, 50], [41, 44]], C_INK);
  layer.fillCircle(29, 44, 1.8, C_WHITE);
  layer.fillCircle(43, 44, 1.8, C_WHITE);
  layer.setPx(29, 44, C_INK_DARK);
  layer.setPx(43, 44, C_INK_DARK);
  // Arched thin brows & delicate crimson bow lips
  layer.drawQuadBezier(25, 38, 29, 35, 33, 38, C_INK, 0.7, 0.7);
  layer.drawQuadBezier(39, 38, 43, 35, 47, 38, C_INK, 0.7, 0.7);
  layer.fillEllipse(36, 55, 3.6, 1.8, C_RED);
  layer.drawLine(32, 55, 40, 55, C_RED_DARK);
  cell.blitLayer(layer, 0, 0, hex('#c4ced8'));
});

// (5,1) Credit Card — Sideways glossy rose-gold embossed bank card!
reg(5, 1, (cell) => {
  initCard(cell, hex('#d4536a'), hex('#993548'));
  // Left gold metallic strip + glossy wavy rose-magenta gradient body
  for (let y = 2; y <= 92; y++) {
    for (let x = 2; x <= 68; x++) {
      if (x < 18) {
        const t = (y - 2) / 90;
        cell.ditherPx(x, y, hex('#f0b650'), hex('#d98d2b'), t);
      } else {
        const wave = Math.sin(y * 0.08 + x * 0.05) * 0.25 + (x - 18) / 52;
        if (wave < 0.48) cell.ditherPx(x, y, hex('#d64e62'), hex('#bf3e68'), wave / 0.48);
        else cell.ditherPx(x, y, hex('#bf3e68'), hex('#92386c'), (wave - 0.48) / 0.52);
      }
    }
  }
  // White divider line
  cell.fillRect(18, 2, 2, 91, hex('#f7e8d4'));
  // Embossed golden EMV chip
  cell.fillRect(28, 12, 12, 16, C_GOLD);
  cell.strokeRect(28, 12, 12, 16, C_GOLD_DARK);
  cell.fillRect(30, 14, 8, 12, C_GOLD_HI);
  cell.fillRect(33, 12, 2, 16, C_GOLD_DARK);
  cell.fillRect(28, 17, 12, 1, C_GOLD_DARK);
  cell.fillRect(28, 22, 12, 1, C_GOLD_DARK);
  // Contactless wave icon next to chip
  for (let r = 3; r <= 7; r += 2) {
    for (let a = -0.8; a <= 0.8; a += 0.15) {
      cell.setPx(34 + Math.sin(a) * r, 32 + Math.cos(a) * r, C_WHITE);
    }
  }
  // Sideways cardholder name, digits, and bold BANK GOLD header!
  drawSidewaysText(cell, 'J. JOKER JR.', 7, 10, C_INK_DARK, 'cw', 1);
  drawSidewaysText(cell, '8675 3094 2069 1234', 21, 10, hex('#fff2e6'), 'cw', 1);
  drawSidewaysText(cell, 'BANK GOLD', 50, 9, hex('#4f3148'), 'cw', 2);
  drawSidewaysText(cell, 'BANK GOLD', 49, 8, hex('#f7c752'), 'cw', 2);
  // Hologram mini seal on bottom left
  cell.fillCircle(9, 84, 4, C_BLUE);
  cell.fillCircle(11, 82, 3, C_RED);
});

// (6,1) Greedy Joker (Diamonds)
reg(6, 1, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => drawSuitTileBg(c, 'Diamonds', hex('#e6812c'), hex('#c96116')));
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#8a3c08') });
  drawJester(cell, {
    hatCenter: hex('#e8994f'),
    hatSide: hex('#d97828'),
    collar: hex('#f2b579'),
    face: hex('#ffe4c4'),
    faceShade: hex('#e6b685'),
    browCol: hex('#9e4c0e'),
    smileCol: hex('#c44d14'),
    eyeCol: hex('#5e2906'),
    outline: hex('#6e3108'),
    shadow: true,
  });
});

// (7,1) Lusty Joker (Hearts)
reg(7, 1, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => drawSuitTileBg(c, 'Hearts', hex('#f04a4a'), hex('#c92a35')));
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#851722') });
  drawJester(cell, {
    hatCenter: hex('#ff6e75'),
    hatSide: hex('#e6404e'),
    collar: hex('#ff9ca3'),
    face: hex('#ffe3e6'),
    faceShade: hex('#f0b4bc'),
    browCol: hex('#a61d2e'),
    smileCol: hex('#d9253b'),
    eyeCol: hex('#63101a'),
    outline: hex('#73121e'),
    shadow: true,
  });
});

// (8,1) Wrathful Joker (Spades)
reg(8, 1, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => drawSuitTileBg(c, 'Spades', hex('#6362a8'), hex('#484685')));
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#2b2957') });
  drawJester(cell, {
    hatCenter: hex('#7a78bf'),
    hatSide: hex('#585699'),
    collar: hex('#9c9ad9'),
    face: hex('#e8e7ff'),
    faceShade: hex('#c0bee8'),
    browCol: hex('#37356e'),
    smileCol: hex('#4e4b91'),
    eyeCol: hex('#262452'),
    outline: hex('#2e2b5e'),
    expr: 'mad',
    shadow: true,
  });
});

// (9,1) Gluttonous Joker (Clubs)
reg(9, 1, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => drawSuitTileBg(c, 'Clubs', hex('#2b8c76'), hex('#1d6b59')));
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#0e4236') });
  drawJester(cell, {
    hatCenter: hex('#48ad94'),
    hatSide: hex('#2c8570'),
    collar: hex('#75ccb6'),
    face: hex('#e0faf2'),
    faceShade: hex('#b0decb'),
    browCol: hex('#165445'),
    smileCol: hex('#1c6b58'),
    eyeCol: hex('#0f3d32'),
    outline: hex('#11473a'),
    shadow: true,
  });
});

// ============================================================================
// ROW 2 (y = 2): Troubadour, Banner, Mystic Summit, Marble, Loyalty Card, Hack, Misprint, Steel, Raised Fist, Golden
// ============================================================================

// (0,2) Troubadour
reg(0, 2, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawCourtPortrait(cell, {
    robe1: hex('#3f8252'),
    robe2: hex('#9c3b4c'),
    trim: hex('#e6b84c'),
    hat: hex('#3f574a'),
    prop: 'lute',
  });
});

// (1,2) Banner — Diagonal flagpole with bold waving red-gold-white ribbon pennant
reg(1, 2, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    // Soft pale sky halftone backdrop
    c.fillDitherGradV(3, 3, 65, 89, hex('#f0f5f7'), hex('#dbe4eb'));
  });
  drawJokerMargins(cell, C_INK);
  const layer = new PixelCell();
  // Diagonal dark steel flagpole
  layer.drawLine(17, 13, 44, 89, hex('#4a5860'), 1.6);
  layer.drawLine(16, 13, 43, 89, hex('#7d8f99'), 0.6);
  layer.fillCircle(17, 12, 2.5, C_GOLD);
  // Flowing S-curve banner pennant ribbon
  const colors = [C_RED, C_GOLD, C_WHITE, C_RED_DARK, C_GOLD_HI];
  for (let t = 0; t <= 48; t++) {
    const u = t / 48;
    const bx = 19 + u * 35 + Math.sin(u * 5.2) * 8;
    const by = 15 + u * 52 + Math.cos(u * 4.5) * 4;
    const halfH = Math.max(2, 8 * (1 - u * 0.55));
    const col = colors[Math.floor(u * 10) % colors.length]!;
    layer.fillRect(bx - 2, by - halfH, 4, halfH * 2, col);
  }
  cell.blitLayer(layer, 0, 0, C_INK);
});

// (2,2) Mystic Summit — Misty pastel sky with levitating stones rising from mountain peak
reg(2, 2, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillDitherStopsV(3, 3, 65, 89, [hex('#e6e2f5'), hex('#d3e2eb'), hex('#9fb8c4')]);
    // Swirling wispy mist bands
    for (let y = 18; y < 65; y += 9) {
      c.drawQuadBezier(6, y, 36, y - 5, 65, y + 2, rgba(255, 255, 255, 110), 2.2, 1.5);
    }
    // Mountain crag silhouette rising from bottom
    c.fillPolygon([[3, 91], [3, 66], [24, 53], [36, 48], [52, 59], [67, 68], [67, 91]], hex('#5c7d85'));
    c.fillPolygon([[18, 91], [34, 52], [44, 62], [67, 74], [67, 91]], hex('#47646c'));
    c.fillPolygon([[3, 91], [15, 72], [32, 65], [48, 79], [67, 91]], hex('#385259'));
    // Floating levitating rocks rising into sky
    const rocks: Array<[number, number, number, number]> = [
      [35, 39, 9, 4],
      [29, 30, 6, 3],
      [41, 23, 7, 3.5],
      [33, 15, 5, 2.5],
      [47, 35, 4, 2],
      [22, 41, 4, 2],
      [38, 9, 3.5, 2],
    ];
    for (const [rx, ry, rw, rh] of rocks) {
      c.fillShadedEllipse(rx, ry, rw, rh, hex('#87a6b0'), hex('#597780'), hex('#364c54'));
    }
  });
  drawJokerMargins(cell, C_INK);
});

// (3,2) Marble Joker — Polished cream-ivory Carrara marble statue jester
reg(3, 2, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  const layer = new PixelCell();
  drawJester(layer, {
    hatCenter: hex('#e8e2d5'),
    hatSide: hex('#d9d1c1'),
    collar: hex('#ded7c8'),
    face: hex('#f5f1e6'),
    faceShade: hex('#cfc6b4'),
    browCol: hex('#a89e8c'),
    smileCol: hex('#b5ab98'),
    eyeCol: hex('#9c9280'),
    bell: hex('#d6cdb8'),
    outline: hex('#8c8374'),
  });
  // Delicate grey marble veins etched across statue pixels
  for (let y = 14; y < 80; y++) {
    for (let x = 14; x < 58; x++) {
      if (layer.getA(x, y) < 200) continue;
      const vein = Math.abs(Math.sin(x * 0.17 + Math.sin(y * 0.13) * 2.1 + y * 0.08));
      if (vein < 0.08) {
        layer.setPx(x, y, mixCol(layer.getPx(x, y), hex('#8a8378'), 0.45));
      }
    }
  }
  cell.blitLayer(layer, 0, 0);
});

// (4,2) Loyalty Card — Vintage cream deli punch card with 10 red circles & bold red stamp
reg(4, 2, (cell) => {
  initCard(cell, hex('#f2f0eb'), C_CARD_BORDER, C_CARD_LIP);
  // Delicate diagonal paper grain
  for (let y = 3; y < 92; y++) {
    for (let x = 3; x < 68; x++) {
      if ((x + y) % 7 === 0) cell.setPx(x, y, hex('#e6e3dc'));
    }
  }
  // 2 columns x 5 rows of circular deli punch rings on left
  for (let col = 0; col < 2; col++) {
    for (let row = 0; row < 5; row++) {
      const cx = 11 + col * 13;
      const cy = 15 + row * 16;
      for (let a = 0; a < 24; a++) {
        const ang = (a / 24) * Math.PI * 2;
        cell.setPx(cx + Math.cos(ang) * 4.2, cy + Math.sin(ang) * 4.2, C_RED);
      }
      // First 2 holes punched through
      if (col === 1 && row === 0) {
        cell.fillCircle(cx, cy, 3.2, hex('#d4dce3'));
      }
    }
  }
  // Sideways bold red deli badge on right
  cell.fillEllipse(51, 47, 14, 34, C_RED);
  cell.fillEllipse(51, 47, 11, 30, hex('#f2f0eb'));
  cell.fillEllipse(51, 47, 9, 27, C_RED);
  drawSidewaysText(cell, 'JOKERS', 51, 26, C_WHITE, 'cw', 1);
  drawSidewaysText(cell, 'DELI', 43, 38, C_GOLD_HI, 'cw', 1);
  drawSidewaysText(cell, 'LOYALTY CARD', 32, 22, C_INK, 'cw', 1);
});

// (5,2) Hack — Stand-up comedy club brick wall, spotlight, wooden stage & dorky comic with mic!
reg(5, 2, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    // Terracotta brick wall backdrop
    c.fillRect(3, 3, 65, 68, hex('#a64538'));
    for (let y = 5; y < 68; y += 6) {
      c.fillRect(3, y, 65, 1, hex('#7a2f26'));
      const off = (Math.floor(y / 6) % 2) * 6;
      for (let x = 3 + off; x < 67; x += 12) {
        c.fillRect(x, y, 1, 6, hex('#7a2f26'));
      }
    }
    // Red side stage curtains
    c.fillRect(3, 3, 9, 66, hex('#87202b'));
    c.fillRect(59, 3, 9, 66, hex('#87202b'));
    c.fillRect(11, 3, 2, 66, hex('#c43542'));
    c.fillRect(58, 3, 2, 66, hex('#c43542'));
    // Wooden comedy stage floor
    c.fillRect(3, 69, 65, 23, hex('#7d613b'));
    c.fillRect(3, 69, 65, 3, hex('#a38352'));
    c.fillRect(3, 76, 65, 16, hex('#5c4629'));
    // Soft conical spotlight glow
    for (let y = 6; y < 74; y++) {
      const hw = 4 + (y - 6) * 0.28;
      for (let x = Math.round(35 - hw); x <= Math.round(35 + hw); x++) {
        c.setPx(x, y, rgba(255, 240, 190, 38));
      }
    }
    // Stand-up comedian in teal blazer, grey pants, orange hair + mic stand
    const p = new PixelCell();
    // Legs & sneakers
    p.fillRect(31, 51, 4, 19, hex('#4f5e66'));
    p.fillRect(36, 51, 4, 19, hex('#3c484f'));
    p.fillRect(29, 69, 6, 3, C_WHITE);
    p.fillRect(36, 69, 6, 3, C_WHITE);
    // Blue blazer & white shirt
    p.fillRect(27, 31, 16, 21, hex('#1a99e0'));
    p.fillRect(33, 31, 4, 14, C_WHITE);
    p.fillRect(25, 33, 4, 14, hex('#147ab5'));
    // Arm holding mic
    p.drawLine(41, 34, 47, 30, hex('#1a99e0'), 2);
    p.fillCircle(48, 29, 1.8, C_SKIN_WARM);
    // Head + curly orange clown hair
    p.fillShadedEllipse(35, 24, 5.5, 6.2, C_WHITE, C_SKIN_WARM, C_SKIN_WARM_SH);
    p.fillCircle(31, 20, 3.2, C_GOLD);
    p.fillCircle(35, 18, 3.5, hex('#f29c24'));
    p.fillCircle(39, 20, 3.2, C_GOLD);
    p.setPx(33, 24, C_INK_DARK);
    p.setPx(37, 24, C_INK_DARK);
    p.fillRect(33, 27, 5, 1, C_RED);
    // Microphone & stand
    p.fillRect(46, 30, 2, 41, C_INK_DARK);
    p.fillRect(42, 70, 10, 2, C_INK_DARK);
    p.fillCircle(47, 28, 2, hex('#a8b8c4'));
    c.blitLayer(p, 0, 0, C_INK_DARK);
  });
  drawJokerMargins(cell, C_WHITE, { shadow: C_INK_DARK });
});

// (6,2) Misprint — Shifted glitch-printed Jimbo with CMYK calibration bars on left!
reg(6, 2, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  // Printing press registration strip on left
  cell.fillRect(20, 3, 1, 89, C_CARD_BORDER);
  const swatches = [C_BLUE, C_RED, C_GOLD, hex('#222a2e'), hex('#5c6b73'), hex('#9aa8b2'), hex('#cfd7de')];
  for (let i = 0; i < swatches.length; i++) {
    cell.fillRect(15, 6 + i * 9, 4, 7, swatches[i]!);
  }
  // Misaligned vertical JOKER text shifted down & inward
  drawJokerMargins(cell, C_INK, { left: true, right: false, yTop: 48 });
  // Draw Jimbo shifted +22px to the right so he authentically clips off the print edge!
  const shifted = new PixelCell();
  drawJester(shifted, {
    cx: 57,
    cy: 47,
    hatCenter: C_RED,
    hatSide: C_GOLD,
    collar: C_BLUE,
    browCol: C_GOLD_DARK,
    smileCol: C_RED,
  });
  // Slight horizontal RGB print misregistration offset!
  for (let y = 3; y < 91; y++) {
    for (let x = 22; x < 68; x++) {
      if (shifted.getA(x, y) > 0) {
        cell.setPx(x, y, shifted.getPx(x, y));
      }
    }
  }
  // Extra top-left JOKER clipped right of registration bar
  drawMicroText(cell, 'J', 24, 7, C_INK);
  drawMicroText(cell, 'O', 24, 14, C_INK);
  drawMicroText(cell, 'K', 24, 21, C_INK);
});

// (7,2) Steel Joker — Brushed metallic silver-chrome card with embossed steel jester
reg(7, 2, (cell) => {
  initCard(cell, hex('#cfd8e3'), hex('#6b7a8a'), hex('#8a99a8'));
  // Brushed diagonal metallic sheen bands
  for (let y = 2; y <= 92; y++) {
    for (let x = 2; x <= 68; x++) {
      const diag = (x * 0.7 + y * 0.45) % 44;
      if (diag < 8) cell.setPx(x, y, hex('#eef3f8'));
      else if (diag < 16) cell.ditherPx(x, y, hex('#dce4ed'), hex('#eef3f8'), 0.5);
      else if (diag > 32) cell.setPx(x, y, hex('#b6c3d1'));
      else cell.setPx(x, y, hex('#cbd5e0'));
    }
  }
  // Beveled steel inner rim
  cell.strokeRect(4, 4, 63, 87, hex('#8d9cab'));
  cell.drawLine(4, 4, 66, 4, hex('#f7fafc'));
  cell.drawLine(4, 4, 4, 90, hex('#f7fafc'));
  drawJokerMargins(cell, hex('#586775'), { shadow: hex('#eef3f8') });
  drawJester(cell, {
    hatCenter: hex('#a6b4c2'),
    hatSide: hex('#b8c5d4'),
    collar: hex('#c2cedb'),
    face: hex('#e8eff5'),
    faceShade: hex('#a4b3c2'),
    browCol: hex('#6c7b8a'),
    smileCol: hex('#7c8c9c'),
    eyeCol: hex('#4f5e6b'),
    bell: hex('#dce4ed'),
    outline: hex('#566573'),
  });
});

// (8,2) Raised Fist — Retro red-and-gold sunburst rays with heroic shaded crimson fist!
reg(8, 2, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    // 14-ray sunburst centered behind fist
    for (let y = 3; y <= 91; y++) {
      for (let x = 3; x <= 67; x++) {
        const ang = Math.atan2(y - 52, x - 35);
        const ray = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 16) % 2;
        c.setPx(x, y, ray === 0 ? hex('#f5c038') : hex('#eb5344'));
      }
    }
    // Sculpted pixel-shaded crimson clenched fist rising from bottom
    const fist = new PixelCell();
    // Forearm
    fist.fillPolygon([[24, 91], [27, 56], [44, 56], [48, 91]], hex('#d63838'));
    fist.fillPolygon([[24, 91], [27, 56], [33, 56], [31, 91]], hex('#f25e52'));
    fist.fillPolygon([[40, 56], [44, 56], [48, 91], [43, 91]], hex('#9e1f24'));
    // Clenched palm & 4 folded knuckles
    fist.fillShadedEllipse(36, 42, 14, 15, hex('#ff7569'), hex('#db3b3b'), hex('#961d22'));
    for (let i = 0; i < 4; i++) {
      const kx = 24 + i * 7;
      const ky = 30 + Math.abs(i - 1.5) * 1.4;
      fist.fillShadedEllipse(kx, ky, 4.2, 6.2, hex('#ff8278'), hex('#e03e3e'), hex('#991e23'));
      fist.drawLine(kx + 3, ky - 4, kx + 3, ky + 6, hex('#7d141a'));
    }
    // Folded thumb across front
    fist.fillShadedEllipse(34, 43, 10, 4.5, hex('#ff8a80'), hex('#eb4747'), hex('#9c1e24'));
    fist.drawLine(25, 46, 43, 45, hex('#7a1419'));
    c.blitLayer(fist, 0, 0, hex('#611218'));
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#7a1c1c') });
});

// (9,2) Golden Joker — Solid gleaming 24k gold-cast jester on crisp white card
reg(9, 2, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    hatCenter: hex('#e6a82e'),
    hatSide: hex('#f2c049'),
    collar: hex('#ebaf34'),
    face: hex('#ffe484'),
    faceShade: hex('#d4921e'),
    browCol: hex('#9e640c'),
    smileCol: hex('#b57510'),
    eyeCol: hex('#6e4206'),
    bell: C_GOLD_HI,
    outline: hex('#824e08'),
  });
  // Specular metallic sparkle glints
  for (const [sx, sy] of [[31, 24], [43, 44], [25, 64]] as const) {
    cell.fillRect(sx - 2, sy, 5, 1, C_WHITE);
    cell.fillRect(sx, sy - 2, 1, 5, C_WHITE);
  }
});

// ============================================================================
// ROW 3 (y = 3): Blueprint, Glass, Scary Face, Abstract, Delayed Grat, Golden Ticket, Pareidolia, Cartomancer, Even Steven, Odd Todd
// ============================================================================

// (0,3) Blueprint — Technical cobalt-blue drafting sheet with white sketched jester facing RIGHT!
reg(0, 3, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillDitherGradV(3, 3, 65, 89, hex('#3d63c4'), hex('#2d4fa8'));
    // Crisp technical blueprint drafting grid & circuit traces
    for (let x = 9; x < 66; x += 8) c.fillRect(x, 3, 1, 89, rgba(255, 255, 255, 28));
    for (let y = 9; y < 90; y += 8) c.fillRect(3, y, 65, 1, rgba(255, 255, 255, 28));
    // Technical leader lines & nodes
    c.drawLine(6, 14, 18, 14, rgba(190, 220, 255, 140));
    c.drawLine(18, 14, 24, 20, rgba(190, 220, 255, 140));
    c.drawLine(52, 18, 62, 10, rgba(190, 220, 255, 140));
    c.drawLine(10, 78, 20, 78, rgba(190, 220, 255, 140));
    c.fillCircle(6, 14, 1.5, hex('#b8d4ff'));
    c.fillCircle(62, 10, 1.5, hex('#b8d4ff'));
    // Blueprint sketched jester looking slightly RIGHT (toward copied joker!)
    drawJester(c, {
      cx: 37,
      cy: 47,
      hatCenter: hex('#5c82e0'),
      hatSide: hex('#6c92ed'),
      collar: hex('#557bd9'),
      face: hex('#9cb8ff'),
      faceShade: hex('#6f91eb'),
      browCol: C_WHITE,
      smileCol: C_WHITE,
      eyeCol: hex('#264291'),
      bell: hex('#d4e4ff'),
      outline: hex('#dceaff'),
    });
    // Glance pupils shifted right!
    c.fillRect(33, 44, 2, 2, hex('#1d357a'));
    c.fillRect(42, 44, 2, 2, hex('#1d357a'));
  });
  drawJokerMargins(cell, C_WHITE);
});

// (1,3) Glass Joker — Translucent crystal-ice card with diagonal light sheen & pastel Jimbo
reg(1, 3, (cell) => {
  initCard(cell, hex('#eef9fc'), hex('#b8dce8'), hex('#d2eef7'));
  // Pastel crystalline Jimbo
  drawJester(cell, {
    hatCenter: hex('#ff9994'),
    hatSide: hex('#ffe08c'),
    collar: hex('#7dd4ff'),
    face: C_WHITE,
    faceShade: hex('#d6f0fa'),
    browCol: hex('#e8b85a'),
    smileCol: hex('#ff827a'),
    eyeCol: hex('#547585'),
    outline: hex('#8cb8c9'),
  });
  // Crisp diagonal translucent glass reflections slicing across the whole card
  for (let y = 3; y <= 91; y++) {
    for (let x = 3; x <= 67; x++) {
      const band = x + y;
      if ((band >= 38 && band <= 50) || (band >= 74 && band <= 80) || (band >= 112 && band <= 122)) {
        cell.setPx(x, y, rgba(255, 255, 255, 115));
      }
    }
  }
  drawJokerMargins(cell, hex('#587e8f'));
});

// (2,3) Scary Face — Haunted dark slate void with glowing crimson eyes & jagged horror grin!
reg(2, 3, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillRect(3, 3, 65, 89, hex('#374447'));
    // Subtle eerie dark radial shadows
    for (let y = 3; y <= 91; y++) {
      for (let x = 3; x <= 67; x++) {
        if (hash2(x, y, 23) < 0.08) c.setPx(x, y, hex('#2c3638'));
      }
    }
    // Towering menacing vertical flame-like glowing crimson eyes
    c.drawQuadBezier(21, 37, 25, 27, 29, 20, C_RED, 2.2, 0.8);
    c.drawQuadBezier(49, 37, 46, 26, 44, 19, C_RED, 2.2, 0.8);
    c.fillCircle(23, 34, 2.2, C_GOLD);
    c.fillCircle(47, 34, 2.2, C_GOLD);
    // Massive jagged screaming red demon grin with drippy fangs
    for (let x = 11; x <= 59; x++) {
      const u = (x - 35) / 24;
      const topY = Math.round(52 + u * u * 8);
      const botY = Math.round(77 - u * u * 11 + Math.sin(x * 1.4) * 4);
      for (let y = topY; y <= botY; y++) {
        const tooth = ((x + Math.floor(y * 0.2)) % 4 === 0) && y > topY + 2 && y < botY - 4;
        c.setPx(x, y, tooth ? hex('#2b3336') : (y % 3 === 0 ? C_RED_DARK : C_RED));
      }
    }
  });
  drawJokerMargins(cell, C_WHITE);
});

// (3,3) Abstract Joker — Dynamic modernist abstract art splash (red/cobalt/gold) + bold JOKER
reg(3, 3, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  // Sweeping cobalt wave
  cell.drawQuadBezier(3, 72, 34, 48, 67, 46, C_BLUE, 8, 5);
  cell.fillPolygon([[4, 68], [26, 42], [58, 36], [66, 47], [42, 59], [14, 72]], C_BLUE);
  // Splashing red plume top center
  cell.fillPolygon([[18, 4], [44, 4], [48, 22], [35, 36], [23, 28]], C_RED);
  // Golden diagonal comet ribbon slashing through center
  cell.drawQuadBezier(3, 66, 30, 56, 65, 35, C_GOLD, 4.5, 2.5);
  cell.drawQuadBezier(3, 64, 30, 54, 65, 33, C_GOLD_HI, 1.5, 1.0);
  // White stylized abstract face circle + geometric eye
  cell.fillCircle(32, 42, 7.5, C_WHITE);
  cell.fillCircle(30, 41, 2.5, C_INK_DARK);
  cell.fillPolygon([[24, 37], [38, 34], [32, 47]], rgba(254, 95, 85, 120));
  // Paint splatter dots
  for (const [sx, sy, sc] of [[14, 46, C_BLUE], [56, 58, C_BLUE], [52, 22, C_RED], [16, 26, C_GOLD]] as const) {
    cell.fillCircle(sx, sy, 2.2, sc);
  }
  // Crisp gallery-print serif JOKER along bottom
  drawMicroText(cell, 'JOKER', 35, 80, C_INK, { align: 'center', spacing: 3 });
});

// (4,3) Delayed Gratification — Crackling electric arcs around red-silver golden hourglass
reg(4, 3, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  // Electric blue-violet lightning arcs above & below hourglass
  for (let i = 0; i < 4; i++) {
    const sx = 22 + i * 9;
    cell.drawQuadBezier(sx, 4, sx + (i % 2 === 0 ? -5 : 5), 14, 35 + (i - 1.5) * 6, 24, C_BLUE, 0.8, 0.6);
    cell.drawQuadBezier(sx, 90, sx + (i % 2 === 0 ? 5 : -5), 80, 35 + (i - 1.5) * 6, 70, hex('#a588f5'), 0.8, 0.6);
  }
  const hg = new PixelCell();
  // Glass bulbs
  hg.fillPolygon([[22, 26], [48, 26], [38, 47], [48, 68], [22, 68], [32, 47]], hex('#d0ebfa'));
  hg.fillPolygon([[25, 28], [45, 28], [37, 46], [33, 46]], hex('#e8f7ff'));
  hg.fillPolygon([[33, 48], [37, 48], [45, 66], [25, 66]], hex('#b2ddf5'));
  // Golden flowing sand inside top & bottom cones
  hg.fillPolygon([[29, 36], [41, 36], [35, 46]], C_GOLD);
  hg.fillPolygon([[35, 51], [44, 66], [26, 66]], C_GOLD);
  hg.fillPolygon([[35, 53], [41, 66], [35, 66]], C_GOLD_DARK);
  hg.drawLine(35, 46, 35, 56, C_GOLD_HI);
  // Red endcaps
  hg.fillShadedEllipse(35, 25, 14, 4.5, C_RED_HI, C_RED, C_RED_DARK);
  hg.fillShadedEllipse(35, 69, 14, 4.5, C_RED_HI, C_RED, C_RED_DARK);
  // Specular glass streak
  hg.drawLine(27, 30, 32, 42, C_WHITE);
  hg.drawLine(28, 62, 32, 52, C_WHITE);
  cell.blitLayer(hg, 0, 0, C_INK);
});

// (5,3) Golden Ticket — Notched golden carnival ticket silhouette with serial & shimmer!
reg(5, 3, (cell) => {
  cell.clear();
  // Golden ticket silhouette with semicircular corner cutouts & scalloped top/bottom edges
  const mask = new Uint8Array(CELL_W * CELL_H);
  for (let y = 2; y <= 92; y++) {
    for (let x = 3; x <= 67; x++) {
      // 4 circular corner ticket notches
      const dTL = Math.hypot(x - 3, y - 2);
      const dTR = Math.hypot(x - 67, y - 2);
      const dBL = Math.hypot(x - 3, y - 92);
      const dBR = Math.hypot(x - 67, y - 92);
      if (dTL < 6.5 || dTR < 6.5 || dBL < 6.5 || dBR < 6.5) continue;
      // Small perforated notches along top and bottom edge
      if ((y <= 3 || y >= 91) && (x % 7 === 0 || x % 7 === 1)) continue;
      mask[y * CELL_W + x] = 1;
    }
  }
  cell.mask = mask;
  // Shimmering diagonal gold gradient
  for (let y = 2; y <= 92; y++) {
    for (let x = 3; x <= 67; x++) {
      if (!mask[y * CELL_W + x]) continue;
      const band = (x + y) % 28;
      if (band < 4) cell.setPx(x, y, hex('#ffdf80'));
      else if (band < 12) cell.setPx(x, y, hex('#f2bc52'));
      else cell.setPx(x, y, hex('#e6a83c'));
    }
  }
  // Ornate inner ticket border & header box
  cell.strokeRect(8, 8, 55, 79, hex('#ffeaad'));
  cell.strokeRect(10, 10, 51, 75, hex('#bf8120'));
  cell.fillRect(13, 13, 45, 9, hex('#d49328'));
  drawMicroText(cell, '16180339', 35, 15, hex('#fff5d4'), { align: 'center' });
  // Vertical double embossed JOKER columns inside ticket
  const letters = ['J', 'O', 'K', 'E', 'R'];
  for (let i = 0; i < 5; i++) {
    drawMicroText(cell, letters[i]!, 18, 30 + i * 10, hex('#fff2c4'), { scale: 1 });
    drawMicroText(cell, letters[4 - i]!, 49, 30 + i * 10, hex('#fff2c4'), { scale: 1 });
  }
  // Outer ticket edge border
  cell.mask = null;
  for (let y = 1; y < CELL_H - 1; y++) {
    for (let x = 1; x < CELL_W - 1; x++) {
      if (mask[y * CELL_W + x]) continue;
      if (
        mask[y * CELL_W + (x - 1)] ||
        mask[y * CELL_W + (x + 1)] ||
        mask[(y - 1) * CELL_W + x] ||
        mask[(y + 1) * CELL_W + x]
      ) {
        cell.setPx(x, y, hex('#b57b1b'));
      }
    }
  }
});

// (6,3) Pareidolia — Emerald casino felt where floating playing cards form a smiling face!
reg(6, 3, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillDitherGradV(3, 3, 65, 89, hex('#4a7d6a'), hex('#366152'));
    // Corner floating cards
    drawMiniCard(c, 18, 13, { pipCol: C_RED, pips: 2 });
    drawMiniCard(c, 44, 13, { pipCol: C_RED, pips: 3 });
    drawMiniCard(c, 55, 22, { pipCol: C_INK, pips: 1 });
    drawMiniCard(c, 22, 81, { pipCol: C_RED, pips: 1 });
    drawMiniCard(c, 46, 81, { pipCol: C_RED, pips: 2 });
    // Two central "Eye" cards
    drawMiniCard(c, 30, 39, { pipCol: C_INK, pips: 1 });
    drawMiniCard(c, 41, 39, { pipCol: C_RED, pips: 1 });
    // 5 cards curving in a big unmistakable smiling mouth!
    const smilePts: Array<[number, number]> = [
      [19, 53],
      [26, 61],
      [35, 64],
      [44, 61],
      [51, 53],
    ];
    for (let i = 0; i < smilePts.length; i++) {
      const [sx, sy] = smilePts[i]!;
      drawMiniCard(c, sx, sy, { pipCol: i % 2 === 0 ? C_RED : C_INK, pips: 2 });
    }
  });
  drawJokerMargins(cell, C_WHITE);
});

// (7,3) Cartomancer — Vintage halftone sepia tarot card frame & classical sepia jester
reg(7, 3, (cell) => {
  initCard(cell, hex('#f0d89e'), hex('#8a6b36'));
  // Classic double vintage gold-brown border
  cell.strokeRect(3, 3, 65, 89, hex('#4f3c1e'));
  cell.strokeRect(5, 5, 61, 85, hex('#c79f56'));
  // Subtle halftone vintage dots across parchment
  for (let y = 7; y < 88; y += 3) {
    for (let x = 7; x < 64; x += 3) {
      if ((x + y) % 2 === 0) cell.setPx(x, y, hex('#e0c17e'));
    }
  }
  drawJokerMargins(cell, hex('#4f3c1e'));
  drawJester(cell, {
    hatCenter: hex('#9c7d48'),
    hatSide: hex('#b5965b'),
    collar: hex('#d4b474'),
    face: hex('#f7e7be'),
    faceShade: hex('#cfb070'),
    browCol: hex('#5e4621'),
    smileCol: hex('#7d5e2c'),
    eyeCol: hex('#423015'),
    bell: hex('#f5d88c'),
    outline: hex('#4f3c1e'),
  });
});

// (8,3) Even Steven — Symmetrical twin-horned crimson jester
reg(8, 3, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    hatStyle: 'twin',
    hatCenter: C_RED,
    hatSide: C_RED,
    hatSideR: hex('#9e3038'),
    collar: C_RED,
    browCol: C_RED_DARK,
    smileCol: C_RED,
    eyeCol: C_RED_DARK,
    expr: 'jimbo',
  });
});

// (9,3) Odd Todd — Tall single-cone cobalt-blue jester
reg(9, 3, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    hatStyle: 'cone',
    hatCenter: C_BLUE,
    hatSide: C_BLUE,
    collar: C_BLUE,
    browCol: C_BLUE_DARK,
    smileCol: C_BLUE_DARK,
    eyeCol: C_BLUE_DARK,
    expr: 'jimbo',
  });
});

// ============================================================================
// ROW 4 (y = 4): Scholar, Business Card, Supernova, Mr. Bones, Seeing Double, Duo, Trio, Family, Order, Tribe
// ============================================================================

function drawScholarCell(cell: PixelCell): void {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  // Scholar jester base (no default hat)
  drawJester(cell, {
    cy: 50,
    hatStyle: 'none',
    hatCenter: C_INK,
    hatSide: C_INK,
    collar: hex('#56636b'),
    bell: C_GOLD,
    browCol: C_GOLD_DARK,
    smileCol: C_RED,
    expr: 'jolly',
  });
  // Black square academic mortarboard cap + dangling gold tassel
  const cap = new PixelCell();
  cap.fillPolygon([[14, 34], [35, 25], [56, 34], [35, 42]], hex('#374247'));
  cap.fillPolygon([[17, 34], [35, 27], [53, 34], [35, 40]], hex('#4c5a61'));
  cap.fillRect(24, 38, 23, 5, hex('#2e383d'));
  // Gold button + tassel draping down left side
  cap.fillCircle(35, 33, 1.5, C_GOLD_HI);
  cap.drawQuadBezier(35, 33, 21, 35, 19, 46, C_GOLD, 0.9, 0.9);
  cap.fillRect(17, 45, 4, 6, C_GOLD_HI);
  cap.fillRect(18, 46, 2, 5, C_GOLD_DARK);
  cell.blitLayer(cap, 0, 0, C_INK_DARK);
  // Bold red teacher-graded circled "A+" stamp in top-right!
  for (let a = 0; a < 40; a++) {
    const ang = (a / 40) * Math.PI * 2;
    cell.fillCircle(53 + Math.cos(ang) * 12, 16 + Math.sin(ang) * 11, 0.7, C_RED);
  }
  drawMicroText(cell, 'A+', 54, 11, C_RED, { align: 'center', scale: 2, spacing: 1 });
}

// (0,4) Scholar
reg(0, 4, drawScholarCell);

// (1,4) Business Card — Minimalist off-white embossed cardstock with crisp sideways serif text
reg(1, 4, (cell) => {
  initCard(cell, hex('#faf7f0'), hex('#dfd8cb'), hex('#ebe5d8'));
  // Ultra-subtle luxury paper texture diagonal lines
  for (let y = 3; y <= 91; y++) {
    for (let x = 3; x <= 67; x++) {
      if ((x + y) % 9 === 0) cell.setPx(x, y, hex('#f2ede2'));
    }
  }
  // Centered vertical/sideways minimalist corporate typography
  drawSidewaysText(cell, 'JOSEPH J. JOKER', 36, 17, C_INK, 'cw', 1);
  // Subtle micro subtitle / divider line
  cell.fillRect(32, 27, 1, 40, hex('#b8b0a2'));
  drawSidewaysText(cell, 'VICE PRESIDENT', 26, 20, hex('#736c60'), 'cw', 1);
});

// (2,4) Supernova — Swirling violet cosmic nebula & brilliant exploding white-cyan starburst
reg(2, 4, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    // Deep space indigo-violet nebula bands
    drawMarbleSwirl(c, hex('#1d2038'), hex('#373a5e'), hex('#5d4e7d'), 42, 0.11, 2.2, 0.9);
    // Scattered crisp pixel stars
    for (let i = 0; i < 36; i++) {
      const sx = 6 + Math.floor(hash2(i, 2, 24) * 59);
      const sy = 6 + Math.floor(hash2(i, 5, 24) * 82);
      c.setPx(sx, sy, i % 4 === 0 ? hex('#a8f0ff') : C_WHITE);
      if (i % 9 === 0) {
        c.fillRect(sx - 1, sy, 3, 1, rgba(255, 255, 255, 160));
        c.fillRect(sx, sy - 1, 1, 3, rgba(255, 255, 255, 160));
      }
    }
    // Radiant supernova halo rings
    c.fillCircle(35, 47, 16, rgba(120, 220, 255, 32));
    c.fillCircle(35, 47, 10, rgba(190, 245, 255, 58));
    // Thin glowing shockwave ring
    for (let a = 0; a < 48; a++) {
      const ang = (a / 48) * Math.PI * 2;
      c.setPx(35 + Math.cos(ang) * 9, 47 + Math.sin(ang) * 9, hex('#9eefff'));
    }
    // Blazing diffraction spikes (vertical, horizontal & diagonal)
    c.drawLine(35, 21, 35, 73, rgba(165, 238, 255, 190));
    c.drawLine(14, 47, 56, 47, rgba(165, 238, 255, 190));
    c.drawLine(25, 37, 45, 57, rgba(215, 248, 255, 150));
    c.drawLine(45, 37, 25, 57, rgba(215, 248, 255, 150));
    c.fillCircle(35, 47, 4.5, hex('#ccf7ff'));
    c.fillCircle(35, 47, 2.5, C_WHITE);
  });
  drawJokerMargins(cell, C_WHITE);
});

// (3,4) Mr. Bones — Skeletal ivory-bone jester with grinning skull face
reg(3, 4, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    hatCenter: hex('#d9caa8'),
    hatSide: hex('#e8dcc0'),
    collar: hex('#ebe0c5'),
    face: hex('#faf6eb'),
    faceShade: hex('#cfc2a5'),
    bell: hex('#cfc09d'),
    expr: 'skull',
    outline: C_INK,
  });
});

// (4,4) Seeing Double — Swirling blue-grey vortex with mirrored dark & white Clubs
reg(4, 4, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    drawMarbleSwirl(c, hex('#6c7f8f'), hex('#9db0bf'), hex('#ccd8e0'), 44, 0.16, 2.8, -0.5);
    // Upper dark-slate Club
    const drawBigClub = (cy: number, fill: RGBA, rim: RGBA, flip: boolean) => {
      const layer = new PixelCell();
      const s = flip ? -1 : 1;
      layer.fillCircle(35, cy - s * 7, 7.2, fill);
      layer.fillCircle(27, cy + s * 2, 6.8, fill);
      layer.fillCircle(43, cy + s * 2, 6.8, fill);
      layer.fillPolygon([[35, cy + s * 3], [29, cy + s * 14], [41, cy + s * 14]], fill);
      c.blitLayer(layer, 0, 0, rim);
    };
    drawBigClub(31, hex('#3c5261'), C_WHITE, false);
    drawBigClub(63, C_WHITE, hex('#37464f'), true);
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#37464f') });
});

/**
 * Helper for the 5 Rare Hand-Type Lightning Jokers (Duo, Trio, Family, Order, Tribe).
 */
function drawLightningHandCard(
  cell: PixelCell,
  bg1: RGBA,
  bg2: RGBA,
  bolt1: RGBA,
  bolt2: RGBA,
  count: 2 | 3 | 4 | 5,
  mode: 'white' | 'straight' | 'flushRed',
  seed: number
): void {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillDitherGradV(3, 3, 65, 89, bg1, bg2);
    // Radiating jagged lightning tendrils erupting from card center!
    for (let b = 0; b < 9; b++) {
      const ang = (b / 9) * Math.PI * 2 + seed * 0.4;
      let px = 35;
      let py = 47;
      const col = b % 2 === 0 ? bolt1 : bolt2;
      for (let seg = 0; seg < 6; seg++) {
        const step = 6 + hash2(b, seg, seed) * 5;
        const jitter = (hash2(seg, b, seed + 7) - 0.5) * 0.9;
        const nx = px + Math.cos(ang + jitter) * step;
        const ny = py + Math.sin(ang + jitter) * step;
        c.drawLine(px, py, nx, ny, col, seg < 2 ? 1.1 : 0.6);
        if (seg === 2) {
          c.drawLine(nx, ny, nx + Math.cos(ang + 0.7) * 9, ny + Math.sin(ang + 0.7) * 9, bolt2, 0.5);
        }
        px = nx;
        py = ny;
      }
    }
    // Bright energy burst behind cards
    c.fillCircle(35, 47, 13, rgba(255, 255, 255, 48));
    drawMiniCardFan(c, count, mode, 47);
  });
  drawJokerMargins(cell, C_WHITE, { shadow: C_INK_DARK });
}

// (5,4) The Duo (Pair X2)
reg(5, 4, (cell) => {
  drawLightningHandCard(cell, hex('#4f7894'), hex('#365369'), hex('#88e0ff'), hex('#e8f27c'), 2, 'white', 54);
});
// (6,4) The Trio (3oaK X3)
reg(6, 4, (cell) => {
  drawLightningHandCard(cell, hex('#3c6b5e'), hex('#264a40'), hex('#d9f56c'), hex('#7ae0b0'), 3, 'white', 64);
});
// (7,4) The Family (4oaK X4)
reg(7, 4, (cell) => {
  drawLightningHandCard(cell, hex('#734237'), hex('#4f2922'), hex('#ff685c'), hex('#f5d062'), 4, 'white', 74);
});
// (8,4) The Order (Straight X3)
reg(8, 4, (cell) => {
  drawLightningHandCard(cell, hex('#466c7a'), hex('#2d4a54'), hex('#f7cf54'), hex('#ff6b57'), 5, 'straight', 84);
});
// (9,4) The Tribe (Flush X2)
reg(9, 4, (cell) => {
  drawLightningHandCard(cell, hex('#515e66'), hex('#364047'), hex('#ff5952'), hex('#a8d8eb'), 5, 'flushRed', 94);
});

// ============================================================================
// ROW 5 (y = 5): 8 Ball, Fibonacci, Stencil, Space, Matador, Ceremonial Dagger, Showman, Fortune Teller, Hit the Road, Swashbuckler
// ============================================================================

// (0,5) 8 Ball — Pastel lavender swirl with glossy black billiard 8-ball
reg(0, 5, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    drawMarbleSwirl(c, hex('#bfa6ed'), hex('#d9c9f7'), hex('#f2ebff'), 50, 0.14, 2.5, 0.5);
  });
  drawJokerMargins(cell, C_INK);
  const ball = new PixelCell();
  ball.fillShadedCircle(35, 48, 19, hex('#5c6670'), hex('#2b3238'), hex('#161a1e'));
  // Glossy curved highlight arc top-left
  ball.drawQuadBezier(22, 41, 25, 34, 33, 32, hex('#8d9aa6'), 1.2, 0.8);
  ball.setPx(25, 36, C_WHITE);
  // Crisp white 8-ball circle & bold numeral 8
  ball.fillCircle(36, 48, 9.2, C_WHITE);
  ball.fillCircle(36, 48, 8.2, hex('#f7f9fc'));
  drawMicroText(ball, '8', 36, 43, C_INK_DARK, { align: 'center', scale: 2 });
  cell.blitLayer(ball, 0, 0, hex('#1a1f24'), { dx: 1, dy: 2, color: rgba(40, 25, 65, 55) });
});

// (1,5) Fibonacci — Red & cobalt golden-ratio rectangles with gleaming logarithmic spiral!
reg(1, 5, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    // Classic golden-ratio subdivision tiles
    c.fillRect(3, 3, 65, 49, C_BLUE);
    c.fillRect(3, 52, 26, 40, hex('#2364a8'));
    c.fillRect(29, 52, 39, 40, C_RED);
    c.fillRect(14, 52, 15, 22, C_BLUE_DARK);
    c.fillRect(14, 74, 15, 18, hex('#c7424c'));
    c.fillRect(29, 52, 14, 16, hex('#2e8de6'));
    // Crisp white tile dividers
    c.fillRect(3, 51, 65, 2, C_WHITE);
    c.fillRect(28, 51, 2, 41, C_WHITE);
    c.fillRect(13, 51, 2, 41, C_WHITE);
    c.fillRect(13, 73, 17, 2, C_WHITE);
    // Smooth silver-white Fibonacci spiral curving inward!
    const spiral = new PixelCell();
    let prevX = 11;
    let prevY = 9;
    for (let i = 1; i <= 120; i++) {
      const t = i / 120;
      const theta = t * Math.PI * 3.85 - 2.3;
      const rad = 37 * Math.pow(0.28, t);
      const sx = 24 + Math.cos(theta) * rad;
      const sy = 64 + Math.sin(theta) * rad;
      if (i > 1) {
        spiral.drawLine(prevX, prevY, sx, sy, C_WHITE, 0.8);
      }
      prevX = sx;
      prevY = sy;
    }
    c.blitLayer(spiral, 0, 0, C_INK_DARK);
  });
  drawJokerMargins(cell, C_WHITE, { shadow: C_INK_DARK });
});

// (2,5) Joker Stencil — Pure white card with delicate laser-cut pale-grey stencil cutout!
reg(2, 5, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  // Subtle recessed stencil cutout (very pale white-on-white shading like die-cut paper)
  drawJester(cell, {
    hatCenter: hex('#f2f5f8'),
    hatSide: hex('#f2f5f8'),
    collar: hex('#f2f5f8'),
    face: hex('#f7f9fc'),
    faceShade: hex('#e8eef3'),
    browCol: hex('#e3e9ef'),
    smileCol: hex('#e0e7ee'),
    eyeCol: hex('#dfe6ed'),
    bell: hex('#eef2f6'),
    outline: hex('#d9e1e8'),
  });
});

// (3,5) Space Joker — Gleaming white NASA spacesuit jester with reflective dark glass visor
reg(3, 5, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  // White puffy spacesuit collar & padded dome helmet
  const suit = new PixelCell();
  // Scalloped astronaut suit shoulders
  drawJester(suit, {
    cy: 49,
    hatStyle: 'none',
    hatCenter: C_WHITE,
    hatSide: C_WHITE,
    collar: hex('#e6edf2'),
    bell: hex('#9aa8b5'),
    noFace: true,
    outline: C_INK,
  });
  // Side radio antenna on left
  suit.drawLine(17, 25, 17, 46, hex('#7d8d99'), 0.9);
  suit.fillCircle(17, 24, 2.0, C_CARD_BORDER);
  // Outer white bubble helmet
  suit.fillShadedEllipse(35, 44, 17, 17.5, C_WHITE, hex('#eef3f7'), hex('#c2cdd6'));
  // Dark tinted reflective space visor
  suit.fillShadedEllipse(35, 45, 12.5, 12.2, hex('#5d6e78'), hex('#37444c'), hex('#212a30'));
  // Subtle smiling face silhouette visible inside dark visor
  suit.fillEllipse(35, 46, 8.2, 8.5, hex('#4c5c66'));
  suit.fillCircle(32, 44, 1.5, hex('#879ba6'));
  suit.fillCircle(38, 44, 1.5, hex('#879ba6'));
  suit.drawQuadBezier(30, 49, 35, 53, 40, 49, hex('#879ba6'), 0.9, 0.9);
  // Crisp white helmet glass specular arc
  suit.drawQuadBezier(25, 39, 28, 34, 34, 34, C_WHITE, 1.0, 0.7);
  suit.fillRect(30, 59, 10, 3, hex('#8b99a6'));
  cell.blitLayer(suit, 0, 0, C_INK);
});

// (4,5) Matador — Draped crimson cape arena folds + torero montera cap & gold-braided jacket
reg(4, 5, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    // Rich flowing crimson velvet muleta cape drapes
    drawMarbleSwirl(c, hex('#cc332e'), hex('#eb4d42'), hex('#ff7066'), 54, 0.13, 1.8, -0.3);
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#7a1614') });
  // Gold-embroidered matador bolero jacket + montera hat
  const m = new PixelCell();
  // Ornate gold-braided crimson bolero collar tucked seamlessly under chin
  m.fillShadedEllipse(35, 61, 19, 12, hex('#f7c954'), hex('#d9901c'), hex('#9e5e0c'));
  m.fillPolygon([[23, 56], [35, 73], [47, 56]], C_RED_DARK);
  for (let x = 22; x <= 48; x += 5) {
    m.drawLine(x, 54, x, 70, C_GOLD_HI);
  }
  cell.blitLayer(m, 0, 0, C_INK_DARK);
  drawJester(cell, {
    cy: 47,
    hatStyle: 'none',
    collarStyle: 'minimal',
    hatCenter: C_INK,
    hatSide: C_INK,
    collar: rgba(0, 0, 0, 0),
    browCol: C_RED_DARK,
    smileCol: C_RED,
    expr: 'smirk',
  });
  // Iconic black bullfighter montera cap with rounded side lobes
  const hat = new PixelCell();
  hat.fillShadedEllipse(35, 31, 16, 6.8, hex('#58656e'), hex('#374247'), hex('#21282b'));
  hat.fillShadedCircle(20, 34, 4.5, hex('#4c5860'), hex('#2d363b'), hex('#1c2226'));
  hat.fillShadedCircle(50, 34, 4.5, hex('#4c5860'), hex('#2d363b'), hex('#1c2226'));
  cell.blitLayer(hat, 0, 0, C_INK_DARK);
});

// (5,5) Ceremonial Dagger — Moody dark-slate card with curved ritual blade & glowing emerald vines
reg(5, 5, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    drawMarbleSwirl(c, hex('#2b3d40'), hex('#3b5257'), hex('#4e6a70'), 55, 0.14, 2.0, 0.4);
  });
  drawJokerMargins(cell, C_WHITE);
  const dag = new PixelCell();
  // Curved wicked steel sacrificial blade
  dag.fillPolygon(
    [
      [28, 12],
      [42, 24],
      [44, 42],
      [39, 57],
      [30, 57],
      [27, 41],
      [31, 25],
    ],
    hex('#9eb0ba')
  );
  dag.fillPolygon([[28, 12], [35, 25], [34, 56], [30, 56], [28, 40]], hex('#d6e4eb'));
  dag.fillPolygon([[36, 26], [43, 41], [39, 56], [35, 56]], hex('#6d7f8a'));
  // Ornate curved iron crossguard & leather-wrapped handle
  dag.drawQuadBezier(20, 59, 35, 54, 50, 59, hex('#6c7a82'), 2.2, 2.2);
  dag.fillPolygon([[32, 59], [40, 59], [46, 78], [36, 80]], hex('#8c6239'));
  for (let y = 63; y <= 76; y += 4) {
    dag.drawLine(33, y, 44, y - 2, hex('#5e3d1e'));
  }
  dag.fillCircle(42, 80, 3.2, hex('#7a8a94'));
  // Glowing emerald ritual vines twisting tightly around the blade!
  dag.drawQuadBezier(21, 31, 35, 22, 47, 32, C_GREEN, 1.3, 1.1);
  dag.drawQuadBezier(48, 34, 33, 42, 20, 49, hex('#35a87a'), 1.3, 1.1);
  dag.drawQuadBezier(21, 51, 37, 63, 49, 71, C_GREEN, 1.2, 1.0);
  for (const [lx, ly] of [[24, 26], [46, 28], [23, 46], [45, 55], [47, 68]] as const) {
    dag.fillCircle(lx, ly, 2.0, hex('#7cf2bd'));
  }
  cell.blitLayer(dag, 0, 0, C_INK_DARK);
});

// (6,5) Showman — Dapper ringmaster in tall black top hat, curly white mustache & red tuxedo!
reg(6, 5, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    cy: 49,
    hatStyle: 'none',
    collarStyle: 'tux',
    hatCenter: C_INK,
    hatSide: C_INK,
    collar: C_RED,
    collarAlt: C_BLUE,
    browCol: C_GOLD_DARK,
    mustache: hex('#eef3f7'),
    smileCol: C_RED,
    expr: 'smirk',
  });
  // Tall glossy black silk top hat with crimson ribbon band
  const th = new PixelCell();
  th.fillRect(23, 14, 25, 22, hex('#2f393e'));
  th.fillRect(26, 15, 5, 20, hex('#4c5a61'));
  th.fillRect(23, 30, 25, 4, C_RED);
  th.fillShadedEllipse(35, 36, 17, 3.5, hex('#4c5a61'), hex('#2f393e'), hex('#1d2326'));
  cell.blitLayer(th, 0, 0, C_INK_DARK);
});

// (7,5) Fortune Teller — Mystic purple jester in bejeweled lilac turban with emerald brooch
reg(7, 5, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    cy: 48,
    hatStyle: 'none',
    hatCenter: C_PURPLE,
    hatSide: C_PURPLE,
    collar: hex('#8a68c7'),
    bell: C_GREEN,
    browCol: C_GOLD,
    smileCol: C_RED,
    expr: 'jolly',
  });
  // Pleated lilac-violet mystic turban with central emerald jewel & gold trim
  const turb = new PixelCell();
  turb.fillShadedEllipse(35, 31, 15, 10, hex('#c4a6f2'), hex('#8a68c7'), hex('#593b8f'));
  turb.drawQuadBezier(22, 34, 35, 24, 48, 34, hex('#6746a1'), 0.9, 0.9);
  turb.drawQuadBezier(23, 29, 35, 22, 47, 29, hex('#dac2ff'), 0.8, 0.8);
  turb.fillRect(23, 35, 25, 3, C_GOLD);
  turb.fillCircle(35, 30, 3.6, C_GOLD);
  turb.fillCircle(35, 30, 2.3, C_GREEN);
  turb.setPx(34, 29, hex('#b0ffdb'));
  cell.blitLayer(turb, 0, 0, C_INK);
});

// (8,5) Hit the Road — Scenic blue-sky highway receding into hills with yellow diamond Jack sign!
reg(8, 5, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    // Sunny sky gradient
    c.fillDitherGradV(3, 3, 65, 31, hex('#9ee0fa'), hex('#d9f2fc'));
    // Distant sage-green foothills & desert mesas
    c.fillPolygon([[3, 36], [16, 26], [30, 32], [46, 28], [67, 24], [67, 40], [3, 40]], hex('#8cb88a'));
    c.fillPolygon([[3, 40], [22, 33], [44, 35], [67, 30], [67, 91], [3, 91]], hex('#94ab68'));
    // Perspective receding dark asphalt highway
    c.fillPolygon([[34, 34], [38, 34], [52, 91], [3, 91], [3, 65]], hex('#465259'));
    c.drawLine(34, 34, 3, 66, hex('#d4dce0'));
    c.drawLine(38, 34, 51, 91, hex('#d4dce0'));
    // Dashed yellow road centerline
    for (let i = 0; i < 6; i++) {
      const t0 = i * 0.16;
      const t1 = t0 + 0.08;
      const x0 = 36 - t0 * 22;
      const y0 = 35 + t0 * 54;
      const x1 = 36 - t1 * 22;
      const y1 = 35 + t1 * 54;
      c.drawLine(x0, y0, x1, y1, C_GOLD_HI, 0.7);
    }
    // Signpost + bright yellow diamond highway sign with dark Jack silhouette!
    c.fillRect(34, 72, 3, 20, hex('#c2ccd4'));
    const sign = new PixelCell();
    sign.fillPolygon([[35, 45], [51, 61], [35, 77], [19, 61]], C_GOLD_HI);
    sign.fillPolygon([[35, 48], [48, 61], [35, 74], [22, 61]], C_GOLD);
    // Dark walking Jack/crown silhouette inside sign
    sign.fillCircle(35, 55, 2.8, C_INK_DARK);
    sign.fillPolygon([[31, 59], [39, 59], [41, 67], [29, 67]], C_INK_DARK);
    sign.fillPolygon([[32, 53], [35, 50], [38, 53]], C_INK_DARK);
    sign.fillRect(32, 67, 2, 4, C_INK_DARK);
    sign.fillRect(36, 67, 2, 4, C_INK_DARK);
    c.blitLayer(sign, 0, 0, C_INK_DARK);
  });
  drawJokerMargins(cell, C_INK, { right: false });
  drawJokerMargins(cell, C_WHITE, { left: false, shadow: C_INK_DARK });
});

// (9,5) Swashbuckler — Roguish pirate jester in battered brown tricorn hat & black eyepatch
reg(9, 5, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  // Crimson pirate sword hilt peeking behind left shoulder
  cell.fillRect(22, 63, 3, 18, C_RED_DARK);
  drawJester(cell, {
    cy: 49,
    hatStyle: 'none',
    hatCenter: hex('#8c6b48'),
    hatSide: hex('#8c6b48'),
    collar: hex('#e8dfd1'),
    bell: hex('#a68b67'),
    browCol: hex('#9e6c38'),
    smileCol: C_RED,
    eyepatch: true,
    expr: 'smirk',
  });
  // Weathered brown pirate tricorn hat with curled brim
  const hat = new PixelCell();
  hat.fillPolygon([[15, 37], [26, 24], [35, 20], [44, 24], [55, 37], [44, 34], [35, 37], [26, 34]], hex('#8c6b48'));
  hat.fillPolygon([[18, 35], [27, 26], [35, 23], [43, 26], [52, 35]], hex('#ad875e'));
  hat.drawQuadBezier(17, 36, 35, 31, 53, 36, hex('#5e4429'), 1.5, 1.5);
  // Tiny bone skull badge on tricorn front
  hat.fillCircle(35, 29, 2.2, C_CREAM);
  cell.blitLayer(hat, 0, 0, C_INK_DARK);
});

// ============================================================================
// ROW 6 (y = 6): Flower Pot, Ride the Bus, Shoot the Moon, [Spare], Smeared, Oops All 6s, Four Fingers, Gros Michel, Stuntman, Hanging Chad
// ============================================================================

// (0,6) Flower Pot — Pastel mint 4-suit wallpaper + glazed ceramic pot blooming with 4 sunflowers!
reg(0, 6, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillRect(3, 3, 65, 89, hex('#c4e8e6'));
    const suits: SuitKind[] = ['Hearts', 'Diamonds', 'Spades', 'Clubs'];
    for (let r = 0; r < 8; r++) {
      for (let col = 0; col < 6; col++) {
        const s = suits[(r * 2 + col) % 4]!;
        c.drawSprite(SUIT_9X9[s], { a: hex('#a2d6d4') }, 7 + col * 12, 8 + r * 12, 1);
      }
    }
  });
  drawJokerMargins(cell, C_INK);
  const pot = new PixelCell();
  // Lush green stems & leaves
  pot.drawLine(35, 58, 25, 33, hex('#338a52'), 1.8);
  pot.drawLine(35, 58, 35, 20, hex('#2e7a48'), 1.8);
  pot.drawLine(35, 58, 45, 35, hex('#338a52'), 1.8);
  pot.fillEllipse(24, 49, 7, 3.5, hex('#3d9e5f'));
  pot.fillEllipse(46, 48, 7, 3.5, hex('#3d9e5f'));
  pot.fillEllipse(28, 38, 6, 3.0, hex('#4ec276'));
  // 4 Blooming bright sunflowers with rich orange/gold petals & dark brown centers
  const drawBloom = (bx: number, by: number, rad: number, petalCol: RGBA) => {
    for (let a = 0; a < 10; a++) {
      const ang = (a / 10) * Math.PI * 2;
      pot.fillCircle(bx + Math.cos(ang) * rad, by + Math.sin(ang) * rad, rad * 0.48, petalCol);
    }
    pot.fillShadedCircle(bx, by, rad * 0.6, hex('#7d4f2a'), hex('#523015'), hex('#331c0b'));
  };
  drawBloom(36, 20, 6.8, hex('#f7b829'));
  drawBloom(24, 33, 6.2, hex('#ff8c33'));
  drawBloom(45, 33, 6.0, hex('#f7cf40'));
  drawBloom(35, 44, 6.5, hex('#f59a23'));
  // Glazed stoneware pot
  pot.fillPolygon([[21, 56], [49, 56], [45, 83], [25, 83]], hex('#b8b0a4'));
  pot.fillPolygon([[22, 56], [33, 56], [31, 82], [25, 82]], hex('#d6cfc4'));
  pot.fillPolygon([[41, 56], [49, 56], [45, 82], [40, 82]], hex('#8c857a'));
  pot.fillRect(19, 54, 33, 5, hex('#cfc8bc'));
  pot.fillRect(22, 66, 26, 4, hex('#d47c4a'));
  cell.blitLayer(pot, 0, 0, C_INK);
});

// (1,6) Ride the Bus — Golden-yellow metro transit bus stop sign!
reg(1, 6, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillRect(3, 3, 65, 89, hex('#f7df28'));
    // Crisp dark navy transit route box
    c.fillRect(13, 13, 45, 69, hex('#294978'));
    c.strokeRect(12, 12, 47, 71, C_WHITE);
    // Top route badge
    drawMicroText(c, 'ROUTE 210-A', 35, 16, C_WHITE, { align: 'center' });
    c.fillRect(15, 23, 41, 1, hex('#6fa3e0'));
    // Crisp white commuter figure & front-view city bus icon!
    c.fillCircle(20, 29, 2.2, C_WHITE);
    c.fillRect(18, 32, 4, 7, C_WHITE);
    c.fillRect(18, 39, 1.5, 5, C_WHITE);
    c.fillRect(20.5, 39, 1.5, 5, C_WHITE);
    // Bus silhouette
    c.fillRect(29, 26, 24, 17, C_WHITE);
    c.fillRect(31, 28, 20, 7, hex('#294978'));
    c.fillRect(31, 38, 3, 2, hex('#294978'));
    c.fillRect(48, 38, 3, 2, hex('#294978'));
    c.fillRect(31, 43, 4, 3, C_WHITE);
    c.fillRect(47, 43, 4, 3, C_WHITE);
    // Stop schedule panel
    drawMicroText(c, 'STOPS FOR', 35, 49, C_WHITE, { align: 'center' });
    c.fillRect(16, 56, 39, 23, C_WHITE);
    drawMicroText(c, '11-JACK', 18, 58, hex('#294978'));
    drawMicroText(c, '12-QUEEN', 18, 65, hex('#294978'));
    drawMicroText(c, '13-KING', 18, 72, hex('#294978'));
  });
  drawJokerMargins(cell, C_INK);
});

// (2,6) Shoot the Moon — Classic ornate playing-card Queen holding golden crescent-moon scepter
reg(2, 6, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawCourtPortrait(cell, {
    robe1: C_RED_DARK,
    robe2: C_BLUE_DARK,
    trim: C_GOLD,
    hat: C_GOLD,
    prop: 'scepter',
  });
});

// (3,6) Spare Scholar slot (mirrors (0,4) cleanly)
reg(3, 6, drawScholarCell);

// (4,6) Smeared Joker — Vertically melted/smeared dripping Jimbo (still unmistakably Jimbo!)
reg(4, 6, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  const src = new PixelCell();
  drawJester(src, {
    cy: 46,
    hatCenter: C_RED,
    hatSide: C_GOLD,
    collar: C_BLUE,
    browCol: C_GOLD_DARK,
    smileCol: C_RED,
  });
  // Smooth painterly vertical wet-paint smear keeping Jimbo's face readable while melting down!
  for (let x = 12; x < 59; x++) {
    const colBlock = Math.floor(x / 3);
    const smear = Math.round(Math.sin(colBlock * 1.3) * 3.5 + (hash2(colBlock, 4, 64) - 0.4) * 7);
    for (let y = 10; y < 86; y++) {
      // Gentle smear on center face, dramatic paint drips on hat & collar!
      const inFace = x >= 27 && x <= 43 && y >= 37 && y <= 55;
      const dy = inFace ? Math.round(smear * 0.35) : smear;
      const sy = y - dy;
      if (src.getA(x, sy) > 0) {
        cell.setPx(x, y, src.getPx(x, sy));
      } else if (y > 54 && y < 82) {
        const dripLen = Math.round(hash2(colBlock, 9, 46) * 14);
        if (src.getA(x, y - dripLen) > 0) {
          cell.setPx(x, y, src.getPx(x, y - dripLen));
        }
      }
    }
  }
});

// (5,6) Oops! All 6s — Woven emerald backdrop with isometric 3D green die showing 6s on EVERY face!
reg(5, 6, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    // Emerald woven grid texture
    c.fillRect(3, 3, 65, 89, hex('#3ca37c'));
    for (let y = 4; y < 91; y += 4) c.fillRect(3, y, 65, 1, hex('#2e8564'));
    for (let x = 4; x < 67; x += 4) c.fillRect(x, 3, 1, 89, hex('#2e8564'));
    // Isometric 3D emerald die!
    const die = new PixelCell();
    // Top face (lightest emerald)
    die.fillPolygon([[35, 29], [56, 37], [35, 45], [14, 37]], hex('#6de0b2'));
    // Left face (medium emerald)
    die.fillPolygon([[14, 37], [35, 45], [35, 69], [14, 60]], hex('#47ba8e'));
    // Right face (deepest emerald)
    die.fillPolygon([[35, 45], [56, 37], [56, 60], [35, 69]], hex('#2d8c68'));
    // Crisp specular edge highlights
    die.drawLine(14, 37, 35, 45, hex('#a8f7d6'));
    die.drawLine(35, 45, 56, 37, hex('#a8f7d6'));
    die.drawLine(35, 45, 35, 69, hex('#7de8bd'));
    // 6 crisp white pips on TOP face
    for (const [px, py] of [[28, 35], [35, 33], [42, 35], [28, 39], [35, 41], [42, 39]] as const) {
      die.fillCircle(px, py, 1.3, C_WHITE);
    }
    // 6 crisp white pips on LEFT face
    for (const [px, py] of [[19, 44], [19, 51], [19, 57], [29, 48], [29, 55], [29, 61]] as const) {
      die.fillCircle(px, py, 1.4, C_WHITE);
    }
    // 6 crisp white pips on RIGHT face
    for (const [px, py] of [[41, 48], [41, 55], [41, 61], [51, 44], [51, 51], [51, 57]] as const) {
      die.fillCircle(px, py, 1.4, C_WHITE);
    }
    c.blitLayer(die, 0, 0, hex('#1a5941'), { dx: 1, dy: 2, color: rgba(15, 45, 35, 75) });
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#1a5941') });
});

// (6,6) Four Fingers — Psychedelic swirling magenta-purple waves with cartoon white 4-fingered glove!
reg(6, 6, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    drawMarbleSwirl(c, hex('#9153b8'), hex('#bd6ec9'), hex('#df9be3'), 66, 0.16, 2.8, 0.3);
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#562875') });
  const hand = new PixelCell();
  // Cartoon puffy palm
  hand.fillShadedEllipse(36, 55, 13, 12, C_WHITE, hex('#f2f6fa'), hex('#c8d4e0'));
  // Thumb jutting left
  drawCurvedProng(hand, 26, 57, 17, 52, 16, 45, 4.2, 2.8, hex('#f0f4f8'));
  // 3 tall splayed gloved fingers (4 digits total!)
  drawCurvedProng(hand, 29, 46, 24, 33, 25, 25, 3.6, 2.5, hex('#f2f6fa'));
  drawCurvedProng(hand, 36, 44, 37, 29, 40, 23, 3.6, 2.5, hex('#f2f6fa'));
  drawCurvedProng(hand, 43, 47, 50, 36, 54, 32, 3.5, 2.4, hex('#f0f4f8'));
  // Subtle gloved knuckle lines on back of hand
  hand.drawLine(32, 53, 31, 60, hex('#c4ced9'));
  hand.drawLine(37, 53, 37, 61, hex('#c4ced9'));
  hand.drawLine(42, 54, 42, 60, hex('#c4ced9'));
  cell.blitLayer(hand, 0, 0, C_INK, { dx: 2, dy: 2, color: rgba(65, 25, 95, 75) });
});

// (7,6) Gros Michel — Playful pastel lime-green polka-dot backdrop + lush ripe golden banana!
reg(7, 6, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillRect(3, 3, 65, 89, hex('#f5fae6'));
    for (let y = 7; y < 90; y += 11) {
      for (let x = 7; x < 66; x += 11) {
        c.fillCircle(x + ((y / 11) % 2) * 5, y, 3.8, hex('#c7e687'));
      }
    }
  });
  drawJokerMargins(cell, C_INK);
  const ban = new PixelCell();
  // Lush curved banana body with 3-tone shading
  drawCurvedProng(ban, 34, 19, 53, 45, 21, 76, 4.5, 8.8, hex('#f5db3b'));
  // Taper bottom tip cleanly
  ban.fillCircle(20, 77, 4.5, hex('#e6c422'));
  // Highlight ridge along outer right curve
  ban.drawQuadBezier(36, 24, 52, 46, 26, 72, hex('#fff6a8'), 1.8, 1.2);
  // Subtle longitudinal banana ridge line
  ban.drawQuadBezier(34, 24, 46, 46, 22, 74, hex('#c99f18'), 0.6, 0.5);
  // Woody brown top stem & tiny dark blossom end
  ban.drawLine(33, 18, 29, 13, hex('#7a5b2e'), 2.0);
  ban.fillCircle(17, 78, 2.0, hex('#5e431e'));
  cell.blitLayer(ban, 0, 0, hex('#5e4b16'), { dx: 1, dy: 2, color: rgba(80, 100, 40, 50) });
});

// (8,6) Stuntman — Daredevil racing helmet with red/white/blue stripes, aviator goggles & big grin!
reg(8, 6, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  const st = new PixelCell();
  // Racing jumpsuit shoulders with red/blue stripes
  st.fillShadedEllipse(35, 69, 17, 10, C_WHITE, hex('#eef3f7'), hex('#cbd6e0'));
  st.fillRect(32, 60, 7, 17, C_RED);
  st.fillRect(26, 61, 4, 15, C_BLUE);
  st.fillRect(41, 61, 4, 15, C_BLUE);
  // Glossy white daredevil helmet dome
  st.fillShadedEllipse(35, 42, 16, 17, C_WHITE, hex('#f2f6fa'), hex('#c4d0db'));
  // Bold red-white-blue patriotic racing center stripes down helmet
  st.fillRect(33, 25, 5, 14, C_RED);
  st.fillRect(28, 26, 3, 13, C_BLUE);
  st.fillRect(40, 26, 3, 13, C_BLUE);
  // Open face cutout + grinning jaw
  st.fillShadedEllipse(35, 48, 10.5, 9.5, C_WHITE, C_SKIN, C_SKIN_SHADE);
  // Aviator stunt goggles
  st.fillEllipse(29, 44, 5.2, 3.5, C_INK_DARK);
  st.fillEllipse(41, 44, 5.2, 3.5, C_INK_DARK);
  st.fillEllipse(29, 44, 3.6, 2.2, hex('#6e8291'));
  st.fillEllipse(41, 44, 3.6, 2.2, hex('#6e8291'));
  st.setPx(27, 43, C_WHITE);
  st.setPx(39, 43, C_WHITE);
  // Confident wide red daredevil smile
  st.drawQuadBezier(28, 51, 35, 57, 42, 51, C_RED, 1.8, 1.8);
  st.drawQuadBezier(30, 51, 35, 54, 40, 51, C_WHITE, 1.0, 1.0);
  cell.blitLayer(st, 0, 0, C_INK);
});

// (9,6) Hanging Chad — Crisp pale-blue election punch ballot with dangling punched "O" chad!
reg(9, 6, (cell) => {
  initCard(cell, hex('#eaf4fa'), hex('#9db9cc'), hex('#c5dceb'));
  // Crisp blue ballot header & side perforation borders
  cell.strokeRect(4, 4, 63, 87, hex('#6d97b5'));
  drawMicroText(cell, 'BALLOT', 35, 8, hex('#2d597a'), { align: 'center', spacing: 2 });
  cell.fillRect(8, 15, 55, 1, hex('#6d97b5'));
  // 5 ballot punch boxes J, [empty], K, E, R
  const boxes = ['J', '', 'K', 'E', 'R'];
  for (let i = 0; i < 5; i++) {
    const by = 19 + i * 14;
    cell.fillRect(21, by, 30, 11, i === 1 ? hex('#ffffff') : hex('#f7fbfe'));
    cell.strokeRect(21, by, 30, 11, hex('#4f7c9e'));
    // Tiny punch arrow on left
    cell.fillRect(12, by + 4, 6, 3, hex('#7ca2bd'));
    if (boxes[i]) {
      drawMicroText(cell, boxes[i]!, 36, by + 3, hex('#244a66'), { align: 'center' });
    } else {
      // Punched-out hollow slot shadow!
      cell.fillRect(22, by + 1, 28, 9, hex('#b8d2e3'));
      cell.fillRect(23, by + 2, 26, 7, hex('#eef6fa'));
    }
  }
  // Dangling rectangular "O" paper chad hanging diagonally off the punched slot!
  const chad = new PixelCell();
  chad.fillPolygon([[23, 39], [31, 47], [15, 65], [7, 57]], hex('#e2eff7'));
  chad.drawLine(23, 39, 31, 47, hex('#4f7c9e'));
  chad.drawLine(31, 47, 15, 65, hex('#4f7c9e'));
  chad.drawLine(15, 65, 7, 57, hex('#4f7c9e'));
  chad.drawLine(7, 57, 23, 39, hex('#4f7c9e'));
  drawMicroText(chad, 'O', 19, 49, hex('#244a66'), { align: 'center' });
  cell.blitLayer(chad, 0, 0, undefined, { dx: 1, dy: 2, color: rgba(35, 65, 90, 65) });
});

// ============================================================================
// ROW 7 (y = 7): Driver's License, Invisible, Astronomer, Burnt, Dusk, Throwback, The Idol, Brainstorm, Satellite, Rough Gem
// ============================================================================

// (0,7) Driver's License — Official sideways pale-blue miniature ID card with photo & barcode!
reg(0, 7, (cell) => {
  initCard(cell, hex('#edf4fa'), hex('#9db2c4'), hex('#cad9e6'));
  // Right-side (top when held sideways) official blue header bar
  cell.fillRect(57, 2, 12, 91, hex('#588ec9'));
  drawSidewaysText(cell, 'DRIVER LICENSE', 60, 12, C_WHITE, 'cw', 1);
  // Subtle blue-white security wave lines across ID body
  for (let x = 18; x < 55; x += 6) {
    cell.fillRect(x, 3, 1, 89, rgba(130, 175, 220, 45));
  }
  // Red-bordered miniature ID headshot photo box (top-right area when sideways = top-center)
  cell.fillRect(22, 6, 29, 25, C_WHITE);
  cell.strokeRect(22, 6, 29, 25, C_RED);
  // Tiny sideways red/gold/blue jester portrait inside photo!
  cell.fillCircle(36, 18, 7, C_WHITE);
  cell.fillCircle(42, 18, 5, C_RED);
  cell.fillCircle(40, 12, 3, C_GOLD);
  cell.fillCircle(40, 24, 3, C_GOLD);
  cell.fillRect(24, 12, 6, 13, C_BLUE);
  cell.setPx(36, 15, C_INK_DARK);
  cell.setPx(36, 21, C_INK_DARK);
  cell.fillRect(32, 15, 2, 7, C_RED);
  // Official sideways DMV text lines
  drawSidewaysText(cell, 'CLASS C', 49, 36, C_INK_DARK, 'cw', 1);
  drawSidewaysText(cell, 'EXP:04/01/28', 42, 36, C_INK_DARK, 'cw', 1);
  drawSidewaysText(cell, 'J. JOKER', 35, 36, C_INK_DARK, 'cw', 1);
  drawSidewaysText(cell, 'DOB:03/12/95', 28, 36, C_INK_SOFT, 'cw', 1);
  // Red organ donor micro badge + cursive signature squiggle
  cell.fillCircle(12, 19, 4, C_RED);
  drawSidewaysText(cell, 'DONOR', 11, 44, C_RED, 'cw', 1);
  // Crisp black barcode strip along bottom-left!
  for (let y = 62; y < 88; y += 2) {
    const thick = (y % 6 === 0) ? 1 : 0;
    cell.fillRect(5, y, 7, 1 + thick, C_INK_DARK);
  }
});

// (1,7) Invisible Joker — Crisp white card with ghostly pale-ice-blue hat & collar (NO FACE!)
reg(1, 7, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, hex('#758c9c'));
  drawJester(cell, {
    hatCenter: hex('#c7dce8'),
    hatSide: hex('#d4e6f0'),
    collar: hex('#c7dce8'),
    bell: hex('#a9c7d9'),
    noFace: true,
    outline: hex('#93b4c7'),
  });
});

// (2,7) Astronomer — Vintage celestial teal star-chart with white-line jester & orbital rings!
reg(2, 7, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillDitherGradV(3, 3, 65, 89, hex('#4c7d8c'), hex('#3a6473'));
    // Ornate star-chart inner border & top JOKER nameplate box
    c.strokeRect(6, 6, 59, 83, hex('#a8d8e6'));
    c.fillRect(15, 9, 41, 10, hex('#335866'));
    c.strokeRect(15, 9, 41, 10, C_WHITE);
    drawMicroText(c, 'JOKER', 35, 12, C_WHITE, { align: 'center', spacing: 2 });
    // Tiny moons, orbits, and sparkling stars around margins
    for (let i = 0; i < 22; i++) {
      const sx = 9 + Math.floor(hash2(i, 3, 27) * 53);
      const sy = 22 + Math.floor(hash2(i, 8, 27) * 63);
      c.setPx(sx, sy, hex('#dcf7ff'));
    }
    for (let i = 0; i < 4; i++) {
      c.fillCircle(10, 32 + i * 9, 1.7, hex('#c4eef7'));
      c.fillCircle(60, 32 + i * 9, 1.7, hex('#c4eef7'));
    }
    // White-ink celestial jester
    drawJester(c, {
      cy: 55,
      hatCenter: hex('#5a91a1'),
      hatSide: hex('#68a2b3'),
      collar: hex('#568b9c'),
      face: hex('#98cbd9'),
      faceShade: hex('#6298a8'),
      browCol: C_WHITE,
      smileCol: C_WHITE,
      eyeCol: hex('#284c59'),
      bell: C_WHITE,
      outline: C_WHITE,
    });
  });
});

// (3,7) Burnt Joker — Roaring yellow-orange-black inferno flames engulfing a grinning jester!
reg(3, 7, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    // Swirling roaring fire backdrop
    drawMarbleSwirl(c, hex('#292424'), hex('#e65922'), hex('#ffd447'), 37, 0.16, 2.8, 1.4);
    // Glowing fiery jester emerging from flames
    drawJester(c, {
      hatCenter: C_RED,
      hatSide: C_GOLD,
      collar: hex('#d9412b'),
      face: hex('#fff4d4'),
      faceShade: hex('#f2b963'),
      browCol: C_RED_DARK,
      smileCol: C_RED_DARK,
      eyeCol: hex('#3b180e'),
      expr: 'manic',
      outline: hex('#361a12'),
    });
    // Foreground licking flames & charred soot embers overlapping lower half
    for (let i = 0; i < 14; i++) {
      const fx = 8 + i * 4.5;
      const fh = 12 + Math.round(hash2(i, 7, 37) * 18);
      c.drawQuadBezier(fx, 91, fx + (i % 2 === 0 ? -4 : 4), 91 - fh * 0.6, fx, 91 - fh, i % 3 === 0 ? C_GOLD_HI : hex('#ff7b24'), 2.2, 0.5);
    }
    for (let i = 0; i < 18; i++) {
      const ex = 7 + Math.floor(hash2(i, 1, 73) * 57);
      const ey = 12 + Math.floor(hash2(i, 9, 73) * 74);
      c.fillCircle(ex, ey, 1.5, i % 2 === 0 ? hex('#2b2626') : C_GOLD_HI);
    }
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#2b150e') });
});

// (4,7) Dusk — Serene Bayer-dithered desert-twilight sky, stars, golden clouds & purple mesas!
reg(4, 7, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillDitherStopsV(3, 3, 65, 65, [
      hex('#5c5a78'),
      hex('#8c7a8f'),
      hex('#c99d89'),
      hex('#f5c97a'),
    ]);
    // Tiny evening stars in upper twilight
    for (let i = 0; i < 14; i++) {
      const sx = 9 + Math.floor(hash2(i, 4, 47) * 52);
      const sy = 6 + Math.floor(hash2(i, 7, 47) * 26);
      c.setPx(sx, sy, hex('#fff6d6'));
    }
    // Layered glowing golden-violet sunset clouds
    c.fillEllipse(24, 38, 15, 5, hex('#9688a6'));
    c.fillEllipse(28, 40, 13, 3.5, hex('#f0bc84'));
    c.fillEllipse(48, 47, 16, 4.5, hex('#847594'));
    c.fillEllipse(46, 49, 14, 3, hex('#f7cf7c'));
    // Distant violet mountain ridge
    c.fillPolygon([[3, 68], [16, 56], [28, 62], [44, 51], [58, 59], [67, 56], [67, 91], [3, 91]], hex('#5e5a78'));
    // Closer deep-indigo desert foreground & saguaro cactus silhouettes
    c.fillPolygon([[3, 76], [25, 70], [48, 74], [67, 71], [67, 91], [3, 91]], hex('#45445e'));
    // Tiny saguaro cacti!
    for (const [cx, cy, ch] of [[15, 76, 11], [29, 73, 7], [53, 75, 9]] as const) {
      c.fillRect(cx, cy - ch, 2, ch, hex('#33324a'));
      c.fillRect(cx - 3, cy - ch + 3, 3, 2, hex('#33324a'));
      c.fillRect(cx - 3, cy - ch + 1, 2, 3, hex('#33324a'));
      c.fillRect(cx + 2, cy - ch + 5, 3, 2, hex('#33324a'));
    }
  });
  drawJokerMargins(cell, C_INK, { right: false });
  drawJokerMargins(cell, C_WHITE, { left: false });
});

// (5,7) Throwback — 90s Memphis confetti pattern + neon mint/pink retro jester with visor shades!
reg(5, 7, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillRect(3, 3, 65, 89, C_WHITE);
    // Iconic 90s Memphis confetti shapes (cyan triangles, magenta squiggles, yellow dots)
    const shapes: Array<[number, number, RGBA, number]> = [
      [14, 12, hex('#ff6ec7'), 0],
      [54, 14, hex('#3de0d0'), 1],
      [22, 24, hex('#ffe047'), 2],
      [58, 31, hex('#9b6bff'), 0],
      [12, 44, hex('#3de0d0'), 2],
      [56, 52, hex('#ff6ec7'), 1],
      [15, 76, hex('#9b6bff'), 1],
      [48, 82, hex('#3de0d0'), 0],
      [28, 85, hex('#ffe047'), 2],
      [57, 72, hex('#ff6ec7'), 2],
    ];
    for (const [sx, sy, col, kind] of shapes) {
      if (kind === 0) c.fillPolygon([[sx, sy - 4], [sx + 4, sy + 3], [sx - 4, sy + 3]], col);
      else if (kind === 1) c.drawQuadBezier(sx - 4, sy - 2, sx, sy + 4, sx + 4, sy - 2, col, 1.3, 1.3);
      else c.fillCircle(sx, sy, 2.5, col);
    }
  });
  drawJokerMargins(cell, hex('#6c52b8'));
  drawJester(cell, {
    hatCenter: hex('#3ecfc4'),
    hatSide: hex('#ff70c8'),
    hatSideR: hex('#ffe047'),
    collar: hex('#5ce6d8'),
    bell: hex('#ffe047'),
    smileCol: hex('#ff5cb8'),
    visor: hex('#3760a8'),
    outline: hex('#4a3c75'),
  });
});

// (6,7) The Idol — Carved wooden Polynesian tiki totem with feathered crown & glowing cyan eyes!
reg(6, 7, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  const tiki = new PixelCell();
  // Colorful upright feathers on crown
  const feathCols = [C_BLUE, C_RED, C_GOLD, C_RED, C_BLUE];
  for (let i = 0; i < 5; i++) {
    tiki.fillEllipse(25 + i * 5, 18 + Math.abs(i - 2) * 2, 2.4, 7.2, feathCols[i]!);
  }
  // Carved cedar wood totem body
  tiki.fillPolygon([[20, 26], [50, 26], [47, 79], [23, 79]], hex('#9e6833'));
  tiki.fillPolygon([[22, 26], [34, 26], [33, 78], [24, 78]], hex('#bd8244'));
  tiki.fillPolygon([[40, 26], [50, 26], [47, 78], [39, 78]], hex('#754a21'));
  // Carved decorative turquoise headband & cheek bands
  tiki.fillRect(20, 30, 31, 4, hex('#3db3ad'));
  tiki.fillRect(23, 71, 25, 4, hex('#3db3ad'));
  // Fierce carved arched brows & glowing turquoise eyes
  tiki.fillPolygon([[21, 38], [34, 42], [34, 46], [21, 44]], hex('#633b17'));
  tiki.fillPolygon([[49, 38], [36, 42], [36, 46], [49, 44]], hex('#633b17'));
  tiki.fillEllipse(28, 45, 4.2, 3.0, hex('#40e6d8'));
  tiki.fillEllipse(42, 45, 4.2, 3.0, hex('#40e6d8'));
  tiki.fillCircle(28, 45, 1.4, C_WHITE);
  tiki.fillCircle(42, 45, 1.4, C_WHITE);
  // Sculpted broad wooden nose
  tiki.fillPolygon([[35, 42], [31, 54], [39, 54]], hex('#d49855'));
  // Wide menacing crimson-bordered toothy tiki mouth!
  tiki.fillEllipse(35, 62, 13, 6.2, C_RED);
  tiki.fillEllipse(35, 62, 10, 4.0, C_WHITE);
  for (let tx = 26; tx <= 44; tx += 4) {
    tiki.drawLine(tx, 58, tx, 66, C_INK_DARK);
  }
  tiki.drawLine(25, 62, 45, 62, C_INK_DARK);
  cell.blitLayer(tiki, 0, 0, hex('#3b2410'));
});

// (7,7) Brainstorm — Warm crumpled notebook paper with red-pen scribbles & blue-pen jester facing LEFT!
reg(7, 7, (cell) => {
  initCard(cell, hex('#f7edd4'), hex('#cfc09d'), hex('#e3d4b0'));
  // Crumpled paper soft shading & pale-blue notebook grid lines
  for (let y = 3; y <= 91; y++) {
    for (let x = 3; x <= 67; x++) {
      const crinkle = Math.sin(x * 0.14 + y * 0.09) * Math.cos(x * 0.07 - y * 0.12);
      if (crinkle > 0.45) cell.setPx(x, y, hex('#ede0be'));
      else if (crinkle < -0.5) cell.setPx(x, y, hex('#fcf5e3'));
    }
  }
  for (let y = 11; y < 91; y += 7) cell.fillRect(3, y, 65, 1, rgba(130, 175, 225, 85));
  for (let x = 11; x < 67; x += 7) cell.fillRect(x, 3, 1, 89, rgba(130, 175, 225, 55));
  // Red notebook margin line + hand-scrawled JOKER & dimension arrows
  cell.fillRect(58, 3, 1, 89, rgba(235, 85, 80, 120));
  drawMicroText(cell, 'JOKER', 30, 9, C_RED, { align: 'center', spacing: 2 });
  cell.drawLine(14, 16, 48, 12, C_RED);
  // Red-ink brainstorming arrows & scribbles pointing LEFT!
  cell.drawLine(55, 25, 63, 25, C_RED);
  cell.drawLine(59, 25, 59, 68, C_RED);
  cell.drawLine(26, 52, 8, 57, C_RED);
  cell.drawLine(8, 57, 13, 53, C_RED);
  cell.drawLine(8, 57, 13, 61, C_RED);
  cell.fillCircle(31, 46, 5, rgba(254, 95, 85, 45));
  // Hand-sketched blue ballpoint-pen jester looking LEFT!
  drawJester(cell, {
    cx: 35,
    cy: 50,
    hatCenter: hex('#f7edd4'),
    hatSide: hex('#f7edd4'),
    collar: hex('#f7edd4'),
    face: hex('#faf2de'),
    faceShade: hex('#ede1c2'),
    browCol: hex('#3b6cc4'),
    smileCol: hex('#3b6cc4'),
    eyeCol: hex('#2d56a6'),
    bell: hex('#f7edd4'),
    outline: hex('#4a77cc'),
  });
  // Glance pupils shifted left + sketchbook crosshatching
  cell.fillRect(29, 46, 2, 2, hex('#23468c'));
  cell.fillRect(38, 46, 2, 2, hex('#23468c'));
  // Coffee ring / margin math squiggles at bottom
  cell.drawQuadBezier(10, 82, 16, 78, 22, 84, C_RED, 0.5, 0.5);
  drawMicroText(cell, 'X2?', 52, 82, hex('#3b6cc4'));
});

// (8,7) Satellite — Earth's curved glowing cyan-blue horizon & orbiting solar-panel satellite!
reg(8, 7, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    // Starry deep black cosmos above
    c.fillDitherGradV(3, 3, 65, 56, hex('#131b2b'), hex('#1f2f4d'));
    for (let i = 0; i < 28; i++) {
      const sx = 6 + Math.floor(hash2(i, 6, 87) * 59);
      const sy = 5 + Math.floor(hash2(i, 2, 87) * 44);
      c.setPx(sx, sy, i % 5 === 0 ? hex('#a8ecff') : C_WHITE);
    }
    // Glowing atmospheric halo & curved Earth globe below!
    c.fillCircle(35, 114, 67, hex('#58c6f5'));
    c.fillCircle(35, 115, 65, hex('#2569b0'));
    c.fillCircle(35, 118, 63, hex('#184880'));
    // Swirling planetary cloud wisps across Earth
    for (let i = 0; i < 6; i++) {
      const cy = 56 + i * 6;
      c.drawQuadBezier(6 + i * 4, cy, 35, cy - 4, 64 - i * 3, cy + 2, rgba(235, 248, 255, 155), 1.6, 0.9);
    }
    // Sleek silver satellite with angled cobalt solar wings!
    const sat = new PixelCell();
    // Left & right solar array panels
    sat.fillPolygon([[10, 32], [27, 26], [29, 34], [12, 40]], hex('#336699'));
    sat.fillPolygon([[43, 22], [60, 16], [62, 24], [45, 30]], hex('#336699'));
    sat.drawLine(16, 30, 18, 38, hex('#8cc4f2'));
    sat.drawLine(22, 28, 24, 36, hex('#8cc4f2'));
    sat.drawLine(49, 20, 51, 28, hex('#8cc4f2'));
    sat.drawLine(55, 18, 57, 26, hex('#8cc4f2'));
    // Central metallic spacecraft bus & parabolic dish
    sat.fillRect(30, 22, 11, 12, hex('#d4dfe8'));
    sat.fillRect(31, 23, 4, 10, C_WHITE);
    sat.fillRect(37, 23, 3, 10, hex('#8b9ba8'));
    sat.fillCircle(35, 37, 3.5, hex('#e8f0f5'));
    sat.drawLine(35, 37, 35, 42, hex('#9aaab8'));
    c.blitLayer(sat, 0, 0, hex('#152030'));
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#111926') });
});

// (9,7) Rough Gem — Warm sandy swirled backdrop with dazzling faceted sky-cyan raw diamond crystal!
reg(9, 7, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    drawMarbleSwirl(c, hex('#d9bc89'), hex('#edd8ad'), hex('#faf0d7'), 97, 0.14, 2.4, -0.4);
  });
  drawJokerMargins(cell, C_INK);
  const gem = new PixelCell();
  // Main large multi-faceted rough diamond crystal
  gem.fillPolygon([[35, 29], [52, 44], [35, 68], [18, 44]], hex('#6ccbf2'));
  // Bright icy upper-left crown facet
  gem.fillPolygon([[35, 29], [44, 38], [35, 48], [21, 43]], hex('#b8f0ff'));
  gem.fillPolygon([[35, 29], [35, 48], [24, 41]], C_WHITE);
  // Deeper shaded right pavilion facet
  gem.fillPolygon([[35, 48], [52, 44], [35, 68]], hex('#379bc9'));
  gem.fillPolygon([[42, 46], [52, 44], [35, 68]], hex('#24759e'));
  // Crisp crystalline facet crease lines
  gem.drawLine(18, 44, 52, 44, hex('#e8fbff'));
  gem.drawLine(35, 29, 35, 68, hex('#e8fbff'));
  // Orbiting smaller raw gem shards!
  gem.fillPolygon([[44, 16], [53, 23], [45, 30], [38, 22]], hex('#8ce0fc'));
  gem.fillPolygon([[44, 16], [49, 21], [44, 25], [40, 21]], C_WHITE);
  gem.fillPolygon([[26, 68], [32, 74], [25, 79], [20, 74]], hex('#8ce0fc'));
  gem.fillPolygon([[46, 69], [50, 73], [46, 77], [42, 73]], hex('#6ccbf2'));
  cell.blitLayer(gem, 0, 0, hex('#1d5c7d'), { dx: 1, dy: 2, color: rgba(110, 80, 35, 55) });
});

// ============================================================================
// ROW 8 (y = 8): Bloodstone, Arrowhead, Onyx Agate, 5 Legendary Swirl Bases, Certificate, Bootstraps
// ============================================================================

// (0,8) Bloodstone — Pale blush marble card with tumbled dark sea-green crimson-flecked bloodstone
reg(0, 8, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    drawMarbleSwirl(c, hex('#f0c7cc'), hex('#fae2e5'), C_WHITE, 80, 0.14, 2.3, 0.5);
  });
  drawJokerMargins(cell, C_INK);
  const st = new PixelCell();
  // Plump rounded-rectangular tumbled heliotrope bloodstone tilted slightly
  for (let t = 0; t <= 18; t++) {
    const u = t / 18;
    const bx = 41 - u * 12;
    const by = 32 + u * 31;
    st.fillShadedEllipse(bx, by, 13.5, 11.8, hex('#8fd9c8'), hex('#489c8a'), hex('#246356'));
  }
  // Glossy specular highlight along upper left edge
  st.drawQuadBezier(36, 26, 28, 38, 23, 53, hex('#c4f5e9'), 1.4, 0.9);
  // Vivid blood-red crimson speckles embedded in dark green stone!
  for (const [fx, fy, fr] of [
    [39, 34, 1.6],
    [45, 42, 2.2],
    [35, 48, 2.3],
    [40, 56, 1.9],
    [29, 57, 1.6],
    [26, 64, 1.7],
    [37, 63, 1.4],
  ] as const) {
    st.fillCircle(fx, fy, fr, C_RED);
  }
  // Small tumbling pebbles
  st.fillShadedCircle(23, 27, 2.8, hex('#8fd9c8'), hex('#489c8a'), hex('#246356'));
  st.fillShadedCircle(48, 72, 3.4, hex('#8fd9c8'), hex('#489c8a'), hex('#246356'));
  cell.blitLayer(st, 0, 0, hex('#1b4a40'), { dx: 1, dy: 2, color: rgba(90, 45, 55, 55) });
});

// (1,8) Arrowhead — Pale periwinkle swirl card with knapped slate-teal flint arrowhead
reg(1, 8, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    drawMarbleSwirl(c, hex('#c8c4eb'), hex('#e0ddf7'), hex('#f4f2fc'), 81, 0.14, 2.3, -0.6);
  });
  drawJokerMargins(cell, C_INK);
  const arr = new PixelCell();
  // Knapped stone arrowhead silhouette pointing up
  arr.fillPolygon(
    [
      [35, 12],
      [44, 32],
      [51, 56],
      [48, 66],
      [40, 64],
      [42, 74],
      [28, 74],
      [30, 64],
      [22, 66],
      [19, 56],
      [26, 32],
    ],
    hex('#54737a')
  );
  // Left chiseled light facet
  arr.fillPolygon([[35, 12], [35, 68], [22, 65], [19, 56], [26, 32]], hex('#789ca3'));
  // Right deeper chiseled shadow facet
  arr.fillPolygon([[35, 12], [44, 32], [51, 56], [48, 65], [35, 68]], hex('#3b555c'));
  // Flaked flint ridges
  arr.drawLine(35, 14, 35, 72, hex('#a2c4cc'));
  arr.drawLine(25, 42, 35, 36, hex('#96b8c0'));
  arr.drawLine(23, 55, 35, 49, hex('#96b8c0'));
  arr.drawLine(45, 44, 36, 40, hex('#2a3f45'));
  arr.drawLine(47, 56, 36, 52, hex('#2a3f45'));
  // Tiny stone chips around base
  arr.fillCircle(23, 76, 2.0, hex('#54737a'));
  arr.fillCircle(45, 77, 2.4, hex('#3b555c'));
  cell.blitLayer(arr, 0, 0, hex('#223338'), { dx: 1, dy: 2, color: rgba(60, 55, 95, 55) });
});

// (2,8) Onyx Agate — Steel-blue marble card with banded glossy black-and-white onyx gemstone
reg(2, 8, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    drawMarbleSwirl(c, hex('#87a6bf'), hex('#b0cadb'), hex('#dcebf5'), 82, 0.14, 2.4, 0.4);
  });
  drawJokerMargins(cell, C_INK);
  const onyx = new PixelCell();
  onyx.fillShadedCircle(35, 49, 19, hex('#5d6870'), hex('#2c343a'), hex('#161b1f'));
  // Concentric glossy white-grey agate mineral bands curving across the black stone!
  for (let a = -1.2; a <= 1.9; a += 0.06) {
    onyx.setPx(33 + Math.cos(a) * 14, 49 + Math.sin(a) * 12, hex('#dce5ed'));
    onyx.setPx(34 + Math.cos(a) * 10, 48 + Math.sin(a) * 8, hex('#8a9aa6'));
    onyx.setPx(33 + Math.cos(a) * 5, 47 + Math.sin(a) * 4, hex('#cbd8e3'));
  }
  // Crisp bright wet specular arc
  onyx.drawQuadBezier(23, 41, 27, 34, 36, 33, C_WHITE, 1.2, 0.8);
  // Floating dark onyx beads
  onyx.fillShadedCircle(29, 23, 3.2, hex('#66737d'), hex('#2c343a'), hex('#161b1f'));
  onyx.fillShadedCircle(49, 27, 2.5, hex('#66737d'), hex('#2c343a'), hex('#161b1f'));
  onyx.fillShadedCircle(25, 75, 3.5, hex('#66737d'), hex('#2c343a'), hex('#161b1f'));
  onyx.fillShadedCircle(42, 73, 2.2, hex('#66737d'), hex('#2c343a'), hex('#161b1f'));
  cell.blitLayer(onyx, 0, 0, hex('#12161a'), { dx: 1, dy: 2, color: rgba(35, 55, 75, 65) });
});

/**
 * Helper for all 5 Legendary Swirled Foil Card Bases in Row 8 (Canio..Perkeo).
 * Features rich multi-band foil waves + riveted cream bottom nameplate banner!
 */
function drawLegendaryBase(
  cell: PixelCell,
  label: string,
  c1: RGBA,
  c2: RGBA,
  c3: RGBA,
  border: RGBA,
  seed: number
): void {
  initCard(cell, c2, border);
  drawMarbleSwirl(cell, c1, c2, c3, seed, 0.145, 2.8, 0.72);
  // Subtle shimmering inner frame bevel
  cell.strokeRect(2, 2, 67, 91, shadeCol(c3, 1.15));
  cell.strokeRect(3, 3, 65, 89, rgba(255, 255, 255, 85));
  // Riveted parchment/metallic nameplate banner at bottom (y=77..87)
  const bx = 8;
  const by = 77;
  const bw = 55;
  const bh = 11;
  cell.fillRect(bx + 1, by + 1, bw, bh, rgba(35, 42, 50, 75));
  cell.fillRect(bx, by, bw, bh, hex('#f7f4ec'));
  cell.strokeRect(bx, by, bw, bh, shadeCol(c1, 0.72));
  cell.fillRect(bx + 1, by + 1, bw - 2, 2, C_WHITE);
  // Corner rivets
  cell.setPx(bx + 2, by + 5, shadeCol(c1, 0.65));
  cell.setPx(bx + bw - 3, by + 5, shadeCol(c1, 0.65));
  // Crisp centered Legendary name
  drawMicroText(cell, label, 35, by + 3, C_INK_DARK, { align: 'center', spacing: 1 });
}

// (3,8) Canio Base (Pale liquid silver waves)
reg(3, 8, (cell) => {
  drawLegendaryBase(cell, 'CANIO', hex('#abb8c7'), hex('#cedae6'), hex('#edf3f7'), hex('#8a98a8'), 38);
});
// (4,8) Triboulet Base (Cerulean sky-blue waves)
reg(4, 8, (cell) => {
  drawLegendaryBase(cell, 'TRIBOULET', hex('#68a5d4'), hex('#92c4e8'), hex('#cee7fa'), hex('#4e85b3'), 48);
});
// (5,8) Yorick Base (Antique warm gold waves)
reg(5, 8, (cell) => {
  drawLegendaryBase(cell, 'YORICK', hex('#d19c45'), hex('#e8be6b'), hex('#fae3a7'), hex('#a87828'), 58);
});
// (6,8) Chicot Base (Rose-crimson coral waves)
reg(6, 8, (cell) => {
  drawLegendaryBase(cell, 'CHICOT', hex('#cf6f75'), hex('#e69599'), hex('#fad0d2'), hex('#a84d54'), 68);
});
// (7,8) Perkeo Base (Mint-emerald jade waves)
reg(7, 8, (cell) => {
  drawLegendaryBase(cell, 'PERKEO', hex('#5ea88d'), hex('#8cc9b2'), hex('#cceee0'), hex('#42826b'), 78);
});

// (8,8) Certificate — Ornate parchment Certificate of Authenticity with golden wax jester seal!
reg(8, 8, (cell) => {
  initCard(cell, hex('#f2eedf'), hex('#8f9982'), hex('#d9d4c2'));
  // Ornate emerald-sage double guilloche border
  cell.strokeRect(4, 4, 63, 87, hex('#6d7d63'));
  cell.strokeRect(6, 6, 59, 83, hex('#a2b097'));
  // Corner ornamental rosettes
  for (const [rx, ry] of [[8, 8], [62, 8], [8, 86], [62, 86]] as const) {
    cell.fillCircle(rx, ry, 2.5, hex('#7d8f72'));
    cell.setPx(rx, ry, hex('#f2eedf'));
  }
  drawMicroText(cell, 'CERTIFICATE', 35, 11, hex('#3b4735'), { align: 'center' });
  drawMicroText(cell, 'OF AUTH.', 35, 19, hex('#586950'), { align: 'center' });
  // Decorative horizontal divider lines
  cell.fillRect(10, 27, 51, 1, hex('#8d9c82'));
  cell.fillRect(10, 66, 51, 1, hex('#8d9c82'));
  // Ribbon banner behind gold wax seal
  cell.fillRect(8, 41, 55, 14, hex('#d4d9c7'));
  cell.fillRect(8, 43, 55, 10, hex('#b5bfa6'));
  // Embossed golden wax seal with tiny jester silhouette!
  const seal = new PixelCell();
  seal.fillShadedCircle(35, 48, 12, C_GOLD_HI, C_GOLD, C_GOLD_DARK);
  seal.fillCircle(35, 48, 9, hex('#e8a92c'));
  // Tiny ivory jester silhouette inside seal
  seal.fillCircle(35, 47, 3.2, hex('#fff7dc'));
  seal.fillPolygon([[28, 52], [35, 49], [42, 52], [35, 55]], hex('#fff7dc'));
  seal.fillPolygon([[35, 41], [31, 45], [39, 45]], hex('#fff7dc'));
  cell.blitLayer(seal, 0, 0, hex('#8a580e'));
  // Signature line & cursive-style J. JOKER
  drawMicroText(cell, 'J. JOKER', 35, 72, hex('#4f5c47'), { align: 'center', spacing: 2 });
  cell.fillRect(14, 80, 43, 1, hex('#6d7d63'));
});

// (9,8) Bootstraps — Warm ochre swirl card with leather cowboy boot, spur & bold red UP arrow!
reg(9, 8, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    drawMarbleSwirl(c, hex('#d98d3b'), hex('#ebb059'), hex('#fae09e'), 98, 0.15, 2.3, -0.5);
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#8c4e11') });
  const bt = new PixelCell();
  // Bold crimson upward arrow pulling straight up out of the boot!
  bt.fillPolygon([[35, 10], [47, 25], [40, 25], [40, 50], [30, 50], [30, 25], [23, 25]], C_RED);
  bt.fillPolygon([[35, 13], [43, 23], [37, 23], [37, 48], [33, 48], [33, 23], [27, 23]], C_RED_HI);
  // Weathered brown leather cowboy boot shaft & toe
  bt.fillPolygon([[26, 44], [46, 44], [46, 75], [27, 75]], hex('#9e6838'));
  bt.fillPolygon([[28, 44], [36, 44], [36, 74], [28, 74]], hex('#bd824a'));
  // Boot foot extending left with upturned cowboy toe
  bt.fillPolygon([[46, 66], [46, 82], [15, 81], [11, 74], [19, 69], [28, 66]], hex('#8c592d'));
  bt.fillPolygon([[38, 68], [16, 75], [20, 71], [29, 67]], hex('#bd824a'));
  // Dark thick leather sole & heel
  bt.fillRect(13, 79, 34, 4, hex('#4f3116'));
  bt.fillRect(36, 81, 10, 3, hex('#3b220e'));
  // Metallic silver rowel spur on right heel!
  bt.drawLine(35, 72, 53, 73, hex('#dce5ed'), 1.3);
  bt.fillCircle(54, 73, 3.2, hex('#eef4fa'));
  bt.fillCircle(54, 73, 1.3, hex('#586875'));
  // Decorative western stitching on shaft
  bt.drawQuadBezier(29, 51, 36, 57, 43, 51, C_GOLD_HI, 0.6, 0.6);
  cell.blitLayer(bt, 0, 0, hex('#3b220e'), { dx: 1, dy: 2, color: rgba(95, 50, 12, 65) });
});

// ============================================================================
// ROW 9 (y = 9): CRITICAL FLOATING soulPos LAYERS (TRANSPARENT BG!) + LOCKED / UNDISCOVERED
// (2,9) Hologram soul | (3,9) Canio | (4,9) Triboulet | (5,9) Yorick | (6,9) Chicot | (7,9) Perkeo
// (8,9) Locked Padlock Card | (9,9) Undiscovered Card Silhouette
// ============================================================================

// (2,9) Hologram soulPos — Floating glowing pastel holographic jester bust (TRANSPARENT BG!)
reg(2, 9, (cell) => {
  cell.clear();
  const holo = new PixelCell();
  drawJester(holo, {
    cy: 48,
    hatCenter: hex('#ff85c0'),
    hatSide: hex('#ffe066'),
    hatSideR: hex('#ffe066'),
    bell: hex('#99f7ff'),
    collar: hex('#4fd6ff'),
    face: hex('#f2fdff'),
    faceShade: hex('#bceeff'),
    browCol: hex('#ff70b8'),
    smileCol: hex('#ff66b2'),
    eyeCol: hex('#3b88c9'),
    outline: hex('#5cd6ff'),
    expr: 'jimbo',
  });
  // Add crisp horizontal holographic scanline iridescence while keeping outside 100% transparent!
  for (let y = 0; y < CELL_H; y++) {
    for (let x = 0; x < CELL_W; x++) {
      const a = holo.getA(x, y);
      if (a === 0) continue;
      const p = holo.getPx(x, y);
      const scan = y % 3 === 0 ? 1.15 : 0.94;
      cell.setPx(x, y, rgba(p[0] * scan, p[1] * scan, Math.min(255, p[2] * scan + 18), Math.round(a * 0.92)));
    }
  }
});

// (3,9) Canio soulPos — Tragic monochrome Pierrot opera clown bust (TRANSPARENT BG!)
reg(3, 9, (cell) => {
  cell.clear();
  const layer = new PixelCell();
  // Wide snowy Elizabethan pleated Pierrot ruff collar
  for (let i = -4; i <= 4; i++) {
    const px = 35 + i * 4.7;
    const py = 65 + Math.cos(i * 0.4) * 4.5;
    layer.fillShadedEllipse(px, py, 4.4, 8.2, C_WHITE, hex('#eef2f6'), hex('#b9c4cf'));
    layer.drawLine(px, py - 4, px, py + 7, hex('#9aa8b5'));
  }
  layer.fillEllipse(35, 61, 16, 4.5, C_WHITE);
  // Pale expressive white Pierrot head
  layer.fillShadedEllipse(35, 45, 11.5, 12.2, C_WHITE, hex('#f7f9fc'), hex('#cdd6e0'));
  // Tall pointed snowy-white Pierrot cone hat with 3 black pom-poms
  layer.fillPolygon([[23, 39], [35, 13], [47, 39]], hex('#eef2f6'));
  layer.fillPolygon([[25, 39], [35, 14], [35, 39]], C_WHITE);
  layer.fillPolygon([[35, 14], [47, 39], [35, 39]], hex('#cfd8e0'));
  layer.fillCircle(35, 18, 1.6, C_INK_DARK);
  layer.fillCircle(35, 25, 1.6, C_INK_DARK);
  layer.fillCircle(35, 32, 1.6, C_INK_DARK);
  // Sorrowful arched brows, dark diamond eye-marks, black teardrop, downturned red frown!
  layer.drawLine(27, 42, 32, 39, C_INK_DARK);
  layer.drawLine(43, 42, 38, 39, C_INK_DARK);
  layer.fillCircle(30, 44, 1.8, C_INK_DARK);
  layer.fillCircle(40, 44, 1.8, C_INK_DARK);
  layer.setPx(30, 43, C_WHITE);
  layer.setPx(40, 43, C_WHITE);
  // Iconic black opera tear falling down cheek
  layer.fillRect(39, 47, 2, 3, C_INK_DARK);
  layer.setPx(39, 50, C_INK_DARK);
  // Tragic downturned crimson frown
  layer.drawQuadBezier(29, 54, 35, 49, 41, 54, C_RED, 1.7, 1.7);
  layer.drawQuadBezier(31, 53, 35, 51, 39, 53, C_WHITE, 0.7, 0.7);
  cell.blitLayer(layer, 0, -5, C_INK);
});

// (4,9) Triboulet soulPos — Royal blue & gold court jester bust (TRANSPARENT BG!)
reg(4, 9, (cell) => {
  cell.clear();
  const layer = new PixelCell();
  // Rounded royal sapphire collar trimmed with golden beaded border
  layer.fillShadedEllipse(35, 65, 20, 10, hex('#40a8f5'), hex('#1575cf'), hex('#0b4d91'));
  // Gold scalloped bead trim along collar edge
  for (let i = -4; i <= 4; i++) {
    const bx = 35 + i * 4.5;
    const by = 69 + Math.cos(i * 0.35) * 4.5;
    layer.fillCircle(bx, by, 2.2, C_GOLD);
    layer.setPx(bx - 1, by - 1, C_GOLD_HI);
  }
  layer.fillShadedEllipse(35, 58, 13, 4.5, C_GOLD_HI, C_GOLD, C_GOLD_DARK);
  // Cheerful pale royal face with rosy cheeks
  layer.fillShadedEllipse(35, 46, 11.2, 11.5, C_WHITE, hex('#fcf9f5'), hex('#d5dfea'));
  layer.fillCircle(28, 49, 2.2, hex('#ffb8b3'));
  layer.fillCircle(42, 49, 2.2, hex('#ffb8b3'));
  // Rounded sapphire royal jester hood with side ear flaps & golden bead trim
  layer.fillShadedEllipse(35, 34, 15, 9, hex('#40a8f5'), hex('#1575cf'), hex('#0b4d91'));
  layer.fillShadedCircle(20, 39, 4.5, hex('#40a8f5'), hex('#1575cf'), hex('#0b4d91'));
  layer.fillShadedCircle(50, 39, 4.5, hex('#40a8f5'), hex('#1575cf'), hex('#0b4d91'));
  // Golden crest medallion & beaded brow band
  for (let i = -3; i <= 3; i++) {
    layer.fillCircle(35 + i * 4, 37 - Math.abs(i) * 0.4, 1.6, C_GOLD_HI);
  }
  layer.fillCircle(35, 28, 2.5, C_GOLD_HI);
  layer.fillCircle(18, 43, 2.0, C_GOLD);
  layer.fillCircle(52, 43, 2.0, C_GOLD);
  // Bright blue eyes, gold arched brows, rosy royal smile
  layer.drawQuadBezier(27, 42, 30, 40, 33, 42, C_GOLD_DARK, 0.8, 0.8);
  layer.drawQuadBezier(37, 42, 40, 40, 43, 42, C_GOLD_DARK, 0.8, 0.8);
  layer.fillCircle(30, 45, 1.9, hex('#1a5fa8'));
  layer.fillCircle(40, 45, 1.9, hex('#1a5fa8'));
  layer.setPx(29, 44, C_WHITE);
  layer.setPx(39, 44, C_WHITE);
  layer.drawQuadBezier(29, 51, 35, 56, 41, 51, C_RED, 1.7, 1.7);
  layer.drawQuadBezier(31, 51, 35, 53.5, 39, 51, C_WHITE, 0.9, 0.9);
  cell.blitLayer(layer, 0, 0, hex('#0c2f59'));
});

// (5,9) Yorick soulPos — Dramatic black-and-amber Shakespearean court jester bust (TRANSPARENT BG!)
reg(5, 9, (cell) => {
  cell.clear();
  const layer = new PixelCell();
  // Split amber-gold (left) & charcoal-black (right) scalloped doublet collar
  layer.fillShadedEllipse(26, 66, 12, 9.5, hex('#ffbe42'), hex('#e68d17'), hex('#a85d08'));
  layer.fillShadedEllipse(44, 66, 12, 9.5, hex('#58636b'), hex('#323a40'), hex('#1d2226'));
  // Decorative vertical gold-studded placket down center
  layer.fillRect(34, 57, 3, 18, C_GOLD_HI);
  for (let py = 60; py <= 72; py += 4) layer.fillCircle(35, py, 1.4, C_WHITE);
  // Golden stud trim on outer collar scallops
  for (let i = -4; i <= 4; i++) {
    layer.fillCircle(35 + i * 4.3, 73 - Math.abs(i) * 0.8, 1.5, i < 0 ? C_INK_DARK : C_GOLD);
  }
  // Sculpted dramatic face
  layer.fillShadedEllipse(35, 47, 11.2, 11.5, C_WHITE, hex('#faf6f0'), hex('#d1ccc4'));
  // Split twin-horned hood: rich amber on left, obsidian charcoal on right!
  drawCurvedProng(layer, 33, 35, 22, 23, 16, 36, 6.2, 2.3, hex('#f09d1f'));
  drawCurvedProng(layer, 37, 35, 48, 23, 54, 36, 6.2, 2.3, hex('#374047'));
  layer.fillCircle(16, 37, 2.2, C_GOLD_HI);
  layer.fillCircle(54, 37, 2.2, C_GOLD_HI);
  // White stud dots along center crown seam
  layer.fillCircle(35, 27, 1.5, C_WHITE);
  layer.fillCircle(35, 32, 1.5, C_WHITE);
  // Intense glowing amber eyes & expressive theatrical mouth
  layer.fillCircle(30, 45, 2.2, C_GOLD);
  layer.fillCircle(40, 45, 2.2, C_GOLD);
  layer.setPx(30, 45, C_INK_DARK);
  layer.setPx(40, 45, C_INK_DARK);
  layer.drawLine(26, 42, 33, 41, C_INK_DARK);
  layer.drawLine(44, 42, 37, 41, C_INK_DARK);
  layer.drawQuadBezier(29, 54, 35, 50, 41, 54, C_RED, 1.6, 1.6);
  layer.drawLine(31, 53, 39, 53, C_WHITE);
  cell.blitLayer(layer, 0, 0, C_INK_DARK);
});

// (6,9) Chicot soulPos — Fiery crimson-hooded court jester bust (TRANSPARENT BG!)
reg(6, 9, (cell) => {
  cell.clear();
  const layer = new PixelCell();
  // Dramatic sharp 4-pointed jagged scarlet jester collar!
  layer.fillPolygon(
    [
      [15, 70],
      [22, 57],
      [48, 57],
      [55, 70],
      [47, 67],
      [49, 78],
      [39, 67],
      [35, 78],
      [31, 67],
      [21, 78],
      [23, 67],
    ],
    C_RED
  );
  layer.fillPolygon([[23, 58], [47, 58], [45, 65], [25, 65]], C_RED_HI);
  // Tiny golden tip bells on jagged points
  for (const [bx, by] of [[15, 70], [21, 78], [35, 78], [49, 78], [55, 70]] as const) {
    layer.fillCircle(bx, by, 1.5, C_GOLD_HI);
  }
  // Sharp aristocratic face
  layer.fillShadedEllipse(35, 46, 10.6, 11.8, C_WHITE, hex('#faf7f5'), hex('#d6cfd0'));
  // Sweeping pointed crimson court hood
  drawCurvedProng(layer, 30, 35, 19, 26, 15, 38, 5.5, 2.0, C_RED);
  drawCurvedProng(layer, 40, 35, 51, 26, 55, 38, 5.5, 2.0, C_RED);
  layer.fillShadedEllipse(35, 31, 13, 8.5, C_RED_HI, C_RED, C_RED_DARK);
  layer.fillCircle(35, 26, 2.0, C_GOLD_HI);
  // Fierce determined eyes & bold crimson smile
  layer.drawLine(27, 42, 33, 44, C_INK_DARK);
  layer.drawLine(43, 42, 37, 44, C_INK_DARK);
  layer.fillCircle(30, 45, 1.7, C_INK_DARK);
  layer.fillCircle(40, 45, 1.7, C_INK_DARK);
  layer.drawQuadBezier(29, 52, 35, 55, 41, 52, C_RED, 1.6, 1.6);
  layer.drawLine(31, 52, 39, 52, C_WHITE);
  cell.blitLayer(layer, 0, 0, hex('#5e161b'));
});

// (7,9) Perkeo soulPos — Festive emerald & scarlet court jester bust (TRANSPARENT BG!)
reg(7, 9, (cell) => {
  cell.clear();
  const layer = new PixelCell();
  // Lush emerald royal doublet cloak with red-and-gold center placket
  layer.fillShadedEllipse(35, 67, 17, 12.5, hex('#4ec995'), hex('#298f66'), hex('#195e42'));
  layer.fillPolygon([[31, 57], [39, 57], [41, 78], [29, 78]], C_RED);
  layer.fillRect(34, 58, 3, 20, C_GOLD_HI);
  // Flowing fiery scarlet-orange curly hair cascading down both sides of face!
  layer.fillShadedCircle(22, 47, 7, hex('#ff7847'), hex('#eb4833'), hex('#b5271d'));
  layer.fillShadedCircle(48, 47, 7, hex('#ff7847'), hex('#eb4833'), hex('#b5271d'));
  layer.fillShadedCircle(21, 55, 5.5, hex('#ff7847'), hex('#eb4833'), hex('#b5271d'));
  layer.fillShadedCircle(49, 55, 5.5, hex('#ff7847'), hex('#eb4833'), hex('#b5271d'));
  // Joyful bright rosy face
  layer.fillShadedEllipse(35, 46, 10.8, 11.2, C_WHITE, hex('#fffaf2'), hex('#e0d5c8'));
  // Festive emerald velvet beret/cap with snowy white curled brim!
  layer.fillShadedEllipse(35, 29, 15, 9.5, hex('#57d4a0'), hex('#2e9c70'), hex('#1a6648'));
  layer.fillShadedEllipse(35, 35, 16, 3.8, C_WHITE, hex('#eef4f2'), hex('#bfd1ca'));
  layer.fillCircle(35, 22, 2.2, C_GOLD_HI);
  // Jovial golden brows, bright eyes, rosy cheeks & joyful grin
  layer.drawQuadBezier(27, 42, 30, 40, 33, 42, C_GOLD, 0.9, 0.9);
  layer.drawQuadBezier(37, 42, 40, 40, 43, 42, C_GOLD, 0.9, 0.9);
  layer.fillCircle(30, 45, 1.8, C_INK_DARK);
  layer.fillCircle(40, 45, 1.8, C_INK_DARK);
  layer.setPx(29, 44, C_WHITE);
  layer.setPx(39, 44, C_WHITE);
  layer.fillCircle(27, 48, 2.0, hex('#ff9c94'));
  layer.fillCircle(43, 48, 2.0, hex('#ff9c94'));
  layer.drawQuadBezier(29, 51, 35, 56, 41, 51, C_RED, 1.8, 1.8);
  layer.drawQuadBezier(31, 51, 35, 53.5, 39, 51, C_WHITE, 1.0, 1.0);
  cell.blitLayer(layer, 0, 0, hex('#1a3b2e'));
});

// (8,9) Locked Joker — Pale slate-blue card wrapped in diagonal iron chains & central padlock!
reg(8, 9, (cell) => {
  initCard(cell, hex('#b6c3d6'), hex('#7c8da6'), hex('#98a8bf'));
  // Subtle inner card frame
  cell.strokeRect(4, 4, 63, 87, hex('#cdd8e8'));
  const lock = new PixelCell();
  // Diagonal metallic chain links from top-left & top-right meeting at center + vertical bottom chain
  const drawChain = (x0: number, y0: number, x1: number, y1: number) => {
    const steps = 11;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = x0 + (x1 - x0) * t;
      const cy = y0 + (y1 - y0) * t;
      lock.fillCircle(cx, cy, 3.0, i % 2 === 0 ? hex('#8f9fb5') : hex('#6b7b91'));
      lock.fillCircle(cx, cy, 1.3, hex('#b6c3d6'));
    }
  };
  drawChain(5, 5, 35, 39);
  drawChain(65, 5, 35, 39);
  drawChain(35, 67, 35, 92);
  // Padlock steel shackle arch
  for (let a = Math.PI; a <= Math.PI * 2; a += 0.08) {
    lock.fillCircle(35 + Math.cos(a) * 10, 44 + Math.sin(a) * 10, 2.5, hex('#9aaab8'));
    lock.fillCircle(35 + Math.cos(a) * 9.5, 43.5 + Math.sin(a) * 9.5, 1.2, hex('#e2eaf2'));
  }
  lock.fillRect(23, 43, 5, 8, hex('#8d9dab'));
  lock.fillRect(43, 43, 5, 8, hex('#8d9dab'));
  // Chunky rounded steel padlock body
  lock.fillShadedEllipse(35, 59, 17, 14, hex('#cfd9e3'), hex('#8a9bad'), hex('#59697a'));
  // Crisp white keyhole cutout
  lock.fillCircle(35, 56, 4.0, C_WHITE);
  lock.fillPolygon([[33, 58], [37, 58], [39, 66], [31, 66]], C_WHITE);
  cell.blitLayer(lock, 0, 0, hex('#3d4b5c'));
});

// (9,9) Undiscovered Joker Silhouette — Clean cool slate-blue card with white JOKER margins!
reg(9, 9, (cell) => {
  initCard(cell, hex('#b0bed6'), hex('#8c9db8'), hex('#9dadca'));
  drawJokerMargins(cell, C_WHITE);
});

// ============================================================================
// ROW 10 (y = 10): Egg, Burglar, Blackboard, Runner, Ice Cream, DNA, Splash, Blue Joker, Sixth Sense, Constellation
// ============================================================================

// (0,10) Egg — Smooth shaded cream oval egg with cheeky grinning Jimbo face painted on shell!
reg(0, 10, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  const egg = new PixelCell();
  // Organic egg silhouette (narrower top, plumper bottom) with warm cream 3-tone shading
  for (let y = 26; y <= 73; y++) {
    const ny = (y - 51) / 23;
    const widthScale = 1 - ny * 0.24;
    const rx = 16.5 * widthScale * Math.sqrt(Math.max(0, 1 - ny * ny));
    for (let x = Math.ceil(35 - rx); x <= Math.floor(35 + rx); x++) {
      const nx = (x - 35) / Math.max(1, rx);
      const lit = -nx * 0.4 - ny * 0.45 + Math.sqrt(Math.max(0, 1 - Math.min(1, nx * nx + ny * ny))) * 0.65;
      if (lit > 0.7) egg.ditherPx(x, y, hex('#f7ecd4'), C_WHITE, (lit - 0.7) / 0.3);
      else if (lit < 0.25) egg.ditherPx(x, y, hex('#ccbba0'), hex('#ebdcb9'), Math.max(0, lit / 0.25));
      else egg.setPx(x, y, hex('#f5e8cc'));
    }
  }
  // Cute cheerful painted jester eyes & smiling red mouth right on the egg!
  egg.drawQuadBezier(26, 46, 29, 43, 32, 46, C_GOLD_DARK, 0.9, 0.9);
  egg.drawQuadBezier(38, 46, 41, 43, 44, 46, C_GOLD_DARK, 0.9, 0.9);
  egg.fillCircle(29, 47, 1.4, C_GOLD);
  egg.fillCircle(41, 47, 1.4, C_GOLD);
  egg.drawQuadBezier(28, 53, 35, 59, 42, 53, C_RED, 1.6, 1.6);
  egg.drawQuadBezier(30, 53, 35, 56, 40, 53, C_WHITE, 0.8, 0.8);
  cell.blitLayer(egg, 0, 0, hex('#8c7d64'), { dx: 1, dy: 2, color: rgba(80, 70, 55, 45) });
});

// (1,10) Burglar — Monochrome striped knit beanie, striped prison sweater & black bandit mask!
reg(1, 10, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  const bg = new PixelCell();
  // Striped burglar turtleneck sweater shoulders
  bg.fillShadedEllipse(35, 68, 17, 11, hex('#58656e'), hex('#3c474f'), hex('#242b30'));
  for (let y = 58; y <= 78; y += 4) {
    for (let x = 18; x <= 52; x++) {
      if (bg.getA(x, y) > 0) bg.setPx(x, y, hex('#eef3f7'));
      if (bg.getA(x, y + 1) > 0) bg.setPx(x, y + 1, hex('#dce4eb'));
    }
  }
  // Rounded pale face
  bg.fillShadedEllipse(35, 48, 11.5, 12, C_WHITE, C_SKIN, C_SKIN_SHADE);
  // Black domino bandit mask across eyes!
  bg.fillEllipse(35, 46, 11.2, 3.8, C_INK_DARK);
  bg.fillEllipse(30, 46, 2.8, 1.8, C_WHITE);
  bg.fillEllipse(40, 46, 2.8, 1.8, C_WHITE);
  bg.setPx(30, 46, C_INK_DARK);
  bg.setPx(40, 46, C_INK_DARK);
  // Striped knit burglar beanie pulled snug over forehead
  bg.fillShadedEllipse(35, 34, 12.2, 10, hex('#58656e'), hex('#3c474f'), hex('#242b30'));
  for (let y = 26; y <= 38; y += 4) {
    for (let x = 23; x <= 47; x++) {
      if (bg.getA(x, y) > 0) bg.setPx(x, y, hex('#eef3f7'));
    }
  }
  bg.fillRect(23, 37, 25, 3, hex('#374247'));
  // Sneaky wide red grin
  bg.drawQuadBezier(28, 53, 35, 59, 42, 53, C_RED, 1.8, 1.8);
  bg.drawQuadBezier(30, 53, 35, 56, 40, 53, C_WHITE, 1.0, 1.0);
  cell.blitLayer(bg, 0, 0, C_INK_DARK);
});

// (2,10) Blackboard — Wood-framed dark classroom chalkboard with dusty white-chalk sketched jester!
reg(2, 10, (cell) => {
  initCard(cell, hex('#415c4c'), hex('#8a6b40'));
  // Warm oak wood classroom board frame
  cell.strokeRect(2, 2, 67, 91, hex('#a68352'));
  cell.strokeRect(3, 3, 65, 89, hex('#7a5b32'));
  // Subtle dusty chalk smudges on slate-green board
  for (let y = 5; y < 88; y++) {
    for (let x = 5; x < 66; x++) {
      const smudge = Math.sin(x * 0.12 + y * 0.08) * Math.cos(x * 0.09 - y * 0.11);
      if (smudge > 0.55) cell.ditherPx(x, y, hex('#415c4c'), hex('#51705d'), 0.45);
    }
  }
  drawJokerMargins(cell, hex('#e6f0e9'));
  // Crisp white chalk-line drawn jester on slate green!
  drawJester(cell, {
    hatCenter: hex('#43614f'),
    hatSide: hex('#43614f'),
    collar: hex('#43614f'),
    face: hex('#4b6b58'),
    faceShade: hex('#3d5948'),
    browCol: hex('#e6f0e9'),
    smileCol: hex('#e6f0e9'),
    eyeCol: hex('#e6f0e9'),
    bell: hex('#e6f0e9'),
    outline: hex('#eef7f1'),
  });
  // Piece of white chalk resting on bottom wooden ledge!
  cell.fillRect(14, 87, 13, 3, hex('#f5f7f5'));
  cell.fillRect(14, 89, 13, 1, hex('#c4cfc8'));
});

// (3,10) Runner — Marathon runner jester with wild red hair, blue sweatband & race bib #345!
reg(3, 10, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  const r = new PixelCell();
  // Athletic shoulders & white/gold marathon tank singlet
  r.fillShadedEllipse(35, 68, 18, 12, C_WHITE, hex('#f5f7fa'), hex('#d3dce6'));
  r.fillRect(23, 58, 5, 18, C_GOLD);
  r.fillRect(43, 58, 5, 18, C_GOLD);
  // Pinned race bib "#345" on chest!
  r.fillRect(25, 65, 21, 12, C_WHITE);
  r.strokeRect(25, 65, 21, 12, hex('#9aa8b5'));
  drawMicroText(r, '#345', 35, 69, C_INK_DARK, { align: 'center' });
  // Head & spiky red runner hair
  r.fillShadedEllipse(35, 45, 11, 12, C_WHITE, C_SKIN, C_SKIN_SHADE);
  for (let i = -3; i <= 3; i++) {
    r.fillShadedCircle(35 + i * 4.2, 29 + Math.abs(i) * 1.4, 4.4, C_RED_HI, C_RED, C_RED_DARK);
  }
  // Bright cobalt athletic sweatband across forehead!
  r.fillRect(23, 33, 25, 5, C_BLUE);
  r.fillRect(23, 34, 25, 2, C_BLUE_HI);
  // Energetic eyebrows, gleaming eyes & wide joyful grin
  r.drawQuadBezier(27, 41, 30, 39, 33, 41, C_GOLD_DARK, 0.8, 0.8);
  r.drawQuadBezier(37, 41, 40, 39, 43, 41, C_GOLD_DARK, 0.8, 0.8);
  r.fillCircle(30, 44, 1.8, C_INK_DARK);
  r.fillCircle(40, 44, 1.8, C_INK_DARK);
  r.drawQuadBezier(28, 49, 35, 55, 42, 49, C_RED, 1.8, 1.8);
  r.drawQuadBezier(30, 49, 35, 52.5, 40, 49, C_WHITE, 1.0, 1.0);
  cell.blitLayer(r, 0, 0, C_INK);
});

// (4,10) Ice Cream — Bright sky-blue backdrop with triple-scoop dripping waffle cone!
reg(4, 10, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillDitherGradV(3, 3, 65, 89, hex('#58c0f7'), hex('#3298e6'));
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#165a99') });
  const ic = new PixelCell();
  // Crisp toasted golden waffle cone with diamond criss-cross grid
  ic.fillPolygon([[23, 49], [47, 49], [41, 83], [29, 83]], hex('#d99b43'));
  ic.fillPolygon([[24, 49], [35, 49], [34, 82], [29, 82]], hex('#edb458'));
  ic.fillPolygon([[39, 49], [47, 49], [41, 82], [37, 82]], hex('#ad7226'));
  for (let i = -3; i <= 5; i++) {
    ic.drawLine(24, 52 + i * 6, 46, 42 + i * 6, hex('#9c631c'));
    ic.drawLine(24, 48 + i * 6, 46, 58 + i * 6, hex('#9c631c'));
  }
  // 3 luscious multi-tone melting scoops (mango left, strawberry right, blue-sprinkle top!)
  ic.fillShadedCircle(27, 42, 10.2, hex('#ffe070'), hex('#f5a623'), hex('#c4700a'));
  ic.fillShadedCircle(43, 42, 10.2, hex('#ff8a82'), hex('#f24949'), hex('#b51e2b'));
  ic.fillShadedCircle(35, 29, 11.2, hex('#8ce0ff'), hex('#299ef2'), hex('#1462b0'));
  // Colorful melting ice-cream drips cascading down waffle cone
  ic.drawLine(23, 47, 23, 59, hex('#f5a623'), 1.8);
  ic.drawLine(35, 49, 35, 65, hex('#299ef2'), 1.6);
  ic.drawLine(45, 48, 45, 61, hex('#f24949'), 1.7);
  // Festive rainbow candy sprinkles on top blue scoop!
  for (const [sx, sy, sc] of [
    [30, 25, C_RED],
    [35, 22, C_GOLD_HI],
    [40, 26, C_GREEN],
    [33, 30, C_WHITE],
    [38, 32, C_RED],
    [28, 31, C_GOLD_HI],
  ] as const) {
    ic.fillRect(sx, sy, 2, 1, sc);
  }
  cell.blitLayer(ic, 0, 0, hex('#3b2814'), { dx: 1, dy: 2, color: rgba(15, 65, 115, 65) });
});

// (5,10) DNA — Crisp white card with vibrant 3D-shaded red & cobalt double-helix DNA strand!
reg(5, 10, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  const dna = new PixelCell();
  const rungs = [C_GOLD, C_BLUE_HI, C_RED_HI, C_GOLD_HI];
  // First pass: horizontal base-pair rungs connecting the two intertwined helices
  for (let y = 13; y <= 82; y += 5) {
    const ph = (y - 12) * 0.125;
    const x1 = 35 + Math.sin(ph) * 12;
    const x2 = 35 - Math.sin(ph) * 12;
    const mid = (x1 + x2) * 0.5;
    const cL = rungs[Math.floor(y / 5) % rungs.length]!;
    const cR = rungs[(Math.floor(y / 5) + 2) % rungs.length]!;
    dna.drawLine(x1, y, mid, y, cL, 1.2);
    dna.drawLine(mid, y, x2, y, cR, 1.2);
  }
  // Second pass: depth-sorted smooth glossy cobalt & crimson double-helix backbones!
  for (let y = 10; y <= 85; y++) {
    const ph = (y - 12) * 0.125;
    const x1 = 35 + Math.sin(ph) * 12;
    const x2 = 35 - Math.sin(ph) * 12;
    const z1 = Math.cos(ph);
    // Draw back strand first, front strand second for true 3D twist!
    if (z1 < 0) {
      dna.fillCircle(x1, y, 2.8, C_RED);
      dna.setPx(x1 - 1, y - 1, C_RED_HI);
      dna.fillCircle(x2, y, 3.0, C_BLUE);
      dna.setPx(x2 - 1, y - 1, C_BLUE_HI);
    } else {
      dna.fillCircle(x2, y, 2.8, C_BLUE);
      dna.setPx(x2 - 1, y - 1, C_BLUE_HI);
      dna.fillCircle(x1, y, 3.0, C_RED);
      dna.setPx(x1 - 1, y - 1, C_RED_HI);
    }
  }
  cell.blitLayer(dna, 0, 0, C_INK, { dx: 1, dy: 1, color: rgba(45, 55, 70, 35) });
});

// (6,10) Splash — Deep ocean-slate card with frothy white-and-azure water crown splash & ripples!
reg(6, 10, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillDitherGradV(3, 3, 65, 55, hex('#465b6b'), hex('#5f7d94'));
    c.fillDitherGradV(3, 56, 65, 36, hex('#7ca6db'), hex('#9bc2f2'));
    // Concentric surface water ripples
    for (let r = 10; r <= 28; r += 6) {
      for (let a = 0; a < 40; a++) {
        const ang = (a / 40) * Math.PI * 2;
        c.setPx(35 + Math.cos(ang) * r, 73 + Math.sin(ang) * (r * 0.28), hex('#e0f3ff'));
      }
    }
    // Dynamic erupting liquid crown splash arching outward with frothy curling crests!
    const sp = new PixelCell();
    sp.fillShadedEllipse(35, 65, 19, 8.5, C_WHITE, hex('#c4e8ff'), hex('#7eb5e6'));
    sp.fillPolygon([[19, 64], [14, 42], [25, 52], [32, 31], [38, 49], [48, 33], [49, 53], [58, 45], [52, 65]], hex('#b0deff'));
    const arcs: Array<[number, number, number, number, number, number]> = [
      [22, 62, 11, 48, 10, 32],
      [27, 58, 21, 39, 27, 23],
      [35, 56, 36, 38, 43, 25],
      [42, 58, 52, 43, 58, 34],
      [48, 62, 59, 52, 62, 43],
    ];
    for (const [x0, y0, cx, cy, x1, y1] of arcs) {
      sp.drawQuadBezier(x0, y0, cx, cy, x1, y1, hex('#99ceff'), 4.4, 1.6);
      sp.drawQuadBezier(x0, y0 - 1, cx - 1, cy - 1, x1, y1, C_WHITE, 2.4, 0.9);
      sp.fillCircle(x1, y1, 2.2, C_WHITE);
    }
    for (const [dx, dy, dr] of [[15, 22, 2.0], [28, 15, 2.1], [44, 17, 2.3], [56, 26, 2.0], [18, 36, 1.8], [52, 42, 1.9], [36, 19, 1.6]] as const) {
      sp.fillCircle(dx, dy, dr, C_WHITE);
    }
    c.blitLayer(sp, 0, 0, hex('#3a5c80'));
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#2a3c4a') });
});

// (7,10) Blue Joker — Pale icy diagonally striped card with frosted all-blue jester!
reg(7, 10, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    for (let y = 3; y <= 91; y++) {
      for (let x = 3; x <= 67; x++) {
        const stripe = ((x + y) >> 3) % 2 === 0;
        c.setPx(x, y, stripe ? hex('#b8d9ff') : hex('#d9ecff'));
      }
    }
  });
  drawJokerMargins(cell, hex('#1d5ca8'));
  drawJester(cell, {
    hatCenter: hex('#4db8ff'),
    hatSide: hex('#268ce6'),
    collar: hex('#3b82d6'),
    face: hex('#99e0ff'),
    faceShade: hex('#5cb8f5'),
    browCol: hex('#145299'),
    smileCol: hex('#0c63cc'),
    eyeCol: hex('#0a3b78'),
    bell: hex('#d9f5ff'),
    outline: hex('#134685'),
  });
});

// (8,10) Sixth Sense — Mystic lavender oracle jester with radiant third eye & psychic halo!
reg(8, 10, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  // Glowing violet psychic halo behind head
  cell.fillCircle(35, 42, 19, rgba(185, 115, 240, 55));
  cell.fillCircle(35, 42, 15, rgba(215, 160, 255, 85));
  cell.drawLine(35, 14, 35, 25, hex('#c47ef5'), 1.1);
  // Golden-ochre mystic cloak + lavender hood + radiant forehead third eye!
  drawJester(cell, {
    cy: 49,
    hatStyle: 'none',
    collarStyle: 'cape',
    hatCenter: hex('#b57ae6'),
    hatSide: hex('#b57ae6'),
    collar: hex('#b89458'),
    collarAlt: hex('#8f6c38'),
    face: hex('#faf2ff'),
    faceShade: hex('#dec9f0'),
    browCol: hex('#7a3eb8'),
    smileCol: hex('#b542c9'),
    eyeCol: hex('#642b9e'),
    thirdEye: true,
    outline: hex('#542d78'),
  });
  // Framed violet cowl arc around head
  const cowl = new PixelCell();
  for (let a = Math.PI * 0.9; a <= Math.PI * 2.1; a += 0.05) {
    cowl.fillCircle(35 + Math.cos(a) * 14, 42 + Math.sin(a) * 15, 2.8, hex('#9e5fd4'));
  }
  cell.blitLayer(cowl, 0, 0, hex('#5a2c85'));
});

// (9,10) Constellation — Deep night-sky starfield with glowing white constellation lines tracing a jester!
reg(9, 10, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    drawMarbleSwirl(c, hex('#243840'), hex('#354f59'), hex('#486873'), 91, 0.13, 2.2, 0.4);
    // Faint astral silhouette of jester
    drawJester(c, {
      hatCenter: rgba(155, 200, 215, 65),
      hatSide: rgba(155, 200, 215, 65),
      collar: rgba(155, 200, 215, 65),
      face: rgba(180, 225, 240, 75),
      faceShade: rgba(120, 165, 180, 70),
      browCol: rgba(255, 255, 255, 90),
      smileCol: rgba(255, 255, 255, 95),
      eyeCol: hex('#1c2d33'),
      outline: rgba(185, 230, 245, 90),
    });
    // Crisp glowing constellation lines & bright star vertices connecting hat, eyes, collar!
    const nodes: Array<[number, number]> = [
      [35, 18],
      [18, 35],
      [52, 35],
      [30, 44],
      [40, 44],
      [35, 53],
      [20, 69],
      [35, 74],
      [50, 69],
    ];
    const edges: Array<[number, number]> = [
      [0, 1], [0, 2], [1, 3], [2, 4], [3, 4], [3, 5], [4, 5], [5, 6], [5, 7], [5, 8], [6, 7], [7, 8],
    ];
    for (const [a, b] of edges) {
      const [x0, y0] = nodes[a]!;
      const [x1, y1] = nodes[b]!;
      c.drawLine(x0, y0, x1, y1, rgba(210, 245, 255, 160));
    }
    for (const [nx, ny] of nodes) {
      c.fillRect(nx - 2, ny, 5, 1, rgba(200, 245, 255, 180));
      c.fillRect(nx, ny - 2, 1, 5, rgba(200, 245, 255, 180));
      c.fillCircle(nx, ny, 1.3, C_WHITE);
    }
    // Background twinkling star dust
    for (let i = 0; i < 24; i++) {
      c.setPx(6 + Math.floor(hash2(i, 3, 91) * 59), 6 + Math.floor(hash2(i, 8, 91) * 82), hex('#d8f4ff'));
    }
  });
  drawJokerMargins(cell, C_WHITE);
});

// ============================================================================
// ROW 11 (y = 11): Hiker, Faceless, Green, Superposition, To Do List, Cavendish, Card Sharp, Red Card, Madness, Square
// ============================================================================

// (0,11) Hiker — Bearded outdoorsman in forest cap, ginger beard, blue parka & orange hiking pack!
reg(0, 11, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  const hk = new PixelCell();
  // Bulky orange hiking backpack & rolled green sleeping pad peeking behind shoulders
  hk.fillShadedEllipse(19, 54, 6, 13, hex('#ffaa40'), hex('#e67e17'), hex('#a85308'));
  hk.fillShadedEllipse(51, 54, 6, 13, hex('#ffaa40'), hex('#e67e17'), hex('#a85308'));
  hk.fillRect(19, 31, 33, 8, hex('#4a8f63'));
  hk.drawLine(22, 18, 22, 33, hex('#7d8c96'), 1.2);
  // Blue alpine hiking jacket & orange backpack shoulder straps
  hk.fillShadedEllipse(35, 70, 17, 13, hex('#47a8eb'), hex('#1d7ac4'), hex('#114d85'));
  hk.fillRect(24, 59, 4, 19, hex('#e67e17'));
  hk.fillRect(43, 59, 4, 19, hex('#e67e17'));
  hk.fillRect(34, 62, 3, 18, hex('#135891'));
  // Rounded pale face + lush full ginger beard!
  hk.fillShadedEllipse(35, 47, 10.5, 11.5, C_WHITE, C_SKIN, C_SKIN_SHADE);
  hk.fillShadedEllipse(35, 56, 10.5, 8.2, hex('#eb5c3b'), hex('#c93d24'), hex('#8c2214'));
  // Forest-green adventurer baseball cap with curved visor
  hk.fillShadedEllipse(35, 34, 12, 8.5, hex('#4fa874'), hex('#2e7d50'), hex('#1b5233'));
  hk.fillShadedEllipse(35, 39, 14, 3.2, hex('#2e7d50'), hex('#1b5233'), hex('#123822'));
  hk.fillCircle(35, 33, 2.2, C_GOLD_HI);
  // Friendly eyes & cheerful mouth peeking through ginger beard
  hk.fillCircle(31, 45, 1.7, C_INK_DARK);
  hk.fillCircle(39, 45, 1.7, C_INK_DARK);
  hk.drawQuadBezier(30, 51, 35, 55, 40, 51, C_WHITE, 1.3, 1.3);
  cell.blitLayer(hk, 0, 0, C_INK_DARK);
});

// (1,11) Faceless Joker — Classic Jimbo hood & blue collar with smooth blank white oval face!
reg(1, 11, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    hatCenter: C_RED,
    hatSide: C_GOLD,
    collar: C_BLUE,
    expr: 'blank',
  });
});

// (2,11) Green Joker — All-emerald leafy jester on crisp white card
reg(2, 11, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    hatCenter: hex('#378a65'),
    hatSide: hex('#4eb082'),
    collar: hex('#5ac292'),
    face: hex('#f0faf5'),
    faceShade: hex('#c7e6d6'),
    browCol: hex('#1e6144'),
    smileCol: hex('#277a56'),
    eyeCol: hex('#164732'),
    bell: hex('#99e8c3'),
    outline: hex('#184d36'),
  });
});

// (3,11) Superposition — Split crimson/azure quantum wave field with "A" sphere & up/down arrows!
reg(3, 11, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    for (let y = 3; y <= 91; y++) {
      for (let x = 3; x <= 67; x++) {
        const w = Math.sin(x * 0.14 + y * 0.08) * 6;
        const t = (x + w - 3) / 64;
        if (t < 0.45) c.ditherPx(x, y, hex('#40a6e8'), hex('#7bc7f5'), t / 0.45);
        else if (t < 0.55) c.ditherPx(x, y, hex('#7bc7f5'), hex('#e87b88'), (t - 0.45) / 0.1);
        else c.ditherPx(x, y, hex('#e87b88'), hex('#db4f5e'), (t - 0.55) / 0.45);
      }
    }
    const q = new PixelCell();
    // Upward azure quantum spin arrow
    q.fillPolygon([[35, 11], [44, 23], [38, 23], [38, 35], [32, 35], [32, 23], [26, 23]], C_BLUE);
    // Downward crimson quantum spin arrow
    q.fillPolygon([[35, 83], [44, 71], [38, 71], [38, 59], [32, 59], [32, 71], [26, 71]], C_RED);
    // Split glowing glossy orb in center
    for (let dy = -14; dy <= 14; dy++) {
      for (let dx = -14; dx <= 14; dx++) {
        if (dx * dx + dy * dy > 196) continue;
        const px = 35 + dx;
        const py = 47 + dy;
        const isRight = dx > 0;
        const lit = (-dx * 0.4 - dy * 0.5 + Math.sqrt(Math.max(0, 196 - dx * dx - dy * dy)) * 0.06);
        const base = isRight ? hex('#2270c4') : hex('#d93848');
        const hi = isRight ? hex('#6ec4ff') : hex('#ff7a85');
        const dk = isRight ? hex('#11407a') : hex('#8f1a28');
        if (lit > 6.5) q.setPx(px, py, hi);
        else if (lit < -4) q.setPx(px, py, dk);
        else q.setPx(px, py, base);
      }
    }
    // Crisp bold white "A" in center of quantum sphere!
    drawMicroText(q, 'A', 35, 42, C_WHITE, { align: 'center', scale: 2, shadow: C_INK_DARK });
    c.blitLayer(q, 0, 0, C_INK_DARK);
  });
  drawJokerMargins(cell, C_WHITE, { shadow: C_INK_DARK });
});

// (4,11) To Do List — Yellow ruled legal notepad with blue handwritten checklist!
reg(4, 11, (cell) => {
  initCard(cell, hex('#f7f099'), hex('#cfc467'), hex('#e6dc7a'));
  // Subtle crumpled notepad top binding shadow & pale cyan ruled lines
  cell.fillRect(2, 2, 67, 4, hex('#e8df7e'));
  for (let y = 17; y < 90; y += 11) {
    cell.fillRect(3, y, 65, 1, hex('#8ac4d4'));
  }
  // Vertical pink-red notepad margin rule
  cell.fillRect(10, 3, 1, 89, rgba(230, 110, 110, 115));
  // Bold blue-ink "TO DO" header & underline
  drawMicroText(cell, 'TO DO', 36, 7, hex('#1964b5'), { align: 'center', scale: 2 });
  cell.fillRect(13, 18, 46, 2, hex('#1964b5'));
  // Neat handwritten-feel checklist items!
  const items = ['-JOG', '-OIL CHG', '-KARATE', '-CANDY', '-THINK'];
  for (let i = 0; i < items.length; i++) {
    const iy = 23 + i * 13;
    drawMicroText(cell, items[i]!, 11, iy, hex('#1d6ec2'), { scale: 1, spacing: 1 });
    // Slight pen scribble underlines / checkmarks
    if (i === 0 || i === 3) {
      cell.drawLine(14, iy + 2, 34 + i * 4, iy + 2, rgba(25, 100, 181, 120));
    }
  }
});

// (5,11) Cavendish — Radiant olive-green & yellow sunburst halo behind gleaming golden banana!
reg(5, 11, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    for (let y = 3; y <= 91; y++) {
      for (let x = 3; x <= 67; x++) {
        const ang = Math.atan2(y - 47, x - 35);
        const ray = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 24) % 2;
        c.setPx(x, y, ray === 0 ? hex('#f5f08c') : hex('#758f3d'));
      }
    }
    // Radiant golden aura circle in center
    c.fillCircle(35, 47, 22, rgba(255, 250, 180, 70));
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#43541d') });
  const ban = new PixelCell();
  // Iconic grand upright-curved Cavendish banana with glowing bright white rim!
  drawCurvedProng(ban, 39, 15, 22, 47, 45, 79, 5.2, 8.8, hex('#f7e031'));
  ban.fillCircle(45, 79, 5.0, hex('#e8c91a'));
  ban.drawQuadBezier(36, 20, 24, 48, 41, 75, hex('#fffab8'), 2.0, 1.4);
  ban.drawQuadBezier(40, 20, 30, 48, 45, 75, hex('#c79f14'), 0.7, 0.6);
  ban.drawLine(40, 14, 44, 10, hex('#7a5c28'), 2.2);
  ban.fillCircle(47, 81, 2.2, hex('#5e431a'));
  cell.blitLayer(ban, 0, 0, C_WHITE, { dx: 1, dy: 2, color: rgba(65, 80, 25, 80) });
});

// (6,11) Card Sharp — Mysterious dark hoodie pulled over head + dark reflective sunglasses!
reg(6, 11, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  const cs = new PixelCell();
  // Dark slate hoodie body & hood rim framing face
  cs.fillShadedEllipse(35, 68, 19, 13, hex('#5c7078'), hex('#3d4e54'), hex('#253136'));
  cs.fillShadedEllipse(35, 44, 17, 19, hex('#5c7078'), hex('#3d4e54'), hex('#253136'));
  // Inner recessed dark hood opening
  cs.fillEllipse(35, 46, 12.5, 13.5, hex('#232d30'));
  // Pale face emerging from shadows inside hood
  cs.fillShadedEllipse(35, 48, 9.8, 10.8, C_WHITE, C_SKIN, C_SKIN_SHADE);
  // Sleek glossy dark sunglasses!
  cs.fillRect(25, 43, 9, 6, C_INK_DARK);
  cs.fillRect(37, 43, 9, 6, C_INK_DARK);
  cs.fillRect(34, 44, 3, 2, C_INK_DARK);
  cs.drawLine(27, 44, 30, 47, C_WHITE);
  cs.drawLine(39, 44, 42, 47, C_WHITE);
  // Confident sly red grin
  cs.drawQuadBezier(29, 53, 35, 58, 41, 53, C_RED, 1.7, 1.7);
  cs.drawQuadBezier(31, 53, 35, 55.5, 39, 53, C_WHITE, 0.9, 0.9);
  // White hoodie drawstrings hanging down front
  cs.drawLine(29, 61, 28, 76, hex('#d4dfe6'), 0.9);
  cs.drawLine(41, 61, 42, 76, hex('#d4dfe6'), 0.9);
  cell.blitLayer(cs, 0, 0, C_INK_DARK);
});

// (7,11) Red Card — Bold vibrant matte soccer-referee red card with subtle grain & discreet JOKER!
reg(7, 11, (cell) => {
  initCard(cell, hex('#f25249'), hex('#c9342e'), hex('#d93f38'));
  // Subtle matte plastic/cardboard sheen & gentle diagonal warmth
  for (let y = 2; y <= 92; y++) {
    for (let x = 2; x <= 68; x++) {
      const sheen = Math.sin(x * 0.06 + y * 0.05) * 0.35 + (hash2(x, y, 71) - 0.5) * 0.25;
      if (sheen > 0.28) cell.setPx(x, y, hex('#fa645c'));
      else if (sheen < -0.25) cell.setPx(x, y, hex('#e3443c'));
    }
  }
  // Top-left faint glossy highlight
  cell.drawLine(5, 4, 40, 4, hex('#ff8a82'));
  cell.drawLine(4, 5, 4, 35, hex('#ff8a82'));
  // Discreet tiny red-embossed JOKER in bottom right
  drawMicroText(cell, 'JOKER', 47, 84, hex('#b82823'));
});

// (8,11) Madness — Blood-red hypnotic swirling vortex + crazed glowing yellow-eyed jester!
reg(8, 11, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    drawMarbleSwirl(c, hex('#a81f24'), hex('#de3535'), hex('#ff6157'), 811, 0.16, 3.0, 0.8);
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#5e0f12') });
  drawJester(cell, {
    hatStyle: 'none',
    hatCenter: C_RED,
    hatSide: C_RED,
    collar: C_BLUE,
    face: C_WHITE,
    faceShade: hex('#ffd9d6'),
    browCol: C_RED_DARK,
    smileCol: C_RED,
    expr: 'manic',
    outline: hex('#611116'),
    shadow: true,
  });
});

// (9,11) Square Joker — SQUARE 71x71 CARD (bottom 24px transparent!) with blocky 8-bit Jimbo!
reg(9, 11, (cell) => {
  cell.clear();
  const sqMask = makeRoundedRectMask(1, 1, 69, 69, 3);
  const sqInner = makeRoundedRectMask(2, 2, 68, 68, 2);
  for (let y = 1; y <= 69; y++) {
    for (let x = 1; x <= 69; x++) {
      const idx = y * CELL_W + x;
      if (!sqMask[idx]) continue;
      cell.setPx(x, y, sqInner[idx] ? C_WHITE : C_CARD_BORDER);
    }
  }
  cell.mask = sqInner;
  // Compact vertical JOKER margins tailored to the 71x71 square!
  drawJokerMargins(cell, C_INK, { yTop: 6, yBot: 64 });
  // Super-charming chunky 8-bit square-block pixel Jimbo!
  const px = (gx: number, gy: number, gw: number, gh: number, col: RGBA) => {
    cell.fillRect(15 + gx * 4, 7 + gy * 4, gw * 4, gh * 4, col);
  };
  // Square red hat block + gold side blocks
  px(3, 0, 5, 4, C_RED);
  px(2, 1, 1, 3, C_RED);
  px(0, 3, 2, 3, C_GOLD);
  px(8, 3, 2, 3, C_GOLD);
  px(2, 4, 6, 1, C_GOLD);
  // Square white face block + pixel eyes & square smile
  px(2, 5, 6, 5, C_WHITE);
  px(2, 5, 6, 1, C_SKIN_SHADE);
  px(3, 6, 1, 1, C_INK_DARK);
  px(6, 6, 1, 1, C_INK_DARK);
  px(3, 8, 4, 1, C_RED);
  // Square blue ruffled collar blocks
  px(1, 10, 8, 3, C_BLUE);
  px(2, 13, 2, 1, C_BLUE_DARK);
  px(6, 13, 2, 1, C_BLUE_DARK);
  // Crisp thin outline around square pixel character
  cell.strokeRect(23, 27, 24, 20, C_INK);
  cell.strokeRect(19, 47, 32, 12, C_INK);
  cell.strokeRect(27, 7, 20, 16, C_INK);
});

// ============================================================================
// ROW 12 (y = 12): Séance, Riff-Raff, Vampire, Shortcut, Hologram Base, Vagabond, Baron, Cloud 9, Rocket, Obelisk
// ============================================================================

// (0,12) Séance — Draped violet parlor curtains & wooden round table with glowing ghostly flame!
reg(0, 12, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillDitherGradV(3, 3, 65, 89, hex('#282e47'), hex('#3d4363'));
    // Parted heavy violet-slate velvet curtains curving down left & right
    for (let y = 3; y <= 91; y++) {
      const pull = Math.round(18 * Math.sin(Math.min(1, y / 52) * Math.PI * 0.5) + (y > 52 ? (y - 52) * 0.15 : 0));
      const leftEdge = 28 - Math.round(pull * 0.7);
      const rightEdge = 42 + Math.round(pull * 0.7);
      for (let x = 3; x <= leftEdge; x++) {
        c.setPx(x, y, x % 5 < 2 ? hex('#5e6787') : hex('#444b69'));
      }
      for (let x = rightEdge; x <= 67; x++) {
        c.setPx(x, y, x % 5 < 2 ? hex('#5e6787') : hex('#444b69'));
      }
    }
    // Ethereal radial aura above table
    c.fillCircle(35, 51, 17, rgba(190, 220, 255, 40));
    c.fillCircle(35, 52, 11, rgba(225, 242, 255, 65));
    // Round antique wooden séance table & turned legs
    c.fillShadedEllipse(35, 66, 21, 5.5, hex('#bd9b68'), hex('#8c6b3d'), hex('#5c4221'));
    c.fillRect(32, 70, 7, 21, hex('#4f3c5c'));
    c.drawLine(25, 71, 21, 91, hex('#473554'), 2.2);
    c.drawLine(45, 71, 49, 91, hex('#473554'), 2.2);
    // Ghostly curling spectral flame rising above tabletop!
    const wisp = new PixelCell();
    wisp.fillShadedEllipse(35, 56, 6, 8, C_WHITE, hex('#e8f6ff'), hex('#a8cce6'));
    wisp.drawQuadBezier(35, 50, 31, 43, 38, 36, C_WHITE, 2.8, 0.7);
    wisp.drawQuadBezier(36, 52, 41, 45, 34, 39, hex('#d4eeff'), 1.6, 0.5);
    c.blitLayer(wisp, 0, 0);
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#1e2236') });
});

// (1,12) Riff-Raff — Clean textured pale card with HILARIOUSLY TINY miniature Jimbo in dead center!
reg(1, 12, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  // Subtle ultra-pale silver-blue ornamental wallpaper pattern
  for (let y = 5; y < 90; y += 6) {
    for (let x = 5; x < 66; x += 6) {
      if (((x + y) / 6) % 2 === 0) {
        cell.fillRect(x, y, 4, 2, hex('#edf2f7'));
        cell.fillRect(x + 1, y - 1, 2, 4, hex('#edf2f7'));
      }
    }
  }
  // Tiny miniature 11x13 Jimbo right in the middle of the giant empty card!
  cell.fillRect(33, 39, 5, 3, C_RED);
  cell.fillRect(30, 41, 3, 2, C_GOLD);
  cell.fillRect(38, 41, 3, 2, C_GOLD);
  cell.fillRect(32, 42, 7, 5, C_WHITE);
  cell.setPx(33, 43, C_INK_DARK);
  cell.setPx(37, 43, C_INK_DARK);
  cell.fillRect(33, 45, 5, 1, C_RED);
  cell.fillRect(30, 47, 11, 3, C_BLUE);
  cell.fillRect(32, 50, 2, 2, C_BLUE_DARK);
  cell.fillRect(37, 50, 2, 2, C_BLUE_DARK);
  // Tiny micro "JOKER" caption underneath
  drawMicroText(cell, 'JOKER', 35, 55, C_INK_SOFT, { align: 'center' });
});

// (2,12) Vampire — Gothic pale vampire jester with widow's peak, glowing red eyes, bloody fangs & high cape!
reg(2, 12, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    cy: 48,
    hatStyle: 'none',
    collarStyle: 'cape',
    hatCenter: hex('#2d383d'),
    hatSide: hex('#2d383d'),
    collar: hex('#37444a'),
    collarAlt: C_RED_DARK,
    face: hex('#f5f7f7'),
    faceShade: hex('#cdd6d9'),
    browCol: C_INK_DARK,
    eyeCol: C_RED,
    smileCol: C_RED_DARK,
    fangs: true,
    expr: 'mad',
    outline: C_INK_DARK,
  });
  // Slicked black Dracula widow's-peak hair
  const hair = new PixelCell();
  hair.fillShadedEllipse(35, 31, 12.5, 8.5, hex('#4a585e'), hex('#2c363b'), hex('#1a2024'));
  hair.fillPolygon([[23, 35], [35, 42], [47, 35], [44, 28], [26, 28]], hex('#2c363b'));
  hair.fillCircle(23, 43, 3.0, hex('#f0f4f5')); // Pointed ear hint
  hair.fillCircle(47, 43, 3.0, hex('#f0f4f5'));
  cell.blitLayer(hair, 0, 0, C_INK_DARK);
});

// (3,12) Shortcut — Sunlit cobblestone Mediterranean alleyway shortcut leading toward bright blue sky!
reg(3, 12, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    // Sunny sky strip down the alley canyon
    c.fillDitherGradV(3, 3, 65, 38, hex('#4db8ff'), hex('#b8ebff'));
    c.fillEllipse(42, 14, 14, 4, C_WHITE);
    // Left shadowed teal-grey building facade receding in perspective
    c.fillPolygon([[3, 15], [34, 34], [34, 71], [3, 86]], hex('#6a8a9c'));
    c.fillPolygon([[3, 15], [18, 25], [18, 79], [3, 86]], hex('#516f80'));
    // Left windows & doorways
    c.fillRect(8, 36, 7, 13, hex('#354d5c'));
    c.fillRect(21, 44, 6, 11, hex('#354d5c'));
    c.fillRect(10, 62, 8, 16, hex('#402c22'));
    // Right sunlit warm cream-ochre Mediterranean building receding in perspective
    c.fillPolygon([[67, 18], [41, 36], [41, 71], [67, 86]], hex('#f2e2b8'));
    c.fillPolygon([[67, 18], [56, 26], [56, 80], [67, 86]], hex('#faeec8'));
    // Cute red-and-white striped café awning on right building!
    c.fillPolygon([[54, 44], [67, 40], [67, 50], [54, 52]], C_RED);
    c.drawLine(58, 43, 58, 51, C_WHITE, 1.3);
    c.drawLine(63, 41, 63, 50, C_WHITE, 1.3);
    // Perspective cobblestone shortcut alley floor!
    c.fillPolygon([[34, 70], [41, 70], [67, 91], [3, 91]], hex('#949c8f'));
    c.fillPolygon([[36, 70], [41, 70], [62, 91], [42, 91]], hex('#c7c4a5'));
    c.fillPolygon([[34, 70], [38, 70], [40, 91], [3, 91]], hex('#67787a'));
    // Distant alley arch & clothesline across gap
    c.drawQuadBezier(18, 32, 37, 37, 55, 34, hex('#404d54'), 0.4, 0.4);
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#374752') });
});

// (4,12) Hologram Base — Solid deep slate-teal card with ONLY white JOKER margins (soulPos (2,9) floats over!)
reg(4, 12, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillDitherGradV(3, 3, 65, 89, hex('#4b5e63'), hex('#3d4e52'));
  });
  drawJokerMargins(cell, C_WHITE);
});

// (5,12) Vagabond — Weathered ragged-edged parchment sign with sad hobo clown portrait!
reg(5, 12, (cell) => {
  cell.clear();
  // Organically torn tattered cardboard/parchment silhouette!
  const torn = new Uint8Array(CELL_W * CELL_H);
  for (let y = 2; y <= 92; y++) {
    const leftX = 3 + Math.round(Math.sin(y * 0.35) * 1.5 + hash2(1, y >> 1, 512) * 2.2);
    const rightX = 67 - Math.round(Math.cos(y * 0.4) * 1.5 + hash2(2, y >> 1, 512) * 2.2);
    for (let x = leftX; x <= rightX; x++) {
      const topY = 2 + Math.round(Math.sin(x * 0.3) * 1.6 + hash2(x >> 1, 3, 512) * 1.8);
      const botY = 92 - Math.round(Math.cos(x * 0.32) * 1.6 + hash2(x >> 1, 4, 512) * 1.8);
      if (y >= topY && y <= botY) torn[y * CELL_W + x] = 1;
    }
  }
  cell.mask = torn;
  // Aged stained cardboard/parchment fill
  for (let y = 2; y <= 92; y++) {
    for (let x = 2; x <= 68; x++) {
      if (!torn[y * CELL_W + x]) continue;
      const stain = Math.sin(x * 0.1 + y * 0.08) * 0.5 + (hash2(x, y, 512) - 0.5) * 0.35;
      cell.setPx(x, y, stain > 0.25 ? hex('#d4a86a') : stain < -0.25 ? hex('#edd09a') : hex('#e3bd80'));
    }
  }
  // Distressed blue hand-painted JOKER margins
  drawJokerMargins(cell, hex('#2e659e'));
  // Sad weathered hobo clown portrait in battered brown bowler hat & patchy red/blue coat
  const v = new PixelCell();
  v.fillShadedEllipse(35, 70, 18, 12, hex('#c75240'), hex('#9e3a2d'), hex('#6e251c'));
  // Patched blue denim vest lapels & shabby red tie
  v.fillPolygon([[23, 58], [32, 76], [21, 76]], hex('#3b6fa3'));
  v.fillPolygon([[47, 58], [38, 76], [49, 76]], hex('#3b6fa3'));
  v.fillPolygon([[33, 60], [37, 60], [38, 79], [32, 79]], C_RED);
  // Weathered stubbly face
  v.fillShadedEllipse(35, 47, 11.2, 12, hex('#e8d5b8'), hex('#d6be9c'), hex('#a8906e'));
  v.fillEllipse(35, 53, 10, 6, hex('#6c757d')); // Heavy 5-o'clock hobo beard shadow!
  v.fillShadedCircle(35, 48, 2.7, C_RED_HI, C_RED, C_RED_DARK); // Classic red clown nose
  // Sad blue teardrop eye makeup & droopy eyes
  v.fillEllipse(30, 44, 3.0, 3.4, hex('#3b73b5'));
  v.fillEllipse(40, 44, 3.0, 3.4, hex('#3b73b5'));
  v.fillCircle(30, 44, 1.4, C_WHITE);
  v.fillCircle(40, 44, 1.4, C_WHITE);
  v.setPx(30, 45, C_INK_DARK);
  v.setPx(40, 45, C_INK_DARK);
  // Sad drooping mouth
  v.drawQuadBezier(29, 55, 35, 51, 41, 55, C_WHITE, 1.6, 1.6);
  v.drawQuadBezier(30, 55, 35, 52, 40, 55, C_INK_DARK, 0.7, 0.7);
  // Battered patched brown bowler hat with little white ticket tucked in band!
  v.fillShadedEllipse(35, 31, 13, 9, hex('#b86d42'), hex('#8c4c29'), hex('#592d16'));
  v.fillShadedEllipse(35, 36, 17, 3.5, hex('#9e5a33'), hex('#6e3a1d'), hex('#472310'));
  v.fillRect(25, 29, 6, 4, hex('#f7f2e4')); // Little white card tucked in hatband!
  cell.blitLayer(v, 0, 0, hex('#3d2514'));
  // Darkened torn paper edge border
  cell.mask = null;
  for (let y = 1; y < CELL_H - 1; y++) {
    for (let x = 1; x < CELL_W - 1; x++) {
      if (torn[y * CELL_W + x]) continue;
      if (torn[y * CELL_W + x - 1] || torn[y * CELL_W + x + 1] || torn[(y - 1) * CELL_W + x] || torn[(y + 1) * CELL_W + x]) {
        cell.setPx(x, y, hex('#9e7a46'));
      }
    }
  }
});

// (6,12) Baron — Proud aristocratic jester king in tall jeweled gold crown & spotted ermine royal cloak!
reg(6, 12, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    cy: 49,
    hatStyle: 'crown',
    collarStyle: 'royal',
    hatCenter: C_GOLD,
    hatSide: C_GOLD,
    collar: hex('#c9384a'),
    browCol: C_GOLD_DARK,
    smileCol: C_RED,
    expr: 'smirk',
  });
});

// (7,12) Cloud 9 — Bright sunny cerulean sky with giant puffy white cumulus cloud shaped into a "9"!
reg(7, 12, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillDitherGradV(3, 3, 65, 89, hex('#40a6f2'), hex('#9cd8fc'));
    // Fluffy background cumulus clouds near horizon & top
    c.fillEllipse(15, 76, 13, 6, C_WHITE);
    c.fillEllipse(54, 18, 12, 4.5, hex('#e8f7ff'));
    c.fillEllipse(56, 82, 12, 5, C_WHITE);
    // Giant sculpted puffy white cumulus cloud shaped into an unmistakable numeral "9"!
    const c9 = new PixelCell();
    // Puffy shaded cloud puffs arranged along the ring + curved tail of a "9"
    const puffs: Array<[number, number, number]> = [
      [35, 22, 8.5],
      [25, 27, 7.5],
      [45, 28, 7.8],
      [22, 37, 7.5],
      [46, 39, 7.8],
      [31, 46, 7.2],
      [43, 49, 7.5],
      [41, 59, 6.8],
      [37, 68, 6.2],
      [35, 76, 5.5],
    ];
    // Underside sky-blue cloud shadow first
    for (const [px, py, pr] of puffs) {
      c9.fillCircle(px + 1.5, py + 2.5, pr, hex('#a2d2f2'));
    }
    // Crisp bright white cloud body
    for (const [px, py, pr] of puffs) {
      c9.fillCircle(px, py, pr * 0.92, C_WHITE);
    }
    // Open sky hole right inside the top loop of the "9"!
    c9.fillCircle(34, 34, 4.5, hex('#5cb8f5'));
    c.blitLayer(c9, 0, 0);
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#236fa8') });
});

// (8,12) Rocket — Starry space card with retro silver-and-crimson rocket ship blasting upward on fiery exhaust!
reg(8, 12, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillDitherGradV(3, 3, 65, 89, hex('#242b3b'), hex('#3d475e'));
    // Crisp twinkling stars & warm sparkles
    for (let i = 0; i < 32; i++) {
      const sx = 6 + Math.floor(hash2(i, 4, 812) * 59);
      const sy = 5 + Math.floor(hash2(i, 9, 812) * 82);
      c.setPx(sx, sy, i % 5 === 0 ? C_GOLD_HI : C_WHITE);
    }
    // Blazing roaring orange/gold/white rocket exhaust plume at bottom!
    c.fillPolygon([[27, 67], [43, 67], [51, 91], [19, 91]], hex('#eb4b36'));
    c.fillPolygon([[29, 67], [41, 67], [46, 91], [24, 91]], hex('#ff9c2a'));
    c.fillPolygon([[31, 67], [39, 67], [41, 88], [29, 88]], hex('#ffe670'));
    c.fillPolygon([[33, 67], [37, 67], [37, 79], [33, 79]], C_WHITE);
    // Sleek retro rocket ship!
    const r = new PixelCell();
    // Sweeping red tail fins
    r.fillPolygon([[22, 48], [13, 66], [17, 74], [26, 65]], C_RED);
    r.fillPolygon([[48, 48], [57, 66], [53, 74], [44, 65]], C_RED_DARK);
    // Rocket fuselage hull (smooth curved aerodynamic silver body)
    r.fillShadedEllipse(35, 42, 13.5, 27, C_WHITE, hex('#d4dfe8'), hex('#8a9ba8'));
    // Crimson nose cone tip
    r.fillPolygon([[35, 11], [25, 27], [45, 27]], C_RED);
    r.fillPolygon([[35, 11], [25, 27], [34, 27]], C_RED_HI);
    // Thruster nozzle bell
    r.fillPolygon([[27, 65], [43, 65], [45, 71], [25, 71]], hex('#5c6c78'));
    // Circular gleaming blue cockpit porthole window!
    r.fillShadedCircle(35, 39, 6.2, hex('#c4d2de'), hex('#7c8d9c'), hex('#4a5863'));
    r.fillShadedCircle(35, 39, 4.3, hex('#a8f0ff'), hex('#32a8eb'), hex('#156099'));
    r.setPx(33, 37, C_WHITE);
    // Center red vertical tail stabilizer fin
    r.fillRect(34, 54, 3, 17, C_RED);
    c.blitLayer(r, 0, 0, hex('#1a202b'));
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#181d29') });
});

// (9,12) Obelisk — Towering dark monolith under blinding solar flare with glowing violet ancient runes!
reg(9, 12, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    // Glowing twilight atmosphere behind obelisk apex
    c.fillDitherStopsV(3, 3, 65, 72, [hex('#47657a'), hex('#7fa4bd'), hex('#c9dce8'), hex('#b8a58e')]);
    // Desert sand horizon below
    c.fillDitherGradV(3, 73, 65, 19, hex('#9e8669'), hex('#7a654d'));
    // Radiant celestial solar flare right behind pyramid tip!
    c.fillCircle(35, 16, 17, rgba(255, 255, 255, 75));
    c.fillCircle(35, 16, 10, rgba(255, 255, 255, 135));
    c.drawLine(35, 3, 35, 30, C_WHITE);
    c.drawLine(14, 16, 56, 16, C_WHITE);
    // Towering dark-slate monolithic obelisk!
    c.fillPolygon([[35, 15], [45, 24], [52, 77], [18, 77], [25, 24]], hex('#475259'));
    c.fillPolygon([[35, 15], [35, 77], [18, 77], [25, 24]], hex('#58656e'));
    c.fillPolygon([[35, 15], [45, 24], [52, 77], [35, 77]], hex('#374047'));
    // Glowing magenta-violet alien/ancient carved runes descending the obelisk face!
    for (let row = 0; row < 8; row++) {
      const ry = 28 + row * 5;
      const rw = 5 + (row % 3) * 2;
      c.drawLine(35 - rw, ry, 35 + rw, ry, hex('#e08aff'));
      if (row % 2 === 0) {
        c.fillRect(35 - rw + 1, ry - 2, 2, 4, hex('#f0b8ff'));
        c.fillRect(35 + rw - 2, ry - 1, 2, 3, hex('#c45ef0'));
      } else {
        c.fillCircle(35, ry, 1.5, hex('#f7d4ff'));
      }
    }
    // Blinding star gleam right on top pyramidion
    c.fillCircle(35, 15, 3.0, C_WHITE);
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#2d3740') });
});

// ============================================================================
// ROW 13 (y = 13): Midas Mask, Luchador, Photograph, Gift Card, Turtle Bean, Erosion, Reserved Parking, Mail-In Rebate, To the Moon, Hallucination
// ============================================================================

// (0,13) Midas Mask — Gilded baroque gold damask backdrop with glossy alabaster theatrical mask & gold ribbons!
reg(0, 13, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    drawMarbleSwirl(c, hex('#a8782b'), hex('#cfa048'), hex('#ebd07c'), 130, 0.19, 3.0, 0.4);
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#6e4b12') });
  const m = new PixelCell();
  // Flowing golden silk ribbon ties fluttering from both sides of mask
  m.drawQuadBezier(22, 47, 13, 41, 10, 50, C_GOLD_HI, 1.5, 1.0);
  m.drawQuadBezier(48, 47, 57, 42, 60, 36, C_GOLD_HI, 1.5, 1.0);
  m.drawQuadBezier(35, 31, 35, 22, 39, 17, C_GOLD_HI, 1.6, 0.9);
  // Sculpted ivory porcelain theatre mask
  m.fillShadedEllipse(35, 48, 13, 15.5, C_WHITE, hex('#f7f4eb'), hex('#c9c2b2'));
  // Subtle sculpted cheekbones & nose bridge
  m.drawLine(35, 42, 35, 51, hex('#d4cdbd'), 1.2);
  // Hollow dark mask eye cutouts & painted crimson lips
  m.fillEllipse(29, 45, 3.0, 2.0, C_INK_DARK);
  m.fillEllipse(41, 45, 3.0, 2.0, C_INK_DARK);
  m.drawQuadBezier(26, 41, 29, 39, 32, 41, C_GOLD_DARK, 0.7, 0.7);
  m.drawQuadBezier(38, 41, 41, 39, 44, 41, C_GOLD_DARK, 0.7, 0.7);
  m.fillEllipse(35, 56, 4.5, 2.1, C_RED);
  m.drawLine(31, 56, 39, 56, C_INK_DARK);
  cell.blitLayer(m, 0, 0, hex('#5e4110'), { dx: 1, dy: 2, color: rgba(85, 55, 12, 75) });
});

// (1,13) Luchador — Heroic masked Mexican wrestler holding a gleaming golden championship belt!
reg(1, 13, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  const lc = new PixelCell();
  // Muscular torso in crisp white-and-blue wrestling singlet
  lc.fillShadedEllipse(35, 65, 17, 13, C_WHITE, hex('#f2f6fa'), hex('#c8d4e0'));
  lc.fillRect(25, 56, 21, 19, hex('#1a78cc'));
  lc.fillRect(30, 56, 11, 11, C_WHITE);
  // Iconic blue-and-white patterned Luchador mask head!
  lc.fillShadedEllipse(35, 39, 12, 13.5, hex('#40a6f2'), hex('#1573c4'), hex('#0b4b8a'));
  // Crisp white lightning/flame mask emblem on forehead & around eyes!
  lc.fillPolygon([[35, 26], [31, 35], [39, 35]], C_WHITE);
  lc.fillEllipse(29, 38, 4.2, 3.0, C_WHITE);
  lc.fillEllipse(41, 38, 4.2, 3.0, C_WHITE);
  lc.fillCircle(29, 38, 1.6, C_INK_DARK);
  lc.fillCircle(41, 38, 1.6, C_INK_DARK);
  // Open mouth cutout with confident toothy red-lipped grin
  lc.fillEllipse(35, 47, 7.2, 4.5, C_WHITE);
  lc.drawQuadBezier(30, 47, 35, 51, 40, 47, C_RED, 1.4, 1.4);
  lc.drawLine(31, 47, 39, 47, C_WHITE);
  // Heavy black-and-gold Championship Title Belt slung over left shoulder!
  lc.drawQuadBezier(20, 56, 16, 67, 29, 79, hex('#374247'), 4.2, 4.2);
  lc.fillShadedEllipse(26, 66, 8.5, 6.8, C_GOLD_HI, C_GOLD, C_GOLD_DARK);
  lc.fillCircle(26, 66, 2.5, C_RED);
  cell.blitLayer(lc, 0, 0, C_INK_DARK);
});

// (2,13) Photograph — Vintage Polaroid instant-photo frame (bottom 17px transparent!) with pastel studio portrait!
reg(2, 13, (cell) => {
  cell.clear();
  const polMask = makeRoundedRectMask(1, 1, 69, 77, 2);
  const polInner = makeRoundedRectMask(2, 2, 68, 76, 1);
  for (let y = 1; y <= 77; y++) {
    for (let x = 1; x <= 69; x++) {
      const idx = y * CELL_W + x;
      if (!polMask[idx]) continue;
      cell.setPx(x, y, polInner[idx] ? hex('#fcfaf5') : C_CARD_BORDER);
    }
  }
  // Thick classic Polaroid white bottom margin with handwritten-feel "JOKER" caption!
  drawMicroText(cell, 'JOKER', 35, 67, C_INK, { align: 'center', spacing: 2 });
  // Square glossy vintage photo aperture (x=6..64, y=6..60)
  cell.mask = makeRoundedRectMask(6, 6, 64, 60, 1);
  // Dreamy retro studio lavender-blue gradient backdrop
  cell.fillDitherStopsV(6, 6, 59, 55, [hex('#786a94'), hex('#998ab5'), hex('#c4b4d9')]);
  // Soft sunlit vintage vignette glow
  cell.fillCircle(35, 28, 22, rgba(255, 240, 215, 38));
  // Smiling vintage sepia-pastel jester portrait holding 2 tiny cards!
  drawJester(cell, {
    cx: 35,
    cy: 34,
    hatCenter: hex('#d97b82'),
    hatSide: hex('#d9b675'),
    collar: hex('#8fa0d4'),
    face: hex('#fff7ed'),
    faceShade: hex('#e0d1c5'),
    browCol: hex('#9c7b59'),
    smileCol: hex('#c9636b'),
    eyeCol: hex('#4f4761'),
    outline: hex('#5e5270'),
  });
  // Warm golden sleeves & two little held playing cards in foreground
  cell.fillShadedEllipse(16, 56, 9, 7, hex('#e8cf89'), hex('#c9aa5d'), hex('#997c38'));
  cell.fillShadedEllipse(54, 56, 9, 7, hex('#e8cf89'), hex('#c9aa5d'), hex('#997c38'));
  drawMiniCard(cell, 31, 52, { pipCol: C_RED, pips: 1 });
  drawMiniCard(cell, 36, 54, { pipCol: C_INK, pips: 1 });
  // Photo inner dark edge bevel
  cell.mask = null;
  cell.strokeRect(6, 6, 59, 55, hex('#d4ced9'));
});

// (3,13) Gift Card — Full-bleed coral-red wrapped present tied with golden satin ribbon bow & gift tag!
reg(3, 13, (cell) => {
  initCard(cell, hex('#f25a52'), hex('#c93a32'), hex('#db443d'));
  // Subtle matte wrapping-paper highlight
  for (let y = 2; y <= 92; y++) {
    for (let x = 2; x <= 68; x++) {
      if ((x + y) % 11 === 0) cell.setPx(x, y, hex('#fa6c64'));
    }
  }
  // Vertical & horizontal shimmering golden satin wrapping ribbons!
  cell.fillRect(19, 2, 13, 91, C_GOLD);
  cell.fillRect(21, 2, 3, 91, C_GOLD_HI);
  cell.fillRect(29, 2, 3, 91, C_GOLD_DARK);
  cell.fillRect(2, 26, 67, 13, C_GOLD);
  cell.fillRect(2, 28, 67, 3, C_GOLD_HI);
  cell.fillRect(2, 36, 67, 3, C_GOLD_DARK);
  // Plump sculpted 4-loop satin golden gift bow centered at (25, 32)!
  const bow = new PixelCell();
  bow.fillShadedEllipse(15, 24, 9, 5.5, C_GOLD_HI, C_GOLD, C_GOLD_DARK);
  bow.fillShadedEllipse(36, 24, 9, 5.5, C_GOLD_HI, C_GOLD, C_GOLD_DARK);
  bow.fillShadedEllipse(15, 39, 8.5, 5.2, C_GOLD_HI, C_GOLD, C_GOLD_DARK);
  bow.fillShadedEllipse(37, 40, 8.5, 5.2, C_GOLD_HI, C_GOLD, C_GOLD_DARK);
  bow.fillShadedCircle(25, 32, 5.2, C_GOLD_HI, C_GOLD, C_GOLD_DARK);
  cell.blitLayer(bow, 0, 0, hex('#a6680c'));
  // Tilted crisp white gift tag reading "TO:JOKER" in bottom right!
  const tag = new PixelCell();
  tag.fillPolygon([[34, 71], [63, 66], [65, 76], [36, 81]], C_WHITE);
  tag.drawLine(34, 71, 63, 66, hex('#d4c9bc'));
  tag.drawLine(36, 81, 65, 76, hex('#d4c9bc'));
  drawMicroText(tag, 'TO:JKR', 49, 71, C_RED, { align: 'center' });
  cell.blitLayer(tag, 0, 0, undefined, { dx: 1, dy: 2, color: rgba(145, 25, 20, 85) });
});

// (4,13) Turtle Bean — Sage-green woven tile pattern with plump glossy black turtle bean!
reg(4, 13, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillRect(3, 3, 65, 89, hex('#7ca679'));
    for (let y = 4; y < 91; y += 6) {
      for (let x = 4; x < 67; x += 6) {
        c.fillRect(x, y, 4, 4, hex('#648c61'));
        c.setPx(x + 1, y + 1, hex('#8cb889'));
      }
    }
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#3b5939') });
  const bean = new PixelCell();
  // Iconic curved kidney/turtle bean shape with glossy charcoal-slate shading!
  drawCurvedProng(bean, 34, 24, 51, 47, 32, 71, 10.5, 11.2, hex('#4f5c63'));
  bean.fillShadedEllipse(36, 31, 12.5, 11, hex('#78878f'), hex('#4f5c63'), hex('#2d363b'));
  bean.fillShadedEllipse(35, 62, 13, 12, hex('#78878f'), hex('#4f5c63'), hex('#2d363b'));
  // Characteristic pale hilum eye notch on inner concave side!
  bean.fillEllipse(24, 48, 3.0, 5.2, hex('#cfd9de'));
  bean.fillEllipse(23, 48, 1.5, 3.5, hex('#7ca679'));
  // Glossy curved white bean sheen
  bean.drawQuadBezier(41, 28, 47, 45, 40, 62, hex('#96a8b2'), 1.5, 1.0);
  bean.drawQuadBezier(42, 30, 46, 38, 44, 45, C_WHITE, 0.9, 0.6);
  cell.blitLayer(bean, 0, 0, hex('#1d2429'), { dx: 1, dy: 2, color: rgba(35, 60, 35, 75) });
});

// (5,13) Erosion — Cracked terracotta canyon cliffs carved by branching turquoise river streams & moss!
reg(5, 13, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    // Rich warm sandstone/terracotta cliff ridges
    drawMarbleSwirl(c, hex('#8f5429'), hex('#bf793d'), hex('#de9b59'), 135, 0.16, 2.2, 1.2);
    // Branching eroded turquoise river streams winding from top to bottom!
    const streams: Array<[number, number, number, number, number, number]> = [
      [25, 3, 18, 34, 29, 62],
      [29, 62, 36, 77, 24, 91],
      [52, 3, 43, 28, 56, 54],
      [56, 54, 48, 72, 54, 91],
      [29, 62, 41, 56, 56, 54],
    ];
    for (const [x0, y0, cx, cy, x1, y1] of streams) {
      c.drawQuadBezier(x0, y0, cx, cy, x1, y1, hex('#378099'), 2.6, 2.2);
      c.drawQuadBezier(x0, y0, cx, cy, x1, y1, hex('#6be0e8'), 1.3, 1.0);
    }
    // Lush little emerald moss tufts clinging to damp eroded rocks
    for (const [mx, my] of [[15, 24], [38, 42], [22, 69], [46, 64], [58, 33], [32, 84]] as const) {
      c.fillCircle(mx, my, 3.2, hex('#5cb85c'));
      c.fillCircle(mx + 2, my - 1, 2.2, hex('#8fe374'));
    }
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#5e3214') });
});

// (6,13) Reserved Parking — Bold scarlet-and-white metal street sign with double arrow & car icon!
reg(6, 13, (cell) => {
  initCard(cell, hex('#f24b44'), hex('#c92d27'), hex('#d93832'));
  cell.strokeRect(3, 3, 65, 89, C_WHITE);
  // Bold white street sign header
  drawMicroText(cell, 'RESERVED', 35, 8, C_WHITE, { align: 'center', scale: 1, spacing: 2 });
  drawMicroText(cell, 'PARKING', 35, 18, C_WHITE, { align: 'center', scale: 2, spacing: 1 });
  // Bold crisp white double-headed horizontal arrow in center!
  cell.fillRect(18, 43, 35, 7, C_WHITE);
  cell.fillPolygon([[7, 46], [20, 35], [20, 58]], C_WHITE);
  cell.fillPolygon([[63, 46], [50, 35], [50, 58]], C_WHITE);
  // Framed miniature parked car emblem box below arrow
  cell.strokeRect(14, 62, 43, 17, C_WHITE, 2);
  // Tiny crisp white car silhouette inside box
  cell.fillRect(21, 71, 29, 5, C_WHITE);
  cell.fillPolygon([[26, 71], [30, 65], [42, 65], [46, 71]], C_WHITE);
  cell.fillRect(29, 67, 5, 3, hex('#f24b44'));
  cell.fillRect(36, 67, 6, 3, hex('#f24b44'));
  cell.fillCircle(26, 76, 2.3, C_WHITE);
  cell.fillCircle(45, 76, 2.3, C_WHITE);
  // Bottom municipal bylaw plate
  drawMicroText(cell, 'BYLAW JOK-ER', 35, 83, C_WHITE, { align: 'center' });
});

// (7,13) Mail-In Rebate — Vintage airmail postcard with red/blue diagonal edge stripes, stamp & address!
reg(7, 13, (cell) => {
  initCard(cell, hex('#fcfaf2'), C_CARD_BORDER, C_CARD_LIP);
  // Iconic alternating diagonal red & blue airmail stripes around ALL 4 postcard edges!
  for (let i = -20; i < 160; i += 10) {
    const col = ((i / 10) & 1) === 0 ? C_RED : C_BLUE;
    // Top & bottom border bands (thickness 4px)
    for (let t = 0; t < 4; t++) {
      for (let d = 0; d < 5; d++) {
        cell.setPx(i + d - t, 2 + t, col);
        cell.setPx(i + d - t, 89 + t, col);
      }
    }
    // Left & right border bands
    for (let t = 0; t < 4; t++) {
      for (let d = 0; d < 5; d++) {
        cell.setPx(2 + t, i + d - t, col);
        cell.setPx(65 + t, i + d - t, col);
      }
    }
  }
  // Clean cream inner postcard body
  cell.fillRect(6, 6, 59, 83, hex('#fcfaf2'));
  // Colorful corner postage stamp top-left!
  cell.fillRect(10, 10, 17, 21, C_BLUE);
  cell.strokeRect(10, 10, 17, 21, hex('#d4dce3'));
  cell.fillCircle(18, 20, 5, C_GOLD);
  cell.fillCircle(18, 17, 3, C_RED);
  // Wavy black postal cancellation ink lines sweeping down from stamp!
  for (let k = 0; k < 4; k++) {
    const sx = 12 + k * 4;
    for (let y = 26; y <= 62; y++) {
      const wx = sx + Math.sin(y * 0.28) * 2.2;
      cell.setPx(wx, y, C_INK_SOFT);
    }
  }
  // Crisp sideways postal mailing address on right half!
  drawSidewaysText(cell, 'JACK JOKER', 49, 25, C_INK_DARK, 'cw', 1);
  drawSidewaysText(cell, '124 W 87 ST', 40, 22, C_INK, 'cw', 1);
  drawSidewaysText(cell, 'NEW YORK NY', 32, 22, C_INK, 'cw', 1);
});

// (8,13) To the Moon — Dark financial chart grid with red/green stock curve rocketing vertically UP!
reg(8, 13, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillDitherGradV(3, 3, 65, 89, hex('#3c5954'), hex('#2a423e'));
    // Crisp dark-teal financial graph gridlines
    for (let x = 9; x < 66; x += 7) c.fillRect(x, 3, 1, 89, rgba(160, 210, 195, 32));
    for (let y = 9; y < 90; y += 7) c.fillRect(3, y, 65, 1, rgba(160, 210, 195, 32));
    // Stock ticker chart bouncing low along bottom then rocketing exponentially UP!
    const pts: Array<[number, number]> = [
      [5, 76], [10, 72], [15, 78], [20, 73], [26, 79], [32, 74], [38, 77],
      [44, 71], [49, 64], [53, 52], [56, 36], [59, 17], [61, 4],
    ];
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0] = pts[i]!;
      const [x1, y1] = pts[i + 1]!;
      const up = y1 < y0;
      c.drawLine(x0, y0, x1, y1, up ? hex('#4ef285') : hex('#ff5252'), 1.0);
    }
    // Glowing green moonshot highlight dot at top apex
    c.fillCircle(61, 5, 2.2, hex('#b0ffcb'));
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#1e302d') });
});

// (9,13) Hallucination — Trippy surreal collage of giant popping smiling jester & floating cards!
reg(9, 13, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    // Surreal dark starry sky top band fading to bright chaotic white lower burst
    c.fillRect(3, 3, 65, 30, hex('#37424a'));
    for (let i = 0; i < 12; i++) {
      c.fillCircle(8 + Math.floor(hash2(i, 3, 913) * 55), 6 + Math.floor(hash2(i, 7, 913) * 20), 1.6, C_WHITE);
    }
    c.fillRect(3, 33, 65, 59, C_WHITE);
    // Giant zoomed-in angled bursting Jimbo portrait filling right & center!
    drawJester(c, {
      cx: 41,
      cy: 49,
      hatCenter: C_RED,
      hatSide: C_GOLD,
      hatSideR: hex('#ff8c1a'),
      collar: C_BLUE,
      browCol: C_GOLD,
      smileCol: C_RED,
      expr: 'crazy',
      outline: C_WHITE,
    });
    // Floating skewed mini cards & surreal geometric dots orbiting him
    drawMiniCard(c, 15, 62, { pipCol: C_INK, pips: 1 });
    drawMiniCard(c, 53, 59, { pipCol: C_RED, pips: 2 });
    c.fillCircle(14, 79, 3.0, C_RED);
    c.fillCircle(56, 82, 3.0, C_INK);
    c.fillCircle(42, 85, 2.5, C_RED);
  });
});

// ============================================================================
// ROW 14 (y = 14): Sly, Wily, Clever, Devious, Crafty, Lucky Cat, Baseball Card, Bull, Diet Cola, Trading Card
// ============================================================================

// (0,14) Sly Joker (Pair Chips)
reg(0, 14, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    cy: 43,
    hatStyle: 'tall',
    collarStyle: 'striped',
    hatCenter: hex('#69b3e0'),
    hatSide: hex('#568db5'),
    collar: hex('#7dbce8'),
    collarAlt: hex('#4f6b85'),
    browCol: hex('#376285'),
    smileCol: C_BLUE,
    eyeCol: hex('#264c73'),
    expr: 'sly',
  });
  drawMiniCardFan(cell, 2, 'white', 82);
});

// (1,14) Wily Joker (3oaK Chips)
reg(1, 14, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    cy: 43,
    hatStyle: 'tall',
    collarStyle: 'striped',
    hatCenter: hex('#5a9c7d'),
    hatSide: hex('#c2d45b'),
    collar: hex('#7eb59d'),
    collarAlt: hex('#3b6e56'),
    browCol: hex('#2d5e48'),
    smileCol: C_BLUE,
    eyeCol: hex('#1e4d3a'),
    expr: 'sly',
  });
  drawMiniCardFan(cell, 3, 'white', 82);
});

// (2,14) Clever Joker (Two Pair Chips)
reg(2, 14, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    cy: 43,
    hatStyle: 'tall',
    collarStyle: 'striped',
    hatCenter: hex('#e68e73'),
    hatSide: hex('#c95b7a'),
    collar: hex('#de6c85'),
    collarAlt: hex('#7a3e6e'),
    browCol: hex('#8c3556'),
    smileCol: C_BLUE,
    eyeCol: hex('#592340'),
    expr: 'sly',
  });
  drawMiniCardFan(cell, 4, 'white', 82);
});

// (3,14) Devious Joker (Straight Chips)
reg(3, 14, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    cy: 43,
    hatStyle: 'tall',
    collarStyle: 'striped',
    hatCenter: hex('#f27850'),
    hatSide: hex('#4ec2e6'),
    collar: hex('#f2c252'),
    collarAlt: hex('#cc5d35'),
    browCol: hex('#a64526'),
    smileCol: C_BLUE,
    eyeCol: hex('#265578'),
    expr: 'sly',
  });
  drawMiniCardFan(cell, 5, 'straight', 82);
});

// (4,14) Crafty Joker (Flush Chips)
reg(4, 14, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  drawJester(cell, {
    cy: 43,
    hatStyle: 'tall',
    collarStyle: 'striped',
    hatCenter: hex('#eb504c'),
    hatSide: hex('#4a545c'),
    collar: hex('#de4c4c'),
    collarAlt: hex('#434d54'),
    browCol: hex('#374244'),
    smileCol: C_BLUE,
    eyeCol: hex('#263238'),
    expr: 'sly',
  });
  drawMiniCardFan(cell, 5, 'flushBlue', 82);
});

// (5,14) Lucky Cat — Adorable Japanese Maneki-neko white calico cat holding gleaming gold koban coin!
reg(5, 14, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  const cat = new PixelCell();
  // Plump seated white porcelain cat body
  cat.fillShadedEllipse(35, 62, 16, 17, C_WHITE, hex('#fafcff'), hex('#cfd8e3'));
  // Raised beckoning right paw!
  cat.fillShadedEllipse(50, 42, 5.2, 9.5, C_WHITE, hex('#f7f9fc'), hex('#cbd5e0'));
  cat.fillCircle(50, 35, 2.2, hex('#ffadb8'));
  // Cute seated bottom paws
  cat.fillShadedEllipse(24, 75, 5.5, 4.5, C_WHITE, hex('#f2f6fa'), hex('#c8d2de'));
  cat.fillShadedEllipse(46, 75, 5.5, 4.5, C_WHITE, hex('#f2f6fa'), hex('#c8d2de'));
  // Rounded calico cat head + triangular cat ears
  cat.fillShadedEllipse(35, 38, 13.5, 11.5, C_WHITE, hex('#fafcff'), hex('#cfd8e3'));
  cat.fillPolygon([[22, 33], [22, 21], [31, 28]], C_WHITE);
  cat.fillPolygon([[48, 33], [48, 21], [39, 28]], C_WHITE);
  // Calico ear patches (warm orange & charcoal) + pink inner ears
  cat.fillPolygon([[39, 28], [48, 21], [48, 31]], hex('#f29c24'));
  cat.fillPolygon([[24, 24], [24, 30], [28, 28]], hex('#ff99a8'));
  cat.fillPolygon([[46, 24], [46, 30], [42, 28]], hex('#ff99a8'));
  cat.fillCircle(26, 31, 3.2, hex('#4f5b63'));
  // Adorable squinting happy cat eyes, pink nose, whiskers & red collar with gold bell!
  cat.drawQuadBezier(26, 39, 29, 36, 32, 39, C_INK_DARK, 0.8, 0.8);
  cat.drawQuadBezier(38, 39, 41, 36, 44, 39, C_INK_DARK, 0.8, 0.8);
  cat.fillCircle(35, 42, 1.5, hex('#ff7085'));
  cat.drawQuadBezier(32, 44, 35, 46, 38, 44, C_INK_DARK, 0.7, 0.7);
  cat.drawLine(20, 41, 25, 41, C_INK_SOFT);
  cat.drawLine(45, 41, 50, 41, C_INK_SOFT);
  // Red silk collar & gleaming golden bell
  cat.fillRect(24, 48, 23, 4, C_RED);
  cat.fillShadedCircle(35, 53, 3.2, C_GOLD_HI, C_GOLD, C_GOLD_DARK);
  // Large gleaming oval Japanese golden Koban coin held on chest!
  cat.fillShadedEllipse(35, 66, 7.2, 10.5, C_GOLD_HI, C_GOLD, C_GOLD_DARK);
  cat.fillRect(32, 62, 7, 1, C_GOLD_DARK);
  cat.fillRect(32, 66, 7, 1, C_GOLD_DARK);
  cat.fillRect(32, 70, 7, 1, C_GOLD_DARK);
  cell.blitLayer(cat, 0, 0, C_INK);
});

// (6,14) Baseball Card — Retro painted sports card with sky/field backdrop, ballplayer jester & bat!
reg(6, 14, (cell) => {
  initCard(cell, hex('#f7f2e6'), C_CARD_BORDER, C_CARD_LIP);
  // Classic painted vintage baseball card art panel
  cell.mask = makeRoundedRectMask(5, 5, 65, 89, 1);
  cell.fillDitherStopsV(5, 5, 61, 55, [hex('#e8f2f5'), hex('#b8e0d2'), hex('#6eb88d')]);
  cell.fillDitherGradV(5, 60, 61, 30, hex('#4f9468'), hex('#366e4a'));
  // Baseball player jester portrait in pinstriped jersey & red cap holding wooden bat!
  const bb = new PixelCell();
  // Diagonal golden wooden baseball bat resting on right shoulder!
  bb.drawLine(44, 72, 62, 16, hex('#d49a48'), 3.4);
  bb.drawLine(43, 72, 61, 16, hex('#f0c273'), 1.3);
  // Crisp white pinstriped jersey + blue sleeves & red batting gloves
  bb.fillShadedEllipse(33, 66, 21, 24, C_WHITE, hex('#eef3f5'), hex('#c8d4db'));
  for (let x = 18; x <= 48; x += 5) bb.drawLine(x, 46, x, 88, hex('#bcc9d4'));
  bb.fillShadedEllipse(15, 76, 8, 12, hex('#3785cc'), hex('#1d5ca3'), hex('#123c70'));
  bb.fillShadedEllipse(47, 74, 7, 8, C_RED_HI, C_RED, C_RED_DARK); // Red batting glove gripping bat
  drawMicroText(bb, 'JOKER', 33, 56, hex('#244f7d'), { align: 'center' });
  drawMicroText(bb, '11', 39, 65, hex('#244f7d'), { align: 'center' });
  // Head + bright red baseball cap
  bb.fillShadedEllipse(32, 33, 10.5, 11.5, C_WHITE, hex('#f5f7f7'), hex('#ccd6de'));
  bb.fillShadedEllipse(31, 22, 11.5, 6.8, C_RED_HI, C_RED, C_RED_DARK);
  bb.fillPolygon([[21, 25], [46, 24], [47, 27], [21, 27]], C_RED_DARK); // Cap brim
  // Cheerful blue-smiling ballplayer face
  bb.fillCircle(28, 32, 1.5, C_BLUE_DARK);
  bb.fillCircle(36, 32, 1.5, C_BLUE_DARK);
  bb.drawQuadBezier(27, 37, 32, 42, 37, 37, C_BLUE, 1.6, 1.6);
  bb.drawLine(29, 37, 35, 37, C_WHITE);
  cell.blitLayer(bb, 0, 0, hex('#37474f'));
  // Cute circular team mascot badge top-right + cursive bottom signature
  cell.fillCircle(55, 16, 8.5, C_WHITE);
  cell.fillCircle(55, 16, 4.5, C_RED);
  cell.fillRect(52, 19, 7, 3, C_BLUE);
  cell.fillCircle(55, 15, 2.5, C_WHITE);
  // Vintage autograph signature line at bottom
  cell.drawQuadBezier(11, 83, 25, 78, 37, 85, C_INK_DARK, 0.7, 0.7);
  cell.drawQuadBezier(37, 85, 48, 80, 58, 84, C_INK_DARK, 0.7, 0.7);
  cell.mask = null;
});

// (7,14) Bull — Powerful sculpted charcoal-grey charging bull head with curved ivory horns & pink snout!
reg(7, 14, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  drawJokerMargins(cell, C_INK);
  const b = new PixelCell();
  // Massive curving ivory horns sweeping outward & upward!
  drawCurvedProng(b, 22, 34, 10, 29, 17, 15, 4.6, 1.6, hex('#ebe0be'));
  drawCurvedProng(b, 48, 34, 60, 29, 53, 15, 4.6, 1.6, hex('#ebe0be'));
  // Floppy ears below horns
  b.fillShadedEllipse(16, 40, 5.5, 2.8, hex('#6c7a82'), hex('#4f5c63'), hex('#323b40'));
  b.fillShadedEllipse(54, 40, 5.5, 2.8, hex('#6c7a82'), hex('#4f5c63'), hex('#323b40'));
  // Broad sculpted charging bull skull & cheeks
  b.fillPolygon(
    [
      [21, 33], [35, 29], [49, 33],
      [51, 47], [46, 65], [35, 70], [24, 65], [19, 47],
    ],
    hex('#5c6970')
  );
  b.fillShadedEllipse(35, 46, 14, 15, hex('#7c8b94'), hex('#58656e'), hex('#374247'));
  // Tuft of dark curly forehead hair & fierce furrowed brow
  b.fillShadedEllipse(35, 33, 9, 4.5, hex('#4a555c'), hex('#323b40'), hex('#1f2629'));
  b.drawLine(24, 43, 32, 46, C_INK_DARK, 1.2);
  b.drawLine(46, 43, 38, 46, C_INK_DARK, 1.2);
  b.fillCircle(27, 46, 1.8, C_WHITE);
  b.fillCircle(43, 46, 1.8, C_WHITE);
  b.setPx(27, 46, C_INK_DARK);
  b.setPx(43, 46, C_INK_DARK);
  // Broad blush-pink bull muzzle with flared dark nostrils!
  b.fillShadedEllipse(35, 65, 11.2, 7.5, hex('#f0c0cc'), hex('#d49aa8'), hex('#9e6875'));
  b.fillEllipse(30, 64, 2.2, 2.8, hex('#4a353b'));
  b.fillEllipse(40, 64, 2.2, 2.8, hex('#4a353b'));
  cell.blitLayer(b, 0, 0, C_INK_DARK, { dx: 1, dy: 2, color: rgba(45, 55, 65, 45) });
});

// (8,14) Diet Cola — Bubbly caramel-amber polka-dot backdrop with iconic amber glass "JOKE" soda bottle!
reg(8, 14, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillDitherGradV(3, 3, 65, 89, hex('#b86f1c'), hex('#8c4e11'));
    // Retro effervescent fizzing amber bubbles wallpaper!
    for (let y = 7; y < 90; y += 11) {
      for (let x = 7; x < 66; x += 11) {
        const bx = x + ((y / 11) % 2) * 5;
        c.fillCircle(bx, y, 4.2, hex('#d99030'));
        c.fillCircle(bx - 1, y - 1, 2.2, hex('#f5c96e'));
      }
    }
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#5e3208') });
  const bot = new PixelCell();
  // Classic contoured glass soda bottle silhouette!
  bot.fillPolygon(
    [
      [31, 14], [39, 14],
      [41, 30], [46, 38], [46, 78], [43, 83],
      [27, 83], [24, 78], [24, 38], [29, 30],
    ],
    hex('#a6631b')
  );
  // Rich shaded cola liquid inside + glass highlights on left
  bot.fillRect(26, 36, 18, 44, hex('#6e3a0c'));
  bot.fillRect(27, 37, 5, 42, hex('#c78332'));
  bot.fillRect(28, 39, 2, 38, hex('#ffe09e'));
  // Bottle neck specular & ridged silver metal bottlecap!
  bot.fillRect(32, 17, 2, 15, hex('#fff2cc'));
  bot.fillRect(30, 12, 11, 5, hex('#cfd8e0'));
  bot.fillRect(31, 12, 4, 4, C_WHITE);
  // Iconic golden soda label wrap reading "JOKE"!
  bot.fillRect(24, 49, 23, 17, C_GOLD);
  bot.fillRect(24, 51, 23, 13, hex('#f7d060'));
  bot.fillRect(24, 49, 23, 2, C_WHITE);
  bot.fillRect(24, 64, 23, 2, C_WHITE);
  drawMicroText(bot, 'JOKE', 35, 55, hex('#5e3208'), { align: 'center', spacing: 1 });
  cell.blitLayer(bot, 0, 0, hex('#3b1f06'), { dx: 1, dy: 2, color: rgba(65, 32, 8, 85) });
});

// (9,14) Trading Card — Glossy TCG card-within-a-card with pastel art box, red stat bar & micro rules!
reg(9, 14, (cell) => {
  initCard(cell, hex('#242d36'), hex('#151b21'));
  // Outer glossy metallic silver inner trim
  cell.strokeRect(3, 3, 65, 89, hex('#586b7a'));
  // Top pink-cloud sunset TCG illustration window (x=6..64, y=7..51)
  cell.fillDitherStopsV(6, 7, 59, 44, [hex('#f7a8b8'), hex('#e68ab8'), hex('#a88ce6')]);
  cell.fillEllipse(20, 44, 14, 5, hex('#ffd6e0'));
  cell.fillEllipse(52, 46, 14, 5, hex('#ffd6e0'));
  // Action-posing dancing full-body jester inside TCG artwork window!
  const fig = new PixelCell();
  fig.fillCircle(35, 22, 6, C_WHITE);
  fig.fillPolygon([[28, 17], [35, 11], [42, 17]], C_RED);
  fig.fillCircle(26, 18, 2.5, C_GOLD);
  fig.fillCircle(44, 18, 2.5, C_GOLD);
  fig.fillPolygon([[28, 28], [42, 28], [45, 42], [25, 42]], C_BLUE);
  fig.fillRect(32, 28, 6, 13, C_RED);
  fig.drawLine(28, 30, 19, 24, C_GOLD, 2.0);
  fig.drawLine(42, 30, 50, 23, C_GOLD, 2.0);
  fig.drawLine(31, 42, 27, 49, C_RED, 2.0);
  fig.drawLine(39, 42, 43, 49, C_GOLD, 2.0);
  cell.blitLayer(fig, 0, 0, C_INK_DARK);
  cell.strokeRect(6, 7, 59, 44, hex('#f7e8c8'));
  // Bold crimson-gold TCG Name & Stat Bar ("JOKER | 4 | 3")!
  cell.fillRect(6, 53, 34, 10, C_RED);
  drawMicroText(cell, 'JOKER', 23, 56, C_WHITE, { align: 'center' });
  cell.fillRect(42, 53, 11, 10, C_GOLD);
  drawMicroText(cell, '4', 47, 56, C_INK_DARK, { align: 'center' });
  cell.fillRect(54, 53, 11, 10, C_BLUE);
  drawMicroText(cell, '3', 59, 56, C_WHITE, { align: 'center' });
  // Crisp white rules text box with colored mana orbs & micro lines!
  cell.fillRect(6, 65, 59, 24, hex('#eef4f7'));
  cell.fillCircle(11, 70, 2.0, C_GOLD);
  cell.fillCircle(11, 76, 2.0, C_BLUE);
  cell.fillRect(16, 69, 44, 2, C_INK);
  cell.fillRect(16, 73, 38, 1, C_INK_SOFT);
  cell.fillRect(16, 77, 42, 2, C_INK);
  cell.fillRect(16, 81, 30, 1, C_INK_SOFT);
  cell.fillRect(8, 84, 5, 3, C_RED);
  cell.fillRect(14, 84, 5, 3, C_BLUE);
});

// ============================================================================
// ROW 15 (y = 15): Flash Card, Popcorn, Ramen, Seltzer, Spare Trousers, Campfire, Smiley Face, Ancient, Walkie Talkie, Castle
// ============================================================================

// (0,15) Flash Card — Clean white classroom flashcard with dotted green border, giant "Jj" & mini Jimbo!
reg(0, 15, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  // Mint-green dotted preschool flashcard border!
  cell.strokeRect(2, 2, 67, 91, hex('#7ed9a8'), 3);
  for (let i = 4; i < 90; i += 4) {
    cell.setPx(3, i, C_WHITE);
    cell.setPx(67, i, C_WHITE);
  }
  for (let i = 4; i < 67; i += 4) {
    cell.setPx(i, 3, C_WHITE);
    cell.setPx(i, 91, C_WHITE);
  }
  // Giant crisp dark-slate "J" and lowercase "j"!
  // Big capital J (x=18..34, y=13..40)
  cell.fillRect(28, 13, 5, 21, C_SLATE);
  cell.fillRect(18, 31, 14, 5, C_SLATE);
  cell.fillRect(18, 27, 5, 6, C_SLATE);
  // Lowercase j with plump dot (x=41..50, y=14..42)
  cell.fillCircle(46, 16, 2.6, C_SLATE);
  cell.fillRect(44, 22, 5, 16, C_SLATE);
  cell.fillRect(39, 36, 9, 4, C_SLATE);
  // Cute miniature pixel Jimbo illustration in lower-center!
  const mini = new PixelCell();
  mini.fillPolygon([[28, 53], [35, 46], [42, 53]], C_RED);
  mini.fillCircle(26, 54, 3, C_GOLD);
  mini.fillCircle(44, 54, 3, C_GOLD);
  mini.fillCircle(35, 58, 6.2, C_WHITE);
  mini.setPx(33, 57, C_INK_DARK);
  mini.setPx(37, 57, C_INK_DARK);
  mini.fillRect(32, 60, 7, 2, C_RED);
  mini.fillEllipse(35, 68, 10, 4.5, C_BLUE);
  cell.blitLayer(mini, 0, 0, C_INK);
  // Crisp classroom caption "JOKER" along bottom
  drawMicroText(cell, 'JOKER', 35, 79, C_INK, { align: 'center', scale: 1, spacing: 2 });
});

// (1,15) Popcorn — Tomato-red backdrop with striped cinema tub overflowing with fluffy buttered popcorn!
reg(1, 15, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillDitherGradV(3, 3, 65, 89, hex('#f25249'), hex('#d93b34'));
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#8c1b18') });
  const pop = new PixelCell();
  // Overflowing mound of plump fluffy buttered popcorn puffs!
  const puffs: Array<[number, number, number]> = [
    [22, 35, 6.0], [31, 29, 7.2], [41, 29, 7.0], [49, 35, 5.8],
    [26, 24, 5.5], [36, 21, 6.2], [45, 24, 5.5], [35, 36, 7.5],
    [19, 39, 5.0], [52, 39, 5.0],
  ];
  for (const [px, py, pr] of puffs) {
    pop.fillShadedCircle(px, py, pr, hex('#fffad1'), hex('#ffe46e'), hex('#d9a326'));
  }
  // Classic red-and-white vertically striped tapered cinema popcorn tub!
  pop.fillPolygon([[17, 39], [53, 39], [48, 82], [22, 82]], C_WHITE);
  for (let y = 39; y <= 82; y++) {
    const t = (y - 39) / 43;
    const xL = Math.round(17 + t * 5);
    const xR = Math.round(53 - t * 5);
    for (let x = xL; x <= xR; x++) {
      const u = (x - xL) / Math.max(1, xR - xL);
      const stripe = Math.floor(u * 7) % 2 === 0;
      pop.setPx(x, y, stripe ? C_RED : (x > 42 ? hex('#d9e2ea') : C_WHITE));
    }
  }
  // Scattered spilled popcorn kernels around bottom base!
  for (const [kx, ky] of [[15, 79], [20, 83], [52, 81], [57, 77], [46, 84]] as const) {
    pop.fillShadedCircle(kx, ky, 3.0, hex('#fffad1'), hex('#ffe46e'), hex('#d9a326'));
  }
  cell.blitLayer(pop, 0, 0, hex('#6e1915'), { dx: 1, dy: 2, color: rgba(110, 20, 18, 80) });
});

// (2,15) Ramen — Plum-maroon card with steaming blue-white bowl of curly golden noodles, eggs & chopsticks!
reg(2, 15, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillDitherGradV(3, 3, 65, 89, hex('#b0466c'), hex('#8a2e52'));
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#52162e') });
  const rm = new PixelCell();
  // Ceramic white bowl with cobalt spiral rim wave
  rm.fillShadedEllipse(35, 69, 20, 15, C_WHITE, hex('#eef4f7'), hex('#b8c7d4'));
  rm.fillRect(25, 81, 21, 4, hex('#cfdbe6'));
  rm.drawQuadBezier(17, 68, 35, 76, 53, 68, C_BLUE, 2.2, 2.2);
  // Rich savory orange-amber broth ellipse
  rm.fillEllipse(35, 58, 19, 9, hex('#d97d30'));
  rm.fillEllipse(35, 57, 17, 7.5, hex('#eb9b46'));
  // Two halved soft-boiled ramen eggs (white + glowing orange yolk!)
  rm.fillEllipse(26, 47, 5.5, 6.2, C_WHITE);
  rm.fillCircle(26, 48, 3.0, hex('#ff9c1a'));
  rm.fillEllipse(44, 49, 5.2, 5.8, C_WHITE);
  rm.fillCircle(44, 50, 2.8, hex('#ff9c1a'));
  // Curly golden ramen noodles lifted up playfully by wooden chopsticks!
  const noodleCurves: Array<[number, number, number, number, number, number]> = [
    [22, 56, 26, 36, 34, 24],
    [28, 59, 32, 38, 38, 26],
    [34, 60, 41, 42, 43, 31],
    [40, 58, 46, 46, 48, 38],
  ];
  for (const [x0, y0, cx, cy, x1, y1] of noodleCurves) {
    rm.drawQuadBezier(x0, y0, cx, cy, x1, y1, hex('#f7d84a'), 2.1, 1.8);
    rm.drawQuadBezier(x0, y0 - 1, cx - 1, cy - 1, x1, y1 - 1, hex('#fff4a8'), 0.8, 0.7);
  }
  // Wooden chopsticks gripping noodles diagonally
  rm.drawLine(17, 25, 49, 31, hex('#8c5828'), 1.3);
  rm.drawLine(17, 30, 48, 37, hex('#a66b32'), 1.3);
  // Fresh chopped green scallions & pink narutomaki swirl!
  for (const [gx, gy] of [[24, 58], [32, 62], [42, 59], [37, 53], [29, 53]] as const) {
    rm.fillCircle(gx, gy, 2.2, C_GREEN);
  }
  cell.blitLayer(rm, 0, 0, hex('#4a192c'), { dx: 1, dy: 2, color: rgba(70, 18, 38, 85) });
});

// (3,15) Seltzer — Periwinkle-blue backdrop with retro clear glass seltzer siphon bottle & tiny Jimbo label!
reg(3, 15, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillDitherGradV(3, 3, 65, 89, hex('#7085d9'), hex('#566bc2'));
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#2d3a78') });
  const sz = new PixelCell();
  // Retro metallic silver siphon head, curving spout & squeeze trigger handle!
  sz.fillShadedEllipse(35, 22, 7.2, 6.2, C_WHITE, hex('#bfc9d4'), hex('#7a8999'));
  sz.drawQuadBezier(39, 20, 47, 19, 51, 25, hex('#cfd9e3'), 2.0, 1.5); // Spout
  sz.drawQuadBezier(28, 22, 22, 25, 24, 34, hex('#a8b6c4'), 1.8, 1.5); // Lever handle
  // Clear glass seltzer bottle filled with sparkling icy pale-cyan water!
  sz.fillShadedEllipse(35, 56, 15, 27, hex('#e8f8ff'), hex('#a8d8f7'), hex('#6eaad9'));
  sz.fillRect(28, 26, 15, 9, hex('#b8e2fa'));
  // Vertical glass siphon straw tube down inside bottle
  sz.fillRect(34, 28, 3, 52, rgba(255, 255, 255, 160));
  // Fizzy ascending white carbonation bubbles!
  for (const [bx, by, br] of [[27, 42, 2.0], [42, 46, 1.8], [29, 68, 2.2], [41, 71, 2.0], [32, 36, 1.5], [40, 58, 1.6]] as const) {
    sz.fillCircle(bx, by, br, C_WHITE);
  }
  // Cute miniature smiling Jimbo emblem sticker right on the bottle center!
  sz.fillCircle(35, 55, 8.5, C_WHITE);
  sz.fillPolygon([[30, 51], [35, 46], [40, 51]], C_RED);
  sz.fillCircle(29, 52, 2.0, C_GOLD);
  sz.fillCircle(41, 52, 2.0, C_GOLD);
  sz.fillCircle(35, 54, 4.0, C_WHITE);
  sz.setPx(33, 53, C_INK_DARK);
  sz.setPx(37, 53, C_INK_DARK);
  sz.fillRect(33, 56, 5, 1, C_RED);
  sz.fillEllipse(35, 60, 6, 2.8, C_BLUE);
  // Specular vertical white glass sheen on left curve
  sz.drawLine(23, 40, 23, 72, C_WHITE, 1.0);
  cell.blitLayer(sz, 0, 0, hex('#29376e'), { dx: 1, dy: 2, color: rgba(35, 45, 95, 75) });
});

// (4,15) Spare Trousers — Playful patterned mini-trouser wallpaper + patched stitched blue denim trousers!
reg(4, 15, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillRect(3, 3, 65, 89, hex('#4f5e78'));
    // Tiny colorful tiled mini-trousers wallpaper pattern!
    const tileCols = [C_RED, C_GOLD, C_BLUE, C_GREEN];
    for (let r = 0; r < 11; r++) {
      for (let col = 0; col < 8; col++) {
        const tx = 5 + col * 8;
        const ty = 5 + r * 8;
        const colr = tileCols[(r + col) % 4]!;
        c.fillRect(tx, ty, 5, 2, colr);
        c.fillRect(tx, ty + 2, 2, 4, colr);
        c.fillRect(tx + 3, ty + 2, 2, 4, colr);
      }
    }
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#232c3d') });
  const tr = new PixelCell();
  // Shaded stitched blue denim trousers standing slightly tilted!
  tr.fillPolygon([[23, 22], [45, 20], [52, 81], [39, 82], [35, 49], [31, 81], [19, 80]], hex('#1d8ae6'));
  // Left leg golden highlight & right leg deeper indigo shade
  tr.fillPolygon([[23, 22], [34, 21], [31, 80], [20, 79]], hex('#47b0ff'));
  tr.fillPolygon([[36, 21], [45, 20], [52, 81], [40, 81]], hex('#1268b8'));
  // Golden leather belt & buckle across waist!
  tr.fillPolygon([[23, 21], [45, 19], [46, 25], [23, 27]], C_GOLD);
  tr.fillRect(32, 20, 6, 6, C_GOLD_HI);
  // Iconic bright orange stitched knee patch on right pant leg & gold pocket stitching!
  tr.fillCircle(44, 55, 5.2, hex('#f59a23'));
  tr.fillCircle(44, 55, 3.6, hex('#ffb84d'));
  tr.drawLine(25, 27, 22, 77, hex('#ffdb70'));
  tr.drawLine(45, 26, 50, 78, hex('#ffdb70'));
  cell.blitLayer(tr, 0, 0, C_WHITE, { dx: 1, dy: 2, color: rgba(20, 28, 45, 95) });
});

// (5,15) Campfire — Dark midnight pine woodland with cozy olive tent & bright roaring campfire!
reg(5, 15, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    // Deep forest midnight sky fading to warm firelit clearing
    c.fillDitherStopsV(3, 3, 65, 68, [hex('#202b30'), hex('#324242'), hex('#595542')]);
    // Towering shadowy pine tree trunks & foliage across background
    for (const [tx, tw] of [[8, 6], [21, 5], [47, 5], [58, 7]] as const) {
      c.fillRect(tx, 3, tw, 66, hex('#242b29'));
      c.fillRect(tx + 1, 3, 2, 66, hex('#3b4540'));
    }
    // Woodland mossy forest floor bathed in warm firelight!
    c.fillDitherGradV(3, 68, 65, 24, hex('#4f4635'), hex('#2e2a22'));
    c.fillCircle(35, 70, 24, rgba(255, 165, 55, 45));
    c.fillCircle(35, 70, 14, rgba(255, 210, 95, 65));
    // Cozy triangular olive camping tent pitched on the left
    c.fillPolygon([[11, 70], [21, 49], [30, 70]], hex('#637054'));
    c.fillPolygon([[19, 70], [21, 51], [27, 70]], hex('#948659'));
    // Crossed charred wooden campfire logs
    c.drawLine(24, 77, 46, 72, hex('#5e3b21'), 2.4);
    c.drawLine(25, 72, 46, 78, hex('#472c18'), 2.4);
    // Layered flickering roaring orange/gold/white flames & floating sparks!
    const fl = new PixelCell();
    fl.fillPolygon([[27, 73], [35, 47], [43, 73]], hex('#eb4b28'));
    fl.fillPolygon([[29, 73], [35, 52], [41, 73]], hex('#ff9c24'));
    fl.fillPolygon([[31, 73], [35, 59], [39, 73]], hex('#ffe666'));
    fl.fillCircle(35, 69, 3.2, C_WHITE);
    for (const [sx, sy] of [[31, 43], [38, 39], [34, 34], [41, 48], [28, 51]] as const) {
      fl.setPx(sx, sy, C_GOLD_HI);
    }
    c.blitLayer(fl, 0, 0);
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#1a2224') });
});

// (6,15) Smiley Face — Vibrant sunlit golden patterned card with glossy yellow circular smiley face!
reg(6, 15, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    drawMarbleSwirl(c, hex('#d49017'), hex('#f0b92b'), hex('#ffe366'), 156, 0.17, 2.8, 0.4);
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#8c5a08') });
  const sm = new PixelCell();
  sm.fillShadedCircle(35, 48, 20, hex('#fff694'), hex('#ffdb33'), hex('#d99a14'));
  // Crisp glossy specular arc
  sm.drawQuadBezier(22, 40, 26, 33, 35, 32, C_WHITE, 1.3, 0.8);
  // Iconic cheerful dark oval eyes & wide curved happy smile!
  sm.fillEllipse(28, 42, 2.6, 4.4, C_INK_DARK);
  sm.fillEllipse(42, 42, 2.6, 4.4, C_INK_DARK);
  sm.drawQuadBezier(23, 52, 35, 65, 47, 52, C_INK_DARK, 1.9, 1.9);
  cell.blitLayer(sm, 0, 0, hex('#593b08'), { dx: 1, dy: 2, color: rgba(115, 75, 10, 70) });
});

// (7,15) Ancient Joker — Mossy weathered sandstone temple tablet with carved relief face & ivy vines!
reg(7, 15, (cell) => {
  initCard(cell, hex('#d9cdb2'), hex('#8c8067'), hex('#bfb295'));
  // Weathered stone masonry block joints across tablet
  for (let y = 18; y < 86; y += 16) cell.fillRect(3, y, 65, 1, hex('#ada084'));
  for (let x = 16; x < 60; x += 22) cell.fillRect(x, 3, 1, 89, hex('#ada084'));
  // Speckled ancient limestone erosion
  for (let y = 4; y < 90; y++) {
    for (let x = 4; x < 67; x++) {
      const h = hash2(x, y, 157);
      if (h < 0.1) cell.setPx(x, y, hex('#bfb397'));
      else if (h > 0.92) cell.setPx(x, y, hex('#ede4ce'));
    }
  }
  // Carved sandstone relief medallion + stylized ancient moon/jester profile!
  const rel = new PixelCell();
  rel.fillShadedEllipse(35, 50, 17, 22, hex('#ede4cc'), hex('#d4c6a8'), hex('#9e9073'));
  rel.fillShadedEllipse(35, 50, 13, 17, hex('#f2ead4'), hex('#dfd2b6'), hex('#b0a182'));
  // Carved crowned temple jester relief profile
  rel.fillPolygon([[27, 32], [35, 22], [43, 32]], hex('#d69c78'));
  rel.fillCircle(32, 47, 2.2, hex('#8c7d61'));
  rel.drawQuadBezier(34, 41, 41, 47, 35, 58, hex('#8c7d61'), 1.2, 1.0);
  rel.drawQuadBezier(28, 56, 33, 60, 38, 56, hex('#8c7d61'), 1.0, 1.0);
  cell.blitLayer(rel, 0, 0, hex('#7d7056'));
  // Creeping emerald temple ivy vines draping over corners!
  const vines: Array<[number, number, number, number]> = [
    [5, 4, 17, 26], [65, 4, 52, 29], [5, 72, 20, 88], [64, 68, 49, 88],
  ];
  for (const [x0, y0, x1, y1] of vines) {
    cell.drawLine(x0, y0, x1, y1, hex('#4f8f50'), 1.1);
    for (let k = 1; k <= 4; k++) {
      const lx = x0 + ((x1 - x0) * k) / 5 + (k % 2 === 0 ? 3 : -3);
      const ly = y0 + ((y1 - y0) * k) / 5;
      cell.fillCircle(lx, ly, 2.0, k % 2 === 0 ? hex('#6eb863') : hex('#478248'));
    }
  }
  drawJokerMargins(cell, hex('#f7f2e4'), { shadow: hex('#786c54') });
});

// (8,15) Walkie Talkie — Concentric denim-blue radio-wave ripples & chunky retro teal walkie-talkie!
reg(8, 15, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    c.fillRect(3, 3, 65, 89, hex('#5c7ca3'));
    // Concentric radio-wave ripples radiating out from antenna tip!
    for (let y = 3; y <= 91; y++) {
      for (let x = 3; x <= 67; x++) {
        const d = Math.hypot(x - 41, y - 22);
        const wave = Math.sin(d * 0.52);
        if (wave > 0.35) c.setPx(x, y, hex('#7ea3cc'));
        else if (wave < -0.45) c.setPx(x, y, hex('#48648a'));
      }
    }
  });
  drawJokerMargins(cell, C_WHITE, { shadow: hex('#2b3e59') });
  const wt = new PixelCell();
  // Tall black telescopic radio antenna + signal dial knob
  wt.fillRect(40, 12, 4, 24, hex('#37424a'));
  wt.fillRect(41, 12, 1, 23, hex('#7d8e99'));
  wt.fillRect(28, 30, 6, 6, hex('#475761'));
  // Chunky retro teal-slate handheld walkie-talkie body
  wt.fillRect(22, 35, 27, 45, hex('#588087'));
  wt.fillRect(23, 36, 10, 43, hex('#7ca6ad'));
  wt.fillRect(41, 36, 7, 43, hex('#3c5b61'));
  // Side push-to-talk rubber button
  wt.fillRect(19, 43, 3, 10, C_RED);
  // Dark speaker grille & keypad dots!
  wt.fillRect(26, 40, 19, 13, hex('#354c52'));
  for (let sy = 42; sy <= 50; sy += 3) wt.fillRect(28, sy, 15, 1, hex('#96bec4'));
  // 3x3 radio channel keypad dots + glowing red LED!
  wt.fillCircle(28, 58, 1.5, C_RED);
  for (let r = 0; r < 3; r++) {
    for (let col = 0; col < 3; col++) {
      wt.fillCircle(28 + col * 6, 64 + r * 5, 1.6, hex('#2e4247'));
    }
  }
  cell.blitLayer(wt, 0, 0, hex('#1f2c33'), { dx: 1, dy: 2, color: rgba(25, 38, 60, 80) });
});

// (9,15) Castle — Snowy alpine fairytale mountain fortress with pointed cerulean towers & gold flag!
reg(9, 15, (cell) => {
  initCard(cell, C_WHITE, C_CARD_BORDER, C_CARD_LIP);
  fillFramedBg(cell, (c) => {
    // Crisp winter alpine sky gradient & soft cloud puffs
    c.fillDitherStopsV(3, 3, 65, 58, [hex('#7cc7f7'), hex('#bce6fc'), hex('#eaf7ff')]);
    c.fillEllipse(18, 18, 13, 4.5, C_WHITE);
    c.fillEllipse(52, 24, 14, 5, C_WHITE);
    // Snowy alpine mountainside with winding winter path!
    c.fillPolygon([[3, 67], [22, 57], [46, 62], [67, 71], [67, 91], [3, 91]], hex('#eef6fc'));
    c.fillPolygon([[3, 72], [20, 62], [35, 68], [54, 75], [67, 83], [67, 91], [3, 91]], hex('#cfe2f2'));
    c.drawQuadBezier(28, 91, 14, 82, 34, 68, hex('#87a8c9'), 2.2, 1.0);
    // Towering blue-stone fairytale medieval castle perched on peak!
    const cs = new PixelCell();
    // Main fortress keep & battlements
    cs.fillRect(20, 39, 31, 29, hex('#6c85a6'));
    cs.fillRect(20, 39, 14, 29, hex('#91abc9'));
    cs.fillRect(38, 39, 13, 29, hex('#4f6582'));
    // Left tower, central tall keep, right tower
    cs.fillRect(15, 29, 11, 36, hex('#85a0bf'));
    cs.fillRect(30, 21, 13, 44, hex('#7793b3'));
    cs.fillRect(46, 33, 10, 33, hex('#58708f'));
    // Pointed cerulean fairy-tale turret roofs!
    cs.fillPolygon([[13, 29], [20, 14], [27, 29]], hex('#1c8be0'));
    cs.fillPolygon([[28, 21], [36, 7], [44, 21]], hex('#29a3f2'));
    cs.fillPolygon([[44, 33], [51, 20], [58, 33]], hex('#1570ba'));
    // Fluttering golden pennant flag atop left spire!
    cs.drawLine(20, 14, 20, 8, hex('#374759'));
    cs.fillPolygon([[20, 8], [10, 11], [20, 13]], C_GOLD);
    // Arched castle gate & warm lit tiny windows
    cs.fillRect(32, 55, 8, 12, hex('#2b3a4d'));
    cs.fillCircle(36, 55, 4, hex('#2b3a4d'));
    for (const [wx, wy] of [[19, 36], [35, 29], [35, 40], [50, 41]] as const) {
      cs.fillRect(wx, wy, 3, 5, hex('#29384a'));
      cs.setPx(wx + 1, wy + 2, C_GOLD_HI);
    }
    c.blitLayer(cs, 0, 0, hex('#2e4057'));
  });
  drawJokerMargins(cell, C_INK, { right: false });
  drawJokerMargins(cell, hex('#2e4057'), { left: false });
});

// ============================================================================
// Master 710x1520 Atlas Factory (100% Node-Safe at Top Level)
// ============================================================================

/**
 * Build the complete 150-Joker + Row 9 floating soul-layer pixel-art atlas.
 * Dimensions: 710x1520 (10 cols x 16 rows, 71x95 per cell).
 */
export function buildHighCraftJokersAtlas(): HTMLCanvasElement {
  const width = GRID_COLS * CELL_W;
  const height = GRID_ROWS * CELL_H;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const imgData = ctx.createImageData(width, height);
  const atlasBuf = imgData.data;
  const cell = new PixelCell(CELL_W, CELL_H);

  for (let gy = 0; gy < GRID_ROWS; gy++) {
    for (let gx = 0; gx < GRID_COLS; gx++) {
      const painter = JOKER_PAINTERS.get(`${gx},${gy}`);
      if (!painter) continue;
      cell.clear();
      painter(cell);
      cell.copyToAtlas(atlasBuf, width, gx, gy);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
