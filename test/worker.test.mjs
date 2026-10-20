import test from "node:test";
import assert from "node:assert/strict";
import worker, { refresh, notify, prune, backfill, pick, icons, posters, domains, suggestNext, tryCandidates } from "../src/index.js";
import { environment, network, api, rss, context, device, decrypt, ai } from "./helpers.mjs";
import { decodeProfile, decodeVector, cosine } from "../src/rank.js";

const HOUR = 3600000;

const gazzetta = (now) =>
  rss(
    [
      { title: "Γαλατάσαραϊ - Μπαρτσελόνα 1-4: Ο Λεβαντόφσκι διέλυσε τη Γαλατάσαραϊ", link: "https://gazzetta.example/a1", at: now - HOUR },
      { title: "Ολυμπιακός: Νίκη στο Καραϊσκάκη", link: "https://gazzetta.example/a2", at: now - 2 * HOUR },
      { title: "Καιρός: Βροχές σε όλη τη χώρα", link: "https://gazzetta.example/a3", at: now - 3 * HOUR },
      { title: "Μπαρτσελόνα: Ανανέωση συμβολαίου για τον Πέδρι", link: "https://gazzetta.example/a4", at: now - 4 * HOUR }
    ],
    "Gazzetta"
  );

const sport = (now) =>
  rss(
    [
      { title: "Λεβαντόφσκι και Γιαμάλ διέλυσαν τη Γαλατάσαραϊ", link: "https://sport.example/b1", at: now - 2 * HOUR },
      { title: "Παναθηναϊκός: Ήττα στην Τούμπα", link: "https://sport.example/b2", at: now - 5 * HOUR }
    ],
    "Sport24"
  );

const sites = (now, extra = []) =>
  network([
    ["https://gazzetta.example/", () => new Response(gazzetta(now))],
    ["https://sport.example/", () => new Response(sport(now))],
    ...extra
  ]);

const SITES = ["gazzetta.example", "sport.example"];

const pooled = (suggested = SITES) => environment({ AI: ai({ sites: suggested }) });

const followed = (now) => [["https://followed.example/", () => new Response(rss([{ title: "Μπαρτσελόνα: Νέα φανέλα για τη σεζόν", link: "https://followed.example/1", at: now - HOUR }], "Followed"))]];

async function setup(env, now = Date.now(), { topic = "Μπαρτσελόνα", follow = [], extra = [] } = {}) {
  sites(now, extra);
  if (topic) await api(worker, env, "/api/topics", { action: "add", name: topic });
  for (const url of follow) await api(worker, env, "/api/sources", { action: "add", url });
  return (await api(worker, env, "/api/state", {})).json;
}

const rows = (env, sql, ...params) => env.DB.sqlite.prepare(sql).all(...params).map((row) => ({ ...row }));

const forYou = async (env) => (await api(worker, env, "/api/feed", { tab: "foryou" })).json.items;

const storyOf = (env, title) => rows(env, "SELECT story FROM articles WHERE title LIKE ?", `${title}%`)[0].story;

const PEDRI = "Μπαρτσελόνα: Ανανέωση συμβολαίου για τον Πέδρι";

