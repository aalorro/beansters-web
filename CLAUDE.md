# BEANSTERS — Developer Notes

Colorful cartoony bean math puzzle game. No build step, no dependencies.

## File structure

| File | Purpose |
|------|---------|
| `index.html` | HTML shell — layout and modals only, no inline JS/CSS |
| `style.css` | All styles and theming |
| `game.js` | All game logic (ES module, strict mode) |
| `CLAUDE.md` | This file |
| `README.md` | User-facing documentation |

## Running

Open `index.html` directly in a browser. Works fully offline — no server required.

> `game.js` uses `type="module"` so it is subject to CORS restrictions on `file://` in some browsers. If it doesn't load, serve from a local HTTP server: `npx serve .` or `python -m http.server`.

## Architecture

Single-state, re-render-on-every-action loop:

- **`S`** — current game state (level, tile placements, elapsed time, lives, etc.)
- **`save`** — persisted progress in `localStorage` under key `numeral-loom-v1`
- **`generate(L)`** — deterministic puzzle generator using seeded RNG; same level always produces the same puzzle
- **`render()`** — rebuilds board and tray innerHTML from `S`; called after every interaction
- **`after()`** — detects newly-correct and newly-wrong rows/cols, plays SFX, triggers `win()` or game-over as needed

## Key conventions

- Grid cells are keyed as `"row,col"` strings — e.g. `"0,2"`
- Row operators: `"r{row}_{col}"` — e.g. `"r0_1"` is the operator between columns 1 and 2 in row 0
- Column operators: `"c{col}_{row}"` — e.g. `"c2_0"` is the operator between rows 0 and 1 in column 2
- Bean color per tile: `tile.id % 8` — consistent between tray and board so the same bean keeps its color
- Timer: controlled by `S.started`; set to `true` on the first `placeTile()` or `onOp()` call

## Lives system

- `S.lives` — starts at 3 each game; lives are per-game, not persisted
- Each action that produces a **newly-wrong** row/col (fully evaluated, result ≠ target) costs 1 life
- "Newly wrong" is tracked via `S.prevWrong` (a Set of `"r{n}"` / `"c{n}"` keys); a line already wrong doesn't cost additional lives until it clears and goes wrong again
- At 0 lives: `S.done = true`, sad trombone + splash play, then `enterTimeout()` fires after 2.4 s
- Timeout: `save.timeout` (timestamp ms) persists in localStorage; `tickTimeout()` counts down 5 min and calls `start()` on expiry

## Audio (Web Audio API — no external files)

All sounds are synthesized at runtime via `AudioContext`:

| Function | Sound | Trigger |
|----------|-------|---------|
| `sfxCorrect()` | Two ascending sine tones (C5 → G5) | Row or column first becomes correct |
| `sfxWin()` | Four-note triangle fanfare (C5 E5 G5 C6) | Puzzle solved |
| `sfxCrash()` | Bandpass noise burst + descending sine thud | Row or column first evaluates wrong |
| `sfxSad()` | Lowpass-filtered sawtooth trombone slide × 4 | All lives lost (game over) |

Shared `actx()` helper lazily creates and resumes the `AudioContext`. All sfx calls are wrapped in `try/catch`.

## Splash overlay

`#splash` is a `pointer-events:none` fixed overlay (z-index 30). `showSplash(msg, type, duration)` injects a `.splash-text` element animated by `@keyframes splash-pop` (bounce-in, hold, fade-out).

- **`.ok`** (green) — row/col correct; 1.1 s; random phrase from `WIN_PHRASES[10]`
- **`.win`** (gold) — puzzle solved; 1.6 s; random phrase from `WIN_PHRASES[10]`
- **`.sad`** (indigo) — game over; 2.4 s; random phrase from `SAD_PHRASES[5]`

Win modal is delayed 1 s to let the win splash play first.

## Modals

Four overlays share the `.overlay` / `.card` CSS:

- `#win` — level complete, shown by `win()` (after 1 s delay)
- `#help` — how to play; auto-opens on the very first visit (level 1, `save.max === 1`)
- `#about` — about & privacy
- `#timeout` — 5-minute cool-off shown on game over; `tickTimeout()` drives the countdown
- `#welcome` — player name entry / returning player screen

## LocalStorage

Key: `numeral-loom-v1` — preserves save data from before the rename to BEANSTERS.

Shape: `{ max, cur, score, stars: { [level]: 1|2|3 }, username, timeout }`

(`timeout` is a Unix ms timestamp while a cooldown is active, otherwise `null`.)

## Theming

All colors are CSS custom properties on `:root` in `style.css`.
Bean colors cycle 0–7 (`--b0` through `--b7`), each with a shadow variant (`--b0s` etc.).
Yellow bean (index 2) uses dark text — accounted for in both `.tile` and `.slot.filled` rules.
