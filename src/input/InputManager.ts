// ============================================================================
// Krunked Cards — Input Manager (Mouse, Drag-to-Reorder, Rebindable Keyboard,
// and Gamepad API polling)
// ============================================================================

import type { KeybindConfig, SimAction, SimState } from '../contracts/index.ts';
import type { CardSceneManager, VisualCard } from '../render/Moveable.ts';

export interface InputCallbacks {
  getState(): SimState;
  getKeybinds(): KeybindConfig;
  isModalOpen(): boolean;
  isRebindingKey(): boolean;
  onCaptureRebindKey(code: string): void;
  onDispatch(action: SimAction): void;
  onToggleRunInfo(): void;
  onTogglePause(): void;
  onToggleDebugDrawer(): void;
  onCardClick(card: VisualCard): void;
  onHoverChange(card: VisualCard | null, x: number, y: number): void;
  onAudioUnlock(): void;
}

export class InputManager {
  private canvas: HTMLCanvasElement;
  private scene: CardSceneManager;
  private cb: InputCallbacks;

  mouseX = 0;
  mouseY = 0;

  private pointerDown = false;
  private downX = 0;
  private downY = 0;
  private downCard: VisualCard | null = null;
  private didDrag = false;
  private lastHoverId: string | null = null;

  // Gamepad edge detection
  private prevGamepadButtons: boolean[] = [];
  private gamepadFocusIdx = 0;
  private gamepadCooldown = 0;

  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundContextMenu: (e: MouseEvent) => void;
  private boundKeyDown: (e: KeyboardEvent) => void;

  constructor(canvas: HTMLCanvasElement, scene: CardSceneManager, cb: InputCallbacks) {
    this.canvas = canvas;
    this.scene = scene;
    this.cb = cb;

    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
    this.boundContextMenu = this.handleContextMenu.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);

