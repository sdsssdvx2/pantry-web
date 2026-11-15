import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseActiveDeploymentStatus,readLiveRevision,fetchActiveDeployment,runReadOnlyPreflight} from './release-readonly-preflight.mjs';

const sha='a'.repeat(40);
const id1='11111111-1111-4111-8111-111111111111';
const id2='22222222-2222-4222-8222-222222222222';
const d={id:id1,versions:[{version_id:id2,percentage:100}]};
const asJson=JSON.stringify(d);
assert.deepEqual(parseActiveDeploymentStatus(asJson),{deployment_id:id1,version_id:id2});
assert.deepEqual(parseActiveDeploymentStatus(JSON.stringify({result:d})),{deployment_id:id1,version_id:id2});
for(const invalid of ['bad','[]','{}',JSON.stringify({...d,versions:[{version_id:id2,percentage:50}]}),
  JSON.stringify({...d,versions:[{version_id:id2,percentage:90},{version_id:id1,percentage:10}]})]){
  assert.throws(()=>parseActiveDeploymentStatus(invalid),/(INVALID|UNKNOWN|SINGLE_VERSION)/);
}
const goodFetch=async(url,options)=>{
  assert.equal(url,'https://kitchen.example/deploy-version.txt?audit=readonly');
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'error');
  return {status:200,redirected:false,text:async()=>sha+'\n'};
};
const origin='https://kitchen.example';
assert.equal(await readLiveRevision(goodFetch,origin),sha);
await assert.rejects(()=>readLiveRevision(goodFetch,''),/LIVE_ORIGIN_NOT_CONFIGURED/);
await assert.rejects(()=>readLiveRevision(async()=>({status:500,text:async()=>sha}),origin),/HTTP_FAILURE/);
await assert.rejects(()=>readLiveRevision(async()=>({status:200,text:async()=>"other"}),origin),/INVALID/);
let commandCalls=0;
const active=fetchActiveDeployment({run:(exe,args,opts)=>{
  commandCalls++;
  assert.match(exe,/^npx(\.cmd)?$/);
  assert.deepEqual(args,['wrangler','deployments','status','--name','my-little-kitchen','--json']);
  assert.ok(opts.timeout>0);
  return {status:0,stdout:asJson};
}});
assert.equal(commandCalls,1);
assert.equal(active.version_id,id2);
assert.throws(()=>fetchActiveDeployment({run:()=>({status:1,stderr:'secret'})}),/DEPLOYMENT_READ_FAILED/);
let deploymentReads=0,d1Reads=0,liveGets=0;
const result=await runReadOnlyPreflight({
  expectedLiveSha:sha,origin,
  fetcher:async(...args)=>{liveGets++;return goodFetch(...args);},
  readDeployment:()=>{deploymentReads++;return {deployment_id:id1,version_id:id2};},
  readD1:()=>{d1Reads++;return 3;}
});
assert.deepEqual({deploymentReads,d1Reads,liveGets},{deploymentReads:2,d1Reads:1,liveGets:2});
assert.equal(result.applied,3);
await assert.rejects(()=>runReadOnlyPreflight({expectedLiveSha:'invalid',fetcher:()=>{throw new Error('FETCH_UNEXPECTED');}}),/EXPECTED_SHA_REQUIRED/);
let called=0;
await assert.rejects(()=>runReadOnlyPreflight({
  expectedLiveSha:sha,origin,fetcher:async()=>{called++;return {status:200,text:async()=>called===1?sha+'\n':'b'.repeat(40)+'\n'};},
  readDeployment:()=>({deployment_id:id1,version_id:id2}),readD1:()=>3
}),/LIVE_DEPLOYMENT_CHANGED_DURING_AUDIT/);
const source=readFileSync('scripts/release-readonly-preflight.mjs','utf8');
assert(!/(?:['"]migrations['"]\s*,\s*['"]apply['"]|['"]deploy['"]\s*,\s*['"]--name['"])/.test(source));
console.log('MLK_READONLY_RELEASE_PREFLIGHT=PASS; DEPLOYMENT_PIN=YES; SITE_MARKER_PIN=YES; D1_READ_ONLY=YES; LIVE_REQUESTS=NONE');
