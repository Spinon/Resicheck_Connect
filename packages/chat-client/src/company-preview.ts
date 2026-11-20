import{canonicalRegistryCnpj}from'../../access/src/company-registry.ts';
export type CompanyPreview=Readonly<{state:'not-found';cnpj:string}>|Readonly<{state:'found';cnpj:string;suggestions:Readonly<{name:string;address?:string;phone?:string}>;registrationStatus:1|2|3|4|8;datasetMonth:string;representationVerified:false}>;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>Reflect.ownKeys(v).length===keys.length&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&keys.includes(k));
const text=(v:unknown,n:number):v is string=>typeof v==='string'&&[...v].length<=n&&/\S/u.test(v)&&!/[\u0000-\u001f\u007f-\u009f]/u.test(v);
const fail=()=>{throw Error('Company preview unavailable');};
export function companyPreviewBody(cnpj:string){if(canonicalRegistryCnpj(cnpj)!==cnpj)return fail();return JSON.stringify({p_cnpj:cnpj});}
export function decodeCompanyPreview(value:unknown,cnpj:string):CompanyPreview{
 if(canonicalRegistryCnpj(cnpj)!==cnpj||!object(value)||value.cnpj!==cnpj)return fail();
 if(value.state==='not-found'){if(!exact(value,['state','cnpj']))return fail();return Object.freeze({state:'not-found',cnpj});}
 if(value.state!=='found'||!exact(value,['state','cnpj','suggestions','registrationStatus','datasetMonth','representationVerified'])||value.representationVerified!==false||![1,2,3,4,8].includes(value.registrationStatus as number)||typeof value.datasetMonth!=='string'||!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value.datasetMonth)||!object(value.suggestions))return fail();
 const s=value.suggestions;if(!Object.hasOwn(s,'name')||Reflect.ownKeys(s).some(k=>typeof k!=='string'||!['name','address','phone'].includes(k))||!text(s.name,160)||s.address!==undefined&&!text(s.address,500)||s.phone!==undefined&&!text(s.phone,80))return fail();
 return Object.freeze({state:'found',cnpj,suggestions:Object.freeze({name:s.name,...(s.address!==undefined?{address:s.address as string}:{}),...(s.phone!==undefined?{phone:s.phone as string}:{})}),registrationStatus:value.registrationStatus as 1|2|3|4|8,datasetMonth:value.datasetMonth,representationVerified:false});
}
