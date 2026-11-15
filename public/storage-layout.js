// Household storage layout: [stored value, top-level area, leaf label, hint].
// Kept separate from pantry logic so each deployment can describe its own kitchen.
export const locations = [
 ['냉동실 · 문짝','냉동실','문짝','자주 쓰는 것'],
 ['냉동실 · 1 고기·채소','냉동실','1번 칸','고기·채소'],
 ['냉동실 · 2 빵','냉동실','2번 칸','빵'],
 ['냉장고 · 문짝','냉장고','문짝','자주 쓰는 것'],
 ['냉장고 · 안쪽','냉장고','안쪽',''],
 ['냉장고 · 야채칸','냉장고','야채칸',''],
 ...['향신료·조미료','소스','기름','식재료','과자','음료'].map(s=>['실온 · '+s,'실온',s,'']),
 ['냉동실 · 위치 모름','위치 미상','냉동실 어딘가','아직 못 찾은 것']
];

// Stable top-level filter order. The legacy "냉동실 · 위치 모름" value stays
// compatible with saved state but is presented to the user as "위치 미상".
export const locationFilters = [
 ['냉동실','냉동실'],
 ['냉장고','냉장고'],
 ['실온','실온']
];
