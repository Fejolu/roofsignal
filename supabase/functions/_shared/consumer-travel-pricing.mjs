// Tariff: RoofSignal Medewerkershandboek / 04 Reiskosten, 2026-09-24.
// Server-only. Use trusted route distances, never browser-supplied distances.
export const ROOFSIGNAL_ORIGIN = Object.freeze({postcode:'7316BH',houseNumber:'4',country:'NL'});
export const TRAVEL_SOURCE = 'https://roofsignal.odoo.com/odoo/knowledge/71';
export const TRAVEL_BANDS = Object.freeze([
  Object.freeze({maxMeters:25000,netCents:0,vatCents:0,grossCents:0,label:'Tot en met 25 km'}),
  Object.freeze({maxMeters:75000,netCents:3500,vatCents:735,grossCents:4235,label:'Meer dan 25 t/m 75 km'}),
  Object.freeze({maxMeters:150000,netCents:7500,vatCents:1575,grossCents:9075,label:'Meer dan 75 t/m 150 km'})
]);
export function calculateTravel(distanceMeters,policy,visitCount=1){
  if(!Number.isSafeInteger(distanceMeters)||distanceMeters<0) throw new Error('De routeafstand ontbreekt of is ongeldig.');
  if(!Number.isSafeInteger(visitCount)||visitCount<1) throw new Error('Het aantal overeengekomen bezoeken is ongeldig.');
  if(!policy||policy.distanceBasis!=='one_way_road') throw new Error('Deze uitwerking vereist enkele reis over de weg als expliciete grondslag.');
  // Test the full number of metres, not the rounded UI distance.
  const band=TRAVEL_BANDS.find(item=>distanceMeters<=item.maxMeters);
  if(!band) return {status:'requires_quote',reason:'outside_online_area',travelCents:null,distanceMeters,visitCount,source:TRAVEL_SOURCE};
  const common={distanceMeters,visitCount,band:band.label,source:TRAVEL_SOURCE,policyVersion:policy.version};
  if(policy.distanceBasisApproved!==true) return {...common,status:'needs_policy_decision',reason:'distance_basis_unconfirmed',travelCents:null,candidateTravelCents:band.grossCents};
  if(visitCount>1&&!['one_fee_per_booking','per_agreed_visit'].includes(policy.multipleVisits)) return {...common,status:'requires_quote',reason:'multiple_visits_unconfirmed',travelCents:null};
  const multiplier=policy.multipleVisits==='per_agreed_visit'?visitCount:1;
  const distanceLabel=new Intl.NumberFormat('nl-NL',{maximumFractionDigits:3}).format(distanceMeters/1000);
  const visitsLabel=visitCount===1?'1 vooraf overeengekomen bezoek':`${visitCount} vooraf overeengekomen bezoeken`;
  const feeLabel=multiplier===1?'één reiskostentoeslag voor deze opdracht':'een reiskostentoeslag per bezoek';
  return {...common,status:'ready',currency:'EUR',netCents:band.netCents*multiplier,vatCents:band.vatCents*multiplier,travelCents:band.grossCents*multiplier,travelDescription:`${distanceLabel} km enkele reis over de weg vanaf Apeldoorn · ${band.label} · ${visitsLabel} inbegrepen; ${feeLabel}.`};
}
