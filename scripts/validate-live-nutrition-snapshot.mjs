#!/usr/bin/env node
// Read-only validation of the two live-share responses before they can replace
// a previously verified snapshot. Never print contents, paths or credentials.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const MAX_STATE_BYTES=20*1024*1024;
const MAX_INSPECT_BYTES=10*1024*1024;
const validTime=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(s)&&Number.isFinite(Date.parse(s));
const requireState=(value,label)=>{
 if(!value||typeof value!=='object'||Array.isArray(value)||
   !Number.isSafeInteger(value.version)||value.version<0||
   !validTime(value.updatedAt)||!value.state||typeof value.state!=='object'||
   !['items','recipes','edits'].every(key=>Array.isArray(value.state[key])))
  throw Error(label+' structure/version invalid');
 return value;
};
const readSmall=(file,max,label)=>{
 const info=fs.statSync(file);
 if(!info.isFile()||info.size===0||info.size>max)throw Error(label+' size invalid');
 return fs.readFileSync(file,'utf8');
};
export function validateIncomingSnapshot(incoming,previous,inspect){
 const next=requireState(incoming,'Incoming state');
 const prev=requireState(previous,'Previous state');
 if(next.version<prev.version)throw Error('Incoming state version regressed');
 if(Date.parse(next.updatedAt)<Date.parse(prev.updatedAt))throw Error('Incoming state timestamp regressed');
 if(!inspect.startsWith('MY LITTLE KITCHEN — AI INSPECTION\n'))throw Error('Inspection document identity invalid');
 const match=inspect.match(/^Server state:\s*v(\d+)\s*·\s*([^\r\n]+)/m);
 if(!match||!Number.isSafeInteger(Number(match[1]))||!validTime(match[2].trim()))
  throw Error('Inspection state revision missing or malformed');
 if(Number(match[1])!==next.version||match[2].trim()!==next.updatedAt)
  throw Error('Inspection and state revisions differ');
 return {version:next.version,updatedAt:next.updatedAt,recipes:next.state.recipes.length,edits:next.state.edits.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length!==3){console.error('Usage: validate-live-nutrition-snapshot <incoming-state> <existing-state> <incoming-inspect>');process.exitCode=2;}
 else try{
  const next=JSON.parse(readSmall(args[0],MAX_STATE_BYTES,'Incoming state'));
  const old=JSON.parse(readSmall(args[1],MAX_STATE_BYTES,'Previous state'));
  const inspect=readSmall(args[2],MAX_INSPECT_BYTES,'Inspection');
  const verified=validateIncomingSnapshot(next,old,inspect);
  console.log('Validated read-only live snapshot: version '+verified.version+', '+verified.recipes+' direct recipes, '+verified.edits+' saved edits.');
 }catch{
  console.error('Incoming live nutrition snapshot failed safe validation; preserving previous data.');
  process.exitCode=1;
 }
}
