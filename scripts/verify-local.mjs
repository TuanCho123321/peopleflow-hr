import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
const base='http://127.0.0.1:3000';
const ticket=new URL('../.local/verification-session.json',import.meta.url);
const api=(path,options={})=>fetch(base+path,options);
if(process.argv[2]==='before'){
 const text=await readFile(new URL('../.local/initial-admin.txt',import.meta.url),'utf8');
 const password=text.match(/Mật khẩu: (.+)/)[1].trim();
 const r=await api('/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({email:'admin@peopleflow.local',password})});
 assert.equal(r.status,200);const user=(await r.json()).user;assert.equal(user.role,'admin');
 const cookie=r.headers.get('set-cookie').split(';')[0];
 const session=await (await api('/api/session',{headers:{cookie}})).json();assert.equal(session.mode,'sqlserver');
 const employees=await (await api('/api/employees',{headers:{cookie}})).json();assert.deepEqual(employees.employees,[]);
 await writeFile(ticket,JSON.stringify({cookie,id:user.id}),{mode:0o600});
 console.log('PASS official SQL login; no demo employees; session ticket saved privately for restart verification.');
}else if(process.argv[2]==='after'){
 const {cookie,id}=JSON.parse(await readFile(ticket,'utf8'));
 const r=await api('/api/session',{headers:{cookie}});const data=await r.json();assert.equal(data.user?.id,id);assert.equal(data.mode,'sqlserver');
 const logout=await api('/api/logout',{method:'POST',headers:{cookie,Origin:base,'Content-Type':'application/json'},body:'{}'});assert.equal(logout.status,200);
 assert.equal((await api('/api/employees',{headers:{cookie}})).status,401);await unlink(ticket);
 console.log('PASS official SQL session survives process restart; logout revokes it.');
}else throw Error('Use before or after.');
