import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {withdrawalLastDay,earlyStartRequired,assertAfterWithdrawal,reportDueDay} from '../supabase/functions/_shared/consumer-dates.mjs';
import {CONSUMER_TERMS} from '../supabase/functions/_shared/consumer-terms-20261010.mjs';
import {CONSUMER_TERMS as CURRENT_CONSUMER_TERMS} from '../supabase/functions/_shared/consumer-terms-20261011.mjs';
test('Bedenktijd includes its final Dutch day and extends over weekends and equalized holidays',()=>{
 assert.equal(withdrawalLastDay('2026-10-10T08:00:00Z'),'2026-10-26');
 assert.equal(earlyStartRequired('2026-10-26T23:00:00+01:00','2026-10-10T08:00:00Z'),true);
 assert.equal(earlyStartRequired('2026-10-27T00:00:00+01:00','2026-10-10T08:00:00Z'),false);
 assert.equal(withdrawalLastDay('2026-05-01T08:00:00Z'),'2026-05-18');
 assert.equal(withdrawalLastDay('2026-12-18T08:00:00Z'),'2027-01-04');
 assert.equal(withdrawalLastDay('2027-04-23T08:00:00Z'),'2027-05-10');
 assert.throws(()=>withdrawalLastDay('2029-01-01T08:00:00Z'),/REVIEW/);
});
test('New consumer bookings reject the entire withdrawal period, including extended final days',()=>{
 for(const [agreement,last,next,offset] of [
  ['2026-10-11T12:00:00Z','2026-10-26','2026-10-27','+01:00'],
  ['2026-05-01T08:00:00Z','2026-05-18','2026-05-19','+02:00'],
  ['2026-12-18T08:00:00Z','2027-01-04','2027-01-05','+01:00']
 ]) {
  assert.throws(()=>assertAfterWithdrawal(agreement,agreement),/AFTER_WITHDRAWAL_REQUIRED/);
  assert.throws(()=>assertAfterWithdrawal(last+'T23:59:59'+offset,agreement),/AFTER_WITHDRAWAL_REQUIRED/);
  assert.doesNotThrow(()=>assertAfterWithdrawal(next+'T09:00:00'+offset,agreement));
 }
});
test('Checkout recalculates the deadline when a quote crosses Dutch midnight',()=>{
 const selected='2026-10-28T09:00:00+01:00';
 assert.doesNotThrow(()=>assertAfterWithdrawal(selected,'2026-10-13T23:59:59+02:00'));
 assert.throws(()=>assertAfterWithdrawal(selected,'2026-10-14T00:00:00+02:00'),/AFTER_WITHDRAWAL_REQUIRED/);
});
test('Report deadline is two working days after inspection, across weekends, Christmas and Easter',()=>{
 assert.equal(reportDueDay('2026-10-09T14:00:00Z'),'2026-10-13');
 assert.equal(reportDueDay('2026-12-24T09:00:00Z'),'2026-12-29');
 assert.equal(reportDueDay('2026-04-02T09:00:00Z'),'2026-04-08');
});
test('Browser date rules and emailed consumer terms match their canonical sources',()=>{
 const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
 assert.equal(read('../inspectie-boeken/booking-dates.mjs').split('\n').slice(1).join('\n'),read('../supabase/functions/_shared/consumer-dates.mjs'));
 assert.equal(CONSUMER_TERMS,read('../legal/consumentenboeking-2026-10-10.txt'));
 assert.equal(CURRENT_CONSUMER_TERMS,read('../legal/consumentenboeking-2026-10-11.txt'));
 assert.match(CURRENT_CONSUMER_TERMS,/alleen een inspectiemoment na het einde van de bedenktijd/);
 assert.match(CONSUMER_TERMS,/tijdens de bedenktijd/,'Previously agreed terms remain available unchanged');
});
