import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {validateIncomingSnapshot} from './validate-live-nutrition-snapshot.mjs';

const old={
 version:981,updatedAt:'2026-11-04T12:23:28.633Z',
 state:{items:['설탕'],recipes:[{name:'모의 레시피'}],edits:[]}
};
const latest=structuredClone(old);
const inspect='MY LITTLE KITCHEN — AI INSPECTION\nGenerated: 2026-11-05T13:00:07.632Z\nShare: AI용 (reviewer)\nServer state: v981 · 2026-11-04T12:23:28.633Z\n';
const saved={old:structuredClone(old),latest:structuredClone(latest)};
assert.deepEqual(validateIncomingSnapshot(latest,old,inspect),{
 version:981,updatedAt:old.updatedAt,recipes:1,edits:0
});
assert.deepEqual(old,saved.old);
assert.deepEqual(latest,saved.latest);
assert.throws(()=>validateIncomingSnapshot({...latest,version:980},old,inspect),/regressed/);
assert.throws(()=>validateIncomingSnapshot({...latest,updatedAt:'2026-11-03T00:00:00Z'},old,inspect),/regressed/);
assert.throws(()=>validateIncomingSnapshot({...latest,version:982},old,inspect),/revisions differ/);
assert.throws(()=>validateIncomingSnapshot(latest,old,inspect.replace('v981','v980')),/revisions differ/);
assert.throws(()=>validateIncomingSnapshot(latest,old,inspect.replace('2026-11-04T12:23:28.633Z','2026-11-03T12:23:28.633Z')),/revisions differ/);
assert.throws(()=>validateIncomingSnapshot(latest,old,'<html>Login required</html>'),/identity invalid/);
assert.throws(()=>validateIncomingSnapshot({...latest,state:{items:[],recipes:[]}},old,inspect),/structure/);
assert.throws(()=>validateIncomingSnapshot({...latest,updatedAt:'bad'},old,inspect),/structure/);
assert.throws(()=>validateIncomingSnapshot(latest,old,inspect.replace('MY LITTLE KITCHEN','WRONG BRAND')),/identity/);

// Check the CLI's actual file-access boundary. Nothing written by validation
// can modify the authoritative snapshot or publish a stale response.
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mlk-hosted-nutrition-test-'));
try{
 const original=path.join(root,'old.json'),incoming=path.join(root,'new.json'),inspection=path.join(root,'inspect.txt');
 const write=(obj,ins=inspect)=>{fs.writeFileSync(incoming,JSON.stringify(obj));fs.writeFileSync(inspection,ins);};
 fs.writeFileSync(original,JSON.stringify(old));
 const run=()=>spawnSync(process.execPath,['scripts/validate-live-nutrition-snapshot.mjs',incoming,original,inspection],{
  cwd:process.cwd(),encoding:'utf8',timeout:20000
 });
 write(latest);
 let child=run();
 assert.equal(child.status,0,'Valid cached source snapshot should pass safely: '+child.stderr);
 assert.match(child.stdout,/version 981/);
 write({...latest,version:980});
 child=run();
 assert.equal(child.status,1,'Stale version must be rejected');
 assert(!child.stderr.includes('모의 레시피'),'No private recipe text should be echoed to CI');
 write(latest,'<html>Login required</html>');
 child=run();
 assert.equal(child.status,1,'An HTML error page must be rejected');
 assert.equal(fs.readFileSync(original,'utf8'),JSON.stringify(old),'Validation must never overwrite existing state');
}finally{
 fs.rmSync(root,{recursive:true,force:true});
}

// Live-data workflows exist only in the private data repository.
if(fs.existsSync('.github/workflows/nutrition-audit-snapshot.yml')){
  const workflow=fs.readFileSync('.github/workflows/nutrition-audit-snapshot.yml','utf8');
  const collection=fs.readFileSync('.github/workflows/ai-live-snapshot.yml','utf8');
  assert.match(workflow,/runs-on: ubuntu-24\.04/,
   'Read-only nutrition report must use GitHub-hosted Linux, not the Windows PC');
  assert.match(collection,/hosted-daily-snapshot:[\s\S]*?runs-on: ubuntu-24\.04/,
   'Scheduled live snapshot must not need the Windows PC');
  assert.match(collection,/snapshot:\n    if: \$\{\{ github\.event_name == 'workflow_dispatch' \}\}[\s\S]*?runs-on: windows-2025/,
   'Interactive browser snapshot runs only on demand, on a GitHub-hosted runner');
  assert.doesNotMatch(collection,/self-hosted|kitchen-windows-x64/,'No workflow may depend on the owner PC runner');
  assert.doesNotMatch(collection.slice(0,collection.indexOf('\njobs:')),/^  push:/m,'Browser snapshot must not run on every push');
  assert.match(workflow,/AUDIT_SUPERSEDED_BY_NEWER_STATE=YES/,
   'A stale audit must not be published after the snapshot changes');
  assert.match(workflow,/node source\/scripts\/validate-live-nutrition-snapshot\.mjs/,
   'The source state and inspection must be validated before a report is calculated');
  assert.match(workflow,/snapshot\/\.ai-live\/state\.json snapshot\/\.ai-live\/state\.json snapshot\/\.ai-live\/inspect\.txt/,
   'Validation must use both source and inspection from the same stored snapshot');
  assert.match(workflow,/workflow_run:/);
  assert.match(workflow,/github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow,/node scripts\/audit-live-nutrition\.mjs/);
  assert.match(workflow,/git add \.ai-live\/nutrition-audit\.txt/);
  assert.doesNotMatch(workflow,/runs-on: \[self-hosted/,
   'The audit should not queue a private Windows runner');
  assert.doesNotMatch(workflow,/git add[^\n]*\.ai-live\/state\.json/,
   'The audit job may publish only the report, never overwrite user state');

  // The source snapshot may be refreshed on hosted Linux even with the owner's
  // Windows runner offline. Serialize only actual hosted writers/audit workers.
  assert.doesNotMatch(collection.slice(0,collection.indexOf('\njobs:')),/^concurrency:/m);
  assert.match(collection,/hosted-daily-snapshot:[\s\S]*?runs-on: ubuntu-24\.04\n    concurrency:\n      group: ai-live-paired-publish\n      queue: max/);
  assert.match(collection,/snapshot:\n    if: \$\{\{ github\.event_name == 'workflow_dispatch' \}\}\n    runs-on: windows-2025[\s\S]*?concurrency:\n      group: ai-live-windows-snapshot\n      cancel-in-progress: true/);
  assert.match(workflow,/  audit:\n    if: [^\n]+\n    runs-on: ubuntu-24\.04\n    concurrency:\n      group: ai-live-paired-publish\n      queue: max/);

  assert.match(collection,/hosted-daily-snapshot:[\s\S]*?vars\.MLK_HOSTED_NUTRITION_AUDIT_OPT_IN == 'true'/);
  assert.match(workflow,/audit:[\s\S]*?vars\.MLK_HOSTED_NUTRITION_AUDIT_OPT_IN == 'true'/);
  const hostedPreflight=fs.readFileSync('.github/workflows/nutrition-audit-portability-check.yml','utf8');
  assert.match(hostedPreflight,/verify-hosted-audit:[\s\S]*?vars\.MLK_HOSTED_NUTRITION_AUDIT_OPT_IN == 'true'/);
}

console.log('Validation rejects stale snapshots; hosted audit defaults to a billing-safe opt-in HOLD.');
