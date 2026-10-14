const TAB_SELECTOR = ".tabbar";
const TOP_SELECTOR = ".topbar";

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
  const top = document.querySelector(TOP_SELECTOR);
  root.style.setProperty("--topbar", `${Math.round(top.getBoundingClientRect().height)}px`);
  const bar = document.querySelector(TAB_SELECTOR);
  const bottom = getComputedStyle(bar).getPropertyValue("--bottom-bar").trim() === "1";
  if (bottom) root.style.setProperty("--tabbar", `${Math.round(innerHeight - bar.getBoundingClientRect().top)}px`);
  else root.style.removeProperty("--tabbar");
}

let viewport = "";

function syncViewport() {
  const host = document.getElementById("sheet-host");
  const view = visualViewport;
  const cover = Math.max(innerHeight, matchMedia("(pointer: coarse)").matches ? screenHeight() : 0);
  const lift = Math.max(0, Math.round(cover - view.offsetTop - view.height));
  const next = `${cover}|${lift}`;
  if (next === viewport) return;
  viewport = next;
  host.style.setProperty("--sheet-cover", `${cover}px`);
  host.style.setProperty("--sheet-lift", `${lift}px`);
  host.classList.toggle("lifted", lift > 0);
}

let barFrame = 0;
let hold = null;
const barTitle = document.getElementById("bar-title");
const [barText, barSubtitle] = barTitle.children;

function paintBars() {
  barFrame = 0;
  const root = document.documentElement;
  if (root.classList.contains("locked")) return;
  const top = document.querySelector(TOP_SELECTOR);
  const scrolled = scrollY > 0;
  const edge = top.getBoundingClientRect().bottom;
  const bar = document.querySelector(".view .list-bar");
  const stuck = Boolean(scrolled && bar && bar.getBoundingClientRect().top <= edge + 0.5);
  if (stuck) {
    const height = `${bar.offsetHeight}px`;
    if (root.style.getPropertyValue("--bar-h") !== height) root.style.setProperty("--bar-h", height);
  }
  root.classList.toggle("bar-stuck", stuck);
  root.classList.toggle("scrolled", scrolled);
  const view = document.querySelector(".view");
  const heading = view.querySelector("h1");
  const title = heading ? heading.textContent : view.dataset.title || "";
  const fresh = barText.textContent !== title;
  if (fresh) barText.textContent = title;
  const subtitle = view.querySelector("[data-bar-subtitle]")?.textContent || "";
  if (barSubtitle.textContent !== subtitle) barSubtitle.textContent = subtitle;
  root.classList.toggle("snap-bars", fresh);
  if (hold && (fresh || hold.path !== location.pathname || Math.abs(scrollY - hold.top) <= 1)) hold = null;
  root.classList.toggle("titled", hold ? hold.titled : heading ? scrolled && heading.getBoundingClientRect().bottom <= edge : Boolean(title));
}

export function watchBars() {
  if (!barFrame) barFrame = requestAnimationFrame(paintBars);
}

export function scrollViewTop() {
  scrollTo({ top: 0, behavior: "instant" });
}

const TYPING = 'input[type="text"], textarea';
let dragStart = null;
let typingTop = null;
let restoreToken = 0;

function release() {
  if (!hold) return;
  hold = null;
  watchBars();
}

function trackDrag(event) {
  restoreToken += 1;
  release();
  const field = document.activeElement;
  const typing = event.touches.length === 1 && field && field.matches(TYPING) && !field.closest("dialog") && event.target !== field;
  dragStart = typing ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
}

function dismissOnDrag(event) {
  if (!dragStart) return;
  const dx = Math.abs(event.touches[0].clientX - dragStart.x);
  const dy = Math.abs(event.touches[0].clientY - dragStart.y);
  if (Math.max(dx, dy) < 10) return;
  if (dy > dx) document.activeElement.blur();
  dragStart = null;
}

function rememberTop(event) {
  if (typingTop !== null || !event.target.matches(TYPING) || event.target.closest("dialog") || !matchMedia("(pointer: coarse)").matches) return;
  typingTop = { top: scrollY, path: location.pathname, titled: document.documentElement.classList.contains("titled") };
}

function restoreTop(event) {
  const next = event.relatedTarget;
  if (typingTop === null || (next instanceof Element && next.matches(TYPING))) return;
  hold = typingTop;
  typingTop = null;
  watchBars();
  const { top, path } = hold;
  const token = ++restoreToken;
  const settle = (last) => {
    if (token !== restoreToken) return;
    if (location.pathname === path && scrollY > top + 1) {
      restoreToken += 1;
      scrollTo({ top, behavior: "smooth" });
    } else if (last) release();
  };
  visualViewport.addEventListener("resize", () => requestAnimationFrame(() => settle(false)), { once: true });
  setTimeout(() => settle(true), 700);
}

export function startShell() {
  for (const name of ["gesturestart", "gesturechange", "gestureend"]) {
    addEventListener(name, (event) => event.preventDefault(), { passive: false });
  }
  syncShell();
  const observer = new ResizeObserver(syncShell);
  for (const selector of [TOP_SELECTOR, TAB_SELECTOR]) observer.observe(document.querySelector(selector));
  addEventListener("resize", syncShell);
  addEventListener("resize", watchBars);
  addEventListener("resize", syncViewport);
  addEventListener("scroll", watchBars, { passive: true });
  addEventListener("touchstart", trackDrag, { passive: true });
  addEventListener("touchmove", dismissOnDrag, { passive: true });
  addEventListener("pageshow", syncShell);
  syncViewport();
  visualViewport.addEventListener("resize", syncViewport);
  visualViewport.addEventListener("scroll", syncViewport);
  addEventListener("focusin", rememberTop);
  addEventListener("focusout", restoreTop);
}

const tabbar = document.querySelector(TAB_SELECTOR);
const lens = tabbar.querySelector(".tab-lens");

export function placeLens(animate = true) {
  tabbar.classList.toggle("snap", !animate);
  const tab = tabbar.querySelector(".tab.current");
  if (!tab) {
    tabbar.classList.remove("placed");
    return;
  }
  const bar = tabbar.getBoundingClientRect();
  const rect = tab.getBoundingClientRect();
  lens.style.width = `${rect.width}px`;
  lens.style.height = `${rect.height}px`;
  lens.style.transform = `translate(${rect.left - bar.left - tabbar.clientLeft}px, ${rect.top - bar.top - tabbar.clientTop}px)`;
  if (!tabbar.classList.contains("placed")) requestAnimationFrame(() => tabbar.classList.add("placed"));
}

addEventListener("resize", () => placeLens());
document.fonts.ready.then(() => placeLens());
