// ============================================================================
// Krunked Cards — Input Manager (Mouse, Touch-First Gestures, Drag-to-Reorder,
// Rebindable Keyboard, and Gamepad API polling)
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
  // Optional mobile-first gesture, drag feedback & scoring choreography hooks
  onLongPressCard?(card: VisualCard, x: number, y: number): void;
  onEmptyTap?(): void;
  onSwipeDeselect?(): void;
  onDragSlotChange?(kind: 'hand' | 'joker', newIndex: number): void;
  onTapDuringScoring?(): void;
  onScoringFastForward?(active: boolean): void;
}

const TOUCH_DRAG_THRESHOLD_PX = 13;
const MOUSE_DRAG_THRESHOLD_PX = 7;
const TOUCH_HIT_PAD_PX = 10;
const LONG_PRESS_MS = 320;
const SWIPE_DESELECT_DY_PX = 48;

function triggerHaptic(ms: number): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  } catch {
    // Ignore restricted/unsupported vibration API environments
  }
}

export class InputManager {
  private canvas: HTMLCanvasElement;
  private scene: CardSceneManager;
  private cb: InputCallbacks;

  mouseX = 0;
  mouseY = 0;

  private pointerDown = false;
  private activePointerId: number | null = null;
  private activePointerType = 'mouse';
  private hasPointerCapture = false;
  private downX = 0;
  private downY = 0;
  private downCard: VisualCard | null = null;
  private didDrag = false;
  private didSwipeDeselect = false;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressTriggered = false;
  private downDuringScoring = false;
  private scoringFastForwardActive = false;
  private lastDragPreviewIndex: number | null = null;
  private lastHoverId: string | null = null;

  // Gamepad edge detection
  private prevGamepadButtons: boolean[] = [];
  private gamepadFocusIdx = 0;
  private gamepadCooldown = 0;

  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundPointerCancel: (e: PointerEvent) => void;
  private boundContextMenu: (e: MouseEvent) => void;
  private boundKeyDown: (e: KeyboardEvent) => void;

  constructor(canvas: HTMLCanvasElement, scene: CardSceneManager, cb: InputCallbacks) {
    this.canvas = canvas;
    this.scene = scene;
    this.cb = cb;

    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
    this.boundPointerCancel = this.handlePointerCancel.bind(this);
    this.boundContextMenu = this.handleContextMenu.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);

