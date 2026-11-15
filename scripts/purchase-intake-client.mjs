#!/usr/bin/env node
import {validateFoodIntakeServiceProvenance} from '../src/food-intake.js';

const MAX_STDIN_BYTES=64_000;
const REQUEST_TIMEOUT_MS=15_000;
const TOKEN_RE=/^[A-Za-z0-9._~-]{32,512}$/;

function fail(message,code=2){
 console.error('PURCHASE_INTAKE_CLIENT=HOLD; '+message);
 process.exitCode=code;
}

function parseArgs(argv){
 const out={dryRun:false,endpoint:''};
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];
  if(arg==='--dry-run'){out.dryRun=true;continue;}
  if(arg==='--endpoint'){
   const value=argv[++i];
   if(!value)throw Error('--endpoint 값이 필요해요.');
   out.endpoint=value;continue;
  }
  throw Error('알 수 없는 옵션이에요: '+arg);
 }
 return out;
}

function intakeEndpoint(value){
 const raw=String(value||process.env.MLK_PURCHASE_INTAKE_ENDPOINT||'').trim();
 if(!raw)throw Error('MLK_PURCHASE_INTAKE_ENDPOINT 또는 --endpoint가 필요해요.');
 let url;
 try{url=new URL(raw);}catch{throw Error('intake endpoint URL을 확인해 주세요.');}
 const loopback=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 if(url.protocol!=='https:'&&!(loopback&&url.protocol==='http:'))
  throw Error('intake endpoint는 HTTPS여야 해요. 로컬 loopback만 HTTP를 허용해요.');
 if(url.username||url.password||url.search||url.hash)throw Error('endpoint에는 계정·쿼리·fragment를 넣지 마세요.');
 if(url.pathname!=='/'&&url.pathname!=='')throw Error('endpoint는 origin만 지정해 주세요.');
 return new URL('/api/food-research/intake',url.origin);
}

async function readStdin(){
 const chunks=[];let size=0;
 for await(const chunk of process.stdin){
  size+=chunk.length;
  if(size>MAX_STDIN_BYTES)throw Error('intake JSON이 너무 커요.');
  chunks.push(chunk);
 }
 if(!size)throw Error('stdin으로 intake JSON을 전달해 주세요.');
 return Buffer.concat(chunks).toString('utf8');
}

async function main(){
 let args;
 try{args=parseArgs(process.argv.slice(2));}
 catch(error){fail(error.message);return;}

 let raw;
 try{raw=await readStdin();}
 catch(error){fail(error.message);return;}

 let input,event;
 try{
  input=JSON.parse(raw);
  event=validateFoodIntakeServiceProvenance(input);
 }catch(error){fail('VALIDATION_FAILED; '+(error?.message||'intake JSON을 확인해 주세요.'));return;}

 if(args.dryRun){
  const metrics=Object.keys(event.product.nutrition||{}).filter(key=>!['basisAmount','basisUnit'].includes(key)).length;
  console.log([
   'PURCHASE_INTAKE_CLIENT=DRY_RUN_PASS',
   'EVENT_ID='+event.eventId,
   'SOURCE='+(event.source.merchant||event.source.domain),
   'HAS_PRODUCT_URL='+(event.product.productUrl?'YES':'NO'),
   'HAS_BARCODE='+(event.product.barcode?'YES':'NO'),
   'NUTRITION_METRICS='+metrics,
   'NETWORK_REQUESTS=0',
  ].join('; '));
  return;
 }

 let endpoint;
 try{endpoint=intakeEndpoint(args.endpoint);}
 catch(error){fail(error.message);return;}
 const token=String(process.env.PURCHASE_INTAKE_TOKEN||'');
 if(!TOKEN_RE.test(token)){fail('PURCHASE_INTAKE_TOKEN_MISSING_OR_INVALID');return;}

 let response;
 try{
  response=await fetch(endpoint,{
   method:'POST',
   redirect:'error',
   signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS),
   headers:{
    'accept':'application/json',
    'content-type':'application/json; charset=utf-8',
    'authorization':'Bearer '+token,
   },
   body:JSON.stringify(event),
  });
 }catch(error){fail('NETWORK_FAILED; '+(error?.name||'request_error'));return;}

 let receipt={};
 try{receipt=await response.json();}catch{}
 if(![200,202].includes(response.status)||!receipt?.ok||receipt?.writes!=='inbox-only'){
  fail('SERVER_REJECTED; HTTP='+response.status+'; ERROR='+String(receipt?.error||'unknown').slice(0,80));
  return;
 }
 console.log([
  'PURCHASE_INTAKE_CLIENT=PASS',
  'HTTP='+response.status,
  'EVENT_ID='+event.eventId,
  'DUPLICATE='+(receipt.duplicate?'YES':'NO'),
  'STATUS='+String(receipt.status||'pending'),
  'WRITES=INBOX_ONLY',
  'AUTO_RETRY=NO',
 ].join('; '));
}

await main();
