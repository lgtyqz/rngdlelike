import {
  ITEMS,
  RARITIES,
  iconPath,
  itemDescription,
  ownItem,
} from "./items.js";
import {
  createRun,
  spin,
  useTool,
  settleSpin,
  enterShop,
  buy,
  rerollShop,
  nextRound,
  goalFor,
  bonusFor,
  allowanceFor,
  rerollPrice,
  shareText,
} from "./engine.js";
import { dailySeed, utcDate } from "./random.js";

import { GameAudio } from "./audio.js";
import { animateCount } from "./animation.js";

const sound = new GameAudio();
const app = document.querySelector("#app");
const tooltip = document.querySelector("#tooltip");
const help = document.querySelector("#help");
const SAVE_KEY = "rngdlelike.run.v1";
const COLORS = [
  "#e34058",
  "#e38140",
  "#e9ec35",
  "#81e340",
  "#40e3c8",
  "#40b8e3",
  "#405be3",
  "#7e40e3",
  "#d040e3",
  "#e3409f",
];
const CONFETTI_ICONS = [
  "openmoji-svg-color/1F389.svg",
  "openmoji-svg-color/1F38A.svg",
  "openmoji-svg-color/2728.svg",
  "openmoji-svg-color/2B50.svg",
  "openmoji-svg-color/1F3C6.svg",
  "openmoji-svg-color/1FA99.svg",
  "openmoji-svg-color/1F388.svg",
  "openmoji-svg-color/1F308.svg",
  "openmoji-svg-color/1F48E.svg",
  "openmoji-svg-color/1F451.svg",
  "openmoji-svg-color/1F340.svg",
  "openmoji-svg-color/1F680.svg",
];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let state = null,
  calendar = {},
  saved = readSave(),
  scoreWait;
let ui = {
  menu: true,
  busy: false,
  selected: null,
  source: null,
  phase: null,
  logs: [],
  fast: false,
  displayPoints: 0,
  displayTotal: 0,
  displayBank: 0,
};

/** Escapes a value for safe interpolation into generated HTML. */
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

/** Formats a score or cash value for compact display. */
const number = (value) =>
  value >= 1e9
    ? value.toExponential(3).replace("e+", "e")
    : value.toLocaleString("en-US");

/** Waits for an animation delay, shortened when reduced motion is preferred. */
const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, reducedMotion.matches ? 1 : ms));

/** Bursts local OpenMoji artwork from the center of the goal message. */
function celebrateGoal(anchor) {
  if (reducedMotion.matches) return;
  document.querySelector(".goal-confetti")?.remove();
  const rect = anchor.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2 + 200;
  const spread = Math.min(window.innerWidth, 3600);
  const overlay = document.createElement("div");
  overlay.className = "goal-confetti";
  overlay.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 48; i++) {
    const particle = document.createElement("img");
    const drift = (Math.random() - 0.5) * spread;
    const riseHeight = 160 + Math.random() * 300;
    particle.className = "goal-confetti-particle";
    particle.alt = "";
    particle.src =
      CONFETTI_ICONS[Math.floor(Math.random() * CONFETTI_ICONS.length)];
    particle.style.left = `${centerX + (Math.random() - 0.5) * 32}px`;
    particle.style.top = `${centerY + (Math.random() - 0.5) * 12}px`;
    particle.style.setProperty("--x-mid", `${drift * 0.32}px`);
    particle.style.setProperty("--x", `${drift}px`);
    particle.style.setProperty("--rise", `${riseHeight}px`);
    particle.style.setProperty(
      "--fall",
      `${riseHeight - Math.random() * 160 - 20}px`,
    );
    const spin = (Math.random() - 0.5) * 1080;
    particle.style.setProperty("--spin-mid", `${spin * 0.35}deg`);
    particle.style.setProperty("--spin", `${spin}deg`);
    particle.style.setProperty("--size", `${22 + Math.random() * 25}px`);
    particle.style.setProperty("--delay", `${Math.random() * 0.12}s`);
    particle.style.setProperty("--duration", `${2.5 + Math.random() * 0.6}s`);
    overlay.append(particle);
  }
  document.body.append(overlay);
  setTimeout(() => overlay.remove(), 2200);
}

/** Returns the temporary UI phase when present, otherwise the saved game phase. */
const phase = () => ui.phase || state?.phase;

/**
 * Reads and validates a resumable run from browser storage.
 * @returns {object|null} The saved run, or null when none is valid.
 */
