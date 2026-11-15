import {NUTRIENTS,validateNutrition} from './nutrition.js';
import {readNutritionEvidence,sameNutritionEvidence,fillNutritionEvidence} from './nutrition-evidence-editor.js';
import {isUnknownKfindIdentity,hasKfindPackAmount} from './kfind-identity.js';
// Explicit, local-only promotion of one K-FIND candidate to UNSAVED owner evidence.
// A name, code or search ranking alone never establishes a matching product.
const kfindKey = value => String(value ?? '').trim().normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, '');
const keys = ['name', 'manufacturer', 'importer', 'pack'];
const nutrients = ['energy','sodium','carbs','sugars','fat','saturatedFat','protein','fiber','cholesterol','transFat'];
export const K_FIND_SOURCE_URL = 'https://various.foodsafetykorea.go.kr/nutrient/general/food/firstList.do';
export function prepareKfindEvidence(candidate, rows, observed) {
 if (!candidate || !Array.isArray(rows) || !rows.includes(candidate) || !observed || typeof observed !== 'object')
  throw Error('현재 불러온 K-FIND 후보를 다시 선택해 주세요.');
 for (const key of keys) {
  const actual = String(observed[key] ?? '').trim(), expected = String(candidate[key] ?? '').trim();
  if (key !== 'importer' && (isUnknownKfindIdentity(actual)||isUnknownKfindIdentity(expected)||
     (key==='pack'&&(!hasKfindPackAmount(actual)||!hasKfindPackAmount(expected)))))
   throw Error('보유 제품의 제품명·제조사·확인 가능한 용량을 모두 확인해 주세요.');
  if (kfindKey(actual) !== kfindKey(expected)) throw Error('라벨의 ' + ({name:'제품명',manufacturer:'제조사',importer:'수입업체',pack:'용량'}[key]) + '가 후보와 일치하지 않아요. 수치 가져오기를 중단했어요.');
 }
 if (['code','name','manufacturer'].some(key=>isUnknownKfindIdentity(candidate[key]))||
     !hasKfindPackAmount(candidate.pack))
  throw Error('공식 자료에서 제품 식별정보 또는 실제 포장 용량이 확인되지 않아요.');
 const sameIdentity = rows.filter(row => keys.every(key => kfindKey(row[key]) === kfindKey(candidate[key])) && kfindKey(row.basis) === kfindKey(candidate.basis));
 if (sameIdentity.length !== 1) throw Error('현재 엑셀에 같은 제품명·업체·용량·기준량의 후보가 여러 건 있어요. 식품코드나 영양값이 같아도 자동으로 선택할 수 없어요.');
 const basis = String(candidate.basis ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
 if (!['100g', '100ml'].includes(basis)) throw Error('100g/100mL 기준이 아닌 후보는 수치 가져오기를 지원하지 않아요.');
 const unit = basis === '100ml' ? 'ml' : 'g';
 const n = candidate.nutrition || {};
 if (!Number.isFinite(n.energy) || !Number.isFinite(n.sodium)) throw Error('열량 또는 나트륨 근거가 없는 후보는 수치 가져오기를 지원하지 않아요.');
 const kfindEvidence = {
  dataset: 'K-FIND', code: String(candidate.code), name: String(candidate.name),
  manufacturer: String(candidate.manufacturer), importer: String(candidate.importer || ''),
  pack: String(candidate.pack), reportNo: String(candidate.reportNo || ''),
  basis, dataDate: String(candidate.date || '')
 };
 const note = [
  '보유 제품 라벨의 제품명·제조사·수입업체·용량을 소유자가 대조',
  'K-FIND 식품코드 ' + kfindEvidence.code,
  kfindEvidence.reportNo ? 'K-FIND 신고번호 ' + kfindEvidence.reportNo + ' (라벨 신고번호 동일성 미확인)' : '신고번호 미제공',
  '제조사 ' + kfindEvidence.manufacturer,
  '수입업체 ' + (kfindEvidence.importer || '자료 없음'),
  '용량 ' + kfindEvidence.pack,
  '영양 기준 ' + basis,
  kfindEvidence.dataDate ? '자료 기준일 ' + kfindEvidence.dataDate : ''
 ].filter(Boolean).join(' · ');
 if (note.length > 1000) throw Error('출처 메모가 너무 길어요. 수동 검토가 필요해요.');
 const metrics = {};
 for (const key of nutrients) {
  const value = n[key];
  if (value === null || value === undefined) continue;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw Error('영양성분 수치가 잘못됐어요.');
  metrics[key] = {value, amount:100, unit, kind:'user', source:'식약처 K-FIND · 소유자 수동 대조', url:K_FIND_SOURCE_URL, note};
 }
 return {metrics, kfindEvidence};
}

export function stageKfindEvidenceIntoStockForm(target,proposal,{saved={},current={},resetMetrics=new Set(),productSwitch,linkedProductKey=null}={}){
 if(!target?.querySelectorAll||!proposal?.metrics||!proposal?.kfindEvidence)
  throw Error('영양정보 편집창과 K-FIND 후보를 다시 확인해 주세요.');
 productSwitch?.assertReady();
 // A linked catalog product may supply any nutrients absent from K-FIND.
 // Mixing two different product identities in one recipe would be unsafe.
 // The existing product-switch confirmation unlinks the catalog explicitly.
 if(linkedProductKey)
  throw Error('현재 다른 영양 제품이 연결되어 있어요. 먼저 연결 안 함 · 직접 입력을 선택하고 기존 제품 연결 해제를 명시적으로 승인해 주세요.');
 if(Object.keys(NUTRIENTS).some(key=>Object.hasOwn(saved,key))||saved.kfindEvidence)
  throw Error('현재 제품에 저장된 직접 입력 영양값이나 K-FIND 근거가 있어요. 기존 값을 보호하기 위해 가져오기를 중단했어요.');
 // Owner-supplied label data can also live in historical pantry notes. Such
 // records resolve as kind:user even when stockOverrides has no nutrient entry.
 if(Object.keys(NUTRIENTS).some(key=>current[key]?.kind==='user'))
  throw Error('제품 메모나 라벨에서 직접 기록된 영양값이 있어요. K-FIND 후보와 섞거나 덮어쓰지 않도록 차단했어요.');
 if(resetMetrics.size)throw Error('자동값 복원 대기 중인 항목이 있어요. 먼저 이 편집을 정리해 주세요.');
 // Validate all proposed numbers and provenance before the first DOM mutation.
 validateNutrition({...proposal.metrics,kfindEvidence:proposal.kfindEvidence});
 const allRows=[...target.querySelectorAll('[data-nutrient]')],mapped=new Map();
 for(const row of allRows){
  const key=row.dataset?.nutrient;
  if(!Object.hasOwn(NUTRIENTS,key)||mapped.has(key))throw Error('영양 입력창의 항목이 중복되거나 잘못됐어요.');
  mapped.set(key,row);
  if(!sameNutritionEvidence(readNutritionEvidence(row,key,current[key]),current[key]))
   throw Error('이미 수정 중인 영양값 또는 근거가 있어요. 기존 편집을 저장하거나 다시 연 뒤 후보를 검토해 주세요.');
 }
 for(const key of Object.keys(proposal.metrics))if(!mapped.has(key))
  throw Error('입력할 영양성분의 편집창이 누락됐어요.');
 // K-FIND does not establish unknown nutrients. Clear any inherited
 // generic/estimated values from this *draft* to avoid mixed product profiles.
 // Every row was preflighted first, so the mutation below is all-or-nothing.
 for(const key of Object.keys(NUTRIENTS)){
  if(Object.hasOwn(proposal.metrics,key))fillNutritionEvidence(mapped.get(key),proposal.metrics[key]);
  else if(current[key])fillNutritionEvidence(mapped.get(key),null);
 }
 return proposal;
}

export function preserveKfindSourceAfterOwnerEdit(saved,next){
 if(!saved?.kfindEvidence)return next;
 const same=Object.keys(NUTRIENTS).every(key=>
  sameNutritionEvidence(Object.hasOwn(next,key)?next[key]:undefined,Object.hasOwn(saved,key)?saved[key]:undefined));
 if(same)return {...next,kfindEvidence:saved.kfindEvidence};
 // A numeric correction must not inherit the old official-dataset attribution.
 // Owner can explicitly change its source to a label or corrected reference.
 for(const key of Object.keys(NUTRIENTS)){
  const prior=saved[key],updated=next[key];
  if(prior?.source==='식약처 K-FIND · 소유자 수동 대조'&&updated&&
     (prior.value!==updated.value||prior.amount!==updated.amount||prior.unit!==updated.unit)){
    // Old dataset URL, food code, report ID and note must not follow a
    // corrected number merely because its source-title input was renamed.
    const note=String(updated.note||''),url=String(updated.url||'');
    const staleIdentifier=/K-FIND/i.test(note)||
      [saved.kfindEvidence.code,saved.kfindEvidence.reportNo].filter(Boolean).some(id=>note.includes(id));
    const staleUrl=Boolean(url&&(/^https:\/\/various\.foodsafetykorea\.go\.kr\/nutrient\/general\/food\/firstList\.do/i.test(url)||url===prior.url));
    if(!updated.source||updated.source===prior.source||!note||note===prior.note||staleIdentifier||staleUrl)
     throw Error('K-FIND 수치를 정정하려면 새 출처 이름·검증 메모·공식 DB와 구별되는 링크를 확인해 주세요. 기존 식품코드·신고번호·K-FIND 링크를 새 숫자에 이어 붙일 수 없어요.');
   }
 }
 return next; // Structured K-FIND identity invalidated by a reviewed edit.
}
