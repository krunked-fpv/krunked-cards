// ============================================================================
// Krunked Cards — Schema-Validated Save & Profile Persistence
// Stores SaveData under `krunked_cards_save_v1` with corruption recovery.
// ============================================================================

import {
  DEFAULT_SETTINGS,
  SAVE_SCHEMA_VERSION,
  SAVE_STORAGE_KEY,
  type ArtPackMode,
  type GameSpeed,
  type ProfileProgress,
  type RenderSettings,
  type SaveData,
  type SimState,
  type StakeLevel,
  type TargetFps,
} from '../contracts/index.ts';

export function createDefaultProfile(): ProfileProgress {
  return {
    discoveredJokers: [],
    discoveredConsumables: [],
    discoveredVouchers: [],
    discoveredBlinds: [],
    discoveredTags: [],
    deckMaxStake: {},
    challengesCompleted: [],
    bestHandScore: 0,
    runsPlayed: 0,
    runsWon: 0,
  };
}

export function createDefaultSave(): SaveData {
  return {
    version: SAVE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    settings: cloneSettings(DEFAULT_SETTINGS),
    profile: createDefaultProfile(),
    activeRun: null,
  };
}

function cloneSettings(s: RenderSettings): RenderSettings {
  return {
    ...s,
    keybinds: { ...s.keybinds },
  };
}

function sanitizeTargetFps(v: unknown): TargetFps {
  return v === 30 || v === 60 || v === 120 ? v : DEFAULT_SETTINGS.targetFps;
}

function sanitizeGameSpeed(v: unknown): GameSpeed {
  return v === 0.5 || v === 1 || v === 2 || v === 4 ? v : DEFAULT_SETTINGS.gameSpeed;
}

function sanitizeArtPackMode(v: unknown): ArtPackMode {
  return v === 'builtin' || v === 'custom' ? v : DEFAULT_SETTINGS.artPackMode;
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function sanitizeSettings(raw: unknown): RenderSettings {
  const base = cloneSettings(DEFAULT_SETTINGS);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const kb = (r.keybinds && typeof r.keybinds === 'object' ? r.keybinds : {}) as Record<string, unknown>;

  return {
    targetFps: sanitizeTargetFps(r.targetFps),
    gameSpeed: sanitizeGameSpeed(r.gameSpeed),
    crtAmount: clampNum(r.crtAmount, 0, 100, base.crtAmount),
    highContrastSuits: typeof r.highContrastSuits === 'boolean' ? r.highContrastSuits : base.highContrastSuits,
    reducedMotion: typeof r.reducedMotion === 'boolean' ? r.reducedMotion : base.reducedMotion,
    masterVolume: clampNum(r.masterVolume, 0, 1, base.masterVolume),
    musicVolume: clampNum(r.musicVolume, 0, 1, base.musicVolume),
    sfxVolume: clampNum(r.sfxVolume, 0, 1, base.sfxVolume),
    artPackMode: sanitizeArtPackMode(r.artPackMode),
    keybinds: {
      playHand: typeof kb.playHand === 'string' ? kb.playHand : base.keybinds.playHand,
      discardHand: typeof kb.discardHand === 'string' ? kb.discardHand : base.keybinds.discardHand,
      sortRank: typeof kb.sortRank === 'string' ? kb.sortRank : base.keybinds.sortRank,
      sortSuit: typeof kb.sortSuit === 'string' ? kb.sortSuit : base.keybinds.sortSuit,
      runInfo: typeof kb.runInfo === 'string' ? kb.runInfo : base.keybinds.runInfo,
      pause: typeof kb.pause === 'string' ? kb.pause : base.keybinds.pause,
      debugDrawer: typeof kb.debugDrawer === 'string' ? kb.debugDrawer : base.keybinds.debugDrawer,
    },
  };
}

function sanitizeStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.filter((x): x is string => typeof x === 'string')));
}

