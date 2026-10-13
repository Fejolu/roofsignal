# Websiteboekingen → eigen RoofSignal ERP

Technische en functionele afspraken · 13 oktober 2026

## Status

**Actief en met echte bronregistraties gecontroleerd.** Ferry heeft specifiek akkoord
gegeven voor de drie proefaccounts, de beperkte koppelsleutel in beide omgevingen en
de koppeling voor bestaande en nieuwe website-aanmeldingen. De drie proefaccounts
zijn geblokkeerd en hun ERP-rollen, machtigingen en sessies zijn ingetrokken; de twee
proeforganisaties en hun historie blijven afgeschermd bewaard. Een onafhankelijke
providercontrole bevestigt dat alle drie de oude proefwachtwoorden worden geweigerd.

PR #25 is samengevoegd naar `main` als `0b8019ca5f94953b28a30d6f7299832544e1c071`.
De gecontroleerde Supabase-productierelease `38305254597` is geslaagd. De bronprojectie
bevat vier verlopen consumentenboekingen, één bevestigde Parken-afspraak en geen
VvE-aanvragen. Alle vijf registraties zijn overgenomen. De beperkte koppelsleutel is
versleuteld opgeslagen in de website-Supabaseomgeving en het aparte ERP-Pages-project.
Cloudflare publiceert vanaf `main`, met `environment=production`; herstel per e-mail
blijft uitgeschakeld zolang SMTP en bezorging niet zijn beproefd.

Het eigen beheeraccount **Ferry Joosten · ferry@roofsignal.nl** is wel geactiveerd.
Ferry heeft zelf een wachtwoord ingesteld en is ingelogd. De eigenaaractivatie
verstuurde geen e-mail. Het account heeft expliciete administratorrechten; een
e-mailadres of domein bepaalt nooit een rol.

De afsluitende lokale suite telt 182 geslaagde ERP-tests, inclusief de actieve
broncron en echte PostgreSQL-ondertekening. De bestaande 119 websitecontroles
slagen eveneens; ook de GitHub-controles en beide Cloudflare-publicaties zijn geslaagd.
De providerproef en historische overname staan hieronder vastgelegd.

### Providerproef · 13 oktober 2026

- Cloudflare-productiedeployment `03efe4e0-8aaa-4649-930b-03bccb7089c4` is geslaagd;
  de openbare configuratie bevestigt hosted/production en uitgeschakeld e-mailherstel.
- De bronworker leverde vijf registraties: vier `consumer/payment_expired` en één
  `parken/pilot_confirmed`. Er waren nul fouten en nul aanvragen voor handmatige controle.
- Herhaalde paginering leverde nul nieuwe of gewijzigde records; een herhaalde
  verwerking deed niets. Alle vijf bronidentiteiten bleven eenmaal aanwezig en de
  bronwachtrij had nul achtergebleven leveringen.
- GitHub-run `38351756449` bevestigt de actieve ERP-stap met de bestaande automatiseringssleutel;
  de voorafgaande consumentencontrole verwerkte nul opdrachten en verstuurde geen nieuwe mail.
- Native Auth weigert alle drie opgeslagen proefwachtwoorden. Er zijn geen actieve
  proefrollen, niet-ingetrokken machtigingen of geldige proefsessies. Ferry's account
  blijft bevestigd en actief.
- De werkelijke bron bevatte geen VvE-aanmeldingen. Die route is met de samengestelde
  bron→HTTP→SQL-tests gecontroleerd; er is geen fictieve VvE-aanvraag als live klant geïmporteerd.

Het vijfminutenschema van GitHub is geen waargenomen garantie: de laatste geplande run
vóór deze proef was om 03:23 Nederlandse tijd, bijna vier uur vóór de controle om 07:18.
Een handmatige ronde om 07:30 slaagde. De bron bewaart nieuwe gegevens duurzaam totdat
een verwerkingsronde ze bevestigt.

### Broncron · actief en native bevestigd

PR #41 is samengevoegd als `c23a0fa33e8231343072d994ea815afb30bd0c1d`;
productierelease `38388252684` en alle zes productiecontroles zijn geslaagd.
ERP-Pages-deployment `0faed192-37ba-480d-abbf-b5f554e97e6b` is geslaagd.
De vaste broncron controleert de wachtrij iedere minuut met `pg_cron` en `pg_net`.
De bestaande beperkte koppelsleutel is via de gebonden RPC in de bron-Vault opgeslagen.

