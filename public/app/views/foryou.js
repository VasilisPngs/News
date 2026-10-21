import { el, iconButton, emptyState, promptDialog, snackbar, loading, assistChip } from "../dom.js";
import { t, categories } from "../i18n.js";
import { appState, feed, loadFeed, addTopic, markSeen, feedFailed } from "../store.js";
import { articleList } from "./articles.js";
import { refreshNow } from "../pull.js";

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
  const name = await promptDialog(t("newTopic"), "", { label: t("topicLabel"), hint: t("topicPlaceholder"), action: t("add"), cancel: t("cancel"), required: true });
  if (!name) return;
  try {
    await addTopic(name);
  } catch (error) {
    snackbar(error.code === "duplicate" ? t("topicExists") : t("actionFailed"));
  }
}

export function categoryChips() {
  const taken = new Set(appState().topics.map((topic) => topic.name.toLocaleLowerCase()));
  const chips = categories()
    .filter((name) => !taken.has(name.toLocaleLowerCase()))
    .map((name) => assistChip(name, () => addTopic(name).catch(() => snackbar(t("actionFailed")))));
  return chips.length ? el("div", { class: "chips wrap" }, chips) : null;
}

function page(state) {
  state.classList.add("page");
  return state;
}

export function renderForYou(container) {
  container.dataset.title = t("forYouTitle");
  if (appState().topics.length) barActions.append(iconButton("refresh", t("refresh"), refreshNow));
  barActions.append(iconButton("add", t("newTopic"), newTopic));
  if (appState().topics.length === 0) {
    container.append(
      page(emptyState("sparkles", t("noTopics"), t("noTopicsHint"), el("button", { class: "btn", type: "button", text: t("newTopic"), onclick: newTopic }))),
      el("section", { class: "group" }, [el("h2", { text: t("categories") }), categoryChips()])
    );
    return;
  }
  loadFeed("foryou").catch(() => {});
  const current = feed("foryou");
  if (!current && !feedFailed("foryou")) {
    container.append(loading());
    return;
  }
  if (!current || current.items.length === 0) {
    container.append(page(emptyState("sparkles", t("searching"), t("searchingHint"))));
    return;
  }
  const list = el("section", { class: "group" }, articleList(current.items, "foryou"));
  container.append(list);
  watchSeen(list);
}
