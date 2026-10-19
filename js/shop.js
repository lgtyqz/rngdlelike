import { RARITIES } from "./items.js";

/**
 * Ranks a fixed catalog with weighted random priorities, then selects an eligible item.
 * Every catalog entry consumes a draw, even when unavailable, keeping the saved
 * RNG cursor independent of ownership and item preferences.
 */
export function chooseShopItem(catalog, pool, rng, weightFor = () => 1) {
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

/**
 * Rolls rarity using the configured weights, then an eligible item of that rarity.
 * Missing rarity pools redistribute their chance among the available rarities.
 * Rare/Legendary boosts affect only the rarity roll; preferences affect only
 * the item roll. Owned tool objects use their catalog definition's rarity.
 */
export function chooseShopOffer(catalog, pool, rng, boost = 1, weightFor) {
  const definitions = new Map(catalog.map((def) => [def.id, def]));
  const available = new Set(pool.map((item) => definitions.get(item.id)?.rarity));
  const rarities = Object.entries(RARITIES)
    .filter(([rarity, { weight }]) => weight > 0 && available.has(rarity))
    .map(([rarity, { weight }]) => [
      rarity,
      weight * (["rare", "legendary"].includes(rarity) ? boost : 1),
    ]);
  let roll = rng() * rarities.reduce((sum, [, weight]) => sum + weight, 0);
  const rarity =
    rarities.find(([, weight]) => (roll -= weight) < 0)?.[0] ??
    rarities.at(-1)?.[0];
  return chooseShopItem(
    catalog,
    pool.filter((item) => definitions.get(item.id)?.rarity === rarity),
    rng,
    weightFor,
  );
}
