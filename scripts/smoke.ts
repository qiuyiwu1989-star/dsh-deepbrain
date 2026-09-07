/**
 * 自测 —— 不联网，靠假 fetch 跑完全部判定分支。
 *
 * 重点在第一项：**必须真的调用 `makeTools()`**。value-schema DSL 的违规
 * （比如 `required` 出现在 items 指向的节点根上）typecheck 一律放行，
 * 只有 `defineTool` 在运行时才抛 `UNSUPPORTED_SCHEMA`。
 * 只跑 tsc 的插件，装到用户机器上才发现 schema 是坏的。
 */
import assert from 'node:assert/strict'
import { makeTools } from '../src/tools.ts'
import { McpClient, DeepBrainError } from '../src/mcp.ts'

let passed = 0
function it(what: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ok  ${what}`) })
    .catch((e) => { console.error(`  FAIL ${what}\n       ${(e as Error).message}`); process.exitCode = 1 })
}

/** 装一个假 fetch，返回指定的 HTTP 状态与 body。 */
function stubFetch(status: number, body: unknown): () => void {
  const real = globalThis.fetch
  globalThis.fetch = (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch
  return () => { globalThis.fetch = real }
}

const client = () => new McpClient({ endpoint: 'http://x/api/mcp', apiKey: 'k', timeoutMs: 1000 })

await it('schema 合法：defineTool 真的跑得起来（typecheck 抓不到这一层）', () => {
  const tools = makeTools(client, true)
  assert.equal(tools.length, 6)
  assert.deepEqual(
    tools.map((t) => t.name),
    ['deepbrain_brief', 'deepbrain_topics', 'deepbrain_quotes', 'deepbrain_person', 'deepbrain_ask', 'deepbrain_call'],
  )
})

await it('关掉透传口就少一个工具，且少的是 deepbrain_call', () => {
  const names = makeTools(client, false).map((t) => t.name)
  assert.equal(names.length, 5)
  assert.ok(!names.includes('deepbrain_call'))
})

await it('每个工具都写清了「什么时候用别的」——否则模型会退回"哪个最全用哪个"', () => {
  const all = makeTools(client, true)
  const names = all.map((t) => t.name)
  for (const t of all) {
    if (t.name === 'deepbrain_call') continue   // 逃生口，不参与阶梯
    const others = names.filter((n) => n !== t.name)
    assert.ok(
      others.some((n) => t.description.includes(n)),
      `${t.name} 的描述里没提到任何别的工具`,
    )
  }
})

await it('401 → auth（重试无用，要用户去配 key）', async () => {
  const restore = stubFetch(401, {})
  try {
    await client().callTool('list_topics', {})
    assert.fail('应当抛错')
  } catch (e) {
    assert.ok(e instanceof DeepBrainError && e.kind === 'auth', `实际：${String(e)}`)
  } finally { restore() }
})

await it('-32002 → scope（要换一把 key，不是重试）', async () => {
  const restore = stubFetch(200, { error: { code: -32002, message: 'forbidden：此工具需要 brain.ask scope' } })
  try {
    await client().callTool('list_topics', {})
    assert.fail('应当抛错')
  } catch (e) {
    assert.ok(e instanceof DeepBrainError && e.kind === 'scope', `实际：${String(e)}`)
  } finally { restore() }
})

await it('isError → tool（参数或数据的问题，改参数可能就好了）', async () => {
  const restore = stubFetch(200, { result: { isError: true, content: [{ type: 'text', text: '素材不存在' }] } })
  try {
    await client().callTool('get_transcript', { transcript_id: 'x' })
    assert.fail('应当抛错')
  } catch (e) {
    assert.ok(e instanceof DeepBrainError && e.kind === 'tool', `实际：${String(e)}`)
    assert.match((e as Error).message, /素材不存在/)
  } finally { restore() }
})

await it('只取文本块，resource_link 之类不混进产出', async () => {
  const restore = stubFetch(200, {
    result: { content: [{ type: 'text', text: '正文' }, { type: 'resource_link', uri: 'deepbrain://topic/1' }] },
  })
  try {
    assert.equal(await client().callTool('get_topic', { id: '1' }), '正文')
  } finally { restore() }
})

await it('握手缓存 instructions，且只握一次', async () => {
  let calls = 0
  const real = globalThis.fetch
  globalThis.fetch = (async () => { calls++; return {
    ok: true, status: 200,
    json: async () => ({ result: { protocolVersion: '2025-06-18', instructions: '检索阶梯…', serverInfo: { name: 'deepbrain' } } }),
    text: async () => '',
  } }) as unknown as typeof fetch
  try {
    const c = client()
    const a = await c.handshake()
    const b = await c.handshake()
    assert.equal(calls, 1, '第二次握手不该再发请求')
    assert.equal(a.instructions, '检索阶梯…')
    assert.equal(b.serverName, 'deepbrain')
  } finally { globalThis.fetch = real }
})

await it('透传口：argumentsJson 不是对象时报得具体，不是崩一个 JSON 错', async () => {
  const call = makeTools(client, true).find((t) => t.name === 'deepbrain_call')!
  const restore = stubFetch(200, { result: { content: [{ type: 'text', text: 'ok' }] } })
  try {
    await call.execute({ tool: 'list_topics', argumentsJson: '[1,2]' } as never, {} as never)
    assert.fail('应当抛错')
  } catch (e) {
    assert.match((e as Error).message, /必须是一个 JSON 对象/)
  } finally { restore() }
})

console.log(`\n${process.exitCode ? '有失败' : '全部通过'}：${passed} 项`)
