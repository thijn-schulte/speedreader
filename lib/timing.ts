import type { Word } from "./book";

type TimedWord = Pick<Word, "text" | "chapter" | "sentenceStart">;

export const hasShortPause = (word: string) => /[,;:][”’"')\]]*$/.test(word);

function letterCount(word: string) {
  return word.match(/\p{L}/gu)?.length ?? 0;
}

function longWordSeconds(letters: number) {
  return Math.min(0.7, Math.max(0, letters - 8) * 0.05);
}

export function makeTimingProfile(words: readonly TimedWord[], punctuation: boolean) {
  const count = words.length;
  // Normalize within this book so the WPM slider still controls the average base pace.
  const averageLength = count ? words.reduce((sum, word) => sum + letterCount(word.text), 0) / count : 5;
  const weights = words.map(word => Math.max(0.72, Math.min(1.35, 1 + 0.06 * (letterCount(word.text) - averageLength))));
  const averageWeight = count ? weights.reduce((sum, weight) => sum + weight, 0) / count : 1;
  const baseSuffix = Array(count + 1).fill(0) as number[];
  const extraSuffix = Array(count + 1).fill(0) as number[];
  for (let i = count - 1; i >= 0; i--) {
    const endOfSentence = i === count - 1 || words[i + 1].sentenceStart !== words[i].sentenceStart;
    const pause = punctuation ? endOfSentence ? 0.35 : hasShortPause(words[i].text) ? 0.15 : 0 : 0;
    baseSuffix[i] = baseSuffix[i + 1] + weights[i] / averageWeight;
    extraSuffix[i] = extraSuffix[i + 1] + longWordSeconds(letterCount(words[i].text)) + pause;
  }
  return { baseSuffix, extraSuffix };
}

export function intervalSeconds(profile: ReturnType<typeof makeTimingProfile>, start: number, end: number, wpm: number) {
  return (profile.baseSuffix[start] - profile.baseSuffix[end]) * 60 / wpm
    + profile.extraSuffix[start] - profile.extraSuffix[end];
}

export function groupEnd(words: readonly TimedWord[], imageStarts: { has(position: number): boolean }, start: number, chunk: number, punctuation: boolean) {
  const first = words[start];
  if (!first) return start;
  let next = start + 1;
  while (next < words.length && next - start < chunk
    && words[next].chapter === first.chapter
    && words[next].sentenceStart === first.sentenceStart
    && !imageStarts.has(next)
    && !(punctuation && hasShortPause(words[next - 1].text))) next++;
  return next;
}
