# Nhánh — bảng điều khiển dự án cho người và agent

Dịch vụ chạy trên máy (local) để một người theo dõi nhiều agent tự làm việc: mỗi dự án có kế hoạch theo mốc, biết
agent nào đang làm gì, việc nào xong kèm bằng chứng, và việc nào đang chờ bạn. Agent ghi qua API hoặc CLI; bạn đọc,
trả lời câu hỏi và thêm yêu cầu trên web UI. Không có cloud, không có chat.

## Khởi động

Node.js 22.12+ hoặc 24+:

```sh
npm ci
npm run build
npm start
```

Mở http://127.0.0.1:5173. Dịch vụ chỉ lắng nghe 127.0.0.1. `PORT` đổi cổng; `NHANH_DATA_DIR` đổi thư mục dữ liệu
(mặc định `.local/` trong repo). Mỗi thư mục dữ liệu chỉ chạy một server. `npm run dev` chạy cùng API với hot reload.

## Web UI

- **Tổng quan**: mỗi dự án một thẻ: giai đoạn, tiến độ, số việc theo trạng thái, việc đang làm và ai làm, số việc
  cần bạn, hoạt động gần nhất.
- **Cần bạn**: câu hỏi agent gửi (trả lời ngay tại chỗ), việc bị chặn, và những gì bạn đã gửi mà agent chưa nhận.
- **Dự án → Kế hoạch**: cây mốc → việc → việc con, có trạng thái, cỡ S/M/L, người làm, tiêu chí đã đạt, nhãn
  "agent thêm" / "bạn yêu cầu". Ô trên cùng để gõ yêu cầu mới cho agent. Bấm một việc để mở chi tiết: mô tả, tiêu
  chí nghiệm thu, kết quả và bằng chứng, câu hỏi, nhật ký.
- **Nhật ký**: mọi thay đổi theo ngày: ai, lúc nào, làm gì, bằng chứng.
- **Ghi chú**: Markdown của dự án (mục tiêu, phạm vi, liên kết tới GDD trong repo).

Trang tự cập nhật ngay khi agent ghi (server-sent events).

## Mô hình

- **Dự án**: `id`, tên, giai đoạn (`idea`, `brief`, `gdd`, `playtest`, `production`, `release`, `live`), ghi chú.
- **Nhóm** (mốc) chỉ chứa việc; trạng thái và tiến độ của nó tính từ các việc bên trong.
- **Việc**: cỡ `S`/`M`/`L`, trạng thái `todo` / `doing` / `blocked` / `done` / `dropped`, tiêu chí nghiệm thu,
  người làm (`owner`), chuyên gia (`agent`), nhánh git, kết quả và bằng chứng, câu hỏi cho bạn, nguồn gốc
  (`plan` / `user` / `agent` kèm lý do).
- **Tiến độ** tính theo cỡ (S = 1, M = 3, L = 8). Việc đang làm được tính theo tỉ lệ tiêu chí đã đạt, tối đa 90%;
  chỉ `done` mới là 100%. Việc đã bỏ không tính.
- **Nhật ký**: mỗi hành động ghi một dòng (5.000 dòng gần nhất).

## Agent

Agent không sửa trường dữ liệu; nó báo việc gì đã xảy ra, tracker giữ trạng thái nhất quán:

| Hành động | Ý nghĩa |
|---|---|
| `digest` | Đọc đầu phiên: hộp thư (bạn vừa viết gì), việc đang làm, bị chặn, việc tiếp theo |
| `plan.apply` | Lập hoặc bổ sung kế hoạch trong một lần gọi; gọi lại an toàn, không xoá gì |
| `task.start` / `task.progress` / `task.done` | Bắt đầu, báo tiến độ (tick tiêu chí), đóng kèm tóm tắt và bằng chứng |
| `task.add` | Việc phát sinh; agent phải ghi lý do |
| `task.ask` / `task.answer` / `task.ack` | Agent hỏi, bạn trả lời, agent xác nhận đã đọc |
| `task.block` / `task.unblock` / `task.release` / `task.reopen` / `task.drop` | Chặn, gỡ chặn, trả lại, mở lại, bỏ |
| `project.log` | Một dòng nhật ký cho thay đổi nhỏ không cần task |

