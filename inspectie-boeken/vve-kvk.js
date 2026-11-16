(() => {
  const form = document.getElementById('vve-form');
  const input = document.getElementById('vve-kvk');
  const name = document.getElementById('vve-organization');
  const status = document.getElementById('vve-kvk-status');
  const submit = document.getElementById('vve-submit');
  const config = window.ROOFSIGNAL_SUPABASE;
  if (!form || !input || !config?.url || !config?.anonKey) return;
  const endpoint = `${config.url}/functions/v1/vve-kvk`;
  const headers = { Authorization: `Bearer ${config.anonKey}`, 'Content-Type': 'application/json' };
  const number = () => input.value.replace(/\s/g, '');
  let request = 0;
  let available = false;
  let filledName = '';
  let busy = false;
  let timer;
  let attempted = '';
  let waitingSince = 0;
  const note = text => { status.textContent = text; status.hidden = !text; };
  const schedule = () => {
    clearTimeout(timer);
    if (available && /^\d{8}$/.test(number()) && number() !== attempted) {
      timer = setTimeout(lookup, 500);
    }
  };

  // Check availability before scheduling any paid lookup.
  fetch(`${endpoint}/status`, { headers, signal: AbortSignal.timeout(6000) })
    .then(async response => response.ok && (await response.json()).enabled === true)
    .then(enabled => { available = enabled; schedule(); })
    .catch(() => {});

  input.addEventListener('input', () => {
    request++;
    if (filledName && name.value === filledName) name.value = '';
    filledName = '';
    waitingSince = 0;
    note('');
    schedule();
  });
  name.addEventListener('input', () => { clearTimeout(timer); request++; attempted = number(); filledName = ''; note(''); });
  form.addEventListener('reset', () => { clearTimeout(timer); request++; attempted = ''; waitingSince = 0; filledName = ''; note(''); });
  form.addEventListener('submit', event => {
    if (!busy) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    note('De KVK-check wordt afgerond. U kunt zo verder.');
  }, true);
  async function lookup() {
    if (busy || !available || form.getAttribute('aria-busy') === 'true' || form.classList.contains('is-complete')) return;
    const kvk = number();
    if (!/^\d{8}$/.test(kvk) || kvk === attempted) return;
    const security = window.RoofSignalFormSecurity;
    try { security.ensureReady(form); }
    catch {
      waitingSince ||= Date.now();
      if (Date.now() - waitingSince < 10000) schedule();
      else note('Ophalen lukt nu niet. U kunt zelf de naam invullen en doorgaan.');
      return;
    }
    attempted = kvk;
    const current = ++request;
    busy = true; submit.disabled = true; note('VvE-naam ophalen…');
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ kvk_number: kvk, ...security.getPayload(form) })
      });
      const result = await response.json();
      if (current !== request || kvk !== number() || form.classList.contains('is-complete')) return;
      if (!response.ok) throw new Error('lookup');
      if (result.found && result.kvkNumber === kvk && typeof result.name === 'string' && result.name.trim() && result.name.length <= 200) {
        name.value = result.name;
        name.setCustomValidity('');
        filledName = result.name;
        note('VvE gevonden. Naam ingevuld.');
      } else {
        note(result.reason === 'not_vve'
          ? 'Dit nummer hoort niet bij een VvE. Gebruik het nummer van de VvE of vul zelf de naam in.'
          : 'Geen actieve VvE gevonden. Controleer het nummer of vul zelf de naam in.');
      }
    } catch {
      if (current === request) note('Ophalen lukt nu niet. U kunt zelf de naam invullen en doorgaan.');
    } finally {
      busy = false;
      submit.disabled = form.classList.contains('is-complete');
      security.reset(form); // A Turnstile token is single-use; submitting needs a fresh one.
      schedule();
    }
  }
})();
