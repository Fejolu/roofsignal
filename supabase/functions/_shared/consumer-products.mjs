// Approved prices: visual inspection and standalone/optional thermography.
// Server derives amounts from product choice; browser amounts are never used.
export function consumerProduct(inspectionType = 'building_envelope', thermal) {
  if (!['building_envelope', 'thermal'].includes(inspectionType) || typeof thermal !== 'boolean'
    || (inspectionType === 'thermal' && thermal !== true)) throw Error('INVALID_REQUEST');
  const baseCents = inspectionType === 'building_envelope' ? 36179 : 0;
  const thermalCents = thermal ? 30250 : 0;
  return {
    inspectionType, baseCents, thermalCents, subtotalCents: baseCents + thermalCents,
    label: inspectionType === 'thermal' ? 'Thermische inspectie' : 'Dak- en gevelinspectie',
    thermalDescription: inspectionType === 'thermal' ? 'zelfstandige thermische inspectie'
      : thermal ? 'toegevoegd aan de dak- en gevelinspectie, één gecombineerd bezoek' : 'niet gekozen'
  };
}
