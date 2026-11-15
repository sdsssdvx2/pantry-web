import {isMigratedNote} from './promoted-note-keys.js';
import {noteKind} from './note-classification.js';

// Archive rows keep source history visible while promoted recipes live in recipe state.
export {noteKind};
export const noteKinds=[['tip','요리 팁·손질'],['reference','개인 참고'],['candidate','메뉴 후보'],['history','원문·이전 기록'],['all','전체 기록']];
export function noteStatus(r){return isMigratedNote(r)?'레시피 등록':r.status;}
export function noteReason(r){return isMigratedNote(r)?'정식 레시피로 옮겼고 이 항목은 원문 기록으로 보존합니다.':r.reason;}
