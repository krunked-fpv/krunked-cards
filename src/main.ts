// ============================================================================
// Krunked Cards — Browser Entry Point
// ============================================================================

import { GameApp } from './app/GameApp.ts';

function bootstrap(): void {
  const canvas = document.getElementById('gl-canvas') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui-root') as HTMLElement | null;

  if (!canvas || !uiRoot) {
    throw new Error('Krunked Cards mount nodes (#gl-canvas, #ui-root) not found.');
  }

  const app = new GameApp(canvas, uiRoot);
  void app.start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
