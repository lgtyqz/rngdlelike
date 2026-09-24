/**
 * Hashes text into an unsigned 32-bit seed using FNV-1a.
 * @param {unknown} text Value to hash as text.
 * @returns {number} Unsigned 32-bit hash.
 */
export function hash(text) {
  let h = 2166136261;
  for (const char of String(text))
    h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Parses a player-entered seed without silently wrapping out-of-range values. */
export function parseSeed(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  const seed = Number(value.trim());
  return Number.isInteger(seed) && seed <= 0xffffffff ? seed : null;
}

/**
 * Creates a deterministic pseudorandom-number generator from a seed.
 * @param {number} seed Initial unsigned seed.
 * @returns {() => number} Generator producing values from 0 (inclusive) to 1 (exclusive).
 */
export function random(seed) {
  let state = seed >>> 0;
  return () => {
    let t = (state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns a date as an ISO calendar day in UTC. */
export const utcDate = (date = new Date()) => date.toISOString().slice(0, 10);

/** Returns the published seed for a UTC date, or its deterministic fallback. */
export const dailySeed = (date, calendar) =>
  calendar[date] ?? hash(`rngdlelike:daily:v1:${date}`);

/** Finds the published UTC day associated with a seed, if any. */
export const dailyDateForSeed = (seed, calendar) =>
  Object.keys(calendar).sort().find((date) => calendar[date] === seed) ?? null;
