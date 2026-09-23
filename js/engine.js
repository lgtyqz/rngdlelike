import {
  ITEMS,
  TRINKETS,
  TOOLS,
  RARITIES,
  ownItem,
  itemPrice,
} from "./items.js";
import { hash, random } from "./random.js";
export const TOTAL_SPINS = 20;
/** Returns the point target for a given round. */
export const goalFor = (round) => 10 + (round - 1) * 40;
/** Returns the cash bonus awarded for meeting a round's point target. */
export const bonusFor = (round) => 20 + (round - 1) * 30;
/** Returns the guaranteed cash allowance awarded after a round. */
export const allowanceFor = (round) => 10 + round * 5;
/** Returns the current cost to reroll the shop. */
export const rerollPrice = (state) => 3 + state.rerolls * 3;

/**
 * Creates a new game state for a normal, daily, or shared-seed run.
 * @param {number} seed Seed used to make the run deterministic.
 * @param {string} [mode="normal"] Run mode shown in the interface.
 * @param {string|null} [date=null] UTC date associated with a daily run.
 * @returns {object} A fresh mutable game state.
 */
export function createRun(seed, mode = "normal", date = null) {
  return {
    version: 1,
    seed: seed >>> 0,
    mode,
    date,
    round: 1,
    phase: "ready",
    bank: 10,
    total: 0,
    points: 0,
    reels: [0, 1, 2, 3, 4, 5],
    trinkets: ["even", "bean"].map(ownItem),
    tools: ["reroll", "increment"].map(ownItem),
    toolRolls: 0,
    rerolls: 0,
    offers: [],
    history: [],
    events: [],
  };
}

/**
 * Generates the six deterministic reel digits for the current round.
 * @param {object} state Mutable game state.
 * @returns {boolean} Whether the spin was accepted.
 */
export function spin(state) {
  if (state.phase !== "ready") return false;
  const rng = random(hash(`${state.seed}:spin:${state.round}`));
  state.reels = Array.from({ length: 6 }, () => Math.floor(rng() * 10));
  state.phase = "editing";
  return true;
}

/**
 * Applies an owned tool to one or two reels and consumes one use.
 * @param {object} state Mutable game state.
 * @param {string} id Tool identifier.
 * @param {number} target Target reel index.
 * @param {number|null} [source=null] Source reel index for two-reel tools.
 * @returns {boolean} Whether the tool was applied.
 */
export function useTool(state, id, target, source = null) {
  const tool = state.tools.find((t) => t.id === id);
  if (
    state.phase !== "editing" ||
    !tool ||
    tool.uses < 1 ||
    !Number.isInteger(target) ||
    target < 0 ||
    target > 5
  )
    return false;
  const effect = ITEMS[id].effect;
  if (
    ["swap", "copy"].includes(effect) &&
    (!Number.isInteger(source) || source < 0 || source > 5 || source === target)
  )
    return false;
  const old = state.reels[target];
  switch (effect) {
    case "reroll":
      state.reels[target] = Math.floor(
        random(
          hash(`${state.seed}:tool:${state.round}:${state.toolRolls++}`),
        )() * 10,
      );
      break;
    case "increment":
      state.reels[target] = (old + 1) % 10;
      break;
    case "decrement":
      state.reels[target] = (old + 9) % 10;
      break;
    case "flip":
      state.reels[target] = 9 - old;
      break;
    case "double":
      state.reels[target] = (old * 2) % 10;
      break;
    case "zero":
      state.reels[target] = 0;
      break;
    case "one":
      state.reels[target] = 1;
      break;
    case "seven":
      state.reels[target] = 7;
      break;
    case "nine":
      state.reels[target] = 9;
      break;
    case "swap":
      [state.reels[target], state.reels[source]] = [state.reels[source], old];
      break;
    case "copy":
      state.reels[target] = state.reels[source];
      break;
    case "neighbor":
      state.reels[(target + 5) % 6] = old;
      state.reels[(target + 1) % 6] = old;
      break;
    default:
      return false;
  }
  tool.uses--;
  return true;
}

/**
 * Scores one owned trinket against the supplied reel digits.
 * Some trinkets also update their persistent power metadata.
 * @param {object} item Owned trinket instance.
 * @param {number[]} reels Current reel digits.
 * @returns {{id: string, points: number, note: string, steps: {reels: number[], points: number}[]}} Scoring event and ordered contributions.
 */
