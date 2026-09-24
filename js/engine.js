import {
  ITEMS,
  TRINKETS,
  TOOLS,
  RARITIES,
  ownItem,
  itemPrice,
} from "./items.js";
import { hash, random } from "./random.js";
import { scoreTrinket, isDigit, has, reelValue } from "./scoring.js";
export { scoreTrinket } from "./scoring.js";
export const TOTAL_SPINS = 20;
/** Returns the point target for a given round. */
export const goalFor = (round) => 10 + round * (round - 1) * 5;
/** Returns the cash bonus awarded for meeting a round's point target. */
export const bonusFor = (round) => 20 + (round - 1) * 5;
/** Returns the guaranteed cash allowance awarded after a round. */
export const allowanceFor = (round) => 10 + round * 5;
/** Returns the current cost to reroll the shop. */
export const rerollPrice = (state) =>
  Math.max(
    0,
    5 + state.rerolls * 5 - count(state, "wheel") - 2 * count(state, "bicycle"),
  );

const count = (state, id) => state.trinkets.filter((t) => t.id === id).length;
const availableTrinkets = TRINKETS.filter((t) => t.rarity !== "fallback");
const shopBoost = (state) =>
  1.25 ** count(state, "mining") * 1.5 ** count(state, "magnifier");

/**
 * Creates a new game state for a normal, daily, or shared-seed run.
 * @param {number} seed Seed used to make the run deterministic.
 * @param {string} [mode="normal"] Run mode shown in the interface.
 * @param {string|null} [date=null] UTC date associated with a daily run.
 * @returns {object} A fresh mutable game state.
 */
export function createRun(seed, mode = "normal", date = null) {
  const state = {
    version: 2,
    seed: seed >>> 0,
    mode,
    date,
    round: 1,
    phase: "ready",
    bank: 10,
    total: 0,
    points: 0,
    reels: [0, 1, 2, 3, 4, 5],
    trinkets: [],
    tools: [],
    reelPools: Array.from({ length: 6 }, () =>
      Array.from({ length: 10 }, (_, i) => i),
    ),
    positions: [0, 1, 2, 3, 4, 5],
    qubits: Array(6).fill(false),
    locks: Array(6).fill(null),
    nextLocks: Array(6).fill(null),
    pendingEvents: [],
    seenEvents: [],
    bombEvents: [],
    effectRolls: 0,
    legendaryShops: 0,
    toolRolls: 0,
    rerolls: 0,
    offers: [],
    history: [],
    events: [],
  };
  const trinketRng = random(hash(`${state.seed}:starting-trinkets`));
  const toolRng = random(hash(`${state.seed}:starting-tools`));
  for (let i = 0; i < 2; i++) {
    const def = choose(
      availableTrinkets.filter(
        (t) =>
          !["package", "test-tube", "alembic"].includes(t.id) &&
          !has(state, t.id),
      ),
      trinketRng,
    );
    acquire(state, def.id);
  }
  for (let i = 0; i < 2; i++) {
    const def = choose(
      TOOLS.filter(
        (t) =>
          t.rarity === "common" &&
          !state.tools.some((owned) => owned.id === t.id),
      ),
      toolRng,
    );
    acquire(state, def.id);
  }
  return state;
}

const REROLLS = ["reroll", "bigreroll", "megareroll"];
const PASSIVES = new Set([
  "clover",
  "bicycle",
  "printer",
  "hammer",
  "backpack",
  "mechanical-arm",
  "mining",
  "magnifier",
  "eightball",
  "cross",
  "graduate",
  "wrench",
  "screwdriver",
  "cartwheel",
  "wheel",
]);
const effectRng = (state, label) =>
  random(hash(`${state.seed}:${label}:${state.round}:${state.effectRolls++}`));
const neighbors = (i) => [(i + 5) % 6, i, (i + 1) % 6];
export const reelLabel = (value) =>
  typeof value === "string" && value.startsWith("bomb:")
    ? value.slice(5)
    : value === "qubit"
      ? "Superposition"
      : (value ?? "—");

function favorite(state) {
  for (const item of state.trinkets.filter((t) => t.id === "moai"))
    item.metadata.favorite = Math.floor(effectRng(state, "moai")() * 10);
}

