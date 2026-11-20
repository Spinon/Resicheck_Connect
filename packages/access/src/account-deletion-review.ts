/** Coherence review only. Inputs must be trusted server aggregates, never
 * authority hydrated from client JSON. No I/O, executor, Auth proof or legal
 * decision is supplied here; even a reviewed result cannot confirm deletion. */
export const ACCOUNT_DELETION_REVIEW_CATEGORIES=Object.freeze([
 'account-access','profile-registration','membership-history','shared-messages',
 'shared-attachments','security-audit','storage-replicas','backups-restoration',
] as const);
export type AccountDeletionReviewCategory=typeof ACCOUNT_DELETION_REVIEW_CATEGORIES[number];
export type AccountDeletionReviewBlocker='unavailable'|'scope-mismatch'|'inventory-unresolved'|'policy-unresolved'|'stale-review'|'shared-content-review'|'management-review'|'reference-review'|'storage-review'|'restore-review'|'sessions-review';
export type AccountDeletionReviewBinding=Readonly<{subjectId:string;inventoryRevision:string;policyVersion:string}>;
export type AccountDeletionRetentionLimit=Readonly<{kind:'until-date';at:number}>|Readonly<{kind:'until-event';eventRef:string;reviewAt:number}>;
export type AccountDeletionReviewDecision=Readonly<{category:AccountDeletionReviewCategory;presence:'present'|'absent';action:'remove'|'retain';retention:AccountDeletionRetentionLimit|null}>;
export type AccountDeletionReviewAssessment=Readonly<{
 status:'review-blocked'|'impact-reviewed';canExecuteDeletion:false;canConfirmDeletion:false;
 binding:AccountDeletionReviewBinding|null;blockers:readonly AccountDeletionReviewBlocker[];
 decisions:readonly AccountDeletionReviewDecision[];requiresDetailedDisclosure:true;
}>;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>{const own=Reflect.ownKeys(v);return own.length===keys.length&&own.every(k=>typeof k==='string'&&keys.includes(k));};
const tag=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const time=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=8640000000000000;
const category=(v:unknown):v is AccountDeletionReviewCategory=>typeof v==='string'&&(ACCOUNT_DELETION_REVIEW_CATEGORIES as readonly string[]).includes(v);
const empty=Object.freeze([]);
function blocked(binding:AccountDeletionReviewBinding|null,reasons:readonly AccountDeletionReviewBlocker[]):AccountDeletionReviewAssessment{
 return Object.freeze({status:'review-blocked',canExecuteDeletion:false,canConfirmDeletion:false,binding,blockers:Object.freeze([...new Set(reasons)]),decisions:empty,requiresDetailedDisclosure:true});
}
/** expected is the current captured review context. Its revision must be
 * advanced by a future authoritative inventory whenever dependencies change.
 * This function cannot discover undeclared records, prove an attestation,
 * decide legality, revoke a session, delete bytes or create a commit ticket. */
