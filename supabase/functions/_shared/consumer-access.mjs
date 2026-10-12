// Public callers can never select test mode or an administrator operation.
export function consumerMode(admin, requested) {
  if (!admin) return 'live';
  if (!requested || requested === 'test') return 'test';
  if (requested === 'live') return 'live';
  throw Error('INVALID_MODE');
}
export function verifiedChallenge(result) {
  return result?.success === true && ['www.roofsignal.nl','roofsignal.nl'].includes(result.hostname)
    && result.action === 'consumer_quote';
}
export function assertMode(record, mode) {
  if (!record || record.mode !== mode) throw Error('INVALID_REQUEST');
  return record;
}
export function publicError(code) {
  return ({
    INVALID_ADDRESS:'Vul een geldige postcode en huisnummer in.',
    ADDRESS_NOT_UNIQUE:'Dit adres is niet eenduidig gevonden. Controleer postcode en huisnummer, inclusief toevoeging.',
    OUTSIDE_ONLINE_AREA:'Voor dit adres maken we graag een offerte. Neem contact op met RoofSignal.',
    QUOTE_EXPIRED:'Uw prijsopgave is verlopen. Controleer uw adres opnieuw.',
    AFTER_WITHDRAWAL_REQUIRED:'Kies een inspectiemoment na de bedenktijd. Controleer uw adres opnieuw voor beschikbare momenten.',
    EARLY_START_CONSENT_REQUIRED:'Geef toestemming voor uitvoering binnen de bedenktijd of kies een later inspectiemoment.',
    CHALLENGE_REQUIRED:'Rond de menselijke controle af en probeer het opnieuw.',
    RATE_LIMITED:'Er zijn te veel verzoeken. Wacht enkele minuten en probeer het opnieuw.',
    INVALID_REQUEST:'De aanvraag kon niet worden gecontroleerd. Controleer uw gegevens.'
  })[code] || 'De boekingsservice is tijdelijk niet beschikbaar. Controleer bij een begonnen betaling eerst uw bestaande betaalopdracht.';
}
