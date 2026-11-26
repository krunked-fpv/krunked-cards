import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ATLAS_KEYS,
  ATLAS_SPECS,
  POKER_HAND_IDS,
  SOUND_KEYS,
  type AtlasKey,
  type AtlasPos,
  type PokerHandId,
} from '../src/contracts/index.ts';
import {
  OUTPUT_DIR_NAME,
  openFusedZip,
  readPngDimensions,
  resolveExePath,
} from './extract-assets.ts';

// ============================================================================
// Lightweight Recursive-Descent Lua Table Literal Parser
// Supports comments (-- and --[=[...]=]), strings ('', "", [=[...]=]),
// numbers (int/float/sci/hex/unary), booleans, nil, tables (array & map),
// HEX('rrggbb'), localize('key'), and simple dotted identifiers/calls.
// ============================================================================

type LuaValue =
  | null
  | boolean
  | number
  | string
  | LuaValue[]
  | { [key: string]: LuaValue };

type LuaObj = { [key: string]: LuaValue };

class LuaParser {
  private readonly src: string;
  private pos: number;

  constructor(src: string, startPos = 0) {
    this.src = src;
    this.pos = startPos;
  }

  get offset(): number {
    return this.pos;
  }

  private eof(): boolean {
    return this.pos >= this.src.length;
  }

  private peek(delta = 0): string {
    return this.src[this.pos + delta] ?? '';
  }

  private matchLongBracketOpen(): number {
    if (this.peek() !== '[') return -1;
    let i = this.pos + 1;
    while (i < this.src.length && this.src[i] === '=') i++;
    if (this.src[i] === '[') {
      return i - (this.pos + 1);
    }
    return -1;
  }

  private readLongBracket(eqCount: number): string {
    this.pos += eqCount + 2; // skip [==[
    if (this.peek() === '\r' && this.peek(1) === '\n') {
      this.pos += 2;
    } else if (this.peek() === '\n') {
      this.pos += 1;
    }
    const closeTag = `]${'='.repeat(eqCount)}]`;
    const endIdx = this.src.indexOf(closeTag, this.pos);
    if (endIdx < 0) {
      throw new Error(`Unterminated Lua long bracket near offset ${this.pos}`);
    }
    const content = this.src.slice(this.pos, endIdx);
    this.pos = endIdx + closeTag.length;
    return content;
  }

