import { writeFile } from 'node:fs/promises';
import { hash } from '../js/random.js';
const seeds = {};
for (let day = Date.UTC(2026, 0, 1); day < Date.UTC(2037, 0, 1); day += 86400000) {
  const date = new Date(day).toISOString().slice(0, 10);
  seeds[date] = hash(`rngdlelike:daily:v1:${date}`);
}
await writeFile(new URL('../data/daily-seeds.json', import.meta.url), JSON.stringify(seeds, null, 2) + '\n');
console.log(`Wrote ${Object.keys(seeds).length} daily seeds.`);
