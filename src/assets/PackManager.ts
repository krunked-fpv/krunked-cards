// ============================================================================
// Krunked Cards — Asset Pack Manager (Built-In Krunked Art Pack <-> Custom Pack)
// Supports:
//   1. Built-in procedural pixel-art pack (zero external files required)
//   2. Local dev server custom pack at /__krunked_custom_pack__/manifest.json
//   3. User-uploaded folder OR fused .exe/.zip/.love archive parsed client-side
//      via native DecompressionStream('deflate-raw') and persisted in IndexedDB.
// ============================================================================

import {
  ATLAS_KEYS,
  ATLAS_SPECS,
  SOUND_KEYS,
  type ArtPackMode,
  type AtlasKey,
  type PackManifest,
  type SoundKey,
} from '../contracts/index.ts';
import { setCustomPixelFont } from './BitmapFont.ts';
import { generateBuiltinAtlases, getBuiltinManifest } from './KrunkedArtPack.ts';

export type AtlasImageSource = HTMLCanvasElement | HTMLImageElement;

const IDB_NAME = 'krunked_cards_packs_v1';
const IDB_STORE = 'files';
const LOCAL_DEV_MANIFEST_URL = '/__krunked_custom_pack__/manifest.json';

interface StoredPackRecord {
  key: string;
  blob: Blob;
}

type PackChangeListener = (mode: ArtPackMode) => void;

export class PackManager {
  private mode: ArtPackMode = 'builtin';
  private builtinAtlases: Record<AtlasKey, HTMLCanvasElement> | null = null;
  private customAtlases: Partial<Record<AtlasKey, HTMLImageElement>> = {};
  private customManifest: PackManifest | null = null;
  private localDevManifest: PackManifest | null = null;
  private customSounds: Record<SoundKey, string> | null = null;
  private customFontUrl: string | null = null;
  private objectUrls: string[] = [];
  private listeners: Set<PackChangeListener> = new Set();
  private loading = false;
  private lastStatusMessage = 'Built-in Krunked Art Pack active';

  async init(
    preferredMode: ArtPackMode = 'builtin',
    autoDetectLocalDev = false
  ): Promise<void> {
    this.builtinAtlases = generateBuiltinAtlases();

    // Probe IndexedDB first, then local dev server custom pack
    const hasIdb = await this.probeIndexedDbPack();
    const hasLocalDev = await this.probeLocalDevPack();

    if (
      (preferredMode === 'custom' && (hasIdb || hasLocalDev)) ||
      (autoDetectLocalDev && hasLocalDev)
    ) {
      await this.setMode('custom');
    } else {
      await this.setMode('builtin');
    }
  }

