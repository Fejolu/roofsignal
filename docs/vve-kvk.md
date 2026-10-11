# Optionele KVK-check bij VvE-aanmeldingen

De bezoeker mag altijd zonder KVK-nummer een object aanmelden. Het KVK-nummer is geen basis voor de prijsstaffel, objectadres of het aantal adressen. Een opgegeven nummer wordt in de bestaande leadmelding opgenomen als **opgegeven**, niet als bewezen bevoegdheid van de aanmelder.

## Activering

De publieke invoer werkt zonder abonnement; de knop **Vul naam in** verschijnt uitsluitend wanneer de serverkoppeling is ingeschakeld. Op 11 oktober 2026 is nog geen KVK-abonnement aanwezig en blijft automatisch ophalen daarom uitgeschakeld.

Voor productie zijn, na toestemming voor de abonnementskosten, twee Supabase-secrets nodig:

- `KVK_API_KEY`: de echte KVK Basisprofiel-toegangssleutel, uitsluitend op de server.
- `VVE_KVK_ENABLED`: `true`, pas na aansluiting en controle van echte KVK-toegang.

Deze secrets zijn optioneel voor de algemene release: een ontbrekende KVK-koppeling mag boekingen en andere formulieren niet blokkeren. Zet `VVE_KVK_ENABLED` op `false` om alleen de automatische controle uit te zetten.

Publiceer via de normale Supabase-releaseworkflow. De nieuwe functie is `vve-kvk`; de migratie voegt een alleen voor service_role uitvoerbare, atomair begrensde teller toe. De bestaande publieke anon key mag de Edge Function aanroepen; de providerkey blijft geheim.

## Gedrag en begrenzing

- Alleen de exacte actieve inschrijving met rechtsvorm Vereniging van Eigenaars vult de naam in.
- Een onbekend nummer, beheerdersnummer, fout antwoord of storing leidt naar handmatige naaminvoer.
- Een vertraagd antwoord overschrijft geen inmiddels aangepaste naam of nummer.
- De volledige registratie, adressen, RSIN en vestigingsaantallen worden niet teruggestuurd of opgeslagen.
- Verificatie controleert Turnstile, hostname en formulieractie. De token wordt na de check vernieuwd vóór de aanmelding.
- Maximaal 10 pogingen per IP-hash per uur en 100 per voortschrijdende 24 uur, over alle serverinstanties gezamenlijk. Een databasefout stopt de betaalde opvraag. Dit staat los van de limiet op daadwerkelijke aanmeldingen.
- Er wordt per klik maximaal één betaalde Basisprofiel-opvraag gedaan; geen automatische herhaalpogingen of aanvragen tijdens typen.
- Nooit de KVK-testomgeving of testkey instellen als productiebron. De productie-URL is vastgelegd in de serverfunctie.

## Controle

`node --test tests/vve-kvk.test.mjs tests/vve-inquiry.test.mjs` controleert het formulier, foutafhandeling, geen overschrijven na wijzigingen, serverbeveiliging en doorgifte van een optioneel nummer. Het fictieve KVK-testnummer `90000749` heeft rechtsvorm Vereniging van Eigenaars en naam Global Conron; het antwoordformaat is op 11 oktober 2026 gecontroleerd tegen de officiële gratis testomgeving. De lokale browserproef gebruikt uitsluitend gesimuleerde aanvragen en verstuurt geen echte e-mail.

Na activering: controleer een echte, bekende VvE, handmatige invoer zonder nummer en een onbekend nummer. Controleer dat de naam wordt ingevuld en de overige objectvelden leeg blijven; verstuur hiervoor geen ongevraagde proefaanmelding.

Bronnen: [Basisprofiel](https://developers.kvk.nl/documentation/basisprofiel-api), [testomgeving](https://developers.kvk.nl/documentation/testing), [tarieven](https://developers.kvk.nl/nl/pricing). Op 11 oktober 2026: €6,40 per maand en €0,02 per Basisprofiel-opvraag, vrijgesteld van btw.
