import { checkAccess } from "./access.js";
import { parseFeed, download, discover, looksLikeFeed, siteIcon, pageImage } from "./feeds.js";
import { quantize, encodeVector, decodeVector, encodeProfile, decodeProfile, learn, affinity, tokens, sameStory } from "./rank.js";
import { createKey, publicKey, pushEndpoint, keyLength, sendPush } from "./push.js";

const EMBED_MODEL = "@cf/baai/bge-m3";
const SUGGEST_MODEL = "@cf/google/gemma-4-26b-a4b-it";
const SUGGEST_COUNT = 12;
const POOL_PER_RUN = 2;
const POOL_RETRY_MS = 6 * 3600000;
const EMBED_BATCH = 32;
const FEEDS_PER_RUN = 6;
const FEED_INTERVAL_MS = 20 * 60000;
const MAX_BACKOFF = 4;
const WINDOW_MS = 48 * 3600000;
const STORY_SCAN = 600;
const RETENTION_MS = 14 * 86400000;
const POSTERS_PER_RUN = 3;
const RESCORE_LIMIT = 400;
const ERROR_RETENTION_MS = 30 * 86400000;
const FOR_YOU_LIMIT = 60;
const EXPLORE_EVERY = 5;
const VIEW_PENALTY = 0.12;
const VIEW_CAP = 6;
const VIEW_GAP_MS = 30 * 60000;
const PULL_STALE_MS = 2 * 60000;
const SAME_SOURCE = 0.08;
const SAME_WORDS = 0.12;
const VARIETY_WINDOW = 6;
const SOURCES_LIMIT = 120;
const NOTIFY_DAILY = 3;
const NOTIFY_COVERAGE = 4;
const NOTIFY_MIN_COVERAGE = 2;
const NOTIFY_SPAN_MS = 12 * 3600000;
const NOTIFY_FRESH_MS = 6 * 3600000;
const NOTIFY_PERCENTILE = 0.7;
const NAME_MAX = 60;
const MAX_PARAMS = 90;
const WEIGHTS = { open: 0.5, read: 1.5, bounce: -1, save: 1, less: -1.5 };
const BOUNCE_SECONDS = 10;
const READ_SECONDS = 60;

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY, name TEXT NOT NULL, vector TEXT, position INTEGER NOT NULL, created_at INTEGER NOT NULL, pooled_at INTEGER)",
  "CREATE TABLE IF NOT EXISTS candidates (topic TEXT NOT NULL, domain TEXT NOT NULL, tried INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (topic, domain))",
  "CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, title TEXT NOT NULL, site TEXT NOT NULL, feed TEXT NOT NULL UNIQUE, position INTEGER NOT NULL, created_at INTEGER NOT NULL, icon TEXT, hidden INTEGER NOT NULL DEFAULT 0, topic TEXT)",
  "CREATE TABLE IF NOT EXISTS feeds (url TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, lang TEXT, fetched_at INTEGER NOT NULL DEFAULT 0, etag TEXT, modified TEXT, failures INTEGER NOT NULL DEFAULT 0)",
  "CREATE INDEX IF NOT EXISTS feeds_owner ON feeds (owner)",
  "CREATE TABLE IF NOT EXISTS articles (id TEXT PRIMARY KEY, kind TEXT NOT NULL, owner TEXT NOT NULL, story TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, source TEXT NOT NULL, lang TEXT, published_at INTEGER NOT NULL, seen_at INTEGER NOT NULL, tokens TEXT NOT NULL, vector TEXT, affinity REAL NOT NULL DEFAULT 0, opened_at INTEGER, hidden_at INTEGER, saved_at INTEGER, notified_at INTEGER, image TEXT, dwell INTEGER, views INTEGER NOT NULL DEFAULT 0, viewed_at INTEGER)",
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
      env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql)))
        .then(() => upgrade(env))
        .catch((error) => {
          ready.delete(env.DB);
          throw error;
        })
    );
  }
  return ready.get(env.DB);
}

