// ============================================================================
// Krunked Cards — Exact Exponential Spring Physics & Interactive Card Layout
// Implements spec-exact Moveable springs (exp_xy, exp_scale, exp_r, juiceUp),
// 3D card flip animations, authentic non-standard Joker shapes, 2-layer
// soulPos floating parallax wiring, scoring card emphasis, and the iconic
// single-Ace Title Screen centerpiece.
// ============================================================================

import {
  LAYOUT,
  type AtlasKey,
  type AtlasPos,
  type CardInstance,
  type ConsumableInstance,
  type EditionId,
  type EnhancementId,
  type JokerInstance,
  type LayoutMode,
  type PackCardOffer,
  type Rank,
  type SealId,
  type ShopBoosterOffer,
  type ShopOffer,
  type ShopVoucherOffer,
  type SimState,
  type Suit,
} from '../contracts/index.ts';
import {
  BOOSTER_MAP,
  CONSUMABLE_MAP,
  DECK_MAP,
  JOKER_MAP,
  VOUCHER_MAP,
} from '../data/index.ts';

export type VisualEntityKind =
  | 'hand'
  | 'play'
  | 'joker'
  | 'consumable'
  | 'deck_pile'
  | 'shop_offer'
  | 'shop_voucher'
  | 'shop_booster'
  | 'pack_card'
  | 'title_showcase';

export type CardShapeKind = 'half' | 'square' | 'photo' | 'wee';
export type SoulShaderKind = 'hologram' | 'soul_gem' | 'default';

export interface JuiceState {
  scale: number;
  scaleAmt: number;
  r: number;
  rAmt: number;
  elapsed: number;
  duration: number;
}

/**
 * Exact spring-physics body matching Krunked Cards motion constants:
 *   exp_xy = exp(-50 * dt)
 *   exp_scale = exp(-60 * dt)
 *   exp_r = exp(-190 * dt)
 *   max_vel = 70 * dt
 *   juiceUp duration = 0.4s with damped harmonic waves sin(50.8*t) & sin(40.8*t)
 */
export class Moveable {
  // Target transform (T)
  tx = 0;
  ty = 0;
  tw = 90;
  th = 120;
  tr = 0;
  tScale = 1;

  // Visible spring transform (VT)
  vx = 0;
  vy = 0;
  vw = 90;
  vh = 120;
  vr = 0;
  vScale = 1;

  // Velocity
  velX = 0;
  velY = 0;
  velR = 0;
  velScale = 0;

  // Hover, drag, tilt, dissolve & 3D flip visual states
  hovered = false;
  dragging = false;
  tiltX = 0;
  tiltY = 0;
  targetTiltX = 0;
  targetTiltY = 0;
  dissolve = 0;
  juice: JuiceState | null = null;
  initialized = false;

  // 3D horizontal flip animation (0..1; 1 = settled, flips cleanly at 0.5)
  flipProgress = 1;
  flipDuration = 0.30;
  flipDelay = 0;
  flipPrevFaceDown = false;
  lastKnownFaceDown: boolean | null = null;

  snapToTarget(): void {
    this.vx = this.tx;
    this.vy = this.ty;
    this.vw = this.tw;
    this.vh = this.th;
    this.vr = this.tr;
    this.vScale = this.tScale;
    this.velX = 0;
    this.velY = 0;
    this.velR = 0;
    this.velScale = 0;
    this.initialized = true;
  }

  triggerFlip(fromFaceDown: boolean, duration = 0.30, delay = 0): void {
    this.flipPrevFaceDown = fromFaceDown;
    this.flipProgress = 0;
    this.flipDuration = Math.max(0.12, duration);
    this.flipDelay = Math.max(0, delay);
  }

  syncFaceDown(faceDown: boolean, reducedMotion: boolean): void {
    if (this.lastKnownFaceDown !== null && this.lastKnownFaceDown !== faceDown) {
      if (reducedMotion) {
        this.flipProgress = 1;
      } else {
        this.triggerFlip(this.lastKnownFaceDown, 0.30, 0);
      }
    }
    this.lastKnownFaceDown = faceDown;
  }

  getFlipScaleX(): number {
    if (this.flipProgress >= 1) return 1;
    if (this.flipDelay > 0) return 1;
    return Math.max(0.03, Math.abs(Math.cos(this.flipProgress * Math.PI)));
  }

  getDisplayFaceDown(actualFaceDown: boolean): boolean {
    if (this.flipProgress >= 1) return actualFaceDown;
    if (this.flipDelay > 0 || this.flipProgress < 0.5) return this.flipPrevFaceDown;
    return actualFaceDown;
  }

  juiceUp(amount = 0.4, rotAmt?: number, _nowSec?: number): void {
    const a = Math.min(0.55, Math.max(0.1, amount));
    const rAmt = rotAmt ?? (Math.random() > 0.5 ? 1 : -1) * (0.28 + Math.random() * 0.16);
    this.vScale = Math.max(0.68, Math.min(1.25, 1 - 0.5 * a));
    this.velScale = 0;
    this.juice = {
      scale: 0,
      scaleAmt: a,
      r: 0,
      rAmt,
      elapsed: 0,
      duration: 0.4,
    };
  }

  step(dt: number, _nowSec: number, reducedMotion: boolean, pixelScale: number): void {
    if (!this.initialized) {
      this.snapToTarget();
      return;
    }

    const safeDt = Math.min(0.05, Math.max(0.001, dt));

    if (reducedMotion) {
      const k = Math.min(1, safeDt * 18);
      this.vx += (this.tx - this.vx) * k;
      this.vy += (this.ty - this.vy) * k;
      this.vw += (this.tw - this.vw) * k;
      this.vh += (this.th - this.vh) * k;
      this.vr += (this.tr - this.vr) * k;
      const targetS = this.tScale + (this.dragging ? 0.08 : this.hovered ? 0.04 : 0);
      this.vScale += (targetS - this.vScale) * k;
      this.vScale = Math.max(0.55, Math.min(1.5, this.vScale));
      this.tiltX *= 0.85;
      this.tiltY *= 0.85;
      this.targetTiltX = 0;
      this.targetTiltY = 0;
      this.flipProgress = 1;
      this.flipDelay = 0;
      this.juice = null;
      return;
    }

    // Step 3D flip animation
    if (this.flipProgress < 1) {
      if (this.flipDelay > 0) {
        this.flipDelay = Math.max(0, this.flipDelay - safeDt);
      } else {
        this.flipProgress = Math.min(1, this.flipProgress + safeDt / this.flipDuration);
      }
    }

    // Update harmonic juice wave using monotonic frame dt (immune to clock domain drift)
    let juiceScale = 0;
    let juiceR = 0;
    if (this.juice) {
      this.juice.elapsed += safeDt;
      if (this.juice.elapsed >= this.juice.duration) {
        this.juice = null;
      } else {
        const elapsed = this.juice.elapsed;
        const remain = Math.max(0, Math.min(1, 1 - elapsed / this.juice.duration));
        juiceScale = this.juice.scaleAmt * Math.sin(50.8 * elapsed) * remain * remain * remain;
        juiceR = this.juice.rAmt * Math.sin(40.8 * elapsed) * remain * remain;
        this.juice.scale = juiceScale;
        this.juice.r = juiceR;
      }
    }

    // Exact exponential spring decay factors
    const expXy = Math.exp(-50 * safeDt);
    const expScale = Math.exp(-60 * safeDt);
    const expR = Math.exp(-190 * safeDt);

    // Work in world tile units for velocity clamping (`max_vel = 70 * dt`), converted back to pixels
    const pxPerUnit = Math.max(24, pixelScale);
    const dxU = (this.tx - this.vx) / pxPerUnit;
    const dyU = (this.ty - this.vy) / pxPerUnit;
    const maxVelPx = 70 * safeDt * pxPerUnit;

    if (Math.abs(dxU) + Math.abs(dyU) < 0.01 && Math.hypot(this.velX, this.velY) < 0.5) {
      this.vx = this.tx;
      this.vy = this.ty;
      this.velX = 0;
      this.velY = 0;
    } else {
      const nextVelX = expXy * this.velX + (1 - expXy) * (this.tx - this.vx) * 28 * safeDt;
      const nextVelY = expXy * this.velY + (1 - expXy) * (this.ty - this.vy) * 28 * safeDt;
      const speed = Math.hypot(nextVelX, nextVelY);
      if (speed > maxVelPx && speed > 0.0001) {
        const f = maxVelPx / speed;
        this.velX = nextVelX * f;
        this.velY = nextVelY * f;
      } else {
        this.velX = nextVelX;
        this.velY = nextVelY;
      }
      this.vx += this.velX;
      this.vy += this.velY;
    }

    // Smooth size interpolation
    this.vw += (this.tw - this.vw) * (1 - Math.exp(-20 * safeDt));
    this.vh += (this.th - this.vh) * (1 - Math.exp(-20 * safeDt));

    // Scale spring: +0.10 dragging, +0.055 hovering, +juice.scale
    const desScale = Math.max(
      0.65,
      Math.min(1.48, this.tScale + (this.dragging ? 0.1 : this.hovered ? 0.055 : 0) + juiceScale)
    );
    this.velScale = expScale * this.velScale + (1 - expScale) * (desScale - this.vScale) * 20 * safeDt;
    this.vScale = Math.max(0.55, Math.min(1.55, this.vScale + this.velScale));

    // Rotation spring with horizontal velocity lean (`des_r = base_r + 0.015 * (vel.x/dt) + juice.r * 2`)
    const velXUnitsPerSec = this.velX / (safeDt * pxPerUnit);
    const desR = this.tr + Math.max(-0.42, Math.min(0.42, 0.015 * velXUnitsPerSec)) + juiceR * 1.4;
    this.velR = expR * this.velR + (1 - expR) * (desR - this.vr) * 24 * safeDt;
    this.vr = Math.max(-1.2, Math.min(1.2, this.vr + this.velR));

    // Smooth spring-damped hover tilt toward targetTilt (or 0 when unhovered)
    const tiltK = 1 - Math.exp(-15 * safeDt);
    const goalTX = this.hovered ? this.targetTiltX : this.targetTiltX * 0.85;
    const goalTY = this.hovered ? this.targetTiltY : this.targetTiltY * 0.85;
    this.tiltX += (goalTX - this.tiltX) * tiltK;
    this.tiltY += (goalTY - this.tiltY) * tiltK;
    if (!this.hovered) {
      const decay = Math.exp(-10 * safeDt);
      this.targetTiltX *= decay;
      this.targetTiltY *= decay;
    }
  }
}

