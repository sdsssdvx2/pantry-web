import {findShareByToken,getAuth} from './auth-service.js';
import {OWNER_DEVICE_COOKIE,clearOwnerCookie,cookieValue,ownerDeviceCookie} from './auth-service.js';

const VIEWER_DEVICE_COOKIE='mlk_view_device';
const SHARE_TOKEN_RE=/^\/share\/([A-Za-z0-9_-]{20,})\/?$/;

function json(data,status=200,headers={}){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
}

function randomToken(bytes=18){
  const raw=new Uint8Array(bytes);crypto.getRandomValues(raw);
  return btoa(String.fromCharCode(...raw)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}

function deviceCookie(name,value){
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;
}

export function isBrowserNavigation(request){
  const mode=(request.headers.get('sec-fetch-mode')||'').toLowerCase();
  const dest=(request.headers.get('sec-fetch-dest')||'').toLowerCase();
  if(mode==='navigate'||dest==='document')return true;
  return (request.headers.has('sec-fetch-site')||request.headers.has('sec-ch-ua'))&&/mozilla\//i.test(request.headers.get('user-agent')||'');
}

function requestMeta(request){
  const cf=request.cf||{};
  return {
    ip:(request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')||'').split(',')[0].trim().slice(0,80),
    country:String(cf.country||'').slice(0,80),
    region:String(cf.region||'').slice(0,120),
    city:String(cf.city||'').slice(0,120),
    userAgent:String(request.headers.get('user-agent')||'').slice(0,500),
  };
}

async function ownerAuth(request,env){
  const auth=await getAuth(request,env);
  return auth.role==='owner'?auth:null;
}

export async function pruneAccessEvents(env){
  const cutoff=new Date(Date.now()-30*86400000).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM access_events WHERE created_at<?').bind(cutoff),
    env.DB.prepare('DELETE FROM access_events WHERE id NOT IN (SELECT id FROM access_events ORDER BY created_at DESC LIMIT 300)'),
  ]);
  try{
    await env.DB.prepare('DELETE FROM owner_sessions WHERE expires_at<? OR (revoked_at IS NOT NULL AND revoked_at<?)')
      .bind(new Date(Date.now()-86400000).toISOString(),cutoff).run();
  }catch{}
}

