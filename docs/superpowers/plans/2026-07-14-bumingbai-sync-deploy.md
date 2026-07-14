# 不明白播客同步与公开部署实现计划

> For agentic workers: REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans to
> implement this plan task by task. Steps use checkbox syntax for tracking.

Goal: 每 6 小时检查官方更新，把低风险节目字段通过受限自动拉取请求发布，把高风险推荐候选送入人工审核，并把通过检查的静态站点部署到 Cloudflare Workers Static Assets。

Architecture: 同步器先保存官方原始快照，再计算内容哈希和字段级差异。低风险与高风险变化写入不同文件和分支。GitHub Actions 只自动合并通过白名单检查的低风险拉取请求，Cloudflare 部署只消费主分支的已批准提交。

Tech Stack: TypeScript、GitHub Actions、GitHub CLI、Astro、Wrangler JSONC、Cloudflare Workers Static Assets、Playwright。

## Global Constraints

- 不直接推送主分支。
- 自动提交使用语义化提交信息。
- 不使用 `--no-verify`。
- GitHub Actions 每 6 小时运行，也支持手动触发。
- 低风险字段只包括节目编号、标题、日期、时长、官方链接和官方明确嘉宾。
- 推荐拆分、消歧、译本、翻译评价和图片版本全部是高风险。
- 高风险候选不进入公开目录和搜索索引。
- Wrangler 配置使用 JSONC，不使用 TOML。
- 秘密使用 GitHub Secrets 和环境变量，不使用 `.dev.vars`。
- 部署失败时保留上一个成功版本。
- 公开部署前必须通过类型、lint、单元、数据、构建和 Playwright 检查。

---

## File Structure

```text
src/sync/types.ts                       官方快照、差异和风险类型
src/sync/official-client.ts             RSS 与 WordPress API 客户端
src/sync/snapshot.ts                    原子快照和内容哈希
src/sync/recommendation-parser.ts       明确推荐栏目候选解析
src/sync/classify-change.ts             字段级风险分类
src/sync/run-sync.ts                    分层同步编排
tools/sync-official.ts                  同步 CLI
tools/check-change-scope.ts             自动合并白名单门槛
tools/open-sync-pr.ts                   只推送自动化分支并创建 PR
tests/sync/*.test.ts                    同步和风险测试
tests/fixtures/sync/*.json              固定官方响应
data/raw/official/*.json                带抓取时间的原始快照
data/review/sync-candidates.json         高风险候选
.github/workflows/ci.yml                 拉取请求检查
.github/workflows/sync.yml               定时分层同步
.github/workflows/deploy.yml             主分支部署
wrangler.jsonc                           Workers Static Assets 配置
.env.example                             本地变量名称
src/config/site.ts                       公开站点和仓库 URL 校验
src/pages/about/credits.astro            外部数据和图片署名
src/pages/report-error.astro             GitHub Issue 纠错入口
tests/e2e/deployment-smoke.spec.ts        部署后关键路径
docs/operations.md                       失败、恢复和人工核验手册
```

## Task 1: 抓取官方来源并保存不可变快照

Files:

- Create: `src/sync/types.ts`
- Create: `src/sync/official-client.ts`
- Create: `src/sync/snapshot.ts`
- Create: `tests/fixtures/sync/wordpress-posts.json`
- Create: `tests/sync/official-client.test.ts`
- Create: `tests/sync/snapshot.test.ts`

Interfaces:

- Consumes: 官方 RSS、WordPress API 和注入的 fetch。
- Produces: `OfficialEpisodeSnapshot[]`、`writeSnapshot()`、`contentHash()`。

- [ ] Step 1: 写失败测试

`tests/sync/official-client.test.ts` 必须断言固定响应转换为：

```ts
expect(episodes[0]).toMatchObject({
  number: 223,
  title: expect.any(String),
  officialUrl: expect.stringContaining("bumingbai.net"),
  sourceKind: "official_wordpress",
});
```

`tests/sync/snapshot.test.ts` 必须断言相同内容生成相同 SHA-256，不同标题生成不同哈希，写入使用临时文件后 rename。

- [ ] Step 2: 运行测试并确认失败

Run:

```bash
npx vitest run tests/sync/official-client.test.ts tests/sync/snapshot.test.ts
```

Expected: FAIL，同步模块不存在。

- [ ] Step 3: 定义快照类型

`src/sync/types.ts`：

