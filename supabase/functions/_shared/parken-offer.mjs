export const PARKEN_OFFER_VERSION = "parken-2026-09-17-thermography";

export function bookingOptions(body) {
  if (body.offer_version !== PARKEN_OFFER_VERSION) throw new Error("OFFER_UPDATED");
  if (typeof body.thermography_selected !== "boolean") throw new Error("INVALID_OPTION");
  if (body.terms_accepted !== true) throw new Error("TERMS_REQUIRED");
  return {
    p_offer_version: PARKEN_OFFER_VERSION,
    p_thermography_selected: body.thermography_selected,
    p_terms_accepted: true,
    p_early_start_requested: body.early_start_requested === true,
  };
}

const euros = (cents) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);

export function orderLines(booking) {
  // Old bookings keep their agreed price; an old mailing opt-in is never a purchase.
  if (!booking.offer_version) return [];
  const { inspection_excl_cents: base, thermography_excl_cents: extra, total_incl_cents: total } = booking;
  if (![base, extra, total].every((value) => Number.isInteger(value) && value >= 0)
      || Math.round((base + extra) * 1.21) !== total
      || booking.thermography_selected !== (extra > 0)) throw new Error("INVALID_ORDER_SNAPSHOT");
  return [
    `RoofSignal Inspectie: ${euros(base)} excl. btw (${euros(Math.round(base * 1.21))} incl. btw).`,
    booking.thermography_selected
      ? `Thermografische inspectie toegevoegd: ${euros(extra)} excl. btw (${euros(Math.round(extra * 1.21))} incl. btw).`
      : "Geen thermografische inspectie bijgeboekt.",
    `Totaal: ${euros(total)} incl. btw. Reiskosten binnen De Parken inbegrepen.`,
    ...(booking.thermography_selected ? ["Thermografie vraagt geschikte meetomstandigheden. Als een apart opnamemoment nodig is, stemmen we dat met u af. Dat valt binnen de gekozen toeslag."] : []),
  ];
}
