# RoofSignal offertestandaard

De definitieve offerte aan M. Koorn is de visuele norm voor alle toekomstige
RoofSignal-offertes. Een nieuwe offerte krijgt geen nieuw ontwerp.

## Verplicht proces

1. Gebruik uitsluitend `templates/roofsignal-offerte-template.docx`.
2. Genereer via `tools/create_roofsignal_quote.py`; bouw geen offerte vanuit een
   leeg Word-document.
3. Behoud exact: twee pagina's, header/footer, marges, typografie, oranje
   sectiekoppen, metadata, oranje-zwarte investeringstabel en akkoordblok.
4. Gebruik het volledige RoofSignal-logo inclusief het huismerk.
5. Leg reiskosten altijd als aparte regel vast en pas de RoofSignal-staffel toe:
   - tot en met 25 km vanaf Apeldoorn: geen reiskosten (`inbegrepen`, `€ 0,00`);
   - meer dan 25 km tot en met 75 km: vast `€ 35,00` excl. btw;
   - meer dan 75 km tot en met 150 km: vast `€ 75,00` excl. btw;
   - meer dan 150 km: offerte op maat.
   Communiceer geen kilometerprijs. Reiskosten kunnen bij een aantoonbaar
   gecombineerde regionale inspectiedag vervallen; vermeld dat alleen wanneer
   die clustering daadwerkelijk is bevestigd.
6. Offertes vermelden altijd een offertenummer, offertedatum, geldig-tot-datum,
   pakket, klant, klantadres en inspectielocatie.
7. RoofSignal voert intern Premium-capture uit. Het geaccordeerde pakket bepaalt
   welke rapportinhoud aan de klant wordt geleverd.
   Interne termen zoals `Premium-capture`, `interne bronregistratie`, technische
   bestandsnamen en procesnotities worden nooit in klantgerichte offerte- of
   rapporttekst opgenomen. Beschrijf uitsluitend het resultaat, de scope en de
   voor de klant relevante werkwijze.
8. Render de DOCX naar PDF en inspecteer iedere pagina vóór oplevering of
   verzending.
9. Verzending gebeurt pas na expliciete opdracht en alleen naar een bevestigd
   e-mailadres.
10. Gebruik geen nagebootste of lege handtekeningvelden en voeg geen derde
    akkoordpagina toe. Onderaan pagina 2 staat één compacte digitale
    akkoordregistratie met twee kolommen: opdrachtgever en RoofSignal. Bij
    verzending wordt de RoofSignal-kolom gevuld met naam, e-mail, datum, tijd en
    versie. Na digitaal klantakkoord wordt de opdrachtgeverkolom met dezelfde
    gegevens gevuld. De offerte blijft in iedere status exact twee pagina's;
    document-hashes en auditgebeurtenissen blijven daarnaast technisch bewaard.

Klantgegevens horen in een tijdelijk JSON-invoerbestand en worden niet aan de
publieke broncode toegevoegd.
