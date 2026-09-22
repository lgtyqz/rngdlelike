# RNGdlelike

A complete, static roguelike spin game built with vanilla JavaScript, HTML, and CSS. No dependencies, build step, external runtime requests, or backend. The seven supplied Figma frames define the layout, Lexend typography, colors, and visual treatment; the shop expands to four offers as requested.

## Run

```sh
npm start
```

Open **http://localhost:5173**. Requires Node.js 20.11 or newer. Alternatively, serve this directory using `python3 -m http.server 5173`. ES modules need HTTP; opening `index.html` directly with `file://` will not work.

Deploy the directory to any static host. Keep `index.html`, `styles.css`, `js/`, `data/`, `assets/`, and `openmoji-svg-color/` together. Share links automatically use the deployed page’s URL and path.

## Play

- **Play!** creates a random seed using the browser’s cryptographic random generator.
- **Play Daily** chooses the seed for the current UTC date. Daily runs reset at midnight UTC.
- Start with **$150**, **Even Stevens**, **Bean Counter**, **Reroll One**, and **Increment**.
- Spin six digits, each uniformly distributed from 0–9. Select a tool, then its target reel. Copycat and Switcheroo require two different targets. Escape cancels selection.
- **Get Points!** activates every trinket in inventory order. Each contributing reel or matching group highlights in sequence while that trinket’s ledger, spin points, and total score count up. Cash counts up when the spin pays out. Counters slow as they approach their exact totals. Click the scoring log, or focus it and press Enter/Space, to speed up the animation; reduced motion skips reel pulses and count-up motion.
- The spin goal is `10 + 40 × (spin − 1)`; its cash bonus is `20 + 30 × (spin − 1)`. Every completed spin also pays an allowance of `10 × spin`. Points are per spin for the goal and cumulative for the final score. Missing a goal does not end the run.
- Between spins, shop for two trinkets, one upgrade to an owned tool, and one new tool. Owned items and duplicate offers are excluded. Fully collected categories show “All collected!” instead of duplicates.
- Shop rerolls cost $3, then $5, $7, etc., resetting at the next shop. Upgrades permanently add uses per spin. All tools recharge each spin.
- Finish all **20 spins**, then share your score, goal grid, inventory, and a link that lets a friend play the same seed. Clipboard-denied environments get a selectable text fallback.

The last run is saved in this browser after each action. **Menu → Continue your run** resumes it. Starting a new run replaces that save; daily replays are allowed. This is a local game with no leaderboard, account, or server-side verification.

## Sound

Sound cues for spins, reel landings, tools, scoring, bonuses, purchases, shop rerolls, and the final score use local files in `assets/sounds/`. The included WAV files are **silent placeholders**; replace them with finished effects or update the exported `SOUND_REGISTRY` paths and volumes in `js/audio.js`. No oscillators are used.

Use **Sound: on/off** in the menu or game footer at any time; the setting is remembered in this browser. Audio loads after an interaction and stops when the tab is hidden. Missing files or unavailable Web Audio never interrupt gameplay. Sound never changes seeded results.

## Seeds and determinism

`data/daily-seeds.json` contains 4,018 predetermined daily seeds for **2026–2036**, checked into the project. To regenerate exactly the same calendar:

```sh
npm run seeds
```

The generator hashes `rngdlelike:daily:v1:YYYY-MM-DD`. Dates beyond the calendar and a failed calendar fetch use that same formula, so there is no discontinuity. UTC day selection avoids timezone disagreements. A run retains the date it started on even across midnight.

Base spins, tool rerolls, and shop offerings use separate deterministic streams. Animation timing, reduced-motion preferences, refreshes, and shop reroll counts cannot change the base spins. The same seed **and choices** reproduce the same run. `?seed=314159` or `?daily=2026-09-22` exposes a shared-challenge button on the menu.

## Items and editable metadata

`js/items.js` defines **24 trinkets and 12 tools**, their emoji artwork, rarity, description, and initial metadata. Owned items copy their metadata, so growth never changes the template or another run.

For example, Bean Counter starts with `{ power: 1 }`. Three finalized ones score `1 + 2 + 3 = 6` and leave its power at 4 for the next spin. Temporary digits during an animation or an edited-away one do not count. Little Garden grows each spin; Rocket Fuel grows for each nine; Hoarding Dragon doubles its power after scoring.

To add an item:

1. Add its definition to `TRINKETS` or `TOOLS` in `js/items.js`.
2. Implement its named effect in `scoreTrinket` or `useTool` in `js/engine.js`.
3. Add any mutable starting values to `metadata` and describe them accurately in the tooltip. `itemDescription` automatically shows current `power` and a tool’s max uses.
4. Ensure its emoji SVG is present in `openmoji-svg-color/`, or map its artwork in `iconPath`.
5. Add a rules test for the new behavior.

Rarity weights are **60:27:10:3** for Common, Uncommon, Rare, and Legendary, normalized over available rarity groups. Base trinket prices are **$12/$25/$50/$100**. Tools add $5; upgrades add **1/2/4/8** uses according to rarity, with a surcharge for previous upgrades. These are initial balance values, isolated in the catalog and engine for tuning.

## Verify

```sh
npm test
```

The dependency-free Node tests cover the daily calendar, repeatable full runs, mutable metadata, scoring, targeting, cash, upgrades, rarity distribution, pool exhaustion, final-spin boundaries, and local artwork.

An optional dependency-free Chrome smoke test exercises a complete run, save/resume, sharing, clipboard fallback, daily mode, real reel animations, reduced motion, and desktop/mobile layouts. Start the game server and a separate Chrome instance with:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9223 --user-data-dir=/tmp/rngdle-test
node --experimental-websocket tests/browser-smoke.mjs
```

Use your Chrome executable on other platforms. Node versions with a stable global WebSocket can omit `--experimental-websocket`. Screenshots go to `/tmp/rngdlelike-screenshots`; `TEST_URL`, `CHROME_DEBUG_URL`, and `SCREENSHOT_DIR` are configurable.

## Credits

- UI: the supplied [RNGDlelike Figma design](https://www.figma.com/design/exZUvvakyST3iNQ5ZPw0rj/RNGDlelike).
- Emoji illustrations: [OpenMoji](https://openmoji.org/), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Existing SVGs are used unchanged. Reference reroll and balance artwork is stored locally in `assets/`.
- Lexend: self-hosted font files, with the SIL Open Font License in `assets/fonts/OFL.txt`.

Keyboard focus, focus/tap tooltips, horizontally scrollable inventory bins, reduced-motion support, and layouts down to 320px are included.
