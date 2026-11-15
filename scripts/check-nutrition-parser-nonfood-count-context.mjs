import assert from 'node:assert/strict';
import {parseRecipeAmounts} from '../public/nutrition.js';

const storage=parseRecipeAmounts('4. 밀폐용기에 담고 바로 냉동, 3개월 이내 소비 권장, 최대 6개월');
assert.equal(storage.rows.length,0,'개월 보관기한을 개 단위 식재료로 읽으면 안 됩니다.');

const height=parseRecipeAmounts('4. 넓은 오븐 그릇에 평평하게 담고 모짜렐라 치즈 80~100g 올리고, 높이는 최대한 눌러서 콘 1개 높이로 맞추면 됨. 지금 기준으로 동그란 큰 오븐 그릇 2개로 나눠 담았음.');
assert.equal(height.rows.some(row=>row.name.includes('높이는 최대한 눌러서 콘')),false,'1개 높이 뒤의 용기 개수까지 식재료로 이어 읽으면 안 됩니다.');
assert.equal(height.rows.some(row=>row.name.includes('동그란 큰 오븐 그릇')),false,'오븐 그릇 2개라는 용기 수량은 식재료가 아닙니다.');
assert.equal(height.rows.some(row=>row.name.includes('모짜렐라 치즈')&&row.amount===80&&row.maxAmount===100&&row.unit==='g'),true,'실제 치즈 중량은 유지해야 합니다.');

const foodCount=parseRecipeAmounts('돈까스 2개 조리');
assert.equal(foodCount.rows.some(row=>row.name==='돈까스'&&row.amount===2&&row.maxAmount===2&&row.unit==='piece'),true,'일반 식재료 개수는 계속 파싱해야 합니다.');

const countedWithSuffix=parseRecipeAmounts('달걀 3개씩 준비');
assert.equal(countedWithSuffix.rows.some(row=>row.name==='달걀'&&row.amount===3&&row.unit==='piece'),true,'개 뒤의 일반 조사/부사는 허용해야 합니다.');

console.log('Non-food count contexts are excluded without weakening real ingredient counts.');
