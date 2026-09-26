import {
  ITEMS,
  TRINKETS,
  TOOLS,
  RARITIES,
  ownItem,
  itemPrice,
} from "./items.js";
import { hash, random, nextRandom, dailyDateForSeed } from "./random.js";
import { scoreTrinket, isDigit, has, reelValue } from "./scoring.js";
export { scoreTrinket } from "./scoring.js";
export const TOTAL_SPINS = 20;
export const TOOL_CHANCE = 0.6;
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

/** Counts all owned copies, including clones, for stackable passive effects. */
const count = (state, id) => state.trinkets.filter((t) => t.id === id).length;
const availableTrinkets = TRINKETS.filter((t) => t.rarity !== "fallback");
const trinketRarities = ["common", "uncommon", "rare", "legendary"];
/** Combines the rarity boosts from every owned mining and magnifier copy. */
const shopBoost = (state) =>
  1.25 ** count(state, "mining") * 1.5 ** count(state, "magnifier");
/** Applies the shop markup and each Wrench discount to a tool. */
const toolPrice = (state, def) =>
  Math.ceil(itemPrice(def) * 1.4 * 0.5 ** count(state, "wrench"));
/** Prices an upgrade using rarity, exponential growth, and stacked discounts. */
const upgradePrice = (state, def, owned) => {
  const multiplier = def.rarity === "legendary" ? 1.5 : 0.5;
  const base = def.rarity === "legendary" ? 4 : 2;
  return Math.ceil(
    (Math.ceil(itemPrice(def) * multiplier) +
      base ** (owned.maxUses - def.maxUses)) *
      0.5 ** count(state, "screwdriver"),
  );
};

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
    shopRngState: hash(`${seed >>> 0}:shop`),
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
    packageActivations: 0,
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
/** Creates the next deterministic effect roll without consuming shop or spin randomness. */
const effectRng = (state, label) =>
  random(hash(`${state.seed}:${label}:${state.round}:${state.effectRolls++}`));
/** Returns the target reel and its wrapping neighbors. */
const neighbors = (i) => [(i + 5) % 6, i, (i + 1) % 6];
/** Formats a stored reel value for player-facing text. */
export const reelLabel = (value) =>
  typeof value === "string" && value.startsWith("bomb:")
    ? value.slice(5)
    : value === "qubit"
      ? "Superposition"
      : (value ?? "—");

/** Reconnects clone metadata after loading JSON and before applying effects. */
export function syncTrinkets(state) {
  const metadata = new Map();
  for (const item of state.trinkets) {
    // Lucky Seven no longer grows power; discard that field from older saves.
    if (item.id === "seven") delete item.metadata.power;
    if (!metadata.has(item.id)) metadata.set(item.id, item.metadata);
    item.metadata = metadata.get(item.id);
  }
}

/** Adds a copy sharing the original's live metadata and marks its inventory card. */
function cloneTrinket(state, original) {
  const existing = state.trinkets.find((item) => item.id === original.id);
  const copy = {
    id: original.id,
    metadata: existing?.metadata ?? original.metadata,
  };
  state.trinkets.push(copy);
  state.revealTrinket = copy.id;
  return copy;
}

/** Finds the displayed slot, preferring its landing position when still valid. */
function displayedPosition(state, index) {
  const value = state.reels[index];
  /** Checks whether a permanent slot represents the displayed reel face. */
  const matches = (slot) =>
    slot === value ||
    (slot?.type === "bomb" && `bomb:${slot.count}` === value) ||
    (state.qubits[index] && slot === "qubit");
  const pool = state.reelPools[index];
  return matches(pool[state.positions[index]])
    ? state.positions[index]
    : pool.findIndex(matches);
}

/** Chooses one favorite digit per shared Moai stack for this round. */
function favorite(state) {
  for (const item of state.trinkets.filter(
    (t, i, all) =>
      t.id === "moai" && all.findIndex((other) => other.id === t.id) === i,
  ))
    item.metadata.favorite = Math.floor(effectRng(state, "moai")() * 10);
}

/** Queues a bomb event for reel notifications and the scoring log. */
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

/** Ticks a real bomb slot and removes it when it explodes. */
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

