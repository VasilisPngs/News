const LIMIT = 8;
const seen = new Set();
let sent = 0;

export function report(kind, message, detail) {
  const text = String(message == null ? "" : message).slice(0, 300).trim();
  if (!text || sent >= LIMIT) return;
  const key = `${kind}|${text}`;
  if (seen.has(key)) return;
  seen.add(key);
  sent += 1;
  const body = JSON.stringify({
    kind,
    message: text,
    stack: String(detail || "").slice(0, 1000),
    route: location.pathname
  });
  if (navigator.sendBeacon("/api/report", new Blob([body], { type: "application/json" }))) return;
  fetch("/api/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true
  }).catch(() => {});
}

addEventListener(
  "error",
  (event) => {
    const target = event.target;
    if (target && target !== globalThis && target.tagName) {
      const source = target.currentSrc || target.src || target.href || "";
      if (source && new URL(source, location.href).origin !== location.origin) return;
      report("resource", `${target.tagName.toLowerCase()} failed to load`, source);
      return;
    }
    if (!event.error && /^ResizeObserver loop/.test(event.message || "")) return;
    if (event.error) report("error", event.error.message, event.error.stack);
    else report("error", event.message, `${event.filename}:${event.lineno}`);
  },
  true
);

addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  report("rejection", reason && reason.message ? reason.message : String(reason), reason && reason.stack);
});
