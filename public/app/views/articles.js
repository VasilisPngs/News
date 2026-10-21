import { el, iconButton, swipeAction, snackbar } from "../dom.js";
import { t, tn, ago } from "../i18n.js";
import { markOpened, articleAction } from "../store.js";

const PICTURE_LIMIT = 300;
const pictures = new Map();

function keep(key, node) {
  pictures.delete(key);
  pictures.set(key, node);
  if (pictures.size > PICTURE_LIMIT) pictures.delete(pictures.keys().next().value);
}

function picture(key, src, props, onFail) {
  const kept = pictures.get(key);
  if (kept && kept.getAttribute("src") === src) {
    keep(key, kept);
    return kept;
  }
  const node = el("img", {
    src,
    alt: "",
    decoding: "async",
    referrerPolicy: "no-referrer",
    ...props,
    onload: () => keep(key, node),
    onerror: () => {
      pictures.delete(key);
      node.remove();
      if (onFail) onFail();
    }
  });
  return node;
}

function sourceIcon(article) {
  if (!article.icon) return null;
  return picture(`icon:${article.id}`, article.icon, { class: "source-icon" });
}

function meta(article) {
  const parts = [article.source, ago(article.published)];
  if (article.coverage > 1) parts.push(tn(article.coverage, "source"));
  return el("span", { class: "supporting article-meta" }, [sourceIcon(article), el("span", { text: parts.filter(Boolean).join(" · ") })]);
}

async function act(article, action) {
  try {
    await articleAction(article, action);
    if (action === "less") snackbar(t("lessDone"));
    return true;
  } catch {
    snackbar(t("actionFailed"));
    return false;
  }
}

function thumbnail(article, row) {
  if (!article.image) return null;
  row.classList.add("with-image");
  return picture(`image:${article.id}`, article.image, { class: "article-image", loading: "lazy" }, () => row.classList.remove("with-image"));
}

function articleRow(article, mode) {
  const content = el("div", { class: article.opened ? "list-item article read" : "list-item article", "data-id": article.id });
  content.append(
    el("a", { class: "article-link grow", href: article.url, target: "_blank", rel: "noopener noreferrer", onclick: () => markOpened(article) }, [
      el("span", { class: "article-title", text: article.title }),
      meta(article),
      thumbnail(article, content)
    ]),
    el("div", { class: "article-actions" }, [
      mode === "foryou" ? iconButton("thumbDown", t("lessLikeThis"), (event) => event.currentTarget.closest(".swipe").dismiss()) : null,
      iconButton(article.saved ? "bookmarkFilled" : "bookmark", t("save"), () => act(article, article.saved ? "unsave" : "save"), { class: article.saved ? "icon-btn selected" : "icon-btn", ariaPressed: String(Boolean(article.saved)) })
    ])
  );
  if (mode === "foryou") return swipeAction(content, "thumbDown", () => act(article, "less"));
  if (mode === "saved") return swipeAction(content, "bookmarkRemove", () => act(article, "unsave"));
  return content;
}

export const articleList = (items, mode) => el("div", { class: "list" }, items.map((article) => articleRow(article, mode)));
