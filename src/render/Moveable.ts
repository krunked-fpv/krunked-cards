// ============================================================================
// Krunked Cards — Exact Exponential Spring Physics & Interactive Card Layout
// Implements spec-exact Moveable springs (exp_xy, exp_scale, exp_r, juiceUp)
// and computes responsive screen-space card trays across 1280x720 -> 1920x1080.
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

export interface JuiceState {
  scale: number;
  scaleAmt: number;
  r: number;
  rAmt: number;
  startTime: number;
  endTime: number;
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

  // Hover & drag visual states
  hovered = false;
  dragging = false;
  tiltX = 0;
  tiltY = 0;
  dissolve = 0;
  juice: JuiceState | null = null;
  initialized = false;

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

  juiceUp(amount = 0.4, rotAmt?: number, nowSec = performance.now() / 1000): void {
    const a = Math.min(0.65, Math.max(0.1, amount));
    const rAmt = rotAmt ?? (Math.random() > 0.5 ? 1 : -1) * (0.28 + Math.random() * 0.16);
    this.vScale = Math.max(0.55, 1 - 0.6 * a);
    this.juice = {
      scale: 0,
      scaleAmt: a,
      r: 0,
      rAmt,
      startTime: nowSec,
      endTime: nowSec + 0.4,
    };
  }

  step(dt: number, nowSec: number, reducedMotion: boolean, pixelScale: number): void {
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
      this.tiltX *= 0.85;
      this.tiltY *= 0.85;
      this.juice = null;
      return;
    }

