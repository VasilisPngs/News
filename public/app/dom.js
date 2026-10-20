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

function svg(tag, props = {}, children = []) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(props)) node.setAttribute(key, value);
  for (const child of [].concat(children)) node.append(child);
  return node;
}

const ICONS = {
  check: "m382-354 339-339q12-12 28-12t28 12q12 12 12 28.5T777-636L410-268q-12 12-28 12t-28-12L182-440q-12-12-11.5-28.5T183-497q12-12 28.5-12t28.5 12l142 143Z",
  add: "M440-440H240q-17 0-28.5-11.5T200-480q0-17 11.5-28.5T240-520h200v-200q0-17 11.5-28.5T480-760q17 0 28.5 11.5T520-720v200h200q17 0 28.5 11.5T760-480q0 17-11.5 28.5T720-440H520v200q0 17-11.5 28.5T480-200q-17 0-28.5-11.5T440-240v-200Z",
  chevron: "M504-480 348-636q-11-11-11-28t11-28q11-11 28-11t28 11l184 184q6 6 8.5 13t2.5 15q0 8-2.5 15t-8.5 13L404-268q-11 11-28 11t-28-11q-11-11-11-28t11-28l156-156Z",
  back: "m313-440 196 196q12 12 11.5 28T508-188q-12 11-28 11.5T452-188L188-452q-6-6-8.5-13t-2.5-15q0-8 2.5-15t8.5-13l264-264q11-11 27.5-11t28.5 11q12 12 12 28.5T508-715L313-520h447q17 0 28.5 11.5T800-480q0 17-11.5 28.5T760-440H313Z",
  trash: "M280-120q-33 0-56.5-23.5T200-200v-520q-17 0-28.5-11.5T160-760q0-17 11.5-28.5T200-800h160q0-17 11.5-28.5T400-840h160q17 0 28.5 11.5T600-800h160q17 0 28.5 11.5T800-760q0 17-11.5 28.5T760-720v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM428.5-291.5Q440-303 440-320v-280q0-17-11.5-28.5T400-640q-17 0-28.5 11.5T360-600v280q0 17 11.5 28.5T400-280q17 0 28.5-11.5Zm160 0Q600-303 600-320v-280q0-17-11.5-28.5T560-640q-17 0-28.5 11.5T520-600v280q0 17 11.5 28.5T560-280q17 0 28.5-11.5ZM280-720v520-520Z",
  grip: "M200-360q-17 0-28.5-11.5T160-400q0-17 11.5-28.5T200-440h560q17 0 28.5 11.5T800-400q0 17-11.5 28.5T760-360H200Zm0-160q-17 0-28.5-11.5T160-560q0-17 11.5-28.5T200-600h560q17 0 28.5 11.5T800-560q0 17-11.5 28.5T760-520H200Z",
  bookmark: "m480-240-168 72q-40 17-76-6.5T200-241v-519q0-33 23.5-56.5T280-840h400q33 0 56.5 23.5T760-760v519q0 43-36 66.5t-76 6.5l-168-72Zm0-88 200 86v-518H280v518l200-86Zm0-432H280h400-200Z",
  bookmarkFilled: "m480-240-168 72q-40 17-76-6.5T200-241v-519q0-33 23.5-56.5T280-840h400q33 0 56.5 23.5T760-760v519q0 43-36 66.5t-76 6.5l-168-72Z",
  sparkles: "m706-706-70-32q-6-3-8.5-8t-2.5-10q0-5 2.5-10t8.5-8l70-32 32-70q3-6 8-9t10-3q5 0 10 3t8 9l32 70 70 32q6 3 9 8t3 10q0 5-3 10t-9 8l-70 32-32 70q-3 6-8 8.5t-10 2.5q-5 0-10-2.5t-8-8.5l-32-70ZM260-380l-160-73q-9-4-13-11.5T83-480q0-8 4-15.5t13-11.5l160-73 73-160q4-9 11.5-13t15.5-4q8 0 15.5 4t11.5 13l73 160 160 73q9 4 13 11.5t4 15.5q0 8-4 15.5T620-453l-160 73-73 160q-4 9-11.5 13t-15.5 4q-8 0-15.5-4T333-220l-73-160Zm100 26 40-86 86-40-86-40-40-86-40 86-86 40 86 40 40 86Zm350 204-70-32q-6-3-9-8t-3-10q0-5 3-10t9-8l70-32 32-70q3-6 8-9t10-3q5 0 10 3t8 9l32 70 70 32q6 3 9 8t3 10q0 5-3 10t-9 8l-70 32-32 70q-3 6-8 9t-10 3q-5 0-10-3t-8-9l-32-70ZM360-480Z",
  news: "M160-120q-33 0-56.5-23.5T80-200v-560q0-33 23.5-56.5T160-840h640q33 0 56.5 23.5T880-760v560q0 33-23.5 56.5T800-120H160Zm0-80h640v-560H160v560Zm120-80h400q17 0 28.5-11.5T720-320q0-17-11.5-28.5T680-360H280q-17 0-28.5 11.5T240-320q0 17 11.5 28.5T280-280Zm0-160h80q17 0 28.5-11.5T400-480v-160q0-17-11.5-28.5T360-680h-80q-17 0-28.5 11.5T240-640v160q0 17 11.5 28.5T280-440Zm240 0h160q17 0 28.5-11.5T720-480q0-17-11.5-28.5T680-520H520q-17 0-28.5 11.5T480-480q0 17 11.5 28.5T520-440Zm0-160h160q17 0 28.5-11.5T720-640q0-17-11.5-28.5T680-680H520q-17 0-28.5 11.5T480-640q0 17 11.5 28.5T520-600ZM160-200v-560 560Z",
  thumbDown: "M120-320q-32 0-56-24t-24-56v-80q0-7 2-15t4-15l120-282q9-20 30-34t44-14h440v520L440-82q-15 15-35.5 17.5T365-72q-19-10-28-28t-4-37l45-183H120Zm480-34v-406H240L120-480v80h360l-54 220 174-174Zm200-486q33 0 56.5 23.5T880-760v360q0 33-23.5 56.5T800-320H680v-80h120v-360H680v-80h120Zm-200 80v406-406Z",
  bookmarkRemove: "M640-680q-17 0-28.5-11.5T600-720q0-17 11.5-28.5T640-760h160q17 0 28.5 11.5T840-720q0 17-11.5 28.5T800-680H640ZM480-240l-168 72q-40 17-76-6.5T200-241v-519q0-33 23.5-56.5T280-840h200q17 0 28.5 11.5T520-800q0 17-11.5 28.5T480-760H280v518l200-86 200 86v-238q0-17 11.5-28.5T720-520q17 0 28.5 11.5T760-480v239q0 43-36 66.5t-76 6.5l-168-72Zm0-520H280h240-40Z"
};

