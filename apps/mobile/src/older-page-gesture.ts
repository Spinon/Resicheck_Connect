/** One read page per physical drag; initial layout and programmatic scrolling cannot arm it. */
export function createOlderPageGesture(deps:Readonly<{current:()=>Readonly<{owner:object;firstId:string}>|null;load:()=>Promise<boolean>}>){
 let armed:Readonly<{owner:object;firstId:string}>|null=null,disposed=false;
 return Object.freeze({
  begin(){armed=disposed?null:deps.current();},
  check(offset:number){if(disposed||!armed||!Number.isFinite(offset)||offset<0||offset>48)return false;const captured=armed;armed=null;const now=deps.current();if(!now||now.owner!==captured.owner||now.firstId!==captured.firstId)return false;try{void Promise.resolve(deps.load()).catch(()=>{});}catch{}return true;},
  cancel(){armed=null;},dispose(){disposed=true;armed=null;},
 });
}
