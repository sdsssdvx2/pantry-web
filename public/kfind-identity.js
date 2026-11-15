// K-FIND leaves product identifiers blank or uses "-" in real exports.
// Placeholder text must never be treated as an observed label identity.
export function isUnknownKfindIdentity(value){
 const normalized=String(value??'').trim().normalize('NFKC').replace(/\s+/g,'').toLowerCase();
 return !normalized||/^(?:[-–—]+|n\/?a|notapplicable|none|null|unknown|미상|불명|미제공|미확인|없음|해당없음|정보없음)$/.test(normalized);
}

// A pack size must be a measurable printed amount, not an arbitrary token.
// This does NOT establish product equivalence; the owner still compares the
// exact printed name, manufacturer, importer and pack text.
export function hasKfindPackAmount(value){
 if(isUnknownKfindIdentity(value))return false;
 const s=String(value).trim().normalize('NFKC');
 return /\d/.test(s)&&/(?:kg|mg|g|ml|l|개|포|봉|팩|병|캔|입|정|매|장|상자|캡슐)/i.test(s);
}
