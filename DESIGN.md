# 不明白知识库设计系统

## 1. Atmosphere & Identity

这是一个纸张质感的编辑档案，而不是卡片式产品后台。暖米色纸面承载深墨文字，海军蓝和细线只负责组织信息，系统衬线标题与等宽眉题形成印刷刊物般的层级。标志性画面是方角页眉下的一条细规则线，以及留有克制空白的大号中文衬线标题。方向取自 `minimalist-skill.md` 的克制层级和 `wired.md` 的墨在纸上、方角、排版分工与纯边框深度，但不使用 WIRED 的品牌、专有字体、标志或文案。

## 2. Color

只提供亮色主题。颜色沿用项目批准的暖纸、深墨、静音灰、海军蓝、规则线和焦点红，不增加装饰色。

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| Paper | `--paper` | `#f6f1e8` | 页面背景 |
| Raised paper | `--paper-raised` | `#ffffff` | 跳转链接获得焦点时的可读底色 |
| Primary ink | `--ink` | `#1f2933` | 正文、标题和默认链接 |
| Muted ink | `--muted` | `#625f59` | 眉题和次要说明 |
| Editorial navy | `--navy` | `#25364a` | 链接悬停和编辑强调 |
| Hairline | `--line` | `#c9c0b2` | 页眉底部规则线 |
| Focus and press | `--focus` | `#b6402c` | 键盘焦点和按下反馈 |

规则：

- 页面不使用渐变、阴影、发光、透明玻璃或大面积品牌色。
- `--focus` 只用于交互反馈，不作为装饰。
- 禁用、加载、空和错误色在当前静态外壳中不适用，因此不预设虚构色值。