async function upgrade(env) {
  const [articles, topics, sources] = await Promise.all(["articles", "topics", "sources"].map((table) => env.DB.prepare(`PRAGMA table_info(${table})`).all()));
  const steps = [];
  if (!articles.results.some((column) => column.name === "image")) steps.push("ALTER TABLE articles ADD COLUMN image TEXT");
  if (!articles.results.some((column) => column.name === "dwell")) steps.push("ALTER TABLE articles ADD COLUMN dwell INTEGER");
  if (!articles.results.some((column) => column.name === "views")) steps.push("ALTER TABLE articles ADD COLUMN views INTEGER NOT NULL DEFAULT 0", "ALTER TABLE articles ADD COLUMN viewed_at INTEGER");
  if (!sources.results.some((column) => column.name === "icon")) steps.push("ALTER TABLE sources ADD COLUMN icon TEXT");
  if (!sources.results.some((column) => column.name === "hidden")) steps.push("ALTER TABLE sources ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0", "ALTER TABLE sources ADD COLUMN topic TEXT");
  if (!topics.results.some((column) => column.name === "pooled_at")) steps.push("ALTER TABLE topics ADD COLUMN pooled_at INTEGER");
  if (topics.results.some((column) => column.name === "query_en")) {
    steps.push("ALTER TABLE topics DROP COLUMN query_en", "DELETE FROM feeds WHERE kind = 'topic'", "DELETE FROM articles WHERE kind = 'topic' AND saved_at IS NULL");
  }
  for (const sql of steps) {
    await env.DB.prepare(sql)
      .run()
      .catch((error) => {
        if (!/duplicate column|no such column/i.test(String(error && error.message))) throw error;
      });
  }
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
    env.DB.prepare("SELECT id, title, site FROM sources WHERE hidden = 0 ORDER BY position, created_at").all(),
    vapidKey(env)
  ]);
  return { topics: topics.results, sources: sources.results, pushKey: publicKey(key) };
}

const addFeed = (env, url, owner) => env.DB.prepare("INSERT OR IGNORE INTO feeds (url, owner, kind, fetched_at) VALUES (?1, ?2, 'source', 0)").bind(url, owner);

function background(env, ctx, work, route) {
  ctx.waitUntil(work.catch((error) => recordError(env, { kind: "background", message: String(error && error.message), route })));
}

const unpool = (env, topic) => [
  env.DB.prepare("DELETE FROM candidates WHERE topic = ?1").bind(topic),
  env.DB.prepare("DELETE FROM articles WHERE saved_at IS NULL AND owner IN (SELECT id FROM sources WHERE hidden = 1 AND topic = ?1)").bind(topic),
  env.DB.prepare("DELETE FROM feeds WHERE owner IN (SELECT id FROM sources WHERE hidden = 1 AND topic = ?1)").bind(topic),
  env.DB.prepare("DELETE FROM sources WHERE hidden = 1 AND topic = ?1").bind(topic)
];

export function domains(text) {
  const found = [];
  for (const match of String(text || "").toLowerCase().matchAll(/\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})\b/g)) {
    const domain = match[1].replace(/^www\./, "");
    if (!found.includes(domain)) found.push(domain);
  }
  return found.slice(0, SUGGEST_COUNT);
}

function replyText(result) {
  const message = result?.choices?.[0]?.message ?? {};
  const parts = [message.content, result?.response, message.reasoning_content, message.reasoning];
  return parts
    .flatMap((part) => (Array.isArray(part) ? part.map((piece) => piece?.text ?? "") : [part]))
    .filter((part) => typeof part === "string" && part)
    .join("\n");
}

