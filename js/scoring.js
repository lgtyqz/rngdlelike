import { ITEMS } from "./items.js";

export const isDigit = (n) => Number.isInteger(n) && n >= 0 && n <= 9;
export const reelValue = (value) =>
  typeof value === "string" && /^bomb:[1-3]$/.test(value)
    ? Number(value.slice(5))
    : value;
export const has = (state, id) =>
  state?.trinkets.some((t) => t.id === id) ?? false;

// Contributions retain reel indices so the scoring animation reflects the actual rule.
export function scoreTrinket(item, reels, state = null) {
  // Bombs retain their tagged value in game state so they can count down and
  // render specially, but every scoring rule treats the countdown as a digit.
  reels = reels.map(reelValue);
  const id = item.id,
    steps = [],
    all = reels.map((_, i) => i);
  const digits = reels.filter(isDigit),
    sum = digits.reduce((a, b) => a + b, 0);
  const value = Number(digits.join(""));
  const counts = Array.from(
    { length: 10 },
    (_, n) => reels.filter((d) => d === n).length,
  );
  const eight = has(state, "eightball") ? 2 : 1;
  let cash = 0,
    multiplier = 1,
    note = "";
  const add = (indices, points, repeat = true) => {
    if (points > 0) {
      steps.push({ reels: indices, points });
      if (repeat && indices.some((i) => reels[i] === 8) && eight === 2)
        steps.push({ reels: indices, points });
    }
  };
  const each = (predicate, fn) =>
    reels.forEach((n, i) => {
      if (!isDigit(n) || !predicate(n)) return;
      for (let hit = 0; hit < (n === 8 ? eight : 1); hit++)
        add([i], typeof fn === "function" ? fn(n) : fn, false);
    });
  const flat = (condition, points) => {
    if (condition) add(all, points, false);
  };
  switch (id) {
    case "apple":
      for (let i = 0; i < reels.length; i++)
        for (let j = i + 1; j < reels.length; j++)
          if (
            isDigit(reels[i]) &&
            isDigit(reels[j]) &&
            reels[i] + reels[j] === 10
          )
            add([i, j], 10);
      break;
    case "yinyang":
      flat(
        digits.length > 0 &&
          digits.filter((n) => n % 2 === 0).length ===
            digits.filter((n) => n % 2 === 1).length,
        88,
      );
      break;
    case "new moon":
      for (const i of all.filter((index) => !isDigit(reels[index])))
        steps.push({ reels: [i], points: 0 });
      multiplier = 10 ** steps.length;
      steps.forEach((step, index) => {
        step.note = `Grey slot: ×10 (${index + 1}/${steps.length})`;
      });
      break;
    case "bug":
      flat(true, 2560);
      break;
    case "robot":
      flat(true, item.metadata.power);
      break;
    case "devil":
      flat(
        reels.some(
          (n, i) => n === 6 && reels[i + 1] === 6 && reels[i + 2] === 6,
        ),
        666,
      );
      break;
    case "no-tools":
      flat(!state?.toolsUsed, 120);
      break;
    case "bicycle":
    case "clover":
    case "octopus":
    case "printer":
    case "checkered-flag":
    case "hammer":
    case "backpack":
    case "mechanical-arm":
    case "test-tube":
    case "alembic":
      break;
    case "even":
      each((n) => n % 2 === 0, 4);
      break;
    case "odd":
      each((n) => n % 2 === 1, 4);
      break;
    case "high":
      each((n) => n >= 5, 3);
      break;
    case "low":
      each((n) => n < 4, 6);
      break;
    case "zero":
      each((n) => n === 0, 12);
      break;
    case "sum":
      each(
        () => true,
        (n) => n,
      );
      break;
    case "family":
      each(
        () => true,
        (n) => n * 10,
      );
      break;
    case "bean":
      each(
        (n) => n === 1,
        () => {
          const p = item.metadata.power;
          item.metadata.power += 5;
          return p;
        },
      );
      break;
    case "pair":
      for (let i = 0; i < reels.length; i++)
        for (let j = i + 1; j < reels.length; j++)
          if (isDigit(reels[i]) && reels[i] === reels[j]) add([i, j], 8);
      break;
    case "sandwich":
      for (let i = 0; i < reels.length - 2; i++)
        if (reels.slice(i, i + 3).every(isDigit) && reels[i] === reels[i + 2])
          add([i, i + 1, i + 2], 35);
      break;
    case "brainrot1":
      flat(counts[6] && counts[7], 67);
      break;
    case "brainrot2":
      flat(
        reels.some((n, i) => n === 6 && reels[i + 1] === 7),
        167,
      );
      break;
    case "brainrot3":
      flat(
        reels.every((n) => n === 6 || n === 7),
        670,
      );
      break;
    case "seven":
    case "hotface":
    case "coldface": {
      const amount = id === "seven" ? 7 : 2;
      each(
        (n) =>
          id === "seven"
            ? n === 7
            : id === "hotface"
              ? [8, 9, 0, 1, 2].includes(n)
              : [3, 4, 5, 6, 7].includes(n),
        () => {
          item.metadata.power += amount;
          return 0;
        },
      );
      add([], item.metadata.power, false);
      break;
    }
    case "bookends":
      if (isDigit(reels[0]) && reels[0] === reels.at(-1))
        add([0, reels.length - 1], 50);
      break;
    case "rainbow": {
      const seen = new Set();
      each(
        (n) => !seen.has(n),
        (n) => {
          seen.add(n);
          return 9;
        },
      );
      break;
    }
    case "triple":
      for (let n = 0; n < 10; n++) {
        const indices = all.filter((i) => reels[i] === n);
        for (let i = 0; i + 2 < indices.length; i += 3)
          add(indices.slice(i, i + 3), 100);
      }
      break;
    case "miniflush":
    case "flush": {
      const count = id === "flush" ? 5 : 4;
      const n = counts.findIndex((c) => c >= count);
      if (n !== -1)
        add(
          all.filter((i) => reels[i] === n),
          id === "flush" ? 500 : 200,
        );
      break;
    }
    case "detective":
      flat(reels.join(",") === "1,2,3,4,5,6", 10000);
      break;
    case "pig":
      cash = 8;
      break;
    case "stocks":
      cash = 20;
      break;
    case "nerd":
      reels.forEach((n, i) => {
        if (n === 0 || n === 1) {
          add([i], 42);
          cash += 10;
        }
      });
      break;
    case "hundred":
      flat(reels.at(-1) === 0 && reels.at(-2) === 0, 100);
      break;
    case "ministraight":
    case "straight":
      // Mini Straight scores each length-three window. Straight scores maximal runs only.
      for (let i = 0; i < reels.length - 2; i++) {
        const delta = reels[i + 1] - reels[i];
        if (
          !isDigit(reels[i]) ||
          !isDigit(reels[i + 1]) ||
          Math.abs(delta) !== 1
        )
          continue;
        let end = i + 2;
        while (
          end < reels.length &&
          isDigit(reels[end]) &&
          reels[end] - reels[end - 1] === delta
        )
          end++;
        if (id === "ministraight" && end - i >= 3)
          add([i, i + 1, i + 2], reels[i] * reels[i + 1] * reels[i + 2]);
        if (
          id === "straight" &&
          end - i >= 4 &&
          (i === 0 ||
            !isDigit(reels[i - 1]) ||
            reels[i] - reels[i - 1] !== delta)
        )
          add(
            all.slice(i, end),
            reels.slice(i, end).reduce((a, b) => a * b, 1),
          );
      }
      break;
    case "bearmarket":
      if (
        isDigit(reels[0]) &&
        isDigit(reels.at(-1)) &&
        reels.at(-1) < reels[0]
      ) {
        add([0, reels.length - 1], 40);
        cash = 20 * (reels[0] === 8 || reels.at(-1) === 8 ? eight : 1);
      }
      break;
    case "bullmaket":
      if (
        isDigit(reels[0]) &&
        isDigit(reels.at(-1)) &&
        reels.at(-1) > reels[0]
      ) {
        add([0, reels.length - 1], 40);
        cash = 20 * (reels[0] === 8 || reels.at(-1) === 8 ? eight : 1);
      }
      break;
    case "rabbit":
    case "heaven":
    case "three": {
      add([], item.metadata.power, false);
      const divisor = { rabbit: 7, heaven: 11, three: 3 }[id];
      if (value % divisor === 0) {
        if (id === "heaven") item.metadata.power *= 2;
        else item.metadata.power += id === "rabbit" ? 177 : 13;
      }
      break;
    }
    case "fortunecookie":
      if (!counts[4] && counts[8]) multiplier = 2;
      break;
    case "fiver":
      flat(value % 5 === 0, 25);
      break;
    case "monocle":
      flat(new Set(reels).size === 1, 1000);
      break;
    case "elevator":
      flat(
        reels.every(isDigit) &&
          (reels.every((n, i) => i === 0 || n > reels[i - 1]) ||
            reels.every((n, i) => i === 0 || n < reels[i - 1])),
        100,
      );
      break;
    case "moai": {
      const favorite = item.metadata.favorite;
      for (const i of all.filter((index) => reels[index] === favorite))
        for (let hit = 0; hit < (favorite === 8 ? eight : 1); hit++)
          steps.push({ reels: [i], points: 0 });
      multiplier = 2 ** steps.length;
      steps.forEach((step, index) => {
        step.note = `Favorite ${favorite}: ×2 (${index + 1}/${steps.length})`;
      });
      if (steps.length)
        note = `Favorite ${favorite}: ${steps.length} ${steps.length === 1 ? "match" : "matches"}`;
      break;
    }
    case "relaxedface":
      add([], 24, false);
      break;
    case "blackjack":
      if (sum === 21) multiplier = 3;
      break;
    case "fullhouse":
      if (
        counts.some(
          (n, i) => n >= 3 && counts.some((m, j) => j !== i && m >= 2),
        )
      )
        multiplier = 2;
      break;
    case "dragon":
      add([], 4 * (state?.trinkets.length ?? 1), false);
      break;
    case "pairofeyes":
      if (
        all.some(
          (i) => reels[i] === 0 && all.some((j) => j > i + 1 && reels[j] === 0),
        )
      )
        flat(true, 21 * Math.max(0, ...digits));
      break;
    // These are dispatched by engine lifecycle hooks, not numeric scoring.
    case "mining":
    case "magnifier":
    case "eightball":
    case "realknife":
    case "cross":
    case "graduate":
    case "crystalball":
    case "snail":
    case "wrench":
    case "screwdriver":
    case "constructionworker":
    case "technologist":
    case "cartwheel":
    case "package":
    case "bank":
    case "wheel":
      break;
    default:
      throw new Error(`Missing trinket effect: ${id}`);
  }
  if (item.metadata.power != null) note = `Power: ${item.metadata.power}`;
  if (cash) note += `${note ? ": " : ""}+$${cash}`;
  if (multiplier > 1) note += `${note ? ": " : ""}×${multiplier} round score`;
  return {
    id,
    points: steps.reduce((sum, s) => sum + s.points, 0),
    note,
    steps,
    cash,
    multiplier,
  };
}
