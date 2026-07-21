# 不明白播客静态网站核心实现计划

> For agentic workers: REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans to
> implement this plan task by task. Steps use checkbox syntax for tracking.

Goal: 把规范化目录发布为可搜索、可筛选、证据优先的 Astro 静态网站，完成节目、作品、人物和主题的关键浏览路径。

Architecture: Astro 在构建阶段通过只读 CatalogRepository 加载 Zod 校验后的 JSON。页面默认无客户端 JavaScript，搜索和筛选使用小型客户端组件。所有详情页由稳定 slug 生成，公开内容只读取 `publicationStatus: public` 的实体和证据。

Tech Stack: Astro、TypeScript、pnpm、Bun、Biome、Vitest、Playwright、axe-core、原生 CSS、静态 JSON 搜索索引。

## Global Constraints

- 先完成数据基础计划，`data/catalog/` 必须通过校验。
- 首页采用节目与作品双入口。
- 作品详情采用证据优先顺序。
- 未核验候选标题不能出现在公开页面或搜索索引中。
- 书籍版本和影视发行信息使用不同模块。
- 所有交互可用键盘完成，目标为 WCAG 2.2 AA。
- 移动端不隐藏证据、来源或核验状态。
- 不引入用户账户、评论、收藏或运行时数据库。
- 每个任务先写失败测试，再写最小页面或组件。

---

## File Structure

```text
astro.config.ts                     Astro 静态构建配置
playwright.config.ts                浏览器测试配置
src/layouts/BaseLayout.astro        全站文档外壳和元数据
src/styles/global.css               设计 token、排版和响应式规则
src/lib/catalog.ts                  构建期只读目录仓库
src/lib/search.ts                   中文和拉丁词元生成
src/components/SiteHeader.astro     全站导航
src/components/StatusBadge.astro    核验状态
src/components/EvidencePanel.astro  推荐来源和证据
src/components/WorkCard.astro       作品摘要卡片
src/components/SearchBox.astro      客户端搜索
src/pages/index.astro               双入口首页
src/pages/episodes/index.astro      节目索引
src/pages/episodes/[slug].astro     节目详情
src/pages/works/index.astro         作品索引
src/pages/works/[slug].astro        证据优先作品详情
src/pages/people/[slug].astro       人物详情
src/pages/topics/[slug].astro       主题详情
src/pages/about/methodology.astro   收录和核验方法
tools/build-search-index.ts         搜索索引构建器
public/search-index.json            生成后的公开索引
tests/lib/catalog.test.ts           仓库查询测试
tests/lib/search.test.ts            词元和索引测试
tests/e2e/home.spec.ts              首页与列表浏览
tests/e2e/details.spec.ts           详情页证据路径
tests/e2e/search.spec.ts            搜索和筛选
tests/e2e/accessibility.spec.ts     axe 和响应式检查
```

## Task 1: 建立 Astro 页面外壳和浏览器测试环境

Files:

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `tsconfig.json`
- Create: `astro.config.ts`
- Create: `playwright.config.ts`
- Create: `src/layouts/BaseLayout.astro`
- Create: `src/components/SiteHeader.astro`
- Create: `src/styles/global.css`
- Create: `src/pages/index.astro`
- Modify: `script/server`
- Create: `script/build`

Interfaces:

- Consumes: Phase 1 命令层。
- Produces: `BaseLayout`、可构建首页、`script/server`、`script/build`。

- [ ] Step 1: 确认静态构建命令失败

Run:

```bash
test -x script/build
```

Expected: FAIL，`script/build` 不存在。

- [ ] Step 2: 安装网站与浏览器测试依赖

Run:

```bash
pnpm add astro
pnpm add -D @playwright/test @axe-core/playwright
pnpm exec playwright install chromium
```

Expected: 安装退出 0，锁文件更新。

- [ ] Step 3: 添加构建配置

`astro.config.ts`：

```ts
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
});
```

在 `package.json` scripts 中增加：

```json
{
  "dev": "astro dev",
  "build": "astro build",
  "preview": "astro preview"
}
```

在 `tsconfig.json` 根对象增加：

```json
{
  "extends": "astro/tsconfigs/strict"
}
```

保留 Phase 1 的 `compilerOptions` 和 `include`。

