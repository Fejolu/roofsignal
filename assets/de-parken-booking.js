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
  const slotMap = new Map();
  let unavailableSlots = new Set();
  let selectedDate = "";

  function normalizePostcode(value) {
    return String(value || "").replace(/\s/g, "").toUpperCase();
  }

  function buildCalendar() {
    calendarDays.innerHTML = "";
    slotMap.clear();
    const formatter = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" });
    const firstDayOffset = 1; // 1 september 2026 is dinsdag; kalender start op maandag.
    for (let empty = 0; empty < firstDayOffset; empty += 1) {
      const spacer = document.createElement("span");
      spacer.className = "rs-day empty";
      spacer.setAttribute("aria-hidden", "true");
      calendarDays.append(spacer);
    }
    for (let day = 1; day <= 30; day += 1) {
      const date = new Date(2026, 8, day);
      const weekday = date.getDay();
      const dateValue = `2026-09-${String(day).padStart(2, "0")}`;
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
      const availableTimes = times.filter((time) => !unavailableSlots.has(`${dateValue}|${time.value}`));
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
        selectDate(selectedDate);
      }
      availabilityMessage.textContent = "Selecteer eerst een datum en daarna een tijdstip.";
      return true;
    } catch (error) {
      unavailableSlots = new Set();
      calendarDays.innerHTML = "";
      slotMap.clear();
      timePanel.hidden = true;
      availabilityMessage.textContent = "De actuele beschikbaarheid kan niet worden geladen. Probeer het later opnieuw.";
      return false;
    }
  }

  function selectDate(dateValue) {
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
    const eligible = validPostcodes.has(normalizePostcode(postcodeInput.value));
    postcodeStatus.className = `form-note postcode-status ${eligible ? "success" : "error"}`;
    postcodeStatus.textContent = eligible
      ? "Deze postcode valt binnen de voorlopige pilotselectie. Vul hieronder uw boeking in."
      : "Deze postcode valt niet binnen de voorlopige selectie. Neem contact op als u denkt dat dit niet klopt.";
    bookingFields.hidden = !eligible;
    if (eligible && focusFirstField) bookingFields.querySelector("input,select")?.focus();
    return eligible;
  }

  function errorCopy(error) {
    const message = String(error?.message || error || "");
    if (message.includes("PILOT_FULL")) return "De 25 pilotplekken zijn inmiddels bezet.";
    if (message.includes("SLOT_TAKEN")) return "Dit moment is zojuist gereserveerd. Kies een ander moment.";
    if (message.includes("ADDRESS_OR_SLOT_ALREADY_BOOKED")) return "Voor dit adres of moment bestaat al een actieve boeking.";
    if (message.includes("ADDRESS_OUTSIDE_PILOT")) return "Dit adres valt niet binnen de pilotselectie.";
    return "De boeking kon niet worden opgeslagen. Probeer het opnieuw of neem contact op via 085 21 28 019.";
  }

  async function sendBookingConfirmation(payload, booking) {
    const config = window.ROOFSIGNAL_SUPABASE;
    if (!config?.url || !config?.anonKey) return;
    const response = await fetch(`${config.url}/functions/v1/send-parken-booking-confirmation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.anonKey}` },
      body: JSON.stringify({ reference: booking.reference, email: payload.email }),
    });
    if (!response.ok) throw new Error("Confirmation email failed");
  }

  checkButton.addEventListener("click", checkPostcode);
  postcodeInput.addEventListener("input", () => {
    bookingFields.hidden = true;
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
      thermography_interest: data.get("thermography_interest") === "yes",
    };

    try {
      const backend = window.RoofSignalBackend;
      if (!backend?.isConfigured || !backend.submitParkenBooking) throw new Error("Backend unavailable");
      const result = await backend.submitParkenBooking(payload);
      if (!result.ok) throw result.error || new Error("Booking rejected");
      const booking = result.booking;
      status.className = "form-note form-status success booking-success";
      status.innerHTML = `<strong>Uw Woningscan is gereserveerd.</strong><span>Referentie: ${booking.reference}</span><span>Voorkeursmoment: ${booking.slot_date} · ${booking.slot_time}</span><span>U ontvangt de definitieve afspraakbevestiging per e-mail.</span>`;
      form.classList.add("is-complete");
      button.textContent = "Gereserveerd ✓";
      window.RoofSignalAnalytics?.track("De Parken boeking voltooid", {
        path: window.location.pathname,
        thermography: payload.thermography_interest,
      });
      [...form.elements].forEach((element) => { if (element !== status) element.disabled = true; });
      sendBookingConfirmation(payload, booking).catch((error) => console.warn("Booking saved; confirmation email failed", error));
    } catch (error) {
      window.RoofSignalAnalytics?.track("De Parken boeking mislukt", { path: window.location.pathname });
      status.className = "form-note form-status error";
      status.textContent = errorCopy(error);
      button.disabled = false;
      button.textContent = "Reserveer mijn Woningscan";
      if (String(error?.message || error || "").includes("SLOT_TAKEN") || String(error?.message || error || "").includes("ADDRESS_OR_SLOT_ALREADY_BOOKED")) {
        await refreshAvailability();
      }
    }
  });

  refreshAvailability();
  window.addEventListener("focus", refreshAvailability);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshAvailability();
  });
})();
