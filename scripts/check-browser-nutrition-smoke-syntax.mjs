import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

// The real-Chrome job runs in repo-check on a GitHub-hosted Windows runner.
// During normal Cloudflare builds this lightweight check verifies that
// the smoke harness is syntactically valid and remains wired into CI.
const script='scripts/browser-nutrition-ui-smoke.mjs';
const workflow=readFileSync('.github/workflows/repo-check.yml','utf8');
assert.match(workflow,/runs-on:\s*windows-2025/);
assert.doesNotMatch(workflow,/self-hosted\s*,/);
assert(workflow.includes('node scripts/browser-nutrition-ui-smoke.mjs'));
// The browser fixture uses the private dataset, so the shared tree omits it
// and the workflow step is skipped there.
assert(workflow.includes("if: hashFiles('scripts/browser-nutrition-ui-smoke.mjs') != ''"));
if(!existsSync(script)){console.log('Browser smoke harness is not in this tree; workflow step is conditional.');process.exit(0);}
const parsed=spawnSync(process.execPath,['--check',script],{encoding:'utf8'});
assert.equal(parsed.status,0,parsed.stderr||parsed.error?.message||'Browser smoke syntax failed');
const source=readFileSync(script,'utf8');
assert(source.includes('setRequestInterception(true)'));
assert(source.includes('blockedbyclient'));
assert(source.includes('PRODUCTION_REQUESTS=0'));
assert(!/\.workers\.dev/.test(source),'Browser smoke test must not reference a deployed Worker host');
console.log('Isolated Chrome smoke syntax and CI wiring passed.');
