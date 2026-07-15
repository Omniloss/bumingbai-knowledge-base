# 不明白播客资料库项目规则

- `work/bumingbai_structured.json` 是网站内容层的当前结构化数据源。
- `src/domain/schemas/catalog.ts` 中的 `CatalogSchema` 是目录数据进入 TypeScript 层的边界契约；实体和品牌化 ID schema 分别维护在 `entities.ts` 和 `primitives.ts`，读取外部目录数据时必须先解析该契约。
- `src/domain/id.ts` 统一生成稳定 ID 和 slug；已知实体前缀返回 `primitives.ts` 的品牌化 ID，任意其他前缀仍保持开放并返回普通字符串。
- `src/migration/legacy.ts` 是旧 JSON 的单一迁移入口；外部输入只在该边界解析一次，迁移时间由调用方注入，无法确认的创作者、标题或版本信息必须进入 `reviewIssues`。只有官方简介明确标注的推荐证据可以公开；书目字段还必须有已抓取推荐链接的元数据状态，否则对应版本必须暂缓公开并进入审核。
- `work/crawl_bumingbai.py` 只负责抓取官方 RSS、节目页和文字稿；`work/structure_bumingbai.py` 负责结构化与证据状态。
- 不得把节目中顺带提及的作品当作正式推荐。正式推荐以官方“嘉宾推荐”等明确栏目为准。
- 不得用作品总评分代替翻译质量评价。译本、译者或译评没有可靠来源时必须标记为未核实。
- 新增同步或推荐逻辑时保留原始来源 URL、抓取时间和核验状态，使结果可追溯。
- 重复 Work 或 Edition 合并必须原子选择数据与置信度：强证据胜出，等置信冲突按稳定键选值、暂缓发布并保留复核问题，结果不得依赖输入顺序。
- 项目采用测试先行。数据解析、增量同步、作品关联和前端关键路径都必须有对应测试。
- 项目工具链统一使用 pnpm、Bun、`biome.jsonc`、`tsc --noEmit` 和 markdownlint，测试通过 `pnpm exec vitest` 运行。
- 每次对项目结构、数据契约、脚本命令或关键限制作出有意义的修改后，同步修订本文件。
