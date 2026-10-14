import { el, icon, emptyState, promptSheet, toast } from "../dom.js";
import { t } from "../i18n.js";
import { appState, feed, loadFeed, addTopic } from "../store.js";
import { articleList } from "./articles.js";
import { newSource } from "./sources.js";

const barActions = document.getElementById("bar-actions");

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
  container.append(el("section", { class: "group" }, articleList(current.items, "foryou")));
}
