import assert from 'node:assert/strict';
import {createStockProductSwitchGuard} from '../public/nutrition-evidence-editor.js';

// The owner can edit sources/labels before switching products. The guard
// deliberately does not touch these objects at any stage.
const existing={energy:{value:120,amount:100,unit:'g',source:'직접 본 포장'},researchNote:'구형 제조 로트'};
const snapshot=structuredClone(existing);
const guard=createStockProductSwitchGuard('기존 제품');
assert.equal(guard.hasPending(),false);
assert.equal(guard.choose('기존 제품'),false);
assert.equal(guard.choose('다른 제품'),true);
assert.equal(guard.hasPending(),true);
assert.throws(()=>guard.assertReady(),/적용하거나 취소/);
assert.equal(guard.cancel(),'기존 제품');
guard.assertReady();
assert.deepEqual(existing,snapshot,'A cancelled switch must not mutate the source record');
assert.equal(guard.choose('다른 제품'),true);
assert.deepEqual(guard.confirm(),{changed:true,productKey:'다른 제품'});
guard.assertReady();
assert.equal(guard.hasPending(),false);
assert.deepEqual(guard.confirm(),{changed:false,productKey:'기존 제품'});
const unlink=createStockProductSwitchGuard('연결된 제품');
assert.equal(unlink.choose(''),true,'Unlinking must also require confirmation');
assert.throws(()=>unlink.assertReady(),/적용하거나 취소/);
assert.deepEqual(unlink.confirm(),{changed:true,productKey:null});
unlink.assertReady();
const initiallyUnlinked=createStockProductSwitchGuard();
assert.equal(initiallyUnlinked.choose(''),false);
assert.equal(initiallyUnlinked.choose('상품 A'),true);
assert.equal(initiallyUnlinked.choose(''),false,'Selecting the current identity clears pending changes');
initiallyUnlinked.assertReady();
assert.equal(guard.choose('다른 제품'),true);
assert.equal(guard.choose('기존 제품'),false);
assert.equal(guard.hasPending(),false);
assert.deepEqual(existing,snapshot);
console.log('Stock nutrition product link changes are explicitly confirmed, cancellable and fail-closed.');