async function suggest(env, topic, now) {
  let text = "";
  let raw = null;
  try {
    const result = await env.AI.run(SUGGEST_MODEL, {
      messages: [
        {
          role: "user",
          content: `List ${SUGGEST_COUNT} news websites that regularly publish articles about "${topic.name}". Mix Greek sites (.gr) with major international English-language sites, and prefer sites that offer an RSS feed. Reply with the bare domains only, one per line, nothing else.`
        }
      ],
      max_completion_tokens: 2048,
      temperature: 0.2
    });
    raw = result;
    text = replyText(result);
  } catch (error) {
    console.error(JSON.stringify({ suggest_failed: String(error && error.message).slice(0, 200) }));
  }
  const found = domains(text);
  if (!found.length && raw) console.error(JSON.stringify({ suggest_empty: JSON.stringify(raw).slice(0, 600) }));
  await env.DB.batch([
    env.DB.prepare("UPDATE topics SET pooled_at = ?2 WHERE id = ?1").bind(topic.id, now),
    ...found.map((domain) => env.DB.prepare("INSERT OR IGNORE INTO candidates (topic, domain) VALUES (?1, ?2)").bind(topic.id, domain))
  ]);
  return found.length;
}

export async function suggestNext(env, now) {
  const topic = await env.DB.prepare(
    "SELECT id, name FROM topics t WHERE pooled_at IS NULL OR (pooled_at < ?1 AND NOT EXISTS (SELECT 1 FROM candidates c WHERE c.topic = t.id)) ORDER BY created_at LIMIT 1"
  )
    .bind(now - POOL_RETRY_MS)
    .first();
  return topic ? suggest(env, topic, now) : 0;
}

export async function tryCandidates(env, limit = POOL_PER_RUN) {
  const rows = (await env.DB.prepare("SELECT topic, domain FROM candidates WHERE tried = 0 ORDER BY rowid LIMIT ?1").bind(limit).all()).results;
  const added = [];
  for (const row of rows) {
    const found = await discover(row.domain).catch(() => null);
    const statements = [env.DB.prepare("UPDATE candidates SET tried = 1 WHERE topic = ?1 AND domain = ?2").bind(row.topic, row.domain)];
    if (found && !(await env.DB.prepare("SELECT 1 AS hit FROM sources WHERE feed = ?1").bind(found.feed).first("hit"))) {
      const id = crypto.randomUUID();
      const site = found.site || new URL(found.feed).origin;
      statements.push(
        env.DB.prepare(
          "INSERT INTO sources (id, title, site, feed, position, created_at, icon, hidden, topic) SELECT ?1, ?2, ?3, ?4, 0, ?5, ?6, 1, ?7 WHERE EXISTS (SELECT 1 FROM topics WHERE id = ?7)"
        ).bind(id, cleanName(found.title) || new URL(site).hostname.replace(/^www\./, ""), site, found.feed, Date.now(), found.icon || null, row.topic),
        env.DB.prepare("INSERT OR IGNORE INTO feeds (url, owner, kind, fetched_at) SELECT ?1, ?2, 'source', 0 WHERE EXISTS (SELECT 1 FROM sources WHERE id = ?2)").bind(found.feed, id)
      );
      added.push(id);
    }
    await env.DB.batch(statements);
  }
  return added;
}

async function seed(env, id) {
  const now = Date.now();
  const topic = await env.DB.prepare("SELECT id, name FROM topics WHERE id = ?1").bind(id).first();
  if (!topic) return;
  await suggest(env, topic, now);
  for (const owner of await tryCandidates(env)) await refresh(env, now, { owner });
  await Promise.all([icons(env), posters(env, now), rescore(env, now)]);
}

