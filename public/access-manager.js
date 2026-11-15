const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function fmt(value){
 if(!value)return '기록 없음';
 try{return new Intl.DateTimeFormat('ko-KR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));}
 catch{return String(value);}
}

function deviceName(ua=''){
 const text=String(ua);
 const os=/Windows NT/i.test(text)?'Windows':/Android/i.test(text)?'Android':/iPhone|iPad/i.test(text)?'iPhone/iPad':/Mac OS X/i.test(text)?'Mac':/Linux/i.test(text)?'Linux':'기기';
 const browser=/Edg\//.test(text)?'Edge':/Chrome\//.test(text)?'Chrome':/Firefox\//.test(text)?'Firefox':/Safari\//.test(text)?'Safari':'브라우저';
 return `${os} · ${browser}`;
}

function place(row){
 const parts=[row.city,row.region,row.country].filter(Boolean);
 return parts.length?parts.join(' · '):'위치 정보 없음';
}

function eventRow(row){
 return `<div class="access-event"><div><strong>${esc(row.kind==='family'?(row.shareLabel||'가족용 링크'):deviceName(row.userAgent))}</strong><small>${esc(fmt(row.createdAt))}</small></div><div class="access-detail"><span>${esc(row.ip||'IP 정보 없음')}</span><span>${esc(place(row))}</span>${row.kind==='family'?`<span>${esc(deviceName(row.userAgent))}</span>`:''}</div></div>`;
}

function eventList(rows,visibleCount,emptyText){
 const list=Array.isArray(rows)?rows:[];if(!list.length)return `<p class="access-empty">${esc(emptyText)}</p>`;
 const visible=list.slice(0,visibleCount),rest=list.slice(visibleCount);
 return visible.map(eventRow).join('')+(rest.length?`<details class="access-more"><summary>이전 기록 ${rest.length}개 더 보기</summary><div class="access-list access-list-rest">${rest.map(eventRow).join('')}</div></details>`:'');
}

function deviceRow(row){
 const active=Number(row.activeSessions||0);
 const status=row.current?'현재 기기':row.trusted?'내 기기로 확인됨':'미확인 기기';
 const sessionText=active?`활성 로그인 ${active}개`:'활성 로그인 없음';
 const actions=[];
 if(!row.trusted)actions.push('<button type="button" class="outline-button" data-trust-device>내 기기 맞음</button>');
 if(active)actions.push(`<button type="button" class="outline-button access-revoke" data-revoke-device>${row.current?'이 기기 로그아웃':'로그인 만료'}</button>`);
 return `<div class="access-device${row.current?' is-current':''}" data-device="${esc(row.deviceId)}"><div class="access-device-main"><div><strong>${esc(deviceName(row.userAgent))}</strong><small>${esc(status)} · ${esc(sessionText)}</small></div><div class="access-detail"><span>${esc(row.ip||'IP 정보 없음')}</span><span>${esc(place(row))}</span><span>최근 ${esc(fmt(row.sessionLastSeenAt||row.lastSeenAt))}</span></div></div>${actions.length?`<div class="access-device-actions">${actions.join('')}</div>`:''}</div>`;
}

export function installAccessManager(){
 const button=document.getElementById('manage-shares'),dialog=document.getElementById('share-dialog');
 if(!button||!dialog||document.getElementById('access-panel'))return;
 const panel=document.createElement('section');panel.id='access-panel';panel.className='access-panel';
 panel.innerHTML='<h3>접속 기록 · 기기 보안</h3><p class="field-help">소유자 로그인은 기기별 세션으로 관리돼요. 모르는 기기의 <b>로그인 만료</b>를 누르면 그 기기는 다음 요청부터 주방 데이터를 받을 수 없어요. 모르는 기기가 실제로 있다면 비밀번호도 함께 바꾸는 것이 안전해요.</p><div id="access-warnings"></div><div><div class="access-section-heading"><h4>소유자 기기</h4><button type="button" class="outline-button" id="revoke-other-sessions">다른 기기 모두 로그아웃</button></div><div id="owner-device-list" class="access-list"></div></div><div><h4>소유자 접속</h4><div id="owner-access-list" class="access-list"></div></div><div><h4>가족용 링크 접속</h4><div id="family-access-list" class="access-list"></div></div><p id="access-message" class="field-help" aria-live="polite"></p>';
 dialog.querySelector('.recipe-editor')?.append(panel);
 const warnings=panel.querySelector('#access-warnings'),deviceList=panel.querySelector('#owner-device-list'),ownerList=panel.querySelector('#owner-access-list'),familyList=panel.querySelector('#family-access-list'),message=panel.querySelector('#access-message');
 let loading=false,lastCheckedAt=0;
 const CHECK_INTERVAL=5*60*1000;

 function paintBadge(count){
  button.querySelector('.access-badge')?.remove();
  if(count>0){const badge=document.createElement('span');badge.className='access-badge';badge.title=`확인하지 않은 활성 소유자 기기 ${count}개`;button.append(badge);}
 }

 async function load({badgeOnly=false,force=false}={}){
  const now=Date.now();
  if(loading)return;
  if(!force&&now-lastCheckedAt<CHECK_INTERVAL)return;
  loading=true;
  try{
   if(badgeOnly){
    const response=await fetch('/api/access/status',{cache:'no-store'});if(!response.ok)throw new Error();
    const data=await response.json();lastCheckedAt=Date.now();paintBadge(Number(data.untrusted||0));return;
   }
   const response=await fetch('/api/access',{cache:'no-store'});if(!response.ok)throw new Error();
   lastCheckedAt=Date.now();
   const data=await response.json(),devices=Array.isArray(data.devices)?data.devices:[],unknown=devices.filter(device=>!device.trusted&&Number(device.activeSessions||0)>0);
   paintBadge(unknown.length);
   warnings.innerHTML=unknown.map(device=>`<div class="access-warning" data-device="${esc(device.deviceId)}"><strong>⚠ 새로운 소유자 기기에서 활성 로그인이 있어요</strong><div class="access-detail"><span>${esc(deviceName(device.userAgent))}</span><span>${esc(device.ip||'IP 정보 없음')}</span><span>${esc(place(device))}</span><span>최근 ${esc(fmt(device.sessionLastSeenAt||device.lastSeenAt))}</span></div><div class="access-device-actions"><button type="button" class="outline-button" data-trust-device>내 기기 맞음</button><button type="button" class="outline-button access-revoke" data-revoke-device>로그인 만료</button></div></div>`).join('');
   deviceList.innerHTML=devices.length?devices.map(deviceRow).join(''):'<p class="access-empty">기기 기록이 아직 없어요.</p>';
   ownerList.innerHTML=eventList(data.ownerEvents,4,'아직 소유자 접속 기록이 없어요.');
   familyList.innerHTML=eventList(data.familyEvents,5,'아직 가족용 링크 접속 기록이 없어요.');
   message.textContent='최근 30일 접속 기록과 현재 활성 로그인 상태를 보여줘요.';
  }catch{
   if(!badgeOnly)message.textContent='접속 기록을 불러오지 못했어요.';
  }finally{loading=false;}
 }

 panel.addEventListener('click',async event=>{
  const revokeOthers=event.target.closest('#revoke-other-sessions');
  if(revokeOthers){
   revokeOthers.disabled=true;message.textContent='다른 기기 로그인을 만료시키는 중…';
   try{
    const response=await fetch('/api/access/sessions/revoke-others',{method:'POST'});if(!response.ok)throw new Error();
    const data=await response.json();message.textContent=`다른 기기의 활성 로그인 ${Number(data.revoked||0)}개를 만료시켰어요.`;lastCheckedAt=0;await load({force:true});
   }catch{message.textContent='다른 기기 로그인을 만료시키지 못했어요.';}
   finally{revokeOthers.disabled=false;}
   return;
  }

  const row=event.target.closest('[data-device]'),id=row?.dataset.device;if(!id)return;
  const trust=event.target.closest('[data-trust-device]');
  if(trust){
   trust.disabled=true;message.textContent='기기를 확인하는 중…';
   try{
    const response=await fetch(`/api/access/devices/${encodeURIComponent(id)}/trust`,{method:'POST'});if(!response.ok)throw new Error();
    message.textContent='내 기기로 확인했어요.';lastCheckedAt=0;await load({force:true});
   }catch{message.textContent='기기 확인 상태를 저장하지 못했어요.';trust.disabled=false;}
   return;
  }

  const revoke=event.target.closest('[data-revoke-device]');
  if(revoke){
   revoke.disabled=true;message.textContent='이 기기의 로그인을 만료시키는 중…';
   try{
    const response=await fetch(`/api/access/devices/${encodeURIComponent(id)}/revoke`,{method:'POST'});if(!response.ok)throw new Error();
    const data=await response.json();
    if(data.current){location.assign('/auth/login');return;}
    message.textContent=`이 기기의 활성 로그인 ${Number(data.revoked||0)}개를 만료시켰어요.`;lastCheckedAt=0;await load({force:true});
   }catch{message.textContent='기기 로그인을 만료시키지 못했어요.';revoke.disabled=false;}
  }
 });
 button.addEventListener('click',()=>setTimeout(()=>load({force:true}),0));

 const refreshVisible=()=>{
  if(document.visibilityState!=='visible')return;
  load({badgeOnly:!dialog.open});
 };
 document.addEventListener('visibilitychange',refreshVisible);
 window.addEventListener('focus',refreshVisible);
 window.addEventListener('pageshow',refreshVisible);
 setInterval(refreshVisible,CHECK_INTERVAL);
 load({badgeOnly:true,force:true});
}
