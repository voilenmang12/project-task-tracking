# Project instructions

This repository is a local API and human UI for shared project/task tracking.

- Read `docs/AGENT_WORKFLOW.md` before using the tracker to manage project work.
- Run `npm test` and `npm run build` for changes affecting the service/UI.
- Preserve existing `.local` user data. Do not commit private data, API keys, tokens or audit outputs.
- Do not deploy to cloud hosting. Use `npm start` (API + built UI), or `npm run dev` for development.
- Gemini/Google API keys may only be used for TTS. Use agy or explicitly authorized Codex CLI for non-TTS AI; never fall back to Gemini API.
- No chat agent feature. Keep audit of projects, design documents and tasks.
- External agents should update through the documented API/CLI, not by editing storage files.
