export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) continue;
    if (value === false && typeof node[key] !== "boolean") continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false || child === "") continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function svg(tag, props = {}, children = []) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(props)) node.setAttribute(key, value);
  for (const child of [].concat(children)) node.append(child);
  return node;
}

const ICON_PATHS = {
  check: "M6 13.1L10.2 18L18 6",
  close: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  plus: "M12 5v14M5 12h14",
  chevron: "M9.5 6l6 6-6 6",
  back: "M14.5 6l-6 6 6 6",
  pencil: "M4 20l1-4.5L15.5 5a2.12 2.12 0 0 1 3 3L8 18.5zM13.5 7l3 3",
  trash: "M4.5 6.5h15M9.5 6.5v-2c0-.6.4-1 1-1h3c.6 0 1 .4 1 1v2M6.5 6.5l.9 12.6c.1.8.7 1.4 1.5 1.4h6.2c.8 0 1.4-.6 1.5-1.4l.9-12.6M10 10.5v6M14 10.5v6",
  grip: "M1.83 7.25h20.34M1.83 12h20.34M1.83 16.75h20.34",
  bookmark: "M7 4.5h10c.3 0 .5.2.5.5v14.3l-5.5-3.8-5.5 3.8V5c0-.3.2-.5.5-.5z",
  sparkles: "M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z",
  newspaper: "M4.5 5.5c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v13.5c0 .8.7 1.5 1.5 1.5H6.5c-1.1 0-2-.9-2-2zM16.5 9.5h2c.6 0 1 .4 1 1V19c0 .8-.7 1.5-1.5 1.5M7.5 8h6M7.5 11.5h6M7.5 15h4"
};

export function icon(name) {
  return svg("svg", { class: "icon", viewBox: "0 0 24 24", "data-icon": name }, svg("path", { d: ICON_PATHS[name] }));
}

export function sortable(list, onSort) {
  list.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest(".drag-handle");
    if (!handle || event.button > 0) return;
    event.preventDefault();
    const rows = [...list.children];
    const row = rows.find((child) => child.contains(handle));
    const from = rows.indexOf(row);
    const step = row.offsetHeight;
    const startY = event.clientY;
    const startScroll = scrollY;
    let pointerY = startY;
    let to = from;
    let frame = 0;
    const offset = () => Math.max(-from * step, Math.min((rows.length - 1 - from) * step, pointerY - startY + scrollY - startScroll));
    const layout = () => {
      const dy = offset();
      to = Math.max(0, Math.min(rows.length - 1, from + Math.round(dy / step)));
      row.style.transform = `translateY(${dy}px)`;
      rows.forEach((other, position) => {
        if (other === row) return;
        const shift = position > from && position <= to ? -step : position < from && position >= to ? step : 0;
        other.style.transform = shift ? `translateY(${shift}px)` : "";
        other.classList.toggle("lead", from === 0 && to > 0 && position === 1);
      });
    };
    const edge = () => {
      const top = rootLength("--topbar") + step;
      const bottom = innerHeight - rootLength("--tabbar") - step;
      const speed = pointerY < top ? pointerY - top : pointerY > bottom ? pointerY - bottom : 0;
      if (speed) {
        scrollBy(0, speed / 4);
        layout();
      }
      frame = requestAnimationFrame(edge);
    };
    const move = (moveEvent) => {
      pointerY = moveEvent.clientY;
      layout();
    };
    const end = () => {
      cancelAnimationFrame(frame);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      const dy = offset();
      list.classList.add("settling");
      for (const other of rows) {
        other.classList.remove("lead");
        if (other !== row) other.style.removeProperty("transform");
      }
      if (to !== from) list.insertBefore(row, to > from ? rows[to].nextSibling : rows[to]);
      row.style.transform = `translateY(${dy - (to - from) * step}px)`;
      row.getBoundingClientRect();
      list.classList.remove("settling");
      row.classList.remove("dragging");
      row.style.removeProperty("transform");
      setTimeout(() => {
        list.classList.remove("sorting");
        if (to !== from) onSort([...list.children].map((node) => node.dataset.key));
        list.dispatchEvent(new Event("swipeend", { bubbles: true }));
      }, 260);
    };
    handle.setPointerCapture(event.pointerId);
    list.classList.add("sorting");
    row.classList.add("dragging");
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    frame = requestAnimationFrame(edge);
  });
  return list;
}

