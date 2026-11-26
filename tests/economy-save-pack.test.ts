import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ATLAS_KEYS,
  ATLAS_SPECS,
  DEFAULT_SETTINGS,
  MUSIC_TRACK_IDS,
  SAVE_SCHEMA_VERSION,
  SAVE_STORAGE_KEY,
  SOUND_KEYS,
} from '../src/contracts/index.ts';
import { SaveManager } from '../src/app/SaveManager.ts';
import {
  BUILTIN_MANIFEST,
  getBuiltinManifest,
  hasAtlas,
  hasSound,
} from '../src/assets/KrunkedArtPack.ts';
import { AudioEngine, createAudioEngine } from '../src/audio/AudioEngine.ts';
import { BLIND_AMOUNTS, getBlindAmount } from '../src/data/index.ts';
import { computeCashoutBreakdown, dispatchSim, generateShop, startRun } from '../src/sim/index.ts';

function enterFirstShop(deckId = 'b_red', seed = 'SHOP_TEST_1') {
  let state = startRun(deckId, 1, seed).state;
  state = dispatchSim(state, { type: 'DEBUG_MUTATE', op: 'WIN_BLIND' }).state;
  state = dispatchSim(state, { type: 'FINISH_CASHOUT' }).state;
  return state;
}

describe('Blind Scaling Formula (Antes 1-8 & Endless Antes 9-14)', () => {
  it('matches exact Scaling 1, 2, and 3 tables for Antes 1..8 and Ante 0 fallback', () => {
    expect(getBlindAmount(0, 1)).toBe(100);
    expect(getBlindAmount(-1, 3)).toBe(100);

    const expected1 = [300, 800, 2000, 5000, 11000, 20000, 35000, 50000];
    const expected2 = [300, 900, 2600, 8000, 20000, 36000, 60000, 100000];
    const expected3 = [300, 1000, 3200, 9000, 25000, 60000, 110000, 200000];

    expect(BLIND_AMOUNTS.scaling1).toEqual(expected1);
    expect(BLIND_AMOUNTS.scaling2).toEqual(expected2);
    expect(BLIND_AMOUNTS.scaling3).toEqual(expected3);

    for (let ante = 1; ante <= 8; ante++) {
      expect(getBlindAmount(ante, 1)).toBe(expected1[ante - 1]);
      expect(getBlindAmount(ante, 2)).toBe(expected2[ante - 1]);
      expect(getBlindAmount(ante, 3)).toBe(expected3[ante - 1]);
    }
  });

  it('computes exact Endless Antes 9..14 with 2-significant-digit truncation across Scaling 1/2/3', () => {
    const formulaExpected = (ante: number, scaling: 1 | 2 | 3): number => {
      const a = scaling === 3 ? 200000 : scaling === 2 ? 100000 : 50000;
      const c = ante - 8;
      const d = 1 + 0.2 * c;
      const raw = Math.floor(a * Math.pow(1.6 + Math.pow(0.75 * c, d), c));
      const pow10 = Math.pow(10, Math.floor(Math.log10(raw) - 1));
      return raw - (raw % pow10);
    };

    for (const scaling of [1, 2, 3] as const) {
      let prev = getBlindAmount(8, scaling);
      for (let ante = 9; ante <= 14; ante++) {
        const val = getBlindAmount(ante, scaling);
        expect(Number.isFinite(val)).toBe(true);
        expect(val).toBeGreaterThan(prev);
        expect(val).toBe(formulaExpected(ante, scaling));

        // Verify strict 2-significant-digit truncation (all trailing digits after top 2 are 0)
        const digits = String(val);
        expect(digits.length).toBeGreaterThanOrEqual(6);
        const trailing = digits.slice(2);
        expect(/^0+$/.test(trailing)).toBe(true);

        prev = val;
      }
    }

    // Spot-check known Endless Ante 9 values:
    // factor = 1.6 + 0.75^1.2 ~= 2.308046 -> 50k -> 115402 (110000), 100k -> 230804 (230000), 200k -> 461609 (460000)
    expect(getBlindAmount(9, 1)).toBe(110000);
    expect(getBlindAmount(9, 2)).toBe(230000);
    expect(getBlindAmount(9, 3)).toBe(460000);
  });
});

