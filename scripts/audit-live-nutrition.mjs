#!/usr/bin/env node
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {auditNutritionState,formatNutritionAudit,installLocalJsonFetch,readSnapshot} from './nutrition-audit-lib.mjs';
import {auditVisibleNutritionLibrary,formatVisibleNutritionCoverage} from './nutrition-catalog-coverage.mjs';

const [input='.ai-live/state.json',output='']=process.argv.slice(2);
const source=input.trim();
if(!source){console.error('Usage: node scripts/audit-live-nutrition.mjs <state.json> [report.txt]');process.exit(2);}
installLocalJsonFetch();
const snapshot=readSnapshot(source);
// Preserve the historical saved-edit-only audit exactly as it was so existing
// reports remain directly comparable. Append a disjoint, complete visible
// library audit, including previously uncounted direct user-created recipes.
const legacy=await auditNutritionState(snapshot);
const builtIns=JSON.parse(fs.readFileSync(new URL('../public/recipes.json',import.meta.url),'utf8'));
const promoted=JSON.parse(fs.readFileSync(new URL('../public/promoted-recipes.json',import.meta.url),'utf8')).recipes;
const complete=await auditVisibleNutritionLibrary(snapshot,builtIns,promoted);
// Show which exact calculation code produced this read-only result. The
// snapshot's own version/updatedAt remains the provenance of the D1 data.
let codeRevision='unavailable';
try{
 const rev=execFileSync('git',['rev-parse','HEAD'],{
  cwd:fileURLToPath(new URL('../',import.meta.url)),
  encoding:'utf8',stdio:['ignore','pipe','ignore']
 }).trim();
 if(/^[0-9a-f]{40}$/i.test(rev))codeRevision=rev;
}catch{/* A non-Git local archive can still produce a labeled report. */}
const report=formatNutritionAudit(legacy)+'\n'+
 'CALCULATION CODE REVISION: '+codeRevision+'\n\n'+formatVisibleNutritionCoverage(complete);
if(output){fs.writeFileSync(output,report,'utf8');console.log(`Wrote ${output}`);}else process.stdout.write(report);