function readSave() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (
      !data ||
      data.version !== 1 ||
      !["normal", "daily"].includes(data.mode) ||
      !["ready", "editing", "scored", "shop", "finished"].includes(data.phase)
    )
      return null;
    if (
      !Number.isInteger(data.round) ||
      data.round < 1 ||
      data.round > 20 ||
      !Number.isInteger(data.seed)
    )
      return null;
    if (
      ![data.bank, data.total, data.points, data.toolRolls, data.rerolls].every(
        (n) => Number.isFinite(n) && n >= 0,
      )
    )
      return null;
    if (
      !Array.isArray(data.reels) ||
      data.reels.length !== 6 ||
      !data.reels.every((n) => Number.isInteger(n) && n >= 0 && n <= 9)
    )
      return null;
    if (
      !Array.isArray(data.trinkets) ||
      !Array.isArray(data.tools) ||
      !data.trinkets.length ||
      !data.tools.length
    )
      return null;
    if (
      !data.trinkets.every(
        (t) =>
          ITEMS[t.id]?.kind === "trinket" &&
          t.metadata &&
          Object.values(t.metadata).every(Number.isFinite),
      )
    )
      return null;
    if (
      !data.tools.every(
        (t) =>
          ITEMS[t.id]?.kind === "tool" &&
          Number.isInteger(t.maxUses) &&
          t.maxUses > 0 &&
          Number.isInteger(t.uses) &&
          t.uses >= 0 &&
          t.uses <= t.maxUses,
      )
    )
      return null;
    if (
      !Array.isArray(data.offers) ||
      !data.offers.every(
        (o) =>
          o.empty ||
          (ITEMS[o.id] &&
            RARITIES[o.rarity] &&
            Number.isFinite(o.price) &&
            o.price >= 0 &&
            ["trinket", "tool", "upgrade"].includes(o.kind)),
      )
    )
      return null;
    if (
      !Array.isArray(data.history) ||
      !Array.isArray(data.events) ||
      !data.events.every((e) => ITEMS[e.id] && Number.isFinite(e.points))
    )
      return null;
    if (data.mode === "daily" && !validDate(data.date)) return null;
    for (const offer of data.offers) {
      if (!offer.empty && offer.kind === "upgrade") {
        offer.amount = 1;
        offer.rarity = ITEMS[offer.id].rarity;
      }
    }
    return data;
  } catch {
    return null;
  }
}

/** Copies the current run into memory and attempts to save it locally. */
function persist() {
  saved = structuredClone(state);
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {}
}

/** Returns whether a value is a real ISO calendar date. */
function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

/** Returns the reusable RNGdlelike logo markup. */
function brand() {
  const letters = [..."RNGDLE"]
    .map(
      (letter, index) =>
        `<span class="brand-letter" style="--letter-index: ${index}">${letter}</span>`,
    )
    .join("");
  return `
    <div class="brand" aria-label="RNGdlelike">
      <h1>${letters}</h1>
      <div class="like" aria-hidden="true">LIKE</div>
    </div>
  `;
}

/**
 * Returns a standard action button.
 * @param {string} action Delegated click action.
 * @param {string} label Visible button text.
 * @param {string} [extra=""] Additional CSS class.
 * @returns {string} Button HTML.
 */
function button(action, label, extra = "") {
  return `
    <button class="button ${extra}" data-action="${action}" ${ui.busy ? "disabled" : ""}>
      ${label}
    </button>
  `;
}

/** The sound control stays available even while reels or scoring are busy. */
function soundButton() {
  return `<button class="text-button" data-action="sound" aria-pressed="${sound.enabled}" aria-label="Sound effects">Sound: ${sound.enabled ? "on" : "off"}</button>`;
}

/** Renders the main menu, daily challenge, and resumable-run actions. */
function renderMenu() {
  const today = utcDate();
  const displayDate = new Date(`${today}T12:00:00Z`)
    .toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    })
    .toUpperCase();
  const params = new URLSearchParams(location.search);
  const challenge =
    validDate(params.get("daily")) ||
    /^\d{1,10}$/.test(params.get("seed") || "");
  app.innerHTML = `
    <section class="screen menu">
      ${brand()}
      <p class="tagline">your favorite dle, now in your favorite genre</p>
      <p class="intro">
        Game’s simple: Spin 20 times, get as many points as you can.
      </p>
      <h2 class="ready">READY?</h2>
      <div class="menu-actions">
        ${button("play", "PLAY!", "play")}
        <div>
          ${button("daily", "PLAY DAILY", "daily")}
          <p class="daily-date">${displayDate}</p>
          <p class="daily-zone">new luck every day @ midnight UTC</p>
        </div>
      </div>
      ${
        challenge
          ? `
            <p style="margin-top:20px">
              <button class="text-button" data-action="challenge">
                Play the shared challenge →
              </button>
            </p>
          `
          : ""
      }
      ${
        saved && saved.phase !== "finished"
          ? `
            <p style="margin-top:18px">
              <button class="text-button resume" data-action="resume">
                Continue your ${saved.mode === "daily" ? "daily " : ""}run: spin ${saved.round}/20 →
              </button>
            </p>
          `
          : ""
      }
      <footer class="menu-footer">
        ${soundButton()}
          <button class="text-button" data-action="help">How to play</button>
        <a
          class="text-button"
          href="https://openmoji.org/"
          target="_blank"
          rel="noreferrer"
        >
          Art by OpenMoji
        </a>
      </footer>
    </section>
  `;
}

