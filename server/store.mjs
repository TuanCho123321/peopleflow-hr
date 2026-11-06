import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive=promisify(scrypt);
const failure=(status,message)=>Object.assign(new Error(message),{status});

export async function passwordRecord(password) {
  const salt = randomBytes(16).toString('hex');
  return { passwordSalt: salt, passwordHash: (await derive(password, salt, 64)).toString('hex') };
}
export async function verifyPassword(password,user){const actual=await derive(password,user?.passwordSalt||'invalid-account',64);const expected=Buffer.from(user?.passwordHash||'00'.repeat(64),'hex');return !!user&&actual.length===expected.length&&timingSafeEqual(actual,expected)}
export const employeeFields = ['code','name','email','phone','department','position','status','startDate','salary'];
const names = [
  ['Nguyễn Minh Anh','Nhân sự','Trưởng phòng nhân sự'], ['Trần Hoàng Nam','Công nghệ','Senior Developer'],
  ['Lê Thảo Nguyên','Thiết kế','Product Designer'], ['Phạm Đức Huy','Kinh doanh','Chuyên viên kinh doanh'],
  ['Võ Ngọc Linh','Marketing','Content Marketing'], ['Đặng Quốc Bảo','Công nghệ','Frontend Developer'],
  ['Bùi Hà My','Tài chính','Kế toán tổng hợp'], ['Đỗ Tuấn Kiệt','Công nghệ','Backend Developer'],
  ['Hoàng Yến Nhi','Nhân sự','Chuyên viên tuyển dụng'], ['Ngô Gia Hân','Thiết kế','UI Designer'],
  ['Trịnh Minh Khang','Kinh doanh','Trưởng nhóm kinh doanh'], ['Dương Thu Hà','Marketing','Marketing Executive']
];
export async function createDemoStore() {
  let employees = names.map(([name,department,position],i)=>({id:i+1,code:`NV${String(i+1).padStart(3,'0')}`,name,email:i===0?'employee@peopleflow.vn':`nhanvien${i+1}@peopleflow.vn`,phone:`090${String(1234500+i).padStart(7,'0')}`,department,position,status:i===4?'leave':i===7||i===11?'probation':'active',startDate:`202${3+i%3}-${String(1+i%10).padStart(2,'0')}-15`,salary:12000000+i*1500000}));
  const users = [
    {id:1,name:'Minh Anh',email:'admin@peopleflow.vn',role:'admin',employeeId:null,isActive:true,...await passwordRecord('Admin@12345')},
    {id:2,name:'Hoàng Nam',email:'hr@peopleflow.vn',role:'hr',employeeId:null,isActive:true,...await passwordRecord('Hr@12345')},
    {id:3,name:'Nguyễn Minh Anh',email:'employee@peopleflow.vn',role:'employee',employeeId:1,isActive:true,...await passwordRecord('Staff@12345')}
  ];
  const sessions=new Map(),events=[];
  const invalidate=id=>{for(const [key,s]of sessions)if(s.userId===id)sessions.delete(key)};
  const audit=(actorId,action,targetType,targetId)=>{events.push({id:events.length+1,actorId,action,targetType,targetId:targetId==null?null:String(targetId),createdAt:new Date().toISOString()})};
  const validateActor=(actorId,roles)=>{const actor=users.find(u=>u.id===actorId);if(!actor?.isActive||roles&&!roles.includes(actor.role))throw failure(403,'Quyền thực hiện đã thay đổi.');};
  const validateUser=(e,id)=>{if(users.some(u=>u.id!==id&&u.email===e.email))throw failure(409,'Email tài khoản đã tồn tại.');if(e.employeeId!==null&&!employees.some(x=>x.id===e.employeeId))throw failure(400,'Hồ sơ nhân viên không tồn tại.');if(e.employeeId!==null&&users.some(u=>u.id!==id&&u.employeeId===e.employeeId))throw failure(409,'Nhân viên đã liên kết tài khoản khác.')};
  return {
    mode:'demo', async health(){}, async findUser(email){const u=users.find(u=>u.email===email);return u?{...u}:null}, async getUser(id){const u=users.find(u=>u.id===id);return u?{...u}:null},
    async users(){return users}, async employees(){return employees},
    async add(e,actorId){validateActor(actorId,['admin','hr']);const row={id:Math.max(0,...employees.map(x=>x.id))+1,...e};employees.push(row);audit(actorId,'employee.create','employee',row.id);return row},
    async update(id,e,actorId){validateActor(actorId,['admin','hr']);const index=employees.findIndex(x=>x.id===id);if(index<0)return null;employees[index]={id,...e};audit(actorId,'employee.update','employee',id);return employees[index]},
    async remove(id,actorId){validateActor(actorId,['admin']);const index=employees.findIndex(x=>x.id===id);if(index<0)return false;if(users.some(u=>u.employeeId===id))throw failure(409,'Nhân viên đang liên kết với tài khoản.');employees.splice(index,1);audit(actorId,'employee.delete','employee',id);return true},
    async getSession(key){const value=sessions.get(key);if(value&&value.expires<=Date.now()){sessions.delete(key);return null}return value},
    async createSession(key,userId,expires,expectedHash){const user=users.find(u=>u.id===userId);if(!user?.isActive||user.passwordHash!==expectedHash)throw failure(401,'Tài khoản hoặc mật khẩu đã thay đổi.');sessions.set(key,{userId,expires});audit(userId,'auth.login','user',userId)},
    async deleteSession(key){sessions.delete(key)},async invalidateSessions(id){invalidate(id)},
    async audit(actorId,action,targetType,targetId){audit(actorId,action,targetType,targetId)},async auditEvents(limit){return events.slice(-limit).reverse()},
    async addUser(data,actorId){validateActor(actorId,['admin']);validateUser(data);const u={id:Math.max(...users.map(x=>x.id))+1,...data,isActive:true};users.push(u);audit(actorId,'user.create','user',u.id);return u},
    async updateUser(id,data,actorId){validateActor(actorId,['admin']);const u=users.find(x=>x.id===id);if(!u)return null;validateUser(data,id);if(id===actorId&&(!data.isActive||data.role!=='admin'))throw failure(409,'Không thể tự khóa hoặc hạ quyền tài khoản quản trị.');if(u.role==='admin'&&u.isActive&&(!data.isActive||data.role!=='admin')&&users.filter(x=>x.role==='admin'&&x.isActive).length<=1)throw failure(409,'Phải giữ ít nhất một quản trị viên hoạt động.');Object.assign(u,data);invalidate(id);audit(actorId,'user.update','user',id);return u},
    async setPassword(id,record,actorId,expectedHash){validateActor(actorId,expectedHash?null:['admin']);if(expectedHash&&id!==actorId)throw failure(403,'Không được đổi mật khẩu tài khoản khác.');const u=users.find(x=>x.id===id);if(!u)return false;if(expectedHash&&u.passwordHash!==expectedHash)throw failure(409,'Mật khẩu đã thay đổi. Vui lòng thử lại.');Object.assign(u,record);invalidate(id);audit(actorId,expectedHash?'password.change':'password.reset','user',id);return true}
  };
}

