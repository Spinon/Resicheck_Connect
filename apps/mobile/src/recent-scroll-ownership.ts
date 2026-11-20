/** Distinguishes our nonanimated positioning from native/user accessibility scroll.
 * Coordinates are React Native layout units. No timers or accessibility override.
 * An unrecognised/intermediate native movement conservatively stops following.
 */
export function isOwnedScrollResize(result:'inactive'|'stationary'|'command'|'external',previousHeight:number,previousContentHeight:number,height:number,contentHeight:number):boolean{
  return (result==='command'||result==='stationary')&&[previousHeight,previousContentHeight,height,contentHeight].every(Number.isFinite)
    &&height>0&&contentHeight>0&&(height!==previousHeight||contentHeight!==previousContentHeight);
}
export function createRecentScrollOwnership(){
  type Ticket=Readonly<{generation:number}>;
  let generation=0,owner:Ticket|null=null,offset=0,pending:number[]=[];
  const finite=(n:number)=>Number.isFinite(n)&&n>=0;
  const clamp=(n:number,max:number)=>Math.max(0,Math.min(max,n));
  const same=(a:number,b:number)=>Math.abs(a-b)<=1; // native pixel/layout-unit rounding
  return {
    arm(initialOffset:number):Ticket {owner=Object.freeze({generation:++generation});offset=finite(initialOffset)?initialOffset:0;pending=[];return owner;},
    retire(){owner=null;pending=[];generation++;},
    settled(ticket:Ticket,maxOffset?:number){if(ticket!==owner)return false;
      // A settled measurement can precede an earlier issued native scroll ACK.
      // Retain only reachable, still-unacknowledged destinations. Never grant
      // credit to unreachable clamped originals or a command from another owner.
      pending=typeof maxOffset==='number'&&finite(maxOffset)?pending.filter(target=>target<=maxOffset+1):[];return true;},
    command(ticket:Ticket,target:number,maxOffset:number){
      if(ticket!==owner||!finite(target)||!finite(maxOffset))return false;
      const destination=clamp(target,maxOffset);
      // More than one nonanimated command may reach native before its scroll
      // events reach JS. Do not mistake an earlier own acknowledgement for AX.
      if(pending.some(value=>same(value,destination)))return true;
      if(pending.length>=16)return false;
      pending.push(destination);return true;
    },
    observe(ticket:Ticket|null,next:number,maxOffset:number):'inactive'|'stationary'|'command'|'external'{
      if(!ticket||ticket!==owner)return 'inactive';
      if(!finite(next)||!finite(maxOffset)){owner=null;pending=[];return 'external';}
      const previous=clamp(offset,maxOffset);let ack=-1;
      for(let i=0;i<pending.length;i++)if(same(next,clamp(pending[i],maxOffset)))ack=i;
      // A temporary extent can clamp a pending native destination, then native
      // onLayout restores the original after content grows. Keep only those
      // unreachable originals; a clamp is not proof their positioning finished.
      // Fully reachable/coalesced destinations are consumed, never AX credit.
      if(ack!==-1){offset=next;pending=pending.filter((target,index)=>index>ack||target>maxOffset+1);return 'command';}
      // A native clamp caused by a smaller content/viewport extent is not a user action.
      // Keep the baseline: repeated fractional steps must not hide real travel.
      if(same(next,previous)){offset=previous;return 'stationary';}
      owner=null;pending=[];return 'external';
    },
  };
}
