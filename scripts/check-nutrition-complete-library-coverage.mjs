import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
 buildVisibleNutritionLibrary,auditVisibleNutritionLibrary,formatVisibleNutritionCoverage
} from './nutrition-catalog-coverage.mjs';
import {auditNutritionState,installLocalJsonFetch} from './nutrition-audit-lib.mjs';
import {requireKitchenDataset} from './sample-data.mjs';
requireKitchenDataset('check-nutrition-complete-library-coverage.mjs');
installLocalJsonFetch();

const recipe=(id,name,steps)=>({id,name,required:['설탕'],steps});
const original=(key,grams)=>({key,label:'원본 '+key,required:['설탕'],original:'설탕 '+grams+'g'});
const originals=[
 {id:'source-a',name:'여러 배합',required:['설탕'],variants:[
  original('a',2),original('b',3),original('c',4)
 ]},
 {id:'source-hidden',name:'숨긴 레시피',required:['설탕'],variants:[original('h',5)]}
];
const promoted=[
 {id:'source-promoted',name:'승격 레시피',required:['설탕'],variants:[original('p',6)]},
 {id:'source-a',name:'중복 승격본',required:['설탕'],variants:[original('duplicate',99)]}
];
const snapshot={version:22,updatedAt:'2026-11-04T00:00:00Z',state:{
 items:['설탕'],stock:{},history:[],
 recipes:[recipe('user-direct','직접 만든 레시피',['설탕 1g'])],
 custom:[recipe('user-legacy','기존 형식 사용자 레시피',['설탕 8g'])],
 edits:[
  {sourceId:'source-a',variantKey:'a',label:'수정 배합',recipe:recipe('user-edit','실제 수정본',['설탕 7g'])},
  {sourceId:'source-a',variantKey:'c',label:'숨긴 배합',recipe:recipe('user-hidden-edit','숨긴 수정본',['설탕 45g'])}
 ],
 hidden:['source-hidden'],
 hiddenVariants:['source-a/c'],
 trashPurged:[],trashPurgedVariants:[]
}};
const before=structuredClone(snapshot),oldSource=structuredClone(originals),oldPromoted=structuredClone(promoted);
const {groups,diagnostics}=buildVisibleNutritionLibrary(snapshot,originals,promoted);
assert.equal(diagnostics.builtInMenus,3,'The promoted duplicate ID must not be double-counted');
assert.equal(diagnostics.sourceVariants,5);
assert.equal(diagnostics.visibleSourceVariants,3);
assert.equal(diagnostics.hiddenMenus,1);
assert.equal(diagnostics.hiddenVersions,1);
assert.equal(diagnostics.orphanEdits,1,'A hidden saved edit must never count as a visible recipe');
assert.equal(groups.user.length,2,'Direct user recipes and compatible legacy custom recipes are BOTH included');
assert.equal(groups.edited.length,1);
assert.equal(groups.unedited.length,2);
assert.equal(groups.edited[0].name,'실제 수정본');
assert.deepEqual(groups.edited[0].steps,['설탕 7g'],'The owner saved edit replaces the source version');
assert.deepEqual(groups.unedited.map(x=>x.steps[0]).sort(),['설탕 3g','설탕 6g']);
assert(!JSON.stringify(groups).includes('설탕 2g'),'Saved edit and original must not both be included');
assert(!JSON.stringify(groups).includes('설탕 45g'),'A hidden version must never be included');
assert(!JSON.stringify(groups).includes('99g'),'A duplicate promoted source must never be included');

const results=await auditVisibleNutritionLibrary(snapshot,originals,promoted);
assert.equal(results.summary.audited,5,'The three disjoint groups must cover the entire visible library');
assert.equal(results.summary.nutrientComplete,5,'Known generic sugar kcal/sodium should be present for all five weighed recipes');
assert.equal(results.summary.calculationReady,5);
assert.equal(results.groups.user.audited,2);
assert.equal(results.groups.edited.audited,1);
assert.equal(results.groups.unedited.audited,2);
assert.equal(results.summary.audited,
 results.groups.user.audited+results.groups.edited.audited+results.groups.unedited.audited);