export function icon(name) {
  return svg("svg", { class: "icon", viewBox: "0 -960 960 960", "data-icon": name }, svg("path", { d: ICONS[name] }));
}

export const iconButton = (name, onClick, props = {}) => el("button", { class: "icon-btn", type: "button", onclick: onClick, ...props }, icon(name));

const TAU = Math.PI * 2;
const POINTS = 96;
const SIZE = 48;
const RADIUS = 19;
const MORPH_MS = 650;
const TURN_MS = 4666;

const wave = (count, depth, power) => (angle) => 1 - depth * ((1 - Math.cos(count * angle)) / 2) ** power;
const polygon = (count, round) => (angle) => {
  const step = TAU / count;
  const local = (((angle % step) + step) % step) - step / 2;
  const radius = Math.cos(Math.PI / count) / Math.cos(local);
  return radius + (1 - radius) * round;
};
const oval = (ratio, power, tilt) => (angle) => {
  const x = Math.abs(Math.cos(angle - tilt));
  const y = Math.abs(Math.sin(angle - tilt)) / ratio;
  return (x ** power + y ** power) ** (-1 / power);
};
const circle = () => 1;

const SEQUENCE = [wave(10, 0.3, 0.6), wave(9, 0.12, 1.6), polygon(5, 0.2), oval(0.58, 3.2, Math.PI / 4), wave(8, 0.14, 0.7), wave(4, 0.2, 1.8), oval(0.72, 2, -Math.PI / 4)];

