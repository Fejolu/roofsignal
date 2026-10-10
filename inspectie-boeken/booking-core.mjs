// UI guards only. The connected server must independently enforce every rule.
export const BASE_CENTS = 36179;
export const THERMAL_CENTS = 30250;
export const TIME_ZONE = 'Europe/Amsterdam';
export const RECOVERY_STORAGE_KEY = 'roofsignal.consumerBooking.pending.v1';

// Public routing only. Adding a provider requires a reviewed source change;
// runtime configuration cannot authorise an arbitrary destination for customer
// details or recovery tokens. A missing config remains a local preview.
export function resolveBookingConfiguration(configuration = { mode: 'preview', apiBase: '/api/consumer-booking' }) {
  const trustedApiBases = new Set([
    '/api/consumer-booking',
    'https://kakpticlxlaxtebhsuoh.supabase.co/functions/v1/consumer-booking'
  ]);
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)
    || Object.keys(configuration).length !== 2
    || Object.keys(configuration).some(key => !['mode', 'apiBase'].includes(key))
    || !['preview', 'connected'].includes(configuration.mode)
    || !trustedApiBases.has(configuration.apiBase)) {
    throw new Error('De boekingskoppeling is niet juist ingesteld. Neem voor een inspectie contact op met RoofSignal.');
  }
  return Object.freeze({ mode: configuration.mode, apiBase: configuration.apiBase });
}

const requestIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const nonEmptyString = value => typeof value === 'string' && Boolean(value.trim());

export function money(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Ongeldig bedrag.');
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export function normalizePostcode(value) {
  const postcode = String(value).replace(/\s/g, '').toUpperCase();
  if (!/^[1-9][0-9]{3}[A-Z]{2}$/.test(postcode)) throw new Error('Vul een volledige Nederlandse postcode in.');
  return postcode;
}

export function normalizeHouseNumber(value) {
  const number = String(value).trim().replace(/\s+/g, ' ').toUpperCase();
  if (number.length > 20 || !/^[1-9][0-9]{0,6}[ A-Z0-9/-]*$/.test(number)) throw new Error('Vul een huisnummer in, eventueel met toevoeging.');
  return number;
}

export function subtotal(thermal) {
  return BASE_CENTS + (thermal ? THERMAL_CENTS : 0);
}

function validInstant(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}

export function validateQuote(data, thermal, now = Date.now(), requestedAddress = null) {
  if (!data || data.serviceable !== true) throw new Error('Voor dit adres is eerst afstemming nodig. Neem contact op met RoofSignal.');
  if (typeof data.quoteId !== 'string' || data.quoteId.length < 16) throw new Error('De prijsopgave is onvolledig.');
  if (data.currency !== 'EUR' || data.baseCents !== BASE_CENTS || data.thermalCents !== (thermal ? THERMAL_CENTS : 0)) throw new Error('De prijsopgave wijkt af van deze pagina. Neem contact op voordat u betaalt.');
  if (!Number.isSafeInteger(data.travelCents) || data.travelCents < 0) throw new Error('De reiskosten zijn nog niet vastgesteld. Er kan nog niet worden afgerekend.');
  if (!Number.isSafeInteger(data.totalCents) || data.totalCents !== subtotal(thermal) + data.travelCents) throw new Error('De totaalprijs kon niet worden gecontroleerd.');
  if (!validInstant(data.expiresAt) || Date.parse(data.expiresAt) <= now) throw new Error('Deze prijsopgave is verlopen. Controleer uw adres opnieuw.');
  if (typeof data.termsVersion !== 'string' || !data.termsVersion) throw new Error('De opdrachtvoorwaarden ontbreken.');
  if (!nonEmptyString(data.travelDescription)) throw new Error('De toelichting op de reiskosten ontbreekt.');
  const address = data.address;
  if (!address || address.country !== 'NL' || !nonEmptyString(address.street) || !nonEmptyString(address.city)) throw new Error('Het adres is nog niet automatisch gecontroleerd.');
  const postcode = normalizePostcode(address.postcode);
  const houseNumber = normalizeHouseNumber(address.houseNumber);
  if (requestedAddress && (postcode !== normalizePostcode(requestedAddress.postcode) || houseNumber.replace(/\s/g, '') !== normalizeHouseNumber(requestedAddress.houseNumber).replace(/\s/g, ''))) throw new Error('Het gevonden adres hoort niet bij uw postcode en huisnummer. Controleer uw invoer.');
  return { ...data, address: { postcode, houseNumber, street: address.street.trim(), city: address.city.trim(), country: 'NL' } };
}

export function validateSelectedSlot(slot, now = Date.now()) {
  if (!slot || !nonEmptyString(slot.id) || !validInstant(slot.start) || !validInstant(slot.end) || Date.parse(slot.start) <= now || Date.parse(slot.end) <= Date.parse(slot.start)) throw new Error('Dit moment is niet meer geldig. Controleer uw adres opnieuw om actuele momenten op te halen.');
  return slot;
}

export function validateSlots(data, now = Date.now(), expectedQuoteId = null) {
  if (!data || !Array.isArray(data.slots)) throw new Error('De beschikbaarheid kon niet worden gecontroleerd.');
  if (expectedQuoteId && data.quoteId !== expectedQuoteId) throw new Error('De beschikbare momenten horen niet bij uw prijsopgave.');
  const seen = new Set();
  return data.slots.filter(slot => {
    try { validateSelectedSlot(slot, now); } catch { return false; }
    if (seen.has(slot.id)) return false;
    seen.add(slot.id);
    return true;
  }).sort((a, b) => Number(b.recommended === true) - Number(a.recommended === true) || Date.parse(a.start) - Date.parse(b.start));
}

function amsterdamDay(value) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = key => Number(parts.find(p => p.type === key).value);
  return Date.UTC(part('year'), part('month') - 1, part('day'));
}

