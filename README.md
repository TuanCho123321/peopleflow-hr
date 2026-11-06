# PeopleFlow HR

Ứng dụng quản lý nhân sự tiếng Việt với Node.js và Microsoft SQL Server.

## Chức năng

- Đăng nhập, phiên lưu trong SQL, phân quyền Admin / Nhân sự / Nhân viên.
- CRUD nhân viên; tìm kiếm, bộ lọc, phân trang, thống kê và xuất CSV.
- Quản trị tài khoản, liên kết hồ sơ, khóa tài khoản, đổi/reset mật khẩu và thu hồi phiên.
- Nhật ký thao tác, health check, production guard và script sao lưu.

## Chạy thử

Yêu cầu Node.js 22+ và pnpm.

```powershell
pnpm install --frozen-lockfile
node server/index.mjs
```

Mở http://127.0.0.1:3000. Khi chưa cấu hình môi trường, chế độ demo dùng RAM và mất thay đổi khi khởi động lại. Tài khoản demo được hiển thị trên trang đăng nhập; chỉ dùng để thử.

## SQL Server thật

1. Tạo database riêng và chạy `database/schema.sql`; database đã có schema cũ dùng migration trong `database/migrations` sau khi đọc và sao lưu.
2. Sao chép `.env.example` thành `.env`, cấu hình `DATA_MODE=sqlserver` và thông tin kết nối.
3. SQL Authentication dùng driver mặc định. Windows Authentication cần ODBC Driver 18, `SQL_AUTH=windows` và `SQL_CONNECTION_STRING` theo tài liệu.
4. Đặt `SEED_ADMIN_EMAIL` và `SEED_ADMIN_PASSWORD` riêng (tối thiểu 12 ký tự), chạy `node --env-file=.env server/seed.mjs`, rồi bỏ hai biến khởi tạo.
5. Chạy `node --env-file=.env server/index.mjs`.

Không đưa `.env`, `.local`, mật khẩu, database hoặc backup vào Git. Production thông thường yêu cầu HTTPS, cookie Secure và tài khoản SQL ít quyền. `LOCAL_ONLY=true` chỉ dành cho máy cá nhân, bind loopback và không mở ra LAN/Internet. Đọc [hướng dẫn vận hành](docs/production.md).

## Kiểm thử

```powershell
pnpm test
```

Bộ kiểm thử tự động đã đạt 30/30. Kiểm thử SQL riêng đã đạt 13/13 trong môi trường Windows/SQL Server; không tự chạy trên database production. Xem [báo cáo kiểm thử](docs/test-report.md) và [review bảo mật](docs/security-review.md).

## Công nghệ

HTML/CSS/JavaScript, Node HTTP, scrypt bất đồng bộ, mssql, msnodesqlv8. Không có thông tin đăng nhập thật hoặc dữ liệu nhân sự thật trong repository.
