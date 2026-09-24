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
- Start with **$10**, two distinct random Common tools, and two distinct rarity-weighted trinkets. Mysterious Package is excluded from starting trinkets.
- Start with six reels, each containing one slot per digit from 0–9. Permanent tools edit these pools. Select a tool, then its target reel. Copycat and Swap require two different targets. Escape cancels selection.
- **Get Points!** activates scoring trinkets in inventory order. Each contributing reel or matching group highlights in sequence while that trinket’s ledger, spin points, and total score count up. Bombs show brief reel messages when armed, counted down, or exploded, and those events appear in the scoring log. Landed Ws appear in the log after trinkets and add to the goal bonus; cash counts up when the spin pays out. The Real Knife and Crystal Ball count matching numbers as they land or change during tool use, with a brief message on each triggering reel. Every nine 9s, Real Knife reserves a Legendary Trinket and pays $99, with the payout also shown in the scoring log. Counters slow as they approach their exact totals. Click the scoring log, or focus it and press Enter/Space, to speed up the animation; reduced motion skips reel pulses and count-up motion.
- The spin goal is `10 + 40 × (spin − 1)`; its cash bonus is `20 + 20 × (spin − 1)`. Every completed spin also pays an allowance of `10 + 5 × spin`. Points are per spin for the goal and cumulative for the final score. Missing a goal does not end the run.
- Between spins, shop for two trinkets, one upgrade to an owned tool, and one new tool. Owned items and duplicate offers are excluded. Fully collected categories show “All collected!” instead of duplicates.
- Shop rerolls cost $3, then $6, $9, etc., resetting at the next shop. Upgrades permanently add uses per spin. Limited-use tools do not recharge; other tools recharge each spin.
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

Starting trinkets, starting tools, base spins, tool rerolls, and shop offerings use separate deterministic streams. Animation timing, reduced-motion preferences, refreshes, and shop reroll counts cannot change the base spins. The same seed **and choices** reproduce the same run. Use **Play a seed** on the menu to enter any whole-number seed from 0 to 4294967295, then press **PLAY SEED** or Enter. `?seed=314159` prefills that input. `?daily=2026-09-22` exposes a shared daily-challenge button.

## Items and editable metadata

`data/catalog/tools.csv` and `data/catalog/trinkets.csv` preserve the supplied source sheets. `js/items.js` contains exactly their **59 trinkets and 22 tools**, including CSV IDs (such as `bullmaket`), names, descriptions, rarity, initial uses, and limited-use flags. Tests compare the registries against the CSVs and check every icon.

`js/scoring.js` handles points, cash, growth, and multipliers; `js/engine.js` handles targeting, persistent reel pools, random rewards, acquisition and shop hooks. Owned metadata is independent. Bean Counter starts at 1 and adds 5 after each scored one: three ones give `1 + 6 + 11 = 18`, leaving power 16.

Camera and Butterfly target an owned trinket; ATM targets another tool. Reroll All acts immediately. Select a Superposition reel without a tool selected to toggle 0/1. Expand **Reel contents** to inspect persistent pools. Details and rule defaults are in [catalog-rules.md](data/catalog-rules.md).

Saves use version 2 and a new storage key because persistent reel pools and removed catalog IDs cannot be faithfully reconstructed from version 1. Old saves are left in storage but are not offered for resume. New runs save/resume all powers, pools, special slots, counters, temporary uses, and pending Camera events.

Rarity weights are **60:27:10:3** for Common, Uncommon, Rare, and Legendary, normalized over available rarity groups. Item prices can be set on individual catalog definitions and otherwise fall back to **$12/$25/$50/$100** by rarity. Upgrades always add **1** use; the offered tool is weighted by the relative rarities of the owned tools, and repeat upgrades carry a surcharge. These are initial balance values, isolated in the catalog and engine for tuning.

## Verify

```sh
npm test
```

The dependency-free Node tests cover the daily calendar, repeatable full runs, mutable metadata, scoring, targeting, cash, upgrades, rarity distribution, pool exhaustion, final-spin boundaries, and local artwork.

An optional dependency-free Chrome smoke test exercises the catalog UI, inventory targeting, special slots, scoring, save/resume, and mobile layout. Start the game server and a separate Chrome instance with:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9223 --user-data-dir=/tmp/rngdle-test
node --experimental-websocket tests/browser-catalog.mjs
```

Use your Chrome executable on other platforms. Node versions with a stable global WebSocket can omit `--experimental-websocket`. Screenshots go to `/tmp/rngdlelike-screenshots`; `TEST_URL` and `CHROME_DEBUG_URL` are configurable.

## Credits

- Game design: LGTYQZ; the supplied [RNGDlelike Figma design](https://www.figma.com/design/exZUvvakyST3iNQ5ZPw0rj/RNGDlelike).
- Emoji illustrations: [OpenMoji](https://openmoji.org/), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Existing SVGs are used unchanged. Reference reroll and balance artwork is stored locally in `assets/`.
- Sound effects: [Pixabay](https://pixabay.com/sound-effects/).
- Lexend: self-hosted font files, with the SIL Open Font License in `assets/fonts/OFL.txt`.

Keyboard focus, focus/tap tooltips, horizontally scrollable inventory bins, reduced-motion support, and layouts down to 320px are included.