// ---------------------------------------------------------------------------
// Visual Card Entity Descriptor (consumed by WebGL2Renderer & InputManager)
// ---------------------------------------------------------------------------

export interface VisualCard {
  id: string;
  kind: VisualEntityKind;
  index: number;
  moveable: Moveable;
  zIndex: number;
  selected: boolean;
  draggable: boolean;

  // Sprite layers
  baseAtlas: AtlasKey;
  basePos: AtlasPos;
  faceAtlas?: AtlasKey;
  facePos?: AtlasPos;
  sealPos?: AtlasPos;
  stickers: AtlasPos[];

  // Optional 2-layer floating soulPos, shader overlays, shapes & 3D flip
  soulAtlas?: AtlasKey;
  soulPos?: AtlasPos;
  soulShader?: SoulShaderKind;
  floatingGlow?: 'black_hole';
  overlayEffect?: 'booster' | 'voucher';
  nonScoring?: boolean;
  cardShape?: CardShapeKind;
  flipScaleX?: number;

  edition: EditionId;
  enhancement?: EnhancementId;
  seal?: SealId;
  debuffed: boolean;
  faceDown: boolean;
  forced?: boolean;
  scoringPreview?: boolean;
  cost?: number;
  sold?: boolean;

  // Back-reference for tooltips & interactions
  cardData?: CardInstance;
  jokerData?: JokerInstance;
  consumableData?: ConsumableInstance;
  shopOfferData?: ShopOffer;
  voucherOfferData?: ShopVoucherOffer;
  boosterOfferData?: ShopBoosterOffer;
  packCardData?: PackCardOffer;
}

export interface RectPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TableGeometry {
  viewportW: number;
  viewportH: number;
  mode: LayoutMode;
  safeInsets: SafeInsets;
  hudDock: RectPx;
  actionBar: RectPx;
  shopControls: RectPx;
  compact: boolean;
  leftRail: RectPx;
  table: RectPx;
  jokerTray: RectPx;
  consumableTray: RectPx;
  playArea: RectPx;
  handTray: RectPx;
  deckPile: RectPx;
  shopOfferTray: RectPx;
  shopVoucherTray: RectPx;
  shopBoosterTray: RectPx;
  packTray: RectPx;
  cardW: number;
  cardH: number;
  highlightLift: number;
  pixelScale: number;
}

// ---------------------------------------------------------------------------
// Helpers mapping cards/items to exact Atlas Coordinates & Authentic Shapes
// ---------------------------------------------------------------------------

const SUIT_TO_ROW: Record<Suit, number> = {
  Hearts: 0,
  Clubs: 1,
  Diamonds: 2,
  Spades: 3,
};

const RANK_TO_COL: Record<Rank, number> = {
  '2': 0,
  '3': 1,
  '4': 2,
  '5': 3,
  '6': 4,
  '7': 5,
  '8': 6,
  '9': 7,
  '10': 8,
  Jack: 9,
  Queen: 10,
  King: 11,
  Ace: 12,
};

const ENHANCEMENT_POS: Record<EnhancementId, AtlasPos> = {
  none: { x: 1, y: 0 },
  m_bonus: { x: 1, y: 1 },
  m_mult: { x: 2, y: 1 },
  m_wild: { x: 3, y: 1 },
  m_lucky: { x: 4, y: 1 },
  m_glass: { x: 5, y: 1 },
  m_steel: { x: 6, y: 1 },
  m_stone: { x: 5, y: 0 },
  m_gold: { x: 6, y: 0 },
};

const SEAL_POS: Record<Exclude<SealId, 'none'>, AtlasPos> = {
  Gold: { x: 2, y: 0 },
  Purple: { x: 4, y: 4 },
  Red: { x: 5, y: 4 },
  Blue: { x: 6, y: 4 },
};

export function getDeckBackPos(deckId: string): AtlasPos {
  const def = DECK_MAP[deckId];
  if (def?.pos) return def.pos;
  const fallback: Record<string, AtlasPos> = {
    b_red: { x: 0, y: 0 },
    b_blue: { x: 0, y: 2 },
    b_yellow: { x: 1, y: 2 },
    b_green: { x: 2, y: 2 },
    b_black: { x: 3, y: 2 },
    b_plasma: { x: 4, y: 2 },
  };
  return fallback[deckId] ?? { x: 0, y: 0 };
}

export function getCardFacePos(suit: Suit, rank: Rank): AtlasPos {
  return { x: RANK_TO_COL[rank] ?? 0, y: SUIT_TO_ROW[suit] ?? 0 };
}

function getJokerShapeDimensions(
  jokerKey: string,
  baseW: number,
  baseH: number
): { tw: number; th: number; cardShape?: CardShapeKind } {
  switch (jokerKey) {
    case 'j_half':
      return { tw: baseW, th: Math.round(baseH * 0.65), cardShape: 'half' };
    case 'j_square':
      return { tw: baseW, th: baseW, cardShape: 'square' };
    case 'j_photograph':
      return { tw: baseW, th: baseW, cardShape: 'photo' };
    case 'j_wee':
      return { tw: Math.round(baseW * 0.7), th: Math.round(baseH * 0.7), cardShape: 'wee' };
    default:
      return { tw: baseW, th: baseH };
  }
}

function getJokerSoulFields(
  jokerKey: string,
  displayFaceDown: boolean
): Pick<VisualCard, 'soulAtlas' | 'soulPos' | 'soulShader'> {
  if (displayFaceDown) return {};
  const def = JOKER_MAP[jokerKey];
  if (!def?.soulPos) return {};
  return {
    soulAtlas: 'Joker',
    soulPos: def.soulPos,
    soulShader: jokerKey === 'j_hologram' ? 'hologram' : 'default',
  };
}

