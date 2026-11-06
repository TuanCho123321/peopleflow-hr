-- Review and replace the marker; execute as database administrator in the application DB.
-- Provision a dedicated server login separately via your DBA/secrets workflow.
-- Do not run this against a login already holding db_owner/sysadmin or shared by other apps.
DECLARE @Login sysname = N'REPLACE_WITH_EXISTING_LOGIN';
DECLARE @DbUser sysname = N'peopleflow_runtime';
DECLARE @Command nvarchar(max);
IF @Login = N'REPLACE_WITH_EXISTING_LOGIN'
    THROW 50002, 'Set @Login to the dedicated existing application login.', 1;
IF SUSER_ID(@Login) IS NULL
    THROW 50003, 'Application login does not exist.', 1;
IF DATABASE_PRINCIPAL_ID(@DbUser) IS NOT NULL AND EXISTS (
    SELECT 1 FROM sys.database_principals WHERE name = @DbUser AND sid <> SUSER_SID(@Login)
)
    THROW 50004, 'Existing database user belongs to another login; review mapping manually.', 1;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF DATABASE_PRINCIPAL_ID(@DbUser) IS NULL
BEGIN
    SET @Command = N'CREATE USER ' + QUOTENAME(@DbUser) + N' FOR LOGIN ' + QUOTENAME(@Login);
    EXEC sys.sp_executesql @Command;
END;
IF DATABASE_PRINCIPAL_ID(N'PeopleFlowRuntime') IS NULL
    CREATE ROLE PeopleFlowRuntime;
IF NOT EXISTS (
    SELECT 1 FROM sys.database_role_members r
    WHERE r.role_principal_id = DATABASE_PRINCIPAL_ID(N'PeopleFlowRuntime')
      AND r.member_principal_id = DATABASE_PRINCIPAL_ID(@DbUser)
)
BEGIN
    SET @Command = N'ALTER ROLE PeopleFlowRuntime ADD MEMBER ' + QUOTENAME(@DbUser);
    EXEC sys.sp_executesql @Command;
END;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.Employees TO PeopleFlowRuntime;
GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.Users TO PeopleFlowRuntime;
GRANT SELECT, INSERT, DELETE ON OBJECT::dbo.Sessions TO PeopleFlowRuntime;
GRANT SELECT, INSERT ON OBJECT::dbo.AuditLogs TO PeopleFlowRuntime;
COMMIT TRANSACTION;
