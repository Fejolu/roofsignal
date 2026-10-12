import test from 'node:test';
import assert from 'node:assert/strict';
import { subtotal, money, normalizePostcode, normalizeHouseNumber, validateQuote, validateSlots, validateSelectedSlot, needsEarlyStart, validateCheckout, createRecoveryRecord, validateRecoveryRecord, validateRecoveryResponse, canReleaseAttempt, paymentMessage, resolveBookingConfiguration } from '../inspectie-boeken/booking-core.mjs';

const now = Date.parse('2026-10-10T08:00:00Z');
const address = { postcode: '1234AB', houseNumber: '12 A', street: 'Voorbeeldstraat', city: 'Voorbeeldplaats', country: 'NL' };
const quote = (thermal = false) => ({ quoteId: 'test_quote_0123456789', inspectionType: 'building_envelope', serviceable: true, currency: 'EUR', baseCents: 36179, thermalCents: thermal ? 30250 : 0, travelCents: 0, totalCents: subtotal(thermal), travelDescription: 'Testtoelichting van de server; geen werkelijk reistarief.', address, expiresAt: '2026-10-10T09:00:00Z', termsVersion: '2026-09-24' });
const requestId = '2e4fdd95-6013-4a5a-8c8d-867d4e8bea23';
const attempt = { requestId, quoteId: quote().quoteId, slotId: 's1' };
const expected = createRecoveryRecord(attempt, quote());
const checkout = { requestId, quoteId: expected.quoteId, slotId: expected.slotId, currency: 'EUR', reference: 'RS-TEST', totalCents: 36179, checkoutUrl: 'https://www.mollie.com/checkout/select-method/test' };

test('Exact consumer totals are calculated in cents', () => {
  assert.equal(subtotal(false), 36179); assert.equal(subtotal(true), 66429);
  assert.equal(subtotal(false, 'thermal'), 36179); assert.equal(subtotal(true, 'thermal'), 36179);
  assert.throws(() => subtotal(true, 'unknown'));
  assert.match(money(66429), /664,29/); assert.throws(() => money(361.79));
});

test('Standalone thermography has no visual base and cannot reuse another product quote', () => {
  const thermal = { ...quote(true), inspectionType: 'thermal', baseCents: 0, thermalCents: 36179, totalCents: 36179 };
  assert.equal(validateQuote(thermal, true, now, address, 'thermal').totalCents, 36179);
  const travel = { ...thermal, travelCents: 4235, totalCents: 40414 };
  assert.equal(validateQuote(travel, true, now, address, 'thermal').totalCents, 40414);
  assert.throws(() => validateQuote({ ...thermal, thermalCents: 30250, totalCents: 30250 }, true, now, address, 'thermal'), 'An old standalone quote must be refreshed before a new payment');
  assert.throws(() => validateQuote(quote(true), true, now, address, 'thermal'));
  assert.throws(() => validateQuote(thermal, true, now, address, 'building_envelope'));
  assert.throws(() => validateQuote({ ...thermal, baseCents: 36179, totalCents: 66429 }, true, now, address, 'thermal'));
  assert.throws(() => validateQuote({ ...thermal, thermalCents: 0, totalCents: 0 }, true, now, address, 'thermal'));
  assert.throws(() => validateQuote({ ...quote(), inspectionType: undefined }, false, now, address));
});

test('Missing configuration stays in preview; connected mode needs a trusted explicit API route', () => {
  assert.equal(resolveBookingConfiguration().mode, 'preview');
  for (const apiBase of ['/api/consumer-booking', 'https://kakpticlxlaxtebhsuoh.supabase.co/functions/v1/consumer-booking']) {
    assert.deepEqual(resolveBookingConfiguration({ mode: 'connected', apiBase }), { mode: 'connected', apiBase });
  }
  for (const configuration of [null, {}, [], { mode: 'connected' }, { mode: 'live', apiBase: '/api/consumer-booking' }]) {
    assert.throws(() => resolveBookingConfiguration(configuration));
  }
});

