# Nhánh — bảng điều khiển dự án cho người và agent

Dịch vụ chạy trên máy (local) để một người lên kế hoạch cùng agent và theo dõi nhiều agent tự làm việc: mỗi dự án có
kế hoạch theo mốc, luồng chạy theo thứ tự, biết agent nào đang làm gì, việc nào xong kèm bằng chứng, và việc nào đang
chờ bạn. Bạn chat với agent trong Claude Code; agent ghi kế hoạch, tiến độ và báo cáo lên tracker qua API hoặc CLI;
bạn duyệt, sắp xếp, chạy và dừng trên web UI. Không có cloud; tracker không có khung chat riêng.

## Khởi động

Node.js 22.12+ hoặc 24+:

```sh
npm ci
npm run build
npm start
```

Mở http://127.0.0.1:5173. Dịch vụ chỉ lắng nghe 127.0.0.1. `PORT` đổi cổng; `NHANH_DATA_DIR` đổi thư mục dữ liệu
(mặc định `.local/` trong repo); `NHANH_WORKSPACE` đổi thư mục gốc chứa các repo dự án (mặc định thư mục chứa repo
này). Mỗi thư mục dữ liệu chỉ chạy một server. `npm run dev` chạy cùng API với hot reload.

## Vòng làm việc với agent

Tracker thay cho plan mode: kế hoạch nằm trên tracker để bạn duyệt dạng luồng, rồi agent chạy nó.

1. **Chat lên kế hoạch** với agent trong Claude Code (mở trong thư mục game). Agent ghi kế hoạch lên tracker bằng một
   lần `plan.apply`: việc có cỡ, tiêu chí, mũi tên thứ tự, và một **luồng đề xuất**. Agent dừng ở đó.
2. **Bạn duyệt** ở tab Luồng (hoặc Cần bạn → "Luồng agent đề xuất"): sửa, nối lại, bỏ bớt, rồi Duyệt.
3. **Chạy**: nói "ok chạy đi" trong chat (agent ghi lại đúng lời bạn rồi tự chạy luồng trong phiên đó), hoặc bấm
   **Chạy bằng agent** (tracker mở một phiên Claude Code chạy ngầm).
4. Agent làm lần lượt các việc kế tiếp: nhánh git, chia việc lớn cho agent con, báo tiến độ, đóng việc kèm bằng chứng.
   Phiên đang làm hiện ở đầu trang dự án và trang **Đang chạy**.
5. **Báo cáo**: mỗi việc có tóm tắt và bằng chứng; cả luồng có **báo cáo tổng** (nút Báo cáo trên luồng; cũng hiện
   trong Nhật ký và trong digest).
6. Vòng sau bắt đầu từ báo cáo đó: chat tiếp, agent mở rộng kế hoạch và đề xuất luồng mới.

Agent không tự chạy một luồng khi bạn chưa đồng ý; lời đồng ý trong chat được trích nguyên văn vào Nhật ký. Muốn đổi
việc đang chạy thì dừng nó trước (xem "Việc đang chạy bị khoá"); khi bạn bảo làm tiếp, agent tiếp tục từ chỗ dừng.

## Web UI

- **Tổng quan**: mỗi dự án một thẻ: giai đoạn, tiến độ, số việc theo trạng thái, việc đang làm và ai làm, số nhánh
  đang chạy, số việc cần bạn, hoạt động gần nhất.
- **Cần bạn**: câu hỏi agent gửi (trả lời ngay tại chỗ), luồng và việc agent đề xuất chờ bạn duyệt, việc bị chặn, và
  những gì bạn đã gửi mà agent chưa nhận.
- **Đang chạy**: các phiên chat đang giữ việc (agent bạn đang trò chuyện trong Claude Code) và các lượt chạy do tracker
  mở, kèm log và nút Dừng; lượt đã xong ở dưới.
