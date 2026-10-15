import { svg } from "./dom.js";

const ZONE = 60;
const RADIUS = 15;
const RAYS = 8;
const START = 40;
const SPAN = 110;
const STEP_MS = 125;
const TURN_MS = 1000;
const HOLD_MS = 800;

const view = document.getElementById("view");
const clamp = (value) => Math.min(1, Math.max(0, value));

let key = null;
let handler = null;
let touching = false;
let forming = false;
let running = false;
let held = false;
let releasing = false;
let started = 0;
let run = 0;
let drops = 0;
let frame = 0;
let timer = 0;
let indicator = null;
let rays = [];

function build() {
  if (indicator) return indicator;
  const width = 0.23 * RADIUS;
  const inner = 0.36 * RADIUS + width / 2;
  const outer = RADIUS - width / 2;
  rays = Array.from({ length: RAYS }, (_, index) => {
    const angle = (index * (360 / RAYS) - 90) * (Math.PI / 180);
    return svg("line", {
      x1: (Math.cos(angle) * inner).toFixed(3),
      y1: (Math.sin(angle) * inner).toFixed(3),
      x2: (Math.cos(angle) * outer).toFixed(3),
      y2: (Math.sin(angle) * outer).toFixed(3),
      "stroke-width": width.toFixed(3)
    });
  });
  indicator = svg("svg", { class: "pull", viewBox: `${-RADIUS} ${-RADIUS} ${2 * RADIUS} ${2 * RADIUS}` }, rays);
  document.body.append(indicator);
  return indicator;
}

function show(opacity, degrees, lift) {
  const node = build();
  rays.forEach((ray, index) => ray.setAttribute("opacity", opacity(index).toFixed(3)));
  node.style.transform = `translateY(${-lift}px) rotate(${degrees}deg)`;
  node.classList.add("shown");
}

function hide() {
  indicator?.classList.remove("shown");
}

function stopLoop() {
  cancelAnimationFrame(frame);
  clearTimeout(timer);
  frame = 0;
  timer = 0;
}

function paintForming(distance) {
  const progress = clamp((distance - START) / SPAN);
  if (progress <= 0) {
    hide();
    return progress;
  }
  const lead = 1 - (1 - progress) ** 2;
  const step = 0.25 * Math.min(1, 2 * (1 - progress));
  show((index) => clamp(lead - index * step), 0, 0);
  return progress;
}

function paintSpin() {
  const lift = Math.max(0, scrollY);
  if (lift >= ZONE) {
    hide();
    return false;
  }
  const elapsed = performance.now() - started;
  const turn = Math.min(1, elapsed / TURN_MS);
  const settle = turn * (2 - turn);
  const head = Math.floor(elapsed / STEP_MS);
  show((index) => 1 - ((((head - index) % RAYS) + RAYS) % RAYS) * 0.135 * settle, 180 * settle, lift);
  return true;
}

function loop() {
  frame = 0;
  timer = 0;
  if (!running || !paintSpin()) return;
  const elapsed = performance.now() - started;
  if (elapsed < TURN_MS) frame = requestAnimationFrame(loop);
  else timer = setTimeout(loop, STEP_MS - (elapsed % STEP_MS));
}

function clear() {
  held = false;
  releasing = false;
  view.style.transition = "";
  view.style.transform = "";
}

function hold() {
  drops += 1;
  held = true;
  view.style.transition = "none";
  view.style.transform = "translateY(0px)";
  view.getBoundingClientRect();
  view.style.transition = `transform ${HOLD_MS}ms var(--ease-sheet)`;
  view.style.transform = `translateY(${ZONE}px)`;
}

function drop(duration) {
  const mine = ++drops;
  if (scrollY >= ZONE) {
    clear();
    scrollTo({ top: scrollY - ZONE, behavior: "instant" });
    return;
  }
  releasing = false;
  view.style.transition = `transform ${duration} var(--ease-sheet)`;
  view.style.transform = "translateY(0px)";
  const wait = parseFloat(getComputedStyle(view).transitionDuration) * 1000 || 0;
  setTimeout(() => {
    if (mine === drops) clear();
  }, wait + 50);
}

function finish() {
  running = false;
  stopLoop();
  hide();
  if (!held) return;
  if (touching) releasing = true;
  else drop("var(--speed-spring)");
}

function begin() {
  running = true;
  forming = false;
  started = performance.now();
  const mine = ++run;
  loop();
  Promise.resolve()
    .then(() => handler?.())
    .catch(() => {})
    .finally(() => {
      if (mine === run) finish();
    });
}

function cancel() {
  run += 1;
  running = false;
  forming = false;
  stopLoop();
  hide();
  if (held) {
    drops += 1;
    clear();
  }
}

function lift() {
  touching = false;
  if (running && !held) hold();
  else if (releasing) drop(`${HOLD_MS}ms`);
}

addEventListener(
  "touchstart",
  () => {
    touching = true;
  },
  { passive: true }
);
addEventListener("touchend", lift, { passive: true });
addEventListener("touchcancel", lift, { passive: true });

addEventListener(
  "scroll",
  () => {
    if (!key) return;
    if (running) {
      if (!paintSpin()) stopLoop();
      else if (!frame && !timer) loop();
      return;
    }
    const distance = Math.max(0, -scrollY);
    if (touching && distance > 0) forming = true;
    if (!forming) return;
    if (distance === 0 && !touching) {
      forming = false;
      hide();
      return;
    }
    if (paintForming(distance) >= 1 && touching) begin();
  },
  { passive: true }
);

export function setPull(next, refresh) {
  if (next !== key) cancel();
  key = next;
  handler = next ? refresh : null;
}