/** Returns the current bank, spin, score, goal, and total-score markup. */
function stats() {
  const current = phase(),
    scoring = current === "scoring";
  const points = scoring ? ui.displayPoints : state.points;
  const bank = scoring ? ui.displayBank : state.bank;
  const total = scoring ? ui.displayTotal : state.total;
  const bonus =
    current === "scored"
      ? state.points >= goalFor(state.round)
        ? `made the goal: +$${bonusFor(state.round)}!`
        : "no bonus this spin — keep going!"
      : `reach the goal for a bonus $${bonusFor(state.round)}!`;
  return `
    <div class="stats">
      <div class="stat">
        <div class="pill" id="bank">$${number(bank)}</div>
        <div class="stat-caption">YOUR BANK</div>
      </div>
      <div class="stats-center">
        <p class="round">SPIN ${state.round}/20</p>
        ${
          current === "finished"
            ? `
              <p class="final-label">FINAL SCORE:</p>
              <p class="final-score">${number(total)}</p>
            `
            : `
              <p class="points">
                POINTS: <span id="points">${number(points)}</span>/${number(goalFor(state.round))}
              </p>
              <p class="bonus">
                <span id="bonus-message">${bonus}</span>
                <span class="allowance">
                  Allowance: +$${number(allowanceFor(state.round))}
                </span>
              </p>
            `
        }
      </div>
      ${
        current !== "finished"
          ? `
            <div class="stat total">
              <div class="pill" id="total">${number(total)}</div>
              <div class="stat-caption">TOTAL SCORE</div>
            </div>
          `
          : ""
      }
    </div>
  `;
}

/** Returns the player's trinket and tool inventory markup. */
function inventory() {
  const sections = ["trinkets", "tools"]
    .map((kind) => {
      const items = state[kind]
        .map((item) => {
          const def = ITEMS[item.id],
            isTool = kind === "tools",
            editing = phase() === "editing";
          const selectedClass = ui.selected === item.id ? "selected" : "";
          const exhaustedClass =
            isTool && editing && !item.uses ? "exhausted" : "";
          const usesLabel =
            isTool && editing ? ` ${item.uses} uses remaining.` : "";
          const pressedAttribute =
            isTool && editing
              ? `aria-pressed="${ui.selected === item.id}"`
              : "";
          return `
            <button
              class="item ${selectedClass} ${exhaustedClass}"
              data-item="${item.id}"
              data-action="${isTool ? "tool" : "inspect"}"
              aria-label="${esc(def.name)}. ${esc(itemDescription(item))}${usesLabel}"
              ${pressedAttribute}
            >
              <img src="${iconPath(item.id)}" alt="" width="70" height="70">
              <span class="item-name">${esc(def.name)}</span>
              ${
                isTool && editing
                  ? `
                    <span class="uses ${item.uses ? "" : "empty"}" aria-hidden="true">
                      ${item.uses}
                    </span>
                  `
                  : ""
              }
            </button>
          `;
        })
        .join("");

      return `
        <section class="inventory-section">
          <h2 class="inventory-label">YOUR ${kind.toUpperCase()}</h2>
          <div
            class="bin"
            id="${kind}-bin"
            tabindex="0"
            aria-label="Your ${kind}, scroll to browse"
          >
            ${items}
          </div>
        </section>
      `;
    })
    .join("");

  return `
    <div class="inventory">
      ${sections}
    </div>
  `;
}

