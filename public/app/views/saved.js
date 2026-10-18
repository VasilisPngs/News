import { el, emptyState, loading } from "../dom.js";
import { t } from "../i18n.js";
import { feed, loadFeed, feedFailed } from "../store.js";
import { articleList } from "./articles.js";

export function renderSaved(container) {
  container.dataset.title = t("savedTitle");
  loadFeed("saved").catch(() => {});
  const current = feed("saved");
  if (!current && !feedFailed("saved")) {
    container.append(loading());
    return;
  }
  if (!current || current.items.length === 0) {
    const empty = emptyState("bookmark", t("noSaved"), t("noSavedHint"));
    empty.classList.add("page");
    container.append(empty);
    return;
  }
  container.append(el("section", { class: "group" }, articleList(current.items, "saved")));
}
