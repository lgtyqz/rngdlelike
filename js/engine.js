import {
  asScore,
  ratio,
  addRatio,
  multiplyRatio,
  powerRatio,
  roundRatio,
  compareRatio,
  hasMultiplier,
  formatRatio,
  formatNumber,
  normalizeScores,
} from "./score.js";
import {
  ITEMS,
  TRINKETS,
  TOOLS,
  RARITIES,
  ownItem,
  itemPrice,
} from "./items.js";
import { hash, random, nextRandom, dailyDateForSeed } from "./random.js";
import { chooseShopItem, chooseShopOffer } from "./shop.js";
import {
  scoreTrinket,
  isDigit,
  has,
  reelValue,
  eightBallHits,
} from "./scoring.js";
import {
  trinketEffects,
  trinketStacks,
  markActivated,
  inactiveTrinketStacks,
  PASSIVE_TRINKETS,
  silentEligibleUids,
} from "./effects.js";
export { scoreTrinket } from "./scoring.js";
export const TOTAL_SPINS = 20;
export const TOOL_CHANCE = 0.6;

export const EXPONENTIAL_REROLL_COUNT = 14;
/** Returns the point target for a given round. */
export const goalFor = (round) => {
  if (round < 11) {
    return 10 + round * (round - 1) * 5;
  }
  return (
    10 +
    (round * (round - 1) * 5) / 2 +
    (round - 9) * (round - 8) * (round - 7) * 10
  );
};
/** Returns the cash bonus awarded for meeting a round's point target. */
export const bonusFor = (round) => {
  if (round < 10) {
    return 20 + (round - 1) * 5;
  }
  return 20 + (round - 1) * (round - 1);
};
/** Returns the guaranteed cash allowance awarded after a round. */
export const allowanceFor = (round) => 10 + round * 5;
/** Returns the current cost to reroll the shop. */
export const rerollPrice = (state) =>
  Math.max(
    0,
    3 +
      state.rerolls * 5 -
      2 * count(state, "wheel") -
      4 * count(state, "bicycle"),
  ) * Math.ceil(1.5 ** (state.rerolls - EXPONENTIAL_REROLL_COUNT));

/** Counts all owned copies, including clones, for stackable passive effects. */
const count = (state, id) =>
  trinketEffects(state).filter((t) => t.id === id).length;
const availableTrinkets = TRINKETS.filter(
  (t) => !["fallback", "token"].includes(t.rarity),
);
const trinketRarities = ["common", "uncommon", "rare", "legendary"];
const EXPERIMENTS = ["test-tube", "alembic", "upgradeexp", "toolexp"];
/** Dormant II blocks new Dormant I rolls; copying an owned trinket bypasses this. */
const canGenerateTrinket = (state, id) =>
  id !== "dormant1" || !has(state, "dormant2");
const canOffer = (state, id) =>
  canGenerateTrinket(state, id) &&
  (!has(state, id) ||
    (EXPERIMENTS.includes(id) && count(state, "scientist") > 0));
const canTransform = (state, item) =>
  !trinketEffects(state).some(
    (effect) => effect.owner === item && effect.id === "fallingleaves",
  );
const passiveActivated = (state, id) =>
  trinketEffects(state)
    .filter((item) => item.id === id)
    .forEach((item) => markActivated(state, item));
/** Combines the rarity boosts from every owned mining and magnifier copy. */
const shopBoost = (state) =>
  1.25 ** count(state, "mining") * 1.5 ** count(state, "magnifier");
/** Applies the shop markup and each Wrench discount to a tool. */
const toolPrice = (state, def) =>
  Math.ceil(itemPrice(def) * 1.4 * 0.5 ** count(state, "wrench"));
/** Prices an upgrade using rarity, exponential growth, and stacked discounts. */
const upgradePrice = (state, def, owned) => {
  const multiplier = def.rarity === "legendary" ? 1.5 : 0.5;
  const base = def.rarity === "legendary" ? 5 : 3;
  return Math.ceil(
    (Math.ceil(itemPrice(def) * multiplier) +
      base ** (owned.maxUses - def.maxUses)) *
      0.5 ** count(state, "screwdriver"),
  );
};

/** Keeps the Package password independent of purchases and effect rolls. */
const packagePassword = (seed) =>
  String(
    Math.floor(random(hash(`${seed >>> 0}:package-password`))() * 1000000),
  ).padStart(6, "0");

