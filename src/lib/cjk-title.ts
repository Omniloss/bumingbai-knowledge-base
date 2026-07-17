export type CjkTitleSegment = {
  readonly keepTogether: boolean;
  readonly value: string;
};

const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
const HAN_PATTERN = /\p{Script=Han}/u;

export function segmentCjkTitle(value: string): readonly CjkTitleSegment[] {
  return [...segmenter.segment(value)].map((segment) => ({
    keepTogether: HAN_PATTERN.test(segment.segment),
    value: segment.segment,
  }));
}