export function assessAccountDeletionReview(expected:unknown,inventory:unknown,policy:unknown,now:unknown):AccountDeletionReviewAssessment{
 let binding:AccountDeletionReviewBinding|null=null;
 try{
  if(!record(expected)||!exact(expected,['subjectId','inventoryRevision','policyVersion']))return blocked(null,['unavailable']);
  const {subjectId,inventoryRevision,policyVersion}=expected;
  if(!uuid(subjectId)||!tag(inventoryRevision)||!tag(policyVersion)||!time(now))return blocked(null,['unavailable']);
  binding=Object.freeze({subjectId,inventoryRevision,policyVersion});
  if(!record(inventory)||!exact(inventory,['schemaVersion','subjectId','revision','policyVersion','observedAt','expiresAt','complete','scope','sharedContentReviewed','otherSubjectsProtected','management','referencesReviewed','storageReviewed','restoreReviewed','sessionsReviewed','categories']))return blocked(binding,['inventory-unresolved']);
  const {schemaVersion,subjectId:owner,revision,policyVersion:inventoryPolicy,observedAt,expiresAt,complete,scope,sharedContentReviewed,otherSubjectsProtected,management,referencesReviewed,storageReviewed,restoreReviewed,sessionsReviewed,categories}=inventory;
  if(schemaVersion!==1||![complete,sharedContentReviewed,otherSubjectsProtected,referencesReviewed,storageReviewed,restoreReviewed,sessionsReviewed].every(v=>typeof v==='boolean')||(typeof management!=='string'||!['not-manager','continuity-reviewed','needs-assistance','unknown'].includes(management)))return blocked(binding,['inventory-unresolved']);
  const reasons:AccountDeletionReviewBlocker[]=[];
  if(owner!==subjectId||revision!==inventoryRevision||inventoryPolicy!==policyVersion||scope!=='own-associated-data-all-company-contexts-separate')reasons.push('scope-mismatch');
  if(!time(observedAt)||!time(expiresAt)||observedAt>now||expiresAt<=now||expiresAt<=observedAt)reasons.push('stale-review');
  if(complete!==true)reasons.push('inventory-unresolved');
  if(sharedContentReviewed!==true||otherSubjectsProtected!==true)reasons.push('shared-content-review');
  if(management==='needs-assistance'||management==='unknown')reasons.push('management-review');
  if(referencesReviewed!==true)reasons.push('reference-review');
  if(storageReviewed!==true)reasons.push('storage-review');
  if(restoreReviewed!==true)reasons.push('restore-review');
  if(sessionsReviewed!==true)reasons.push('sessions-review');
  if(!Array.isArray(categories)||categories.length!==ACCOUNT_DELETION_REVIEW_CATEGORIES.length)return blocked(binding,[...reasons,'inventory-unresolved']);
  const presences=new Map<AccountDeletionReviewCategory,'present'|'absent'>();
  for(const item of categories){
   if(!record(item)||!exact(item,['category','presence']))return blocked(binding,[...reasons,'inventory-unresolved']);
   const {category:key,presence}=item;
   if(!category(key)||presences.has(key)||(typeof presence!=='string'||!['present','absent','unknown'].includes(presence)))return blocked(binding,[...reasons,'inventory-unresolved']);
   if(presence==='unknown')reasons.push('inventory-unresolved');else presences.set(key,presence as 'present'|'absent');
  }
  if(presences.get('account-access')!=='present')reasons.push('inventory-unresolved');
  if(!record(policy)||!exact(policy,['schemaVersion','version','scope','reviewed','reviewRef','expiresAt','rules']))return blocked(binding,[...reasons,'policy-unresolved']);
  const {schemaVersion:policySchema,version,scope:policyScope,reviewed,reviewRef,expiresAt:policyExpiry,rules}=policy;
  if(policySchema!==1||version!==policyVersion||policyScope!=='account-and-associated-data'||reviewed!==true||!tag(reviewRef))reasons.push('policy-unresolved');
  if(!time(policyExpiry)||policyExpiry<=now)reasons.push('stale-review');
  if(!Array.isArray(rules)||rules.length!==ACCOUNT_DELETION_REVIEW_CATEGORIES.length)return blocked(binding,[...reasons,'policy-unresolved']);
  const decisions=new Map<AccountDeletionReviewCategory,AccountDeletionReviewDecision>();
  for(const item of rules){
   if(!record(item)||!exact(item,['category','action','reviewRef','rationaleRef','retention']))return blocked(binding,[...reasons,'policy-unresolved']);
   const {category:key,action,reviewRef:ruleReview,rationaleRef,retention}=item;
   if(!category(key)||decisions.has(key)||(action!=='remove'&&action!=='retain')||!tag(ruleReview)||!tag(rationaleRef))return blocked(binding,[...reasons,'policy-unresolved']);
   let limit:AccountDeletionRetentionLimit|null=null;
   if(action==='remove'){if(retention!==null)return blocked(binding,[...reasons,'policy-unresolved']);}
   else{
    // Sharing alone is never a retention decision. A reviewed reference and
    // bounded date/event review are required, but are not validated legally here.
    if(key==='account-access'||!record(retention))return blocked(binding,[...reasons,'policy-unresolved']);
    if(exact(retention,['kind','at'])){const {kind,at}=retention;if(kind!=='until-date'||!time(at)||at<=now)return blocked(binding,[...reasons,'policy-unresolved']);limit=Object.freeze({kind,at});}
    else if(exact(retention,['kind','eventRef','reviewAt'])){const {kind,eventRef,reviewAt}=retention;if(kind!=='until-event'||!tag(eventRef)||!time(reviewAt)||reviewAt<=now)return blocked(binding,[...reasons,'policy-unresolved']);limit=Object.freeze({kind,eventRef,reviewAt});}
    else return blocked(binding,[...reasons,'policy-unresolved']);
   }
   const presence=presences.get(key);if(!presence)return blocked(binding,[...reasons,'inventory-unresolved']);
   decisions.set(key,Object.freeze({category:key,presence,action,retention:limit}));
  }
  if(reasons.length)return blocked(binding,reasons);
  return Object.freeze({status:'impact-reviewed',canExecuteDeletion:false,canConfirmDeletion:false,binding,blockers:empty,decisions:Object.freeze(ACCOUNT_DELETION_REVIEW_CATEGORIES.map(key=>decisions.get(key)!)),requiresDetailedDisclosure:true});
 }catch{return blocked(binding,['unavailable']);}
}
