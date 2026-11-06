# Vận hành phiên bản chính thức

## Chạy chính thức trên một máy

`LOCAL_ONLY=true` là cấu hình riêng cho ứng dụng cá nhân trên chính máy chạy dịch vụ: bắt buộc HOST là loopback (`127.0.0.1` hoặc `::1`) và APP_ORIGIN là HTTP loopback chính xác. Trong cấu hình này cookie có thể không Secure vì trình duyệt truy cập HTTP tại máy. Ví dụ `NODE_ENV=production`, `LOCAL_ONLY=true`, `DATA_MODE=sqlserver`, `HOST=127.0.0.1`, `APP_ORIGIN=http://127.0.0.1:3000`, `COOKIE_SECURE=false`. Không đổi HOST thành `0.0.0.0`, không port-forward, tunnel hay đặt proxy public trước chế độ này.

SQL Server cục bộ có chứng chỉ tự ký có thể dùng encrypted connection cùng TrustServerCertificate=Yes riêng trong môi trường loopback. Cấu hình Windows integrated hiện tại có thể chạy dưới tài khoản Windows quản trị SQL để kiểm thử cá nhân; điều này có quyền rộng hơn cần thiết và chưa phải cấu hình service identity tối thiểu quyền. Không tái sử dụng cấu hình này khi mở cho mạng nội bộ hoặc Internet.

## Cài đặt cho mạng nội bộ hoặc Internet

Dùng Node.js hỗ trợ phiên bản được khai báo trong package.json, SQL Server và reverse proxy HTTPS. Cài dependencies bằng lockfile nếu có (`npm ci`); kiểm tra và cập nhật dependency theo lịch vận hành của tổ chức. Runtime chỉ lắng nghe `127.0.0.1` mặc định; reverse proxy chuyển tiếp tới cổng nội bộ. Không mở trực tiếp cổng SQL ra Internet.

Tạo database riêng bằng tài khoản quản trị trong SSMS. Với database mới, chọn đúng database rồi chạy `database/schema.sql`; với phiên bản cũ, sao lưu trước rồi áp dụng `database/migrations/001-production.sql`. Migration bổ sung `Users.IsActive` (tài khoản cũ mặc định hoạt động), Sessions và AuditLogs nếu thiếu; không xóa dữ liệu. Script không thay thế việc kiểm tra schema tùy biến tại hệ thống đang dùng.

Tạo login SQL riêng qua quy trình DBA, sau đó xem và thay marker trong `database/runtime-permissions.sql`. Script chỉ cấp quyền theo từng bảng: nhân viên CRUD, tài khoản đọc/tạo/sửa, session đọc/tạo/xóa, audit đọc/ghi thêm. Runtime không cần sysadmin, db_owner, quyền tạo bảng hoặc backup. Login không được có quyền dư từ các role khác; script cấp quyền không tự thu hồi quyền đã tồn tại. Dùng tài khoản migration riêng khi nâng cấp schema.

Cấu hình `.env` hoặc secret store của dịch vụ:

```dotenv
NODE_ENV=production
LOCAL_ONLY=false
DATA_MODE=sqlserver
SQL_AUTH=sql
HOST=127.0.0.1
PORT=3000
APP_ORIGIN=https://hr.example.com
COOKIE_SECURE=true
SQL_SERVER=your-sql-host
SQL_PORT=1433
SQL_DATABASE=PeopleFlow
SQL_USER=your-dedicated-runtime-login
SQL_PASSWORD=your-secret-from-secret-store
SQL_ENCRYPT=true
SQL_TRUST_CERT=false
```

Các giá trị trên là marker, không phải credentials có thể sử dụng. APP_ORIGIN phải là origin HTTPS chính xác người dùng truy cập. Cài chứng chỉ SQL phù hợp hostname; không tắt xác minh chứng chỉ để bỏ qua lỗi production. Không gửi `.env` cho frontend, Git hay log.

Máy Windows có thể dùng `SQL_AUTH=windows` và `SQL_CONNECTION_STRING` qua `msnodesqlv8` cùng ODBC driver đã cài. Chuỗi kết nối phải chứa database, integrated authentication và chính sách mã hóa/chứng chỉ phù hợp. Trong chế độ này, các biến SQL_USER/SQL_PASSWORD/SQL_ENCRYPT/SQL_TRUST_CERT không điều khiển driver; đặt Encrypt/TrustServerCertificate trong chính chuỗi kết nối. Dịch vụ phải chạy dưới Windows service identity riêng được DBA cấp quyền tối thiểu. Kết nối thử bằng tài khoản Windows sysadmin chỉ xác minh môi trường phát triển, chưa xác minh cấu hình quyền production.

