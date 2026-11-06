import { createSqlStore,passwordRecord } from './store.mjs';
const store=await createSqlStore();
try {
  const email=process.env.SEED_ADMIN_EMAIL;
  const password=process.env.SEED_ADMIN_PASSWORD;
  if(!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!password||password.length<12||password.length>256)throw new Error('Đặt SEED_ADMIN_EMAIL hợp lệ và SEED_ADMIN_PASSWORD (12–256 ký tự).');
  if(await store.findUser(email.toLowerCase()))throw new Error('Tài khoản đã tồn tại; không thay đổi dữ liệu.');
  const {passwordSalt,passwordHash}=await passwordRecord(password);
  await store.pool.request().input('email',email.toLowerCase()).input('salt',passwordSalt).input('hash',passwordHash).query("SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON; SET NUMERIC_ROUNDABORT OFF; INSERT dbo.Users (Name,Email,Role,EmployeeId,IsActive,PasswordSalt,PasswordHash) VALUES (N'Quản trị viên',@email,'admin',NULL,1,@salt,@hash)");
  console.log('Đã tạo tài khoản quản trị.');
}finally{await store.pool.close()}
