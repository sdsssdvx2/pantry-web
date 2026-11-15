import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {validateFoodIntakeServiceProvenance} from '../src/food-intake.js';

const token='purchase-intake-local-check-token-1234567890';
const event={
 schemaVersion:1,
 eventId:'purchase-client-check-1',
 capturedAt:'2026-11-14T00:00:00Z',
 source:{
  merchant:'로컬 테스트 상점',
  domain:'shop.example',
  archiveArtifactId:'artifact-check-1',
  contentSha256:'a'.repeat(64),
 },
 product:{
  name:'양파 테스트 상품',
  brand:'테스트브랜드',
  pack:'1kg',
  barcode:'8801234567890',
  productUrl:'https://shop.example/product/onion',
  ingredients:'양파 100%',
  allergens:'',
  storage:'냉장보관',
  shelfLife:'개봉 후 5일',
  nutrition:{basisAmount:100,basisUnit:'g',energyKcal:40,sodiumMg:4,proteinG:1.1},
 },
 quantity:{value:1,unit:'봉'},
};

function runClient(args,input,{withToken=true}={}){
 return new Promise((resolve,reject)=>{
  const env={...process.env};
  if(withToken)env.PURCHASE_INTAKE_TOKEN=token;
  else delete env.PURCHASE_INTAKE_TOKEN;
  delete env.MLK_PURCHASE_INTAKE_ENDPOINT;
  const child=spawn(process.execPath,['scripts/purchase-intake-client.mjs',...args],{
   env,stdio:['pipe','pipe','pipe'],
  });
  let stdout='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>stdout+=chunk);
  child.stderr.on('data',chunk=>stderr+=chunk);
  child.on('error',reject);
  child.on('close',code=>resolve({code,stdout,stderr}));
  child.stdin.end(JSON.stringify(input));
 });
}

const dry=await runClient(['--dry-run'],event,{withToken:false});
assert.equal(dry.code,0,dry.stderr);
assert.match(dry.stdout,/PURCHASE_INTAKE_CLIENT=DRY_RUN_PASS/);
assert.match(dry.stdout,/NETWORK_REQUESTS=0/);
assert.doesNotMatch(dry.stdout,/purchase-intake-local-check-token/);

const sensitive={...event,orderId:'ORDER-SECRET'};
const blocked=await runClient(['--dry-run'],sensitive,{withToken:false});
assert.equal(blocked.code,2);
assert.match(blocked.stderr,/VALIDATION_FAILED/);
assert.match(blocked.stderr,/주문·결제·배송·개인정보/);

const expected=validateFoodIntakeServiceProvenance(event);
let requests=0;
const server=createServer(async(req,res)=>{
 try{
  requests++;
  assert.equal(req.method,'POST');
  assert.equal(req.url,'/api/food-research/intake');
  assert.equal(req.headers.authorization,'Bearer '+token);
  assert.match(String(req.headers['content-type']||''),/^application\/json/);
  let raw='';for await(const chunk of req)raw+=chunk;
  assert.deepEqual(JSON.parse(raw),expected);
  const duplicate=requests>1;
  res.writeHead(duplicate?200:202,{'content-type':'application/json; charset=utf-8'});
  res.end(JSON.stringify({ok:true,id:expected.eventId,duplicate,status:'pending',writes:'inbox-only'}));
 }catch(error){
  res.writeHead(500,{'content-type':'application/json'});
  res.end(JSON.stringify({error:'fixture_assertion',message:String(error?.message||error)}));
 }
});
await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
const endpoint='http://127.0.0.1:'+server.address().port;
try{
 const first=await runClient(['--endpoint',endpoint],event);
 assert.equal(first.code,0,first.stderr);
 assert.match(first.stdout,/PURCHASE_INTAKE_CLIENT=PASS/);
 assert.match(first.stdout,/HTTP=202/);
 assert.match(first.stdout,/DUPLICATE=NO/);
 assert.match(first.stdout,/AUTO_RETRY=NO/);
 assert.equal(requests,1);

 const duplicate=await runClient(['--endpoint',endpoint],event);
 assert.equal(duplicate.code,0,duplicate.stderr);
 assert.match(duplicate.stdout,/HTTP=200/);
 assert.match(duplicate.stdout,/DUPLICATE=YES/);
 assert.equal(requests,2);

 const missingToken=await runClient(['--endpoint',endpoint],event,{withToken:false});
 assert.equal(missingToken.code,2);
 assert.match(missingToken.stderr,/PURCHASE_INTAKE_TOKEN_MISSING_OR_INVALID/);
 assert.equal(requests,2,'Missing token must fail before any network request');
}finally{
 await new Promise(resolve=>server.close(resolve));
}

console.log('PURCHASE_INTAKE_CLIENT_CHECK=PASS; VALIDATION=PASS; SENSITIVE_BLOCK=PASS; NEW=202; DUPLICATE=200; MISSING_TOKEN_NETWORK=0; AUTO_RETRY=NO');
