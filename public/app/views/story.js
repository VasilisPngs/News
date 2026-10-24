import { el, iconButton, emptyState, loading } from "../dom.js";
import { t } from "../i18n.js";
import { feed, loadFeed, feedFailed } from "../store.js";
import { goBack } from "../router.js";
import { articleList } from "./articles.js";

const barLead = document.getElementById("bar-lead");

export function renderStory(container, { id }) {
  container.dataset.title = t("fullCoverage");
  barLead.append(iconButton("back", t("back"), () => goBack("/")));
  loadFeed("story", id).catch(() => {});
  const current = feed("story", id);
  if (!current && !feedFailed("story", id)) {
    container.append(loading());
    return;
  }
  if (!current || current.items.length === 0) {
    const empty = emptyState("news", t("noCoverage"), t("noCoverageHint"));
    empty.classList.add("page");
    container.append(empty);
    return;
  }
  container.append(el("section", { class: "group" }, articleList(current.items, "story")));
}
