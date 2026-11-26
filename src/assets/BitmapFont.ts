// ============================================================================
// Krunked Cards — Crisp Pixel Font Helper & Custom TTF Loader
// Safe to import in both browser and Node.js environments.
// ============================================================================

const PIXEL_FONT_FAMILY = 'KrunkedPixelCustom';
let loadedFontUrl: string | null = null;
let customFontActive = false;

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
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
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

/**
 * Load a custom TrueType/OpenType pixel font (e.g. m6x11plus.ttf from Custom Pack)
 * and register it as a CSS `@font-face`, switching `--krunked-font` live.
 */
export async function setCustomPixelFont(fontUrl: string | null): Promise<boolean> {
  if (typeof document === 'undefined') return false;

  if (!fontUrl) {
    customFontActive = false;
    applyFontCssVariable(false);
    return true;
  }

  if (loadedFontUrl === fontUrl) {
    customFontActive = true;
    applyFontCssVariable(true);
    return true;
  }

  try {
    if (typeof FontFace !== 'undefined') {
      const face = new FontFace(PIXEL_FONT_FAMILY, `url("${fontUrl}")`);
      const loaded = await face.load();
      document.fonts.add(loaded);
    } else {
      let styleEl = document.getElementById('krunked-custom-font-style') as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'krunked-custom-font-style';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = `@font-face { font-family: '${PIXEL_FONT_FAMILY}'; src: url('${fontUrl}'); font-display: swap; }`;
    }
    loadedFontUrl = fontUrl;
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
    ? `'${PIXEL_FONT_FAMILY}', 'Consolas', 'Courier New', monospace`
    : `'Trebuchet MS', 'Segoe UI', 'Verdana', sans-serif`;
}

function applyFontCssVariable(useCustom: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (useCustom) {
    root.style.setProperty(
      '--krunked-font',
      `'${PIXEL_FONT_FAMILY}', 'Courier New', monospace`
    );
    root.style.setProperty('--krunked-font-scale', '1.12');
    root.classList.add('krunked-custom-font');
  } else {
    root.style.setProperty(
      '--krunked-font',
      `'Trebuchet MS', 'Bahnschrift', 'Segoe UI', sans-serif`
    );
    root.style.setProperty('--krunked-font-scale', '1');
    root.classList.remove('krunked-custom-font');
  }
}
