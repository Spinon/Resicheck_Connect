export type RegistrationIdentifier='cpf'|'cnpj';
export type IdentifierSelection=Readonly<{start:number;end:number}>;
export type IdentifierAnalysis=Readonly<{
 canonical:string|null;complete:boolean;
 issue:null|'unsupported-character'|'too-long'|'check-digit-character';
}>;
export type IdentifierEditor=Readonly<{
 text:string;selection:IdentifierSelection;
 /** One native selection notification may still refer to pre-format text. */
 pendingNativeSelection:IdentifierSelection|null;
}>;
const maximum=(kind:RegistrationIdentifier)=>kind==='cpf'?11:14;
const separator=(kind:RegistrationIdentifier,char:string)=>kind==='cpf'?char==='.'||char==='-':char==='.'||char==='/'||char==='-';
const asciiUpper=(text:string)=>text.replace(/[a-z]/g,char=>String.fromCharCode(char.charCodeAt(0)-32));
const point=(position:number)=>Object.freeze({start:position,end:position});
const same=(a:IdentifierSelection,b:IdentifierSelection)=>a.start===b.start&&a.end===b.end;
function selection(value:IdentifierSelection,length:number):IdentifierSelection{
 const bound=(n:number)=>Number.isFinite(n)?Math.max(0,Math.min(length,Math.floor(n))):0;
 const start=bound(value.start),end=bound(value.end);return Object.freeze({start:Math.min(start,end),end:Math.max(start,end)});
}
const compact=(kind:RegistrationIdentifier,text:string)=>text.replace(kind==='cpf'?/[.-]/g:/[.\/-]/g,'');

/** Shape analysis only. Check digits and identity stay with the existing domain
 * validator/backend. Only ASCII mask separators are removed; no trim, Unicode
 * digit conversion, character filtering, truncation or Unicode uppercasing. */
export function analyzeRegistrationIdentifier(kind:RegistrationIdentifier,text:string):IdentifierAnalysis{
 const normalized=kind==='cnpj'?asciiUpper(text):text;
 if(!(kind==='cpf'?/^[0-9.-]*$/:/^[A-Z0-9.\/-]*$/).test(normalized))return Object.freeze({canonical:null,complete:false,issue:'unsupported-character'});
 const canonical=compact(kind,normalized);
 if(canonical.length>maximum(kind))return Object.freeze({canonical:null,complete:false,issue:'too-long'});
 const badCheck=kind==='cnpj'&&canonical.length>12&&!/^[0-9]*$/.test(canonical.slice(12));
 return Object.freeze({canonical,complete:canonical.length===maximum(kind)&&!badCheck,issue:badCheck?'check-digit-character':null});
}

/** Complete raw value or the exact documented full mask. Does not validate DV.
 * The editable formatter may reposition separators, while payload admission
 * remains strict and always returns 11 CPF digits or canonical 12+2 CNPJ. */
export function normalizeRegistrationIdentifier(kind:RegistrationIdentifier,text:string):string|null{
 const shape=kind==='cpf'?/^(?:[0-9]{11}|[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2})$/:/^(?:[A-Za-z0-9]{12}[0-9]{2}|[A-Za-z0-9]{2}\.[A-Za-z0-9]{3}\.[A-Za-z0-9]{3}\/[A-Za-z0-9]{4}-[0-9]{2})$/;
 if(!shape.test(text))return null;
 const analysis=analyzeRegistrationIdentifier(kind,text);return analysis.complete?analysis.canonical:null;
}

export function formatRegistrationIdentifier(kind:RegistrationIdentifier,text:string):string{
 const analysis=analyzeRegistrationIdentifier(kind,text);
 // Invalid characters/overflow stay visible so editing cannot turn them into a
 // different valid identifier. ASCII CNPJ letters alone can change case.
 if(analysis.canonical===null)return kind==='cnpj'?asciiUpper(text):text;
 const breaks=kind==='cpf'?new Map([[3,'.'],[6,'.'],[9,'-']]):new Map([[2,'.'],[5,'.'],[8,'/'],[12,'-']]);
 let formatted='';for(let index=0;index<analysis.canonical.length;index++)formatted+=(breaks.get(index)??'')+analysis.canonical[index];return formatted;
}

export function createIdentifierEditor():IdentifierEditor{return Object.freeze({text:'',selection:point(0),pendingNativeSelection:null});}

/** An explicit pointer gesture starts a user selection. Its caret must not be
 * mistaken for a pending native pre-format caret with the same numeric offset. */
export function beginRegistrationIdentifierSelection(previous:IdentifierEditor):IdentifierEditor{
 return previous.pendingNativeSelection===null?previous:Object.freeze({...previous,pendingNativeSelection:null});
}