De automatische ronde op 13 oktober om **13:13 Nederlandse tijd** verstuurde één
reeds geleverde, bevestigde Parken-registratie opnieuw, met dezelfde revisie.
De werkelijke netwerkontvangst gaf HTTP 200, zonder timeout; de nonce was verbruikt.
De worker bevestigde één levering, nul fouten en nul handmatige controles.
Bron- en netwerkqueues waren daarna leeg. Alle vijf bron-, outbox- en ERP-snapshots
en hun laatste revisies komen overeen; er zijn vijf opdrachten zonder duplicaten.
De proef wijzigde geen betaling, bronafspraak of klantmail en verleende geen portaalrecht.
De volgende lege minuutronde slaagde zonder extra netwerkverzoek; alle vijf
registraties, revisies en opdrachten bleven ongewijzigd.

GitHub blijft beschikbaar als terugval. De minuutcontrole is geen toezegging van
synchronisatie binnen één minuut.

## Gescheiden bron en bestemming

| Onderdeel | Vastgelegde omgeving en verantwoordelijkheid |
|---|---|
| Openbare website | `roofsignal.nl`; bestaande Supabase `kakpticlxlaxtebhsuoh`. Bron van boekingen, akkoord, prijzen, Google-afspraken en Mollie-statussen. |
| Eigen ERP | Afzonderlijke Supabase `seyuhowazudrhgrbwtbk`; projectnaam voorlopig **RoofSignal ERP test**. Eigen klant-, object-, opdracht- en rapportgegevens. |
| ERP-webomgeving | `https://roofsignal-erp-test.pages.dev`; aparte Cloudflare Pages-publicatie. De hostnaam bevat nog `test`. |
| Enige ontvanger | `https://roofsignal-erp-test.pages.dev/api/website-intake`; vast in de bronworker. |

De ERP-adapter weigert de website-Supabaseomgeving als ERP-database. ERP-migraties
staan in `apps/erp/db/`, buiten de automatische website-migraties. De nieuwe
bronwachtrij staat wel in `supabase/migrations/` en volgt de bestaande website-release.
Deze twee publicatieroutes mogen niet worden verwisseld.

De bestaande Google-/Mollie-functies blijven verantwoordelijk voor reserveren,
bevestigen, betalen en herstellen. De ERP-koppeling registreert hun uitkomst en
roept geen nieuwe betaling of agendareservering aan. Zij verstuurt geen klantmail
en maakt geen Auth-account of portaalmachtiging aan.

## Wat wordt overgenomen?

| Bron | ERP-registratie | Prijs en betaling |
|---|---|---|
| Consumentenboeking | Eén gekoppelde klant/object/opdracht per bronidentiteit, inspectiekeuze, akkoordversie en extern afspraakmoment. Nog niet betaalde boekingen blijven concept; een bronbevestiging na betaling maakt de opdracht actief. | Opgeslagen prijs, reiskosten, Mollie-referentie en bronbetaalstatus. |
| De Parken | Pilotopdracht met de opgeslagen optie, afspraak en pilotstatus. Een oude interesse in thermografie wordt niet als aankoop geïnterpreteerd. | Pilotprijs indien vastgelegd; geen betaling afleiden uit een afspraakbevestiging. |
| VvE-aanmelding | Vrijblijvende aanvraag in Websiteboekingen. Nieuwe inzendingen bevatten inspectiekeuze, aantal adressen en objectgegevens. | Servermatig bepaalde staffelindicatie; nog geen overeengekomen prijs of betaling. |

Voor consumenten worden de opgeslagen basis-/thermografiebedragen, reiskosten,
totaal, prijsversie, voorwaardenversie, Mollie-referentie en betaalstatus bewaard.
Bedragen zijn hele eurocenten; zij worden niet uit de huidige websiteprijzen herberekend.
Bij een onbekende historische componentverdeling blijven beide componenten onbekend
en blijft het oorspronkelijke totaal bewaard, met een financiële controlemelding.

Pilotbedragen en voorwaarden worden alleen overgenomen wanneer die in de bron staan.
Een pilotbevestiging betekent een afspraak; zij bevat geen geverifieerde Mollie-betaling.
Ontbrekende bedragen verschijnen als **Niet vastgelegd**, zonder verzonnen nulprijs.