describe('Shop Generation, Rerolls, Chaos & Interest Economy', () => {
  it('guarantees Normal Buffoon Pack on first shop only and respects shop rates', () => {
    // First shop guarantees Normal Buffoon Pack in slot 0 across multiple seeds
    for (let i = 0; i < 8; i++) {
      const shopState = enterFirstShop('b_red', `BUFFOON_FIRST_${i}`);
      expect(shopState.tracking.firstShopSeen).toBe(true);
      expect(shopState.shop).not.toBeNull();
      expect(shopState.shop!.boosters.length).toBe(2);
      expect(shopState.shop!.boosters[0].kind).toBe('Buffoon');
      expect(shopState.shop!.boosters[0].size).toBe('Normal');
    }

    // Subsequent shops do NOT force Buffoon Pack in slot 0 every time
    let nonBuffoonSlot0 = 0;
    let s = enterFirstShop('b_red', 'SUBSEQUENT_SHOPS');
    for (let i = 0; i < 12; i++) {
      s = dispatchSim(s, { type: 'SHOP_NEXT_ROUND' }).state;
      s = dispatchSim(s, { type: 'DEBUG_MUTATE', op: 'WIN_BLIND' }).state;
      s = dispatchSim(s, { type: 'FINISH_CASHOUT' }).state;
      if (s.shop && s.shop.boosters[0]?.kind !== 'Buffoon') {
        nonBuffoonSlot0++;
      }
    }
    expect(nonBuffoonSlot0).toBeGreaterThan(0);

    // Base shop rates: default produces Jokers, Tarots, Planets — never Spectrals or Playing Cards
    const kindsBase = new Set<string>();
    let baseShop = enterFirstShop('b_red', 'RATES_BASE');
    baseShop = dispatchSim(baseShop, { type: 'DEBUG_MUTATE', op: 'SET_DOLLARS', amount: 500 }).state;
    for (let i = 0; i < 40; i++) {
      for (const o of baseShop.shop!.offers) kindsBase.add(o.kind);
      baseShop = dispatchSim(baseShop, { type: 'SHOP_REROLL' }).state;
    }
    expect(kindsBase.has('joker')).toBe(true);
    expect(kindsBase.has('tarot')).toBe(true);
    expect(kindsBase.has('planet')).toBe(true);
    expect(kindsBase.has('spectral')).toBe(false);
    expect(kindsBase.has('playing_card')).toBe(false);

    // Ghost Deck enables Spectrals in shop; Magic Trick enables Playing Cards in shop
    const kindsGhostMagic = new Set<string>();
    let ghostShop = enterFirstShop('b_ghost', 'RATES_GHOST_MAGIC');
    ghostShop = dispatchSim(ghostShop, { type: 'DEBUG_MUTATE', op: 'GRANT_VOUCHER', key: 'v_magic_trick' }).state;
    ghostShop = dispatchSim(ghostShop, { type: 'DEBUG_MUTATE', op: 'SET_DOLLARS', amount: 500 }).state;
    for (let i = 0; i < 60; i++) {
      for (const o of ghostShop.shop!.offers) kindsGhostMagic.add(o.kind);
      ghostShop = dispatchSim(ghostShop, { type: 'SHOP_REROLL' }).state;
    }
    expect(kindsGhostMagic.has('spectral')).toBe(true);
    expect(kindsGhostMagic.has('playing_card')).toBe(true);
  });

  it('escalates reroll cost by +$1 per paid reroll, resets next shop, and supports Chaos free reroll', () => {
    let state = enterFirstShop('b_red', 'REROLL_TEST');
    state = dispatchSim(state, { type: 'DEBUG_MUTATE', op: 'SET_DOLLARS', amount: 100 }).state;

    expect(state.rerollCost).toBe(5);
    expect(state.freeRerolls).toBe(0);

    // Paid reroll 1: costs $5, next reroll $6
    state = dispatchSim(state, { type: 'SHOP_REROLL' }).state;
    expect(state.dollars).toBe(95);
    expect(state.rerollCost).toBe(6);

    // Paid reroll 2: costs $6, next reroll $7
    state = dispatchSim(state, { type: 'SHOP_REROLL' }).state;
    expect(state.dollars).toBe(89);
    expect(state.rerollCost).toBe(7);

    // Grant Chaos the Clown before entering the next shop
    state = dispatchSim(state, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_chaos' }).state;
    state = dispatchSim(state, { type: 'SHOP_NEXT_ROUND' }).state;
    state = dispatchSim(state, { type: 'DEBUG_MUTATE', op: 'WIN_BLIND' }).state;
    state = dispatchSim(state, { type: 'FINISH_CASHOUT' }).state;

    // Next shop resets rerollCost back to $5 and grants 1 free reroll from Chaos!
    expect(state.rerollCost).toBe(5);
    expect(state.freeRerolls).toBe(1);
    const dollarsBeforeFree = state.dollars;

    // Free reroll costs $0 and does NOT increment rerollCost
    state = dispatchSim(state, { type: 'SHOP_REROLL' }).state;
    expect(state.dollars).toBe(dollarsBeforeFree);
    expect(state.freeRerolls).toBe(0);
    expect(state.rerollCost).toBe(5);

    // Next paid reroll costs $5 and escalates to $6
    state = dispatchSim(state, { type: 'SHOP_REROLL' }).state;
    expect(state.dollars).toBe(dollarsBeforeFree - 5);
    expect(state.rerollCost).toBe(6);
  });

  it('enforces exact interest caps ($25 base, $50 Seed Money, $100 Money Tree, To the Moon, Green Deck noInterest)', () => {
    const getInterest = (s: ReturnType<typeof startRun>['state']): number => {
      const breakdown = computeCashoutBreakdown(s);
      return breakdown.rows.find((r) => r.label === 'Interest')?.dollars ?? 0;
    };

    // Base cap: $25 -> max $5 interest even with $200
    let s = startRun('b_red', 1, 'INTEREST_TEST').state;
    s = dispatchSim(s, { type: 'SELECT_BLIND' }).state;
    s = dispatchSim(s, { type: 'DEBUG_MUTATE', op: 'SET_DOLLARS', amount: 200 }).state;
    expect(s.interestCap).toBe(25);
    expect(getInterest(s)).toBe(5);

    // Seed Money: cap $50 -> $10 interest
    s = dispatchSim(s, { type: 'DEBUG_MUTATE', op: 'GRANT_VOUCHER', key: 'v_seed_money' }).state;
    expect(s.interestCap).toBe(50);
    expect(getInterest(s)).toBe(10);

    // Money Tree: cap $100 -> $20 interest
    s = dispatchSim(s, { type: 'DEBUG_MUTATE', op: 'GRANT_VOUCHER', key: 'v_money_tree' }).state;
    expect(s.interestCap).toBe(100);
    expect(getInterest(s)).toBe(20);

    // To the Moon: +$1 per $5 -> $2 per $5 -> $40 interest at $100 cap
    s = dispatchSim(s, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_to_the_moon' }).state;
    expect(getInterest(s)).toBe(40);

    // Green Deck: noInterest ($0 interest even with $200), +$2 per remaining hand & +$1 per remaining discard
    let green = startRun('b_green', 1, 'GREEN_INTEREST').state;
    green = dispatchSim(green, { type: 'SELECT_BLIND' }).state;
    green = dispatchSim(green, { type: 'DEBUG_MUTATE', op: 'SET_DOLLARS', amount: 200 }).state;
    expect(green.tracking.noInterest).toBe(true);
    expect(getInterest(green)).toBe(0);
    const greenCashout = computeCashoutBreakdown(green);
    const handRow = greenCashout.rows.find((r) => r.label === 'Remaining Hands');
    const discRow = greenCashout.rows.find((r) => r.label === 'Remaining Discards');
    expect(handRow?.dollars).toBe(green.handsLeft * 2);
    expect(discRow?.dollars).toBe(green.discardsLeft * 1);

    // Sanity check generateShop directly does not crash
    const directShop = generateShop(s);
    expect(directShop.offers.length).toBeGreaterThanOrEqual(2);
  });
});

describe('SaveManager — Schema Validation & Corruption Recovery', () => {
  let store: Map<string, string>;
  let prevLocalStorage: Storage | undefined;

  beforeEach(() => {
    store = new Map<string, string>();
    prevLocalStorage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    const mockStorage: Storage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      removeItem: (k: string) => {
        store.delete(k);
      },
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    if (prevLocalStorage === undefined) {
      delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
    } else {
      Object.defineProperty(globalThis, 'localStorage', {
        value: prevLocalStorage,
        configurable: true,
        writable: true,
      });
    }
  });

  it('persists and reloads valid settings, discoveries, and active runs under krunked_cards_save_v1', () => {
    expect(SAVE_STORAGE_KEY).toBe('krunked_cards_save_v1');
    const mgr = new SaveManager();

    mgr.updateSettings({ gameSpeed: 4, crtAmount: 55, highContrastSuits: true, masterVolume: 0.4 });
    mgr.recordRunStarted();

    let run = startRun('b_blue', 3, 'SAVE_RUN_SEED').state;
    run = dispatchSim(run, { type: 'DEBUG_MUTATE', op: 'GRANT_JOKER', key: 'j_blueprint' }).state;
    run = dispatchSim(run, { type: 'DEBUG_MUTATE', op: 'GRANT_VOUCHER', key: 'v_overstock_norm' }).state;
    run = dispatchSim(run, { type: 'SELECT_BLIND' }).state;

    mgr.saveRun(run);
    mgr.recordRunWon(run);

    const raw = store.get('krunked_cards_save_v1');
    expect(raw).toBeTruthy();

    // Reload into a fresh SaveManager instance
    const reloaded = new SaveManager();
    expect(reloaded.getData().version).toBe(SAVE_SCHEMA_VERSION);
    expect(reloaded.getSettings().gameSpeed).toBe(4);
    expect(reloaded.getSettings().crtAmount).toBe(55);
    expect(reloaded.getSettings().highContrastSuits).toBe(true);
    expect(reloaded.getSettings().masterVolume).toBe(0.4);
    expect(reloaded.getProfile().runsPlayed).toBe(1);
    expect(reloaded.getProfile().runsWon).toBe(1);
    expect(reloaded.getProfile().deckMaxStake['b_blue']).toBe(3);
    expect(reloaded.getProfile().discoveredJokers).toContain('j_blueprint');
    expect(reloaded.getProfile().discoveredVouchers).toContain('v_overstock_norm');
    expect(reloaded.getActiveRun()?.deckId).toBe('b_blue');

    // Saving a GAME_OVER state clears activeRun cleanly
    const gameOverRun = dispatchSim(run, { type: 'DEBUG_MUTATE', op: 'LOSE_BLIND' }).state;
    reloaded.saveRun(gameOverRun);
    expect(reloaded.getActiveRun()).toBeNull();
  });

  it('cleanly recovers from malformed JSON, bad schema version, and missing/invalid fields without throwing', () => {
    // 1. Malformed JSON
    store.set(SAVE_STORAGE_KEY, '{not valid json!!!');
    const m1 = new SaveManager();
    expect(m1.getData().version).toBe(SAVE_SCHEMA_VERSION);
    expect(m1.getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(m1.getActiveRun()).toBeNull();
    expect(() => JSON.parse(store.get(SAVE_STORAGE_KEY)!)).not.toThrow();

    // 2. Bad schema version
    store.set(
      SAVE_STORAGE_KEY,
      JSON.stringify({ version: 999, settings: { gameSpeed: 4 }, profile: {}, activeRun: null })
    );
    const m2 = new SaveManager();
    expect(m2.getData().version).toBe(SAVE_SCHEMA_VERSION);
    expect(m2.getSettings().gameSpeed).toBe(DEFAULT_SETTINGS.gameSpeed);

    // 3. Missing & corrupted nested fields (version matches, fields invalid)
    store.set(
      SAVE_STORAGE_KEY,
      JSON.stringify({
        version: SAVE_SCHEMA_VERSION,
        settings: {
          targetFps: 999,
          gameSpeed: 99,
          crtAmount: -500,
          masterVolume: 999,
          artPackMode: 'invalid_mode',
          keybinds: { playHand: 12345 },
        },
        profile: {
          discoveredJokers: ['j_joker', 42, 'j_joker', null],
          deckMaxStake: { b_red: 5, b_bad: 99, b_neg: -1 },
          runsPlayed: -10,
        },
        activeRun: { phase: 'TITLE', ante: 'bad' },
      })
    );
    const m3 = new SaveManager();
    expect(m3.getSettings().targetFps).toBe(DEFAULT_SETTINGS.targetFps);
    expect(m3.getSettings().gameSpeed).toBe(DEFAULT_SETTINGS.gameSpeed);
    expect(m3.getSettings().crtAmount).toBe(0);
    expect(m3.getSettings().masterVolume).toBe(1);
    expect(m3.getSettings().artPackMode).toBe('builtin');
    expect(m3.getSettings().keybinds.playHand).toBe(DEFAULT_SETTINGS.keybinds.playHand);
    expect(m3.getProfile().discoveredJokers).toEqual(['j_joker']);
    expect(m3.getProfile().deckMaxStake).toEqual({ b_red: 5 });
    expect(m3.getProfile().runsPlayed).toBe(0);
    expect(m3.getActiveRun()).toBeNull();
  });
});

describe('KrunkedArtPack & AudioEngine Headless Node Safety', () => {
  it('resolves all 15 built-in atlases and all 80 sound keys cleanly in Node', () => {
    const manifest = getBuiltinManifest();
    expect(manifest.source).toBe('builtin');
    expect(manifest.version).toBe(1);
    expect(Object.keys(manifest.textures)).toHaveLength(15);
    expect(Object.keys(manifest.sounds)).toHaveLength(80);
    expect(BUILTIN_MANIFEST.textures).toEqual(manifest.textures);

    for (const key of ATLAS_KEYS) {
      expect(hasAtlas(key)).toBe(true);
      const spec = ATLAS_SPECS[key];
      const tex = manifest.textures[key];
      expect(tex.url1x).toBe(`builtin://textures/1x/${key}`);
      expect(tex.url2x).toBe(`builtin://textures/2x/${key}`);
      expect(tex.width1x).toBe(spec.cols * spec.cellW);
      expect(tex.height1x).toBe(spec.rows * spec.cellH);
      expect(tex.cellW).toBe(spec.cellW);
      expect(tex.cellH).toBe(spec.cellH);
    }

    for (const soundKey of SOUND_KEYS) {
      expect(hasSound(soundKey)).toBe(true);
      expect(manifest.sounds[soundKey]).toBe(`builtin://sounds/${soundKey}`);
    }

    expect(Array.isArray(manifest.shaders)).toBe(true);
    expect(manifest.shaders!.length).toBeGreaterThanOrEqual(10);
  });

  it('exercises AudioEngine lifecycle and all 80 sound keys in headless Node with zero throws', async () => {
    const audio = createAudioEngine();
    expect(audio).toBeInstanceOf(AudioEngine);
    expect(audio.getMode()).toBe('builtin');

    await expect(audio.unlock()).resolves.toBeUndefined();
    expect(() =>
      audio.setSettings({ masterVolume: 0.7, musicVolume: 0.5, sfxVolume: 0.9 })
    ).not.toThrow();

    for (const track of MUSIC_TRACK_IDS) {
      expect(() => audio.setMusicContext(track, 0.75)).not.toThrow();
    }
    expect(() => audio.setFireIntensity(0.9)).not.toThrow();

    for (const soundKey of SOUND_KEYS) {
      expect(() => audio.playSfx(soundKey, { pitch: 1.05, volume: 0.8 })).not.toThrow();
    }

    expect(() => {
      audio.update(1 / 60);
      audio.update(0.05);
      audio.update(0);
      audio.update(-1);
      audio.update(Number.NaN);
    }).not.toThrow();

    await expect(audio.setCustomPack(BUILTIN_MANIFEST.sounds)).resolves.toBeUndefined();
    expect(audio.getMode()).toBe('custom');
    expect(() => audio.playSfx('chips1')).not.toThrow();

    await expect(audio.setCustomPack(null)).resolves.toBeUndefined();
    expect(audio.getMode()).toBe('builtin');

    expect(() => audio.dispose()).not.toThrow();
    // Safe idempotent calls after dispose
    expect(() => audio.playSfx('button')).not.toThrow();
    expect(() => audio.update(1 / 60)).not.toThrow();
    expect(() => audio.dispose()).not.toThrow();
  });
});