function describeEdit(previous:IdentifierEditor,nextText:string){
 const old=previous.text,range=selection(previous.selection,old.length),difference=nextText.length-old.length;
 const replacementLength=nextText.length-(old.length-(range.end-range.start));
 if(replacementLength>=0&&nextText.slice(0,range.start)===old.slice(0,range.start)&&nextText.slice(range.start+replacementLength)===old.slice(range.end))return {start:range.start,end:range.end,inserted:nextText.slice(range.start,range.start+replacementLength)};
 if(range.start===range.end&&difference<0){
  const removed=-difference;
  if(range.start>=removed&&old.slice(0,range.start-removed)+old.slice(range.start)===nextText)return {start:range.start-removed,end:range.start,inserted:''};
  if(old.slice(0,range.start)+old.slice(range.start+removed)===nextText)return {start:range.start,end:range.start+removed,inserted:''};
 }
 // Selection anchored matching above disambiguates repeated digits. This
 // fallback also handles IME replacement when native reports another range.
 let start=0;while(start<old.length&&start<nextText.length&&old[start]===nextText[start])start++;
 let end=old.length,nextEnd=nextText.length;while(end>start&&nextEnd>start&&old[end-1]===nextText[nextEnd-1]){end--;nextEnd--;}
 return {start,end,inserted:nextText.slice(start,nextEnd)};
}

function mapPosition(kind:RegistrationIdentifier,source:string,offset:number,formatted:string){
 let count=0;for(let index=0;index<offset;index++)if(!separator(kind,source[index]!))count++;
 if(count===0)return 0;
 let seen=0;for(let index=0;index<formatted.length;index++)if(!separator(kind,formatted[index]!)){
  if(++seen===count){let mapped=index+1;if(offset>0&&separator(kind,source[offset-1]!))while(mapped<formatted.length&&separator(kind,formatted[mapped]!))mapped++;return mapped;}
 }
 return formatted.length;
}

/** Native text replacement + previous UTF-16 selection -> display/selection.
 * Collapsed backspace/Delete that removes only a generated separator removes
 * one adjacent data character, rather than trapping the caret on punctuation.
 * A range selection containing punctuation follows normal replacement rules. */
export function editRegistrationIdentifier(kind:RegistrationIdentifier,previous:IdentifierEditor,nativeText:string,nativeSelection?:IdentifierSelection):IdentifierEditor{
 if(nativeText===previous.text&&!nativeSelection)return previous;
 const edit=describeEdit(previous,nativeText),oldSelection=selection(previous.selection,previous.text.length);
 let source=nativeText,nativeRange=selection(nativeSelection??point(edit.start+edit.inserted.length),nativeText.length),targetRange=nativeRange;
 const removed=previous.text.slice(edit.start,edit.end);
 const generated=analyzeRegistrationIdentifier(kind,previous.text).canonical!==null&&formatRegistrationIdentifier(kind,previous.text)===previous.text;
 if(generated&&oldSelection.start===oldSelection.end&&edit.inserted===''&&removed.length===1&&separator(kind,removed)){
  const backwards=oldSelection.start===edit.end,forwards=oldSelection.start===edit.start;
  const adjacent=backwards?edit.start-1:forwards?edit.end:-1;
  if(adjacent>=0&&adjacent<previous.text.length&&!separator(kind,previous.text[adjacent]!)){
   const start=backwards?adjacent:edit.start,end=backwards?edit.end:adjacent+1;
   source=previous.text.slice(0,start)+previous.text.slice(end);targetRange=point(start);
  }
 }
 const formatted=formatRegistrationIdentifier(kind,source),analysis=analyzeRegistrationIdentifier(kind,source);
 const mapped=analysis.canonical===null?selection(targetRange,formatted.length):Object.freeze({start:mapPosition(kind,source,targetRange.start,formatted),end:mapPosition(kind,source,targetRange.end,formatted)});
 return Object.freeze({text:formatted,selection:mapped,pendingNativeSelection:same(nativeRange,mapped)?null:nativeRange});
}

/** Ignore at most one pending native caret for the pre-format string. The next
 * genuine selection remains editable even when native emits no programmatic
 * acknowledgement. This contract does not replace native Android validation. */
export function selectRegistrationIdentifier(previous:IdentifierEditor,nativeSelection:IdentifierSelection):IdentifierEditor{
 if(previous.pendingNativeSelection&&same(previous.pendingNativeSelection,nativeSelection))return Object.freeze({...previous,pendingNativeSelection:null});
 const next=selection(nativeSelection,previous.text.length);
 if(same(next,previous.selection)&&previous.pendingNativeSelection===null)return previous;
 return Object.freeze({...previous,selection:next,pendingNativeSelection:null});
}
