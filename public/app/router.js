import { glide } from "./dom.js";

const ROUTES = [
  ["/", "foryou", "/"],
  ["/story/:id", "story", "/"],
  ["/following", "sources", "/following"],
  ["/saved", "saved", "/saved"],
  ["/settings", "settings", "/settings"],
  ["/settings/topics", "topics", "/settings"],
  ["/settings/following", "sourceList", "/settings"]
].map(([pathname, name, tab]) => ({ pattern: new URLPattern({ pathname }), name, tab }));

const lastPaths = new Map();
let renderer = null;
let motion = { restore: false, animate: true };

export function currentRoute() {
  const path = location.pathname;
  for (const route of ROUTES) {
    const match = route.pattern.exec({ pathname: path });
    if (match) return { name: route.name, tab: route.tab, params: match.pathname.groups };
  }
  return { name: "foryou", tab: "/", params: {} };
}

export const navigation = () => motion;

const known = (path) => ROUTES.some((route) => route.pattern.test({ pathname: path }));

function previousEntry() {
  const index = window.navigation.currentEntry.index;
  const entry = index > 0 ? window.navigation.entries()[index - 1] : null;
  return entry && entry.sameDocument ? new URL(entry.url).pathname : null;
}

function settle(result) {
  result.committed.catch(() => {});
  result.finished.catch(() => {});
}

function go(restore, animate) {
  motion = { restore, animate };
  if (renderer) renderer();
}

function move(path, mode, restore) {
  settle(window.navigation.navigate(path, { history: mode, info: { restore, animate: true } }));
}

export function navigate(path) {
  if (path !== location.pathname) move(path, "push", false);
  else go(false, true);
}

export function goBack(parent) {
  if (previousEntry() === parent) settle(window.navigation.back({ info: { restore: true, animate: true } }));
  else move(parent, "replace", true);
}

function openTab(root) {
  if (currentRoute().tab !== root) move(lastPaths.get(root) || root, "replace", true);
  else if (location.pathname !== root) goBack(root);
  else scrollTo({ top: 0, behavior: glide() });
}

export function startRouter(fn) {
  renderer = fn;
  window.navigation.addEventListener("navigate", (event) => {
    if (!event.canIntercept || event.hashChange || event.downloadRequest !== null || event.formData) return;
    const info = event.info;
    if (!info && event.navigationType !== "traverse") return;
    if (!known(new URL(event.destination.url).pathname)) return;
    event.intercept({
      scroll: "manual",
      focusReset: "manual",
      handler: () => {
        lastPaths.set(currentRoute().tab, location.pathname);
        if (info) go(info.restore, info.animate);
        else go(true, false);
      }
    });
  });
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-link]");
    if (!link) return;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const href = link.getAttribute("href");
    if (!href || !href.startsWith("/")) return;
    event.preventDefault();
    if (link.closest(".navbar")) openTab(href);
    else if (href === location.pathname) scrollTo({ top: 0, behavior: glide() });
    else navigate(href);
  });
  const path = known(location.pathname) ? location.pathname : "/";
  if (location.pathname + location.search !== path) return move(path, "replace", false);
  lastPaths.set(currentRoute().tab, path);
  go(false, true);
}
