# dsh-deepbrain

把 **深脑 / DeepBrain** 接进 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。

深脑存的不是文档，是**判断**：从会议、访谈、讲课的录音里炼出来的结论，带证据链、跨场合反复印证过。
装上之后，DSH 里的模型可以直接读到这些判断、可署名引用的原话、某个人的历史立场，
也能把深脑那套分析方法取走，用在自己手上的材料上。

> 需要一个深脑账号与 API key。深脑：<https://shennao.zaowuyun.com>

## 安装

```sh
npx -p @deepseek-ai/dsh dsh plugin --profile web add github:qiuyiwu1989-star/dsh-deepbrain
```

构建产物随仓库分发，**不需要允许执行依赖脚本**。装完重启该 profile。

然后配 key（在深脑「设置 → API keys」生成，形如 `lj_live_…`）：

```sh
export DEEPBRAIN_API_KEY=lj_live_xxx
```

**建议用环境变量而不是写进配置**：profile 的配置会被 `dsh --dump-config` 原样打印，
key 写在里面就会跟着出现在日志和截图里。

## 六个工具

服务端现在有 27 个 MCP 工具，这个插件只注册 6 个——**客户端的职责不是镜像服务端，
是呈现正确的形状**。把 27 个原样铺给模型，它的默认策略会变成「哪个返回得最全用哪个」，
直奔取原文，一次就把上下文打爆。

| 工具 | 什么时候用 |
|---|---|
| `deepbrain_brief` | **不知道该问什么时的第一步。** 说清你在干什么，深脑自己判断你该知道什么 |
| `deepbrain_topics` | 看目录，或取某个主题的提要。**大多数写作与分析任务停在这里就够** |
| `deepbrain_quotes` | 取可直接加引号署名引用的原话——每条都已逐字核验 |
| `deepbrain_person` | 看名册，或取某个人的历史立场。谈判前、见面前调一次 |
| `deepbrain_ask` | 问一个具体问题，拿一个带溯源的答案。慢问题自动等待取件 |
| `deepbrain_call` | **逃生口。** 直接调深脑 MCP 的任意工具，留给上面五个盖不住的场景 |

`deepbrain_call` 的 `tool` 留空会列出当前这把 key 能调的全部工具名。

## 配置

```yaml
- insert:
    - id: deepbrain
      name: 'dsh-deepbrain'
      config:
        endpoint: 'https://shennao.zaowuyun.com/api/mcp'   # 自托管改这里
        apiKey: ''                                          # 留空 → 读 DEEPBRAIN_API_KEY
        timeoutMs: 120000                                   # 多步检索可能要一两分钟
        passthrough: true                                   # false = 不注册 deepbrain_call
```

## 权限

深脑的 API key 分 scope，服务端会按 scope 裁剪能调的工具：

- `brain.ask` —— 读判断、原话、人物、方法库。**大多数用法只需要这一个**
- `transcript.read` / `transcript.write` —— 取原文、投喂转写
- `brain.propose` —— 把判断写回深脑（进收件箱，人审过才入库）

权限不够时工具会明确告诉模型「这不是重试能解决的，需要换一把 key」，
而不是笼统地报一句失败。

## 它不做什么

- **不缓存深脑的内容。** 每次调用都是实时的；判断会被推翻、会过期，缓存等于把旧判断当新的用。
- **不改深脑里的数据**（除非你用 `deepbrain_call` 显式调写入类工具，而那需要 `brain.propose`）。
- **没有 Web 界面。** 这是 host-only 插件，只贡献工具，不注册 slot、不构建 client bundle。

## 已知边界

`@deepseek-ai/dsh-tools` 是本插件的**真依赖**（随插件一起装），但它自己把
`@deepseek-ai/cordis` 声明成 peer。在**没有开 `auto-install-peers`** 的干净 profile 里，
cordis 不会被装进来——这条链在本插件上游，任何使用 `dsh-tools` 的第三方插件都一样。

正常情况下由 harness 提供 cordis（它是 `dsh` 自己的依赖）。如果遇到
`Cannot find package '@deepseek-ai/cordis'`，在 profile 里补一句：

```sh
pnpm config set auto-install-peers true
```

**本插件不会自己去依赖一份 cordis** —— cordis 是 DI 容器，复制一份会造成
Context/Service 的身份分裂，那比缺依赖严重得多。

## 开发

见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

MIT
