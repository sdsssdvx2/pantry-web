export const searchKey = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();

// Search-only equivalences: keep stored names, duplicate checks and ingredient
// substitution rules separate. Compound names such as 계란찜 use the same key.
const foodSpellings=[
 [/계란/g,'달걀'],[/쇠고기/g,'소고기'],[/모짜렐라/g,'모차렐라'],
 [/요구르트/g,'요거트'],[/돈까스|돈가스/g,'돈카츠'],[/케찹|케챱/g,'케첩'],
 [/마요네스/g,'마요네즈'],[/슈레디드/g,'슈레드'],[/스파게띠/g,'스파게티']
];
export function foodSearchKey(value){return foodSpellings.reduce((text,[pattern,replacement])=>text.replace(pattern,replacement),searchKey(value));}

export function searchTerms(query) {
  return String(query ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .split(/[\s,，、;；/·|+()[\]{}]+/u)
    .map(searchKey)
    .filter(Boolean);
}

export function matchesSearchTerms(text, terms) {
  if (!terms.length) return true;
  const target = foodSearchKey(text);
  return terms.every(term => target.includes(foodSearchKey(term)));
}

export function createSearchMatcher(query) {
  const terms = searchTerms(query).map(foodSearchKey);
  return text => {const target=foodSearchKey(text);return terms.every(term=>target.includes(term));};
}

export function matchesSearch(text, query) {
  return matchesSearchTerms(text, searchTerms(query));
}
