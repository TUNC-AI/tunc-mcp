// Convenience layer over the three Tunc MCP servers.
//
// Tunc Orb — agent memory database: durable records and logs for agents and
//            agent swarms, revision-guarded so concurrent writers cannot clobber.
// Tunc Art — artifact storage and private file sharing: agent-generated files
//            with short private links.
// Tunc Doc — documents, spreadsheets and slide decks, import/export DOCX,
//            XLSX, PPTX and PDF.

import { SERVERS, TuncMcpClient, TuncMcpError, parseBody } from './client.js';

export { SERVERS, TuncMcpClient, TuncMcpError, parseBody };

export function orb(options = {}) {
  return new TuncMcpClient({ service: 'orb', ...options });
}

export function art(options = {}) {
  return new TuncMcpClient({ service: 'art', ...options });
}

export function doc(options = {}) {
  return new TuncMcpClient({ service: 'doc', ...options });
}

/** All three clients from one key. */
export function connect(apiKey = process.env.TUNC_API_KEY) {
  return {
    orb: orb({ apiKey }),
    art: art({ apiKey }),
    doc: doc({ apiKey }),
  };
}
