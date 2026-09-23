import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("confetti uses local OpenMoji SVG assets", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  const paths = [...app.matchAll(/"(openmoji-svg-color\/[A-Z0-9-]+\.svg)"/g)]
    .map((match) => match[1]);
  assert.ok(paths.length > 0);
  await Promise.all(
    paths.map(async (path) => {
      const svg = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
      assert.match(svg, /<svg\b/);
    }),
  );
});