/** Returns the six interactive reel buttons for the current spin. */
function reels() {
  return `
    <div class="reels" aria-label="Your six reels">
      ${state.reels
        .map(
          (digit, index) => `
            <button
              class="reel ${ui.selected ? "targetable" : ""} ${ui.source === index ? "source" : ""}"
              data-action="reel"
              data-index="${index}"
              style="--digit-color:${COLORS[digit]}"
              aria-label="Reel ${index + 1}: ${digit}${ui.selected ? ", apply selected tool" : ""}"
              ${!ui.selected || ui.busy ? "disabled" : ""}
            >
              <span class="digit">${digit}</span>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

/** Returns the current shop offers and reroll control markup. */
function offers(animateSpawn = false) {
  const offerButtons = state.offers
    .map((offer, index) => {
      if (offer.empty)
        return `
          <div class="offer">
            <span class="offer-kind">
              ${offer.kind === "tool" ? "NEW TOOL" : "TRINKET"}
            </span>
            <p class="log-empty">All collected!</p>
          </div>
        `;
      const def = ITEMS[offer.id];
      const kindLabel =
        offer.kind === "upgrade"
          ? "TOOL UPGRADE"
          : offer.kind === "tool"
            ? "NEW TOOL"
            : "TRINKET";
      const soldClass = offer.sold ? "sold" : "";
      const affordabilityClass = state.bank < offer.price ? "unaffordable" : "";
      const spawnClass =
        animateSpawn && offer.rarity === "legendary" ? "legendary-spawn" : "";
      if (offer.rarity === "legendary") {
        sound.play("legendary");
      }
      const upgradeLabel =
        offer.kind === "upgrade"
          ? ` upgrade, plus ${offer.amount} uses per spin`
          : "";
      const offerLabel = `${offer.sold ? "Sold" : "Buy"} ${esc(def.name)}${upgradeLabel}, ${RARITIES[offer.rarity].label}, $${offer.price}`;
      return `
        <button
          class="offer ${soldClass} ${affordabilityClass} ${spawnClass}"
          data-action="buy"
          data-offer="${index}"
          data-item="${offer.id}"
          style="--offer-index: ${index}"
          aria-label="${offerLabel}"
          aria-disabled="${offer.sold || state.bank < offer.price}"
        >
          <span class="offer-kind">${kindLabel}</span>
          <span class="rarity ${offer.rarity}">
            ${RARITIES[offer.rarity].label}
          </span>
          <img src="${iconPath(offer.id)}" alt="" width="88" height="88">
          <span class="offer-name">
            ${esc(def.name)}${offer.kind === "upgrade" ? ` +${offer.amount}` : ""}
          </span>
          <span class="price ${offer.sold ? "sold-label" : ""}">
            ${offer.sold ? "SOLD" : "$" + offer.price}
          </span>
        </button>
      `;
    })
    .join("");

  return `
    <div class="shop-shelf">
      ${offerButtons}
      <div class="reroll-control">
        <button
          class="button small"
          data-action="reroll-shop"
          ${state.bank < rerollPrice(state) ? "disabled" : ""}
        >
          REROLL!
        </button>
        <div class="price">$${rerollPrice(state)}</div>
      </div>
    </div>
  `;
}

/** Returns one scoring-event row for the animated score log. */
function logRow(event, pending = false) {
  return `
    <div class="log-row ${event.points ? "" : "missed"}">
      <img src="${iconPath(event.id)}" alt="" width="52" height="52">
      <div>
        <span class="log-name">
          ${esc(ITEMS[event.id].name.toUpperCase())}:
        </span>
        +<span class="log-points">${number(pending ? 0 : event.points)}</span>
        ${event.note ? `<small class="log-note" ${pending ? "hidden" : ""}>${esc(event.note)}</small>` : ""}
      </div>
    </div>
  `;
}

/** Renders the active run for its current gameplay phase. */
function renderGame({ animateOffers = false } = {}) {
  const current = phase();
  let content = "",
    action = "";
  if (current === "finished") {
    content = inventory();
    action = `${button("share", "SHARE")}${button("menu", "PLAY AGAIN!")}`;
  } else if (current === "shop") {
    content = offers(animateOffers) + inventory();
    action = button("next", "NEXT ROUND!");
  } else {
    content = reels();
    if (current === "scoring" || current === "scored") {
      const logs = current === "scoring" ? ui.logs : state.events;
      content += `
        <div
          class="score-log ${current === "scoring" ? "running" : ""}"
          id="score-log"
          ${
            current === "scoring"
              ? 'role="button" tabindex="0" aria-label="Speed up scoring" data-action="speed"'
              : 'role="log"'
          }
        >
          ${
            logs.map((event) => logRow(event)).join("") ||
            '<p class="log-empty">Let’s count your luck…</p>'
          }
        </div>
        <p class="log-footer">
          ${
            current === "scoring"
              ? "click the log to speed things up"
              : `${number(state.points)} points added to your total`
          }
        </p>
      `;
      action = button(
        "shop",
        current === "scoring" ? "COUNTING…" : "SHOPPING TIME!",
      );
    } else {
      content += inventory();
      let hint = "";
      if (ui.selected) {
        const def = ITEMS[ui.selected];
        hint = `
          ${esc(def.name)}:
          ${
            ["swap", "copy"].includes(def.effect)
              ? ui.source == null
                ? "choose the first reel"
                : "choose a different target reel"
              : "choose a reel"
          }
          <button data-action="cancel-tool">cancel</button>
        `;
      }
      content += `
        <div class="tool-hint" role="status">
          ${hint}
        </div>
      `;
      action = button(
        current === "ready" ? "spin" : "score",
        ui.busy ? "SPINNING…" : current === "ready" ? "SPIN!" : "GET POINTS!",
      );
    }
  }
  const mode =
    state.mode === "daily"
      ? `DAILY · ${state.date} · UTC`
      : `SEED ${state.seed}`;
  app.innerHTML = `
    <section class="screen game">
      <header class="game-header">
        ${brand()}
      </header>
      <div class="panel ${current}">
        ${stats()}
        ${content}
        <div class="action-area">${action}</div>
        ${
          current === "finished"
            ? `
              <p class="run-summary">
                ${state.history.filter((h) => h.bonus).length} goals reached ·
                best spin: ${number(Math.max(...state.history.map((h) => h.points)))}
              </p>
            `
            : ""
        }
      </div>
      <footer class="game-footer">
        <span>${esc(mode)}</span>
        <div>
          ${soundButton()}
          <button class="text-button" data-action="help">How to play</button>
          <button
            class="text-button"
            data-action="menu"
            ${ui.busy ? "disabled" : ""}
          >
            Menu
          </button>
        </div>
      </footer>
    </section>
  `;
}

/**
 * Renders the current screen while preserving inventory scroll positions.
 * @param {{focus?: boolean, animate?: boolean, animateOffers?: boolean}} [options] Render behavior.
 */
function render({ focus = false, animate = true, animateOffers = false } = {}) {
  const scrolls = Object.fromEntries(
    [...document.querySelectorAll(".bin")].map((el) => [el.id, el.scrollLeft]),
  );
  hideTooltip();
  ui.menu ? renderMenu() : renderGame({ animateOffers });
  if (!animate) app.querySelector(".screen")?.classList.remove("screen");
  else window.scrollTo({ top: 0, behavior: "instant" });
  for (const [id, left] of Object.entries(scrolls)) {
    const bin = document.getElementById(id);
    if (bin) bin.scrollTo({ left, behavior: "instant" });
  }
  if (focus)
    app
      .querySelector(".action-area .button:not(:disabled), .menu .play")
      ?.focus({ preventScroll: true });
}

/**
 * Creates, saves, and displays a fresh run.
 * @param {string} mode Normal or daily run mode.
 * @param {number} seed Deterministic run seed.
 * @param {string|null} [date=null] UTC date for a daily run.
 */
function start(mode, seed, date = null) {
  state = createRun(seed, mode, date);
  sound.play("start");
  ui = {
    ...ui,
    menu: false,
    busy: false,
    selected: null,
    source: null,
    phase: null,
    logs: [],
    fast: false,
  };
  persist();
  render({ focus: true });
}

/**
 * Animates a reel strip until it lands on its final digit.
 * @param {HTMLElement} node Reel button to animate.
 * @param {number} finalDigit Digit displayed when the animation finishes.
 * @param {number} index Reel position used to stagger animation timing.
 * @param {boolean} [quick=false] Whether to use the shorter tool animation.
 * @returns {Promise<void>}
 */
async function animateReel(node, finalDigit, index, quick = false) {
  if (reducedMotion.matches) {
    node.innerHTML = `
      <span class="digit">${finalDigit}</span>
    `;
    node.style.setProperty("--digit-color", COLORS[finalDigit]);
    return;
  }
  const height = node.clientHeight,
    count = quick ? 10 : 22 + index * 3;
  const digits = Array.from({ length: count + 1 }, (_, i) =>
    i === count ? finalDigit : (i + index * 3) % 10,
  );
  node.innerHTML = `
    <div class="reel-strip">
      ${digits.map((n) => `<span>${n}</span>`).join("")}
    </div>
  `;
  const strip = node.firstElementChild;
  const duration = quick ? 430 : 1000 + index * 150;
  let colorFrame,
    visibleIndex = 0;
  const animation = strip.animate(
    [
      { transform: "translateY(0)" },
      { transform: `translateY(-${count * height}px)` },
    ],
    { duration, easing: "cubic-bezier(.12,.6,.23,1)", fill: "forwards" },
  );
  function colorTick() {
    const offset = Math.abs(
      new DOMMatrixReadOnly(getComputedStyle(strip).transform).m42,
    );
    const nextIndex = Math.min(count, Math.round(offset / height));
    if (nextIndex !== visibleIndex) {
      visibleIndex = nextIndex;
      sound.play("tick");
    }
    node.style.setProperty("--digit-color", COLORS[digits[nextIndex]]);
    colorFrame = requestAnimationFrame(colorTick);
  }
  colorFrame = requestAnimationFrame(colorTick);
  await animation.finished;
  cancelAnimationFrame(colorFrame);
  node.innerHTML = `
    <span class="digit">${finalDigit}</span>
  `;
  node.style.setProperty("--digit-color", COLORS[finalDigit]);
  const landed = new Promise((resolve) =>
    node.addEventListener("animationend", resolve, { once: true }),
  );
  node.classList.add("landed");
  sound.play("land");
  await landed;
}

/** Spins the game state and animates all six reels. */
async function doSpin() {
  if (ui.busy || !spin(state)) return;
  ui.busy = true;
  sound.play("spin");
  persist();
  render({ animate: false });
  await Promise.all(
    [...document.querySelectorAll(".reel")].map((node, i) =>
      animateReel(node, state.reels[i], i),
    ),
  );
  ui.busy = false;
  render({ focus: true, animate: false });
}

/**
 * Waits between score-log events and exposes a callback that can skip the wait.
 * @param {number} ms Normal delay in milliseconds.
 * @returns {Promise<void>}
 */
function waitForScore(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => {
        scoreWait = null;
        resolve();
      },
      reducedMotion.matches ? 1 : ui.fast ? 50 : ms,
    );
    scoreWait = () => {
      clearTimeout(timer);
      scoreWait = null;
      resolve();
    };
  });
}