async function topicsRoute(request, env, ctx) {
  const body = await readJson(request);
  if (body.action === "delete") {
    const id = String(body.id || "");
    await env.DB.batch([...unpool(env, id), env.DB.prepare("DELETE FROM topics WHERE id = ?1").bind(id)]);
    background(env, ctx, rescore(env, Date.now()), "/topics");
    return json(await state(env));
  }
  if (body.action !== "add" && body.action !== "rename") return json({ error: "invalid_action" }, 400);
  const name = cleanName(body.name);
  if (!name) return json({ error: "invalid_name" }, 400);
  const existing = (await env.DB.prepare("SELECT id, name FROM topics").all()).results;
  const id = body.action === "add" ? crypto.randomUUID() : String(body.id || "");
  if (body.action === "rename" && !existing.some((topic) => topic.id === id)) return json({ error: "not_found" }, 404);
  if (existing.some((topic) => topic.id !== id && sameName(topic.name, name))) return json({ error: "duplicate" }, 409);
  const [vector] = await embed(env, [name]);
  const encoded = vector ? encodeVector(vector) : null;
  await env.DB.batch(
    body.action === "add"
      ? [env.DB.prepare("INSERT INTO topics (id, name, vector, position, created_at) VALUES (?1, ?2, ?3, (SELECT COALESCE(MAX(position) + 1, 0) FROM topics), ?4)").bind(id, name, encoded, Date.now())]
      : [...unpool(env, id), env.DB.prepare("UPDATE topics SET name = ?2, vector = ?3, pooled_at = NULL WHERE id = ?1").bind(id, name, encoded)]
  );
  background(env, ctx, seed(env, id), "/topics");
  return json(await state(env));
}

async function sourcesRoute(request, env, ctx) {
  const body = await readJson(request);
  const id = String(body.id || "");
  if (body.action === "delete") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sources WHERE id = ?1").bind(id),
      env.DB.prepare("DELETE FROM feeds WHERE owner = ?1").bind(id),
      env.DB.prepare("DELETE FROM articles WHERE owner = ?1 AND saved_at IS NULL").bind(id)
    ]);
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
  const duplicate = await env.DB.prepare("SELECT id, hidden FROM sources WHERE feed = ?1").bind(found.feed).first();
  if (duplicate && duplicate.hidden) {
    await env.DB.prepare("UPDATE sources SET hidden = 0, topic = NULL, position = (SELECT COALESCE(MAX(position) + 1, 0) FROM sources WHERE hidden = 0) WHERE id = ?1").bind(duplicate.id).run();
  }
  if (duplicate) return json(await state(env));
  const created = crypto.randomUUID();
  const site = found.site || new URL(found.feed).origin;
  const title = cleanName(found.title) || new URL(site).hostname.replace(/^www\./, "");
  await env.DB.batch([
    env.DB.prepare("INSERT INTO sources (id, title, site, feed, position, created_at, icon) VALUES (?1, ?2, ?3, ?4, (SELECT COALESCE(MAX(position) + 1, 0) FROM sources), ?5, ?6)").bind(
      created,
      title,
      site,
      found.feed,
      Date.now(),
      found.icon || null
    ),
    addFeed(env, found.feed, created)
  ]);
  background(
    env,
    ctx,
    refresh(env, Date.now(), { owner: created }).then(() => Promise.all([icons(env), posters(env, Date.now())])),
    "/sources"
  );
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
  coverage: row.coverage || 1,
  image: row.image || null,
  icon: row.icon || null
});

function closeness(row, other) {
  const words = new Set(String(other.tokens || "").split(" ").filter(Boolean));
  const shared = String(row.tokens || "").split(" ").some((word) => words.has(word));
  return (row.source && row.source === other.source ? SAME_SOURCE : 0) + (shared ? SAME_WORDS : 0);
}

function next(pool, value, previous) {
  if (!previous) return 0;
  let best = 0;
  let bestValue = -Infinity;
  for (let index = 0; index < Math.min(pool.length, VARIETY_WINDOW); index += 1) {
    const candidate = value(pool[index]) - closeness(pool[index], previous);
    if (candidate > bestValue) {
      best = index;
      bestValue = candidate;
    }
  }
  return best;
}

