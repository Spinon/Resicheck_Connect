// Candidate name-search comparison only. Never use as identity or display text.
// Mirrors the local PostgreSQL NFD/0300..036F/lower-C search candidate.
export function companySearchKey(value:string):string{
 return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[A-Z]/g,c=>c.toLowerCase());
}
