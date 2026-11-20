// Candidate administrative read contract only. No transport, grant, decision or UI wiring.
export const signupReviewScopes=Object.freeze(['profile_identity','company_registry','company_representation'] as const);
export type SignupReviewScope=typeof signupReviewScopes[number];
export type AdminSignupReviewQuery=Readonly<{scope:SignupReviewScope;after:string|null;limit:number}>;
export type AdminSignupReviewPage=Readonly<{scope:SignupReviewScope;items:readonly Readonly<{requestId:string;subjectId:string;companyId:string|null}>[];nextAfter:string|null}>;
const fail=():never=>{throw Error('Administrative review unavailable');};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
const scope=(v:unknown):v is SignupReviewScope=>typeof v==='string'&&(signupReviewScopes as readonly string[]).includes(v);
function snapshot(query:AdminSignupReviewQuery):AdminSignupReviewQuery{
 if(!query||typeof query!=='object')return fail();
 const {scope:which,after,limit}=query;
 if(!scope(which)||(after!==null&&!uuid(after))||!Number.isInteger(limit)||limit<1||limit>50)return fail();
 return Object.freeze({scope:which,after,limit});
}
export function adminSignupReviewPayload(query:AdminSignupReviewQuery):Readonly<{name:'admin_signup_review_page';body:string}>{
 const {scope:which,after,limit}=snapshot(query);
 return Object.freeze({name:'admin_signup_review_page',body:JSON.stringify({p_scope:which,p_after:after,p_limit:limit})});
}
function record(raw:unknown,fields:readonly string[]):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return fail();
 const keys=Reflect.ownKeys(raw);
 if(keys.length!==fields.length||keys.some(k=>typeof k!=='string'||!fields.includes(k)))return fail();
 return raw as Record<string,unknown>;
}
// IDs identify review work; they confer no authority. Cursor anchors are subject
// IDs for profiles and company IDs for companies. Corporate request IDs are only
// unique within a requester; pending profile HMAC request IDs are globally unique.
// A closed anchor requires a fresh first page. This is a live list, not a snapshot.
export function decodeAdminSignupReviewPage(raw:unknown,query:AdminSignupReviewQuery):AdminSignupReviewPage{
 const expected=snapshot(query),v=record(raw,['scope','items','next_after']);
 const {scope:which,items:rawItems,next_after:next}=v;
 if(which!==expected.scope||!Array.isArray(rawItems)||rawItems.length>expected.limit||(next!==null&&!uuid(next)))return fail();
 const items:Readonly<{requestId:string;subjectId:string;companyId:string|null}>[]=[];
 let previous=expected.after;
 for(const rawItem of rawItems){
  const value=record(rawItem,['request_id','subject_id','company_id']);
  const {request_id:requestId,subject_id:subjectId,company_id:companyId}=value;
  if(!uuid(requestId)||!uuid(subjectId))return fail();
  if(expected.scope==='profile_identity'?companyId!==null:!uuid(companyId))return fail();
  const anchor=expected.scope==='profile_identity'?subjectId:companyId as string;
  if(previous!==null&&anchor<=previous)return fail();
  previous=anchor;
  items.push(Object.freeze({requestId,subjectId,companyId:companyId as string|null}));
 }
 if(next!==null&&(items.length!==expected.limit||previous!==next))return fail();
 return Object.freeze({scope:expected.scope,items:Object.freeze(items),nextAfter:next});
}
