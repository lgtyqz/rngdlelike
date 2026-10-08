import { ITEMS } from "./items.js";

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
  const resolve = (item, owner, path = new Set()) => {
    if (path.has(item)) return [];
    const next = new Set([...path, item]);
    if (item.id === "parrot")
      return inventory
        .filter((t) => ["common", "uncommon"].includes(ITEMS[t.id].rarity))
        .flatMap((t) => resolve(t, owner, next));
    if (item.id === "fax") {
      const index = stacks.findIndex((stack) => stack.id === item.id);
      const right = stacks[index + 1];
      return right ? resolve(right, owner, next) : [];
    }
    return [{ id: item.id, metadata: item.metadata, owner }];
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
