import {graphemeSegments} from 'unicode-segmenter/grapheme';
const fallback='Arquivo selecionado';
// Display metadata only: never renames or edits the selected external file.
export function fileDisplayName(value:unknown):string{
 if(typeof value!=='string'||value.length>4096)return fallback;
 const clean=value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069/\\]/g,'').trim();
 for(const char of clean){const cp=char.codePointAt(0)!;if(cp>=0xd800&&cp<=0xdfff)return fallback;}
 if(!clean)return fallback;
 if(clean.length<=120)return clean;
 let result='';for(const {segment} of graphemeSegments(clean)){if(result.length+segment.length>119)break;result+=segment;}
 return result?result+'…':fallback;
}
