export const receivedImageFolder=(s:string)=>/^connect-received-image-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s);
/** Disposable downloaded bytes only. Drafts, other caches and unknown entries
 * are preserved. A live reader owns its folder until release succeeds. */
export function sweepReceivedImages(folders:readonly{name:string;files:()=>readonly{name:string;regular:boolean;remove:()=>void}[];removeEmpty:()=>void}[],active:ReadonlySet<string>){
 let removed=0,failed=0,skipped=0;for(const folder of folders){if(!receivedImageFolder(folder.name)||active.has(folder.name)){skipped++;continue;}try{const files=folder.files();if(files.some(f=>!f.regular||!/^image\.(png|jpg)$/.test(f.name))){skipped++;continue;}for(const f of files){f.remove();removed++;}folder.removeEmpty();}catch{failed++;}}return Object.freeze({removed,failed,skipped});
}
