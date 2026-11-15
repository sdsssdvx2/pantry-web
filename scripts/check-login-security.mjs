import assert from 'node:assert/strict';
import {LOGIN_BLOCK_MS,LOGIN_MAX_FAILURES,checkLoginRateLimit,clearLoginFailures,recordLoginFailure} from '../src/login-security.js';

class FakeDB {
  constructor(){this.rows=new Map();}
  prepare(sql){
    const normalized=String(sql).replace(/\s+/g,' ').trim();
    return {bind:(...args)=>({
      first:async()=>{
        if(normalized.startsWith('SELECT failures,window_started_at,blocked_until FROM login_rate_limits WHERE bucket=?')){
          const row=this.rows.get(args[0]);return row?{...row}:null;
        }
        throw new Error(`Unexpected first(): ${normalized}`);
      },
      run:async()=>{
        if(normalized.startsWith('DELETE FROM login_rate_limits WHERE bucket=?')){
          const changed=this.rows.delete(args[0]);return {meta:{changes:changed?1:0}};
        }
        if(normalized.startsWith('DELETE FROM login_rate_limits WHERE updated_at<?')){
          const cutoff=Date.parse(args[0]);let changes=0;
          for(const [key,row] of this.rows){if(Date.parse(row.updated_at)<cutoff){this.rows.delete(key);changes++;}}
          return {meta:{changes}};
        }
        if(normalized.startsWith('INSERT INTO login_rate_limits')){
          const [bucket,nowIso,updatedAt,cutoffIso,_cutoff2,_cutoff3,maxFailures,blockUntilIso]=args;
          const current=this.rows.get(bucket),cutoff=Date.parse(cutoffIso);
          let failures=1,windowStarted=nowIso,blockedUntil=null;
          if(current&&Date.parse(current.window_started_at)>=cutoff){
            failures=Number(current.failures||0)+1;
            windowStarted=current.window_started_at;
            blockedUntil=failures>=Number(maxFailures)?blockUntilIso:(current.blocked_until||null);
          }
          this.rows.set(bucket,{failures,window_started_at:windowStarted,blocked_until:blockedUntil,updated_at:updatedAt});
          return {meta:{changes:1}};
        }
        throw new Error(`Unexpected run(): ${normalized}`);
      }
    })};
  }
}

const db=new FakeDB();
const env={OWNER_PASSWORD:'isolated-strong-test-password',DB:db};
const request=(ip='203.0.113.10')=>new Request('https://fixture.invalid/auth/login',{method:'POST',headers:{'cf-connecting-ip':ip,'user-agent':'fixture-browser'}});
const t0=Date.parse('2026-10-14T06:00:00.000Z');

assert.equal((await checkLoginRateLimit(request(),env,t0)).blocked,false);
for(let i=1;i<LOGIN_MAX_FAILURES;i++){
  const result=await recordLoginFailure(request(),env,t0+i*1000);
  assert.equal(result.blocked,false,`Attempt ${i} must not be blocked yet`);
  assert.equal(result.failures,i);
}
const blocked=await recordLoginFailure(request(),env,t0+LOGIN_MAX_FAILURES*1000);
assert.equal(blocked.blocked,true,'Threshold attempt must start the cooldown');
assert.ok(blocked.retryAfter>0&&blocked.retryAfter<=Math.ceil(LOGIN_BLOCK_MS/1000));
assert.equal((await checkLoginRateLimit(request(),env,t0+LOGIN_MAX_FAILURES*1000+1)).blocked,true);
assert.equal((await checkLoginRateLimit(request('198.51.100.9'),env,t0+LOGIN_MAX_FAILURES*1000+1)).blocked,false,'A different client must have an independent bucket');
assert.ok([...db.rows.keys()].every(key=>!key.includes('203.0.113.10')),'Raw client IPs must never be stored as rate-limit keys');

await clearLoginFailures(request(),env);
assert.equal((await checkLoginRateLimit(request(),env,t0+10_000)).blocked,false,'Successful login cleanup must remove the bucket');

const resetStart=t0+60_000;
await recordLoginFailure(request(),env,resetStart);
const afterWindow=await checkLoginRateLimit(request(),env,resetStart+15*60*1000+1);
assert.equal(afterWindow.blocked,false,'Expired failure windows must be discarded');

console.log('Owner login rate-limit isolation, cooldown, cleanup, and privacy checks passed.');
