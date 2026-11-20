type ComposerKey=Readonly<{defaultPrevented?:boolean;nativeEvent:Readonly<{key:string;shiftKey?:boolean;ctrlKey?:boolean;altKey?:boolean;metaKey?:boolean;repeat?:boolean;isComposing?:boolean;keyCode?:number}>;preventDefault:()=>void}>;
/** RN Web forwards the DOM keydown event through TextInput.onKeyPress.
 * Keep IME commit and modified Enter native; suppress key repeat, never retry.
 * The owning view must still check its current host and send eligibility. */
export function handleWebComposerKey(event:ComposerKey,submit:()=>void):boolean{
 const key=event.nativeEvent;
 if(event.defaultPrevented||key.key!=='Enter'||key.shiftKey||key.ctrlKey||key.altKey||key.metaKey||key.isComposing||key.keyCode===229)return false;
 event.preventDefault();
 if(!key.repeat)submit();
 return true;
}