test("For You picks from the sites the AI found for your topics, grouped by story, never from the ones you follow", async () => {
  const env = pooled();
  const now = Date.now();
  sites(now, followed(now));
  const response = await api(worker, env, "/api/topics", { action: "add", name: "Μπαρτσελόνα" });
  assert.equal(response.status, 200);
  assert.deepEqual(response.json.topics.map((topic) => topic.name), ["Μπαρτσελόνα"]);
  assert.deepEqual(response.json.sources, []);
  assert.ok(response.json.pushKey.length > 80);
  assert.match(env.AI.calls.find((call) => call.model.includes("gemma")).input.messages[0].content, /"Μπαρτσελόνα"/);
  assert.deepEqual(rows(env, "SELECT title, hidden FROM sources ORDER BY title"), [{ title: "Gazzetta", hidden: 1 }, { title: "Sport24", hidden: 1 }]);
  assert.deepEqual(rows(env, "SELECT domain, tried FROM candidates ORDER BY domain"), [{ domain: "gazzetta.example", tried: 1 }, { domain: "sport.example", tried: 1 }]);
  assert.deepEqual((await api(worker, env, "/api/state", {})).json.sources, []);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM articles WHERE vector IS NOT NULL AND kind = 'source'")[0].n, 6);
  const items = await forYou(env);
  assert.equal(items.length, 4);
  assert.ok(!items.some((item) => item.title.startsWith("Καιρός")));
  const story = items.find((item) => item.coverage === 2);
  assert.match(story.title, /Λεβαντόφσκι/);
  assert.equal(story.source, "Gazzetta");
  assert.equal(story.opened, false);
  assert.equal(items[0].title, PEDRI);
  assert.ok(items.indexOf(story) === 1);
  assert.deepEqual((await api(worker, env, "/api/feed", { tab: "sources" })).json.items, []);
  await api(worker, env, "/api/sources", { action: "add", url: "followed.example" });
  assert.ok(!(await forYou(env)).some((item) => item.source === "Followed"));
  assert.deepEqual((await api(worker, env, "/api/feed", { tab: "sources" })).json.items.map((item) => item.source), ["Followed"]);
  const promoted = await api(worker, env, "/api/sources", { action: "add", url: "gazzetta.example" });
  assert.deepEqual(promoted.json.sources.map((source) => source.title), ["Followed", "Gazzetta"]);
  assert.ok((await forYou(env)).every((item) => item.source === "Sport24"));
});

test("site suggestions are read from any reply layout, and a topic's sites are tried two per cron run", async () => {
  assert.deepEqual(domains("Sure!\n1. **www.Gazzetta.gr** – sports\n- https://www.bbc.co.uk/sport\n9to5mac.com\n9to5mac.com"), ["gazzetta.gr", "bbc.co.uk", "9to5mac.com"]);
  const reasoning = environment({ AI: { run: async () => ({ choices: [{ message: { content: null, reasoning_content: "Candidates: gazzetta.example and sport.example" } }] }) } });
  sites(Date.now());
  await api(worker, reasoning, "/api/topics", { action: "add", name: "Μπάλα" });
  assert.deepEqual(rows(reasoning, "SELECT domain FROM candidates ORDER BY domain").map((row) => row.domain), ["gazzetta.example", "sport.example"]);
  const env = pooled(["gazzetta.example", "none.example", "sport.example"]);
  const now = Date.now();
  sites(now);
  await api(worker, env, "/api/state", {});
  env.DB.sqlite.prepare("INSERT INTO topics (id, name, vector, position, created_at) VALUES ('t1', 'Μπαρτσελόνα', NULL, 0, 1)").run();
  assert.equal(await suggestNext(env, now), 3);
  assert.equal(await suggestNext(env, now), 0);
  assert.equal((await tryCandidates(env)).length, 1);
  assert.equal((await tryCandidates(env)).length, 1);
  assert.deepEqual(await tryCandidates(env), []);
  assert.deepEqual(rows(env, "SELECT title FROM sources WHERE hidden = 1 AND topic = 't1' ORDER BY title").map((row) => row.title), ["Gazzetta", "Sport24"]);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM feeds")[0].n, 2);
});

test("the median gate keeps the better half and relevance outweighs freshness", () => {
  const now = Date.now();
  const row = (id, affinity, coverage = 1, age = 0) => ({ id, affinity, coverage, published_at: now - age * HOUR });
  const picked = pick([row("a", 0.1), row("b", 0.5, 1, 40), row("c", 0.45, 3, 1), row("d", 0.2), row("e", 0.3), row("f", 0.48, 1, 2), row("g", 0.05)], now);
  assert.deepEqual(picked.map((entry) => entry.id), ["f", "c", "b", "e"]);
  assert.deepEqual(pick([row("x", 0), row("y", 0)], now).map((entry) => entry.id).sort(), ["x", "y"]);
  assert.deepEqual(pick([], now), []);
});

test("stories you keep scrolling past make room for others", () => {
  const now = Date.now();
  const row = (id, affinity, views = 0) => ({ id, affinity, coverage: 1, published_at: now - HOUR, views });
  const order = (views) => pick([row("a", 1, views), row("b", 0.9), row("c", 0.8), row("d", 0.1), row("e", 0.2)], now).map((entry) => entry.id);
  assert.deepEqual(order(0), ["a", "b", "c"]);
  assert.deepEqual(order(6), ["b", "a", "c"]);
  assert.deepEqual(order(60), ["b", "a", "c"]);
});

