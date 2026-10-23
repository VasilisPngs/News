import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { base64UrlDecode, base64UrlEncode } from "../src/push.js";

function database() {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(dir).sort()) db.exec(readFileSync(new URL(file, dir), "utf8"));
  const statement = (sql, params = []) => ({
    bind: (...values) => statement(sql, values),
    first: async (column) => {
      const row = db.prepare(sql).get(...params);
      if (row === undefined) return null;
      return column ? row[column] : { ...row };
    },
    all: async () => ({ success: true, results: db.prepare(sql).all(...params).map((row) => ({ ...row })) }),
    run: async () => {
      const info = db.prepare(sql).run(...params);
      return { success: true, meta: { changes: info.changes } };
    }
  });
  return {
    sqlite: db,
    prepare: (sql) => statement(sql),
    batch: async (statements) => {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const item of statements) results.push(await item.all());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  };
}

export function context() {
  const pending = [];
  return {
    waitUntil: (promise) => pending.push(promise),
    settle: async () => {
      while (pending.length) await Promise.allSettled(pending.splice(0));
    }
  };
}

function wordVector(text) {
  const vector = new Array(1024).fill(0);
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    let hash = 0;
    for (const char of word) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
    vector[hash % 1024] += 1;
  }
  vector[1023] += 0.01;
  return vector;
}

export function ai({ sites = [] } = {}) {
  const calls = [];
  return {
    calls,
    run: async (model, input) => {
      calls.push({ model, input });
      if (model === "@cf/baai/bge-m3") return { shape: [input.text.length, 1024], data: input.text.map(wordVector) };
      if (model === "@cf/google/gemma-4-26b-a4b-it") return { choices: [{ message: { role: "assistant", content: sites.join("\n") } }] };
      throw new Error(`unexpected model ${model}`);
    }
  };
}

export function environment(overrides = {}) {
  return { DB: database(), AI: ai(), ACCESS_TEAM_DOMAIN: "team.example", ...overrides };
}

export function network(routes) {
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    calls.push(request.clone());
    for (const [match, respond] of routes) {
      if (typeof match === "string" ? request.url === match : match.test(request.url)) return respond(request);
    }
    return new Response("not found", { status: 404 });
  };
  return calls;
}

export async function api(worker, env, path, body, { ctx = context(), host = "localhost", method = "POST", headers = {} } = {}) {
  const init = { method, headers: { "content-type": "application/json", ...headers } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await worker.fetch(new Request(`https://${host}${path}`, init), env, ctx);
  await ctx.settle();
  return { status: response.status, json: await response.json().catch(() => null) };
}

export const rss = (items, title = "Feed") =>
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${title}</title><link>https://site.example/</link>${items
    .map(
      (item) =>
        `<item><title>${item.title}</title><link>${item.link}</link><pubDate>${new Date(item.at).toUTCString()}</pubDate>${item.source ? `<source url="https://${item.source}.example">${item.source}</source>` : ""}</item>`
    )
    .join("")}</channel></rss>`;

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const concat = (...parts) => Uint8Array.from(parts.flatMap((part) => [...part]));

async function hkdf(salt, secret, info, length) {
  const key = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

export async function device(endpoint = "https://web.push.apple.com/QGuQyavXutnMH6ixG5yj") {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const key = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { pair, subscription: { endpoint, keys: { p256dh: base64UrlEncode(key), auth: base64UrlEncode(auth) } } };
}

export async function decrypt(body, { pair, subscription }) {
  const salt = body.slice(0, 16);
  const serverPublic = body.slice(21, 21 + body[20]);
  const userPublic = base64UrlDecode(subscription.keys.p256dh);
  const serverKey = await crypto.subtle.importKey("raw", serverPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: serverKey }, pair.privateKey, 256));
  const ikm = await hkdf(base64UrlDecode(subscription.keys.auth), shared, concat(encoder.encode("WebPush: info\0"), userPublic, serverPublic), 32);
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, body.slice(21 + body[20])));
  assert.equal(plain.at(-1), 2);
  return decoder.decode(plain.slice(0, -1));
}

