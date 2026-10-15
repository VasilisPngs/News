const THRESHOLD = 72;

let handler = null;
let armed = false;
let busy = false;
let indicator = null;

function mark() {
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.className = "pull";
    document.body.append(indicator);
  }
  return indicator;
}

function track() {
  if (!handler || busy) return;
  const distance = Math.max(0, -scrollY);
  const node = mark();
  armed = distance >= THRESHOLD;
  node.style.opacity = String(Math.min(1, distance / THRESHOLD));
  node.style.transform = `translateX(-50%) rotate(${Math.round(distance * 4)}deg)`;
  node.classList.toggle("armed", armed);
}

async function release() {
  if (!handler || busy || !armed) return;
  busy = true;
  armed = false;
  const node = mark();
  node.classList.add("busy");
  try {
    await handler();
  } finally {
    node.classList.remove("busy", "armed");
    node.style.opacity = "0";
    busy = false;
  }
}

addEventListener("scroll", track, { passive: true });
addEventListener("touchend", release, { passive: true });

export function setPull(next) {
  handler = next;
  if (!next && indicator && !busy) indicator.style.opacity = "0";
}