```ts
export type OfficialEpisodeSnapshot = {
  number: number;
  title: string;
  publishedAt: string;
  duration?: string;
  officialUrl: string;
  transcriptUrl?: string;
  guestNames: string[];
  descriptionHtml: string;
  sourceKind: "official_rss" | "official_wordpress";
  retrievedAt: string;
  contentHash: string;
};

export type SyncRisk = "low" | "high";

export type SyncChange = {
  episodeNumber: number;
  field: string;
  before: unknown;
  after: unknown;
  risk: SyncRisk;
};
```

- [ ] Step 4: 实现客户端和快照

安装 XML 解析依赖：

```bash
npm install fast-xml-parser
```

`OfficialClient` 构造函数注入 fetch，公开方法：

```ts
export class OfficialClient {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  async fetchEpisodes(now: string): Promise<OfficialEpisodeSnapshot[]>;
}
```

WordPress 端点固定为：

```text
https://bumingbai.net/wp-json/wp/v2/posts?per_page=100&page={page}
```

RSS 端点固定为：

```text
https://feeds.acast.com/public/shows/68004395b4ef799a7a410371
```

使用 `fast-xml-parser` 读取 RSS，以节目编号合并 RSS 和 WordPress 记录。标题、日期、
时长和音频来自 RSS，官方页面、正文和文字稿链接来自 WordPress。发生冲突时保留两个
原值并生成高风险 SyncChange，不静默覆盖。

分页直到响应少于 100 条。解析失败时抛出包含 URL 和 HTTP 状态的错误，不记录响应中的 Cookie 或 Authorization。

`src/sync/snapshot.ts` 导出：

```ts
export function contentHash(value: unknown): string;
export async function writeSnapshot(
  root: string,
  snapshot: OfficialEpisodeSnapshot[],
): Promise<string>;
```

快照路径为 `data/raw/official/{retrievedAt}-{hash}.json`，文件名中的冒号替换为连字符，写入临时文件后 rename。

- [ ] Step 5: 验证并提交

Run:

```bash
npx vitest run tests/sync/official-client.test.ts tests/sync/snapshot.test.ts
script/typecheck
script/lint
git add src/sync tests/sync tests/fixtures/sync package.json package-lock.json
git commit -m "feat: capture official episode snapshots"
```

Expected: 全部通过。

## Task 2: 解析推荐候选并生成审核队列

Files:

- Create: `src/sync/recommendation-parser.ts`
- Create: `tests/sync/recommendation-parser.test.ts`
- Create: `data/review/sync-candidates.json`

Interfaces:

- Consumes: `descriptionHtml` 和官方文字稿 HTML。
- Produces: `parseRecommendationCandidates(input): RecommendationCandidate[]`。

- [ ] Step 1: 写失败测试

测试至少覆盖：

1. “嘉宾推荐”栏目内一行一部作品。
2. 同一推荐人多部作品。
3. 一行包含多个书名号时整行进入审核，不自动拆分。
4. 没有明确推荐栏目时返回空数组。
5. 节目正文顺带提及作品时返回空数组。

核心断言：

```ts
expect(parseRecommendationCandidates(officialHtml)).toEqual([
  expect.objectContaining({
    recommenderLabel: "杨樱",
    rawText: "《休战》 普里莫·莱维 著",
    risk: "high",
    status: "pending_verification",
  }),
]);
```

- [ ] Step 2: 运行测试并确认失败

Run:

```bash
npx vitest run tests/sync/recommendation-parser.test.ts
```

Expected: FAIL，parser 不存在。

- [ ] Step 3: 实现只抽取不消歧的解析器

安装 HTML 解析依赖：

```bash
npm install linkedom
```

导出类型：

```ts
export type RecommendationCandidate = {
  episodeNumber: number;
  recommenderLabel?: string;
  rawText: string;
  sourceUrl: string;
  locator: string;
  risk: "high";
  status: "pending_verification";
};

export function parseRecommendationCandidates(input: {
  episodeNumber: number;
  html: string;
  sourceUrl: string;
}): RecommendationCandidate[];
```

解析器只识别标题文本完全匹配以下集合的区块：

```ts
const RECOMMENDATION_HEADINGS = new Set([
  "嘉宾推荐",
  "嘉宾推荐书目",
  "本期推荐",
  "推荐作品",
]);
```

解析器保留原行和 DOM 定位信息，不调用模型，不拆分同一行多个书名号，不生成作者或原名。

- [ ] Step 4: 写审核队列

