(() => {
  const form = document.getElementById('vve-form');
  const input = document.getElementById('vve-kvk');
  const name = document.getElementById('vve-organization');
  const button = document.getElementById('vve-kvk-check');
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
  const note = text => { status.textContent = text; status.hidden = !text; };
  const restoreButton = () => { button.disabled = busy || !available; button.textContent = busy ? 'Controleren…' : 'Vul naam in'; };

  // No unavailable check button is shown before a real KVK subscription is connected.
  fetch(`${endpoint}/status`, { headers, signal: AbortSignal.timeout(6000) })
    .then(async response => response.ok && (await response.json()).enabled === true)
    .then(enabled => { available = enabled; button.hidden = !enabled; restoreButton(); })
    .catch(() => {});

  input.addEventListener('input', () => {
    request++;
    if (filledName && name.value === filledName) name.value = '';
    filledName = '';
    note('');
  });
  name.addEventListener('input', () => { request++; filledName = ''; note(''); });
  form.addEventListener('reset', () => { request++; filledName = ''; note(''); });
  form.addEventListener('submit', event => {
    if (!busy) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    note('De KVK-check wordt afgerond. U kunt zo verder.');
  }, true);
  button.addEventListener('click', async () => {
    if (busy || !available || form.getAttribute('aria-busy') === 'true' || form.classList.contains('is-complete')) return;
    const kvk = number();
    if (!/^\d{8}$/.test(kvk)) { note('Vul 8 cijfers in, of vul zelf de naam in.'); return; }
    const security = window.RoofSignalFormSecurity;
    try { security.ensureReady(form); }
    catch { note('De controle is nog niet klaar. Probeer opnieuw of vul zelf de naam in.'); return; }
    const current = ++request;
    busy = true; submit.disabled = true; restoreButton(); note('');
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
      busy = false; restoreButton();
      submit.disabled = form.classList.contains('is-complete');
      security.reset(form); // A Turnstile token is single-use; submitting needs a fresh one.
    }
  });
})();
