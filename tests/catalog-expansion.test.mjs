import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { ITEMS, TRINKETS, TOOLS, ownItem, itemPrice, iconPath } from "../js/items.js";
import { createRun, syncTrinkets, spin, useTool, settleSpin, generateOffers,
  enterShop, nextRound, buy, rerollShop, bonusFor, allowanceFor } from "../js/engine.js";
import { trinketEffects, trinketStacks } from "../js/effects.js";

function run(ids = [], toolIds = [], reels = [0, 1, 2, 3, 4, 5]) {
  const state = createRun(42);
  state.trinkets = ids.map(ownItem);
  state.tools = toolIds.map(ownItem);
  state.phase = "editing";
  state.reels = reels;
  state.positions = [...reels];
  state.bank = 100;
  state.pendingEvents = [];
  syncTrinkets(state);
  return state;
}

test("every catalog item has an icon and an implemented effect", () => {
  assert.equal(new Set([...TRINKETS, ...TOOLS].map((t) => t.id)).size, TRINKETS.length + TOOLS.length);
  for (const item of [...TRINKETS, ...TOOLS]) assert.ok(existsSync(iconPath(item.id)), item.id);
  for (const item of TRINKETS) assert.ok(settleSpin(run([item.id, "even"])), item.id);
  for (const file of ["trinkets", "tools"]) {
    const csv = readFileSync(new URL(`../data/catalog/${file}.csv`, import.meta.url), "utf8");
    for (const item of file === "trinkets" ? TRINKETS : TOOLS)
      assert.ok(csv.split(/\r?\n/).some((line) => line.startsWith(item.id + ",")), item.id);
  }
});

test("Brainrot III multiplies only an all-6/7 board; Relaxed Face costs $17", () => {
  let state = run(["relaxedface", "brainrot3"], [], [6, 7, 6, 7, 6, 7]);
  settleSpin(state);
  assert.equal(state.points, 24 * 67);
  state = run(["relaxedface", "brainrot3"]);
  settleSpin(state);
  assert.equal(state.points, 24);
  assert.equal(itemPrice(ITEMS.relaxedface), 17);
  assert.equal(ITEMS.relaxedface.rarity, "uncommon");
});

test("Token and fallback trinkets never appear in starting inventories or normal shop offers", () => {
  for (let seed = 0; seed < 100; seed++) {
    const state = createRun(seed);
    const offers = generateOffers(state);
    for (const item of [...state.trinkets, ...offers.filter((o) => !o.empty)])
      assert.ok(!["token", "fallback"].includes(ITEMS[item.id].rarity));
  }
});

test("Pawn sells one copy, DNA duplicates only Common/Uncommon, Wand creates Frog", () => {
  const state = run(["even", "brainrot3", "fallingleaves"], ["pawn", "dna", "magicwand"]);
  assert.equal(useTool(state, "dna", 1), false);
  assert.equal(state.tools[1].uses, 1);
  assert.equal(useTool(state, "dna", 0), true);
  assert.equal(state.trinkets.filter((t) => t.id === "even").length, 2);
  assert.equal(useTool(state, "pawn", 3), true);
  assert.equal(state.bank, 110);
  assert.equal(useTool(state, "magicwand", 2), false);
  assert.equal(useTool(state, "magicwand", 0), true);
  assert.equal(state.trinkets[0].id, "frog");
  assert.equal(state.bank, 140);
});

test("reel-removal tools reject invalid targets without spending uses or money", () => {
  for (const [id, valid, invalid] of [["trollingstone", 2, 3], ["cutdown", 7, 6]]) {
    const state = run([], [id]);
    assert.equal(useTool(state, id, invalid), false);
    assert.equal(state.tools[0].uses, 1);
    state.reels[0] = valid;
    state.positions[0] = valid;
    assert.equal(useTool(state, id, 0), true);
    assert.equal(state.reelPools[0].includes(valid), false);
    assert.equal(state.reels[0], null);
  }
  const state = run([], ["razor"]);
  state.bank = 29;
  assert.equal(useTool(state, "razor", 0), false);
  state.bank = 30;
  assert.equal(useTool(state, "razor", 0), true);
  assert.equal(state.bank, 0);
});

