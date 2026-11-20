export type PatientCompanyLinkIntent=Readonly<{version:1;companyId:string}>;
const prefix='/v1/patient-companies/';
const fail=()=>new Error('Company link unavailable');
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
// Trusted deployment configuration only, never an origin supplied by the link.
// This is a public company locator, not an invitation or authorization token.
export function createPatientCompanyLinkCodec(options:Readonly<{origin:string}>){
 let origin:string;
 try{
  const value=options.origin;
  if(typeof value!=='string'||value.length>512||!/^[\x21-\x7e]+$/.test(value))throw fail();
  const u=new URL(value),labels=u.hostname.split('.');
  if(u.protocol!=='https:'||u.origin!==value||u.username||u.password||u.port||u.hostname.length>253||labels.length<2||/^[0-9.]+$/.test(u.hostname)||!labels.every(x=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x)))throw fail();
  origin=value;
 }catch{throw fail();}
 function encode(input:Readonly<{companyId:string}>):string{
  try{
   if(!input||typeof input!=='object'||Reflect.ownKeys(input).length!==1||!Object.hasOwn(input,'companyId'))throw fail();
   const {companyId}=input;if(!uuid(companyId))throw fail();return origin+prefix+companyId;
  }catch{throw fail();}
 }
 function parse(input:unknown):PatientCompanyLinkIntent{
  try{
   if(typeof input!=='string'||input.length>1024||!/^[\x21-\x7e]+$/.test(input)||/[?#%\\]/.test(input))throw fail();
   const u=new URL(input);
   if(u.origin!==origin||u.href!==input||u.username||u.password||u.search||u.hash||!u.pathname.startsWith(prefix))throw fail();
   const companyId=u.pathname.slice(prefix.length);
   if(!uuid(companyId)||encode({companyId})!==input)throw fail();
   return Object.freeze({version:1,companyId});
  }catch{throw fail();}
 }
 return Object.freeze({encode,parse});
}
