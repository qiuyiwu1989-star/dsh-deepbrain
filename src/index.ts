/**
 * dsh-deepbrain — 把「深脑 / DeepBrain」接进 DeepSeek Harness。
 *
 * 深脑存的不是文档，是**判断**：从会议、访谈、讲课的录音里炼出来的结论，带证据链、
 * 跨场合反复印证过。装上这个插件之后，DSH 里的模型可以读到这些判断、可署名引用的原话、
 * 某个人的历史立场，也能把深脑那套分析方法取走用在自己手上的材料上。
 *
 * ## 形态：host-only
 *
 * 只贡献工具，不需要 slot、不需要浏览器状态，所以**不声明 `dsh.client`、不构建 client bundle**。
 * 运行面越小越好维护。
 *
 * ## 一个刻意的设计
 *
 * 服务端现在有 27 个工具，这里只注册 6 个。客户端的职责不是镜像服务端，是呈现正确的形状——
 * 理由写在 tools.ts 的文件头。
 */
import type { Context } from '@deepseek-ai/cordis'
import { McpClient } from './mcp.ts'
import { makeTools } from './tools.ts'

export const name = 'deepbrain'
export const inject = ['tools']

export interface Config {
  /** 深脑 MCP 端点。自托管客户改成自己的地址 */
  endpoint?: string
  /**
   * 深脑 API key（`lj_live_…`）。在深脑「设置 → API keys」生成。
   *
   * 留空则读环境变量 `DEEPBRAIN_API_KEY`。**建议用环境变量**：
   * profile 的配置文件会被 `--dump-config` 打印出来，key 写在里面就会跟着出现在日志和截图里。
   */
  apiKey?: string
  /** 单次请求超时毫秒。深脑的多步检索可能要一两分钟 */
  timeoutMs?: number
  /** 是否注册 deepbrain_call 透传口。关掉则只留五个成形工具 */
  passthrough?: boolean
}

export function apply(ctx: Context, config: Config = {}): void {
  const endpoint = config.endpoint?.trim() || 'https://shennao.zaowuyun.com/api/mcp'
  const timeoutMs = config.timeoutMs && config.timeoutMs > 0 ? config.timeoutMs : 120_000
  const passthrough = config.passthrough !== false

  // key 在**每次调用时**才解析，不在 apply 里定死：
  // 用户可能先装插件、后配 key，装的时候没有不该让整个 fiber 失败——
  // 那样表现是"插件坏了"，而实际只是还没填 key。缺 key 的错误留到工具被调时说清楚。
  const resolveKey = (): string => {
    const k = config.apiKey?.trim() || process.env.DEEPBRAIN_API_KEY?.trim()
    if (!k) {
      throw new Error(
        '没有配置深脑 API key。在深脑「设置 → API keys」生成一把（lj_live_…），'
        + '然后设环境变量 DEEPBRAIN_API_KEY，或写进插件配置的 apiKey。',
      )
    }
    return k
  }

  let cached: McpClient | null = null
  let cachedKey = ''
  const client = (): McpClient => {
    const key = resolveKey()
    // key 变了就重建：否则改了环境变量还得重启，而这属于"改配置应该立刻生效"的那一类
    if (!cached || cachedKey !== key) {
      cached = new McpClient({ endpoint, apiKey: key, timeoutMs })
      cachedKey = key
    }
    return cached
  }

  // 注册基于副作用，插件卸载时框架自动注销，不需要额外 disposer。
  for (const tool of makeTools(client, passthrough)) {
    ctx.tools.register(tool)
  }
}

export { McpClient, DeepBrainError } from './mcp.ts'
export { makeTools } from './tools.ts'
