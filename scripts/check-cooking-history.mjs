import {addCookingRecord,cookingCount,latestCookedAt,latestCookedMap,mergeCookingHistory,removeCookingRecord} from '../public/cooking-history.js';

const fail=message=>{throw new Error(message);};
const expect=(condition,message)=>{if(!condition)fail(message);};

const first='2026-09-01T10:00:00.000Z';
const second='2026-09-10T10:00:00.000Z';
const third='2026-09-18T10:00:00.000Z';

let history={};
history=addCookingRecord(history,'recipe-a',first);
history=addCookingRecord(history,'recipe-a',third);
history=addCookingRecord(history,'recipe-a',second);
expect(history['recipe-a'].join('|')===`${third}|${second}|${first}`,'Cooking records must remain newest-first regardless of insertion order');
expect(cookingCount(history,'recipe-a')===3,'Cooking count must use cumulative records');
expect(latestCookedAt(history,'recipe-a')===third,'Latest cooking timestamp must come from the newest cumulative record');
expect(latestCookedMap(history)['recipe-a']===third,'Compatibility latest-cooked map must derive from cumulative history');

history=addCookingRecord(history,'recipe-a',second);
expect(cookingCount(history,'recipe-a')===3,'Identical timestamps must not duplicate a cooking record');

const removed=removeCookingRecord(history,'recipe-a',second);
expect(removed['recipe-a'].join('|')===`${third}|${first}`,'Exact cooking-record deletion must preserve the rest of the history');
expect(history['recipe-a'].length===3,'Cooking-history helpers must not mutate their input object');

const merged=mergeCookingHistory(
 {'recipe-a':[first,second],'recipe-b':[first]},
 {'recipe-a':[third,second],'recipe-b':[third]}
);
expect(merged['recipe-a'].join('|')===`${third}|${second}|${first}`,'Backup/history merging must deduplicate and sort cooking records');
expect(merged['recipe-b'].join('|')===`${third}|${first}`,'Cooking-history merging must work independently per recipe');

const cleared=removeCookingRecord({'recipe-a':[first]},'recipe-a',first);
expect(!Object.hasOwn(cleared,'recipe-a'),'Removing the final record must remove the empty recipe history key');

console.log('Cooking history helper check passed.');
