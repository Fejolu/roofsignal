# De Parken: inbox en Odoo

Nieuwe websiteboekingen krijgen naast de bestaande klantbevestiging één interne e-mail aan:

- ferry@roofsignal.nl
- de-parken-aanmeldingen@roofsignal.odoo.com

De Odoo-alias maakt een inspectietaak in **Project > De Parken – aanmeldingen**, project 1,
fase **Nieuwe aanmelding**. Het project is alleen zichtbaar voor interne gebruikers.
De registratie bevat de referentie, klantcontactgegevens, het object, het gekozen moment,
de thermografieoptie, de door de server vastgelegde prijs en de bijzonderheden.
Het antwoordadres van de interne mail is de klant. De bestaande klantbevestiging blijft
naar de klant gaan, met info@roofsignal.nl als antwoordadres.

## Afbakening

- Dit maakt een inspectietaak, geen verkooporder, factuur of agenda-afspraak in Odoo.
- Klantcontactgegevens staan in de taakomschrijving; er wordt geen afzonderlijk Odoo-klantrecord geïmporteerd.
- Bestaande boekingen worden niet met terugwerkende kracht gemaild.
- De bestaande backoffice en slotbeveiliging blijven voor deze websiteplanner actief.
- Latere wijzigingen of annuleringen worden niet automatisch naar Odoo gesynchroniseerd.

## Verzending en herstel

Een databasetrigger zet elke nieuwe boeking in `parken_delivery_outbox` binnen dezelfde
transactie. Na afronding van de boeking start `submit-parken-booking` klantbevestiging
en interne verzending onafhankelijk van elkaar. De definitieve prijs inclusief opties
wordt pas na afronding van de boeking vastgelegd in de verzendopdracht.

De worker `process-parken-integrations` accepteert uitsluitend de service-role bearer
of de afgeschermde `PARKEN_AUTOMATION_SECRET`. GitHub heeft diezelfde schedulersecret
in de omgeving `production`. Er staan geen sleutels in de frontend of repository.

De workflow **Pilotaanmeldingen naar inbox en Odoo** controleert de wachtrij elke vijf
minuten; GitHub kan geplande runs vertragen. Een vergrendeling voorkomt gelijktijdige
verwerking, en de mailinhoud en UUID-idempotentiesleutel blijven bij retries gelijk.
`accepted` betekent dat Brevo de verzending heeft aangenomen; dit is geen bewijs dat
Odoo de taak heeft aangemaakt of dat de mail in de inbox is afgeleverd.

Bij een onduidelijke verzenduitkomst wordt maximaal twaalf minuten opnieuw geprobeerd,
ruim binnen Brevo's gedocumenteerde idempotentietermijn. Daarna wordt de status `review`:
controleer dan eerst Brevo-verzendlogs en de boekingsreferentie in Odoo/inbox voordat
een nieuwe verzending wordt gestart. De workflow meldt fouten via een mislukte run.
Reset een geaccepteerde of onduidelijke verzending nooit blind: dat kan duplicaten geven.

## Controle

- Gebruik workflow-dispatch met `dry_run=true` voor aantallen per verzendstatus.
- Voor één gemarkeerde interne test: `dry_run=false`, `test_only=true`, `prepare_test=true`.
- Die test gebruikt `RS-PARKEN-TEST-20260920`, maakt geen websiteboeking en reserveert geen slot.
- Herhalen van dezelfde test levert geen tweede verzendopdracht op.
- De testmail gaat uitsluitend naar Ferry en het hierboven genoemde Odoo-project.
- Controleer de daadwerkelijke ontvangst in beide bestemmingen. Archiveer daarna de testtaak.

Bronnen: [Odoo e-mailaliassen](https://www.odoo.com/documentation/19.0/applications/general/email_communication/email_servers_inbound.html),
[Brevo idempotentie](https://developers.brevo.com/docs/heterogenous-versions-batch-emails).
