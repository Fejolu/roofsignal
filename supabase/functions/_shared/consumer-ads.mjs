export function eligibleAdsConversion(attempt, quote) {
  return attempt?.mode === 'live' && attempt.status === 'confirmed'
    && attempt.payment_status === 'paid' && Boolean(attempt.calendar_event_id)
    && Number.isSafeInteger(quote?.total_cents) && quote.total_cents > 0;
}