function settle(seconds) {
  const omega = Math.sqrt(200);
  const decay = 0.6 * omega;
  const damped = omega * 0.8;
  return 1 - Math.exp(-decay * seconds) * (Math.cos(damped * seconds) + (decay / damped) * Math.sin(damped * seconds));
}

function outline(from, to, progress, turn) {
  let d = "";
  for (let index = 0; index < POINTS; index += 1) {
    const angle = (index / POINTS) * TAU;
    const radius = RADIUS * Math.max(0, from(angle) + (to(angle) - from(angle)) * progress);
    const x = SIZE / 2 + radius * Math.cos(angle + turn);
    const y = SIZE / 2 + radius * Math.sin(angle + turn);
    d += `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d}Z`;
}

export function loadingIndicator({ contained = false, determinate = false } = {}) {
  const path = svg("path");
  const node = el("div", { class: contained ? "loading-indicator contained" : "loading-indicator" }, svg("svg", { viewBox: `0 0 ${SIZE} ${SIZE}` }, path));
  let frame = 0;
  let started = 0;
  const draw = (now) => {
    frame = 0;
    if (!node.isConnected && started) return;
    if (!started) started = now;
    const elapsed = now - started;
    const step = Math.floor(elapsed / MORPH_MS);
    const progress = settle((elapsed % MORPH_MS) / 1000);
    const turn = ((step + progress) * TAU) / 4 + (elapsed / TURN_MS) * TAU;
    path.setAttribute("d", outline(SEQUENCE[step % SEQUENCE.length], SEQUENCE[(step + 1) % SEQUENCE.length], progress, turn));
    frame = requestAnimationFrame(draw);
  };
  node.progress = (value) => {
    const amount = Math.min(1, Math.max(0, value));
    path.setAttribute("d", outline(circle, SEQUENCE[0], amount, (-amount * Math.PI) + Math.PI / 10));
  };
  node.spin = () => {
    if (frame) return;
    started = 0;
    frame = requestAnimationFrame(draw);
  };
  node.stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  if (determinate) node.progress(0);
  else node.spin();
  return node;
}

export const loading = () => el("div", { class: "loading" }, loadingIndicator());

export function sortable(list, onSort) {
  list.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest(".drag-handle");
    if (!handle || event.button > 0) return;
    event.preventDefault();
    const rows = [...list.children];
    const row = rows.find((child) => child.contains(handle));
    const from = rows.indexOf(row);
    const step = row.offsetHeight + parseFloat(getComputedStyle(list).rowGap || 0);
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
      });
    };
    const edge = () => {
      const top = rootLength("--topbar") + step;
      const bottom = innerHeight - rootLength("--navbar") - step;
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
      for (const other of rows) if (other !== row) other.style.removeProperty("transform");
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
      }, 360);
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

export function switchInput(checked, onChange) {
  return el("input", { type: "checkbox", class: "switch", checked, onchange: (event) => onChange(event.target.checked) });
}

const DISMISS_DISTANCE = 56;
const DISMISS_VELOCITY = 125;

