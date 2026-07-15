# 不明白播客数据增强、图片与推荐实现计划

> For agentic workers: REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans to
> implement this plan task by task. Steps use checkbox syntax for tracking.

Goal: 用可替换的免费数据提供方补全作品标识和图片，生成原版首图、同作者关系和可解释相似推荐，同时保证外部服务失败不影响已有站点。

Architecture: 所有提供方只在构建期运行，并通过同一个 ProviderClient 接口和磁盘缓存隔离。提供方只能产生候选，Catalog 的来源、核验状态和发布规则仍是最终权威。硬关系直接计算，相似关系使用可解释权重，向量只补充主题信号。

Tech Stack: TypeScript、pnpm、Bun、Biome、Zod、Vitest、Open Library API、TMDB API、Wikidata API、Wikimedia Commons API、Cloudflare Workers AI、R2 可选镜像。

## Global Constraints

- 浏览器不直接调用外部 API。
- API 密钥只从环境变量读取。
- 默认测试使用固定响应夹具，不访问网络。
- Open Library 公开页面使用其封面 URL，不批量复制封面。
- TMDB 只在非商业用途和满足署名要求时启用。
- Commons 媒体逐文件保存许可证和署名。
- R2 只接收 `mirror_allowed` 或本站生成资产。
- 首图优先可核验原版，但权利、清晰度和失效状态优先于版本偏好。
- 同作者、同导演、同系列和同一期是硬关系，不混入相似度。
- 相似卡片至少显示一个非向量理由。
- 外部服务失败时使用最近缓存，不能删除已有增强数据。

---

## File Structure

```text
src/providers/types.ts                 提供方接口和结果类型
src/providers/cache.ts                 磁盘缓存与最后成功结果
src/providers/open-library.ts          书籍与封面候选
src/providers/tmdb.ts                  影视、海报与署名
src/providers/wikimedia.ts             Wikidata 标识和 Commons 许可
src/providers/workers-ai.ts            构建期文本向量
src/images/policy.ts                   A+ 首图排序和降级
src/relations/hard-relations.ts        同作者、同系列和同一期
src/relations/similarity.ts            可解释相似度
src/enrichment/enrich-catalog.ts       候选合并和审核问题
tools/enrich-catalog.ts                增强 CLI
tests/providers/*.test.ts              离线提供方契约测试
tests/fixtures/providers/*.json        固定 API 响应
tests/images/policy.test.ts             首图排序测试
tests/relations/*.test.ts              关系和排序测试
tests/enrichment/enrich-catalog.test.ts 端到端增强测试
data/providers/cache/                  最近成功响应摘要
```

## Task 1: 建立提供方接口和可恢复磁盘缓存

Files:

- Create: `src/providers/types.ts`
- Create: `src/providers/cache.ts`
- Create: `tests/providers/cache.test.ts`

Interfaces:

- Consumes: Work 查询上下文、fetch 实现和缓存目录。
- Produces: `ProviderClient<T>`、`ProviderResult<T>`、`readProviderCache()`、`writeProviderCache()`。

- [ ] Step 1: 写缓存失败测试

`tests/providers/cache.test.ts`：

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readProviderCache,
  writeProviderCache,
} from "../../src/providers/cache.js";

describe("provider cache", () => {
  it("round trips the last successful result", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-provider-"));
    await writeProviderCache(root, "open_library", "work_123", {
      provider: "open_library",
      retrievedAt: "2026-07-14T00:00:00.000Z",
      records: [{ externalId: "OL1W" }],
    });
    expect(await readProviderCache(root, "open_library", "work_123")).toEqual({
      provider: "open_library",
      retrievedAt: "2026-07-14T00:00:00.000Z",
      records: [{ externalId: "OL1W" }],
    });
    expect(
      JSON.parse(await readFile(`${root}/open_library/work_123.json`, "utf8")),
    ).toBeTruthy();
  });
});
```

- [ ] Step 2: 运行测试并确认失败

Run:

```bash
pnpm exec vitest run tests/providers/cache.test.ts
```

Expected: FAIL，cache 模块不存在。

- [ ] Step 3: 定义提供方接口

`src/providers/types.ts`：

```ts
export type ProviderName =
  "open_library" | "tmdb" | "wikidata" | "commons" | "workers_ai";

