const ROUTES = [
  { pattern: /^\/$/, name: "foryou", tab: "/", params: () => ({}) },
  { pattern: /^\/sources$/, name: "sources", tab: "/sources", params: () => ({}) },
  { pattern: /^\/saved$/, name: "saved", tab: "/saved", params: () => ({}) },
  { pattern: /^\/settings$/, name: "settings", tab: "/settings", params: () => ({}) },
  { pattern: /^\/settings\/topics$/, name: "topics", tab: "/settings", params: () => ({}) },
  { pattern: /^\/settings\/sources$/, name: "sourceList", tab: "/settings", params: () => ({}) }
];

const entries = [];
const lastPaths = new Map();
let index = 0;
let renderer = null;
let motion = { restore: false, animate: true };
let ownBack = false;

export function currentRoute() {
  const path = location.pathname;
  for (const route of ROUTES) {
    const match = path.match(route.pattern);
    if (match) return { name: route.name, tab: route.tab, params: route.params(match) };
  }
  return { name: "foryou", tab: "/", params: {} };
}

export const navigation = () => motion;

export const previousPath = () => (index > 0 ? entries[index - 1] : null);

const stateIndex = (state) => (state && Number.isInteger(state.index) ? state.index : 0);

function remember() {
  entries[index] = location.pathname;
  lastPaths.set(currentRoute().tab, location.pathname);
}

function go(restore, animate = true) {
  motion = { restore, animate };
  if (renderer) renderer();
}

function record(path, push) {
  if (push) {
    index += 1;
    entries.length = index;
  }
  history[push ? "pushState" : "replaceState"]({ index }, "", path);
  remember();
}

export function navigate(path) {
  if (path !== location.pathname) record(path, true);
  go(false);
}

export function goBack(parent) {
  if (index > 0 && entries[index - 1] === parent) {
    ownBack = true;
    return history.back();
  }
  record(parent, false);
  go(true);
}

function openTab(root) {
  if (currentRoute().tab !== root) {
    record(lastPaths.get(root) || root, false);
    go(true);
  } else if (location.pathname !== root) {
    goBack(root);
  } else {
    scrollTo({ top: 0, behavior: "smooth" });
  }
}

export function startRouter(fn) {
  renderer = fn;
  index = stateIndex(history.state);
  history.replaceState({ index }, "");
  remember();
  addEventListener("popstate", (event) => {
    index = stateIndex(event.state);
    remember();
    const animate = ownBack;
    ownBack = false;
    go(true, animate);
  });
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-link]");
    if (!link) return;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const href = link.getAttribute("href");
    if (!href || !href.startsWith("/")) return;
    event.preventDefault();
    if (link.closest(".tabbar")) openTab(href);
    else if (href === location.pathname) scrollTo({ top: 0, behavior: "smooth" });
    else navigate(href);
  });
  go(false);
}
