import { el, emptyState, spinner } from "../dom.js";
import { t } from "../i18n.js";
import { feed, loadFeed, feedFailed } from "../store.js";
import { articleList } from "./articles.js";

export function renderSaved(container) {
  container.append(el("h1", { text: t("savedTitle") }));
  loadFeed("saved").catch(() => {});
  const current = feed("saved");
  if (!current && !feedFailed("saved")) {
    container.append(spinner());
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
