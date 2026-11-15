import assert from 'node:assert/strict';
import {NUTRIENTS} from '../public/nutrition.js';
import {nutritionSourceFields,nutritionMetricRows,readNutritionEvidence,sameNutritionEvidence,fillNutritionEvidence,readNutritionProofDraft} from '../public/nutrition-evidence-editor.js';

// No browser/network/production state needed to verify sanitization,
// explicit unknown vs zero, provenance editing and automatic reset.
const testMetric={value:120,amount:40,unit:'g',kind:'product',source:'포장 표시',url:'https://example.org/pack',note:'건조 40g'};
const safe=nutritionSourceFields({...testMetric,source:'<img src=x onerror=alert(1)>',note:'<script>x</script>'});
assert(!safe.includes('<img'));
assert(!safe.includes('<script>'));
assert(safe.includes('&lt;img'));
assert(safe.includes('&lt;script&gt;'));
const html=nutritionMetricRows({energy:testMetric});
assert(Object.keys(NUTRIENTS).every(k=>html.includes('data-nutrient="'+k+'"')));
assert(html.includes('data-reset-row-metric'));
assert(html.includes('data-evidence-url'));
const malicious=nutritionMetricRows({energy:{value:'100" autofocus onfocus="alert(1)',amount:'50" data-unsafe="yes'}});
assert(malicious.includes('value="100&quot; autofocus'));
assert(malicious.includes('value="50&quot; data-unsafe'));
assert(!malicious.includes('value="100" autofocus'));
assert(!malicious.includes('value="50" data-unsafe'));
const fields={
 '[data-value]':{value:'130'},
 '[data-amount]':{value:'40'},
 '[data-unit]':{value:'g'},
 '[data-evidence-source]':{value:'직접 확인한 제품 라벨'},
 '[data-evidence-url]':{value:'https://example.org/new'},
 '[data-evidence-note]':{value:'내 포장 40g 영양정보'}
};
const row={querySelector:selector=>fields[selector]||null};
const changed=readNutritionEvidence(row,'energy',testMetric);
assert.equal(changed.value,130);
// Browser <input type=number> may have value='' and validity.badInput=true
// while the owner is still typing. It is NOT a deliberate clear-to-unknown.
fields['[data-value]'].value='';
fields['[data-value]'].validity={badInput:true};
assert.throws(()=>readNutritionEvidence(row,'energy',testMetric),/숫자 입력/,
 'Bad number input must not erase a previously verified energy value');
fields['[data-value]'].value='130';
delete fields['[data-value]'].validity;
fields['[data-amount]'].value='';
fields['[data-amount]'].validity={badInput:true};
assert.throws(()=>readNutritionEvidence(row,'energy',testMetric),/숫자 입력/,
 'Incomplete label basis is invalid, not a silent deletion');
fields['[data-amount]'].value='40';
delete fields['[data-amount]'].validity;
assert.equal(changed.value,130);
assert.equal(changed.kind,'user');
assert.equal(changed.url,'https://example.org/new');
assert.equal(changed.note,'내 포장 40g 영양정보');
assert.equal(sameNutritionEvidence(testMetric,changed),false);
fields['[data-value]'].value='120';
fields['[data-evidence-source]'].value='포장 표시';
fields['[data-evidence-url]'].value='https://example.org/pack';
fields['[data-evidence-note]'].value='건조 40g';
const unchanged=readNutritionEvidence(row,'energy',testMetric);
assert.equal(sameNutritionEvidence(testMetric,unchanged),true);
fields['[data-value]'].value='';
fields['[data-evidence-url]'].value='http://unsafe.invalid/while-clearing';
assert.throws(()=>readNutritionEvidence(row,'energy',testMetric),/https/,
 'Blanking a numeric value must not hide an invalid source URL');
