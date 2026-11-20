import {normalizeRegistrationIdentifier} from './registration-identifiers.ts';
export type ProfileForm = Readonly<{ name: string; cpf: string }>;
export type CompanyForm = Readonly<{ name: string; cnpj: string; address: string; phone: string }>;
export type CredentialsForm=Readonly<{email:string;password:string}>;
export type RegistrationField='email'|'password'|'name'|'cpf'|'cnpj'|'address'|'phone';
type Result<T> = Readonly<{ ok: true; value: T } | { ok: false; error: string;field:RegistrationField }>;
const fail = (field:RegistrationField,error: string) => Object.freeze({ ok: false as const,field,error });
const pass = <T>(value: T): Result<T> => Object.freeze({ ok: true, value: Object.freeze(value) });
const text = (v: unknown, max: number, required = true): v is string => typeof v === 'string'
  && !/[\u0000-\u001f\u007f]/.test(v) && [...v].length <= max && (!required || /\S/u.test(v));
const trim = (v: unknown) => typeof v === 'string' ? v.replace(/^ +| +$/g, '') : '';
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const dv = (sum: number) => sum % 11 < 2 ? 0 : 11 - sum % 11;
export function validateCredentials(input:CredentialsForm):Result<CredentialsForm>{
  const email=typeof input.email==='string'?input.email.trim():'';
  if(email.length>320||!/^[^\s@]+@[^\s@]+$/.test(email)||/[\u0000-\u001f\u007f]/.test(email))return fail('email','Informe um e-mail válido.');
  if(typeof input.password!=='string'||!input.password||input.password.length>1024)return fail('password','Informe sua senha, com até 1.024 caracteres.');
  return pass({email,password:input.password});
}
export function validateProfile(input: ProfileForm): Result<ProfileForm> {
  const name=trim(input.name), raw=typeof input.cpf==='string'?input.cpf:'';
  const cpf=normalizeRegistrationIdentifier('cpf',raw)??raw;
  if (!text(name,120)) return fail('name','Informe seu nome em uma linha, com até 120 caracteres.');
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return fail('cpf','Confira os 11 dígitos do CPF.');
  for(let size=9;size<=10;size++){let sum=0;for(let i=0;i<size;i++)sum+=Number(cpf[i])*(size+1-i);if(dv(sum)!==Number(cpf[size]))return fail('cpf','Confira os dígitos verificadores do CPF.');}
  return pass({name,cpf});
}
export function validateCompany(input: CompanyForm): Result<CompanyForm> {
  const name=trim(input.name),address=trim(input.address),phone=trim(input.phone),raw=typeof input.cnpj==='string'?input.cnpj:'';
  // Only the documented mask is removed. Arbitrary punctuation/Unicode is not normalized into a valid identifier.
  const canonical=normalizeRegistrationIdentifier('cnpj',raw)??raw;
  if(!text(name,160))return fail('name','Informe o nome da empresa em uma linha, com até 160 caracteres.');
  if(!/^[A-Za-z0-9]{12}\d{2}$/.test(canonical))return fail('cnpj','Confira as 14 posições do CNPJ.');
  const cnpj=canonical.toUpperCase();
  if(!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)||/^(\d)\1{13}$/.test(cnpj))return fail('cnpj','Confira as 14 posições do CNPJ.');
  const weights=[5,4,3,2,9,8,7,6,5,4,3,2];
  for(let size=12;size<=13;size++){const w=size===12?weights:[6,...weights];let sum=0;for(let i=0;i<size;i++)sum+=(cnpj.charCodeAt(i)-48)*w[i]!;if(dv(sum)!==Number(cnpj[size]))return fail('cnpj','Confira os dígitos verificadores do CNPJ.');}
  if(!text(address,500,false))return fail('address','Use um endereço em uma linha, com até 500 caracteres.');
  if(!text(phone,80,false))return fail('phone','Use um telefone em uma linha, com até 80 caracteres.');
  return pass({name,cnpj,address,phone});
}
export type RegistrationState = 'pending' | 'approved' | 'rejected';
export type ProfileStatus = Readonly<{ kind:'not_started'; chatAllowed:false } | { kind:'profile'; name:string; state:RegistrationState; identity:'unconfirmed'|'confirmed'|'disputed'; chatAllowed:false }>;
export type CompanyStatus = Readonly<{ cnpj?:string; name:string; address:string; phone:string; state:RegistrationState; representation:'unconfirmed'|'confirmed'|'disputed'; chatAllowed:false }>;
const state=(v:unknown):v is RegistrationState=>v==='pending'||v==='approved'||v==='rejected';
const verification=(v:unknown):v is 'unconfirmed'|'confirmed'|'disputed'=>v==='unconfirmed'||v==='confirmed'||v==='disputed';
// These DTOs display a status only. They never grant chat/business access.
// Subject/request matching supplements server authorization; it cannot replace RLS.
export function projectProfileStatus(raw:unknown, expectedUserId:string):ProfileStatus|null {
  if(!uuid(expectedUserId)||!record(raw))return null;
  if(raw.registration_state==='not_started')return Object.keys(raw).length===1?Object.freeze({kind:'not_started',chatAllowed:false}):null;
  if(raw.profile_id!==expectedUserId||!text(raw.display_name,120)||!state(raw.registration_state)||!verification(raw.identity_state))return null;
  return Object.freeze({kind:'profile',name:raw.display_name,state:raw.registration_state,identity:raw.identity_state,chatAllowed:false});
}
export function projectCompanyStatus(raw:unknown, expectedRequestId:string):CompanyStatus|null {
  if(!uuid(expectedRequestId)||!record(raw)||raw.request_id!==expectedRequestId||!uuid(raw.company_id)||!text(raw.name,160)||!text(raw.address,500,false)||!text(raw.phone,80,false)||!state(raw.registration_state)||!verification(raw.representation_state))return null;
  let cnpj:string|undefined;if(raw.cnpj!==undefined){if(typeof raw.cnpj!=='string'||!/^[A-Z0-9]{12}[0-9]{2}$/.test(raw.cnpj))return null;const checked=validateCompany({name:raw.name,cnpj:raw.cnpj,address:raw.address,phone:raw.phone});if(!checked.ok)return null;cnpj=checked.value.cnpj;}
  return Object.freeze({...(cnpj?{cnpj}:{}),name:raw.name,address:raw.address,phone:raw.phone,state:raw.registration_state,representation:raw.representation_state,chatAllowed:false});
}
