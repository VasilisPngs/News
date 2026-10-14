import { readLocal, writeLocal } from "./storage.js";

const STORAGE_KEY = "news.theme";
const MODES = ["system", "light", "dark"];
const COLORS = { light: "#f2f2f7", dark: "#000000" };

const query = matchMedia("(prefers-color-scheme: light)");

function detect() {
  const stored = readLocal(STORAGE_KEY);
  return MODES.includes(stored) ? stored : "system";
}

let current = detect();

export const themeMode = () => current;
export const themeModes = () => [...MODES];
const resolvedTheme = () => (current === "system" ? (query.matches ? "light" : "dark") : current);

let applied = false;

export function applyTheme() {
  const root = document.documentElement;
  if (current === "system") root.removeAttribute("data-theme");
  else root.dataset.theme = current;
  for (const stale of document.head.querySelectorAll('meta[name="theme-color"][media]')) stale.remove();
  let meta = document.head.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
  }
  meta.content = COLORS[resolvedTheme()];
  if (applied || current !== "system") window.retint();
  applied = true;
}

export function setTheme(next) {
  if (!MODES.includes(next) || next === current) return;
  current = next;
  writeLocal(STORAGE_KEY, next);
  applyTheme();
}

query.addEventListener("change", () => {
  if (current === "system") applyTheme();
});
