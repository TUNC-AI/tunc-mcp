#!/usr/bin/env node
// tunc-mcp — inspect and call the Tunc MCP servers from a terminal.
//
//   export TUNC_API_KEY=tunc_...
//   npx tunc-mcp tools --service orb
//   npx tunc-mcp call data_read '{"name":"contacts/ada"}'

import { SERVERS, TuncMcpClient, TuncMcpError } from '../src/client.js';

const USAGE = `tunc-mcp — MCP client for Tunc Orb, Tunc Art and Tunc Doc

Usage:
  tunc-mcp services
  tunc-mcp tools   [--service orb|art|doc] [--json]
  tunc-mcp call <tool> [json-args] [--service orb|art|doc]

Environment:
  TUNC_API_KEY   required. Create one at https://tunchub.com/account/keys/new
`;

function parseArgs(argv) {
  const args = { _: [], service: 'orb', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--service') args.service = argv[++i];
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else args._.push(arg);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [command, ...rest] = args._;

  if (args.help || !command || command === 'services') {
    if (command === 'services') {
      console.log(JSON.stringify(SERVERS, null, 2));
      return;
    }
    console.log(USAGE);
    return;
  }

  const client = new TuncMcpClient({ service: args.service });

  if (command === 'tools') {
    const tools = await client.listTools();
    if (args.json) {
      console.log(JSON.stringify(tools, null, 2));
      return;
    }
    console.log(`${tools.length} tools on ${args.service} (${client.endpoint})\n`);
    for (const tool of tools) {
      console.log(`  ${tool.name}${tool.description ? ` — ${tool.description.split('.')[0]}` : ''}`);
    }
    return;
  }

  if (command === 'call') {
    const [name, rawArgs] = rest;
    if (!name) {
      console.error('call needs a tool name. Run: tunc-mcp tools');
      process.exitCode = 1;
      return;
    }
    let parsed = {};
    if (rawArgs) {
      try {
        parsed = JSON.parse(rawArgs);
      } catch {
        console.error('That is not valid JSON. Quote it, e.g. \'{"name":"x"}\'');
        process.exitCode = 1;
        return;
      }
    }
    const result = await client.callTool(name, parsed);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.error(`Unknown command: ${command}\n`);
  console.log(USAGE);
  process.exitCode = 1;
}

main().catch((error) => {
  if (error instanceof TuncMcpError) {
    console.error(`tunc-mcp: ${error.message}`);
    if (error.status) console.error(`  HTTP ${error.status}`);
  } else {
    console.error(`tunc-mcp: ${error.message}`);
  }
  process.exitCode = 1;
});
