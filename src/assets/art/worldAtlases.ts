// ============================================================================
// Krunked Cards — Clean-Room Built-In World Pixel-Art Atlases (14 Non-Joker)
// Builds crisp, high-density, Bayer-dithered pixel art for:
//   cards_1, cards_2, centers, Tarot, Voucher, Booster, BlindChips,
//   tags, stickers, chips, shop_sign, ui_1, ui_2, icons.
// 100% Node-safe at module top-level (DOM canvases created only inside builders).
// ============================================================================

import {
  ATLAS_SPECS,
  RANKS,
  type AtlasKey,
  type Rank,
  type Suit,
} from '../../contracts/index.ts';
import {
  CARD_H,
  CARD_W,
  COL_INK,
  COL_WHITE,
  PixelSurface,
  ditherRamp,
  drawCleanWhiteCard,
  drawEmbossedWaxSeal,
  drawOrnateFiligreeBack,
  fbm2D,
  hash2i,
  hex,
  mixRgba,
  shadeRgba,
  swirlMarble,
  type RGBA,
} from './pixelPrimitives.ts';

// ---------------------------------------------------------------------------
// 1. Playing Cards Atlases (`cards_1`, `cards_2`, 13x4 @ 71x95)
// Transparent background (rendered over `centers` card front or enhancement).
// Crisp indices (top-left + 180-deg inverted bottom-right), sculpted pips,
// oversized Ace centerpieces, and ornate symmetrical royal court cards!
// ---------------------------------------------------------------------------

const CARD_ROW_SUITS: readonly Suit[] = ['Hearts', 'Clubs', 'Diamonds', 'Spades'];

const SUIT_COLORS_DEFAULT: Record<Suit, RGBA> = {
  Hearts: hex('#fe5f55'),
  Diamonds: hex('#f06a40'),
  Spades: hex('#374259'),
  Clubs: hex('#265c4d'),
};

const SUIT_COLORS_HC: Record<Suit, RGBA> = {
  Hearts: hex('#f83b2f'),
  Diamonds: hex('#e29000'),
  Spades: hex('#4f31b9'),
  Clubs: hex('#008ee6'),
};

interface PipCoord {
  x: number;
  y: number;
  inv?: boolean;
}

const PIP_LAYOUTS: Partial<Record<Rank, readonly PipCoord[]>> = {
  '2': [
    { x: 35, y: 18 },
    { x: 35, y: 76, inv: true },
  ],
  '3': [
    { x: 35, y: 18 },
    { x: 35, y: 47 },
    { x: 35, y: 76, inv: true },
  ],
  '4': [
    { x: 24, y: 18 },
    { x: 46, y: 18 },
    { x: 24, y: 76, inv: true },
    { x: 46, y: 76, inv: true },
  ],
  '5': [
    { x: 24, y: 18 },
    { x: 46, y: 18 },
    { x: 35, y: 47 },
    { x: 24, y: 76, inv: true },
    { x: 46, y: 76, inv: true },
  ],
  '6': [
    { x: 24, y: 18 },
    { x: 46, y: 18 },
    { x: 24, y: 47 },
    { x: 46, y: 47 },
    { x: 24, y: 76, inv: true },
    { x: 46, y: 76, inv: true },
  ],
  '7': [
    { x: 24, y: 18 },
    { x: 46, y: 18 },
    { x: 35, y: 32 },
    { x: 24, y: 47 },
    { x: 46, y: 47 },
    { x: 24, y: 76, inv: true },
    { x: 46, y: 76, inv: true },
  ],
  '8': [
    { x: 24, y: 18 },
    { x: 46, y: 18 },
    { x: 35, y: 32 },
    { x: 24, y: 47 },
    { x: 46, y: 47 },
    { x: 35, y: 62, inv: true },
    { x: 24, y: 76, inv: true },
    { x: 46, y: 76, inv: true },
  ],
  '9': [
    { x: 24, y: 17 },
    { x: 46, y: 17 },
    { x: 24, y: 36 },
    { x: 46, y: 36 },
    { x: 35, y: 29 },
    { x: 24, y: 58, inv: true },
    { x: 46, y: 58, inv: true },
    { x: 24, y: 77, inv: true },
    { x: 46, y: 77, inv: true },
  ],
  '10': [
    { x: 24, y: 17 },
    { x: 46, y: 17 },
    { x: 35, y: 27 },
    { x: 24, y: 37 },
    { x: 46, y: 37 },
    { x: 24, y: 57, inv: true },
    { x: 46, y: 57, inv: true },
    { x: 35, y: 67, inv: true },
    { x: 24, y: 77, inv: true },
    { x: 46, y: 77, inv: true },
  ],
};

interface CourtPalette {
  primary: RGBA;
  secondary: RGBA;
  gold: RGBA;
  goldShade: RGBA;
  trim: RGBA;
  hair: RGBA;
}

function getCourtPalette(suit: Suit, highContrast: boolean): CourtPalette {
  const base = (highContrast ? SUIT_COLORS_HC : SUIT_COLORS_DEFAULT)[suit];
  const gold = hex('#f6c445');
  const goldShade = hex('#c4881e');
  if (suit === 'Hearts') {
    return {
      primary: base,
      secondary: hex('#2d4975'),
      gold,
      goldShade,
      trim: hex('#ffe08c'),
      hair: hex('#37424a'),
    };
  }
  if (suit === 'Clubs') {
    return {
      primary: base,
      secondary: highContrast ? hex('#f09a26') : hex('#e06b42'),
      gold,
      goldShade,
      trim: hex('#fff0b3'),
      hair: hex('#2f3c40'),
    };
  }
  if (suit === 'Diamonds') {
    return {
      primary: base,
      secondary: highContrast ? hex('#3a5c7a') : hex('#2c6b78'),
      gold: hex('#ffd54f'),
      goldShade: hex('#c78816'),
      trim: hex('#fff4cc'),
      hair: hex('#423836'),
    };
  }
  return {
    primary: base,
    secondary: highContrast ? hex('#2f8fd4') : hex('#d94b4b'),
    gold,
    goldShade,
    trim: hex('#d9e8ff'),
    hair: hex('#29313d'),
  };
}

/**
 * Draw an ornate, symmetrical double-ended woodblock playing-card Court Figure (J, Q, K).
 * Designed at 1px precision inside x:15..55, y:6..88 so corner ranks remain 100% crisp.
 */
function drawCourtCard(
  s: PixelSurface,
  ox: number,
  oy: number,
  rank: 'Jack' | 'Queen' | 'King',
  suit: Suit,
  highContrast: boolean
): void {
  const pal = getCourtPalette(suit, highContrast);
  const ink = COL_INK;
  const skin = hex('#eef0f2');
  const skinShade = hex('#c5ccd4');
  const cream = hex('#fff9eb');

  // Render full court panel on a 41x83 surface (inner frame x:15..55, y:6..88)
  const boxW = 41;
  const boxH = 83;
  const court = new PixelSurface(boxW, boxH);
  const cx = 20;

  // Thin crisp dark outer court frame with tiny corner ticks
  court.rectOutline(2, 5, boxW - 4, boxH - 10, ink, 1);
  court.rect(3, 6, boxW - 6, boxH - 12, cream);

  // Subtle decorative tapestry vertical backdrop stripes inside frame
  const tapLight = mixRgba(cream, pal.primary, 0.12);
  for (let x = 5; x < boxW - 5; x += 4) {
    court.rect(x, 7, 2, boxH - 14, tapLight);
  }

  // Paint the top royal half (y: 0..42) onto a dedicated half-canvas,
  // then mirror 180-deg onto the bottom half for authentic double-ended court charm!
  const half = new PixelSurface(boxW, 46);

  // -- 1. Royal Tunic / Shoulders & Patterned Torso (y: 25..45) --
  // Broad royal cloak silhouette
  half.poly(
    [
      [cx - 15, 45],
      [cx - 14, 30],
      [cx - 8, 25],
      [cx + 8, 25],
      [cx + 14, 30],
      [cx + 15, 45],
    ],
    pal.primary,
    ink
  );

  // Inner tunic secondary color panel & ornate medieval striping/diamond motif
  half.rect(cx - 10, 29, 21, 16, pal.secondary);
  if (rank === 'King') {
    // Bold royal horizontal brocade bands + vertical gold spine
    for (let y = 31; y <= 43; y += 4) {
      half.rect(cx - 13, y, 27, 2, y % 8 === 3 ? pal.gold : pal.primary);
    }
    half.rect(cx - 2, 27, 5, 18, pal.gold);
    half.rect(cx - 1, 27, 3, 18, cream);
    half.line(cx - 3, 27, cx - 3, 45, ink);
    half.line(cx + 3, 27, cx + 3, 45, ink);
    // Belt buckle jewel at waist
    half.rect(cx - 5, 41, 11, 4, pal.gold);
    half.rect(cx - 2, 42, 5, 2, pal.primary);
  } else if (rank === 'Queen') {
    // Graceful diagonal diamond-latticed royal bodice with jeweled V-collar
    for (let y = 30; y < 45; y++) {
      for (let x = cx - 12; x <= cx + 12; x++) {
        const d = (x + y) & 3;
        if (d === 0) half.px(x, y, pal.gold);
        else if (d === 2) half.px(x, y, pal.primary);
      }
    }
    // Sweeping gold diagonal sash
    for (let i = 0; i < 16; i++) {
      half.rect(cx - 11 + i, 28 + Math.round(i * 0.95), 4, 3, pal.gold);
      half.px(cx - 11 + i, 28 + Math.round(i * 0.95), ink);
      half.px(cx - 7 + i, 30 + Math.round(i * 0.95), ink);
    }
    // White lace collar veil
    half.poly(
      [
        [cx - 8, 25],
        [cx + 8, 25],
        [cx, 34],
      ],
      cream,
      ink
    );
    half.px(cx, 29, pal.primary);
  } else {
    // Jack: dashing knightly diagonal sash + heraldic checkered tunic
    for (let y = 30; y < 45; y += 3) {
      for (let x = cx - 12; x <= cx + 12; x += 3) {
        if (((x + y) / 3) % 2 < 1) half.rect(x, y, 2, 2, pal.primary);
      }
    }
    // Diagonal golden baldric sash
    for (let i = 0; i < 19; i++) {
      half.rect(cx - 11 + i, 27 + Math.round(i * 0.9), 4, 3, pal.gold);
      half.px(cx - 12 + i, 27 + Math.round(i * 0.9), ink);
      half.px(cx - 7 + i, 29 + Math.round(i * 0.9), ink);
    }
    // Crisp ruffled neck collar
    half.rect(cx - 6, 25, 13, 3, cream);
    half.rect(cx - 6, 24, 13, 1, ink);
    half.rect(cx - 6, 28, 13, 1, ink);
  }

  // Ornate puff sleeves / shoulder pauldrons
  half.ellipse(cx - 12, 31, 4, 5, pal.primary, ink);
  half.ellipse(cx + 12, 31, 4, 5, pal.primary, ink);
  half.rect(cx - 13, 29, 2, 4, pal.gold);
  half.rect(cx + 12, 29, 2, 4, pal.gold);

  // -- 2. Hair, Shaded Alabaster Face & Royal Beard/Veil (y: 12..27) --
  // Flowing hair / cowl backdrop
  if (rank === 'Queen') {
    half.poly(
      [
        [cx - 9, 26],
        [cx - 8, 13],
        [cx + 8, 13],
        [cx + 9, 26],
      ],
      cream,
      ink
    );
    half.poly(
      [
        [cx - 7, 25],
        [cx - 6, 13],
        [cx + 6, 13],
        [cx + 7, 25],
      ],
      pal.hair
    );
  } else {
    half.ellipse(cx, 19, 7, 8, pal.hair, ink);
  }

  // Serene classic playing-card alabaster oval face (left-lit, right-shaded)
  half.ellipse(cx, 19, 4.5, 6, skin, ink);
  half.rect(cx + 2, 15, 2, 8, skinShade);
  half.px(cx + 1, 22, skinShade);
  // Subtle refined brow/nose pixel accents (never cartoon!)
  half.px(cx - 2, 17, ink);
  half.px(cx + 1, 17, ink);
  half.px(cx, 19, skinShade);
  if (rank === 'King') {
    // Sculpted royal dark beard + silver-grey mustache!
    half.poly(
      [
        [cx - 5, 21],
        [cx + 5, 21],
        [cx + 3, 27],
        [cx, 28],
        [cx - 3, 27],
      ],
      pal.hair,
      ink
    );
    half.rect(cx - 3, 21, 7, 2, skinShade);
    half.px(cx, 22, ink);
  } else {
    half.rect(cx - 1, 22, 3, 1, skinShade);
  }

  // -- 3. Crown / Royal Coronet / Plumed Cavalier Cap (y: 1..15) --
  if (rank === 'King') {
    // Tall 5-point jeweled golden crown
    half.poly(
      [
        [cx - 8, 13],
        [cx - 9, 5],
        [cx - 5, 9],
        [cx - 3, 4],
        [cx, 8],
        [cx + 3, 4],
        [cx + 5, 9],
        [cx + 9, 5],
        [cx + 8, 13],
      ],
      pal.gold,
      ink
    );
    // Crown band & gems
    half.rect(cx - 7, 11, 15, 2, pal.goldShade);
    half.px(cx - 4, 11, pal.primary);
    half.px(cx, 11, cream);
    half.px(cx + 4, 11, pal.primary);
    // Crown finial pearls
    half.px(cx - 9, 4, cream);
    half.px(cx - 3, 3, cream);
    half.px(cx + 3, 3, cream);
    half.px(cx + 9, 4, cream);
    // Red velvet cap lining inside crown
    half.rect(cx - 5, 8, 11, 2, pal.primary);
  } else if (rank === 'Queen') {
    // Delicate jeweled floral coronet
    half.poly(
      [
        [cx - 7, 13],
        [cx - 8, 6],
        [cx - 4, 9],
        [cx, 4],
        [cx + 4, 9],
        [cx + 8, 6],
        [cx + 7, 13],
      ],
      pal.gold,
      ink
    );
    half.rect(cx - 6, 11, 13, 2, pal.goldShade);
    half.px(cx, 7, pal.primary);
    half.px(cx - 4, 11, pal.primary);
    half.px(cx + 4, 11, pal.primary);
    half.px(cx, 3, cream);
  } else {
    // Jack: jaunty plumed royal cavalier beret in suit color with gold feather!
    half.poly(
      [
        [cx - 9, 13],
        [cx - 10, 7],
        [cx - 4, 3],
        [cx + 5, 4],
        [cx + 9, 8],
        [cx + 7, 13],
      ],
      pal.primary,
      ink
    );
    // Sweeping gold feather plume + upturned gold brim
    half.poly(
      [
        [cx - 8, 7],
        [cx - 11, 2],
        [cx - 3, 2],
        [cx - 1, 6],
      ],
      pal.gold,
      ink
    );
    half.rect(cx - 7, 11, 15, 2, pal.gold);
    half.px(cx + 4, 11, cream);
  }

  // -- 4. Iconic Side Royal Weapons / Scepters / Roses (x: cx+13..cx+18) --
  const wx = cx + 15;
  if (rank === 'King') {
    // Upright golden-hilted broadsword / royal halberd on right side
    half.rect(wx - 1, 7, 3, 35, pal.gold);
    half.rect(wx, 8, 1, 28, cream);
    half.line(wx - 2, 7, wx - 2, 41, ink);
    half.line(wx + 2, 7, wx + 2, 41, ink);
    // Ornate finial / orb top
    half.circle(wx, 10, 3.5, pal.gold, ink);
    half.px(wx, 10, pal.primary);
    half.px(wx - 1, 9, cream);
    // Crossguard near grip
    half.rect(wx - 4, 29, 9, 3, pal.gold);
    half.rectOutline(wx - 4, 29, 9, 3, ink);
  } else if (rank === 'Queen') {
    // Long gilded floral scepter with blooming royal rose/tulip at top!
    half.rect(wx - 1, 14, 3, 30, pal.gold);
    half.line(wx - 2, 14, wx - 2, 43, ink);
    half.line(wx + 2, 14, wx + 2, 43, ink);
    half.circle(wx, 11, 4, pal.primary, ink);
    half.circle(wx, 10, 2, pal.gold);
    half.px(wx - 1, 9, cream);
    // Tiny green/gold leaf sprigs
    half.rect(wx - 4, 20, 3, 2, pal.secondary);
    half.rect(wx + 2, 24, 3, 2, pal.secondary);
  } else {
    // Jack: gleaming upright knight's sword / pike
    half.poly(
      [
        [wx, 4],
        [wx + 2, 10],
        [wx + 2, 32],
        [wx - 2, 32],
        [wx - 2, 10],
      ],
      hex('#d8e2eb'),
      ink
    );
    half.line(wx, 6, wx, 31, COL_WHITE);
    half.rect(wx - 4, 32, 9, 3, pal.gold);
    half.rectOutline(wx - 4, 32, 9, 3, ink);
    half.rect(wx - 1, 35, 3, 7, pal.primary);
    half.circle(wx, 42, 2, pal.gold, ink);
  }

  // Blit top half and 180-deg mirrored bottom half onto the court card!
  court.blit(half, 0, 0);
  // Create a cropped bottom mirror (excluding seam overshoot) so the double-ended waist joins cleanly
  const botHalf = new PixelSurface(boxW, 42);
  for (let y = 0; y < 42; y++) {
    for (let x = 0; x < boxW; x++) {
      const p = half.getPx(x, y);
      if (p[3] > 0) botHalf.px(x, y, p);
    }
  }
  court.blit(botHalf, 0, boxH - 42, { rot180: true });

  // Crisp ornamental diagonal waist divider bar tying both royal halves together
  court.rect(6, 40, boxW - 12, 3, pal.gold);
  court.line(6, 39, boxW - 7, 39, ink);
  court.line(6, 43, boxW - 7, 43, ink);
  court.rect(cx - 2, 40, 5, 3, pal.primary);
  court.px(cx, 41, cream);

  // Subtle top-left & bottom-right miniature suit emblem accents inside court corners
  court.suitPip(suit, 8, 12, 'sm', pal.primary);
  court.suitPip(suit, boxW - 9, boxH - 13, 'sm', pal.primary, { inv: true });

  s.blit(court, ox + 15, oy + 6);
}

function buildPlayingCardsAtlas(highContrast: boolean): HTMLCanvasElement {
  const spec = highContrast ? ATLAS_SPECS.cards_2 : ATLAS_SPECS.cards_1;
  const surf = new PixelSurface(spec.cols * spec.cellW, spec.rows * spec.cellH);
  const suitColors = highContrast ? SUIT_COLORS_HC : SUIT_COLORS_DEFAULT;

  for (let row = 0; row < 4; row++) {
    const suit = CARD_ROW_SUITS[row]!;
    const col = suitColors[suit];

    for (let c = 0; c < 13; c++) {
      const rank = RANKS[c]!;
      const ox = c * spec.cellW;
      const oy = row * spec.cellH;

      // Top-left crisp corner rank + micro suit pip
      const rankX = rank === '10' ? ox + 8 : ox + 8;
      surf.cardRank(rank, rankX, oy + 10, col, false);
      surf.suitPip(suit, ox + 8, oy + 20, 'sm', col, { inv: false });

      // Bottom-right truly 180-degree inverted corner rank + inverted micro suit pip
      surf.cardRank(rank, ox + 62, oy + 84, col, true);
      surf.suitPip(suit, ox + 62, oy + 74, 'sm', col, { inv: true });

      if (rank === 'Ace') {
        // Bold sculpted centerpiece Ace emblem
        surf.suitPip(suit, ox + 35, oy + 47, 'xl', col);
      } else if (rank === 'Jack' || rank === 'Queen' || rank === 'King') {
        drawCourtCard(surf, ox, oy, rank, suit, highContrast);
      } else {
        const pips = PIP_LAYOUTS[rank] ?? [];
        for (const p of pips) {
          surf.suitPip(suit, ox + p.x, oy + p.y, 'md', col, { inv: p.inv });
        }
      }
    }
  }

  return surf.toCanvas();
}

// ---------------------------------------------------------------------------
// 2. Centers Atlas (`centers`, 7x5 @ 71x95):
// Clean white base (1,0), 15+ ornate Deck Backs, 8 rich Enhancements,
// 4 Embossed 3D Wax Seals, Soul crystal (0,1), Locked & Undiscovered icons.
// ---------------------------------------------------------------------------

function drawLockedOverlay(s: PixelSurface, ox: number, oy: number, bgTop: RGBA, bgBot: RGBA): void {
  const cell = new PixelSurface(CARD_W, CARD_H);
  drawOrnateFiligreeBack(cell, 0, 0, bgTop, bgBot, hex('#f0f4fa'), { borderTint: hex('#e6edf5') });

  // Diagonal crossing steel chains!
  const linkDark = hex('#4b5a69');
  const linkMid = hex('#95a6b8');
  const linkHi = hex('#dce6f0');
  const drawChain = (x0: number, y0: number, x1: number, y1: number) => {
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const lx = Math.round(x0 + (x1 - x0) * t);
      const ly = Math.round(y0 + (y1 - y0) * t);
      if (i % 2 === 0) {
        cell.circle(lx, ly, 3, linkMid, linkDark);
        cell.px(lx - 1, ly - 1, linkHi);
        cell.px(lx, ly, linkDark);
      } else {
        cell.rect(lx - 2, ly - 2, 5, 5, linkDark);
        cell.rect(lx - 1, ly - 1, 3, 3, linkHi);
      }
    }
  };
  drawChain(3, 3, 35, 39);
  drawChain(67, 3, 35, 39);
  drawChain(35, 62, 35, 93);

  // Shaded 3D metal padlock centered at (35, 48)
  const cx = 35;
  const cy = 49;
  // Shackle arch
  cell.ring(cx, cy - 11, 10, 6, linkDark);
  cell.ring(cx, cy - 11, 9, 7, linkMid);
  cell.px(cx - 7, cy - 15, linkHi);
  cell.px(cx - 6, cy - 16, linkHi);
  // Lock body
  cell.roundedRect(cx - 14, cy - 9, 29, 25, 6, linkMid, linkDark);
  cell.roundedRect(cx - 12, cy - 7, 25, 21, 5, hex('#a7b6c7'));
  cell.rect(cx - 10, cy - 6, 20, 2, linkHi);
  cell.rect(cx - 10, cy + 12, 20, 2, hex('#7d8d9e'));
  // Keyhole
  cell.circle(cx, cy + 1, 3.5, COL_WHITE, linkDark);
  cell.poly(
    [
      [cx - 2, cy + 3],
      [cx + 2, cy + 3],
      [cx + 3, cy + 10],
      [cx - 3, cy + 10],
    ],
    COL_WHITE,
    linkDark
  );

  s.blit(cell, ox, oy);
}

function buildCentersAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.centers;
  const surf = new PixelSurface(spec.cols * spec.cellW, spec.rows * spec.cellH);
  const cellPos = (gx: number, gy: number) => ({ ox: gx * spec.cellW, oy: gy * spec.cellH });

  // --- (1,0) Crisp Clean White Card Front (`none`) ---
  {
    const { ox, oy } = cellPos(1, 0);
    drawCleanWhiteCard(surf, ox, oy);
  }

  // --- Ornate Symmetrical Filigree Classic Deck Backs ---
  // (0,0) Red Deck
  drawOrnateFiligreeBack(surf, 0, 0, hex('#ff5e54'), hex('#e6433c'));
  // (0,2) Blue Deck
  drawOrnateFiligreeBack(surf, 0, 2 * CARD_H, hex('#179bff'), hex('#0078db'));
  // (1,2) Yellow Deck
  drawOrnateFiligreeBack(surf, CARD_W, 2 * CARD_H, hex('#ffb400'), hex('#e08a00'));
  // (2,2) Green Deck
  drawOrnateFiligreeBack(surf, 2 * CARD_W, 2 * CARD_H, hex('#4eb385'), hex('#328761'));
  // (3,2) Black Deck
  drawOrnateFiligreeBack(surf, 3 * CARD_W, 2 * CARD_H, hex('#435157'), hex('#293338'));
  // (5,2) Dual-Tone Gradient Filigree Spare
  drawOrnateFiligreeBack(surf, 5 * CARD_W, 2 * CARD_H, hex('#768fd9'), hex('#db7b8d'));
  // (3,3) Abandoned Deck (Antique Distressed Terracotta Parchment Filigree)
  drawOrnateFiligreeBack(surf, 3 * CARD_W, 3 * CARD_H, hex('#c79273'), hex('#a87254'), hex('#faf2e3'), {
    distressed: true,
    borderTint: hex('#f7ecd9'),
  });

  // --- (3,0) Nebula Deck (`b_nebula`) ---
  {
    const { ox, oy } = cellPos(3, 0);
    const c = new PixelSurface(CARD_W, CARD_H);
    const ramp = [hex('#1c2a3b'), hex('#2c4459'), hex('#3c6270'), hex('#584b87'), hex('#7d5ba6')];
    for (let y = 1; y < CARD_H - 1; y++) {
      for (let x = 1; x < CARD_W - 1; x++) {
        // Rounded card silhouette
        const inCorner =
          (x < 4 && y < 4 && (4 - x) + (4 - y) > 4) ||
          (x > 66 && y < 4 && (x - 66) + (4 - y) > 4) ||
          (x < 4 && y > 90 && (4 - x) + (y - 90) > 4) ||
          (x > 66 && y > 90 && (x - 66) + (y - 90) > 4);
        if (inCorner) continue;
        const nx = x / CARD_W;
        const ny = y / CARD_H;
        const sw = swirlMarble(nx, ny, 2.8, 3.2, 71);
        const band = 0.5 + 0.5 * Math.sin((nx * 3.8 + ny * 2.4 + sw * 2.2) * Math.PI);
        c.px(x, y, ditherRamp(x, y, band * 0.85, ramp));
      }
    }
    // Delicate cosmic sparkles & twinkling cross stars
    for (let i = 0; i < 24; i++) {
      const sx = 6 + Math.floor(hash2i(i, 1, 77) * 58);
      const sy = 6 + Math.floor(hash2i(i, 2, 77) * 82);
      if (i % 5 === 0) c.sparkle(sx, sy, hex('#ffe999'), 2, COL_WHITE);
      else if (i % 3 === 0) c.sparkle(sx, sy, hex('#a6f0ff'), 1, COL_WHITE);
      else c.px(sx, sy, hex('#d4ecff'));
    }
    surf.blit(c, ox, oy);
  }

  // --- (4,0) Locked Card / Chains & Padlock ---
  drawLockedOverlay(surf, 4 * CARD_W, 0, hex('#c4d0de'), hex('#aebcc9'));

  // --- (5,0) Stone Card (`m_stone`) ---
  {
    const { ox, oy } = cellPos(5, 0);
    const c = new PixelSurface(CARD_W, CARD_H);
    const hi = hex('#dfe4ea');
    const face = hex('#c5ccd4');
    const mid = hex('#a2acb6');
    const dark = hex('#76818c');
    const crack = hex('#58626d');
    c.roundedRect(1, 1, 69, 93, 3, face, dark);
    // Top-left chiseled bevel highlight & bottom-right granite shadow
    c.rect(3, 2, 64, 2, hi);
    c.rect(2, 3, 2, 87, hi);
    c.rect(3, 91, 65, 2, crack);
    c.rect(67, 4, 2, 88, dark);
    // Subtle granite strata dither
    for (let y = 4; y < 90; y++) {
      for (let x = 4; x < 66; x++) {
        const n = fbm2D(x * 0.14, y * 0.14, 3, 501);
        if (n > 0.64) c.px(x, y, ditherRamp(x, y, (n - 0.64) * 3, [face, hi]));
        else if (n < 0.38) c.px(x, y, ditherRamp(x, y, n / 0.38, [mid, face]));
      }
    }
    // Deep chiseled fissures & cracks with 1px light edge below!
    const drawCrack = (pts: ReadonlyArray<readonly [number, number]>) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i]!;
        const [x1, y1] = pts[i + 1]!;
        c.line(x0, y0 + 1, x1, y1 + 1, hi, 1);
        c.line(x0, y0, x1, y1, crack, 2);
      }
    };
    drawCrack([
      [2, 27],
      [18, 28],
      [29, 34],
      [42, 32],
    ]);
    drawCrack([
      [68, 41],
      [54, 46],
      [43, 55],
      [28, 56],
      [15, 62],
    ]);
    drawCrack([
      [28, 12],
      [39, 17],
      [51, 16],
    ]);
    drawCrack([
      [47, 52],
      [55, 65],
      [68, 70],
    ]);
    // Chipped corner notches
    c.rect(1, 24, 3, 5, crack);
    c.rect(66, 68, 4, 5, crack);
    c.rect(14, 1, 5, 3, dark);
    surf.blit(c, ox, oy);
  }

  // --- (6,0) Gold Card (`m_gold`) ---
  {
    const { ox, oy } = cellPos(6, 0);
    const c = new PixelSurface(CARD_W, CARD_H);
    const rim = hex('#ba831e');
    const body = hex('#f7ca62');
    const deep = hex('#dfa031');
    const shine = hex('#fff2b2');
    c.roundedRect(1, 1, 69, 93, 4, body, rim);
    // Rich beveled inner gold frame
    c.roundedRect(3, 3, 65, 89, 3, body, hex('#ffe385'));
    c.rect(4, 90, 63, 2, deep);
    c.rect(66, 4, 2, 87, deep);
    // Gleaming diagonal specular polish bands!
    for (let y = 4; y < 90; y++) {
      for (let x = 4; x < 66; x++) {
        const diag = x + y;
        if ((diag >= 34 && diag <= 42) || (diag >= 74 && diag <= 88) || (diag >= 114 && diag <= 119)) {
          c.px(x, y, shine);
        } else if (diag >= 89 && diag <= 91) {
          c.px(x, y, hex('#fae08c'));
        }
      }
    }
    surf.blit(c, ox, oy);
  }

  // --- (0,1) Soul Floating Crystalline Teardrop (transparent background!) ---
  {
    const { ox, oy } = cellPos(0, 1);
    const cx = ox + 35;
    const cy = oy + 52;
    const c = new PixelSurface(CARD_W, CARD_H);
    const gx = 35;
    const gy = 52;
    const ink = hex('#3d4954');
    // Sculpted faceted luminous teardrop crystal
    c.poly(
      [
        [gx, gy - 25],
        [gx + 11, gy - 8],
        [gx + 14, gy + 8],
        [gx + 7, gy + 21],
        [gx, gy + 24],
        [gx - 7, gy + 21],
        [gx - 14, gy + 8],
        [gx - 11, gy - 8],
      ],
      hex('#dbe6ed'),
      ink
    );
    // Faceted pearlescent interior planes
    c.poly(
      [
        [gx, gy - 21],
        [gx + 7, gy - 5],
        [gx - 1, gy + 9],
        [gx - 9, gy - 5],
      ],
      COL_WHITE
    );
    c.poly(
      [
        [gx + 7, gy - 5],
        [gx + 12, gy + 8],
        [gx + 4, gy + 19],
        [gx - 1, gy + 9],
      ],
      hex('#b9c8d4')
    );
    c.poly(
      [
        [gx - 9, gy - 5],
        [gx - 1, gy + 9],
        [gx - 5, gy + 18],
        [gx - 12, gy + 8],
      ],
      hex('#edf4f8')
    );
    c.line(gx, gy - 22, gx - 1, gy + 9, hex('#c5d4e0'));
    c.line(gx - 1, gy + 9, gx + 10, gy + 7, hex('#8d9ead'));
    c.sparkle(gx - 3, gy - 7, COL_WHITE, 3);
    void cx;
    void cy;
    surf.blit(c, ox, oy);
  }

  // --- (1,1) Bonus Card (`m_bonus`) ---
  {
    const { ox, oy } = cellPos(1, 1);
    drawCleanWhiteCard(surf, ox, oy);
    const blue = hex('#009dff');
    const hi = hex('#6cd1ff');
    const dark = hex('#006ec2');
    // Upward chevron diamond-arrow column down left margin (x=11)
    for (let y = 26; y <= 84; y += 9) {
      surf.poly(
        [
          [ox + 11, oy + y - 4],
          [ox + 15, oy + y + 2],
          [ox + 7, oy + y + 2],
        ],
        blue
      );
      surf.px(ox + 11, oy + y - 3, hi);
      surf.rect(ox + 9, oy + y + 2, 5, 1, dark);
    }
    // Downward chevron diamond-arrow column down right margin (x=59)
    for (let y = 11; y <= 69; y += 9) {
      surf.poly(
        [
          [ox + 59, oy + y + 4],
          [ox + 63, oy + y - 2],
          [ox + 55, oy + y - 2],
        ],
        blue
      );
      surf.px(ox + 59, oy + y + 3, dark);
      surf.rect(ox + 57, oy + y - 2, 5, 1, hi);
    }
    // Crisp top/bottom diamond tip ticks
    surf.rect(ox + 10, oy + 2, 3, 2, blue);
    surf.rect(ox + 58, oy + 91, 3, 2, blue);
  }

  // --- (2,1) Mult Card (`m_mult`) ---
  {
    const { ox, oy } = cellPos(2, 1);
    drawCleanWhiteCard(surf, ox, oy);
    const red = hex('#fe5f55');
    const redDark = hex('#c4352d');
    const slate = hex('#425057');
    const slateLt = hex('#6b7b84');
    // Bold dramatic crimson & charcoal jagged tectonic energy bands across middle!
    const bandWave = (x: number, phase: number, amp: number) =>
      Math.round(Math.sin(x * 0.14 + phase) * amp + Math.cos(x * 0.08 - phase) * (amp * 0.5));
    for (let x = 2; x < CARD_W - 2; x++) {
      const yTop = 36 + bandWave(x, 0.3, 4);
      const yMid = 50 + bandWave(x, 1.8, 3);
      const yBot = 62 + bandWave(x, 3.1, 4);
      surf.px(ox + x, oy + yTop - 6, slate);
      for (let y = yTop; y < yMid; y++) {
        surf.px(ox + x, oy + y, y === yTop || y === yMid - 1 ? redDark : red);
      }
      for (let y = yMid + 2; y < yBot; y++) {
        surf.px(ox + x, oy + y, y === yMid + 2 ? slateLt : slate);
      }
      surf.px(ox + x, oy + yBot + 4, red);
      surf.px(ox + x, oy + yBot + 5, redDark);
    }
  }

  // --- (3,1) Wild Card (`m_wild`) ---
  {
    const { ox, oy } = cellPos(3, 1);
    drawCleanWhiteCard(surf, ox, oy);
    // Prismatic shimmering crystalline wild accents on left-upper and right-lower edges!
    const shards = [hex('#fe5f55'), hex('#fda200'), hex('#4bc292'), hex('#009dff'), hex('#b26cbb')];
    const drawPrismCluster = (cx: number, cy: number) => {
      for (let i = 0; i < 5; i++) {
        const sy = cy - 10 + i * 5;
        surf.poly(
          [
            [cx, sy - 3],
            [cx + 3, sy],
            [cx, sy + 4],
            [cx - 3, sy],
          ],
          shards[i]!,
          COL_INK
        );
        surf.px(cx - 1, sy - 1, COL_WHITE);
      }
    };
    drawPrismCluster(ox + 9, oy + 36);
    drawPrismCluster(ox + 61, oy + 58);
    // Subtle corner shimmer dots
    surf.rect(ox + 18, oy + 3, 35, 1, hex('#e2e8f0'));
    surf.rect(ox + 18, oy + 91, 35, 1, hex('#e2e8f0'));
  }

  // --- (4,1) Lucky Card (`m_lucky`) ---
  {
    const { ox, oy } = cellPos(4, 1);
    const c = new PixelSurface(CARD_W, CARD_H);
    const ramp = [hex('#e6d2a4'), hex('#f0e1be'), hex('#f7edd4'), hex('#fcf6e6')];
    for (let y = 1; y < CARD_H - 1; y++) {
      for (let x = 1; x < CARD_W - 1; x++) {
        const edgeJitter = hash2i(x, y, 41) > 0.72 ? 1 : 0;
        const inCorner =
          (x < 3 + edgeJitter && y < 3) ||
          (x > 67 - edgeJitter && y < 3) ||
          (x < 3 && y > 91) ||
          (x > 67 && y > 91);
        if (inCorner) continue;
        const fiber =
          0.5 +
          0.25 * Math.sin((x * 0.12 - y * 0.08 + fbm2D(x * 0.09, y * 0.09, 2, 41) * 3.5) * 2.2) +
          0.15 * fbm2D(x * 0.18, y * 0.18, 2, 83);
        const edgeDark = Math.min(x, CARD_W - 1 - x, y, CARD_H - 1 - y) < 5 ? -0.18 : 0;
        c.px(x, y, ditherRamp(x, y, fiber + edgeDark, ramp));
      }
    }
    surf.blit(c, ox, oy);
  }

  // --- (5,1) Glass Card (`m_glass`) ---
  {
    const { ox, oy } = cellPos(5, 1);
    const c = new PixelSurface(CARD_W, CARD_H);
    // Semi-translucent frosted ice-cyan silhouette!
    c.roundedRect(1, 1, 69, 93, 4, hex('#dff7ff', 175), hex('#9cd6eb', 230));
    c.roundedRect(3, 3, 65, 89, 3, hex('#ecfbff', 165), hex('#ffffff', 225));
    // Crisp diagonal glass specular highlight bars
    for (let y = 3; y < 91; y++) {
      for (let x = 3; x < 67; x++) {
        const diag = x + y;
        if ((diag >= 36 && diag <= 48) || (diag >= 72 && diag <= 82) || (diag >= 116 && diag <= 124)) {
          c.px(x, y, hex('#ffffff', 220));
        } else if (diag >= 125 && diag <= 132) {
          c.px(x, y, hex('#b0e4f7', 195));
        }
      }
    }
    surf.blit(c, ox, oy);
  }

  // --- (6,1) Steel Card (`m_steel`) ---
  {
    const { ox, oy } = cellPos(6, 1);
    const c = new PixelSurface(CARD_W, CARD_H);
    const rim = hex('#7c8b99');
    const base = hex('#ccd5df');
    const mid = hex('#b8c3cf');
    const sheen = hex('#ebf1f7');
    c.roundedRect(1, 1, 69, 93, 4, base, rim);
    c.roundedRect(3, 3, 65, 89, 3, base, hex('#e4ebf2'));
    c.rect(4, 90, 63, 2, hex('#8d9ca8'));
    c.rect(66, 4, 2, 87, hex('#96a5b2'));
    // Brushed diagonal metallic reflections
    for (let y = 4; y < 90; y++) {
      for (let x = 4; x < 66; x++) {
        const diag = x + y;
        if ((diag >= 28 && diag <= 36) || (diag >= 68 && diag <= 80) || (diag >= 112 && diag <= 122)) {
          c.px(x, y, sheen);
        } else if ((diag >= 50 && diag <= 58) || (diag >= 94 && diag <= 104)) {
          c.px(x, y, mid);
        }
      }
    }
    surf.blit(c, ox, oy);
  }

  // --- (4,2) Plasma Deck (`b_plasma`) ---
  {
    const { ox, oy } = cellPos(4, 2);
    const c = new PixelSurface(CARD_W, CARD_H);
    const ramp = [hex('#8c7fa8'), hex('#b49ec4'), hex('#d9aebf'), hex('#c2c0e3'), hex('#f0cdd8')];
    for (let y = 1; y < CARD_H - 1; y++) {
      for (let x = 1; x < CARD_W - 1; x++) {
        const inCorner =
          (x < 4 && y < 4 && (4 - x) + (4 - y) > 4) ||
          (x > 66 && y < 4 && (x - 66) + (4 - y) > 4) ||
          (x < 4 && y > 90 && (4 - x) + (y - 90) > 4) ||
          (x > 66 && y > 90 && (x - 66) + (y - 90) > 4);
        if (inCorner) continue;
        const nx = x / CARD_W;
        const ny = y / CARD_H;
        const w = fbm2D(nx * 2.6, ny * 3.0, 3, 202);
        const wave = 0.5 + 0.5 * Math.sin((nx * 2.4 - ny * 1.9 + w * 2.8) * Math.PI);
        const vein1 = Math.abs(ny - (0.34 + Math.sin(nx * 5.2 + w * 2.5) * 0.14));
        const vein2 = Math.abs(ny - (0.72 + Math.cos(nx * 4.6 - w * 2.2) * 0.15));
        if (vein1 < 0.025 || vein2 < 0.025) {
          c.px(x, y, hex('#6a668a'));
        } else {
          c.px(x, y, ditherRamp(x, y, Math.min(1, wave * 0.72 + (1 - ny) * 0.28), ramp));
        }
      }
    }
    surf.blit(c, ox, oy);
  }

  // --- (6,2) Ghost Deck (`b_ghost`) ---
  {
    const { ox, oy } = cellPos(6, 2);
    const c = new PixelSurface(CARD_W, CARD_H);
    const bands = [hex('#2d395c'), hex('#455582'), hex('#6b7bb0'), hex('#a8c4e8'), hex('#f5f7eb'), hex('#ccb966')];
    for (let y = 1; y < CARD_H - 1; y++) {
      for (let x = 1; x < CARD_W - 1; x++) {
        const inCorner =
          (x < 4 && y < 4 && (4 - x) + (4 - y) > 4) ||
          (x > 66 && y < 4 && (x - 66) + (4 - y) > 4) ||
          (x < 4 && y > 90 && (4 - x) + (y - 90) > 4) ||
          (x > 66 && y > 90 && (x - 66) + (y - 90) > 4);
        if (inCorner) continue;
        const v = swirlMarble(x / CARD_W, y / CARD_H, 2.4, 2.5, 62);
        const idx = Math.min(bands.length - 1, Math.floor(v * bands.length));
        c.px(x, y, bands[idx]!);
      }
    }
    surf.blit(c, ox, oy);
  }

  // --- (0,3) Magic Deck (`b_magic`) ---
  {
    const { ox, oy } = cellPos(0, 3);
    const c = new PixelSurface(CARD_W, CARD_H);
    const bands = [hex('#3c3075'), hex('#634ca8'), hex('#9e8ce6'), hex('#f2e6b6'), hex('#cca13d'), hex('#59448c')];
    for (let y = 1; y < CARD_H - 1; y++) {
      for (let x = 1; x < CARD_W - 1; x++) {
        const inCorner =
          (x < 4 && y < 4 && (4 - x) + (4 - y) > 4) ||
          (x > 66 && y < 4 && (x - 66) + (4 - y) > 4) ||
          (x < 4 && y > 90 && (4 - x) + (y - 90) > 4) ||
          (x > 66 && y > 90 && (x - 66) + (y - 90) > 4);
        if (inCorner) continue;
        const v = swirlMarble(x / CARD_W, y / CARD_H, 3.4, 3.0, 30);
        const idx = Math.min(bands.length - 1, Math.floor(v * bands.length));
        c.px(x, y, bands[idx]!);
      }
    }
    surf.blit(c, ox, oy);
  }

  // --- (1,3) Checkered Deck (`b_checkered`) ---
  {
    const { ox, oy } = cellPos(1, 3);
    const c = new PixelSurface(CARD_W, CARD_H);
    const red = hex('#eb5b52');
    const dark = hex('#424e54');
    const dot = hex('#75b0b8');
    c.roundedRect(1, 1, 69, 93, 4, dark, hex('#2e383d'));
    // Crisp diagonal argyle diamond checkerboard!
    for (let y = 3; y < CARD_H - 3; y++) {
      for (let x = 3; x < CARD_W - 3; x++) {
        const u = Math.floor((x + y) / 9);
        const v = Math.floor((x - y + 200) / 9);
        const isRed = ((u + v) & 1) === 0;
        const mu = (x + y) % 9;
        const mv = (x - y + 200) % 9;
        if ((mu === 0 || mu === 8) && (mv === 0 || mv === 8)) {
          c.px(x, y, dot);
        } else {
          c.px(x, y, isRed ? red : dark);
        }
      }
    }
    surf.blit(c, ox, oy);
  }

  // --- (2,3) Erratic Deck (`b_erratic`) ---
  {
    const { ox, oy } = cellPos(2, 3);
    const c = new PixelSurface(CARD_W, CARD_H);
    const bg = hex('#3d474d');
    const accents = [hex('#fe5f55'), hex('#009dff'), hex('#fda200'), hex('#4bc292'), hex('#c882ff')];
    c.roundedRect(1, 1, 69, 93, 4, bg, hex('#283036'));
    for (let gy = 0; gy < 10; gy++) {
      for (let gx = 0; gx < 7; gx++) {
        const px = 7 + gx * 9;
        const py = 7 + gy * 9;
        const h = Math.floor(hash2i(gx, gy, 23) * accents.length);
        const col = accents[h]!;
        if ((gx + gy) % 2 === 0) {
          // Tiny plus sign
          c.rect(px - 2, py, 5, 1, col);
          c.rect(px, py - 2, 1, 5, col);
        } else {
          // Tiny diamond pip
          c.px(px, py - 1, col);
          c.rect(px - 1, py, 3, 1, col);
          c.px(px, py + 1, col);
        }
      }
    }
    surf.blit(c, ox, oy);
  }

  // --- (4,3) Painted Deck (`b_painted`) ---
  {
    const { ox, oy } = cellPos(4, 3);
    const c = new PixelSurface(CARD_W, CARD_H);
    const swatches = [
      hex('#fe534a'),
      hex('#ff9924'),
      hex('#ffe047'),
      hex('#3ac47d'),
      hex('#1ba8f0'),
      hex('#3b5be6'),
      hex('#eb529e'),
      hex('#ffffff'),
    ];
    for (let y = 1; y < CARD_H - 1; y++) {
      for (let x = 1; x < CARD_W - 1; x++) {
        const inCorner =
          (x < 4 && y < 4 && (4 - x) + (4 - y) > 4) ||
          (x > 66 && y < 4 && (x - 66) + (4 - y) > 4) ||
          (x < 4 && y > 90 && (4 - x) + (y - 90) > 4) ||
          (x > 66 && y > 90 && (x - 66) + (y - 90) > 4);
        if (inCorner) continue;
        const nx = x / CARD_W;
        const ny = y / CARD_H;
        const f = fbm2D(nx * 3.1, ny * 3.4, 3, 43);
        const idx = Math.floor((f * 2.2 + nx * 0.4 + ny * 0.5) * swatches.length) % swatches.length;
        c.px(x, y, swatches[Math.abs(idx)]!);
      }
    }
    surf.blit(c, ox, oy);
  }

  // --- (5,3) & (6,3) Undiscovered Joker Silhouette & Question Badge ---
  {
    const { ox, oy } = cellPos(5, 3);
    const pale = hex('#cdd6e3');
    surf.circle(ox + 35, oy + 46, 13, pale);
    surf.poly(
      [
        [ox + 18, oy + 40],
        [ox + 26, oy + 24],
        [ox + 35, oy + 34],
        [ox + 44, oy + 24],
        [ox + 52, oy + 40],
      ],
      pale
    );
    surf.poly(
      [
        [ox + 20, oy + 62],
        [ox + 35, oy + 52],
        [ox + 50, oy + 62],
        [ox + 45, oy + 72],
        [ox + 35, oy + 65],
        [ox + 25, oy + 72],
      ],
      pale
    );
    surf.text5x7('?', ox + 35, oy + 39, COL_WHITE, 2, { align: 'center' });

    const q = cellPos(6, 3);
    surf.circle(q.ox + 35, q.oy + 47, 17, pale);
    surf.text5x7('?', q.ox + 35, q.oy + 40, COL_WHITE, 2, { align: 'center' });
  }

  // --- (0,4) Challenge Deck (Crimson-Plum Pixel Labyrinth Maze) ---
  {
    const { ox, oy } = cellPos(0, 4);
    const c = new PixelSurface(CARD_W, CARD_H);
    const plum = hex('#9e4c70');
    c.roundedRect(1, 1, 69, 93, 4, COL_WHITE, hex('#c4ccd6'));
    c.roundedRect(4, 4, 63, 87, 3, plum);
    // Crisp white geometric labyrinth channels
    for (let gy = 0; gy < 14; gy++) {
      for (let gx = 0; gx < 10; gx++) {
        const mx = 6 + gx * 6;
        const my = 6 + gy * 6;
        c.rect(mx, my, 4, 4, COL_WHITE);
        const h = hash2i(gx, gy, 404);
        if (gx < 9 && h < 0.56) c.rect(mx + 4, my, 2, 4, COL_WHITE);
        if (gy < 13 && h >= 0.42) c.rect(mx, my + 4, 4, 2, COL_WHITE);
      }
    }
    // Re-punch inner wall dots for crisp maze feel
    for (let gy = 0; gy < 13; gy++) {
      for (let gx = 0; gx < 9; gx++) {
        c.rect(10 + gx * 6, 10 + gy * 6, 2, 2, plum);
      }
    }
    surf.blit(c, ox, oy);
  }

  // --- (1,4) Geometric Retro Quad Deck (Spare Slot) ---
  {
    const { ox, oy } = cellPos(1, 4);
    const c = new PixelSurface(CARD_W, CARD_H);
    c.roundedRect(1, 1, 69, 93, 4, COL_WHITE, hex('#c4ccd6'));
    c.roundedRect(4, 4, 29, 41, 4, hex('#fe5f55'));
    c.roundedRect(37, 4, 29, 41, 4, hex('#009dff'));
    c.roundedRect(4, 49, 29, 41, 4, hex('#009dff'));
    c.roundedRect(37, 49, 29, 41, 4, hex('#fe5f55'));
    c.roundedRect(10, 14, 18, 22, 3, hex('#4bc292'), COL_WHITE);
    c.roundedRect(42, 14, 18, 22, 3, hex('#fda200'), COL_WHITE);
    c.roundedRect(10, 58, 18, 22, 3, hex('#fda200'), COL_WHITE);
    c.roundedRect(42, 58, 18, 22, 3, hex('#4bc292'), COL_WHITE);
    surf.blit(c, ox, oy);
  }

  // --- (2,4) Anaglyph Deck (`b_anaglyph`) ---
  {
    const { ox, oy } = cellPos(2, 4);
    const c = new PixelSurface(CARD_W, CARD_H);
    const ice = hex('#d9e8fa');
    const red = hex('#f25249');
    const blue = hex('#0095ff');
    const overlap = hex('#495c63');
    c.roundedRect(1, 1, 69, 93, 4, ice, hex('#b7c7d9'));
    for (let y = 2; y < CARD_H - 2; y++) {
      for (let x = 2; x < CARD_W - 2; x++) {
        if (c.getA(x, y) === 0) continue;
        const inRed = (x - 14) * (x - 14) / 1450 + (y - 34) * (y - 34) / 1250 < 1;
        const inBlue = (x - 56) * (x - 56) / 1450 + (y - 68) * (y - 68) / 1350 < 1;
        if (inRed && inBlue) c.px(x, y, overlap);
        else if (inRed) c.px(x, y, red);
        else if (inBlue) c.px(x, y, blue);
      }
    }
    surf.blit(c, ox, oy);
  }

  // --- (3,4) Zodiac Deck (`b_zodiac`) ---
  {
    const { ox, oy } = cellPos(3, 4);
    const c = new PixelSurface(CARD_W, CARD_H);
    const night = hex('#3f3d61');
    const web = hex('#6b6894');
    const gold = hex('#f5d04c');
    const goldDim = hex('#9e853c');
    c.roundedRect(1, 1, 69, 93, 4, night, hex('#292742'));
    // Constellation web geometry
    const stars: ReadonlyArray<readonly [number, number]> = [
      [12, 16],
      [58, 16],
      [10, 46],
      [60, 46],
      [14, 78],
      [56, 78],
      [35, 10],
      [35, 84],
    ];
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const [x0, y0] = stars[i]!;
        const [x1, y1] = stars[j]!;
        if (Math.hypot(x1 - x0, y1 - y0) < 42) c.line(x0, y0, x1, y1, web);
      }
    }
    // Nested golden celestial rings & lunar phases down the spine
    c.ring(35, 39, 17, 15, gold);
    c.ring(35, 39, 12, 11, goldDim);
    c.circle(35, 39, 6, COL_WHITE, gold);
    c.circle(35, 65, 7, gold, goldDim);
    c.circle(35, 65, 4, hex('#fff6cc'));
    c.circle(35, 11, 5, COL_WHITE, gold);
    c.circle(35, 84, 4, COL_WHITE, gold);
    c.ring(35, 76, 3, 2, gold);
    for (const [sx, sy] of stars) c.px(sx, sy, COL_WHITE);
    surf.blit(c, ox, oy);
  }

  // --- 4 Embossed 3D Glossy Wax Seals ---
  // Gold (2,0), Purple (4,4), Red (5,4), Blue (6,4)
  {
    const g = cellPos(2, 0);
    drawEmbossedWaxSeal(surf, g.ox, g.oy, hex('#fff099'), hex('#f5bc38'), hex('#c98718'), hex('#8c580b'));
    const p = cellPos(4, 4);
    drawEmbossedWaxSeal(surf, p.ox, p.oy, hex('#ddb5ff'), hex('#a863eb'), hex('#7335b3'), hex('#491d7a'));
    const r = cellPos(5, 4);
    drawEmbossedWaxSeal(surf, r.ox, r.oy, hex('#ff9c94'), hex('#f04a42'), hex('#b8251e'), hex('#7a120d'));
    const b = cellPos(6, 4);
    drawEmbossedWaxSeal(surf, b.ox, b.oy, hex('#96dbff'), hex('#0e96ff'), hex('#0a65b8'), hex('#053d75'));
  }

  return surf.toCanvas();
}

