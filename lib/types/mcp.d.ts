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
    protocolVersion: string;
    instructions: string;
    serverName: string;
}
export interface McpClientOptions {
    endpoint: string;
    apiKey: string;
    timeoutMs: number;
}
/** 客户端能识别的失败类型。`kind` 决定下游该不该重试。 */
export type ErrorKind = 'auth' | 'scope' | 'tool' | 'transport' | 'protocol';
export declare class DeepBrainError extends Error {
    readonly kind: ErrorKind;
    constructor(message: string, kind: ErrorKind);
}
export declare class McpClient {
    private info;
    private readonly opts;
    constructor(opts: McpClientOptions);
    private rpc;
    /** 握手一次并缓存。`instructions` 是服务器级说明书，比任何本地文档都新。 */
    handshake(): Promise<ServerInfo>;
    /** 服务端当前允许这把 key 调的工具名。用于把透传口的错误说得具体。 */
    toolNames(): Promise<string[]>;
    /**
     * 调一个 MCP 工具，返回纯文本。
     *
     * MCP 的返回是 content 块数组，可能夹着 `resource_link` 之类的非文本块——
     * 这里只取文本并拼起来：DSH 工具的产出是给模型读的，链接块在文本里已经有 markdown 形式。
     */
    callTool(name: string, args: Record<string, unknown>): Promise<string>;
}
