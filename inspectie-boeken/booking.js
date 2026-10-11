import { BASE_CENTS, THERMAL_CENTS, RECOVERY_STORAGE_KEY, resolveBookingConfiguration, money, normalizePostcode, normalizeHouseNumber, subtotal, validateQuote, validateSlots, validateSelectedSlot, slotLabel, validateCheckout, createRecoveryRecord, validateRecoveryRecord, validateRecoveryResponse, canReleaseAttempt, paymentMessage } from './booking-core.mjs';

// Missing or invalid configuration fails closed. All calendar and payment
// credentials remain on the server.
let configuration;
let configurationError = '';
try { configuration = resolveBookingConfiguration(window.ROOFSIGNAL_BOOKING); }
catch (error) { configurationError = error.message; }
const configurationBlocked = Boolean(configurationError);
const connected = !configurationBlocked && configuration.mode === 'connected';
const apiBase = connected ? configuration.apiBase : null;
const el = id => document.getElementById(id);
const form = el('booking-form');
let quote = null;
let selectedSlot = null;
let availableSlots = [];
let availableDays = [];
let selectedDay = null;
let calendarMonth = null;
let loading = false;
let checkoutAttempt = null;
let recovery = null;
let recoveryBlocked = false;
let closedStatus = null;
let checkoutUrl = null;
let returnOrder = null;
let revision = 0;
let quoteExpiryTimer;
let checkingReturnStatus = false;

function message(id, text) {
  const target = el(id);
  if (target) { target.textContent = text; target.hidden = !text; }
}

function updateSummary() {
  const thermal = el('thermal').checked;
  el('summary-base').textContent = money(BASE_CENTS);
  el('summary-thermal').textContent = thermal ? money(THERMAL_CENTS) : 'Niet toegevoegd';
  el('summary-travel').textContent = quote ? money(quote.travelCents) : 'Na adrescontrole';
  el('summary-total').textContent = quote ? money(quote.totalCents) : recovery || returnOrder ? money((recovery || returnOrder).totalCents) : money(subtotal(thermal));
  el('address-result').hidden = !quote;
  el('summary-date').textContent = selectedSlot ? slotLabel(selectedSlot) : 'Nog te kiezen';
  if ((recovery || returnOrder) && !quote) {
    for (const id of ['summary-base', 'summary-thermal', 'summary-travel']) el(id).textContent = 'In uw bestaande opdracht';
    el('summary-date').textContent = 'Bij uw bestaande betaalopdracht';
  }
  const ready = connected && !recoveryBlocked && !loading && !checkingReturnStatus && (recovery || (quote && selectedSlot && el('termsAccepted').checked));
  el('checkout-button').disabled = !ready;
  el('checkout-button').hidden = Boolean(checkoutUrl);
  el('checkout-button').textContent = loading ? 'Even geduld…' : closedStatus ? 'Een nieuwe inspectie boeken' : 'Betalen';
  el('checkout-link').hidden = !checkoutUrl;
  el('check-address').disabled = configurationBlocked || loading || Boolean(recovery) || recoveryBlocked;
  updateCalendarControls();
}

function clearPaymentLink() {
  checkoutUrl = null;
  el('checkout-link').removeAttribute('href');
  el('checkout-link').hidden = true;
}

function showPaymentLink(validatedUrl) {
  checkoutUrl = validatedUrl;
  el('checkout-link').setAttribute('href', validatedUrl);
}

function clearQuote() {
  if (recovery || recoveryBlocked) return;
  revision += 1;
  clearTimeout(quoteExpiryTimer);
  quote = null;
  selectedSlot = null;
  availableSlots = [];
  availableDays = [];
  selectedDay = null;
  calendarMonth = null;
  el('booking-calendar').hidden = true;
  el('calendar-times').hidden = true;
  el('calendar-empty').hidden = false;
  el('calendar-days').replaceChildren();
  el('street').value = '';
  el('city').value = '';
  el('termsAccepted').checked = false;
  el('slots').replaceChildren();
  message('address-status', '');
  message('slot-status', connected ? '' : 'In deze conceptpagina zijn nog geen echte agendamomenten aangesloten.');
  updateSummary();
}

class BookingError extends Error {
  constructor(text, status = 0, data = null) { super(text); this.status = status; this.data = data; }
}

