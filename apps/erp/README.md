# Eigen RoofSignal ERP — medewerker- en klantlogin

Status: eigen beheeraccount en websitekoppeling actief, 13 oktober 2026.
Eigen software; geen Odoo of ERPNext. De afzonderlijke ERP-omgeving staat op
<https://roofsignal-erp-test.pages.dev>.
Ferry's beheeraccount is aangemaakt en met een zelf gekozen wachtwoord ingelogd.
De koppeling voor consumentenboekingen, De Parken en VvE-aanvragen is gepubliceerd en
geactiveerd. Vier verlopen consumentenboekingen en één bevestigde Parken-afspraak zijn
overgenomen; er waren geen VvE-aanvragen in de bron. Herhaling maakte geen duplicaten.
De drie fictieve accounts zijn afgesloten; hun rollen, machtigingen en sessies zijn
ingetrokken en hun historie blijft bewaard. De websitebron is gepubliceerd via PR #25
en de geslaagde productie-release `38305254597`. Cloudflare publiceert nu `main`;
deployment `03efe4e0-8aaa-4649-930b-03bccb7089c4` gebruikt het zakelijke omgevingslabel
en de versleuteld opgeslagen beperkte koppelsleutel. De bestaande workflow heeft de
actieve ERP-stap succesvol uitgevoerd in run `38351756449`.
De primaire broncron iedere minuut is actief via PR #41 en release `38388252684`.
De echte automatische ronde om 13:13 Nederlandse tijd bevestigde één herhaalde
Parken-levering met HTTP 200, zonder fouten of dubbele opdrachten. Alle vijf snapshots
en laatste revisies kwamen overeen en beide wachtrijen waren leeg. GitHub blijft de terugval.
Deze app en
haar database worden niet meegenomen in de openbare websitebouw.

## Starten en testen

Node 24 of nieuwer:

```sh
cd apps/erp
npm ci
npm run dev
```

Open <http://127.0.0.1:8788>. Kies bovenaan een fictief medewerker- of klantaccount.
De database en PDF-bestanden staan uitsluitend in `.local/`, buiten Git en buiten
de openbare bestanden. Opnieuw starten bewaart gegevens; de proefsessie vervalt.

```sh
npm test
```

De ontwikkelserver bindt uitsluitend aan `127.0.0.1`, controleert Host en Origin,
gebruikt HttpOnly/SameSite-sessies en weigert `NODE_ENV=production`. De accountkiezer
is nadrukkelijk geen productielogin. Geen echte dossiers in deze proefomgeving invoeren.

## Echte login in een afzonderlijke testomgeving

De nieuwe hosted adapter gebruikt Supabase Auth voor medewerker- en klantaccounts.
Hetzelfde inlogscherm opent de backoffice of het klantportaal op basis van expliciete
serverrechten. De proefaccountkiezer bestaat alleen in de lokale demo.

- Een bevestigd account krijgt geen medewerkerrechten of dossier door zijn e-mailadres.
- Een beheerder kent bestaande accounts toegang tot een organisatie of één object toe.
  Financiële rechten blijven afzonderlijk; intrekken werkt bij het volgende verzoek.
- Wachtwoordherstel en uitnodigingen geven uitsluitend een korte herstelsessie.
  Na het instellen van een wachtwoord moet de gebruiker opnieuw inloggen.
  Bij zakelijke activering blijft herstel per e-mail uit totdat SMTP en
  bezorging zijn ingericht en getest. De handmatige eigenaaractivatie werkt zonder e-mail.
- De browser krijgt versleutelde HttpOnly-sessiecookies, geen leesbare toegangstokens.
  Een duurzaam sessieregister controleert verloop en intrekking, ook na serverherstart.
- De server verifieert de actuele Auth-gebruiker en voert bedrijfsacties uit met diens
  eigen token. De adapter gebruikt de geheime serversleutel alleen voor
  profiel/sessie/document-RPC's, private PDF-opslag en de afzonderlijke
  website-inname-RPC; zij bepaalt nooit een browserrol. De website ontvangt deze sleutel niet.