function recordBombEvent(state, index, message, cash = 0) {
  const event = {
    id: "bomb",
    points: 0,
    cash,
    multiplier: 1,
    reels: [index],
    message,
    steps: [],
  };
  (state.bombEvents ??= []).push(event);
  state.pendingEvents.push(event);
}

function countDownBomb(state, index, position) {
  const pool = state.reelPools[index];
  const slot = pool[position];
  slot.count--;
  if (slot.count === 0) {
    pool.splice(position, 1);
    state.positions[index] = -1;
    state.reels[index] = null;
    state.bank += 100;
    recordBombEvent(state, index, "Bomb exploded! +$100", 100);
  } else {
    state.reels[index] = `bomb:${slot.count}`;
    recordBombEvent(state, index, `Bomb tick! ${slot.count} left`);
  }
}

function land(state, index, rng) {
  const pool = state.reelPools[index];
  const locked = state.locks[index];
  if (locked != null) {
    state.reels[index] = locked;
    state.positions[index] = pool.findIndex((slot) => slot === locked);
    state.qubits[index] = false;
    return;
  }
  const choices = pool.map((slot, i) => ({ slot, i }));
  if (!choices.length) {
    state.reels[index] = null;
    state.positions[index] = -1;
    state.qubits[index] = false;
    return;
  }
  const weights = choices.map(({ slot }) =>
    slot === 6
      ? 0.1 ** count(state, "cross")
      : slot === 7
        ? 2 ** count(state, "clover")
        : 1,
  );
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  const selected =
    choices[weights.findIndex((w) => (roll -= w) < 0)] ?? choices.at(-1);
  state.positions[index] = selected.i;
  state.qubits[index] = selected.slot === "qubit";
  if (typeof selected.slot === "object" && selected.slot?.type === "bomb") {
    countDownBomb(state, index, selected.i);
  } else state.reels[index] = selected.slot;
}

// A number is seen when it lands or a tool places it on a reel. Scoring the
// finished board must not count those same numbers a second time.
function recordSeen(state, indices) {
  for (const index of indices) {
    const value = reelValue(state.reels[index]);
    for (const item of [...state.trinkets]) {
      if (item.id === "robot" && (value === 0 || value === 1)) {
        item.metadata.power++;
        state.seenEvents.push({
          index,
          id: item.id,
          note: `+1 P0W3R: N3W P0W3R: ${item.metadata.power}`,
        });
      }
      if (item.id === "octopus" && value === 8) {
        const cash = has(state, "eightball") ? 16 : 8;
        state.bank += cash;
        state.seenEvents.push({ index, id: item.id, note: `+$${cash}` });
        state.pendingEvents.push({
          id: item.id,
          points: 0,
          cash,
          multiplier: 1,
          reels: [index],
          steps: [],
          note: `+$${cash}`,
        });
      }
      const digit =
        item.id === "realknife" ? 9 : item.id === "crystalball" ? 8 : null;
      if (digit === null || value !== digit) continue;
      const threshold = digit;
      const amount = digit === 8 && has(state, "eightball") ? 2 : 1;
      item.metadata.count += amount;
      const notes = [];
      while (item.metadata.count >= threshold) {
        item.metadata.count -= threshold;
        if (digit === 9) {
          state.legendaryShops++;
          state.bank += 99;
          const message = "Your reward awaits you.";
          notes.push("+$99, Legendary reserved");
          state.pendingEvents.push({
            id: "realknife",
            points: 0,
            cash: 99,
            multiplier: 1,
            message,
            reels: [index],
            steps: [],
          });
        } else {
          const reward = randomTrinket(state);
          if (reward) notes.push(`Gained ${reward.name}`);
        }
      }
      state.seenEvents.push({
        index,
        id: item.id,
        amount,
        count: item.metadata.count,
        threshold,
        note: notes.join(" - "),
      });
    }
  }
}

