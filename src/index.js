import { checkAccess } from "./access.js";
import { parseFeed, newsUrl, download, discover, looksLikeFeed } from "./feeds.js";
import { quantize, encodeVector, decodeVector, encodeProfile, decodeProfile, learn, affinity, tokens, sameStory } from "./rank.js";
import { createKey, publicKey, pushEndpoint, keyLength, sendPush } from "./push.js";

const EMBED_MODEL = "@cf/baai/bge-m3";
const TRANSLATE_MODEL = "@cf/meta/m2m100-1.2b";
const EMBED_BATCH = 32;
const FEEDS_PER_RUN = 4;
const TOPIC_INTERVAL_MS = 15 * 60000;
const SOURCE_INTERVAL_MS = 20 * 60000;
const MAX_BACKOFF = 4;
const WINDOW_MS = 48 * 3600000;
const STORY_SCAN = 600;
const TOPIC_RETENTION_MS = 3 * 86400000;
const SOURCE_RETENTION_MS = 14 * 86400000;
const ERROR_RETENTION_MS = 30 * 86400000;
const FOR_YOU_LIMIT = 60;
const SOURCES_LIMIT = 120;
const NOTIFY_DAILY = 3;
const NOTIFY_COVERAGE = 4;
const NOTIFY_SPAN_MS = 12 * 3600000;
const NOTIFY_FRESH_MS = 6 * 3600000;
const NOTIFY_PERCENTILE = 0.7;
const NAME_MAX = 60;
const MAX_PARAMS = 90;
const WEIGHTS = { open: 1, save: 1, less: -1.5 };

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY, name TEXT NOT NULL, query_en TEXT NOT NULL, vector TEXT, position INTEGER NOT NULL, created_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, title TEXT NOT NULL, site TEXT NOT NULL, feed TEXT NOT NULL UNIQUE, position INTEGER NOT NULL, created_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS feeds (url TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, lang TEXT, fetched_at INTEGER NOT NULL DEFAULT 0, etag TEXT, modified TEXT, failures INTEGER NOT NULL DEFAULT 0)",
  "CREATE INDEX IF NOT EXISTS feeds_owner ON feeds (owner)",
  "CREATE TABLE IF NOT EXISTS articles (id TEXT PRIMARY KEY, kind TEXT NOT NULL, owner TEXT NOT NULL, story TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, source TEXT NOT NULL, lang TEXT, published_at INTEGER NOT NULL, seen_at INTEGER NOT NULL, tokens TEXT NOT NULL, vector TEXT, affinity REAL NOT NULL DEFAULT 0, opened_at INTEGER, hidden_at INTEGER, saved_at INTEGER, notified_at INTEGER)",
  "CREATE INDEX IF NOT EXISTS articles_kind_time ON articles (kind, published_at)",
  "CREATE INDEX IF NOT EXISTS articles_story ON articles (story)",
  "CREATE INDEX IF NOT EXISTS articles_owner ON articles (owner)",
  "CREATE INDEX IF NOT EXISTS articles_saved ON articles (saved_at)",
  "CREATE TABLE IF NOT EXISTS subscriptions (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS errors (at INTEGER NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL, stack TEXT, route TEXT, agent TEXT)"
];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const readJson = async (request) => (await request.json().catch(() => null)) || {};

const cleanName = (value) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);

const sameName = (a, b) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

const athensDay = (time) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(time);

const slots = (count, from = 1) => Array.from({ length: count }, (_, index) => `?${index + from}`).join(", ");

function chunks(list, size) {
  const out = [];
  for (let start = 0; start < list.length; start += size) out.push(list.slice(start, start + size));
  return out;
}

const ready = new WeakMap();

function prepare(env) {
  if (!ready.has(env.DB)) {
    ready.set(
      env.DB,
      env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql))).catch((error) => {
        ready.delete(env.DB);
        throw error;
      })
    );
  }
  return ready.get(env.DB);
}

