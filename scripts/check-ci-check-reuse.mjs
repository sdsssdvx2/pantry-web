import assert from 'node:assert/strict';
import {validateCiCheckReuse} from './ci-check-reuse.mjs';

const sha='a'.repeat(40);
const good={
  MLK_REPO_CHECKS_ALREADY_PASSED:'1',
  GITHUB_ACTIONS:'true',
  GITHUB_EVENT_NAME:'pull_request',
  WORKERS_CI:'1',
  WORKERS_CI_BRANCH:'ai/food-research-auto-20261114',
  WORKERS_CI_COMMIT_SHA:sha,
  CLOUDFLARE_API_TOKEN:'',
  CLOUDFLARE_ACCOUNT_ID:'',
};
assert.equal(validateCiCheckReuse(good,sha,sha),true);
assert.equal(validateCiCheckReuse({...good,GITHUB_EVENT_NAME:'push',WORKERS_CI_BRANCH:'__repo_check_dry_run__'},sha,sha),true);

for(const [label,env,head,marker] of [
  ['not requested',{...good,MLK_REPO_CHECKS_ALREADY_PASSED:'0'},sha,sha],
  ['not github',{...good,GITHUB_ACTIONS:'false'},sha,sha],
  ['scheduled run',{...good,GITHUB_EVENT_NAME:'schedule'},sha,sha],
  ['target event',{...good,GITHUB_EVENT_NAME:'pull_request_target'},sha,sha],
  ['bad head',good,'bad',sha],
  ['marker mismatch',good,sha,'b'.repeat(40)],
  ['workers ci off',{...good,WORKERS_CI:'0'},sha,sha],
  ['commit mismatch',{...good,WORKERS_CI_COMMIT_SHA:'b'.repeat(40)},sha,sha],
  ['missing branch',{...good,WORKERS_CI_BRANCH:''},sha,sha],
  ['production branch',{...good,WORKERS_CI_BRANCH:'main'},sha,sha],
  ['api token',{...good,CLOUDFLARE_API_TOKEN:'secret'},sha,sha],
  ['account id',{...good,CLOUDFLARE_ACCOUNT_ID:'secret'},sha,sha],
]){
  assert.throws(()=>validateCiCheckReuse(env,head,marker),Error,label);
}

console.log('CLOUDFLARE_DRY_RUN_CHECK_REUSE_GUARD=PASS');
