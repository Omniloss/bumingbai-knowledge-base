import { describe, expect, it } from "vitest";
import { createCorrectionIssueUrl } from "../../src/lib/report-error.js";

const entities = [
  { id: "episode_1", pagePath: "/episodes/ep-001/", title: "节目" },
  { id: "person_1", pagePath: "/people/person-1/", title: "人物" },
  { id: "topic_1", pagePath: "/topics/topic-1/", title: "主题" },
  { id: "work_1", pagePath: "/works/work-1/", title: "作品" },
] as const;

describe("createCorrectionIssueUrl", () => {
  it.each(entities)("only includes public fields for $id", (entity) => {
    const url = new URL(
      createCorrectionIssueUrl(
        {
          repositoryUrl: "https://github.com/example/catalog",
          siteUrl: "https://catalog.example",
        },
        entity,
      ),
    );

    expect(`${url.origin}${url.pathname}`).toBe(
      "https://github.com/example/catalog/issues/new",
    );
    expect([...url.searchParams.keys()].toSorted()).toEqual(["body", "title"]);
    expect(url.searchParams.get("title")).toBe(`[资料纠错] ${entity.title}`);
    expect(url.searchParams.get("body")).toBe(
      [
        `实体 ID: ${entity.id}`,
        `页面: https://catalog.example${entity.pagePath}`,
        "",
        "请说明错误及可靠来源：",
      ].join("\n"),
    );
  });
});
