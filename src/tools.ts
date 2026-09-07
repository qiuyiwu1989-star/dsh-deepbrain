/**
 * 六个工具 —— **按检索阶梯成形，不是把服务端的 27 个照搬过来。**
 *
 * 深脑 MCP 服务端现在有 27 个工具。把它们原样注册进 DSH，会正好触发这类接入最典型的
 * 失败：模型看见一长串工具名，默认策略变成「哪个返回得最全用哪个」，直奔取原文，
 * 一次就把自己的上下文打爆——之后连「该换个工具」都想不了。
 *
 * 客户端的职责不是镜像服务端，是**呈现正确的形状**。所以这里按检索阶梯合并成五个
 * 成形工具，外加一个透传口给确实需要其余能力的场景：
 *
 *   brief    说处境，让深脑决定你该知道什么   ← 不知道该问什么时的第一步
 *   topics   看目录 / 取某个主题的提要        ← 大多数任务停在这里就够
 *   quotes   取可署名引用的原话（已逐字核验）
 *   person   看名册 / 取某个人的历史立场
 *   ask      问一个具体问题（慢问题自动等）
 *   call     透传任意 MCP 工具               ← 逃生口，不是主路
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DeepBrainError, type McpClient } from './mcp.ts'

/** 所有工具共用的产出形状：深脑那边回来的就是给模型读的 markdown。 */
const textOut = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      text: { type: 'string', required: true, description: '深脑返回的正文（markdown）' },
    },
  },
  render: (_args: unknown, value: { text: string }) => [{ type: 'text' as const, text: value.text }],
} as const

/** 把客户端的错误翻成模型能据此改行为的一句话，而不是一个堆栈。 */
function explain(e: unknown): never {
  if (e instanceof DeepBrainError) {
    const hint =
      e.kind === 'auth' ? '这不是重试能解决的问题，需要用户去配置 key。'
      : e.kind === 'scope' ? '这把 key 的权限不含该能力，换一把或让用户在设置里加 scope。'
      : e.kind === 'transport' ? '网络或服务端问题，可以稍后再试一次；连续失败就告诉用户。'
      : ''
    throw new Error(hint ? `${e.message}\n${hint}` : e.message)
  }
  throw e
}

