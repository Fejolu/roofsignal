// Do not persist arbitrary query strings, click identifiers or free text.
export function acquisitionCampaign(value) {
  return ['search_consument_apeldoorn', 'google_bedrijfsprofiel', 'parken_flyer', 'linkedin', 'outreach', 'partners'].includes(value) ? value : null;
}
