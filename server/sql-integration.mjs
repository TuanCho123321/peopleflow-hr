// Explicit opt-in integration run. Never runs as part of node --test.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createSqlStore,passwordRecord} from './store.mjs';
import {createServer} from './index.mjs';

const database=process.env.SQL_TEST_DATABASE;
if(!database||!/^PeopleFlow_QA_[A-Za-z0-9_]{1,48}$/.test(database))throw new Error('SQL_TEST_DATABASE phải bắt đầu PeopleFlow_QA_ và là CSDL kiểm thử riêng.');
const env={...process.env,SQL_DATABASE:database,DATA_MODE:'sqlserver',NODE_ENV:'test',APP_ORIGIN:'',LOCAL_ONLY:'false'};
if(env.SQL_AUTH==='windows'){
  const matches=[...(env.SQL_CONNECTION_STRING||'').matchAll(/(?:^|;)\s*Database\s*=\s*([^;]*)/gi)];
  if(matches.length!==1)throw new Error('Chuỗi Windows SQL cần đúng một trường Database.');
  env.SQL_CONNECTION_STRING=env.SQL_CONNECTION_STRING.replace(/((?:^|;)\s*Database\s*=\s*)[^;]*/i,`$1${database}`);
}
let store,server,base;let checks=0;
const check=async(name,fn)=>{await fn();checks++;console.log(`PASS ${name}`)};
async function launch(){store=await createSqlStore(env);assert.equal((await store.pool.request().query('SELECT DB_NAME() AS name')).recordset[0].name,database);server=await createServer({store,env});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`}
async function stop(){if(server){await new Promise(r=>server.close(r));server=null}if(store){await store.pool.close();store=null}}
const request=(url,method='GET',cookie,data)=>fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
const login=async(email,password)=>{const r=await request('/api/login','POST',null,{email,password});assert.equal(r.status,200,JSON.stringify(await r.clone().json()));return r.headers.get('set-cookie').split(';')[0]};
const adminEmail=`qa-admin-${randomBytes(5).toString('hex')}@example.com`,password=randomBytes(24).toString('base64url');
try{
  await launch();
  const count=(await store.pool.request().query('SELECT COUNT(*) AS count FROM dbo.Users')).recordset[0].count;
  assert.equal(count,0,'CSDL QA cần rỗng để kiểm chứng bất biến quản trị cuối cùng.');
  const record=await passwordRecord(password);
  await store.pool.request().input('email',adminEmail).input('salt',record.passwordSalt).input('hash',record.passwordHash).query("SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON; SET NUMERIC_ROUNDABORT OFF; INSERT dbo.Users (Name,Email,Role,EmployeeId,IsActive,PasswordSalt,PasswordHash) VALUES (N'QA Admin',@email,'admin',NULL,1,@salt,@hash)");
  let admin=await login(adminEmail,password),employee,userId,staffCookie;
  const staffFields={name:'QA Staff',email:'qa-staff@example.com',role:'hr',employeeId:null,isActive:true};
  await check('SQL health readiness',async()=>{assert.equal((await request('/api/health')).status,200)});
  await check('employee SQL create/update/read',async()=>{const data={code:'QA001',name:'QA Employee',email:'qa-employee@example.com',phone:'0901234567',department:'QA',position:'QA Engineer',status:'probation',startDate:'2026-11-01',salary:17000000};const r=await request('/api/employees','POST',admin,data);assert.equal(r.status,201,JSON.stringify(await r.clone().json()));employee=(await r.json()).employee;const edit=await request(`/api/employees/${employee.id}`,'PUT',admin,{...employee,status:'active'});assert.equal(edit.status,200);assert.equal((await(await request('/api/employees','GET',admin)).json()).employees[0].status,'active')});
  await check('account SQL create and authenticate',async()=>{const r=await request('/api/users','POST',admin,{...staffFields,password});assert.equal(r.status,201,JSON.stringify(await r.clone().json()));userId=(await r.json()).user.id;staffCookie=await login(staffFields.email,password)});
  await check('SQL session survives HTTP server and connection pool restart',async()=>{await stop();await launch();assert.equal((await request('/api/users','GET',admin)).status,200);assert.equal((await request('/api/employees','GET',staffCookie)).status,200)});
  await check('role change atomically invalidates sessions',async()=>{const r=await request(`/api/users/${userId}`,'PUT',admin,{...staffFields,role:'employee',employeeId:employee.id});assert.equal(r.status,200,JSON.stringify(await r.clone().json()));assert.equal((await request('/api/employees','GET',staffCookie)).status,401);staffCookie=await login(staffFields.email,password);assert.equal((await request('/api/stats','GET',staffCookie)).status,403)});
  const newPassword=randomBytes(24).toString('base64url'),changedPassword=randomBytes(24).toString('base64url');
  await check('password reset invalidates durable sessions',async()=>{assert.equal((await request(`/api/users/${userId}/reset-password`,'POST',admin,{password:newPassword})).status,200);assert.equal((await request('/api/employees','GET',staffCookie)).status,401);staffCookie=await login(staffFields.email,newPassword)});
  await check('self password change invalidates durable sessions',async()=>{assert.equal((await request('/api/change-password','POST',staffCookie,{currentPassword:newPassword,password:changedPassword})).status,200);assert.equal((await request('/api/employees','GET',staffCookie)).status,401);staffCookie=await login(staffFields.email,changedPassword)});
  await check('disable revokes session and blocks authentication',async()=>{assert.equal((await request(`/api/users/${userId}`,'PUT',admin,{...staffFields,role:'employee',employeeId:employee.id,isActive:false})).status,200);assert.equal((await request('/api/employees','GET',staffCookie)).status,401);assert.equal((await request('/api/login','POST',null,{email:staffFields.email,password:changedPassword})).status,401)});
  await check('linked employee duplicate and deletion protected',async()=>{assert.equal((await request('/api/users','POST',admin,{...staffFields,email:'qa-other@example.com',role:'employee',employeeId:employee.id,password})).status,409);assert.equal((await request(`/api/employees/${employee.id}`,'DELETE',admin)).status,409)});
  await check('audit persisted without entered credentials',async()=>{const r=await request('/api/audit?limit=200','GET',admin);assert.equal(r.status,200);const text=await r.text();for(const secret of [password,newPassword,changedPassword,record.passwordHash,record.passwordSalt])assert.equal(text.includes(secret),false);const events=JSON.parse(text).events;for(const action of ['employee.create','employee.update','user.create','user.update','password.reset','password.change','auth.login'])assert.ok(events.some(e=>e.action===action),action)});
  await check('employee delete in SQL without linked account',async()=>{const data={...employee,code:'QA002',email:'qa-delete@example.com'};const r=await request('/api/employees','POST',admin,data);assert.equal(r.status,201);const id=(await r.json()).employee.id;assert.equal((await request(`/api/employees/${id}`,'DELETE',admin)).status,200)});
  await check('self lockout rejected',async()=>{const users=(await(await request('/api/users','GET',admin)).json()).users;const self=users.find(u=>u.email===adminEmail);assert.equal((await request(`/api/users/${self.id}`,'PUT',admin,{...self,role:'hr'})).status,409);assert.equal((await request(`/api/users/${self.id}`,'PUT',admin,{...self,isActive:false})).status,409)});
  await check('concurrent admin demotions preserve one active administrator',async()=>{const r=await request('/api/users','POST',admin,{name:'QA Admin Two',email:'qa-admin-two@example.com',role:'admin',employeeId:null,password});assert.equal(r.status,201);const second=(await r.json()).user;const secondCookie=await login(second.email,password);const users=(await(await request('/api/users','GET',admin)).json()).users;const first=users.find(u=>u.email===adminEmail);const results=await Promise.all([request(`/api/users/${second.id}`,'PUT',admin,{...second,role:'hr'}),request(`/api/users/${first.id}`,'PUT',secondCookie,{...first,role:'hr'})]);assert.equal(results.filter(r=>r.status===200).length,1);assert.ok(results.every(r=>[200,401,403,409].includes(r.status)));const count=(await store.pool.request().query("SELECT COUNT(*) AS count FROM dbo.Users WHERE Role='admin' AND IsActive=1")).recordset[0].count;assert.equal(count,1)});
  console.log(`SQL integration: ${checks} passed; database ${database}; no production database changed.`);
}finally{await stop()}
