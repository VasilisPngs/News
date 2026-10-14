import test from "node:test";
import assert from "node:assert/strict";
import { encrypt, vapidAuthorization, createKey, publicKey, pushEndpoint, base64UrlDecode } from "../src/push.js";
import { device, decrypt } from "./helpers.mjs";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

test("a message encrypted for a device decrypts with its private key", async () => {
  const target = await device();
  const body = await encrypt('{"hello":"κόσμε"}', target.subscription.keys.p256dh, target.subscription.keys.auth);
  assert.equal(await decrypt(body, target), '{"hello":"κόσμε"}');
});

test("the VAPID token is signed by the generated key and names the push service", async () => {
  const jwk = await createKey();
  const header = await vapidAuthorization(jwk, "https://web.push.apple.com/abc", "https://news.example", Date.parse("2026-10-14T10:00:00Z"));
  const [, token, key] = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(key, publicKey(jwk));
  assert.equal(base64UrlDecode(key).length, 65);
  const [head, claims, signature] = token.split(".");
  const payload = JSON.parse(decoder.decode(base64UrlDecode(claims)));
  assert.equal(payload.aud, "https://web.push.apple.com");
  assert.equal(payload.sub, "https://news.example");
  const verifier = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.equal(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, verifier, base64UrlDecode(signature), encoder.encode(`${head}.${claims}`)), true);
});

test("only known push services are accepted as endpoints", () => {
  assert.equal(pushEndpoint("https://web.push.apple.com/abc"), "https://web.push.apple.com/abc");
  assert.equal(pushEndpoint("https://fcm.googleapis.com/fcm/send/abc"), "https://fcm.googleapis.com/fcm/send/abc");
  assert.equal(pushEndpoint("https://wns2-db5p.notify.windows.com/w/?token=x"), "https://wns2-db5p.notify.windows.com/w/?token=x");
  assert.equal(pushEndpoint("https://evil.example/push.apple.com"), null);
  assert.equal(pushEndpoint("http://web.push.apple.com/abc"), null);
  assert.equal(pushEndpoint(42), null);
});
