import test from "node:test";
import assert from "node:assert/strict";
import worker, { refresh, notify, prune } from "../src/index.js";
import { environment, network, api, rss, context, device, decrypt } from "./helpers.mjs";

const HOUR = 3600000;

const greek = (now) =>
  rss([
    { title: "Γαλατάσαραϊ - Μπαρτσελόνα 1-4: Ο Λεβαντόφσκι διέλυσε τη Γαλατάσαραϊ - Novasports", link: "https://news.google.com/rss/articles/a1", at: now - HOUR, source: "Novasports" },
    { title: "Λεβαντόφσκι και Γιαμάλ διέλυσαν τη Γαλατάσαραϊ - Gazzetta", link: "https://news.google.com/rss/articles/a2", at: now - 2 * HOUR, source: "Gazzetta" },
    { title: "Γαλατάσαραϊ: Ο Λεβαντόφσκι σκόραρε δις - Sport24", link: "https://news.google.com/rss/articles/a3", at: now - 3 * HOUR, source: "Sport24" },
    { title: "Μπαρτσελόνα: Ανανέωση συμβολαίου για τον Πέδρι - Novasports", link: "https://news.google.com/rss/articles/a4", at: now - 4 * HOUR, source: "Novasports" }
  ]);

const english = (now) => rss([{ title: "Barcelona thrash Galatasaray in Istanbul - ESPN", link: "https://news.google.com/rss/articles/e1", at: now - HOUR, source: "ESPN" }]);

function googleNews(now, extra = []) {
  return network([
    [/news\.google\.com\/rss\/search\?q=%CE%9C.*hl=el/, () => new Response(greek(now))],
    [/news\.google\.com\/rss\/search\?q=Barcelona.*hl=en-US/, () => new Response(english(now))],
    ...extra
  ]);
}

async function withTopic(env, now = Date.now()) {
  const calls = googleNews(now);
  const response = await api(worker, env, "/api/topics", { action: "add", name: "Μπαρτσελόνα" });
  return { response, calls };
}

const rows = (env, sql, ...params) => env.DB.sqlite.prepare(sql).all(...params).map((row) => ({ ...row }));

test("a topic gets a Greek and an English feed and fills For You grouped by story", async () => {
  const env = environment();
  const { response, calls } = await withTopic(env);
  assert.equal(response.status, 200);
  assert.deepEqual(response.json.topics.map((topic) => topic.name), ["Μπαρτσελόνα"]);
  assert.equal(response.json.sources.length, 0);
  assert.ok(response.json.pushKey.length > 80);
  assert.deepEqual(
    rows(env, "SELECT lang, url FROM feeds ORDER BY lang").map((row) => [row.lang, decodeURIComponent(new URL(row.url).searchParams.get("q"))]),
    [
      ["el", "Μπαρτσελόνα when:2d"],
      ["en", "Barcelona when:2d"]
    ]
  );
  assert.equal(calls.length, 2);
  const feed = await api(worker, env, "/api/feed", { tab: "foryou" });
  const items = feed.json.items;
  assert.equal(items.length, 3);
  const story = items.find((item) => item.coverage === 3);
  assert.ok(story);
  assert.equal(story.opened, false);
  assert.ok(items.some((item) => item.title === "Barcelona thrash Galatasaray in Istanbul" && item.source === "ESPN"));
  assert.ok(items.some((item) => item.title === "Μπαρτσελόνα: Ανανέωση συμβολαίου για τον Πέδρι" && item.coverage === 1));
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM articles WHERE vector IS NOT NULL")[0].n, 5);
});

test("adding the same topic twice is refused and renaming swaps its feeds", async () => {
  const env = environment();
  const { response } = await withTopic(env);
  const id = response.json.topics[0].id;
  assert.equal((await api(worker, env, "/api/topics", { action: "add", name: "μπαρτσελόνα" })).status, 409);
  network([[/news\.google\.com/, () => new Response(rss([]))]]);
  const renamed = await api(worker, env, "/api/topics", { action: "rename", id, name: "AI" });
  assert.deepEqual(renamed.json.topics, [{ id, name: "AI" }]);
  assert.deepEqual(
    rows(env, "SELECT url FROM feeds").map((row) => new URL(row.url).searchParams.get("q")),
    ["AI when:2d", "AI when:2d"]
  );
  assert.equal((await api(worker, env, "/api/topics", { action: "rename", id: "missing", name: "X" })).status, 404);
  assert.equal((await api(worker, env, "/api/topics", { action: "add", name: "   " })).status, 400);
});