Provision tài khoản Admin đầu tiên bằng `SEED_ADMIN_EMAIL` và `SEED_ADMIN_PASSWORD` riêng (ít nhất 12 ký tự), rồi chạy `npm run seed` từ thư mục dự án. Xóa các biến provisioning sau khi thành công. SQL mode không sử dụng tài khoản/mật khẩu demo. Khởi động bằng `npm start`; dùng service manager của hệ điều hành để khởi động lại khi lỗi và lưu log có kiểm soát truy cập. Không ghi mật khẩu hay chuỗi kết nối vào log.

## Sao lưu và khôi phục

DBA chọn lịch full/differential/log backup theo mục tiêu mất dữ liệu (RPO) và thời gian phục hồi (RTO); recovery model và lịch log backup phải thống nhất. Ví dụ dưới đây chỉ là bản backup thủ công trước nâng cấp, dùng đường dẫn mới có timestamp do DBA chọn. Đường dẫn nằm trên máy SQL Server, không nhất thiết là máy chạy web. Tài khoản dịch vụ SQL Server cần quyền ghi vào thư mục. `COPY_ONLY` tạo bản sao độc lập với chuỗi backup thông thường; tùy chọn `CHECKSUM` giúp kiểm tra tính toàn vẹn trong quá trình backup. [Microsoft: BACKUP](https://learn.microsoft.com/en-us/sql/t-sql/statements/backup-transact-sql).

```sql
-- Replace database and absolute server-side path before DBA executes.
BACKUP DATABASE [PeopleFlow]
TO DISK = N'E:\SqlBackups\PeopleFlow_before_upgrade_YYYYMMDD_HHMM.bak'
WITH COPY_ONLY, CHECKSUM;

RESTORE VERIFYONLY
FROM DISK = N'E:\SqlBackups\PeopleFlow_before_upgrade_YYYYMMDD_HHMM.bak'
WITH CHECKSUM;
```

VERIFYONLY không thay thế diễn tập restore. Giữ bản sao mã hóa ngoài máy SQL, hạn chế người đọc và lưu khóa mã hóa theo chính sách riêng. Kiểm tra định kỳ bằng khôi phục vào database thử nghiệm **có tên khác**, sau khi DBA dùng `RESTORE FILELISTONLY` để xác định logical file names rồi cấu hình đường dẫn data/log riêng. Không dùng `WITH REPLACE` hoặc khôi phục đè database đang phục vụ. Kiểm tra DBCC CHECKDB và nghiệp vụ sau restore; xác nhận số tài khoản, hồ sơ, audit và đăng nhập trước khi chấp nhận bản sao. [Microsoft: RESTORE VERIFYONLY](https://learn.microsoft.com/en-us/sql/t-sql/statements/restore-statements-verifyonly-transact-sql).

Nếu nâng cấp lỗi: ngừng nhận thay đổi, giữ log và backup hiện tại; DBA phục hồi vào database riêng, xác minh rồi mới đổi kết nối theo kế hoạch cutover được duyệt. Tránh rollback bằng cách xóa cột/bảng có dữ liệu mới. Trước diễn tập phục hồi môi trường thật, phải xem xét các phiên trong bản backup và thu hồi phiên theo quy trình vận hành.

## Xác minh trước sử dụng

Chạy test suite, kiểm tra đăng nhập ba vai trò, tạo/sửa nhân viên, tài khoản, tắt tài khoản và mất quyền ngay lập tức. Xác minh cookie Secure/HttpOnly, chặn origin khác, dữ liệu tồn tại sau restart và phiên SQL hoạt động theo thiết kế. Kiểm tra audit cho các thay đổi thành công và backup/restore trên database thử nghiệm. Chỉ coi kết nối SQL đã đạt khi kiểm tra thực tế thành công; việc có script không chứng minh database đang hoạt động.

Theo dõi lỗi HTTP, kết nối SQL, dung lượng database/backup, đăng nhập thất bại và thay đổi tài khoản đặc quyền. Rate limit tại reverse proxy bảo vệ nhiều instance; bộ đếm cục bộ trong process không phải rate limit dùng chung. AuditLogs chứa ActorId/action/target/time, không chứa mật khẩu. Runtime không được UPDATE/DELETE audit; chỉ DBA thực hiện lưu trữ và retention đã phê duyệt.