    window.addEventListener('pointermove', this.boundPointerMove);
    this.canvas.addEventListener('pointerdown', this.boundPointerDown);
    window.addEventListener('pointerup', this.boundPointerUp);
    this.canvas.addEventListener('contextmenu', this.boundContextMenu);
    window.addEventListener('keydown', this.boundKeyDown);
  }

  private getLocalCoords(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private handlePointerMove(e: PointerEvent): void {
    const { x, y } = this.getLocalCoords(e);
    this.mouseX = x;
    this.mouseY = y;

    if (this.pointerDown && this.downCard) {
      const dist = Math.hypot(x - this.downX, y - this.downY);
      if (!this.didDrag && dist > 7 && this.downCard.draggable) {
        this.didDrag = true;
        this.scene.startDrag(this.downCard.id, x, y);
      }
      if (this.didDrag) {
        this.scene.updateDrag(x, y);
        return;
      }
    }

    const hit = this.scene.updateHover(x, y);
    const hitId = hit ? hit.id : null;
    if (hitId !== this.lastHoverId || hit) {
      this.lastHoverId = hitId;
      this.cb.onHoverChange(hit, x, y);
    }
    this.canvas.style.cursor = hit ? (hit.draggable ? 'grab' : 'pointer') : 'default';
  }

  private handlePointerDown(e: PointerEvent): void {
    this.cb.onAudioUnlock();
    if (e.button !== 0) return;

    const { x, y } = this.getLocalCoords(e);
    this.mouseX = x;
    this.mouseY = y;
    const hit = this.scene.updateHover(x, y);

    this.pointerDown = true;
    this.downX = x;
    this.downY = y;
    this.downCard = hit;
    this.didDrag = false;
  }

  private handlePointerUp(e: PointerEvent): void {
    if (!this.pointerDown) return;
    this.pointerDown = false;
    const { x, y } = this.getLocalCoords(e);
    this.mouseX = x;
    this.mouseY = y;

    if (this.didDrag) {
      const reorder = this.scene.endDrag();
      this.didDrag = false;
      this.downCard = null;
      if (reorder) {
        if (reorder.kind === 'hand') {
          this.cb.onDispatch({
            type: 'REORDER_HAND',
            fromIndex: reorder.fromIndex,
            toIndex: reorder.toIndex,
          });
        } else if (reorder.kind === 'joker') {
          this.cb.onDispatch({
            type: 'REORDER_JOKERS',
            fromIndex: reorder.fromIndex,
            toIndex: reorder.toIndex,
          });
        }
      }
      return;
    }

    const clicked = this.downCard;
    this.downCard = null;
    if (clicked) {
      this.cb.onCardClick(clicked);
    }
  }

  private handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const state = this.cb.getState();
    if (
      (state.phase === 'PLAYING' || state.phase === 'PACK_OPEN') &&
      state.selectedCardIds.length > 0
    ) {
      this.cb.onDispatch({ type: 'DESELECT_ALL' });
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    this.cb.onAudioUnlock();

    if (this.cb.isRebindingKey()) {
      e.preventDefault();
      e.stopPropagation();
      this.cb.onCaptureRebindKey(e.code);
      return;
    }

    // Ignore typing inside text inputs / selects
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (e.code !== 'Escape') return;
    }

    const kb = this.cb.getKeybinds();
    const state = this.cb.getState();

    if (e.code === kb.debugDrawer) {
      e.preventDefault();
      this.cb.onToggleDebugDrawer();
      return;
    }

    if (e.code === kb.pause) {
      e.preventDefault();
      this.cb.onTogglePause();
      return;
    }

    if (e.code === kb.runInfo && state.phase !== 'TITLE') {
      e.preventDefault();
      this.cb.onToggleRunInfo();
      return;
    }

    if (this.cb.isModalOpen()) return;

    if (state.phase === 'PLAYING') {
      if (e.code === kb.playHand) {
        e.preventDefault();
        if (state.selectedCardIds.length > 0 && state.handsLeft > 0) {
          this.cb.onDispatch({ type: 'PLAY_HAND' });
        }
      } else if (e.code === kb.discardHand) {
        e.preventDefault();
        if (state.selectedCardIds.length > 0 && state.discardsLeft > 0) {
          this.cb.onDispatch({ type: 'DISCARD_HAND' });
        }
      } else if (e.code === kb.sortRank) {
        e.preventDefault();
        this.cb.onDispatch({ type: 'SORT_HAND', mode: 'rank' });
      } else if (e.code === kb.sortSuit) {
        e.preventDefault();
        this.cb.onDispatch({ type: 'SORT_HAND', mode: 'suit' });
      }
    }
  }

  /**
   * Poll standard Web Gamepad API once per frame for controller support.
   */
  pollGamepad(dt: number): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    const pad = pads ? Array.from(pads).find((p) => p && p.connected) : null;
    if (!pad) return;

    this.gamepadCooldown = Math.max(0, this.gamepadCooldown - dt);
    const pressed = (idx: number): boolean => Boolean(pad.buttons[idx]?.pressed);
    const justPressed = (idx: number): boolean =>
      pressed(idx) && !this.prevGamepadButtons[idx];

    const state = this.cb.getState();

    if (justPressed(9)) {
      // Start button -> Pause
      this.cb.onTogglePause();
    } else if (justPressed(8) && state.phase !== 'TITLE') {
      // Select/Back -> Run Info
      this.cb.onToggleRunInfo();
    } else if (!this.cb.isModalOpen() && state.phase === 'PLAYING' && state.hand.length > 0) {
      const axisX = pad.axes[0] ?? 0;
      const moveLeft = justPressed(14) || (axisX < -0.55 && this.gamepadCooldown <= 0);
      const moveRight = justPressed(15) || (axisX > 0.55 && this.gamepadCooldown <= 0);

      if (moveLeft) {
        this.gamepadFocusIdx = Math.max(0, this.gamepadFocusIdx - 1);
        this.gamepadCooldown = 0.18;
      } else if (moveRight) {
        this.gamepadFocusIdx = Math.min(state.hand.length - 1, this.gamepadFocusIdx + 1);
        this.gamepadCooldown = 0.18;
      }
      this.gamepadFocusIdx = Math.max(0, Math.min(state.hand.length - 1, this.gamepadFocusIdx));

      // Move visual hover focus onto focused card
      const focusedId = state.hand[this.gamepadFocusIdx];
      if (focusedId && (moveLeft || moveRight)) {
        const vc = this.scene.getVisualCardById(focusedId);
        if (vc) {
          this.mouseX = vc.moveable.vx;
          this.mouseY = vc.moveable.vy;
          this.scene.updateHover(this.mouseX, this.mouseY);
          this.cb.onHoverChange(vc, this.mouseX, this.mouseY);
        }
      }

      if (justPressed(0) && focusedId) {
        // A -> Toggle Select card
        this.cb.onDispatch({ type: 'TOGGLE_SELECT_CARD', cardId: focusedId });
      } else if (justPressed(2) && state.selectedCardIds.length > 0 && state.handsLeft > 0) {
        // X -> Play Hand
        this.cb.onDispatch({ type: 'PLAY_HAND' });
      } else if (justPressed(3) && state.selectedCardIds.length > 0 && state.discardsLeft > 0) {
        // Y -> Discard
        this.cb.onDispatch({ type: 'DISCARD_HAND' });
      } else if (justPressed(4)) {
        // LB -> Sort Rank
        this.cb.onDispatch({ type: 'SORT_HAND', mode: 'rank' });
      } else if (justPressed(5)) {
        // RB -> Sort Suit
        this.cb.onDispatch({ type: 'SORT_HAND', mode: 'suit' });
      } else if (justPressed(1)) {
        // B -> Deselect All
        this.cb.onDispatch({ type: 'DESELECT_ALL' });
      }
    }

    this.prevGamepadButtons = pad.buttons.map((b) => b.pressed);
  }

  dispose(): void {
    window.removeEventListener('pointermove', this.boundPointerMove);
    this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
    window.removeEventListener('pointerup', this.boundPointerUp);
    this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
    window.removeEventListener('keydown', this.boundKeyDown);
  }
}
