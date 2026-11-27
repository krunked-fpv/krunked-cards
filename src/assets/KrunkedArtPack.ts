// ============================================================================
// Krunked Cards — Clean-Room Built-In Pixel-Art Atlas Pack
// Delegates browser atlas generation to modular high-craft pixel-art engines:
//   - ./art/worldAtlases.ts (14 world, card, tarot, planet, spectral, voucher,
//     booster, blind chip, tag, sticker, chip, shop sign, UI & icon atlases)
//   - ./art/jokerAtlas.ts (full 150-Joker + Row 9 floating soulPos atlas)
// Remains 100% Node.js-safe at module top-level for verify-assets.ts & Vitest.
// ============================================================================

import {
  ATLAS_KEYS,
  ATLAS_SPECS,
  SOUND_KEYS,
  type AtlasKey,
  type PackManifest,
  type SoundKey,
} from '../contracts/index.ts';
import { buildHighCraftJokersAtlas } from './art/jokerAtlas.ts';
import { buildAllWorldAtlases } from './art/worldAtlases.ts';

// ---------------------------------------------------------------------------
// Node.js-safe Manifest Exports (ZERO DOM references at module top-level)
// ---------------------------------------------------------------------------

export function getBuiltinManifest(): PackManifest {
  const textures = {} as PackManifest['textures'];
  for (const key of ATLAS_KEYS) {
    const spec = ATLAS_SPECS[key];
    const width1x = spec.cols * spec.cellW;
    const height1x = spec.rows * spec.cellH;
    textures[key] = {
      url1x: `builtin://textures/1x/${key}`,
      url2x: `builtin://textures/2x/${key}`,
      width1x,
      height1x,
      cellW: spec.cellW,
      cellH: spec.cellH,
    };
  }

  const sounds = {} as Record<SoundKey, string>;
  for (const key of SOUND_KEYS) {
    sounds[key] = `builtin://sounds/${key}`;
  }

  return {
    version: 1,
    source: 'builtin',
    generatedAt: '2026-01-01T00:00:00.000Z',
    textures,
    sounds,
    shaders: [
      'builtin://shaders/background.fs',
      'builtin://shaders/booster.fs',
      'builtin://shaders/CRT.fs',
      'builtin://shaders/debuff.fs',
      'builtin://shaders/dissolve.fs',
      'builtin://shaders/flame.fs',
      'builtin://shaders/flash.fs',
      'builtin://shaders/foil.fs',
      'builtin://shaders/gold_seal.fs',
      'builtin://shaders/holo.fs',
      'builtin://shaders/hologram.fs',
      'builtin://shaders/negative.fs',
      'builtin://shaders/negative_shine.fs',
      'builtin://shaders/played.fs',
      'builtin://shaders/polychrome.fs',
      'builtin://shaders/skew.fs',
      'builtin://shaders/splash.fs',
      'builtin://shaders/vortex.fs',
      'builtin://shaders/voucher.fs',
    ],
  };
}

export const BUILTIN_MANIFEST: PackManifest = getBuiltinManifest();

export function hasAtlas(key: AtlasKey): boolean {
  return key in BUILTIN_MANIFEST.textures;
}

export function hasSound(key: SoundKey): boolean {
  return key in BUILTIN_MANIFEST.sounds;
}

// ---------------------------------------------------------------------------
// Public Browser Generator (cached per session)
// ---------------------------------------------------------------------------

let cachedAtlases: Record<AtlasKey, HTMLCanvasElement> | null = null;

export function generateBuiltinAtlases(): Record<AtlasKey, HTMLCanvasElement> {
  if (cachedAtlases) return cachedAtlases;
  if (typeof document === 'undefined') {
    throw new Error('generateBuiltinAtlases() can only run in a browser environment.');
  }

  const world = buildAllWorldAtlases();
  const joker = buildHighCraftJokersAtlas();

  cachedAtlases = {
    ...world,
    Joker: joker,
  };

  return cachedAtlases;
}

export default BUILTIN_MANIFEST;