test("close neighbours from the same source or about the same thing are spread apart", () => {
  const now = Date.now();
  const row = (id, affinity, source, tokens) => ({ id, affinity, coverage: 1, published_at: now - HOUR, source, tokens });
  const rows = [row("a1", 0.5, "S", "apple homevi"), row("a2", 0.5, "S", "apple tv"), row("a3", 0.5, "S", "apple watch"), row("b1", 0.5, "T", "barcel pedri"), row("b2", 0.5, "T", "olympi niki"), row("l1", 0.1), row("l2", 0.1)];
  assert.deepEqual(pick(rows, now, 4).map((entry) => entry.id), ["a1", "b1", "a2", "b2"]);
});

test("every fifth place goes to something outside the usual, never to what you turned away from", () => {
  const now = Date.now();
  const row = (id, affinity, coverage = 1, age = 1) => ({ id, affinity, coverage, published_at: now - age * HOUR });
  const rows = [row("u1", 1), row("u2", 0.9), row("u3", 0.8), row("u4", 0.7), row("u5", 0.6), row("u6", 0.65), row("e1", 0.5), row("e2", 0.4, 3), row("e3", 0.35), row("no1", 0.2, 5), row("no2", 0.1, 5)];
  const ids = pick(rows, now).map((entry) => entry.id);
  assert.deepEqual(ids, ["u1", "u2", "u3", "u4", "e2", "u6", "u5"]);
  assert.ok(!ids.includes("no1") && !ids.includes("no2"));
  assert.deepEqual(pick(rows, now, 3).map((entry) => entry.id), ["u1", "u2", "u3"]);
});

test("a topic added later rescores the articles already there", async () => {
  const env = environment();
  await setup(env, Date.now(), { topic: null, follow: SITES });
  assert.ok(rows(env, "SELECT affinity FROM articles").every((row) => row.affinity === 0));
  await api(worker, env, "/api/topics", { action: "add", name: "Μπαρτσελόνα" });
  const pedri = rows(env, "SELECT affinity FROM articles WHERE title = ?", PEDRI)[0].affinity;
  const weather = rows(env, "SELECT affinity FROM articles WHERE title LIKE 'Καιρός%'")[0].affinity;
  assert.ok(pedri > 0.3 && weather < 0.05);
});

test("adding the same topic twice is refused and renaming re-embeds it", async () => {
  const env = environment();
  const id = (await api(worker, env, "/api/topics", { action: "add", name: "Μπαρτσελόνα" })).json.topics[0].id;
  const before = rows(env, "SELECT vector FROM topics")[0].vector;
  assert.equal((await api(worker, env, "/api/topics", { action: "add", name: "μπαρτσελόνα" })).status, 409);
  const renamed = await api(worker, env, "/api/topics", { action: "rename", id, name: "AI" });
  assert.deepEqual(renamed.json.topics, [{ id, name: "AI" }]);
  assert.notEqual(rows(env, "SELECT vector FROM topics")[0].vector, before);
  assert.equal((await api(worker, env, "/api/topics", { action: "rename", id: "missing", name: "X" })).status, 404);
  assert.equal((await api(worker, env, "/api/topics", { action: "add", name: "   " })).status, 400);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM feeds")[0].n, 0);
});

test("opening, saving and Suggest Less shape the feed and the profile", async () => {
  const env = pooled();
  await setup(env);
  const items = await forYou(env);
  const story = items.find((item) => item.coverage === 2);
  const other = items.find((item) => item.title === PEDRI);
  assert.equal((await api(worker, env, "/api/article", { id: story.id, action: "open" })).status, 200);
  assert.ok(rows(env, "SELECT value FROM meta WHERE key = 'profile'")[0].value.length > 1000);
  assert.equal((await api(worker, env, "/api/article", { id: other.id, action: "save" })).status, 200);
  let feed = await forYou(env);
  assert.ok(!feed.some((item) => item.coverage === 2 || /Λεβαντόφσκι/.test(item.title)));
  assert.equal(feed.find((item) => item.id === other.id).saved, true);
  assert.ok(rows(env, "SELECT opened_at FROM articles WHERE id = ?", story.id)[0].opened_at > 0);
  const saved = (await api(worker, env, "/api/feed", { tab: "saved" })).json.items;
  assert.deepEqual(saved.map((item) => [item.id, item.source]), [[other.id, "Gazzetta"]]);
  await api(worker, env, "/api/article", { id: other.id, action: "less" });
  feed = await forYou(env);
  assert.ok(!feed.some((item) => item.id === other.id));
  assert.ok(feed.length > 0);
  await api(worker, env, "/api/article", { id: other.id, action: "unsave" });
  assert.equal((await api(worker, env, "/api/feed", { tab: "saved" })).json.items.length, 0);
  assert.equal((await api(worker, env, "/api/article", { id: "nope", action: "open" })).status, 404);
  assert.equal((await api(worker, env, "/api/article", { id: other.id, action: "explode" })).status, 400);
});

