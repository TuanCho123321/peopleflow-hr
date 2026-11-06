SET NOCOUNT ON;
DECLARE @Directory nvarchar(4000) = CONVERT(nvarchar(4000),SERVERPROPERTY('InstanceDefaultBackupPath'));
IF @Directory IS NULL THROW 50000, 'SQL Server default backup path unavailable.', 1;
DECLARE @Stamp nvarchar(40) = CONVERT(char(8),GETDATE(),112) + N'_' + REPLACE(CONVERT(char(8),GETDATE(),108),N':',N'');
DECLARE @File nvarchar(4000) = @Directory + N'\PeopleFlow_' + @Stamp + N'.bak';
BACKUP DATABASE [PeopleFlow] TO DISK=@File WITH COPY_ONLY,CHECKSUM;
RESTORE VERIFYONLY FROM DISK=@File WITH CHECKSUM;
PRINT @File;
