/**
 * Scrolls one inventory row, completing only when its target is reached.
 * The returned cleanup detaches the old row before a render replaces it.
 */
export function revealInventoryItem(
  bin,
  item,
  { instant = false, onComplete } = {},
) {
  if (!bin || !item) return () => {};

  const row = bin.getBoundingClientRect();
  const target = item.getBoundingClientRect();
  const left = Math.max(
    0,
    Math.min(
      bin.scrollWidth - bin.clientWidth,
      bin.scrollLeft +
        target.left +
        target.width / 2 -
        (row.left + bin.clientLeft + bin.clientWidth / 2),
    ),
  );
  let active = true;
  /** Removes listeners belonging to this specific inventory DOM. */
  function cleanup() {
    active = false;
    bin.removeEventListener("scroll", check);
  }
  /** Keeps the reveal pending while a smooth scroll is still in progress. */
  function check() {
    if (!active || Math.abs(bin.scrollLeft - left) > 1) return;
    cleanup();
    onComplete?.();
  }
  bin.addEventListener("scroll", check);
  bin.scrollTo({ left, behavior: instant ? "instant" : "smooth" });
  // Measure before adding the scale animation so it cannot shift the destination.
  item.classList.add("new-item");
  check();
  return cleanup;
}