async function hashId(text) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const getMeta = (env, key) => env.DB.prepare("SELECT value FROM meta WHERE key = ?1").bind(key).first("value");

const setMeta = (env, key, value) => env.DB.prepare("INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, String(value));

async function embed(env, texts) {
  if (!env.AI || texts.length === 0) return [];
  try {
    const vectors = [];
    for (const batch of chunks(texts, EMBED_BATCH)) {
      const result = await env.AI.run(EMBED_MODEL, { text: batch });
      for (const values of result.data) vectors.push(quantize(values));
    }
    return vectors;
  } catch (error) {
    console.error(JSON.stringify({ embed_failed: String(error && error.message).slice(0, 200) }));
    return [];
  }
}

async function translate(env, text) {
  if (!env.AI || !/[Ͱ-Ͽἀ-῿]/.test(text)) return text;
  for (const [source, target] of [["el", "en"], ["greek", "english"]]) {
    try {
      const result = await env.AI.run(TRANSLATE_MODEL, { text, source_lang: source, target_lang: target });
      const out = cleanName(result && result.translated_text);
      if (out && !/[Ͱ-Ͽἀ-῿]/.test(out)) return out;
    } catch {}
  }
  return text;
}

async function vapidKey(env) {
  const stored = await getMeta(env, "vapid");
  if (stored) return JSON.parse(stored);
  const created = JSON.stringify(await createKey());
  await env.DB.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('vapid', ?1)").bind(created).run();
  return JSON.parse(await getMeta(env, "vapid"));
}

async function state(env) {
  const [topics, sources, key] = await Promise.all([
    env.DB.prepare("SELECT id, name FROM topics ORDER BY position, created_at").all(),
    env.DB.prepare("SELECT id, title, site FROM sources ORDER BY position, created_at").all(),
    vapidKey(env)
  ]);
  return { topics: topics.results, sources: sources.results, pushKey: publicKey(key) };
}

const topicFeeds = (name, english) => [
  { url: newsUrl(name, "el"), lang: "el" },
  { url: newsUrl(english, "en"), lang: "en" }
];

const addFeed = (env, url, owner, kind, lang) =>
  env.DB.prepare("INSERT OR IGNORE INTO feeds (url, owner, kind, lang, fetched_at) VALUES (?1, ?2, ?3, ?4, 0)").bind(url, owner, kind, lang);

function removeOwner(env, table, id) {
  return [
    env.DB.prepare(`DELETE FROM ${table} WHERE id = ?1`).bind(id),
    env.DB.prepare("DELETE FROM feeds WHERE owner = ?1").bind(id),
    env.DB.prepare("DELETE FROM articles WHERE owner = ?1 AND saved_at IS NULL").bind(id)
  ];
}

function warm(env, ctx, owner) {
  ctx.waitUntil(refresh(env, Date.now(), { owner }).catch((error) => recordError(env, { kind: "refresh", message: String(error && error.message), route: "/warm" })));
}

async function topicsRoute(request, env, ctx) {
  const body = await readJson(request);
  if (body.action === "delete") {
    await env.DB.batch(removeOwner(env, "topics", String(body.id || "")));
    return json(await state(env));
  }
  if (body.action !== "add" && body.action !== "rename") return json({ error: "invalid_action" }, 400);
  const name = cleanName(body.name);
  if (!name) return json({ error: "invalid_name" }, 400);
  const existing = (await env.DB.prepare("SELECT id, name FROM topics").all()).results;
  const id = body.action === "add" ? crypto.randomUUID() : String(body.id || "");
  if (body.action === "rename" && !existing.some((topic) => topic.id === id)) return json({ error: "not_found" }, 404);
  if (existing.some((topic) => topic.id !== id && sameName(topic.name, name))) return json({ error: "duplicate" }, 409);
  const [english, vectors] = await Promise.all([translate(env, name), embed(env, [name])]);
  const vector = vectors[0] ? encodeVector(vectors[0]) : null;
  const statements =
    body.action === "add"
      ? [
          env.DB.prepare("INSERT INTO topics (id, name, query_en, vector, position, created_at) VALUES (?1, ?2, ?3, ?4, (SELECT COALESCE(MAX(position) + 1, 0) FROM topics), ?5)").bind(
            id,
            name,
            english,
            vector,
            Date.now()
          )
        ]
      : [
          env.DB.prepare("UPDATE topics SET name = ?2, query_en = ?3, vector = ?4 WHERE id = ?1").bind(id, name, english, vector),
          env.DB.prepare("DELETE FROM feeds WHERE owner = ?1").bind(id)
        ];
  for (const feed of topicFeeds(name, english)) statements.push(addFeed(env, feed.url, id, "topic", feed.lang));
  await env.DB.batch(statements);
  warm(env, ctx, id);
  return json(await state(env));
}

async function sourcesRoute(request, env, ctx) {
  const body = await readJson(request);
  const id = String(body.id || "");
  if (body.action === "delete") {
    await env.DB.batch(removeOwner(env, "sources", id));
    return json(await state(env));
  }
  if (body.action === "rename") {
    const title = cleanName(body.title);
    if (!title) return json({ error: "invalid_name" }, 400);
    await env.DB.prepare("UPDATE sources SET title = ?2 WHERE id = ?1").bind(id, title).run();
    return json(await state(env));
  }
  if (body.action === "order") {
    const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 200) : [];
    if (ids.length) await env.DB.batch(ids.map((value, position) => env.DB.prepare("UPDATE sources SET position = ?2 WHERE id = ?1").bind(value, position)));
    return json(await state(env));
  }
  if (body.action !== "add") return json({ error: "invalid_action" }, 400);
  const found = await discover(body.url);
  if (!found) return json({ error: "no_feed" }, 422);
  const duplicate = await env.DB.prepare("SELECT id FROM sources WHERE feed = ?1").bind(found.feed).first("id");
  if (duplicate) return json(await state(env));
  const created = crypto.randomUUID();
  const site = found.site || new URL(found.feed).origin;
  const title = cleanName(found.title) || new URL(site).hostname.replace(/^www\./, "");
  await env.DB.batch([
    env.DB.prepare("INSERT INTO sources (id, title, site, feed, position, created_at) VALUES (?1, ?2, ?3, ?4, (SELECT COALESCE(MAX(position) + 1, 0) FROM sources), ?5)").bind(
      created,
      title,
      site,
      found.feed,
      Date.now()
    ),
    addFeed(env, found.feed, created, "source", null)
  ]);
  warm(env, ctx, created);
  return json(await state(env));
}

