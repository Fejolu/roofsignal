# Eigen RoofSignal-ERP en klantportaal

Functionele opzet · bijgewerkt 12 oktober 2026 · Eigenaar: Ferry Joosten

## 1. Vastgestelde richting en status

Ferry kiest een eigen RoofSignal-ERP met klant-, object-, opdracht-, inspectie- en
financiële administratie, inclusief facturatie en boekhouding. Het nieuwe systeem
wordt geen Odoo- of ERPNext-inrichting. Bestaande koppelingen en dossiers blijven
tijdens de voorbereiding operationeel; migratie vergt een afzonderlijk uitvoeringsplan.

Het klantportaal wordt vanaf het begin meegenomen. Expliciet gevraagd: inloggen,
objecten, rapportages, afspraken en periodieke planning, eigen beheer, facturen en
een fotogrammetrisch 3D-model met klikbare aandachtspunten.

Dit document legt de scope vast. De precieze rechten, schermen en werkstromen hieronder
zijn ontwerpvoorstellen. De werkende bouwfase staat in
[apps/erp](../apps/erp/README.md): klanten, objecten, opdrachten, inspectieronden,
bevindingen, rapportvrijgave en klantverzoeken. De proefomgeving gebruikt uitsluitend
fictieve dossiers. Deze bouwfase bevat echte medewerker- en klantlogin,
wachtwoordherstel, een duurzaam sessieregister, private rapportdownloads en toegangbeheer.
De goedgekeurde afzonderlijke Supabase-testomgeving is ingericht. De echte login-,
dossier-, herstel- en private bestandsproeven zijn geslaagd met drie fictieve accounts.
De afzonderlijke Cloudflare-testomgeving staat op
<https://roofsignal-erp-test.pages.dev>. Ook de online HTTPS- en browserproeven slagen:
medewerker- en klantlogin, afgeschermde dossiers, private PDF-downloads en sessie-intrekking.
Het eerste echte beheeraccount, **Ferry Joosten · ferry@roofsignal.nl**, is actief:
de eigenaar heeft zelf zijn wachtwoord ingesteld en de login bevestigd. Toegang
volgt uit een expliciete administratorrol, nooit uit een e-maildomein.

De gegevenskoppeling voor consumentenboekingen, De Parken en VvE-aanvragen is sinds
13 oktober actief. De drie fictieve accounts zijn afgesloten. De ERP-database is
`seyuhowazudrhgrbwtbk` en blijft gescheiden van de openbare website. De hostnaam
bevat voorlopig nog `test`. Bronwijzigingen komen via de duurzame wachtrij binnen;
een import verstuurt geen klantbericht en maakt geen nieuwe betaling.

Op 27 oktober wordt de commerciële werkruimte toegevoegd: offertes en
factuurconcepten, btw-berekening op de server, expliciete offertevrijgave en
intrekking en afzonderlijke financiële portaalrechten. Factuurconcepten zijn
nog geen uitgegeven facturen; uitgifte, creditnota's, betaalreconciliatie en de
boekhouding behoren tot de nog af te ronden financiële keten.

Herstel per e-mail blijft uit totdat SMTP en bezorging zijn getest. De echte
Voys-verbinding, volledige capaciteitsplanning en de afgeschermde 3D-viewer zijn
nog niet opgeleverd. De actuele technische status en acceptatieproeven staan in
[apps/erp/README.md](../apps/erp/README.md). De volledige scope hieronder blijft
de opleverlijst; aanwezige tabbladen betekenen niet dat alle onderdelen af zijn.

## 2. Eén dossier, twee omgevingen

De backoffice en het klantportaal gebruiken dezelfde geautoriseerde brongegevens.
Medewerkers werken aan voorbereiding, uitvoering en controle. Klanten zien de voor
hen vrijgegeven documenten en acties. Publiceren is een expliciete stap per rapport,
bevindingenset en modelversie; interne notities en concepten blijven intern.

Het portaal krijgt RoofSignal-vormgeving en een ingang vanaf roofsignal.nl.
Pages CMS blijft voor openbare website-inhoud. Klantbestanden en 3D-modellen horen
in afgeschermde opslag buiten de openbare CMS-mediabibliotheek.