- Iedere PDF-download controleert de huidige dossierrechten en rapportvrijgave.
  Er worden geen downloadlinks uitgegeven die na intrekking nog geldig blijven.

De bestaande website-Supabaseomgeving is hard geblokkeerd in deze adapter.
De echte cloudproef is geslaagd in **RoofSignal ERP test** (`seyuhowazudrhgrbwtbk`),
met drie fictieve accounts. De aparte Cloudflare-testomgeving is gepubliceerd en
heeft de HTTPS-proef doorlopen. **Ferry Joosten · ferry@roofsignal.nl** is de eerste
expliciete administrator; de eigenaar heeft zelf het wachtwoord ingesteld en de login
bevestigd. De hostnaam bevat nog `test` en de ERP-database blijft gescheiden van de website.
Het beheeraccount activeert de websitekoppeling of andere klantaccounts niet vanzelf.
Er worden geen uitnodigingen aan bestaande klanten gestuurd bij het starten of bouwen.

### Testinrichting en controle

Het afzonderlijke **RoofSignal ERP test**-project is met goedkeuring aangemaakt.
Bewaar de volgende configuratie buiten Git, bijvoorbeeld `.local/auth-test.json`,
met bestandstoegang alleen voor de eigenaar:

```json
{
  "url": "https://<testproject>.supabase.co",
  "testProjectRef": "<testproject>",
  "publishableKey": "<publieke API-sleutel>",
  "storageKey": "<geheime serversleutel>",
  "sessionSecret": "<64 willekeurige hextekens>",
  "origin": "http://127.0.0.1:8789"
}
```

Gebruik de apart beoordeelde testinrichting, niet de migraties of publicatieactie
van de openbare website. `scripts/cloud-smoke.mjs` controleert projectidentiteit,
past de ERP-SQL uitsluitend daar toe en maakt met `--provision-fixtures` fictieve,
bevestigde accounts aan. Er worden geen e-mails verzonden. De proef verifieert echte
Auth-tokens, klant A/B, rapportvrijgave, private opslag en ingetrokken sessies/rechten.
Dit is uitsluitend een eerste inrichting: na aanwezigheid van `005_website_intake.sql`
of een opgeslagen afsluitmarkering weigert het script opnieuw proefaccounts te provisioneren.
Zo worden afgeschermde rechten niet opnieuw aangezet en wordt de innamefunctie niet overschreven.
De onderstaande proef is al uitgevoerd; voer haar niet opnieuw op de bestaande omgeving uit:

```sh
node scripts/configure-auth.mjs .local/auth-test.json --configure-isolated-test
npm run test:cloud -- .local/auth-test.json --provision-fixtures
ROOFSIGNAL_ERP_TEST_CONFIG=.local/auth-test.json npm run dev:auth
```

Voor toekomstige herstelmails moeten de exacte callback-URL en de twee templates in
`supabase/templates/` in de geïsoleerde Auth-inrichting zijn ingesteld. Openbare
registratie en anonieme accounts blijven uit. Verander bij online hosting de vaste
origin naar de HTTPS-testlocatie; gebruik geen brede wildcard-redirects. De templates
zijn voorbereid; zij bevestigen geen werkende SMTP-bezorging. Voor zakelijk gebruik
blijft `ERP_PASSWORD_RECOVERY` uit totdat die keten is getest.

`functions/[[path]].js` en `wrangler.toml` ondersteunen het afzonderlijke Cloudflare
Pages-project `roofsignal-erp-test`. Dit bouwt de branch `codex/eigen-erp-fundament`
van `Fejolu/roofsignal`, met `apps/erp` als hoofdmap, `npm ci` als bouwopdracht en
`public` als uitvoermap. De zes ERP-instellingen staan als versleutelde geheimen
in de Production-omgeving van dit testproject. Het woord Production in Cloudflare
maakt deze fictieve ERP-test geen productieadministratie. Preview-publicaties krijgen
geen testgeheimen. `ERP_ENVIRONMENT` bepaalt het omgevingslabel en
`ERP_PASSWORD_RECOVERY` de beschikbaarheid van herstel per e-mail. De aparte
`ERP_INTAKE_SECRET` wordt pas na akkoord ingesteld. De adapter weigert onbekende origins en providerredirects.
Gebruik nooit het openbare RoofSignal Pages-project. Beperk toegangspogingen ook op
het hostingplatform; de adapter bevat daarnaast begrensde lokale controles.