test("time away after opening an article teaches the profile once: a quick return counts against it, a long one for it", async () => {
  const after = async (seconds) => {
    const env = pooled();
    await setup(env);
    const article = (await forYou(env)).find((item) => item.title === PEDRI);
    assert.equal((await api(worker, env, "/api/article", { id: article.id, action: "dwell", seconds })).status, 200);
    assert.equal(rows(env, "SELECT dwell FROM articles WHERE id = ?", article.id)[0].dwell, null);
    await api(worker, env, "/api/article", { id: article.id, action: "open" });
    await api(worker, env, "/api/article", { id: article.id, action: "dwell", seconds });
    const profile = decodeProfile(rows(env, "SELECT value FROM meta WHERE key = 'profile'")[0].value);
    await api(worker, env, "/api/article", { id: article.id, action: "dwell", seconds: 600 });
    assert.deepEqual(decodeProfile(rows(env, "SELECT value FROM meta WHERE key = 'profile'")[0].value), profile);
    assert.equal(rows(env, "SELECT dwell FROM articles WHERE id = ?", article.id)[0].dwell, seconds);
    assert.equal((await api(worker, env, "/api/article", { id: article.id, action: "dwell", seconds: "soon" })).status, 400);
    assert.equal((await api(worker, env, "/api/article", { id: article.id, action: "read" })).status, 400);
    const vector = decodeVector(rows(env, "SELECT vector FROM articles WHERE id = ?", article.id)[0].vector);
    return { direction: cosine(vector, profile), strength: Math.hypot(...profile) };
  };
  const bounce = await after(4);
  const skim = await after(30);
  const read = await after(90);
  assert.ok(bounce.direction < -0.99);
  assert.ok(skim.direction > 0.99 && read.direction > 0.99);
  assert.ok(read.strength > 3 * skim.strength);
});

test("For You counts a story seen at most once every half hour and moves it down after repeated views", async () => {
  const env = pooled();
  await setup(env);
  const items = await forYou(env);
  const top = items[0];
  const views = () => rows(env, "SELECT views FROM articles WHERE id = ?", top.id)[0].views;
  assert.equal((await api(worker, env, "/api/seen", { ids: [top.id, top.id, 5, ""] })).status, 200);
  assert.equal(views(), 1);
  await api(worker, env, "/api/seen", { ids: [top.id] });
  assert.equal(views(), 1);
  env.DB.sqlite.prepare("UPDATE articles SET viewed_at = ? WHERE id = ?").run(Date.now() - 31 * 60000, top.id);
  await api(worker, env, "/api/seen", { ids: [top.id] });
  assert.equal(views(), 2);
  assert.equal((await api(worker, env, "/api/seen", { ids: "nope" })).status, 200);
  env.DB.sqlite.prepare("UPDATE articles SET views = 6 WHERE id = ?").run(top.id);
  const after = await forYou(env);
  assert.notEqual(after[0].id, top.id);
  assert.ok(after.some((item) => item.id === top.id));
});

