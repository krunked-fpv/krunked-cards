// ============================================================================
// Krunked Cards — Chunky Pixel-Arcade HUD, 3-Mode Responsive Arenas,
// Rich Tactical Tooltips, Deck Matrix, Run History & Unified CRT Overlay.
// ============================================================================

import {
  ATLAS_SPECS,
  PALETTE,
  POKER_HAND_IDS,
  RANKS,
  SUITS,
  type ArtPackMode,
  type AtlasKey,
  type BlindSlot,
  type BossWarningInfo,
  type ConsumableDef,
  type GameSpeed,
  type KeybindConfig,
  type LayoutMode,
  type PokerHandId,
  type ProfileProgress,
  type Rank,
  type RenderSettings,
  type RunHistoryEntry,
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
  CHALLENGE_MAP,
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
  getBossHandWarning,
  getConsumablePreview,
  getDeckBreakdown,
  getEffectiveConsumableSlots,
  getEffectiveJokerSlots,
  getJokerLiveMeta,
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
  getRunHistory(): RunHistoryEntry[];
  onCycleGameSpeed(): GameSpeed;
  onReplaySeed(deckId: string, stake: StakeLevel, seed: string, challengeId?: string | null): void;
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

const MATRIX_RANKS: readonly Rank[] = [...RANKS].reverse();

function shortRankLabel(r: Rank): string {
  if (r === '10') return '10';
  return r[0]!;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to execCommand below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

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
    | 'decks'
    | 'history' = 'jokers';
  private collectionSearch = '';
  private collectionFilter: 'all' | 'discovered' | 'undiscovered' = 'all';
  private collectionRarity: 0 | 1 | 2 | 3 | 4 = 0;
  private newRunTab: 'standard' | 'challenges' = 'standard';
  private newRunDeckId = 'b_red';
  private newRunStake: StakeLevel = 1;
  private newRunSeeded = false;
  private newRunSeed = '';

  private rebindingField: keyof KeybindConfig | null = null;
  private selectedOwnedId: string | null = null;
  private toastMessage: string | null = null;
  private toastUntil = 0;

  // Boss Intro Banner & Fast-Forward Indicator
  private bossBannerUntil = 0;
  private bossBannerActive = false;

  // Persistent DOM layers
  private railLayer: HTMLDivElement;
  private tableLayer: HTMLDivElement;
  private popupLayer: HTMLDivElement;
  private modalLayer: HTMLDivElement;
  private tooltipEl: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private bossBannerEl: HTMLDivElement;
  private ffBadgeEl: HTMLDivElement;
  private crtEl: HTMLDivElement | null = null;
  private folderInput: HTMLInputElement;
  private archiveInput: HTMLInputElement;

  // Dirty-checking keys to avoid tearing down DOM on every 120fps frame
  private lastRailKey = '';
  private lastTableKey = '';
  private lastModalKey = '';
  private lastCrtAmount = -1;
  private lastHighContrast = false;
  private lastViewportW = 1280;
  private lastViewportH = 720;
  private lastMode: LayoutMode = 'desktop';
  private lastPhaseForInspect: SimState['phase'] | null = null;
  private lastHoveredCard: VisualCard | null = null;
  private lastHoverX = 0;
  private lastHoverY = 0;
  private inspectedCard: VisualCard | null = null;
  private inspectX = 0;
  private inspectY = 0;
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

    this.bossBannerEl = document.createElement('div');
    this.bossBannerEl.className = 'kc-boss-banner hidden';
    this.bossBannerEl.setAttribute('aria-live', 'polite');

    this.ffBadgeEl = document.createElement('div');
    this.ffBadgeEl.className = 'kc-ff-badge hidden';
    this.ffBadgeEl.textContent = '>> 2.6x';

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
      this.bossBannerEl,
      this.ffBadgeEl,
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
    if (this.activeModal) this.dismissInspect();
    this.invalidateModal();
  }

  togglePause(phase: SimState['phase']): void {
    if (this.activeModal) {
      this.activeModal = null;
      this.rebindingField = null;
    } else if (phase !== 'TITLE') {
      this.activeModal = 'PAUSE';
      this.dismissInspect();
    }
    this.invalidateModal();
  }

  openModal(modal: ActiveModal): void {
    this.activeModal = modal;
    this.rebindingField = null;
    if (modal !== null) this.dismissInspect();
    this.invalidateModal();
  }

  getSelectedOwnedId(): string | null {
    return this.selectedOwnedId;
  }

  setSelectedOwned(id: string | null): void {
    const next = id === null ? null : this.selectedOwnedId === id ? null : id;
    if (next === this.selectedOwnedId) return;
    this.selectedOwnedId = next;
    this.lastTableKey = '';
  }

  showToast(msg: string, durationMs = 2400): void {
    this.toastMessage = msg;
    this.toastUntil = performance.now() + durationMs;
  }

  showBossBanner(name: string, desc: string, bossColor: string): void {
    const safeColor = bossColor || '#a84024';
    this.bossBannerEl.style.setProperty('--boss-col', safeColor);
    this.bossBannerEl.innerHTML = `
      <div class="kc-boss-banner-tag">BOSS BLIND</div>
      <div class="kc-boss-banner-name">${esc(name)}</div>
      <div class="kc-boss-banner-desc">${esc(desc)}</div>
    `;
    this.bossBannerEl.classList.remove('hidden');
    // Restart entry animation cleanly
    this.bossBannerEl.classList.remove('animate-in');
    void this.bossBannerEl.offsetWidth;
    this.bossBannerEl.classList.add('animate-in');
    this.bossBannerUntil = performance.now() + 2600;
    this.bossBannerActive = true;
  }

  dismissBossBanner(): void {
    this.bossBannerUntil = 0;
    this.bossBannerActive = false;
    this.bossBannerEl.classList.add('hidden');
    this.bossBannerEl.classList.remove('animate-in');
  }

  inspectCard(card: VisualCard, x: number, y: number, state: SimState): void {
    if (this.activeModal || card.kind === 'title_showcase' || card.kind === 'deck_pile') {
      return;
    }
    this.inspectedCard = card;
    this.inspectX = x;
    this.inspectY = y;
    this.hoveredTagKey = null;
    this.renderTooltip(card, x, y, state, true);
  }

  dismissInspect(): void {
    this.inspectedCard = null;
    if (!this.lastHoveredCard && !this.hoveredTagKey) {
      this.tooltipEl.classList.add('hidden');
    }
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
      this.renderTooltip(card, x, y, state, false);
    } else if (this.inspectedCard) {
      this.renderTooltip(this.inspectedCard, this.inspectX, this.inspectY, state, true);
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
    this.lastViewportW = geom.viewportW;
    this.lastViewportH = geom.viewportH;
    this.lastMode = geom.mode;
    this.root.classList.toggle('kc-reduced-motion', settings.reducedMotion);
    this.root.classList.toggle('kc-mode-desktop', geom.mode === 'desktop');
    this.root.classList.toggle('kc-mode-mobile-landscape', geom.mode === 'mobile-landscape');
    this.root.classList.toggle('kc-mode-mobile-portrait', geom.mode === 'mobile-portrait');
    this.syncCrtOverlay(settings.crtAmount);

    if (this.lastPhaseForInspect !== null && this.lastPhaseForInspect !== state.phase) {
      this.dismissInspect();
    }
    this.lastPhaseForInspect = state.phase;

    // 1. Toast, Boss Intro Banner & Fast-Forward Badge visibility
    const nowMs = performance.now();
    if (this.toastMessage && nowMs < this.toastUntil) {
      if (this.toastEl.textContent !== this.toastMessage) {
        this.toastEl.textContent = this.toastMessage;
      }
      this.toastEl.classList.remove('hidden');
    } else {
      this.toastEl.classList.add('hidden');
    }

    if (this.bossBannerActive && nowMs >= this.bossBannerUntil) {
      this.dismissBossBanner();
    }

    const showFf = state.phase === 'SCORING' && Boolean(choreo.fastForward);
    this.ffBadgeEl.classList.toggle('hidden', !showFf);
    if (showFf) {
      const ffx = Math.round(geom.playArea.x + geom.playArea.w - 10);
      const ffy = Math.round(Math.max(geom.playArea.y + 6, geom.jokerTray.y + geom.jokerTray.h + 18));
      this.ffBadgeEl.style.left = `${ffx}px`;
      this.ffBadgeEl.style.top = `${ffy}px`;
    }

    // 2. HUD (Desktop Rail / Compact Landscape Rail / Portrait Top HUD Dock)
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
      geom.mode,
      geom.hudDock.x,
      geom.hudDock.y,
      geom.hudDock.w,
      geom.hudDock.h,
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
      settings.gameSpeed,
      state.tags.join(','),
      choreo.flameIntensity > 0.1 ? 'FLAME' : 'NOFLAME',
      this.packManager.getMode(),
    ].join('|');

    if (railKey !== this.lastRailKey) {
      this.lastRailKey = railKey;
      if (geom.mode === 'mobile-portrait') {
        this.renderPortraitHud(
          state,
          geom,
          shownHandName,
          shownLevel,
          shownChips,
          shownMult,
          choreo.flameIntensity > 0.1,
          settings.gameSpeed
        );
      } else {
        this.renderLeftRail(
          state,
          geom,
          shownHandName,
          shownLevel,
          shownChips,
          shownMult,
          choreo.flameIntensity > 0.1,
          settings.gameSpeed
        );
      }
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
    const bossWarning = state.phase === 'PLAYING' ? getBossHandWarning(state) : null;
    const tableKey = [
      state.phase,
      geom.mode,
      geom.viewportW,
      geom.viewportH,
      geom.actionBar.x,
      geom.actionBar.y,
      geom.actionBar.w,
      geom.actionBar.h,
      geom.shopControls.x,
      geom.shopControls.y,
      geom.shopControls.w,
      geom.shopControls.h,
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
      state.blinds.Boss.disabled ? '1' : '0',
      state.bossRerolledThisAnte,
      state.vouchers.join(','),
      state.shop ? JSON.stringify(state.shop) : '',
      state.pack
        ? `${state.pack.boosterKey}:${state.pack.chooseRemaining}:${state.pack.cards.map((c) => (c.taken ? '1' : '0')).join('')}`
        : '',
      state.cashout ? `${state.cashout.total}:${state.cashout.rows.length}` : '',
      bossWarning ? `${bossWarning.severity}:${bossWarning.message}` : '',
      this.selectedOwnedId ?? '',
      this.packManager.getMode(),
      this.packManager.hasCustomPackAvailable() ? '1' : '0',
      this.cb.hasSavedRun() ? '1' : '0',
      settings.highContrastSuits ? '1' : '0',
    ].join('|');

    if (tableKey !== this.lastTableKey) {
      this.lastTableKey = tableKey;
      this.renderTableLayer(state, geom, cards, settings, bossWarning);
    }

    // 4. Floating score popups (updated every frame while active)
    this.renderPopups(choreo);

    // 5. Active Modal
    const modalKey = [
      this.activeModal ?? 'NONE',
      geom.mode,
      this.runInfoTab,
      this.collectionTab,
      this.collectionFilter,
      this.collectionRarity,
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
      state.drawPile.length,
      state.selectedCardIds.join(','),
      this.cb.getRunHistory().length,
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

    // 7. Refresh hovered or touch-inspected tooltip (auto-dismiss if inspected card vanished)
    if (this.lastHoveredCard) {
      const freshHover = cards.find((c) => c.id === this.lastHoveredCard!.id) ?? this.lastHoveredCard;
      this.renderTooltip(freshHover, this.lastHoverX, this.lastHoverY, state, false);
    } else if (this.inspectedCard) {
      const freshInspect = cards.find((c) => c.id === this.inspectedCard!.id) ?? null;
      if (freshInspect) {
        this.inspectedCard = freshInspect;
        this.renderTooltip(freshInspect, this.inspectX, this.inspectY, state, true);
      } else {
        this.dismissInspect();
      }
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
    const show = () => {
      this.hoveredTagKey = tagKey;
      const rect = el.getBoundingClientRect();
      this.showStaticTooltip(
        td.name,
        td.desc,
        [{ label: 'Skip Tag', color: PALETTE.ORANGE }],
        rect.left + rect.width * 0.5,
        rect.top + rect.height * 0.5
      );
    };
    el.addEventListener('mouseenter', show);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.hoveredTagKey === tagKey && !this.tooltipEl.classList.contains('hidden')) {
        this.hoveredTagKey = null;
        if (!this.lastHoveredCard && !this.inspectedCard) {
          this.tooltipEl.classList.add('hidden');
        }
      } else {
        show();
      }
    });
    el.addEventListener('mouseleave', () => {
      if (this.hoveredTagKey === tagKey) {
        this.hoveredTagKey = null;
        if (!this.lastHoveredCard && !this.inspectedCard) {
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
    const vw = this.lastViewportW || window.innerWidth;
    const vh = this.lastViewportH || window.innerHeight;
    let tx = anchorX + 24;
    if (tx + tw + 8 > vw) tx = anchorX - tw * 0.5;
    let ty = anchorY > vh * 0.52 ? anchorY - th - 22 : anchorY + 24;
    tx = Math.max(8, Math.min(vw - tw - 8, tx));
    ty = Math.max(8, Math.min(vh - th - 8, ty));
    this.tooltipEl.style.left = `${Math.round(tx)}px`;
    this.tooltipEl.style.top = `${Math.round(ty)}px`;
  }

  // =========================================================================
  // Left Console Rail (Desktop & Mobile Landscape) + Top Portrait HUD Dock
  // =========================================================================

  private renderLeftRail(
    state: SimState,
    geom: TableGeometry,
    handName: string,
    handLevel: number,
    chips: number,
    mult: number,
    flaming: boolean,
    gameSpeed: GameSpeed
  ): void {
    if (state.phase === 'TITLE') {
      this.railLayer.innerHTML = '';
      return;
    }

    const r = geom.hudDock;
    const isLandscape = geom.mode === 'mobile-landscape';
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

    const compact = !isLandscape && (r.h < 680 || geom.compact);
    const isShop = state.phase === 'SHOP';
    const progressPct =
      state.targetChips > 0
        ? Math.min(100, Math.max(0, Math.round((state.roundChips / state.targetChips) * 100)))
        : 0;
    const targetMet = state.targetChips > 0 && state.roundChips >= state.targetChips;

    const chipSize = isLandscape ? 32 : 58;
    const scoreChipSize = isLandscape ? 14 : 22;
    const roundChipSize = isLandscape ? 15 : 24;
    const tagSize = isLandscape ? 20 : 34;

    // Top Stage: Animated Neon SHOP Sign during Shop phase; Blind Banner otherwise
    const showBlindDesc = !isLandscape || Boolean(blindDef?.desc);
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
            <canvas class="kc-blind-chip-canvas" width="${chipSize}" height="${chipSize}" data-blind-row="${blindDef?.pos.y ?? 0}"></canvas>
            <div class="kc-blind-meta">
              ${isLandscape ? '' : '<div class="kc-muted-sm">Score at least</div>'}
              <div class="kc-target-score">
                <canvas class="kc-score-chip-canvas" width="${scoreChipSize}" height="${scoreChipSize}"></canvas>
                <span>${fmtNum(state.targetChips)}</span>
              </div>
              <div class="kc-blind-reward">${isLandscape ? '' : 'Reward: '}<span class="kc-gold">${'$'.repeat(Math.max(1, Math.min(8, activeBlind?.dollars ?? 3)))}</span></div>
            </div>
          </div>
          ${
            showBlindDesc
              ? `<div class="kc-blind-desc">${
                  blindDef?.desc
                    ? esc(activeBlind?.disabled ? '(Boss Disabled) ' + blindDef.desc : blindDef.desc)
                    : `Ante ${state.ante} • ${activeBlind?.slot ?? 'Small'} Blind`
                }</div>`
              : ''
          }
        </div>
      `;

    // Skip Tags Strip: crisp pixel sprites from `tags` atlas with hover + tap tooltips!
    const tagsHtml =
      state.tags.length > 0
        ? `<div class="kc-rail-tags">${state.tags
            .slice(-(isLandscape ? 6 : 7))
            .map((tk) => {
              const td = TAG_MAP[tk];
              return `<button type="button" class="kc-rail-tag-btn interactive" data-rail-tag="${esc(tk)}" aria-label="${esc(td?.name ?? tk)}"><canvas class="kc-rail-tag-canvas" width="${tagSize}" height="${tagSize}" data-tag-x="${td?.pos.x ?? 0}" data-tag-y="${td?.pos.y ?? 0}"></canvas></button>`;
            })
            .join('')}</div>`
        : '';

    const displayHandLabel = handName || 'Select Cards';
    const wavyHandHtml = handName
      ? renderDynaWord(displayHandLabel, 'kc-dyna-char')
      : `<span class="kc-hand-placeholder">${esc(displayHandLabel)}</span>`;

    this.railLayer.innerHTML = `
      <aside class="kc-rail ${isLandscape ? 'landscape' : compact ? 'compact' : ''} ${flaming ? 'rail-flaming' : ''}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;">
        ${topStageHtml}

        <div class="kc-inset-box kc-round-score-box">
          <div class="kc-round-score-top">
            <span class="kc-round-lbl">${isLandscape ? 'Score' : 'Round<br/>score'}</span>
            <div class="kc-round-score-val">
              <canvas class="kc-score-chip-canvas" width="${roundChipSize}" height="${roundChipSize}"></canvas>
              <span>${fmtNum(state.roundChips)}</span>
            </div>
          </div>
          <div class="kc-round-progress-track" aria-label="Round progress ${progressPct}%">
            <div class="kc-round-progress-fill ${targetMet ? 'met' : ''}" style="width:${progressPct}%;"></div>
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
            <button class="kc-btn kc-btn-red interactive" data-ui="run-info">${isLandscape ? 'Info' : 'Run Info'}</button>
            <button class="kc-btn kc-btn-amber interactive" data-ui="options">${isLandscape ? 'Opt' : 'Options'}</button>
            <button class="kc-btn kc-btn-teal kc-speed-btn interactive" data-ui="cycle-speed" title="Cycle Game Speed">${isLandscape ? `${gameSpeed}x` : `Speed ${gameSpeed}x`}</button>
          </div>
          <div class="kc-rail-stats">
            <div class="kc-stat-pair">
              <div class="kc-stat-card">
                <div class="kc-stat-lbl">${isLandscape ? 'H' : 'Hands'}</div>
                <div class="kc-stat-val kc-blue">${state.handsLeft}</div>
              </div>
              <div class="kc-stat-card">
                <div class="kc-stat-lbl">${isLandscape ? 'D' : 'Discards'}</div>
                <div class="kc-stat-val kc-red">${state.discardsLeft}</div>
              </div>
            </div>
            <div class="kc-money-bar">$${state.dollars}</div>
            <div class="kc-stat-pair">
              <div class="kc-stat-card">
                <div class="kc-stat-lbl">${isLandscape ? 'Ante' : 'Ante'}</div>
                <div class="kc-stat-val kc-amber">${state.ante}<span class="kc-ante-max">/${state.winAnte}</span></div>
              </div>
              <div class="kc-stat-card">
                <div class="kc-stat-lbl">${isLandscape ? 'Rnd' : 'Round'}</div>
                <div class="kc-stat-val kc-amber">${state.round}</div>
              </div>
            </div>
          </div>
        </div>
        ${tagsHtml}
      </aside>
    `;

    this.bindHudEvents(blindDef?.pos.y ?? 0);
  }

  private renderPortraitHud(
    state: SimState,
    geom: TableGeometry,
    handName: string,
    handLevel: number,
    chips: number,
    mult: number,
    flaming: boolean,
    gameSpeed: GameSpeed
  ): void {
    if (state.phase === 'TITLE') {
      this.railLayer.innerHTML = '';
      return;
    }

    const d = geom.hudDock;
    const activeBlind = getActiveBlind(state);
    const blindDef = activeBlind ? BLIND_MAP[activeBlind.key] : undefined;
    const isShop = state.phase === 'SHOP';
    const headerColor = isShop
      ? '#fe5f55'
      : activeBlind?.slot === 'Small'
        ? '#2e659e'
        : activeBlind?.slot === 'Big'
          ? '#c77f1e'
          : activeBlind?.bossColor || '#7d3a5c';
    const levelColor =
      handLevel > 0
        ? PALETTE.HAND_LEVELS[(handLevel - 1) % PALETTE.HAND_LEVELS.length]!
        : PALETTE.WHITE;
    const progressPct =
      state.targetChips > 0
        ? Math.min(100, Math.max(0, Math.round((state.roundChips / state.targetChips) * 100)))
        : 0;
    const targetMet = state.targetChips > 0 && state.roundChips >= state.targetChips;

    const blindBadgeHtml = isShop
      ? `<div class="kc-port-shop-badge">SHOP</div>`
      : `<canvas class="kc-blind-chip-canvas kc-port-blind-chip" width="32" height="32" data-blind-row="${blindDef?.pos.y ?? 0}"></canvas>`;

    const tagsHtml =
      state.tags.length > 0
        ? `<div class="kc-port-tags">${state.tags
            .slice(-4)
            .map((tk) => {
              const td = TAG_MAP[tk];
              return `<button type="button" class="kc-rail-tag-btn interactive" data-rail-tag="${esc(tk)}" aria-label="${esc(td?.name ?? tk)}"><canvas class="kc-rail-tag-canvas kc-port-tag-cv" width="20" height="20" data-tag-x="${td?.pos.x ?? 0}" data-tag-y="${td?.pos.y ?? 0}"></canvas></button>`;
            })
            .join('')}</div>`
        : '';

    this.railLayer.innerHTML = `
      <header class="kc-hud-portrait ${flaming ? 'flaming' : ''}" style="left:${d.x}px;top:${d.y}px;width:${d.w}px;height:${d.h}px;--blind-col:${headerColor};">
        <div class="kc-port-row-top">
          <div class="kc-port-blind-block">
            ${blindBadgeHtml}
            <div class="kc-port-blind-info">
              <div class="kc-port-blind-name" style="color:${isShop ? '#f3b958' : '#ffffff'};">${esc(isShop ? 'SHOP' : activeBlind?.name ?? 'Small Blind')}</div>
              <div class="kc-port-score-line">
                <canvas class="kc-score-chip-canvas kc-port-chip-ic" width="14" height="14"></canvas>
                <span class="kc-port-score-now">${fmtNum(state.roundChips)}</span>
                <span class="kc-port-score-sep">/</span>
                <span class="kc-port-score-tgt">${fmtNum(state.targetChips)}</span>
              </div>
              <div class="kc-round-progress-track port">
                <div class="kc-round-progress-fill ${targetMet ? 'met' : ''}" style="width:${progressPct}%;"></div>
              </div>
            </div>
          </div>

          <div class="kc-port-money">$${state.dollars}</div>

          <div class="kc-port-btns">
            <button class="kc-btn kc-btn-red kc-port-btn interactive" data-ui="run-info">Info</button>
            <button class="kc-btn kc-btn-teal kc-port-btn interactive" data-ui="cycle-speed">${gameSpeed}x</button>
            <button class="kc-btn kc-btn-amber kc-port-btn interactive" data-ui="options">Menu</button>
          </div>
        </div>

        <div class="kc-port-row-bot">
          <div class="kc-port-hand-stage ${flaming ? 'flaming' : ''}">
            <div class="kc-port-hand-meta">
              <span class="kc-port-hand-name">${esc(handName || 'Select Cards')}</span>
              ${
                handLevel > 0
                  ? `<span class="kc-lvl-badge kc-port-lvl" style="background:${levelColor};">Lv.${handLevel}</span>`
                  : ''
              }
            </div>
            <div class="kc-port-math">
              <div id="kc-chips-box" class="kc-math-pill kc-chips-pill kc-port-pill">${fmtNum(chips)}</div>
              <div class="kc-math-x kc-port-x">X</div>
              <div id="kc-mult-box" class="kc-math-pill kc-mult-pill kc-port-pill">${Number.isInteger(mult) ? mult : mult.toFixed(1)}</div>
            </div>
          </div>

          <div class="kc-port-stats ${state.tags.length > 0 ? 'has-tags' : ''}">
            <div class="kc-port-stat"><span class="lbl">H</span><b class="kc-blue">${state.handsLeft}</b></div>
            <div class="kc-port-stat"><span class="lbl">D</span><b class="kc-red">${state.discardsLeft}</b></div>
            <div class="kc-port-stat"><span class="lbl">A</span><b class="kc-amber">${state.ante}${state.tags.length > 0 ? '' : '/' + state.winAnte}</b></div>
            <div class="kc-port-stat"><span class="lbl">R</span><b class="kc-amber">${state.round}</b></div>
            ${tagsHtml}
          </div>
        </div>
      </header>
    `;

    this.bindHudEvents(blindDef?.pos.y ?? 0);
  }

  private bindHudEvents(blindRow: number): void {
    const chipCanvas = this.railLayer.querySelector('.kc-blind-chip-canvas') as HTMLCanvasElement | null;
    if (chipCanvas) {
      this.registerAnimatedCanvas(chipCanvas, 'BlindChips', blindRow, 21);
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
    this.railLayer.querySelector('[data-ui="cycle-speed"]')?.addEventListener('click', () => {
      this.cb.onPlayButtonSfx();
      this.cb.onCycleGameSpeed();
    });
  }

  // =========================================================================
  // Main Table Layer (Title, Trays, Playing Controls, Blind Select, Shop, Pack, Cashout)
  // =========================================================================

  private renderTableLayer(
    state: SimState,
    geom: TableGeometry,
    cards: readonly VisualCard[],
    settings: RenderSettings,
    bossWarning: BossWarningInfo | null
  ): void {
    if (state.phase === 'TITLE') {
      this.renderTitleScreen(settings, geom);
      return;
    }

    const parts: string[] = [];
    const isPortrait = geom.mode === 'mobile-portrait';
    const isLandscape = geom.mode === 'mobile-landscape';
    const isMobile = isPortrait || isLandscape;

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
        const halfPad = ownedVis.kind === 'consumable' ? 76 : 56;
        const minOwnedX =
          ownedVis.kind === 'joker' && isPortrait
            ? Math.max(halfPad, geom.jokerTray.x + 76)
            : halfPad;
        const px = Math.max(
          minOwnedX,
          Math.min(geom.viewportW - halfPad, Math.round(ownedVis.moveable.tx))
        );
        const py = Math.min(
          geom.viewportH - geom.safeInsets.bottom - 34,
          Math.round(ownedVis.moveable.ty + ownedVis.moveable.th * 0.5 + 6)
        );
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
          const preview = getConsumablePreview(state, c.key, { fromInventory: true });
          const canUse = state.phase !== 'SCORING' && preview.canUseNow;
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
      const hasSelected = state.phase === 'PLAYING' && state.selectedCardIds.length > 0;

      // Live Boss Warning Pill cleanly above hand cards inside open play arena
      if (state.phase === 'PLAYING' && bossWarning) {
        const icon =
          bossWarning.severity === 'block' ? '!' : bossWarning.severity === 'warn' ? '▲' : 'i';
        const warnY = Math.max(
          geom.playArea.y + 4,
          geom.handTray.y - (isLandscape ? 32 : isPortrait ? 38 : 42)
        );
        parts.push(`
          <div class="kc-boss-warn-wrap" style="left:${geom.playArea.x}px;top:${warnY}px;width:${geom.playArea.w}px;">
            <div class="kc-boss-warning-pill sev-${bossWarning.severity}">
              <span class="kc-bw-icon">${icon}</span>
              <span class="kc-bw-boss">${esc(bossWarning.bossName)}:</span>
              <span class="kc-bw-msg">${esc(bossWarning.message)}</span>
            </div>
          </div>
        `);
      }

      // Deck counter right beneath Deck Pile (clamped strictly above actionBar)
      const deckBadgeTop = Math.min(
        geom.actionBar.y - (isMobile ? 25 : 30),
        geom.deckPile.y + geom.deckPile.h + (isMobile ? 3 : 8)
      );
      parts.push(`
        <button class="kc-deck-badge ${isMobile ? 'compact' : ''} interactive" data-ui="open-deck" style="left:${geom.deckPile.x}px;top:${deckBadgeTop}px;width:${geom.deckPile.w}px;">
          ${state.drawPile.length}/${state.fullDeck.length}
        </button>
      `);

      // Bottom Playing Action Bar positioned directly from geom.actionBar
      const ab = geom.actionBar;
      if (isMobile) {
        parts.push(`
          <div class="kc-action-bar mobile ${isPortrait ? 'portrait' : 'landscape'}" style="left:${ab.x}px;top:${ab.y}px;width:${ab.w}px;height:${ab.h}px;">
            <button class="kc-btn kc-btn-blue kc-mob-act-primary interactive" ${canPlay ? '' : 'disabled'} data-act="play">
              Play
            </button>
            <button class="kc-btn kc-btn-amber kc-mob-act-sort interactive ${state.sortMode === 'rank' ? 'active' : ''}" data-act="sort-rank">Rank</button>
            <button class="kc-btn kc-btn-amber kc-mob-act-sort interactive ${state.sortMode === 'suit' ? 'active' : ''}" data-act="sort-suit">Suit</button>
            ${
              hasSelected
                ? `<button class="kc-btn kc-btn-slate kc-mob-act-clear interactive" data-act="clear-select">Clear</button>`
                : ''
            }
            <button class="kc-btn kc-btn-red kc-mob-act-primary interactive" ${canDiscard ? '' : 'disabled'} data-act="discard">
              Discard
            </button>
          </div>
        `);
      } else {
        parts.push(`
          <div class="kc-action-bar" style="left:${ab.x}px;top:${ab.y}px;width:${ab.w}px;height:${ab.h}px;">
            <button class="kc-btn kc-btn-blue kc-action-lg interactive" ${canPlay ? '' : 'disabled'} data-act="play">
              Play Hand
            </button>
            <div class="kc-sort-box">
              <div class="kc-sort-title">Sort Hand</div>
              <div class="kc-sort-btns">
                <button class="kc-btn kc-btn-amber kc-btn-sm interactive ${state.sortMode === 'rank' ? 'active' : ''}" data-act="sort-rank">Rank</button>
                <button class="kc-btn kc-btn-amber kc-btn-sm interactive ${state.sortMode === 'suit' ? 'active' : ''}" data-act="sort-suit">Suit</button>
                ${
                  geom.compact && hasSelected
                    ? `<button class="kc-btn kc-btn-slate kc-btn-sm interactive" data-act="clear-select">Clear</button>`
                    : ''
                }
              </div>
            </div>
            <button class="kc-btn kc-btn-red kc-action-lg interactive" ${canDiscard ? '' : 'disabled'} data-act="discard">
              Discard
            </button>
          </div>
        `);
      }
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

  private renderTitleScreen(_settings: RenderSettings, geom: TableGeometry): void {
    const mode = this.packManager.getMode();
    const hasCustom = this.packManager.hasCustomPackAvailable();
    const hasSave = this.cb.hasSavedRun();
    const isPortrait = geom.mode === 'mobile-portrait';
    const isLandscape = geom.mode === 'mobile-landscape';

    const logoK = renderDynaWord('KRUNKED', 'kc-title-letter kc-tl-white', 0);
    const logoC = renderDynaWord('CARDS', 'kc-title-letter kc-tl-red', 7);
    const padTop = Math.max(isLandscape ? 8 : 14, geom.safeInsets.top + 8);
    const padBot = Math.max(isLandscape ? 10 : 20, geom.safeInsets.bottom + 12);

    this.tableLayer.innerHTML = `
      <div class="kc-title-screen ${isPortrait ? 'portrait' : isLandscape ? 'landscape' : 'desktop'}" style="padding-top:${padTop}px;padding-bottom:${padBot}px;">
        <div class="kc-title-pack-pill interactive">
          <span class="kc-pack-dot ${mode === 'custom' ? 'custom' : 'builtin'}"></span>
          <button class="kc-pill-mini interactive" data-title="toggle-pack" title="${esc(this.packManager.getStatusMessage())}">
            ${mode === 'custom' ? 'Original Pack' : hasCustom ? 'Built-In Art' : 'Built-In Art'}
          </button>
          <button class="kc-pill-mini kc-pill-load interactive" data-title="load-pack-folder" title="Load Local Custom Pack (Folder)">Folder</button>
          <button class="kc-pill-mini kc-pill-load interactive" data-title="load-pack-archive" title="Load Local Custom Pack (.exe / .zip)">.EXE</button>
        </div>

        <div class="kc-logo-stage" aria-label="Krunked Cards">
          <div class="kc-dyna-logo ${isPortrait ? 'stacked' : ''}">
            <span class="kc-logo-word">${logoK}</span>
            ${isPortrait ? '' : '<span class="kc-logo-gap"></span>'}
            <span class="kc-logo-word">${logoC}</span>
          </div>
        </div>

        <div class="kc-title-dock">
          <div class="kc-title-main-btns ${isPortrait ? 'grid-2x2' : ''}">
            <button class="kc-btn kc-btn-blue kc-title-btn interactive ${isPortrait && !hasSave ? 'span-full' : ''}" data-title="play">PLAY</button>
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
    const isPortrait = geom.mode === 'mobile-portrait';
    const isLandscape = geom.mode === 'mobile-landscape';
    const topY = geom.jokerTray.y + geom.jokerTray.h + (isLandscape ? 14 : 22);
    const h = Math.max(160, geom.table.y + geom.table.h - topY);
    const slots: BlindSlot[] = ['Small', 'Big', 'Boss'];
    const canRerollBoss =
      (state.vouchers.includes('v_directors_cut') || state.vouchers.includes('v_retcon')) &&
      (!state.bossRerolledThisAnte || state.vouchers.includes('v_retcon')) &&
      state.dollars - state.bankruptAt >= 10 &&
      state.blinds.Boss.status !== 'Defeated';

    const chipSize = isLandscape ? 30 : isPortrait ? 48 : 72;
    const scoreChipSize = isLandscape ? 15 : isPortrait ? 18 : 24;
    const tagSize = isLandscape ? 22 : isPortrait ? 30 : 38;

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

        if (isPortrait) {
          const skipTagRow =
            slot !== 'Boss' && tag
              ? `
                <div class="kc-port-skip-row" data-skip-tag="${esc(tag.key)}">
                  <canvas class="kc-tag-canvas" width="${tagSize}" height="${tagSize}" data-tag-x="${tag.pos.x}" data-tag-y="${tag.pos.y}"></canvas>
                  <div class="kc-skip-tag-meta">
                    <div class="kc-skip-tag-name">${esc(tag.name)}</div>
                    <div class="kc-skip-tag-desc">${esc(tag.desc)}</div>
                  </div>
                </div>
              `
              : '';
          const actionRow = isCurrent
            ? `
              <div class="kc-port-blind-actions">
                <button class="kc-btn kc-btn-amber interactive" data-act="select-blind">Select</button>
                ${
                  slot !== 'Boss' && tag
                    ? `<button class="kc-btn kc-btn-red interactive" data-act="skip-blind">Skip Blind</button>`
                    : slot === 'Boss' && canRerollBoss
                      ? `<button class="kc-btn kc-btn-red interactive" data-act="reroll-boss">Reroll Boss ($10)</button>`
                      : ''
                }
              </div>
            `
            : slot === 'Boss' && canRerollBoss
              ? `<div class="kc-port-blind-actions"><button class="kc-btn kc-btn-red kc-btn-sm interactive" data-act="reroll-boss">Reroll Boss ($10)</button></div>`
              : '';

          return `
            <div class="kc-blind-col portrait ${isCurrent ? 'active' : 'dimmed'}" style="--col-accent:${colBg};">
              <div class="kc-port-blind-head" style="background:${colBg};">
                <span class="kc-port-blind-title">${esc(b.name)}</span>
                <span class="kc-port-blind-status">${esc(b.status)}</span>
              </div>
              <div class="kc-port-blind-mid">
                <canvas class="kc-blind-col-chip" width="${chipSize}" height="${chipSize}" data-blind-row="${def?.pos.y ?? 0}"></canvas>
                <div class="kc-port-blind-stats">
                  <div class="kc-target-score">
                    <canvas class="kc-score-chip-canvas" width="${scoreChipSize}" height="${scoreChipSize}"></canvas>
                    <span>${fmtNum(b.targetChips)}</span>
                  </div>
                  <div class="kc-blind-reward">Reward: <span class="kc-gold">${'$'.repeat(Math.max(1, Math.min(8, b.dollars)))}</span></div>
                  ${def?.desc ? `<div class="kc-port-blind-desc">${esc(def.desc)}</div>` : ''}
                </div>
              </div>
              ${skipTagRow}
              ${actionRow}
            </div>
          `;
        }

        const statusBtn = isCurrent
          ? `<button class="kc-btn kc-btn-amber interactive" data-act="select-blind">Select</button>`
          : `<div class="kc-blind-status-pill">${esc(b.status)}</div>`;

        const skipBlock =
          slot !== 'Boss' && tag
            ? `
            <div class="kc-skip-box ${isCurrent ? '' : 'upcoming-skip'}" data-skip-tag="${esc(tag.key)}">
              <div class="kc-skip-tag-row">
                <canvas class="kc-tag-canvas" width="${tagSize}" height="${tagSize}" data-tag-x="${tag.pos.x}" data-tag-y="${tag.pos.y}"></canvas>
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
              <canvas class="kc-blind-col-chip" width="${chipSize}" height="${chipSize}" data-blind-row="${def?.pos.y ?? 0}"></canvas>
              ${isLandscape ? '' : '<div class="kc-muted-sm">Score at least</div>'}
              <div class="kc-target-score lg">
                <canvas class="kc-score-chip-canvas" width="${scoreChipSize}" height="${scoreChipSize}"></canvas>
                <span>${fmtNum(b.targetChips)}</span>
              </div>
              <div class="kc-blind-reward">Reward: <span class="kc-gold">${'$'.repeat(Math.max(1, Math.min(8, b.dollars)))}</span></div>
              ${def?.desc && (!isLandscape || slot === 'Boss') ? `<div class="kc-blind-col-desc">${esc(def.desc)}</div>` : ''}
            </div>
            ${skipBlock}
          </div>
        `;
      })
      .join('');

    return `
      <div class="kc-blind-arena ${isPortrait ? 'portrait' : isLandscape ? 'landscape' : ''}" style="left:${geom.table.x}px;top:${topY}px;width:${geom.table.w}px;height:${h}px;">
        ${cols}
      </div>
    `;
  }

  private buildShopHtml(
    state: SimState,
    geom: TableGeometry,
    cards: readonly VisualCard[]
  ): string {
    const isPortrait = geom.mode === 'mobile-portrait';
    const isLandscape = geom.mode === 'mobile-landscape';
    const isMobile = isPortrait || isLandscape;

    const sc = geom.shopControls;
    const boardTop = Math.max(
      geom.jokerTray.y + geom.jokerTray.h + (isMobile ? 16 : 20),
      Math.min(sc.y, geom.shopOfferTray.y) - (isMobile ? 6 : 10)
    );
    const boardH = geom.viewportH - boardTop + 8;
    const canAfford = (cost: number) => state.dollars - state.bankruptAt >= cost;
    const rerollPrice = state.freeRerolls > 0 ? 0 : state.rerollCost;
    const canReroll = canAfford(rerollPrice);

    const minX = geom.safeInsets.left + (isMobile ? 42 : 52);
    const maxX = geom.viewportW - geom.safeInsets.right - (isMobile ? 42 : 52);
    const maxBtnY = geom.viewportH - geom.safeInsets.bottom - (isMobile ? 28 : 34);

    const cardButtons: string[] = [];
    for (const vc of cards) {
      if (vc.kind !== 'shop_offer' && vc.kind !== 'shop_voucher' && vc.kind !== 'shop_booster') {
        continue;
      }
      const cx = Math.max(minX, Math.min(maxX, Math.round(vc.moveable.tx)));
      const trayTop =
        vc.kind === 'shop_offer'
          ? geom.shopOfferTray.y
          : vc.kind === 'shop_voucher'
            ? geom.shopVoucherTray.y
            : geom.shopBoosterTray.y;
      const topTagY = Math.max(
        trayTop + 1,
        Math.round(vc.moveable.ty - vc.moveable.th * 0.5 - (isMobile ? 15 : 18))
      );
      const btnY = Math.min(
        maxBtnY,
        Math.round(vc.moveable.ty + vc.moveable.th * 0.5 + (isMobile ? 3 : 8))
      );
      const cost = vc.cost ?? 0;
      const affordable = canAfford(cost);

      cardButtons.push(
        `<div class="kc-price-tag ${isMobile ? 'compact' : ''} ${affordable ? '' : 'unaffordable'}" style="left:${cx}px;top:${topTagY}px;">$${cost}</div>`
      );

      if (vc.kind === 'shop_offer' && vc.shopOfferData) {
        const o = vc.shopOfferData;
        const canImmediateUse = o.kind === 'tarot' || o.kind === 'planet' || o.kind === 'spectral';
        cardButtons.push(`
          <div class="kc-card-actions ${isMobile ? 'compact' : ''}" style="left:${cx}px;top:${btnY}px;">
            <button class="kc-mini-btn kc-btn-amber interactive" ${affordable ? '' : 'disabled'} data-buy-offer="${esc(o.id)}">BUY</button>
            ${
              canImmediateUse
                ? `<button class="kc-mini-btn kc-btn-red interactive" ${affordable ? '' : 'disabled'} data-buy-use-offer="${esc(o.id)}" title="Buy &amp; Use">${isMobile ? 'USE' : 'BUY &amp; USE'}</button>`
                : ''
            }
          </div>
        `);
      } else if (vc.kind === 'shop_voucher' && vc.voucherOfferData) {
        cardButtons.push(`
          <div class="kc-card-actions ${isMobile ? 'compact' : ''}" style="left:${cx}px;top:${btnY}px;">
            <button class="kc-mini-btn kc-btn-green interactive" ${affordable ? '' : 'disabled'} data-buy-voucher="${esc(vc.voucherOfferData.id)}">REDEEM</button>
          </div>
        `);
      } else if (vc.kind === 'shop_booster' && vc.boosterOfferData) {
        cardButtons.push(`
          <div class="kc-card-actions ${isMobile ? 'compact' : ''}" style="left:${cx}px;top:${btnY}px;">
            <button class="kc-mini-btn kc-btn-purple interactive" ${affordable ? '' : 'disabled'} data-buy-booster="${esc(vc.boosterOfferData.id)}">OPEN</button>
          </div>
        `);
      }
    }

    const nextLabel = isPortrait ? 'Next Round' : 'Next<br/>Round';
    const rerollLabel = isPortrait
      ? `Reroll <span class="kc-reroll-cost">${rerollPrice === 0 ? 'FREE' : '$' + rerollPrice}</span>`
      : `Reroll<br/><span class="kc-reroll-cost">${rerollPrice === 0 ? 'FREE' : '$' + rerollPrice}</span>`;

    return `
      <div class="kc-shop-board" style="left:${geom.table.x - 4}px;top:${boardTop}px;width:${geom.table.w + 8}px;height:${boardH}px;"></div>

      <div class="kc-shop-controls ${isPortrait ? 'portrait' : isLandscape ? 'landscape' : ''}" style="left:${sc.x}px;top:${sc.y}px;width:${sc.w}px;height:${sc.h}px;">
        <button class="kc-btn kc-btn-red kc-shop-btn interactive" data-act="shop-next">
          ${nextLabel}
        </button>
        <button class="kc-btn kc-btn-green kc-shop-btn interactive" ${canReroll ? '' : 'disabled'} data-act="shop-reroll">
          ${rerollLabel}
        </button>
      </div>

      <div class="kc-shop-pocket" style="left:${geom.shopOfferTray.x}px;top:${geom.shopOfferTray.y}px;width:${geom.shopOfferTray.w}px;height:${geom.shopOfferTray.h}px;"></div>
      <div class="kc-shop-pocket kc-shop-voucher-pocket" style="left:${geom.shopVoucherTray.x}px;top:${geom.shopVoucherTray.y}px;width:${geom.shopVoucherTray.w}px;height:${geom.shopVoucherTray.h}px;">
        <span class="kc-pocket-stamp ${isMobile ? 'inside' : ''}">ANTE ${state.ante} VOUCHER</span>
      </div>
      <div class="kc-shop-pocket kc-shop-booster-pocket" style="left:${geom.shopBoosterTray.x}px;top:${geom.shopBoosterTray.y}px;width:${geom.shopBoosterTray.w}px;height:${geom.shopBoosterTray.h}px;">
        <span class="kc-pocket-stamp ${isMobile ? 'inside' : ''}">BOOSTER PACKS</span>
      </div>
      ${cardButtons.join('')}
    `;
  }

  private buildCashoutHtml(state: SimState, geom: TableGeometry): string {
    const co = state.cashout!;
    const isMobile = geom.mode !== 'desktop';
    const topY = geom.jokerTray.y + geom.jokerTray.h + (isMobile ? 18 : 24);
    const maxH = Math.max(160, geom.table.y + geom.table.h - topY - 4);
    const panelW = Math.min(580, geom.table.w - (isMobile ? 8 : 32));
    const panelX = Math.round(geom.table.x + (geom.table.w - panelW) * 0.5);

    const rowsHtml = co.rows
      .map((r, idx) => {
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
          <div class="kc-cash-row" style="--row-i:${idx};">
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
      <div class="kc-cashout-panel ${isMobile ? 'compact' : ''}" style="left:${panelX}px;top:${topY}px;width:${panelW}px;max-height:${maxH}px;">
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
    const isMobile = geom.mode !== 'desktop';
    const minX = geom.safeInsets.left + 44;
    const maxX = geom.viewportW - geom.safeInsets.right - 44;
    const handPackOffsetY =
      pack.needsHand && geom.mode === 'mobile-landscape'
        ? Math.round(geom.actionBar.h * 0.78)
        : 0;
    const maxBtnY = pack.needsHand
      ? Math.min(geom.viewportH - geom.safeInsets.bottom - 28, geom.handTray.y + handPackOffsetY - 26)
      : geom.viewportH - geom.safeInsets.bottom - 30;

    const pickBtns = cards
      .filter((c) => c.kind === 'pack_card' && c.packCardData)
      .map((vc) => {
        const pc = vc.packCardData!;
        const cx = Math.max(minX, Math.min(maxX, Math.round(vc.moveable.tx)));
        const by = Math.min(
          maxBtnY,
          Math.round(vc.moveable.ty + vc.moveable.th * 0.5 + (isMobile ? 4 : 10))
        );
        let canPick = true;
        let label = pc.kind === 'joker' || pc.kind === 'playing_card' ? 'SELECT' : 'USE';
        if (pc.kind === 'tarot' || pc.kind === 'spectral') {
          const preview = getConsumablePreview(state, pc.key, { fromInventory: false });
          canPick = preview.canUseNow;
          const cDef = CONSUMABLE_MAP[pc.key];
          const minSel = cDef?.minSelect ?? 0;
          const maxSel = cDef?.maxSelect ?? 0;
          if (!canPick && minSel > 0) {
            label = `PICK ${minSel}${maxSel > minSel ? '-' + maxSel : ''}`;
          }
        }
        return `
          <div class="kc-card-actions ${isMobile ? 'compact' : ''}" style="left:${cx}px;top:${by}px;">
            <button class="kc-mini-btn kc-btn-green interactive" ${canPick ? '' : 'disabled'} data-pack-pick="${esc(pc.id)}">${label}</button>
          </div>
        `;
      })
      .join('');

    const bannerTop = geom.packTray.y + (isMobile ? 2 : 8);
    return `
      <div class="kc-pack-banner ${isMobile ? 'compact' : ''}" style="left:${geom.packTray.x}px;top:${bannerTop}px;width:${geom.packTray.w}px;">
        <div class="kc-pack-banner-text">
          <span class="kc-pack-title">${esc(def?.name ?? pack.kind + ' Pack')}</span>
          <span class="kc-pack-sub">Choose ${pack.chooseRemaining} remaining</span>
        </div>
        <button class="kc-btn kc-btn-red kc-btn-sm interactive" data-act="pack-skip">Skip</button>
      </div>
      ${pickBtns}
    `;
  }

  private buildEndModalHtml(state: SimState, victory: boolean): string {
    const mostPlayed = state.tracking.mostPlayedHand;
    const mostPlayedCount = state.handLevels[mostPlayed]?.played ?? 0;
    const jokerStripHtml =
      state.jokers.length > 0
        ? `
          <div class="kc-end-jokers">
            <div class="kc-end-jokers-lbl">Final Joker Lineup (${state.jokers.length})</div>
            <div class="kc-end-jokers-row">
              ${state.jokers
                .map((j) => {
                  const jd = JOKER_MAP[j.key];
                  return `<canvas class="kc-end-joker-sprite" width="36" height="48" title="${esc(jd?.name ?? j.key)}" data-atlas="Joker" data-ax="${jd?.pos.x ?? 0}" data-ay="${jd?.pos.y ?? 0}"></canvas>`;
                })
                .join('')}
            </div>
          </div>
        `
        : '';

    return `
      <div class="kc-end-overlay">
        <div class="kc-modal-card kc-end-card">
          <div class="kc-end-title ${victory ? 'win' : 'lose'}">${victory ? 'YOU WIN!' : 'GAME OVER'}</div>
          <div class="kc-end-stats">
            <div><span>Best Hand</span><strong class="kc-blue">${fmtNum(state.stats.bestHand)}</strong></div>
            <div><span>Most Played</span><strong class="kc-amber">${esc(mostPlayed)} (${mostPlayedCount})</strong></div>
            <div><span>Cards Played</span><strong>${fmtNum(state.stats.cardsPlayed)}</strong></div>
            <div><span>Ante / Rounds</span><strong class="kc-amber">${state.ante}/${state.winAnte} • R${state.round}</strong></div>
            <div class="kc-end-seed-row">
              <span>Seed</span>
              <span class="kc-seed-copy-group">
                <strong class="kc-gold">${esc(state.rng.seed)}</strong>
                <button class="kc-mini-btn kc-btn-slate interactive" data-copy-seed="${esc(state.rng.seed)}">Copy</button>
              </span>
            </div>
            ${
              !victory && state.stats.defeatedBy
                ? `<div><span>Defeated By</span><strong class="kc-red">${esc(state.stats.defeatedBy)}</strong></div>`
                : ''
            }
          </div>
          ${jokerStripHtml}
          <div class="kc-end-btns">
            ${
              victory
                ? `<button class="kc-btn kc-btn-blue interactive" data-act="continue-endless">Continue Endless</button>`
                : `<button class="kc-btn kc-btn-blue interactive" data-act="new-run-modal">New Run</button>`
            }
            <button class="kc-btn kc-btn-teal interactive" data-act="replay-seed">Replay Seed</button>
            <button class="kc-btn kc-btn-red interactive" data-act="return-title">Main Menu</button>
          </div>
        </div>
      </div>
    `;
  }

  private bindTableEvents(state: SimState): void {
    // Register animated BlindChip canvases, score chip sprites, tag sprites, and final Joker lineup sprites
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
    this.tableLayer.querySelectorAll<HTMLCanvasElement>('.kc-end-joker-sprite').forEach((c) => {
      const atlas = (c.dataset.atlas as AtlasKey) || 'Joker';
      this.drawAtlasCellToCanvas(c, atlas, Number(c.dataset.ax ?? 0), Number(c.dataset.ay ?? 0));
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
    bind('[data-act="clear-select"]', () => this.cb.onDispatch({ type: 'DESELECT_ALL' }));
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
    bind('[data-act="replay-seed"]', () => {
      this.cb.onReplaySeed(state.deckId, state.stake, state.rng.seed, state.challengeId);
    });
    bind('[data-copy-seed]', (el) => {
      const seed = el.dataset.copySeed || state.rng.seed;
      void copyTextToClipboard(seed).then((ok) => {
        this.showToast(ok ? `Copied seed: ${seed}` : `Seed: ${seed}`, 2000);
      });
    });
    bind('[data-ui="open-deck"]', () => {
      this.runInfoTab = 'deck';
      this.openModal('RUN_INFO');
    });

    bind('[data-sell-joker]', (el) => {
      this.selectedOwnedId = null;
      this.dismissInspect();
      this.cb.onDispatch({ type: 'SELL_JOKER', jokerId: el.dataset.sellJoker! });
    });
    bind('[data-sell-cons]', (el) => {
      this.selectedOwnedId = null;
      this.dismissInspect();
      this.cb.onDispatch({ type: 'SELL_CONSUMABLE', consumableId: el.dataset.sellCons! });
    });
    bind('[data-use-cons]', (el) => {
      this.selectedOwnedId = null;
      this.dismissInspect();
      this.cb.onDispatch({
        type: 'USE_CONSUMABLE',
        consumableId: el.dataset.useCons!,
        targetCardIds: state.selectedCardIds.slice(),
      });
    });
    bind('[data-buy-offer]', (el) => {
      this.dismissInspect();
      this.cb.onDispatch({
        type: 'SHOP_BUY_OFFER',
        offerId: el.dataset.buyOffer!,
        useImmediately: false,
      });
    });
    bind('[data-buy-use-offer]', (el) => {
      this.dismissInspect();
      this.cb.onDispatch({
        type: 'SHOP_BUY_OFFER',
        offerId: el.dataset.buyUseOffer!,
        useImmediately: true,
      });
    });
    bind('[data-buy-voucher]', (el) => {
      this.dismissInspect();
      this.cb.onDispatch({
        type: 'SHOP_BUY_VOUCHER',
        voucherOfferId: el.dataset.buyVoucher!,
      });
    });
    bind('[data-buy-booster]', (el) => {
      this.dismissInspect();
      this.cb.onDispatch({
        type: 'SHOP_BUY_BOOSTER',
        boosterOfferId: el.dataset.buyBooster!,
      });
    });
    bind('[data-pack-pick]', (el) => {
      this.dismissInspect();
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
        const clampedTop = Math.max(20, Math.round(p.y));
        return `
          <div class="kc-popup-pill ${extraClass}" style="left:${Math.round(p.x)}px;top:${clampedTop}px;background:${p.bgColor};color:${p.textColor};opacity:${alpha.toFixed(2)};transform:translate(-50%,-50%) scale(${popScale.toFixed(3)}) rotate(${(p.rotation * 57.3).toFixed(1)}deg);">
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
        <div class="kc-modal-head wrap">
          <h2>New Run</h2>
          <div class="kc-tab-row">
            <button class="kc-tab interactive ${this.newRunTab === 'standard' ? 'active' : ''}" data-nr-tab="standard">Standard</button>
            <button class="kc-tab interactive ${this.newRunTab === 'challenges' ? 'active' : ''}" data-nr-tab="challenges">Challenges (${CHALLENGES.length})</button>
          </div>
          <button class="kc-btn kc-btn-red kc-btn-sm interactive" data-modal="close">Back</button>
        </div>
        <div class="kc-modal-scroll">${body}</div>
      </div>
    `;
  }

  private buildRunInfoModalHtml(state: SimState, settings: RenderSettings): string {
    const preview = state.phase === 'PLAYING' ? previewSelectedHand(state) : null;
    const deckName = DECK_MAP[state.deckId]?.name ?? state.deckId;
    const stakeName = STAKE_MAP[state.stake]?.name ?? `Stake ${state.stake}`;
    const challengeName = state.challengeId ? (CHALLENGE_MAP[state.challengeId]?.name ?? state.challengeId) : null;

    let body = '';
    if (this.runInfoTab === 'hands') {
      body = `
        <div class="kc-hands-table">
          ${POKER_HAND_IDS.map((hid) => {
            const st = state.handLevels[hid];
            if (!st || (!st.visible && st.played === 0)) return '';
            const lvlCol = PALETTE.HAND_LEVELS[(st.level - 1) % PALETTE.HAND_LEVELS.length]!;
            const def = POKER_HAND_MAP[hid];
            const isPreviewed = preview?.handId === hid;
            return `
              <div class="kc-hand-row ${isPreviewed ? 'previewed' : ''}" title="${esc(def?.desc ?? '')}">
                <span class="kc-lvl-badge" style="background:${lvlCol};">lvl.${st.level}</span>
                <div class="kc-hr-name-col">
                  <div class="kc-hr-name-line">
                    <span class="kc-hr-name">${esc(hid)}</span>
                    ${isPreviewed ? '<span class="kc-hr-sel-tag">SELECTED</span>' : ''}
                  </div>
                  <div class="kc-hr-sub">
                    <span class="kc-hr-upgrade">+${st.lChips} Chips / +${st.lMult} Mult per Lv</span>
                    ${def?.example ? `<span class="kc-hr-ex">• ${esc(def.example)}</span>` : ''}
                  </div>
                </div>
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
      const bd = getDeckBreakdown(state);
      const uiAtlas: AtlasKey = settings.highContrastSuits ? 'ui_2' : 'ui_1';
      const suitColors = settings.highContrastSuits
        ? PALETTE.SUITS_HIGH_CONTRAST
        : { Hearts: '#fe5f55', Diamonds: '#f06a40', Spades: '#b7c7e8', Clubs: '#6ec4a7' };

      const headerCells = MATRIX_RANKS.map(
        (rk) => `
          <th class="kc-dm-th">
            <div class="kc-dm-rank">${shortRankLabel(rk)}</div>
            <div class="kc-dm-rtot">${bd.rankRemaining[rk]}</div>
          </th>
        `
      ).join('');

      const rowsHtml = SUITS.map((su) => {
        const col = suitColors[su];
        const cells = MATRIX_RANKS.map((rk) => {
          const cell = bd.matrix[su][rk];
          const empty = cell.total === 0;
          const depleted = cell.total > 0 && cell.remaining === 0;
          const pips: string[] = [];
          if (cell.enhanced > 0) pips.push('<span class="kc-dm-pip enh" title="Enhanced"></span>');
          if (cell.editioned > 0) pips.push('<span class="kc-dm-pip ed" title="Edition"></span>');
          if (cell.sealed > 0) pips.push('<span class="kc-dm-pip seal" title="Seal"></span>');
          const tip = `${rk} of ${su}: ${cell.remaining}/${cell.total} in draw${cell.enhanced ? `, ${cell.enhanced} enhanced` : ''}${cell.editioned ? `, ${cell.editioned} editioned` : ''}${cell.sealed ? `, ${cell.sealed} sealed` : ''}`;
          return `
            <td class="kc-dm-cell ${empty ? 'empty' : depleted ? 'depleted' : ''}" title="${esc(tip)}">
              <div class="kc-dm-cnt">${empty ? '·' : `${cell.remaining}/${cell.total}`}</div>
              ${pips.length > 0 ? `<div class="kc-dm-pips">${pips.join('')}</div>` : ''}
            </td>
          `;
        }).join('');
        return `
          <tr>
            <th class="kc-dm-suit-cell" style="color:${col};">
              <canvas class="kc-mini-sprite" width="16" height="16" data-atlas="${uiAtlas}" data-ax="${UI_SUIT_COLS[su]}" data-ay="1"></canvas>
              <span class="kc-dm-suit-cnt">${bd.suitRemaining[su]}/${bd.suitTotals[su]}</span>
            </th>
            ${cells}
          </tr>
        `;
      }).join('');

      body = `
        <div class="kc-deck-summary">
          <div class="kc-deck-kpi-strip">
            <span class="kc-suit-count-pill">Draw: <b class="kc-gold">${bd.remaining}/${bd.total}</b></span>
            <span class="kc-suit-count-pill">Face: <b class="kc-blue">${bd.faceRemaining}/${bd.faceTotal}</b></span>
            <span class="kc-suit-count-pill">Stone: <b class="kc-amber">${bd.stoneRemaining}/${bd.stoneTotal}</b></span>
            <span class="kc-suit-count-pill">Enhanced: <b style="color:#4bc292;">${bd.enhancedTotal}</b></span>
            <span class="kc-suit-count-pill">Editioned: <b style="color:#d48cf5;">${bd.editionedTotal}</b></span>
            <span class="kc-suit-count-pill">Sealed: <b class="kc-gold">${bd.sealedTotal}</b></span>
          </div>

          <div class="kc-deck-matrix-wrap">
            <table class="kc-deck-matrix">
              <thead>
                <tr>
                  <th class="kc-dm-corner">Suit</th>
                  ${headerCells}
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>

          <div class="kc-dm-legend">
            <span><i class="kc-dm-pip enh"></i> Enhanced</span>
            <span><i class="kc-dm-pip ed"></i> Edition</span>
            <span><i class="kc-dm-pip seal"></i> Seal</span>
            <span class="kc-dm-legend-note">Cell shows remaining / total in deck</span>
          </div>
        </div>
      `;
    }

    return `
      <div class="kc-modal-card wide">
        <div class="kc-modal-head wrap">
          <div class="kc-ri-head-meta">
            <h2>Run Info — Ante ${state.ante}</h2>
            <div class="kc-ri-badges">
              <span class="kc-ri-badge">${esc(deckName)}</span>
              <span class="kc-ri-badge stake">${esc(challengeName ? `Challenge: ${challengeName}` : stakeName)}</span>
              <span class="kc-ri-badge seed">Seed: <b>${esc(state.rng.seed)}</b></span>
              <button class="kc-mini-btn kc-btn-teal interactive" data-copy-seed="${esc(state.rng.seed)}">Copy Seed</button>
            </div>
          </div>
          <button class="kc-btn kc-btn-red kc-btn-sm interactive" data-modal="close">Close</button>
        </div>
        <div class="kc-tab-row wrap">
          <button class="kc-tab interactive ${this.runInfoTab === 'hands' ? 'active' : ''}" data-ri-tab="hands">Poker Hands</button>
          <button class="kc-tab interactive ${this.runInfoTab === 'blinds' ? 'active' : ''}" data-ri-tab="blinds">Blinds</button>
          <button class="kc-tab interactive ${this.runInfoTab === 'vouchers' ? 'active' : ''}" data-ri-tab="vouchers">Vouchers (${state.vouchers.length})</button>
          <button class="kc-tab interactive ${this.runInfoTab === 'deck' ? 'active' : ''}" data-ri-tab="deck">Deck (${state.drawPile.length}/${state.fullDeck.length})</button>
        </div>
        <div class="kc-modal-scroll">${body}</div>
      </div>
    `;
  }

  private getCollectionCatalogItems(profile: ProfileProgress): Array<{
    key: string;
    name: string;
    desc: string;
    atlas: AtlasKey;
    x: number;
    y: number;
    w: number;
    h: number;
    discovered: boolean;
    rarity?: number;
    badgeLabel?: string;
    badgeColor?: string;
  }> {
    if (this.collectionTab === 'jokers') {
      return JOKERS.map((j) => ({
        key: j.key,
        name: j.name,
        desc: j.descTemplate,
        atlas: 'Joker' as AtlasKey,
        x: j.pos.x,
        y: j.pos.y,
        w: 44,
        h: 59,
        discovered: profile.discoveredJokers.includes(j.key),
        rarity: j.rarity,
        badgeLabel: RARITY_NAMES[j.rarity],
        badgeColor: PALETTE.RARITY[j.rarity - 1] ?? PALETTE.BLUE,
      }));
    }
    if (
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
      return src.map((c) => ({
        key: c.key,
        name: c.name,
        desc: c.desc,
        atlas: 'Tarot' as AtlasKey,
        x: c.pos.x,
        y: c.pos.y,
        w: 44,
        h: 59,
        discovered: profile.discoveredConsumables.includes(c.key),
      }));
    }
    if (this.collectionTab === 'vouchers') {
      return VOUCHERS.map((v) => ({
        key: v.key,
        name: v.name,
        desc: v.desc,
        atlas: 'Voucher' as AtlasKey,
        x: v.pos.x,
        y: v.pos.y,
        w: 44,
        h: 59,
        discovered: profile.discoveredVouchers.includes(v.key),
      }));
    }
    if (this.collectionTab === 'boosters') {
      return BOOSTERS.map((b) => ({
        key: b.key,
        name: b.name,
        desc: b.desc,
        atlas: 'Booster' as AtlasKey,
        x: b.pos.x,
        y: b.pos.y,
        w: 44,
        h: 59,
        discovered: true,
      }));
    }
    if (this.collectionTab === 'blinds') {
      return BLINDS.map((b) => ({
        key: b.key,
        name: b.name,
        desc: b.desc || `${b.mult}x Base • $${b.dollars}`,
        atlas: 'BlindChips' as AtlasKey,
        x: 0,
        y: b.pos.y,
        w: 36,
        h: 36,
        discovered: profile.discoveredBlinds.includes(b.key),
      }));
    }
    if (this.collectionTab === 'tags') {
      return TAGS.map((t) => ({
        key: t.key,
        name: t.name,
        desc: t.desc,
        atlas: 'tags' as AtlasKey,
        x: t.pos.x,
        y: t.pos.y,
        w: 36,
        h: 36,
        discovered: profile.discoveredTags.includes(t.key),
      }));
    }
    return DECKS.map((d) => ({
      key: d.key,
      name: d.name,
      desc: d.desc,
      atlas: 'centers' as AtlasKey,
      x: d.pos.x,
      y: d.pos.y,
      w: 44,
      h: 59,
      discovered: Boolean(profile.deckMaxStake[d.key]),
    }));
  }

  private buildCollectionCatalogContent(profile: ProfileProgress): {
    progressHtml: string;
    itemsHtml: string;
  } {
    const allItems = this.getCollectionCatalogItems(profile);
    const totalCount = allItems.length;
    const discoveredCount = allItems.filter((it) => it.discovered).length;
    const pct = totalCount > 0 ? Math.round((discoveredCount / totalCount) * 100) : 0;

    const q = this.collectionSearch.trim().toLowerCase();
    const filtered = allItems.filter((it) => {
      if (this.collectionFilter === 'discovered' && !it.discovered) return false;
      if (this.collectionFilter === 'undiscovered' && it.discovered) return false;
      if (this.collectionTab === 'jokers' && this.collectionRarity > 0 && it.rarity !== this.collectionRarity) {
        return false;
      }
      if (q && !it.name.toLowerCase().includes(q) && !it.desc.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });

    const progressHtml = `
      <div class="kc-coll-prog-meta">
        <span>Discovered: <b class="kc-gold">${discoveredCount} / ${totalCount}</b> — <b>${pct}%</b></span>
        <span class="kc-muted-sm">Showing ${filtered.length}</span>
      </div>
      <div class="kc-coll-prog-track">
        <div class="kc-coll-prog-fill" style="width:${pct}%;"></div>
      </div>
    `;

    const itemsHtml =
      filtered.length === 0
        ? `<div class="kc-empty-note" style="grid-column:1 / -1;">No matching entries found.</div>`
        : filtered
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

    return { progressHtml, itemsHtml };
  }

  private buildRunHistoryHtml(profile: ProfileProgress): string {
    const history = this.cb.getRunHistory();
    const summaryStrip = `
      <div class="kc-history-kpi-strip">
        <span class="kc-suit-count-pill">Runs Played: <b class="kc-blue">${profile.runsPlayed}</b></span>
        <span class="kc-suit-count-pill">Runs Won: <b style="color:#4bc292;">${profile.runsWon}</b></span>
        <span class="kc-suit-count-pill">Best Hand: <b class="kc-gold">${fmtNum(profile.bestHandScore)}</b></span>
      </div>
    `;

    if (history.length === 0) {
      return `
        <div class="kc-history-wrap">
          ${summaryStrip}
          <div class="kc-empty-note">No finished runs recorded yet. Finish a run to see your history &amp; replay favorite seeds!</div>
        </div>
      `;
    }

    const cardsHtml = history
      .map((entry, idx) => {
        const deckName = DECK_MAP[entry.deckId]?.name ?? entry.deckId;
        const stakeName = STAKE_MAP[entry.stake]?.name ?? `Stake ${entry.stake}`;
        const challengeName = entry.challengeId
          ? (CHALLENGE_MAP[entry.challengeId]?.name ?? entry.challengeId)
          : null;
        const jokersHtml =
          entry.jokerKeys.length > 0
            ? `<div class="kc-hist-jokers">${entry.jokerKeys
                .slice(0, 10)
                .map((jk) => {
                  const jd = JOKER_MAP[jk];
                  return `<canvas class="kc-mini-sprite kc-hist-joker-cv" width="30" height="40" title="${esc(jd?.name ?? jk)}" data-atlas="Joker" data-ax="${jd?.pos.x ?? 0}" data-ay="${jd?.pos.y ?? 0}"></canvas>`;
                })
                .join('')}</div>`
            : '';

        return `
          <div class="kc-hist-card ${entry.won ? 'win' : 'loss'}">
            <div class="kc-hist-top">
              <span class="kc-hist-badge ${entry.won ? 'win' : 'loss'}">${entry.won ? 'VICTORY' : 'DEFEAT'}</span>
              <span class="kc-hist-deck">${esc(deckName)} • ${esc(challengeName ? challengeName : stakeName)}</span>
              <span class="kc-hist-ante">Ante ${entry.ante} • R${entry.round}</span>
            </div>
            <div class="kc-hist-mid">
              <span>Best Hand: <b class="kc-blue">${fmtNum(entry.bestHand)}</b></span>
              ${!entry.won && entry.defeatedBy ? `<span>Defeated By: <b class="kc-red">${esc(entry.defeatedBy)}</b></span>` : ''}
              <span class="kc-hist-seed-group">
                Seed: <b class="kc-gold">${esc(entry.seed || 'N/A')}</b>
                ${
                  entry.seed
                    ? `<button class="kc-mini-btn kc-btn-teal interactive" data-hist-play="${idx}">Play Seed</button>`
                    : ''
                }
              </span>
            </div>
            ${jokersHtml}
          </div>
        `;
      })
      .join('');

    return `
      <div class="kc-history-wrap">
        ${summaryStrip}
        <div class="kc-history-list">${cardsHtml}</div>
      </div>
    `;
  }

  private buildCollectionModalHtml(): string {
    const profile = this.cb.getProfile();
    const historyCount = this.cb.getRunHistory().length;
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
      ['history', 'History', historyCount],
    ];

    if (this.collectionTab === 'history') {
      return `
        <div class="kc-modal-card wide">
          <div class="kc-modal-head">
            <h2>Collection &amp; Run History</h2>
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
          <div class="kc-modal-scroll">${this.buildRunHistoryHtml(profile)}</div>
        </div>
      `;
    }

    const { progressHtml, itemsHtml } = this.buildCollectionCatalogContent(profile);
    const rarityFiltersHtml =
      this.collectionTab === 'jokers'
        ? `
          <div class="kc-coll-filter-group">
            ${([
              [0, 'All Rarities'],
              [1, 'Common'],
              [2, 'Uncommon'],
              [3, 'Rare'],
              [4, 'Legendary'],
            ] as const)
              .map(
                ([r, lbl]) =>
                  `<button class="kc-pill-btn kc-coll-fbtn interactive ${this.collectionRarity === r ? 'active' : ''}" data-coll-rarity="${r}">${lbl}</button>`
              )
              .join('')}
          </div>
        `
        : '';

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
        <div class="kc-coll-toolbar">
          <input id="kc-coll-search" class="kc-input kc-coll-search interactive" type="search" placeholder="Search name or effect..." value="${esc(this.collectionSearch)}" />
          <div class="kc-coll-filter-group">
            ${([
              ['all', 'All'],
              ['discovered', 'Discovered'],
              ['undiscovered', 'Undiscovered'],
            ] as const)
              .map(
                ([f, lbl]) =>
                  `<button class="kc-pill-btn kc-coll-fbtn interactive ${this.collectionFilter === f ? 'active' : ''}" data-coll-filter="${f}">${lbl}</button>`
              )
              .join('')}
          </div>
          ${rarityFiltersHtml}
        </div>
        <div id="kc-coll-progress" class="kc-coll-progress">${progressHtml}</div>
        <div id="kc-coll-grid" class="kc-modal-scroll kc-coll-grid">${itemsHtml}</div>
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

    // Run Info & Collection tabs, search, filters & Run History replay
    onClick('[data-ri-tab]', (el) => {
      this.runInfoTab = el.dataset.riTab as typeof this.runInfoTab;
      this.invalidateModal();
    });
    onClick('[data-copy-seed]', (el) => {
      const seed = el.dataset.copySeed || _state.rng.seed;
      void copyTextToClipboard(seed).then((ok) => {
        this.showToast(ok ? `Copied seed: ${seed}` : `Seed: ${seed}`, 2000);
      });
    });
    onClick('[data-coll-tab]', (el) => {
      this.collectionTab = el.dataset.collTab as typeof this.collectionTab;
      this.invalidateModal();
    });
    onClick('[data-coll-filter]', (el) => {
      this.collectionFilter = el.dataset.collFilter as typeof this.collectionFilter;
      this.invalidateModal();
    });
    onClick('[data-coll-rarity]', (el) => {
      this.collectionRarity = (Number(el.dataset.collRarity) || 0) as typeof this.collectionRarity;
      this.invalidateModal();
    });
    const collSearch = this.modalLayer.querySelector<HTMLInputElement>('#kc-coll-search');
    collSearch?.addEventListener('input', () => {
      this.collectionSearch = collSearch.value;
      const grid = this.modalLayer.querySelector<HTMLElement>('#kc-coll-grid');
      const prog = this.modalLayer.querySelector<HTMLElement>('#kc-coll-progress');
      if (grid && prog) {
        const { progressHtml, itemsHtml } = this.buildCollectionCatalogContent(this.cb.getProfile());
        prog.innerHTML = progressHtml;
        grid.innerHTML = itemsHtml;
        grid.querySelectorAll<HTMLCanvasElement>('.kc-mini-sprite').forEach((c) => {
          const atlas = c.dataset.atlas as AtlasKey;
          this.drawAtlasCellToCanvas(c, atlas, Number(c.dataset.ax ?? 0), Number(c.dataset.ay ?? 0));
        });
      }
    });
    onClick('[data-hist-play]', (el) => {
      const idx = Number(el.dataset.histPlay);
      const entry = this.cb.getRunHistory()[idx];
      if (entry && entry.seed) {
        this.cb.onReplaySeed(entry.deckId, entry.stake, entry.seed, entry.challengeId);
      }
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

  private renderTooltip(
    card: VisualCard | null,
    x: number,
    y: number,
    state: SimState,
    pinned = false
  ): void {
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
    const liveHtml = info.livePreview
      ? `
        <div class="kc-tt-live ${info.livePreview.ok ? 'ready' : 'blocked'}">
          <div class="kc-tt-live-head">${esc(info.livePreview.headline)}</div>
          <div class="kc-tt-live-detail">${esc(info.livePreview.detail)}</div>
        </div>
      `
      : '';

    this.tooltipEl.classList.toggle('pinned', pinned);
    this.tooltipEl.innerHTML = `
      <div class="kc-tt-title">${esc(info.title)}</div>
      <div class="kc-tt-desc">${formatRichDesc(info.desc, this.lastHighContrast)}</div>
      ${liveHtml}
      ${badgesHtml ? `<div class="kc-tt-badges">${badgesHtml}</div>` : ''}
    `;
    this.tooltipEl.classList.remove('hidden');

    const tw = this.tooltipEl.offsetWidth || 248;
    const th = this.tooltipEl.offsetHeight || 116;
    const vw = this.lastViewportW || window.innerWidth;
    const vh = this.lastViewportH || window.innerHeight;
    const isDesktop = this.lastMode === 'desktop';
    const isLandscape = this.lastMode === 'mobile-landscape';
    const reserveBottom =
      isLandscape && (state.phase === 'PLAYING' || state.phase === 'SCORING') ? 56 : 8;
    const maxBottomY = Math.max(8, vh - th - reserveBottom);

    let tx = card.moveable.vx - tw * 0.5;
    let ty: number;

    if (
      isDesktop &&
      !pinned &&
      (card.kind === 'shop_offer' || card.kind === 'shop_voucher' || card.kind === 'shop_booster')
    ) {
      tx = card.moveable.vx + card.moveable.vw * 0.56;
      if (tx + tw + 8 > vw) {
        tx = card.moveable.vx - card.moveable.vw * 0.56 - tw;
      }
      ty = card.moveable.vy - th * 0.5;
    } else if (card.moveable.vy > vh * 0.52) {
      // Lower half -> anchor cleanly above card
      ty = card.moveable.vy - card.moveable.vh * 0.54 - th - 12;
      if (ty < 8) {
        if (isLandscape) {
          tx = card.moveable.vx + card.moveable.vw * 0.58;
          if (tx + tw + 8 > vw) tx = card.moveable.vx - card.moveable.vw * 0.58 - tw;
          ty = Math.min(maxBottomY, Math.max(8, card.moveable.vy - th * 0.5));
        } else {
          ty = card.moveable.vy + card.moveable.vh * 0.54 + 14;
        }
      }
    } else {
      // Upper half -> anchor cleanly below card (leave clearance for contextual SELL/USE pill if owned)
      const ownedExtra =
        (card.kind === 'joker' || card.kind === 'consumable') &&
        this.selectedOwnedId === card.id
          ? (isLandscape ? 28 : 36)
          : 0;
      ty = card.moveable.vy + card.moveable.vh * 0.54 + (isLandscape ? 8 : 14) + ownedExtra;
      if (ty > maxBottomY) {
        if (isLandscape) {
          // Place cleanly beside card on short landscape screens so bottom action bar stays clear
          tx = card.moveable.vx + card.moveable.vw * 0.58 + 6;
          if (tx + tw + 8 > vw) {
            tx = card.moveable.vx - card.moveable.vw * 0.58 - tw - 6;
          }
          ty = Math.min(maxBottomY, Math.max(8, card.moveable.vy - th * 0.25));
        } else {
          ty = card.moveable.vy - card.moveable.vh * 0.54 - th - 12;
        }
      }
    }

    tx = Math.max(8, Math.min(Math.max(8, vw - tw - 8), tx));
    ty = Math.max(8, Math.min(maxBottomY, ty));

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
        flex-direction: column;
        gap: 6px;
      }
      .kc-round-score-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        width: 100%;
      }
      .kc-round-progress-track {
        width: 100%;
        height: 6px;
        background: #111719;
        border: 2px solid #161d20;
        border-radius: 99px;
        overflow: hidden;
      }
      .kc-round-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #009dff, #4ce6ff);
        transition: width 0.2s ease-out, background 0.2s ease-out;
      }
      .kc-round-progress-fill.met {
        background: linear-gradient(90deg, #4bc292, #f3b958);
        box-shadow: 0 0 8px rgba(243, 185, 88, 0.55);
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
        margin: 0 3px;
        border-radius: 5px;
        border: 1px solid #9e261f;
        box-shadow: 0 2px 0 #9e261f;
        text-shadow: 0 1px 0 rgba(0, 0, 0, 0.45);
        line-height: 1.2;
      }
      .kc-hl-money { color: #a86200; }
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
        bottom: max(16px, env(safe-area-inset-bottom, 0px));
        right: max(18px, env(safe-area-inset-right, 0px));
        z-index: 95;
        max-width: calc(100vw - 24px);
        background: var(--kc-slate-md);
        border: 3px solid #f3b958;
        border-radius: 10px;
        padding: 7px 16px;
        font-size: 16px;
        color: #ffffff;
        text-shadow: 0 2px 0 #101618;
        box-shadow: 0 5px 0 var(--kc-border);
      }

      /* =================================================================== */
      /* Wave 2 Enhancements: Speed Button, Boss Banners/Warnings, FF Badge, */
      /* 3-Mode Responsive HUDs, Touch Arenas, Deck Matrix & Run History     */
      /* =================================================================== */
      .kc-rail-buttons .kc-speed-btn {
        flex: 0.72;
        font-size: 15px;
        padding: 6px 4px;
      }

      /* Live Boss Warning Pill */
      .kc-boss-warn-wrap {
        position: absolute;
        display: flex;
        justify-content: center;
        pointer-events: none;
        z-index: 34;
        padding: 0 6px;
      }
      .kc-boss-warning-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        max-width: 100%;
        padding: 5px 12px;
        border-radius: 9px;
        border: 2px solid #fe5f55;
        background: rgba(34, 15, 17, 0.94);
        font-size: 14px;
        color: #ffffff;
        box-shadow: 0 4px 0 rgba(0, 0, 0, 0.65);
        text-shadow: 0 1px 0 #0f1416;
        line-height: 1.15;
      }
      .kc-boss-warning-pill.sev-block {
        border-color: #fe5f55;
        background: rgba(74, 18, 22, 0.96);
      }
      .kc-boss-warning-pill.sev-warn {
        border-color: #fda200;
        background: rgba(62, 38, 14, 0.95);
      }
      .kc-boss-warning-pill.sev-info {
        border-color: #58a8e8;
        background: rgba(20, 42, 60, 0.94);
      }
      .kc-bw-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 5px;
        font-size: 12px;
        flex-shrink: 0;
      }
      .kc-boss-warning-pill.sev-block .kc-bw-icon { background: #fe5f55; color: #ffffff; }
      .kc-boss-warning-pill.sev-warn .kc-bw-icon { background: #fda200; color: #161d20; }
      .kc-boss-warning-pill.sev-info .kc-bw-icon { background: #009dff; color: #ffffff; }
      .kc-bw-boss { color: #f3b958; flex-shrink: 0; }
      .kc-bw-msg { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .kc-mode-mobile-portrait .kc-boss-warning-pill {
        font-size: 12px;
        padding: 4px 9px;
        gap: 5px;
        flex-wrap: wrap;
        justify-content: center;
        text-align: center;
      }
      .kc-mode-mobile-portrait .kc-bw-msg {
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
      }

      /* Boss Intro Banner (non-blocking dramatic callout) */
      .kc-boss-banner {
        position: fixed;
        left: 50%;
        top: 22%;
        transform: translateX(-50%);
        z-index: 88;
        pointer-events: none;
        max-width: min(460px, calc(100vw - 24px));
        background: rgba(20, 24, 28, 0.96);
        border: 3px solid var(--boss-col, #fe5f55);
        border-radius: 13px;
        padding: 11px 20px 13px;
        text-align: center;
        box-shadow: 0 8px 0 #101416, 0 0 28px rgba(0, 0, 0, 0.65);
      }
      .kc-boss-banner.animate-in {
        animation: kc-boss-banner-pop 2.6s ease-out forwards;
      }
      @keyframes kc-boss-banner-pop {
        0% { opacity: 0; transform: translate(-50%, -16px) scale(0.92); }
        12% { opacity: 1; transform: translate(-50%, 0) scale(1.03); }
        20% { opacity: 1; transform: translate(-50%, 0) scale(1); }
        82% { opacity: 1; transform: translate(-50%, 0) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -8px) scale(0.98); }
      }
      .kc-reduced-motion .kc-boss-banner.animate-in {
        animation: none !important;
        opacity: 1;
      }
      .kc-boss-banner-tag {
        display: inline-block;
        background: var(--boss-col, #fe5f55);
        color: #ffffff;
        font-size: 12px;
        padding: 2px 8px;
        border-radius: 5px;
        letter-spacing: 0.08em;
        margin-bottom: 4px;
      }
      .kc-boss-banner-name {
        font-size: 28px;
        color: #ffffff;
        text-shadow: 0 3px 0 #0e1214;
        line-height: 1.1;
      }
      .kc-boss-banner-desc {
        font-size: 15px;
        color: #f5ebd6;
        margin-top: 4px;
        line-height: 1.25;
      }

      /* Fast-Forward Scoring Indicator */
      .kc-ff-badge {
        position: fixed;
        transform: translateX(-100%);
        z-index: 52;
        pointer-events: none;
        white-space: nowrap;
        background: rgba(20, 28, 34, 0.94);
        border: 2px solid #f3b958;
        border-radius: 8px;
        padding: 3px 10px;
        font-size: 15px;
        color: #f3b958;
        text-shadow: 0 2px 0 #101416;
        box-shadow: 0 3px 0 #101416;
      }

      /* Staggered Cashout Receipt Animation */
      .kc-cashout-panel {
        display: flex;
        flex-direction: column;
      }
      .kc-cashout-rows {
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
        min-height: 0;
      }
      .kc-cash-row {
        opacity: 0;
        animation: kc-cash-row-in 0.24s ease-out forwards;
        animation-delay: calc(var(--row-i, 0) * 65ms);
      }
      @keyframes kc-cash-row-in {
        0% { opacity: 0; transform: translateX(-10px); }
        100% { opacity: 1; transform: translateX(0); }
      }
      .kc-reduced-motion .kc-cash-row {
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
      }
      .kc-cashout-panel.compact {
        padding: 10px 12px 12px;
      }
      .kc-cashout-panel.compact .kc-cashout-header { font-size: 20px; margin-bottom: 6px; }
      .kc-cashout-panel.compact .kc-cashout-btn { font-size: 19px; padding: 9px 12px; margin-bottom: 8px; }
      .kc-cashout-panel.compact .kc-cashout-rows { padding: 8px 10px; gap: 6px; }
      .kc-cashout-panel.compact .kc-cash-row { font-size: 14px; }
      .kc-cashout-panel.compact .kc-cash-val { font-size: 16px; }

      /* =================================================================== */
      /* Mobile Landscape Left Rail (Fits strictly inside 348px-412px H)     */
      /* =================================================================== */
      .kc-rail.landscape {
        padding: 4px 5px;
        gap: 4px;
        border-width: 2px;
        border-radius: 9px;
        overflow: hidden;
      }
      .kc-rail.landscape .kc-blind-header { border-width: 2px; border-radius: 7px; }
      .kc-rail.landscape .kc-blind-title-bar {
        font-size: 13px;
        padding: 2px 4px;
        border-bottom-width: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .kc-rail.landscape .kc-blind-body { padding: 3px 5px; gap: 5px; }
      .kc-rail.landscape .kc-blind-chip-canvas { width: 32px; height: 32px; flex: 0 0 32px; }
      .kc-rail.landscape .kc-target-score { font-size: 15px; gap: 3px; margin: 0; }
      .kc-rail.landscape .kc-score-chip-canvas { width: 14px; height: 14px; }
      .kc-rail.landscape .kc-blind-reward { font-size: 11px; }
      .kc-rail.landscape .kc-blind-desc {
        font-size: 10px;
        padding: 2px 4px;
        line-height: 1.15;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .kc-rail.landscape .kc-rail-shop-marquee { padding: 4px 5px; border-width: 2px; border-radius: 7px; }
      .kc-rail.landscape .kc-rail-shop-sign { max-width: 92px; max-height: 44px; margin-bottom: 1px; }
      .kc-rail.landscape .kc-rail-shop-sub { font-size: 11px; }
      .kc-rail.landscape .kc-inset-box { padding: 4px 6px; border-width: 2px; border-radius: 7px; }
      .kc-rail.landscape .kc-round-score-box { gap: 3px; }
      .kc-rail.landscape .kc-round-lbl { font-size: 11px; }
      .kc-rail.landscape .kc-round-score-val { font-size: 16px; gap: 4px; }
      .kc-rail.landscape .kc-round-progress-track { height: 4px; border-width: 1px; }
      .kc-rail.landscape .kc-hand-box { padding: 4px 5px 5px; border-width: 2px; border-radius: 8px; }
      .kc-rail.landscape .kc-hand-header { min-height: 16px; margin-bottom: 3px; gap: 4px; }
      .kc-rail.landscape .kc-hand-name { font-size: 13px; }
      .kc-rail.landscape .kc-hand-placeholder { font-size: 12px; }
      .kc-rail.landscape .kc-lvl-badge { font-size: 10px; padding: 1px 4px; border-width: 1px; }
      .kc-rail.landscape .kc-score-math { gap: 3px; }
      .kc-rail.landscape .kc-math-pill {
        font-size: 16px;
        padding: 4px 2px;
        border-width: 2px;
        border-radius: 6px;
        box-shadow: 0 2px 0 rgba(0, 0, 0, 0.45);
      }
      .kc-rail.landscape .kc-math-x { font-size: 14px; }
      .kc-rail.landscape .kc-rail-mid-grid { min-height: 0; gap: 4px; grid-template-columns: 0.72fr 1.28fr; }
      .kc-rail.landscape .kc-rail-buttons { gap: 4px; }
      .kc-rail.landscape .kc-rail-buttons .kc-btn {
        font-size: 11px;
        padding: 3px 3px;
        border-width: 2px;
        border-radius: 6px;
        min-height: 0;
        box-shadow: 0 2px 0 var(--btn-shadow, #141a1c), 0 2px 0 1px var(--kc-border);
      }
      .kc-rail.landscape .kc-rail-stats { gap: 3px; }
      .kc-rail.landscape .kc-stat-pair { gap: 3px; }
      .kc-rail.landscape .kc-stat-card { padding: 2px 2px; border-width: 2px; border-radius: 6px; }
      .kc-rail.landscape .kc-stat-lbl { font-size: 9px; margin-bottom: 0; }
      .kc-rail.landscape .kc-stat-val { font-size: 15px; }
      .kc-rail.landscape .kc-ante-max { font-size: 10px; }
      .kc-rail.landscape .kc-money-bar { font-size: 16px; padding: 2px 3px; border-width: 2px; border-radius: 6px; }
      .kc-rail.landscape .kc-rail-tags { padding: 2px 3px; gap: 3px; flex-wrap: nowrap; overflow-x: auto; }
      .kc-rail.landscape .kc-rail-tag-canvas { width: 20px; height: 20px; }

      /* =================================================================== */
      /* Mobile Portrait Top HUD Dock (.kc-hud-portrait)                     */
      /* =================================================================== */
      .kc-hud-portrait {
        position: absolute;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 4px;
        padding: 5px 7px;
        background: var(--kc-slate-md);
        border: 2px solid var(--kc-border);
        border-top: 4px solid var(--blind-col, #2e659e);
        border-radius: 10px;
        box-shadow:
          0 4px 0 var(--kc-border),
          inset 0 2px 0 rgba(255, 255, 255, 0.1);
        pointer-events: auto;
        overflow: hidden;
      }
      .kc-hud-portrait.flaming {
        background: linear-gradient(
          180deg,
          var(--kc-slate-md) 0%,
          var(--kc-slate-md) 42%,
          rgba(28, 35, 38, 0.24) 100%
        );
      }
      .kc-port-row-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        min-height: 0;
      }
      .kc-port-blind-block {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1;
        min-width: 0;
      }
      .kc-port-blind-chip { width: 32px; height: 32px; flex: 0 0 32px; }
      .kc-port-shop-badge {
        background: #231920;
        border: 2px solid #fe5f55;
        color: #f3b958;
        border-radius: 7px;
        padding: 4px 6px;
        font-size: 13px;
        flex-shrink: 0;
      }
      .kc-port-blind-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .kc-port-blind-name {
        font-size: 13px;
        line-height: 1.05;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-shadow: 0 1px 0 #0f1416;
      }
      .kc-port-score-line {
        display: flex;
        align-items: center;
        gap: 3px;
        font-size: 13px;
        line-height: 1;
      }
      .kc-port-chip-ic { width: 13px; height: 13px; }
      .kc-port-score-now { color: #ffffff; }
      .kc-port-score-sep { color: #7c8e94; font-size: 11px; }
      .kc-port-score-tgt { color: #fe5f55; }
      .kc-round-progress-track.port { height: 4px; border-width: 1px; }
      .kc-port-money {
        background: var(--kc-well);
        border: 2px solid var(--kc-border);
        border-radius: 7px;
        padding: 3px 7px;
        font-size: 16px;
        color: #f3b958;
        text-shadow: 0 2px 0 #0e1315;
        flex-shrink: 0;
      }
      .kc-port-btns { display: flex; gap: 4px; flex-shrink: 0; }
      .kc-port-btn {
        font-size: 12px;
        padding: 5px 7px;
        min-height: 30px;
        border-width: 2px;
        border-radius: 7px;
        box-shadow: 0 2px 0 var(--btn-shadow, #141a1c), 0 2px 0 1px var(--kc-border);
      }
      .kc-port-row-bot {
        display: flex;
        align-items: center;
        gap: 6px;
        min-height: 0;
        flex: 1;
      }
      .kc-port-hand-stage {
        flex: 1.25;
        min-width: 0;
        background: var(--kc-well);
        border: 2px solid var(--kc-border);
        border-radius: 8px;
        padding: 3px 5px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .kc-port-hand-stage.flaming {
        background: rgba(20, 26, 30, 0.22);
        border-color: #fda200;
      }
      .kc-port-hand-meta {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-width: 0;
      }
      .kc-port-hand-name {
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: #ffffff;
      }
      .kc-port-lvl { font-size: 10px; padding: 0 4px; border-width: 1px; }
      .kc-port-math {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 4px;
      }
      .kc-port-pill {
        font-size: 16px;
        padding: 3px 3px;
        border-width: 2px;
        border-radius: 6px;
        box-shadow: 0 2px 0 rgba(0, 0, 0, 0.5);
      }
      .kc-port-x { font-size: 15px; }
      .kc-port-stats {
        display: grid;
        grid-template-columns: repeat(2, auto);
        gap: 3px 4px;
        align-items: center;
        flex-shrink: 0;
      }
      .kc-port-stats.has-tags {
        grid-template-columns: repeat(4, auto);
        gap: 2px 3px;
      }
      .kc-port-stats.has-tags .kc-port-stat {
        padding: 1px 4px;
        font-size: 11px;
        gap: 2px;
      }
      .kc-port-stat {
        background: var(--kc-well);
        border: 2px solid var(--kc-border);
        border-radius: 6px;
        padding: 2px 6px;
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        line-height: 1.1;
      }
      .kc-port-stat .lbl { color: #9db0b5; font-size: 10px; }
      .kc-port-tags {
        grid-column: 1 / -1;
        display: flex;
        gap: 3px;
        justify-content: center;
      }
      .kc-port-tag-cv { width: 18px; height: 18px; }

      /* =================================================================== */
      /* Mobile Action Bars, Deck Badge, Title Screen, Blind Select & Shop   */
      /* =================================================================== */
      .kc-mode-mobile-portrait .kc-tray-counter,
      .kc-mode-mobile-landscape .kc-tray-counter {
        bottom: -16px;
        font-size: 11px;
      }
      .kc-deck-badge.compact {
        font-size: 12px;
        padding: 2px 4px;
        border-width: 2px;
        border-radius: 6px;
        box-shadow: 0 2px 0 var(--kc-border);
      }
      .kc-action-bar.mobile {
        gap: 6px;
        padding: 0;
        align-items: stretch;
      }
      .kc-action-bar.mobile .kc-btn {
        padding: 6px 8px;
        border-width: 2px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        box-shadow: 0 3px 0 var(--btn-shadow, #141a1c), 0 3px 0 1px var(--kc-border), inset 0 2px 0 rgba(255, 255, 255, 0.24);
      }
      .kc-action-bar.mobile.portrait .kc-btn { min-height: 44px; }
      .kc-mob-act-primary { flex: 1.35; font-size: 17px; }
      .kc-mob-act-sort { flex: 0.72; font-size: 13px; }
      .kc-mob-act-clear { flex: 0.78; font-size: 13px; }
      .kc-mob-act-sort.active {
        box-shadow: 0 0 0 2px #ffffff, 0 3px 0 var(--btn-shadow, #141a1c) !important;
      }

      /* Mobile Title Screen Modes */
      .kc-title-screen.landscape {
        padding-left: 16px;
        padding-right: 16px;
      }
      .kc-title-screen.landscape .kc-title-pack-pill {
        top: max(6px, env(safe-area-inset-top, 0px));
        right: max(8px, env(safe-area-inset-right, 0px));
        padding: 3px 6px;
        gap: 4px;
        border-width: 2px;
      }
      .kc-title-screen.landscape .kc-pill-mini { font-size: 11px; padding: 2px 6px; }
      .kc-title-screen.landscape .kc-logo-stage { margin-top: 2px; }
      .kc-title-screen.landscape .kc-title-letter { font-size: clamp(32px, 5.2vw, 48px); }
      .kc-title-screen.landscape .kc-title-dock { padding: 8px 12px 10px; border-width: 3px; }
      .kc-title-screen.landscape .kc-title-main-btns { gap: 8px; }
      .kc-title-screen.landscape .kc-title-btn { min-width: 108px; font-size: 16px; padding: 8px 14px; }

      .kc-title-screen.portrait {
        padding-left: 12px;
        padding-right: 12px;
        justify-content: space-between;
      }
      .kc-title-screen.portrait .kc-title-pack-pill {
        position: static;
        align-self: center;
        flex-wrap: wrap;
        justify-content: center;
        padding: 4px 8px;
        gap: 5px;
        border-width: 2px;
      }
      .kc-title-screen.portrait .kc-pill-mini { font-size: 12px; padding: 3px 7px; }
      .kc-title-screen.portrait .kc-logo-stage { margin-top: 4px; margin-bottom: auto; }
      .kc-dyna-logo.stacked {
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      .kc-title-screen.portrait .kc-title-letter { font-size: clamp(40px, 12vw, 62px); }
      .kc-title-screen.portrait .kc-title-dock {
        width: min(360px, calc(100vw - 24px));
        padding: 10px 12px 12px;
        border-width: 3px;
      }
      .kc-title-main-btns.grid-2x2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .kc-title-main-btns.grid-2x2 .kc-title-btn {
        min-width: 0;
        width: 100%;
        font-size: 18px;
        padding: 11px 10px;
        min-height: 46px;
      }
      .kc-title-main-btns.grid-2x2 .kc-title-btn.span-full {
        grid-column: 1 / -1;
      }

      /* Blind Select Landscape & Portrait Modes */
      .kc-blind-arena.landscape {
        gap: 6px;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
      }
      .kc-blind-arena.landscape .kc-blind-col {
        padding: 5px;
        gap: 3px;
        border-width: 2px;
        border-top-width: 3px;
        border-radius: 8px;
        min-height: 0;
        overflow: hidden;
      }
      .kc-blind-arena.landscape .kc-blind-col.active { transform: none; }
      .kc-blind-arena.landscape .kc-blind-col-top .kc-btn { font-size: 13px; padding: 3px 6px; }
      .kc-blind-arena.landscape .kc-blind-status-pill { font-size: 11px; padding: 3px 4px; }
      .kc-blind-arena.landscape .kc-blind-col-banner { font-size: 13px; padding: 2px 4px; border-width: 2px; }
      .kc-blind-arena.landscape .kc-blind-col-body { padding: 3px 4px; border-width: 2px; min-height: 0; }
      .kc-blind-arena.landscape .kc-blind-col-chip { width: 30px; height: 30px; margin-bottom: 1px; }
      .kc-blind-arena.landscape .kc-target-score.lg { font-size: 16px; margin: 1px 0; }
      .kc-blind-arena.landscape .kc-score-chip-canvas { width: 15px; height: 15px; }
      .kc-blind-arena.landscape .kc-blind-reward { font-size: 11px; }
      .kc-blind-arena.landscape .kc-blind-col-desc {
        font-size: 10px;
        padding: 2px 4px;
        margin-top: 2px;
        line-height: 1.15;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .kc-blind-arena.landscape .kc-skip-box { padding: 4px 5px; gap: 3px; border-width: 2px; }
      .kc-blind-arena.landscape .kc-skip-box .kc-btn-sm { padding: 3px 6px; font-size: 12px; }
      .kc-blind-arena.landscape .kc-skip-tag-row { gap: 5px; }
      .kc-blind-arena.landscape .kc-tag-canvas { width: 22px; height: 22px; }
      .kc-blind-arena.landscape .kc-skip-tag-name { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .kc-blind-arena.landscape .kc-skip-tag-desc {
        font-size: 9px;
        line-height: 1.15;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .kc-blind-arena.landscape .kc-skip-preview-lbl,
      .kc-blind-arena.landscape .kc-boss-ante-foot {
        font-size: 10px;
        padding: 2px 4px;
      }

      .kc-blind-arena.portrait {
        display: flex;
        flex-direction: column;
        gap: 10px;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
        padding: 2px 2px 10px;
      }
      .kc-blind-col.portrait {
        padding: 8px 10px;
        gap: 7px;
        flex-shrink: 0;
      }
      .kc-blind-col.portrait.active { transform: none; }
      .kc-port-blind-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 5px 10px;
        border-radius: 8px;
        border: 2px solid var(--kc-border);
        text-shadow: 0 2px 0 rgba(0, 0, 0, 0.55);
      }
      .kc-port-blind-title { font-size: 18px; }
      .kc-port-blind-status {
        font-size: 12px;
        background: rgba(0, 0, 0, 0.34);
        padding: 2px 7px;
        border-radius: 5px;
      }
      .kc-port-blind-mid {
        display: flex;
        align-items: center;
        gap: 10px;
        background: var(--kc-well);
        border: 2px solid var(--kc-border);
        border-radius: 8px;
        padding: 8px 10px;
      }
      .kc-port-blind-mid .kc-blind-col-chip { width: 48px; height: 48px; margin: 0; flex-shrink: 0; }
      .kc-port-blind-stats { flex: 1; min-width: 0; text-align: left; }
      .kc-port-blind-stats .kc-target-score { font-size: 20px; }
      .kc-port-blind-desc { font-size: 12px; color: #f5ebd6; margin-top: 3px; line-height: 1.24; }
      .kc-port-skip-row {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--kc-well);
        border: 2px solid var(--kc-border);
        border-radius: 8px;
        padding: 6px 8px;
      }
      .kc-port-skip-row .kc-tag-canvas { width: 30px; height: 30px; }
      .kc-port-blind-actions {
        display: flex;
        gap: 8px;
      }
      .kc-port-blind-actions .kc-btn {
        flex: 1;
        min-height: 40px;
        font-size: 16px;
        padding: 8px 10px;
      }

      /* Mobile Shop Controls, Price Tags & Compact Card Buttons */
      .kc-shop-controls.portrait {
        flex-direction: row;
        gap: 8px;
        padding: 5px 6px;
        border-width: 2px;
        border-radius: 9px;
      }
      .kc-shop-controls.portrait .kc-shop-btn {
        flex-direction: row;
        gap: 6px;
        font-size: 16px;
        padding: 6px 8px;
        min-height: 36px;
      }
      .kc-shop-controls.portrait .kc-reroll-cost { font-size: 16px; margin-top: 0; }
      .kc-shop-controls.landscape {
        padding: 5px;
        gap: 6px;
        border-width: 2px;
      }
      .kc-shop-controls.landscape .kc-shop-btn { font-size: 14px; padding: 5px 4px; }
      .kc-shop-controls.landscape .kc-reroll-cost { font-size: 15px; }

      .kc-pocket-stamp.inside {
        bottom: 2px;
        left: auto;
        right: 6px;
        font-size: 10px;
        opacity: 0.74;
        letter-spacing: 0.04em;
      }
      .kc-mode-mobile-landscape .kc-pocket-stamp.inside {
        display: none;
      }
      .kc-price-tag.compact {
        font-size: 12px;
        padding: 0 6px 1px;
        border-width: 2px;
        border-radius: 6px;
        box-shadow: 0 2px 0 var(--kc-border);
      }
      .kc-card-actions.compact { gap: 3px; }
      .kc-card-actions.compact .kc-mini-btn {
        font-size: 11px;
        padding: 3px 6px;
        border-radius: 6px;
        min-height: 24px;
      }
      .kc-pack-banner.compact {
        padding: 2px 8px;
        border-width: 2px;
      }
      .kc-pack-banner.compact .kc-btn-sm {
        padding: 2px 9px;
        font-size: 12px;
      }
      .kc-pack-banner.compact .kc-pack-title { font-size: 13px; margin-right: 8px; }
      .kc-pack-banner.compact .kc-pack-sub { font-size: 11px; }
      .kc-pack-banner-text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* =================================================================== */
      /* Rich Tooltip Live Preview Callout                                   */
      /* =================================================================== */
      .kc-tooltip {
        max-width: min(264px, calc(100vw - 16px));
      }
      .kc-mode-mobile-landscape .kc-tooltip {
        width: 222px;
        padding: 6px 8px 7px;
        border-radius: 10px;
      }
      .kc-mode-mobile-landscape .kc-tt-title {
        font-size: 16px;
        margin-bottom: 4px;
      }
      .kc-mode-mobile-landscape .kc-tt-desc {
        padding: 5px 7px;
        font-size: 13px;
        line-height: 1.28;
      }
      .kc-mode-mobile-landscape .kc-tt-badges {
        gap: 4px;
        margin-top: 5px;
      }
      .kc-mode-mobile-landscape .kc-tt-badge {
        font-size: 11px;
        padding: 1px 6px 2px;
      }
      .kc-tooltip.pinned {
        box-shadow:
          inset 0 0 0 2px #f3b958,
          0 8px 0 rgba(0, 0, 0, 0.62);
      }
      .kc-tt-live {
        margin-top: 6px;
        padding: 5px 8px;
        border-radius: 7px;
        border: 2px solid var(--kc-border);
        text-align: center;
      }
      .kc-tt-live.ready {
        background: #1a332b;
        border-color: #4bc292;
      }
      .kc-tt-live.blocked {
        background: #361f22;
        border-color: #fe5f55;
      }
      .kc-tt-live-head {
        font-size: 14px;
        color: #ffffff;
        text-shadow: 0 1px 0 #101416;
      }
      .kc-tt-live-detail {
        font-size: 12px;
        color: #d6e4e8;
        line-height: 1.24;
        margin-top: 2px;
      }

      /* =================================================================== */
      /* Tactical Modals: Run Info Header, Poker Hands, Deck Matrix,         */
      /* Collection Search/Filters/Progress, Run History & End Modal Jokers  */
      /* =================================================================== */
      .kc-modal-card {
        max-height: calc(100dvh - 16px);
        overflow: hidden;
      }
      .kc-modal-head.wrap { flex-wrap: wrap; }
      .kc-modal-scroll {
        flex: 1;
        min-height: 0;
        max-height: none;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
      }
      .kc-ri-head-meta {
        display: flex;
        flex-direction: column;
        gap: 5px;
        min-width: 0;
        flex: 1;
      }
      .kc-ri-badges {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
      }
      .kc-ri-badge {
        background: var(--kc-well);
        border: 2px solid var(--kc-border);
        border-radius: 6px;
        padding: 2px 8px;
        font-size: 13px;
        color: #dce8eb;
      }
      .kc-ri-badge.stake { border-color: #fda200; color: #f3b958; }
      .kc-ri-badge.seed b { color: #f3b958; }

      /* Enhanced Poker Hands Table */
      .kc-hand-row.previewed {
        border-color: #f3b958;
        background: #27363c;
        box-shadow: inset 0 0 0 1px rgba(243, 185, 88, 0.35);
      }
      .kc-hr-name-col {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .kc-hr-name-line {
        display: flex;
        align-items: center;
        gap: 7px;
        flex-wrap: wrap;
      }
      .kc-hr-sel-tag {
        font-size: 11px;
        background: #f3b958;
        color: #161d20;
        padding: 1px 6px;
        border-radius: 5px;
      }
      .kc-hr-sub {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        font-size: 12px;
        color: #9fb3b8;
      }
      .kc-hr-upgrade { color: #72c4ff; }
      .kc-hr-ex { color: #b9c9cd; }

      /* Full 4x13 Deck Breakdown Matrix */
      .kc-deck-kpi-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        margin-bottom: 10px;
        font-size: 14px;
      }
      .kc-deck-matrix-wrap {
        width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-x pan-y;
        background: var(--kc-well);
        border: 2px solid var(--kc-border);
        border-radius: 10px;
        padding: 8px;
      }
      .kc-deck-matrix {
        width: 100%;
        min-width: 560px;
        border-collapse: separate;
        border-spacing: 3px;
        text-align: center;
      }
      .kc-dm-corner {
        font-size: 12px;
        color: #9db0b5;
        padding: 4px;
      }
      .kc-dm-th {
        background: #171e21;
        border: 1px solid #303e42;
        border-radius: 5px;
        padding: 3px 2px;
      }
      .kc-dm-rank { font-size: 13px; color: #ffffff; }
      .kc-dm-rtot { font-size: 11px; color: #f3b958; }
      .kc-dm-suit-cell {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        background: #171e21;
        border: 1px solid #303e42;
        border-radius: 6px;
        padding: 5px 6px;
        font-size: 13px;
        white-space: nowrap;
      }
      .kc-dm-cell {
        background: #232d31;
        border: 1px solid #38494e;
        border-radius: 6px;
        padding: 4px 2px;
        min-width: 34px;
        vertical-align: middle;
      }
      .kc-dm-cell.depleted {
        opacity: 0.42;
        background: #192023;
      }
      .kc-dm-cell.empty {
        opacity: 0.25;
        background: #141a1d;
      }
      .kc-dm-cnt { font-size: 12px; color: #eaf4f7; line-height: 1.1; }
      .kc-dm-pips {
        display: flex;
        justify-content: center;
        gap: 2px;
        margin-top: 2px;
      }
      .kc-dm-pip {
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        border: 1px solid #101416;
      }
      .kc-dm-pip.enh { background: #4bc292; }
      .kc-dm-pip.ed { background: #c56cf0; }
      .kc-dm-pip.seal { background: #f3b958; }
      .kc-dm-legend {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
        margin-top: 8px;
        font-size: 12px;
        color: #b8c6c9;
      }
      .kc-dm-legend span { display: inline-flex; align-items: center; gap: 5px; }
      .kc-dm-legend-note { margin-left: auto; color: #8fa3a8; }

      /* Collection Search, Filters & Progress Bar */
      .kc-coll-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .kc-coll-search {
        min-width: 180px;
        flex: 1 1 200px;
      }
      .kc-coll-filter-group {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .kc-coll-fbtn {
        font-size: 12px;
        padding: 4px 8px;
      }
      .kc-coll-progress {
        background: var(--kc-well);
        border: 2px solid var(--kc-border);
        border-radius: 8px;
        padding: 6px 10px;
      }
      .kc-coll-prog-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 13px;
        margin-bottom: 4px;
      }
      .kc-coll-prog-track {
        width: 100%;
        height: 7px;
        background: #12181a;
        border: 1px solid #2b383d;
        border-radius: 99px;
        overflow: hidden;
      }
      .kc-coll-prog-fill {
        height: 100%;
        background: linear-gradient(90deg, #4bc292, #f3b958);
      }

      /* Run History Tab */
      .kc-history-kpi-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 10px;
      }
      .kc-history-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .kc-hist-card {
        background: var(--kc-well);
        border: 2px solid var(--kc-border);
        border-left: 5px solid #4bc292;
        border-radius: 10px;
        padding: 9px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .kc-hist-card.loss { border-left-color: #fe5f55; }
      .kc-hist-top {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        font-size: 15px;
      }
      .kc-hist-badge {
        font-size: 12px;
        padding: 2px 7px;
        border-radius: 5px;
        border: 1px solid var(--kc-border);
        color: #ffffff;
      }
      .kc-hist-badge.win { background: #3aa87c; }
      .kc-hist-badge.loss { background: #d6453c; }
      .kc-hist-deck { color: #ffffff; flex: 1; min-width: 120px; }
      .kc-hist-ante { color: #f3b958; }
      .kc-hist-mid {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 13px;
        color: #c8d6d9;
      }
      .kc-hist-seed-group {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .kc-hist-jokers {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        padding-top: 4px;
        border-top: 1px solid #2b363a;
      }
      .kc-hist-joker-cv {
        background: #141a1d;
        border: 1px solid #35444a;
        border-radius: 4px;
      }

      /* End-of-Run Final Joker Strip & Seed Copy */
      .kc-end-card {
        max-height: calc(100dvh - 20px);
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
      }
      .kc-end-seed-row { align-items: center; }
      .kc-seed-copy-group {
        display: inline-flex;
        align-items: center;
        gap: 7px;
      }
      .kc-end-jokers {
        background: var(--kc-well);
        border: 2px solid var(--kc-border);
        border-radius: 10px;
        padding: 8px 10px;
      }
      .kc-end-jokers-lbl {
        font-size: 13px;
        color: #b8c6c9;
        margin-bottom: 6px;
      }
      .kc-end-jokers-row {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 6px;
      }
      .kc-end-joker-sprite {
        background: #141a1d;
        border: 2px solid #3a4a50;
        border-radius: 5px;
      }
      .kc-end-btns { flex-wrap: wrap; }

      /* =================================================================== */
      /* Responsive Modal Stacking (Portrait & Short Landscape Viewports)    */
      /* =================================================================== */
      .kc-mode-mobile-portrait .kc-modal-backdrop,
      .kc-mode-mobile-portrait .kc-end-overlay,
      .kc-mode-mobile-landscape .kc-modal-backdrop,
      .kc-mode-mobile-landscape .kc-end-overlay {
        padding: 8px;
      }
      .kc-mode-mobile-portrait .kc-modal-card,
      .kc-mode-mobile-landscape .kc-modal-card {
        padding: 10px 12px;
        gap: 8px;
        width: calc(100vw - 16px);
      }
      .kc-mode-mobile-portrait .kc-modal-head h2,
      .kc-mode-mobile-landscape .kc-modal-head h2 {
        font-size: 19px;
      }
      .kc-mode-mobile-portrait .kc-newrun-grid,
      .kc-mode-mobile-portrait .kc-options-grid,
      .kc-mode-mobile-portrait .kc-coll-grid,
      .kc-mode-mobile-portrait .kc-info-grid {
        grid-template-columns: 1fr;
      }
      .kc-mode-mobile-portrait .kc-deck-list {
        grid-template-columns: repeat(3, 1fr);
        max-height: 200px;
      }
      .kc-mode-mobile-portrait .kc-hand-row {
        grid-template-columns: 52px 1fr auto;
        gap: 6px;
        padding: 6px 8px;
        font-size: 14px;
      }
      .kc-mode-mobile-portrait .kc-hr-played {
        grid-column: 1 / -1;
        text-align: left;
        font-size: 12px;
      }
      .kc-mode-mobile-portrait .kc-tab,
      .kc-mode-mobile-landscape .kc-tab {
        padding: 4px 8px;
        font-size: 13px;
      }
      .kc-mode-mobile-landscape .kc-newrun-grid,
      .kc-mode-mobile-landscape .kc-options-grid {
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .kc-mode-mobile-landscape .kc-deck-list {
        max-height: 150px;
      }
      @media (max-width: 760px) {
        .kc-newrun-grid,
        .kc-options-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

// ---------------------------------------------------------------------------
// Tooltip Descriptor Builder (uses live formatJokerDesc, getJokerLiveMeta,
// and getConsumablePreview!)
// ---------------------------------------------------------------------------

interface TooltipDescriptor {
  title: string;
  desc: string;
  badges: Array<{ label: string; color: string }>;
  livePreview?: { headline: string; detail: string; ok: boolean };
}

function describeVisualCard(
  vc: VisualCard,
  state: SimState
): TooltipDescriptor | null {
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
    const meta = getJokerLiveMeta(state, j);
    badges.push({
      label: RARITY_NAMES[rarity] ?? 'Joker',
      color: PALETTE.RARITY[rarity - 1] ?? PALETTE.BLUE,
    });
    pushEdition(j.edition);

    if (meta.copyingName) {
      const hasTarget = meta.copyingName !== 'No target';
      badges.push({
        label: hasTarget ? `Copying: ${meta.copyingName}` : 'No target',
        color: meta.copyingCompatible ? PALETTE.GREEN : hasTarget ? PALETTE.RED : PALETTE.GREY,
      });
      if (hasTarget) {
        badges.push({
          label: meta.copyingCompatible ? 'Compatible' : 'Incompatible',
          color: meta.copyingCompatible ? '#2a8560' : '#b8352e',
        });
      }
    } else if (meta.statusBadge) {
      badges.push({
        label: meta.statusBadge,
        color: meta.statusColor || PALETTE.ORANGE,
      });
    }

    if (j.eternal) badges.push({ label: 'Eternal', color: PALETTE.ETERNAL });
    if (j.perishable) badges.push({ label: `Perishable (${j.perishableTally})`, color: PALETTE.PERISHABLE });
    if (j.rental) badges.push({ label: 'Rental (-$3)', color: PALETTE.RENTAL });
    if (j.debuffed && meta.statusBadge !== 'DEBUFFED') badges.push({ label: 'Debuffed', color: PALETTE.RED });
    if (!j.eternal) badges.push({ label: `Sell $${j.sellValue}`, color: '#58696e' });

    return {
      title: def?.name ?? j.key,
      desc: formatJokerDesc(j, state) || def?.descTemplate || 'Joker effect',
      badges,
    };
  }

  if (vc.consumableData) {
    const c = vc.consumableData;
    const def = CONSUMABLE_MAP[c.key];
    const preview = getConsumablePreview(state, c.key, { fromInventory: true });
    badges.push({
      label: c.set,
      color: c.set === 'Planet' ? PALETTE.BLUE : c.set === 'Spectral' ? PALETTE.BOOSTER : PALETTE.PURPLE,
    });
    pushEdition(c.edition);
    badges.push({ label: `Sell $${c.sellValue}`, color: '#58696e' });
    return {
      title: def?.name ?? c.key,
      desc: def?.desc ?? 'Consumable card',
      badges,
      livePreview: {
        headline: preview.headline,
        detail: preview.detail,
        ok: preview.canUseNow,
      },
    };
  }

  if (vc.cardData) {
    const c = vc.cardData;
    const enhDef = c.enhancement !== 'none' ? ENHANCEMENT_DEFS[c.enhancement] : null;
    const sealDef = c.seal !== 'none' ? SEAL_DEFS[c.seal] : null;
    if (enhDef) badges.push({ label: enhDef.name, color: PALETTE.GREEN });
    if (sealDef) badges.push({ label: sealDef.name, color: sealDef.color });
    pushEdition(c.edition);
    if (vc.forced) badges.push({ label: 'Forced Card', color: '#4794d4' });
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
      if (o.eternal) badges.push({ label: 'Eternal', color: PALETTE.ETERNAL });
      if (o.perishable) badges.push({ label: 'Perishable', color: PALETTE.PERISHABLE });
      if (o.rental) badges.push({ label: 'Rental (-$3)', color: PALETTE.RENTAL });
      return { title: d?.name ?? o.key, desc: d?.descTemplate ?? 'Joker', badges };
    }
    if (o.kind === 'playing_card') {
      const enhDef = o.enhancement && o.enhancement !== 'none' ? ENHANCEMENT_DEFS[o.enhancement] : null;
      const sealDef = o.seal && o.seal !== 'none' ? SEAL_DEFS[o.seal] : null;
      if (enhDef) badges.push({ label: enhDef.name, color: PALETTE.GREEN });
      if (sealDef) badges.push({ label: sealDef.name, color: sealDef.color });
      const descParts = [enhDef?.desc, sealDef?.desc].filter(Boolean);
      return {
        title: o.enhancement === 'm_stone' ? 'Stone Card' : `${o.rank ?? 'Ace'} of ${o.suit ?? 'Spades'}`,
        desc: descParts.length > 0 ? descParts.join(' • ') : 'Add to your deck',
        badges,
      };
    }
    const cd = CONSUMABLE_MAP[o.key];
    const preview = getConsumablePreview(state, o.key, { fromInventory: false });
    badges.push({
      label: cd?.set ?? o.kind,
      color: cd?.set === 'Planet' ? PALETTE.BLUE : cd?.set === 'Spectral' ? PALETTE.BOOSTER : PALETTE.PURPLE,
    });
    return {
      title: cd?.name ?? o.key,
      desc: cd?.desc ?? '',
      badges,
      livePreview: {
        headline: preview.headline,
        detail: preview.detail,
        ok: preview.canUseNow,
      },
    };
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
      if (pc.eternal) badges.push({ label: 'Eternal', color: PALETTE.ETERNAL });
      if (pc.perishable) badges.push({ label: 'Perishable', color: PALETTE.PERISHABLE });
      if (pc.rental) badges.push({ label: 'Rental (-$3)', color: PALETTE.RENTAL });
      return { title: d?.name ?? pc.key, desc: d?.descTemplate ?? '', badges };
    }
    if (pc.kind === 'playing_card') {
      const enhDef = pc.enhancement && pc.enhancement !== 'none' ? ENHANCEMENT_DEFS[pc.enhancement] : null;
      const sealDef = pc.seal && pc.seal !== 'none' ? SEAL_DEFS[pc.seal] : null;
      if (enhDef) badges.push({ label: enhDef.name, color: PALETTE.GREEN });
      if (sealDef) badges.push({ label: sealDef.name, color: sealDef.color });
      const descParts = [enhDef?.desc, sealDef?.desc].filter(Boolean);
      return {
        title: pc.enhancement === 'm_stone' ? 'Stone Card' : `${pc.rank ?? 'Ace'} of ${pc.suit ?? 'Hearts'}`,
        desc: descParts.length > 0 ? descParts.join(' • ') : 'Add this card to your deck',
        badges,
      };
    }
    const cd = CONSUMABLE_MAP[pc.key];
    const preview = getConsumablePreview(state, pc.key, { fromInventory: false });
    badges.push({
      label: cd?.set ?? pc.kind,
      color: cd?.set === 'Planet' ? PALETTE.BLUE : cd?.set === 'Spectral' ? PALETTE.BOOSTER : PALETTE.PURPLE,
    });
    return {
      title: cd?.name ?? pc.key,
      desc: cd?.desc ?? '',
      badges,
      livePreview: {
        headline: preview.headline,
        detail: preview.detail,
        ok: preview.canUseNow,
      },
    };
  }

  return null;
}
