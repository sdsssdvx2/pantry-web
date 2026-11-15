import {isMigratedNote} from './promoted-note-keys.js';

export function noteKind(r){
 if(isMigratedNote(r))return 'history';
 if(r.kind)return r.kind;
 if(r.source==='main'&&r.index===256)return 'history';
 if(/나트륨|내 기준|염도|조미료 비교|향신료 비교/.test(r.title))return 'reference';
 if(/먹는 (?:법|방법)|손질|보관|해동|삶는 법|씻는 법/.test(r.title))return 'tip';
 if(r.status==='참고 보관'&&r.source==='main'&&/\d+(?:\.\d+)?\s*(?:g|ml|mL|개|큰술)|\n\s*1[.)]/.test(r.original))return 'candidate';
 return 'history';
}