export function spin(state) {
  if (state.phase !== "ready") return false;
  const rng = random(hash(`${state.seed}:spin:${state.round}`));
  state.pendingEvents = [];
  state.toolsUsed = 0;
  state.seenEvents = [];
  state.bombEvents = [];
  state.qubits = Array(6).fill(false);
  for (let i = 0; i < 6; i++) land(state, i, rng);
  state.locks = Array(6).fill(null);
  state.phase = "editing";
  favorite(state);
  recordSeen(state, [0, 1, 2, 3, 4, 5]);
  return true;
}

export function chooseQubit(state, index) {
  if (state.phase !== "editing" || !state.qubits[index]) return false;
  state.reels[index] = state.reels[index] === 1 ? 0 : 1;
  return true;
}

export function useTool(state, id, target, source = null) {
  const tool = state.tools.find((t) => t.id === id),
    def = ITEMS[id];
  if (state.phase !== "editing" || !tool || tool.uses < 1) return false;
  const reel =
    def.target === "reel" &&
    Number.isInteger(target) &&
    target >= 0 &&
    target < 6;
  if (def.target === "reel" && !reel) return false;
  if (
    ["swap", "copy"].includes(id) &&
    (!Number.isInteger(source) ||
      source < 0 ||
      source >= 6 ||
      source === target)
  )
    return false;
  const old = state.reels[target];
  const previousBombEvents = state.bombEvents?.length ?? 0;
  const bombCount =
    typeof old === "string" && /^bomb:[1-3]$/.test(old)
      ? Number(old.slice(5))
      : null;
  let seenIndices = reel ? [target] : [];
  const pool = reel ? state.reelPools[target] : null;
  const position = reel ? state.positions[target] : -1;
  if (
    ["bomb", "w", "soap", "pill", "mirror", "qubit"].includes(id) &&
    (!pool || position < 0 || position >= pool.length)
  )
    return false;
  if (id === "decrement" && !isDigit(old) && bombCount === null) return false;
  if (["increment", "double", "flip", "pill"].includes(id) && !isDigit(old))
    return false;
  if (id === "soap" && pool.length <= 1) return false;
  if (id === "lock" && !isDigit(old)) return false;
  switch (id) {
    case "incrementall":
    case "decrementall":
      seenIndices = [];
      state.reels.forEach((value, i) => {
        if (!isDigit(value)) return;
        state.reels[i] = (value + (id === "incrementall" ? 1 : 9)) % 10;
        state.qubits[i] = false;
        seenIndices.push(i);
      });
      break;
    case "reroll":
    case "bigreroll":
    case "megareroll": {
      const rng = random(
        hash(`${state.seed}:tool:${state.round}:${state.toolRolls++}`),
      );
      const indices =
        id === "reroll"
          ? [target]
          : id === "bigreroll"
            ? neighbors(target)
            : [0, 1, 2, 3, 4, 5];
      seenIndices = indices;
      for (const i of indices) land(state, i, rng);
      break;
    }
    case "increment":
      state.reels[target] = (old + 1) % 10;
      break;
    case "decrement":
      if (bombCount !== null) {
        const slot = pool?.[position];
        if (slot?.type === "bomb" && slot.count === bombCount)
          countDownBomb(state, target, position);
        else {
          state.reels[target] =
            bombCount === 1 ? null : `bomb:${bombCount - 1}`;
          recordBombEvent(
            state,
            target,
            bombCount === 1
              ? "Bomb copy cleared"
              : `Bomb copy \n ${bombCount - 1} left`,
          );
        }
      } else state.reels[target] = (old + 9) % 10;
      break;
    case "double":
      state.reels[target] = (old * 2) % 10;
      break;
    case "flip":
      state.reels[target] = 9 - old;
      break;
    case "seven-tool":
      state.reels[target] = 7;
      break;
    case "eight-tool":
      state.reels[target] = 8;
      break;
    case "swap":
      seenIndices = [source, target];
      [state.reels[target], state.reels[source]] = [state.reels[source], old];
      [state.qubits[target], state.qubits[source]] = [
        state.qubits[source],
        state.qubits[target],
      ];
      break;
    case "copy":
      state.reels[target] = state.reels[source];
      break;
    case "echo":
      seenIndices = neighbors(target).filter((i) => i !== target);
      for (const i of neighbors(target).filter((i) => i !== target)) {
        state.reels[i] = old;
        state.qubits[i] = false;
      }
      break;
    case "bomb":
      pool[position] = { type: "bomb", count: 3 };
      state.reels[target] = "bomb:3";
      recordBombEvent(state, target, "Bomb: 3 left");
      break;
    case "w":
      pool[position] = "W";
      state.reels[target] = "W";
      break;
    case "qubit":
      pool[position] = "qubit";
      state.reels[target] = "qubit";
      state.qubits[target] = true;
      break;
    case "soap":
      pool.splice(position, 1);
      state.positions[target] = -1;
      state.reels[target] = null;
      break;
    case "mirror":
      seenIndices = [];
      pool.push(structuredClone(pool[position]));
      break;
    case "lock":
      seenIndices = [];
      state.nextLocks[target] = old;
      break;
    case "atm": {
      const other = state.tools.find((t) => t.id === target);
      if (!other || other === tool || state.bank < 30) return false;
      state.bank -= 30;
      other.uses++;
      other.bonusUses = (other.bonusUses ?? 0) + 1;
      break;
    }
    case "butterfly": {
      const item = Number.isInteger(target)
        ? state.trinkets[target]
        : state.trinkets.find((t) => t.id === target);
      if (!item) return false;
      const candidates = availableTrinkets.filter(
        (t) => t.rarity === ITEMS[item.id].rarity && !has(state, t.id),
      );
      const replacement =
        choose(candidates, effectRng(state, "butterfly")) ?? ITEMS.bug;
      state.trinkets.splice(state.trinkets.indexOf(item), 1);
      acquire(state, replacement.id);
      break;
    }
    case "camera": {
      const item = Number.isInteger(target)
        ? state.trinkets[target]
        : state.trinkets.find((t) => t.id === target);
      if (!item || PASSIVES.has(item.id)) return false;
      const event = activate(state, item);
      if (item.id === "no-tools") {
        event.points = 0;
        event.steps = [];
      }
      if (["realknife", "crystalball"].includes(item.id))
        seenIndices = [0, 1, 2, 3, 4, 5];
      state.pendingEvents.push(event);
      break;
    }
    default:
      return false;
  }
  if (
    reel &&
    ![
      "reroll",
      "bigreroll",
      "megareroll",
      "qubit",
      "swap",
      "mirror",
      "lock",
      "echo",
    ].includes(id)
  )
    state.qubits[target] = false;
  state.toolsUsed = (state.toolsUsed ?? 0) + 1;
  tool.uses--;
  if (tool.bonusUses > 0) tool.bonusUses--;
  state.bombEvents = (state.bombEvents ?? []).slice(previousBombEvents);
  state.seenEvents = [];
  recordSeen(state, seenIndices);
  const cameraId = Number.isInteger(target)
    ? state.trinkets[target]?.id
    : target;
  if (id === "camera" && ["realknife", "crystalball"].includes(cameraId)) {
    const item = Number.isInteger(target)
      ? state.trinkets[target]
      : state.trinkets.find((t) => t.id === target);
    const threshold = cameraId === "realknife" ? 9 : 8;
    const rewards = [
      ...new Set(state.seenEvents.map((event) => event.note).filter(Boolean)),
    ];
    state.pendingEvents.at(-1).note = [
      `${item.metadata.count}/${threshold}`,
      ...rewards,
    ].join("\n");
  }
  return true;
}

