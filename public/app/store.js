import { readJson, writeJson, writeLocal } from "./storage.js";
import { report } from "./report.js";

const STALE_MS = 60000;
const WARM_DELAYS = [2500, 7000, 15000];
const POOL_DELAYS = [5000, 15000, 30000, 60000, 120000];

export const storeEvents = new EventTarget();

let state = readJson("news.state") || { topics: [], sources: [], pushKey: null };
const feeds = new Map();
const loading = new Map();
let auth = false;
let offline = false;

const changed = () => storeEvents.dispatchEvent(new CustomEvent("changed"));

export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export async function post(path, body = {}) {
  let response;
  try {
    response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), redirect: "manual" });
  } catch {
    if (!offline) {
      offline = true;
      changed();
    }
    throw new ApiError("offline", 0);
  }
  if (offline) {
    offline = false;
    changed();
  }
  if (response.type === "opaqueredirect" || response.status === 401 || response.status === 403) {
    if (!auth) {
      auth = true;
      changed();
    }
    throw new ApiError("auth", response.status);
  }
  if (auth) {
    auth = false;
    changed();
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status >= 500) report("api", `${response.status} ${path}`, "");
    throw new ApiError(data.error || "failed", response.status);
  }
  return data;
}

export const status = () => ({ auth, offline });

export const appState = () => state;

function setState(next) {
  state = { topics: next.topics || [], sources: next.sources || [], pushKey: next.pushKey || null };
  writeJson("news.state", state);
  changed();
}

export async function loadState() {
  setState(await post("/api/state"));
}

const feedKey = (tab, source) => (tab === "sources" && source ? `sources:${source}` : tab);

export function feed(tab, source = null) {
  const key = feedKey(tab, source);
  if (!feeds.has(key)) {
    const stored = readJson(`news.feed.${key}`);
    if (stored) feeds.set(key, stored);
  }
  return feeds.get(key) || null;
}

const failed = new Set();

export const feedFailed = (tab, source = null) => failed.has(feedKey(tab, source));

export function loadFeed(tab, source = null, force = false) {
  const key = feedKey(tab, source);
  const current = feed(tab, source);
  if (!force && current && current.fresh && Date.now() - current.at < STALE_MS) return Promise.resolve(current);
  if (loading.has(key)) return loading.get(key);
  const request = post("/api/feed", { tab, source })
    .then(({ items }) => {
      const next = { items: items || [], at: Date.now(), fresh: true };
      failed.delete(key);
      feeds.set(key, next);
      writeJson(`news.feed.${key}`, { items: next.items, at: next.at });
      changed();
      return next;
    })
    .catch((error) => {
      if (!failed.has(key)) {
        failed.add(key);
        if (!feeds.has(key)) changed();
      }
      throw error;
    })
    .finally(() => loading.delete(key));
  loading.set(key, request);
  return request;
}

function warmForYou() {
  for (const delay of POOL_DELAYS) setTimeout(() => loadFeed("foryou", null, true).catch(() => {}), delay);
}

function warmSources(source) {
  for (const delay of WARM_DELAYS) {
    setTimeout(() => {
      loadFeed("sources", null, true).catch(() => {});
      if (source) loadFeed("sources", source, true).catch(() => {});
    }, delay);
  }
}

export async function addTopic(name) {
  setState(await post("/api/topics", { action: "add", name }));
  warmForYou();
}

export async function renameTopic(id, name) {
  setState(await post("/api/topics", { action: "rename", id, name }));
  warmForYou();
}

export async function deleteTopic(id) {
  setState(await post("/api/topics", { action: "delete", id }));
  await loadFeed("foryou", null, true).catch(() => {});
}

export async function addSource(url) {
  const before = new Set(state.sources.map((source) => source.id));
  setState(await post("/api/sources", { action: "add", url }));
  const added = state.sources.find((source) => !before.has(source.id));
  warmSources(added && added.id);
  warmForYou();
  return added || null;
}

export async function renameSource(id, title) {
  setState(await post("/api/sources", { action: "rename", id, title }));
  loadFeed("sources", null, true).catch(() => {});
  loadFeed("foryou", null, true).catch(() => {});
}

export async function deleteSource(id) {
  setState(await post("/api/sources", { action: "delete", id }));
  await Promise.all([loadFeed("sources", null, true).catch(() => {}), loadFeed("foryou", null, true).catch(() => {})]);
}

export async function orderSources(ids) {
  state = { ...state, sources: ids.map((id) => state.sources.find((source) => source.id === id)).filter(Boolean) };
  changed();
  setState(await post("/api/sources", { action: "order", ids }));
}

function patch(update) {
  for (const [key, current] of feeds) {
    const items = update(current.items.map((item) => ({ ...item })), key).filter(Boolean);
    feeds.set(key, { ...current, items });
    writeJson(`news.feed.${key}`, { items, at: current.at });
  }
  changed();
}

const DWELL_KEY = "news.dwell";
const DWELL_MAX = 3600;

function beacon(payload, path = "/api/article") {
  if (!navigator.sendBeacon(path, new Blob([JSON.stringify(payload)], { type: "application/json" }))) post(path, payload).catch(() => {});
}

export const markSeen = (ids) => beacon({ ids }, "/api/seen");

export async function pullRefresh(tab, source) {
  await post("/api/refresh", { tab }).catch(() => {});
  await Promise.all([loadFeed(tab, null, true).catch(() => {}), tab === "sources" && source ? loadFeed(tab, source, true).catch(() => {}) : null]);
}

export function markOpened(article) {
  patch((items, key) => (key === "foryou" ? items.filter((item) => item.id !== article.id) : items.map((item) => (item.id === article.id ? { ...item, opened: true } : item))));
  beacon({ id: article.id, action: "open" });
  writeJson(DWELL_KEY, { id: article.id, at: Date.now() });
}

export function finishDwell(minimum = 0) {
  const pending = readJson(DWELL_KEY);
  if (!pending || typeof pending.id !== "string" || !Number.isFinite(pending.at)) return;
  const elapsed = Date.now() - pending.at;
  if (elapsed < minimum) return;
  writeLocal(DWELL_KEY, null);
  beacon({ id: pending.id, action: "dwell", seconds: Math.min(DWELL_MAX, Math.max(0, Math.round(elapsed / 1000))) });
}

export async function articleAction(article, action) {
  if (action === "less") patch((items, key) => (key === "foryou" ? items.filter((item) => item.id !== article.id) : items));
  else if (action === "save") patch((items, key) => (key === "saved" && !items.some((item) => item.id === article.id) ? [{ ...article, saved: true }, ...items] : items).map((item) => (item.id === article.id ? { ...item, saved: true } : item)));
  else if (action === "unsave") patch((items, key) => (key === "saved" ? items.filter((item) => item.id !== article.id) : items.map((item) => (item.id === article.id ? { ...item, saved: false } : item))));
  try {
    await post("/api/article", { id: article.id, action });
  } finally {
    if (action === "save" || action === "unsave") loadFeed("saved", null, true).catch(() => {});
  }
}