async function logOwnerVisit(request,env,deviceId){
  const now=new Date().toISOString(),nowMs=Date.now(),meta=requestMeta(request);
  const existing=await env.DB.prepare('SELECT device_id,trusted,last_seen_at FROM access_devices WHERE device_id=?').bind(deviceId).first();
  const event=env.DB.prepare("INSERT INTO access_events (kind,device_id,ip,country,region,city,user_agent,created_at) VALUES ('owner',?,?,?,?,?,?,?)")
    .bind(deviceId,meta.ip,meta.country,meta.region,meta.city,meta.userAgent,now);
  if(!existing){
    const row=await env.DB.prepare('SELECT COUNT(*) AS n FROM access_devices').first();
    const trusted=Number(row?.n||0)===0?1:0;
    const device=env.DB.prepare('INSERT INTO access_devices (device_id,first_seen_at,last_seen_at,first_ip,last_ip,country,region,city,user_agent,trusted) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(deviceId,now,now,meta.ip,meta.ip,meta.country,meta.region,meta.city,meta.userAgent,trusted);
    await env.DB.batch([device,event]);
    return;
  }
  const update=env.DB.prepare('UPDATE access_devices SET last_seen_at=?,last_ip=?,country=?,region=?,city=?,user_agent=? WHERE device_id=?')
    .bind(now,meta.ip,meta.country,meta.region,meta.city,meta.userAgent,deviceId);
  const recentlySeen=Number.isFinite(Date.parse(existing.last_seen_at||''))&&Date.parse(existing.last_seen_at)>nowMs-10*60*1000;
  if(recentlySeen)await update.run();
  else await env.DB.batch([update,event]);
}

async function logFamilyVisit(request,env,share,deviceId){
  const now=new Date().toISOString(),meta=requestMeta(request);
  const cutoff=new Date(Date.now()-10*60*1000).toISOString();
  const recent=await env.DB.prepare("SELECT id FROM access_events WHERE kind='family' AND share_id=? AND device_id=? AND created_at>? ORDER BY created_at DESC LIMIT 1")
    .bind(share.id,deviceId,cutoff).first();
  if(!recent)await env.DB.prepare("INSERT INTO access_events (kind,share_id,share_label,device_id,ip,country,region,city,user_agent,created_at) VALUES ('family',?,?,?,?,?,?,?,?,?)")
    .bind(share.id,share.label||'가족용',deviceId,meta.ip,meta.country,meta.region,meta.city,meta.userAgent,now).run();
}

async function findFamilyShare(env,token){
  const share=await findShareByToken(env,token);
  return share?.scope==='viewer'?share:null;
}

function publicEvent(row){
  return {id:row.id,kind:row.kind,shareLabel:row.share_label||null,deviceId:row.device_id||null,ip:row.ip||'',country:row.country||'',region:row.region||'',city:row.city||'',userAgent:row.user_agent||'',createdAt:row.created_at};
}

export async function handleAccessApi(request,env,url=new URL(request.url)){
  const auth=await ownerAuth(request,env);
  if(!auth)return json({error:'forbidden'},403);
  const nowIso=new Date().toISOString();

  if(request.method==='GET'&&url.pathname==='/api/access/status'){
    const row=await env.DB.prepare('SELECT COUNT(*) AS n FROM access_devices d WHERE d.trusted=0 AND EXISTS (SELECT 1 FROM owner_sessions s WHERE s.device_id=d.device_id AND s.revoked_at IS NULL AND s.expires_at>?)').bind(nowIso).first();
    return json({untrusted:Number(row?.n||0)});
  }

  if(request.method==='GET'&&url.pathname==='/api/access'){
    try{await pruneAccessEvents(env);}catch{}
    const devices=await env.DB.prepare('SELECT device_id,first_seen_at,last_seen_at,last_ip,country,region,city,user_agent,trusted FROM access_devices ORDER BY last_seen_at DESC LIMIT 30').all();
    const sessions=await env.DB.prepare('SELECT device_id,COUNT(*) AS active_sessions,MAX(last_seen_at) AS session_last_seen_at FROM owner_sessions WHERE revoked_at IS NULL AND expires_at>? GROUP BY device_id').bind(nowIso).all();
    const ownerEvents=await env.DB.prepare("SELECT * FROM access_events WHERE kind='owner' ORDER BY created_at DESC LIMIT 30").all();
    const familyEvents=await env.DB.prepare("SELECT * FROM access_events WHERE kind='family' ORDER BY created_at DESC LIMIT 60").all();
    const active=new Map((sessions.results||[]).map(row=>[row.device_id,{count:Number(row.active_sessions||0),lastSeenAt:row.session_last_seen_at||null}]));
    return json({
      currentDeviceId:auth.session?.deviceId||null,
      devices:(devices.results||[]).map(row=>{
        const session=active.get(row.device_id)||{count:0,lastSeenAt:null};
        return {deviceId:row.device_id,firstSeenAt:row.first_seen_at,lastSeenAt:row.last_seen_at,sessionLastSeenAt:session.lastSeenAt,ip:row.last_ip||'',country:row.country||'',region:row.region||'',city:row.city||'',userAgent:row.user_agent||'',trusted:!!row.trusted,activeSessions:session.count,current:row.device_id===auth.session?.deviceId};
      }),
      ownerEvents:(ownerEvents.results||[]).map(publicEvent),
      familyEvents:(familyEvents.results||[]).map(publicEvent),
      retentionDays:30,
    });
  }

  if(request.method==='POST'&&url.pathname==='/api/access/sessions/revoke-others'){
    const result=await env.DB.prepare('UPDATE owner_sessions SET revoked_at=? WHERE session_id<>? AND revoked_at IS NULL AND expires_at>?')
      .bind(nowIso,auth.session.sessionId,nowIso).run();
    return json({ok:true,revoked:Number(result.meta?.changes||0)});
  }

  const trust=url.pathname.match(/^\/api\/access\/devices\/([^/]+)\/trust$/);
  if(request.method==='POST'&&trust){
    const deviceId=decodeURIComponent(trust[1]);
    const result=await env.DB.prepare('UPDATE access_devices SET trusted=1 WHERE device_id=?').bind(deviceId).run();
    return result.meta?.changes?json({ok:true}):json({error:'not_found'},404);
  }

  const revoke=url.pathname.match(/^\/api\/access\/devices\/([^/]+)\/revoke$/);
  if(request.method==='POST'&&revoke){
    const deviceId=decodeURIComponent(revoke[1]);
    const result=await env.DB.prepare('UPDATE owner_sessions SET revoked_at=? WHERE device_id=? AND revoked_at IS NULL AND expires_at>?')
      .bind(nowIso,deviceId,nowIso).run();
    try{await env.DB.prepare('UPDATE access_devices SET trusted=0 WHERE device_id=?').bind(deviceId).run();}catch{}
    const current=deviceId===auth.session?.deviceId;
    return json({ok:true,revoked:Number(result.meta?.changes||0),current},200,current?{'set-cookie':clearOwnerCookie()}:{});
  }

  return json({error:'not_found'},404);
}

function withCookie(response,cookie){
  const headers=new Headers(response.headers);headers.append('set-cookie',cookie);headers.delete('content-length');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export async function recordNavigationAccess(request,env,url,response){
  if(request.method!=='GET'||!response.ok||!isBrowserNavigation(request))return response;

  if(url.pathname==='/'){
    const current=await getAuth(request,env);
    if(current?.role==='owner'){
      const deviceId=current.session?.deviceId||cookieValue(request,OWNER_DEVICE_COOKIE);
      if(!deviceId)return response;
      let next=response;
      if(cookieValue(request,OWNER_DEVICE_COOKIE)!==deviceId)next=withCookie(next,ownerDeviceCookie(deviceId));
      try{await logOwnerVisit(request,env,deviceId);}catch{}
      return next;
    }
    return response;
  }

  const shareMatch=url.pathname.match(SHARE_TOKEN_RE);
  if(shareMatch){
    const current=await getAuth(request,env);
    if(current?.role==='owner')return response;
    const share=await findFamilyShare(env,shareMatch[1]);
    if(share){
      let deviceId=cookieValue(request,VIEWER_DEVICE_COOKIE),next=response;
      if(!deviceId){deviceId=randomToken();next=withCookie(next,deviceCookie(VIEWER_DEVICE_COOKIE,deviceId));}
      try{await logFamilyVisit(request,env,share,deviceId);}catch{}
      return next;
    }
  }
  return response;
}
