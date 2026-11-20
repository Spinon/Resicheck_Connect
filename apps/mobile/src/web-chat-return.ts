// Web presentation return only. Every list read still authorizes its own context.
export async function restoreWebStaffInbox(options:Readonly<{companyId:string;query:string;onlyUnread:boolean;current:()=>boolean;back:()=>Promise<boolean>;loadInbox:(companyId:string,query:string,onlyUnread:boolean)=>Promise<boolean>;fallback:()=>void}>):Promise<boolean>{
 const {companyId,query,onlyUnread,current,back,loadInbox,fallback}=options;
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(companyId)||typeof query!=='string'||[...query].length>80||typeof onlyUnread!=='boolean'||!current())return false;
 try{
  const ready=await back();if(!current())return false;if(!ready){fallback();return false;}
  const loaded=await loadInbox(companyId,query,onlyUnread);if(!current())return false;if(!loaded)fallback();return loaded;
 }catch{if(current())fallback();return false;}
}