// ---------------------------------------------------------------------------
// 3. Tarot / Planet / Spectral Atlas (`Tarot`, 10x6 @ 71x95)
//   - 22 Tarots: 4-tone Bayer-dithered sepia-gold woodcuts with Roman numerals & full nameplates
//   - 12 Planets: Retro teal astronomical star-charts with 3D dithered spheres & hand pips
//   - 18 Spectrals: Deep swirling cobalt/gold/cream marbled art + Soul & Black Hole
// ---------------------------------------------------------------------------

// Iconic 4-tone Sepia-Gold Woodcut Palette for Tarots
const T_C0 = hex('#fbf3dc'); // bright cream highlight
const T_C1 = hex('#e8c782'); // warm parchment gold
const T_C2 = hex('#b68942'); // antique bronze midtone
const T_C3 = hex('#6e4e21'); // deep woodcut umber
const T_INK = hex('#422f18'); // crisp dark sepia ink
const T_RAMP: readonly RGBA[] = [T_C3, T_C2, T_C1, T_C0];

const TAROT_META: ReadonlyArray<{ roman: string; name: string }> = [
  { roman: '0', name: 'FOOL' },
  { roman: 'I', name: 'MAGICIAN' },
  { roman: 'II', name: 'PRIESTESS' },
  { roman: 'III', name: 'EMPRESS' },
  { roman: 'IV', name: 'EMPEROR' },
  { roman: 'V', name: 'HIEROPHANT' },
  { roman: 'VI', name: 'LOVERS' },
  { roman: 'VII', name: 'CHARIOT' },
  { roman: 'VIII', name: 'JUSTICE' },
  { roman: 'IX', name: 'HERMIT' },
  { roman: 'X', name: 'FORTUNE' },
  { roman: 'XI', name: 'STRENGTH' },
  { roman: 'XII', name: 'HANGED MAN' },
  { roman: 'XIII', name: 'DEATH' },
  { roman: 'XIV', name: 'TEMPERANCE' },
  { roman: 'XV', name: 'DEVIL' },
  { roman: 'XVI', name: 'TOWER' },
  { roman: 'XVII', name: 'STAR' },
  { roman: 'XVIII', name: 'MOON' },
  { roman: 'XIX', name: 'SUN' },
  { roman: 'XX', name: 'JUDGEMENT' },
  { roman: 'XXI', name: 'WORLD' },
];

function drawTarotWoodcut(s: PixelSurface, ox: number, oy: number, idx: number): void {
  const meta = TAROT_META[idx]!;
  const c = new PixelSurface(CARD_W, CARD_H);

  // Outer antique rounded border & double-ruled cream margin
  c.roundedRect(1, 1, 69, 93, 4, T_C0, T_INK);
  c.roundedRect(3, 3, 65, 89, 3, T_C1, T_C2);
  // Crisp inner artwork window frame (x:7..63, y:10..81)
  c.rect(6, 9, 59, 73, T_INK);
  c.rect(7, 10, 57, 71, T_C0);

  // Base Bayer-dithered sky/woodcut backdrop tailored per Tarot
  const wx = 7;
  const wy = 10;
  const ww = 57;
  const wh = 71;
  const darkSky = idx === 9 || idx === 15 || idx === 16 || idx === 17 || idx === 18;
  const radiantSky = idx === 6 || idx === 19 || idx === 20 || idx === 21;

  for (let py = 0; py < wh; py++) {
    for (let px = 0; px < ww; px++) {
      let t = 1 - (py / wh) * 0.55;
      if (darkSky) {
        t = 0.14 + (py / wh) * 0.28;
      } else if (radiantSky) {
        const dx = px - 28;
        const dy = py - 20;
        const ang = Math.atan2(dy, dx);
        const ray = Math.sin(ang * 12) > 0 ? 0.88 : 0.55;
        t = ray - Math.hypot(dx, dy) * 0.005;
      } else {
        t = 0.84 - (py / wh) * 0.42;
      }
      c.px(wx + px, wy + py, ditherRamp(wx + px, wy + py, t, T_RAMP));
    }
  }

  const cx = 35;
  const cy = 46;

  // Bespoke 4-tone woodcut centerpiece illustration for EVERY SINGLE Tarot!
  switch (idx) {
    case 0: // 0 The Fool — striding traveler with staff & knapsack on cliff beneath sun
      c.circle(53, 18, 6, T_C0, T_C2);
      c.poly([[7, 80], [7, 56], [24, 62], [44, 66], [63, 76], [63, 80]], T_C3, T_INK);
      // Staff over shoulder + bundle
      c.line(14, 34, 52, 22, T_INK, 2);
      c.circle(51, 27, 5, T_C1, T_INK);
      c.circle(51, 26, 2, T_C0);
      // Traveler silhouette in tunic & feathered cap
      c.circle(32, 27, 5, T_C0, T_INK);
      c.poly([[27, 24], [38, 22], [35, 17]], T_C2, T_INK);
      c.poly([[25, 33], [39, 33], [43, 55], [22, 55]], T_C3, T_INK);
      c.line(28, 55, 21, 71, T_INK, 3);
      c.line(37, 55, 45, 70, T_INK, 3);
      c.line(25, 38, 16, 44, T_C0, 2);
      c.line(39, 37, 48, 34, T_C0, 2);
      break;

    case 1: // I The Magician — cloaked figure raising glowing wand under infinity lemniscate
      // Infinity lemniscate above head
      c.ring(cx - 5, 17, 4, 2, T_INK);
      c.ring(cx + 5, 17, 4, 2, T_INK);
      // Cloaked figure
      c.circle(cx, 28, 5, T_C0, T_INK);
      c.poly([[22, 74], [25, 35], [45, 35], [49, 74]], T_C2, T_INK);
      c.poly([[29, 35], [41, 35], [44, 74], [27, 74]], T_C0);
      // Raised wand arm + bright magic sparkle
      c.line(25, 40, 17, 25, T_INK, 3);
      c.line(17, 15, 17, 30, T_C0, 2);
      c.sparkle(17, 16, T_C0, 4);
      // Altar table at bottom
      c.rect(12, 71, 47, 9, T_C3);
      c.rect(12, 71, 47, 2, T_C0);
      break;

    case 2: // II The High Priestess — seated veiled sage between dark & light pillars
      c.rect(9, 13, 9, 67, T_C3);
      c.rectOutline(9, 13, 9, 67, T_INK);
      c.rect(53, 13, 9, 67, T_C0);
      c.rectOutline(53, 13, 9, 67, T_INK);
      // Horned lunar crown + flowing veil & robe
      c.poly([[25, 22], [35, 26], [45, 22], [41, 29], [29, 29]], T_C0, T_INK);
      c.circle(cx, 22, 4, T_C0, T_INK);
      c.poly([[20, 79], [25, 32], [45, 32], [51, 79]], T_C0, T_INK);
      c.poly([[29, 35], [41, 35], [44, 75], [27, 75]], T_C1);
      // Sacred cross on chest
      c.rect(cx - 1, 40, 3, 11, T_INK);
      c.rect(cx - 4, 43, 9, 3, T_INK);
      break;

    case 3: // III The Empress — crowned empress with scepter & flowing gown
      c.poly([[27, 23], [30, 16], [35, 20], [40, 16], [43, 23]], T_C0, T_INK);
      c.circle(cx, 28, 5, T_C0, T_INK);
      c.poly([[16, 78], [23, 35], [47, 35], [55, 78]], T_C0, T_INK);
      c.poly([[22, 48], [48, 48], [53, 78], [18, 78]], T_C1);
      // Scepter in right hand + heart shield
      c.line(18, 22, 22, 65, T_INK, 2);
      c.circle(18, 20, 4, T_C0, T_INK);
      c.circle(48, 66, 7, T_C2, T_INK);
      c.sparkle(25, 14, T_C0, 2);
      c.sparkle(46, 14, T_C0, 2);
      break;

    case 4: // IV The Emperor — enthroned bearded monarch with orb & scepter
      // Stone throne back
      c.rect(14, 24, 43, 55, T_C2);
      c.rectOutline(14, 24, 43, 55, T_INK);
      c.circle(16, 26, 4, T_C1, T_INK);
      c.circle(54, 26, 4, T_C1, T_INK);
      // Crowned bearded figure
      c.poly([[28, 24], [30, 17], [35, 20], [40, 17], [42, 24]], T_C0, T_INK);
      c.circle(cx, 28, 5, T_C0, T_INK);
      c.poly([[30, 31], [40, 31], [35, 40]], T_C0, T_INK); // beard
      c.poly([[21, 77], [24, 37], [46, 37], [50, 77]], T_C1, T_INK);
      c.line(18, 35, 18, 60, T_INK, 2);
      c.circle(18, 33, 4, T_C0, T_INK);
      c.circle(51, 45, 4, T_C0, T_INK);
      break;

    case 5: // V The Hierophant — mitred sage with triple-cross staff & twin columns
      c.rect(10, 12, 7, 68, T_C2);
      c.rect(54, 12, 7, 68, T_C2);
      // Tall triple-tiered mitre
      c.poly([[28, 29], [31, 14], [35, 11], [39, 14], [42, 29]], T_C0, T_INK);
      c.line(30, 21, 40, 21, T_INK);
      c.line(29, 25, 41, 25, T_INK);
      c.circle(cx, 33, 5, T_C0, T_INK);
      c.poly([[19, 77], [24, 40], [46, 40], [52, 77]], T_C1, T_INK);
      c.rect(cx - 2, 40, 5, 36, T_C0);
      // Triple-barred pastoral cross staff
      c.line(50, 20, 50, 66, T_INK, 2);
      c.line(46, 24, 54, 24, T_INK, 2);
      c.line(45, 29, 55, 29, T_INK, 2);
      c.line(47, 34, 53, 34, T_INK, 2);
      break;

    case 6: // VI The Lovers — radiant sun & winged figure over twin figures & mountain
      c.circle(cx, 18, 8, T_C0, T_C2);
      // Central mountain peak
      c.poly([[18, 79], [35, 46], [52, 79]], T_C2, T_INK);
      // Cloud bank
      c.circle(28, 36, 6, T_C0);
      c.circle(35, 34, 7, T_C0);
      c.circle(42, 36, 6, T_C0);
      // Left & right figures
      c.circle(18, 46, 4, T_C0, T_INK);
      c.poly([[12, 79], [14, 51], [22, 51], [24, 79]], T_C0, T_INK);
      c.circle(52, 46, 4, T_C0, T_INK);
      c.poly([[46, 79], [48, 51], [56, 51], [58, 79]], T_C0, T_INK);
      break;

    case 7: // VII The Chariot — armored hero in chariot box with twin wheels & canopy
      // Starry canopy top
      c.rect(12, 12, 47, 10, T_C3);
      for (let x = 16; x <= 54; x += 9) c.sparkle(x, 17, T_C0, 1);
      // Pillars & armored charioteer
      c.rect(14, 22, 3, 28, T_C2);
      c.rect(54, 22, 3, 28, T_C2);
      c.circle(cx, 31, 5, T_C0, T_INK);
      c.poly([[25, 49], [28, 36], [42, 36], [45, 49]], T_C1, T_INK);
      // Chariot shield box + wheels
      c.rect(17, 49, 37, 21, T_C0);
      c.rectOutline(17, 49, 37, 21, T_INK);
      c.circle(cx, 59, 6, T_C2, T_INK);
      c.circle(14, 67, 8, T_C3, T_INK);
      c.circle(14, 67, 4, T_C1);
      c.circle(56, 67, 8, T_C3, T_INK);
      c.circle(56, 67, 4, T_C1);
      break;

    case 8: // VIII Justice — seated crowned judge with upright sword & balanced scales
      c.rect(15, 15, 41, 56, T_C2);
      c.rectOutline(15, 15, 41, 56, T_INK);
      c.circle(cx, 28, 5, T_C0, T_INK);
      c.rect(30, 21, 11, 3, T_C0);
      c.poly([[20, 78], [26, 35], [44, 35], [50, 78]], T_C3, T_INK);
      // Upright sword in left hand
      c.rect(15, 16, 3, 35, T_C0);
      c.rectOutline(14, 15, 5, 37, T_INK);
      c.rect(11, 46, 11, 3, T_C1);
      // Balanced golden scales on right
      c.line(47, 47, 61, 47, T_INK, 2);
      c.line(54, 42, 54, 49, T_INK, 2);
      c.poly([[45, 58], [49, 48], [53, 58]], T_C0, T_INK);
      c.poly([[55, 58], [59, 48], [63, 58]], T_C0, T_INK);
      break;

    case 9: // IX The Hermit — hooded wanderer holding blazing star lantern
      c.poly([[7, 80], [7, 66], [35, 62], [63, 72], [63, 80]], T_C2, T_INK);
      // Hooded cloak & tall staff
      c.poly([[26, 78], [30, 26], [42, 20], [50, 26], [53, 78]], T_C2, T_INK);
      c.poly([[32, 26], [40, 26], [42, 34], [32, 34]], T_C3);
      c.line(31, 20, 31, 78, T_INK, 2);
      // Blazing star lantern in outstretched hand!
      c.line(31, 38, 19, 34, T_C1, 3);
      c.rect(14, 28, 10, 13, T_C0);
      c.rectOutline(14, 28, 10, 13, T_INK);
      c.sparkle(19, 34, T_C0, 7);
      c.sparkle(19, 34, T_C1, 4);
      break;

    case 10: // X Wheel of Fortune — grand 8-spoked cosmic wheel with corner glyphs
      c.circle(cx, cy, 22, T_C0, T_INK);
      c.circle(cx, cy, 18, T_C3, T_INK);
      c.circle(cx, cy, 15, T_C2);
      c.circle(cx, cy, 5, T_C0, T_INK);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        c.line(cx, cy, Math.round(cx + Math.cos(a) * 18), Math.round(cy + Math.sin(a) * 18), T_C0, 1);
      }
      // 4 corner elemental medallions
      c.circle(14, 17, 4, T_C0, T_INK);
      c.circle(56, 17, 4, T_C0, T_INK);
      c.circle(14, 73, 4, T_C0, T_INK);
      c.circle(56, 73, 4, T_C0, T_INK);
      break;

    case 11: // XI Strength — robed figure gently calming a muscular lion
      c.ring(25, 16, 3, 2, T_INK);
      c.ring(31, 16, 3, 2, T_INK);
      // Standing figure leaning over lion
      c.circle(24, 28, 5, T_C0, T_INK);
      c.poly([[14, 78], [17, 35], [31, 35], [34, 78]], T_C0, T_INK);
      // Muscular lion silhouette
      c.ellipse(44, 58, 13, 9, T_C3, T_INK);
      c.circle(34, 51, 7, T_C2, T_INK);
      c.circle(32, 50, 4, T_C1);
      c.rect(34, 65, 4, 13, T_C3);
      c.rect(50, 65, 4, 13, T_C3);
      c.line(56, 54, 60, 44, T_INK, 2);
      break;

    case 12: // XII The Hanged Man — inverted haloed figure suspended from wooden T-beam
      // T-beam wooden gallows
      c.rect(12, 16, 47, 5, T_C3);
      c.rectOutline(12, 16, 47, 5, T_INK);
      c.rect(34, 21, 3, 18, T_INK);
      // Inverted figure legs, torso & glowing haloed head
      c.line(35, 22, 35, 42, T_C0, 4);
      c.line(35, 36, 45, 42, T_C0, 3);
      c.poly([[27, 42], [43, 42], [40, 61], [30, 61]], T_C2, T_INK);
      // Radiant golden halo around head at bottom!
      c.circle(cx, 69, 9, T_C0, T_C2);
      c.circle(cx, 69, 5, T_C1, T_INK);
      break;

    case 13: // XIII Death — armored rider on pale steed bearing dark rose-banner
      // Pale horse silhouette
      c.poly([[12, 77], [16, 52], [32, 46], [46, 52], [48, 77], [42, 77], [40, 60], [23, 60], [18, 77]], T_C0, T_INK);
      c.poly([[39, 50], [49, 36], [56, 41], [48, 52]], T_C0, T_INK);
      // Cloaked dark rider
      c.circle(26, 30, 5, T_C3, T_INK);
      c.poly([[18, 50], [21, 36], [33, 36], [36, 50]], T_C3, T_INK);
      // Dark banner with white 5-petal rose
      c.line(33, 15, 33, 52, T_INK, 2);
      c.rect(34, 15, 22, 16, T_INK);
      c.circle(45, 23, 5, T_C0);
      c.circle(45, 23, 2, T_C2);
      break;

    case 14: // XIV Temperance — winged angel pouring glowing stream between two cups
      // Graceful arched feathered wings
      c.poly([[10, 26], [19, 22], [28, 36], [23, 55], [12, 48], [9, 36]], T_C2, T_INK);
      c.line(12, 34, 24, 40, T_C0);
      c.line(12, 41, 22, 46, T_C0);
      c.poly([[60, 26], [51, 22], [42, 36], [47, 55], [58, 48], [61, 36]], T_C2, T_INK);
      c.line(58, 34, 46, 40, T_C0);
      c.line(58, 41, 48, 46, T_C0);
      // Haloed angel in flowing cream robe
      c.circle(cx, 25, 8, T_C0, T_C2);
      c.circle(cx, 25, 4.5, T_C1, T_INK);
      c.poly([[23, 78], [28, 32], [42, 32], [48, 78]], T_C0, T_INK);
      c.poly([[31, 34], [39, 34], [42, 76], [29, 76]], T_C1);
      // Twin golden chalices + luminous diagonal water stream!
      c.poly([[19, 43], [27, 43], [25, 51], [21, 51]], T_C2, T_INK);
      c.poly([[43, 55], [51, 55], [49, 63], [45, 63]], T_C2, T_INK);
      c.line(25, 48, 44, 57, T_C0, 3);
      c.line(25, 47, 44, 56, T_C2, 1);
      break;

    case 15: // XV The Devil — horned winged fiend on pedestal over twin figures
      // Bat wings
      c.poly([[9, 25], [27, 36], [22, 51], [11, 44]], T_C2, T_INK);
      c.poly([[61, 25], [43, 36], [48, 51], [59, 44]], T_C2, T_INK);
      // Horned head + muscular torso
      c.poly([[26, 22], [30, 15], [32, 24]], T_C0, T_INK);
      c.poly([[44, 22], [40, 15], [38, 24]], T_C0, T_INK);
      c.circle(cx, 28, 6, T_C2, T_INK);
      c.px(cx - 2, 27, T_C0);
      c.px(cx + 2, 27, T_C0);
      c.poly([[24, 56], [27, 34], [43, 34], [46, 56]], T_C2, T_INK);
      // Pedestal + twin tiny silhouetted figures below
      c.rect(20, 57, 31, 22, T_C3);
      c.rectOutline(20, 57, 31, 22, T_INK);
      c.circle(14, 63, 3, T_C0);
      c.rect(12, 67, 5, 12, T_C0);
      c.circle(56, 63, 3, T_C0);
      c.rect(54, 67, 5, 12, T_C0);
      break;

    case 16: // XVI The Tower — stone spire struck by jagged white lightning bolt!
      // Tall stone spire
      c.poly([[24, 80], [27, 28], [43, 28], [46, 80]], T_C0, T_INK);
      for (let y = 34; y < 78; y += 7) c.line(26, y, 44, y, T_C2);
      c.rect(32, 42, 6, 8, T_INK);
      c.rect(32, 58, 6, 8, T_INK);
      // Crown blasting off top
      c.poly([[26, 25], [28, 17], [35, 21], [41, 16], [45, 24]], T_C1, T_INK);
      // Blazing jagged white lightning from top-right
      c.line(62, 12, 49, 20, T_C0, 3);
      c.line(49, 20, 53, 24, T_C0, 3);
      c.line(53, 24, 38, 30, T_C0, 3);
      // Falling sparks/figures
      c.sparkle(16, 42, T_C0, 3);
      c.sparkle(55, 50, T_C0, 3);
      c.poly([[12, 58], [20, 52], [22, 64]], T_C0);
      c.poly([[52, 60], [58, 56], [56, 70]], T_C0);
      break;

    case 17: // XVII The Star — huge blazing 8-point white star over pool & kneeling figure
      c.poly([[7, 80], [7, 66], [63, 66], [63, 80]], T_C1, T_INK);
      // Blazing huge 8-point central star
      c.poly([[cx, 13], [cx + 4, 29], [cx + 18, 33], [cx + 4, 37], [cx, 53], [cx - 4, 37], [cx - 18, 33], [cx - 4, 29]], T_C0, T_INK);
      c.line(cx - 10, 23, cx + 10, 43, T_C0, 2);
      c.line(cx + 10, 23, cx - 10, 43, T_C0, 2);
      // 7 companion stars
      for (const [sx, sy] of [[14, 19], [56, 19], [12, 42], [58, 42], [18, 54], [52, 54], [24, 15]] as const) {
        c.sparkle(sx, sy, T_C0, 2);
      }
      // Kneeling silhouette pouring water into pool
      c.circle(35, 59, 4, T_C0, T_INK);
      c.poly([[23, 78], [30, 63], [44, 65], [48, 78]], T_C0, T_INK);
      break;

    case 18: // XVIII The Moon — giant cratered moon between twin towers over winding path
      c.circle(cx, 32, 16, T_C0, T_INK);
      c.circle(cx - 4, 28, 4, T_C1);
      c.circle(cx + 5, 36, 5, T_C1);
      c.circle(cx + 2, 24, 2, T_C2);
      // Rolling dark hills + winding bright path
      c.poly([[7, 80], [7, 56], [28, 62], [42, 62], [63, 56], [63, 80]], T_C2, T_INK);
      c.poly([[26, 80], [33, 61], [37, 61], [45, 80]], T_C0);
      // Twin distant stone towers
      c.rect(10, 44, 8, 20, T_C3);
      c.rectOutline(10, 44, 8, 20, T_INK);
      c.rect(53, 44, 8, 20, T_C3);
      c.rectOutline(53, 44, 8, 20, T_INK);
      break;

    case 19: // XIX The Sun — radiant blazing sun with smiling disc over joyful figure
      c.circle(cx, 31, 14, T_C0, T_INK);
      c.circle(cx, 31, 10, T_C1);
      c.circle(cx, 31, 6, T_C0);
      // Joyful figure & sunflowers below
      c.rect(7, 66, 57, 14, T_C2);
      c.circle(cx - 4, 53, 4, T_C0, T_INK);
      c.poly([[25, 76], [29, 58], [39, 58], [43, 76]], T_C0, T_INK);
      c.line(29, 61, 18, 52, T_C0, 2);
      c.line(39, 61, 52, 50, T_C0, 2);
      c.circle(14, 65, 4, T_C0, T_INK);
      c.circle(55, 65, 4, T_C0, T_INK);
      break;

    case 20: // XX Judgement — trumpet from heavens awakening rising silhouettes
      // Radiant cloud & golden horn at top
      c.circle(35, 22, 10, T_C0, T_C2);
      c.poly([[32, 24], [38, 24], [47, 52], [35, 55]], T_C0, T_INK);
      c.line(36, 46, 44, 44, T_C2);
      // Rising silhouettes with outstretched arms along bottom
      for (const rx of [16, 28, 42, 54]) {
        c.circle(rx, 61, 3, T_C3);
        c.rect(rx - 2, 65, 5, 14, T_C3);
        c.line(rx - 2, 67, rx - 6, 61, T_C3, 2);
        c.line(rx + 2, 67, rx + 6, 61, T_C3, 2);
      }
      break;

    case 21: // XXI The World — dancing figure framed by grand laurel wreath & 4 corners
      // Grand oval laurel wreath
      c.ellipse(cx, cy, 20, 26, T_C2, T_INK);
      c.ellipse(cx, cy, 14, 20, T_C1, T_INK);
      // Dancing luminous figure inside wreath
      c.circle(cx, 33, 4, T_C0, T_INK);
      c.poly([[30, 56], [32, 38], [39, 38], [41, 56]], T_C0, T_INK);
      c.line(32, 41, 24, 48, T_C0, 2);
      c.line(39, 41, 46, 35, T_C0, 2);
      c.line(33, 56, 29, 64, T_C0, 2);
      c.line(38, 56, 42, 62, T_C0, 2);
      // 4 corner emblems
      c.circle(13, 17, 5, T_C0, T_INK);
      c.circle(57, 17, 5, T_C0, T_INK);
      c.circle(13, 74, 5, T_C0, T_INK);
      c.circle(57, 74, 5, T_C0, T_INK);
      break;
  }

  // Top Roman Numeral Plaque (cut neatly over top frame edge)
  const romW = Math.max(13, meta.roman.length * 4 + 7);
  c.roundedRect(cx - Math.floor(romW / 2), 3, romW, 9, 2, T_C0, T_INK);
  c.text3x5(meta.roman, cx, 5, T_INK, { align: 'center' });

  // Bottom Crisp Woodcut Nameplate Banner (full name, never truncated!)
  c.roundedRect(5, 81, 61, 10, 2, T_C0, T_INK);
  c.text3x5(meta.name, cx, 84, T_INK, { align: 'center', spacing: 1 });

  s.blit(c, ox, oy);
}

