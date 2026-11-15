import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {verifyRemoteD1MigrationState,classifyBuildForD1Inspection} from './remote-d1-migration-guard.mjs';
import {validateCiCheckReuse} from './ci-check-reuse.mjs';
import {assertProductionDataset} from './sample-data.mjs';

const command=process.env.WRANGLER_COMMAND||'';
if(process.env.MLK_APPLYING_D1_MIGRATIONS==='1'){
  throw new Error('Automated D1 migration application is disabled; use an independently approved migration procedure.');
}

rmSync('public/deploy-version.txt',{force:true});
const revision=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});
if(revision.error)throw revision.error;
const sha=String(revision.stdout||'').trim();
if(revision.status!==0||! /^[0-9a-f]{40}$/i.test(sha))throw new Error('Could not resolve the deploy git revision.');

if(process.env.MLK_REPO_CHECKS_ALREADY_PASSED==='1'){
  let marker='';
  try{marker=readFileSync('.mlk-repo-checks-passed','utf8').trim();}
  catch{throw new Error('Repository-check reuse marker is missing; build blocked.');}
  validateCiCheckReuse(process.env,sha,marker);
  console.log('Reusing exact-SHA repository checks from this pull-request CI job.');
}else{
  const checks=spawnSync(process.execPath,['scripts/run-checks.mjs'],{stdio:'inherit'});
  if(checks.error)throw checks.error;
  if(checks.status!==0)process.exit(checks.status??1);
}

writeFileSync('public/deploy-version.txt',sha+'\n','utf8');
console.log('Prepared production deploy marker for '+sha.slice(0,12)+'.');

const releaseContext=classifyBuildForD1Inspection(command,process.env,sha);
try{assertProductionDataset(releaseContext);}
catch(error){rmSync('public/deploy-version.txt',{force:true});throw error;}
if(releaseContext!=='production'){
  console.log('Skipping remote D1 inspection for '+releaseContext+': '+(command||'unknown'));
  process.exit(0);
}

// Production deployment must fail closed on any unknown/missing migrations.
// The check uses SELECT only and will NEVER apply schema or user data changes.
console.log('Checking remote D1 applied migrations (read-only)...');
const applied=verifyRemoteD1MigrationState();
console.log('REMOTE_D1_RELEASE_GATE=PASS; APPLIED_MIGRATIONS='+applied+'; D1_WRITES=NONE');
