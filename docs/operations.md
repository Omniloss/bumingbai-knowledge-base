# 不明白知识库运行手册

本手册处理同步、外部服务、自动拉取请求和 Cloudflare 部署故障。任何恢复操作都必须保留当前线上版本，禁止用不完整数据覆盖已发布目录。

## 首次公开部署准备

在 GitHub 仓库启用 Actions 和 pull request auto-merge，并设置以下 Actions Variables：

- `PUBLIC_SITE_URL`：最终公开站点的 HTTPS 根地址。
- `PUBLIC_REPOSITORY_URL`：公开 GitHub 仓库的 HTTPS 根地址。

设置以下 Actions Secrets，不要把值写入仓库、Issue、日志或聊天：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Cloudflare API Token 只授予目标账号和目标 Worker 所需的编辑权限。准备完成后先验证配置，不执行真实发布：

```bash
pnpm exec wrangler deploy --dry-run
```

## 同步失败

1. 在 GitHub Actions 找到失败的 `Sync official podcast data` 运行，记录 run ID。
2. 下载并保存失败日志：

```bash
gh run view <run-id> --log > sync-run.log
```

1. 在干净工作树使用同一依赖版本重现：

```bash
pnpm install --frozen-lockfile
script/sync
```

1. 检查 `data/review/sync-candidates.json` 和同步产生的高风险变更，不得把未核验推荐移动到公开目录。
2. 根因修复并通过 `script/ci` 前，不重跑合并或部署。

日志只能用于诊断，不得发布 API token、完整环境变量或其他秘密。

## 外部 API 故障

先确认最近的 `.cache/providers/` 未被删除或清空，再执行离线候选构建：

```bash
test -d .cache/providers
bun run tools/enrich-catalog.ts --offline
bun run tools/validate-data.ts
script/build
```

如果缓存不存在或 schema 校验失败，停止本次富化更新。保留已有公开目录和线上部署，不用空结果覆盖旧数据。

## 关闭错误的自动拉取请求

错误的自动同步 PR 不得合并。先检查 PR 目标分支和文件范围，然后关闭：

```bash
gh pr view <number>
gh pr close <number> --comment "同步结果有误，关闭并等待重新核验。"
```

关闭后修复同步逻辑或数据来源，再从默认分支重新运行工作流。不要在错误 PR 上启用 auto-merge。

## 回滚错误部署

先查看最近部署及版本：

```bash
pnpm exec wrangler deployments list
```

核对并复制上一个已知正常版本的 ID，然后明确回滚到该版本：

```bash
pnpm exec wrangler rollback <version-id>
```

只有在确定紧邻的上一个上传版本就是正常版本时，才使用默认回滚：

```bash
pnpm exec wrangler rollback
```

回滚完成后打开首页、一个节目页、一个作品页、致谢页和纠错入口做烟雾检查。不要先修改数据来掩盖部署故障。

## 高风险候选核验顺序

严格按以下顺序核验，每一步都保留来源 URL、抓取时间和判断结果：

1. 来源：确认是官方节目页、官方文字稿或服务的官方实体页。
2. 标题：核对中文名、原名、常见译名和同名歧义。
3. 创作者：核对作者、导演、译者及其角色，禁止只凭姓名相同合并人物。
4. 版本：核对 ISBN、出版社、年份、地区、译者和删节状态。
5. 图片许可：核对原始文件页、作者、许可证、署名文本和是否允许目标用途。

任一步无法确认时保留在审核队列，不公开候选事实。

## TMDB 与商业用途

当前 TMDB 集成只适用于批准的非商业方案。网站准备商业化前：

1. 停用 TMDB 自动同步和海报候选更新。
2. 保留已有公开目录，不继续请求新的 TMDB 数据。
3. 重新核对当时有效的 TMDB API 条款、署名要求和商业许可。
4. 获得适用许可或切换到允许商业使用的来源后，才重新启用同步。
