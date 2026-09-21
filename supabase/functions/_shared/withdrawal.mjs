export function withdrawalRecord(body) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const reference = String(body.reference || '').trim();
  if (!name || name.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
      || !reference || reference.length > 400 || body.withdrawal_confirmed !== true) {
    throw new Error('Controleer uw naam, e-mailadres en de opdracht die u wilt herroepen.');
  }
  return {
    request_type: 'contact', name, email, organization: null, segment: 'herroeping',
    postcode: null, object_complexity: null, site_access: null, scope: 'Herroeping overeenkomst',
    source_path: '/herroepen',
    message: `Hierbij herroep ik de volgende overeenkomst met RoofSignal: ${reference}`,
  };
}

export function isWithdrawal(record) {
  return record.segment === 'herroeping' && record.source_path === '/herroepen';
}

export function withdrawalReceipt(record) {
  if (!isWithdrawal(record) || !record.id || !record.created_at || !record.message) throw new Error('INVALID_WITHDRAWAL_RECEIPT');
  const date = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'long', timeStyle: 'long', timeZone: 'Europe/Amsterdam' }).format(new Date(record.created_at));
  return [
    'RoofSignal – bevestiging van uw herroepingsverklaring', '',
    `Ontvangen op: ${date}`, `Registratienummer: ${record.id}`,
    `Naam: ${record.name}`, `E-mailadres voor de bevestiging: ${record.email}`, '',
    'Uw verklaring:', record.message, '',
    'Uw herroepingsverklaring is ontvangen op het hierboven vermelde moment. Een latere administratieve verwerking verandert dit moment niet.',
    'Wij koppelen uw verklaring aan de betreffende opdracht en informeren u over de afwikkeling en een eventuele terugbetaling. Deze ontvangstbevestiging voegt geen voorwaarden toe aan uw wettelijke rechten.', '',
    'Met vriendelijke groet,', 'RoofSignal', 'info@roofsignal.nl', '085 21 28 019',
  ].join('\n');
}
