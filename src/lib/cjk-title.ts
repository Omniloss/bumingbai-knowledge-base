export type CjkTitleSegment = {
  readonly keepTogether: boolean;
  readonly value: string;
};

const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
const HAN_PATTERN = /\p{Script=Han}/u;
const TRAILING_SEGMENT_PATTERN = /^[：:，,。！？!?；;、了]$/u;

function mergeProtectedPhrase(
  segments: CjkTitleSegment[],
  phrase: string,
): void {
  if (phrase.length === 0) return;
  for (let start = 0; start < segments.length; start += 1) {
    let combined = "";
    for (let end = start; end < segments.length; end += 1) {
      combined += segments[end]?.value ?? "";
      const suffix = combined.slice(phrase.length);
      if (
        combined === phrase ||
        (combined.startsWith(phrase) && TRAILING_SEGMENT_PATTERN.test(suffix))
      ) {
        segments.splice(start, end - start + 1, {
          keepTogether: true,
          value: combined,
        });
        return;
      }
      if (!phrase.startsWith(combined)) break;
    }
  }
}

export function segmentCjkTitle(
  value: string,
  protectedPhrases: readonly string[] = [],
): readonly CjkTitleSegment[] {
  const segments: CjkTitleSegment[] = [];
  for (const item of segmenter.segment(value)) {
    const previous = segments.at(-1);
    if (previous && TRAILING_SEGMENT_PATTERN.test(item.segment)) {
      segments[segments.length - 1] = {
        keepTogether: true,
        value: `${previous.value}${item.segment}`,
      };
      continue;
    }
    segments.push({
      keepTogether: HAN_PATTERN.test(item.segment),
      value: item.segment,
    });
  }
  for (const phrase of protectedPhrases) mergeProtectedPhrase(segments, phrase);
  return segments;
}