interface PlanetArtSpec {
  gx: number;
  gy: number;
  name: string;
  orbitIdx: number; // 0..8 highlights orbital telemetry dot
  radius: number;
  ramp: readonly RGBA[];
  feature:
    | 'craters'
    | 'venus'
    | 'earth'
    | 'mars'
    | 'jupiter'
    | 'saturn'
    | 'uranus'
    | 'neptune'
    | 'pluto'
    | 'eris'
    | 'ceres'
    | 'planet_x';
  handPips: number; // 1..5 lit card slots on bottom bar
  suitFlush?: boolean;
}

const PLANET_ART: readonly PlanetArtSpec[] = [
  {
    gx: 0, gy: 3, name: 'MERCURY', orbitIdx: 0, radius: 13,
    ramp: [hex('#75716b'), hex('#a8a399'), hex('#d6d1c7'), hex('#f5f2eb')],
    feature: 'craters', handPips: 2,
  },
  {
    gx: 1, gy: 3, name: 'VENUS', orbitIdx: 1, radius: 15,
    ramp: [hex('#b57d3b'), hex('#e0a95c'), hex('#f7d294'), hex('#fff0cf')],
    feature: 'venus', handPips: 3,
  },
  {
    gx: 2, gy: 3, name: 'EARTH', orbitIdx: 2, radius: 16,
    ramp: [hex('#1c4e8a'), hex('#2c78bf'), hex('#56a8e8'), hex('#b0e2ff')],
    feature: 'earth', handPips: 5,
  },
  {
    gx: 3, gy: 3, name: 'MARS', orbitIdx: 3, radius: 14,
    ramp: [hex('#7d2c1b'), hex('#bd4b2c'), hex('#e8784d'), hex('#ffb082')],
    feature: 'mars', handPips: 4,
  },
  {
    gx: 4, gy: 3, name: 'JUPITER', orbitIdx: 4, radius: 20,
    ramp: [hex('#8c4927'), hex('#c97a49'), hex('#e8b98a'), hex('#fff0d6')],
    feature: 'jupiter', handPips: 5, suitFlush: true,
  },
  {
    gx: 5, gy: 3, name: 'SATURN', orbitIdx: 5, radius: 14,
    ramp: [hex('#9c7d3b'), hex('#d4b15d'), hex('#f2d78c'), hex('#fff3c4')],
    feature: 'saturn', handPips: 5,
  },
  {
    gx: 6, gy: 3, name: 'URANUS', orbitIdx: 6, radius: 16,
    ramp: [hex('#5ba4b8'), hex('#8cd4e6'), hex('#bfeef7'), hex('#ebfcff')],
    feature: 'uranus', handPips: 4,
  },
  {
    gx: 7, gy: 3, name: 'NEPTUNE', orbitIdx: 7, radius: 16,
    ramp: [hex('#223c94'), hex('#3c62cc'), hex('#6390f2'), hex('#a8ccff')],
    feature: 'neptune', handPips: 5, suitFlush: true,
  },
  {
    gx: 8, gy: 3, name: 'PLUTO', orbitIdx: 8, radius: 12,
    ramp: [hex('#6e5c52'), hex('#a38c7c'), hex('#d9c5b2'), hex('#f7ece1')],
    feature: 'pluto', handPips: 1,
  },
  {
    gx: 3, gy: 2, name: 'ERIS', orbitIdx: 8, radius: 12,
    ramp: [hex('#7b8a91'), hex('#b0c0c7'), hex('#dce8ed'), hex('#f5fcff')],
    feature: 'eris', handPips: 5, suitFlush: true,
  },
  {
    gx: 8, gy: 2, name: 'CERES', orbitIdx: 4, radius: 13,
    ramp: [hex('#626d70'), hex('#8d999c'), hex('#bec7c9'), hex('#e8eff0')],
    feature: 'ceres', handPips: 5, suitFlush: true,
  },
  {
    gx: 9, gy: 2, name: 'PLANET X', orbitIdx: 8, radius: 16,
    ramp: [hex('#4a4938'), hex('#757359'), hex('#a6a382'), hex('#d4d0ad')],
    feature: 'planet_x', handPips: 5,
  },
];

function drawPlanetChartCard(s: PixelSurface, ox: number, oy: number, p: PlanetArtSpec): void {
  const c = new PixelSurface(CARD_W, CARD_H);
  const frameInk = hex('#2c525e');
  const outerRim = hex('#e8f6f8');
  const tealBg = hex('#5594a1');
  const tealDark = hex('#427c8a');
  const tealHi = hex('#74b4c2');

  // Retro Teal Astronomical Star-Chart Frame
  c.roundedRect(1, 1, 69, 93, 4, outerRim, frameInk);
  c.roundedRect(3, 3, 65, 89, 3, tealBg, frameInk);
  // Subtle Bayer-dithered darker edge vignette inside star chart
  for (let y = 5; y < 90; y++) {
    for (let x = 5; x < 66; x++) {
      const dist = Math.hypot((x - 35) / 30, (y - 50) / 42);
      if (dist > 0.72) {
        c.px(x, y, ditherRamp(x, y, Math.min(1, (dist - 0.72) * 2.5), [tealBg, tealDark]));
      }
    }
  }

  // Top Orbital Telemetry Bar (dotted orbital positions)
  c.rect(5, 11, 61, 1, tealHi);
  for (let i = 0; i < 9; i++) {
    const dx = 11 + i * 6;
    if (i === p.orbitIdx) {
      c.circle(dx, 7, 2.5, COL_WHITE, frameInk);
    } else if (i < 4) {
      c.rect(dx - 1, 6, 2, 2, hex('#bfe4eb'));
    } else {
      c.ring(dx, 7, 2, 1, hex('#a6d4de'));
    }
  }

  // Crisp White Pill Nameplate Banner (FULL planet name!)
  const pillW = Math.min(58, Math.max(38, p.name.length * 4 + 10));
  c.roundedRect(35 - Math.floor(pillW / 2), 14, pillW, 10, 4, hex('#f2fafc'), frameInk);
  c.text3x5(p.name, 35, 17, frameInk, { align: 'center' });

  // Twinkling retro cross stars & delicate grid ticks in star chart field
  for (let i = 0; i < 16; i++) {
    const sx = 8 + Math.floor(hash2i(p.gx * 17 + i, p.gy, 11) * 55);
    const sy = 27 + Math.floor(hash2i(p.gx * 17 + i, p.gy, 29) * 48);
    if (i % 6 === 0) c.sparkle(sx, sy, hex('#e8faff'), 2, COL_WHITE);
    else c.px(sx, sy, hex('#c4ebf2'));
  }

  const cx = 35;
  const cy = 51;

  // Back arc of Saturn / Uranus rings
  if (p.feature === 'saturn') {
    for (let dx = -27; dx <= 27; dx++) {
      const yBack = Math.round(cy - 2 - Math.sqrt(Math.max(0, 1 - (dx * dx) / 730)) * 4.2);
      if (Math.abs(dx) > p.radius - 2) {
        c.rect(cx + dx, yBack - 1, 1, 3, hex('#f7dfa1'));
        c.px(cx + dx, yBack - 2, frameInk);
      }
    }
  } else if (p.feature === 'uranus') {
    for (let dy = -23; dy <= 23; dy++) {
      const xRing = Math.round(cx + dy * 0.28);
      if (Math.abs(dy) > p.radius - 1) {
        c.px(xRing, cy + dy, hex('#e8fcff'));
        c.px(xRing + 1, cy + dy, frameInk);
      }
    }
  }

  // 3D Bayer-Dithered Planet Sphere with rich planetary surface features!
  c.shadedSphere(cx, cy, p.radius, p.ramp, {
    outline: frameInk,
    surfaceMod: (nx, ny, _nz, light, px, py) => {
      if (p.feature === 'jupiter') {
        const band = Math.sin(ny * 10.5 + fbm2D(nx * 3, ny * 5, 2, 4) * 1.4);
        const spotD = Math.hypot((nx + 0.35) * 1.4, (ny - 0.25) * 2.2);
        if (spotD < 0.28) return ditherRamp(px, py, light, [hex('#8c281b'), hex('#d94b34'), hex('#ff8a6b')]);
        const t = Math.max(0, Math.min(1, light * 0.72 + (band * 0.5 + 0.5) * 0.38));
        return ditherRamp(px, py, t, p.ramp);
      }
      if (p.feature === 'earth') {
        const land = fbm2D(nx * 2.8 + 4.2, ny * 2.8 + 1.9, 3, 23);
        const cloud = fbm2D(nx * 4.2 + 9.1, ny * 5.0 + 3.4, 2, 71);
        if (cloud > 0.67) return ditherRamp(px, py, light, [hex('#b5d4e3'), COL_WHITE]);
        if (land > 0.51) {
          return ditherRamp(px, py, light, [hex('#1f5934'), hex('#3e9453'), hex('#7ad47a'), hex('#c2f29b')]);
        }
        return ditherRamp(px, py, light, p.ramp);
      }
      if (p.feature === 'mars') {
        if (ny < -0.76) return ditherRamp(px, py, light, [hex('#cfdce3'), COL_WHITE]);
        const n = fbm2D(nx * 3.5 + 2.1, ny * 3.5 + 6.4, 3, 33);
        return ditherRamp(px, py, light * 0.75 + n * 0.3, p.ramp);
      }
      if (p.feature === 'venus') {
        const swirl = Math.sin(ny * 7.5 + nx * 2.4 + fbm2D(nx * 3, ny * 3, 2, 13) * 2.0);
        return ditherRamp(px, py, light * 0.78 + (swirl * 0.5 + 0.5) * 0.28, p.ramp);
      }
      if (p.feature === 'neptune') {
        const band = Math.sin(ny * 8.0 + nx * 0.8);
        return ditherRamp(px, py, light * 0.75 + (band * 0.5 + 0.5) * 0.3, p.ramp);
      }
      if (p.feature === 'pluto') {
        // Iconic pale Tombaugh heart basin!
        const hd = Math.hypot((nx - 0.1) * 2.2, (ny - 0.05) * 2.0);
        if (hd < 0.52) return ditherRamp(px, py, Math.min(1, light + 0.25), p.ramp);
        return null;
      }
      if (p.feature === 'craters' || p.feature === 'ceres' || p.feature === 'eris') {
        const n = fbm2D(nx * 4.5 + p.gx, ny * 4.5 + p.gy, 3, 91);
        return ditherRamp(px, py, light * 0.75 + (n - 0.5) * 0.45, p.ramp);
      }
      if (p.feature === 'planet_x') {
        // Fractured mysterious dark fissure split!
        if (nx > 0.22 && ny < 0.08 && nx - ny > 0.35) return tealBg;
        const n = fbm2D(nx * 4.0, ny * 4.0, 3, 92);
        return ditherRamp(px, py, light * 0.78 + (n - 0.5) * 0.35, p.ramp);
      }
      return null;
    },
  });

  // Extra planetary rings / moons / asteroid chunks
  if (p.feature === 'saturn') {
    for (let dx = -27; dx <= 27; dx++) {
      const yFront = Math.round(cy + 1 + Math.sqrt(Math.max(0, 1 - (dx * dx) / 730)) * 4.5);
      c.rect(cx + dx, yFront - 1, 1, 3, Math.abs(dx) % 5 === 0 ? hex('#d9b45b') : hex('#fff0b5'));
      c.px(cx + dx, yFront + 2, frameInk);
    }
  } else if (p.feature === 'earth') {
    c.shadedSphere(cx - 21, cy - 12, 3.5, [hex('#7b8a94'), hex('#cfdbe3'), COL_WHITE], { outline: frameInk });
  } else if (p.feature === 'eris') {
    c.shadedSphere(cx - 17, cy - 11, 2.8, [hex('#8fa3ad'), COL_WHITE], { outline: frameInk });
  } else if (p.feature === 'ceres') {
    // Orbiting asteroid belt rocks
    for (const [ax, ay, ar] of [
      [-19, -8, 2],
      [18, -12, 2],
      [-17, 13, 2],
      [20, 7, 2.5],
      [12, 18, 1.8],
    ] as const) {
      c.circle(cx + ax, cy + ay, ar, hex('#cfd9de'), frameInk);
    }
  } else if (p.feature === 'planet_x') {
    // Detached orbiting fragment chunk
    c.circle(cx + 15, cy - 11, 5, hex('#8c896a'), frameInk);
    c.circle(cx + 14, cy - 12, 2.5, hex('#bfb993'));
  }

  // Bottom Poker-Hand Card Pip Telemetry Slots (5 miniature card outlines!)
  c.rect(5, 76, 61, 1, tealHi);
  for (let i = 0; i < 5; i++) {
    const sx = 10 + i * 11;
    const active = i < p.handPips;
    const cardFill = active ? (p.suitFlush ? hex('#2f5966') : hex('#f2fafc')) : tealDark;
    c.roundedRect(sx, 79, 8, 10, 1, cardFill, frameInk);
    if (active) {
      c.px(sx + 3, 83, p.suitFlush ? hex('#96e2f2') : frameInk);
      c.px(sx + 4, 84, p.suitFlush ? hex('#96e2f2') : frameInk);
    }
  }

  s.blit(c, ox, oy);
}

interface SpectralArtSpec {
  gx: number;
  gy: number;
  kind:
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
  name: string;
}

const SPECTRAL_ART: readonly SpectralArtSpec[] = [
  { gx: 0, gy: 4, kind: 'familiar', name: 'FAMILIAR' },
  { gx: 1, gy: 4, kind: 'grim', name: 'GRIM' },
  { gx: 2, gy: 4, kind: 'incantation', name: 'INCANT' },
  { gx: 3, gy: 4, kind: 'talisman', name: 'TALISMAN' },
  { gx: 4, gy: 4, kind: 'aura', name: 'AURA' },
  { gx: 5, gy: 4, kind: 'wraith', name: 'WRAITH' },
  { gx: 6, gy: 4, kind: 'sigil', name: 'SIGIL' },
  { gx: 7, gy: 4, kind: 'ouija', name: 'OUIJA' },
  { gx: 8, gy: 4, kind: 'ectoplasm', name: 'ECTOPLASM' },
  { gx: 9, gy: 4, kind: 'immolate', name: 'IMMOLATE' },
  { gx: 0, gy: 5, kind: 'ankh', name: 'ANKH' },
  { gx: 1, gy: 5, kind: 'deja_vu', name: 'DEJA VU' },
  { gx: 2, gy: 5, kind: 'hex', name: 'HEX' },
  { gx: 3, gy: 5, kind: 'trance', name: 'TRANCE' },
  { gx: 4, gy: 5, kind: 'medium', name: 'MEDIUM' },
  { gx: 5, gy: 5, kind: 'cryptid', name: 'CRYPTID' },
  { gx: 2, gy: 2, kind: 'soul', name: 'SOUL' },
  { gx: 9, gy: 3, kind: 'black_hole', name: 'BLACK HOLE' },
];

function drawSpectralArtCard(s: PixelSurface, ox: number, oy: number, sp: SpectralArtSpec): void {
  const c = new PixelSurface(CARD_W, CARD_H);
  const ink = hex('#243059');
  const cobalt = hex('#3d5fb8');
  const indigo = hex('#293d7d');
  const peri = hex('#6e8bd9');
  const gold = hex('#d9bc4a');
  const cream = hex('#f7f6ee');

  // Crisp Spectral Frame (pale white outer edge, deep indigo border)
  c.roundedRect(1, 1, 69, 93, 4, cream, ink);
  c.roundedRect(4, 4, 63, 87, 3, indigo, ink);

  // Signature Swirling Cobalt, Indigo, Electric-Gold & Cream Marbled Backdrop!
  const marblePalette = [indigo, cobalt, peri, gold, cream, cobalt, indigo];
  const salt = sp.gx * 19 + sp.gy * 37 + 11;
  for (let y = 6; y < 82; y++) {
    for (let x = 6; x < 65; x++) {
      const nx = (x - 6) / 59;
      const ny = (y - 6) / 76;
      if (sp.kind === 'soul') {
        // Sweeping horizontal cosmic ribbons (clean center for floating Soul gem!)
        const wave = Math.sin(nx * 4.5 + ny * 11.5 + fbm2D(nx * 3.5, ny * 4.5, 3, 22) * 3.5);
        const idx = Math.floor(((wave * 0.5 + 0.5) * 0.99) * marblePalette.length);
        c.px(x, y, marblePalette[idx]!);
      } else if (sp.kind === 'black_hole') {
        const dx = x - 35;
        const dy = y - 47;
        const r = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const sw = Math.sin(r * 0.42 - ang * 2.0 + fbm2D(nx * 4, ny * 4, 2, 93) * 2.0);
        const idx = Math.floor(((sw * 0.5 + 0.5) * 0.99) * marblePalette.length);
        c.px(x, y, marblePalette[idx]!);
      } else {
        const m = swirlMarble(nx, ny, 3.0, 2.8, salt);
        const idx = Math.min(marblePalette.length - 1, Math.floor(m * marblePalette.length));
        c.px(x, y, marblePalette[idx]!);
      }
    }
  }

  const cx = 35;
  const cy = 44;

  // Bespoke High-Contrast Centerpiece Icon for EVERY Spectral!
  switch (sp.kind) {
    case 'familiar':
      // Hooded royal silhouette with golden crown & swirling aura
      c.poly([[18, 76], [24, 42], [46, 42], [52, 76]], indigo, cream);
      c.circle(cx, 35, 9, cream, ink);
      c.poly([[27, 27], [30, 19], [35, 24], [40, 19], [43, 27]], gold, ink);
      c.rect(28, 49, 15, 22, cobalt);
      c.line(23, 52, 47, 52, gold, 2);
      break;

    case 'grim':
      // Giant ominous dark Ace of Spades looming out of golden-white vortex
      c.suitPip('Spades', cx, cy + 2, 'xl', hex('#1f2847'), { outline: cream });
      c.sparkle(cx - 12, 22, gold, 3);
      c.sparkle(cx + 14, 65, cream, 3);
      break;

    case 'incantation':
      // Tumbling fan of glowing mini numbered cards in vortex!
      for (const [tx, ty, col] of [
        [24, 26, cream],
        [44, 30, cream],
        [20, 50, cream],
        [36, 46, cream],
        [48, 56, cream],
        [30, 66, cream],
      ] as const) {
        c.roundedRect(tx - 6, ty - 8, 12, 16, 1, col, ink);
        c.rect(tx - 2, ty - 2, 4, 4, cobalt);
      }
      break;

    case 'talisman':
      // Radiant golden starburst surrounding embossed jester medallion!
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        c.line(cx, cy, Math.round(cx + Math.cos(a) * 26), Math.round(cy + Math.sin(a) * 28), gold, 2);
      }
      c.circle(cx, cy, 15, gold, ink);
      c.circle(cx, cy, 11, cream, gold);
      c.circle(cx, cy, 7, gold);
      break;

    case 'aura':
      // Luminous white halo ring around a tiny rainbow-enhanced card!
      c.ring(cx, cy, 20, 18, cream);
      c.roundedRect(cx - 10, cy - 13, 20, 26, 2, cream, ink);
      c.rect(cx - 7, cy - 10, 14, 4, hex('#fe5f55'));
      c.rect(cx - 7, cy - 6, 14, 4, gold);
      c.rect(cx - 7, cy - 2, 14, 4, hex('#4bc292'));
      c.rect(cx - 7, cy + 2, 14, 4, hex('#009dff'));
      c.rect(cx - 7, cy + 6, 14, 4, hex('#b26cbb'));
      break;

    case 'wraith':
      // Grinning ghostly jester emerging from swirling mist!
      c.poly([[15, 34], [24, 15], [35, 29], [46, 15], [55, 34]], cobalt, cream);
      c.circle(14, 34, 3, gold, ink);
      c.circle(56, 34, 3, gold, ink);
      c.ellipse(cx, 44, 13, 14, cream, ink);
      c.rect(28, 39, 5, 3, cobalt);
      c.rect(38, 39, 5, 3, cobalt);
      c.poly([[25, 48], [35, 53], [45, 48], [35, 56]], cobalt);
      break;

    case 'sigil':
      // Four overlapping geometric suit quadrants in diamond formation
      c.circle(cx, 25, 11, hex('#b89d58'), ink);
      c.circle(cx - 9, 43, 10, cobalt, cream);
      c.circle(cx + 9, 43, 10, peri, cream);
      c.poly([[cx, 38], [cx + 13, 52], [cx, 66], [cx - 13, 52]], gold, ink);
      c.poly([[cx, 43], [cx + 8, 52], [cx, 60], [cx - 8, 52]], cream);
      break;

    case 'ouija':
      // Mystical dark spirit-board with glowing gold rank nodes & flames below
      c.rect(10, 10, 51, 66, indigo);
      for (let r = 0; r < 3; r++) {
        for (let k = 0; k < 3; k++) {
          c.circle(21 + k * 14, 24 + r * 14, 5, gold, ink);
          c.px(21 + k * 14, 24 + r * 14, indigo);
        }
      }
      for (let i = 0; i < 4; i++) {
        c.poly([[15 + i * 13, 74], [18 + i * 13, 62], [21 + i * 13, 74]], cream);
      }
      break;

    case 'ectoplasm':
      // Twin ritual candles releasing billowing white ghostly smoke!
      c.rect(14, 54, 10, 24, gold);
      c.rectOutline(14, 54, 10, 24, ink);
      c.rect(47, 54, 10, 24, cobalt);
      c.rectOutline(47, 54, 10, 24, ink);
      // Billowing white smoke plume
      c.circle(35, 46, 13, cream);
      c.circle(26, 33, 11, cream);
      c.circle(42, 26, 10, cream);
      c.circle(31, 18, 8, cream);
      c.circle(36, 46, 5, indigo);
      c.circle(28, 32, 4, cobalt);
      break;

    case 'immolate':
      // Blazing golden-white furnace flames devouring cards!
      c.poly([[12, 74], [15, 36], [24, 16], [35, 29], [46, 16], [56, 36], [58, 74]], cream, ink);
      c.poly([[17, 74], [21, 42], [35, 26], [49, 42], [53, 74]], gold);
      c.roundedRect(23, 45, 24, 24, 2, cobalt, cream);
      c.rect(26, 53, 18, 12, cream);
      break;

    case 'ankh':
      // Large gleaming white-and-gold Egyptian Ankh radiating cobalt rings!
      c.ring(cx, 30, 12, 7, cream);
      c.ring(cx, 30, 13, 12, ink);
      c.ring(cx, 30, 7, 6, ink);
      c.rect(cx - 16, 43, 33, 7, cream);
      c.rectOutline(cx - 16, 43, 33, 7, ink);
      c.rect(cx - 4, 41, 9, 34, cream);
      c.rectOutline(cx - 4, 41, 9, 34, ink);
      c.rect(cx - 2, 43, 5, 28, gold);
      break;

    case 'deja_vu':
      // Recursive crimson-gold echo wave spiral!
      c.circle(cx + 4, 34, 14, gold, ink);
      c.circle(cx + 4, 34, 9, cobalt);
      c.circle(cx - 6, 54, 12, cream, ink);
      c.circle(cx - 6, 54, 7, hex('#f05248'));
      c.line(18, 22, 52, 68, cream, 2);
      break;

    case 'hex':
      // Crisp geometric arcane golden diamond-and-square hexagram rune!
      c.poly([[cx, 12], [58, cy], [cx, 76], [12, cy]], gold, ink);
      c.poly([[cx, 18], [52, cy], [cx, 70], [18, cy]], indigo, cream);
      c.rectOutline(22, 31, 27, 27, gold, 2);
      c.rectOutline(27, 36, 17, 17, cream, 2);
      c.circle(cx, cy, 4, gold, ink);
      break;

    case 'trance':
      // Hypnotic golden-white logarithmic spiral vortex!
      for (let i = 0; i < 160; i++) {
        const t = i / 160;
        const ang = t * Math.PI * 7.5;
        const rad = t * 26;
        const sx = Math.round(cx + Math.cos(ang) * rad);
        const sy = Math.round(cy + Math.sin(ang) * rad);
        c.circle(sx, sy, 2, i % 2 === 0 ? gold : cream);
      }
      c.circle(cx, cy, 4, ink, cream);
      break;

    case 'medium':
      // Glowing golden pillar candle with leaping white spirit flame!
      c.rect(25, 42, 21, 38, gold);
      c.rectOutline(25, 42, 21, 38, ink);
      c.rect(28, 44, 5, 34, hex('#fff2a6'));
      // Side mini tapers
      c.rect(12, 62, 7, 18, cobalt);
      c.rect(52, 62, 7, 18, cobalt);
      // Tall flickering white spirit flame
      c.poly([[cx, 14], [cx + 8, 30], [cx + 4, 41], [cx - 4, 41], [cx - 8, 30]], cream, ink);
      c.poly([[cx, 22], [cx + 4, 34], [cx, 40], [cx - 4, 34]], indigo);
      break;

    case 'cryptid':
      // Eerie horned stag skull in cream-gold!
      // Branching white antlers
      c.line(28, 34, 15, 16, cream, 3);
      c.line(21, 24, 12, 27, cream, 2);
      c.line(24, 28, 23, 15, cream, 2);
      c.line(42, 34, 55, 16, cream, 3);
      c.line(49, 24, 58, 27, cream, 2);
      c.line(46, 28, 47, 15, cream, 2);
      // Stag skull
      c.poly([[25, 34], [45, 34], [42, 54], [35, 68], [28, 54]], gold, ink);
      c.poly([[28, 37], [42, 37], [39, 53], [35, 63], [31, 53]], cream);
      c.circle(30, 46, 3, ink);
      c.circle(40, 46, 3, ink);
      break;

    case 'soul':
      // Clean swirling vortex backdrop — floating crystal from centers(0,1) renders above!
      break;

    case 'black_hole':
      // Glowing golden accretion rings & pitch-black circular singularity!
      c.ring(cx, 51, 21, 18, gold);
      c.ring(cx, 51, 17, 15, cream);
      c.circle(cx, 51, 13, hex('#0c0f1c'), gold);
      c.sparkle(cx - 18, 34, cream, 2);
      c.sparkle(cx + 19, 68, gold, 2);
      // Top Black Hole header banner
      c.roundedRect(6, 11, 59, 10, 3, cream, ink);
      c.text3x5('BLACK HOLE', cx, 14, ink, { align: 'center' });
      s.blit(c, ox, oy);
      return;
  }

  // Crisp Bottom Nameplate Banner for Spectrals
  c.roundedRect(6, 80, 59, 10, 2, cream, ink);
  c.text3x5(sp.name, cx, 83, ink, { align: 'center' });
  c.px(9, 85, cobalt);
  c.px(61, 85, cobalt);

  s.blit(c, ox, oy);
}

function buildTarotsAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.Tarot;
  const surf = new PixelSurface(spec.cols * spec.cellW, spec.rows * spec.cellH);

  // 22 Woodcut Tarots (0..21)
  for (let i = 0; i < 22; i++) {
    const gx = i % 10;
    const gy = Math.floor(i / 10);
    drawTarotWoodcut(surf, gx * spec.cellW, gy * spec.cellH, i);
  }

  // 12 Astronomical Star-Chart Planets
  for (const p of PLANET_ART) {
    drawPlanetChartCard(surf, p.gx * spec.cellW, p.gy * spec.cellH, p);
  }

  // 18 Swirling Marbled Spectrals (incl. Soul at 2,2 and Black Hole at 9,3)
  for (const sp of SPECTRAL_ART) {
    drawSpectralArtCard(surf, sp.gx * spec.cellW, sp.gy * spec.cellH, sp);
  }

  // Utility cells in Row 2:
  // (4,2) Locked card
  drawLockedOverlay(surf, 4 * spec.cellW, 2 * spec.cellH, hex('#b9c6d6'), hex('#a5b3c4'));
  // (5,2) Blank neutral card back
  {
    const c = new PixelSurface(CARD_W, CARD_H);
    c.roundedRect(1, 1, 69, 93, 4, hex('#e4ebf2'), hex('#9aa8b8'));
    c.roundedRect(5, 5, 61, 85, 3, hex('#c2cedb'));
    surf.blit(c, 5 * spec.cellW, 2 * spec.cellH);
  }
  // (6,2) Blank Tarot template
  {
    const c = new PixelSurface(CARD_W, CARD_H);
    c.roundedRect(1, 1, 69, 93, 4, T_C0, T_C2);
    c.roundedRect(4, 4, 63, 87, 3, hex('#f0dbb0'));
    surf.blit(c, 6 * spec.cellW, 2 * spec.cellH);
  }
  // (7,2) Blank Planet template
  {
    const c = new PixelSurface(CARD_W, CARD_H);
    c.roundedRect(1, 1, 69, 93, 4, hex('#e8f6f8'), hex('#6b9ba6'));
    c.roundedRect(4, 4, 63, 87, 3, hex('#b0d4dc'));
    surf.blit(c, 7 * spec.cellW, 2 * spec.cellH);
  }

  // Remaining spare slots (6..9, 5)
  for (let gx = 6; gx < 10; gx++) {
    drawSpectralArtCard(surf, gx * spec.cellW, 5 * spec.cellH, {
      gx,
      gy: 5,
      kind: 'sigil',
      name: 'ARCANE',
    });
  }

  return surf.toCanvas();
}

// ---------------------------------------------------------------------------
// 4. Voucher Atlas (`Voucher`, 9x4 @ 71x95)
// Authentic top-and-bottom-notched ticket stubs with `VOUCHER` header strips,
// Tier-1 white headers & Tier-2 charcoal glowing-bar upgrades for all 32 vouchers.
// ---------------------------------------------------------------------------

interface VoucherSpec {
  gx: number;
  gy: number;
  tier2: boolean;
  bgLeft: RGBA;
  bgRight: RGBA;
  barCol: RGBA;
  kind:
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
}

const VOUCHER_SPECS: readonly VoucherSpec[] = [
  // Top pairs (rows 0 & 1)
  { gx: 0, gy: 0, tier2: false, bgLeft: hex('#d94b43'), bgRight: hex('#bd3b35'), barCol: hex('#ffe047'), kind: 'overstock' },
  { gx: 0, gy: 1, tier2: true, bgLeft: hex('#d94b43'), bgRight: hex('#bd3b35'), barCol: hex('#ffe047'), kind: 'overstock' },
  { gx: 1, gy: 0, tier2: false, bgLeft: hex('#e0a819'), bgRight: hex('#c48e10'), barCol: hex('#c76eff'), kind: 'tarot' },
  { gx: 1, gy: 1, tier2: true, bgLeft: hex('#e0a819'), bgRight: hex('#c48e10'), barCol: hex('#c76eff'), kind: 'tarot' },
  { gx: 2, gy: 0, tier2: false, bgLeft: hex('#6155db'), bgRight: hex('#4e43bf'), barCol: hex('#73e8ff'), kind: 'planet' },
  { gx: 2, gy: 1, tier2: true, bgLeft: hex('#6155db'), bgRight: hex('#4e43bf'), barCol: hex('#73e8ff'), kind: 'planet' },
  { gx: 3, gy: 0, tier2: false, bgLeft: hex('#5b7a7d'), bgRight: hex('#486569'), barCol: hex('#78f0b8'), kind: 'clearance' },
  { gx: 3, gy: 1, tier2: true, bgLeft: hex('#5b7a7d'), bgRight: hex('#486569'), barCol: hex('#78f0b8'), kind: 'clearance' },
  { gx: 4, gy: 0, tier2: false, bgLeft: hex('#b53d50'), bgRight: hex('#962d3e'), barCol: hex('#40bfff'), kind: 'hone' },
  { gx: 4, gy: 1, tier2: true, bgLeft: hex('#b53d50'), bgRight: hex('#962d3e'), barCol: hex('#40bfff'), kind: 'hone' },
  { gx: 5, gy: 0, tier2: false, bgLeft: hex('#0098ff'), bgRight: hex('#0082e0'), barCol: hex('#ffad33'), kind: 'grabber' },
  { gx: 5, gy: 1, tier2: true, bgLeft: hex('#0098ff'), bgRight: hex('#0082e0'), barCol: hex('#ffad33'), kind: 'grabber' },
  { gx: 6, gy: 0, tier2: false, bgLeft: hex('#cf3f38'), bgRight: hex('#b33029'), barCol: hex('#75f0ba'), kind: 'wasteful' },
  { gx: 6, gy: 1, tier2: true, bgLeft: hex('#cf3f38'), bgRight: hex('#b33029'), barCol: hex('#75f0ba'), kind: 'wasteful' },
  { gx: 7, gy: 0, tier2: false, bgLeft: hex('#d1ebf2'), bgRight: hex('#c2e0e8'), barCol: hex('#d96eff'), kind: 'blank' },
  { gx: 7, gy: 1, tier2: true, bgLeft: hex('#3c4a4d'), bgRight: hex('#2e3a3d'), barCol: hex('#d96eff'), kind: 'blank' },
  // Bottom pairs (rows 2 & 3)
  { gx: 0, gy: 2, tier2: false, bgLeft: hex('#298c5f'), bgRight: hex('#1f734c'), barCol: hex('#ff82e0'), kind: 'reroll' },
  { gx: 0, gy: 3, tier2: true, bgLeft: hex('#298c5f'), bgRight: hex('#1f734c'), barCol: hex('#ff82e0'), kind: 'reroll' },
  { gx: 1, gy: 2, tier2: false, bgLeft: hex('#227b94'), bgRight: hex('#1a647a'), barCol: hex('#6ee6ff'), kind: 'seed' },
  { gx: 1, gy: 3, tier2: true, bgLeft: hex('#227b94'), bgRight: hex('#1a647a'), barCol: hex('#6ee6ff'), kind: 'seed' },
  { gx: 2, gy: 2, tier2: false, bgLeft: hex('#9a52e0'), bgRight: hex('#823ec7'), barCol: hex('#ffb840'), kind: 'crystal' },
  { gx: 2, gy: 3, tier2: true, bgLeft: hex('#9a52e0'), bgRight: hex('#823ec7'), barCol: hex('#ffb840'), kind: 'crystal' },
  { gx: 3, gy: 2, tier2: false, bgLeft: hex('#378c8c'), bgRight: hex('#2c7575'), barCol: hex('#ffe066'), kind: 'telescope' },
  { gx: 3, gy: 3, tier2: true, bgLeft: hex('#304d69'), bgRight: hex('#243d54'), barCol: hex('#ffe066'), kind: 'telescope' },
  { gx: 4, gy: 2, tier2: false, bgLeft: hex('#3b7391'), bgRight: hex('#2f5f7a'), barCol: hex('#ffe047'), kind: 'magic' },
  { gx: 4, gy: 3, tier2: true, bgLeft: hex('#cc483b'), bgRight: hex('#ad362b'), barCol: hex('#ffe047'), kind: 'magic' },
  { gx: 5, gy: 2, tier2: false, bgLeft: hex('#b59775'), bgRight: hex('#9e8160'), barCol: hex('#ffcf54'), kind: 'hieroglyph' },
  { gx: 5, gy: 3, tier2: true, bgLeft: hex('#967a5c'), bgRight: hex('#7d6348'), barCol: hex('#ffcf54'), kind: 'hieroglyph' },
  { gx: 6, gy: 2, tier2: false, bgLeft: hex('#eb5c34'), bgRight: hex('#d14824'), barCol: hex('#73f059'), kind: 'director' },
  { gx: 6, gy: 3, tier2: true, bgLeft: hex('#eb5c34'), bgRight: hex('#d14824'), barCol: hex('#73f059'), kind: 'director' },
  { gx: 7, gy: 2, tier2: false, bgLeft: hex('#61bab5'), bgRight: hex('#4ea19c'), barCol: hex('#ffad47'), kind: 'brush' },
  { gx: 7, gy: 3, tier2: true, bgLeft: hex('#61bab5'), bgRight: hex('#4ea19c'), barCol: hex('#ffad47'), kind: 'brush' },
];

function drawVoucherTicketShell(
  c: PixelSurface,
  bgLeft: RGBA,
  bgRight: RGBA,
  tier2: boolean,
  barCol: RGBA,
  isBlank: boolean
): void {
  const rim = isBlank ? hex('#a7ccd4') : hex('#445259');
  const headFill = tier2 ? hex('#4b575e') : hex('#f5f8fa');
  const headText = isBlank ? hex('#96b7bf') : tier2 ? COL_WHITE : hex('#445259');

  // Outer notched ticket silhouette
  c.roundedRect(2, 1, 67, 93, 3, COL_WHITE, rim);
  // Top header block (y: 2..16)
  c.rect(4, 3, 63, 13, headFill);
  // Subtle diagonal split body (y: 18..91)
  for (let y = 18; y <= 91; y++) {
    for (let x = 4; x <= 66; x++) {
      c.px(x, y, x < 35 ? bgLeft : bgRight);
    }
  }
  c.rectOutline(4, 18, 63, 74, COL_WHITE, 1);

  // Tier-2 glowing horizontal accent energy stripe behind header text
  if (tier2) {
    c.rect(7, 11, 57, 3, barCol);
    c.rect(14, 12, 43, 1, COL_WHITE);
  }
  // Crisp VOUCHER header text
  c.text3x5('VOUCHER', 35, 9, headText, { align: 'center', outline: tier2 ? hex('#262e33') : undefined });

  // Cut semicircular top-center & bottom-center ticket notches!
  for (let dy = 0; dy <= 5; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      const d = Math.hypot(dx, dy);
      if (d <= 4.1) {
        c.rawPx(35 + dx, 1 + dy, 0, 0, 0, 0);
        c.rawPx(35 + dx, 93 - dy, 0, 0, 0, 0);
      } else if (d <= 5.2) {
        c.px(35 + dx, 1 + dy, rim);
        c.px(35 + dx, 93 - dy, rim);
      }
    }
  }
  // Side perforation pinch ticks at header junction (y=16..17)
  c.rawPx(2, 17, 0, 0, 0, 0);
  c.rawPx(68, 17, 0, 0, 0, 0);
  c.px(3, 17, rim);
  c.px(67, 17, rim);
}

function drawVoucherArtwork(c: PixelSurface, v: VoucherSpec): void {
  const cx = 35;
  const cy = 54;
  const ink = COL_INK;
  const gold = hex('#ffd54f');

  switch (v.kind) {
    case 'overstock':
      // Dashed card slot + bold plus (Tier 2: crackling golden energy!)
      for (let x = 16; x <= 54; x += 4) {
        c.rect(x, 26, 2, 2, COL_WHITE);
        c.rect(x, 80, 2, 2, COL_WHITE);
      }
      for (let y = 26; y <= 80; y += 4) {
        c.rect(16, y, 2, 2, COL_WHITE);
        c.rect(53, y, 2, 2, COL_WHITE);
      }
      if (v.tier2) {
        for (const [lx, ly] of [[12, 32], [58, 34], [12, 74], [58, 72], [22, 42], [48, 66]] as const) {
          c.line(cx, cy, lx, ly, gold, 1);
        }
        c.rect(cx - 4, cy - 11, 9, 23, gold);
        c.rect(cx - 11, cy - 4, 23, 9, gold);
      }
      c.rect(cx - 2, cy - 8, 5, 17, hex('#fe5f55'));
      c.rect(cx - 8, cy - 2, 17, 5, hex('#fe5f55'));
      c.rectOutline(cx - 3, cy - 9, 7, 19, COL_WHITE);
      c.rectOutline(cx - 9, cy - 3, 19, 7, COL_WHITE);
      break;

    case 'tarot':
    case 'planet': {
      const isPlanet = v.kind === 'planet';
      if (v.tier2) {
        const spark = isPlanet ? hex('#82f0ff') : hex('#e08cff');
        for (let i = 0; i < 10; i++) {
          const a = (i * Math.PI) / 5;
          c.line(cx, cy, Math.round(cx + Math.cos(a) * 28), Math.round(cy + Math.sin(a) * 32), spark, 1);
        }
      }
      c.roundedRect(18, 28, 35, 52, 3, isPlanet ? hex('#6b9ba6') : hex('#d9b473'), COL_WHITE);
      c.roundedRect(20, 30, 31, 48, 2, isPlanet ? hex('#4e7e8a') : hex('#b88d48'));
      if (v.tier2) {
        for (const ay of [38, 53, 68]) {
          c.poly([[cx, ay - 6], [cx + 7, ay + 1], [cx - 7, ay + 1]], COL_WHITE, ink);
          c.rect(cx - 2, ay + 1, 5, 5, COL_WHITE);
        }
      } else {
        c.poly([[cx, cy - 9], [cx + 8, cy], [cx - 8, cy]], COL_WHITE, ink);
        c.rect(cx - 3, cy, 7, 9, COL_WHITE);
      }
      break;
    }

    case 'clearance': {
      // Sculpted smooth golden '$' down-arrow (Tier 2: triple arrows & bright glow!)
      const dollarGrid: readonly string[] = [
        '....111....',
        '....111....',
        '.111111111.',
        '11111111111',
        '111.....111',
        '11111111...',
        '.111111111.',
        '....1111111',
        '111.....111',
        '11111111111',
        '.111111111.',
        '....111....',
        '....111....',
      ];
      if (v.tier2) {
        for (const sx of [15, 55]) {
          c.rect(sx - 2, 42, 5, 19, gold);
          c.poly([[sx, 69], [sx + 6, 60], [sx - 6, 60]], gold, COL_WHITE);
          c.sparkle(sx, 31, hex('#96ffd6'), 3, COL_WHITE);
        }
      } else {
        c.text5x7('$', 15, 49, gold, 1, { align: 'center', outline: ink });
        c.text5x7('$', 55, 49, gold, 1, { align: 'center', outline: ink });
      }
      c.sprite(dollarGrid, { '1': gold }, cx, 47, 2, { outline: COL_WHITE });
      c.poly([[cx, 79], [cx + 9, 67], [cx - 9, 67]], gold, COL_WHITE);
      break;
    }

    case 'hone':
      // Mini card with crisp iridescent jester-crest emblem (Tier 2: swirling polychrome burst!)
      c.roundedRect(17, 28, 37, 51, 3, hex('#e8eef5'), ink);
      if (v.tier2) {
        const rb = [hex('#fe5f55'), hex('#009dff'), hex('#4bc292'), hex('#fda200')];
        for (let y = 30; y < 77; y++) {
          for (let x = 19; x < 52; x++) {
            const band = Math.floor((x + y + Math.sin(y * 0.25) * 6) / 11) & 3;
            c.px(x, y, rb[band]!);
          }
        }
      }
      // Chromatic red/cyan offset halo behind crisp white jester bust!
      drawMiniJesterSilhouette(c, cx - 2, cy, hex('#fe5f55'));
      drawMiniJesterSilhouette(c, cx + 2, cy, hex('#009dff'));
      drawMiniJesterSilhouette(c, cx, cy, COL_WHITE);
      break;

    case 'grabber':
      if (!v.tier2) {
        // Bold reaching shaded blue palm & 5 fingers!
        const palm = hex('#4cbdff');
        const hi = hex('#9ce0ff');
        const sh = hex('#1966b8');
        c.circle(cx, 62, 13, palm, COL_WHITE);
        for (const [fx, fy, fh] of [[21, 34, 24], [27, 27, 28], [34, 24, 30], [41, 28, 27], [49, 44, 18]] as const) {
          c.roundedRect(fx, fy, 6, fh, 3, palm, COL_WHITE);
          c.rect(fx + 1, fy + 2, 2, fh - 5, hi);
        }
        c.rect(25, 68, 21, 12, sh);
      } else {
        // Nacho Tong: articulated blue fingers pinching a golden nacho with cheesy drips inside border!
        c.poly([[18, 76], [35, 49], [52, 76]], hex('#ffd452'), COL_WHITE);
        c.circle(32, 66, 2, hex('#cc3b2b'));
        c.circle(40, 69, 2, hex('#4bc292'));
        c.circle(35, 60, 1.5, hex('#cc3b2b'));
        // Melted orange cheese drips cleanly clamped inside bottom border (y <= 89)!
        for (const [dx, dy, dh] of [[22, 73, 15], [33, 75, 13], [44, 72, 16], [15, 78, 10], [53, 76, 12]] as const) {
          c.roundedRect(dx, dy, 4, dh, 2, hex('#ff8c1a'), hex('#cc5e00'));
          c.rect(dx + 1, dy + 1, 1, Math.max(2, dh - 4), hex('#ffe066'));
        }
        // Articulated pinching blue hand descending from above
        const hand = hex('#4cbdff');
        const handHi = hex('#9ce0ff');
        c.poly([[18, 35], [30, 25], [47, 28], [52, 39], [42, 43], [26, 40]], hand, COL_WHITE);
        c.rect(28, 28, 14, 3, handHi);
        c.poly([[23, 39], [31, 39], [34, 51], [27, 52]], hand, ink);
        c.poly([[41, 39], [49, 38], [43, 51], [37, 50]], hand, ink);
      }
      break;

    case 'wasteful': {
      // Trash / Recycling bin + playing cards!
      const binCol = v.tier2 ? hex('#2e8ee6') : hex('#4d9468');
      const binDark = v.tier2 ? hex('#1a5ea3') : hex('#336947');
      c.poly([[18, 45], [52, 45], [47, 81], [23, 81]], binCol, COL_WHITE);
      c.rect(24, 52, 3, 24, binDark);
      c.rect(34, 52, 3, 24, binDark);
      c.rect(44, 52, 3, 24, binDark);
      c.roundedRect(14, 41, 43, 7, 3, hex('#64747d'), COL_WHITE);
      // Card above bin
      c.roundedRect(30, 22, 12, 17, 1, COL_WHITE, ink);
      c.rect(32, 24, 8, 13, hex('#fe5f55'));
      if (v.tier2) {
        // Recycling triangles + extra flying cards!
        c.roundedRect(16, 25, 10, 14, 1, COL_WHITE, ink);
        c.roundedRect(46, 23, 10, 14, 1, COL_WHITE, ink);
        c.ring(cx, 63, 7, 4, COL_WHITE);
      }
      break;
    }

    case 'blank':
      if (v.tier2) {
        // Antimatter: eerie swirling violet & mint-cyan wisps in dark void!
        const wispA = hex('#c470e8');
        const wispB = hex('#7bf0c8');
        for (let i = 0; i < 60; i++) {
          const t = i / 60;
          const x1 = Math.round(cx + Math.sin(t * 7.5) * 14);
          const y1 = Math.round(24 + t * 62);
          c.circle(x1, y1, 3 + Math.sin(t * Math.PI) * 3, wispA);
          const x2 = Math.round(cx - Math.sin(t * 6.2 + 1.4) * 13);
          const y2 = Math.round(26 + t * 58);
          c.circle(x2, y2, 2.5 + Math.sin(t * Math.PI) * 2.5, wispB);
        }
        c.sparkle(18, 34, COL_WHITE, 2);
        c.sparkle(52, 70, wispB, 2);
      }
      break;

    case 'reroll': {
      // Twin circular reroll arrows (Tier 2: electric pink sparks & glow!)
      const arrowCol = hex('#9ef5d4');
      c.ring(cx, cy, 18, 11, arrowCol);
      c.ring(cx, cy, 19, 18, ink);
      c.ring(cx, cy, 11, 10, ink);
      // Break top-right & bottom-left with arrow tips
      c.rect(cx - 3, cy - 20, 6, 12, v.bgLeft);
      c.rect(cx - 3, cy + 9, 6, 12, v.bgRight);
      c.poly([[cx + 10, cy - 14], [cx - 2, cy - 21], [cx - 2, cy - 7]], arrowCol, ink);
      c.poly([[cx - 10, cy + 14], [cx + 2, cy + 7], [cx + 2, cy + 21]], arrowCol, ink);
      if (v.tier2) {
        for (const [sx, sy] of [[15, 32], [55, 34], [14, 74], [56, 72]] as const) {
          c.sparkle(sx, sy, hex('#ff8ce0'), 4, COL_WHITE);
        }
      }
      break;
    }

    case 'seed':
      if (!v.tier2) {
        // Golden seed sprouting a gleaming gold coin!
        c.ellipse(cx, 79, 20, 6, hex('#5c4636'), ink);
        c.ellipse(34, 75, 9, 6, hex('#c79348'), ink);
        c.line(34, 70, 34, 46, hex('#61d48a'), 3);
        c.ellipse(27, 60, 5, 3, hex('#61d48a'), ink);
        c.circle(41, 41, 11, gold, ink);
        c.circle(41, 41, 8, hex('#ffe985'));
        c.text5x7('$', 41, 38, hex('#b57c16'), 1, { align: 'center' });
      } else {
        // Lush emerald Money Tree laden with glowing gold coins!
        c.rect(8, 76, 55, 14, hex('#d4a62a'));
        c.rect(30, 56, 11, 24, hex('#7d5232'));
        c.rectOutline(30, 56, 11, 24, ink);
        c.circle(cx, 42, 18, hex('#3ca364'), ink);
        c.circle(23, 47, 11, hex('#4ec27a'), ink);
        c.circle(47, 47, 11, hex('#4ec27a'), ink);
        c.circle(cx, 33, 12, hex('#67d98f'));
        for (const [gx, gy] of [[25, 42], [35, 32], [44, 41], [31, 49], [41, 51]] as const) {
          c.circle(gx, gy, 3.2, gold, ink);
        }
        c.sparkle(16, 28, hex('#96f0ff'), 2);
        c.sparkle(55, 29, hex('#96f0ff'), 2);
      }
      break;

    case 'crystal':
      // Glowing faceted crystal ball on dark pedestal (Tier 2: golden lightning!)
      c.poly([[24, 76], [46, 76], [49, 82], [21, 82]], v.tier2 ? gold : hex('#54626e'), ink);
      c.shadedSphere(cx, 51, 18, [hex('#46388c'), hex('#7566cc'), hex('#a8b8ff'), hex('#eef7ff')], {
        outline: COL_WHITE,
        specular: COL_WHITE,
      });
      if (v.tier2) {
        c.line(12, 34, 24, 44, gold, 2);
        c.line(58, 36, 46, 46, gold, 2);
        c.line(14, 68, 25, 60, gold, 2);
        c.line(57, 66, 45, 59, gold, 2);
        c.sparkle(18, 28, COL_WHITE, 3);
        c.sparkle(54, 74, gold, 3);
      }
      break;

    case 'telescope':
      if (!v.tier2) {
        // Starry purple cosmic sky funneling into blue telescope lens on tripod!
        c.poly([[10, 20], [60, 20], [43, 56], [27, 56]], hex('#29334d'), COL_WHITE);
        for (const [sx, sy] of [[22, 28], [46, 26], [34, 38], [28, 46], [42, 42]] as const) {
          c.sparkle(sx, sy, hex('#ffe999'), 1);
        }
        c.circle(cx, 62, 11, hex('#8fd8ff'), COL_WHITE);
        c.circle(cx, 62, 7, hex('#3ca4e8'));
        c.line(28, 72, 18, 88, hex('#dce6ed'), 3);
        c.line(42, 72, 52, 88, hex('#dce6ed'), 3);
        c.line(35, 73, 35, 89, hex('#95a8b8'), 2);
      } else {
        // Grand white Observatory dome beneath starry night sky!
        for (const [sx, sy] of [[14, 26], [32, 24], [52, 30], [22, 42], [47, 40]] as const) {
          c.sparkle(sx, sy, hex('#ffe999'), 2, COL_WHITE);
        }
        c.ellipse(cx, 84, 26, 8, COL_WHITE, ink);
        c.roundedRect(14, 56, 43, 26, 12, hex('#dce6f0'), ink);
        c.rect(26, 53, 19, 24, hex('#d9a441'));
        c.circle(cx, 56, 8, hex('#70d6ff'), gold);
      }
      break;

    case 'magic':
      // Magician's black top hat with levitating playing card (Tier 2: blazing light pillar!)
      if (v.tier2) {
        c.poly([[27, 66], [35, 19], [43, 66]], hex('#ffe066'));
        c.poly([[31, 66], [35, 22], [39, 66]], COL_WHITE);
      }
      // Top hat
      c.ellipse(cx, 62, 20, 6, hex('#37424a'), COL_WHITE);
      c.poly([[23, 62], [47, 62], [45, 83], [25, 83]], hex('#2b333a'), COL_WHITE);
      c.rect(24, 72, 23, 4, v.tier2 ? gold : hex('#596973'));
      // Levitating mini card above hat
      c.roundedRect(28, 30, 15, 21, 2, COL_WHITE, ink);
      c.suitPip('Hearts', cx, 40, 'sm', hex('#fe5f55'));
      break;

    case 'hieroglyph':
      if (!v.tier2) {
        // Sandstone carved glyphs + glowing golden Eye of Horus!
        for (let y = 24; y < 86; y += 12) {
          c.line(8, y, 62, y, hex('#8c7051'));
        }
        c.ellipse(cx, 48, 15, 8, gold, ink);
        c.circle(cx, 48, 5, COL_WHITE, ink);
        c.circle(cx, 48, 2.5, ink);
        c.line(cx, 56, cx, 67, ink, 2);
        c.line(cx + 4, 56, cx + 11, 64, ink, 2);
      } else {
        // Petroglyph ancient golden cave-art hunter & horned beast!
        c.line(18, 72, 28, 56, gold, 3);
        c.circle(28, 51, 4, gold);
        c.line(25, 58, 41, 49, COL_WHITE, 2); // spear
        c.ellipse(49, 54, 11, 7, gold, hex('#5c4529'));
        c.line(43, 60, 41, 72, gold, 2);
        c.line(54, 60, 56, 72, gold, 2);
        c.line(42, 47, 38, 40, gold, 2);
        c.line(46, 47, 45, 39, gold, 2);
      }
      break;

    case 'director': {
      // Tilted retro dark-grey VHS cassette (Tier 2: cracked & oozing neon-green Retcon energy!)
      if (v.tier2) {
        c.circle(22, 62, 13, hex('#73db3d'));
        c.circle(50, 72, 11, hex('#73db3d'));
        c.circle(44, 34, 9, hex('#73db3d'));
      }
      c.poly(
        [
          [26, 26],
          [55, 39],
          [41, 82],
          [12, 69],
        ],
        hex('#4d5961'),
        COL_WHITE
      );
      c.poly(
        [
          [29, 36],
          [46, 44],
          [37, 70],
          [20, 62],
        ],
        hex('#dce6f0'),
        ink
      );
      c.circle(36, 46, 4, hex('#37424a'));
      c.circle(29, 60, 4, hex('#37424a'));
      if (v.tier2) {
        c.line(22, 46, 48, 60, hex('#73db3d'), 3);
      }
      break;
    }

    case 'brush':
      if (!v.tier2) {
        // Diagonal wooden artist paintbrush dripping vivid cerulean paint!
        c.line(14, 79, 43, 47, hex('#9c683b'), 7);
        c.line(14, 79, 43, 47, hex('#c48c58'), 3);
        c.line(38, 52, 46, 43, hex('#dce6f0'), 7);
        c.circle(49, 39, 9, hex('#1a98f0'), COL_WHITE);
        c.circle(46, 36, 4, hex('#73d4ff'));
        c.circle(32, 39, 3, hex('#1a98f0'), COL_WHITE);
      } else {
        // Wooden Artist's Palette covered in colorful paint dabs!
        c.ellipse(cx, 58, 22, 20, hex('#b88754'), COL_WHITE);
        c.circle(26, 66, 5, v.bgLeft, ink); // thumb hole
        c.circle(26, 46, 4, hex('#fe5f55'), ink);
        c.circle(38, 43, 4, hex('#fda200'), ink);
        c.circle(48, 50, 4, hex('#ffe047'), ink);
        c.circle(47, 63, 4, hex('#4bc292'), ink);
        c.circle(36, 70, 4, hex('#009dff'), ink);
        c.line(15, 29, 30, 53, hex('#8c5a32'), 3);
        c.circle(15, 29, 4, hex('#009dff'), COL_WHITE);
      }
      break;
  }
}

function buildVouchersAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.Voucher;
  const surf = new PixelSurface(spec.cols * spec.cellW, spec.rows * spec.cellH);

  for (const v of VOUCHER_SPECS) {
    const c = new PixelSurface(CARD_W, CARD_H);
    const isBlank = v.kind === 'blank' && !v.tier2;
    drawVoucherTicketShell(c, v.bgLeft, v.bgRight, v.tier2, v.barCol, isBlank);
    drawVoucherArtwork(c, v);
    surf.blit(c, v.gx * spec.cellW, v.gy * spec.cellH);
  }

  // Column 8 utility vouchers: (8,2) Blank silhouette, (8,3) Locked chained voucher
  {
    const blank = new PixelSurface(CARD_W, CARD_H);
    blank.roundedRect(2, 1, 67, 93, 3, hex('#d4dde8'), hex('#9aa8b8'));
    for (let dy = 0; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        if (Math.hypot(dx, dy) <= 4.1) {
          blank.rawPx(35 + dx, 1 + dy, 0, 0, 0, 0);
          blank.rawPx(35 + dx, 93 - dy, 0, 0, 0, 0);
        }
      }
    }
    surf.blit(blank, 8 * spec.cellW, 2 * spec.cellH);
    drawLockedOverlay(surf, 8 * spec.cellW, 3 * spec.cellH, hex('#c4d0de'), hex('#b0bdd0'));
  }

  return surf.toCanvas();
}

// ---------------------------------------------------------------------------
// 5. Booster Pack Atlas (`Booster`, 4x9 @ 71x95)
// Glossy crimped-foil booster wrappers with serrated metallic top/bottom flaps,
// vibrant palettes, and Normal -> JUMBO -> MEGA escalating flair across 32 packs!
// ---------------------------------------------------------------------------

interface BoosterCellInfo {
  kind: 'Arcana' | 'Celestial' | 'Spectral' | 'Standard' | 'Buffoon' | 'Blank';
  size: 'Normal' | 'Jumbo' | 'Mega';
  variant: number;
}

function getBoosterCell(gx: number, gy: number): BoosterCellInfo {
  switch (gy) {
    case 0:
      return { kind: 'Arcana', size: 'Normal', variant: gx };
    case 1:
      return { kind: 'Celestial', size: 'Normal', variant: gx };
    case 2:
      return { kind: 'Arcana', size: gx < 2 ? 'Jumbo' : 'Mega', variant: gx };
    case 3:
      return { kind: 'Celestial', size: gx < 2 ? 'Jumbo' : 'Mega', variant: gx };
    case 4:
      return { kind: 'Spectral', size: gx < 2 ? 'Normal' : gx === 2 ? 'Jumbo' : 'Mega', variant: gx };
    case 6:
      return { kind: 'Standard', size: 'Normal', variant: gx };
    case 7:
      return { kind: 'Standard', size: gx < 2 ? 'Jumbo' : 'Mega', variant: gx };
    case 8:
      return { kind: 'Buffoon', size: gx < 2 ? 'Normal' : gx === 2 ? 'Jumbo' : 'Mega', variant: gx };
    default:
      return { kind: 'Blank', size: 'Normal', variant: gx };
  }
}

function drawBoosterWrapper(c: PixelSurface, topCol: RGBA, botCol: RGBA, isMega: boolean): void {
  const foilHi = isMega ? hex('#ffffff') : hex('#edf3f8');
  const foilMid = hex('#c9d5e2');
  const foilSh = hex('#8e9fae');

  // Top & Bottom serrated crimped foil flaps (y: 0..8 and y: 86..94)
  for (let x = 2; x <= 68; x++) {
    const ridge = (x % 3 === 0) ? foilSh : (x % 3 === 1) ? foilHi : foilMid;
    const saw = x % 4 === 0 ? 1 : 0;
    for (let y = saw; y < 9; y++) c.px(x, y, y === 8 ? foilSh : ridge);
    for (let y = 86; y < 95 - saw; y++) c.px(x, y, y === 86 ? foilSh : ridge);
  }
  // Main glossy foil packet body (x: 2..68, y: 9..85)
  c.ditherGradRect(3, 9, 65, 77, [topCol, mixRgba(topCol, botCol, 0.5), botCol], 'v');
  // Metallic side edges + top/bottom crimp crease shadows
  c.rect(2, 9, 2, 77, shadeRgba(topCol, 0.55));
  c.rect(67, 9, 2, 77, shadeRgba(botCol, 0.55));
  c.rect(4, 9, 63, 2, hex('#000000', 55));
  c.rect(4, 84, 63, 2, hex('#000000', 65));
  // Vertical foil sheen reflection strip along left shoulder
  c.rect(6, 11, 3, 72, hex('#ffffff', 45));
}

function drawBoosterArt(c: PixelSurface, cell: BoosterCellInfo): void {
  const cx = 35;
  const ink = COL_INK;

  if (cell.kind === 'Blank') {
    if (cell.variant === 0) {
      drawBoosterWrapper(c, hex('#bcc7d4'), hex('#a8b4c2'), false);
    }
    return;
  }

  const isMega = cell.size === 'Mega';
  const isJumbo = cell.size === 'Jumbo';

  if (cell.kind === 'Arcana') {
    const palettes: ReadonlyArray<[RGBA, RGBA, RGBA]> = isMega
      ? [
          [hex('#7a6bb8'), hex('#3d2f6e'), hex('#d9d4ff')],
          [hex('#5cb8b0'), hex('#29666b'), hex('#c7fff5')],
          [hex('#8c78c7'), hex('#3c2d6e'), hex('#e6deff')],
          [hex('#4fa8a6'), hex('#225c61'), hex('#bff5f0')],
        ]
      : isJumbo
        ? [
            [hex('#7864c9'), hex('#3c297d'), hex('#e8d9ff')],
            [hex('#5eb8d4'), hex('#286285'), hex('#d9f6ff')],
            [hex('#7864c9'), hex('#3c297d'), hex('#e8d9ff')],
            [hex('#5eb8d4'), hex('#286285'), hex('#d9f6ff')],
          ]
        : [
            [hex('#7a59d4'), hex('#4e3099'), hex('#b099ff')],
            [hex('#c27d70'), hex('#7d4354'), hex('#ffd6c2')],
            [hex('#52b0b8'), hex('#2d6b7d'), hex('#a8f0e6')],
            [hex('#cc5c9e'), hex('#7a2b6b'), hex('#ffc2e8')],
          ];
    const [top, bot, glow] = palettes[cell.variant % 4]!;
    drawBoosterWrapper(c, top, bot, isMega);
    // Mystical geometric archway + distinct tarot woodblock figure per variant & tier!
    c.ellipse(cx, 44, 22, 24, shadeRgba(bot, 0.72), glow);
    if (isMega && cell.variant % 2 === 0) {
      // Mega Tower struck by lightning!
      c.poly([[27, 65], [29, 29], [41, 29], [43, 65]], glow, ink);
      c.rect(33, 38, 5, 7, bot);
      c.line(58, 25, 42, 33, COL_WHITE, 3);
      c.sparkle(20, 38, hex('#ffe066'), 3, COL_WHITE);
    } else if (isMega) {
      // Mega Hermit with glowing star-lantern!
      c.poly([[26, 66], [30, 30], [43, 27], [49, 66]], glow, ink);
      c.line(29, 28, 29, 65, ink, 2);
      c.rect(16, 36, 9, 11, hex('#ffe066'));
      c.sparkle(20, 41, COL_WHITE, 6);
    } else if (cell.variant % 4 === 0) {
      // Striding Fool traveler with knapsack staff
      c.line(14, 42, 54, 25, COL_WHITE, 2);
      c.circle(52, 30, 5, hex('#ffe066'), ink);
      c.circle(34, 30, 5, COL_WHITE, ink);
      c.poly([[25, 62], [28, 37], [40, 37], [44, 62]], glow, ink);
    } else if (cell.variant % 4 === 1) {
      // Crowned Empress / Emperor with scepter
      c.poly([[27, 28], [31, 20], [35, 25], [39, 20], [43, 28]], hex('#ffe066'), ink);
      c.circle(cx, 34, 5.5, COL_WHITE, ink);
      c.poly([[19, 63], [24, 41], [46, 41], [51, 63]], glow, ink);
      c.line(19, 28, 22, 60, hex('#ffe066'), 2);
    } else if (cell.variant % 4 === 2) {
      // Mitred Hierophant with triple cross
      c.poly([[29, 32], [35, 19], [41, 32]], COL_WHITE, ink);
      c.poly([[21, 63], [25, 35], [45, 35], [49, 63]], glow, ink);
      c.line(50, 24, 50, 58, COL_WHITE, 2);
      c.line(46, 29, 54, 29, COL_WHITE, 2);
      c.line(46, 35, 54, 35, COL_WHITE, 2);
    } else {
      // Radiant Strength / Star emblem
      c.poly([[cx, 20], [cx + 4, 33], [cx + 16, 37], [cx + 4, 41], [cx, 54], [cx - 4, 41], [cx - 16, 37], [cx - 4, 33]], COL_WHITE, ink);
      c.sparkle(18, 28, hex('#ffe066'), 3);
      c.sparkle(53, 50, hex('#ffe066'), 3);
    }
    // Crisp golden ARCANA banner + dark violet PACK pill (high contrast!)
    c.poly([[3, 60], [67, 55], [67, 70], [3, 75]], hex('#f7c948'), ink);
    c.text5x7('ARCANA', cx, 59, COL_WHITE, 1, { align: 'center', outline: hex('#432473') });
    c.roundedRect(36, 70, 26, 9, 2, hex('#432473'), COL_WHITE);
    c.text3x5('PACK', 49, 72, COL_WHITE, { align: 'center' });
  } else if (cell.kind === 'Celestial') {
    const palettes: ReadonlyArray<[RGBA, RGBA, readonly RGBA[]]> = isMega
      ? [
          [hex('#634354'), hex('#33202e'), [hex('#b86b7a'), hex('#f5b8c2'), hex('#fff0f2')]],
          [hex('#365e78'), hex('#1a3347'), [hex('#66a8cc'), hex('#b8ebff'), hex('#f2fcff')]],
          [hex('#6e404a'), hex('#361d24'), [hex('#c77378'), hex('#ffbfb8'), hex('#fff2ed')]],
          [hex('#2f5978'), hex('#162e45'), [hex('#59a4d4'), hex('#b0e6ff'), hex('#f0fbff')]],
        ]
      : isJumbo
        ? [
            [hex('#5c5280'), hex('#2d2547'), [hex('#6e5c94'), hex('#a894cc'), hex('#e6dcff')]],
            [hex('#856854'), hex('#453226'), [hex('#9e7459'), hex('#e0b999'), hex('#fff2e0')]],
            [hex('#5c5280'), hex('#2d2547'), [hex('#6e5c94'), hex('#a894cc'), hex('#e6dcff')]],
            [hex('#856854'), hex('#453226'), [hex('#9e7459'), hex('#e0b999'), hex('#fff2e0')]],
          ]
        : [
            [hex('#2c6678'), hex('#19384a'), [hex('#708a99'), hex('#b0cddb'), hex('#eef9ff')]],
            [hex('#7a436e'), hex('#3d2247'), [hex('#a85978'), hex('#e899b5'), hex('#ffe3f0')]],
            [hex('#2c6e63'), hex('#183d3d'), [hex('#347a63'), hex('#75d4a6'), hex('#d6ffeb')]],
            [hex('#3d427d'), hex('#1e224d'), [hex('#7582c4'), hex('#bcc4f2'), hex('#f0f2ff')]],
          ];
    const [top, bot, pRamp] = palettes[cell.variant % 4]!;
    drawBoosterWrapper(c, top, bot, isMega);
    for (let i = 0; i < 16; i++) {
      const sx = 6 + Math.floor(hash2i(i, cell.variant + (isMega ? 30 : 0), 101) * 58);
      const sy = 14 + Math.floor(hash2i(i, cell.variant + (isJumbo ? 15 : 0), 109) * 44);
      c.px(sx, sy, hex('#e8fbff'));
    }
    if (isMega) {
      c.ring(cx, 43, 27, 24, shadeRgba(top, 1.38));
      c.ring(cx, 43, 22, 19, shadeRgba(bot, 0.72));
    }
    c.shadedSphere(cx, 41, isMega ? 15 : 15, pRamp, { outline: COL_WHITE, specular: COL_WHITE });
    if (cell.variant % 2 === 1 || (isMega && cell.variant === 2)) {
      c.line(9, 44, 61, 38, hex('#ffe8a6'), 2);
      c.line(11, 45, 59, 40, COL_WHITE, 1);
    }
    c.rect(3, 57, 65, 19, hex('#1a2840', 220));
    c.rect(3, 56, 65, 1, hex('#70e0ff'));
    c.rect(3, 76, 65, 1, hex('#70e0ff'));
    c.text3x5('CELESTIAL', cx, 60, hex('#8cf0ff'), { align: 'center', outline: ink });
    c.text3x5('PACK', cx, 69, COL_WHITE, { align: 'center' });
  } else if (cell.kind === 'Spectral') {
    drawBoosterWrapper(c, hex('#294085'), hex('#1b2654'), isMega);
    const swPal = [hex('#243266'), hex('#3d5fb8'), hex('#d9bc4a'), hex('#f7f6ee')];
    for (let y = 11; y < 84; y++) {
      for (let x = 4; x < 67; x++) {
        const m = swirlMarble(x / 71, y / 95, 3.3, 3.0, 44 + cell.variant * 13);
        c.px(x, y, swPal[Math.min(3, Math.floor(m * 4))]!);
      }
    }
    if (isMega) {
      c.line(25, 36, 13, 22, COL_WHITE, 3);
      c.line(45, 36, 57, 22, COL_WHITE, 3);
      c.poly([[24, 34], [46, 34], [40, 56], [35, 62], [30, 56]], COL_WHITE, ink);
      c.circle(30, 44, 3, ink);
      c.circle(40, 44, 3, ink);
    } else if (isJumbo) {
      c.roundedRect(14, 34, 15, 20, 2, COL_WHITE, ink);
      c.roundedRect(41, 44, 15, 20, 2, COL_WHITE, ink);
    }
    c.roundedRect(8, 49, 55, 11, 3, hex('#f7cf48'), ink);
    c.text3x5('SPECTRAL', cx, 52, ink, { align: 'center' });
    c.ellipse(cx, 70, 19, 8, hex('#2e52b8'), COL_WHITE);
    c.text3x5('PACK', cx, 68, COL_WHITE, { align: 'center' });
  } else if (cell.kind === 'Standard') {
    const palettes: ReadonlyArray<[RGBA, RGBA]> = [
      [hex('#ff9494'), hex('#ff9c1a')],
      [hex('#8ce8e0'), hex('#366be6')],
      [hex('#ff75db'), hex('#ff2e4d')],
      [hex('#d6ed66'), hex('#29d440')],
    ];
    const [top, bot] = isMega
      ? cell.variant % 2 === 0
        ? [hex('#a64b4b'), hex('#4d3b85')]
        : [hex('#66a64b'), hex('#9e4038')]
      : isJumbo
        ? cell.variant % 2 === 0
          ? [hex('#4575d4'), hex('#3d9e94')]
          : [hex('#c766d4'), hex('#5c52b8')]
        : palettes[cell.variant % 4]!;
    drawBoosterWrapper(c, top, bot, isMega);
    for (let y = 12; y < 82; y += 7) {
      for (let x = 6; x < 64; x += 7) {
        if (isMega) {
          c.rect(x, 11, 3, 72, hex('#ffffff', 28));
        } else {
          c.circle(x + ((y / 7) % 2) * 3, y, 2.3, hex('#ffffff', 42));
        }
      }
    }
    // Bold crisp white-outlined STANDARD PACK typography directly on vibrant foil!
    c.text5x7('STANDARD', cx, 39, COL_WHITE, 1, { align: 'center', outline: shadeRgba(bot, 0.32), shadow: ink });
    c.text5x7('PACK', cx, 53, COL_WHITE, 1, { align: 'center', outline: shadeRgba(bot, 0.32), shadow: ink });
  } else if (cell.kind === 'Buffoon') {
    if (cell.variant === 0) {
      // Stage-curtain crimson spotlight with comedic jester at microphone!
      drawBoosterWrapper(c, hex('#8c4e46'), hex('#592222'), false);
      c.poly([[14, 76], [35, 16], [56, 76]], hex('#d6453a'));
      // Comedian jester bust
      c.poly([[21, 65], [25, 38], [45, 38], [49, 65]], hex('#178be0'), ink);
      c.poly([[27, 38], [35, 46], [43, 38]], hex('#f5c94c'), ink);
      c.circle(cx, 28, 7.5, hex('#fff7eb'), ink);
      c.circle(cx - 5, 25, 4, hex('#ff9c33'), ink);
      c.circle(cx + 5, 25, 4, hex('#ff9c33'), ink);
      c.px(cx - 2, 27, ink);
      c.px(cx + 2, 27, ink);
      c.rect(cx - 2, 31, 5, 2, hex('#fe5f55'));
      // Microphone stand
      c.line(42, 46, 51, 32, hex('#dce6f0'), 2);
      c.circle(51, 31, 2.5, hex('#425059'), COL_WHITE);
    } else if (cell.variant === 1) {
      // Golden royal juggling jester with 3-prong belled hat & glowing balls!
      drawBoosterWrapper(c, hex('#c79c18'), hex('#ff7b00'), false);
      c.poly([[15, 31], [24, 15], [35, 27], [46, 15], [55, 31]], hex('#fe5f55'), ink);
      c.circle(15, 31, 3, hex('#ffe066'), ink);
      c.circle(55, 31, 3, hex('#ffe066'), ink);
      c.circle(cx, 33, 7, COL_WHITE, ink);
      c.px(cx - 2, 32, ink);
      c.px(cx + 2, 32, ink);
      c.rect(cx - 2, 36, 5, 2, hex('#fe5f55'));
      c.poly([[20, 65], [24, 41], [46, 41], [50, 65]], hex('#f7c438'), ink);
      c.line(23, 43, 47, 62, hex('#2e8c5c'), 5);
      c.circle(15, 55, 3.5, hex('#009dff'), COL_WHITE);
      c.circle(55, 50, 3.5, hex('#fe5f55'), COL_WHITE);
    } else if (cell.variant === 2) {
      // Electric-blue Jumbo striped waving jester pennant banner!
      drawBoosterWrapper(c, hex('#00a6ff'), hex('#0068d9'), false);
      c.line(20, 26, 20, 64, hex('#dce6f0'), 3);
      for (let i = 0; i < 7; i++) {
        const wy = Math.round(Math.sin(i * 0.85) * 4);
        c.rect(22 + i * 5, 28 + wy, 5, 24, i % 2 === 0 ? hex('#82e0a8') : hex('#546bb8'));
      }
      c.rectOutline(22, 26, 35, 29, ink);
    } else {
      // High-contrast cyan-and-white halftone grinning Mega Jester portrait!
      drawBoosterWrapper(c, hex('#d4f5ff'), hex('#66cfff'), true);
      const cyanInk = hex('#0066b8');
      c.poly([[10, 42], [19, 24], [35, 35], [51, 24], [60, 42]], hex('#47c4ff'), cyanInk);
      c.circle(10, 42, 3.5, COL_WHITE, cyanInk);
      c.circle(60, 42, 3.5, COL_WHITE, cyanInk);
      c.circle(cx, 48, 15, COL_WHITE, cyanInk);
      c.poly([[24, 62], [35, 56], [46, 62], [41, 68], [35, 63], [29, 68]], hex('#47c4ff'), cyanInk);
      c.poly([[26, 44], [31, 41], [32, 46]], cyanInk);
      c.poly([[44, 44], [39, 41], [38, 46]], cyanInk);
      c.poly([[24, 50], [35, 58], [46, 50], [35, 54]], cyanInk);
      c.rect(31, 52, 9, 2, COL_WHITE);
    }
    c.text3x5('BUFFOON', cx, 67, COL_WHITE, { align: 'center', outline: ink });
    c.text3x5('PACK', cx, 75, hex('#ffe066'), { align: 'center', outline: ink });
  }

  // Escalating JUMBO / MEGA Top Headers!
  if (isJumbo) {
    c.roundedRect(12, 12, 47, 9, 2, hex('#242b33', 190), COL_WHITE);
    c.text3x5('JUMBO', cx, 14, COL_WHITE, { align: 'center' });
  } else if (isMega) {
    c.poly([[7, 13], [64, 13], [60, 24], [11, 24]], hex('#222a33'), COL_WHITE);
    c.text5x7('MEGA', cx, 15, COL_WHITE, 1, { align: 'center', outline: hex('#10141c') });
    c.sparkle(11, 14, hex('#ffe066'), 2, COL_WHITE);
    c.sparkle(59, 14, hex('#ffe066'), 2, COL_WHITE);
  }
}

function buildBoostersAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.Booster;
  const surf = new PixelSurface(spec.cols * spec.cellW, spec.rows * spec.cellH);

  for (let gy = 0; gy < spec.rows; gy++) {
    for (let gx = 0; gx < spec.cols; gx++) {
      const c = new PixelSurface(CARD_W, CARD_H);
      drawBoosterArt(c, getBoosterCell(gx, gy));
      surf.blit(c, gx * spec.cellW, gy * spec.cellH);
    }
  }

  return surf.toCanvas();
}

// ---------------------------------------------------------------------------
// 6. Blind Chips Atlas (`BlindChips`, 21x31 @ 34x34)
// Exact row alignment with src/data/blinds.ts:
//   Row 0 Small Blind, Row 1 Big Blind, Rows 2..24 Regular Bosses (sweeping gleam),
//   Rows 25..29 Ante-8 Showdown rotating 6-notch casino chips, Row 30 '?' unknown.
// ---------------------------------------------------------------------------

interface BlindRowArt {
  color: string;
  showdown?: 'heart' | 'bell' | 'acorn' | 'leaf' | 'vessel';
  sigil:
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
    | 'unknown';
}

const BLIND_ROWS: readonly BlindRowArt[] = [
  { color: '#3a55ab', sigil: 'small' },    // 0 Small Blind
  { color: '#e0a23a', sigil: 'big' },      // 1 Big Blind
  { color: '#b95b08', sigil: 'ox' },       // 2 The Ox
  { color: '#5186a8', sigil: 'house' },    // 3 The House
  { color: '#b9cb92', sigil: 'club' },     // 4 The Club
  { color: '#3e85bd', sigil: 'fish' },     // 5 The Fish
  { color: '#a9a295', sigil: 'window' },   // 6 The Window
  { color: '#a84024', sigil: 'hook' },     // 7 The Hook
  { color: '#575757', sigil: 'manacle' },  // 8 The Manacle
  { color: '#8a59a5', sigil: 'wall' },     // 9 The Wall
  { color: '#50bf7c', sigil: 'wheel' },    // 10 The Wheel
  { color: '#6865f3', sigil: 'arm' },      // 11 The Arm
  { color: '#efc03c', sigil: 'psychic' },  // 12 The Psychic
  { color: '#b95c96', sigil: 'goad' },     // 13 The Goad
  { color: '#c6e0eb', sigil: 'water' },    // 14 The Water
  { color: '#439a4f', sigil: 'serpent' },  // 15 The Serpent
  { color: '#7e6752', sigil: 'pillar' },   // 16 The Pillar
  { color: '#4b71e4', sigil: 'eye' },      // 17 The Eye
  { color: '#ae718e', sigil: 'mouth' },    // 18 The Mouth
  { color: '#709284', sigil: 'plant' },    // 19 The Plant
  { color: '#5c6e31', sigil: 'needle' },   // 20 The Needle
  { color: '#ac9db4', sigil: 'head' },     // 21 The Head
  { color: '#b52d2d', sigil: 'tooth' },    // 22 The Tooth
  { color: '#6a3847', sigil: 'mark' },     // 23 The Mark
  { color: '#e56a2f', sigil: 'flint' },    // 24 The Flint
  { color: '#ac3232', sigil: 'unknown', showdown: 'heart' },   // 25 Crimson Heart
  { color: '#009cfd', sigil: 'unknown', showdown: 'bell' },    // 26 Cerulean Bell
  { color: '#fda200', sigil: 'unknown', showdown: 'acorn' },   // 27 Amber Acorn
  { color: '#56a786', sigil: 'unknown', showdown: 'leaf' },    // 28 Verdant Leaf
  { color: '#8a71e1', sigil: 'unknown', showdown: 'vessel' },  // 29 Violet Vessel
  { color: '#c8d4e0', sigil: 'unknown' },  // 30 Unknown '?'
];

function drawBossSigil(c: PixelSurface, cx: number, cy: number, sigil: BlindRowArt['sigil'], etch: RGBA, hi: RGBA): void {
  switch (sigil) {
    case 'small':
      c.text3x5('SMALL', cx, cy - 6, COL_WHITE, { align: 'center', shadow: etch });
      c.text3x5('BLIND', cx, cy + 1, COL_WHITE, { align: 'center', shadow: etch });
      return;
    case 'big':
      c.text3x5('BIG', cx, cy - 6, hex('#4f300c'), { align: 'center', shadow: hi });
      c.text3x5('BLIND', cx, cy + 1, hex('#4f300c'), { align: 'center', shadow: hi });
      return;
    case 'unknown':
      c.text5x7('?', cx, cy - 5, COL_WHITE, 2, { align: 'center', shadow: etch });
      return;
    case 'ox':
      // Horned Ox A-glyph
      c.line(cx - 7, cy - 7, cx + 2, cy + 8, etch, 2);
      c.line(cx + 7, cy - 7, cx - 2, cy + 8, etch, 2);
      c.line(cx - 8, cy, cx + 8, cy, etch, 2);
      return;
    case 'house':
      // Angled House roof & floor
      c.poly([[cx - 6, cy - 6], [cx + 6, cy - 6], [cx + 6, cy + 6], [cx - 6, cy + 6]], [0, 0, 0, 0], etch);
      c.line(cx - 6, cy - 6, cx + 6, cy + 2, etch, 2);
      c.line(cx - 6, cy + 6, cx + 6, cy + 6, etch, 2);
      return;
    case 'club':
      c.suitPip('Clubs', cx, cy, 'md', etch);
      return;
    case 'fish':
      c.poly([[cx, cy - 7], [cx + 7, cy + 6], [cx - 7, cy + 6]], [0, 0, 0, 0], etch);
      c.line(cx, cy - 6, cx + 7, cy + 6, etch, 2);
      c.line(cx, cy - 6, cx - 7, cy + 6, etch, 2);
      c.line(cx - 7, cy + 6, cx + 7, cy + 6, etch, 2);
      return;
    case 'window':
      // 3-bar Window lattice
      c.line(cx + 5, cy - 7, cx + 5, cy + 7, etch, 2);
      c.line(cx - 6, cy - 4, cx + 5, cy - 6, etch, 2);
      c.line(cx - 6, cy, cx + 5, cy - 2, etch, 2);
      c.line(cx - 6, cy + 4, cx + 5, cy + 2, etch, 2);
      return;
    case 'hook':
      c.line(cx, cy, cx, cy + 8, etch, 2);
      c.line(cx, cy, cx - 7, cy - 7, etch, 2);
      c.line(cx, cy, cx + 7, cy - 7, etch, 2);
      return;
    case 'manacle':
      c.line(cx - 7, cy - 7, cx + 7, cy - 7, etch, 2);
      c.line(cx - 7, cy + 7, cx + 7, cy + 7, etch, 2);
      c.line(cx, cy - 7, cx, cy + 7, etch, 2);
      return;
    case 'wall':
      c.rectOutline(cx - 7, cy - 6, 15, 13, etch, 2);
      c.line(cx - 7, cy, cx + 7, cy, etch, 2);
      return;
    case 'wheel':
      c.ring(cx, cy, 8, 6, etch);
      c.line(cx - 5, cy - 5, cx + 5, cy + 5, etch, 2);
      c.line(cx + 5, cy - 5, cx - 5, cy + 5, etch, 2);
      return;
    case 'arm':
      c.line(cx - 6, cy - 6, cx + 6, cy - 6, etch, 2);
      c.line(cx + 6, cy - 6, cx + 6, cy + 7, etch, 2);
      c.line(cx - 4, cy - 1, cx + 6, cy - 1, etch, 2);
      return;
    case 'psychic':
      c.line(cx - 5, cy - 7, cx - 5, cy + 7, etch, 2);
      c.line(cx - 5, cy, cx + 6, cy - 7, etch, 2);
      c.line(cx - 5, cy, cx + 6, cy + 7, etch, 2);
      return;
    case 'goad':
      c.suitPip('Spades', cx, cy, 'md', etch);
      return;
    case 'water':
      c.line(cx - 7, cy + 3, cx - 4, cy - 5, etch, 2);
      c.line(cx - 4, cy - 5, cx, cy + 3, etch, 2);
      c.line(cx, cy + 3, cx + 4, cy - 5, etch, 2);
      c.line(cx + 4, cy - 5, cx + 7, cy + 5, etch, 2);
      return;
    case 'serpent':
      c.line(cx + 5, cy - 7, cx - 5, cy - 2, etch, 2);
      c.line(cx - 5, cy - 2, cx + 5, cy + 3, etch, 2);
      c.line(cx + 5, cy + 3, cx - 5, cy + 8, etch, 2);
      return;
    case 'pillar':
      c.line(cx, cy - 8, cx, cy + 8, etch, 2);
      c.line(cx - 7, cy - 4, cx + 7, cy - 4, etch, 2);
      c.line(cx - 7, cy, cx + 7, cy, etch, 2);
      c.line(cx - 7, cy + 4, cx + 7, cy + 4, etch, 2);
      return;
    case 'eye':
      c.ring(cx, cy, 8, 5, etch);
      c.circle(cx, cy, 2, etch);
      return;
    case 'mouth':
      c.ring(cx, cy, 8, 5, etch);
      c.rect(cx - 9, cy - 3, 7, 7, hi);
      return;
    case 'plant':
      c.line(cx, cy - 7, cx, cy + 8, etch, 2);
      c.line(cx, cy - 1, cx - 6, cy - 6, etch, 2);
      c.line(cx, cy - 1, cx + 6, cy - 6, etch, 2);
      c.line(cx, cy + 4, cx + 6, cy, etch, 2);
      return;
    case 'needle':
      c.ring(cx, cy, 7, 5, etch);
      c.line(cx, cy - 9, cx, cy + 9, etch, 2);
      return;
    case 'head':
      c.suitPip('Hearts', cx, cy, 'md', etch);
      return;
    case 'tooth':
      c.line(cx - 8, cy - 5, cx - 4, cy + 6, etch, 2);
      c.line(cx - 4, cy + 6, cx, cy - 4, etch, 2);
      c.line(cx, cy - 4, cx + 4, cy + 6, etch, 2);
      c.line(cx + 4, cy + 6, cx + 8, cy - 5, etch, 2);
      return;
    case 'mark':
      c.line(cx - 7, cy - 7, cx + 7, cy + 7, etch, 2);
      c.line(cx + 7, cy - 7, cx - 7, cy + 7, etch, 2);
      return;
    case 'flint':
      c.line(cx + 2, cy - 8, cx - 5, cy, etch, 2);
      c.line(cx - 5, cy, cx + 5, cy, etch, 2);
      c.line(cx + 5, cy, cx - 2, cy + 8, etch, 2);
      return;
  }
}

function drawShowdownEmblem(c: PixelSurface, cx: number, cy: number, kind: NonNullable<BlindRowArt['showdown']>, col: RGBA): void {
  const hi = shadeRgba(col, 1.38);
  const dark = shadeRgba(col, 0.55);
  switch (kind) {
    case 'heart':
      c.suitPip('Hearts', cx, cy + 1, 'md', col, { outline: COL_WHITE, highlight: hi });
      return;
    case 'bell':
      c.poly([[cx - 6, cy + 5], [cx - 4, cy - 4], [cx, cy - 6], [cx + 4, cy - 4], [cx + 6, cy + 5]], col, COL_WHITE);
      c.rect(cx - 1, cy + 5, 3, 2, hi);
      c.px(cx - 2, cy - 2, hi);
      return;
    case 'acorn':
      c.ellipse(cx, cy - 3, 6, 3, dark, COL_WHITE);
      c.ellipse(cx, cy + 2, 5, 5, col, COL_WHITE);
      c.px(cx, cy - 7, COL_WHITE);
      c.px(cx - 2, cy + 1, hi);
      return;
    case 'leaf':
      c.poly([[cx, cy - 7], [cx + 6, cy], [cx + 3, cy + 5], [cx - 3, cy + 5], [cx - 6, cy]], col, COL_WHITE);
      c.line(cx, cy - 5, cx, cy + 7, hi, 1);
      return;
    case 'vessel':
      c.poly([[cx - 6, cy - 5], [cx + 6, cy - 5], [cx + 4, cy + 2], [cx - 4, cy + 2]], col, COL_WHITE);
      c.rect(cx - 1, cy + 2, 3, 4, col);
      c.rect(cx - 4, cy + 5, 9, 2, COL_WHITE);
      return;
  }
}

function buildBlindChipsAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.BlindChips;
  const surf = new PixelSurface(spec.cols * spec.cellW, spec.rows * spec.cellH);

  for (let gy = 0; gy < spec.rows; gy++) {
    const row = BLIND_ROWS[gy % BLIND_ROWS.length]!;
    const base = hex(row.color);
    const hi = shadeRgba(base, 1.32);
    const dark = shadeRgba(base, 0.62);
    const deep = shadeRgba(base, 0.36);

    for (let gx = 0; gx < spec.cols; gx++) {
      const c = new PixelSurface(spec.cellW, spec.cellH);
      const cx = 17;
      const cy = 17;

      if (row.showdown) {
        // Ante-8 Showdown: REAL rotating 6-notch 3D casino chip!
        const spin = (gx / spec.cols) * (Math.PI / 3);
        const slate = hex('#425059');
        for (let dy = -16; dy <= 16; dy++) {
          for (let dx = -16; dx <= 16; dx++) {
            const dist = Math.hypot(dx, dy);
            if (dist > 15.6) continue;
            if (dist > 14.5) {
              c.px(cx + dx, cy + dy, dy > 3 ? deep : dark);
              continue;
            }
            if (dist > 10.6) {
              // 6 rotating rim notches alternating base color & crisp white!
              const ang = Math.atan2(dy, dx) + spin;
              const seg = Math.floor(((ang + Math.PI * 4) / (Math.PI / 6))) % 2;
              const notchCol = seg === 0 ? COL_WHITE : dy > 6 ? dark : base;
              c.px(cx + dx, cy + dy, notchCol);
            } else if (dist > 9.3) {
              c.px(cx + dx, cy + dy, COL_WHITE);
            } else {
              c.px(cx + dx, cy + dy, dy < -3 ? hex('#536470') : slate);
            }
          }
        }
        drawShowdownEmblem(c, cx, cy, row.showdown, base);
      } else {
        // 3D beveled circular medallion with smooth diagonal sweeping specular gleam!
        const gleamCenter = -24 + gx * 3.4;
        for (let dy = -16; dy <= 16; dy++) {
          for (let dx = -16; dx <= 16; dx++) {
            const dist = Math.hypot(dx, dy);
            if (dist > 15.6) continue;
            if (dist > 14.4) {
              c.px(cx + dx, cy + dy, dy > 2 ? deep : dark);
              continue;
            }
            // Subtle 3D top-left highlight & bottom-right shadow rim
            let col = base;
            if (dist > 12.6) {
              col = dx + dy < -4 ? hi : dx + dy > 6 ? dark : base;
            } else if (dist > 11.4) {
              col = dx + dy < 0 ? shadeRgba(base, 0.85) : shadeRgba(base, 1.12);
            }
            c.px(cx + dx, cy + dy, col);
          }
        }
        drawBossSigil(c, cx, cy, row.sigil, deep, hi);

        // Sweeping diagonal metallic sheen across frames 10..19!
        if (gx >= 8 && gx <= 19) {
          for (let dy = -14; dy <= 14; dy++) {
            for (let dx = -14; dx <= 14; dx++) {
              if (dx * dx + dy * dy > 198) continue;
              const diag = dx + dy;
              if (Math.abs(diag - gleamCenter) < 2.2 || Math.abs(diag - (gleamCenter - 5.5)) < 1.0) {
                c.px(cx + dx, cy + dy, hex('#ffffff', 95));
              }
            }
          }
        }
      }

      surf.blit(c, gx * spec.cellW, gy * spec.cellH);
    }
  }

  return surf.toCanvas();
}

// ---------------------------------------------------------------------------
// 7. Skip Tags Atlas (`tags`, 6x5 @ 34x34)
// Crisp metallic-rimmed glossy white rounded-square tokens with bold vivid icons
// matching exact src/data/tags.ts coordinates!
// ---------------------------------------------------------------------------

function drawTagTokenBase(c: PixelSurface): void {
  const rimDark = hex('#4e5d6b');
  const rimMid = hex('#9cb0c4');
  const rimHi = hex('#dce6f2');
  // Outer 3D metallic rounded badge
  c.roundedRect(2, 2, 30, 30, 7, rimHi, rimDark);
  c.roundedRect(3, 3, 28, 28, 6, rimMid);
  // Crisp bottom 3D bevel rim
  c.rect(7, 30, 20, 2, rimDark);
  c.rect(2, 16, 2, 10, rimDark);
  c.rect(30, 16, 2, 10, rimDark);
  // Bright glossy white center field
  c.roundedRect(5, 5, 24, 24, 5, COL_WHITE, hex('#cad7e3'));
}

function drawMiniJesterSilhouette(c: PixelSurface, cx: number, cy: number, col: RGBA): void {
  c.poly([[cx - 9, cy - 3], [cx - 5, cy - 9], [cx, cy - 4], [cx + 5, cy - 9], [cx + 9, cy - 3]], col);
  c.circle(cx, cy - 2, 5, col);
  c.poly([[cx - 9, cy + 9], [cx - 6, cy + 2], [cx + 6, cy + 2], [cx + 9, cy + 9], [cx + 4, cy + 10], [cx, cy + 6], [cx - 4, cy + 10]], col);
  c.circle(cx, cy - 10, 2, col);
}

function drawMiniEditionCard(c: PixelSurface, cx: number, cy: number, mode: 'neg' | 'foil' | 'holo' | 'poly'): void {
  const x0 = cx - 7;
  const y0 = cy - 9;
  if (mode === 'neg') {
    c.roundedRect(x0, y0, 14, 18, 2, hex('#404c52'), hex('#222a2e'));
    c.rect(cx - 1, cy - 3, 3, 7, COL_WHITE);
    c.rect(cx - 3, cy - 1, 7, 3, COL_WHITE);
  } else if (mode === 'foil') {
    c.roundedRect(x0, y0, 14, 18, 2, hex('#bdd6f2'), hex('#6b95c4'));
    c.line(x0 + 2, y0 + 13, x0 + 12, y0 + 3, COL_WHITE, 2);
    c.rect(cx - 1, cy - 3, 3, 7, hex('#2c5282'));
    c.rect(cx - 3, cy - 1, 7, 3, hex('#2c5282'));
  } else if (mode === 'holo') {
    c.roundedRect(x0, y0, 14, 18, 2, hex('#d9d4ff'), hex('#8c82bd'));
    for (let y = y0 + 2; y < y0 + 16; y += 3) {
      c.rect(x0 + 2, y, 10, 1, y % 2 === 0 ? hex('#ff99d6') : hex('#8ceeff'));
    }
    c.rect(cx - 1, cy - 3, 3, 7, hex('#3a4859'));
    c.rect(cx - 3, cy - 1, 7, 3, hex('#3a4859'));
  } else {
    c.roundedRect(x0, y0, 14, 18, 2, hex('#ffe066'), hex('#5c488a'));
    const cols = [hex('#fe5f55'), hex('#fda200'), hex('#4bc292'), hex('#009dff'), hex('#b26cbb')];
    for (let i = 0; i < 10; i++) {
      c.rect(x0 + 2 + i, y0 + 2, 1, 14, cols[Math.floor(i / 2) % cols.length]!);
    }
    c.rect(cx - 1, cy - 3, 3, 7, COL_WHITE);
    c.rect(cx - 3, cy - 1, 7, 3, COL_WHITE);
  }
}

function buildTagsAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.tags;
  const surf = new PixelSurface(spec.cols * spec.cellW, spec.rows * spec.cellH);

  const drawTag = (gx: number, gy: number, fn: (c: PixelSurface, cx: number, cy: number) => void) => {
    const c = new PixelSurface(spec.cellW, spec.cellH);
    drawTagTokenBase(c);
    fn(c, 17, 17);
    surf.blit(c, gx * spec.cellW, gy * spec.cellH);
  };

  // Row 0: Uncommon, Rare, Negative, Foil, Coupon, Double
  drawTag(0, 0, (c, cx, cy) => drawMiniJesterSilhouette(c, cx, cy, hex('#3ca374')));
  drawTag(1, 0, (c, cx, cy) => drawMiniJesterSilhouette(c, cx, cy, hex('#fe554c')));
  drawTag(2, 0, (c, cx, cy) => drawMiniEditionCard(c, cx, cy, 'neg'));
  drawTag(3, 0, (c, cx, cy) => drawMiniEditionCard(c, cx, cy, 'foil'));
  drawTag(4, 0, (c, cx, cy) => {
    c.poly([[cx - 6, cy - 4], [cx, cy - 10], [cx + 6, cy - 4], [cx + 6, cy + 9], [cx - 6, cy + 9]], hex('#fe5f55'));
    c.circle(cx, cy - 5, 1.5, COL_WHITE);
  });
  drawTag(5, 0, (c, cx, cy) => {
    c.roundedRect(cx - 9, cy - 9, 11, 11, 2, hex('#fe5f55'));
    c.roundedRect(cx - 2, cy - 2, 11, 11, 2, hex('#1a9eff'));
    c.rect(cx - 2, cy - 2, 4, 4, COL_WHITE);
  });

  // Row 1: Holo, Polychrome, Investment, Voucher, Top-up, Juggle
  drawTag(0, 1, (c, cx, cy) => drawMiniEditionCard(c, cx, cy, 'holo'));
  drawTag(1, 1, (c, cx, cy) => drawMiniEditionCard(c, cx, cy, 'poly'));
  drawTag(2, 1, (c, cx, cy) => c.text5x7('$', cx, cy - 7, hex('#f0b532'), 2, { align: 'center' }));
  drawTag(3, 1, (c, cx, cy) => {
    c.rect(cx - 6, cy - 9, 12, 18, hex('#eb7059'));
    c.rect(cx - 6, cy - 9, 12, 5, hex('#425059'));
    c.rect(cx - 1, cy - 1, 3, 7, COL_WHITE);
    c.rect(cx - 3, cy + 1, 7, 3, COL_WHITE);
  });
  drawTag(4, 1, (c, cx, cy) => {
    c.roundedRect(cx - 6, cy - 8, 12, 16, 2, hex('#0098ff'));
    c.rect(cx - 6, cy - 8, 12, 3, hex('#a6c2d6'));
    c.poly([[cx, cy - 3], [cx + 4, cy + 2], [cx - 4, cy + 2]], COL_WHITE);
    c.rect(cx - 1, cy + 2, 3, 4, COL_WHITE);
  });
  drawTag(5, 1, (c, cx, cy) => {
    c.circle(cx - 5, cy - 4, 3.2, hex('#0098ff'));
    c.circle(cx + 5, cy - 3, 3.2, hex('#fe5f55'));
    c.circle(cx, cy + 5, 3.2, hex('#fda200'));
  });

  // Row 2: Boss, Standard, Charm, Meteor, Buffoon, Orbital
  drawTag(0, 2, (c, cx, cy) => {
    c.circle(cx, cy, 9, hex('#c782b8'));
    c.ring(cx, cy, 6, 4, COL_WHITE);
    c.rect(cx - 2, cy - 7, 4, 4, hex('#c782b8'));
    c.rect(cx - 2, cy + 4, 4, 4, hex('#c782b8'));
    c.poly([[cx + 4, cy - 4], [cx, cy - 7], [cx, cy - 2]], COL_WHITE);
    c.poly([[cx - 4, cy + 4], [cx, cy + 2], [cx, cy + 7]], COL_WHITE);
  });
  drawTag(1, 2, (c, cx, cy) => {
    c.circle(cx, cy, 9, hex('#f59e00'));
    c.roundedRect(cx - 4, cy - 5, 8, 10, 1, COL_WHITE);
    c.rect(cx - 1, cy - 1, 2, 2, hex('#f59e00'));
  });
  drawTag(2, 2, (c, cx, cy) => {
    c.circle(cx, cy, 9, hex('#8464d9'));
    c.ellipse(cx, cy, 6, 3.5, COL_WHITE);
    c.circle(cx, cy, 2, hex('#8464d9'));
  });
  drawTag(3, 2, (c, cx, cy) => {
    c.circle(cx, cy, 9, hex('#4e8c99'));
    c.ring(cx - 3, cy + 1, 3, 2, COL_WHITE);
    c.ring(cx + 4, cy - 2, 2.5, 1.5, COL_WHITE);
    c.px(cx + 1, cy + 5, COL_WHITE);
  });
  drawTag(4, 2, (c, cx, cy) => {
    c.circle(cx, cy, 9.5, hex('#8fa1b5'));
    // Crisp compact white jester silhouette cleanly contained inside the slate circle!
    c.poly([[cx - 6, cy - 2], [cx - 3, cy - 6], [cx, cy - 3], [cx + 3, cy - 6], [cx + 6, cy - 2]], COL_WHITE);
    c.circle(cx, cy - 1, 3.2, COL_WHITE);
    c.poly([[cx - 6, cy + 6], [cx - 3, cy + 2], [cx + 3, cy + 2], [cx + 6, cy + 6], [cx, cy + 4]], COL_WHITE);
  });
  drawTag(5, 2, (c, cx, cy) => {
    c.ring(cx, cy, 9, 7, hex('#b0bcc7'));
    c.circle(cx, cy, 4, hex('#4e8c99'));
    c.circle(cx + 8, cy, 2.5, hex('#fe5f55'));
  });

  // Row 3: Speed (tag_skip), Handy, Garbage, Ethereal, Economy, D6
  drawTag(0, 3, (c, cx, cy) => {
    c.circle(cx, cy, 9, hex('#f0c243'));
    c.line(cx - 5, cy + 2, cx, cy - 3, COL_WHITE, 2);
    c.line(cx, cy - 3, cx + 5, cy + 1, COL_WHITE, 2);
    c.poly([[cx + 6, cy + 2], [cx + 2, cy - 2], [cx + 2, cy + 4]], COL_WHITE);
  });
  drawTag(1, 3, (c, cx, cy) => {
    c.circle(cx, cy, 9, hex('#0098ff'));
    c.roundedRect(cx - 4, cy - 1, 8, 7, 2, COL_WHITE);
    for (const fx of [-4, -2, 0, 2]) c.rect(cx + fx, cy - 6, 1, 6, COL_WHITE);
    c.rect(cx + 4, cy - 2, 2, 4, COL_WHITE);
  });
  drawTag(2, 3, (c, cx, cy) => {
    c.circle(cx, cy, 9, hex('#fe5f55'));
    c.rect(cx - 4, cy - 3, 9, 9, COL_WHITE);
    c.rect(cx - 5, cy - 5, 11, 2, COL_WHITE);
    c.rect(cx - 2, cy - 1, 1, 5, hex('#fe5f55'));
    c.rect(cx + 2, cy - 1, 1, 5, hex('#fe5f55'));
  });
  drawTag(3, 3, (c, cx, cy) => {
    c.circle(cx, cy, 9, hex('#466bc7'));
    for (let dy = 0; dy <= 9; dy++) {
      for (let dx = -9; dx <= 9; dx++) {
        if (dx * dx + dy * dy <= 81 && dy > Math.sin(dx * 0.4) * 3) {
          c.px(cx + dx, cy + dy, hex('#c4a83b'));
        }
      }
    }
    c.ring(cx, cy, 6, 4, COL_WHITE);
  });
  drawTag(4, 3, (c, cx, cy) => {
    c.circle(cx, cy, 9, hex('#f0c243'));
    c.line(cx - 5, cy + 3, cx - 1, cy, COL_WHITE, 2);
    c.line(cx - 1, cy, cx + 1, cy + 2, COL_WHITE, 2);
    c.line(cx + 1, cy + 2, cx + 5, cy - 3, COL_WHITE, 2);
  });
  drawTag(5, 3, (c, cx, cy) => {
    c.roundedRect(cx - 8, cy - 8, 16, 16, 3, hex('#4ea678'));
    for (const py of [-4, 0, 4]) {
      c.rect(cx - 4, cy + py - 1, 2, 2, COL_WHITE);
      c.rect(cx + 2, cy + py - 1, 2, 2, COL_WHITE);
    }
  });

  // Row 4: (3,4) Undiscovered '?' badge (plus spare clean tokens on other row 4 slots)
  drawTag(3, 4, (c, cx, cy) => {
    c.circle(cx, cy, 9, hex('#cad4e0'));
    c.text5x7('?', cx, cy - 4, COL_WHITE, 1, { align: 'center', shadow: hex('#8a98a8') });
  });

  return surf.toCanvas();
}