export function emptyState(symbol, title, message, action) {
  return el("div", { class: "empty" }, [icon(symbol), el("strong", { text: title }), el("p", { text: message }), action]);
}

const NATIVE_SWITCH = "switch" in HTMLInputElement.prototype;

export function switchInput(checked, onChange) {
  return el("input", {
    type: "checkbox",
    switch: true,
    class: NATIVE_SWITCH ? "switch-input native" : "switch-input",
    checked,
    onchange: (event) => onChange(event.target.checked)
  });
}

const SWIPE_REVEAL = 96;
let openSwipe = null;

document.addEventListener(
  "pointerdown",
  (event) => {
    if (openSwipe && !openSwipe.wrap.contains(event.target)) openSwipe.close();
  },
  true
);

export const editHide = (node) => el("div", { class: "edit-hide" }, el("div", {}, node));

export const editMode = () => Boolean(history.state && history.state.editing);

export function setEditMode(view, on) {
  if (!on && openSwipe) openSwipe.close();
  history.replaceState({ ...history.state, editing: on }, "");
  view.toggleAttribute("data-editing", on);
}

export function swipeAction(content, label, onAction, confirm) {
  const action = el("button", { class: "swipe-action", type: "button", text: label });
  const wrap = el("div", { class: "swipe" }, [action, content]);
  let offset = 0;
  let start = null;
  let dragging = false;
  let swallow = false;
  const rest = () => {
    wrap.classList.remove("swiping");
    wrap.dispatchEvent(new Event("swipeend", { bubbles: true }));
  };
  const move = (x, animate) => {
    const from = offset;
    offset = x;
    content.style.transition = animate ? "" : "none";
    content.style.transform = x ? `translateX(${x}px)` : "";
    if (x !== 0 || !animate) wrap.classList.add("swiping");
    else if (from === 0) rest();
  };
  const close = () => {
    move(0, true);
    wrap.classList.remove("revealed");
    if (openSwipe && openSwipe.wrap === wrap) openSwipe = null;
  };
  wrap.reveal = () => {
    if (openSwipe && openSwipe.wrap !== wrap) openSwipe.close();
    move(-SWIPE_REVEAL, true);
    wrap.classList.add("revealed");
    openSwipe = { wrap, close };
  };
  const commit = async () => {
    if (confirm && !(await confirm(wrap))) return close();
    openSwipe = null;
    move(-wrap.offsetWidth, true);
    const collapse = wrap.animate([{ height: `${wrap.offsetHeight}px`, opacity: 1 }, { height: "0px", opacity: 0 }], {
      duration: 260,
      delay: 140,
      easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
      fill: "forwards"
    });
    await collapse.finished;
    wrap.classList.remove("swiping");
    if ((await onAction()) !== false) return;
    collapse.cancel();
    wrap.classList.add("swiping");
    move(0, true);
  };
  content.addEventListener("transitionend", (event) => {
    if (event.target === content && offset === 0) rest();
  });
  action.addEventListener("click", commit);
  wrap.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" || event.target === action || event.target.closest(".drag-handle")) return;
    start = { x: event.clientX, y: event.clientY, from: offset, id: event.pointerId };
    dragging = false;
  });
  wrap.addEventListener("pointermove", (event) => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!dragging) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) start = null;
      if (!start || Math.abs(dx) < 10) return;
      dragging = true;
      wrap.setPointerCapture(event.pointerId);
      if (openSwipe && openSwipe.wrap !== wrap) openSwipe.close();
    }
    move(Math.min(0, start.from + dx), false);
  });
  const release = (event) => {
    if (!start || event.pointerId !== start.id) return;
    start = null;
    if (!dragging) return;
    dragging = false;
    swallow = true;
    setTimeout(() => {
      swallow = false;
    }, 0);
    if (offset < -Math.max(SWIPE_REVEAL * 2, wrap.offsetWidth * 0.55)) return commit();
    if (offset < -SWIPE_REVEAL / 2) return wrap.reveal();
    close();
  };
  wrap.addEventListener("pointerup", release);
  wrap.addEventListener("pointercancel", release);
  wrap.addEventListener(
    "click",
    (event) => {
      if (event.target === action) return;
      if (swallow || offset !== 0) {
        event.preventDefault();
        event.stopPropagation();
        if (!swallow) close();
      }
    },
    true
  );
  return wrap;
}

function edgeFade(strip) {
  const edges = () => {
    strip.classList.toggle("more-start", strip.scrollLeft > 1);
    strip.classList.toggle("more-end", strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1);
  };
  strip.addEventListener("scroll", edges, { passive: true });
  new ResizeObserver(edges).observe(strip);
  return strip;
}

