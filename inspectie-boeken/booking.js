import { BASE_CENTS, THERMAL_CENTS, RECOVERY_STORAGE_KEY, resolveBookingConfiguration, money, normalizePostcode, normalizeHouseNumber, subtotal, validateQuote, validateSlots, validateSelectedSlot, needsEarlyStart, slotLabel, validateCheckout, createRecoveryRecord, validateRecoveryRecord, validateRecoveryResponse, canReleaseAttempt, paymentMessage } from './booking-core.mjs';

// Deliberately off until the LIVE site's existing server integrations are wired
// and verified. No public key, calendar token or Mollie secret belongs here.
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
let loading = false;
let checkoutAttempt = null;
let recovery = null;
let recoveryBlocked = false;
let closedStatus = null;
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
  message('summary-travel-details', quote ? quote.travelDescription : '');
  el('summary-total').textContent = quote ? money(quote.totalCents) : recovery ? money(recovery.totalCents) : `${money(subtotal(thermal))} + reiskosten`;
  el('summary-date').textContent = selectedSlot ? slotLabel(selectedSlot) : 'Nog te kiezen';
  if (recovery && !quote) {
    for (const id of ['summary-base', 'summary-thermal', 'summary-travel']) el(id).textContent = 'In uw bestaande opdracht';
    el('summary-date').textContent = 'Bij uw bestaande betaalopdracht';
  }
  const ready = connected && !recoveryBlocked && !loading && (recovery || (quote && selectedSlot && el('termsAccepted').checked));
  el('checkout-button').disabled = !ready;
  el('checkout-button').textContent = loading ? 'Even geduld…' : closedStatus ? 'Een nieuwe inspectie boeken' : recovery ? 'Bestaande betaalopdracht controleren' : quote ? `Boek en betaal ${money(quote.totalCents)}` : 'Boek en betaal via Mollie';
  el('check-address').disabled = configurationBlocked || loading || Boolean(recovery) || recoveryBlocked;
  const consentRequired = selectedSlot && needsEarlyStart(selectedSlot.start);
  el('earlyStartRequested').required = Boolean(consentRequired);
  message('early-start-hint', consentRequired ? 'Dit moment valt binnen de bedenktijd. Kies een later moment of geef hieronder uitdrukkelijk toestemming voor eerdere uitvoering.' : '');
}

function clearQuote() {
  if (recovery || recoveryBlocked) return;
  revision += 1;
  clearTimeout(quoteExpiryTimer);
  quote = null;
  selectedSlot = null;
  availableSlots = [];
  el('slot-day-field').hidden = true;
  el('slot-day').replaceChildren();
  el('street').value = '';
  el('city').value = '';
  el('termsAccepted').checked = false;
  el('earlyStartRequested').checked = false;
  // Preserve the explanatory empty calendar in preview. No sample slots.
  if (connected) el('slots').replaceChildren();
  message('address-status', '');
  message('slot-status', connected ? 'Controleer eerst uw adres en reiskosten.' : 'In deze conceptpagina zijn nog geen echte agendamomenten aangesloten.');
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
      signal: AbortSignal.timeout(20000)
    });
  } catch {
    throw new BookingError('De verbinding is onderbroken. Controleer uw bestaande betaalopdracht voordat u opnieuw probeert te boeken.');
  }
  let data;
  try { data = await response.json(); }
  catch { throw new BookingError('De boekingsservice geeft nog geen bruikbaar antwoord.', response.status); }
  if (!response.ok) throw new BookingError(typeof data?.error === 'string' ? data.error : 'De aanvraag kon niet worden verwerkt.', response.status, data);
  return data;
}

const slotDay = slot => new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(slot.start));

function renderSlots(slots) {
  availableSlots = slots;
  el('slots').replaceChildren();
  el('slot-day-field').hidden = !slots.length;
  if (!slots.length) {
    message('slot-status', 'Er zijn nu geen online momenten beschikbaar voor deze inspectie. Neem contact op om een afspraak af te stemmen.');
    return;
  }
  message('slot-status', 'Kies een moment. Alle tijden zijn lokale Nederlandse tijden. De beschikbaarheid wordt bij het afrekenen opnieuw gecontroleerd.');
  const dates = [...new Set(slots.map(slotDay))];
  const selector = el('slot-day'); selector.replaceChildren();
  for (const day of dates) {
    const option = document.createElement('option'); option.value = day;
    const daySlots = slots.filter(slot => slotDay(slot) === day);
    option.textContent = new Intl.DateTimeFormat('nl-NL', {timeZone:'Europe/Amsterdam',weekday:'long',day:'numeric',month:'long'}).format(new Date(daySlots[0].start))
      + (daySlots.some(slot => slot.recommended === true) ? ' · Aanbevolen' : '');
    selector.append(option);
  }
  selector.value = dates[0];
  renderSelectedDay();
}

