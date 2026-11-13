import assert from 'node:assert/strict';
import test from 'node:test';

import { SERVERS, TuncMcpClient, TuncMcpError, parseBody } from '../src/client.js';

test('parseBody reads a plain JSON body', () => {
  const body = parseBody('application/json', '{"jsonrpc":"2.0","id":1,"result":{"ok":true}}');
  assert.equal(body.result.ok, true);
});

test('parseBody reads the last complete event-stream frame', () => {
  const sse = [
    'event: message',
    'data: {"jsonrpc":"2.0","id":1,"result":{"n":1}}',
    '',
    'event: message',
    'data: {"jsonrpc":"2.0","id":2,"result":{"n":2}}',
    '',
    '',
  ].join('\n');
  assert.equal(parseBody('text/event-stream', sse).result.n, 2);
});

test('parseBody ignores a truncated frame', () => {
  const sse = 'data: {"result":{"n":1}}\n\ndata: {"result":\n';
  assert.equal(parseBody('text/event-stream', sse).result.n, 1);
});

test('the three endpoints are the documented MCP servers', () => {
  assert.equal(SERVERS.orb, 'https://mcp.tuncorb.com/mcp');
  assert.equal(SERVERS.art, 'https://mcp.tuncart.com/mcp');
  assert.equal(SERVERS.doc, 'https://mcp.tuncdoc.com/mcp');
});

test('a missing key fails before any network call', () => {
  const saved = process.env.TUNC_API_KEY;
  delete process.env.TUNC_API_KEY;
  try {
    assert.throws(() => new TuncMcpClient({ service: 'orb' }), TuncMcpError);
  } finally {
    if (saved !== undefined) process.env.TUNC_API_KEY = saved;
  }
});

test('an unknown service is rejected rather than guessed', () => {
  assert.throws(() => new TuncMcpClient({ service: 'nope', apiKey: 'k' }), TuncMcpError);
});

test('callTool sends a JSON-RPC tools/call with the bearer key', async () => {
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init = {}) => {
    seen.push({ url, init });
    const payload = JSON.parse(init.body);
    if (payload.method === 'initialize') {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: { serverInfo: { name: 'orb' } } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'mcp-session-id': 'sess-1' },
      });
    }
    if (payload.method === 'notifications/initialized') return new Response('', { status: 202 });
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: { content: [{ type: 'text', text: 'ok' }] } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  try {
    const client = new TuncMcpClient({ service: 'orb', apiKey: 'test-key' });
    const text = await client.callText('data_read', { name: 'contacts/ada' });
    assert.equal(text, 'ok');

    const call = seen.at(-1);
    assert.equal(call.url, SERVERS.orb);
    assert.equal(call.init.headers.authorization, 'Bearer test-key');
    assert.equal(call.init.headers['mcp-session-id'], 'sess-1');
    const payload = JSON.parse(call.init.body);
    assert.equal(payload.method, 'tools/call');
    assert.deepEqual(payload.params, { name: 'data_read', arguments: { name: 'contacts/ada' } });
  } finally {
    globalThis.fetch = original;
  }
});

test('a 401 becomes a readable TuncMcpError', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"error":{"code":-32001,"message":"Add your Tunc API key"}}', {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
  try {
    const client = new TuncMcpClient({ service: 'orb', apiKey: 'bad' });
    await assert.rejects(() => client.initialize(), (error) => {
      assert.ok(error instanceof TuncMcpError);
      assert.equal(error.status, 401);
      return true;
    });
  } finally {
    globalThis.fetch = original;
  }
});