test("opening, saving and Suggest Less shape the feed and the profile", async () => {
  const env = environment();
  await withTopic(env);
  const items = (await api(worker, env, "/api/feed", { tab: "foryou" })).json.items;
  const story = items.find((item) => item.coverage === 3);
  const other = items.find((item) => item.coverage === 1 && item.source === "Novasports");
  assert.equal((await api(worker, env, "/api/article", { id: story.id, action: "open" })).status, 200);
  assert.ok(rows(env, "SELECT value FROM meta WHERE key = 'profile'")[0].value.length > 1000);
  assert.equal((await api(worker, env, "/api/article", { id: other.id, action: "save" })).status, 200);
  let feed = (await api(worker, env, "/api/feed", { tab: "foryou" })).json.items;
  assert.equal(feed.find((item) => item.coverage === 3).opened, true);
  assert.equal(feed.find((item) => item.id === other.id).saved, true);
  const saved = (await api(worker, env, "/api/feed", { tab: "saved" })).json.items;
  assert.deepEqual(saved.map((item) => item.id), [other.id]);
  await api(worker, env, "/api/article", { id: story.id, action: "less" });
  feed = (await api(worker, env, "/api/feed", { tab: "foryou" })).json.items;
  assert.equal(feed.length, 2);
  assert.ok(!feed.some((item) => item.coverage === 3));
  await api(worker, env, "/api/article", { id: other.id, action: "unsave" });
  assert.equal((await api(worker, env, "/api/feed", { tab: "saved" })).json.items.length, 0);
  assert.equal((await api(worker, env, "/api/article", { id: "nope", action: "open" })).status, 404);
  assert.equal((await api(worker, env, "/api/article", { id: other.id, action: "explode" })).status, 400);
});

test("deleting a topic removes its feeds and articles but keeps what was saved", async () => {
  const env = environment();
  const { response } = await withTopic(env);
  const items = (await api(worker, env, "/api/feed", { tab: "foryou" })).json.items;
  await api(worker, env, "/api/article", { id: items[0].id, action: "save" });
  const after = await api(worker, env, "/api/topics", { action: "delete", id: response.json.topics[0].id });
  assert.deepEqual(after.json.topics, []);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM feeds")[0].n, 0);
  assert.equal((await api(worker, env, "/api/feed", { tab: "foryou" })).json.items.length, 1);
  assert.equal((await api(worker, env, "/api/feed", { tab: "saved" })).json.items.length, 1);
});

test("a source is found from its site, listed newest first and can be renamed, ordered and deleted", async () => {
  const env = environment();
  const now = Date.now();
  network([
    ["https://blog.example/", () => new Response('<html><head><title>Blog</title><link rel="alternate" type="application/atom+xml" href="/atom.xml"></head></html>')],
    [
      "https://blog.example/atom.xml",
      () =>
        new Response(
          `<feed xmlns="http://www.w3.org/2005/Atom"><title>The Blog</title><link href="https://blog.example/"/><entry><title>Old</title><link href="https://blog.example/old"/><updated>${new Date(now - 30 * HOUR).toISOString()}</updated></entry><entry><title>New</title><link href="https://blog.example/new"/><updated>${new Date(now - HOUR).toISOString()}</updated></entry></feed>`,
          { headers: { etag: '"v1"' } }
        )
    ],
    ["https://second.example/", () => new Response(rss([{ title: "Second post", link: "https://second.example/p", at: now - 2 * HOUR }], "Second"))]
  ]);
  const added = await api(worker, env, "/api/sources", { action: "add", url: "blog.example" });
  assert.equal(added.status, 200);
  assert.deepEqual(added.json.sources.map((source) => [source.title, source.site]), [["The Blog", "https://blog.example/"]]);
  const again = await api(worker, env, "/api/sources", { action: "add", url: "https://blog.example/atom.xml" });
  assert.equal(again.json.sources.length, 1);
  await api(worker, env, "/api/sources", { action: "add", url: "second.example" });
  let feed = (await api(worker, env, "/api/feed", { tab: "sources" })).json.items;
  assert.deepEqual(feed.map((item) => [item.title, item.source]), [["New", "The Blog"], ["Second post", "Second"], ["Old", "The Blog"]]);
  const [blog, second] = (await api(worker, env, "/api/state", {})).json.sources;
  await api(worker, env, "/api/sources", { action: "rename", id: blog.id, title: "Blog" });
  const ordered = await api(worker, env, "/api/sources", { action: "order", ids: [second.id, blog.id] });
  assert.deepEqual(ordered.json.sources.map((source) => source.title), ["Second", "Blog"]);
  feed = (await api(worker, env, "/api/feed", { tab: "sources", source: blog.id })).json.items;
  assert.deepEqual(feed.map((item) => [item.title, item.source]), [["New", "Blog"], ["Old", "Blog"]]);
  assert.equal(rows(env, "SELECT etag FROM feeds WHERE owner = ?", blog.id)[0].etag, '"v1"');
  assert.ok(feed.every((item) => item.image === null));
  await api(worker, env, "/api/sources", { action: "delete", id: blog.id });
  feed = (await api(worker, env, "/api/feed", { tab: "sources" })).json.items;
  assert.deepEqual(feed.map((item) => item.title), ["Second post"]);
});