  skipTrivia(): void {
    while (!this.eof()) {
      const ch = this.peek();
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        this.pos++;
        continue;
      }
      if (ch === '-' && this.peek(1) === '-') {
        this.pos += 2;
        const eqCount = this.matchLongBracketOpen();
        if (eqCount >= 0) {
          this.readLongBracket(eqCount);
        } else {
          while (!this.eof() && this.peek() !== '\n') {
            this.pos++;
          }
        }
        continue;
      }
      break;
    }
  }

  private readQuotedString(quote: string): string {
    this.pos++; // skip opening quote
    let out = '';
    while (!this.eof()) {
      const ch = this.src[this.pos++];
      if (ch === quote) return out;
      if (ch === '\\') {
        if (this.eof()) break;
        const esc = this.src[this.pos++];
        switch (esc) {
          case 'n':
            out += '\n';
            break;
          case 'r':
            out += '\r';
            break;
          case 't':
            out += '\t';
            break;
          case '\\':
            out += '\\';
            break;
          case '\'':
            out += '\'';
            break;
          case '"':
            out += '"';
            break;
          case '\n':
            out += '\n';
            break;
          case '\r':
            if (this.peek() === '\n') this.pos++;
            out += '\n';
            break;
          default:
            out += esc;
            break;
        }
      } else {
        out += ch;
      }
    }
    throw new Error(`Unterminated Lua string near offset ${this.pos}`);
  }

  private readIdentifier(): string {
    const start = this.pos;
    while (!this.eof() && /[A-Za-z0-9_]/.test(this.peek())) {
      this.pos++;
    }
    return this.src.slice(start, this.pos);
  }

  private readNumber(): number {
    const start = this.pos;
    if (this.peek() === '-' || this.peek() === '+') this.pos++;
    if (this.peek() === '0' && (this.peek(1) === 'x' || this.peek(1) === 'X')) {
      this.pos += 2;
      while (!this.eof() && /[0-9a-fA-F]/.test(this.peek())) this.pos++;
      return Number.parseInt(this.src.slice(start, this.pos), 16);
    }
    while (!this.eof() && /[0-9]/.test(this.peek())) this.pos++;
    if (this.peek() === '.' && /[0-9]/.test(this.peek(1))) {
      this.pos++;
      while (!this.eof() && /[0-9]/.test(this.peek())) this.pos++;
    } else if (this.peek() === '.') {
      this.pos++;
    }
    if (this.peek() === 'e' || this.peek() === 'E') {
      this.pos++;
      if (this.peek() === '+' || this.peek() === '-') this.pos++;
      while (!this.eof() && /[0-9]/.test(this.peek())) this.pos++;
    }
    const raw = this.src.slice(start, this.pos);
    const num = Number(raw);
    if (Number.isNaN(num)) {
      throw new Error(`Invalid Lua number "${raw}" near offset ${start}`);
    }
    return num;
  }

  private parsePrimary(): LuaValue {
    this.skipTrivia();
    const ch = this.peek();

    if (ch === '{') {
      return this.parseTable();
    }
    if (ch === '\'' || ch === '"') {
      return this.readQuotedString(ch);
    }
    if (ch === '[') {
      const eqCount = this.matchLongBracketOpen();
      if (eqCount >= 0) {
        return this.readLongBracket(eqCount);
      }
    }
    if (ch === '(') {
      this.pos++;
      const inner = this.parseExpression();
      this.skipTrivia();
      if (this.peek() === ')') this.pos++;
      return inner;
    }
    if (
      (ch >= '0' && ch <= '9') ||
      (ch === '.' && this.peek(1) >= '0' && this.peek(1) <= '9')
    ) {
      return this.readNumber();
    }
    if (ch === '-' || ch === '+') {
      const sign = ch;
      this.pos++;
      const operand = this.parsePrimary();
      if (typeof operand === 'number') {
        return sign === '-' ? -operand : operand;
      }
      return `${sign}${String(operand)}`;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const ident = this.readIdentifier();
      if (ident === 'true') return true;
      if (ident === 'false') return false;
      if (ident === 'nil') return null;

      // Handle dotted path, indexing, and function calls (e.g. HEX('a84024'), localize('...'), Sprite(...))
      let fullRef = ident;
      while (true) {
        this.skipTrivia();
        if (this.peek() === '.') {
          this.pos++;
          this.skipTrivia();
          fullRef += '.' + this.readIdentifier();
          continue;
        }
        if (this.peek() === '[') {
          this.pos++;
          const idx = this.parseExpression();
          this.skipTrivia();
          if (this.peek() === ']') this.pos++;
          fullRef += `[${String(idx)}]`;
          continue;
        }
        if (this.peek() === '(') {
          this.pos++;
          const args: LuaValue[] = [];
          this.skipTrivia();
          while (!this.eof() && this.peek() !== ')') {
            args.push(this.parseExpression());
            this.skipTrivia();
            if (this.peek() === ',') {
              this.pos++;
              this.skipTrivia();
            } else {
              break;
            }
          }
          if (this.peek() === ')') this.pos++;

          if (fullRef === 'HEX' && typeof args[0] === 'string') {
            const hex = args[0].replace(/^#/, '');
            return `#${hex}`;
          }
          if (fullRef === 'localize' && typeof args[0] === 'string') {
            return args[0];
          }
          return { __call: fullRef, args };
        }
        break;
      }
      return fullRef;
    }

    throw new Error(
      `Unexpected token "${this.src.slice(this.pos, this.pos + 24)}" near offset ${this.pos}`
    );
  }

  parseExpression(): LuaValue {
    let left = this.parsePrimary();
    while (true) {
      this.skipTrivia();
      const ch = this.peek();
      const ch2 = this.peek(1);
      if (ch === '.' && ch2 === '.') {
        this.pos += 2;
        const right = this.parsePrimary();
        left = `${String(left ?? '')}${String(right ?? '')}`;
        continue;
      }
      if (
        (ch === '+' || ch === '-' || ch === '*' || ch === '/') &&
        !(ch === '-' && ch2 === '-')
      ) {
        this.pos++;
        const right = this.parsePrimary();
        if (typeof left === 'number' && typeof right === 'number') {
          if (ch === '+') left = left + right;
          else if (ch === '-') left = left - right;
          else if (ch === '*') left = left * right;
          else if (ch === '/') left = left / right;
        }
        continue;
      }
      break;
    }
    return left;
  }

  parseTable(): LuaValue {
    this.skipTrivia();
    if (this.peek() !== '{') {
      throw new Error(`Expected '{' at offset ${this.pos}`);
    }
    this.pos++; // skip '{'

    const obj: LuaObj = {};
    const arr: LuaValue[] = [];
    let hasNamedKeys = false;
    let arrayIndex = 1;

    while (!this.eof()) {
      this.skipTrivia();
      if (this.peek() === '}') {
        this.pos++;
        break;
      }

      // Check for `[expr] = value`
      if (this.peek() === '[' && this.matchLongBracketOpen() < 0) {
        this.pos++;
        const keyVal = this.parseExpression();
        this.skipTrivia();
        if (this.peek() !== ']') {
          throw new Error(`Expected ']' in table key near offset ${this.pos}`);
        }
        this.pos++;
        this.skipTrivia();
        if (this.peek() !== '=') {
          throw new Error(`Expected '=' after table key near offset ${this.pos}`);
        }
        this.pos++;
        const val = this.parseExpression();
        obj[String(keyVal)] = val;
        hasNamedKeys = true;
      } else if (/[A-Za-z_]/.test(this.peek())) {
        // Look ahead to see if this is `ident = value`
        const savedPos = this.pos;
        const ident = this.readIdentifier();
        this.skipTrivia();
        if (this.peek() === '=' && this.peek(1) !== '=') {
          this.pos++;
          const val = this.parseExpression();
          obj[ident] = val;
          hasNamedKeys = true;
        } else {
          // Positional expression starting with identifier
          this.pos = savedPos;
          const val = this.parseExpression();
          arr.push(val);
          obj[String(arrayIndex++)] = val;
        }
      } else {
        const val = this.parseExpression();
        arr.push(val);
        obj[String(arrayIndex++)] = val;
      }

      this.skipTrivia();
      if (this.peek() === ',' || this.peek() === ';') {
        this.pos++;
      } else if (this.peek() === '}') {
        this.pos++;
        break;
      } else {
        throw new Error(
          `Expected ',', ';', or '}' in table near offset ${this.pos}: ${this.src.slice(this.pos, this.pos + 32)}`
        );
      }
    }

    if (!hasNamedKeys) {
      return arr;
    }
    return obj;
  }
}

