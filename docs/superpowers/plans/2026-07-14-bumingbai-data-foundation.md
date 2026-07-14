# 不明白播客数据基础与迁移实现计划

> For agentic workers: REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans to
> implement this plan task by task. Steps use checkbox syntax for tracking.

Goal: 建立 schema 优先的数据层，把现有 237 期节目和 423 条扁平推荐迁移为可验证、可追溯、可供静态网站读取的规范化目录。

Architecture: 单一 Node.js 与 TypeScript 仓库。Zod schema 是运行时校验和 TypeScript 类型的单一事实来源。迁移器只读取现有 `work/bumingbai_structured.json`，输出分实体 JSON 和审核队列，不删除或改写原始输入。

Tech Stack: Node.js、TypeScript、Zod、Vitest、tsx、ESLint、Prettier、markdownlint-cli2。

## Global Constraints

- 只在功能分支提交，不推送到 `main`。
- 所有 npm CLI 通过本地脚本或 `npx` 运行。
- 所有秘密读取环境变量，`.env` 不进入版本库。
- `work/bumingbai_structured.json` 是迁移输入，不是公开数据契约。
- 每条推荐保留原始文本、官方来源 URL 和核验状态。
- 没有具体译本证据时，翻译质量必须是 `unverified`。
- 先写失败测试，再写最小实现。
- 每个任务结束前运行任务测试、类型检查和 lint。
- 本计划结束后再执行静态网站计划。

---

## File Structure

```text
package.json                         Node 命令和锁定依赖
package-lock.json                    npm 锁文件
.nvmrc                               CI 和本地 Node 主版本
tsconfig.json                        TypeScript 严格配置
eslint.config.js                     ESLint 配置
vitest.config.ts                     离线测试配置
script/setup                         安装锁定依赖
script/typecheck                     类型检查入口
script/lint                          lint 入口
script/test                          测试入口
script/ci                            CI 聚合入口
src/domain/schemas/primitives.ts     ID、状态、来源和公共字段
src/domain/schemas/entities.ts       九类领域实体 schema
src/domain/schemas/catalog.ts        Catalog 根 schema 和派生类型
src/domain/id.ts                     稳定 ID、文本规范化和 slug
src/domain/publication.ts            公开资格和数据质量规则
src/migration/legacy.ts              旧 JSON schema 与迁移函数
tools/migrate-legacy.ts              迁移 CLI
tools/validate-data.ts               规范化目录校验 CLI
tests/domain/id.test.ts              ID 和规范化测试
tests/domain/schemas.test.ts         schema 测试
tests/domain/publication.test.ts     发布规则测试
tests/migration/legacy.test.ts       迁移测试
tests/fixtures/legacy-small.json     最小旧数据夹具
data/catalog/meta.json               schema 版本和真实生成时间
data/catalog/*.json                  分实体规范化目录
data/review/issues.json              待核验队列
```

## Task 1: 建立 TypeScript 与 Scripts to Rule Them All 命令层

Files:

- Create: `package.json`
- Create: `package-lock.json`
- Create: `.nvmrc`
- Create: `tsconfig.json`
- Create: `eslint.config.js`
- Create: `vitest.config.ts`
- Create: `script/setup`
- Create: `script/typecheck`
- Create: `script/lint`
- Create: `script/test`
- Create: `script/ci`

Interfaces:

- Consumes: 当前空的应用根目录。
- Produces: `script/setup`、`script/typecheck`、`script/lint`、`script/test`、`script/ci`。

- [ ] Step 1: 运行入口存在性检查并确认失败

Run:

```bash
test -x script/setup -a -x script/typecheck -a -x script/lint -a -x script/test -a -x script/ci
```

Expected: FAIL，因为 `script/` 入口尚不存在。

- [ ] Step 2: 初始化锁定依赖

Run:

```bash
npm init -y
npm install zod
npm install --save-dev typescript tsx vitest eslint @eslint/js typescript-eslint prettier markdownlint-cli2 @types/node
```

Expected: `package-lock.json` 生成，安装命令退出码为 0。

创建 `.nvmrc`，内容为：

```text
24
```

- [ ] Step 3: 写入项目配置

`package.json` 的 scripts 必须改为：

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint . && prettier --check . && markdownlint-cli2 \"**/*.md\" \"#node_modules\"",
    "test": "vitest run",
    "ci": "npm run typecheck && npm run lint && npm test"
  },
  "type": "module"
}
```

保留 npm 安装写入的 `dependencies` 和 `devDependencies`。

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src", "tools", "tests", "*.ts", "*.js"]
}
```

`eslint.config.js`：

```js
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "data/catalog"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
```

