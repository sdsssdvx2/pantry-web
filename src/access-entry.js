import app from './share-entry.js';
import {isDailyMaintenanceRun} from './worker.js';
import {handleStateApi} from './state-entry.js';
import { familySafeState } from './share-state.js';
import {findShareByToken} from './auth-service.js';
import {inspectText,repoLinks,shareLinks} from './ai-inspection.js';
import {handleAccessApi,isBrowserNavigation,pruneAccessEvents,recordNavigationAccess} from './access-service.js';

const AI_TOKEN_PATTERN='[A-Za-z0-9_-]{20,}';
const AI_INSPECTION_TAILS=new Set(['inspect.txt','state.json','rendered.txt']);

function plain(body,status=200){
  return new Response(body,{status,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow, noarchive'}});
}

async function stateInfo(env){
  try{
    const row=await env.DB.prepare('SELECT data,version,updated_at FROM owner_state WHERE id=1').first();
    let state=null;try{state=JSON.parse(row?.data||'null');}catch{}
    return {state,version:Number(row?.version||0),updatedAt:row?.updated_at||null};
  }catch{return {state:null,version:0,updatedAt:null};}
}

function stateJson(info){
  return new Response(JSON.stringify({version:info.version,updatedAt:info.updatedAt,state:info.state},null,2),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow, noarchive'}});
}

function stableRendered(origin,token,share,info){
  const l=shareLinks(origin,token),r=repoLinks();
  return plain(['MY LITTLE KITCHEN — STABLE AI VIEW','','This endpoint intentionally does not start Cloudflare Browser Run.','It is safe for repeated AI reads and does not consume Browser Run quota.','',`Actual browser page: ${l.root}`,`Inspection bundle: ${l.inspect}`,`Latest state JSON: ${l.state}`,`Repository: ${r.repository}`,`AI handoff: ${r.handoff}`,`GitHub live browser snapshot: ${r.liveSnapshot}`,'',inspectText(origin,token,share,info)].join('\n'));
}

function parseSharePath(pathname){
  const match=pathname.match(new RegExp(`^/share/(${AI_TOKEN_PATTERN})(?:/(.*))?$`));
  return match?{token:match[1],tail:match[2]||''}:null;
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/deploy-version.txt'){
      const response=await env.ASSETS.fetch(request);
      const headers=new Headers(response.headers);
      headers.set('cache-control','no-store');
      headers.set('content-type','text/plain; charset=utf-8');
      headers.set('x-robots-tag','noindex, nofollow, noarchive');
      return new Response(response.body,{status:response.status,headers});
    }
    const stateResponse=await handleStateApi(request,env,url);
    if(stateResponse)return stateResponse;
    if(url.pathname==='/api/access/status'||url.pathname.startsWith('/api/access'))return handleAccessApi(request,env,url);

    const parsed=parseSharePath(url.pathname);
    if(parsed){
      const inspectionTail=AI_INSPECTION_TAILS.has(parsed.tail);
      const stableReviewerRoot=!parsed.tail&&!isBrowserNavigation(request);
      if(inspectionTail||stableReviewerRoot){
        const share=await findShareByToken(env,parsed.token);
        if(share&&(inspectionTail||share.scope==='reviewer')){
          const rawInfo=await stateInfo(env),info=share.scope==='viewer'?{...rawInfo,state:familySafeState(rawInfo.state)}:rawInfo,origin=url.origin;
          if(parsed.tail==='inspect.txt')return plain(inspectText(origin,parsed.token,share,info));
          if(parsed.tail==='state.json')return stateJson(info);
          if(parsed.tail==='rendered.txt')return stableRendered(origin,parsed.token,share,info);
          if(stableReviewerRoot)return stableRendered(origin,parsed.token,share,info);
        }
      }
    }

    const response=await app.fetch(request,env,ctx);
    return recordNavigationAccess(request,env,url,response);
  },
  async scheduled(controller,env,ctx){
    if(isDailyMaintenanceRun(controller))ctx.waitUntil(pruneAccessEvents(env).catch(()=>{}));
    if(typeof app.scheduled==='function')return app.scheduled(controller,env,ctx);
  }
};
