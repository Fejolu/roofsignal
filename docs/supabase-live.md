# Supabase productiebeheer

RoofSignal gebruikt één Supabase-project voor authenticatie, database, opslag en Edge Functions:

```text
kakpticlxlaxtebhsuoh
```

Voer productiewijzigingen nooit meer los uit in de SQL Editor of door afzonderlijke functies handmatig te publiceren. De gecontroleerde releaseprocedure voorkomt dat database en functies verschillende versies krijgen.

## Voorcontrole zonder wijzigingen

```sh
python3 tools/supabase_release.py
```

Deze controleert:

- de vaste projectkoppeling;
- geldige en uniek geordende migraties;
- of elke Edge Function in het release-manifest staat;
- dat geen herkenbare toegangssleutel in de broncode staat;
- toegang tot het juiste Supabase-project;
- alle lokale tests.

## Productie publiceren

Publiceer bij voorkeur via de handmatig te starten GitHub-workflow **Supabase productie-release**. Stel daarvoor in de afgeschermde GitHub-omgeving `production` deze secrets in:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`

Laat voor die omgeving een handmatige goedkeuring verplicht zijn. De workflow staat niet op automatisch publiceren en twee releases kunnen niet gelijktijdig lopen.

Lokaal kan dezelfde fail-safe route worden gebruikt met tijdelijke omgevingsvariabelen:

```sh
SUPABASE_ACCESS_TOKEN="..." SUPABASE_DB_PASSWORD="..." \
  python3 tools/supabase_release.py --deploy
```

De release stopt direct als een controle faalt. De volgorde is altijd:

1. broncode, migraties en tests controleren;
2. account en exact project-ID controleren;
3. alleen de namen van vereiste secrets controleren;
4. databasewijzigingen droog uitvoeren;
5. databasewijzigingen toepassen;
6. alle vastgelegde Edge Functions publiceren;
7. de geteste Auth- en projectconfiguratie toepassen;
8. iedere functie op bereikbaarheid testen.

Wachtwoorden en API-sleutels worden nooit in de repository of het manifest opgeslagen of weergegeven.

## Vereiste functies en secrets

`supabase/release-manifest.json` is de enige bron voor de productiefuncties en vereiste zelf ingestelde secrets. De door Supabase beheerde waarden `SUPABASE_URL`, `SUPABASE_ANON_KEY` en `SUPABASE_SERVICE_ROLE_KEY` worden automatisch aan Edge Functions aangeboden.

De frontend bevat uitsluitend de publieke anon key. De service-role key mag uitsluitend binnen Edge Functions worden gebruikt.

## Authenticatie

De gewenste configuratie staat in `supabase/config.toml`:

- minimaal twaalf tekens voor nieuwe wachtwoorden;
- hoofdletters, kleine letters en cijfers verplicht;
- recente herauthenticatie voor een wachtwoordwijziging;
- refresh-tokenrotatie ingeschakeld;
- geen anonieme login;
- uitsluitend expliciet toegestane redirect-URL's.

Wachtwoordloze inloglinks lopen via `send-portal-login-link`, zodat klant en medewerker een RoofSignal-mail ontvangen. De function geeft voor bekende en onbekende adressen dezelfde publieke reactie terug en lekt daarmee geen accountstatus.

## Operationele controles

- Activeer point-in-time recovery zodra het Supabase-abonnement dit ondersteunt.
- Controleer maandelijks Auth-, Database- en Edge Function-logs op terugkerende fouten.
- Roteer het databasewachtwoord en toegangstokens bij personeelswisselingen of een vermoed incident.
- Test ieder kwartaal klantlogin, medewerkerlogin, wachtwoordherstel, offerteakkoord en documentmail met aparte testaccounts.
- Beperk toegang tot de GitHub-omgeving `production` en het Supabase-dashboard tot eigenaar/beheerder; functionele HR-toegang geeft geen infrastructuurbeheer.

## E-mail en afzender

Transactionele mail gebruikt expliciet `EMAIL_PROVIDER=brevo` met de RoofSignal-afzendergegevens uit Supabase secrets. BIMI en Apple Branded Mail bepalen het inboxlogo; het HTML-logo in een bericht bepaalt dit niet.

- Logoasset: `https://www.roofsignal.nl/assets/roofsignal-bimi.svg`
- BIMI-hostnaam: `default._bimi.roofsignal.nl`
- DKIM en DMARC moeten aligned blijven voor alle transactionele mail.
