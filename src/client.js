// Minimal MCP (Model Context Protocol) client over streamable HTTP.
//
// It speaks just enough of the protocol to talk to the Tunc servers: initialize,
// tools/list and tools/call, with JSON-RPC 2.0 envelopes and event-stream
// responses. No dependencies; Node 18+ fetch only.
//
// Servers:
//   Tunc Orb  https://mcp.tuncorb.com/mcp   agent memory database
//   Tunc Art  https://mcp.tuncart.com/mcp   artifact storage, private links
//   Tunc Doc  https://mcp.tuncdoc.com/mcp   documents, spreadsheets, decks

export const SERVERS = Object.freeze({
  orb: 'https://mcp.tuncorb.com/mcp',
  art: 'https://mcp.tuncart.com/mcp',
  doc: 'https://mcp.tuncdoc.com/mcp',
});

export class TuncMcpError extends Error {
  constructor(message, { code, status, body } = {}) {
    super(message);
    this.name = 'TuncMcpError';
    this.code = code;
    this.status = status;
    this.body = body;
  }
}

/**
 * Pull the JSON-RPC payload out of an event-stream body, or a plain JSON body.
 * Streamable HTTP lets a server answer either way; Tunc answers JSON, other
 * MCP servers may answer text/event-stream, so both are handled.
 */
export function parseBody(contentType, text) {
  if (!text) return null;
  if (!/text\/event-stream/i.test(contentType ?? '')) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  let last = null;
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) continue;
    try {
      last = JSON.parse(data);
    } catch {
      // A partial frame: keep the previous complete one.
    }
  }
  return last;
}

export class TuncMcpClient {
  #endpoint;
  #apiKey;
  #sessionId = null;
  #nextId = 1;
  #initialized = false;

  constructor({ service = 'orb', endpoint, apiKey }) {
    this.#endpoint = endpoint ?? SERVERS[service];
    if (!this.#endpoint) {
      throw new TuncMcpError(`Unknown service "${service}". Use orb, art or doc, or pass an endpoint.`);
    }
    this.#apiKey = apiKey ?? process.env.TUNC_API_KEY;
    if (!this.#apiKey) {
      throw new TuncMcpError(
        'No API key. Pass apiKey or set TUNC_API_KEY. Create one at https://tunchub.com/account/keys/new',
      );
    }
  }

  get endpoint() {
    return this.#endpoint;
  }

  async #post(payload) {
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${this.#apiKey}`,
    };
    if (this.#sessionId) headers['mcp-session-id'] = this.#sessionId;

    const response = await fetch(this.#endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const session = response.headers.get('mcp-session-id');
    if (session) this.#sessionId = session;

    const text = await response.text();
    const body = parseBody(response.headers.get('content-type'), text);

    if (response.status === 401) {
      // The server knows why it refused: missing key, revoked, or wrong scope.
      // Keep its words and add ours, rather than replacing a specific answer
      // with a generic one.
      const server = body?.error?.message;
      throw new TuncMcpError(
        server
          ? `${server} (the API key is missing, revoked, or not scoped for this service)`
          : 'Unauthorized. The API key is missing, revoked, or not scoped for this service.',
        { status: 401, code: body?.error?.code, body },
      );
    }

    if (!response.ok) {
      throw new TuncMcpError(body?.error?.message ?? `HTTP ${response.status}`, {
        status: response.status,
        code: body?.error?.code,
        body,
      });
    }

    if (body?.error) {
      throw new TuncMcpError(body.error.message ?? 'JSON-RPC error', {
        code: body.error.code,
        status: response.status,
        body,
      });
    }

    return body?.result;
  }

  async #rpc(method, params) {
    return this.#post({ jsonrpc: '2.0', id: this.#nextId++, method, params });
  }

  async initialize() {
    if (this.#initialized) return this;
    const result = await this.#rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'tunc-mcp', version: '0.1.0' },
    });
    // Notifications carry no id and expect no body.
    await fetch(this.#endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${this.#apiKey}`,
        ...(this.#sessionId ? { 'mcp-session-id': this.#sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    }).catch(() => {});
    this.serverInfo = result?.serverInfo ?? null;
    this.capabilities = result?.capabilities ?? null;
    this.#initialized = true;
    return this;
  }

  async listTools() {
    await this.initialize();
    const result = await this.#rpc('tools/list', {});
    return result?.tools ?? [];
  }

  async callTool(name, args = {}) {
    await this.initialize();
    return this.#rpc('tools/call', { name, arguments: args });
  }

  /** Convenience: the text content of a tool result, joined. */
  async callText(name, args = {}) {
    const result = await this.callTool(name, args);
    const parts = Array.isArray(result?.content) ? result.content : [];
    const text = parts.filter((p) => p?.type === 'text').map((p) => p.text).join('\n');
    return text || result;
  }
}
