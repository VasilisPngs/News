import { el, emptyState } from "../dom.js";
import { t } from "../i18n.js";
import { feed, loadFeed } from "../store.js";
import { articleList } from "./articles.js";

export function renderSaved(container) {
  container.append(el("h1", { text: t("savedTitle") }));
  loadFeed("saved").catch(() => {});
  const current = feed("saved");
  if (!current || current.items.length === 0) {
    const empty = emptyState("bookmark", t("noSaved"), t("noSavedHint"));
    empty.classList.add("page");
    container.append(empty);
    return;
  }
  container.append(el("section", { class: "group" }, articleList(current.items, "saved")));
}
