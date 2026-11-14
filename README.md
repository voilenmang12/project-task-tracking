# Nhánh — local project API & workspace

Dịch vụ local để người và agent cùng quản lý dự án. Web UI giữ cây task, kéo thả, checkbox, tag, ảnh/ghi âm, template Game/Product và design document. Không có chat agent hoặc cloud hosting.

## Khởi động

Node.js 22.12+ hoặc 24+, npm:

```sh
npm install
npm run build
npm start
```

Mở http://127.0.0.1:5173. `npm start` phục vụ cả REST-style tool API và UI đã build, không dùng Vite runtime. `npm run api` tương đương; vẫn chạy API nếu chưa build UI. Khi phát triển dùng `npm run dev` (cùng API, hot reload). Chỉ chạy một server cho một thư mục dữ liệu. `PORT` đổi cổng; `NHANH_DATA_DIR` đặt thư mục dữ liệu của server độc lập. Mặc định `.local` trong repo. Dịch vụ chỉ lắng nghe 127.0.0.1.

## Agent workflow

Xem [hướng dẫn cho agent](docs/AGENT_WORKFLOW.md). Agent có thể gọi HTTP trực tiếp hoặc CLI từ bất kỳ repo nào:

```sh
node E:/GO/project-task-tracking/scripts/nhanh.mjs tools
node E:/GO/project-task-tracking/scripts/nhanh.mjs projects.list
node E:/GO/project-task-tracking/scripts/nhanh.mjs tasks.create --file request.json
```

`tools` trả JSON schema của tất cả tool. File đầu vào có dạng:

```json
{
  "arguments": {"projectId":"PROJECT_ID","title":"Implement player movement","notes":"Arrow keys move; collisions tested","tagIds":["gameplay"]},
  "options": {"actor":"codex-game","requestId":"game-movement-v1"}
}
```

Có thể pipe JSON qua `--stdin`. CLI xuất JSON ra stdout, lỗi ra stderr, exit code 1. `NHANH_URL` đổi URL localhost. CLI lấy session token tự động, không cần copy token/API key.

Nhóm tool:

| Nhóm | Tool |
|---|---|
| Dự án | `projects.list`, `projects.get`, `projects.create`, `projects.update` |
| Document | `documents.get`, `documents.set` |
| Task | `tasks.list`, `tasks.create`, `tasks.update`, `tasks.move`, `tasks.complete`, `tasks.delete` |
| Phối hợp | `tasks.claim`, `tasks.release`, `activity.list` |
| Tiến độ | `progress.get` |
| Tag | `tags.list`, `tags.create`, `tags.update`, `tags.delete` |
| Audit | `audit.check`, `audit.start`, `audit.list`, `audit.cancel`, `audit.apply` |

## Giao thức HTTP

- `GET /api/health`: kiểm tra service, không cần token.
- `GET /api/session`: lấy token local. Không log hoặc commit token.
- `GET /api/tools`: discovery JSON schema.
- `POST /api/tools/call`: `{name, arguments, options}`.
- Các endpoint sau session cần header `X-Nhanh-Token`; body JSON cần `Content-Type: application/json`.
- Tool đọc/ghi dữ liệu trả `{revision,result}`. Audit job trả job/history trực tiếp vì chạy bất đồng bộ.
- Lỗi trả `{error}`, HTTP 400 validation, 403 auth/origin, 404 không tìm thấy, 409 xung đột, 428 thiếu revision.
- `GET/PUT /api/workspace` dành cho UI/import-export. Agent dùng tool để tránh thay toàn workspace.

## Người và nhiều agent cùng làm

- Mỗi mutation được xếp hàng và ghi atomic. Các lệnh sửa/xóa/move/complete/document/apply yêu cầu `options.expectedRevision` lấy từ lần đọc gần nhất. Gặp 409: đọc lại, đánh giá thay đổi rồi thử lại; không ghi đè mù.
- Dùng `options.actor` ổn định để nhận diện agent. Đây là nhãn phối hợp trong máy local, không phải xác thực danh tính.
- `tasks.claim` nhận việc với lease mặc định 30 phút (1–1440 phút), có thể gọi lại để gia hạn. Agent khác không được sửa task đang có claim hợp lệ. `tasks.release` nhả việc. Người dùng vẫn có thể sửa qua UI.
- `requestId` cho phép retry mutation mà không tạo task trùng; phải giữ nguyên actor + arguments. Giữ 1.000 receipt gần nhất. ID task/project do client cung cấp cũng ngăn tạo trùng.
- Trạng thái task: `todo`, `in_progress`, `blocked`, `done`; lý do chặn ở `blockedReason`. Hoàn thành nhánh dùng `tasks.complete`, hoàn thành task lá có thể dùng `tasks.update`.
- UI cập nhật từ server mỗi 2 giây khi không đang sửa/mở document hoặc modal. Lưu UI hợp nhất các trường không xung đột; hai bên sửa cùng trường thì báo lỗi và giữ bản UI để xuất sao lưu. Khi nhận thay đổi ngoài, lịch sử Undo trong tab được reset để tránh hoàn tác công việc của agent.
- Tiến độ task = trung bình các nhánh con trực tiếp, lá = 0/100%. Tiến độ project = trung bình task gốc, mỗi gốc cùng trọng số.
- `activity.list` ghi actor, action, task/project và thời gian (2.000 sự kiện gần nhất). Thay đổi toàn workspace qua UI được ghi `human/workspace.save`.