const item = (row) => ({
  id: row.id,
  title: row.title,
  url: row.url,
  source: row.source,
  published: row.published_at,
  opened: Boolean(row.opened_at),
  saved: Boolean(row.saved_at),
  coverage: row.coverage || 1
});

async function feedRoute(request, env) {
  const body = await readJson(request);
  const now = Date.now();
  if (body.tab === "saved") {
    const rows = await env.DB.prepare(
      "SELECT a.id, a.title, a.url, COALESCE(s.title, a.source) AS source, a.published_at, a.opened_at, a.saved_at FROM articles a LEFT JOIN sources s ON s.id = a.owner WHERE a.saved_at IS NOT NULL ORDER BY a.saved_at DESC"
    ).all();
    return json({ items: rows.results.map(item) });
  }
  if (body.tab === "sources") {
    const owner = typeof body.source === "string" && body.source ? body.source : null;
    const rows = await env.DB.prepare(
      `SELECT a.id, a.title, a.url, s.title AS source, a.published_at, a.opened_at, a.saved_at FROM articles a JOIN sources s ON s.id = a.owner WHERE a.kind = 'source'${owner ? " AND a.owner = ?2" : ""} ORDER BY a.published_at DESC LIMIT ?1`
    )
      .bind(...(owner ? [SOURCES_LIMIT, owner] : [SOURCES_LIMIT]))
      .all();
    return json({ items: rows.results.map(item) });
  }
  const rows = await env.DB.prepare(
    `SELECT id, title, url, source, published_at, opened AS opened_at, saved AS saved_at, coverage FROM (
      SELECT a.id, a.title, a.url, a.source, a.published_at, a.affinity,
        MAX(a.opened_at) OVER same AS opened, MAX(a.saved_at) OVER same AS saved,
        ROW_NUMBER() OVER (PARTITION BY a.story ORDER BY a.affinity DESC, a.published_at DESC) AS place,
        (SELECT COUNT(DISTINCT b.source) FROM articles b WHERE b.story = a.story) AS coverage
      FROM articles a
      WHERE a.kind = 'topic' AND a.published_at > ?1 AND a.story NOT IN (SELECT story FROM articles WHERE hidden_at IS NOT NULL)
      WINDOW same AS (PARTITION BY a.story)
    ) WHERE place = 1
    ORDER BY affinity + MIN(coverage - 1, 5) * 0.04 - (?2 - published_at) / 43200000.0 * 0.1 DESC
    LIMIT ?3`
  )
    .bind(now - WINDOW_MS, now, FOR_YOU_LIMIT)
    .all();
  return json({ items: rows.results.map(item) });
}

