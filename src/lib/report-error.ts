import type { SiteConfig } from "../config/site.js";

export type CorrectionEntity = {
  readonly id: string;
  readonly pagePath: `/${string}/`;
  readonly title: string;
};

export function createCorrectionIssueUrl(
  config: SiteConfig,
  entity: CorrectionEntity,
): string {
  const pageUrl = new URL(entity.pagePath, config.siteUrl);
  const issueUrl = new URL("issues/new", `${config.repositoryUrl}/`);
  issueUrl.searchParams.set("title", `[资料纠错] ${entity.title}`);
  issueUrl.searchParams.set(
    "body",
    [
      `实体 ID: ${entity.id}`,
      `页面: ${pageUrl.toString()}`,
      "",
      "请说明错误及可靠来源：",
    ].join("\n"),
  );
  return issueUrl.toString();
}
