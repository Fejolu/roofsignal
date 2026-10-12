# Eigen RoofSignal ERP — medewerker- en klantlogin

Status: loginbouwfase, 12 oktober 2026. Eigen software; geen Odoo of ERPNext.
Er zijn geen echte klanten, boekingen of financiële gegevens overgezet. Deze app en
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
- De browser krijgt versleutelde HttpOnly-sessiecookies, geen leesbare toegangstokens.
  Een duurzaam sessieregister controleert verloop en intrekking, ook na serverherstart.
- De server verifieert de actuele Auth-gebruiker en voert bedrijfsacties uit met diens
  eigen token. De geheime serversleutel is beperkt tot profiel/sessie/document-RPC's
  en de private PDF-opslag; zij bepaalt nooit een browserrol.
- Iedere PDF-download controleert de huidige dossierrechten en rapportvrijgave.
  Er worden geen downloadlinks uitgegeven die na intrekking nog geldig blijven.

De bestaande website-Supabaseomgeving is hard geblokkeerd in deze adapter.
De echte cloudproef moet slagen voordat de app online of met echte klanten wordt gebruikt.
Er worden geen uitnodigingen aan bestaande klanten gestuurd bij het starten of bouwen.

### Testinrichting en controle

Maak pas na goedkeuring het afzonderlijke **RoofSignal ERP test**-project aan.
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
Auth-tokens, klant A/B, rapportvrijgave, private opslag en ingetrokken sessies/rechten:

```sh
node scripts/configure-auth.mjs .local/auth-test.json --configure-isolated-test
npm run test:cloud -- .local/auth-test.json --provision-fixtures
ROOFSIGNAL_ERP_TEST_CONFIG=.local/auth-test.json npm run dev:auth
```

Voor herstelmails moeten de exacte callback-URL en de twee templates in
`supabase/templates/` in de geïsoleerde Auth-inrichting zijn ingesteld. Openbare
registratie en anonieme accounts blijven uit. Verander bij online hosting de vaste
origin naar de HTTPS-testlocatie; gebruik geen brede wildcard-redirects.

`functions/[[path]].js` en `wrangler.toml` bereiden een afzonderlijk Cloudflare Pages
testproject voor. Bewaar `ERP_STORAGE_KEY` en `ERP_SESSION_SECRET` als geheimen.
Gebruik nooit het openbare RoofSignal Pages-project. De hostingconfiguratie verleent
zelf geen toegang en publiceert niets automatisch. Beperk toegangspogingen ook op
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

Een datumvoorstel reserveert geen agendatijd. Een herstelmelding wijzigt geen
inspectieoordeel. Vrijgegeven rapporten en waarnemingen worden niet overschreven.
Nieuwe opdrachten nodigen geen klant uit en versturen geen e-mail.

### Voys en telefoonherkenning

De werkruimte **Telefonie** en de route `#call/<URL-gecodeerd-nummer>` bereiden de
klantweergave bij een inkomend gesprek voor. Alleen de medewerker kan nummers
opzoeken. De server vergelijkt volledige, genormaliseerde telefoonnummers;
afgeschermde nummers en zoekfouten worden afzonderlijk afgehandeld. Een wachtende
oproep kan na de proeflogin worden geopend. Nieuwe klantgegevens worden pas na
bevestiging opgeslagen.

Voys is nog niet verbonden. Er is geen openbare webhook of nieuwe toegang tot
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
productie-inrichting en back-up/herstel zijn nog niet geactiveerd.

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

## Vervolg vóór gebruik met echte klanten

1. **Besloten testomgeving:** nieuwe Auth-adapter en dezelfde SQL eerst in een afzonderlijke
   Supabase-testomgeving beproeven, eerste echte beheerder expliciet toekennen en
   uitnodigingsmails controleren. De ontwikkel-accountkiezer en auth-bootstrap bestaan daar niet.
2. **Dossiers en bestanden:** private opslag koppelen, upload/download met servercontrole,
   geteste back-up/herstelprocedure en controle op achtergebleven private uploads.
3. **Website → ERP:** productcatalogus met goedgekeurde prijsversies, consumentenboekingen en
   VvE-aanmeldingen idempotent overnemen; prijs, akkoord, betaalreferentie en reisafspraak behouden.
   Bestaande Google/Mollie-routes blijven eigenaar van planning en betalingsbevestiging tot migratie.
4. **Offerte en financiën:** offertes, orderregels, facturen, creditnota's en gecontroleerde
   betalingsverwerking. Daarna eigen grootboek, dagboeken, btw-verwerking, bankafstemming,
   periodeafsluiting en accountantsexport met inhoudelijke controles. Geen dubbele facturatie.
5. **Herhaling en uitvoering:** overeenkomsten, halfjaarlijkse/jaarlijkse inspectieronden,
   daadwerkelijke capaciteitscontrole, reisplanning, checklists en medewerkerplanning.
6. **3D:** één echt proefobject met twee opnamen, private modelopslag, viewer, klikbare
   waarnemingen, datumselectie en mobiele lijstweergave. Geen automatische geometrische
   vergelijking zonder gecontroleerde uitlijning.

De SQL staat bewust buiten `supabase/migrations/`: samenvoegen van deze bouwfase mag
geen automatische migratie van productie, klantuitnodiging of omschakeling van het
bestaande portaal veroorzaken. Productie-inrichting en migratie worden als afzonderlijke,
geteste veranderingen uitgevoerd.
