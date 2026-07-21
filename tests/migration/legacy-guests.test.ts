import { describe, expect, it } from "vitest";
import { migrateLegacy } from "../../src/migration/legacy.js";

const GENERATED_AT = "2026-07-14T00:00:00.000Z";
const RETRIEVED_AT = "2026-07-14T01:00:00.000Z";
const OFFICIAL_URL = "https://bumingbai.net/episodes/guest-evidence";

const OFFICIAL_GUEST_EVIDENCE = [
  "官方文字稿说话人标签",
  "官方节目简介明确说明",
  "节目标题明确列名或角色",
] as const;

const PLACEHOLDER_GUESTS = [
  "未在标题或简介中明确列名",
  "听众投稿（多人，官方未逐一列名）",
  "听众来信（多人，官方未逐一列名）",
  "多位中国受访者（官方未逐一列名）",
] as const;

const WITHHELD_GUEST_EVIDENCE = [
  ["未确认", "未确认"],
  ["反推需复核", "由官方推荐栏署名反推，需复核"],
  ["缺失", undefined],
  ["未知", "未经定义的证据值"],
] as const;

function migrateGuest(
  guestOrParticipants: string,
  guestEvidence: string | undefined,
) {
  const episode = {
    episode_number: 1,
    title: "嘉宾证据测试",
    published_at: "2026-07-14T00:00:00.000Z",
    official_url: OFFICIAL_URL,
    guest_or_participants: guestOrParticipants,
    recommendation_status: "官方简介未出现推荐标记",
    ...(guestEvidence === undefined ? {} : { guest_evidence: guestEvidence }),
  };
  return migrateLegacy(
    {
      retrieved_at: RETRIEVED_AT,
      episodes: [episode],
      recommendations: [],
    },
    GENERATED_AT,
  );
}

describe("legacy guest evidence", () => {
  it.each(
    OFFICIAL_GUEST_EVIDENCE,
  )("publishes a concrete guest when evidenced by %s", (guestEvidence) => {
    // Given
    const rawGuest = "伊险峰、杨樱";

    // When
    const catalog = migrateGuest(rawGuest, guestEvidence);

    // Then
    expect(catalog.people.map((person) => person.name)).toEqual([
      "伊险峰",
      "杨樱",
    ]);
    expect(catalog.episodes[0]?.guestIds).toEqual(
      catalog.people.map((person) => person.id),
    );
    expect(catalog.reviewIssues).toEqual([]);
  });

  it.each(
    PLACEHOLDER_GUESTS,
  )("withholds placeholder guest text %s without splitting it", (rawGuest) => {
    // Given
    const guestEvidence = "官方节目简介明确说明";

    // When
    const first = migrateGuest(rawGuest, guestEvidence);
    const second = migrateGuest(rawGuest, guestEvidence);

    // Then
    expect(first.people).toEqual([]);
    expect(first.episodes[0]?.guestIds).toEqual([]);
    expect(first.reviewIssues).toEqual([
      expect.objectContaining({
        field: "guestIds",
        candidates: [rawGuest],
        source: {
          kind: "official_episode",
          url: OFFICIAL_URL,
          retrievedAt: RETRIEVED_AT,
        },
        status: "open",
      }),
    ]);
    expect(second.reviewIssues).toEqual(first.reviewIssues);
  });

  it.each(
    WITHHELD_GUEST_EVIDENCE,
  )("withholds a concrete guest when evidence is %s", (_label, guestEvidence) => {
    // Given
    const rawGuest = "  待核验嘉宾  ";

    // When
    const catalog = migrateGuest(rawGuest, guestEvidence);

    // Then
    expect(catalog.people).toEqual([]);
    expect(catalog.episodes[0]?.guestIds).toEqual([]);
    expect(catalog.reviewIssues).toEqual([
      expect.objectContaining({
        field: "guestIds",
        candidates: [rawGuest],
        source: expect.objectContaining({ url: OFFICIAL_URL }),
        status: "open",
      }),
    ]);
  });

  it("does not create a review issue when guest text is whitespace only", () => {
    // Given
    const rawGuest = " \t ";

    // When
    const catalog = migrateGuest(rawGuest, "未确认");

    // Then
    expect(catalog.people).toEqual([]);
    expect(catalog.episodes[0]?.guestIds).toEqual([]);
    expect(catalog.reviewIssues).toEqual([]);
  });
});