test("Jar stores a digit across JSON saves and places it on a later spin", () => {
  let state = run(["even"], ["jar"], [7, 1, 2, 3, 4, 5]);
  assert.equal(useTool(state, "jar", 0), true);
  assert.equal(state.tools[0].savedValue, 7);
  assert.equal(state.reels[0], 7);
  settleSpin(state);
  enterShop(state);
  state = JSON.parse(JSON.stringify(state));
  nextRound(state);
  spin(state);
  assert.equal(useTool(state, "jar", 1), true);
  assert.equal(state.reels[1], 7);
  assert.equal(state.tools[0].savedValue, undefined);
});

test("Abacus requires exactly five successful tool uses; Mechanic loses $7 per use", () => {
  for (const used of [0, 5, 6, 15]) {
    const state = run(["abacus", "mechanic"]);
    state.toolsUsed = used;
    settleSpin(state);
    assert.equal(state.bank, 100 + (used === 5 ? 45 : 0) + Math.max(0, 100 - 7 * used) + allowanceFor(1));
  }
});

test("Parrot copies all Common/Uncommon score and cash abilities", () => {
  const state = run(["even", "pig", "parrot"]);
  settleSpin(state);
  assert.equal(state.points, 30);
  assert.equal(state.bank, 100 + 16 + bonusFor(1) + allowanceFor(1));
  assert.equal(state.events.find((e) => e.id === "parrot").points, 15);
});

test("copied passive abilities affect reel odds, prices, and shop rewards", () => {
  const state = run(["parrot", "wrench", "confettihorn", "relaxedface"]);
  state.phase = "shop";
  const toolOffer = generateOffers(state).find((o) => o.kind === "tool");
  if (toolOffer) assert.equal(toolOffer.price, Math.ceil(itemPrice(ITEMS[toolOffer.id]) * 1.4 * 0.25));
  state.phase = "editing";
  settleSpin(state);
  assert.equal(state.history[0].bonus, Math.ceil(20 * 1.3 ** 2));
});

test("Fax copies its right neighbor including chains; missing neighbors give no ability", () => {
  const state = run(["fax", "fax", "relaxedface"]);
  settleSpin(state);
  assert.equal(state.points, 72);
  const empty = run(["relaxedface", "fax"]);
  settleSpin(empty);
  assert.equal(empty.points, 24);
});

test("Silent counts inactive trinkets, including an inactive Fax, after scoring other abilities", () => {
  const state = run(["silent", "odd", "even", "fax"], [], [2, 2, 2, 2, 2, 2]);
  settleSpin(state);
  assert.equal(state.points, 30 * 1.2 ** 2);
});

test("Dormant advances with all Brainrot levels and six scored sevens", () => {
  const state = run(["dormant1", "brainrot1", "brainrot2", "brainrot3"]);
  state.phase = "ready";
  spin(state);
  assert.equal(state.trinkets[0].id, "dormant2");
  state.reels.fill(7);
  settleSpin(state);
  assert.equal(state.trinkets[0].id, "dormant3");
  state.phase = "editing";
  state.trinkets = [ownItem("dormant3"), ownItem("relaxedface")];
  state.reels = [6, 7, 6, 7, 6, 7];
  settleSpin(state);
  assert.equal(state.points, 24 * 67 ** 3);
});

test("Rare Chick consumes two Bugs, Phoenix repeats abilities and becomes Rare Chick", () => {
  const state = run(["chick", "bug", "bug", "relaxedface", "pig"]);
  settleSpin(state);
  assert.equal(state.trinkets[0].id, "phoenix");
  assert.equal(state.trinkets.some((t) => t.id === "bug"), false);
  assert.equal(state.points, 224);
  state.phase = "editing";
  const bank = state.bank;
  settleSpin(state);
  assert.equal(state.trinkets[0].id, "chick");
  assert.equal(state.points, 48);
  assert.equal(state.bank - bank, 16 + bonusFor(1) + allowanceFor(1));
  assert.ok(state.events.some((e) => e.id === "phoenix"));
});

test("Phoenix and copied Phoenix abilities cannot recurse forever", () => {
  const state = run(["phoenix", "phoenix", "fax", "phoenix", "relaxedface"]);
  settleSpin(state);
  assert.ok(Number.isFinite(state.points));
  assert.ok(state.points >= 24);
});

test("Frog compounds interest on the entire total without raising the spin score", () => {
  const state = run(["frog", "frog", "relaxedface"]);
  state.total = 976;
  settleSpin(state);
  assert.equal(state.points, 24);
  assert.equal(state.total, 1041);
  assert.equal(state.events.reduce((s, e) => s + (e.totalPoints ?? 0), 0), 41);
});

