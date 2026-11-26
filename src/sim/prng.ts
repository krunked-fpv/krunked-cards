import type { RngState } from '../contracts/index.ts';

/**
 * Deterministic string-to-unit-interval hash matching keyed stream semantics.
 * Guaranteed finite and strictly within [0, 1).
 */
export function pseudohash(str: string): number {
  if (!str || str.length === 0) return 0.5;
  let num = 1;
  for (let i = str.length; i >= 1; i--) {
    const code = str.charCodeAt(i - 1);
    const safeNum = num === 0 || !Number.isFinite(num) ? 0.5 : num;
    num = ((1.1239285023 / safeNum) * code * Math.PI + Math.PI * i) % 1;
    if (!Number.isFinite(num)) num = 0.5;
  }
  const normalized = num < 0 ? num + 1 : num;
  return normalized >= 1 ? normalized % 1 : normalized;
}

/**
 * Initialize a deterministic RNG state from a seed string.
 */
export function createRngState(seed = 'KRUNKED1'): RngState {
  const cleanSeed = typeof seed === 'string' && seed.trim().length > 0 ? seed.trim() : 'KRUNKED1';
  return {
    seed: cleanSeed,
    hashedSeed: pseudohash(cleanSeed),
    streams: {},
    calls: 0,
  };
}

/**
 * Advance a named keyed stream stored in RngState.streams and return the mixed
 * pseudoseed value in [0, 1). Independent keys never perturb each other's stream.
 */
export function pseudoseed(rng: RngState, key: string): number {
  const streamKey = key || 'default';
  if (rng.streams[streamKey] === undefined || !Number.isFinite(rng.streams[streamKey])) {
    rng.streams[streamKey] = pseudohash(streamKey + rng.seed);
  }
  const raw = (2.134453429141 + rng.streams[streamKey] * 1.72431234) % 1;
  const rounded = Math.round(Math.abs(raw) * 1e13) / 1e13;
  rng.streams[streamKey] = rounded >= 1 ? rounded % 1 : rounded;
  rng.calls += 1;

  const combined = (rng.streams[streamKey] + rng.hashedSeed) * 0.5;
  return combined >= 1 ? combined % 1 : combined;
}

/**
 * Deterministic 32-bit SplitMix/Murmur3 finalizer turning a unit-interval float
 * into a uniformly distributed float strictly in [0, 1).
 */
function mixUnitFloat(val: number): number {
  const clamped = Number.isFinite(val) ? val - Math.floor(val) : 0.5;
  const scaled = clamped * 4294967296;
  const hi = Math.floor(scaled) >>> 0;
  const lo = Math.floor((scaled - hi) * 4294967296) >>> 0;
  let z = (hi ^ Math.imul(lo ^ 0x9e3779b9, 0x85ebca6b)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  z = (z ^ (z >>> 16)) >>> 0;
  return z / 4294967296;
}

/**
 * Draw next deterministic uniform float in [0, 1) from the specified keyed stream.
 */
export function nextRandom(rng: RngState, key: string): number {
  const ps = pseudoseed(rng, key);
  const out = mixUnitFloat(ps);
  return out >= 1 ? 0 : out < 0 ? 0 : out;
}

/**
 * Draw next deterministic integer in [0, max - 1]. Returns 0 when max <= 1.
 */
export function nextRandomInt(rng: RngState, key: string, max: number): number {
  const safeMax = Math.floor(max);
  if (!Number.isFinite(safeMax) || safeMax <= 1) return 0;
  const n = Math.floor(nextRandom(rng, key) * safeMax);
  if (n < 0) return 0;
  if (n >= safeMax) return safeMax - 1;
  return n;
}

/**
 * Deterministic Fisher-Yates shuffle returning a new array.
 */
export function shuffleDeterministic<T>(arr: readonly T[], rng: RngState, key: string): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = nextRandomInt(rng, key, i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * Pick one element uniformly at random using the keyed stream.
 */
export function pickRandom<T>(arr: readonly T[], rng: RngState, key: string): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[nextRandomInt(rng, key, arr.length)];
}

/**
 * Deterministic weighted pick from items with positive weights.
 */
export function weightedPick<T>(
  entries: readonly { item: T; weight: number }[],
  rng: RngState,
  key: string
): T | undefined {
  let total = 0;
  for (let i = 0; i < entries.length; i++) {
    const w = entries[i].weight;
    if (Number.isFinite(w) && w > 0) total += w;
  }
  if (total <= 0) return entries[0]?.item;
  let roll = nextRandom(rng, key) * total;
  for (let i = 0; i < entries.length; i++) {
    const w = entries[i].weight;
    if (!Number.isFinite(w) || w <= 0) continue;
    roll -= w;
    if (roll < 0) return entries[i].item;
  }
  return entries[entries.length - 1]?.item;
}
