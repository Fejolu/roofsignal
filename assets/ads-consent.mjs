import { CONSENT_VERSION, CONSENT_MAX_AGE, consentGranted, safeAdsUrl, conversionPayload } from './ads-policy.mjs';

const KEY = 'roofsignal-advertentiemeting';
const optedOut = navigator.globalPrivacyControl === true || ['1', 'yes'].includes(String(navigator.doNotTrack || window.doNotTrack || ''));
const privatePath = /(?:portal|admin|offerte-akkoord|herroepen|login|dashboard|auth|betaling)/i.test(location.pathname);
// Capture the return credential privately, then remove it before a Google script
// can load. The booking module consumes it without restoring it to the URL.
const RETURN_KEY = 'roofsignal-booking-return';
let returnToken = new URL(location.href).searchParams.get('booking');
if (location.pathname.replace(/\/$/, '') === '/inspectie-boeken') {
  try {
    if (returnToken && /^[A-Za-z0-9_-]{32,200}$/.test(returnToken)) sessionStorage.setItem(RETURN_KEY, returnToken);
    else if (!returnToken) returnToken = sessionStorage.getItem(RETURN_KEY);
  } catch { /* The current in-memory token can still finish the booking. */ }
}
export function takeBookingReturnToken() { const value = returnToken; returnToken = null; return value; }
export function clearBookingReturnToken() { try { sessionStorage.removeItem(RETURN_KEY); } catch {} }
if (!privatePath && location.href !== safeAdsUrl(location.href)) history.replaceState(null, '', safeAdsUrl(location.href));
let choice = null;
try { choice = JSON.parse(localStorage.getItem(KEY)); } catch { /* no storage means no consent */ }
let loaded = false;
let pending = null;
let panel;
const sent = new Set();
function granted() { return !optedOut && consentGranted(choice); }
function gtag() { window.dataLayer.push(arguments); }
function load() {
  if (loaded || !granted() || privatePath) return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = gtag;
  gtag('consent', 'default', { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  gtag('consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'denied', analytics_storage: 'denied' });
  gtag('js', new Date());
  gtag('set', { ads_data_redaction: true, allow_ad_personalization_signals: false, page_location: safeAdsUrl(location.href), page_referrer: '' });
  gtag('config', 'AW-18511176766', { send_page_view: false, allow_enhanced_conversions: false, allow_ad_personalization_signals: false, page_location: safeAdsUrl(location.href), page_referrer: '' });
  const script = document.createElement('script');
  script.async = true;
  script.referrerPolicy = 'no-referrer';
  script.src = 'https://www.googletagmanager.com/gtag/js?id=AW-18511176766';
  document.head.append(script);
  flush();
}
function flush() {
  if (!granted() || !loaded || !pending || sent.has(pending.transaction_id)) return;
  sent.add(pending.transaction_id);
  gtag('event', 'conversion', { ...pending, page_location: safeAdsUrl(location.href), page_referrer: '' });
}
export function reportConfirmedBooking(data) { pending = conversionPayload(data); load(); flush(); }
function save(grant) {
  choice = { version: CONSENT_VERSION, granted: grant && !optedOut, at: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(choice)); } catch { choice = null; }
  panel.hidden = true;
  if (granted()) load();
  else {
    pending = null;
    // Unload any already-running Google script after withdrawal, and clear its
    // first-party attribution cookies on this site.
    for (const name of document.cookie.split(';').map(v => v.split('=')[0].trim()).filter(v => /^_gcl_/.test(v))) {
      for (const domain of ['', '; Domain=roofsignal.nl', '; Domain=.roofsignal.nl']) document.cookie = `${name}=; Max-Age=0; Path=/${domain}; SameSite=Lax; Secure`;
    }
    if (loaded) location.reload();
  }
}
function mount() {
  if (privatePath) return;
  const style = document.createElement('style');
  style.textContent = '.rs-ads-consent{position:fixed;bottom:12px;left:12px;right:12px;z-index:10000;background:#fff;color:#141917;border:1px solid #dce2df;border-radius:8px;padding:12px 16px;box-shadow:0 2px 12px #0001;max-width:600px;margin:auto;display:flex;align-items:center;gap:12px;font:14px/1.45 system-ui}.rs-ads-consent[hidden]{display:none}.rs-ads-consent p{margin:0;flex:1}.rs-ads-consent a{color:#a93600;text-decoration:underline}.rs-ads-consent-actions{display:flex;gap:8px;flex-shrink:0}.rs-ads-consent button{font:inherit;padding:8px 10px;background:#fff;color:#a93600;border:1px solid #a93600;border-radius:5px;cursor:pointer}.rs-ads-settings{font:inherit;background:none;border:0;color:#a93600;text-decoration:underline;cursor:pointer;margin:12px}@media(max-width:520px){.rs-ads-consent{flex-wrap:wrap;gap:10px}.rs-ads-consent p{flex-basis:100%}}';
  document.head.append(style);
  panel = document.createElement('section');
  panel.className = 'rs-ads-consent'; panel.setAttribute('aria-label', 'Advertentiemeting');
  const text = document.createElement('p');
  text.textContent = 'Cookies voor het meten van onze Google-advertenties? ';
  panel.append(text);
  const policy = document.createElement('a'); policy.href = '/cookies'; policy.textContent = 'Cookiebeleid';
  const privacy = document.createElement('a'); privacy.href = '/privacy'; privacy.textContent = 'Privacy';
  text.append(policy, ' · ', privacy);
  const actions = document.createElement('div'); actions.className = 'rs-ads-consent-actions'; panel.append(actions);
  for (const [label, value] of [['Weigeren', false], ['Toestaan', true]]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', () => save(value)); actions.append(button);
  }
  document.body.append(panel);
  const settings = document.createElement('button'); settings.type = 'button'; settings.className = 'rs-ads-settings'; settings.textContent = 'Advertentiemeting wijzigen';
  settings.addEventListener('click', () => { panel.hidden = false; panel.querySelector('button').focus(); });
  (document.querySelector('footer') || document.body).append(settings);
  panel.hidden = optedOut || Boolean(choice?.version === CONSENT_VERSION && Number.isFinite(choice.at) && Date.now() - choice.at < CONSENT_MAX_AGE);
  load();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
