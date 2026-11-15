import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {verifyRemoteD1MigrationState,verifyAppliedMigrationResponse,classifyBuildForD1Inspection} from './remote-d1-migration-guard.mjs';

// Synthetic only: no production calls, migration application, or user data.
const names=['0000_initial_schema.sql','0001_login_rate_limits.sql','0002_owner_sessions.sql'];
const response=rows=>JSON.stringify([{success:true,results:rows.map(name=>({name}))}]);
assert.equal(verifyAppliedMigrationResponse(response(names),names),3);
for(const output of ['garbage','[]','[{"success":false,"results":[]}]','[{"success":true}]',response([...names,names[0]])]){
  assert.throws(()=>verifyAppliedMigrationResponse(output,names),/blocked/);
}
assert.throws(()=>verifyAppliedMigrationResponse(response(names.slice(0,2)),names),/unapplied local=1/);
assert.throws(()=>verifyAppliedMigrationResponse(response([...names,'0003_other.sql']),names),/unexpected remote=1/);

// Cloudflare Workers Builds supplies both a branch and commit marker. A preview
// may still use `wrangler deploy` under the legacy preview model.
const commit='a'.repeat(40);
const ci={WORKERS_CI:'1',WORKERS_CI_BRANCH:'integration/nutrition-evidence-and-hosted-audit-HOLD-20261107',WORKERS_CI_COMMIT_SHA:commit};
assert.equal(classifyBuildForD1Inspection('versions upload',ci,commit),'nonproduction');
assert.equal(classifyBuildForD1Inspection('versions upload',{...ci,WORKERS_CI_BRANCH:'main'},commit),'production');
assert.equal(classifyBuildForD1Inspection('unrecognized',ci,commit),'other-command');
assert.equal(classifyBuildForD1Inspection('deploy',ci,commit),'nonproduction');
assert.equal(classifyBuildForD1Inspection('deploy',{...ci,WORKERS_CI_BRANCH:'main'},commit),'production');
for(const [cmd,env,head] of [
  ['deploy',{},commit],
  ['versions upload',{},commit],
  ['deploy',{...ci,WORKERS_CI_BRANCH:''},commit],
  ['deploy',{...ci,WORKERS_CI_BRANCH:'main'},'b'.repeat(40)],
  ['deploy',{...ci,WORKERS_CI_BRANCH:'main',WORKERS_CI_COMMIT_SHA:''},commit]
])assert.throws(()=>classifyBuildForD1Inspection(cmd,env,head),/blocked/);

const root=mkdtempSync(join(tmpdir(),'mlk-d1-release-guard-'));
try{
  const dbId='12345678-1234-4234-8234-123456789abc';
  const config='{"d1_databases":[{"binding": "DB", "database_name": "my-little-kitchen-db", "database_id": "'+dbId+'", "migrations_dir": "migrations"}]}';
  writeFileSync(join(root,'wrangler.jsonc'),config);
  mkdirSync(join(root,'migrations'));
  for(const name of names)writeFileSync(join(root,'migrations',name),'-- isolated placeholder\n');
  let calls=0;
  const run=(command,args,options)=>{
    calls++;
    assert.match(command,/^npx(\.cmd)?$/);
    assert.deepEqual(args,['wrangler','d1','execute','my-little-kitchen-db','--remote','--command','SELECT name FROM d1_migrations ORDER BY name','--json']);
    assert.equal(options.cwd,root);
    return {status:0,stdout:response(names)};
  };
  assert.equal(verifyRemoteD1MigrationState({root,expectedDatabaseId:dbId,run}),3);
  assert.equal(calls,1);
  assert.throws(()=>verifyRemoteD1MigrationState({root,expectedDatabaseId:dbId,run:()=>({status:1,stdout:response(names)})}),/blocked/);
  assert.throws(()=>verifyRemoteD1MigrationState({root,expectedDatabaseId:dbId,run:()=>({status:0,stdout:'broken'})}),/blocked/);
  writeFileSync(join(root,'wrangler.jsonc'),config.replace(dbId,'00000000-0000-0000-0000-000000000000'));
  assert.throws(()=>verifyRemoteD1MigrationState({root,expectedDatabaseId:dbId,run}),/Unrecognized D1 config/);
  assert.equal(calls,1,'Invalid config must not even access a remote service');
  assert.throws(()=>verifyRemoteD1MigrationState({root,run,expectedDatabaseId:'00000000-0000-0000-0000-000000000000'}),/not configured/);
  assert.equal(calls,1,'An unconfigured database identity must not access a remote service');
}finally{rmSync(root,{recursive:true,force:true});}

const build=readFileSync('scripts/cloudflare-build.mjs','utf8');
assert.match(build,/classifyBuildForD1Inspection\(command,process\.env,sha\)/);
assert.match(build,/verifyRemoteD1MigrationState\(\)/);
assert.doesNotMatch(build,/['"]migrations['"]\s*,\s*['"]apply['"]/);
console.log('REMOTE_D1_RELEASE_GUARD=PASS; QUERY=SELECT_ONLY; INVALID_REMOTE_STATE=FAIL_CLOSED; LIVE_REQUESTS=NONE');
