/** Minimal server-side registry matching only. This is not an identity,
 * ownership or authorization proof. A trusted worker must fetch the request and
 * provider result itself, then bind its private proof to the exact request.
 * Never accept this assessment or its policy from client JSON as authority. */
export type RegistryPolicy=Readonly<{version:string;sourceId:string;enabled:boolean;maxObservationAgeMs:number}>;
export type RegistrySnapshot=Readonly<{cnpj:string;legalName:string;tradeName:string|null;registrationStatus:1|2|3|4|8;observedAt:number;sourceId:string;sourceRequestId:string}>;
export type RegistryLookup=Readonly<{kind:'found';snapshot:RegistrySnapshot}>|Readonly<{kind:'not-found'|'unavailable'}>;
type NoAuthority=Readonly<{ownershipVerified:false;canGrantAccess:false}>;
export type RegistryAssessment=NoAuthority&(
 Readonly<{status:'invalid-input'|'unavailable'|'not-found'|'mismatch'|'stale';reason:string}>|
 Readonly<{status:'matched';cnpj:string;legalName:string;officialName:string;nameKey:string;matchedBy:'legal-name'|'trade-name';registrationStatus:1|2|3|4|8;observedAt:number;sourceId:string;sourceRequestId:string;policyVersion:string}>
);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>{const own=Reflect.ownKeys(v);return own.length===keys.length&&own.every(k=>typeof k==='string'&&keys.includes(k));};
const tag=(v:unknown):v is string=>typeof v==='string'&&/^[a-z0-9][a-z0-9._-]{0,79}$/.test(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const time=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=8640000000000000;
const noAuthority={ownershipVerified:false,canGrantAccess:false} as const;
const failure=(status:'invalid-input'|'unavailable'|'not-found'|'mismatch'|'stale',reason:string):RegistryAssessment=>Object.freeze({...noAuthority,status,reason});
/** Full raw or full documented mask only; no deletion of arbitrary characters.
 * This algorithm validates syntax/DV, never registry existence. */
export function canonicalRegistryCnpj(value:unknown):string|null{
 if(typeof value!=='string'||value.length>40)return null;
 const text=value.trim();
 if(!/^(?:[A-Za-z0-9]{12}[0-9]{2}|[A-Za-z0-9]{2}\.[A-Za-z0-9]{3}\.[A-Za-z0-9]{3}\/[A-Za-z0-9]{4}-[0-9]{2})$/.test(text))return null;
 const cnpj=text.replace(/[./-]/g,'').toUpperCase();if(/^([0-9])\1{13}$/.test(cnpj))return null;
 for(let size=12;size<=13;size++){let sum=0;for(let i=0;i<size;i++)sum+=(cnpj.charCodeAt(i)-48)*(2+(size-1-i)%8);const rem=sum%11;if(Number(cnpj[size])!==(rem<2?0:11-rem))return null;}
 return cnpj;
}
/** NFC + Unicode case conversion + space separators only. Preserve accents,
 * punctuation and word order. No fuzzy match, transliteration or suffix removal. */
export function registryNameKey(value:unknown):string|null{
 if(typeof value!=='string'||value.length>400||/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value))return null;
 const name=value.normalize('NFC').replace(/\p{Zs}+/gu,' ').trim();
 return name.length>0&&[...name].length<=200?name.toUpperCase():null;
}
export function assessCompanyRegistry(expected:unknown,lookup:unknown,policy:unknown,now:unknown):RegistryAssessment{
 try{
  if(!record(expected)||!exact(expected,['cnpj','name']))return failure('invalid-input','request-shape');
  const {cnpj:rawCnpj,name:rawName}=expected,cnpj=canonicalRegistryCnpj(rawCnpj),nameKey=registryNameKey(rawName);
  if(!cnpj||!nameKey)return failure('invalid-input','request-fields');
  if(!record(policy)||!exact(policy,['version','sourceId','enabled','maxObservationAgeMs']))return failure('unavailable','policy');
  const {version,sourceId,enabled,maxObservationAgeMs}=policy;
  if(!tag(version)||!tag(sourceId)||typeof enabled!=='boolean'||!Number.isSafeInteger(maxObservationAgeMs)||typeof maxObservationAgeMs!=='number'||maxObservationAgeMs<1||maxObservationAgeMs>86400000||!time(now))return failure('unavailable','policy');
  if(!enabled)return failure('unavailable','source-disabled');
  if(!record(lookup))return failure('unavailable','lookup-shape');
  const {kind}=lookup;
  if(kind==='not-found'||kind==='unavailable')return exact(lookup,['kind'])?failure(kind,kind):failure('unavailable','lookup-shape');
  if(kind!=='found'||!exact(lookup,['kind','snapshot']))return failure('unavailable','lookup-shape');
  const {snapshot}=lookup;
  if(!record(snapshot)||!exact(snapshot,['cnpj','legalName','tradeName','registrationStatus','observedAt','sourceId','sourceRequestId']))return failure('unavailable','snapshot-shape');
  const {cnpj:foundCnpj,legalName,tradeName,registrationStatus,observedAt,sourceId:foundSource,sourceRequestId}=snapshot;
  const legalKey=registryNameKey(legalName),emptyTrade=tradeName===null||typeof tradeName==='string'&&/^\p{Zs}*$/u.test(tradeName),tradeKey=emptyTrade?null:registryNameKey(tradeName);
  if(typeof foundCnpj!=='string'||canonicalRegistryCnpj(foundCnpj)!==foundCnpj||!legalKey||!emptyTrade&&!tradeKey
   ||typeof registrationStatus!=='number'||![1,2,3,4,8].includes(registrationStatus)||!time(observedAt)||!uuid(sourceRequestId)||foundSource!==sourceId)return failure('unavailable','snapshot-fields');
  // Fresh observation is not evidence that the provider's underlying dataset
  // is current. Dataset freshness must be reviewed for each operational source.
  if(observedAt>now||now-observedAt>=maxObservationAgeMs)return failure('stale','observation');
  if(foundCnpj!==cnpj)return failure('mismatch','cnpj');
  const matchedBy=nameKey===legalKey?'legal-name':tradeKey!==null&&nameKey===tradeKey?'trade-name':null;
  if(!matchedBy)return failure('mismatch','name');
  return Object.freeze({...noAuthority,status:'matched',cnpj,legalName:legalName as string,officialName:(matchedBy==='legal-name'?legalName:tradeName) as string,nameKey,matchedBy,registrationStatus:registrationStatus as 1|2|3|4|8,observedAt,sourceId,sourceRequestId,policyVersion:version});
 }catch{return failure('unavailable','lookup-unreadable');}
}