async function articleRoute(request, env) {
  const body = await readJson(request);
  const row = await env.DB.prepare("SELECT id, vector, opened_at, saved_at FROM articles WHERE id = ?1").bind(String(body.id || "")).first();
  if (!row) return json({ error: "not_found" }, 404);
  const now = Date.now();
  const column = { open: "opened_at", save: "saved_at", less: "hidden_at" }[body.action];
  const statements = [];
  if (body.action === "unsave") statements.push(env.DB.prepare("UPDATE articles SET saved_at = NULL WHERE id = ?1").bind(row.id));
  else if (column) statements.push(env.DB.prepare(`UPDATE articles SET ${column} = COALESCE(${column}, ?2) WHERE id = ?1`).bind(row.id, now));
  else return json({ error: "invalid_action" }, 400);
  const repeat = (body.action === "open" && row.opened_at) || (body.action === "save" && row.saved_at);
  const vector = decodeVector(row.vector);
  if (vector && WEIGHTS[body.action] && !repeat) {
    const profile = learn(decodeProfile(await getMeta(env, "profile")), vector, WEIGHTS[body.action]);
    statements.push(setMeta(env, "profile", encodeProfile(profile)));
  }
  await env.DB.batch(statements);
  return json({ ok: true });
}

async function pushRoute(request, env) {
  const body = await readJson(request);
  if (body.action === "unsubscribe") {
    const endpoint = pushEndpoint(body.endpoint);
    if (endpoint) await env.DB.prepare("DELETE FROM subscriptions WHERE endpoint = ?1").bind(endpoint).run();
    return json({ ok: true });
  }
  if (body.action !== "subscribe") return json({ error: "invalid_action" }, 400);
  const subscription = body.subscription || {};
  const keys = subscription.keys || {};
  const endpoint = pushEndpoint(subscription.endpoint);
  if (!endpoint || keyLength(keys.p256dh) !== 65 || keyLength(keys.auth) !== 16) return json({ error: "invalid_push" }, 400);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO subscriptions (endpoint, p256dh, auth, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth").bind(
      endpoint,
      keys.p256dh,
      keys.auth,
      Date.now()
    ),
    setMeta(env, "origin", new URL(request.url).origin),
    setMeta(env, "lang", body.lang === "en" ? "en" : "el")
  ]);
  return json({ ok: true });
}