`run-sync.ts` 把候选按 `episodeNumber + rawText + sourceUrl` 去重，按期数倒序写入 `data/review/sync-candidates.json`。公开构建不得加载该文件。

- [ ] Step 5: 验证并提交

Run:

```bash
npx vitest run tests/sync/recommendation-parser.test.ts
script/typecheck
script/lint
git add src/sync/recommendation-parser.ts tests/sync/recommendation-parser.test.ts data/review/sync-candidates.json package.json package-lock.json
git commit -m "feat: queue official recommendation candidates"
```

Expected: 全部通过。

## Task 3: 实现字段级风险分类和变更范围门槛

Files:

- Create: `src/sync/classify-change.ts`
- Create: `src/sync/run-sync.ts`
- Create: `tools/sync-official.ts`
- Create: `tools/check-change-scope.ts`
- Create: `tests/sync/classify-change.test.ts`
- Modify: `script/sync`

Interfaces:

- Consumes: 新旧快照和规范化目录。
- Produces: 低风险公开变化、高风险审核候选和机器可读 scope 结果。

- [ ] Step 1: 写分类失败测试

`tests/sync/classify-change.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { classifyField } from "../../src/sync/classify-change.js";

describe("classifyField", () => {
  it.each([
    "number",
    "title",
    "publishedAt",
    "duration",
    "officialUrl",
    "transcriptUrl",
    "guestNames",
  ])("classifies %s as low risk", (field) =>
    expect(classifyField(field)).toBe("low"),
  );

  it.each([
    "recommendations",
    "creator",
    "originalTitle",
    "editions",
    "translationAssessment",
    "imageAssets",
  ])("classifies %s as high risk", (field) =>
    expect(classifyField(field)).toBe("high"),
  );
});
```

- [ ] Step 2: 运行测试并确认失败

Run:

```bash
npx vitest run tests/sync/classify-change.test.ts
```

Expected: FAIL，classifier 不存在。

- [ ] Step 3: 实现白名单分类

`src/sync/classify-change.ts`：

```ts
const LOW_RISK_FIELDS = new Set([
  "number",
  "title",
  "publishedAt",
  "duration",
  "officialUrl",
  "transcriptUrl",
  "guestNames",
]);

export function classifyField(field: string): "low" | "high" {
  return LOW_RISK_FIELDS.has(field) ? "low" : "high";
}
```

`tools/check-change-scope.ts` 读取 `git diff --name-only` 的 base 和 head。只有以下文件可进入低风险自动合并：

```text
data/raw/official/**
data/catalog/episodes.json
data/catalog/people.json
data/review/sync-candidates.json
```

脚本进一步解析 episodes 和 people diff，拒绝删除实体、修改 ID、改变已核验来源或触及非白名单字段。输出 GitHub Actions output `low_risk_only=true|false`。

- [ ] Step 4: 实现同步 CLI 和稳定入口

`tools/sync-official.ts` 调用 OfficialClient、writeSnapshot、parseRecommendationCandidates 和 runSync。默认只写文件，不提交、不推送。

`script/sync`：

```bash
#!/usr/bin/env bash
set -euo pipefail
npx tsx tools/sync-official.ts
```

Run:

```bash
chmod +x script/sync
```

- [ ] Step 5: 验证并提交

Run:

```bash
npx vitest run tests/sync
script/typecheck
script/lint
git add src/sync tools script/sync tests/sync
git commit -m "feat: classify layered sync changes"
```

Expected: 全部通过。

## Task 4: 添加 GitHub Actions 分层同步和 CI

Files:

- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/sync.yml`

Interfaces:

- Consumes: `script/ci`、`script/build`、`script/sync` 和 scope checker。
- Produces: 拉取请求检查、低风险自动拉取请求和高风险审核拉取请求。

- [ ] Step 1: 写 workflow 静态失败检查

在 `tests/contracts/workflows.test.ts` 读取两个 YAML，断言：

```ts
expect(sync.on.schedule[0].cron).toBe("17 */6 * * *");
expect(JSON.stringify(sync)).not.toContain("--no-verify");
expect(JSON.stringify(sync)).not.toContain("push origin main");
expect(ci.jobs.check.steps.map((step) => step.run)).toEqual(
  expect.arrayContaining(["script/ci", "script/build", "npx playwright test"]),
);
```

使用 `yaml` npm 包解析 workflow：

```bash
npm install --save-dev yaml
```

- [ ] Step 2: 运行测试并确认失败

Run:

```bash
npx vitest run tests/contracts/workflows.test.ts
```

Expected: FAIL，workflow 文件不存在。

- [ ] Step 3: 实现 CI workflow

`.github/workflows/ci.yml` 使用 `pull_request`，权限只读。步骤固定为 checkout、setup-node、`npm ci`、`script/ci`、`script/build`、`npx playwright install --with-deps chromium`、`npx playwright test`。不得在 CI workflow 中配置部署秘密。

- [ ] Step 4: 实现同步 workflow

`.github/workflows/sync.yml`：

```yaml
name: Sync official podcast data
on:
  schedule:
    - cron: "17 */6 * * *"
  workflow_dispatch:
permissions:
  contents: write
  pull-requests: write
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v7
        with:
          node-version-file: ".nvmrc"
          cache: npm
      - run: npm ci
      - run: script/sync
      - run: script/ci
      - run: script/build
      - name: Create or update sync pull request
        env:
          GH_TOKEN: ${{ github.token }}
        run: npx tsx tools/open-sync-pr.ts
```

创建 `tools/open-sync-pr.ts`，它只推送 `automation/episode-sync` 或
`automation/review-queue`，提交信息分别为 `data: sync official episode metadata`
和 `data: queue recommendation candidates`。低风险 PR 在全部检查通过后设置 auto-merge，
高风险 PR 不设置 auto-merge。脚本不得推送 `main`。

- [ ] Step 5: 验证并提交

Run:

```bash
npx vitest run tests/contracts/workflows.test.ts
script/lint
git add .github tests/contracts tools/open-sync-pr.ts package.json package-lock.json
git commit -m "ci: add layered catalog synchronization"
```

Expected: workflow 契约和 lint 通过。

## Task 5: 配置 Cloudflare Workers Static Assets 部署

Files:

- Create: `wrangler.jsonc`
- Create: `.env.example`
- Create: `.github/workflows/deploy.yml`
- Create: `src/config/site.ts`
- Create: `tests/config/site.test.ts`

Interfaces:

- Consumes: `dist/`、Cloudflare Secrets、公开站点和仓库 URL。
- Produces: 可回滚的静态资产部署。

- [ ] Step 1: 写配置失败测试

`tests/config/site.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { parseSiteConfig } from "../../src/config/site.js";

describe("parseSiteConfig", () => {
  it("requires absolute public urls", () => {
    expect(() =>
      parseSiteConfig({ PUBLIC_SITE_URL: "", PUBLIC_REPOSITORY_URL: "" }),
    ).toThrow();
  });

  it("accepts https urls", () => {
    expect(
      parseSiteConfig({
        PUBLIC_SITE_URL: "https://example.com",
        PUBLIC_REPOSITORY_URL: "https://github.com/example/catalog",
      }),
    ).toEqual({
      siteUrl: "https://example.com",
      repositoryUrl: "https://github.com/example/catalog",
    });
  });
});
```

- [ ] Step 2: 运行测试并确认失败

Run:

```bash
npx vitest run tests/config/site.test.ts
```

Expected: FAIL，site config 不存在。

- [ ] Step 3: 实现配置和 Wrangler JSONC

`src/config/site.ts` 使用 Zod 验证两个 https URL，并导出：

```ts
export function parseSiteConfig(env: Record<string, string | undefined>): {
  siteUrl: string;
  repositoryUrl: string;
};
```

`.env.example`：

```dotenv
PUBLIC_SITE_URL=
PUBLIC_REPOSITORY_URL=
```

`wrangler.jsonc`：

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "bumingbai-knowledge-base",
  "compatibility_date": "2026-07-14",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "404-page",
  },
}
```

安装最新 Wrangler：

```bash
npm install --save-dev wrangler@latest
```

- [ ] Step 4: 实现部署 workflow

`.github/workflows/deploy.yml` 只在 `main` push 后运行。权限 `contents: read`。步骤为 npm ci、script/ci、script/build、Playwright 本地烟雾测试、`npx wrangler@latest deploy`。环境变量读取 `vars.PUBLIC_SITE_URL`、`vars.PUBLIC_REPOSITORY_URL` 和 secret `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`。

- [ ] Step 5: 验证并提交

Run:

```bash
npx vitest run tests/config/site.test.ts
npx wrangler@latest deploy --dry-run
script/ci
script/build
git add wrangler.jsonc .env.example .github/workflows/deploy.yml src/config tests/config package.json package-lock.json
git commit -m "ci: add workers static asset deployment"
```

Expected: 本地测试、构建和 Wrangler dry-run 通过，不发生真实部署。