  onChange(cb: PackChangeListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  getMode(): ArtPackMode {
    return this.mode;
  }

  isLoading(): boolean {
    return this.loading;
  }

  getStatusMessage(): string {
    return this.lastStatusMessage;
  }

  hasCustomPackAvailable(): boolean {
    return this.customManifest !== null || this.localDevManifest !== null;
  }

  getCustomPackSource(): 'local-dev' | 'indexeddb' | null {
    if (this.customManifest?.source === 'indexeddb') return 'indexeddb';
    if (this.localDevManifest) return 'local-dev';
    return null;
  }

  getActiveManifest(): PackManifest {
    if (this.mode === 'custom' && this.customManifest) return this.customManifest;
    return getBuiltinManifest();
  }

  getAtlas(key: AtlasKey): AtlasImageSource {
    if (this.mode === 'custom' && this.customAtlases[key]) {
      return this.customAtlases[key]!;
    }
    if (!this.builtinAtlases) {
      this.builtinAtlases = generateBuiltinAtlases();
    }
    return this.builtinAtlases[key];
  }

  getAllActiveAtlases(): Record<AtlasKey, AtlasImageSource> {
    const out = {} as Record<AtlasKey, AtlasImageSource>;
    for (const key of ATLAS_KEYS) {
      out[key] = this.getAtlas(key);
    }
    return out;
  }

  getCustomSoundUrls(): Record<SoundKey, string> | null {
    return this.mode === 'custom' ? this.customSounds : null;
  }

  async setMode(targetMode: ArtPackMode): Promise<boolean> {
    if (targetMode === 'builtin') {
      this.mode = 'builtin';
      await setCustomPixelFont(null);
      this.lastStatusMessage = 'Built-in Krunked Art Pack active';
      this.emitChange();
      return true;
    }

    // Attempt to activate Custom Pack (prefer IndexedDB upload if present, else local dev)
    if (!this.customManifest && this.localDevManifest) {
      this.customManifest = this.localDevManifest;
    }
    if (!this.customManifest) {
      // Re-probe local dev just in case
      await this.probeLocalDevPack();
      if (this.localDevManifest) {
        this.customManifest = this.localDevManifest;
      }
    }
    if (!this.customManifest) {
      this.lastStatusMessage = 'No custom pack found. Load a local custom pack first.';
      this.mode = 'builtin';
      await setCustomPixelFont(null);
      this.emitChange();
      return false;
    }

    this.loading = true;
    try {
      await this.loadCustomAtlasesFromManifest(this.customManifest);
      this.customSounds = this.customManifest.sounds;
      this.customFontUrl = this.customManifest.fontUrl ?? null;
      await setCustomPixelFont(this.customFontUrl);
      this.mode = 'custom';
      this.lastStatusMessage =
        this.customManifest.source === 'indexeddb'
          ? 'Custom Pack active (saved in browser)'
          : 'Custom Pack active (local dev pack)';
      this.emitChange();
      return true;
    } catch (err) {
      this.lastStatusMessage = `Custom pack load error: ${err instanceof Error ? err.message : String(err)}`;
      this.mode = 'builtin';
      await setCustomPixelFont(null);
      this.emitChange();
      return false;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Import a user-selected folder or fused .exe/.zip/.love archive, persist it
   * in IndexedDB (`krunked_cards_packs_v1`), and switch to Custom Pack live.
   */
  async loadFromUserFiles(files: FileList | File[]): Promise<{ ok: boolean; message: string }> {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) {
      return { ok: false, message: 'No files selected.' };
    }

    this.loading = true;
    try {
      const extracted = new Map<string, Blob>();

      if (
        fileArr.length === 1 &&
        /\.(exe|zip|love)$/i.test(fileArr[0]!.name)
      ) {
        const archiveFile = fileArr[0]!;
        const buf = await archiveFile.arrayBuffer();
        const zipEntries = await extractPackFilesFromFusedZip(buf);
        for (const [normKey, blob] of zipEntries) {
          extracted.set(normKey, blob);
        }
      } else {
        for (const f of fileArr) {
          const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
          const normKey = normalizePackAssetPath(rel);
          if (normKey) {
            extracted.set(normKey, f);
          }
        }
      }

      if (extracted.size === 0) {
        return {
          ok: false,
          message: 'No compatible atlas textures or sounds found in selection.',
        };
      }

      await saveFilesToIndexedDb(extracted);
      const manifest = this.buildManifestFromBlobs(extracted);
      this.customManifest = manifest;
      await this.setMode('custom');

      return {
        ok: true,
        message: `Loaded custom pack (${extracted.size} assets cached in IndexedDB).`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastStatusMessage = `Failed to load custom pack: ${msg}`;
      return { ok: false, message: msg };
    } finally {
      this.loading = false;
    }
  }

  async clearSavedCustomPack(): Promise<void> {
    await clearIndexedDb();
    this.revokeObjectUrls();
    this.customAtlases = {};
    this.customManifest = this.localDevManifest;
    if (this.mode === 'custom' && !this.customManifest) {
      await this.setMode('builtin');
    } else {
      this.emitChange();
    }
  }

  private emitChange(): void {
    for (const cb of this.listeners) {
      cb(this.mode);
    }
  }

  private async probeLocalDevPack(): Promise<boolean> {
    try {
      const resp = await fetch(LOCAL_DEV_MANIFEST_URL, { cache: 'no-cache' });
      if (!resp.ok) return false;
      const json = (await resp.json()) as PackManifest;
      if (!json || !json.textures || !json.sounds) return false;
      this.localDevManifest = { ...json, source: 'local-dev' };
      return true;
    } catch {
      return false;
    }
  }

  private async probeIndexedDbPack(): Promise<boolean> {
    try {
      const map = await loadFilesFromIndexedDb();
      if (map.size === 0) return false;
      this.customManifest = this.buildManifestFromBlobs(map);
      return true;
    } catch {
      return false;
    }
  }

  private revokeObjectUrls(): void {
    for (const url of this.objectUrls) {
      URL.revokeObjectURL(url);
    }
    this.objectUrls = [];
  }

  private buildManifestFromBlobs(files: Map<string, Blob>): PackManifest {
    this.revokeObjectUrls();
    const urlFor = (key: string): string | undefined => {
      const blob = files.get(key);
      if (!blob) return undefined;
      const url = URL.createObjectURL(blob);
      this.objectUrls.push(url);
      return url;
    };

    const textures = {} as PackManifest['textures'];
    for (const key of ATLAS_KEYS) {
      const spec = ATLAS_SPECS[key];
      const u2 = urlFor(spec.file2x);
      const u1 = urlFor(spec.file1x);
      const chosen = u2 ?? u1 ?? '';
      textures[key] = {
        url1x: u1 ?? chosen,
        url2x: u2 ?? chosen,
        width1x: spec.cols * spec.cellW,
        height1x: spec.rows * spec.cellH,
        cellW: spec.cellW,
        cellH: spec.cellH,
      };
    }

    const sounds = {} as Record<SoundKey, string>;
    for (const sk of SOUND_KEYS) {
      const su = urlFor(`sounds/${sk}.ogg`);
      if (su) sounds[sk] = su;
    }

    const fontUrl = urlFor('fonts/m6x11plus.ttf');

    return {
      version: 1,
      source: 'indexeddb',
      generatedAt: new Date().toISOString(),
      textures,
      fontUrl,
      sounds,
    };
  }

  private async loadCustomAtlasesFromManifest(manifest: PackManifest): Promise<void> {
    const nextAtlases: Partial<Record<AtlasKey, HTMLImageElement>> = {};
    const tasks = ATLAS_KEYS.map(async (key) => {
      const entry = manifest.textures[key];
      if (!entry) return;
      const url = entry.url2x || entry.url1x;
      if (!url) return;
      try {
        const img = await loadImage(url);
        nextAtlases[key] = img;
      } catch {
        if (entry.url1x && entry.url1x !== url) {
          try {
            nextAtlases[key] = await loadImage(entry.url1x);
          } catch {
            // Fall back to built-in for this single atlas
          }
        }
      }
    });
    await Promise.all(tasks);
    this.customAtlases = nextAtlases;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image load failed: ${url}`));
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Path Normalization & Client-Side Fused ZIP / EXE Parser (Zero Dependencies)
// ---------------------------------------------------------------------------

const WANTED_PATHS = new Set<string>([
  ...ATLAS_KEYS.flatMap((k) => [ATLAS_SPECS[k].file1x, ATLAS_SPECS[k].file2x]),
  ...SOUND_KEYS.map((s) => `sounds/${s}.ogg`),
  'fonts/m6x11plus.ttf',
]);

function normalizePackAssetPath(rawPath: string): string | null {
  const clean = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
  for (const wanted of WANTED_PATHS) {
    if (clean === wanted || clean.endsWith('/' + wanted)) {
      return wanted;
    }
  }
  return null;
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Browser does not support DecompressionStream("deflate-raw").');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const safeCopy = new Uint8Array(compressed.byteLength);
  safeCopy.set(compressed);
  await writer.write(safeCopy);
  await writer.close();
  const outBuf = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(outBuf);
}

/**
 * Parses a standard ZIP or fused SFX .exe/.love archive in browser memory
 * and extracts only the textures, sounds, and pixel font needed by PackManifest.
 */
async function extractPackFilesFromFusedZip(buffer: ArrayBuffer): Promise<Map<string, Blob>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Locate End of Central Directory signature (0x06054b50) scanning backwards
  let eocdOffset = -1;
  const searchStart = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= searchStart; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('Archive does not contain a valid ZIP directory.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffsetRecorded = view.getUint32(eocdOffset + 16, true);
  const cdStartActual = eocdOffset - cdSize;
  const baseDelta = cdStartActual - cdOffsetRecorded;

  const decoder = new TextDecoder('utf-8');
  const out = new Map<string, Blob>();
  let pos = cdStartActual;

  for (let i = 0; i < totalEntries; i++) {
    if (pos + 46 > bytes.length || view.getUint32(pos, true) !== 0x02014b50) {
      break;
    }
    const method = view.getUint16(pos + 10, true);
    const compSize = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localHeaderOffset = view.getUint32(pos + 42, true) + baseDelta;

    const entryName = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    pos += 46 + nameLen + extraLen + commentLen;

    const normKey = normalizePackAssetPath(entryName);
    if (!normKey) continue;
    if (localHeaderOffset < 0 || localHeaderOffset + 30 > bytes.length) continue;
    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) continue;

    const lhNameLen = view.getUint16(localHeaderOffset + 26, true);
    const lhExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
    const rawSlice = bytes.subarray(dataStart, dataStart + compSize);

    let fileBytes: Uint8Array;
    if (method === 0) {
      fileBytes = rawSlice.slice();
    } else if (method === 8) {
      fileBytes = await inflateRawBytes(rawSlice);
    } else {
      continue;
    }

    const mime = normKey.endsWith('.png')
      ? 'image/png'
      : normKey.endsWith('.ogg')
        ? 'audio/ogg'
        : normKey.endsWith('.ttf')
          ? 'font/ttf'
          : 'application/octet-stream';
    const blobCopy = new Uint8Array(fileBytes.byteLength);
    blobCopy.set(fileBytes);
    out.set(normKey, new Blob([blobCopy], { type: mime }));
  }

  return out;
}

// ---------------------------------------------------------------------------
// IndexedDB Storage Helpers (`krunked_cards_packs_v1`)
// ---------------------------------------------------------------------------

function openPackDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

async function saveFilesToIndexedDb(files: Map<string, Blob>): Promise<void> {
  const db = await openPackDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.clear();
    for (const [key, blob] of files) {
      store.put({ key, blob } satisfies StoredPackRecord);
    }
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('IndexedDB write failed'));
    };
  });
}

async function loadFilesFromIndexedDb(): Promise<Map<string, Blob>> {
  const db = await openPackDb();
  return new Promise<Map<string, Blob>>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const map = new Map<string, Blob>();
      const rows = (req.result as StoredPackRecord[]) ?? [];
      for (const r of rows) {
        if (r?.key && r?.blob) map.set(r.key, r.blob);
      }
      db.close();
      resolve(map);
    };
    req.onerror = () => {
      db.close();
      reject(req.error ?? new Error('IndexedDB read failed'));
    };
  });
}

async function clearIndexedDb(): Promise<void> {
  try {
    const db = await openPackDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // ignore
  }
}