test("Frog is excluded from Replication Experiment targets", () => {
  const state = run(["frog"], ["camera"]);
  state.phase = "shop";
  state.offers = [{ id: "test-tube", kind: "trinket", price: 0 }];
  buy(state, 0);
  assert.equal(state.trinkets.filter((t) => t.id === "frog").length, 1);
  assert.ok(state.trinkets.some((t) => t.id === "bug"));
});

test("Falling Leaves rejects transformation, permits duplication, and pays per transformation", () => {
  const state = run(["fallingleaves", "even"], ["butterfly", "mirror"]);
  assert.equal(useTool(state, "butterfly", 0), false);
  assert.equal(state.tools[0].uses, 1);
  assert.equal(useTool(state, "mirror", 0), true);
  assert.equal(useTool(state, "butterfly", 1), true);
  assert.equal(state.bank, 160);
});

test("Rat counts scored threes across spins; Dud creates one new Dud per owned copy", () => {
  const state = run(["rat", "dud"], [], [3, 3, 0, 0, 0, 0]);
  settleSpin(state);
  assert.equal(state.trinkets[0].metadata.count, 2);
  assert.equal(state.trinkets.filter((t) => t.id === "dud").length, 2);
  state.phase = "editing";
  state.reels = [3, 0, 0, 0, 0, 0];
  settleSpin(state);
  assert.equal(state.trinkets[0].metadata.count, 0);
  assert.equal(state.trinkets.filter((t) => t.id === "dud").length, 4);
  assert.ok(state.trinkets.some((t) => ITEMS[t.id].rarity === "common"));
});

test("Numbers and Anxious Face see digits in order across tool uses", () => {
  for (const id of ["numbers", "anxious"]) {
    const state = run([id], ["increment"]);
    state.tools[0].uses = 20;
    state.tools[0].maxUses = 20;
    state.reels[0] = 9;
    // Increment creates 0, then 1 through 9; unrelated sightings do not reset progress.
    for (let i = 0; i < 10; i++) assert.ok(useTool(state, "increment", 0));
    if (id === "anxious") assert.equal(state.trinkets[0].id, "relaxedface");
    else assert.equal(state.trinkets[0].metadata.nextDigit, 0);
    assert.ok(state.trinkets.slice(1).some((t) => ITEMS[t.id].rarity === (id === "anxious" ? "legendary" : "rare")));
  }
});

test("Monkey pays on sightings and changes favorite; Lady Liberty pays on scored matches", () => {
  const state = run(["monkey", "liberty"], ["seven-tool"], [0, 0, 0, 0, 0, 0]);
  state.trinkets[0].metadata.favorite = 7;
  state.trinkets[1].metadata.favorite = 7;
  assert.ok(useTool(state, "seven-tool", 0));
  assert.equal(state.bank, 102);
  assert.ok(state.trinkets[0].metadata.favorite >= 0 && state.trinkets[0].metadata.favorite <= 9);
  settleSpin(state);
  assert.equal(state.bank, 102 + 20 + allowanceFor(1));
});

test("Scientist offers owned Experiments again and increases Experiment frequency", () => {
  let normalCount = 0, scientistCount = 0;
  for (let seed = 0; seed < 150; seed++) {
    for (const scientist of [false, true]) {
      const state = createRun(seed);
      state.trinkets = (scientist ? ["scientist", "test-tube"] : ["test-tube"]).map(ownItem);
      const offers = generateOffers(state);
      assert.ok(scientist || !offers.some((o) => o.id === "test-tube"));
      const amount = offers.filter((o) => ["test-tube", "alembic", "upgradeexp", "toolexp"].includes(o.id)).length;
      if (scientist) scientistCount += amount; else normalCount += amount;
    }
  }
  assert.ok(scientistCount > normalCount * 3);
});

test("Optimization and Thought Experiments give their rewards on acquisition", () => {
  const state = run(["even"], ["increment"]);
  state.phase = "shop";
  state.offers = ["upgradeexp", "toolexp"].map((id) => ({ id, kind: "trinket", price: 0 }));
  assert.ok(buy(state, 0));
  assert.equal(state.tools[0].maxUses, 2);
  assert.ok(buy(state, 1));
  assert.equal(state.tools.length, 2);
  assert.equal(ITEMS[state.tools[1].id].rarity, "rare");
});