`vitest.config.ts`：

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
  },
});
```

- [ ] Step 4: 创建稳定命令入口

每个文件都使用 LF 换行并设置可执行位。

`script/setup`：

```bash
#!/usr/bin/env bash
set -euo pipefail
npm ci
```

`script/typecheck`：

```bash
#!/usr/bin/env bash
set -euo pipefail
npm run typecheck
```

`script/lint`：

```bash
#!/usr/bin/env bash
set -euo pipefail
npm run lint
```

`script/test`：

```bash
#!/usr/bin/env bash
set -euo pipefail
npm test
```

`script/ci`：

```bash
#!/usr/bin/env bash
set -euo pipefail
npm run ci
```

Run:

```bash
chmod +x script/setup script/typecheck script/lint script/test script/ci
```

- [ ] Step 5: 验证命令层

Run:

```bash
test -x script/setup -a -x script/typecheck -a -x script/lint -a -x script/test -a -x script/ci
script/typecheck
script/lint
```

Expected: 三个命令均退出 0。此时没有测试文件，`script/test` 可返回 “No test files found” 并退出 1，因此在 Task 2 后再纳入完整 `script/ci`。

- [ ] Step 6: 提交脚手架

```bash
git add package.json package-lock.json .nvmrc tsconfig.json eslint.config.js vitest.config.ts script
git commit -m "chore: add typed project command layer"
```

## Task 2: 定义 schema 和 Catalog 契约

Files:

- Create: `src/domain/schemas/primitives.ts`
- Create: `src/domain/schemas/entities.ts`
- Create: `src/domain/schemas/catalog.ts`
- Create: `tests/domain/schemas.test.ts`

Interfaces:

- Consumes: Zod。
- Produces: `CatalogSchema`、`Catalog`、`Episode`、`Person`、`Work`、`Edition`、`RecommendationEvidence`、`ImageAsset`、`WorkRelation`、`ProviderRecord`、`ReviewIssue`。

- [ ] Step 1: 写 schema 失败测试

`tests/domain/schemas.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { CatalogSchema } from "../../src/domain/schemas/catalog.js";

