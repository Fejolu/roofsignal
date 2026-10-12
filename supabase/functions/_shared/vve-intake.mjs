// Optional structured metadata for the existing VvE inquiry. This is never an
// accepted quote, booking or payment. Legacy free text is not parsed or guessed.
const TYPES = new Set(['building_envelope', 'thermal']);
const SCOPES = new Set(['single', 'multiple', 'unknown']);
const INPUT_KEYS = ['inspection_type', 'thermal', 'address_count', 'object_scope', 'object_address', 'object_city', 'phone', 'kvk_number'];
const fail = () => { throw Error('INVALID_VVE_INTAKE'); };
const text = (value, maximum, required = true) => {
  if (typeof value !== 'string' || value.length > maximum) return fail();
  const clean = value.trim(); if (required && !clean) return fail(); return clean;
};
export function vveIntakeDetails(body) {
  if (body?.vve_intake == null) return null;
  const input = body.vve_intake;
  if (body.type !== 'price' || body.segment !== 'VvE / VvE-beheerder'
    || !['/inspectie-boeken', '/inspectie-boeken/'].includes(body.source_path)
    || !input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !INPUT_KEYS.includes(key))
    || !TYPES.has(input.inspection_type) || typeof input.thermal !== 'boolean'
    || (input.inspection_type === 'thermal' && input.thermal !== true)
    || !Number.isSafeInteger(input.address_count) || input.address_count < 1 || input.address_count > 10000
    || !SCOPES.has(input.object_scope)) return fail();
  const suppliedKvk = input.kvk_number == null ? '' : text(input.kvk_number, 20, false).replace(/\s/g, '');
  // The optional KVK check must not block manual registration. Non-numbers
  // stay in the original message; they are not presented as a registry number.
  const kvk = /^\d{8}$/.test(suppliedKvk) ? suppliedKvk : null;
  const objectAddress = text(input.object_address, 500), city = text(input.object_city, 100), phone = text(input.phone, 40, false);
  const tier = input.object_scope === 'single' ? [
    { max: 5, building: 75000, thermal: 40000 },
    { max: 10, building: 100000, thermal: 55000 },
    { max: 20, building: 125000, thermal: 75000 },
  ].find(value => input.address_count <= value.max) : null;
  const building = tier ? input.inspection_type === 'building_envelope' ? tier.building : 0 : null;
  const thermal = tier ? input.thermal ? tier.thermal : 0 : null;
  const total = tier ? building + thermal : null;
  return { schema_version: 1, context: 'vve-object', inspection_type: input.inspection_type,
    thermal: input.thermal, address_count: input.address_count, object_scope: input.object_scope,
    object_address: objectAddress, object_city: city, phone, kvk_number: kvk,
    price_indication: { kind: tier ? 'indication' : 'custom', pricing_version: 'vve-2026-10-11',
      building_envelope_excl_cents: building, thermal_excl_cents: thermal, total_excl_cents: total,
      total_incl_cents: total === null ? null : Math.round(total * 1.21),
      travel_included: false, accepted: false } };
}
