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
  type RunHistoryEntry,
  type SaveData,
  type SimState,
  type StakeLevel,
  type TargetFps,
} from '../contracts/index.ts';

export const MAX_RUN_HISTORY = 15 as const;

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
    runHistory: [],
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

function sanitizeStakeLevel(v: unknown): StakeLevel {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const floored = Math.floor(v);
    if (floored >= 1 && floored <= 8) return floored as StakeLevel;
  }
  return 1;
}

function sanitizeRunHistory(raw: unknown): RunHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RunHistoryEntry[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < raw.length && out.length < MAX_RUN_HISTORY; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.deckId !== 'string' || r.deckId.trim().length === 0) continue;

    const deckId = r.deckId.trim().slice(0, 64);
    const seed = typeof r.seed === 'string' ? r.seed.slice(0, 64) : '';
    const ante = Math.floor(clampNum(r.ante, 0, 999, 1));
    const round = Math.floor(clampNum(r.round, 0, 9999, 0));
    const won = typeof r.won === 'boolean' ? r.won : false;
    const stake = sanitizeStakeLevel(r.stake);
    const idRaw = typeof r.id === 'string' && r.id.trim().length > 0 ? r.id.trim().slice(0, 160) : '';
    const id = idRaw || `legacy:${seed}:${deckId}:${stake}:${ante}:${round}:${won ? 'win' : 'loss'}:${i}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const jokerKeys = Array.isArray(r.jokerKeys)
      ? r.jokerKeys
          .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
          .slice(0, 24)
      : [];

    const finishedAt =
      typeof r.finishedAt === 'string' && r.finishedAt.trim().length > 0
        ? r.finishedAt.trim().slice(0, 64)
        : new Date().toISOString();

    out.push({
      id,
      finishedAt,
      won,
      deckId,
      stake,
      challengeId:
        typeof r.challengeId === 'string' && r.challengeId.trim().length > 0
          ? r.challengeId.trim().slice(0, 64)
          : null,
      seed,
      ante,
      round,
      bestHand: Math.floor(clampNum(r.bestHand, 0, Number.MAX_SAFE_INTEGER, 0)),
      jokerKeys,
      defeatedBy:
        !won && typeof r.defeatedBy === 'string' && r.defeatedBy.trim().length > 0
          ? r.defeatedBy.trim().slice(0, 64)
          : null,
    });
  }

  return out;
}

function buildRunHistoryId(state: SimState, won: boolean): string {
  const seed = typeof state.rng?.seed === 'string' ? state.rng.seed.slice(0, 64) : '';
  const deckId = typeof state.deckId === 'string' ? state.deckId : 'b_red';
  const stake = sanitizeStakeLevel(state.stake);
  const challengeId = typeof state.challengeId === 'string' ? state.challengeId : '';
  const ante = Math.max(0, Math.floor(Number.isFinite(state.ante) ? state.ante : 0));
  const round = Math.max(0, Math.floor(Number.isFinite(state.round) ? state.round : 0));
  const tick = Math.max(0, Math.floor(Number.isFinite(state.tick) ? state.tick : 0));
  return `run:${seed}:${deckId}:${stake}:${challengeId}:${ante}:${round}:${tick}:${won ? 'win' : 'loss'}`;
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
    runHistory: sanitizeRunHistory(r.runHistory),
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
  private recordedRunIds = new Set<string>();

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

  getRunHistory(): RunHistoryEntry[] {
    const history = this.data.profile.runHistory ?? [];
    return history.map((entry) => ({
      ...entry,
      jokerKeys: entry.jokerKeys.slice(),
    }));
  }

  getActiveRun(): SimState | null {
    return this.data.activeRun;
  }

  load(): SaveData {
    try {
      if (typeof localStorage === 'undefined') {
        const fresh = createDefaultSave();
        this.recordedRunIds.clear();
        return fresh;
      }
      const raw = localStorage.getItem(SAVE_STORAGE_KEY);
      if (!raw) {
        const fresh = createDefaultSave();
        this.recordedRunIds.clear();
        return fresh;
      }
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
      this.syncRecordedRunIds();
      return save;
    } catch {
      return this.recoverCorruptSave();
    }
  }

  private syncRecordedRunIds(): void {
    this.recordedRunIds.clear();
    const history = this.data.profile.runHistory ?? [];
    for (const entry of history) {
      if (entry.id) this.recordedRunIds.add(entry.id);
    }
  }

  private recoverCorruptSave(): SaveData {
    const fresh = createDefaultSave();
    this.data = fresh;
    this.recordedRunIds.clear();
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

  recordRunFinished(state: SimState, won: boolean): void {
    this.recordDiscoveriesFromState(state);
    this.appendRunHistory(state, won);
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
    this.appendRunHistory(state, true);
    this.persist();
  }

  private appendRunHistory(state: SimState, won: boolean): boolean {
    const id = buildRunHistoryId(state, won);
    const history = this.data.profile.runHistory ?? (this.data.profile.runHistory = []);
    if (this.recordedRunIds.has(id) || history.some((e) => e.id === id)) {
      return false;
    }

    const activeBlindName = state.blinds?.[state.activeBlindSlot]?.name ?? null;
    const defeatedBy = won
      ? null
      : (typeof state.stats?.defeatedBy === 'string' && state.stats.defeatedBy.trim().length > 0
          ? state.stats.defeatedBy.trim()
          : activeBlindName);

    const bestHand = Math.floor(
      clampNum(
        Math.max(state.stats?.bestHand ?? 0, state.lastHandScore ?? 0),
        0,
        Number.MAX_SAFE_INTEGER,
        0
      )
    );

    const entry: RunHistoryEntry = {
      id,
      finishedAt: new Date().toISOString(),
      won,
      deckId: typeof state.deckId === 'string' && state.deckId.trim().length > 0 ? state.deckId : 'b_red',
      stake: sanitizeStakeLevel(state.stake),
      challengeId:
        typeof state.challengeId === 'string' && state.challengeId.trim().length > 0
          ? state.challengeId
          : null,
      seed: typeof state.rng?.seed === 'string' ? state.rng.seed.slice(0, 64) : '',
      ante: Math.floor(clampNum(state.ante, 0, 999, 1)),
      round: Math.floor(clampNum(state.round, 0, 9999, 0)),
      bestHand,
      jokerKeys: Array.isArray(state.jokers)
        ? state.jokers
            .map((j) => j.key)
            .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
            .slice(0, 24)
        : [],
      defeatedBy,
    };

    history.unshift(entry);
    if (history.length > MAX_RUN_HISTORY) {
      history.length = MAX_RUN_HISTORY;
    }
    this.recordedRunIds.add(id);
    return true;
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
    this.recordedRunIds.clear();
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