## Task 6: 完成署名、纠错、运行手册和部署后验收

Files:

- Create: `src/pages/about/credits.astro`
- Create: `src/pages/report-error.astro`
- Create: `tests/e2e/deployment-smoke.spec.ts`
- Create: `docs/operations.md`
- Modify: `src/components/SiteHeader.astro`
- Modify: `src/pages/about/methodology.astro`
- Modify: `AGENTS.md`

Interfaces:

- Consumes: SiteConfig、ProviderRecord、ImageAsset 和部署 URL。
- Produces: 外部数据署名、预填 GitHub Issue、恢复步骤和线上烟雾测试。

- [ ] Step 1: 写失败浏览器测试

`tests/e2e/deployment-smoke.spec.ts`：

```ts
import { expect, test } from "@playwright/test";

test("credits include TMDB attribution", async ({ page }) => {
  await page.goto("/about/credits/");
  await expect(
    page.getByText(
      "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    ),
  ).toBeVisible();
});

test("report error link opens a prefilled issue", async ({ page }) => {
  await page.goto("/works/");
  await page.locator("article a").first().click();
  const link = page.getByRole("link", { name: "报告资料错误" });
  await expect(link).toHaveAttribute("href", /issues\/new\?/);
});
```

- [ ] Step 2: 构建并确认测试失败

Run:

```bash
script/build
npx playwright test tests/e2e/deployment-smoke.spec.ts
```

Expected: FAIL，署名和纠错页尚不存在。

- [ ] Step 3: 实现署名和纠错

Credits 页面列出 Open Library、TMDB、Wikidata、Commons 和 Workers AI 的用途、官方链接、许可或署名要求。TMDB 免责声明使用官方要求的原文。

详情页“报告资料错误”链接使用：

```ts
const issueUrl = new URL("issues/new", `${repositoryUrl}/`);
issueUrl.searchParams.set("title", `[资料纠错] ${entity.title}`);
issueUrl.searchParams.set(
  "body",
  `实体 ID: ${entity.id}\n页面: ${pageUrl}\n\n请说明错误及可靠来源：`,
);
```

只把实体 ID、公开标题和公开 URL 放入查询参数。

- [ ] Step 4: 编写运行手册

`docs/operations.md` 必须给出以下精确流程：

- 同步失败时从 Actions 下载日志，运行 `script/sync` 重现。
- 外部 API 故障时确认缓存未被删除，再运行离线构建。
- 错误自动 PR 使用 `gh pr close` 关闭，不合并。
- 错误部署使用 `npx wrangler@latest rollback` 查看和选择上一版本。
- 高风险候选按来源、标题、创作者、版本、图片许可顺序核验。
- 商业化前停用 TMDB 自动同步并重新确认许可。

- [ ] Step 5: 运行完整本地和部署前检查

Run:

```bash
script/ci
npx tsx tools/validate-data.ts
script/build
npx playwright test
npx wrangler@latest deploy --dry-run
git diff --check
```

Expected: 全部退出 0。

Manual QA:

1. 使用预览部署 URL 打开首页。
2. 检查最新一期、任一作品、原版首图、官方证据和相似理由。
3. 打开 Credits，确认 TMDB 和图片署名。
4. 打开纠错链接，确认 Issue 标题和正文预填正确。
5. 暂时阻断一个图片域名，确认备用图或本地封面出现。

- [ ] Step 6: 更新规则并提交

在 `AGENTS.md` 增加：

```markdown
- `script/sync` 只写数据文件，Git 提交和 PR 由 workflow 中的专用工具处理。
- Cloudflare 配置只使用 `wrangler.jsonc`，部署使用 `npx wrangler@latest`。
- 同步或部署失败时按 `docs/operations.md` 恢复，禁止用不完整数据覆盖线上版本。
```

Commit:

```bash
git add src/pages src/components tests/e2e docs/operations.md AGENTS.md
git commit -m "docs: add public data operations and credits"
```

## Phase Acceptance

- 定时同步每 6 小时运行且可以手动触发。
- 低风险和高风险变化进入不同拉取请求。
- 自动化不推送 `main`，不使用 `--no-verify`。
- 未核验推荐候选不会进入公开页面和搜索索引。
- Cloudflare 配置为 JSONC，dry-run 和静态构建通过。
- Credits 满足 TMDB、Open Library 和 Commons 的来源要求。
- 线上抽样节目、作品、图片降级和纠错路径经过浏览器验收。
