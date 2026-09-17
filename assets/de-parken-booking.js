(() => {
  const form = document.querySelector("[data-parken-booking]");
  if (!form) return;

  const validPostcodes = new Set(`7311AA 7311AB 7311AC 7311AD 7311AE 7311AG 7311AJ 7311AL 7311LV 7315BR 7315BS 7315BT 7315BV 7315EB 7316AA 7316AB 7316AC 7316AD 7316AE 7316AG 7316AH 7316AK 7316AL 7316AM 7316AN 7316AP 7316AR 7316AS 7316AT 7316AV 7316AW 7316BA 7316BB 7316BC 7316BD 7316BE 7316BG 7316BH 7316BJ 7316BK 7316BL 7316BM 7316BN 7316BP 7316BR 7316BS 7316BT 7316BV 7316BW 7316BX 7316BZ 7316CA 7316CD 7316CE 7316CG 7316CH 7316CJ 7316CK 7316CL 7316CM 7316CN 7316CP 7316CR 7316CS 7316CT 7316CV 7316CW 7316CX 7316CZ 7316DA 7316DB 7316DC 7316DD 7316DE 7316DG 7316DH 7316DJ 7316DK 7316DL 7316DM 7316DN 7316DP 7316DR 7316DS 7316DT 7316DV 7316DW 7316DX 7316DZ 7316EA 7316EB 7316EC 7316ED 7316EE 7316EG 7316EH 7316EJ 7316EK 7316EL 7316EM 7316EN 7316EP 7316ER 7316ES 7316ET 7317AC 7317AD 7317AE 7317AH 7317AJ 7317AP 7317AR 7317CA 7317CB 7317CC 7317CE`.split(" "));
  const postcodeInput = form.querySelector("[name='postcode']");
  const postcodeStatus = form.querySelector("[data-postcode-status]");
  const bookingFields = form.querySelector("[data-booking-fields]");
  const status = form.querySelector("[data-booking-status]");
  const slotInput = form.querySelector("[name='slot']");
  const checkButton = form.querySelector("[data-check-postcode]");
  const calendarDays = form.querySelector("[data-calendar-days]");
  const timePanel = form.querySelector("[data-time-panel]");
  const timeLabel = form.querySelector("[data-time-label]");
  const timeOptions = form.querySelector("[data-time-options]");
  const plannerChoice = form.querySelector("[data-planner-choice]");
  const plannerError = form.querySelector("[data-planner-error]");
  const availabilityMessage = form.querySelector("[data-planner-availability]");
  const interestForm = document.querySelector("[data-neighborhood-interest]");
  const monthLabel = form.querySelector("[data-calendar-month]");
  const previousMonth = form.querySelector("[data-calendar-previous]");
  const nextMonth = form.querySelector("[data-calendar-next]");
  const thermalInput = form.querySelector("[name='thermography_selected']");
  const termsInput = form.querySelector("[name='terms_accepted']");
  const priceLabel = (selected) => selected ? "€664,29 incl. btw" : "€361,79 incl. btw";
  function updateOrderTotal() {
    const label = priceLabel(thermalInput.checked);
    form.querySelector("[data-booking-total]").textContent = label;
    form.querySelector("[data-terms-price]").textContent = label;
    form.querySelector("[data-terms-option]").textContent = thermalInput.checked ? " met thermografische inspectie" : "";
  }
  thermalInput.addEventListener("change", () => {
    termsInput.checked = false;
    updateOrderTotal();
  });
  updateOrderTotal();
  const slotMap = new Map();
  let unavailableSlots = new Set();
  let selectedDate = "";
  function currentMonth() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit",
    }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
    return new Date(Number(parts.year), Number(parts.month) - 1, 1, 12);
  }
  let displayedMonth = currentMonth();

  function normalizePostcode(value) {
    return String(value || "").replace(/\s/g, "").toUpperCase();
  }

  function slotIsFuture(date, time) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(Date.now())).map(({ type, value }) => [type, value]));
    const now = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
    return `${date}T${time.slice(0, 5)}:00` > now;
  }

  function buildCalendar() {
    calendarDays.innerHTML = "";
    slotMap.clear();
    const formatter = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const year = displayedMonth.getFullYear();
    const month = displayedMonth.getMonth();
    const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    calendarDays.setAttribute("aria-label", `Beschikbare dagen in ${monthLabel.textContent}`);
    for (let empty = 0; empty < firstDayOffset; empty += 1) {
      const spacer = document.createElement("span");
      spacer.className = "rs-day empty";
      spacer.setAttribute("aria-hidden", "true");
      calendarDays.append(spacer);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day, 12);
      const weekday = date.getDay();
      const dateValue = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const times = [];
      if (weekday >= 1 && weekday <= 4) times.push({ value: "16:00-18:00", label: "Einde middag · 16:00–18:00" });
      if (weekday === 5 || weekday === 6) {
        times.push(
          { value: "09:00-10:30", label: "09:00–10:30" },
          { value: "10:45-12:15", label: "10:45–12:15" },
          { value: "13:00-14:30", label: "13:00–14:30" },
          { value: "14:45-16:15", label: "14:45–16:15" },
        );
      }
      const availableTimes = times.filter((time) => slotIsFuture(dateValue, time.value) && !unavailableSlots.has(`${dateValue}|${time.value}`));
      slotMap.set(dateValue, { date, label: formatter.format(date), times: availableTimes });
      const button = document.createElement("button");
      button.type = "button";
      button.className = `rs-day ${availableTimes.length ? "available" : "unavailable"}`;
      button.textContent = String(day);
      button.dataset.date = dateValue;
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", `${formatter.format(date)}${availableTimes.length ? ", beschikbaar" : ", niet beschikbaar"}`);
      button.disabled = !availableTimes.length;
      if (availableTimes.length) button.addEventListener("click", () => selectDate(dateValue));
      calendarDays.append(button);
    }
  }

  async function refreshAvailability() {
    if (displayedMonth < currentMonth()) displayedMonth = currentMonth();
    monthLabel.textContent = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" }).format(displayedMonth);
    previousMonth.disabled = displayedMonth <= currentMonth();
    calendarDays.innerHTML = "";
    slotMap.clear();
    const backend = window.RoofSignalBackend;
    availabilityMessage.textContent = "Beschikbaarheid wordt gecontroleerd…";
    try {
      if (!backend?.isConfigured || !backend.listUnavailableParkenSlots) throw new Error("Backend unavailable");
      const result = await backend.listUnavailableParkenSlots();
      if (!result.ok) throw result.error || new Error("Availability unavailable");
      unavailableSlots = new Set(result.slots.map((slot) => `${slot.slot_date}|${slot.slot_time}`));
      buildCalendar();
      if (selectedDate && !slotMap.get(selectedDate)?.times.length) {
        selectedDate = "";
        slotInput.value = "";
        timePanel.hidden = true;
        plannerChoice.classList.remove("visible");
      } else if (selectedDate) {
        const chosenTime = slotInput.value.split("|")[1] || "";
        selectDate(selectedDate, chosenTime);
      }
      availabilityMessage.textContent = "Selecteer eerst een datum en daarna een tijdstip.";
      return true;
    } catch (error) {
      unavailableSlots = new Set();
      selectedDate = "";
      slotInput.value = "";
      plannerChoice.classList.remove("visible");
      calendarDays.innerHTML = "";
      slotMap.clear();
      timePanel.hidden = true;
      availabilityMessage.textContent = "De actuele beschikbaarheid kan niet worden geladen. Probeer het later opnieuw.";
      return false;
    }
  }

  function selectDate(dateValue, retainedTime = "") {
    selectedDate = dateValue;
    slotInput.value = "";
    plannerChoice.classList.remove("visible");
    plannerError.classList.remove("visible");
    calendarDays.querySelectorAll(".rs-day").forEach((day) => day.classList.toggle("selected", day.dataset.date === dateValue));
    const selected = slotMap.get(dateValue);
    timeLabel.textContent = `Beschikbare momenten op ${selected.label}`;
    timeOptions.innerHTML = "";
    selected.times.forEach((time) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rs-time";
      button.textContent = time.label;
      button.addEventListener("click", () => selectTime(time, button));
      timeOptions.append(button);
      if (time.value === retainedTime) selectTime(time, button);
    });
    timePanel.hidden = false;
  }

  function selectTime(time, button) {
    timeOptions.querySelectorAll(".rs-time").forEach((item) => item.classList.remove("selected"));
    button.classList.add("selected");
    slotInput.value = `${selectedDate}|${time.value}`;
    const selected = slotMap.get(selectedDate);
    plannerChoice.innerHTML = `<strong>Gekozen moment</strong> · ${selected.label} · ${time.label}`;
    plannerChoice.classList.add("visible");
    plannerError.classList.remove("visible");
  }

  function checkPostcode({ focusFirstField = true } = {}) {
    const postcode = normalizePostcode(postcodeInput.value);
    const valid = /^[1-9][0-9]{3}[A-Z]{2}$/.test(postcode);
    const eligible = validPostcodes.has(postcode);
    window.RoofSignalAnalytics?.track("De Parken postcodecontrole", { valid, eligible, path: window.location.pathname });
    interestForm.hidden = !valid || eligible;
    interestForm.querySelector("[name=postcode]").value = postcode;
    postcodeStatus.className = `form-note postcode-status ${eligible ? "success" : "error"}`;
    postcodeStatus.textContent = eligible
      ? "Deze postcode valt binnen de voorlopige pilotselectie. Vul hieronder uw boeking in."
      : valid ? "Deze pilot is alleen beschikbaar voor De Parken. Wilt u op de hoogte blijven van volgende wijken? Laat hieronder uw e-mailadres achter." : "Vul een geldige postcode in, bijvoorbeeld 7316 AB.";
    bookingFields.hidden = !eligible;
    if (eligible && focusFirstField) bookingFields.querySelector("input,select")?.focus();
    return eligible;
  }

  function errorCopy(error) {
    const message = String(error?.message || error || "");
    if (message.includes("OFFER_UPDATED")) return "Deze pagina bevat een ouder aanbod. Vernieuw de pagina en controleer uw keuze en totaalbedrag voordat u opnieuw reserveert.";
    if (message.includes("SLOT_EXPIRED")) return "Dit moment is inmiddels verstreken. Kies een toekomstig moment.";
    if (message.includes("SLOT_TAKEN")) return "Dit moment is zojuist gereserveerd. Kies een ander moment.";
    if (message.includes("ADDRESS_OR_SLOT_ALREADY_BOOKED")) return "Voor dit adres of moment bestaat al een actieve boeking.";
    if (message.includes("ADDRESS_OUTSIDE_PILOT")) return "Dit adres valt niet binnen de pilotselectie.";
    return "De boeking kon niet worden opgeslagen. Probeer het opnieuw of neem contact op via 085 21 28 019.";
  }

  checkButton.addEventListener("click", checkPostcode);
  postcodeInput.addEventListener("input", () => {
    bookingFields.hidden = true;
    interestForm.hidden = true;
    postcodeStatus.textContent = "";
    postcodeStatus.className = "form-note postcode-status";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!checkPostcode({ focusFirstField: false }) || !form.reportValidity()) return;
    if (!slotInput.value) {
      plannerError.classList.add("visible");
      form.querySelector("[data-planner]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const [chosenDate, chosenTime] = slotInput.value.split("|");
    if (!slotIsFuture(chosenDate, chosenTime)) {
      await refreshAvailability();
      status.textContent = "Dit moment is inmiddels verstreken. Kies een toekomstig moment.";
      return;
    }
    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    button.textContent = "Reserveren…";
    status.className = "form-note form-status pending";
    status.textContent = "Uw boeking wordt gecontroleerd en opgeslagen…";

    const data = new FormData(form);
    const [slotDate, slotTime] = String(data.get("slot") || "").split("|");
    const payload = {
      name: String(data.get("name") || "").trim(),
      email: String(data.get("email") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      street: String(data.get("street") || "").trim(),
      house_number: String(data.get("house_number") || "").trim(),
      postcode: normalizePostcode(data.get("postcode")),
      slot_date: slotDate,
      slot_time: slotTime,
      notes: String(data.get("notes") || "").trim(),
      source: "de-parken-directmail-2026",
      terms_accepted: data.get("terms_accepted") === "yes",
      early_start_requested: data.get("early_start_requested") === "yes",
      thermography_selected: data.get("thermography_selected") === "yes",
      offer_version: "parken-2026-09-17-thermography",
    };

    try {
      window.RoofSignalFormSecurity?.ensureReady(form);
      Object.assign(payload, window.RoofSignalFormSecurity?.getPayload(form));
      const backend = window.RoofSignalBackend;
      if (!backend?.isConfigured) throw new Error("Backend unavailable");
      const config = window.ROOFSIGNAL_SUPABASE;
      const response = await fetch(`${config.url}/functions/v1/submit-parken-booking`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.anonKey}` },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || "Booking rejected");
      const booking = result.booking;
      status.className = "form-note form-status success booking-success";
      status.innerHTML = `<strong>Uw RoofSignal Inspectie is gereserveerd.</strong><span>Referentie: ${booking.reference}</span><span>Voorkeursmoment: ${booking.slot_date} · ${booking.slot_time}</span><span>${booking.thermography_selected ? "Met thermografische inspectie" : "Zonder thermografische inspectie"} · totaal ${new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(booking.total_incl_cents / 100)} incl. btw</span><span>U ontvangt de definitieve afspraakbevestiging per e-mail.</span>`;
      form.classList.add("is-complete");
      button.textContent = "Gereserveerd ✓";
      window.RoofSignalAnalytics?.track("De Parken boeking voltooid", {
        path: window.location.pathname,
        thermography: payload.thermography_selected,
      });
      [...form.elements].forEach((element) => { if (element !== status) element.disabled = true; });
    } catch (error) {
      window.RoofSignalAnalytics?.track("De Parken boeking mislukt", { path: window.location.pathname });
      status.className = "form-note form-status error";
      status.textContent = errorCopy(error);
      window.RoofSignalFormSecurity?.reset(form);
      button.disabled = false;
      button.textContent = "Reserveer mijn inspectie";
      if (String(error?.message || error || "").includes("SLOT_EXPIRED") || String(error?.message || error || "").includes("SLOT_TAKEN") || String(error?.message || error || "").includes("ADDRESS_OR_SLOT_ALREADY_BOOKED")) {
        await refreshAvailability();
      }
    }
  });

  function changeMonth(offset) {
    const next = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + offset, 1, 12);
    if (next < currentMonth()) return;
    displayedMonth = next;
    selectedDate = "";
    slotInput.value = "";
    timePanel.hidden = true;
    plannerChoice.classList.remove("visible");
    plannerError.classList.remove("visible");
    refreshAvailability();
  }
  previousMonth.addEventListener("click", () => changeMonth(-1));
  nextMonth.addEventListener("click", () => changeMonth(1));
  refreshAvailability();
  window.addEventListener("focus", refreshAvailability);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshAvailability();
  });
})();
