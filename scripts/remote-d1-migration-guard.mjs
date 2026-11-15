import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

// Pin the reviewed production database identity. Never migrate or guess
// if the Cloudflare binding, schema ledger, or local migrations diverge.
const DB_NAME='my-little-kitchen-db';
import {SITE_CONFIG} from '../public/site-config.js';
const PLACEHOLDER_DB_ID='00000000-0000-0000-0000-000000000000';
const QUERY='SELECT name FROM d1_migrations ORDER BY name';

export function classifyBuildForD1Inspection(command,env,sha){
  if(command!=='deploy'&&command!=='versions upload')return 'other-command';
  if(env.WORKERS_CI!=='1')throw new Error('Direct deploy outside Cloudflare CI is blocked; release requires an independently reviewed procedure.');
  const branch=String(env.WORKERS_CI_BRANCH||'');
  if(!branch)throw new Error('Cloudflare build branch is missing; release blocked.');
  // Both the legacy deploy and versions-upload flows can target previews.
  // Classify by the trusted CI branch and exact commit, never command alone.
  if(branch!=='main')return 'nonproduction';
  if(env.WORKERS_CI_COMMIT_SHA!==sha)throw new Error('Cloudflare main branch revision mismatch; release blocked.');
  return 'production';
}

export function verifyAppliedMigrationResponse(output,expected){
  let parsed;
  try{parsed=JSON.parse(String(output));}
  catch{throw new Error('Remote D1 response was not strict JSON; release blocked.');}
  if(!Array.isArray(parsed)||parsed.length!==1||parsed[0]?.success!==true||!Array.isArray(parsed[0].results)){
    throw new Error('Remote D1 query did not return one successful result; release blocked.');
  }
  const applied=parsed[0].results.map(row=>row?.name);
  if(applied.some(name=>typeof name!=='string'||!name.endsWith('.sql'))||new Set(applied).size!==applied.length){
    throw new Error('Remote D1 migration names are malformed or duplicated; release blocked.');
  }
  const missing=expected.filter(name=>!applied.includes(name));
  const unexpected=applied.filter(name=>!expected.includes(name));
  if(missing.length||unexpected.length){
    throw new Error('D1 migration mismatch; release blocked (unapplied local='+missing.length+'; unexpected remote='+unexpected.length+').');
  }
  return applied.length;
}

export function verifyRemoteD1MigrationState({root=process.cwd(),run=spawnSync,expectedDatabaseId=SITE_CONFIG.d1DatabaseId}={}){
  const DB_ID=String(expectedDatabaseId||'');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(DB_ID)||DB_ID===PLACEHOLDER_DB_ID){
    throw new Error('Production D1 database identity is not configured; release blocked.');
  }
  const config=readFileSync(join(root,'wrangler.jsonc'),'utf8');
  for(const [key,value] of [['binding','DB'],['database_name',DB_NAME],['database_id',DB_ID],['migrations_dir','migrations']]){
    if(!config.includes('"'+key+'": "'+value+'"')){
      throw new Error('Unrecognized D1 config ('+key+'); release blocked without remote changes.');
    }
  }
  if(/"migrations_table"\s*:|"migrations_pattern"\s*:/.test(config)){
    throw new Error('Custom D1 migration layout requires review; release blocked.');
  }
  const expected=readdirSync(join(root,'migrations')).filter(name=>name.endsWith('.sql')).sort();
  if(!expected.length||expected.some(name=>!/^\d{4}_[a-zA-Z0-9_-]+\.sql$/.test(name))||new Set(expected).size!==expected.length){
    throw new Error('Unexpected local D1 migration names; release blocked.');
  }
  const npx=process.platform==='win32'?'npx.cmd':'npx';
  const args=['wrangler','d1','execute',DB_NAME,'--remote','--command',QUERY,'--json'];
  // SELECT-only; never call "wrangler d1 migrations apply" from deployment.
  const result=run(npx,args,{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:1024*1024});
  if(result?.error||result?.status!==0||result?.signal){
    throw new Error('Read-only remote D1 inspection failed; release blocked.');
  }
  return verifyAppliedMigrationResponse(result.stdout,expected);
}