Een VvE-indicatie is altijd **niet geaccepteerd** en exclusief nog af te stemmen
reiskosten. Het serverdeel bepaalt de staffel uit de gekozen inspectie, omvang en
aantal adressen; een door de browser opgegeven bedrag geldt niet als prijsbron.
Meerdere gebouwen of een grotere omvang blijven maatwerk. Een VvE-aanvraag maakt
geen operationele opdracht, afspraak, factuur, betaling of klantlogin aan. Historische
aanvragen zonder gestructureerde velden blijven leesbare aanvragen; hun tekst wordt
niet geautomatiseerd als prijsafspraak geïnterpreteerd. Een opgegeven KVK-nummer
geldt niet als geverifieerde identiteit of bewijs van het aantal adressen.

## Herhaalbare verwerking en historie

De bronwachtrij `erp_intake_outbox` gebruikt `(source, source_id)` als identiteit.
Een inhoudelijke wijziging verhoogt de revisie. Alleen een gewijzigde technische
`updated_at` verhoogt haar niet. De worker neemt maximaal tien records per ronde
onder een tijdelijke verwerkingsclaim; een oude ontvangstbevestiging kan een
nieuwere revisie niet als afgehandeld markeren.

De ERP-ontvanger bewaart iedere geaccepteerde revisie afzonderlijk. Dezelfde revisie
met dezelfde inhoud is herhaalbaar; een oudere revisie wordt zonder terugzetten
bevestigd. Andere inhoud met hetzelfde revisienummer wordt geweigerd. Er ontstaat
geen tweede opdracht of inspectieronde door een herhaald verzoek.

De oorspronkelijke commerciële afspraak en het gekoppelde dossier blijven behouden.
Een latere prijswijziging krijgt een financiële controlemelding. Een gewijzigde
contact- of objectidentiteit krijgt een afzonderlijke identiteitscontrole; zij
overschrijft het dossier niet. De actuele bronregistratie blijft zichtbaar naast
de oorspronkelijke opdracht. Handmatig bewerkt of afgerond medewerkerswerk wordt
niet stilzwijgend door een bronupdate teruggezet.

Een reeds overgenomen checkout die vóór betaling sluit met `not_created` wordt
als niet afgerond verwerkt, met een geannuleerde externe afspraak. Een nooit
ingediende voorbereiding maakt geen nieuw ERP-dossier. Ook na identiteitscontrole
blijft een daadwerkelijk geannuleerde afspraak geannuleerd.

## Wachtrij, snelheid en storingen

De websitehandeling wacht niet op een HTTP-verzoek aan het ERP. De bron schrijft
alleen de eigen duurzame wachtrij. De actieve primaire broncron
`roofsignal-erp-intake-every-minute` controleert die wachtrij iedere minuut. Hij roept
uitsluitend de bestaande `process-erp-intakes`-worker aan, met een lege JSON-body.
Zonder klaarstaande records volgt geen netwerkverzoek. Een toekomstige herhaaltermijn,
geldige verwerkingsclaim of al wachtend verzoek voorkomt een nieuwe oproep.

De broncron haalt dezelfde beperkte koppelsleutel uit één vaste Vault-naam. De
netwerkqueue bevat alleen een doelgebonden HMAC-handtekening, tijdstip en willekeurige
nonce. De handtekening geldt maximaal 60 seconden en uitsluitend voor de lege
ERP-verwerkingsopdracht. De worker verbruikt de nonce met een afgeschermde, atomaire
RPC voordat hij records opvraagt of claimt. Gelijktijdige of herhaalde oproepen hebben
dus maximaal één winnaar. De lang geldige sleutel en klantgegevens staan niet in
queueheaders, croncommando's of migraties. De standaardrechten op Supabase's
`pg_net`-queue worden niet als privé beschouwd; de beveiliging steunt op deze beperkte,
eenmalige opdracht.

De bestaande workflow **Consumentenboekingen controleren en bevestigen** blijft de
terugval met een GitHub-schema van elke vijf minuten. De ERP-stap draait ook wanneer
de consumentencontrole in die ronde faalt. Beide routes gebruiken dezelfde claims en
ontvangstbewijzen. Planners, transport en begrensde batches kunnen vertraging geven;
noch de minuutcontrole, noch het GitHub-schema vormt een maximumvertraging.
De broncron is native bevestigd met een echte automatische ronde en gecontroleerde
ontvangst, zonder een tweede opdracht of inspectieronde.

Bij transport- of configuratiefouten blijft de bronregistratie in de wachtrij met
begrensde herhaalpogingen. Ongeldige inhoud of een revisieconflict vraagt handmatige
controle. Alleen vaste foutcodes worden opgeslagen en gelogd; providerberichten,
klantadressen en geheime links worden niet in workflow-uitvoer opgenomen.
Een uitgevallen ERP-ontvanger maakt geen betaling ongedaan en stuurt geen tweede
bevestigingsmail. De workflow kan herstel of benodigde controle melden.

