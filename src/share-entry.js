import app from './worker.js';
import {familySafeState} from './share-state.js';
import {SHARE_COOKIE,findShareByToken,getAuth} from './auth-service.js';
import {SITE_CONFIG} from '../public/site-config.js';

const tokenPattern='[A-Za-z0-9_-]{20,}';
const SCREENSHOT_CACHE_REV='2026-09-14-3';
const REPOSITORY_URL=SITE_CONFIG.repositoryUrl;

function text(data,status=200,headers={}){
  return new Response(data,{status,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow, noarchive',...headers}});
}

function escapeHTML(value=''){
  return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

async function currentState(env){
  try{
    const row=await env.DB.prepare('SELECT data, version, updated_at FROM owner_state WHERE id=1').first();
    if(!row)return {state:null,version:0,updatedAt:null};
    let state=null;try{state=JSON.parse(row.data||'null');}catch{}
    return {state,version:Number(row.version||0),updatedAt:row.updated_at||null};
  }catch{return {state:null,version:0,updatedAt:null};}
}

function shareCookie(token){
  return `${SHARE_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=15552000`;
}

async function familySafeCurationResponse(response,head=false){
  if(!response.ok)return response;
  let rows=[];
  try{const parsed=await response.json();rows=Array.isArray(parsed)?parsed:[];}catch{}
  const safe=familySafeState({curation:rows})?.curation||[];
  const headers=new Headers(response.headers);
  headers.set('content-type','application/json; charset=utf-8');
  headers.set('cache-control','no-store');
  headers.set('x-robots-tag','noindex, nofollow, noarchive');
  headers.delete('content-length');
  return new Response(head?null:JSON.stringify(safe),{status:response.status,statusText:response.statusText,headers});
}

function syntheticRequest(request,targetUrl,token){
  const headers=new Headers(request.headers);
  const existing=headers.get('cookie');
  headers.set('cookie',`${existing?existing+'; ':''}${SHARE_COOKIE}=${encodeURIComponent(token)}`);
  headers.set('x-mlk-share-render',token);
  headers.delete('host');
  return new Request(targetUrl,{method:'GET',headers,redirect:'manual'});
}

function inspectionLinks(origin,token){
  const root=`${origin}/share/${token}`;
  return {
    repository:REPOSITORY_URL,
    inspect:`${root}/inspect.txt`,
    rendered:`${root}/rendered.txt`,
    screenshot:`${root}/screenshot.png?full=1&width=1440`,
    state:`${root}/state.json`,
    html:`${root}/asset/index.html`,
    css:`${root}/asset/style.css`,
    app:`${root}/asset/app.js`,
  };
}

function countState(state){
  const items=Array.isArray(state?.items)?state.items.length:0;
  const custom=Array.isArray(state?.recipes)?state.recipes.length:0;
  const hidden=Array.isArray(state?.hidden)?state.hidden.length:0;
  const noteRows=state?.curation??state?.library?.curation,notes=Array.isArray(noteRows)?noteRows.length:null;
  return {items,custom,hidden,notes};
}

function injectInspection(html,stateInfo,origin,token){
  const links=inspectionLinks(origin,token);
  const counts=countState(stateInfo.state);
  const summary=`현재 서버 버전 v${stateInfo.version}${stateInfo.updatedAt?` · ${stateInfo.updatedAt}`:''} · 식재료 ${counts.items}개 · 직접 추가 레시피 ${counts.custom}개 · 삭제 상태 ${counts.hidden}개${counts.notes===null?'':` · 요리 노트 ${counts.notes}개`}`;
  const alternate=`<link rel="alternate" type="text/plain" title="Rendered AI inspection" href="${escapeHTML(links.rendered)}"><link rel="alternate" type="text/plain" title="AI inspection bundle" href="${escapeHTML(links.inspect)}"><link rel="alternate" type="application/json" title="Latest kitchen state" href="${escapeHTML(links.state)}"><link rel="alternate" type="image/png" title="Current full-page screenshot" href="${escapeHTML(links.screenshot)}">`;
  const aiBlock=`<noscript id="mlk-ai-inspection"><section><h2>AI용 사이트 검사 정보</h2><p>${escapeHTML(summary)}</p><p>이 공유 링크는 쿠키나 JavaScript가 없어도 읽을 수 있습니다. 비브라우저 AI는 렌더링 검사 문서나 최신 상태 JSON을 직접 열 수 있습니다.</p><ul><li><a href="${escapeHTML(links.rendered)}">렌더링 검사 결과</a></li><li><a href="${escapeHTML(links.screenshot)}">현재 전체 화면 스크린샷</a></li><li><a href="${escapeHTML(links.inspect)}">소스·상태 검사 문서</a></li><li><a href="${escapeHTML(links.state)}">최신 서버 상태 JSON</a></li><li><a href="${escapeHTML(REPOSITORY_URL)}">GitHub 저장소</a></li><li><a href="${escapeHTML(links.html)}">실제 HTML</a></li><li><a href="${escapeHTML(links.css)}">실제 CSS</a></li><li><a href="${escapeHTML(links.app)}">실제 app.js</a></li></ul></section></noscript>`;
  let out=html;
  if(!/<base\s/i.test(out))out=out.replace(/<head([^>]*)>/i,`<head$1><base href="/">${alternate}`);
  else out=out.replace(/<head([^>]*)>/i,`<head$1>${alternate}`);
  return out.replace(/<\/body>/i,`${aiBlock}</body>`);
}

async function shareHome(request,env,ctx,token,share){
  const url=new URL(request.url);
  const response=await app.fetch(syntheticRequest(request,`${url.origin}/`,token),env,ctx);
  if(!response.ok)return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  const rawStateInfo=await currentState(env);
  const stateInfo=share.scope==='viewer'?{...rawStateInfo,state:familySafeState(rawStateInfo.state)}:rawStateInfo;
  const html=injectInspection(await response.text(),stateInfo,url.origin,token);
  const headers=new Headers(response.headers);
  headers.set('content-type','text/html; charset=utf-8');
  headers.set('cache-control','no-store');
  headers.set('x-robots-tag','noindex, nofollow, noarchive');
  headers.set('set-cookie',shareCookie(token));
  const links=inspectionLinks(url.origin,token);
  headers.set('link',`<${links.rendered}>; rel="alternate"; type="text/plain", <${links.inspect}>; rel="alternate"; type="text/plain", <${links.state}>; rel="alternate"; type="application/json", <${links.screenshot}>; rel="alternate"; type="image/png"`);
  headers.delete('content-length');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

async function shareAsset(request,env,ctx,token,path,share){
  let decoded='';
  try{decoded=decodeURIComponent(path||'');}catch{return text('invalid asset path',400);}
  if(!decoded||decoded.includes('..')||decoded.includes('\\')||decoded.startsWith('/'))return text('invalid asset path',400);
  const url=new URL(request.url);
  const targetUrl=new URL(decoded==='index.html'?'/':`/${decoded}`,url.origin);
  const response=await app.fetch(syntheticRequest(request,targetUrl.toString(),token),env,ctx);
  if(share.scope==='viewer'&&targetUrl.pathname==='/curation.json')return familySafeCurationResponse(response,request.method==='HEAD');
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store');
  headers.set('x-robots-tag','noindex, nofollow, noarchive');
  headers.delete('content-length');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

async function directFamilyCuration(request,env,ctx){
  if(!['GET','HEAD'].includes(request.method))return null;
  const url=new URL(request.url);
  if(url.pathname!=='/curation.json')return null;
  const auth=await getAuth(request,env);
  if(auth.role!=='share'||auth.scope!=='viewer')return null;
  const source=request.method==='HEAD'?new Request(request.url,{method:'GET',headers:request.headers,redirect:'manual'}):request;
  return familySafeCurationResponse(await app.fetch(source,env,ctx),request.method==='HEAD');
}

async function cachedResponse(key){
  try{return await caches.default.match(key);}catch{return null;}
}

async function putCached(key,response,ctx){
  try{ctx.waitUntil(caches.default.put(key,response.clone()));}catch{}
}

async function shareScreenshot(request,env,ctx,token){
  const url=new URL(request.url);
  if(!env.BROWSER?.quickAction)return text('Browser Run 바인딩을 사용할 수 없어요.',503);
  const info=await currentState(env);
  const width=Math.min(1920,Math.max(900,Number(url.searchParams.get('width'))||1440));
  const height=Math.min(1800,Math.max(700,Number(url.searchParams.get('height'))||1200));
  const full=url.searchParams.get('full')!=='0';
  const cacheKey=new Request(`${url.origin}/__mlk_ai_screenshot/${encodeURIComponent(token)}?v=${info.version}&rev=${SCREENSHOT_CACHE_REV}&w=${width}&h=${height}&full=${full?1:0}`);
  const hit=await cachedResponse(cacheKey);
  if(hit)return hit;
  const target=`${url.origin}/share/${token}?__render=1`;
  try{
    const shot=await env.BROWSER.quickAction('screenshot',{
      url:target,
      screenshotOptions:{fullPage:full},
      viewport:{width,height},
      gotoOptions:{waitUntil:'networkidle0',timeout:45000},
    });
    if(!shot.ok)return shot;
    const headers=new Headers(shot.headers);
    headers.set('cache-control','public, max-age=120');
    headers.set('x-robots-tag','noindex, nofollow, noarchive');
    headers.delete('content-length');
    const result=new Response(shot.body,{status:shot.status,statusText:shot.statusText,headers});
    putCached(cacheKey,result,ctx);
    return result;
  }catch(error){return text(`스크린샷 생성 실패: ${String(error?.message||error)}`,502);}
}

async function directShare(request,env,ctx){
  if(request.method!=='GET'&&request.method!=='HEAD')return null;
  const url=new URL(request.url);
  const main=url.pathname.match(new RegExp(`^/share/(${tokenPattern})/?$`));
  const screenshot=url.pathname.match(new RegExp(`^/share/(${tokenPattern})/screenshot\\.png$`));
  const asset=url.pathname.match(new RegExp(`^/share/(${tokenPattern})/asset/(.+)$`));
  const match=main||screenshot||asset;
  if(!match)return null;
  const token=match[1];
  const share=await findShareByToken(env,token);
  if(!share)return text('공유 링크가 만료되었거나 소유자가 공유를 종료했어요.',410);
  if(screenshot)return shareScreenshot(request,env,ctx,token);
  if(asset)return shareAsset(request,env,ctx,token,asset[2],share);
  return shareHome(request,env,ctx,token,share);
}

export default {
  async fetch(request,env,ctx){
    const direct=await directShare(request,env,ctx);
    if(direct)return direct;
    const familyCuration=await directFamilyCuration(request,env,ctx);
    if(familyCuration)return familyCuration;
    return app.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    if(typeof app.scheduled==='function')return app.scheduled(controller,env,ctx);
  },
};