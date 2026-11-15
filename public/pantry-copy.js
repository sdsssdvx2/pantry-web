import { getStock, initialPantry } from './data.js?v=20260919-6';
import { copyText } from './clipboard.js';
import {stockPriorityDate,pantryDateValue,priorityBasis} from './pantry-priority.js';

const STORAGE = 'my-little-kitchen-pantry-v1';
const GROUPS = ['냉동실', '냉장고', '실온'];

function currentState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if (parsed && Array.isArray(parsed.items)) return parsed;
  } catch {}
  return { items: [...initialPantry], stock: {} };
}

function broadLocation(locations = []) {
  if (locations.some(value => String(value).includes('냉동실'))) return '냉동실';
  if (locations.some(value => String(value).includes('냉장고'))) return '냉장고';
  if (locations.some(value => String(value).startsWith('실온'))) return '실온';
  return '위치 미상';
}

function noteSentence(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return /[.!?。]$/.test(text) ? text : text + '.';
}

function ingredientText(name, stock) {
  const addedAt=typeof stock.addedAt==='string'&&Number.isFinite(Date.parse(stock.addedAt))?pantryDateValue(stock.addedAt):'';
  const automatic=stockPriorityDate(name,stock);
  const details = [...(!stock.priorityDate&&automatic?[`${automatic.quality?(automatic.plan?.area==='frozen'?'냉동 품질 목표일':'개봉 품질 목표일'):'자동 소비 우선일'} ${automatic.value} · ${priorityBasis(automatic)}`]:[]), ...(addedAt ? [`재고 추가일 ${addedAt}`] : []), ...(stock.priorityDate ? [`소비 우선일 ${stock.priorityDate}`] : []), ...(stock.priorityStartDate ? [`보관 기준일 ${stock.priorityStartDate}`] : []), ...(stock.notes || [])].map(noteSentence).filter(Boolean).join(' ');
  return details ? name + '(' + details + ')' : name;
}

export function pantryCopyText() {
  const state = currentState();
  const stockOverrides = state.stock && typeof state.stock === 'object' ? state.stock : {};
  const grouped = new Map([...GROUPS, '위치 미상'].map(name => [name, []]));
  for (const name of state.items) {
    const stock = getStock(name, stockOverrides);
    grouped.get(broadLocation(stock.locations))?.push(ingredientText(name, stock));
  }
  const lines = GROUPS.map(group => group + ': ' + grouped.get(group).join(', '));
  if (grouped.get('위치 미상').length) lines.push('위치 미상: ' + grouped.get('위치 미상').join(', '));
  return lines.join('\n');
}

const button = document.getElementById('copy-pantry');
if (button) {
  let resetTimer = null;
  button.addEventListener('click', async () => {
    clearTimeout(resetTimer);
    button.disabled = true;
    button.textContent = '복사 중…';
    let ok = false;
    try {
      ok = await copyText(pantryCopyText());
    } catch {
      ok = false;
    }
    button.disabled = false;
    button.textContent = ok ? '✓ 복사 완료' : '복사 실패';
    resetTimer = setTimeout(() => { button.textContent = '전체 복사'; }, ok ? 1400 : 2200);
  });
}
