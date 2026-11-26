// ============================================================================
// Krunked Cards — Beveled HUD, Phase Arenas, Modals & Dynamic Hover Tooltips
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
import { getActiveBlind, getEffectiveConsumableSlots, getEffectiveJokerSlots, previewSelectedHand } from '../sim/index.ts';
import type { PackManager } from '../assets/PackManager.ts';
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

export class UiOverlay {
  private root: HTMLElement;
  private packManager: PackManager;
  private cb: UiCallbacks;

  private activeModal: ActiveModal = null;
  private runInfoTab: 'hands' | 'blinds' | 'vouchers' | 'deck' = 'hands';
  private collectionTab: 'jokers' | 'tarots' | 'planets' | 'spectrals' | 'vouchers' | 'boosters' | 'blinds' | 'tags' | 'decks' = 'jokers';
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
  private folderInput: HTMLInputElement;
  private archiveInput: HTMLInputElement;

  // Dirty-checking keys to avoid tearing down DOM on every 120fps frame
  private lastRailKey = '';
  private lastTableKey = '';
  private lastModalKey = '';
  private lastHoveredCard: VisualCard | null = null;
  private lastHoverX = 0;
  private lastHoverY = 0;
  private lastAnimTick = -1;

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
  }

  invalidateModal(): void {
    this.lastModalKey = '';
  }

  setHoveredCard(card: VisualCard | null, x: number, y: number, state: SimState): void {
    this.lastHoveredCard = card;
    this.lastHoverX = x;
    this.lastHoverY = y;
    this.renderTooltip(card, x, y, state);
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
    const extraTop = Math.round(52 + Math.min(48, intensity * 7));
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
    const shownChips = choreo.active
      ? choreo.displayChips
      : preview
        ? preview.baseChips
        : state.currentHandChips;
    const shownMult = choreo.active
      ? choreo.displayMult
      : preview
        ? preview.baseMult
        : state.currentHandMult;
    const shownHandName = choreo.active
      ? choreo.handName || state.lastHandName || ''
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
      // Lightweight pulse updates without rebuilding DOM
      const cb = this.railLayer.querySelector('#kc-chips-box') as HTMLElement | null;
      const mb = this.railLayer.querySelector('#kc-mult-box') as HTMLElement | null;
      if (cb) cb.style.transform = choreo.chipsPulse > 0.01 ? `scale(${1 + choreo.chipsPulse * 0.12})` : '';
      if (mb) mb.style.transform = choreo.multPulse > 0.01 ? `scale(${1 + choreo.multPulse * 0.12})` : '';
    }

    // 3. Table Overlays (Title Screen / Blind Select / Shop / Cashout / Pack / Playing Controls / Trays)
    const tableKey = [
      state.phase,
      geom.viewportW,
      geom.viewportH,
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
      state.pack ? `${state.pack.boosterKey}:${state.pack.chooseRemaining}:${state.pack.cards.map((c) => (c.taken ? '1' : '0')).join('')}` : '',
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
    const tagsHtml =
      state.tags.length > 0
        ? `<div class="kc-rail-tags">${state.tags
            .slice(-6)
            .map((tk) => {
              const td = TAG_MAP[tk];
              return `<span class="kc-tag-pill" title="${esc(td?.desc ?? tk)}">${esc(td?.name ?? tk)}</span>`;
            })
            .join('')}</div>`
        : '';

    this.railLayer.innerHTML = `
      <aside class="kc-rail ${compact ? 'compact' : ''} ${flaming ? 'rail-flaming' : ''}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;">
        <div class="kc-blind-header" style="--blind-col:${headerColor};">
          <div class="kc-blind-title-bar">${esc(activeBlind?.name ?? 'Small Blind')}</div>
          <div class="kc-blind-body">
            <canvas class="kc-blind-chip-canvas" width="56" height="56" data-blind-row="${blindDef?.pos.y ?? 0}"></canvas>
            <div class="kc-blind-meta">
              <div class="kc-muted-sm">Score at least</div>
              <div class="kc-target-score"><span class="kc-chip-dot"></span>${fmtNum(state.targetChips)}</div>
              <div class="kc-blind-reward">Reward: <span class="kc-gold">${'$'.repeat(Math.max(1, Math.min(8, activeBlind?.dollars ?? 3)))}</span></div>
            </div>
          </div>
          ${
            blindDef?.desc
              ? `<div class="kc-blind-desc">${esc(activeBlind?.disabled ? '(Boss Disabled) ' + blindDef.desc : blindDef.desc)}</div>`
              : ''
          }
        </div>

        <div class="kc-inset-box kc-round-score-box">
          <span class="kc-muted-sm">Round<br/>score</span>
          <div class="kc-round-score-val"><span class="kc-chip-dot"></span>${fmtNum(state.roundChips)}</div>
        </div>

        <div class="kc-hand-box ${flaming ? 'flaming' : ''}">
          <div class="kc-hand-header">
            <span class="kc-hand-name">${esc(handName || 'Select Cards')}</span>
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
                <div class="kc-stat-val kc-amber">${state.ante}<span class="kc-muted-sm">/${state.winAnte}</span></div>
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

    // 1. Top Joker & Consumable Felt Trays (always visible in run)
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
      const barY = geom.viewportH - 60;
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

    this.tableLayer.innerHTML = `
      <div class="kc-title-screen">
        <div class="kc-logo-wrap">
          <div class="kc-logo-badge">ROGUELIKE POKER DECKBUILDER</div>
          <h1 class="kc-logo-text">
            <span class="kc-logo-k">KRUNKED</span>
            <span class="kc-logo-c">CARDS</span>
          </h1>
        </div>

        <div class="kc-title-dock">
          <div class="kc-title-main-btns">
            <button class="kc-btn kc-btn-blue kc-title-btn interactive" data-title="play">PLAY</button>
            ${
              hasSave
                ? `<button class="kc-btn kc-btn-green kc-title-btn interactive" data-title="continue">CONTINUE RUN</button>`
                : ''
            }
            <button class="kc-btn kc-btn-purple kc-title-btn interactive" data-title="collection">COLLECTION</button>
            <button class="kc-btn kc-btn-amber kc-title-btn interactive" data-title="options">OPTIONS</button>
          </div>

          <div class="kc-pack-bar">
            <button class="kc-btn kc-btn-sm ${mode === 'custom' ? 'kc-btn-green' : 'kc-btn-slate'} interactive" data-title="toggle-pack">
              ${mode === 'custom' ? 'USE BUILT-IN ART' : hasCustom ? 'USE CUSTOM PACK' : 'ART: BUILT-IN'}
            </button>
            <button class="kc-btn kc-btn-sm kc-btn-teal interactive" data-title="load-pack-folder">
              LOAD CUSTOM PACK (FOLDER)
            </button>
            <button class="kc-btn kc-btn-sm kc-btn-teal interactive" data-title="load-pack-archive">
              LOAD CUSTOM PACK (.EXE / .ZIP)
            </button>
            <span class="kc-pack-status">${esc(this.packManager.getStatusMessage())}</span>
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
    const topY = geom.jokerTray.y + geom.jokerTray.h + 18;
    const h = geom.viewportH - topY - 18;
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
          slot !== 'Boss' && isCurrent && tag
            ? `
            <div class="kc-skip-box">
              <div class="kc-skip-tag-row">
                <canvas class="kc-tag-canvas" width="34" height="34" data-tag-x="${tag.pos.x}" data-tag-y="${tag.pos.y}"></canvas>
                <div>
                  <div class="kc-skip-tag-name">${esc(tag.name)}</div>
                  <div class="kc-skip-tag-desc">${esc(tag.desc)}</div>
                </div>
              </div>
              <button class="kc-btn kc-btn-red kc-btn-sm interactive" data-act="skip-blind">Skip Blind</button>
            </div>
          `
            : slot === 'Boss' && canRerollBoss
              ? `<button class="kc-btn kc-btn-red kc-btn-sm interactive" data-act="reroll-boss">Reroll Boss ($10)</button>`
              : '';

        return `
          <div class="kc-blind-col ${isCurrent ? 'active' : 'dimmed'}">
            <div class="kc-blind-col-top">${statusBtn}</div>
            <div class="kc-blind-col-banner" style="background:${colBg};">${esc(b.name)}</div>
            <div class="kc-blind-col-body">
              <canvas class="kc-blind-col-chip" width="68" height="68" data-blind-row="${def?.pos.y ?? 0}"></canvas>
              <div class="kc-muted-sm">Score at least</div>
              <div class="kc-target-score lg"><span class="kc-chip-dot"></span>${fmtNum(b.targetChips)}</div>
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
    const shop = state.shop!;
    const topY = geom.jokerTray.y + geom.jokerTray.h + 14;
    const controlsW = geom.shopOfferTray.x - geom.table.x - 16;
    const canAfford = (cost: number) => state.dollars - state.bankruptAt >= cost;
    const rerollPrice = state.freeRerolls > 0 ? 0 : state.rerollCost;
    const canReroll = canAfford(rerollPrice);

    const cardButtons: string[] = [];
    for (const vc of cards) {
      if (vc.kind !== 'shop_offer' && vc.kind !== 'shop_voucher' && vc.kind !== 'shop_booster') {
        continue;
      }
      const cx = Math.round(vc.moveable.tx);
      const topTagY = Math.round(vc.moveable.ty - vc.moveable.th * 0.5 - 24);
      const btnY = Math.round(vc.moveable.ty + vc.moveable.th * 0.5 + 8);
      const cost = vc.cost ?? 0;
      const affordable = canAfford(cost);

      cardButtons.push(
        `<div class="kc-price-tag" style="left:${cx}px;top:${topTagY}px;">$${cost}</div>`
      );

      if (vc.kind === 'shop_offer' && vc.shopOfferData) {
        const o = vc.shopOfferData;
        const canImmediateUse = o.kind === 'tarot' || o.kind === 'planet' || o.kind === 'spectral';
        cardButtons.push(`
          <div class="kc-card-actions" style="left:${cx}px;top:${btnY}px;">
            <button class="kc-mini-btn kc-btn-amber interactive" ${affordable ? '' : 'disabled'} data-buy-offer="${esc(o.id)}">BUY</button>
            ${
              canImmediateUse
                ? `<button class="kc-mini-btn kc-btn-red interactive" ${affordable ? '' : 'disabled'} data-buy-use-offer="${esc(o.id)}">BUY & USE</button>`
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
      <div class="kc-shop-controls" style="left:${geom.table.x}px;top:${topY}px;width:${controlsW}px;">
        <canvas class="kc-shop-sign-canvas" width="226" height="114"></canvas>
        <button class="kc-btn kc-btn-red kc-shop-btn interactive" data-act="shop-next">Next Round</button>
        <button class="kc-btn kc-btn-green kc-shop-btn interactive" ${canReroll ? '' : 'disabled'} data-act="shop-reroll">
          Reroll<br/><span>${rerollPrice === 0 ? 'FREE' : '$' + rerollPrice}</span>
        </button>
      </div>

      <div class="kc-felt-tray kc-shop-shelf" style="left:${geom.shopOfferTray.x}px;top:${geom.shopOfferTray.y - 26}px;width:${geom.shopOfferTray.w}px;height:${geom.shopOfferTray.h + 26}px;"></div>
      <div class="kc-felt-tray kc-shop-shelf" style="left:${geom.shopVoucherTray.x}px;top:${geom.shopVoucherTray.y - 26}px;width:${geom.shopVoucherTray.w}px;height:${geom.shopVoucherTray.h + 26}px;">
        <span class="kc-tray-counter left">ANTE VOUCHER</span>
      </div>
      <div class="kc-felt-tray kc-shop-shelf" style="left:${geom.shopBoosterTray.x}px;top:${geom.shopBoosterTray.y - 26}px;width:${geom.shopBoosterTray.w}px;height:${geom.shopBoosterTray.h + 26}px;">
        <span class="kc-tray-counter left">BOOSTER PACKS</span>
      </div>
      ${cardButtons.join('')}
    `;
  }

  private buildCashoutHtml(state: SimState, geom: TableGeometry): string {
    const co = state.cashout!;
    const topY = geom.jokerTray.y + geom.jokerTray.h + 24;
    const rowsHtml = co.rows
      .map(
        (r) => `
      <div class="kc-cash-row">
        <div>
          <span class="kc-cash-label">${esc(r.label)}</span>
          ${r.detail ? `<span class="kc-cash-detail">${esc(r.detail)}</span>` : ''}
        </div>
        <span class="kc-cash-val" style="color:${r.color || PALETTE.MONEY};">
          ${r.dollars >= 0 ? '$' + r.dollars : '-$' + Math.abs(r.dollars)}
        </span>
      </div>
    `
      )
      .join('');

    return `
      <div class="kc-cashout-panel" style="left:${geom.table.x + 24}px;top:${topY}px;width:${geom.table.w - 48}px;">
        <div class="kc-cashout-header">BLIND DEFEATED!</div>
        <div class="kc-cashout-rows">${rowsHtml}</div>
        <button class="kc-btn kc-btn-amber kc-cashout-btn interactive" data-act="finish-cashout">
          Cash Out: $${co.total}
        </button>
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
      <div class="kc-pack-banner" style="left:${geom.packTray.x}px;top:${geom.packTray.y - 26}px;width:${geom.packTray.w}px;">
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
            <div><span>Best Hand</span><strong>${fmtNum(state.stats.bestHand)}</strong></div>
            <div><span>Ante Reached</span><strong>${state.ante} / ${state.winAnte}</strong></div>
            <div><span>Rounds Won</span><strong>${state.round}</strong></div>
            <div><span>Seed</span><strong>${esc(state.rng.seed)}</strong></div>
            ${
              !victory && state.stats.defeatedBy
                ? `<div><span>Defeated By</span><strong>${esc(state.stats.defeatedBy)}</strong></div>`
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
    // Register animated BlindChip canvases and Shop Sign canvas
    this.tableLayer.querySelectorAll<HTMLCanvasElement>('.kc-blind-col-chip').forEach((c) => {
      const row = Number(c.dataset.blindRow ?? 0);
      this.registerAnimatedCanvas(c, 'BlindChips', row, 21);
    });
    this.tableLayer.querySelectorAll<HTMLCanvasElement>('.kc-tag-canvas').forEach((c) => {
      this.drawAtlasCellToCanvas(c, 'tags', Number(c.dataset.tagX ?? 0), Number(c.dataset.tagY ?? 0));
    });
    const shopSign = this.tableLayer.querySelector<HTMLCanvasElement>('.kc-shop-sign-canvas');
    if (shopSign) {
      this.registerAnimatedCanvas(shopSign, 'shop_sign', 0, 4);
    }

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
      this.cb.onDispatch({ type: 'SHOP_BUY_OFFER', offerId: el.dataset.buyOffer!, useImmediately: false });
    });
    bind('[data-buy-use-offer]', (el) => {
      this.cb.onDispatch({ type: 'SHOP_BUY_OFFER', offerId: el.dataset.buyUseOffer!, useImmediately: true });
    });
    bind('[data-buy-voucher]', (el) => {
      this.cb.onDispatch({ type: 'SHOP_BUY_VOUCHER', voucherOfferId: el.dataset.buyVoucher! });
    });
    bind('[data-buy-booster]', (el) => {
      this.cb.onDispatch({ type: 'SHOP_BUY_BOOSTER', boosterOfferId: el.dataset.buyBooster! });
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
  // Floating Score Popups
  // =========================================================================

  private renderPopups(choreo: ChoreographerDisplay): void {
    if (choreo.popups.length === 0) {
      if (this.popupLayer.childElementCount > 0) this.popupLayer.innerHTML = '';
      return;
    }
    this.popupLayer.innerHTML = choreo.popups
      .map((p) => {
        const progress = p.age / Math.max(0.01, p.lifetime);
        const alpha = progress > 0.72 ? Math.max(0, 1 - (progress - 0.72) / 0.28) : 1;
        const popScale = progress < 0.14 ? 0.65 + (progress / 0.14) * 0.5 : 1.15 - Math.min(0.15, progress * 0.25);
        return `
          <div class="kc-popup-pill" style="left:${Math.round(p.x)}px;top:${Math.round(p.y)}px;background:${p.bgColor};color:${p.textColor};opacity:${alpha.toFixed(2)};transform:translate(-50%,-50%) scale(${popScale.toFixed(2)}) rotate(${(p.rotation * 57.3).toFixed(1)}deg);">
            ${esc(p.text)}
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
    else if (this.activeModal === 'RUN_INFO') inner = this.buildRunInfoModalHtml(state);
    else if (this.activeModal === 'COLLECTION') inner = this.buildCollectionModalHtml();
    else if (this.activeModal === 'OPTIONS') inner = this.buildOptionsModalHtml(settings);
    else if (this.activeModal === 'PAUSE') inner = this.buildPauseModalHtml();

    this.modalLayer.innerHTML = `<div class="kc-modal-backdrop interactive">${inner}</div>`;
    this.bindModalEvents(state, settings);
  }

  private buildNewRunModalHtml(): string {
    const decks = DECKS.length > 0 ? DECKS : [{ key: 'b_red', name: 'Red Deck', order: 1, pos: { x: 0, y: 0 }, desc: '+1 discard every round', config: {} }];
    const stakes = STAKES.length > 0 ? STAKES : [{ level: 1 as StakeLevel, key: 'stake_white', name: 'White Stake', pos: { x: 0, y: 0 }, color: '#efefef', scaling: 1 as const, desc: 'Base Difficulty' }];
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
                    <canvas class="kc-mini-sprite" width="35" height="47" data-atlas="centers" data-ax="${d.pos.x}" data-ay="${d.pos.y}"></canvas>
                    <span>${esc(d.name)}</span>
                    ${maxSt ? `<small class="kc-gold">S${maxSt}</small>` : ''}
                  </button>
                `;
                })
                .join('')}
            </div>
            <div class="kc-desc-banner">
              <strong>${esc(selectedDeck.name)}</strong>: ${esc(selectedDeck.desc)}
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
              <strong>${esc(selectedStake.name)}</strong>: ${esc(selectedStake.desc)}
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

  private buildRunInfoModalHtml(state: SimState): string {
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
                  <b class="kc-blue">${fmtNum(st.chips)}</b> X <b class="kc-red">${st.mult}</b>
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
                <div class="kc-info-title">${esc(b.name)} (${b.status})</div>
                <div class="kc-gold">Target: ${fmtNum(b.targetChips)} | Reward: $${b.dollars}</div>
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
                return `<div class="kc-info-card"><div class="kc-info-title">${esc(v?.name ?? vk)}</div><div class="kc-muted-sm">${esc(v?.desc ?? '')}</div></div>`;
              })
              .join('')}</div>`;
    } else {
      const suitCounts: Record<string, number> = { Hearts: 0, Diamonds: 0, Spades: 0, Clubs: 0 };
      for (const c of state.fullDeck) suitCounts[c.suit] = (suitCounts[c.suit] ?? 0) + 1;
      body = `
        <div class="kc-deck-summary">
          <div class="kc-suit-pills">
            <span>♥ Hearts: <b>${suitCounts.Hearts}</b></span>
            <span>♦ Diamonds: <b>${suitCounts.Diamonds}</b></span>
            <span>♠ Spades: <b>${suitCounts.Spades}</b></span>
            <span>♣ Clubs: <b>${suitCounts.Clubs}</b></span>
            <span>Draw Pile: <b>${state.drawPile.length}/${state.fullDeck.length}</b></span>
          </div>
          <div class="kc-deck-cards-grid">
            ${state.fullDeck
              .slice(0, 80)
              .map((c) => {
                const sym =
                  c.suit === 'Hearts' ? '♥' : c.suit === 'Diamonds' ? '♦' : c.suit === 'Spades' ? '♠' : '♣';
                const col = c.suit === 'Hearts' || c.suit === 'Diamonds' ? '#fe5f55' : '#cfd8e3';
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
      items: Array<{ key: string; name: string; desc: string; atlas: AtlasKey; x: number; y: number; w: number; h: number; discovered: boolean }>
    ) =>
      items
        .map(
          (it) => `
        <div class="kc-coll-item ${it.discovered ? 'seen' : ''}">
          <canvas class="kc-mini-sprite" width="${it.w}" height="${it.h}" data-atlas="${it.atlas}" data-ax="${it.x}" data-ay="${it.y}"></canvas>
          <div class="kc-coll-meta">
            <div class="kc-coll-name">${esc(it.name)} ${it.discovered ? '<span class="kc-seen-dot">★</span>' : ''}</div>
            <div class="kc-coll-desc">${esc(it.desc)}</div>
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
          w: 42,
          h: 56,
          discovered: profile.discoveredJokers.includes(j.key),
        }))
      );
    } else if (this.collectionTab === 'tarots' || this.collectionTab === 'planets' || this.collectionTab === 'spectrals') {
      const src: ConsumableDef[] =
        this.collectionTab === 'tarots' ? TAROTS : this.collectionTab === 'planets' ? PLANETS : SPECTRALS;
      itemsHtml = renderCards(
        src.map((c) => ({
          key: c.key,
          name: c.name,
          desc: c.desc,
          atlas: 'Tarot',
          x: c.pos.x,
          y: c.pos.y,
          w: 42,
          h: 56,
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
          w: 42,
          h: 56,
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
          w: 42,
          h: 56,
          discovered: true,
        }))
      );
    } else if (this.collectionTab === 'blinds') {
      itemsHtml = renderCards(
        BLINDS.map((b) => ({
          key: b.key,
          name: b.name,
          desc: b.desc || `${b.mult}x Base | $${b.dollars}`,
          atlas: 'BlindChips',
          x: 0,
          y: b.pos.y,
          w: 34,
          h: 34,
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
          w: 34,
          h: 34,
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
          w: 42,
          h: 56,
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
            <div class="kc-section-hdr">Video & Pace</div>
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
            <div class="kc-section-hdr">Art & Audio Pack</div>
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
          <button class="kc-btn kc-btn-purple interactive" data-pause="newrun">New Run</button>
          <button class="kc-btn kc-btn-red interactive" data-pause="title">Main Menu</button>
        </div>
      </div>
    `;
  }

  private bindModalEvents(_state: SimState, _settings: RenderSettings): void {
    // Draw any mini sprite canvases inside New Run or Collection
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
  // Dynamic Viewport-Clamped Hover Tooltip
  // =========================================================================

  private renderTooltip(card: VisualCard | null, x: number, y: number, state: SimState): void {
    if (!card || this.activeModal || card.kind === 'title_showcase' || card.kind === 'deck_pile') {
      this.tooltipEl.classList.add('hidden');
      return;
    }

    const info = describeVisualCard(card, state);
    if (!info) {
      this.tooltipEl.classList.add('hidden');
      return;
    }

    const badgesHtml = info.badges
      .map(
        (b) => `<span class="kc-tt-badge" style="background:${b.color};">${esc(b.label)}</span>`
      )
      .join('');

    this.tooltipEl.innerHTML = `
      <div class="kc-tt-title">${esc(info.title)}</div>
      <div class="kc-tt-desc">${esc(info.desc)}</div>
      ${badgesHtml ? `<div class="kc-tt-badges">${badgesHtml}</div>` : ''}
    `;
    this.tooltipEl.classList.remove('hidden');

    // Clamp strictly inside viewport
    const tw = this.tooltipEl.offsetWidth || 230;
    const th = this.tooltipEl.offsetHeight || 110;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let tx = card.moveable.vx + card.moveable.vw * 0.56;
    if (tx + tw + 12 > vw) {
      tx = card.moveable.vx - card.moveable.vw * 0.56 - tw;
    }
    tx = Math.max(12, Math.min(vw - tw - 12, tx));

    let ty = card.moveable.vy - th * 0.5;
    ty = Math.max(12, Math.min(vh - th - 12, ty));

    this.tooltipEl.style.left = `${Math.round(tx)}px`;
    this.tooltipEl.style.top = `${Math.round(ty)}px`;
    void x;
    void y;
  }

  // =========================================================================
  // Beveled Stylesheet Injection
  // =========================================================================

  private injectStyles(): void {
    if (document.getElementById('krunked-ui-styles')) return;
    const style = document.createElement('style');
    style.id = 'krunked-ui-styles';
    style.textContent = `
      :root {
        --krunked-font: 'Trebuchet MS', 'Bahnschrift', 'Segoe UI', sans-serif;
        --kc-dark: #252d30;
        --kc-slate: #374244;
        --kc-slate-lt: #4f6367;
        --kc-border: #1b2224;
      }
      #ui-root {
        font-family: var(--krunked-font);
        color: #fff;
        letter-spacing: 0.02em;
      }
      .kc-layer { position: absolute; inset: 0; pointer-events: none; }
      .kc-popups { z-index: 45; }
      .kc-modal-layer { z-index: 60; }
      .hidden { display: none !important; }

      /* Left Console Rail */
      .kc-rail {
        position: absolute;
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: linear-gradient(180deg, rgba(45,55,58,0.92), rgba(33,40,43,0.92));
        border: 3px solid var(--kc-border);
        border-radius: 14px;
        padding: 9px;
        box-shadow: 0 8px 0 rgba(0,0,0,0.42), inset 0 2px 0 rgba(255,255,255,0.1);
        pointer-events: auto;
        transition: background 0.25s ease;
      }
      .kc-rail.rail-flaming {
        background: linear-gradient(
          180deg,
          rgba(45,55,58,0.92) 0%,
          rgba(45,55,58,0.88) 33%,
          rgba(22,28,31,0.12) 42%,
          rgba(22,28,31,0.12) 60%,
          rgba(33,40,43,0.92) 69%,
          rgba(33,40,43,0.94) 100%
        );
      }
      .kc-blind-header {
        background: #232b2e;
        border: 2px solid var(--kc-border);
        border-radius: 10px;
        overflow: hidden;
      }
      .kc-blind-title-bar {
        background: var(--blind-col, #2e659e);
        text-align: center;
        font-weight: 900;
        font-size: 18px;
        padding: 5px 8px;
        text-shadow: 0 2px 0 rgba(0,0,0,0.45);
        border-bottom: 2px solid rgba(0,0,0,0.28);
      }
      .kc-blind-body {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
      }
      .kc-blind-chip-canvas {
        width: 50px; height: 50px; flex: 0 0 50px;
        image-rendering: pixelated;
      }
      .kc-blind-meta { flex: 1; min-width: 0; }
      .kc-muted-sm { font-size: 12px; color: #b8c6c9; line-height: 1.2; }
      .kc-target-score {
        display: flex; align-items: center; gap: 6px;
        font-size: 22px; font-weight: 900; color: #fe5f55;
        text-shadow: 0 2px 0 rgba(0,0,0,0.5);
      }
      .kc-target-score.lg { justify-content: center; font-size: 26px; margin: 4px 0; }
      .kc-chip-dot {
        display: inline-block; width: 13px; height: 13px; border-radius: 50%;
        background: radial-gradient(circle at 35% 35%, #8ce0ff, #009dff 65%, #005599);
        border: 2px solid #fff; box-shadow: 0 1px 0 #1b2224; flex-shrink: 0;
      }
      .kc-blind-reward { font-size: 13px; font-weight: 700; margin-top: 2px; }
      .kc-blind-desc {
        font-size: 12px; color: #f0e6d2; text-align: center;
        background: rgba(0,0,0,0.28); padding: 5px 8px; line-height: 1.25;
      }
      .kc-inset-box {
        background: #1f2729;
        border: 2px solid #141a1c;
        border-radius: 10px;
        padding: 7px 10px;
        box-shadow: inset 0 2px 4px rgba(0,0,0,0.4);
      }
      .kc-round-score-box { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .kc-round-score-val {
        display: flex; align-items: center; gap: 6px;
        font-size: 23px; font-weight: 900; color: #fff;
        text-shadow: 0 2px 0 rgba(0,0,0,0.5);
      }

      /* Hand Score Box (transparent glass so WebGL2 roaring flames shine through!) */
      .kc-hand-box {
        background: rgba(24, 31, 34, 0.72);
        border: 2px solid #141a1c;
        border-radius: 11px;
        padding: 8px 8px 10px;
        transition: border-color 0.2s;
      }
      .kc-hand-box.flaming {
        background: rgba(24, 31, 34, 0.36);
        border-color: #fda200;
        box-shadow: 0 0 18px rgba(254, 95, 85, 0.45);
      }
      .kc-hand-header {
        display: flex; align-items: center; justify-content: center; gap: 7px;
        min-height: 24px; margin-bottom: 6px;
      }
      .kc-hand-name {
        font-size: 17px; font-weight: 900; color: #fff;
        text-shadow: 0 2px 0 rgba(0,0,0,0.55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .kc-lvl-badge {
        color: #1f2729; font-weight: 900; font-size: 12px;
        padding: 1px 6px; border-radius: 6px; flex-shrink: 0;
      }
      .kc-score-math {
        display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 6px;
      }
      .kc-math-pill {
        border-radius: 8px; padding: 8px 6px; text-align: center;
        font-size: 24px; font-weight: 900; color: #fff;
        border: 2px solid rgba(0,0,0,0.35);
        text-shadow: 0 2px 0 rgba(0,0,0,0.45);
        box-shadow: 0 4px 0 rgba(0,0,0,0.35);
        transition: transform 0.08s ease-out;
        overflow: hidden; text-overflow: ellipsis;
      }
      .kc-chips-pill { background: #009dff; }
      .kc-mult-pill { background: #fe5f55; }
      .kc-math-x { font-size: 22px; font-weight: 900; color: #fe5f55; text-shadow: 0 2px 0 #1b2224; }

      .kc-rail-mid-grid {
        display: grid; grid-template-columns: 0.85fr 1.15fr; gap: 7px; margin-top: auto;
      }
      .kc-rail-buttons { display: flex; flex-direction: column; gap: 7px; }
      .kc-rail-buttons .kc-btn { flex: 1; font-size: 14px; padding: 8px 4px; }
      .kc-rail-stats { display: flex; flex-direction: column; gap: 6px; }
      .kc-stat-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
      .kc-stat-card {
        background: #1f2729; border: 2px solid #141a1c; border-radius: 8px;
        text-align: center; padding: 4px 3px;
      }
      .kc-stat-lbl { font-size: 11px; color: #b8c6c9; font-weight: 700; }
      .kc-stat-val { font-size: 20px; font-weight: 900; line-height: 1.1; }
      .kc-money-bar {
        background: #1f2729; border: 2px solid #141a1c; border-radius: 8px;
        text-align: center; padding: 6px 4px;
        font-size: 24px; font-weight: 900; color: #f3b958;
        text-shadow: 0 2px 0 rgba(0,0,0,0.5);
      }
      .kc-rail-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
      .kc-tag-pill {
        background: #4f6367; border: 1px solid #1b2224; border-radius: 6px;
        padding: 2px 6px; font-size: 11px; font-weight: 700; color: #fff;
      }

      /* Colors */
      .kc-blue { color: #009dff; }
      .kc-red { color: #fe5f55; }
      .kc-amber { color: #fda200; }
      .kc-gold { color: #f3b958; }

      /* Tactile Beveled Buttons */
      .kc-btn {
        font-family: var(--krunked-font);
        font-weight: 900;
        color: #fff;
        border: 2px solid #1a2124;
        border-radius: 10px;
        padding: 10px 14px;
        cursor: pointer;
        text-shadow: 0 2px 0 rgba(0,0,0,0.38);
        box-shadow: 0 4px 0 rgba(0,0,0,0.42), inset 0 2px 0 rgba(255,255,255,0.22);
        transition: transform 0.06s, filter 0.1s;
        line-height: 1.15;
      }
      .kc-btn:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
      .kc-btn:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 rgba(0,0,0,0.42); }
      .kc-btn:disabled { opacity: 0.42; cursor: not-allowed; filter: grayscale(0.5); }
      .kc-btn-sm { padding: 6px 10px; font-size: 13px; border-radius: 8px; }
      .kc-btn-blue { background: #009dff; }
      .kc-btn-red { background: #fe5f55; }
      .kc-btn-amber { background: #fda200; }
      .kc-btn-green { background: #4bc292; }
      .kc-btn-purple { background: #8867a5; }
      .kc-btn-teal { background: #3b8d99; }
      .kc-btn-slate { background: #4f6367; }

      /* Felt Trays */
      .kc-felt-tray {
        position: absolute;
        background: rgba(18, 25, 28, 0.34);
        border: 2px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        pointer-events: none;
      }
      .kc-tray-counter {
        position: absolute; bottom: -18px;
        font-size: 12px; font-weight: 800; color: #dce7ea;
        text-shadow: 0 1px 2px #000;
      }
      .kc-tray-counter.left { left: 6px; }
      .kc-tray-counter.right { right: 6px; }

      /* Deck Badge & Action Bar */
      .kc-deck-badge {
        position: absolute;
        background: rgba(25, 32, 36, 0.85);
        border: 2px solid #1b2224;
        border-radius: 8px;
        color: #fff; font-weight: 900; font-size: 14px;
        padding: 4px 6px; cursor: pointer;
        text-align: center;
      }
      .kc-action-bar {
        position: absolute;
        display: flex; align-items: center; justify-content: center; gap: 14px;
        height: 52px;
      }
      .kc-action-lg { min-width: 148px; height: 48px; font-size: 18px; }
      .kc-sort-box {
        background: rgba(31, 39, 41, 0.9);
        border: 2px solid #1b2224; border-radius: 10px;
        padding: 4px 8px; text-align: center;
      }
      .kc-sort-title { font-size: 11px; color: #b8c6c9; font-weight: 800; margin-bottom: 3px; }
      .kc-sort-btns { display: flex; gap: 6px; }
      .kc-sort-btns .kc-btn.active { outline: 2px solid #fff; }

      /* Card contextual buttons & prices */
      .kc-card-actions {
        position: absolute; transform: translateX(-50%);
        display: flex; gap: 5px; z-index: 30;
      }
      .kc-mini-btn {
        font-family: var(--krunked-font); font-weight: 900; font-size: 12px;
        color: #fff; border: 2px solid #1a2124; border-radius: 7px;
        padding: 4px 8px; cursor: pointer; white-space: nowrap;
        box-shadow: 0 3px 0 rgba(0,0,0,0.45);
        text-shadow: 0 1px 0 rgba(0,0,0,0.4);
      }
      .kc-mini-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .kc-price-tag {
        position: absolute; transform: translateX(-50%);
        background: #232b2e; border: 2px solid #f3b958; border-radius: 7px;
        color: #f3b958; font-weight: 900; font-size: 15px;
        padding: 1px 9px; box-shadow: 0 3px 0 rgba(0,0,0,0.4);
      }

      /* Title Screen */
      .kc-title-screen {
        position: absolute; inset: 0;
        display: flex; flex-direction: column; justify-content: space-between; align-items: center;
        padding: 26px 24px 28px;
      }
      .kc-logo-wrap { text-align: center; animation: kc-bob 3.2s ease-in-out infinite; }
      @keyframes kc-bob { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-7px); } }
      .kc-logo-badge {
        display: inline-block; background: rgba(24,31,34,0.85);
        border: 2px solid #f3b958; border-radius: 999px;
        padding: 4px 16px; font-size: 12px; font-weight: 900; letter-spacing: 0.16em; color: #f3b958;
        margin-bottom: 6px;
      }
      .kc-logo-text {
        font-size: clamp(46px, 6.2vw, 84px); font-weight: 900; letter-spacing: 0.05em;
        line-height: 0.98;
        text-shadow: 0 6px 0 #1b2224, 0 10px 22px rgba(0,0,0,0.55);
      }
      .kc-logo-k { color: #ffffff; }
      .kc-logo-c { color: #fe5f55; margin-left: 12px; }
      .kc-title-dock {
        background: rgba(34, 42, 46, 0.94);
        border: 3px solid #181f22; border-radius: 16px;
        padding: 14px 18px;
        box-shadow: 0 8px 0 rgba(0,0,0,0.45);
        display: flex; flex-direction: column; align-items: center; gap: 10px;
        pointer-events: auto;
      }
      .kc-title-main-btns { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
      .kc-title-btn { min-width: 142px; font-size: 20px; padding: 12px 22px; }
      .kc-pack-bar {
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center;
        border-top: 2px solid rgba(255,255,255,0.08); padding-top: 8px;
      }
      .kc-pack-status { font-size: 12px; color: #b8c6c9; font-weight: 700; margin-left: 4px; }

      /* Blind Select Arena */
      .kc-blind-arena {
        position: absolute; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
      }
      .kc-blind-col {
        background: rgba(36, 44, 48, 0.95);
        border: 3px solid #1b2224; border-radius: 14px;
        padding: 12px; display: flex; flex-direction: column; gap: 10px;
        box-shadow: 0 6px 0 rgba(0,0,0,0.4);
        pointer-events: auto;
      }
      .kc-blind-col.active { border-color: #f3b958; transform: translateY(-4px); }
      .kc-blind-col.dimmed { opacity: 0.72; }
      .kc-blind-col-top { display: flex; justify-content: center; }
      .kc-blind-col-top .kc-btn { width: 100%; font-size: 18px; }
      .kc-blind-status-pill {
        width: 100%; text-align: center; padding: 8px; border-radius: 8px;
        background: #232b2e; color: #9db0b5; font-weight: 900; font-size: 15px;
      }
      .kc-blind-col-banner {
        text-align: center; font-weight: 900; font-size: 20px;
        padding: 7px; border-radius: 9px; border: 2px solid rgba(0,0,0,0.3);
        text-shadow: 0 2px 0 rgba(0,0,0,0.4);
      }
      .kc-blind-col-body {
        flex: 1; background: #1f2729; border-radius: 10px; padding: 12px;
        display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
      }
      .kc-blind-col-chip { width: 64px; height: 64px; image-rendering: pixelated; margin-bottom: 6px; }
      .kc-blind-col-desc { font-size: 13px; color: #f5ebd6; margin-top: 6px; line-height: 1.3; }
      .kc-skip-box {
        background: #1f2729; border: 2px solid #2f3b3f; border-radius: 10px;
        padding: 8px; display: flex; flex-direction: column; gap: 7px;
      }
      .kc-skip-tag-row { display: flex; align-items: center; gap: 8px; }
      .kc-tag-canvas { width: 34px; height: 34px; image-rendering: pixelated; flex-shrink: 0; }
      .kc-skip-tag-name { font-size: 13px; font-weight: 900; color: #fff; }
      .kc-skip-tag-desc { font-size: 11px; color: #b8c6c9; line-height: 1.2; }

      /* Shop Controls */
      .kc-shop-controls {
        position: absolute; display: flex; flex-direction: column; gap: 12px; align-items: stretch;
        pointer-events: auto;
      }
      .kc-shop-sign-canvas {
        width: 100%; height: auto; aspect-ratio: 113 / 57;
        image-rendering: pixelated; border-radius: 10px;
        box-shadow: 0 5px 0 rgba(0,0,0,0.45);
      }
      .kc-shop-btn { font-size: 18px; padding: 14px 10px; }

      /* Cashout Receipt */
      .kc-cashout-panel {
        position: absolute;
        background: rgba(34, 42, 46, 0.96);
        border: 3px solid #181f22; border-radius: 16px;
        padding: 18px 24px; max-width: 600px;
        box-shadow: 0 8px 0 rgba(0,0,0,0.45);
        pointer-events: auto;
      }
      .kc-cashout-header {
        font-size: 24px; font-weight: 900; text-align: center; color: #4bc292;
        margin-bottom: 12px; text-shadow: 0 2px 0 #1b2224;
      }
      .kc-cashout-rows {
        background: #1f2729; border-radius: 10px; padding: 10px 14px;
        display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px;
      }
      .kc-cash-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 16px; font-weight: 800; }
      .kc-cash-detail { font-size: 12px; color: #9db0b5; margin-left: 8px; }
      .kc-cashout-btn { width: 100%; font-size: 22px; padding: 14px; }

      /* Pack Open Banner */
      .kc-pack-banner {
        position: absolute; display: flex; align-items: center; justify-content: space-between;
        background: rgba(30, 36, 52, 0.92); border: 2px solid #646eb7; border-radius: 10px;
        padding: 6px 14px; pointer-events: auto;
      }
      .kc-pack-title { font-size: 18px; font-weight: 900; margin-right: 12px; }
      .kc-pack-sub { font-size: 13px; color: #f3b958; font-weight: 800; }

      /* Floating Popups */
      .kc-popup-pill {
        position: absolute; padding: 4px 11px; border-radius: 8px;
        border: 2px solid #1b2224; font-weight: 900; font-size: 18px;
        white-space: nowrap; box-shadow: 0 4px 0 rgba(0,0,0,0.45);
        text-shadow: 0 2px 0 rgba(0,0,0,0.45);
      }

      /* Modals */
      .kc-modal-backdrop, .kc-end-overlay {
        position: absolute; inset: 0; background: rgba(12, 16, 18, 0.72);
        display: flex; align-items: center; justify-content: center; padding: 20px;
        pointer-events: auto;
      }
      .kc-modal-card {
        background: #2f3a3d; border: 3px solid #161c1e; border-radius: 16px;
        padding: 16px 20px; max-height: 90vh; display: flex; flex-direction: column; gap: 12px;
        box-shadow: 0 10px 0 rgba(0,0,0,0.5);
      }
      .kc-modal-card.wide { width: min(940px, 94vw); }
      .kc-modal-card.narrow { width: min(360px, 90vw); }
      .kc-modal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .kc-modal-head h2 { font-size: 20px; font-weight: 900; }
      .kc-modal-scroll { overflow-y: auto; max-height: 68vh; padding-right: 4px; }

      .kc-tab-row { display: flex; gap: 6px; }
      .kc-tab-row.wrap { flex-wrap: wrap; }
      .kc-tab {
        background: #232b2e; color: #c9d6d9; border: 2px solid #181f22; border-radius: 8px;
        padding: 6px 12px; font-weight: 800; font-size: 13px; cursor: pointer;
      }
      .kc-tab.active { background: #fe5f55; color: #fff; }

      .kc-newrun-grid { display: grid; grid-template-columns: 1.25fr 1fr; gap: 16px; }
      .kc-section-hdr { font-size: 13px; font-weight: 900; text-transform: uppercase; color: #f3b958; margin-bottom: 6px; }
      .kc-deck-list { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; max-height: 310px; overflow-y: auto; }
      .kc-deck-chip {
        background: #222a2d; border: 2px solid #181f22; border-radius: 9px;
        color: #fff; padding: 6px; display: flex; flex-direction: column; align-items: center; gap: 3px;
        font-size: 11px; font-weight: 800; cursor: pointer;
      }
      .kc-deck-chip.active { border-color: #f3b958; background: #36454a; }
      .kc-mini-sprite { image-rendering: pixelated; flex-shrink: 0; }
      .kc-desc-banner {
        margin-top: 8px; background: #1e2629; border-radius: 8px; padding: 8px 10px;
        font-size: 13px; color: #e2ecee; line-height: 1.3;
      }
      .kc-stake-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
      .kc-stake-btn {
        background: #222a2d; border: 2px solid #181f22; border-radius: 9px;
        color: #fff; padding: 6px; display: flex; align-items: center; justify-content: center; gap: 5px;
        font-weight: 900; cursor: pointer;
      }
      .kc-stake-btn.active { border-color: var(--st-col, #fff); background: #37464a; }
      .kc-seed-row { display: flex; align-items: center; gap: 10px; margin: 12px 0; }
      .kc-check-label { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 800; cursor: pointer; }
      .kc-input {
        flex: 1; background: #1b2224; color: #fff; border: 2px solid #4f6367; border-radius: 8px;
        padding: 6px 10px; font-family: var(--krunked-font); font-weight: 800;
      }
      .kc-start-btn { width: 100%; font-size: 20px; padding: 13px; }
      .kc-challenge-list { display: flex; flex-direction: column; gap: 8px; max-height: 380px; overflow-y: auto; }
      .kc-challenge-row {
        display: flex; justify-content: space-between; align-items: center; gap: 12px;
        background: #222a2d; border-radius: 10px; padding: 10px 12px;
      }
      .kc-challenge-name { font-weight: 900; font-size: 15px; }

      /* Run Info Tables */
      .kc-hands-table { display: flex; flex-direction: column; gap: 5px; }
      .kc-hand-row {
        display: grid; grid-template-columns: 58px 1fr auto 52px; align-items: center; gap: 10px;
        background: #222a2d; border-radius: 8px; padding: 7px 12px; font-size: 15px; font-weight: 800;
      }
      .kc-hr-played { text-align: right; color: #9db0b5; }
      .kc-info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
      .kc-info-card { background: #222a2d; border-radius: 10px; padding: 10px 12px; }
      .kc-info-title { font-weight: 900; font-size: 15px; margin-bottom: 4px; }
      .kc-suit-pills { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 10px; font-size: 14px; }
      .kc-deck-cards-grid { display: flex; flex-wrap: wrap; gap: 5px; }
      .kc-deck-mini-card {
        background: #1f2729; border: 1px solid #4f6367; border-radius: 6px;
        padding: 4px 7px; font-weight: 900; font-size: 13px;
      }
      .kc-deck-mini-card.used { opacity: 0.38; }

      /* Collection Grid */
      .kc-coll-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; }
      .kc-coll-item {
        display: flex; align-items: center; gap: 10px;
        background: #222a2d; border: 2px solid #1b2224; border-radius: 10px; padding: 8px;
      }
      .kc-coll-item.seen { border-color: #4f6367; }
      .kc-coll-name { font-weight: 900; font-size: 14px; }
      .kc-seen-dot { color: #f3b958; }
      .kc-coll-desc { font-size: 11px; color: #c4d1d4; line-height: 1.25; }

      /* Options Grid */
      .kc-options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
      .kc-opt-section { background: #222a2d; border-radius: 12px; padding: 12px 14px; }
      .kc-opt-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 5px 0; font-size: 14px; font-weight: 800; }
      .kc-pill-group { display: flex; gap: 5px; }
      .kc-pill-btn {
        background: #374244; color: #fff; border: 2px solid #181f22; border-radius: 7px;
        padding: 4px 10px; font-weight: 800; font-size: 13px; cursor: pointer;
      }
      .kc-pill-btn.active { background: #009dff; border-color: #fff; }
      .kc-slider { width: 135px; accent-color: #fe5f55; cursor: pointer; }
      .kc-pack-actions { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
      .kc-pause-stack { display: flex; flex-direction: column; gap: 10px; }

      /* Victory / Game Over */
      .kc-end-card { width: min(440px, 92vw); text-align: center; }
      .kc-end-title { font-size: 40px; font-weight: 900; text-shadow: 0 4px 0 #1b2224; }
      .kc-end-title.win { color: #f3b958; }
      .kc-end-title.lose { color: #fe5f55; }
      .kc-end-stats { background: #1f2729; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
      .kc-end-stats > div { display: flex; justify-content: space-between; font-size: 15px; }
      .kc-end-btns { display: flex; gap: 10px; justify-content: center; }

      /* Hover Tooltip */
      .kc-tooltip {
        position: fixed; z-index: 80; pointer-events: none;
        width: 240px; background: rgba(28, 35, 39, 0.97);
        border: 3px solid #6b7f85; border-radius: 12px;
        padding: 10px 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.6);
      }
      .kc-tt-title { font-size: 16px; font-weight: 900; color: #fff; margin-bottom: 4px; text-align: center; }
      .kc-tt-desc {
        background: #faf6ee; color: #22292d; border-radius: 7px;
        padding: 6px 8px; font-size: 12px; font-weight: 700; line-height: 1.3; text-align: center;
      }
      .kc-tt-badges { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; margin-top: 7px; }
      .kc-tt-badge {
        font-size: 11px; font-weight: 900; color: #fff;
        padding: 2px 7px; border-radius: 6px; text-shadow: 0 1px 0 rgba(0,0,0,0.4);
      }

      /* Toast */
      .kc-toast {
        position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
        z-index: 95; background: #232b2e; border: 2px solid #f3b958; border-radius: 10px;
        padding: 7px 16px; font-size: 14px; font-weight: 800; color: #fff;
        box-shadow: 0 6px 18px rgba(0,0,0,0.5);
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
      badges.push({ label: def?.name ?? ed.replace('e_', ''), color: PALETTE.PURPLE });
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
        desc: o.enhancement && o.enhancement !== 'none' ? (ENHANCEMENT_DEFS[o.enhancement]?.desc ?? o.enhancement) : 'Add to your deck',
        badges,
      };
    }
    const cd = CONSUMABLE_MAP[o.key];
    badges.push({ label: cd?.set ?? o.kind, color: PALETTE.PURPLE });
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
      return { title: d?.name ?? pc.key, desc: d?.descTemplate ?? '', badges };
    }
    if (pc.kind === 'playing_card') {
      return {
        title: `${pc.rank ?? 'Ace'} of ${pc.suit ?? 'Hearts'}`,
        desc: pc.enhancement && pc.enhancement !== 'none' ? (ENHANCEMENT_DEFS[pc.enhancement]?.desc ?? '') : 'Add this card to your deck',
        badges,
      };
    }
    const cd = CONSUMABLE_MAP[pc.key];
    return { title: cd?.name ?? pc.key, desc: cd?.desc ?? '', badges };
  }

  return null;
}