`playwright.config.ts`：

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4321",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "pnpm run preview -- --host 127.0.0.1",
    port: 4321,
    reuseExistingServer: false,
  },
});
```

- [ ] Step 4: 实现全站外壳

`src/layouts/BaseLayout.astro`：

```astro
---
import SiteHeader from "../components/SiteHeader.astro";
import "../styles/global.css";

interface Props {
  title: string;
  description: string;
}

const { title, description } = Astro.props;
---

<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <meta name="description" content={description} />
    <title>{title}</title>
  </head>
  <body>
    <a class="skip-link" href="#content">跳到正文</a>
    <SiteHeader />
    <main id="content" class="page-shell">
      <slot />
    </main>
  </body>
</html>
```

`src/components/SiteHeader.astro`：

```astro
<header class="site-header">
  <a class="site-name" href="/">不明白知识库</a>
  <nav aria-label="主导航">
    <a href="/episodes/">节目</a>
    <a href="/works/">作品</a>
    <a href="/about/methodology/">方法</a>
  </nav>
</header>
```

`src/pages/index.astro`：

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
---

<BaseLayout title="不明白知识库" description="按节目和作品探索不明白播客正式推荐">
  <section class="hero">
    <p class="eyebrow">不明白播客资料库</p>
    <h1>从一期节目，找到下一部值得读或看的作品</h1>
    <p>节目和推荐资料正在迁移，页面只显示通过核验的数据。</p>
  </section>
</BaseLayout>
```

`src/styles/global.css` 先定义以下完整基础 token：

```css
:root {
  color-scheme: light;
  --paper: #f6f1e8;
  --ink: #1f2933;
  --muted: #625f59;
  --navy: #25364a;
  --line: #c9c0b2;
  --focus: #b6402c;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

* {
  box-sizing: border-box;
}
body {
  margin: 0;
  color: var(--ink);
  background: var(--paper);
  line-height: 1.6;
}
a {
  color: inherit;
}
.skip-link {
  position: absolute;
  left: -9999px;
}
.skip-link:focus {
  left: 1rem;
  top: 1rem;
  z-index: 10;
  background: white;
  padding: 0.75rem;
}
.site-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem max(1rem, calc((100vw - 72rem) / 2));
  border-bottom: 1px solid var(--line);
}
.site-header nav {
  display: flex;
  gap: 1rem;
}
.site-name {
  font-family: ui-serif, Georgia, serif;
  font-weight: 700;
  text-decoration: none;
}
.page-shell {
  width: min(72rem, calc(100% - 2rem));
  margin: 0 auto;
  padding: 2rem 0 4rem;
}
.hero {
  max-width: 48rem;
  padding: 4rem 0;
}
.hero h1 {
  font-family: ui-serif, Georgia, serif;
  font-size: clamp(2rem, 5vw, 4rem);
  line-height: 1.1;
}
.eyebrow {
  color: var(--muted);
  letter-spacing: 0.08em;
}
:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 3px;
}
@media (max-width: 40rem) {
  .site-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
  }
}
```

- [ ] Step 5: 创建命令入口并构建

`script/server`：

```bash
#!/usr/bin/env bash
set -euo pipefail
pnpm run dev -- --host 127.0.0.1
```

`script/build`：

```bash
#!/usr/bin/env bash
set -euo pipefail
pnpm run build
```

Run:

```bash
chmod +x script/build
script/build
```

Expected: `dist/index.html` 存在，构建退出 0。

- [ ] Step 6: 提交页面外壳

```bash
git add package.json pnpm-lock.yaml tsconfig.json astro.config.ts playwright.config.ts src script
git commit -m "feat: add static site shell"
```

## Task 2: 建立只读 CatalogRepository

Files:

- Create: `src/lib/catalog.ts`
- Create: `tests/lib/catalog.test.ts`

Interfaces:

- Consumes: Phase 1 的 `data/catalog/*.json` 和 `CatalogSchema`。
- Produces: `loadCatalog()`、`listPublicEpisodes()`、`listPublicWorks()`、`getEpisodeBySlug()`、`getWorkBySlug()`。

- [ ] Step 1: 写失败测试

