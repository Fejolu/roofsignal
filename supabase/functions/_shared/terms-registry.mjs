import { TERMS_VERSION as PREVIOUS_VERSION, TERMS_TEXT as PREVIOUS_TEXT } from './terms-20260921.mjs';
import { TERMS_VERSION as CURRENT_VERSION, TERMS_TEXT as CURRENT_TEXT } from './terms-20260924.mjs';

// Keep each accepted version immutable, including confirmations sent after an update.
const terms = new Map([[PREVIOUS_VERSION, PREVIOUS_TEXT], [CURRENT_VERSION, CURRENT_TEXT]]);
export const termsTextForVersion = version => terms.get(version);
export const isSupportedTermsVersion = version => terms.has(version);
