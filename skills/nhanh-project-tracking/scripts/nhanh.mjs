#!/usr/bin/env node
// Command-line client of the tracker. No dependencies; Node.js 22+.
//
//   node nhanh.mjs actions                           every action with its arguments
//   node nhanh.mjs digest <projectId>                what to read when a session starts
//   node nhanh.mjs tree <projectId>                  the whole plan as text
//   node nhanh.mjs <action> key=value ...            short arguments
//   node nhanh.mjs <action> --file request.json      long or multi-line arguments ({...arguments})
//   node nhanh.mjs <action> --stdin                  the same from standard input
//
// Options: --actor <name> (or NHANH_ACTOR), --request <id> (safe retry), --raw (full JSON instead of text).
// NHANH_URL changes the server (default http://127.0.0.1:5173). Errors go to stderr with exit code 1.
// For agents that speak MCP, nhanh-mcp.mjs serves the same actions as tools.
import fs from 'node:fs';
import { actions, call } from './client.mjs';
import { resultText } from './text.mjs';

function parseCommandLine(argv) {
  const out = { action: undefined, args: {}, positional: [], actor: process.env.NHANH_ACTOR, requestId: undefined, raw: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--raw') out.raw = true;
    else if (a === '--actor') out.actor = argv[++i];
    else if (a === '--request') out.requestId = argv[++i];
    else if (a === '--file') Object.assign(out.args, JSON.parse(fs.readFileSync(argv[++i], 'utf8').replace(/^﻿/, '')));
    else if (a === '--stdin') Object.assign(out.args, JSON.parse(fs.readFileSync(0, 'utf8')));
    else if (a === '--json') Object.assign(out.args, JSON.parse(argv[++i]));
    else if (/^[A-Za-z]+=/.test(a)) {
      const [key, ...rest] = a.split('=');
      const text = rest.join('=');
      // check=1,2 or labels=a,b style lists are not guessed: use JSON for anything that is not plain text.
      try { out.args[key] = /^(\[|\{|true$|false$|null$|-?\d+(\.\d+)?$)/.test(text) ? JSON.parse(text) : text; } catch { out.args[key] = text; }
    } else if (out.action === undefined) out.action = a; // options may come before or after the action
    else out.positional.push(a);
  }
  return out;
}

async function main() {
  const cmd = parseCommandLine(process.argv.slice(2));
  if (!cmd.action || cmd.action === 'help' || cmd.action === '--help') {
    console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 13).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return undefined;
  }
  if (cmd.action === 'actions') {
    const list = await actions();
    if (cmd.raw) return console.log(JSON.stringify(list, null, 2));
    for (const a of list) {
      const args = Object.entries(a.arguments).map(([k, v]) => (v.includes('required') ? k : `${k}?`)).join(', ');
      console.log(`${a.name}(${args})${a.readOnly ? '  [read]' : ''}${a.audience && a.audience !== 'agent' ? `  [${a.audience} only]` : ''}\n    ${a.description}`);
    }
    return undefined;
  }
  // Shortcuts that take the project id as a plain word.
  let name = cmd.action;
  if (name === 'digest' || name === 'tree') {
    if (cmd.positional[0]) cmd.args.projectId = cmd.positional[0];
    name = name === 'tree' ? 'project.get' : 'digest';
  }
  const { result, seq } = await call(name, cmd.args, cmd);
  if (cmd.raw) return console.log(JSON.stringify({ seq, result }, null, 2));
  return console.log(resultText(name, result));
}

main().catch((e) => { console.error(`nhanh: ${e.message}`); process.exitCode = 1; });