## Toegang en gegevensbeperking

- De bronprojecties gebruiken expliciete veldlijsten. Checkout-URL's, hersteltokens,
  providerpayloads, routesleutels en interne claims worden niet geëxporteerd.
- De beperkte koppelsleutel ondertekent de exacte JSON met HMAC-SHA256 en een tijdstip.
  De ontvanger controleert de handtekening, maximaal vijf minuten tijdverschil,
  methode, vaste route, inhoudstype, grootte en toegestane bronvelden.
- Deze sleutel autoriseert uitsluitend website-inname en de beperkte ERP-verwerkingsopdracht. Zij kan geen
  medewerkersessie maken, portaalrechten toekennen, rapport publiceren of geld innen.
- De broncron gebruikt dezelfde sleutel met een afzonderlijk
  `erp-drain:v1`-doel voor zijn 60-secondenopdracht. Deze handtekening kan niet als
  website-inname, betaling of accountautorisatie worden gebruikt. Alleen de bronworker
  mag de nonce verbruiken; de browser kan de dispatcher, nonceopslag of Vault niet benaderen.
- De website ontvangt geen ERP-servicekey. De ERP-server gebruikt zijn eigen
  servicesleutel voor één geautoriseerde inname-RPC; browsers kunnen die niet aanroepen.
- Websiteboekingen zijn alleen voor actieve medewerkers zichtbaar. Klanten zien
  uitsluitend hun expliciet toegewezen dossiers en vrijgegeven rapporten.
- Proefidentiteiten worden expliciet geregistreerd. Na afsluiting weigert de SQL-RPC
  ook een oude proef-JWT en een nieuwe machtiging voor zo'n account. Afgeschermde
  proeforganisaties verschijnen niet in dossiers of telefoonherkenning.

Bewaar geen sleutelwaarden, sessiecookies, wachtwoorden, activatietokens of volledige
activatie-URL's in dit document, Git, publicatiebestanden of workflow-uitvoer.

## Gecontroleerde activering

De eigenaarlogin, ERP-migratie, proefaccountafsluiting, beide publicaties, beperkte
koppelsleutel, historische import en live providerproef zijn uitgevoerd. De onderstaande
stappen beschrijven de herhaalbare werkwijze; zij zijn geen openstaande goedkeuringsvragen.

1. **Akkoord vastgelegd:** specifiek akkoord voor het afsluiten van de drie bekende
   proefaccounts, de beperkte koppelsleutel in beide omgevingen en de publicatie is ontvangen.
   De eerdere automatische afwijzing is hiermee opgelost; dit akkoord hoeft niet opnieuw
   te worden gevraagd voor dezelfde handelingen.
2. **ERP-database:** pas de beoordeelde `005_website_intake.sql` uitsluitend toe in
   het vastgelegde ERP-project. Gebruik geen nieuwe volledige cloud-smoke-inrichting;
   die zou nieuwe proefrecords maken en weigert daarom een reeds ingerichte innameomgeving.
3. **Proefaccounts afsluiten:** controleer Ferry's bevestigde login en actieve
   administratorrol. `scripts/account-admin.mjs retire-fixtures` controleert precies
   de drie bekende Auth-identiteiten en twee proeforganisaties. Het trekt eerst
   ERP-rollen, machtigingen en sessies in, markeert de proefgegevens en blokkeert
   vervolgens de Auth-accounts. Historie en PDF's worden niet verwijderd. Een
   gedeeltelijk mislukte Auth-blokkering is veilig herhaalbaar. De audit bevat
   `owner.bootstrap` en `fixtures.retire`, zonder dubbele regels bij een herhaling.
4. **Ontvanger publiceren:** publiceer de eigen ERP-app in het aparte Pages-project,
   met de bestaande zes ERP-geheimen en de nieuwe `ERP_INTAKE_SECRET`. Zet het zakelijke
   omgevingslabel bewust; herstel per e-mail blijft uit tot SMTP en bezorging zijn getest.
   De uitnodigings-/herstelcallback voor handmatige activatie blijft beschikbaar.
5. **Websitebron publiceren:** de bestaande release past eerst
   `20261012223000_erp_intake_outbox.sql` toe, inclusief het optionele VvE-veld,
   en publiceert de geteste bronfuncties en worker. Houd `ERP_INTAKE_ENABLED` uit
   totdat de ontvangerproef slaagt. Stel de beperkte `ERP_INTAKE_SECRET` ook hier in;
   gebruik geen ERP-servicekey als brongeheim.
