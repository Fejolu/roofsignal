import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase, command, USERS } from '../src/database.mjs';
import { createWebsiteIntakeHandler } from '../src/website-intake-handler.mjs';
import { sendIntake } from '../../../supabase/functions/_shared/erp-intake.mjs';

test('all three source routes pass the real signed transport and SQL boundary, with safe repeat delivery', async t => {
  const db = await openDatabase(); t.after(() => db.close());
  const origin = 'https://roofsignal-erp-test.pages.dev', secret = 'a1'.repeat(32), when = '2026-10-12T19:00:00Z';
  const receiver = createWebsiteIntakeHandler({ origin, secret, adapter: {
    websiteIntake: payload => db.transaction(async tx => {
      await tx.exec('set local role service_role');
      return (await tx.query('select public.roofsignal_erp_intake($1::jsonb) as result', [JSON.stringify(payload)])).rows[0].result;
    }),
  } });
  const transport = (url, options) => receiver(new Request(url, options));
  const consumer = { id: randomUUID(), mode: 'live', reference: 'RS-FICTIEF-CONSUMENT', status: 'confirmed',
    payment_id: 'tr_fictief123', payment_status: 'paid', calendar_event_id: 'fictieve-agendareferentie',
    customer: { name: 'Fictieve eigenaar', email: 'owner@example.invalid', phone: '0612345678', notes: 'Voorbeeld' },
    terms: { version: '2026-10-11-consumer-los', accepted: true, earlyStartRequested: true }, terms_accepted_at: when,
    slot_start: '2026-10-20T08:00:00Z', slot_end: '2026-10-20T08:45:00Z', created_at: when, updated_at: when,
    quote: { id: randomUUID(), address: { postcode: '7316BH', houseNumber: '4', street: 'Voorbeeldstraat', city: 'Apeldoorn', country: 'NL' },
      destination: 'Voorbeeldstraat 4', inspection_type: 'thermal', thermal: true, pricing_version: '2026-10-11-equal-standalone',
      base_cents: 0, thermal_cents: 36179, travel_cents: 4235, total_cents: 40414, distance_meters: 52000,
      travel_description: 'Reiskosten', terms_version: '2026-10-11-consumer-los', policy_version: '2026-10-10', campaign: null, created_at: when } };
  const pilot = { id: randomUUID(), reference: 'RS-PARKEN-FICTIEF', name: 'Fictieve pilothouder', email: 'pilot@example.invalid',
    phone: '0612345679', street: 'Voorbeeldstraat', house_number: '6', postcode: '7316BH', slot_date: '2026-10-20', slot_time: '16:00-18:00',
    notes: 'Fictieve afspraak', status: 'confirmed', source: 'de-parken-directmail-2026', terms_accepted_at: when,
    early_start_requested_at: null, thermography_interest_at: when, thermography_selected: false, offer_version: null,
    inspection_excl_cents: null, thermography_excl_cents: null, total_incl_cents: null, terms_version: null,
    created_at: when, updated_at: when, confirmation_sent_at: when, organization_id: null, property_id: null, appointment_id: null, inspection_id: null };
  const vve = { id: randomUUID(), request_type: 'price', name: 'Fictief VvE-contact', organization: 'VvE Voorbeeld',
    email: 'vve@example.invalid', segment: 'VvE / VvE-beheerder', postcode: '7316BH', object_complexity: 'single', site_access: null,
    scope: 'Thermografie VvE', message: 'Fictieve aanvraag voor 8 adressen; staffelprijs is een indicatie.', status: 'new',
    source_path: '/inspectie-boeken/', created_at: when, intake_details: null };
  for (const [source, record] of [['consumer', consumer], ['parken', pilot], ['vve', vve]]) {
    const event = { source, source_id: record.id, revision: 1, changed_at: when, record };
    assert.equal((await sendIntake(event, secret, { fetch: transport })).accepted, true);
    assert.equal((await sendIntake(event, secret, { fetch: transport })).accepted, true);
  }
  const items = (await command(db, USERS.staff, 'intake.snapshot')).items;
  assert.equal(items.length, 3);
  assert.equal(items.find(item => item.source === 'consumer').payment_status, 'paid');
  assert.equal(items.find(item => item.source === 'parken').payment_status, null);
  assert.equal(items.find(item => item.source === 'vve').order_id, null);
  const orders = (await command(db, USERS.staff, 'snapshot')).orders;
  assert.equal(orders.length, 2);
  assert.equal(orders.find(item => item.service === 'thermal').status, 'active');
  assert.equal((await db.query('select count(*)::int as n from erp.website_intake_revisions')).rows[0].n, 3);
  assert.equal((await db.query('select count(*)::int as n from erp.access_grants')).rows[0].n, 0);
  await assert.rejects(command(db, USERS.customer, 'intake.snapshot'), /Geen toegang/);
  assert.equal((await command(db, USERS.customer, 'snapshot')).properties.length, 0);
});