export function scoreTrinket(item, reels) {
  const effect = ITEMS[item.id].effect;
  const steps = [];
  let note = "";
  const add = (indices, points) => {
    if (points > 0) steps.push({ reels: indices, points });
  };
  const each = (predicate, value) =>
    reels.forEach((digit, index) => {
      if (predicate(digit))
        add([index], typeof value === "function" ? value(digit) : value);
    });
  const all = reels.map((_, index) => index);
  switch (effect) {
    case "even":
      each((n) => n % 2 === 0, 4);
      break;
    case "odd":
      each((n) => n % 2 === 1, 4);
      break;
    case "zero":
      each((n) => n === 0, 12);
      break;
    case "high":
      each((n) => n >= 5, 5);
      break;
    case "low":
      each((n) => n < 4, 6);
      break;
    case "seven":
      each((n) => n === 7, 25);
      break;
    case "prime":
      each((n) => [2, 3, 5, 7].includes(n), 20);
      break;
    case "sum":
      each(
        () => true,
        (n) => n,
      );
      break;
    case "star":
      each(
        () => true,
        (n) => n * 15,
      );
      break;
    case "pair":
    case "crown":
      for (let i = 0; i < reels.length; i++) {
        for (let j = i + 1; j < reels.length; j++) {
          if (reels[i] === reels[j]) add([i, j], effect === "pair" ? 8 : 80);
        }
      }
      break;
    case "bean":
    case "rocket":
      reels.forEach((digit, index) => {
        if (digit !== (effect === "bean" ? 1 : 9)) return;
        add([index], item.metadata.power);
        item.metadata.power += 10;
      });
      if (steps.length) note = `Power grew to ${item.metadata.power}`;
      break;
    case "sandwich":
      for (let i = 0; i < reels.length - 2; i++) {
        if (reels[i] === reels[i + 2]) add([i, i + 1, i + 2], 35);
      }
      break;
    case "stairs":
      for (let i = 0; i < reels.length - 1; i++) {
        if (reels[i + 1] === reels[i] + 1) add([i, i + 1], 18);
      }
      break;
    case "garden":
    case "dragon":
      add([], item.metadata.power);
      if (effect === "garden") item.metadata.power += 4;
      else item.metadata.power *= 2;
      note = `Power ${effect === "garden" ? "grew" : "doubled"} to ${item.metadata.power}`;
      break;
    case "book":
      if (reels[0] === reels[5]) add([0, 5], 60);
      break;
    case "rainbow":
    case "galaxy": {
      const seen = new Set();
      reels.forEach((digit, index) => {
        if (!seen.has(digit)) add([index], effect === "rainbow" ? 9 : 70);
        seen.add(digit);
      });
      break;
    }
    case "triple": {
      const groups = new Map();
      reels.forEach((digit, index) => {
        if (!groups.has(digit)) groups.set(digit, []);
        const group = groups.get(digit);
        group.push(index);
        if (group.length === 3) {
          add([...group], 100);
          group.length = 0;
        }
      });
      break;
    }
    case "mirror":
      for (let i = 0; i < 3; i++) {
        if (reels[i] === reels[5 - i]) add([i, 5 - i], 40);
      }
      break;
    case "diamond":
      if (new Set(reels).size === 6) add(all, 120);
      break;
    case "unicorn":
      if (reels.includes(0) && reels.includes(9)) {
        add(
          all.filter((i) => reels[i] === 0 || reels[i] === 9),
          500,
        );
      }
      break;
  }
  return {
    id: item.id,
    points: steps.reduce((sum, step) => sum + step.points, 0),
    note,
    steps,
  };
}

/**
 * Scores every trinket, awards the bonus and allowance, and records round history.
 * @param {object} state Mutable game state.
 * @returns {boolean} Whether the spin was settled.
 */
export function settleSpin(state) {
  if (state.phase !== "editing") return false;
  state.events = state.trinkets.map((item) => scoreTrinket(item, state.reels));
  state.points = state.events.reduce((sum, event) => sum + event.points, 0);
  const bonus =
    state.points >= goalFor(state.round) ? bonusFor(state.round) : 0;
  state.bank += bonus;
  state.bank += allowanceFor(state.round);
  state.total += state.points;
  state.history.push({
    round: state.round,
    reels: [...state.reels],
    points: state.points,
    bonus,
  });
  state.phase = state.round === TOTAL_SPINS ? "finished" : "scored";
  return true;
}

/**
 * Selects an entry using rarity weights normalized across the available pool.
 * @param {object[]} pool Candidate definitions containing a rarity.
 * @param {() => number} rng Seeded random-number generator.
 * @returns {object|undefined} The selected definition, if the pool is nonempty.
 */
function choose(pool, rng) {
  const weight = pool.reduce(
    (sum, def) =>
      sum +
      RARITIES[def.rarity].weight /
        pool.filter((p) => p.rarity === def.rarity).length,
    0,
  );
  let roll = rng() * weight;
  return (
    pool.find(
      (def) =>
        (roll -=
          RARITIES[def.rarity].weight /
          pool.filter((p) => p.rarity === def.rarity).length) < 0,
    ) || pool.at(-1)
  );
}

/** Selects an owned tool using each tool's individual rarity weight. */
function chooseUpgrade(tools, rng) {
  const weight = tools.reduce(
    (sum, owned) => sum + RARITIES[ITEMS[owned.id].rarity].weight,
    0,
  );
  let roll = rng() * weight;
  return (
    tools.find(
      (owned) => (roll -= RARITIES[ITEMS[owned.id].rarity].weight) < 0,
    ) || tools.at(-1)
  );
}