const report=formatVisibleNutritionCoverage(results);
assert.match(report,/COMPLETE VISIBLE RECIPE LIBRARY/);
assert.match(report,/VISIBLE LIBRARY: 5 versions audited/);
assert.match(report,/DIRECT USER-CREATED RECIPES/);
assert.match(report,/VISIBLE BUILT-IN VERSIONS WITH SAVED EDITS/);
assert.match(report,/VISIBLE BUILT-IN VERSIONS WITHOUT SAVED EDITS/);
assert.match(report,/never double-count them/);
assert.deepEqual(snapshot,before,'Neither audit nor catalog reconstruction is allowed to mutate the actual live state');
assert.deepEqual(originals,oldSource);
assert.deepEqual(promoted,oldPromoted);

// Preserve historical saved-edits-only results for year-over-year comparisons.
// The additional 45 direct user recipes must not silently rewrite that metric.
const legacy=await auditNutritionState(snapshot);
assert.equal(legacy.recipes.audited,3,'Legacy scope remains saved edits (2) plus only the legacy state.custom (1), not direct state.recipes');
assert.equal(results.groups.user.audited,2,'Direct state.recipes must remain in the new separate group');

// Test the real repository source catalog without the owner's data or network.
const currentBuiltIns=JSON.parse(fs.readFileSync(new URL('../public/recipes.json',import.meta.url),'utf8'));
const currentPromoted=JSON.parse(fs.readFileSync(new URL('../public/promoted-recipes.json',import.meta.url),'utf8')).recipes;
const sourceOnly=buildVisibleNutritionLibrary({state:{recipes:[],edits:[],hidden:[],hiddenVariants:[]}},currentBuiltIns,currentPromoted);
const uniqueRawSources=[...new Map([...currentPromoted,...currentBuiltIns].map(row=>[row.id,row])).values()];
const rawVariantCount=uniqueRawSources.reduce((sum,row)=>sum+(row.variants?.length||1),0);
assert.equal(sourceOnly.diagnostics.builtInMenus,uniqueRawSources.length,'All base and promoted source groups must appear once, including future catalog updates');
assert(sourceOnly.diagnostics.sourceVariants>=rawVariantCount,'Source normalization may add variants but must not silently drop source records');
assert.equal(sourceOnly.diagnostics.sourceVariants,sourceOnly.diagnostics.visibleSourceVariants+sourceOnly.diagnostics.hiddenMenuVersions+sourceOnly.diagnostics.hiddenVersions,'Visible plus internally/individually hidden versions must reconcile to every source variant');
assert.equal(sourceOnly.groups.edited.length,0);
assert.equal(sourceOnly.groups.user.length,0);
assert.equal(sourceOnly.groups.unedited.length,sourceOnly.diagnostics.visibleSourceVariants);
// Run the actual CLI in a fresh process with synthetic owner state. This
// catches module/file integration errors that isolated library tests cannot.
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'mlk-nutrition-coverage-'));
try{
 const input=path.join(scratch,'state.json'),output=path.join(scratch,'report.txt');
 fs.writeFileSync(input,JSON.stringify(snapshot),'utf8');
 const child=spawnSync(process.execPath,['scripts/audit-live-nutrition.mjs',input,output],{
  cwd:process.cwd(),encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024
 });
 assert.equal(child.status,0,'Actual audit CLI must succeed without network, Windows runner or D1 writes: '+(child.stderr||child.error||child.stdout));
 const generated=fs.readFileSync(output,'utf8');
 assert.match(generated,/MY LITTLE KITCHEN — LIVE NUTRITION GAP AUDIT/);
 assert.match(generated,/USER\/EDITED RECIPES: \d+\/3/,'Legacy source-edits/legacy-custom report must still be present');
 assert.match(generated,/COMPLETE VISIBLE RECIPE LIBRARY/,'The new report must be appended to the real CLI output');
 assert.match(generated,/VISIBLE LIBRARY: \d+ versions audited/);
 assert.match(generated,/DIRECT USER-CREATED RECIPES/);
 assert.match(generated,/VISIBLE BUILT-IN VERSIONS WITHOUT SAVED EDITS/);
 assert.match(generated,/Coverage limits:/);
 assert.deepEqual(JSON.parse(fs.readFileSync(input,'utf8')),snapshot,'The actual CLI must not modify its input state');
 assert.deepEqual(fs.readdirSync(scratch).sort(),['report.txt','state.json'],'The audit writes only its explicitly requested report');
}finally{fs.rmSync(scratch,{recursive:true,force:true});}
console.log('Full-library nutrition coverage partitions direct recipes, saved edits and unedited visible variants without source duplication or state mutations.');
