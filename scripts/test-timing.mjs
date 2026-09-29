import assert from "node:assert/strict";
import test from "node:test";
import { groupEnd, intervalSeconds, makeTimingProfile } from "../lib/timing.ts";

function words(...texts) {
  return texts.map(text => ({ text, chapter: 0, sentenceStart: 0 }));
}

test("short words get less time and long words get more time", () => {
  const sample = words("ik", "wandelen", "elftigeneerste");
  const profile = makeTimingProfile(sample, false);
  const durations = sample.map((_, i) => intervalSeconds(profile, i, i + 1, 300));
  assert.ok(durations[0] < 0.2);
  assert.ok(durations[1] > durations[0]);
  assert.ok(durations[2] > durations[1]);
  assert.ok(Math.abs(durations.reduce((sum, duration) => sum + duration, 0) - (3 * 0.2 + 0.3)) < 1e-10);
});

test("a comma ends a chunk and its pause is counted once", () => {
  const sample = words("Ik", "liep,", "weer", "door.");
  const profile = makeTimingProfile(sample, true);
  const firstEnd = groupEnd(sample, new Set(), 0, 3, true);
  assert.equal(firstEnd, 2);
  const secondEnd = groupEnd(sample, new Set(), firstEnd, 3, true);
  assert.equal(secondEnd, 4);
  const chunks = [[0, firstEnd], [firstEnd, secondEnd]];
  const total = chunks.reduce((sum, [start, end]) => sum + intervalSeconds(profile, start, end, 300), 0);
  assert.ok(Math.abs(total - intervalSeconds(profile, 0, sample.length, 300)) < 1e-10);
  assert.ok(Math.abs(total - (4 * 0.2 + 0.15 + 0.35)) < 1e-10);
  assert.equal(groupEnd(sample, new Set(), 0, 3, false), 3);
});

test("a displayed group never crosses an image or chapter", () => {
  const sample = words("hier", "staat", "iets", "nieuws");
  sample[3].chapter = 1;
  assert.equal(groupEnd(sample, new Set([2]), 0, 3, true), 2);
  assert.equal(groupEnd(sample, new Set(), 1, 3, true), 3);
});
