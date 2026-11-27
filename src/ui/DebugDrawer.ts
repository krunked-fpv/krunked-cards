// ============================================================================
// Krunked Cards — F9 Playtest Debug Drawer
// Displays live FPS, targetFps, simHz, drawCalls, FNV-1a state hash, active
// shaders, pack mode, and exposes instant playtest controls via DebugBridge.
// ============================================================================

import {
  EDITIONS,
  type DebugBridge,
  type EditionId,
} from '../contracts/index.ts';
import {
  BLINDS,
  JOKERS,
  PLANETS,
  SPECTRALS,
  TAGS,
  TAROTS,
  VOUCHERS,
} from '../data/index.ts';

export class DebugDrawer {
  private container: HTMLDivElement;
  private bridge: DebugBridge;
  private open = false;
  private telemetryEl: HTMLDivElement | null = null;
  private lastRefresh = 0;

  constructor(parent: HTMLElement, bridge: DebugBridge) {
    this.bridge = bridge;
    this.container = document.createElement('div');
    this.container.id = 'krunked-debug-drawer';
    this.container.className = 'kc-debug-drawer hidden interactive';
    this.injectStyles();
    this.buildDom();
    parent.appendChild(this.container);
  }

  isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    this.open = !this.open;
    this.container.classList.toggle('hidden', !this.open);
    if (this.open) {
      this.buildDom();
      this.refreshTelemetry();
    }
  }

  update(nowMs: number): void {
    if (!this.open) return;
    if (nowMs - this.lastRefresh >= 180) {
      this.lastRefresh = nowMs;
      this.refreshTelemetry();
    }
  }

  private refreshTelemetry(): void {
    if (!this.telemetryEl) return;
    const perf = this.bridge.getPerf();
    const state = this.bridge.getState();
    const hash = this.bridge.getStateHash();
    this.telemetryEl.innerHTML = `
      <div><span>FPS / Target</span><b>${perf.fps} / ${perf.targetFps}</b></div>
      <div><span>Sim / DrawCalls</span><b>${perf.simHz} Hz / ${perf.drawCalls}</b></div>
      <div><span>Phase / Ante</span><b>${state.phase} • A${state.ante} R${state.round}</b></div>
      <div><span>State Hash</span><code>${hash}</code></div>
      <div><span>Pack / Audio</span><b>${perf.artPackMode} / ${perf.audioMode}</b></div>
      <div class="full"><span>Shaders</span><code>${perf.activeShaders.join(', ') || 'none'}</code></div>
    `;
  }

  private buildDom(): void {
    const bossBlinds = BLINDS.filter((b) => b.slot === 'Boss');
    const allConsumables = [...TAROTS, ...PLANETS, ...SPECTRALS];

    this.container.innerHTML = `
      <div class="kcd-head">
        <span>PLAYTEST DEBUG (F9)</span>
        <button class="kcd-close" data-dbg="close">✕</button>
      </div>
      <div class="kcd-telemetry" id="kcd-telemetry"></div>

      <div class="kcd-section">
        <div class="kcd-lbl">Warp Ante & Boss</div>
        <div class="kcd-row">
          <select id="kcd-ante">
            ${[1, 2, 3, 4, 5, 6, 7, 8].map((a) => `<option value="${a}">Ante ${a}</option>`).join('')}
          </select>
          <select id="kcd-boss">
            <option value="">(Random Boss)</option>
            ${bossBlinds.map((b) => `<option value="${b.key}">${b.name}</option>`).join('')}
          </select>
          <button data-dbg="warp">Warp</button>
        </div>
      </div>

      <div class="kcd-section">
        <div class="kcd-lbl">Grant Joker + Edition</div>
        <div class="kcd-row">
          <select id="kcd-joker">
            ${(JOKERS.length > 0 ? JOKERS : [{ key: 'j_joker', name: 'Joker' }])
              .map((j) => `<option value="${j.key}">${j.name}</option>`)
              .join('')}
          </select>
          <select id="kcd-edition">
            ${EDITIONS.map((e) => `<option value="${e}">${e === 'none' ? 'Base' : e.replace('e_', '')}</option>`).join('')}
          </select>
          <button data-dbg="grant-joker">Add</button>
        </div>
      </div>

      <div class="kcd-section">
        <div class="kcd-lbl">Grant Consumable / Voucher / Tag</div>
        <div class="kcd-row">
          <select id="kcd-cons">
            ${(allConsumables.length > 0 ? allConsumables : [{ key: 'c_fool', name: 'The Fool' }])
              .map((c) => `<option value="${c.key}">${c.name}</option>`)
              .join('')}
          </select>
          <button data-dbg="grant-cons">Add</button>
        </div>
        <div class="kcd-row">
          <select id="kcd-voucher">
            ${(VOUCHERS.length > 0 ? VOUCHERS : [{ key: 'v_overstock_norm', name: 'Overstock' }])
              .map((v) => `<option value="${v.key}">${v.name}</option>`)
              .join('')}
          </select>
          <button data-dbg="grant-voucher">Add</button>
        </div>
        <div class="kcd-row">
          <select id="kcd-tag">
            ${(TAGS.length > 0 ? TAGS : [{ key: 'tag_foil', name: 'Foil Tag' }])
              .map((t) => `<option value="${t.key}">${t.name}</option>`)
              .join('')}
          </select>
          <button data-dbg="grant-tag">Add</button>
        </div>
      </div>

      <div class="kcd-quick-grid">
        <button data-dbg="money">+$100</button>
        <button data-dbg="win-blind">Win Blind</button>
        <button data-dbg="toggle-pack">Toggle Art Pack</button>
        <button class="danger" data-dbg="reset-save">Reset Save</button>
      </div>
    `;

    this.telemetryEl = this.container.querySelector('#kcd-telemetry');

    const getVal = (id: string) =>
      (this.container.querySelector(`#${id}`) as HTMLSelectElement | null)?.value ?? '';

    this.container.querySelector('[data-dbg="close"]')?.addEventListener('click', () => this.toggle());
    this.container.querySelector('[data-dbg="warp"]')?.addEventListener('click', () => {
      const ante = Number(getVal('kcd-ante')) || 1;
      const boss = getVal('kcd-boss') || undefined;
      this.bridge.warpAnte(ante, boss);
      this.refreshTelemetry();
    });
    this.container.querySelector('[data-dbg="grant-joker"]')?.addEventListener('click', () => {
      this.bridge.grantJoker(getVal('kcd-joker'), getVal('kcd-edition') as EditionId);
      this.refreshTelemetry();
    });
    this.container.querySelector('[data-dbg="grant-cons"]')?.addEventListener('click', () => {
      this.bridge.grantConsumable(getVal('kcd-cons'));
      this.refreshTelemetry();
    });
    this.container.querySelector('[data-dbg="grant-voucher"]')?.addEventListener('click', () => {
      this.bridge.grantVoucher(getVal('kcd-voucher'));
      this.refreshTelemetry();
    });
    this.container.querySelector('[data-dbg="grant-tag"]')?.addEventListener('click', () => {
      this.bridge.grantTag(getVal('kcd-tag'));
      this.refreshTelemetry();
    });
    this.container.querySelector('[data-dbg="money"]')?.addEventListener('click', () => {
      const cur = this.bridge.getState().dollars;
      this.bridge.setDollars(cur + 100);
      this.refreshTelemetry();
    });
    this.container.querySelector('[data-dbg="win-blind"]')?.addEventListener('click', () => {
      this.bridge.winCurrentBlind();
      this.refreshTelemetry();
    });
    this.container.querySelector('[data-dbg="toggle-pack"]')?.addEventListener('click', () => {
      const cur = this.bridge.getPerf().artPackMode;
      void this.bridge.setArtPackMode(cur === 'builtin' ? 'custom' : 'builtin').then(() => {
        this.refreshTelemetry();
      });
    });
    this.container.querySelector('[data-dbg="reset-save"]')?.addEventListener('click', () => {
      this.bridge.resetSave();
      this.refreshTelemetry();
    });
  }

  private injectStyles(): void {
    if (document.getElementById('krunked-debug-styles')) return;
    const style = document.createElement('style');
    style.id = 'krunked-debug-styles';
    style.textContent = `
      .kc-debug-drawer {
        position: fixed;
        right: max(8px, env(safe-area-inset-right, 0px));
        top: max(8px, env(safe-area-inset-top, 0px));
        z-index: 120;
        width: 340px;
        max-width: calc(100vw - 16px);
        max-height: calc(100dvh - 24px);
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
        background: rgba(18, 24, 28, 0.96);
        border: 2px solid #009dff; border-radius: 12px;
        padding: 10px 12px; color: #e8f1f5;
        font-family: 'Consolas', 'Courier New', monospace; font-size: 12px;
        box-shadow: 0 10px 28px rgba(0,0,0,0.65);
      }
      .kcd-head {
        display: flex; justify-content: space-between; align-items: center;
        font-weight: 900; color: #009dff; margin-bottom: 8px;
      }
      .kcd-close {
        background: #fe5f55; color: #fff; border: none; border-radius: 5px;
        padding: 2px 7px; cursor: pointer; font-weight: 900;
      }
      .kcd-telemetry {
        display: grid; grid-template-columns: 1fr; gap: 3px;
        background: #101619; border-radius: 7px; padding: 7px 8px; margin-bottom: 8px;
      }
      .kcd-telemetry > div { display: flex; justify-content: space-between; gap: 6px; }
      .kcd-telemetry span { color: #8fa3ad; }
      .kcd-telemetry code { color: #4bc292; font-size: 11px; text-align: right; word-break: break-word; }
      .kcd-section { margin-bottom: 8px; }
      .kcd-lbl { font-size: 11px; color: #f3b958; font-weight: 800; margin-bottom: 4px; }
      .kcd-row { display: flex; gap: 4px; margin-bottom: 4px; }
      .kcd-row select {
        flex: 1; min-width: 0; background: #1e282e; color: #fff;
        border: 1px solid #4f6367; border-radius: 5px; padding: 4px; font-size: 11px;
      }
      .kcd-row button, .kcd-quick-grid button {
        background: #009dff; color: #fff; border: none; border-radius: 5px;
        padding: 5px 8px; font-weight: 800; font-size: 11px; cursor: pointer;
      }
      .kcd-quick-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-top: 8px; }
      .kcd-quick-grid button.danger { background: #fe5f55; }
    `;
    document.head.appendChild(style);
  }
}
