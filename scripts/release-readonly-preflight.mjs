import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {verifyRemoteD1MigrationState} from './remote-d1-migration-guard.mjs';

const WORKER='my-little-kitchen';
import {SITE_CONFIG} from '../public/site-config.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{40}$/i;

// This is NOT an authorization to promote an uploaded Worker version.
// All requests are GET or Wrangler read-only commands; no user state is fetched.
export function parseActiveDeploymentStatus(output){
  let value;
  try{value=JSON.parse(String(output));}catch{throw new Error('DEPLOYMENT_JSON_INVALID');}
  const d=value?.deployment??value?.result??value;
  if(!d||Array.isArray(d)||typeof d!=='object'||!UUID.test(String(d.id||''))){
    throw new Error('ACTIVE_DEPLOYMENT_UNKNOWN');
  }
  if(!Array.isArray(d.versions)||d.versions.length!==1||!UUID.test(String(d.versions[0]?.version_id||''))||d.versions[0]?.percentage!==100){
    throw new Error('ACTIVE_DEPLOYMENT_NOT_SINGLE_VERSION');
  }
  return {deployment_id:d.id.toLowerCase(),version_id:d.versions[0].version_id.toLowerCase()};
}

export async function readLiveRevision(fetcher=fetch,origin=SITE_CONFIG.publicOrigin){
  if(!/^https:\/\/[^/]+$/.test(String(origin||'')))throw new Error('LIVE_ORIGIN_NOT_CONFIGURED');
  const response=await fetcher(origin+'/deploy-version.txt?audit=readonly',{
    method:'GET',redirect:'error',cache:'no-store',
    headers:{accept:'text/plain','cache-control':'no-cache'},
    signal:AbortSignal.timeout(10000)
  });
  if(response.status!==200||response.redirected===true)throw new Error('LIVE_MARKER_HTTP_FAILURE');
  const body=await response.text();
  if(!/^[a-f0-9]{40}\n?$/.test(body))throw new Error('LIVE_MARKER_INVALID');
  return body.trim();
}

export function fetchActiveDeployment({run=spawnSync,root=process.cwd()}={}){
  const npx=process.platform==='win32'?'npx.cmd':'npx';
  const args=['wrangler','deployments','status','--name',WORKER,'--json'];
  const result=run(npx,args,{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:1024*1024});
  if(result?.error||result?.status!==0||result?.signal)throw new Error('DEPLOYMENT_READ_FAILED');
  return parseActiveDeploymentStatus(result.stdout);
}

export async function runReadOnlyPreflight({expectedLiveSha,origin=SITE_CONFIG.publicOrigin,fetcher=fetch,readDeployment=fetchActiveDeployment,readD1=verifyRemoteD1MigrationState}={}){
  if(!SHA.test(String(expectedLiveSha||'')))throw new Error('EXPECTED_SHA_REQUIRED');
  const expected=expectedLiveSha.toLowerCase();
  const before=await readLiveRevision(fetcher,origin);
  if(before!==expected)throw new Error('LIVE_MARKER_NOT_EXPECTED_MAIN');
  const deploymentBefore=readDeployment();
  const applied=readD1();
  if(!Number.isInteger(applied)||applied<1)throw new Error('REMOTE_D1_NOT_VERIFIED');
  const deploymentAfter=readDeployment();
  const after=await readLiveRevision(fetcher,origin);
  if(after!==expected||before!==after||deploymentBefore.deployment_id!==deploymentAfter.deployment_id||deploymentBefore.version_id!==deploymentAfter.version_id){
    throw new Error('LIVE_DEPLOYMENT_CHANGED_DURING_AUDIT');
  }
  return {sha:expected,...deploymentAfter,applied};
}

async function main(){
  // No default that could accidentally accept an unrelated current deployment.
  if(process.argv.length!==4||process.argv[2]!=='--expected-live-sha')throw new Error('EXPECTED_SHA_REQUIRED');
  const result=await runReadOnlyPreflight({expectedLiveSha:process.argv[3]});
  console.log('MLK_RELEASE_PREFLIGHT=PASS');
  console.log('LIVE_SHA='+result.sha);
  console.log('ACTIVE_DEPLOYMENT_ID='+result.deployment_id);
  console.log('ACTIVE_VERSION_ID='+result.version_id);
  console.log('REMOTE_D1_APPLIED_MIGRATIONS='+result.applied);
  console.log('READ_ONLY=YES; LIVE_DATA_CHANGES=NONE; RELEASE_AUTHORIZED=NO');
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{
    // Never print CLI stderr, response bodies, cookies, or any credentials.
    const allowed=new Set([
      'EXPECTED_SHA_REQUIRED','LIVE_ORIGIN_NOT_CONFIGURED','DEPLOYMENT_JSON_INVALID','ACTIVE_DEPLOYMENT_UNKNOWN',
      'ACTIVE_DEPLOYMENT_NOT_SINGLE_VERSION','LIVE_MARKER_HTTP_FAILURE',
      'LIVE_MARKER_INVALID','DEPLOYMENT_READ_FAILED','LIVE_MARKER_NOT_EXPECTED_MAIN',
      'REMOTE_D1_NOT_VERIFIED','LIVE_DEPLOYMENT_CHANGED_DURING_AUDIT'
    ]);
    console.error('MLK_RELEASE_PREFLIGHT=BLOCKED; REASON='+(allowed.has(error.message)?error.message:'READ_ONLY_VERIFICATION_FAILED'));
    process.exitCode=1;
  });
}
