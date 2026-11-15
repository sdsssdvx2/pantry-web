import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const fail=message=>{throw new Error(message);};
const expect=(condition,message)=>{if(!condition)fail(message);};
const app=read('public/app.js'),controller=read('public/curation-controller.js');

expect(controller.includes('export function installCurationController'),'Curation controller must export its installer');
expect(app.includes("import {installCurationController} from './curation-controller.js"),'app.js must import the curation controller');
expect(app.includes('const curationController=installCurationController({'),'app.js must install the curation controller once');
expect(app.includes('ensureArchive:curationController.ensureArchive'),'Backup UI must reuse the curation controller archive loader');
expect(app.includes("if($('curation-dialog')?.open)curationController.render();"),'Synced state must refresh an open curation dialog through the controller');
expect(!app.includes("let archiveFilter='tip',activeNote=null"),'Curation UI state must not return to app.js');
expect(!app.includes('function openCuration()'),'Curation opening must not return to app.js');
expect(!app.includes('function openNote('),'Note editor state must not return to app.js');
expect(!app.includes("$('curation-dialog').addEventListener('click'"),'Curation mutation events must remain inside the controller');
expect(controller.includes("applyContext({hiddenSources:previous});return;"),'Recipe restore must roll back when persistence fails');
expect(controller.includes("applyContext({hiddenVariants:previous});return;"),'Variant restore must roll back when persistence fails');
expect(app.includes('purgedVariants=state.trashPurgedVariants||[]'),'App state must load permanently deleted recipe variants');
expect(controller.includes("data-trash-delete-variant")&&controller.includes("data-trash-delete-variant-all"),'Curation controller must handle individual and bulk permanent variant deletion');
expect(controller.includes('purgedVariants:[...new Set'),'Permanent variant deletion must persist built-in variant tombstones');
expect(controller.includes("sourceEdits:context.sourceEdits.filter(edit=>!remove.has(edit.sourceId+'/'+edit.variantKey))"),'Permanent variant deletion must remove matching authored variant edits');
expect(controller.includes('cookingHistory:context.cookingHistory'),'Permanent purge rollback must include cumulative cooking history');
expect(controller.includes('delete nextCookingHistory[id]'),'Permanent source purge must remove orphaned cumulative cooking records');
expect(controller.includes('const previous={curation:context.curation,curationOverride:context.curationOverride,curationLoaded:context.curationLoaded}'),'Note saves must retain rollback state');
expect(controller.includes("const noteKey=record=>record?`${String(record.source)}-${String(record.index)}`:'';"),'Note edits must use the same stable source-index identity as note deletion');
expect(controller.includes('const currentNote=context.curation.find(item=>noteKey(item)===activeKey);'),'Note edits must resolve the current synced record by stable identity');
expect(controller.includes("if(!currentNote)throw Error('다른 기기에서 이 요리 노트가 삭제됐어요."),'Deleted remote notes must not report a false successful edit');
expect(controller.includes("if(noteSnapshot(currentNote)!==noteSnapshot(activeNote))throw Error('다른 기기에서 이 요리 노트가 변경됐어요."),'Concurrent remote note edits must fail closed instead of overwriting newer content');
expect(controller.includes('context.curation.map(item=>noteKey(item)===activeKey?record:item)'),'Note replacement must not depend on object identity after sync reloads');
expect(!controller.includes('item===activeNote?record:item'),'Object identity must not control synced note replacement');
expect(controller.includes("noteTitleAuto=!!record&&record.source!=='personal'"),'Imported note titles must stay body-linked until the user explicitly edits the title');
expect(controller.includes("$('note-body').addEventListener('input'"),'Body-linked note titles must refresh while note content is edited');
expect(controller.includes("delete record.displayTitle;else record.displayTitle=title;"),'Auto-derived note titles must not be persisted as false manual overrides');
expect(controller.includes("recipeEditor.openFromArchive({...record,title:noteDisplayTitle(record)})"),'Archive-to-recipe handoff must use the current visible note title');
expect(controller.includes("fetch('./curation.json')"),'The controller must retain lazy archive loading');

console.log('Curation controller boundary check passed.');