fields['[data-evidence-url]'].value='https://example.org/pack';
assert.equal(readNutritionEvidence(row,'energy',testMetric),null);
fields['[data-value]'].value='0';
const zero=readNutritionEvidence(row,'energy',testMetric);
assert.equal(zero.value,0,'verified zero and empty are not equivalent');
fields['[data-value]'].value='120';
fields['[data-evidence-url]'].value='http://example.org/not-secure';
assert.throws(()=>readNutritionEvidence(row,'energy',testMetric),/https/);
fields['[data-evidence-url]'].value='https://example.org/pack';
fillNutritionEvidence(row,testMetric);
assert.equal(fields['[data-value]'].value,120);
assert.equal(fields['[data-amount]'].value,40);
assert.equal(fields['[data-evidence-note]'].value,'건조 40g');
// A legacy host without provenance inputs must not erase historical source.
const onlyNumeric={querySelector:selector=>['[data-value]','[data-amount]','[data-unit]'].includes(selector)?fields[selector]:null};
assert.equal(readNutritionEvidence(onlyNumeric,'energy',testMetric).source,'포장 표시');
const researchOnlyEvidence={researchNote:'확인할 포장 없음',researchUrl:'https://example.org/product'};
assert.equal((await import('../public/nutrition.js')).validateNutrition(researchOnlyEvidence).researchNote,'확인할 포장 없음');
// Validate every visible field: a valid edit must not suppress another
// nutrient's invalid URL, and all good changes must be committed together.
const energyRow={dataset:{nutrient:'energy'},querySelector:s=>fields[s]||null};
const sodiumFields={
 '[data-value]':{value:'45'},'[data-amount]':{value:'100'},'[data-unit]':{value:'g'},
 '[data-evidence-source]':{value:'소금 표시'},
 '[data-evidence-url]':{value:'https://example.org/sodium'},
 '[data-evidence-note]':{value:'정량'}
};
const sodiumRow={dataset:{nutrient:'sodium'},querySelector:s=>sodiumFields[s]||null};
const proof={querySelectorAll:s=>s==='[data-nutrient]'?[energyRow,sodiumRow]:[],querySelector:()=>null};
const sodiumBaseline={value:15,amount:100,unit:'g',kind:'product',source:'원래 소금 표시'};
fields['[data-value]'].value='125';
fields['[data-evidence-url]'].value='http://unsafe.invalid';
assert.throws(()=>readNutritionProofDraft(proof,{energy:testMetric,sodium:sodiumBaseline},{}),/https/,
 'Editing sodium cannot hide an invalid energy source');
fields['[data-evidence-url]'].value='https://example.org/fixed';
const consolidated=readNutritionProofDraft(proof,{energy:testMetric,sodium:sodiumBaseline},{});
assert.equal(consolidated.energy.value,125);
assert.equal(consolidated.energy.url,'https://example.org/fixed');
assert.equal(consolidated.sodium.value,45);
assert.equal(consolidated.sodium.source,'소금 표시');
assert(!Object.hasOwn(consolidated,'protein'),'Untouched nutrients stay automatic');
fields['[data-value]'].value='120';
fields['[data-evidence-url]'].value='https://example.org/pack';
fields['[data-evidence-source]'].value='포장 표시';
fields['[data-evidence-note]'].value='건조 40g';
sodiumFields['[data-value]'].value='';
const cleared=readNutritionProofDraft(proof,{energy:testMetric,sodium:sodiumBaseline},{});
assert(!Object.hasOwn(cleared,'energy'),'Unchanged automatic values stay automatic');
assert.equal(cleared.sodium,null,'Clearing a known nutrient must record unknown');
sodiumFields['[data-evidence-url]'].value='http://unsafe.invalid/blank-value';
assert.throws(()=>readNutritionProofDraft(proof,{energy:testMetric,sodium:sodiumBaseline},{}),/https/,
 'An invalid URL is not accepted merely because its numeric value is blank');
const oldSource='실측: 1mL = 1.01g';
const conversionFields={
 '[data-proof-density]':{value:'1.04'},
 '[data-proof-piece]':{value:''},
 '[data-proof-conversion-note]':{value:oldSource}
};
const conversionProof={querySelectorAll:()=>[],querySelector:s=>conversionFields[s]||null};
const conversionProfile={gramsPerMl:1.01,conversionNote:oldSource};
const previous={gramsPerMl:1.01,conversionNote:oldSource};
assert.throws(()=>readNutritionProofDraft(conversionProof,conversionProfile,previous),/환산 근거/,
 'A new density may not inherit its old source note');
assert.throws(()=>readNutritionProofDraft(conversionProof,conversionProfile,{}),/환산 근거/,
 'An auto-catalog conversion source needs a new label when overridden');
conversionFields['[data-proof-conversion-note]'].value='';
assert.throws(()=>readNutritionProofDraft(conversionProof,conversionProfile,{}),/환산 근거/,
 'An empty source cannot silently restore an obsolete auto-catalog note');
conversionFields['[data-proof-conversion-note]'].value='새 실측: 1mL = 1.04g';
const corrected=readNutritionProofDraft(conversionProof,conversionProfile,previous);
assert.equal(corrected.gramsPerMl,1.04);
assert.equal(corrected.conversionNote,'새 실측: 1mL = 1.04g');
conversionFields['[data-proof-density]'].value='1.01';
conversionFields['[data-proof-conversion-note]'].value=oldSource;
assert.equal(readNutritionProofDraft(conversionProof,conversionProfile,previous).conversionNote,oldSource);
conversionFields['[data-proof-piece]'].value='21';
assert.throws(()=>readNutritionProofDraft(conversionProof,conversionProfile,{}),/환산 근거/,
 'A changed per-piece weight also needs a revised source');
console.log('Nutrient evidence: source identity and recipe conversion drift fail-closed PASS.');
