import { el } from "./dom.js";
import { startShell, scrollViewTop, watchBars, placeLens } from "./shell.js";
import { storeEvents, status, loadState, loadFeed, finishDwell, pullRefresh } from "./store.js";
import { currentRoute, navigation, startRouter } from "./router.js";
import { renderForYou } from "./views/foryou.js";
import { renderSources } from "./views/sources.js";
import { renderSaved } from "./views/saved.js";
import { renderSettings, renderTopics, renderSourceList } from "./views/settings.js";
import { t, applyLanguage, i18nEvents } from "./i18n.js";
import { applyTheme } from "./theme.js";
import { loadPush } from "./push.js";
import { readLocal } from "./storage.js";
import { setPull } from "./pull.js";

const view = document.getElementById("view");
const barLead = document.getElementById("bar-lead");
const barActions = document.getElementById("bar-actions");
const tabs = [...document.querySelectorAll(".tab")];

const VIEWS = {
  foryou: renderForYou,
  sources: renderSources,
  saved: renderSaved,
  settings: renderSettings,
  topics: renderTopics,
  sourceList: renderSourceList
};

const DEPTH = { topics: 1, sourceList: 1 };

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
    tab.classList.toggle("current", tab.getAttribute("href") === route.tab);
    const label = tab.querySelector("span");
    if (label) label.textContent = t(TAB_LABELS[tab.dataset.route]);
  }
  placeLens(animate);
  const changed = key !== lastRouteKey;
  const from = DEPTH[lastRouteKey] || 0;
  const to = DEPTH[route.name] || 0;
  const direction = animate && changed && route.tab === lastTab && from !== to ? (to > from ? "push" : "pop") : null;
  if (changed) positions.set(lastRouteKey, scrollY);
  const update = () => {
    view.replaceChildren();
    barLead.replaceChildren();
    barActions.replaceChildren();
    delete view.dataset.title;
    delete view.dataset.editing;
    VIEWS[route.name](view, route.params);
    setPull(route.name === "foryou" || route.name === "sources" ? () => pullRefresh(route.name, readLocal("news.source")) : null);
    if (changed) {
      lastRouteKey = key;
      lastTab = route.tab;
      if (restore && positions.has(key)) scrollTo({ top: positions.get(key), behavior: "instant" });
      else scrollViewTop();
    }
    watchBars();
  };
  if (direction && !document.documentElement.dataset.nav) {
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
    banner = el("div", { class: "banner" }, [
      el("span", { text: t("sessionExpired") }),
      el("button", { class: "btn small", type: "button", text: t("statusSignIn"), onclick: () => (location.href = `/?signin=${Date.now()}`) })
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

function boot() {
  startShell();
  if (new URL(location.href).searchParams.has("signin")) history.replaceState({}, "", location.pathname);
  applyLanguage();
  applyTheme();
  storeEvents.addEventListener("changed", () => {
    paintBanner();
    render();
  });
  i18nEvents.addEventListener("changed", () => render());
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