`tests/lib/catalog.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import {
  getEpisodeBySlug,
  listPublicEpisodes,
  listPublicWorks,
  loadCatalog,
} from "../../src/lib/catalog.js";

describe("CatalogRepository", () => {
  it("loads the normalized baseline", async () => {
    const catalog = await loadCatalog();
    expect(catalog.episodes).toHaveLength(237);
    expect(catalog.recommendationEvidence).toHaveLength(423);
  });

  it("returns only public entities", async () => {
    expect(
      (await listPublicEpisodes()).every(
        (item) => item.publicationStatus === "public",
      ),
    ).toBe(true);
    expect(
      (await listPublicWorks()).every(
        (item) => item.publicationStatus === "public",
      ),
    ).toBe(true);
  });

  it("finds an episode by slug", async () => {
    const episode = (await listPublicEpisodes())[0];
    expect(episode).toBeTruthy();
    expect(await getEpisodeBySlug(episode!.slug)).toEqual(episode);
  });
});
```

- [ ] Step 2: 运行测试并确认失败

Run:

```bash
pnpm exec vitest run tests/lib/catalog.test.ts
```

Expected: FAIL，catalog 模块不存在。

- [ ] Step 3: 实现仓库

`src/lib/catalog.ts`：

```ts
import { readFile } from "node:fs/promises";
import {
  CatalogMetaSchema,
  CatalogSchema,
  type Catalog,
} from "../domain/schemas/catalog.js";

let catalogPromise: Promise<Catalog> | undefined;

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export function loadCatalog(): Promise<Catalog> {
  catalogPromise ??= Promise.all([
    readJson("data/catalog/meta.json"),
    readJson("data/catalog/episodes.json"),
    readJson("data/catalog/people.json"),
    readJson("data/catalog/topics.json"),
    readJson("data/catalog/works.json"),
    readJson("data/catalog/editions.json"),
    readJson("data/catalog/recommendation-evidence.json"),
    readJson("data/catalog/image-assets.json"),
    readJson("data/catalog/work-relations.json"),
    readJson("data/catalog/provider-records.json"),
    readJson("data/review/issues.json"),
  ]).then(
    ([
      meta,
      episodes,
      people,
      topics,
      works,
      editions,
      evidence,
      images,
      relations,
      providers,
      issues,
    ]) =>
      CatalogSchema.parse({
        ...CatalogMetaSchema.parse(meta),
        episodes,
        people,
        topics,
        works,
        editions,
        recommendationEvidence: evidence,
        imageAssets: images,
        workRelations: relations,
        providerRecords: providers,
        reviewIssues: issues,
      }),
  );
  return catalogPromise;
}

export async function listPublicEpisodes() {
  return (await loadCatalog()).episodes
    .filter((item) => item.publicationStatus === "public")
    .sort((a, b) => b.number - a.number);
}

export async function listPublicWorks() {
  return (await loadCatalog()).works
    .filter((item) => item.publicationStatus === "public")
    .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
}

export async function getEpisodeBySlug(slug: string) {
  return (await listPublicEpisodes()).find((item) => item.slug === slug);
}

export async function getWorkBySlug(slug: string) {
  return (await listPublicWorks()).find((item) => item.slug === slug);
}
```

- [ ] Step 4: 验证仓库

Run:

```bash
pnpm exec vitest run tests/lib/catalog.test.ts
script/typecheck
```

Expected: 全部通过。

- [ ] Step 5: 提交仓库

```bash
git add src/lib/catalog.ts tests/lib/catalog.test.ts
git commit -m "feat: add read-only catalog repository"
```

## Task 3: 实现双入口首页和节目、作品索引

Files:

- Modify: `src/pages/index.astro`
- Create: `src/pages/episodes/index.astro`
- Create: `src/pages/works/index.astro`
- Create: `src/components/StatusBadge.astro`
- Create: `src/components/WorkCard.astro`
- Modify: `src/styles/global.css`
- Create: `tests/e2e/home.spec.ts`

Interfaces:

- Consumes: CatalogRepository。
- Produces: 首页、节目索引、作品索引和可复用状态与作品卡片。

- [ ] Step 1: 写失败浏览器测试

`tests/e2e/home.spec.ts`：