function getConsumableSpecialFields(
  key: string
): Pick<VisualCard, 'soulAtlas' | 'soulPos' | 'soulShader' | 'floatingGlow'> {
  if (key === 'c_soul') {
    return {
      soulAtlas: 'centers',
      soulPos: { x: 0, y: 1 },
      soulShader: 'soul_gem',
    };
  }
  if (key === 'c_black_hole') {
    return {
      floatingGlow: 'black_hole',
    };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Safe-Area Inset Helpers & 3-Mode Responsive Table Layout Calculator
// Modes:
//   - 'desktop':          viewportW >= 960 && viewportH >= 540
//   - 'mobile-landscape': viewportW > viewportH && (viewportW < 960 || viewportH < 540)
//   - 'mobile-portrait':  viewportH >= viewportW && viewportW < 960
// ---------------------------------------------------------------------------

function sanitizeSafeInsets(insets?: Partial<SafeInsets> | null): SafeInsets {
  if (!insets) return { top: 0, right: 0, bottom: 0, left: 0 };
  const clean = (v: number | undefined): number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
  return {
    top: clean(insets.top),
    right: clean(insets.right),
    bottom: clean(insets.bottom),
    left: clean(insets.left),
  };
}

/**
 * Reads live CSS safe-area-inset-* pixel dimensions in a browser environment.
 * Returns zeros in headless/Node environments without DOM side effects.
 */
export function readSafeAreaInsets(): SafeInsets {
  if (typeof document === 'undefined' || !document.body || typeof getComputedStyle !== 'function') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  try {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) ' +
      'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const insets = sanitizeSafeInsets({
      top: parseFloat(cs.paddingTop),
      right: parseFloat(cs.paddingRight),
      bottom: parseFloat(cs.paddingBottom),
      left: parseFloat(cs.paddingLeft),
    });
    probe.remove();
    return insets;
  } catch {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

export function computeTableGeometry(
  viewportW: number,
  viewportH: number,
  safeInsets?: Partial<SafeInsets>
): TableGeometry {
  const w = Math.max(280, Math.round(Number.isFinite(viewportW) ? viewportW : 1280));
  const h = Math.max(280, Math.round(Number.isFinite(viewportH) ? viewportH : 720));
  const safe = sanitizeSafeInsets(safeInsets);
  const aspect = LAYOUT.CARD_W / LAYOUT.CARD_H; // ~0.7447

  let mode: LayoutMode;
  if (w >= 960 && h >= 540) {
    mode = 'desktop';
  } else if (w > h) {
    mode = 'mobile-landscape';
  } else {
    mode = 'mobile-portrait';
  }

  // =========================================================================
  // MODE 1: DESKTOP (960x540 through 1280x720, 1920x1080+)
  // Preserves verified 1280x720 and 1920x1080 proportions verbatim!
  // =========================================================================
  if (mode === 'desktop') {
    const usableW = Math.max(640, w - safe.left - safe.right);
    const usableH = Math.max(480, h - safe.top - safe.bottom);

    const railW = Math.round(Math.min(315, Math.max(246, usableW * 0.225)));
    const leftRail: RectPx = {
      x: 12 + safe.left,
      y: 12 + safe.top,
      w: railW,
      h: usableH - 24,
    };
    const hudDock: RectPx = { ...leftRail };

    const tableX = leftRail.x + leftRail.w + 18;
    const tableW = w - safe.right - tableX - 18;
    const table: RectPx = {
      x: tableX,
      y: 12 + safe.top,
      w: tableW,
      h: usableH - 24,
    };

    const cardH = Math.round(Math.min(168, Math.max(118, usableH * 0.205)));
    const cardW = Math.round(cardH * aspect);
    const highlightLift = Math.round(cardH * 0.2);

    // Top row: Jokers (left ~67%) & Consumables (right ~33%)
    const topRowH = Math.round(cardH + 22);
    const gap = 14;
    const jokerW = Math.round((tableW - gap) * 0.67);
    const consW = tableW - gap - jokerW;

    const jokerTray: RectPx = { x: tableX, y: 14 + safe.top, w: jokerW, h: topRowH };
    const consumableTray: RectPx = { x: tableX + jokerW + gap, y: 14 + safe.top, w: consW, h: topRowH };

    // Bottom row: Hand tray + Deck stack on right, leaving 62px at very bottom for action bar
    const actionBarAreaH = 62;
    const handTrayH = Math.round(cardH + highlightLift + 16);
    const deckW = Math.round(cardW + 22);
    const handTrayY = h - safe.bottom - actionBarAreaH - handTrayH - 8;

    const handTray: RectPx = {
      x: tableX,
      y: handTrayY,
      w: tableW - deckW - 14,
      h: handTrayH,
    };
    const deckPile: RectPx = {
      x: tableX + tableW - deckW,
      y: handTrayY + Math.round((handTrayH - cardH) * 0.5),
      w: deckW,
      h: cardH,
    };
    const actionBar: RectPx = {
      x: handTray.x,
      y: h - safe.bottom - actionBarAreaH,
      w: handTray.w,
      h: 54,
    };

    // Middle arena: Play Area (between top row and hand tray)
    const midY = jokerTray.y + jokerTray.h + 12;
    const midH = Math.max(cardH + 16, handTray.y - midY - 10);
    const playArea: RectPx = { x: tableX, y: midY, w: tableW, h: midH };

    // Shop trays (below top row with clear counter headroom)
    const shopTopY = jokerTray.y + jokerTray.h + 28;
    const shopControlsW = Math.round(Math.min(200, Math.max(152, tableW * 0.22)));
    const shopRightX = tableX + shopControlsW + 16;
    const shopRightW = tableW - shopControlsW - 16;
    const maxShopRowH = Math.floor((h - safe.bottom - 12 - shopTopY - 14) / 2);
    const shopCardRowH = Math.min(Math.round(cardH + 52), Math.max(cardH + 40, maxShopRowH));

    const shopControls: RectPx = {
      x: tableX + 6,
      y: shopTopY,
      w: shopControlsW - 10,
      h: shopCardRowH,
    };
    const shopOfferTray: RectPx = {
      x: shopRightX,
      y: shopTopY,
      w: shopRightW,
      h: shopCardRowH,
    };
    const shopBottomY = shopOfferTray.y + shopOfferTray.h + 14;
    const shopVoucherW = Math.round(shopRightW * 0.34);
    const shopVoucherTray: RectPx = {
      x: shopRightX,
      y: shopBottomY,
      w: shopVoucherW,
      h: shopCardRowH,
    };
    const shopBoosterTray: RectPx = {
      x: shopRightX + shopVoucherW + 16,
      y: shopBottomY,
      w: shopRightW - shopVoucherW - 16,
      h: shopCardRowH,
    };

    // Pack open tray centered in middle arena
    const packTopPad = usableH < 640 ? 4 : 18;
    const packMaxH = Math.max(80, handTray.y - (midY + packTopPad) - 6);
    const packTray: RectPx = {
      x: tableX + 20,
      y: midY + packTopPad,
      w: tableW - 40,
      h: usableH < 640 ? packMaxH : Math.max(cardH + 40, midH - 24),
    };

    return {
      viewportW: w,
      viewportH: h,
      mode,
      safeInsets: safe,
      hudDock,
      actionBar,
      shopControls,
      compact: usableH < 680 || usableW < 1040,
      leftRail,
      table,
      jokerTray,
      consumableTray,
      playArea,
      handTray,
      deckPile,
      shopOfferTray,
      shopVoucherTray,
      shopBoosterTray,
      packTray,
      cardW,
      cardH,
      highlightLift,
      pixelScale: h / LAYOUT.TILE_H,
    };
  }

  // =========================================================================
  // MODE 2: MOBILE LANDSCAPE (e.g., 844x390, 667x375, 915x412, 740x360, 812x375)
  // Slim left HUD rail + full-height compact felt table with zero clipping
  // =========================================================================
  if (mode === 'mobile-landscape') {
    const marginX = 6;
    const marginY = 6;
    const innerL = safe.left + marginX;
    const innerR = w - safe.right - marginX;
    const innerT = safe.top + marginY;
    const innerB = h - safe.bottom - marginY;
    const usableW = Math.max(260, innerR - innerL);
    const usableH = Math.max(260, innerB - innerT);

    const railW = Math.round(Math.min(212, Math.max(168, usableW * 0.245)));
    const leftRail: RectPx = { x: innerL, y: innerT, w: railW, h: usableH };
    const hudDock: RectPx = { ...leftRail };

    const railGap = 8;
    const tableX = leftRail.x + leftRail.w + railGap;
    const tableW = Math.max(200, innerR - tableX);
    const table: RectPx = { x: tableX, y: innerT, w: tableW, h: usableH };

    const actionBarH = Math.round(Math.min(50, Math.max(44, usableH * 0.125)));

    // Dynamic cardH fitting Joker row + Play Area + Hand + Action Bar AND 2-row Shop
    const cardHFromPlay = Math.floor((usableH - actionBarH - 48) / 3.18);
    const cardHFromShop = Math.floor((usableH - 126) / 2.8);
    const cardHFromWidth = Math.floor((tableW * 0.145) / aspect);
    const cardH = Math.round(
      Math.min(116, Math.max(74, Math.min(cardHFromPlay, cardHFromShop, cardHFromWidth)))
    );
    const cardW = Math.round(cardH * aspect);
    const highlightLift = Math.round(cardH * 0.18);

    // Top felt row: Jokers (66%) + Consumables (34%)
    const topRowH = cardH + 12;
    const trayGap = 8;
    const jokerW = Math.round((tableW - trayGap) * 0.66);
    const consW = tableW - trayGap - jokerW;
    const jokerTray: RectPx = { x: tableX, y: innerT, w: jokerW, h: topRowH };
    const consumableTray: RectPx = { x: tableX + jokerW + trayGap, y: innerT, w: consW, h: topRowH };

    // Bottom action bar, hand tray, and deck pile
    const actionBarY = innerB - actionBarH;
    const handTrayH = cardH + highlightLift + 10;
    const handTrayY = actionBarY - 4 - handTrayH;
    const deckW = Math.round(Math.min(cardW + 14, Math.max(54, tableW * 0.165)));
    const handDeckGap = 8;
    const handTray: RectPx = {
      x: tableX,
      y: handTrayY,
      w: Math.max(120, tableW - deckW - handDeckGap),
      h: handTrayH,
    };
    const deckCardH = Math.min(cardH, Math.max(50, handTrayH - 30));
    const deckPile: RectPx = {
      x: tableX + tableW - deckW,
      y: handTrayY + Math.max(0, Math.round((handTrayH - deckCardH - 26) * 0.5)),
      w: deckW,
      h: deckCardH,
    };
    const actionBar: RectPx = {
      x: tableX,
      y: actionBarY,
      w: tableW,
      h: actionBarH,
    };

    // Middle Play Area cleanly between top row and hand tray
    const midY = jokerTray.y + jokerTray.h + 6;
    const midH = Math.max(cardH + 6, handTray.y - midY - 6);
    const playArea: RectPx = { x: tableX, y: midY, w: tableW, h: midH };

    // Shop: compact left shopControls + 2 crisp rows strictly inside viewport bounds
    const shopTopY = jokerTray.y + jokerTray.h + 18;
    const shopRowGap = 8;
    const availShopH = Math.max(160, innerB - shopTopY);
    const shopRowH = Math.floor((availShopH - shopRowGap) / 2);
    const shopControlsW = Math.round(Math.min(138, Math.max(96, tableW * 0.21)));
    const shopColGap = 8;
    const shopRightX = tableX + shopControlsW + shopColGap;
    const shopRightW = Math.max(160, tableW - shopControlsW - shopColGap);

    const shopControls: RectPx = {
      x: tableX,
      y: shopTopY,
      w: shopControlsW,
      h: shopRowH * 2 + shopRowGap,
    };
    const shopOfferTray: RectPx = {
      x: shopRightX,
      y: shopTopY,
      w: shopRightW,
      h: shopRowH,
    };
    const shopBottomY = shopOfferTray.y + shopOfferTray.h + shopRowGap;
    const shopSubGap = 8;
    const shopVoucherW = Math.round((shopRightW - shopSubGap) * 0.36);
    const shopVoucherTray: RectPx = {
      x: shopRightX,
      y: shopBottomY,
      w: shopVoucherW,
      h: shopRowH,
    };
    const shopBoosterTray: RectPx = {
      x: shopRightX + shopVoucherW + shopSubGap,
      y: shopBottomY,
      w: shopRightW - shopVoucherW - shopSubGap,
      h: shopRowH,
    };

    // Pack tray sits cleanly above handTray
    const packTray: RectPx = {
      x: tableX + 4,
      y: midY,
      w: tableW - 8,
      h: Math.max(84, handTray.y - midY - 4),
    };

    return {
      viewportW: w,
      viewportH: h,
      mode,
      safeInsets: safe,
      hudDock,
      actionBar,
      shopControls,
      compact: true,
      leftRail,
      table,
      jokerTray,
      consumableTray,
      playArea,
      handTray,
      deckPile,
      shopOfferTray,
      shopVoucherTray,
      shopBoosterTray,
      packTray,
      cardW,
      cardH,
      highlightLift,
      pixelScale: Math.max(24, h / LAYOUT.TILE_H),
    };
  }

  // =========================================================================
  // MODE 3: MOBILE PORTRAIT (e.g., 390x844, 375x667, 412x915, 360x780, 768x1024)
  // Full-width top HUD dock + full-width table, top Joker/Consumable row,
  // spacious play arena, bottom hand (~82% width) + deck pile, 54px action bar
  // =========================================================================
  const isTablet = w >= 600;
  const marginX = isTablet ? 12 : 8;
  const marginY = isTablet ? 10 : 6;
  const innerL = safe.left + marginX;
  const innerR = w - safe.right - marginX;
  const innerT = safe.top + marginY;
  const innerB = h - safe.bottom - marginY;
  const usableW = Math.max(260, innerR - innerL);
  const usableH = Math.max(400, innerB - innerT);

  const hudH = Math.round(Math.min(132, Math.max(108, usableH * 0.148)));
  const hudDock: RectPx = { x: innerL, y: innerT, w: usableW, h: hudH };
  const leftRail: RectPx = { ...hudDock };

  const tableGap = isTablet ? 10 : 8;
  const tableY = hudDock.y + hudDock.h + tableGap;
  const tableH = Math.max(300, innerB - tableY);
  const table: RectPx = { x: innerL, y: tableY, w: usableW, h: tableH };

  const actionBarH = 54;
  const actionBar: RectPx = {
    x: innerL,
    y: innerB - actionBarH,
    w: usableW,
    h: actionBarH,
  };

  const shopControlsH = h >= 760 ? 52 : 48;

  // Dynamic cardH honoring width readability, Playing stack, and Portrait Shop stack
  const maxCardWFromW = Math.round(usableW * (isTablet ? 0.165 : 0.212));
  const cardHFromWidth = Math.floor(maxCardWFromW / aspect);
  const cardHFromPlay = Math.floor((tableH - actionBarH - 68) / 3.2);
  const cardHFromShop = Math.floor((tableH - shopControlsH - 156) / 2.88);
  const cardH = Math.round(
    Math.min(150, Math.max(76, Math.min(cardHFromWidth, cardHFromPlay, cardHFromShop)))
  );
  const cardW = Math.round(cardH * aspect);
  const highlightLift = Math.round(cardH * 0.2);

  // Top felt row right below hudDock: Jokers (~65%) + Consumables (~35%)
  const topRowH = cardH + 14;
  const trayGap = 8;
  const jokerW = Math.round((usableW - trayGap) * 0.65);
  const consW = usableW - trayGap - jokerW;
  const jokerTray: RectPx = { x: innerL, y: tableY, w: jokerW, h: topRowH };
  const consumableTray: RectPx = { x: innerL + jokerW + trayGap, y: tableY, w: consW, h: topRowH };

  // Bottom handTray (~80-82% width) + compact deckPile on right, above actionBar
  const handTrayH = cardH + highlightLift + 14;
  const handTrayY = actionBar.y - 8 - handTrayH;
  const deckGap = isTablet ? 10 : 8;
  const deckW = Math.round(Math.min(cardW + 14, Math.max(56, usableW * 0.18)));
  const handTray: RectPx = {
    x: innerL,
    y: handTrayY,
    w: Math.max(160, usableW - deckW - deckGap),
    h: handTrayH,
  };
  const deckMaxCardW = Math.max(42, deckW - 8);
  const deckCardH = Math.min(cardH, Math.round(deckMaxCardW / aspect), Math.max(54, handTrayH - 34));
  const deckPile: RectPx = {
    x: innerL + usableW - deckW,
    y: handTrayY + Math.max(2, Math.round((handTrayH - deckCardH - 28) * 0.5)),
    w: deckW,
    h: deckCardH,
  };

  // Middle Play Area cleanly between top felt row and handTray
  const midY = jokerTray.y + jokerTray.h + 10;
  const midH = Math.max(cardH + 16, handTray.y - midY - 8);
  const playArea: RectPx = { x: innerL, y: midY, w: usableW, h: midH };

  // Shop in portrait: horizontal shopControls bar -> shopOfferTray -> voucher (38%) + booster (62%)
  const shopControlsY = jokerTray.y + jokerTray.h + 20;
  const shopControls: RectPx = {
    x: innerL,
    y: shopControlsY,
    w: usableW,
    h: shopControlsH,
  };
  const shopOfferY = shopControls.y + shopControls.h + 10;
  const shopRowGap = 10;
  const availShopH = Math.max(220, innerB - shopOfferY);
  const maxShopRowH = Math.floor((availShopH - shopRowGap) / 2);
  const shopRowH = Math.min(maxShopRowH, Math.max(cardH + 54, Math.round(cardH + 64)));

  const shopOfferTray: RectPx = {
    x: innerL,
    y: shopOfferY,
    w: usableW,
    h: shopRowH,
  };
  const shopBottomY = shopOfferTray.y + shopOfferTray.h + shopRowGap;
  const shopSubGap = 8;
  const shopVoucherW = Math.round((usableW - shopSubGap) * 0.38);
  const shopVoucherTray: RectPx = {
    x: innerL,
    y: shopBottomY,
    w: shopVoucherW,
    h: shopRowH,
  };
  const shopBoosterTray: RectPx = {
    x: innerL + shopVoucherW + shopSubGap,
    y: shopBottomY,
    w: usableW - shopVoucherW - shopSubGap,
    h: shopRowH,
  };

  // Pack Open in portrait: sits cleanly in middle arena above handTray
  const packTray: RectPx = {
    x: innerL + 4,
    y: midY + 4,
    w: usableW - 8,
    h: Math.max(cardH + 36, midH - 8),
  };

  return {
    viewportW: w,
    viewportH: h,
    mode,
    safeInsets: safe,
    hudDock,
    actionBar,
    shopControls,
    compact: true,
    leftRail,
    table,
    jokerTray,
    consumableTray,
    playArea,
    handTray,
    deckPile,
    shopOfferTray,
    shopVoucherTray,
    shopBoosterTray,
    packTray,
    cardW,
    cardH,
    highlightLift,
    pixelScale: Math.max(26, Math.min(w, h) / 7.5),
  };
}

// ---------------------------------------------------------------------------
// Scene State Manager: maintains persistent Moveables across frames
// ---------------------------------------------------------------------------

interface SlotRowLayout {
  startX: number;
  step: number;
  count: number;
}

export class CardSceneManager {
  private moveables = new Map<string, Moveable>();
  private visualCards: VisualCard[] = [];
  private geometry: TableGeometry = computeTableGeometry(1280, 720);
  private safeInsetsOverride: SafeInsets | null = null;
  private cachedSafeInsets: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  private lastMeasuredW = 0;
  private lastMeasuredH = 0;

  private draggingId: string | null = null;
  private dragKind: VisualEntityKind | null = null;
  private dragPreviewIndex: number | null = null;
  private dragPointerX = 0;
  private dragPointerY = 0;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private hoveredId: string | null = null;

  private handSlotLayout: SlotRowLayout = { startX: 0, step: 0, count: 0 };
  private jokerSlotLayout: SlotRowLayout = { startX: 0, step: 0, count: 0 };

  setSafeInsets(insets: Partial<SafeInsets> | null): void {
    this.safeInsetsOverride = insets ? sanitizeSafeInsets(insets) : null;
  }

  private getActiveSafeInsets(viewportW: number, viewportH: number): SafeInsets {
    if (this.safeInsetsOverride) return this.safeInsetsOverride;
    if (viewportW !== this.lastMeasuredW || viewportH !== this.lastMeasuredH) {
      this.lastMeasuredW = viewportW;
      this.lastMeasuredH = viewportH;
      this.cachedSafeInsets = readSafeAreaInsets();
    }
    return this.cachedSafeInsets;
  }

  getGeometry(): TableGeometry {
    return this.geometry;
  }

  getVisualCards(): readonly VisualCard[] {
    return this.visualCards;
  }

  getVisualCardById(id: string): VisualCard | undefined {
    return this.visualCards.find((c) => c.id === id);
  }

  getHoveredCard(): VisualCard | null {
    if (!this.hoveredId) return null;
    return this.visualCards.find((c) => c.id === this.hoveredId) ?? null;
  }

  getDraggingCard(): VisualCard | null {
    if (!this.draggingId) return null;
    return this.visualCards.find((c) => c.id === this.draggingId) ?? null;
  }

  getDragPreviewIndex(): number | null {
    return this.dragPreviewIndex;
  }

  getDragKind(): VisualEntityKind | null {
    return this.dragKind;
  }

  getMoveable(id: string): Moveable | undefined {
    return this.moveables.get(id);
  }

  juiceEntity(id: string, amount = 0.4, rotAmt?: number, nowSec = performance.now() / 1000): void {
    const m = this.moveables.get(id);
    if (m) m.juiceUp(amount, rotAmt, nowSec);
  }

  setDissolve(id: string, dissolve: number): void {
    const m = this.moveables.get(id);
    if (m) m.dissolve = dissolve;
  }

  private computeDragPreviewIndex(kind: 'hand' | 'joker', dropX: number): number | null {
    const layout = kind === 'hand' ? this.handSlotLayout : this.jokerSlotLayout;
    if (layout.count <= 0) return null;
    if (layout.count === 1 || layout.step <= 0.001) return 0;
    const raw = Math.round((dropX - layout.startX) / layout.step);
    return Math.max(0, Math.min(layout.count - 1, raw));
  }

  startDrag(id: string, pointerX: number, pointerY: number): void {
    const card = this.visualCards.find((c) => c.id === id);
    if (!card || !card.draggable) return;
    this.draggingId = id;
    this.dragKind = card.kind;
    this.dragPointerX = pointerX;
    this.dragPointerY = pointerY;
    this.dragOffsetX = card.moveable.vx - pointerX;
    this.dragOffsetY = card.moveable.vy - pointerY;
    this.dragPreviewIndex =
      card.kind === 'hand' || card.kind === 'joker' ? card.index : null;
    card.moveable.dragging = true;
  }

  updateDrag(pointerX: number, pointerY: number): void {
    this.dragPointerX = pointerX;
    this.dragPointerY = pointerY;
    if (this.draggingId && (this.dragKind === 'hand' || this.dragKind === 'joker')) {
      const dropX = this.dragPointerX + this.dragOffsetX;
      this.dragPreviewIndex = this.computeDragPreviewIndex(this.dragKind, dropX);
    }
  }

  cancelDrag(): void {
    if (this.draggingId) {
      const m = this.moveables.get(this.draggingId);
      if (m) m.dragging = false;
    }
    this.draggingId = null;
    this.dragKind = null;
    this.dragPreviewIndex = null;
  }

  endDrag(): { kind: VisualEntityKind; fromIndex: number; toIndex: number } | null {
    if (!this.draggingId) return null;
    const card = this.visualCards.find((c) => c.id === this.draggingId);
    const prevId = this.draggingId;
    const prevPreview = this.dragPreviewIndex;
    this.draggingId = null;
    this.dragKind = null;
    this.dragPreviewIndex = null;

    const m = this.moveables.get(prevId);
    if (m) m.dragging = false;
    if (!card) return null;

    if (card.kind === 'hand' || card.kind === 'joker') {
      const dropX = this.dragPointerX + this.dragOffsetX;
      const computed = this.computeDragPreviewIndex(card.kind, dropX);
      let targetIdx = computed ?? prevPreview ?? card.index;
      if (computed === null && prevPreview === null) {
        const siblings = this.visualCards
          .filter((c) => c.kind === card.kind)
          .sort((a, b) => a.index - b.index);
        targetIdx = siblings.length - 1;
        for (let i = 0; i < siblings.length; i++) {
          if (dropX < siblings[i]!.moveable.tx) {
            targetIdx = i;
            break;
          }
        }
      }
      if (targetIdx !== card.index) {
        return { kind: card.kind, fromIndex: card.index, toIndex: targetIdx };
      }
    }
    return null;
  }

  updateHover(pointerX: number, pointerY: number, hitPadPx = 0): VisualCard | null {
    const findHit = (pad: number): VisualCard | null => {
      // Reverse Z-order hit test (front-most card wins)
      for (let i = this.visualCards.length - 1; i >= 0; i--) {
        const vc = this.visualCards[i]!;
        const m = vc.moveable;
        const hw = m.vw * m.vScale * 0.5 + pad;
        const hh = m.vh * m.vScale * 0.5 + pad;
        if (
          pointerX >= m.vx - hw &&
          pointerX <= m.vx + hw &&
          pointerY >= m.vy - hh &&
          pointerY <= m.vy + hh
        ) {
          return vc;
        }
      }
      return null;
    };

    // Pass 1: exact hit so tight overlapping hands always hit the card directly under pointer.
    // Pass 2: forgiving touch padding only when exact hit missed.
    let hit = findHit(0);
    if (!hit && hitPadPx > 0) {
      hit = findHit(hitPadPx);
    }

    this.hoveredId = hit ? hit.id : null;
    for (const vc of this.visualCards) {
      const m = vc.moveable;
      const isHit = vc === hit;
      m.hovered = isHit;
      if (isHit) {
        const hw = Math.max(1, m.vw * 0.5);
        const hh = Math.max(1, m.vh * 0.5);
        m.targetTiltX = Math.max(-1, Math.min(1, (pointerX - m.vx) / hw));
        m.targetTiltY = Math.max(-1, Math.min(1, (pointerY - m.vy) / hh));
      } else if (vc.kind === 'title_showcase') {
        // Gentle magnetic cursor tracking for the iconic Title Ace of Spades
        const spanX = Math.max(240, this.geometry.viewportW * 0.45);
        const spanY = Math.max(180, this.geometry.viewportH * 0.45);
        m.targetTiltX = Math.max(-0.55, Math.min(0.55, (pointerX - m.vx) / spanX));
        m.targetTiltY = Math.max(-0.55, Math.min(0.55, (pointerY - m.vy) / spanY));
      }
    }
    return hit;
  }

  /**
   * Synchronize visual entities with the authoritative SimState and step all springs.
   */
  syncAndStep(
    state: SimState,
    viewportW: number,
    viewportH: number,
    highContrast: boolean,
    reducedMotion: boolean,
    dt: number,
    nowSec: number,
    scoringCardIds?: ReadonlySet<string> | null,
    previewScoringIds?: ReadonlySet<string> | null,
    forcedCardId?: string | null
  ): void {
    const safeInsets = this.getActiveSafeInsets(viewportW, viewportH);
    this.geometry = computeTableGeometry(viewportW, viewportH, safeInsets);
    const g = this.geometry;
    const aspect = LAYOUT.CARD_W / LAYOUT.CARD_H;
    const faceAtlas: AtlasKey = highContrast ? 'cards_2' : 'cards_1';
    const deckBack = getDeckBackPos(state.deckId);

    const effectiveForcedId =
      forcedCardId !== undefined
        ? forcedCardId
        : state.phase === 'PLAYING'
          ? (state.tracking?.ceruleanBellForcedCardId ?? null)
          : null;

    const cardById = new Map<string, CardInstance>();
    for (const c of state.fullDeck) cardById.set(c.id, c);

    const nextVisuals: VisualCard[] = [];
    const seenIds = new Set<string>();

    const ensureMoveable = (
      id: string,
      spawnX: number,
      spawnY: number,
      w: number,
      h: number,
      initialFlipFromBack = false,
      flipDelay = 0
    ): Moveable => {
      seenIds.add(id);
      let m = this.moveables.get(id);
      if (!m) {
        m = new Moveable();
        m.tx = spawnX;
        m.ty = spawnY;
        m.tw = w;
        m.th = h;
        m.vx = spawnX;
        m.vy = spawnY;
        m.vw = w;
        m.vh = h;
        m.initialized = true;
        if (initialFlipFromBack && !reducedMotion) {
          m.triggerFlip(true, 0.22, flipDelay);
        }
        this.moveables.set(id, m);
      }
      return m;
    };

    const computePartedSlotX = (
      idx: number,
      fromIdx: number,
      previewIdx: number,
      startX: number,
      step: number
    ): number => {
      let visualSlot = idx;
      if (fromIdx < previewIdx && idx > fromIdx && idx <= previewIdx) {
        visualSlot = idx - 1;
      } else if (fromIdx > previewIdx && idx >= previewIdx && idx < fromIdx) {
        visualSlot = idx + 1;
      }
      let x = startX + visualSlot * step;
      if (step > 0) {
        const gapNudge = Math.min(10, step * 0.14);
        if (visualSlot < previewIdx) {
          x -= gapNudge;
        } else if (visualSlot > previewIdx) {
          x += gapNudge;
        }
      }
      return x;
    };

    // --- TITLE PHASE: Iconic Dramatic Single Oversized Ace of Spades in Vortex Core ---
    if (state.phase === 'TITLE') {
      this.handSlotLayout = { startX: 0, step: 0, count: 0 };
      this.jokerSlotLayout = { startX: 0, step: 0, count: 0 };

      const targetMult =
        g.mode === 'mobile-portrait' ? 1.72 : g.mode === 'mobile-landscape' ? 1.42 : 1.65;
      const maxShowcaseH =
        g.mode === 'desktop'
          ? Math.round(g.cardH * 1.65)
          : Math.round(
              Math.min(
                g.cardH * targetMult,
                (g.viewportH - g.safeInsets.top - g.safeInsets.bottom) * 0.34,
                ((g.viewportW - g.safeInsets.left - g.safeInsets.right) * 0.46) / aspect
              )
            );
      const showcaseH = Math.max(96, maxShowcaseH);
      const showcaseW = Math.round(showcaseH * aspect);
      const cx = g.viewportW * 0.5;
      const cy =
        g.mode === 'mobile-portrait'
          ? g.viewportH * 0.47
          : g.mode === 'mobile-landscape'
            ? g.viewportH * 0.5
            : g.viewportH * 0.49;
      const bob = reducedMotion ? 0 : Math.sin(nowSec * 1.55) * (g.compact ? 4 : 6);
      const sway = reducedMotion ? 0 : Math.sin(nowSec * 0.92) * 0.042;
      const isNewTitleAce = !this.moveables.has('title_ace');
      const m = ensureMoveable('title_ace', cx, cy + 20, showcaseW, showcaseH, false, 0);
      if (isNewTitleAce && !reducedMotion) {
        m.juiceUp(0.32, 0.14, nowSec);
      }
      m.tx = cx;
      m.ty = cy + bob;
      m.tw = showcaseW;
      m.th = showcaseH;
      m.tr = sway;
      m.tScale = 1.0;

      nextVisuals.push({
        id: 'title_ace',
        kind: 'title_showcase',
        index: 0,
        moveable: m,
        zIndex: 20,
        selected: false,
        draggable: false,
        baseAtlas: 'centers',
        basePos: { x: 1, y: 0 },
        faceAtlas,
        facePos: getCardFacePos('Spades', 'Ace'),
        stickers: [],
        edition: 'none',
        debuffed: false,
        faceDown: false,
        flipScaleX: m.getFlipScaleX(),
      });
    } else {
      // --- 1. JOKER TRAY (Always visible during run) ---
      const jCount = state.jokers.length;
      const jCardScale = g.compact ? 0.92 : 0.94;
      const jCardH = Math.round(g.cardH * jCardScale);
      const jCardW = Math.round(g.cardW * jCardScale);
      const jPad = g.compact ? 8 : 14;
      const jAvailW = Math.max(jCardW, g.jokerTray.w - jPad * 2 - jCardW);
      const jStep = jCount > 1 ? Math.min(jCardW + (g.compact ? 6 : 10), jAvailW / (jCount - 1)) : 0;
      const jSpan = jStep * Math.max(0, jCount - 1);
      const jStartX = g.jokerTray.x + g.jokerTray.w * 0.5 - jSpan * 0.5;
      const jCenterY = g.jokerTray.y + g.jokerTray.h * 0.5 - (g.compact ? 1 : 3);

      this.jokerSlotLayout = { startX: jStartX, step: jStep, count: jCount };

      const draggedJokerIdx =
        this.draggingId && this.dragKind === 'joker'
          ? state.jokers.findIndex((j) => j.id === this.draggingId)
          : -1;
      const jokerPreviewIdx =
        draggedJokerIdx >= 0
          ? this.computeDragPreviewIndex('joker', this.dragPointerX + this.dragOffsetX)
          : null;
      if (draggedJokerIdx >= 0) {
        this.dragPreviewIndex = jokerPreviewIdx;
      }

      state.jokers.forEach((joker, idx) => {
        const def = JOKER_MAP[joker.key];
        const shape = getJokerShapeDimensions(joker.key, jCardW, jCardH);
        const slotX =
          draggedJokerIdx >= 0 && jokerPreviewIdx !== null && idx !== draggedJokerIdx
            ? computePartedSlotX(idx, draggedJokerIdx, jokerPreviewIdx, jStartX, jStep)
            : jStartX + idx * jStep;
        const m = ensureMoveable(joker.id, slotX, jCenterY, shape.tw, shape.th);
        m.syncFaceDown(joker.faceDown, reducedMotion);

        m.tx = slotX;
        m.ty = jCenterY + (reducedMotion ? 0 : Math.sin(nowSec * 1.65 + idx * 0.95) * 1.8);
        m.tw = shape.tw;
        m.th = shape.th;
        m.tr = reducedMotion ? 0 : Math.sin(nowSec * 1.12 + idx * 1.4) * 0.016;
        m.tScale = 1;

        const displayFaceDown = m.getDisplayFaceDown(joker.faceDown);
        const stickers: AtlasPos[] = [];
        if (joker.eternal) stickers.push({ x: 0, y: 0 });
        if (joker.perishable) stickers.push({ x: 0, y: 2 });
        if (joker.rental) stickers.push({ x: 1, y: 2 });

        nextVisuals.push({
          id: joker.id,
          kind: 'joker',
          index: idx,
          moveable: m,
          zIndex: 30 + idx,
          selected: false,
          draggable: true,
          baseAtlas: displayFaceDown ? 'centers' : 'Joker',
          basePos: displayFaceDown ? deckBack : (def?.pos ?? { x: 0, y: 0 }),
          ...getJokerSoulFields(joker.key, displayFaceDown),
          cardShape: displayFaceDown ? undefined : shape.cardShape,
          flipScaleX: m.getFlipScaleX(),
          stickers,
          edition: displayFaceDown ? 'none' : joker.edition,
          debuffed: joker.debuffed,
          faceDown: displayFaceDown,
          jokerData: joker,
        });
      });

      // --- 2. CONSUMABLE TRAY (Always visible during run) ---
      const cCount = state.consumables.length;
      const cCardH = Math.round(g.cardH * jCardScale);
      const cCardW = Math.round(g.cardW * jCardScale);
      const cPad = g.compact ? 12 : 28;
      const cAvailW = Math.max(cCardW, g.consumableTray.w - cPad - cCardW);
      const cStep = cCount > 1 ? Math.min(cCardW + (g.compact ? 6 : 10), cAvailW / (cCount - 1)) : 0;
      const cSpan = cStep * Math.max(0, cCount - 1);
      const cStartX = g.consumableTray.x + g.consumableTray.w * 0.5 - cSpan * 0.5;
      const cCenterY = g.consumableTray.y + g.consumableTray.h * 0.5 - (g.compact ? 1 : 3);

      state.consumables.forEach((cons, idx) => {
        const def = CONSUMABLE_MAP[cons.key];
        const m = ensureMoveable(cons.id, cStartX + idx * cStep, cCenterY, cCardW, cCardH);
        const extraBob = cons.key === 'c_soul' || cons.key === 'c_black_hole' ? 3.5 : 2.0;
        m.tx = cStartX + idx * cStep;
        m.ty = cCenterY + (reducedMotion ? 0 : Math.sin(nowSec * 1.9 + idx * 1.2) * extraBob);
        m.tw = cCardW;
        m.th = cCardH;
        m.tr = reducedMotion ? 0 : Math.cos(nowSec * 1.2 + idx) * 0.02;
        m.tScale = 1;

        nextVisuals.push({
          id: cons.id,
          kind: 'consumable',
          index: idx,
          moveable: m,
          zIndex: 40 + idx,
          selected: false,
          draggable: false,
          baseAtlas: 'Tarot',
          basePos: def?.pos ?? { x: 0, y: 0 },
          ...getConsumableSpecialFields(cons.key),
          flipScaleX: m.getFlipScaleX(),
          stickers: [],
          edition: cons.edition,
          debuffed: false,
          faceDown: false,
          consumableData: cons,
        });
      });

      // --- 3. PLAY AREA (PLAYING / SCORING) ---
      if (state.phase === 'PLAYING' || state.phase === 'SCORING') {
        const pCount = state.playArea.length;
        const pPad = g.compact ? 16 : 40;
        const pMaxGap = g.compact ? 10 : 18;
        const pStep =
          pCount > 1
            ? Math.min(g.cardW + pMaxGap, Math.max(24, (g.playArea.w - g.cardW - pPad) / (pCount - 1)))
            : 0;
        const pSpan = pStep * Math.max(0, pCount - 1);
        const pStartX = g.playArea.x + g.playArea.w * 0.5 - pSpan * 0.5;
        const pCenterY = g.playArea.y + g.playArea.h * 0.5;
        const hasScoringFilter =
          state.phase === 'SCORING' && scoringCardIds != null && scoringCardIds.size > 0;

        state.playArea.forEach((cid, idx) => {
          const card = cardById.get(cid);
          if (!card) return;
          const isNonScoring = hasScoringFilter && !scoringCardIds!.has(cid);
          const m = ensureMoveable(card.id, pStartX + idx * pStep, pCenterY + 60, g.cardW, g.cardH);
          m.syncFaceDown(card.faceDown, reducedMotion);

          m.tx = pStartX + idx * pStep;
          m.ty = pCenterY + (isNonScoring ? 8 : hasScoringFilter ? -5 : 0);
          m.tw = g.cardW;
          m.th = g.cardH;
          m.tr = 0;
          m.tScale = isNonScoring ? 0.96 : hasScoringFilter ? 1.07 : 1.04;

          nextVisuals.push(
            makePlayingCardVisual(
              card,
              'play',
              idx,
              m,
              60 + idx + (isNonScoring ? 0 : 6),
              false,
              false,
              faceAtlas,
              deckBack,
              isNonScoring,
              false,
              false
            )
          );
        });
      }

      // --- 4. PLAYER HAND TRAY + DECK PILE (PLAYING / SCORING / PACK_OPEN with needsHand) ---
      const isPackWithHand = state.phase === 'PACK_OPEN' && Boolean(state.pack?.needsHand);
      const showHand =
        state.phase === 'PLAYING' || state.phase === 'SCORING' || isPackWithHand;

      // In tight mobile-landscape PACK_OPEN (where the bottom action bar is hidden),
      // shift hand & deck neatly down into the unused action bar zone so pack cards stay spacious.
      const handPackOffsetY =
        isPackWithHand && g.mode === 'mobile-landscape'
          ? Math.round(g.actionBar.h * 0.78)
          : 0;

      if (showHand) {
        const hCount = state.hand.length;
        const hPad = g.compact ? 14 : 36;
        const hAvailW = Math.max(g.cardW, g.handTray.w - g.cardW - hPad);
        const hStep = hCount > 1 ? Math.min(g.cardW + (g.compact ? 5 : 8), hAvailW / (hCount - 1)) : 0;
        const hSpan = hStep * Math.max(0, hCount - 1);
        const hStartX = g.handTray.x + g.handTray.w * 0.5 - hSpan * 0.5;
        const hBaseY = g.handTray.y + handPackOffsetY + g.handTray.h * 0.5 + g.highlightLift * 0.4;
        const midIdx = (hCount - 1) * 0.5;

        this.handSlotLayout = { startX: hStartX, step: hStep, count: hCount };

        const draggedHandIdx =
          this.draggingId && this.dragKind === 'hand'
            ? state.hand.indexOf(this.draggingId)
            : -1;
        const handPreviewIdx =
          draggedHandIdx >= 0
            ? this.computeDragPreviewIndex('hand', this.dragPointerX + this.dragOffsetX)
            : null;
        if (draggedHandIdx >= 0) {
          this.dragPreviewIndex = handPreviewIdx;
        }

        const arcAmp = g.mode === 'mobile-landscape' ? 8 : g.mode === 'mobile-portrait' ? 11 : 15;
        const rotAmp = g.compact ? 0.056 : 0.072;

        // Deck pile card dimensions scaled cleanly to fit inside g.deckPile across all modes
        const deckCardH = Math.min(g.cardH, g.deckPile.h);
        const deckCardW = Math.min(
          g.cardW,
          Math.max(38, Math.min(Math.round(deckCardH * aspect), g.deckPile.w - 4))
        );
        const deckCenterX = g.deckPile.x + g.deckPile.w * 0.5;
        const deckCenterY = g.deckPile.y + handPackOffsetY + g.deckPile.h * 0.5;

        state.hand.forEach((cid, idx) => {
          const card = cardById.get(cid);
          if (!card) return;
          const isSelected = state.selectedCardIds.includes(cid);
          const isForced = effectiveForcedId !== null && cid === effectiveForcedId;
          const isScoringPreview =
            state.phase === 'PLAYING' && isSelected && Boolean(previewScoringIds?.has(cid));

          let visualSlot = idx;
          if (draggedHandIdx >= 0 && handPreviewIdx !== null && idx !== draggedHandIdx) {
            if (draggedHandIdx < handPreviewIdx && idx > draggedHandIdx && idx <= handPreviewIdx) {
              visualSlot = idx - 1;
            } else if (draggedHandIdx > handPreviewIdx && idx >= handPreviewIdx && idx < draggedHandIdx) {
              visualSlot = idx + 1;
            }
          }
          const slotX =
            draggedHandIdx >= 0 && handPreviewIdx !== null && idx !== draggedHandIdx
              ? computePartedSlotX(idx, draggedHandIdx, handPreviewIdx, hStartX, hStep)
              : hStartX + idx * hStep;

          const normOff = hCount > 1 ? (visualSlot - midIdx) / Math.max(1, midIdx) : 0;
          const arcY = normOff * normOff * arcAmp;
          const arcRot = normOff * rotAmp;

          // Newly drawn cards fly smoothly out of the Deck Pile and flip face-up!
          const m = ensureMoveable(
            card.id,
            deckCenterX,
            deckCenterY,
            g.cardW,
            g.cardH,
            !card.faceDown,
            0.03 * idx
          );
          m.syncFaceDown(card.faceDown, reducedMotion);

          const idleBreath = reducedMotion ? 0 : Math.sin(nowSec * 1.4 + idx * 0.75) * 1.2;
          const forcedPulse =
            isForced && !reducedMotion ? Math.sin(nowSec * 4.5) * 2.2 : 0;
          const extraLift =
            (isScoringPreview ? 3 : 0) + (isForced && !isSelected ? 6 : 0);

          m.tx = slotX;
          m.ty = hBaseY + arcY + idleBreath + forcedPulse - (isSelected ? g.highlightLift : 0) - extraLift;
          m.tw = g.cardW;
          m.th = g.cardH;
          m.tr = arcRot;
          m.tScale = isScoringPreview ? 1.05 : isSelected ? 1.035 : isForced ? 1.03 : 1.0;

          nextVisuals.push(
            makePlayingCardVisual(
              card,
              'hand',
              idx,
              m,
              80 + idx + (isSelected ? 12 : 0) + (isForced ? 4 : 0),
              isSelected,
              state.phase === 'PLAYING' || state.phase === 'PACK_OPEN',
              faceAtlas,
              deckBack,
              false,
              isForced,
              isScoringPreview
            )
          );
        });

        // Deck Pile stack preview scaled smoothly with drawPile.length (1..4 cards)
        const maxDeck = Math.max(40, state.fullDeck.length);
        const stackCount =
          state.drawPile.length <= 0
            ? 0
            : Math.min(4, Math.max(1, Math.ceil((state.drawPile.length / maxDeck) * 4)));
        const stackStepX = g.compact ? 1.6 : 2.1;
        const stackStepY = g.compact ? 2.0 : 2.5;
        for (let s = 0; s < stackCount; s++) {
          const id = `deck_pile_${s}`;
          const dx = deckCenterX - (stackCount - 1 - s) * stackStepX;
          const dy = deckCenterY - s * stackStepY;
          const m = ensureMoveable(id, dx, dy, deckCardW, deckCardH);
          m.tx = dx;
          m.ty = dy;
          m.tw = deckCardW;
          m.th = deckCardH;
          m.tr = 0;
          m.tScale = 1;
          nextVisuals.push({
            id,
            kind: 'deck_pile',
            index: s,
            moveable: m,
            zIndex: 50 + s,
            selected: false,
            draggable: false,
            baseAtlas: 'centers',
            basePos: deckBack,
            stickers: [],
            edition: 'none',
            debuffed: false,
            faceDown: true,
          });
        }
      } else {
        this.handSlotLayout = { startX: 0, step: 0, count: 0 };
      }

      // --- 5. SHOP OFFERS, VOUCHERS, AND BOOSTERS ---
      if (state.phase === 'SHOP' && state.shop) {
        const activeOffers = state.shop.offers.filter((o) => !o.sold);
        const sCount = activeOffers.length;

        let sCardH: number;
        let sCardW: number;
        let sY: number;
        let vY: number;
        let bY: number;

        if (g.mode === 'desktop') {
          sCardH = Math.round(g.cardH * 0.96);
          sCardW = Math.round(g.cardW * 0.96);
          sY = g.shopOfferTray.y + sCardH * 0.5 + 20;
          vY = g.shopVoucherTray.y + sCardH * 0.5 + 10;
          bY = g.shopBoosterTray.y + sCardH * 0.5 + 10;
        } else {
          // Reserve crisp vertical space for top price tags & bottom BUY/REDEEM/OPEN buttons
          const reserveH = g.mode === 'mobile-landscape' ? 48 : 54;
          const topTagRoom = g.mode === 'mobile-landscape' ? 18 : 22;
          const scaleFactor = g.mode === 'mobile-landscape' ? 0.9 : 0.94;
          const maxRowCardH = Math.max(50, g.shopOfferTray.h - reserveH);
          sCardH = Math.min(Math.round(g.cardH * scaleFactor), maxRowCardH);
          sCardW = Math.round(sCardH * aspect);
          sY = g.shopOfferTray.y + topTagRoom + sCardH * 0.5;
          vY = g.shopVoucherTray.y + topTagRoom + sCardH * 0.5;
          bY = g.shopBoosterTray.y + topTagRoom + sCardH * 0.5;
        }

        const offerPad = g.compact ? 16 : 36;
        const offerGap = g.compact ? 14 : 30;
        const sStep =
          sCount > 1
            ? Math.min(sCardW + offerGap, Math.max(24, (g.shopOfferTray.w - sCardW - offerPad) / (sCount - 1)))
            : 0;
        const sSpan = sStep * Math.max(0, sCount - 1);
        const sStartX = g.shopOfferTray.x + g.shopOfferTray.w * 0.5 - sSpan * 0.5;

        activeOffers.forEach((offer, idx) => {
          const shape =
            offer.kind === 'joker'
              ? getJokerShapeDimensions(offer.key, sCardW, sCardH)
              : { tw: sCardW, th: sCardH, cardShape: undefined };
          const m = ensureMoveable(offer.id, sStartX + idx * sStep, sY + 24, shape.tw, shape.th);
          m.tx = sStartX + idx * sStep;
          m.ty = sY + (reducedMotion ? 0 : Math.sin(nowSec * 1.55 + idx * 1.1) * 2.0);
          m.tw = shape.tw;
          m.th = shape.th;
          m.tr = reducedMotion ? 0 : Math.sin(nowSec * 1.4 + idx) * 0.018;
          m.tScale = 1;

          const vis = makeOfferVisual(offer, 'shop_offer', idx, m, 70 + idx, faceAtlas, shape.cardShape);
          nextVisuals.push(vis);
        });

        // Vouchers (with shimmering voucher.fs overlay pass!)
        const activeVouchers = state.shop.vouchers.filter((v) => !v.redeemed);
        const vStep =
          activeVouchers.length > 1
            ? Math.min(
                sCardW + (g.compact ? 8 : 14),
                Math.max(22, (g.shopVoucherTray.w - sCardW - 12) / (activeVouchers.length - 1))
              )
            : 0;
        activeVouchers.forEach((vo, idx) => {
          const vDef = VOUCHER_MAP[vo.key];
          const vx =
            g.shopVoucherTray.x +
            g.shopVoucherTray.w * 0.5 +
            (idx - (activeVouchers.length - 1) * 0.5) * vStep;
          const m = ensureMoveable(vo.id, vx, vY + 24, sCardW, sCardH);
          m.tx = vx;
          m.ty = vY + (reducedMotion ? 0 : Math.sin(nowSec * 1.7 + idx * 1.3) * 2.2);
          m.tw = sCardW;
          m.th = sCardH;
          m.tr = reducedMotion ? 0 : Math.cos(nowSec * 1.3 + idx) * 0.022;
          m.tScale = 1;
          nextVisuals.push({
            id: vo.id,
            kind: 'shop_voucher',
            index: idx,
            moveable: m,
            zIndex: 72 + idx,
            selected: false,
            draggable: false,
            baseAtlas: 'Voucher',
            basePos: vDef?.pos ?? { x: 0, y: 0 },
            overlayEffect: 'voucher',
            stickers: [],
            edition: 'none',
            debuffed: false,
            faceDown: false,
            cost: vo.cost,
            voucherOfferData: vo,
          });
        });

        // Boosters (with glossy booster.fs foil sheen overlay pass!)
        const activeBoosters = state.shop.boosters.filter((b) => !b.opened);
        const boosterPad = g.compact ? 16 : 36;
        const boosterGap = g.compact ? 16 : 34;
        const bStep =
          activeBoosters.length > 1
            ? Math.min(
                sCardW + boosterGap,
                Math.max(24, (g.shopBoosterTray.w - sCardW - boosterPad) / (activeBoosters.length - 1))
              )
            : 0;
        const bSpan = bStep * Math.max(0, activeBoosters.length - 1);
        const bStartX = g.shopBoosterTray.x + g.shopBoosterTray.w * 0.5 - bSpan * 0.5;
        activeBoosters.forEach((bo, idx) => {
          const bDef = BOOSTER_MAP[bo.key];
          const m = ensureMoveable(bo.id, bStartX + idx * bStep, bY + 24, sCardW, sCardH);
          m.tx = bStartX + idx * bStep;
          m.ty = bY + (reducedMotion ? 0 : Math.sin(nowSec * 1.85 + idx * 1.6) * 2.4);
          m.tw = sCardW;
          m.th = sCardH;
          m.tr = reducedMotion ? 0 : Math.sin(nowSec * 1.7 + idx * 1.5) * 0.024;
          m.tScale = 1;
          nextVisuals.push({
            id: bo.id,
            kind: 'shop_booster',
            index: idx,
            moveable: m,
            zIndex: 75 + idx,
            selected: false,
            draggable: false,
            baseAtlas: 'Booster',
            basePos: bDef?.pos ?? { x: 0, y: 0 },
            overlayEffect: 'booster',
            stickers: [],
            edition: 'none',
            debuffed: false,
            faceDown: false,
            cost: bo.cost,
            boosterOfferData: bo,
          });
        });
      }

      // --- 6. BOOSTER PACK OPEN ARENA ---
      if (state.phase === 'PACK_OPEN' && state.pack) {
        const avail = state.pack.cards.filter((c) => !c.taken);
        const pCount = avail.length;

        let pCardH: number;
        let pCardW: number;
        let pY: number;

        if (g.mode === 'desktop') {
          if (state.pack.needsHand) {
            const topEdge = g.packTray.y + (g.viewportH < 640 ? 48 : 62);
            const bottomEdge = g.handTray.y - 36;
            const availH = Math.max(68, bottomEdge - topEdge);
            pCardH = Math.min(Math.round(g.cardH * (g.viewportH < 640 ? 0.96 : 1.02)), availH);
            pCardW = Math.round(pCardH * aspect);
            pY = topEdge + availH * 0.5;
          } else {
            pCardH = Math.round(g.cardH * 1.04);
            pCardW = Math.round(g.cardW * 1.04);
            pY = g.packTray.y + 62 + pCardH * 0.5;
          }
        } else if (g.mode === 'mobile-landscape') {
          if (state.pack.needsHand) {
            const topEdge = g.packTray.y + 36;
            const bottomEdge = g.handTray.y + handPackOffsetY - 30;
            const availH = Math.max(54, bottomEdge - topEdge);
            pCardH = Math.min(Math.round(g.cardH * 0.94), availH);
            pCardW = Math.round(pCardH * aspect);
            pY = topEdge + availH * 0.5;
          } else {
            const topEdge = g.packTray.y + 38;
            const bottomEdge = g.viewportH - g.safeInsets.bottom - 38;
            const availH = Math.max(70, bottomEdge - topEdge);
            pCardH = Math.min(Math.round(g.cardH * 1.1), availH);
            pCardW = Math.round(pCardH * aspect);
            pY = topEdge + availH * 0.5;
          }
        } else {
          // mobile-portrait
          if (state.pack.needsHand) {
            const topEdge = g.packTray.y + 38;
            const bottomEdge = g.handTray.y - 38;
            const availH = Math.max(66, bottomEdge - topEdge);
            pCardH = Math.min(Math.round(g.cardH * 1.0), availH);
            pCardW = Math.round(pCardH * aspect);
            pY = topEdge + availH * 0.5;
          } else {
            const topEdge = g.packTray.y + 44;
            const bottomEdge = g.viewportH - g.safeInsets.bottom - 50;
            const availH = Math.max(88, bottomEdge - topEdge);
            pCardH = Math.min(Math.round(g.cardH * 1.14), 160, availH);
            pCardW = Math.round(pCardH * aspect);
            pY = topEdge + availH * 0.46;
          }
        }

        const pPad = g.compact ? 16 : 40;
        const pGap = g.compact ? 12 : 24;
        const pStep =
          pCount > 1
            ? Math.min(pCardW + pGap, Math.max(24, (g.packTray.w - pCardW - pPad) / (pCount - 1)))
            : 0;
        const pSpan = pStep * Math.max(0, pCount - 1);
        const pStartX = g.packTray.x + g.packTray.w * 0.5 - pSpan * 0.5;

        avail.forEach((pc, idx) => {
          const shape =
            pc.kind === 'joker'
              ? getJokerShapeDimensions(pc.key, pCardW, pCardH)
              : { tw: pCardW, th: pCardH, cardShape: undefined };
          const m = ensureMoveable(
            pc.id,
            g.packTray.x + g.packTray.w * 0.5,
            pY - 36,
            shape.tw,
            shape.th,
            true,
            idx * 0.03
          );
          m.tx = pStartX + idx * pStep;
          m.ty = pY + (reducedMotion ? 0 : Math.sin(nowSec * 2 + idx) * 3);
          m.tw = shape.tw;
          m.th = shape.th;
          m.tr = (idx - (pCount - 1) * 0.5) * (g.compact ? 0.028 : 0.038);
          m.tScale = 1;
          const vis = makePackCardVisual(pc, idx, m, 95 + idx, faceAtlas, deckBack, shape.cardShape);
          nextVisuals.push(vis);
        });
      }
    }

    // Override target position for actively dragged card
    if (this.draggingId) {
      const dragged = nextVisuals.find((v) => v.id === this.draggingId);
      if (dragged) {
        dragged.moveable.tx = this.dragPointerX + this.dragOffsetX;
        dragged.moveable.ty = this.dragPointerY + this.dragOffsetY;
        dragged.moveable.dragging = true;
        dragged.zIndex = 200;
      } else {
        this.draggingId = null;
        this.dragKind = null;
        this.dragPreviewIndex = null;
      }
    }

    // Step every spring
    for (const vc of nextVisuals) {
      vc.moveable.step(dt, nowSec, reducedMotion, g.pixelScale);
      vc.flipScaleX = vc.moveable.getFlipScaleX();
    }

    // Prune stale moveables
    for (const key of this.moveables.keys()) {
      if (!seenIds.has(key)) this.moveables.delete(key);
    }

    // Sort by zIndex for painter's order rendering & reverse hit-testing
    nextVisuals.sort((a, b) => a.zIndex - b.zIndex);
    this.visualCards = nextVisuals;
  }
}

function makePlayingCardVisual(
  card: CardInstance,
  kind: 'hand' | 'play',
  index: number,
  moveable: Moveable,
  zIndex: number,
  selected: boolean,
  draggable: boolean,
  faceAtlas: AtlasKey,
  deckBack: AtlasPos,
  nonScoring: boolean,
  forced = false,
  scoringPreview = false
): VisualCard {
  const displayFaceDown = moveable.getDisplayFaceDown(card.faceDown);
  const isStone = card.enhancement === 'm_stone';
  return {
    id: card.id,
    kind,
    index,
    moveable,
    zIndex,
    selected,
    draggable,
    baseAtlas: 'centers',
    basePos: displayFaceDown ? deckBack : (ENHANCEMENT_POS[card.enhancement] ?? { x: 1, y: 0 }),
    faceAtlas: displayFaceDown || isStone ? undefined : faceAtlas,
    facePos: displayFaceDown || isStone ? undefined : getCardFacePos(card.suit, card.rank),
    sealPos: !displayFaceDown && card.seal !== 'none' ? SEAL_POS[card.seal] : undefined,
    stickers: [],
    edition: displayFaceDown ? 'none' : card.edition,
    enhancement: card.enhancement,
    seal: card.seal,
    debuffed: card.debuffed,
    faceDown: displayFaceDown,
    forced,
    scoringPreview,
    nonScoring,
    flipScaleX: moveable.getFlipScaleX(),
    cardData: card,
  };
}

function makeOfferVisual(
  offer: ShopOffer,
  kind: 'shop_offer',
  index: number,
  moveable: Moveable,
  zIndex: number,
  faceAtlas: AtlasKey,
  cardShape?: CardShapeKind
): VisualCard {
  const stickers: AtlasPos[] = [];
  if (offer.eternal) stickers.push({ x: 0, y: 0 });
  if (offer.perishable) stickers.push({ x: 0, y: 2 });
  if (offer.rental) stickers.push({ x: 1, y: 2 });

  if (offer.kind === 'joker') {
    const def = JOKER_MAP[offer.key];
    return {
      id: offer.id,
      kind,
      index,
      moveable,
      zIndex,
      selected: false,
      draggable: false,
      baseAtlas: 'Joker',
      basePos: def?.pos ?? { x: 0, y: 0 },
      ...getJokerSoulFields(offer.key, false),
      cardShape,
      stickers,
      edition: offer.edition,
      debuffed: false,
      faceDown: false,
      cost: offer.cost,
      shopOfferData: offer,
    };
  }
  if (offer.kind === 'playing_card') {
    const enh = offer.enhancement ?? 'none';
    const isStone = enh === 'm_stone';
    return {
      id: offer.id,
      kind,
      index,
      moveable,
      zIndex,
      selected: false,
      draggable: false,
      baseAtlas: 'centers',
      basePos: ENHANCEMENT_POS[enh] ?? { x: 1, y: 0 },
      faceAtlas: isStone ? undefined : faceAtlas,
      facePos: isStone ? undefined : getCardFacePos(offer.suit ?? 'Spades', offer.rank ?? 'Ace'),
      sealPos: offer.seal && offer.seal !== 'none' ? SEAL_POS[offer.seal] : undefined,
      stickers,
      edition: offer.edition,
      enhancement: enh,
      seal: offer.seal,
      debuffed: false,
      faceDown: false,
      cost: offer.cost,
      shopOfferData: offer,
    };
  }
  const cDef = CONSUMABLE_MAP[offer.key];
  return {
    id: offer.id,
    kind,
    index,
    moveable,
    zIndex,
    selected: false,
    draggable: false,
    baseAtlas: 'Tarot',
    basePos: cDef?.pos ?? { x: 0, y: 0 },
    ...getConsumableSpecialFields(offer.key),
    stickers,
    edition: offer.edition,
    debuffed: false,
    faceDown: false,
    cost: offer.cost,
    shopOfferData: offer,
  };
}

function makePackCardVisual(
  pc: PackCardOffer,
  index: number,
  moveable: Moveable,
  zIndex: number,
  faceAtlas: AtlasKey,
  deckBack: AtlasPos,
  cardShape?: CardShapeKind
): VisualCard {
  const displayFaceDown = moveable.getDisplayFaceDown(false);
  if (displayFaceDown) {
    return {
      id: pc.id,
      kind: 'pack_card',
      index,
      moveable,
      zIndex,
      selected: false,
      draggable: false,
      baseAtlas: 'centers',
      basePos: deckBack,
      stickers: [],
      edition: 'none',
      debuffed: false,
      faceDown: true,
      flipScaleX: moveable.getFlipScaleX(),
      packCardData: pc,
    };
  }

  const stickers: AtlasPos[] = [];
  if (pc.eternal) stickers.push({ x: 0, y: 0 });
  if (pc.perishable) stickers.push({ x: 0, y: 2 });
  if (pc.rental) stickers.push({ x: 1, y: 2 });

  if (pc.kind === 'joker') {
    const def = JOKER_MAP[pc.key];
    return {
      id: pc.id,
      kind: 'pack_card',
      index,
      moveable,
      zIndex,
      selected: false,
      draggable: false,
      baseAtlas: 'Joker',
      basePos: def?.pos ?? { x: 0, y: 0 },
      ...getJokerSoulFields(pc.key, false),
      cardShape,
      flipScaleX: moveable.getFlipScaleX(),
      stickers,
      edition: pc.edition,
      debuffed: false,
      faceDown: false,
      packCardData: pc,
    };
  }
  if (pc.kind === 'playing_card') {
    const enh = pc.enhancement ?? 'none';
    const isStone = enh === 'm_stone';
    return {
      id: pc.id,
      kind: 'pack_card',
      index,
      moveable,
      zIndex,
      selected: false,
      draggable: false,
      baseAtlas: 'centers',
      basePos: ENHANCEMENT_POS[enh] ?? { x: 1, y: 0 },
      faceAtlas: isStone ? undefined : faceAtlas,
      facePos: isStone ? undefined : getCardFacePos(pc.suit ?? 'Hearts', pc.rank ?? 'Ace'),
      sealPos: pc.seal && pc.seal !== 'none' ? SEAL_POS[pc.seal] : undefined,
      flipScaleX: moveable.getFlipScaleX(),
      stickers,
      edition: pc.edition,
      enhancement: enh,
      seal: pc.seal,
      debuffed: false,
      faceDown: false,
      packCardData: pc,
    };
  }
  const cDef = CONSUMABLE_MAP[pc.key];
  return {
    id: pc.id,
    kind: 'pack_card',
    index,
    moveable,
    zIndex,
    selected: false,
    draggable: false,
    baseAtlas: 'Tarot',
    basePos: cDef?.pos ?? { x: 0, y: 0 },
    ...getConsumableSpecialFields(pc.key),
    flipScaleX: moveable.getFlipScaleX(),
    stickers,
    edition: pc.edition,
    debuffed: false,
    faceDown: false,
    packCardData: pc,
  };
}