const REPORT_WINDOW_MS = 60000;
const REPORT_LIMIT = 20;
let reportWindow = 0;
let reportCount = 0;

function recordError(env, entry) {
  return env.DB.prepare("INSERT INTO errors (at, kind, message, stack, route, agent) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(
      Date.now(),
      String(entry.kind || "error").slice(0, 20),
      String(entry.message || "").slice(0, 300),
      String(entry.stack || "").slice(0, 1000) || null,
      String(entry.route || "").slice(0, 120) || null,
      String(entry.agent || "").slice(0, 200) || null
    )
    .run()
    .catch(() => {});
}

async function reportRoute(request, env) {
  const now = Date.now();
  if (now - reportWindow > REPORT_WINDOW_MS) {
    reportWindow = now;
    reportCount = 0;
  }
  if (reportCount >= REPORT_LIMIT) return json({ ok: true });
  reportCount += 1;
  const payload = await readJson(request);
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (message) await recordError(env, { ...payload, message, agent: request.headers.get("user-agent") });
  return json({ ok: true });
}

const insertArticle = (env, entry, now, story, words, vector, score) =>
  env.DB.prepare(
    "INSERT OR IGNORE INTO articles (id, kind, owner, story, title, url, source, lang, published_at, seen_at, tokens, vector, affinity) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)"
  ).bind(
    entry.id,
    entry.feed.kind,
    entry.feed.owner,
    story,
    entry.item.title,
    entry.item.url,
    entry.item.source || new URL(entry.item.url).hostname.replace(/^www\./, ""),
    entry.feed.lang,
    entry.item.published,
    now,
    words.join(" "),
    vector,
    score
  );

async function ingest(env, now, additions) {
  const topical = additions.filter((entry) => entry.feed.kind === "topic");
  const vectors = await embed(env, topical.map((entry) => entry.item.title));
  const [topicRows, profileText, recent] = await Promise.all([
    env.DB.prepare("SELECT id, name, query_en, vector FROM topics").all(),
    getMeta(env, "profile"),
    topical.length
      ? env.DB.prepare("SELECT story, tokens FROM articles WHERE kind = 'topic' AND published_at > ?1 ORDER BY published_at DESC LIMIT ?2").bind(now - WINDOW_MS, STORY_SCAN).all()
      : { results: [] }
  ]);
  const topicVectors = topicRows.results.map((topic) => decodeVector(topic.vector)).filter(Boolean);
  const ignore = new Map(topicRows.results.map((topic) => [topic.id, new Set([...tokens(topic.name), ...tokens(topic.query_en)])]));
  const profile = decodeProfile(profileText);
  const window = recent.results.map((row) => ({ story: row.story, words: row.tokens ? row.tokens.split(" ") : [] }));
  const statements = [];
  const touched = new Set();
  topical.forEach((entry, index) => {
    const words = tokens(entry.item.title);
    const match = window.find((other) => sameStory(words, other.words, ignore.get(entry.feed.owner)));
    const story = match ? match.story : entry.id;
    window.unshift({ story, words });
    touched.add(story);
    const vector = vectors[index];
    statements.push(insertArticle(env, entry, now, story, words, vector ? encodeVector(vector) : null, vector ? affinity(vector, profile, topicVectors) : 0));
  });
  for (const entry of additions) if (entry.feed.kind !== "topic") statements.push(insertArticle(env, entry, now, entry.id, [], null, 0));
  for (const batch of chunks(statements, 50)) await env.DB.batch(batch);
  return touched;
}

function conditional(feed) {
  const headers = {};
  if (feed.etag) headers["if-none-match"] = feed.etag;
  if (feed.modified) headers["if-modified-since"] = feed.modified;
  return headers;
}