export function needsEarlyStart(start, now = new Date()) {
  // Withdrawal period starts the day after the agreement. Server repeats this
  // against the actual agreement date and considers any statutory extension.
  return amsterdamDay(new Date(start)) < amsterdamDay(now) + 15 * 86400000;
}

export function slotLabel(slot) {
  const day = new Intl.DateTimeFormat('nl-NL', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = new Intl.DateTimeFormat('nl-NL', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });
  return `${day.format(new Date(slot.start))}, ${time.format(new Date(slot.start))}–${time.format(new Date(slot.end))}`;
}

function validateOrderIdentity(data, expected) {
  if (!expected || !requestIdPattern.test(expected.requestId) || !nonEmptyString(expected.quoteId) || !nonEmptyString(expected.slotId) || expected.currency !== 'EUR' || !Number.isSafeInteger(expected.totalCents) || expected.totalCents <= 0) throw new Error('De oorspronkelijke betaalopdracht ontbreekt.');
  if (!data || !nonEmptyString(data.reference) || data.requestId !== expected.requestId || data.quoteId !== expected.quoteId || data.slotId !== expected.slotId || data.currency !== 'EUR' || data.currency !== expected.currency || data.totalCents !== expected.totalCents) throw new Error('De betaalopdracht hoort niet bij uw gekozen inspectie, moment en totaalprijs.');
}

export function validateCheckout(data, expected) {
  validateOrderIdentity(data, expected);
  const url = new URL(data.checkoutUrl);
  const hosts = new Set(['www.mollie.com', 'checkout.mollie.com']);
  if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Er is geen geldige Mollie-betaalpagina ontvangen.');
  return url.href;
}

