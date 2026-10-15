import { el, icon, toast, confirmAction, switchInput, sortable, swipeAction, promptSheet, editMode, setEditMode, editHide } from "../dom.js";
import { t, language, languages, setLanguage, formatter } from "../i18n.js";
import { watchBars } from "../shell.js";
import { goBack } from "../router.js";
import { themeMode, themeModes, setTheme } from "../theme.js";
import { pushSupported, pushEnabled, enablePush, disablePush } from "../push.js";
import { appState, renameTopic, deleteTopic, renameSource, deleteSource, orderSources } from "../store.js";
import { newTopic } from "./foryou.js";
import { newSource } from "./sources.js";

const barLead = document.getElementById("bar-lead");
const barActions = document.getElementById("bar-actions");

function row(label, control) {
  return el("label", { class: "list-item" }, [el("span", { class: "grow", text: label }), control]);
}

function select(options, onChange) {
  return el(
    "select",
    {
      class: "row-select",
      onchange: (event) => {
        const next = event.target.value;
        event.target.blur();
        onChange(next);
      }
    },
    options
  );
}

function link(href, label, detail) {
  return el("a", { class: "list-item", href, "data-link": "" }, [el("span", { class: "grow", text: label }), detail ? el("span", { class: "row-value", text: detail }) : null, icon("chevron")]);
}

export function renderSettings(container) {
  const { topics, sources } = appState();
  const count = (value) => (value ? formatter(Intl.NumberFormat).format(value) : "");
  container.append(
    el("h1", { text: t("settingsTitle") }),
    el("section", { class: "group" }, [
      el("h2", { text: t("content") }),
      el("div", { class: "card flush" }, el("div", { class: "list" }, [link("/settings/topics", t("topics"), count(topics.length)), link("/settings/following", t("sources"), count(sources.length))]))
    ])
  );

  if (pushSupported) {
    const alerts = switchInput(pushEnabled(), async (next) => {
      try {
        if (next) await enablePush();
        else await disablePush();
      } catch {
        toast(Notification.permission === "denied" ? t("notificationsBlocked") : t("notificationsFailed"));
      }
      alerts.checked = pushEnabled();
    });
    container.append(
      el("section", { class: "group" }, [
        el("h2", { text: t("notifications") }),
        el("div", { class: "card flush" }, el("div", { class: "list" }, row(t("importantNews"), alerts))),
        el("p", { class: "tiny group-note", text: t("importantNewsNote") })
      ])
    );
  }

  container.append(
    el("section", { class: "group" }, [
      el("h2", { text: t("preferences") }),
      el(
        "div",
        { class: "card flush" },
        el("div", { class: "list" }, [
          row(
            t("theme"),
            select(
              themeModes().map((mode) => el("option", { value: mode, text: t(`theme${mode[0].toUpperCase()}${mode.slice(1)}`), selected: mode === themeMode() })),
              setTheme
            )
          ),
          row(
            t("language"),
            select(
              languages().map((code) => el("option", { value: code, text: formatter(Intl.DisplayNames, { type: "language" }, code).of(code), selected: code === language() })),
              setLanguage
            )
          )
        ])
      )
    ])
  );
}

function editList(container, title, rows, addLabel, onAdd) {
  const back = el("button", { class: "bar-btn", type: "button", onclick: () => goBack("/settings") }, icon("back"));
  const apply = (on) => {
    setEditMode(container, on);
    back.classList.toggle("concealed", on);
    barActions.replaceChildren(
      on
        ? el("button", { class: "bar-btn primary", type: "button", onclick: () => apply(false) }, icon("check"))
        : el("button", { class: "bar-btn label", type: "button", text: t("edit"), onclick: () => apply(true) })
    );
    watchBars();
  };
  barLead.append(back);
  container.dataset.title = title;
  container.append(
    rows.children.length ? el("section", { class: "group" }, el("div", { class: "card flush" }, rows)) : null,
    editHide(el("section", { class: "group" }, el("div", { class: "card flush" }, el("button", { class: "list-action", type: "button", text: addLabel, onclick: onAdd }))))
  );
  apply(rows.children.length > 0 && editMode());
}

function editableRow(id, label, detail, { onRename, onDelete, confirm, draggable }) {
  const open = (event) => {
    if (editMode() && !event.target.closest(".edit-remove, .drag-handle")) onRename();
  };
  const content = el("div", { class: "list-item", onclick: open }, [
    el("button", { class: "edit-remove", type: "button", onclick: () => item.reveal() }),
    el("span", { class: "grow" }, [el("div", { text: label }), detail ? el("div", { class: "tiny", text: detail }) : null]),
    draggable ? el("span", { class: "drag-handle" }, icon("grip")) : null
  ]);
  const item = swipeAction(content, t("delete"), onDelete, confirm);
  item.dataset.key = id;
  return item;
}

async function attempt(work) {
  try {
    await work();
    return true;
  } catch {
    toast(t("actionFailed"));
    return false;
  }
}

export function renderTopics(container) {
  const { topics } = appState();
  const taken = (name, except) => topics.some((topic) => topic.id !== except && topic.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());
  const rows = el(
    "div",
    { class: "list editable" },
    topics.map((topic) =>
      editableRow(topic.id, topic.name, null, {
        onRename: async () => {
          const name = await promptSheet(t("rename"), topic.name, { placeholder: t("topicPlaceholder"), required: true, invalid: (next) => taken(next, topic.id) });
          if (name) attempt(() => renameTopic(topic.id, name));
        },
        onDelete: () => attempt(() => deleteTopic(topic.id)),
        confirm: (anchor) => confirmAction(anchor, t("deleteTopic"), t("deleteTopicBody"), t("delete"))
      })
    )
  );
  editList(container, t("topics"), rows, t("newTopic"), newTopic);
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
    { class: "list editable" },
    sources.map((source) =>
      editableRow(source.id, source.title, host(source.site), {
        onRename: async () => {
          const title = await promptSheet(t("rename"), source.title, { placeholder: t("namePlaceholder"), required: true });
          if (title) attempt(() => renameSource(source.id, title));
        },
        onDelete: () => attempt(() => deleteSource(source.id)),
        confirm: (anchor) => confirmAction(anchor, t("deleteSource"), t("deleteSourceBody"), t("delete")),
        draggable: true
      })
    )
  );
  editList(container, t("sources"), sortable(rows, (ids) => attempt(() => orderSources(ids))), t("newSource"), newSource);
}
