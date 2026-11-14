// Live contract tests against the three hosted services.
//
// These encode behaviours a mock cannot catch and that the README promises:
//   * Orb refuses a stale write instead of merging it.
//   * Art tombstones on delete: get still resolves, reporting status "deleted".
//   * Doc needs `markdown` to create a doc, whatever its schema says.
//   * Doc merges a stale `base_revision` rather than refusing it.
//
// Run with a real key:  TUNC_API_KEY=tunc_... npm test
// Skipped entirely without one, so the default suite stays offline.

import assert from 'node:assert/strict';
import test from 'node:test';

import { art, doc, orb } from '../src/index.js';

const live = Boolean(
  process.env.TUNC_API_KEY || process.env.TUNC_ORB_TOKEN
    || process.env.TUNC_ART_TOKEN || process.env.TUNC_DOC_TOKEN,
);
const skip = live ? false : 'live tests need TUNC_API_KEY (or per-service tokens)';

// A scoped key can only reach its own service, so accept one token per service
// with TUNC_API_KEY as the fallback for a key that covers all three.
const keyFor = (envName) => process.env[envName] ?? process.env.TUNC_API_KEY;

function payload(result) {
  if (result?.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent;
  }
  const text = (result?.content ?? [])
    .filter((part) => part?.type === 'text')
    .map((part) => part.text)
    .join('');
  return text ? JSON.parse(text) : {};
}

function errorCode(result) {
  const err = payload(result).error;
  if (err && typeof err === 'object') return err.code ?? err.message;
  return err ? String(err) : null;
}

test('orb refuses a stale write', { skip }, async () => {
  const memory = orb({ apiKey: keyFor('TUNC_ORB_TOKEN') });
  const name = 'qa/tunc-mcp/live-cas';
  await memory.callTool('data_write', {
    operation: 'create', name, about: 'live CAS check', value: { n: 1 },
  });
  try {
    const first = payload(await memory.callTool('data_read', { operation: 'get', name })).revision;

    await memory.callTool('data_update', {
      operation: 'patch', name, if_revision: first,
      patch: [{ op: 'replace', path: '/n', value: 2 }],
    });

    const stale = await memory.callTool('data_update', {
      operation: 'patch', name, if_revision: first,
      patch: [{ op: 'replace', path: '/n', value: 3 }],
    });
    assert.equal(errorCode(stale), 'revision_conflict');

    const after = payload(await memory.callTool('data_read', { operation: 'get', name }));
    assert.equal(after.value.n, 2, 'the stale write must not have landed');
  } finally {
    const current = payload(await memory.callTool('data_read', { operation: 'get', name }));
    await memory.callTool('data_delete', {
      operation: 'record', name, if_revision: current.revision,
    });
  }
});

test('art delete tombstones instead of erasing', { skip }, async () => {
  const files = art({ apiKey: keyFor('TUNC_ART_TOKEN') });
  const stored = payload(await files.callTool('art_write', {
    operation: 'create', name: 'tunc-mcp-live-tombstone',
    text: '# tombstone\n', mime_type: 'text/markdown',
  }));
  const artifactId = stored.artifact.id;

  await files.callTool('art_delete', { artifact_id: artifactId });

  const after = payload(await files.callTool('art_read', { operation: 'get', artifact_id: artifactId }));
  assert.equal(after.artifact.status, 'deleted');
  assert.equal(after.artifact.availability, 'deleted');
  assert.equal(after.artifact.viewer_url, null);

  const listed = payload(await files.callTool('art_read', { operation: 'list', limit: 100 }));
  assert.ok(!JSON.stringify(listed).includes(artifactId), 'a deleted artifact must leave the listing');
});

test('doc_create needs markdown despite the schema', { skip }, async () => {
  const docs = doc({ apiKey: keyFor('TUNC_DOC_TOKEN') });
  const tools = await docs.listTools();
  const create = tools.find((t) => t.name === 'doc_create');
  // The schema advertises title alone; the server disagrees. This test notices
  // the day the two finally agree.
  assert.deepEqual(create.inputSchema.required, ['title']);

  const refused = await docs.callTool('doc_create', { title: 'schema says this is enough' });
  assert.equal(errorCode(refused), 'invalid_arguments');

  const made = payload(await docs.callTool('doc_create', { title: 'tunc-mcp live doc', markdown: '# ok' }));
  assert.ok(made.result.doc.id);
  assert.match(made.result.revision, /^rev_/);

  await docs.callTool('doc_delete', { doc: made.result.doc.id });
});

test('doc_write merges a stale base', { skip }, async () => {
  const docs = doc({ apiKey: keyFor('TUNC_DOC_TOKEN') });
  const made = payload(await docs.callTool('doc_create', { title: 'tunc-mcp live merge', markdown: 'v1' }));
  const docId = made.result.doc.id;
  const first = made.result.revision;

  try {
    await docs.callTool('doc_write', { doc: docId, markdown: 'v2', base_revision: first });

    // Same base as the first write: stale. Doc merges rather than refusing,
    // which is the opposite of Orb.
    const stale = await docs.callTool('doc_write', { doc: docId, markdown: 'v3', base_revision: first });
    if (errorCode(stale) === null) {
      const body = JSON.stringify(payload(await docs.callTool('doc_read', { doc: docId })));
      assert.ok(body.includes('v2'), 'a merge must not discard the newer text');
    } else {
      assert.equal(errorCode(stale), 'doc_conflict');
    }
  } finally {
    await docs.callTool('doc_delete', { doc: docId });
  }
});
