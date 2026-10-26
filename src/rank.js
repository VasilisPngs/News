const DECAY = 0.97;
const SAME_STORY = 0.75;
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

const norms = new WeakMap();

function squares(vector) {
  let sum = 0;
  for (let index = 0; index < vector.length; index += 1) sum += vector[index] * vector[index];
  return sum;
}

function cachedSquares(vector) {
  let sum = norms.get(vector);
  if (sum === undefined) norms.set(vector, (sum = squares(vector)));
  return sum;
}

function similarity(a, left, b, right) {
  if (!a || !b || a.length !== b.length || !left || !right) return 0;
  let dot = 0;
  for (let index = 0; index < a.length; index += 1) dot += a[index] * b[index];
  return dot / Math.sqrt(left * right);
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
  const own = vector ? squares(vector) : 0;
  let topical = 0;
  for (const topic of topics) topical = Math.max(topical, similarity(vector, own, topic, cachedSquares(topic)));
  return profile ? 0.5 * similarity(vector, own, profile, cachedSquares(profile)) + 0.5 * topical : topical;
}

export function tokens(title) {
  const words = fold(title)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !STOP.has(word))
    .map((word) => word.slice(0, 6));
  return [...new Set(words)].slice(0, 16);
}

function magnitude(vector) {
  let sum = 0;
  for (let index = 0; index < vector.length; index += 1) sum += vector[index] * vector[index];
  return Math.sqrt(sum);
}

function dot(a, b) {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum = (sum + a[index] * b[index]) | 0;
  return sum;
}

export function grouper(recent) {
  const members = recent.map(({ story, vector }) => ({ story, vector, length: magnitude(vector) }));
  return (id, vector) => {
    const length = magnitude(vector);
    let story = id;
    let closest = SAME_STORY;
    for (const member of members) {
      const similarity = dot(vector, member.vector) / (length * member.length);
      if (similarity >= closest) {
        closest = similarity;
        story = member.story;
      }
    }
    members.push({ story, vector, length });
    return story;
  };
}
