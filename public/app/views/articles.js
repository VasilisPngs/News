import { el, icon, swipeAction, toast } from "../dom.js";
import { t, tn, ago } from "../i18n.js";
import { markOpened, articleAction } from "../store.js";

function sourceIcon(article) {
  if (!article.icon) return null;
  return el("img", {
    class: "source-icon",
    src: article.icon,
    alt: "",
    decoding: "async",
    referrerPolicy: "no-referrer",
    onerror: (event) => event.currentTarget.remove()
  });
}

function meta(article) {
  const parts = [article.source, ago(article.published)];
  if (article.coverage > 1) parts.push(tn(article.coverage, "source"));
  return el("span", { class: "tiny article-meta" }, [sourceIcon(article), el("span", { text: parts.filter(Boolean).join(" · ") })]);
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

function thumbnail(article, row) {
  if (!article.image) return null;
  row.classList.add("with-image");
  return el("img", {
    class: "article-image",
    src: article.image,
    alt: "",
    loading: "lazy",
    decoding: "async",
    referrerPolicy: "no-referrer",
    onerror: (event) => {
      event.currentTarget.remove();
      row.classList.remove("with-image");
    }
  });
}

function articleRow(article, mode) {
  const content = el("div", { class: article.opened ? "list-item article read" : "list-item article", "data-id": article.id });
  content.append(
    el("a", { class: "article-link grow", href: article.url, target: "_blank", rel: "noopener noreferrer", onclick: () => markOpened(article) }, [
      el("span", { class: "article-title", text: article.title }),
      meta(article),
      thumbnail(article, content)
    ]),
    el("button", { class: article.saved ? "row-save on" : "row-save", type: "button", onclick: () => act(article, article.saved ? "unsave" : "save") }, icon("bookmark"))
  );
  if (mode === "foryou") return swipeAction(content, t("less"), () => act(article, "less"));
  if (mode === "saved") return swipeAction(content, t("remove"), () => act(article, "unsave"));
  return content;
}

export const articleList = (items, mode) => el("div", { class: "card flush" }, el("div", { class: "list" }, items.map((article) => articleRow(article, mode))));