/**
 * Strip Lua comments while preserving string contents and character offsets
 * (replacing comment characters with spaces) so regex searches never match
 * commented-out declarations.
 */
function maskLuaComments(src: string): string {
  const chars = src.split('');
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === '\'' || ch === '"') {
      const q = ch;
      i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') i += 2;
        else i++;
      }
      i++;
      continue;
    }
    if (ch === '-' && src[i + 1] === '-') {
      const start = i;
      i += 2;
      if (src[i] === '[') {
        let j = i + 1;
        while (j < n && src[j] === '=') j++;
        if (src[j] === '[') {
          const eqs = j - (i + 1);
          const close = `]${'='.repeat(eqs)}]`;
          const end = src.indexOf(close, j + 1);
          i = end >= 0 ? end + close.length : n;
        } else {
          while (i < n && src[i] !== '\n') i++;
        }
      } else {
        while (i < n && src[i] !== '\n') i++;
      }
      for (let k = start; k < i; k++) {
        if (chars[k] !== '\n' && chars[k] !== '\r') chars[k] = ' ';
      }
      continue;
    }
    i++;
  }
  return chars.join('');
}

function parseTableAfterPattern(src: string, pattern: RegExp, label: string): LuaValue {
  const masked = maskLuaComments(src);
  const match = pattern.exec(masked);
  if (!match) {
    throw new Error(`Pattern not found for ${label}`);
  }
  const braceIndex = src.indexOf('{', match.index + match[0].length - 1);
  if (braceIndex < 0) {
    throw new Error(`Opening '{' not found for ${label}`);
  }
  const parser = new LuaParser(src, braceIndex);
  return parser.parseTable();
}

// ============================================================================
// Type helpers
// ============================================================================

function asObj(val: LuaValue | undefined): LuaObj {
  if (val && typeof val === 'object' && !Array.isArray(val)) return val as LuaObj;
  return {};
}

function asArray(val: LuaValue | undefined): LuaValue[] {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') {
    const obj = val as LuaObj;
    const numericKeys = Object.keys(obj)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => Number(a) - Number(b));
    return numericKeys.map((k) => obj[k]);
  }
  return [];
}

function asPos(val: LuaValue | undefined): AtlasPos {
  const o = asObj(val);
  return {
    x: typeof o.x === 'number' ? o.x : 0,
    y: typeof o.y === 'number' ? o.y : 0,
  };
}

function formatLocDesc(entry: LuaValue | undefined): string[] {
  const o = asObj(entry);
  const text = asArray(o.text);
  return text.map((line) => String(line ?? ''));
}

