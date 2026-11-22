# Agent Note: Motif 中继以可安装的 Profile Bundle 形式交付

Status: implemented

[English](2026-11-22-motif-relay-bundle.md) | 中文

## 问题

[中继包](../../../../packages/llm/llm-motif-relay/README.zh.md) 实现了 [Motif 简报](../../../../Motif-implementer-brief.md) 所要求的委托：一个 Edit Request 变成 Brand 文件夹里一次全新的 Claude Code 或 Codex 运行，只有它的最终回答作为助手回复返回。然而交付时它只是一个包，仅此而已。没有任何 profile 挂载它，插件管理器从不提供它，离线官方目录里没有它的条目，而它所委托的两个后端（`dsh-subagent-claude-code`、`dsh-subagent-codex`）在有人启用之前也是关闭的。因此运行应用的人看不到新路由、看不到新插件，也感受不到任何行为变化——引擎造好了，却没有一辆车装上它。

本仓库为产品可见面设定的准入规则是 Profile Bundle：一个公开包，声明 `dsh.bundle.patch`、一个图标，以及 `./locale/*.json` 显示元数据，并列在安装的按需 bundle 列表中，以便插件页面能够安装它、选中它的层，再把它关掉。中继当时一条都不满足。

## 决策

中继现在是一个 Profile Bundle。`packages/llm/llm-motif-relay/cordis.patch.yml` 插入四行宿主配置：一次性 Claude Code 提供方、一次性 Codex 提供方，以及覆盖各自之上的一条中继路由，因此启用该 bundle 后，模型选择器中会同时出现 `Claude Code (relay)` 与 `Codex (relay)`。在插件页面启用该 bundle，就是让 `Claude Code (relay)` 出现在模型选择器中的那一步；关闭则取消选中该层，选择器回到此前的路由。包新增了 `dsh.bundle.patch`、一个 `icon`、八个 `locale/<语言>.json` 词典、`files`/`exports` 中的补丁与词典文件，以及对 `@deepseek-ai/dsh-subagent-claude-code` 的依赖，使其层所挂载的提供方随它一起安装。

它留在 `ON_DEMAND_BUNDLES`，而不进入任何随附模板。因此 `packages/util/official-bundles/src/bundles.ts` 让中继在任何 profile 中保持关闭，直到有人主动要求；目录生成器也继续保证按需提供方永远不会被发行版自身安装。插件管理器把它列在 `MORE_BUNDLES` 中，紧邻它所组合的两个子代理提供方。

该层自己挂载两个提供方，而不是要求用户启用三个 bundle：一次开关就能得到两条可选路由，是最小且诚实的产品可见面；中继自身的失败分类仍会报告原生登录缺失或运行时不可用，因此只登录了其中一个代理的机器会在该路由上以可操作的错误失败，而不是静默无响应。两条路由使用不同的 `providerName`，因为该名称是 `ctx.llm` 上的注册键；每条路由只公布自己的后端作为模型，所以选择器呈现的是带标签的选择，两个方向都不存在自动后端切换。若部署只提供单一后端，按 id 删除另一对配置行即可。

## 备选方案

把中继直接挂进随附的 `web-app` 或 `base` 补丁，使其零点击即开。被否决，因为那会把第三方运行时放进每个安装的默认请求路径，并使 Claude Code 提供方成为产品的必需依赖，违背“可选提供方按需安装”的仓库规则。

按后端拆成两个 bundle。被否决，属于过早拆分：Codex 路由不过是同一包的配置行替换，复制 bundle 会让目录、词典与策略面积翻倍，只为一次配置变化。

让包保持未挂载，改为在文档中给出手写的 `cordis.patch.yml` 插入方式。被否决，因为这恰恰产生了本笔记的处境：代码正确、没有可达的产品可见面、非技术用户也无法发现它。

## 后果

中继现在通过插件页面而非手工编辑 profile 来被发现和回退。安装它会拉取两个提供方及其 Agent SDK，因此安装不再是无依赖的——这正是“真正会路由的层”的代价。在会话发出消息之前不会启动任何进程，所以空闲成本仍然为零。

`packages/llm/llm-motif-relay/tests/bundle-layer.spec.ts` 钉住了这层接线：清单声明了层、图标与词典文件；组合随附补丁得到带有 `backend: claude-code` 的两行；层挂载的每一行都是已声明的依赖；每个随附语言都有标题与描述；并且该 bundle 出现在按需列表、插件管理器与生成的离线目录中。生成的目录是重新生成而非手工编辑的，因此条目不会与包自身的元数据漂移。

中继在 `snapshots/` 中仍没有录制会话重放用例，因此随附 profile 的端到端行为由包内的 Loader 组合测试（使用替身后端）证明，而不是快照。补齐该用例仍是简报第一个接缝中尚未完成的一半。