function renderSelectedDay() {
  selectedSlot = null;
  el('slots').replaceChildren();
  for (const slot of availableSlots.filter(slot => slotDay(slot) === el('slot-day').value)) {
    const label = document.createElement('label'); label.className = 'slot-choice';
    const input = document.createElement('input');
    input.type = 'radio'; input.name = 'slot'; input.value = slot.id; input.required = true;
    const text = document.createElement('span');
    text.textContent = slotLabel(slot) + (slot.recommended === true ? ' · Aanbevolen: we zijn al in de buurt' : '');
    input.addEventListener('change', () => { selectedSlot = slot; updateSummary(); });
    label.append(input, text); el('slots').append(label);
  }
  updateSummary();
}
el('slot-day').addEventListener('change', renderSelectedDay);

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
    const thermal = el('thermal').checked;
    clearQuote(); const requestRevision = revision;
    loading = true; el('check-address').disabled = true; updateSummary();
    message('address-status', 'Adres en reiskosten controleren…');
    const received = await api('/quote', { method: 'POST', body: JSON.stringify({ address, thermal }) });
    if (requestRevision !== revision) return;
    quote = validateQuote(received, thermal, Date.now(), address);
    el('street').value = quote.address.street;
    el('city').value = quote.address.city;
    message('address-status', `Prijs voor dit adres gecontroleerd. Reiskosten: ${money(quote.travelCents)}. Totaal: ${money(quote.totalCents)} inclusief btw.`);
    quoteExpiryTimer = setTimeout(() => {
      if (!recovery) { clearQuote(); message('address-status', 'Uw prijsopgave is verlopen. Controleer uw adres opnieuw voor actuele prijzen en tijden.'); }
    }, Math.min(Date.parse(quote.expiresAt) - Date.now(), 2147483647));
    message('slot-status', 'Beschikbare momenten ophalen…');
    const availability = await api(`/availability?quoteId=${encodeURIComponent(quote.quoteId)}`);
    if (requestRevision !== revision) return;
    renderSlots(validateSlots(availability, Date.now(), quote.quoteId));
  } catch (error) {
    clearQuote(); message('address-status', error.message);
  } finally {
    loading = false; el('check-address').disabled = false; updateSummary();
  }
});

function lockOrder(locked = true) {
  for (const input of form.querySelectorAll('input, textarea, select, #check-address')) input.disabled = locked;
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
  recovery = null; checkoutAttempt = null; closedStatus = null;
  lockOrder(false); form.hidden = false;
  const url = new URL(window.location.href);
  url.searchParams.delete('booking');
  window.history.replaceState(null, '', url);
  clearQuote();
}

function handleCheckoutError(error) {
  message('booking-status', '');
  if (recovery && canReleaseAttempt(error.data, recovery.requestId)) {
    try { releaseRecovery(); }
    catch (storageError) { message('booking-error', storageError.message); return; }
  }
  message('booking-error', `${error.message}${recovery ? ' Gebruik de knop om uw bestaande betaalopdracht te controleren. De gegevens blijven vergrendeld; start geen tweede boeking.' : ''}`);
}

function applyAttemptResponse(data, resume = false) {
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
    message('booking-status', resume
      ? 'Uw betaalopdracht is gereed. U gaat nu naar de beveiligde betaalpagina van Mollie.'
      : 'Uw bestaande betaalopdracht is gevonden. Gebruik de knop om verder te gaan naar dezelfde beveiligde betaalpagina.');
    if (resume) window.location.assign(result.checkoutUrl);
  } else {
    message('booking-status', 'Uw bestaande betaalopdracht wordt nog gecontroleerd. Start geen tweede boeking. Controleer de status over een ogenblik opnieuw.');
  }
}

async function recoverExisting(resume = false) {
  if (!connected || !recovery || loading || recoveryBlocked) return;
  loading = true; lockOrder(); updateSummary();
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
    if (!el('termsAccepted').checked || (needsEarlyStart(selectedSlot.start) && !el('earlyStartRequested').checked)) return message('booking-error', 'Controleer uw akkoord met de voorwaarden en, indien nodig, eerdere uitvoering.');
    checkoutAttempt = {
      requestId: crypto.randomUUID(), quoteId: quote.quoteId, slotId: selectedSlot.id,
      customer: { name: el('name').value.trim(), email: el('email').value.trim(), phone: el('phone').value.trim(), notes: el('notes').value.trim() },
      terms: { accepted: true, version: quote.termsVersion, earlyStartRequested: el('earlyStartRequested').checked }
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
    applyAttemptResponse(payment, true);
  } catch (error) {
    handleCheckoutError(error);
  } finally { loading = false; updateSummary(); }
});

for (const id of ['postcode', 'houseNumber', 'thermal']) {
  el(id).addEventListener(id === 'thermal' ? 'change' : 'input', clearQuote);
}
el('termsAccepted').addEventListener('change', updateSummary);
el('earlyStartRequested').addEventListener('change', updateSummary);

async function showReturnStatus() {
  const token = new URLSearchParams(window.location.search).get('booking');
  if (!connected || checkingReturnStatus || !token || !/^[A-Za-z0-9_-]{32,200}$/.test(token)) return;
  // A redirect parameter can select a record; it never proves payment.
  checkingReturnStatus = true;
  form.hidden = true;
  el('booking-status-actions').replaceChildren();
  message('booking-status', 'Uw betaalstatus controleren…');
  let retryRequired = true;
  try {
    const data = await api(`/status?token=${encodeURIComponent(token)}`);
    const status = data?.status;
    message('booking-status', paymentMessage(status));
    if (['failed', 'canceled', 'expired'].includes(status) && !recovery && !recoveryBlocked) form.hidden = false;
    retryRequired = !['confirmed', 'paid_review_required', 'failed', 'canceled', 'expired'].includes(status);
  } catch (error) {
    message('booking-status', `${error.message} Uw afspraak is nog niet bevestigd. U kunt de betaalstatus opnieuw controleren.`);
  } finally {
    checkingReturnStatus = false;
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