export type WorkLookup = {
  workId: string;
  title: string;
  originalTitle?: string;
  creatorNames: string[];
  year?: number;
  mediaType:
    "book" | "film" | "television" | "documentary" | "podcast" | "other";
};

export type ProviderResult<T> = {
  provider: ProviderName;
  retrievedAt: string;
  records: T[];
};

export interface ProviderClient<T> {
  readonly name: ProviderName;
  lookup(query: WorkLookup): Promise<ProviderResult<T>>;
}
```

- [ ] Step 4: 实现原子缓存

`src/providers/cache.ts`：

```ts
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProviderName, ProviderResult } from "./types.js";

export async function readProviderCache<T>(
  root: string,
  provider: ProviderName,
  key: string,
): Promise<ProviderResult<T> | undefined> {
  try {
    return JSON.parse(
      await readFile(join(root, provider, `${key}.json`), "utf8"),
    ) as ProviderResult<T>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function writeProviderCache<T>(
  root: string,
  provider: ProviderName,
  key: string,
  value: ProviderResult<T>,
): Promise<void> {
  const directory = join(root, provider);
  const finalPath = join(directory, `${key}.json`);
  const tempPath = `${finalPath}.tmp`;
  await mkdir(directory, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tempPath, finalPath);
}
```

- [ ] Step 5: 验证并提交

Run:

```bash
pnpm exec vitest run tests/providers/cache.test.ts
script/typecheck
script/lint
git add src/providers tests/providers/cache.test.ts
git commit -m "feat: add cached provider interface"
```

Expected: 测试、类型和 lint 通过，提交成功。

## Task 2: 实现 Open Library、TMDB 和 Wikimedia 候选提供方

Files:

- Create: `src/providers/open-library.ts`
- Create: `src/providers/tmdb.ts`
- Create: `src/providers/wikimedia.ts`
- Create: `tests/fixtures/providers/open-library-search.json`
- Create: `tests/fixtures/providers/tmdb-search.json`
- Create: `tests/fixtures/providers/wikimedia-entity.json`
- Create: `tests/providers/open-library.test.ts`
- Create: `tests/providers/tmdb.test.ts`
- Create: `tests/providers/wikimedia.test.ts`

Interfaces:

- Consumes: `WorkLookup` 和注入的 `fetch`。
- Produces: `OpenLibraryClient`、`TmdbClient`、`WikimediaClient`。

- [ ] Step 1: 写提供方契约失败测试

Open Library 测试必须断言：

```ts
expect(result.records[0]).toMatchObject({
  externalId: "OL45804W",
  title: "Speak, Memory",
  cover: {
    handling: "hotlink_only",
    url: "https://covers.openlibrary.org/b/id/126481-L.jpg",
  },
});
```

TMDB 测试必须断言：

```ts
expect(result.records[0]).toMatchObject({
  externalId: "123",
  originalTitle: "The Attorney",
  originalLanguage: "ko",
  posterPath: "/poster.jpg",
});
```

Wikimedia 测试必须断言 Commons 图片保留：

```ts
expect(result.records[0]?.image).toMatchObject({
  sourcePageUrl: expect.stringContaining("commons.wikimedia.org"),
  license: "CC BY-SA 4.0",
  attribution: expect.any(String),
});
```

- [ ] Step 2: 运行测试并确认失败

Run:

```bash
pnpm exec vitest run tests/providers/open-library.test.ts tests/providers/tmdb.test.ts tests/providers/wikimedia.test.ts
```

Expected: FAIL，三个 client 尚不存在。

- [ ] Step 3: 实现 Open Library client

使用构造函数注入 fetch：

```ts
export class OpenLibraryClient implements ProviderClient<OpenLibraryRecord> {
  readonly name = "open_library" as const;
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  async lookup(query: WorkLookup): Promise<ProviderResult<OpenLibraryRecord>>;
}
```

请求 `https://openlibrary.org/search.json`，参数为 `title`、可选 `author` 和
`limit=5`。只返回标题和作者均规范化匹配的候选。封面 URL 使用
`https://covers.openlibrary.org/b/id/{cover_i}-L.jpg?default=false`，处理模式固定为
`hotlink_only`，不得下载到 R2。

- [ ] Step 4: 实现 TMDB client

构造函数：

```ts
export class TmdbClient implements ProviderClient<TmdbRecord> {
  readonly name = "tmdb" as const;
  constructor(
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!token) throw new Error("TMDB_API_TOKEN is required");
  }
  async lookup(query: WorkLookup): Promise<ProviderResult<TmdbRecord>>;
}
```

电影和纪录片调用 `/3/search/movie`，电视调用 `/3/search/tv`。请求使用
Bearer token。候选必须比较原始标题、发行年份和原始语言。输出海报路径，不在
client 中拼接尺寸 URL。站点方法页必须显示 TMDB 标志和官方要求的免责声明。

- [ ] Step 5: 实现 Wikimedia client

先用 Wikidata `wbsearchentities` 找实体，再用 `wbgetentities` 读取外部 ID 和图片名。
如有 Commons 文件，调用 Commons `action=query&prop=imageinfo&iiprop=url|extmetadata`。
只有 `LicenseShortName`、`Artist` 和 `Credit` 均存在时返回图片候选。

结构化 Wikidata 记录标为 CC0。Commons 图片的 license 和 attribution 使用每个
文件自己的 extmetadata，不能继承 Wikidata 的 CC0。

- [ ] Step 6: 运行契约测试和提交

Run:

```bash
pnpm exec vitest run tests/providers
script/typecheck
script/lint
git add src/providers tests/providers tests/fixtures/providers
git commit -m "feat: add catalog metadata providers"
```

Expected: 所有测试离线通过，没有真实网络请求。

## Task 3: 实现 A+ 原版首图策略

Files:

- Create: `src/images/policy.ts`
- Create: `tests/images/policy.test.ts`

Interfaces:

- Consumes: `Work` 和 ImageAsset 候选。
- Produces: `selectHeroImage(work, candidates, generatedAt): ImageAsset`。

- [ ] Step 1: 写排序和降级失败测试

`tests/images/policy.test.ts` 必须覆盖：

```ts
import { describe, expect, it } from "vitest";
import type { ImageAsset, Work } from "../../src/domain/schemas/catalog.js";
import { selectHeroImage } from "../../src/images/policy.js";

const now = "2026-07-14T00:00:00.000Z";
const work: Work = {
  id: "work_111111111111",
  slug: "speak-memory",
  verificationStatus: "verified",
  publicationStatus: "public",
  sources: [],
  title: "说吧，记忆",
  originalTitle: "Speak, Memory",
  mediaType: "book",
  creatorIds: ["person_111111111111"],
  topicIds: [],
  genres: ["memoir"],
  regions: ["United States"],
};
const base: ImageAsset = {
  id: "image_111111111111",
  workId: work.id,
  role: "edition",
  editionRole: "regional",
  handling: "hotlink_only",
  url: "https://images.example.org/cover.jpg",
  sourcePageUrl: "https://images.example.org/record",
  width: 800,
  height: 1200,
  license: "provider terms",
  attribution: "Example",
  lastVerifiedAt: now,
  broken: false,
};
const original: ImageAsset = {
  ...base,
  id: "image_222222222222",
  role: "hero",
  editionRole: "original",
};
const translated: ImageAsset = {
  ...base,
  id: "image_333333333333",
  editionRole: "translated",
};

describe("selectHeroImage", () => {
  it("prefers an eligible original image over a translated edition", () => {
    expect(selectHeroImage(work, [translated, original], now).id).toBe(
      original.id,
    );
  });

  it("rejects a low resolution original", () => {
    const lowResolution = { ...original, width: 200, height: 300 };
    expect(selectHeroImage(work, [lowResolution, translated], now).id).toBe(
      translated.id,
    );
  });

  it("rejects display prohibited images", () => {
    const prohibited = { ...original, handling: "display_prohibited" as const };
    expect(selectHeroImage(work, [prohibited], now).editionRole).toBe(
      "generated",
    );
  });
});
```

- [ ] Step 2: 运行测试并确认失败

Run:

```bash
pnpm exec vitest run tests/images/policy.test.ts
```

Expected: FAIL，policy 模块不存在。

- [ ] Step 3: 实现资格和优先级

`src/images/policy.ts`：

```ts
import type { ImageAsset, Work } from "../domain/schemas/catalog.js";
import { createStableId } from "../domain/id.js";

function isEligible(asset: ImageAsset): boolean {
  return (
    asset.handling !== "display_prohibited" &&
    !asset.broken &&
    Math.max(asset.width, asset.height) >= 600
  );
}

function rank(asset: ImageAsset): number {
  if (asset.editionRole === "original" && asset.role === "hero") return 0;
  if (asset.editionRole === "original") return 1;
  if (asset.editionRole === "translated") return 2;
  if (asset.editionRole === "regional") return 3;
  return 4;
}

function generatedFallback(work: Work, generatedAt: string): ImageAsset {
  return {
    id: createStableId("image", work.id, "generated-fallback"),
    workId: work.id,
    role: "fallback",
    editionRole: "generated",
    handling: "mirror_allowed",
    url: `/generated-covers/${work.slug}.svg`,
    sourcePageUrl: "site-generated:cover",
    width: 800,
    height: 1200,
    license: "site-generated",
    attribution: "不明白知识库",
    lastVerifiedAt: generatedAt,
    broken: false,
  };
}

export function selectHeroImage(
  work: Work,
  candidates: ImageAsset[],
  generatedAt: string,
): ImageAsset {
  return (
    candidates
      .filter(isEligible)
      .sort(
        (left, right) =>
          rank(left) - rank(right) ||
          right.width * right.height - left.width * left.height,
      )[0] ?? generatedFallback(work, generatedAt)
  );
}
```

- [ ] Step 4: 实现列表缩略图规则

导出：

```ts
export function canUseAsThumbnail(asset: ImageAsset): boolean {
  return (
    asset.handling !== "display_prohibited" &&
    !asset.broken &&
    Math.max(asset.width, asset.height) >= 240
  );
}
```

页面只为 `mirror_allowed` 图片生成 WebP 或 AVIF。`hotlink_only` 直接使用提供方尺寸。

- [ ] Step 5: 验证并提交

Run:

```bash
pnpm exec vitest run tests/images/policy.test.ts
script/typecheck
script/lint
git add src/images tests/images src/domain/schemas/entities.ts
git commit -m "feat: add original-first image policy"
```

Expected: 全部通过。

## Task 4: 生成同作者、同系列和同一期硬关系

Files:

- Create: `src/relations/hard-relations.ts`
- Create: `tests/relations/hard-relations.test.ts`

Interfaces:

- Consumes: Catalog。
- Produces: `buildHardRelations(catalog: Catalog): WorkRelation[]`。

- [ ] Step 1: 写失败测试

测试构造三部作品，两部共享 creator，一部只在同一期出现。断言：

```ts
expect(relations).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ kind: "same_creator", reasons: ["同一创作者"] }),
    expect.objectContaining({
      kind: "same_episode",
      reasons: ["同一期节目推荐"],
    }),
  ]),
);
expect(relations.some((item) => item.fromWorkId === item.toWorkId)).toBe(false);
```

- [ ] Step 2: 运行测试并确认失败

Run:

```bash
pnpm exec vitest run tests/relations/hard-relations.test.ts
```

Expected: FAIL，hard-relations 模块不存在。

- [ ] Step 3: 实现确定关系

`buildHardRelations` 必须：

- 对共享 creatorId 的 Work 生成双向 `same_creator`。
- 对共享非空 seriesId 的 Work 生成双向 `same_series`。
- 对同一 Episode 的公开 Evidence 所引用作品生成双向 `same_episode`。
- 用 `fromWorkId + toWorkId + kind` 生成稳定关系 ID。
- 排除自关联和重复关系。
- sources 使用导致关系成立的作品或 Evidence 来源。

- [ ] Step 4: 验证并提交

Run:

```bash
pnpm exec vitest run tests/relations/hard-relations.test.ts
script/typecheck
script/lint
git add src/relations/hard-relations.ts tests/relations/hard-relations.test.ts
git commit -m "feat: derive deterministic work relations"
```

Expected: 全部通过。

## Task 5: 实现可解释相似度和可选向量信号

Files:

- Create: `src/providers/workers-ai.ts`
- Create: `src/relations/similarity.ts`
- Create: `tests/providers/workers-ai.test.ts`
- Create: `tests/relations/similarity.test.ts`

Interfaces:

- Consumes: 两部 Work 的结构化信号、节目共现和可选 embedding cosine。
- Produces: `scoreSimilarity(input): SimilarityScore | undefined`。

- [ ] Step 1: 写评分失败测试

`tests/relations/similarity.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { scoreSimilarity } from "../../src/relations/similarity.js";

describe("scoreSimilarity", () => {
  it("returns an explanation for structured overlap", () => {
    const result = scoreSimilarity({
      sharedTopicRatio: 1,
      embeddingSimilarity: 0.9,
      sameEpisode: true,
      sameMediaType: true,
      eraRegionRatio: 0.5,
      recommenderOverlap: true,
      editorial: false,
    });
    expect(result?.score).toBeGreaterThan(0.6);
    expect(result?.reasons).toEqual(
      expect.arrayContaining(["主题相近", "同一期节目推荐"]),
    );
  });

  it("rejects vector-only similarity", () => {
    expect(
      scoreSimilarity({
        sharedTopicRatio: 0,
        embeddingSimilarity: 1,
        sameEpisode: false,
        sameMediaType: false,
        eraRegionRatio: 0,
        recommenderOverlap: false,
        editorial: false,
      }),
    ).toBeUndefined();
  });
});
```

- [ ] Step 2: 运行测试并确认失败

Run:

```bash
pnpm exec vitest run tests/relations/similarity.test.ts
```

Expected: FAIL，similarity 模块不存在。

- [ ] Step 3: 实现评分函数

`src/relations/similarity.ts`：

```ts
export type SimilarityInput = {
  sharedTopicRatio: number;
  embeddingSimilarity?: number;
  sameEpisode: boolean;
  sameMediaType: boolean;
  eraRegionRatio: number;
  recommenderOverlap: boolean;
  editorial: boolean;
};

export type SimilarityScore = { score: number; reasons: string[] };

export function scoreSimilarity(
  input: SimilarityInput,
): SimilarityScore | undefined {
  const structuredReasons = [
    input.sharedTopicRatio > 0 ? "主题相近" : undefined,
    input.sameEpisode ? "同一期节目推荐" : undefined,
    input.sameMediaType ? "体裁或媒介相同" : undefined,
    input.eraRegionRatio > 0 ? "时代或地域相近" : undefined,
    input.recommenderOverlap ? "推荐人重合" : undefined,
    input.editorial ? "人工专题关联" : undefined,
  ].filter((value): value is string => value !== undefined);

  if (structuredReasons.length === 0) return undefined;

  const topicScore = Math.min(1, input.sharedTopicRatio) * 0.25;
  const embeddingScore =
    Math.max(0, Math.min(1, input.embeddingSimilarity ?? 0)) * 0.1;
  const score =
    topicScore +
    embeddingScore +
    (input.sameEpisode ? 0.2 : 0) +
    (input.sameMediaType ? 0.15 : 0) +
    Math.min(1, input.eraRegionRatio) * 0.1 +
    (input.recommenderOverlap ? 0.1 : 0) +
    (input.editorial ? 0.1 : 0);

  return { score: Math.min(1, score), reasons: structuredReasons };
}
```

- [ ] Step 4: 实现 Workers AI client

`WorkersAiClient` 读取 `CLOUDFLARE_ACCOUNT_ID` 和
`CLOUDFLARE_API_TOKEN`，调用：

```text
POST https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/run/@cf/qwen/qwen3-embedding-0.6b
```

请求体固定为 `{ "text": string[] }`。构造函数允许注入 fetch。429、配额不足或网络失败时返回空结果并保留旧缓存，不使增强任务失败。401 和 403 视为配置错误，任务退出 1。

- [ ] Step 5: 验证并提交

Run:

```bash
pnpm exec vitest run tests/providers/workers-ai.test.ts tests/relations/similarity.test.ts
script/typecheck
script/lint
git add src/providers/workers-ai.ts src/relations/similarity.ts tests/providers tests/relations
git commit -m "feat: add explainable similarity scoring"
```

Expected: 全部通过。

## Task 6: 合并候选、生成图片和关系目录

Files:

- Create: `src/enrichment/enrich-catalog.ts`
- Create: `tools/enrich-catalog.ts`
- Create: `tests/enrichment/enrich-catalog.test.ts`
- Modify: `data/catalog/provider-records.json`
- Modify: `data/catalog/image-assets.json`
- Modify: `data/catalog/work-relations.json`
- Modify: `data/review/issues.json`
- Modify: `AGENTS.md`

Interfaces:

- Consumes: Catalog、ProviderClient 列表、缓存和环境变量。
- Produces: 增强后的 ProviderRecord、ImageAsset、WorkRelation 和 ReviewIssue。

- [ ] Step 1: 写端到端失败测试

使用两个公开作品、固定提供方和无网络 fetch，断言：

```ts
expect(result.imageAssets.some((asset) => asset.role === "hero")).toBe(true);
expect(
  result.workRelations.some((relation) => relation.kind === "same_creator"),
).toBe(true);
expect(result.reviewIssues.every((issue) => issue.source.url.length > 0)).toBe(
  true,
);
```

- [ ] Step 2: 运行测试并确认失败

Run:

```bash
pnpm exec vitest run tests/enrichment/enrich-catalog.test.ts
```

Expected: FAIL，enrich-catalog 模块不存在。

- [ ] Step 3: 实现合并规则

导出：

```ts
export async function enrichCatalog(
  catalog: Catalog,
  clients: ProviderClient<unknown>[],
  options: { cacheRoot: string; now: string },
): Promise<Catalog>;
```

实现必须按以下顺序：

1. 只处理新增、内容哈希变化或没有 provider record 的 Work。
2. 逐提供方读取缓存，有新结果时原子覆盖缓存。
3. 外部候选不直接改写 Work，先生成 ProviderRecord。
4. 标题、创作者或年份冲突时生成 ReviewIssue。
5. 已确认图片生成 ImageAsset，调用 `selectHeroImage(work, candidates, options.now)` 标记首图。
6. 重新生成硬关系和相似关系。
7. CatalogSchema 和 `validateCatalog` 都通过后才能写文件。

- [ ] Step 4: 创建 CLI

`tools/enrich-catalog.ts` 加载目录、按媒介初始化 client，并把结果原子写回四个目标 JSON。没有 `TMDB_API_TOKEN` 时跳过 TMDB 并输出一行状态，不报错。没有 Cloudflare 凭据时跳过 embedding。不得把凭据写入日志。

- [ ] Step 5: 更新项目规则

在 `AGENTS.md` 增加：

```markdown
- 运行 `bun run tools/enrich-catalog.ts` 增量更新外部元数据、图片和作品关系。
- 提供方响应只能生成候选，发生标题、创作者或年份冲突时必须写入审核队列。
- Open Library 图片保持直连，Commons 图片逐文件保存许可，R2 只保存允许镜像的资产。
```

- [ ] Step 6: 完整验证和提交

Run:

```bash
pnpm exec vitest run tests/providers tests/images tests/relations tests/enrichment
bun run tools/enrich-catalog.ts
bun run tools/validate-data.ts
script/ci
script/build
pnpm exec playwright test tests/e2e/details.spec.ts
```

Expected: 全部通过。离线无凭据运行仍能使用缓存完成构建。

Commit:

```bash
git add src tools tests data AGENTS.md
git commit -m "feat: enrich works with images and relations"
```

## Phase Acceptance

- Open Library、TMDB 和 Wikimedia 使用统一接口和最近成功缓存。
- 外部 API 全部失败时，现有站点仍可构建。
- 首图排序是原版、原版备用、中文版本、其他正式版本、本地生成封面。
- Open Library 图片不进入 R2，Commons 许可逐文件保存。
- 同作者和同一期作为硬关系单独展示。
- 相似结果包含结构化理由，向量不能单独产生推荐。
- 没有 API 密钥、token 或响应全文进入公开构建产物。
