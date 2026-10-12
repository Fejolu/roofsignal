import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { vveIntakeDetails } from '../supabase/functions/_shared/vve-intake.mjs';

const input = changes => ({ type: 'price', segment: 'VvE / VvE-beheerder', source_path: '/inspectie-boeken/',
  message: 'Prijsindicatie (geen definitieve offerte): een browserbedrag',
  indicative_price: '€0',
  vve_intake: { inspection_type: 'building_envelope', thermal: false, address_count: 5, object_scope: 'single',
    object_address: ' Teststraat 2–10 ', object_city: ' Apeldoorn ', phone: '', kvk_number: '', ...changes } });

test('all approved VvE tiers are derived on the server for building, thermal-only and combined choices', () => {
  for (const [count,building,thermal] of [[1,75000,40000],[5,75000,40000],[6,100000,55000],[10,100000,55000],[11,125000,75000],[20,125000,75000]]) {
    for (const [inspectionType,hasThermal,total] of [['building_envelope',false,building],['thermal',true,thermal],['building_envelope',true,building+thermal]]) {
      const value = vveIntakeDetails(input({ address_count: count, inspection_type: inspectionType, thermal: hasThermal }));
      assert.equal(value.price_indication.total_excl_cents,total);
      assert.equal(value.price_indication.total_incl_cents,Math.round(total*1.21));
      assert.equal(value.price_indication.accepted,false); assert.equal(value.price_indication.travel_included,false);
      assert.equal(value.price_indication.kind,'indication'); assert.equal(value.object_city,'Apeldoorn');
      assert.equal(value.kvk_number,null); assert.equal(value.phone,'');
    }
  }
});

test('larger or multiple/unknown objects have no fabricated tier price or booking', () => {
  for (const changed of [{address_count:21},{address_count:10000},{object_scope:'multiple'},{object_scope:'unknown'}]) {
    const result = vveIntakeDetails(input(changed));
    assert.equal(result.price_indication.kind,'custom'); assert.equal(result.price_indication.total_excl_cents,null);
    assert.equal(result.price_indication.total_incl_cents,null); assert.equal(result.price_indication.accepted,false);
    assert.ok(!('payment_status' in result)); assert.ok(!('slot_start' in result));
  }
});

test('invalid count, product, scope, object fields and supplied amounts are rejected rather than trusted', () => {
  for (const changed of [
    {address_count:0},{address_count:10001},{address_count:1.5},{address_count:'10'},
    {inspection_type:'other'},{inspection_type:'thermal',thermal:false},{thermal:'yes'},{object_scope:'portfolio'},
    {object_address:''},{object_city:''},{phone:'x'.repeat(41)},
    {total_excl_cents:1},{accepted:true},{price_indication:{total_excl_cents:1}},
  ]) assert.throws(()=>vveIntakeDetails(input(changed)),/INVALID_VVE_INTAKE/);
  for (const changed of [{type:'contact'},{segment:'Particulier'},{source_path:'/contact/'}])
    assert.throws(()=>vveIntakeDetails({...input(),...changed}),/INVALID_VVE_INTAKE/);
});

test('legacy messages remain unparsed; optional KVK is recorded as supplied, never as verified', () => {
  assert.equal(vveIntakeDetails({ type:'price',message:'Aantal adressen: 10; Totaal: €1.000' }),null);
  const body = input({kvk_number:'9000 0749'}), message=body.message;
  const result = vveIntakeDetails(body); assert.equal(result.kvk_number,'90000749'); assert.equal(body.message,message);
  assert.ok(!('kvk_verified' in result));
  assert.equal(vveIntakeDetails(input({kvk_number:'geen nummer'})).kvk_number,null);
});

test('the actual form payload carries raw choices and original message; the public backend derives metadata', async () => {
  const source=await readFile(new URL('../assets/lead-capture.js',import.meta.url),'utf8');
  const context={document:{querySelectorAll:()=>[]},window:{location:{pathname:'/inspectie-boeken/'}},
    FormData:function(form){return new Map(Object.entries(form.fields));}};
  vm.runInNewContext(source.replace(/\}\)\(\);\s*$/,'window.build = buildPayload;})();'),context);
  const payload=context.window.build({dataset:{leadContext:'vve-object'},fields:{
    organization:'VvE Test',name:'Beheerder',email:'vve@example.invalid',segment:'VvE / VvE-beheerder',
    inspection_type:'thermal',thermal_interest:'yes',home_count:'6',object_scope:'single',
    buildings:'Teststraat 2–10',object_city:'Apeldoorn',phone:'',kvk_number:'',indicative_price:'€0 clientfake',
  }},'price');
  assert.match(payload.message,/€0 clientfake/); assert.equal(payload.vve_intake.address_count,6);
  assert.equal(vveIntakeDetails(payload).price_indication.total_excl_cents,55000);
  assert.ok(!('indicative_price' in payload.vve_intake));
  const backend=await readFile(new URL('../supabase/functions/submit-public-lead/index.ts',import.meta.url),'utf8');
  assert.match(backend,/vveIntakeDetails\(body\)/); assert.match(backend,/intake_details: intakeDetails/);
});
