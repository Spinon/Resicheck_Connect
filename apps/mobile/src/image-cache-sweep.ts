export const imageFolderOwned=(s:string)=>/^connect-image-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
export const imageFileOwned=(s:string)=>/^(source|optimized)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|pdf)$/.test(s)||/^flatten-source-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/.test(s);
// Single-foreground-editor cache only. No message/download storage is placed
// here. Unknown files/subdirectories and live scopes are never deleted.
export function sweepImageCache(folders:readonly {name:string;files:()=>readonly {name:string;regular:boolean;remove:()=>void}[];removeEmpty:()=>void}[],active:ReadonlySet<string>){
 let removed=0,failed=0,skipped=0;for(const folder of folders){if(!imageFolderOwned(folder.name)||active.has(folder.name)){skipped++;continue;}try{const files=folder.files();if(files.some(f=>!f.regular||!imageFileOwned(f.name))){skipped++;continue;}for(const file of files){file.remove();removed++;}folder.removeEmpty();}catch{failed++;}}
 return Object.freeze({removed,failed,skipped});
}