export function pick(rows, now, limit = FOR_YOU_LIMIT) {
  const sorted = rows.map((row) => row.affinity).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const quartile = sorted.length ? sorted[Math.floor(sorted.length / 4)] : 0;
  const spread = (sorted.at(-1) ?? 0) - median || 1;
  const novelty = (row) => Math.min(row.coverage - 1, 5) * 0.05 - ((now - row.published_at) / WINDOW_MS) * 0.2 - Math.min(row.views || 0, VIEW_CAP) * VIEW_PENALTY;
  const score = (row) => (row.affinity - median) / spread + novelty(row);
  const usual = rows.filter((row) => row.affinity >= median).sort((a, b) => score(b) - score(a));
  const fresh = rows.filter((row) => row.affinity >= quartile && row.affinity < median).sort((a, b) => novelty(b) - novelty(a));
  const picked = [];
  while (picked.length < limit && usual.length) {
    const exploring = (picked.length + 1) % EXPLORE_EVERY === 0 && fresh.length > 0;
    const pool = exploring ? fresh : usual;
    picked.push(pool.splice(next(pool, exploring ? novelty : score, picked.at(-1)), 1)[0]);
  }
  return picked;
}

async function feedRoute(request, env) {
  const body = await readJson(request);
  const now = Date.now();
  if (body.tab === "saved") {
    const rows = await env.DB.prepare(
      "SELECT a.id, a.title, a.url, COALESCE(s.title, a.source) AS source, s.icon, a.published_at, a.opened_at, a.saved_at, a.image FROM articles a LEFT JOIN sources s ON s.id = a.owner WHERE a.saved_at IS NOT NULL ORDER BY a.saved_at DESC"
    ).all();
    return json({ items: rows.results.map(item) });
  }
  if (body.tab === "sources") {
    const owner = typeof body.source === "string" && body.source ? body.source : null;
    const rows = await env.DB.prepare(
      `SELECT a.id, a.title, a.url, s.title AS source, s.icon, a.published_at, a.opened_at, a.saved_at, a.image FROM articles a JOIN sources s ON s.id = a.owner AND s.hidden = 0${owner ? " WHERE a.owner = ?2" : ""} ORDER BY a.published_at DESC LIMIT ?1`
    )
      .bind(...(owner ? [SOURCES_LIMIT, owner] : [SOURCES_LIMIT]))
      .all();
    return json({ items: rows.results.map(item) });
  }
  const rows = await env.DB.prepare(
    `SELECT id, title, url, source, icon, published_at, opened AS opened_at, saved AS saved_at, coverage, image, affinity, tokens, views FROM (
      SELECT a.id, a.title, a.url, s.title AS source, s.icon, s.hidden, a.published_at, a.affinity, a.image, a.tokens,
        MAX(a.opened_at) OVER same AS opened, MAX(a.saved_at) OVER same AS saved, MAX(a.views) OVER same AS views,
        ROW_NUMBER() OVER (PARTITION BY a.story ORDER BY s.hidden DESC, a.affinity DESC, a.published_at DESC) AS place,
        (SELECT COUNT(DISTINCT b.owner) FROM articles b WHERE b.story = a.story) AS coverage
      FROM articles a JOIN sources s ON s.id = a.owner
      WHERE a.vector IS NOT NULL AND a.published_at > ?1 AND a.story NOT IN (SELECT story FROM articles WHERE hidden_at IS NOT NULL)
      WINDOW same AS (PARTITION BY a.story)
    ) WHERE place = 1 AND hidden = 1 AND opened IS NULL ORDER BY published_at DESC LIMIT ?2`
  )
    .bind(now - WINDOW_MS, RESCORE_LIMIT)
    .all();
  return json({ items: pick(rows.results, now).map(item) });
}

