/** DOM attention only. Geometry and dwell are verified separately.
 * This does not detect assistive technology or claim cognitive reading. */
export function webReadingAllowed(d:Pick<Document,'visibilityState'|'hasFocus'|'activeElement'>):boolean{
 if(d.visibilityState!=='visible'||!d.hasFocus())return false;
 const e=d.activeElement as HTMLElement|null;
 return !e||!(e.tagName==='INPUT'||e.tagName==='TEXTAREA'||e.isContentEditable);
}
