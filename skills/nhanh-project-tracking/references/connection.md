# Connecting to the tracker

The client in this skill needs only Node.js and a tracker running on the same machine. It does not depend on where
the tracker's repository is.

- Check: `GET http://127.0.0.1:5173/api/health` answers `{"ok":true,"service":"nhanh-local","apiVersion":2}`.
  Another service on that port: send nothing to it; use the `NHANH_URL` the project names.
- `apiVersion` 1: the server is the old version; this skill (2.x) does not work with it. Update the server.
- Not running: the tracker is optional. Carry on with the work, do not track this session, and say in your
  closing message that the tracker did not answer. Start it only when the project's instructions say how and that
  you may (for example a setup script of the workspace). In its repository that is `npm ci`, `npm run build`,
  `npm start`.
- One server per data folder. Never start a second one, never point a new server at an empty folder to get
  around a lock, never edit `.local/` files: all changes go through the actions.
- An agent running in a container or on another machine cannot reach the host's loopback address.

Settings: `PORT` and `NHANH_DATA_DIR` for the server; `NHANH_URL` and `NHANH_ACTOR` for the client.

A repository binds itself to a project in its own instructions or config, for example:

```yaml
tracker:
  project_id: "cg01-mortalbound"
  actor: "claude-cg01"
```
