// ============================================================================
// Krunked Cards — Chunky Pixel-Arcade HUD, Phase Arenas, Rich Tooltips & CRT
// Crisp zero-overlap layout validated for 1280x720 and 1920x1080 viewports.
// ============================================================================

import {
  ATLAS_SPECS,
  PALETTE,
  POKER_HAND_IDS,
  type ArtPackMode,
  type AtlasKey,
  type BlindSlot,
  type ConsumableDef,
  type GameSpeed,
  type KeybindConfig,
  type PokerHandId,
  type ProfileProgress,
  type RenderSettings,
  type SimAction,
  type SimState,
  type StakeLevel,
  type Suit,
  type TargetFps,
} from '../contracts/index.ts';
import {
  BLIND_MAP,
  BLINDS,
  BOOSTER_MAP,
  BOOSTERS,
  CHALLENGES,
  CONSUMABLE_MAP,
  DECK_MAP,
  DECKS,
  EDITION_DEFS,
  ENHANCEMENT_DEFS,
  formatJokerDesc,
  JOKER_MAP,
  JOKERS,
  PLANETS,
  POKER_HAND_MAP,
  SEAL_DEFS,
  SPECTRALS,
  STAKE_MAP,
  STAKES,
  TAG_MAP,
  TAGS,
  TAROTS,
  VOUCHER_MAP,
  VOUCHERS,
} from '../data/index.ts';
import {
  getActiveBlind,
  getEffectiveConsumableSlots,
  getEffectiveJokerSlots,
  previewSelectedHand,
} from '../sim/index.ts';
import { ensureBuiltinPixelFont } from '../assets/BitmapFont.ts';
import type { AtlasImageSource, PackManager } from '../assets/PackManager.ts';
import type { TableGeometry, VisualCard } from '../render/Moveable.ts';
import type { ChoreographerDisplay } from '../render/ScoreChoreographer.ts';
import type { FlameAnchor } from '../render/WebGL2Renderer.ts';

export type ActiveModal =
  | null
  | 'NEW_RUN'
  | 'RUN_INFO'
  | 'COLLECTION'
  | 'OPTIONS'
  | 'PAUSE';

export interface UiCallbacks {
  onDispatch(action: SimAction): void;
  onContinueRun(): void;
  onUpdateSettings(partial: Partial<RenderSettings>): void;
  onSetArtPackMode(mode: ArtPackMode): Promise<void>;
  onLoadCustomPackFiles(files: FileList | File[]): Promise<{ ok: boolean; message: string }>;
  onClearCustomPack(): Promise<void>;
  onPlayButtonSfx(): void;
  hasSavedRun(): boolean;
  getProfile(): ProfileProgress;
}

const RARITY_NAMES: Record<number, string> = {
  1: 'Common',
  2: 'Uncommon',
  3: 'Rare',
  4: 'Legendary',
};

const UI_SUIT_COLS: Record<Suit, number> = {
  Hearts: 0,
  Diamonds: 1,
  Clubs: 2,
  Spades: 3,
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) >= 1e12) return n.toExponential(2);
  return Math.floor(n).toLocaleString('en-US');
}

function formatKeyCode(code: string): string {
  if (code === 'Space') return 'SPACE';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code.toUpperCase();
}

function renderDynaWord(text: string, baseClass: string, startIndex = 0): string {
  let out = '';
  let idx = startIndex;
  for (const ch of text) {
    if (ch === ' ') {
      out += `<span class="kc-dyna-space">&nbsp;</span>`;
    } else {
      out += `<span class="${baseClass}" style="--di:${idx};">${esc(ch)}</span>`;
      idx++;
    }
  }
  return out;
}

/**
 * Single-pass syntax highlighter for card/joker/consumable/tag/voucher/blind
 * descriptions on cream parchment tooltips & collection cards.
 */
function formatRichDesc(raw: string, highContrast = false): string {
  if (!raw) return '';
  const suitColors = highContrast
    ? {
        heart: '#e02820',
        diamond: '#c77c00',
        spade: '#4f31b9',
        club: '#007acc',
      }
    : {
        heart: '#e03c31',
        diamond: '#d95b26',
        spade: '#2d3a54',
        club: '#1f5e4d',
      };

  const tokenRe =
    /(X\d+(?:\.\d+)?(?:\s+Mult)?)|([+-]\d+(?:\.\d+)?\s*Mult)|([+-]\d+(?:\.\d+)?\s*(?:extra\s+)?Chips?)|([+-]?\$\d+)|(\b\d+\s+in\s+\d+\b)|\b(Hearts?|Diamonds?|Spades?|Clubs?)\b|\b(Tarots?|Planets?|Spectrals?|Foil|Holographic|Polychrome|Negative|Glass|Steel|Gold|Lucky|Stone|Wild|Bonus|Mult|Chips?|Jokers?|Boss\s+Blinds?|Blinds?|Vouchers?|Seals?|Eternal|Perishable|Rental)\b|([+-]\d+(?:\.\d+)?)/gi;

  let result = '';
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(raw)) !== null) {
    if (match.index > lastIdx) {
      result += esc(raw.slice(lastIdx, match.index));
    }
    const full = match[0]!;
    if (match[1]) {
      // XN Mult or X1.5 -> iconic white text inside solid red pixel badge pill
      result += `<span class="kc-hl-xmult">${esc(full)}</span>`;
    } else if (match[2]) {
      // +N Mult -> crisp red
      result += `<span class="kc-hl-mult">${esc(full)}</span>`;
    } else if (match[3]) {
      // +N Chips -> crisp blue
      result += `<span class="kc-hl-chips">${esc(full)}</span>`;
    } else if (match[4]) {
      // $N -> warm gold
      result += `<span class="kc-hl-money">${esc(full)}</span>`;
    } else if (match[5]) {
      // 1 in N -> emerald probability green
      result += `<span class="kc-hl-prob">${esc(full)}</span>`;
    } else if (match[6]) {
      const lower = match[6].toLowerCase();
      const col = lower.startsWith('heart')
        ? suitColors.heart
        : lower.startsWith('diamond')
          ? suitColors.diamond
          : lower.startsWith('spade')
            ? suitColors.spade
            : suitColors.club;
      result += `<span class="kc-hl-suit" style="color:${col};">${esc(full)}</span>`;
    } else if (match[7]) {
      const kw = match[7].toLowerCase();
      let cls = 'kc-hl-kw';
      if (kw.startsWith('tarot') || kw.startsWith('seal')) cls = 'kc-hl-tarot';
      else if (kw.startsWith('planet') || kw === 'foil' || kw === 'bonus' || kw.startsWith('chip')) cls = 'kc-hl-chips';
      else if (kw.startsWith('spectral') || kw === 'perishable') cls = 'kc-hl-spectral';
      else if (kw === 'holographic' || kw === 'eternal') cls = 'kc-hl-holo';
      else if (kw === 'polychrome' || kw === 'wild') cls = 'kc-hl-poly';
      else if (kw === 'negative') cls = 'kc-hl-neg';
      else if (kw === 'glass') cls = 'kc-hl-glass';
      else if (kw === 'steel' || kw === 'stone') cls = 'kc-hl-steel';
      else if (kw === 'gold' || kw === 'rental' || kw.startsWith('joker') || kw.startsWith('voucher') || kw.startsWith('blind')) cls = 'kc-hl-money';
      else if (kw === 'lucky') cls = 'kc-hl-prob';
      else if (kw === 'mult' || kw.startsWith('boss')) cls = 'kc-hl-mult';
      result += `<span class="${cls}">${esc(full)}</span>`;
    } else if (match[8]) {
      const cls = full.startsWith('-') ? 'kc-hl-mult' : 'kc-hl-chips';
      result += `<span class="${cls}">${esc(full)}</span>`;
    } else {
      result += esc(full);
    }
    lastIdx = tokenRe.lastIndex;
  }

  if (lastIdx < raw.length) {
    result += esc(raw.slice(lastIdx));
  }
  return result;
}

export class UiOverlay {
  private root: HTMLElement;
  private packManager: PackManager;
  private cb: UiCallbacks;

  private activeModal: ActiveModal = null;
  private runInfoTab: 'hands' | 'blinds' | 'vouchers' | 'deck' = 'hands';
  private collectionTab:
    | 'jokers'
    | 'tarots'
    | 'planets'
    | 'spectrals'
    | 'vouchers'
    | 'boosters'
    | 'blinds'
    | 'tags'
    | 'decks' = 'jokers';
  private newRunTab: 'standard' | 'challenges' = 'standard';
  private newRunDeckId = 'b_red';
  private newRunStake: StakeLevel = 1;
  private newRunSeeded = false;
  private newRunSeed = '';

  private rebindingField: keyof KeybindConfig | null = null;
  private selectedOwnedId: string | null = null;
  private toastMessage: string | null = null;
  private toastUntil = 0;

  // Persistent DOM layers
  private railLayer: HTMLDivElement;
  private tableLayer: HTMLDivElement;
  private popupLayer: HTMLDivElement;
  private modalLayer: HTMLDivElement;
  private tooltipEl: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private crtEl: HTMLDivElement | null = null;
  private folderInput: HTMLInputElement;
  private archiveInput: HTMLInputElement;

  // Dirty-checking keys to avoid tearing down DOM on every 120fps frame
  private lastRailKey = '';
  private lastTableKey = '';
  private lastModalKey = '';
  private lastCrtAmount = -1;
  private lastHighContrast = false;
  private lastHoveredCard: VisualCard | null = null;
  private lastHoverX = 0;
  private lastHoverY = 0;
  private hoveredTagKey: string | null = null;
  private lastAnimTick = -1;

  // Cache whether chips atlas cell (4,1) has non-empty pixels
  private scoreChipAtlasRef: AtlasImageSource | null = null;
  private scoreChipUseCell41 = false;

  // Animated sprite canvases inside UI (Blind chips & Shop sign)
  private animatedCanvases: Array<{
    canvas: HTMLCanvasElement;
    atlas: AtlasKey;
    row: number;
    frames: number;
  }> = [];

  constructor(root: HTMLElement, packManager: PackManager, cb: UiCallbacks) {
    this.root = root;
    this.packManager = packManager;
    this.cb = cb;

    // Immediately register clean-room procedural pixel font on startup
    void ensureBuiltinPixelFont();
    this.injectStyles();

    this.railLayer = document.createElement('div');
    this.railLayer.className = 'kc-layer';

    this.tableLayer = document.createElement('div');
    this.tableLayer.className = 'kc-layer';

    this.popupLayer = document.createElement('div');
    this.popupLayer.className = 'kc-layer kc-popups';

    this.modalLayer = document.createElement('div');
    this.modalLayer.className = 'kc-layer kc-modal-layer';

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'kc-tooltip hidden';

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'kc-toast hidden';

    // Unified Full-Screen CRT Post Overlay covering both WebGL2 canvas & HUD
    this.crtEl = document.getElementById('crt-overlay') as HTMLDivElement | null;
    if (!this.crtEl) {
      this.crtEl = document.createElement('div');
      this.crtEl.id = 'crt-overlay';
      this.crtEl.setAttribute('aria-hidden', 'true');
      (this.root.parentElement ?? document.body).appendChild(this.crtEl);
    }

    // Hidden file pickers for Load Local Custom Pack (folder or .exe archive)
    this.folderInput = document.createElement('input');
    this.folderInput.type = 'file';
    this.folderInput.multiple = true;
    this.folderInput.setAttribute('webkitdirectory', '');
    this.folderInput.style.display = 'none';
    this.folderInput.addEventListener('change', () => {
      if (this.folderInput.files && this.folderInput.files.length > 0) {
        void this.handlePackUpload(this.folderInput.files);
      }
      this.folderInput.value = '';
    });

    this.archiveInput = document.createElement('input');
    this.archiveInput.type = 'file';
    this.archiveInput.accept = '.exe,.zip,.love';
    this.archiveInput.style.display = 'none';
    this.archiveInput.addEventListener('change', () => {
      if (this.archiveInput.files && this.archiveInput.files.length > 0) {
        void this.handlePackUpload(this.archiveInput.files);
      }
      this.archiveInput.value = '';
    });

    this.root.append(
      this.railLayer,
      this.tableLayer,
      this.popupLayer,
      this.modalLayer,
      this.tooltipEl,
      this.toastEl,
      this.folderInput,
      this.archiveInput
    );
  }

  private async handlePackUpload(files: FileList): Promise<void> {
    this.showToast('Loading local custom pack...', 4000);
    const res = await this.cb.onLoadCustomPackFiles(files);
    this.showToast(res.message, 3200);
    this.invalidateAll();
  }

  isModalOpen(): boolean {
    return this.activeModal !== null;
  }

  isRebindingKey(): boolean {
    return this.rebindingField !== null;
  }

  captureRebindKey(code: string): void {
    if (!this.rebindingField) return;
    const field = this.rebindingField;
    this.rebindingField = null;
    if (code !== 'Escape') {
      this.cb.onUpdateSettings({
        keybinds: { [field]: code } as Partial<KeybindConfig> as KeybindConfig,
      });
    }
    this.invalidateModal();
  }

  toggleRunInfo(): void {
    this.activeModal = this.activeModal === 'RUN_INFO' ? null : 'RUN_INFO';
    this.invalidateModal();
  }

  togglePause(phase: SimState['phase']): void {
    if (this.activeModal) {
      this.activeModal = null;
      this.rebindingField = null;
    } else if (phase !== 'TITLE') {
      this.activeModal = 'PAUSE';
    }
    this.invalidateModal();
  }

  openModal(modal: ActiveModal): void {
    this.activeModal = modal;
    this.rebindingField = null;
    this.invalidateModal();
  }

  setSelectedOwned(id: string | null): void {
    this.selectedOwnedId = this.selectedOwnedId === id ? null : id;
    this.lastTableKey = '';
  }

  showToast(msg: string, durationMs = 2400): void {
    this.toastMessage = msg;
    this.toastUntil = performance.now() + durationMs;
  }

  invalidateAll(): void {
    this.lastRailKey = '';
    this.lastTableKey = '';
    this.lastModalKey = '';
    this.scoreChipAtlasRef = null;
  }

  invalidateModal(): void {
    this.lastModalKey = '';
  }

  setHoveredCard(card: VisualCard | null, x: number, y: number, state: SimState): void {
    this.lastHoveredCard = card;
    this.lastHoverX = x;
    this.lastHoverY = y;
    if (card) {
      this.hoveredTagKey = null;
      this.renderTooltip(card, x, y, state);
    } else if (!this.hoveredTagKey) {
      this.tooltipEl.classList.add('hidden');
    }
  }

  /**
   * Computes exact screen-space rectangles behind the Blue Chips and Red Mult boxes
   * so WebGL2 Pass 3 (`flame.fs`) blazes seamlessly around and above them.
   */
  getFlameAnchor(intensity: number): FlameAnchor | null {
    if (intensity <= 0.05) return null;
    const chipsBox = this.railLayer.querySelector('#kc-chips-box') as HTMLElement | null;
    const multBox = this.railLayer.querySelector('#kc-mult-box') as HTMLElement | null;
    if (!chipsBox || !multBox) return null;
    const cr = chipsBox.getBoundingClientRect();
    const mr = multBox.getBoundingClientRect();
    if (cr.width <= 0 || mr.width <= 0) return null;
    const extraTop = Math.round(52 + Math.min(52, intensity * 7.5));
    return {
      chipsRect: {
        x: cr.left - 14,
        y: cr.top - extraTop,
        w: cr.width + 28,
        h: cr.height + extraTop + 10,
      },
      multRect: {
        x: mr.left - 14,
        y: mr.top - extraTop,
        w: mr.width + 28,
        h: mr.height + extraTop + 10,
      },
      intensity,
    };
  }

  private syncCrtOverlay(crtAmount: number): void {
    if (!this.crtEl) return;
    const clamped = Math.max(0, Math.min(100, Math.round(crtAmount)));
    if (clamped === this.lastCrtAmount) return;
    this.lastCrtAmount = clamped;

    if (clamped <= 0) {
      this.crtEl.style.display = 'none';
      return;
    }

    const t = clamped / 100;
    this.crtEl.style.display = 'block';
    this.crtEl.style.setProperty('--crt-scan-alpha', (0.05 + t * 0.2).toFixed(3));
    this.crtEl.style.setProperty('--crt-mask-alpha', (0.014 + t * 0.048).toFixed(3));
    this.crtEl.style.setProperty('--crt-vig-alpha', (0.1 + t * 0.36).toFixed(3));
    this.crtEl.style.setProperty('--crt-glow-alpha', (0.025 + t * 0.075).toFixed(3));
  }