function randomTrinket(state, rarities = null) {
  const def =
    choose(
      availableTrinkets.filter(
        (t) => !has(state, t.id) && (!rarities || rarities.includes(t.rarity)),
      ),
      effectRng(state, "reward"),
    ) ?? ITEMS.bug;
  if (def) acquire(state, def.id);
  return def;
}

function openPackage(state) {
  const order = ["common", "uncommon", "rare", "legendary"];
  const others = state.trinkets.filter((t) => t.id !== "package");
  for (const item of others) {
    const rarity = order[Math.min(3, order.indexOf(ITEMS[item.id].rarity) + 1)];
    const pool = availableTrinkets.filter(
      (t) => t.rarity === rarity && t.id !== "package" && !has(state, t.id),
    );
    const replacement = choose(pool, effectRng(state, "package")) ?? ITEMS.bug;
    if (replacement) {
      const index = state.trinkets.indexOf(item);
      state.trinkets[index] = ownItem(replacement.id);
      if (replacement.id === "moai")
        state.trinkets[index].metadata.favorite = Math.floor(
          effectRng(state, "moai")() * 10,
        );
    }
  }
}

function experiment(state, item) {
  if (item.id === "alembic") return randomTrinket(state);
  const pool = state.trinkets.filter((t) => t !== item);
  const rng = effectRng(state, "replication");
  const original = pool[Math.floor(rng() * pool.length)];
  const copy = original ? structuredClone(original) : ownItem("bug");
  state.trinkets.push(copy);
  return ITEMS[copy.id];
}

