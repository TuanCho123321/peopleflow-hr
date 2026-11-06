# Đánh giá bảo mật

Phạm vi: `server/index.mjs`, `server/store.mjs`, `server/seed.mjs`, schema SQL và frontend. Đây là kiểm tra mã nguồn và smoke test cục bộ, không phải kiểm thử xâm nhập hay chứng nhận triển khai production.

## Phát hiện và xử lý

1. **Medium — cấu hình dữ liệu không hợp lệ tự chạy demo** (`server/index.mjs`): backend đã sửa để từ chối DATA_MODE ngoài `demo`/`sqlserver`, tránh vô tình mở tài khoản demo khi nhập sai cấu hình. Đã kiểm tra lại mã sửa.
2. **Low — kiểm tra đường dẫn static dùng root có dấu phân cách cuối** (`server/index.mjs`): đã chuẩn hóa root bằng `path.resolve`, giữ kiểm tra ranh giới thư mục. Đã kiểm tra lại mã sửa.
3. **Medium — dữ liệu tài khoản quản trị còn trong state sau đăng xuất** (`public/app.js`): khi admin mở Phân quyền, đăng xuất rồi đăng nhập HR/nhân viên, state cũ có thể hiển thị danh sách tài khoản đã cache. Frontend đã sửa để reset state lúc đăng nhập/đăng xuất, xóa users trước khi refresh và kiểm tra role trước navigate/render Phân quyền. Đã kiểm tra mã sửa và cú pháp JavaScript; chưa chạy kịch bản chuyển tài khoản trong trình duyệt.

## Kiểm tra backend

- Mật khẩu dùng scrypt bất đồng bộ, salt ngẫu nhiên riêng; so sánh bằng `timingSafeEqual`. Tạo/đổi/reset mật khẩu yêu cầu 12–256 ký tự.
- Session dùng token ngẫu nhiên 32 byte, chỉ lưu SHA-256 token, hết hạn 8 giờ. SQL mode lưu trong dbo.Sessions; demo lưu bộ nhớ. API kiểm tra trạng thái tài khoản trên mỗi request; thay đổi tài khoản/mật khẩu thu hồi các phiên của tài khoản đó.
- Cookie HttpOnly, SameSite=Lax; cần đặt `COOKIE_SECURE=true` khi chạy HTTPS. Login có giới hạn số lần sai theo địa chỉ kết nối.
- API kiểm tra quyền tại backend; nhân viên chỉ đọc hồ sơ mình và không được truy cập thống kê. HR không xóa nhân viên; chỉ admin xem tài khoản.
- SQL queries dùng parameters, dữ liệu đầu vào kiểm tra độ dài, email, ngày, trạng thái và mức lương; API không trả password hash/salt.
- Mutation kiểm tra Origin và Sec-Fetch-Site, yêu cầu JSON cho POST/PUT/PATCH. CSP, chống iframe và nosniff được thiết lập.
- `.env` được ignore; static server chỉ phục vụ public. Provisioning SQL yêu cầu mật khẩu riêng từ môi trường, tối thiểu 12 ký tự, không ghi đè tài khoản cũ.

## Kiểm chứng đã chạy

Chạy script Node tạo demo server trên cổng ngẫu nhiên, gửi request bằng fetch rồi đóng server:

| Kiểm tra | Kết quả |
| --- | --- |
| Nhân viên đăng nhập | 200 |
| Danh sách nhân viên | Chỉ 1 hồ sơ của chính tài khoản |
| Nhân viên xem tài khoản | 403 |
| Nhân viên tạo hồ sơ | 403 |
| Mutation từ origin khác | 403 |
| Đọc `/.env` qua HTTP | 404 |

Đã chạy thêm `node --test server/api.test.mjs`: 15/15 kiểm tra đạt, bao gồm quyền ba vai trò, cookie, CRUD, dữ liệu lỗi, chống CSRF, rate limit, static isolation, logout và cấu hình SQL fail-closed. `node --check public/app.js` đạt.

## Giới hạn vận hành

