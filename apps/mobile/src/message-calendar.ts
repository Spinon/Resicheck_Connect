/** Display only: use the device calendar, never infer delivery or read receipts. */
export function messageCalendar(acceptedAt:number){
 const date=new Date(acceptedAt);
 if(!Number.isFinite(acceptedAt)||!Number.isFinite(date.getTime()))return null;
 const day=String(date.getDate()).padStart(2,'0'),month=String(date.getMonth()+1).padStart(2,'0'),year=String(date.getFullYear()).padStart(4,'0');
 const time=String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0');
 const label=day+'/'+month+'/'+year;
 return Object.freeze({day:label,time,accessible:label+' \u00e0s '+time});
}
export function messageDayHeading(acceptedAt:number,previousAcceptedAt?:number){
 const current=messageCalendar(acceptedAt);if(!current)return null;
 return current.day===messageCalendar(previousAcceptedAt??NaN)?.day?null:current.day;
}
