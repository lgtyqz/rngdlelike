import test from "node:test";
import assert from "node:assert/strict";
import { scoreTrinket, createRun, settleSpin, spin } from "../js/engine.js";
import { ownItem, TRINKETS } from "../js/items.js";
import { animateCount, countValue } from "../js/animation.js";

test("Even Steven scores each even reel left to right in four-point increments", () => {
  const event = scoreTrinket(ownItem("even"), [2, 3, 0, 6, 9, 8]);
  assert.deepEqual(event.steps, [0, 2, 3, 5].map((i) => ({ reels: [i], points: 4 })));
  assert.equal(event.points, 16);
});

test("growing trinkets record the power used at each hit and grow only once", () => {
  for (const [id, digit, power] of [["bean", 1, 10], ["rocket", 9, 30]]) {
    const item = ownItem(id);
    const event = scoreTrinket(item, [digit, 2, digit, 3, digit, 4]);
    assert.deepEqual(event.steps, [0, 2, 4].map((reel, i) => ({ reels: [reel], points: power + 10 * i })));
    assert.equal(item.metadata.power, power + 30);
  }
});

test("pairs include all combinations while triples use distinct groups", () => {
  const reels = [2, 2, 2, 2, 2, 2];
  const pairs = scoreTrinket(ownItem("pair"), reels);
  assert.equal(pairs.steps.length, 15);
  assert.equal(pairs.points, 120);
  assert.equal(new Set(pairs.steps.map((s) => s.reels.join(","))).size, 15);
  assert.deepEqual(scoreTrinket(ownItem("triple"), reels).steps, [
    { reels: [0, 1, 2], points: 100 }, { reels: [3, 4, 5], points: 100 },
  ]);
});

test("patterns identify contributing reels and unique digits score once", () => {
  assert.deepEqual(scoreTrinket(ownItem("sandwich"), [2, 3, 2, 5, 4, 5]).steps, [
    { reels: [0, 1, 2], points: 35 }, { reels: [3, 4, 5], points: 35 },
  ]);
  assert.deepEqual(scoreTrinket(ownItem("rainbow"), [2, 2, 4, 4, 3, 3]).steps, [
    { reels: [0], points: 9 }, { reels: [2], points: 9 }, { reels: [4], points: 9 },
  ]);
  assert.deepEqual(scoreTrinket(ownItem("garden"), [0, 0, 0, 0, 0, 0]).steps, [{ reels: [], points: 8 }]);
  assert.deepEqual(scoreTrinket(ownItem("even"), [1, 3, 5, 7, 9, 1]).steps, []);
});

test("all trinkets preserve scoring rules across seeded reel combinations", () => {
  for (let seed = 0; seed < 200; seed++) {
    const run = createRun(seed);
    spin(run);
    const r = run.reels;
    const counts = Array.from({ length: 10 }, (_, n) => r.filter((d) => d === n).length);
    const pairs = counts.reduce((s, n) => s + n * (n - 1) / 2, 0);
    const hits = (fn) => r.filter(fn).length;
    const sum = r.reduce((a, b) => a + b, 0);
    const unique = new Set(r).size;
    const expected = {
      even: hits((n) => n % 2 === 0) * 4, odd: hits((n) => n % 2 === 1) * 4,
      zero: counts[0] * 12, pair: pairs * 8, high: hits((n) => n >= 5) * 5,
      low: hits((n) => n < 4) * 6, sum, bean: counts[1] * 10 + counts[1] * (counts[1] - 1) * 5,
      rocket: counts[9] * 30 + counts[9] * (counts[9] - 1) * 5,
      sandwich: r.slice(0, 4).filter((n, i) => n === r[i + 2]).length * 35,
      seven: counts[7] * 25, stairs: r.slice(0, 5).filter((n, i) => r[i + 1] === n + 1).length * 18,
      garden: 8, book: r[0] === r[5] ? 60 : 0, rainbow: unique * 9,
      triple: counts.reduce((s, n) => s + Math.floor(n / 3), 0) * 100,
      mirror: r.slice(0, 3).filter((n, i) => n === r[5 - i]).length * 40,
      diamond: unique === 6 ? 120 : 0, magnet: hits((n) => [2, 3, 5, 7].includes(n)) * 20,
      crown: pairs * 80, dragon: 50, star: sum * 15,
      unicorn: counts[0] && counts[9] ? 500 : 0, galaxy: unique * 70,
    };
    for (const { id } of TRINKETS) {
      const event = scoreTrinket(ownItem(id), r);
      assert.equal(event.points, expected[id], `${id}, seed ${seed}`);
      assert.equal(event.steps.reduce((sum, s) => sum + s.points, 0), event.points);
      assert.ok(event.steps.every((s) => s.reels.every((i) => Number.isInteger(i) && i >= 0 && i < 6)));
    }
  }
});

test("settlement commits exact totals once including the final spin", () => {
  const run = createRun(123);
  run.phase = "editing";
  run.round = 20;
  run.reels = [2, 4, 6, 8, 0, 1];
  settleSpin(run);
  const saved = structuredClone(run);
  assert.equal(run.points, 30);
  assert.equal(run.total, 30);
  assert.equal(run.bank, 210);
  assert.equal(run.phase, "finished");
  assert.equal(settleSpin(run), false);
  assert.deepEqual(run, saved);
});

test("count-up slows down, stays monotonic, and lands exactly on its target", () => {
  const values = [0, 0.25, 0.5, 0.75, 1].map((t) => countValue(100, 1100, t));
  assert.equal(values[0], 100);
  assert.equal(values.at(-1), 1100);
  const deltas = values.slice(1).map((v, i) => v - values[i]);
  assert.ok(deltas.every((d, i) => d > 0 && (i === 0 || d <= deltas[i - 1])));
  for (const to of [0, 4, 50, 1e9]) assert.equal(countValue(0, to, 1), to);
});

test("speed-up during a count finishes it at the exact total", async () => {
  const original = globalThis.requestAnimationFrame;
  let nextFrame;
  globalThis.requestAnimationFrame = (callback) => { nextFrame = callback; };
  try {
    let fast = false;
    const values = [];
    const pending = animateCount({ from: 0, to: 24, update: (n) => values.push(n), instant: () => fast });
    assert.deepEqual(values, [0]);
    fast = true;
    nextFrame(performance.now());
    await pending;
    assert.equal(values.at(-1), 24);
    await animateCount({ from: 24, to: 54, update: (n) => values.push(n), instant: () => true });
    assert.equal(values.at(-1), 54);
  } finally {
    globalThis.requestAnimationFrame = original;
  }
});
