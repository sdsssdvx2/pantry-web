import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {getAuth,ownerSessionToken} from '../src/auth-service.js';
import {handleAccessApi} from '../src/access-service.js';

const db=new DatabaseSync(':memory:');
db.exec(fs.readFileSync('migrations/0000_initial_schema.sql','utf8'));
db.exec(fs.readFileSync('migrations/0002_owner_sessions.sql','utf8'));
const DB={
  prepare(sql){
    const stmt={sql,args:[],bind(...args){return {...stmt,args};},
      async first(){return db.prepare(sql).get(...this.args)||null;},
      async all(){return {results:db.prepare(sql).all(...this.args)};},
      async run(){return {meta:{changes:db.prepare(sql).run(...this.args).changes}};}};
    return stmt;
  },
  async batch(statements){
    db.exec('BEGIN');
    try{const result=statements.map(s=>({meta:{changes:db.prepare(s.sql).run(...s.args).changes}}));db.exec('COMMIT');return result;}
    catch(error){db.exec('ROLLBACK');throw error;}
  }
};
const env={DB,OWNER_PASSWORD:'isolated-revocation-password'};
const future='2099-01-01T00:00:00.000Z';
const now='2026-10-14T00:00:00.000Z';
const currentSession='current_owner_session_abcdefghijklmnopqrstuvwxyz';
const currentDevice='current_owner_device_abcdefghijklmnopqrstuvwxyz';
const otherSession='other_owner_session_abcdefghijklmnopqrstuvwxyz';
const otherDevice='other_owner_device_abcdefghijklmnopqrstuvwxyz';

function insertSession(sessionId,deviceId){
  db.prepare('INSERT INTO owner_sessions (session_id,device_id,created_at,last_seen_at,expires_at) VALUES (?,?,?,?,?)').run(sessionId,deviceId,now,now,future);
  db.prepare('INSERT OR IGNORE INTO access_devices (device_id,first_seen_at,last_seen_at,trusted) VALUES (?,?,?,?)').run(deviceId,now,now,1);
}
insertSession(currentSession,currentDevice);
insertSession(otherSession,otherDevice);

const currentToken=await ownerSessionToken(env.OWNER_PASSWORD,currentSession);
const otherToken=await ownerSessionToken(env.OWNER_PASSWORD,otherSession);
const currentRequest=(path)=>new Request(`https://fixture.invalid${path}`,{method:'POST',headers:{cookie:`mlk_owner=${encodeURIComponent(currentToken)}`}});
const otherRequest=()=>new Request('https://fixture.invalid/',{headers:{cookie:`mlk_owner=${encodeURIComponent(otherToken)}`}});

assert.equal((await getAuth(otherRequest(),env)).role,'owner');
const revoke=await handleAccessApi(currentRequest(`/api/access/devices/${encodeURIComponent(otherDevice)}/revoke`),env);
assert.equal(revoke.status,200);
assert.equal((await revoke.json()).revoked,1);
assert.equal((await getAuth(otherRequest(),env)).role,'none','A revoked device must lose owner authorization on its next request');
assert.equal((await getAuth(new Request('https://fixture.invalid/',{headers:{cookie:`mlk_owner=${encodeURIComponent(currentToken)}`}}),env)).role,'owner','Revoking another device must not revoke the current session');

const thirdSession='third_owner_session_abcdefghijklmnopqrstuvwxyz';
const thirdDevice='third_owner_device_abcdefghijklmnopqrstuvwxyz';
insertSession(thirdSession,thirdDevice);
const thirdToken=await ownerSessionToken(env.OWNER_PASSWORD,thirdSession);
const revokeOthers=await handleAccessApi(currentRequest('/api/access/sessions/revoke-others'),env);
assert.equal(revokeOthers.status,200);
assert.ok((await revokeOthers.json()).revoked>=1);
assert.equal((await getAuth(new Request('https://fixture.invalid/',{headers:{cookie:`mlk_owner=${encodeURIComponent(thirdToken)}`}}),env)).role,'none','Revoke-others must invalidate every other active owner session');
assert.equal((await getAuth(new Request('https://fixture.invalid/',{headers:{cookie:`mlk_owner=${encodeURIComponent(currentToken)}`}}),env)).role,'owner');

db.close();
console.log('Per-device and revoke-all-other owner session controls passed.');