/**
 * Generates the deterministic trinket, tool, and upgrade offers for a shop.
 * @param {object} state Current game state.
 * @returns {object[]} Four shop offers.
 */
export function generateOffers(state) {
  const rng = random(
    hash(`${state.seed}:shop:${state.round}:${state.rerolls}`),
  );
  const offers = [];
  const owned = new Set(
    [...state.trinkets, ...state.tools].map((item) => item.id),
  );
  for (let slot = 0; slot < 2; slot++) {
    const def = choose(
      TRINKETS.filter(
        (t) => !owned.has(t.id) && !offers.some((o) => o.id === t.id),
      ),
      rng,
    );
    offers.push(
      def
        ? {
            id: def.id,
            kind: "trinket",
            rarity: def.rarity,
            price: itemPrice(def),
            sold: false,
          }
        : { kind: "trinket", empty: true },
    );
  }
  const upgrade = chooseUpgrade(state.tools, rng);
  const upgradeDef = ITEMS[upgrade.id];
  offers.push({
    id: upgrade.id,
    kind: "upgrade",
    rarity: upgradeDef.rarity,
    amount: 1,
    price:
      Math.ceil(itemPrice(upgradeDef) * 0.5) +
      (upgrade.maxUses - ITEMS[upgrade.id].maxUses) * 3,
    sold: false,
  });
  const def = choose(
    TOOLS.filter((t) => !owned.has(t.id)),
    rng,
  );
  offers.push(
    def
      ? {
          id: def.id,
          kind: "tool",
          rarity: def.rarity,
          price: itemPrice(def),
          sold: false,
        }
      : { kind: "tool", empty: true },
  );
  return offers;
}

/**
 * Advances a scored run into the next round's shop and refreshes tool uses.
 * @param {object} state Mutable game state.
 * @returns {boolean} Whether the shop was entered.
 */
export function enterShop(state) {
  if (state.phase !== "scored" || state.round >= TOTAL_SPINS) return false;
  state.round++;
  state.points = 0;
  state.rerolls = 0;
  state.toolRolls = 0;
  state.phase = "shop";
  state.tools.forEach((t) => (t.uses = t.maxUses));
  state.offers = generateOffers(state);
  return true;
}

/**
 * Purchases a shop offer and applies it to the player's inventory.
 * @param {object} state Mutable game state.
 * @param {number} index Index of the offer to purchase.
 * @returns {boolean} Whether the purchase succeeded.
 */
export function buy(state, index) {
  const offer = state.offers[index];
  if (
    state.phase !== "shop" ||
    !offer ||
    offer.empty ||
    offer.sold ||
    state.bank < offer.price
  )
    return false;
  if (
    offer.kind !== "upgrade" &&
    [...state.tools, ...state.trinkets].some((t) => t.id === offer.id)
  )
    return false;
  if (offer.kind === "upgrade") {
    const tool = state.tools.find((t) => t.id === offer.id);
    if (!tool) return false;
    tool.maxUses += 1;
    tool.uses = tool.maxUses;
  } else
    state[offer.kind === "tool" ? "tools" : "trinkets"].push(ownItem(offer.id));
  state.bank -= offer.price;
  offer.sold = true;
  return true;
}

/**
 * Charges for and regenerates all shop offers.
 * @param {object} state Mutable game state.
 * @returns {boolean} Whether the shop was rerolled.
 */
export function rerollShop(state) {
  if (state.phase !== "shop" || state.bank < rerollPrice(state)) return false;
  state.bank -= rerollPrice(state);
  state.rerolls++;
  state.offers = generateOffers(state);
  return true;
}

/**
 * Leaves the shop and prepares the run for its next spin.
 * @param {object} state Mutable game state.
 * @returns {boolean} Whether the next round was started.
 */
export function nextRound(state) {
  if (state.phase !== "shop") return false;
  state.phase = "ready";
  state.events = [];
  return true;
}

/**
 * Builds the multiline result and challenge text copied by the share action.
 * @param {object} state Completed or in-progress game state.
 * @param {string} url Challenge URL for the same daily game or seed.
 * @returns {string} Shareable plain text.
 */
export function shareText(state, url) {
  const heading =
    state.mode === "daily" ? `Daily ${state.date}` : `Seed ${state.seed}`;
  const results = state.history.map((h) => (h.bonus ? "🟩" : "⬜"));
  return `RNGdlelike · ${heading}\n${state.total.toLocaleString("en-US")} points in ${state.history.length}/20 spins!\n${results.slice(0, 10).join("")}\n${results.slice(10).join("")}\nGoals: ${state.history.filter((h) => h.bonus).length}/20 · Best spin: ${Math.max(0, ...state.history.map((h) => h.points))}\nTrinkets: ${state.trinkets.map((t) => `${ITEMS[t.id].emoji}`).join("")}\nTools: ${state.tools.map((t) => `${ITEMS[t.id].emoji}`).join(", ")}\nThink you can beat my luck? Play the same seed!\n${url}`;
}
