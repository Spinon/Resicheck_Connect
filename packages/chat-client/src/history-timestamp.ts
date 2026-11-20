// Shared strict wire timestamp parser; preserves the existing millisecond/epoch contract.
export function parseHistoryTimestamp(value:string):number|null{
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if(!match||match[0]!==value)return null;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),hour=Number(match[4]),minute=Number(match[5]),second=Number(match[6]);
  const offsetHour=Number(match[10]??0),offsetMinute=Number(match[11]??0),leap=year%4===0&&(year%100!==0||year%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(month<1||month>12||day<1||day>days[month-1]||hour>23||minute>59||second>59||offsetHour>23||offsetMinute>59)return null;
  // Validate the local calendar before converting offsets; Date.parse may
  // normalize impossible dates. Keep the existing millisecond representation,
  // truncating (not rounding) the allowed one through six fractional digits.
  const wallClock=new Date(0);wallClock.setUTCFullYear(year,month-1,day);wallClock.setUTCHours(hour,minute,second,Number((match[7]??'').slice(0,3).padEnd(3,'0')));
  const offset=(offsetHour*60+offsetMinute)*(match[9]==='-'?-1:1),acceptedAt=wallClock.getTime()-offset*60000;
  return Number.isSafeInteger(acceptedAt)&&acceptedAt>=0?acceptedAt:null;
}

