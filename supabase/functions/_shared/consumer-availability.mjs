import {canFitInspection,prioritizeSlots,INSPECTION_MINUTES} from './consumer-scheduling.mjs';

const location=value=>typeof value==='string'&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)?value.trim().replace(/\s*[\r\n]+\s*/g,', ').replace(/[\t ]+/g,' '):'';
const key=(from,to)=>JSON.stringify([from,to]);

// Calculate with the same policy used by the locked Google checkout. Context
// and routes are server-only; the returned object contains no event details.
export async function planAvailability({context,destination,route,now=Date.now(),concurrency=8}) {
  const pairs=new Map(),routes=new Map(),candidates=[];
  const requestRoute=(from,to)=>{
    from=location(from);to=location(to);
    if(!from||!to||from.length>250||to.length>250)return NaN;
    if(from===to)return 0;
    const id=key(from,to);
    if(!pairs.has(id))pairs.set(id,{from,to});
    return 0;
  };
  requestRoute(context.origin,destination);
  for(const day of context.days) {
    const events=context.events.filter(e=>Date.parse(e.start)<Date.parse(day.upper)&&Date.parse(e.end)>Date.parse(day.lower));
    for(let start=Date.parse(day.start);start+INSPECTION_MINUTES*60000<=Date.parse(day.end);start+=15*60000) {
      const input={start,dayStart:day.start,dayEnd:day.end,events,origin:context.origin,destination,now};
      // First eliminate overlaps/unknown locations; enumerate independent road
      // legs without yet assuming that zero travel makes a slot available.
      if(!canFitInspection({...input,routeSeconds:requestRoute}))continue;
      candidates.push(input);
      for(const event of events)if(event.location)requestRoute(event.location,destination);
    }
  }
  for(const cached of context.cachedRoutes||[]) {
    const id=key(location(cached.from),location(cached.to)),result=cached.route;
    if(pairs.has(id)&&Number.isSafeInteger(result?.distanceMeters)&&result.distanceMeters>=0&&Number.isFinite(result.durationSeconds)&&result.durationSeconds>=0)routes.set(id,result);
  }
  const pending=[...pairs.entries()].filter(([id])=>!routes.has(id));let cursor=0;
  await Promise.all(Array.from({length:Math.min(concurrency,pending.length)},async()=>{
    while(cursor<pending.length) {
      const [id,pair]=pending[cursor++];
      try {
        const result=await route(pair.from,pair.to);
        if(!Number.isSafeInteger(result.distanceMeters)||result.distanceMeters<0||!Number.isFinite(result.durationSeconds)||result.durationSeconds<0)throw Error('ROUTE_SERVICE_UNAVAILABLE');
        routes.set(id,result);
      }catch(error){
        if(!['INVALID_LOCATION','ROUTE_UNAVAILABLE'].includes(error.message))throw error;
        routes.set(id,null);
      }
    }
  }));
  const routeSeconds=(from,to)=>{
    from=location(from);to=location(to);
    if(!from||!to||from.length>250||to.length>250)return NaN;
    return from===to?0:routes.get(key(from,to))?.durationSeconds??NaN;
  };
  const slots=[];
  for(const candidate of candidates) {
    if(!canFitInspection({...candidate,routeSeconds}))continue;
    slots.push({start:new Date(candidate.start).toISOString(),end:new Date(candidate.start+INSPECTION_MINUTES*60000).toISOString(),
      recommended:candidate.events.some(e=>e.location&&routeSeconds(e.location,destination)<=900)});
  }
  const origin=location(context.origin),target=location(destination);
  const originRoute=origin===target?{distanceMeters:0,durationSeconds:0}:routes.get(key(origin,target));
  if(!originRoute)throw Error('ROUTE_UNAVAILABLE');
  return {route:originRoute,slots:prioritizeSlots(slots),sourceCheckedAt:context.sourceCheckedAt};
}
