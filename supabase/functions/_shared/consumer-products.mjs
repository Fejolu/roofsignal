// Stored quotes retain the exact tariff that was offered. The database default
// keeps historical rows and inserts from an older deployment on the old tariff.
export const LEGACY_CONSUMER_PRICING_VERSION = '2026-10-11-thermal-legacy';
export const CONSUMER_PRICING_VERSION = '2026-10-11-equal-standalone';

// Server derives amounts from product choice; browser amounts are never used.
export function consumerProduct(inspectionType = 'building_envelope', thermal, pricingVersion = CONSUMER_PRICING_VERSION) {
  if (!['building_envelope', 'thermal'].includes(inspectionType) || typeof thermal !== 'boolean'
    || (inspectionType === 'thermal' && thermal !== true)
    || ![LEGACY_CONSUMER_PRICING_VERSION, CONSUMER_PRICING_VERSION].includes(pricingVersion)) throw Error('INVALID_REQUEST');
  const baseCents = inspectionType === 'building_envelope' ? 36179 : 0;
  const thermalCents = thermal ? (inspectionType === 'thermal' && pricingVersion === CONSUMER_PRICING_VERSION ? 36179 : 30250) : 0;
  return {
    inspectionType, pricingVersion, baseCents, thermalCents, subtotalCents: baseCents + thermalCents,
    label: inspectionType === 'thermal' ? 'Thermische inspectie' : 'Dak- en gevelinspectie',
    thermalDescription: inspectionType === 'thermal' ? 'zelfstandige thermische inspectie'
      : thermal ? 'toegevoegd aan de dak- en gevelinspectie, één gecombineerd bezoek' : 'niet gekozen'
  };
}
