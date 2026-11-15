import assert from 'node:assert/strict';
import {locations,pantryLocationSearchText} from '../public/pantry-tools.js';
import {createSearchMatcher} from '../public/search-utils.js';

// Values outside the configured layout fall back to the part after the parent area.
const labels=pantryLocationSearchText([
 '보조 냉동실 · 맨 위 선반',
 '보조 냉동실 · 얼음칸'
]);
assert.equal(labels,'맨 위 선반 얼음칸','Only the user-facing leaf labels should be indexed');
assert.equal(createSearchMatcher('맨 위 선반')(labels),true,'Leaf shelf names should be searchable');
assert.equal(createSearchMatcher('얼음칸')(labels),true,'Leaf compartment names should be searchable');
assert.equal(createSearchMatcher('보조 냉동실')(labels),false,'Parent freezer names should stay out of text search');

// Configured layout entries use their display label, not the stored value suffix or hint.
const mapped=locations.find(([value,,label,hint])=>value.includes(' · ')&&label&&label!=='전체'&&!value.endsWith(label)&&hint);
assert(mapped,'The storage layout needs at least one entry whose display label differs from its stored suffix');
{
 const [value,parent,label,hint]=mapped,text=pantryLocationSearchText([value]);
 assert.equal(text,label,'Configured entries should index the clean display label');
 assert.equal(createSearchMatcher(label)(text),true,'Numbered leaf labels should be searchable');
 assert.equal(createSearchMatcher(parent)(text),false,'Parent area names should stay out of text search');
 assert.equal(createSearchMatcher(hint)(text),false,'Location hints should stay out of text search');
 assert.equal(createSearchMatcher(value.split(' · ').slice(1).join(' · '))(text),false,'Stored value suffixes must not override the clean display label');
}

assert.equal(
 pantryLocationSearchText(['우리 냉동실 · 직접 선반 (간식)']),
 '직접 선반',
 'Custom leaf locations should use the part after the parent area and strip parentheses'
);
const whole=locations.find(([,,label])=>label==='전체');
if(whole)assert.equal(pantryLocationSearchText([whole[0]]),'','Top-level-only locations should not add a generic 전체 search term');

console.log('Pantry leaf-location search checks passed.');
