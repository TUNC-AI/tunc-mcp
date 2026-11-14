# tunc-mcp

**Agent memory, artifact storage, and document editing for AI agents — over MCP.**

A small, dependency-free MCP (Model Context Protocol) client for three hosted
services that AI agents and multi-agent systems actually need:

| Service | What it is | MCP endpoint |
|---|---|---|
| **Tunc Orb** | **Agent memory database** — durable records, logs and structured state shared by every agent you run | `https://mcp.tuncorb.com/mcp` |
| **Tunc Art** | **Artifact storage and private file sharing** — agent-generated files behind short private links | `https://mcp.tuncart.com/mcp` |
| **Tunc Doc** | **Documents, spreadsheets and slide decks** — import/export DOCX, XLSX, PPTX, PDF | `https://mcp.tuncdoc.com/mcp` |

All three are also reachable over **A2A** (agent-to-agent) and plain **REST**, so
the same account works whether your agent speaks MCP, A2A, or HTTP.

## Why this exists

Most agent stacks lose state the moment a context window rolls over. Writes from
two agents at once silently clobber each other. Artifacts end up as files on
someone's laptop. This gives an agent three boring, reliable primitives instead:

- **Memory that survives the conversation.** Records persist across sessions,
  across agents, across models. `data_read` / `data_write` / `data_update` /
  `data_delete`, with revision-guarded writes.
- **Artifacts with links you can send.** Upload a file, get a short private URL
  back. No bucket configuration.
- **Documents an agent can actually produce.** Real DOCX, XLSX and PPTX, not
  markdown pretending to be a report.

### Concurrency is the interesting part

`data_update` accepts `if_revision`. Two agents writing the same record do not
race: the second gets a `revision_conflict`, re-reads, and retries. That turns a
lost-update bug — the classic multi-agent failure where a plausible but wrong
number survives — into a loud retry. If you run agent swarms that share state,
use it.

## Install

```bash
npm install tunc-mcp
```

Node 18 or newer. No dependencies. Get an API key at
<https://tunchub.com/account/keys/new> — you can scope it read-only.

## Options

Every helper takes an object. Only the key is required, and it falls back to `TUNC_API_KEY`.

```js
import { orb, art, doc, connect, SERVERS } from 'tunc-mcp';

const memory = orb({
  apiKey: process.env.TUNC_API_KEY,
  endpoint: 'https://mcp.tuncorb.com/mcp', // override: staging, a proxy, or a local mock
});
```

- `apiKey` — defaults to `TUNC_API_KEY`. It is checked when the client is constructed, so a missing key fails immediately rather than on the first call.
- `endpoint` — replaces the built-in URL for that service. This is what you use to point the client at a test server.
- `service` — `"orb"`, `"art"` or `"doc"`, if you construct `TuncMcpClient` directly instead of using `orb()` / `art()` / `doc()`.

`SERVERS` is the map of default endpoints. `connect(key)` returns all three clients at once.

## What comes back

`callTool()` returns the server's MCP result unchanged:

```js
{ content: [{ type: "text", text: "<json string>" }], structuredContent: { /* … */ }, isError: false }
```

Confusingly, the same payload often appears twice — as `structuredContent` and again serialised into `content[0].text`. Use `structuredContent` when it is there. When you only want the text, `callText()` unwraps it for you:

```js
const text = await memory.callText('data_read', { name: 'contacts/ada' });
```

Tool names come from the server, not from this package. Call `listTools()` to see what a service actually offers before writing against it — the list is not hard-coded here and changes as the servers change.

## ESM only

This package is ESM. In a CommonJS project, either set `"type": "module"` in `package.json` or import it from an `.mjs` file. Otherwise Node fails with `SyntaxError: Cannot use import statement outside a module`.

## Use