/** Settles the current spin and animates each trinket's scoring event. */
async function doScore() {
  if (ui.busy || state.phase !== "editing") return;
  ui.displayPoints = 0;
  ui.displayTotal = state.total;
  ui.displayBank = state.bank;
  if (!settleSpin(state)) return;
  persist();
  ui.busy = true;
  ui.phase = "scoring";
  ui.logs = [];
  ui.fast = false;
  ui.selected = null;
  ui.source = null;
  render();
  document.querySelector("#score-log").focus({ preventScroll: true });
  await waitForScore(400);
  const reelNodes = [...document.querySelectorAll(".reel")];
  const pointsNode = document.querySelector("#points");
  const totalNode = document.querySelector("#total");
  const subtitle = document.querySelector("#bonus-message");
  const goal = goalFor(state.round);
  let goalReached = ui.displayPoints >= goal;
  const instant = () => reducedMotion.matches || ui.fast || document.hidden;
  for (const event of state.events) {
    ui.logs.push(event);
    const log = document.querySelector("#score-log");
    log.querySelector(".log-empty")?.remove();
    log.insertAdjacentHTML("beforeend", logRow(event, true));
    const row = log.lastElementChild;
    const ledger = row.querySelector(".log-points");
    row.classList.add("scoring-active");
    log.scrollTop = log.scrollHeight;
    let subtotal = 0;
    // Older saves can still display aggregate events without contribution data.
    const steps =
      event.steps ??
      (event.points ? [{ reels: [], points: event.points }] : []);
    for (const step of steps) {
      if (!reducedMotion.matches) {
        for (const index of step.reels)
          reelNodes[index].classList.add("scoring-hit");
      }
      const previous = subtotal;
      const pointsBefore = ui.displayPoints;
      const totalBefore = ui.displayTotal;
      subtotal += step.points;
      sound.play("score");
      await animateCount({
        from: previous,
        to: subtotal,
        duration: 420,
        instant,
        update(value) {
          ledger.textContent = number(value);
          ui.displayPoints = pointsBefore + value - previous;
          ui.displayTotal = totalBefore + value - previous;
          pointsNode.textContent = number(ui.displayPoints);
          totalNode.textContent = number(ui.displayTotal);
          if (!goalReached && ui.displayPoints >= goal) {
            goalReached = true;
            pointsNode.closest(".points")?.classList.add("goal-reached");
            subtitle.textContent = `goal reached: +$${bonusFor(state.round)}!`;
            subtitle.classList.add("bonus-award");
            celebrateGoal(subtitle);
            sound.play("bonus");
          }
        },
      });
      await waitForScore(100);
      for (const index of step.reels)
        reelNodes[index].classList.remove("scoring-hit");
      // Leave a visible gap so overlapping pairs can pulse again.
      await waitForScore(60);
    }
    row.querySelector(".log-note")?.removeAttribute("hidden");
    log.scrollTop = log.scrollHeight;
    row.classList.remove("scoring-active");
    await waitForScore(event.points ? 180 : 220);
  }
  const bonus = state.history.at(-1).bonus;
  subtitle.textContent = bonus
    ? `made the goal: +$${bonus}!`
    : "no bonus this spin — keep going!";
  if (bonus) subtitle.classList.add("bonus-award");
  sound.play("settle");
  const bankNode = document.querySelector("#bank");
  bankNode.classList.add("bank-bump");
  await animateCount({
    from: ui.displayBank,
    to: state.bank,
    duration: 900,
    instant,
    update(value) {
      if (value > ui.displayBank) sound.play("coin");
      ui.displayBank = value;
      bankNode.textContent = "$" + number(value);
    },
  });
  await waitForScore(250);
  if (state.phase === "finished") sound.play("finish");
  ui.phase = null;
  ui.busy = false;
  render({ focus: true });
}

