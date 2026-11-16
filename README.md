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
- **Cần bạn**: câu hỏi agent gửi (trả lời ngay tại chỗ), mốc và việc agent đề xuất chờ bạn duyệt, việc bị chặn, và
  những gì bạn đã gửi mà agent chưa nhận.
- **Dự án → Kế hoạch**: cây mốc → việc → việc con, có trạng thái, cỡ S/M/L, người làm, tiêu chí đã đạt, nhãn
  "agent thêm" / "bạn yêu cầu" / "chờ duyệt". Ô trên cùng thêm việc hoặc mốc: Enter để thêm nhanh, "Chi tiết" để
  chọn chỗ đặt, cỡ, mô tả, tiêu chí, nhãn. Nút "+" trên mỗi dòng thêm việc vào bên trong. Kéo-thả một dòng để đổi
  thứ tự hoặc chuyển mốc (Alt+↑/↓ với bàn phím); agent làm theo thứ tự từ trên xuống. Bấm một việc để mở chi tiết:
  vị trí, mô tả, tiêu chí (sửa tại chỗ), nhãn, kết quả và bằng chứng, câu hỏi, nhật ký.
- **Duyệt việc agent thêm** (bật ở đầu trang dự án; dự án tạo trên web bật sẵn): mốc và việc agent thêm bằng
  `plan.apply` hoặc `task.add` hiện "chờ duyệt"; agent không bắt đầu chúng trước khi bạn bấm Duyệt (duyệt một mốc
  là duyệt cả các việc bên trong). Bỏ một đề xuất kèm lý do để agent đọc. Trước khi duyệt có thể sửa, sắp xếp lại.
- **Dự án → Luồng**: màn hình chia đôi, bên trái là cây việc (thêm, lọc, sắp xếp như tab Kế hoạch), bên phải là bảng
  kéo-thả để chạy việc theo thứ tự, kể cả việc nằm ở các nhánh khác nhau của cây; kéo thanh giữa để đổi độ rộng. Kéo
  một dòng của cây sang bảng để tạo node (đã có thì bảng báo và nháy node đó; dòng đã có trên bảng mang nhãn "trong
  luồng"), kéo từ chấm tròn bên phải một ô sang ô khác để nối mũi tên "xong ô này
  mới đến ô kia". Mũi tên từ một mốc nghĩa là chờ cả mốc xong. Ô có nhiều mũi tên vào mặc định chờ **tất cả**, bấm
  nhãn trên ô để đổi thành **một trong**. Bấm mũi tên rồi Delete để xoá; nút lưới sắp xếp tự động. Điền "Giao cho"
  (tên actor của agent, vd `claude-cg01`) rồi bấm **Chạy**: ở đầu mỗi phiên, digest của agent đó đưa ra việc kế tiếp
  đã đủ điều kiện; agent khác không đụng vào việc của luồng. Tracker không tự khởi chạy agent.
  Mũi tên thuộc về chính việc, nên vẫn có hiệu lực ngoài luồng: trong cây, việc đang chờ hiện "chờ N việc trước", và
  mục "Chạy sau" trong chi tiết việc sửa được chúng.
- **Nhật ký**: mọi thay đổi theo ngày: ai, lúc nào, làm gì, bằng chứng.
- **Ghi chú**: Markdown của dự án (mục tiêu, phạm vi, liên kết tới GDD trong repo).

Trang tự cập nhật ngay khi agent ghi (server-sent events).

## Chạy bằng agent

Nút ▶ trên một việc (rê chuột vào dòng, hoặc "Chạy bằng agent" trong chi tiết) và "Chạy bằng agent" trên thanh của
một luồng mở một phiên **Claude Code** (`claude -p`) trong thư mục repo của dự án (`repo`, tính từ thư mục chứa
tracker; `NHANH_WORKSPACE` đổi gốc này). Bạn có thể dặn thêm agent một đoạn ngắn trước khi chạy.

- Phiên đó là trưởng nhánh: tạo nhánh git theo luật của repo, `task.start`, chia việc lớn thành việc con và giao cho
  agent con, báo tiến độ, đóng việc kèm bằng chứng, merge theo luật của repo. Với luồng: làm lần lượt các việc
  `NEXT` của luồng cho tới hết. Không ai trả lời trong lúc chạy: cần quyết định thì `task.ask` kèm phương án mặc
  định rồi làm tiếp; kẹt thì `task.block` rồi dừng.
- Actor của phiên là `run-<n>`, hiện là **Nhánh #n**. Quyền là quyền trong `.claude/settings.json` của repo; lệnh
  ngoài danh sách cho phép bị từ chối chứ không chờ.
- Mỗi repo chạy một lượt một lúc; lượt khác hiện "Chờ lượt" và tự bắt đầu sau.
- **Hiển thị**: mục **Đang chạy** ở thanh bên (số lượt đang chạy), đầu trang dự án, nhãn "Nhánh #n đang chạy" trên
  dòng việc, thẻ trên Tổng quan. Nút **Log** mở nhật ký trực tiếp (lệnh, agent con, lỗi) và báo cáo cuối; **Dừng**
  tắt phiên, việc dở trở về "Chờ làm". Phiên đã xong mở lại được bằng `claude --resume <id>`.
- **Cần trước khi dùng**: `claude` CLI đã đăng nhập (mở terminal, chạy `claude`, gõ `/login`) và thư mục repo đã
  được tin cậy (chạy `claude` trong thư mục đó một lần). Thiếu một trong hai thì lượt chạy báo lỗi kèm cách sửa.
- Khởi động lại tracker không giết phiên đang chạy: tracker theo dõi tới khi nó kết thúc, nhưng không còn đọc được
  log của nó.

## Mô hình

- **Dự án**: `id`, tên, giai đoạn (`idea`, `brief`, `gdd`, `playtest`, `production`, `release`, `live`), ghi chú,
  `review` (bật: việc agent thêm chờ bạn duyệt).
- **Nhóm** (mốc) chỉ chứa việc; trạng thái và tiến độ của nó tính từ các việc bên trong.
- **Mũi tên thứ tự**: `after` (các việc hoặc mốc phải xong trước) và `afterMode` (`all` / `any`) trên mỗi việc hoặc mốc;
  việc trong một mốc cũng chờ theo mũi tên của mốc. Việc đã bỏ không chặn ai. Mũi tên tạo vòng lặp bị từ chối.
- **Luồng**: `id`, tên, các node `{taskId, x, y}`, người được giao (`assignee`), trạng thái `draft` / `running` /
  `paused` (`done` được tính khi mọi việc của luồng đã xong).
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
| `flow.create` / `flow.update` / `flow.delete` | Tạo luồng, sửa node, giao actor, chạy hoặc tạm dừng; chỉ bạn xoá luồng |
| `run.start` / `run.stop` / `runs.list` | Bạn chạy hoặc dừng một phiên Claude Code cho một việc hoặc một luồng; agent không gọi được |
| `task.approve` | Bạn duyệt mục agent đề xuất (cùng các mục bên trong và mốc phía trên); chỉ người dùng gọi được |
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
