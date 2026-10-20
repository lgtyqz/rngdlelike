import { ITEMS } from "./items.js";

/** Passive modifiers cannot be activated directly with Camera. */
export const PASSIVE_TRINKETS = new Set([
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
  "scientist",
  "confettihorn",
  "partyface",
  "fallingleaves",
  "ferriswheel",
  "octopus",
  "crystalball",
  "realknife",
]);
const SHOP_ONLY_TRINKETS = new Set([
  "bank",
  "test-tube",
  "alembic",
  "upgradeexp",
  "toolexp",
]);

/** Copiers qualify for Silent only if they have a non-passive ability to trigger. */
export function silentEligibleUids(state) {
  const effects = trinketEffects(state);
  const eligibleAbility = (id) =>
    !PASSIVE_TRINKETS.has(id) && !SHOP_ONLY_TRINKETS.has(id);
  return new Set(
    state.trinkets
      .filter((item) => {
        const abilities = effects.filter((effect) => effect.owner === item);
        return abilities.length
          ? abilities.some(({ id }) => eligibleAbility(id))
          : eligibleAbility(item.id);
      })
      .map((item) => item.uid),
  );
}

/** Returns one representative per stack in the order shown in the inventory. */
export function trinketStacks(state) {
  const seen = new Set();
  return (state?.trinkets ?? []).filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/** Resolves copied abilities, with Fax targeting the next visible stack. */
export function trinketEffects(state) {
  const inventory = state?.trinkets ?? [];
  const stacks = trinketStacks(state);
  const resolve = (item, owner, path = new Set(), pointsOnly = false) => {
    if (path.has(item)) return [];
    const next = new Set([...path, item]);
    if (item.id === "parrot")
      return inventory
        .filter((t) => ["common", "uncommon"].includes(ITEMS[t.id].rarity))
        .flatMap((t) => resolve(t, owner, next, true));
    if (item.id === "fax") {
      const index = stacks.findIndex((stack) => stack.id === item.id);
      const right = stacks[index + 1];
      return right ? resolve(right, owner, next, pointsOnly) : [];
    }
    // Eligibility comes from the catalog after resolving any copy chain.
    if (pointsOnly && !ITEMS[item.id].pointScoring) return [];
    return [
      {
        id: item.id,
        metadata: item.metadata,
        owner,
        ...(pointsOnly ? { pointsOnly: true } : {}),
      },
    ];
  };
  return inventory.flatMap((item) => resolve(item, item));
}

/** Records an activation on the physical trinket that supplied an ability. */
export function markActivated(state, item) {
  if (!state) return;
  const owner = item.owner ?? item;
  if (owner.uid == null) return;
  const active = (state.activatedTrinkets ??= []);
  if (!active.includes(owner.uid)) active.push(owner.uid);
}

/** Groups inactive scoring participants without counting rewards gained during scoring. */
export function inactiveTrinketStacks(state) {
  const participants = state.silentContext?.participants ?? state.trinkets;
  const silentUids = new Set(
    state.silentContext?.silentUids ??
      trinketEffects(state)
        .filter((t) => t.id === "silent")
        .map((t) => t.owner.uid),
  );
  const active = new Set(state.activatedTrinkets ?? []);
  const eligible =
    state.silentContext?.eligibleUids ?? silentEligibleUids(state);
  const stacks = new Map();
  for (const item of participants) {
    if (
      !eligible.has(item.uid) ||
      silentUids.has(item.uid) ||
      active.has(item.uid)
    )
      continue;
    const stack = stacks.get(item.id) ?? { id: item.id, count: 0 };
    stack.count++;
    stacks.set(item.id, stack);
  }
  return [...stacks.values()];
}
