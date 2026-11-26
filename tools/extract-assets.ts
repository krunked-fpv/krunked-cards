import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import {
  ATLAS_KEYS,
  ATLAS_SPECS,
  SOUND_KEYS,
  type AtlasKey,
  type PackManifest,
  type SoundKey,
} from '../src/contracts/index.ts';

export const DEFAULT_EXE_PATH =
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Balatro\\Balatro.exe';
export const OUTPUT_DIR_NAME = '.krunked-cards-assets';
export const CUSTOM_PACK_URL_PREFIX = '/__krunked_custom_pack__';

const EOCD_SIGNATURE = 0x06054b50;
const CD_FILE_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface ZipEntryMeta {
  name: string;
  method: number;
  compSize: number;
  uncompSize: number;
  localHeaderOffset: number;
}

export interface FusedZipArchive {
  exePath: string;
  byteLength: number;
  baseOffset: number;
  entries: Map<string, ZipEntryMeta>;
  listNames(): string[];
  has(entryName: string): boolean;
  readEntry(entryName: string): Buffer;
  readText(entryName: string): string;
}

export interface PngDimensions {
  width: number;
  height: number;
}

/**
 * Strictly read-only fused Love2D ZIP reader.
 * Reads the archive into memory without ever modifying or creating files
 * in the source installation directory.
 */
export function openFusedZip(exePath: string): FusedZipArchive {
  const buf = fs.readFileSync(exePath);

  let eocdOffset = -1;
  const minOffset = Math.max(0, buf.length - 65558);
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      const commentLen = buf.readUInt16LE(i + 20);
      if (i + 22 + commentLen === buf.length) {
        eocdOffset = i;
        break;
      }
    }
  }
  if (eocdOffset < 0) {
    throw new Error(`ZIP End of Central Directory (0x06054b50) not found in ${exePath}`);
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdSize = buf.readUInt32LE(eocdOffset + 12);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const baseOffset = eocdOffset - cdSize - cdOffset;

  if (baseOffset < 0) {
    throw new Error(
      `Invalid fused ZIP offsets in ${exePath}: eocd=${eocdOffset}, cdSize=${cdSize}, cdOffset=${cdOffset}`
    );
  }

  const entries = new Map<string, ZipEntryMeta>();
  let pos = baseOffset + cdOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (pos + 46 > buf.length) {
      throw new Error(`Truncated Central Directory entry #${i} in ${exePath}`);
    }
    const sig = buf.readUInt32LE(pos);
    if (sig !== CD_FILE_HEADER_SIGNATURE) {
      throw new Error(
        `Invalid Central Directory signature 0x${sig.toString(16)} at entry #${i} (offset ${pos})`
      );
    }

    const method = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const uncompSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');

    entries.set(name, {
      name,
      method,
      compSize,
      uncompSize,
      localHeaderOffset,
    });

    pos += 46 + nameLen + extraLen + commentLen;
  }

  function readEntry(entryName: string): Buffer {
    const meta = entries.get(entryName);
    if (!meta) {
      throw new Error(`ZIP entry not found: ${entryName}`);
    }
    const lhPos = baseOffset + meta.localHeaderOffset;
    if (lhPos + 30 > buf.length) {
      throw new Error(`Truncated Local File Header for ${entryName}`);
    }
    const lhSig = buf.readUInt32LE(lhPos);
    if (lhSig !== LOCAL_FILE_HEADER_SIGNATURE) {
      throw new Error(
        `Invalid Local File Header signature 0x${lhSig.toString(16)} for ${entryName}`
      );
    }
    const localNameLen = buf.readUInt16LE(lhPos + 26);
    const localExtraLen = buf.readUInt16LE(lhPos + 28);
    const dataStart = lhPos + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(dataStart, dataStart + meta.compSize);

    let out: Buffer;
    if (meta.method === 0) {
      out = Buffer.from(raw);
    } else if (meta.method === 8) {
      out = zlib.inflateRawSync(raw);
    } else {
      throw new Error(`Unsupported ZIP compression method ${meta.method} for ${entryName}`);
    }

    if (out.length !== meta.uncompSize) {
      throw new Error(
        `Decompressed size mismatch for ${entryName}: expected ${meta.uncompSize}, got ${out.length}`
      );
    }
    return out;
  }

  return {
    exePath,
    byteLength: buf.length,
    baseOffset,
    entries,
    listNames: () => Array.from(entries.keys()),
    has: (entryName: string) => entries.has(entryName),
    readEntry,
    readText: (entryName: string) => readEntry(entryName).toString('utf8'),
  };
}

export function readPngDimensions(buf: Buffer, label = 'PNG'): PngDimensions {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`Invalid PNG header for ${label}`);
  }
  const chunkType = buf.subarray(12, 16).toString('ascii');
  if (chunkType !== 'IHDR') {
    throw new Error(`Expected IHDR chunk for ${label}, got ${chunkType}`);
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function writeBinaryFile(destPath: string, data: Buffer): void {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, data);
}

const EXCLUDED_TEXTURE_FILES = new Set([
  'balatro.png',
  'balatro_alt.png',
  'localthunk-logo.png',
  'playstack-logo.png',
]);

export function resolveExePath(): string {
  return process.env.BALATRO_EXE?.trim() || DEFAULT_EXE_PATH;
}

