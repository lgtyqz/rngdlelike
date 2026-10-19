/** Scores use native arbitrary-size integers; multipliers stay exact fractions. */
export function asScore(value = 0) {
  return typeof value === "bigint" ? value : BigInt(Math.round(value));
}

export function ratio(value = 1, denominator = 1n) {
  if (value && typeof value === "object" && "n" in value)
    return ratio(value.n, value.d);
  if (typeof value === "number" || typeof value === "string") {
    const match = String(value).match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
    if (!match) throw new RangeError("Invalid score multiplier");
    const scale = (match[3]?.length ?? 0) - Number(match[4] ?? 0);
    value = BigInt(`${match[1]}${match[2]}${match[3] ?? ""}`);
    if (scale > 0) denominator = BigInt(denominator) * 10n ** BigInt(scale);
    else value *= 10n ** BigInt(-scale);
  }
  let n = BigInt(value), d = BigInt(denominator);
  if (d <= 0n) throw new RangeError("Invalid score denominator");
  let a = n < 0n ? -n : n, b = d;
  while (b) [a, b] = [b, a % b];
  return { n: n / a, d: d / a };
}

export function addRatio(a, b) {
  a = ratio(a); b = ratio(b);
  return ratio(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function multiplyRatio(a, b) {
  a = ratio(a); b = ratio(b);
  return ratio(a.n * b.n, a.d * b.d);
}

export function powerRatio(value, exponent) {
  const { n, d } = ratio(value);
  return ratio(n ** BigInt(exponent), d ** BigInt(exponent));
}

export function roundRatio(value) {
  const { n, d } = ratio(value);
  // Match Math.round, including negative halfway values.
  if (n < 0n) return -((-2n * n + d - 1n) / (2n * d));
  return (2n * n + d) / (2n * d);
}

export function compareRatio(a, b) {
  a = ratio(a); b = ratio(b);
  const delta = a.n * b.d - b.n * a.d;
  return delta > 0n ? 1 : delta < 0n ? -1 : 0;
}

export const hasMultiplier = (value = 1) => compareRatio(value, 1) > 0;

/** Compact scientific notation without converting a large score to Number. */
export function formatNumber(value) {
  if (typeof value !== "bigint")
    return value >= 1e9
      ? value.toExponential(3).replace("e+", "e")
      : value.toLocaleString("en-US");
  const sign = value < 0n ? "-" : "";
  const digits = (value < 0n ? -value : value).toString();
  if (digits.length <= 9) return value.toLocaleString("en-US");
  let exponent = digits.length - 1;
  let leading = BigInt(digits.slice(0, 4));
  if (Number(digits[4] ?? 0) >= 5) leading++;
  if (leading === 10000n) { leading = 1000n; exponent++; }
  const text = leading.toString();
  return `${sign}${text[0]}.${text.slice(1)}e${exponent}`;
}

export function formatRatio(value) {
  const { n, d } = ratio(value);
  if (d === 1n || n / d >= 1000000000n) return formatNumber(roundRatio({ n, d }));
  const scale = 10000000000n;
  const digits = roundRatio(ratio(n * scale, d)).toString().padStart(11, "0");
  return `${digits.slice(0, -10)}.${digits.slice(-10)}`.replace(/\.?0+$/, "");
}

/** Tagged integers keep JSON saves lossless without changing seeds or cash. */
export const scoreReplacer = (_key, value) =>
  typeof value === "bigint" ? { $bigint: value.toString() } : value;
export const scoreReviver = (_key, value) =>
  value && typeof value === "object" && Object.keys(value).length === 1 &&
  typeof value.$bigint === "string" && /^-?\d+$/.test(value.$bigint)
    ? BigInt(value.$bigint) : value;

/** Upgrade existing numeric saves and normalize externally-created run fixtures. */
export function normalizeScores(state) {
  for (const key of ["points", "total"]) state[key] = asScore(state[key]);
  for (const item of state.trinkets ?? [])
    if (item.metadata?.power != null) item.metadata.power = asScore(item.metadata.power);
  for (const entry of state.history ?? [])
    for (const key of ["points", "triggerPoints"])
      if (entry[key] != null) entry[key] = asScore(entry[key]);
  for (const event of [...(state.events ?? []), ...(state.pendingEvents ?? [])]) {
    for (const key of ["points", "previewPoints", "multiplierPoints", "totalPoints"])
      if (event[key] != null) event[key] = asScore(event[key]);
    event.multiplier = ratio(event.multiplier ?? 1);
    event.rewardBonus ??= Math.round(((event.rewardFactor ?? 1) - 1) * 100);
    delete event.rewardFactor;
    for (const step of event.steps ?? []) step.points = asScore(step.points);
  }
}