test("renaming a topic looks for its sites again and deleting it drops them, keeping saved articles and followed sites", async () => {
  const env = pooled();
  const now = Date.now();
  const state = await setup(env, now, { follow: ["followed.example"], extra: followed(now) });
  const id = state.topics[0].id;
  const pedri = rows(env, "SELECT id FROM articles WHERE title = ?", PEDRI)[0].id;
  await api(worker, env, "/api/article", { id: pedri, action: "save" });
  const before = rows(env, "SELECT id FROM sources WHERE hidden = 1").map((row) => row.id);
  await api(worker, env, "/api/topics", { action: "rename", id, name: "Ποδόσφαιρο" });
  const again = rows(env, "SELECT id FROM sources WHERE hidden = 1").map((row) => row.id);
  assert.equal(again.length, 2);
  assert.ok(again.every((source) => !before.includes(source)));
  assert.equal(env.AI.calls.filter((call) => call.model.includes("gemma")).length, 2);
  const after = await api(worker, env, "/api/topics", { action: "delete", id });
  assert.deepEqual(after.json.topics, []);
  assert.deepEqual(rows(env, "SELECT title FROM sources"), [{ title: "Followed" }]);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM candidates")[0].n, 0);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM feeds")[0].n, 1);
  assert.deepEqual(rows(env, "SELECT title FROM articles ORDER BY title").map((row) => row.title), ["Μπαρτσελόνα: Νέα φανέλα για τη σεζόν", PEDRI].sort());
  assert.equal((await api(worker, env, "/api/feed", { tab: "saved" })).json.items[0].title, PEDRI);
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
  assert.deepEqual(await forYou(env), []);
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

test("articles show their source's icon, found when the source is added or filled in by the cron", async () => {
  const env = environment();
  const now = Date.now();
  const feed = `<rss><channel><title>Icons</title><link>https://icons.example/</link><item><title>One</title><link>https://icons.example/1</link><pubDate>${new Date(now - HOUR).toUTCString()}</pubDate></item></channel></rss>`;
  network([
    ["https://icons.example/", () => new Response('<html><head><link rel="alternate" type="application/rss+xml" href="/feed"><link rel="icon" sizes="64x64" href="/i64.png"></head></html>')],
    ["https://icons.example/feed", () => new Response(feed)]
  ]);
  await api(worker, env, "/api/sources", { action: "add", url: "icons.example" });
  assert.equal(rows(env, "SELECT icon FROM sources")[0].icon, "https://icons.example/i64.png");
  assert.equal((await api(worker, env, "/api/feed", { tab: "sources" })).json.items[0].icon, "https://icons.example/i64.png");
  const id = (await api(worker, env, "/api/feed", { tab: "sources" })).json.items[0].id;
  await api(worker, env, "/api/article", { id, action: "save" });
  assert.equal((await api(worker, env, "/api/feed", { tab: "saved" })).json.items[0].icon, "https://icons.example/i64.png");
  env.DB.sqlite.prepare("UPDATE sources SET icon = NULL").run();
  assert.equal(await icons(env), 1);
  assert.equal(rows(env, "SELECT icon FROM sources")[0].icon, "https://icons.example/i64.png");
  assert.equal(await icons(env), 0);
  await api(worker, env, "/api/sources", { action: "add", url: "https://icons.example/feed" });
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM sources")[0].n, 1);
});

test("an article whose feed has no picture takes its page's share picture, once", async () => {
  const env = environment();
  const now = Date.now();
  let feedImage = "";
  const item = (n) => `<item><title>Story ${n}</title><link>https://plain.example/${n}</link><pubDate>${new Date(now - n * HOUR).toUTCString()}</pubDate>${n === 1 ? feedImage : ""}</item>`;
  const calls = network([
    ["https://plain.example/", () => new Response(`<rss><channel><title>Plain</title><link>https://plain.example/</link>${item(1)}${item(2)}</channel></rss>`)],
    ["https://plain.example/1", () => new Response('<html><head><meta property="og:image" content="https://plain.example/1.png"></head></html>')],
    ["https://plain.example/2", () => new Response("<html><head></head></html>")]
  ]);
  await api(worker, env, "/api/sources", { action: "add", url: "plain.example" });
  const images = () => Object.fromEntries(rows(env, "SELECT title, image FROM articles").map((row) => [row.title, row.image]));
  assert.deepEqual(images(), { "Story 1": "https://plain.example/1.png", "Story 2": "" });
  const items = (await api(worker, env, "/api/feed", { tab: "sources" })).json.items;
  assert.deepEqual(items.map((entry) => entry.image), ["https://plain.example/1.png", null]);
  const pages = calls.filter((request) => /\/[12]$/.test(request.url)).length;
  assert.equal(await posters(env, now), 0);
  assert.equal(calls.filter((request) => /\/[12]$/.test(request.url)).length, pages);
  env.DB.sqlite.prepare("UPDATE articles SET image = '' WHERE title = 'Story 1'").run();
  feedImage = '<enclosure url="https://plain.example/feed1.jpg" type="image/jpeg"/>';
  await refresh(env, now + 21 * 60000);
  assert.equal(images()["Story 1"], "https://plain.example/feed1.jpg");
});

