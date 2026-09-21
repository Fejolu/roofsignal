(() => {
  const form = document.querySelector('[data-withdrawal-form]');
  if (!form) return;
  const fields = form.querySelector('[data-withdrawal-fields]');
  const review = form.querySelector('[data-withdrawal-review]');
  const status = form.querySelector('[data-withdrawal-status]');
  const submit = form.querySelector('button[type="submit"]');
  let payload;
  form.querySelector('[data-review-withdrawal]').addEventListener('click', () => {
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    payload = { type: 'withdrawal', name: data.get('name'), email: data.get('email'), reference: data.get('reference'), withdrawal_confirmed: true };
    review.querySelector('[data-review-text]').textContent = `${payload.name}\nBevestiging naar: ${payload.email}\n\nIk herroep de overeenkomst: ${payload.reference}`;
    fields.hidden = true;
    review.hidden = false;
    submit.focus();
  });
  form.querySelector('[data-edit-withdrawal]').addEventListener('click', () => {
    fields.hidden = false;
    review.hidden = true;
    form.querySelector('[name="name"]').focus();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!payload || review.hidden) return;
    submit.disabled = true;
    status.textContent = 'Uw verklaring wordt verstuurd…';
    try {
      window.RoofSignalFormSecurity.ensureReady(form);
      const cfg = window.ROOFSIGNAL_SUPABASE;
      const response = await fetch(`${cfg.url}/functions/v1/submit-public-lead`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.anonKey}` },
        body: JSON.stringify({ ...payload, ...window.RoofSignalFormSecurity.getPayload(form) }),
      });
      const result = await response.json();
      if (!response.ok || !result.success || !result.receipt) throw new Error(result.error || 'Versturen is niet gelukt.');
      review.hidden = true;
      status.textContent = result.emailSent
        ? 'Uw herroeping is ontvangen. De ontvangstbevestiging is ook per e-mail verstuurd.'
        : 'Uw herroeping is ontvangen en opgeslagen. De automatische e-mailafhandeling is niet volledig gelukt. Bewaar de bevestiging hieronder; uw ontvangstmoment staat vast.';
      const receipt = form.querySelector('[data-withdrawal-receipt]');
      receipt.querySelector('pre').textContent = result.receipt;
      const download = receipt.querySelector('a');
      download.href = URL.createObjectURL(new Blob([result.receipt], { type: 'text/plain;charset=utf-8' }));
      receipt.hidden = false;
      status.focus();
    } catch (error) {
      status.textContent = `${error.message} U kunt ook direct herroepen via info@roofsignal.nl of 085 21 28 019. Als het antwoord uitblijft na versturen, kan uw verklaring al zijn opgeslagen; vermeld dat bij contact.`;
      window.RoofSignalFormSecurity.reset(form);
      submit.disabled = false;
    }
  });
})();
