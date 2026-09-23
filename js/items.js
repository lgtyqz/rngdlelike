export const RARITIES = {
  common: { label: "Common", weight: 60, price: 12 },
  uncommon: { label: "Uncommon", weight: 27, price: 25 },
  rare: { label: "Rare", weight: 10, price: 50 },
  legendary: { label: "Legendary", weight: 3, price: 100 },
};
// Definitions are immutable templates. Each owned trinket receives independent metadata.
/** Creates an immutable trinket definition for the item catalog. */
const trinket = (
  id,
  name,
  emoji,
  rarity,
  effect,
  description,
  metadata = {},
  price,
) => ({
  id,
  name,
  emoji,
  rarity,
  effect,
  description,
  metadata,
  ...(price == null ? {} : { price }),
  kind: "trinket",
});

/** Creates an immutable tool definition for the item catalog. */
const tool = (
  id,
  name,
  emoji,
  rarity,
  effect,
  description,
  maxUses = 1,
  price,
) => ({
  id,
  name,
  emoji,
  rarity,
  effect,
  description,
  maxUses,
  ...(price == null ? {} : { price }),
  kind: "tool",
});
export const TRINKETS = [
  trinket(
    "even",
    "Even Steven",
    "⚖️",
    "common",
    "even",
    "Score 4 points for each even digit.",
  ),
  trinket(
    "bean",
    "Bean Counter",
    "🫘",
    "common",
    "bean",
    "Each 1 scores this trinket's current power, then permanently adds 10 power.",
    { power: 10 },
  ),
  trinket(
    "odd",
    "Odd Duck",
    "🦆",
    "common",
    "odd",
    "Score 4 points for each odd digit.",
  ),
  trinket(
    "zero",
    "Zero Hero",
    "🍩",
    "common",
    "zero",
    "Score 12 points for each 0.",
  ),
  trinket(
    "pair",
    "Perfect Pair",
    "🍒",
    "common",
    "pair",
    "Score 8 points for every pair of matching digits.",
  ),
  trinket(
    "high",
    "High Five",
    "🖐️",
    "common",
    "high",
    "Score 5 points for each digit that is 5 or higher.",
  ),
  trinket(
    "low",
    "Small Fry",
    "🍟",
    "common",
    "low",
    "Score 6 points for each digit below 4.",
  ),
  trinket(
    "sum",
    "Pocket Change",
    "🪙",
    "common",
    "sum",
    "Score the sum of all six digits.",
  ),
  trinket(
    "sandwich",
    "Sandwich",
    "🥪",
    "uncommon",
    "sandwich",
    "Score 35 points for each three-digit sandwich: matching outer digits.",
  ),
  trinket(
    "seven",
    "Lucky Seven",
    "🍀",
    "uncommon",
    "seven",
    "Score 25 points for every 7.",
  ),
  trinket(
    "stairs",
    "Stepping Stones",
    "🪜",
    "uncommon",
    "stairs",
    "Score 18 points for adjacent digits that rise by exactly 1.",
  ),
  trinket(
    "garden",
    "Little Garden",
    "🌱",
    "uncommon",
    "garden",
    "Score your power each spin, then grow by 4 permanently.",
    { power: 8 },
  ),
  trinket(
    "book",
    "Bookends",
    "📚",
    "uncommon",
    "book",
    "Score 60 points if the first and last digits match.",
  ),
  trinket(
    "rainbow",
    "Rainbow",
    "🌈",
    "uncommon",
    "rainbow",
    "Score 9 points for each different digit.",
  ),
  trinket(
    "triple",
    "Three’s Company",
    "🎳",
    "rare",
    "triple",
    "Score 100 points for every group of three matching digits.",
  ),
  trinket(
    "mirror",
    "Mirror Mirror",
    "🪞",
    "rare",
    "mirror",
    "Score 40 points for each matching pair mirrored across the center.",
  ),
  trinket(
    "rocket",
    "Rocket Fuel",
    "🚀",
    "rare",
    "rocket",
    "Each 9 scores your power, then permanently adds 10 power.",
    { power: 30 },
  ),
  trinket(
    "diamond",
    "Diamond Cut",
    "💎",
    "rare",
    "diamond",
    "Score 120 points when all six digits are different.",
  ),
  trinket(
    "magnet",
    "Prime Magnet",
    "🧲",
    "rare",
    "prime",
    "Score 20 points for each prime digit: 2, 3, 5, or 7.",
  ),
  trinket(
    "crown",
    "Royal Flush",
    "👑",
    "legendary",
    "crown",
    "Score 80 points for every matching pair of digits.",
  ),
  trinket(
    "dragon",
    "Hoarding Dragon",
    "🐉",
    "legendary",
    "dragon",
    "Score your power every spin. Its power doubles each time.",
    { power: 50 },
  ),
  trinket(
    "star",
    "Shooting Star",
    "🌠",
    "legendary",
    "star",
    "Score 15 times the sum of all digits.",
  ),
  trinket(
    "unicorn",
    "Unicorn",
    "🦄",
    "legendary",
    "unicorn",
    "Score 500 points if your spin contains both a 0 and a 9.",
  ),
  trinket(
    "galaxy",
    "Galaxy Brain",
    "🌌",
    "legendary",
    "galaxy",
    "Score 70 points for each different digit.",
  ),
];
export const TOOLS = [
  tool(
    "reroll",
    "Reroll One",
    "🔄",
    "common",
    "reroll",
    "Select a reel to roll a new random digit.",
    3,
  ),
  tool(
    "increment",
    "Increment",
    "➕",
    "common",
    "increment",
    "Add 1 to a reel. A 9 wraps around to 0.",
  ),
  tool(
    "decrement",
    "Decrement",
    "➖",
    "common",
    "decrement",
    "Subtract 1 from a reel. A 0 wraps around to 9.",
  ),
  tool(
    "flip",
    "Flip It",
    "🙃",
    "uncommon",
    "flip",
    "Replace a digit with 9 minus that digit.",
    2,
  ),
  tool(
    "swap",
    "Switcheroo",
    "🔀",
    "uncommon",
    "swap",
    "Select two different reels to swap their digits.",
    2,
  ),
  tool(
    "double",
    "Double Up",
    "✌️",
    "uncommon",
    "double",
    "Double a digit, keeping only the last digit.",
    2,
  ),
  tool(
    "copy",
    "Copycat",
    "🐈",
    "rare",
    "copy",
    "Select a source reel, then a different reel to copy its digit onto.",
    2,
  ),
  tool("zero-tool", "Reset", "🧽", "rare", "zero", "Set any reel to 0.", 3),
  tool(
    "seven-tool",
    "Lucky Charm",
    "🎰",
    "rare",
    "seven",
    "Set any reel to 7.",
    3,
  ),
  tool(
    "nine-tool",
    "Cloud Nine",
    "☁️",
    "legendary",
    "nine",
    "Set any reel to 9.",
    4,
  ),
  tool(
    "one-tool",
    "Magic Bean",
    "🪄",
    "legendary",
    "one",
    "Set any reel to 1.",
    4,
  ),
  tool(
    "neighbor",
    "Echo Chamber",
    "📣",
    "legendary",
    "neighbor",
    "Copy a reel's digit to both its neighbors (wrapping at the edges).",
    3,
  ),
];
export const ITEMS = Object.fromEntries(
  [...TRINKETS, ...TOOLS].map((item) => [item.id, item]),
);