export async function createSqlStore(env=process.env) {
  const windows=env.SQL_AUTH==='windows';
  if(env.SQL_AUTH&&!['windows','sql'].includes(env.SQL_AUTH))throw new Error('SQL_AUTH phải là windows hoặc sql.');
  for(const key of windows?['SQL_CONNECTION_STRING']:['SQL_SERVER','SQL_DATABASE','SQL_USER','SQL_PASSWORD'])if(!env[key])throw new Error(`Thiếu cấu hình ${key}`);
  const {default:sql}=await import(windows?'mssql/msnodesqlv8.js':'mssql');
  const config=windows?{connectionString:env.SQL_CONNECTION_STRING}:{server:env.SQL_SERVER,database:env.SQL_DATABASE,user:env.SQL_USER,password:env.SQL_PASSWORD,port:Number(env.SQL_PORT||1433),options:{encrypt:env.SQL_ENCRYPT!=='false',trustServerCertificate:env.SQL_TRUST_CERT==='true'}};
  const pool=await new sql.ConnectionPool({...config,pool:{max:10,min:0,idleTimeoutMillis:30000},connectionTimeout:10000}).connect();
  const employeeSelect='Id AS id, Code AS code, Name AS name, Email AS email, Phone AS phone, Department AS department, Position AS position, Status AS status, CONVERT(varchar(10), StartDate, 23) AS startDate, Salary AS salary';
  const userSelect='Id AS id, Name AS name, Email AS email, Role AS role, EmployeeId AS employeeId, IsActive AS isActive, PasswordSalt AS passwordSalt, PasswordHash AS passwordHash';
  const req=context=>context?new sql.Request(context):pool.request();
  function request(e,context){const r=req(context);for(const k of employeeFields)r.input(k,k==='salary'?sql.Decimal(18,2):k==='startDate'?sql.Date:sql.NVarChar(k==='name'?150:k==='email'?254:k==='code'?20:k==='phone'?30:100),e[k]);return r}
  function friendly(err){if([2601,2627].includes(err.number))return Object.assign(new Error('Mã nhân viên hoặc email đã tồn tại.'),{status:409});if(err.number===547)return Object.assign(new Error('Nhân viên đang liên kết với tài khoản.'),{status:409});return err}
  const audit=async(context,actorId,action,targetType,targetId)=>{await req(context).input('actor',sql.Int,actorId??null).input('action',sql.NVarChar(80),action).input('type',sql.NVarChar(40),targetType).input('target',sql.NVarChar(100),targetId==null?null:String(targetId)).query('INSERT dbo.AuditLogs (ActorId,Action,TargetType,TargetId) VALUES (@actor,@action,@type,@target)')};
  async function transaction(callback){const tx=new sql.Transaction(pool);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);try{await req(tx).query('SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON; SET NUMERIC_ROUNDABORT OFF;');const result=await callback(tx);await tx.commit();return result}catch(error){try{await tx.rollback()}catch{}throw friendly(error)}}
  const lockUsers=async tx=>(await req(tx).query(`SELECT ${userSelect} FROM dbo.Users WITH (UPDLOCK,HOLDLOCK) ORDER BY Id`)).recordset;
  const authorize=async(tx,actorId,roles)=>{const users=await lockUsers(tx);const actor=users.find(u=>u.id===actorId);if(!actor?.isActive||roles&&!roles.includes(actor.role))throw failure(403,'Tài khoản không còn quyền thực hiện thao tác.');return users};
  function userParams(r,data){return r.input('name',sql.NVarChar(150),data.name).input('email',sql.NVarChar(254),data.email).input('role',sql.NVarChar(20),data.role).input('employee',sql.Int,data.employeeId)}
  return {mode:'sqlserver',pool,async health(){await pool.request().query('SELECT 1 AS ok')},
    async findUser(email){return (await pool.request().input('email',sql.NVarChar(254),email).query(`SELECT ${userSelect} FROM dbo.Users WHERE Email=@email`)).recordset[0]},
    async getUser(id){return (await pool.request().input('id',sql.Int,id).query(`SELECT ${userSelect} FROM dbo.Users WHERE Id=@id`)).recordset[0]},
    async users(){return (await pool.request().query(`SELECT ${userSelect} FROM dbo.Users`)).recordset},
    async employees(){return (await pool.request().query(`SELECT ${employeeSelect} FROM dbo.Employees ORDER BY Id`)).recordset},
    async add(e,actorId){return transaction(async tx=>{await authorize(tx,actorId,['admin','hr']);const result=await request(e,tx).query(`INSERT dbo.Employees (Code,Name,Email,Phone,Department,Position,Status,StartDate,Salary) OUTPUT INSERTED.Id AS id VALUES (@code,@name,@email,@phone,@department,@position,@status,@startDate,@salary)`);const row={id:result.recordset[0].id,...e};await audit(tx,actorId,'employee.create','employee',row.id);return row})},
    async update(id,e,actorId){return transaction(async tx=>{await authorize(tx,actorId,['admin','hr']);const result=await request(e,tx).input('id',sql.Int,id).query('UPDATE dbo.Employees SET Code=@code,Name=@name,Email=@email,Phone=@phone,Department=@department,Position=@position,Status=@status,StartDate=@startDate,Salary=@salary WHERE Id=@id');if(!result.rowsAffected[0])return null;await audit(tx,actorId,'employee.update','employee',id);return {id,...e}})},
    async remove(id,actorId){return transaction(async tx=>{await authorize(tx,actorId,['admin']);const result=await req(tx).input('id',sql.Int,id).query('DELETE dbo.Employees WHERE Id=@id');if(!result.rowsAffected[0])return false;await audit(tx,actorId,'employee.delete','employee',id);return true})},
    async getSession(key){return (await pool.request().input('hash',sql.VarChar(64),key).query('SELECT UserId AS userId, ExpiresAt AS expires FROM dbo.Sessions WHERE TokenHash=@hash AND ExpiresAt>SYSUTCDATETIME()')).recordset.map(s=>({...s,expires:new Date(s.expires).getTime()}))[0]},
    async createSession(key,userId,expires,expectedHash){await transaction(async tx=>{const users=await lockUsers(tx);const user=users.find(u=>u.id===userId);if(!user?.isActive||user.passwordHash!==expectedHash)throw failure(401,'Tài khoản hoặc mật khẩu đã thay đổi.');await req(tx).input('hash',sql.VarChar(64),key).input('id',sql.Int,userId).input('expires',sql.DateTime2,new Date(expires)).query('DELETE dbo.Sessions WHERE ExpiresAt<=SYSUTCDATETIME(); INSERT dbo.Sessions (TokenHash,UserId,ExpiresAt) VALUES (@hash,@id,@expires)');await audit(tx,userId,'auth.login','user',userId)})},
    async deleteSession(key){await pool.request().input('hash',sql.VarChar(64),key).query('DELETE dbo.Sessions WHERE TokenHash=@hash')},
    async invalidateSessions(id){await pool.request().input('id',sql.Int,id).query('DELETE dbo.Sessions WHERE UserId=@id')},
    async audit(actorId,action,targetType,targetId){await audit(null,actorId,action,targetType,targetId)},
    async auditEvents(limit){return (await pool.request().input('limit',sql.Int,limit).query('SELECT TOP (@limit) Id AS id, ActorId AS actorId, Action AS action, TargetType AS targetType, TargetId AS targetId, CreatedAt AS createdAt FROM dbo.AuditLogs ORDER BY Id DESC')).recordset},
    async addUser(data,actorId){return transaction(async tx=>{await authorize(tx,actorId,['admin']);const result=await userParams(req(tx),data).input('salt',sql.NVarChar(128),data.passwordSalt).input('hash',sql.NVarChar(256),data.passwordHash).query('INSERT dbo.Users (Name,Email,Role,EmployeeId,IsActive,PasswordSalt,PasswordHash) OUTPUT INSERTED.Id AS id VALUES (@name,@email,@role,@employee,1,@salt,@hash)');const id=result.recordset[0].id;await audit(tx,actorId,'user.create','user',id);return {id,...data,isActive:true}})},
    async updateUser(id,data,actorId){return transaction(async tx=>{const users=await authorize(tx,actorId,['admin']);const u=users.find(x=>x.id===id);if(!u)return null;if(id===actorId&&(!data.isActive||data.role!=='admin'))throw failure(409,'Không thể tự khóa hoặc hạ quyền tài khoản quản trị.');if(u.role==='admin'&&u.isActive&&(!data.isActive||data.role!=='admin')&&users.filter(x=>x.role==='admin'&&x.isActive).length<=1)throw failure(409,'Phải giữ ít nhất một quản trị viên hoạt động.');await userParams(req(tx),data).input('id',sql.Int,id).input('active',sql.Bit,data.isActive).query('UPDATE dbo.Users SET Name=@name,Email=@email,Role=@role,EmployeeId=@employee,IsActive=@active WHERE Id=@id; DELETE dbo.Sessions WHERE UserId=@id');await audit(tx,actorId,'user.update','user',id);return {...u,...data}})},
    async setPassword(id,record,actorId,expectedHash){return transaction(async tx=>{const users=await authorize(tx,actorId,expectedHash?null:['admin']);if(expectedHash&&id!==actorId)throw failure(403,'Forbidden password change.');const u=users.find(x=>x.id===id);if(!u)return false;if(expectedHash&&u.passwordHash!==expectedHash)throw failure(409,'Mật khẩu đã thay đổi. Vui lòng thử lại.');await req(tx).input('id',sql.Int,id).input('salt',sql.NVarChar(128),record.passwordSalt).input('hash',sql.NVarChar(256),record.passwordHash).query('UPDATE dbo.Users SET PasswordSalt=@salt,PasswordHash=@hash WHERE Id=@id; DELETE dbo.Sessions WHERE UserId=@id');await audit(tx,actorId,expectedHash?'password.change':'password.reset','user',id);return true})}
  };
}