async function articleRoute(request, env) {
  const body = await readJson(request);
  const row = await env.DB.prepare("SELECT id, vector, opened_at, saved_at, dwell FROM articles WHERE id = ?1").bind(String(body.id || "")).first();
  if (!row) return json({ error: "not_found" }, 404);
  if (body.action === "dwell") return dwellRoute(env, row, body.seconds);
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

async function dwellRoute(env, row, value) {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds) || seconds < 0) return json({ error: "invalid_seconds" }, 400);
  if (!row.opened_at || row.dwell !== null) return json({ ok: true });
  const statements = [env.DB.prepare("UPDATE articles SET dwell = ?2 WHERE id = ?1 AND dwell IS NULL").bind(row.id, Math.min(seconds, 86400))];
  const weight = seconds < BOUNCE_SECONDS ? WEIGHTS.bounce : seconds >= READ_SECONDS ? WEIGHTS.read : 0;
  const vector = decodeVector(row.vector);
  if (weight && vector) statements.push(setMeta(env, "profile", encodeProfile(learn(decodeProfile(await getMeta(env, "profile")), vector, weight))));
  await env.DB.batch(statements);
  return json({ ok: true });
}

async function seenRoute(request, env) {
  const body = await readJson(request);
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).filter((id) => typeof id === "string" && id))].slice(0, FOR_YOU_LIMIT);
  if (ids.length) {
    const now = Date.now();
    await env.DB.prepare(`UPDATE articles SET views = views + 1, viewed_at = ?1 WHERE id IN (${slots(ids.length, 3)}) AND (viewed_at IS NULL OR viewed_at < ?2)`)
      .bind(now, now - VIEW_GAP_MS, ...ids)
      .run();
  }
  return json({ ok: true });
}

