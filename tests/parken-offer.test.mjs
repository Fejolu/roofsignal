import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingOptions, orderLines, PARKEN_OFFER_VERSION } from '../supabase/functions/_shared/parken-offer.mjs';

const request = { offer_version: PARKEN_OFFER_VERSION, thermography_selected: false, terms_accepted: true };
const booking = { offer_version: PARKEN_OFFER_VERSION, thermography_selected: false, inspection_excl_cents: 29900, thermography_excl_cents: 0, total_incl_cents: 36179 };
const text = (value) => orderLines(value).join('\n').replace(/\u00a0/g, ' ');

test('paid selection is explicit and client prices and mailing consent are ignored', () => {
  const result = bookingOptions({ ...request, thermography_interest: true, total_incl_cents: 1 });
  assert.equal(result.p_thermography_selected, false);
  assert.equal(Object.hasOwn(result, 'total_incl_cents'), false);
  assert.equal(Object.hasOwn(result, 'p_thermography_interest'), false);
  assert.equal(bookingOptions({ ...request, thermography_selected: true }).p_thermography_selected, true);
});

test('old or malformed offers cannot become paid orders', () => {
  for (const payload of [{}, { ...request, offer_version: 'old' }]) assert.throws(() => bookingOptions(payload), /OFFER_UPDATED/);
  assert.throws(() => bookingOptions({ ...request, thermography_selected: 'false' }), /INVALID_OPTION/);
  assert.throws(() => bookingOptions({ ...request, terms_accepted: 'true' }), /TERMS_REQUIRED/);
});

test('base and thermal confirmation use the stored agreed prices', () => {
  assert.match(text(booking), /Totaal: € 361,79 incl. btw/);
  assert.match(text(booking), /Geen thermografische inspectie bijgeboekt/);
  const thermal = { ...booking, thermography_selected: true, thermography_excl_cents: 25000, total_incl_cents: 66429 };
  assert.match(text(thermal), /€ 250,00 excl. btw \(€ 302,50 incl. btw\)/);
  assert.match(text(thermal), /Totaal: € 664,29 incl. btw/);
  assert.match(text(thermal), /apart opnamemoment/);
  assert.match(text(thermal), /binnen de gekozen toeslag/);
});

test('historical mailing interest is not a purchase and broken price snapshots fail closed', () => {
  assert.deepEqual(orderLines({ thermography_interest_at: '2026-08-01' }), []);
  assert.throws(() => orderLines({ ...booking, total_incl_cents: 1 }), /INVALID_ORDER_SNAPSHOT/);
  assert.throws(() => orderLines({ ...booking, thermography_selected: true }), /INVALID_ORDER_SNAPSHOT/);
});
