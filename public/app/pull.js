import { el, loadingIndicator } from "./dom.js";

const THRESHOLD = 80;
const DRAG = 0.5;
const SIZE = 48;

let key = null;
let handler = null;
let start = null;
let fraction = 0;
let busy = false;
let run = 0;
let spinner = null;

const pulled = loadingIndicator({ contained: true, progress: 0 });
const box = el("div", { class: "pull", ariaHidden: "true" }, pulled);
document.getElementById("app").append(box);

function offsetFor(value) {
  const over = Math.min(2, Math.max(0, value - 1));
  return THRESHOLD * Math.min(1, value) + THRESHOLD * (over - (over * over) / 4);
}

function place(distance, animate) {
  box.classList.toggle("settling", animate);
  box.style.transform = `translateY(${distance - SIZE}px)`;
}

function show(distance) {
  place(distance, false);
  pulled.progress(distance / THRESHOLD);
  pulled.style.rotate = `${-Math.max(0, distance / THRESHOLD - 1) * 180}deg`;
}

function idle() {
  box.classList.remove("refreshing");
  setTimeout(() => {
    if (busy || !spinner) return;
    spinner.remove();
    spinner = null;
  }, 500);
}

function reset() {
  start = null;
  fraction = 0;
}

function finish(mine) {
  if (mine !== run) return;
  busy = false;
  place(0, true);
  idle();
}

function refresh() {
  busy = true;
  const mine = ++run;
  place(THRESHOLD, true);
  if (!spinner) {
    spinner = loadingIndicator({ contained: true });
    box.append(spinner);
  }
  box.classList.add("refreshing");
  Promise.resolve()
    .then(() => handler?.())
    .catch(() => {})
    .finally(() => finish(mine));
}

addEventListener(
  "touchstart",
  (event) => {
    if (!key || busy || scrollY > 0 || event.touches.length !== 1 || document.querySelector("dialog[open]")) return reset();
    start = { x: event.touches[0].clientX, y: event.touches[0].clientY, vertical: null };
  },
  { passive: true }
);

addEventListener(
  "touchmove",
  (event) => {
    if (!start) return;
    const dx = event.touches[0].clientX - start.x;
    const dy = event.touches[0].clientY - start.y;
    if (start.vertical === null) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) <= 6) return;
      start.vertical = Math.abs(dy) > Math.abs(dx) && dy > 0;
    }
    if (!start.vertical || scrollY > 0) {
      if (fraction) place(0, true);
      return reset();
    }
    fraction = Math.max(0, dy * DRAG) / THRESHOLD;
    show(offsetFor(fraction));
  },
  { passive: true }
);

function release() {
  if (!start) return;
  const ready = fraction >= 1;
  reset();
  if (ready) refresh();
  else place(0, true);
}

addEventListener("touchend", release, { passive: true });
addEventListener("touchcancel", release, { passive: true });

export function refreshNow() {
  if (!key || busy) return;
  refresh();
}

export function setPull(next, refreshFeed) {
  if (next !== key) {
    run += 1;
    busy = false;
    reset();
    place(0, false);
    idle();
  }
  key = next;
  handler = next ? refreshFeed : null;
}