async function refreshRoute(request, env) {
  const body = await readJson(request);
  const now = Date.now();
  const { added } = await refresh(env, now, { hidden: body.tab === "foryou" ? 1 : 0 });
  await posters(env, now);
  return json({ added });
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

async function interests(env) {
  const [topics, profile] = await Promise.all([env.DB.prepare("SELECT vector FROM topics").all(), getMeta(env, "profile")]);
  return { topics: topics.results.map((topic) => decodeVector(topic.vector)).filter(Boolean), profile: decodeProfile(profile) };
}

async function enrich(env, now, list) {
  const [vectors, taste, recent] = await Promise.all([
    embed(env, list.map((entry) => entry.title)),
    interests(env),
    env.DB.prepare("SELECT story, tokens FROM articles WHERE tokens != '' AND published_at > ?1 ORDER BY published_at DESC LIMIT ?2").bind(now - WINDOW_MS, STORY_SCAN).all()
  ]);
  if (vectors.length !== list.length) return null;
  const window = recent.results.map((row) => ({ story: row.story, words: row.tokens.split(" ") }));
  return list.map((entry, index) => {
    const words = tokens(entry.title);
    const match = window.find((other) => sameStory(words, other.words));
    const story = match ? match.story : entry.id;
    window.unshift({ story, words });
    return { story, words: words.join(" "), vector: encodeVector(vectors[index]), affinity: affinity(vectors[index], taste.profile, taste.topics) };
  });
}

async function ingest(env, now, additions) {
  const scored = await enrich(env, now, additions.map((entry) => ({ id: entry.id, title: entry.item.title })));
  const touched = new Set();
  const statements = additions.map((entry, index) => {
    const extra = scored ? scored[index] : { story: entry.id, words: "", vector: null, affinity: 0 };
    if (scored) touched.add(extra.story);
    return env.DB.prepare(
      "INSERT OR IGNORE INTO articles (id, kind, owner, story, title, url, source, lang, published_at, seen_at, tokens, vector, affinity, image) VALUES (?1, 'source', ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8, ?9, ?10, ?11, ?12)"
    ).bind(
      entry.id,
      entry.feed.owner,
      extra.story,
      entry.item.title,
      entry.item.url,
      entry.item.source || new URL(entry.item.url).hostname.replace(/^www\./, ""),
      entry.item.published,
      now,
      extra.words,
      extra.vector,
      extra.affinity,
      entry.item.image || null
    );
  });
  for (const batch of chunks(statements, 50)) await env.DB.batch(batch);
  return touched;
}

export async function backfill(env, now, limit = EMBED_BATCH) {
  const rows = (await env.DB.prepare("SELECT id, title FROM articles WHERE vector IS NULL AND published_at > ?1 ORDER BY published_at DESC LIMIT ?2").bind(now - WINDOW_MS, limit).all()).results;
  if (rows.length === 0) return 0;
  const scored = await enrich(env, now, rows);
  if (!scored) return 0;
  await env.DB.batch(
    rows.map((row, index) =>
      env.DB.prepare("UPDATE articles SET story = ?2, tokens = ?3, vector = ?4, affinity = ?5 WHERE id = ?1").bind(row.id, scored[index].story, scored[index].words, scored[index].vector, scored[index].affinity)
    )
  );
  return rows.length;
}

export async function posters(env, now, limit = POSTERS_PER_RUN) {
  const rows = (await env.DB.prepare("SELECT id, url FROM articles WHERE image IS NULL AND seen_at > ?1 ORDER BY published_at DESC LIMIT ?2").bind(now - RETENTION_MS, limit).all()).results;
  const found = await Promise.all(rows.map((row) => pageImage(row.url)));
  if (rows.length) await env.DB.batch(rows.map((row, index) => env.DB.prepare("UPDATE articles SET image = ?2 WHERE id = ?1 AND image IS NULL").bind(row.id, found[index])));
  return rows.length;
}

export async function icons(env, limit = 2) {
  const rows = (await env.DB.prepare("SELECT id, site FROM sources WHERE icon IS NULL LIMIT ?1").bind(limit).all()).results;
  for (const row of rows) await env.DB.prepare("UPDATE sources SET icon = ?2 WHERE id = ?1").bind(row.id, await siteIcon(row.site)).run();
  return rows.length;
}

export async function rescore(env, now, limit = RESCORE_LIMIT) {
  await prepare(env);
  const [taste, rows] = await Promise.all([
    interests(env),
    env.DB.prepare("SELECT id, vector, affinity FROM articles WHERE vector IS NOT NULL AND published_at > ?1 ORDER BY published_at DESC LIMIT ?2").bind(now - WINDOW_MS, limit).all()
  ]);
  const updates = [];
  for (const row of rows.results) {
    const next = affinity(decodeVector(row.vector), taste.profile, taste.topics);
    if (Math.abs(next - row.affinity) > 1e-4) updates.push(env.DB.prepare("UPDATE articles SET affinity = ?2 WHERE id = ?1").bind(row.id, next));
  }
  for (const batch of chunks(updates, 50)) await env.DB.batch(batch);
  return updates.length;
}

function failure(env, now, url, page) {
  let landed = "";
  try {
    landed = new URL(page.url || url).host;
  } catch {}
  const reason = page.status === 200 ? `not a feed: ${page.text.slice(0, 120).replace(/\s+/g, " ")}` : page.status ? `http ${page.status}` : page.error || "unreachable";
  return env.DB.prepare("INSERT INTO errors (at, kind, message, route) VALUES (?1, 'feed', ?2, ?3)").bind(now, `${reason} (${landed})`.slice(0, 300), url.slice(0, 120));
}

function conditional(feed) {
  const headers = {};
  if (feed.etag) headers["if-none-match"] = feed.etag;
  if (feed.modified) headers["if-modified-since"] = feed.modified;
  return headers;
}

export async function refresh(env, now, { owner = null, limit = FEEDS_PER_RUN, hidden = null } = {}) {
  await prepare(env);
  const due = owner
    ? await env.DB.prepare("SELECT * FROM feeds WHERE owner = ?1").bind(owner).all()
    : hidden !== null
      ? await env.DB.prepare("SELECT f.* FROM feeds f JOIN sources s ON s.id = f.owner WHERE s.hidden = ?1 AND f.failures = 0 AND f.fetched_at <= ?2 ORDER BY f.fetched_at LIMIT ?3")
          .bind(hidden, now - PULL_STALE_MS, limit)
          .all()
      : await env.DB.prepare("SELECT * FROM feeds WHERE fetched_at + ?2 * (1 << MIN(failures, ?3)) <= ?1 ORDER BY fetched_at LIMIT ?4").bind(now, FEED_INTERVAL_MS, MAX_BACKOFF, limit).all();
  const feeds = due.results;
  if (feeds.length === 0) return { added: 0, touched: new Set() };
  const pages = await Promise.all(feeds.map((feed) => download(feed.url, conditional(feed)).catch((error) => ({ status: 0, text: "", error: String(error && error.message) }))));
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
      if (feed.failures < 2) updates.push(failure(env, now, feed.url, page));
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
  for (const entry of found.values()) {
    if (known.has(entry.id) && entry.item.image) updates.push(env.DB.prepare("UPDATE articles SET image = ?2 WHERE id = ?1 AND (image IS NULL OR image = '')").bind(entry.id, entry.item.image));
  }
  const touched = additions.length ? await ingest(env, now, additions) : new Set();
  await env.DB.batch(updates);
  return { added: additions.length, touched };
}

async function threshold(env, now) {
  const since = now - WINDOW_MS;
  const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM articles WHERE vector IS NOT NULL AND published_at > ?1").bind(since).first("n");
  if (!total) return Infinity;
  return env.DB.prepare("SELECT affinity FROM articles WHERE vector IS NOT NULL AND published_at > ?1 ORDER BY affinity LIMIT 1 OFFSET ?2")
    .bind(since, Math.min(total - 1, Math.floor(total * NOTIFY_PERCENTILE)))
    .first("affinity");
}

export async function notify(env, now, touched) {
  if (touched.size === 0) return null;
  const [subscriptions, sourceCount] = await Promise.all([
    env.DB.prepare("SELECT endpoint, p256dh, auth FROM subscriptions").all(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM sources").first("n")
  ]);
  if (subscriptions.results.length === 0 || sourceCount < NOTIFY_MIN_COVERAGE) return null;
  const needed = Math.min(NOTIFY_COVERAGE, sourceCount);
  const counter = `sent:${athensDay(now)}`;
  const sent = Number(await getMeta(env, counter)) || 0;
  if (sent >= NOTIFY_DAILY) return null;
  const stories = [...touched].slice(0, MAX_PARAMS);
  const covered = await env.DB.prepare(
    `SELECT story, COUNT(DISTINCT owner) AS coverage FROM articles WHERE story IN (${slots(stories.length, 3)}) AND published_at > ?1 AND story NOT IN (SELECT story FROM articles WHERE notified_at IS NOT NULL OR hidden_at IS NOT NULL) GROUP BY story HAVING coverage >= ?2`
  )
    .bind(now - NOTIFY_SPAN_MS, needed, ...stories)
    .all();
  if (covered.results.length === 0) return null;
  const bar = await threshold(env, now);
  let best = null;
  for (const { story, coverage } of covered.results) {
    const lead = await env.DB.prepare(
      "SELECT a.id, a.title, COALESCE(s.title, a.source) AS source, a.affinity, a.published_at FROM articles a LEFT JOIN sources s ON s.id = a.owner WHERE a.story = ?1 AND a.vector IS NOT NULL ORDER BY a.affinity DESC LIMIT 1"
    )
      .bind(story)
      .first();
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
    subscriptions.results.map(async (subscription) => {
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
    env.DB.prepare("DELETE FROM articles WHERE saved_at IS NULL AND seen_at < ?1").bind(now - RETENTION_MS),
    env.DB.prepare("DELETE FROM articles WHERE saved_at IS NULL AND owner NOT IN (SELECT id FROM sources)"),
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
  "/api/seen": seenRoute,
  "/api/refresh": refreshRoute,
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
        await backfill(env, now);
        await icons(env);
        await posters(env, now);
        await suggestNext(env, now);
        await tryCandidates(env);
        if (new Date(now).getUTCMinutes() < 2) {
          await rescore(env, now);
          await prune(env, now);
        }
      })().catch((error) => recordError(env, { kind: "cron", message: String(error && error.message ? error.message : error), stack: error && error.stack, route: "/cron" }))
    );
  }
};