// ---------------------------------------------------------------------------
// 8. Stickers Atlas (`stickers`, 5x3 @ 71x95)
// Exact non-overlapping card badge positions matching Moveable.ts & stickers.png:
//   (0,0) Eternal infinity pin @ (13, 14)
//   (0,2) Perishable stopwatch pin @ (13, 14)
//   (1,2) Rental gold '$' coin @ (13, 35) (cleanly below Eternal/Perishable!)
//   (1,0)..(4,0) & (0,1)..(3,1): 8 miniature casino stake win chips @ (57, 14)!
// ---------------------------------------------------------------------------

function drawMiniStakeChipSticker(
  s: PixelSurface,
  cx: number,
  cy: number,
  body: RGBA,
  stripeA: RGBA,
  stripeB: RGBA
): void {
  const rim = hex('#3d484f');
  for (let dy = -9; dy <= 9; dy++) {
    for (let dx = -9; dx <= 9; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > 8.6) continue;
      if (d > 7.5) {
        s.px(cx + dx, cy + dy, rim);
      } else if (d > 5.0) {
        const ang = Math.atan2(dy, dx);
        const seg = Math.floor(((ang + Math.PI * 4) / (Math.PI / 4))) % 2;
        s.px(cx + dx, cy + dy, seg === 0 ? stripeA : stripeB);
      } else {
        s.px(cx + dx, cy + dy, dy < -1 ? shadeRgba(body, 1.2) : body);
      }
    }
  }
}

function buildStickersAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.stickers;
  const surf = new PixelSurface(spec.cols * spec.cellW, spec.rows * spec.cellH);
  const cell = (gx: number, gy: number) => ({ ox: gx * spec.cellW, oy: gy * spec.cellH });

  // (0,0) Eternal — glossy rose-magenta pin with crisp white infinity loop!
  {
    const { ox, oy } = cell(0, 0);
    const cx = ox + 13;
    const cy = oy + 14;
    surf.circle(cx, cy, 8.5, hex('#c75985'), hex('#6e2443'));
    surf.ring(cx, cy, 8, 7, hex('#eb94b8'));
    // Crisp white infinity symbol
    surf.ring(cx - 3, cy, 3, 1.5, COL_WHITE);
    surf.ring(cx + 3, cy, 3, 1.5, COL_WHITE);
  }

  // 8 Miniature Casino Stake Win Stickers at top-right (57, 14)
  const winStakes: ReadonlyArray<[number, number, RGBA, RGBA, RGBA]> = [
    [1, 0, hex('#eef4f7'), hex('#455259'), COL_WHITE],         // White
    [2, 0, hex('#fe5f55'), COL_WHITE, hex('#455259')],         // Red
    [3, 0, hex('#4b9e78'), COL_WHITE, hex('#455259')],         // Green
    [4, 0, hex('#0098ff'), COL_WHITE, hex('#455259')],         // Blue
    [0, 1, hex('#455259'), hex('#fe5f55'), COL_WHITE],         // Black
    [1, 1, hex('#8d6be6'), COL_WHITE, hex('#455259')],         // Purple
    [2, 1, hex('#db7a42'), COL_WHITE, hex('#455259')],         // Orange
    [3, 1, hex('#f2c249'), COL_WHITE, hex('#455259')],         // Gold
  ];
  for (const [gx, gy, body, sa, sb] of winStakes) {
    const { ox, oy } = cell(gx, gy);
    drawMiniStakeChipSticker(surf, ox + 57, oy + 14, body, sa, sb);
  }

  // (0,2) Perishable — indigo-blue stopwatch timer badge at (13, 14)
  {
    const { ox, oy } = cell(0, 2);
    const cx = ox + 13;
    const cy = oy + 14;
    surf.circle(cx, cy, 8.5, hex('#4f5da8'), hex('#293163'));
    surf.ring(cx, cy, 8, 7, hex('#8e9ef0'));
    // Crisp white stopwatch clock face & hands
    surf.ring(cx, cy + 1, 5, 3.5, COL_WHITE);
    surf.rect(cx - 2, cy - 6, 5, 2, COL_WHITE);
    surf.line(cx, cy + 1, cx, cy - 2, COL_WHITE, 1);
    surf.line(cx, cy + 1, cx + 3, cy + 1, COL_WHITE, 1);
  }

  // (1,2) Rental — gleaming gold '$' coin badge at (13, 35)
  {
    const { ox, oy } = cell(1, 2);
    const cx = ox + 13;
    const cy = oy + 35;
    surf.circle(cx, cy, 8.5, hex('#e8b238'), hex('#7d540d'));
    surf.ring(cx, cy, 8, 7, hex('#ffea94'));
    surf.text5x7('$', cx, cy - 3, COL_WHITE, 1, { align: 'center', shadow: hex('#8c5b11') });
  }

  return surf.toCanvas();
}

// ---------------------------------------------------------------------------
// 9. Stake Chips Atlas (`chips`, 5x2 @ 29x29)
// 3D beveled casino stake chips with thick bottom rim edge & 8 alternating stripes.
// Exact src/data/decks-stakes.ts coordinates + smiling Jester chip at (4,1)!
// ---------------------------------------------------------------------------

function buildChipsAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.chips;
  const surf = new PixelSurface(spec.cols * spec.cellW, spec.rows * spec.cellH);

  const chipSpecs: ReadonlyArray<{
    gx: number;
    gy: number;
    body: RGBA;
    s1: RGBA;
    s2: RGBA;
    jester?: boolean;
  }> = [
    { gx: 0, gy: 0, body: hex('#eef5f7'), s1: hex('#4e5c63'), s2: COL_WHITE },         // White Stake
    { gx: 1, gy: 0, body: hex('#fe5f55'), s1: hex('#4e5c63'), s2: COL_WHITE },         // Red Stake
    { gx: 2, gy: 0, body: hex('#4b9e78'), s1: hex('#4e5c63'), s2: COL_WHITE },         // Green Stake
    { gx: 3, gy: 0, body: hex('#0098ff'), s1: hex('#4e5c63'), s2: COL_WHITE },         // Blue Stake
    { gx: 4, gy: 0, body: hex('#4e5c63'), s1: hex('#fe5f55'), s2: COL_WHITE },         // Black Stake
    { gx: 0, gy: 1, body: hex('#8e6be6'), s1: hex('#4e5c63'), s2: COL_WHITE },         // Purple Stake
    { gx: 1, gy: 1, body: hex('#db7c42'), s1: hex('#4e5c63'), s2: COL_WHITE },         // Orange Stake
    { gx: 2, gy: 1, body: hex('#f2c557'), s1: hex('#4e5c63'), s2: COL_WHITE },         // Gold Stake
    { gx: 3, gy: 1, body: hex('#fda200'), s1: hex('#4e5c63'), s2: COL_WHITE },         // Amber Chip
    { gx: 4, gy: 1, body: hex('#f0f5f7'), s1: hex('#4e5c63'), s2: hex('#fe5f55'), jester: true }, // Jester Chip
  ];

  for (const ch of chipSpecs) {
    const c = new PixelSurface(spec.cellW, spec.cellH);
    const cx = 14;
    const cy = 13;
    const dark = shadeRgba(ch.body, 0.65);
    const hi = shadeRgba(ch.body, 1.24);

    // 3D cylindrical bottom thickness lip (shifted +2px Y)
    for (let dy = -13; dy <= 14; dy++) {
      for (let dx = -13; dx <= 13; dx++) {
        const dBot = Math.hypot(dx, dy - 2);
        if (dBot <= 13.2 && dy > 2) {
          c.px(cx + dx, cy + dy, shadeRgba(ch.body, 0.52));
        }
      }
    }

    // Main top face of casino chip
    const jesterStripes = [
      hex('#4e5c63'),
      hex('#fda200'),
      hex('#0098ff'),
      hex('#fe5f55'),
      hex('#4e5c63'),
      hex('#fda200'),
      hex('#0098ff'),
      hex('#fe5f55'),
    ];
    for (let dy = -13; dy <= 13; dy++) {
      for (let dx = -13; dx <= 13; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > 13.2) continue;
        if (d > 12.1) {
          // Crisp continuous circular outer chip edge (prevents white stripes bleeding into bg!)
          c.px(cx + dx, cy + dy, dy > 2 ? shadeRgba(ch.body, 0.55) : shadeRgba(ch.body, 0.78));
        } else if (d > 8.2) {
          // 8 crisp radial rim stripes around beveled edge!
          const ang = Math.atan2(dy, dx) + Math.PI / 8;
          const idx = ((Math.floor((ang + Math.PI * 4) / (Math.PI / 4))) % 8 + 8) % 8;
          const frac = ((ang + Math.PI * 4) % (Math.PI / 4)) / (Math.PI / 4);
          let col = ch.body;
          if (frac > 0.3 && frac < 0.7) {
            col = ch.jester ? jesterStripes[idx]! : idx % 2 === 0 ? ch.s1 : ch.s2;
          } else if (dy > 7) {
            col = dark;
          }
          c.px(cx + dx, cy + dy, col);
        } else if (d > 7.1) {
          c.px(cx + dx, cy + dy, dy < 0 ? dark : hi);
        } else {
          // Recessed shaded center medallion
          c.px(cx + dx, cy + dy, ditherRamp(cx + dx, cy + dy, Math.max(0, Math.min(1, 0.65 - (dx + dy) * 0.03)), [dark, ch.body, hi]));
        }
      }
    }

    if (ch.jester) {
      // Classic mischievous smiling jester chip emblem!
      c.rect(cx - 4, cy - 3, 3, 2, hex('#fda200'));
      c.rect(cx + 2, cy - 3, 3, 2, hex('#fda200'));
      c.poly([[cx - 5, cy + 1], [cx, cy + 6], [cx + 5, cy + 1], [cx, cy + 3]], hex('#fe5f55'));
      c.rect(cx - 2, cy + 2, 5, 1, COL_WHITE);
    }

    surf.blit(c, ch.gx * spec.cellW, ch.gy * spec.cellH);
  }

  return surf.toCanvas();
}

// ---------------------------------------------------------------------------
// 10. Animated Neon Shop Sign (`shop_sign`, 4x1 @ 113x57)
// Transparent interior + glowing rounded coral marquee bulb frame + huge 3D
// beveled buttercream-gold candy-striped `SHOP` letters animating across 4 frames!
// ---------------------------------------------------------------------------

const SHOP_LETTERS: Record<string, readonly string[]> = {
  S: [
    '..111111111..',
    '.11111111111.',
    '1111111111111',
    '1111.....1111',
    '1111.........',
    '1111111111...',
    '.11111111111.',
    '...1111111111',
    '.........1111',
    '1111.....1111',
    '1111111111111',
    '.11111111111.',
    '..111111111..',
  ],
  H: [
    '1111.....1111',
    '1111.....1111',
    '1111.....1111',
    '1111.....1111',
    '1111.....1111',
    '1111111111111',
    '1111111111111',
    '1111111111111',
    '1111.....1111',
    '1111.....1111',
    '1111.....1111',
    '1111.....1111',
    '1111.....1111',
  ],
  O: [
    '..111111111..',
    '.11111111111.',
    '1111111111111',
    '1111.....1111',
    '1111.....1111',
    '1111.....1111',
    '1111.....1111',
    '1111.....1111',
    '1111.....1111',
    '1111.....1111',
    '1111111111111',
    '.11111111111.',
    '..111111111..',
  ],
  P: [
    '11111111111..',
    '111111111111.',
    '1111111111111',
    '1111.....1111',
    '1111.....1111',
    '1111111111111',
    '111111111111.',
    '1111111111...',
    '1111.........',
    '1111.........',
    '1111.........',
    '1111.........',
    '1111.........',
  ],
};

function buildShopSignAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.shop_sign;
  const surf = new PixelSurface(spec.cols * spec.cellW, spec.rows * spec.cellH);

  // Compute perimeter marquee chase-bulb coordinates around the rounded frame
  const bulbs: Array<[number, number]> = [];
  for (let x = 11; x <= 101; x += 9) bulbs.push([x, 5]);
  for (let y = 12; y <= 44; y += 8) bulbs.push([107, y]);
  for (let x = 101; x >= 11; x -= 9) bulbs.push([x, 51]);
  for (let y = 44; y >= 12; y -= 8) bulbs.push([5, y]);

  for (let frame = 0; frame < 4; frame++) {
    const c = new PixelSurface(spec.cellW, spec.cellH);

    // 1. Hollow glowing coral-red rounded marquee tube frame (transparent center!)
    const tubeOuter = hex('#e8534a');
    const tubeHi = hex('#ff9c94');
    const tubeDark = hex('#a62822');
    c.roundedRect(1, 1, 111, 55, 11, tubeOuter, tubeDark);
    c.roundedRect(2, 2, 109, 53, 10, tubeOuter, tubeHi);
    // Punch hollow rounded center cleanly transparent!
    for (let y = 9; y <= 47; y++) {
      for (let x = 9; x <= 103; x++) {
        const dx = x < 15 ? 15 - x : x > 97 ? x - 97 : 0;
        const dy = y < 15 ? 15 - y : y > 41 ? y - 41 : 0;
        if (dx * dx + dy * dy <= 36) {
          c.rawPx(x, y, 0, 0, 0, 0);
        }
      }
    }
    // Inner coral rim border
    c.roundedRect(9, 9, 95, 39, 6, [0, 0, 0, 0], tubeDark);

    // 2. Animated warm chasing marquee bulbs around the tube!
    for (let i = 0; i < bulbs.length; i++) {
      const [bx, by] = bulbs[i]!;
      const phase = (i + frame) % 4;
      if (phase === 0) {
        c.circle(bx, by, 3.2, hex('#ffe0a6', 180));
        c.circle(bx, by, 2.2, COL_WHITE);
      } else if (phase === 1 || phase === 3) {
        c.circle(bx, by, 2.5, hex('#ffd075'));
        c.circle(bx, by, 1.3, hex('#fff5d6'));
      } else {
        c.circle(bx, by, 2.2, hex('#a64232'));
        c.px(bx - 1, by - 1, hex('#d97a5b'));
      }
    }

    // 3. Huge 3D beveled buttercream-gold candy-striped `SHOP` letters (2x scale = 26x26px!)
    const word = ['S', 'H', 'O', 'P'] as const;
    const startX = 14;
    const startY = 14;
    const stepX = 22;
    const letterMask = new PixelSurface(spec.cellW, spec.cellH);

    for (let li = 0; li < word.length; li++) {
      const grid = SHOP_LETTERS[word[li]!]!;
      const lx = startX + li * stepX;
      for (let r = 0; r < grid.length; r++) {
        const row = grid[r]!;
        for (let k = 0; k < row.length; k++) {
          if (row[k] === '1') {
            const px = lx + Math.round(k * 1.5);
            const py = startY + Math.round(r * 2.15);
            letterMask.rect(px, py, 2, 3, COL_WHITE);
          }
        }
      }
    }

    // Drop 3D golden-bronze bevel shadow + crisp warm rim + scrolling diagonal candy-stripes!
    const bevelDeep = hex('#9e5e19');
    const bevelMid = hex('#cc882e');
    const faceA = hex('#ffe9a8');
    const faceB = hex('#ffcf70');
    const rimHi = hex('#fff9e0');

    for (let y = 10; y < 48; y++) {
      for (let x = 10; x < 103; x++) {
        if (letterMask.getA(x, y) === 0) continue;
        c.px(x + 2, y + 3, bevelDeep);
        c.px(x + 1, y + 2, bevelMid);
      }
    }
    for (let y = 10; y < 48; y++) {
      for (let x = 10; x < 103; x++) {
        if (letterMask.getA(x, y) === 0) continue;
        const isEdge =
          letterMask.getA(x - 1, y) === 0 ||
          letterMask.getA(x + 1, y) === 0 ||
          letterMask.getA(x, y - 1) === 0 ||
          letterMask.getA(x, y + 1) === 0;
        if (isEdge) {
          c.px(x, y, letterMask.getA(x, y - 1) === 0 ? rimHi : bevelMid);
        } else {
          // Animated scrolling diagonal sheen stripes!
          const stripe = ((x + y + frame * 3) % 8) < 3;
          c.px(x, y, stripe ? faceA : faceB);
        }
      }
    }

    surf.blit(c, frame * spec.cellW, 0);
  }

  return surf.toCanvas();
}

// ---------------------------------------------------------------------------
// 11. UI Assets (`ui_1`, `ui_2`, 4x2 @ 18x18) & Icons (`icons`, 4x4 @ 66x66)
// Exact row layout matching ui_assets.png:
//   Row 0: (0,0) starburst, (1,0) 'A' rank sort, (2,0) royal bust, (3,0) '#'
//   Row 1: (0,1) Hearts, (1,1) Diamonds, (2,1) Clubs, (3,1) Spades (15x15!)
// ---------------------------------------------------------------------------

function buildUiAtlas(highContrast: boolean): HTMLCanvasElement {
  const spec = highContrast ? ATLAS_SPECS.ui_2 : ATLAS_SPECS.ui_1;
  const surf = new PixelSurface(spec.cols * spec.cellW, spec.rows * spec.cellH);
  const suits = highContrast ? SUIT_COLORS_HC : SUIT_COLORS_DEFAULT;
  const slate = hex('#455259');

  // Row 0 utility glyphs
  // (0,0) Coral starburst gear
  {
    const cx = 9;
    const cy = 9;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      surf.line(cx, cy, Math.round(cx + Math.cos(a) * 7), Math.round(cy + Math.sin(a) * 7), slate, 3);
      surf.line(cx, cy, Math.round(cx + Math.cos(a) * 6), Math.round(cy + Math.sin(a) * 6), hex('#fe5f55'), 1);
    }
    surf.circle(cx, cy, 4.5, hex('#fe5f55'), slate);
  }
  // (1,0) Bold 'A'
  surf.text5x7('A', 18 + 9, 2, slate, 2, { align: 'center' });
  // (2,0) Miniature crowned royal bust
  {
    const ox = 36;
    surf.roundedRect(ox + 3, 2, 12, 6, 2, hex('#fe5f55'), COL_INK);
    surf.rect(ox + 6, 3, 6, 4, hex('#fda200'));
    surf.ellipse(ox + 9, 11, 4, 4, hex('#eef2f5'), COL_INK);
    surf.rect(ox + 4, 14, 10, 3, slate);
  }
  // (3,0) Bold '#'
  {
    const ox = 54;
    surf.rect(ox + 5, 2, 2, 14, slate);
    surf.rect(ox + 11, 2, 2, 14, slate);
    surf.rect(ox + 2, 5, 14, 2, slate);
    surf.rect(ox + 2, 11, 14, 2, slate);
  }

  // Row 1 crisp 15x15 Suit Icons in exact ui_assets.png order: Hearts, Diamonds, Clubs, Spades!
  const uiSuitOrder: readonly Suit[] = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
  for (let i = 0; i < 4; i++) {
    const suit = uiSuitOrder[i]!;
    surf.suitPip(suit, i * 18 + 9, 18 + 9, 'lg', suits[suit]);
  }

  return surf.toCanvas();
}

function buildIconsAtlas(): HTMLCanvasElement {
  const spec = ATLAS_SPECS.icons;
  const surf = new PixelSurface(spec.cols * spec.cellW, spec.rows * spec.cellH);

  // (0,0) Community chat emblem
  {
    const cx = 33;
    const cy = 33;
    surf.roundedRect(cx - 22, cy - 16, 44, 30, 10, COL_WHITE, hex('#a8c4ff'));
    surf.circle(cx - 8, cy - 1, 5, hex('#eef5ff'), hex('#a8c4ff'));
    surf.circle(cx + 8, cy - 1, 5, hex('#eef5ff'), hex('#a8c4ff'));
  }

  // (2,0) Language / Localization badge ('A / 文')
  {
    const ox = 2 * spec.cellW;
    const c = new PixelSurface(66, 66);
    const slate = hex('#455259');
    c.roundedRect(4, 14, 58, 38, 6, COL_WHITE, slate);
    c.poly([[6, 16], [30, 16], [42, 50], [6, 50]], slate);
    c.text5x7('A', 19, 25, COL_WHITE, 3, { align: 'center' });
    // Stylized character strokes on right half
    c.rect(41, 23, 14, 3, slate);
    c.rect(47, 19, 3, 5, slate);
    c.line(42, 43, 53, 27, slate, 3);
    c.line(44, 29, 55, 43, slate, 3);
    surf.blit(c, ox, 0);
  }

  // (3,0) Gleaming 3D Pixel-Art Golden Trophy Cup!
  {
    const ox = 3 * spec.cellW;
    const c = new PixelSurface(66, 66);
    const gold = hex('#f5b841');
    const hi = hex('#ffe68f');
    const sh = hex('#bd7a19');
    const rim = hex('#8c530b');
    // Curved trophy handles
    c.ring(12, 24, 10, 6, sh);
    c.ring(12, 24, 9, 7, gold);
    c.ring(54, 24, 10, 6, sh);
    c.ring(54, 24, 9, 7, gold);
    // Cup bowl with gleaming vertical highlight strip
    c.poly([[12, 7], [54, 7], [51, 34], [42, 45], [24, 45], [15, 34]], gold, rim);
    c.rect(10, 5, 46, 5, hi);
    c.rectOutline(10, 5, 46, 5, sh);
    c.poly([[23, 11], [31, 11], [29, 41], [23, 39]], hi);
    c.poly([[44, 11], [50, 11], [47, 36], [41, 42]], sh);
    // Stem & pedestal base
    c.circle(33, 50, 5, gold, rim);
    c.poly([[21, 61], [33, 53], [45, 61]], gold, rim);
    c.rect(19, 60, 28, 4, sh);
    surf.blit(c, ox, 0);
  }

  return surf.toCanvas();
}

// ---------------------------------------------------------------------------
// Exact Exported Contract (imported by KrunkedArtPack.ts during integration)
// ---------------------------------------------------------------------------

export function buildAllWorldAtlases(): Omit<Record<AtlasKey, HTMLCanvasElement>, 'Joker'> {
  return {
    cards_1: buildPlayingCardsAtlas(false),
    cards_2: buildPlayingCardsAtlas(true),
    centers: buildCentersAtlas(),
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
}
