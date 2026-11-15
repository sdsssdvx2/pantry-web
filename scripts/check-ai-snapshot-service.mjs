import assert from 'node:assert/strict';
import fs from 'node:fs';
import {aiSnapshotConfig,publishAiSnapshot,runScheduledAiSnapshot,snapshotStateDocument} from '../src/ai-snapshot-service.js';
import {isDailyMaintenanceRun} from '../src/worker.js';
import {validateIncomingSnapshot} from './validate-live-nutrition-snapshot.mjs';

const TOKEN='github_pat_'+'x'.repeat(30);
const sha=n=>String(n).repeat(40).slice(0,40);
const state={items:['양파'],recipes:[{name:'양파 볶음',required:['양파'],summary:'테스트'}],edits:[],stock:{양파:{status:'available'}},curation:[]};

function fakeDb(row){
  return {prepare(sql){
    const statement={args:[],bind(...args){statement.args=args;return statement;},async first(){
      if(/version=\?/.test(sql)&&Number(statement.args[0])!==row.version)return null;
      return /SELECT version,updated_at/.test(sql)?{version:row.version,updated_at:row.updated_at}:row;
    }};
    return statement;
  }};
}

function fakeGitHub({marker=null,refStatus=200,patchStatus=200,repoPrivate=true}={}){
  const calls=[],blobs=[];
  const fetchImpl=async(url,init={})=>{
    const method=init.method||'GET',path=new URL(url).pathname;
    calls.push(`${method} ${path}`);
    assert.match(init.headers.Authorization,/^Bearer github_pat_/);
    const reply=(body,status=200)=>new Response(typeof body==='string'?body:JSON.stringify(body),{status});
    if(method==='GET'&&/^\/repos\/[^/]+\/[^/]+$/.test(path))return reply({private:repoPrivate});
    if(method==='GET'&&path.endsWith('/git/ref/heads/ai-live-snapshot'))return reply({object:{sha:sha(1)}},refStatus);
    if(method==='GET'&&path.endsWith('/contents/.ai-live/worker-snapshot.json'))return marker?reply(JSON.stringify(marker)):reply({message:'Not Found'},404);
    if(method==='GET'&&path.endsWith(`/git/commits/${sha(1)}`))return reply({tree:{sha:sha(2)}});
    if(method==='POST'&&path.endsWith('/git/blobs')){const body=JSON.parse(init.body);assert.equal(body.encoding,'utf-8');blobs.push(body.content);return reply({sha:sha(blobs.length+2)},201);}
    if(method==='POST'&&path.endsWith('/git/trees')){const body=JSON.parse(init.body);assert.equal(body.base_tree,sha(2));assert.deepEqual(body.tree.map(t=>t.path),['.ai-live/state.json','.ai-live/inspect.txt','.ai-live/refreshed-at.txt','.ai-live/worker-snapshot.json']);return reply({sha:sha(8)},201);}
    if(method==='POST'&&path.endsWith('/git/commits')){const body=JSON.parse(init.body);assert.deepEqual(body.parents,[sha(1)]);return reply({sha:sha(9)},201);}
    if(method==='PATCH'&&path.endsWith('/git/refs/heads/ai-live-snapshot')){const body=JSON.parse(init.body);assert.equal(body.force,false);return reply({},patchStatus);}
    if(method==='POST'&&path.endsWith('/dispatches')){assert.equal(JSON.parse(init.body).event_type,'ai-live-state-refreshed');return new Response(null,{status:204});}
    throw Error('unexpected GitHub call '+method+' '+path);
  };
  return {fetchImpl,calls,blobs};
}

const row={data:JSON.stringify(state),version:42,updated_at:'2026-11-15T01:02:03.456Z'};
const env={DB:fakeDb(row),AI_SNAPSHOT_GITHUB_TOKEN:TOKEN,AI_SNAPSHOT_REPO:'owner/private-kitchen-data',AI_SNAPSHOT_ORIGIN:'https://kitchen.example'};

// No token: nothing runs and no network is used.
assert.equal(aiSnapshotConfig({}).enabled,false);
assert.deepEqual(await publishAiSnapshot({DB:fakeDb(row)},{fetchImpl:()=>{throw Error('network used');}}),{status:'disabled',reason:'no_token'});
assert.equal(aiSnapshotConfig({...env,AI_SNAPSHOT_BRANCH:'main'}).enabled,false,'main must never be a snapshot target');
assert.equal(aiSnapshotConfig({AI_SNAPSHOT_GITHUB_TOKEN:TOKEN,AI_SNAPSHOT_REPO:'not a repo'}).reason,'invalid_target');

