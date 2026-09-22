/** Integer interpolation that approaches its exact destination with decreasing speed. */
export function countValue(from, to, progress) {
  const t = Math.max(0, Math.min(1, progress));
  return t === 1 ? to : from + Math.trunc((to - from) * (1 - (1 - t) ** 3));
}

/** Animate one count; fast/reduced-motion preferences are checked every frame. */
export function animateCount({
  from,
  to,
  update,
  duration = 480,
  instant = () => false,
}) {
  return new Promise((resolve) => {
    const start = performance.now();
    function frame(now) {
      const progress = instant() ? 1 : Math.min(1, (now - start) / duration);
      update(countValue(from, to, progress));
      if (progress === 1) resolve();
      else requestAnimationFrame(frame);
    }
    frame(start);
  });
}
