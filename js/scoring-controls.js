/** Hold the scoring log to skip; scrolling, cancellation, and release stop the timer. */
export function installLongPress(root, onHold, { delay = 450 } = {}) {
  let timer, pointer, origin, heldKey, suppressClick = false;
  const target = (event) => event.target.closest?.('[data-action="speed"]');
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    pointer = null;
    heldKey = null;
  };
  const start = () => {
    timer = setTimeout(() => {
      timer = null;
      suppressClick = true;
      onHold();
    }, delay);
  };
  const down = (event) => {
    suppressClick = false;
    if (!target(event) || event.button !== 0 || event.isPrimary === false) return;
    cancel();
    pointer = event.pointerId;
    origin = { x: event.clientX, y: event.clientY };
    start();
  };
  const move = (event) => {
    if (event.pointerId === pointer &&
        Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 12)
      cancel();
  };
  const release = (event) => {
    if (event.pointerId === pointer) cancel();
  };
  const keydown = (event) => {
    if (!target(event) || ![" ", "Enter"].includes(event.key) || event.repeat) return;
    cancel();
    suppressClick = false;
    heldKey = event.key;
    start();
  };
  const keyup = (event) => { if (event.key === heldKey) cancel(); };
  const click = (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const contextmenu = (event) => { if (target(event)) event.preventDefault(); };
  const listeners = { pointerdown: down, pointermove: move, pointerup: release,
    pointercancel: release, keydown, keyup, click, contextmenu };
  for (const [name, listener] of Object.entries(listeners))
    root.addEventListener(name, listener, true);
  root.defaultView?.addEventListener("blur", cancel);
  return () => {
    cancel();
    for (const [name, listener] of Object.entries(listeners))
      root.removeEventListener(name, listener, true);
    root.defaultView?.removeEventListener("blur", cancel);
  };
}
