// Plain-text AI inspection bundle shared by the live reviewer endpoint and the
// scheduled GitHub snapshot publisher. Keep the first two header lines stable:
// scripts/validate-live-nutrition-snapshot.mjs checks them.
import {SITE_CONFIG} from '../public/site-config.js';
export const REPOSITORY_URL=SITE_CONFIG.repositoryUrl;

export function shareLinks(origin,token){
  if(!token){
    const note='(not published: ask the owner for an AI reviewer share link)';
    return {root:origin||note,inspect:note,state:note,rendered:note,screenshot:note};
  }
  const root=`${origin}/share/${token}`;
  return {root,inspect:`${root}/inspect.txt`,state:`${root}/state.json`,rendered:`${root}/rendered.txt`,screenshot:`${root}/screenshot.png?full=1&width=1440`};
}

export function repoLinks(){
  return {repository:REPOSITORY_URL,handoff:`${REPOSITORY_URL}/blob/main/AI_HANDOFF.md`,liveSnapshot:`${REPOSITORY_URL}/tree/ai-live-snapshot/.ai-live`};
}

export function stockSummary(state){
  if(!state)return 'No D1 state is available.';
  const items=Array.isArray(state.items)?state.items:[],stock=state.stock&&typeof state.stock==='object'?state.stock:{};
  return items.map(name=>{const row=stock[name]||{},locations=Array.isArray(row.locations)&&row.locations.length?` | ${row.locations.join(' / ')}`:'',notes=Array.isArray(row.notes)&&row.notes.length?` | ${row.notes.join(' · ')}`:'',status=row.status&&row.status!=='available'?` | ${row.status}`:'';return `- ${name}${status}${locations}${notes}`;}).join('\n');
}

export function recipeSummary(state){
  if(!state)return 'No D1 state is available.';
  const rows=[];
  for(const r of Array.isArray(state.recipes)?state.recipes:[])rows.push(`- ${r.name||r.id} | required: ${(r.required||[]).join(', ')} | ${(r.summary||'').trim()}`);
  for(const r of Array.isArray(state.library?.recipes)?state.library.recipes:[])rows.push(`- ${r.name||r.id} | required: ${(r.required||[]).join(', ')} | ${(r.summary||'').trim()}`);
  return rows.join('\n')||'No recipes in the state payload.';
}

export function noteSummary(state){
  const rows=state?.curation??state?.library?.curation;if(!Array.isArray(rows))return 'No cooking notes in the state payload.';
  return rows.map(row=>`- ${row.displayTitle||row.name||row.title||'Untitled'} | ${row.kind||''} | ${(row.note||row.original||'').replace(/\s+/g,' ').slice(0,500)}`).join('\n');
}

export function inspectText(origin,token,share,info){
  const l=shareLinks(origin,token),r=repoLinks(),state=info.state;
  return ['MY LITTLE KITCHEN — AI INSPECTION',`Generated: ${new Date().toISOString()}`,`Share: ${share.label||'AI reviewer'} (${share.scope})`,`Server state: v${info.version}${info.updatedAt?` · ${info.updatedAt}`:''}`,'','LIVE LINKS',`Actual shared page: ${l.root}`,`Stable rendered/inspection text: ${l.rendered}`,`Latest state JSON: ${l.state}`,`Screenshot endpoint: ${l.screenshot}`,'','GITHUB',`Repository: ${r.repository}`,`AI handoff: ${r.handoff}`,`Live snapshot branch: ${r.liveSnapshot}`,'','CURRENT INVENTORY',stockSummary(state),'','USER/CURRENT RECIPES',recipeSummary(state),'','COOKING NOTES',noteSummary(state)].join('\n');
}