## Wat werkt

- Backoffice met overzicht, klanten, objecten, opdrachten, rapporten en verzoeken.
- Klantkaart met contactgegevens, objecten en opdrachten; nummerherkenning in de werkruimte Telefonie.
- Een bekend nummer opent de klantkaart. Een onbekend nummer opent een ingevuld nieuw-klantformulier;
  meerdere matches worden ter keuze getoond. Zoeken maakt nooit automatisch een klant aan.
- Klanten en objecten toevoegen; opdrachten met scope, dienst, deadline en interne notitie.
- Meerdere inspectieronden per opdracht, werkelijke inspectiedatum en afzonderlijk datumvoorstel.
- Nieuwe bevindingen en vervolgwaarnemingen op hetzelfde aandachtspunt.
- Rapportconcept, samenvatting en PDF toevoegen; vrijgeven en intrekken.
- Klantportaal met toegewezen objecten, vrijgegeven rapporten/bevindingen, PDF-downloads,
  datumvoorstellen, verzoeken/herstelmeldingen en eigen naam/telefoonnummer.
- Antwoord en behandelstatus van klantverzoeken vanuit de backoffice.
- Servercontrole op ieder dossier en download, objectselectie per gebruiker,
  afzonderlijke dossier- en financiële rollen en direct intrekbare rechten.
- Auditregistratie en herhaalbare schrijfverzoeken zonder dubbele records.
- Database-identiteit voor 3D-modelversies en markeringen op waarnemingen; nog geen viewer.

### Websiteboekingen — actief

De werkruimte **Websiteboekingen** ontvangt kopieën van consumentenboekingen,
De Parken en VvE-aanvragen. De bron bewaart iedere te verwerken wijziging in een
duurzame wachtrij. De primaire route controleert die iedere minuut met
`pg_cron` en `pg_net`; de bestaande GitHub-workflow blijft als vijfminutenterugval
beschikbaar. Beide verwerken dezelfde begrensde batches naar één vast ERP-adres.
De broncron is native bevestigd. Dit is geen directe synchronisatie
na een klik en geen garantie van maximaal één minuut vertraging.

De broncron verstuurt alleen `{}` met een doelgebonden handtekening, tijdstip en nonce.
De handtekening geldt maximaal 60 seconden; de worker verbruikt de nonce éénmaal
via een service-only RPC vóór het claimen van werk. De lang geldige koppelsleutel
blijft in de bestaande bron-/ERP-omgevingen en de vaste Vault-naam, buiten queueheaders
en croncommando's. De standaard leesbaarheid van `pg_net`-headers verleent daarmee
geen inname-, betaal- of accountrechten. Zonder klaarstaand werk wordt niets verstuurd;
actieve claims en bestaande verzoeken voorkomen overlappende verwerking.

Consumentenboekingen en pilotafspraken krijgen één gekoppeld dossier en opdracht per
bronidentiteit, met de opgeslagen prijs, akkoordversie, inspectiekeuze en afspraakstatus.
Mollie-referentie en betaalstatus worden uitsluitend uit de bron overgenomen. Een
pilotbevestiging is geen betalingsbewijs. Een VvE-aanvraag blijft een vrijblijvende aanvraag
met een prijsindicatie; zij maakt geen opdracht, factuur, betaling of portaalrecht aan.
Historische bedragen worden niet herberekend met huidige tarieven. Onbekende prijssplitsing,
veranderde prijsafspraak of gewijzigde contact-/objectidentiteit krijgen een controlemelding.