    window.addEventListener('pointermove', this.boundPointerMove);
    this.canvas.addEventListener('pointerdown', this.boundPointerDown);
    window.addEventListener('pointerup', this.boundPointerUp);
    window.addEventListener('pointercancel', this.boundPointerCancel);
    this.canvas.addEventListener('contextmenu', this.boundContextMenu);
    window.addEventListener('keydown', this.boundKeyDown);
  }

  private getLocalCoords(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private clearLongPressTimer(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private releaseCaptureSafe(pointerId: number): void {
    if (!this.hasPointerCapture) return;
    this.hasPointerCapture = false;
    try {
      if (typeof this.canvas.releasePointerCapture === 'function') {
        this.canvas.releasePointerCapture(pointerId);
      }
    } catch {
      // Capture may already have been released by browser
    }
  }

  private capturePointerSafe(pointerId: number): void {
    if (this.hasPointerCapture) return;
    try {
      if (typeof this.canvas.setPointerCapture === 'function') {
        this.canvas.setPointerCapture(pointerId);
        this.hasPointerCapture = true;
      }
    } catch {
      // Synthetic PointerEvents in tests may not support setPointerCapture
    }
  }

  private endScoringFastForward(): void {
    if (!this.scoringFastForwardActive) return;
    this.scoringFastForwardActive = false;
    this.cb.onScoringFastForward?.(false);
  }

  private triggerSwipeDeselect(): void {
    this.didSwipeDeselect = true;
    this.clearLongPressTimer();
    triggerHaptic(10);
    if (this.cb.onSwipeDeselect) {
      this.cb.onSwipeDeselect();
    } else {
      this.cb.onDispatch({ type: 'DESELECT_ALL' });
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.pointerDown && this.activePointerId !== null && e.pointerId !== this.activePointerId) {
      return;
    }
    if (!this.pointerDown && e.pointerType === 'touch') {
      return;
    }

    const { x, y } = this.getLocalCoords(e);
    this.mouseX = x;
    this.mouseY = y;

    if (this.pointerDown) {
      const dx = x - this.downX;
      const dy = y - this.downY;
      const dist = Math.hypot(dx, dy);
      const isTouch = this.activePointerType === 'touch' || e.pointerType === 'touch';
      const dragThreshold = isTouch ? TOUCH_DRAG_THRESHOLD_PX : MOUSE_DRAG_THRESHOLD_PX;

      if (dist > dragThreshold) {
        this.clearLongPressTimer();
      }

      if (this.downDuringScoring || this.didSwipeDeselect || this.longPressTriggered) {
        return;
      }

      const state = this.cb.getState();
      const canSwipeDeselect =
        !this.didDrag &&
        (state.phase === 'PLAYING' || state.phase === 'PACK_OPEN') &&
        state.selectedCardIds.length > 0 &&
        (!this.downCard || this.downCard.kind === 'hand');

      // Check vertical downward swipe (> 48px) on hand or empty table to deselect all selected cards
      if (canSwipeDeselect && dy > SWIPE_DESELECT_DY_PX && dy > Math.abs(dx) * 1.4) {
        this.triggerSwipeDeselect();
        return;
      }

      if (this.downCard) {
        // When cards are selected and gesture starts straight downward on a hand card,
        // wait briefly before starting horizontal drag so a swipe-down deselect isn't hijacked.
        const pendingDownwardSwipe =
          canSwipeDeselect &&
          this.downCard.kind === 'hand' &&
          dy > 0 &&
          dy > Math.abs(dx) * 1.65 &&
          dy <= SWIPE_DESELECT_DY_PX;

        if (!this.didDrag && !pendingDownwardSwipe && dist > dragThreshold && this.downCard.draggable) {
          this.clearLongPressTimer();
          this.didDrag = true;
          this.scene.startDrag(this.downCard.id, this.downX, this.downY);
          this.lastDragPreviewIndex = this.scene.getDragPreviewIndex();
          this.capturePointerSafe(e.pointerId);
          this.canvas.style.cursor = 'grabbing';
        }
        if (this.didDrag) {
          this.scene.updateDrag(x, y);
          const dragKind = this.scene.getDragKind();
          const previewIdx = this.scene.getDragPreviewIndex();
          if (
            (dragKind === 'hand' || dragKind === 'joker') &&
            previewIdx !== null &&
            previewIdx !== this.lastDragPreviewIndex
          ) {
            this.lastDragPreviewIndex = previewIdx;
            this.cb.onDragSlotChange?.(dragKind, previewIdx);
          }
          return;
        }
      }
      return;
    }

    const hit = this.scene.updateHover(x, y, 0);
    const hitId = hit ? hit.id : null;
    if (hitId !== this.lastHoverId || hit) {
      this.lastHoverId = hitId;
      this.cb.onHoverChange(hit, x, y);
    }
    this.canvas.style.cursor = hit ? (hit.draggable ? 'grab' : 'pointer') : 'default';
  }

  private handlePointerDown(e: PointerEvent): void {
    this.cb.onAudioUnlock();

    // Multi-touch guard: ignore non-primary pointers and secondary simultaneous touches
    if (e.isPrimary === false) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this.activePointerId !== null && this.activePointerId !== e.pointerId) return;

    const { x, y } = this.getLocalCoords(e);
    this.mouseX = x;
    this.mouseY = y;

    const isTouch = e.pointerType === 'touch';
    const hitPad = isTouch ? TOUCH_HIT_PAD_PX : 0;
    const state = this.cb.getState();

    this.activePointerId = e.pointerId;
    this.activePointerType = e.pointerType || 'mouse';
    this.pointerDown = true;
    this.downX = x;
    this.downY = y;
    this.didDrag = false;
    this.didSwipeDeselect = false;
    this.longPressTriggered = false;
    this.lastDragPreviewIndex = null;
    this.clearLongPressTimer();

    if (state.phase === 'SCORING' && !this.cb.isModalOpen()) {
      this.downCard = null;
      this.downDuringScoring = true;
      this.scoringFastForwardActive = true;
      this.cb.onScoringFastForward?.(true);
      return;
    }

    this.downDuringScoring = false;
    const hit = this.scene.updateHover(x, y, hitPad);
    this.downCard = hit;

    // Long-press card inspection on touch (320ms without exceeding drag threshold)
    if (isTouch && hit && !this.cb.isModalOpen()) {
      const pressedCard = hit;
      const pressX = x;
      const pressY = y;
      this.longPressTimer = setTimeout(() => {
        this.longPressTimer = null;
        if (!this.pointerDown || this.didDrag || this.didSwipeDeselect) return;
        this.longPressTriggered = true;
        triggerHaptic(12);
        if (this.cb.onLongPressCard) {
          this.cb.onLongPressCard(pressedCard, pressX, pressY);
        } else {
          this.lastHoverId = pressedCard.id;
          this.cb.onHoverChange(pressedCard, pressX, pressY);
        }
      }, LONG_PRESS_MS);
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (!this.pointerDown) return;
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;

    this.clearLongPressTimer();
    this.releaseCaptureSafe(e.pointerId);

    const { x, y } = this.getLocalCoords(e);
    this.mouseX = x;
    this.mouseY = y;

    const wasDuringScoring = this.downDuringScoring;
    const wasDidDrag = this.didDrag;
    const wasLongPress = this.longPressTriggered;
    const wasSwipeDeselect = this.didSwipeDeselect;
    const clicked = this.downCard;
    const dist = Math.hypot(x - this.downX, y - this.downY);

    this.pointerDown = false;
    this.activePointerId = null;
    this.downCard = null;
    this.didDrag = false;
    this.didSwipeDeselect = false;
    this.longPressTriggered = false;
    this.downDuringScoring = false;
    this.lastDragPreviewIndex = null;
    this.endScoringFastForward();

    if (wasDuringScoring) {
      if (dist <= 18) {
        this.cb.onTapDuringScoring?.();
      }
      return;
    }

    if (wasDidDrag) {
      const reorder = this.scene.endDrag();
      this.canvas.style.cursor = 'default';
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

    if (wasLongPress || wasSwipeDeselect) {
      return;
    }

    if (clicked) {
      this.cb.onCardClick(clicked);
    } else {
      if (this.lastHoverId !== null) {
        this.lastHoverId = null;
        this.cb.onHoverChange(null, x, y);
      }
      this.cb.onEmptyTap?.();
    }
  }

  private handlePointerCancel(e: PointerEvent): void {
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;

    this.clearLongPressTimer();
    this.releaseCaptureSafe(e.pointerId);
    this.endScoringFastForward();

    if (this.didDrag) {
      this.scene.cancelDrag();
      this.canvas.style.cursor = 'default';
    }

    this.pointerDown = false;
    this.activePointerId = null;
    this.downCard = null;
    this.didDrag = false;
    this.didSwipeDeselect = false;
    this.longPressTriggered = false;
    this.downDuringScoring = false;
    this.lastDragPreviewIndex = null;
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
    this.clearLongPressTimer();
    this.endScoringFastForward();
    window.removeEventListener('pointermove', this.boundPointerMove);
    this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
    window.removeEventListener('pointerup', this.boundPointerUp);
    window.removeEventListener('pointercancel', this.boundPointerCancel);
    this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
    window.removeEventListener('keydown', this.boundKeyDown);
  }
}