`task.done` bị từ chối khi còn tiêu chí chưa tick (trừ khi ghi `unmet`) hoặc khi việc cỡ M/L không có bằng chứng.
Agent khác không sửa được việc đang do một agent làm (HTTP 409), trừ khi `takeover`. Chỉ bạn mới xoá được.

CLI (không cần thư viện ngoài):

```sh
node scripts/nhanh.mjs actions                      # mọi hành động và tham số
node scripts/nhanh.mjs digest cg01-mortalbound      # đọc đầu phiên
node scripts/nhanh.mjs tree cg01-mortalbound        # cả kế hoạch dạng chữ
node scripts/nhanh.mjs task.start taskId=hub branch=task/hub --actor claude-cg01
node scripts/nhanh.mjs plan.apply --file plan.json --actor claude-cg01
```

Quy tắc đầy đủ cho agent (lập kế hoạch ban đầu, việc phát sinh, báo cáo, nhiều agent) nằm trong skill:
[SKILL.md](skills/nhanh-project-tracking/SKILL.md) và [rules.md](skills/nhanh-project-tracking/references/rules.md).

## Giao thức HTTP

- `GET /api/health` → `{ok, service: "nhanh-local", apiVersion: 2}` (không cần token).
- `GET /api/session` → `{token}`; mọi lời gọi khác gửi header `X-Nhanh-Token`.
- `GET /api/actions` → danh sách hành động và tham số.
- `POST /api/call` với `{name, arguments, actor, requestId}` → `{seq, result}`. `actor` bắt buộc khi ghi;
  `requestId` giúp gọi lại an toàn (cùng actor, cùng tham số trả về kết quả lần đầu).
- `GET /api/stream?token=…` → server-sent events, một sự kiện `change` cho mỗi lần ghi.
- Lỗi: `{error}` với HTTP 400 (tham số), 403 (token, origin, quyền), 404, 409 (việc của agent khác, trùng requestId).

Chỉ nhận request từ localhost và từ chính trang do server phục vụ. Mọi tiến trình trên máy đều lấy được token:
`actor` là nhãn để phối hợp, không phải xác thực.

## Dữ liệu

- `.local/workspace.json`: toàn bộ dữ liệu (phiên bản 2), ghi atomic, từng lần ghi một.
- `.local/workspace.backup.json`: trạng thái trước lần ghi gần nhất.
- `.local/workspace.v1.json`: file của bản 1.x, giữ nguyên sau khi tự chuyển đổi ở lần chạy đầu của bản 2.
  Bản 2 không còn ý tưởng, ảnh/ghi âm đính kèm, màu tag, trình chạy audit AI và trình soạn design document dạng cây;
  ghi chú task thành mô tả, tên tag thành nhãn, design document thành Ghi chú của dự án.
- `.local/` được gitignore và không bao giờ được phục vụ qua HTTP. Sao lưu cả thư mục trước khi cập nhật.

## Kiểm tra

```sh
npm test
npm run build
```

Test chạy server HTTP thật trên thư mục tạm: token và origin, vòng đời một việc, bằng chứng bắt buộc, quyền giữa các
agent, hộp thư, ghi đồng thời, luồng sự kiện, CLI, chuyển đổi dữ liệu bản 1.

## Skill cho agent

`skills/nhanh-project-tracking` là skill phát hành kèm CLI. Cài cho Claude Code:
`node scripts/install-skill.mjs --target ~/.claude/skills`; cho Codex: `node scripts/install-skill.mjs`. Trình cài
không ghi đè bản đã có: dời bản cũ đi trước khi nâng cấp. Đóng gói: `python scripts/package-skill.py`.