## 3. Typography

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| UI and body | `--font-sans` | `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | 正文、导航和界面文字 |
| Editorial display | `--font-serif` | `ui-serif, Georgia, serif` | 站名和主标题 |
| Metadata | `--font-mono` | `ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace` | 首页眉题和后续资料元数据 |
| Site name weight | `--weight-site-name` | `700` | 页眉站名字重 |
| Body | `--text-body` | `1rem` | 默认正文和导航 |
| Small metadata | `--text-small` | `0.875rem` | 状态、日期和筛选结果数 |
| Card title | `--text-card-title` | `1.25rem` | 节目与作品卡片标题 |
| Section minimum | `--text-section-min` | `1.75rem` | 窄屏区段标题下限 |
| Section fluid | `--text-section-fluid` | `3vw` | 区段标题随视口缩放 |
| Section maximum | `--text-section-max` | `2.5rem` | 桌面区段标题上限 |
| Display minimum | `--text-display-min` | `2rem` | 窄屏主标题下限 |
| Display fluid | `--text-display-fluid` | `5vw` | 主标题随视口缩放 |
| Display maximum | `--text-display-max` | `4rem` | 桌面主标题上限 |
| Body leading | `--leading-body` | `1.6` | 正文行高 |
| Display leading | `--leading-display` | `1.1` | 主标题行高 |
| Tight leading | `--leading-tight` | `1.3` | 卡片与区段标题行高 |
| Eyebrow tracking | `--tracking-eyebrow` | `0.08em` | 眉题字距 |

不加载远程字体。衬线只负责站名和展示标题，系统无衬线负责阅读与导航，系统等宽只保留给明确的元数据用途。
展示标题使用均衡换行并优先在标点和空白边界换行，只有整段确实超宽时才允许字内回退，避免中文姓名或单字被拆开成为孤行。固定量词、宾语和修饰短语使用 `keep-together` 行内原语保持语义完整；Task 1 覆盖“下一部”“值得读或看的作品”和“通过核验的数据”。详情 h1 与证据节目标题使用同一策略；375px 下已确认的中文姓名必须保持在同一行。

## 4. Spacing & Layout

基础单位为 4px。所有间距令牌都是该单位的整数倍。

| Token | Value | Usage |
| --- | --- | --- |
| `--space-1` | `0.25rem` | 4px 最小节奏 |
| `--space-2` | `0.5rem` | 8px 紧凑间距 |
| `--space-3` | `0.75rem` | 12px 跳转链接内边距 |
| `--space-4` | `1rem` | 16px 页边距、页眉间距 |
| `--space-6` | `1.5rem` | 24px 控件组和卡片内节奏 |
| `--space-8` | `2rem` | 32px 正文顶部间距 |
| `--space-12` | `3rem` | 48px 相邻资料区段间距 |
| `--space-16` | `4rem` | 64px 主区段间距 |
| `--space-hero-eyebrow-title` | `1.5rem` | 24px 眉题与主标题块间距 |
| `--space-hero-title-copy` | `1.5rem` | 24px 主标题与正文块间距 |
| `--content-max` | `72rem` | 内容最大宽度 |
| `--hero-max` | `48rem` | 首页主标题阅读宽度 |
| `--card-min` | `16rem` | 自动换列卡片的最小宽度 |
| `--cover-aspect` | `2 / 3` | 无可公开图片时的本地排版封面比例 |
| `--control-min` | `2.75rem` | 链接按钮和表单控件的 44px 最小触达高度 |
| `breakpoint/header` | `40rem` | 页眉从横向转为纵向的文档阈值；在 `@media` 中写为字面值，不是 CSS 自定义属性 |
| `--rule-thin` | `1px` | 结构规则线，不属于间距 |
| `--focus-width` | `3px` | 可见焦点轮廓，不属于间距 |

布局规则：

- 桌面页眉和正文共享 `--content-max` 的居中轴线。
- 正文左右各保留 `--space-4` 的最小页边距。
- 首页主区段限制为 `--hero-max`，不添加卡片容器。
- `breakpoint/header` 是文档 token，不伪装成无法在普通 `@media` 查询中消费的 CSS 自定义属性。
- `40rem` 以下页眉纵向排列，内容顺序和导航顺序保持不变。
- 资料网格使用 `--card-min` 自动换列；窄屏退为单列，卡片不设固定高度。
- 详情头部使用 `--card-min` 作为封面列下限并自动换列；本地排版封面保持 `--cover-aspect`，不冒充真实封面图。
- 筛选控件和首页入口允许自然换行；`40rem` 以下筛选控件纵向排列并占满可用宽度。
- 跳转链接默认使用离屏定位哨兵 `-9999px`。它不是布局间距，获得焦点后回到 `--space-4`。

## 5. Components

| Primitive | Structure and variant | Default | Hover | Active | Focus | Disabled | Loading | Empty | Error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `BaseLayout` | `html > body > skip-link + SiteHeader + main`; 单一亮色变体 | 暖纸背景、深墨正文、中文语言元数据 | 交由子链接处理 | 交由子链接处理 | 统一使用焦点红轮廓 | 不适用，布局不可禁用 | 不适用，无客户端加载 | 插槽可为空但保持语义外壳，不另造占位 UI | 不适用，无运行时数据边界 |
| `SiteHeader` | `header > site-name + nav`; 横向和窄屏纵向两种响应布局 | 方角、无阴影、底部细规则线 | 链接变为海军蓝并显示下划线 | 链接变为焦点红 | 链接显示 3px 焦点红轮廓 | 不适用，静态锚点不伪造 disabled | 不适用，静态导航 | 不适用，固定导航始终存在 | 不适用，无运行时数据 |
| Skip link | 正文入口锚点 | 离屏但保留在键盘顺序中 | 不单独定义 | 不单独定义 | 回到左上角，使用白纸底色和 3px 轮廓 | 不适用 | 不适用 | 不适用 | 不适用 |
| Hero | `section > eyebrow + h1 + paragraph`; 单一首页变体 | 显式清除浏览器块边距，以两个 Hero 间距 token 建立等宽眉题、系统衬线大标题和正文的 4px 网格节奏 | 不适用，非交互 | 不适用 | 不适用 | 不适用 | 不适用，内容在构建时生成 | 固定内容不会为空 | 不适用，无运行时数据 |
| `keep-together` phrase | 语义不可拆分的行内 `span`；单一排版变体 | 短语内部不换行，外部仍参与普通换行 | 不适用 | 不适用 | 不适用 | 不适用 | 不适用 | 不适用 | 不适用 |
| Editorial button link | 方角锚点；主按钮为海军蓝实底，次按钮为纸面底 | 保持原生链接语义和不小于 44px 的触达高度 | 主按钮反转为深墨，次按钮显示海军蓝文字与下划线 | 使用焦点红边框和文字 | 3px 焦点红轮廓 | 不适用，入口始终可用 | 不适用，静态链接 | 不适用 | 不适用 |
| Section header | `header > eyebrow + h2 + copy`；首页和索引页共用排版原语 | 方角、无容器底色，以留白和下方规则线建立层级 | 不适用 | 不适用 | 不适用 | 不适用 | 不适用 | 文案固定，不为空 | 不适用 |
| Record grid | 自动换列的文章集合；首页近期区块和索引页共用 | 使用 `--card-min`，列与行均遵循 4px 网格 | 交由卡片链接处理 | 交由卡片链接处理 | 交由卡片链接处理 | 不适用 | 构建时生成，不显示骨架 | 集合为空时由 Empty state 接管 | 不适用 |
| Episode record | `article > eyebrow + h2 + metadata`；紧凑和完整两种内容密度 | 顶部细规则线、方角、无阴影；标题链接使用稳定 slug 和尾斜杠 | 标题链接变为海军蓝并显示下划线 | 标题链接变为焦点红 | 标题链接显示统一焦点轮廓 | 不适用 | 不适用，内容在构建时生成 | 首页和索引仅渲染可公开节目，不生成候选卡 | 不适用 |
| `StatusBadge` | 文本状态标签，覆盖 verified、partially_verified、pending_verification、rejected | 方角、细边框、等宽小号字；中文状态始终可见，颜色不是唯一线索 | 不适用，非交互 | 不适用 | 不适用 | 不适用 | 不适用 | 状态为 schema 必填项，不为空 | 不适用 |
| `WorkCard` | `article > media eyebrow + h2 + optional original title + StatusBadge` | 顶部细规则线、方角、无阴影；媒介与核验枚举显示中文，链接使用稳定 slug 和尾斜杠 | 标题链接变为海军蓝并显示下划线 | 标题链接变为焦点红 | 标题链接显示统一焦点轮廓 | 不适用 | 不适用，内容在构建时生成 | 仅接收可公开作品，不生成候选卡 | 不适用 |
| Detail header | `section[data-section-order="0"] > typographic cover + metadata + h1`；书籍和非书共用 | 自动换列、单一 h1、原题与状态只显示公开 schema 事实；书籍可显示作者，非书创作者事实留在第 2 区避免重复 | 交由内部链接处理 | 交由内部链接处理 | 交由内部链接处理 | 不适用 | 构建时生成 | 缺图时使用排版封面并明确写“暂无已核验图片” | 不适用 |
| Typographic cover | `div[role="img"] > media label + title + empty copy`；本地占位变体 | `--cover-aspect`、海军蓝细边框、纸面底色，不生成或伪造封面图 | 不适用 | 不适用 | 不适用 | 不适用 | 不适用 | 明确说明暂无已核验图片 | 不适用 |
| Detail section | `section[data-section-order] > header + content`；作品页固定 0 至 5，节目页按资料语义排列 | 以顶部细规则线和 `--space-12` 分隔；h2 开始区段，组标题使用 h3 | 交由子链接处理 | 交由子链接处理 | 交由子链接处理 | 不适用 | 构建时生成 | 使用 Detail empty state，不移除区段 | 不适用 |
| `EvidencePanel` | `article > StatusBadge + episode link + official quote + source action` | 方角、顶部细规则线；官方原文使用 `blockquote`，只接收可发布证据和公开节目连接；来源仅在 HTTPS 校验通过时成为链接 | 两个安全链接使用海军蓝和下划线 | 两个安全链接使用焦点红 | 两个安全链接使用统一焦点轮廓 | 不适用 | 构建时生成 | 无合格证据时由父 Detail section 显示空态；非 HTTPS 来源显示不可点击的安全提示 | 不适用 |
| Episode recommendation group | `section > h3 + recommendation records`；确认推荐人或中性“推荐记录”变体 | 每条保留官方原文，并以 `WorkCard` 链接公开作品；候选记录不进入 DOM | 交由作品链接处理 | 交由作品链接处理 | 交由作品链接处理 | 不适用 | 构建时生成 | 无公开推荐时显示通用空态；存在非公开证据时只显示通用核验通知 | 不适用 |
| Edition record | `article > h3 + fact list + translation assessment`；仅书籍，第 2 区标题为“版本信息” | 只显示公开 Edition 的译者、出版社、ISBN、出版信息；翻译评价单列 h4，并以前间距和细规则线与版本事实分开 | 来源链接使用海军蓝和下划线 | 来源链接使用焦点红 | 来源链接使用统一焦点轮廓 | 不适用 | 构建时生成 | 无公开版本时明确写“暂无已核验版本信息” | 不适用 |
| Non-book facts | `fact list`；电影、纪录片、电视、播客和其他媒介，第 2 区标题为“作品资料” | 只显示公开 Person 创作者或导演、原题、年份和地区；不生成译者、出版社、ISBN 或翻译质量结构，不在头部重复创作者 | 不适用 | 不适用 | 不适用 | 不适用 | 构建时生成 | 无已核验事实时明确说明，不补造创作者或发行信息 | 不适用 |
| Relation record | `article > h3 + kind + reasons`；硬关系和 similar 分区 | 只连接公开目标作品并显示存储的类型与理由；两类关系不混排 | 标题链接使用海军蓝和下划线 | 标题链接使用焦点红 | 标题链接使用统一焦点轮廓 | 不适用 | 构建时生成 | 两个区段分别显示“暂无已核验关联作品”和“暂无已核验相似作品” | 不适用 |
| Source list | `ul > source actions`；数据与图片来源合并去重 | 只列 schema 中已有 URL；仅 HTTPS 来源成为外链并使用安全 rel，其他协议显示不可点击的安全提示 | 安全链接使用海军蓝和下划线 | 安全链接使用焦点红 | 安全链接使用统一焦点轮廓 | 不适用 | 构建时生成 | 无来源时明确写“暂无可公开来源”；非 HTTPS 来源不提供跳转 | 不适用 |
| Detail empty state | 单段状态说明，无恢复按钮 | 静音文字、上下不加容器底色；文案必须指明缺少哪类“已核验”记录 | 不适用 | 不适用 | 不适用 | 不适用 | 不适用 | 默认职责 | 不适用 |
| Filter bar | 原生 GET form，两个有标签的 select、结果计数和 reset | 纸面控件、方角细边框；查询参数固定为 `media` 和 `status` | select 和按钮边框变为海军蓝 | reset 使用焦点红反馈 | 控件显示统一焦点轮廓，键盘顺序为媒介、状态、重置 | 不适用，筛选条件都可选 | 不适用，操作同步完成 | 无匹配结果时显示 Empty state，完整列表仍保留在 DOM | 无运行时请求，不定义错误态 |
| Empty state | `p + 清除筛选 button`，由筛选结果驱动 | 方角、上下规则线、明确恢复动作；默认隐藏 | 清除按钮使用按钮 hover 规则 | 清除按钮使用焦点红反馈 | 清除按钮显示统一焦点轮廓 | 无筛选时隐藏，不伪造 disabled | 不适用 | 无匹配时显示“没有符合当前筛选条件的作品” | 不适用 |

只实现静态目录确实存在的 default、hover、active、focus 和筛选 empty。页面在构建时读取目录，不添加 loading 或 error 横幅；原生链接和筛选控件没有虚构的 disabled 状态。

## 6. Motion & Interaction

页面不使用入场动画。链接和控件的 hover、active 与 focus 反馈立即发生，不移动布局。作品筛选只用一个框架无关的客户端脚本切换现有卡片的 `hidden` 状态，并以 `history.replaceState` 同步查询参数，不请求运行时数据。跳转链接依靠原生键盘焦点出现。`prefers-reduced-motion: reduce` 下强制关闭平滑滚动；当前页面本身不声明动画。

交互规则：

- 所有链接保留原生语义和键盘可达性。
- 所有详情外链使用 `rel="external noreferrer"`；站内节目和作品链接使用稳定 slug 与尾斜杠。
- hover 使用颜色和下划线，不使用位移、缩放或阴影。
- active 只改变颜色，不产生布局变化。
- focus-visible 使用 `--focus-width` 和 `--focus`，轮廓偏移同为 `--focus-width`。
- 原生 GET 表单保证控件语义；无 JavaScript 时不隐藏任何作品，目录仍可完整阅读。
- reset 和空状态清除动作恢复全量卡片、清空两个控件并移除 URL 查询参数。

## 7. Depth & Surface

深度策略固定为 borders-only。

| Level | Token or treatment | Usage |
| --- | --- | --- |
| 0 | 无边框、无阴影 | 纸面正文和首页主区段 |
| 1 | `--rule-thin solid var(--line)` | 页眉与正文之间的编辑规则线 |
| 1 | `--rule-thin solid var(--line)` | 卡片、筛选区和空状态的编辑分隔线 |
| 1 | `--rule-thin solid var(--line)` | 详情区段、证据、版本、关系与来源记录的编辑分隔线 |
| 1 | `--rule-thin solid var(--navy)` | 本地排版封面轮廓；不表示真实图片存在 |
| Skip link | `--layer-skip-link` = `10` | 跳转链接获得焦点时置于页面内容上方 |
| Focus | `--focus-width solid var(--focus)` | 键盘焦点，不表示视觉层级 |

所有容器保持方角。禁止 `box-shadow`、渐变、圆角卡片、模糊、发光和模拟浮层；信息层级只由字体、留白和规则线建立。
