-- Run against an existing, empty application database selected by your SQL client.
-- This script never creates/drops a database and never alters existing tables.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.Employees', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Employees (
        Id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Employees PRIMARY KEY,
        Code nvarchar(20) NOT NULL CONSTRAINT UQ_Employees_Code UNIQUE,
        Name nvarchar(150) NOT NULL,
        Email nvarchar(254) NOT NULL CONSTRAINT UQ_Employees_Email UNIQUE,
        Phone nvarchar(30) NOT NULL CONSTRAINT DF_Employees_Phone DEFAULT N'',
        Department nvarchar(100) NOT NULL,
        Position nvarchar(100) NOT NULL,
        Status nvarchar(20) NOT NULL CONSTRAINT CK_Employees_Status CHECK (Status IN (N'active', N'probation', N'leave')),
        StartDate date NOT NULL,
        Salary decimal(18,2) NOT NULL CONSTRAINT CK_Employees_Salary CHECK (Salary >= 0)
    );
END;

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        Id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
        Name nvarchar(150) NOT NULL,
        Email nvarchar(254) NOT NULL CONSTRAINT UQ_Users_Email UNIQUE,
        Role nvarchar(20) NOT NULL CONSTRAINT CK_Users_Role CHECK (Role IN (N'admin', N'hr', N'employee')),
        EmployeeId int NULL CONSTRAINT FK_Users_Employees REFERENCES dbo.Employees(Id),
        PasswordSalt nvarchar(128) NOT NULL,
        PasswordHash nvarchar(256) NOT NULL,
        IsActive bit NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT (1)
    );
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