/** Ticks a temporary bomb face without changing the permanent reel pool. */
function countDownBombCopy(state, index, count) {
  state.reels[index] = count === 1 ? null : `bomb:${count - 1}`;
  recordBombEvent(
    state,
    index,
    count === 1 ? "Bomb copy cleared" : `Bomb copy \n ${count - 1} left`,
  );
}

/** Lands a reel using its lock or weighted pool and resolves bomb countdowns. */
function land(state, index, rng) {
  const pool = state.reelPools[index];
  const locked = state.locks[index];
  if (locked != null) {
    const position = state.positions[index];
    if (position < 0 || position >= pool.length)
      state.positions[index] = pool.findIndex((slot) => slot === locked);
    const bombCount =
      typeof locked === "string" && /^bomb:[1-3]$/.test(locked)
        ? Number(locked.slice(5))
        : null;
    if (bombCount !== null) {
      const slot = pool[state.positions[index]];
      if (slot?.type === "bomb")
        countDownBomb(state, index, state.positions[index]);
      else countDownBombCopy(state, index, bombCount);
    } else {
      state.reels[index] = locked;
      state.qubits[index] = locked === "qubit";
    }
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
    const eightHits = 1 + count(state, "eightball");
    const octopusCash =
      value === 8
        ? Math.max(0, 8 - Math.floor((state.eightsSeen ?? 0) / 8)) * eightHits
        : 0;
    if (value === 8) state.eightsSeen = (state.eightsSeen ?? 0) + 1;
    for (const item of [...state.trinkets]) {
      if (item.id === "robot" && (value === 0 || value === 1)) {
        item.metadata.power += 2;
        state.seenEvents.push({
          index,
          id: item.id,
          note: `+1 P0W3R: N3W P0W3R: ${item.metadata.power}`,
        });
      }
      if (item.id === "octopus" && value === 8) {
        const cash = octopusCash;
        state.bank += cash;
        state.seenEvents.push({ index, id: item.id, note: `+$${cash}` });
        let event = state.pendingEvents.find((event) => event.id === "octopus");
        if (!event) {
          event = {
            id: item.id,
            points: 0,
            cash: 0,
            multiplier: 1,
            reels: [],
            steps: [],
          };
          state.pendingEvents.push(event);
        }
        event.cash += cash;
        if (!event.reels.includes(index)) event.reels.push(index);
        event.note = `+$${event.cash} this round`;
      }
      const digit =
        item.id === "realknife" ? 9 : item.id === "crystalball" ? 8 : null;
      if (digit === null || value !== digit) continue;
      const threshold = digit;
      const amount = digit === 8 ? eightHits : 1;
      item.metadata.count += amount;
      const notes = [];
      while (item.metadata.count >= threshold) {
        item.metadata.count -= threshold;
        if (digit === 9) {
          state.legendaryShops++;
          const message = "Your reward awaits you.";
          notes.push("Legendary reserved");
          state.pendingEvents.push({
            id: "realknife",
            points: 0,
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

/** Starts an editing round, resets round counters, and records the six landings. */
export function spin(state) {
  if (state.phase !== "ready") return false;
  syncTrinkets(state);
  state.eightsSeen = 0;
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

/** Toggles a displayed Superposition between its two possible digits. */
export function chooseQubit(state, index) {
  if (state.phase !== "editing" || !state.qubits[index]) return false;
  state.reels[index] = state.reels[index] === 1 ? 0 : 1;
  return true;
}

/** Previews Camera points without consuming events or awarding the round twice. */
function previewCameraPoints(state) {
  let points = state.pendingEvents.reduce(
    (sum, event) => sum + event.points,
    0,
  );
  for (const event of state.pendingEvents) {
    event.previewPoints = event.points;
    if (event.multiplier > 1) {
      const extra = points * (event.multiplier - 1);
      event.previewPoints += extra;
      points += extra;
    }
  }
  for (const event of state.pendingEvents.filter(
    (event) => event.id === "checkered-flag",
  )) {
    const extra = Math.max(0, goalFor(state.round) - points);
    event.previewPoints += extra;
    points += extra;
  }
  state.points = points;
}

/** Validates and applies a tool, spending a use only after a successful action. */
export function useTool(state, id, target, source = null) {
  syncTrinkets(state);
  state.reelError = null;
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
  let cameraEvent = null;
  const bombCount =
    typeof old === "string" && /^bomb:[1-3]$/.test(old)
      ? Number(old.slice(5))
      : null;
  let seenIndices = reel ? [target] : [];
  const pool = reel ? state.reelPools[target] : null;
  const position = reel ? displayedPosition(state, target) : -1;
  if (
    ["bomb", "w", "soap", "pill", "qubit"].includes(id) &&
    (!pool || position < 0 || position >= pool.length)
  ) {
    state.reelError = {
      index: target,
      message: "The displayed value is not on this reel.",
    };
    return false;
  }
  if (id === "decrement" && !isDigit(old) && bombCount === null) return false;
  if (["increment", "double", "flip", "pill"].includes(id) && !isDigit(old))
    return false;
  if (id === "lock" && old == null) return false;
  if (["bomb", "w", "qubit"].includes(id)) state.positions[target] = position;
  switch (id) {
    case "incrementall":
      seenIndices = [];
      state.reels.forEach((value, i) => {
        if (!isDigit(value)) return;
        state.reels[i] = (value + (id === "incrementall" ? 1 : 9)) % 10;
        state.qubits[i] = false;
        seenIndices.push(i);
      });
      break;
    case "decrementall":
      seenIndices = [];
      state.reels.forEach((value, i) => {
        const count =
          typeof value === "string" && /^bomb:[1-3]$/.test(value)
            ? Number(value.slice(5))
            : null;
        if (count !== null) {
          const position = displayedPosition(state, i);
          const slot = state.reelPools[i]?.[position];
          if (slot?.type === "bomb" && slot.count === count) {
            countDownBomb(state, i, position);
          } else countDownBombCopy(state, i, count);
        } else if (isDigit(value)) state.reels[i] = (value + 9) % 10;
        else return;
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
        else countDownBombCopy(state, target, bombCount);
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
    case "mirror": {
      const item = Number.isInteger(target)
        ? state.trinkets[target]
        : state.trinkets.find((t) => t.id === target);
      if (!item) return false;
      cloneTrinket(state, item);
      break;
    }
    case "lock":
      seenIndices = [];
      state.nextLocks[target] = old;
      break;
    case "atm": {
      const other = state.tools.find((t) => t.id === target);
      if (!other || other === tool || other.id === "atm") return false;
      const cost = ITEMS[other.id].rarity === "legendary" ? 150 : 15;
      if (state.bank < cost) return false;
      state.bank -= cost;
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
    case "sparkles": {
      const item = Number.isInteger(target)
        ? state.trinkets[target]
        : state.trinkets.find((t) => t.id === target);
      if (!item) return false;
      const rarityIndex = trinketRarities.indexOf(ITEMS[item.id].rarity);
      if (rarityIndex < 0) {
        return false;
      }
      const nextRarity =
        rarityIndex === trinketRarities.length - 1
          ? trinketRarities[rarityIndex]
          : trinketRarities[rarityIndex + 1];
      const candidates = availableTrinkets.filter(
        (t) => t.rarity === nextRarity && !has(state, t.id),
      );
      if (!candidates.length) {
        acquire(state, "bug");
      } else {
        const replacement = choose(candidates, effectRng(state, "sparkles"));
        state.trinkets.splice(state.trinkets.indexOf(item), 1);
        acquire(state, replacement.id);
      }
      break;
    }
    case "camera": {
      const item = Number.isInteger(target)
        ? state.trinkets[target]
        : state.trinkets.find((t) => t.id === target);
      if (!item || PASSIVES.has(item.id)) return false;
      const event = activate(state, item);
      cameraEvent = event;
      if (item.id === "no-tools") {
        event.points = 0;
        event.steps = [];
      }
      if (["realknife", "crystalball"].includes(item.id))
        seenIndices = [0, 1, 2, 3, 4, 5];
      if (item.id !== "octopus") state.pendingEvents.push(event);
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
    cameraEvent.note = [`${item.metadata.count}/${threshold}`, ...rewards].join(
      "\n",
    );
  }
  if (id === "camera") previewCameraPoints(state);
  return true;
}

/** Awards an unowned trinket in the allowed rarities, falling back to Bug. */
function randomTrinket(state, rarities = null) {
  const pool = availableTrinkets.filter(
    (t) => !has(state, t.id) && (!rarities || rarities.includes(t.rarity)),
  );
  const rng = effectRng(state, "reward");
  const def = pool[Math.floor(rng() * pool.length)] ?? ITEMS.bug;
  if (def) acquire(state, def.id);
  return def;
}

/** Upgrades every other trinket and reconnects metadata for duplicate rewards. */
function openPackage(state) {
  state.packageActivations = (state.packageActivations ?? 0) + 1;
  const others = state.trinkets.filter((t) => t.id !== "package");
  for (const item of others) {
    const rarity =
      trinketRarities[
        Math.min(3, trinketRarities.indexOf(ITEMS[item.id].rarity) + 1)
      ];
    const pool = availableTrinkets.filter(
      (t) => t.rarity === rarity && t.id !== "package" && !has(state, t.id),
    );
    const replacement = choose(pool, effectRng(state, "package")) ?? ITEMS.bug;
    if (replacement) {
      const index = state.trinkets.indexOf(item);
      state.trinkets[index] = ownItem(replacement.id);
      syncTrinkets(state);
      state.revealTrinket = replacement.id;
      if (replacement.id === "moai")
        state.trinkets[index].metadata.favorite = Math.floor(
          effectRng(state, "moai")() * 10,
        );
    }
  }
}

/** Resolves an Alembic reward or a Test Tube clone with shared metadata. */
function experiment(state, item) {
  if (item.id === "alembic") return randomTrinket(state);
  const pool = state.trinkets.filter((t) => t !== item);
  const rng = effectRng(state, "replication");
  const original = pool[Math.floor(rng() * pool.length)];
  const copy = cloneTrinket(state, original ?? ownItem("bug"));
  return ITEMS[copy.id];
}

/** Adds an owned item and runs its acquisition effects. */
function acquire(state, id) {
  const def = ITEMS[id],
    item = ownItem(id);
  state[def.kind === "tool" ? "tools" : "trinkets"].push(item);
  if (def.kind === "trinket") {
    syncTrinkets(state);
    state.revealTrinket = id;
  }
  onAcquire(state, item);
  return item;
}

/** Applies item-specific acquisition effects and stacked reroll bonuses. */
function onAcquire(state, item, copied = false) {
  const id = item.id,
    def = ITEMS[id];
  if (id === "package") openPackage(state);
  if (["test-tube", "alembic"].includes(id)) experiment(state, item);
  if (id === "moai" && !copied && count(state, id) === 1)
    item.metadata.favorite = Math.floor(effectRng(state, "moai")() * 10);
  if (id === "cartwheel")
    for (const t of state.tools.filter((t) => REROLLS.includes(t.id)))
      t.uses += 5;
  if (def.kind === "tool" && REROLLS.includes(id) && has(state, "cartwheel"))
    item.uses += 5 * count(state, "cartwheel");
}

/** Scores one trinket copy and resolves its active reward effects. */
function activate(state, item) {
  const event = scoreTrinket(item, state.reels, state);
  state.bank += event.cash;
  /** Provides the next seeded activation roll for this item. */
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

/** Resolves trinket effects, score multipliers, goal rewards, and round history. */
export function settleSpin(state) {
  if (state.phase !== "editing") return false;
  syncTrinkets(state);
  const snapshot = [...state.trinkets];
  // Bank and Package have entry/acquisition hooks; Camera can explicitly activate them.
  state.events = [
    ...state.pendingEvents,
    ...snapshot
      .filter((item) => item.id !== "octopus")
      .map((item) =>
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
      ? bonusFor(state.round) + 50 * state.reels.filter((n) => n === "W").length
      : 0;
  let runningBonus = points >= goalFor(state.round) ? bonusFor(state.round) : 0;
  state.reels.forEach((value, index) => {
    if (value !== "W") return;
    const extra = points >= goalFor(state.round) ? 50 : 0;
    runningBonus += extra;
    state.events.push({
      id: "w",
      points: 0,
      cash: extra,
      note: extra
        ? `Goal bonus increased by ${extra}`
        : "No goal bonus this spin",
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
  /** Computes the boosted rarity weight for one candidate. */
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
  /** Computes an owned tool’s weight for upgrade selection. */
  const weightFor = (owned) =>
    RARITIES[ITEMS[owned.id].rarity].weight *
    (["rare", "legendary"].includes(ITEMS[owned.id].rarity) ? boost : 1);
  const weight = tools.reduce((sum, owned) => sum + weightFor(owned), 0);
  let roll = rng() * weight;
  return tools.find((owned) => (roll -= weightFor(owned)) < 0) || tools.at(-1);
}

/**
 * Ranks a fixed catalog with weighted random priorities, then selects an eligible item.
 * Every catalog entry consumes a draw, even when unavailable. Removing an unselected
 * item therefore changes neither the winner nor the position of the saved RNG.
 */
function chooseShopItem(catalog, pool, rng, weightFor) {
  const eligible = new Map(pool.map((item) => [item.id, item]));
  let selected;
  let best = Infinity;
  for (const def of catalog) {
    const roll = 1 - rng();
    const item = eligible.get(def.id);
    if (!item) continue;
    const weight = weightFor(def);
    if (weight <= 0) continue;
    const priority = -Math.log(roll) / weight;
    if (priority < best) {
      best = priority;
      selected = item;
    }
  }
  return selected;
}

/** Uses fixed catalog rarity counts so ownership cannot redistribute item weights. */
function shopItemWeight(def, boost) {
  const catalog = def.kind === "tool" ? TOOLS : availableTrinkets;
  return (
    (RARITIES[def.rarity].weight *
      (["rare", "legendary"].includes(def.rarity) ? boost : 1)) /
    catalog.filter((item) => item.rarity === def.rarity).length
  );
}

/**
 * Generates offers from live inventory, advancing the run’s saved shop-only RNG.
 * Every generation (including rerolls and Package refreshes) consumes this stream.
 * @param {object} state Mutable game state containing the persisted RNG cursor.
 * @returns {object[]} Shop offers including extra slots and Printer copies.
 */
export function generateOffers(state) {
  // Older saves initialize once at their next generation; loading existing offers uses no rolls.
  state.shopRngState ??= hash(`${state.seed}:shop`);
  /** Draws only from this run's persisted shop stream. */
  const rng = () => nextRandom(state, "shopRngState");
  const offers = [];
  const boost = shopBoost(state);
  const owned = new Set(
    [...state.trinkets, ...state.tools].map((item) => item.id),
  );
  for (let slot = 0; slot < 2 + count(state, "backpack"); slot++) {
    const def = chooseShopItem(
      availableTrinkets,
      availableTrinkets.filter(
        (t) =>
          !owned.has(t.id) &&
          !offers.some((o) => o.id === t.id) &&
          (!(state.legendaryShops > 0 && slot === 0) ||
            t.rarity === "legendary"),
      ),
      rng,
      (def) => shopItemWeight(def, boost),
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
  const percentToolsNotOwned =
    TOOLS.filter((t) => !owned.has(t.id)).length / TOOLS.length;
  const offerTool = rng() < TOOL_CHANCE * percentToolsNotOwned;
  // Rank both catalogs regardless of the chosen kind to keep later draws aligned.
  const tool = chooseShopItem(
    TOOLS,
    TOOLS.filter((t) => !owned.has(t.id)),
    rng,
    (def) => shopItemWeight(def, boost * 1.5 ** count(state, "graduate")),
  );
  const trinket = chooseShopItem(
    availableTrinkets,
    availableTrinkets.filter(
      (t) => !owned.has(t.id) && !offers.some((o) => o.id === t.id),
    ),
    rng,
    (def) => shopItemWeight(def, boost),
  );
  const mixed = offerTool ? tool : trinket;
  const kind = offerTool ? "tool" : "trinket";
  offers.push(
    mixed
      ? {
          id: mixed.id,
          kind,
          rarity: mixed.rarity,
          price: offerTool ? toolPrice(state, mixed) : itemPrice(mixed),
          sold: false,
        }
      : { kind, empty: true },
  );
  for (let slot = 0; slot < count(state, "printer"); slot++) {
    const pool = state.trinkets.filter(
      (t) => t.id !== "bug" && t.id !== "printer",
    );
    const original = chooseShopItem(
      availableTrinkets,
      pool,
      rng,
      (def) => pool.filter((item) => item.id === def.id).length,
    );
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
  for (let slot = 0; slot < 1 + count(state, "hammer"); slot++) {
    const upgrade = chooseShopItem(
      TOOLS,
      state.tools,
      rng,
      (def) =>
        RARITIES[def.rarity].weight *
        (["rare", "legendary"].includes(def.rarity)
          ? boost * 4 ** count(state, "mechanical-arm")
          : 1),
    );
    const upgradeDef = upgrade && ITEMS[upgrade.id];
    offers.push(
      upgrade
        ? {
            id: upgrade.id,
            kind: "upgrade",
            rarity: upgradeDef.rarity,
            amount: 1,
            price: upgradePrice(state, upgradeDef, upgrade),
            sold: false,
          }
        : { kind: "upgrade", empty: true },
    );
  }
  return offers;
}

/** Refreshes inventory-dependent shop offers while keeping purchased slots sold. */
export function refreshShopOffers(state) {
  const fresh = generateOffers(state);
  const sold = state.offers.filter((offer) => offer.sold);
  for (const offer of sold) {
    const slot = fresh.findIndex(
      (candidate) =>
        candidate.kind === offer.kind &&
        Boolean(candidate.copy) === Boolean(offer.copy),
    );
    if (slot >= 0) fresh.splice(slot, 1);
  }
  state.offers = [...sold, ...fresh];
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
        t.maxUses +
        (REROLLS.includes(t.id) ? 5 * count(state, "cartwheel") : 0);
    t.bonusUses = 0;
  });
  state.locks = [...state.nextLocks];
  state.nextLocks.fill(null);
  state.bank += count(state, "bank") * Math.floor(state.bank * 0.1);
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
    offer.kind === "tool" &&
    !offer.copy &&
    [...state.tools, ...state.trinkets].some((t) => t.id === offer.id)
  )
    return false;
  const packageCount = state.packageActivations ?? 0;
  if (offer.kind === "upgrade") {
    const tool = state.tools.find((t) => t.id === offer.id);
    if (!tool) return false;
    tool.maxUses += 1;
    tool.uses += 1;
  } else if (offer.copy) {
    const copy = cloneTrinket(state, offer.copy);
    onAcquire(state, copy, true);
  } else acquire(state, offer.id);
  state.bank -= offer.price;
  offer.sold = true;
  if ((state.packageActivations ?? 0) !== packageCount)
    refreshShopOffers(state);
  // Discounts purchased in this shop apply to its remaining offers immediately.
  for (const entry of state.offers.filter((o) => !o.empty && !o.sold)) {
    const def = ITEMS[entry.id];
    if (entry.kind === "tool") entry.price = toolPrice(state, def);
    if (entry.kind === "upgrade") {
      const owned = state.tools.find((t) => t.id === entry.id);
      if (owned) entry.price = upgradePrice(state, def, owned);
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
 * @param {object} [calendar={}] Published daily seeds indexed by UTC date.
 * @returns {string} Shareable plain text.
 */
export function shareText(state, url, calendar = {}) {
  const date = dailyDateForSeed(state.seed, calendar);
  const heading =
    state.mode === "daily"
      ? `Daily ${state.date}`
      : `Seed ${state.seed}${date ? ` - Daily ${date} UTC` : ""}`;
  // Sort a copy so sharing never changes inventory order or tool targeting.
  const summary = (items) => {
    const ranked = [...items].sort(
      (a, b) =>
        RARITIES[ITEMS[a.id].rarity].weight -
        RARITIES[ITEMS[b.id].rarity].weight,
    );
    return (
      ranked
        .slice(0, 5)
        .map((item) => ITEMS[item.id].emoji)
        .join("") + (ranked.length > 5 ? ` (+${ranked.length - 5} more)` : "")
    );
  };
  return `RNGdlelike - ${heading}\n${state.total.toLocaleString("en-US")} points in ${state.history.length}/20 spins!\nGoals: ${state.history.filter((h) => h.bonus).length}/20 - Best spin: ${Math.max(0, ...state.history.map((h) => h.points))}\nTrinkets: ${summary(state.trinkets)}\nTools: ${summary(state.tools)}\nThink you can beat me? Play the same seed!\n${url}`;
}
