# BEANSTERS

A colorful bean-themed math puzzle. Place numbered beans into a grid so that every row and every column equals the target shown at its end.

## How to play

- Pick a bean from the **Bean tray** and tap an empty slot, or tap the slot first then tap the bean.
- You can also **drag beans** directly onto any slot on the board.
- Drag a placed bean back to the tray to remove it, or drag it straight to another slot.
- Every row (left → right) and every column (top → bottom) must equal its target number.
- Math is evaluated **strictly left to right** — no operator precedence. `2 + 3 × 4 = 20`, not 14.
- Every intermediate result must be a whole number (no fractional steps).
- **The timer starts on your first move** — take as long as you like studying the board before you begin.

## Lives

Each game starts with 3 lives (♥♥♥). Every time a row or column evaluates to the **wrong total**, you lose one life. Lose all three and you're sent to a **5-minute cool-off** before you can play again. Lives reset to full at the start of every new game.

## Scoring

| Stars | Condition |
|-------|-----------|
| ★★★ | No hints used, finished under par time |
| ★★   | At most 1 hint, under 2× par time |
| ★     | Any completion |

## What unlocks as you level up

| Level | New mechanic |
|-------|-------------|
| 1  | Introduction — 3×3 grid, + and − |
| 3  | Multiplication (×) |
| 4  | Decoy tiles — one or more beans in the tray fit nowhere |
| 6  | Division (÷) and 4×4 grid |
| 12 | Blank operators — tap `?` signs to cycle through + − × ÷ |
| 16 | 5×5 grid |
| 20 | Negative numbers |
| 41 | 6×6 grid |
| 45 | All number cells hidden — maximum difficulty |

## Running

Open `index.html` in a browser. No installation or internet connection needed once the file is open.

> If beans don't load, try serving from a local server: `npx serve .` or `python -m http.server`

## Progress

Your progress (level, score, star ratings) is saved automatically in your browser's local storage.
