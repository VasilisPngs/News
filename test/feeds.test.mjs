import test from "node:test";
import assert from "node:assert/strict";
import { parseFeed, looksLikeFeed, normalizeSite, discover, siteIcon, pageImage } from "../src/feeds.js";
import { network, rss } from "./helpers.mjs";

const NOW = Date.parse("2026-10-14T10:00:00Z");

test("RSS items keep plain text and lose the Google News source suffix", () => {
  const xml = `<?xml version="1.0"?><rss><channel><title><![CDATA[Site &amp; More]]></title><link>https://site.example/</link>
    <item><title><![CDATA[Μπαρτσελόνα: <b>νίκη</b> με 4-1 - Novasports]]></title><link>https://news.google.com/rss/articles/abc?oc=5</link><pubDate>Tue, 13 Oct 2026 21:36:48 GMT</pubDate><source url="https://www.novasports.gr">Novasports</source></item>
    <item><title>Tom &#38; Jerry &quot;live&quot;</title><link>/relative/path</link><pubDate>garbage</pubDate></item>
    <item><title> </title><link>https://x.example/empty</link></item>
    <item><title>From the future</title><link>https://x.example/future</link><pubDate>Fri, 01 Jan 2100 00:00:00 GMT</pubDate></item>
  </channel></rss>`;
  const feed = parseFeed(xml, "https://site.example/rss", NOW);
  assert.equal(feed.title, "Site & More");
  assert.equal(feed.site, "https://site.example/");
  assert.deepEqual(
    feed.items.map((item) => item.title),
    ["Μπαρτσελόνα: νίκη με 4-1", 'Tom & Jerry "live"', "From the future"]
  );
  assert.equal(feed.items[0].source, "Novasports");
  assert.equal(feed.items[0].published, Date.parse("Tue, 13 Oct 2026 21:36:48 GMT"));
  assert.equal(feed.items[1].url, "https://site.example/relative/path");
  assert.equal(feed.items[1].published, NOW);
  assert.equal(feed.items[2].published, NOW);
});

test("a feed that labels local time with the wrong offset is shifted back by whole hours", () => {
  const xml = rss([
    { title: "Just now", link: "https://gz.example/1", at: NOW + 57 * 60000 },
    { title: "Earlier", link: "https://gz.example/2", at: NOW - 60 * 60000 }
  ]);
  const feed = parseFeed(xml, "https://gz.example/rss", NOW);
  assert.deepEqual(feed.items.map((item) => item.published), [NOW - 3 * 60000, NOW - 120 * 60000]);
  const scheduled = parseFeed(rss([{ title: "Next week", link: "https://gz.example/3", at: NOW + 7 * 86400000 }]), "https://gz.example/rss", NOW);
  assert.equal(scheduled.items[0].published, NOW);
});

test("each item takes its picture from media tags, enclosures or the first real image in its text", () => {
  const xml = `<?xml version="1.0"?><rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Pics</title>
    <item><title>Media</title><link>https://p.example/1</link><media:content url="https://cdn.example/big.jpg" medium="image" width="1600"/><media:content url="https://cdn.example/small.jpg" medium="image" width="320"/><media:content url="https://cdn.example/clip.mp4" type="video/mp4"/></item>
    <item><title>Thumb</title><link>https://p.example/2</link><media:thumbnail url="http://cdn.example/thumb.jpg"/></item>
    <item><title>Enclosure</title><link>https://p.example/3</link><enclosure url="/uploads/e.webp" length="1" type="image/webp"/></item>
    <item><title>Escaped</title><link>https://p.example/4</link><description>&lt;img src="https://track.example/p.gif" width="1" height="1"&gt;&lt;p&gt;Hi &lt;img src="https://cdn.example/full.jpg" srcset="https://cdn.example/full-150.jpg 150w, https://cdn.example/full-300.jpg 300w, https://cdn.example/full-1024.jpg 1024w"&gt;&lt;/p&gt;</description></item>
    <item><title>Cdata</title><link>https://p.example/5</link><content:encoded><![CDATA[<figure><img data-src="https://cdn.example/lazy.png"></figure>]]></content:encoded></item>
    <item><title>Nothing</title><link>https://p.example/6</link><description>Plain words</description></item>
  </channel></rss>`;
  assert.deepEqual(
    parseFeed(xml, "https://p.example/feed", NOW).items.map((item) => item.image),
    ["https://cdn.example/small.jpg", "https://cdn.example/thumb.jpg", "https://p.example/uploads/e.webp", "https://cdn.example/full-300.jpg", "https://cdn.example/lazy.png", ""]
  );
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>A</title><entry><title>T</title><link href="https://a.example/1"/><link rel="enclosure" type="image/jpeg" href="https://a.example/1.jpg"/><updated>2026-10-14T08:00:00Z</updated></entry></feed>`;
  assert.equal(parseFeed(atom, "https://a.example/feed", NOW).items[0].image, "https://a.example/1.jpg");
});

test("Atom entries take the alternate link and the published time", () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title><link rel="self" href="https://blog.example/atom.xml"/><link href="https://blog.example/"/>
    <entry><title type="html">First &lt;post&gt;</title><link rel="replies" href="https://blog.example/1#comments"/><link rel="alternate" href="https://blog.example/1"/><published>2026-10-14T08:00:00Z</published><updated>2026-10-14T09:00:00Z</updated></entry>
    <entry><title>Second</title><link href="/2"/><updated>2026-10-13T08:00:00Z</updated></entry>
  </feed>`;
  const feed = parseFeed(xml, "https://blog.example/atom.xml", NOW);
  assert.equal(feed.title, "Blog");
  assert.equal(feed.site, "https://blog.example/");
  assert.deepEqual(
    feed.items.map((item) => [item.title, item.url, item.published]),
    [
      ["First", "https://blog.example/1", Date.parse("2026-10-14T08:00:00Z")],
      ["Second", "https://blog.example/2", Date.parse("2026-10-13T08:00:00Z")]
    ]
  );
});

