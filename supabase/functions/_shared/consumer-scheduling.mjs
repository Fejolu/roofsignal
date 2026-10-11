// Server-side scheduling decisions. Times and routes must come from a trusted
// calendar/route adapter; never from submitted browser fields.
export const INSPECTION_MINUTES = 45;
export const TRAVEL_MARGIN_MINUTES = 15;
export const BOOKING_TIME_ZONE = 'Europe/Amsterdam';

export function localDay(time) {
  return new Intl.DateTimeFormat('sv-SE', {timeZone: BOOKING_TIME_ZONE, year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
}

function instant(value) {
  const result=typeof value==='number'?value:Date.parse(value);
  if(!Number.isFinite(result))throw Error('INVALID_CALENDAR_TIME');
  return result;
}

export function canFitInspection({start,dayStart,dayEnd,events,routeSeconds,origin,destination,now=Date.now(),existingHold=false}) {
  const begin=instant(start),end=begin+INSPECTION_MINUTES*60000;
  const lower=instant(dayStart),upper=instant(dayEnd);
  if(begin<=now||(!existingHold&&localDay(begin)<=localDay(now))||begin<lower||end>upper)return false;
  const busy=events.filter(e=>e.transparent!==true).map(e=>({...e,start:instant(e.start),end:instant(e.end)}));
  if(busy.some(e=>e.end<=e.start))throw Error('INVALID_CALENDAR_EVENT');
  if(busy.some(e=>e.start<end&&e.end>begin))return false;
  const previous=busy.filter(e=>e.end<=begin).sort((a,b)=>b.end-a.end)[0];
  const next=busy.filter(e=>e.start>=end).sort((a,b)=>a.start-b.start)[0];
  const from=previous?previous.location:origin,to=next?next.location:origin;
  // An event without a usable location cannot safely imply zero travel time.
  if(!from||!to)return false;
  const inbound=routeSeconds(from,destination),outbound=routeSeconds(destination,to);
  if(!Number.isFinite(inbound)||inbound<0||!Number.isFinite(outbound)||outbound<0)return false;
  const margin=TRAVEL_MARGIN_MINUTES*60000;
  return begin>=(previous?previous.end:lower)+inbound*1000+margin
    &&end+outbound*1000+margin<=(next?next.start:upper);
}

export function prioritizeSlots(slots) {
  // Clustering is a preference. Never move already confirmed appointments.
  return [...slots].sort((a,b)=>Number(Boolean(b.recommended))-Number(Boolean(a.recommended))||Date.parse(a.start)-Date.parse(b.start));
}