- **Dự án → Kế hoạch**: cây mốc → việc → việc con, có trạng thái, cỡ S/M/L, người làm, tiêu chí đã đạt, nhãn
  "agent thêm" / "bạn yêu cầu" / "chờ duyệt" / "chờ N việc trước" / "bạn đã dừng", 🔒 trên việc đang chạy. Ô trên
  cùng thêm việc hoặc mốc: Enter để thêm nhanh, "Chi tiết" để chọn chỗ đặt, cỡ, mô tả, tiêu chí, nhãn. Nút "+" trên
  mỗi dòng thêm việc vào bên trong; ▶ chạy việc đó bằng agent. Kéo-thả một dòng để đổi thứ tự hoặc chuyển mốc
  (Alt+↑/↓ với bàn phím); agent làm theo thứ tự từ trên xuống. Bấm một việc để mở chi tiết: chạy bằng agent, vị trí,
  "Chạy sau" (mũi tên thứ tự), mô tả, tiêu chí (sửa tại chỗ), nhãn, kết quả và bằng chứng, câu hỏi, nhật ký.
- **Duyệt việc agent thêm** (bật ở đầu trang dự án; dự án tạo trên web bật sẵn): mốc và việc agent thêm bằng
  `plan.apply` hoặc `task.add` hiện "chờ duyệt"; agent không bắt đầu chúng trước khi bạn bấm Duyệt (duyệt một mốc
  là duyệt cả các việc bên trong). Bỏ một đề xuất kèm lý do để agent đọc. Trước khi duyệt có thể sửa, sắp xếp lại.
- **Dự án → Luồng**: màn hình chia đôi, bên trái là cây việc, bên phải là bảng kéo-thả để chạy việc theo thứ tự, kể
  cả việc nằm ở các nhánh khác nhau của cây; kéo thanh giữa để đổi độ rộng.
  - Kéo một dòng của cây sang bảng để tạo node (đã có thì bảng báo và nháy node đó).
  - Kéo từ chấm tròn bên phải một ô sang ô khác để nối mũi tên "xong ô này mới đến ô kia". Mũi tên từ một mốc nghĩa
    là chờ cả mốc xong. Ô có nhiều mũi tên vào mặc định chờ **tất cả**; bấm nhãn trên ô để đổi thành **một trong**.
    Bấm mũi tên rồi Delete để xoá; nút lưới sắp xếp tự động.
  - Luồng agent đề xuất có banner "chờ duyệt" với nút Duyệt.
  - **Chạy bằng agent** mở một phiên chạy ngầm cho cả luồng; **Mở cho agent ngoài** chỉ giao luồng cho actor ở ô
    "Giao cho" (agent đó nhận ở phiên Claude Code bạn tự mở); **Dừng** dừng luồng đang chạy.
  - **Báo cáo**: báo cáo tổng của agent, số việc theo trạng thái, từng việc kèm tóm tắt, bằng chứng, chỗ bị chặn,
    câu hỏi, và các lượt chạy của luồng.
  - Mũi tên thuộc về chính việc, nên vẫn có hiệu lực ngoài luồng.
- **Nhật ký**: mọi thay đổi theo ngày: ai, lúc nào, làm gì, bằng chứng; một lần sửa ghi rõ trường nào đổi.
- **Ghi chú**: Markdown của dự án (mục tiêu, phạm vi, liên kết tới GDD trong repo).

Trang tự cập nhật ngay khi agent ghi (server-sent events).

## Việc đang chạy bị khoá

Chỉ **việc đang làm** (hoặc đang có lượt chạy) và những gì bên dưới nó bị khoá: chỉ phiên đang làm sửa được. Bạn hay
agent khác sửa, chuyển, thêm việc con, bỏ, xoá, đánh dấu xong nó, mở lại việc mà nó đang chờ, hay bớt node chứa nó khỏi
luồng: tracker từ chối (423). Ở cấp luồng, đổi người chạy, chuyển về nháp, xoá hay chạy lại luồng đang chạy, và đổi repo
hay lưu trữ dự án khi đang chạy, cũng cần dừng trước. **Phần chưa tới lượt** của luồng đang chạy (sửa, nối mũi tên,
thêm hay bớt node, việc con) đổi được ngay: điều kiện được kiểm tra lại khi agent bắt đầu từng việc. Kéo vị trí node,
đổi tên luồng, trả lời câu hỏi, gỡ chặn và duyệt luôn làm được.

