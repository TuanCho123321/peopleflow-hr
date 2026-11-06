SET NOCOUNT ON;
IF DB_ID(N'PeopleFlow') IS NULL
    EXEC(N'CREATE DATABASE [PeopleFlow]');
ELSE
    THROW 50000, 'PeopleFlow already exists. Review the existing database before setup.', 1;
