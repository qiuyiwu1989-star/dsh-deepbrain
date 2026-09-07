import { type McpClient } from './mcp.ts';
export declare function makeTools(client: () => McpClient, enablePassthrough: boolean): import("@deepseek-ai/dsh-tools").ToolDefinition[];