De openbare website heeft een eigen database en blijft voorlopig de bron voor
online boekingen, Google-agenda-afspraken en Mollie-betalingen. De voorbereide
koppeling bewaart een kopie daarvan in de eigen backoffice, inclusief de bestaande
prijsafspraak en herkomst. Een import maakt geen nieuwe betaling, bevestigingsmail
of klantlogin aan. Zie [Website → eigen ERP](erp-website-intakes.md) voor de
gegevensafspraken en gecontroleerde activering.

## 3. Voorgestelde klantnavigatie

| Onderdeel | Klant ziet en doet |
|---|---|
| Mijn overzicht | Volgende afspraak, nieuwe rapporten, open acties en relevante factuurstatussen. |
| Mijn objecten | Gebouwen/portefeuille bekijken; een object openen; een nieuw object aanmelden. |
| Objectdossier | Gebouwgegevens, bouwdelen, inspectietijdlijn, bevindingen, beelden en documenten. |
| Rapportages | Vrijgegeven rapporten per object en inspectiedatum bekijken en downloaden. |
| Afspraken | Bevestigde afspraken, geplande vervolgronden en wijzigingsverzoeken. |
| 3D-inspectie | Model draaien/zoomen, aandachtspunt aanklikken, bronfoto en advies openen; inspectiedatum kiezen. |
| Facturen | Eigen facturen en creditnota's, bedragen, vervaldata en geverifieerde betaalstatus. |
| Mijn gegevens | Contactgegevens, voorkeuren en objectinformatie bijhouden binnen afgesproken rechten. |

Op mobiel moet een klant dezelfde bevinding ook via een lijst en foto kunnen openen.
Een zwaar of ontbrekend 3D-model mag toegang tot het rapport en de bevindingen niet blokkeren.

## 4. Organisaties, objecten en rechten

- Een persoon kan toegang hebben tot meerdere organisaties, bijvoorbeeld als VvE-beheerder.
- Een organisatie kan meerdere objecten hebben. Een object kan meerdere adressen bevatten.
- Leg opdrachtgever, eigenaar, beheerder, contactpersoon en factuurontvanger afzonderlijk vast.
- Toegang wordt toegewezen aan een persoon voor een organisatie of expliciete objectselectie,
  met een rol, toegestane handelingen en zo nodig een einddatum.
- Een contactrecord, e-maildomein, KVK-nummer of ingevoerd adres verleent geen dossierinzage.
- Een beheerderwissel maakt geen nieuw gebouw of nieuwe inspectiehistorie. Rechten worden
  ingetrokken of toegekend; financiële stukken en correspondentie gaan niet automatisch mee.
- Portaalgebruikers zien alleen de aan hen vrijgegeven informatie. Uitvoerders kunnen later
  beperkte toegang krijgen tot geselecteerde acties zonder alle klant- of financiële gegevens.

Voorstel eerste rollen: dossierlezer, klantcontact met beheerrechten, en financiële
contactpersoon. De laatste kan facturen zien zonder automatisch technische dossiers te openen.
RoofSignal kent aanvankelijk toegang toe. In de huidige bouwfase kan alleen een
administrator bestaande, bevestigde accounts machtigen of hun machtiging intrekken.
Een nieuwe websiteklant krijgt daarom niet automatisch portaaltoegang.
Zelf andere personen uitnodigen volgt pas met
expliciete grenzen aan wat de uitnodiger mag delen.

