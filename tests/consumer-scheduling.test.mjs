import test from 'node:test';
import assert from 'node:assert/strict';
import {canFitInspection,localDay,prioritizeSlots} from '../supabase/functions/_shared/consumer-scheduling.mjs';
const base={now:Date.parse('2026-10-11T12:00:00Z'),dayStart:'2026-10-12T07:00:00Z',dayEnd:'2026-10-12T14:00:00Z',start:'2026-10-12T08:00:00Z',origin:'Apeldoorn',destination:'Deventer',events:[],routeSeconds:()=>1800};
test('A 45-minute visit includes driving and a margin before and after it',()=>{
  assert.equal(canFitInspection(base),true);
  assert.equal(canFitInspection({...base,start:'2026-10-12T07:30:00Z'}),false);
  assert.equal(canFitInspection({...base,start:'2026-10-12T13:00:00Z'}),false);
});
test('No same-day appointments, including around the Dutch midnight',()=>{
  assert.equal(canFitInspection({...base,now:Date.parse('2026-10-11T22:30:00Z')}),false);
  assert.equal(localDay('2026-10-11T22:30:00Z'),'2026-10-12');
});
test('Neighboring appointments use their actual location, not an assumed trip from home',()=>{
  const routes=[];
  const input={...base,events:[{start:'2026-10-12T07:00:00Z',end:'2026-10-12T07:30:00Z',location:'Zutphen'},{start:'2026-10-12T10:00:00Z',end:'2026-10-12T11:00:00Z',location:'Twello'}],routeSeconds:(from,to)=>{routes.push([from,to]);return 600;}};
  assert.equal(canFitInspection(input),true);
  assert.deepEqual(routes,[['Zutphen','Deventer'],['Deventer','Twello']]);
  assert.equal(canFitInspection({...input,routeSeconds:()=>3600}),false);
});
test('Busy events, missing locations and missing routes fail closed',()=>{
  assert.equal(canFitInspection({...base,events:[{start:'2026-10-12T08:20:00Z',end:'2026-10-12T08:40:00Z',location:'Apeldoorn'}]}),false);
  assert.equal(canFitInspection({...base,events:[{start:'2026-10-12T07:00:00Z',end:'2026-10-12T07:30:00Z'}]}),false);
  assert.equal(canFitInspection({...base,routeSeconds:()=>NaN}),false);
});
test('Nearby slots can be recommended while other genuinely free slots remain',()=>{
  const slots=[{id:'a',start:'2026-10-12T08:00:00Z'},{id:'b',start:'2026-10-15T08:00:00Z',recommended:true}];
  assert.deepEqual(prioritizeSlots(slots).map(s=>s.id),['b','a']);
});

test('An existing future hold can confirm after midnight without permitting a new same-day booking',()=>{
 const now=Date.parse('2026-10-11T22:30:00Z');
 assert.equal(canFitInspection({...base,now,existingHold:true}),true);
 assert.equal(canFitInspection({...base,now}),false);
 assert.equal(canFitInspection({...base,now:Date.parse(base.start)+1000,existingHold:true}),false);
});