/**
 * Applies the selected tool to a reel, including two-reel source selection.
 * @param {number} index Target reel index.
 */
async function targetReel(index) {
  if (!ui.selected || ui.busy) return;
  const id = ui.selected,
    def = ITEMS[id];
  if (["swap", "copy"].includes(def.effect) && ui.source == null) {
    ui.source = index;
    sound.play("click");
    render({ animate: false });
    document.querySelector(`[data-index="${index}"]`)?.focus();
    return;
  }
  const old = [...state.reels];
  if (!useTool(state, id, index, ui.source)) {
    sound.play("error");
    return;
  }
  sound.play("tool");
  ui.selected = null;
  ui.source = null;
  ui.busy = true;
  persist();
  render({ animate: false });
  const nodes = [...document.querySelectorAll(".reel")];
  await Promise.all(
    nodes.map(async (node, i) => {
      if (old[i] !== state.reels[i] || i === index)
        await animateReel(node, state.reels[i], i, true);
    }),
  );
  ui.busy = false;
  render({ focus: true, animate: false });
}

/** Copies the run summary and challenge URL, with a dialog fallback. */
async function share() {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set(
    state.mode === "daily" ? "daily" : "seed",
    state.mode === "daily" ? state.date : String(state.seed),
  );
  const text = shareText(state, url.href);
  try {
    await navigator.clipboard.writeText(text);
    document.querySelector('[data-action="share"]').textContent = "COPIED!";
  } catch {
    let dialog = document.querySelector("#share-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "share-dialog";
      dialog.innerHTML = `
        <h2>Share your luck</h2>
        <p>Copy your result below and send it to a friend.</p>
        <textarea
          class="share-fallback"
          aria-label="Your shareable result"
          readonly
        ></textarea>
        <form method="dialog">
          <button class="button small">DONE</button>
        </form>
      `;
      document.body.append(dialog);
    }
    dialog.querySelector("textarea").value = text;
    dialog.showModal();
    dialog.querySelector("textarea").select();
  }
}