```ts
import { expect, test } from "@playwright/test";

test("homepage exposes episode and work entry points", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "下一部值得读或看的作品",
  );
  await expect(page.getByRole("link", { name: "浏览全部节目" })).toBeVisible();
  await expect(page.getByRole("link", { name: "浏览全部作品" })).toBeVisible();
});

test("collection pages expose public records", async ({ page }) => {
  await page.goto("/episodes/");
  await expect(page.locator("article").first()).toBeVisible();
  await page.goto("/works/");
  await expect(page.locator("article").first()).toBeVisible();
});
```

- [ ] Step 2: 构建并确认测试失败

Run:

```bash
script/build
pnpm exec playwright test tests/e2e/home.spec.ts --project=desktop
```

Expected: FAIL，入口链接和索引页不存在。

- [ ] Step 3: 实现索引组件

`src/components/StatusBadge.astro`：

```astro
---
interface Props { status: "verified" | "partially_verified" | "pending_verification" | "rejected" }
const { status } = Astro.props;
const labels = {
  verified: "已核验",
  partially_verified: "部分核验",
  pending_verification: "待核验",
  rejected: "已排除",
};
---
<span class={`status status-${status}`}>{labels[status]}</span>
```

`src/components/WorkCard.astro`：

```astro
---
import type { Work } from "../domain/schemas/catalog.js";
import StatusBadge from "./StatusBadge.astro";
interface Props { work: Work }
const { work } = Astro.props;
---
<article class="card">
  <p class="eyebrow">{work.mediaType}</p>
  <h2><a href={`/works/${work.slug}/`}>{work.title}</a></h2>
  {work.originalTitle && <p lang="und">{work.originalTitle}</p>}
  <StatusBadge status={work.verificationStatus} />
</article>
```

- [ ] Step 4: 实现首页和索引页

首页读取最新 3 期和前 6 部最近进入目录的公开作品，显示两个独立区块和统一搜索占位入口。节目索引按期号倒序输出 article。作品索引用 WorkCard 输出并提供媒介和核验状态筛选表单，筛选参数名固定为 `media` 和 `status`。

页面必须包含以下稳定文本和链接：

```astro
<a class="button" href="/episodes/">浏览全部节目</a>
<a class="button button-secondary" href="/works/">浏览全部作品</a>
```

- [ ] Step 5: 验证首页和索引

Run:

```bash
script/build
pnpm exec playwright test tests/e2e/home.spec.ts --project=desktop
script/ci
```

Expected: 全部通过。

- [ ] Step 6: 提交首页和索引

```bash
git add src/pages src/components src/styles tests/e2e/home.spec.ts
git commit -m "feat: add episode and work discovery pages"
```

## Task 4: 实现节目详情和证据优先作品详情

Files:

- Create: `src/components/EvidencePanel.astro`
- Create: `src/pages/episodes/[slug].astro`
- Create: `src/pages/works/[slug].astro`
- Create: `tests/e2e/details.spec.ts`

Interfaces:

- Consumes: Episode、Work、Edition、RecommendationEvidence、Person、WorkRelation。
- Produces: 静态详情页和来源跳转。

- [ ] Step 1: 写失败浏览器测试

`tests/e2e/details.spec.ts`：

```ts
import { expect, test } from "@playwright/test";

test("work detail puts recommendation evidence before related works", async ({
  page,
}) => {
  await page.goto("/works/");
  await page.locator("article a").first().click();
  await expect(page.getByRole("heading", { name: "推荐出处" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "关联作品" })).toBeVisible();
  const orders = await page
    .locator("[data-section-order]")
    .evaluateAll((nodes) =>
      nodes.map((node) => Number(node.getAttribute("data-section-order"))),
    );
  expect(orders).toEqual([...orders].sort((left, right) => left - right));
  expect(orders.indexOf(1)).toBeLessThan(orders.indexOf(3));
});

test("episode detail links to official source", async ({ page }) => {
  await page.goto("/episodes/");
  await page.locator("article a").first().click();
  await expect(page.getByRole("link", { name: "官方节目页" })).toHaveAttribute(
    "href",
    /^https:\/\//,
  );
});
```

- [ ] Step 2: 构建并确认失败

Run:

```bash
script/build
pnpm exec playwright test tests/e2e/details.spec.ts --project=desktop
```

Expected: FAIL，详情路由不存在。

- [ ] Step 3: 实现 EvidencePanel

`src/components/EvidencePanel.astro`：