export function chipStrip(chips) {
  const strip = el("div", { class: "chips" }, chips);
  requestAnimationFrame(() => {
    const pressed = strip.querySelector(".chip.on");
    if (!pressed) return;
    const over = pressed.getBoundingClientRect().right - strip.getBoundingClientRect().right;
    if (over > 0) strip.scrollLeft += over + 32;
  });
  return edgeFade(strip);
}

export function toast(message) {
  const host = document.getElementById("toast-host");
  const node = el("div", { class: "toast", text: message });
  if (host.matches(":popover-open")) host.hidePopover();
  host.append(node);
  host.showPopover();
  const drop = () => {
    node.remove();
    if (!host.children.length && host.matches(":popover-open")) host.hidePopover();
  };
  setTimeout(() => {
    node.classList.add("leaving");
    node.addEventListener("transitionend", drop, { once: true });
    setTimeout(drop, 600);
  }, 2200);
}

let lockedAt = null;

function lockPage(app) {
  if (lockedAt !== null) return;
  const box = app.getBoundingClientRect();
  lockedAt = scrollY;
  document.documentElement.classList.add("locked");
  Object.assign(app.style, { position: "fixed", top: `${box.top}px`, left: `${box.left}px`, width: `${box.width}px` });
}

function unlockPage(app) {
  if (lockedAt === null) return;
  const top = lockedAt;
  lockedAt = null;
  for (const property of ["position", "top", "left", "width"]) app.style.removeProperty(property);
  document.documentElement.classList.remove("locked");
  scrollTo({ top, behavior: "instant" });
}

function dragToClose(sheet, close) {
  let drag = null;
  const settle = () => {
    sheet.style.removeProperty("transition");
    sheet.style.removeProperty("transform");
  };
  sheet.addEventListener(
    "touchstart",
    (event) => {
      drag = event.touches.length === 1 && !event.target.closest("textarea") ? { y: event.touches[0].clientY, dy: 0, v: 0, at: event.timeStamp, active: false } : null;
    },
    { passive: true }
  );
  sheet.addEventListener(
    "touchmove",
    (event) => {
      if (!drag) return;
      const dy = event.touches[0].clientY - drag.y;
      if (!drag.active) {
        if (sheet.scrollTop > 0 || dy < -6) drag = null;
        if (!drag || dy < 6) return;
        drag.active = true;
        sheet.style.transition = "none";
      }
      event.preventDefault();
      const next = Math.max(0, dy);
      drag.v = (next - drag.dy) / Math.max(1, event.timeStamp - drag.at);
      drag.at = event.timeStamp;
      drag.dy = next;
      sheet.style.transform = `translateY(${next}px)`;
    },
    { passive: false }
  );
  const release = (event) => {
    const flick = drag && drag.v > 0.5 && event.timeStamp - drag.at < 100;
    const done = drag && drag.active && (drag.dy > Math.min(sheet.offsetHeight / 2, 200) || flick);
    const moved = drag && drag.active;
    drag = null;
    if (!moved) return;
    settle();
    if (done) close();
  };
  sheet.addEventListener("touchend", release);
  sheet.addEventListener("touchcancel", () => {
    if (drag && drag.active) settle();
    drag = null;
  });
}

export function openSheet(build, onClose, focusAlways = false) {
  const host = document.getElementById("sheet-host");
  const app = document.getElementById("app");
  const sheet = el("div", { class: "sheet" }, el("div", { class: "sheet-grabber" }));
  const dialog = el("dialog", { class: "sheet-backdrop", tabIndex: -1 }, sheet);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    dialog.classList.add("closing");
    const finish = () => {
      if (!dialog.isConnected) return;
      dialog.close();
      dialog.remove();
    };
    sheet.addEventListener("transitionend", (event) => {
      if (event.target === sheet) finish();
    });
    setTimeout(finish, 700);
    if (!host.querySelector(".sheet-backdrop:not(.closing)")) unlockPage(app);
    if (onClose) onClose();
  };
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("close", close);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  dragToClose(sheet, close);
  append(sheet, build(close));
  const field = sheet.querySelector("input, select, textarea");
  host.append(dialog);
  lockPage(app);
  dialog.showModal();
  (field && (focusAlways || !matchMedia("(pointer: coarse)").matches) ? field : dialog).focus();
  return close;
}

