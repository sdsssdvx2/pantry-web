// Scheduled AI snapshot publisher.
//
// GitHub-hosted Actions minutes ran out in Nov 2026, so `.ai-live/state.json`
// and `inspect.txt` on the `ai-live-snapshot` branch went stale. The Worker
// already owns the live data, so its cron trigger publishes the same two
// read-only files straight through the GitHub REST API: no Actions minutes,
// no Kitchen PC, no browser run.
//
// Disabled unless the Cloudflare Secret AI_SNAPSHOT_GITHUB_TOKEN exists
// (fine-grained token, PRIVATE data repository only, Contents: read and write).
// Set AI_SNAPSHOT_REPO to that private repository; public targets are refused.
// Writes only to the snapshot branch, never force-pushes, never touches D1.
import {findShareByToken} from './auth-service.js';
import {inspectText,repoLinks,shareLinks} from './ai-inspection.js';
import {SITE_CONFIG} from '../public/site-config.js';

const API='https://api.github.com';
const DEFAULT_REPO=SITE_CONFIG.snapshotRepo;
const DEFAULT_BRANCH='ai-live-snapshot';
const DEFAULT_ORIGIN=SITE_CONFIG.publicOrigin;
const MARKER_PATH='.ai-live/worker-snapshot.json';
const REPO_PATTERN=/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const BRANCH_PATTERN=/^[A-Za-z0-9._\/-]{1,100}$/;

const clean=value=>String(value??'').trim();
const hours=(value,fallback,min,max)=>{
  const n=Number(clean(value));
  return Number.isFinite(n)&&n>=min&&n<=max?n:fallback;
};

export function aiSnapshotConfig(env={}){
  const token=clean(env.AI_SNAPSHOT_GITHUB_TOKEN);
  if(!token)return {enabled:false,reason:'no_token'};
  const repo=clean(env.AI_SNAPSHOT_REPO)||DEFAULT_REPO;
  const branch=clean(env.AI_SNAPSHOT_BRANCH)||DEFAULT_BRANCH;
  if(!REPO_PATTERN.test(repo)||!BRANCH_PATTERN.test(branch)||branch==='main'||branch.includes('..'))
    return {enabled:false,reason:'invalid_target'};
  let origin=DEFAULT_ORIGIN;
  try{const url=new URL(clean(env.AI_SNAPSHOT_ORIGIN)||DEFAULT_ORIGIN);if(url.protocol==='https:')origin=url.origin;}catch{}
  return {
    enabled:token.length>=20,
    reason:token?token.length>=20?'':'invalid_token':'no_token',
    token,repo,branch,origin,
    // Publish at most this often (and only when the D1 version changed).
    minHours:hours(env.AI_SNAPSHOT_MIN_HOURS,6,1,168),
    // Optionally ask the existing nutrition-audit workflow to rebuild its report.
    dispatchAudit:clean(env.AI_SNAPSHOT_DISPATCH_AUDIT).toLowerCase()==='true',
    auditMinHours:hours(env.AI_SNAPSHOT_AUDIT_MIN_HOURS,24,6,720),
    shareToken:clean(env.AI_SNAPSHOT_SHARE_TOKEN),
    // Lite mode skips JSON parsing and the inventory/recipe text, for the
    // Workers Free 10 ms CPU limit. state.json is still complete.
    lite:clean(env.AI_SNAPSHOT_LITE).toLowerCase()==='true',
  };
}

function github(config,fetchImpl){
  return async(path,{method='GET',body,accept='application/vnd.github+json',allow=[]}={})=>{
    const response=await fetchImpl(API+path,{
      method,
      headers:{
        'Authorization':`Bearer ${config.token}`,
        'Accept':accept,
        'User-Agent':'my-little-kitchen-snapshot',
        'X-GitHub-Api-Version':'2022-11-28',
        ...(body!==undefined?{'Content-Type':'application/json'}:{}),
      },
      ...(body!==undefined?{body:JSON.stringify(body)}:{}),
    });
    if(!response.ok&&!allow.includes(response.status)){
      const error=Error(`GitHub ${method} ${path.split('?')[0]} HTTP ${response.status}`);
      error.status=response.status;throw error;
    }
    return response;
  };
}

