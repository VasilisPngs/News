import { el, icon, popMenu, swipeAction, toast } from "../dom.js";
import { t, tn, ago } from "../i18n.js";
import { markOpened, articleAction } from "../store.js";

function meta(article) {
  const parts = [article.source, ago(article.published)];
  if (article.coverage > 1) parts.push(tn(article.coverage, "source"));
  return parts.filter(Boolean).join(" · ");
}

async function act(article, action) {
  try {
    await articleAction(article, action);
    if (action === "less") toast(t("lessDone"));
    return true;
  } catch {
    toast(t("actionFailed"));
    return false;
  }
}

async function share(article) {
  try {
    await navigator.share({ title: article.title, url: article.url });
  } catch {}
}

function openMenu(article, mode, anchor) {
  const items = [
    article.saved
      ? { icon: "bookmark", label: t("unsave"), onSelect: () => act(article, "unsave") }
      : { icon: "bookmark", label: t("save"), onSelect: () => act(article, "save") }
  ];
  if (navigator.share) items.push({ icon: "share", label: t("share"), onSelect: () => share(article) });
  const sections = [items];
  if (mode === "foryou") sections.push([{ icon: "less", label: t("less"), onSelect: () => act(article, "less") }]);
  popMenu(anchor, sections);
}

function articleRow(article, mode) {
  const content = el("div", { class: article.opened ? "list-item article read" : "list-item article" }, [
    el("a", { class: "article-link grow", href: article.url, target: "_blank", rel: "noopener noreferrer", onclick: () => markOpened(article) }, [
      el("span", { class: "article-title", text: article.title }),
      el("span", { class: "tiny", text: meta(article) })
    ]),
    el("button", { class: "row-more", type: "button", onclick: (event) => openMenu(article, mode, event.currentTarget) }, icon("more"))
  ]);
  if (mode === "foryou") return swipeAction(content, t("less"), () => act(article, "less"));
  if (mode === "saved") return swipeAction(content, t("remove"), () => act(article, "unsave"));
  return content;
}

export const articleList = (items, mode) => el("div", { class: "card flush" }, el("div", { class: "list" }, items.map((article) => articleRow(article, mode))));