test("articles stored without a vector get one later and are grouped by story", async () => {
  const env = environment({ AI: { run: async () => Promise.reject(new Error("down")) } });
  const now = Date.now();
  await setup(env, now, { topic: null, follow: SITES });
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM articles WHERE vector IS NULL AND tokens = ''")[0].n, 6);
  env.AI = ai();
  assert.equal(await backfill(env, now), 6);
  assert.equal(await backfill(env, now), 0);
  assert.equal(rows(env, "SELECT COUNT(DISTINCT story) AS n FROM articles")[0].n, 5);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM articles WHERE story = ?", storyOf(env, "Λεβαντόφσκι"))[0].n, 2);
});

test("pulling to refresh fetches the stale feeds of that tab only, and not again within two minutes", async () => {
  const env = pooled();
  const now = Date.now();
  await setup(env, now, { follow: ["followed.example"], extra: followed(now) });
  env.DB.sqlite.prepare("UPDATE feeds SET fetched_at = ?").run(now - 3 * 60000);
  const feedsFetched = (calls) => calls.filter((request) => new URL(request.url).pathname === "/").map((request) => new URL(request.url).host).sort();
  let calls = sites(now, followed(now));
  assert.deepEqual((await api(worker, env, "/api/refresh", { tab: "sources" })).json, { added: 0 });
  assert.deepEqual(feedsFetched(calls), ["followed.example"]);
  calls = sites(now, followed(now));
  await api(worker, env, "/api/refresh", { tab: "sources" });
  assert.deepEqual(feedsFetched(calls), []);
  await api(worker, env, "/api/refresh", { tab: "foryou" });
  assert.deepEqual(feedsFetched(calls), ["gazzetta.example", "sport.example"]);
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
  await setup(env, now, { topic: null, follow: ["gazzetta.example"] });
  network([["https://gazzetta.example/", () => new Response("busy", { status: 503 })]]);
  assert.equal((await refresh(env, now + 5 * 60000)).added, 0);
  assert.equal(rows(env, "SELECT failures FROM feeds")[0].failures, 0);
  await refresh(env, now + 21 * 60000);
  assert.equal(rows(env, "SELECT failures FROM feeds")[0].failures, 1);
  assert.deepEqual(rows(env, "SELECT kind, message FROM errors").map((row) => [row.kind, row.message]), [["feed", "http 503 (gazzetta.example)"]]);
  const calls = network([["https://gazzetta.example/", () => new Response(null, { status: 304 })]]);
  await refresh(env, now + 55 * 60000);
  assert.equal(calls.length, 0);
  await refresh(env, now + 62 * 60000);
  assert.equal(calls.length, 1);
  assert.equal(rows(env, "SELECT failures FROM feeds")[0].failures, 0);
});

async function subscribed(env, endpoint) {
  const target = await device(endpoint);
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
  assert.equal((await api(worker, env, "/api/push", { action: "subscribe", subscription: target.subscription, lang: "el" })).status, 200);
  return pushes;
}

const highlight = (env, story) => env.DB.sqlite.prepare("UPDATE articles SET affinity = CASE WHEN story = ? THEN 0.9 ELSE 0.1 END").run(story);

