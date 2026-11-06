-- Upgrade an existing PeopleFlow database. Back up first and run as migration owner.
-- Adds columns/tables only; no data deletion or database creation.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
    THROW 50001, 'Apply database/schema.sql to an empty database first.', 1;
IF COL_LENGTH(N'dbo.Users', N'IsActive') IS NULL
    ALTER TABLE dbo.Users ADD IsActive bit NOT NULL
        CONSTRAINT DF_Users_IsActive DEFAULT (1) WITH VALUES;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Users') AND name = N'UX_Users_EmployeeId')
BEGIN
    IF EXISTS (SELECT EmployeeId FROM dbo.Users WHERE EmployeeId IS NOT NULL GROUP BY EmployeeId HAVING COUNT(*) > 1)
        THROW 50005, 'Duplicate employee-account links exist; review manually before migration.', 1;
    CREATE UNIQUE INDEX UX_Users_EmployeeId ON dbo.Users(EmployeeId) WHERE EmployeeId IS NOT NULL;
END;
IF OBJECT_ID(N'dbo.Sessions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Sessions (
        TokenHash varchar(64) NOT NULL CONSTRAINT PK_Sessions PRIMARY KEY,
        UserId int NOT NULL CONSTRAINT FK_Sessions_Users REFERENCES dbo.Users(Id) ON DELETE CASCADE,
        ExpiresAt datetime2 NOT NULL
    );
    CREATE INDEX IX_Sessions_ExpiresAt ON dbo.Sessions(ExpiresAt);
END;
IF OBJECT_ID(N'dbo.AuditLogs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuditLogs (
        Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_AuditLogs PRIMARY KEY,
        ActorId int NULL CONSTRAINT FK_AuditLogs_Users REFERENCES dbo.Users(Id),
        Action nvarchar(80) NOT NULL,
        TargetType nvarchar(40) NOT NULL,
        TargetId nvarchar(100) NULL,
        CreatedAt datetime2 NOT NULL CONSTRAINT DF_AuditLogs_CreatedAt DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_AuditLogs_CreatedAt ON dbo.AuditLogs(CreatedAt DESC);
END;
COMMIT TRANSACTION;
