import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {withdrawalLastDay,earlyStartRequired,assertAfterWithdrawal,assertEarlyStartConsent,reportDueDay} from '../supabase/functions/_shared/consumer-dates.mjs';
import {CONSUMER_TERMS} from '../supabase/functions/_shared/consumer-terms-20261010.mjs';
import {CONSUMER_TERMS as CURRENT_CONSUMER_TERMS} from '../supabase/functions/_shared/consumer-terms-20261011.mjs';
import {CONSUMER_TERMS as PAYMENT_CONSUMER_TERMS} from '../supabase/functions/_shared/consumer-terms-20261011betalen.mjs';
import {CONSUMER_TERMS as THERMAL_CONSUMER_TERMS} from '../supabase/functions/_shared/consumer-terms-20261011thermografie.mjs';
import {CONSUMER_TERMS as SHORT_CONSENT_CONSUMER_TERMS} from '../supabase/functions/_shared/consumer-terms-20261011kort.mjs';
import {CONSUMER_TERMS as STANDALONE_PRICE_CONSUMER_TERMS} from '../supabase/functions/_shared/consumer-terms-20261011los.mjs';
import {TERMS_TEXT as THERMAL_GENERAL_TERMS} from '../supabase/functions/_shared/terms-20261011thermografie.mjs';
test('Bedenktijd includes its final Dutch day and extends over weekends and equalized holidays',()=>{
 assert.equal(withdrawalLastDay('2026-10-10T08:00:00Z'),'2026-10-26');
 assert.equal(earlyStartRequired('2026-10-26T23:00:00+01:00','2026-10-10T08:00:00Z'),true);
 assert.equal(earlyStartRequired('2026-10-27T00:00:00+01:00','2026-10-10T08:00:00Z'),false);
 assert.equal(withdrawalLastDay('2026-05-01T08:00:00Z'),'2026-05-18');
 assert.equal(withdrawalLastDay('2026-12-18T08:00:00Z'),'2027-01-04');
 assert.equal(withdrawalLastDay('2027-04-23T08:00:00Z'),'2027-05-10');
 assert.throws(()=>withdrawalLastDay('2029-01-01T08:00:00Z'),/REVIEW/);
});
test('Early bookings need explicit consent through the extended final Dutch day',()=>{
 for(const [agreement,last,next,offset] of [
  ['2026-10-11T12:00:00Z','2026-10-26','2026-10-27','+01:00'],
  ['2026-05-01T08:00:00Z','2026-05-18','2026-05-19','+02:00'],
  ['2026-12-18T08:00:00Z','2027-01-04','2027-01-05','+01:00']
 ]) {
  assert.throws(()=>assertEarlyStartConsent(agreement,false,agreement),/EARLY_START_CONSENT_REQUIRED/);
  assert.throws(()=>assertEarlyStartConsent(last+'T23:59:59'+offset,false,agreement),/EARLY_START_CONSENT_REQUIRED/);
  assert.doesNotThrow(()=>assertEarlyStartConsent(last+'T23:59:59'+offset,true,agreement));
  assert.doesNotThrow(()=>assertEarlyStartConsent(next+'T09:00:00'+offset,false,agreement));
  for(const value of [undefined,null,1,'true',{},[]]) {
   assert.throws(()=>assertEarlyStartConsent(agreement,value,agreement),/INVALID_REQUEST/);
   assert.throws(()=>assertEarlyStartConsent(next+'T09:00:00'+offset,value,agreement),/INVALID_REQUEST/);
  }
 }
});
test('Checkout recalculates the deadline when a quote crosses Dutch midnight',()=>{
 const selected='2026-10-28T09:00:00+01:00';
 assert.doesNotThrow(()=>assertEarlyStartConsent(selected,false,'2026-10-13T23:59:59+02:00'));
 assert.throws(()=>assertEarlyStartConsent(selected,false,'2026-10-14T00:00:00+02:00'),/EARLY_START_CONSENT_REQUIRED/);
 assert.doesNotThrow(()=>assertEarlyStartConsent(selected,true,'2026-10-14T00:00:00+02:00'));
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
 assert.equal(PAYMENT_CONSUMER_TERMS,read('../legal/consumentenboeking-2026-10-11-betalen.txt'));
 assert.equal(PAYMENT_CONSUMER_TERMS,CURRENT_CONSUMER_TERMS.replace("knop 'Boek en betaal'","knop 'Betalen'"),'The button label changes without changing agreed rights');
 assert.equal(THERMAL_CONSUMER_TERMS,read('../legal/consumentenboeking-2026-10-11-thermografie.txt'));
 assert.equal(THERMAL_GENERAL_TERMS,read('../legal/voorwaarden-2026-10-11-thermografie.txt'));
 assert.match(THERMAL_CONSUMER_TERMS,/zelfstandige thermische inspectie kost €302,50/);
 assert.equal(THERMAL_CONSUMER_TERMS.split('5. Bedenktijd en planning')[1],PAYMENT_CONSUMER_TERMS.split('5. Bedenktijd en planning')[1],'Standalone scope does not change the accepted withdrawal/planning rules');
 assert.match(CURRENT_CONSUMER_TERMS,/alleen een inspectiemoment na het einde van de bedenktijd/);
 assert.match(CONSUMER_TERMS,/tijdens de bedenktijd/,'Previously agreed terms remain available unchanged');
 assert.equal(SHORT_CONSENT_CONSUMER_TERMS,read('../legal/consumentenboeking-2026-10-11-kort.txt'));
 assert.equal(SHORT_CONSENT_CONSUMER_TERMS.split('1. Product en uitvoering')[1].split('5. Bedenktijd')[0],THERMAL_CONSUMER_TERMS.split('1. Product en uitvoering')[1].split('5. Bedenktijd')[0],'Short consent does not change products, prices, payment or report deadline');
 assert.match(SHORT_CONSENT_CONSUMER_TERMS,/Ik verzoek om uitvoering binnen de bedenktijd\. Na volledige uitvoering, inclusief rapport, vervalt mijn herroepingsrecht/);
 assert.match(SHORT_CONSENT_CONSUMER_TERMS,/apart, niet vooraf aangevinkt akkoord/);
 assert.match(SHORT_CONSENT_CONSUMER_TERMS,/Zonder dit verzoek beginnen wij pas na de bedenktijd/);
 assert.match(SHORT_CONSENT_CONSUMER_TERMS,/evenredig bedrag voor het daadwerkelijk geleverde deel/);
 assert.match(SHORT_CONSENT_CONSUMER_TERMS,/vastgelegde keuze over eerdere uitvoering/);
 assert.equal(STANDALONE_PRICE_CONSUMER_TERMS,read('../legal/consumentenboeking-2026-10-11-los.txt'));
 assert.match(STANDALONE_PRICE_CONSUMER_TERMS,/zelfstandige dak- en gevelinspectie of thermische inspectie kost €361,79/);
 assert.match(STANDALONE_PRICE_CONSUMER_TERMS,/toevoeging €302,50/);
 assert.match(STANDALONE_PRICE_CONSUMER_TERMS,/combinatie betaalt u €664,29 inclusief btw, ongeacht welke inspectie u eerst kiest/);
 assert.equal(STANDALONE_PRICE_CONSUMER_TERMS.split('5. Bedenktijd')[1],SHORT_CONSENT_CONSUMER_TERMS.split('5. Bedenktijd')[1],'The standalone price correction preserves the short consent and withdrawal rules');
 assert.equal(STANDALONE_PRICE_CONSUMER_TERMS,SHORT_CONSENT_CONSUMER_TERMS
  .replace('Versie 11 oktober 2026 — korte toestemming voor eerdere uitvoering','Versie 11 oktober 2026 — gelijke prijs voor zelfstandige inspecties')
  .replace('De dak- en gevelinspectie kost €361,79 inclusief btw. Een zelfstandige thermische inspectie kost €302,50 inclusief btw. Voor de combinatie betaalt u €664,29 inclusief btw.','Een zelfstandige dak- en gevelinspectie of thermische inspectie kost €361,79 inclusief btw. Voegt u de andere inspectie toe voor uitvoering tijdens hetzelfde bezoek, dan kost die toevoeging €302,50 inclusief btw. Voor de combinatie betaalt u €664,29 inclusief btw, ongeacht welke inspectie u eerst kiest.'),'Only the standalone price and version heading change; archived agreements remain unchanged');
});
