# Kiến trúc PeopleFlow

Frontend HTML/CSS/JavaScript và API Node.js cùng origin. Backend mới truy cập SQL; không gửi chuỗi kết nối ra trình duyệt. Node scrypt bất đồng bộ với salt riêng cho từng mật khẩu; opaque token ngẫu nhiên chỉ lưu hash trong dbo.Sessions. Phiên SQL tồn tại qua restart, có hạn dùng 8 giờ; thay đổi quyền/trạng thái/mật khẩu thu hồi phiên.

## SQL

Database chính PeopleFlow: dbo.Employees, dbo.Users (IsActive), dbo.Sessions và dbo.AuditLogs. SQL parameterized; mutation + audit dùng transaction. Thay đổi tài khoản khóa Users theo SERIALIZABLE, kiểm tra lại quyền tác nhân trong transaction và giữ ít nhất một Admin hoạt động. Liên kết tài khoản-nhân viên unique khi khác null. SQL lỗi không rơi về demo.

Cài tại máy này sử dụng mssql/msnodesqlv8, ODBC 18 và Windows Authentication; không đổi chế độ xác thực server. Tài khoản Windows chủ máy có quyền SQL rộng, vì vậy chỉ bind loopback. LAN phải dùng HTTPS và tài khoản dịch vụ ít quyền riêng.

## API

- GET /api/health: readiness SELECT1,503 nếu database lỗi.
- GET /api/session: {user,mode}; POST /api/login và /api/logout.
- GET/POST /api/employees; PUT/DELETE /api/employees/:id. Admin/HR quản lý, chỉ Admin xóa; Employee chỉ nhận chính mình.
- GET /api/stats: Admin/HR.
- GET/POST /api/users; PUT /api/users/:id; POST /api/users/:id/reset-password: Admin.
- POST /api/change-password: kiểm tra mật khẩu hiện tại, đổi và đăng xuất.
- GET /api/audit?limit=100: Admin, giới hạn tối đa200, không trả credentials.

## Vận hành

Production thông thường yêu cầu SQL, APP_ORIGIN HTTPS và cookie Secure. Ngoại lệ LOCAL_ONLY phải đồng thời origin HTTP loopback chính xác, HOST loopback và cookie Secure=false, từ chối host/origin khác. Kiểm tra body, quyền server, giới hạn đăng nhập/đổi mật khẩu, CSP, HttpOnly, SameSite, không phục vụ source hoặc .env. Demo chỉ dành cho kiểm thử độc lập.

Cấu hình thực tế .env là dữ liệu cục bộ gitignored. .local chứa mật khẩu bootstrap và không được phục vụ qua HTTP. Startup thủ công scripts/Start-PeopleFlow.cmd, backup scripts/backup.sql. Chi tiết và giới hạn trong README/docs/production.md.