export function extractAssets(exePath: string, outDir: string): PackManifest {
  const archive = openFusedZip(exePath);
  fs.mkdirSync(outDir, { recursive: true });

  // 1. Extract 15 atlases (1x and 2x) explicitly defined in ATLAS_SPECS
  const textures = {} as PackManifest['textures'];

  for (const key of ATLAS_KEYS) {
    const spec = ATLAS_SPECS[key];
    const baseName = path.posix.basename(spec.file1x);
    if (EXCLUDED_TEXTURE_FILES.has(baseName.toLowerCase()) || spec.file1x.includes('collabs/')) {
      throw new Error(`Refusing to extract excluded texture: ${spec.file1x}`);
    }

    const zip1x = `resources/${spec.file1x}`;
    const zip2x = `resources/${spec.file2x}`;
    const data1x = archive.readEntry(zip1x);
    const data2x = archive.readEntry(zip2x);

    const dims1x = readPngDimensions(data1x, zip1x);
    const dims2x = readPngDimensions(data2x, zip2x);

    const expectedW1x = spec.cols * spec.cellW;
    const expectedH1x = spec.rows * spec.cellH;
    if (dims1x.width !== expectedW1x || dims1x.height !== expectedH1x) {
      throw new Error(
        `Atlas ${key} (1x) dimensions mismatch: expected ${expectedW1x}x${expectedH1x}, got ${dims1x.width}x${dims1x.height}`
      );
    }
    if (dims2x.width !== expectedW1x * 2 || dims2x.height !== expectedH1x * 2) {
      throw new Error(
        `Atlas ${key} (2x) dimensions mismatch: expected ${expectedW1x * 2}x${expectedH1x * 2}, got ${dims2x.width}x${dims2x.height}`
      );
    }

    writeBinaryFile(path.join(outDir, spec.file1x), data1x);
    writeBinaryFile(path.join(outDir, spec.file2x), data2x);

    textures[key as AtlasKey] = {
      url1x: `${CUSTOM_PACK_URL_PREFIX}/${spec.file1x}`,
      url2x: `${CUSTOM_PACK_URL_PREFIX}/${spec.file2x}`,
      width1x: dims1x.width,
      height1x: dims1x.height,
      cellW: spec.cellW,
      cellH: spec.cellH,
    };
  }

  // 2. Extract pixel font m6x11plus.ttf
  const fontRel = 'fonts/m6x11plus.ttf';
  const fontBuf = archive.readEntry(`resources/${fontRel}`);
  writeBinaryFile(path.join(outDir, fontRel), fontBuf);

  // 3. Extract all 80 sounds in SOUND_KEYS
  const sounds = {} as Record<SoundKey, string>;
  for (const key of SOUND_KEYS) {
    const soundRel = `sounds/${key}.ogg`;
    const soundBuf = archive.readEntry(`resources/${soundRel}`);
    if (soundBuf.length < 4 || soundBuf.subarray(0, 4).toString('ascii') !== 'OggS') {
      throw new Error(`Invalid Ogg header for sound ${soundRel}`);
    }
    writeBinaryFile(path.join(outDir, soundRel), soundBuf);
    sounds[key] = `${CUSTOM_PACK_URL_PREFIX}/${soundRel}`;
  }

  // 4. Extract all 19 shaders in resources/shaders/*.fs
  const shaderEntries = archive
    .listNames()
    .filter((name) => name.startsWith('resources/shaders/') && name.endsWith('.fs'))
    .sort((a, b) => a.localeCompare(b));

  if (shaderEntries.length !== 19) {
    throw new Error(`Expected 19 shader .fs files, found ${shaderEntries.length}`);
  }

  const shaders: string[] = [];
  for (const entryName of shaderEntries) {
    const filename = path.posix.basename(entryName);
    const shaderRel = `shaders/${filename}`;
    const shaderBuf = archive.readEntry(entryName);
    writeBinaryFile(path.join(outDir, shaderRel), shaderBuf);
    shaders.push(`${CUSTOM_PACK_URL_PREFIX}/${shaderRel}`);
  }

  // 5. Write PackManifest
  const manifest: PackManifest = {
    version: 1,
    source: 'local-dev',
    generatedAt: new Date().toISOString(),
    textures,
    fontUrl: `${CUSTOM_PACK_URL_PREFIX}/${fontRel}`,
    sounds,
    shaders,
  };

  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8'
  );

  return manifest;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
}

if (isMainModule()) {
  const optional = process.argv.includes('--optional');
  const exePath = resolveExePath();
  const outDir = path.resolve(process.cwd(), OUTPUT_DIR_NAME);

  if (!fs.existsSync(exePath)) {
    const msg = `[extract-assets] Retail executable not found at: ${exePath}`;
    if (optional) {
      console.log(`${msg} (--optional set; skipping custom pack extraction).`);
      process.exit(0);
    }
    console.error(`${msg}\nSet BALATRO_EXE or pass --optional to skip when unavailable.`);
    process.exit(1);
  }

  try {
    const manifest = extractAssets(exePath, outDir);
    console.log(
      `[extract-assets] Extracted 15 atlases (1x+2x), 1 font, ${Object.keys(manifest.sounds).length} sounds, and ${manifest.shaders?.length ?? 0} shaders to ${outDir}`
    );
    console.log(`[extract-assets] Wrote ${path.join(outDir, 'manifest.json')}`);
  } catch (err) {
    console.error('[extract-assets] Failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