export async function refresh(env, now, { owner = null, limit = FEEDS_PER_RUN } = {}) {
  await prepare(env);
  const due = owner
    ? await env.DB.prepare("SELECT * FROM feeds WHERE owner = ?1").bind(owner).all()
    : await env.DB.prepare(
        "SELECT * FROM feeds WHERE fetched_at + (CASE kind WHEN 'topic' THEN ?2 ELSE ?3 END) * (1 << MIN(failures, ?4)) <= ?1 ORDER BY fetched_at LIMIT ?5"
      )
        .bind(now, TOPIC_INTERVAL_MS, SOURCE_INTERVAL_MS, MAX_BACKOFF, limit)
        .all();
  const feeds = due.results;
  if (feeds.length === 0) return { added: 0, touched: new Set() };
  const pages = await Promise.all(feeds.map((feed) => download(feed.url, feed.kind === "source" ? conditional(feed) : {}).catch(() => ({ status: 0, text: "" }))));
  const updates = [];
  const found = new Map();
  for (const [index, feed] of feeds.entries()) {
    const page = pages[index];
    if (page.status === 304) {
      updates.push(env.DB.prepare("UPDATE feeds SET fetched_at = ?2, failures = 0 WHERE url = ?1").bind(feed.url, now));
      continue;
    }
    if (page.status !== 200 || !looksLikeFeed(page.text)) {
      updates.push(env.DB.prepare("UPDATE feeds SET fetched_at = ?2, failures = failures + 1 WHERE url = ?1").bind(feed.url, now));
      continue;
    }
    updates.push(env.DB.prepare("UPDATE feeds SET fetched_at = ?2, failures = 0, etag = ?3, modified = ?4 WHERE url = ?1").bind(feed.url, now, page.etag || null, page.modified || null));
    for (const entry of parseFeed(page.text, page.url, now).items) {
      const id = await hashId(entry.url);
      if (!found.has(id)) found.set(id, { id, feed, item: entry });
    }
  }
  const known = new Set();
  for (const ids of chunks([...found.keys()], MAX_PARAMS)) {
    const rows = await env.DB.prepare(`SELECT id FROM articles WHERE id IN (${slots(ids.length)})`).bind(...ids).all();
    for (const row of rows.results) known.add(row.id);
  }
  const additions = [...found.values()].filter((entry) => !known.has(entry.id));
  const touched = additions.length ? await ingest(env, now, additions) : new Set();
  await env.DB.batch(updates);
  return { added: additions.length, touched };
}

async function threshold(env, now) {
  const since = now - WINDOW_MS;
  const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM articles WHERE kind = 'topic' AND vector IS NOT NULL AND published_at > ?1").bind(since).first("n");
  if (!total) return Infinity;
  return env.DB.prepare("SELECT affinity FROM articles WHERE kind = 'topic' AND vector IS NOT NULL AND published_at > ?1 ORDER BY affinity LIMIT 1 OFFSET ?2")
    .bind(since, Math.min(total - 1, Math.floor(total * NOTIFY_PERCENTILE)))
    .first("affinity");
}

