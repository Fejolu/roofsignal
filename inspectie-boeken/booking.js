import { BASE_CENTS, THERMAL_CENTS, RECOVERY_STORAGE_KEY, resolveBookingConfiguration, money, normalizePostcode, normalizeHouseNumber, subtotal, validateQuote, validateSlots, validateSelectedSlot, needsEarlyStart, slotLabel, validateCheckout, createRecoveryRecord, validateRecoveryRecord, validateRecoveryResponse, canReleaseAttempt, paymentMessage } from './booking-core.mjs?v=20261012-direct-betalen';
import { takeBookingReturnToken, clearBookingReturnToken, reportConfirmedBooking } from '../assets/ads-consent.mjs';
const bookingReturnToken = takeBookingReturnToken();

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
const MAX_CHECKOUT_RECOVERY_POLLS = 8;
const CHECKOUT_RECOVERY_DELAY_MS = 2000;
const CHECKOUT_WAIT_LIMIT_MS = 45000;
const MAX_PREPARATION_DISCARD_POLLS = 5;
let preparationGeneration = 0;
let preparation = null;
let activePreparation = null;
let preparationQueue = Promise.resolve();
let submissionStarted = false;

function message(id, text) {
  const target = el(id);
  if (target) { target.textContent = text; target.hidden = !text; }
}

// A combined visit has the same server product whichever inspection is chosen first.
const primaryInspection = () => el('inspection-thermal').checked ? 'thermal' : el('inspection-envelope').checked ? 'building_envelope' : null;
const chosenInspection = () => !primaryInspection() ? null : primaryInspection() === 'thermal' && !el('thermal').checked ? 'thermal' : 'building_envelope';
const chosenThermal = () => Boolean(primaryInspection()) && (el('inspection-thermal').checked || el('thermal').checked);

function updateEarlyStartConsent() {
  const needed = Boolean(selectedSlot && needsEarlyStart(selectedSlot.start));
  el('early-start-consent').hidden = !needed;
  el('earlyStartRequested').required = needed;
  if (!needed) el('earlyStartRequested').checked = false;
  return !needed || el('earlyStartRequested').checked;
}