Trên UI, hộp thoại nói cái gì đang chạy; **Dừng rồi làm tiếp** dừng nó (`work.stop`) rồi làm lại thao tác. Dừng một
việc chỉ dừng việc đó (luồng vẫn chạy các việc khác), trừ khi một lượt chạy ngầm đang làm nó: phiên đó tắt và luồng của
nó tạm dừng. Việc dừng trở về "Chờ làm" với nhãn "bạn đã dừng"; agent không ghi tiếp được vào nó. Khi bạn bảo làm tiếp
(trong chat, hoặc bấm Chạy), agent **tiếp tục chứ không làm lại**: `task.start` trả về nhánh cũ, tiêu chí đã đạt, tiến
độ đã ghi và từng thay đổi bạn đã làm từ lúc dừng.

## Chạy bằng agent

Nút ▶ trên một việc (rê chuột vào dòng, hoặc "Chạy bằng agent" trong chi tiết) và "Chạy bằng agent" trên thanh của
một luồng mở một phiên **Claude Code** (`claude -p`) trong thư mục repo của dự án (`repo`, tính từ `NHANH_WORKSPACE`).
Bạn có thể dặn thêm agent một đoạn ngắn trước khi chạy.

- Phiên đó là trưởng nhánh: tạo nhánh git theo luật của repo, `task.start`, chia việc lớn thành việc con và giao cho
  agent con, báo tiến độ, đóng việc kèm bằng chứng, merge theo luật của repo. Với luồng: làm lần lượt các việc
  `NEXT` của luồng cho tới hết rồi ghi báo cáo tổng. Không ai trả lời trong lúc chạy: cần quyết định thì `task.ask`
  kèm phương án mặc định rồi làm tiếp; kẹt thì `task.block` rồi dừng.
- Actor của phiên là `run-<n>`, hiện là **Nhánh #n**. Quyền là quyền trong `.claude/settings.json` của repo; lệnh
  ngoài danh sách cho phép bị từ chối chứ không chờ. Riêng CLI của tracker luôn được phép, để phiên báo cáo được.
- Phiên kết thúc mà việc (hoặc luồng) chưa xong thì lượt chạy là **Chưa xong**: xem việc bị chặn hoặc câu hỏi ở Cần bạn.
- Mỗi repo chạy một lượt một lúc; lượt khác hiện "Chờ lượt" và tự bắt đầu sau.
- **Hiển thị**: mục **Đang chạy** ở thanh bên, đầu trang dự án, nhãn "Nhánh #n đang chạy" trên dòng việc, thẻ trên
  Tổng quan. Nút **Log** mở nhật ký trực tiếp (lệnh, agent con, lỗi) và báo cáo cuối; **Dừng** tắt phiên, việc dở trở
  về "Chờ làm". Phiên đã xong mở lại được bằng `claude --resume <id>`.
- **Cần trước khi dùng**: `claude` CLI đã đăng nhập (mở terminal, chạy `claude`, gõ `/login`) và thư mục repo đã
  được tin cậy (chạy `claude` trong thư mục đó một lần). Thiếu một trong hai thì lượt chạy báo lỗi kèm cách sửa.
- Khởi động lại tracker không giết phiên đang chạy: tracker theo dõi tới khi nó kết thúc, nhưng không còn đọc được
  log của nó.

## Mô hình

- **Dự án**: `id`, tên, giai đoạn (`idea`, `brief`, `gdd`, `playtest`, `production`, `release`, `live`), ghi chú,
  thư mục repo, `review` (bật: việc agent thêm chờ bạn duyệt).
- **Nhóm** (mốc) chỉ chứa việc; trạng thái và tiến độ của nó tính từ các việc bên trong.
- **Việc**: cỡ `S`/`M`/`L`, trạng thái `todo` / `doing` / `blocked` / `done` / `dropped`, tiêu chí nghiệm thu,
  người làm (`owner`), chuyên gia (`agent`), nhánh git, kết quả và bằng chứng, câu hỏi cho bạn, nguồn gốc
  (`plan` / `user` / `agent` kèm lý do), `stopped` khi bạn đã dừng nó.