## Document và audit

Mỗi dự án có document riêng, nhập `.md`/`.txt`, sửa, preview và xuất từ **Design doc & Agents**. Agent ngoài đọc/sửa qua `documents.get/set`. Lưu document trước khi lập roadmap.

Tab **Audit project & task** giữ agy/Codex/both để rà soát document, phạm vi và task, đề xuất bổ sung roadmap/tag. `audit.check` kiểm tra local không gọi AI; `audit.start` chạy CLI thực, `audit.list` xem tiến độ/kết quả. Kết quả chỉ áp dụng khi bạn/agent gọi `audit.apply` hoặc bấm áp dụng. Chống áp dụng trùng và từ document đã thay đổi. CLI audit không triển khai code; agent bên ngoài thực hiện code trong repo riêng rồi cập nhật tiến độ qua API.

Dùng đăng nhập CLI có sẵn. Không sử dụng Gemini/Google API key cho tác vụ AI; môi trường tiến trình audit loại bỏ API key, Codex sandbox read-only, agy plan mode. Mỗi bước tối đa 5 phút; có hủy và lịch sử. Không tự chuyển sang Gemini API khi CLI lỗi.

## Dữ liệu và backup

- `.local/workspace.json`: nguồn dữ liệu chính, revision, projects/tasks/ideas/tags/activity/receipts.
- `.local/workspace.backup.json`: snapshot trước lần ghi gần nhất. Dừng server trước khi phục hồi; giữ bản hiện tại để đối chiếu.
- `.local/projects/<hash>/design.md`, `project.json`, `tasks.json`: bản xuất theo project; không sửa trực tiếp khi server đang chạy.
- `.local/runs/`: snapshot và kết quả audit. Thư mục dự án đã xóa được giữ để khôi phục.
- `.local/server.lock`: ngăn chạy hai server cùng thư mục; kiểm tra PID trước khi thu hồi lock cũ.
- Toàn bộ `.local/` gitignore và không được phục vụ qua HTTP. Sao lưu cả thư mục để giữ dữ liệu và audit. Xuất JSON trong UI giữ workspace; các file audit riêng cần backup thư mục.
- Dữ liệu cũ vẫn được giữ. Các file chat cũ (nếu có) chỉ còn là dữ liệu lưu trữ trên đĩa; không có UI, API hay tiến trình chat sử dụng chúng.

## Kiểm tra

```sh
npm test
npm run build
```

Tests kiểm tra API HTTP thật, token/origin, task tree, progress, lease tranh chấp, revision, retry idempotent, đồng bộ người/agent, lưu đĩa và template. Không tự push hoặc publish.

## Cài skill cho agent

Skill phát hành: **nhanh-project-tracking**, nằm trong `skills/nhanh-project-tracking`.

Từ source repository, cài vào Codex:

```sh
node scripts/install-skill.mjs
```

Mặc định dùng `$CODEX_HOME/skills` hoặc `~/.codex/skills`. Chỉ định thư mục skill khác bằng `--target <skills-directory>`. Installer không ghi đè skill đã có; xem và di chuyển bản cũ trước khi nâng cấp. Mở phiên agent mới để skill được phát hiện.

Hoặc tải `nhanh-project-tracking-v1.1.0.zip` từ [GitHub Releases](https://github.com/voilenmang12/project-task-tracking/releases), kiểm tra hash bằng `SHA256SUMS.txt`, rồi giải nén thư mục `nhanh-project-tracking` vào thư mục skills. Không cần clone repo chỉ để sử dụng client; server Nhánh vẫn cần chạy trên cùng máy.

Codex: gọi `$nhanh-project-tracking`, cung cấp projectId của dự án cần làm. Với agy, yêu cầu đọc file `SKILL.md` theo đường dẫn đã giải nén nếu môi trường không tự khám phá skill. Gói không tự sửa cấu hình của agy hoặc khởi động server. Trong hướng dẫn của mỗi repo, lưu projectId, URL localhost và actor để agent kết nối đúng dự án.

Ví dụ yêu cầu:

```text
Dùng skill nhanh-project-tracking. Project ID: <id thực tế>, actor: codex-my-game.
Đọc design document, nhận task tiếp theo, triển khai trong repo này,
chạy test và cập nhật tiến độ có bằng chứng lên Nhánh.
```

Gói gồm SKILL.md, metadata Codex, CLI Node.js không cần thư viện ngoài và tài liệu kết nối/call. Không chứa dữ liệu dự án, token, dependency hay file build. Người dùng còn có thể gọi CLI trực tiếp từ thư mục skill.

Đóng gói lại: `python scripts/package-skill.py`; artifact được tạo trong `.local/releases/<version>/` và không đưa vào Git.
