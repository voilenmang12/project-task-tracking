// Stands in for `claude -p --output-format stream-json` in the runner tests: reads the prompt on stdin, prints a
// session in stream-json, and ends. FAKE_SLEEP (ms) keeps it running; FAKE_EXIT sets the exit code.
let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', async () => {
  const say = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
  say({ type: 'system', subtype: 'init', session_id: 'fake-session', model: 'fake', cwd: process.cwd() });
  say({ type: 'assistant', message: { content: [{ type: 'text', text: `Actor ${process.env.NHANH_ACTOR}; ${prompt.includes('Run the task') ? 'task' : 'flow'}` }] } });
  say({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'git checkout -b task/x' } }] } });
  const allowed = process.argv[process.argv.indexOf('--allowedTools') + 1] || '';
  say({ type: 'assistant', message: { content: [{ type: 'text', text: `allowed=${allowed}; prompt uses it: ${prompt.includes(allowed.slice(5, -3))}` }] } });
  if (process.env.FAKE_SLEEP) await new Promise((r) => setTimeout(r, Number(process.env.FAKE_SLEEP)));
  if (process.env.FAKE_NOT_LOGGED_IN) {
    say({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in · Please run /login', num_turns: 1 });
    process.exit(1);
  }
  if (process.env.CLAUDECODE) say({ type: 'assistant', message: { content: [{ type: 'text', text: 'LEAKED host session env' }] } });
  const code = Number(process.env.FAKE_EXIT || 0);
  say({ type: 'result', subtype: code ? 'error_during_execution' : 'success', is_error: Boolean(code), result: 'Done: the task is finished on task/x.', num_turns: 3, total_cost_usd: 0.12 });
  process.exit(code);
});
