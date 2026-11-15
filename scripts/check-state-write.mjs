import fs from 'node:fs';
import {familySafeData,familySafeState} from '../src/share-state.js';

const worker=fs.readFileSync('src/worker.js','utf8');
const access=fs.readFileSync('src/access-entry.js','utf8');
const shareEntry=fs.readFileSync('src/share-entry.js','utf8');
const accessService=fs.readFileSync('src/access-service.js','utf8');
const authService=fs.readFileSync('src/auth-service.js','utf8');
const backupService=fs.readFileSync('src/backup-service.js','utf8');
const shareService=fs.readFileSync('src/share-service.js','utf8');
const stateEntry=fs.readFileSync('src/state-entry.js','utf8');
const migration=fs.readFileSync('migrations/0000_initial_schema.sql','utf8');
const cloudflareBuild=fs.readFileSync('scripts/cloudflare-build.mjs','utf8');
const wrangler=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,''));

const filteredFamily=familySafeState({version:2,curation:[{kind:'tip',title:'공개 팁'},{kind:'private',title:'비공개 메모'}],library:{recipes:[],curation:[{kind:'candidate',title:'공개 후보'},{kind:'private',title:'비공개 원문'}]}});
if(filteredFamily.curation?.length!==1||filteredFamily.curation[0]?.title!=='공개 팁')throw new Error('Family state must filter private top-level curation records');
if(filteredFamily.library?.curation?.length!==1||filteredFamily.library.curation[0]?.title!=='공개 후보')throw new Error('Family state must filter private library curation records');
const libraryOnlyFamily=familySafeState({version:2,library:{recipes:[],curation:[{kind:'candidate',title:'공개 후보'}]}});
if(Object.hasOwn(libraryOnlyFamily,'curation')||libraryOnlyFamily.library?.curation?.length!==1)throw new Error('Family state must preserve library curation fallback when top-level curation is absent');
const malformedFields=familySafeState({version:2,curation:'private raw curation',library:['private raw library']});
if(!Array.isArray(malformedFields.curation)||malformedFields.curation.length||Object.hasOwn(malformedFields,'library'))throw new Error('Malformed family curation/library fields must fail closed');
for(const unsafe of ['{"version":2,"curation":[',JSON.stringify('private raw state'),JSON.stringify(['private raw state'])]){
  const safe=JSON.parse(familySafeData(unsafe));
  if(safe?.version!==2||!Array.isArray(safe.items)||safe.items.length||!Array.isArray(safe.curation)||safe.curation.length)throw new Error('Malformed or non-object family state must fail closed to an empty readable kitchen state');
}