De bronmigratie, worker en ERP-ontvanger zijn getest, gepubliceerd en met echte
bronregistraties gecontroleerd. De wachtrij is volledig geleverd, zonder fouten
of controlegevallen. Nieuwe bronwijzigingen worden automatisch klaargezet.
De volledige gegevensafspraken, stappen en acceptatieproeven staan in
[Website → eigen ERP](../../docs/erp-website-intakes.md).

Een datumvoorstel reserveert geen agendatijd. Een herstelmelding wijzigt geen
inspectieoordeel. Vrijgegeven rapporten en waarnemingen worden niet overschreven.
Nieuwe opdrachten nodigen geen klant uit en versturen geen e-mail.

### Telefonie en telefoonherkenning

De werkruimte **Telefonie** en de route `#call/<URL-gecodeerd-nummer>` bereiden de
klantweergave bij een inkomend gesprek voor. Alleen de medewerker kan nummers
opzoeken. De server vergelijkt volledige, genormaliseerde telefoonnummers;
afgeschermde nummers en zoekfouten worden afzonderlijk afgehandeld. Een wachtende
oproep kan na de proeflogin worden geopend. Nieuwe klantgegevens worden pas na
bevestiging opgeslagen.

Ferry bevestigde op 27 oktober dat Dubline de huidige telco is en Antagonist de mailprovider. Een providerverbinding is nog niet geverifieerd. De onderstaande Voys-verwijzing is historisch ontwerp, geen nieuwe providerkeuze. Er is geen openbare webhook of nieuwe toegang tot
Voys aangemaakt. De echte verbinding volgt in de beveiligde online ERP-omgeving
via [Voys gespreksnotificaties](https://help.voys.nl/gespreksnotificaties), met
afzendercontrole en meldingen voor de juiste medewerker. De lokale proefserver
ontvangt geen echte telefoongesprekken. De functionele afspraken staan in
[het ERP-ontwerp](../../docs/eigen-erp-klantportaal.md#9-telefonie-en-voys).

## Technische opzet

`public/` bevat de Nederlandstalige interface. `db/001_foundation.sql` bevat het
Postgres-gegevensmodel en de afgeschermde `public.roofsignal_erp`-RPC.
`db/002_telephony.sql` voegt nummerherkenning voor medewerkers toe, zonder directe
tabeltoegang. De oorspronkelijke opdrachten blijven achter een private functie
beschikbaar. Deze lokale uitbreiding wordt ook bij bestaande proefdatabases
toegepast bij herstart, met behoud van dossiers. `db/003_auth_and_documents.sql`
voegt accountcontrole, toegangbeheer en het sessieregister toe. In de cloud gebruikt
`db/004_private_storage.sql` een private PDF-bucket met extra blokkerende regels
voor rechtstreekse toegang door browsers.
`db/005_website_intake.sql` voegt bronregistraties, onveranderlijke revisies en
overgenomen afspraken toe. Het scherm en de server verbergen expliciet gemarkeerde
proeforganisaties en proefidentiteiten. Oude tokens van afgesloten proefaccounts
en nieuwe machtigingen voor zulke accounts worden door de RPC geweigerd.
`src/dev-server.mjs` is uitsluitend de lokale adapter. Dezelfde RPC wordt lokaal
onder de ongeprivilegieerde `authenticated`-rol uitgevoerd. Voor de databaseproeven
gebruiken we [PGlite](https://pglite.dev/docs/about), een lokale Postgres-runtime.

De ERP-tabellen staan in een eigen schema zonder directe toegang voor `anon`,
`authenticated` of `PUBLIC`. De RPC controleert de via `auth.uid()` vastgestelde
gebruiker, expliciete medewerkerrechten en dossiermachtigingen. Een e-mailadres,
domein, contactrecord of KVK-nummer verleent geen toegang. De client krijgt geen
service key en bepaalt geen rol. `people` bevat alleen bewerkbare eigen profielvelden.

Objectidentiteit staat los van organisatie/eigendom. Een opdracht bewaart de
opdrachtgever en het object. Historische documenten worden daardoor niet automatisch
doorgegeven bij een nieuwe eigenaar of beheerder. Inspectieronden, bezoeken,
blijvende bevindingen en gedateerde waarnemingen zijn afzonderlijke records.
Modelmarkeringen mogen alleen naar een waarneming uit dezelfde inspectieronde verwijzen.

PDF's worden lokaal buiten de webroot opgeslagen, gecontroleerd op grootte/type,
alleen na dossierautorisatie geleverd en als download geserveerd. De browsercache
is uitgeschakeld. De hosted adapter gebruikt private opslag met serverdownloads;
de websitekoppeling is actief. Back-up/herstel moet nog afzonderlijk worden beproefd.

## Getest

De automatische tests voeren de echte SQL/RPC en HTTP-routes uit:

- Klant A/B, anoniem, dossierlezer, contactpersoon, financieel contact en ingetrokken medewerker.
- Directe tabeltoegang geweigerd; geen concepten, interne notities of andere klantdossiers zichtbaar.
- Objectbeperking, verlopen/ingetrokken rechten en ingetrokken PDF-vrijgave.
- Herhaalde verzoeken, gewijzigde payload met hetzelfde verzoeknummer en transactionele terugdraaiing.
- Publicatievoorwaarden, onveranderlijke historie en hetzelfde aandachtspunt over meerdere inspecties.
- Klantverzoeken, herstelmelding versus beoordeling en profielwijziging zonder rolverhoging.
- Afgeschermde PDF-upload/download, sessie, CSRF en opslag na herstart.
- Versleutelde cookies, vervalsing/duplicatie, aflopen, herstelrechten, rollen en
  ingetrokken sessies; de echte cloudproef staat los van deze lokale tests.
- Verkeerde koppelingen tussen 3D-modelversie en waarneming geweigerd.
- Volledige nummerherkenning, gedeelde nummers, afgeschermde nummers en onbekende bellers;
  toegang beperkt tot actieve medewerkers, geen automatische klantaanmaak, behoud na database-update.

PGlite is geen vervanging voor een productieproef met meerdere gelijktijdige
Postgres-sessies, de echte Supabase-authenticatie en de uiteindelijke bestandsopslag.

### Uitgevoerde cloudproef · 12 oktober 2026

De afzonderlijke testomgeving doorliep echte Auth-, Postgres- en Storage-verzoeken:
medewerker en klant A/B, verborgen concepten/interne notities, gebruikersgebonden RPC,
private PDF-upload/download, directe tabel-/opslagtoegang geweigerd, intrekken van
dossierrechten en sessies, hersteltoken en twee gelijktijdige wachtwoordverzoeken met
exact één winnaar. Dezelfde accounts zijn ook via het browserinlogscherm gecontroleerd.
Een fictief object bevat twee vrijgegeven inspectieronden, een leesbare voorbeeld-PDF
en een voorstel voor de volgende halfjaarlijkse ronde. Er is geen klantmail verstuurd.

De afsluitende lokale suite telt 182 geslaagde ERP-tests en 119 geslaagde websitecontroles.
Ook de VvE-gegevensprojectie, HMAC-/wachtrijgrenzen en de 14 broncronproeven zijn getest.
Die proeven gebruiken echte PostgreSQL-ondertekening en controleren nonceverbruik,
verloop, claims en herhaalbare installatie. De hosted cronronde is daarnaast met
een echte herhaalde levering bevestigd. Een volgende lege minuutronde verstuurde
geen extra netwerkverzoek en liet alle vijf registraties ongewijzigd.
De bestaande 33 CMS-pagina's bouwen correct.
De Cloudflare-server compileert met Wrangler 4.149.0. De afzonderlijke online omgeving
doorliep daarna de HTTPS-proef: medewerker- en klantlogin, klant A/B-isolatie,
private PDF-download, versleutelde Secure/HttpOnly-cookie, weigeren van anonieme
schrijfverzoeken en weigeren van een gekopieerde cookie na uitloggen. De online
browser toont de twee inspectieronden en het halfjaarlijkse datumvoorstel.

## Vervolg vóór gebruik met echte klanten

1. **Toegangsbeheer:** het eigen beheeraccount is actief en de proefaccounts zijn
   afgesloten. Herstel per e-mail blijft uit tot SMTP en bezorging zijn getest.
2. **Beheer van dossiers en bestanden:** back-up/herstelprocedure beproeven en controle
   op achtergebleven private uploads toevoegen. Private opslag en serverdownloads zijn getest.
3. **Website → ERP beheren:** de bronwachtrij en ontvanger zijn actief en de expliciet
   goedgekeurde historische import is afgerond. Controleer achterstanden en meldingen.
   De minuutcron is gepubliceerd en native bevestigd; behoud GitHub als terugval.
   Bewaar prijs, akkoord, betaalreferentie en reisafspraak. Bestaande Google/Mollie-routes
   blijven eigenaar van planning en betalingsbevestiging tot migratie.
4. **Offerte en financiën:** offertes, orderregels, facturen, creditnota's en gecontroleerde
   betalingsverwerking. Daarna eigen grootboek, dagboeken, btw-verwerking, bankafstemming,
   periodeafsluiting en accountantsexport met inhoudelijke controles. Geen dubbele facturatie.
5. **Herhaling en uitvoering:** overeenkomsten, halfjaarlijkse/jaarlijkse inspectieronden,
   daadwerkelijke capaciteitscontrole, reisplanning, checklists en medewerkerplanning.
6. **3D:** één echt proefobject met twee opnamen, private modelopslag, viewer, klikbare
   waarnemingen, datumselectie en mobiele lijstweergave. Geen automatische geometrische
   vergelijking zonder gecontroleerde uitlijning.

De ERP-SQL staat bewust buiten `supabase/migrations/` en wordt uitsluitend in de
afzonderlijke ERP-database toegepast. De nieuwe bronwachtrij staat wél in de
website-Supabasemigraties; publicatie daarvan loopt via de bestaande productie-release.
Houd deze publicatieroutes gescheiden. Geen ERP-bouw of import geeft automatisch
portaalrechten, nodigt klanten uit of schakelt het bestaande portaal om.

## Commerciële werkruimte — bouw 27 oktober

`db/006_commercial.sql` voegt offertes en factuurconcepten toe. De server rekent
btw en totaal in gehele centen uit; dezelfde schrijfaanvraag maakt geen duplicaat.
Een offerte kan expliciet worden vrijgegeven of ingetrokken. Vrijgegeven inhoud
kan niet worden overschreven. Een financieel contact ziet uitsluitend vrijgegeven
offertes voor de toegewezen organisatie/objecten. Dossierlezers en klantcontacten
krijgen hierdoor geen financiële toegang. Factuurconcepten blijven intern en
kunnen nog niet worden uitgegeven, betaald of verstuurd.

Deze migratie is uitsluitend voor de eigen ERP-database. Nooit de oude
initialisatie/cloud-smoke met fictieve accounts opnieuw op de ingerichte omgeving
uitvoeren. Eerst tests en een afzonderlijke controle van projectidentiteit, daarna
migratie 006 en de bijgewerkte RPC-wrapper uit 005 toepassen in één transactie; pas vervolgens de bijbehorende interface publiceren.

### Open voor volledige oplevering

- Uitgegeven facturen/creditnota's, nummerreeks, bedrijfsgegevens en boekhouding.
- Mollie-reconciliatie van betalingen, terugbetalingen en chargebacks.
- Volledige capaciteitsplanning en periodieke opdrachten met Google-agendacontrole.
- Private modellen/foto's, 3D-viewer en klikbare bevindingen.
- Echte Voys-gebeurtenissen en routering naar de juiste medewerker.
- SMTP-bezorging en een geteste klantuitnodiging/herstelketen.

Deze punten zijn geen geleverde functies. Externe verbindingen worden pas als
werkend gemeld na een geslaagde proef met de bestaande dienst.
