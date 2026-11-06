import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDemoStore, createSqlStore, employeeFields, passwordRecord, verifyPassword } from './store.mjs';

const publicPath=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const publicUser=u=>u?{id:u.id,name:u.name,email:u.email,role:u.role,employeeId:u.employeeId,isActive:!!u.isActive}:null;
const fail=(status,message)=>Object.assign(new Error(message),{status});
function validPassword(value){if(typeof value!=='string'||value.length<12||value.length>256)throw fail(400,'Mật khẩu phải có từ 12 đến 256 ký tự.');return value}
function validateUser(data,editing=false){
  const result={};
  if(typeof data.name!=='string'||!data.name.trim()||data.name.trim().length>150)throw fail(400,'Tên tài khoản không hợp lệ.');result.name=data.name.trim();
  if(typeof data.email!=='string'||data.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()))throw fail(400,'Email không hợp lệ.');result.email=data.email.trim().toLowerCase();
  if(!['admin','hr','employee'].includes(data.role))throw fail(400,'Vai trò không hợp lệ.');result.role=data.role;
  if(data.employeeId!==null&&(!Number.isSafeInteger(data.employeeId)||data.employeeId<1||data.employeeId>2147483647))throw fail(400,'Mã hồ sơ liên kết không hợp lệ.');result.employeeId=data.employeeId;
  if(result.role==='employee'&&result.employeeId===null)throw fail(400,'Tài khoản nhân viên cần liên kết hồ sơ.');
  if(editing){if(typeof data.isActive!=='boolean')throw fail(400,'Trạng thái tài khoản không hợp lệ.');result.isActive=data.isActive}
  return result;
}
function validateEmployee(data){
  const result={};
  for(const key of employeeFields){
    if(key==='salary'){const value=Number(data[key]);if(data[key]==null||data[key]===''||!Number.isFinite(value)||value<0||value>1e12)throw fail(400,'Mức lương không hợp lệ.');result[key]=value;continue}
    if(typeof data[key]!=='string')throw fail(400,`Thiếu trường ${key}.`);
    result[key]=data[key].trim();
    const max=key==='code'?20:key==='phone'?30:key==='name'?150:key==='email'?254:100;
    if((!result[key]&&key!=='phone')||result[key].length>max)throw fail(400,`Trường ${key} không hợp lệ.`);
  }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))throw fail(400,'Email không hợp lệ.');
  result.email=result.email.toLowerCase();
  if(!['active','probation','leave'].includes(result.status))throw fail(400,'Trạng thái không hợp lệ.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(result.startDate)||!Number.isFinite(Date.parse(result.startDate))||new Date(result.startDate).toISOString().slice(0,10)!==result.startDate)throw fail(400,'Ngày bắt đầu không hợp lệ.');
  return result;
}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>20000)throw fail(413,'Dữ liệu quá lớn.')}try{const data=JSON.parse(raw||'{}');if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();return data}catch{throw fail(400,'JSON không hợp lệ.')}}
export async function createServer({store,env=process.env}={}){
  if(env.DATA_MODE&&!['demo','sqlserver'].includes(env.DATA_MODE))throw new Error('DATA_MODE phải là demo hoặc sqlserver.');
  const production=env.NODE_ENV==='production';
  const localOnly=production&&env.LOCAL_ONLY==='true';
  let appOrigin=null;
  if(env.APP_ORIGIN){let parsed;try{parsed=new URL(env.APP_ORIGIN)}catch{throw new Error('APP_ORIGIN không hợp lệ.')};if(parsed.origin!==env.APP_ORIGIN||!['http:','https:'].includes(parsed.protocol))throw new Error('APP_ORIGIN phải là origin đầy đủ, không có đường dẫn.');appOrigin=parsed.origin}
  if(production&&env.DATA_MODE!=='sqlserver')throw new Error('Production yêu cầu DATA_MODE=sqlserver.');
  if(localOnly){const origin=appOrigin?new URL(appOrigin):null;const port=String(env.PORT||3000);if(!['127.0.0.1','::1'].includes(env.HOST||'127.0.0.1')||!origin||origin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname)||(origin.port||'80')!==port||env.COOKIE_SECURE!=='false')throw new Error('LOCAL_ONLY yêu cầu HOST loopback, APP_ORIGIN http loopback đúng PORT và COOKIE_SECURE=false.')}
  else if(production&&(env.COOKIE_SECURE!=='true'||!appOrigin?.startsWith('https://')))throw new Error('Production yêu cầu COOKIE_SECURE=true và APP_ORIGIN=https://...');
  store??=env.DATA_MODE==='sqlserver'?await createSqlStore(env):await createDemoStore();
  if(production&&store.mode!=='sqlserver')throw new Error('Production không cho phép dữ liệu demo.');
  const attempts=new Map();
  function rateLimit(key){const now=Date.now();for(const [address,state]of attempts)if(state.until<now)attempts.delete(address);const state=attempts.get(key)||{count:0,until:now+15*60*1000};if(state.count>=10)throw fail(429,'Quá nhiều lần thử. Vui lòng thử lại sau 15 phút.');if(attempts.size>=10000&&!attempts.has(key))throw fail(429,'Máy chủ đang bận. Vui lòng thử lại.');state.count++;attempts.set(key,state)}
  const secure=env.COOKIE_SECURE==='true';
  const cookie=(token,age)=>`peopleflow_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`;
  const digest=value=>createHash('sha256').update(value).digest('hex');
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
    if(production&&!localOnly)res.setHeader('Strict-Transport-Security','max-age=31536000');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://images.unsplash.com https://i.pravatar.cc; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
    try{
      const url=new URL(req.url,'http://localhost');
      if(localOnly&&req.headers.host!==new URL(appOrigin).host)throw fail(403,'Host không được phép.');
      if(!url.pathname.startsWith('/api/')){
        if(!['GET','HEAD'].includes(req.method))throw fail(405,'Phương thức không được hỗ trợ.');
        const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
        const filename=path.resolve(publicPath,relative);
        if(!filename.startsWith(publicPath+path.sep)&&filename!==path.join(publicPath,'index.html'))throw fail(403,'Không được phép.');
        let bytes;try{bytes=await readFile(filename)}catch{throw fail(404,'Không tìm thấy trang.')}
        const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
        res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:bytes);return;
      }
      if(url.pathname==='/api/health'&&req.method==='GET'){try{await store.health();send(200,{status:'ok'})}catch{send(503,{status:'unavailable'})}return}
      if(['POST','PUT','DELETE','PATCH'].includes(req.method)){
        if(production&&!req.headers.origin)throw fail(403,'Yêu cầu Origin để thực hiện thay đổi.');
        if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin)}catch{throw fail(403,'Nguồn yêu cầu không hợp lệ.')};const expected=appOrigin||`${req.socket.encrypted?'https':'http'}://${req.headers.host}`;if(origin.origin!==expected||origin.origin!==req.headers.origin)throw fail(403,'Nguồn yêu cầu không được phép.')}
        if(req.headers['sec-fetch-site']==='cross-site')throw fail(403,'Nguồn yêu cầu không được phép.');
        if(['POST','PUT','PATCH'].includes(req.method)&&!req.headers['content-type']?.startsWith('application/json'))throw fail(415,'Yêu cầu Content-Type application/json.');
      }
      const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('peopleflow_session='))?.slice(19);
      const key=token&&/^[a-f0-9]{64}$/.test(token)?digest(token):null, session=key?await store.getSession(key):null;
      const candidate=session&&session.expires>Date.now()?await store.getUser(session.userId):null;
      const user=candidate?.isActive?candidate:null;
      if(url.pathname==='/api/session'&&req.method==='GET'){send(200,{user:publicUser(user),mode:store.mode});return}
      if(url.pathname==='/api/login'&&req.method==='POST'){
        const ip=`login:${req.socket.remoteAddress}`;const now=Date.now();
        const data=await body(req);if(typeof data.email!=='string'||typeof data.password!=='string'||data.password.length>256)throw fail(400,'Email hoặc mật khẩu không hợp lệ.');
        rateLimit(ip);
        const found=await store.findUser(data.email.trim().toLowerCase());
        if(!await verifyPassword(data.password,found)||!found?.isActive){await store.audit(null,'auth.login_failed','auth',null);throw fail(401,'Email hoặc mật khẩu không đúng.')}
        attempts.delete(ip);if(key)await store.deleteSession(key);
        const newToken=randomBytes(32).toString('hex');await store.createSession(digest(newToken),found.id,now+8*60*60*1000,found.passwordHash);
        res.setHeader('Set-Cookie',cookie(newToken,28800));send(200,{user:publicUser(found)});return;
      }
      if(url.pathname==='/api/logout'&&req.method==='POST'){if(key)await store.deleteSession(key);if(user)await store.audit(user.id,'auth.logout','user',user.id);res.setHeader('Set-Cookie',cookie('',0));send(200,{ok:true});return}
      if(!user)throw fail(401,'Vui lòng đăng nhập.');
      if(url.pathname==='/api/users'&&req.method==='GET'){if(user.role!=='admin')throw fail(403,'Chỉ quản trị viên được xem tài khoản.');send(200,{users:(await store.users()).map(publicUser)});return}
      if(url.pathname==='/api/audit'&&req.method==='GET'){if(user.role!=='admin')throw fail(403,'Chỉ quản trị viên được xem nhật ký.');const limit=Number(url.searchParams.get('limit')||100);if(!Number.isInteger(limit)||limit<1||limit>200)throw fail(400,'Giới hạn nhật ký từ 1 đến 200.');send(200,{events:await store.auditEvents(limit)});return}
      if(url.pathname==='/api/change-password'&&req.method==='POST'){
        const data=await body(req);validPassword(data.password);if(typeof data.currentPassword!=='string'||data.currentPassword.length>256)throw fail(400,'Mật khẩu hiện tại không hợp lệ.');rateLimit(`password:${user.id}`);
        if(!await verifyPassword(data.currentPassword,user))throw fail(401,'Mật khẩu hiện tại không đúng.');
        const expectedHash=user.passwordHash;await store.setPassword(user.id,await passwordRecord(data.password),user.id,expectedHash);attempts.delete(`password:${user.id}`);res.setHeader('Set-Cookie',cookie('',0));send(200,{ok:true});return;
      }
      const userMatch=url.pathname.match(/^\/api\/users\/(\d+)$/),resetMatch=url.pathname.match(/^\/api\/users\/(\d+)\/reset-password$/);
      if(url.pathname==='/api/users'&&req.method==='POST'||userMatch&&req.method==='PUT'||resetMatch&&req.method==='POST'){
        if(user.role!=='admin')throw fail(403,'Chỉ quản trị viên được quản lý tài khoản.');
        const data=await body(req);
        if(resetMatch){validPassword(data.password);if(!await store.setPassword(Number(resetMatch[1]),await passwordRecord(data.password),user.id))throw fail(404,'Không tìm thấy tài khoản.');if(Number(resetMatch[1])===user.id)res.setHeader('Set-Cookie',cookie('',0));send(200,{ok:true});return}
        const fields=validateUser(data,!!userMatch);
        if(fields.employeeId!==null&&!(await store.employees()).some(e=>e.id===fields.employeeId))throw fail(400,'Hồ sơ nhân viên không tồn tại.');
        const record=userMatch?fields:{...fields,...await passwordRecord(validPassword(data.password))};
        const result=userMatch?await store.updateUser(Number(userMatch[1]),record,user.id):await store.addUser(record,user.id);
        if(!result)throw fail(404,'Không tìm thấy tài khoản.');send(userMatch?200:201,{user:publicUser(result)});return;
      }
      const all=await store.employees();const visible=user.role==='employee'?all.filter(e=>e.id===user.employeeId):all;
      if(url.pathname==='/api/employees'&&req.method==='GET'){let employees=visible;for(const field of ['department','status'])if(url.searchParams.get(field))employees=employees.filter(e=>e[field]===url.searchParams.get(field));const q=url.searchParams.get('q')?.toLowerCase();if(q)employees=employees.filter(e=>[e.name,e.code,e.email].some(v=>v.toLowerCase().includes(q)));send(200,{employees});return}
      if(url.pathname==='/api/stats'&&req.method==='GET'){
        if(!['admin','hr'].includes(user.role))throw fail(403,'Bạn không có quyền xem thống kê toàn công ty.');
        const departments=[...new Set(visible.map(e=>e.department))].map(name=>({name,count:visible.filter(e=>e.department===name).length}));
        const total=visible.length;send(200,{total,active:visible.filter(e=>e.status==='active').length,probation:visible.filter(e=>e.status==='probation').length,leave:visible.filter(e=>e.status==='leave').length,departments,totalSalary:visible.reduce((a,e)=>a+Number(e.salary),0),newThisMonth:visible.filter(e=>e.startDate.slice(0,7)===new Date().toISOString().slice(0,7)).length});return;
      }
      const match=url.pathname.match(/^\/api\/employees\/(\d+)$/);
      if(url.pathname==='/api/employees'&&req.method==='POST'||match&&req.method==='PUT'){
        if(!['admin','hr'].includes(user.role))throw fail(403,'Bạn không có quyền thay đổi hồ sơ.');
        const data=validateEmployee(await body(req));const id=match?Number(match[1]):null;
        if(all.some(e=>e.id!==id&&(e.code.toLowerCase()===data.code.toLowerCase()||e.email.toLowerCase()===data.email.toLowerCase())))throw fail(409,'Mã nhân viên hoặc email đã tồn tại.');
        const employee=id?await store.update(id,data,user.id):await store.add(data,user.id);if(!employee)throw fail(404,'Không tìm thấy nhân viên.');send(id?200:201,{employee});return;
      }
      if(match&&req.method==='DELETE'){if(user.role!=='admin')throw fail(403,'Chỉ quản trị viên được xóa nhân viên.');if(!await store.remove(Number(match[1]),user.id))throw fail(404,'Không tìm thấy nhân viên.');send(200,{ok:true});return}
      throw fail(404,'Không tìm thấy API.');
    }catch(error){if(!res.headersSent)send(error.status||500,{error:error.status?error.message:'Có lỗi máy chủ. Vui lòng thử lại.'});if(!error.status)console.error('Request failed:',error.code||error.name)}
  });
  server.store=store;return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const server=await createServer();const port=Number(process.env.PORT||3000);server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`PeopleFlow: http://localhost:${port} (${server.store.mode})`))}catch(error){console.error('Không thể khởi động:',error.message);process.exitCode=1}
}
