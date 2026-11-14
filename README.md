# Nhánh — Project Task Tracking

Ứng dụng quản lý dự án cá nhân, dùng React + Vite. Giao diện tiếng Việt, responsive cho desktop và mobile.

## Chạy local

Yêu cầu Node.js 22.12+ (hoặc 24+) và npm.

```sh
npm install
npm run dev
```

Mở địa chỉ Local được Vite in ra (mặc định http://localhost:5173). Dùng địa chỉ Network trong cùng Wi-Fi để mở trên điện thoại. Thu âm cần HTTPS hoặc localhost, nên hãy dùng bản Vercel trên điện thoại.

## Tính năng

- Tag trực tiếp trên cây: chọn nhiều tag, bỏ tag, tìm và tạo tag riêng. Bộ mặc định gồm Idea, Design Document, Prototype, Core System, Architecture, Gameplay, UI/UX, Art/Assets, Audio, Tech Art/VFX, Research, Feature, Bug, Testing/QA, Optimization, Release, Analytics, Marketing. Lọc theo tag giữ lại các task cha để thấy ngữ cảnh. Tag đi theo task khi đổi cấp và nằm trong bản sao lưu JSON.

- Tạo/sửa/xóa project; task có ghi chú, ảnh và nhánh con không đặt giới hạn độ sâu.
- Checkbox hoàn thành toàn bộ nhánh. Tiến độ task là trung bình tiến độ các con trực tiếp; task lá tính 0% hoặc 100%. Tiến độ project là trung bình các task cấp lớn, mỗi task cấp lớn có trọng số bằng nhau.
- Kéo tay nắm ⋮⋮ để đổi thứ tự. Thả vào giữa task để làm nhánh con, vào vạch trên/dưới để đặt cạnh task, hoặc vùng cuối danh sách để làm task cấp lớn. Trên mobile có thể dùng cửa sổ chi tiết → Vị trí trong dự án.
- Dán ảnh từ clipboard hoặc chọn file để tạo task/ý tưởng, hỗ trợ PNG/JPEG/GIF/WebP, tối đa 8 MB/tệp.
- Hộp ý tưởng nhận text, ảnh, ghi âm bằng microphone (tối đa 2 phút mỗi bản thu); chuyển ý tưởng thành task trong project. Audio được lưu để nghe lại, không tự phiên âm và không gọi AI API.
- Tìm kiếm, bộ lọc, thu gọn nhánh, hoàn tác 20 thay đổi gần nhất trong phiên.
- Tự lưu IndexedDB; xuất/nhập JSON bao gồm ảnh/audio. Nhập thay thế không gian hiện tại, có thể hoàn tác trong phiên.

## Lưu trữ

Dữ liệu ở trình duyệt của thiết bị, riêng theo origin (localhost và Vercel khác nhau), không đồng bộ tài khoản/thiết bị. Dùng Xuất/Nhập để chuyển dữ liệu. Xóa dữ liệu trang web hoặc dùng chế độ riêng tư có thể làm mất dữ liệu; nên xuất bản sao lưu định kỳ. Không có backend hay secret trong ứng dụng.

## Kiểm tra và deploy

```sh
npm test
npm run build
vercel login
vercel --prod
```

Vercel nhận cấu hình từ `vercel.json`. Repository: https://github.com/voilenmang12/project-task-tracking

## Thao tác nhanh trên cây

Nhấn tên task để sửa trực tiếp. Enter lưu tên và tạo task cùng cấp ngay sau task hiện tại; Tab thụt vào task cùng cấp phía trước; Shift+Tab đưa ra sau task cha. Các nhánh con đi theo task. Click ra ngoài để lưu, Esc hủy phần tên đang sửa và thoát. Nút + thêm nhánh con ngay trên cây. Tab/Shift+Tab chỉ đổi cấp khi đang sửa tên; Esc để trở lại điều hướng bàn phím bình thường.
