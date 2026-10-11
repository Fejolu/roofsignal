# RoofSignal — algemene consumentenboeking

## Planning na de bedenktijd — besluit 11 oktober 2026

De gebruiker heeft bevestigd dat de algemene online consumentenboeking uitsluitend
inspecties **na de volledige bedenktijd** aanbiedt. De eerdere mogelijkheid om vanaf
de volgende kalenderdag te boeken vervalt voor deze route. De inline link
“Boeking herroepen” en de extra checkbox voor uitvoering binnen de bedenktijd zijn
uit de boekingspagina verwijderd. De klant geeft nog steeds zelf akkoord op de
getoonde totaalprijs en de algemene en aanvullende boekingsvoorwaarden; er wordt
geen toestemming voor vroege uitvoering afgeleid of automatisch aangevinkt.

De browser verstuurt voor de bestaande API-vorm altijd
`terms.earlyStartRequested: false`. De backend geeft bij zowel de gecombineerde
prijsopgave als de afzonderlijke beschikbaarheidsroute alleen momenten terug
waarvan de Nederlandse kalenderdatum ná `withdrawalLastDay` ligt. Deze termijn
begint op de dag na de overeenkomst en houdt rekening met verlenging door weekends,
algemeen erkende feestdagen en daarmee gelijkgestelde dagen. Het laatste moment
van de bedenktijd blijft uitgesloten. Bij checkout wordt de einddatum opnieuw
berekend; een inmiddels te vroeg moment wordt vóór het aanmaken van een betaling
afgewezen, ook bij een gewijzigd of verouderd browserverzoek. Een aangeleverde
`earlyStartRequested: true` wordt voor nieuwe algemene boekingen niet aanvaard.

Nieuwe prijsopgaven en opdrachten gebruiken versie `2026-10-11-consumer` en
`legal/consumentenboeking-2026-10-11.txt`. De oude gepubliceerde voorwaarden blijven
beschikbaar. Bestaande opdrachten houden hun vastgelegde toestemming en
voorwaardenversie; herstel en bevestiging gebruiken hun destijds overeengekomen
voorwaarden. De Parken-pilot en de vrijblijvende VvE-aanmelding hebben een eigen
route en behouden hun afzonderlijke afspraken.

## VvE-objectaanmelding — besluit 11 oktober 2026

De gebruiker kiest expliciet **object aanmelden met staffelprijs**, met op dezelfde
pagina de keuze Woning / VvE. De woningroute blijft een directe boeking. De VvE-route
is een vrijblijvende aanvraag; zij reserveert geen agendatijd en maakt geen betaling.

Broncontrole: Obsidian `04.02 - Diensten en prijzen` (bijgewerkt 9 oktober) en de
lokale publicatiekopie van het Odoo-medewerkershandboek (24 september). Vastgesteld
per inspectieobject: maximaal 5 adressen €750 excl. / €907,50 incl. btw; 6–10 adressen
€1.000 excl. / €1.210 incl.; 11–20 adressen €1.250 excl. / €1.512,50 incl. Vanaf 21
adressen, meerdere gebouwen of nog onduidelijke scope: maatwerk. Dit zijn
basisprijzen exclusief thermografie en reizen; werkzaamheden, planning en
totaalprijs worden vóór een opdracht afgestemd. De nieuwste opdracht staat het
tonen van de grotere basisstaffels in deze aanvraagroute toe.

Ferry heeft op 11 oktober ook de thermografiestaffel goedgekeurd (RS-2026-10-11):
maximaal 5 adressen + €400 excl. / €484 incl. btw; 6–10 adressen + €550 excl. /
€665,50 incl.; 11–20 adressen + €750 excl. / €907,50 incl. De checkbox toont de
passende toeslag en telt deze bij selectie direct op bij de basisprijs. De totalen
zijn respectievelijk €1.150 / €1.391,50, €1.550 / €1.875,50 en €2.000 / €2.420
(excl. / incl. btw), vóór eventuele reiskosten. Maatwerk blijft maatwerk, ook met
thermografie. De woningafspraak van 45 minuten en de particuliere toeslag worden
niet op VvE’s toegepast. De aanvraag blijft vrijblijvend.

Het formulier gebruikt de bestaande beveiligde `submit-public-lead`-route als
`price`-aanvraag, segment VvE / VvE-beheerder. Naam organisatie, contactgegevens,
inspectieadres/plaats, aantal adressen, objectomvang, basisprijs, gekozen
thermografietoeslag en totaal met prijsversies komen in `lead_requests` en de bestaande
bevestigings-/notificatiemail. Dit voegt geen nieuwe Odoo- of ERPNext-koppeling toe.
De herkomst is `/inspectie-boeken/`; `#vve` opent de VvE-keuze rechtstreeks.

Controle: lokale browserproeven met afgevangen verzending op 320, 390, 768, 1024
en 1440 px; alle staffelgrenzen, maatwerk, terugschakelen naar woning, aanvraaginhoud,
succes- en foutafhandeling. Geen echte lead of mail aangemaakt tijdens deze proeven.

## Productie-inrichting — 11 oktober 2026