    // Update harmonic juice wave
    let juiceScale = 0;
    let juiceR = 0;
    if (this.juice) {
      const elapsed = nowSec - this.juice.startTime;
      if (elapsed >= 0.4) {
        this.juice = null;
      } else {
        const remain = Math.max(0, 1 - elapsed / 0.4);
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

    // Scale spring: +0.10 dragging, +0.05 hovering, +juice.scale
    const desScale =
      this.tScale + (this.dragging ? 0.1 : this.hovered ? 0.05 : 0) + juiceScale;
    this.velScale = expScale * this.velScale + (1 - expScale) * (desScale - this.vScale) * 24 * safeDt;
    this.vScale += this.velScale;

    // Rotation spring with horizontal velocity lean (`des_r = base_r + 0.015 * (vel.x/dt) + juice.r * 2`)
    const velXUnitsPerSec = this.velX / (safeDt * pxPerUnit);
    const desR = this.tr + Math.max(-0.42, Math.min(0.42, 0.015 * velXUnitsPerSec)) + juiceR * 2.0;
    this.velR = expR * this.velR + (1 - expR) * (desR - this.vr) * 28 * safeDt;
    this.vr += this.velR;

    // Smooth tilt decay when not hovered
    if (!this.hovered) {
      const tk = Math.exp(-12 * safeDt);
      this.tiltX *= tk;
      this.tiltY *= tk;
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

  edition: EditionId;
  enhancement?: EnhancementId;
  seal?: SealId;
  debuffed: boolean;
  faceDown: boolean;
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

export interface TableGeometry {
  viewportW: number;
  viewportH: number;
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
// Helpers mapping cards/items to exact Atlas Coordinates
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

// ---------------------------------------------------------------------------
// Responsive Table Layout Calculator (1280x720 through 1920x1080+)
// ---------------------------------------------------------------------------

export function computeTableGeometry(viewportW: number, viewportH: number): TableGeometry {
  const w = Math.max(960, viewportW);
  const h = Math.max(540, viewportH);

  const railW = Math.round(Math.min(315, Math.max(246, w * 0.225)));
  const leftRail: RectPx = { x: 12, y: 12, w: railW, h: h - 24 };

  const tableX = leftRail.x + leftRail.w + 18;
  const tableW = w - tableX - 18;
  const table: RectPx = { x: tableX, y: 12, w: tableW, h: h - 24 };

  // Card sizing respects exact 71:95 aspect ratio from LAYOUT
  const aspect = LAYOUT.CARD_W / LAYOUT.CARD_H; // ~0.7447
  const cardH = Math.round(Math.min(168, Math.max(118, h * 0.205)));
  const cardW = Math.round(cardH * aspect);
  const highlightLift = Math.round(cardH * 0.2);

  // Top row: Jokers (left ~66%) & Consumables (right ~32%)
  const topRowH = Math.round(cardH + 22);
  const gap = 14;
  const jokerW = Math.round((tableW - gap) * 0.67);
  const consW = tableW - gap - jokerW;

  const jokerTray: RectPx = { x: tableX, y: 14, w: jokerW, h: topRowH };
  const consumableTray: RectPx = { x: tableX + jokerW + gap, y: 14, w: consW, h: topRowH };

  // Bottom row: Hand tray + Deck stack on right, leaving 58px at very bottom for action bar
  const actionBarH = 62;
  const handTrayH = Math.round(cardH + highlightLift + 16);
  const deckW = Math.round(cardW + 22);
  const handTrayY = h - actionBarH - handTrayH - 8;

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

  // Middle arena: Play Area (between top row and hand tray)
  const midY = jokerTray.y + jokerTray.h + 12;
  const midH = Math.max(cardH + 16, handTray.y - midY - 10);
  const playArea: RectPx = { x: tableX, y: midY, w: tableW, h: midH };

  // Shop trays (inside Shop container area below top row)
  const shopTopY = jokerTray.y + jokerTray.h + 24;
  const shopControlsW = Math.round(Math.min(200, Math.max(152, tableW * 0.22)));
  const shopRightX = tableX + shopControlsW + 16;
  const shopRightW = tableW - shopControlsW - 16;
  const shopCardRowH = Math.round(cardH + 54);

  const shopOfferTray: RectPx = {
    x: shopRightX,
    y: shopTopY,
    w: shopRightW,
    h: shopCardRowH,
  };
  const shopBottomY = shopOfferTray.y + shopOfferTray.h + 16;
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
  const packTray: RectPx = {
    x: tableX + 20,
    y: midY + 18,
    w: tableW - 40,
    h: Math.max(cardH + 40, midH - 24),
  };

  return {
    viewportW: w,
    viewportH: h,
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

// ---------------------------------------------------------------------------
// Scene State Manager: maintains persistent Moveables across frames
// ---------------------------------------------------------------------------

export class CardSceneManager {
  private moveables = new Map<string, Moveable>();
  private visualCards: VisualCard[] = [];
  private geometry: TableGeometry = computeTableGeometry(1280, 720);
  private draggingId: string | null = null;
  private dragPointerX = 0;
  private dragPointerY = 0;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private hoveredId: string | null = null;

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

  startDrag(id: string, pointerX: number, pointerY: number): void {
    const card = this.visualCards.find((c) => c.id === id);
    if (!card || !card.draggable) return;
    this.draggingId = id;
    this.dragPointerX = pointerX;
    this.dragPointerY = pointerY;
    this.dragOffsetX = card.moveable.vx - pointerX;
    this.dragOffsetY = card.moveable.vy - pointerY;
    card.moveable.dragging = true;
  }

  updateDrag(pointerX: number, pointerY: number): void {
    this.dragPointerX = pointerX;
    this.dragPointerY = pointerY;
  }

  endDrag(): { kind: VisualEntityKind; fromIndex: number; toIndex: number } | null {
    if (!this.draggingId) return null;
    const card = this.visualCards.find((c) => c.id === this.draggingId);
    const prevId = this.draggingId;
    this.draggingId = null;

    const m = this.moveables.get(prevId);
    if (m) m.dragging = false;
    if (!card) return null;

    if (card.kind === 'hand' || card.kind === 'joker') {
      const siblings = this.visualCards
        .filter((c) => c.kind === card.kind)
        .sort((a, b) => a.index - b.index);
      const dropX = this.dragPointerX + this.dragOffsetX;
      let targetIdx = siblings.length - 1;
      for (let i = 0; i < siblings.length; i++) {
        if (dropX < siblings[i]!.moveable.tx) {
          targetIdx = i;
          break;
        }
      }
      if (targetIdx !== card.index) {
        return { kind: card.kind, fromIndex: card.index, toIndex: targetIdx };
      }
    }
    return null;
  }

  updateHover(pointerX: number, pointerY: number): VisualCard | null {
    let hit: VisualCard | null = null;
    // Reverse Z-order hit test (front-most card wins)
    for (let i = this.visualCards.length - 1; i >= 0; i--) {
      const vc = this.visualCards[i]!;
      const m = vc.moveable;
      const hw = (m.vw * m.vScale) * 0.5;
      const hh = (m.vh * m.vScale) * 0.5;
      if (
        pointerX >= m.vx - hw &&
        pointerX <= m.vx + hw &&
        pointerY >= m.vy - hh &&
        pointerY <= m.vy + hh
      ) {
        hit = vc;
        break;
      }
    }

    this.hoveredId = hit ? hit.id : null;
    for (const vc of this.visualCards) {
      const m = vc.moveable;
      const isHit = vc === hit;
      m.hovered = isHit;
      if (isHit) {
        const hw = Math.max(1, m.vw * 0.5);
        const hh = Math.max(1, m.vh * 0.5);
        m.tiltX = Math.max(-1, Math.min(1, (pointerX - m.vx) / hw));
        m.tiltY = Math.max(-1, Math.min(1, (pointerY - m.vy) / hh));
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
    nowSec: number
  ): void {
    this.geometry = computeTableGeometry(viewportW, viewportH);
    const g = this.geometry;
    const faceAtlas: AtlasKey = highContrast ? 'cards_2' : 'cards_1';
    const deckBack = getDeckBackPos(state.deckId);

    const cardById = new Map<string, CardInstance>();
    for (const c of state.fullDeck) cardById.set(c.id, c);

    const nextVisuals: VisualCard[] = [];
    const seenIds = new Set<string>();

    const ensureMoveable = (id: string, spawnX: number, spawnY: number, w: number, h: number): Moveable => {
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
        this.moveables.set(id, m);
      }
      return m;
    };

    // --- TITLE PHASE: Fanned Showcase Cards behind the Krunked Cards Logo ---
    if (state.phase === 'TITLE') {
      const showcaseW = Math.round(g.cardW * 1.18);
      const showcaseH = Math.round(g.cardH * 1.18);
      const cx = g.viewportW * 0.5;
      const cy = g.viewportH * 0.41;
      const items: Array<{
        id: string;
        baseAtlas: AtlasKey;
        basePos: AtlasPos;
        faceAtlas?: AtlasKey;
        facePos?: AtlasPos;
        edition: EditionId;
      }> = [
        { id: 'title_c0', baseAtlas: 'centers', basePos: { x: 1, y: 0 }, faceAtlas, facePos: getCardFacePos('Spades', 'Ace'), edition: 'e_foil' },
        { id: 'title_c1', baseAtlas: 'Joker', basePos: { x: 0, y: 3 }, edition: 'e_holo' },
        { id: 'title_c2', baseAtlas: 'Joker', basePos: { x: 0, y: 0 }, edition: 'e_polychrome' },
        { id: 'title_c3', baseAtlas: 'Joker', basePos: { x: 6, y: 12 }, edition: 'e_negative' },
        { id: 'title_c4', baseAtlas: 'centers', basePos: { x: 6, y: 0 }, faceAtlas, facePos: getCardFacePos('Hearts', 'King'), edition: 'none' },
      ];
      items.forEach((it, i) => {
        const offset = i - 2;
        const bob = reducedMotion ? 0 : Math.sin(nowSec * 1.7 + i * 1.1) * 7;
        const m = ensureMoveable(it.id, cx + offset * (showcaseW * 0.88), cy, showcaseW, showcaseH);
        m.tx = cx + offset * (showcaseW * 0.92);
        m.ty = cy + Math.abs(offset) * 14 + bob;
        m.tw = showcaseW;
        m.th = showcaseH;
        m.tr = offset * 0.085 + (reducedMotion ? 0 : Math.sin(nowSec * 1.1 + i) * 0.02);
        m.tScale = i === 2 ? 1.08 : 0.96;
        nextVisuals.push({
          id: it.id,
          kind: 'title_showcase',
          index: i,
          moveable: m,
          zIndex: i === 2 ? 20 : 10 + i,
          selected: false,
          draggable: false,
          baseAtlas: it.baseAtlas,
          basePos: it.basePos,
          faceAtlas: it.faceAtlas,
          facePos: it.facePos,
          stickers: [],
          edition: it.edition,
          debuffed: false,
          faceDown: false,
        });
      });
    } else {
      // --- 1. JOKER TRAY (Always visible during run) ---
      const jCount = state.jokers.length;
      const jCardH = Math.round(g.cardH * 0.94);
      const jCardW = Math.round(g.cardW * 0.94);
      const jPad = 14;
      const jAvailW = Math.max(jCardW, g.jokerTray.w - jPad * 2 - jCardW);
      const jStep = jCount > 1 ? Math.min(jCardW + 10, jAvailW / (jCount - 1)) : 0;
      const jSpan = jStep * Math.max(0, jCount - 1);
      const jStartX = g.jokerTray.x + g.jokerTray.w * 0.5 - jSpan * 0.5;
      const jCenterY = g.jokerTray.y + g.jokerTray.h * 0.5 - 3;

      state.jokers.forEach((joker, idx) => {
        const def = JOKER_MAP[joker.key];
        const m = ensureMoveable(joker.id, jStartX + idx * jStep, jCenterY, jCardW, jCardH);
        m.tx = jStartX + idx * jStep;
        m.ty = jCenterY + (reducedMotion ? 0 : Math.sin(nowSec * 1.6 + idx * 0.9) * 1.5);
        m.tw = jCardW;
        m.th = jCardH;
        m.tr = reducedMotion ? 0 : Math.sin(nowSec * 1.1 + idx * 1.4) * 0.014;
        m.tScale = 1;

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
          baseAtlas: joker.faceDown ? 'centers' : 'Joker',
          basePos: joker.faceDown ? deckBack : (def?.pos ?? { x: 0, y: 0 }),
          stickers,
          edition: joker.edition,
          debuffed: joker.debuffed,
          faceDown: joker.faceDown,
          jokerData: joker,
        });
      });

      // --- 2. CONSUMABLE TRAY (Always visible during run) ---
      const cCount = state.consumables.length;
      const cCardH = Math.round(g.cardH * 0.94);
      const cCardW = Math.round(g.cardW * 0.94);
      const cAvailW = Math.max(cCardW, g.consumableTray.w - 28 - cCardW);
      const cStep = cCount > 1 ? Math.min(cCardW + 10, cAvailW / (cCount - 1)) : 0;
      const cSpan = cStep * Math.max(0, cCount - 1);
      const cStartX = g.consumableTray.x + g.consumableTray.w * 0.5 - cSpan * 0.5;
      const cCenterY = g.consumableTray.y + g.consumableTray.h * 0.5 - 3;

      state.consumables.forEach((cons, idx) => {
        const def = CONSUMABLE_MAP[cons.key];
        const m = ensureMoveable(cons.id, cStartX + idx * cStep, cCenterY, cCardW, cCardH);
        m.tx = cStartX + idx * cStep;
        m.ty = cCenterY + (reducedMotion ? 0 : Math.sin(nowSec * 1.9 + idx * 1.2) * 2);
        m.tw = cCardW;
        m.th = cCardH;
        m.tr = reducedMotion ? 0 : Math.cos(nowSec * 1.2 + idx) * 0.018;
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
        const pStep = pCount > 1 ? Math.min(g.cardW + 16, (g.playArea.w - g.cardW - 40) / (pCount - 1)) : 0;
        const pSpan = pStep * Math.max(0, pCount - 1);
        const pStartX = g.playArea.x + g.playArea.w * 0.5 - pSpan * 0.5;
        const pCenterY = g.playArea.y + g.playArea.h * 0.5;

        state.playArea.forEach((cid, idx) => {
          const card = cardById.get(cid);
          if (!card) return;
          const m = ensureMoveable(card.id, pStartX + idx * pStep, pCenterY + 60, g.cardW, g.cardH);
          m.tx = pStartX + idx * pStep;
          m.ty = pCenterY;
          m.tw = g.cardW;
          m.th = g.cardH;
          m.tr = 0;
          m.tScale = 1.04;
          nextVisuals.push(makePlayingCardVisual(card, 'play', idx, m, 60 + idx, false, false, faceAtlas, deckBack));
        });
      }

      // --- 4. PLAYER HAND TRAY + DECK PILE (PLAYING / SCORING / PACK_OPEN with needsHand) ---
      const showHand =
        state.phase === 'PLAYING' ||
        state.phase === 'SCORING' ||
        (state.phase === 'PACK_OPEN' && Boolean(state.pack?.needsHand));

      if (showHand) {
        const hCount = state.hand.length;
        const hAvailW = Math.max(g.cardW, g.handTray.w - g.cardW - 36);
        const hStep = hCount > 1 ? Math.min(g.cardW + 8, hAvailW / (hCount - 1)) : 0;
        const hSpan = hStep * Math.max(0, hCount - 1);
        const hStartX = g.handTray.x + g.handTray.w * 0.5 - hSpan * 0.5;
        const hBaseY = g.handTray.y + g.handTray.h * 0.5 + g.highlightLift * 0.4;
        const midIdx = (hCount - 1) * 0.5;

        state.hand.forEach((cid, idx) => {
          const card = cardById.get(cid);
          if (!card) return;
          const isSelected = state.selectedCardIds.includes(cid);
          const normOff = hCount > 1 ? (idx - midIdx) / Math.max(1, midIdx) : 0;
          const arcY = normOff * normOff * 12;
          const arcRot = normOff * 0.06;

          // Newly drawn cards fly smoothly out of the Deck Pile!
          const spawnX = g.deckPile.x + g.deckPile.w * 0.5;
          const spawnY = g.deckPile.y + g.deckPile.h * 0.5;
          const m = ensureMoveable(card.id, spawnX, spawnY, g.cardW, g.cardH);
          m.tx = hStartX + idx * hStep;
          m.ty = hBaseY + arcY - (isSelected ? g.highlightLift : 0);
          m.tw = g.cardW;
          m.th = g.cardH;
          m.tr = arcRot;
          m.tScale = isSelected ? 1.03 : 1.0;

          nextVisuals.push(
            makePlayingCardVisual(
              card,
              'hand',
              idx,
              m,
              80 + idx + (isSelected ? 12 : 0),
              isSelected,
              state.phase === 'PLAYING' || state.phase === 'PACK_OPEN',
              faceAtlas,
              deckBack
            )
          );
        });

        // Deck Pile stack preview (up to 3 stacked backs)
        const stackCount = state.drawPile.length > 0 ? Math.min(3, Math.ceil(state.drawPile.length / 18)) : 0;
        for (let s = 0; s < stackCount; s++) {
          const id = `deck_pile_${s}`;
          const dx = g.deckPile.x + g.deckPile.w * 0.5 - (stackCount - 1 - s) * 2.5;
          const dy = g.deckPile.y + g.deckPile.h * 0.5 - s * 3;
          const m = ensureMoveable(id, dx, dy, g.cardW, g.cardH);
          m.tx = dx;
          m.ty = dy;
          m.tw = g.cardW;
          m.th = g.cardH;
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
      }

      // --- 5. SHOP OFFERS, VOUCHERS, AND BOOSTERS ---
      if (state.phase === 'SHOP' && state.shop) {
        const activeOffers = state.shop.offers.filter((o) => !o.sold);
        const sCount = activeOffers.length;
        const sCardH = Math.round(g.cardH * 0.96);
        const sCardW = Math.round(g.cardW * 0.96);
        const sStep = sCount > 1 ? Math.min(sCardW + 30, (g.shopOfferTray.w - sCardW - 36) / (sCount - 1)) : 0;
        const sSpan = sStep * Math.max(0, sCount - 1);
        const sStartX = g.shopOfferTray.x + g.shopOfferTray.w * 0.5 - sSpan * 0.5;
        const sY = g.shopOfferTray.y + sCardH * 0.5 + 10;

        activeOffers.forEach((offer, idx) => {
          const m = ensureMoveable(offer.id, sStartX + idx * sStep, sY + 24, sCardW, sCardH);
          m.tx = sStartX + idx * sStep;
          m.ty = sY;
          m.tw = sCardW;
          m.th = sCardH;
          m.tr = reducedMotion ? 0 : Math.sin(nowSec * 1.4 + idx) * 0.015;
          m.tScale = 1;

          const vis = makeOfferVisual(offer, 'shop_offer', idx, m, 70 + idx, faceAtlas);
          nextVisuals.push(vis);
        });

        // Vouchers
        const activeVouchers = state.shop.vouchers.filter((v) => !v.redeemed);
        activeVouchers.forEach((vo, idx) => {
          const vDef = VOUCHER_MAP[vo.key];
          const vx =
            g.shopVoucherTray.x +
            g.shopVoucherTray.w * 0.5 +
            (idx - (activeVouchers.length - 1) * 0.5) * (sCardW + 14);
          const vy = g.shopVoucherTray.y + sCardH * 0.5 + 10;
          const m = ensureMoveable(vo.id, vx, vy + 24, sCardW, sCardH);
          m.tx = vx;
          m.ty = vy;
          m.tw = sCardW;
          m.th = sCardH;
          m.tr = reducedMotion ? 0 : Math.cos(nowSec * 1.3 + idx) * 0.018;
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
            stickers: [],
            edition: 'none',
            debuffed: false,
            faceDown: false,
            cost: vo.cost,
            voucherOfferData: vo,
          });
        });

        // Boosters
        const activeBoosters = state.shop.boosters.filter((b) => !b.opened);
        const bStep = activeBoosters.length > 1 ? Math.min(sCardW + 34, (g.shopBoosterTray.w - sCardW - 36) / (activeBoosters.length - 1)) : 0;
        const bSpan = bStep * Math.max(0, activeBoosters.length - 1);
        const bStartX = g.shopBoosterTray.x + g.shopBoosterTray.w * 0.5 - bSpan * 0.5;
        const bY = g.shopBoosterTray.y + sCardH * 0.5 + 10;
        activeBoosters.forEach((bo, idx) => {
          const bDef = BOOSTER_MAP[bo.key];
          const m = ensureMoveable(bo.id, bStartX + idx * bStep, bY + 24, sCardW, sCardH);
          m.tx = bStartX + idx * bStep;
          m.ty = bY;
          m.tw = sCardW;
          m.th = sCardH;
          m.tr = reducedMotion ? 0 : Math.sin(nowSec * 1.7 + idx * 1.5) * 0.022;
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
        const pCardH = Math.round(g.cardH * 1.04);
        const pCardW = Math.round(g.cardW * 1.04);
        const pStep = pCount > 1 ? Math.min(pCardW + 24, (g.packTray.w - pCardW - 40) / (pCount - 1)) : 0;
        const pSpan = pStep * Math.max(0, pCount - 1);
        const pStartX = g.packTray.x + g.packTray.w * 0.5 - pSpan * 0.5;
        const pY = g.packTray.y + g.packTray.h * 0.48;

        avail.forEach((pc, idx) => {
          const m = ensureMoveable(pc.id, pStartX + idx * pStep, pY - 30, pCardW, pCardH);
          m.tx = pStartX + idx * pStep;
          m.ty = pY + (reducedMotion ? 0 : Math.sin(nowSec * 2 + idx) * 3);
          m.tw = pCardW;
          m.th = pCardH;
          m.tr = (idx - (pCount - 1) * 0.5) * 0.035;
          m.tScale = 1;
          const vis = makePackCardVisual(pc, idx, m, 95 + idx, faceAtlas);
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
      }
    }

    // Step every spring
    for (const vc of nextVisuals) {
      vc.moveable.step(dt, nowSec, reducedMotion, g.pixelScale);
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
  deckBack: AtlasPos
): VisualCard {
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
    basePos: card.faceDown ? deckBack : (ENHANCEMENT_POS[card.enhancement] ?? { x: 1, y: 0 }),
    faceAtlas: card.faceDown || isStone ? undefined : faceAtlas,
    facePos: card.faceDown || isStone ? undefined : getCardFacePos(card.suit, card.rank),
    sealPos: !card.faceDown && card.seal !== 'none' ? SEAL_POS[card.seal] : undefined,
    stickers: [],
    edition: card.faceDown ? 'none' : card.edition,
    enhancement: card.enhancement,
    seal: card.seal,
    debuffed: card.debuffed,
    faceDown: card.faceDown,
    cardData: card,
  };
}

function makeOfferVisual(
  offer: ShopOffer,
  kind: 'shop_offer',
  index: number,
  moveable: Moveable,
  zIndex: number,
  faceAtlas: AtlasKey
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
  faceAtlas: AtlasKey
): VisualCard {
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
    stickers,
    edition: pc.edition,
    debuffed: false,
    faceDown: false,
    packCardData: pc,
  };
}