  /**
   * Synchronize all UI layers with current SimState, geometry, settings, and choreographer.
   */
  render(
    state: SimState,
    geom: TableGeometry,
    cards: readonly VisualCard[],
    settings: RenderSettings,
    choreo: ChoreographerDisplay,
    nowSec: number
  ): void {
    this.lastHighContrast = settings.highContrastSuits;
    this.root.classList.toggle('kc-reduced-motion', settings.reducedMotion);
    this.syncCrtOverlay(settings.crtAmount);

    // 1. Toast visibility
    const nowMs = performance.now();
    if (this.toastMessage && nowMs < this.toastUntil) {
      if (this.toastEl.textContent !== this.toastMessage) {
        this.toastEl.textContent = this.toastMessage;
      }
      this.toastEl.classList.remove('hidden');
    } else {
      this.toastEl.classList.add('hidden');
    }

    // 2. Left Console Rail
    const preview = state.phase === 'PLAYING' ? previewSelectedHand(state) : null;
    const hideStaleHandMath =
      state.phase === 'SHOP' ||
      state.phase === 'BLIND_SELECT' ||
      state.phase === 'PACK_OPEN' ||
      state.phase === 'CASHOUT';
    const shownChips = choreo.active
      ? choreo.displayChips
      : hideStaleHandMath
        ? 0
        : preview
          ? preview.baseChips
          : state.currentHandChips;
    const shownMult = choreo.active
      ? choreo.displayMult
      : hideStaleHandMath
        ? 0
        : preview
          ? preview.baseMult
          : state.currentHandMult;
    const shownHandName = choreo.active
      ? choreo.handName || state.lastHandName || ''
      : state.phase === 'SHOP'
        ? 'Shop'
        : state.phase === 'BLIND_SELECT'
          ? 'Choose Blind'
          : state.phase === 'PACK_OPEN'
            ? 'Booster Pack'
            : state.phase === 'CASHOUT'
              ? 'Round Clear'
              : preview
                ? preview.displayName
                : '';
    const shownLevel = preview
      ? preview.level
      : shownHandName && state.handLevels[shownHandName as PokerHandId]
        ? state.handLevels[shownHandName as PokerHandId].level
        : 0;

    const activeBlind = getActiveBlind(state);
    const railKey = [
      state.phase,
      geom.leftRail.w,
      geom.leftRail.h,
      activeBlind?.key,
      activeBlind?.disabled,
      state.roundChips,
      state.targetChips,
      shownChips,
      shownMult,
      shownHandName,
      shownLevel,
      state.handsLeft,
      state.discardsLeft,
      state.dollars,
      state.ante,
      state.round,
      state.tags.join(','),
      choreo.flameIntensity > 0.1 ? 'FLAME' : 'NOFLAME',
      this.packManager.getMode(),
    ].join('|');

    if (railKey !== this.lastRailKey) {
      this.lastRailKey = railKey;
      this.renderLeftRail(
        state,
        geom,
        shownHandName,
        shownLevel,
        shownChips,
        shownMult,
        choreo.flameIntensity > 0.1
      );
    } else if (state.phase !== 'TITLE') {
      const cb = this.railLayer.querySelector('#kc-chips-box') as HTMLElement | null;
      const mb = this.railLayer.querySelector('#kc-mult-box') as HTMLElement | null;
      if (cb) {
        cb.style.transform =
          choreo.chipsPulse > 0.01 ? `scale(${(1 + choreo.chipsPulse * 0.13).toFixed(3)})` : '';
      }
      if (mb) {
        mb.style.transform =
          choreo.multPulse > 0.01 ? `scale(${(1 + choreo.multPulse * 0.13).toFixed(3)})` : '';
      }
    }

    // 3. Table Overlays (Title Screen / Blind Select / Shop / Cashout / Pack / Playing Controls / Trays)
    const tableKey = [
      state.phase,
      geom.viewportW,
      geom.viewportH,
      state.ante,
      state.sortMode,
      state.jokers.map((j) => j.id).join(','),
      state.consumables.map((c) => c.id).join(','),
      state.selectedCardIds.join(','),
      state.drawPile.length,
      state.fullDeck.length,
      state.handsLeft,
      state.discardsLeft,
      state.dollars,
      state.rerollCost,
      state.freeRerolls,
      state.activeBlindSlot,
      state.blinds.Small.status,
      state.blinds.Big.status,
      state.blinds.Boss.status,
      state.blinds.Boss.key,
      state.bossRerolledThisAnte,
      state.vouchers.join(','),
      state.shop ? JSON.stringify(state.shop) : '',
      state.pack
        ? `${state.pack.boosterKey}:${state.pack.chooseRemaining}:${state.pack.cards.map((c) => (c.taken ? '1' : '0')).join('')}`
        : '',
      state.cashout ? `${state.cashout.total}:${state.cashout.rows.length}` : '',
      this.selectedOwnedId ?? '',
      this.packManager.getMode(),
      this.packManager.hasCustomPackAvailable() ? '1' : '0',
      this.cb.hasSavedRun() ? '1' : '0',
      settings.highContrastSuits ? '1' : '0',
    ].join('|');

    if (tableKey !== this.lastTableKey) {
      this.lastTableKey = tableKey;
      this.renderTableLayer(state, geom, cards, settings);
    }

    // 4. Floating score popups (updated every frame while active)
    this.renderPopups(choreo);

    // 5. Active Modal
    const modalKey = [
      this.activeModal ?? 'NONE',
      this.runInfoTab,
      this.collectionTab,
      this.newRunTab,
      this.newRunDeckId,
      this.newRunStake,
      this.newRunSeeded ? '1' : '0',
      this.newRunSeed,
      this.rebindingField ?? '',
      JSON.stringify(settings),
      this.packManager.getMode(),
      this.packManager.hasCustomPackAvailable() ? '1' : '0',
      this.packManager.getStatusMessage(),
      state.vouchers.length,
      state.fullDeck.length,
    ].join('|');

    if (modalKey !== this.lastModalKey) {
      this.lastModalKey = modalKey;
      this.renderModal(state, settings);
    }

    // 6. Animate BlindChip & ShopSign sprite canvases at 10fps
    const animTick = Math.floor(nowSec * 10);
    if (animTick !== this.lastAnimTick) {
      this.lastAnimTick = animTick;
      this.stepAnimatedCanvases(animTick);
    }

    // Refresh tooltip if hovered
    if (this.lastHoveredCard) {
      this.renderTooltip(this.lastHoveredCard, this.lastHoverX, this.lastHoverY, state);
    }
  }

  private registerAnimatedCanvas(
    canvas: HTMLCanvasElement,
    atlas: AtlasKey,
    row: number,
    frames: number
  ): void {
    this.animatedCanvases.push({ canvas, atlas, row, frames });
    this.drawAtlasCellToCanvas(canvas, atlas, 0, row);
  }

  private stepAnimatedCanvases(tick: number): void {
    for (let i = this.animatedCanvases.length - 1; i >= 0; i--) {
      const entry = this.animatedCanvases[i]!;
      if (!entry.canvas.isConnected) {
        this.animatedCanvases.splice(i, 1);
        continue;
      }
      const frame = tick % entry.frames;
      this.drawAtlasCellToCanvas(entry.canvas, entry.atlas, frame, entry.row);
    }
  }

