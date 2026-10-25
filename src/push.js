const encoder = new TextEncoder();
const RECORD_SIZE = 4096;
const TOKEN_LIFETIME_S = 3600;
const PUSH_TIMEOUT_MS = 5000;
const PUSH_HOSTS = /(^|\.)(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;

export function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(salt, secret, info, length) {
  const key = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

export async function encrypt(plaintext, p256dh, auth) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const userPublic = base64UrlDecode(p256dh);
  const userKey = await crypto.subtle.importKey("raw", userPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: userKey }, pair.privateKey, 256));
  const ikm = await hkdf(base64UrlDecode(auth), shared, concat(encoder.encode("WebPush: info\0"), userPublic, serverPublic), 32);
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(encoder.encode(plaintext), new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = serverPublic.length;
  return concat(header, serverPublic, sealed);
}

export const publicKey = (jwk) => base64UrlEncode(concat(new Uint8Array([4]), base64UrlDecode(jwk.x), base64UrlDecode(jwk.y)));

export async function vapidAuthorization(jwk, endpoint, subject, now = Date.now()) {
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, d: jwk.d }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const part = (value) => base64UrlEncode(encoder.encode(JSON.stringify(value)));
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + TOKEN_LIFETIME_S, sub: subject })}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(unsigned)));
  return `vapid t=${unsigned}.${base64UrlEncode(signature)}, k=${publicKey(jwk)}`;
}

export async function createKey() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const { x, y, d } = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { x, y, d };
}

export function pushEndpoint(value) {
  if (typeof value !== "string" || value.length > 1000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && PUSH_HOSTS.test(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

export function keyLength(value) {
  try {
    return typeof value === "string" ? base64UrlDecode(value).length : 0;
  } catch {
    return 0;
  }
}

export async function sendPush(jwk, subscription, notification, subject) {
  const message = JSON.stringify({ web_push: 8030, notification });
  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      authorization: await vapidAuthorization(jwk, subscription.endpoint, subject),
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: "21600",
      urgency: "normal"
    },
    body: await encrypt(message, subscription.p256dh, subscription.auth),
    signal: AbortSignal.timeout(PUSH_TIMEOUT_MS)
  });
}
