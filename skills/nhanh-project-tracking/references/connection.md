# Connecting to the local service

The client in this skill is portable: it only needs Node.js and a running Nhánh service on the same machine. It does not depend on where the tracker source repository is installed.

Check `GET http://127.0.0.1:5173/api/health`; expect `service: nhanh-local`. If another service owns that port, do not send project data to it. Use the configured NHANH_URL instead.

If Nhánh is stopped and its repository location is known, start it from that repository:

```sh
npm ci
npm run build
npm start
```

Keep the process running. If already installed and built, only `npm start` is needed. Do not start a second server on the same data directory. For a new install use the source release at https://github.com/voilenmang12/project-task-tracking, install dependencies and build locally. Do not clone/install elsewhere unless that setup is part of the user's task.

Server configuration: `PORT` changes the port; `NHANH_DATA_DIR` changes the private data directory. Client configuration: `NHANH_URL` changes the HTTP localhost endpoint. Keep them consistent. Do not create a new empty data directory to get around a data lock.

A repository may record the project binding in its agent instructions:

```text
Use the nhanh-project-tracking skill.
Nhánh URL: http://127.0.0.1:5173
Nhánh projectId: the-actual-project-id
Actor: codex-product
```

For agy or another agent that does not discover the installed skill automatically, ask it to read the absolute path to SKILL.md and follow it. No claim is made that an arbitrary agent's skill discovery path is configured by installing this folder.
