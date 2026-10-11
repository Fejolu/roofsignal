import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {googleExecutionError} from '../supabase/functions/_shared/consumer-google.mjs';

const core=fs.readFileSync(new URL('../supabase/functions/_shared/consumer-scheduling.mjs',import.meta.url),'utf8').replaceAll('export ','');
const adapter=fs.readFileSync(new URL('../tools/google-booking-bridge.js',import.meta.url),'utf8');
const day='2026-10-12',destination='Markt 1, Apeldoorn';
class Clock extends Date { static now(){return Date.parse('2026-10-11T12:00:00Z');} }
function setup(events=[],lookup=()=>({status:'OK',routes:[{legs:[{distance:{value:1000},duration:{value:300}}]}]})) {
  const calls=[],reads=[],formats=[],shared=new Map(),locks=[];
  const calendar={getEvents:(start,end)=>{reads.push([start,end]);return events.filter(e=>Date.parse(e.start)<end&&Date.parse(e.end)>start).map(e=>({
    getDescription:()=>'',getTransparency:()=>e.transparent?'transparent':'opaque',
    getStartTime:()=>new Date(e.start),getEndTime:()=>new Date(e.end),getLocation:()=>e.location,
  }))}};
  const context=vm.createContext({Date:Clock,Intl,Utilities:{
    formatDate(date){formats.push(date);return date<new Date('2026-10-25T01:00:00Z')?'+0200':'+0100';},
    DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(algorithm,key)=>createHash(algorithm).update(key).digest(),base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString('base64url')},
    CacheService:{getScriptCache:()=>({get:key=>shared.get(key)||null,put:(key,value)=>shared.set(key,value)})},
    Session:{getEffectiveUser:()=>({getEmail:()=> 'ferry.joosten@gmail.com'})},
    LockService:{getScriptLock:()=>({tryLock:()=>{locks.push('acquire');return true;},releaseLock:()=>locks.push('release')})},
    CalendarApp:{EventTransparency:{TRANSPARENT:'transparent'},getCalendarById:()=>calendar},
    Maps:{DirectionFinder:{Mode:{DRIVING:'driving'}},newDirectionFinder(){
      let from,to;const finder={setOrigin(v){from=v;return this;},setDestination(v){to=v;return this;},
        setRegion(){return this;},setLanguage(){return this;},setMode(){return this;},setAlternatives(){return this;},
        getDirections(){calls.push([from,to]);return lookup(from,to);}};return finder;
    }},
  });
  vm.runInContext(core+'\n'+adapter,context);
  return {context,calls,reads,formats,shared,locks,slots:(date=day,cache={})=>context.rsDaySlots(calendar,date,destination,cache)};
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

test('21-day availability batches the calendar once and agrees with individual day checks across DST',()=>{
 const events=[event('09:00','10:00','Deventer'),{start:'2026-10-13T22:00:00+02:00',end:'2026-10-15T00:00:00+02:00',location:null}];
 const batch=setup(events),individual=setup(events);
 const result=batch.context.executeRoofSignal({action:'plan',mode:'test',destination});
 const expected=[];
 for(let offset=1;offset<=21;offset++)expected.push(...individual.slots(new Date(Date.parse('2026-10-11T12:00:00Z')+offset*86400000).toISOString().slice(0,10)));
 assert.deepEqual(JSON.parse(JSON.stringify(result.slots)),JSON.parse(JSON.stringify(individual.context.prioritizeSlots(expected))));
 assert.equal(batch.reads.length,1,'One range read, not a call for every weekday');
 assert.ok(batch.formats.length<=22,'Each local date offset is calculated once');
 assert.deepEqual(batch.locks,[],'Read-only planning cannot queue behind another reader');
 assert.equal(result.route.distanceMeters,1000);
 assert.ok(result.slots.some(s=>s.start.startsWith('2026-10-26T08:')),'Winter dates retain local office hours');
 assert.ok(!result.slots.some(s=>s.start.startsWith('2026-10-14')),'Spanning all-day events still block');
});

test('Road cache is directional; calendar remains fresh and mutation route checks bypass shared cache',()=>{
 const app=setup();
 app.context.executeRoofSignal({action:'plan',mode:'test',destination});
 const firstCalls=app.calls.length;
 assert.ok(firstCalls>=2);
 app.context.executeRoofSignal({action:'plan',mode:'test',destination});
 assert.equal(app.calls.length,firstCalls);
 assert.equal(app.reads.length,2,'No cached busy/free data');
 app.context.rsRoute('Apeldoorn',destination,{});
 assert.equal(app.calls.length,firstCalls+1,'Mutation-local cache still reads the route provider');
 const requestId='601f78aa-31f3-4c63-941d-07b31df84902';
 app.context.executeRoofSignal({action:'release',mode:'test',requestId,start:'2026-10-12T08:00:00Z'});
 assert.deepEqual(app.locks,['acquire','release']);
});

test('A new calendar conflict after browsing is rejected under the checkout lock',()=>{
 const events=[],app=setup(events);
 const plan=app.context.executeRoofSignal({action:'plan',mode:'test',destination});
 const selected=plan.slots[0];
 events.push({start:selected.start,end:selected.end,location:destination});
 assert.throws(()=>app.context.executeRoofSignal({action:'hold',mode:'test',destination,
   requestId:'601f78aa-31f3-4c63-941d-07b31df84902',start:selected.start}),/SLOT_UNAVAILABLE/);
 assert.deepEqual(app.locks,['acquire','release']);
 assert.ok(app.reads.length>1,'Actual calendar is read again before reserving');
});
