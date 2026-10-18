function installed() {
  return navigator.standalone === true;
}

function screenHeight() {
  const long = Math.max(screen.width, screen.height);
  const short = Math.min(screen.width, screen.height);
  return innerHeight >= innerWidth ? long : short;
}

function syncShell() {
  const root = document.documentElement;
  if (installed()) root.style.setProperty("--shell-min", `${Math.max(screenHeight(), innerHeight) + 1}px`);
  else root.style.removeProperty("--shell-min");
}

let viewport = "";

function syncViewport() {
  const host = document.getElementById("dialog-host");
  const view = visualViewport;
  const cover = Math.max(innerHeight, matchMedia("(pointer: coarse)").matches ? screenHeight() : 0);
  const lift = Math.max(0, Math.round(cover - view.offsetTop - view.height));
  const next = `${cover}|${lift}`;
  if (next === viewport) return;
  viewport = next;
  host.style.setProperty("--keyboard", `${lift}px`);
}

let barFrame = 0;
const barTitle = document.getElementById("bar-title");
const view = document.getElementById("view");

function paintBars() {
  barFrame = 0;
  const root = document.documentElement;
  if (root.classList.contains("locked")) return;
  root.classList.toggle("scrolled", scrollY > 0);
  const listBar = view.querySelector(".list-bar");
  if (listBar) listBar.classList.toggle("stuck", scrollY > 0 && listBar.getBoundingClientRect().top <= parseFloat(getComputedStyle(listBar).top) + 0.5);
  const title = view.dataset.title || "";
  if (barTitle.textContent !== title) barTitle.textContent = title;
}

export function watchBars() {
  if (!barFrame) barFrame = requestAnimationFrame(paintBars);
}

export function scrollViewTop() {
  scrollTo({ top: 0, behavior: "instant" });
}

export function startShell() {
  for (const name of ["gesturestart", "gesturechange", "gestureend"]) {
    addEventListener(name, (event) => event.preventDefault(), { passive: false });
  }
  syncShell();
  addEventListener("resize", syncShell);
  addEventListener("pageshow", syncShell);
  addEventListener("scroll", watchBars, { passive: true });
  syncViewport();
  visualViewport.addEventListener("resize", syncViewport);
  visualViewport.addEventListener("scroll", syncViewport);
}