```astro
---
import type { RecommendationEvidence } from "../domain/schemas/catalog.js";
import StatusBadge from "./StatusBadge.astro";
interface Props { evidence: RecommendationEvidence; episodeTitle: string; episodeSlug: string }
const { evidence, episodeTitle, episodeSlug } = Astro.props;
---
<article class="evidence-panel">
  <StatusBadge status={evidence.verificationStatus} />
  <p><a href={`/episodes/${episodeSlug}/`}>{episodeTitle}</a></p>
  <blockquote>{evidence.rawText}</blockquote>
  <a href={evidence.source.url} rel="external noreferrer">查看官方证据</a>
</article>
```

- [ ] Step 4: 实现静态详情路由

两个动态页面都使用 `getStaticPaths()` 从 CatalogRepository 生成路径。

节目页顺序：标题、日期、嘉宾、官方链接、按推荐人分组的公开 Evidence、作品卡片、待核验状态提示。

作品页顺序和属性：

```text
data-section-order="0" 作品头部和原版首图
data-section-order="1" 推荐出处
data-section-order="2" 版本信息
data-section-order="3" 关联作品
data-section-order="4" 相似作品
data-section-order="5" 数据和图片来源
```

作品页必须根据 `mediaType` 分支。`book` 显示译者、出版社、ISBN 和翻译评价；其他媒介显示导演或创作者、原始发行信息和地区译名，不渲染翻译质量标题。

- [ ] Step 5: 验证详情页

Run:

```bash
script/build
pnpm exec playwright test tests/e2e/details.spec.ts --project=desktop
script/ci
```

Expected: 全部通过。

- [ ] Step 6: 提交详情页

```bash
git add src/components/EvidencePanel.astro src/pages/episodes src/pages/works tests/e2e/details.spec.ts
git commit -m "feat: add evidence-first detail pages"
```

## Task 5: 实现人物、主题和静态搜索

Files:

- Create: `src/lib/search.ts`
- Create: `tools/build-search-index.ts`
- Create: `src/components/SearchBox.astro`
- Create: `src/pages/people/[slug].astro`
- Create: `src/pages/topics/[slug].astro`
- Create: `src/pages/about/methodology.astro`
- Create: `tests/lib/search.test.ts`
- Create: `tests/e2e/search.spec.ts`

Interfaces:

- Consumes: 公开 Episode、Work、Person、Topic。
- Produces: `tokenizeForSearch(value: string): string[]` 和 `public/search-index.json`。

- [ ] Step 1: 写搜索失败测试

`tests/lib/search.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { tokenizeForSearch } from "../../src/lib/search.js";

describe("tokenizeForSearch", () => {
  it("builds Chinese bigrams and Latin words", () => {
    expect(tokenizeForSearch("说吧，记忆 Speak Memory")).toEqual(
      expect.arrayContaining(["说吧", "吧记", "记忆", "speak", "memory"]),
    );
  });
});
```

- [ ] Step 2: 运行测试并确认失败

Run:

```bash
pnpm exec vitest run tests/lib/search.test.ts
```

Expected: FAIL，search 模块不存在。

- [ ] Step 3: 实现词元和索引构建

`src/lib/search.ts`：

```ts
export function tokenizeForSearch(value: string): string[] {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("zh-CN");
  const latin = normalized.match(/[a-z0-9]+/gu) ?? [];
  const chinese = [...normalized.replace(/[^\p{Script=Han}]/gu, "")];
  const bigrams = chinese
    .slice(0, -1)
    .map((char, index) => `${char}${chinese[index + 1]}`);
  return [...new Set([...latin, ...bigrams])];
}
```

`tools/build-search-index.ts` 输出以下结构，只包括公开实体：

```ts
type SearchRecord = {
  id: string;
  kind: "episode" | "work" | "person" | "topic";
  title: string;
  aliases: string[];
  url: string;
  tokens: string[];
};
```

把 JSON 写到 `public/search-index.json`，输出必须以换行结尾。

把 `package.json` 的 build 脚本改为：

```json
{
  "build": "bun run tools/build-search-index.ts && astro build"
}
```

- [ ] Step 4: 实现 SearchBox 和静态页面

