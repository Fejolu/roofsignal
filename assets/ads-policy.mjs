export const CONSENT_VERSION = '2026-10-18';
export const CONSENT_MAX_AGE = 180 * 86400000;
export function consentGranted(value, now = Date.now()) {
  return value?.version === CONSENT_VERSION && value?.granted === true
    && Number.isFinite(value.at) && value.at <= now && now - value.at < CONSENT_MAX_AGE;
}
export function safeAdsUrl(href) {
  const url = new URL(href);
  const clean = new URL(url.pathname, url.origin);
  for (const key of ['gclid', 'gbraid', 'wbraid']) {
    const value = url.searchParams.get(key);
    if (value && /^[A-Za-z0-9_-]{1,512}$/.test(value)) clean.searchParams.set(key, value);
  }
  const campaign = url.searchParams.get('rs_campaign');
  if (['search_consument_apeldoorn', 'google_bedrijfsprofiel', 'parken_flyer'].includes(campaign)) clean.searchParams.set('rs_campaign', campaign);
  if (url.hash === '#vve') clean.hash = 'vve';
  return clean.href;
}
export function conversionPayload(data) {
  if (data?.state !== 'closed' || data.status !== 'confirmed') return null;
  const c = data.adsConversion;
  if (!c || !/^rs_[a-f0-9]{64}$/.test(c.id) || c.currency !== 'EUR'
    || !Number.isSafeInteger(c.valueCents) || c.valueCents <= 0 || c.valueCents > 10000000) return null;
  return { send_to: 'AW-18511176766/J4uQCM6CzpsdEL7I6PpE', transaction_id: c.id, value: c.valueCents / 100, currency: 'EUR' };
}
