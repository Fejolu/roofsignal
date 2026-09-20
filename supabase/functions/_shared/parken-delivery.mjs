import { orderLines, PARKEN_OFFER_VERSION } from './parken-offer.mjs';

export const INTERNAL_EMAIL = 'ferry@roofsignal.nl';
export const ODOO_EMAIL = 'de-parken-aanmeldingen@roofsignal.odoo.com';
export const ODOO_PROJECT_URL = 'https://roofsignal.odoo.com/odoo/project/1/tasks';
export const TEST_REFERENCE = 'RS-PARKEN-TEST-20260920';
const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const oneLine = (v) => String(v ?? '').replace(/[\r\n]/g,' ').trim();

export function internalTestBooking() {
  return { reference: TEST_REFERENCE, name: 'TEST RoofSignal - geen klant', email: INTERNAL_EMAIL,
    phone: '085 21 28 019', street: 'TESTOBJECT - geen bezoekadres', house_number: '', postcode: 'TEST',
    slot_date: '2026-10-01', slot_time: '16:00-18:00', status: 'TEST - NIET UITVOEREN',
    notes: 'Controle website -> inbox Ferry + Odoo. Geen afspraak, order, factuur of betalingsverplichting.',
    source: 'internal-integration-test', offer_version: PARKEN_OFFER_VERSION,
    thermography_selected: true, inspection_excl_cents: 29900, thermography_excl_cents: 25000, total_incl_cents: 66429 };
}

export function deliveryPayload(job, sender) {
  const b=job.booking_snapshot;
  if (!b || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) || b.reference!==job.reference) throw new Error('INVALID_BOOKING_SNAPSHOT');
  const heading=job.is_test ? '[TEST - NIET UITVOEREN] De Parken' : 'Nieuwe aanmelding De Parken';
  const address=`${oneLine(b.street)} ${oneLine(b.house_number)}, ${oneLine(b.postcode)} Apeldoorn`;
  const rows=[
    ['Referentie',b.reference],['Naam',b.name],['E-mail klant',b.email],['Telefoon',b.phone],
    ['Object',address],['Gekozen datum',b.slot_date],['Gekozen tijdvenster',b.slot_time],
    ['Thermografische inspectie',b.thermography_selected ? 'Ja' : 'Nee'],
    ['Status website',b.status],['Voorwaarden geaccepteerd',b.terms_accepted_at || (job.is_test ? 'TEST' : 'Niet vastgelegd')],
    ['Uitvoering binnen bedenktijd gevraagd',b.early_start_requested_at ? 'Ja' : 'Nee'],
    ['Bijzonderheden',b.notes || 'Geen'],['Herkomst',b.source],
  ];
  const prices=orderLines(b);
  const intro=job.is_test ? 'INTERNE TEST. Deze registratie is geen echte opdracht en reserveert geen plek in de planning.'
    : 'Nieuwe websiteboeking. Controleer de planning en neem zo nodig contact op met de klant. Contactgegevens en de geboekte opties staan hieronder.';
  return {
    sender, to:[{email:INTERNAL_EMAIL,name:'Ferry Joosten'},{email:ODOO_EMAIL,name:'RoofSignal - De Parken'}],
    replyTo:{email:b.email,name:oneLine(b.name)},
    subject:`${heading} | ${oneLine(b.reference)} | ${address}`,
    headers:{'X-Mailin-Track':'0',idempotencyKey:job.id}, tags:['parken-booking',job.is_test ? 'parken-test' : 'parken-live'],
    textContent:[heading,intro,'',...rows.map(([k,v])=>`${k}: ${v}`),'',...prices,'',`Odoo: ${ODOO_PROJECT_URL}`].join('\n'),
    htmlContent:`<!doctype html><html><body style="font:15px Arial,sans-serif;color:#17201d"><h1>${esc(heading)}</h1><p>${esc(intro)}</p><table>${rows.map(([k,v])=>`<tr><th style="text-align:left;vertical-align:top;padding:5px 16px 5px 0">${esc(k)}</th><td style="white-space:pre-wrap;padding:5px 0">${esc(v)}</td></tr>`).join('')}</table><h2>Geboekte inspectie</h2>${prices.map(v=>`<p>${esc(v)}</p>`).join('')}<p><a href="${ODOO_PROJECT_URL}">Open De Parken in Odoo</a></p></body></html>`,
  };
}

export async function sendDelivery(payload,apiKey,fetcher=fetch) {
  if (!apiKey) throw new Error('BREVO_NOT_CONFIGURED');
  const response=await fetcher('https://api.brevo.com/v3/smtp/email',{
    method:'POST',headers:{'api-key':apiKey,accept:'application/json','Content-Type':'application/json'},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(20000),
  });
  const result=await response.json().catch(()=>({}));
  if (response.ok && typeof result.messageId==='string') return {messageId:result.messageId};
  // A duplicate idempotency key means the identical request was already accepted.
  if (result.code==='duplicate_parameter' && /idempoten/i.test(result.message||'')) return {messageId:null,alreadyAccepted:true};
  // Do not log provider response bodies: they can contain customer details.
  throw new Error(`BREVO_HTTP_${response.status}`);
}