function acquire(state, id) {
  const def = ITEMS[id],
    item = ownItem(id);
  state[def.kind === "tool" ? "tools" : "trinkets"].push(item);
  if (id === "package") openPackage(state);
  if (["test-tube", "alembic"].includes(id)) experiment(state, item);
  if (id === "moai")
    item.metadata.favorite = Math.floor(effectRng(state, "moai")() * 10);
  if (id === "cartwheel")
    for (const t of state.tools.filter((t) => REROLLS.includes(t.id)))
      t.uses += 3;
  if (def.kind === "tool" && REROLLS.includes(id) && has(state, "cartwheel"))
    item.uses += 5;
  return item;
}

function activate(state, item) {
  const event = scoreTrinket(item, state.reels, state);
  state.bank += event.cash;
  const rng = () => effectRng(state, item.id);
  const notes = [];
  if (["test-tube", "alembic"].includes(item.id))
    notes.push(`Gained ${experiment(state, item).name}`);
  if (item.id === "realknife" || item.id === "crystalball") {
    notes.push(`${item.metadata.count}/${item.id === "realknife" ? 9 : 8}`);
  }
  if (item.id === "constructionworker") {
    const t = chooseUpgrade(
      state.tools,
      rng(),
      4 ** count(state, "mechanical-arm"),
    );
    if (t) {
      t.maxUses++;
      t.uses++;
      notes.push(`Upgraded ${ITEMS[t.id].name}`);
    }
  }
  if (item.id === "technologist") {
    const def = choose(
      TOOLS.filter((t) => !state.tools.some((owned) => owned.id === t.id)),
      rng(),
    );
    if (def) {
      acquire(state, def.id);
      notes.push(`Gained ${def.name}`);
    }
  }
  if (item.id === "bank" && state.phase === "editing") {
    const amount = Math.floor(state.bank * 0.1);
    state.bank += amount;
    notes.push(`+$${amount} interest`);
  }
  if (item.id === "package") {
    openPackage(state);
    notes.push("Replaced other trinkets");
  }
  if (notes.length)
    event.note = [event.note, ...notes].filter(Boolean).join("\n");
  return event;
}