function menuItem(item, close) {
  const content = [
    item.icon ? icon(item.icon) : null,
    el("span", { class: "menu-label" }, [el("span", { text: item.label }), item.detail ? el("span", { class: "menu-detail", text: item.detail }) : null])
  ];
  if (item.options) {
    const chevron = icon("chevron");
    chevron.classList.add("menu-chevron");
    return el("label", { class: "menu-item more" }, [
      ...content,
      chevron,
      el(
        "select",
        { class: "menu-select", onchange: (event) => close(() => item.onSelect(event.target.value)) },
        item.options.map((option) => el("option", option))
      )
    ]);
  }
  const classes = ["menu-item", item.icon ? null : "plain", item.danger ? "danger" : null].filter(Boolean).join(" ");
  return el("button", { class: classes, type: "button", disabled: item.disabled, onclick: () => close(item.onSelect) }, content);
}

const rootLength = (name) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;

export function popMenu(anchor, sections, { title, message, onClose, cover = true } = {}) {
  const host = document.getElementById("sheet-host");
  const box = anchor.getBoundingClientRect();
  const dialog = el("dialog", { class: "menu-backdrop", tabIndex: -1 });
  let closed = false;
  const close = (after) => {
    if (closed) return;
    closed = true;
    dialog.classList.add("closing");
    anchor.classList.remove("menu-anchor");
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      dialog.close();
      dialog.remove();
      if (after) after();
      if (onClose) onClose();
    };
    menu.addEventListener("transitionend", (event) => {
      if (event.target === menu) finish();
    });
    setTimeout(finish, 400);
  };
  const menu = el("div", { class: "menu" }, [
    title ? el("div", { class: "menu-head" }, [el("strong", { text: title }), message ? el("span", { text: message }) : null]) : null,
    ...sections.map((items) => el("div", { class: "menu-section" }, items.map((item) => menuItem(item, close))))
  ]);
  const width = document.documentElement.clientWidth;
  if (box.left + box.width / 2 < width / 2) {
    menu.style.left = `${box.left}px`;
    menu.classList.add("from-left");
  } else {
    menu.style.right = `${width - box.right}px`;
  }
  dialog.append(menu);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("pointerdown", (event) => {
    if (event.target === dialog) close();
  });
  host.append(dialog);
  if (cover) anchor.classList.add("menu-anchor");
  dialog.showModal();
  dialog.focus();
  const top = cover ? box.top : box.bottom + 8;
  const bottom = cover ? box.bottom : box.top - 8;
  const below = innerHeight - rootLength("--tabbar") - 8 - top;
  const above = bottom - rootLength("--topbar") - 8;
  if (menu.offsetHeight > below && above > below) {
    menu.style.bottom = `${innerHeight - bottom}px`;
    menu.classList.add("from-bottom");
  } else {
    menu.style.top = `${top}px`;
  }
}

export function confirmAction(anchor, title, message, label, destructive = true) {
  return new Promise((resolve) => {
    popMenu(anchor, [[{ icon: destructive ? "trash" : null, label, danger: destructive, onSelect: () => resolve(true) }]], {
      title,
      message,
      cover: false,
      onClose: () => resolve(false)
    });
  });
}

export function sheetBar(title, close, done) {
  return el("div", { class: "sheet-bar" }, [
    close ? el("button", { class: "bar-btn", type: "button", onclick: close }, icon("close")) : el("span"),
    el("h2", { text: title }),
    done || el("span")
  ]);
}

export const checkButton = (props) => el("button", { class: "bar-btn primary", type: "submit", ...props }, icon("check"));

export function promptSheet(title, value, options = {}) {
  return new Promise((resolve) => {
    let answer = null;
    openSheet(
      (close) => {
        const done = checkButton();
        const field = options.multiline
          ? el("textarea", { value: value || "", placeholder: options.placeholder })
          : el("input", { type: "text", autocomplete: "off", value: value || "", placeholder: options.placeholder, enterKeyHint: "done" });
        const initial = (value || "").trim();
        const check = () => {
          const next = field.value.trim();
          done.disabled = next === initial || (options.required && !next) || Boolean(options.invalid && options.invalid(next));
        };
        field.addEventListener("input", check);
        check();
        return el("form", {
          onsubmit: (event) => {
            event.preventDefault();
            if (done.disabled) return;
            answer = field.value.trim();
            close();
          }
        }, [sheetBar(title, close, done), field]);
      },
      () => resolve(answer),
      true
    );
  });
}
