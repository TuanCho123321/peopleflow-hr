# Báo cáo kiểm thử — phiên bản SQL Server

## Kết quả

- `node --test server/*.test.mjs`: **30 pass, 0 fail**, agent chính chạy xác nhận cuối trong 1535.4314 ms, exit code 0.
- Kiểm tra cú pháp `server/index.mjs`, `server/store.mjs`, `server/seed.mjs`, `server/sql-integration.mjs`, `public/app.js`: thành công.
- Kiểm thử SQL trực tiếp do agent chính thực thi với `SQL_TEST_DATABASE=PeopleFlow_QA_20261107`, `node --env-file=.env server/sql-integration.mjs`: **13/13 checks pass**.
- Agent chính kiểm tra dependency: `pnpm audit --prod --json`, không phát hiện lỗ hổng ở các mức độ; chi tiết trong `docs/dependency-audit.json`.

## Phạm vi tự động

- Xác thực đúng/sai cho ba vai trò; cookie HttpOnly, SameSite=Lax; hạn chế đăng nhập sai.
- Nhân viên chỉ đọc hồ sơ được liên kết; không có quyền sửa, xem tài khoản hay thống kê công ty.
- Nhân sự thêm/sửa nhân viên, Admin xóa; từ chối mã/email trùng, ngày không tồn tại, lương âm và hồ sơ đang liên kết tài khoản.
- Tạo tài khoản, thay đổi vai trò, khóa tài khoản, đặt lại mật khẩu và tự đổi mật khẩu với xác nhận mật khẩu hiện tại.
- Thu hồi phiên khi đổi quyền/khóa/reset/đổi mật khẩu; kiểm tra quyền người thao tác bên trong storage mutation.
- Không tự khóa hoặc hạ quyền Admin; SQL transaction kiểm chứng hai Admin hạ quyền nhau đồng thời vẫn giữ đúng một Admin hoạt động.
- Nhật ký giới hạn tối đa 200 bản ghi, quyền Admin; không chứa mật khẩu đã nhập, salt hay hash mật khẩu.
- Từ chối origin sai (bao gồm khác scheme); chế độ LOCAL_ONLY yêu cầu Host và Origin khớp chính xác. Từ chối cấu hình production không đáp ứng yêu cầu.
- Health probe trả 200 khi storage hoạt động, 503 với nội dung không lộ chi tiết kết nối khi storage lỗi.
- Phục vụ HTML/CSS/JavaScript; không lộ mã nguồn backend, `.env`, `package.json` hay traversal.

## SQL Server thực tế

Agent chính đã kết nối Windows Authentication bằng driver `msnodesqlv8` và ODBC Driver 18. Các vướng mắc ban đầu về npm/SSPI đã được giải quyết bằng runtime package manager và chạy dưới ngữ cảnh Windows phù hợp. Database chính `PeopleFlow` được tạo và áp dụng schema; tài khoản quản trị khởi tạo bằng mật khẩu ngẫu nhiên, không dùng tài khoản demo. Database chính có 0 nhân viên và 1 Admin để người dùng nhập dữ liệu thật.

Agent chính dùng `scripts/verify-local.mjs` kiểm chứng phiên đăng nhập database chính còn hiệu lực sau khi dừng và khởi động lại tiến trình Node thực tế. Server chính đang phục vụ tại `127.0.0.1:3000` bằng SQL Server, LOCAL_ONLY. Backup `PeopleFlow_20261107_013938.bak` được tạo với COPY_ONLY và CHECKSUM, sau đó `RESTORE VERIFYONLY` xác nhận hợp lệ; bản backup nằm trong thư mục backup mặc định SQL Server.

Script tích hợp có khóa bảo vệ: tên database phải bắt đầu `PeopleFlow_QA_`, chuỗi kết nối được thay đúng database QA, kiểm tra `SELECT DB_NAME()` trước thao tác, yêu cầu bảng Users rỗng trước bootstrap. Không thao tác dữ liệu database chính.

13 checks SQL đã chạy gồm readiness, CRUD nhân viên, tạo/xác thực tài khoản, phiên còn hiệu lực sau khi khởi động lại HTTP server và connection pool, thu hồi phiên khi đổi quyền/reset/đổi mật khẩu/khóa, bảo vệ liên kết nhân viên và unique index, nhật ký bền vững không chứa secrets, xóa nhân viên không liên kết, chống tự khóa và kiểm thử Admin đồng thời.

## Giới hạn còn lại

Phiên SQL đã bền vững giữa các tiến trình. Bộ đếm chống đăng nhập sai hiện trong RAM cho từng tiến trình; chạy nhiều instance cần rate limiter dùng chung hoặc lớp reverse proxy. Chưa kiểm chứng vận hành trên mạng nội bộ qua HTTPS; phiên bản hiện cấu hình LOCAL_ONLY, chỉ bind loopback với origin chính xác. Đánh giá UI trình duyệt được agent giao diện và agent chính thực hiện riêng.

Lần chạy đầu của test Host dùng Node fetch thất bại do fetch chuẩn hóa Host tùy chỉnh. Đã thay test bằng native HTTP request để gửi Host chính xác và chạy lại toàn bộ thành công; không thay đổi chính sách kiểm tra Host của server.
