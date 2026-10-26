import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { environment, network, api } from "./helpers.mjs";

const env = environment();
const CERTS = "https://team.example/cdn-cgi/access/certs";
const HOST = "news.example";
const encode = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
const pair = () => crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const keys = { one: await pair(), two: await pair() };
const published = new Set(["one"]);
let certsDown = false;

async function jwks() {
  if (certsDown) return new Response("down", { status: 502 });
  const list = [];
  for (const kid of published) list.push({ ...(await crypto.subtle.exportKey("jwk", keys[kid].publicKey)), kid, alg: "RS256" });
  return Response.json({ keys: list });
}

async function sign({ kid = "one", key = kid, ...overrides } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: "https://team.example", aud: ["aud-1"], exp: now + 600, iat: now, nbf: now, ...overrides };
  const unsigned = `${encode({ alg: "RS256", kid, typ: "JWT" })}.${encode(claims)}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys[key].privateKey, new TextEncoder().encode(unsigned));
  return `${unsigned}.${Buffer.from(signature).toString("base64url")}`;
}

const state = (token, options = {}) => api(worker, options.env || env, "/api/state", {}, { host: HOST, headers: token ? { "cf-access-jwt-assertion": token } : {}, ...options });

const setup = () => {
  const certs = [];
  network([[CERTS, (request) => (certs.push(request), jwks())]]);
  return certs;
};

test("accepts a valid Access token from the header or the cookie and fetches keys once", async () => {
  const certs = setup();
  assert.equal((await state(await sign())).status, 200);
  assert.equal((await state(null, { headers: { cookie: `a=b; CF_Authorization=${await sign()}` } })).status, 200);
  assert.equal(certs.length, 1);
});

test("rejects expired, early, foreign, unsigned or tampered tokens", async () => {
  setup();
  const now = Math.floor(Date.now() / 1000);
  const good = await sign();
  const [head, body] = good.split(".");
  const cases = {
    expired: await sign({ exp: now - 1 }),
    "no expiry": await sign({ exp: undefined }),
    "not yet valid": await sign({ nbf: now + 600 }),
    "issued in the future": await sign({ iat: now + 600 }),
    "other audience": await sign({ aud: ["someone-else"] }),
    "other issuer": await sign({ iss: "https://evil.example" }),
    "signed by another key": await sign({ key: "two" }),
    "alg none": `${encode({ alg: "none", kid: "one" })}.${body}.`,
    "HS256 header": `${encode({ alg: "HS256", kid: "one" })}.${body}.${good.split(".")[2]}`,
    tampered: `${head}.${encode({ iss: "https://team.example", aud: ["aud-1"], exp: now + 600, sub: "admin" })}.${good.split(".")[2]}`,
    "two parts": `${head}.${body}`,
    garbage: "not-a-token"
  };
  for (const [label, token] of Object.entries(cases)) assert.equal((await state(token)).status, 403, label);
});

test("fails closed without Access settings and reports an outage of the key endpoint as 503", async () => {
  setup();
  assert.equal((await state(await sign(), { env: { ...env, ACCESS_AUD: "" } })).status, 403);
  assert.equal((await state(await sign({ aud: ["another-app"] }), { env: { ...env, ACCESS_AUD: "" } })).status, 403);
  published.add("two");
  certsDown = true;
  const outage = await state(await sign({ kid: "two" }));
  assert.equal(outage.status, 503);
  assert.equal(outage.json.error, "access_unavailable");
  certsDown = false;
});

test("picks up rotated keys and refuses a kid that is not published", async () => {
  published.add("two");
  const certs = setup();
  assert.equal((await state(await sign({ kid: "two" }))).status, 200);
  assert.equal(certs.length, 1);
  published.delete("two");
  assert.equal((await state(await sign({ kid: "three", key: "two" }))).status, 403);
});
