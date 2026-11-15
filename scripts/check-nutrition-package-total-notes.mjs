import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(fileURLToPath(url),'utf8'))});
const {nutritionFromNotes}=await import('../public/nutrition-resolver.js');

const dasidaNote='숙성한우 11%·한우지방·한우사골농축분말·MSG. 나트륨 18,300mg/100g·당류 약 8.3g/100g. · 컬리 제품 뒷면 영양표 확인: 총 60g(5g×12개)당 열량 130kcal, 나트륨 10,980mg, 탄수화물 15g, 당류 5g, 지방 3.8g, 포화지방 1.5g, 단백질 9g, 콜레스테롤 5mg, 트랜스지방 0g. 식이섬유는 표시 없음.';
const parsed=nutritionFromNotes([dasidaNote]);
const expected={
 energy:[130,60,'g'],
 sodium:[10980,60,'g'],
 carbs:[15,60,'g'],
 sugars:[5,60,'g'],
 fat:[3.8,60,'g'],
 saturatedFat:[1.5,60,'g'],
 protein:[9,60,'g'],
 cholesterol:[5,60,'g'],
 transFat:[0,60,'g']
};
for(const [key,[value,amount,unit]] of Object.entries(expected)){
 assert.ok(parsed[key],`${key} should be parsed from the direct package label`);
 assert.equal(parsed[key].value,value,`${key} should keep the package-label value`);
 assert.equal(parsed[key].amount,amount,`${key} should use the total 60g package basis`);
 assert.equal(parsed[key].unit,unit);
 assert.equal(parsed[key].kind,'user');
}
assert.equal(parsed.fiber,undefined,'A nutrient explicitly noted as not displayed must remain absent');

const simple=nutritionFromNotes(['나트륨 500mg/100g · 당류 3g/100g']);
assert.deepEqual([simple.sodium.value,simple.sodium.amount,simple.sodium.unit],[500,100,'g'],'Existing explicit /100g parsing must remain unchanged');
assert.deepEqual([simple.sugars.value,simple.sugars.amount,simple.sugars.unit],[3,100,'g'],'Existing explicit /100g parsing must remain unchanged');

const spaced=nutritionFromNotes(['총 250 mL (125mL×2개) 당 열량 120kcal, 나트륨 40mg, 당류 20g']);
assert.deepEqual([spaced.energy.value,spaced.energy.amount,spaced.energy.unit],[120,250,'ml'],'Spaced total-package notation should also be recognized');
assert.deepEqual([spaced.sodium.value,spaced.sodium.amount,spaced.sodium.unit],[40,250,'ml']);
assert.deepEqual([spaced.sugars.value,spaced.sugars.amount,spaced.sugars.unit],[20,250,'ml']);

console.log('Package-total nutrition note checks passed.');
