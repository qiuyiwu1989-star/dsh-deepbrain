/**
 * 深脑 MCP 的最小客户端 —— JSON-RPC over HTTP，无依赖。
 *
 * 深脑的 MCP 是 Streamable HTTP 的**无状态**实现：每个请求独立、`GET` 直接 405、
 * 没有会话与推流。所以这里不需要维护连接，只需要一个会把错误翻译清楚的 POST。
 *
 * ## 为什么错误要单独翻译
 *
 * 三类失败长得很像但要做的事完全不同，混在一起下游只会反复重试：
 *   · 401 —— key 没配或写错，重试一万次也没用；
 *   · 403（JSON-RPC -32002）—— key 有效但 scope 不够，要换一把 key；
 *   · 工具自身报错（`isError: true`）—— 参数或数据的问题，改参数可能就好了。
 * 把它们压成同一句 "request failed" 是这类桥接层最常见的坏味道。
 */

/** 服务端在 `initialize` 里回的东西，缓存下来给 `deepbrain_howto` 用。 */
export interface ServerInfo {
  protocolVersion: string
  instructions: string
  serverName: string
}

export interface McpClientOptions {
  endpoint: string
  apiKey: string
  timeoutMs: number
}

interface JsonRpcResponse {
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

/** 客户端能识别的失败类型。`kind` 决定下游该不该重试。 */
export type ErrorKind = 'auth' | 'scope' | 'tool' | 'transport' | 'protocol'

export class DeepBrainError extends Error {
  // 写成普通字段而不是构造器参数属性：Node 的 --experimental-strip-types
  // 只做类型擦除、不做语法降级，参数属性会直接报 ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX，
  // 于是 tsc 过了但自测跑不起来。
  readonly kind: ErrorKind

  constructor(message: string, kind: ErrorKind) {
    super(message)
    this.name = 'DeepBrainError'
    this.kind = kind
  }
}

export class McpClient {
  private info: ServerInfo | null = null
  private readonly opts: McpClientOptions

  constructor(opts: McpClientOptions) {
    this.opts = opts
  }

  private async rpc(method: string, params?: unknown): Promise<Record<string, unknown>> {
    // AbortSignal.timeout 而不是自己 setTimeout：后者忘了 clear 就是一个泄漏的 timer，
    // 而插件里所有长生命周期资源都必须能随 fiber 清理。
    let res: Response
    try {
      res = await fetch(this.opts.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.opts.apiKey}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      })
    } catch (e) {
      const why = (e as Error)?.name === 'TimeoutError'
        ? `超过 ${Math.round(this.opts.timeoutMs / 1000)} 秒没有响应`
        : String((e as Error)?.message ?? e)
      throw new DeepBrainError(`连不上深脑（${this.opts.endpoint}）：${why}`, 'transport')
    }

    if (res.status === 401) {
      throw new DeepBrainError(
        'API key 无效或已撤销。在深脑「设置 → API keys」重新生成，填进插件配置的 apiKey 或环境变量 DEEPBRAIN_API_KEY。',
        'auth',
      )
    }
    if (!res.ok) {
      throw new DeepBrainError(`深脑返回 HTTP ${res.status}：${(await res.text()).slice(0, 200)}`, 'transport')
    }

    const json = (await res.json().catch(() => null)) as JsonRpcResponse | null
    if (!json) throw new DeepBrainError('深脑返回的不是合法 JSON', 'protocol')

    if (json.error) {
      // -32002 是深脑用来表达「这把 key 的 scope 不够」的码。换 key 才有用，重试没用。
      const kind = json.error.code === -32002 ? 'scope' : 'protocol'
      throw new DeepBrainError(json.error.message, kind)
    }
    return json.result ?? {}
  }

  /** 握手一次并缓存。`instructions` 是服务器级说明书，比任何本地文档都新。 */
  async handshake(): Promise<ServerInfo> {
    if (this.info) return this.info
    const r = await this.rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'dsh-deepbrain', version: '0.1.0' },
    })
    const server = (r.serverInfo ?? {}) as { name?: string }
    this.info = {
      protocolVersion: String(r.protocolVersion ?? ''),
      instructions: String(r.instructions ?? ''),
      serverName: String(server.name ?? 'deepbrain'),
    }
    return this.info
  }

  /** 服务端当前允许这把 key 调的工具名。用于把透传口的错误说得具体。 */
  async toolNames(): Promise<string[]> {
    const r = await this.rpc('tools/list')
    const tools = (r.tools ?? []) as { name?: string }[]
    return tools.map((t) => String(t.name ?? '')).filter(Boolean)
  }

  /**
   * 调一个 MCP 工具，返回纯文本。
   *
   * MCP 的返回是 content 块数组，可能夹着 `resource_link` 之类的非文本块——
   * 这里只取文本并拼起来：DSH 工具的产出是给模型读的，链接块在文本里已经有 markdown 形式。
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const r = await this.rpc('tools/call', { name, arguments: args })
    const content = (r.content ?? []) as { type?: string; text?: string }[]
    const text = content
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string)
      .join('\n')
      .trim()

    if (r.isError === true) {
      throw new DeepBrainError(text || `深脑工具 ${name} 执行出错`, 'tool')
    }
    return text || '（深脑没有返回内容）'
  }
}
