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
| Display minimum | `--text-display-min` | `2rem` | 窄屏主标题下限 |
| Display fluid | `--text-display-fluid` | `5vw` | 主标题随视口缩放 |
| Display maximum | `--text-display-max` | `4rem` | 桌面主标题上限 |
| Body leading | `--leading-body` | `1.6` | 正文行高 |
| Display leading | `--leading-display` | `1.1` | 主标题行高 |
| Eyebrow tracking | `--tracking-eyebrow` | `0.08em` | 眉题字距 |

不加载远程字体。衬线只负责站名和展示标题，系统无衬线负责阅读与导航，系统等宽只保留给明确的元数据用途。
展示标题使用均衡换行，避免中文单字成为孤行。固定量词、宾语和修饰短语使用 `keep-together` 行内原语保持语义完整；Task 1 覆盖“下一部”“值得读或看的作品”和“通过核验的数据”。

## 4. Spacing & Layout

基础单位为 4px。所有间距令牌都是该单位的整数倍。

| Token | Value | Usage |
| --- | --- | --- |
| `--space-1` | `0.25rem` | 4px 最小节奏 |
| `--space-2` | `0.5rem` | 8px 紧凑间距 |
| `--space-3` | `0.75rem` | 12px 跳转链接内边距 |
| `--space-4` | `1rem` | 16px 页边距、页眉间距 |
| `--space-8` | `2rem` | 32px 正文顶部间距 |
| `--space-16` | `4rem` | 64px 主区段间距 |
| `--space-hero-eyebrow-title` | `1.5rem` | 24px 眉题与主标题块间距 |
| `--space-hero-title-copy` | `1.5rem` | 24px 主标题与正文块间距 |
| `--content-max` | `72rem` | 内容最大宽度 |
| `--hero-max` | `48rem` | 首页主标题阅读宽度 |
| `breakpoint/header` | `40rem` | 页眉从横向转为纵向的文档阈值；在 `@media` 中写为字面值，不是 CSS 自定义属性 |
| `--rule-thin` | `1px` | 结构规则线，不属于间距 |
| `--focus-width` | `3px` | 可见焦点轮廓，不属于间距 |

布局规则：

- 桌面页眉和正文共享 `--content-max` 的居中轴线。
- 正文左右各保留 `--space-4` 的最小页边距。
- 首页主区段限制为 `--hero-max`，不添加卡片容器。
- `breakpoint/header` 是文档 token，不伪装成无法在普通 `@media` 查询中消费的 CSS 自定义属性。
- `40rem` 以下页眉纵向排列，内容顺序和导航顺序保持不变。
- 跳转链接默认使用离屏定位哨兵 `-9999px`。它不是布局间距，获得焦点后回到 `--space-4`。

## 5. Components

| Primitive | Structure and variant | Default | Hover | Active | Focus | Disabled | Loading | Empty | Error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `BaseLayout` | `html > body > skip-link + SiteHeader + main`; 单一亮色变体 | 暖纸背景、深墨正文、中文语言元数据 | 交由子链接处理 | 交由子链接处理 | 统一使用焦点红轮廓 | 不适用，布局不可禁用 | 不适用，无客户端加载 | 插槽可为空但保持语义外壳，不另造占位 UI | 不适用，无运行时数据边界 |
| `SiteHeader` | `header > site-name + nav`; 横向和窄屏纵向两种响应布局 | 方角、无阴影、底部细规则线 | 链接变为海军蓝并显示下划线 | 链接变为焦点红 | 链接显示 3px 焦点红轮廓 | 不适用，静态锚点不伪造 disabled | 不适用，静态导航 | 不适用，固定导航始终存在 | 不适用，无运行时数据 |
| Skip link | 正文入口锚点 | 离屏但保留在键盘顺序中 | 不单独定义 | 不单独定义 | 回到左上角，使用白纸底色和 3px 轮廓 | 不适用 | 不适用 | 不适用 | 不适用 |
| Hero | `section > eyebrow + h1 + paragraph`; 单一首页变体 | 显式清除浏览器块边距，以两个 Hero 间距 token 建立等宽眉题、系统衬线大标题和正文的 4px 网格节奏 | 不适用，非交互 | 不适用 | 不适用 | 不适用 | 不适用，内容在构建时生成 | 固定内容不会为空 | 不适用，无运行时数据 |
| `keep-together` phrase | 语义不可拆分的行内 `span`；单一排版变体 | 短语内部不换行，外部仍参与普通换行 | 不适用 | 不适用 | 不适用 | 不适用 | 不适用 | 不适用 | 不适用 |

只实现当前静态外壳确实存在的 default、hover、active 和 focus。disabled、loading、empty 和 error 保留为明确的不适用状态，不添加控件、骨架屏、空状态卡片或错误横幅。

## 6. Motion & Interaction

当前外壳不需要入场动画或客户端 JavaScript。链接的 hover、active 和 focus 反馈立即发生，不移动布局。跳转链接依靠原生键盘焦点出现。`prefers-reduced-motion: reduce` 下强制关闭平滑滚动，以保护后续页面扩展；当前页面本身不声明动画。

交互规则：

- 所有链接保留原生语义和键盘可达性。
- hover 使用颜色和下划线，不使用位移、缩放或阴影。
- active 只改变颜色，不产生布局变化。
- focus-visible 使用 `--focus-width` 和 `--focus`，轮廓偏移同为 `--focus-width`。

## 7. Depth & Surface

深度策略固定为 borders-only。

| Level | Token or treatment | Usage |
| --- | --- | --- |
| 0 | 无边框、无阴影 | 纸面正文和首页主区段 |
| 1 | `--rule-thin solid var(--line)` | 页眉与正文之间的编辑规则线 |
| Skip link | `--layer-skip-link` = `10` | 跳转链接获得焦点时置于页面内容上方 |
| Focus | `--focus-width solid var(--focus)` | 键盘焦点，不表示视觉层级 |

所有容器保持方角。禁止 `box-shadow`、渐变、圆角卡片、模糊、发光和模拟浮层；信息层级只由字体、留白和规则线建立。
