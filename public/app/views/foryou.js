import { el, icon, emptyState, promptSheet, toast } from "../dom.js";
import { t } from "../i18n.js";
import { appState, feed, loadFeed, addTopic, markSeen } from "../store.js";
import { articleList } from "./articles.js";
import { newSource } from "./sources.js";

const barActions = document.getElementById("bar-actions");
const SEEN_MS = 1000;
const SEEN_GAP_MS = 30 * 60000;
const FLUSH_MS = 3000;
const reported = new Map();
const pending = new Set();
const timers = new Map();
let observer = null;
let flushTimer = 0;

function flush() {
  clearTimeout(flushTimer);
  if (pending.size) markSeen([...pending]);
  pending.clear();
}

function seen(id) {
  timers.delete(id);
  if (Date.now() - (reported.get(id) || 0) < SEEN_GAP_MS) return;
  reported.set(id, Date.now());
  pending.add(id);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, FLUSH_MS);
}

function watchSeen(root) {
  observer?.disconnect();
  timers.forEach(clearTimeout);
  timers.clear();
  observer = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        const id = target.dataset.id;
        if (isIntersecting && !timers.has(id)) timers.set(id, setTimeout(() => seen(id), SEEN_MS));
        if (!isIntersecting) {
          clearTimeout(timers.get(id));
          timers.delete(id);
        }
      }
    },
    { threshold: 0.6 }
  );
  for (const node of root.querySelectorAll("[data-id]")) observer.observe(node);
}

addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flush();
});

export async function newTopic() {
  const name = await promptSheet(t("newTopic"), "", { placeholder: t("topicPlaceholder"), required: true });
  if (!name) return;
  try {
    await addTopic(name);
  } catch (error) {
    toast(error.code === "duplicate" ? t("topicExists") : t("actionFailed"));
  }
}

function page(state) {
  state.classList.add("page");
  return state;
}

export function renderForYou(container) {
  container.append(el("h1", { text: t("forYouTitle") }));
  barActions.append(el("button", { class: "bar-btn", type: "button", onclick: newTopic }, icon("plus")));
  if (appState().sources.length === 0) {
    container.append(page(emptyState("newspaper", t("forYouNoSources"), t("forYouNoSourcesHint"), el("button", { class: "btn primary", type: "button", text: t("newSource"), onclick: newSource }))));
    return;
  }
  if (appState().topics.length === 0) {
    container.append(page(emptyState("sparkles", t("noTopics"), t("noTopicsHint"), el("button", { class: "btn primary", type: "button", text: t("newTopic"), onclick: newTopic }))));
    return;
  }
  loadFeed("foryou").catch(() => {});
  const current = feed("foryou");
  if (!current || current.items.length === 0) {
    container.append(page(emptyState("sparkles", t("searching"), t("searchingHint"))));
    return;
  }
  const list = el("section", { class: "group" }, articleList(current.items, "foryou"));
  container.append(list);
  watchSeen(list);
}
