# Krunked Cards

**Krunked Cards** is a roguelike poker deckbuilder built from the ground up with TypeScript, WebGL2 (GLSL ES 3.00), Web Audio API, and a 100% deterministic 60 Hz simulation engine.

**Play Online:** https://krunked-fpv.github.io/krunked-cards/

## Features

- **Complete Roguelike Poker Engine**: 12 poker hands (including secret Flush Five, Flush House, and Five of a Kind), 150 Jokers across 4 rarities, 22 Tarots, 12 Planets, 18 Spectrals, 32 Vouchers (16 Tier-1 / Tier-2 upgrade pairs), 32 Booster Packs, 30 Blinds (Small, Big, 23 Boss Blinds, and 5 Ante-8 Showdown Bosses), 24 Skip Tags, 15 Playable Decks, 8 Cumulative Stakes, and 20 Challenges — plus Endless Mode beyond Ante 8.
- **Tactile WebGL2 Pixel-Art Renderer**: Domain-warped swirl backgrounds, Foil / Holographic / Polychrome / Negative / Dissolve / Debuff / Gold Seal card shaders, scoreboard roar flames, exponential card spring physics with hover tilt and `juice_up` recoil, drag-to-reorder trays, and an adjustable CRT post-process pass (30 / 60 / 120 FPS).
- **Dual Art & Audio Pack Architecture**: Ships with a 100% original procedural pixel-art **Krunked Art Pack** and 5-track crossfading Web Audio synth soundtrack + 80 SFX keys out of the box, with a live toggle to load a user-supplied local custom pack via browser IndexedDB or local dev assets.
- **Deterministic Replay & Verification**: Keyed PRNG and FNV-1a state hashing guarantee bit-for-bit identical replays across seeds and action tapes.

## Quick Start

```bash
npm install
npm run play
```

Open `http://localhost:4173` in a WebGL2-capable browser. Press `F9` in development to open the Playtest Debug Drawer.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite development server |
| `npm run play` | Launch game on `http://localhost:4173` |
| `npm run typecheck` | Run strict TypeScript typecheck |
| `npm run test` | Run Vitest unit & integration suites |
| `npm run verify:assets` | Verify built-in & custom pack manifests, catalog parity, and clean-room IP hygiene |
| `npm run verify:sim` | Run autonomous multi-deck/stake/challenge headless soak & FNV-1a replay determinism proof |
| `npm run verify` | Run all static, unit, asset, and simulation gates |
| `npm run build` | Typecheck and build static production bundle into `dist/` |
| `npm run extract` | Local-only read-only custom pack extractor (outputs to gitignored `.krunked-cards-assets/`) |
| `npm run oracle` | Local-only read-only mechanic parity oracle generator |

## Controls

- **Mouse**: Click to select/deselect cards, drag cards in Hand or Joker tray to reorder, drag or click buttons to buy/sell/use, hover any item for live dynamic tooltips.
- **Keyboard**: `Space` / `Enter` Play Hand, `D` Discard, `R` Sort by Rank, `S` Sort by Suit, `Escape` Pause / Close Modal, `I` Run Info, `F9` Dev Playtest Drawer.
- **Gamepad**: D-Pad / Stick navigation, `A` Select/Confirm, `B` Cancel/Deselect, `X` Play Hand, `Y` Discard, `LB`/`RB` Sort.
