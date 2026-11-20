import{createCompanyPreviewRuntime}from'../../deployment/company-registry-managed-runtime/preview-runtime.ts';
import{createMinhaReceitaPreviewSource}from'../../workers/company-registry/minha-receita-preview.ts';
type Options=Omit<NonNullable<Parameters<typeof createCompanyPreviewRuntime>[0]>,'source'>;
/** Reviewed candidate composition, no listener, environment access or I/O on import.
 * A future Edge adapter must enforce verify_jwt=true and explicitly supply runtime ports.
 * It never loads a service/admin key. OFF unless both independent flags are true. */
export function createCompanyPreviewCandidate(options:Options={}){
 if(options.enabled!==true||options.gatewayJwtRequired!==true)return createCompanyPreviewRuntime();
 const source=createMinhaReceitaPreviewSource({enabled:true,fetch:options.fetch!,now:options.now!,schedule:options.schedule!,maxDatasetAgeDays:62,freshnessPolicy:'calendar-month-v1'});
 try{return createCompanyPreviewRuntime({...options,source});}catch(e){source.dispose();throw e;}
}
export default createCompanyPreviewCandidate();
