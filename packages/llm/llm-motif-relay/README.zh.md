---
description: "Motif 中继模型路由：把 Motif 会话中的 Edit Request 交给在 Brand 文件夹中运行的 Claude Code 或 Codex 命令行代理执行。"
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-motif-relay

[English](README.md) | 中文

## 概述

当一个 Motif 会话应由命令行代理而不是托管模型驱动时，挂载这条模型路由：用户的 Edit Request 会在 Brand 文件夹中变成一次全新的 Claude Code 或 Codex 运行，只有该运行的最终答案会作为助手回复回到同一段对话。它组合既有的 `dsh-subagent-claude-code` 与 `dsh-subagent-codex` 提供方，因此原生设置、身份验证与权限模式完全由提供方实例的配置决定。路由会公布各提供方实例固定使用的原生模型，由会话显式选择其中一个；每次发送都是全新且无人值守的，不流式传输进度，只展示四种粗略状态，绝不会自动切换到另一个后端或模型。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

当 Brand 文件夹应由原生命令行代理编辑时，在 profile 中启用此路由。该路由不新增任何工具、不需要本地 MCP 服务器，并且在会话发送消息之前不会启动任何进程。用户选择模型；会话的工作目录就是 Brand 文件夹，其余选项来自本配置与被选中的子代理提供方实例。

### 安装 Bundle

在 Web 或桌面端的“插件”页面启用 **Motif 中继**。它的 bundle 层会挂载四个 Claude Code 提供方实例（原生默认、Sonnet、Opus、Haiku）、一个 Codex 提供方，以及覆盖每个后端的中继路由，因此模型选择器里会出现 `Claude Code (relay)` 与 `Codex (relay)` 条目，而 Claude 路由会列出 Sonnet、Opus 与 Haiku。选中某个模型后，每个 Edit Request 就经由该路由与该提供方实例发送。该路由不新增工具、不需要本地 MCP 服务器，并且在会话发出消息之前不会启动任何原生进程。用户选择模型；会话的工作目录就是 Brand 文件夹。

官方条目离线可见。启用时会通过常规 bundle 安装器安装本包及其 `@deepseek-ai/dsh-subagent-claude-code` 与 `@deepseek-ai/dsh-subagent-codex` 提供方，然后选中其 profile 层；关闭只取消选中该层，包仍保留。请以运行宿主机的操作系统用户登录一次：Claude Code 路由执行 `claude login`，Codex 路由执行 `codex login`——两个固定运行时各自复用对应的原生登录，中继本身不新增任何账号。只登录了其中一个的机器仍会显示两条路由，未登录的那条会以各自的指引失败。

### 配置

导入的层插入七行：四个 `@deepseek-ai/dsh-subagent-claude-code` 提供方实例（原生默认、`sonnet`、`opus`、`haiku`）、一个 `@deepseek-ai/dsh-subagent-codex` 提供方，以及每个后端一行 `@deepseek-ai/dsh-llm-motif-relay`。两条路由必须使用不同的 `providerName`，因为该名称是 `ctx.llm` 上的注册键；本层分别使用 `motif-relay-claude-code` 与 `motif-relay-codex`。每个 `models` 条目都指定执行它的提供方实例，路由把该名称传给 `startActivation`；这样静态固定模型的后端也能获得真实的模型选择。若部署只提供其中一个后端，请在自己的 profile 补丁中按 id 删除另一提供方行与其路由行。