function getLocName(entry: LuaValue | undefined, fallback: string): string {
  const o = asObj(entry);
  return typeof o.name === 'string' && o.name.length > 0 ? o.name : fallback;
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`Oracle parity assertion failed for ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

// ============================================================================
// Oracle Schema & Extraction
// ============================================================================

export interface OracleCounts {
  jokers: number;
  jokersByRarity: Record<1 | 2 | 3 | 4, number>;
  decks: number;
  stakes: number;
  challenges: number;
  blinds: number;
  blindsByKind: {
    smallBig: number;
    regularBoss: number;
    showdownBoss: number;
  };
  tarots: number;
  planets: number;
  spectrals: number;
  vouchers: number;
  boosters: number;
  tags: number;
  enhancements: number;
  editions: number;
  seals: number;
  pokerHands: number;
  sounds: number;
  shaders: number;
}

export interface OracleData {
  generatedAt: string;
  counts: OracleCounts;
  pokerHands: Array<{
    id: PokerHandId;
    chips: number;
    mult: number;
    lChips: number;
    lMult: number;
    visible: boolean;
    order: number;
    example: Array<[string, boolean]>;
    rawDesc: string[];
  }>;
  blindAmounts: {
    scaling1: number[];
    scaling2: number[];
    scaling3: number[];
  };
  jokers: Array<{
    key: string;
    name: string;
    order: number;
    rarity: 1 | 2 | 3 | 4;
    cost: number;
    pos: AtlasPos;
    soulPos?: AtlasPos;
    blueprintCompat: boolean;
    perishableCompat: boolean;
    eternalCompat: boolean;
    effect?: string;
    config: LuaObj;
    rawDesc: string[];
  }>;
  tarots: Array<{
    key: string;
    name: string;
    order: number;
    cost: number;
    pos: AtlasPos;
    effect?: string;
    config: LuaObj;
    rawDesc: string[];
  }>;
  planets: Array<{
    key: string;
    name: string;
    order: number;
    cost: number;
    pos: AtlasPos;
    effect?: string;
    softlocked: boolean;
    config: LuaObj;
    rawDesc: string[];
  }>;
  spectrals: Array<{
    key: string;
    name: string;
    order: number;
    cost: number;
    pos: AtlasPos;
    effect?: string;
    hidden: boolean;
    config: LuaObj;
    rawDesc: string[];
  }>;
  vouchers: Array<{
    key: string;
    name: string;
    order: number;
    cost: number;
    pos: AtlasPos;
    requires?: string[];
    config: LuaObj;
    rawDesc: string[];
  }>;
  boosters: Array<{
    key: string;
    name: string;
    kind: string;
    order: number;
    cost: number;
    weight: number;
    pos: AtlasPos;
    config: LuaObj;
    rawDesc: string[];
  }>;
  blinds: Array<{
    key: string;
    name: string;
    order: number;
    kind: 'small_big' | 'regular_boss' | 'showdown_boss';
    showdown: boolean;
    minAnte: number;
    maxAnte: number;
    mult: number;
    dollars: number;
    bossColor: string | null;
    pos: AtlasPos;
    debuff: LuaObj;
    rawDesc: string[];
  }>;
  tags: Array<{
    key: string;
    name: string;
    order: number;
    minAnte: number | null;
    requires?: string;
    pos: AtlasPos;
    config: LuaObj;
    rawDesc: string[];
  }>;
  decks: Array<{
    key: string;
    name: string;
    order: number;
    pos: AtlasPos;
    config: LuaObj;
    rawDesc: string[];
  }>;
  stakes: Array<{
    key: string;
    name: string;
    order: number;
    stakeLevel: number;
    pos: AtlasPos;
    rawDesc: string[];
  }>;
  challenges: Array<{
    key: string;
    name: string;
    order: number;
    rules: LuaObj;
    jokers: LuaValue[];
    consumables: LuaValue[];
    vouchers: LuaValue[];
    deck: LuaObj;
    restrictions: LuaObj;
  }>;
  enhancements: Array<{
    key: string;
    name: string;
    order: number;
    pos: AtlasPos;
    effect: string;
    label: string;
    config: LuaObj;
    rawDesc: string[];
  }>;
  editions: Array<{
    key: string;
    name: string;
    order: number;
    pos: AtlasPos;
    config: LuaObj;
    rawDesc: string[];
  }>;
  seals: Array<{
    key: string;
    name: string;
    order: number;
    pos: AtlasPos;
    rawDesc: string[];
  }>;
  atlasDimensions: Record<
    AtlasKey,
    {
      width1x: number;
      height1x: number;
      width2x: number;
      height2x: number;
      cellW: number;
      cellH: number;
      cols: number;
      rows: number;
    }
  >;
  soundKeys: string[];
  shaders: string[];
  sourceHooks: {
    paletteHex: Record<string, string>;
    blindHookKeys: string[];
    tagTriggerTypes: string[];
    backEffectNames: string[];
  };
}

function parseBlindAmounts(miscLua: string): {
  scaling1: number[];
  scaling2: number[];
  scaling3: number[];
} {
  const masked = maskLuaComments(miscLua);
  const fnMatch = /function\s+get_blind_amount\s*\(\s*ante\s*\)/.exec(masked);
  if (!fnMatch) {
    throw new Error('Could not find get_blind_amount(ante) in functions/misc_functions.lua');
  }
  const slice = miscLua.slice(fnMatch.index, fnMatch.index + 2400);
  const maskedSlice = masked.slice(fnMatch.index, fnMatch.index + 2400);

  const tables: number[][] = [];
  const amountsRegex = /local\s+amounts\s*=\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = amountsRegex.exec(maskedSlice)) !== null) {
    const bracePos = slice.indexOf('{', m.index);
    const parsed = new LuaParser(slice, bracePos).parseTable();
    const nums = asArray(parsed).map((v) => {
      if (typeof v !== 'number') {
        throw new Error(`Non-numeric blind amount: ${String(v)}`);
      }
      return v;
    });
    tables.push(nums);
  }

  if (tables.length < 3) {
    throw new Error(`Expected 3 scaling tables in get_blind_amount, found ${tables.length}`);
  }

  return {
    scaling1: tables[0],
    scaling2: tables[1],
    scaling3: tables[2],
  };
}

function extractRegexUnique(src: string, regex: RegExp): string[] {
  const masked = maskLuaComments(src);
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = regex.exec(masked)) !== null) {
    if (m[1]) found.add(m[1]);
  }
  return Array.from(found).sort((a, b) => a.localeCompare(b));
}

export function generateOracle(exePath: string): OracleData {
  const archive = openFusedZip(exePath);

  // Read all key Lua files strictly in memory
  const gameLua = archive.readText('game.lua');
  const globalsLua = archive.readText('globals.lua');
  const challengesLua = archive.readText('challenges.lua');
  const miscLua = archive.readText('functions/misc_functions.lua');
  const enUsLua = archive.readText('localization/en-us.lua');
  const blindLua = archive.readText('blind.lua');
  const tagLua = archive.readText('tag.lua');
  const backLua = archive.readText('back.lua');

  // Parse localization/en-us.lua
  const locRoot = asObj(parseTableAfterPattern(enUsLua, /\breturn\s*\{/, 'localization/en-us.lua'));
  const locDesc = asObj(locRoot.descriptions);
  const locMisc = asObj(locRoot.misc);

  const locJokers = asObj(locDesc.Joker);
  const locTarots = asObj(locDesc.Tarot);
  const locPlanets = asObj(locDesc.Planet);
  const locSpectrals = asObj(locDesc.Spectral);
  const locVouchers = asObj(locDesc.Voucher);
  const locBlinds = asObj(locDesc.Blind);
  const locTags = asObj(locDesc.Tag);
  const locBacks = asObj(locDesc.Back);
  const locStakes = asObj(locDesc.Stake);
  const locEnhanced = asObj(locDesc.Enhanced);
  const locEdition = asObj(locDesc.Edition);
  const locOther = asObj(locDesc.Other);
  const locChallengeNames = asObj(locMisc.challenge_names);
  const locHandDescs = asObj(locMisc.poker_hand_descriptions);

  // Parse prototype tables from game.lua
  const pSeals = asObj(parseTableAfterPattern(gameLua, /self\.P_SEALS\s*=\s*\{/, 'self.P_SEALS'));
  const pTags = asObj(parseTableAfterPattern(gameLua, /self\.P_TAGS\s*=\s*\{/, 'self.P_TAGS'));
  const pStakes = asObj(parseTableAfterPattern(gameLua, /self\.P_STAKES\s*=\s*\{/, 'self.P_STAKES'));
  const pBlinds = asObj(parseTableAfterPattern(gameLua, /self\.P_BLINDS\s*=\s*\{/, 'self.P_BLINDS'));
  const pCenters = asObj(parseTableAfterPattern(gameLua, /self\.P_CENTERS\s*=\s*\{/, 'self.P_CENTERS'));
  const sharedSeals = asObj(
    parseTableAfterPattern(gameLua, /self\.shared_seals\s*=\s*\{/, 'self.shared_seals')
  );
  const rawHands = asObj(parseTableAfterPattern(gameLua, /\bhands\s*=\s*\{/, 'init_game_object hands'));

  // Parse globals.lua colors
  const rawColors = asObj(parseTableAfterPattern(globalsLua, /self\.C\s*=\s*\{/, 'globals.lua self.C'));
  const paletteHex: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawColors)) {
    if (typeof v === 'string' && v.startsWith('#')) {
      paletteHex[k] = v;
    }
  }

  // Parse challenges.lua
  const rawChallenges = asArray(
    parseTableAfterPattern(challengesLua, /G\.CHALLENGES\s*=\s*\{/, 'G.CHALLENGES')
  );

  // Parse blind scaling amounts from functions/misc_functions.lua
  const blindAmounts = parseBlindAmounts(miscLua);

  // Build Poker Hands (12)
  const pokerHands: OracleData['pokerHands'] = Object.entries(rawHands)
    .map(([id, rawVal]) => {
      const v = asObj(rawVal);
      const example = asArray(v.example).map((pair) => {
        const pairArr = asArray(pair);
        return [String(pairArr[0] ?? ''), Boolean(pairArr[1])] as [string, boolean];
      });
      return {
        id: id as PokerHandId,
        chips: Number(v.chips),
        mult: Number(v.mult),
        lChips: Number(v.l_chips),
        lMult: Number(v.l_mult),
        visible: Boolean(v.visible),
        order: Number(v.order),
        example,
        rawDesc: asArray(locHandDescs[id]).map((s) => String(s ?? '')),
      };
    })
    .sort((a, b) => a.order - b.order);

  // Partition P_CENTERS by set
  const jokers: OracleData['jokers'] = [];
  const tarots: OracleData['tarots'] = [];
  const planets: OracleData['planets'] = [];
  const spectrals: OracleData['spectrals'] = [];
  const vouchers: OracleData['vouchers'] = [];
  const boosters: OracleData['boosters'] = [];
  const decks: OracleData['decks'] = [];
  const enhancements: OracleData['enhancements'] = [];
  const editions: OracleData['editions'] = [];

  for (const [key, rawVal] of Object.entries(pCenters)) {
    const v = asObj(rawVal);
    const set = typeof v.set === 'string' ? v.set : '';

    if (set === 'Joker') {
      const rarity = Number(v.rarity) as 1 | 2 | 3 | 4;
      const entry: OracleData['jokers'][number] = {
        key,
        name: getLocName(locJokers[key], String(v.name ?? key)),
        order: Number(v.order),
        rarity,
        cost: Number(v.cost),
        pos: asPos(v.pos),
        blueprintCompat: Boolean(v.blueprint_compat),
        perishableCompat: Boolean(v.perishable_compat),
        eternalCompat: Boolean(v.eternal_compat),
        config: asObj(v.config),
        rawDesc: formatLocDesc(locJokers[key]),
      };
      if (v.soul_pos) {
        entry.soulPos = asPos(v.soul_pos);
      }
      if (typeof v.effect === 'string') {
        entry.effect = v.effect;
      }
      jokers.push(entry);
    } else if (set === 'Tarot') {
      tarots.push({
        key,
        name: getLocName(locTarots[key], String(v.name ?? key)),
        order: Number(v.order),
        cost: Number(v.cost ?? 3),
        pos: asPos(v.pos),
        ...(typeof v.effect === 'string' ? { effect: v.effect } : {}),
        config: asObj(v.config),
        rawDesc: formatLocDesc(locTarots[key]),
      });
    } else if (set === 'Planet') {
      planets.push({
        key,
        name: getLocName(locPlanets[key], String(v.name ?? key)),
        order: Number(v.order),
        cost: Number(v.cost ?? 3),
        pos: asPos(v.pos),
        ...(typeof v.effect === 'string' ? { effect: v.effect } : {}),
        softlocked: Boolean(asObj(v.config).softlock),
        config: asObj(v.config),
        rawDesc: formatLocDesc(locPlanets[key]),
      });
    } else if (set === 'Spectral') {
      spectrals.push({
        key,
        name: getLocName(locSpectrals[key], String(v.name ?? key)),
        order: Number(v.order),
        cost: Number(v.cost ?? 4),
        pos: asPos(v.pos),
        ...(typeof v.effect === 'string' ? { effect: v.effect } : {}),
        hidden: Boolean(v.hidden),
        config: asObj(v.config),
        rawDesc: formatLocDesc(locSpectrals[key]),
      });
    } else if (set === 'Voucher') {
      const reqs = v.requires ? asArray(v.requires).map((r) => String(r)) : undefined;
      vouchers.push({
        key,
        name: getLocName(locVouchers[key], String(v.name ?? key)),
        order: Number(v.order),
        cost: Number(v.cost ?? 10),
        pos: asPos(v.pos),
        ...(reqs && reqs.length > 0 ? { requires: reqs } : {}),
        config: asObj(v.config),
        rawDesc: formatLocDesc(locVouchers[key]),
      });
    } else if (set === 'Booster') {
      // Booster descriptions in en-us.lua live under Other as p_<kind>_<size> (without _1/_2/_3/_4 suffix)
      const locBoosterKey = key.replace(/_\d+$/, '');
      boosters.push({
        key,
        name: String(v.name ?? key),
        kind: String(v.kind ?? ''),
        order: Number(v.order),
        cost: Number(v.cost ?? 4),
        weight: Number(v.weight ?? 1),
        pos: asPos(v.pos),
        config: asObj(v.config),
        rawDesc: formatLocDesc(locOther[locBoosterKey]),
      });
    } else if (set === 'Back') {
      if (v.omit === true) continue; // Exclude b_challenge (non-playable challenge deck wrapper)
      decks.push({
        key,
        name: getLocName(locBacks[key], String(v.name ?? key)),
        order: Number(v.order),
        pos: asPos(v.pos),
        config: asObj(v.config),
        rawDesc: formatLocDesc(locBacks[key]),
      });
    } else if (set === 'Enhanced') {
      enhancements.push({
        key,
        name: getLocName(locEnhanced[key], String(v.name ?? key)),
        order: Number(v.order),
        pos: asPos(v.pos),
        effect: String(v.effect ?? ''),
        label: String(v.label ?? v.name ?? key),
        config: asObj(v.config),
        rawDesc: formatLocDesc(locEnhanced[key]),
      });
    } else if (set === 'Edition') {
      if (key === 'e_base') continue; // Exclude base non-edition
      editions.push({
        key,
        name: getLocName(locEdition[key], String(v.name ?? key)),
        order: Number(v.order),
        pos: asPos(v.pos),
        config: asObj(v.config),
        rawDesc: formatLocDesc(locEdition[key]),
      });
    }
  }

  jokers.sort((a, b) => a.order - b.order);
  tarots.sort((a, b) => a.order - b.order);
  planets.sort((a, b) => a.order - b.order);
  spectrals.sort((a, b) => a.order - b.order);
  vouchers.sort((a, b) => a.order - b.order);
  boosters.sort((a, b) => a.order - b.order);
  decks.sort((a, b) => a.order - b.order);
  enhancements.sort((a, b) => a.order - b.order);
  editions.sort((a, b) => a.order - b.order);

  // Build Blinds (30)
  const blinds: OracleData['blinds'] = Object.entries(pBlinds)
    .map(([key, rawVal]) => {
      const v = asObj(rawVal);
      const boss = v.boss ? asObj(v.boss) : null;
      const showdown = Boolean(boss?.showdown);
      const kind: 'small_big' | 'regular_boss' | 'showdown_boss' = !boss
        ? 'small_big'
        : showdown
          ? 'showdown_boss'
          : 'regular_boss';
      return {
        key,
        name: getLocName(locBlinds[key], String(v.name ?? key)),
        order: Number(v.order),
        kind,
        showdown,
        minAnte: boss && typeof boss.min === 'number' ? boss.min : 1,
        maxAnte: boss && typeof boss.max === 'number' ? boss.max : 10,
        mult: Number(v.mult),
        dollars: Number(v.dollars),
        bossColor: typeof v.boss_colour === 'string' ? v.boss_colour : null,
        pos: asPos(v.pos),
        debuff: asObj(v.debuff),
        rawDesc: formatLocDesc(locBlinds[key]),
      };
    })
    .sort((a, b) => a.order - b.order);

  // Build Tags (24)
  const tags: OracleData['tags'] = Object.entries(pTags)
    .map(([key, rawVal]) => {
      const v = asObj(rawVal);
      return {
        key,
        name: getLocName(locTags[key], String(v.name ?? key)),
        order: Number(v.order),
        minAnte: typeof v.min_ante === 'number' ? v.min_ante : null,
        ...(typeof v.requires === 'string' ? { requires: v.requires } : {}),
        pos: asPos(v.pos),
        config: asObj(v.config),
        rawDesc: formatLocDesc(locTags[key]),
      };
    })
    .sort((a, b) => a.order - b.order);

  // Build Stakes (8)
  const stakes: OracleData['stakes'] = Object.entries(pStakes)
    .map(([key, rawVal]) => {
      const v = asObj(rawVal);
      return {
        key,
        name: getLocName(locStakes[key], String(v.name ?? key)),
        order: Number(v.order),
        stakeLevel: Number(v.stake_level),
        pos: asPos(v.pos),
        rawDesc: formatLocDesc(locStakes[key]),
      };
    })
    .sort((a, b) => a.order - b.order);

  // Build Seals (4) with exact coordinates from game.lua self.shared_seals
  const seals: OracleData['seals'] = Object.entries(pSeals)
    .map(([key, rawVal]) => {
      const v = asObj(rawVal);
      const spriteCall = asObj(sharedSeals[key]);
      const spriteArgs = asArray(spriteCall.args);
      const pos = asPos(spriteArgs[5]);
      const locKey = `${key.toLowerCase()}_seal`;
      return {
        key,
        name: getLocName(locOther[locKey], `${key} Seal`),
        order: Number(v.order),
        pos,
        rawDesc: formatLocDesc(locOther[locKey]),
      };
    })
    .sort((a, b) => a.order - b.order);

  // Build Challenges (20)
  const challenges: OracleData['challenges'] = rawChallenges.map((rawVal, idx) => {
    const v = asObj(rawVal);
    const key = String(v.id ?? `c_unknown_${idx + 1}`);
    const locName = locChallengeNames[key];
    return {
      key,
      name: typeof locName === 'string' ? locName : String(v.name ?? key),
      order: idx + 1,
      rules: asObj(v.rules),
      jokers: asArray(v.jokers),
      consumables: asArray(v.consumeables ?? v.consumables),
      vouchers: asArray(v.vouchers),
      deck: asObj(v.deck),
      restrictions: asObj(v.restrictions),
    };
  });

  // Verify Atlas Dimensions (1x and 2x) for all 15 atlases
  const atlasDimensions = {} as OracleData['atlasDimensions'];
  for (const key of ATLAS_KEYS) {
    const spec = ATLAS_SPECS[key];
    const dims1x = readPngDimensions(archive.readEntry(`resources/${spec.file1x}`), spec.file1x);
    const dims2x = readPngDimensions(archive.readEntry(`resources/${spec.file2x}`), spec.file2x);
    assertEqual(dims1x.width, spec.cols * spec.cellW, `atlas ${key} 1x width`);
    assertEqual(dims1x.height, spec.rows * spec.cellH, `atlas ${key} 1x height`);
    assertEqual(dims2x.width, spec.cols * spec.cellW * 2, `atlas ${key} 2x width`);
    assertEqual(dims2x.height, spec.rows * spec.cellH * 2, `atlas ${key} 2x height`);
    atlasDimensions[key] = {
      width1x: dims1x.width,
      height1x: dims1x.height,
      width2x: dims2x.width,
      height2x: dims2x.height,
      cellW: spec.cellW,
      cellH: spec.cellH,
      cols: spec.cols,
      rows: spec.rows,
    };
  }

  // Verify all 80 sounds & 19 shaders
  const soundKeys = archive
    .listNames()
    .filter((n) => n.startsWith('resources/sounds/') && n.endsWith('.ogg'))
    .map((n) => path.posix.basename(n, '.ogg'))
    .sort((a, b) => a.localeCompare(b));

  const shaders = archive
    .listNames()
    .filter((n) => n.startsWith('resources/shaders/') && n.endsWith('.fs'))
    .map((n) => path.posix.basename(n))
    .sort((a, b) => a.localeCompare(b));

  // Extract reference hooks from blind.lua, tag.lua, back.lua
  const blindHookKeys = extractRegexUnique(blindLua, /self\.name\s*==\s*['"]([^'"]+)['"]/g);
  const tagTriggerTypes = extractRegexUnique(tagLua, /_context\.type\s*==\s*['"]([^'"]+)['"]/g);
  const backEffectNames = extractRegexUnique(backLua, /self\.name\s*==\s*['"]([^'"]+)['"]/g);

  // Tally counts & verify exact ground-truth parity
  const jokersByRarity: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const j of jokers) {
    if (j.rarity !== 1 && j.rarity !== 2 && j.rarity !== 3 && j.rarity !== 4) {
      throw new Error(`Invalid rarity ${String(j.rarity)} on joker ${j.key}`);
    }
    jokersByRarity[j.rarity]++;
  }

  const blindsByKind = {
    smallBig: blinds.filter((b) => b.kind === 'small_big').length,
    regularBoss: blinds.filter((b) => b.kind === 'regular_boss').length,
    showdownBoss: blinds.filter((b) => b.kind === 'showdown_boss').length,
  };

  const counts: OracleCounts = {
    jokers: jokers.length,
    jokersByRarity,
    decks: decks.length,
    stakes: stakes.length,
    challenges: challenges.length,
    blinds: blinds.length,
    blindsByKind,
    tarots: tarots.length,
    planets: planets.length,
    spectrals: spectrals.length,
    vouchers: vouchers.length,
    boosters: boosters.length,
    tags: tags.length,
    enhancements: enhancements.length,
    editions: editions.length,
    seals: seals.length,
    pokerHands: pokerHands.length,
    sounds: soundKeys.length,
    shaders: shaders.length,
  };

  // Hard assertions — throw if parser missed ANY entry!
  assertEqual(counts.jokers, 150, 'counts.jokers');
  assertEqual(counts.jokersByRarity[1], 61, 'counts.jokersByRarity[1]');
  assertEqual(counts.jokersByRarity[2], 64, 'counts.jokersByRarity[2]');
  assertEqual(counts.jokersByRarity[3], 20, 'counts.jokersByRarity[3]');
  assertEqual(counts.jokersByRarity[4], 5, 'counts.jokersByRarity[4]');
  assertEqual(counts.decks, 15, 'counts.decks');
  assertEqual(counts.stakes, 8, 'counts.stakes');
  assertEqual(counts.challenges, 20, 'counts.challenges');
  assertEqual(counts.blinds, 30, 'counts.blinds');
  assertEqual(counts.blindsByKind.smallBig, 2, 'counts.blindsByKind.smallBig');
  assertEqual(counts.blindsByKind.regularBoss, 23, 'counts.blindsByKind.regularBoss');
  assertEqual(counts.blindsByKind.showdownBoss, 5, 'counts.blindsByKind.showdownBoss');
  assertEqual(counts.tarots, 22, 'counts.tarots');
  assertEqual(counts.planets, 12, 'counts.planets');
  assertEqual(counts.spectrals, 18, 'counts.spectrals');
  assertEqual(counts.vouchers, 32, 'counts.vouchers');
  assertEqual(counts.boosters, 32, 'counts.boosters');
  assertEqual(counts.tags, 24, 'counts.tags');
  assertEqual(counts.enhancements, 8, 'counts.enhancements');
  assertEqual(counts.editions, 4, 'counts.editions');
  assertEqual(counts.seals, 4, 'counts.seals');
  assertEqual(counts.pokerHands, 12, 'counts.pokerHands');
  assertEqual(counts.sounds, 80, 'counts.sounds');
  assertEqual(counts.shaders, 19, 'counts.shaders');

  // Verify exact poker hand order & IDs against POKER_HAND_IDS
  for (let i = 0; i < POKER_HAND_IDS.length; i++) {
    assertEqual(pokerHands[i]?.id, POKER_HAND_IDS[i], `pokerHands[${i}].id`);
  }

  // Verify exact blind scaling tables
  assertEqual(
    JSON.stringify(blindAmounts.scaling1),
    JSON.stringify([300, 800, 2000, 5000, 11000, 20000, 35000, 50000]),
    'blindAmounts.scaling1'
  );
  assertEqual(
    JSON.stringify(blindAmounts.scaling2),
    JSON.stringify([300, 900, 2600, 8000, 20000, 36000, 60000, 100000]),
    'blindAmounts.scaling2'
  );
  assertEqual(
    JSON.stringify(blindAmounts.scaling3),
    JSON.stringify([300, 1000, 3200, 9000, 25000, 60000, 110000, 200000]),
    'blindAmounts.scaling3'
  );

  // Verify exact sound key set matches SOUND_KEYS
  const expectedSounds = [...SOUND_KEYS].sort((a, b) => a.localeCompare(b));
  assertEqual(JSON.stringify(soundKeys), JSON.stringify(expectedSounds), 'soundKeys parity');

  return {
    generatedAt: new Date().toISOString(),
    counts,
    pokerHands,
    blindAmounts,
    jokers,
    tarots,
    planets,
    spectrals,
    vouchers,
    boosters,
    blinds,
    tags,
    decks,
    stakes,
    challenges,
    enhancements,
    editions,
    seals,
    atlasDimensions,
    soundKeys,
    shaders,
    sourceHooks: {
      paletteHex,
      blindHookKeys,
      tagTriggerTypes,
      backEffectNames,
    },
  };
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
    const msg = `[oracle-dump] Retail executable not found at: ${exePath}`;
    if (optional) {
      console.log(`${msg} (--optional set; skipping oracle generation).`);
      process.exit(0);
    }
    console.error(`${msg}\nSet BALATRO_EXE or pass --optional to skip when unavailable.`);
    process.exit(1);
  }

  try {
    const oracle = generateOracle(exePath);
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'oracle.json');
    fs.writeFileSync(outPath, JSON.stringify(oracle, null, 2) + '\n', 'utf8');
    const c = oracle.counts;
    console.log(
      `[oracle-dump] Verified & wrote ${outPath}: ` +
        `${c.jokers} jokers (${c.jokersByRarity[1]}/${c.jokersByRarity[2]}/${c.jokersByRarity[3]}/${c.jokersByRarity[4]}), ` +
        `${c.decks} decks, ${c.stakes} stakes, ${c.challenges} challenges, ` +
        `${c.blinds} blinds (${c.blindsByKind.smallBig}/${c.blindsByKind.regularBoss}/${c.blindsByKind.showdownBoss}), ` +
        `${c.tarots} tarots, ${c.planets} planets, ${c.spectrals} spectrals, ` +
        `${c.vouchers} vouchers, ${c.boosters} boosters, ${c.tags} tags, ` +
        `${c.enhancements} enhancements, ${c.editions} editions, ${c.seals} seals, ` +
        `${c.pokerHands} hands, ${c.sounds} sounds, ${c.shaders} shaders.`
    );
  } catch (err) {
    console.error('[oracle-dump] Failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