test('Runtime configuration cannot redirect customer data to another host, route or query', () => {
  for (const apiBase of [
    'https://other-project.supabase.co/functions/v1/consumer-booking',
    'https://kakpticlxlaxtebhsuoh.supabase.co.attacker.invalid/functions/v1/consumer-booking',
    'http://kakpticlxlaxtebhsuoh.supabase.co/functions/v1/consumer-booking',
    'https://kakpticlxlaxtebhsuoh.supabase.co/functions/v1/submit-parken-booking',
    '/api/consumer-booking?destination=other', '//attacker.invalid/consumer-booking'
  ]) assert.throws(() => resolveBookingConfiguration({ mode: 'connected', apiBase }));
  assert.throws(() => resolveBookingConfiguration({ mode: 'connected', apiBase: '/api/consumer-booking', token: 'unexpected' }));
});
test('Missing travel fees are never treated as zero', () => {
  for (const travelCents of [undefined, null, '0', -1, 0.5]) assert.throws(() => validateQuote({ ...quote(), travelCents }, false, now));
  assert.equal(validateQuote(quote(), false, now).totalCents, 36179);
});
test('Total, currency, option and expiry must agree', () => {
  for (const extra of [{totalCents: 1}, {currency:'USD'}, {thermalCents:30250}, {expiresAt:'2026-10-10T07:59:59Z'}, {serviceable:false}]) assert.throws(() => validateQuote({...quote(), ...extra}, false, now));
  assert.equal(validateQuote({...quote(true), travelCents:1500, totalCents:67929}, true, now).totalCents, 67929);
});
test('Postcode formatting does not truncate input before removing spaces', () => {
  assert.equal(normalizePostcode('7316 ab'), '7316AB');
  assert.throws(() => normalizePostcode('7316'));
});
test('Address lookup must return the requested postcode and house number', () => {
  assert.equal(normalizeHouseNumber(' 12 a '), '12 A');
  for (const value of ['', '  ', '0', 'unknown']) assert.throws(() => normalizeHouseNumber(value));
  const requested = { postcode: '1234 ab', houseNumber: '12a' };
  assert.equal(validateQuote(quote(), false, now, requested).address.street, 'Voorbeeldstraat');
  for (const patch of [{ address: undefined }, { address: { ...address, postcode: '5678CD' } }, { address: { ...address, houseNumber: '14' } }, { address: { ...address, street: '' } }, { travelDescription: undefined }]) assert.throws(() => validateQuote({ ...quote(), ...patch }, false, now, requested));
});
test('Only unique, future, ordered and timezone-explicit agenda slots render', () => {
  const good = { id:'s1', start:'2026-10-11T08:00:00Z', end:'2026-10-11T09:30:00Z' };
  assert.deepEqual(validateSlots({slots:[good,good,{...good,id:'past',start:'2025-01-01T08:00:00Z'},{...good,id:'inverted',end:'2026-10-11T07:00:00Z'},{...good,id:'local',start:'2026-10-11T08:00:00'}]},now), [good]);
});
test('A selected slot is checked again at checkout, not only when it loaded', () => {
  const slot = { id: 's1', start: '2026-10-10T08:05:00Z', end: '2026-10-10T09:30:00Z' };
  assert.equal(validateSelectedSlot(slot, now), slot);
  assert.throws(() => validateSelectedSlot(slot, Date.parse(slot.start)));
  assert.throws(() => validateSelectedSlot(slot, Date.parse('2026-10-10T08:06:00Z')));
  assert.throws(() => validateSlots({ quoteId: 'other-quote', slots: [slot] }, now, expected.quoteId));
});
test('Nearby recommended slots are offered first while other valid times remain available', () => {
  const ordinary = {id:'ordinary',start:'2026-10-12T08:00:00Z',end:'2026-10-12T08:45:00Z'};
  const nearby = {id:'nearby',start:'2026-10-13T08:00:00Z',end:'2026-10-13T08:45:00Z',recommended:true};
  assert.deepEqual(validateSlots({slots:[ordinary,nearby]},now),[nearby,ordinary]);
});
test('Early service considers Dutch calendar dates across autumn DST', () => {
  assert.equal(needsEarlyStart('2026-10-24T08:00:00Z',new Date(now)),true);
  assert.equal(needsEarlyStart('2026-10-25T08:00:00Z',new Date(now)),true);
  assert.equal(needsEarlyStart('2026-10-26T08:00:00Z',new Date(now)),true);
  assert.equal(needsEarlyStart('2026-10-27T08:00:00Z',new Date(now)),false);
});
test('Checkout verifies the same currency, quote, slot, request and amount', () => {
  assert.equal(validateCheckout(checkout, expected), checkout.checkoutUrl);
  for (const patch of [{ currency: 'USD' }, { currency: undefined }, { totalCents: 66429 }, { totalCents: '36179' }, { quoteId: 'other-quote' }, { slotId: 'other-slot' }, { requestId: 'other-request' }, { reference: '' }]) assert.throws(() => validateCheckout({ ...checkout, ...patch }, expected));
  for (const checkoutUrl of ['https://www.mollie.com.example.org/pay', 'https://evil.example/pay', 'javascript:alert(1)', 'http://www.mollie.com/checkout/test', 'https://user@www.mollie.com/test', 'https://www.mollie.com:444/pay']) assert.throws(() => validateCheckout({ ...checkout, checkoutUrl }, expected));
});
test('A recovered direct iDEAL checkout must use its exact official host and the same order', () => {
  const checkoutUrl = 'https://pay.ideal.nl/pay/existing-payment';
  assert.equal(validateCheckout({ ...checkout, checkoutUrl }, expected), checkoutUrl);
  assert.deepEqual(validateRecoveryResponse({ ...checkout, checkoutUrl, state: 'checkout_ready' }, expected), { state: 'checkout_ready', checkoutUrl });
  for (const url of ['http://pay.ideal.nl/pay', 'https://pay.ideal.nl.example.org/pay', 'https://evil.pay.ideal.nl/pay', 'https://user:secret@pay.ideal.nl/pay', 'https://pay.ideal.nl:444/pay']) assert.throws(() => validateCheckout({ ...checkout, checkoutUrl: url }, expected));
  assert.throws(() => validateCheckout({ ...checkout, checkoutUrl, totalCents: 66429 }, expected));
});
test('Reload recovery stores no address, customer details, notes or payment URL', () => {
  const record = createRecoveryRecord({ ...attempt, customer: { name: 'Private name', email: 'private@example.invalid', notes: 'Private note' } }, quote());
  assert.deepEqual(record, expected);
  assert.deepEqual(validateRecoveryRecord(JSON.parse(JSON.stringify(record))), record);
  assert.doesNotMatch(JSON.stringify(record), /Private|@|street|address|checkoutUrl|customer/);
  for (const patch of [{ requestId: '' }, { version: 2 }, { currency: 'USD' }, { totalCents: 361.79 }, { customer: { name: 'Private name' } }]) assert.throws(() => validateRecoveryRecord({ ...record, ...patch }));
});
test('A status code or an unproven not-found response never releases a payment', () => {
  for (const data of [undefined, { status: 409 }, { code: 'REQUEST_NOT_CREATED' }, { requestId, code: 'REQUEST_NOT_CREATED', paymentCreated: false }, { requestId, code: 'OTHER', paymentCreated: false, requestClosed: true }, { requestId: 'other', code: 'REQUEST_NOT_CREATED', paymentCreated: false, requestClosed: true }]) assert.equal(canReleaseAttempt(data, requestId), false);
  assert.equal(canReleaseAttempt({ requestId, code: 'SLOT_UNAVAILABLE', paymentCreated: false, requestClosed: true }, requestId), true);
});
test('Recovery remains pending until the same payment or a durable closure is verified', () => {
  assert.deepEqual(validateRecoveryResponse({ requestId, state: 'pending' }, expected), { state: 'pending' });
  assert.deepEqual(validateRecoveryResponse({ ...checkout, state: 'checkout_ready' }, expected), { state: 'checkout_ready', checkoutUrl: checkout.checkoutUrl });
  assert.deepEqual(validateRecoveryResponse({ requestId, state: 'not_created', code: 'REQUEST_NOT_CREATED', paymentCreated: false, requestClosed: true }, expected), { state: 'not_created' });
  assert.deepEqual(validateRecoveryResponse({ ...checkout, state: 'closed', status: 'confirmed', requestClosed: true }, expected), { state: 'closed', status: 'confirmed' });
  for (const data of [{ requestId, state: 'not_found' }, { requestId, state: 'not_created', code: 'REQUEST_NOT_CREATED', paymentCreated: false }, { ...checkout, state: 'checkout_ready', totalCents: 66429 }, { ...checkout, state: 'closed', status: 'confirmed' }, { ...checkout, state: 'closed', status: 'pending', requestClosed: true }, { requestId: 'another-request', state: 'pending' }]) assert.throws(() => validateRecoveryResponse(data, expected));
});
test('Only verified confirmed status claims a completed booking', () => {
  for(const status of ['pending','open','failed','expired','canceled','anything']) assert.doesNotMatch(paymentMessage(status),/uw inspectie is geboekt/i);
  assert.match(paymentMessage('confirmed'),/uw inspectie is geboekt/i);
  assert.match(paymentMessage('paid_review_required'),/nog geen definitieve afspraak/i);
});