if(!worker.includes('if (current.data === data) return json('))throw new Error('Server must short-circuit byte-identical state writes');
if(!worker.includes("DELETE FROM sync_conflicts WHERE id NOT IN (SELECT id FROM sync_conflicts ORDER BY id DESC LIMIT 50)"))throw new Error('Server must bound preserved sync conflicts to the latest 50 copies');
if(!/async function saveConflict[\s\S]*env\.DB\.batch\(\[/.test(worker))throw new Error('Conflict insertion and retention pruning must stay in one D1 batch');
if(!/url\.pathname === '\/api\/state' && request\.method === 'PUT'[\s\S]{0,180}auth\.role !== 'owner'[\s\S]{0,100}read_only/.test(worker))throw new Error('Shared viewer/reviewer sessions must be forbidden from PUT /api/state before putState runs');
if(!/url\.pathname === '\/api\/conflict' && request\.method === 'POST'[\s\S]{0,180}auth\.role !== 'owner'[\s\S]{0,100}read_only/.test(worker))throw new Error('Shared sessions must not create sync-conflict records');
if(!/url\.pathname\.startsWith\('\/api\/backups'\)[\s\S]{0,140}auth\.role !== 'owner'[\s\S]{0,100}forbidden/.test(worker))throw new Error('Server backup and restore APIs must remain owner-only');
if(worker.includes("DELETE FROM share_links WHERE revoked_at IS NOT NULL")||shareService.includes("DELETE FROM share_links WHERE revoked_at IS NOT NULL"))throw new Error('Obsolete soft-revoke cleanup query must not return to the server path');
const logoutBlock=worker.match(/if \(url\.pathname === '\/auth\/logout'\) \{([\s\S]*?)\n    \}/)?.[1]||'';
if((logoutBlock.match(/headers\.append\('set-cookie'/g)||[]).length!==2)throw new Error('Logout must clear owner and share cookies with two Set-Cookie headers');
if(logoutBlock.includes('Max-Age=0,'))throw new Error('Logout cookies must not be comma-folded into one Set-Cookie header');

for(const [name,source] of [['src/worker.js',worker],['src/access-entry.js',access],['src/access-service.js',accessService],['src/auth-service.js',authService],['src/backup-service.js',backupService],['src/share-service.js',shareService]]){
  if(source.includes('ensureSchema('))throw new Error(`${name} must not create/check D1 schema during requests`);
  if(/CREATE\s+(?:TABLE|INDEX)\s+IF\s+NOT\s+EXISTS/i.test(source))throw new Error(`${name} must not contain runtime D1 schema DDL`);
}

if(!stateEntry.includes('export async function handleStateApi'))throw new Error('state-entry.js must expose the direct state API handler');
if(!stateEntry.includes("url.pathname === '/api/conflicts/latest'"))throw new Error('Owner state API must expose latest sync-conflict metadata for recovery');
if(!stateEntry.includes("url.pathname.match(/^\\/api\\/conflicts\\/(\\d+)$/)"))throw new Error('Owner state API must expose a specific sync-conflict download route');
if(!stateEntry.includes("SELECT id, server_version, created_at, length(client_data) AS bytes FROM sync_conflicts ORDER BY id DESC LIMIT 1"))throw new Error('Conflict list route must fetch metadata without loading the full client state payload');
if(!stateEntry.includes("SELECT id, client_data, server_version, created_at FROM sync_conflicts WHERE id=?"))throw new Error('Conflict download route must fetch the exact preserved client payload by id');
if((stateEntry.match(/ownerSession\(request, env\)/g)||[]).length<3)throw new Error('Conflict recovery and history diff state endpoints must remain owner-only');
if(stateEntry.includes("export { default } from './worker.js';"))throw new Error('state-entry.js must stay a named state API module instead of re-exporting the base Worker');
if(!shareEntry.includes("import app from './worker.js';"))throw new Error('share-entry.js must delegate directly to worker.js after share-specific handling');
if(!worker.includes("from './auth-service.js';"))throw new Error('worker.js must consume shared authentication primitives from auth-service.js');
if(!worker.includes("import {createSnapshot,handleBackupAdmin} from './backup-service.js';"))throw new Error('worker.js must delegate server backup lifecycle to backup-service.js');
if(!worker.includes("import {handleShareAdmin,touchShare} from './share-service.js';"))throw new Error('worker.js must delegate share administration and access counting to share-service.js');
if(worker.includes('async function handleShareAdmin(')||worker.includes('async function touchShare(')||worker.includes('function randomToken('))throw new Error('Share administration internals must not return to worker.js');
if(!shareService.includes('export async function handleShareAdmin')||!shareService.includes('export async function touchShare'))throw new Error('share-service.js must own share administration and access counting');
if(!shareService.includes("DELETE FROM share_links WHERE id=?")||!shareService.includes('clearShareAuthCache()'))throw new Error('Deleting a share link must hard-delete the D1 row and invalidate cached tokens');
if(worker.includes('async function createSnapshot(')||worker.includes('async function restoreBackup(')||worker.includes('async function handleBackupAdmin('))throw new Error('Server backup implementation must not return to worker.js');
if(!backupService.includes('export async function createSnapshot')||!backupService.includes('export async function handleBackupAdmin'))throw new Error('backup-service.js must own snapshot and backup API handling');
// Backup snapshot integrity and owner/share authorization run against real SQL in check-backup-runtime.mjs.
if(worker.includes('const SHARE_AUTH_CACHE_MS')||worker.includes('async function hmac(')||worker.includes('async function isOwner('))throw new Error('Authentication/cache internals must not return to worker.js');
if(!authService.includes("export const OWNER_COOKIE = 'mlk_owner';")||!authService.includes("export const SHARE_COOKIE = 'mlk_share';"))throw new Error('auth-service.js must own owner/share cookie names');
if(!authService.includes('export async function findShareByToken')||!authService.includes('export async function getAuth'))throw new Error('auth-service.js must own shared token/session authentication');
if(!authService.includes('export function clearShareAuthCache'))throw new Error('Share administration must be able to invalidate the auth token cache after deletion');
if(!stateEntry.includes("import {getAuth} from './auth-service.js';"))throw new Error('state-entry.js must depend on auth-service.js rather than worker.js');
if(!accessService.includes("import {findShareByToken,getAuth} from './auth-service.js';"))throw new Error('access-service.js must depend on auth-service.js rather than worker.js');
if(!access.includes("import {findShareByToken} from './auth-service.js';"))throw new Error('access-entry.js must use auth-service.js for share-token validation');
if(stateEntry.includes('async fetch(')||stateEntry.includes('return base.fetch('))throw new Error('state-entry.js must not return to a fetch-wrapper layer');
if(!access.includes("import {handleStateApi} from './state-entry.js';"))throw new Error('access-entry.js must import the direct state API handler');
if(!access.includes('const stateResponse=await handleStateApi(request,env,url);'))throw new Error('access-entry.js must dispatch state-specific routes directly');
if(!access.includes("from './access-service.js';"))throw new Error('access-entry.js must delegate access logging and management to access-service.js');
if(!access.includes("share.scope==='viewer'?{...rawInfo,state:familySafeState(rawInfo.state)}:rawInfo"))throw new Error('Viewer AI inspection endpoints must derive inspect/state/rendered output from family-safe state');
if(!access.includes("const AI_INSPECTION_TAILS=new Set(['inspect.txt','state.json','rendered.txt']);"))throw new Error('AI inspection endpoints must be enumerated explicitly before loading full D1 state');
if(!access.includes("const inspectionTail=AI_INSPECTION_TAILS.has(parsed.tail);"))throw new Error('Share request routing must distinguish AI inspection tails from ordinary shared browser paths');
if(!access.includes("const stableReviewerRoot=!parsed.tail&&!isBrowserNavigation(request);"))throw new Error('Only reviewer non-browser root requests may use the stable inspection view');
if(!/if\(inspectionTail\|\|stableReviewerRoot\)\{[\s\S]{0,240}findShareByToken\(env,parsed\.token\)[\s\S]{0,240}if\(share&&\(inspectionTail\|\|share\.scope==='reviewer'\)\)\{[\s\S]{0,220}stateInfo\(env\)/.test(access))throw new Error('Full owner state must only load behind the AI inspection/reviewer-stable route guard');
if(!shareEntry.includes("import {familySafeState} from './share-state.js';"))throw new Error('Shared browser entry must import the family-safe state filter');
if(!shareEntry.includes("share.scope==='viewer'?{...rawStateInfo,state:familySafeState(rawStateInfo.state)}:rawStateInfo"))throw new Error('Viewer browser inspection summary must count only family-safe state');
if(!shareEntry.includes('return shareHome(request,env,ctx,token,share);'))throw new Error('Shared browser home must receive the validated share scope before building inspection metadata');
if(!accessService.includes('export async function handleAccessApi'))throw new Error('access-service.js must own access management API handling');
if(!accessService.includes('export async function recordNavigationAccess'))throw new Error('access-service.js must own owner/family navigation logging');
if(!accessService.includes('export async function pruneAccessEvents'))throw new Error('access-service.js must expose scheduled retention cleanup');
if(accessService.includes('await prune(env)'))throw new Error('Navigation logging must not run retention DELETEs on each visit');
if(accessService.includes("SELECT id FROM access_events WHERE kind='owner'"))throw new Error('Owner visit dedupe must reuse access_devices.last_seen_at instead of querying access_events again');
if(!accessService.includes("SELECT device_id,trusted,last_seen_at FROM access_devices WHERE device_id=?"))throw new Error('Owner visit dedupe must read the existing device last-seen timestamp');
if(!access.includes('ctx.waitUntil(pruneAccessEvents(env).catch(()=>{}));'))throw new Error('Daily Worker schedule must run access-event retention cleanup outside navigation requests');
const shareAccessBlock=accessService.match(/const shareMatch=url\.pathname\.match\(SHARE_TOKEN_RE\);([\s\S]*?)\n  return response;/)?.[1]||'';
if(!shareAccessBlock.includes("const current=await getAuth(request,env);")||!shareAccessBlock.includes("if(current?.role==='owner')return response;"))throw new Error('Owner previews of family links must not be recorded as family access events');
if(access.includes('INSERT INTO access_events')||access.includes('INSERT INTO access_devices'))throw new Error('Access event persistence must not return to access-entry.js');

for(const name of ['owner_state','state_history','sync_conflicts','share_links','backup_snapshots','access_devices','access_events']){
  if(!new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${name}\\b`,'i').test(migration))throw new Error(`D1 migration is missing table: ${name}`);
}
for(const name of ['backup_snapshots_created_idx','access_events_created_idx','access_events_kind_idx']){
  if(!new RegExp(`CREATE\\s+INDEX\\s+IF\\s+NOT\\s+EXISTS\\s+${name}\\b`,'i').test(migration))throw new Error(`D1 migration is missing index: ${name}`);
}

const d1=wrangler.d1_databases?.find(db=>db.binding==='DB');
if(d1?.migrations_dir!=='migrations')throw new Error('DB binding must keep migrations_dir="migrations"');
if(wrangler.build?.command!=='node scripts/cloudflare-build.mjs')throw new Error('Wrangler production deploys must run the D1 migration build hook');
// Production release safety: verify the current guard contract, never assert
// that a production build must mutate the D1 schema automatically.
if(!cloudflareBuild.includes('classifyBuildForD1Inspection(command,process.env,sha)'))throw new Error('Release build must classify CI branch and exact commit before remote D1 access');
if(!cloudflareBuild.includes("if(releaseContext!=='production')"))throw new Error('Preview and non-production builds must skip remote D1 inspection');
if(!cloudflareBuild.includes('verifyRemoteD1MigrationState()'))throw new Error('Production release build must inspect D1 migration state read-only');
if(cloudflareBuild.includes("'migrations','apply'")||cloudflareBuild.includes("'migrations', 'apply'"))throw new Error('Production build must never auto-apply remote D1 migrations');
if(!cloudflareBuild.includes("MLK_APPLYING_D1_MIGRATIONS==='1'"))throw new Error('Release build must reject the obsolete automatic D1 migration mode');

console.log('Server state write, direct state routing, access service, and D1 schema boundary check passed.');