export function makeTools(client: () => McpClient, enablePassthrough: boolean) {
  const brief = defineTool({
    name: 'deepbrain_brief',
    description:
      '**说明你的处境，让深脑决定你该知道什么。** 与"搜索"方向相反：不要求你已经知道该问什么，'
      + '只要求你说清在干什么（要谈的对象、要写的题目、要做的决定）。'
      + '返回四段：这个组织在反复想的主题 / 跨场合成立的枢纽判断 / 与本次处境相关的判断 / 可署名引用的原话。'
      + '**不确定该问什么时，先用这个。** 里面提到的主题用 deepbrain_topics 展开，要引用用 deepbrain_quotes。',
    parameters: {
      situation: {
        type: 'string',
        required: true,
        description: '你的处境，一两句话。例如「要和某位客户谈明年的合作条款」「要写一篇关于判断力的文章」',
      },
    },
    output: textOut,
    presentCall: (args) => ({ card: 'generic', title: `深脑简报：${args.situation.slice(0, 24)}`, kind: 'search' }),
    async execute(args) {
      try {
        return { text: await client().callTool('situation_brief', { situation: args.situation }) }
      } catch (e) { explain(e) }
    },
  })

  const topics = defineTool({
    name: 'deepbrain_topics',
    description:
      '看这个大脑里有哪些主题，或取某一个主题的提要。**不传 id 就是看目录**（只有标题和条数，很小）；'
      + '**传 id 取那一个的提要**（综述 + 成色最高的判断 + 已核验原话 + 证据链链接）。'
      + '目录里的 id 是稳定主键，取提要时传 id 不要传标题——标题一转述就落空。'
      + '**绝大多数写作与分析任务停在提要这一级就够了，不需要原文。**'
      + '要可署名引用的原话用 deepbrain_quotes；要看某个人在这件事上的立场用 deepbrain_person。',
    parameters: {
      id: { type: 'string', description: '主题 id（来自不传 id 时返回的目录）。留空则返回目录' },
      limit: { type: 'integer', description: '看目录时返回多少个主题，默认 40' },
    },
    output: textOut,
    presentCall: (args) => ({
      card: 'generic',
      title: args.id ? `深脑主题：${args.id}` : '深脑主题目录',
      kind: 'search',
    }),
    async execute(args) {
      try {
        const id = args.id?.trim()
        return id
          ? { text: await client().callTool('get_topic', { id }) }
          : { text: await client().callTool('list_topics', { limit: args.limit ?? 40 }) }
      } catch (e) { explain(e) }
    },
  })

  const quotes = defineTool({
    name: 'deepbrain_quotes',
    description:
      '取**可以直接加引号署名引用的原话**。每条都已逐字核验：能在原始录音转写里原样找到。'
      + '模型转写或概括过的引用一律不返回——避免把当事人没说过的话安到他嘴上。'
      + '**要引语就用这个，不要去取原文里翻**：这边已经核验过，翻原文既费上下文又容易引错。'
      + '不知道该限定哪个主题就先用 deepbrain_topics 看目录。',
    parameters: {
      topic: { type: 'string', description: '可选：限定某个主题（用主题标题）' },
      limit: { type: 'integer', description: '条数，默认 20' },
      minCorroboration: { type: 'integer', description: '成色门槛：只要跨 N 个以上场合成立的判断所对应的原话' },
    },
    output: textOut,
    presentCall: (args) => ({ card: 'generic', title: args.topic ? `深脑原话：${args.topic}` : '深脑原话', kind: 'search' }),
    async execute(args) {
      try {
        const p: Record<string, unknown> = { limit: args.limit ?? 20 }
        if (args.topic?.trim()) p.topic = args.topic.trim()
        if (args.minCorroboration) p.min_corroboration = args.minCorroboration
        return { text: await client().callTool('list_quotes', p) }
      } catch (e) { explain(e) }
    },
  })

  const person = defineTool({
    name: 'deepbrain_person',
    description:
      '看这个组织里出现过哪些人和机构，或取某一个人的历史立场。**不传 id 就是看名册**；'
      + '**传 id 取那一个人**：档案、别名、他自己持有的判断（带已核验原话）、以及挂在他名下的判断。'
      + '注意两栏口径不同——「他自己持有的」经过原话核验，说"是他说的"站得住；'
      + '「挂在他名下的」里既有别人对他的评价也有他自己的主张，**不能声称是他说的**。'
      + '谈判前、见面前、写人物前调一次。'
      + '要拿他说过的原话去引用，用 deepbrain_quotes。',
    parameters: {
      id: { type: 'string', description: '实体 id（来自名册）。留空则返回名册' },
      limit: { type: 'integer', description: '看名册时返回多少人，默认 30' },
    },
    output: textOut,
    presentCall: (args) => ({ card: 'generic', title: args.id ? `深脑人物：${args.id}` : '深脑人物名册', kind: 'search' }),
    async execute(args) {
      try {
        const id = args.id?.trim()
        return id
          ? { text: await client().callTool('get_person', { id }) }
          : { text: await client().callTool('list_people', { limit: args.limit ?? 30 }) }
      } catch (e) { explain(e) }
    },
  })

  const ask = defineTool({
    name: 'deepbrain_ask',
    description:
      '向大脑问一个具体问题，它多步检索历史沉淀的判断再合成带溯源的回答。'
      + '适合「上次客户的核心顾虑是什么」「我们在定价上有没有自相矛盾」这类问题。'
      + '**这是"要一个答案"时用的**；想自己读判断用 deepbrain_topics，想要能引用的原话用 deepbrain_quotes。'
      + '慢问题服务端会转成后台任务，本工具会自动等待并取回结果，你不用管 task_id。',
    parameters: {
      question: { type: 'string', required: true, description: '要问的问题（自然语言）' },
    },
    output: textOut,
    presentCall: (args) => ({ card: 'generic', title: `问深脑：${args.question.slice(0, 24)}`, kind: 'search' }),
    async execute(args, exec) {
      try {
        const c = client()
        const first = await c.callTool('ask_brain', { question: args.question })
        // 服务端没当场跑完时回的是 task_id + 提示。**不要重问**——重问是再起一个任务，
        // 两份钱一份答案。这里替模型把取件这件事做掉。
        const m = first.match(/task_id:\s*([0-9a-f-]{36})/i)
        if (!m) return { text: first }

        const taskId = m[1]
        for (let i = 0; i < 12; i++) {
          if (exec?.signal?.aborted) return { text: `已取消。任务仍在深脑后台跑，task_id: ${taskId}` }
          await new Promise((r) => setTimeout(r, 10_000))
          const got = await c.callTool('get_answer', { task_id: taskId })
          if (!got.startsWith('还在跑')) return { text: got }
        }
        return {
          text: `这个问题在深脑后台跑了两分钟还没完，task_id: ${taskId}。`
            + '把这个 id 交给用户，或稍后再取一次；**不要换个问法重问**，那会再起一个任务。',
        }
      } catch (e) { explain(e) }
    },
  })

  const call = defineTool({
    name: 'deepbrain_call',
    description:
      '**逃生口**：直接调深脑 MCP 的任意工具。上面五个覆盖了绝大多数用法，'
      + '只有当你确实需要别的能力（取原文分段、决策台账、选题矿、方法库、把判断写回去等）时才用这个。'
      + '不知道有哪些工具就把 tool 留空，会返回当前这把 key 能调的全部工具名。',
    parameters: {
      tool: { type: 'string', description: '深脑 MCP 的工具名。留空则列出可用工具名' },
      argumentsJson: {
        type: 'string',
        description: '该工具的参数，JSON 对象字符串。例如 {"transcript_id":"…","offset":0}。无参数可留空',
      },
    },
    output: textOut,
    presentCall: (args) => ({ card: 'generic', title: args.tool ? `深脑：${args.tool}` : '深脑可用工具', kind: 'search' }),
    async execute(args) {
      try {
        const c = client()
        const tool = args.tool?.trim()
        if (!tool) {
          const names = await c.toolNames()
          return { text: `这把 key 可以调的深脑工具（${names.length} 个）：\n${names.map((n) => `- ${n}`).join('\n')}` }
        }
        let parsed: Record<string, unknown> = {}
        const raw = args.argumentsJson?.trim()
        if (raw) {
          try {
            const v = JSON.parse(raw)
            if (v === null || typeof v !== 'object' || Array.isArray(v)) {
              throw new Error('argumentsJson 必须是一个 JSON 对象，例如 {"limit":10}')
            }
            parsed = v as Record<string, unknown>
          } catch (err) {
            throw new Error(`argumentsJson 不是合法的 JSON 对象：${(err as Error).message}`)
          }
        }
        return { text: await c.callTool(tool, parsed) }
      } catch (e) { explain(e) }
    },
  })

  return enablePassthrough ? [brief, topics, quotes, person, ask, call] : [brief, topics, quotes, person, ask]
}