// Only opaque IDs and the accepted currency/amount are stored. Never add
// customer details, address, notes, a Mollie URL or an API credential here.
export function validateRecoveryRecord(data) {
  const keys = ['version', 'requestId', 'quoteId', 'slotId', 'currency', 'totalCents'];
  if (!data || data.version !== 1 || Object.keys(data).some(key => !keys.includes(key)) || !requestIdPattern.test(data.requestId) || !nonEmptyString(data.quoteId) || data.quoteId.length < 16 || !nonEmptyString(data.slotId) || data.currency !== 'EUR' || !Number.isSafeInteger(data.totalCents) || data.totalCents <= 0) throw new Error('De bestaande betaalopdracht kan niet veilig worden hersteld. Neem contact op met RoofSignal voordat u opnieuw boekt.');
  return { version: 1, requestId: data.requestId, quoteId: data.quoteId, slotId: data.slotId, currency: data.currency, totalCents: data.totalCents };
}

export function createRecoveryRecord(attempt, quote) {
  return validateRecoveryRecord({ version: 1, requestId: attempt.requestId, quoteId: attempt.quoteId, slotId: attempt.slotId, currency: quote.currency, totalCents: quote.totalCents });
}

// HTTP status alone never proves that an earlier request cannot still create
// a payment. requestClosed means the server has durably fenced this requestId,
// including delayed/retried checkout requests, before returning the response.
export function canReleaseAttempt(data, expectedRequestId) {
  const codes = new Set(['QUOTE_EXPIRED', 'SLOT_UNAVAILABLE', 'INVALID_REQUEST', 'TRAVEL_UNAVAILABLE', 'REQUEST_NOT_CREATED']);
  return Boolean(data && requestIdPattern.test(expectedRequestId) && data.requestId === expectedRequestId && data.paymentCreated === false && data.requestClosed === true && codes.has(data.code));
}

// POST /recover { requestId } returns exactly one of:
// { requestId, state: 'pending' }
// { requestId, state: 'checkout_ready', ...checkoutResponse }
// { requestId, state: 'closed', quoteId, slotId, currency, totalCents,
//   reference, status, requestClosed: true }
// { requestId, state: 'not_created', code: 'REQUEST_NOT_CREATED',
//   paymentCreated: false, requestClosed: true }
// 'not found' without a durable requestClosed fence is NOT safe to clear.
export function validateRecoveryResponse(data, expected) {
  if (!data || data.requestId !== expected?.requestId) throw new Error('Het herstelantwoord hoort niet bij uw betaalopdracht.');
  if (data.state === 'pending') return { state: 'pending' };
  if (data.state === 'checkout_ready') return { state: 'checkout_ready', checkoutUrl: validateCheckout(data, expected) };
  if (data.state === 'not_created' && data.code === 'REQUEST_NOT_CREATED' && canReleaseAttempt(data, expected.requestId)) return { state: 'not_created' };
  if (data.state === 'closed' && data.requestClosed === true && ['confirmed', 'paid_review_required', 'failed', 'canceled', 'expired'].includes(data.status)) {
    validateOrderIdentity(data, expected);
    return { state: 'closed', status: data.status };
  }
  throw new Error('De bestaande betaalopdracht is nog niet veilig afgehandeld. Start geen tweede boeking.');
}

export function paymentMessage(status) {
  const states = {
    confirmed: 'Uw betaling is ontvangen en uw inspectie is geboekt. Het weers- en uitvoeringsvoorbehoud blijft gelden.',
    paid_review_required: 'Uw betaling is ontvangen. RoofSignal stemt de uitvoering nog met u af; er is nog geen definitieve afspraak.',
    pending: 'Uw betaling wordt nog gecontroleerd. Start geen tweede boeking.',
    open: 'De betaling is nog niet afgerond. Uw afspraak is nog niet bevestigd.',
    failed: 'De betaling is niet gelukt. Uw afspraak is niet bevestigd.',
    canceled: 'De betaling is geannuleerd. Uw afspraak is niet bevestigd.',
    expired: 'De betaalopdracht is verlopen. Uw afspraak is niet bevestigd.'
  };
  return states[status] || 'De betaalstatus is nog niet bekend. Uw afspraak is nog niet bevestigd. Neem bij twijfel contact op met RoofSignal.';
}
