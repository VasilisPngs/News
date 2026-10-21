import { el, iconButton, emptyState, promptDialog, snackbar, chipStrip, filterChip, loading } from "../dom.js";
import { t, dayLabel, dayStart } from "../i18n.js";
import { appState, feed, loadFeed, addSource, feedFailed } from "../store.js";
import { readLocal, writeLocal } from "../storage.js";
import { navigate } from "../router.js";
import { articleList } from "./articles.js";
import { refreshNow } from "../pull.js";

const barActions = document.getElementById("bar-actions");
const SOURCE_KEY = "news.source";

export async function newSource() {
  const url = await promptDialog(t("newSource"), "", { label: t("sourceLabel"), hint: t("sourcePlaceholder"), action: t("add"), cancel: t("cancel"), required: true });
  if (!url) return;
  snackbar(t("sourceSearching"));
  try {
    const added = await addSource(url);
    if (added) {
      writeLocal(SOURCE_KEY, null);
      snackbar(t("sourceAdded"));
    }
  } catch (error) {
    snackbar(error.code === "no_feed" ? t("noFeed") : t("actionFailed"));
  }
}

function sourceChips(sources, active) {
  const chip = (id, label) =>
    filterChip(label, id === active, () => {
      writeLocal(SOURCE_KEY, id);
      navigate("/following");
    });
  return chipStrip([chip(null, t("all")), ...sources.map((source) => chip(source.id, source.title))]);
}

function byDay(items) {
  const days = new Map();
  for (const item of items) {
    const day = dayStart(item.published);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(item);
  }
  return [...days.entries()];
}

function page(state) {
  state.classList.add("page");
  return state;
}

export function renderSources(container) {
  const { sources } = appState();
  const stored = readLocal(SOURCE_KEY);
  const active = sources.some((source) => source.id === stored) ? stored : null;
  container.dataset.title = t("sourcesTitle");
  if (sources.length) barActions.append(iconButton("refresh", t("refresh"), refreshNow));
  barActions.append(iconButton("add", t("newSource"), newSource));
  if (sources.length === 0) {
    container.append(page(emptyState("news", t("noSources"), t("noSourcesHint"), el("button", { class: "btn", type: "button", text: t("newSource"), onclick: newSource }))));
    return;
  }
  if (sources.length > 1) container.append(el("div", { class: "list-bar" }, sourceChips(sources, active)));
  loadFeed("sources", active).catch(() => {});
  const current = feed("sources", active);
  if (!current && !feedFailed("sources", active)) {
    container.append(loading());
    return;
  }
  if (!current || current.items.length === 0) {
    container.append(page(emptyState("news", t("noArticles"), t("noArticlesHint"))));
    return;
  }
  for (const [day, items] of byDay(current.items)) {
    container.append(el("section", { class: "group" }, [el("h2", { text: dayLabel(day) }), articleList(items, "sources")]));
  }
}
