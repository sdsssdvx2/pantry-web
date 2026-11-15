import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';
import {OWNER_SESSION_MAX_AGE,ownerSessionToken} from '../src/auth-service.js';

const password='isolated-owner-session-password';
const sessionId='session_abcdefghijklmnopqrstuvwxyz123456';
const deviceId='device_abcdefghijklmnopqrstuvwxyz';
const token=await ownerSessionToken(password,sessionId);
let expiresAt=new Date(Date.now()+24*60*60*1000).toISOString(),lastSeenAt=new Date(Date.now()-60_000).toISOString();
let shareReads=0;

const env={
  OWNER_PASSWORD:password,
  DB:{
    prepare(sql){
      const normalized=String(sql).replace(/\s+/g,' ').trim();
      return {bind:(...args)=>({
        async first(){
          if(normalized.startsWith('SELECT session_id,device_id,created_at,last_seen_at,expires_at FROM owner_sessions')){
            if(args[0]!==sessionId||Date.parse(expiresAt)<=Date.parse(args[1]))return null;
            return {session_id:sessionId,device_id:deviceId,created_at:'2026-10-14T00:00:00.000Z',last_seen_at:lastSeenAt,expires_at:expiresAt};
          }
          if(normalized.startsWith('SELECT id, token, label, scope')){
            shareReads++;
            return args[0]==='valid-share'?{id:'share-1',token:'valid-share',label:'fixture',scope:'viewer'}:null;
          }
          throw new Error(`Unexpected first(): ${normalized}`);
        },
        async run(){
          if(normalized.startsWith('UPDATE owner_sessions SET last_seen_at=?,expires_at=?')){
            lastSeenAt=args[0];expiresAt=args[1];return {meta:{changes:1}};
          }
          throw new Error(`Unexpected run(): ${normalized}`);
        }
      })};
    }
  },
  ASSETS:{fetch(){throw new Error('Assets must not be read for /api/session or rejected root navigation');}}
};

const before=Date.parse(expiresAt);
const request=new Request('https://fixture.invalid/api/session',{
  headers:{cookie:`mlk_owner=${encodeURIComponent(token)}; mlk_share=stale-reviewer-cookie`}
});
const response=await worker.fetch(request,env);
assert.equal(response.status,200);
assert.deepEqual(await response.json(),{role:'owner',scope:'owner',label:null});
assert.ok(Date.parse(expiresAt)>before,'Owner /api/session must extend the server-side idle expiry');
const cookies=typeof response.headers.getSetCookie==='function'
  ? response.headers.getSetCookie()
  : String(response.headers.get('set-cookie')||'').split(/,\s*(?=[^;,]+=)/).filter(Boolean);
assert.ok(cookies.some(value=>value.startsWith('mlk_owner=')&&value.includes(`Max-Age=${OWNER_SESSION_MAX_AGE}`)&&value.includes('HttpOnly')&&value.includes('Secure')&&value.includes('SameSite=Strict')),'Owner session check must roll the 30-day cookie forward');
assert.ok(cookies.some(value=>value.startsWith('mlk_owner_device=')&&value.includes(deviceId)),'Owner refresh must preserve the per-device id');
assert.ok(cookies.some(value=>value.startsWith('mlk_share=')&&value.includes('Max-Age=0')),'Owner refresh must clear stale share-mode cookies');

const sharedRoot=await worker.fetch(new Request('https://fixture.invalid/',{
  headers:{cookie:'mlk_share=valid-share','sec-fetch-mode':'navigate','user-agent':'Mozilla/5.0 fixture'}
}),env);
assert.equal(sharedRoot.status,303,'The plain root must never fall back to a share-cookie view');
assert.equal(sharedRoot.headers.get('location'),'/auth/login');
assert.equal(shareReads,1);

const workerSource=readFileSync('src/worker.js','utf8');
const shareEntry=readFileSync('src/share-entry.js','utf8');
assert.match(workerSource,/x-mlk-share-render/,'Worker must distinguish internal shared-page rendering from a plain root visit');
assert.match(shareEntry,/headers\.set\('x-mlk-share-render',token\)/,'Direct share rendering must explicitly opt into the internal root render path');

const bootstrap=readFileSync('public/bootstrap.js','utf8');
assert.match(bootstrap,/읽기 전용 · 소유자로 로그인/,'Shared mode must show an obvious owner-login recovery action');
assert.match(bootstrap,/location\.assign\('\/auth\/login'\)/,'Recovery action must lead to the owner login page');

console.log('Sliding revocable owner sessions, stale-share cleanup, and owner-only root checks passed.');
