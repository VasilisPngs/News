import { el, icon, iconButton, snackbar, confirmDialog, chooseDialog, promptDialog, switchInput, sortable, emptyState } from "../dom.js";
import { t, formatter } from "../i18n.js";
import { goBack } from "../router.js";
import { themeMode, themeModes, setTheme } from "../theme.js";
import { pushSupported, pushEnabled, enablePush, disablePush } from "../push.js";
import { appState, renameTopic, deleteTopic, renameSource, deleteSource, orderSources } from "../store.js";

const barLead = document.getElementById("bar-lead");

const section = (title, content) => el("section", { class: "group" }, [title ? el("h2", { text: title }) : null, content]);

const lines = (label, detail) => el("span", { class: "grow" }, [el("div", { text: label }), detail ? el("div", { class: "supporting", text: detail }) : null]);

function link(href, label, detail) {
  return el("a", { class: "list-item action", href, "data-link": "" }, [el("span", { class: "grow", text: label }), detail ? el("span", { class: "trailing", text: detail }) : null, icon("chevron")]);
}

function choice(label, options, current, onPick) {
  const value = el("div", { class: "supporting", text: options.find((option) => option.value === current)?.label || "" });
  return el(
    "button",
    {
      class: "list-item action",
      type: "button",
      onclick: async () => {
        const next = await chooseDialog(label, options, current);
        if (!next || next === current) return;
        current = next;
        value.textContent = options.find((option) => option.value === next).label;
        onPick(next);
      }
    },
    el("span", { class: "grow" }, [el("div", { text: label }), value])
  );
}

export function renderSettings(container) {
  const { topics, sources } = appState();
  const count = (value) => (value ? formatter(Intl.NumberFormat).format(value) : "");
  container.dataset.title = t("settingsTitle");
  container.append(section(t("content"), el("div", { class: "list" }, [link("/settings/topics", t("topics"), count(topics.length)), link("/settings/following", t("sources"), count(sources.length))])));

  if (pushSupported) {
    const alerts = switchInput(pushEnabled(), async (next) => {
      try {
        if (next) await enablePush();
        else await disablePush();
      } catch {
        snackbar(Notification.permission === "denied" ? t("notificationsBlocked") : t("notificationsFailed"));
      }
      alerts.checked = pushEnabled();
    });
    container.append(section(t("notifications"), el("div", { class: "list" }, el("label", { class: "list-item" }, [lines(t("importantNews"), t("importantNewsNote")), alerts]))));
  }

  const themes = themeModes().map((mode) => ({ value: mode, label: t(`theme${mode[0].toUpperCase()}${mode.slice(1)}`) }));
  container.append(section(t("preferences"), el("div", { class: "list" }, [choice(t("theme"), themes, themeMode(), setTheme)])));
}

function manageList(container, title, rows, empty) {
  barLead.append(iconButton("back", t("back"), () => goBack("/settings")));
  container.dataset.title = title;
  if (rows.children.length) return container.append(section(null, rows));
  empty.classList.add("page");
  container.append(empty);
}

function manageRow(id, label, detail, { onRename, onDelete, draggable }) {
  return el("div", { class: "list-item manage", "data-key": id }, [
    draggable ? el("button", { class: "drag-handle", type: "button", ariaLabel: t("moveNamed", { name: label }), ariaHasPopup: "menu", ariaExpanded: "false" }, icon("grip")) : null,
    el("button", { class: "grow", type: "button", onclick: onRename }, [el("div", { text: label }), detail ? el("div", { class: "supporting", text: detail }) : null]),
    iconButton("trash", t("deleteNamed", { name: label }), onDelete)
  ]);
}

async function attempt(work) {
  try {
    await work();
    return true;
  } catch {
    snackbar(t("actionFailed"));
    return false;
  }
}

export function renderTopics(container) {
  const { topics } = appState();
  const taken = (name, except) => topics.some((topic) => topic.id !== except && topic.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());
  const rows = el(
    "div",
    { class: "list" },
    topics.map((topic) =>
      manageRow(topic.id, topic.name, null, {
        onRename: async () => {
          const name = await promptDialog(t("rename"), topic.name, { label: t("topicLabel"), hint: t("topicPlaceholder"), action: t("save"), cancel: t("cancel"), required: true, invalid: (next) => taken(next, topic.id) });
          if (name) attempt(() => renameTopic(topic.id, name));
        },
        onDelete: async () => {
          if (await confirmDialog(t("deleteTopic"), t("deleteTopicBody"), t("delete"), t("cancel"))) attempt(() => deleteTopic(topic.id));
        }
      })
    )
  );
  manageList(container, t("topics"), rows, emptyState("sparkles", t("noTopics"), t("topicsEmptyHint")));
}

export function renderSourceList(container) {
  const { sources } = appState();
  const host = (site) => {
    try {
      return new URL(site).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  };
  const rows = el(
    "div",
    { class: "list" },
    sources.map((source) =>
      manageRow(source.id, source.title, host(source.site), {
        onRename: async () => {
          const title = await promptDialog(t("rename"), source.title, { label: t("namePlaceholder"), action: t("save"), cancel: t("cancel"), required: true });
          if (title) attempt(() => renameSource(source.id, title));
        },
        onDelete: async () => {
          if (await confirmDialog(t("deleteSource"), t("deleteSourceBody"), t("delete"), t("cancel"))) attempt(() => deleteSource(source.id));
        },
        draggable: sources.length > 1
      })
    )
  );
  manageList(container, t("sources"), sortable(rows, (ids) => attempt(() => orderSources(ids))), emptyState("news", t("noSources"), t("sourcesEmptyHint")));
}