Mặc định chỉ lắng nghe localhost. Demo có tài khoản công khai phục vụ đánh giá; không dùng chế độ demo cho dữ liệu thật. Trước khi mở mạng nội bộ/Internet, dùng SQL mode, HTTPS, COOKIE_SECURE, reverse proxy có rate limiting phù hợp, giới hạn truy cập mạng SQL và tài khoản SQL tối thiểu quyền. Rate limit còn trong bộ nhớ theo một process; SQL session đã dùng database chung. Reviewer chưa tự xác minh SQL thật, audit dependency trực tuyến, TLS hay cấu hình hạ tầng; kết quả tích hợp thực tế của agent chính cần được báo riêng.

## Frontend

Đã đọc `public/app.js`: các trường nhân viên, tên tài khoản, email và giá trị form được escape trước khi dùng innerHTML; lỗi/toast dùng textContent. Không tìm thấy luồng dữ liệu nhân viên đưa trực tiếp vào HTML không escape. CSV thêm dấu nháy đơn trước nội dung bắt đầu bằng ký tự công thức và escape dấu nháy kép. Fetch dùng cùng origin; không lưu token/mật khẩu trong localStorage. Không còn phát hiện High/Medium chưa xử lý trong phạm vi mã đã đọc.

## Đánh giá bổ sung phiên bản chính thức

Đã đọc lại quản lý tài khoản, đổi/reset mật khẩu, persistent sessions, audit và production guard sau nâng cấp:

- Chỉ admin quản lý tài khoản và xem audit. Nhân viên bắt buộc liên kết hồ sơ; unique filtered index EmployeeId ngăn liên kết trùng dưới concurrency.
- SQL mutation chạy transaction SERIALIZABLE, khóa Users bằng UPDLOCK/HOLDLOCK, kiểm tra lại role/trạng thái actor trước ghi. Ngăn tự khóa/hạ quyền admin và giữ ít nhất một admin hoạt động. Password change kiểm tra hash chưa bị thay đổi trong lúc derive; tạo phiên kiểm tra lại active/password hash trong transaction.
- CRUD nhân viên/tài khoản/mật khẩu và audit tương ứng commit cùng transaction. Audit không chứa mật khẩu, token hay chuỗi kết nối. Runtime-permissions chỉ cấp INSERT/SELECT vào audit, không cấp UPDATE/DELETE.
- NODE_ENV=production cấm demo. Chế độ remote yêu cầu HTTPS APP_ORIGIN và Secure cookie. LOCAL_ONLY yêu cầu HOST loopback, HTTP origin loopback đúng cổng và cookie cấu hình riêng; không hỗ trợ mở truy cập qua tunnel/proxy public trong chế độ này. Production mutation yêu cầu Origin và so sánh đúng origin cấu hình.
- Đã tìm và xác minh sửa seed thiếu await sau khi đổi passwordRecord thành async. Các SET options cần cho filtered index được khai báo trong schema/migration và seed batch.
- Frontend mới escape dữ liệu tài khoản/audit và giữ token trong HttpOnly cookie. Dialog mật khẩu được reset/remove khi đóng; login đóng và xóa dữ liệu modal cũ.

Đã chạy lại API suite: 15/15 đạt; app.js syntax đạt. Chạy thêm smoke test account trên demo server tách biệt: tạo tài khoản HR 201; HR xem audit 403; tự hạ quyền admin 409; tắt HR 200; phiên HR cũ bị từ chối 401; đăng nhập HR đã tắt 401; audit có user.update và không chứa mật khẩu. Server đã đóng sau kiểm tra.

Không còn phát hiện High/Medium chưa xử lý trong phạm vi review mã. Giới hạn triển khai cần giữ rõ: local Windows integrated SQL hiện có thể chạy dưới tài khoản sysadmin của máy; SQL self-signed trust được chấp nhận chỉ cho môi trường local đã chọn. Đưa ra LAN/Internet cần service identity riêng, quyền tối thiểu và chứng chỉ SQL được xác minh. Kiểm tra TLS SQL là cấu hình vận hành, chưa phải guard bảo đảm hoàn toàn cho mọi dạng chuỗi kết nối Windows.
