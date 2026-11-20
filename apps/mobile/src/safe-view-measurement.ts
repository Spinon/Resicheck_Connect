export type MeasurableView={measureInWindow:(done:(x:number,y:number,width:number,height:number)=>void)=>void};
/** UI-only measurement. Retired/removed native views cannot throw through a
 * timer/RAF or publish geometry into a new owner. No authorization is granted. */
export function safelyMeasureView(node:MeasurableView|null,current:()=>boolean,done:(x:number,y:number,width:number,height:number)=>void):boolean{
 const live=()=>{try{return current()===true;}catch{return false;}};
 if(!node||!live())return false;
 try{node.measureInWindow((x,y,w,h)=>{if(live())done(x,y,w,h);});return true;}catch{return false;}
}
