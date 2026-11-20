import{canonicalRegistryCnpj}from'../../../packages/access/src/company-registry.ts';
import{decodeCompanyPreview,type CompanyPreview}from'../../../packages/chat-client/src/company-preview.ts';
export type PreviewFields=Readonly<{cnpj:string;name:string;address:string;phone:string}>;
type Field='name'|'address'|'phone';type Capture=Readonly<{generation:number;cnpj:string}>;
/** Local form only. No I/O, storage or authority. Explicit/manual edits always win. */
export function createCompanyPreviewDraft(initial:PreviewFields){
 let values={...initial},generation=0;
 const manual:Record<Field,boolean>={name:!!initial.name,address:!!initial.address,phone:!!initial.phone},automatic:Record<Field,boolean>={name:false,address:false,phone:false};
 const fields:Field[]=['name','address','phone'];
 function discardAutomatic(){for(const f of fields){if(automatic[f]&&!manual[f])values[f]='';automatic[f]=false;}}
 return Object.freeze({
  values:():PreviewFields=>Object.freeze({...values}),
  edit(field:keyof PreviewFields,value:string){
   if(field==='cnpj'){const a=canonicalRegistryCnpj(values.cnpj),b=canonicalRegistryCnpj(value);if(a!==b||a===null&&values.cnpj!==value){generation++;discardAutomatic();}values.cnpj=value;}
   else{values[field]=value;manual[field]=true;automatic[field]=false;}
   return Object.freeze({...values});
  },
  begin():Capture|null{const cnpj=canonicalRegistryCnpj(values.cnpj);if(!cnpj)return null;generation++;discardAutomatic();return Object.freeze({generation,cnpj});},
  apply(captured:Capture,raw:CompanyPreview){if(captured.generation!==generation||canonicalRegistryCnpj(values.cnpj)!==captured.cnpj)return Object.freeze({accepted:false,fields:Object.freeze([] as Field[]),values:Object.freeze({...values})});
   const response=decodeCompanyPreview(raw,captured.cnpj),applied:Field[]=[];
   if(response.state==='found')for(const f of fields){const suggested=response.suggestions[f];if(suggested!==undefined&&!manual[f]&&!values[f]){values[f]=suggested;automatic[f]=true;applied.push(f);}}
   return Object.freeze({accepted:true,fields:Object.freeze(applied),values:Object.freeze({...values})});
  },
  cancel(){generation++;}
 });
}