Het VvE-Warmtefondsartikel staat live sinds commit `0ea2eda`. De consumentenpagina is voor publicatie ingericht: werkelijke agenda- en routeberekening, Mollie, e-mailbevestiging, `connected`-frontend en indexeerbare navigatie. De gebruiker heeft publieke activatie en de hieronder beschreven beperkte toegangen expliciet goedgekeurd. Controleer de uiteindelijke publieke werking aan de hand van de deploymentcontroles en het opleverbericht; de configuratie alleen is geen bewijs van een geslaagde boeking.

Repository: `Fejolu/roofsignal`, branch `codex/consumer-booking-20261010`. Websitepublicatie via bestaande Cloudflare Pages-koppeling aan `main`; Supabase uitsluitend via `Supabase productie-release` en `tools/supabase_release.py`.

### Definitieve koppelingen

- Google OAuth staat op **Production**. De eigenaar heeft opnieuw toestemming gegeven; het vernieuwde refresh-token staat alleen in Supabase. Apps Script-versie **3** gebruikt dezelfde private API-implementatie met toegang **Alleen ikzelf** en controleert het eigenaarsaccount. Zowel live- als test-healthcheck slaagt met HTTP 200, Europe/Amsterdam en 45 minuten inspectieduur.
- De afzonderlijke Mollie-livesleutel is aangemaakt voor uitsluitend profiel `pfl_Bef5DYX9w5`, alleen live en alleen `payments.read`/`payments.write`. De sleutel staat uitsluitend als `MOLLIE_CONSUMER_LIVE_API_KEY` in Supabase. Een echte alleen-lezen API-controle gaf HTTP 200 en bevestigde modus en profiel. De bestaande Odoo-sleutels zijn niet gewijzigd.
- `CONSUMER_AUTOMATION_SECRET` is na expliciet akkoord in Supabase en GitHub-omgeving `production` opgeslagen. De sleutel geeft alleen toegang tot `/process`. De controleworkflow wordt op `main` iedere vijf minuten ingepland; GitHub kan geplande runs vertragen. De betaalwebhook blijft de primaire bevestigingsroute.
- Testmails staan uit. Alle vijf eigen testreserveringen zijn vrijgegeven; betaalhistorie blijft behouden. Er zijn geen echte betalingen uitgevoerd.

## Door de gebruiker bevestigde uitvoering

- Eén grondgebonden woning/hoofdgebouw; uitsluitend drone-inspectie. Afwijkende objecten en bijgebouwen via offerte.
- Basis €361,79 inclusief btw; thermografie + €302,50; samen €664,29 vóór reizen.
- Digitaal inspectierapport **binnen twee werkdagen na de inspectie**.
- Online **één gecombineerd bezoek van maximaal 45 minuten**, inclusief voorinspectie op locatie, onder geschikte meet- en vliegomstandigheden.
- Twee vooraf afgesproken bezoeken: offerte met **twee reiskostentoeslagen**. Verplaatsen door ongeschikt weer: geen extra kosten.
- Reizen: **enkele autorit over de weg vanaf 7316 BH 4**. <=25 km €0; >25–75 km €42,35; >75–150 km €90,75; >150 km offerte. Grenzen op ongeronde meters.
- Agenda `ferry.joosten@gmail.com`, maandag–vrijdag 09:00–16:00, uitsluitend na de volledige Nederlandse bedenktijd voor nieuwe algemene online consumentenboekingen.
- Planning houdt rekening met autoroutes tussen afspraken. Nabije afspraken worden aanbevolen zonder andere afspraken te verplaatsen.
- Implementatiekeuze: 15 minuten marge bovenop berekende reistijd; ook heen-/terugreis binnen de werktijden. Ontbrekende locaties van aangrenzende bezette afspraken blokkeren automatische inpassing.

