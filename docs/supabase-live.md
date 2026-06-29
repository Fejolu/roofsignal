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
- Portaal-login gebruikt Supabase Auth.
- Beheerdersportaal kan organisaties laden, aanpassen en soft-deleten.
- Rollen kunnen vanuit het portaal worden aangepast voor bestaande Supabase Auth-gebruikers.

Zolang de config leeg is, valt de site terug op de huidige demo/mailto-flow.