```js
import { orb, art, doc } from 'tunc-mcp';

const memory = orb(); // reads TUNC_API_KEY

// Every tool takes an `operation` that picks what it does. Ask for a shape the
// server does not have and you get invalid_arguments back, so call listTools()
// once and read the real schemas rather than trusting an example.
//
// data_write  operation: create | append
// data_read   operation: shelves | list | get | log | search | status
// data_update operation: replace | patch        (needs if_revision)
// data_delete operation: record | entries | log (needs if_revision)

// Agent memory: durable records, revision-guarded
await memory.callTool('data_write', {
  operation: 'create',
  name: 'contacts/ada',
  about: 'Primary contact, Example Ltd',
  value: { email: 'ada@example.com', timezone: 'Europe/London' },
});

const record = await memory.callTool('data_read', {
  operation: 'get',
  name: 'contacts/ada',
});
const revision = JSON.parse(record.content[0].text).revision;

// Change it only if nobody else has, and delete it the same way
await memory.callTool('data_update', {
  operation: 'patch',
  name: 'contacts/ada',
  if_revision: revision,
  patch: [{ op: 'replace', path: '/timezone', value: 'Europe/Paris' }],
});

await memory.callTool('data_delete', {
  operation: 'record',
  name: 'contacts/ada',
  if_revision: revision,
});

// Artifacts: store a file, get a private link back.
// art_read is operation list|get; art_write is operation create; art_delete
// takes an artifact_id and nothing else.
const files = art();
const stored = await files.callTool('art_write', {
  operation: 'create',
  name: 'quarterly-report.pdf',
  mime_type: 'application/pdf',
  content_base64: base64Bytes,
});
// the result nests the artifact, keyed by `id`, with a viewer_url to share
const artifactId = JSON.parse(stored.content[0].text).artifact.id;

// Documents: build something a human can open and edit.
// doc_create needs only a title; doc_read, doc_write and doc_delete take `doc`.
const docs = doc();
const made = await docs.callTool('doc_create', {
  title: 'Q4 summary',
  markdown: '# Q4\n\nRevenue up 12%.',
});
const docId = JSON.parse(made.content[0].text).result.doc.id;
```

Discover what any service offers:

```js
const tools = await orb().listTools();
console.log(tools.map((t) => t.name).join(', '));
```

## CLI

```bash
export TUNC_API_KEY=tunc_...

npx tunc-mcp services
npx tunc-mcp tools --service orb
npx tunc-mcp call data_read '{"name":"contacts/ada"}' --service orb
```

## Wire it into an MCP client

Any MCP-capable host works — Claude Desktop, Cursor, Claude Code, Codex, a custom
orchestrator. Point it at the endpoint and pass the key as a bearer header:

```json
{
  "mcpServers": {
    "tunc-orb": {
      "type": "http",
      "url": "https://mcp.tuncorb.com/mcp",
      "headers": { "Authorization": "Bearer ${TUNC_API_KEY}" }
    }
  }
}
```

## Agent-to-agent

Every service publishes an A2A agent card, so agents that speak A2A can discover
and call them without a human in the loop:

- <https://tuncorb.com/.well-known/agent-card.json>
- <https://tuncart.com/.well-known/agent-card.json>
- <https://tuncdoc.com/.well-known/agent-card.json>

## What this package does not do

It is a client. It does not host anything, and it does not bundle an agent
runtime. If you want the workspace these services belong to — a multiplayer
chat where people and agents work together — that is a desktop and mobile app:
<https://tunchub.com>.

## Errors

Everything throws `TuncMcpError` with a `status`, a `code` and the server's
message. A `401` means the key is missing, revoked, or not scoped for that
service; the message says which.

## 中文

**面向 AI 智能体的记忆数据库、制品存储与文档编辑 —— 通过 MCP 接入。**

`tunc-mcp` 是一个零依赖的 MCP 客户端，连接三个托管服务，解决多智能体系统里最常见的问题：

| 服务 | 用途 | 接入点 |
|---|---|---|
| **Tunc Orb** | **智能体记忆数据库** —— 持久保存记录、日志与结构化状态，可在所有智能体之间共享 | `https://mcp.tuncorb.com/mcp` |
| **Tunc Art** | **制品存储与文件分享** —— 保存智能体生成的文件，返回私密短链接 | `https://mcp.tuncart.com/mcp` |
| **Tunc Doc** | **文档、表格与幻灯片** —— 可导入导出 DOCX、XLSX、PPTX、PDF | `https://mcp.tuncdoc.com/mcp` |

三个服务同时支持 **MCP**、**A2A**（智能体间通信）与 **REST**，同一个账号即可通用。

### 为什么需要它

多数智能体框架在上下文窗口滚动之后就会丢失状态；两个智能体同时写入会互相覆盖；生成的制品散落在本地磁盘上。这里提供三个朴素可靠的基础能力：

- **能跨越对话的记忆。** 记录跨会话、跨智能体、跨模型持久保存，写入支持 `if_revision` 乐观并发控制。
- **可分享的制品链接。** 上传文件即得到私密短链接，无需配置对象存储。
- **智能体能够真正产出的文档。** 真实的 DOCX、XLSX 与 PPTX，而不是伪装成报告的 Markdown。

### 并发写入

`data_update` 接受 `if_revision`。两个智能体写同一条记录时不会互相覆盖：后到的写入收到 `revision_conflict`，重新读取后重试。这把多智能体最常见的“静默丢更新”故障，变成一个可以被发现的错误。

```bash
npm install tunc-mcp
```

API 密钥：<https://tunchub.com/account/keys/new>（可设为只读）。

完整的多人协作工作空间（人与多个智能体共享同一实时对话）见 <https://tunchub.com>。

## License

MIT © TUNC LLC
