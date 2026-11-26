import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ATLAS_KEYS,
  ATLAS_SPECS,
  POKER_HAND_IDS,
  SOUND_KEYS,
  type AtlasKey,
  type PackManifest,
  type PokerHandId,
} from '../../src/contracts/index.ts';

type CheckStatus = 'PASS' | 'FAIL' | 'SKIP';

interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CUSTOM_PACK_PREFIX = '/__krunked_custom_pack__/';
const ASSETS_DIR_NAME = '.krunked-cards-assets';

// Construct forbidden brand pattern cleanly to enforce clean-room IP firewall
const FORBIDDEN_BRAND_REGEX = new RegExp(
  `${['bala', 'tro'].join('')}|${['local', 'thunk'].join('')}`,
  'i'
);
const FORBIDDEN_BINARY_EXT_REGEX = /\.(png|ogg|ttf|exe|love)$/i;

const GROUND_TRUTH_COUNTS = {
  jokers: 150,
  jokersByRarity: { 1: 61, 2: 64, 3: 20, 4: 5 } as Record<number, number>,
  decks: 15,
  stakes: 8,
  challenges: 20,
  blinds: 30,
  blindsByKind: { smallBig: 2, regularBoss: 23, showdownBoss: 5 },
  tarots: 22,
  planets: 12,
  spectrals: 18,
  vouchers: 32,
  boosters: 32,
  tags: 24,
  enhancements: 8,
  editions: 4,
  seals: 4,
  pokerHands: 12,
  sounds: 80,
  shaders: 19,
};

const GROUND_TRUTH_POKER_HANDS: Record<
  PokerHandId,
  { chips: number; mult: number; lChips: number; lMult: number; visible: boolean; order: number }
> = {
  'Flush Five': { chips: 160, mult: 16, lChips: 50, lMult: 3, visible: false, order: 1 },
  'Flush House': { chips: 140, mult: 14, lChips: 40, lMult: 4, visible: false, order: 2 },
  'Five of a Kind': { chips: 120, mult: 12, lChips: 35, lMult: 3, visible: false, order: 3 },
  'Straight Flush': { chips: 100, mult: 8, lChips: 40, lMult: 4, visible: true, order: 4 },
  'Four of a Kind': { chips: 60, mult: 7, lChips: 30, lMult: 3, visible: true, order: 5 },
  'Full House': { chips: 40, mult: 4, lChips: 25, lMult: 2, visible: true, order: 6 },
  Flush: { chips: 35, mult: 4, lChips: 15, lMult: 2, visible: true, order: 7 },
  Straight: { chips: 30, mult: 4, lChips: 30, lMult: 3, visible: true, order: 8 },
  'Three of a Kind': { chips: 30, mult: 3, lChips: 20, lMult: 2, visible: true, order: 9 },
  'Two Pair': { chips: 20, mult: 2, lChips: 20, lMult: 1, visible: true, order: 10 },
  Pair: { chips: 10, mult: 2, lChips: 15, lMult: 1, visible: true, order: 11 },
  'High Card': { chips: 5, mult: 1, lChips: 10, lMult: 1, visible: true, order: 12 },
};

const GROUND_TRUTH_BLIND_AMOUNTS = {
  scaling1: [300, 800, 2000, 5000, 11000, 20000, 35000, 50000],
  scaling2: [300, 900, 2600, 8000, 20000, 36000, 60000, 100000],
  scaling3: [300, 1000, 3200, 9000, 25000, 60000, 110000, 200000],
};

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

