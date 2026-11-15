import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertProductionDataset} from './sample-data.mjs';

// A build of the shared sample tree must never become the production deploy.
assert.throws(()=>assertProductionDataset('production',true),/cannot be deployed to production/);
assert.equal(assertProductionDataset('production',false),true);
assert.equal(assertProductionDataset('nonproduction',true),true);
assert.equal(assertProductionDataset('other-command',true),true);
const build=readFileSync('scripts/cloudflare-build.mjs','utf8');
const guard=build.indexOf('assertProductionDataset(releaseContext)');
assert(guard>0,'cloudflare-build.mjs must run the production dataset guard');
assert(guard<build.indexOf('verifyRemoteD1MigrationState()'),'The dataset guard must run before the production release gate');
console.log('SAMPLE_DATASET_PRODUCTION_GUARD=PASS');