export async function notify(env, now, touched) {
  if (touched.size === 0) return null;
  const subscriptions = (await env.DB.prepare("SELECT endpoint, p256dh, auth FROM subscriptions").all()).results;
  if (subscriptions.length === 0) return null;
  const counter = `sent:${athensDay(now)}`;
  const sent = Number(await getMeta(env, counter)) || 0;
  if (sent >= NOTIFY_DAILY) return null;
  const stories = [...touched].slice(0, MAX_PARAMS);
  const covered = await env.DB.prepare(
    `SELECT story, COUNT(DISTINCT source) AS coverage FROM articles WHERE story IN (${slots(stories.length, 3)}) AND published_at > ?1 AND story NOT IN (SELECT story FROM articles WHERE notified_at IS NOT NULL OR hidden_at IS NOT NULL) GROUP BY story HAVING coverage >= ?2`
  )
    .bind(now - NOTIFY_SPAN_MS, NOTIFY_COVERAGE, ...stories)
    .all();
  if (covered.results.length === 0) return null;
  const bar = await threshold(env, now);
  let best = null;
  for (const { story, coverage } of covered.results) {
    const lead = await env.DB.prepare("SELECT id, title, source, affinity, published_at FROM articles WHERE story = ?1 AND vector IS NOT NULL ORDER BY affinity DESC LIMIT 1").bind(story).first();
    if (!lead || lead.affinity < bar || now - lead.published_at > NOTIFY_FRESH_MS) continue;
    if (!best || lead.affinity > best.lead.affinity) best = { story, coverage, lead };
  }
  if (!best) return null;
  const [jwk, origin, lang] = await Promise.all([vapidKey(env), getMeta(env, "origin"), getMeta(env, "lang")]);
  if (!origin) return null;
  const greek = lang !== "en";
  const notification = {
    title: best.lead.title,
    body: `${best.lead.source} · ${best.coverage} ${greek ? "πηγές" : "sources"}`,
    lang: greek ? "el" : "en",
    tag: best.story,
    navigate: `${origin}/`,
    silent: false
  };
  const gone = [];
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        const response = await sendPush(jwk, subscription, notification, origin);
        if (response.status === 404 || response.status === 410) gone.push(subscription.endpoint);
        else if (!response.ok) console.error(JSON.stringify({ push_failed: response.status }));
      } catch (error) {
        console.error(JSON.stringify({ push_failed: String(error && error.message).slice(0, 200) }));
      }
    })
  );
  await env.DB.batch([
    env.DB.prepare("UPDATE articles SET notified_at = ?2 WHERE story = ?1").bind(best.story, now),
    setMeta(env, counter, sent + 1),
    ...gone.map((endpoint) => env.DB.prepare("DELETE FROM subscriptions WHERE endpoint = ?1").bind(endpoint))
  ]);
  return best.story;
}

export async function prune(env, now) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM articles WHERE saved_at IS NULL AND ((kind = 'topic' AND seen_at < ?1) OR (kind = 'source' AND seen_at < ?2))").bind(now - TOPIC_RETENTION_MS, now - SOURCE_RETENTION_MS),
    env.DB.prepare("DELETE FROM articles WHERE saved_at IS NULL AND owner NOT IN (SELECT id FROM topics UNION SELECT id FROM sources)"),
    env.DB.prepare("DELETE FROM errors WHERE at < ?1").bind(now - ERROR_RETENTION_MS),
    env.DB.prepare("DELETE FROM meta WHERE key LIKE 'sent:%' AND key < ?1").bind(`sent:${athensDay(now - 2 * 86400000)}`)
  ]);
}

const ROUTES = {
  "/api/state": async (request, env) => json(await state(env)),
  "/api/feed": feedRoute,
  "/api/topics": topicsRoute,
  "/api/sources": sourcesRoute,
  "/api/article": articleRoute,
  "/api/push": pushRoute,
  "/api/report": reportRoute
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const route = ROUTES[url.pathname];
    if (!route) return json({ error: "not_found" }, 404);
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const access = await checkAccess(request, url, env);
    if (access === "unavailable") return json({ error: "access_unavailable" }, 503);
    if (access !== "ok") return json({ error: "forbidden" }, 403);
    try {
      await prepare(env);
      return await route(request, env, ctx);
    } catch (error) {
      console.error(JSON.stringify({ api_failed: url.pathname, error: String(error && error.message).slice(0, 200) }));
      return json({ error: "request_failed" }, 500);
    }
  },

  async scheduled(controller, env, ctx) {
    const now = controller.scheduledTime;
    ctx.waitUntil(
      (async () => {
        const { touched } = await refresh(env, now);
        await notify(env, now, touched);
        if (new Date(now).getUTCMinutes() < 2) await prune(env, now);
      })().catch((error) => recordError(env, { kind: "cron", message: String(error && error.message ? error.message : error), stack: error && error.stack, route: "/cron" }))
    );
  }
};