6. **Providerproef:** bewijs de echte ontvangst, dubbele levering, prijs-/statusbehoud,
   afgesloten proefrechten en foutafhandeling. Voer hiervoor geen nieuwe echte
   betaling, klantmail, portaaluitnodiging of agendareservering uit.
7. **Nieuwe wijzigingen activeren:** zet pas daarna `ERP_INTAKE_ENABLED=true` en
   controleer de eerste verwerkingsronde, wachtrijstatus en ERP-weergave. Leg de
   werkelijke datum en resultaten vast; pas dan mag de status hier naar actief.
8. **Historische import:** alleen na expliciet akkoord de paginering van
   `backfill_erp_intakes` gebruiken. De migratie importeert historische records niet
   vanzelf. Begin begrensd, controleer de mapping en herhaal zonder duplicaten.

Voor de actieve broncron zijn de beoordeelde migratie
`20261013010000_erp_intake_cron.sql` en de worker met ondertekeningscontrole gepubliceerd.
De bestaande koppelsleutel is via de gebonden, service-only
`set_erp_intake_scheduler_secret`-RPC opgeslagen, zonder sleutelwaarde in SQL of een
croncommando. De proef zette precies één al geleverde, bevestigde Parken-registratie
met dezelfde revisie opnieuw klaar. De echte cronronde, het eenmalige nonceverbruik,
ontvangstbewijs, de lege wachtrij en het ongewijzigde aantal opdrachten zijn gecontroleerd.
Deze native bewijsronde is afgerond; zie de vastgelegde ontvangst hierboven.

Bij een verkeerde mapping of uitval kan `ERP_INTAKE_ENABLED` weer uit. Nieuwe
bronwijzigingen blijven dan duurzaam klaarstaan; planning en betalingen blijven
bij de bestaande verwerking. Dossiers en bronhistorie worden niet verwijderd om
een koppeling te pauzeren.

## Geteste grenzen en resterende oplevering

De lokale proeven voeren echte PostgreSQL-functies uit voor projectie, bronwachtrij,
revisies, service-only toegang, prijsbehoud, nieuwe en oude VvE-aanvragen, identiteits-
en financiële controle, proefafscherming en afgesloten JWT's. De HTTP-proeven toetsen
HMAC, replay, verkeerde handtekeningen, bodygrenzen, redirects, ontvangstbevestiging,
herhaling en tijdelijk uitgevallen transport. De eigenaaractivatie en de eerdere
Auth-/Storage-proef zijn met echte providers gecontroleerd.

De broncron is getest met echte `pgcrypto`, doelgescheiden HMAC, eenmalig
nonceverbruik, verlopen opdrachten, behouden claims, lege wachtrijen, herhaalbare
installatie en het behouden van een bewust gepauzeerde job. De hosted netwerkuitvoering
en automatische cronronde zijn daarnaast met de echte providers bevestigd.

De live bron→ERP-providerproef en activering zijn afgerond. Facturen, creditnota's,
grootboek, bankafstemming, eigen capaciteitsplanning, echte
Voys-notificaties en de 3D-viewer zijn afzonderlijke volgende onderdelen. De innameketen
levert hun brongegevens; zij bevestigt die functies niet als opgeleverd.

## Bronnen in deze checkout

- [Bronmigratie](../supabase/migrations/20261012223000_erp_intake_outbox.sql)
- [Broncron](../supabase/migrations/20261013010000_erp_intake_cron.sql) en [eenmalige opdrachtcontrole](../supabase/functions/_shared/erp-dispatch-auth.mjs)
- [Bronworker](../supabase/functions/process-erp-intakes/index.ts) en [ondertekening/verwerking](../supabase/functions/_shared/erp-intake.mjs)
- [VvE-metadata](../supabase/functions/_shared/vve-intake.mjs)
- [ERP-ontvanger](../apps/erp/src/website-intake-handler.mjs) en [ERP-inname-SQL](../apps/erp/db/005_website_intake.sql)
- [Bestaande verwerkingsworkflow](../.github/workflows/process-consumer-bookings.yml)
- [Accountactivatie en proefafsluiting](../apps/erp/scripts/account-admin.mjs)
- [ERP-README](../apps/erp/README.md), [functioneel ontwerp](eigen-erp-klantportaal.md) en [consumentenboeking](consumer-booking.md)
