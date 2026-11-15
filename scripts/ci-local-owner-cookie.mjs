const [base,password,eventId='ci-inbox-onion-1',name='양파']=process.argv.slice(2);
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base||''))throw Error('local base URL required');
if(!password)throw Error('local owner password required');

const login=await fetch(base+'/auth/login',{
 method:'POST',
 redirect:'manual',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({password}),
});
if(login.status!==303)throw Error('local owner login expected 303, got '+login.status);
const raw=typeof login.headers.getSetCookie==='function'
 ?login.headers.getSetCookie().join(',')
 :(login.headers.get('set-cookie')||'');
const owner=raw.match(/(?:^|,\s*)(mlk_owner=[^;,\s]+)/)?.[1]||'';
if(!owner)throw Error('local owner Secure cookie missing');
const headers={cookie:owner,accept:'application/json'};

const sessionResponse=await fetch(base+'/api/session',{headers});
if(!sessionResponse.ok)throw Error('local owner session HTTP '+sessionResponse.status);
const session=await sessionResponse.json();
if(session.role!=='owner')throw Error('local owner session role was '+String(session.role));

const inboxUrl=base+'/api/food-research/intake-inbox?name='+encodeURIComponent(name);
const inboxResponse=await fetch(inboxUrl,{headers});
if(!inboxResponse.ok)throw Error('owner inbox HTTP '+inboxResponse.status);
const inbox=await inboxResponse.json();
if(Number(inbox.count)!==1)throw Error('expected one pending inbox item, got '+String(inbox.count));
const item=inbox.items?.[0];
if(item?.id!==eventId||item?.intake?.product?.name!=='양파 테스트 상품 1kg')
 throw Error('owner inbox identity mismatch');
if(item?.intakeCandidate?.provider!=='purchase-intake'||item?.intakeCandidate?.autoEligible!==false)
 throw Error('owner inbox nutrition candidate mismatch');

const apply=await fetch(base+'/api/food-research/intake-inbox/'+encodeURIComponent(eventId),{
 method:'POST',
 headers:{...headers,'content-type':'application/json'},
 body:JSON.stringify({status:'applied'}),
});
if(!apply.ok)throw Error('owner inbox apply HTTP '+apply.status);
const applied=await apply.json();
if(!applied.ok||applied.status!=='applied')throw Error('owner inbox applied receipt mismatch');

const afterResponse=await fetch(inboxUrl,{headers});
if(!afterResponse.ok)throw Error('owner inbox after HTTP '+afterResponse.status);
const after=await afterResponse.json();
if(Number(after.count)!==0)throw Error('applied inbox item remained pending');

process.stdout.write('LOCAL_OWNER_INBOX=PASS; OWNER_SESSION=PASS; OWNER_VIEW=1; APPLIED_PENDING=0');