/** Returns an item's custom price, falling back to its rarity's base price. */
export function itemPrice(item) {
  return item.price ?? RARITIES[item.rarity].price;
}

/**
 * Creates an independently mutable owned instance from an item definition.
 * @param {string} id Catalog item identifier.
 * @returns {object} Owned trinket metadata or tool-use state.
 */
export function ownItem(id) {
  const def = ITEMS[id];
  return def.kind === "trinket"
    ? { id, metadata: { ...def.metadata } }
    : { id, maxUses: def.maxUses, uses: def.maxUses };
}

/**
 * Builds the current player-facing description of an owned item.
 * @param {object} owned Owned trinket or tool instance.
 * @returns {string} Description including current power or uses per spin.
 */
export function itemDescription(owned) {
  const def = ITEMS[owned.id];
  return (
    def.description +
    (owned.metadata?.power != null
      ? ` Current power: ${owned.metadata.power}.`
      : "") +
    (def.kind === "tool"
      ? ` ${owned.maxUses ?? def.maxUses} uses per spin.`
      : "")
  );
}

/**
 * Resolves an item's local PNG or OpenMoji SVG asset path.
 * @param {string} id Catalog item identifier.
 * @returns {string} Browser-relative icon path.
 */
export function iconPath(id) {
  if (id === "reroll") return "assets/reroll.png";
  if (id === "even") return "assets/even.png";
  const code = [...ITEMS[id].emoji]
    .filter((c) => c.codePointAt(0) !== 0xfe0f)
    .map((c) => c.codePointAt(0).toString(16).toUpperCase())
    .join("-");
  return `openmoji-svg-color/${code}.svg`;
}