  private drawAtlasCellToCanvas(
    canvas: HTMLCanvasElement,
    atlas: AtlasKey,
    col: number,
    row: number
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = this.packManager.getAtlas(atlas);
    const spec = ATLAS_SPECS[atlas];
    const sw = img.width / spec.cols;
    const sh = img.height / spec.rows;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, col * sw, row * sh, sw, sh, 0, 0, canvas.width, canvas.height);
  }

  /**
   * Draws a real crisp pixel-art chip sprite from the `chips` atlas:
   * uses cell (4,1) (iconic smiling score chip) if populated, else falls back
   * cleanly to cell (3,0) (crisp blue poker chip).
   */
  private drawScoreChipToCanvas(canvas: HTMLCanvasElement): void {
    const img = this.packManager.getAtlas('chips');
    if (this.scoreChipAtlasRef !== img) {
      this.scoreChipAtlasRef = img;
      this.scoreChipUseCell41 = this.checkAtlasCellHasPixels(img, 'chips', 4, 1);
    }
    if (this.scoreChipUseCell41) {
      this.drawAtlasCellToCanvas(canvas, 'chips', 4, 1);
    } else {
      this.drawAtlasCellToCanvas(canvas, 'chips', 3, 0);
    }
  }

  private checkAtlasCellHasPixels(
    img: AtlasImageSource,
    atlas: AtlasKey,
    col: number,
    row: number
  ): boolean {
    try {
      const probe = document.createElement('canvas');
      probe.width = 16;
      probe.height = 16;
      const ctx = probe.getContext('2d');
      if (!ctx) return false;
      const spec = ATLAS_SPECS[atlas];
      const sw = img.width / spec.cols;
      const sh = img.height / spec.rows;
      ctx.drawImage(img, col * sw, row * sh, sw, sh, 0, 0, 16, 16);
      const data = ctx.getImageData(0, 0, 16, 16).data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i]! > 20) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private bindTagHoverTooltip(el: HTMLElement, tagKey: string): void {
    const td = TAG_MAP[tagKey];
    if (!td) return;
    el.addEventListener('mouseenter', () => {
      this.hoveredTagKey = tagKey;
      const rect = el.getBoundingClientRect();
      this.showStaticTooltip(
        td.name,
        td.desc,
        [{ label: 'Skip Tag', color: PALETTE.ORANGE }],
        rect.right + 12,
        rect.top + rect.height * 0.5
      );
    });
    el.addEventListener('mouseleave', () => {
      if (this.hoveredTagKey === tagKey) {
        this.hoveredTagKey = null;
        if (!this.lastHoveredCard) {
          this.tooltipEl.classList.add('hidden');
        }
      }
    });
  }

  private showStaticTooltip(
    title: string,
    desc: string,
    badges: Array<{ label: string; color: string }>,
    anchorX: number,
    anchorY: number
  ): void {
    if (this.activeModal) {
      this.tooltipEl.classList.add('hidden');
      return;
    }
    const badgesHtml = badges
      .map(
        (b) => `<span class="kc-tt-badge" style="background:${b.color};">${esc(b.label)}</span>`
      )
      .join('');
    this.tooltipEl.innerHTML = `
      <div class="kc-tt-title">${esc(title)}</div>
      <div class="kc-tt-desc">${formatRichDesc(desc, this.lastHighContrast)}</div>
      ${badgesHtml ? `<div class="kc-tt-badges">${badgesHtml}</div>` : ''}
    `;
    this.tooltipEl.classList.remove('hidden');
    const tw = this.tooltipEl.offsetWidth || 248;
    const th = this.tooltipEl.offsetHeight || 110;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let tx = anchorX;
    if (tx + tw + 12 > vw) tx = Math.max(12, anchorX - tw - 54);
    const ty = Math.max(12, Math.min(vh - th - 12, anchorY - th * 0.5));
    this.tooltipEl.style.left = `${Math.round(tx)}px`;
    this.tooltipEl.style.top = `${Math.round(ty)}px`;
  }

  // =========================================================================
  // Left Console Rail
  // =========================================================================

  private renderLeftRail(
    state: SimState,
    geom: TableGeometry,
    handName: string,
    handLevel: number,
    chips: number,
    mult: number,
    flaming: boolean
  ): void {
    if (state.phase === 'TITLE') {
      this.railLayer.innerHTML = '';
      return;
    }

    const r = geom.leftRail;
    const activeBlind = getActiveBlind(state);
    const blindDef = activeBlind ? BLIND_MAP[activeBlind.key] : undefined;
    const headerColor =
      activeBlind?.slot === 'Small'
        ? '#2e659e'
        : activeBlind?.slot === 'Big'
          ? '#c77f1e'
          : activeBlind?.bossColor || '#7d3a5c';
    const levelColor =
      handLevel > 0
        ? PALETTE.HAND_LEVELS[(handLevel - 1) % PALETTE.HAND_LEVELS.length]!
        : PALETTE.WHITE;

    const compact = r.h < 680;
    const isShop = state.phase === 'SHOP';

    // Top Stage: Animated Neon SHOP Sign during Shop phase; Blind Banner otherwise
    const topStageHtml = isShop
      ? `
        <div class="kc-rail-shop-marquee">
          <canvas class="kc-rail-shop-sign" width="226" height="114"></canvas>
          <div class="kc-rail-shop-sub">${renderDynaWord('Improve your run!', 'kc-dyna-char')}</div>
        </div>
      `
      : `
        <div class="kc-blind-header" style="--blind-col:${headerColor};">
          <div class="kc-blind-title-bar">${esc(activeBlind?.name ?? 'Small Blind')}</div>
          <div class="kc-blind-body">
            <canvas class="kc-blind-chip-canvas" width="58" height="58" data-blind-row="${blindDef?.pos.y ?? 0}"></canvas>
            <div class="kc-blind-meta">
              <div class="kc-muted-sm">Score at least</div>
              <div class="kc-target-score">
                <canvas class="kc-score-chip-canvas" width="22" height="22"></canvas>
                <span>${fmtNum(state.targetChips)}</span>
              </div>
              <div class="kc-blind-reward">Reward: <span class="kc-gold">${'$'.repeat(Math.max(1, Math.min(8, activeBlind?.dollars ?? 3)))}</span></div>
            </div>
          </div>
          <div class="kc-blind-desc">
            ${
              blindDef?.desc
                ? esc(activeBlind?.disabled ? '(Boss Disabled) ' + blindDef.desc : blindDef.desc)
                : `Ante ${state.ante} • ${activeBlind?.slot ?? 'Small'} Blind`
            }
          </div>
        </div>
      `;

    // Skip Tags Strip: crisp 34x34 pixel sprites from `tags` atlas with rich hover tooltips!
    const tagsHtml =
      state.tags.length > 0
        ? `<div class="kc-rail-tags">${state.tags
            .slice(-7)
            .map((tk) => {
              const td = TAG_MAP[tk];
              return `<button type="button" class="kc-rail-tag-btn interactive" data-rail-tag="${esc(tk)}" aria-label="${esc(td?.name ?? tk)}"><canvas class="kc-rail-tag-canvas" width="34" height="34" data-tag-x="${td?.pos.x ?? 0}" data-tag-y="${td?.pos.y ?? 0}"></canvas></button>`;
            })
            .join('')}</div>`
        : '';

    const displayHandLabel = handName || 'Select Cards';
    const wavyHandHtml = handName
      ? renderDynaWord(displayHandLabel, 'kc-dyna-char')
      : `<span class="kc-hand-placeholder">${esc(displayHandLabel)}</span>`;

    this.railLayer.innerHTML = `
      <aside class="kc-rail ${compact ? 'compact' : ''} ${flaming ? 'rail-flaming' : ''}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;">
        ${topStageHtml}

        <div class="kc-inset-box kc-round-score-box">
          <span class="kc-round-lbl">Round<br/>score</span>
          <div class="kc-round-score-val">
            <canvas class="kc-score-chip-canvas" width="24" height="24"></canvas>
            <span>${fmtNum(state.roundChips)}</span>
          </div>
        </div>

        <div class="kc-hand-box ${flaming ? 'flaming' : ''}">
          <div class="kc-hand-header">
            <span class="kc-hand-name">${wavyHandHtml}</span>
            ${
              handLevel > 0
                ? `<span class="kc-lvl-badge" style="background:${levelColor};">lvl.${handLevel}</span>`
                : ''
            }
          </div>
          <div class="kc-score-math">
            <div id="kc-chips-box" class="kc-math-pill kc-chips-pill">${fmtNum(chips)}</div>
            <div class="kc-math-x">X</div>
            <div id="kc-mult-box" class="kc-math-pill kc-mult-pill">${Number.isInteger(mult) ? mult : mult.toFixed(1)}</div>
          </div>
        </div>

        <div class="kc-rail-mid-grid">
          <div class="kc-rail-buttons">
            <button class="kc-btn kc-btn-red interactive" data-ui="run-info">Run Info</button>
            <button class="kc-btn kc-btn-amber interactive" data-ui="options">Options</button>
          </div>
          <div class="kc-rail-stats">
            <div class="kc-stat-pair">
              <div class="kc-stat-card">
                <div class="kc-stat-lbl">Hands</div>
                <div class="kc-stat-val kc-blue">${state.handsLeft}</div>
              </div>
              <div class="kc-stat-card">
                <div class="kc-stat-lbl">Discards</div>
                <div class="kc-stat-val kc-red">${state.discardsLeft}</div>
              </div>
            </div>
            <div class="kc-money-bar">$${state.dollars}</div>
            <div class="kc-stat-pair">
              <div class="kc-stat-card">
                <div class="kc-stat-lbl">Ante</div>
                <div class="kc-stat-val kc-amber">${state.ante}<span class="kc-ante-max">/${state.winAnte}</span></div>
              </div>
              <div class="kc-stat-card">
                <div class="kc-stat-lbl">Round</div>
                <div class="kc-stat-val kc-amber">${state.round}</div>
              </div>
            </div>
          </div>
        </div>
        ${tagsHtml}
      </aside>
    `;

    const chipCanvas = this.railLayer.querySelector('.kc-blind-chip-canvas') as HTMLCanvasElement | null;
    if (chipCanvas) {
      this.registerAnimatedCanvas(chipCanvas, 'BlindChips', blindDef?.pos.y ?? 0, 21);
    }

    const railShopSign = this.railLayer.querySelector('.kc-rail-shop-sign') as HTMLCanvasElement | null;
    if (railShopSign) {
      this.registerAnimatedCanvas(railShopSign, 'shop_sign', 0, 4);
    }

    this.railLayer.querySelectorAll<HTMLCanvasElement>('.kc-score-chip-canvas').forEach((c) => {
      this.drawScoreChipToCanvas(c);
    });

    this.railLayer.querySelectorAll<HTMLButtonElement>('[data-rail-tag]').forEach((btn) => {
      const tk = btn.dataset.railTag!;
      const cv = btn.querySelector<HTMLCanvasElement>('.kc-rail-tag-canvas');
      if (cv) {
        this.drawAtlasCellToCanvas(cv, 'tags', Number(cv.dataset.tagX ?? 0), Number(cv.dataset.tagY ?? 0));
      }
      this.bindTagHoverTooltip(btn, tk);
    });

    this.railLayer.querySelector('[data-ui="run-info"]')?.addEventListener('click', () => {
      this.cb.onPlayButtonSfx();
      this.openModal('RUN_INFO');
    });
    this.railLayer.querySelector('[data-ui="options"]')?.addEventListener('click', () => {
      this.cb.onPlayButtonSfx();
      this.openModal('OPTIONS');
    });
  }

  // =========================================================================
  // Main Table Layer (Title, Trays, Playing Controls, Blind Select, Shop, Pack, Cashout)
  // =========================================================================

  private renderTableLayer(
    state: SimState,
    geom: TableGeometry,
    cards: readonly VisualCard[],
    settings: RenderSettings
  ): void {
    if (state.phase === 'TITLE') {
      this.renderTitleScreen(settings);
      return;
    }

    const parts: string[] = [];

    // 1. Top Joker & Consumable Felt Trays (always visible in run; minimal tint keeps cards crisp!)
    const maxJokers = getEffectiveJokerSlots(state);
    const maxCons = getEffectiveConsumableSlots(state);
    parts.push(`
      <div class="kc-felt-tray" style="left:${geom.jokerTray.x}px;top:${geom.jokerTray.y}px;width:${geom.jokerTray.w}px;height:${geom.jokerTray.h}px;">
        <span class="kc-tray-counter left">${state.jokers.length}/${maxJokers}</span>
      </div>
      <div class="kc-felt-tray" style="left:${geom.consumableTray.x}px;top:${geom.consumableTray.y}px;width:${geom.consumableTray.w}px;height:${geom.consumableTray.h}px;">
        <span class="kc-tray-counter right">${state.consumables.length}/${maxCons}</span>
      </div>
    `);

    // Contextual SELL / USE action pills for clicked Joker or Consumable
    if (this.selectedOwnedId) {
      const ownedVis = cards.find(
        (c) => c.id === this.selectedOwnedId && (c.kind === 'joker' || c.kind === 'consumable')
      );
      if (ownedVis) {
        const px = Math.round(ownedVis.moveable.tx);
        const py = Math.round(ownedVis.moveable.ty + ownedVis.moveable.th * 0.5 + 8);
        if (ownedVis.kind === 'joker' && ownedVis.jokerData) {
          const j = ownedVis.jokerData;
          parts.push(`
            <div class="kc-card-actions" style="left:${px}px;top:${py}px;">
              <button class="kc-mini-btn kc-btn-green interactive" ${j.eternal ? 'disabled' : ''} data-sell-joker="${esc(j.id)}">
                ${j.eternal ? 'ETERNAL' : `SELL $${j.sellValue}`}
              </button>
            </div>
          `);
        } else if (ownedVis.kind === 'consumable' && ownedVis.consumableData) {
          const c = ownedVis.consumableData;
          const def = CONSUMABLE_MAP[c.key];
          const minSel = def?.minSelect ?? 0;
          const maxSel = def?.maxSelect ?? 0;
          const canUse =
            state.phase !== 'SCORING' &&
            (minSel === 0 ||
              (state.selectedCardIds.length >= minSel && state.selectedCardIds.length <= maxSel));
          parts.push(`
            <div class="kc-card-actions" style="left:${px}px;top:${py}px;">
              <button class="kc-mini-btn kc-btn-red interactive" ${canUse ? '' : 'disabled'} data-use-cons="${esc(c.id)}">USE</button>
              <button class="kc-mini-btn kc-btn-green interactive" data-sell-cons="${esc(c.id)}">SELL $${c.sellValue}</button>
            </div>
          `);
        }
      }
    }

    // 2. Phase-Specific Center/Bottom Arena
    if (state.phase === 'PLAYING' || state.phase === 'SCORING') {
      const canPlay =
        state.phase === 'PLAYING' && state.selectedCardIds.length > 0 && state.handsLeft > 0;
      const canDiscard =
        state.phase === 'PLAYING' && state.selectedCardIds.length > 0 && state.discardsLeft > 0;

      // Deck counter right beneath Deck Pile
      parts.push(`
        <button class="kc-deck-badge interactive" data-ui="open-deck" style="left:${geom.deckPile.x}px;top:${geom.deckPile.y + geom.deckPile.h + 8}px;width:${geom.deckPile.w}px;">
          ${state.drawPile.length}/${state.fullDeck.length}
        </button>
      `);

      // Bottom Playing Action Bar
      const barY = geom.viewportH - 62;
      parts.push(`
        <div class="kc-action-bar" style="left:${geom.handTray.x}px;top:${barY}px;width:${geom.handTray.w}px;">
          <button class="kc-btn kc-btn-blue kc-action-lg interactive" ${canPlay ? '' : 'disabled'} data-act="play">
            Play Hand
          </button>
          <div class="kc-sort-box">
            <div class="kc-sort-title">Sort Hand</div>
            <div class="kc-sort-btns">
              <button class="kc-btn kc-btn-amber kc-btn-sm interactive ${state.sortMode === 'rank' ? 'active' : ''}" data-act="sort-rank">Rank</button>
              <button class="kc-btn kc-btn-amber kc-btn-sm interactive ${state.sortMode === 'suit' ? 'active' : ''}" data-act="sort-suit">Suit</button>
            </div>
          </div>
          <button class="kc-btn kc-btn-red kc-action-lg interactive" ${canDiscard ? '' : 'disabled'} data-act="discard">
            Discard
          </button>
        </div>
      `);
    } else if (state.phase === 'BLIND_SELECT') {
      parts.push(this.buildBlindSelectHtml(state, geom));
    } else if (state.phase === 'SHOP' && state.shop) {
      parts.push(this.buildShopHtml(state, geom, cards));
    } else if (state.phase === 'CASHOUT' && state.cashout) {
      parts.push(this.buildCashoutHtml(state, geom));
    } else if (state.phase === 'PACK_OPEN' && state.pack) {
      parts.push(this.buildPackOpenHtml(state, geom, cards));
    } else if (state.phase === 'VICTORY') {
      parts.push(this.buildEndModalHtml(state, true));
    } else if (state.phase === 'GAME_OVER') {
      parts.push(this.buildEndModalHtml(state, false));
    }

    this.tableLayer.innerHTML = parts.join('');
    this.bindTableEvents(state);
  }

  private renderTitleScreen(_settings: RenderSettings): void {
    const mode = this.packManager.getMode();
    const hasCustom = this.packManager.hasCustomPackAvailable();
    const hasSave = this.cb.hasSavedRun();

    const logoK = renderDynaWord('KRUNKED', 'kc-title-letter kc-tl-white', 0);
    const logoC = renderDynaWord('CARDS', 'kc-title-letter kc-tl-red', 7);

    this.tableLayer.innerHTML = `
      <div class="kc-title-screen">
        <div class="kc-title-pack-pill interactive">
          <span class="kc-pack-dot ${mode === 'custom' ? 'custom' : 'builtin'}"></span>
          <button class="kc-pill-mini interactive" data-title="toggle-pack" title="${esc(this.packManager.getStatusMessage())}">
            ${mode === 'custom' ? 'Original Pack' : hasCustom ? 'Built-In Pixel Art' : 'Built-In Pixel Art'}
          </button>
          <button class="kc-pill-mini kc-pill-load interactive" data-title="load-pack-folder" title="Load Local Custom Pack (Folder)">Load Folder</button>
          <button class="kc-pill-mini kc-pill-load interactive" data-title="load-pack-archive" title="Load Local Custom Pack (.exe / .zip)">.EXE</button>
        </div>

        <div class="kc-logo-stage" aria-label="Krunked Cards">
          <div class="kc-dyna-logo">
            <span class="kc-logo-word">${logoK}</span>
            <span class="kc-logo-gap"></span>
            <span class="kc-logo-word">${logoC}</span>
          </div>
        </div>

        <div class="kc-title-dock">
          <div class="kc-title-main-btns">
            <button class="kc-btn kc-btn-blue kc-title-btn interactive" data-title="play">PLAY</button>
            ${
              hasSave
                ? `<button class="kc-btn kc-btn-teal kc-title-btn interactive" data-title="continue">CONTINUE</button>`
                : ''
            }
            <button class="kc-btn kc-btn-amber kc-title-btn interactive" data-title="options">OPTIONS</button>
            <button class="kc-btn kc-btn-green kc-title-btn interactive" data-title="collection">COLLECTION</button>
          </div>
        </div>
      </div>
    `;

    this.tableLayer.querySelector('[data-title="play"]')?.addEventListener('click', () => {
      this.cb.onPlayButtonSfx();
      this.openModal('NEW_RUN');
    });
    this.tableLayer.querySelector('[data-title="continue"]')?.addEventListener('click', () => {
      this.cb.onPlayButtonSfx();
      this.cb.onContinueRun();
    });
    this.tableLayer.querySelector('[data-title="collection"]')?.addEventListener('click', () => {
      this.cb.onPlayButtonSfx();
      this.openModal('COLLECTION');
    });
    this.tableLayer.querySelector('[data-title="options"]')?.addEventListener('click', () => {
      this.cb.onPlayButtonSfx();
      this.openModal('OPTIONS');
    });
    this.tableLayer.querySelector('[data-title="toggle-pack"]')?.addEventListener('click', () => {
      this.cb.onPlayButtonSfx();
      const next: ArtPackMode = this.packManager.getMode() === 'builtin' ? 'custom' : 'builtin';
      void this.cb.onSetArtPackMode(next).then(() => this.invalidateAll());
    });
    this.tableLayer.querySelector('[data-title="load-pack-folder"]')?.addEventListener('click', () => {
      this.cb.onPlayButtonSfx();
      this.folderInput.click();
    });
    this.tableLayer.querySelector('[data-title="load-pack-archive"]')?.addEventListener('click', () => {
      this.cb.onPlayButtonSfx();
      this.archiveInput.click();
    });
  }

  private buildBlindSelectHtml(state: SimState, geom: TableGeometry): string {
    const topY = geom.jokerTray.y + geom.jokerTray.h + 24;
    const h = geom.viewportH - topY - 12;
    const slots: BlindSlot[] = ['Small', 'Big', 'Boss'];
    const canRerollBoss =
      (state.vouchers.includes('v_directors_cut') || state.vouchers.includes('v_retcon')) &&
      (!state.bossRerolledThisAnte || state.vouchers.includes('v_retcon')) &&
      state.dollars - state.bankruptAt >= 10 &&
      state.blinds.Boss.status !== 'Defeated';

    const cols = slots
      .map((slot) => {
        const b = state.blinds[slot];
        const def = BLIND_MAP[b.key];
        const tag = b.tagKey ? TAG_MAP[b.tagKey] : null;
        const isCurrent = b.status === 'Select';
        const colBg =
          slot === 'Small'
            ? '#2e659e'
            : slot === 'Big'
              ? '#c77f1e'
              : b.bossColor || '#7d3a5c';

        const statusBtn = isCurrent
          ? `<button class="kc-btn kc-btn-amber interactive" data-act="select-blind">Select</button>`
          : `<div class="kc-blind-status-pill">${esc(b.status)}</div>`;

        const skipBlock =
          slot !== 'Boss' && tag
            ? `
            <div class="kc-skip-box ${isCurrent ? '' : 'upcoming-skip'}" data-skip-tag="${esc(tag.key)}">
              <div class="kc-skip-tag-row">
                <canvas class="kc-tag-canvas" width="38" height="38" data-tag-x="${tag.pos.x}" data-tag-y="${tag.pos.y}"></canvas>
                <div class="kc-skip-tag-meta">
                  <div class="kc-skip-tag-name">${esc(tag.name)}</div>
                  <div class="kc-skip-tag-desc">${esc(tag.desc)}</div>
                </div>
              </div>
              ${
                isCurrent
                  ? `<button class="kc-btn kc-btn-red kc-btn-sm interactive" data-act="skip-blind">Skip Blind</button>`
                  : `<div class="kc-skip-preview-lbl">Skip Reward</div>`
              }
            </div>
          `
            : slot === 'Boss' && canRerollBoss
              ? `<div class="kc-skip-box"><button class="kc-btn kc-btn-red kc-btn-sm interactive" data-act="reroll-boss">Reroll Boss ($10)</button></div>`
              : `<div class="kc-boss-ante-foot">Ante ${state.ante} Boss</div>`;

        return `
          <div class="kc-blind-col ${isCurrent ? 'active' : 'dimmed'}" style="--col-accent:${colBg};">
            <div class="kc-blind-col-top">${statusBtn}</div>
            <div class="kc-blind-col-banner" style="background:${colBg};">${esc(b.name)}</div>
            <div class="kc-blind-col-body">
              <canvas class="kc-blind-col-chip" width="72" height="72" data-blind-row="${def?.pos.y ?? 0}"></canvas>
              <div class="kc-muted-sm">Score at least</div>
              <div class="kc-target-score lg">
                <canvas class="kc-score-chip-canvas" width="24" height="24"></canvas>
                <span>${fmtNum(b.targetChips)}</span>
              </div>
              <div class="kc-blind-reward">Reward: <span class="kc-gold">${'$'.repeat(Math.max(1, Math.min(8, b.dollars)))}</span></div>
              ${def?.desc ? `<div class="kc-blind-col-desc">${esc(def.desc)}</div>` : ''}
            </div>
            ${skipBlock}
          </div>
        `;
      })
      .join('');

    return `
      <div class="kc-blind-arena" style="left:${geom.table.x}px;top:${topY}px;width:${geom.table.w}px;height:${h}px;">
        ${cols}
      </div>
    `;
  }

  private buildShopHtml(
    state: SimState,
    geom: TableGeometry,
    cards: readonly VisualCard[]
  ): string {
    // Frame sits cleanly below jokerTray/consumableTray X/Y counters (zero overlap!)
    const boardTop = Math.max(geom.jokerTray.y + geom.jokerTray.h + 22, geom.shopOfferTray.y - 4);
    const boardH = geom.viewportH - boardTop + 8;
    const controlsW = Math.max(132, geom.shopOfferTray.x - geom.table.x - 14);
    const canAfford = (cost: number) => state.dollars - state.bankruptAt >= cost;
    const rerollPrice = state.freeRerolls > 0 ? 0 : state.rerollCost;
    const canReroll = canAfford(rerollPrice);

    const cardButtons: string[] = [];
    for (const vc of cards) {
      if (vc.kind !== 'shop_offer' && vc.kind !== 'shop_voucher' && vc.kind !== 'shop_booster') {
        continue;
      }
      const cx = Math.round(vc.moveable.tx);
      const topTagY = Math.round(vc.moveable.ty - vc.moveable.th * 0.5 - 22);
      const btnY = Math.round(vc.moveable.ty + vc.moveable.th * 0.5 + 8);
      const cost = vc.cost ?? 0;
      const affordable = canAfford(cost);

      cardButtons.push(
        `<div class="kc-price-tag ${affordable ? '' : 'unaffordable'}" style="left:${cx}px;top:${topTagY}px;">$${cost}</div>`
      );

      if (vc.kind === 'shop_offer' && vc.shopOfferData) {
        const o = vc.shopOfferData;
        const canImmediateUse = o.kind === 'tarot' || o.kind === 'planet' || o.kind === 'spectral';
        cardButtons.push(`
          <div class="kc-card-actions" style="left:${cx}px;top:${btnY}px;">
            <button class="kc-mini-btn kc-btn-amber interactive" ${affordable ? '' : 'disabled'} data-buy-offer="${esc(o.id)}">BUY</button>
            ${
              canImmediateUse
                ? `<button class="kc-mini-btn kc-btn-red interactive" ${affordable ? '' : 'disabled'} data-buy-use-offer="${esc(o.id)}">BUY &amp; USE</button>`
                : ''
            }
          </div>
        `);
      } else if (vc.kind === 'shop_voucher' && vc.voucherOfferData) {
        cardButtons.push(`
          <div class="kc-card-actions" style="left:${cx}px;top:${btnY}px;">
            <button class="kc-mini-btn kc-btn-green interactive" ${affordable ? '' : 'disabled'} data-buy-voucher="${esc(vc.voucherOfferData.id)}">REDEEM</button>
          </div>
        `);
      } else if (vc.kind === 'shop_booster' && vc.boosterOfferData) {
        cardButtons.push(`
          <div class="kc-card-actions" style="left:${cx}px;top:${btnY}px;">
            <button class="kc-mini-btn kc-btn-purple interactive" ${affordable ? '' : 'disabled'} data-buy-booster="${esc(vc.boosterOfferData.id)}">OPEN</button>
          </div>
        `);
      }
    }

    return `
      <div class="kc-shop-board" style="left:${geom.table.x - 4}px;top:${boardTop}px;width:${geom.table.w + 8}px;height:${boardH}px;"></div>

      <div class="kc-shop-controls" style="left:${geom.table.x + 6}px;top:${geom.shopOfferTray.y}px;width:${controlsW - 10}px;height:${geom.shopOfferTray.h}px;">
        <button class="kc-btn kc-btn-red kc-shop-btn interactive" data-act="shop-next">
          Next<br/>Round
        </button>
        <button class="kc-btn kc-btn-green kc-shop-btn interactive" ${canReroll ? '' : 'disabled'} data-act="shop-reroll">
          Reroll<br/><span class="kc-reroll-cost">${rerollPrice === 0 ? 'FREE' : '$' + rerollPrice}</span>
        </button>
      </div>

      <div class="kc-shop-pocket" style="left:${geom.shopOfferTray.x}px;top:${geom.shopOfferTray.y}px;width:${geom.shopOfferTray.w}px;height:${geom.shopOfferTray.h}px;"></div>
      <div class="kc-shop-pocket kc-shop-voucher-pocket" style="left:${geom.shopVoucherTray.x}px;top:${geom.shopVoucherTray.y}px;width:${geom.shopVoucherTray.w}px;height:${geom.shopVoucherTray.h}px;">
        <span class="kc-pocket-stamp">ANTE ${state.ante} VOUCHER</span>
      </div>
      <div class="kc-shop-pocket kc-shop-booster-pocket" style="left:${geom.shopBoosterTray.x}px;top:${geom.shopBoosterTray.y}px;width:${geom.shopBoosterTray.w}px;height:${geom.shopBoosterTray.h}px;">
        <span class="kc-pocket-stamp">BOOSTER PACKS</span>
      </div>
      ${cardButtons.join('')}
    `;
  }

  private buildCashoutHtml(state: SimState, geom: TableGeometry): string {
    const co = state.cashout!;
    const topY = geom.jokerTray.y + geom.jokerTray.h + 24;
    const panelW = Math.min(580, geom.table.w - 32);
    const panelX = Math.round(geom.table.x + (geom.table.w - panelW) * 0.5);

    const rowsHtml = co.rows
      .map((r) => {
        const absD = Math.abs(r.dollars);
        const dollarPips =
          r.dollars === 0
            ? '$0'
            : r.dollars < 0
              ? `-$${absD}`
              : absD <= 7
                ? '$'.repeat(absD)
                : `${'$'.repeat(6)} ($${absD})`;
        return `
          <div class="kc-cash-row">
            <div class="kc-cash-left">
              <span class="kc-cash-label">${esc(r.label)}</span>
              ${r.detail ? `<span class="kc-cash-detail">${esc(r.detail)}</span>` : ''}
            </div>
            <span class="kc-cash-dots"></span>
            <span class="kc-cash-val" style="color:${r.color || PALETTE.MONEY};">${esc(dollarPips)}</span>
          </div>
        `;
      })
      .join('');

    return `
      <div class="kc-cashout-panel" style="left:${panelX}px;top:${topY}px;width:${panelW}px;">
        <div class="kc-cashout-header">BLIND DEFEATED!</div>
        <button class="kc-btn kc-btn-amber kc-cashout-btn interactive" data-act="finish-cashout">
          Cash Out: $${co.total}
        </button>
        <div class="kc-receipt-perf"></div>
        <div class="kc-cashout-rows">${rowsHtml}</div>
        <div class="kc-receipt-perf bottom"></div>
      </div>
    `;
  }

  private buildPackOpenHtml(
    state: SimState,
    geom: TableGeometry,
    cards: readonly VisualCard[]
  ): string {
    const pack = state.pack!;
    const def = BOOSTER_MAP[pack.boosterKey];

    const pickBtns = cards
      .filter((c) => c.kind === 'pack_card' && c.packCardData)
      .map((vc) => {
        const pc = vc.packCardData!;
        const cx = Math.round(vc.moveable.tx);
        const by = Math.round(vc.moveable.ty + vc.moveable.th * 0.5 + 10);
        let canPick = true;
        let label = pc.kind === 'joker' || pc.kind === 'playing_card' ? 'SELECT' : 'USE';
        if (pc.kind === 'tarot' || pc.kind === 'spectral') {
          const cDef = CONSUMABLE_MAP[pc.key];
          const minSel = cDef?.minSelect ?? 0;
          const maxSel = cDef?.maxSelect ?? 0;
          if (minSel > 0) {
            canPick =
              state.selectedCardIds.length >= minSel && state.selectedCardIds.length <= maxSel;
            if (!canPick) label = `PICK ${minSel}${maxSel > minSel ? '-' + maxSel : ''}`;
          }
        }
        return `
          <div class="kc-card-actions" style="left:${cx}px;top:${by}px;">
            <button class="kc-mini-btn kc-btn-green interactive" ${canPick ? '' : 'disabled'} data-pack-pick="${esc(pc.id)}">${label}</button>
          </div>
        `;
      })
      .join('');

    return `
      <div class="kc-pack-banner" style="left:${geom.packTray.x}px;top:${geom.packTray.y + 8}px;width:${geom.packTray.w}px;">
        <div>
          <span class="kc-pack-title">${esc(def?.name ?? pack.kind + ' Pack')}</span>
          <span class="kc-pack-sub">Choose ${pack.chooseRemaining} remaining</span>
        </div>
        <button class="kc-btn kc-btn-red kc-btn-sm interactive" data-act="pack-skip">Skip</button>
      </div>
      ${pickBtns}
    `;
  }

  private buildEndModalHtml(state: SimState, victory: boolean): string {
    return `
      <div class="kc-end-overlay">
        <div class="kc-modal-card kc-end-card">
          <div class="kc-end-title ${victory ? 'win' : 'lose'}">${victory ? 'YOU WIN!' : 'GAME OVER'}</div>
          <div class="kc-end-stats">
            <div><span>Best Hand</span><strong class="kc-blue">${fmtNum(state.stats.bestHand)}</strong></div>
            <div><span>Ante Reached</span><strong class="kc-amber">${state.ante} / ${state.winAnte}</strong></div>
            <div><span>Rounds Won</span><strong class="kc-amber">${state.round}</strong></div>
            <div><span>Seed</span><strong class="kc-gold">${esc(state.rng.seed)}</strong></div>
            ${
              !victory && state.stats.defeatedBy
                ? `<div><span>Defeated By</span><strong class="kc-red">${esc(state.stats.defeatedBy)}</strong></div>`
                : ''
            }
          </div>
          <div class="kc-end-btns">
            ${
              victory
                ? `<button class="kc-btn kc-btn-blue interactive" data-act="continue-endless">Continue Endless</button>`
                : `<button class="kc-btn kc-btn-blue interactive" data-act="new-run-modal">New Run</button>`
            }
            <button class="kc-btn kc-btn-red interactive" data-act="return-title">Main Menu</button>
          </div>
        </div>
      </div>
    `;
  }

  private bindTableEvents(state: SimState): void {
    // Register animated BlindChip canvases, score chip sprites, and tag sprites
    this.tableLayer.querySelectorAll<HTMLCanvasElement>('.kc-blind-col-chip').forEach((c) => {
      const row = Number(c.dataset.blindRow ?? 0);
      this.registerAnimatedCanvas(c, 'BlindChips', row, 21);
    });
    this.tableLayer.querySelectorAll<HTMLCanvasElement>('.kc-score-chip-canvas').forEach((c) => {
      this.drawScoreChipToCanvas(c);
    });
    this.tableLayer.querySelectorAll<HTMLCanvasElement>('.kc-tag-canvas').forEach((c) => {
      this.drawAtlasCellToCanvas(c, 'tags', Number(c.dataset.tagX ?? 0), Number(c.dataset.tagY ?? 0));
    });
    this.tableLayer.querySelectorAll<HTMLElement>('[data-skip-tag]').forEach((box) => {
      const tk = box.dataset.skipTag;
      if (tk) this.bindTagHoverTooltip(box, tk);
    });

    const bind = (sel: string, fn: (el: HTMLElement) => void) => {
      this.tableLayer.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this.cb.onPlayButtonSfx();
          fn(el);
        });
      });
    };

    bind('[data-act="play"]', () => this.cb.onDispatch({ type: 'PLAY_HAND' }));
    bind('[data-act="discard"]', () => this.cb.onDispatch({ type: 'DISCARD_HAND' }));
    bind('[data-act="sort-rank"]', () => this.cb.onDispatch({ type: 'SORT_HAND', mode: 'rank' }));
    bind('[data-act="sort-suit"]', () => this.cb.onDispatch({ type: 'SORT_HAND', mode: 'suit' }));
    bind('[data-act="select-blind"]', () => this.cb.onDispatch({ type: 'SELECT_BLIND' }));
    bind('[data-act="skip-blind"]', () => this.cb.onDispatch({ type: 'SKIP_BLIND' }));
    bind('[data-act="reroll-boss"]', () => this.cb.onDispatch({ type: 'REROLL_BOSS' }));
    bind('[data-act="finish-cashout"]', () => this.cb.onDispatch({ type: 'FINISH_CASHOUT' }));
    bind('[data-act="shop-next"]', () => this.cb.onDispatch({ type: 'SHOP_NEXT_ROUND' }));
    bind('[data-act="shop-reroll"]', () => this.cb.onDispatch({ type: 'SHOP_REROLL' }));
    bind('[data-act="pack-skip"]', () => this.cb.onDispatch({ type: 'PACK_SKIP' }));
    bind('[data-act="continue-endless"]', () => this.cb.onDispatch({ type: 'CONTINUE_ENDLESS' }));
    bind('[data-act="return-title"]', () => this.cb.onDispatch({ type: 'RETURN_TO_TITLE' }));
    bind('[data-act="new-run-modal"]', () => this.openModal('NEW_RUN'));
    bind('[data-ui="open-deck"]', () => {
      this.runInfoTab = 'deck';
      this.openModal('RUN_INFO');
    });

    bind('[data-sell-joker]', (el) => {
      this.selectedOwnedId = null;
      this.cb.onDispatch({ type: 'SELL_JOKER', jokerId: el.dataset.sellJoker! });
    });
    bind('[data-sell-cons]', (el) => {
      this.selectedOwnedId = null;
      this.cb.onDispatch({ type: 'SELL_CONSUMABLE', consumableId: el.dataset.sellCons! });
    });
    bind('[data-use-cons]', (el) => {
      this.selectedOwnedId = null;
      this.cb.onDispatch({
        type: 'USE_CONSUMABLE',
        consumableId: el.dataset.useCons!,
        targetCardIds: state.selectedCardIds.slice(),
      });
    });
    bind('[data-buy-offer]', (el) => {
      this.cb.onDispatch({
        type: 'SHOP_BUY_OFFER',
        offerId: el.dataset.buyOffer!,
        useImmediately: false,
      });
    });
    bind('[data-buy-use-offer]', (el) => {
      this.cb.onDispatch({
        type: 'SHOP_BUY_OFFER',
        offerId: el.dataset.buyUseOffer!,
        useImmediately: true,
      });
    });
    bind('[data-buy-voucher]', (el) => {
      this.cb.onDispatch({
        type: 'SHOP_BUY_VOUCHER',
        voucherOfferId: el.dataset.buyVoucher!,
      });
    });
    bind('[data-buy-booster]', (el) => {
      this.cb.onDispatch({
        type: 'SHOP_BUY_BOOSTER',
        boosterOfferId: el.dataset.buyBooster!,
      });
    });
    bind('[data-pack-pick]', (el) => {
      this.cb.onDispatch({
        type: 'PACK_PICK',
        packCardId: el.dataset.packPick!,
        targetCardIds: state.selectedCardIds.slice(),
      });
    });
  }

  // =========================================================================
  // Elastic Wavy DynaText Score Popups
  // =========================================================================

  private renderPopups(choreo: ChoreographerDisplay): void {
    if (choreo.popups.length === 0) {
      if (this.popupLayer.childElementCount > 0) this.popupLayer.innerHTML = '';
      return;
    }
    this.popupLayer.innerHTML = choreo.popups
      .map((p) => {
        const progress = p.age / Math.max(0.01, p.lifetime);
        const alpha = progress > 0.74 ? Math.max(0, 1 - (progress - 0.74) / 0.26) : 1;
        // Elastic pop overshoot: 0.45 -> 1.28 -> settle to 1.0 -> gentle shrink on exit
        let popScale: number;
        if (progress < 0.14) {
          const u = progress / 0.14;
          popScale = 0.45 + 0.83 * Math.sin(u * Math.PI * 0.5);
        } else if (progress < 0.34) {
          const u = (progress - 0.14) / 0.2;
          popScale = 1.28 - 0.28 * u;
        } else {
          popScale = 1.0 - Math.max(0, (progress - 0.74) * 0.45);
        }
        const isXMult = /^X\d/i.test(p.text);
        const extraClass = isXMult ? 'kc-popup-xmult' : '';
        return `
          <div class="kc-popup-pill ${extraClass}" style="left:${Math.round(p.x)}px;top:${Math.round(p.y)}px;background:${p.bgColor};color:${p.textColor};opacity:${alpha.toFixed(2)};transform:translate(-50%,-50%) scale(${popScale.toFixed(3)}) rotate(${(p.rotation * 57.3).toFixed(1)}deg);">
            ${renderDynaWord(p.text, 'kc-pop-char')}
          </div>
        `;
      })
      .join('');
  }

  // =========================================================================
  // Modals (New Run, Run Info, Collection, Options, Pause)
  // =========================================================================

  private renderModal(state: SimState, settings: RenderSettings): void {
    if (!this.activeModal) {
      this.modalLayer.innerHTML = '';
      return;
    }

    let inner = '';
    if (this.activeModal === 'NEW_RUN') inner = this.buildNewRunModalHtml();
    else if (this.activeModal === 'RUN_INFO') inner = this.buildRunInfoModalHtml(state, settings);
    else if (this.activeModal === 'COLLECTION') inner = this.buildCollectionModalHtml();
    else if (this.activeModal === 'OPTIONS') inner = this.buildOptionsModalHtml(settings);
    else if (this.activeModal === 'PAUSE') inner = this.buildPauseModalHtml();

    this.modalLayer.innerHTML = `<div class="kc-modal-backdrop interactive">${inner}</div>`;
    this.bindModalEvents(state, settings);
  }

  private buildNewRunModalHtml(): string {
    const decks =
      DECKS.length > 0
        ? DECKS
        : [{ key: 'b_red', name: 'Red Deck', order: 1, pos: { x: 0, y: 0 }, desc: '+1 discard every round', config: {} }];
    const stakes =
      STAKES.length > 0
        ? STAKES
        : [{ level: 1 as StakeLevel, key: 'stake_white', name: 'White Stake', pos: { x: 0, y: 0 }, color: '#efefef', scaling: 1 as const, desc: 'Base Difficulty' }];
    const selectedDeck = decks.find((d) => d.key === this.newRunDeckId) ?? decks[0]!;
    const selectedStake = stakes.find((s) => s.level === this.newRunStake) ?? stakes[0]!;
    const profile = this.cb.getProfile();

    const body =
      this.newRunTab === 'standard'
        ? `
        <div class="kc-newrun-grid">
          <div class="kc-deck-picker">
            <div class="kc-section-hdr">Choose Deck</div>
            <div class="kc-deck-list">
              ${decks
                .map((d) => {
                  const maxSt = profile.deckMaxStake[d.key];
                  return `
                  <button class="kc-deck-chip interactive ${d.key === selectedDeck.key ? 'active' : ''}" data-pick-deck="${esc(d.key)}">
                    <canvas class="kc-mini-sprite" width="36" height="48" data-atlas="centers" data-ax="${d.pos.x}" data-ay="${d.pos.y}"></canvas>
                    <span>${esc(d.name)}</span>
                    ${maxSt ? `<small class="kc-gold">S${maxSt}</small>` : ''}
                  </button>
                `;
                })
                .join('')}
            </div>
            <div class="kc-desc-banner">
              <div class="kc-desc-banner-title">${esc(selectedDeck.name)}</div>
              <div class="kc-parchment-inline">${formatRichDesc(selectedDeck.desc, this.lastHighContrast)}</div>
            </div>
          </div>

          <div class="kc-stake-picker">
            <div class="kc-section-hdr">Stake Difficulty</div>
            <div class="kc-stake-row">
              ${stakes
                .map(
                  (st) => `
                <button class="kc-stake-btn interactive ${st.level === selectedStake.level ? 'active' : ''}" data-pick-stake="${st.level}" style="--st-col:${st.color};">
                  <canvas class="kc-mini-sprite" width="29" height="29" data-atlas="chips" data-ax="${st.pos.x}" data-ay="${st.pos.y}"></canvas>
                  <span>${st.level}</span>
                </button>
              `
                )
                .join('')}
            </div>
            <div class="kc-desc-banner">
              <div class="kc-desc-banner-title">${esc(selectedStake.name)}</div>
              <div class="kc-parchment-inline">${formatRichDesc(selectedStake.desc, this.lastHighContrast)}</div>
            </div>

            <div class="kc-seed-row">
              <label class="kc-check-label interactive">
                <input type="checkbox" id="kc-seeded-chk" ${this.newRunSeeded ? 'checked' : ''} />
                Seeded Run
              </label>
              <input id="kc-seed-input" class="kc-input interactive" maxlength="12" placeholder="e.g. KRUNK123" value="${esc(this.newRunSeed)}" ${this.newRunSeeded ? '' : 'disabled'} />
            </div>

            <button class="kc-btn kc-btn-blue kc-start-btn interactive" data-act="start-run">START RUN</button>
          </div>
        </div>
      `
        : `
        <div class="kc-challenge-list">
          ${
            CHALLENGES.length === 0
              ? '<div class="kc-muted-sm">No challenges loaded yet.</div>'
              : CHALLENGES.map(
                  (ch) => `
              <div class="kc-challenge-row">
                <div>
                  <div class="kc-challenge-name">${esc(ch.name)}</div>
                  <div class="kc-muted-sm">${esc(ch.desc)}</div>
                </div>
                <button class="kc-btn kc-btn-amber kc-btn-sm interactive" data-start-challenge="${esc(ch.key)}">Play</button>
              </div>
            `
                ).join('')
          }
        </div>
      `;

    return `
      <div class="kc-modal-card wide">
        <div class="kc-modal-head">
          <h2>New Run</h2>
          <div class="kc-tab-row">
            <button class="kc-tab interactive ${this.newRunTab === 'standard' ? 'active' : ''}" data-nr-tab="standard">Standard</button>
            <button class="kc-tab interactive ${this.newRunTab === 'challenges' ? 'active' : ''}" data-nr-tab="challenges">Challenges (${CHALLENGES.length})</button>
          </div>
          <button class="kc-btn kc-btn-red kc-btn-sm interactive" data-modal="close">Back</button>
        </div>
        ${body}
      </div>
    `;
  }

  private buildRunInfoModalHtml(state: SimState, settings: RenderSettings): string {
    let body = '';
    if (this.runInfoTab === 'hands') {
      body = `
        <div class="kc-hands-table">
          ${POKER_HAND_IDS.map((hid) => {
            const st = state.handLevels[hid];
            if (!st || (!st.visible && st.played === 0)) return '';
            const lvlCol = PALETTE.HAND_LEVELS[(st.level - 1) % PALETTE.HAND_LEVELS.length]!;
            const def = POKER_HAND_MAP[hid];
            return `
              <div class="kc-hand-row" title="${esc(def?.desc ?? '')}">
                <span class="kc-lvl-badge" style="background:${lvlCol};">lvl.${st.level}</span>
                <span class="kc-hr-name">${esc(hid)}</span>
                <span class="kc-hr-math">
                  <span class="kc-hr-pill chips">${fmtNum(st.chips)}</span>
                  <span class="kc-hr-x">X</span>
                  <span class="kc-hr-pill mult">${st.mult}</span>
                </span>
                <span class="kc-hr-played">#${st.played}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else if (this.runInfoTab === 'blinds') {
      body = `
        <div class="kc-info-grid">
          ${(['Small', 'Big', 'Boss'] as BlindSlot[])
            .map((s) => {
              const b = state.blinds[s];
              const d = BLIND_MAP[b.key];
              return `
              <div class="kc-info-card">
                <div class="kc-info-head-row">
                  <canvas class="kc-mini-sprite" width="34" height="34" data-atlas="BlindChips" data-ax="0" data-ay="${d?.pos.y ?? 0}"></canvas>
                  <div>
                    <div class="kc-info-title">${esc(b.name)} (${b.status})</div>
                    <div class="kc-gold">Target: ${fmtNum(b.targetChips)} • $${b.dollars}</div>
                  </div>
                </div>
                <div class="kc-muted-sm">${esc(d?.desc || 'Standard Blind')}</div>
              </div>
            `;
            })
            .join('')}
        </div>
      `;
    } else if (this.runInfoTab === 'vouchers') {
      body =
        state.vouchers.length === 0
          ? `<div class="kc-empty-note">No Vouchers redeemed yet this run.</div>`
          : `<div class="kc-info-grid">${state.vouchers
              .map((vk) => {
                const v = VOUCHER_MAP[vk];
                return `
                  <div class="kc-info-card">
                    <div class="kc-info-head-row">
                      <canvas class="kc-mini-sprite" width="36" height="48" data-atlas="Voucher" data-ax="${v?.pos.x ?? 0}" data-ay="${v?.pos.y ?? 0}"></canvas>
                      <div>
                        <div class="kc-info-title">${esc(v?.name ?? vk)}</div>
                        <div class="kc-muted-sm">${esc(v?.desc ?? '')}</div>
                      </div>
                    </div>
                  </div>
                `;
              })
              .join('')}</div>`;
    } else {
      const suitCounts: Record<Suit, number> = { Hearts: 0, Diamonds: 0, Spades: 0, Clubs: 0 };
      for (const c of state.fullDeck) suitCounts[c.suit] = (suitCounts[c.suit] ?? 0) + 1;
      const uiAtlas: AtlasKey = settings.highContrastSuits ? 'ui_2' : 'ui_1';
      const suitOrder: Suit[] = ['Hearts', 'Diamonds', 'Spades', 'Clubs'];
      const suitColors = settings.highContrastSuits
        ? PALETTE.SUITS_HIGH_CONTRAST
        : { Hearts: '#fe5f55', Diamonds: '#f06a40', Spades: '#b7c7e8', Clubs: '#6ec4a7' };
      body = `
        <div class="kc-deck-summary">
          <div class="kc-suit-pills">
            ${suitOrder
              .map(
                (su) => `
              <span class="kc-suit-count-pill">
                <canvas class="kc-mini-sprite" width="18" height="18" data-atlas="${uiAtlas}" data-ax="${UI_SUIT_COLS[su]}" data-ay="1"></canvas>
                <span>${su}: <b style="color:${suitColors[su]};">${suitCounts[su]}</b></span>
              </span>
            `
              )
              .join('')}
            <span class="kc-suit-count-pill">Draw Pile: <b class="kc-gold">${state.drawPile.length}/${state.fullDeck.length}</b></span>
          </div>
          <div class="kc-deck-cards-grid">
            ${state.fullDeck
              .slice(0, 80)
              .map((c) => {
                const sym =
                  c.suit === 'Hearts' ? '♥' : c.suit === 'Diamonds' ? '♦' : c.suit === 'Spades' ? '♠' : '♣';
                const col = suitColors[c.suit];
                const inDraw = state.drawPile.includes(c.id);
                return `<span class="kc-deck-mini-card ${inDraw ? '' : 'used'}" style="color:${col};">${c.rank === '10' ? '10' : c.rank[0]}${sym}</span>`;
              })
              .join('')}
          </div>
        </div>
      `;
    }

    return `
      <div class="kc-modal-card wide">
        <div class="kc-modal-head">
          <h2>Run Info — Ante ${state.ante} (${esc(DECK_MAP[state.deckId]?.name ?? state.deckId)} • ${esc(STAKE_MAP[state.stake]?.name ?? 'Stake ' + state.stake)})</h2>
          <button class="kc-btn kc-btn-red kc-btn-sm interactive" data-modal="close">Close</button>
        </div>
        <div class="kc-tab-row">
          <button class="kc-tab interactive ${this.runInfoTab === 'hands' ? 'active' : ''}" data-ri-tab="hands">Poker Hands</button>
          <button class="kc-tab interactive ${this.runInfoTab === 'blinds' ? 'active' : ''}" data-ri-tab="blinds">Blinds</button>
          <button class="kc-tab interactive ${this.runInfoTab === 'vouchers' ? 'active' : ''}" data-ri-tab="vouchers">Vouchers (${state.vouchers.length})</button>
          <button class="kc-tab interactive ${this.runInfoTab === 'deck' ? 'active' : ''}" data-ri-tab="deck">Deck (${state.fullDeck.length})</button>
        </div>
        <div class="kc-modal-scroll">${body}</div>
      </div>
    `;
  }

  private buildCollectionModalHtml(): string {
    const profile = this.cb.getProfile();
    const tabs: Array<[typeof this.collectionTab, string, number]> = [
      ['jokers', 'Jokers', JOKERS.length],
      ['tarots', 'Tarots', TAROTS.length],
      ['planets', 'Planets', PLANETS.length],
      ['spectrals', 'Spectrals', SPECTRALS.length],
      ['vouchers', 'Vouchers', VOUCHERS.length],
      ['boosters', 'Boosters', BOOSTERS.length],
      ['blinds', 'Blinds', BLINDS.length],
      ['tags', 'Tags', TAGS.length],
      ['decks', 'Decks', DECKS.length],
    ];

    const renderCards = (
      items: Array<{
        key: string;
        name: string;
        desc: string;
        atlas: AtlasKey;
        x: number;
        y: number;
        w: number;
        h: number;
        discovered: boolean;
        badgeLabel?: string;
        badgeColor?: string;
      }>
    ) =>
      items
        .map(
          (it) => `
        <div class="kc-coll-item ${it.discovered ? 'seen' : ''}">
          <canvas class="kc-mini-sprite" width="${it.w}" height="${it.h}" data-atlas="${it.atlas}" data-ax="${it.x}" data-ay="${it.y}"></canvas>
          <div class="kc-coll-meta">
            <div class="kc-coll-head">
              <span class="kc-coll-name">${esc(it.name)} ${it.discovered ? '<span class="kc-seen-dot">★</span>' : ''}</span>
              ${it.badgeLabel ? `<span class="kc-coll-pill" style="background:${it.badgeColor};">${esc(it.badgeLabel)}</span>` : ''}
            </div>
            <div class="kc-coll-desc">${formatRichDesc(it.desc, this.lastHighContrast)}</div>
          </div>
        </div>
      `
        )
        .join('');

    let itemsHtml = '';
    if (this.collectionTab === 'jokers') {
      itemsHtml = renderCards(
        JOKERS.map((j) => ({
          key: j.key,
          name: j.name,
          desc: j.descTemplate,
          atlas: 'Joker',
          x: j.pos.x,
          y: j.pos.y,
          w: 44,
          h: 59,
          discovered: profile.discoveredJokers.includes(j.key),
          badgeLabel: RARITY_NAMES[j.rarity],
          badgeColor: PALETTE.RARITY[j.rarity - 1] ?? PALETTE.BLUE,
        }))
      );
    } else if (
      this.collectionTab === 'tarots' ||
      this.collectionTab === 'planets' ||
      this.collectionTab === 'spectrals'
    ) {
      const src: ConsumableDef[] =
        this.collectionTab === 'tarots'
          ? TAROTS
          : this.collectionTab === 'planets'
            ? PLANETS
            : SPECTRALS;
      itemsHtml = renderCards(
        src.map((c) => ({
          key: c.key,
          name: c.name,
          desc: c.desc,
          atlas: 'Tarot',
          x: c.pos.x,
          y: c.pos.y,
          w: 44,
          h: 59,
          discovered: profile.discoveredConsumables.includes(c.key),
        }))
      );
    } else if (this.collectionTab === 'vouchers') {
      itemsHtml = renderCards(
        VOUCHERS.map((v) => ({
          key: v.key,
          name: v.name,
          desc: v.desc,
          atlas: 'Voucher',
          x: v.pos.x,
          y: v.pos.y,
          w: 44,
          h: 59,
          discovered: profile.discoveredVouchers.includes(v.key),
        }))
      );
    } else if (this.collectionTab === 'boosters') {
      itemsHtml = renderCards(
        BOOSTERS.map((b) => ({
          key: b.key,
          name: b.name,
          desc: b.desc,
          atlas: 'Booster',
          x: b.pos.x,
          y: b.pos.y,
          w: 44,
          h: 59,
          discovered: true,
        }))
      );
    } else if (this.collectionTab === 'blinds') {
      itemsHtml = renderCards(
        BLINDS.map((b) => ({
          key: b.key,
          name: b.name,
          desc: b.desc || `${b.mult}x Base • $${b.dollars}`,
          atlas: 'BlindChips',
          x: 0,
          y: b.pos.y,
          w: 36,
          h: 36,
          discovered: profile.discoveredBlinds.includes(b.key),
        }))
      );
    } else if (this.collectionTab === 'tags') {
      itemsHtml = renderCards(
        TAGS.map((t) => ({
          key: t.key,
          name: t.name,
          desc: t.desc,
          atlas: 'tags',
          x: t.pos.x,
          y: t.pos.y,
          w: 36,
          h: 36,
          discovered: profile.discoveredTags.includes(t.key),
        }))
      );
    } else {
      itemsHtml = renderCards(
        DECKS.map((d) => ({
          key: d.key,
          name: d.name,
          desc: d.desc,
          atlas: 'centers',
          x: d.pos.x,
          y: d.pos.y,
          w: 44,
          h: 59,
          discovered: Boolean(profile.deckMaxStake[d.key]),
        }))
      );
    }

    return `
      <div class="kc-modal-card wide">
        <div class="kc-modal-head">
          <h2>Collection</h2>
          <button class="kc-btn kc-btn-red kc-btn-sm interactive" data-modal="close">Close</button>
        </div>
        <div class="kc-tab-row wrap">
          ${tabs
            .map(
              ([id, lbl, cnt]) =>
                `<button class="kc-tab interactive ${this.collectionTab === id ? 'active' : ''}" data-coll-tab="${id}">${lbl} (${cnt})</button>`
            )
            .join('')}
        </div>
        <div class="kc-modal-scroll kc-coll-grid">${itemsHtml}</div>
      </div>
    `;
  }

  private buildOptionsModalHtml(settings: RenderSettings): string {
    const mode = this.packManager.getMode();
    const kbEntries: Array<[keyof KeybindConfig, string]> = [
      ['playHand', 'Play Hand'],
      ['discardHand', 'Discard'],
      ['sortRank', 'Sort by Rank'],
      ['sortSuit', 'Sort by Suit'],
      ['runInfo', 'Run Info'],
      ['pause', 'Pause / Back'],
      ['debugDrawer', 'Playtest Debug Drawer'],
    ];

    return `
      <div class="kc-modal-card wide">
        <div class="kc-modal-head">
          <h2>Options</h2>
          <button class="kc-btn kc-btn-red kc-btn-sm interactive" data-modal="close">Done</button>
        </div>
        <div class="kc-modal-scroll kc-options-grid">
          <div class="kc-opt-section">
            <div class="kc-section-hdr">Video &amp; Pace</div>
            <div class="kc-opt-row">
              <span>Target FPS</span>
              <div class="kc-pill-group">
                ${([30, 60, 120] as TargetFps[])
                  .map(
                    (fps) =>
                      `<button class="kc-pill-btn interactive ${settings.targetFps === fps ? 'active' : ''}" data-opt-fps="${fps}">${fps}</button>`
                  )
                  .join('')}
              </div>
            </div>
            <div class="kc-opt-row">
              <span>Game Speed</span>
              <div class="kc-pill-group">
                ${([0.5, 1, 2, 4] as GameSpeed[])
                  .map(
                    (spd) =>
                      `<button class="kc-pill-btn interactive ${settings.gameSpeed === spd ? 'active' : ''}" data-opt-speed="${spd}">${spd}x</button>`
                  )
                  .join('')}
              </div>
            </div>
            <div class="kc-opt-row">
              <span>CRT Scanlines (${Math.round(settings.crtAmount)}%)</span>
              <input type="range" min="0" max="100" step="5" value="${settings.crtAmount}" class="kc-slider interactive" data-opt-range="crtAmount" />
            </div>
            <div class="kc-opt-row">
              <span>High-Contrast Suits</span>
              <button class="kc-pill-btn interactive ${settings.highContrastSuits ? 'active' : ''}" data-opt-toggle="highContrastSuits">${settings.highContrastSuits ? 'ON' : 'OFF'}</button>
            </div>
            <div class="kc-opt-row">
              <span>Reduced Motion</span>
              <button class="kc-pill-btn interactive ${settings.reducedMotion ? 'active' : ''}" data-opt-toggle="reducedMotion">${settings.reducedMotion ? 'ON' : 'OFF'}</button>
            </div>

            <div class="kc-section-hdr" style="margin-top:12px;">Audio</div>
            <div class="kc-opt-row">
              <span>Master (${Math.round(settings.masterVolume * 100)}%)</span>
              <input type="range" min="0" max="100" value="${Math.round(settings.masterVolume * 100)}" class="kc-slider interactive" data-opt-vol="masterVolume" />
            </div>
            <div class="kc-opt-row">
              <span>Music (${Math.round(settings.musicVolume * 100)}%)</span>
              <input type="range" min="0" max="100" value="${Math.round(settings.musicVolume * 100)}" class="kc-slider interactive" data-opt-vol="musicVolume" />
            </div>
            <div class="kc-opt-row">
              <span>SFX (${Math.round(settings.sfxVolume * 100)}%)</span>
              <input type="range" min="0" max="100" value="${Math.round(settings.sfxVolume * 100)}" class="kc-slider interactive" data-opt-vol="sfxVolume" />
            </div>
          </div>

          <div class="kc-opt-section">
            <div class="kc-section-hdr">Art &amp; Audio Pack</div>
            <div class="kc-opt-row">
              <span>Active Pack</span>
              <div class="kc-pill-group">
                <button class="kc-pill-btn interactive ${mode === 'builtin' ? 'active' : ''}" data-opt-pack="builtin">Built-In Art</button>
                <button class="kc-pill-btn interactive ${mode === 'custom' ? 'active' : ''}" data-opt-pack="custom">Custom Pack</button>
              </div>
            </div>
            <div class="kc-pack-actions">
              <button class="kc-btn kc-btn-teal kc-btn-sm interactive" data-opt-load="folder">Load Local Custom Pack (Folder)</button>
              <button class="kc-btn kc-btn-teal kc-btn-sm interactive" data-opt-load="archive">Load Local Custom Pack (.exe / .zip archive)</button>
              <button class="kc-btn kc-btn-slate kc-btn-sm interactive" data-opt-load="clear">Clear Cached Pack</button>
            </div>
            <div class="kc-muted-sm" style="margin:6px 0 12px;">${esc(this.packManager.getStatusMessage())}</div>

            <div class="kc-section-hdr">Keybinds (click to rebind)</div>
            <div class="kc-kb-list">
              ${kbEntries
                .map(([field, label]) => {
                  const waiting = this.rebindingField === field;
                  return `
                  <div class="kc-opt-row">
                    <span>${label}</span>
                    <button class="kc-pill-btn interactive ${waiting ? 'active' : ''}" data-rebind="${field}">
                      ${waiting ? 'Press a key...' : formatKeyCode(settings.keybinds[field])}
                    </button>
                  </div>
                `;
                })
                .join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private buildPauseModalHtml(): string {
    return `
      <div class="kc-modal-card narrow">
        <div class="kc-modal-head"><h2>Paused</h2></div>
        <div class="kc-pause-stack">
          <button class="kc-btn kc-btn-blue interactive" data-modal="close">Resume Run</button>
          <button class="kc-btn kc-btn-amber interactive" data-pause="options">Options</button>
          <button class="kc-btn kc-btn-green interactive" data-pause="newrun">New Run</button>
          <button class="kc-btn kc-btn-red interactive" data-pause="title">Main Menu</button>
        </div>
      </div>
    `;
  }

  private bindModalEvents(_state: SimState, _settings: RenderSettings): void {
    // Draw any mini sprite canvases inside New Run, Run Info, or Collection
    this.modalLayer.querySelectorAll<HTMLCanvasElement>('.kc-mini-sprite').forEach((c) => {
      const atlas = c.dataset.atlas as AtlasKey;
      this.drawAtlasCellToCanvas(c, atlas, Number(c.dataset.ax ?? 0), Number(c.dataset.ay ?? 0));
    });

    const backdrop = this.modalLayer.querySelector('.kc-modal-backdrop');
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        this.activeModal = null;
        this.rebindingField = null;
        this.invalidateModal();
      }
    });

    const onClick = (sel: string, fn: (el: HTMLElement) => void) => {
      this.modalLayer.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        el.addEventListener('click', () => {
          this.cb.onPlayButtonSfx();
          fn(el);
        });
      });
    };

    onClick('[data-modal="close"]', () => {
      this.activeModal = null;
      this.rebindingField = null;
      this.invalidateModal();
    });

    // New Run events
    onClick('[data-nr-tab]', (el) => {
      this.newRunTab = el.dataset.nrTab as 'standard' | 'challenges';
      this.invalidateModal();
    });
    onClick('[data-pick-deck]', (el) => {
      this.newRunDeckId = el.dataset.pickDeck!;
      this.invalidateModal();
    });
    onClick('[data-pick-stake]', (el) => {
      this.newRunStake = Number(el.dataset.pickStake) as StakeLevel;
      this.invalidateModal();
    });
    const seedChk = this.modalLayer.querySelector<HTMLInputElement>('#kc-seeded-chk');
    seedChk?.addEventListener('change', () => {
      this.newRunSeeded = seedChk.checked;
      this.invalidateModal();
    });
    const seedInput = this.modalLayer.querySelector<HTMLInputElement>('#kc-seed-input');
    seedInput?.addEventListener('input', () => {
      this.newRunSeed = seedInput.value.toUpperCase();
    });
    onClick('[data-act="start-run"]', () => {
      this.activeModal = null;
      this.invalidateAll();
      this.cb.onDispatch({
        type: 'START_RUN',
        deckId: this.newRunDeckId,
        stake: this.newRunStake,
        seed: this.newRunSeeded && this.newRunSeed.trim() ? this.newRunSeed.trim() : undefined,
        challengeId: null,
      });
    });
    onClick('[data-start-challenge]', (el) => {
      this.activeModal = null;
      this.invalidateAll();
      this.cb.onDispatch({
        type: 'START_RUN',
        deckId: 'b_red',
        stake: 1,
        challengeId: el.dataset.startChallenge!,
      });
    });

    // Run Info & Collection tabs
    onClick('[data-ri-tab]', (el) => {
      this.runInfoTab = el.dataset.riTab as typeof this.runInfoTab;
      this.invalidateModal();
    });
    onClick('[data-coll-tab]', (el) => {
      this.collectionTab = el.dataset.collTab as typeof this.collectionTab;
      this.invalidateModal();
    });

    // Options events
    onClick('[data-opt-fps]', (el) => {
      this.cb.onUpdateSettings({ targetFps: Number(el.dataset.optFps) as TargetFps });
      this.invalidateModal();
    });
    onClick('[data-opt-speed]', (el) => {
      this.cb.onUpdateSettings({ gameSpeed: Number(el.dataset.optSpeed) as GameSpeed });
      this.invalidateModal();
    });
    onClick('[data-opt-toggle]', (el) => {
      const k = el.dataset.optToggle as 'highContrastSuits' | 'reducedMotion';
      this.cb.onUpdateSettings({ [k]: !_settings[k] });
      this.invalidateModal();
    });
    this.modalLayer.querySelectorAll<HTMLInputElement>('[data-opt-range]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.optRange as 'crtAmount';
        this.cb.onUpdateSettings({ [k]: Number(inp.value) });
        const label = inp.previousElementSibling;
        if (label) label.textContent = `CRT Scanlines (${inp.value}%)`;
      });
    });
    this.modalLayer.querySelectorAll<HTMLInputElement>('[data-opt-vol]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.optVol as 'masterVolume' | 'musicVolume' | 'sfxVolume';
        const v = Number(inp.value) / 100;
        this.cb.onUpdateSettings({ [k]: v });
        const label = inp.previousElementSibling;
        if (label) {
          const title = k === 'masterVolume' ? 'Master' : k === 'musicVolume' ? 'Music' : 'SFX';
          label.textContent = `${title} (${inp.value}%)`;
        }
      });
    });
    onClick('[data-opt-pack]', (el) => {
      const mode = el.dataset.optPack as ArtPackMode;
      void this.cb.onSetArtPackMode(mode).then(() => this.invalidateAll());
    });
    onClick('[data-opt-load="folder"]', () => this.folderInput.click());
    onClick('[data-opt-load="archive"]', () => this.archiveInput.click());
    onClick('[data-opt-load="clear"]', () => {
      void this.cb.onClearCustomPack().then(() => {
        this.showToast('Cleared saved browser pack.');
        this.invalidateAll();
      });
    });
    onClick('[data-rebind]', (el) => {
      this.rebindingField = el.dataset.rebind as keyof KeybindConfig;
      this.invalidateModal();
    });

    // Pause events
    onClick('[data-pause="options"]', () => this.openModal('OPTIONS'));
    onClick('[data-pause="newrun"]', () => this.openModal('NEW_RUN'));
    onClick('[data-pause="title"]', () => {
      this.activeModal = null;
      this.invalidateAll();
      this.cb.onDispatch({ type: 'RETURN_TO_TITLE' });
    });
  }

  // =========================================================================
  // Iconic Rich Viewport-Clamped Card Tooltip
  // =========================================================================

  private renderTooltip(card: VisualCard | null, x: number, y: number, state: SimState): void {
    if (!card || this.activeModal || card.kind === 'title_showcase' || card.kind === 'deck_pile') {
      if (!this.hoveredTagKey) this.tooltipEl.classList.add('hidden');
      return;
    }

    const info = describeVisualCard(card, state);
    if (!info) {
      if (!this.hoveredTagKey) this.tooltipEl.classList.add('hidden');
      return;
    }

    const badgesHtml = info.badges
      .map(
        (b) => `<span class="kc-tt-badge" style="background:${b.color};">${esc(b.label)}</span>`
      )
      .join('');

    this.tooltipEl.innerHTML = `
      <div class="kc-tt-title">${esc(info.title)}</div>
      <div class="kc-tt-desc">${formatRichDesc(info.desc, this.lastHighContrast)}</div>
      ${badgesHtml ? `<div class="kc-tt-badges">${badgesHtml}</div>` : ''}
    `;
    this.tooltipEl.classList.remove('hidden');

    const tw = this.tooltipEl.offsetWidth || 248;
    const th = this.tooltipEl.offsetHeight || 116;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let tx = card.moveable.vx - tw * 0.5;
    let ty: number;
    if (card.kind === 'hand' || card.kind === 'play' || card.kind === 'pack_card') {
      ty = card.moveable.vy - card.moveable.vh * 0.54 - th - 12;
      if (ty < 12) ty = card.moveable.vy + card.moveable.vh * 0.54 + 12;
    } else if (card.kind === 'joker' || card.kind === 'consumable') {
      ty = card.moveable.vy + card.moveable.vh * 0.54 + 14;
    } else {
      tx = card.moveable.vx + card.moveable.vw * 0.56;
      if (tx + tw + 12 > vw) {
        tx = card.moveable.vx - card.moveable.vw * 0.56 - tw;
      }
      ty = card.moveable.vy - th * 0.5;
    }
    tx = Math.max(12, Math.min(vw - tw - 12, tx));
    ty = Math.max(12, Math.min(vh - th - 12, ty));

    this.tooltipEl.style.left = `${Math.round(tx)}px`;
    this.tooltipEl.style.top = `${Math.round(ty)}px`;
    void x;
    void y;
  }

  // =========================================================================
  // Chunky Flat-Shaded Pixel-Arcade Stylesheet & Unified CRT Overlay
  // =========================================================================

  private injectStyles(): void {
    if (document.getElementById('krunked-ui-styles')) return;
    const style = document.createElement('style');
    style.id = 'krunked-ui-styles';
    style.textContent = `
      :root {
        --krunked-font: 'KrunkedPixelBuiltin', monospace;
        --krunked-font-scale: 1;
        --kc-dark: #252d30;
        --kc-well: #1c2326;
        --kc-slate: #374244;
        --kc-slate-md: #2c3538;
        --kc-slate-lt: #4f6367;
        --kc-rim: #7c8e94;
        --kc-border: #1b2224;
      }

      /* Global razor-sharp pixel typography — ZERO browser faux-bold smearing! */
      #ui-root,
      #ui-root *,
      #ui-root button,
      #ui-root input,
      #ui-root h1,
      #ui-root h2,
      #ui-root strong,
      #ui-root b {
        font-family: var(--krunked-font);
        font-weight: 400;
        font-synthesis: none;
        -webkit-font-smoothing: none;
        -moz-osx-font-smoothing: grayscale;
        font-smooth: never;
        text-rendering: geometricPrecision;
      }

      #ui-root {
        color: #ffffff;
        letter-spacing: 0.02em;
      }
      #ui-root canvas {
        image-rendering: pixelated;
        image-rendering: crisp-edges;
      }

      .kc-layer { position: absolute; inset: 0; pointer-events: none; }
      .kc-popups { z-index: 45; }
      .kc-modal-layer { z-index: 60; }
      .hidden { display: none !important; }

      /* Wavy DynaText Character Motion */
      .kc-dyna-char {
        display: inline-block;
        animation: kc-dyna-wave 1.9s ease-in-out infinite;
        animation-delay: calc(var(--di, 0) * 0.085s);
      }
      .kc-dyna-space { display: inline-block; width: 0.34em; }
      @keyframes kc-dyna-wave {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-2px); }
      }
      .kc-reduced-motion .kc-dyna-char,
      .kc-reduced-motion .kc-title-letter,
      .kc-reduced-motion .kc-pop-char {
        animation: none !important;
      }

      /* =================================================================== */
      /* Full-Screen Unified CRT Monitor Overlay (#crt-overlay)              */
      /* =================================================================== */
      #crt-overlay::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image:
          repeating-linear-gradient(
            to bottom,
            transparent 0px,
            transparent 2px,
            rgba(0, 0, 0, var(--crt-scan-alpha, 0.12)) 2px,
            rgba(0, 0, 0, var(--crt-scan-alpha, 0.12)) 4px
          ),
          repeating-linear-gradient(
            to right,
            rgba(255, 50, 50, var(--crt-mask-alpha, 0.03)) 0px,
            rgba(255, 50, 50, var(--crt-mask-alpha, 0.03)) 1px,
            rgba(50, 255, 90, var(--crt-mask-alpha, 0.03)) 1px,
            rgba(50, 255, 90, var(--crt-mask-alpha, 0.03)) 2px,
            rgba(50, 130, 255, var(--crt-mask-alpha, 0.03)) 2px,
            rgba(50, 130, 255, var(--crt-mask-alpha, 0.03)) 3px
          );
        pointer-events: none;
      }
      #crt-overlay::after {
        content: '';
        position: absolute;
        inset: 0;
        background:
          radial-gradient(
            ellipse 74% 72% at 50% 50%,
            rgba(255, 255, 255, var(--crt-glow-alpha, 0.04)) 0%,
            transparent 58%,
            rgba(6, 10, 12, var(--crt-vig-alpha, 0.24)) 100%
          );
        box-shadow:
          inset 0 0 28px rgba(0, 0, 0, var(--crt-vig-alpha, 0.28)),
          inset 0 0 4px rgba(0, 0, 0, 0.55);
        border-radius: 18px;
        pointer-events: none;
      }

      /* =================================================================== */
      /* Left Console Rail (Chunky Flat-Shaded Slate, Zero Dead Void)        */
      /* =================================================================== */
      .kc-rail {
        position: absolute;
        display: flex;
        flex-direction: column;
        gap: 9px;
        background: var(--kc-slate-md);
        border: 3px solid var(--kc-border);
        border-radius: 12px;
        padding: 10px;
        box-shadow:
          0 6px 0 var(--kc-border),
          inset 0 3px 0 rgba(255, 255, 255, 0.1),
          inset 0 -3px 0 rgba(0, 0, 0, 0.28);
        pointer-events: auto;
      }
      .kc-rail.rail-flaming {
        background: linear-gradient(
          180deg,
          var(--kc-slate-md) 0%,
          var(--kc-slate-md) 30%,
          rgba(28, 35, 38, 0.06) 39%,
          rgba(28, 35, 38, 0.06) 62%,
          var(--kc-slate-md) 70%,
          var(--kc-slate-md) 100%
        );
      }

      /* Rail Shop Marquee (replaces Blind Header cleanly during SHOP phase) */
      .kc-rail-shop-marquee {
        background: #231920;
        border: 3px solid #fe5f55;
        border-radius: 10px;
        padding: 8px 8px 9px;
        text-align: center;
        box-shadow:
          0 4px 0 var(--kc-border),
          inset 0 2px 0 rgba(255, 255, 255, 0.16);
      }
      .kc-rail-shop-sign {
        display: block;
        width: 100%;
        max-width: 230px;
        height: auto;
        aspect-ratio: 113 / 57;
        margin: 0 auto 4px;
      }
      .kc-rail-shop-sub {
        font-size: 16px;
        color: #f3b958;
        text-shadow: 0 2px 0 #141a1c;
        letter-spacing: 0.04em;
      }

      /* Blind Banner */
      .kc-blind-header {
        background: var(--kc-well);
        border: 3px solid var(--kc-border);
        border-radius: 10px;
        overflow: hidden;
        box-shadow: 0 4px 0 #13181a;
      }
      .kc-blind-title-bar {
        background: var(--blind-col, #2e659e);
        text-align: center;
        font-size: 21px;
        padding: 6px 8px;
        color: #ffffff;
        text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
        border-bottom: 3px solid var(--kc-border);
        box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.24);
      }
      .kc-blind-body {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 10px;
      }
      .kc-blind-chip-canvas {
        width: 58px;
        height: 58px;
        flex: 0 0 58px;
      }
      .kc-blind-meta { flex: 1; min-width: 0; }
      .kc-muted-sm {
        font-size: 13px;
        color: #b8c6c9;
        line-height: 1.25;
      }
      .kc-target-score {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 26px;
        color: #fe5f55;
        text-shadow: 0 2px 0 #0f1416;
        line-height: 1.1;
        margin: 2px 0;
      }
      .kc-target-score.lg {
        justify-content: center;
        font-size: 30px;
        margin: 5px 0;
      }
      .kc-score-chip-canvas {
        width: 22px;
        height: 22px;
        flex-shrink: 0;
      }
      .kc-blind-reward {
        font-size: 15px;
        color: #e2ecee;
        text-shadow: 0 2px 0 #0f1416;
      }
      .kc-blind-desc {
        font-size: 13px;
        color: #f3ead6;
        text-align: center;
        background: #141a1d;
        border-top: 2px solid #263034;
        padding: 6px 8px;
        line-height: 1.28;
      }

      /* Round Score Well */
      .kc-inset-box {
        background: var(--kc-well);
        border: 3px solid var(--kc-border);
        border-radius: 10px;
        padding: 9px 11px;
        box-shadow: inset 0 3px 0 rgba(0, 0, 0, 0.42);
      }
      .kc-round-score-box {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .kc-round-lbl {
        font-size: 15px;
        color: #c8d6d9;
        line-height: 1.15;
        text-shadow: 0 2px 0 #0e1315;
      }
      .kc-round-score-val {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 28px;
        color: #ffffff;
        text-shadow: 0 2px 0 #0e1315;
      }

      /* Hand Score Stage (transparent backing behind roaring WebGL2 flames!) */
      .kc-hand-box {
        background: var(--kc-well);
        border: 3px solid var(--kc-border);
        border-radius: 11px;
        padding: 12px 9px 14px;
        box-shadow: inset 0 3px 0 rgba(0, 0, 0, 0.42);
        transition: border-color 0.16s, background 0.16s;
      }
      .kc-hand-box.flaming {
        background: rgba(20, 26, 30, 0.16);
        border-color: #fda200;
        box-shadow: inset 0 0 0 2px rgba(254, 95, 85, 0.35);
      }
      .kc-hand-header {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 28px;
        margin-bottom: 10px;
      }
      .kc-hand-name {
        font-size: 22px;
        color: #ffffff;
        text-shadow: 0 2px 0 #0e1315;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .kc-hand-placeholder { color: #8c9fa4; font-size: 18px; }
      .kc-lvl-badge {
        color: #161d20;
        font-size: 14px;
        padding: 2px 7px;
        border-radius: 6px;
        border: 2px solid var(--kc-border);
        box-shadow: 0 2px 0 var(--kc-border);
        flex-shrink: 0;
      }
      .kc-score-math {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 6px;
      }
      .kc-math-pill {
        border-radius: 9px;
        padding: 10px 6px;
        text-align: center;
        font-size: 28px;
        color: #ffffff;
        border: 3px solid var(--kc-border);
        text-shadow: 0 2px 0 rgba(0, 0, 0, 0.55);
        transition: transform 0.08s ease-out;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.05;
      }
      .kc-chips-pill {
        background: #009dff;
        box-shadow:
          0 5px 0 #005b99,
          inset 0 2px 0 rgba(255, 255, 255, 0.32);
      }
      .kc-mult-pill {
        background: #fe5f55;
        box-shadow:
          0 5px 0 #a82b24,
          inset 0 2px 0 rgba(255, 255, 255, 0.32);
      }
      .kc-math-x {
        font-size: 26px;
        color: #fe5f55;
        text-shadow: 0 3px 0 #141a1c;
      }

      /* Lower 2-Column Console Grid (fills lower rail cleanly with zero void!) */
      .kc-rail-mid-grid {
        flex: 1;
        display: grid;
        grid-template-columns: 0.84fr 1.16fr;
        gap: 8px;
        min-height: 196px;
      }
      .kc-rail-buttons {
        display: flex;
        flex-direction: column;
        gap: 9px;
      }
      .kc-rail-buttons .kc-btn {
        flex: 1;
        font-size: 18px;
        padding: 10px 6px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .kc-rail-stats {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .kc-stat-pair {
        flex: 1;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 7px;
      }
      .kc-stat-card {
        background: var(--kc-well);
        border: 3px solid var(--kc-border);
        border-radius: 9px;
        text-align: center;
        padding: 6px 4px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        box-shadow: inset 0 3px 0 rgba(0, 0, 0, 0.42);
      }
      .kc-stat-lbl {
        font-size: 13px;
        color: #b8c6c9;
        margin-bottom: 2px;
      }
      .kc-stat-val {
        font-size: 26px;
        line-height: 1.05;
        text-shadow: 0 2px 0 #0e1315;
      }
      .kc-ante-max {
        font-size: 15px;
        color: #9cb0b5;
      }
      .kc-money-bar {
        background: var(--kc-well);
        border: 3px solid var(--kc-border);
        border-radius: 9px;
        text-align: center;
        padding: 9px 6px;
        font-size: 30px;
        color: #f3b958;
        text-shadow: 0 3px 0 #0e1315;
        box-shadow: inset 0 3px 0 rgba(0, 0, 0, 0.45);
        line-height: 1.05;
      }

      /* Skip Tags Pixel Sprite Strip */
      .kc-rail-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        padding: 5px 6px;
        background: var(--kc-well);
        border: 2px solid var(--kc-border);
        border-radius: 8px;
        box-shadow: inset 0 2px 0 rgba(0, 0, 0, 0.4);
      }
      .kc-rail-tag-btn {
        background: transparent;
        border: none;
        padding: 0;
        cursor: pointer;
        line-height: 0;
        transition: transform 0.08s;
      }
      .kc-rail-tag-btn:hover { transform: scale(1.14) translateY(-2px); }
      .kc-rail-tag-canvas { width: 32px; height: 32px; display: block; }

      /* Compact rail fallback for short screens */
      .kc-rail.compact { gap: 6px; padding: 7px; }
      .kc-rail.compact .kc-blind-body { padding: 6px 8px; }
      .kc-rail.compact .kc-hand-box { padding: 8px 7px 10px; }
      .kc-rail.compact .kc-math-pill { font-size: 23px; padding: 7px 4px; }
      .kc-rail.compact .kc-stat-val { font-size: 22px; }
      .kc-rail.compact .kc-money-bar { font-size: 24px; padding: 6px 4px; }

      /* Signature Colors */
      .kc-blue { color: #009dff; }
      .kc-red { color: #fe5f55; }
      .kc-amber { color: #fda200; }
      .kc-gold { color: #f3b958; }

      /* =================================================================== */
      /* Chunky Tactile 3D-Extruded Arcade Buttons                           */
      /* =================================================================== */
      .kc-btn {
        color: #ffffff;
        border: 3px solid var(--kc-border);
        border-radius: 10px;
        padding: 10px 14px;
        cursor: pointer;
        text-shadow: 0 2px 0 rgba(0, 0, 0, 0.55);
        box-shadow:
          0 5px 0 var(--btn-shadow, #141a1c),
          0 5px 0 2px var(--kc-border),
          inset 0 3px 0 rgba(255, 255, 255, 0.26);
        transition: transform 0.06s, filter 0.08s;
        line-height: 1.12;
      }
      .kc-btn:hover:not(:disabled) {
        filter: brightness(1.08);
        transform: translateY(-1px);
      }
      .kc-btn:active:not(:disabled) {
        transform: translateY(3px);
        box-shadow:
          0 2px 0 var(--btn-shadow, #141a1c),
          0 2px 0 2px var(--kc-border),
          inset 0 2px 0 rgba(255, 255, 255, 0.16);
      }
      .kc-btn:disabled {
        opacity: 0.44;
        cursor: not-allowed;
        filter: grayscale(0.45);
      }
      .kc-btn-sm {
        padding: 6px 11px;
        font-size: 15px;
        border-radius: 8px;
        box-shadow:
          0 3px 0 var(--btn-shadow, #141a1c),
          0 3px 0 2px var(--kc-border),
          inset 0 2px 0 rgba(255, 255, 255, 0.24);
      }
      .kc-btn-blue { background: #009dff; --btn-shadow: #005b99; }
      .kc-btn-red { background: #fe5f55; --btn-shadow: #a82b24; }
      .kc-btn-amber { background: #fda200; --btn-shadow: #a66500; }
      .kc-btn-green { background: #4bc292; --btn-shadow: #267857; }
      .kc-btn-purple { background: #8867a5; --btn-shadow: #523969; }
      .kc-btn-teal { background: #3b8d99; --btn-shadow: #205760; }
      .kc-btn-slate { background: #4f6367; --btn-shadow: #2a373a; }

      /* =================================================================== */
      /* Felt Card Trays (Minimal veil so WebGL2 cards & shaders pop 100%!)  */
      /* =================================================================== */
      .kc-felt-tray {
        position: absolute;
        background: rgba(12, 18, 21, 0.14);
        border: 2px solid rgba(18, 26, 29, 0.72);
        border-radius: 12px;
        box-shadow:
          inset 0 3px 0 rgba(0, 0, 0, 0.24),
          0 1px 0 rgba(255, 255, 255, 0.08);
        pointer-events: none;
      }
      .kc-tray-counter {
        position: absolute;
        bottom: -20px;
        font-size: 14px;
        color: #e2edf0;
        text-shadow: 0 2px 0 #101618;
      }
      .kc-tray-counter.left { left: 6px; }
      .kc-tray-counter.right { right: 6px; }

      /* Deck Badge & Bottom Playing Action Bar */
      .kc-deck-badge {
        position: absolute;
        background: var(--kc-slate-md);
        border: 3px solid var(--kc-border);
        border-radius: 8px;
        color: #ffffff;
        font-size: 16px;
        padding: 4px 6px;
        cursor: pointer;
        text-align: center;
        text-shadow: 0 2px 0 #101618;
        box-shadow: 0 4px 0 var(--kc-border), inset 0 2px 0 rgba(255, 255, 255, 0.14);
      }
      .kc-deck-badge:hover { filter: brightness(1.1); }
      .kc-action-bar {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 14px;
        height: 54px;
      }
      .kc-action-lg {
        min-width: 156px;
        height: 50px;
        font-size: 21px;
      }
      .kc-sort-box {
        background: var(--kc-slate-md);
        border: 3px solid var(--kc-border);
        border-radius: 10px;
        padding: 4px 9px 6px;
        text-align: center;
        box-shadow: 0 4px 0 var(--kc-border), inset 0 2px 0 rgba(255, 255, 255, 0.12);
      }
      .kc-sort-title {
        font-size: 12px;
        color: #c2d1d4;
        margin-bottom: 3px;
        text-shadow: 0 1px 0 #101618;
      }
      .kc-sort-btns { display: flex; gap: 6px; }
      .kc-sort-btns .kc-btn.active {
        box-shadow:
          0 0 0 2px #ffffff,
          0 3px 0 var(--btn-shadow, #141a1c),
          inset 0 2px 0 rgba(255, 255, 255, 0.35);
      }

      /* Card Contextual Buttons & Shop Prices */
      .kc-card-actions {
        position: absolute;
        transform: translateX(-50%);
        display: flex;
        gap: 5px;
        z-index: 30;
      }
      .kc-mini-btn {
        font-size: 14px;
        color: #ffffff;
        border: 2px solid var(--kc-border);
        border-radius: 7px;
        padding: 4px 9px;
        cursor: pointer;
        white-space: nowrap;
        box-shadow:
          0 3px 0 var(--kc-border),
          inset 0 2px 0 rgba(255, 255, 255, 0.25);
        text-shadow: 0 2px 0 rgba(0, 0, 0, 0.5);
        transition: transform 0.06s;
      }
      .kc-mini-btn:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.08); }
      .kc-mini-btn:active:not(:disabled) { transform: translateY(2px); }
      .kc-mini-btn:disabled { opacity: 0.45; cursor: not-allowed; filter: grayscale(0.45); }

      .kc-price-tag {
        position: absolute;
        transform: translateX(-50%);
        background: #232b2e;
        border: 3px solid #f3b958;
        border-radius: 8px;
        color: #f3b958;
        font-size: 17px;
        padding: 1px 10px 2px;
        box-shadow: 0 4px 0 var(--kc-border);
        text-shadow: 0 2px 0 #101618;
        z-index: 28;
      }
      .kc-price-tag.unaffordable {
        border-color: #fe5f55;
        color: #fe5f55;
      }

      /* =================================================================== */
      /* Iconic Title Screen (Wavy Multi-Color DynaText Logo + Clean Dock)   */
      /* =================================================================== */
      .kc-title-screen {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        padding: 28px 24px 30px;
      }
      .kc-title-pack-pill {
        position: absolute;
        top: 14px;
        right: 16px;
        display: flex;
        align-items: center;
        gap: 6px;
        background: var(--kc-slate-md);
        border: 3px solid var(--kc-border);
        border-radius: 10px;
        padding: 5px 8px;
        box-shadow: 0 4px 0 var(--kc-border), inset 0 2px 0 rgba(255, 255, 255, 0.12);
      }
      .kc-pack-dot {
        width: 9px;
        height: 9px;
        border-radius: 2px;
        border: 1px solid var(--kc-border);
        flex-shrink: 0;
      }
      .kc-pack-dot.custom { background: #4bc292; }
      .kc-pack-dot.builtin { background: #009dff; }
      .kc-pill-mini {
        background: var(--kc-well);
        color: #e6f0f2;
        border: 2px solid var(--kc-border);
        border-radius: 6px;
        padding: 3px 8px;
        font-size: 13px;
        cursor: pointer;
        text-shadow: 0 1px 0 #0f1416;
      }
      .kc-pill-mini:hover { background: var(--kc-slate); color: #ffffff; }
      .kc-pill-load { background: #3b6f78; color: #ffffff; }
      .kc-pill-load:hover { background: #4a8a94; }

      .kc-logo-stage {
        margin-top: 8px;
        text-align: center;
        pointer-events: none;
      }
      .kc-dyna-logo {
        display: inline-flex;
        align-items: baseline;
        justify-content: center;
        flex-wrap: wrap;
        line-height: 1;
      }
      .kc-logo-word { display: inline-flex; align-items: baseline; }
      .kc-logo-gap { display: inline-block; width: clamp(18px, 2.4vw, 34px); }
      .kc-title-letter {
        display: inline-block;
        font-size: clamp(54px, 6.8vw, 88px);
        letter-spacing: 0.03em;
        padding: 0 2px;
        text-shadow:
          -3px -3px 0 #1b2224,
           3px -3px 0 #1b2224,
          -3px  3px 0 #1b2224,
           3px  3px 0 #1b2224,
           0px -3px 0 #1b2224,
           0px  3px 0 #1b2224,
          -3px  0px 0 #1b2224,
           3px  0px 0 #1b2224,
           0px  7px 0 #141a1c,
          -3px  7px 0 #141a1c,
           3px  7px 0 #141a1c,
           0px 11px 0 rgba(0, 0, 0, 0.45);
        animation: kc-logo-bob 2.4s ease-in-out infinite;
        animation-delay: calc(var(--di, 0) * 0.11s);
      }
      .kc-tl-white { color: #ffffff; }
      .kc-tl-red { color: #fe5f55; }
      .kc-title-letter:nth-child(odd) { --rot: -2.2deg; }
      .kc-title-letter:nth-child(even) { --rot: 2.2deg; }
      @keyframes kc-logo-bob {
        0%, 100% { transform: translateY(0px) rotate(var(--rot, 0deg)); }
        50% { transform: translateY(-9px) rotate(calc(var(--rot, 0deg) * -0.6)); }
      }

      .kc-title-dock {
        background: var(--kc-slate-md);
        border: 4px solid var(--kc-border);
        border-radius: 14px;
        padding: 14px 20px 18px;
        box-shadow:
          0 8px 0 #121719,
          inset 0 3px 0 rgba(255, 255, 255, 0.15),
          inset 0 -4px 0 rgba(0, 0, 0, 0.3);
        pointer-events: auto;
      }
      .kc-title-main-btns {
        display: flex;
        gap: 14px;
        flex-wrap: wrap;
        justify-content: center;
      }
      .kc-title-btn {
        min-width: 152px;
        font-size: 24px;
        padding: 13px 24px;
        letter-spacing: 0.04em;
      }

      /* =================================================================== */
      /* Blind Select Curtains (Stepped Bevel Vertical Columns)              */
      /* =================================================================== */
      .kc-blind-arena {
        position: absolute;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        align-items: stretch;
      }
      .kc-blind-col {
        background: var(--kc-slate-md);
        border: 3px solid var(--kc-border);
        border-top: 5px solid var(--col-accent, #4f6367);
        border-radius: 12px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        box-shadow:
          0 7px 0 #13181a,
          inset 0 2px 0 rgba(255, 255, 255, 0.12);
        pointer-events: auto;
        transition: transform 0.14s ease-out;
      }
      .kc-blind-col.active {
        border-color: #f3b958;
        border-top-color: #f3b958;
        transform: translateY(-6px);
        box-shadow:
          0 10px 0 #13181a,
          inset 0 0 0 2px rgba(243, 185, 88, 0.35);
      }
      .kc-blind-col.dimmed { opacity: 0.76; }
      .kc-blind-col-top { display: flex; justify-content: center; }
      .kc-blind-col-top .kc-btn { width: 100%; font-size: 21px; padding: 10px 12px; }
      .kc-blind-status-pill {
        width: 100%;
        text-align: center;
        padding: 9px 8px;
        border-radius: 8px;
        background: var(--kc-well);
        border: 2px solid var(--kc-border);
        color: #9db0b5;
        font-size: 17px;
        box-shadow: inset 0 2px 0 rgba(0, 0, 0, 0.4);
      }
      .kc-blind-col-banner {
        text-align: center;
        font-size: 22px;
        padding: 7px 8px;
        border-radius: 9px;
        border: 3px solid var(--kc-border);
        text-shadow: 0 2px 0 rgba(0, 0, 0, 0.55);
        box-shadow: 0 3px 0 var(--kc-border), inset 0 2px 0 rgba(255, 255, 255, 0.25);
      }
      .kc-blind-col-body {
        flex: 1;
        background: var(--kc-well);
        border: 3px solid var(--kc-border);
        border-radius: 10px;
        padding: 12px 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        box-shadow: inset 0 3px 0 rgba(0, 0, 0, 0.45);
      }
      .kc-blind-col-chip { width: 70px; height: 70px; margin-bottom: 6px; }
      .kc-blind-col-desc {
        font-size: 14px;
        color: #f5ebd6;
        margin-top: 8px;
        line-height: 1.3;
        background: #141a1d;
        border: 2px solid #283236;
        border-radius: 7px;
        padding: 5px 8px;
        width: 100%;
      }
      .kc-skip-box {
        background: var(--kc-well);
        border: 3px solid var(--kc-border);
        border-radius: 10px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 7px;
        box-shadow: 0 3px 0 #13181a;
      }
      .kc-skip-tag-row { display: flex; align-items: center; gap: 9px; }
      .kc-tag-canvas { width: 38px; height: 38px; flex-shrink: 0; }
      .kc-skip-tag-meta { min-width: 0; flex: 1; }
      .kc-skip-tag-name { font-size: 15px; color: #ffffff; text-shadow: 0 2px 0 #0e1315; }
      .kc-skip-tag-desc { font-size: 12px; color: #b8c6c9; line-height: 1.24; }
      .kc-skip-preview-lbl,
      .kc-boss-ante-foot {
        text-align: center;
        font-size: 13px;
        color: #9bb0b5;
        padding: 4px 6px;
        background: #141a1d;
        border-radius: 6px;
        border: 2px solid var(--kc-border);
      }

      /* =================================================================== */
      /* Authentic Bottom-Anchored Shop Tray (Coral Rim + Recessed Pockets)  */
      /* =================================================================== */
      .kc-shop-board {
        position: absolute;
        background: rgba(20, 26, 30, 0.16);
        border: 4px solid #fe5f55;
        border-bottom: none;
        border-radius: 14px 14px 0 0;
        box-shadow:
          0 0 0 3px var(--kc-border),
          inset 0 0 0 3px var(--kc-border);
        pointer-events: none;
      }
      .kc-shop-controls {
        position: absolute;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: var(--kc-slate-md);
        border: 3px solid var(--kc-border);
        border-radius: 11px;
        padding: 10px;
        box-shadow:
          0 5px 0 var(--kc-border),
          inset 0 2px 0 rgba(255, 255, 255, 0.12);
        pointer-events: auto;
      }
      .kc-shop-btn {
        flex: 1;
        font-size: 21px;
        padding: 10px 8px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      .kc-reroll-cost { font-size: 22px; color: #fff6d1; margin-top: 2px; }
      .kc-shop-pocket {
        position: absolute;
        background: rgba(14, 19, 22, 0.18);
        border: 3px solid rgba(20, 27, 30, 0.85);
        border-radius: 11px;
        box-shadow: inset 0 3px 0 rgba(0, 0, 0, 0.3);
        pointer-events: none;
      }
      .kc-pocket-stamp {
        position: absolute;
        bottom: -23px;
        left: 8px;
        font-size: 14px;
        color: #d6e4e8;
        letter-spacing: 0.06em;
        text-shadow: 0 2px 0 #101618;
      }

      /* =================================================================== */
      /* Perforated Cashout Receipt                                          */
      /* =================================================================== */
      .kc-cashout-panel {
        position: absolute;
        background: var(--kc-slate-md);
        border: 4px solid var(--kc-border);
        border-top: 6px solid #4bc292;
        border-radius: 14px;
        padding: 16px 20px 18px;
        box-shadow:
          0 8px 0 #121719,
          inset 0 2px 0 rgba(255, 255, 255, 0.12);
        pointer-events: auto;
      }
      .kc-cashout-header {
        font-size: 26px;
        text-align: center;
        color: #4bc292;
        margin-bottom: 10px;
        text-shadow: 0 3px 0 #13181a;
      }
      .kc-cashout-btn {
        width: 100%;
        font-size: 25px;
        padding: 13px 16px;
        margin-bottom: 14px;
      }
      .kc-receipt-perf {
        height: 4px;
        margin: 0 2px 10px;
        background: repeating-linear-gradient(
          to right,
          #4f6367 0px,
          #4f6367 8px,
          transparent 8px,
          transparent 14px
        );
      }
      .kc-receipt-perf.bottom { margin: 10px 2px 0; }
      .kc-cashout-rows {
        background: var(--kc-well);
        border: 3px solid var(--kc-border);
        border-radius: 10px;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 9px;
        box-shadow: inset 0 3px 0 rgba(0, 0, 0, 0.42);
      }
      .kc-cash-row {
        display: flex;
        align-items: baseline;
        gap: 8px;
        font-size: 18px;
      }
      .kc-cash-left { flex-shrink: 0; }
      .kc-cash-label { color: #ffffff; text-shadow: 0 2px 0 #0f1416; }
      .kc-cash-detail { font-size: 13px; color: #9db0b5; margin-left: 7px; }
      .kc-cash-dots {
        flex: 1;
        min-width: 18px;
        border-bottom: 3px dotted #4f6367;
        transform: translateY(-4px);
      }
      .kc-cash-val {
        flex-shrink: 0;
        font-size: 21px;
        letter-spacing: 0.04em;
        text-shadow: 0 2px 0 #0f1416;
      }

      /* Pack Open Banner */
      .kc-pack-banner {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #282e46;
        border: 3px solid #646eb7;
        border-radius: 10px;
        padding: 7px 14px;
        box-shadow: 0 5px 0 var(--kc-border), inset 0 2px 0 rgba(255, 255, 255, 0.16);
        pointer-events: auto;
      }
      .kc-pack-title { font-size: 20px; margin-right: 14px; text-shadow: 0 2px 0 #101420; }
      .kc-pack-sub { font-size: 15px; color: #f3b958; text-shadow: 0 2px 0 #101420; }

      /* =================================================================== */
      /* Elastic Wavy Score Popups                                           */
      /* =================================================================== */
      .kc-popup-pill {
        position: absolute;
        padding: 5px 12px;
        border-radius: 8px;
        border: 3px solid var(--kc-border);
        font-size: 21px;
        white-space: nowrap;
        box-shadow:
          0 5px 0 #13181a,
          inset 0 2px 0 rgba(255, 255, 255, 0.3);
        text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
      }
      .kc-popup-pill.kc-popup-xmult {
        border-color: #f3b958;
        box-shadow:
          0 0 0 2px var(--kc-border),
          0 5px 0 #13181a,
          inset 0 2px 0 rgba(255, 255, 255, 0.35);
      }
      .kc-pop-char {
        display: inline-block;
        animation: kc-dyna-wave 0.7s ease-in-out infinite;
        animation-delay: calc(var(--di, 0) * 0.045s);
      }

      /* =================================================================== */
      /* Chunky Pixel-Bevel Modals                                           */
      /* =================================================================== */
      .kc-modal-backdrop, .kc-end-overlay {
        position: absolute;
        inset: 0;
        background: rgba(10, 14, 16, 0.76);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        pointer-events: auto;
      }
      .kc-modal-card {
        background: var(--kc-slate-md);
        border: 4px solid var(--kc-border);
        border-radius: 14px;
        padding: 16px 20px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        gap: 12px;
        box-shadow:
          0 9px 0 #121719,
          inset 0 0 0 2px #586c72,
          inset 0 4px 0 rgba(255, 255, 255, 0.12);
      }
      .kc-modal-card.wide { width: min(960px, 94vw); }
      .kc-modal-card.narrow { width: min(370px, 90vw); }
      .kc-modal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .kc-modal-head h2 { font-size: 24px; text-shadow: 0 2px 0 #121719; }
      .kc-modal-scroll { overflow-y: auto; max-height: 75vh; padding-right: 6px; padding-bottom: 6px; }

      .kc-tab-row { display: flex; gap: 6px; }
      .kc-tab-row.wrap { flex-wrap: wrap; }
      .kc-tab {
        background: var(--kc-well);
        color: #c9d6d9;
        border: 2px solid var(--kc-border);
        border-radius: 8px;
        padding: 6px 12px;
        font-size: 15px;
        cursor: pointer;
        box-shadow: 0 3px 0 var(--kc-border);
      }
      .kc-tab:hover { background: var(--kc-slate); color: #ffffff; }
      .kc-tab.active {
        background: #fe5f55;
        color: #ffffff;
        box-shadow: 0 3px 0 #99261f, inset 0 2px 0 rgba(255, 255, 255, 0.25);
      }

      .kc-newrun-grid { display: grid; grid-template-columns: 1.25fr 1fr; gap: 16px; }
      .kc-section-hdr {
        font-size: 15px;
        text-transform: uppercase;
        color: #f3b958;
        margin-bottom: 6px;
        text-shadow: 0 2px 0 #121719;
      }
      .kc-deck-list {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 7px;
        max-height: 310px;
        overflow-y: auto;
        padding-right: 4px;
      }
      .kc-deck-chip {
        background: var(--kc-well);
        border: 3px solid var(--kc-border);
        border-radius: 9px;
        color: #ffffff;
        padding: 7px 5px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        font-size: 13px;
        cursor: pointer;
        box-shadow: 0 3px 0 #13181a;
      }
      .kc-deck-chip.active { border-color: #f3b958; background: #36454a; }
      .kc-mini-sprite { flex-shrink: 0; }
      .kc-desc-banner {
        margin-top: 8px;
        background: var(--kc-well);
        border: 2px solid var(--kc-border);
        border-radius: 9px;
        padding: 8px 10px;
      }
      .kc-desc-banner-title { font-size: 16px; color: #ffffff; margin-bottom: 5px; text-shadow: 0 2px 0 #101618; }
      .kc-parchment-inline {
        background: #faf6ee;
        color: #2d3538;
        border: 2px solid var(--kc-border);
        border-radius: 6px;
        padding: 6px 8px;
        font-size: 14px;
        line-height: 1.35;
      }
      .kc-stake-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
      .kc-stake-btn {
        background: var(--kc-well);
        border: 3px solid var(--kc-border);
        border-radius: 9px;
        color: #ffffff;
        padding: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        font-size: 17px;
        cursor: pointer;
        box-shadow: 0 3px 0 #13181a;
      }
      .kc-stake-btn.active { border-color: var(--st-col, #ffffff); background: #37464a; }
      .kc-seed-row { display: flex; align-items: center; gap: 10px; margin: 12px 0; }
      .kc-check-label { display: flex; align-items: center; gap: 6px; font-size: 15px; cursor: pointer; }
      .kc-input {
        flex: 1;
        background: #161c1f;
        color: #ffffff;
        border: 2px solid #4f6367;
        border-radius: 8px;
        padding: 6px 10px;
        font-size: 15px;
      }
      .kc-start-btn { width: 100%; font-size: 23px; padding: 13px; }
      .kc-challenge-list { display: flex; flex-direction: column; gap: 8px; max-height: 380px; overflow-y: auto; }
      .kc-challenge-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        background: var(--kc-well);
        border: 2px solid var(--kc-border);
        border-radius: 10px;
        padding: 10px 12px;
      }
      .kc-challenge-name { font-size: 17px; }

      /* Run Info Tables */
      .kc-hands-table { display: flex; flex-direction: column; gap: 6px; }
      .kc-hand-row {
        display: grid;
        grid-template-columns: 66px 1fr auto 56px;
        align-items: center;
        gap: 10px;
        background: var(--kc-well);
        border: 2px solid var(--kc-border);
        border-radius: 9px;
        padding: 7px 12px;
        font-size: 17px;
      }
      .kc-hr-math { display: inline-flex; align-items: center; gap: 6px; }
      .kc-hr-pill {
        display: inline-block;
        min-width: 48px;
        text-align: center;
        padding: 2px 8px;
        border-radius: 6px;
        border: 2px solid var(--kc-border);
        color: #ffffff;
        text-shadow: 0 2px 0 rgba(0, 0, 0, 0.45);
      }
      .kc-hr-pill.chips { background: #009dff; }
      .kc-hr-pill.mult { background: #fe5f55; }
      .kc-hr-x { color: #fe5f55; }
      .kc-hr-played { text-align: right; color: #9db0b5; }
      .kc-info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
      .kc-info-card {
        background: var(--kc-well);
        border: 2px solid var(--kc-border);
        border-radius: 10px;
        padding: 10px 12px;
      }
      .kc-info-head-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
      .kc-info-title { font-size: 17px; margin-bottom: 2px; }
      .kc-empty-note { padding: 18px; text-align: center; color: #b8c6c9; font-size: 16px; }
      .kc-suit-pills { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; font-size: 15px; }
      .kc-suit-count-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: var(--kc-well);
        border: 2px solid var(--kc-border);
        border-radius: 8px;
        padding: 4px 10px;
      }
      .kc-deck-cards-grid { display: flex; flex-wrap: wrap; gap: 5px; }
      .kc-deck-mini-card {
        background: var(--kc-well);
        border: 2px solid #3d4e54;
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 15px;
      }
      .kc-deck-mini-card.used { opacity: 0.36; }

      /* Collection Grid */
      .kc-coll-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 9px; }
      .kc-coll-item {
        display: flex;
        align-items: center;
        gap: 10px;
        background: var(--kc-well);
        border: 3px solid var(--kc-border);
        border-radius: 10px;
        padding: 8px 10px;
        box-shadow: 0 3px 0 #13181a;
      }
      .kc-coll-item.seen { border-color: #5b7177; }
      .kc-coll-meta { flex: 1; min-width: 0; }
      .kc-coll-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 4px; }
      .kc-coll-name { font-size: 16px; color: #ffffff; }
      .kc-coll-pill {
        font-size: 11px;
        color: #ffffff;
        padding: 1px 6px;
        border-radius: 5px;
        border: 1px solid var(--kc-border);
        flex-shrink: 0;
      }
      .kc-seen-dot { color: #f3b958; }
      .kc-coll-desc {
        background: #faf6ee;
        color: #2d3538;
        border: 2px solid var(--kc-border);
        border-radius: 6px;
        padding: 4px 7px;
        font-size: 13px;
        line-height: 1.28;
      }

      /* Options Grid */
      .kc-options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .kc-opt-section {
        background: var(--kc-well);
        border: 3px solid var(--kc-border);
        border-radius: 11px;
        padding: 11px 14px;
      }
      .kc-opt-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 4px 0;
        font-size: 15px;
      }
      .kc-pill-group { display: flex; gap: 5px; }
      .kc-pill-btn {
        background: #374244;
        color: #ffffff;
        border: 2px solid var(--kc-border);
        border-radius: 7px;
        padding: 4px 10px;
        font-size: 14px;
        cursor: pointer;
        box-shadow: 0 2px 0 var(--kc-border);
      }
      .kc-pill-btn.active { background: #009dff; border-color: #ffffff; }
      .kc-slider { width: 136px; accent-color: #fe5f55; cursor: pointer; }
      .kc-pack-actions { display: flex; flex-direction: column; gap: 7px; margin-top: 6px; }
      .kc-pause-stack { display: flex; flex-direction: column; gap: 10px; }

      /* Victory / Game Over */
      .kc-end-card { width: min(460px, 92vw); text-align: center; }
      .kc-end-title { font-size: 46px; text-shadow: 0 5px 0 #13181a; }
      .kc-end-title.win { color: #f3b958; }
      .kc-end-title.lose { color: #fe5f55; }
      .kc-end-stats {
        background: var(--kc-well);
        border: 3px solid var(--kc-border);
        border-radius: 10px;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 7px;
      }
      .kc-end-stats > div { display: flex; justify-content: space-between; font-size: 18px; }
      .kc-end-btns { display: flex; gap: 12px; justify-content: center; }

      /* =================================================================== */
      /* Iconic Rich Double-Framed Cream-Parchment Card Tooltip              */
      /* =================================================================== */
      .kc-tooltip {
        position: fixed;
        z-index: 80;
        pointer-events: none;
        width: 254px;
        background: #2f3a3d;
        border: 3px solid var(--kc-border);
        border-radius: 12px;
        padding: 9px 10px 10px;
        box-shadow:
          inset 0 0 0 2px var(--kc-rim),
          0 7px 0 rgba(0, 0, 0, 0.56);
      }
      .kc-tt-title {
        font-size: 20px;
        color: #ffffff;
        margin-bottom: 6px;
        text-align: center;
        text-shadow: 0 2px 0 #121719;
        line-height: 1.12;
      }
      .kc-tt-desc {
        background: #faf6ee;
        color: #2d3538;
        border: 2px solid var(--kc-border);
        border-radius: 7px;
        padding: 7px 9px;
        font-size: 15px;
        line-height: 1.38;
        text-align: center;
        box-shadow: inset 0 -3px 0 #dfd7c6;
      }
      .kc-tt-badges {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 5px;
        margin-top: 8px;
      }
      .kc-tt-badge {
        font-size: 13px;
        color: #ffffff;
        padding: 2px 9px 3px;
        border-radius: 6px;
        border: 2px solid var(--kc-border);
        box-shadow: 0 3px 0 var(--kc-border), inset 0 2px 0 rgba(255, 255, 255, 0.24);
        text-shadow: 0 2px 0 rgba(0, 0, 0, 0.5);
      }

      /* Rich Inline Syntax Highlighting Tokens */
      .kc-hl-chips { color: #0084e6; }
      .kc-hl-mult { color: #e03c31; }
      .kc-hl-xmult {
        display: inline-block;
        background: #fe5f55;
        color: #ffffff;
        padding: 0px 5px 1px;
        margin: 0;
        border-radius: 5px;
        border: 1px solid #9e261f;
        box-shadow: 0 2px 0 #9e261f;
        text-shadow: 0 1px 0 rgba(0, 0, 0, 0.45);
        line-height: 1.2;
      }
      .kc-hl-money { color: #c77c00; }
      .kc-hl-prob { color: #218c5c; }
      .kc-hl-tarot { color: #7d4fa3; }
      .kc-hl-spectral { color: #3b55c4; }
      .kc-hl-holo { color: #c93b7b; }
      .kc-hl-poly { color: #a644cc; }
      .kc-hl-glass { color: #1b80b5; }
      .kc-hl-steel { color: #54646e; }
      .kc-hl-neg {
        display: inline-block;
        background: #2b323b;
        color: #e2e8f5;
        padding: 0 5px;
        border-radius: 4px;
      }
      .kc-hl-suit { text-decoration: none; }

      /* Toast */
      .kc-toast {
        position: fixed;
        bottom: 16px;
        right: 18px;
        z-index: 95;
        background: var(--kc-slate-md);
        border: 3px solid #f3b958;
        border-radius: 10px;
        padding: 7px 16px;
        font-size: 16px;
        color: #ffffff;
        text-shadow: 0 2px 0 #101618;
        box-shadow: 0 5px 0 var(--kc-border);
      }
    `;
    document.head.appendChild(style);
  }
}

// ---------------------------------------------------------------------------
// Tooltip Descriptor Builder (uses live formatJokerDesc!)
// ---------------------------------------------------------------------------

function describeVisualCard(
  vc: VisualCard,
  state: SimState
): { title: string; desc: string; badges: Array<{ label: string; color: string }> } | null {
  const badges: Array<{ label: string; color: string }> = [];
  const pushEdition = (ed: VisualCard['edition']) => {
    if (ed !== 'none') {
      const def = EDITION_DEFS[ed];
      const edColor =
        ed === 'e_foil'
          ? PALETTE.BLUE
          : ed === 'e_holo'
            ? '#d94d8c'
            : ed === 'e_polychrome'
              ? '#9b59b6'
              : '#343c4a';
      badges.push({ label: def?.name ?? ed.replace('e_', ''), color: edColor });
    }
  };

  if (vc.faceDown) {
    return { title: 'Face Down Card', desc: 'Card is flipped face down.', badges: [] };
  }

  if (vc.jokerData) {
    const j = vc.jokerData;
    const def = JOKER_MAP[j.key];
    const rarity = def?.rarity ?? 1;
    badges.push({
      label: RARITY_NAMES[rarity] ?? 'Joker',
      color: PALETTE.RARITY[rarity - 1] ?? PALETTE.BLUE,
    });
    pushEdition(j.edition);
    if (j.eternal) badges.push({ label: 'Eternal', color: PALETTE.ETERNAL });
    if (j.perishable) badges.push({ label: `Perishable (${j.perishableTally})`, color: PALETTE.PERISHABLE });
    if (j.rental) badges.push({ label: 'Rental (-$3)', color: PALETTE.RENTAL });
    if (j.debuffed) badges.push({ label: 'Debuffed', color: PALETTE.RED });
    return {
      title: def?.name ?? j.key,
      desc: formatJokerDesc(j, state) || def?.descTemplate || 'Joker effect',
      badges,
    };
  }

  if (vc.consumableData) {
    const c = vc.consumableData;
    const def = CONSUMABLE_MAP[c.key];
    badges.push({
      label: c.set,
      color: c.set === 'Planet' ? PALETTE.BLUE : c.set === 'Spectral' ? PALETTE.BOOSTER : PALETTE.PURPLE,
    });
    pushEdition(c.edition);
    return { title: def?.name ?? c.key, desc: def?.desc ?? 'Consumable card', badges };
  }

  if (vc.cardData) {
    const c = vc.cardData;
    const enhDef = c.enhancement !== 'none' ? ENHANCEMENT_DEFS[c.enhancement] : null;
    const sealDef = c.seal !== 'none' ? SEAL_DEFS[c.seal] : null;
    if (enhDef) badges.push({ label: enhDef.name, color: PALETTE.GREEN });
    if (sealDef) badges.push({ label: sealDef.name, color: sealDef.color });
    pushEdition(c.edition);
    if (c.debuffed) badges.push({ label: 'Debuffed', color: PALETTE.RED });
    const title = c.enhancement === 'm_stone' ? 'Stone Card' : `${c.rank} of ${c.suit}`;
    const descParts: string[] = [];
    if (enhDef) descParts.push(enhDef.desc);
    if (sealDef) descParts.push(sealDef.desc);
    if (c.permaBonus > 0) descParts.push(`+${c.permaBonus} extra Chips`);
    if (descParts.length === 0) descParts.push('Standard playing card');
    return { title, desc: descParts.join(' • '), badges };
  }

  if (vc.shopOfferData) {
    const o = vc.shopOfferData;
    pushEdition(o.edition);
    if (o.kind === 'joker') {
      const d = JOKER_MAP[o.key];
      const r = d?.rarity ?? 1;
      badges.push({ label: RARITY_NAMES[r] ?? 'Joker', color: PALETTE.RARITY[r - 1] ?? PALETTE.BLUE });
      return { title: d?.name ?? o.key, desc: d?.descTemplate ?? 'Joker', badges };
    }
    if (o.kind === 'playing_card') {
      return {
        title: `${o.rank ?? 'Ace'} of ${o.suit ?? 'Spades'}`,
        desc:
          o.enhancement && o.enhancement !== 'none'
            ? (ENHANCEMENT_DEFS[o.enhancement]?.desc ?? o.enhancement)
            : 'Add to your deck',
        badges,
      };
    }
    const cd = CONSUMABLE_MAP[o.key];
    badges.push({
      label: cd?.set ?? o.kind,
      color: cd?.set === 'Planet' ? PALETTE.BLUE : cd?.set === 'Spectral' ? PALETTE.BOOSTER : PALETTE.PURPLE,
    });
    return { title: cd?.name ?? o.key, desc: cd?.desc ?? '', badges };
  }

  if (vc.voucherOfferData) {
    const vd = VOUCHER_MAP[vc.voucherOfferData.key];
    badges.push({ label: 'Voucher', color: PALETTE.VOUCHER });
    return { title: vd?.name ?? vc.voucherOfferData.key, desc: vd?.desc ?? '', badges };
  }

  if (vc.boosterOfferData) {
    const bd = BOOSTER_MAP[vc.boosterOfferData.key];
    badges.push({ label: `${vc.boosterOfferData.size} Booster`, color: PALETTE.BOOSTER });
    return { title: bd?.name ?? vc.boosterOfferData.key, desc: bd?.desc ?? '', badges };
  }

  if (vc.packCardData) {
    const pc = vc.packCardData;
    pushEdition(pc.edition);
    if (pc.kind === 'joker') {
      const d = JOKER_MAP[pc.key];
      const r = d?.rarity ?? 1;
      badges.push({ label: RARITY_NAMES[r] ?? 'Joker', color: PALETTE.RARITY[r - 1] ?? PALETTE.BLUE });
      return { title: d?.name ?? pc.key, desc: d?.descTemplate ?? '', badges };
    }
    if (pc.kind === 'playing_card') {
      return {
        title: `${pc.rank ?? 'Ace'} of ${pc.suit ?? 'Hearts'}`,
        desc:
          pc.enhancement && pc.enhancement !== 'none'
            ? (ENHANCEMENT_DEFS[pc.enhancement]?.desc ?? '')
            : 'Add this card to your deck',
        badges,
      };
    }
    const cd = CONSUMABLE_MAP[pc.key];
    badges.push({
      label: cd?.set ?? pc.kind,
      color: cd?.set === 'Planet' ? PALETTE.BLUE : cd?.set === 'Spectral' ? PALETTE.BOOSTER : PALETTE.PURPLE,
    });
    return { title: cd?.name ?? pc.key, desc: cd?.desc ?? '', badges };
  }

  return null;
}
