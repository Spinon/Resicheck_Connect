const uuid=(v:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
/** Session-object owned, bounded memory only. No credentials, storage or sending. */
export function createSessionDrafts(){
 let owner:object|null=null;const drafts=new Map<string,string>();
 const clear=()=>{drafts.clear();owner=null;};
 return Object.freeze({clear,bind(next:object){if(owner!==next){clear();owner=next;}},
 save(who:object,company:string,conversation:string,text:string){if(owner!==who||!uuid(company)||!uuid(conversation)||typeof text!=='string'||!text||text.length>65536)return false;const key=company+'/'+conversation;if(!drafts.has(key)&&drafts.size>=20)return false;let size=text.length;for(const[k,v]of drafts)if(k!==key)size+=v.length;if(size>131072)return false;drafts.set(key,text);return true;},
 take(who:object,company:string,conversation:string){if(owner!==who)return null;const key=company+'/'+conversation,value=drafts.get(key)??null;drafts.delete(key);return value;}
 });
}