export function swipeAction(content, symbol, onAction) {
  const wrap = el("div", { class: "swipe" }, [el("div", { class: "swipe-background" }, icon(symbol)), content]);
  let offset = 0;
  let start = null;
  let dragging = false;
  let swallow = false;
  let samples = [];
  const rest = () => {
    wrap.classList.remove("swiping");
    wrap.dispatchEvent(new Event("swipeend", { bubbles: true }));
  };
  const move = (x, animate) => {
    const from = offset;
    offset = x;
    content.style.transition = animate ? "" : "none";
    content.style.transform = x ? `translateX(${x}px)` : "";
    wrap.classList.toggle("armed", x <= -DISMISS_DISTANCE);
    if (x !== 0 || !animate) wrap.classList.add("swiping");
    else if (from === 0) rest();
  };
  const dismiss = async () => {
    move(-wrap.offsetWidth, true);
    const collapse = wrap.animate([{ height: `${wrap.offsetHeight}px`, opacity: 1 }, { height: "0px", opacity: 0 }], {
      duration: 300,
      delay: 120,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
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
  wrap.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" || offset !== 0) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
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
      samples = [];
      wrap.setPointerCapture(event.pointerId);
    }
    samples.push({ x: event.clientX, t: event.timeStamp });
    while (samples.length > 2 && event.timeStamp - samples[0].t > 100) samples.shift();
    move(Math.min(0, dx), false);
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
    const first = samples[0];
    const last = samples[samples.length - 1];
    const speed = last && last.t > first.t ? ((last.x - first.x) / (last.t - first.t)) * 1000 : 0;
    samples = [];
    if (event.type === "pointerup" && (speed <= -DISMISS_VELOCITY || (speed < DISMISS_VELOCITY && offset <= -DISMISS_DISTANCE))) return dismiss();
    move(0, true);
  };
  wrap.addEventListener("pointerup", release);
  wrap.addEventListener("pointercancel", release);
  wrap.addEventListener(
    "click",
    (event) => {
      if (!swallow && offset === 0) return;
      event.preventDefault();
      event.stopPropagation();
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

export const filterChip = (label, selected, onClick) => el("button", { class: selected ? "chip on" : "chip", type: "button", onclick: onClick }, [selected ? icon("check") : null, label]);

export const assistChip = (label, onClick) => el("button", { class: "chip assist", type: "button", onclick: onClick }, [icon("add"), label]);

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

export function snackbar(message) {
  const host = document.getElementById("snackbar-host");
  const node = el("div", { class: "snackbar", text: message });
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
  }, 4000);
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

const rootLength = (name) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;

function openDialog(build, onClose) {
  const host = document.getElementById("dialog-host");
  const app = document.getElementById("app");
  const dialog = el("dialog", { class: "dialog", tabIndex: -1 });
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
    dialog.addEventListener("transitionend", (event) => {
      if (event.target === dialog) finish();
    });
    setTimeout(finish, 400);
    if (!host.querySelector(".dialog:not(.closing)")) unlockPage(app);
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
  append(dialog, build(close));
  host.append(dialog);
  lockPage(app);
  dialog.showModal();
  const field = dialog.querySelector("input:not([type=radio])");
  (field || dialog).focus();
  return close;
}

const dialogActions = (buttons) => el("div", { class: "dialog-actions" }, buttons);

const textButton = (label, props = {}) => el("button", { class: "btn text", type: "button", text: label, ...props });

export function promptDialog(title, value, { label, hint, action, cancel, required, invalid } = {}) {
  return new Promise((resolve) => {
    let answer = null;
    openDialog(
      (close) => {
        const done = textButton(action, { type: "submit" });
        const input = el("input", { type: "text", autocomplete: "off", value: value || "", placeholder: hint || " ", enterKeyHint: "done" });
        const initial = (value || "").trim();
        const check = () => {
          const next = input.value.trim();
          done.disabled = next === initial || (required && !next) || Boolean(invalid && invalid(next));
        };
        input.addEventListener("input", check);
        check();
        return el(
          "form",
          {
            onsubmit: (event) => {
              event.preventDefault();
              if (done.disabled) return;
              answer = input.value.trim();
              close();
            }
          },
          [el("h2", { text: title }), el("label", { class: "field" }, [input, el("span", { text: label })]), dialogActions([textButton(cancel, { onclick: close }), done])]
        );
      },
      () => resolve(answer)
    );
  });
}

export function confirmDialog(title, message, action, cancel) {
  return new Promise((resolve) => {
    let answer = false;
    openDialog(
      (close) => [
        el("h2", { text: title }),
        el("p", { text: message }),
        dialogActions([
          textButton(cancel, { onclick: close }),
          textButton(action, {
            onclick: () => {
              answer = true;
              close();
            }
          })
        ])
      ],
      () => resolve(answer)
    );
  });
}

export function chooseDialog(title, options, current) {
  return new Promise((resolve) => {
    let answer = null;
    openDialog(
      (close) => [
        el("h2", { text: title }),
        el(
          "div",
          { class: "choices" },
          options.map((option) =>
            el("label", { class: "choice" }, [
              el("input", {
                type: "radio",
                class: "radio",
                name: "choice",
                checked: option.value === current,
                onchange: () => {
                  answer = option.value;
                  setTimeout(close, 150);
                }
              }),
              el("span", { text: option.label })
            ])
          )
        )
      ],
      () => resolve(answer)
    );
  });
}