/** Requires all six scored digits, preserving leading zeroes. */
const packageMatches = (state) =>
  state.reels.map(reelValue).every(isDigit) &&
  state.reels.map(reelValue).join("") ===
    (state.packagePassword ??= packagePassword(state.seed));

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
    total: 0n,
    points: 0n,
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
    packagePassword: packagePassword(seed),
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
    const needsScoringTrinket =
      i === 1 && !state.trinkets.some((item) => ITEMS[item.id].pointScoring);
    const def = choose(
      availableTrinkets.filter(
        (t) =>
          !["package", ...EXPERIMENTS].includes(t.id) &&
          !has(state, t.id) &&
          (!needsScoringTrinket || t.pointScoring),
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
  normalizeScores(state);
  const metadata = new Map();
  for (const item of state.trinkets) {
    item.uid ??= state.nextTrinketUid = (state.nextTrinketUid ?? 0) + 1;
    state.nextTrinketUid = Math.max(state.nextTrinketUid ?? 0, item.uid);
    item.metadata ??= {};
    for (const [key, value] of Object.entries(ITEMS[item.id].metadata ?? {}))
      if (!(key in item.metadata))
        item.metadata[key] = key === "power" ? asScore(value) : value;
    // Lucky Seven no longer grows power; discard that field from older saves.
    if (item.id === "package")
      item.metadata.password = Number(
        (state.packagePassword ??= packagePassword(state.seed)),
      );
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
  syncTrinkets(state);
  state.revealTrinket = copy.id;
  return copy;
}

/** Replaces one owned trinket and pays every Falling Leaves ability once. */
function transformTrinket(state, item, id) {
  if (!state.trinkets.includes(item) || !canTransform(state, item))
    return false;
  const leaves = trinketEffects(state).filter((t) => t.id === "fallingleaves");
  const uid = item.uid;
  Object.assign(item, ownItem(id), { uid });
  syncTrinkets(state);
  onAcquire(state, item);
  state.revealTrinket = id;
  for (const leaf of leaves) {
    state.bank += 30;
    markActivated(state, leaf);
    if (state.phase === "editing")
      state.pendingEvents.push({
        id: leaf.owner.id,
        points: 0n,
        cash: 30,
        multiplier: ratio(1),
        note: "+$30 for a transformation",
        steps: [],
        cashOnly: true,
      });
  }
  return true;
}

function awakenDormant(state) {
  if (["brainrot1", "brainrot2", "brainrot3"].every((id) => count(state, id)))
    for (const ability of trinketEffects(state).filter(
      (t) => t.id === "dormant1",
    )) {
      if (
        !trinketEffects(state).some(
          (t) => t.owner === ability.owner && t.id === "dormant1",
        )
      )
        continue;
      markActivated(state, ability);
      transformTrinket(state, ability.owner, "dormant2");
    }
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

/** Picks a displayed digit for Moai, including bomb countdowns. */
function chooseMoaiFavorite(state) {
  const digits = state.reels.map(reelValue).filter(isDigit);
  return digits[Math.floor(effectRng(state, "moai")() * digits.length)] ?? null;
}

/** Chooses one favorite digit per shared Moai stack for this round. */
function favorite(state) {
  const seen = new Set();
  for (const item of trinketEffects(state)) {
    if (!["moai", "liberty"].includes(item.id) || seen.has(item.metadata))
      continue;
    seen.add(item.metadata);
    item.metadata.favorite =
      item.id === "moai"
        ? chooseMoaiFavorite(state)
        : Math.floor(effectRng(state, "liberty")() * 10);
  }
}

/** Queues a bomb event for reel notifications and the scoring log. */
function recordBombEvent(state, index, message, cash = 0) {
  const event = {
    id: "bomb",
    points: 0n,
    cash,
    multiplier: ratio(1),
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
  if (pool.includes(6)) passiveActivated(state, "cross");
  if (pool.includes(7)) passiveActivated(state, "clover");
  const locked = state.locks[index];
  if (locked != null) {
    state.reels[index] = locked;
    state.qubits[index] = locked === "qubit";
    // Follow the saved face, not the slot that happened to land before edits.
    // A temporary value can still be locked even without a matching pool slot.
    state.positions[index] = displayedPosition(state, index);
    const bombCount =
      typeof locked === "string" && /^bomb:[1-3]$/.test(locked)
        ? Number(locked.slice(5))
        : null;
    if (bombCount !== null) {
      const slot = pool[state.positions[index]];
      if (slot?.type === "bomb")
        countDownBomb(state, index, state.positions[index]);
      else countDownBombCopy(state, index, bombCount);
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
function recordSeen(state, indices, abilities = null) {
  for (const index of indices) {
    const value = reelValue(state.reels[index]);
    const eightHits =
      value === 8
        ? eightBallHits(state, effectRng(state, "eightball-seen"))
        : 1;
    const octopusCash =
      value === 8
        ? Math.max(0, 8 - Math.floor((state.eightsSeen ?? 0) / 8)) * eightHits
        : 0;
    if (
      value === 8 &&
      (!abilities || abilities.some((t) => t.id === "octopus"))
    )
      state.eightsSeen = (state.eightsSeen ?? 0) + 1;
    for (const item of abilities ?? trinketEffects(state)) {
      if (!state.trinkets.includes(item.owner)) continue;
      if (
        ["numbers", "anxious"].includes(item.id) &&
        value === item.metadata.nextDigit
      ) {
        markActivated(state, item);
        item.metadata.nextDigit++;
        let note = `Looking for ${item.metadata.nextDigit}`;
        if (item.metadata.nextDigit === 10) {
          item.metadata.nextDigit = 0;
          const reward = randomTrinket(state, [
            item.id === "anxious" ? "legendary" : "rare",
          ]);
          note = `Gained ${reward.name}`;
          if (item.id === "anxious")
            transformTrinket(state, item.owner, "relaxedface");
        }
        state.seenEvents.push({ index, id: item.owner.id, note });
      }
      if (item.id === "monkey" && value === item.metadata.favorite) {
        state.bank += 4;
        markActivated(state, item);
        item.metadata.favorite = Math.floor(effectRng(state, "monkey")() * 10);
        state.seenEvents.push({
          index,
          id: item.owner.id,
          note: `+$4 · Favorite: ${item.metadata.favorite}`,
        });
        state.pendingEvents.push({
          id: item.owner.id,
          points: 0n,
          cash: 2,
          multiplier: ratio(1),
          note: `+$4 · Favorite: ${item.metadata.favorite}`,
          steps: [],
          cashOnly: true,
        });
      }
      if (item.id === "robot" && (value === 0 || value === 1)) {
        markActivated(state, item);
        item.metadata.power += 2n;
        state.seenEvents.push({
          index,
          id: item.id,
          note: `+1 P0W3R: N3W P0W3R: ${formatNumber(item.metadata.power)}`,
        });
      }
      if (item.id === "octopus" && value === 8) {
        if (octopusCash) markActivated(state, item);
        const cash = octopusCash;
        state.bank += cash;
        state.seenEvents.push({ index, id: item.owner.id, note: `+$${cash}` });
        let event = state.pendingEvents.find(
          (event) =>
            event.abilityId === "octopus" && event.ownerUid === item.owner.uid,
        );
        if (!event) {
          event = {
            id: item.owner.id,
            abilityId: "octopus",
            ownerUid: item.owner.uid,
            cashOnly: true,
            points: 0n,
            cash: 0,
            multiplier: ratio(1),
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
      markActivated(state, item);
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
            points: 0n,
            multiplier: ratio(1),
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
  state.activatedTrinkets = [];
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
  awakenDormant(state);
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
    0n,
  );
  for (const event of state.pendingEvents) {
    event.previewPoints = event.points;
    if (hasMultiplier(event.multiplier)) {
      const after = multiplyRatio(points, event.multiplier);
      event.previewPoints += roundRatio(after) - roundRatio(points);
      points = after;
    }
  }
  for (const event of state.pendingEvents.filter(
    (event) => event.flagCount || event.id === "checkered-flag",
  )) {
    const extra = BigInt(
      Math.ceil(goalFor(state.round) * 0.3) * (event.flagCount || 1),
    );
    event.previewPoints += extra;
    points = addRatio(points, extra);
  }
  state.points = roundRatio(points);
}

/** Validates and applies a tool, spending a use only after a successful action. */
export function useTool(state, id, target, source = null) {
  syncTrinkets(state);
  state.reelError = null;
  const tool = state.tools.find((t) => t.id === id),
    def = ITEMS[id];
  if (state.phase !== "editing" || !tool || tool.uses < 1) return false;
  let targetItem = null;
  if (def.target === "trinket") {
    const targetId = Number.isInteger(target)
      ? state.trinkets[target]?.id
      : target;
    // The oldest copy anchors the stack; tools act on its newest copy.
    targetItem = state.trinkets.findLast((t) => t.id === targetId);
    if (!targetItem) return false;
  }
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
    [
      "bomb",
      "w",
      "soap",
      "pill",
      "qubit",
      "razor",
      "trollingstone",
      "cutdown",
    ].includes(id) &&
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
  state.seenEvents = [];
  switch (id) {
    case "jar":
      if (tool.savedValue == null) {
        if (!isDigit(reelValue(old))) return false;
        tool.savedValue = reelValue(old);
        seenIndices = [];
      } else {
        state.reels[target] = tool.savedValue;
        delete tool.savedValue;
      }
      break;
    case "razor":
    case "trollingstone":
    case "cutdown": {
      const value = reelValue(old);
      if (id === "razor" && state.bank < 10) return false;
      if (
        id !== "razor" &&
        (!isDigit(value) || (id === "trollingstone" ? value > 2 : value < 7))
      )
        return false;
      if (id === "razor") state.bank -= 10;
      pool.splice(position, 1);
      state.positions[target] = -1;
      state.reels[target] = null;
      break;
    }
    case "pawn":
    case "dna":
    case "magicwand": {
      const item = targetItem;
      if (id === "pawn") {
        state.trinkets.splice(state.trinkets.lastIndexOf(item), 1);
        state.bank += 35;
      } else if (id === "dna") {
        if (!["common", "uncommon"].includes(ITEMS[item.id].rarity))
          return false;
        cloneTrinket(state, item);
      } else if (!transformTrinket(state, item, "frog")) return false;
      awakenDormant(state);
      break;
    }
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
      cloneTrinket(state, targetItem);
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
      const item = targetItem;
      if (
        !canTransform(state, item) ||
        ITEMS[item.id].rarity === "token"
      )
        return false;
      const candidates = availableTrinkets.filter(
        (t) =>
          t.rarity === ITEMS[item.id].rarity &&
          !has(state, t.id) &&
          canGenerateTrinket(state, t.id),
      );
      const replacement =
        choose(candidates, effectRng(state, "butterfly")) ?? ITEMS.bug;
      transformTrinket(state, item, replacement.id);
      break;
    }
    case "sparkles": {
      const item = targetItem;
      if (!canTransform(state, item)) return false;
      const rarityIndex = trinketRarities.indexOf(ITEMS[item.id].rarity);
      if (rarityIndex < 0) {
        return false;
      }
      const nextRarity =
        rarityIndex === trinketRarities.length - 1
          ? trinketRarities[rarityIndex]
          : trinketRarities[rarityIndex + 1];
      const candidates = availableTrinkets.filter(
        (t) =>
          t.rarity === nextRarity &&
          !has(state, t.id) &&
          canGenerateTrinket(state, t.id),
      );
      const replacement = candidates.length
        ? choose(candidates, effectRng(state, "sparkles"))
        : ITEMS.bug;
      transformTrinket(state, item, replacement.id);
      break;
    }
    case "camera": {
      const item = targetItem;
      if (PASSIVE_TRINKETS.has(item.id)) return false;
      const event = activate(state, item);
      cameraEvent = event;
      if (item.id === "no-tools") {
        event.points = 0n;
        event.steps = [];
      }
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
  recordSeen(state, seenIndices);
  const cameraId = targetItem?.id;
  if (id === "camera" && ["realknife", "crystalball"].includes(cameraId)) {
    const item = targetItem;
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
    (t) =>
      !has(state, t.id) &&
      canGenerateTrinket(state, t.id) &&
      (!rarities || rarities.includes(t.rarity)),
  );
  const rng = effectRng(state, "reward");
  const weight = pool.reduce((sum, t) => sum + (t.id === "dud" ? 0.1 : 1), 0);
  let roll = rng() * weight;
  const def =
    pool.find((t) => (roll -= t.id === "dud" ? 0.1 : 1) < 0) ?? ITEMS.bug;
  if (def) acquire(state, def.id);
  return def;
}

/** Transforms the opening stacks and their visible neighbors, without wrapping. */
function openPackage(state, owners) {
  const stacks = trinketStacks(state);
  const ids = new Set(
    owners.flatMap((owner) => {
      const index = stacks.findIndex((stack) => stack.id === owner.id);
      return index < 0
        ? []
        : stacks
            .slice(Math.max(0, index - 3), index + 4)
            .map((stack) => stack.id);
    }),
  );
  const targets = state.trinkets.filter((item) => ids.has(item.id));
  // The event keeps this exclusion even if it transforms Dormant II first.
  const blockedDormant = has(state, "dormant2");
  state.packageActivations = (state.packageActivations ?? 0) + 1;
  const rng = random(
    hash(`${state.seed}:package-transform:${state.packageActivations}`),
  );
  for (const item of targets) {
    const trinketRarity = trinketRarities.indexOf(ITEMS[item.id].rarity);
    if (!canTransform(state, item) || trinketRarity === -1) continue;
    const minimum = Math.min(3, trinketRarity + 1);
    const pool = availableTrinkets.filter(
      (t) =>
        t.rarity === trinketRarities[minimum] &&
        !has(state, t.id) &&
        canGenerateTrinket(state, t.id) &&
        (!blockedDormant || t.id !== "dormant1"),
    );
    const replacement =
      chooseShopItem(availableTrinkets, pool, rng, () => 1) ?? ITEMS.bug;
    transformTrinket(state, item, replacement.id);
  }
}

/** Resolves an Alembic reward or a Test Tube clone with shared metadata. */
function experiment(state, item) {
  if (item.id === "alembic") return randomTrinket(state);
  if (item.id === "upgradeexp") {
    const tool =
      state.tools[
        Math.floor(effectRng(state, "optimization")() * state.tools.length)
      ];
    if (tool) {
      tool.maxUses++;
      tool.uses++;
      return ITEMS[tool.id];
    }
    return null;
  }
  if (item.id === "toolexp") {
    const pool = TOOLS.filter(
      (t) =>
        t.rarity === "rare" && !state.tools.some((owned) => owned.id === t.id),
    );
    const def = pool[Math.floor(effectRng(state, "thought")() * pool.length)];
    if (def) acquire(state, def.id);
    return def;
  }
  const pool = state.trinkets.filter(
    (t) =>
      t !== (item.owner ?? item) &&
      t.id !== "frog" &&
      !EXPERIMENTS.includes(t.id),
  );
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
  if (def.kind === "trinket") {
    for (const ability of trinketEffects(state).filter(
      (t) => t.owner === item && EXPERIMENTS.includes(t.id),
    )) {
      const reward = experiment(state, ability);
      if (reward) markActivated(state, ability);
    }
    awakenDormant(state);
  }
  if (id === "monkey" || id === "liberty")
    item.metadata.favorite = Math.floor(effectRng(state, id)() * 10);
  // Fax copies the ability, but only physical Moai copies share initialization.
  if (
    id === "moai" &&
    !copied &&
    state.trinkets.filter((t) => t.id === id).length === 1
  )
    item.metadata.favorite = chooseMoaiFavorite(state);
  if (id === "cartwheel")
    for (const t of state.tools.filter((t) => REROLLS.includes(t.id)))
      t.uses += 3;
  if (def.kind === "tool" && REROLLS.includes(id) && has(state, "cartwheel"))
    item.uses += 3 * count(state, "cartwheel");
}

/** Combines an owner's copied abilities into one inventory card's score event. */
function activate(state, item, context = {}) {
  const ownerId = item.id;
  const path = context.path ?? new Set();
  if (path.has(item.uid)) return emptyEvent(item.id);
  const next = new Set([...path, item.uid]);
  const abilities =
    context.abilities ?? trinketEffects(state).filter((t) => t.owner === item);
  const events = abilities.map((ability) =>
    activateAbility(state, ability, { ...context, path: next }),
  );
  if (events.length === 1 && abilities[0].id === ownerId)
    return { ...events[0], ownerUid: item.uid };
  const event = emptyEvent(ownerId);
  event.ownerUid = item.uid;
  const copiedLines = [];
  for (const [index, part] of events.entries()) {
    const details = [
      part.points ? `+${formatNumber(part.points)} points` : "",
      part.note.replace(/\n/g, " · "),
    ]
      .filter(Boolean)
      .join(" · ");
    copiedLines.push(
      `${ITEMS[abilities[index].id].name}${details ? ": " + details : ""}`,
    );
    event.points += part.points;
    event.cash += part.cash;
    event.multiplier = multiplyRatio(event.multiplier, part.multiplier);
    // Reveal each copied trinket on its own line as its contributions animate.
    event.steps.push(
      ...(part.steps.length ? part.steps : [{ reels: [], points: 0n }]).map(
        (step) => ({ ...step, note: copiedLines.join("\n") }),
      ),
    );
    event.flagCount += part.flagCount ?? 0;
    event.snailCount += part.snailCount ?? 0;
    event.rewardBonus += part.rewardBonus ?? 0;
    event.silentCount += part.silentCount ?? 0;
    event.silentOwnerUids.push(...(part.silentOwnerUids ?? []));
    event.snailOwnerUids.push(...(part.snailOwnerUids ?? []));
    if (part.repeatedTrinkets)
      (event.repeatedTrinkets ??= []).push(...part.repeatedTrinkets);
  }
  event.deferredSilent =
    events.length > 0 && events.every((part) => part.deferredSilent);
  event.note = copiedLines.join("\n");
  return event;
}

const emptyEvent = (id) => ({
  id,
  points: 0n,
  cash: 0,
  multiplier: ratio(1),
  steps: [],
  note: "",
  flagCount: 0,
  snailCount: 0,
  rewardBonus: 0,
  silentCount: 0,
  silentOwnerUids: [],
  snailOwnerUids: [],
});

/** Ranks a normal spin on an isolated copy so previews cannot pay or grow trinkets. */
function phoenixRanking(state) {
  const preview = structuredClone(state);
  settleSpin(preview, { skipPhoenix: true });
  const points = new Map();
  for (const event of preview.events) {
    const uids = event.silentCount ? event.silentOwnerUids : [event.ownerUid];
    for (const uid of uids) {
      if (uid == null) continue;
      points.set(
        uid,
        addRatio(
          points.get(uid) ?? 0n,
          ratio(event.points, BigInt(uids.length)),
        ),
      );
    }
  }
  const phoenixOwners = new Set(
    trinketEffects(state)
      .filter((effect) => effect.id === "phoenix")
      .map((effect) => effect.owner.uid),
  );
  return state.trinkets
    .map((item, index) => ({
      uid: item.uid,
      points: points.get(item.uid) ?? ratio(0),
      index,
    }))
    .filter((item) => !phoenixOwners.has(item.uid))
    .sort((a, b) => compareRatio(b.points, a.points) || a.index - b.index)
    .map((item) => item.uid);
}

/** Resolves scoring, transformation, and reward hooks for one ability. */
function activateAbility(state, item, context) {
  const owner = item.owner ?? item;
  const ownerId = owner.id;
  if (item.id === "phoenix" && context.skipPhoenix) {
    markActivated(state, item);
    return emptyEvent(ownerId);
  }
  if (item.id === "silent") {
    return {
      ...emptyEvent(ownerId),
      silentCount: 1,
      silentOwnerUids: [owner.uid],
      deferredSilent: true,
      note: "Resolves after the other trinkets.",
    };
  }
  if (
    (!context.scoring || context.repeat) &&
    [
      "robot",
      "monkey",
      "anxious",
      "numbers",
      "octopus",
      "realknife",
      "crystalball",
    ].includes(item.id)
  )
    recordSeen(state, [0, 1, 2, 3, 4, 5], [item]);
  const event = scoreTrinket(item, state.reels, state);
  event.flagCount = item.id === "checkered-flag" ? 1 : 0;
  event.snailCount = item.id === "snail" ? 1 : 0;
  event.snailOwnerUids = item.id === "snail" ? [owner.uid] : [];
  state.bank += event.cash;
  // Parrot carries this restriction through Fax: scoring and score growth only.
  if (item.pointsOnly) {
    if (event.points || hasMultiplier(event.multiplier) || event.flagCount)
      markActivated(state, item);
    event.id = ownerId;
    return event;
  }
  const roll = () => effectRng(state, item.id)();
  const notes = [];
  if (EXPERIMENTS.includes(item.id) && (!context.scoring || context.repeat)) {
    const reward = experiment(state, item);
    if (reward) notes.push(`Gained ${reward.name}`);
  }
  if (item.id === "realknife" || item.id === "crystalball")
    notes.push(`${item.metadata.count}/${item.id === "realknife" ? 9 : 8}`);
  if (item.id === "constructionworker") {
    const t = state.tools[Math.floor(roll() * state.tools.length)];
    if (t) {
      t.maxUses++;
      t.uses++;
      notes.push(`Upgraded ${ITEMS[t.id].name}`);
    }
  }
  if (item.id === "technologist") {
    const pool = TOOLS.filter(
      (t) => !state.tools.some((owned) => owned.id === t.id),
    );
    const def = pool[Math.floor(roll() * pool.length)];
    if (def) {
      acquire(state, def.id);
      notes.push(`Gained ${def.name}`);
    }
  }
  if (item.id === "bank" && (!context.scoring || context.repeat)) {
    const amount = Math.floor(state.bank * 0.1);
    state.bank += amount;
    notes.push(`+$${amount} interest`);
  }
  if (item.id === "package" && !context.scoring && packageMatches(state)) {
    openPackage(state, [owner]);
    notes.push("Password matched!");
  }
  if (item.id === "rat") {
    item.metadata.count += state.reels
      .map(reelValue)
      .filter((n) => n === 3).length;
    while (item.metadata.count >= 3) {
      item.metadata.count -= 3;
      notes.push(`Gained ${randomTrinket(state, ["uncommon", "rare"]).name}`);
    }
    event.note = `Progress: ${item.metadata.count}/3`;
  }
  if (item.id === "dud") {
    cloneTrinket(state, owner.id === "dud" ? owner : ownItem("dud"));
    notes.push("Created a Dud");
  }
  if (
    item.id === "dormant2" &&
    state.reels.map(reelValue).every((n) => n === 7)
  ) {
    if (transformTrinket(state, owner, "dormant3"))
      notes.push("Woke up as Ultimate Brainrot");
  }
  if (item.id === "chick") {
    const bugs = state.trinkets.filter((t) => t.id === "bug").slice(0, 2);
    if (bugs.length === 2 && canTransform(state, owner)) {
      for (const bug of bugs)
        state.trinkets.splice(state.trinkets.indexOf(bug), 1);
      transformTrinket(state, owner, "phoenix");
      notes.push("Ate two Bugs and became Phoenix");
    }
  }
  if (item.id === "phoenix") {
    const ranking = context.phoenixRanking ?? phoenixRanking(state);
    const inventory = ranking
      .filter((uid) => !context.path.has(uid))
      .map((uid) => state.trinkets.find((trinket) => trinket.uid === uid))
      .filter(Boolean)
      .slice(0, 3);
    event.repeatedTrinkets = inventory.map(({ id, uid }) => ({ id, uid }));
    for (const other of inventory) {
      if (context.path.has(other.uid)) continue;
      const repeated = activate(state, other, {
        ...context,
        abilities: undefined,
        repeat: true,
      });
      event.points += repeated.points;
      event.cash += repeated.cash;
      event.steps.push(...repeated.steps);
      event.multiplier = multiplyRatio(event.multiplier, repeated.multiplier);
      event.flagCount += repeated.flagCount ?? 0;
      event.snailCount += repeated.snailCount ?? 0;
      event.rewardBonus =
        (event.rewardBonus ?? 0) + (repeated.rewardBonus ?? 0);
      event.silentCount =
        (event.silentCount ?? 0) + (repeated.silentCount ?? 0);
      (event.silentOwnerUids ??= []).push(...(repeated.silentOwnerUids ?? []));
      event.snailOwnerUids.push(...(repeated.snailOwnerUids ?? []));
    }
    transformTrinket(state, owner, "chick");
    const names = event.repeatedTrinkets.map(({ id }) => ITEMS[id].name);
    notes.push(
      `Repeated ${names.join(", ") || "no trinkets"} and reincarnated as Rare Chick`,
    );
  }
  if (context.repeat && ["confettihorn", "partyface"].includes(item.id))
    event.rewardBonus = item.id === "confettihorn" ? 30 : 70;
  if (
    event.points ||
    event.cash ||
    hasMultiplier(event.multiplier) ||
    notes.some((note) => !/^\d+\/\d+$/.test(note)) ||
    event.flagCount
  )
    markActivated(state, item);
  if (notes.length)
    event.note = [event.note, ...notes].filter(Boolean).join("\n");
  // Copied abilities appear under their owner's name and icon.
  event.id = ownerId;
  return event;
}

/** Attributes the rounded goal-bonus increase without paying it a second time. */
function annotateGoalBonuses(state, effects, regular, triggeredGoal) {
  const regularByOwner = new Map(
    regular.map((event) => [event.ownerUid, event]),
  );
  const sources = effects
    .filter((effect) => ["confettihorn", "partyface"].includes(effect.id))
    .map((effect) => ({
      event: regularByOwner.get(effect.owner.uid),
      percent: effect.id === "confettihorn" ? 30 : 70,
    }));
  for (const event of state.events)
    if (event.rewardBonus) sources.push({ event, percent: event.rewardBonus });
  const base = bonusFor(state.round);
  let percent = 100,
    previousReward = base;
  for (const source of sources) {
    percent += source.percent;
    const reward = Math.ceil((base * percent) / 100);
    const cash = triggeredGoal ? reward - previousReward : 0;
    previousReward = reward;
    if (!source.event) continue;
    const event = source.event;
    event.goalBonusCash = (event.goalBonusCash ?? 0) + cash;
    const note = triggeredGoal
      ? `+$${formatNumber(cash)} goal bonus (+${source.percent}% of base reward)`
      : "Goal not reached before The Silent: no bonus.";
    event.note = [event.note, note].filter(Boolean).join("\n");
  }
}

/** Resolves trinket effects, score multipliers, goal rewards, and round history. */
export function settleSpin(state, { skipPhoenix = false } = {}) {
  if (state.phase !== "editing") return false;
  syncTrinkets(state);
  const snapshot = [...state.trinkets];
  const effects = trinketEffects(state);
  const ranking =
    !skipPhoenix && effects.some((effect) => effect.id === "phoenix")
      ? phoenixRanking(state)
      : null;
  state.silentContext = {
    participants: snapshot.map(({ id, uid }) => ({ id, uid })),
    eligibleUids: silentEligibleUids(state),
    silentUids: effects
      .filter((t) => t.id === "silent")
      .map((t) => t.owner.uid),
  };
  const regular = [];
  for (const item of snapshot) {
    if (!state.trinkets.includes(item)) continue;
    const abilities = effects.filter(
      (t) => t.owner === item && t.id !== "octopus",
    );
    regular.push(
      abilities.length
        ? activate(state, item, {
            scoring: true,
            abilities,
            skipPhoenix,
            phoenixRanking: ranking,
          })
        : emptyEvent(item.id),
    );
  }
  const pendingCount = state.pendingEvents.length;
  const deferred = new Map();
  state.events = [...state.pendingEvents, ...regular].filter((event) => {
    if (event.silentCount) {
      const request = deferred.get(event.id) ?? {
        ...emptyEvent(event.id),
        abilityId: "silent",
      };
      request.silentCount += event.silentCount;
      request.silentOwnerUids.push(...event.silentOwnerUids);
      state.silentContext.silentUids.push(...event.silentOwnerUids);
      deferred.set(event.id, request);
    }
    return !event.deferredSilent;
  });
  let points = ratio(
    state.events.reduce((sum, event) => sum + event.points, 0n),
  );
  for (const event of state.events) {
    if (hasMultiplier(event.multiplier)) {
      const before = points;
      // Multipliers appear at the end, after all additive contributions.
      if (["moai", "new moon"].includes(event.id)) {
        const factor = event.id === "moai" ? 3 : 4;
        for (const step of event.steps) {
          const after = multiplyRatio(points, factor);
          step.points = roundRatio(after) - roundRatio(points);
          points = after;
        }
      } else points = multiplyRatio(points, event.multiplier);
      event.multiplierPoints = roundRatio(points) - roundRatio(before);
    }
  }
  const multipliers = state.events.filter((event) =>
    hasMultiplier(event.multiplier),
  );
  state.events = state.events.filter(
    (event) => !hasMultiplier(event.multiplier),
  );
  for (const event of multipliers) {
    event.points += event.multiplierPoints;
    if (event.multiplierPoints && !["moai", "new moon"].includes(event.id))
      event.steps.push({ reels: [], points: event.multiplierPoints });
    state.events.push(event);
  }
  for (const event of state.events.filter(
    (e) => e.flagCount || e.id === "checkered-flag",
  )) {
    const extra = BigInt(
      Math.ceil(goalFor(state.round) * 0.3) * (event.flagCount || 1),
    );
    event.points += extra;
    if (extra) event.steps.push({ reels: [], points: extra });
    points = addRatio(points, extra);
  }
  state.events = [
    ...state.events.filter((e) => !e.flagCount && e.id !== "checkered-flag"),
    ...state.events.filter((e) => e.flagCount || e.id === "checkered-flag"),
  ];
  // Goal-dependent trinkets decide whether to trigger before Silent changes the score.
  const triggerPoints = roundRatio(points);
  const triggeredGoal = compareRatio(points, goalFor(state.round)) >= 0;
  const rewardPercent = triggeredGoal
    ? 100 +
      30 * effects.filter((t) => t.id === "confettihorn").length +
      70 * effects.filter((t) => t.id === "partyface").length +
      state.events.reduce((bonus, event) => bonus + (event.rewardBonus ?? 0), 0)
    : 100;
  for (const effect of effects) {
    if (triggeredGoal && ["confettihorn", "partyface"].includes(effect.id))
      markActivated(state, effect);
  }
  if (!triggeredGoal) {
    for (const event of state.events) {
      for (let i = 0; i < (event.snailCount ?? 0); i++) {
        const reward = randomTrinket(state, ["common", "uncommon"]);
        event.note = [event.note, `Gained ${reward.name}`]
          .filter(Boolean)
          .join("\n");
        const uid = event.snailOwnerUids?.[i];
        if (uid != null) markActivated(state, { uid });
      }
    }
  }
  // Package and its Falling Leaves payouts also resolve before the inactivity snapshot.
  const packages = trinketEffects(state).filter(
    (effect) => effect.id === "package",
  );
  if (packages.length && packageMatches(state)) {
    for (const effect of packages) markActivated(state, effect);
    openPackage(
      state,
      packages.map((effect) => effect.owner),
    );
    for (const effect of packages) {
      const event = state.events.find(
        (event) => event.ownerUid === effect.owner.uid,
      );
      if (event)
        event.note =
          "Password matched: transformed this stack and its neighbors";
    }
  }
  state.events.push(...state.pendingEvents.slice(pendingCount));
  const stacks = inactiveTrinketStacks(state);
  const inactiveCount = stacks.reduce((sum, stack) => sum + stack.count, 0);
  for (const event of deferred.values()) {
    event.silentStacks = stacks.map((stack) => ({ ...stack }));
    event.multiplier = powerRatio(1.1, inactiveCount * event.silentCount);
    const before = points;
    const lines = [];
    for (const [index, stack] of stacks.entries()) {
      const factor = powerRatio(1.1, stack.count * event.silentCount);
      const name = `${ITEMS[stack.id].name}${stack.count > 1 ? ` ×${stack.count}` : ""}`;
      const line = `${name}: didn't trigger · ×${formatRatio(factor)}`;
      lines.push(line);
      const after =
        index === stacks.length - 1
          ? multiplyRatio(before, event.multiplier)
          : multiplyRatio(points, factor);
      event.steps.push({
        reels: [],
        points: roundRatio(after) - roundRatio(points),
        note: lines.join("\n"),
      });
      points = after;
    }
    event.points = roundRatio(points) - roundRatio(before);
    event.note = lines.length
      ? lines.join("\n")
      : "All eligible trinkets activated.";
    if (event.id !== "silent") event.note = `The Silent:\n${event.note}`;
    for (const uid of event.silentOwnerUids) markActivated(state, { uid });
    state.events.push(event);
  }
  // Round once after all multipliers so totals, history, and rewards agree.
  points = roundRatio(points);
  state.points = points;
  const goalReward = Math.ceil((bonusFor(state.round) * rewardPercent) / 100);
  const bonus =
    points >= goalFor(state.round)
      ? goalReward + 50 * state.reels.filter((n) => n === "W").length
      : 0;
  annotateGoalBonuses(state, effects, regular, triggeredGoal);
  let runningBonus = points >= goalFor(state.round) ? goalReward : 0;
  state.reels.forEach((value, index) => {
    if (value !== "W") return;
    const extra = points >= goalFor(state.round) ? 50 : 0;
    runningBonus += extra;
    state.events.push({
      id: "w",
      points: 0n,
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
    triggerPoints,
    bonus,
  });
  delete state.silentContext;
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
    (def.id === "dud" ? 0.1 : 1) *
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

/** Applies item preferences after the shop has already rolled a rarity. */
function shopItemWeight(def) {
  return def.id === "dud" ? 0.1 : 1;
}

/** Each Scientist ability supplies a slot that can offer even an owned Experiment. */
function addExperimentOffers(state, offers, amount) {
  if (amount <= 0) return;
  state.shopRngState ??= hash(`${state.seed}:shop`);
  const rng = () => nextRandom(state, "shopRngState");
  const pool = availableTrinkets.filter((def) => EXPERIMENTS.includes(def.id));
  for (let slot = 0; slot < amount; slot++) {
    const def = chooseShopItem(availableTrinkets, pool, rng);
    offers.push({
      id: def.id,
      kind: "trinket",
      rarity: def.rarity,
      price: itemPrice(def),
      sold: false,
      experiment: true,
    });
  }
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
    const def = chooseShopOffer(
      availableTrinkets,
      availableTrinkets.filter(
        (t) =>
          canOffer(state, t.id) &&
          !offers.some((o) => o.id === t.id) &&
          (!(state.legendaryShops > 0 && slot === 0) ||
            t.rarity === "legendary"),
      ),
      rng,
      boost,
      shopItemWeight,
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
  const tool = chooseShopOffer(
    TOOLS,
    TOOLS.filter((t) => !owned.has(t.id)),
    rng,
    boost * 1.5 ** count(state, "graduate"),
  );
  const trinket = chooseShopOffer(
    availableTrinkets,
    availableTrinkets.filter(
      (t) => canOffer(state, t.id) && !offers.some((o) => o.id === t.id),
    ),
    rng,
    boost,
    shopItemWeight,
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
    const pool = [
      ...new Map(
        state.trinkets
          .filter((t) => t.id !== "bug" && t.id !== "printer")
          .map((item) => [item.id, item]),
      ).values(),
    ];
    const original = chooseShopItem(availableTrinkets, pool, rng, () => 1);
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
    const upgrade = chooseShopOffer(
      TOOLS,
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
        Boolean(candidate.experiment) === Boolean(offer.experiment) &&
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
  state.points = 0n;
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
  const scientistCount = count(state, "scientist");
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
  state.bank += 9 * count(state, "ferriswheel");
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
  return `RNGdlelike - ${heading}\n${formatNumber(state.total)} points in ${state.history.length}/20 spins!\nGoals: ${state.history.filter((h) => h.bonus).length}/20 - Best spin: ${formatNumber(state.history.reduce((best, h) => (asScore(h.points) > best ? asScore(h.points) : best), 0n))}\nTrinkets: ${summary(state.trinkets)}\nTools: ${summary(state.tools)}\nThink you can beat me? Play the same seed!\n${url}`;
}
