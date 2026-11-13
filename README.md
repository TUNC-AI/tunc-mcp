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

## Use

```js
import { orb, art, doc } from 'tunc-mcp';

const memory = orb(); // reads TUNC_API_KEY

// Agent memory: durable records, revision-guarded
await memory.callTool('data_write', {
  name: 'contacts/ada',
  about: 'Primary contact, Example Ltd',
  value: { email: 'ada@example.com', timezone: 'Europe/London' },
});

// Artifacts: store a file, get a private link
const files = art();
await files.callTool('art_write', {
  title: 'quarterly-report.pdf',
  mime_type: 'application/pdf',
  content_base64: base64Bytes,
});

// Documents: build something a human can open and edit
const docs = doc();
await docs.callTool('doc_create', {
  title: 'Q4 summary',
  markdown: '# Q4\n\nRevenue up 12%.',
});
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