SearchBox 使用 `<input type="search">`，输入两个字符后加载
`/search-index.json`，先匹配 title 和 aliases 前缀，再按 tokens 交集排序。
结果按实体类型分组并使用普通链接。Escape 清空结果，ArrowDown、ArrowUp
和 Enter 支持键盘选择。

人物页按角色展示参与节目、创作作品和推荐作品。主题页展示主题说明、相关节目、人物和作品。方法页解释收录标准、核验状态、翻译质量证据规则和纠错入口。

- [ ] Step 5: 添加并运行搜索 E2E

`tests/e2e/search.spec.ts`：

```ts
import { expect, test } from "@playwright/test";

test("search reaches a work from Chinese text", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "搜索节目、人物和作品" });
  await search.fill("记忆");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.getByRole("option").first()).toBeVisible();
});
```

Run:

```bash
pnpm exec vitest run tests/lib/search.test.ts
script/build
pnpm exec playwright test tests/e2e/search.spec.ts --project=desktop
```

Expected: 全部通过。

- [ ] Step 6: 提交搜索和实体页

```bash
git add src/lib/search.ts tools/build-search-index.ts src/components/SearchBox.astro src/pages/people src/pages/topics src/pages/about tests
git commit -m "feat: add catalog search and entity pages"
```

## Task 6: 完成可访问性、移动端和页面验收

Files:

- Create: `tests/e2e/accessibility.spec.ts`
- Modify: `src/styles/global.css`
- Modify: `AGENTS.md`

Interfaces:

- Consumes: 所有公开页面。
- Produces: 桌面和移动端的自动化可访问性门槛。

- [ ] Step 1: 写 axe 和移动端失败测试

`tests/e2e/accessibility.spec.ts`：

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const path of ["/", "/episodes/", "/works/", "/about/methodology/"]) {
  test(`${path} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((item) =>
        ["serious", "critical"].includes(item.impact ?? ""),
      ),
    ).toEqual([]);
  });
}

test("mobile navigation and evidence remain visible", async ({ page }) => {
  await page.goto("/works/");
  await page.locator("article a").first().click();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "推荐出处" })).toBeVisible();
});
```

- [ ] Step 2: 运行桌面和移动测试并记录失败

Run:

```bash
script/build
pnpm exec playwright test tests/e2e/accessibility.spec.ts
```

Expected: 首次运行暴露真实的对比度、标签、标题或移动布局问题。保存 trace，不删除断言。

- [ ] Step 3: 修复页面语义和响应式样式

必须满足：

- 页面只有一个 h1，区块从 h2 开始。
- 搜索输入有可见 label，结果容器有 `role=listbox`。
- 状态同时有文字和颜色。
- 筛选抽屉在 40rem 以下可用键盘打开和关闭。
- 卡片网格在 60rem 以上三列，40rem 到 60rem 两列，更窄时一列。
- `prefers-reduced-motion` 下禁用非必要动画。

- [ ] Step 4: 更新项目命令说明

在 `AGENTS.md` 增加：

```markdown
- 运行 `script/server` 启动 Astro 本地站点，运行 `script/build` 生成静态站点。
- 浏览器验收使用 `pnpm exec playwright test`，桌面和移动项目都必须通过。
- 页面只能读取 CatalogRepository，不得直接读取或绕过 `data/catalog/` schema。
```

- [ ] Step 5: 运行完整验证和人工浏览器检查

Run:

```bash
script/ci
script/build
pnpm exec playwright test
```

Expected: 全部通过。

Manual QA:

1. 启动 `script/server`。
2. 在 1440×900 和 390×844 视口打开首页。
3. 搜索一部作品，进入节目，再进入作品。
4. 确认证据在版本和推荐之前。
5. 关闭图片请求，确认布局不跳动且文本仍可读。

- [ ] Step 6: 提交网站核心

```bash
git add src tests AGENTS.md
git commit -m "test: enforce accessible catalog journeys"
```

## Phase Acceptance

- 首页、节目、作品、人物、主题和方法页可静态构建。
- 公开搜索不包含 withheld 或 pending 候选。
- 作品详情把推荐证据放在版本和相似作品之前。
- 书籍和影视使用不同版本信息结构。
- 桌面和移动 Playwright 项目全部通过。
- axe 没有 serious 或 critical 违规。
- 无客户端 API 密钥或运行时数据库依赖。
