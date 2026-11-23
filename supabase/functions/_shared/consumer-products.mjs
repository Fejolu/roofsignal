// Immutable prices: historical quotes always retain their offered tariff.
export const LEGACY_CONSUMER_PRICING_VERSION='2026-10-11-thermal-legacy';
export const PREVIOUS_CONSUMER_PRICING_VERSION='2026-10-11-equal-standalone';
export const CONSUMER_PRICING_VERSION='2026-11-23-facade';
export function consumerProduct(inspectionType='building_envelope',thermal,pricingVersion=CONSUMER_PRICING_VERSION){
 const facade=['facade','facade_thermal'].includes(inspectionType),thermalOnly=['thermal','facade_thermal'].includes(inspectionType);
 if(!['building_envelope','thermal','facade','facade_thermal'].includes(inspectionType)||typeof thermal!=='boolean'||(thermalOnly&&!thermal)||![LEGACY_CONSUMER_PRICING_VERSION,PREVIOUS_CONSUMER_PRICING_VERSION,CONSUMER_PRICING_VERSION].includes(pricingVersion)||(facade&&pricingVersion!==CONSUMER_PRICING_VERSION))throw Error('INVALID_REQUEST');
 const baseCents=thermalOnly?0:36179,thermalCents=thermal?(thermalOnly&&pricingVersion!==LEGACY_CONSUMER_PRICING_VERSION?36179:30250):0;
 return {inspectionType,pricingVersion,baseCents,thermalCents,subtotalCents:baseCents+thermalCents,
 label:facade?(thermalOnly?'Thermische gevelinspectie':'Bouwkundige gevelinspectie'):(thermalOnly?'Thermische inspectie':'Dak- en gevelinspectie'),
 thermalDescription:thermalOnly?'zelfstandige thermische inspectie'+(facade?' van de gevels':''):thermal?'toegevoegd aan de '+(facade?'gevelinspectie':'dak- en gevelinspectie')+', één gecombineerd bezoek':'niet gekozen'};
}
