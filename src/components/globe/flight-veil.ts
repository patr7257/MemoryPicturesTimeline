// The white-out that carries a flight over the navigation. The timeline page
// (and the flight overlay with it) unmounts when the vacation page takes over,
// so the veil is a plain DOM node on <body>, outside React: it appears while
// the overlay is fully white, holds until the target page is really there, then
// fades away. A hard timeout makes sure it can never stay stuck.

const FADE_MS = 480;
const SETTLE_MS = 160;
const HARD_TIMEOUT_MS = 6000;

let active: HTMLElement | null = null;

export function raiseVeil(targetPathname: string): void {
  if (typeof document === "undefined") return;
  active?.remove();
  const veil = document.createElement("div");
  veil.setAttribute("aria-hidden", "true");
  veil.style.cssText =
    "position:fixed;inset:0;z-index:2147483000;background:#fff;opacity:1;" +
    `transition:opacity ${FADE_MS}ms ease;pointer-events:auto;`;
  document.body.appendChild(veil);
  active = veil;

  const started = performance.now();
  let arrivedAt = 0;
  let done = false;

  const finish = () => {
    if (done) return;
    done = true;
    veil.style.opacity = "0";
    veil.style.pointerEvents = "none";
    window.setTimeout(() => {
      veil.remove();
      if (active === veil) active = null;
    }, FADE_MS + 60);
  };

  const tick = (now: number) => {
    if (done) return;
    if (now - started > HARD_TIMEOUT_MS) return finish();
    if (window.location.pathname === targetPathname) {
      if (!arrivedAt) arrivedAt = now;
      if (now - arrivedAt >= SETTLE_MS) return finish();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // rAF stops in a hidden tab: the timer still has to clear the veil.
  window.setTimeout(finish, HARD_TIMEOUT_MS + 500);
}
