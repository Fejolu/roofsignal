import { termsTextForVersion } from './terms-registry.mjs';

export function bookingLegal(booking) {
  // Do not attach newly written terms to a historical agreement.
  const TERMS_VERSION = booking.terms_version;
  const TERMS_TEXT = termsTextForVersion(TERMS_VERSION);
  if (!TERMS_TEXT) return { lines: [], attachments: [] };
  const lines = [
    `Bij uw boeking geaccepteerde voorwaarden: versie ${TERMS_VERSION}. Een bewaarbare kopie is bijgevoegd.`,
    `Overeenkomst gesloten: ${booking.terms_accepted_at}.`,
    'U heeft als consument 14 dagen bedenktijd vanaf de dag na het sluiten van de overeenkomst. Herroepen kan zonder reden via https://www.roofsignal.nl/herroepen, info@roofsignal.nl, 085 21 28 019 of het postadres in de bijlage.',
    booking.early_start_requested_at
      ? 'Uw uitdrukkelijke keuze: ik verzoek RoofSignal om tijdens de bedenktijd te beginnen. Bij herroeping betaal ik een evenredig bedrag voor het al uitgevoerde deel. Ik erken dat mijn herroepingsrecht vervalt zodra de dienst, inclusief het rapport, volledig is uitgevoerd.'
      : 'U heeft niet verzocht om tijdens de bedenktijd te beginnen. Wij stemmen de uitvoering daarop af.',
    'Scope pilot: visuele, niet-destructieve drone-inspectie van dak, gevel, goten en schoorstenen van het hoofdgebouw voor zover zichtbaar en veilig bereikbaar met de drone; bijgebouwen uitgesloten. Digitaal inspectierapport met beelden, bevindingen, beperkingen, prioriteiten en vervolgstappen. Thermografie alleen indien bijgeboekt.',
    'De gekozen datum is een voorkeursmoment. De definitieve uitvoering en oplevering van het rapport stemmen wij met u af. Bij onveilig of ongeschikt weer verplaatsen wij kosteloos. Betalingstermijn: 14 kalenderdagen na factuurdatum.',
  ];
  const bytes = new TextEncoder().encode(TERMS_TEXT);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { lines, attachments: [{ name: `RoofSignal-voorwaarden-${TERMS_VERSION}.txt`, content: btoa(binary) }] };
}
