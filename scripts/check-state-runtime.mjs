import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/worker.js';
import {ownerSessionToken} from '../src/auth-service.js';

// Execute the real Worker SQL against isolated SQLite, with D1's documented
// sequential transactional batch semantics. Never connect to production D1.
const db=new DatabaseSync(':memory:');
db.exec(fs.readFileSync('migrations/0000_initial_schema.sql','utf8'));
db.exec(fs.readFileSync('migrations/0002_owner_sessions.sql','utf8'));
let beforeBatch=null;const queries=[];
const DB={
 prepare(sql){
  const stmt={sql,args:[],bind(...args){return {...stmt,args};},
   async first(){queries.push(sql);return db.prepare(sql).get(...this.args)||null;},
   async run(){queries.push(sql);return {meta:{changes:db.prepare(sql).run(...this.args).changes}};}};
  return stmt;
 },
 async batch(statements){
  if(beforeBatch){const hook=beforeBatch;beforeBatch=null;hook(statements);}
  db.exec('BEGIN');
  try {const result=statements.map(s=>{queries.push(s.sql);return {meta:{changes:db.prepare(s.sql).run(...s.args).changes}};});db.exec('COMMIT');return result;}
  catch(error){db.exec('ROLLBACK');throw error;}
 }
};
const env={DB,OWNER_PASSWORD:'isolated-runtime-fixture'};
const sessionId='state_fixture_owner_session_123456789';
const deviceId='state_fixture_owner_device_123456789';
db.prepare('INSERT INTO owner_sessions (session_id,device_id,created_at,last_seen_at,expires_at) VALUES (?,?,?,?,?)').run(sessionId,deviceId,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','2099-01-01T00:00:00Z');
const cookie=`mlk_owner=${await ownerSessionToken(env.OWNER_PASSWORD,sessionId)}`;
const request=(path,method='GET',body,auth=cookie)=>worker.fetch(new Request('https://fixture.invalid'+path,{method,headers:{cookie:auth,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);
const data=JSON.stringify({version:2,items:['달걀'],curation:[{kind:'private',title:'개인 기록'}]});
const next=JSON.stringify({version:2,items:['달걀','우유']});
assert.equal((await request('/api/state','PUT',{data,baseVersion:0})).status,200);
assert.equal(db.prepare('SELECT data FROM state_history WHERE version=1').get().data,data);
assert.equal((await request('/api/state','PUT',{data,baseVersion:1})).status,200);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM state_history').get().n,1,'Identical saves do not multiply history');

db.exec("CREATE TRIGGER fail_history BEFORE INSERT ON state_history BEGIN SELECT RAISE(ABORT, 'injected_history_failure'); END");
await assert.rejects(request('/api/state','PUT',{data:next,baseVersion:1}),/injected_history_failure/);
assert.equal(db.prepare('SELECT data FROM owner_state').get().data,data,'History failure must roll back the owner update too');
db.exec('DROP TRIGGER fail_history');
assert.equal((await request('/api/state','PUT',{data:next,baseVersion:1})).status,200);
assert.equal(db.prepare('SELECT data FROM state_history WHERE version=2').get().data,next);

const history=await (await request('/api/state?baseVersion=1')).json();
assert.equal(history.baseData,data);assert.equal(history.data,next);assert.equal(history.baseVersion,1);
assert.equal((await (await request('/api/state?baseVersion=-1')).json()).baseData,undefined);
assert.equal((await (await request('/api/state?baseVersion=999')).json()).baseData,undefined);

const winning=JSON.stringify({version:2,items:['버터']});
beforeBatch=()=>{
 db.prepare('UPDATE owner_state SET data=?,version=3,updated_at=?').run(winning,'other-writer');
 db.prepare('INSERT INTO state_history VALUES (3,?,?)').run(winning,'other-writer');
};
const loser=await request('/api/state','PUT',{data,baseVersion:2});
assert.equal(loser.status,409);assert.equal(db.prepare('SELECT data FROM owner_state').get().data,winning);
assert.equal(db.prepare('SELECT data FROM state_history WHERE version=3').get().data,winning,'A losing CAS must not overwrite winning history');
assert.equal(db.prepare('SELECT client_data FROM sync_conflicts ORDER BY id DESC LIMIT 1').get().client_data,data);

const token='fixture-read-only-token-for-runtime-check';
db.prepare('INSERT INTO share_links (id,token,label,scope,created_at) VALUES (?,?,?,?,?)').run('fixture',token,'fixture','viewer','2026-09-20');
queries.length=0;
const viewer=await (await request('/api/state?baseVersion=1','GET',null,`mlk_share=${token}`)).json();
assert.equal(viewer.baseData,undefined);assert.equal(viewer.baseVersion,undefined);
assert.ok(!queries.some(sql=>sql.includes('state_history')),'Read-only links must never read private history for reconciliation');
assert.equal((await request('/api/state','PUT',{data,baseVersion:3},`mlk_share=${token}`)).status,403);
assert.equal((await request('/api/state?baseVersion=1','GET',null,'')).status,401);

db.exec('DELETE FROM owner_state; DELETE FROM state_history; DELETE FROM sync_conflicts;');
beforeBatch=()=>{
 db.prepare('INSERT INTO owner_state VALUES (1,?,1,?)').run(winning,'first-writer');
 db.prepare('INSERT INTO state_history VALUES (1,?,?)').run(winning,'first-writer');
};
assert.equal((await request('/api/state','PUT',{data,baseVersion:0})).status,409,'Concurrent first creation must return conflict, not 500');
assert.equal(db.prepare('SELECT data FROM state_history').get().data,winning);
for(let version=1;version<65;version++)assert.equal((await request('/api/state','PUT',{data:JSON.stringify({version:2,items:['재료'+version]}),baseVersion:version})).status,200);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM state_history').get().n,60);
const pruned=await (await request('/api/state?baseVersion=1')).json();
assert.equal(pruned.baseData,null,'Expired base history must explicitly fall back to recoverable conflict handling');
db.close();
console.log('Worker SQLite: atomic state/history, concurrent writers, owner-only base history, and read-only boundaries passed.');