test("Google News requests carry the consent cookie", async () => {
  const env = environment();
  const { calls } = await withTopic(env);
  assert.ok(calls.every((request) => request.headers.get("cookie") === "CONSENT=YES+cb; SOCS=CAI"));
});

test("source articles carry their picture, and older ones get it filled in on the next fetch", async () => {
  const env = environment();
  const now = Date.now();
  let withImages = false;
  network([
    [
      "https://pics.example/",
      () =>
        new Response(
          `<rss><channel><title>Pics</title><item><title>One</title><link>https://pics.example/1</link><pubDate>${new Date(now - HOUR).toUTCString()}</pubDate>${withImages ? '<enclosure url="https://pics.example/1.jpg" type="image/jpeg"/>' : ""}</item></channel></rss>`
        )
    ]
  ]);
  await api(worker, env, "/api/sources", { action: "add", url: "pics.example" });
  assert.equal((await api(worker, env, "/api/feed", { tab: "sources" })).json.items[0].image, null);
  withImages = true;
  await refresh(env, now + 21 * 60000);
  assert.equal((await api(worker, env, "/api/feed", { tab: "sources" })).json.items[0].image, "https://pics.example/1.jpg");
});

test("an older database gains the picture column on first use", async () => {
  const env = environment();
  env.DB.sqlite.exec("CREATE TABLE articles (id TEXT PRIMARY KEY, kind TEXT NOT NULL, owner TEXT NOT NULL, story TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, source TEXT NOT NULL, lang TEXT, published_at INTEGER NOT NULL, seen_at INTEGER NOT NULL, tokens TEXT NOT NULL, vector TEXT, affinity REAL NOT NULL DEFAULT 0, opened_at INTEGER, hidden_at INTEGER, saved_at INTEGER, notified_at INTEGER)");
  assert.equal((await api(worker, env, "/api/state", {})).status, 200);
  assert.ok(rows(env, "PRAGMA table_info(articles)").some((column) => column.name === "image"));
});

test("a site without any feed is refused", async () => {
  const env = environment();
  network([["https://none.example/", () => new Response("<html><head><title>None</title></head></html>")]]);
  const response = await api(worker, env, "/api/sources", { action: "add", url: "none.example" });
  assert.equal(response.status, 422);
  assert.equal(response.json.error, "no_feed");
});

test("the cron fetches only due feeds, backs off failures and honours not modified", async () => {
  const env = environment();
  const now = Date.now();
  await withTopic(env, now);
  network([[/news\.google\.com/, () => new Response("busy", { status: 503 })]]);
  assert.equal((await refresh(env, now + 5 * 60000)).added, 0);
  assert.equal(rows(env, "SELECT MAX(failures) AS n FROM feeds")[0].n, 0);
  await refresh(env, now + 16 * 60000);
  assert.deepEqual(rows(env, "SELECT failures FROM feeds").map((row) => row.failures), [1, 1]);
  assert.deepEqual(rows(env, "SELECT kind, message FROM errors").map((row) => [row.kind, row.message]), [["feed", "http 503 (news.google.com)"], ["feed", "http 503 (news.google.com)"]]);
  const calls = network([[/news\.google\.com/, () => new Response(null, { status: 304 })]]);
  await refresh(env, now + 32 * 60000);
  assert.equal(calls.length, 0);
  await refresh(env, now + 47 * 60000);
  assert.equal(calls.length, 2);
  assert.deepEqual(rows(env, "SELECT failures FROM feeds").map((row) => row.failures), [0, 0]);
});

