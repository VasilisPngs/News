import { el, icon, emptyState, promptSheet, toast, chipStrip } from "../dom.js";
import { t, dayLabel, dayStart } from "../i18n.js";
import { appState, feed, loadFeed, addSource } from "../store.js";
import { readLocal, writeLocal } from "../storage.js";
import { navigate } from "../router.js";
import { articleList } from "./articles.js";

const barActions = document.getElementById("bar-actions");
const SOURCE_KEY = "news.source";

export async function newSource() {
  const url = await promptSheet(t("newSource"), "", { placeholder: t("sourcePlaceholder"), required: true });
  if (!url) return;
  toast(t("sourceSearching"));
  try {
    const added = await addSource(url);
    if (added) {
      writeLocal(SOURCE_KEY, null);
      toast(t("sourceAdded"));
    }
  } catch (error) {
    toast(error.code === "no_feed" ? t("noFeed") : t("actionFailed"));
  }
}

function sourceChips(sources, active) {
  const chip = (id, label) =>
    el("button", {
      class: id === active ? "chip on" : "chip",
      type: "button",
      text: label,
      onclick: () => {
        writeLocal(SOURCE_KEY, id);
        navigate("/sources");
      }
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
  container.append(el("h1", { text: t("sourcesTitle") }));
  barActions.append(el("button", { class: "bar-btn", type: "button", onclick: newSource }, icon("plus")));
  if (sources.length === 0) {
    container.append(page(emptyState("newspaper", t("noSources"), t("noSourcesHint"), el("button", { class: "btn primary", type: "button", text: t("newSource"), onclick: newSource }))));
    return;
  }
  if (sources.length > 1) container.append(el("div", { class: "list-bar" }, sourceChips(sources, active)));
  loadFeed("sources", active).catch(() => {});
  const current = feed("sources", active);
  if (!current || current.items.length === 0) {
    container.append(page(emptyState("newspaper", t("noArticles"), t("noArticlesHint"))));
    return;
  }
  for (const [day, items] of byDay(current.items)) {
    container.append(el("section", { class: "group" }, [el("h2", { class: "prominent", text: dayLabel(day) }), articleList(items, "sources")]));
  }
}
