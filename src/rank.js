const DECAY = 0.97;
const STORY_SHARED = 2;
const STORY_OVERLAP = 0.5;
const STOP = new Set(
  "και του της των τον την στο στη στην στον στα στις στους από για με που ένα μια μία ειδήσεις νέα μετά πριν είναι θα δεν ότι πως όπως αυτό αυτή ποιος ποια ποιο έχει έχουν ήταν the and for with from that this into over after about what when where how are was were has have will its new news says said video photos live update"
    .split(" ")
    .map((word) => fold(word))
);

function fold(word) {
  return word.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/ς/g, "σ");
}

export function quantize(values) {
  let max = 0;
  for (const value of values) max = Math.max(max, Math.abs(value));
  const scale = max > 0 ? 127 / max : 0;
  return Int8Array.from(values, (value) => Math.round(value * scale));
}

function toBase64(view) {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export const encodeVector = (vector) => toBase64(vector);

export const decodeVector = (text) => (text ? new Int8Array(fromBase64(text).buffer) : null);

export const encodeProfile = (profile) => toBase64(profile);

export const decodeProfile = (text) => (text ? new Float32Array(fromBase64(text).buffer) : null);

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let left = 0;
  let right = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    left += a[index] * a[index];
    right += b[index] * b[index];
  }
  return left && right ? dot / Math.sqrt(left * right) : 0;
}

export function learn(profile, vector, weight) {
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  const next = new Float32Array(vector.length);
  for (let index = 0; index < vector.length; index += 1) next[index] = (profile && profile.length === vector.length ? profile[index] * DECAY : 0) + (weight * vector[index]) / norm;
  return next;
}

export function affinity(vector, profile, topics) {
  let topical = 0;
  for (const topic of topics) topical = Math.max(topical, cosine(vector, topic));
  return profile ? 0.5 * cosine(vector, profile) + 0.5 * topical : topical;
}

export function tokens(title) {
  const words = fold(title)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !STOP.has(word))
    .map((word) => word.slice(0, 6));
  return [...new Set(words)].slice(0, 16);
}

export function sameStory(left, right, ignore = new Set()) {
  const a = left.filter((word) => !ignore.has(word));
  const b = right.filter((word) => !ignore.has(word));
  if (a.length === 0 || b.length === 0) return false;
  const known = new Set(a);
  let shared = 0;
  for (const word of b) if (known.has(word)) shared += 1;
  return shared >= STORY_SHARED && shared / Math.min(a.length, b.length) >= STORY_OVERLAP;
}
