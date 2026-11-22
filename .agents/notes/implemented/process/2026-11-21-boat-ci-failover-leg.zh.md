# Agent Note: Boat 作为 CI 池的故障切换支路

Status: implemented

[English](2026-11-21-boat-ci-failover-leg.md) | 中文

## 问题

[故障切换手册](2026-07-26-ci-failover-runbook.zh.md) 通过两个目标让每个必需的 Linux 检查保持可合并：公司自有的 `vm-backup` 池，以及经 [Blacksmith 支路](2026-09-09-blacksmith-failover-leg.zh.md) 提供的 Blacksmith 托管运行器。自有池是容量有界的备胎，Blacksmith 是第二个商业池；两者都不提供“每个作业独享一台 Linux 机器、作业结束即销毁”的能力，因此耗时或吃内存的 lane 会为闲置容量持续付费，并与兄弟作业共享同一台主机。

Boat（boat.dev）通过已安装的 `boat` CI GitHub App，让每个 GitHub Actions 作业运行在自己的 Linux x86_64 虚拟机上：2–16 vCPU 档位、`/dev/kvm`、Docker、`services:`、`container:`、`actions/cache`、`actions/upload-artifact` 以及 GitHub Actions secrets 都可用。沙箱按秒计费，作业结束即删除，且不携带 Boat 账号自身的任何环境。它的迁移建议是整体替换仓库的 `runs-on` 标签，那会把基准测量、工作流契约测试、持有凭据的作业以及每一次默认运行都放到第三方基础设施上，而且没有决策记录。

## 决策

`DSH_CI_FAILOVER_LINUX` 额外接受取值 `boat`。任何仓库写者设置它时，参与切换的 Linux 作业按各自固定的档位重定向到 Boat CI 沙箱；其它任何取值（包括未设置）保持今天的托管或池路由。与 `selfhosted`、`blacksmith` 一样，这是写者可管理的仓库状态——无需合并、无需改 PR，重跑受影响的作业即可——并且只在设置期间产生费用，因此它是明确的故障或实验选择，而不是默认。

参与切换的作业与档位（[ci.yml](../../../../.github/workflows/ci.yml)）：`publisher-isolated` 的 linux 矩阵支路使用 `boat`；`node 24 / static`、`node 24 / lint`、`node 24 / benchmarks` 使用 `boat-large`；`node 24 / coverage`、`node 24 / snapshots and artifacts` 使用 `boat-xlarge`；`node-compat` 矩阵使用 `boat`；`all checks passed` 判定作业使用 `boat`。[ci-python.yml](../../../../.github/workflows/ci-python.yml) 的 `python checks passed` 判定与 [ci-windows.yml](../../../../.github/workflows/ci-windows.yml) 的 `windows checks passed` 判定跟随同一个开关落到 `boat`，因为它们是记账作业，不能继续留在不可用的托管池里排队。档位沿用这些作业既有的 Blacksmith 档位（8 与 16 vCPU），使两条支路的试运行可比；两个判定作业与兼容性矩阵使用默认的 4 vCPU，`publisher-isolated` 保留其仅需 npm 安装的最小沙箱。

boat 分支不带 Dependabot 排除，也不带 fork 谓词，理由与 blacksmith 分支相同：boat 沙箱属于单个作业并在之后销毁，让 Dependabot 留在托管池的那套持久机理由不再适用。`selfhosted` 分支设置的并发与线程上限在 `boat` 下保持未设置，因为沙箱提供的是独占 CPU，而不是共享主机的切片。基准 lane 在 `boat` 下移入 Boat（与共享的 `vm-backup` 池不同），因为每作业沙箱就是空闲机器，墙钟预算仍然可比；该 lane 保留自身的两文件并行度与二十分钟上限。

其余所有作业在任何取值下都保持现有路由：`python-runtime` 构建器、持有凭据的真实 API e2e 与发布 lane 仍留在托管环境或各自的池；原生 Windows 作业仍在 `DSH_CI_FAILOVER_WINDOWS` 之后；e2e、sandbox、expected-filenames、发布与 master 基准工作流保留各自仅含 `blacksmith` 的故障切换分支；发布形态的链路整体保持托管，因为其产物进入已发布的注册表输出。

## 备选方案

单独写一个硬编码参与作业的 `boat-ci.yml`。被否决，因为它复制整套作业体、会与分支保护真正读取的必需检查脱节，并可能在并非必需作业的作业上报告绿灯。开关加选择器的形式让每个作业只有一份定义，使改动成为一个变量而非一次合并。

把 Boat 设为默认运行器。被否决，原因在成本与信任：默认必须保留仓库自有的托管企业池，显式开关让第三方执行成为一次决策，而不是本笔记落地后的副作用。

为 `DSH_CI_FAILOVER_WINDOWS` 增加 Boat 取值。被否决，因为 Boat 不提供 Windows 镜像；原生 Windows lane 保留自己的开关与池。

## 后果

boat 支路在设置 `DSH_CI_FAILOVER_LINUX=boat` 之前保持休眠，因此只在真正的故障切换或显式实验中才会被使用。启用它需要在仓库上安装 Boat CI GitHub App，并让 `boat ci repos` 列出该仓库；此后参与作业的运行会按秒计入关联的 Boat 账号。账号的每分钟、每小时与每日启动上限仍然生效；被限流的启动会等待并重试，而不是让检查失败，仪表盘与 `boat ci job <id>` 会显示等待、费用与拒绝原因。`workflow_dispatch` 触发的 Boat 运行会把该 ref 自身代码放到沙箱上执行，因此这个开关只能是写者可管理的仓库状态，与其它取值完全一致。

该支路尚未在本仓库上实际运行：撰写时不存在参与作业的试运行记录，档位映射来自对 Blacksmith 档位的推断，而非实测。因此首次使用应当视为一次试运行——与托管 lane 比较墙钟与内存、留意 Boat 的内存不足警告（它会给岀应提升的沙箱档位），并把结果记录在此。工作流契约测试钉住了这些分支：[ci-workflow.spec.ts](../../../../scripts/ci-workflow.spec.ts) 断言每个参与作业上的 `boat` 标签与未改变的托管回退，[ci-compatible-selfhosted.spec.ts](../../../../scripts/ci-compatible-selfhosted.spec.ts) 求值 `boat` 路由模式，因此重写选择器会让单元门禁失败。默认成本姿态不变：除非变量这样指定，否则没有任何作业运行在 Boat 上。