Alle gegevensverzoeken en bestanden krijgen een controle op de server, ook toekomstige
3D-modelbestanden, texturen en foto’s. Alleen knoppen verbergen is onvoldoende.
De huidige PDF-route controleert bij iedere download opnieuw de dossierrechten en
vrijgave; zij geeft geen losstaande downloadlink uit. Nieuwe toegang wordt na
intrekken van rechten geweigerd. Reeds gedownloade
bestanden kunnen niet achteraf worden teruggenomen. Dit volgt de uitgangspunten van
[OWASP voor autorisatie](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

## 5. Eigen beheer door de klant

Direct bewerkbaar: eigen contactgegevens, berichtvoorkeuren, operationele toegangsinformatie
en aanvullingen zoals tekeningen of foto's. Bewaar wie wat wanneer heeft gewijzigd.

Als verzoek verwerken: nieuw object, correctie van objectidentiteit/adreslijst,
wijziging van opdrachtgever, afspraak verplaatsen of inspectie-uitbreiding toevoegen.
RoofSignal controleert de gevolgen voor scope, planning, prijs en toegang voordat deze ingaan.

De klant kan op een bevinding reageren en herstel melden met bewijs. Houd daarbij
"herstel gemeld door klant" en "herstel beoordeeld door RoofSignal" apart. Bestaande
inspectieoordelen, uitgegeven rapporten, factuurbedragen en betaalstatussen worden niet
door klantbewerkingen overschreven.

## 6. Periodieke inspecties en afspraken

Maak onderscheid tussen:

1. Overeenkomst: object(en), diensten, frequentie en afgesproken voorwaarden.
2. Inspectieronde: gewenste periode, te leveren resultaat en verantwoordelijke.
3. Bezoek: een concreet tijdvak, uitvoerder, benodigd materieel en afspraakstatus.

Een halfjaarlijkse inspectieronde is eerst "nog te plannen". Toon haar pas als bevestigde
afspraak nadat beschikbaarheid, benodigde tijd, reizen en middelen zijn gecontroleerd.
Een wijzigingsverzoek blokkeert niet zelfstandig een tweede tijdvak.

Eén opdracht kan meerdere bezoeken bevatten, bijvoorbeeld een apart thermisch bezoek.
Verplaatsen verplaatst de bestaande afspraak met behoud van historie. Websiteboeking,
interne planning en klantportaal moeten dezelfde capaciteitscontrole gebruiken. De bestaande
Google-agenda is een koppeling voor beschikbaarheid en afspraken, geen tweede onafhankelijke
boekingsadministratie.

De particuliere boekingsduur van maximaal 45 minuten is niet de standaardduur voor VvE’s.
Bewaar de overeengekomen rapportdeadline bij de opdracht; voor de bestaande consumentenroute
is dit twee werkdagen na inspectie. Bewaar ook prijsversie en reisafspraak bij akkoord.

## 7. Fotogrammetrie en klikbare aandachtspunten

### Klantbediening

De klant opent een gebouw, kiest een inspectiedatum en ziet het bijbehorende 3D-model.
Klikken op een markering opent een paneel met:

- Bevindingnummer en bouwdeel.
- Inspectiedatum, waarneming en originele bewijsfoto.
- Risico, geadviseerde actie en opvolgtermijn.
- Huidige beoordeling en eerdere waarnemingen van dezelfde bevinding.
- Eventuele thermische bewijsbeelden, indien opgenomen en vrijgegeven.

Gebruik naast kleur ook labels en symbolen. Filteren kan op bouwdeel, onderwerp,
urgentie en status. Een lijstweergave is altijd beschikbaar naast het model.

### Structuur voor betrouwbare vergelijking

- Object-ID: blijft bestaan over opdrachten en beheerderwisselingen heen.
- Bouwdeel-ID: bijvoorbeeld dakvlak noord of schoorsteen 1.
- Bevinding-ID: het te volgen aandachtspunt binnen dat object.
- Waarneming-ID: de beoordeling van die bevinding op een specifieke inspectiedatum,
  inclusief bewijs, beoordelaar en status.
- Modelversie: object, inspectie, opnamedatum, verwerking, dekking en kwaliteit.
- Markering: koppelt een waarneming aan een positie en eventueel kijkstand in één modelversie.

Bevindingen zijn afzonderlijke dossiergegevens; de 3D-markeringen verwijzen ernaar.
Een nieuw model overschrijft een oud model niet. Een bevinding kan in een vervolgmodel
opnieuw worden aangewezen zonder de vorige positie of beoordeling te veranderen.

Los verwerkte modellen kunnen verschillen in positie, schaal en oriëntatie. Markeringen
worden daarom niet blind op dezelfde XYZ-coördinaten gekopieerd. Leg een eventuele
uitlijning vast en controleer die voordat markeringen worden overgenomen. Begin met
datumselectie en naast-elkaar-weergave; geometrische verschilmetingen volgen pas na
een gecontroleerde methode en kwaliteitsproef.

Geen zichtbare markering in een latere opname betekent niet automatisch dat iets hersteld is.
Niet-zichtbare of niet-beoordeelde delen blijven als zodanig herkenbaar. Een thermische
foto bij een locatie is aanvankelijk een afzonderlijk bewijsbeeld, geen automatisch
geometrisch of radiometrisch correcte laag op het model.

Verwerking van fotogrammetrie en weergave in het portaal zijn aparte onderdelen. De
keuze van verwerkingssoftware, viewer en opslagleverancier staat nog open. Bewaar
bruikbare exports en bronverwijzingen om afhankelijkheid van één viewer te beperken.

## 8. Financieel overzicht en oplevering

Het portaal leest facturen, creditnota's en betaalstatus uit de eigen financiële
administratie. Een betaalprovider levert gecontroleerde betaalgebeurtenissen aan.
Een terugkeer naar de website of een klantmelding geldt niet als betalingsbewijs.

Leg afzonderlijk vast welke rapporten, modellen, actualisaties en eventuele hosting
zijn overeengekomen. Toegang kan daarop worden afgestemd, zonder al prijzen of
abonnementen voor 3D vast te stellen. Een technisch dossierrecht geeft niet automatisch
toegang tot alle facturen van dezelfde beheerportefeuille.

In de voorbereide websitekoppeling ziet de medewerker de oorspronkelijke bedragen,
prijsversie, Mollie-referentie en bronstatus. Dit is de registratie van een afspraak
en betaalstatus, geen eigen factuur of boekhoudkundige verwerking. De bronbedragen
blijven behouden bij een latere tariefwijziging. Een VvE-staffelindicatie blijft
vrijblijvend en wordt niet als overeengekomen prijs of betaling behandeld.

## 9. Telefonie — huidige provider Dubline

Actualisatie 27 oktober 2026 door Ferry: **Dubline** is de huidige telco;
**Antagonist** verzorgt e-mail. Er wordt geen Voys-abonnement of overstap gestart.
De onderstaande functionele eisen voor nummerherkenning blijven gelden, maar de
historisch voorgestelde Voys-transportkoppeling is geen besluit voor de huidige
provider. Een ondersteunde Dubline-gebeurtenis/API en afzendercontrole moeten eerst
worden bevestigd; openbare documentatie bevestigt nog geen werkende CRM-webhook.
Antagonist-SMTP voor uitnodigingen en herstel wordt pas aangezet na veilige
serverconfiguratie en een bezorgproef. Geen wachtwoorden of API-sleutels in dit document.

### Historisch ontwerp: Voys


Vastgesteld door Ferry op 11 oktober 2026: de eigen backoffice moet bij een
inkomende oproep de beller herkennen aan het telefoonnummer. Eén bestaande match
opent de klantkaart met contactgegevens, objecten en opdrachten. Een onbekend
nummer opent een nieuwe klantkaart met het nummer ingevuld. Er wordt pas een klant
opgeslagen nadat een medewerker de gegevens heeft aangevuld en bevestigd.

Bij een gedeeld nummer worden alle passende klanten getoond om de juiste relatie
te kiezen. Een afgeschermd nummer geeft een algemene oproepmelding; het wordt niet
als telefoonnummer of nieuwe klant opgeslagen. Een tijdelijke fout in het zoeken
wordt als fout getoond en niet als een onbekende beller behandeld. Nationale en
internationale schrijfwijzen van hetzelfde nummer worden op de server gelijkgetrokken.

Nummerherkenning is alleen beschikbaar voor ingelogde medewerkers. Zij verleent
geen identiteit, portaaltoegang of wijzigingsrechten aan de beller. Bij meerdere
medewerkers moet de melding worden gekoppeld aan de medewerker die de oproep
ontvangt. Een nieuw gesprek mag een onopgeslagen formulier niet zonder afstemming
overschrijven. Dubbele en vertraagde oproepmeldingen mogen geen dubbele klantkaarten
of contactmomenten aanmaken.

Voys ondersteunt hiervoor
[gespreksnotificaties](https://help.voys.nl/gespreksnotificaties): een server ontvangt
onder meer het gespreksnummer, beller, bestemming en gebeurtenissen zoals overgaan,
opnemen en beëindigen. In de lokale ERP-proefomgeving wordt de klantkaart en de
herkenningsroute voorbereid. De huidige proeflogin en lokale server zijn geen
online Voys-koppeling. De daadwerkelijke verbinding volgt in de besloten online
omgeving, met gecontroleerde toegang voor Voys en geautoriseerde meldingen aan
medewerkers. De afzendercontrole en Voys-inrichting moeten vóór activering worden
bevestigd en getest; telefoon- of klantgegevens worden niet via een openbare zoek-URL
beschikbaar gemaakt.

Een gespreksregistratie in het dossier (richting, begin/einde, behandelaar en
notities), een terugbelactie en bellen vanuit de klantkaart kunnen hierop volgen.
Gespreksopnames, transcripties en AI-samenvattingen zijn geen onderdeel van deze
eerste herkenningsfunctie.

### Acceptatieproeven voor nummerherkenning

- Een bekende beller opent precies de juiste klantkaart met diens objecten en opdrachten.
- Een onbekend nummer opent een ingevuld nieuw-klantformulier, zonder automatisch record.
- Meerdere matches worden getoond; er wordt niet willekeurig een klant gekozen.
- `06…`, `00316…` en `+316…` vinden hetzelfde opgeslagen nummer.
- Afgeschermde nummers, fouten en vertraagde zoekantwoorden openen geen verkeerde kaart.
- Klanten, financiële contacten en ingetrokken medewerkers kunnen geen nummers opzoeken.
- De oproeproute blijft beschikbaar na inloggen en overschrijft geen actief invoerformulier.
- De echte Voys-proef volgt pas met een beveiligde online backoffice en expliciete inrichting.

## 10. Bouwvolgorde

1. **Fundament:** eigen ERP-gegevensmodel, objectidentiteit, organisaties, rechten,
   publicatiestatussen, inspectiehistorie en koppelingen. Ontwerp de portaaltoegang meteen mee.
2. **Eerste klantportaal:** inloggen, objectoverzicht, vrijgegeven PDF-rapporten,
   afspraken, facturen en beperkte gegevenswijzigingen.
3. **Samenwerking en herhaling:** inspectieovereenkomsten, volgende rondes,
   wijzigingsverzoeken en herstelmeldingen met beoordeling.
4. **3D-proef en uitbreiding:** één echt object met twee opnamen, klikbare bevindingen,
   datumselectie, mobiele alternatieven en daarna gecontroleerde vergelijking.

Oplevercriteria voor de volledige gekozen fase zijn functionele proeven; een
schets of aanwezige knop geldt niet als een werkende koppeling.

## 11. Acceptatieproeven vóór ingebruikname

- Klant A kan geen object, PDF, factuur, foto of 3D-bestand van klant B ophalen,
  ook niet via een directe URL of aangepast verzoek.
- Een beheerder ziet precies de toegewezen VvE’s/objecten en alleen de toegestane financiële stukken.
- Een concept of ingetrokken publicatie wordt niet via portaal, zoekfunctie of bestandenlijst blootgegeven.
- Een klantwijziging van contactgegevens wijzigt geen historische offerte of uitgegeven factuur.
- Een gemeld herstel blijft zichtbaar als klantmelding totdat RoofSignal het heeft beoordeeld.
- Een periodieke ronde verschijnt als nog te plannen totdat een concreet bezoek is bevestigd.
- Een verplaatsing of herhaald boekingsverzoek maakt geen dubbele opdracht, afspraak of betaling.
- Een uitval van een koppeling toont een herstelbare actiemelding; geen misleidend leeg dossier.
- Dezelfde bevinding is op twee inspectiedata terug te vinden met de juiste eigen foto's en modelposities.
- Op telefoon en bij een falend model blijven bevindingen en rapporten toegankelijk.
- Een ingetrokken medewerker- of klanttoegang wordt bij nieuwe verzoeken direct geweigerd.

## Bronnen en beslisbasis

- Ferry, 11 oktober 2026: eigen ERP bevestigd; klantportaal en klikbaar 3D-dossier toegevoegd.
- Ferry, 11 oktober 2026: Voys-nummerherkenning en een nieuwe klantkaart voor onbekende bellers toegevoegd.
- [Medewerkershandboek](../../outputs/roofsignal-medewerkershandboek.md): vastgestelde producten,
  staffels, reisafspraken en versiebeheer.
- [Consumentenboeking](consumer-booking.md): bestaande boekingsroutes en geaccepteerde afspraken.
- [3D-dienstenvoorstel](../../outputs/roofsignal-bouwvoortgang-en-3d-vastgoedregistratie.md):
  gedateerde modellen, bevindingen en kwaliteitsproef.
- [Eerdere architectuurvisie](platform-architecture-v2.md): achtergrond; oude bedragen en
  toekomstige verdienmodellen zijn geen nieuw besluit.
