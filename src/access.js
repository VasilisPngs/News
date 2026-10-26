const JWKS_TTL_MS = 3600000;
const JWKS_TIMEOUT_MS = 5000;
const CLOCK_SKEW_S = 60;
const COOKIE = "CF_Authorization";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

let cachedKeys = null;
let cachedAt = 0;

function bytesFromBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

const jsonFromBase64Url = (value) => JSON.parse(new TextDecoder().decode(bytesFromBase64Url(value)));

async function fetchKeys(team) {
  const response = await fetch(`https://${team}/cdn-cgi/access/certs`, {
    signal: AbortSignal.timeout(JWKS_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`jwks_http_${response.status}`);
  const body = await response.json();
  const keys = new Map();
  for (const jwk of body.keys || []) {
    if (jwk.kty !== "RSA" || jwk.alg !== "RS256" || !jwk.kid || !jwk.n || !jwk.e) continue;
    keys.set(
      jwk.kid,
      await crypto.subtle.importKey(
        "jwk",
        { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
      )
    );
  }
  if (keys.size === 0) throw new Error("jwks_empty");
  return keys;
}

async function loadKeys(team, force) {
  if (!force && cachedKeys && Date.now() - cachedAt < JWKS_TTL_MS) return cachedKeys;
  const keys = await fetchKeys(team);
  cachedKeys = keys;
  cachedAt = Date.now();
  return keys;
}

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const split = part.indexOf("=");
    if (split < 0) continue;
    if (part.slice(0, split).trim() === name) return part.slice(split + 1).trim();
  }
  return null;
}

function readToken(request) {
  const header = request.headers.get("cf-access-jwt-assertion");
  if (header) return header.trim();
  return readCookie(request.headers.get("cookie"), COOKIE);
}

export async function checkAccess(request, url, env) {
  if (LOCAL_HOSTS.has(url.hostname)) return "ok";

  const team = String(env.ACCESS_TEAM_DOMAIN || "").trim();
  const audience = String(env.ACCESS_AUD || "").trim();
  if (!team || !audience) return "denied";

  const token = readToken(request);
  if (!token) return "denied";
  const parts = token.split(".");
  if (parts.length !== 3) return "denied";

  let header;
  let claims;
  try {
    header = jsonFromBase64Url(parts[0]);
    claims = jsonFromBase64Url(parts[1]);
  } catch {
    return "denied";
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") return "denied";

  const seconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(claims.exp) || claims.exp <= seconds) return "denied";
  if (Number.isFinite(claims.nbf) && claims.nbf > seconds + CLOCK_SKEW_S) return "denied";
  if (Number.isFinite(claims.iat) && claims.iat > seconds + CLOCK_SKEW_S) return "denied";
  if (claims.iss !== `https://${team}`) return "denied";
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(audience)) return "denied";

  let keys;
  try {
    keys = await loadKeys(team, false);
    if (!keys.has(header.kid)) keys = await loadKeys(team, true);
  } catch {
    return "unavailable";
  }
  const key = keys.get(header.kid);
  if (!key) return "denied";

  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    bytesFromBase64Url(parts[2]),
    signed
  );
  return valid ? "ok" : "denied";
}
