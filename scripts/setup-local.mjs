import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {createSqlStore,passwordRecord} from '../server/store.mjs';
if(process.env.DATA_MODE!=='sqlserver')throw Error('SQL mode is required.');
const store=await createSqlStore();
try {
  if((await store.users()).length)throw Error('Setup stopped: accounts already exist.');
  const email='admin@peopleflow.local';
  const password=randomBytes(24).toString('base64url');
  const record=await passwordRecord(password);
  await mkdir(new URL('../.local/',import.meta.url),{recursive:true});
  // Write credentials before inserting: if disk write fails, no unknown-password account is created.
  await writeFile(new URL('../.local/initial-admin.txt',import.meta.url),`PeopleFlow — tài khoản quản trị ban đầu\nURL: http://127.0.0.1:3000\nEmail: ${email}\nMật khẩu: ${password}\n\nĐổi mật khẩu tại Cài đặt sau lần đăng nhập đầu tiên, rồi xóa tệp này. Không chia sẻ tệp.\n`,{flag:'wx',mode:0o600});
  await store.pool.request().input('email',email).input('salt',record.passwordSalt).input('hash',record.passwordHash).query("INSERT dbo.Users (Name,Email,Role,EmployeeId,IsActive,PasswordSalt,PasswordHash) VALUES (N'Quản trị PeopleFlow',@email,N'admin',NULL,1,@salt,@hash)");
  console.log('Created initial admin. Credentials saved privately under .local/initial-admin.txt. No demo employees inserted.');
} finally {await store.pool.close()}