function sanitizeProfile(raw: unknown): ProfileProgress {
  const base = createDefaultProfile();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const deckMaxStake: Record<string, StakeLevel> = {};
  if (r.deckMaxStake && typeof r.deckMaxStake === 'object') {
    for (const [k, v] of Object.entries(r.deckMaxStake as Record<string, unknown>)) {
      if (typeof v === 'number' && v >= 1 && v <= 8) {
        deckMaxStake[k] = Math.floor(v) as StakeLevel;
      }
    }
  }
  return {
    discoveredJokers: sanitizeStringList(r.discoveredJokers),
    discoveredConsumables: sanitizeStringList(r.discoveredConsumables),
    discoveredVouchers: sanitizeStringList(r.discoveredVouchers),
    discoveredBlinds: sanitizeStringList(r.discoveredBlinds),
    discoveredTags: sanitizeStringList(r.discoveredTags),
    deckMaxStake,
    challengesCompleted: sanitizeStringList(r.challengesCompleted),
    bestHandScore: clampNum(r.bestHandScore, 0, Number.MAX_SAFE_INTEGER, 0),
    runsPlayed: clampNum(r.runsPlayed, 0, Number.MAX_SAFE_INTEGER, 0),
    runsWon: clampNum(r.runsWon, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

function isValidSimState(raw: unknown): raw is SimState {
  if (!raw || typeof raw !== 'object') return false;
  const s = raw as Partial<SimState>;
  return (
    typeof s.phase === 'string' &&
    s.phase !== 'TITLE' &&
    typeof s.ante === 'number' &&
    typeof s.round === 'number' &&
    typeof s.dollars === 'number' &&
    Array.isArray(s.fullDeck) &&
    Array.isArray(s.jokers) &&
    Array.isArray(s.consumables) &&
    Boolean(s.blinds) &&
    Boolean(s.handLevels)
  );
}

export class SaveManager {
  private data: SaveData;

  constructor() {
    this.data = this.load();
  }

  getData(): SaveData {
    return this.data;
  }

  getSettings(): RenderSettings {
    return this.data.settings;
  }

  getProfile(): ProfileProgress {
    return this.data.profile;
  }

  getActiveRun(): SimState | null {
    return this.data.activeRun;
  }

  load(): SaveData {
    try {
      if (typeof localStorage === 'undefined') return createDefaultSave();
      const raw = localStorage.getItem(SAVE_STORAGE_KEY);
      if (!raw) return createDefaultSave();
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || parsed.version !== SAVE_SCHEMA_VERSION) {
        return this.recoverCorruptSave();
      }
      const save: SaveData = {
        version: SAVE_SCHEMA_VERSION,
        savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
        settings: sanitizeSettings(parsed.settings),
        profile: sanitizeProfile(parsed.profile),
        activeRun: isValidSimState(parsed.activeRun) ? parsed.activeRun : null,
      };
      this.data = save;
      return save;
    } catch {
      return this.recoverCorruptSave();
    }
  }

  private recoverCorruptSave(): SaveData {
    const fresh = createDefaultSave();
    this.data = fresh;
    this.persist();
    return fresh;
  }

  updateSettings(partial: Partial<RenderSettings>): RenderSettings {
    this.data.settings = sanitizeSettings({
      ...this.data.settings,
      ...partial,
      keybinds: {
        ...this.data.settings.keybinds,
        ...(partial.keybinds ?? {}),
      },
    });
    this.persist();
    return this.data.settings;
  }

  saveRun(state: SimState | null): void {
    if (!state || state.phase === 'TITLE' || state.phase === 'GAME_OVER') {
      this.data.activeRun = null;
    } else {
      this.data.activeRun = state;
    }
    if (state) {
      this.recordDiscoveriesFromState(state);
    }
    this.persist();
  }

  recordRunStarted(): void {
    this.data.profile.runsPlayed += 1;
    this.persist();
  }

  recordRunWon(state: SimState): void {
    this.data.profile.runsWon += 1;
    const prev = this.data.profile.deckMaxStake[state.deckId] ?? 0;
    if (state.stake > prev) {
      this.data.profile.deckMaxStake[state.deckId] = state.stake;
    }
    if (
      state.challengeId &&
      !this.data.profile.challengesCompleted.includes(state.challengeId)
    ) {
      this.data.profile.challengesCompleted.push(state.challengeId);
    }
    this.recordDiscoveriesFromState(state);
    this.persist();
  }

  private recordDiscoveriesFromState(state: SimState): void {
    const p = this.data.profile;
    const addUnique = (arr: string[], key: string) => {
      if (key && !arr.includes(key)) arr.push(key);
    };

    for (const j of state.jokers) addUnique(p.discoveredJokers, j.key);
    for (const c of state.consumables) addUnique(p.discoveredConsumables, c.key);
    for (const v of state.vouchers) addUnique(p.discoveredVouchers, v);
    for (const t of state.tags) addUnique(p.discoveredTags, t);
    if (state.blinds) {
      for (const slot of ['Small', 'Big', 'Boss'] as const) {
        const b = state.blinds[slot];
        if (b?.key) addUnique(p.discoveredBlinds, b.key);
        if (b?.tagKey) addUnique(p.discoveredTags, b.tagKey);
      }
    }
    if (state.shop) {
      for (const o of state.shop.offers) {
        if (o.kind === 'joker') addUnique(p.discoveredJokers, o.key);
        else if (o.kind === 'tarot' || o.kind === 'planet' || o.kind === 'spectral') {
          addUnique(p.discoveredConsumables, o.key);
        }
      }
      for (const v of state.shop.vouchers) addUnique(p.discoveredVouchers, v.key);
    }
    if (state.stats?.bestHand > p.bestHandScore) {
      p.bestHandScore = state.stats.bestHand;
    }
  }

  resetAll(): void {
    this.data = createDefaultSave();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(SAVE_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
    this.persist();
  }

  private persist(): void {
    this.data.savedAt = new Date().toISOString();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(this.data));
      }
    } catch {
      // ignore quota/private-mode errors
    }
  }
}