test("Ferris Wheel pays $9 for a successful reroll, and cannot finance one up front", () => {
  const state = run(["ferriswheel"]);
  state.phase = "shop";
  state.bank = 2;
  assert.equal(rerollShop(state), false);
  state.bank = 3;
  assert.equal(rerollShop(state), true);
  assert.equal(state.bank, 9);
});

test("copy metadata and activation identities survive JSON serialization", () => {
  const state = run(["robot", "robot", "parrot"]);
  const restored = JSON.parse(JSON.stringify(state));
  syncTrinkets(restored);
  assert.equal(restored.trinkets[0].metadata, restored.trinkets[1].metadata);
  assert.notEqual(restored.trinkets[0].uid, restored.trinkets[1].uid);
  assert.equal(trinketEffects(restored).length, 4);
});

test("multiple Silents do not count each other as inactive scoring trinkets", () => {
  const state = run(["silent", "silent", "relaxedface"]);
  settleSpin(state);
  assert.equal(state.points, 24);
});

test("Phoenix repeats multipliers, goal rewards, and total interest", () => {
  const state = run(["phoenix", "relaxedface", "brainrot3", "frog", "confettihorn"], [], [6, 7, 6, 7, 6, 7]);
  settleSpin(state);
  assert.equal(state.points, 48 * 67 ** 2);
  assert.equal(state.history[0].bonus, Math.ceil(20 * 1.3 ** 2));
  assert.equal(state.total, Math.ceil(Math.ceil(state.points * 1.02) * 1.02));
});

test("Camera on a copied Checkered Flag previews its actual points", () => {
  const state = run(["fax", "checkered-flag"], ["camera"]);
  assert.equal(useTool(state, "camera", 0), true);
  assert.equal(state.points, 3);
  settleSpin(state);
  assert.equal(state.points, 9);
});

test("Camera Phoenix preserves the extra goal reward until scoring", () => {
  const state = run(["phoenix", "relaxedface", "confettihorn"], ["camera"]);
  assert.equal(useTool(state, "camera", 0), true);
  settleSpin(state);
  assert.equal(state.history[0].bonus, Math.ceil(20 * 1.3 ** 2));
});

test("seeded twenty-spin runs remain reproducible after JSON save/resume", () => {
  function play(resume) {
    let state = run(["even", "parrot", "liberty", "mechanic", "frog", "rat", "numbers"], ["increment", "jar"]);
    state.phase = "ready";
    for (let round = 1; round <= 20; round++) {
      assert.ok(spin(state));
      assert.ok(useTool(state, "increment", 0));
      assert.ok(useTool(state, "jar", 1));
      assert.ok(settleSpin(state));
      if (round < 20) {
        assert.ok(enterShop(state));
        assert.ok(nextRound(state));
      }
      if (resume) { state = JSON.parse(JSON.stringify(state)); syncTrinkets(state); }
    }
    assert.equal(state.phase, "finished");
    assert.equal(state.history.length, 20);
    return { total: state.total, bank: state.bank, history: state.history, trinkets: state.trinkets };
  }
  assert.deepEqual(play(true), play(false));
});

test("Fax preserves one visible card per stack and copies the next visible stack", () => {
  const state = run(["pig", "fax", "pig", "relaxedface", "fax"]);
  assert.deepEqual(trinketStacks(state).map((t) => t.id), ["pig", "fax", "relaxedface"]);
  assert.equal(trinketStacks(state)[1], state.trinkets[1]);
  assert.deepEqual(trinketEffects(state).filter((t) => t.owner.id === "fax").map((t) => t.id),
    ["relaxedface", "relaxedface"]);
  settleSpin(state);
  assert.equal(state.points, 72);
  assert.equal(state.trinkets.length, 5);
});

test("tool transformations preserve stack copy counts and physical identities", () => {
  for (const tool of ["magicwand", "butterfly", "sparkles"]) {
    const state = run(["robot", "robot", "robot", "fax"], [tool]);
    const uids = state.trinkets.map((t) => t.uid);
    assert.ok(useTool(state, tool, 0));
    assert.equal(state.trinkets.length, 4);
    assert.deepEqual(state.trinkets.map((t) => t.uid), uids);
    assert.equal(state.trinkets.filter((t) => t.id === "robot").length, 2);
    const stacks = trinketStacks(state);
    assert.equal(stacks.length, 3);
    assert.equal(new Set(stacks.map((t) => t.id)).size, stacks.length);
  }
});
