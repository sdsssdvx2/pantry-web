import assert from 'node:assert/strict';
import {clearShareAuthCache,getAuth,ownerSessionToken} from '../src/auth-service.js';

let ownerReads=0,shareReads=0;
const password='isolated-test-password';
const sessionId='session_abcdefghijklmnopqrstuvwxyz123456';
const deviceId='device_abcdefghijklmnopqrstuvwxyz';
const env={
  OWNER_PASSWORD:password,
  DB:{
    prepare(sql){
      const normalized=String(sql).replace(/\s+/g,' ').trim();
      return {bind:(...args)=>({
        async first(){
          if(normalized.startsWith('SELECT session_id,device_id,created_at,last_seen_at,expires_at FROM owner_sessions')){
            ownerReads++;
            return args[0]===sessionId?{session_id:sessionId,device_id:deviceId,created_at:'2026-10-14T00:00:00.000Z',last_seen_at:'2026-10-14T00:00:00.000Z',expires_at:'2099-01-01T00:00:00.000Z'}:null;
          }
          if(normalized.startsWith('SELECT id, token, label, scope')){
            shareReads++;
            return args[0]==='valid-share'?{id:'share-1',scope:'viewer',token:'valid-share'}:null;
          }
          throw new Error(`Unexpected query: ${normalized}`);
        }
      })};
    }
  }
};
const request=cookie=>new Request('https://fixture.invalid/',{headers:{cookie}});

assert.equal((await getAuth(request(''),env)).role,'none');
assert.equal(ownerReads,0);assert.equal(shareReads,0);
assert.equal((await getAuth(request('mlk_owner=%E0%A4%A'),env)).role,'none');
assert.equal((await getAuth(request('mlk_share=%E0%A4%A'),env)).role,'none');
assert.equal(ownerReads,0,'Malformed owner cookies must not read session storage');
assert.equal(shareReads,0,'Malformed cookies must not trigger a share lookup');

const token=await ownerSessionToken(password,sessionId);
const owner=await getAuth(request(`mlk_owner=${encodeURIComponent(token)}`),env);
assert.equal(owner.role,'owner');
assert.equal(owner.session.sessionId,sessionId);
assert.equal(owner.session.deviceId,deviceId);
assert.equal(ownerReads,1);

const [,sid]=token.split('.');
assert.equal((await getAuth(request(`mlk_owner=v2.${sid}.wrongproof`),env)).role,'none');
assert.equal(ownerReads,1,'Bad HMAC proofs must be rejected before a D1 lookup');

assert.equal((await getAuth(request('mlk_share=valid-share'),env)).scope,'viewer');
assert.equal((await getAuth(request('mlk_share=valid-share'),env)).role,'share');
assert.equal(shareReads,1,'Repeated share asset requests must reuse short-lived authorization');
clearShareAuthCache();await getAuth(request('mlk_share=valid-share'),env);assert.equal(shareReads,2);
console.log('Revocable owner/share authorization and malformed-cookie checks passed.');