async function api(path, options = {}) {
  if (!connected) throw new BookingError('Dit is een conceptpagina. Er worden geen gegevens verstuurd en er kan nog niet worden geboekt of betaald.');
  let response;
  try {
    response = await fetch(apiBase + path, {
      ...options,
      credentials: apiBase.startsWith('/') ? 'same-origin' : 'omit',
      cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error',
      headers: { 'content-type': 'application/json', ...options.headers },
      signal: AbortSignal.timeout(60000)
    });
  } catch {
    throw new BookingError('De verbinding is onderbroken. Probeer over een ogenblik opnieuw.');
  }
  let data;
  try { data = await response.json(); }
  catch { throw new BookingError('De boekingsservice geeft nog geen bruikbaar antwoord.', response.status); }
  if (!response.ok) throw new BookingError(typeof data?.error === 'string' ? data.error : 'De aanvraag kon niet worden verwerkt.', response.status, data);
  return data;
}

const slotDay = slot => new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(slot.start));
// Calendar dates have no time zone; UTC keeps their grid position stable on
// devices outside the Netherlands and across daylight-saving changes.
const calendarDate = day => new Date(`${day}T12:00:00Z`);
const dayLabel = day => new Intl.DateTimeFormat('nl-NL', {timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(calendarDate(day));
const slotTime = instant => new Intl.DateTimeFormat('nl-NL', {timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit'}).format(new Date(instant));
const calendarLocked = () => !connected || !quote || loading || Boolean(recovery) || recoveryBlocked;

function updateCalendarControls() {
  const locked = calendarLocked();
  el('calendar-previous').disabled = locked || !calendarMonth || calendarMonth <= availableDays[0]?.slice(0, 7);
  el('calendar-next').disabled = locked || !calendarMonth || calendarMonth >= availableDays.at(-1)?.slice(0, 7);
  for (const button of el('calendar-days').querySelectorAll('button')) {
    button.disabled = locked || !availableDays.includes(button.value);
  }
  for (const input of el('slots').querySelectorAll('input')) input.disabled = locked;
}

function renderCalendar() {
  el('calendar-month').textContent = new Intl.DateTimeFormat('nl-NL', {timeZone:'UTC',month:'long',year:'numeric'}).format(calendarDate(`${calendarMonth}-01`));
  const days = el('calendar-days');
  days.replaceChildren();
  const first = calendarDate(`${calendarMonth}-01`);
  const offset = (first.getUTCDay() + 6) % 7; // Monday first.
  for (let i = 0; i < offset; i++) days.append(document.createElement('span'));
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  for (let number = 1; number <= count; number++) {
    const day = `${calendarMonth}-${String(number).padStart(2, '0')}`;
    const available = availableDays.includes(day);
    const button = document.createElement('button');
    button.type = 'button'; button.value = day;
    button.className = `calendar-control calendar-day${available ? ' available' : ''}`;
    button.textContent = String(number);
    button.setAttribute('aria-label', `${dayLabel(day)}${available ? '' : ', niet beschikbaar'}`);
    button.setAttribute('aria-pressed', String(day === selectedDay));
    button.setAttribute('aria-controls', 'calendar-times');
    button.addEventListener('click', () => {
      if (calendarLocked() || !available || day === selectedDay) return;
      selectedDay = day;
      for (const other of days.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other.value === day));
      renderSelectedDay();
    });
    days.append(button);
  }
  updateCalendarControls();
}

function renderSlots(slots) {
  availableSlots = slots;
  availableDays = [...new Set(slots.map(slotDay))].sort();
  selectedSlot = null;
  el('slots').replaceChildren();
  el('booking-calendar').hidden = !slots.length;
  el('calendar-empty').hidden = true;
  if (!slots.length) {
    message('slot-status', 'Er zijn nu geen online momenten beschikbaar voor deze inspectie. Neem contact op om een afspraak af te stemmen.');
    return;
  }
  // Retain the server's recommended first day; a time still needs an explicit choice.
  selectedDay = slotDay(slots[0]);
  calendarMonth = selectedDay.slice(0, 7);
  renderCalendar();
  renderSelectedDay();
}

function renderSelectedDay() {
  selectedSlot = null;
  el('slots').replaceChildren();
  el('calendar-times').hidden = !selectedDay;
  el('calendar-date').textContent = selectedDay ? dayLabel(selectedDay) : '';
  message('slot-status', selectedDay ? '' : 'Deze maand zijn er geen beschikbare momenten. Kies een andere maand.');
  for (const slot of availableSlots.filter(slot => slotDay(slot) === selectedDay).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))) {
    const label = document.createElement('label'); label.className = 'slot-choice';
    const input = document.createElement('input');
    input.type = 'radio'; input.name = 'slot'; input.value = slot.id; input.required = true;
    const text = document.createElement('span');
    text.textContent = `${slotTime(slot.start)}–${slotTime(slot.end)}`;
    if (slot.recommended === true) {
      const badge = document.createElement('small'); badge.textContent = 'Aanbevolen'; text.append(badge);
    }
    input.setAttribute('aria-label', slotLabel(slot) + (slot.recommended === true ? ' · Aanbevolen: we zijn al in de buurt' : ''));
    input.addEventListener('change', () => {
      if (calendarLocked() || slotDay(slot) !== selectedDay || !availableSlots.includes(slot)) return;
      selectedSlot = slot; updateSummary(); window.RoofSignalAnalytics?.track('Inspectie moment gekozen');
    });
    label.append(input, text); el('slots').append(label);
  }
  updateSummary();
}
for (const [id, direction] of [['calendar-previous', -1], ['calendar-next', 1]]) {
  el(id).addEventListener('click', () => {
    if (calendarLocked() || el(id).disabled) return;
    const date = calendarDate(`${calendarMonth}-01`);
    date.setUTCMonth(date.getUTCMonth() + direction);
    calendarMonth = date.toISOString().slice(0, 7);
    selectedDay = availableDays.find(day => day.startsWith(calendarMonth)) || null;
    renderCalendar();
    renderSelectedDay();
  });
}

el('check-address').addEventListener('click', async () => {
  if (loading || recovery || recoveryBlocked) return;
  message('booking-error', '');
  if (!connected) {
    message('address-status', 'Dit is een conceptpagina. De adrescontrole, echte agenda en betaling worden pas actief na aansluiting op RoofSignal. Uw invoer blijft in deze pagina.');
    return;
  }
  try {
    const address = {
      postcode: normalizePostcode(el('postcode').value),
      houseNumber: normalizeHouseNumber(el('houseNumber').value)
    };
    for (const id of ['postcode', 'houseNumber']) if (!el(id).reportValidity()) return;
    if (!window.RoofSignalFormSecurity) throw new Error('Formulierbeveiliging wordt nog geladen. Probeer het over een ogenblik opnieuw.');
    window.RoofSignalFormSecurity.ensureReady(form);
    const turnstileToken = window.RoofSignalFormSecurity.getPayload(form).turnstile_token;
    const thermal = el('thermal').checked;
    clearQuote(); const requestRevision = revision;
    loading = true; el('check-address').disabled = true; updateSummary();
    message('address-status', 'Adres en beschikbare momenten controleren…');
    const received = await api('/quote', { method: 'POST', body: JSON.stringify({ address, thermal, turnstileToken, campaign: window.RoofSignalAnalytics?.campaign || null }) });
    if (requestRevision !== revision) return;
    quote = validateQuote(received, thermal, Date.now(), address);
    window.RoofSignalAnalytics?.track('Inspectie prijs gecontroleerd', { thermography: thermal });
    el('street').value = quote.address.street;
    el('city').value = quote.address.city;
    message('address-status', '');
    quoteExpiryTimer = setTimeout(() => {
      if (!recovery) { clearQuote(); message('address-status', 'Uw prijsopgave is verlopen. Controleer uw adres opnieuw voor actuele prijzen en tijden.'); }
    }, Math.min(Date.parse(quote.expiresAt) - Date.now(), 2147483647));
    message('slot-status', 'Beschikbare momenten ophalen…');
    // The current server prepares both in one call. Retain the separate route
    // for old server versions during rollout; malformed inline data fails closed.
    const availability = received.availability ?? await api(`/availability?quoteId=${encodeURIComponent(quote.quoteId)}`);
    if (requestRevision !== revision) return;
    const checkedSlots = validateSlots(availability, Date.now(), quote.quoteId);
    renderSlots(checkedSlots);
    window.RoofSignalAnalytics?.track('Inspectie beschikbaarheid', { eligible: checkedSlots.length > 0 });
  } catch (error) {
    window.RoofSignalAnalytics?.track('Inspectie stap mislukt', { step: quote ? 'beschikbaarheid' : 'adres' });
    clearQuote(); message('address-status', error.message);
  } finally {
    window.RoofSignalFormSecurity?.reset(form);
    loading = false; el('check-address').disabled = false; updateSummary();
  }
});

function lockOrder(locked = true) {
  for (const input of form.querySelectorAll('input, textarea, select, #check-address, .calendar-control')) input.disabled = locked;
}

function persistRecovery(record) {
  const serialized = JSON.stringify(record);
  try {
    sessionStorage.setItem(RECOVERY_STORAGE_KEY, serialized);
    if (sessionStorage.getItem(RECOVERY_STORAGE_KEY) !== serialized) throw new Error();
  } catch {
    recoveryBlocked = true;
    lockOrder();
    throw new BookingError('Uw browser kan de bestaande betaalopdracht niet veilig onthouden. Er is geen nieuw betaalverzoek verstuurd. Neem contact op met RoofSignal.');
  }
  recovery = record;
}

// Call only after a verified terminal result or explicit not-created fence.
function releaseRecovery() {
  try {
    sessionStorage.removeItem(RECOVERY_STORAGE_KEY);
    if (sessionStorage.getItem(RECOVERY_STORAGE_KEY) !== null) throw new Error();
  } catch {
    recoveryBlocked = true;
    throw new BookingError('De afgehandelde betaalopdracht kan niet veilig worden gewist. Neem contact op met RoofSignal.');
  }
  recovery = null; checkoutAttempt = null; closedStatus = null; returnOrder = null;
  clearPaymentLink();
  lockOrder(false); form.hidden = false;
  const url = new URL(window.location.href);
  url.searchParams.delete('booking');
  window.history.replaceState(null, '', url);
  clearQuote();
}

function handleCheckoutError(error) {
  clearPaymentLink();
  message('booking-status', '');
  if (recovery && canReleaseAttempt(error.data, recovery.requestId)) {
    try { releaseRecovery(); }
    catch (storageError) { message('booking-error', storageError.message); return; }
  }
  message('booking-error', `${error.message}${recovery ? ' Klik op Betalen om opnieuw te proberen.' : ''}`);
}

function applyAttemptResponse(data, resume = false) {
  clearPaymentLink();
  const result = validateRecoveryResponse(data, recovery);
  if (result.state === 'not_created') {
    releaseRecovery();
    message('booking-status', data.reason === 'SLOT_UNAVAILABLE'
      ? 'Dit moment is inmiddels bezet. Er is geen betaling aangemaakt. Controleer uw adres opnieuw en kies een ander moment.'
      : 'Er is geen betaling aangemaakt. Controleer uw adres opnieuw voordat u een nieuwe opdracht start.');
  } else if (result.state === 'closed') {
    if (['confirmed', 'paid_review_required'].includes(result.status)) closedStatus = result.status;
    else releaseRecovery();
    message('booking-status', paymentMessage(result.status));
  } else if (result.state === 'checkout_ready') {
    showPaymentLink(result.checkoutUrl);
    message('booking-status', resume
      ? 'U gaat naar de beveiligde betaalpagina van Mollie.'
      : 'Uw betaalpagina staat klaar. Klik op Betalen.');
    if (resume) window.location.assign(result.checkoutUrl);
  } else {
    message('booking-status', 'Uw betaalpagina wordt klaargezet. Probeer over een ogenblik opnieuw via Betalen.');
  }
}

async function recoverExisting(resume = false) {
  if (!connected || !recovery || loading || recoveryBlocked) return;
  clearPaymentLink();
  loading = true; lockOrder(); updateSummary();
  message('booking-status', 'Uw betaalpagina ophalen…');
  message('booking-error', '');
  try {
    const data = await api('/recover', { method: 'POST', body: JSON.stringify({ requestId: recovery.requestId }) });
    applyAttemptResponse(data, resume);
  } catch (error) { handleCheckoutError(error); }
  finally { loading = false; updateSummary(); }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (loading || !connected || recoveryBlocked) return;
  message('booking-error', '');
  if (recovery) {
    if (closedStatus) {
      try { releaseRecovery(); message('booking-status', ''); }
      catch (error) { handleCheckoutError(error); }
      updateSummary();
      return;
    }
    await recoverExisting(true);
    return;
  }
  if (!quote || !selectedSlot) return message('booking-error', 'Controleer eerst uw adres en kies een beschikbaar moment.');
  if (!checkoutAttempt) {
    try {
      validateQuote(quote, el('thermal').checked, Date.now(), { postcode: el('postcode').value, houseNumber: el('houseNumber').value });
      validateSelectedSlot(selectedSlot);
    }
    catch (error) { clearQuote(); return message('booking-error', error.message); }
    if (!form.reportValidity()) return;
    if (!el('termsAccepted').checked) return message('booking-error', 'Controleer uw akkoord met de voorwaarden.');
    checkoutAttempt = {
      requestId: crypto.randomUUID(), quoteId: quote.quoteId, slotId: selectedSlot.id,
      customer: { name: el('name').value.trim(), email: el('email').value.trim(), phone: el('phone').value.trim(), notes: el('notes').value.trim() },
      terms: { accepted: true, version: quote.termsVersion, earlyStartRequested: false }
    };
    // Persist only opaque IDs and the approved EUR amount BEFORE any request.
    // Reloads recover by requestId; an uncertain request is never recreated.
    try { persistRecovery(createRecoveryRecord(checkoutAttempt, quote)); }
    catch (error) { checkoutAttempt = null; message('booking-error', error.message); updateSummary(); return; }
    lockOrder();
  }
  loading = true; updateSummary();
  try {
    const payment = await api('/checkout', { method: 'POST', body: JSON.stringify(checkoutAttempt) });
    // This is a funnel step, never proof of payment or a counted sale.
    window.RoofSignalAnalytics?.track('Inspectie betaling gestart');
    applyAttemptResponse(payment, true);
  } catch (error) {
    window.RoofSignalAnalytics?.track('Inspectie stap mislukt', { step: 'betaling' });
    handleCheckoutError(error);
  } finally { loading = false; updateSummary(); }
});