Tarievenbron: [Odoo-handboek 04 Reiskosten](https://roofsignal.odoo.com/odoo/knowledge/71). Bevestigd reisbeleid: `docs/consumer-travel-policy.example.json`.

## Koppelingen en beveiliging

- De afzonderlijke Mollie **test**-toegang is aangemaakt met alleen `payments.read` en `payments.write`, uitsluitend RoofSignal-profiel `pfl_Bef5DYX9w5`.
- `MOLLIE_TEST_API_KEY` is in de bestaande Supabase-secrets opgeslagen. Echte Mollie-simulatorproeven voor betaald, mislukt, geannuleerd en verlopen zijn afgerond. Odoo-toegang is niet gewijzigd. De afzonderlijke livesleutel is op 11 oktober na expliciet akkoord aangemaakt en gecontroleerd; zie hierboven.
- Google Apps Script-project `RoofSignal boekingsagenda - test` is aangemaakt. De eigenaar heeft Calendar-toegang verleend; de initialisatie met Calendar en Maps is geslaagd.
- **De gebruiker heeft openbaar bereikbare Apps Script-webapps geweigerd.** Er is geen openbare implementatie gemaakt. De nieuwe bron gebruikt een privé API executable met Google OAuth, alleen toegankelijk voor de eigenaar. Geen publieke `doPost`-route en geen terugval op een gedeelde sleutel.
- Google Cloud-project `RoofSignal boekingskoppeling` (`velvety-mason-511210-s4`, nummer `494508271756`) is met expliciet akkoord aangemaakt; Apps Script API is actief. De OAuth-client is aangemaakt, de clientgegevens zijn in Supabase opgeslagen en uitsluitend `ferry.joosten@gmail.com` staat als testgebruiker ingesteld. Een API-implementatie is aangemaakt met toegang **Alleen ikzelf**; de implementatie-ID is in Supabase opgeslagen. De gebruiker heeft de waarschuwing beoordeeld en de toestemming afgerond. Het eigenaarsaccount is gecontroleerd; het refresh-token staat uitsluitend in Supabase. Een werkelijke privé API-healthcheck gaf HTTP 200 en bevestigde de juiste agenda, tijdzone en inspectieduur. De eerdere ongebruikte scriptproperty is geen actieve serverkoppeling.
- De server verwacht `CONSUMER_GOOGLE_CLIENT_ID`, `CONSUMER_GOOGLE_CLIENT_SECRET`, `CONSUMER_GOOGLE_REFRESH_TOKEN` en `CONSUMER_GOOGLE_DEPLOYMENT_ID`, uitsluitend als Supabase-secrets.
- De tijdelijke Google-teststatus is op 11 oktober vervangen door **Production**, met hernieuwde toestemming van de eigenaar. De API-implementatie en eigenaarcontrole blijven besloten.
- De besloten testserver en migraties zijn via de gecontroleerde release gepubliceerd. `CONSUMER_TEST_ENABLED=true` staat aan. De bron ondersteunt inmiddels gescheiden test- en livetoegang; publieke creatie blijft geblokkeerd totdat `CONSUMER_LIVE_ENABLED=true` expliciet is ingesteld. Alle testroutes vereisen de Supabase-secretkey of runtime service-role bearer. De webhook verifieert ieder betaalbericht bij Mollie met de sleutel voor de juiste modus. Geen browser ontvangt deze sleutels; testklant is uitsluitend `ferry@roofsignal.nl`.
- `CONSUMER_TEST_EMAIL_ENABLED=true` stuurde bij de geslaagde basisproef de klant- en interne bevestiging uitsluitend naar `ferry@roofsignal.nl`; beide zijn werkelijk in de inbox bekeken. Na de thermische browserproef is deze vlag weer op **false** gezet. Schakel hem alleen tijdens een volgende expliciete proef tijdelijk in.
- Publieke prijsopgaven vereisen een eenmalige Turnstile-verificatie voor RoofSignal en actie `consumer_quote`. Globale, IP- en prijsopgavegrenzen beperken misbruik. Onvoorspelbare identifiers geven uitsluitend toegang tot de bijbehorende boeking; kalenderinhoud wordt niet teruggegeven. Publieke verzoeken kunnen geen testmodus kiezen.
- De automatische controle gebruikt `process-consumer-bookings.yml` en de afzonderlijke `CONSUMER_AUTOMATION_SECRET`. Broncode en logs bevatten geen geheime waarde of klantgegevens. Handmatige uitzonderingen laten de workflow falen met aantallen zodat de bestaande GitHub-melding aandacht vraagt. Opslag is op 11 oktober na expliciet gebruikersakkoord uitgevoerd.

## Wat de code afdekt

- PDOK-adrescontrole met exacte postcode/huisnummermatch; Google-autoroute bepaalt de serverprijs. PDOK is geen controle van objecttype of vliegtoestemming.
- Onveranderlijke serverprijsopgave met routebewijs, reisbeleid en vervaltijd; geen bedragen uit browserinvoer.
- Opgeslagen tijdsloten, één actieve boeking per prijsopgave en vergrendeling tegen overlap; Google controleert ook de reisruimte voordat een eigen reservering ontstaat.
- Alleen inspectiemomenten na de volledige Nederlandse bedenktijd worden voor nieuwe algemene boekingen getoond en geaccepteerd; checkout controleert de termijn opnieuw vóór een betaling ontstaat.
- Duurzame request-ID en herstelblokkade voorkomen dat een vertraagd verzoek na een “niet aangemaakt”-antwoord toch een betaling begint.
- Mollie-bedrag, valuta, profiel, modus en metadata worden gecontroleerd. Een terugkeer-URL is nooit betaalbewijs.
- Betaling wordt vóór agendabevestiging vastgelegd. Bij een agendafout blijft de status “betaald, afstemming nodig”.
- Mislukte/geannuleerde/verlopen betalingen maken capaciteit pas vrij nadat Mollie de eindstatus bevestigt en de eigen agendareservering is verwijderd.
- Betalingsherhaling stopt binnen 40 minuten en bij sleuteldraaiing; onbekende creatie wordt daarna handmatig onderzocht. Mollies idempotentievenster bedraagt één uur.
- Klant-/interne berichten worden transactioneel klaargezet bij bevestiging. Herhaalde verwerking gebruikt dezelfde Brevo-idempotentiesleutel; onzekere berichten buiten 12 minuten gaan naar beoordeling.
- Alle nieuwe tabellen hebben RLS en expliciete rechten uitsluitend voor `service_role`. De browser kan geen boekingen rechtstreeks lezen of schrijven.

## Publicatiecontrole

Publiceer de pagina pas met werkende productiekoppelingen. Zet de livevlag aan, laat de vereiste repositorycontroles slagen en publiceer via `main`. Controleer vervolgens de echte `/inspectie-boeken/`-route, modules, voorwaarden, mobiele bediening, Turnstile, adresprijs en beschikbaarheid. Start de herstelworkflow eenmaal handmatig en controleer de uitkomst.

De hieronder vastgelegde volledige betaalproeven gebruiken Mollies testmodus. Een live sleutelcontrole of geslaagde websitepublicatie is geen uitgevoerde echte klantbetaling. Maak voor verificatie geen echte klantopdracht of afschrijving.

## Validatie tot nu toe

- Bestaande plus nieuwe pytest-controles: 97 geslaagd.
- 62 Node-gedragstests: prijsgrenzen, herstel, betaalidentiteit, netwerkfouten, reistijden, isolatie van test/live, strikte captcha-validatie en geen dubbele betaling bij herhaling. Ook een inmiddels bezet tijdslot en een nog lopende of reeds betaalde initiële checkout worden direct correct getoond. Een ontbrekende captcha verstuurt geen prijsaanvraag.
- Migratie toegepast in geïsoleerde PostgreSQL/PGlite-test: herstelblokkades, overlappende claims, unieke e-mailopdrachten, vergrendeling en toegangsrechten gecontroleerd.
- Echte besloten Supabase/Google-healthcheck: HTTP 200. PDOK-adrescontrole en Google-autoroute voor het eigen RoofSignal-adres slagen: basis €361,79, thermisch totaal €664,29, reizen €0. Werkelijke agenda gaf 109 beschikbare momenten in circa 11 seconden. De testhold blokkeerde het gekozen moment; na annulering/verval keerde de capaciteit terug. Anonieme `/health` en `/process` geven 403; publieke `/quote` en `/test-release` worden door de uitgeschakelde livevlag met 503 geblokkeerd.
- Routecontrole zonder afspraak of betaling: openbare adressen Koningstraat 38 Arnhem (33.645 meter) en Stadsplateau 1 Utrecht (71.889 meter) gaven ieder €42,35 reizen en €404,14 totaal. De hogere staffel is door grenswaardetests afgedekt, nog niet met een afzonderlijke werkelijke routeproef.
- Betaald: request `3b3a2c92-b9e7-4d1a-98ed-d3bcab3123b6`, Mollie `tr_RZ5sqVe3DBBpJVVe6QxXJ`; twee parallelle verzoeken maakten één betaling. Herstel vóór betalen verwees naar dezelfde betaling. Webhook bevestigde betaling én agenda; twee herhaalde webhooks verstuurden geen extra e-mails. De twee Brevo-berichten zijn in de eigen inbox gecontroleerd, inclusief rapportdatum en voorwaarden.
- Mislukt: request `be775743-166e-4c68-b6b0-b55e4c2ff040`; geannuleerd: `75f63686-3fec-4186-a287-f19e41f1e0e4`; verlopen: `4c81ee9f-946a-4577-931a-3bfecfdc434f`. Alle drie bereikten de juiste eindstatus, zonder bevestigingsmail.
- Thermische browserproef: request `163473b3-923e-4f9c-a0b5-ca8399b82544`, Mollie `tr_y73AvxKNkVE2TZMH2TxXJ`. Werkelijke adrescontrole, beschikbaar moment, checkout voor €664,29 en betaalwebhook slaagden. Beide berichten zijn door Brevo geaccepteerd; deze tweede set is nog niet in de native inbox bekeken doordat de Mac vergrendelde. De lokale browser heeft de geverifieerde betaalbevestiging getoond. De tijdelijke loopbackadapter hield credentials buiten de browser en stond alleen eigen testgegevens toe; deze vervangt geen publieke captcha-controle.
- Alle vijf testreserveringen zijn vrijgegeven met behoud van betaalhistorie. Afzonderlijke eindcontrole: nul eigen actieve, niet-vrijgegeven proefreserveringen.
- Release `56cc580` (run `38066202126`) geslaagd, inclusief migratie-/functiecontrole en OPTIONS-smokechecks. De eerdere cleanupmigratie zit in geslaagde release `af98308` (run `38064842284`). Dit bevestigt de infrastructuur, niet de nog ontbrekende publieke activatie.
- Desktopweergave en werkelijke 390px-brede iframeweergave lokaal bekeken; geen horizontale overflow. De mobiele bediening via het beschikbare browserinstrument faalde, waardoor volledige mobiele interactiecontrole openblijft. Het desktopprijsoverzicht blijft nu onder de vaste menubalk en kan zo nodig zelfstandig scrollen.
- Geen echte klantbetalingen of klantopdrachten gemaakt; proefmails gingen uitsluitend naar de eigen RoofSignal-inbox.

## Bronnen voor de koppeling

- [Besloten Apps Script API met OAuth](https://developers.google.com/apps-script/api/how-tos/execute)
- [Google Cloud-project voor Apps Script](https://developers.google.com/apps-script/guides/cloud-platform-projects)
- [Google OAuth: verloop van refresh-tokens](https://developers.google.com/identity/protocols/oauth2#expiration)
- [Google Maps-routebron](https://developers.google.com/apps-script/reference/maps/direction-finder)
- [Mollie-idempotentie](https://docs.mollie.com/reference/api-idempotency)
- [Mollie-betaling aanmaken](https://docs.mollie.com/reference/create-payment)

## Routecontract

De configuratie in `inspectie-boeken/booking-config.js` gebruikt de bestaande consumentenbackend:

```js
window.ROOFSIGNAL_BOOKING = Object.freeze({
  mode: 'connected',
  apiBase: 'https://kakpticlxlaxtebhsuoh.supabase.co/functions/v1/consumer-booking'
});
```

Deze instelling activeert alleen browserverzoeken. Zij creëert géén integratie en mag niet als voltooiingsstap worden gebruikt zonder echte backend. De onderstaande routepaden blijven het contract; bij de Supabase-basis wordt bijvoorbeeld `/quote` aangevraagd onder `/functions/v1/consumer-booking/quote`. Exact `/api/consumer-booking` is alleen bruikbaar als een eigen same-origin serverrouter wordt toegevoegd. Andere hosts, protocolrelatieve URLs, extra configuratievelden en onjuiste modi worden afgewezen.

De adapter verstuurt op dit moment geen `Authorization`- of `apikey`-header. De functie is met passende toegangscontroles publiek aanroepbaar, met livecreatie achter de expliciete servervlag. De functie controleert CORS, invoer, misbruikgrenzen en beperkte quote-/hersteltokens. Een publieke authheader mag alleen worden toegevoegd wanneer de daadwerkelijke serverconfiguratie dat vereist. CORS op zichzelf is geen toegangscontrole. De adapter weigert redirects en gebruikt geen cross-origin cookies.

De conceptmelding en concepttitel zijn op deze branch verwijderd, HTML en `_headers` zijn voor indexering aangepast, de canonieke URL staat vast en de boekingsroute is aan de sitemap en bestaande navigatie toegevoegd. Controleer deze na de uiteindelijke publicatie op de echte URL.

### POST /api/consumer-booking/quote

Sinds de snelheidsverbetering van 11 oktober 2026 bevat het succesvolle antwoord ook
`availability: {quoteId, slots, sourceCheckedAt}` volgens het hieronder beschreven
beschikbaarheidscontract. De browser controleert deze gegevens en toont de agenda
zonder een tweede netwerkverzoek. Alleen bij een oudere server zonder dit veld
gebruikt de browser nog de afzonderlijke beschikbaarheidsroute.

De besloten Google-koppeling leest met `context` het hele venster van 21 dagen eenmaal
uit. De backend bepaalt met dezelfde planningsregels als de vergrendelde checkout
welke autoroutes nodig zijn en vraagt die met maximaal acht gelijktijdige `route`-aanroepen
op. Reeds bekende routes worden tegelijk met de verse agenda uitgelezen, zodat daarvoor
geen extra Google-aanroepen nodig zijn. Dat voorkomt opeenvolgende Google Maps-wachttijden bij een nieuw adres. Alleen
de backend ontvangt de tijdvakken en locaties van afspraken; de browser krijgt uitsluitend
de prijsopgave en beschikbare inspectiemomenten. De oudere gecombineerde `plan`-actie
blijft beschikbaar voor terugrollen. Een Google-toegangstoken wordt uitsluitend in het
servergeheugen gedeeld en vóór het verstrijken vernieuwd. Routeafstanden en statische autorijtijden
worden maximaal één uur hergebruikt, met afzonderlijke sleutels per rijrichting.
Vrij/bezet-gegevens worden niet gecachet. Bij reserveren en bevestigen worden agenda
en benodigde routes opnieuw gecontroleerd onder de bestaande scriptvergrendeling.
De uitrolvolgorde is Google-script (met `context`), consumentenbackend, website; de oudere routes
blijven ondersteund. Toegangsrechten, reistarieven en inspectieduur blijven gelijk.

Bronnen: [Google: batchbewerkingen](https://developers.google.com/apps-script/guides/support/best-practices),
[agenda over een datumbereik](https://developers.google.com/apps-script/reference/calendar/calendar#getEvents(Date,Date)),
[tijdelijke routecache](https://developers.google.com/apps-script/reference/cache/cache).

Invoer:

```ts
{
  address: { postcode: string; houseNumber: string };
  thermal: boolean;
}
```

De client verstuurt alleen postcode en huisnummer voor de adrescontrole. Straat en plaats zijn readonly velden die uitsluitend worden gevuld uit het serverantwoord. De server hanteert Nederland als land voor deze propositie.

Server valideert adres, productgeschiktheid, vlieg-/locatiebeperkingen en of directe boeking mogelijk is. Adrescontrole betekent op zichzelf geen toestemming om te vliegen. Afwijkende of onvoldoende controleerbare objecten niet afrekenen; doorleiden naar contact. Server berekent alle bedragen in integer eurocenten, inclusief btw. Geen totaalbedrag van de client accepteren.

Vereist succesantwoord; bedragen zijn typen of vaste productwaarden, geen voorbeeld van een verzonnen reisberekening:

```ts
{
  serviceable: true;
  quoteId: string;               // ondoorzichtig; minimaal 16 tekens
  currency: "EUR";
  baseCents: 36179;
  thermalCents: 0 | 30250;
  travelCents: number;           // niet-negatieve integer; beoordeelde reisprijs
  totalCents: number;            // baseCents + thermalCents + travelCents
  travelDescription: string;    // niet-lege servertekst, geen HTML
  expiresAt: string;             // toekomstige ISO-datetime met Z/offset
  termsVersion: string;
  address: {
    postcode: string;
    houseNumber: string;
    street: string;
    city: string;
    country: "NL";
  };
}
```

Het gevonden adres moet bij de aangevraagde postcode en het huisnummer horen. De adapter controleert die koppeling en normaliseert hoofdletters en spaties. `travelDescription` wordt via `textContent` weergegeven; de browser berekent geen afstand of tarief.

Sla de prijsopgave duurzaam en onveranderlijk op, inclusief gehanteerde reisbeleidsversie en goedkeuring. Alle overeengekomen bezoeken en reiskosten moeten in deze prijs zijn opgenomen. Onbeoordeelde of onbekende reiskosten mogen niet stilzwijgend nul worden. Gebruik passende geldigheidsduur, toegangscontrole op de prijsopgave, inputlimieten en misbruikbeperking. Geen `serviceable: true` retourneren als het reisbeleid of een meervoudig bezoek nog beoordeling vereist.

### GET /api/consumer-booking/availability?quoteId=...

Antwoord: `{quoteId,slots:[{id,start,end}]}`. `quoteId` moet gelijk zijn aan de aangevraagde quote. Tijden zijn ISO 8601 met Z of expliciete offset; de browser toont Europe/Amsterdam. Alleen actuele, werkelijk beschikbare momenten na de volledige Nederlandse bedenktijd teruggeven, berekend met inspectieduur, reisbuffer, geblokkeerde tijd en reeds openstaande reserveringen. Dezelfde termijnfilter geldt voor de beschikbaarheid in het gecombineerde `/quote`-antwoord. Geen namen of andere gegevens uit agendapunten publiceren. Het kiezen van een moment in de browser is nog geen reservering. De adapter controleert vlak vóór checkout opnieuw of het geselecteerde moment nog in de toekomst ligt; de server moet de bedenktijd en beschikbaarheid opnieuw controleren en atomair claimen.

### POST /api/consumer-booking/checkout

Invoer: `{requestId,quoteId,slotId,customer:{name,email,phone,notes},terms:{accepted,version,earlyStartRequested}}`.

Voor een nieuwe algemene consumentenboeking is `terms.earlyStartRequested` altijd
`false`; `true` is geen ondersteunde boekingskeuze. `terms.version` moet overeenkomen
met de opgeslagen prijsopgave en de actuele versie `2026-10-11-consumer`.

Server leest de opgeslagen prijsopgave, controleert verval, adres en scope,
valideert consumentengegevens/voorwaarden en het gewenste startmoment opnieuw,
controleert de actuele agenda en claimt de capaciteit atomair. Het startmoment
moet na de volledige toepasselijke bedenktijd liggen, opnieuw berekend op het
moment van checkout. Een te vroeg moment wordt afgewezen vóór de betalingspoging
wordt aangemaakt. Historische opdrachten worden via `/recover` met hun bestaande
voorwaarden en toestemming hersteld; er ontstaat daardoor geen nieuwe opdracht
onder andere voorwaarden.

Leg vóór het betaalverzoek één duurzame betalingspoging vast. Eigen idempotentie is vereist per requestId én per actieve prijsopgave/reservering; ook verversen mag geen tweede betaling creëren. Een database-exclusiviteitsregel moet overlappende claims uitsluiten. Alleen een vrij/bezet-aanroep gevolgd door los een agenda-item toevoegen sluit races niet uit. Definieer tevens hoe gelijktijdige handmatige wijzigingen in de agenda worden voorkomen of afgehandeld.

Maak de Mollie-betaling server-side met de opgeslagen totaalprijs in decimale stringvorm en één stabiele Idempotency-Key, metadata voor de bestaande reservering, nl_NL en vaste redirect-/webhook-URLs uit vertrouwde configuratie. Gebruik snelle, op het account geactiveerde betaalmethoden; vermijd in deze eerste afsprakenflow langlopende bankoverschrijvingen. De klant wordt naar de geverifieerde `_links.checkout.href` gestuurd. De adapter accepteert nu exact www.mollie.com en checkout.mollie.com via HTTPS; bevestig de daadwerkelijk gebruikte Mollie-host met de echte testresponse voordat dit live gaat.

Succesantwoord:

```ts
{
  requestId: string;
  quoteId: string;
  slotId: string;
  currency: "EUR";
  totalCents: number;
  reference: string;             // niet leeg
  checkoutUrl: string;
}
```

De adapter accepteert alleen dezelfde request-ID, quote-ID, slot-ID, valuta en totaalprijs als de vastgelegde opdracht. Return-URL: `https://www.roofsignal.nl/inspectie-boeken/?booking=<onvoorspelbaar-statustoken>` (minimaal 32 URL-veilige tekens). Het token geeft beperkte leesrechten op de status en bevat geen persoonsgegevens.

Vóór het eerste checkoutverzoek slaat de browser onder `roofsignal.consumerBooking.pending.v1` uitsluitend `{version:1,requestId,quoteId,slotId,currency,totalCents}` in `sessionStorage` op. `requestId` is een UUIDv4. Geen naam, adres, e-mailadres, telefoonnummer, opmerkingen, betaal-URL of credential opslaan. Als schrijven of teruglezen niet betrouwbaar lukt, wordt geen nieuw checkoutverzoek verstuurd. In conceptmodus wordt de opslag niet gelezen of gewijzigd.

Na een onzekere uitkomst worden de invoervelden vergrendeld. Een volgende poging en een paginaverversing gebruiken `/recover`; zij maken niet opnieuw een checkout aan. De Mollie-idempotentiesleutel wordt volgens de documentatie slechts één uur bewaard: eigen duurzame server-idempotentie en capaciteitsvergrendeling blijven noodzakelijk.

### POST /api/consumer-booking/recover

Invoer: `{requestId:string}`. Dit herstelendpoint moet ook werken wanneer de browser het oorspronkelijke checkoutantwoord nooit heeft ontvangen. Een request-ID moet als onvoorspelbaar geheim worden behandeld, met geschikte toegangscontrole, rate-limiting en minimale responsgegevens.

Geef exact één van deze vier responsevormen terug.

**Nog in behandeling of onzeker:**

```ts
{ requestId: string; state: "pending" }
```

De adapter houdt de bestaande opdracht vergrendeld en biedt opnieuw controleren aan.

**Dezelfde bestaande betaling kan worden hervat:**

```ts
{
  requestId: string;
  state: "checkout_ready";
  quoteId: string;
  slotId: string;
  currency: "EUR";
  totalCents: number;
  reference: string;
  checkoutUrl: string;
}
```

De identiteiten en het bedrag worden vergeleken met het bewaarde herstelrecord. Bij automatisch herstel na refresh volgt geen automatische redirect; de gebruiker opent dezelfde betaling via de knop.

**Definitief afgehandelde poging:**

```ts
{
  requestId: string;
  state: "closed";
  quoteId: string;
  slotId: string;
  currency: "EUR";
  totalCents: number;
  reference: string;
  status: "confirmed" | "paid_review_required" | "failed" | "canceled" | "expired";
  requestClosed: true;
}
```

Bij `confirmed` of `paid_review_required` blijft het record staan totdat de gebruiker expliciet **Een nieuwe inspectie boeken** kiest. Bij geverifieerd `failed`, `canceled` of `expired` wordt het record verwijderd en de invoer vrijgegeven. Alleen een daadwerkelijk geverifieerde eindstatus mag deze response opleveren.

**Er bestaat definitief geen betaling voor deze request-ID:**

```ts
{
  requestId: string;
  state: "not_created";
  code: "REQUEST_NOT_CREATED";
  paymentCreated: false;
  requestClosed: true;
}
```

`requestClosed: true` betekent dat de server deze request-ID **duurzaam heeft afgesloten**. Een vertraagd oorspronkelijk checkoutverzoek of een retry met dezelfde ID mag daarna geen betaling meer creëren. Alleen een database-uitkomst “niet gevonden” is onvoldoende: het eerste verzoek kan nog onderweg of in behandeling zijn. De server moet dit atomair uitsluiten voordat hij de veilige vrijgave teruggeeft.

### Foutresponses en veilig vrijgeven

Een HTTP-status op zichzelf geeft geen bestelling vrij. Dit geldt ook voor 400, 409, 410 en 422 en voor responses waarvan de JSON onleesbaar is. Alleen een herkenbare applicatieresponse met alle onderstaande velden mag de adapter laten vrijgeven:

```ts
{
  requestId: string;             // exact de lopende request-ID
  error: string;
  code: "QUOTE_EXPIRED" | "SLOT_UNAVAILABLE" | "INVALID_REQUEST"
      | "TRAVEL_UNAVAILABLE" | "REQUEST_NOT_CREATED";
  paymentCreated: false;
  requestClosed: true;
}
```

Ook hier is de duurzame afsluiting van de request-ID verplicht. Onbekende codes, netwerkfouten, onleesbare responses, een afwijkende request-ID en onzekere resultaten houden de poging vergrendeld. Als herstelopslag onleesbaar is of niet veilig kan worden verwijderd, blokkeert de adapter een nieuwe opdracht en verwijst hij naar contact.

### Mollie-webhook en herstelproces

Nieuwe serverroute, bijvoorbeeld POST /api/consumer-booking/mollie-webhook. Bij een klassieke payment-webhook wordt alleen het meegestuurde betalings-ID gebruikt om de betaling opnieuw met de servercredential bij Mollie op te halen. Controleer het eigen payment-ID, bestaande metadata, eurobedrag, valuta, profiel en test/live-mode. Nooit de browserredirect, een clientstatus of een onbekend betalings-ID als bewijs accepteren.

- open/pending/authorized/onbekend: capaciteit niet vrijgeven en niet definitief bevestigen.
- paid: duurzaam en precies eenmaal bevestigen; rekening houden met eventuele uitvoerbaarheidsbeoordeling. Pas `confirmed` retourneren als ook de boeking werkelijk is vastgelegd.
- canceled/failed/expired: na verificatie mag de onbevestigde claim worden vrijgegeven.
- betaald maar conflict/onuitvoerbaar: expliciete afhandeling voor herplanning of terugbetaling, nooit een dubbele afspraak bevestigen.

Een lokale timer mag een nog betaalbare Mollie-poging niet vrijgeven. Reconciliatie bij de webhook, returnpagina en hersteljob moet dezelfde idempotente logica gebruiken. Een duurzame bevestigingstaak voorkomt dubbele bevestigingsmails en herstelt verzendfouten. Voeg kalenderherstel toe als betaling is ontvangen maar de kalender-API tijdelijk faalt. De privétestserver bevat deze verwerking; de hierboven beschreven providerproeven zijn geslaagd. De automatische achtergrondcontrole moet nog worden geconfigureerd en gecontroleerd vóór publieke activatie.

### GET /api/consumer-booking/status?token=...

Server verifieert token en verwerkt/reconcilieert de bestaande poging. Antwoord bevat minimaal `{status}` met `confirmed`, `paid_review_required`, `open`, `pending`, `failed`, `canceled` of `expired`. Alleen beperkte informatie teruggeven, nooit de ruwe Mollie-response of volledig klantdossier. Zet Cache-Control: no-store en een passend Referrer-Policy; neem statustokens niet op in analytics en serverlogs. Zonder verifieerbare status blijft de afspraak onbevestigd.

## Controle en plaatsing

De statische HTML moet alle `input`, `textarea` en `select` binnen `booking-form` initieel `disabled` maken, inclusief de readonly velden voor straat en plaats. Ook `check-address` en `checkout-button` beginnen disabled. De module activeert invoervelden pas nadat alle submit- en previewguards zijn gekoppeld. Zo kan ontbrekende of falende JavaScript geen ingevulde native POST naar de previewhost veroorzaken. De lokale Controleer-knop toont in conceptmodus uitleg; checkout blijft uitgeschakeld.

Lokale controles:

```sh
python3 -m pytest -q -p no:cacheprovider
node --test tests/consumer-*.test.mjs
node --check inspectie-boeken/booking.js
node --check inspectie-boeken/booking-core.mjs
node --check inspectie-boeken/booking-config.js
```

Voor livegebruik moet daarnaast de echte testomgeving aantoonbaar slagen voor: twee gelijktijdige klanten op één moment; dubbelklikken en refresh; create-time-out; webhook vóór/na/zonder return; dubbele webhook; pending langer dan verwacht; geannuleerde/mislukte/verlopen betaling; onjuist bedrag of test/live-mode; veranderde agendablokkade; betaalde maar nog niet geplande opdracht; uitgevallen kalender/webhook; juiste reiskosten voor alle gekozen opnamen; thermografieplanning; consumentenvoorwaarden en bedenktijd.

Voor de consumentenboeking zijn uitsluitend expliciete proefbetalingen, gemarkeerde eigen agendareserveringen en proefmails naar de eigen inbox uitgevoerd. Er zijn geen echte klantopdrachten of geldtransacties aangemaakt. De proefreserveringen zijn vrijgegeven. Het onafhankelijke VvE-artikel is op roofsignal.nl gepubliceerd. Lokale DOM-regressietests vullen de beschreven werkelijke providercontroles aan; de resterende controles staan hierboven. Een push van `supabase/**` naar `main` start de bestaande productie-release automatisch; houd dit werk op een aparte branch tot de keten voldoende is getest; algemene publicatietoestemming is al gegeven.

## Geraadpleegde primaire bronnen, 10 oktober 2026

- https://www.roofsignal.nl/tarieven — consumentenbasisprijs is publiek een vanafprijs voor één woning/adres; reiskosten op offerte.
- https://www.roofsignal.nl/de-parken/ — vaste pilotprijs €361,79; thermografie +€302,50; reisregeling specifiek De Parken.
- https://www.roofsignal.nl/voorwaarden — bestaande uitvoeringsvoorwaarden, bedenktijd, weersvoorbehoud en beperkingen.
- https://roofsignal.odoo.com/odoo/knowledge/71 — handboek **04 · Reiskosten**, bijgewerkt 24 september 2026; vaste staffels bevestigd uit door de gebruiker gedeelde screenshots. Geen rechtstreeks ingelogde Odoo-controle uitgevoerd.
- https://docs.mollie.com/reference/create-payment — Payments API en hosted checkout.
- https://docs.mollie.com/docs/triggering-fulfilment — geverifieerde betaling en idempotente bevestiging.
- https://docs.mollie.com/reference/webhooks — klassieke payment-webhook, verificatie via API en retries.
- https://docs.mollie.com/docs/handling-payment-status — statusafhandeling en niet zelf voorspellen van verval.
- https://docs.mollie.com/reference/api-idempotency — API-idempotentie vervangt geen eigen duurzame idempotentie.
- https://docs.mollie.com/reference/testing — gescheiden testbetalingen.
