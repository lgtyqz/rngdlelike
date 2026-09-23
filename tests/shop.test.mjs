import test from "node:test";
import assert from "node:assert/strict";
import { buy, createRun, generateOffers } from "../js/engine.js";
import { ITEMS, RARITIES, itemPrice, ownItem } from "../js/items.js";

test("item prices support custom values with rarity fallbacks", () => {
  assert.equal(itemPrice({ rarity: "rare", price: 17 }), 17);
  assert.equal(itemPrice({ rarity: "rare" }), RARITIES.rare.price);

  for (let seed = 0; seed < 100; seed++) {
    const offers = generateOffers(createRun(seed));
    for (const offer of offers.filter((entry) => !entry.empty)) {
      const definition = ITEMS[offer.id];
      if (offer.kind === "upgrade") {
        assert.equal(offer.price, Math.ceil(itemPrice(definition) * 0.5));
      } else {
        assert.equal(offer.price, itemPrice(definition));
      }
    }
  }
});

test("upgrades always add one use", () => {
  const run = createRun(1);
  const tool = run.tools[0];
  run.phase = "shop";
  run.bank = 100;
  run.offers = [{
    id: tool.id,
    kind: "upgrade",
    rarity: ITEMS[tool.id].rarity,
    amount: 8,
    price: 10,
    sold: false,
  }];
  const before = tool.maxUses;
  assert.equal(buy(run, 0), true);
  assert.equal(tool.maxUses, before + 1);
  assert.equal(tool.uses, before + 1);
});

test("upgrade targets are weighted by the owned tools' rarities", () => {
  const counts = { reroll: 0, increment: 0, "nine-tool": 0 };
  for (let seed = 0; seed < 2000; seed++) {
    const run = createRun(seed);
    run.tools = [
      ownItem("reroll"),
      ownItem("increment"),
      ownItem("nine-tool"),
    ];
    counts[generateOffers(run)[2].id]++;
  }
  const common = counts.reroll + counts.increment;
  assert.ok(common > counts["nine-tool"] * 25, JSON.stringify(counts));
  assert.ok(counts["nine-tool"] > 0, JSON.stringify(counts));
});