- **Mũi tên thứ tự**: `after` (các việc hoặc mốc phải xong trước) và `afterMode` (`all` / `any`) trên mỗi việc hoặc mốc;
  việc trong một mốc cũng chờ theo mũi tên của mốc. Việc đã bỏ không chặn ai. Mũi tên tạo vòng lặp bị từ chối.
- **Luồng**: `id`, tên, các node `{taskId, x, y}`, người được giao (`assignee`), trạng thái `draft` / `running` /
  `paused` (`done` được tính khi mọi việc của luồng đã xong), `review: "pending"` khi agent đề xuất, các báo cáo tổng.
- **Lượt chạy**: `run-<n>`, việc hoặc luồng được chạy, repo, lời dặn, trạng thái `queued` / `running` / `stopping` /
  `done` / `unfinished` / `failed` / `stopped` / `interrupted`, phiên Claude Code, báo cáo cuối hoặc lỗi.
- **Tiến độ** tính theo cỡ (S = 1, M = 3, L = 8). Việc đang làm được tính theo tỉ lệ tiêu chí đã đạt, tối đa 90%;
  chỉ `done` mới là 100%. Việc đã bỏ không tính.
- **Nhật ký**: mỗi hành động ghi một dòng (5.000 dòng gần nhất).

## Agent

Agent không sửa trường dữ liệu; nó báo việc gì đã xảy ra, tracker giữ trạng thái nhất quán:

| Hành động | Ý nghĩa |
|---|---|
| `digest` | Đọc đầu phiên: hộp thư (bạn vừa viết gì), các luồng (đề xuất, của mình, báo cáo gần nhất), việc đang làm, bị chặn, việc tiếp theo |
| `plan.apply` | Lập hoặc bổ sung kế hoạch trong một lần gọi, kèm mũi tên và một luồng đề xuất; gọi lại an toàn, không xoá gì |
| `task.start` / `task.progress` / `task.done` | Bắt đầu (việc đã làm dở thì trả về RESUME), báo tiến độ (tick tiêu chí), đóng kèm tóm tắt và bằng chứng |
| `task.add` / `task.update` / `task.move` | Việc phát sinh (agent phải ghi lý do); sửa nội dung và mũi tên; chuyển chỗ |
| `task.ask` / `task.answer` / `task.ack` | Agent hỏi, bạn trả lời, agent xác nhận đã đọc |
| `task.block` / `task.unblock` / `task.release` / `task.reopen` / `task.drop` | Chặn, gỡ chặn, trả lại, mở lại, bỏ |
| `task.approve` | Bạn duyệt mục agent đề xuất (cùng các mục bên trong và mốc phía trên) |
| `flow.create` / `flow.update` / `flow.delete` | Tạo luồng, sửa node, giao actor, chạy (agent cần lời bạn: `userSaid`) hoặc tạm dừng; chỉ bạn xoá luồng |
| `flow.approve` / `flow.report` / `activity` | Bạn duyệt luồng; agent ghi báo cáo tổng của luồng; các phiên chat đang giữ việc |
| `run.start` / `run.stop` / `runs.list` | Bạn chạy hoặc dừng một phiên Claude Code cho một việc hoặc một luồng |
| `work.stop` | Bạn dừng việc hoặc luồng đang chạy để sửa |
| `project.log` | Một dòng nhật ký cho thay đổi nhỏ không cần task |

`task.done` bị từ chối khi còn tiêu chí chưa tick (trừ khi ghi `unmet`) hoặc khi việc cỡ M/L không có bằng chứng.
Agent khác không sửa được việc đang do một agent làm (HTTP 409), trừ khi `takeover`; việc đang chạy chỉ phiên đang
làm sửa được (HTTP 423, kể cả bạn: dừng trước). Chỉ bạn mới xoá, duyệt, chạy và dừng.

CLI (không cần thư viện ngoài):