export function settleSpin(state) {
  if (state.phase !== "editing") return false;
  const snapshot = [...state.trinkets];
  // Bank and Package have entry/acquisition hooks; Camera can explicitly activate them.
  state.events = [
    ...state.pendingEvents,
    ...snapshot.map((item) =>
      ["bank", "package", "test-tube", "alembic"].includes(item.id)
        ? scoreTrinket(item, state.reels, state)
        : activate(state, item),
    ),
  ];
  let points = state.events.reduce((sum, event) => sum + event.points, 0);
  for (const event of state.events) {
    if (event.multiplier > 1) {
      const before = points;
      // Multipliers appear at the end, after all additive contributions.
      if (["moai", "new moon"].includes(event.id)) {
        const factor = event.id === "moai" ? 2 : 10;
        for (const step of event.steps) {
          step.points = points * (factor - 1);
          points *= factor;
        }
      } else points *= event.multiplier;
      event.multiplierPoints = points - before;
    }
  }
  const multipliers = state.events.filter((event) => event.multiplier > 1);
  state.events = state.events.filter((event) => event.multiplier <= 1);
  for (const event of multipliers) {
    event.points += event.multiplierPoints;
    if (event.multiplierPoints && !["moai", "new moon"].includes(event.id))
      event.steps.push({ reels: [], points: event.multiplierPoints });
    state.events.push(event);
  }
  for (const event of state.events.filter((e) => e.id === "checkered-flag")) {
    const extra = Math.max(0, goalFor(state.round) - points);
    event.points += extra;
    if (extra) event.steps.push({ reels: [], points: extra });
    points += extra;
  }
  state.events = [
    ...state.events.filter((e) => e.id !== "checkered-flag"),
    ...state.events.filter((e) => e.id === "checkered-flag"),
  ];
  state.points = points;
  if (points < goalFor(state.round)) {
    for (const event of state.events.filter((e) => e.id === "snail")) {
      const reward = randomTrinket(state, ["common", "uncommon"]);
      if (reward && event) event.note = `Gained ${reward.name}`;
    }
  }
  const bonus =
    points >= goalFor(state.round)
      ? bonusFor(state.round) * 2 ** state.reels.filter((n) => n === "W").length
      : 0;
  let runningBonus = points >= goalFor(state.round) ? bonusFor(state.round) : 0;
  state.reels.forEach((value, index) => {
    if (value !== "W") return;
    const extra = runningBonus;
    runningBonus *= 2;
    state.events.push({
      id: "w",
      points: 0,
      cash: extra,
      note: extra ? "Goal bonus doubled" : "No goal bonus to double",
      reels: [index],
      bonusTotal: runningBonus,
      steps: [],
    });
  });
  state.bank += bonus + allowanceFor(state.round);
  state.total += points;
  state.history.push({
    round: state.round,
    reels: [...state.reels],
    points,
    bonus,
  });
  state.pendingEvents = [];
  state.phase = state.round === TOTAL_SPINS ? "finished" : "scored";
  return true;
}

/**
 * Selects an entry using rarity weights normalized across the available pool.
 * @param {object[]} pool Candidate definitions containing a rarity.
 * @param {() => number} rng Seeded random-number generator.
 * @returns {object|undefined} The selected definition, if the pool is nonempty.
 */
function choose(pool, rng, boost = 1) {
  const rarityWeight = (def) =>
    RARITIES[def.rarity].weight *
    (["rare", "legendary"].includes(def.rarity) ? boost : 1);
  const weight = pool.reduce(
    (sum, def) =>
      sum +
      rarityWeight(def) / pool.filter((p) => p.rarity === def.rarity).length,
    0,
  );
  let roll = rng() * weight;
  return (
    pool.find(
      (def) =>
        (roll -=
          rarityWeight(def) /
          pool.filter((p) => p.rarity === def.rarity).length) < 0,
    ) || pool.at(-1)
  );
}

/** Selects an owned tool using each tool's individual rarity weight. */
function chooseUpgrade(tools, rng, boost = 1) {
  const weightFor = (owned) =>
    RARITIES[ITEMS[owned.id].rarity].weight *
    (["rare", "legendary"].includes(ITEMS[owned.id].rarity) ? boost : 1);
  const weight = tools.reduce((sum, owned) => sum + weightFor(owned), 0);
  let roll = rng() * weight;
  return tools.find((owned) => (roll -= weightFor(owned)) < 0) || tools.at(-1);
}

/**
 * Generates the deterministic trinket, tool, and upgrade offers for a shop.
 * @param {object} state Current game state.
 * @returns {object[]} Shop offers including extra slots and Printer copies.
 */
