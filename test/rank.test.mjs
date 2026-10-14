import test from "node:test";
import assert from "node:assert/strict";
import { quantize, encodeVector, decodeVector, encodeProfile, decodeProfile, cosine, learn, affinity, tokens, sameStory } from "../src/rank.js";

const unit = (index, size = 8) => Array.from({ length: size }, (_, position) => (position === index ? 1 : 0));

test("vectors survive the text round trip and keep their direction", () => {
  const values = [0.5, -0.25, 0.125, -1, 0.75, 0, 0.3, -0.6];
  const vector = decodeVector(encodeVector(quantize(values)));
  assert.equal(vector.length, values.length);
  assert.ok(cosine(vector, values) > 0.999);
  const profile = new Float32Array([0.1, -0.2, 0.3]);
  assert.deepEqual([...decodeProfile(encodeProfile(profile))], [...profile]);
  assert.equal(decodeVector(null), null);
  assert.equal(cosine(new Int8Array(3), new Int8Array(3)), 0);
});

test("learning pulls the profile toward opened articles and away from hidden ones", () => {
  const liked = quantize(unit(0));
  const disliked = quantize(unit(1));
  let profile = learn(null, liked, 1);
  profile = learn(profile, disliked, -1.5);
  assert.ok(cosine(liked, profile) > 0);
  assert.ok(cosine(disliked, profile) < 0);
  const topics = [quantize(unit(2))];
  assert.equal(affinity(quantize(unit(2)), null, topics), 1);
  assert.ok(affinity(liked, profile, topics) > affinity(disliked, profile, topics));
});

test("tokens fold accents and final sigma, skip filler words and keep stems", () => {
  assert.deepEqual(tokens("Ο Λεβαντόφσκι διέλυσε τη Γαλατάσαραϊ στην Πόλη!"), ["λεβαντ", "διελυσ", "γαλατα", "πολη"]);
  assert.deepEqual(tokens("Barcelona thrash Galatasaray: the video"), ["barcel", "thrash", "galata"]);
});

test("headlines are one story only on words beyond the topic itself", () => {
  const ignore = new Set(tokens("Μπαρτσελόνα"));
  const a = tokens("Γαλατάσαραϊ - Μπαρτσελόνα 1-4: Ο Λεβαντόφσκι διέλυσε τη Γαλατάσαραϊ");
  const b = tokens("Λεβαντόφσκι και Γιαμάλ διέλυσαν τη Γαλατάσαραϊ");
  const c = tokens("Μπαρτσελόνα: Ανανέωση συμβολαίου για τον Πέδρι");
  const d = tokens("Μπαρτσελόνα: Ο Πέδρι στο Μπαρτσελόνα TV");
  assert.equal(sameStory(a, b, ignore), true);
  assert.equal(sameStory(a, c, ignore), false);
  assert.equal(sameStory(c, d, ignore), false);
  assert.equal(sameStory(c, d), true);
});
