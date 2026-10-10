import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateTravel,ROOFSIGNAL_ORIGIN} from '../supabase/functions/_shared/consumer-travel-pricing.mjs';
// Approval true only for unit tests. The checked-in real config is unapproved.
const policy={version:'test',distanceBasis:'one_way_road',distanceBasisApproved:true,multipleVisits:'needs_review'};
test('User-specified origin is preserved',()=>assert.deepEqual(ROOFSIGNAL_ORIGIN,{postcode:'7316BH',houseNumber:'4',country:'NL'}));
test('Missing, negative, non-numeric or fractional distance cannot become zero',()=>{for(const value of [undefined,null,'25000',-1,25.5,NaN]) assert.throws(()=>calculateTravel(value,policy));});
test('Every exact band boundary uses the unrounded route distance',()=>{
  for(const [distance,amount] of [[0,0],[24999,0],[25000,0],[25001,4235],[75000,4235],[75001,9075],[150000,9075]]) assert.equal(calculateTravel(distance,policy).travelCents,amount);
  const over=calculateTravel(150001,policy);assert.equal(over.status,'requires_quote');assert.equal(over.travelCents,null);
});

test('The consumer travel description states the distance basis, band and every included visit', () => {
  const single = calculateTravel(50000, policy);
  assert.match(single.travelDescription, /enkele reis over de weg/i);
  assert.match(single.travelDescription, /\b50(?:,0+)?\s*km\b/i);
  assert.match(single.travelDescription, /meer dan 25\s*(?:t\/m|tot en met)\s*75/i);
  assert.match(single.travelDescription, /(?:\b1\b|één).*bezoek/i);
  for (const [multipleVisits, total] of [['one_fee_per_booking', 4235], ['per_agreed_visit', 8470]]) {
    const multiple = calculateTravel(50000, { ...policy, multipleVisits }, 2);
    assert.match(multiple.travelDescription, /enkele reis over de weg/i);
    assert.match(multiple.travelDescription, /\b2\b.*bezoeken/i);
    assert.equal(multiple.travelCents, total);
  }
});
test('Odoo VAT and consumer totals match all published bands',()=>{
  const mid=calculateTravel(50000,policy);assert.equal(mid.netCents,3500);assert.equal(mid.vatCents,735);assert.equal(36179+mid.travelCents,40414);assert.equal(66429+mid.travelCents,70664);
  const far=calculateTravel(100000,policy);assert.equal(far.netCents,7500);assert.equal(far.vatCents,1575);assert.equal(36179+far.travelCents,45254);assert.equal(66429+far.travelCents,75504);
});
test('A proposed distance basis is not a billable price',()=>{const result=calculateTravel(50000,{...policy,distanceBasisApproved:false});assert.equal(result.status,'needs_policy_decision');assert.equal(result.travelCents,null);assert.equal(result.candidateTravelCents,4235);});
test('Multiple visits need an explicit rule; no silent extra charges',()=>{
  assert.equal(calculateTravel(50000,policy,2).status,'requires_quote');
  assert.equal(calculateTravel(50000,{...policy,multipleVisits:'one_fee_per_booking'},2).travelCents,4235);
  assert.equal(calculateTravel(50000,{...policy,multipleVisits:'per_agreed_visit'},2).travelCents,8470);
});
