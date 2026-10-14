const MAX_ITEMS = 40;
const HOUR_MS = 3600000;
const SKEW_LIMIT_MS = 3 * HOUR_MS;
const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 2_000_000;
const AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const FEED_TYPES = /application\/(rss|atom)\+xml|application\/feed\+json/i;
const GUESSES = ["/feed", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml", "/feed/"];

function entities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? match;
    const point = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return point > 0 && point < 0x110000 ? String.fromCodePoint(point) : match;
  });
}

export function clean(value) {
  if (!value) return "";
  const raw = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return entities(entities(raw).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

const escape = (name) => name.replace(":", "\\:");

function tag(block, name) {
  const match = block.match(new RegExp(`<${escape(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escape(name)}>`, "i"));
  return match ? match[1] : "";
}

function attribute(element, name) {
  const match = element.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return match ? entities(match[2] ?? match[3] ?? "") : "";
}

function blocks(text, name) {
  const pattern = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "gi");
  const found = [];
  let match;
  while (found.length < MAX_ITEMS && (match = pattern.exec(text))) found.push(match[1]);
  return found;
}

function absolute(link, base) {
  try {
    const url = new URL(link, base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function time(value, fallback) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function atomLink(entry) {
  const links = entry.match(/<link\b[^>]*>/gi) || [];
  const preferred = links.find((link) => !/\srel\s*=/i.test(link) || /\srel\s*=\s*["']alternate["']/i.test(link));
  return attribute(preferred || links[0] || "", "href");
}

export const looksLikeFeed = (text) => /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<(rss|feed|rdf:RDF)\b/i.test(text.slice(0, 2000));

export function parseFeed(text, base, now = Date.now()) {
  const atom = /<feed\b/i.test(text.slice(0, 2000)) && !/<rss\b/i.test(text.slice(0, 2000));
  const first = text.search(atom ? /<entry\b/i : /<item\b/i);
  const head = text.slice(0, first > 0 ? first : 5000);
  const title = clean(tag(head, "title"));
  const site = absolute(atom ? atomLink(head) : clean(tag(head, "link")), base);
  const items = [];
  for (const block of blocks(text, atom ? "entry" : "item")) {
    const source = block.match(/<source\b[^>]*>([\s\S]*?)<\/source>/i);
    const sourceName = source ? clean(source[1]) : "";
    let heading = clean(tag(block, "title"));
    if (sourceName && heading.endsWith(` - ${sourceName}`)) heading = heading.slice(0, -sourceName.length - 3).trim();
    const link = absolute(atom ? atomLink(block) : clean(tag(block, "link")) || clean(tag(block, "guid")), base);
    if (!heading || !link) continue;
    const stamp = atom ? tag(block, "published") || tag(block, "updated") : tag(block, "pubDate") || tag(block, "dc:date");
    items.push({ title: heading.slice(0, 300), url: link, source: sourceName.slice(0, 80), published: time(clean(stamp), now) });
  }
  const ahead = Math.max(0, ...items.map((item) => item.published - now));
  const shift = ahead > 60000 && ahead <= SKEW_LIMIT_MS ? Math.ceil(ahead / HOUR_MS) * HOUR_MS : 0;
  for (const item of items) item.published = Math.min(item.published - shift, now);
  return { title: title.slice(0, 80), site, items };
}

export function newsUrl(query, lang) {
  const q = encodeURIComponent(`${query} when:2d`);
  return lang === "el" ? `https://news.google.com/rss/search?q=${q}&hl=el&gl=GR&ceid=GR:el` : `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

const GOOGLE_CONSENT = "CONSENT=YES+cb; SOCS=CAI";

export async function download(url, headers = {}) {
  const extra = new URL(url).hostname === "news.google.com" ? { cookie: GOOGLE_CONSENT } : {};
  const response = await fetch(url, {
    headers: { "user-agent": AGENT, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5", ...extra, ...headers },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (response.status === 304) return { status: 304, text: "", url: response.url || url };
  const length = Number(response.headers.get("content-length"));
  if (!response.ok || length > MAX_BYTES) {
    await response.body?.cancel();
    return { status: response.status || 502, text: "", url: response.url || url };
  }
  const text = (await response.text()).slice(0, MAX_BYTES);
  return { status: response.status, text, url: response.url || url, etag: response.headers.get("etag"), modified: response.headers.get("last-modified") };
}

function alternates(html, base) {
  const head = html.slice(0, Math.max(html.search(/<\/head>/i), 0) || 200000);
  const found = [];
  for (const element of head.match(/<link\b[^>]*>/gi) || []) {
    if (!/\srel\s*=\s*["']?[^"'>]*alternate/i.test(element) || !FEED_TYPES.test(attribute(element, "type"))) continue;
    const href = absolute(attribute(element, "href"), base);
    if (href) found.push(href);
  }
  return found;
}

export function normalizeSite(input) {
  const text = String(input || "").trim();
  if (!text || text.length > 500) return "";
  return absolute(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`, undefined);
}

function siteName(html) {
  const head = html.slice(0, 200000);
  for (const element of head.match(/<meta\b[^>]*>/gi) || []) {
    if (/\s(property|name)\s*=\s*["']og:site_name["']/i.test(element)) return clean(attribute(element, "content"));
  }
  return "";
}

const tidy = (title) => title.replace(/\s*[-–|:·]?\s*\b(rss|atom|feeds?)\b\s*[-–|:·]?\s*/gi, " ").trim();

async function tryFeed(url) {
  try {
    const page = await download(url);
    if (page.status !== 200 || !looksLikeFeed(page.text)) return null;
    const parsed = parseFeed(page.text, page.url);
    return parsed.items.length ? { feed: page.url, ...parsed } : null;
  } catch {
    return null;
  }
}

export async function discover(input) {
  const start = normalizeSite(input);
  if (!start) return null;
  let page;
  try {
    page = await download(start);
  } catch {
    return null;
  }
  if (page.status === 200 && looksLikeFeed(page.text)) {
    const parsed = parseFeed(page.text, page.url);
    if (parsed.items.length) return { feed: page.url, ...parsed, title: tidy(parsed.title) };
  }
  const origin = new URL(page.url || start).origin;
  const candidates = page.status === 200 ? alternates(page.text, page.url) : [];
  for (const guess of GUESSES) candidates.push(`${origin}${guess}`);
  const named = page.status === 200 ? siteName(page.text) : "";
  const pageTitle = page.status === 200 ? clean(tag(page.text.slice(0, 200000), "title")) : "";
  for (const candidate of [...new Set(candidates)].slice(0, 8)) {
    const found = await tryFeed(candidate);
    if (found) return { ...found, title: named || tidy(found.title) || pageTitle, site: found.site || origin };
  }
  return null;
}
