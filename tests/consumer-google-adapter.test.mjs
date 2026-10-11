import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {googleExecutionError} from '../supabase/functions/_shared/consumer-google.mjs';

const core=fs.readFileSync(new URL('../supabase/functions/_shared/consumer-scheduling.mjs',import.meta.url),'utf8').replaceAll('export ','');
const adapter=fs.readFileSync(new URL('../tools/google-booking-bridge.js',import.meta.url),'utf8');
const day='2026-10-12',destination='Markt 1, Apeldoorn';
class Clock extends Date { static now(){return Date.parse('2026-10-11T12:00:00Z');} }
function setup(events=[],lookup=()=>({status:'OK',routes:[{legs:[{distance:{value:1000},duration:{value:300}}]}]})) {
  const calls=[];
  const calendar={getEvents:()=>events.map(e=>({
    getDescription:()=>'',getTransparency:()=>e.transparent?'transparent':'opaque',
    getStartTime:()=>new Date(e.start),getEndTime:()=>new Date(e.end),getLocation:()=>e.location,
  }))};
  const context=vm.createContext({Date:Clock,Intl,Utilities:{formatDate:()=>'+0200'},
    CalendarApp:{EventTransparency:{TRANSPARENT:'transparent'},getCalendarById:()=>calendar},
    Maps:{DirectionFinder:{Mode:{DRIVING:'driving'}},newDirectionFinder(){
      let from,to;const finder={setOrigin(v){from=v;return this;},setDestination(v){to=v;return this;},
        setRegion(){return this;},setLanguage(){return this;},setMode(){return this;},setAlternatives(){return this;},
        getDirections(){calls.push([from,to]);return lookup(from,to);}};return finder;
    }},
  });
  vm.runInContext(core+'\n'+adapter,context);
  return {context,calls,slots:(date=day,cache={})=>context.rsDaySlots(calendar,date,destination,cache)};
}
const event=(start,end,location)=>({start:`${day}T${start}:00+02:00`,end:`${day}T${end}:00+02:00`,location});

test('Google adapter routes a multiline appointment address without losing its location',()=>{
  const {slots,calls}=setup([event('09:00','10:00','Voorbeeldstraat 1\n7311 AA Apeldoorn')]);
  assert.ok(slots().length>0);
  assert.ok(calls.some(([from])=>from==='Voorbeeldstraat 1, 7311 AA Apeldoorn'));
});
test('Missing, invalid and unroutable neighboring locations never become zero travel',()=>{
  for(const location of [null,'x'.repeat(251),'onvindbaar']) {
    const {slots,calls}=setup([event('09:00','10:00',location)],(from,to)=>
      [from,to].includes('onvindbaar')?{status:'ZERO_RESULTS'}:{status:'OK',routes:[{legs:[{distance:{value:1000},duration:{value:300}}]}]});
    assert.equal(slots().length,0);
    if(location==='onvindbaar')assert.equal(calls.filter(([from])=>from===location).length,1);
  }
});
test('Unusable nonadjacent locations do not break a safe slot or its clustering recommendation',()=>{
  const {slots}=setup([event('09:00','10:00','x'.repeat(251)),event('10:30','11:00','Deventer')]);
  const found=slots();
  assert.ok(found.length>0);
  assert.ok(found.every(slot=>Date.parse(slot.start)>=Date.parse(`${day}T11:20:00+02:00`)));
});
test('A blocked day does not abort availability for other days',()=>{
  const bad=setup([event('09:00','10:00','x'.repeat(251))]);
  assert.equal(bad.slots().length,0);
  assert.ok(setup().slots('2026-10-13').length>0);
});
test('Google quota/service failures remain explicit failures, not invented availability',()=>{
  const {slots}=setup([],()=>({status:'OVER_QUERY_LIMIT'}));
  assert.throws(()=>slots(),/ROUTE_SERVICE_UNAVAILABLE/);
});
test('The server recognizes an occupied slot across the actual Apps Script error envelope',()=>{
  assert.equal(googleExecutionError('Error: SLOT_UNAVAILABLE'),'SLOT_UNAVAILABLE');
  assert.equal(googleExecutionError('SLOT_UNAVAILABLE'),'SLOT_UNAVAILABLE');
  assert.equal(googleExecutionError('Exception: private event details'),'CALENDAR_UNAVAILABLE');
  assert.equal(googleExecutionError(undefined),'CALENDAR_UNAVAILABLE');
});
test('Calendar markers separate test/live reservations and the executable stays owner-only',()=>{
 const {context}=setup();const requestId='601f78aa-31f3-4c63-941d-07b31df84902';
 assert.notEqual(context.rsMarker({requestId,mode:'test'}),context.rsMarker({requestId,mode:'live'}));
 context.Session={getEffectiveUser:()=>({getEmail:()=> 'other@example.invalid'})};
 assert.throws(()=>context.executeRoofSignal({action:'health',mode:'live'}),/UNAUTHORIZED/);
 context.Session={getEffectiveUser:()=>({getEmail:()=> 'ferry.joosten@gmail.com'})};
 assert.equal(context.executeRoofSignal({action:'health',mode:'live'}).mode,'live');
 assert.throws(()=>context.executeRoofSignal({action:'health',mode:'anything'}),/INVALID_REQUEST/);
});