function parseMarker(text){
  try{
    const value=JSON.parse(text);
    return value&&typeof value==='object'&&!Array.isArray(value)?value:null;
  }catch{return null;}
}

function liteInspectText(origin,token,share,info){
  const l=shareLinks(origin,token),r=repoLinks();
  return ['MY LITTLE KITCHEN — AI INSPECTION',`Generated: ${new Date().toISOString()}`,`Share: ${share.label||'AI reviewer'} (${share.scope})`,`Server state: v${info.version}${info.updatedAt?` · ${info.updatedAt}`:''}`,'','LIVE LINKS',`Actual shared page: ${l.root}`,`Latest state JSON: ${l.state}`,'','GITHUB',`Repository: ${r.repository}`,`AI handoff: ${r.handoff}`,`Live snapshot branch: ${r.liveSnapshot}`,'','Lite snapshot: inventory, recipes and notes are in state.json (AI_SNAPSHOT_LITE=true).'].join('\n');
}

// The state document mirrors /share/<token>/state.json. The raw D1 text is
// embedded as-is (it was validated as JSON when saved) to keep CPU low.
export function snapshotStateDocument(row){
  const version=Number(row?.version||0),updatedAt=row?.updated_at||null;
  return `{"version":${version},"updatedAt":${JSON.stringify(updatedAt)},"state":${row?.data||'null'}}\n`;
}