/**
 * Shows an item or offer description in the positioned tooltip.
 * @param {HTMLElement} element Inventory item or shop offer element.
 */
function inspect(element) {
  const id = element.dataset.item,
    def = ITEMS[id];
  if (!def) return;
  const owned =
    [...state.trinkets, ...state.tools].find((t) => t.id === id) || ownItem(id);
  const offer =
    element.dataset.offer != null
      ? state.offers[Number(element.dataset.offer)]
      : null;
  const description =
    offer?.kind === "upgrade"
      ? `Permanently add ${offer.amount} uses per spin to ${def.name}. ${owned.maxUses} → ${owned.maxUses + offer.amount} uses per spin.`
      : itemDescription(owned);
  const rarity = offer?.rarity || def.rarity;
  tooltip.innerHTML = `
    <strong>${esc(def.name)}</strong>
    <span class="rarity ${rarity}">
      ${RARITIES[rarity].label}${offer?.kind === "upgrade" ? " · Tool upgrade" : ""}
    </span>
    ${esc(description)}
  `;
  tooltip.hidden = false;
  element.setAttribute("aria-describedby", "tooltip");
  const rect = element.getBoundingClientRect(),
    tip = tooltip.getBoundingClientRect();
  const left = Math.max(
    10,
    Math.min(
      innerWidth - tip.width - 10,
      rect.left + rect.width / 2 - tip.width / 2,
    ),
  );
  const top =
    rect.top > tip.height + 16
      ? rect.top - tip.height - 10
      : Math.min(innerHeight - tip.height - 10, rect.bottom + 10);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(10, top)}px`;
}

/** Hides the item tooltip and removes its accessibility references. */
function hideTooltip() {
  tooltip.hidden = true;
  document
    .querySelectorAll('[aria-describedby="tooltip"]')
    .forEach((el) => el.removeAttribute("aria-describedby"));
}

document.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  sound.unlock();
  sound.play("mousedown");
});

document.addEventListener("pointerup", (event) => {
  if (event.button !== 0) return;
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  sound.play("mouseup");
});

app.addEventListener("click", async (event) => {
  const el = event.target.closest("[data-action]");
  if (!el || el.disabled) return;
  const action = el.dataset.action;
  if (action === "sound") {
    sound.toggle();
    el.textContent = `Sound: ${sound.enabled ? "on" : "off"}`;
    el.setAttribute("aria-pressed", String(sound.enabled));
    return;
  }
  sound.unlock();
  if (action === "speed") {
    ui.fast = true;
    scoreWait?.();
    return;
  }
  if (action === "help") {
    hideTooltip();
    sound.play("click");
    help.showModal();
    return;
  }
  if (ui.busy) return;
  switch (action) {
    case "play":
      start("normal", crypto.getRandomValues(new Uint32Array(1))[0]);
      break;
    case "daily": {
      const date = utcDate();
      start("daily", dailySeed(date, calendar), date);
      break;
    }
    case "challenge": {
      const params = new URLSearchParams(location.search),
        date = params.get("daily");
      if (validDate(date)) start("daily", dailySeed(date, calendar), date);
      else start("normal", Number(params.get("seed")) >>> 0);
      break;
    }
    case "resume":
      sound.play("click");
      state = structuredClone(saved);
      ui.menu = false;
      ui.phase = null;
      ui.selected = null;
      ui.source = null;
      render({ focus: true });
      break;
    case "menu":
      sound.play("click");
      ui.menu = true;
      ui.selected = null;
      ui.source = null;
      render({ focus: true });
      break;
    case "spin":
      await doSpin();
      break;
    case "score":
      await doScore();
      break;
    case "shop":
      if (enterShop(state)) {
        sound.play("click");
        persist();
        render({ focus: true, animateOffers: true });
      }
      break;
    case "next":
      if (nextRound(state)) {
        sound.play("click");
        persist();
        render({ focus: true });
      }
      break;
    case "tool": {
      const tool = state.tools.find((t) => t.id === el.dataset.item);
      if (state.phase !== "editing") {
        inspect(el);
        break;
      }
      if (!tool.uses) {
        sound.play("error");
        inspect(el);
        break;
      }
      sound.play("click");
      ui.selected = ui.selected === tool.id ? null : tool.id;
      ui.source = null;
      render({ animate: false });
      const selected = document.querySelector(`[data-item="${tool.id}"]`);
      selected.focus({ preventScroll: true });
      if (ui.selected) inspect(selected);
      break;
    }
    case "cancel-tool":
      sound.play("click");
      ui.selected = null;
      ui.source = null;
      render({ focus: true, animate: false });
      break;
    case "reel":
      await targetReel(Number(el.dataset.index));
      break;
    case "inspect":
      inspect(el);
      break;
    case "buy": {
      const index = Number(el.dataset.offer),
        offer = state.offers[index];
      if (!buy(state, index)) {
        sound.play("error");
        break;
      }
      sound.play("buy");
      persist();
      render({ animate: false });
      const bin = document.querySelector(
        `#${offer.kind === "trinket" ? "trinkets" : "tools"}-bin`,
      );
      const item = bin.querySelector(`[data-item="${offer.id}"]`);
      item.classList.add("new-item");
      bin.scrollTo({
        left:
          item.offsetLeft -
          bin.offsetLeft -
          (bin.clientWidth - item.clientWidth) / 2,
        behavior: reducedMotion.matches ? "instant" : "smooth",
      });
      item.focus({ preventScroll: true });
      break;
    }
    case "reroll-shop":
      if (rerollShop(state)) {
        sound.play("reroll");
        persist();
        render({ animateOffers: true });
        document
          .querySelector('[data-action="reroll-shop"]')
          ?.focus({ preventScroll: true });
      }
      break;
    case "share":
      await share();
      break;
  }
});
app.addEventListener("pointerover", (event) => {
  const item = event.target.closest("[data-item]");
  if (item && !item.contains(event.relatedTarget)) inspect(item);
});
app.addEventListener("pointerout", (event) => {
  const item = event.target.closest("[data-item]");
  if (item && !item.contains(event.relatedTarget)) hideTooltip();
});
app.addEventListener("focusin", (event) => {
  const item = event.target.closest("[data-item]");
  if (item) inspect(item);
});
app.addEventListener("focusout", hideTooltip);
document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest("[data-item]")) hideTooltip();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideTooltip();
    if (ui.selected && !ui.busy) {
      ui.selected = null;
      ui.source = null;
      render({ focus: true, animate: false });
    }
  }
  if (event.target.id === "score-log" && [" ", "Enter"].includes(event.key)) {
    event.preventDefault();
    ui.fast = true;
    scoreWait?.();
  }
});
window.addEventListener("resize", hideTooltip);
document.addEventListener("scroll", hideTooltip, true);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) sound.stop();
  if (!document.hidden && ui.menu) render({ animate: false });
});
render();
// The fallback uses the same published algorithm, so the daily remains identical offline.
fetch("data/daily-seeds.json")
  .then((response) => {
    if (!response.ok) throw new Error("Calendar unavailable");
    return response.json();
  })
  .then((data) => {
    calendar = data;
  })
  .catch(() => {});