function updateSummary() {
  const selected = Boolean(primaryInspection());
  if (!selected) el('thermal').checked = false;
  const inspectionType = quote?.inspectionType || chosenInspection();
  const thermal = quote ? quote.thermalCents > 0 : chosenThermal();
  const thermalOnly = inspectionType === 'thermal';
  const thermalPrimary = el('inspection-thermal').checked;
  const combined = !thermalOnly && thermal;
  el('product-addon').hidden = !selected;
  el('thermal').disabled = !selected || configurationBlocked || loading || Boolean(recovery) || recoveryBlocked;
  el('addon-title').textContent = thermalPrimary ? 'Dak- en gevelinspectie toevoegen' : 'Thermografische inspectie toevoegen';
  el('addon-description').textContent = thermalPrimary ? 'Foto’s, bevindingen en onderhoudsadvies.' : 'Warmtebeelden van dak en gevel.';
  el('summary-base-row').hidden = false;
  el('summary-base-label').textContent = !selected ? 'Inspectie' : thermalPrimary ? 'Thermografische inspectie' : 'Dak- en gevelinspectie';
  el('summary-base').textContent = !selected ? 'Nog te kiezen' : money(thermalOnly ? quote?.thermalCents ?? BASE_CENTS : quote?.baseCents ?? BASE_CENTS);
  el('summary-thermal-label').textContent = !selected ? 'Aanvulling' : thermalPrimary ? 'Dak- en gevelinspectie' : 'Thermografie';
  el('summary-thermal').textContent = !selected ? 'Nog te kiezen' : combined ? money(quote ? quote.thermalCents : THERMAL_CENTS) : 'Niet toegevoegd';
  el('summary-travel').textContent = quote ? money(quote.travelCents) : 'Na adrescontrole';
  el('summary-total').textContent = quote ? money(quote.totalCents) : recovery || returnOrder ? money((recovery || returnOrder).totalCents) : selected ? money(subtotal(thermal, inspectionType)) : 'Kies uw inspectie';
  el('address-result').hidden = !quote;
  el('summary-date').textContent = selectedSlot ? slotLabel(selectedSlot) : 'Nog te kiezen';
  if ((recovery || returnOrder) && !quote) {
    for (const id of ['summary-base', 'summary-thermal', 'summary-travel']) el(id).textContent = 'In uw bestaande opdracht';
    el('summary-date').textContent = 'Bij uw bestaande betaalopdracht';
  }
  const earlyStartAccepted = updateEarlyStartConsent();
  const ready = connected && !recoveryBlocked && !loading && !checkingReturnStatus && (recovery || (quote && selectedSlot && el('termsAccepted').checked && earlyStartAccepted));
  el('checkout-button').disabled = !ready;
  el('checkout-button').hidden = Boolean(checkoutUrl);
  el('checkout-button').textContent = loading ? 'Even geduld…' : closedStatus ? 'Een nieuwe inspectie boeken' : 'Betalen';
  el('checkout-link').hidden = !checkoutUrl;
  el('check-address').disabled = !selected || configurationBlocked || loading || Boolean(recovery) || recoveryBlocked;
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
  invalidatePreparation();
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
  el('earlyStartRequested').checked = false;
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
  const { timeoutMs = 60000, ...requestOptions } = options;
  let response;
  try {
    response = await fetch(apiBase + path, {
      ...requestOptions,
      credentials: apiBase.startsWith('/') ? 'same-origin' : 'omit',
      cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error',
      headers: { 'content-type': 'application/json', ...requestOptions.headers },
      signal: AbortSignal.timeout(timeoutMs)
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

function invalidatePreparation() {
  if (submissionStarted || recovery || recoveryBlocked) return;
  preparationGeneration += 1;
  preparation = null;
  if (activePreparation) queuePreparationWork();
}

function validatePreparationResponse(data, draft) {
  if (!data || data.requestId !== draft.requestId || data.quoteId !== draft.quoteId || data.slotId !== draft.slotId
      || data.currency !== 'EUR' || data.totalCents !== draft.totalCents
      || !['prepared', 'pending', 'not_created'].includes(data.state)
      || Object.hasOwn(data, 'checkoutUrl') || !Number.isFinite(Date.parse(data.expiresAt))
      || (data.state !== 'not_created' && Date.parse(data.expiresAt) <= Date.now())) {
    throw new BookingError('De voorbereiding hoort niet bij uw gekozen inspectie.');
  }
  return data;
}

async function discardPreparation(draft) {
  for (let poll = 0; poll < MAX_PREPARATION_DISCARD_POLLS; poll += 1) {
    if (poll) await new Promise(resolve => setTimeout(resolve, CHECKOUT_RECOVERY_DELAY_MS));
    const result = await api('/discard-prepare', { method: 'POST', body: JSON.stringify({ requestId: draft.requestId }) });
    if (!result || typeof result.discarded !== 'boolean' || typeof result.pending !== 'boolean') {
      throw new BookingError('De eerdere voorbereiding kon niet worden afgehandeld.');
    }
    if (result.discarded && !result.pending) return true;
    if (!result.pending) return false;
  }
  return false;
}

function queuePreparationWork() {
  // Await an earlier preparation before discarding it. Aborting the browser
  // request cannot prove that an upstream calendar hold was never created.
  preparationQueue = preparationQueue.then(async () => {
    const desired = preparation;
    if (activePreparation && activePreparation !== desired) {
      const abandoned = activePreparation;
      if (!await discardPreparation(abandoned)) return;
      if (activePreparation === abandoned) activePreparation = null;
    }
    if (!desired || desired !== preparation || desired.generation !== preparationGeneration
        || desired.started || submissionStarted || recovery || recoveryBlocked) return;
    desired.started = true;
    activePreparation = desired;
    try {
      const data = await api('/prepare', { method: 'POST', body: JSON.stringify({ requestId: desired.requestId,
        quoteId: desired.quoteId, slotId: desired.slotId }) });
      desired.response = validatePreparationResponse(data, desired);
    } catch (error) {
      // Payment remains available: final checkout reuses this same opaque ID
      // and lets the server resolve a failed or incomplete preflight.
      desired.error = error;
    }
  }).catch(() => {
    // A failed discard keeps the earlier draft active. A later selection may
    // retry cleanup; it must never create an overlapping preparation.
  });
  return preparationQueue;
}

function prepareSelectedSlot() {
  if (!connected || !quote || !selectedSlot || submissionStarted || recovery || recoveryBlocked) return;
  if (preparation?.quoteId === quote.quoteId && preparation.slotId === selectedSlot.id
      && preparation.totalCents === quote.totalCents) return;
  preparationGeneration += 1;
  preparation = { requestId: crypto.randomUUID(), quoteId: quote.quoteId, slotId: selectedSlot.id,
    totalCents: quote.totalCents, generation: preparationGeneration, started: false };
  queuePreparationWork();
}

async function waitForOlderPreparation(requestId, deadline) {
  if (!activePreparation || activePreparation.requestId === requestId) return;
  let timer;
  try {
    await Promise.race([preparationQueue, new Promise(resolve => {
      timer = setTimeout(resolve, Math.max(0, Math.min(10000, deadline - Date.now())));
    })]);
  } finally { clearTimeout(timer); }
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
  invalidatePreparation();
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
      el('earlyStartRequested').checked = false;
      selectedSlot = slot; prepareSelectedSlot(); updateSummary(); window.RoofSignalAnalytics?.track('Inspectie moment gekozen');
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
  if (!chosenInspection()) return message('address-status', 'Kies eerst uw inspectie.');
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
    const inspectionType = chosenInspection();
    const thermal = chosenThermal();
    clearQuote(); const requestRevision = revision;
    loading = true; el('check-address').disabled = true; updateSummary();
    message('address-status', 'Adres en beschikbare momenten controleren…');
    const received = await api('/quote', { method: 'POST', body: JSON.stringify({ address, thermal, inspectionType, turnstileToken, campaign: window.RoofSignalAnalytics?.campaign || null }) });
    if (requestRevision !== revision) return;
    quote = validateQuote(received, thermal, Date.now(), address, inspectionType);
    window.RoofSignalAnalytics?.track('Inspectie prijs gecontroleerd', { thermography: thermal, inspectionType });
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
  const releasedRequestId = recovery?.requestId;
  try {
    sessionStorage.removeItem(RECOVERY_STORAGE_KEY);
    if (sessionStorage.getItem(RECOVERY_STORAGE_KEY) !== null) throw new Error();
  } catch {
    recoveryBlocked = true;
    throw new BookingError('De afgehandelde betaalopdracht kan niet veilig worden gewist. Neem contact op met RoofSignal.');
  }
  recovery = null; checkoutAttempt = null; closedStatus = null; returnOrder = null;
  submissionStarted = false; preparation = null; preparationGeneration += 1;
  if (activePreparation?.requestId === releasedRequestId) activePreparation = null;
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
    if (result.status === 'confirmed') reportConfirmedBooking(data);
    else releaseRecovery();
    message('booking-status', paymentMessage(result.status));
  } else if (result.state === 'checkout_ready') {
    showPaymentLink(result.checkoutUrl);
    message('booking-status', resume
      ? 'U gaat naar de beveiligde betaalpagina van Mollie.'
      : 'Uw betaalpagina staat klaar. Klik op Betalen.');
    if (resume) window.location.assign(result.checkoutUrl);
  } else {
    message('booking-status', resume
      ? 'Uw betaalpagina openen…'
      : 'Uw betaalpagina wordt klaargezet. Klik op Betalen om verder te gaan.');
  }
  return result;
}

async function followCheckoutAttempt(data, resume = false, deadline = Date.now() + CHECKOUT_WAIT_LIMIT_MS) {
  let result = applyAttemptResponse(data, resume);
  // Only an explicit Betalen action may continue towards Mollie. A reload
  // performs one passive lookup, leaving the choice to the customer.
  if (!resume || result.state !== 'pending') return;
  const requestId = recovery.requestId;
  for (let poll = 0; poll < MAX_CHECKOUT_RECOVERY_POLLS && result.state === 'pending'; poll += 1) {
    const waitMs = Math.min(CHECKOUT_RECOVERY_DELAY_MS, deadline - Date.now());
    if (waitMs <= 0) break;
    await new Promise(resolve => setTimeout(resolve, waitMs));
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    const next = await api('/recover', { method: 'POST', body: JSON.stringify({ requestId }), timeoutMs: remainingMs });
    result = applyAttemptResponse(next, true);
  }
  if (result.state === 'pending') {
    message('booking-status', '');
    message('booking-error', 'De betaalpagina is nog niet beschikbaar. Probeer opnieuw via Betalen; uw bestaande betaalopdracht blijft bewaard.');
  }
}

async function recoverExisting(resume = false) {
  if (!connected || !recovery || loading || recoveryBlocked) return;
  clearPaymentLink();
  loading = true; lockOrder(); updateSummary();
  message('booking-status', resume ? 'Uw betaalpagina openen…' : 'Uw betaalpagina ophalen…');
  message('booking-error', '');
  const deadline = Date.now() + CHECKOUT_WAIT_LIMIT_MS;
  try {
    const data = await api('/recover', { method: 'POST', body: JSON.stringify({ requestId: recovery.requestId }),
      ...(resume ? { timeoutMs: CHECKOUT_WAIT_LIMIT_MS } : {}) });
    await followCheckoutAttempt(data, resume, deadline);
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
  if (!chosenInspection()) return message('booking-error', 'Kies eerst uw inspectie.');
  if (!checkoutAttempt) {
    try {
      validateQuote(quote, chosenThermal(), Date.now(), { postcode: el('postcode').value, houseNumber: el('houseNumber').value }, chosenInspection());
      validateSelectedSlot(selectedSlot);
    }
    catch (error) { clearQuote(); return message('booking-error', error.message); }
    if (!form.reportValidity()) return;
    if (!el('termsAccepted').checked) return message('booking-error', 'Controleer uw akkoord met de voorwaarden.');
    const earlyStart = needsEarlyStart(selectedSlot.start);
    if (earlyStart && !el('earlyStartRequested').checked) return message('booking-error', 'Geef toestemming voor uitvoering binnen de bedenktijd of kies een later moment.');
    submissionStarted = true;
    checkoutAttempt = {
      requestId: preparation?.quoteId === quote.quoteId && preparation.slotId === selectedSlot.id
        && preparation.totalCents === quote.totalCents ? preparation.requestId : crypto.randomUUID(),
      quoteId: quote.quoteId, slotId: selectedSlot.id,
      customer: { name: el('name').value.trim(), email: el('email').value.trim(), phone: el('phone').value.trim(), notes: el('notes').value.trim() },
      terms: { accepted: true, version: quote.termsVersion, earlyStartRequested: earlyStart && el('earlyStartRequested').checked }
    };
    // Persist only opaque IDs and the approved EUR amount BEFORE any request.
    // Reloads recover by requestId; an uncertain request is never recreated.
    try { persistRecovery(createRecoveryRecord(checkoutAttempt, quote)); }
    catch (error) { checkoutAttempt = null; submissionStarted = false; message('booking-error', error.message); updateSummary(); return; }
    lockOrder();
  }
  loading = true; updateSummary();
  message('booking-status', 'Uw betaalpagina openen…');
  const deadline = Date.now() + CHECKOUT_WAIT_LIMIT_MS;
  try {
    // Final consent/customer data always reaches the server, even if the
    // background hold is still running. The same ID joins that preparation.
    await waitForOlderPreparation(checkoutAttempt.requestId, deadline);
    const payment = await api('/checkout', { method: 'POST', body: JSON.stringify(checkoutAttempt),
      timeoutMs: Math.max(1, deadline - Date.now()) });
    // This is a funnel step, never proof of payment or a counted sale.
    window.RoofSignalAnalytics?.track('Inspectie betaling gestart');
    await followCheckoutAttempt(payment, true, deadline);
  } catch (error) {
    window.RoofSignalAnalytics?.track('Inspectie stap mislukt', { step: 'betaling' });
    handleCheckoutError(error);
  } finally { loading = false; updateSummary(); }
});

for (const id of ['postcode', 'houseNumber', 'thermal', 'inspection-envelope', 'inspection-thermal']) {
  el(id).addEventListener(['postcode', 'houseNumber'].includes(id) ? 'input' : 'change', () => {
    if (!recovery && !recoveryBlocked && ['inspection-envelope', 'inspection-thermal'].includes(id)) el('thermal').checked = false;
    clearQuote();
  });
}
el('termsAccepted').addEventListener('change', updateSummary);
el('earlyStartRequested').addEventListener('change', updateSummary);
form.addEventListener('reset', () => Promise.resolve().then(clearQuote));

async function showReturnStatus() {
  const token = bookingReturnToken;
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
    let result = null;
    if (data.state === 'checkout_ready' || data.state === 'closed') {
      // The opaque return token identifies the server order when this browser
      // has no local record. Never trust a URL without validating its order.
      const expected = recovery || validateRecoveryRecord({
        version: 1, requestId: data.requestId, quoteId: data.quoteId,
        slotId: data.slotId, currency: data.currency, totalCents: data.totalCents
      });
      result = validateRecoveryResponse(data, expected);
      if (result.state === 'checkout_ready') {
        returnOrder = expected;
        showPaymentLink(result.checkoutUrl);
      } else if (recovery) {
        applyAttemptResponse(data);
      }
    }
    // A provider's terminal status alone does not prove that the server has
    // released the calendar hold and durably closed this booking attempt.
    const closed = result?.state === 'closed';
    const status = closed ? result.status : result?.state === 'checkout_ready' ? 'open' : 'pending';
    if (closed && status === 'confirmed') reportConfirmedBooking(data);
    if (closed) clearBookingReturnToken();
    message('booking-status', paymentMessage(status));
    if (closed && ['failed', 'canceled', 'expired'].includes(status) && !recovery && !recoveryBlocked) {
      returnOrder = null;
      form.hidden = false;
      const url = new URL(window.location.href);
      url.searchParams.delete('booking');
      window.history.replaceState(null, '', url);
    }
    retryRequired = !closed;
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