export async function publishAiSnapshot(env,{now=new Date(),force=false,fetchImpl=fetch}={}){
  const config=aiSnapshotConfig(env);
  if(!config.enabled)return {status:'disabled',reason:config.reason};
  const gh=github(config,fetchImpl);
  const repoPath=`/repos/${config.repo}`;

  // Live owner state must never land in a public repository (for example after
  // the code repository is made public and the data repository keeps the old
  // name). Refuse unless GitHub reports the target repository as private.
  const repoInfo=await (await gh(repoPath)).json().catch(()=>null);
  if(repoInfo?.private!==true)return {status:'skipped',reason:'target_repo_not_private'};

  const refResponse=await gh(`${repoPath}/git/ref/heads/${config.branch}`);
  const parentSha=clean((await refResponse.json())?.object?.sha);
  if(!/^[0-9a-f]{40}$/.test(parentSha))throw Error('Snapshot branch ref is malformed');

  const markerResponse=await gh(`${repoPath}/contents/${MARKER_PATH}?ref=${parentSha}`,{accept:'application/vnd.github.raw+json',allow:[404]});
  const marker=markerResponse.status===404?null:parseMarker(await markerResponse.text());

  // Read the small version row first; the ~1MB state text only when publishing.
  const head=await env.DB.prepare('SELECT version,updated_at FROM owner_state WHERE id=1').first();
  const version=Number(head?.version||0);
  if(!version)return {status:'skipped',reason:'no_state'};
  const lastVersion=Number(marker?.version||0);
  const lastPublished=Date.parse(marker?.publishedAt||'');
  if(lastVersion>version)return {status:'skipped',reason:'version_regressed',version,lastVersion};
  if(!force&&lastVersion===version)return {status:'unchanged',version};
  if(!force&&Number.isFinite(lastPublished)&&now.getTime()-lastPublished<config.minHours*3600_000)
    return {status:'throttled',version,lastVersion,nextAfter:new Date(lastPublished+config.minHours*3600_000).toISOString()};

  const row=await env.DB.prepare('SELECT data,version,updated_at FROM owner_state WHERE id=1 AND version=?').bind(version).first();
  if(!row?.data)return {status:'skipped',reason:'state_changed_during_publish'};
  let state=null;
  if(!config.lite){
    try{state=JSON.parse(row.data);}catch{return {status:'skipped',reason:'invalid_state_json'};}
  }
  let share=null;
  if(config.shareToken){
    share=await findShareByToken(env,config.shareToken).catch(()=>null);
    if(share?.scope!=='reviewer')share=null;
  }
  const info={state,version,updatedAt:row.updated_at||null};
  const shareInfo=share||{label:'Scheduled Worker snapshot',scope:'reviewer'};
  const inspect=config.lite
    ?liteInspectText(config.origin,share?config.shareToken:'',shareInfo,info)
    :inspectText(config.origin,share?config.shareToken:'',shareInfo,info);
  const publishedAt=now.toISOString();
  const auditDue=config.dispatchAudit&&(!Number.isFinite(Date.parse(marker?.auditDispatchedAt||''))
    ||now.getTime()-Date.parse(marker.auditDispatchedAt)>=config.auditMinHours*3600_000);
  const nextMarker={
    version,
    updatedAt:row.updated_at||null,
    publishedAt,
    publisher:'cloudflare-worker-cron',
    auditDispatchedAt:auditDue?publishedAt:(marker?.auditDispatchedAt||null),
  };
  const files=[
    ['.ai-live/state.json',snapshotStateDocument(row)],
    ['.ai-live/inspect.txt',inspect],
    ['.ai-live/refreshed-at.txt',publishedAt.replace(/\.\d{3}Z$/,'Z')+'\n'],
    [MARKER_PATH,JSON.stringify(nextMarker,null,2)+'\n'],
  ];

  const commitResponse=await gh(`${repoPath}/git/commits/${parentSha}`);
  const baseTree=clean((await commitResponse.json())?.tree?.sha);
  if(!/^[0-9a-f]{40}$/.test(baseTree))throw Error('Snapshot base tree is malformed');
  const tree=[];
  for(const [path,content] of files){
    const blob=await (await gh(`${repoPath}/git/blobs`,{method:'POST',body:{content,encoding:'utf-8'}})).json();
    tree.push({path,mode:'100644',type:'blob',sha:blob.sha});
  }
  const newTree=await (await gh(`${repoPath}/git/trees`,{method:'POST',body:{base_tree:baseTree,tree}})).json();
  const commit=await (await gh(`${repoPath}/git/commits`,{method:'POST',body:{
    message:`Refresh live snapshot v${version} from Worker cron`,
    tree:newTree.sha,
    parents:[parentSha],
  }})).json();
  // force:false = fast-forward only; a concurrent writer wins and we retry next hour.
  const update=await gh(`${repoPath}/git/refs/heads/${config.branch}`,{method:'PATCH',body:{sha:commit.sha,force:false},allow:[409,422]});
  if(!update.ok)return {status:'conflict',version};

  let audit='not-requested';
  if(auditDue){
    try{
      await gh(`${repoPath}/dispatches`,{method:'POST',body:{event_type:'ai-live-state-refreshed',client_payload:{version}}});
      audit='dispatched';
    }catch{audit='dispatch-failed';}
  }
  return {status:'published',version,commit:commit.sha,audit};
}

// Hourly cron entry: never throws, so the daily backup is never blocked.
export async function runScheduledAiSnapshot(env,options={}){
  try{
    const result=await publishAiSnapshot(env,options);
    if(result.status!=='disabled')console.log('ai-snapshot',JSON.stringify(result));
    return result;
  }catch(error){
    console.log('ai-snapshot failed',String(error?.message||error).slice(0,200));
    return {status:'failed',error:String(error?.message||error).slice(0,200)};
  }
}

export async function handleAiSnapshotAdmin(request,env,fetchImpl=fetch){
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  if(request.method==='GET'){
    const config=aiSnapshotConfig(env);
    return json({enabled:config.enabled,reason:config.reason||null,branch:config.branch,minHours:config.minHours,dispatchAudit:config.dispatchAudit});
  }
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  const result=await runScheduledAiSnapshot(env,{force:true,fetchImpl});
  const status=result.status==='failed'?502:result.status==='disabled'?503:200;
  return json(result,status);
}