// First publish writes four files in one fast-forward commit.
const first=fakeGitHub();
const published=await publishAiSnapshot(env,{now:new Date('2026-11-15T03:00:00Z'),fetchImpl:first.fetchImpl});
assert.equal(published.status,'published');
assert.equal(published.audit,'not-requested');
const [stateDoc,inspectDoc,refreshed,markerDoc]=first.blobs;
const parsed=JSON.parse(stateDoc);
assert.equal(parsed.version,42);
assert.deepEqual(parsed.state,state);
assert.equal(refreshed,'2026-11-15T03:00:00Z\n');
assert.equal(JSON.parse(markerDoc).version,42);
assert.doesNotMatch(inspectDoc,/\/share\/[A-Za-z0-9_-]{20,}/,'no share token is published unless configured');
// The existing hosted validator accepts the Worker output unchanged.
const previous={version:41,updatedAt:'2026-11-14T00:00:00.000Z',state};
assert.equal(validateIncomingSnapshot(parsed,previous,inspectDoc).version,42);
assert.equal(snapshotStateDocument({data:'{"items":[]}',version:3,updated_at:'2026-01-01T00:00:00.000Z'}),'{"version":3,"updatedAt":"2026-01-01T00:00:00.000Z","state":{"items":[]}}\n');

// Same version: only the ref and marker are read.
const same=fakeGitHub({marker:{version:42,publishedAt:'2026-11-15T03:00:00.000Z'}});
assert.equal((await publishAiSnapshot(env,{fetchImpl:same.fetchImpl})).status,'unchanged');
assert.equal(same.calls.length,3);

// Newer state inside the interval waits; after the interval it publishes.
const recent=fakeGitHub({marker:{version:40,publishedAt:'2026-11-15T01:00:00.000Z'}});
assert.equal((await publishAiSnapshot(env,{now:new Date('2026-11-15T03:00:00Z'),fetchImpl:recent.fetchImpl})).status,'throttled');
const due=fakeGitHub({marker:{version:40,publishedAt:'2026-11-14T20:00:00.000Z'}});
assert.equal((await publishAiSnapshot(env,{now:new Date('2026-11-15T03:00:00Z'),fetchImpl:due.fetchImpl})).status,'published');

// A public target repository is refused before anything is read or written.
const publicRepo=fakeGitHub({repoPrivate:false});
assert.deepEqual(await publishAiSnapshot(env,{fetchImpl:publicRepo.fetchImpl}),{status:'skipped',reason:'target_repo_not_private'});
assert.equal(publicRepo.calls.length,1);

// A newer snapshot than D1 is never overwritten with older data.
const regressed=fakeGitHub({marker:{version:99,publishedAt:'2026-11-01T00:00:00.000Z'}});
assert.equal((await publishAiSnapshot(env,{fetchImpl:regressed.fetchImpl})).reason,'version_regressed');

// A concurrent writer wins: no force push.
const race=fakeGitHub({patchStatus:422});
assert.equal((await publishAiSnapshot(env,{fetchImpl:race.fetchImpl})).status,'conflict');

// Opt-in audit dispatch is throttled separately.
const auditEnv={...env,AI_SNAPSHOT_DISPATCH_AUDIT:'true'};
const audit=fakeGitHub();
assert.equal((await publishAiSnapshot(auditEnv,{fetchImpl:audit.fetchImpl})).audit,'dispatched');
const auditLater=fakeGitHub({marker:{version:40,publishedAt:'2026-11-14T00:00:00.000Z',auditDispatchedAt:'2026-11-15T00:00:00.000Z'}});
assert.equal((await publishAiSnapshot(auditEnv,{now:new Date('2026-11-15T08:00:00Z'),fetchImpl:auditLater.fetchImpl})).audit,'not-requested');

// Lite mode keeps the validator contract without parsing state.
const lite=fakeGitHub();
assert.equal((await publishAiSnapshot({...env,AI_SNAPSHOT_LITE:'true'},{fetchImpl:lite.fetchImpl})).status,'published');
assert.equal(validateIncomingSnapshot(JSON.parse(lite.blobs[0]),previous,lite.blobs[1]).version,42);
assert.match(lite.blobs[1],/Lite snapshot/);

// The cron wrapper never throws (daily backup must still run).
const broken=fakeGitHub({refStatus:500});
assert.equal((await runScheduledAiSnapshot(env,{fetchImpl:broken.fetchImpl})).status,'failed');

// One hourly trigger: maintenance only in the 14:xx UTC slot (23:55 KST).
assert.equal(isDailyMaintenanceRun({cron:'55 * * * *',scheduledTime:Date.parse('2026-11-15T14:55:00Z')}),true);
assert.equal(isDailyMaintenanceRun({cron:'55 * * * *',scheduledTime:Date.parse('2026-11-15T03:55:00Z')}),false);
assert.equal(isDailyMaintenanceRun({cron:'55 14 * * *',scheduledTime:Date.parse('2026-11-15T15:10:00Z')}),true);
const wrangler=fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
assert.match(wrangler,/"crons":\s*\["55 \* \* \* \*"\]/);

console.log('AI snapshot Worker publisher checks passed');