test("feed detection and site addresses", () => {
  assert.equal(looksLikeFeed('<?xml version="1.0"?>\n<!-- generator --><rss version="2.0">'), true);
  assert.equal(looksLikeFeed("<feed xmlns='http://www.w3.org/2005/Atom'>"), true);
  assert.equal(looksLikeFeed("<!doctype html><html>"), false);
  assert.equal(normalizeSite("gazzetta.gr"), "https://gazzetta.gr/");
  assert.equal(normalizeSite("http://blog.example/path"), "http://blog.example/path");
  assert.equal(normalizeSite("javascript:alert(1)"), "");
  assert.equal(normalizeSite(""), "");
});

test("a site address leads to the feed its page links to", async () => {
  network([
    ["https://blog.example/", () => new Response('<html><head><title>My Blog - Home</title><meta property="og:site_name" content="My Blog"><link rel="alternate" type="application/rss+xml" href="/feed.xml"><link rel="apple-touch-icon" href="/apple.png"></head></html>', { headers: { "content-type": "text/html" } })],
    ["https://blog.example/feed.xml", () => new Response(rss([{ title: "Hello", link: "https://blog.example/hello", at: NOW }], "Blog Feed"))],
    ["https://other.example/", () => new Response('<html><head><link rel="alternate" type="application/atom+xml" href="https://other.example/atom"></head></html>')],
    ["https://other.example/atom", () => new Response(rss([{ title: "Hi", link: "https://other.example/hi", at: NOW }], "Other - RSS Feed"))]
  ]);
  const found = await discover("blog.example");
  assert.equal(found.feed, "https://blog.example/feed.xml");
  assert.equal(found.title, "My Blog");
  assert.equal(found.icon, "https://blog.example/apple.png");
  const other = await discover("other.example");
  assert.equal(other.title, "Other");
  assert.equal(other.icon, "https://other.example/favicon.ico");
  assert.equal(found.items.length, 1);
});

test("a site's icon is the smallest one sharp enough for a small mark, else its favicon", async () => {
  network([
    ["https://icons.example/", () => new Response('<html><head><link rel="icon" href="/favicon.ico"><link rel="icon" sizes="32x32" href="/i32.png"><link rel="mask-icon" href="/mask.svg"><link rel="apple-touch-icon" href="/apple.png"><link rel="icon" sizes="96x96" href="http://icons.example/i96.png"></head></html>')],
    ["https://small.example/", () => new Response('<html><head><link rel="shortcut icon" sizes="32x32" href="/s32.png"><link rel="icon" sizes="16x16" href="/s16.png"></head></html>')],
    ["https://plain.example/", () => new Response("<html><head><title>Plain</title></head></html>")],
    ["https://feedonly.example/", () => new Response(rss([{ title: "Hi", link: "https://feedonly.example/hi", at: NOW }]))]
  ]);
  assert.equal(await siteIcon("https://icons.example/feed"), "https://icons.example/i96.png");
  assert.equal(await siteIcon("https://small.example/"), "https://small.example/s32.png");
  assert.equal(await siteIcon("https://plain.example/"), "https://plain.example/favicon.ico");
  assert.equal(await siteIcon("https://feedonly.example/"), "https://feedonly.example/favicon.ico");
  assert.equal(await siteIcon("https://down.example/news"), "https://down.example/favicon.ico");
});

test("an article page gives its share picture when the feed has none", async () => {
  network([
    ["https://a.example/og", () => new Response('<html><head><meta content="/pics/og.png" property="og:image"><meta property="og:image" content="/pics/second.png"></head></html>')],
    ["https://a.example/tw", () => new Response('<html><head><meta name="twitter:image" content="http://a.example/tw.jpg"></head></html>')],
    ["https://a.example/none", () => new Response("<html><head><title>None</title></head></html>")]
  ]);
  assert.equal(await pageImage("https://a.example/og"), "https://a.example/pics/og.png");
  assert.equal(await pageImage("https://a.example/tw"), "https://a.example/tw.jpg");
  assert.equal(await pageImage("https://a.example/none"), "");
  assert.equal(await pageImage("https://a.example/missing"), "");
});

test("without a linked feed the common paths are tried, and a site without one is refused", async () => {
  network([
    ["https://plain.example/", () => new Response("<html><head><title>Plain</title></head></html>")],
    ["https://plain.example/rss", () => new Response(rss([{ title: "Item", link: "https://plain.example/item", at: NOW }], ""))]
  ]);
  const found = await discover("https://plain.example/");
  assert.equal(found.feed, "https://plain.example/rss");
  assert.equal(found.title, "Plain");
  network([["https://none.example/", () => new Response("<html></html>")]]);
  assert.equal(await discover("none.example"), null);
  assert.equal(await discover("not a url at all"), null);
});
