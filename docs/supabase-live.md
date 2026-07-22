# Supabase live-koppeling

RoofSignal is voorbereid op Supabase voor formulieren, login, rollen, klanten en portaaldata.

## 1. Database aanmaken

Open Supabase SQL Editor en voer de migratie uit:

```text
supabase/migrations/20260629140500_initial_live_schema.sql
```

Deze migratie maakt onder meer:

- `lead_requests`
- `organizations`
- `profiles`
- `organization_members`
- `properties`
- `reports`
- `findings`
- `quotes`
- `invoices`
- `appointments`
- `audit_log`

RLS staat aan. Publieke bezoekers kunnen alleen lead- en prijsaanvragen aanmaken. Klant- en portaaldata is alleen zichtbaar voor ingelogde klanten of RoofSignal-medewerkers.

## 2. Frontend configureren

Vul in `assets/supabase-config.js` de projectgegevens in:

```js
window.ROOFSIGNAL_SUPABASE = window.ROOFSIGNAL_SUPABASE || {
  url: "https://PROJECTREF.supabase.co",
  anonKey: "SUPABASE_ANON_KEY",
  loginRedirectUrl: "https://www.roofsignal.nl/portal-login",
};
```

Gebruik alleen de anon key in de frontend. De service role key mag nooit in de repository of browsercode staan.

## 3. Auth instellingen

In Supabase:

- Zet Site URL op `https://www.roofsignal.nl`.
- Voeg `https://www.roofsignal.nl/portal-login` en `https://www.roofsignal.nl/portal-login.html` toe aan Redirect URLs.
- Maak accounts aan voor `admin@roofsignal.nl` en `ferry@roofsignal.nl`.
- Na aanmaak krijgen deze adressen via de database-trigger de rol `owner_admin`.
- Andere `@roofsignal.nl` adressen krijgen standaard `support`.

## 4. Wat werkt zodra de config is ingevuld

- Homepage voorbeeldrapport-aanvraag wordt opgeslagen in `lead_requests`.
- Tarieven prijsindicatie wordt opgeslagen in `lead_requests`.
- Portaal-login gebruikt Supabase Auth. Wachtwoord-login gaat direct via Supabase Auth; wachtwoordloze inloglinks lopen via de Edge Function `send-portal-login-link`, zodat de e-mail vanuit RoofSignal komt met RoofSignal-opmaak in plaats van de standaard Supabase Auth-template.
- Beheerdersportaal kan organisaties aanmaken, laden, aanpassen en soft-deleten.
- Rollen kunnen vanuit het portaal worden aangepast voor bestaande Supabase Auth-gebruikers.
- Offertes, facturen en afspraken moeten aan een organisatie gekoppeld zijn. Verwijderen van een organisatie verwijdert deze afhankelijke records mee, zodat er geen klantloze backoffice-data overblijft.

Zolang de config leeg is, valt de site terug op demo-opslag in de browser. Klanten aanmaken blijft dan binnen de backoffice, maar wordt nog niet naar Supabase geschreven.

## 5. E-mailnotificaties via Brevo

Deploy de Edge Function:

```sh
supabase functions deploy send-lead-notification
```

Zet daarna minimaal deze Supabase secrets:

```sh
supabase secrets set BREVO_API_KEY="..."
supabase secrets set BREVO_FROM_EMAIL="noreply@roofsignal.nl"
supabase secrets set BREVO_FROM_NAME="RoofSignal"
supabase secrets set NOTIFICATION_EMAIL="info@roofsignal.nl"
```

De frontend roept `send-lead-notification` aan na een succesvolle insert in `lead_requests`. De function gebruikt Brevo Transactional Email en verstuurt per aanvraag:

- een interne notificatie naar `NOTIFICATION_EMAIL`
- een bevestiging naar het e-mailadres van de aanvrager

Zonder `BREVO_API_KEY` valt de function lokaal terug naar dry-run logging.

## 6. Portal-inloglinks via RoofSignal

Deploy de Edge Function:

```sh
supabase functions deploy send-portal-login-link --project-ref kakpticlxlaxtebhsuoh
```

Deze function gebruikt `SUPABASE_SERVICE_ROLE_KEY` om een Supabase Auth magic link te genereren voor bestaande profielen en verstuurt die link daarna via Resend of Brevo. De function geeft altijd een generieke succesrespons terug voor onbekende e-mailadressen, zodat accountstatus niet publiek uitlekt.

Benodigde secrets:

- `EMAIL_PROVIDER=brevo` (expliciete transactionele verzendroute; voorkom impliciete providerwissels)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY` of `BREVO_API_KEY`
- `BREVO_FROM_EMAIL` of `FROM_EMAIL`
- `BREVO_FROM_NAME`

## 7. Afzenderlogo in Apple Mail en andere BIMI-clients

Het inboxlogo wordt niet door de HTML-template bepaald. Gebruik hiervoor Branded Mail in Apple Business Connect en BIMI.

- Publieke logoasset: `https://www.roofsignal.nl/assets/roofsignal-bimi.svg`
- BIMI-hostnaam: `default._bimi.roofsignal.nl`
- BIMI TXT-waarde zonder certificaat: `v=BIMI1; l=https://www.roofsignal.nl/assets/roofsignal-bimi.svg; a=`
- DMARC moet op `p=quarantine` of `p=reject` blijven staan en alle transactionele mail moet DKIM-aligned verzonden worden.
- Rond de bedrijfs- en merkverificatie af in Apple Business Connect en koppel `roofsignal.nl` aan Branded Mail. Apple kan aanvullende verificatie of een BIMI Evidence Document verlangen voordat het logo wordt getoond.