export function generateOffers(state) {
  const rng = random(
    hash(`${state.seed}:shop:${state.round}:${state.rerolls}`),
  );
  const offers = [];
  const boost = shopBoost(state);
  const owned = new Set(
    [...state.trinkets, ...state.tools].map((item) => item.id),
  );
  for (let slot = 0; slot < 2 + count(state, "backpack"); slot++) {
    const def = choose(
      availableTrinkets.filter(
        (t) =>
          !owned.has(t.id) &&
          !offers.some((o) => o.id === t.id) &&
          (!(state.legendaryShops > 0 && slot === 0) ||
            t.rarity === "legendary"),
      ),
      rng,
      boost,
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
  for (let slot = 0; slot < 1 + count(state, "hammer"); slot++) {
    const upgrade = chooseUpgrade(
      state.tools,
      rng,
      boost * 4 ** count(state, "mechanical-arm"),
    );
    const upgradeDef = upgrade && ITEMS[upgrade.id];
    offers.push(
      upgrade
        ? {
            id: upgrade.id,
            kind: "upgrade",
            rarity: upgradeDef.rarity,
            amount: 1,
            price: Math.ceil(
              (Math.ceil(itemPrice(upgradeDef) * 0.5) +
                (upgrade.maxUses - ITEMS[upgrade.id].maxUses) * 3) *
                (has(state, "screwdriver") ? 0.5 : 1),
            ),
            sold: false,
          }
        : { kind: "upgrade", empty: true },
    );
  }
  const def = choose(
    TOOLS.filter((t) => !owned.has(t.id)),
    rng,
    boost * 1.5 ** count(state, "graduate"),
  );
  offers.push(
    def
      ? {
          id: def.id,
          kind: "tool",
          rarity: def.rarity,
          price: Math.ceil(itemPrice(def) * (has(state, "wrench") ? 0.5 : 1)),
          sold: false,
        }
      : { kind: "tool", empty: true },
  );
  for (let slot = 0; slot < count(state, "printer"); slot++) {
    const pool = state.trinkets.filter((t) => t.id !== "bug");
    const original = pool[Math.floor(rng() * pool.length)];
    if (original)
      offers.push({
        id: original.id,
        kind: "trinket",
        rarity: ITEMS[original.id].rarity,
        price: 2 * itemPrice(ITEMS[original.id]),
        sold: false,
        copy: structuredClone(original),
      });
  }
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
  state.tools.forEach((t) => {
    if (ITEMS[t.id].limitedUse) t.uses -= t.bonusUses ?? 0;
    else
      t.uses =
        t.maxUses + (has(state, "cartwheel") && REROLLS.includes(t.id) ? 5 : 0);
    t.bonusUses = 0;
  });
  state.locks = [...state.nextLocks];
  state.nextLocks.fill(null);
  if (has(state, "bank")) state.bank += Math.floor(state.bank * 0.1);
  state.offers = generateOffers(state);
  if (
    state.legendaryShops > 0 &&
    state.offers.some((o) => o.kind === "trinket" && o.rarity === "legendary")
  )
    state.legendaryShops--;
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
    !offer.copy &&
    [...state.tools, ...state.trinkets].some((t) => t.id === offer.id)
  )
    return false;
  if (offer.kind === "upgrade") {
    const tool = state.tools.find((t) => t.id === offer.id);
    if (!tool) return false;
    tool.maxUses += 1;
    tool.uses += 1;
  } else if (offer.copy) state.trinkets.push(structuredClone(offer.copy));
  else acquire(state, offer.id);
  state.bank -= offer.price;
  offer.sold = true;
  // Discounts purchased in this shop apply to its remaining offers immediately.
  for (const entry of state.offers.filter((o) => !o.empty && !o.sold)) {
    const def = ITEMS[entry.id];
    if (entry.kind === "tool")
      entry.price = Math.ceil(
        itemPrice(def) * (has(state, "wrench") ? 0.5 : 1),
      );
    if (entry.kind === "upgrade") {
      const owned = state.tools.find((t) => t.id === entry.id);
      if (owned)
        entry.price = Math.ceil(
          (Math.ceil(itemPrice(def) * 0.5) +
            (owned.maxUses - def.maxUses) * 3) *
            (has(state, "screwdriver") ? 0.5 : 1),
        );
    }
  }
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
  return `RNGdlelike - ${heading}\n${state.total.toLocaleString("en-US")} points in ${state.history.length}/20 spins!\n${results.slice(0, 10).join("")}\n${results.slice(10).join("")}\nGoals: ${state.history.filter((h) => h.bonus).length}/20 - Best spin: ${Math.max(0, ...state.history.map((h) => h.points))}\nTrinkets: ${state.trinkets.map((t) => `${ITEMS[t.id].emoji}`).join("")}\nTools: ${state.tools.map((t) => `${ITEMS[t.id].emoji}`).join("")}\nThink you can beat me? Play the same seed!\n${url}`;
}