function readPngDims(filePath: string): { width: number; height: number } {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new Error(`Invalid PNG header: ${filePath}`);
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function checkCleanRoomIpFirewall(rootDir: string): CheckResult[] {
  const results: CheckResult[] = [];

  // 1a. Scan src/, index.html, README.md, and dist/ (if present) for forbidden brand strings
  const scanTargets: string[] = [
    ...walkFiles(path.join(rootDir, 'src')),
    ...(fs.existsSync(path.join(rootDir, 'index.html')) ? [path.join(rootDir, 'index.html')] : []),
    ...(fs.existsSync(path.join(rootDir, 'README.md')) ? [path.join(rootDir, 'README.md')] : []),
    ...walkFiles(path.join(rootDir, 'dist')),
  ];

  const brandViolations: string[] = [];
  for (const filePath of scanTargets) {
    const ext = path.extname(filePath).toLowerCase();
    if (['.png', '.ogg', '.ttf', '.woff', '.woff2', '.ico', '.wasm'].includes(ext)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (FORBIDDEN_BRAND_REGEX.test(lines[i])) {
        const rel = path.relative(rootDir, filePath).replace(/\\/g, '/');
        brandViolations.push(`${rel}:${i + 1}`);
        break;
      }
    }
  }

  if (brandViolations.length > 0) {
    results.push({
      name: 'IP Firewall (Brand Scan)',
      status: 'FAIL',
      detail: `Forbidden brand string found in: ${brandViolations.join(', ')}`,
    });
  } else {
    results.push({
      name: 'IP Firewall (Brand Scan)',
      status: 'PASS',
      detail: `Scanned ${scanTargets.length} shippable files (src/, index.html, README.md${fs.existsSync(path.join(rootDir, 'dist')) ? ', dist/' : ''}) — 0 violations`,
    });
  }

  // 1b. Check git ls-files for forbidden binary extensions & extracted pack leaks
  try {
    const rawTracked = execSync('git ls-files', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const tracked = rawTracked
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const badBinaries = tracked.filter(
      (f) => FORBIDDEN_BINARY_EXT_REGEX.test(f) || f.startsWith(`${ASSETS_DIR_NAME}/`)
    );

    if (badBinaries.length > 0) {
      results.push({
        name: 'IP Firewall (Git Tracked)',
        status: 'FAIL',
        detail: `Forbidden tracked assets: ${badBinaries.slice(0, 10).join(', ')}`,
      });
    } else {
      results.push({
        name: 'IP Firewall (Git Tracked)',
        status: 'PASS',
        detail: `Checked ${tracked.length} tracked files — 0 retail binaries or extracted assets`,
      });
    }
  } catch (err) {
    results.push({
      name: 'IP Firewall (Git Tracked)',
      status: 'FAIL',
      detail: `git ls-files failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return results;
}

function checkLocalCustomPack(rootDir: string): CheckResult[] {
  const results: CheckResult[] = [];
  const assetsDir = path.join(rootDir, ASSETS_DIR_NAME);
  const manifestPath = path.join(assetsDir, 'manifest.json');
  const oraclePath = path.join(assetsDir, 'oracle.json');

  if (!fs.existsSync(manifestPath)) {
    results.push({
      name: 'Local Custom Pack Manifest',
      status: 'SKIP',
      detail: `${ASSETS_DIR_NAME}/manifest.json not present (CI / clean-room mode)`,
    });
  } else {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PackManifest;
      const errors: string[] = [];

      // Validate all 15 atlases (1x and 2x)
      for (const key of ATLAS_KEYS) {
        const spec = ATLAS_SPECS[key];
        const entry = manifest.textures?.[key];
        if (!entry) {
          errors.push(`Missing manifest.textures.${key}`);
          continue;
        }
        const expectedW1x = spec.cols * spec.cellW;
        const expectedH1x = spec.rows * spec.cellH;
        if (
          entry.width1x !== expectedW1x ||
          entry.height1x !== expectedH1x ||
          entry.cellW !== spec.cellW ||
          entry.cellH !== spec.cellH
        ) {
          errors.push(`Manifest metadata mismatch for ${key}`);
        }
        const file1x = path.join(assetsDir, spec.file1x);
        const file2x = path.join(assetsDir, spec.file2x);
        if (!fs.existsSync(file1x)) {
          errors.push(`Missing file: ${spec.file1x}`);
        } else {
          const d1 = readPngDims(file1x);
          if (d1.width !== expectedW1x || d1.height !== expectedH1x) {
            errors.push(
              `1x PNG dims mismatch for ${key}: got ${d1.width}x${d1.height}, expected ${expectedW1x}x${expectedH1x}`
            );
          }
        }
        if (!fs.existsSync(file2x)) {
          errors.push(`Missing file: ${spec.file2x}`);
        } else {
          const d2 = readPngDims(file2x);
          if (d2.width !== expectedW1x * 2 || d2.height !== expectedH1x * 2) {
            errors.push(
              `2x PNG dims mismatch for ${key}: got ${d2.width}x${d2.height}, expected ${expectedW1x * 2}x${expectedH1x * 2}`
            );
          }
        }
      }

      // Validate pixel font
      const fontPath = path.join(assetsDir, 'fonts/m6x11plus.ttf');
      if (!fs.existsSync(fontPath) || fs.statSync(fontPath).size === 0) {
        errors.push('Missing or empty fonts/m6x11plus.ttf');
      }
      if (!manifest.fontUrl?.startsWith(CUSTOM_PACK_PREFIX)) {
        errors.push(`Invalid fontUrl: ${String(manifest.fontUrl)}`);
      }

      // Validate all 80 sounds
      let validSounds = 0;
      for (const soundKey of SOUND_KEYS) {
        const url = manifest.sounds?.[soundKey];
        if (!url || !url.startsWith(CUSTOM_PACK_PREFIX)) {
          errors.push(`Invalid manifest.sounds.${soundKey}`);
          continue;
        }
        const soundPath = path.join(assetsDir, `sounds/${soundKey}.ogg`);
        if (!fs.existsSync(soundPath)) {
          errors.push(`Missing sound: sounds/${soundKey}.ogg`);
          continue;
        }
        const head = fs.readFileSync(soundPath).subarray(0, 4).toString('ascii');
        if (head !== 'OggS') {
          errors.push(`Invalid Ogg magic in sounds/${soundKey}.ogg`);
          continue;
        }
        validSounds++;
      }

      // Validate all 19 shaders
      const shaders = manifest.shaders ?? [];
      if (shaders.length !== 19) {
        errors.push(`Expected 19 shaders in manifest, got ${shaders.length}`);
      }
      let validShaders = 0;
      for (const shaderUrl of shaders) {
        const rel = shaderUrl.startsWith(CUSTOM_PACK_PREFIX)
          ? shaderUrl.slice(CUSTOM_PACK_PREFIX.length)
          : `shaders/${shaderUrl}`;
        const shaderPath = path.join(assetsDir, rel);
        if (!fs.existsSync(shaderPath) || fs.statSync(shaderPath).size === 0) {
          errors.push(`Missing or empty shader: ${rel}`);
        } else {
          validShaders++;
        }
      }

      results.push(
        errors.length === 0
          ? {
              name: 'Local Custom Pack Manifest',
              status: 'PASS',
              detail: `15 atlases (1x+2x IHDR verified), 1 font, ${validSounds} sounds, ${validShaders} shaders`,
            }
          : {
              name: 'Local Custom Pack Manifest',
              status: 'FAIL',
              detail: errors.slice(0, 5).join('; '),
            }
      );
    } catch (err) {
      results.push({
        name: 'Local Custom Pack Manifest',
        status: 'FAIL',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Validate oracle.json if present
  if (!fs.existsSync(oraclePath)) {
    results.push({
      name: 'Local Oracle Ground Truth',
      status: 'SKIP',
      detail: `${ASSETS_DIR_NAME}/oracle.json not present (CI / clean-room mode)`,
    });
  } else {
    try {
      const oracle = JSON.parse(fs.readFileSync(oraclePath, 'utf8'));
      const errors: string[] = [];
      const c = oracle.counts ?? {};

      const scalarFields: Array<keyof typeof GROUND_TRUTH_COUNTS> = [
        'jokers',
        'decks',
        'stakes',
        'challenges',
        'blinds',
        'tarots',
        'planets',
        'spectrals',
        'vouchers',
        'boosters',
        'tags',
        'enhancements',
        'editions',
        'seals',
        'pokerHands',
        'sounds',
        'shaders',
      ];
      for (const f of scalarFields) {
        if (c[f] !== GROUND_TRUTH_COUNTS[f]) {
          errors.push(`counts.${f}: got ${String(c[f])}, expected ${String(GROUND_TRUTH_COUNTS[f])}`);
        }
      }
      for (const r of [1, 2, 3, 4]) {
        if (c.jokersByRarity?.[r] !== GROUND_TRUTH_COUNTS.jokersByRarity[r]) {
          errors.push(
            `jokersByRarity[${r}]: got ${String(c.jokersByRarity?.[r])}, expected ${GROUND_TRUTH_COUNTS.jokersByRarity[r]}`
          );
        }
      }
      if (
        c.blindsByKind?.smallBig !== 2 ||
        c.blindsByKind?.regularBoss !== 23 ||
        c.blindsByKind?.showdownBoss !== 5
      ) {
        errors.push(`blindsByKind mismatch: ${JSON.stringify(c.blindsByKind)}`);
      }
      if (!Array.isArray(oracle.jokers) || oracle.jokers.length !== 150) {
        errors.push(`oracle.jokers length != 150`);
      }
      if (!Array.isArray(oracle.pokerHands) || oracle.pokerHands.length !== 12) {
        errors.push(`oracle.pokerHands length != 12`);
      }
      if (
        JSON.stringify(oracle.blindAmounts) !== JSON.stringify(GROUND_TRUTH_BLIND_AMOUNTS)
      ) {
        errors.push('oracle.blindAmounts mismatch');
      }

      results.push(
        errors.length === 0
          ? {
              name: 'Local Oracle Ground Truth',
              status: 'PASS',
              detail:
                '150 jokers (61/64/20/5), 15 decks, 8 stakes, 20 challenges, 30 blinds (2/23/5), 22/12/18 consumables, 32 vouchers, 32 boosters, 24 tags',
            }
          : {
              name: 'Local Oracle Ground Truth',
              status: 'FAIL',
              detail: errors.slice(0, 5).join('; '),
            }
      );
    } catch (err) {
      results.push({
        name: 'Local Oracle Ground Truth',
        status: 'FAIL',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

async function checkBuiltinArtPack(rootDir: string): Promise<CheckResult> {
  const artPackPath = path.join(rootDir, 'src/assets/KrunkedArtPack.ts');
  if (!fs.existsSync(artPackPath)) {
    return {
      name: 'Built-in KrunkedArtPack',
      status: 'SKIP',
      detail: 'src/assets/KrunkedArtPack.ts not present yet (Wave 0)',
    };
  }

  try {
    const mod = (await import(pathToFileURL(artPackPath).href)) as Record<string, unknown>;
    const errors: string[] = [];

    // Locate manifest/atlas/sound resolvers flexibly across Wave 1+ API shapes
    const manifestCandidate =
      (typeof mod.getBuiltinManifest === 'function'
        ? (mod.getBuiltinManifest as () => Partial<PackManifest>)()
        : undefined) ??
      (mod.BUILTIN_MANIFEST as Partial<PackManifest> | undefined) ??
      (mod.KRUNKED_ART_PACK as Partial<PackManifest> | undefined) ??
      (mod.default as Partial<PackManifest> | undefined);

    const atlasMap =
      (manifestCandidate?.textures as Record<string, unknown> | undefined) ??
      (mod.BUILTIN_ATLASES as Record<string, unknown> | undefined) ??
      (mod.ATLAS_GENERATORS as Record<string, unknown> | undefined);

    const soundMap =
      (manifestCandidate?.sounds as Record<string, unknown> | undefined) ??
      (mod.BUILTIN_SOUNDS as Record<string, unknown> | undefined) ??
      (mod.SOUND_PRESETS as Record<string, unknown> | undefined);

    const hasAtlasFn =
      typeof mod.hasAtlas === 'function'
        ? (mod.hasAtlas as (k: AtlasKey) => boolean)
        : typeof mod.resolveAtlas === 'function'
          ? (k: AtlasKey) => Boolean((mod.resolveAtlas as (k: AtlasKey) => unknown)(k))
          : null;

    const hasSoundFn =
      typeof mod.hasSound === 'function'
        ? (mod.hasSound as (k: string) => boolean)
        : typeof mod.resolveSound === 'function'
          ? (k: string) => Boolean((mod.resolveSound as (k: string) => unknown)(k))
          : null;

    if (!atlasMap && !hasAtlasFn) {
      errors.push('KrunkedArtPack exports no atlas map or resolver');
    } else {
      for (const key of ATLAS_KEYS) {
        const ok = atlasMap ? Boolean(atlasMap[key]) : Boolean(hasAtlasFn?.(key));
        if (!ok) errors.push(`Missing built-in atlas key: ${key}`);
      }
    }

    if (!soundMap && !hasSoundFn) {
      errors.push('KrunkedArtPack exports no sound map or resolver');
    } else {
      for (const key of SOUND_KEYS) {
        const ok = soundMap ? Boolean(soundMap[key]) : Boolean(hasSoundFn?.(key));
        if (!ok) errors.push(`Missing built-in sound key: ${key}`);
      }
    }

    return errors.length === 0
      ? {
          name: 'Built-in KrunkedArtPack',
          status: 'PASS',
          detail: `Resolved all ${ATLAS_KEYS.length} atlases and ${SOUND_KEYS.length} sound keys`,
        }
      : {
          name: 'Built-in KrunkedArtPack',
          status: 'FAIL',
          detail: errors.slice(0, 5).join('; '),
        };
  } catch (err) {
    return {
      name: 'Built-in KrunkedArtPack',
      status: 'FAIL',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function getCollectionArray(mod: Record<string, unknown>, names: string[]): unknown[] | null {
  for (const name of names) {
    const val = mod[name];
    if (Array.isArray(val)) return val;
    if (val && typeof val === 'object') return Object.values(val as Record<string, unknown>);
  }
  return null;
}

async function checkDataCatalogParity(rootDir: string): Promise<CheckResult> {
  const catalogPath = path.join(rootDir, 'src/data/index.ts');
  if (!fs.existsSync(catalogPath)) {
    return {
      name: 'Data Catalog Parity',
      status: 'SKIP',
      detail: 'src/data/index.ts not present yet (Wave 0)',
    };
  }

  try {
    const mod = (await import(pathToFileURL(catalogPath).href)) as Record<string, unknown>;
    const stage = typeof mod.CATALOG_STAGE === 'string' ? mod.CATALOG_STAGE : 'full';
    const isWave1 = stage === 'wave1';

    const oraclePath = path.join(rootDir, ASSETS_DIR_NAME, 'oracle.json');
    const oracle = fs.existsSync(oraclePath)
      ? (JSON.parse(fs.readFileSync(oraclePath, 'utf8')) as Record<string, unknown>)
      : null;

    const errors: string[] = [];

    // Check poker hands (required exact 12 in both Wave 1 and Full)
    const hands = getCollectionArray(mod, ['POKER_HANDS', 'POKER_HAND_DEFS', 'HAND_DEFS']) as
      | Array<Record<string, unknown>>
      | null;
    if (!hands) {
      errors.push('Missing POKER_HANDS export');
    } else if (hands.length !== 12) {
      errors.push(`POKER_HANDS length: got ${hands.length}, expected 12`);
    } else {
      for (const id of POKER_HAND_IDS) {
        const h = hands.find((x) => x.id === id);
        const exp = GROUND_TRUTH_POKER_HANDS[id];
        if (!h) {
          errors.push(`Missing poker hand: ${id}`);
          continue;
        }
        const chips = Number(h.baseChips ?? h.chips);
        const mult = Number(h.baseMult ?? h.mult);
        if (
          chips !== exp.chips ||
          mult !== exp.mult ||
          Number(h.lChips) !== exp.lChips ||
          Number(h.lMult) !== exp.lMult ||
          Boolean(h.visible) !== exp.visible
        ) {
          errors.push(`Poker hand stats mismatch for ${id}`);
        }
      }
    }

    // Check blind scaling if exported
    const blindAmounts = (mod.BLIND_AMOUNTS ?? mod.ANTE_BASE_AMOUNTS) as
      | Record<string, number[]>
      | number[]
      | undefined;
    if (blindAmounts) {
      if (Array.isArray(blindAmounts)) {
        if (
          JSON.stringify(blindAmounts.slice(0, 8)) !==
          JSON.stringify(GROUND_TRUTH_BLIND_AMOUNTS.scaling1)
        ) {
          errors.push('BLIND_AMOUNTS scaling1 mismatch');
        }
      } else {
        const s1 = blindAmounts.scaling1 ?? blindAmounts['1'];
        const s2 = blindAmounts.scaling2 ?? blindAmounts['2'];
        const s3 = blindAmounts.scaling3 ?? blindAmounts['3'];
        if (s1 && JSON.stringify(s1) !== JSON.stringify(GROUND_TRUTH_BLIND_AMOUNTS.scaling1)) {
          errors.push('BLIND_AMOUNTS.scaling1 mismatch');
        }
        if (s2 && JSON.stringify(s2) !== JSON.stringify(GROUND_TRUTH_BLIND_AMOUNTS.scaling2)) {
          errors.push('BLIND_AMOUNTS.scaling2 mismatch');
        }
        if (s3 && JSON.stringify(s3) !== JSON.stringify(GROUND_TRUTH_BLIND_AMOUNTS.scaling3)) {
          errors.push('BLIND_AMOUNTS.scaling3 mismatch');
        }
      }
    }

    const expectedCollections: Array<{
      label: string;
      exports: string[];
      fullCount: number;
    }> = [
      { label: 'jokers', exports: ['JOKERS', 'JOKER_DEFS'], fullCount: 150 },
      { label: 'tarots', exports: ['TAROTS', 'TAROT_DEFS'], fullCount: 22 },
      { label: 'planets', exports: ['PLANETS', 'PLANET_DEFS'], fullCount: 12 },
      { label: 'spectrals', exports: ['SPECTRALS', 'SPECTRAL_DEFS'], fullCount: 18 },
      { label: 'vouchers', exports: ['VOUCHERS', 'VOUCHER_DEFS'], fullCount: 32 },
      { label: 'boosters', exports: ['BOOSTERS', 'BOOSTER_DEFS'], fullCount: 32 },
      { label: 'blinds', exports: ['BLINDS', 'BLIND_DEFS'], fullCount: 30 },
      { label: 'tags', exports: ['TAGS', 'TAG_DEFS'], fullCount: 24 },
      { label: 'decks', exports: ['DECKS', 'DECK_DEFS'], fullCount: 15 },
      { label: 'stakes', exports: ['STAKES', 'STAKE_DEFS'], fullCount: 8 },
      { label: 'challenges', exports: ['CHALLENGES', 'CHALLENGE_DEFS'], fullCount: 20 },
    ];

    for (const col of expectedCollections) {
      const arr = getCollectionArray(mod, col.exports);
      if (!arr) {
        if (!isWave1) errors.push(`Missing catalog export for ${col.label}`);
        continue;
      }
      if (isWave1) {
        if (arr.length === 0) {
          errors.push(`Wave 1 catalog ${col.label} is empty`);
        }
      } else if (arr.length !== col.fullCount) {
        errors.push(`${col.label} count: got ${arr.length}, expected ${col.fullCount}`);
      }
    }

    // In full mode, verify joker rarity distribution, blind kinds, and oracle key parity
    if (!isWave1) {
      const jokers = getCollectionArray(mod, ['JOKERS', 'JOKER_DEFS']) as
        | Array<Record<string, unknown>>
        | null;
      if (jokers && jokers.length === 150) {
        const byR: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
        for (const j of jokers) {
          const r = Number(j.rarity);
          byR[r] = (byR[r] ?? 0) + 1;
        }
        for (const r of [1, 2, 3, 4]) {
          if (byR[r] !== GROUND_TRUTH_COUNTS.jokersByRarity[r]) {
            errors.push(
              `jokers rarity ${r}: got ${byR[r]}, expected ${GROUND_TRUTH_COUNTS.jokersByRarity[r]}`
            );
          }
        }
        if (oracle && Array.isArray(oracle.jokers)) {
          const oracleKeys = new Set(
            (oracle.jokers as Array<{ key: string }>).map((j) => j.key)
          );
          const missing = [...oracleKeys].filter(
            (k) => !jokers.some((j) => j.key === k)
          );
          if (missing.length > 0) {
            errors.push(`Missing oracle joker keys: ${missing.slice(0, 5).join(', ')}`);
          }
        }
      }
    }

    return errors.length === 0
      ? {
          name: 'Data Catalog Parity',
          status: 'PASS',
          detail: isWave1
            ? 'Wave 1 vertical-slice catalog verified (12 poker hands exact parity)'
            : `Full catalog 1:1 parity verified${oracle ? ' against oracle.json' : ' against built-in ground truth'}`,
        }
      : {
          name: 'Data Catalog Parity',
          status: 'FAIL',
          detail: errors.slice(0, 5).join('; '),
        };
  } catch (err) {
    return {
      name: 'Data Catalog Parity',
      status: 'FAIL',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function printSummaryTable(results: CheckResult[]): void {
  const nameWidth = Math.max(28, ...results.map((r) => r.name.length));
  const statusWidth = 6;
  const line = `${'-'.repeat(nameWidth + 2)}+${'-'.repeat(statusWidth + 2)}+${'-'.repeat(64)}`;

  console.log('\n=== Gate A: Asset, Oracle & Clean-Room IP Verification ===');
  console.log(line);
  console.log(
    ` ${'Check'.padEnd(nameWidth)} | ${'Status'.padEnd(statusWidth)} | Details`
  );
  console.log(line);
  for (const r of results) {
    console.log(
      ` ${r.name.padEnd(nameWidth)} | ${r.status.padEnd(statusWidth)} | ${r.detail}`
    );
  }
  console.log(line);
}

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const results: CheckResult[] = [
    ...checkCleanRoomIpFirewall(rootDir),
    ...checkLocalCustomPack(rootDir),
    await checkBuiltinArtPack(rootDir),
    await checkDataCatalogParity(rootDir),
  ];

  printSummaryTable(results);

  const failed = results.filter((r) => r.status === 'FAIL');
  if (failed.length > 0) {
    console.error(`\n[verify:assets] FAILED (${failed.length} check(s) failed).`);
    process.exit(1);
  }
  console.log('\n[verify:assets] ALL APPLICABLE CHECKS PASSED.');
}

main().catch((err) => {
  console.error('[verify:assets] Unhandled error:', err);
  process.exit(1);
});
