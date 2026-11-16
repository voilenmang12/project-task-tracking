# v2.4.1 — runs that can report, and say when they did not finish

Found by the first real runs with the Claude Code CLI.

**Fixed**
- A run could not call the tracker: in print mode the CLI refused `node …/nhanh.mjs` (and any command chained with
  `;` or using shell variables) when the repository's settings did not pre-approve it. A run now gets
  `--allowedTools "Bash(node <nhanh.mjs>:*)"` for exactly the tracker CLI, its reporting channel, and is told to call
  it one command at a time. Nothing in the repository is widened.
- A run whose session ended well was "Xong" even when its task was not done. It is now "Chưa xong" (`unfinished`)
  unless its task, or every task of its flow, is done.
- A command refused by the permissions now adds a plain hint to the log and to the error, like a missing sign-in or
  an untrusted folder.