test("a widely covered story in your topics is pushed once, at most three times a day", async () => {
  const env = environment();
  const now = Date.now();
  await withTopic(env, now);
  const target = await device();
  const pushes = [];
  network([
    [
      target.subscription.endpoint,
      async (request) => {
        pushes.push({ authorization: request.headers.get("authorization"), body: JSON.parse(await decrypt(new Uint8Array(await request.arrayBuffer()), target)) });
        return new Response(null, { status: 201 });
      }
    ]
  ]);
  assert.equal((await api(worker, env, "/api/push", { action: "subscribe", subscription: target.subscription, lang: "el" }, { host: "localhost" })).status, 200);
  const story = rows(env, "SELECT story FROM articles WHERE title LIKE 'Λεβαντόφσκι%'")[0].story;
  env.DB.sqlite.prepare("UPDATE articles SET affinity = CASE WHEN story = ? THEN 0.9 ELSE 0.1 END").run(story);
  env.DB.sqlite.prepare("INSERT INTO articles (id, kind, owner, story, title, url, source, lang, published_at, seen_at, tokens, vector, affinity) SELECT 'extra', kind, owner, story, 'Γαλατάσαραϊ: Λεβαντόφσκι ξανά', 'https://news.google.com/rss/articles/x', 'Sport-FM', lang, ?, ?, tokens, vector, 0.8 FROM articles WHERE story = ? LIMIT 1").run(now - HOUR, now, story);
  assert.equal(await notify(env, now, new Set([story])), story);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].body.web_push, 8030);
  assert.equal(pushes[0].body.notification.body.endsWith("· 4 πηγές"), true);
  assert.equal(pushes[0].body.notification.navigate, "https://localhost/");
  assert.match(pushes[0].authorization, /^vapid t=.+, k=.+$/);
  assert.equal(await notify(env, now, new Set([story])), null);
  env.DB.sqlite.prepare("INSERT INTO meta (key, value) VALUES (?, '3') ON CONFLICT(key) DO UPDATE SET value = '3'").run(`sent:${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(now)}`);
  env.DB.sqlite.prepare("UPDATE articles SET notified_at = NULL").run();
  assert.equal(await notify(env, now, new Set([story])), null);
  assert.equal(pushes.length, 1);
});

test("a dead subscription is dropped when the push service says it is gone", async () => {
  const env = environment();
  const now = Date.now();
  await withTopic(env, now);
  const target = await device("https://fcm.googleapis.com/fcm/send/gone");
  network([[target.subscription.endpoint, () => new Response(null, { status: 410 })]]);
  await api(worker, env, "/api/push", { action: "subscribe", subscription: target.subscription, lang: "en" });
  const story = rows(env, "SELECT story FROM articles WHERE title LIKE 'Λεβαντόφσκι%'")[0].story;
  env.DB.sqlite.prepare("UPDATE articles SET affinity = 0.9, source = id WHERE story = ?").run(story);
  env.DB.sqlite.prepare("INSERT INTO articles (id, kind, owner, story, title, url, source, lang, published_at, seen_at, tokens, vector, affinity) SELECT 'extra', kind, owner, story, title, 'https://x.example', 'Fourth', lang, published_at, seen_at, tokens, vector, 0.9 FROM articles WHERE story = ? LIMIT 1").run(story);
  assert.equal(await notify(env, now, new Set([story])), story);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM subscriptions")[0].n, 0);
  assert.equal((await api(worker, env, "/api/push", { action: "subscribe", subscription: { endpoint: "https://evil.example/x", keys: {} } })).status, 400);
});

test("pruning drops old unsaved articles and orphans", async () => {
  const env = environment();
  const now = Date.now();
  await withTopic(env, now);
  const ids = rows(env, "SELECT id FROM articles ORDER BY id").map((row) => row.id);
  env.DB.sqlite.prepare("UPDATE articles SET seen_at = ?").run(now - 4 * 86400000);
  env.DB.sqlite.prepare("UPDATE articles SET saved_at = ? WHERE id = ?").run(now, ids[0]);
  env.DB.sqlite.prepare("INSERT INTO articles (id, kind, owner, story, title, url, source, published_at, seen_at, tokens) VALUES ('orphan', 'source', 'gone', 'orphan', 'T', 'https://x.example', 'X', ?, ?, '')").run(now, now);
  await prune(env, now);
  assert.deepEqual(rows(env, "SELECT id FROM articles").map((row) => row.id), [ids[0]]);
});

test("the cron runs refresh, notify and prune without throwing", async () => {
  const env = environment();
  const now = Date.now();
  await withTopic(env, now);
  network([[/news\.google\.com/, () => new Response(greek(now))]]);
  const ctx = context();
  await worker.scheduled({ scheduledTime: now + 20 * 60000 }, env, ctx);
  await ctx.settle();
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM errors")[0].n, 0);
});

test("requests need a valid Access session away from localhost", async () => {
  const env = environment();
  network([]);
  assert.equal((await api(worker, env, "/api/state", {}, { host: "news.example.workers.dev" })).status, 403);
  assert.equal((await api(worker, env, "/api/state", undefined, { method: "GET" })).status, 405);
  assert.equal((await api(worker, env, "/api/nothing", {})).status, 404);
});
