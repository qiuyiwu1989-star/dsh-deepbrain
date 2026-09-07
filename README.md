# dsh-deepbrain

Bring **DeepBrain (深脑)** into [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

DeepBrain does not store documents — it stores **judgments**: conclusions distilled from
recordings of meetings, interviews and lectures, each with an evidence chain back to what was
actually said, and corroborated across separate occasions. With this plugin your DSH agent can
read those judgments, quote verbatim-verified lines under someone's name, look up a person's
historical positions, and borrow DeepBrain's analysis methods for material of its own.

> Requires a DeepBrain account and API key. DeepBrain: <https://shennao.zaowuyun.com>
> The product UI and returned content are in Chinese.

## Install

```sh
npx -p @deepseek-ai/dsh dsh plugin --profile web add github:qiuyiwu1989-star/dsh-deepbrain
```

Build output ships in the repository, so **no dependency build scripts need to be allowed**.
Restart the profile afterwards.

Then set your key (generate one under Settings → API keys; it looks like `lj_live_…`):

```sh
export DEEPBRAIN_API_KEY=lj_live_xxx
```

**Prefer the environment variable over putting it in config**: profile config is printed verbatim
by `dsh --dump-config`, so a key written there ends up in logs and screenshots.

## Six tools

The server currently exposes 27 MCP tools. This plugin registers 6 — **a client's job is not to
mirror the server, it is to present the right shape**. Hand a model 27 tool names and its default
strategy becomes "use whichever returns the most", which means going straight for raw transcripts
and blowing up its own context.

| Tool | When to use it |
|---|---|
| `deepbrain_brief` | **First step when you don't know what to ask.** Describe your situation; DeepBrain decides what you should know |
| `deepbrain_topics` | Browse the index, or pull one topic's digest. **Most writing and analysis stops here** |
| `deepbrain_quotes` | Quotes you can attribute — every one verified word-for-word against the transcript |
| `deepbrain_person` | The roster, or one person's history of positions. Run it before a negotiation or a meeting |
| `deepbrain_ask` | Ask a specific question, get a sourced answer. Slow questions are awaited automatically |
| `deepbrain_call` | **Escape hatch.** Call any DeepBrain MCP tool directly, for what the five above don't cover |

Leaving `tool` empty on `deepbrain_call` lists every tool the current key is allowed to call.

## Configuration

```yaml
- insert:
    - id: deepbrain
      name: 'dsh-deepbrain'
      config:
        endpoint: 'https://shennao.zaowuyun.com/api/mcp'   # self-hosted? change this
        apiKey: ''                                          # empty → read DEEPBRAIN_API_KEY
        timeoutMs: 120000                                   # multi-step retrieval can take a while
        passthrough: true                                   # false = don't register deepbrain_call
```

## Scopes

DeepBrain API keys are scoped, and the server trims the callable tool set accordingly:

- `brain.ask` — judgments, quotes, people, method library. **Most usage needs only this**
- `transcript.read` / `transcript.write` — fetch raw transcripts, feed new ones in
- `brain.propose` — write judgments back (they land in an inbox and require human review)

When a scope is missing the tool tells the model plainly that retrying will not help and a
different key is needed, rather than reporting a generic failure.

## What it does not do

- **No caching.** Every call is live. Judgments get superseded and expire; a cache would serve
  stale conclusions as current ones.
- **No writes** unless you explicitly call a write tool through `deepbrain_call`, which requires
  `brain.propose`.
- **No web UI.** Host-only plugin: it contributes tools, registers no slots, ships no client bundle.

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md).

MIT
