# Eigen RoofSignal ERP — eerste werkende bouwfase

Status: lokale proefomgeving, 11 oktober 2026. Eigen software; geen Odoo of ERPNext.
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
`db/002_telephony.sql` voegt medewerkers-only nummerherkenning toe, zonder directe
tabeltoegang. De oorspronkelijke opdrachten blijven achter een private functie
beschikbaar. Deze lokale uitbreiding wordt ook bij bestaande proefdatabases
toegepast bij herstart, met behoud van dossiers.
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
is uitgeschakeld. De productieopslag en tijdelijke downloadlinks zijn nog niet ingericht.

## Getest

De automatische tests voeren de echte SQL/RPC en HTTP-routes uit:

- Klant A/B, anoniem, dossierlezer, contactpersoon, financieel contact en ingetrokken medewerker.
- Directe tabeltoegang geweigerd; geen concepten, interne notities of andere klantdossiers zichtbaar.
- Objectbeperking, verlopen/ingetrokken rechten en ingetrokken PDF-vrijgave.
- Herhaalde verzoeken, gewijzigde payload met hetzelfde verzoeknummer en transactionele terugdraaiing.
- Publicatievoorwaarden, onveranderlijke historie en hetzelfde aandachtspunt over meerdere inspecties.
- Klantverzoeken, herstelmelding versus beoordeling en profielwijziging zonder rolverhoging.
- Afgeschermde PDF-upload/download, sessie, CSRF en opslag na herstart.
- Verkeerde koppelingen tussen 3D-modelversie en waarneming geweigerd.
- Volledige nummerherkenning, gedeelde nummers, afgeschermde nummers en onbekende bellers;
  toegang beperkt tot actieve medewerkers, geen automatische klantaanmaak, behoud na database-update.

PGlite is geen vervanging voor een productieproef met meerdere gelijktijdige
Postgres-sessies, de echte Supabase-authenticatie en de uiteindelijke bestandsopslag.

## Vervolg vóór gebruik met echte klanten

1. **Besloten testomgeving:** dezelfde SQL eerst in een afzonderlijke Supabase-testomgeving;
   bestaande identiteit verifiëren, expliciet medewerkerrechten toekennen, echte inlog en
   accountuitnodiging bouwen. De ontwikkel-accountkiezer en auth-bootstrap mogen daar niet bestaan.
2. **Dossiers en bestanden:** private opslag koppelen, upload/download met servercontrole,
   tijdelijke links en geteste back-up/herstelprocedure. Gebruikersbeheer met intrekken van rechten.
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
