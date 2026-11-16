// Writes skills/nhanh-project-tracking/scripts/actions.json: the actions an agent may call, with their schemas.
// The MCP server lists its tools from it when the tracker does not answer. Run after changing an action:
//   npm run skill:actions        (a test fails while the copy is out of date)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { definitions } from '../server/actions.js';

export const agentActions = () => definitions.filter((a) => a.audience === 'agent');
export const snapshotFile = fileURLToPath(new URL('../skills/nhanh-project-tracking/scripts/actions.json', import.meta.url));
export const render = () => `${JSON.stringify(agentActions(), null, 2)}\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(snapshotFile, render());
  console.log(`${agentActions().length} actions written to ${snapshotFile}`);
}