describe("CatalogSchema", () => {
  it("accepts an empty versioned catalog", () => {
    expect(
      CatalogSchema.parse({
        schemaVersion: 1,
        generatedAt: "2026-07-14T00:00:00.000Z",
        episodes: [],
        people: [],
        topics: [],
        works: [],
        editions: [],
        recommendationEvidence: [],
        imageAssets: [],
        workRelations: [],
        providerRecords: [],
        reviewIssues: [],
      }),
    ).toBeTruthy();
  });

  it("rejects a recommendation without raw evidence text", () => {
    const result = CatalogSchema.safeParse({
      schemaVersion: 1,
      generatedAt: "2026-07-14T00:00:00.000Z",
      episodes: [],
      people: [],
      topics: [],
      works: [],
      editions: [],
      recommendationEvidence: [
        {
          id: "evidence_111111111111",
          episodeId: "episode_111111111111",
          workId: "work_111111111111",
          rawText: "",
          source: {
            kind: "official_episode",
            url: "https://bumingbai.net/example",
            retrievedAt: "2026-07-14T00:00:00.000Z",
          },
          verificationStatus: "verified",
          publicationStatus: "public",
        },
      ],
      imageAssets: [],
      workRelations: [],
      providerRecords: [],
      reviewIssues: [],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] Step 2: 运行测试并确认失败

Run:

```bash
npx vitest run tests/domain/schemas.test.ts
```

Expected: FAIL，模块 `src/domain/schemas/catalog.js` 不存在。

- [ ] Step 3: 实现基础 schema

`src/domain/schemas/primitives.ts`：

```ts
import { z } from "zod";

export const EntityIdSchema = z.string().regex(/^[a-z]+_[a-f0-9]{12}$/);
export const IsoDateSchema = z.string().datetime();
export const UrlSchema = z.string().url();

export const VerificationStatusSchema = z.enum([
  "verified",
  "partially_verified",
  "pending_verification",
  "rejected",
]);

export const PublicationStatusSchema = z.enum(["public", "withheld"]);
export const SourceKindSchema = z.enum([
  "official_episode",
  "official_transcript",
  "official_rss",
  "provider_api",
  "publisher",
  "library_catalog",
  "external_reference",
  "manual_review",
]);

export const SourceRefSchema = z.object({
  kind: SourceKindSchema,
  url: UrlSchema,
  retrievedAt: IsoDateSchema,
  locator: z.string().min(1).optional(),
});

export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
export type PublicationStatus = z.infer<typeof PublicationStatusSchema>;
export type SourceRef = z.infer<typeof SourceRefSchema>;
```

`src/domain/schemas/entities.ts`：

```ts
import { z } from "zod";
import {
  EntityIdSchema,
  IsoDateSchema,
  PublicationStatusSchema,
  SourceRefSchema,
  VerificationStatusSchema,
} from "./primitives.js";

const BaseEntitySchema = z.object({
  id: EntityIdSchema,
  slug: z.string().min(1),
  verificationStatus: VerificationStatusSchema,
  publicationStatus: PublicationStatusSchema,
  sources: z.array(SourceRefSchema),
});

export const EpisodeSchema = BaseEntitySchema.extend({
  number: z.number().int().positive(),
  title: z.string().min(1),
  publishedAt: IsoDateSchema,
  duration: z.string().min(1).optional(),
  officialUrl: z.string().url(),
  transcriptUrl: z.string().url().optional(),
  guestIds: z.array(EntityIdSchema),
  topicIds: z.array(EntityIdSchema),
});

export const PersonSchema = BaseEntitySchema.extend({
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)),
  roles: z.array(z.enum(["guest", "host", "author", "director", "translator"])),
});

export const TopicSchema = BaseEntitySchema.extend({
  name: z.string().min(1),
  description: z.string().min(1),
  aliases: z.array(z.string().min(1)),
});

export const WorkSchema = BaseEntitySchema.extend({
  title: z.string().min(1),
  originalTitle: z.string().min(1).optional(),
  mediaType: z.enum([
    "book",
    "film",
    "television",
    "documentary",
    "podcast",
    "other",
  ]),
  creatorIds: z.array(EntityIdSchema),
  year: z.number().int().min(1000).max(2100).optional(),
  topicIds: z.array(EntityIdSchema),
  genres: z.array(z.string().min(1)),
  regions: z.array(z.string().min(1)),
  seriesId: EntityIdSchema.optional(),
});

export const EditionSchema = BaseEntitySchema.extend({
  workId: EntityIdSchema,
  language: z.string().min(2),
  region: z.string().min(2).optional(),
  title: z.string().min(1),
  translatorIds: z.array(EntityIdSchema),
  publisher: z.string().min(1).optional(),
  publishedAt: z.string().min(4).optional(),
  isbn: z.string().min(10).optional(),
  translationAssessment: z.object({
    status: z.enum(["unverified", "verified"]),
    summary: z.string().min(1),
    sources: z.array(SourceRefSchema),
  }),
});

export const RecommendationEvidenceSchema = z.object({
  id: EntityIdSchema,
  episodeId: EntityIdSchema,
  workId: EntityIdSchema,
  recommenderId: EntityIdSchema.optional(),
  rawText: z.string().min(1),
  source: SourceRefSchema,
  verificationStatus: VerificationStatusSchema,
  publicationStatus: PublicationStatusSchema,
});

export const ImageAssetSchema = z.object({
  id: EntityIdSchema,
  workId: EntityIdSchema,
  editionId: EntityIdSchema.optional(),
  role: z.enum(["hero", "edition", "fallback"]),
  editionRole: z.enum(["original", "translated", "regional", "generated"]),
  handling: z.enum(["hotlink_only", "mirror_allowed", "display_prohibited"]),
  url: z.union([z.string().url(), z.string().regex(/^\/[^\s]+$/u)]),
  sourcePageUrl: z.union([
    z.string().url(),
    z.string().regex(/^site-generated:[a-z-]+$/u),
  ]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  license: z.string().min(1),
  attribution: z.string(),
  lastVerifiedAt: IsoDateSchema,
  broken: z.boolean(),
});

export const WorkRelationSchema = z.object({
  id: EntityIdSchema,
  fromWorkId: EntityIdSchema,
  toWorkId: EntityIdSchema,
  kind: z.enum([
    "same_creator",
    "same_series",
    "same_episode",
    "similar",
    "editorial",
  ]),
  score: z.number().min(0).max(1).optional(),
  reasons: z.array(z.string().min(1)).min(1),
  sources: z.array(SourceRefSchema),
});

export const ProviderRecordSchema = z.object({
  id: EntityIdSchema,
  provider: z.enum([
    "open_library",
    "tmdb",
    "wikidata",
    "commons",
    "workers_ai",
    "google_books",
  ]),
  entityId: EntityIdSchema,
  externalId: z.string().min(1),
  retrievedAt: IsoDateSchema,
  normalizedHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const ReviewIssueSchema = z.object({
  id: EntityIdSchema,
  entityId: EntityIdSchema.optional(),
  field: z.string().min(1),
  reason: z.string().min(1),
  candidates: z.array(z.string()),
  source: SourceRefSchema,
  status: z.enum(["open", "resolved", "dismissed"]),
});
```

`src/domain/schemas/catalog.ts`：

```ts
import { z } from "zod";
import { IsoDateSchema } from "./primitives.js";
import {
  EditionSchema,
  EpisodeSchema,
  ImageAssetSchema,
  PersonSchema,
  TopicSchema,
  ProviderRecordSchema,
  RecommendationEvidenceSchema,
  ReviewIssueSchema,
  WorkRelationSchema,
  WorkSchema,
} from "./entities.js";

export const CatalogSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: IsoDateSchema,
  episodes: z.array(EpisodeSchema),
  people: z.array(PersonSchema),
  topics: z.array(TopicSchema),
  works: z.array(WorkSchema),
  editions: z.array(EditionSchema),
  recommendationEvidence: z.array(RecommendationEvidenceSchema),
  imageAssets: z.array(ImageAssetSchema),
  workRelations: z.array(WorkRelationSchema),
  providerRecords: z.array(ProviderRecordSchema),
  reviewIssues: z.array(ReviewIssueSchema),
});

export const CatalogMetaSchema = CatalogSchema.pick({
  schemaVersion: true,
  generatedAt: true,
});

export type Catalog = z.infer<typeof CatalogSchema>;
export type Episode = z.infer<typeof EpisodeSchema>;
export type Person = z.infer<typeof PersonSchema>;
export type Topic = z.infer<typeof TopicSchema>;
export type Work = z.infer<typeof WorkSchema>;
export type Edition = z.infer<typeof EditionSchema>;
export type RecommendationEvidence = z.infer<
  typeof RecommendationEvidenceSchema
>;
export type ImageAsset = z.infer<typeof ImageAssetSchema>;
export type WorkRelation = z.infer<typeof WorkRelationSchema>;
export type ProviderRecord = z.infer<typeof ProviderRecordSchema>;
export type ReviewIssue = z.infer<typeof ReviewIssueSchema>;
```

- [ ] Step 4: 运行 schema 测试

Run:

```bash
npx vitest run tests/domain/schemas.test.ts
script/typecheck
```

Expected: 测试通过，类型检查退出 0。

- [ ] Step 5: 提交 schema

```bash
git add src/domain/schemas tests/domain/schemas.test.ts
git commit -m "feat: define catalog schemas"
```

## Task 3: 实现稳定 ID 和文本规范化

Files:

- Create: `src/domain/id.ts`
- Create: `tests/domain/id.test.ts`

Interfaces:

- Consumes: UTF-8 文本和实体前缀。
- Produces: `normalizeIdentityText(value: string): string`、`createStableId(prefix: string, ...parts: string[]): string`、`createSlug(value: string): string`。

- [ ] Step 1: 写失败测试

`tests/domain/id.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import {
  createSlug,
  createStableId,
  normalizeIdentityText,
} from "../../src/domain/id.js";

describe("identity helpers", () => {
  it("normalizes width, case, and whitespace", () => {
    expect(normalizeIdentityText("  Speak，  Memory  ")).toBe("speak, memory");
  });

  it("creates deterministic prefixed ids", () => {
    expect(createStableId("work", "Speak, Memory", "Vladimir Nabokov")).toMatch(
      /^work_[a-f0-9]{12}$/,
    );
    expect(createStableId("work", "Speak, Memory", "Vladimir Nabokov")).toBe(
      createStableId("work", " speak,  memory ", "vladimir nabokov"),
    );
  });

  it("keeps Chinese characters in slugs", () => {
    expect(createSlug("说吧，记忆 Speak Memory")).toBe(
      "说吧-记忆-speak-memory",
    );
  });
});
```

- [ ] Step 2: 运行测试并确认失败

Run:

```bash
npx vitest run tests/domain/id.test.ts
```

Expected: FAIL，模块 `src/domain/id.js` 不存在。

- [ ] Step 3: 写最小实现

`src/domain/id.ts`：

```ts
import { createHash } from "node:crypto";

export function normalizeIdentityText(value: string): string {
  return value
    .normalize("NFKC")
    .replaceAll("，", ",")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

export function createStableId(prefix: string, ...parts: string[]): string {
  const identity = parts.map(normalizeIdentityText).join("\u001f");
  const digest = createHash("sha256")
    .update(identity)
    .digest("hex")
    .slice(0, 12);
  return `${prefix}_${digest}`;
}

export function createSlug(value: string): string {
  return normalizeIdentityText(value)
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}
```

- [ ] Step 4: 验证实现

Run:

```bash
npx vitest run tests/domain/id.test.ts
script/typecheck
script/lint
```

Expected: 全部通过。

- [ ] Step 5: 提交 ID 工具

```bash
git add src/domain/id.ts tests/domain/id.test.ts
git commit -m "feat: add stable catalog identities"
```

## Task 4: 迁移旧 JSON 并生成审核问题

Files:

- Create: `src/migration/legacy.ts`
- Create: `tools/migrate-legacy.ts`
- Create: `tests/fixtures/legacy-small.json`
- Create: `tests/migration/legacy.test.ts`

Interfaces:

- Consumes: `migrateLegacy(input: unknown, generatedAt: string): Catalog`。
- Produces: 保留所有旧推荐的 Catalog，无法确认的字段进入 `reviewIssues`。

- [ ] Step 1: 创建最小夹具和失败测试

`tests/fixtures/legacy-small.json`：

```json
{
  "source": "official RSS and WordPress",
  "retrieved_at": "2026-07-14T00:00:00.000Z",
  "episode_count": 1,
  "recommendation_count": 1,
  "episodes": [
    {
      "episode_number": 4,
      "title": "伊险峰/杨樱：上海封城中的文艺复兴",
      "published_at": "Fri, 17 Jun 2022 09:00:00 GMT",
      "duration": "01:00:00",
      "official_url": "https://bumingbai.net/2022/06/17/ep-004/",
      "transcript_url": "https://bumingbai.net/2022/06/17/ep-004-transcript/",
      "guest_or_participants": "伊险峰、杨樱",
      "recommendation_status": "官方简介明确标注"
    }
  ],
  "recommendations": [
    {
      "episode_number": 4,
      "recommendation_order": 1,
      "recommender": "杨樱",
      "raw_entry": "《休战》 普里莫·莱维 著",
      "title": "休战",
      "original_title": "La tregua",
      "creator": "普里莫·莱维",
      "media_type": "书籍/文本",
      "item_source_url": "https://book.douban.com/subject/10577893/",
      "has_chinese_translation": "有，已定位到具体中文版本",
      "translator": "杨晨光",
      "publisher": "中信出版社",
      "publication_year": "2015",
      "isbn": "9787508652535",
      "translation_quality": "未核实",
      "metadata_source_url": "https://book.douban.com/subject/10577893/",
      "metadata_status": "已抓取推荐链接元数据"
    }
  ]
}
```

`tests/migration/legacy.test.ts`：

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { migrateLegacy } from "../../src/migration/legacy.js";

describe("migrateLegacy", () => {
  it("preserves episode evidence and creates normalized entities", async () => {
    const raw = JSON.parse(
      await readFile("tests/fixtures/legacy-small.json", "utf8"),
    ) as unknown;
    const catalog = migrateLegacy(raw, "2026-07-14T00:00:00.000Z");

    expect(catalog.episodes).toHaveLength(1);
    expect(catalog.works).toHaveLength(1);
    expect(catalog.recommendationEvidence[0]?.rawText).toContain("《休战》");
    expect(catalog.recommendationEvidence[0]?.source.url).toContain(
      "bumingbai.net",
    );
    expect(catalog.editions[0]?.translationAssessment.status).toBe(
      "unverified",
    );
  });
});
```

- [ ] Step 2: 运行测试并确认失败

Run:

```bash
npx vitest run tests/migration/legacy.test.ts
```

Expected: FAIL，`migrateLegacy` 不存在。

- [ ] Step 3: 实现旧结构校验和迁移

`src/migration/legacy.ts` 必须：

1. 使用 Zod 校验根对象、节目和推荐必需字段。
2. 用 `episode_number` 连接推荐与节目。
3. 用原名、标题、创作者和 ISBN 生成稳定实体 ID。
4. 把 `raw_entry` 原样写入 RecommendationEvidence。
5. 只有官方节目 URL 存在时把证据设为 `partially_verified`。
6. 把缺少创作者、标题拆分异常和版本冲突写入 ReviewIssue。

核心导出必须是：

```ts
export function migrateLegacy(input: unknown, generatedAt: string): Catalog;
```

实现主体使用以下结构，不能在迁移器内读取全局时钟：

```ts
import { z } from "zod";
import { createSlug, createStableId } from "../domain/id.js";
import {
  CatalogSchema,
  type Catalog,
  type Person,
  type SourceRef,
  type Work,
} from "../domain/schemas/catalog.js";

const LegacyEpisodeSchema = z.object({
  episode_number: z.coerce.number().int().positive(),
  title: z.string().min(1),
  published_at: z.string().min(1),
  duration: z.string().optional().default(""),
  official_url: z.string().url(),
  transcript_url: z.string().url().or(z.literal("")).optional(),
  guest_or_participants: z.string().optional().default(""),
  recommendation_status: z.string().optional().default(""),
});

const LegacyRecommendationSchema = z.object({
  episode_number: z.coerce.number().int().positive(),
  recommendation_order: z.coerce.number().int().positive(),
  recommender: z.string().optional().default(""),
  raw_entry: z.string().min(1),
  title: z.string().min(1),
  original_title: z.string().optional().default(""),
  creator: z.string().optional().default(""),
  media_type: z.string().optional().default(""),
  item_source_url: z.string().optional().default(""),
  translator: z.string().optional().default(""),
  publisher: z.string().optional().default(""),
  publication_year: z.string().optional().default(""),
  isbn: z.string().optional().default(""),
});

const LegacyRootSchema = z.object({
  retrieved_at: z.string().min(1),
  episodes: z.array(LegacyEpisodeSchema),
  recommendations: z.array(LegacyRecommendationSchema),
});

function mapMediaType(value: string): Work["mediaType"] {
  if (value.includes("纪录片")) return "documentary";
  if (value.includes("影视") || value.includes("电影")) return "film";
  if (value.includes("播客")) return "podcast";
  if (value.includes("书籍") || value.includes("文本")) return "book";
  return "other";
}

function splitNames(value: string): string[] {
  return value
    .split(/[、,/]/u)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function migrateLegacy(input: unknown, generatedAt: string): Catalog {
  const legacy = LegacyRootSchema.parse(input);
  const retrievedAt = new Date(legacy.retrieved_at).toISOString();
  const people = new Map<string, Person>();

  function personFor(
    name: string,
    role: Person["roles"][number],
    source: SourceRef,
  ): Person {
    const id = createStableId("person", name);
    const existing = people.get(id);
    if (existing) {
      if (!existing.roles.includes(role)) existing.roles.push(role);
      return existing;
    }
    const person: Person = {
      id,
      slug: `${createSlug(name)}-${id.slice(-6)}`,
      name,
      aliases: [],
      roles: [role],
      verificationStatus: "partially_verified",
      publicationStatus: "public",
      sources: [source],
    };
    people.set(id, person);
    return person;
  }

  const episodeByNumber = new Map(
    legacy.episodes.map((item) => [item.episode_number, item]),
  );
  const episodes = legacy.episodes.map((item) => {
    const source: SourceRef = {
      kind: "official_episode",
      url: item.official_url,
      retrievedAt,
    };
    const id = createStableId("episode", String(item.episode_number));
    return {
      id,
      slug: `ep-${String(item.episode_number).padStart(3, "0")}`,
      number: item.episode_number,
      title: item.title,
      publishedAt: new Date(item.published_at).toISOString(),
      ...(item.duration ? { duration: item.duration } : {}),
      officialUrl: item.official_url,
      ...(item.transcript_url ? { transcriptUrl: item.transcript_url } : {}),
      guestIds: splitNames(item.guest_or_participants).map(
        (name) => personFor(name, "guest", source).id,
      ),
      topicIds: [],
      verificationStatus: "partially_verified" as const,
      publicationStatus: "public" as const,
      sources: [source],
    };
  });

  const works = new Map<string, Catalog["works"][number]>();
  const editions: Catalog["editions"] = [];
  const recommendationEvidence: Catalog["recommendationEvidence"] = [];
  const reviewIssues: Catalog["reviewIssues"] = [];

  for (const item of legacy.recommendations) {
    const episode = episodeByNumber.get(item.episode_number);
    if (!episode) throw new Error(`Missing episode ${item.episode_number}`);
    const source: SourceRef = {
      kind: "official_episode",
      url: episode.official_url,
      retrievedAt,
      locator: `recommendation-${item.recommendation_order}`,
    };
    const creator = item.creator.trim();
    const identityTitle = item.original_title.trim() || item.title.trim();
    const workId = createStableId("work", identityTitle, creator);
    const creatorIds = creator
      ? [
          personFor(
            creator,
            item.media_type.includes("影视") ? "director" : "author",
            source,
          ).id,
        ]
      : [];

    if (!works.has(workId)) {
      works.set(workId, {
        id: workId,
        slug: `${createSlug(item.title)}-${workId.slice(-6)}`,
        title: item.title.trim(),
        ...(item.original_title.trim()
          ? { originalTitle: item.original_title.trim() }
          : {}),
        mediaType: mapMediaType(item.media_type),
        creatorIds,
        topicIds: [],
        genres: [],
        regions: [],
        verificationStatus: "partially_verified",
        publicationStatus: "public",
        sources: [source],
      });
    }

    const recommenderId = item.recommender.trim()
      ? personFor(item.recommender.trim(), "guest", source).id
      : undefined;
    recommendationEvidence.push({
      id: createStableId(
        "evidence",
        String(item.episode_number),
        String(item.recommendation_order),
        item.raw_entry,
      ),
      episodeId: createStableId("episode", String(item.episode_number)),
      workId,
      ...(recommenderId ? { recommenderId } : {}),
      rawText: item.raw_entry,
      source,
      verificationStatus: "partially_verified",
      publicationStatus: "public",
    });

    if (item.isbn || item.translator || item.publisher) {
      const translatorIds = splitNames(item.translator).map(
        (name) => personFor(name, "translator", source).id,
      );
      const editionId = createStableId(
        "edition",
        workId,
        item.isbn || item.translator,
        item.publisher,
      );
      editions.push({
        id: editionId,
        slug: `${createSlug(item.title)}-${editionId.slice(-6)}`,
        workId,
        language: "zh",
        title: item.title.trim(),
        translatorIds,
        ...(item.publisher ? { publisher: item.publisher } : {}),
        ...(item.publication_year
          ? { publishedAt: item.publication_year }
          : {}),
        ...(item.isbn ? { isbn: item.isbn } : {}),
        translationAssessment: {
          status: "unverified",
          summary: "未核实，作品总评分不能代替翻译评价",
          sources: [],
        },
        verificationStatus: "partially_verified",
        publicationStatus: "public",
        sources: item.item_source_url
          ? [
              source,
              {
                kind: "external_reference",
                url: item.item_source_url,
                retrievedAt,
              },
            ]
          : [source],
      });
    }

    if (!creator) {
      reviewIssues.push({
        id: createStableId("review", workId, "creator"),
        entityId: workId,
        field: "creatorIds",
        reason: "旧记录没有可确认的创作者",
        candidates: [],
        source,
        status: "open",
      });
    }
  }

  return CatalogSchema.parse({
    schemaVersion: 1,
    generatedAt,
    episodes,
    people: [...people.values()],
    topics: [],
    works: [...works.values()],
    editions,
    recommendationEvidence,
    imageAssets: [],
    workRelations: [],
    providerRecords: [],
    reviewIssues,
  });
}
```

- [ ] Step 4: 创建迁移 CLI

`tools/migrate-legacy.ts`：

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { migrateLegacy } from "../src/migration/legacy.js";

const inputPath = process.argv[2] ?? "work/bumingbai_structured.json";
const outputDir = process.argv[3] ?? "data/catalog";
const raw = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
const catalog = migrateLegacy(raw, new Date().toISOString());

await mkdir(outputDir, { recursive: true });
await mkdir("data/review", { recursive: true });

const outputs = {
  "meta.json": {
    schemaVersion: catalog.schemaVersion,
    generatedAt: catalog.generatedAt,
  },
  "episodes.json": catalog.episodes,
  "people.json": catalog.people,
  "topics.json": catalog.topics,
  "works.json": catalog.works,
  "editions.json": catalog.editions,
  "recommendation-evidence.json": catalog.recommendationEvidence,
  "image-assets.json": catalog.imageAssets,
  "work-relations.json": catalog.workRelations,
  "provider-records.json": catalog.providerRecords,
};

await Promise.all(
  Object.entries(outputs).map(([name, value]) =>
    writeFile(`${outputDir}/${name}`, `${JSON.stringify(value, null, 2)}\n`),
  ),
);
await writeFile(
  "data/review/issues.json",
  `${JSON.stringify(catalog.reviewIssues, null, 2)}\n`,
);
```

- [ ] Step 5: 验证迁移测试和类型

Run:

```bash
npx vitest run tests/migration/legacy.test.ts
script/typecheck
script/lint
```

Expected: 全部通过。

- [ ] Step 6: 提交迁移器

```bash
git add src/migration tools/migrate-legacy.ts tests/fixtures tests/migration
git commit -m "feat: migrate legacy podcast catalog"
```

## Task 5: 实现公开资格和跨实体完整性检查

Files:

- Create: `src/domain/publication.ts`
- Create: `tests/domain/publication.test.ts`
- Create: `tools/validate-data.ts`

Interfaces:

- Consumes: `Catalog`。
- Produces: `validateCatalog(catalog: Catalog): ValidationIssue[]`、`canPublishRecommendation(evidence: RecommendationEvidence): boolean`。

- [ ] Step 1: 写失败测试

`tests/domain/publication.test.ts` 至少覆盖：

```ts
import { describe, expect, it } from "vitest";
import { canPublishRecommendation } from "../../src/domain/publication.js";

describe("canPublishRecommendation", () => {
  it("rejects pending evidence", () => {
    expect(
      canPublishRecommendation({
        id: "evidence_111111111111",
        episodeId: "episode_111111111111",
        workId: "work_111111111111",
        rawText: "《休战》",
        source: {
          kind: "official_episode",
          url: "https://bumingbai.net/example",
          retrievedAt: "2026-07-14T00:00:00.000Z",
        },
        verificationStatus: "pending_verification",
        publicationStatus: "withheld",
      }),
    ).toBe(false);
  });

  it("accepts verified official evidence", () => {
    expect(
      canPublishRecommendation({
        id: "evidence_222222222222",
        episodeId: "episode_222222222222",
        workId: "work_222222222222",
        rawText: "《休战》 普里莫·莱维 著",
        source: {
          kind: "official_transcript",
          url: "https://bumingbai.net/example-transcript",
          retrievedAt: "2026-07-14T00:00:00.000Z",
        },
        verificationStatus: "verified",
        publicationStatus: "public",
      }),
    ).toBe(true);
  });
});
```

- [ ] Step 2: 运行测试并确认失败

Run:

```bash
npx vitest run tests/domain/publication.test.ts
```

Expected: FAIL，publication 模块不存在。

- [ ] Step 3: 实现规则

`src/domain/publication.ts` 必须：

- 只允许 `verified` 或 `partially_verified` 的官方证据公开。
- 检查 evidence 引用的 episode 和 work 是否存在。
- 检查 Edition 引用的 work 和 translator 是否存在。
- 检查 Episode 和 Work 引用的 topic 是否存在。
- 检查非 `unverified` 翻译评价至少有一个来源。
- 检查所有 ID 唯一。
- 检查公开 Work 至少有一个公开 RecommendationEvidence。

使用以下返回类型：

```ts
export type ValidationIssue = {
  code:
    | "duplicate_id"
    | "missing_reference"
    | "unsupported_translation_assessment"
    | "public_work_without_evidence";
  entityId: string;
  message: string;
};
```

- [ ] Step 4: 创建校验 CLI

`tools/validate-data.ts` 读取 `data/catalog/*.json` 与
`data/review/issues.json`，组合为 Catalog，先运行 `CatalogSchema.parse`，再运行
`validateCatalog`。有问题时逐行输出 `code entityId message` 并设置
`process.exitCode = 1`，没有问题时输出实体计数并退出 0。

- [ ] Step 5: 验证规则

Run:

```bash
npx vitest run tests/domain/publication.test.ts
script/ci
```

Expected: 全部通过。

- [ ] Step 6: 提交校验器

```bash
git add src/domain/publication.ts tests/domain/publication.test.ts tools/validate-data.ts
git commit -m "feat: enforce catalog publication rules"
```

## Task 6: 生成并核对完整迁移基线

Files:

- Create: `data/catalog/meta.json`
- Create: `data/catalog/episodes.json`
- Create: `data/catalog/people.json`
- Create: `data/catalog/topics.json`
- Create: `data/catalog/works.json`
- Create: `data/catalog/editions.json`
- Create: `data/catalog/recommendation-evidence.json`
- Create: `data/catalog/image-assets.json`
- Create: `data/catalog/work-relations.json`
- Create: `data/catalog/provider-records.json`
- Create: `data/review/issues.json`
- Modify: `AGENTS.md`

Interfaces:

- Consumes: 完整旧 JSON 和迁移器。
- Produces: 后续页面和增强任务读取的规范化目录。

- [ ] Step 1: 运行完整迁移

Run:

```bash
npx tsx tools/migrate-legacy.ts work/bumingbai_structured.json data/catalog
```

Expected: `data/catalog/episodes.json` 有 237 条记录，
`recommendation-evidence.json` 有 423 条记录，审核队列包含所有无法确认的字段。

- [ ] Step 2: 运行完整校验并记录真实失败

Run:

```bash
npx tsx tools/validate-data.ts
```

Expected: 第一次运行可能因旧数据错误退出 1。不得放宽 schema。逐项修正迁移规则或将无法确认的数据改为 `withheld` 并写入 ReviewIssue，直到退出 0。

- [ ] Step 3: 添加基线测试

在 `tests/migration/legacy.test.ts` 添加：

```ts
it("preserves the complete legacy record counts", async () => {
  const raw = JSON.parse(
    await readFile("work/bumingbai_structured.json", "utf8"),
  ) as unknown;
  const catalog = migrateLegacy(raw, "2026-07-14T00:00:00.000Z");
  expect(catalog.episodes).toHaveLength(237);
  expect(catalog.recommendationEvidence).toHaveLength(423);
  expect(new Set(catalog.episodes.map((item) => item.id)).size).toBe(237);
});
```

- [ ] Step 4: 更新项目规则

在 `AGENTS.md` 增加数据命令和目录说明：

```markdown
- 运行 `script/ci` 验证类型、lint 和离线测试。
- 运行 `npx tsx tools/migrate-legacy.ts` 重新生成 `data/catalog/`。
- `data/catalog/` 是公开站点的规范化输入，`data/review/issues.json` 不直接公开候选事实。
```

- [ ] Step 5: 最终验证

Run:

```bash
script/ci
npx tsx tools/validate-data.ts
git diff --check
```

Expected: 全部退出 0。

- [ ] Step 6: 扫描秘密并提交基线

Run:

```bash
git add data src tools tests AGENTS.md
git diff --cached --check
git diff --cached -U0 | rg -n '^\+.*(api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*\S{8,}'
```

Expected: 秘密扫描没有匹配项。`rg` 因无匹配返回 1 是预期结果。

Commit:

```bash
git commit -m "data: add normalized podcast catalog baseline"
```

## Phase Acceptance

- `script/ci` 退出 0。
- 完整目录保留 237 期和 423 条原始推荐证据。
- 所有公开推荐都有官方来源和原始文本。
- 无来源翻译评价全部是 `unverified`。
- 所有跨实体引用和 ID 唯一性通过校验。
- 原始 `work/bumingbai_structured.json` 未被修改。
