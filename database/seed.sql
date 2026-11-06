-- Optional sample employees only; this script does not install a shared password.
-- Select your application database and apply schema.sql first.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF NOT EXISTS (SELECT 1 FROM dbo.Employees WHERE Code = N'NV001')
    INSERT INTO dbo.Employees (Code, Name, Email, Phone, Department, Position, Status, StartDate, Salary)
    VALUES (N'NV001', N'Nguyễn Minh Anh', N'minhanh@example.com', N'0901234567', N'Nhân sự', N'Trưởng phòng nhân sự', N'active', '2023-03-15', 28000000);
IF NOT EXISTS (SELECT 1 FROM dbo.Employees WHERE Code = N'NV002')
    INSERT INTO dbo.Employees (Code, Name, Email, Phone, Department, Position, Status, StartDate, Salary)
    VALUES (N'NV002', N'Trần Hoàng Nam', N'hoangnam@example.com', N'0902345678', N'Công nghệ', N'Kỹ sư phần mềm', N'active', '2024-01-08', 24000000);
COMMIT TRANSACTION;
