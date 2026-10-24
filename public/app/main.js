import { el, startTooltips, startArrowKeys, keepFocus } from "./dom.js";
import { startShell, scrollViewTop, watchBars } from "./shell.js";
import { storeEvents, status, loadState, loadFeed, finishDwell, pullRefresh } from "./store.js";
import { currentRoute, navigation, startRouter } from "./router.js";
import { renderForYou } from "./views/foryou.js";
import { renderStory } from "./views/story.js";
import { renderSources } from "./views/sources.js";
import { renderSaved } from "./views/saved.js";
import { renderSettings, renderTopics, renderSourceList } from "./views/settings.js";
import { t } from "./i18n.js";
import { applyTheme } from "./theme.js";
import { loadPush } from "./push.js";
import { readLocal } from "./storage.js";
import { setPull } from "./pull.js";

const app = document.getElementById("app");
const view = document.getElementById("view");
const barLead = document.getElementById("bar-lead");
const barActions = document.getElementById("bar-actions");
const tabs = [...document.querySelectorAll(".nav-item")];

const VIEWS = {
  foryou: renderForYou,
  story: renderStory,
  sources: renderSources,
  saved: renderSaved,
  settings: renderSettings,
  topics: renderTopics,
  sourceList: renderSourceList
};

const DEPTH = { story: 1, topics: 1, sourceList: 1 };

const TAB_LABELS = { foryou: "tabForYou", sources: "tabSources", saved: "tabSaved", settings: "tabSettings" };

const REFRESH_MS = 60000;

let lastRouteKey = "";
let lastTab = "";
let deferredRender = false;
let pressing = false;
const positions = new Map();
let banner = null;

function isEditing() {
  const active = document.activeElement;
  if (view.querySelector(".swiping, .sorting")) return true;
  return Boolean(active) && view.contains(active) && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);
}

function render() {
  const route = currentRoute();
  const key = route.name;
  if (isEditing() || pressing) {
    deferredRender = true;
    if (key !== lastRouteKey && isEditing()) document.activeElement.blur();
    if (key === lastRouteKey) return;
  }
  deferredRender = false;
  const { restore, animate } = navigation();
  for (const tab of tabs) {
    const current = tab.getAttribute("href") === route.tab;
    tab.classList.toggle("current", current);
    tab.ariaSelected = String(current);
    tab.tabIndex = current ? 0 : -1;
    const label = tab.querySelector(".nav-label");
    if (label) label.textContent = t(TAB_LABELS[tab.dataset.route]);
  }
  const changed = key !== lastRouteKey;
  const from = DEPTH[lastRouteKey] || 0;
  const to = DEPTH[route.name] || 0;
  const lateral = from !== to ? (to > from ? "push" : "pop") : null;
  const direction = animate && changed && lastTab ? (route.tab === lastTab ? lateral : "tab") : null;
  if (changed) positions.set(lastRouteKey, scrollY);
  const draw = () => {
    view.replaceChildren();
    barLead.replaceChildren();
    barActions.replaceChildren();
    delete view.dataset.title;
    delete view.dataset.editing;
    VIEWS[route.name](view, route.params);
  };
  const update = () => {
    if (changed) draw();
    else keepFocus(app, draw);
    setPull(route.name === "foryou" || route.name === "sources" ? route.name : null, () => pullRefresh(route.name, readLocal("news.source")));
    if (changed) {
      lastRouteKey = key;
      lastTab = route.tab;
      if (restore && positions.has(key)) scrollTo({ top: positions.get(key), behavior: "instant" });
      else scrollViewTop();
    }
    watchBars();
  };
  if (direction && !document.documentElement.dataset.nav && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.documentElement.dataset.nav = direction;
    const transition = document.startViewTransition(update);
    transition.finished.finally(() => delete document.documentElement.dataset.nav);
  } else {
    update();
  }
}

function paintBanner() {
  const { auth } = status();
  if (auth && !banner) {
    banner = el("div", { class: "banner", role: "alert" }, [
      el("span", { text: t("sessionExpired") }),
      el("button", { class: "btn text", type: "button", text: t("statusSignIn"), onclick: () => (location.href = `/?signin=${Date.now()}`) })
    ]);
    document.body.append(banner);
  }
  if (!auth && banner) {
    banner.remove();
    banner = null;
  }
}

const UPDATE_CHECK_MS = 60000;

function watchServiceWorker() {
  const replacing = Boolean(navigator.serviceWorker.controller);
  let updated = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (replacing) updated = true;
  });
  navigator.serviceWorker.register("/sw.js").then((registration) => {
    let checkedAt = Date.now();
    addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        if (updated && !isEditing() && !document.querySelector("dialog[open]")) location.reload();
        return;
      }
      if (Date.now() - checkedAt < UPDATE_CHECK_MS) return;
      checkedAt = Date.now();
      registration.update().catch(() => {});
    });
  });
}

let refreshedAt = 0;

function refreshVisible() {
  if (document.visibilityState !== "visible" || Date.now() - refreshedAt < REFRESH_MS) return;
  refreshedAt = Date.now();
  loadState().catch(() => {});
  const route = currentRoute().name;
  if (route === "foryou") loadFeed("foryou", null, true).catch(() => {});
  if (route === "sources") loadFeed("sources", readLocal("news.source"), true).catch(() => {});
  if (route === "saved") loadFeed("saved", null, true).catch(() => {});
}

function renderDeferred() {
  setTimeout(() => {
    if (deferredRender && !pressing && !isEditing()) render();
  }, 0);
}

function release() {
  setTimeout(() => {
    pressing = false;
    renderDeferred();
  }, 0);
}

const RETURN_GRACE_MS = 1000;

document.addEventListener(
  "pointerdown",
  () => {
    pressing = true;
    finishDwell(RETURN_GRACE_MS);
  },
  true
);
document.addEventListener("pointerup", release, true);
document.addEventListener("pointercancel", release, true);
view.addEventListener("focusout", renderDeferred);
view.addEventListener("swipeend", renderDeferred);

const TAB_KEYS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

document.querySelector(".navbar").addEventListener("keydown", (event) => {
  const index = tabs.indexOf(event.target);
  if (index < 0) return;
  if (event.key === " ") {
    event.preventDefault();
    return event.target.click();
  }
  const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : TAB_KEYS[event.key] ? (index + TAB_KEYS[event.key] + tabs.length) % tabs.length : -1;
  if (next < 0) return;
  event.preventDefault();
  tabs[next].focus();
});

function boot() {
  startShell();
  startTooltips();
  startArrowKeys();
  applyTheme();
  storeEvents.addEventListener("changed", () => {
    paintBanner();
    render();
  });
  startRouter(render);
  refreshedAt = Date.now();
  loadState().catch(() => {});
  loadPush().then(render);
  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") finishDwell();
    refreshVisible();
  });
  finishDwell();
  watchServiceWorker();
}

boot();