```sh
node scripts/nhanh.mjs actions                      # mọi hành động và tham số
node scripts/nhanh.mjs digest cg01-mortalbound      # đọc đầu phiên
node scripts/nhanh.mjs tree cg01-mortalbound        # cả kế hoạch dạng chữ
node scripts/nhanh.mjs task.start taskId=hub branch=task/hub --actor claude-cg01
node scripts/nhanh.mjs plan.apply --file plan.json --actor claude-cg01
```

Quy tắc đầy đủ cho agent (vòng làm việc, lập kế hoạch, việc phát sinh, báo cáo, dừng và làm tiếp, nhiều agent) nằm
trong skill: [SKILL.md](skills/nhanh-project-tracking/SKILL.md) và
[rules.md](skills/nhanh-project-tracking/references/rules.md). Tóm tắt: [docs/AGENT_WORKFLOW.md](docs/AGENT_WORKFLOW.md).

## Giao thức HTTP

- `GET /api/health` → `{ok, service: "nhanh-local", apiVersion: 2}` (không cần token).
- `GET /api/session` → `{token}`; mọi lời gọi khác gửi header `X-Nhanh-Token`.
- `GET /api/actions` → danh sách hành động và tham số.
- `POST /api/call` với `{name, arguments, actor, requestId}` → `{seq, result}`. `actor` bắt buộc khi ghi;
  `requestId` giúp gọi lại an toàn (cùng actor, cùng tham số trả về kết quả lần đầu).
- `GET /api/stream?token=…` → server-sent events, một sự kiện `change` cho mỗi lần ghi.
- `GET /api/run-log?id=run-<n>&from=<byte>` → `{text, size}`: log của một lượt chạy từ byte `from`.
- Lỗi: `{error}` với HTTP 400 (tham số), 403 (token, origin, quyền), 404, 409 (việc của agent khác, việc bạn đã dừng,
  trùng requestId), 423 (việc đang chạy; kèm `live: {kind, taskId, flowId, runId, owner, verb}` cho biết cần dừng gì).

Chỉ nhận request từ localhost và từ chính trang do server phục vụ. Mọi tiến trình trên máy đều lấy được token:
`actor` là nhãn để phối hợp, không phải xác thực.

## Dữ liệu

- `.local/workspace.json`: toàn bộ dữ liệu (phiên bản 2), ghi atomic, từng lần ghi một.
- `.local/workspace.backup.json`: trạng thái trước lần ghi gần nhất.
- `.local/runs/run-<n>.log`: log dễ đọc của mỗi lượt chạy.
- File giữ lại khi nâng cấp, mỗi file một lần: `workspace.v1.json` (bản 1.x, chuyển đổi ở lần chạy đầu của bản 2),
  `workspace.v2.0.json` (trước khi có luồng, 2.2.0), `workspace.v2.2.json` (trước khi có lượt chạy, 2.4.0).
  Bản 2 không còn ý tưởng, ảnh/ghi âm đính kèm, màu tag và trình soạn design document dạng cây; ghi chú task thành mô
  tả, tên tag thành nhãn, design document thành Ghi chú của dự án.
- `.local/` được gitignore và không bao giờ được phục vụ qua HTTP. Sao lưu cả thư mục trước khi cập nhật.

## Kiểm tra

```sh
npm test
npm run build
```

Test chạy trên dữ liệu trong bộ nhớ và trên server HTTP thật ở thư mục tạm: vòng đời một việc, bằng chứng bắt buộc,
quyền giữa các agent, duyệt, mũi tên và vòng lặp, luồng và vòng làm việc, khoá việc đang chạy, dừng và làm tiếp, lượt
chạy (với một `claude` giả), token và origin, ghi đồng thời, CLI, chuyển đổi dữ liệu.

## Skill cho agent

`skills/nhanh-project-tracking` là skill phát hành kèm CLI. Cài cho Claude Code:
`node scripts/install-skill.mjs --target ~/.claude/skills`; cho Codex: `node scripts/install-skill.mjs`. Trình cài
không ghi đè bản đã có: dời bản cũ đi trước khi nâng cấp. Đóng gói: `python scripts/package-skill.py`.

Lịch sử phiên bản: `docs/RELEASE-v*.md`.
