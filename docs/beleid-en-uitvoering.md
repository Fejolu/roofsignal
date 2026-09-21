# Beleid en uitvoering — 21 september 2026

## Wat is op de website en in de code geregeld?

- Eén product: RoofSignal Inspectie (dak/gevel met drone), thermografie optioneel.
- Versiegebonden voorwaarden; geen nieuwe voorwaarden op oude opdrachten plakken.
- Nieuwe pilotboekingen registreren `terms_version` in dezelfde transactie als de boeking.
- Een expliciet, niet vooraf aangevinkt verzoek dekt vroege uitvoering plus de uitleg
  van evenredige vergoeding en verlies van herroepingsrecht na volledige uitvoering.
- De klantbevestiging bevat het tijdstip en de gemaakte keuze, de scope en een
  volledige voorwaardenkopie als tekstbijlage. De prijs blijft uit de geboekte snapshot komen.
- `/herroepen` is publiek bereikbaar via de footer en de boekingspagina. Geen login,
  reden of exact referentieformaat verplicht. Na een controlepagina verstuurt de
  klant expliciet de verklaring. Opslag in `lead_requests` als contact met segment
  `herroeping`, inclusief servertijd; interne mail naar Ferry en bevestiging naar de klant.
- Een fout bij mailen maakt een opgeslagen herroeping niet ongeldig. Er verschijnt
  een melding en een downloadbaar ontvangstbewijs. Er is voor deze nieuwe route
  **geen automatische mailherhaalwachtrij**. Controleer bij een verzendstoring de
  opgeslagen herroepingen en handel die meteen af.
- Herroepen wijzigt **niet automatisch** boekingen, facturen, Odoo-taken of betalingen.
  Dat voorkomt dat alleen kennis van een referentie andermans opdracht kan annuleren.
- Umami: alleen bekende openbare paden en vaste gebeurtenissen; geen formulierinhoud,
  query/hash, referrer, titel, schermresolutie, eigen klant-ID of vrije kliktekst.
  Geen A/B-sessieopslag meer. Geen tracking op klant-/beheer-/akkoord-/herroepingspagina’s.
  DNT en GPC voorkomen het laden van Umami. Geen replay/identify/performance-payloads.

## Werkafspraken die bij de teksten horen

1. **Offertes buiten de website:** verstrek vóór aanvaarding de geldende voorwaarden
   en consumenteninformatie. Voeg de bewaarbare versie toe aan de offerte in Odoo
   of per e-mail. Een link naar een later wijzigbare webpagina alleen is onvoldoende.
   De Odoo-offertesjablonen zijn in deze wijziging niet aangepast.
2. **Vroege uitvoering:** controleer het vastgelegde verzoek. Zonder dit verzoek
   geen uitvoering binnen de bedenktijd; stem een datum daarna af. De gekozen
   kalenderdatum op zichzelf is geen afstand van consumentenrechten.
3. **Herroeping:** neem de ontvangen datum/tijd als uitgangspunt, niet het moment
   waarop de mailbox wordt gelezen. Koppel de verklaring aan de juiste opdracht.
   Verwerk de annulering in websiteplanning, oude backoffice én Odoo. Stop nog niet
   uitgevoerd werk en wikkel eventuele terugbetaling binnen de geldende termijn af.
   Wijzig betalingen pas na controle; stuur niet automatisch een factuur voor het
   volle bedrag bij annulering. Geen verplichte reden vragen.
4. **Incasso:** onderscheid de factuurtermijn van 14 dagen en een correcte kosteloze
   consumentenaanmaning van nog 14 dagen na ontvangst. Geen automatische kosten
   zonder deze stap. De Odoo-aanmaningsinstellingen zijn nog afzonderlijk te controleren.
5. **Foto’s en rapporten:** richt de opname op het object. Beperk herkenbare personen,
   kentekens en privéruimten. Beoordeel delen/publicatie apart van de inspectieopdracht.
   Geen extra metingen verzamelen voor toekomstig AI-traininggebruik op basis van
   oude strategieplannen. Zulke plannen zijn geen grondslag of klanttoestemming.
