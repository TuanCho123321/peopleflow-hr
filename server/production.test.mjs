import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from './index.mjs';
import {createDemoStore} from './store.mjs';
import {request as httpRequest} from 'node:http';

test('Account lifecycle, revocation and audit',async t=>{
  const store=await createDemoStore();const server=await createServer({store,env:{DATA_MODE:'demo'}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=(url,method='GET',cookie,data)=>fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
  const login=async(email,password)=>{const r=await request('/api/login','POST',null,{email,password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0]};
  let admin=await login('admin@peopleflow.vn','Admin@12345'),hr=await login('hr@peopleflow.vn','Hr@12345'),id;
  const fields={name:'QA Account',email:'qa@example.com',role:'hr',employeeId:null};
  await t.test('health readiness only includes status',async()=>{const r=await request('/api/health');assert.equal(r.status,200);assert.deepEqual(await r.json(),{status:'ok'})});
  await t.test('HR cannot administer accounts or audit',async()=>{assert.equal((await request('/api/users','POST',hr,{...fields,password:'LongPassword@123'})).status,403);assert.equal((await request('/api/audit','GET',hr)).status,403)});
  await t.test('password length and employee links validated',async()=>{assert.equal((await request('/api/users','POST',admin,{...fields,password:'short'})).status,400);assert.equal((await request('/api/users','POST',admin,{...fields,role:'employee',password:'LongPassword@123'})).status,400);assert.equal((await request('/api/users','POST',admin,{...fields,employeeId:9999,password:'LongPassword@123'})).status,400)});
  await t.test('admin creates account without password leakage',async()=>{const r=await request('/api/users','POST',admin,{...fields,password:'LongPassword@123'});assert.equal(r.status,201);const data=await r.json();id=data.user.id;assert.equal(data.user.isActive,true);assert.equal('passwordHash'in data.user,false);assert.equal((await request('/api/users','POST',admin,{...fields,password:'LongPassword@123'})).status,409)});
  let account;
  await t.test('account disable revokes sessions and blocks login',async()=>{account=await login(fields.email,'LongPassword@123');assert.equal((await request(`/api/users/${id}`,'PUT',admin,{...fields,isActive:false})).status,200);assert.equal((await request('/api/employees','GET',account)).status,401);assert.equal((await request('/api/login','POST',null,{email:fields.email,password:'LongPassword@123'})).status,401)});
  await t.test('role changes revoke sessions and apply narrowed visibility',async()=>{assert.equal((await request(`/api/users/${id}`,'PUT',admin,{...fields,isActive:true})).status,200);account=await login(fields.email,'LongPassword@123');assert.equal((await request(`/api/users/${id}`,'PUT',admin,{...fields,isActive:true,role:'employee',employeeId:2})).status,200);assert.equal((await request('/api/employees','GET',account)).status,401);account=await login(fields.email,'LongPassword@123');const data=await(await request('/api/employees','GET',account)).json();assert.equal(data.employees.length,1);assert.equal(data.employees[0].id,2)});
  await t.test('admin cannot self-disable or self-demote',async()=>{const self={name:'Admin',email:'admin@peopleflow.vn',role:'admin',employeeId:null,isActive:true};assert.equal((await request('/api/users/1','PUT',admin,{...self,isActive:false})).status,409);assert.equal((await request('/api/users/1','PUT',admin,{...self,role:'hr'})).status,409)});
  await t.test('password reset revokes all sessions and old credential',async()=>{assert.equal((await request(`/api/users/${id}/reset-password`,'POST',admin,{password:'ResetPassword@123'})).status,200);assert.equal((await request('/api/employees','GET',account)).status,401);assert.equal((await request('/api/login','POST',null,{email:fields.email,password:'LongPassword@123'})).status,401);account=await login(fields.email,'ResetPassword@123')});
  await t.test('self password change requires current password and logs out',async()=>{assert.equal((await request('/api/change-password','POST',account,{currentPassword:'wrong',password:'ChangedPassword@123'})).status,401);assert.equal((await request('/api/change-password','POST',account,{currentPassword:'ResetPassword@123',password:'ChangedPassword@123'})).status,200);assert.equal((await request('/api/employees','GET',account)).status,401);account=await login(fields.email,'ChangedPassword@123')});
  await t.test('audit bounded and excludes entered credentials or hashes',async()=>{const r=await request('/api/audit?limit=200','GET',admin);assert.equal(r.status,200);const text=await r.text();const events=JSON.parse(text).events;for(const action of ['user.create','user.update','password.reset','password.change','auth.login'])assert.ok(events.some(e=>e.action===action),action);for(const secret of ['LongPassword@123','ResetPassword@123','ChangedPassword@123','passwordHash','passwordSalt'])assert.equal(text.includes(secret),false);assert.equal((await request('/api/audit?limit=201','GET',admin)).status,400)});
  await t.test('revoked actor denied inside store mutations',async()=>{const u=await store.getUser(id);await assert.rejects(store.addUser({...fields,email:'forbidden@example.com'},u.id),e=>e.status===403)});
});

test('Production fails closed and LOCAL_ONLY restrictions',async()=>{
  for(const env of [{NODE_ENV:'production'},{NODE_ENV:'production',DATA_MODE:'demo'},{NODE_ENV:'production',DATA_MODE:'sqlserver',COOKIE_SECURE:'false',APP_ORIGIN:'https://hr.example.com'}])await assert.rejects(createServer({env}),/Production/);
  for(const [HOST,APP_ORIGIN]of [['0.0.0.0','http://127.0.0.1:3000'],['127.0.0.1','http://192.168.1.10:3000'],['127.0.0.1','http://localhost:4000']])await assert.rejects(createServer({env:{NODE_ENV:'production',DATA_MODE:'sqlserver',LOCAL_ONLY:'true',HOST,APP_ORIGIN,PORT:'3000',COOKIE_SECURE:'false'}}),/LOCAL_ONLY/);
  await assert.rejects(createServer({env:{APP_ORIGIN:'https://hr.example.com/path'}}),/APP_ORIGIN/);
});

test('Health returns 503 for unavailable datastore',async t=>{const store=await createDemoStore();store.health=async()=>{throw new Error('internal connection details')};const server=await createServer({store,env:{}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const response=await fetch(`http://127.0.0.1:${server.address().port}/api/health`);assert.equal(response.status,503);assert.deepEqual(await response.json(),{status:'unavailable'})});

test('LOCAL_ONLY exact Host and Origin checks',async t=>{
  // Inject datastore test-double; no real SQL connection or production data.
  const store=await createDemoStore();store.mode='sqlserver';
  const env={NODE_ENV:'production',DATA_MODE:'sqlserver',LOCAL_ONLY:'true',HOST:'127.0.0.1',PORT:'3000',APP_ORIGIN:'http://127.0.0.1:3000',COOKIE_SECURE:'false'};
  const server=await createServer({store,env});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base+'/api/health')).status,403);
  // Node fetch normalizes Host; use native HTTP for deliberate Host-header tests.
  const raw=(path,method,origin)=>new Promise((resolve,reject)=>{const req=httpRequest(base+path,{method,headers:{host:'127.0.0.1:3000','Content-Type':'application/json',...(origin?{origin}:{})}},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode}))});req.on('error',reject);req.end(method==='POST'?JSON.stringify({email:'admin@peopleflow.vn',password:'Admin@12345'}):undefined)});
  assert.equal((await raw('/api/health','GET')).status,200);
  const login=origin=>raw('/api/login','POST',origin);
  assert.equal((await login()).status,403);
  assert.equal((await login('https://127.0.0.1:3000')).status,403);
  assert.equal((await login('http://localhost:3000')).status,403);
  assert.equal((await login('http://127.0.0.1:3000')).status,200);
});
