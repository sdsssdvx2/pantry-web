import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const token='purchase-intake-worker-token-1234567890';
const baseEnv={OWNER_PASSWORD:'owner-set',PURCHASE_INTAKE_TOKEN:token};

const call=(path,authorization='',env=baseEnv)=>worker.fetch(new Request('https://kitchen.example'+path,{
 method:'POST',
 headers:{'content-type':'application/json',...(authorization?{authorization}:{})},
 body:'{}',
}),env);

assert.equal((await call('/api/food-research/intake-preview')).status,403);
assert.equal((await call('/api/food-research/intake-preview','Bearer wrong-token-that-is-long-enough-123456')).status,403);
assert.equal((await call('/api/food-research/intake-preview','Bearer '+token,{...baseEnv,PURCHASE_INTAKE_TOKEN:'short'})).status,403);

const admitted=await call('/api/food-research/intake-preview','Bearer '+token);
assert.equal(admitted.status,400);
assert.equal((await admitted.json()).error,'invalid_food_intake');

assert.equal((await call('/api/food-research','Bearer '+token)).status,403);
assert.equal((await call('/api/food-research/ai','Bearer '+token)).status,403);
assert.equal((await call('/api/shares','Bearer '+token)).status,403);

console.log('PURCHASE_INTAKE_SERVICE_AUTH=PASS; SCOPE=INTAKE_PREVIEW_ONLY; OWNER_APIS=UNCHANGED');
