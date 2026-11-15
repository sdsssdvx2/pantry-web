import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/worker.js';
import {ownerSessionToken} from '../src/auth-service.js';

// Real backup routes and SQL; an isolated SQLite database models transactional D1 batches.
const db=new DatabaseSync(':memory:');
db.exec(fs.readFileSync('migrations/0000_initial_schema.sql','utf8'));
db.exec(fs.readFileSync('migrations/0002_owner_sessions.sql','utf8'));
let beforeBatch=null;
const DB={
 prepare(sql){
  const statement={sql,args:[],bind(...args){return {...statement,args};},
   async first(){return db.prepare(sql).get(...this.args)||null;},
   async all(){return {results:db.prepare(sql).all(...this.args)};},
   async run(){return {meta:{changes:db.prepare(sql).run(...this.args).changes}};}};
  return statement;
 },
 async batch(statements){
  if(beforeBatch){const hook=beforeBatch;beforeBatch=null;hook();}
  db.exec('BEGIN');
  try{const result=statements.map(s=>({meta:{changes:db.prepare(s.sql).run(...s.args).changes}}));db.exec('COMMIT');return result;}
  catch(error){db.exec('ROLLBACK');throw error;}
 }
};
const env={DB,OWNER_PASSWORD:'isolated-backup-fixture'};
const sessionId='backup_fixture_owner_session_123456789';
const deviceId='backup_fixture_owner_device_123456789';
db.prepare('INSERT INTO owner_sessions (session_id,device_id,created_at,last_seen_at,expires_at) VALUES (?,?,?,?,?)').run(sessionId,deviceId,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','2099-01-01T00:00:00Z');
const owner=`mlk_owner=${await ownerSessionToken(env.OWNER_PASSWORD,sessionId)}`;
const original=JSON.stringify({version:2,items:['달걀'],stock:{달걀:{notes:['현재 메모']}}});
const target=JSON.stringify({version:2,items:['우유'],ratings:{fixture:4.5}});
const winner=JSON.stringify({version:2,items:['다른 기기의 새 편집']});
const request=(payload,cookie=owner)=>worker.fetch(new Request('https://fixture.invalid/api/backups/restore',{
 method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(payload)
}),env);
const rows=table=>db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all();
const snapshot=()=>JSON.stringify(['owner_state','state_history','backup_snapshots'].map(rows));
function reset(){
 db.exec('DELETE FROM owner_state; DELETE FROM state_history; DELETE FROM backup_snapshots;');
 db.prepare('INSERT INTO owner_state VALUES (1,?,2,?)').run(original,'current');
 db.prepare('INSERT INTO state_history VALUES (1,?,?)').run(target,'older');
 db.prepare('INSERT INTO state_history VALUES (2,?,?)').run(original,'current');
 db.prepare('INSERT INTO backup_snapshots VALUES (?,?,?,?,?,?,?)').run('fixture-target','manual','보관한 백업',target,1,'2026-01-01T00:00:00Z','2026-01-01');
}

for(const payload of [{type:'history',version:1},{type:'snapshot',id:'fixture-target'}]){
 reset();
 const response=await request(payload);
 assert.equal(response.status,200);
 assert.equal((await response.json()).version,3);
 assert.equal(rows('owner_state')[0].data,target);
 assert.equal(db.prepare('SELECT data FROM state_history WHERE version=3').get().data,target);
 const restorePoint=db.prepare("SELECT * FROM backup_snapshots WHERE kind='restore-point'").get();
 assert.equal(restorePoint.data,original,'A restore point must contain the exact pre-restore state');
 assert.equal(restorePoint.source_version,2);
 // Restoring the recovery copy must work too, not only the original target.
 assert.equal((await request({type:'snapshot',id:restorePoint.id})).status,200);
 assert.equal(rows('owner_state')[0].data,original);
}

for(const [table,operation] of [['backup_snapshots','INSERT'],['owner_state','UPDATE'],['state_history','INSERT'],['state_history','DELETE']]){
 reset();
 // A version old enough for pruning makes DELETE failure part of the transaction test.
 db.prepare('UPDATE owner_state SET version=62').run();
 const before=snapshot();
 db.exec(`CREATE TRIGGER fail_restore BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT,'injected_restore_failure'); END`);
 await assert.rejects(request({type:'history',version:1}),/injected_restore_failure/);
 assert.equal(snapshot(),before,`${operation} failure on ${table} must roll back state, history, restore point and pruning`);
 db.exec('DROP TRIGGER fail_restore');
}

reset();
beforeBatch=()=>{
 db.prepare('UPDATE owner_state SET data=?,version=3,updated_at=?').run(winner,'other-writer');
 db.prepare('INSERT INTO state_history VALUES (3,?,?)').run(winner,'other-writer');
};
assert.equal((await request({type:'history',version:1})).status,409);
assert.equal(rows('owner_state')[0].data,winner);
assert.equal(db.prepare('SELECT data FROM state_history WHERE version=3').get().data,winner);
assert.equal(db.prepare("SELECT COUNT(*) n FROM backup_snapshots WHERE kind='restore-point'").get().n,0,'A losing restore must not create or prune recovery copies');

reset();
const untouched=snapshot();
for(const [payload,status] of [[{},400],[{type:'history',version:-1},400],[{type:'history',version:999},404],[{type:'snapshot',id:'missing'},404]]){
 assert.equal((await request(payload)).status,status);assert.equal(snapshot(),untouched);
}
db.prepare('INSERT INTO backup_snapshots VALUES (?,?,?,?,?,?,?)').run('bad','manual','손상 백업','{',1,'old','old');
const corruptBefore=snapshot();
assert.equal((await request({type:'snapshot',id:'bad'})).status,500);assert.equal(snapshot(),corruptBefore);
const token='isolated-share-token-for-backup-test';
db.prepare('INSERT INTO share_links (id,token,label,scope,created_at) VALUES (?,?,?,?,?)').run('share',token,'fixture','reviewer','2026-01-01');
for(const cookie of ['',`mlk_share=${token}`]){
 const response=await request({type:'history',version:1},cookie);
 assert.ok([401,403].includes(response.status));assert.equal(snapshot(),corruptBefore);
}

reset();
for(let version=3;version<=70;version++)db.prepare('INSERT INTO state_history VALUES (?,?,?)').run(version,original,'current');
db.prepare('UPDATE owner_state SET version=70').run();
for(let n=0;n<8;n++)db.prepare('INSERT INTO backup_snapshots VALUES (?,?,?,?,?,?,?)').run('old-restore-'+n,'restore-point','old',original,2,`2026-01-0${n+1}T00:00:00Z`,'2026-01-01');
assert.equal((await request({type:'snapshot',id:'fixture-target'})).status,200);
assert.equal(rows('state_history').length,60);
assert.equal(db.prepare("SELECT COUNT(*) n FROM backup_snapshots WHERE kind='restore-point'").get().n,5);
assert.equal(rows('owner_state')[0].version,71);
db.close();
console.log('Backup restore: exact recovery, transaction rollback, concurrent writes, permissions and retention passed.');