for (const id of ['postcode', 'houseNumber', 'thermal']) {
  el(id).addEventListener(id === 'thermal' ? 'change' : 'input', clearQuote);
}
el('termsAccepted').addEventListener('change', updateSummary);

async function showReturnStatus() {
  const token = new URLSearchParams(window.location.search).get('booking');
  if (!connected || checkingReturnStatus || !token || !/^[A-Za-z0-9_-]{32,200}$/.test(token)) return;
  // A redirect parameter can select a record; it never proves payment.
  checkingReturnStatus = true;
  clearPaymentLink();
  updateSummary();
  form.hidden = true;
  el('booking-status-actions').replaceChildren();
  message('booking-status', 'Uw betaalstatus controleren…');
  let retryRequired = true;
  try {
    const data = await api(`/status?token=${encodeURIComponent(token)}`);
    const status = data?.status;
    if (data.state === 'checkout_ready') {
      // The opaque return token identifies the server order when this browser
      // has no local record. Never trust a URL without validating its order.
      const expected = recovery || validateRecoveryRecord({
        version: 1, requestId: data.requestId, quoteId: data.quoteId,
        slotId: data.slotId, currency: data.currency, totalCents: data.totalCents
      });
      const result = validateRecoveryResponse(data, expected);
      returnOrder = expected;
      showPaymentLink(result.checkoutUrl);
    } else if (data.state === 'closed' && recovery) {
      applyAttemptResponse(data);
    }
    message('booking-status', paymentMessage(status));
    if (['failed', 'canceled', 'expired'].includes(status) && !recovery && !recoveryBlocked) {
      returnOrder = null;
      form.hidden = false;
    }
    retryRequired = !['confirmed', 'paid_review_required', 'failed', 'canceled', 'expired'].includes(status);
  } catch (error) {
    clearPaymentLink();
    message('booking-status', `${error.message} Uw afspraak is nog niet bevestigd. U kunt de betaalstatus opnieuw controleren.`);
  } finally {
    checkingReturnStatus = false;
    updateSummary();
    // A failed retry must leave another retry available. Keep action controls
    // outside the live-region text and outside the potentially hidden form.
    if (retryRequired) {
      const retry = document.createElement('button');
      retry.type = 'button'; retry.className = 'button button--secondary'; retry.textContent = 'Betaalstatus opnieuw controleren';
      retry.addEventListener('click', () => { void showReturnStatus(); });
      el('booking-status-actions').append(retry);
    }
  }
  el('booking-status').scrollIntoView({ behavior: 'auto', block: 'center' });
}

if (connected) {
  document.querySelector('.concept-strip')?.remove();
  document.querySelector('[data-preview-note]')?.remove();
  message('booking-status', '');
  try {
    const stored = sessionStorage.getItem(RECOVERY_STORAGE_KEY);
    if (stored !== null) recovery = validateRecoveryRecord(JSON.parse(stored));
  } catch {
    recoveryBlocked = true;
    message('booking-error', 'Een eerdere betaalopdracht kan niet veilig worden hersteld. Neem contact op met RoofSignal voordat u opnieuw boekt.');
  }
}
if (configurationBlocked) message('booking-error', configurationError);
// HTML starts every input/textarea/select and both action buttons disabled.
// Enable controls only after all submit and preview guards have been attached.
// Preview neither reads/writes recovery storage nor calls a network adapter.
lockOrder(configurationBlocked || Boolean(recovery) || recoveryBlocked);
clearQuote();
updateSummary();
void (async () => {
  if (connected && recovery) await recoverExisting(false);
  await showReturnStatus();
})();