```yaml
- name: '@deepseek-ai/dsh-subagent-claude-code'
  config:
    model: sonnet
- name: '@deepseek-ai/dsh-llm-motif-relay'
  config:
    backend: claude-code
    model: sonnet
    models:
      - id: sonnet
        provider: motif-relay-claude-sonnet
        name: Claude Sonnet
        backend: claude-code
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `providerName` | `motif-relay` | `ctx.llm` 上的模型路由名称；会话选择该提供方 |
| `backend` | `claude-code` | 省略 `models` 时执行发送的已注册子代理后端（同级为 `codex`） |
| `model` | 首个模型 | 请求未指定时选用的模型 id，必须出现在 `models` 中 |
| `models` | 由 `backend` 组成的单个模型 | 本路由提供的模型列表。每项为 `{ id, provider, name, description?, backend? }`；`provider` 必须是已注册的子代理提供方实例 |
| `displayName` | 后端名称 | 路由在选择器中的名称 |
| `brandFile` | `brand.md` | 相对于 Brand 文件夹的 Brand 定义文件 |
| `timelineDir` | `timeline` | 相对于 Brand 文件夹的 timeline 目录 |
| `timelineExtensions` | `['.md', '.json']` | 带入任务的 timeline 文件扩展名 |
| `maxTimelineFiles` | `20` | 单个任务按文件名顺序带入的 timeline 文件数 |
| `maxTimelineBytes` | `64000` | 单个任务带入的 timeline 文本字节数 |
| `conversationMessages` | `6` | 带入任务的较早消息数 |
| `conversationChars` | `4000` | 带入任务的较早对话字符数 |
| `timeoutMs` | `900000` | 单次发送的截止时间，超时后释放子进程 |
| `signInCheck` | `auto` | `auto` 探测原生凭据文件；`skip` 假定宿主看不到的登录已存在 |

固定权限模式与环境是有意为之：它们属于子代理提供方配置行，本包不会按调用覆盖。模型选择不同：部署声明提供方实例，路由公布它们，请求可按 id 选择一个。由于每个提供方实例固定自己的原生模型，列表是真实可用的。挂载两条指向不同后端的路由，就为用户提供了可见的后端与模型选择；任何情况下都不会自动切换。

### 身份验证

两个固定运行时都使用与已安装命令行工具相同的原生登录，路由本身不新增任何账号：

- **Claude Code** 使用宿主机的 `HOME` 与 `CLAUDE_CONFIG_DIR` 运行 Bundle 固定的 CLI，因此同一操作系统用户执行的 `claude login` 会被复用。凭据形式的环境变量不会传给子进程，所以 `ANTHROPIC_API_KEY` 或 `ANTHROPIC_AUTH_TOKEN` 登录方式不会被继承；部署使用密钥认证时，请通过提供方配置行的 `env` 提供。
- **Codex** 使用宿主机的 `HOME` 与 `CODEX_HOME` 运行 Bundle 的 `codex app-server`，因此会复用 `codex login` 写入的 `~/.codex/auth.json`。`OPENAI_API_KEY` 同样会被清除，必须通过提供方配置行的 `env` 提供。
- 不同的操作系统用户、容器或主目录拥有不同的登录状态：请为该身份执行一次 `claude login` 或 `codex login`。两个提供方都无法代替用户完成机器上的登录。

在启动运行之前，路由会在可观测该文件的平台上检查原生凭据文件。若部署通过提供方配置行的 `env` 提供凭据，请设置 `signInCheck: skip`，因为该登录对宿主自身环境不可见。文件缺失时，它以登录指引失败，而不是启动一个必然失败的进程。macOS 钥匙串会隐藏 Claude Code 的登录状态，因此那里的检查结果为“未知”，失败会以运行时启动失败的形式出现。

### 你会得到什么

一条用户消息产生一次子进程运行和一条助手消息。子进程会收到 Edit Request、Brand 定义、发送时从磁盘读取的 timeline，以及较早对话的摘要。Edit Request 只包含用户自己写的文本：主循环在其旁注入的运行时提示（工作目录、沙盒策略等）不会被转交。推理过程、工具流量、stderr、用量和工作区差异都不会进入会话。会话日志记录请求、答案和普通轮次事件，因此回复在重新加载后仍然存在。

辅助模型调用（会话标题、压缩摘要以及其他已声明用途）会以 `INVALID_REQUEST` 被拒绝，而不会启动命令行运行，因此只有对话消息会到达后端。

### 状态与失败

由于没有进度流，状态是粗略的。宿主界面可以监听 `motif-relay/status` 的 `started`、`working`、`finished` 与 `failed`。被取消的发送停在 `working`，取消由轮次本身报告。该事件是宿主机本地的，携带会话、后端与状态；在浏览器界面中呈现由该界面负责，因此本包不新增客户端组件。

| 失败 | 报告的处理方式 |
|---|---|
| 未登录 | 以同一用户运行 `claude login` / `codex login`，然后重新发送 |
| 达到限额 | 等待限额重置后重新发送 |
| 运行时不可用 | 检查后端 bundle 是否已安装并已登录，然后重试 |
| 超时 | 检查 Brand 文件夹中的部分改动，然后发送更小的请求 |
| 取消 | 不切换后端；轮次本身报告取消 |

失败携带与提供方无关的 LLM 代码（`AUTH`、`QUOTA`、`HTTP_503`、`HTTP_504`、`ABORTED`、`EMPTY_RESPONSE`），界面按代码而不是按文字分流。对话当然可以选择与本路由并列配置的 DeepSeek API 密钥路由；那是用户可见的选择，绝不是自动回退。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

该路由就是一个普通的 `LlmAdapter`：轮次、请求日志、取消与助手消息仍由 agent loop 拥有，因此不涉及任何会话事件、投影或主循环的改动。

### 设计要点

- **每次发送都是全新运行。** 每个请求都会以调用方投递方式启动一次配置后端的激活；没有续跑、恢复或连接池。
- **磁盘是唯一事实来源。** Brand 定义与 timeline 文件在每次发送时读取，因此在 Brand 文件夹中的手工修改会进入下一次任务文本。
- **单一文本任务。** 子进程只收到组合后的任务；工具、附件与会话历史都不会跨越边界。

### 源码导览

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：配置模式、宿主接线、状态事件 |
| [`src/adapter.ts`](src/adapter.ts) | 模型路由：任务组合、激活生命周期、答案分片 |
| [`src/task.ts`](src/task.ts) | 纯函数任务文本构造 |
| [`src/conversation.ts`](src/conversation.ts) | Edit Request 选择与较早对话摘要 |
| [`src/brand.ts`](src/brand.ts) | Brand 定义与 timeline 读取 |
| [`src/failure.ts`](src/failure.ts) | 登录探测与失败分类 |
| [`src/status.ts`](src/status.ts) | 粗略状态与状态事件载荷 |

### 运行流程

适配器根据请求的 `sessionId` 解析在线 Agent，取出最后一条用户文本作为 Edit Request，摘要较早消息，读取 Brand 文件夹并构造一个任务。它发布 `started`，以请求的取消信号启动调用方投递激活，发布 `working`，并让激活结果与取消、截止时间竞速。完成且非空白的答案会发布 `finished` 并作为一个文本块流式输出；除取消外的其他结果都会发布 `failed` 并抛出已分类的 `LlmError`，由 LLM 运行时转换为终止错误。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [Claude Code 提供方](../../subagent/subagent-claude-code/README.zh.md) —— 固定运行时、原生设置，以及本路由分类的安全失败事实。
- [Codex 提供方](../../subagent/subagent-codex/README.zh.md) —— 基于 app-server 协议的同级后端。
- [子代理服务](../../subagent/subagent/README.zh.md) —— 激活、取消与结果约定。
- [LLM 服务](../llm/README.zh.md) —— 适配器约定与失败代码。

-----

<a id="model-experience"></a>
## 模型体验

### 父请求

#### 模型看到什么

父模型不会被调用：本路由取代了模型调用，自己生成助手文本。组合后的任务是仅面向模型的文本，指明 Brand、timeline 文件、较早对话与 Edit Request。

#### 令牌影响

父方把组合任务作为子进程输入付费。任务受 `maxTimelineBytes` 与 `conversationChars` 限制；子进程输出作为答案文本返回。

#### KV 缓存影响

本路由不存在父方缓存。子方复用仅取决于命令行代理自身的模型、指令与全新运行。

### 子请求（间接）

#### 模型看到什么

子进程只看到一段合并后的任务文本，并在 Brand 文件夹中工作。它看不到会话事件、工具模式或宿主的模型选择。

#### 令牌影响

子进程为自己的上下文付费。用量不会报告给父会话。

#### KV 缓存影响

与父方无关。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **没有续跑** —— 每次发送都是全新运行；连续性只来自组合的对话摘要。
- **没有进度流** —— 推理与工具活动不可见，界面只展示四种粗略状态。
- **模型列表由部署决定** —— 路由只提供 profile 挂载的提供方实例，无法自动发现原生模型。要增加选项，请新增一个带 `model` 的提供方行并添加对应的 `models` 条目。权限模式与环境仍由配置决定。
- **没有副作用回滚** —— 超时或取消会保留子进程已改动的文件。
- **没有本地 MCP 服务器** —— 子进程只使用自身的原生工具与配置。
- **timeline 预算静默生效** —— 超出字节或文件数预算的文件不会进入任务；本 README 说明预算，而不是在每次发送时报告遗漏。
- **没有浏览器状态组件** —— 本包发布 `motif-relay/status`，但不提供客户端渲染；需要展示中继进度的界面必须订阅该事件。
- **没有辅助调用** —— 标题与摘要会被拒绝而不是转交，因此中继会话在另一个提供方生成之前保持中性标题。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作背景——点击展开</summary>

- 组合测试用替身后端和真实会话启动随附的 headless profile，因此无需密钥或原生进程即可证明路由的端到端行为。
- 真实运行需要人类在真实机器上持有 Claude 或 ChatGPT 订阅；单元与组合测试无法证明原生登录或原生工具行为。

</details>
