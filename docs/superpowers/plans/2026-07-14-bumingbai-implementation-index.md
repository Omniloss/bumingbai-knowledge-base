# 不明白播客知识库实现计划索引

> For agentic workers: REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans to
> implement the linked plans in order. Steps use checkbox syntax for tracking.

Goal: 按四个独立验收阶段交付公开、低成本、证据可追溯的《不明白播客》知识库。

Architecture: 单一 Astro 与 TypeScript 仓库，先建立 Zod 数据契约，再构建静态页面，然后接入外部元数据、图片和推荐，最后启用分层同步和 Cloudflare 部署。每阶段都能独立测试和提交，后续阶段只能依赖前一阶段公开的接口。

Tech Stack: Astro、TypeScript、Zod、Vitest、Playwright、GitHub Actions、Cloudflare Workers Static Assets、Open Library、TMDB、Wikidata、Commons、Workers AI。

## Global Constraints

- 规范文件是 `docs/superpowers/specs/2026-07-14-bumingbai-knowledge-base-design.md`。
- 四份计划必须按顺序执行，不能先做页面再补证据 schema。
- 每个任务采用测试先行和语义化提交。
- 不直接推送主分支，不绕过 hooks。
- 所有外部 API 都是构建期候选来源，不是公开事实的最终权威。
- 每阶段通过自动检查和人工浏览器验收后才能进入下一阶段。

---

## Execution Order

1. [数据基础与迁移计划](./2026-07-14-bumingbai-data-foundation.md)
2. [静态网站核心计划](./2026-07-14-bumingbai-static-site.md)
3. [数据增强、图片与推荐计划](./2026-07-14-bumingbai-enrichment-images-recommendations.md)
4. [同步与公开部署计划](./2026-07-14-bumingbai-sync-deploy.md)

## Dependency Gates

| 进入阶段 | 必须满足的门槛                                                           |
| -------- | ------------------------------------------------------------------------ |
| 阶段 1   | 已批准书面规范，功能分支和隔离 worktree 已建立                           |
| 阶段 2   | Catalog schema、237 期、423 条证据和发布资格校验全部通过                 |
| 阶段 3   | 静态首页、索引、详情、搜索、桌面和移动 Playwright 全部通过               |
| 阶段 4   | 提供方缓存、A+ 图片策略、硬关系、相似理由和离线降级全部通过              |
| 正式发布 | CI、数据校验、静态构建、完整 Playwright、Wrangler dry-run 和人工预览通过 |

## Stable Interfaces Between Plans

阶段 1 提供：

```ts
CatalogSchema
Catalog
validateCatalog(catalog: Catalog): ValidationIssue[]
createStableId(prefix: string, ...parts: string[]): string
```

阶段 2 提供：

```ts
loadCatalog(): Promise<Catalog>
listPublicEpisodes(): Promise<Episode[]>
listPublicWorks(): Promise<Work[]>
getEpisodeBySlug(slug: string): Promise<Episode | undefined>
getWorkBySlug(slug: string): Promise<Work | undefined>
tokenizeForSearch(value: string): string[]
```

阶段 3 提供：

```ts
ProviderClient<T>
selectHeroImage(work: Work, candidates: ImageAsset[], generatedAt: string): ImageAsset
buildHardRelations(catalog: Catalog): WorkRelation[]
scoreSimilarity(input: SimilarityInput): SimilarityScore | undefined
enrichCatalog(catalog, clients, options): Promise<Catalog>
```

阶段 4 提供：

```ts
OfficialClient.fetchEpisodes(now: string): Promise<OfficialEpisodeSnapshot[]>
parseRecommendationCandidates(input): RecommendationCandidate[]
classifyField(field: string): "low" | "high"
parseSiteConfig(env): SiteConfig
```

## Spec Coverage Map

| 规范范围                       | 负责计划             |
| ------------------------------ | -------------------- |
| 领域模型、稳定 ID、证据和审核  | 数据基础与迁移       |
| 翻译质量来源约束               | 数据基础与迁移       |
| 双入口首页和证据优先详情       | 静态网站核心         |
| 人物、主题、搜索和筛选         | 静态网站核心         |
| 原版首图优先和图片权利策略     | 数据增强、图片与推荐 |
| 同作者硬关系和可解释相似度     | 数据增强、图片与推荐 |
| 外部 API 缓存和无凭据降级      | 数据增强、图片与推荐 |
| 每 6 小时同步和分层发布        | 同步与公开部署       |
| GitHub Actions 和 Cloudflare   | 同步与公开部署       |
| 署名、纠错、恢复和线上人工验收 | 同步与公开部署       |

## Branch and Review Model

执行前使用 `superpowers:using-git-worktrees` 创建隔离 worktree。每个阶段使用独立功能分支：

```text
feat/data-foundation
feat/static-site
feat/catalog-enrichment
feat/sync-deploy
```

每个阶段完成后运行该计划的 Phase Acceptance，进行代码审查，然后通过拉取请求合并。已合并的分支不再追加提交。任何生产部署只来自主分支通过检查后的提交。

## Completion Definition

四阶段全部完成不等于只看到绿色构建。最终必须在实际部署表面验证：

1. 新一期低风险信息可以进入受限自动拉取请求。
2. 高风险推荐留在审核队列。
3. 首页可以搜索并进入节目和作品。
4. 作品页先显示官方证据，再显示版本和关系。
5. 原版首图不可用时发生正确降级。
6. 同作者和相似作品显示不同关系类型和理由。
7. Credits、纠错链接和移动端路径可用。
8. 外部 API 关闭后，已发布站点仍然工作。