6. **Bewaren en verwijderen:** de tekst vermeldt doelen/criteria voor dossiers en
   ruwe beelden, niet een verzonnen automatische wisroutine. Controleer bij afronden
   welke ruwe beelden noodzakelijk blijven. Hanteer de bestaande grens van twee jaar
   voor losse vragen/niet-aanvaarde offertes, behoud fiscale stukken volgens de wet.
   Verwijderen betreft alle kopieën: mail, Supabase, Odoo en opslag. Niets uit echte
   klantdossiers is in deze wijziging verwijderd.

## Nog vast te stellen — geen verklaring van volledige AVG-conformiteit

| Onderdeel | Open punt | Benodigde vervolgstap |
|---|---|---|
| AI en foto-opslag | Werkelijk gebruik van ChatGPT/andere AI en locatie van bronfoto’s niet bevestigd | Antwoord van Ferry verwerken; plan/instellingen en ontvangers controleren vóór onbeperkt klantmateriaal uploaden |
| Leveranciersafspraken | Acceptatie van actuele verwerkersafspraken, contractpartij, regio en subverwerkers niet op accountniveau gecontroleerd | Bewaar de toepasselijke afspraken voor Cloudflare, Supabase, Brevo, Antagonist, Odoo en Umami; bepaal internationale waarborgen per leverancier |
| Bewaarbeleid | Geen systeembrede automatische verwijdering bewezen; retentie van cloudlogs/statistieken niet bevestigd | Leg exacte uitvoerbare termijnen en een controleproces vast na inventarisatie van opslag en contracten |
| Umami | Frontend gecontroleerd en geminimaliseerd; accountregio/bewaartermijn niet geverifieerd | Controleer accountinstellingen en contract; schakel dienst uit als voldoende waarborgen ontbreken |
| Aansprakelijkheid | Oude tekst stelde een niet gecontroleerde verzekering en een algemene cap op de opdrachtsom | Die ongedocumenteerde beperking verwijderd; wettelijke aansprakelijkheid geldt. Zakelijke caps alleen afzonderlijk na onderbouwing en geldige afspraak |
| Odoo | Voorwaardenbijlage en consumentenaanmaningen niet in de actuele Odoo-configuratie getoetst | Gebruik bovenstaande offerte-/incassowerkafspraak en controleer sjablonen |

De publieke teksten beschrijven de aantoonbare gegevensroute en huidige
werkwijze. Zij zijn geen bewijs dat alle afspraken en bewaartermijnen bij
externe leveranciers al zijn gecontroleerd of uitgevoerd.

## Bronnen, gecontroleerd op 21 september 2026

- [ACM — cookies plaatsen](https://www.acm.nl/nl/verkoop-aan-consumenten/reclame-en-verleiden/online-beinvloeden/cookies-plaatsen).
- [ACM — bedenktijd, vroege uitvoering en online herroepingsfunctie](https://www.acm.nl/nl/verkoop-aan-consumenten/klantenservice/bedenktijd).
- [AP — recht op informatie](https://autoriteitpersoonsgegevens.nl/nl/zelf-doen/gebruik-uw-privacyrechten/recht-op-informatie).
- [AP — grondslagen](https://autoriteitpersoonsgegevens.nl/themas/basis-avg/avg-algemeen/grondslagen-avg-uitgelegd).
- [Rijksoverheid — incassokosten en aanmaning](https://www.rijksoverheid.nl/vraag-en-antwoord/schulden/wanneer-incassobureau).
- [Mollie — eigen verantwoordelijkheid voor betalingen](https://www.mollie.com/nl/legal/privacy).
- [Umami — trackerconfiguratie](https://docs.umami.is/docs/tracker-configuration) en [API](https://docs.umami.is/docs/api/sending-stats).