test("a story your sources share in your topics is pushed once, at most three times a day", async () => {
  const env = pooled();
  const now = Date.now();
  await setup(env, now);
  const pushes = await subscribed(env);
  const story = storyOf(env, "Λεβαντόφσκι");
  highlight(env, story);
  env.DB.sqlite.prepare("INSERT INTO meta (key, value) VALUES ('threshold', ?)").run(`${now} 0.95`);
  assert.equal(await notify(env, now, new Set([story])), null);
  env.DB.sqlite.prepare("UPDATE meta SET value = ? WHERE key = 'threshold'").run(`${now - 3600000} 0.95`);
  assert.equal(await notify(env, now, new Set([story])), story);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].body.web_push, 8030);
  assert.equal(pushes[0].body.notification.body, "Gazzetta · 2 πηγές");
  assert.equal(pushes[0].body.notification.navigate, "https://localhost/");
  assert.match(pushes[0].authorization, /^vapid t=.+, k=.+$/);
  assert.equal(await notify(env, now, new Set([story])), null);
  env.DB.sqlite.prepare("INSERT INTO meta (key, value) VALUES (?, '3') ON CONFLICT(key) DO UPDATE SET value = '3'").run(`sent:${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(now)}`);
  env.DB.sqlite.prepare("UPDATE articles SET notified_at = NULL").run();
  assert.equal(await notify(env, now, new Set([story])), null);
  assert.equal(pushes.length, 1);
});

test("a lone source, a story only one source wrote, or a dull story never push", async () => {
  const env = pooled(["gazzetta.example"]);
  const now = Date.now();
  await setup(env, now);
  const early = await subscribed(env);
  const story = storyOf(env, "Γαλατάσαραϊ");
  highlight(env, story);
  assert.equal(await notify(env, now, new Set([story])), null);
  sites(now);
  await api(worker, env, "/api/sources", { action: "add", url: "sport.example" });
  const later = await subscribed(env);
  const single = storyOf(env, PEDRI);
  highlight(env, single);
  assert.equal(await notify(env, now, new Set([single])), null);
  env.DB.sqlite.prepare("UPDATE articles SET affinity = CASE WHEN story = ? THEN 0.1 ELSE 0.9 END").run(story);
  assert.equal(await notify(env, now, new Set([story])), null);
  assert.equal(early.length + later.length, 0);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM subscriptions")[0].n, 1);
});

test("a dead subscription is dropped when the push service says it is gone", async () => {
  const env = pooled();
  const now = Date.now();
  await setup(env, now);
  const target = await device("https://fcm.googleapis.com/fcm/send/gone");
  network([[target.subscription.endpoint, () => new Response(null, { status: 410 })]]);
  await api(worker, env, "/api/push", { action: "subscribe", subscription: target.subscription, lang: "en" });
  const story = storyOf(env, "Λεβαντόφσκι");
  highlight(env, story);
  assert.equal(await notify(env, now, new Set([story])), story);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM subscriptions")[0].n, 0);
  assert.equal((await api(worker, env, "/api/push", { action: "subscribe", subscription: { endpoint: "https://evil.example/x", keys: {} } })).status, 400);
});

test("pruning drops unsaved articles after two weeks", async () => {
  const env = pooled();
  const now = Date.now();
  await setup(env, now);
  const ids = rows(env, "SELECT id FROM articles ORDER BY id").map((row) => row.id);
  env.DB.sqlite.prepare("UPDATE articles SET seen_at = ?").run(now - 13 * 86400000);
  await prune(env, now);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM articles")[0].n, 6);
  env.DB.sqlite.prepare("UPDATE articles SET seen_at = ?").run(now - 15 * 86400000);
  env.DB.sqlite.prepare("UPDATE articles SET saved_at = ? WHERE id = ?").run(now, ids[0]);
  await prune(env, now);
  assert.deepEqual(rows(env, "SELECT id FROM articles").map((row) => row.id), [ids[0]]);
});

test("the hourly cron runs refresh, notify, backfill, rescore and prune without throwing", async () => {
  const env = pooled();
  const now = Date.now();
  await setup(env, now);
  const when = Math.ceil((now + 21 * 60000) / HOUR) * HOUR;
  const calls = sites(when);
  const ctx = context();
  await worker.scheduled({ scheduledTime: when }, env, ctx);
  await ctx.settle();
  assert.equal(calls.filter((request) => new URL(request.url).pathname === "/").length, 2);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM errors")[0].n, 0);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM articles")[0].n, 6);
});

test("requests need a valid Access session away from localhost", async () => {
  const env = environment();
  network([]);
  assert.equal((await api(worker, env, "/api/state", {}, { host: "news.example.workers.dev" })).status, 403);
  assert.equal((await api(worker, env, "/api/state", undefined, { method: "GET" })).status, 405);
  assert.equal((await api(worker, env, "/api/nothing", {})).status, 404);
});
